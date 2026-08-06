/**
 * URL prefix for Facility Data CSV/GeoJSON.
 * - http(s) / desktop host: /Facility Data/ (Kestrel maps this to the sibling folder)
 * - file:// or nested paths: relative ../../Facility Data/ etc.
 */
(function (global) {
  function detectPrefix() {
    try {
      if (global.__JEFFCO_DESKTOP__) return "/Facility Data/";
      const loc = global.location;
      if (loc && /github\.io$/i.test(loc.hostname || '')) {
        // Project Pages live under /<repo>/... so an absolute /Facility Data/ would miss the repo root.
        return 'Facility Data/';
      }
      if (loc && /^https?:$/i.test(loc.protocol)) return '/Facility Data/';
      const p = String(loc && loc.pathname || "").replace(/\\/g, "/").toLowerCase();
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
