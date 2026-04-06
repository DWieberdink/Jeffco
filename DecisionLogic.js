// This script is now part of the main document. No need for master/slave logic.
console.log("🚀 Initializing Decision Logic directly in the main document");

// Expose decision logic to the global scope
window.decisionLogic = {
  thresholds: {
    enrollmentThreshold: 200,
    utilization: 0.60,
    utilizationHigh: 0.90,
    enrollmentGrowth: 0.05,
    distanceUnderutilized: 3.5,
    siteCapacity: "Yes",
    buildingThreshold: 1.5,
    buildingThresholdAbove: 1.5,
    buildingThresholdBelow: 1.5,
    buildingThresholdFlow4: 1.5,
    adequateProgramsMin: 80, // Changed to percentage (0-100)
    attendanceAreaEnrollment: 80, // Percentage threshold for attendance area enrollment (0-100)
    distanceReceiving: 1.0,
    // Enrollment thresholds by school level
    elementaryEnrollment: 220,
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

  // Coerce a value that may be stored as a ratio (0–1) or percent (0–100)
  // into a percent on the 0–100 scale.
  function coercePercent0to100(raw) {
    const n = parseFloat((raw ?? "").toString().trim());
    if (!isFinite(n)) return 0;
    // AttendanceAreaEnrollment may appear as a ratio (0–1, e.g. 0.46 = 46%)
    // or as a percent (0–100, e.g. 46.6). Handle both.
    return n <= 1.5 ? n * 100 : n;
  }

  // BuildingScore may be stored either on a 0–1 scale (e.g. 0.62)
  // or a 0–10 scale (e.g. 6.20). Normalize to 0–10 for dashboard logic.
  function coerceBuildingScore0to10(raw) {
    const n = parseFloat((raw ?? "").toString().trim().replace(/,/g, ''));
    if (!isFinite(n)) return NaN;
    return n <= 1.5 ? n * 10 : n;
  }

  // Load Articulation Area from Map_Export.csv, keyed by Building Code (UniqueID) and Building Name.
  function loadArticulationFromMapExport() {
    return new Promise((resolve) => {
      if (window.articulationFromMapExport && typeof window.articulationFromMapExport === "object") {
        resolve(window.articulationFromMapExport);
        return;
      }
      Papa.parse("./Map_Export.csv", {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            const map = {};
            (results.data || []).forEach((row) => {
              const code = (row["Building Code"] || row.BuildingCode || "").toString().trim();
              const name = (row["Building Name"] || row.BuildingName || "").toString().trim();
              const art = (row["Articulation"] || row.Articulation || "").toString().trim();
              if (code) map[code] = art;
              if (name) map[name] = art;
            });
            window.articulationFromMapExport = map;
            resolve(map);
          } catch (e) {
            console.warn("⚠️ Failed to load Articulation from Map_Export.csv:", e);
            resolve({});
          }
        },
        error: () => resolve({}),
      });
    });
  }

  // Load distance to welcoming schools from OD_Draft.csv (origin -> min distance to any destination).
  // Keyed by CurrentSchoolCode (UniqueID format, e.g., "CO-1420-8276").
  function loadDistanceToWelcomingMap() {
    return new Promise((resolve) => {
      const cached = window.distanceToWelcomingMap;
      if (cached && typeof cached === "object" && Object.keys(cached).length > 0) {
        resolve(cached);
        return;
      }

      Papa.parse("./OD_Draft.csv", {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            // OD_Draft is student-level: each row = one student's home-to-destination distance.
            // Raw MIN is skewed by students who live next to another school → near 0 for most schools.
            // Use MEDIAN per (origin,dest) pair, then MIN over destinations for each origin.
            const pairDistances = {}; // "(originKey|destKey)" -> [dist1, dist2, ...]
            const pairMeta = {}; // "(originKey|destKey)" -> { destCode, destName, destGrades } (from last row)
            const norm = s => (s || "").toString().trim().toLowerCase();
            const normName = s => norm((s || "").toString().trim().replace(/\s+/g, " "));
            const median = (arr) => {
              if (!arr.length) return NaN;
              const s = [...arr].sort((a, b) => a - b);
              const m = Math.floor(s.length / 2);
              return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
            };

            (results.data || []).forEach((row) => {
              const originCode = (row["CurrentSchoolCode"] || row.CurrentSchoolCode || "").toString().trim();
              const originName = (row["CurrentSchoolName"] || row.CurrentSchoolName || "").toString().trim();
              if (!originCode) return;

              const destCode = (row["DestinationSchoolCode"] || row.DestinationSchoolCode || "").toString().trim();
              if (norm(originCode) === norm(destCode)) return; // exclude same-school

              const dist = parseFloat((row["LinearDistance_Miles"] || row.LinearDistance_Miles || "").toString().trim());
              if (!isFinite(dist)) return;

              const originKey = norm(originCode);
              const destKey = norm(destCode);
              const pairKey = `${originKey}|${destKey}`;
              if (!pairDistances[pairKey]) pairDistances[pairKey] = [];
              pairDistances[pairKey].push(dist);
              pairMeta[pairKey] = {
                destCode,
                destName: row["DestinationSchoolName"] || row.DestinationSchoolName || "",
                destGrades: row["DestinationSchoolGrades"] || row.DestinationSchoolGrades || ""
              };
            });

            // Build map: for each origin, min of (median dist to each dest)
            const map = {};
            const mapByName = {};
            const rowsByOrigin = {};
            Object.keys(pairDistances).forEach((pairKey) => {
              const [originKey, destKey] = pairKey.split("|");
              const med = median(pairDistances[pairKey]);
              if (!Number.isFinite(med)) return;
              if (map[originKey] === undefined || med < map[originKey]) map[originKey] = med;
              const meta = pairMeta[pairKey];
              if (meta && meta.destCode) {
                if (!rowsByOrigin[originKey]) rowsByOrigin[originKey] = [];
                rowsByOrigin[originKey].push({
                  "Network Distance (Miles)": med,
                  "NetworkDistanceMiles": med,
                  "Destination CDE Prefix": meta.destCode,
                  "DestinationCDEPrefix": meta.destCode,
                  "Destination Facility Name": meta.destName,
                  "Destination Grades": meta.destGrades
                });
              }
            });
            // mapByName: use first-seen originName per originKey (build reverse lookup from a pass)
            const originKeyToName = {};
            (results.data || []).forEach((row) => {
              const oc = (row["CurrentSchoolCode"] || row.CurrentSchoolCode || "").toString().trim();
              const on = (row["CurrentSchoolName"] || row.CurrentSchoolName || "").toString().trim();
              if (!oc || !on) return;
              const key = norm(oc);
              if (!originKeyToName[key]) originKeyToName[key] = normName(on);
            });
            Object.keys(map).forEach((k) => {
              const n = originKeyToName[k];
              if (n) mapByName[n] = map[k];
            });

            console.log("✅ Loaded distance-to-welcoming map from OD_Draft.csv (median per origin-dest) for", Object.keys(map).length, "schools");
            window.distanceToWelcomingMap = map;
            window.distanceToWelcomingMapByName = mapByName;
            window.distanceToWelcomingRowsByOrigin = rowsByOrigin;
            resolve(map);
          } catch (e) {
            console.error("❌ Error processing OD_Draft.csv:", e);
            resolve({});
          }
        },
        error: (err) => {
          console.error("❌ Failed to load OD_Draft.csv:", err);
          resolve({});
        },
      });
    });
  }

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

  // Helper: Normalize school level strings to canonical keys
  function normalizeSchoolLevel(rawLevel) {
    if (!rawLevel) return null;
    const original = rawLevel.toString().toLowerCase();
    const cleaned = original.replace(/[^a-z0-9]/g, '');
    
    // Check for elementary
    if (cleaned.includes('elementary') || cleaned === 'es') return 'elementary';
    
    // Check for K-8: look for "k" followed by "8" (with or without hyphen/dash, potentially with text after)
    // Patterns: "k-8", "k8", "k 8", "kindergarten8", etc.
    if (cleaned.includes('k8') || original.includes('k-8') || original.includes('k 8') || /k\s*[-–—]\s*8/i.test(rawLevel)) {
      return 'k8';
    }
    
    // Check for middle
    if (cleaned.includes('middle') || cleaned === 'ms') return 'middle';
    
    // Check for high
    if (cleaned.includes('high') || cleaned === 'hs') return 'high';
    
    // Check for K-12 or 6-12
    if (cleaned.includes('612') || cleaned.includes('k12') || original.includes('6-12') || original.includes('k-12') || original.includes('6 12') || original.includes('k 12')) {
      return 'k12';
    }
    
    return null;
  }

  function getEffectiveEnrollmentLocal(row) {
    if (window.getEffectiveEnrollment) return window.getEffectiveEnrollment(row);
    const e = parseFloat((row.Enrollment || '').toString().replace(/,/g, '').trim()) || 0;
    const pk = parseFloat((row.PKEnrollment || row['PKEnrollment'] || row['PK Enrollment'] || '').toString().replace(/,/g, '').trim()) || 0;
    const inc = (window.getIncludePKInEnrollment && window.getIncludePKInEnrollment());
    return inc ? e : Math.max(0, e - pk);
  }
  function getEffectiveUtilizationLocal(row) {
    if (window.getEffectiveUtilization) return window.getEffectiveUtilization(row);
    const cap = parseFloat((row.Capacity || '').toString().replace(/,/g, '').trim()) || 0;
    if (!cap || cap <= 0) return 0;
    return getEffectiveEnrollmentLocal(row) / cap;
  }

  // Helper function to determine enrollment decision based on school level
  function getEnrollmentDecision(row, t) {
    const utilization = getEffectiveUtilizationLocal(row);
    const enrollment = getEffectiveEnrollmentLocal(row);
    let schoolLevelRaw = row["School Level"] || '';
    const schoolLevel = schoolLevelRaw.toLowerCase();
    let level = normalizeSchoolLevel(schoolLevelRaw);
    
    // Special handling: If school level is "Multi-Level" or unrecognized, try to infer from school name
    if (!level && row["Building Name"]) {
      const schoolName = row["Building Name"].toString();
      level = normalizeSchoolLevel(schoolName);
      if (level) {
        console.log(`✅ DecisionLogic.getEnrollmentDecision: Inferred level "${level}" from school name "${schoolName}" (original level: "${schoolLevelRaw}")`);
      }
    }
    
    // Get enrollment thresholds from slider values
    let enrollmentThreshold;
    if (level === 'elementary') {
      enrollmentThreshold = t.elementaryEnrollment || 220;
    } else if (level === 'k8') {
      enrollmentThreshold = t.k8Enrollment || 360;
    } else if (level === 'middle') {
      enrollmentThreshold = t.middleEnrollment || 500;
    } else if (level === 'high') {
      enrollmentThreshold = t.highEnrollment || 700;
    } else if (level === 'k12') {
      enrollmentThreshold = t.k12Enrollment || 600;
    } else {
      // Unknown type - use a safe, clearly neutral default (no hard-coded 400)
      // Choose the median of current configured thresholds
      const candidates = [t.elementaryEnrollment, t.k8Enrollment, t.middleEnrollment, t.highEnrollment, t.k12Enrollment].filter(v => typeof v === 'number');
      enrollmentThreshold = candidates.sort((a,b)=>a-b)[Math.floor(candidates.length/2)] || t.middleEnrollment || 500;
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
      util2: getEffectiveUtilizationLocal(row) > t.utilizationHigh ? "Yes" : "No",
      dist: (() => {
        let schoolLevelRaw = row["School Level"] || '';
        let level = normalizeSchoolLevel(schoolLevelRaw);
        
        // Special handling: If school level is "Multi-Level" or unrecognized, try to infer from school name
        if (!level && row["Building Name"]) {
          const schoolName = row["Building Name"].toString();
          level = normalizeSchoolLevel(schoolName);
        }
        
        let distanceThreshold;
        
        if (level === 'elementary') {
          distanceThreshold = t.elementaryDistance;
        } else if (level === 'k8') {
          distanceThreshold = t.k8Distance;
        } else if (level === 'middle') {
          distanceThreshold = t.middleDistance;
        } else if (level === 'high') {
          distanceThreshold = t.highDistance;
        } else if (level === 'k12') {
          distanceThreshold = t.k12Distance;
        } else {
          distanceThreshold = t.middleDistance || 5.0; // Default fallback
        }
        
        return +row.DistanceUnderutilizedschools <= distanceThreshold ? "Yes" : "No";
      })(),
      growth: (() => {
        const g = window.getEffectiveEnrollmentGrowth ? window.getEffectiveEnrollmentGrowth(row) : null;
        const val = (g != null && Number.isFinite(g)) ? g : 0;
        return val > t.enrollmentGrowth ? "Yes" : "No";
      })(),
      
      // Flow 2 - Building Addition
      attendance: (() => {
        const raw = window.getEffectiveAttendanceAreaEnrollment ? window.getEffectiveAttendanceAreaEnrollment(row) : null;
        const val = (raw != null && Number.isFinite(raw)) ? raw : row.AttendanceAreaEnrollment;
        const attendanceAreaEnrollmentPct = coercePercent0to100(val);
        return attendanceAreaEnrollmentPct >= t.attendanceAreaEnrollment ? "Yes" : "No";
      })(),
      edu2: (+row.EducationalAdequacy * 100) >= t.adequateProgramsMin ? "Yes" : "No",
      // Node label: "Composite Building Score above?"
      fac2: coerceBuildingScore0to10(row.BuildingScore) >= t.buildingThreshold ? "Yes" : "No",
      expand: (row.SiteCapacity === "Yes" || row.SiteCapacity === "yes" || row.SiteCapacity === "YES") ? "Yes" : "No",
      
      // Flow 3 - Maintenance/Investment
      // Node label: "Composite Building Score below?"
      fac3_below: coerceBuildingScore0to10(row.BuildingScore) <= t.buildingThresholdBelow ? "Yes" : "No",
      edu3: (+row.EducationalAdequacy * 100) >= t.adequateProgramsMin ? "Yes" : "No",
      edu3_2: (() => {
        // Safety/security check: use Below50PCTL_EA_Cat (Yes = below 50% percentile EA or safety/security issues)
        const hasBelow50PercentileCategory = row["Below50PCTL_EA_Cat"];
        const isBelow50Percentile = hasBelow50PercentileCategory === "Yes" || hasBelow50PercentileCategory === "yes" || hasBelow50PercentileCategory === "YES";
        return isBelow50Percentile ? "Yes" : "No";
      })(),
      // Node label: "Composite Building Score above?"
      fac3_above: coerceBuildingScore0to10(row.BuildingScore) >= t.buildingThresholdAbove ? "Yes" : "No",
      
      // Flow 4 - Consolidation/Closure
      invest: "No",
      edu4: (+row.EducationalAdequacy * 100) >= t.adequateProgramsMin ? "Yes" : "No",
      // Node label: "Composite Building Score above?"
      fac4: coerceBuildingScore0to10(row.BuildingScore) >= t.buildingThresholdFlow4 ? "Yes" : "No",
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
    console.log("📊 Raw data - DistanceUnderutilizedschools:", row.DistanceUnderutilizedschools, "Growth:", window.getEffectiveEnrollmentGrowth ? window.getEffectiveEnrollmentGrowth(row) : null);

    const enrollment = getEffectiveEnrollmentLocal(row);
    const enrollmentLow = Number.isFinite(enrollment) && enrollment <= 300;

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
        // Include projected enrollment growth in the "overcrowding" branch:
        // only route into Flow 2 if growth is above the threshold.
        if (decisions.growth === "Yes") {
          currentFlow = 2;
        } else {
          currentFlow = 3;
        }
      } else {
        currentFlow = 3;
      }
    }

    // Override: even if enrollment growth is above threshold, if total enrollment <= 300, route to consolidation (Flow 4)
    if ((currentFlow === 2 || currentFlow === 3) && enrollmentLow) {
      currentFlow = 4;
    }

    // FLOW 2 - Building Addition (EXACTLY from FlowchartLogic.js)
    if (currentFlow === 2) {
      if (decisions.attendance === "Yes") {
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
      } else {
        finalDecision = "Policy Solution for Overcrowding"; // F2_OUT2 (attendance area enrollment below threshold)
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

  function getStrategyGroupForDecision(decision) {
    if (!decision) return "Other";
    
    // Prefer the shared strategy group definitions from prioritizationLogic
    if (window.prioritizationLogic && window.prioritizationLogic.strategyGroups) {
      const groups = window.prioritizationLogic.strategyGroups;
      for (const groupName in groups) {
        const group = groups[groupName];
        if (group && Array.isArray(group.outcomes) && group.outcomes.includes(decision)) {
          return groupName;
        }
      }
    }
    
    // Fallback keyword-based grouping if prioritizationLogic is unavailable
    if (decision.includes("Welcoming") || decision.includes("Closure")) {
      return "Closure/Consolidation";
    }
    if (
      decision.includes("Building Addition") ||
      decision.includes("Overcrowding")
    ) {
      return "Expansion";
    }
    if (
      decision.includes("Capital Investment") ||
      decision.includes("Replacement") ||
      decision.includes("Maintenance")
    ) {
      return "Maintenance/Investment";
    }
    return "Other";
  }

  function renderTable(data) {
    console.log("📋 renderTable called with data length:", data.length);
    const summaryDiv = document.getElementById("summary");
    const resultsDiv = document.getElementById("results");

    if (!summaryDiv || !resultsDiv) {
      console.error("❌ Cannot render tables: summary or results div not found.");
      return;
    }
    
    // Order summary by major candidate groups, then detailed decisions
    const decisionGroups = [
      {
        label: "Expansion / Overcrowding",
        items: [
          "Building Addition",
          "Building Addition with Capital Investment",
          "Policy Solution for Overcrowding",
          // Also show Building Replacement under this strategy header (requested to appear in both).
          "Building Replacement"
        ]
      },
      {
        label: "Closure / Consolidation",
        items: [
          "Welcoming School",
          "Welcoming School with Capital Investment",
          "Closure (Goes to Welcoming School)",
          "Welcoming School with Building Replacement"
        ]
      },
      {
        label: "Maintenance / Investment",
        items: [
          "Targeted Capital Investment",
          "Standard Maintenance",
          "Major Capital Investment",
          "Building Replacement"
        ]
      }
    ];
    const allDecisions = decisionGroups.flatMap(g => g.items);
  
    const decisionCounts = {};
    allDecisions.forEach(decision => decisionCounts[decision] = 0);
  
    const rows = data.map((row, idx) => {
      const decision = row.decision || "Unknown";
      if (decisionCounts.hasOwnProperty(decision)) {
        decisionCounts[decision]++;
      } else {
        decisionCounts[decision] = 1;
      }

      const schoolName = (row["Building Name"] || "").toString().replace(/"/g, "&quot;");
      const schoolType = (row["School Level"] || "").toString().replace(/"/g, "&quot;");
      const articulationArea = (
        row["Articulation Area"] || row["ArticulationArea"] || ""
      ).toString().replace(/"/g, "&quot;");
      const strategyGroup = getStrategyGroupForDecision(decision);

      return (
        `<tr data-row>` +
        `<td class="truncate-cell" data-tooltip="${schoolName}" data-filter="col-0">${schoolName}</td>` +
        `<td class="truncate-cell" data-tooltip="${schoolType}" data-filter="col-1">${schoolType}</td>` +
        `<td class="truncate-cell" data-tooltip="${articulationArea}" data-filter="col-2">${articulationArea || ""}</td>` +
        `<td class="truncate-cell" data-tooltip="${strategyGroup}" data-filter="col-3">${strategyGroup}</td>` +
        `<td class="truncate-cell" data-tooltip="${decision}" data-filter="col-4">${decision}</td>` +
        `</tr>`
      );
    }).join("");
  
    const totalCount = Object.values(decisionCounts).reduce((sum, count) => sum + count, 0);
    
    console.log("📊 Decision counts:", decisionCounts);
    console.log("📊 Total schools:", totalCount);
  
    const listed = new Set(allDecisions);
    const extraDecisions = Object.keys(decisionCounts).filter(k => !listed.has(k)).sort();

    const summaryRowsParts = [];
    const groupKeyForLabel = (label) =>
      "grp_" + (label || "group").toString().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

    // Inject styles once for collapsible summary groups
    injectSummaryGroupToggleStyles();

    decisionGroups.forEach(group => {
      const groupKey = groupKeyForLabel(group.label);
      const groupTotal = group.items.reduce((sum, d) => sum + (decisionCounts[d] || 0), 0);
      summaryRowsParts.push(
        `<tr class="summary-group-row" data-group="${groupKey}">` +
          `<td style="width:80%; padding-left:4px;">` +
            `<button type="button" class="summary-group-toggle" data-group="${groupKey}" aria-expanded="false">` +
              `<span class="chev" aria-hidden="true">▸</span>` +
              `<span class="label truncate-cell" data-tooltip="${group.label}">${group.label}</span>` +
            `</button>` +
          `</td>` +
          `<td class="text-center" style="width:20%; min-width:60px; max-width:75px;">${groupTotal}</td>` +
        `</tr>`
      );
      group.items.forEach(decision => {
        summaryRowsParts.push(
          `<tr class="summary-child-row is-hidden" data-parent="${groupKey}">` +
            `<td class="truncate-cell" data-tooltip="${decision}" style="width: 80%; padding-left:28px;">${decision}</td>` +
            `<td class="text-center" style="width: 20%; min-width: 60px; max-width: 75px;">${decisionCounts[decision] || 0}</td>` +
          `</tr>`
        );
      });
    });

    // Any unexpected decision values (e.g., Unknown) are grouped into a final collapsible section.
    if (extraDecisions.length > 0) {
      const otherLabel = "Other / Unknown";
      const otherKey = groupKeyForLabel(otherLabel);
      const otherTotal = extraDecisions.reduce((sum, d) => sum + (decisionCounts[d] || 0), 0);
      summaryRowsParts.push(
        `<tr class="summary-group-row" data-group="${otherKey}">` +
          `<td style="width:80%; padding-left:4px;">` +
            `<button type="button" class="summary-group-toggle" data-group="${otherKey}" aria-expanded="false">` +
              `<span class="chev" aria-hidden="true">▸</span>` +
              `<span class="label truncate-cell" data-tooltip="${otherLabel}">${otherLabel}</span>` +
            `</button>` +
          `</td>` +
          `<td class="text-center" style="width:20%; min-width:60px; max-width:75px;">${otherTotal}</td>` +
        `</tr>`
      );

      extraDecisions.forEach(decision => {
        summaryRowsParts.push(
          `<tr class="summary-child-row is-hidden" data-parent="${otherKey}">` +
            `<td class="truncate-cell" data-tooltip="${decision}" style="width: 80%; padding-left:28px;">${decision}</td>` +
            `<td class="text-center" style="width: 20%; min-width: 60px; max-width: 75px;">${decisionCounts[decision] || 0}</td>` +
          `</tr>`
        );
      });
    }
    const summaryRows = summaryRowsParts.join("");
  
    summaryDiv.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 80%;">Decision</th>
            <th class="text-center" style="width: 20%; min-width: 60px; max-width: 75px;"># Schools</th>
          </tr>
        </thead>
        <tbody>${summaryRows}</tbody>
        <tfoot><tr><th>Total</th><th class="text-center">${totalCount}</th></tr></tfoot>
      </table>`;

    // Activate collapsible behavior for summary groups (default collapsed)
    setupSummaryGroupToggles(summaryDiv);
  
    resultsDiv.innerHTML = `
      <div class="decision-by-school-wrap">
        <button type="button" id="decisionBySchoolClearFiltersBtn" class="clear-filters-btn" style="display:none;"></button>
        <div class="decision-by-school-scroll">
          <table class="data-table decision-by-school-table">
            <colgroup>
              <col data-col="0" style="width:26%">
              <col data-col="1" style="width:16%">
              <col data-col="2" style="width:18%">
              <col data-col="3" style="width:18%">
              <col data-col="4" style="width:22%">
            </colgroup>
            <thead>
              <tr>
                <th class="sortable-header filterable-header" data-column="0" data-type="string" title="School Name">
                  <span class="th-inner"><span class="th-label">School Name</span><button type="button" class="filter-btn" aria-label="Filter column" title="Filter">▾</button><button type="button" class="filter-clear-col" aria-label="Clear filter" title="Clear filter">×</button></span>
                  <div class="filter-dropdown" role="menu" aria-hidden="true"></div>
                  <div class="col-resize-handle" data-col="0" title="Drag to resize column"></div>
                </th>
                <th class="sortable-header filterable-header" data-column="1" data-type="string" title="School Type">
                  <span class="th-inner"><span class="th-label">School Type</span><button type="button" class="filter-btn" aria-label="Filter column" title="Filter">▾</button><button type="button" class="filter-clear-col" aria-label="Clear filter" title="Clear filter">×</button></span>
                  <div class="filter-dropdown" role="menu" aria-hidden="true"></div>
                  <div class="col-resize-handle" data-col="1" title="Drag to resize column"></div>
                </th>
                <th class="sortable-header filterable-header" data-column="2" data-type="string" title="Articulation Area">
                  <span class="th-inner"><span class="th-label">Articulation Area</span><button type="button" class="filter-btn" aria-label="Filter column" title="Filter">▾</button><button type="button" class="filter-clear-col" aria-label="Clear filter" title="Clear filter">×</button></span>
                  <div class="filter-dropdown" role="menu" aria-hidden="true"></div>
                  <div class="col-resize-handle" data-col="2" title="Drag to resize column"></div>
                </th>
                <th class="sortable-header filterable-header" data-column="3" data-type="string" title="Strategy Group">
                  <span class="th-inner"><span class="th-label">Strategy Group</span><button type="button" class="filter-btn" aria-label="Filter column" title="Filter">▾</button><button type="button" class="filter-clear-col" aria-label="Clear filter" title="Clear filter">×</button></span>
                  <div class="filter-dropdown" role="menu" aria-hidden="true"></div>
                  <div class="col-resize-handle" data-col="3" title="Drag to resize column"></div>
                </th>
                <th class="sortable-header filterable-header" data-column="4" data-type="string" title="Project Type">
                  <span class="th-inner"><span class="th-label">Project Type</span><button type="button" class="filter-btn" aria-label="Filter column" title="Filter">▾</button><button type="button" class="filter-clear-col" aria-label="Clear filter" title="Clear filter">×</button></span>
                  <div class="filter-dropdown" role="menu" aria-hidden="true"></div>
                  <div class="col-resize-handle" data-col="4" title="Drag to resize column"></div>
                </th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;

    // Sticky header + filter styles
    injectDecisionBySchoolStickyStyles();
    setupDecisionBySchoolFilters(resultsDiv);
    applyStoredDecisionBySchoolFilters(resultsDiv);
    setupDecisionBySchoolResizableColumns(resultsDiv);

    // Export current "Decision by School" table to CSV (in current onscreen order)
    const exportBtn = document.getElementById('exportDecisionResultsCsvBtn');
    if (exportBtn) {
      exportBtn.onclick = function () {
        try {
          const table = resultsDiv.querySelector('table.decision-by-school-table');
          if (!table) return;

          const headerCells = Array.from(table.querySelectorAll('thead th'));
          const headers = headerCells.length ? headerCells.map(th => (th.querySelector('.th-label') || th).textContent.trim()) : [];

          const bodyRows = Array.from(table.querySelectorAll('tbody tr')).filter(tr => !tr.classList.contains('filter-hidden'));
          const rowsOut = bodyRows.map(tr => {
            const cells = Array.from(tr.querySelectorAll('td')).map(td => (td.textContent || '').trim());
            return cells;
          });

          const csvEscape = (v) => {
            const s = (v ?? '').toString();
            const needsQuotes = /[",\r\n]/.test(s);
            const escaped = s.replace(/"/g, '""');
            return needsQuotes ? `"${escaped}"` : escaped;
          };

          const lines = [];
          if (headers.length) lines.push(headers.map(csvEscape).join(','));
          rowsOut.forEach(r => lines.push(r.map(csvEscape).join(',')));
          const csv = lines.join('\r\n');

          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const date = new Date();
          const yyyy = date.getFullYear();
          const mm = String(date.getMonth() + 1).padStart(2, '0');
          const dd = String(date.getDate()).padStart(2, '0');
          a.href = url;
          a.download = `Decision_By_School_${yyyy}-${mm}-${dd}.csv`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            try { document.body.removeChild(a); } catch {}
            try { URL.revokeObjectURL(url); } catch {}
          }, 50);
        } catch (e) {
          console.warn('⚠️ Unable to export Decision by School CSV:', e);
        }
      };
    }

    makeTablesSortable();
  }

  function injectSummaryGroupToggleStyles() {
    if (document.getElementById('summary-group-toggle-styles')) return;
    const style = document.createElement('style');
    style.id = 'summary-group-toggle-styles';
    style.textContent = `
      .summary-group-row {
        background: #f5f5f5;
        font-weight: 700;
      }
      .summary-group-toggle {
        appearance: none;
        -webkit-appearance: none;
        border: 0;
        background: transparent;
        padding: 0;
        margin: 0;
        width: 100%;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        font: inherit;
        color: inherit;
        text-align: left;
      }
      .summary-group-toggle .chev {
        display: inline-block;
        width: 14px;
        transform: rotate(0deg);
        transition: transform 0.12s ease-in-out;
        color: #111827;
      }
      .summary-group-toggle[aria-expanded="true"] .chev {
        transform: rotate(90deg);
      }
      .summary-child-row.is-hidden {
        display: none;
      }
    `;
    document.head.appendChild(style);
  }

  function injectDecisionBySchoolStickyStyles() {
    if (document.getElementById('decision-by-school-sticky-styles')) return;
    const style = document.createElement('style');
    style.id = 'decision-by-school-sticky-styles';
    style.textContent = `
      .decision-by-school-wrap {
        border: 1px solid #e5e5e5;
        border-radius: 6px;
        background: #fff;
        overflow: visible;
      }
      .decision-by-school-table tbody td {
        padding: 3px 4px;
      }
      .decision-by-school-scroll {
        overflow: visible;
      }
      .decision-by-school-table {
        width: 100%;
        table-layout: fixed;
        border-collapse: collapse;
        font-size: 12px;
      }
      .decision-by-school-table thead th {
        position: sticky;
        top: 0;
        z-index: 10;
        background: #f5f5f5;
        box-shadow: 0 1px 0 #e5e5e5;
        padding: 4px 3px;
        white-space: nowrap;
      }
      .decision-by-school-table thead th .th-inner {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        max-width: 100%;
        overflow: hidden;
      }
      .decision-by-school-table .th-label {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .decision-by-school-table .filter-btn {
        flex-shrink: 0;
        width: 18px;
        height: 18px;
        padding: 0;
        border: 1px solid #d1d5db;
        border-radius: 3px;
        background: #fff;
        color: #6b7280;
        font-size: 9px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .decision-by-school-table .filter-btn:hover,
      .decision-by-school-table .filter-btn.filter-active {
        background: #007cbf;
        color: #fff;
        border-color: #007cbf;
      }
      .decision-by-school-table .filter-clear-col {
        display: none;
      }
      .decision-by-school-table .filter-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        min-width: 180px;
        max-height: 220px;
        background: #fff;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        padding: 4px 6px;
        margin-top: 2px;
        overflow-y: auto;
        z-index: 1000;
        display: none;
      }
      .decision-by-school-table .filter-dropdown.is-open {
        display: block;
      }
      .decision-by-school-table .filter-dropdown input[type="search"] {
        width: 100%;
        padding: 4px 6px;
        margin-bottom: 4px;
        border: 1px solid #d1d5db;
        border-radius: 4px;
        font-size: 12px;
        box-sizing: border-box;
      }
      .decision-by-school-table .filter-dropdown label {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0;
        margin: 0;
        font-size: 12px;
        cursor: pointer;
        line-height: 1.25;
      }
      .decision-by-school-table .filter-dropdown label:hover {
        background: #f3f4f6;
      }
      .decision-by-school-table .filter-dropdown .filter-options {
        display: flex;
        flex-direction: column;
        gap: 0;
      }
      .decision-by-school-table tr.filter-hidden {
        display: none;
      }
      .decision-by-school-table .col-resize-handle {
        position: absolute;
        top: 0;
        right: 0;
        width: 6px;
        height: 100%;
        cursor: col-resize;
        z-index: 5;
        background: transparent;
      }
      .decision-by-school-table .col-resize-handle:hover {
        background: rgba(0, 124, 191, 0.15);
      }
      .decision-by-school-table .col-resize-handle.col-resizing {
        background: rgba(0, 124, 191, 0.3);
      }
    `;
    document.head.appendChild(style);
  }

  function setupDecisionBySchoolResizableColumns(resultsRoot) {
    const table = resultsRoot && resultsRoot.querySelector('table.decision-by-school-table');
    if (!table) return;

    const colgroup = table.querySelector('colgroup');
    if (!colgroup) return;

    const cols = Array.from(colgroup.querySelectorAll('col'));
    const headers = Array.from(table.querySelectorAll('thead th'));

    headers.forEach((th, colIndex) => {
      const handle = th.querySelector('.col-resize-handle');
      const col = cols[colIndex];
      if (!handle || !col) return;

      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startWidth = th.offsetWidth;

        const onMouseMove = (moveE) => {
          const dx = moveE.clientX - startX;
          const newWidth = Math.max(40, startWidth + dx);
          col.style.width = newWidth + 'px';
          col.style.minWidth = newWidth + 'px';
          handle.classList.add('col-resizing');
        };

        const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          handle.classList.remove('col-resizing');
        };

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    });
  }

  function setupDecisionBySchoolFilters(resultsRoot) {
    const table = resultsRoot && resultsRoot.querySelector('table.decision-by-school-table');
    if (!table) return;

    const tbody = table.querySelector('tbody');
    const headers = Array.from(table.querySelectorAll('thead th.filterable-header'));
    const cache = (window.__decisionBySchoolFilterValuesCache = window.__decisionBySchoolFilterValuesCache || {});

    headers.forEach((th, colIndex) => {
      const filterBtn = th.querySelector('.filter-btn');
      const filterDropdown = th.querySelector('.filter-dropdown');
      if (!filterBtn || !filterDropdown) return;

      th.style.position = 'relative';

      const getUniqueValues = () => {
        const values = new Set();
        tbody.querySelectorAll('tr[data-row]').forEach(tr => {
          const cell = tr.querySelector(`td[data-filter="col-${colIndex}"]`);
          if (cell) {
            const v = (cell.textContent || '').trim();
            values.add(v || '(blank)');
          }
        });
        const arr = Array.from(values).sort((a, b) => String(a).localeCompare(String(b)));
        if (arr.length > 0) cache[colIndex] = arr;
        return arr;
      };
      getUniqueValues();

      const populateDropdown = () => {
        let values = cache[colIndex];
        if (!values || values.length === 0) {
          values = getUniqueValues();
        }
        if (!values || values.length === 0) return;
        filterDropdown.innerHTML = `
          <div style="margin-bottom:6px; padding-bottom:6px; border-bottom:1px solid #eee;">
            <label class="filter-select-all-row" style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:12px;">
              <input type="checkbox" class="filter-select-all-cb" checked>
              <span>(Select All)</span>
            </label>
          </div>
          <input type="search" placeholder="Search..." class="filter-search" aria-label="Search filter values" style="margin-bottom:4px;">
          <div class="filter-options">
            ${values.map(v => {
              const escaped = String(v).replace(/</g, '&lt;').replace(/>/g, '&gt;');
              return `<label><input type="checkbox" value="${escaped}" class="filter-option"> ${escaped}</label>`;
            }).join('')}
          </div>
        `;

        let selected = (window.__decisionBySchoolFilters || {})[colIndex] ?? null;
        if (Array.isArray(selected) && selected.length === 0) selected = null;
        const selectAllCb = filterDropdown.querySelector('.filter-select-all-cb');
        const opts = filterDropdown.querySelectorAll('.filter-option');

        opts.forEach(cb => {
          if (selected === null || (Array.isArray(selected) && selected.includes(cb.value))) {
            cb.checked = true;
          }
        });

        const updateSelectAllState = () => {
          const checked = Array.from(opts).filter(cb => cb.checked).length;
          if (selectAllCb) {
            selectAllCb.checked = checked === opts.length;
            selectAllCb.indeterminate = checked > 0 && checked < opts.length;
          }
        };
        updateSelectAllState();

        selectAllCb?.addEventListener('change', () => {
          const check = selectAllCb.checked;
          opts.forEach(cb => { cb.checked = check; });
          updateSelectAllState();
          applyFilters();
        });

        const searchInput = filterDropdown.querySelector('.filter-search');
        if (searchInput) {
          searchInput.oninput = () => {
            const q = searchInput.value.toLowerCase();
            filterDropdown.querySelectorAll('.filter-options label').forEach(label => {
              const text = (label.textContent || '').toLowerCase();
              label.style.display = q && !text.includes(q) ? 'none' : 'flex';
            });
          };
        }

        opts.forEach(cb => {
          cb.addEventListener('change', () => {
            updateSelectAllState();
            applyFilters();
          });
        });
      };

      filterDropdown.addEventListener('click', (e) => e.stopPropagation());

      const clearColBtn = th.querySelector('.filter-clear-col');
      if (clearColBtn) {
        clearColBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const filterState = window.__decisionBySchoolFilters || (window.__decisionBySchoolFilters = {});
          filterState[colIndex] = null;
          const dd = th.querySelector('.filter-dropdown');
          const opts = dd?.querySelectorAll('.filter-option');
          const selectAllCb = dd?.querySelector('.filter-select-all-cb');
          if (opts?.length) {
            opts.forEach(cb => { cb.checked = true; });
            if (selectAllCb) selectAllCb.checked = true;
            if (selectAllCb) selectAllCb.indeterminate = false;
          }
          applyFilters();
        });
      }

      const applyFilters = () => {
        const filterState = window.__decisionBySchoolFilters || (window.__decisionBySchoolFilters = {});
        const selectedByCol = {};
        headers.forEach((h, i) => {
          const dd = h.querySelector('.filter-dropdown');
          if (!dd) return;
          const opts = dd.querySelectorAll('.filter-option');
          if (opts.length === 0) return;
          const checked = Array.from(opts).filter(cb => cb.checked).map(cb => cb.value);
          let effective = null;
          if (checked.length > 0 && checked.length < opts.length) {
            effective = checked;
          }
          selectedByCol[i] = effective;
        });

        Object.assign(filterState, selectedByCol);

        tbody.querySelectorAll('tr[data-row]').forEach(tr => {
          let show = true;
          headers.forEach((h, i) => {
            const sel = selectedByCol[i];
            if (sel === null || sel === undefined) return;
            if (Array.isArray(sel) && sel.length === 0) return;
            const cell = tr.querySelector(`td[data-filter="col-${i}"]`);
            const raw = (cell ? cell.textContent : '').trim();
            const val = raw || '(blank)';
            if (!sel.includes(val)) show = false;
          });
          tr.classList.toggle('filter-hidden', !show);
        });

        const vals = getUniqueValues();
        const sel = selectedByCol[colIndex];
        filterBtn.classList.toggle('filter-active', !!(sel !== null && sel !== undefined && sel.length < vals.length));
      };

      filterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const isOpen = filterDropdown.classList.contains('is-open');
        table.querySelectorAll('.filter-dropdown.is-open').forEach(d => d.classList.remove('is-open'));
        if (!isOpen) {
          populateDropdown();
          filterDropdown.classList.add('is-open');
        }
      });
    });

    if (!document._decisionBySchoolFilterClickOutside) {
      document._decisionBySchoolFilterClickOutside = true;
      document.addEventListener('click', (e) => {
        if (e.target && e.target.closest && (e.target.closest('.filter-dropdown') || e.target.closest('.filter-btn') || e.target.closest('.filter-clear-col'))) return;
        document.querySelectorAll('.filter-dropdown.is-open').forEach(d => d.classList.remove('is-open'));
      });
    }

    const clearBtn = resultsRoot.querySelector('#decisionBySchoolClearFiltersBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        window.__decisionBySchoolFilters = {};
        window.__decisionBySchoolFilterValuesCache = {};
        table.querySelectorAll('.filter-dropdown.is-open').forEach(d => d.classList.remove('is-open'));
        tbody.querySelectorAll('tr[data-row]').forEach(tr => tr.classList.remove('filter-hidden'));
        headers.forEach((h) => {
          const btn = h.querySelector('.filter-btn');
          if (btn) btn.classList.remove('filter-active');
        });
      });
    }
  }

  /** Re-apply Decision by School column filters after table re-render (strategic sorting sliders). */
  function applyStoredDecisionBySchoolFilters(resultsRoot) {
    const table = resultsRoot && resultsRoot.querySelector('table.decision-by-school-table');
    if (!table) return;
    const tbody = table.querySelector('tbody');
    const headers = Array.from(table.querySelectorAll('thead th.filterable-header'));
    if (!tbody || !headers.length) return;

    const filterState = window.__decisionBySchoolFilters || (window.__decisionBySchoolFilters = {});

    const getUniqueValues = (colIndex) => {
      const values = new Set();
      tbody.querySelectorAll('tr[data-row]').forEach(tr => {
        const cell = tr.querySelector(`td[data-filter="col-${colIndex}"]`);
        if (cell) {
          const v = (cell.textContent || '').trim();
          values.add(v || '(blank)');
        }
      });
      return values;
    };

    headers.forEach((th, colIndex) => {
      let sel = filterState[colIndex];
      if (!Array.isArray(sel) || sel.length === 0) {
        filterState[colIndex] = null;
        return;
      }
      const uniques = getUniqueValues(colIndex);
      const effective = sel.filter(v => uniques.has(v));
      if (effective.length === 0) filterState[colIndex] = null;
      else if (effective.length >= uniques.size) filterState[colIndex] = null;
      else filterState[colIndex] = effective;
    });

    const selectedByCol = {};
    headers.forEach((h, i) => {
      const s = filterState[i];
      selectedByCol[i] = Array.isArray(s) && s.length > 0 ? s : null;
    });

    tbody.querySelectorAll('tr[data-row]').forEach(tr => {
      let show = true;
      headers.forEach((h, i) => {
        const sel = selectedByCol[i];
        if (sel === null || sel === undefined) return;
        if (Array.isArray(sel) && sel.length === 0) return;
        const cell = tr.querySelector(`td[data-filter="col-${i}"]`);
        const raw = (cell ? cell.textContent : '').trim();
        const val = raw || '(blank)';
        if (!sel.includes(val)) show = false;
      });
      tr.classList.toggle('filter-hidden', !show);
    });

    headers.forEach((h, colIndex) => {
      const filterBtn = h.querySelector('.filter-btn');
      if (!filterBtn) return;
      const uniques = getUniqueValues(colIndex);
      const sel = selectedByCol[colIndex];
      filterBtn.classList.toggle('filter-active', !!(sel && sel.length < uniques.size));
    });
  }

  function setupSummaryGroupToggles(summaryRoot) {
    if (!summaryRoot) return;

    // Prevent attaching listeners multiple times across re-renders
    if (summaryRoot.__hasSummaryGroupToggles) return;
    summaryRoot.__hasSummaryGroupToggles = true;

    summaryRoot.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('.summary-group-toggle') : null;
      if (!btn) return;
      e.preventDefault();

      const groupKey = btn.getAttribute('data-group');
      if (!groupKey) return;

      const expanded = btn.getAttribute('aria-expanded') === 'true';
      const nextExpanded = !expanded;
      btn.setAttribute('aria-expanded', nextExpanded ? 'true' : 'false');

      const rows = summaryRoot.querySelectorAll(`tr.summary-child-row[data-parent="${groupKey}"]`);
      rows.forEach(r => {
        r.classList.toggle('is-hidden', !nextExpanded);
      });
    });
  }

  function makeTablesSortable() {
    document.querySelectorAll('.sortable-header').forEach(header => {
        header.addEventListener('click', (e) => {
            if (e.target && (e.target.classList.contains('filter-btn') || e.target.closest('.filter-dropdown'))) return;
            const table = header.closest('table');
            const tbody = table ? table.querySelector('tbody') : null;
            if (!tbody) return;
            const columnIndex = parseInt(header.dataset.column, 10);
            const dataType = header.dataset.type;
            const isAsc = header.classList.contains('sort-asc');
            const newDir = isAsc ? 'desc' : 'asc';

            table.querySelectorAll('.sortable-header').forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
            header.classList.add(newDir === 'asc' ? 'sort-asc' : 'sort-desc');

            const rows = Array.from(tbody.querySelectorAll('tr[data-row]'));

            rows.sort((rowA, rowB) => {
                const cellA = rowA.querySelector(`td[data-filter="col-${columnIndex}"]`);
                const cellB = rowB.querySelector(`td[data-filter="col-${columnIndex}"]`);
                let valA = (cellA ? cellA.textContent : '').trim();
                let valB = (cellB ? cellB.textContent : '').trim();

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
          
          // Filter out schools only when Include_Flow_Chart explicitly says "No"
          self.schoolData = results.data.filter(row => {
            const includeFlowChartRaw = row.Include_Flow_Chart;
            const normalizedInclude = (includeFlowChartRaw ?? "yes").toString().trim().toLowerCase();
            const shouldInclude =
              normalizedInclude !== "no" &&
              normalizedInclude !== "0" &&
              normalizedInclude !== "false";
            if (!shouldInclude) {
              console.log(`🚫 Excluding school from assessment: ${row["Building Name"]} (Include_Flow_Chart: "${includeFlowChartRaw}")`);
            }
            return shouldInclude;
          });
          
          console.log(`📊 Filtered school data: ${results.data.length} total schools → ${self.schoolData.length} included schools`);

          // Normalize BuildingScore for logic + keep a consistent 2-decimal string for display.
          self.schoolData.forEach((row) => {
            const bs = coerceBuildingScore0to10(row.BuildingScore ?? row["BuildingScore"]);
            if (!isFinite(bs)) return;
            row.BuildingScore = bs.toFixed(2);
          });

          // Load Articulation Area from Map_Export.csv and distance-to-welcoming, then apply both
          Promise.all([
            loadArticulationFromMapExport(),
            loadDistanceToWelcomingMap()
          ]).then(([articulationByKey, distanceMap]) => {
            if (articulationByKey && typeof articulationByKey === "object") {
              self.schoolData.forEach((row) => {
                const uid = (row.UniqueID || row["UniqueID"] || row["Unique Id"] || "").toString().trim();
                const name = (row["Building Name"] || "").toString().trim();
                const val = articulationByKey[uid] ?? articulationByKey[name] ?? "";
                row["Articulation Area"] = val;
                row.ArticulationArea = val;
              });
              console.log("✅ Applied Articulation Area from Map_Export.csv");
            }
            if (distanceMap && typeof distanceMap === "object") {
              const normId = (s) => (s || "").toString().trim().toLowerCase();
              const normName = (s) => normId((s || "").toString().trim().replace(/\s+/g, " "));
              const mapByName = window.distanceToWelcomingMapByName || {};
              self.schoolData.forEach((row) => {
                const uniqueId = row.UniqueID || row["UniqueID"] || row["Unique Id"];
                const key = normId(uniqueId);
                let dist = key ? distanceMap[key] : undefined;
                if (dist === undefined) {
                  const name = row["Building Name"] || row.BuildingName || "";
                  const nameKey = normName(name);
                  dist = nameKey ? mapByName[nameKey] : undefined;
                }
                if (dist !== undefined) {
                  row.DistanceUnderutilizedschools = dist;
                }
              });
              console.log("✅ Applied distance-to-welcoming values to decision data");
            } else {
              console.warn("⚠️ Distance map unavailable; using existing DistanceUnderutilizedschools values from Decision Data Export.csv");
            }

            self.recalculateEverything(); // Perform initial calculation & render tables
          
            // Update flowchart dropdown with filtered data
            if (typeof window.updateFlowchartDropdown === 'function') {
              window.updateFlowchartDropdown();
            }
          
            resolve(self.schoolData);   // Resolve the promise with the processed data

            // Register school names for global search
            if (typeof window.globalSearchRegisterSchools === "function") {
              var names = self.schoolData.map(function (r) { return r["Building Name"] || ""; }).filter(Boolean);
              window.globalSearchRegisterSchools(names);
            }
          });
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
  
  // Assignment results UI removed; keep handler as no-op to avoid console errors.
  self.handleAssignmentResults = function(resultsData) {
    if (resultsData) {
      console.log("ℹ️ Assignment results received (UI disabled).");
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