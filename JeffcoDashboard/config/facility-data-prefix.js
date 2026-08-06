/**
 * URL prefix for Facility Data CSV/GeoJSON.
 * - GitHub Pages: absolute path under the project base (/<repo>/Facility Data/)
 * - http(s) / desktop host: /Facility Data/ (Kestrel maps this to the sibling folder)
 * - file:// or nested paths: relative ../../Facility Data/ etc.
 */
(function (global) {
  // Folders that ship inside the app root, so a leading segment matching one of
  // these means we are already at the site root (user/org Pages), not under /<repo>/.
  const APP_SUBFOLDERS = new Set([
    'pages',
    'closurescenariomodule',
    'assets',
    'js',
    'config',
    'docs',
    'facility data',
  ]);

  function githubPagesPrefix(loc) {
    const segments = String((loc && loc.pathname) || '')
      .split('/')
      .filter(Boolean)
      .map((s) => decodeURIComponent(s));
    const first = segments[0] || '';
    const key = first.toLowerCase();
    // Project Pages serve from /<repo>/, so data must be addressed from that base.
    // A first segment that is an app folder or a file name means we are already at the root.
    if (first && !APP_SUBFOLDERS.has(key) && !first.includes('.')) {
      return '/' + first + '/Facility Data/';
    }
    return '/Facility Data/';
  }

  function detectPrefix() {
    try {
      if (global.__JEFFCO_DESKTOP__) return "/Facility Data/";
      const loc = global.location;
      if (loc && /github\.io$/i.test(loc.hostname || '')) {
        return githubPagesPrefix(loc);
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
