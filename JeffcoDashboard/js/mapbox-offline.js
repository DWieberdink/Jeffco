/**
 * Offline Mapbox support for JeffcoDashboardDesktop (local Kestrel + disk tile cache).
 * - Rewrites Mapbox HTTP requests through /mapbox-cache-proxy (cached on disk).
 * - Optional: warm Jefferson County tiles for the Light style.
 */
(function (global) {
  const JEFFCO_BOUNDS = [
    [-105.45, 39.45],
    [-102.65, 40.05],
  ];
  const OFFLINE_WARM_ZOOMS = [9, 10, 11, 12, 13];
  const LIGHT_STYLE = "mapbox://styles/mapbox/light-v11";

  function shouldUseMapboxProxy() {
    try {
      if (global.__JEFFCO_DESKTOP__) return true;
      const o = global.location && global.location.origin;
      return o && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(o);
    } catch (_) {
      return false;
    }
  }

  function proxyUrl(url) {
    const origin = global.location.origin;
    return origin + "/mapbox-cache-proxy?url=" + encodeURIComponent(url);
  }

  function installMapboxTransformRequest() {
    if (!global.mapboxgl || global.__jeffcoMapboxProxyInstalled) return;
    if (!shouldUseMapboxProxy()) return;
    global.__jeffcoMapboxProxyInstalled = true;
    const previous = global.mapboxgl.transformRequest;
    global.mapboxgl.transformRequest = function (url, resourceType) {
      if (typeof url === "string" && /^https?:\/\/([^/]+\.)?mapbox\.com/i.test(url)) {
        return { url: proxyUrl(url) };
      }
      if (typeof previous === "function") return previous(url, resourceType);
      return { url: url };
    };
  }

  function formatCacheStatus(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  async function getCacheSizeEstimate() {
    try {
      const res = await fetch("/mapbox-cache-status", { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      return data;
    } catch (_) {
      return null;
    }
  }

  async function warmJeffcoMapTiles(options) {
    const opts = options || {};
    const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : function () {};
    if (!global.mapboxgl) throw new Error("Mapbox GL is not loaded.");

    installMapboxTransformRequest();

    const host = document.createElement("div");
    host.id = "jeffco-offline-warm-host";
    host.style.cssText =
      "position:fixed;left:-9999px;top:-9999px;width:512px;height:512px;opacity:0;pointer-events:none;";
    document.body.appendChild(host);

    const warmMap = new global.mapboxgl.Map({
      container: host,
      style: LIGHT_STYLE,
      interactive: false,
      attributionControl: false,
      preserveDrawingBuffer: false,
    });

    try {
      await new Promise(function (resolve, reject) {
        warmMap.once("load", resolve);
        warmMap.once("error", function (e) {
          reject(e && e.error ? e.error : new Error("Map warm-up failed"));
        });
      });

      const total = OFFLINE_WARM_ZOOMS.length;
      for (let i = 0; i < OFFLINE_WARM_ZOOMS.length; i++) {
        const z = OFFLINE_WARM_ZOOMS[i];
        onProgress("Downloading map tiles (zoom " + z + ")…", (i + 0.2) / total);
        warmMap.fitBounds(JEFFCO_BOUNDS, { padding: 40, animate: false, duration: 0 });
        warmMap.setZoom(z);
        await new Promise(function (resolve) {
          warmMap.once("idle", resolve);
          setTimeout(resolve, 8000);
        });
        onProgress("Downloading map tiles (zoom " + z + ")…", (i + 1) / total);
      }

      onProgress("Finishing…", 1);
    } finally {
      try {
        warmMap.remove();
      } catch (_) {}
      try {
        host.remove();
      } catch (_) {}
    }

    try {
      localStorage.setItem("jeffco.mapOfflinePrepared_v1", new Date().toISOString());
      localStorage.setItem("mapStyleChoice", LIGHT_STYLE);
    } catch (_) {}

    return getCacheSizeEstimate();
  }

  function isLikelyOffline() {
    try {
      return global.navigator && global.navigator.onLine === false;
    } catch (_) {
      return false;
    }
  }

  function preferOfflineSafeStyle() {
    if (!isLikelyOffline()) return;
    try {
      const saved = localStorage.getItem("mapStyleChoice");
      if (saved === LIGHT_STYLE) return;
      localStorage.setItem("mapStyleChoice", LIGHT_STYLE);
    } catch (_) {}
  }

  global.jeffcoMapboxOffline = {
    installMapboxTransformRequest: installMapboxTransformRequest,
    warmJeffcoMapTiles: warmJeffcoMapTiles,
    getCacheSizeEstimate: getCacheSizeEstimate,
    formatCacheStatus: formatCacheStatus,
    preferOfflineSafeStyle: preferOfflineSafeStyle,
    LIGHT_STYLE: LIGHT_STYLE,
    JEFFCO_BOUNDS: JEFFCO_BOUNDS,
  };

  installMapboxTransformRequest();
  preferOfflineSafeStyle();

  global.addEventListener("online", function () {
    try {
      const el = document.getElementById("mapOfflineStatus");
      if (el) el.textContent = "";
    } catch (_) {}
  });
  global.addEventListener("offline", function () {
    try {
      const el = document.getElementById("mapOfflineStatus");
      if (el) {
        el.textContent =
          "Offline — using saved map tiles. Light style recommended; run “Save map for offline” while online if the basemap is blank.";
      }
    } catch (_) {}
  });

  function refreshOfflineStatusLine() {
    const el = document.getElementById("mapOfflineStatus");
    if (!el || !global.jeffcoMapboxOffline) return;
    getCacheSizeEstimate().then(function (info) {
      if (!info) return;
      const mb = formatCacheStatus(info.bytes);
      const when = (function () {
        try {
          return localStorage.getItem("jeffco.mapOfflinePrepared_v1");
        } catch (_) {
          return "";
        }
      })();
      el.textContent = info.bytes > 0
        ? "Cached map data: " + mb + (when ? " (last saved " + new Date(when).toLocaleDateString() + ")" : "")
        : "No offline map saved yet.";
    });
  }

  function setupOfflinePrepareButton() {
    const btn = document.getElementById("mapOfflinePrepareBtn");
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", async function () {
      const status = document.getElementById("mapOfflineStatus");
      if (!global.jeffcoMapboxOffline || !global.mapboxgl) {
        if (status) {
          status.textContent = "Offline map module did not load. Close and reopen the dashboard, or hard-refresh (Ctrl+F5).";
        }
        return;
      }
      btn.disabled = true;
      try {
        if (status) status.textContent = "Preparing offline map… this may take a few minutes.";
        await warmJeffcoMapTiles({
          onProgress: function (msg) {
            if (status) status.textContent = msg;
          },
        });
        const light = document.getElementById("mapStyleLight");
        if (light) {
          light.checked = true;
          light.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (typeof global.applyMapStyle === "function") {
          global.applyMapStyle(LIGHT_STYLE);
        } else if (global.map && typeof global.map.setStyle === "function") {
          global.map.setStyle(LIGHT_STYLE);
        }
        refreshOfflineStatusLine();
        if (status) status.textContent = "Offline map saved. Switch to Light style when working without internet.";
      } catch (err) {
        if (status) status.textContent = "Could not save offline map: " + (err && err.message ? err.message : err);
      } finally {
        btn.disabled = false;
      }
    });
    refreshOfflineStatusLine();
  }

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", setupOfflinePrepareButton);
    } else {
      setupOfflinePrepareButton();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
