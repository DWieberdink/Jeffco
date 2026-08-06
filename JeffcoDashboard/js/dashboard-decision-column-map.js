/**
 * Maps YOUR Decision CSV headers → dashboard column names via DecisionColumnMap.json.
 */
(function () {
  const LOGICAL_KEYS = [
    "enrollmentTotal",
    "enrollmentPK",
    "enrollmentBaseline",
    "projPK",
    "projTotal",
    "projKPlus",
  ];

  const META_KEYS = new Set(["_comment", "_example", "_examples", "columns", "howItWorks"]);

  window.decisionColumnMap = {};
  window.decisionColumnMapColumns = {};

  function decisionJsonUrl(filename) {
    const p = (typeof location !== "undefined" && location.pathname) || "";
    if (/\/pages\//i.test(p) || /\/ClosureScenarioModule\//i.test(p)) {
      return "../" + filename;
    }
    return filename;
  }

  function applyUserMap(from) {
    window.decisionColumnMap = {};
    window.decisionColumnMapColumns = {};
    if (!from || typeof from !== "object") return;

    if (from.columns && typeof from.columns === "object") {
      Object.entries(from.columns).forEach(([canonical, userHeader]) => {
        const h = userHeader != null ? String(userHeader).trim() : "";
        if (h) window.decisionColumnMapColumns[canonical] = h;
      });
    }

    Object.entries(from).forEach(([k, v]) => {
      if (META_KEYS.has(k)) return;
      if (!LOGICAL_KEYS.includes(k)) return;
      const h = v != null ? String(v).trim() : "";
      if (h) window.decisionColumnMap[k] = h;
    });
  }

  window.loadDecisionColumnMap = async function () {
    try {
      const res = await fetch(decisionJsonUrl("DecisionColumnMap.json") + "?cb=" + Date.now());
      if (res.ok) applyUserMap(await res.json());
    } catch (e) {
      /* optional file */
    }
    document.dispatchEvent(new CustomEvent("jeffco-decision-column-map-updated"));
    return { logical: window.decisionColumnMap, columns: window.decisionColumnMapColumns };
  };

  window.getDecisionExpectedColumns = function () {
    if (typeof window.DECISION_EXPECTED_COLUMNS !== "undefined" && window.DECISION_EXPECTED_COLUMNS.length) {
      return window.DECISION_EXPECTED_COLUMNS.slice();
    }
    return [];
  };

  window.buildDecisionColumnMapJson = function (columnEntries) {
    const columns = {};
    (columnEntries || []).forEach(({ canonical, yourHeader }) => {
      const c = String(canonical || "").trim();
      const h = String(yourHeader || "").trim();
      if (c && h && h !== c) columns[c] = h;
    });
    return {
      _comment:
        "Only include columns you renamed. Key = dashboard name, value = your exact CSV header. Restart after saving.",
      columns,
    };
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.loadDecisionColumnMap());
  } else {
    window.loadDecisionColumnMap();
  }
})();
