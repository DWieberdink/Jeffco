// ✅ PrioritizationUI.js
// Handles UI for strategy group prioritization

window.prioritizationUI = {
  currentStrategyGroup: null,
  schoolDataWithDecisions: [],

  // Initialize the prioritization UI
  initialize: function(schoolDataWithDecisions) {
    console.log("🎨 Initializing Prioritization UI");
    this.schoolDataWithDecisions = schoolDataWithDecisions || [];
    
    // Initialize prioritization logic with school data
    window.prioritizationLogic.initialize(this.schoolDataWithDecisions);
    
    // Render strategy group tabs
    this.renderStrategyGroupTabs();
    
    // Set up event listeners
    this.setupEventListeners();
    
    return this;
  },

  // Render strategy group tabs
  renderStrategyGroupTabs: function() {
    const tabsContainer = document.getElementById("strategy-group-tabs");
    if (!tabsContainer) {
      console.warn("⚠️ Strategy group tabs container not found");
      return;
    }

    tabsContainer.innerHTML = "";

    const availableGroups = window.prioritizationLogic.getAvailableStrategyGroups();
    
    if (availableGroups.length === 0) {
      tabsContainer.innerHTML = '<p style="color: #888; padding: 1rem;">No strategy groups available. Please run the decision evaluation first.</p>';
      return;
    }

    availableGroups.forEach((group, index) => {
      const tab = document.createElement("button");
      // Show decision name and count (e.g., "Building Addition (3)")
      tab.textContent = `${group.name} (${group.count})`;
      tab.className = "strategy-group-tab";
      tab.dataset.strategyGroup = group.name;
      tab.style.cssText = `
        padding: 0.25rem 0.5rem;
        border: 1px solid #ddd;
        background: #f5f5f5;
        cursor: pointer;
        border-radius: 3px;
        font-size: 0.75em;
        transition: all 0.2s;
        white-space: nowrap;
        line-height: 1.2;
      `;
      
      if (index === 0) {
        tab.style.background = "#007cbf";
        tab.style.color = "white";
        tab.style.borderColor = "#007cbf";
        this.currentStrategyGroup = group.name;
      }

      tab.addEventListener("click", () => {
        this.selectStrategyGroup(group.name);
      });

      tabsContainer.appendChild(tab);
    });

    // Select first group with schools by default (skip groups with 0 schools)
    const groupsWithSchools = availableGroups.filter(g => g.count > 0);
    if (groupsWithSchools.length > 0) {
      this.selectStrategyGroup(groupsWithSchools[0].name);
    } else if (availableGroups.length > 0) {
      // If all groups have 0 schools, select the first one anyway
      this.selectStrategyGroup(availableGroups[0].name);
    }
  },

  // Select a strategy group
  selectStrategyGroup: function(groupName) {
    this.currentStrategyGroup = groupName;
    
    // Update tab styles
    document.querySelectorAll(".strategy-group-tab").forEach(tab => {
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

    // Show prioritization section
    const weightsSection = document.getElementById("prioritization-weights-section");
    if (weightsSection) {
      weightsSection.style.display = "block";
    }

    // Render weight sliders (only in left panel)
    this.renderWeightSliders(groupName);
    
    // Render prioritized schools
    this.renderPrioritizedSchools(groupName);
    
    // Update map visualization
    this.updateMapVisualization(groupName);
  },

  // Render weight sliders for a strategy group (only in left panel)
  renderWeightSliders: function(strategyGroupName) {
    const leftPanel = document.getElementById("left-panel-weight-sliders");
    
    const weights = window.prioritizationLogic.currentWeights[strategyGroupName] || 
                    window.prioritizationLogic.defaultWeights[strategyGroupName];

    const sliderConfigs = [
      { key: "utilizationRate", label: "Utilization Rate", description: "Higher weight prioritizes schools with lower utilization rates" },
      { key: "studentsInAttendanceArea", label: "Students in Attendance Area", description: "Higher weight prioritizes schools with fewer students enrolled who live in the attendance area" },
      { key: "studentEconomicStatus", label: "Student Economic Status", description: "Higher weight prioritizes schools with fewer economically disadvantaged students enrolled" },
      { key: "academicPerformance", label: "Academic Performance", description: "Higher weight prioritizes schools with lower academic performance" },
      { key: "buildingCondition", label: "Building Condition", description: "Higher weight prioritizes schools with poorer building conditions" },
      { key: "pre1978BuildingLeadRisk", label: "Pre-1978 Building Lead Risk", description: "Higher weight prioritizes schools built before 1978 (potential lead risk)" },
      { key: "adaAccessibility", label: "ADA Accessibility", description: "Higher weight prioritizes schools that are not ADA accessible" },
      { key: "acStatus", label: "AC Status", description: "Higher weight prioritizes schools with lower air conditioning coverage" }
    ];

    const createSliderHTML = (config, value) => {
      return `
        <div style="margin-bottom: 0.4rem;">
          <label style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.1rem;">
            <span style="font-weight: 500; font-size: 0.75em;">${config.label}</span>
            <span id="${config.key}-value" style="font-weight: 600; color: #007cbf; min-width: 2.5rem; text-align: right; font-size: 0.75em;">${value}</span>
          </label>
          <input 
            type="range" 
            id="${config.key}-slider" 
            min="1" 
            max="10" 
            value="${value}" 
            step="0.5"
            style="width: 100%; height: 4px;"
            data-weight-key="${config.key}"
            data-strategy-group="${strategyGroupName}"
          />
          <div style="font-size: 0.65em; color: #888; margin-top: 0.1rem; line-height: 1.2;">${config.description}</div>
        </div>
      `;
    };

    let slidersHTML = "";
    sliderConfigs.forEach(config => {
      const value = weights[config.key] || 0;
      slidersHTML += createSliderHTML(config, value);
    });

    // Only render sliders in left panel
    if (leftPanel) {
      leftPanel.innerHTML = slidersHTML;
    }

    // Add event listeners to sliders
    sliderConfigs.forEach(config => {
      const slider = document.getElementById(`${config.key}-slider`);
      const valueDisplay = document.getElementById(`${config.key}-value`);
      
      if (slider && valueDisplay) {
        slider.addEventListener("input", (e) => {
          const newValue = parseFloat(e.target.value);
          valueDisplay.textContent = newValue;
          
          // Update weights
          const updates = {};
          updates[config.key] = newValue;
          window.prioritizationLogic.updateWeights(strategyGroupName, updates);
          
          // Recalculate and re-render prioritized schools
          this.renderPrioritizedSchools(strategyGroupName);
          this.updateMapVisualization(strategyGroupName);
        });
      }
    });
  },

  // Render prioritized schools table
  renderPrioritizedSchools: function(strategyGroupName) {
    const container = document.getElementById("prioritized-schools-table-container");
    if (!container) return;

    const rankedSchools = window.prioritizationLogic.rankSchools(strategyGroupName);

    if (rankedSchools.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: #888; padding: 2rem;">No schools found for this strategy group.</p>';
      return;
    }

    // Create table with resizable columns
    const tableId = 'prioritized-schools-table';
    let tableHTML = `
      <style>
        #${tableId} {
          width: 100%;
          font-size: 0.75em;
          border-collapse: collapse;
          table-layout: fixed;
        }
        #${tableId} th, #${tableId} td {
          padding: 4px 6px;
          text-align: left;
          border: 1px solid #e5e5e5;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        #${tableId} th {
          background: #f5f5f5;
          font-weight: 600;
          position: relative;
          user-select: none;
        }
        #${tableId} tbody tr:hover {
          background: #f9f9f9;
        }
        .column-resizer {
          position: absolute;
          top: 0;
          right: 0;
          width: 4px;
          height: 100%;
          cursor: col-resize;
          background: transparent;
          z-index: 10;
        }
        .column-resizer:hover {
          background: #007cbf;
        }
        .column-resizer.dragging {
          background: #007cbf;
        }
      </style>
      <table id="${tableId}">
        <thead>
          <tr>
            <th style="width: 40px;"><span>Rank</span><div class="column-resizer" data-col="0"></div></th>
            <th style="width: 120px;"><span>School</span><div class="column-resizer" data-col="1"></div></th>
            <th style="width: 70px;"><span>Score</span><div class="column-resizer" data-col="2"></div></th>
            <th style="width: 60px;"><span>Util %</span><div class="column-resizer" data-col="3"></div></th>
            <th style="width: 50px;"><span>Area</span><div class="column-resizer" data-col="4"></div></th>
            <th style="width: 60px;"><span>FRL %</span><div class="column-resizer" data-col="5"></div></th>
            <th style="width: 60px;"><span>Bldg</span><div class="column-resizer" data-col="6"></div></th>
            <th style="width: 60px;"><span>Acad</span><div class="column-resizer" data-col="7"></div></th>
            <th style="width: 50px;"><span>Pre-78</span><div class="column-resizer" data-col="8"></div></th>
            <th style="width: 50px;"><span>ADA</span><div class="column-resizer" data-col="9"></div></th>
            <th style="width: 50px;"><span>AC %</span><div class="column-resizer" data-col="10"></div></th>
          </tr>
        </thead>
        <tbody>
    `;

    rankedSchools.forEach((school, index) => {
      const raw = school.rawData || {};
      tableHTML += `
        <tr>
          <td>${index + 1}</td>
          <td title="${school["Building Name"] || school.name || "Unknown"}">${school["Building Name"] || school.name || "Unknown"}</td>
          <td style="font-weight: 600;">${school.priorityScore.toFixed(1)}</td>
          <td>${raw.utilizationRate ? raw.utilizationRate.toFixed(1) + "%" : "N/A"}</td>
          <td>${raw.studentsInAttendanceArea || "N/A"}</td>
          <td>${raw.studentEconomicStatus ? raw.studentEconomicStatus.toFixed(1) + "%" : "N/A"}</td>
          <td>${raw.buildingCondition ? raw.buildingCondition.toFixed(1) : "N/A"}</td>
          <td>${raw.academicPerformance ? raw.academicPerformance.toFixed(1) : "N/A"}</td>
          <td>${raw.pre1978BuildingLeadRisk === "Yes" ? "Yes" : "No"}</td>
          <td>${raw.adaAccessibility === "Yes" ? "Yes" : "No"}</td>
          <td>${raw.acStatus ? raw.acStatus.toFixed(0) + "%" : "N/A"}</td>
        </tr>
      `;
    });

    tableHTML += `
        </tbody>
      </table>
    `;

    container.innerHTML = tableHTML;

    // Setup column resizing
    this.setupColumnResizing(tableId);

    // Also render equity analysis
    this.renderEquityAnalysis(rankedSchools.slice(0, 10)); // Top 10 schools
  },

  // Setup column resizing functionality
  setupColumnResizing: function(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;

    const resizers = table.querySelectorAll('.column-resizer');
    let currentResizer = null;
    let startX = 0;
    let startWidth = 0;
    let currentCol = null;

    resizers.forEach((resizer, index) => {
      resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        currentResizer = resizer;
        startX = e.clientX;
        currentCol = table.querySelectorAll('th')[index];
        startWidth = currentCol.offsetWidth;
        resizer.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      });
    });

    document.addEventListener('mousemove', (e) => {
      if (!currentResizer || !currentCol) return;

      const diff = e.clientX - startX;
      const newWidth = Math.max(30, startWidth + diff); // Minimum width of 30px
      currentCol.style.width = newWidth + 'px';
      
      // Update all cells in this column
      const colIndex = Array.from(table.querySelectorAll('th')).indexOf(currentCol);
      table.querySelectorAll(`td:nth-child(${colIndex + 1})`).forEach(cell => {
        cell.style.width = newWidth + 'px';
      });
    });

    document.addEventListener('mouseup', () => {
      if (currentResizer) {
        currentResizer.classList.remove('dragging');
        currentResizer = null;
        currentCol = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  },

  // Render equity analysis
  renderEquityAnalysis: function(topSchools) {
    // This will be added below the prioritized schools table
    const metrics = window.prioritizationLogic.calculateEquityMetrics(topSchools);
    
    // Find or create equity analysis container
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

    equityContainer.innerHTML = `
      <h4>Equity Balance Overview</h4>
      <div style="background: #f9f9f9; padding: 1rem; border-radius: 4px; margin-top: 0.5rem;">
        <div style="margin-bottom: 1rem;">
          <strong>Students Affected:</strong> ${metrics.studentsAffected.toLocaleString()}
        </div>
        <div style="margin-bottom: 1rem;">
          <strong>Avg. Free/Reduced Lunch:</strong> ${metrics.avgFreeReducedLunch.toFixed(1)}%
        </div>
        <div>
          <strong>Demographic Breakdown:</strong>
          <ul style="margin-top: 0.5rem; margin-left: 1.5rem;">
            <li>Black students: ${metrics.demographicBreakdown.black.toFixed(1)}%</li>
            <li>Hispanic students: ${metrics.demographicBreakdown.hispanic.toFixed(1)}%</li>
            <li>White students: ${metrics.demographicBreakdown.white.toFixed(1)}%</li>
          </ul>
        </div>
      </div>
    `;
  },

  // Update map visualization to show schools sized by priority
  updateMapVisualization: function(strategyGroupName) {
    const rankedSchools = window.prioritizationLogic.rankSchools(strategyGroupName);
    
    // Store priority scores in a global object for map to access
    if (!window.priorityScores) {
      window.priorityScores = {};
    }
    
    // Clear previous scores
    window.priorityScores = {};
    
    rankedSchools.forEach(school => {
      const schoolName = school["Building Name"] || school.name;
      if (schoolName) {
        window.priorityScores[schoolName] = {
          score: school.priorityScore,
          strategyGroup: strategyGroupName
        };
      }
    });

    // Update map circle sizes based on priority scores
    this.updateMapCircleSizes(rankedSchools);
  },

  // Update map circle sizes based on priority scores
  updateMapCircleSizes: function(rankedSchools) {
    if (!window.map || !window.geojsonData) {
      console.warn("⚠️ Map or geojsonData not available for priority visualization");
      return;
    }

    const map = window.map;
    const geojsonData = window.geojsonData;

    // Update GeoJSON features with priority scores
    geojsonData.features.forEach(feature => {
      const schoolName = feature.properties["Building Name"];
      const priorityData = window.priorityScores[schoolName];
      
      if (priorityData) {
        feature.properties.priorityScore = priorityData.score;
      } else {
        feature.properties.priorityScore = null;
      }
    });

    // Update the map source
    if (map.getSource('schools')) {
      map.getSource('schools').setData(geojsonData);
    }

    // Update circle radius based on priority score
    // Higher priority = larger circle (interpolate from 4 to 24 based on score 0-100)
    if (map.getLayer('schools-layer')) {
      map.setPaintProperty('schools-layer', 'circle-radius', [
        'case',
        ['has', 'priorityScore'],
        ['interpolate', ['linear'], ['get', 'priorityScore'], 0, 4, 50, 12, 100, 24],
        6 // Default size if no priority score
      ]);
    }

    console.log("✅ Map circle sizes updated based on priority scores");
  },

  // Setup event listeners
  setupEventListeners: function() {
    // Any additional event listeners can be added here
  },

  // Refresh prioritization when school data changes
  refresh: function(schoolDataWithDecisions) {
    this.schoolDataWithDecisions = schoolDataWithDecisions || [];
    window.prioritizationLogic.initialize(this.schoolDataWithDecisions);
    
    // Regenerate strategy groups from updated data (initialize already does this, but ensure it's done)
    window.prioritizationLogic.generateStrategyGroupsFromData();
    
    this.renderStrategyGroupTabs();
    
    // Select first group with schools, or keep current selection if it still exists
    const availableGroups = window.prioritizationLogic.getAvailableStrategyGroups();
    const groupsWithSchools = availableGroups.filter(g => g.count > 0);
    
    if (this.currentStrategyGroup && availableGroups.find(g => g.name === this.currentStrategyGroup)) {
      // Keep current selection if it still exists
      this.selectStrategyGroup(this.currentStrategyGroup);
    } else if (groupsWithSchools.length > 0) {
      // Select first group with schools
      this.selectStrategyGroup(groupsWithSchools[0].name);
    } else if (availableGroups.length > 0) {
      // If all groups have 0 schools, select the first one anyway
      this.selectStrategyGroup(availableGroups[0].name);
    }
  }
};

console.log("✅ PrioritizationUI.js loaded");

