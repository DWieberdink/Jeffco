(function () {
  "use strict";

  var PAGE = (function () {
    var p = location.pathname.toLowerCase();
    if (p.indexOf("school-profile") !== -1) return "school-profile";
    if (p.indexOf("data-viewer") !== -1) return "data-viewer";
    return "index";
  })();

  var pathNorm = location.pathname.replace(/\\/g, "/");
  var IN_PAGES = pathNorm.indexOf("/pages/") !== -1;
  function hrefFromRoot(rel) {
    return (IN_PAGES ? "../" : "") + rel;
  }
  function hrefToDataViewer() {
    return IN_PAGES ? "data-viewer.html" : "pages/data-viewer.html";
  }

  var INDEX = [];
  var DYNAMIC_CATEGORIES = ["Schools", "Articulation Areas", "FCI Systems"];
  var DYNAMIC_RESULT_LIMIT = 10;

  function removeCategories(cats) {
    INDEX = INDEX.filter(function (e) { return cats.indexOf(e.category) === -1; });
  }

  function addEntry(label, keywords, category, action) {
    INDEX.push({
      label: label,
      keywords: (label + " " + (keywords || "")).trim(),
      category: category,
      action: action
    });
  }

  function buildStaticIndex() {
    INDEX = [];

    [
      { label: "Dashboard (Main Map)", keywords: "dashboard map home main", action: { type: "nav", href: hrefFromRoot("index.html") } },
      { label: "School Project List", keywords: "school project list assets profile asset life cycle 07 08 facilities deficiency", action: { type: "nav", href: hrefFromRoot("school-profile.html") } },
      { label: "Data & Logic Tool", keywords: "data logic tool documentation sources", action: { type: "nav", href: hrefToDataViewer() } }
    ].forEach(function (n) {
      addEntry(n.label, n.keywords, "Navigation", n.action);
    });

    [
      { label: "Step 1: Understand School-level Data", step: 1, keywords: "step 1 school data table iso articulation page view" },
      { label: "Step 2: Explore the Interactive Map", step: 2, keywords: "step 2 map explore interactive layers filters" },
      { label: "Step 3: Sort by Strategic Decision", step: 3, keywords: "step 3 sort by strategic decision strategic sorting decision logic flows flowchart" },
      { label: "Step 4: Prioritize within Strategy Groups", step: 4, keywords: "step 4 prioritize prioritization strategy groups weights results" }
    ].forEach(function (s) {
      addEntry(s.label, s.keywords, "Process Steps", { type: "step", step: s.step });
    });

    addEntry("How to Use | Start Tour", "how to use guide help intro tour walkthrough start tour onboarding menu", "Help", { type: "tour" });

    [
      { label: "Menu", id: "sidebarToggle", keywords: "hamburger menu navigation sidebar", parentStep: 2 },
      { label: "Page View: Map", keywords: "page view map show map menu", parentStep: 3, action: { type: "view", view: "map" } },
      { label: "Page View: Flowchart", keywords: "page view flowchart show flowchart decision tree menu", parentStep: 3, action: { type: "view", view: "flowchart" } },
      { label: "Controls", id: "toggleLeftSidebar", keywords: "controls left sidebar docked column show hide menu", parentStep: 3 },
      { label: "Results", id: "toggleRightSidebar", keywords: "results tables bottom sidebar show hide menu", parentStep: 3 },
      { label: "Open School Project List", id: "menuSchoolProjectList", keywords: "school project list menu navigation", action: { type: "nav", href: hrefFromRoot("school-profile.html") } },
      { label: "Data & Logic Tool (Menu)", id: "menuDataLogic", keywords: "data logic documentation menu", action: { type: "nav", href: hrefToDataViewer() } }
    ].forEach(function (s) {
      addEntry(s.label, s.keywords, "Menu & View", s.action || { type: "element", id: s.id, parentStep: s.parentStep });
    });

    [
      { label: "School Portfolio Explore", id: "step1-school-view", keywords: "step 1 school portfolio explore enrollment capacity building articulation", parentStep: 1 },
      { label: "School", id: "step1SchoolSelect", keywords: "step 1 select school dropdown school-level data", parentStep: 1 },
      { label: "Articulation Area", id: "step1CompareArticulationSelect", keywords: "step 1 articulation area compare schools dropdown", parentStep: 1 },
      { label: "Compare Selected Schools", id: "step1CompareMode", keywords: "step 1 compare selected schools checkbox compare mode", parentStep: 1 },
      { label: "Include PK in enrollment (Step 1)", id: "step1IncludePKToggle", keywords: "step 1 pre-k pk enrollment utilization seats", parentStep: 1 },
      { label: "Use Educational Capacity (Step 1)", id: "step1UseEducationalCapacityToggle", keywords: "step 1 educational capacity utilization seats", parentStep: 1 },
      { label: "Open School Project List (Step 1)", id: "step1OpenSchoolProfileBtn", keywords: "step 1 school project list profile", parentStep: 1 },
      { label: "Fit all in view", id: "step1CompareFitWidth", keywords: "step 1 compare cards fit width view", parentStep: 1 },
      { label: "Card width", id: "step1CompareCardWidth", keywords: "step 1 compare card width slider sizing", parentStep: 1 },
      { label: "Add another school to compare", id: "step1AddCompareSlot", keywords: "step 1 compare add school slot", parentStep: 1 },
      { label: "Enrollment (2025-26)", id: "step1EnrollmentTiles", keywords: "step 1 enrollment section tiles attendance area growth", parentStep: 1 },
      { label: "Building Information", id: "step1BuildingInfoTiles", keywords: "step 1 building information composite building score educational adequacy utilization", parentStep: 1 }
    ].forEach(function (s) {
      addEntry(s.label, s.keywords, "Step 1: School-level Data", { type: "element", id: s.id, parentStep: s.parentStep || 1 });
    });

    [
      { label: "Map Filters", id: "filter-panel", keywords: "map filters symbology show hide schools articulation hamburger", parentStep: 2, openMapFilters: true },
      { label: "Symbology", id: "symbologySection", keywords: "symbology color map by school level composite building score fci strategic decision utilization", parentStep: 2, openMapFilters: true },
      { label: "Show/Hide Schools", id: "showHideSchoolsSection", keywords: "show hide schools school level enrollment range available seats", parentStep: 2, openMapFilters: true },
      { label: "Articulation Areas", id: "articulationAreasSection", keywords: "articulation areas bond spending enrollment growth", parentStep: 2, openMapFilters: true },
      { label: "School Matches", id: "schoolMatchesBlock", keywords: "school matches nearby distance welcoming overlapping grades", parentStep: 2, openMapFilters: true },
      { label: "Map Legend", id: "map-legend", keywords: "map legend symbology colors filters", parentStep: 2 },
      { label: "Fit to all schools", id: "fitToSchoolsBtn", keywords: "fit extent zoom all schools map reset view", parentStep: 2 },
      { label: "Basemap Layers", id: "mapLayersFloating", keywords: "basemap layers map style labels offline", parentStep: 2, openMapLayers: true },
      { label: "Map school selector", id: "mapOriginSchoolSelect", keywords: "map select school origin dropdown", parentStep: 2 },
      { label: "Flowchart school selector", id: "mainFlowchartSchoolSelect", keywords: "flowchart select school dropdown", parentStep: 3 },
      { label: "Zoom flowchart to fit", id: "flowchartZoomToFitBtn", keywords: "flowchart zoom fit view", parentStep: 3 }
    ].forEach(function (s) {
      addEntry(s.label, s.keywords, "Map & Layers", {
        type: "section",
        id: s.id,
        parentStep: s.parentStep || 2,
        openMapFilters: !!s.openMapFilters,
        openMapLayers: !!s.openMapLayers
      });
    });

    [
      { label: "Color map by: School Level", mode: "level", btnId: "colorByLevelBtn" },
      { label: "Color map by: Composite Building Score", mode: "building", btnId: "colorByBuildingBtn" },
      { label: "Color map by: FCI", mode: "fci", btnId: "colorByFciBtn" },
      { label: "Color map by: Strategic Decision", mode: "decision", btnId: "colorByDecisionBtn" },
      { label: "Color map by: Utilization", mode: "utilization", btnId: "colorByUtilBtn" }
    ].forEach(function (c) {
      addEntry(c.label, "symbology color map by " + c.mode, "Map & Layers", { type: "colorBy", mode: c.mode, btnId: c.btnId, parentStep: 2 });
    });

    [
      { label: "FCI System for Symbology", id: "fciSystemSelect", keywords: "fci system symbology dropdown select", openMapFilters: true },
      { label: "Show size by capacity", id: "toggleShowSizeByCapacity", keywords: "symbology size capacity circles", openMapFilters: true },
      { label: "Show utilization pie charts", id: "toggleUtilizationPie", keywords: "symbology utilization pie charts", openMapFilters: true },
      { label: "Use Educational Capacity", id: "toggleUseEducationalCapacity", keywords: "symbology educational capacity utilization seats", openMapFilters: true },
      { label: "Include PK in utilization", id: "toggleIncludePKInUtilization", keywords: "symbology pre-k pk utilization", openMapFilters: true },
      { label: "Reset Show/Hide Schools", id: "resetShowHideSchoolsBtn", keywords: "reset show hide schools filters", openMapFilters: true },
      { label: "Enrollment Range", id: "minEnrollRange", keywords: "enrollment range filter show hide schools", openMapFilters: true },
      { label: "Available Seats", id: "minSeatsRange", keywords: "available seats range filter show hide schools", openMapFilters: true },
      { label: "Include schools not part of the evaluation", id: "toggleIncludeNonEval", keywords: "show hide schools evaluation non eval", openMapFilters: true },
      { label: "Include closed schools", id: "toggleIncludeClosed", keywords: "show hide schools closed", openMapFilters: true },
      { label: "Schools within distance threshold", id: "schoolMatchesWithinDistance", keywords: "school matches distance threshold", openMapFilters: true },
      { label: "Schools serving overlapping grades", id: "schoolMatchesOverlappingGrades", keywords: "school matches overlapping grades", openMapFilters: true },
      { label: "Show articulation areas", id: "toggleArticulationAreas", keywords: "articulation areas boundaries map overlay", openMapFilters: true },
      { label: "Color by bond spending % (GO Bond, 2018)", id: "toggleBondSpendingColors", keywords: "articulation bond spending historic colors go bond 2018", openMapFilters: true },
      { label: "Color by change in enrollment (2015-16 to 2025-26)", id: "toggleEnrollmentGrowthColors", keywords: "articulation enrollment growth historic colors", openMapFilters: true },
      { label: "Select articulation area", id: "mapArticulationAreaSelect", keywords: "articulation area picker dropdown map", openMapFilters: true },
      { label: "Map Style", id: "mapStyleLight", keywords: "basemap light standard satellite style", openMapLayers: true },
      { label: "Map Labels: Road labels", id: "toggleRoadLabels", keywords: "basemap road labels", openMapLayers: true },
      { label: "Map Labels: Place labels", id: "togglePlaceLabels", keywords: "basemap place labels", openMapLayers: true },
      { label: "Map Labels: Points of Interest", id: "togglePoiLabels", keywords: "basemap poi points of interest labels", openMapLayers: true },
      { label: "Save map for offline (Jefferson County)", id: "mapOfflinePrepareBtn", keywords: "offline map download jefferson county basemap", openMapLayers: true }
    ].forEach(function (c) {
      addEntry(c.label, c.keywords, "Map & Layers", {
        type: "element",
        id: c.id,
        parentStep: 2,
        openMapFilters: !!c.openMapFilters,
        openMapLayers: !!c.openMapLayers
      });
    });

    [
      { label: "Sort by Strategic Decision", id: "decision-input-panel", keywords: "sort by strategic decision strategic sorting decision routing thresholds flows", parentStep: 3 },
      { label: "Prioritize within Strategy Groups", id: "scenario-input-panel", keywords: "prioritize within strategy groups prioritization weights strategy sorting", parentStep: 4 },
      { label: "Prioritization Weights", id: "prioritization-weights-left-panel", keywords: "prioritization weights sliders criteria metrics", parentStep: 4 },
      { label: "Reset all to defaults (Prioritization)", id: "resetAllPrioritizationWeightsBtn", keywords: "reset prioritization weights defaults step 4", parentStep: 4 }
    ].forEach(function (s) {
      addEntry(s.label, s.keywords, "Dashboard Sections", { type: "section", id: s.id, parentStep: s.parentStep });
    });

    [
      { label: "Flow 1: Decision Routing", flowIndex: 0, keywords: "flow 1 decision routing enrollment utilization growth distance underutilized" },
      { label: "Flow 2: Expansion", flowIndex: 1, keywords: "flow 2 expansion attendance area composite building score educational adequacy" },
      { label: "Flow 3: Maintenance/Investment", flowIndex: 2, keywords: "flow 3 maintenance investment composite building score above below educational adequacy" },
      { label: "Flow 4: Closure/Consolidation", flowIndex: 3, keywords: "flow 4 closure consolidation composite building score distance welcoming schools" }
    ].forEach(function (f) {
      addEntry(f.label, f.keywords, "Decision Flows", { type: "flow", parentId: "decision-input-panel", flowIndex: f.flowIndex });
    });

    [
      { label: "Strategic Decision Summary", tabId: "summary-tab", keywords: "strategic decision summary results count decision summary table" },
      { label: "Decision by School", tabId: "decision-tab", keywords: "decision by school results table export csv" },
      { label: "Strategy Prioritization", tabId: "impact-tab", keywords: "strategy prioritization impact analysis strategy candidate groups prioritized" }
    ].forEach(function (t) {
      addEntry(t.label, t.keywords, "Results Tabs", { type: "tab", tabId: t.tabId });
    });

    var flowSettings = [
      { label: "Enrollment Thresholds by School Level (2025-26)", type: "nested", flow: 0, selector: ".flow-root-flow1 details.flow-nested-group:nth-of-type(1)" },
      { label: "Elementary School Enrollment Threshold", sliderId: "elementaryEnrollmentSlider", flow: 0, keywords: "elementary enrollment threshold flow 1" },
      { label: "K-8 School Enrollment Threshold", sliderId: "k8EnrollmentSlider", flow: 0, keywords: "k8 enrollment threshold flow 1" },
      { label: "Middle School Enrollment Threshold", sliderId: "middleEnrollmentSlider", flow: 0, keywords: "middle enrollment threshold flow 1" },
      { label: "High School Enrollment Threshold", sliderId: "highEnrollmentSlider", flow: 0, keywords: "high enrollment threshold flow 1" },
      { label: "6-12 School Enrollment Threshold", sliderId: "k12EnrollmentSlider", flow: 0, keywords: "k12 enrollment threshold flow 1" },
      { label: "Current Utilization Threshold", sliderId: "utilSlider", flow: 0, keywords: "utilization threshold current flow 1" },
      { label: "High Utilization Threshold", sliderId: "utilHighSlider", flow: 0, keywords: "high utilization threshold flow 1" },
      { label: "Enrollment Growth Threshold", sliderId: "growthSlider", flow: 0, keywords: "enrollment growth threshold flow 1" },
      { label: "Include PK in enrollment", sliderId: "includePKInEnrollmentToggle", flow: 0, keywords: "pre-k pk enrollment flow 1" },
      { label: "Distance to Underutilized Schools by School Level", type: "nested", flow: 0, selector: ".flow-root-flow1 details.flow-nested-group:nth-of-type(2)" },
      { label: "Distance to Underutilized Schools — Elementary", sliderId: "elementaryDistanceSlider", flow: 0, keywords: "distance underutilized elementary flow 1" },
      { label: "Distance to Underutilized Schools — K-8", sliderId: "k8DistanceSlider", flow: 0, keywords: "distance underutilized k8 flow 1" },
      { label: "Distance to Underutilized Schools — Middle", sliderId: "middleDistanceSlider", flow: 0, keywords: "distance underutilized middle flow 1" },
      { label: "Distance to Underutilized Schools — High", sliderId: "highDistanceSlider", flow: 0, keywords: "distance underutilized high flow 1" },
      { label: "Distance to Underutilized Schools — K-12", sliderId: "k12DistanceSlider", flow: 0, keywords: "distance underutilized k12 flow 1" },
      { label: "Attendance Area Enrollment", sliderId: "attendanceAreaEnrollmentSlider", flow: 1, keywords: "attendance area enrollment flow 2 expansion" },
      { label: "Composite Building Score", sliderId: "buildSlider", flow: 1, keywords: "composite building score flow 2 expansion" },
      { label: "Educational Adequacy (Flow 2 only)", sliderId: "progSlider", flow: 1, keywords: "educational adequacy flow 2 expansion" },
      { label: "Composite Building Score Above Threshold", sliderId: "buildAboveSlider", flow: 2, keywords: "composite building score above maintenance investment flow 3" },
      { label: "Composite Building Score Below Threshold", sliderId: "buildBelowSlider", flow: 2, keywords: "composite building score below maintenance investment flow 3" },
      { label: "Educational Adequacy (Flow 3 only)", sliderId: "progFlow3Slider", flow: 2, keywords: "educational adequacy flow 3 maintenance investment" },
      { label: "Composite Building Score (Flow 4)", sliderId: "buildFlow4Slider", flow: 3, keywords: "composite building score flow 4 closure consolidation" },
      { label: "Distance to Welcoming Schools by School Level", type: "nested", flow: 3, selector: ".flow-root-flow4 .flow-nested-group" },
      { label: "Distance to Welcoming Schools — Elementary School", sliderId: "elementaryDistanceSliderFlow4", flow: 3, keywords: "distance welcoming elementary flow 4" },
      { label: "Distance to Welcoming Schools — K-8 School", sliderId: "k8DistanceSliderFlow4", flow: 3, keywords: "distance welcoming k8 flow 4" },
      { label: "Distance to Welcoming Schools — Middle School", sliderId: "middleDistanceSliderFlow4", flow: 3, keywords: "distance welcoming middle flow 4" },
      { label: "Distance to Welcoming Schools — High School", sliderId: "highDistanceSliderFlow4", flow: 3, keywords: "distance welcoming high flow 4" },
      { label: "Distance to Welcoming Schools — 6-12 School", sliderId: "k12DistanceSliderFlow4", flow: 3, keywords: "distance welcoming k12 flow 4" }
    ];
    flowSettings.forEach(function (s) {
      if (s.type === "nested") {
        addEntry(s.label, s.keywords || s.label, "Settings", { type: "flowNested", flow: s.flow, selector: s.selector });
      } else {
        addEntry(s.label, (s.keywords || s.label) + " slider threshold", "Settings", {
          type: "slider",
          sliderId: s.sliderId,
          flow: s.flow,
          parentId: "decision-input-panel"
        });
      }
    });

    var prioritizationSliders = [
      "Lower Enrollment",
      "Lower Utilization",
      "Lower % of Students from Attendance Area",
      "Lower % High-Need Student Enrollment",
      "Lower Composite Building Score",
      "Lower Educational Adequacy (EA)",
      "Fewer Past Investments",
      "Specialty Program Offerings",
      "Higher Utilization",
      "Higher Enrollment",
      "Higher Enrollment of High-Need Students",
      "Greater Neighborhood Capture Rate",
      "More Students Welcomed from Previous Consolidations",
      "Greater Distance from Other Schools"
    ];
    var prioKeyByLabel = {
      "Lower Enrollment": "enrollment",
      "Lower Utilization": "utilizationRate",
      "Lower % of Students from Attendance Area": "studentsInAttendanceArea",
      "Lower % High-Need Student Enrollment": "studentEconomicStatus",
      "Lower Composite Building Score": "buildingCondition",
      "Lower Educational Adequacy (EA)": "academicPerformance",
      "Fewer Past Investments": "pastInvestments",
      "Specialty Program Offerings": "specialtyProgramOfferings",
      "Higher Utilization": "utilizationRate",
      "Higher Enrollment": "enrollment",
      "Higher Enrollment of High-Need Students": "studentEconomicStatus",
      "Greater Neighborhood Capture Rate": "studentsInAttendanceArea",
      "More Students Welcomed from Previous Consolidations": "welcomedStudents",
      "Greater Distance from Other Schools": "distanceFromOtherSchools"
    };
    prioritizationSliders.forEach(function (label) {
      var key = prioKeyByLabel[label];
      addEntry(label, "prioritization weight slider step 4 strategy group " + label, "Prioritization Weights", {
        type: "prioritizationSlider",
        sliderId: key + "-slider",
        parentStep: 4
      });
    });

    [
      { label: "Overview (Data & Logic)", tabName: "overview", keywords: "overview data logic documentation" },
      { label: "Workflow & Steps", tabName: "decision-categories", keywords: "workflow steps 1 2 3 4 map flowchart strategic sorting prioritization school project list methodology" },
      { label: "School Profile Logic", tabName: "school-profile-logic", keywords: "school profile logic project list fci" },
      { label: "Data Sources", tabName: "data-sources", keywords: "data sources csv files decision export map" }
    ].forEach(function (t) {
      addEntry(t.label, t.keywords, "Data & Logic", { type: "data-viewer-tab", tabName: t.tabName });
    });
  }

  buildStaticIndex();

  window.globalSearchRegisterSchools = function (schoolNames) {
    removeCategories(["Schools"]);
    var seen = {};
    (schoolNames || []).forEach(function (name) {
      if (!name || seen[name.toLowerCase()]) return;
      seen[name.toLowerCase()] = true;
      addEntry(name, name + " school building", "Schools", { type: "school", name: name });
    });
  };

  window.globalSearchRegisterArticulationAreas = function (areas) {
    removeCategories(["Articulation Areas"]);
    var seen = {};
    (areas || []).forEach(function (area) {
      if (!area || !area.label || seen[area.label.toLowerCase()]) return;
      seen[area.label.toLowerCase()] = true;
      addEntry(area.label, area.label + " articulation area boundary schools", "Articulation Areas", {
        type: "articulation",
        key: area.key,
        label: area.label,
        hasMapBoundary: !!area.hasMapBoundary
      });
    });
  };

  window.globalSearchRegisterFciSystems = function (systems) {
    removeCategories(["FCI Systems"]);
    var seen = {};
    (systems || []).forEach(function (sys) {
      if (!sys || seen[String(sys).toLowerCase()]) return;
      seen[String(sys).toLowerCase()] = true;
      var name = String(sys);
      addEntry("FCI System for Symbology: " + name, name + " fci symbology color map system", "FCI Systems", {
        type: "fciSymbology",
        system: name,
        parentStep: 2
      });
    });
  };

  function search(query) {
    if (!query || query.length < 2) return [];
    var q = query.toLowerCase().trim();
    var tokens = q.split(/\s+/);
    var scored = [];

    INDEX.forEach(function (entry) {
      var hay = entry.keywords.toLowerCase();
      var labelLow = entry.label.toLowerCase();
      var match = true;
      var score = 0;

      for (var i = 0; i < tokens.length; i++) {
        if (hay.indexOf(tokens[i]) === -1) { match = false; break; }
      }
      if (!match) return;

      if (labelLow === q) score += 100;
      else if (labelLow.indexOf(q) === 0) score += 50;
      else if (labelLow.indexOf(q) !== -1) score += 30;
      else score += 10;

      if (DYNAMIC_CATEGORIES.indexOf(entry.category) === -1) score += 5;

      scored.push({ entry: entry, score: score });
    });

    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.map(function (s) { return s.entry; });
  }

  var CATEGORY_ORDER = [
    "Navigation", "Process Steps", "Help", "Menu & View",
    "Step 1: School-level Data", "Map & Layers", "Dashboard Sections",
    "Decision Flows", "Results Tabs", "Settings", "Prioritization Weights",
    "Data & Logic", "Articulation Areas", "FCI Systems", "Schools"
  ];
  var CATEGORY_ICONS = {
    "Navigation": "\u2192",
    "Process Steps": "\u25B6",
    "Help": "\u2753",
    "Menu & View": "\u2630",
    "Step 1: School-level Data": "\u25A3",
    "Map & Layers": "\uD83D\uDDFA",
    "Dashboard Sections": "\u25A0",
    "Decision Flows": "\u2935",
    "Results Tabs": "\u2637",
    "Settings": "\u2699",
    "Prioritization Weights": "\u2696",
    "Data & Logic": "\u2139",
    "Articulation Areas": "\uD83D\uDCCD",
    "FCI Systems": "\uD83D\uDD27",
    "Schools": "\uD83C\uDFEB"
  };

  function renderResults(results, container, query) {
    container.innerHTML = "";
    if (!results.length) {
      container.innerHTML = '<div class="gs-empty">No results found</div>';
      return;
    }

    var groups = {};
    results.forEach(function (r) {
      if (!groups[r.category]) groups[r.category] = [];
      groups[r.category].push(r);
    });

    DYNAMIC_CATEGORIES.forEach(function (cat) {
      if (groups[cat] && groups[cat].length > DYNAMIC_RESULT_LIMIT) {
        groups[cat] = groups[cat].slice(0, DYNAMIC_RESULT_LIMIT);
      }
    });

    CATEGORY_ORDER.forEach(function (cat) {
      if (!groups[cat]) return;
      var header = document.createElement("div");
      header.className = "gs-category";
      header.textContent = (CATEGORY_ICONS[cat] || "") + "  " + cat;
      container.appendChild(header);

      groups[cat].forEach(function (entry) {
        var item = document.createElement("div");
        item.className = "gs-item";
        item.setAttribute("tabindex", "-1");
        item.setAttribute("role", "option");
        item.innerHTML = highlightMatch(entry.label, query);
        item.addEventListener("mousedown", function (e) {
          e.preventDefault();
          executeAction(entry.action);
          if (window._closeGlobalSearch) window._closeGlobalSearch();
        });
        container.appendChild(item);
      });
    });
  }

  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    var idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return escapeHtml(text);
    return escapeHtml(text.substring(0, idx)) +
      '<mark class="gs-highlight">' + escapeHtml(text.substring(idx, idx + query.length)) + '</mark>' +
      escapeHtml(text.substring(idx + query.length));
  }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function waitFor(conditionFn, callback, maxMs) {
    maxMs = maxMs || 8000;
    var start = Date.now();
    (function poll() {
      if (conditionFn()) { callback(); return; }
      if (Date.now() - start > maxMs) { callback(); return; }
      setTimeout(poll, 200);
    })();
  }

  function openDetailsChain(el) {
    if (!el) return;
    var d = el.closest ? el.closest("details") : null;
    while (d) {
      d.open = true;
      d = d.parentElement ? d.parentElement.closest("details") : null;
    }
  }

  function openMapFiltersPanel() {
    var panel = document.getElementById("filter-panel");
    if (panel) panel.open = true;
  }

  function openMapLayersPanel() {
    var panel = document.getElementById("mapLayersFloating");
    if (panel) panel.open = true;
  }

  function highlightElement(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} }
    el.style.outline = "2px solid #007cbf";
    setTimeout(function () { el.style.outline = ""; }, 2000);
  }

  function openFlowRoot(flowIndex) {
    var flowEl = document.querySelector(".flow-root-flow" + (flowIndex + 1));
    if (!flowEl) return null;
    openDetailsChain(flowEl);
    var panel = document.getElementById("decision-input-panel");
    if (panel) panel.hidden = false;
    flowEl.open = true;
    return flowEl;
  }

  function focusElementById(id, opts) {
    opts = opts || {};
    waitFor(function () { return !!document.getElementById(id); }, function () {
      var el = document.getElementById(id);
      if (!el) return;
      if (opts.openMapFilters) openMapFiltersPanel();
      if (opts.openMapLayers) openMapLayersPanel();
      openDetailsChain(el);
      setTimeout(function () { highlightElement(el); }, opts.delay || 100);
    });
  }

  function openAndScroll(id, opts) {
    opts = opts || {};
    if (!id) return;
    var el = document.getElementById(id);
    if (!el) return;
    if (opts.openMapFilters) openMapFiltersPanel();
    if (opts.openMapLayers) openMapLayersPanel();
    openDetailsChain(el);
    if (el.tagName === "DETAILS") el.open = true;
    setTimeout(function () { highlightElement(el); }, opts.delay || 100);
  }

  function goToStepOnIndex(step, extra) {
    if (window._goToStep) window._goToStep(step, extra || undefined);
  }

  function selectArticulationArea(action) {
    if (action.hasMapBoundary) {
      goToStepOnIndex(2);
      setTimeout(function () {
        openMapFiltersPanel();
        var aaCb = document.getElementById("toggleArticulationAreas");
        if (aaCb && !aaCb.checked) {
          aaCb.checked = true;
          aaCb.dispatchEvent(new Event("change", { bubbles: true }));
        }
        waitFor(function () {
          var sel = document.getElementById("mapArticulationAreaSelect");
          return sel && Array.from(sel.options).some(function (o) { return o.value === action.key; });
        }, function () {
          var sel = document.getElementById("mapArticulationAreaSelect");
          if (sel) {
            sel.value = action.key;
            sel.dispatchEvent(new Event("change", { bubbles: true }));
            highlightElement(sel);
          }
        });
      }, 250);
      return;
    }

    goToStepOnIndex(1);
    setTimeout(function () {
      waitFor(function () {
        var sel = document.getElementById("step1CompareArticulationSelect");
        return sel && Array.from(sel.options).some(function (o) { return o.value === action.key; });
      }, function () {
        var sel = document.getElementById("step1CompareArticulationSelect");
        if (sel) {
          sel.value = action.key;
          sel.dispatchEvent(new Event("change", { bubbles: true }));
          highlightElement(sel);
        }
      });
    }, 250);
  }

  function selectFciSymbology(system) {
    goToStepOnIndex(2);
    setTimeout(function () {
      openMapFiltersPanel();
      var btn = document.getElementById("colorByFciBtn");
      if (btn) btn.click();
      waitFor(function () { return !!document.getElementById("fciSystemSelect"); }, function () {
        var sel = document.getElementById("fciSystemSelect");
        if (!sel) return;
        var hasOpt = Array.from(sel.options).some(function (o) { return o.value === system; });
        if (hasOpt) {
          sel.value = system;
          sel.dispatchEvent(new Event("change", { bubbles: true }));
        }
        highlightElement(sel);
      });
    }, 250);
  }

  function executeAction(action) {
    switch (action.type) {
      case "nav":
        navigateToPage(action.href);
        break;

      case "step":
        if (PAGE === "index") goToStepOnIndex(action.step);
        else navigateToPage(hrefFromRoot("index.html") + "#gs-step=" + action.step);
        break;

      case "section":
        if (PAGE === "index") {
          if (action.parentStep) goToStepOnIndex(action.parentStep);
          setTimeout(function () { openAndScroll(action.id, { openMapFilters: action.openMapFilters, openMapLayers: action.openMapLayers }); }, 200);
        } else {
          navigateToPage(hrefFromRoot("index.html") + "#gs-section=" + encodeURIComponent(action.id || ""));
        }
        break;

      case "element":
        if (PAGE === "index") {
          if (action.parentStep) goToStepOnIndex(action.parentStep);
          setTimeout(function () {
            focusElementById(action.id, {
              openMapFilters: action.openMapFilters,
              openMapLayers: action.openMapLayers
            });
          }, 200);
        } else {
          navigateToPage(hrefFromRoot("index.html") + "#gs-element=" + encodeURIComponent(action.id || ""));
        }
        break;

      case "view":
        if (PAGE === "index") {
          if (action.view === "flowchart" && typeof window.switchToFlowchart === "function") window.switchToFlowchart();
          else if (typeof window.switchToMap === "function") window.switchToMap();
        } else {
          navigateToPage(hrefFromRoot("index.html") + "#gs-view=" + action.view);
        }
        break;

      case "colorBy":
        if (PAGE === "index") {
          goToStepOnIndex(action.parentStep || 2);
          setTimeout(function () {
            openMapFiltersPanel();
            var btn = document.getElementById(action.btnId);
            if (btn) btn.click();
            highlightElement(btn);
          }, 200);
        } else {
          navigateToPage(hrefFromRoot("index.html") + "#gs-colorby=" + action.mode);
        }
        break;

      case "tour":
        if (PAGE === "index") {
          if (typeof window.startOnboardingWalkthrough === "function") {
            window.startOnboardingWalkthrough({ force: true });
          }
        } else {
          navigateToPage(hrefFromRoot("index.html") + "#gs-tour=1");
        }
        break;

      case "flow":
        if (PAGE === "index") {
          goToStepOnIndex(3);
          setTimeout(function () {
            openFlowRoot(action.flowIndex);
            var flowEl = document.querySelector(".flow-root-flow" + (action.flowIndex + 1));
            if (flowEl) highlightElement(flowEl);
          }, 200);
        } else {
          navigateToPage(hrefFromRoot("index.html") + "#gs-flow=" + action.flowIndex);
        }
        break;

      case "flowNested":
        if (PAGE === "index") {
          goToStepOnIndex(3);
          setTimeout(function () {
            openFlowRoot(action.flow);
            var nested = action.selector ? document.querySelector(action.selector) : null;
            if (nested) {
              nested.open = true;
              highlightElement(nested);
            }
          }, 220);
        }
        break;

      case "tab":
        if (PAGE === "index") {
          var tabStep = action.tabId === "impact-tab" ? 4 : 3;
          goToStepOnIndex(tabStep, { preferredTab: action.tabId });
          setTimeout(function () {
            var panel = document.getElementById("map-sidebar");
            if (panel) {
              panel.classList.remove("hidden");
              document.body.classList.remove("right-sidebar-collapsed");
            }
          }, 200);
        } else {
          navigateToPage(hrefFromRoot("index.html") + "#gs-tab=" + action.tabId);
        }
        break;

      case "slider":
        if (PAGE === "index") {
          goToStepOnIndex(3);
          setTimeout(function () {
            openFlowRoot(action.flow);
            setTimeout(function () {
              focusElementById(action.sliderId);
            }, 150);
          }, 200);
        } else {
          navigateToPage(hrefFromRoot("index.html") + "#gs-slider=" + encodeURIComponent(action.sliderId));
        }
        break;

      case "prioritizationSlider":
        if (PAGE === "index") {
          goToStepOnIndex(action.parentStep || 4);
          setTimeout(function () {
            var panel = document.getElementById("scenario-input-panel");
            if (panel) panel.hidden = false;
            focusElementById(action.sliderId);
          }, 250);
        } else {
          navigateToPage(hrefFromRoot("index.html") + "#gs-prio=" + encodeURIComponent(action.sliderId));
        }
        break;

      case "data-viewer-tab":
        if (PAGE === "data-viewer") {
          if (typeof window.showTab === "function") window.showTab(action.tabName);
        } else {
          navigateToPage(hrefToDataViewer() + "#gs-dvtab=" + action.tabName);
        }
        break;

      case "school":
        if (PAGE === "index") selectSchoolOnMap(action.name);
        else if (PAGE === "school-profile") selectSchoolOnProfile(action.name);
        else navigateToPage(hrefFromRoot("index.html") + "#gs-school=" + encodeURIComponent(action.name));
        break;

      case "articulation":
        if (PAGE === "index") selectArticulationArea(action);
        else navigateToPage(hrefFromRoot("index.html") + "#gs-art=" + encodeURIComponent(action.key || ""));
        break;

      case "fciSymbology":
        if (PAGE === "index") selectFciSymbology(action.system);
        else navigateToPage(hrefFromRoot("index.html") + "#gs-fci-sym=" + encodeURIComponent(action.system || ""));
        break;
    }
  }

  function navigateToPage(href) {
    var base = href.split("#")[0];
    var currentBase = location.pathname.split("/").pop();
    if (base === currentBase || (!base && location.hash)) {
      location.hash = href.split("#")[1] || "";
      handleHashRouting();
      return;
    }
    location.href = href;
  }

  function selectSchoolOnMap(name) {
    if (!window.map || !window.map.getSource) {
      navigateToPage(hrefFromRoot("school-profile.html?school=" + encodeURIComponent(name)));
      return;
    }
    try {
      var features = window.map.querySourceFeatures("schools-source", {
        filter: ["==", ["get", "Building Name"], name]
      });
      if (!features.length) {
        features = window.map.queryRenderedFeatures(undefined, {
          layers: ["schools-layer"],
          filter: ["==", ["get", "Building Name"], name]
        });
      }
      if (features.length) {
        goToStepOnIndex(2);
        var coords = features[0].geometry.coordinates;
        window.map.flyTo({ center: coords, zoom: 14 });
        window.currentSelectedSchoolName = name;
        window.currentOriginName = name;
        var mapSel = document.getElementById("mapOriginSchoolSelect");
        if (mapSel) {
          var hasOpt = Array.from(mapSel.options).some(function (o) { return o.value === name; });
          if (hasOpt) {
            mapSel.value = name;
            mapSel.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
        if (typeof window.updateFlowForSchool === "function") {
          window.updateFlowForSchool(name, window.thresholds || {});
        }
        if (typeof window.showOnMapFromFlowchart === "function") {
          window.showOnMapFromFlowchart(name);
        }
        return;
      }
    } catch (e) {}
    navigateToPage(hrefFromRoot("school-profile.html?school=" + encodeURIComponent(name)));
  }

  function selectSchoolOnProfile(name) {
    var checkboxes = document.querySelectorAll("#schoolSelectDropdown .school-cb");
    var norm = name.toLowerCase().trim();
    var matched = null;
    checkboxes.forEach(function (cb) {
      var cbName = (cb.dataset.name || "").toLowerCase().trim();
      if (cbName === norm) { cb.checked = true; matched = cb; }
    });
    if (matched) matched.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function handleHashRouting() {
    var hash = location.hash;
    if (!hash || hash.indexOf("gs-") === -1) return;

    var params = hash.substring(1);
    history.replaceState(null, "", location.pathname + location.search);

    if (params.indexOf("gs-step=") === 0) {
      waitFor(function () { return !!window._goToStep; }, function () {
        goToStepOnIndex(parseInt(params.split("=")[1], 10));
      });
    } else if (params.indexOf("gs-section=") === 0) {
      var sectionId = decodeURIComponent(params.split("=")[1] || "");
      waitFor(function () { return !!document.getElementById(sectionId); }, function () {
        openAndScroll(sectionId, { openMapFilters: sectionId === "filter-panel" || sectionId.indexOf("symbology") !== -1 });
      });
    } else if (params.indexOf("gs-element=") === 0) {
      focusElementById(decodeURIComponent(params.split("=")[1] || ""));
    } else if (params.indexOf("gs-view=") === 0) {
      var view = params.split("=")[1];
      waitFor(function () {
        return view === "flowchart"
          ? typeof window.switchToFlowchart === "function"
          : typeof window.switchToMap === "function";
      }, function () {
        if (view === "flowchart") window.switchToFlowchart();
        else window.switchToMap();
      });
    } else if (params.indexOf("gs-colorby=") === 0) {
      var mode = params.split("=")[1];
      var btnByMode = {
        level: "colorByLevelBtn",
        building: "colorByBuildingBtn",
        fci: "colorByFciBtn",
        decision: "colorByDecisionBtn",
        utilization: "colorByUtilBtn"
      };
      executeAction({ type: "colorBy", mode: mode, btnId: btnByMode[mode] || "colorByLevelBtn", parentStep: 2 });
    } else if (params.indexOf("gs-flow=") === 0) {
      executeAction({ type: "flow", flowIndex: parseInt(params.split("=")[1], 10) });
    } else if (params.indexOf("gs-tab=") === 0) {
      executeAction({ type: "tab", tabId: params.split("=")[1] });
    } else if (params.indexOf("gs-slider=") === 0) {
      var sliderId = decodeURIComponent(params.split("=")[1] || "");
      waitFor(function () { return !!document.getElementById(sliderId); }, function () {
        goToStepOnIndex(3);
        setTimeout(function () { focusElementById(sliderId); }, 300);
      });
    } else if (params.indexOf("gs-prio=") === 0) {
      executeAction({ type: "prioritizationSlider", sliderId: decodeURIComponent(params.split("=")[1] || ""), parentStep: 4 });
    } else if (params.indexOf("gs-tour=") === 0) {
      waitFor(function () { return typeof window.startOnboardingWalkthrough === "function"; }, function () {
        window.startOnboardingWalkthrough({ force: true });
      });
    } else if (params.indexOf("gs-dvtab=") === 0) {
      waitFor(function () { return typeof window.showTab === "function"; }, function () {
        window.showTab(params.split("=")[1]);
      });
    } else if (params.indexOf("gs-school=") === 0) {
      var schoolName = decodeURIComponent(params.split("=")[1]);
      if (PAGE === "index") {
        waitFor(function () { return window.map && window.map.loaded && window.map.loaded(); }, function () {
          setTimeout(function () { selectSchoolOnMap(schoolName); }, 500);
        });
      } else if (PAGE === "school-profile") {
        waitFor(function () { return document.querySelectorAll("#schoolSelectDropdown input[type='checkbox']").length > 0; }, function () {
          selectSchoolOnProfile(schoolName);
        });
      }
    } else if (params.indexOf("gs-art=") === 0) {
      var artKey = decodeURIComponent(params.split("=")[1] || "");
      executeAction({
        type: "articulation",
        key: artKey,
        hasMapBoundary: artKey !== "__option_schools__"
      });
    } else if (params.indexOf("gs-fci-sym=") === 0) {
      executeAction({ type: "fciSymbology", system: decodeURIComponent(params.split("=")[1] || "") });
    }
  }

  var CSS = [
    "#global-search-wrap { position: relative; display: inline-flex; align-items: center; margin-right: 8px; }",
    "#globalSearchInput {",
    "  width: 180px; padding: 5px 10px 5px 28px;",
    "  border: 1px solid #d1d5db; border-radius: 6px;",
    "  font-size: 12px; font-family: inherit;",
    "  background: #fff url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'/%3E%3C/svg%3E\") 8px center no-repeat;",
    "  outline: none; transition: border-color 0.15s, box-shadow 0.15s;",
    "}",
    "#globalSearchInput:focus { border-color: #007cbf; box-shadow: 0 0 0 2px rgba(0,124,191,0.15); }",
    "#globalSearchInput::placeholder { color: #9ca3af; }",
    ".global-search-results {",
    "  display: none; position: absolute; top: 100%; right: 0; margin-top: 4px;",
    "  width: 380px; max-height: 460px; overflow-y: auto;",
    "  background: #fff; border: 1px solid #d1d5db; border-radius: 8px;",
    "  box-shadow: 0 8px 24px rgba(0,0,0,0.15); z-index: 9999;",
    "  padding: 4px 0;",
    "}",
    ".global-search-results.open { display: block; }",
    ".gs-category {",
    "  padding: 6px 12px 3px; font-size: 10px; font-weight: 700;",
    "  text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280;",
    "  border-top: 1px solid #f3f4f6; margin-top: 2px;",
    "}",
    ".gs-category:first-child { border-top: none; margin-top: 0; }",
    ".gs-item {",
    "  padding: 6px 12px; font-size: 12px; cursor: pointer;",
    "  color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;",
    "}",
    ".gs-item:hover, .gs-item.gs-active { background: #f3f4f6; }",
    ".gs-highlight { background: #fef08a; color: inherit; padding: 0 1px; border-radius: 2px; }",
    ".gs-empty { padding: 16px 12px; font-size: 12px; color: #9ca3af; text-align: center; }",
    "@media (max-width: 600px) {",
    "  #globalSearchInput { width: 120px; font-size: 11px; }",
    "  .global-search-results { width: 300px; }",
    "}"
  ].join("\n");

  var styleEl = document.createElement("style");
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  function injectSearchBar() {
    var wrap = document.createElement("div");
    wrap.id = "global-search-wrap";

    var input = document.createElement("input");
    input.type = "text";
    input.id = "globalSearchInput";
    input.placeholder = "Search\u2026";
    input.autocomplete = "off";
    input.setAttribute("aria-label", "Search dashboard");

    var results = document.createElement("div");
    results.id = "globalSearchResults";
    results.className = "global-search-results";
    results.setAttribute("role", "listbox");

    wrap.appendChild(input);
    wrap.appendChild(results);

    var target;
    if (PAGE === "index") {
      target = document.querySelector("#top-brand-bar .brand-right");
      if (target) target.insertBefore(wrap, target.firstChild);
    } else if (PAGE === "school-profile") {
      target = document.querySelector(".topbar-right");
      if (target) target.insertBefore(wrap, target.firstChild);
    } else if (PAGE === "data-viewer") {
      target = document.querySelector("#top-brand-bar .brand-inner");
      if (target) {
        wrap.style.cssText = "position:absolute; right:160px; top:50%; transform:translateY(-50%);";
        var backBtn = target.querySelector(".top-back-button");
        if (backBtn) target.insertBefore(wrap, backBtn);
        else target.appendChild(wrap);
      }
    }

    return { input: input, results: results };
  }

  function init() {
    var ui = injectSearchBar();
    if (!ui.input) return;

    var input = ui.input;
    var resultBox = ui.results;
    var activeIdx = -1;

    input.addEventListener("input", function () {
      var q = input.value.trim();
      var hits = search(q);
      activeIdx = -1;
      if (q.length >= 2 && hits.length > 0) {
        renderResults(hits, resultBox, q);
        resultBox.classList.add("open");
      } else if (q.length >= 2) {
        resultBox.innerHTML = '<div class="gs-empty">No results found</div>';
        resultBox.classList.add("open");
      } else {
        resultBox.classList.remove("open");
      }
    });

    input.addEventListener("keydown", function (e) {
      var items = resultBox.querySelectorAll(".gs-item");
      if (!items.length) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIdx = Math.min(activeIdx + 1, items.length - 1);
        updateActive(items);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIdx = Math.max(activeIdx - 1, 0);
        updateActive(items);
      } else if (e.key === "Enter" && activeIdx >= 0) {
        e.preventDefault();
        items[activeIdx].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      } else if (e.key === "Escape") {
        closeSearch();
        input.blur();
      }
    });

    function updateActive(items) {
      items.forEach(function (item, i) {
        item.classList.toggle("gs-active", i === activeIdx);
        if (i === activeIdx) item.scrollIntoView({ block: "nearest" });
      });
    }

    input.addEventListener("focus", function () {
      if (input.value.trim().length >= 2) {
        var hits = search(input.value.trim());
        if (hits.length) { renderResults(hits, resultBox, input.value.trim()); resultBox.classList.add("open"); }
      }
    });

    document.addEventListener("mousedown", function (e) {
      if (!e.target.closest("#global-search-wrap")) closeSearch();
    });

    window._closeGlobalSearch = closeSearch;

    function closeSearch() {
      resultBox.classList.remove("open");
      activeIdx = -1;
      input.value = "";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { init(); handleHashRouting(); });
  } else {
    init();
    handleHashRouting();
  }

})();
