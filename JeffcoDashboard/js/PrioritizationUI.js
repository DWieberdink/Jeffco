// ✅ PrioritizationUI.js (clean rebuild)
// Handles UI for strategy group prioritization (Strategy Candidate Groups + subgroups)

window.prioritizationUI = {
  currentStrategyGroups: [],
  schoolDataWithDecisions: [],
  currentOutcomeFilters: null,
  // Per-group outcome filters for Step 2 (used by the group flyout ▸ menus).
  // Example:
  //   {
  //     "__ALL_EXP_MAINT__": ["Building Addition", ...],
  //     "Closure/Consolidation": ["Closure (Goes to Welcoming School)"]
  //   }
  outcomeFiltersByGroup: {},
  _prioritizedTableSyncHandler: null,
  // Step 2 table metric columns display mode:
  // - "values": show underlying raw values (%, mi, counts, etc.)
  // - "scores": show normalized 0–100 indices used for weighting (does NOT change ranking)
  metricDisplayMode: "values",
  _outcomeFlyoutStyleInjected: false,
  // Strategy Prioritization table: optional columns (on by default; persisted in localStorage)
  impactTableShowProjectType: true,
  impactTableShowStrategyGroup: true,

  _loadImpactTableColumnPrefs: function () {
    // Both columns default ON. Bumped key suffix ignores older prefs that had them off.
    try {
      var p = localStorage.getItem("jeffco_impact_col_project_v2");
      var s = localStorage.getItem("jeffco_impact_col_strategy_v2");
      this.impactTableShowProjectType = p !== "0";
      this.impactTableShowStrategyGroup = s !== "0";
    } catch (e) {
      this.impactTableShowProjectType = true;
      this.impactTableShowStrategyGroup = true;
    }
  },

  _saveImpactTableColumnPrefs: function () {
    try {
      localStorage.setItem("jeffco_impact_col_project_v2", this.impactTableShowProjectType ? "1" : "0");
      localStorage.setItem("jeffco_impact_col_strategy_v2", this.impactTableShowStrategyGroup ? "1" : "0");
    } catch (e) {}
  },

  /** Same value as Decision by School “Project Type” column (decision / outcome string). */
  getProjectTypeLabelForRow: function (row) {
    if (!row) return "Unknown";
    var d =
      row.decision != null && String(row.decision).trim() !== ""
        ? row.decision
        : row["Decision Type"] || row.outcome || row.strategyOutcome;
    var t = d != null ? String(d).trim() : "";
    return t || "Unknown";
  },

  _escapeHtml: function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  },

  _impactColGroupsCombined: function () {
    var groupNames =
      this.currentStrategyGroups && this.currentStrategyGroups.length
        ? this.currentStrategyGroups
        : ["__ALL__"];
    return (
      groupNames.length > 1 ||
      groupNames.includes("__ALL_EXP_MAINT__") ||
      groupNames.includes("__ALL__")
    );
  },

  _refreshImpactTableAfterColToggle: function () {
    var groupNames =
      this.currentStrategyGroups && this.currentStrategyGroups.length
        ? this.currentStrategyGroups
        : ["__ALL__"];
    this.renderPrioritizedSchools(groupNames);
    this.updateMapVisualization(groupNames);
  },

  exportPrioritizedSchoolsCsv: function () {
    var container = document.getElementById("prioritized-schools-table-container");
    if (!container) return;
    var table = container.querySelector("table.ps-prioritized-table");
    if (!table) return;
    if (typeof window.exportDomTableToCsv === "function") {
      window.exportDomTableToCsv(table, "Strategy_Prioritization");
    }
  },

  /** Sync Strategy Prioritization table column toggles in the bottom panel tab bar. */
  syncImpactTableColumnTogglesUi: function (isCombined) {
    var proj = document.getElementById("impact-col-project-type");
    var strat = document.getElementById("impact-col-strategy-group");
    var showProject = this.impactTableShowProjectType !== false;
    var showStrategy = this.impactTableShowStrategyGroup !== false;
    if (proj) {
      proj.classList.toggle("active", showProject);
      proj.setAttribute("aria-pressed", showProject ? "true" : "false");
    }
    if (strat) {
      strat.classList.toggle("active", showStrategy);
      strat.setAttribute("aria-pressed", showStrategy ? "true" : "false");
      strat.hidden = !isCombined;
    }
  },

  wireImpactTableColumnToggles: function () {
    if (this._impactColTogglesWired) return;
    this._impactColTogglesWired = true;
    var self = this;
    var proj = document.getElementById("impact-col-project-type");
    var strat = document.getElementById("impact-col-strategy-group");
    if (proj) {
      proj.addEventListener("click", function () {
        self.impactTableShowProjectType = !self.impactTableShowProjectType;
        self._saveImpactTableColumnPrefs();
        self.syncImpactTableColumnTogglesUi(self._impactColGroupsCombined());
        self._refreshImpactTableAfterColToggle();
      });
    }
    if (strat) {
      strat.addEventListener("click", function () {
        self.impactTableShowStrategyGroup = !self.impactTableShowStrategyGroup;
        self._saveImpactTableColumnPrefs();
        self.syncImpactTableColumnTogglesUi(self._impactColGroupsCombined());
        self._refreshImpactTableAfterColToggle();
      });
    }
  },

  // Initialize the prioritization UI
  initialize: function (schoolDataWithDecisions) {
    console.log("🎨 Initializing Prioritization UI");
    this._loadImpactTableColumnPrefs();
    this.schoolDataWithDecisions = schoolDataWithDecisions || [];
    this.currentOutcomeFilters = null;
    this.outcomeFiltersByGroup = {};

    if (!window.prioritizationLogic || !window.prioritizationLogic.initialize) {
      console.error("❌ prioritizationLogic is not available");
      return this;
    }

    // Initialize prioritization logic with school data
    window.prioritizationLogic.initialize(this.schoolDataWithDecisions);

    // Render strategy group tabs
    this.renderStrategyGroupTabs();

    // Set up event listeners (currently a placeholder)
    this.setupEventListeners();

    return this;
  },

  // Render main strategy group selector (multi-select dropdown with checkboxes, like School Type)
  // Groups are now always shown combined; Strategy Group and School filter columns in the table are used to filter.
  renderStrategyGroupTabs: function () {
    const tabsContainer = document.getElementById("strategy-group-tabs");
    if (!tabsContainer) {
      console.warn("⚠️ Strategy group tabs container not found");
      return;
    }

    tabsContainer.innerHTML = "";
    tabsContainer.style.display = "none";

    if (!window.prioritizationLogic || !window.prioritizationLogic.getAvailableStrategyGroups) {
      console.warn("⚠️ prioritizationLogic.getAvailableStrategyGroups not available");
      return;
    }

    this.currentStrategyGroups = ["__ALL__"];
    this.selectStrategyGroup(["__ALL__"]);
  },

  // Select strategy group(s)
  selectStrategyGroup: function (groupNames) {
    const namesArrayRaw = Array.isArray(groupNames) ? groupNames : [groupNames].filter(Boolean);
    const namesArray = namesArrayRaw.filter((n) => n !== "Other");
    this.currentStrategyGroups = namesArray.length ? namesArray : ["__ALL__"];
    if (window.prioritizationLogic && window.prioritizationLogic.persistStrategyScope) {
      window.prioritizationLogic.persistStrategyScope(this.currentStrategyGroups);
    }
    // NOTE: Do not always reset outcome filters here; the integrated dropdown controls them.
    // We only clear them when group selection changes (handled in renderStrategyGroupTabs).

    // Sync dropdown selection if present
    const selectEl = document.getElementById("strategy-group-select");
    if (selectEl) {
      Array.from(selectEl.options).forEach((opt) => {
        opt.selected = namesArray.includes(opt.value);
      });
    }

    // Show prioritization weights section
    const weightsSection = document.getElementById("prioritization-weights-section");
    if (weightsSection) {
      weightsSection.style.display = "block";
    }

    // If the legacy subgroup dropdown exists from a prior build, clear it
    // (outcome filtering is now integrated into the main dropdown).
    const legacySubgroup = document.getElementById("strategy-subgroup-tabs");
    if (legacySubgroup) legacySubgroup.innerHTML = "";

    // Render sliders for this group set (uses first selection as base)
    this.renderWeightSliders(namesArray);

    // Render prioritized schools + map
    this.renderPrioritizedSchools(namesArray);
    this.updateMapVisualization(namesArray);
  },

  // Build slider configuration metadata (keys + labels) for a given group
  getSliderConfigs: function (baseGroupName) {
    var sliderConfigs = [];

    if (baseGroupName === "Closure/Consolidation") {
      // Closure/Consolidation framing
      sliderConfigs.push(
        { key: "enrollment", label: "Lower Enrollment", description: "" },
        { key: "utilizationRate", label: "Lower Utilization", description: "" },
        {
          key: "studentsInAttendanceArea",
          label: "Lower % of Students from Attendance Area",
          description: ""
        },
        {
          key: "studentEconomicStatus",
          label: "Lower % High-Need Student Enrollment",
          description: ""
        },
        { key: "buildingCondition", label: "Lower Composite Building Score", description: "" },
        { key: "academicPerformance", label: "Lower Educational Adequacy (EA)", description: "" },
        { key: "pastInvestments", label: "Fewer Past Investments", description: "" },
        { key: "specialtyProgramOfferings", label: "Specialty Program Offerings", description: "" }
      );
    } else {
      // Expansion, Maintenance/Investment, Other framing
      sliderConfigs.push(
        { key: "buildingCondition", label: "Lower Composite Building Score", description: "" },
        { key: "academicPerformance", label: "Lower Educational Adequacy (EA)", description: "" },
        { key: "utilizationRate", label: "Higher Utilization", description: "" },
        { key: "enrollment", label: "Higher Enrollment", description: "" },
        {
          key: "studentEconomicStatus",
          label: "Higher Enrollment of High-Need Students",
          description: ""
        },
        {
          key: "studentsInAttendanceArea",
          label: "Greater Neighborhood Capture Rate",
          description: ""
        },
        {
          key: "welcomedStudents",
          label: "More Students Welcomed from Previous Consolidations",
          description: ""
        },
        {
          key: "distanceFromOtherSchools",
          label: "Greater Distance from Other Schools",
          description: ""
        }
      );
    }

    return sliderConfigs;
  },

  // Map UI slider keys to the internal weight keys used by PrioritizationLogic.calculatePriorityScore
  // (The UI labels are friendlier aliases of the underlying dimensions.)
  mapUiKeyToWeightKey: function (uiKey) {
    switch (uiKey) {
      case "academicPerformance":
        return "educationalAdequacy";
      case "studentEconomicStatus":
        return "highNeedStudents";
      case "studentsInAttendanceArea":
        return "neighborhoodCapture";
      case "specialtyProgramOfferings":
        return "specialtyPrograms";
      default:
        return uiKey;
    }
  },

  mapWeightKeyToUiKey: function (weightKey) {
    switch (weightKey) {
      case "educationalAdequacy":
        return "academicPerformance";
      case "highNeedStudents":
        return "studentEconomicStatus";
      case "neighborhoodCapture":
        return "studentsInAttendanceArea";
      case "specialtyPrograms":
        return "specialtyProgramOfferings";
      default:
        return weightKey;
    }
  },

  getRankedPrioritizedSchools: function (strategyGroupNames) {
    if (!window.prioritizationLogic) return [];
    const groupNames = Array.isArray(strategyGroupNames)
      ? strategyGroupNames
      : [strategyGroupNames].filter(Boolean);
    const outcomeFiltersByGroup = this.outcomeFiltersByGroup || {};

    const resolveGroups = function (names) {
      if (names.includes("__ALL__")) return ["Expansion", "Maintenance/Investment", "Closure/Consolidation"];
      if (names.includes("__ALL_EXP_MAINT__")) return ["Expansion", "Maintenance/Investment"];
      return names;
    };

    const groupsToUse = resolveGroups(groupNames.length ? groupNames : ["Expansion"]);
    const isCombined = groupsToUse.length > 1;
    const baseGroupName = groupsToUse[0] || "Expansion";

    let rankedSchools = isCombined
      ? window.prioritizationLogic.rankSchoolsAcrossStrategies(groupsToUse, null)
      : window.prioritizationLogic.rankSchools(baseGroupName, null);

    // Publish before outcome filtering so the School Profile sees every ranked school.
    if (typeof window.prioritizationLogic.publishScores === "function") {
      window.prioritizationLogic.publishScores(rankedSchools);
    }

    const allGroupsForCombined = ["Expansion", "Maintenance/Investment", "Closure/Consolidation"];
    if (rankedSchools && rankedSchools.length) {
      rankedSchools = rankedSchools.filter(function (s) {
        const outcomeName = s.decision || s.outcome || s.strategyOutcome;
        const sg = s.strategyGroup || baseGroupName;

        const combinedKey = groupNames.includes("__ALL__") ? "__ALL__" : "__ALL_EXP_MAINT__";
        const combinedSelected = Array.isArray(outcomeFiltersByGroup[combinedKey])
          ? outcomeFiltersByGroup[combinedKey]
          : null;
        const specificSelected = Array.isArray(outcomeFiltersByGroup[sg])
          ? outcomeFiltersByGroup[sg]
          : null;
        const groupsInCombined = groupNames.includes("__ALL__")
          ? allGroupsForCombined
          : ["Expansion", "Maintenance/Investment"];
        const selected =
          specificSelected ||
          (combinedSelected && groupsInCombined.includes(sg) ? combinedSelected : null);
        if (!selected || !selected.length) return true;
        return selected.includes(outcomeName);
      });
    }

    return rankedSchools || [];
  },

  convertMetricRangeFilter: function (sel, schools, uiKey, fromMode, toMode) {
    if (!sel || sel.type !== "range" || fromMode === toMode) return sel;
    if (!schools || !schools.length) return null;

    const matching = schools.filter(function (school) {
      const v = window.prioritizationUI.getMetricNumericValue(uiKey, school, fromMode);
      return !isNaN(v) && v >= sel.min - 1e-9 && v <= sel.max + 1e-9;
    });

    if (!matching.length) return null;

    const targetValues = matching
      .map(function (school) {
        return window.prioritizationUI.getMetricNumericValue(uiKey, school, toMode);
      })
      .filter(function (v) {
        return !isNaN(v);
      });

    if (!targetValues.length) return null;

    return {
      type: "range",
      min: Math.min.apply(null, targetValues),
      max: Math.max.apply(null, targetValues),
      displayMode: toMode,
    };
  },

  convertPrioritizedMetricFiltersForDisplayMode: function (fromMode, toMode, strategyGroupNames) {
    if (fromMode === toMode) return;
    const filterState = window.__prioritizedSchoolsFilters;
    if (!filterState) return;

    const schools = this.getRankedPrioritizedSchools(strategyGroupNames);
    if (!schools.length) return;

    Object.keys(filterState).forEach(function (fk) {
      if (fk.indexOf("ps-m-") !== 0) return;
      const sel = filterState[fk];
      if (!sel || sel.type !== "range") return;

      const sourceMode = sel.displayMode || fromMode;
      if (sourceMode === toMode) return;

      const weightKey = fk.slice("ps-m-".length);
      const uiKey = window.prioritizationUI.mapWeightKeyToUiKey(weightKey);
      const converted = window.prioritizationUI.convertMetricRangeFilter(
        sel,
        schools,
        uiKey,
        sourceMode,
        toMode
      );
      filterState[fk] = converted;
    });
  },

  parsePrioritizedCellNumber: function (cell) {
    if (!cell) return NaN;
    const ds = cell.getAttribute("data-sort-value");
    if (ds !== null && ds !== "") {
      const parsed = parseFloat(ds);
      if (!isNaN(parsed)) return parsed;
    }
    const text = (cell.textContent || "").trim();
    if (!text || text === "N/A" || text === "(blank)") return NaN;
    const n = parseFloat(text.replace(/[^0-9.-]/g, ""));
    return isNaN(n) ? NaN : n;
  },

  getMetricNumericValue: function (uiKey, school, displayMode) {
    if (!school) return NaN;
    if (displayMode === "scores") {
      const weightKey = this.mapUiKeyToWeightKey(uiKey);
      const val = school.normalizedData ? school.normalizedData[weightKey] : null;
      if (val === null || val === undefined || isNaN(val)) return NaN;
      return Number(val);
    }
    const raw = school.rawData || {};
    switch (uiKey) {
      case "utilizationRate":
        return raw.utilizationRate != null ? Number(raw.utilizationRate) : NaN;
      case "studentsInAttendanceArea":
        return raw.studentsInAttendanceArea != null ? Number(raw.studentsInAttendanceArea) : NaN;
      case "studentEconomicStatus":
        return raw.studentEconomicStatus != null ? Number(raw.studentEconomicStatus) : NaN;
      case "buildingCondition":
        return raw.buildingCondition != null ? Number(raw.buildingCondition) : NaN;
      case "academicPerformance":
        return raw.academicPerformance != null ? Number(raw.academicPerformance) : NaN;
      case "enrollment":
        return raw.enrollment != null ? Number(raw.enrollment) : NaN;
      case "welcomedStudents":
        return raw.welcomedStudents != null ? Number(raw.welcomedStudents) : NaN;
      case "distanceFromOtherSchools":
        return raw.distanceFromOtherSchools != null ? Number(raw.distanceFromOtherSchools) : NaN;
      case "pastInvestments":
        return raw.pastInvestments != null ? Number(raw.pastInvestments) : NaN;
      case "specialtyProgramOfferings":
        return raw.specialtyPrograms != null ? Number(raw.specialtyPrograms) : NaN;
      default:
        return NaN;
    }
  },

  getColumnNumericBounds: function (tbody, colIndex) {
    const nums = [];
    if (!tbody) return { min: 0, max: 100 };
    tbody.querySelectorAll("tr[data-row]").forEach(function (tr) {
      const cell = tr.querySelector('td[data-filter="col-' + colIndex + '"]');
      const n = window.prioritizationUI.parsePrioritizedCellNumber(cell);
      if (!isNaN(n)) nums.push(n);
    });
    if (!nums.length) return { min: 0, max: 100 };
    return { min: Math.min.apply(null, nums), max: Math.max.apply(null, nums) };
  },

  getNumericFilterStep: function (min, max) {
    const span = Math.max(max - min, 0);
    if (span <= 1) return 0.01;
    if (span <= 20) return 0.1;
    if (span <= 200) return 1;
    return Math.max(1, Math.round(span / 200));
  },

  isPrioritizedFilterActive: function (sel, colType, bounds) {
    if (sel == null) return false;
    if (colType === "number" && sel && sel.type === "range") {
      if (!bounds) return true;
      return sel.min > bounds.min + 1e-9 || sel.max < bounds.max - 1e-9;
    }
    if (Array.isArray(sel)) return sel.length > 0;
    return false;
  },

  rowMatchesPrioritizedFilter: function (sel, colType, cell, bounds) {
    if (sel == null) return true;
    if (Array.isArray(sel) && sel.length === 0) return true;
    if (colType === "number" && sel && sel.type === "range") {
      const n = window.prioritizationUI.parsePrioritizedCellNumber(cell);
      if (isNaN(n)) return false;
      return n >= sel.min - 1e-9 && n <= sel.max + 1e-9;
    }
    const raw = (cell ? cell.textContent : "").trim();
    const val = raw || "(blank)";
    return Array.isArray(sel) ? sel.indexOf(val) >= 0 : true;
  },

  resetPrioritizedFilterDropdownPosition: function (dropdown) {
    if (!dropdown) return;
    dropdown.classList.remove("is-fixed", "is-ported");
    dropdown.style.top = "";
    dropdown.style.left = "";
    dropdown.style.visibility = "";
    dropdown.style.display = "";
    dropdown.style.width = "";
    dropdown.style.minWidth = "";
    dropdown.style.maxWidth = "";
  },

  positionPrioritizedFilterDropdown: function (dropdown, anchorEl) {
    if (!dropdown || !anchorEl) return;
    dropdown.classList.add("is-fixed");
    dropdown.style.visibility = "hidden";
    const rect = anchorEl.getBoundingClientRect();
    const ddWidth = dropdown.offsetWidth || 220;
    const ddHeight = dropdown.offsetHeight || 120;
    const margin = 4;
    let top = rect.bottom + margin;
    let left = rect.left;
    if (top + ddHeight > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - ddHeight - margin);
    }
    if (left + ddWidth > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - ddWidth - margin);
    }
    dropdown.style.top = top + "px";
    dropdown.style.left = left + "px";
    dropdown.style.visibility = "";
  },

  openPrioritizedFilterDropdown: function (dropdown, anchorEl, hostTh) {
    if (!dropdown || !anchorEl) return;
    if (hostTh && !dropdown._psPortalHost) dropdown._psPortalHost = hostTh;
    if (dropdown.parentNode !== document.body) {
      document.body.appendChild(dropdown);
    }
    dropdown.classList.add("is-open", "is-ported");
    this.positionPrioritizedFilterDropdown(dropdown, anchorEl);
  },

  repositionOpenPrioritizedFilterDropdowns: function () {
    const self = this;
    document.querySelectorAll(".ps-prioritized-filter-dropdown.is-open").forEach(function (dd) {
      const host = dd._psPortalHost;
      const anchor = host ? (host.querySelector(".filter-btn") || host) : null;
      if (anchor) self.positionPrioritizedFilterDropdown(dd, anchor);
    });
  },

  closePrioritizedFilterDropdowns: function () {
    const self = this;
    document.querySelectorAll(".ps-prioritized-filter-dropdown.is-open").forEach(function (d) {
      d.classList.remove("is-open");
      self.resetPrioritizedFilterDropdownPosition(d);
      if (d._psPortalHost && d.parentNode === document.body) {
        d._psPortalHost.appendChild(d);
      }
    });
  },

  getPrioritizedFilterDropdownForHeader: function (th) {
    if (!th) return null;
    const local = th.querySelector(".ps-prioritized-filter-dropdown");
    if (local) return local;
    const portaled = document.querySelectorAll(".ps-prioritized-filter-dropdown");
    for (let i = 0; i < portaled.length; i++) {
      if (portaled[i]._psPortalHost === th) return portaled[i];
    }
    return null;
  },

  buildPrioritizedHeaderCell: function (options) {
    const extraClass = options.extraClass || "";
    const title = (options.title || options.label || "").replace(/"/g, "&quot;");
    const label = options.label || "";
    const filterKey = options.filterKey;
    const colIndex = options.colIndex;
    const type = options.type || "string";
    return (
      '<th class="sortable-header filterable-header' + (extraClass ? " " + extraClass : "") + '"' +
      ' data-filter-key="' + filterKey + '"' +
      ' data-column="' + colIndex + '"' +
      ' data-type="' + type + '"' +
      ' title="' + title + '">' +
      '<span class="th-inner">' +
      '<span class="th-label">' + label + "</span></span>" +
      '<button type="button" class="filter-btn" aria-label="Filter column" title="Filter column">' +
      '<svg class="filter-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">' +
      '<path d="M2 2.5h12L9.5 9v4.5l-3-1.5V9L2 2.5z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>' +
      "</svg></button>" +
      '<button type="button" class="filter-clear-col" aria-label="Clear filter" title="Clear filter">×</button>' +
      '<div class="ps-prioritized-filter-dropdown filter-dropdown" role="menu" aria-hidden="true"></div>' +
      '<div class="column-resizer" data-col="' + colIndex + '"></div></th>'
    );
  },

  // Render weight sliders for a strategy group (left panel only)
  renderWeightSliders: function (strategyGroupNames) {
    const leftPanel = document.getElementById("left-panel-weight-sliders");

    const groupNames = Array.isArray(strategyGroupNames)
      ? strategyGroupNames
      : [strategyGroupNames].filter(Boolean);
    const primaryGroup =
      groupNames.find((g) => g !== "__ALL_EXP_MAINT__" && g !== "__ALL__") || "Expansion";
    const isCombined =
      groupNames.length > 1 || groupNames.includes("__ALL_EXP_MAINT__") || groupNames.includes("__ALL__");

    // For the combined view, use Expansion as the base profile for
    // reading current/default weights, but we will WRITE to BOTH
    // Expansion and Maintenance/Investment when sliders move.
    const baseGroupName = isCombined ? "Expansion" : primaryGroup;

    const weights =
      (window.prioritizationLogic.currentWeights &&
        window.prioritizationLogic.currentWeights[baseGroupName]) ||
      (window.prioritizationLogic.defaultWeights &&
        window.prioritizationLogic.defaultWeights[baseGroupName]) ||
      {};

    const enabledWeights =
      (window.prioritizationLogic.enabledWeights &&
        window.prioritizationLogic.enabledWeights[baseGroupName]) ||
      {};

    // Build slider configs
    const sliderConfigs = this.getSliderConfigs(baseGroupName);

    // Helper to generate slider HTML
    const createSliderHTML = function (config, internalValue, enabled) {
      const safeInternal =
        typeof internalValue === "number" && !isNaN(internalValue) ? internalValue : 0;
      const uiValue = safeInternal / 10; // 0–10 scale
      const displayValue = uiValue.toFixed(1).replace(/\.0$/, "");
      const checkedAttr = enabled ? " checked" : "";
      const disabledAttr = enabled ? "" : " disabled";
      const dimStyle = enabled ? "" : "opacity:0.55;";
      return (
        '<div style="margin-bottom: 1rem; ' +
        dimStyle +
        '">' +
        '<label style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem; gap: 8px;">' +
        '<span style="display:flex; align-items:center; gap:6px; font-weight: 500; font-size: 0.9em;">' +
        '<input type="checkbox" id="' +
        config.key +
        '-enabled" data-ui-key="' +
        config.key +
        '"' +
        checkedAttr +
        ' style="width:14px;height:14px; cursor:pointer;">' +
        "<span>" +
        config.label +
        "</span></span>" +
        '<span id="' +
        config.key +
        '-value" style="font-weight: 600; color: #dc2626; min-width: 3rem; text-align: right;">' +
        displayValue +
        "</span>" +
        "</label>" +
        '<div class="sleek-single-range">' +
        '<input type="range" class="sleek-single-range__input" id="' +
        config.key +
        '-slider" min="0" max="10" step="0.5" value="' +
        uiValue +
        '"' +
        disabledAttr +
        ' data-weight-key="' +
        config.key +
        '" data-strategy-group="' +
        primaryGroup +
        '">' +
        '</div>' +
        '<div style="font-size: 0.8em; color: #666; margin-top: 0.25rem;">' +
        config.description +
        "</div>" +
        "</div>"
      );
    };

    const self = this;
    var slidersHTML = "";
    sliderConfigs.forEach(function (config) {
      const weightKey = self.mapUiKeyToWeightKey(config.key);
      const internalValue =
        weights && typeof weights[weightKey] === "number" ? weights[weightKey] : 0;
      const enabled = enabledWeights[weightKey] !== false;
      slidersHTML += createSliderHTML(config, internalValue, enabled);
    });

    if (leftPanel) {
      leftPanel.innerHTML = slidersHTML;
      try {
        if (typeof window.upgradeToSleekSingleRange === 'function') {
          window.upgradeToSleekSingleRange(leftPanel);
        }
      } catch (_) {}
    }
    self.syncImpactTableColumnTogglesUi(isCombined);
    self.wireImpactTableColumnToggles();

    // Wire up slider change events
    sliderConfigs.forEach(function (config) {
      const slider = document.getElementById(config.key + "-slider");
      const valueDisplay = document.getElementById(config.key + "-value");
      const enabledCb = document.getElementById(config.key + "-enabled");
      if (!slider || !valueDisplay) return;

      const weightKey = self.mapUiKeyToWeightKey(config.key);

      slider.addEventListener("input", function (e) {
        const uiValue = parseFloat(e.target.value);
        const displayValue = isNaN(uiValue)
          ? "0"
          : uiValue.toFixed(1).replace(/\.0$/, "");
        valueDisplay.textContent = displayValue;

        const internalWeight = Math.round((isNaN(uiValue) ? 0 : uiValue) * 10); // 0–100
        const updates = {};
        updates[weightKey] = internalWeight;

        if (window.prioritizationLogic && window.prioritizationLogic.updateWeights) {
          // For combined view OR when adjusting either Expansion or
          // Maintenance/Investment directly, keep both groups in sync.
          const syncGroups =
            isCombined ||
            primaryGroup === "Expansion" ||
            primaryGroup === "Maintenance/Investment"
              ? ["Expansion", "Maintenance/Investment"]
              : [primaryGroup];

          syncGroups.forEach(function (gName) {
            window.prioritizationLogic.updateWeights(gName, updates);
          });
        }

        self.renderPrioritizedSchools(groupNames);
        self.updateMapVisualization(groupNames);
      });

      // Wire checkbox enable/disable
      if (enabledCb) {
        enabledCb.addEventListener("change", function () {
          const enabled = !!enabledCb.checked;
          // Toggle the slider enabled state without losing its value
          slider.disabled = !enabled;
          // Update enabled map in logic
          if (
            window.prioritizationLogic &&
            window.prioritizationLogic.updateEnabledWeights
          ) {
            const syncGroups =
              isCombined ||
              primaryGroup === "Expansion" ||
              primaryGroup === "Maintenance/Investment"
                ? ["Expansion", "Maintenance/Investment"]
                : [primaryGroup];
            const enabledMap = {};
            enabledMap[weightKey] = enabled;
            syncGroups.forEach(function (gName) {
              window.prioritizationLogic.updateEnabledWeights(gName, enabledMap);
            });
          }
          // Re-render so columns appear/disappear and scores update
          self.renderWeightSliders(groupNames);
          self.renderPrioritizedSchools(groupNames);
          self.updateMapVisualization(groupNames);
        });
      }
    });
  },

  // Render subcategory (decision outcome) selector within the current strategy group(s), styled like School Type dropdown
  renderSubgroupTabs: function (strategyGroupNames) {
    // Deprecated: outcome filtering is now handled via per-group ▸ flyouts in the main dropdown.
    // Keep this as a no-op to avoid rendering a second, confusing filter UI.
    const legacy = document.getElementById("strategy-subgroup-tabs");
    if (legacy) legacy.innerHTML = "";
    return;
    const section = document.getElementById("prioritized-schools-section");
    if (!section || !window.prioritizationLogic) return;

    const groupNames = Array.isArray(strategyGroupNames)
      ? strategyGroupNames
      : [strategyGroupNames].filter(Boolean);

    let container = document.getElementById("strategy-subgroup-tabs");
    const tableContainer = document.getElementById("prioritized-schools-table-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "strategy-subgroup-tabs";
      container.style.cssText = "margin-bottom:0.5rem;";
      if (tableContainer && tableContainer.parentNode === section) {
        section.insertBefore(container, tableContainer);
      } else {
        section.insertBefore(container, section.firstChild);
      }
    }

    const pl = window.prioritizationLogic;
    const resolveGroups = function (names) {
      if (names.includes("__ALL__")) return ["Expansion", "Maintenance/Investment", "Closure/Consolidation"];
      if (names.includes("__ALL_EXP_MAINT__")) return ["Expansion", "Maintenance/Investment"];
      return names;
    };

    const countMap = {};
    const orderedOutcomes = [];

    resolveGroups(groupNames.length ? groupNames : ["Expansion"]).forEach((gName) => {
      const list = pl.getOutcomeSummaryForStrategy(gName) || [];
      list.forEach((entry) => {
        const o = entry.outcome;
        const c = entry.count || 0;
        if (!countMap.hasOwnProperty(o)) {
          orderedOutcomes.push(o);
        }
        countMap[o] = (countMap[o] || 0) + c;
      });
    });

    const outcomes = orderedOutcomes.map((o) => ({ outcome: o, count: countMap[o] || 0 }));
    if (!outcomes || outcomes.length === 0) {
      container.innerHTML = "";
      return;
    }

    container.innerHTML = "";

    const self = this;

    const wrapper = document.createElement("div");
    wrapper.className = "filter-dropdown";
    wrapper.style.maxWidth = "260px";

    const toggleBtn = document.createElement("button");
    toggleBtn.id = "strategy-subgroup-toggle";
    toggleBtn.className = "compact-btn";
    toggleBtn.type = "button";
    toggleBtn.style.display = "flex";
    toggleBtn.style.alignItems = "center";
    toggleBtn.style.justifyContent = "space-between";
    toggleBtn.style.width = "100%";

    const labelSpan = document.createElement("span");
    labelSpan.id = "strategy-subgroup-label";
    labelSpan.textContent = "All outcomes";

    const chevron = document.createElement("span");
    chevron.className = "chevron";
    chevron.textContent = "▾";

    toggleBtn.appendChild(labelSpan);
    toggleBtn.appendChild(chevron);

    const menu = document.createElement("div");
    menu.id = "strategy-subgroup-menu";
    menu.className = "filter-dropdown-menu";

    const selectedOutcomes = Array.isArray(this.currentOutcomeFilters)
      ? this.currentOutcomeFilters
      : [];

    // Keep dropdown open when interacting inside
    menu.addEventListener("click", function (e) {
      e.stopPropagation();
    });

    const addOption = function (value, text) {
      const lbl = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = value;
      cb.checked = selectedOutcomes.length === 0 ? value === "" : selectedOutcomes.includes(value);
      cb.addEventListener("change", function () {
        let selected = Array.from(menu.querySelectorAll("input[type=checkbox]:checked")).map(
          (n) => n.value
        );
        // If "All" is checked, clear others
        if (this.value === "" && this.checked) {
          Array.from(menu.querySelectorAll('input[type=checkbox]')).forEach((n) => {
            if (n.value !== "") n.checked = false;
          });
          selected = [""];
        } else if (this.value !== "") {
          const allCb = menu.querySelector('input[value=""]');
          if (allCb) allCb.checked = false;
        }

        const filtered = selected.filter((v) => v !== "");
        self.currentOutcomeFilters = filtered.length ? filtered : null;
        self.renderSubgroupTabs(groupNames);
        self.renderPrioritizedSchools(groupNames);
        self.updateMapVisualization(groupNames);
      });
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(text));
      menu.appendChild(lbl);
    };

    addOption("", "All");
    outcomes.forEach(function (entry) {
      const outcome = entry.outcome;
      const count = entry.count;
      addOption(outcome, typeof count === "number" ? `${outcome} (${count})` : outcome);
    });

    const updateLabel = function () {
      const selected =
        Array.isArray(self.currentOutcomeFilters) && self.currentOutcomeFilters.length
          ? self.currentOutcomeFilters
          : [];
      if (!selected.length) {
        labelSpan.textContent = "All outcomes";
      } else if (selected.length === 1) {
        labelSpan.textContent = selected[0];
      } else {
        labelSpan.textContent = `${selected.length} outcomes`;
      }
    };
    updateLabel();

    toggleBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      menu.style.display = menu.style.display === "block" ? "none" : "block";
    });
    document.addEventListener("click", function () {
      if (menu) menu.style.display = "none";
    });

    wrapper.appendChild(toggleBtn);
    wrapper.appendChild(menu);
    container.appendChild(wrapper);
  },

  // Render prioritized schools table
  renderPrioritizedSchools: function (strategyGroupNames) {
    this.closePrioritizedFilterDropdowns();
    const container = document.getElementById("prioritized-schools-table-container");
    if (!container || !window.prioritizationLogic) return;

    const groupNames = Array.isArray(strategyGroupNames)
      ? strategyGroupNames
      : [strategyGroupNames].filter(Boolean);

    const rankedSchools = this.getRankedPrioritizedSchools(groupNames);

    const resolveGroups = function (names) {
      if (names.includes("__ALL__")) return ["Expansion", "Maintenance/Investment", "Closure/Consolidation"];
      if (names.includes("__ALL_EXP_MAINT__")) return ["Expansion", "Maintenance/Investment"];
      return names;
    };

    const groupsToUse = resolveGroups(groupNames.length ? groupNames : ["Expansion"]);
    const isCombined = groupsToUse.length > 1;
    const baseGroupName = groupsToUse[0] || "Expansion";

    if (!rankedSchools || rankedSchools.length === 0) {
      container.innerHTML =
        '<p style="text-align: center; color: #888; padding: 2rem;">No schools found for this strategy group.</p>';
      return;
    }

    const tableId = "prioritized-schools-table";
    const self = this;
    const sliderConfigsAll = this.getSliderConfigs(baseGroupName);
    const enabledWeights =
      (window.prioritizationLogic.enabledWeights &&
        window.prioritizationLogic.enabledWeights[isCombined ? "Expansion" : baseGroupName]) ||
      {};
    const sliderConfigs = sliderConfigsAll.filter(function (cfg) {
      const weightKey = self.mapUiKeyToWeightKey(cfg.key);
      return enabledWeights[weightKey] !== false;
    });
    let html = "";

    const showStrategyCol = isCombined && self.impactTableShowStrategyGroup !== false;
    const showProjectTypeCol = self.impactTableShowProjectType !== false;

    // Build column width model (match Decision by School look: % or px)
    const colWidths = [];
    colWidths.push("42px"); // Rank
    if (showStrategyCol) colWidths.push("12%");
    if (showProjectTypeCol) colWidths.push("14%");
    colWidths.push(showStrategyCol || showProjectTypeCol ? "18%" : "22%"); // School
    colWidths.push("52px"); // Score
    sliderConfigs.forEach(() => colWidths.push("86px")); // enabled metrics only

    const buildColGroupHTML = function () {
      return (
        "<colgroup>" +
        colWidths.map((w, i) => '<col data-col="' + i + '" style="width:' + w + '">').join("") +
        "</colgroup>"
      );
    };

    const displayMode = self.metricDisplayMode === "scores" ? "scores" : "values";

    html +=
      "<style>" +
      "#prioritized-schools-table-container { max-height: none !important; overflow: visible !important; }" +
      ".ps-prioritized-table-wrap { border: 1px solid #e5e5e5; border-radius: 6px; background: #fff; overflow: visible; }" +
      ".ps-prioritized-table-scroll { overflow: visible; }" +
      ".ps-prioritized-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 12px; }" +
      ".ps-prioritized-table thead th { position: sticky; top: 0; z-index: 10; background: #fef2f2; box-shadow: 0 1px 0 #e5e5e5; padding: 4px 4px; text-align: left; border: 1px solid #e5e5e5; font-size: 12px; font-weight: 600; white-space: normal; overflow: visible; text-overflow: unset; line-height: 1.25; vertical-align: bottom; }" +
      ".ps-prioritized-table tbody td { padding: 3px 4px; text-align: left; border: 1px solid #e5e5e5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }" +
      ".ps-prioritized-table tbody tr:hover { background: #f9f9f9; }" +
      ".ps-greyed td { color: inherit; }" +
      ".ps-prioritized-table a { color: #dc2626 !important; text-decoration: underline !important; font-weight: 600; }" +
      ".ps-metric-toggle { display:inline-flex; border:1px solid #d1d5db; border-radius:8px; overflow:hidden; background:#fff; }" +
      ".ps-metric-toggle button { border:0; background:transparent; padding:4px 10px; font-size:12px; cursor:pointer; color:#111; }" +
      ".ps-metric-toggle button.active { background:#dc2626; color:#fff; }" +
      ".ps-prioritized-table th { position: relative; }" +
      ".ps-prioritized-table .column-resizer { position: absolute; top: 0; right: 0; width: 6px; height: 100%; cursor: col-resize; background: transparent; z-index: 5; }" +
      ".ps-prioritized-table .column-resizer:hover { background: rgba(0, 124, 191, 0.15); }" +
      ".ps-prioritized-table .column-resizer.dragging { background: rgba(0, 124, 191, 0.3); }" +
      /* Filter + Sort controls */
      ".ps-prioritized-table .filterable-header .th-inner { display: block; width: 100%; min-width: 0; padding-right: 14px; padding-top: 14px; box-sizing: border-box; }" +
      ".ps-prioritized-table .th-label { display: block; white-space: normal; font-weight: 600; line-height: 1.25; }" +
      ".ps-prioritized-table .filter-btn { position: absolute; top: 2px; right: 8px; z-index: 2; display: inline-flex; width: 14px; height: 14px; padding: 0; border: none; border-radius: 2px; background: transparent; color: #9ca3af; cursor: pointer; align-items: center; justify-content: center; }" +
      ".ps-prioritized-table .filter-btn:hover { background: #f3f4f6; color: #374151; }" +
      ".ps-prioritized-table .filter-btn.filter-active { color: #dc2626; background: #fef2f2; }" +
      ".ps-prioritized-table .filter-clear-col { display: none; }" +
      ".ps-prioritized-table th.filterable-header { overflow: visible; }" +
      ".ps-prioritized-filter-dropdown { position: fixed; width: 220px; max-width: 280px; box-sizing: border-box; max-height: 320px; background: #fff; border: 1px solid #d1d5db; border-radius: 6px; box-shadow: 0 4px 16px rgba(0,0,0,0.18); padding: 8px 10px; overflow-y: auto; z-index: 100000; display: none; }" +
      ".ps-prioritized-filter-dropdown.is-open { display: block; }" +
      ".ps-prioritized-filter-dropdown .ps-filter-range { margin: 0; padding: 0; border: none; }" +
      ".ps-prioritized-filter-dropdown .ps-filter-range-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 6px; }" +
      ".ps-prioritized-filter-dropdown .ps-filter-range-title { font-size: 11px; font-weight: 600; color: #374151; }" +
      ".ps-prioritized-filter-dropdown .ps-filter-range-values { font-size: 11px; color: #6b7280; white-space: nowrap; }" +
      ".ps-prioritized-filter-dropdown .show-hide-dual-range { position: relative; width: 100%; height: 20px; margin: 0; box-sizing: border-box; }" +
      ".ps-prioritized-filter-dropdown .show-hide-dual-range::before { content: ''; position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); height: 2px; background: #e5e7eb; border-radius: 2px; z-index: 1; pointer-events: none; }" +
      ".ps-prioritized-filter-dropdown .show-hide-dual-range__input { position: absolute; top: 0; left: 0; width: 100%; height: 20px; margin: 0; padding: 0; border: none; background: transparent; pointer-events: none; -webkit-appearance: none; appearance: none; box-sizing: border-box; outline: none; box-shadow: none; -webkit-tap-highlight-color: transparent; }" +
      ".ps-prioritized-filter-dropdown .show-hide-dual-range__input:focus, .ps-prioritized-filter-dropdown .show-hide-dual-range__input:focus-visible, .ps-prioritized-filter-dropdown .show-hide-dual-range__input:active { outline: none; box-shadow: none; }" +
      ".ps-prioritized-filter-dropdown .show-hide-dual-range__input--min { z-index: 4; }" +
      ".ps-prioritized-filter-dropdown .show-hide-dual-range__input--max { z-index: 3; }" +
      ".ps-prioritized-filter-dropdown .show-hide-dual-range__input::-webkit-slider-runnable-track { height: 2px; background: transparent; border-radius: 2px; border: none; box-shadow: none; }" +
      ".ps-prioritized-filter-dropdown .show-hide-dual-range__input:focus::-webkit-slider-runnable-track, .ps-prioritized-filter-dropdown .show-hide-dual-range__input:active::-webkit-slider-runnable-track { background: transparent; box-shadow: none; }" +
      ".ps-prioritized-filter-dropdown .show-hide-dual-range__input::-webkit-slider-thumb { -webkit-appearance: none; pointer-events: auto; position: relative; width: 14px; height: 14px; border-radius: 50%; background: #fff; border: 2px solid #007cbf; margin-top: -7px; box-shadow: none; outline: none; }" +
      ".ps-prioritized-filter-dropdown .show-hide-dual-range__input:focus::-webkit-slider-thumb, .ps-prioritized-filter-dropdown .show-hide-dual-range__input:active::-webkit-slider-thumb, .ps-prioritized-filter-dropdown .show-hide-dual-range__input::-webkit-slider-thumb:focus, .ps-prioritized-filter-dropdown .show-hide-dual-range__input::-webkit-slider-thumb:active { box-shadow: none; outline: none; background: #fff; border: 2px solid #007cbf; }" +
      ".ps-prioritized-filter-dropdown .show-hide-dual-range__input::-moz-range-track { height: 2px; background: transparent; border-radius: 2px; border: none; box-shadow: none; }" +
      ".ps-prioritized-filter-dropdown .show-hide-dual-range__input::-moz-range-thumb { pointer-events: auto; position: relative; width: 14px; height: 14px; border-radius: 50%; background: #fff; border: 2px solid #007cbf; box-shadow: none; outline: none; }" +
      ".ps-prioritized-filter-dropdown .show-hide-dual-range__input:focus::-moz-range-thumb, .ps-prioritized-filter-dropdown .show-hide-dual-range__input:active::-moz-range-thumb { box-shadow: none; outline: none; background: #fff; border: 2px solid #007cbf; }" +
      ".ps-prioritized-filter-dropdown input[type='search'] { width: 100%; padding: 4px 6px; margin-bottom: 4px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px; box-sizing: border-box; }" +
      ".ps-prioritized-filter-dropdown label { display: flex; align-items: center; gap: 6px; padding: 0; margin: 0; font-size: 12px; cursor: pointer; line-height: 1.25; }" +
      ".ps-prioritized-filter-dropdown .filter-options { display: flex; flex-direction: column; gap: 0; }" +
      ".ps-prioritized-table tr.filter-hidden { display: none; }" +
      ".ps-prioritized-table th.sortable-header { cursor: pointer; }" +
      ".ps-prioritized-table th.sortable-header:hover { background: #eef2f7; }" +
      ".ps-prioritized-table th.sortable-header::after { content: ''; position: absolute; right: 3px; top: 50%; margin-top: -4px; border: 5px solid transparent; border-bottom-color: #9ca3af; border-top: none; opacity: 0.45; pointer-events: none; }" +
      ".ps-prioritized-table th.sortable-header.sort-asc::after { border-bottom-color: #007cbf; border-top: none; opacity: 1; }" +
      ".ps-prioritized-table th.sortable-header.sort-desc::after { border-top: 5px solid #007cbf; border-bottom: none; margin-top: -8px; opacity: 1; }" +
      "</style>";

    // Hidden buttons for tab-bar delegation (metric toggle + clear filters)
    html +=
      '<div style="display:none;">' +
      '<button type="button" id="psMetricModeValues" data-mode="values"' +
      (displayMode === "values" ? ' class="active"' : "") +
      ">Show values</button>" +
      '<button type="button" id="psMetricModeScores" data-mode="scores"' +
      (displayMode === "scores" ? ' class="active"' : "") +
      ">Show scores</button>" +
      '<button type="button" id="psClearAllFiltersBtn">Clear all filters</button>' +
      "</div>";

    // Single table with sticky header (match Decision by School look)
    html +=
      '<div class="ps-prioritized-table-wrap">' +
      '<div class="ps-prioritized-table-scroll">' +
      '<table id="' + tableId + '" class="ps-prioritized-table">' +
      buildColGroupHTML() +
      "<thead><tr>";

    var headCol = 0;
    html += self.buildPrioritizedHeaderCell({
      filterKey: "ps-rank",
      colIndex: headCol,
      type: "number",
      label: "Rank",
      extraClass: "text-center",
    });
    headCol++;

    if (showStrategyCol) {
      html += self.buildPrioritizedHeaderCell({
        filterKey: "ps-strategyGroup",
        colIndex: headCol,
        type: "string",
        label: "Strategy Group",
      });
      headCol++;
    }

    if (showProjectTypeCol) {
      html += self.buildPrioritizedHeaderCell({
        filterKey: "ps-projectType",
        colIndex: headCol,
        type: "string",
        label: "Project Type",
      });
      headCol++;
    }

    html += self.buildPrioritizedHeaderCell({
      filterKey: "ps-school",
      colIndex: headCol,
      type: "string",
      label: "School",
    });
    headCol++;

    html += self.buildPrioritizedHeaderCell({
      filterKey: "ps-score",
      colIndex: headCol,
      type: "number",
      label: "Score",
      extraClass: "text-center",
    });
    headCol++;

    var metricStartColIndex = headCol;
    sliderConfigs.forEach(function (config, idx) {
      const colIndex = metricStartColIndex + idx;
      const weightKeyForFilter = self.mapUiKeyToWeightKey(config.key);
      html += self.buildPrioritizedHeaderCell({
        filterKey: "ps-m-" + weightKeyForFilter,
        colIndex: colIndex,
        type: "number",
        label: config.label,
        title: config.label,
        extraClass: "text-center",
      });
    });

    html += "</tr></thead><tbody>";

    // Helper to format either raw values or normalized scores, depending on toggle.
    const formatValue = function (uiKey, school) {
      if (!school) return "N/A";

      if (displayMode === "scores") {
        const weightKey = self.mapUiKeyToWeightKey(uiKey);
        const val = school.normalizedData ? school.normalizedData[weightKey] : null;
        if (val === null || val === undefined || isNaN(val)) return "N/A";
        // Display as an index 0–100 (higher = higher priority for this metric, respecting direction).
        return Number(val).toFixed(0);
      }

      // displayMode === "values"
      const raw = school.rawData || {};
      switch (uiKey) {
        case "utilizationRate":
          return raw.utilizationRate != null ? Number(raw.utilizationRate).toFixed(1) + "%" : "N/A";
        case "studentsInAttendanceArea":
          return raw.studentsInAttendanceArea != null ? Number(raw.studentsInAttendanceArea).toFixed(1) + "%" : "N/A";
        case "studentEconomicStatus":
          return raw.studentEconomicStatus != null ? Number(raw.studentEconomicStatus).toFixed(1) + "%" : "N/A";
        case "buildingCondition":
          return raw.buildingCondition != null ? Number(raw.buildingCondition).toFixed(2) : "N/A";
        case "academicPerformance":
          return raw.academicPerformance != null ? Number(raw.academicPerformance).toFixed(1) + "%" : "N/A";
        case "enrollment":
          return raw.enrollment != null ? Number(raw.enrollment).toLocaleString() : "N/A";
        case "welcomedStudents":
          return raw.welcomedStudents != null ? Number(raw.welcomedStudents).toLocaleString() : "N/A";
        case "distanceFromOtherSchools":
          return raw.distanceFromOtherSchools != null ? Number(raw.distanceFromOtherSchools).toFixed(2) + " mi" : "N/A";
        case "pastInvestments":
          return raw.pastInvestments != null ? "$" + Number(raw.pastInvestments).toFixed(1) + "M" : "N/A";
        case "specialtyProgramOfferings":
          return raw.specialtyPrograms != null ? Number(raw.specialtyPrograms).toFixed(0) : "N/A";
        default:
          return "N/A";
      }
    };

    rankedSchools.forEach(function (school, index) {
      const buildingName = school["Building Name"] || school.name || "Unknown";
      const strategyLabel = school.strategyGroup || "";
      const uid = (school["UniqueID"] || school.UniqueID || "").toString();
      const decisionOutcomeRaw = (school.decision || school["Decision Type"] || school.outcome || school.strategyOutcome || "").toString();
      const decisionOutcome = decisionOutcomeRaw.trim();
      const schoolProfileHref =
        "school-profile.html?school=" +
        encodeURIComponent((buildingName || "").toString()) +
        (uid ? "&uid=" + encodeURIComponent(uid) : "") +
        "&popout=1";

      let colIdx = 0;
      html += "<tr data-row>";
      html += '<td data-filter="col-' + colIdx + '" data-sort-value="' + (index + 1) + '">' + (index + 1) + "</td>";
      colIdx++;

      if (showStrategyCol) {
        html += '<td data-filter="col-' + colIdx + '">' + (strategyLabel || "Unknown") + "</td>";
        colIdx++;
      }

      if (showProjectTypeCol) {
        var ptLabel = self.getProjectTypeLabelForRow(school);
        html +=
          '<td data-filter="col-' +
          colIdx +
          '" title="' +
          self._escapeHtml(ptLabel) +
          '">' +
          self._escapeHtml(ptLabel) +
          "</td>";
        colIdx++;
      }

      html +=
        '<td data-filter="col-' + colIdx + '" title="' +
        buildingName +
        (decisionOutcome ? " — " + decisionOutcome : "") +
        '">' +
        '<a href="' +
        schoolProfileHref +
        '" target="_blank" rel="noopener noreferrer" ' +
        'style="color:#dc2626; text-decoration:underline; font-weight:600;" ' +
        'onclick="event.stopPropagation();">' +
        buildingName +
        "</a>" +
        "</td>";
      colIdx++;
      html += '<td data-filter="col-' + colIdx + '" data-sort-value="' + school.priorityScore + '" style="font-weight:600;">' +
        school.priorityScore.toFixed(1) +
        "</td>";
      colIdx++;

      // Metric cells in the same order as sliderConfigs (normalized 0–100)
      sliderConfigs.forEach(function (config) {
        const sortNum = self.getMetricNumericValue(config.key, school, displayMode);
        const sortAttr = isNaN(sortNum) ? "" : ' data-sort-value="' + sortNum + '"';
        html += '<td data-filter="col-' + colIdx + '"' + sortAttr + ">" + formatValue(config.key, school) + "</td>";
        colIdx++;
      });

      html += "</tr>";
    });

    html += "</tbody></table></div></div>";

    container.innerHTML = html;

    // Wire up metric display toggle (values vs scores)
    const btnValues = document.getElementById("psMetricModeValues");
    const btnScores = document.getElementById("psMetricModeScores");
    const applyMode = (mode) => {
      const newMode = mode === "scores" ? "scores" : "values";
      const oldMode = self.metricDisplayMode === "scores" ? "scores" : "values";
      if (oldMode !== newMode) {
        self.convertPrioritizedMetricFiltersForDisplayMode(oldMode, newMode, groupNames);
      }
      self.metricDisplayMode = newMode;
      // Re-render only the table; no scoring logic changes.
      self.renderPrioritizedSchools(groupNames);
      // Map styling doesn’t depend on display mode, but keep it refreshed in case UI depends on ranked list.
      self.updateMapVisualization(groupNames);
    };
    if (btnValues) btnValues.addEventListener("click", () => applyMode("values"));
    if (btnScores) btnScores.addEventListener("click", () => applyMode("scores"));

    this.setupColumnResizing(tableId);
    this.setupPrioritizedSchoolsFilters(container);
    this.setupPrioritizedSchoolsSortable(container);
    this.applyStoredPrioritizedColumnFilters(container);

    // Equity overview intentionally suppressed per latest requirements.
  },

  // One-time migration: column-index filter state -> stable data-filter-key (survives metric column add/remove).
  migratePrioritizedSchoolFiltersToKeys: function (table) {
    const fs = window.__prioritizedSchoolsFilters;
    if (!fs || !table) return;
    const headers = Array.from(table.querySelectorAll("thead th.filterable-header"));
    const dataKeys = Object.keys(fs).filter(function (k) {
      return k !== "__psKeysMigrated";
    });
    if (!dataKeys.length) return;
    if (!dataKeys.every(function (k) {
      return /^\d+$/.test(k);
    })) return;
    const next = {};
    headers.forEach(function (th, i) {
      const nk = th.getAttribute("data-filter-key");
      if (nk && fs[i] != null) next[nk] = fs[i];
    });
    dataKeys.forEach(function (k) {
      delete fs[k];
    });
    Object.assign(fs, next);
    fs.__psKeysMigrated = true;
  },

  // Re-apply column filters after table re-render (e.g. weight sliders). Drops stale values (e.g. old scores).
  applyStoredPrioritizedColumnFilters: function (container) {
    const self = this;
    const table = container && container.querySelector("table.ps-prioritized-table");
    if (!table) return;
    const tbody = table.querySelector("tbody");
    const headers = Array.from(table.querySelectorAll("thead th.filterable-header"));
    if (!tbody || !headers.length) return;

    const filterState = window.__prioritizedSchoolsFilters || (window.__prioritizedSchoolsFilters = {});

    const getUniqueValuesForCol = function (colIndex) {
      const values = new Set();
      tbody.querySelectorAll("tr[data-row]").forEach(function (tr) {
        const cell = tr.querySelector("td[data-filter=\"col-" + colIndex + "\"]");
        if (cell) {
          const v = (cell.textContent || "").trim();
          values.add(v || "(blank)");
        }
      });
      return values;
    };

    headers.forEach(function (th, colIndex) {
      const fk = th.getAttribute("data-filter-key") || "ps-idx-" + colIndex;
      const colType = th.getAttribute("data-type") || "string";
      let sel = filterState[fk];
      if (colType === "number") {
        if (sel && sel.type === "range") {
          const bounds = self.getColumnNumericBounds(tbody, colIndex);
          sel.min = Math.max(bounds.min, Math.min(sel.min, bounds.max));
          sel.max = Math.min(bounds.max, Math.max(sel.max, bounds.min));
          if (sel.min > sel.max) {
            sel.min = bounds.min;
            sel.max = bounds.max;
          }
          if (sel.min <= bounds.min + 1e-9 && sel.max >= bounds.max - 1e-9) {
            filterState[fk] = null;
          }
        } else if (Array.isArray(sel)) {
          filterState[fk] = null;
        }
        return;
      }
      if (!Array.isArray(sel) || sel.length === 0) {
        filterState[fk] = null;
        return;
      }
      const uniques = getUniqueValuesForCol(colIndex);
      const effective = sel.filter(function (v) {
        return uniques.has(v);
      });
      if (effective.length === 0) filterState[fk] = null;
      else if (effective.length >= uniques.size) filterState[fk] = null;
      else filterState[fk] = effective;
    });

    tbody.querySelectorAll("tr[data-row]").forEach(function (tr) {
      let show = true;
      headers.forEach(function (h, colIndex) {
        const fk = h.getAttribute("data-filter-key") || "ps-idx-" + colIndex;
        const colType = h.getAttribute("data-type") || "string";
        const sel = filterState[fk];
        const bounds = colType === "number" ? self.getColumnNumericBounds(tbody, colIndex) : null;
        const cell = tr.querySelector('td[data-filter="col-' + colIndex + '"]');
        if (!self.rowMatchesPrioritizedFilter(sel, colType, cell, bounds)) show = false;
      });
      tr.classList.toggle("filter-hidden", !show);
    });

    headers.forEach(function (th, colIndex) {
      const filterBtn = th.querySelector(".filter-btn");
      if (!filterBtn) return;
      const fk = th.getAttribute("data-filter-key") || "ps-idx-" + colIndex;
      const colType = th.getAttribute("data-type") || "string";
      const sel = filterState[fk];
      const bounds = colType === "number" ? self.getColumnNumericBounds(tbody, colIndex) : null;
      if (colType === "number") {
        filterBtn.classList.toggle("filter-active", self.isPrioritizedFilterActive(sel, colType, bounds));
      } else {
        const uniques = getUniqueValuesForCol(colIndex);
        filterBtn.classList.toggle("filter-active", !!(sel && sel.length < uniques.size));
      }
    });
  },

  setupPrioritizedSchoolsFilters: function (container) {
    const self = this;
    const table = container && container.querySelector("table.ps-prioritized-table");
    if (!table) return;

    this.migratePrioritizedSchoolFiltersToKeys(table);

    const tbody = table.querySelector("tbody");
    const headers = Array.from(table.querySelectorAll("thead th.filterable-header"));
    const cache = (window.__prioritizedSchoolsFilterValuesCache = window.__prioritizedSchoolsFilterValuesCache || {});

    headers.forEach(function (th, colIndex) {
      const filterKey = th.getAttribute("data-filter-key") || "ps-idx-" + colIndex;
      const colType = th.getAttribute("data-type") || "string";
      const filterBtn = th.querySelector(".filter-btn");
      const filterDropdown = th.querySelector(".ps-prioritized-filter-dropdown");
      if (!filterBtn || !filterDropdown) return;

      filterDropdown._psPortalHost = th;
      th.style.position = "relative";

      const getUniqueValues = function () {
        const values = new Set();
        tbody.querySelectorAll("tr[data-row]").forEach(function (tr) {
          const cell = tr.querySelector("td[data-filter=\"col-" + colIndex + "\"]");
          if (cell) {
            const v = (cell.textContent || "").trim();
            values.add(v || "(blank)");
          }
        });
        const arr = Array.from(values).sort(function (a, b) { return String(a).localeCompare(String(b)); });
        if (arr.length > 0) cache[filterKey] = arr;
        return arr;
      };
      if (colType !== "number") getUniqueValues();

      const formatRangeLabel = function (v, step) {
        if (step < 0.1) return Number(v).toFixed(2);
        if (step < 1) return Number(v).toFixed(1);
        return String(Math.round(Number(v)));
      };

      const populateDropdown = function () {
        const filterState = window.__prioritizedSchoolsFilters || (window.__prioritizedSchoolsFilters = {});

        if (colType === "number") {
          const bounds = self.getColumnNumericBounds(tbody, colIndex);
          const step = self.getNumericFilterStep(bounds.min, bounds.max);
          let current = filterState[filterKey];
          let minVal = bounds.min;
          let maxVal = bounds.max;
          if (current && current.type === "range") {
            minVal = Math.max(bounds.min, Math.min(current.min, bounds.max));
            maxVal = Math.min(bounds.max, Math.max(current.max, bounds.min));
            if (minVal > maxVal) {
              minVal = bounds.min;
              maxVal = bounds.max;
            }
          }

          filterDropdown.innerHTML =
            '<div class="ps-filter-range">' +
            '<div class="ps-filter-range-head">' +
            '<span class="ps-filter-range-title">Filter by range</span>' +
            '<span class="ps-filter-range-values">' +
            '<span class="filter-range-min-display">' + formatRangeLabel(minVal, step) + "</span>" +
            " – " +
            '<span class="filter-range-max-display">' + formatRangeLabel(maxVal, step) + "</span>" +
            "</span></div>" +
            '<div class="show-hide-dual-range" aria-label="Column range filter">' +
            '<input type="range" class="show-hide-dual-range__input show-hide-dual-range__input--min filter-range-min-slider" step="' + step + '" min="' + bounds.min + '" max="' + bounds.max + '" value="' + minVal + '">' +
            '<input type="range" class="show-hide-dual-range__input show-hide-dual-range__input--max filter-range-max-slider" step="' + step + '" min="' + bounds.min + '" max="' + bounds.max + '" value="' + maxVal + '">' +
            "</div></div>";

          const minSl = filterDropdown.querySelector(".filter-range-min-slider");
          const maxSl = filterDropdown.querySelector(".filter-range-max-slider");
          const minDisplay = filterDropdown.querySelector(".filter-range-min-display");
          const maxDisplay = filterDropdown.querySelector(".filter-range-max-display");

          const syncDisplays = function (lo, hi) {
            if (minDisplay) minDisplay.textContent = formatRangeLabel(lo, step);
            if (maxDisplay) maxDisplay.textContent = formatRangeLabel(hi, step);
          };

          const emitRange = function () {
            let lo = Number(minSl.value);
            let hi = Number(maxSl.value);
            if (lo > hi) {
              if (document.activeElement === minSl) {
                lo = hi;
                minSl.value = String(lo);
              } else {
                hi = lo;
                maxSl.value = String(hi);
              }
            }
            syncDisplays(lo, hi);
            applyFilters();
          };

          if (typeof applyShowHideDualRange === "function") {
            applyShowHideDualRange(minSl, maxSl, bounds.min, bounds.max, minVal, maxVal);
          }
          minSl.step = String(step);
          maxSl.step = String(step);
          syncDisplays(Number(minSl.value), Number(maxSl.value));
          minSl.addEventListener("input", emitRange);
          maxSl.addEventListener("input", emitRange);
          return;
        }

        let values = cache[filterKey];
        if (!values || values.length === 0) {
          values = getUniqueValues();
        }
        if (!values || values.length === 0) return;
        filterDropdown.innerHTML =
          "<div style=\"margin-bottom:6px; padding-bottom:6px; border-bottom:1px solid #eee;\">" +
          "<label class=\"filter-select-all-row\" style=\"display:flex; align-items:center; gap:6px; cursor:pointer; font-size:12px;\">" +
          "<input type=\"checkbox\" class=\"filter-select-all-cb\" checked>" +
          "<span>(Select All)</span></label>" +
          "</div>" +
          "<input type=\"search\" placeholder=\"Search...\" class=\"filter-search\" aria-label=\"Search filter values\" style=\"margin-bottom:4px;\">" +
          "<div class=\"filter-options\">" +
          values.map(function (v) {
            const escaped = String(v).replace(/</g, "&lt;").replace(/>/g, "&gt;");
            return "<label><input type=\"checkbox\" value=\"" + escaped + "\" class=\"filter-option\"> " + escaped + "</label>";
          }).join("") +
          "</div>";

        let selected = filterState[filterKey] != null ? filterState[filterKey] : null;
        if (Array.isArray(selected) && selected.length === 0) selected = null;
        const selectAllCb = filterDropdown.querySelector(".filter-select-all-cb");
        const opts = filterDropdown.querySelectorAll(".filter-option");

        opts.forEach(function (cb) {
          if (selected === null || (Array.isArray(selected) && selected.indexOf(cb.value) >= 0)) {
            cb.checked = true;
          }
        });

        const updateSelectAllState = function () {
          const checked = Array.from(opts).filter(function (cb) { return cb.checked; }).length;
          if (selectAllCb) {
            selectAllCb.checked = checked === opts.length;
            selectAllCb.indeterminate = checked > 0 && checked < opts.length;
          }
        };
        updateSelectAllState();

        selectAllCb?.addEventListener("change", function () {
          const check = selectAllCb.checked;
          opts.forEach(function (cb) { cb.checked = check; });
          updateSelectAllState();
          applyFilters();
        });

        const searchInput = filterDropdown.querySelector(".filter-search");
        if (searchInput) {
          searchInput.oninput = function () {
            const q = searchInput.value.toLowerCase();
            filterDropdown.querySelectorAll(".filter-options label").forEach(function (label) {
              const text = (label.textContent || "").toLowerCase();
              label.style.display = q && text.indexOf(q) < 0 ? "none" : "flex";
            });
          };
        }

        opts.forEach(function (cb) {
          cb.addEventListener("change", function () {
            updateSelectAllState();
            applyFilters();
          });
        });
      };

      filterDropdown.addEventListener("click", function (e) {
        e.stopPropagation();
      });

      const clearColBtn = th.querySelector(".filter-clear-col");
      if (clearColBtn) {
        clearColBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          const filterState = window.__prioritizedSchoolsFilters || (window.__prioritizedSchoolsFilters = {});
          filterState[filterKey] = null;
          const dd = th.querySelector(".ps-prioritized-filter-dropdown") ||
            (filterDropdown._psPortalHost === th ? filterDropdown : null);
          if (dd && colType === "number") {
            const bounds = self.getColumnNumericBounds(tbody, colIndex);
            const step = self.getNumericFilterStep(bounds.min, bounds.max);
            const minSl = dd.querySelector(".filter-range-min-slider");
            const maxSl = dd.querySelector(".filter-range-max-slider");
            const minDisplay = dd.querySelector(".filter-range-min-display");
            const maxDisplay = dd.querySelector(".filter-range-max-display");
            if (typeof applyShowHideDualRange === "function" && minSl && maxSl) {
              applyShowHideDualRange(minSl, maxSl, bounds.min, bounds.max, bounds.min, bounds.max);
            } else if (minSl && maxSl) {
              minSl.value = bounds.min;
              maxSl.value = bounds.max;
            }
            if (minDisplay) minDisplay.textContent = formatRangeLabel(bounds.min, step);
            if (maxDisplay) maxDisplay.textContent = formatRangeLabel(bounds.max, step);
          } else if (dd) {
            const opts = dd.querySelectorAll(".filter-option");
            const selectAllCb = dd.querySelector(".filter-select-all-cb");
            if (opts && opts.length) {
              opts.forEach(function (cb) { cb.checked = true; });
              if (selectAllCb) selectAllCb.checked = true;
              if (selectAllCb) selectAllCb.indeterminate = false;
            }
          }
          applyFilters();
        });
      }

      const applyFilters = function () {
        const filterState = window.__prioritizedSchoolsFilters || (window.__prioritizedSchoolsFilters = {});
        headers.forEach(function (h, i) {
          const fk = h.getAttribute("data-filter-key") || "ps-idx-" + i;
          const hType = h.getAttribute("data-type") || "string";
          const dd = self.getPrioritizedFilterDropdownForHeader(h);
          if (!dd) return;

          if (hType === "number") {
            const minSl = dd.querySelector(".filter-range-min-slider");
            const maxSl = dd.querySelector(".filter-range-max-slider");
            if (minSl && maxSl) {
              const bounds = self.getColumnNumericBounds(tbody, i);
              let minV = parseFloat(minSl.value);
              let maxV = parseFloat(maxSl.value);
              if (isNaN(minV)) minV = bounds.min;
              if (isNaN(maxV)) maxV = bounds.max;
              if (minV > maxV) {
                const t = minV;
                minV = maxV;
                maxV = t;
              }
              if (minV <= bounds.min + 1e-9 && maxV >= bounds.max - 1e-9) {
                filterState[fk] = null;
              } else {
                filterState[fk] = {
                  type: "range",
                  min: minV,
                  max: maxV,
                  displayMode: self.metricDisplayMode === "scores" ? "scores" : "values",
                };
              }
            }
            return;
          }

          const opts = dd.querySelectorAll(".filter-option");
          if (opts.length === 0) return;
          const checked = Array.from(opts).filter(function (cb) {
            return cb.checked;
          }).map(function (cb) {
            return cb.value;
          });
          let effective = null;
          if (checked.length > 0 && checked.length < opts.length) {
            effective = checked;
          }
          filterState[fk] = effective;
        });

        tbody.querySelectorAll("tr[data-row]").forEach(function (tr) {
          let show = true;
          headers.forEach(function (h, i) {
            const fk = h.getAttribute("data-filter-key") || "ps-idx-" + i;
            const hType = h.getAttribute("data-type") || "string";
            const sel = filterState[fk];
            const bounds = hType === "number" ? self.getColumnNumericBounds(tbody, i) : null;
            const cell = tr.querySelector('td[data-filter="col-' + i + '"]');
            if (!self.rowMatchesPrioritizedFilter(sel, hType, cell, bounds)) show = false;
          });
          tr.classList.toggle("filter-hidden", !show);
        });

        const sel = filterState[filterKey];
        if (colType === "number") {
          const bounds = self.getColumnNumericBounds(tbody, colIndex);
          filterBtn.classList.toggle("filter-active", self.isPrioritizedFilterActive(sel, colType, bounds));
        } else {
          const vals = getUniqueValues();
          filterBtn.classList.toggle("filter-active", !!(sel !== null && sel !== undefined && sel.length < vals.length));
        }
      };

      filterBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        e.preventDefault();
        const wasOpen = filterDropdown.classList.contains("is-open");
        self.closePrioritizedFilterDropdowns();
        if (!wasOpen) {
          populateDropdown();
          self.openPrioritizedFilterDropdown(filterDropdown, filterBtn, th);
        }
      });
    });

    if (!document._prioritizedSchoolsFilterClickOutside) {
      document._prioritizedSchoolsFilterClickOutside = true;
      document.addEventListener("click", function (e) {
        if (e.target && e.target.closest && e.target.closest(".ps-prioritized-filter-dropdown")) return;
        if (e.target && e.target.closest && (e.target.closest(".ps-prioritized-table .filter-btn") || e.target.closest(".ps-prioritized-table .filter-clear-col"))) return;
        self.closePrioritizedFilterDropdowns();
      });
    }

    if (!window.__prioritizedFilterDropdownRepositionBound) {
      window.__prioritizedFilterDropdownRepositionBound = true;
      const reposition = function () {
        if (window.prioritizationUI) window.prioritizationUI.repositionOpenPrioritizedFilterDropdowns();
      };
      window.addEventListener("resize", reposition);
      window.addEventListener("scroll", reposition, true);
    }

    const clearBtn = container.querySelector("#psClearAllFiltersBtn");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        window.__prioritizedSchoolsFilters = {};
        window.__prioritizedSchoolsFilterValuesCache = {};
        self.closePrioritizedFilterDropdowns();
        tbody.querySelectorAll("tr[data-row]").forEach(function (tr) {
          tr.classList.remove("filter-hidden");
        });
        headers.forEach(function (h) {
          const btn = h.querySelector(".filter-btn");
          if (btn) btn.classList.remove("filter-active");
        });
      });
    }
  },

  setupPrioritizedSchoolsSortable: function (container) {
    const self = this;
    const table = container && container.querySelector("table.ps-prioritized-table");
    if (!table) return;

    const sortColumn = function (header) {
      const tbody = table.querySelector("tbody");
      if (!tbody || !header) return;
      const columnIndex = parseInt(header.dataset.column, 10);
      const dataType = header.dataset.type || "string";
      const isAsc = header.classList.contains("sort-asc");
      const newDir = isAsc ? "desc" : "asc";

      table.querySelectorAll("th.sortable-header").forEach(function (h) {
        h.classList.remove("sort-asc", "sort-desc");
      });
      header.classList.add(newDir === "asc" ? "sort-asc" : "sort-desc");

      const rows = Array.from(tbody.querySelectorAll("tr[data-row]"));

      rows.sort(function (rowA, rowB) {
        const cellA = rowA.querySelector("td[data-filter=\"col-" + columnIndex + "\"]");
        const cellB = rowB.querySelector("td[data-filter=\"col-" + columnIndex + "\"]");
        let valA;
        let valB;

        if (dataType === "number") {
          valA = self.parsePrioritizedCellNumber(cellA);
          valB = self.parsePrioritizedCellNumber(cellB);
          if (isNaN(valA) && isNaN(valB)) return 0;
          if (isNaN(valA)) return newDir === "asc" ? 1 : -1;
          if (isNaN(valB)) return newDir === "asc" ? -1 : 1;
        } else {
          valA = (cellA ? cellA.textContent : "").trim();
          valB = (cellB ? cellB.textContent : "").trim();
        }

        if (valA < valB) return newDir === "asc" ? -1 : 1;
        if (valA > valB) return newDir === "asc" ? 1 : -1;
        return 0;
      });

      rows.forEach(function (row) {
        tbody.appendChild(row);
      });
    };

    table.querySelectorAll("th.sortable-header").forEach(function (header) {
      header.addEventListener("click", function (e) {
        if (e.target && (e.target.classList.contains("filter-btn") || e.target.closest(".filter-btn"))) return;
        if (e.target && e.target.closest(".ps-prioritized-filter-dropdown")) return;
        if (e.target && e.target.closest(".column-resizer")) return;
        sortColumn(header);
      });
    });
  },

  // Keep the fixed header table perfectly aligned with the scrolling body table.
  // This fixes misalignment caused by the vertical scrollbar consuming width in the body scroller.
  syncPrioritizedTableHeaderToBody: function (tableId) {
    const headerTable = document.getElementById(tableId + "-header");
    const bodyTable = document.getElementById(tableId + "-body");
    const scroller = bodyTable ? bodyTable.closest(".ps-prioritized-table-body-scroll") : null;
    if (!headerTable || !bodyTable || !scroller) return;

    const syncOnce = () => {
      // clientWidth excludes scrollbar; offsetWidth includes it (in classic scrollbar layouts)
      const scrollbarWidth = scroller.offsetWidth - scroller.clientWidth;
      // Match the body table’s visible width so colgroups align exactly.
      // Use clientWidth (content box) so header doesn’t include the scrollbar gutter.
      headerTable.style.width = scroller.clientWidth + "px";
      // Also keep the header visually aligned within the wrapper when scrollbar exists.
      headerTable.style.marginRight = scrollbarWidth > 0 ? scrollbarWidth + "px" : "";
    };

    // Run after layout settles (fonts, scrollbars, etc.)
    requestAnimationFrame(syncOnce);
    setTimeout(syncOnce, 0);

    // Re-sync on resize (only keep one handler alive)
    if (this._prioritizedTableSyncHandler) {
      window.removeEventListener("resize", this._prioritizedTableSyncHandler);
      this._prioritizedTableSyncHandler = null;
    }
    this._prioritizedTableSyncHandler = () => syncOnce();
    window.addEventListener("resize", this._prioritizedTableSyncHandler);
  },

  // Setup column resizing functionality (single table with sticky header)
  setupColumnResizing: function (tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;

    const resizers = table.querySelectorAll(".column-resizer");
    let currentResizer = null;
    let startX = 0;
    let startWidth = 0;
    let currentCol = null;
    let currentIndex = -1;

    resizers.forEach(function (resizer, index) {
      resizer.addEventListener("mousedown", function (e) {
        e.preventDefault();
        e.stopPropagation();
        currentResizer = resizer;
        startX = e.clientX;
        currentIndex = index;
        currentCol = table.querySelectorAll("thead th")[index];
        startWidth = currentCol ? currentCol.offsetWidth : 80;
        resizer.classList.add("dragging");
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      });
    });

    document.addEventListener("mousemove", function (e) {
      if (!currentResizer || !currentCol || currentIndex < 0) return;
      const diff = e.clientX - startX;
      const newWidth = Math.max(40, startWidth + diff);
      const cols = table.querySelectorAll("colgroup col");
      if (cols && cols[currentIndex]) {
        cols[currentIndex].style.width = newWidth + "px";
        cols[currentIndex].style.minWidth = newWidth + "px";
      }
      currentCol.style.width = newWidth + "px";
    });

    document.addEventListener("mouseup", function () {
      if (currentResizer) {
        currentResizer.classList.remove("dragging");
        currentResizer = null;
        currentCol = null;
        currentIndex = -1;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    });
  },

  // Render equity analysis summary
  renderEquityAnalysis: function (topSchools) {
    if (!window.prioritizationLogic || !window.prioritizationLogic.calculateEquityMetrics) {
      return;
    }

    const metrics = window.prioritizationLogic.calculateEquityMetrics(topSchools || []);

    let equityContainer = document.getElementById("equity-analysis-container");
    if (!equityContainer) {
      const prioritizedSection = document.getElementById("prioritized-schools-section");
      if (prioritizedSection) {
        equityContainer = document.createElement("div");
        equityContainer.id = "equity-analysis-container";
        equityContainer.style.marginTop = "1.5rem";
        prioritizedSection.appendChild(equityContainer);
      }
    }

    if (!equityContainer) return;

    equityContainer.innerHTML =
      "<h4>Equity Balance Overview</h4>" +
      '<div style="background:#f9f9f9;padding:1rem;border-radius:4px;margin-top:0.5rem;">' +
      '<div style="margin-bottom:1rem;"><strong>Students Affected:</strong> ' +
      metrics.studentsAffected.toLocaleString() +
      "</div>" +
      '<div style="margin-bottom:1rem;"><strong>Avg. Free/Reduced Lunch:</strong> ' +
      metrics.avgFreeReducedLunch.toFixed(1) +
      "%</div>" +
      "<div><strong>Demographic Breakdown:</strong>" +
      '<ul style="margin-top:0.5rem;margin-left:1.5rem;">' +
      "<li>Black students: " +
      metrics.demographicBreakdown.black.toFixed(1) +
      "%</li>" +
      "<li>Hispanic students: " +
      metrics.demographicBreakdown.hispanic.toFixed(1) +
      "%</li>" +
      "<li>White students: " +
      metrics.demographicBreakdown.white.toFixed(1) +
      "%</li>" +
      "</ul></div></div>";
  },

  // Push scores into map and update circle sizes
  updateMapVisualization: function (strategyGroupNames) {
    if (!window.prioritizationLogic) return;

    const groupNames = Array.isArray(strategyGroupNames)
      ? strategyGroupNames
      : [strategyGroupNames].filter(Boolean);
    const outcomeFiltersByGroup = this.outcomeFiltersByGroup || {};

    const resolveGroups = function (names) {
      if (names.includes("__ALL__")) return ["Expansion", "Maintenance/Investment", "Closure/Consolidation"];
      if (names.includes("__ALL_EXP_MAINT__")) return ["Expansion", "Maintenance/Investment"];
      return names;
    };

    const groupsToUse = resolveGroups(groupNames.length ? groupNames : ["Expansion"]);
    let rankedSchools =
      groupsToUse.length > 1
        ? window.prioritizationLogic.rankSchoolsAcrossStrategies(groupsToUse, null)
        : window.prioritizationLogic.rankSchools(groupsToUse[0], null);

    const allGroupsForCombined = ["Expansion", "Maintenance/Investment", "Closure/Consolidation"];
    if (rankedSchools && rankedSchools.length) {
      rankedSchools = rankedSchools.filter((s) => {
        const outcomeName = s.decision || s.outcome || s.strategyOutcome;
        const sg = s.strategyGroup || groupsToUse[0];
        const combinedKey = groupNames.includes("__ALL__") ? "__ALL__" : "__ALL_EXP_MAINT__";
        const combinedSelected = Array.isArray(outcomeFiltersByGroup[combinedKey])
          ? outcomeFiltersByGroup[combinedKey]
          : null;
        const specificSelected = Array.isArray(outcomeFiltersByGroup[sg])
          ? outcomeFiltersByGroup[sg]
          : null;
        const groupsInCombined = groupNames.includes("__ALL__") ? allGroupsForCombined : ["Expansion", "Maintenance/Investment"];
        const selected = specificSelected || (combinedSelected && groupsInCombined.includes(sg) ? combinedSelected : null);
        if (!selected || !selected.length) return true;
        return selected.includes(outcomeName);
      });
    }

    if (!window.priorityScores) {
      window.priorityScores = {};
    }
    window.priorityScores = {};

    rankedSchools.forEach(function (school) {
      const name = school["Building Name"] || school.name;
      if (name) {
        window.priorityScores[name] = {
          score: school.priorityScore,
          strategyGroup: groupsToUse.length === 1 ? groupsToUse[0] : "__MULTI__"
        };
      }
    });

    this.updateMapCircleSizes(rankedSchools);
  },

  updateMapCircleSizes: function () {
    if (!window.map || !window.geojsonData) {
      console.warn("⚠️ Map or geojsonData not available for priority visualization");
      return;
    }

    const map = window.map;
    // IMPORTANT:
    // The main app's `updateLayer()` owns filtering (including hiding non-eval/closed).
    // Do NOT call `map.getSource("schools").setData(window.geojsonData)` here because
    // that overwrites the filtered dataset and causes hidden schools to "pop back in"
    // when sliders change (since prioritizationUI.refresh() runs on slider updates).
    //
    // Instead: attach priorityScore to the base data object and ask `updateLayer()`
    // to reapply filters to the map source.
    const baseData = (typeof originalGeojsonData !== "undefined" && originalGeojsonData && originalGeojsonData.features)
      ? originalGeojsonData
      : window.geojsonData;

    baseData.features.forEach(function (feature) {
      const name = feature.properties["Building Name"];
      const p = window.priorityScores && window.priorityScores[name];
      feature.properties.priorityScore = p ? p.score : null;
    });

    if (map.getLayer("schools-layer")) {
      // Keep all schools the same size on the map; priority scores are still
      // attached as properties, but no longer drive circle radius.
      map.setPaintProperty("schools-layer", "circle-radius", 6);
    }

    // Reapply filters + update the `schools` source without overriding the filter logic.
    try {
      if (typeof updateLayer === "function") {
        updateLayer();
      }
    } catch (e) {
      console.warn("⚠️ Unable to reapply map filters after priority update:", e);
    }

    console.log("✅ Map circle sizes updated (constant radius)");
  },

  setupEventListeners: function () {
    this._loadImpactTableColumnPrefs();
    this.wireImpactTableColumnToggles();
    const resetBtn = document.getElementById('resetAllPrioritizationWeightsBtn');
    if (resetBtn && !resetBtn.dataset.prioritizationResetWired) {
      resetBtn.dataset.prioritizationResetWired = '1';
      resetBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.resetToDefaults();
      });
    }
    if (!window.__prioritizationDistanceRefreshBound) {
      window.__prioritizationDistanceRefreshBound = true;
      document.addEventListener("jeffco-school-distances-ready", function () {
        const ui = window.prioritizationUI;
        if (!ui || !ui.currentStrategyGroups || !ui.currentStrategyGroups.length) return;
        ui.renderPrioritizedSchools(ui.currentStrategyGroups);
      });
    }
  },

  resetToDefaults: function () {
    if (window.prioritizationLogic && typeof window.prioritizationLogic.resetWeightsToDefaults === 'function') {
      window.prioritizationLogic.resetWeightsToDefaults();
    }
    const groups =
      this.currentStrategyGroups && this.currentStrategyGroups.length
        ? this.currentStrategyGroups
        : ['__ALL__'];
    this.renderWeightSliders(groups);
    this.renderPrioritizedSchools(groups);
    this.updateMapVisualization(groups);
  },

  // Refresh when underlying school decisions change
  refresh: function (schoolDataWithDecisions) {
    this.schoolDataWithDecisions = schoolDataWithDecisions || [];
    if (window.prioritizationLogic && window.prioritizationLogic.initialize) {
      window.prioritizationLogic.initialize(this.schoolDataWithDecisions);
    }
    this.renderStrategyGroupTabs();
    if (this.currentStrategyGroups && this.currentStrategyGroups.length) {
      this.selectStrategyGroup(this.currentStrategyGroups);
    }
  }
};

console.log("✅ PrioritizationUI.js loaded");


