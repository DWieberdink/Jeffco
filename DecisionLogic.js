// This script is now part of the main document. No need for master/slave logic.
console.log("🚀 Initializing Decision Logic directly in the main document");

// Expose decision logic to the global scope
window.decisionLogic = {
  thresholds: {
    enrollmentThreshold: 200,
    utilization: 0.60,
    utilizationHigh: 1.00,
    enrollmentGrowth: 0,
    distanceUnderutilized: 3.5,
    siteCapacity: "Yes",
    buildingThreshold: 1.5,
    buildingThresholdAbove: 1.5,
    buildingThresholdBelow: 1.5,
    buildingThresholdFlow4: 1.5,
    adequateProgramsMin: 50, // Changed to percentage (0-100)
    recentInvestments: 5, // Changed to millions of dollars
    distanceReceiving: 1.0,
    // Enrollment thresholds by school level
    elementaryEnrollment: 240,
    k8Enrollment: 360,
    middleEnrollment: 500,
    highEnrollment: 700,
    k12Enrollment: 600,
    // Distance thresholds by school level
    elementaryDistance: 3.5,
    k8Distance: 3.5,
    middleDistance: 5.0,
    highDistance: 7.0,
    k12Distance: 6.0,
  },
  schoolData: [],
  lastData: [],

  // Expose methods
  initialize: null,
  recalculateEverything: null,
  handleAssignmentResults: null,
  updateThresholds: null,
};

