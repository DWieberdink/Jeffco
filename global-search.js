(function () {
  "use strict";

  var PAGE = (function () {
    var p = location.pathname.toLowerCase();
    if (p.indexOf("school-profile") !== -1) return "school-profile";
    if (p.indexOf("data-viewer") !== -1) return "data-viewer";
    return "index";
  })();

  // ---------------------------------------------------------------------------
  // Search Index
  // ---------------------------------------------------------------------------
  // Each entry: { label, keywords, category, action }
  // action: { type, ...params }

  var INDEX = [];

  // --- Navigation ---
  var NAV = [
    { label: "Dashboard (Main Map)", keywords: "dashboard map home main", page: "index", action: { type: "nav", href: "index.html" } },
    { label: "School Project List", keywords: "school project list assets profile", page: "any", action: { type: "nav", href: "school-profile.html" } },
    { label: "Data & Logic Tool", keywords: "data logic tool documentation sources", page: "any", action: { type: "nav", href: "data-viewer.html" } },
    { label: "Closure Scenarios", keywords: "closure scenario consolidation student reassignment", page: "any", action: { type: "nav", href: "closure-scenarios.html" } },
  ];
  NAV.forEach(function (n) {
    INDEX.push({ label: n.label, keywords: n.label + " " + n.keywords, category: "Navigation", action: n.action });
  });

  // --- Process Steps (index.html) ---
  [
    { label: "Step 1: Understand School-level Data", step: 1, keywords: "step 1 school data table iso articulation" },
    { label: "Step 2: Explore the Interactive Map", step: 2, keywords: "step 2 map explore interactive" },
    { label: "Step 3: Strategic Sorting", step: 3, keywords: "step 3 strategic sorting decision logic flows" },
    { label: "Step 4: Prioritize within Strategy Groups", step: 4, keywords: "step 4 prioritize prioritization strategy groups weights" },
  ].forEach(function (s) {
    INDEX.push({ label: s.label, keywords: s.label + " " + s.keywords, category: "Process Steps", action: { type: "step", step: s.step } });
  });

  // --- Dashboard Sections ---
  [
    { label: "How to Use", id: null, keywords: "how to use guide help intro", parentStep: 3 },
    { label: "Strategic Sorting", id: "decision-input-panel", keywords: "strategic sorting decision routing thresholds", parentStep: 3 },
    { label: "Prioritization within Strategy Sorting", id: "scenario-input-panel", keywords: "prioritization strategy sorting weights", parentStep: 4 },
    { label: "Prioritization Weights", id: "prioritizationWeightsDetails", keywords: "prioritization weights sliders criteria metrics", parentStep: 4 },
    { label: "Map Filters", id: "filter-panel", keywords: "map filters enrollment seats capacity school type articulation", parentStep: 2 },
    { label: "School Matches", id: "nearbySchoolsSection", keywords: "school matches nearby distance welcoming", parentStep: 2 },
    { label: "Map Layers", id: "mapLayersFloating", keywords: "map layers overlay articulation area toggle", parentStep: 2 },
  ].forEach(function (s) {
    INDEX.push({ label: s.label, keywords: s.label + " " + s.keywords, category: "Dashboard Sections", action: { type: "section", id: s.id, parentStep: s.parentStep } });
  });

  // --- Decision Flows ---
  [
    { label: "Flow 1: Decision Routing", keywords: "flow 1 decision routing enrollment utilization growth distance underutilized", parentId: "decision-input-panel", flowIndex: 0 },
    { label: "Flow 2: Expansion", keywords: "flow 2 expansion attendance area building score educational adequacy", parentId: "decision-input-panel", flowIndex: 1 },
    { label: "Flow 3: Maintenance/Investment", keywords: "flow 3 maintenance investment building score above below", parentId: "decision-input-panel", flowIndex: 2 },
    { label: "Flow 4: Closure/Consolidation", keywords: "flow 4 closure consolidation building score distance welcoming", parentId: "decision-input-panel", flowIndex: 3 },
  ].forEach(function (f) {
    INDEX.push({ label: f.label, keywords: f.label + " " + f.keywords, category: "Decision Flows", action: { type: "flow", parentId: f.parentId, flowIndex: f.flowIndex } });
  });

  // --- Results Tabs ---
  [
    { label: "Summary Table", tabId: "summary-tab", keywords: "summary table results count decision" },
    { label: "Decision by School", tabId: "decision-tab", keywords: "decision by school results table export csv" },
    { label: "Impact Analysis", tabId: "impact-tab", keywords: "impact analysis strategy candidate groups prioritized" },
  ].forEach(function (t) {
    INDEX.push({ label: t.label, keywords: t.label + " " + t.keywords, category: "Results Tabs", action: { type: "tab", tabId: t.tabId } });
  });

  // --- Settings / Controls ---
  [
    { label: "Elementary Enrollment Threshold", sliderId: "elementaryEnrollmentSlider", keywords: "elementary enrollment threshold slider", flow: 0, parentId: "decision-input-panel" },
    { label: "K-8 Enrollment Threshold", sliderId: "k8EnrollmentSlider", keywords: "k8 enrollment threshold slider", flow: 0, parentId: "decision-input-panel" },
    { label: "Middle School Enrollment Threshold", sliderId: "middleEnrollmentSlider", keywords: "middle enrollment threshold slider", flow: 0, parentId: "decision-input-panel" },
    { label: "High School Enrollment Threshold", sliderId: "highEnrollmentSlider", keywords: "high enrollment threshold slider", flow: 0, parentId: "decision-input-panel" },
    { label: "K-12 Enrollment Threshold", sliderId: "k12EnrollmentSlider", keywords: "k12 enrollment threshold slider", flow: 0, parentId: "decision-input-panel" },
    { label: "Current Utilization Threshold", sliderId: "utilSlider", keywords: "utilization threshold slider current", flow: 0, parentId: "decision-input-panel" },
    { label: "High Utilization Threshold", sliderId: "utilHighSlider", keywords: "high utilization threshold slider", flow: 0, parentId: "decision-input-panel" },
    { label: "Enrollment Growth Threshold", sliderId: "growthSlider", keywords: "enrollment growth threshold slider", flow: 0, parentId: "decision-input-panel" },
    { label: "Attendance Area Enrollment", sliderId: "attendanceAreaEnrollmentSlider", keywords: "attendance area enrollment threshold", flow: 1, parentId: "decision-input-panel" },
    { label: "Composite Building Score (Flow 2)", sliderId: "buildSlider", keywords: "building score composite flow 2 expansion", flow: 1, parentId: "decision-input-panel" },
    { label: "Educational Adequacy", sliderId: "progSlider", keywords: "educational adequacy program threshold", flow: 1, parentId: "decision-input-panel" },
    { label: "Building Score Above Threshold", sliderId: "buildAboveSlider", keywords: "building score above maintenance investment", flow: 2, parentId: "decision-input-panel" },
    { label: "Building Score Below Threshold", sliderId: "buildBelowSlider", keywords: "building score below maintenance investment", flow: 2, parentId: "decision-input-panel" },
    { label: "Building Score (Flow 4)", sliderId: "buildFlow4Slider", keywords: "building score closure consolidation flow 4", flow: 3, parentId: "decision-input-panel" },
  ].forEach(function (s) {
    INDEX.push({ label: s.label, keywords: s.label + " " + s.keywords, category: "Settings", action: { type: "slider", sliderId: s.sliderId, flow: s.flow, parentId: s.parentId } });
  });

  // --- Data & Logic Tabs ---
  [
    { label: "Overview (Data & Logic)", tabName: "overview", keywords: "overview data logic documentation" },
    { label: "Decision Categories", tabName: "decision-categories", keywords: "decision categories strategy groups logic explanation" },
    { label: "School Profile Logic", tabName: "school-profile-logic", keywords: "school profile logic project list fci" },
    { label: "Closure Scenarios Logic", tabName: "closure-scenarios-logic", keywords: "closure scenarios logic student reassignment" },
    { label: "Data Sources", tabName: "data-sources", keywords: "data sources csv files decision export map" },
  ].forEach(function (t) {
    INDEX.push({ label: t.label, keywords: t.label + " " + t.keywords, category: "Data & Logic", action: { type: "data-viewer-tab", tabName: t.tabName } });
  });

  // --- Dynamic school entries (populated after CSV loads) ---
  window.globalSearchRegisterSchools = function (schoolNames) {
    // Remove old school entries
    INDEX = INDEX.filter(function (e) { return e.category !== "Schools"; });
    var seen = {};
    schoolNames.forEach(function (name) {
      if (!name || seen[name.toLowerCase()]) return;
      seen[name.toLowerCase()] = true;
      INDEX.push({ label: name, keywords: name, category: "Schools", action: { type: "school", name: name } });
    });
  };

  // ---------------------------------------------------------------------------
  // Search logic
  // ---------------------------------------------------------------------------
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

      // Scoring: prefer label matches over keyword-only matches
      if (labelLow === q) score += 100;
      else if (labelLow.indexOf(q) === 0) score += 50;
      else if (labelLow.indexOf(q) !== -1) score += 30;
      else score += 10;

      // Boost non-school results slightly so navigation/sections appear before school list
      if (entry.category !== "Schools") score += 5;

      scored.push({ entry: entry, score: score });
    });

    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.map(function (s) { return s.entry; });
  }

  // ---------------------------------------------------------------------------
  // Category ordering & icons
  // ---------------------------------------------------------------------------
  var CATEGORY_ORDER = ["Navigation", "Process Steps", "Dashboard Sections", "Decision Flows", "Results Tabs", "Settings", "Data & Logic", "Schools"];
  var CATEGORY_ICONS = {
    "Navigation": "\u2192",       // →
    "Process Steps": "\u25B6",    // ▶
    "Dashboard Sections": "\u25A0", // ■
    "Decision Flows": "\u2935",   // ⤵
    "Results Tabs": "\u2630",     // ☰
    "Settings": "\u2699",         // ⚙
    "Data & Logic": "\u2139",     // ℹ
    "Schools": "\uD83C\uDFEB"     // 🏫
  };

  // ---------------------------------------------------------------------------
  // Render results
  // ---------------------------------------------------------------------------
  function renderResults(results, container, query) {
    container.innerHTML = "";
    if (!results.length) {
      container.innerHTML = '<div class="gs-empty">No results found</div>';
      return;
    }

    // Group by category
    var groups = {};
    results.forEach(function (r) {
      if (!groups[r.category]) groups[r.category] = [];
      groups[r.category].push(r);
    });

    // Limit schools to 10
    if (groups["Schools"] && groups["Schools"].length > 10) {
      groups["Schools"] = groups["Schools"].slice(0, 10);
    }

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

        // Highlight matching text
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

  // ---------------------------------------------------------------------------
  // Execute navigation action
  // ---------------------------------------------------------------------------
  function executeAction(action) {
    switch (action.type) {
      case "nav":
        navigateToPage(action.href);
        break;

      case "step":
        if (PAGE === "index") {
          if (window._goToStep) window._goToStep(action.step);
        } else {
          navigateToPage("index.html#gs-step=" + action.step);
        }
        break;

      case "section":
        if (PAGE === "index") {
          if (action.parentStep && window._goToStep) window._goToStep(action.parentStep);
          setTimeout(function () { openAndScroll(action.id); }, 200);
        } else {
          navigateToPage("index.html#gs-section=" + (action.id || ""));
        }
        break;

      case "flow":
        if (PAGE === "index") {
          if (window._goToStep) window._goToStep(3);
          setTimeout(function () {
            var parent = document.getElementById(action.parentId);
            if (parent && !parent.open) parent.open = true;
            setTimeout(function () {
              var flows = parent ? parent.querySelectorAll("details.flow-section") : [];
              if (flows[action.flowIndex]) {
                flows[action.flowIndex].open = true;
                flows[action.flowIndex].scrollIntoView({ behavior: "smooth", block: "center" });
              }
            }, 150);
          }, 200);
        } else {
          navigateToPage("index.html#gs-flow=" + action.flowIndex);
        }
        break;

      case "tab":
        if (PAGE === "index") {
          if (window._goToStep) window._goToStep(action.tabId === "impact-tab" ? 4 : 3);
          setTimeout(function () {
            if (window._activateBottomTab) window._activateBottomTab(action.tabId);
            var panel = document.getElementById("map-sidebar");
            if (panel) {
              panel.classList.remove("hidden");
              document.body.classList.remove("right-sidebar-collapsed");
            }
          }, 200);
        } else {
          navigateToPage("index.html#gs-tab=" + action.tabId);
        }
        break;

      case "slider":
        if (PAGE === "index") {
          if (window._goToStep) window._goToStep(3);
          setTimeout(function () {
            var parent = document.getElementById(action.parentId);
            if (parent && !parent.open) parent.open = true;
            setTimeout(function () {
              var flows = parent ? parent.querySelectorAll("details.flow-section") : [];
              if (flows[action.flow]) {
                flows[action.flow].open = true;
                var el = document.getElementById(action.sliderId);
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                  el.focus();
                  el.style.outline = "2px solid #007cbf";
                  setTimeout(function () { el.style.outline = ""; }, 2000);
                }
              }
            }, 150);
          }, 200);
        } else {
          navigateToPage("index.html#gs-slider=" + action.sliderId);
        }
        break;

      case "data-viewer-tab":
        if (PAGE === "data-viewer") {
          if (typeof window.showTab === "function") window.showTab(action.tabName);
        } else {
          navigateToPage("data-viewer.html#gs-dvtab=" + action.tabName);
        }
        break;

      case "school":
        if (PAGE === "index") {
          selectSchoolOnMap(action.name);
        } else if (PAGE === "school-profile") {
          selectSchoolOnProfile(action.name);
        } else {
          navigateToPage("index.html#gs-school=" + encodeURIComponent(action.name));
        }
        break;
    }
  }

  function navigateToPage(href) {
    // If same page, just handle the hash
    var base = href.split("#")[0];
    var currentBase = location.pathname.split("/").pop();
    if (base === currentBase || (!base && location.hash)) {
      location.hash = href.split("#")[1] || "";
      handleHashRouting();
      return;
    }
    location.href = href;
  }

  function openAndScroll(id) {
    if (!id) return;
    var el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === "DETAILS" && !el.open) el.open = true;
    // Also open parent details
    var parent = el.closest("details");
    if (parent && !parent.open) parent.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function selectSchoolOnMap(name) {
    if (!window.map || !window.map.getSource) {
      navigateToPage("school-profile.html?school=" + encodeURIComponent(name));
      return;
    }
    try {
      var features = window.map.querySourceFeatures("schools-source", {
        filter: ["==", ["get", "Building Name"], name]
      });
      if (!features.length) {
        // Try rendered features across all layers
        features = window.map.queryRenderedFeatures(undefined, {
          layers: ["schools-layer"],
          filter: ["==", ["get", "Building Name"], name]
        });
      }
      if (features.length) {
        var coords = features[0].geometry.coordinates;
        window.map.flyTo({ center: coords, zoom: 14 });
        // Set as selected origin
        window.currentSelectedSchoolName = name;
        window.currentOriginName = name;
        if (typeof window.updateFlowForSchool === "function") {
          window.updateFlowForSchool(name, window.thresholds || {});
        }
        if (typeof window.showOnMapFromFlowchart === "function") {
          window.showOnMapFromFlowchart(name);
        }
        return;
      }
    } catch (e) { /* ignore query errors */ }
    navigateToPage("school-profile.html?school=" + encodeURIComponent(name));
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

  // ---------------------------------------------------------------------------
  // Hash routing (on page load)
  // ---------------------------------------------------------------------------
  function handleHashRouting() {
    var hash = location.hash;
    if (!hash || hash.indexOf("gs-") === -1) return;

    // Clear hash so it doesn't persist
    var params = hash.substring(1);
    history.replaceState(null, "", location.pathname + location.search);

    if (params.indexOf("gs-step=") === 0) {
      var step = parseInt(params.split("=")[1], 10);
      waitFor(function () { return !!window._goToStep; }, function () { window._goToStep(step); });
    } else if (params.indexOf("gs-section=") === 0) {
      var id = params.split("=")[1];
      waitFor(function () { return !!document.getElementById(id); }, function () { openAndScroll(id); });
    } else if (params.indexOf("gs-flow=") === 0) {
      var flowIdx = parseInt(params.split("=")[1], 10);
      waitFor(function () { return !!window._goToStep; }, function () {
        window._goToStep(3);
        setTimeout(function () {
          var parent = document.getElementById("decision-input-panel");
          if (parent && !parent.open) parent.open = true;
          setTimeout(function () {
            var flows = parent ? parent.querySelectorAll("details.flow-section") : [];
            if (flows[flowIdx]) {
              flows[flowIdx].open = true;
              flows[flowIdx].scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }, 150);
        }, 200);
      });
    } else if (params.indexOf("gs-tab=") === 0) {
      var tabId = params.split("=")[1];
      waitFor(function () { return !!window._activateBottomTab; }, function () {
        if (window._goToStep) window._goToStep(tabId === "impact-tab" ? 4 : 3);
        setTimeout(function () { window._activateBottomTab(tabId); }, 200);
      });
    } else if (params.indexOf("gs-slider=") === 0) {
      var sliderId = params.split("=")[1];
      waitFor(function () { return !!document.getElementById(sliderId); }, function () {
        window._goToStep(3);
        setTimeout(function () {
          var el = document.getElementById(sliderId);
          if (el) {
            // Open parent details chain
            var d = el.closest("details");
            while (d) { d.open = true; d = d.parentElement ? d.parentElement.closest("details") : null; }
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.focus();
            el.style.outline = "2px solid #007cbf";
            setTimeout(function () { el.style.outline = ""; }, 2000);
          }
        }, 300);
      });
    } else if (params.indexOf("gs-dvtab=") === 0) {
      var tabName = params.split("=")[1];
      waitFor(function () { return typeof window.showTab === "function"; }, function () { window.showTab(tabName); });
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
    }
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

  // ---------------------------------------------------------------------------
  // UI: Inject styles
  // ---------------------------------------------------------------------------
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
    "  width: 340px; max-height: 420px; overflow-y: auto;",
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
    "  .global-search-results { width: 280px; }",
    "}",
  ].join("\n");

  var styleEl = document.createElement("style");
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  // ---------------------------------------------------------------------------
  // UI: Inject search bar HTML
  // ---------------------------------------------------------------------------
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

    // Find the right container depending on page
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

  // ---------------------------------------------------------------------------
  // UI: Wire up events
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------------
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { init(); handleHashRouting(); });
  } else {
    init();
    handleHashRouting();
  }

})();
