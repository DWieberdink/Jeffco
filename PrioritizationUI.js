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

  // Initialize the prioritization UI
  initialize: function (schoolDataWithDecisions) {
    console.log("🎨 Initializing Prioritization UI");
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
  renderStrategyGroupTabs: function () {
    const tabsContainer = document.getElementById("strategy-group-tabs");
    if (!tabsContainer) {
      console.warn("⚠️ Strategy group tabs container not found");
      return;
    }

    tabsContainer.innerHTML = "";

    if (!window.prioritizationLogic || !window.prioritizationLogic.getAvailableStrategyGroups) {
      console.warn("⚠️ prioritizationLogic.getAvailableStrategyGroups not available");
      return;
    }

    const rawGroups = window.prioritizationLogic.getAvailableStrategyGroups();
    // "Other" should not be user-selectable in Step 2.
    const availableGroups = Array.isArray(rawGroups)
      ? rawGroups.filter((g) => g && g.name !== "Other" && (!g.config || g.config.id !== "other"))
      : [];

    if (!availableGroups || availableGroups.length === 0) {
      tabsContainer.innerHTML =
        '<p style="color: #888; padding: 1rem;">No strategy groups available. Please run the decision evaluation first.</p>';
      return;
    }

    // Wrapper styled like School Type dropdown
    const wrapper = document.createElement("div");
    wrapper.className = "filter-dropdown";
    wrapper.style.maxWidth = "260px";

    const toggleBtn = document.createElement("button");
    toggleBtn.id = "strategy-group-toggle";
    toggleBtn.className = "compact-btn";
    toggleBtn.type = "button";
    toggleBtn.style.display = "flex";
    toggleBtn.style.alignItems = "center";
    toggleBtn.style.justifyContent = "space-between";
    toggleBtn.style.width = "100%";

    const labelSpan = document.createElement("span");
    labelSpan.id = "strategy-group-label";
    labelSpan.textContent = "Select groups";

    const chevron = document.createElement("span");
    chevron.className = "chevron";
    chevron.textContent = "▾";

    toggleBtn.appendChild(labelSpan);
    toggleBtn.appendChild(chevron);

    const menu = document.createElement("div");
    menu.id = "strategy-group-menu";
    menu.className = "filter-dropdown-menu";

    const self = this;
    const initialSelectionRaw =
      Array.isArray(this.currentStrategyGroups) && this.currentStrategyGroups.length > 0
        ? this.currentStrategyGroups
        : ["__ALL_EXP_MAINT__"];
    // Never show/select "Other" in the group selector
    const initialSelection = initialSelectionRaw.filter((v) => v !== "Other");

    // Keep dropdown open when interacting inside
    menu.addEventListener("click", function (e) {
      e.stopPropagation();
    });

    // Resolve group names for the combined selector
    const resolveGroups = function (names) {
      if (names.includes("__ALL_EXP_MAINT__")) {
        return ["Expansion", "Maintenance/Investment"];
      }
      return names;
    };

    // Build an outcome list (with counts) for ONE group or a combined group.
    const getOutcomeOptionsForGroupKey = function (groupKey) {
      const groupsToUse = groupKey === "__ALL_EXP_MAINT__"
        ? ["Expansion", "Maintenance/Investment"]
        : [groupKey];

      const countMap = {};
      const ordered = [];
      groupsToUse.forEach((gName) => {
        const list =
          (window.prioritizationLogic && window.prioritizationLogic.getOutcomeSummaryForStrategy)
            ? (window.prioritizationLogic.getOutcomeSummaryForStrategy(gName) || [])
            : [];
        list.forEach((entry) => {
          const o = entry && entry.outcome;
          if (!o) return;
          if (o === "Other / Unknown") return;
          if (!countMap.hasOwnProperty(o)) ordered.push(o);
          countMap[o] = (countMap[o] || 0) + (entry.count || 0);
        });
      });
      return ordered.map((o) => ({ outcome: o, count: countMap[o] || 0 }));
    };

    // Cursor-style separate flyout panel (appended to body)
    const isTouch = () => {
      try {
        return (
          (window.matchMedia && window.matchMedia("(hover: none)").matches) ||
          ("ontouchstart" in window)
        );
      } catch (e) {
        return false;
      }
    };

    const ensureFlyoutStyle = () => {
      if (self._outcomeFlyoutStyleInjected) return;
      const style = document.createElement("style");
      style.id = "ps-group-outcome-flyout-style";
      style.textContent =
        ".ps-group-row{display:flex;align-items:center;justify-content:space-between;gap:8px;}" +
        ".ps-group-row .ps-group-left{display:flex;align-items:center;gap:8px;min-width:0;}" +
        ".ps-group-row .ps-group-arrow{margin-left:auto;color:#6b7280;font-size:12px;cursor:pointer;padding:2px 4px;border-radius:4px;}" +
        ".ps-group-row .ps-group-arrow:hover{background:#eef2f7;color:#111;}" +
        ".ps-group-flyout{position:fixed;min-width:320px;max-width:420px;max-height:380px;overflow:auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 14px 36px rgba(0,0,0,0.22);padding:10px;z-index:5000;display:none;}" +
        ".ps-group-flyout .title{font-size:13px;font-weight:800;color:#111827;margin:2px 0 6px 0;}" +
        ".ps-group-flyout .hint{font-size:11px;color:#6b7280;margin:0 0 10px 0;line-height:1.3;}" +
        ".ps-group-flyout label{display:flex;align-items:center;gap:8px;padding:6px 6px;border-radius:8px;cursor:pointer;font-size:13px;color:#111827;}" +
        ".ps-group-flyout label:hover{background:#f3f4f6;}" +
        ".ps-group-flyout input[type=checkbox]{width:14px;height:14px;}";
      document.head.appendChild(style);
      self._outcomeFlyoutStyleInjected = true;
    };

    const ensureFlyoutEl = () => {
      ensureFlyoutStyle();
      let el = document.getElementById("psGroupOutcomeFlyout");
      if (el) return el;
      el = document.createElement("div");
      el.id = "psGroupOutcomeFlyout";
      el.className = "ps-group-flyout";
      el.addEventListener("click", (e) => e.stopPropagation());
      document.body.appendChild(el);
      return el;
    };

    let flyoutCloseTimer = null;
    const closeFlyout = () => {
      const el = document.getElementById("psGroupOutcomeFlyout");
      if (!el) return;
      el.style.display = "none";
      el.dataset.groupKey = "";
    };
    const scheduleCloseFlyout = () => {
      if (flyoutCloseTimer) clearTimeout(flyoutCloseTimer);
      flyoutCloseTimer = setTimeout(() => closeFlyout(), 140);
    };
    const cancelCloseFlyout = () => {
      if (flyoutCloseTimer) clearTimeout(flyoutCloseTimer);
      flyoutCloseTimer = null;
    };

    const openFlyoutForGroup = (anchorEl, groupKey, groupLabel) => {
      cancelCloseFlyout();
      const flyout = ensureFlyoutEl();
      flyout.innerHTML = "";

      const title = document.createElement("div");
      title.className = "title";
      title.textContent = `${groupLabel}: Outcomes`;

      const hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent =
        "Select outcomes to filter the prioritized list for this group. Leave all unchecked to include the whole group.";

      flyout.appendChild(title);
      flyout.appendChild(hint);

      const options = getOutcomeOptionsForGroupKey(groupKey);
      const selected = Array.isArray(self.outcomeFiltersByGroup[groupKey])
        ? self.outcomeFiltersByGroup[groupKey]
        : [];

      options.forEach((entry) => {
        const lbl = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = entry.outcome;
        cb.checked = selected.includes(entry.outcome);
        cb.addEventListener("change", () => {
          const checked = Array.from(flyout.querySelectorAll('input[type="checkbox"]:checked')).map(
            (n) => n.value
          );
          self.outcomeFiltersByGroup[groupKey] = checked.length ? checked : null;
          // Keep the main dropdown label explicit about the difference
          updateLabel(self.currentStrategyGroups);
          // Fluid interactivity
          self.renderPrioritizedSchools(self.currentStrategyGroups);
          self.updateMapVisualization(self.currentStrategyGroups);
        });

        lbl.appendChild(cb);
        lbl.appendChild(
          document.createTextNode(
            typeof entry.count === "number" ? `${entry.outcome} (${entry.count})` : entry.outcome
          )
        );
        flyout.appendChild(lbl);
      });

      // Position like Cursor: separate popup next to the dropdown
      flyout.style.display = "block";
      flyout.dataset.groupKey = groupKey;

      const a = anchorEl.getBoundingClientRect();
      const flyRect = flyout.getBoundingClientRect();

      let left = a.right + 10;
      let top = a.top - 8;
      if (left + flyRect.width > window.innerWidth - 8) {
        left = a.left - flyRect.width - 10;
      }
      left = Math.max(8, Math.min(left, window.innerWidth - flyRect.width - 8));
      top = Math.max(8, Math.min(top, window.innerHeight - flyRect.height - 8));

      flyout.style.left = left + "px";
      flyout.style.top = top + "px";
    };

    const addOption = function (value, text) {
      const lbl = document.createElement("label");
      // Wrap content so we can place an arrow on the right (Cursor-style)
      const row = document.createElement("div");
      row.className = "ps-group-row";
      const left = document.createElement("div");
      left.className = "ps-group-left";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = value;
      cb.checked = initialSelection.includes(value);
      cb.addEventListener("change", function () {
        let selected = Array.from(menu.querySelectorAll("input[type=checkbox]:checked")).map((n) =>
          n.value
        );

        if (this.value === "__ALL_EXP_MAINT__" && this.checked) {
          // If "All" selected, turn off others
          Array.from(menu.querySelectorAll('input[type=checkbox]')).forEach((n) => {
            if (n.value !== "__ALL_EXP_MAINT__") n.checked = false;
          });
          selected = ["__ALL_EXP_MAINT__"];
        } else if (this.value !== "__ALL_EXP_MAINT__") {
          // If any specific selected, uncheck All
          const allCb = menu.querySelector('input[value="__ALL_EXP_MAINT__"]');
          if (allCb) allCb.checked = false;
          selected = selected.filter((v) => v !== "__ALL_EXP_MAINT__");
          if (selected.length === 0) {
            // keep at least one by falling back to All
            if (allCb) allCb.checked = true;
            selected = ["__ALL_EXP_MAINT__"];
          }
        }

        self.selectStrategyGroup(selected);
        // When groups change, clear outcome filters for groups that are no longer selected.
        // Special case: "__ALL_EXP_MAINT__" implies Expansion + Maintenance/Investment are in scope,
        // so keep their filters too (even if their checkboxes are not selected).
        const stillSelected = new Set(selected);
        if (stillSelected.has("__ALL_EXP_MAINT__")) {
          stillSelected.add("Expansion");
          stillSelected.add("Maintenance/Investment");
        }
        Object.keys(self.outcomeFiltersByGroup || {}).forEach((k) => {
          if (!stillSelected.has(k)) delete self.outcomeFiltersByGroup[k];
        });
        updateLabel(selected);
      });
      left.appendChild(cb);
      left.appendChild(document.createTextNode(text));

      const arrow = document.createElement("span");
      arrow.className = "ps-group-arrow";
      arrow.textContent = "▸";
      arrow.title = "Filter outcomes…";
      arrow.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openFlyoutForGroup(arrow, value, text);
      });
      arrow.addEventListener("mouseenter", () => {
        if (!isTouch()) openFlyoutForGroup(arrow, value, text);
      });
      arrow.addEventListener("mouseleave", () => {
        if (!isTouch()) scheduleCloseFlyout();
      });

      row.appendChild(left);
      row.appendChild(arrow);
      lbl.appendChild(row);
      menu.appendChild(lbl);
    };

    addOption("__ALL_EXP_MAINT__", "All Expansion + Maintenance");
    availableGroups.forEach((group, index) => {
      addOption(group.name, `${index + 1}: ${group.name}`);
    });

    const updateLabel = function (vals) {
      const selected = vals && vals.length ? vals : ["__ALL_EXP_MAINT__"];
      const activeGroups = selected;
      let totalSelectedOutcomes = 0;
      const groupsToCount = new Set(activeGroups || []);
      if (groupsToCount.has("__ALL_EXP_MAINT__")) {
        // Also count per-group filters applied while in combined view
        groupsToCount.add("Expansion");
        groupsToCount.add("Maintenance/Investment");
      }
      Array.from(groupsToCount).forEach((g) => {
        const arr = self.outcomeFiltersByGroup ? self.outcomeFiltersByGroup[g] : null;
        if (Array.isArray(arr)) totalSelectedOutcomes += arr.length;
      });
      const outcomeSuffix = totalSelectedOutcomes
        ? ` (filtered: ${totalSelectedOutcomes} outcome${totalSelectedOutcomes === 1 ? "" : "s"})`
        : "";

      if (selected.length === 1) {
        const val = selected[0];
        if (val === "__ALL_EXP_MAINT__") {
          labelSpan.textContent = "All Expansion + Maintenance" + outcomeSuffix;
        } else {
          labelSpan.textContent = val + outcomeSuffix;
        }
      } else {
        labelSpan.textContent = `${selected.length} groups` + outcomeSuffix;
      }
    };
    updateLabel(initialSelection);

    toggleBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      menu.style.display = menu.style.display === "block" ? "none" : "block";
      if (menu.style.display !== "block") closeFlyout();
    });
    document.addEventListener("click", function (e) {
      if (!menu || !toggleBtn) return;
      const fly = document.getElementById("psGroupOutcomeFlyout");
      const t = e && e.target;
      if (menu.contains(t) || toggleBtn.contains(t) || (fly && fly.contains(t))) return;
      menu.style.display = "none";
      closeFlyout();
    });

    // Keep flyout open while hovering it (desktop)
    const fly = ensureFlyoutEl();
    fly.addEventListener("mouseenter", () => {
      if (!isTouch()) cancelCloseFlyout();
    });
    fly.addEventListener("mouseleave", () => {
      if (!isTouch()) scheduleCloseFlyout();
    });

    wrapper.appendChild(toggleBtn);
    wrapper.appendChild(menu);
    tabsContainer.appendChild(wrapper);

    // Ensure some group is selected
    this.selectStrategyGroup(initialSelection);
  },

  // Select strategy group(s)
  selectStrategyGroup: function (groupNames) {
    const namesArrayRaw = Array.isArray(groupNames) ? groupNames : [groupNames].filter(Boolean);
    const namesArray = namesArrayRaw.filter((n) => n !== "Other");
    this.currentStrategyGroups = namesArray.length ? namesArray : ["__ALL_EXP_MAINT__"];
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
      groupNames.find((g) => g !== "__ALL_EXP_MAINT__") || "Expansion";
    const isCombined =
      groupNames.length > 1 || groupNames.includes("__ALL_EXP_MAINT__");

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
        '-value" style="font-weight: 600; color: #007cbf; min-width: 3rem; text-align: right;">' +
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
      // Optional context message when viewing the combined group
      if (isCombined) {
        leftPanel.innerHTML =
          '<p style="text-align:left; color:#555; font-size:0.85em; line-height:1.4; padding:0.25rem 0 0.75rem 0;">' +
          'These weights are shared between <strong>Expansion</strong> and <strong>Maintenance/Investment</strong>. ' +
          'Adjusting a slider here (or in either individual tab) updates both strategy groups.' +
          "</p>" +
          slidersHTML;
      } else {
      leftPanel.innerHTML = slidersHTML;
      }
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
      if (names.includes("__ALL_EXP_MAINT__")) {
        return ["Expansion", "Maintenance/Investment"];
      }
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
      if (names.includes("__ALL_EXP_MAINT__")) {
        return ["Expansion", "Maintenance/Investment"];
      }
      return names;
    };

    const groupsToUse = resolveGroups(groupNames.length ? groupNames : ["Expansion"]);
    const isCombined = groupsToUse.length > 1;
    const baseGroupName = groupsToUse[0] || "Expansion";

    let rankedSchools = isCombined
      ? window.prioritizationLogic.rankSchoolsAcrossStrategies(groupsToUse, null)
      : window.prioritizationLogic.rankSchools(baseGroupName, null);

    // Apply per-group outcome filters (Cursor-style ▸ flyouts).
    if (rankedSchools && rankedSchools.length) {
      rankedSchools = rankedSchools.filter((s) => {
        const outcomeName = s.decision || s.outcome || s.strategyOutcome;
        const sg = s.strategyGroup || baseGroupName;

        // If using the combined pseudo-group, allow it to filter both Expansion + Maintenance.
        const combinedSelected = Array.isArray(outcomeFiltersByGroup["__ALL_EXP_MAINT__"])
          ? outcomeFiltersByGroup["__ALL_EXP_MAINT__"]
          : null;
        const specificSelected = Array.isArray(outcomeFiltersByGroup[sg])
          ? outcomeFiltersByGroup[sg]
          : null;

        const selected = specificSelected || (combinedSelected && (sg === "Expansion" || sg === "Maintenance/Investment") ? combinedSelected : null);
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

    const headerTableId = tableId + "-header";
    const bodyTableId = tableId + "-body";

    // Build column width model so header/body stay perfectly aligned.
    const colWidths = [];
    colWidths.push("40px"); // Rank
    if (isCombined) colWidths.push("110px"); // Strategy Group
    colWidths.push("120px"); // School
    colWidths.push("70px"); // Score
    sliderConfigs.forEach(() => colWidths.push("80px")); // enabled metrics only

    const buildColGroupHTML = function () {
      return (
        "<colgroup>" +
        colWidths.map((w) => '<col style="width:' + w + '">').join("") +
        "</colgroup>"
      );
    };

    const displayMode = self.metricDisplayMode === "scores" ? "scores" : "values";

    html +=
      "<style>" +
      // The container in index.html has its own max-height/overflow.
      // Disable that so we don't get double scrollbars and can control scrolling here.
      "#prioritized-schools-table-container { max-height: none !important; overflow: visible !important; }" +
      ".ps-prioritized-table-wrap { border: 1px solid #e5e5e5; border-radius: 6px; overflow: hidden; background: #fff; }" +
      ".ps-prioritized-table-body-scroll { max-height: 400px; overflow-y: auto; overflow-x: hidden; }" +
      ".ps-metric-toggle { display:inline-flex; border:1px solid #d1d5db; border-radius:8px; overflow:hidden; background:#fff; }" +
      ".ps-metric-toggle button { border:0; background:transparent; padding:4px 10px; font-size:12px; cursor:pointer; color:#111; }" +
      ".ps-metric-toggle button.active { background:#007cbf; color:#fff; }" +
      "#" +
      headerTableId +
      ", #" +
      bodyTableId +
      " { width: 100%; font-size: 0.75em; border-collapse: separate; border-spacing: 0; table-layout: fixed; }" +
      "#" +
      headerTableId +
      " th, #" +
      bodyTableId +
      " td { padding: 4px 6px; text-align: left; border: 1px solid #e5e5e5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }" +
      "#" +
      headerTableId +
      " th { background: #f5f5f5; font-weight: 600; position: relative; user-select: none; }" +
      "#" +
      bodyTableId +
      " tbody tr:hover { background: #f9f9f9; }" +
      // NOTE: Do not grey out any rows in this table.
      ".ps-greyed td { color: inherit; }" +
      ".ps-greyed a { color: #007cbf !important; text-decoration: underline !important; font-weight: 600; }" +
      ".column-resizer { position: absolute; top: 0; right: 0; width: 4px; height: 100%; cursor: col-resize; background: transparent; z-index: 10; }" +
      ".column-resizer:hover { background: #007cbf; }" +
      ".column-resizer.dragging { background: #007cbf; }" +
      "</style>";

    // Small toggle to switch metric columns between raw values and normalized scores
    html +=
      '<div style="display:flex; justify-content:flex-end; margin: 0 0 6px 0;">' +
      '<div class="ps-metric-toggle" role="group" aria-label="Metric columns display">' +
      '<button type="button" id="psMetricModeValues" data-mode="values"' +
      (displayMode === "values" ? ' class="active"' : "") +
      ">Show values</button>" +
      '<button type="button" id="psMetricModeScores" data-mode="scores"' +
      (displayMode === "scores" ? ' class="active"' : "") +
      ">Show scores</button>" +
      "</div></div>";

    // Header table (no body; stays visible)
    html +=
      '<div class="ps-prioritized-table-wrap">' +
      '<table id="' +
      headerTableId +
      '">' +
      buildColGroupHTML() +
      "<thead><tr>" +
      '<th><span>Rank</span><div class="column-resizer" data-col="0"></div></th>' +
      (isCombined
        ? '<th><span>Strategy Group</span><div class="column-resizer" data-col="1"></div></th>'
        : "") +
      '<th><span>School</span><div class="column-resizer" data-col="' +
      (isCombined ? "2" : "1") +
      '"></div></th>' +
      '<th><span>Score</span><div class="column-resizer" data-col="' +
      (isCombined ? "3" : "2") +
      '"></div></th>';

    // Dynamic metric columns aligned with prioritization weights
    let metricStartColIndex = isCombined ? 4 : 3;
    sliderConfigs.forEach(function (config, idx) {
      const colIndex = metricStartColIndex + idx;
      html +=
        '<th><span>' +
        config.label +
        '</span><div class="column-resizer" data-col="' +
        colIndex +
        '"></div></th>';
    });

    html += "</tr></thead></table>";

    // Body table (scrolls)
    html +=
      '<div class="ps-prioritized-table-body-scroll">' +
      '<table id="' +
      bodyTableId +
      '">' +
      buildColGroupHTML() +
      "<tbody>";

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
      const keepBlack = true; // never grey-out rows in prioritized table
      const schoolProfileHref =
        "school-profile.html?school=" +
        encodeURIComponent((buildingName || "").toString()) +
        (uid ? "&uid=" + encodeURIComponent(uid) : "");

      html += "<tr>";
      html += "<td>" + (index + 1) + "</td>";

      if (isCombined) {
        html += "<td>" + (strategyLabel || "Unknown") + "</td>";
      }

      html +=
        '<td title="' +
        buildingName +
        (decisionOutcome ? " — " + decisionOutcome : "") +
        '">' +
        '<a href="' +
        schoolProfileHref +
        '" target="_blank" rel="noopener noreferrer" ' +
        'style="color:#007cbf; text-decoration:underline; font-weight:600;" ' +
        'onclick="event.stopPropagation();">' +
        buildingName +
        "</a>" +
        "</td>" +
        '<td style="font-weight:600;">' +
        school.priorityScore.toFixed(1) +
        "</td>";

      // Metric cells in the same order as sliderConfigs (normalized 0–100)
      sliderConfigs.forEach(function (config) {
        html += "<td>" + formatValue(config.key, school) + "</td>";
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
    this.syncPrioritizedTableHeaderToBody(tableId);

    // Equity overview intentionally suppressed per latest requirements.
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

  // Setup column resizing functionality
  setupColumnResizing: function (tableId) {
    // Supports both the legacy single-table layout and the new 2-table layout:
    // - `${tableId}-header` contains the resizable header
    // - `${tableId}-body` contains the scrolling body
    const headerTable = document.getElementById(tableId + "-header") || document.getElementById(tableId);
    const bodyTable = document.getElementById(tableId + "-body") || headerTable;
    if (!headerTable || !bodyTable) return;

    const resizers = headerTable.querySelectorAll(".column-resizer");
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
        currentCol = headerTable.querySelectorAll("th")[index];
        startWidth = currentCol.offsetWidth;
        resizer.classList.add("dragging");
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      });
    });

    document.addEventListener("mousemove", function (e) {
      if (!currentResizer || !currentCol || currentIndex < 0) return;
      const diff = e.clientX - startX;
      const newWidth = Math.max(30, startWidth + diff);
      // Update colgroup widths so both header and body stay aligned.
      const headerCols = headerTable.querySelectorAll("colgroup col");
      const bodyCols = bodyTable.querySelectorAll("colgroup col");
      if (headerCols && headerCols[currentIndex]) {
        headerCols[currentIndex].style.width = newWidth + "px";
      }
      if (bodyCols && bodyCols[currentIndex]) {
        bodyCols[currentIndex].style.width = newWidth + "px";
      }
      // Also reflect on the <th> for immediate feedback.
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
      if (names.includes("__ALL_EXP_MAINT__")) {
        return ["Expansion", "Maintenance/Investment"];
      }
      return names;
    };

    const groupsToUse = resolveGroups(groupNames.length ? groupNames : ["Expansion"]);
    let rankedSchools =
      groupsToUse.length > 1
        ? window.prioritizationLogic.rankSchoolsAcrossStrategies(groupsToUse, null)
        : window.prioritizationLogic.rankSchools(groupsToUse[0], null);

    // Apply per-group outcome filters to map visualization too
    if (rankedSchools && rankedSchools.length) {
      rankedSchools = rankedSchools.filter((s) => {
        const outcomeName = s.decision || s.outcome || s.strategyOutcome;
        const sg = s.strategyGroup || groupsToUse[0];
        const combinedSelected = Array.isArray(outcomeFiltersByGroup["__ALL_EXP_MAINT__"])
          ? outcomeFiltersByGroup["__ALL_EXP_MAINT__"]
          : null;
        const specificSelected = Array.isArray(outcomeFiltersByGroup[sg])
          ? outcomeFiltersByGroup[sg]
          : null;
        const selected = specificSelected || (combinedSelected && (sg === "Expansion" || sg === "Maintenance/Investment") ? combinedSelected : null);
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


