// ✅ PrioritizationLogic.js
// Handles strategy group prioritization based on flowchart outcomes

window.prioritizationLogic = {
  // Strategy groups aligned with Step 1 strategic program outcome groupings
  // (Expansion, Maintenance/Investment, Closure/Consolidation, Other)
  strategyGroups: {
    "Expansion": {
      id: "expansion",
      outcomes: [
        "Building Addition",
        "Building Replacement",
        "Building Addition with Capital Investment"
      ],
      description: "Expansion strategies that increase capacity on-site or via replacement"
    },
    "Maintenance/Investment": {
      id: "maintenance_investment",
      outcomes: [
        "Targeted Capital Investment",
        "Standard Maintenance",
        "Major Capital Investment"
      ],
      description: "Maintenance and capital investment strategies"
    },
    "Closure/Consolidation": {
      id: "closure_consolidation",
      outcomes: [
        "Welcoming School",
        "Welcoming School with Capital Investment",
        "Closure (Goes to Welcoming School)",
        "Welcoming School with Building Replacement"
      ],
      description: "Closure and consolidation strategies involving welcoming schools"
    },
    "Other": {
      id: "other",
      outcomes: [
        "Policy Solution for Overcrowding",
        "Other / Unknown"
      ],
      description: "Other or unclassified strategies"
    }
  },

  // Default weights for each strategy group (0–100 internal scale per criterion)
  // These are seeded from the previous configuration so existing behavior stays reasonable.
  defaultWeights: {
    "Expansion": {
      // Internal 0–100 scale; 50 = UI value 5.0 on the 0–10 slider.
      // All weights start from the same neutral default so users
      // can shape priorities explicitly.
      utilizationRate: 50,
      studentsInAttendanceArea: 50,
      studentEconomicStatus: 50,
      academicPerformance: 50,
      buildingCondition: 50,
      pre1978BuildingLeadRisk: 50,
      adaAccessibility: 50,
      acStatus: 50,
      educationalAdequacy: 50,
      enrollment: 50,
      highNeedStudents: 50,
      neighborhoodCapture: 50,
      welcomedStudents: 50,
      distanceFromOtherSchools: 50
    },
    "Maintenance/Investment": {
      // Same neutral defaults as Expansion so both groups
      // start aligned and can be tuned together.
      utilizationRate: 50,
      studentsInAttendanceArea: 50,
      studentEconomicStatus: 50,
      academicPerformance: 50,
      buildingCondition: 50,
      pre1978BuildingLeadRisk: 50,
      adaAccessibility: 50,
      acStatus: 50,
      educationalAdequacy: 50,
      enrollment: 50,
      highNeedStudents: 50,
      neighborhoodCapture: 50,
      welcomedStudents: 50,
      distanceFromOtherSchools: 50
    },
    "Closure/Consolidation": {
      // Also start from the same neutral default; the scoring
      // logic (e.g. reversed directions) still differentiates
      // how these weights behave for closure decisions.
      utilizationRate: 50,
      studentsInAttendanceArea: 50,
      studentEconomicStatus: 50,
      academicPerformance: 50,
      buildingCondition: 50,
      pre1978BuildingLeadRisk: 50,
      adaAccessibility: 50,
      acStatus: 50,
      educationalAdequacy: 50,
      enrollment: 50,
      highNeedStudents: 50,
      neighborhoodCapture: 50,
      welcomedStudents: 50,
      distanceFromOtherSchools: 50
    },
    "Other": {
      // Monitoring/Other also use the same neutral defaults.
      utilizationRate: 50,
      studentsInAttendanceArea: 50,
      studentEconomicStatus: 50,
      academicPerformance: 50,
      buildingCondition: 50,
      pre1978BuildingLeadRisk: 50,
      adaAccessibility: 50,
      acStatus: 50,
      educationalAdequacy: 50,
      enrollment: 50,
      highNeedStudents: 50,
      neighborhoodCapture: 50,
      welcomedStudents: 50,
      distanceFromOtherSchools: 50
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
    
    // Initialize current weights with defaults
    Object.keys(this.strategyGroups).forEach(groupName => {
      this.currentWeights[groupName] = { ...this.defaultWeights[groupName] };
    });

    return this;
  },

  // Get schools for a specific strategy group
  getSchoolsForStrategy: function(strategyGroupName) {
    const group = this.strategyGroups[strategyGroupName];
    if (!group) return [];

    return this.schoolData.filter(school => {
      const decision = school.decision || school["Decision Type"] || "";
      return group.outcomes.some(outcome => decision === outcome);
    });
  },

  // Get per-outcome counts for a strategy group (for subcategory selection UI)
  getOutcomeSummaryForStrategy: function(strategyGroupName) {
    const group = this.strategyGroups[strategyGroupName];
    if (!group) return [];

    const schools = this.getSchoolsForStrategy(strategyGroupName);
    const counts = {};

    schools.forEach(school => {
      const decision = school.decision || school["Decision Type"] || "";
      if (!decision) return;
      counts[decision] = (counts[decision] || 0) + 1;
    });

    // Preserve the configured outcome order, include zeros
    return group.outcomes.map(outcome => ({
      outcome,
      count: counts[outcome] || 0
    }));
  },

  /**
   * Rank schools across multiple strategy groups at once.
   * Used for the "see all schools together" view in Step 2 so
   * Expansion + Maintenance/Investment schools can be viewed
   * in one combined prioritized list.
   *
   * @param {string[]} strategyGroupNames - Array of strategy group names
   * @param {string|null} outcomeFilter  - Optional decision-type filter
   * @returns {Array<object>} ranked schools with `strategyGroup` attached
   */
  rankSchoolsAcrossStrategies: function(strategyGroupNames, outcomeFilter) {
    const groups =
      Array.isArray(strategyGroupNames) && strategyGroupNames.length > 0
        ? strategyGroupNames
        : Object.keys(this.strategyGroups);

    const combined = [];

    groups.forEach(groupName => {
      const group = this.strategyGroups[groupName];
      if (!group) return;

      const allSchoolsForGroup = this.getSchoolsForStrategy(groupName);
      const schools = outcomeFilter
        ? allSchoolsForGroup.filter(school => {
            const decision = school.decision || school["Decision Type"] || "";
            return decision === outcomeFilter;
          })
        : allSchoolsForGroup;

      schools.forEach(school => {
        const scoreData = this.calculatePriorityScore(school, groupName);
        combined.push({
          ...school,
          priorityScore: scoreData.totalScore,
          scoreComponents: scoreData.components,
          rawData: scoreData.rawData,
          strategyGroup: groupName
        });
      });
    });

    combined.sort((a, b) => b.priorityScore - a.priorityScore);
    return combined;
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
    const weights = this.currentWeights[strategyGroupName] || this.defaultWeights[strategyGroupName];
    
    let score = 0;
    let totalWeightUsed = 0;
    const components = {};

    // Utilization Rate
    // For Expansion & Maintenance/Investment, higher utilization = higher priority.
    // For Closure/Consolidation, lower utilization = higher priority (reverse).
    const utilization = parseFloat(school.Utilization || 0) * 100;
    const reverseUtil =
      strategyGroupName === "Closure/Consolidation";
    const utilScore = this.normalizeValue(utilization, 0, 130, reverseUtil);
    const utilWeight = weights.utilizationRate || 0;
    components.utilizationRate = (utilScore / 100) * utilWeight;
    score += components.utilizationRate;
    totalWeightUsed += utilWeight;

    const isClosure = (strategyGroupName === "Closure/Consolidation");

    // Enrollment
    // For Expansion & Maintenance/Investment, higher enrollment = higher priority.
    // For Closure/Consolidation, LOWER enrollment = higher priority.
    const enrollment = parseInt(school.Enrollment || 0, 10);
    const reverseEnrollment = isClosure;
    const enrollmentScore = this.normalizeValue(enrollment, 0, 1500, reverseEnrollment);
    const enrollmentWeight = weights.enrollment || 0;
    components.enrollment = (enrollmentScore / 100) * enrollmentWeight;
    score += components.enrollment;
    totalWeightUsed += enrollmentWeight;

    // High-need students (% FRL)
    // For Expansion & Maintenance/Investment, higher % FRL = higher priority.
    // For Closure/Consolidation, higher % FRL = lower priority (reverse).
    const frlPercent = parseFloat(school["% FRL"] || school["Free Reduced Lunch"] || 0, 10);
    const reverseHighNeed = isClosure;
    const frlScore = this.normalizeValue(frlPercent, 0, 100, reverseHighNeed);
    const highNeedWeight = weights.highNeedStudents || 0;
    components.highNeedStudents = (frlScore / 100) * highNeedWeight;
    score += components.highNeedStudents;
    totalWeightUsed += highNeedWeight;

    // Building Condition (Composite Building Score) - lower score = higher priority
    const buildingScore = parseFloat(school.BuildingScore || 0, 10);
    const buildingNormalized = this.normalizeValue(buildingScore, 0, 10, true); // Reverse: lower score = higher priority
    const buildingWeight = weights.buildingCondition || 0;
    components.buildingCondition = (buildingNormalized / 100) * buildingWeight;
    score += components.buildingCondition;
    totalWeightUsed += buildingWeight;

    // Educational Adequacy (EA) - lower EA = higher priority
    const eaRaw = parseFloat(school.EducationalAdequacy || 0, 10) * 100; // convert to %
    const eaScore = this.normalizeValue(eaRaw, 0, 100, true);
    const eaWeight = weights.educationalAdequacy || 0;
    components.educationalAdequacy = (eaScore / 100) * eaWeight;
    score += components.educationalAdequacy;
    totalWeightUsed += eaWeight;

    // Neighborhood capture rate (Attendance Area Enrollment %)
    // For Expansion & Maintenance/Investment, higher capture = higher priority.
    // For Closure/Consolidation, LOWER capture = higher priority.
    const capturePercent = parseFloat(school.AttendanceAreaEnrollment || 0, 10);
    const reverseCapture = isClosure;
    const captureScore = this.normalizeValue(capturePercent, 0, 100, reverseCapture);
    const captureWeight = weights.neighborhoodCapture || 0;
    components.neighborhoodCapture = (captureScore / 100) * captureWeight;
    score += components.neighborhoodCapture;
    totalWeightUsed += captureWeight;

    // Students welcomed from previous consolidations (if/when data is available)
    const welcomed = parseInt(school["Welcomed Students"] || school["Students Welcomed"] || 0, 10);
    const welcomedScore = this.normalizeValue(welcomed, 0, 2000, false);
    const welcomedWeight = weights.welcomedStudents || 0;
    components.welcomedStudents = (welcomedScore / 100) * welcomedWeight;
    score += components.welcomedStudents;
    totalWeightUsed += welcomedWeight;

    // Distance from other schools (using DistanceUnderutilizedschools as proxy) - greater distance = higher priority
    const distance = parseFloat(school.DistanceUnderutilizedschools || 0, 10);
    const distanceScore = this.normalizeValue(distance, 0, 10, false);
    const distanceWeight = weights.distanceFromOtherSchools || 0;
    components.distanceFromOtherSchools = (distanceScore / 100) * distanceWeight;
    score += components.distanceFromOtherSchools;
    totalWeightUsed += distanceWeight;

    // Past investments (RecentInvestments)
    // For Closure/Consolidation: FEWER past investments = higher priority (reverse).
    // For other groups: higher investments can be given weight if desired.
    const investments = parseFloat(school.RecentInvestments || 0, 10);
    const reverseInvest = isClosure;
    const investScore = this.normalizeValue(investments, 0, 50, reverseInvest);
    const investWeight = weights.pastInvestments || 0;
    components.pastInvestments = (investScore / 100) * investWeight;
    score += components.pastInvestments;
    totalWeightUsed += investWeight;

    // Specialty program offerings (placeholder until explicit data field exists)
    // Assumes higher value/flag = more specialty offerings.
    const specialtyRaw =
      parseFloat(school.SpecialtyPrograms || school["Specialty Programs"] || 0, 10) ||
      (school.SpecialtyProgram || school["Specialty Program"] ? 1 : 0);
    const specialtyScore = this.normalizeValue(specialtyRaw, 0, 10, false);
    const specialtyWeight = weights.specialtyPrograms || 0;
    components.specialtyPrograms = (specialtyScore / 100) * specialtyWeight;
    score += components.specialtyPrograms;
    totalWeightUsed += specialtyWeight;

    // Convert raw weighted sum back to a 0–100 index by dividing
    // by the effective total weight (i.e., compute a weighted average).
    // This makes a score of 100 rare – only schools that are at the
    // extreme of every active dimension will approach 100.
    if (totalWeightUsed > 0) {
      score = score / (totalWeightUsed / 100);
    }

    return {
      totalScore: Math.min(100, Math.max(0, score)), // Keep in 0–100, but no longer easily saturates
      components: components,
      rawData: {
        utilizationRate: utilization,
        enrollment: enrollment,
        highNeedStudents: frlPercent,
        studentEconomicStatus: frlPercent,
        buildingCondition: buildingScore,
        educationalAdequacy: eaRaw,
        academicPerformance: eaRaw,
        neighborhoodCapture: capturePercent,
        studentsInAttendanceArea: capturePercent,
        welcomedStudents: welcomed,
        distanceFromOtherSchools: distance,
        pastInvestments: investments,
        specialtyPrograms: specialtyRaw
      }
    };
  },

  // Rank schools for a strategy group (optionally filtered by specific outcome)
  rankSchools: function(strategyGroupName, outcomeFilter) {
    const allSchools = this.getSchoolsForStrategy(strategyGroupName);

    const schools = outcomeFilter
      ? allSchools.filter(school => {
          const decision = school.decision || school["Decision Type"] || "";
          return decision === outcomeFilter;
        })
      : allSchools;
    
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

  // Get all strategy groups and their counts
  // (always return all groups so the UI tabs are visible even if a group
  //  currently has zero schools in it).
  getAvailableStrategyGroups: function() {
    const groups = [];
    
    Object.keys(this.strategyGroups).forEach(groupName => {
      const schools = this.getSchoolsForStrategy(groupName);
      groups.push({
        name: groupName,
        id: this.strategyGroups[groupName].id,
        count: schools.length,
        description: this.strategyGroups[groupName].description
      });
    });

    return groups;
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

