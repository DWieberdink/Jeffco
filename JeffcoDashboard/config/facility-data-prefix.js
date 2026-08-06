/**
 * URL prefix for Facility Data CSV/GeoJSON.
 *
 * This script always lives at <appRoot>/config/facility-data-prefix.js, so its own
 * URL is the most reliable way to locate <appRoot>/Facility Data/ regardless of how
 * the app is served: desktop host, file://, a nested page such as /pages/, or a
 * GitHub Pages project site published from either the repo root or a subfolder.
 */
(function (global) {
  function prefixFromOwnScriptUrl() {
    const doc = global.document;
    if (!doc) return "";
    let src = doc.currentScript && doc.currentScript.src;
    if (!src) {
      // currentScript is null for deferred/async execution; fall back to a tag scan.
      const tags = doc.getElementsByTagName("script");
      for (let i = tags.length - 1; i >= 0; i -= 1) {
        const candidate = tags[i].src || "";
        if (/facility-data-prefix\.js(\?|$)/i.test(candidate)) {
          src = candidate;
          break;
        }
      }
    }
    if (!src) return "";
    const withoutQuery = String(src).split(/[?#]/)[0];
    const match = withoutQuery.match(/^(.*)\/config\/facility-data-prefix\.js$/i);
    if (!match) return "";
    return match[1] + "/Facility Data/";
  }

  function detectPrefix() {
    try {
      if (global.__JEFFCO_DESKTOP__) return "/Facility Data/";
      const fromScript = prefixFromOwnScriptUrl();
      if (fromScript) return fromScript;
      const loc = global.location;
      if (loc && /^https?:$/i.test(loc.protocol)) return "/Facility Data/";
      const p = String((loc && loc.pathname) || "").replace(/\\/g, "/").toLowerCase();
      if (p.includes("/closurescenariomodule/")) return "../../../Facility Data/";
      if (p.includes("/pages/")) return "../../../Facility Data/";
    } catch (_) { /* ignore */ }
    return "../../Facility Data/";
  }

  const prefix = detectPrefix();
  global.JEFFCO_DATA_PREFIX = prefix;
  global.jeffcoDataUrl = function (leaf) {
    const name = String(leaf || "").replace(/^\//, "");
    return prefix + name;
  };
})(typeof window !== "undefined" ? window : globalThis);