document.addEventListener("DOMContentLoaded", () => {
  const self = window.decisionLogic; // Reference to our exposed object

  function classifyRow(decision) {
    if (decision.includes("Closure")) return "Closure";
    if (decision.includes("Monitoring")) return "Monitoring";
    if (decision.includes("Building") && decision.includes("Programmatic")) return "BuildingProgramInvestment";
    if (decision.includes("Building Investment")) return "BuildingInvestment";
    if (decision.includes("Programmatic Investment")) return "ProgramInvestment";
    if (decision.includes("Building Addition")) return "BuildingAddition";
    if (decision.includes("evaluation")) return "Evaluation";
    return "Unknown";
  }

  // Helper function to determine enrollment decision based on school level
  function getEnrollmentDecision(row, t) {
    const utilization = +row.Utilization;
    const enrollment = parseFloat((row.Enrollment || '').toString().replace(/,/g, '').trim());
    const schoolLevel = (row["School Level"] || '').toLowerCase();
    
    // Get enrollment thresholds from slider values
    let enrollmentThreshold;
    if (schoolLevel.includes("elementary")) {
      enrollmentThreshold = t.elementaryEnrollment || 240;
    } else if (schoolLevel.includes("k-8")) {
      enrollmentThreshold = t.k8Enrollment || 360;
    } else if (schoolLevel.includes("middle")) {
      enrollmentThreshold = t.middleEnrollment || 500;
    } else if (schoolLevel.includes("high")) {
      enrollmentThreshold = t.highEnrollment || 700;
    } else if (schoolLevel.includes("6-12")) {
      enrollmentThreshold = t.k12Enrollment || 600;
    } else {
      // Default threshold for unknown school types
      enrollmentThreshold = 400;
    }
    
    // Check if utilization below threshold OR enrollment below level-specific threshold
    // Either condition must be true for the school to be considered underutilized (OR logic)
    const utilizationBelowThreshold = utilization < t.utilization;
    const enrollmentBelowThreshold = enrollment < enrollmentThreshold;
    
    console.log(`📊 DecisionLogic - Enrollment decision for ${row["Building Name"]}:`);
    console.log(`  - School Level: "${schoolLevel}"`);
    console.log(`  - Utilization: ${utilization} < ${t.utilization}? ${utilizationBelowThreshold}`);
    console.log(`  - Enrollment: ${enrollment} < ${enrollmentThreshold}? ${enrollmentBelowThreshold}`);
    console.log(`  - Final decision (either below): ${(utilizationBelowThreshold || enrollmentBelowThreshold) ? "Yes" : "No"}`);
    
    return (utilizationBelowThreshold || enrollmentBelowThreshold) ? "Yes" : "No";
  }


  function evaluateSchool(row, t = self.thresholds) {
    // Use EXACTLY the same logic as FlowchartLogic.js evaluatePath
    const decisions = {
      // Flow 1 - Main Decision (F1_UTIL1 now includes enrollment logic)
      util1: getEnrollmentDecision(row, t),
      util2: +row.Utilization > t.utilizationHigh ? "Yes" : "No",
      dist: (() => {
        const schoolLevel = (row["School Level"] || '').toLowerCase();
        let distanceThreshold;
        
        if (schoolLevel.includes("elementary")) {
          distanceThreshold = t.elementaryDistance;
        } else if (schoolLevel.includes("k-8")) {
          distanceThreshold = t.k8Distance;
        } else if (schoolLevel.includes("middle")) {
          distanceThreshold = t.middleDistance;
        } else if (schoolLevel.includes("high")) {
          distanceThreshold = t.highDistance;
        } else if (schoolLevel.includes("6-12") || schoolLevel.includes("k-12")) {
          distanceThreshold = t.k12Distance;
        } else {
          distanceThreshold = t.middleDistance; // Default fallback
        }
        
        return +row.DistanceUnderutilizedschools <= distanceThreshold ? "Yes" : "No";
      })(),
      growth: +row["Future_EnrollmentGrowth"] > t.enrollmentGrowth ? "Yes" : "No",
      
      // Flow 2 - Building Addition
      edu2: (+row.EducationalAdequacy * 100) >= t.adequateProgramsMin ? "Yes" : "No",
      fac2: +row.BuildingScore <= t.buildingThreshold ? "Yes" : "No",
      expand: (row.SiteCapacity === "Yes" || row.SiteCapacity === "yes" || row.SiteCapacity === "YES") ? "Yes" : "No",
      
      // Flow 3 - Maintenance/Investment
      fac3_below: +row.BuildingScore <= t.buildingThresholdBelow ? "Yes" : "No",
      edu3: (+row.EducationalAdequacy * 100) >= t.adequateProgramsMin ? "Yes" : "No",
      edu3_2: (() => {
        // OR function: Below 50% percentile EA category OR safety/security issues
        const hasBelow50PercentileCategory = row["Below50PCTL_EA_Cat"];
        const isBelow50Percentile = hasBelow50PercentileCategory === "Yes" || hasBelow50PercentileCategory === "yes" || hasBelow50PercentileCategory === "YES";
        const hasSafetyIssues = (row.DepartmentalDeficiency && row.DepartmentalDeficiency.toLowerCase().includes('safety')) || 
                               (row.DepartmentalDeficiency && row.DepartmentalDeficiency.toLowerCase().includes('security'));
        return (isBelow50Percentile || hasSafetyIssues) ? "Yes" : "No";
      })(),
      fac3_above: +row.BuildingScore <= t.buildingThresholdAbove ? "Yes" : "No",
      
      // Flow 4 - Consolidation/Closure
      invest: +row.RecentInvestments >= t.recentInvestments ? "Yes" : "No",
      edu4: (+row.EducationalAdequacy * 100) >= t.adequateProgramsMin ? "Yes" : "No",
      fac4: +row.BuildingScore <= t.buildingThresholdFlow4 ? "Yes" : "No",
      dist4: (() => {
        const schoolLevel = (row["School Level"] || '').toLowerCase();
        let distanceThreshold;
        
        if (schoolLevel.includes("elementary")) {
          distanceThreshold = t.elementaryDistance;
        } else if (schoolLevel.includes("k-8")) {
          distanceThreshold = t.k8Distance;
        } else if (schoolLevel.includes("middle")) {
          distanceThreshold = t.middleDistance;
        } else if (schoolLevel.includes("high")) {
          distanceThreshold = t.highDistance;
        } else if (schoolLevel.includes("6-12")) {
          distanceThreshold = t.k12Distance;
        } else {
          distanceThreshold = t.middleDistance; // Default to middle school distance
        }
        
        return +row.DistanceUnderutilizedschools <= distanceThreshold ? "Yes" : "No";
      })(),
    };
    
    console.log("📊 Decisions for", row["Building Name"], ":", decisions);
    console.log("📊 Raw data - Utilization:", row.Utilization, "BuildingScore:", row.BuildingScore, "EducationalAdequacy:", row.EducationalAdequacy);
    console.log("📊 Raw data - DistanceUnderutilizedschools:", row.DistanceUnderutilizedschools, "Growth:", row["Future_EnrollmentGrowth"]);
    
    let currentFlow = 1;
    let finalDecision = "Unknown";
    
    // FLOW 1 - Main Decision Tree (EXACTLY from FlowchartLogic.js)
    if (decisions.util1 === "Yes") {
      // School is below utilization OR enrollment threshold (or both)
      if (decisions.dist === "Yes") {
        if (decisions.growth === "Yes") {
          currentFlow = 3;
        } else {
          currentFlow = 4;
        }
      } else {
        currentFlow = 3;
      }
    } else {
      // School does NOT meet both criteria (above at least one threshold)
      if (decisions.util2 === "Yes") {
        currentFlow = 2;
      } else {
        currentFlow = 3;
      }
    }
    
    // FLOW 2 - Building Addition (EXACTLY from FlowchartLogic.js)
    if (currentFlow === 2) {
      if (decisions.expand === "Yes") {
        if (decisions.fac2 === "Yes") {
          if (decisions.edu2 === "Yes") {
            finalDecision = "Building Addition"; // F2_OUT1
          } else {
            finalDecision = "Building Addition with Capital Investment"; // F2_OUT4
          }
        } else {
          if (decisions.edu2 === "Yes") {
            finalDecision = "Building Addition with Capital Investment"; // F2_OUT4
          } else {
            finalDecision = "Building Replacement"; // F2_OUT3
          }
        }
      } else {
        finalDecision = "Policy Solution for Overcrowding"; // F2_OUT2
      }
    }
    
    // FLOW 3 - Maintenance/Investment (EXACTLY from FlowchartLogic.js)
    if (currentFlow === 3) {
      if (decisions.fac3_above === "Yes") {
        if (decisions.fac3_below === "Yes") {
          finalDecision = "Targeted Capital Investment"; // F3_OUT1
        } else {
          if (decisions.edu3_2 === "Yes") {
            finalDecision = "Standard Maintenance"; // F3_OUT2
          } else {
            finalDecision = "Targeted Capital Investment"; // F3_OUT1
          }
        }
      } else {
        if (decisions.edu3 === "Yes") {
          finalDecision = "Major Capital Investment"; // F3_OUT3
        } else {
          finalDecision = "Building Replacement"; // F3_OUT4
        }
      }
    }
    
    // FLOW 4 - Consolidation/Closure (EXACTLY from FlowchartLogic.js)
    if (currentFlow === 4) {
      if (decisions.invest === "Yes") {
        finalDecision = "Welcoming School"; // F4_OUT1
      } else {
        if (decisions.edu4 === "Yes") {
          if (decisions.fac4 === "Yes") {
            finalDecision = "Welcoming School"; // F4_OUT1
          } else {
            finalDecision = "Welcoming School with Capital Investment"; // F4_OUT2
          }
        } else {
          if (decisions.fac4 === "Yes") {
            finalDecision = "Welcoming School with Capital Investment"; // F4_OUT2
          } else {
            if (decisions.dist4 === "Yes") {
              finalDecision = "Closure (Goes to Welcoming School)"; // F4_OUT3
            } else {
              finalDecision = "Welcoming School with Building Replacement"; // F4_OUT4
            }
          }
        }
      }
    }
    
    console.log("🎯 Final decision for", row["Building Name"], ":", finalDecision, "(Flow", currentFlow, ")");
    
    // Store the flow number in the row for filtering
    row.flow = currentFlow;
    
    return finalDecision;
  }

  function renderTable(data) {
    console.log("📋 renderTable called with data length:", data.length);
    const summaryDiv = document.getElementById("summary");
    const resultsDiv = document.getElementById("results");

    if (!summaryDiv || !resultsDiv) {
      console.error("❌ Cannot render tables: summary or results div not found.");
      return;
    }
    
    const allDecisions = [
      "Building Addition",
      "Policy Solution for Overcrowding",
      "Building Replacement",
      "Building Addition with Capital Investment",
      "Targeted Capital Investment",
      "Standard Maintenance",
      "Major Capital Investment",
      "Welcoming School",
      "Welcoming School with Capital Investment",
      "Closure (Goes to Welcoming School)",
      "Welcoming School with Building Replacement"
    ];
  
    const decisionCounts = {};
    allDecisions.forEach(decision => decisionCounts[decision] = 0);
  
    const rows = data.map(row => {
      const decision = row.decision || "Unknown";
      if (decisionCounts.hasOwnProperty(decision)) {
        decisionCounts[decision]++;
      } else {
        decisionCounts[decision] = 1;
      }
      return `<tr><td class="truncate-cell" data-tooltip="${row["Building Name"]}">${row["Building Name"]}</td><td class="truncate-cell" data-tooltip="${decision}">${decision}</td></tr>`;
    }).join("");
  
    const totalCount = Object.values(decisionCounts).reduce((sum, count) => sum + count, 0);
    
    console.log("📊 Decision counts:", decisionCounts);
    console.log("📊 Total schools:", totalCount);
  
    const summaryRows = allDecisions.map(decision =>
      `<tr><td class="truncate-cell" data-tooltip="${decision}" style="width: 80%;">${decision}</td><td class="text-center" style="width: 20%; min-width: 60px; max-width: 75px;">${decisionCounts[decision] || 0}</td></tr>`
    ).join("");
  
    summaryDiv.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th class="sortable-header" data-column="0" data-type="string" style="width: 80%;">Decision</th>
            <th class="sortable-header text-center" data-column="1" data-type="number" style="width: 20%; min-width: 60px; max-width: 75px;"># Schools</th>
          </tr>
        </thead>
        <tbody>${summaryRows}</tbody>
        <tfoot><tr><th>Total</th><th class="text-center">${totalCount}</th></tr></tfoot>
      </table>`;
  
    resultsDiv.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th class="sortable-header" data-column="0" data-type="string">School</th>
            <th class="sortable-header" data-column="1" data-type="string">Decision</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;

    makeTablesSortable();
  }

  function makeTablesSortable() {
    document.querySelectorAll('.sortable-header').forEach(header => {
        header.addEventListener('click', () => {
            const table = header.closest('table');
            const tbody = table.querySelector('tbody');
            const columnIndex = parseInt(header.dataset.column, 10);
            const dataType = header.dataset.type;
            const isAsc = header.classList.contains('sort-asc');
            const newDir = isAsc ? 'desc' : 'asc';

            table.querySelectorAll('.sortable-header').forEach(h => {
                h.classList.remove('sort-asc', 'sort-desc');
            });

            header.classList.add(newDir === 'asc' ? 'sort-asc' : 'sort-desc');

            const rows = Array.from(tbody.querySelectorAll('tr'));

            rows.sort((rowA, rowB) => {
                let valA = rowA.querySelectorAll('td')[columnIndex].textContent.trim();
                let valB = rowB.querySelectorAll('td')[columnIndex].textContent.trim();

                if (dataType === 'number') {
                    valA = parseFloat(valA) || 0;
                    valB = parseFloat(valB) || 0;
                }

                if (valA < valB) return newDir === 'asc' ? -1 : 1;
                if (valA > valB) return newDir === 'asc' ? 1 : -1;
                return 0;
            });

            rows.forEach(row => tbody.appendChild(row));
        });
    });
  }

  self.initialize = function() {
    return new Promise((resolve, reject) => {
      Papa.parse("./Decision Data Export.csv", {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          console.log("✅ Decision data loaded and parsed.");
          
          // Filter out schools with Include_Flow_Chart = "No"
          self.schoolData = results.data.filter(row => {
            const includeFlowChart = row.Include_Flow_Chart;
            const shouldInclude = includeFlowChart && 
                                 includeFlowChart.toLowerCase() !== 'no' && 
                                 includeFlowChart.trim() !== '';
            if (!shouldInclude) {
              console.log(`🚫 Excluding school from assessment: ${row["Building Name"]} (Include_Flow_Chart: "${includeFlowChart}")`);
            }
            return shouldInclude;
          });
          
          console.log(`📊 Filtered school data: ${results.data.length} total schools → ${self.schoolData.length} included schools`);
          self.recalculateEverything(); // Perform initial calculation & render tables
          
          // Update flowchart dropdown with filtered data
          if (typeof window.updateFlowchartDropdown === 'function') {
            window.updateFlowchartDropdown();
          }
          
          resolve(self.schoolData);   // Resolve the promise with the processed data
        },
        error: (err) => {
          console.error("❌ Failed to load decision data:", err);
          reject(err);
        },
      });
    });
  };

  self.recalculateEverything = function() {
    if (!self.schoolData || self.schoolData.length === 0) return;
    console.log("🔑 First row keys:", Object.keys(self.schoolData[0] || {}));
    console.log("♻️ Recalculating everything with thresholds:", self.thresholds);
    
    let closureCount = 0;
    self.schoolData.forEach(row => {
      // Robust enrollment field lookup
      const enrollmentRaw = row.Enrollment || row['Enrollment'] || row[' Enrollment'] || row['Enrollment '] || row['Enrollemnt'] || row['Enrolled'] || row['enrollment'] || row['enrollment_total'] || undefined;
      const enrollmentParsed = parseFloat((enrollmentRaw || '').toString().replace(/,/g, '').trim());
      console.log('📝', row['Building Name'], '| Raw:', enrollmentRaw, '| Parsed:', enrollmentParsed, '| Type:', typeof enrollmentParsed);
      const oldDecision = row.decision;
      const enrollment = enrollmentParsed;
      
      // Create temp row for evaluation
      const tempRow = { ...row, Enrollment: enrollmentParsed };
      row.decision = evaluateSchool(tempRow, self.thresholds);
      
      // Copy the flow number from the temp row back to the original
      row.flow = tempRow.flow;
      
      if (row.decision === "Candidate for Closure/Merger") {
        closureCount++;
        if (oldDecision !== row.decision) {
          console.log("🚨 School moved to closure/merger:", row["Building Name"], "enrollment:", enrollment, "threshold:", self.thresholds.enrollmentThreshold);
        }
      }
      if (oldDecision !== row.decision) {
        console.log("🔄 School decision changed:", row["Building Name"], "enrollment:", enrollment, oldDecision, "→", row.decision, "flow:", row.flow);
      }
    });
    console.log("📊 Total schools marked for closure/merger:", closureCount);
    
    // Log sample schools with flow numbers to verify they're set correctly
    const sampleSchools = self.schoolData.slice(0, 3).map(row => ({
      name: row["Building Name"],
      decision: row.decision,
      flow: row.flow
    }));
    console.log("🏫 Sample schools with flows:", sampleSchools);
    
    self.lastData = [...self.schoolData];
    renderTable(self.schoolData);
  };
  
  self.updateThresholds = function(newThresholds) {
    if (newThresholds) {
      console.log("✅ DecisionLogic received new thresholds:", newThresholds);
      console.log("📊 Enrollment thresholds changed:");
      console.log("  - Elementary:", self.thresholds.elementaryEnrollment, "→", newThresholds.elementaryEnrollment);
      console.log("  - K-8:", self.thresholds.k8Enrollment, "→", newThresholds.k8Enrollment);
      console.log("  - Middle:", self.thresholds.middleEnrollment, "→", newThresholds.middleEnrollment);
      console.log("  - High:", self.thresholds.highEnrollment, "→", newThresholds.highEnrollment);
      console.log("  - K-12:", self.thresholds.k12Enrollment, "→", newThresholds.k12Enrollment);
      Object.assign(self.thresholds, newThresholds);
      window.thresholds = self.thresholds; // For flowchart logic
      self.recalculateEverything();
    }
  };

  // No more message listener. This will be initiated from script.js
  let assignmentChartInstance;
  let distanceCompareChartInstance;
  
  self.handleAssignmentResults = function(resultsData) {
    if (resultsData) {
      console.log("✅ Handling assignment results:", resultsData);
      renderAssignmentSummary(resultsData);
      renderEnrollmentChart(resultsData.enrollmentChartData);
      renderDistanceChart(resultsData.distanceChartData);
    }
  };

  function renderAssignmentSummary(results) {
    console.log("🎯 renderAssignmentSummary called with:", results);
    const summaryDiv = document.getElementById('assignmentSummary');
    console.log("🔍 Found assignmentSummary element:", summaryDiv);
    if (!summaryDiv) {
      console.error("❌ assignmentSummary element not found!");
      return;
    }
    summaryDiv.innerHTML = results.summaryHTML;

    // Add Download CSV link
    if (results.assignments && Object.keys(results.assignments).length > 0) {
      const downloadBtn = document.createElement('button');
      downloadBtn.textContent = 'Download CSV';
      downloadBtn.style = 'margin-top:16px;padding:8px 18px;background:#007cbf;color:white;border:none;border-radius:4px;cursor:pointer;';
      downloadBtn.onclick = function() {
        const rows = [['StudentID', 'Assigned School', 'Original School']];
        for (const [studentId, assignedSchool] of Object.entries(results.assignments)) {
          rows.push([studentId, assignedSchool, results.selectedSchoolName]);
        }
        const csvContent = rows.map(r => r.map(x => '"' + String(x).replace(/"/g, '""') + '"').join(',')).join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'assignment_results.csv';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
      };
      summaryDiv.appendChild(downloadBtn);
    }
  }

  // Helper to inject .custom-tooltip CSS if not present
  function injectTooltipCSS() {
    if (document.getElementById('custom-tooltip-style')) return;
    const style = document.createElement('style');
    style.id = 'custom-tooltip-style';
    style.textContent = `
      .custom-tooltip {
        position: fixed;
        z-index: 9999;
        background: #222;
        color: #fff;
        padding: 7px 14px;
        border-radius: 6px;
        font-size: 15px;
        font-family: 'Franklin Gothic Book', 'Franklin Gothic', 'Arial Narrow', Arial, sans-serif;
        pointer-events: none;
        box-shadow: 0 1px 4px rgba(0,0,0,0.15);
        white-space: nowrap;
        opacity: 0.97;
        transition: opacity 0.1s;
      }
    `;
    document.head.appendChild(style);
  }

  function renderEnrollmentChart(chartData) {
    injectTooltipCSS();
    console.log("📊 renderEnrollmentChart called with:", chartData);
    if (assignmentChartInstance) {
      assignmentChartInstance.destroy();
    }
    const canvas = document.getElementById('assignmentChart');
    console.log("🔍 Found assignmentChart canvas:", canvas);
    if(!canvas) {
      console.error("❌ assignmentChart canvas not found!");
      return;
    }

    // Store original labels for tooltip use
    const originalLabels = chartData.labels.slice();
    // Truncate labels for display (single line)
    chartData.labels = chartData.labels.map(l => (typeof l === 'string' && l.length > 18) ? l.slice(0, 16) + '…' : l);

    canvas.height = chartData.labels.length * 14;
    const ctx = canvas.getContext('2d');

    // Custom plugin for orange capacity tick marks
    const capacityTicksPlugin = {
      id: 'capacityTicks',
      afterDatasetsDraw(chart, args, options) {
        if (!chartData.capacity) return;
        const { ctx, chartArea, scales } = chart;
        const yScale = scales.y;
        const xScale = scales.x;
        ctx.save();
        chartData.capacity.forEach((cap, i) => {
          if (cap > 0) {
            const y = yScale.getPixelForValue(chartData.labels[i]);
            const x = xScale.getPixelForValue(cap);
            ctx.beginPath();
            ctx.strokeStyle = 'orange';
            ctx.lineWidth = 3;
            ctx.moveTo(x, y - 6);
            ctx.lineTo(x, y + 6);
            ctx.stroke();
          }
        });
        ctx.restore();
      }
    };

    // Plugin to show tooltip with full school name on y-axis label hover, following the mouse
    const yAxisLabelTooltipPlugin = {
      id: 'yAxisLabelTooltip',
      afterEvent(chart, args) {
        const event = args.event;
        const yScale = chart.scales.y;
        if (!yScale) return;
        const mouseY = event.y;
        const mouseX = event.x;
        // Only show tooltip if mouse is within the y-axis label area
        const labelAreaLeft = yScale.left;
        const labelAreaRight = yScale.left + yScale.width;
        if (mouseX < labelAreaLeft || mouseX > labelAreaRight) {
          const tooltip = document.getElementById('yAxisLabelTooltip');
          if (tooltip) {
            document.body.removeChild(tooltip);
            if (tooltip._moveHandler) {
              document.removeEventListener('mousemove', tooltip._moveHandler);
            }
          }
          return;
        }
        let hoveredIndex = null;
        yScale.ticks.forEach((tick, i) => {
          const tickY = yScale.getPixelForValue(tick.value);
          if (mouseY > tickY - 7 && mouseY < tickY + 7) {
            hoveredIndex = i;
          }
        });
        let tooltip = document.getElementById('yAxisLabelTooltip');
        if (tooltip) {
          document.body.removeChild(tooltip);
          if (tooltip._moveHandler) {
            document.removeEventListener('mousemove', tooltip._moveHandler);
          }
        }
        if (hoveredIndex !== null && originalLabels[hoveredIndex]) {
          tooltip = document.createElement('div');
          tooltip.id = 'yAxisLabelTooltip';
          tooltip.className = 'custom-tooltip';
          tooltip.textContent = originalLabels[hoveredIndex];
          const clientX = event.native ? event.native.clientX : event.x;
          const clientY = event.native ? event.native.clientY : event.y;
          tooltip.style.left = (clientX + 12) + 'px';
          tooltip.style.top = (clientY + 12) + 'px';
          document.body.appendChild(tooltip);
          // Follow the mouse while hovering
          const moveHandler = (evt) => {
            const moveX = evt.clientX !== undefined ? evt.clientX : (evt.native ? evt.native.clientX : evt.x);
            const moveY = evt.clientY !== undefined ? evt.clientY : (evt.native ? evt.native.clientY : evt.y);
            tooltip.style.left = (moveX + 12) + 'px';
            tooltip.style.top = (moveY + 12) + 'px';
          };
          document.addEventListener('mousemove', moveHandler);
          tooltip._moveHandler = moveHandler;
        }
      },
      afterDraw(chart) {
        const tooltip = document.getElementById('yAxisLabelTooltip');
        if (tooltip) {
          document.body.removeChild(tooltip);
          if (tooltip._moveHandler) {
            document.removeEventListener('mousemove', tooltip._moveHandler);
          }
        }
      }
    };

    assignmentChartInstance = new Chart(ctx, {
      type: 'bar',
      data: chartData,
      options: {
        responsive: true,
        indexAxis: 'y',
        layout: { padding: { top: 0, bottom: 0, left: 5 } },
        scales: {
          x: { stacked: true, title: { display: true, text: 'Students' } },
          y: {
            stacked: true,
            position: 'left',
            ticks: {
              align: 'start',
              padding: 2,
              maxWidth: 120,
              overflow: 'truncate',
              clip: false,
              font: {
                size: 12
              }
            }
          }
        },
        plugins: { legend: { position: 'bottom' } }
      },
      plugins: [capacityTicksPlugin, yAxisLabelTooltipPlugin]
    });
    console.log("✅ Enrollment chart rendered successfully!");
  }

  function renderDistanceChart(chartData) {
    console.log("📏 renderDistanceChart called with:", chartData);
    if (distanceCompareChartInstance) {
      distanceCompareChartInstance.destroy();
    }
    const canvas = document.getElementById('distanceCompareChart');
    console.log("🔍 Found distanceCompareChart canvas:", canvas);
    if (!canvas) {
      console.error("❌ distanceCompareChart canvas not found!");
      return;
    }
    
    const ctx2 = canvas.getContext('2d');
    distanceCompareChartInstance = new Chart(ctx2, {
      type: 'bar',
      data: chartData,
      options: {
        responsive: true,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.raw} mi` } } },
        scales: { y: { beginAtZero: true, title: { display: true, text: 'Distance (miles)' } } }
      }
    });
    console.log("✅ Distance chart rendered successfully!");
  }

  // Test function for debugging
  window.testDecisionLogic = function() {
    console.log("🧪 Testing DecisionLogic with Stober Elementary");
    const stober = self.schoolData.find(r => r["Building Name"] === "Stober Elementary");
    if (stober) {
      console.log("Stober data:", stober);
      console.log("Current thresholds:", self.thresholds);
      const decision = evaluateSchool(stober, self.thresholds);
      console.log("Final decision:", decision);
    } else {
      console.log("Stober Elementary not found in school data");
    }
  };

  // Initial load is no longer started from here. It will be triggered by script.js.
});