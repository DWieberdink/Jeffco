// This script is now part of the main document. No need for master/slave logic.
console.log("🚀 Initializing Decision Logic directly in the main document");

// Expose decision logic to the global scope
window.decisionLogic = {
  thresholds: {
    enrollmentThreshold: 200,
    utilization: 0.65,
    utilizationHigh: 0.95,
    enrollmentGrowth: 0,
    projectedUtilization: 0.95,
    distanceUnderutilized: 1.0,
    buildingThreshold: 1.5,
    adequateProgramsMin: 2,
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

  function evaluateSchool(row, t = self.thresholds) {
    // First check: Enrollment threshold
    // Robust enrollment field lookup
    const enrollmentRaw = row.Enrollment || row['Enrollment'] || row[' Enrollment'] || row['Enrollment '] || row['Enrollemnt'] || row['Enrolled'] || row['enrollment'] || row['enrollment_total'] || undefined;
    const enrollment = parseFloat((enrollmentRaw || '').toString().replace(/,/g, '').trim());
    if (enrollment <= t.enrollmentThreshold) {
      console.log("🚨 Enrollment below threshold - immediate closure/merger");
      return "Candidate for Closure/Merger";
    }
    
    const decisions = {
      F: +row.Utilization > t.utilization ? "Yes" : "No",
      G: +row.Utilization > t.utilizationHigh ? "Yes" : "No",
      K: +row.ExpectedUtilization10yrs > t.projectedUtilization ? "Yes" : "No",
      I: +row["2014-2024_EnrollmentGrowth"] > t.enrollmentGrowth ? "Yes" : "No",
      M: +row.DistanceUnderutilizedschools <= t.distanceUnderutilized ? "Yes" : "No",
      U: +row.BuildingTreshhold <= t.buildingThreshold ? "Yes" : "No",
      X: +row.AdequateProgramOffer >= t.adequateProgramsMin ? "Yes" : "No",
      W: +row.AdequateProgramOffer >= t.adequateProgramsMin ? "Yes" : "No",
      Z: (row.SiteCapacity || "").toLowerCase().includes("yes") ? "Yes" : "No"
    };
    decisions.O = decisions.M;

    if (decisions.F === "No") {
      if (decisions.I === "No") {
        if (decisions.M === "Yes") return "Candidate for Closure/Merger";
        if (decisions.U === "Yes") return decisions.X === "Yes" ? "Ongoing Monitoring & Evaluation" : "Programmatic Investment";
        return decisions.W === "Yes" ? "Building Investment" : "Building & Programmatic Investments";
      }
      if (decisions.U === "Yes") return decisions.X === "Yes" ? "Ongoing Monitoring & Evaluation" : "Programmatic Investment";
      return decisions.W === "Yes" ? "Building Investment" : "Building & Programmatic Investments";
    }

    if (decisions.G === "No") {
      if (decisions.U === "Yes") return decisions.X === "Yes" ? "Ongoing Monitoring & Evaluation" : "Programmatic Investment";
      return decisions.W === "Yes" ? "Building Investment" : "Building & Programmatic Investments";
    }

    if (decisions.K === "No") {
      if (decisions.U === "Yes") return decisions.X === "Yes" ? "Ongoing Monitoring & Evaluation" : "Programmatic Investment";
      return decisions.W === "Yes" ? "Building Investment" : "Building & Programmatic Investments";
    }

    if (decisions.O === "Yes") return "School-specific evaluation of alternative options";
    if (decisions.Z === "Yes") return "Candidate for Building Addition";
    return "School-specific evaluation of alternative options";
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
      "Ongoing Monitoring & Evaluation",
      "Programmatic Investment",
      "Building Investment",
      "Building & Programmatic Investments",
      "Candidate for Building Addition",
      "School-specific evaluation of alternative options",
      "Candidate for Closure/Merger"
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
      Papa.parse("https://raw.githubusercontent.com/DWieberdink/JeffCo/main/Decision%20Data%20Export.csv", {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          console.log("✅ Decision data loaded and parsed.");
          self.schoolData = results.data;
          self.recalculateEverything(); // Perform initial calculation & render tables
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
      row.decision = evaluateSchool({ ...row, Enrollment: enrollmentParsed }, self.thresholds);
      if (row.decision === "Candidate for Closure/Merger") {
        closureCount++;
        if (oldDecision !== row.decision) {
          console.log("🚨 School moved to closure/merger:", row["Building Name"], "enrollment:", enrollment, "threshold:", self.thresholds.enrollmentThreshold);
        }
      }
      if (oldDecision !== row.decision) {
        console.log("🔄 School decision changed:", row["Building Name"], "enrollment:", enrollment, oldDecision, "→", row.decision);
      }
    });
    console.log("📊 Total schools marked for closure/merger:", closureCount);
    self.lastData = [...self.schoolData];
    renderTable(self.schoolData);
  };
  
  self.updateThresholds = function(newThresholds) {
    if (newThresholds) {
      console.log("✅ DecisionLogic received new thresholds:", newThresholds);
      console.log("📊 Enrollment threshold changed from", self.thresholds.enrollmentThreshold, "to", newThresholds.enrollmentThreshold);
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

  // Initial load is no longer started from here. It will be triggered by script.js.
});