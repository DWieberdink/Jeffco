// ✅ PrioritizationUI.js (clean rebuild)
// Handles UI for strategy group prioritization (Strategy Candidate Groups + subgroups)

window.prioritizationUI = {
  currentStrategyGroup: null,
  schoolDataWithDecisions: [],
  currentOutcomeFilter: null,

  // Initialize the prioritization UI
  initialize: function (schoolDataWithDecisions) {
    console.log("🎨 Initializing Prioritization UI");
    this.schoolDataWithDecisions = schoolDataWithDecisions || [];
    this.currentOutcomeFilter = null;

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

  // Render main strategy group tabs
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

    // Pseudo-group tab to see all relevant schools together
    const allTab = document.createElement("button");
    allTab.textContent = "All Expansion + Maintenance";
    allTab.className = "strategy-group-tab";
    allTab.dataset.strategyGroup = "__ALL_EXP_MAINT__";
    allTab.style.cssText = [
      "padding: 0.5rem 1rem",
      "border: 1px solid #ddd",
      "background: #f5f5f5",
      "cursor: pointer",
      "border-radius: 4px",
      "font-size: 0.9em",
      "transition: all 0.2s",
      "font-weight: 500"
    ].join(";") + ";";

    // Style if currently selected
    if (this.currentStrategyGroup === "__ALL_EXP_MAINT__") {
      allTab.style.background = "#007cbf";
      allTab.style.color = "white";
      allTab.style.borderColor = "#007cbf";
    }

    allTab.addEventListener("click", () => {
      this.selectStrategyGroup("__ALL_EXP_MAINT__");
    });

    tabsContainer.appendChild(allTab);

    availableGroups.forEach((group, index) => {
      const tab = document.createElement("button");
      tab.textContent = `${index + 1}: ${group.name}`;
      tab.className = "strategy-group-tab";
      tab.dataset.strategyGroup = group.name;
      tab.style.cssText = [
        "padding: 0.5rem 1rem",
        "border: 1px solid #ddd",
        "background: #f5f5f5",
        "cursor: pointer",
        "border-radius: 4px",
        "font-size: 0.9em",
        "transition: all 0.2s"
      ].join(";") + ";";

      if (this.currentStrategyGroup === group.name) {
        tab.style.background = "#007cbf";
        tab.style.color = "white";
        tab.style.borderColor = "#007cbf";
      }

      tab.addEventListener("click", () => {
        this.selectStrategyGroup(group.name);
      });

      tabsContainer.appendChild(tab);
    });

    // Ensure some group is selected
    if (this.currentStrategyGroup === "__ALL_EXP_MAINT__") {
      this.selectStrategyGroup("__ALL_EXP_MAINT__");
    } else if (availableGroups.length > 0) {
      this.selectStrategyGroup(this.currentStrategyGroup || availableGroups[0].name);
    }
  },

  // Select a strategy group
  selectStrategyGroup: function (groupName) {
    this.currentStrategyGroup = groupName;
    this.currentOutcomeFilter = null;

    // Update tab styles
    document.querySelectorAll(".strategy-group-tab").forEach((tab) => {
      if (tab.dataset.strategyGroup === groupName) {
        tab.style.background = "#007cbf";
        tab.style.color = "white";
        tab.style.borderColor = "#007cbf";
      } else {
        tab.style.background = "#f5f5f5";
        tab.style.color = "#333";
        tab.style.borderColor = "#ddd";
      }
    });

    // Show prioritization weights section
    const weightsSection = document.getElementById("prioritization-weights-section");
    if (weightsSection) {
      weightsSection.style.display = "block";
    }

    // Render subcategory tabs for this group (no-op for combined pseudo-group)
    this.renderSubgroupTabs(groupName);

    // Render sliders for this group (special handling for combined pseudo-group)
    this.renderWeightSliders(groupName);

    // Render prioritized schools + map
    this.renderPrioritizedSchools(groupName);
    this.updateMapVisualization(groupName);
  },

  // Build slider configuration metadata (keys + labels) for a given group
  getSliderConfigs: function (baseGroupName) {
    var sliderConfigs = [];

    if (baseGroupName === "Closure/Consolidation") {
      // Closure/Consolidation framing
      sliderConfigs.push(
        {
          key: "enrollment",
          label: "Lower Enrollment",
          description: "Higher weight prioritizes schools with lower total enrollment."
        },
        {
          key: "utilizationRate",
          label: "Lower Utilization",
          description: "Higher weight prioritizes schools with lower utilization."
        },
        {
          key: "studentsInAttendanceArea",
          label: "Lower % of Students from Attendance Area",
          description:
            "Higher weight prioritizes schools with a lower percentage of students coming from their attendance area."
        },
        {
          key: "studentEconomicStatus",
          label: "Lower % High-Need Student Enrollment",
          description:
            "Higher weight prioritizes schools with a lower share of high-need students (% FRL) when considering closure."
        },
        {
          key: "buildingCondition",
          label: "Lower Composite Building Score",
          description:
            "Higher weight prioritizes schools with poorer building condition scores (lower = worse)."
        },
        {
          key: "academicPerformance",
          label: "Lower Educational Adequacy (EA)",
          description: "Higher weight prioritizes schools with lower educational adequacy."
        },
        {
          key: "pastInvestments",
          label: "Fewer Past Investments",
          description: "Higher weight prioritizes schools with fewer recent capital investments."
        },
        {
          key: "specialtyProgramOfferings",
          label: "Specialty Program Offerings",
          description:
            "Higher weight prioritizes schools with more specialty program offerings (when such data is available)."
        }
      );
    } else {
      // Expansion, Maintenance/Investment, Other framing
      sliderConfigs.push(
        {
          key: "buildingCondition",
          label: "Lower Composite Building Score",
          description:
            "Higher weight prioritizes schools with poorer building condition scores (lower = worse)."
        },
        {
          key: "academicPerformance",
          label: "Lower Educational Adequacy (EA)",
          description: "Higher weight prioritizes schools with lower educational adequacy."
        },
        {
          key: "utilizationRate",
          label: "Higher Utilization",
          description: "Higher weight prioritizes schools with higher current utilization."
        },
        {
          key: "enrollment",
          label: "Higher Enrollment",
          description: "Higher weight prioritizes schools with larger total enrollment."
        },
        {
          key: "studentEconomicStatus",
          label: "Higher Enrollment of High-Need Students",
          description:
            "Higher weight prioritizes schools with a higher share of students in poverty (% FRL)."
        },
        {
          key: "studentsInAttendanceArea",
          label: "Greater Neighborhood Capture Rate",
          description:
            "Higher weight prioritizes schools with a higher percentage of students enrolled from their attendance area."
        },
        {
          key: "welcomedStudents",
          label: "More Students Welcomed from Previous Consolidations",
          description:
            "Higher weight prioritizes schools that welcome more students from prior consolidations (when data is available)."
        },
        {
          key: "distanceFromOtherSchools",
          label: "Greater Distance from Other Schools",
          description:
            "Higher weight prioritizes schools that are farther from other schools (more geographically isolated)."
        }
      );
    }

    return sliderConfigs;
  },

  // Render weight sliders for a strategy group (left panel only)
  renderWeightSliders: function (strategyGroupName) {
    const leftPanel = document.getElementById("left-panel-weight-sliders");

    const isCombined = strategyGroupName === "__ALL_EXP_MAINT__";
    // For the combined view, use Expansion as the base profile for
    // reading current/default weights, but we will WRITE to BOTH
    // Expansion and Maintenance/Investment when sliders move.
    const baseGroupName = isCombined ? "Expansion" : strategyGroupName;

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
        strategyGroupName +
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
            strategyGroupName === "Expansion" ||
            strategyGroupName === "Maintenance/Investment"
              ? ["Expansion", "Maintenance/Investment"]
              : [strategyGroupName];

          syncGroups.forEach(function (gName) {
            window.prioritizationLogic.updateWeights(gName, updates);
          });
        }

        self.renderPrioritizedSchools(strategyGroupName);
        self.updateMapVisualization(strategyGroupName);
      });
    });
  },

  // Render subcategory (decision outcome) tabs within the current strategy group
  renderSubgroupTabs: function (strategyGroupName) {
    const section = document.getElementById("prioritized-schools-section");
    if (!section || !window.prioritizationLogic) return;

    let container = document.getElementById("strategy-subgroup-tabs");
    const tableContainer = document.getElementById("prioritized-schools-table-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "strategy-subgroup-tabs";
      container.style.cssText =
        "display:flex;flex-wrap:wrap;gap:0.25rem;margin-bottom:0.5rem;";
      if (tableContainer && tableContainer.parentNode === section) {
        section.insertBefore(container, tableContainer);
      } else {
        section.insertBefore(container, section.firstChild);
      }
    }

    let outcomes;
    // For the combined Expansion + Maintenance view, build a merged
    // list of outcomes from both strategy groups so the subcategory
    // chips (e.g., Building Addition, Targeted Capital Investment)
    // are still available.
    if (strategyGroupName === "__ALL_EXP_MAINT__") {
      const pl = window.prioritizationLogic;
      const expSummary = pl.getOutcomeSummaryForStrategy("Expansion") || [];
      const maintSummary =
        pl.getOutcomeSummaryForStrategy("Maintenance/Investment") || [];

      const countMap = {};
      const addToMap = function (list) {
        list.forEach((entry) => {
          const o = entry.outcome;
          const c = entry.count || 0;
          countMap[o] = (countMap[o] || 0) + c;
        });
      };

      addToMap(expSummary);
      addToMap(maintSummary);

      outcomes = [];

      // Preserve the configured outcome order from both groups
      ["Expansion", "Maintenance/Investment"].forEach((groupName) => {
        const groupDef = pl.strategyGroups && pl.strategyGroups[groupName];
        if (!groupDef || !Array.isArray(groupDef.outcomes)) return;
        groupDef.outcomes.forEach((outcomeName) => {
          if (Object.prototype.hasOwnProperty.call(countMap, outcomeName)) {
            outcomes.push({
              outcome: outcomeName,
              count: countMap[outcomeName] || 0
            });
            // Avoid duplicates if the same outcome appeared in both lists
            delete countMap[outcomeName];
          }
        });
      });

      // Any remaining outcomes that weren't in the configured arrays
      Object.keys(countMap).forEach((o) => {
        outcomes.push({ outcome: o, count: countMap[o] || 0 });
      });
    } else {
      outcomes =
      window.prioritizationLogic.getOutcomeSummaryForStrategy(strategyGroupName);
    }
    if (!outcomes || outcomes.length === 0) {
      container.innerHTML = "";
      return;
    }

    const makeButtonActive = function (btn) {
      btn.style.background = "#007cbf";
      btn.style.color = "white";
      btn.style.borderColor = "#007cbf";
      btn.style.fontWeight = "600";
    };

    const baseBtnStyle = [
      "padding: 0.35rem 0.75rem",
      "border: 1px solid #ccc",
      "background: #ffffff",
      "cursor: pointer",
      "border-radius: 999px",
      "font-size: 0.85em",
      "font-weight: 500",
      "color: #333333",
      "transition: all 0.2s",
      "white-space: nowrap"
    ].join(";") + ";";

    container.innerHTML = "";

    const self = this;

    // "All" button
    const allBtn = document.createElement("button");
    allBtn.textContent = "All";
    allBtn.className = "strategy-subgroup-tab";
    allBtn.style.cssText = baseBtnStyle;
    if (!this.currentOutcomeFilter) {
      makeButtonActive(allBtn);
    }
    allBtn.addEventListener("click", function () {
      self.currentOutcomeFilter = null;
      self.renderSubgroupTabs(strategyGroupName);
      self.renderPrioritizedSchools(strategyGroupName);
      self.updateMapVisualization(strategyGroupName);
    });
    container.appendChild(allBtn);

    // One button per decision outcome in this group
    outcomes.forEach(function (entry) {
      const outcome = entry.outcome;
      const count = entry.count;
      const btn = document.createElement("button");
      btn.textContent = typeof count === "number" ? outcome + " (" + count + ")" : outcome;
      btn.className = "strategy-subgroup-tab";
      btn.style.cssText = baseBtnStyle;

      if (self.currentOutcomeFilter === outcome) {
        makeButtonActive(btn);
      }
      if (!count) {
        btn.style.opacity = "0.6";
      }

      btn.addEventListener("click", function () {
        self.currentOutcomeFilter = outcome;
        self.renderSubgroupTabs(strategyGroupName);
        self.renderPrioritizedSchools(strategyGroupName);
        self.updateMapVisualization(strategyGroupName);
      });

      container.appendChild(btn);
    });
  },

  // Render prioritized schools table
  renderPrioritizedSchools: function (strategyGroupName) {
    const container = document.getElementById("prioritized-schools-table-container");
    if (!container || !window.prioritizationLogic) return;

    const outcomeFilter = this.currentOutcomeFilter;
    const isCombined = strategyGroupName === "__ALL_EXP_MAINT__";
    const baseGroupName = isCombined ? "Expansion" : strategyGroupName;
    const rankedSchools = isCombined
      ? window.prioritizationLogic.rankSchoolsAcrossStrategies(
          ["Expansion", "Maintenance/Investment"],
      outcomeFilter
        )
      : window.prioritizationLogic.rankSchools(strategyGroupName, outcomeFilter);

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

    // Render equity overview for all schools in the current view
    // (including All Expansion + Maintenance, where we want the
    // combined impact across both strategy groups).
    this.renderEquityAnalysis(rankedSchools);
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
  updateMapVisualization: function (strategyGroupName) {
    if (!window.prioritizationLogic) return;

    const outcomeFilter = this.currentOutcomeFilter;
    const isCombined = strategyGroupName === "__ALL_EXP_MAINT__";
    const rankedSchools = isCombined
      ? window.prioritizationLogic.rankSchoolsAcrossStrategies(
          ["Expansion", "Maintenance/Investment"],
      outcomeFilter
        )
      : window.prioritizationLogic.rankSchools(strategyGroupName, outcomeFilter);

    if (!window.priorityScores) {
      window.priorityScores = {};
    }
    window.priorityScores = {};

    rankedSchools.forEach(function (school) {
      const name = school["Building Name"] || school.name;
      if (name) {
        window.priorityScores[name] = {
          score: school.priorityScore,
          strategyGroup: strategyGroupName
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
    if (this.currentStrategyGroup) {
      this.selectStrategyGroup(this.currentStrategyGroup);
    }
  }
};

console.log("✅ PrioritizationUI.js loaded");


