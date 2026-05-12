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
  // Strategy Prioritization table: optional columns (persisted in localStorage)
  impactTableShowProjectType: true,
  impactTableShowStrategyGroup: true,

  _loadImpactTableColumnPrefs: function () {
    try {
      var p = localStorage.getItem("jeffco_impact_col_project");
      if (p === "0") this.impactTableShowProjectType = false;
      else if (p === "1") this.impactTableShowProjectType = true;
      var s = localStorage.getItem("jeffco_impact_col_strategy");
      if (s === "0") this.impactTableShowStrategyGroup = false;
      else if (s === "1") this.impactTableShowStrategyGroup = true;
    } catch (e) {}
  },

  _saveImpactTableColumnPrefs: function () {
    try {
      localStorage.setItem("jeffco_impact_col_project", this.impactTableShowProjectType ? "1" : "0");
      localStorage.setItem("jeffco_impact_col_strategy", this.impactTableShowStrategyGroup ? "1" : "0");
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

  /** Checkboxes above weight sliders (Strategy Prioritization column visibility). */
  buildImpactTableColumnToggleHtml: function (isCombined) {
    var projChecked = this.impactTableShowProjectType !== false ? " checked" : "";
    var stratChecked = this.impactTableShowStrategyGroup !== false ? " checked" : "";
    var stratBlock = "";
    if (isCombined) {
      stratBlock =
        '<label style="display:flex; align-items:center; gap:8px; cursor:pointer;">' +
        '<input type="checkbox" id="impact-col-strategy-group"' +
        stratChecked +
        ' style="width:14px;height:14px;">' +
        "<span>Include strategy group</span></label>";
    }
    return (
      '<div class="impact-table-column-toggles" style="margin-bottom:0.75rem; padding:0.25rem 0 0.5rem 0; border-bottom:1px solid #e5e7eb;">' +
      '<div style="display:flex; flex-direction:column; gap:6px; font-size:0.85em;">' +
      '<label style="display:flex; align-items:center; gap:8px; cursor:pointer;">' +
      '<input type="checkbox" id="impact-col-project-type"' +
      projChecked +
      ' style="width:14px;height:14px;">' +
      "<span>Include project type</span></label>" +
      stratBlock +
      "</div></div>"
    );
  },

  wireImpactTableColumnToggles: function (strategyGroupNames) {
    var self = this;
    var groupNames = Array.isArray(strategyGroupNames)
      ? strategyGroupNames
      : [strategyGroupNames].filter(Boolean);
    var proj = document.getElementById("impact-col-project-type");
    var strat = document.getElementById("impact-col-strategy-group");
    if (proj) {
      proj.addEventListener("change", function () {
        self.impactTableShowProjectType = !!proj.checked;
        self._saveImpactTableColumnPrefs();
        self.renderPrioritizedSchools(groupNames);
        self.updateMapVisualization(groupNames);
      });
    }
    if (strat) {
      strat.addEventListener("change", function () {
        self.impactTableShowStrategyGroup = !!strat.checked;
        self._saveImpactTableColumnPrefs();
        self.renderPrioritizedSchools(groupNames);
        self.updateMapVisualization(groupNames);
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
        '<input type="range" id="' +
        config.key +
        '-slider" min="0" max="10" step="0.5" value="' +
        uiValue +
        '"' +
        disabledAttr +
        ' style="width: 100%;" ' +
        'data-weight-key="' +
        config.key +
        '" data-strategy-group="' +
        primaryGroup +
        '">' +
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
      const toggleHtml = self.buildImpactTableColumnToggleHtml(isCombined);
      leftPanel.innerHTML = toggleHtml + slidersHTML;
      self.wireImpactTableColumnToggles(groupNames);
    }

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
    const container = document.getElementById("prioritized-schools-table-container");
    if (!container || !window.prioritizationLogic) return;

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

    // Apply per-group outcome filters (Cursor-style ▸ flyouts).
    const allGroupsForCombined = ["Expansion", "Maintenance/Investment", "Closure/Consolidation"];
    if (rankedSchools && rankedSchools.length) {
      rankedSchools = rankedSchools.filter((s) => {
        const outcomeName = s.decision || s.outcome || s.strategyOutcome;
        const sg = s.strategyGroup || baseGroupName;

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
    colWidths.push("8%"); // Rank
    if (showStrategyCol) colWidths.push("12%");
    if (showProjectTypeCol) colWidths.push("14%");
    colWidths.push(showStrategyCol || showProjectTypeCol ? "18%" : "22%"); // School
    colWidths.push("10%"); // Score
    sliderConfigs.forEach(() => colWidths.push("80px")); // enabled metrics only

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
      ".ps-prioritized-table thead th { position: sticky; top: 0; z-index: 10; background: #fef2f2; box-shadow: 0 1px 0 #e5e5e5; padding: 4px 4px; text-align: left; border: 1px solid #e5e5e5; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }" +
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
      /* Filter + Sort (match Decision by School) */
      ".ps-prioritized-table .filterable-header .th-inner { display: inline-flex; align-items: center; gap: 2px; max-width: 100%; overflow: hidden; }" +
      ".ps-prioritized-table .th-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }" +
      ".ps-prioritized-table .filter-btn { flex-shrink: 0; width: 18px; height: 18px; padding: 0; border: 1px solid #d1d5db; border-radius: 3px; background: #fff; color: #6b7280; font-size: 9px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }" +
      ".ps-prioritized-table .filter-btn:hover, .ps-prioritized-table .filter-btn.filter-active { background: #dc2626; color: #fff; border-color: #dc2626; }" +
      ".ps-prioritized-table .filter-clear-col { display: none; }" +
      ".ps-prioritized-table th.filterable-header { overflow: visible; }" +
      ".ps-prioritized-table .filter-dropdown { position: absolute; top: 100%; left: 0; min-width: 180px; max-height: 220px; background: #fff; border: 1px solid #d1d5db; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); padding: 4px 6px; margin-top: 2px; overflow-y: auto; z-index: 10000; display: none; }" +
      ".ps-prioritized-table .filter-dropdown.is-open { display: block; }" +
      ".ps-prioritized-table .filter-dropdown input[type='search'] { width: 100%; padding: 4px 6px; margin-bottom: 4px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px; box-sizing: border-box; }" +
      ".ps-prioritized-table .filter-dropdown label { display: flex; align-items: center; gap: 6px; padding: 0; margin: 0; font-size: 12px; cursor: pointer; line-height: 1.25; }" +
      ".ps-prioritized-table .filter-dropdown .filter-options { display: flex; flex-direction: column; gap: 0; }" +
      ".ps-prioritized-table tr.filter-hidden { display: none; }" +
      ".ps-prioritized-table th.sortable-header { cursor: pointer; }" +
      ".ps-prioritized-table th.sortable-header:hover { background: #eef2f7; }" +
      ".ps-prioritized-table th.sortable-header::after { content: ''; position: absolute; right: 24px; top: 50%; margin-top: -4px; border: 6px solid transparent; border-bottom-color: #9ca3af; border-top: none; opacity: 0.5; }" +
      ".ps-prioritized-table th.sortable-header.sort-asc::after { border-bottom: 6px solid #dc2626; border-top: none; opacity: 1; }" +
      ".ps-prioritized-table th.sortable-header.sort-desc::after { border-top: 6px solid #dc2626; border-bottom: none; margin-top: -10px; opacity: 1; }" +
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
    html +=
      '<th class="sortable-header filterable-header text-center" data-filter-key="ps-rank" data-column="' +
      headCol +
      '" data-type="number" title="Rank">' +
      '<span class="th-inner"><span class="th-label">Rank</span><button type="button" class="filter-btn" aria-label="Filter column" title="Filter">▾</button><button type="button" class="filter-clear-col" aria-label="Clear filter" title="Clear filter">×</button></span>' +
      '<div class="filter-dropdown" role="menu" aria-hidden="true"></div>' +
      '<div class="column-resizer" data-col="' +
      headCol +
      '"></div></th>';
    headCol++;

    if (showStrategyCol) {
      html +=
        '<th class="sortable-header filterable-header" data-filter-key="ps-strategyGroup" data-column="' +
        headCol +
        '" data-type="string" title="Strategy Group">' +
        '<span class="th-inner"><span class="th-label">Strategy Group</span><button type="button" class="filter-btn" aria-label="Filter column" title="Filter">▾</button><button type="button" class="filter-clear-col" aria-label="Clear filter" title="Clear filter">×</button></span>' +
        '<div class="filter-dropdown" role="menu" aria-hidden="true"></div>' +
        '<div class="column-resizer" data-col="' +
        headCol +
        '"></div></th>';
      headCol++;
    }

    if (showProjectTypeCol) {
      html +=
        '<th class="sortable-header filterable-header" data-filter-key="ps-projectType" data-column="' +
        headCol +
        '" data-type="string" title="Project Type">' +
        '<span class="th-inner"><span class="th-label">Project Type</span><button type="button" class="filter-btn" aria-label="Filter column" title="Filter">▾</button><button type="button" class="filter-clear-col" aria-label="Clear filter" title="Clear filter">×</button></span>' +
        '<div class="filter-dropdown" role="menu" aria-hidden="true"></div>' +
        '<div class="column-resizer" data-col="' +
        headCol +
        '"></div></th>';
      headCol++;
    }

    html +=
      '<th class="sortable-header filterable-header" data-filter-key="ps-school" data-column="' +
      headCol +
      '" data-type="string" title="School">' +
      '<span class="th-inner"><span class="th-label">School</span><button type="button" class="filter-btn" aria-label="Filter column" title="Filter">▾</button><button type="button" class="filter-clear-col" aria-label="Clear filter" title="Clear filter">×</button></span>' +
      '<div class="filter-dropdown" role="menu" aria-hidden="true"></div>' +
      '<div class="column-resizer" data-col="' +
      headCol +
      '"></div></th>';
    headCol++;
    html +=
      '<th class="sortable-header filterable-header text-center" data-filter-key="ps-score" data-column="' +
      headCol +
      '" data-type="number" title="Score">' +
      '<span class="th-inner"><span class="th-label">Score</span><button type="button" class="filter-btn" aria-label="Filter column" title="Filter">▾</button><button type="button" class="filter-clear-col" aria-label="Clear filter" title="Clear filter">×</button></span>' +
      '<div class="filter-dropdown" role="menu" aria-hidden="true"></div>' +
      '<div class="column-resizer" data-col="' +
      headCol +
      '"></div></th>';
    headCol++;

    var metricStartColIndex = headCol;
    sliderConfigs.forEach(function (config, idx) {
      const colIndex = metricStartColIndex + idx;
      const weightKeyForFilter = self.mapUiKeyToWeightKey(config.key);
      const labelEscaped = config.label.replace(/"/g, "&quot;");
      html += '<th class="sortable-header filterable-header text-center" data-filter-key="ps-m-' + weightKeyForFilter + '" data-column="' + colIndex + '" data-type="number" title="' + labelEscaped + '">' +
        '<span class="th-inner"><span class="th-label">' + config.label + '</span><button type="button" class="filter-btn" aria-label="Filter column" title="Filter">▾</button><button type="button" class="filter-clear-col" aria-label="Clear filter" title="Clear filter">×</button></span>' +
        '<div class="filter-dropdown" role="menu" aria-hidden="true"></div>' +
        '<div class="column-resizer" data-col="' + colIndex + '"></div></th>';
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
        (uid ? "&uid=" + encodeURIComponent(uid) : "");

      let colIdx = 0;
      html += "<tr data-row>";
      html += '<td data-filter="col-' + colIdx + '">' + (index + 1) + "</td>";
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
      html += '<td data-filter="col-' + colIdx + '" style="font-weight:600;">' +
        school.priorityScore.toFixed(1) +
        "</td>";
      colIdx++;

      // Metric cells in the same order as sliderConfigs (normalized 0–100)
      sliderConfigs.forEach(function (config) {
        html += '<td data-filter="col-' + colIdx + '">' + formatValue(config.key, school) + "</td>";
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
      self.metricDisplayMode = mode === "scores" ? "scores" : "values";
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
      let sel = filterState[fk];
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

    const selectedByCol = {};
    headers.forEach(function (th, colIndex) {
      const fk = th.getAttribute("data-filter-key") || "ps-idx-" + colIndex;
      const s = filterState[fk];
      selectedByCol[colIndex] = Array.isArray(s) && s.length > 0 ? s : null;
    });

    tbody.querySelectorAll("tr[data-row]").forEach(function (tr) {
      let show = true;
      headers.forEach(function (h, colIndex) {
        const sel = selectedByCol[colIndex];
        if (sel === null || sel === undefined) return;
        if (Array.isArray(sel) && sel.length === 0) return;
        const cell = tr.querySelector("td[data-filter=\"col-" + colIndex + "\"]");
        const raw = (cell ? cell.textContent : "").trim();
        const val = raw || "(blank)";
        if (sel.indexOf(val) < 0) show = false;
      });
      tr.classList.toggle("filter-hidden", !show);
    });

    headers.forEach(function (th, colIndex) {
      const filterBtn = th.querySelector(".filter-btn");
      if (!filterBtn) return;
      const uniques = getUniqueValuesForCol(colIndex);
      const sel = selectedByCol[colIndex];
      filterBtn.classList.toggle("filter-active", !!(sel && sel.length < uniques.size));
    });
  },

  setupPrioritizedSchoolsFilters: function (container) {
    const table = container && container.querySelector("table.ps-prioritized-table");
    if (!table) return;

    this.migratePrioritizedSchoolFiltersToKeys(table);

    const tbody = table.querySelector("tbody");
    const headers = Array.from(table.querySelectorAll("thead th.filterable-header"));
    const cache = (window.__prioritizedSchoolsFilterValuesCache = window.__prioritizedSchoolsFilterValuesCache || {});

    headers.forEach(function (th, colIndex) {
      const filterKey = th.getAttribute("data-filter-key") || "ps-idx-" + colIndex;
      const filterBtn = th.querySelector(".filter-btn");
      const filterDropdown = th.querySelector(".filter-dropdown");
      if (!filterBtn || !filterDropdown) return;

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
      getUniqueValues();

      const populateDropdown = function () {
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

        const filterState = window.__prioritizedSchoolsFilters || (window.__prioritizedSchoolsFilters = {});
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
          const dd = th.querySelector(".filter-dropdown");
          const opts = dd ? dd.querySelectorAll(".filter-option") : [];
          const selectAllCb = dd ? dd.querySelector(".filter-select-all-cb") : null;
          if (opts && opts.length) {
            opts.forEach(function (cb) { cb.checked = true; });
            if (selectAllCb) selectAllCb.checked = true;
            if (selectAllCb) selectAllCb.indeterminate = false;
          }
          applyFilters();
        });
      }

      const applyFilters = () => {
        const filterState = window.__prioritizedSchoolsFilters || (window.__prioritizedSchoolsFilters = {});
        headers.forEach(function (h, i) {
          const fk = h.getAttribute("data-filter-key") || "ps-idx-" + i;
          const dd = h.querySelector(".filter-dropdown");
          if (!dd) return;
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
            const sel = filterState[fk];
            if (sel === null || sel === undefined) return;
            if (Array.isArray(sel) && sel.length === 0) return;
            const cell = tr.querySelector("td[data-filter=\"col-" + i + "\"]");
            const raw = (cell ? cell.textContent : "").trim();
            const val = raw || "(blank)";
            if (sel.indexOf(val) < 0) show = false;
          });
          tr.classList.toggle("filter-hidden", !show);
        });

        const vals = getUniqueValues();
        const sel = filterState[filterKey];
        filterBtn.classList.toggle("filter-active", !!(sel !== null && sel !== undefined && sel.length < vals.length));
      };

      filterBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        e.preventDefault();
        const isOpen = filterDropdown.classList.contains("is-open");
        table.querySelectorAll(".filter-dropdown.is-open").forEach(function (d) {
          d.classList.remove("is-open");
        });
        if (!isOpen) {
          populateDropdown();
          filterDropdown.classList.add("is-open");
        }
      });
    });

    if (!document._prioritizedSchoolsFilterClickOutside) {
      document._prioritizedSchoolsFilterClickOutside = true;
      document.addEventListener("click", function (e) {
        if (e.target && e.target.closest && e.target.closest(".ps-prioritized-table .filter-dropdown")) return;
        if (e.target && e.target.closest && (e.target.closest(".ps-prioritized-table .filter-btn") || e.target.closest(".ps-prioritized-table .filter-clear-col"))) return;
        document.querySelectorAll(".ps-prioritized-table .filter-dropdown.is-open").forEach(function (d) {
          d.classList.remove("is-open");
        });
      });
    }

    const clearBtn = container.querySelector("#psClearAllFiltersBtn");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        window.__prioritizedSchoolsFilters = {};
        window.__prioritizedSchoolsFilterValuesCache = {};
        table.querySelectorAll(".filter-dropdown.is-open").forEach(function (d) {
          d.classList.remove("is-open");
        });
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
    const table = container && container.querySelector("table.ps-prioritized-table");
    if (!table) return;

    table.querySelectorAll("th.sortable-header").forEach(function (header) {
      header.addEventListener("click", function (e) {
        if (e.target && (e.target.classList.contains("filter-btn") || e.target.closest(".filter-dropdown"))) return;
        const tbody = table.querySelector("tbody");
        if (!tbody) return;
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
          let valA = (cellA ? cellA.textContent : "").trim();
          let valB = (cellB ? cellB.textContent : "").trim();

          if (dataType === "number") {
            valA = parseFloat(String(valA).replace(/[^0-9.-]/g, "")) || 0;
            valB = parseFloat(String(valB).replace(/[^0-9.-]/g, "")) || 0;
          }

          if (valA < valB) return newDir === "asc" ? -1 : 1;
          if (valA > valB) return newDir === "asc" ? 1 : -1;
          return 0;
        });

        rows.forEach(function (row) {
          tbody.appendChild(row);
        });
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
    // Placeholder for any future UI-level listeners
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


