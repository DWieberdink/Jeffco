// ✅ PrioritizationLogic.js
// Handles strategy group prioritization based on flowchart outcomes

window.prioritizationLogic = {
  // Strategy groups will be dynamically generated from actual decision types in the data
  strategyGroups: {},

  // Default weights for each strategy group (1-10 scale)
  // All defaults set to 5
  defaultWeights: {
    "Closure/Merger": {
      utilizationRate: 5,
      studentsInAttendanceArea: 5,
      studentEconomicStatus: 5,
      academicPerformance: 5,
      buildingCondition: 5,
      pre1978BuildingLeadRisk: 5,
      adaAccessibility: 5,
      acStatus: 5
    },
    "Building & Programmatic": {
      utilizationRate: 5,
      studentsInAttendanceArea: 5,
      studentEconomicStatus: 5,
      academicPerformance: 5,
      buildingCondition: 5,
      pre1978BuildingLeadRisk: 5,
      adaAccessibility: 5,
      acStatus: 5
    },
    "Building": {
      utilizationRate: 5,
      studentsInAttendanceArea: 5,
      studentEconomicStatus: 5,
      academicPerformance: 5,
      buildingCondition: 5,
      pre1978BuildingLeadRisk: 5,
      adaAccessibility: 5,
      acStatus: 5
    },
    "Programmatic": {
      utilizationRate: 5,
      studentsInAttendanceArea: 5,
      studentEconomicStatus: 5,
      academicPerformance: 5,
      buildingCondition: 5,
      pre1978BuildingLeadRisk: 5,
      adaAccessibility: 5,
      acStatus: 5
    },
    "Monitoring": {
      utilizationRate: 5,
      studentsInAttendanceArea: 5,
      studentEconomicStatus: 5,
      academicPerformance: 5,
      buildingCondition: 5,
      pre1978BuildingLeadRisk: 5,
      adaAccessibility: 5,
      acStatus: 5
    },
    "Building Addition": {
      utilizationRate: 5,
      studentsInAttendanceArea: 5,
      studentEconomicStatus: 5,
      academicPerformance: 5,
      buildingCondition: 5,
      pre1978BuildingLeadRisk: 5,
      adaAccessibility: 5,
      acStatus: 5
    },
    "Site-Specific": {
      utilizationRate: 5,
      studentsInAttendanceArea: 5,
      studentEconomicStatus: 5,
      academicPerformance: 5,
      buildingCondition: 5,
      pre1978BuildingLeadRisk: 5,
      adaAccessibility: 5,
      acStatus: 5
    },
    "Building-Focused": {
      utilizationRate: 5,
      studentsInAttendanceArea: 5,
      studentEconomicStatus: 5,
      academicPerformance: 5,
      buildingCondition: 5,
      pre1978BuildingLeadRisk: 5,
      adaAccessibility: 5,
      acStatus: 5
    },
    "Program-Focused": {
      utilizationRate: 5,
      studentsInAttendanceArea: 5,
      studentEconomicStatus: 5,
      academicPerformance: 5,
      buildingCondition: 5,
      pre1978BuildingLeadRisk: 5,
      adaAccessibility: 5,
      acStatus: 5
    }
  },

  // Current weights (can be modified by user)
  currentWeights: {},

  // School data with decisions
  schoolData: [],

  // Initialize prioritization logic
  initialize: function(schoolDataWithDecisions) {
    console.log("🎯 Initializing Prioritization Logic");
    this.schoolData = schoolDataWithDecisions || [];
    
    // Dynamically generate strategy groups from actual decision types in the data
    this.generateStrategyGroupsFromData();
    
    // Initialize current weights with defaults
    this.currentWeights = {};
    Object.keys(this.strategyGroups).forEach(groupName => {
      // Use default weights if available, otherwise create default structure
      if (this.defaultWeights[groupName]) {
        this.currentWeights[groupName] = { ...this.defaultWeights[groupName] };
      } else {
        // Create default weights structure for new decision types (1-10 scale)
        // All defaults set to 5
        this.currentWeights[groupName] = {
          utilizationRate: 5,
          studentsInAttendanceArea: 5,
          studentEconomicStatus: 5,
          academicPerformance: 5,
          buildingCondition: 5,
          pre1978BuildingLeadRisk: 5,
          adaAccessibility: 5,
          acStatus: 5
        };
      }
    });

    return this;
  },

  // Dynamically generate strategy groups from actual decision types in school data
  generateStrategyGroupsFromData: function() {
    const decisionTypes = new Set();
    
    // Collect all unique decision types from school data
    this.schoolData.forEach(school => {
      const decision = school.decision || school["Decision Type"] || school["decision"] || "";
      if (decision && decision.trim() !== "" && decision !== "Unknown") {
        decisionTypes.add(decision.trim());
      }
    });
    
    // Create strategy groups for each decision type
    this.strategyGroups = {};
    const sortedDecisions = Array.from(decisionTypes).sort();
    
    sortedDecisions.forEach(decisionType => {
      // Create a safe ID from the decision type name
      const id = decisionType.toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      
      this.strategyGroups[decisionType] = {
        id: id,
        outcomes: [decisionType],
        description: `Schools with decision: ${decisionType}`
      };
    });
    
    console.log("📊 Dynamically generated strategy groups:", Object.keys(this.strategyGroups));
    return this.strategyGroups;
  },

  // Get schools for a specific strategy group
  getSchoolsForStrategy: function(strategyGroupName) {
    const group = this.strategyGroups[strategyGroupName];
    if (!group) return [];

    return this.schoolData.filter(school => {
      const decision = (school.decision || school["Decision Type"] || "").trim();
      // Use exact match to avoid partial matches (e.g., "Building Addition" matching "Building Addition with Capital Investment")
      return group.outcomes.some(outcome => decision === outcome.trim());
    });
  },

  // Normalize a value to 0-100 scale
  normalizeValue: function(value, min, max, reverse = false) {
    if (value === null || value === undefined || isNaN(value)) return 50; // Default middle value
    
    // Clamp value to range
    const clamped = Math.max(min, Math.min(max, value));
    
    // Normalize to 0-100
    let normalized = ((clamped - min) / (max - min)) * 100;
    
    // Reverse if needed (e.g., lower utilization is better for closure)
    if (reverse) {
      normalized = 100 - normalized;
    }
    
    return normalized;
  },

  // Calculate priority score for a school
  calculatePriorityScore: function(school, strategyGroupName) {
    const rawWeights = this.currentWeights[strategyGroupName] || this.defaultWeights[strategyGroupName];
    
    // Normalize weights from 1-10 scale to percentages (sum to 100)
    const weightSum = Object.values(rawWeights).reduce((sum, w) => sum + (w || 0), 0);
    const weights = {};
    Object.keys(rawWeights).forEach(key => {
      weights[key] = weightSum > 0 ? (rawWeights[key] || 0) / weightSum * 100 : 0;
    });
    
    let score = 0;
    const components = {};

    // Utilization Rate (lower is better for closure, higher for building addition)
    const utilization = parseFloat(school.Utilization || 0) * 100;
    const utilScore = this.normalizeValue(utilization, 0, 100, 
      strategyGroupName.includes("Closure") || strategyGroupName.includes("Monitoring"));
    components.utilizationRate = (utilScore / 100) * weights.utilizationRate;
    score += components.utilizationRate;

    // Students in Attendance Area (fewer is better for closure)
    const studentsInArea = parseInt(school["Students in Attendance Area"] || school.Enrollment || 0, 10);
    const studentsScore = this.normalizeValue(studentsInArea, 0, 1000, 
      strategyGroupName.includes("Closure"));
    components.studentsInAttendanceArea = (studentsScore / 100) * weights.studentsInAttendanceArea;
    score += components.studentsInAttendanceArea;

    // Student Economic Status (%FRL) - fewer is better for closure
    const frlPercent = parseFloat(school["% FRL"] || school["Free Reduced Lunch"] || 0, 10);
    const frlScore = this.normalizeValue(frlPercent, 0, 100, 
      strategyGroupName.includes("Closure"));
    components.studentEconomicStatus = (frlScore / 100) * weights.studentEconomicStatus;
    score += components.studentEconomicStatus;

    // Academic Performance - lower is better for closure
    const academicPerf = parseFloat(school["Academic Performance"] || school["Scorecard"] || 50, 10);
    const academicScore = this.normalizeValue(academicPerf, 0, 100, 
      strategyGroupName.includes("Closure"));
    components.academicPerformance = (academicScore / 100) * weights.academicPerformance;
    score += components.academicPerformance;

    // Building Condition - lower score is worse (better for prioritization)
    const buildingScore = parseFloat(school.BuildingScore || 0, 10);
    const buildingNormalized = this.normalizeValue(buildingScore, 0, 10, true); // Reverse: lower score = higher priority
    components.buildingCondition = (buildingNormalized / 100) * weights.buildingCondition;
    score += components.buildingCondition;

    // Pre-1978 Building Lead Risk (Yes = higher priority)
    const pre1978 = (school["Pre-1978 Building"] === "Yes" || school["Pre-1978 Building"] === "yes") ? 100 : 0;
    components.pre1978BuildingLeadRisk = (pre1978 / 100) * weights.pre1978BuildingLeadRisk;
    score += components.pre1978BuildingLeadRisk;

    // ADA Accessibility (No = higher priority for closure)
    const adaAccessible = (school["ADA Accessible"] === "Yes" || school["ADA Accessible"] === "yes") ? 0 : 100;
    components.adaAccessibility = (adaAccessible / 100) * weights.adaAccessibility;
    score += components.adaAccessibility;

    // AC Status (lower coverage = higher priority)
    const acCoverage = parseFloat(school["AC Coverage"] || school["AC Status"] || 0, 10);
    const acScore = this.normalizeValue(acCoverage, 0, 100, true); // Reverse: lower coverage = higher priority
    components.acStatus = (acScore / 100) * weights.acStatus;
    score += components.acStatus;

    return {
      totalScore: Math.min(100, Math.max(0, score)), // Clamp to 0-100
      components: components,
      rawData: {
        utilizationRate: utilization,
        studentsInAttendanceArea: studentsInArea,
        studentEconomicStatus: frlPercent,
        academicPerformance: academicPerf,
        buildingCondition: buildingScore,
        pre1978BuildingLeadRisk: school["Pre-1978 Building"] || "No",
        adaAccessibility: school["ADA Accessible"] || "Unknown",
        acStatus: acCoverage
      }
    };
  },

  // Rank schools for a strategy group
  rankSchools: function(strategyGroupName) {
    const schools = this.getSchoolsForStrategy(strategyGroupName);
    
    const ranked = schools.map(school => {
      const scoreData = this.calculatePriorityScore(school, strategyGroupName);
      return {
        ...school,
        priorityScore: scoreData.totalScore,
        scoreComponents: scoreData.components,
        rawData: scoreData.rawData
      };
    });

    // Sort by priority score (descending)
    ranked.sort((a, b) => b.priorityScore - a.priorityScore);

    return ranked;
  },

  // Get all available strategy groups (that have schools)
  getAvailableStrategyGroups: function() {
    const available = [];
    
    // Sort by decision type name for consistent ordering
    const sortedGroups = Object.keys(this.strategyGroups).sort();
    
    sortedGroups.forEach(groupName => {
      const schools = this.getSchoolsForStrategy(groupName);
      // Include all groups, even if count is 0 (to match the table format)
      available.push({
        name: groupName,
        id: this.strategyGroups[groupName].id,
        count: schools.length,
        description: this.strategyGroups[groupName].description
      });
    });

    return available;
  },

  // Update weights for a strategy group
  updateWeights: function(strategyGroupName, newWeights) {
    if (!this.currentWeights[strategyGroupName]) {
      this.currentWeights[strategyGroupName] = {};
    }
    Object.assign(this.currentWeights[strategyGroupName], newWeights);
  },

  // Calculate equity metrics for a set of schools
  calculateEquityMetrics: function(schools) {
    if (schools.length === 0) {
      return {
        studentsAffected: 0,
        avgFreeReducedLunch: 0,
        demographicBreakdown: {
          black: 0,
          hispanic: 0,
          white: 0
        }
      };
    }

    let totalStudents = 0;
    let totalFRL = 0;
    let totalBlack = 0;
    let totalHispanic = 0;
    let totalWhite = 0;

    schools.forEach(school => {
      const enrollment = parseInt(school.Enrollment || 0, 10);
      totalStudents += enrollment;
      
      const frlPercent = parseFloat(school["% FRL"] || school["Free Reduced Lunch"] || 0, 10);
      totalFRL += enrollment * (frlPercent / 100);
      
      const blackPercent = parseFloat(school["% Black"] || school["Black"] || 0, 10);
      totalBlack += enrollment * (blackPercent / 100);
      
      const hispanicPercent = parseFloat(school["% Hispanic"] || school["Hispanic"] || 0, 10);
      totalHispanic += enrollment * (hispanicPercent / 100);
      
      const whitePercent = parseFloat(school["% White"] || school["White"] || 0, 10);
      totalWhite += enrollment * (whitePercent / 100);
    });

    return {
      studentsAffected: totalStudents,
      avgFreeReducedLunch: totalStudents > 0 ? (totalFRL / totalStudents) * 100 : 0,
      demographicBreakdown: {
        black: totalStudents > 0 ? (totalBlack / totalStudents) * 100 : 0,
        hispanic: totalStudents > 0 ? (totalHispanic / totalStudents) * 100 : 0,
        white: totalStudents > 0 ? (totalWhite / totalStudents) * 100 : 0
      }
    };
  }
};

console.log("✅ PrioritizationLogic.js loaded");

