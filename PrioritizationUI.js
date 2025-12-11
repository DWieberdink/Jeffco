// ✅ PrioritizationUI.js (clean rebuild)
// Handles UI for strategy group prioritization (Strategy Candidate Groups + subgroups)

window.prioritizationUI = {
  currentStrategyGroups: [],
  schoolDataWithDecisions: [],
  currentOutcomeFilters: null,

  // Initialize the prioritization UI
  initialize: function (schoolDataWithDecisions) {
    console.log("🎨 Initializing Prioritization UI");
    this.schoolDataWithDecisions = schoolDataWithDecisions || [];
    this.currentOutcomeFilters = null;

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

    const availableGroups = window.prioritizationLogic.getAvailableStrategyGroups();

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
    const initialSelection =
      Array.isArray(this.currentStrategyGroups) && this.currentStrategyGroups.length > 0
        ? this.currentStrategyGroups
        : ["__ALL_EXP_MAINT__"];

    // Keep dropdown open when interacting inside
    menu.addEventListener("click", function (e) {
      e.stopPropagation();
    });

    const addOption = function (value, text) {
      const lbl = document.createElement("label");
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
        updateLabel(selected);
      });
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(text));
      menu.appendChild(lbl);
    };

    addOption("__ALL_EXP_MAINT__", "All Expansion + Maintenance");
    availableGroups.forEach((group, index) => {
      addOption(group.name, `${index + 1}: ${group.name}`);
    });

    const updateLabel = function (vals) {
      const selected = vals && vals.length ? vals : ["__ALL_EXP_MAINT__"];
      if (selected.length === 1) {
        const val = selected[0];
        if (val === "__ALL_EXP_MAINT__") {
          labelSpan.textContent = "All Expansion + Maintenance";
        } else {
          labelSpan.textContent = val;
        }
      } else {
        labelSpan.textContent = `${selected.length} groups`;
      }
    };
    updateLabel(initialSelection);

    toggleBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      menu.style.display = menu.style.display === "block" ? "none" : "block";
    });
    document.addEventListener("click", function () {
      if (menu) menu.style.display = "none";
    });

    wrapper.appendChild(toggleBtn);
    wrapper.appendChild(menu);
    tabsContainer.appendChild(wrapper);

    // Ensure some group is selected
    this.selectStrategyGroup(initialSelection);
  },

  // Select strategy group(s)
  selectStrategyGroup: function (groupNames) {
    const namesArray = Array.isArray(groupNames) ? groupNames : [groupNames].filter(Boolean);
    this.currentStrategyGroups = namesArray;
    this.currentOutcomeFilters = null;

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

    // Render subcategory selector for this group set
    this.renderSubgroupTabs(namesArray);

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

    // Build slider configs
    const sliderConfigs = this.getSliderConfigs(baseGroupName);

    // Helper to generate slider HTML
    const createSliderHTML = function (config, internalValue) {
      const safeInternal =
        typeof internalValue === "number" && !isNaN(internalValue) ? internalValue : 0;
      const uiValue = safeInternal / 10; // 0–10 scale
      const displayValue = uiValue.toFixed(1).replace(/\.0$/, "");
      return (
        '<div style="margin-bottom: 1rem;">' +
        '<label style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">' +
        '<span style="font-weight: 500; font-size: 0.9em;">' +
        config.label +
        "</span>" +
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
        '" style="width: 100%;" ' +
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

    var slidersHTML = "";
    sliderConfigs.forEach(function (config) {
      const internalValue =
        weights && typeof weights[config.key] === "number" ? weights[config.key] : 0;
      slidersHTML += createSliderHTML(config, internalValue);
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
    const self = this;
    sliderConfigs.forEach(function (config) {
      const slider = document.getElementById(config.key + "-slider");
      const valueDisplay = document.getElementById(config.key + "-value");
      if (!slider || !valueDisplay) return;

      slider.addEventListener("input", function (e) {
        const uiValue = parseFloat(e.target.value);
        const displayValue = isNaN(uiValue)
          ? "0"
          : uiValue.toFixed(1).replace(/\.0$/, "");
        valueDisplay.textContent = displayValue;

        const internalWeight = Math.round((isNaN(uiValue) ? 0 : uiValue) * 10); // 0–100
        const updates = {};
        updates[config.key] = internalWeight;

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
    });
  },

  // Render subcategory (decision outcome) selector within the current strategy group(s), styled like School Type dropdown
  renderSubgroupTabs: function (strategyGroupNames) {
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
    const outcomeFilters = Array.isArray(this.currentOutcomeFilters)
      ? this.currentOutcomeFilters
      : null;

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

    if (outcomeFilters && outcomeFilters.length > 0) {
      rankedSchools = rankedSchools.filter((s) => {
        const outcomeName = s.decision || s.outcome || s.strategyOutcome;
        return outcomeFilters.includes(outcomeName);
      });
    }

    if (!rankedSchools || rankedSchools.length === 0) {
      container.innerHTML =
        '<p style="text-align: center; color: #888; padding: 2rem;">No schools found for this strategy group.</p>';
      return;
    }

    const tableId = "prioritized-schools-table";
    const sliderConfigs = this.getSliderConfigs(baseGroupName);
    let html = "";

    html +=
      "<style>" +
      "#" +
      tableId +
      " { width: 100%; font-size: 0.75em; border-collapse: collapse; table-layout: fixed; }" +
      "#" +
      tableId +
      " th, #" +
      tableId +
      " td { padding: 4px 6px; text-align: left; border: 1px solid #e5e5e5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }" +
      "#" +
      tableId +
      " th { background: #f5f5f5; font-weight: 600; position: relative; user-select: none; }" +
      "#" +
      tableId +
      " tbody tr:hover { background: #f9f9f9; }" +
      ".column-resizer { position: absolute; top: 0; right: 0; width: 4px; height: 100%; cursor: col-resize; background: transparent; z-index: 10; }" +
      ".column-resizer:hover { background: #007cbf; }" +
      ".column-resizer.dragging { background: #007cbf; }" +
      "</style>";

    html +=
      '<table id="' +
      tableId +
      '"><thead><tr>' +
      '<th style="width:40px;"><span>Rank</span><div class="column-resizer" data-col="0"></div></th>' +
      (isCombined
        ? '<th style="width:110px;"><span>Strategy Group</span><div class="column-resizer" data-col="1"></div></th>'
        : "") +
      '<th style="width:120px;"><span>School</span><div class="column-resizer" data-col="' +
      (isCombined ? "2" : "1") +
      '"></div></th>' +
      '<th style="width:70px;"><span>Score</span><div class="column-resizer" data-col="' +
      (isCombined ? "3" : "2") +
      '"></div></th>';

    // Dynamic metric columns aligned with prioritization weights
    let metricStartColIndex = isCombined ? 4 : 3;
    sliderConfigs.forEach(function (config, idx) {
      const colIndex = metricStartColIndex + idx;
      html +=
        '<th style="width:80px;"><span>' +
        config.label +
        '</span><div class="column-resizer" data-col="' +
        colIndex +
        '"></div></th>';
    });

    html += "</tr></thead><tbody>";

    // Helper to format values according to the metric key
    const formatValue = function (key, raw) {
      switch (key) {
        case "utilizationRate":
          return raw.utilizationRate != null
            ? raw.utilizationRate.toFixed(1) + "%"
            : "N/A";
        case "studentsInAttendanceArea":
          return raw.studentsInAttendanceArea != null
            ? raw.studentsInAttendanceArea.toFixed(1) + "%"
            : "N/A";
        case "studentEconomicStatus":
          return raw.studentEconomicStatus != null
            ? raw.studentEconomicStatus.toFixed(1) + "%"
            : "N/A";
        case "buildingCondition":
          return raw.buildingCondition != null
            ? raw.buildingCondition.toFixed(1)
            : "N/A";
        case "academicPerformance":
          return raw.academicPerformance != null
            ? raw.academicPerformance.toFixed(1) + "%"
            : "N/A";
        case "enrollment":
          return raw.enrollment != null
            ? Number(raw.enrollment).toLocaleString()
            : "N/A";
        case "welcomedStudents":
          return raw.welcomedStudents != null
            ? Number(raw.welcomedStudents).toLocaleString()
            : "N/A";
        case "distanceFromOtherSchools":
          return raw.distanceFromOtherSchools != null
            ? raw.distanceFromOtherSchools.toFixed(2) + " mi"
            : "N/A";
        case "pastInvestments":
          return raw.pastInvestments != null
            ? "$" + raw.pastInvestments.toFixed(1) + "M"
            : "N/A";
        case "specialtyProgramOfferings":
          return raw.specialtyPrograms != null
            ? raw.specialtyPrograms.toFixed(0)
            : "N/A";
        default:
          return "N/A";
      }
    };

    const self = this;

    rankedSchools.forEach(function (school, index) {
      const raw = school.rawData || {};
      const buildingName = school["Building Name"] || school.name || "Unknown";
      const strategyLabel = school.strategyGroup || "";

      html += "<tr>";
      html += "<td>" + (index + 1) + "</td>";

      if (isCombined) {
        html += "<td>" + (strategyLabel || "Unknown") + "</td>";
      }

      html +=
        '<td title="' +
        buildingName +
        '">' +
        buildingName +
        "</td>" +
        '<td style="font-weight:600;">' +
        school.priorityScore.toFixed(1) +
        "</td>";

      // Metric cells in the same order as sliderConfigs
      sliderConfigs.forEach(function (config) {
        html += "<td>" + formatValue(config.key, raw) + "</td>";
      });

      html += "</tr>";
    });

    html += "</tbody></table>";

    container.innerHTML = html;

    this.setupColumnResizing(tableId);

    // Equity overview intentionally suppressed per latest requirements.
  },

  // Setup column resizing functionality
  setupColumnResizing: function (tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;

    const resizers = table.querySelectorAll(".column-resizer");
    let currentResizer = null;
    let startX = 0;
    let startWidth = 0;
    let currentCol = null;

    resizers.forEach(function (resizer, index) {
      resizer.addEventListener("mousedown", function (e) {
        e.preventDefault();
        e.stopPropagation();
        currentResizer = resizer;
        startX = e.clientX;
        currentCol = table.querySelectorAll("th")[index];
        startWidth = currentCol.offsetWidth;
        resizer.classList.add("dragging");
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      });
    });

    document.addEventListener("mousemove", function (e) {
      if (!currentResizer || !currentCol) return;
      const diff = e.clientX - startX;
      const newWidth = Math.max(30, startWidth + diff);
      currentCol.style.width = newWidth + "px";
      const colIndex = Array.prototype.indexOf.call(
        table.querySelectorAll("th"),
        currentCol
      );
      table
        .querySelectorAll("td:nth-child(" + (colIndex + 1) + ")")
        .forEach(function (cell) {
          cell.style.width = newWidth + "px";
        });
    });

    document.addEventListener("mouseup", function () {
      if (currentResizer) {
        currentResizer.classList.remove("dragging");
        currentResizer = null;
        currentCol = null;
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
    const outcomeFilters = Array.isArray(this.currentOutcomeFilters)
      ? this.currentOutcomeFilters
      : null;

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

    if (outcomeFilters && outcomeFilters.length > 0) {
      rankedSchools = rankedSchools.filter((s) => {
        const outcomeName = s.decision || s.outcome || s.strategyOutcome;
        return outcomeFilters.includes(outcomeName);
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
    const geojsonData = window.geojsonData;

    geojsonData.features.forEach(function (feature) {
      const name = feature.properties["Building Name"];
      const p = window.priorityScores && window.priorityScores[name];
      feature.properties.priorityScore = p ? p.score : null;
    });

    if (map.getSource("schools")) {
      map.getSource("schools").setData(geojsonData);
    }

    if (map.getLayer("schools-layer")) {
      // Keep all schools the same size on the map; priority scores are still
      // attached as properties, but no longer drive circle radius.
      map.setPaintProperty("schools-layer", "circle-radius", 6);
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


