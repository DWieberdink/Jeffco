/* school-profile.js
   - Loads JeffCoProjectDataTemplate*.csv (assets/projects)
   - Filters rows by SchoolName == selected school (string match with trim)
   - Renders ONE table grouped by SystemCategory
   - Allows sorting (click header) + filtering (search + dropdowns)
   - Does not mutate underlying data
*/

(function () {
  const ASSETS_CSV_PATH = "JeffCoProjectListAllSchools.csv";
  const DECISION_CSV_PATH = "Decision Data Export.csv";
  const UNITCOST_LIBRARY_CSV_PATH = "UnitCostLibrary.csv";
  const ROOM_SCHEDULE_CSV_PATH = "Jeffco Room Schedule.csv";
  // Bump this to force browsers to refetch CSV/JS.
  const CACHE_BUST = "20260127_23";
  const PRIORITY_OVERRIDES_STORAGE_KEY = "jeffco_priority_overrides_assetid_v1";

  // The dashboard-facing assets CSV is pivoted:
  // one row per school, with columns like "<AssetType> UnitValue".
  // We only require identifiers here; per-row project details are rebuilt using UnitCostLibrary.csv.
  const REQUIRED_COLS = ["SchoolName"];
  const OPTIONAL_COLS = ["RemainingUsefulLife", "UnitCost", "UnitValue", "ReplacementCost"];
  // Add computed Priority column (derived from SystemCategory) as the left-most column.
  const DISPLAY_COLS = [
    "Priority",
    "Project Type",
    "ConditionScore",
    "UnitCost",
    "UnitValue",
    "ReplacementCost",
  ];

  const elSchoolNameHeader = document.getElementById("schoolNameHeader");
  const elSchoolMeta = document.getElementById("schoolMeta");
  const elTotalReplacementCost = document.getElementById("totalReplacementCost");
  const elTotalLowCost = document.getElementById("totalLowCost");
  const elTotalMediumCost = document.getElementById("totalMediumCost");
  const elTotalHighCost = document.getElementById("totalHighCost");
  const additionPlanningState = {
    show: false,
    studentsOver: null,
    gsfTarget: null,
    selectedKey: null, // elementary | middle | k8 | high
    stories: 1, // 1 | 2 | 3
    collapsed: false,
  };
  const ADDITION_STORY_COST = { 1: 500, 2: 600, 3: 700 }; // $/SF
  const elSchoolSelect = document.getElementById("schoolSelect");
  const elSearch = document.getElementById("searchInput");
  const elPriorityFilter = document.getElementById("priorityFilter");
  const elSystemFilter = document.getElementById("systemCategoryFilter");
  const elAssetFilter = document.getElementById("assetTypeFilter");
  const elClearFilters = document.getElementById("clearFiltersBtn");
  const elTableMount = document.getElementById("tableMount");
  const elDownload = document.getElementById("downloadCsvBtn");

  let allRows = [];
  let assetsPivotRows = [];
  let assetsByUid = new Map();
  let assetsByNameKey = new Map();
  let schoolRows = [];
  let viewRows = [];
  let sortState = { key: "SystemCategory", dir: "asc" };
  let selectedSchoolNameFromQuery = "";
  let selectedUniqueIdFromQuery = "";
  let resolvedSchoolName = "";
  let resolvedUniqueId = "";
  let resolvedDecisionOutcome = "";
  let keepBlackForCosts = false;
  let keepBlackForDemolitionCost = false;
  let decisionRows = [];
  let decisionByUid = new Map();
  let decisionByNameKey = new Map();
  let priorityOverrides = loadPriorityOverrides();
  let unitCostIndex = new Map();
  let unitCostByProjectKey = new Map();
  let libraryProjectOrder = []; // [{ proj, pk, sys }]
  let roomScheduleByUid = new Map();
  let roomScheduleByFacility = new Map();

  // Flowchart decision evaluation (mirrors DecisionLogic.js, but scoped to this page)
  const DECISION_THRESHOLDS = {
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
    adequateProgramsMin: 80,
    attendanceAreaEnrollment: 80,
    distanceReceiving: 1.0,
    elementaryEnrollment: 220,
    k8Enrollment: 360,
    middleEnrollment: 500,
    highEnrollment: 700,
    k12Enrollment: 600,
    elementaryDistance: 3.5,
    k8Distance: 3.5,
    middleDistance: 5.0,
    highDistance: 7.0,
    k12Distance: 6.0,
  };

  function loadThresholdsFromStorage() {
    try {
      const raw = window.localStorage ? window.localStorage.getItem("jeffco_thresholds_v1") : null;
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function getActiveThresholds() {
    // Use the same thresholds as the dashboard sliders when available.
    return loadThresholdsFromStorage() || DECISION_THRESHOLDS;
  }

  const PK_ENROLLMENT_KEY = "jeffco_include_pk_enrollment_v1";
  function getIncludePKInEnrollment() {
    try { return (window.localStorage && window.localStorage.getItem(PK_ENROLLMENT_KEY)) === "true"; } catch { return false; }
  }
  function setIncludePKInEnrollment(v) {
    try { if (window.localStorage) window.localStorage.setItem(PK_ENROLLMENT_KEY, v ? "true" : "false"); } catch {}
  }
  function getEffectiveEnrollment(row) {
    if (!row) return 0;
    const inc = getIncludePKInEnrollment();
    const e = parseFloat((row.Enrollment ?? row.enrollment ?? "").toString().replace(/,/g, "").trim()) || 0;
    const pk = parseFloat((row.PKEnrollment ?? row["PKEnrollment"] ?? row["PK Enrollment"] ?? "").toString().replace(/,/g, "").trim()) || 0;
    return inc ? e : Math.max(0, e - pk);
  }
  function getEffectiveUtilization(row) {
    if (!row) return 0;
    const cap = parseFloat((row.Capacity ?? row.capacity ?? "").toString().replace(/,/g, "").trim()) || 0;
    if (!cap || cap <= 0) return 0;
    return getEffectiveEnrollment(row) / cap;
  }

  function coercePercent0to100(raw) {
    const n = parseFloat((raw ?? "").toString().trim());
    if (!Number.isFinite(n)) return 0;
    return n <= 1.5 ? n * 100 : n;
  }

  function coerceBuildingScore0to10(raw) {
    const n = parseFloat((raw ?? "").toString().trim().replace(/,/g, ""));
    if (!Number.isFinite(n)) return NaN;
    return n <= 1.5 ? n * 10 : n;
  }

  function normalizeSchoolLevel(rawLevel) {
    if (!rawLevel) return null;
    const original = rawLevel.toString().toLowerCase();
    const cleaned = original.replace(/[^a-z0-9]/g, "");
    if (cleaned.includes("elementary") || cleaned === "es") return "elementary";
    if (cleaned.includes("k8") || original.includes("k-8") || original.includes("k 8") || /k\s*[-–—]\s*8/i.test(rawLevel)) return "k8";
    if (cleaned.includes("middle") || cleaned === "ms") return "middle";
    if (cleaned.includes("high") || cleaned === "hs") return "high";
    if (cleaned.includes("612") || cleaned.includes("k12") || original.includes("6-12") || original.includes("k-12") || original.includes("6 12") || original.includes("k 12")) return "k12";
    return null;
  }

  function getEnrollmentDecision(row, t) {
    const utilization = getEffectiveUtilization(row);
    const enrollment = getEffectiveEnrollment(row);
    const schoolLevelRaw = row?.["School Level"] ?? row?.SchoolLevel ?? "";
    let level = normalizeSchoolLevel(schoolLevelRaw);
    if (!level && (row?.["Building Name"] || row?.BuildingName)) {
      level = normalizeSchoolLevel(row?.["Building Name"] || row?.BuildingName);
    }

    let enrollmentThreshold;
    if (level === "elementary") enrollmentThreshold = t.elementaryEnrollment || 220;
    else if (level === "k8") enrollmentThreshold = t.k8Enrollment || 360;
    else if (level === "middle") enrollmentThreshold = t.middleEnrollment || 500;
    else if (level === "high") enrollmentThreshold = t.highEnrollment || 700;
    else if (level === "k12") enrollmentThreshold = t.k12Enrollment || 600;
    else enrollmentThreshold = t.middleEnrollment || 500;

    const utilizationBelowThreshold = Number.isFinite(utilization) ? utilization < t.utilization : false;
    const enrollmentBelowThreshold = Number.isFinite(enrollment) ? enrollment < enrollmentThreshold : false;
    return utilizationBelowThreshold || enrollmentBelowThreshold ? "Yes" : "No";
  }

  function evaluateSchoolDecision(row, t = DECISION_THRESHOLDS) {
    if (!row) return "Unknown";
    const util = getEffectiveUtilization(row);
    const util2 = Number.isFinite(util) && util > t.utilizationHigh ? "Yes" : "No";

    // dist threshold depends on level (infer if needed)
    let level = normalizeSchoolLevel(row["School Level"] || "");
    if (!level && row["Building Name"]) level = normalizeSchoolLevel(row["Building Name"]);
    let distanceThreshold = t.middleDistance || 5.0;
    if (level === "elementary") distanceThreshold = t.elementaryDistance;
    else if (level === "k8") distanceThreshold = t.k8Distance;
    else if (level === "middle") distanceThreshold = t.middleDistance;
    else if (level === "high") distanceThreshold = t.highDistance;
    else if (level === "k12") distanceThreshold = t.k12Distance;

    const distVal = Number(row.DistanceUnderutilizedschools);
    const dist = Number.isFinite(distVal) && distVal <= distanceThreshold ? "Yes" : "No";
    const growthVal = window.getEffectiveEnrollmentGrowth ? window.getEffectiveEnrollmentGrowth(row) : null;
    const growth = (growthVal != null && Number.isFinite(growthVal)) && growthVal > t.enrollmentGrowth ? "Yes" : "No";

    const attendancePct = coercePercent0to100(row.AttendanceAreaEnrollment);
    const attendance = attendancePct >= t.attendanceAreaEnrollment ? "Yes" : "No";
    const eduAdeqPct = Number(row.EducationalAdequacy) * 100;
    const edu2 = Number.isFinite(eduAdeqPct) && eduAdeqPct >= t.adequateProgramsMin ? "Yes" : "No";
    const fac2 = coerceBuildingScore0to10(row.BuildingScore) >= t.buildingThreshold ? "Yes" : "No";
    const expand = (row.SiteCapacity || "").toString().toLowerCase() === "yes" ? "Yes" : "No";

    const fac3_below = coerceBuildingScore0to10(row.BuildingScore) <= t.buildingThresholdBelow ? "Yes" : "No";
    const edu3 = edu2;
    const below50 = (row["Below50PCTL_EA_Cat"] || "").toString().toLowerCase() === "yes";
    const edu3_2 = below50 ? "Yes" : "No";
    const fac3_above = coerceBuildingScore0to10(row.BuildingScore) >= t.buildingThresholdAbove ? "Yes" : "No";

    const edu4 = edu2;
    const fac4 = coerceBuildingScore0to10(row.BuildingScore) >= t.buildingThresholdFlow4 ? "Yes" : "No";
    // dist4 uses raw school level text heuristics
    const sl = (row["School Level"] || "").toString().toLowerCase();
    let dist4Threshold = t.middleDistance;
    if (sl.includes("elementary")) dist4Threshold = t.elementaryDistance;
    else if (sl.includes("k-8")) dist4Threshold = t.k8Distance;
    else if (sl.includes("middle")) dist4Threshold = t.middleDistance;
    else if (sl.includes("high")) dist4Threshold = t.highDistance;
    else if (sl.includes("6-12")) dist4Threshold = t.k12Distance;
    const dist4 = Number.isFinite(distVal) && distVal <= dist4Threshold ? "Yes" : "No";

    const util1 = getEnrollmentDecision(row, t);

    // Determine flow
    let currentFlow = 1;
    if (util1 === "Yes") {
      if (dist === "Yes") {
        currentFlow = growth === "Yes" ? 3 : 4;
      } else {
        currentFlow = 3;
      }
    } else {
      currentFlow = util2 === "Yes" ? 2 : 3;
    }

    let finalDecision = "Unknown";
    if (currentFlow === 2) {
      if (attendance === "Yes") {
        if (expand === "Yes") {
          if (fac2 === "Yes") {
            finalDecision = edu2 === "Yes" ? "Building Addition" : "Building Addition with Capital Investment";
          } else {
            finalDecision = edu2 === "Yes" ? "Building Addition with Capital Investment" : "Building Replacement";
          }
        } else {
          finalDecision = "Policy Solution for Overcrowding";
        }
      } else {
        finalDecision = "Policy Solution for Overcrowding";
      }
    }
    if (currentFlow === 3) {
      if (fac3_above === "Yes") {
        if (fac3_below === "Yes") {
          finalDecision = "Targeted Capital Investment";
        } else {
          finalDecision = edu3_2 === "Yes" ? "Standard Maintenance" : "Targeted Capital Investment";
        }
      } else {
        finalDecision = edu3 === "Yes" ? "Major Capital Investment" : "Building Replacement";
      }
    }
    if (currentFlow === 4) {
      // DecisionLogic.js uses invest = "No" currently
      const invest = "No";
      if (invest === "Yes") {
        finalDecision = "Welcoming School";
      } else {
        if (edu4 === "Yes") {
          finalDecision = fac4 === "Yes" ? "Welcoming School" : "Welcoming School with Capital Investment";
        } else {
          if (fac4 === "Yes") {
            finalDecision = "Welcoming School with Capital Investment";
          } else {
            finalDecision = dist4 === "Yes" ? "Closure (Goes to Welcoming School)" : "Welcoming School with Building Replacement";
          }
        }
      }
    }

    return finalDecision;
  }

  function getSchoolFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("school");
    return raw ? raw.toString() : "";
  }

  function getUidFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("uid");
    return raw ? raw.toString() : "";
  }

  function norm(s) {
    return (s ?? "").toString().trim();
  }

  function normName(s) {
    // Normalize school/building name for matching across CSVs.
    return norm(s)
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function withCacheBust(path) {
    const p = (path ?? "").toString();
    if (!p) return p;
    // Do not cache-bust data: URLs
    if (p.startsWith("data:")) return p;
    const join = p.includes("?") ? "&" : "?";
    return `${p}${join}v=${encodeURIComponent(CACHE_BUST)}`;
  }

  function parseCsv(path) {
    return new Promise((resolve, reject) => {
      const url = withCacheBust(path);
      if (!parseCsv.__logged) parseCsv.__logged = new Set();
      if (!parseCsv.__logged.has(url)) {
        parseCsv.__logged.add(url);
        console.log("Loading CSV:", url);
      }
      Papa.parse(url, {
        header: true,
        skipEmptyLines: true,
        download: true,
        complete: (results) => resolve(Array.isArray(results.data) ? results.data : []),
        error: (err) => reject(err),
      });
    });
  }

  // Unit cost library integration
  function normKeyLoose(s) {
    // Normalize NBSP and common Unicode dashes to improve matching with UnitCostLibrary/pivot headers.
    return norm(s)
      .replace(/\u00A0/g, " ")
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function normProjectKey(s) {
    // normalize whitespace + slash spacing so "A/B" and "A / B" match
    // Also strip PapaParse duplicate-header suffixes like "_1", "_2" that can appear in pivot headers.
    // Example: "Front of school branding_1, landscape upgrades" -> "Front of school branding, landscape upgrades"
    return normKeyLoose(s)
      .replace(/\s*\/\s*/g, "/")
      .replace(/_+\d+\b/g, "");
  }

  function normalizeFacilityName(raw) {
    let s = norm(raw);
    if (!s) return "";
    // Split CamelCase (e.g., AdamsES -> Adams ES)
    s = s.replace(/([a-z])([A-Z])/g, "$1 $2");
    // Normalize common grade shorthand so "K8" -> "K 8", etc.
    s = s.replace(/\b(K|PK)(\d)/gi, "$1 $2");
    s = s.replace(/\b(K)-(\d)/gi, "$1 $2");
    return normName(s);
  }

  function normalizeRoomCategory(raw) {
    return normKeyLoose(raw).replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ").trim().toLowerCase();
  }

  const ROOM_SCHEDULE_CATEGORY_BY_PROJECT_KEY = new Map([
    [normProjectKey("Heavily modernize admin"), normalizeRoomCategory("modernize admin")],
    [normProjectKey("Lightly modernize admin"), normalizeRoomCategory("modernize admin")],
    [normProjectKey("Heavily modernize cafeteria"), normalizeRoomCategory("modernize cafeteria")],
    [normProjectKey("Lightly modernize cafeteria"), normalizeRoomCategory("modernize cafeteria")],
    [normProjectKey("Heavily modernize classrooms"), normalizeRoomCategory("modernize classrooms")],
    [normProjectKey("Lightly modernize classrooms"), normalizeRoomCategory("modernize classrooms")],
    [normProjectKey("Lightly modernize corridors"), normalizeRoomCategory("modernize corridors")],
    [normProjectKey("Heavily modernize gym / assembly space"), normalizeRoomCategory("modernize gym / assembly space")],
    [normProjectKey("Lightly modernize gym / assembly space"), normalizeRoomCategory("modernize gym / assembly space")],
    [normProjectKey("Modernize kitchen"), normalizeRoomCategory("modernize kitchen")],
    [normProjectKey("Heavily modernize MPR"), normalizeRoomCategory("modernize MPR")],
    [normProjectKey("Lightly modernize MPR"), normalizeRoomCategory("modernize MPR")],
    [normProjectKey("Lightly modernize library/media center"), normalizeRoomCategory("modernize library/media center")],
    [normProjectKey("Heavily modernize restrooms"), normalizeRoomCategory("modernize restrooms")],
    [
      normProjectKey("Heavily modernize STEM / CTE / specialized labs (MS/HS)"),
      normalizeRoomCategory("modernize STEM / CTE / specialized labs (MS/HS)"),
    ],
    [
      normProjectKey("Heavily modernize STEM/specialized labs (ES)"),
      normalizeRoomCategory("modernize STEM/specialized labs (ES)"),
    ],
  ]);

  function findRoomScheduleKey(keys, matcher) {
    return keys.find((k) => matcher.test(norm(k).toLowerCase())) || "";
  }

  function getRoomScheduleFieldValue(row, key) {
    if (!row || !key) return "";
    const direct = row[key];
    if (direct !== undefined) return direct;
    return getRowFieldInsensitive(row, key);
  }

  function buildRoomScheduleIndex(rows) {
    const sample = (rows || []).find((r) => r && Object.keys(r).length) || {};
    const keys = Object.keys(sample || {});
    const facilityKey = findRoomScheduleKey(keys, /facility\s*name/i);
    const campusKey = findRoomScheduleKey(keys, /campus\s*code/i);
    const areaKey = findRoomScheduleKey(keys, /^area$/i) || findRoomScheduleKey(keys, /\barea\b/i);
    const categoryKey =
      findRoomScheduleKey(keys, /cost\s*estimate|costestimate|cost\s*link|category|project/i) ||
      findRoomScheduleKey(keys, /costestimate/i);
    return { facilityKey, campusKey, areaKey, categoryKey };
  }

  function buildRoomScheduleTotals(rows) {
    const idx = buildRoomScheduleIndex(rows);
    if (!idx.areaKey || !idx.categoryKey) {
      console.warn("Room schedule CSV missing expected headers.", idx);
      return { byUid: new Map(), byFacility: new Map() };
    }

    const byUid = new Map();
    const byFacility = new Map();
    (rows || []).forEach((r) => {
      const categoryRaw = norm(getRoomScheduleFieldValue(r, idx.categoryKey));
      if (!categoryRaw) return;
      const area = parseNumberMaybe(getRoomScheduleFieldValue(r, idx.areaKey));
      if (area === null) return;

      const categoryKey = normalizeRoomCategory(categoryRaw);
      if (!categoryKey) return;

      const uid = idx.campusKey ? norm(getRoomScheduleFieldValue(r, idx.campusKey)) : "";
      if (uid) {
        let catMap = byUid.get(uid);
        if (!catMap) {
          catMap = new Map();
          byUid.set(uid, catMap);
        }
        catMap.set(categoryKey, (catMap.get(categoryKey) || 0) + area);
      }

      const facilityRaw = idx.facilityKey ? norm(getRoomScheduleFieldValue(r, idx.facilityKey)) : "";
      const facilityKey = normalizeFacilityName(facilityRaw);
      if (facilityKey) {
        let facMap = byFacility.get(facilityKey);
        if (!facMap) {
          facMap = new Map();
          byFacility.set(facilityKey, facMap);
        }
        facMap.set(categoryKey, (facMap.get(categoryKey) || 0) + area);
      }
    });

    return { byUid, byFacility };
  }

  function applyRoomScheduleUnitValues(rows, uid, pivotRow, decisionRow) {
    if (!rows || !rows.length) return;
    let catMap = uid ? roomScheduleByUid.get(uid) : null;
    if (!catMap && pivotRow) {
      const aeName = normalizeFacilityName(pivotRow?.AE_SchoolName ?? pivotRow?.["AE_SchoolName"]);
      const schoolName = normalizeFacilityName(pivotRow?.SchoolName ?? pivotRow?.["SchoolName"]);
      catMap = (aeName && roomScheduleByFacility.get(aeName)) || (schoolName && roomScheduleByFacility.get(schoolName)) || null;
    }
    if (!catMap && decisionRow) {
      const buildingName = normalizeFacilityName(decisionRow?.["Building Name"] ?? decisionRow?.BuildingName ?? "");
      catMap = buildingName ? roomScheduleByFacility.get(buildingName) : null;
    }
    if (!catMap) return;

    rows.forEach((r) => {
      const project = norm(r?.AssetType);
      if (!project) return;
      const pk = normProjectKey(project);
      const categoryKey = ROOM_SCHEDULE_CATEGORY_BY_PROJECT_KEY.get(pk);
      if (!categoryKey) return;
      const sum = catMap.get(categoryKey);
      if (sum == null) return;
      const rounded = Math.round(sum);
      r.UnitValue = Number.isFinite(rounded) ? rounded.toLocaleString() : r.UnitValue;
    });
  }

  function buildPivotValueMaps(pivotRow) {
    const scoreByPk = new Map();
    const unitValueByPk = new Map();
    if (!pivotRow) return { scoreByPk, unitValueByPk };

    const keys = Object.keys(pivotRow || {});
    keys.forEach((k) => {
      if (!k || typeof k !== "string") return;
      // Extremely tolerant header parsing (handles trailing CR/spaces, UnitValue vs Unit Value)
      const kt = k.trim();
      const mScore = kt.match(/^(.*)\s+score\s*$/i);
      const mUv = kt.match(/^(.*)\s+unit\s*value\s*$/i) || kt.match(/^(.*)\s+unitvalue\s*$/i);
      if (!mScore && !mUv) return;

      const base = (mScore ? mScore[1] : mUv[1]) || "";
      const pk = normProjectKey(base);
      if (!pk) return;

      if (mScore) {
        if (!scoreByPk.has(pk) || !norm(scoreByPk.get(pk))) scoreByPk.set(pk, pivotRow[k]);
      } else {
        if (!unitValueByPk.has(pk) || !norm(unitValueByPk.get(pk))) unitValueByPk.set(pk, pivotRow[k]);
      }
    });

    return { scoreByPk, unitValueByPk };
  }

  function makeUnitCostKey(systemCategory, projectOrAssetType) {
    return `${normKeyLoose(systemCategory)}||${normProjectKey(projectOrAssetType)}`;
  }

  function formatUnitCost(unitCostRaw, unitRaw) {
    let cost = norm(unitCostRaw).replace(/\s+/g, " ").trim();
    if (!cost) return "";
    if (cost.includes("/")) return cost;
    // Ensure we consistently display "$xxxx/UNIT" when the cost is numeric.
    // (Library often has "500" instead of "$500".)
    if (!cost.startsWith("$")) {
      const n = parseNumberMaybe(cost);
      if (n !== null) cost = `$${cost.replace(/^\+/, "").trim()}`;
    }
    const u = norm(unitRaw).replace(/\s+/g, " ").trim();
    return u ? `${cost}/${u.toUpperCase()}` : cost;
  }

  function getRowFieldInsensitive(row, desiredName) {
    if (!row) return undefined;
    if (row[desiredName] !== undefined) return row[desiredName];
    const target = norm(desiredName).toLowerCase();
    const keys = Object.keys(row || {});
    for (const k of keys) {
      if (norm(k).toLowerCase() === target) return row[k];
    }
    return undefined;
  }

  function buildUnitCostLibraryIndex(rows) {
    const map = new Map();
    const conflicts = [];
    const order = [];
    const seenPk = new Set();

    (rows || []).forEach((r) => {
      // Be tolerant of BOM/whitespace/Excel header oddities by matching keys case-insensitively.
      const sys = norm(getRowFieldInsensitive(r, "SystemCategory"));
      const proj = norm(getRowFieldInsensitive(r, "Project") ?? getRowFieldInsensitive(r, "AssetType"));
      const unit = norm(getRowFieldInsensitive(r, "Unit"));
      const unitCost = norm(getRowFieldInsensitive(r, "UnitCost"));
      const scoreLabelRaw = norm(getRowFieldInsensitive(r, "Score"));
      const valueRaw = norm(getRowFieldInsensitive(r, "Value"));
      const key = makeUnitCostKey(sys, proj);
      if (!sys || !proj) return;

      const formatted = formatUnitCost(unitCost, unit);
      // IMPORTANT: Always include the project even if Unit/UnitCost are blank.
      // The School Profile must reflect all library Project Types.
      const scoreLabel = scoreLabelRaw ? scoreLabelRaw.toLowerCase() : "";
      const score = scoreLabel === "good" ? "Good" : scoreLabel === "poor" ? "Poor" : (scoreLabelRaw || "");

      if (!map.has(key)) {
        map.set(key, { sys, proj, unit, unitCost: formatted, score, value: valueRaw });
        const pk = normProjectKey(proj);
        if (pk && !seenPk.has(pk)) {
          seenPk.add(pk);
          order.push({ proj, pk, sys });
        }
        return;
      }

      const existing = map.get(key);
      if (!existing) return;

      // Upgrade missing fields from later duplicates (your library currently contains duplicated blocks).
      if (!existing.unit && unit) existing.unit = unit;
      if (!existing.unitCost && formatted) existing.unitCost = formatted;
      if (!existing.score && score) existing.score = score;
      if (!existing.value && valueRaw) existing.value = valueRaw;

      // Track conflicting costs (keep first stable value).
      if (existing.unitCost && formatted && existing.unitCost !== formatted) {
        conflicts.push({ sys, proj, existing: existing.unitCost, incoming: formatted });
      }
    });

    if (conflicts.length) {
      console.warn(
        `⚠️ UnitCostLibrary.csv has ${conflicts.length} conflicting UnitCost entries for the same SystemCategory+Project. Using the first value encountered.`,
        conflicts.slice(0, 20)
      );
    }

    // Also build a fast lookup by Project name (AssetType), used to reconstruct rows from pivot file.
    unitCostByProjectKey = new Map();
    for (const rec of map.values()) {
      const pk = normProjectKey(rec?.proj);
      if (pk && !unitCostByProjectKey.has(pk)) unitCostByProjectKey.set(pk, rec);
    }

    // Preserve the library's project ordering (this is what drives the profile table rows).
    libraryProjectOrder = order;

    // Validate library shape (informational)
    const catSet = new Set(libraryProjectOrder.map((p) => norm(p.sys)).filter(Boolean));
    if (libraryProjectOrder.length !== 54 || catSet.size !== 7) {
      console.warn(
        `⚠️ UnitCostLibrary.csv counts: projects=${libraryProjectOrder.length}, categories=${catSet.size}. Categories:`,
        Array.from(catSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }))
      );
    }

    // Diagnostics: if any records ended up with no SystemCategory, log them.
    const missingSys = [];
    for (const rec of map.values()) {
      if (!norm(rec?.sys)) missingSys.push(rec?.proj);
    }
    if (missingSys.length) {
      console.warn(
        `⚠️ UnitCostLibrary.csv: ${missingSys.length} projects have blank SystemCategory (will appear as Uncategorized). First 20:`,
        missingSys.slice(0, 20)
      );
    }

    return map;
  }

  function buildPivotIndexes(rows) {
    assetsByUid = new Map();
    assetsByNameKey = new Map();
    (rows || []).forEach((r) => {
      const uid = norm(r["UniqueID"] ?? r.UniqueID);
      const name = norm(r["SchoolName"] ?? r.SchoolName);
      if (uid && !assetsByUid.has(uid)) assetsByUid.set(uid, r);
      const nk = normName(name);
      if (nk && !assetsByNameKey.has(nk)) assetsByNameKey.set(nk, r);
    });
  }

  function getPivotRowForSelection(uid, name) {
    const u = norm(uid);
    const n = norm(name);
    if (u && assetsByUid.has(u)) return assetsByUid.get(u);
    if (n) return assetsByNameKey.get(normName(n)) || null;
    return null;
  }

  function isAdditionStoryProject(project) {
    return (
      project === "New 1-story building (addition)" ||
      project === "New 2-story building" ||
      project === "New 3-story building"
    );
  }

  function buildRowsFromPivot(pivotRow) {
    if (!pivotRow) return [];
    const uid = norm(pivotRow["UniqueID"] ?? pivotRow.UniqueID);
    const school = norm(pivotRow["SchoolName"] ?? pivotRow.SchoolName);

    const out = [];
    let rowId = 0;
    const { scoreByPk, unitValueByPk } = buildPivotValueMaps(pivotRow);

    // Build rows in the exact order defined by UnitCostLibrary.csv.
    (libraryProjectOrder || []).forEach((p) => {
      const project = norm(p?.proj);
      const pk = norm(p?.pk);
      if (!project || !pk) return;

      let pv = norm(unitValueByPk.get(pk));
      const scoreVal = norm(scoreByPk.get(pk)); // numeric (from pivot) when present
      const lib = unitCostByProjectKey.get(pk) || null;
      if (!lib) return;
      const sys = norm(lib?.sys);

      // Fallback: if we couldn't map by pk, try direct/loose header matching.
      if (!pv) {
        const direct = pivotRow[`${project} UnitValue`];
        if (direct !== undefined) pv = norm(direct);
        if (!pv) {
          const canonProject = normKeyLoose(project);
          const candidateKey = Object.keys(pivotRow || {}).find((k) => {
            const ck = normKeyLoose(k);
            return ck.endsWith(" unitvalue") && ck.includes(canonProject);
          });
          if (candidateKey) pv = norm(pivotRow[candidateKey]);
        }
      }

      // Debug (targeted): only log for the one row you care about, to avoid console spam.
      if (school === "Bear Creek HS" && project === "Front of school branding, landscape upgrades" && scoreVal && !pv) {
        const candidates = Object.keys(pivotRow || {})
          .filter((kk) => normKeyLoose(kk).includes(normKeyLoose(project)))
          .slice(0, 10);
        console.warn("Missing UnitValue for Bear Creek HS front-of-school row", { candidates });
      }

      // Mirror prior profile rules:
      // - Under 03_addition, only story buildings + cafeteria/kitchen pull Unit+UnitCost from library
      // - everything else can pull Unit+UnitCost from library if present
      const isAddition = sys === "03_addition";
      const isCafKitchen = project === "New cafeteria and kitchen";
      const allowLibraryForAddition = isAdditionStoryProject(project) || isCafKitchen;

      const unit = (isAddition && !allowLibraryForAddition) ? "" : norm(lib?.unit);
      const unitCost = (isAddition && !allowLibraryForAddition) ? "" : norm(lib?.unitCost);
      const libScore = norm(lib?.score);

      out.push({
        UniqueID: uid,
        SchoolName: school,
        SystemCategory: sys, // used for grouping/filtering
        AssetType: project, // internal field; displayed as "Project Type"
        // Display the library Score ("Good"/"Poor") in the ConditionScore column.
        ConditionScore: libScore || scoreVal,
        Unit: unit,
        UnitCost: unitCost,
        UnitValue: pv,
        ReplacementCost: "",
        __libraryScore: libScore,
        __pivotConditionScore: scoreVal,
        __rowId: rowId++,
      });
    });

    return out;
  }

  function applyUnitCostLibraryToAssets(assetRows, unitCostIndex) {
    if (!assetRows || !assetRows.length || !unitCostIndex || unitCostIndex.size === 0) {
      return { filled: 0, matched: 0 };
    }

    let filled = 0;
    let overridden = 0;
    let matched = 0;
    let unitOverridden = 0;

    assetRows.forEach((r) => {
      const sys = norm(r.SystemCategory ?? r["SystemCategory"]);
      const proj = norm(r.AssetType ?? r["AssetType"]);

      // Under 03_addition, only the three story-building rows are library-driven.
      // All other addition rows should keep the template's basis,
      // EXCEPT "New cafeteria and kitchen", which should pull Unit+UnitCost from the library
      // while taking UnitValue from the template.
      const isAddition = norm(sys) === "03_addition";
      const isStoryProject =
        proj === "New 1-story building (addition)" || proj === "New 2-story building" || proj === "New 3-story building";
      const isCafeteriaKitchen = proj === "New cafeteria and kitchen";
      if (isAddition && !isStoryProject && !isCafeteriaKitchen) return;

      const key = makeUnitCostKey(sys, proj);
      const rec = unitCostIndex.get(key);
      if (!rec) return;
      matched += 1;

      // Override Unit if provided by the library
      if (norm(rec.unit)) {
        const curUnit = norm(r.Unit ?? r["Unit"]);
        if (curUnit !== norm(rec.unit)) {
          r.Unit = norm(rec.unit);
          unitOverridden += 1;
        }
      }

      const current = norm(r.UnitCost ?? r["UnitCost"]);
      if (!current && norm(rec.unitCost)) {
        r.UnitCost = rec.unitCost;
        filled += 1;
        return;
      }

      // Library is authoritative: override template UnitCost when different.
      if (norm(rec.unitCost) && current !== rec.unitCost) {
        r.UnitCost = rec.unitCost;
        overridden += 1;
      }
    });

    return { filled, matched, overridden, unitOverridden };
  }

  function buildDecisionIndexes(rows) {
    decisionByUid = new Map();
    decisionByNameKey = new Map();
    (rows || []).forEach((r) => {
      const uid = norm(r["UniqueID"] ?? r.UniqueID);
      const name = norm(r["Building Name"] ?? r.BuildingName ?? r["BuildingName"]);
      if (uid) decisionByUid.set(uid, r);
      const nk = normName(name);
      if (nk && !decisionByNameKey.has(nk)) decisionByNameKey.set(nk, r);
    });
  }

  function setSelectedSchool(uid, name) {
    resolvedUniqueId = norm(uid);
    resolvedSchoolName = norm(name);
    resolvedDecisionOutcome = "";
    keepBlackForCosts = false;
    keepBlackForDemolitionCost = false;

    if (elSchoolSelect) {
      // Value is UniqueID if available, else fall back to normalized name key.
      if (resolvedUniqueId && Array.from(elSchoolSelect.options).some((o) => o.value === resolvedUniqueId)) {
        elSchoolSelect.value = resolvedUniqueId;
      } else {
        elSchoolSelect.value = "";
      }
    }

    // Update query string without a reload
    try {
      const params = new URLSearchParams(window.location.search);
      if (resolvedSchoolName) params.set("school", resolvedSchoolName);
      if (resolvedUniqueId) params.set("uid", resolvedUniqueId);
      window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
    } catch {
      // ignore
    }

    // Update summary header/meta from decision export if we can
    const decision = resolvedUniqueId ? decisionByUid.get(resolvedUniqueId) : decisionByNameKey.get(normName(resolvedSchoolName));
    const buildingName = norm(decision?.["Building Name"] ?? resolvedSchoolName) || "—";
    elSchoolNameHeader.textContent = buildingName;

    const status = norm(decision?.Status);
    const level = norm(decision?.["School Level"]);
    const cap = norm(decision?.Capacity);
    const enr = norm(decision?.Enrollment);
    const sqfRaw = norm(
      decision?.[" SquareFt "] ??
        decision?.SquareFt ??
        decision?.["SquareFt"] ??
        decision?.["Square Ft"] ??
        decision?.["Sq Ft"] ??
        decision?.["SqFt"]
    );
    const sqfNum = sqfRaw ? Number(sqfRaw.replace(/,/g, "")) : NaN;
    const sqf = Number.isFinite(sqfNum) ? sqfNum.toLocaleString() : sqfRaw;

    // Determine flowchart outcome and whether to keep costs in black
    resolvedDecisionOutcome = decision ? evaluateSchoolDecision(decision, getActiveThresholds()) : "";
    const keepBlackOutcomes = [
      "Major Capital Investment",
      "Welcoming School with Capital Investment",
      "Building Addition with Capital Investment",
    ];
    keepBlackForCosts = keepBlackOutcomes.includes((resolvedDecisionOutcome || "").trim());
    keepBlackForDemolitionCost = ["Building Replacement", "Welcoming School with Building Replacement"].includes(
      (resolvedDecisionOutcome || "").trim()
    );
    const outcomeTrim = (resolvedDecisionOutcome || "").trim();
    const needsGutReno = keepBlackOutcomes.includes(outcomeTrim);
    const needsNewConstruction =
      ["Building Replacement", "Welcoming School with Building Replacement"].includes(outcomeTrim) ||
      outcomeTrim.toLowerCase().includes("demolition");

    if (elTotalReplacementCost) {
      elTotalReplacementCost.textContent = "—";
    }

    // Building addition planning (1-story only) — rendered under 03_addition group
    additionPlanningState.show = false;
    additionPlanningState.studentsOver = null;
    additionPlanningState.gsfTarget = null;
    additionPlanningState.selectedKey = null;
    additionPlanningState.stories = loadAdditionStoriesForSchool(resolvedUniqueId);
    additionPlanningState.collapsed = loadAdditionCollapsedForSchool(resolvedUniqueId);

    const isBuildingAdditionDecision = (resolvedDecisionOutcome || "").includes("Building Addition");
    if (decision && isBuildingAdditionDecision) {
      const parseNum = (v) => {
        const s = (v ?? "").toString().replace(/,/g, "").trim();
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
      };
      const enrollment = getEffectiveEnrollment(decision);
      const capacity = parseNum(decision.Capacity);
      const availableSeats = capacity !== null && Number.isFinite(enrollment) ? Math.round(capacity - enrollment) : null;
      const overBySeats = availableSeats !== null ? Math.max(0, -availableSeats) : null;
      const overByCap = Number.isFinite(enrollment) && capacity !== null ? Math.max(0, enrollment - capacity) : null;
      const studentsOver = overBySeats !== null ? overBySeats : (overByCap !== null ? overByCap : 0);

      // Determine school type bucket for planning target
      const levelRaw = (decision["School Level"] ?? decision.SchoolLevel ?? "").toString();
      let levelKey = normalizeSchoolLevel(levelRaw);
      if (!levelKey && levelRaw.toLowerCase().includes("multi")) levelKey = "k8";

      const TARGETS = [
        { key: "elementary", label: "Elementary (ES)", gsfPerStudent: 110 },
        { key: "middle", label: "Middle School (MS)", gsfPerStudent: 135 },
        { key: "k8", label: "K–8", gsfPerStudent: 125 },
        { key: "high", label: "High School (HS)", gsfPerStudent: 180 },
      ];
      const selectedTarget = TARGETS.find((t) => t.key === levelKey) || null;
      const gsfNeed = selectedTarget ? Math.round(studentsOver * selectedTarget.gsfPerStudent) : null;
      additionPlanningState.show = true;
      additionPlanningState.studentsOver = studentsOver;
      additionPlanningState.gsfTarget = gsfNeed;
      additionPlanningState.selectedKey = selectedTarget ? selectedTarget.key : null;
    }

    const metaBits = [];
    if (resolvedUniqueId) metaBits.push(`UniqueID: ${resolvedUniqueId}`);
    if (status) metaBits.push(`Status: ${status}`);
    if (level) metaBits.push(`Level: ${level}`);
    if (cap) metaBits.push(`Capacity: ${cap}`);
    const enrEff = getEffectiveEnrollment(decision);
    if (Number.isFinite(enrEff) || enr) metaBits.push(`Enrollment: ${Number.isFinite(enrEff) ? enrEff.toLocaleString() : enr}${!getIncludePKInEnrollment() && norm(decision?.PKEnrollment) ? ` (excl. PK: ${norm(decision.PKEnrollment)})` : ""}`);
    if (sqf) metaBits.push(`SQF: ${sqf}`);
    if (resolvedDecisionOutcome) metaBits.push(`Decision: ${resolvedDecisionOutcome}`);
    elSchoolMeta.textContent = metaBits.join(" • ");

    // Resolve the pivot row (one row per school), then rebuild per-project rows.
    const pivotRow = getPivotRowForSelection(resolvedUniqueId, resolvedSchoolName);
    schoolRows = buildRowsFromPivot(pivotRow);
    applyRoomScheduleUnitValues(schoolRows, resolvedUniqueId, pivotRow, decision);

    // Derive UnitValue + ReplacementCost.
    // Rule:
    // - 01_new construction + 02_gut & renovation: UnitValue is derived from the school's GSF
    // - everything else: UnitValue comes from JeffCoProjectDataTemplate.csv (do not overwrite)
    (schoolRows || []).forEach((r) => {
      const systemCategory = norm(r?.SystemCategory);

      // Decision-based relevance:
      // - Gut & Reno only needed for capital investment outcomes
      // - New Construction only relevant for demolition / replacement outcomes
      if (systemCategory === "02_gut & renovation" && !needsGutReno) {
        r.__excludedFromTotals = true;
        r.__excludedReason = "decision";
        r.UnitValue = "";
        r.ReplacementCost = "Not included";
        return;
      }
      if (systemCategory === "01_new construction" && !needsNewConstruction) {
        r.__excludedFromTotals = true;
        r.__excludedReason = "decision";
        r.UnitValue = "";
        r.ReplacementCost = "Not included";
        return;
      }

      // For gut renovation, only compute/carry the level-relevant row.
      // This prevents totals from summing ES+MS+HS+K-8 all together.
      if (!isRelevantGutRenovationRow(r, decision)) {
        r.__excludedFromTotals = true;
        r.__excludedReason = "level";
        r.UnitValue = "";
        // Make exclusion explicit in the ReplacementCost column.
        r.ReplacementCost = "Not included";
        return;
      }
      // For new construction, only compute/carry the level-relevant row.
      if (!isRelevantNewConstructionRow(r, decision)) {
        r.__excludedFromTotals = true;
        r.__excludedReason = "level";
        r.UnitValue = "";
        r.ReplacementCost = "Not included";
        return;
      }

      // Compute Good/Poor from Value threshold (per-school pivot score first, then UnitValue).
      const lib = unitCostIndex ? unitCostIndex.get(makeUnitCostKey(r.SystemCategory, r.AssetType)) : null;
      const computed = computeConditionScoreFromValue(r, lib);
      if (computed) {
        r.ConditionScore = computed;
        r.__libraryScore = computed; // keep compatibility with existing rendering logic
      }

      // Score-based inclusion: Poor = included (black), Good = excluded (grey)
      const s = norm(r?.ConditionScore || r?.__libraryScore).toLowerCase();
      const excludedByScore = s === "good";
      r.__excludedFromTotals = excludedByScore ? true : false;
      r.__excludedReason = excludedByScore ? "good" : "";

      const unit = normalizeUnit(r?.Unit, r?.UnitCost);
      if (!unit) return; // still allow ConditionScore/inclusion above; just skip cost math

      const derivedQ = computeDerivedQuantity(r, decision);
      if (derivedQ !== null && shouldUseSchoolSqfForRow(r)) {
        // Only overwrite UnitValue for the GSF-driven categories.
        r.UnitValue = Number.isFinite(derivedQ) ? Math.round(derivedQ).toString() : String(derivedQ);
      }

      const rc = computeReplacementCost(r, decision);
      if (rc !== null && Number.isFinite(rc)) {
        r.ReplacementCost = `$${Math.round(rc).toLocaleString()}`;
      }
    });

    updateTotalReplacementCostDisplay();

    populateFilters();
    applyFilters();
    render();
    elDownload.disabled = !schoolRows.length;
  }

  function normLoose(s) {
    // More aggressive normalization for matching human-entered categories.
    return norm(s)
      .replace(/\s+/g, " ")
      .replace(/\s*\/\s*/g, "/")
      .toLowerCase();
  }

  function loadPriorityOverrides() {
    try {
      const raw = window.localStorage ? window.localStorage.getItem(PRIORITY_OVERRIDES_STORAGE_KEY) : null;
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function savePriorityOverrides() {
    try {
      if (!window.localStorage) return;
      window.localStorage.setItem(PRIORITY_OVERRIDES_STORAGE_KEY, JSON.stringify(priorityOverrides || {}));
    } catch {
      // ignore
    }
  }

  function getRowKey(row) {
    // AssetID was removed from the profile dataset; use a stable composite key.
    const uid = norm(row?.UniqueID);
    const school = norm(row?.SchoolName);
    const sys = norm(row?.SystemCategory);
    const asset = norm(row?.AssetType);
    const composite = [uid, school, sys, asset].filter(Boolean).join("|");
    if (composite) return composite;
    const rid = row?.__rowId;
    return rid === 0 || rid ? String(rid) : "";
  }

  function defaultPriorityForRow(row) {
    const system = normLoose(row?.SystemCategory);
    const asset = normLoose(row?.AssetType);

    // Keep original intent, but work with the new project taxonomy.
    if (system === "ada" || asset.includes("ada")) {
      return "High";
    }
    if (asset.includes("playground") || asset.includes("site hardscape")) {
      return "Low";
    }
    return "Medium";
  }

  function getPriorityForRow(row) {
    const key = getRowKey(row);
    const override = key ? priorityOverrides?.[key] : null;
    return override || defaultPriorityForRow(row);
  }

  function getCellValue(row, col) {
    if (col === "Priority") return getPriorityForRow(row);
    if (col === "Project Type") return row ? (row.AssetType ?? row["AssetType"] ?? "") : "";
    return row ? row[col] : "";
  }

  function priorityCycleNext(current) {
    const c = normLoose(current);
    if (c === "low") return "Medium";
    if (c === "medium") return "High";
    return "Low";
  }

  function prioritiesInOrder(values) {
    const seen = new Set();
    (values || []).forEach((v) => {
      const n = norm(v);
      if (n) seen.add(n);
    });
    const order = ["Low", "Medium", "High"];
    const out = [];
    order.forEach((p) => {
      if (seen.has(p)) out.push(p);
    });
    Array.from(seen)
      .filter((p) => !order.includes(p))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }))
      .forEach((p) => out.push(p));
    return out;
  }

  // Normalized join key (declarative, no mapping): trim + collapse spaces + case-insensitive
  function normKey(s) {
    return norm(s).replace(/\s+/g, " ").toLowerCase();
  }

  function uniqueSorted(values) {
    const set = new Set();
    (values || []).forEach((v) => {
      const n = norm(v);
      if (n) set.add(n);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }));
  }

  function hasAllRequiredColumns(rows) {
    if (!rows || !rows.length) return { ok: true, missing: [] };
    const cols = Object.keys(rows[0] || {});
    const missing = REQUIRED_COLS.filter((c) => !cols.includes(c));
    return { ok: missing.length === 0, missing };
  }

  function parseNumberMaybe(v) {
    if (v === null || v === undefined) return null;
    const s = norm(v);
    if (!s) return null;
    // Allow "$", commas, and parentheses
    const cleaned = s
      .replace(/[\$,]/g, "")
      .replace(/^\((.*)\)$/, "-$1");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  function parseUnitCostNumber(unitCostStr) {
    const s = norm(unitCostStr);
    if (!s) return null;
    const beforeSlash = s.split("/")[0];
    return parseNumberMaybe(beforeSlash);
  }

  function normalizeUnit(rawUnit, unitCostStr) {
    const u = norm(rawUnit).toUpperCase();
    if (u) return u;
    const s = norm(unitCostStr).toUpperCase();
    const m = s.match(/\/\s*([A-Z]+)\s*$/);
    return m ? m[1] : "";
  }

  function parsePercentTo0to1(v) {
    const s = norm(v);
    if (!s) return null;
    const cleaned = s.replace(/%/g, "");
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return null;
    return n > 1 ? n / 100 : n;
  }

  function getRawUnitValue(row) {
    if (!row) return null;
    if (row.UnitValue !== undefined) return row.UnitValue;
    if (row["UnitValue"] !== undefined) return row["UnitValue"];
    if (row["Unit Value"] !== undefined) return row["Unit Value"];
    // tolerate header whitespace variants
    const keys = Object.keys(row || {});
    for (const k of keys) {
      if (norm(k).toLowerCase() === "unitvalue") return row[k];
    }
    return null;
  }

  function getUnitValueNumber(row) {
    // UnitValue is the per-school quantity that aligns with UnitCostLibrary.
    // Example: Maple Grove "Campus landscaping upgrade" UnitValue=15 (Acres).
    const unit = normalizeUnit(row?.Unit, row?.UnitCost);
    const raw = getRawUnitValue(row);
    if (unit === "PERCENT" || unit === "PERCENTAGE" || unit === "%") {
      return parsePercentTo0to1(raw);
    }
    return parseNumberMaybe(raw);
  }

  function invertGoodPoor(label) {
    const s = norm(label).toLowerCase();
    if (s === "good") return "Poor";
    if (s === "poor") return "Good";
    return "";
  }

  function parseLibraryValueThreshold(unitRaw, valueRaw) {
    const unit = normalizeUnit(unitRaw, "");
    if (unit === "PERCENT" || unit === "PERCENTAGE" || unit === "%") {
      return parsePercentTo0to1(valueRaw);
    }
    return parseNumberMaybe(valueRaw);
  }

  function computeConditionScoreFromValue(row, lib) {
    // Compare per-school value to UnitCostLibrary.Value threshold.
    // Primary source: pivot "<Project> score" (stored on the row as __pivotConditionScore).
    // Fallback: UnitValue (quantity) if score is missing.
    //
    // If (metric) > Value => return UnitCostLibrary.Score (if present)
    // Else => return the opposite.
    //
    // If the library has NO Score column (or it's blank), default mapping is:
    // above threshold = Good, below threshold = Poor
    const libScore = norm(lib?.score);
    const sys = norm(row?.SystemCategory);
    const lowerIsBetter = sys === "08_site infrastructure";
    // For these strategy buckets, higher score means more need (worse),
    // so "above threshold" should map to Poor (included in totals).
    const higherIsWorse = sys === "01_new construction" || sys === "02_gut & renovation";
    const threshold = parseLibraryValueThreshold(norm(row?.Unit) || norm(lib?.unit), lib?.value);
    const metricRaw = row?.__pivotConditionScore;
    const unit = normalizeUnit(norm(row?.Unit) || norm(lib?.unit), "");
    const metric =
      unit === "PERCENT" || unit === "PERCENTAGE" || unit === "%"
        ? parsePercentTo0to1(metricRaw)
        : parseNumberMaybe(metricRaw);
    const uv = getUnitValueNumber(row);
    const m = metric !== null ? metric : uv;

    if (threshold === null || m === null) {
      return libScore || norm(row?.ConditionScore) || "";
    }
    // When Score column is missing, default interpretation differs:
    // - Most projects: higher score/value = better  => above threshold = Good
    // - 08_site infrastructure: lower score/value = better => above threshold = Poor
    // - 01_new construction + 02_gut & renovation: higher score/value = worse => above threshold = Poor
    const defaultAbove = (lowerIsBetter || higherIsWorse) ? "Poor" : "Good";
    const above = libScore || defaultAbove;
    const below = invertGoodPoor(above) || ((lowerIsBetter || higherIsWorse) ? "Good" : "Poor");
    if (m > threshold) return above;
    return below;
  }

  function getDecisionNumber(decision, keys) {
    for (const k of keys) {
      const raw = decision?.[k];
      const s = (raw ?? "").toString().replace(/,/g, "").trim();
      const n = Number(s);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  function getSchoolSqf(decision) {
    return getDecisionNumber(decision, [
      " SquareFt ",
      "SquareFt",
      "Square Ft",
      "Sq Ft",
      "SqFt",
      "Sqft",
      "Building SF",
      "BuildingSF",
    ]);
  }

  function getSchoolAcres(decision) {
    return getDecisionNumber(decision, [
      "Acres",
      "Acreage",
      "Site Acres",
      "SiteAcres",
      "Site Acreage",
      "SiteAcreage",
      "Site_Acres",
      "Site_Acreage",
      "Campus Acres",
      "CampusAcres",
    ]);
  }

  function getRenoProjectForDecision(decision) {
    // For 02_gut & renovation, only ONE of the level-specific projects should be counted.
    const levelRaw = (decision?.["School Level"] ?? decision?.SchoolLevel ?? "").toString();
    const levelKey = normalizeSchoolLevel(levelRaw);
    if (levelKey === "elementary") return "Gut & Major Renovation ES";
    if (levelKey === "middle") return "Gut & Major Renovation MS";
    if (levelKey === "high") return "Gut & Major Renovation HS";
    if (levelKey === "k8") return "Gut & Major Renovation K-8";
    return null; // unknown or k12
  }

  function isRelevantGutRenovationRow(row, decision) {
    if (norm(row?.SystemCategory) !== "02_gut & renovation") return true;
    const asset = norm(row?.AssetType);
    if (!asset) return true;
    if (!asset.toLowerCase().startsWith("gut & major renovation")) return true;
    const wanted = getRenoProjectForDecision(decision);
    if (!wanted) return true; // can't determine; don't hide anything
    return asset === wanted;
  }

  function getNewConstructionProjectForDecision(decision) {
    const levelRaw = (decision?.["School Level"] ?? decision?.SchoolLevel ?? "").toString();
    const levelKey = normalizeSchoolLevel(levelRaw);
    if (levelKey === "elementary") return "New Construction ES";
    if (levelKey === "middle") return "New Construction MS";
    if (levelKey === "high") return "New Construction HS";
    if (levelKey === "k8") return "New Construction K-8";
    return null;
  }

  function isRelevantNewConstructionRow(row, decision) {
    if (norm(row?.SystemCategory) !== "01_new construction") return true;
    const asset = norm(row?.AssetType);
    if (!asset) return true;
    if (!asset.toLowerCase().startsWith("new construction")) return true;
    const wanted = getNewConstructionProjectForDecision(decision);
    if (!wanted) return true;
    return asset === wanted;
  }

  function shouldUseSchoolSqfForRow(row) {
    const system = norm(row?.SystemCategory);
    if (system !== "01_new construction" && system !== "02_gut & renovation") return false;
    const unit = normalizeUnit(row?.Unit, row?.UnitCost);
    return unit === "SF" || unit === "SQFT" || unit === "SQ FT" || unit === "SQF";
  }

  function computeDerivedQuantity(row, decision) {
    const unit = normalizeUnit(row?.Unit, row?.UnitCost);
    if (!unit) return null;

    // Only 01_new construction + 02_gut & renovation should derive from GSF.
    if (shouldUseSchoolSqfForRow(row)) {
      return getSchoolSqf(decision);
    }

    // Everything else should come from UnitValue in JeffCoProjectDataTemplate.csv
    const uv = getUnitValueNumber(row);
    if (uv !== null) return uv;

    return null;
  }

  function computeReplacementCost(row, decision) {
    const unit = normalizeUnit(row?.Unit, row?.UnitCost);
    const unitCost = parseUnitCostNumber(row?.UnitCost);
    if (!unit || unitCost === null) return null;

    const q = computeDerivedQuantity(row, decision);
    if (q === null) return null;

    return unitCost * q;
  }

  function computeBlackReplacementTotal(rows) {
    let sum = 0;
    (rows || []).forEach((r) => {
      const rc = parseNumberMaybe(r?.ReplacementCost);
      if (rc === null) return;
      if (r && r.__excludedFromTotals) return;
      sum += rc;
    });
    return sum;
  }

  function computeReplacementTotalsByPriority(rows) {
    const totals = { Low: 0, Medium: 0, High: 0 };
    (rows || []).forEach((r) => {
      if (r && r.__excludedFromTotals) return;
      const rc = parseNumberMaybe(r?.ReplacementCost);
      if (rc === null) return;
      const p = norm(getPriorityForRow(r));
      if (p === "Low" || p === "Medium" || p === "High") totals[p] += rc;
      else totals.Medium += rc;
    });
    return totals;
  }

  function loadAdditionStoriesForSchool(uniqueId) {
    try {
      const uid = norm(uniqueId);
      if (!uid || !window.localStorage) return 1;
      const raw = window.localStorage.getItem(`jeffco_addition_stories_v1:${uid}`);
      const n = raw ? Number(raw) : 1;
      return n === 2 || n === 3 ? n : 1;
    } catch {
      return 1;
    }
  }

  function saveAdditionStoriesForSchool(uniqueId, stories) {
    try {
      const uid = norm(uniqueId);
      if (!uid || !window.localStorage) return;
      window.localStorage.setItem(`jeffco_addition_stories_v1:${uid}`, String(stories));
    } catch {
      // ignore
    }
  }

  function loadAdditionCollapsedForSchool(uniqueId) {
    try {
      const uid = norm(uniqueId);
      if (!uid || !window.localStorage) return false;
      const raw = window.localStorage.getItem(`jeffco_addition_collapsed_v1:${uid}`);
      return raw === "1";
    } catch {
      return false;
    }
  }

  function saveAdditionCollapsedForSchool(uniqueId, collapsed) {
    try {
      const uid = norm(uniqueId);
      if (!uid || !window.localStorage) return;
      window.localStorage.setItem(`jeffco_addition_collapsed_v1:${uid}`, collapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }

  function computeAdditionCost() {
    if (!additionPlanningState.show || additionPlanningState.gsfTarget == null) return 0;
    const s = additionPlanningState.stories === 2 || additionPlanningState.stories === 3 ? additionPlanningState.stories : 1;
    const storyProject =
      s === 1 ? "New 1-story building (addition)" : s === 2 ? "New 2-story building" : "New 3-story building";
    const lib = unitCostIndex && unitCostIndex.get(makeUnitCostKey("03_addition", storyProject));
    const libRate = lib ? parseUnitCostNumber(lib.unitCost) : null;
    const rate = (libRate !== null ? libRate : (ADDITION_STORY_COST[s] || 0)) || 0;
    return Math.round(Number(additionPlanningState.gsfTarget) * rate);
  }

  function updateTotalReplacementCostDisplay() {
    if (!elTotalReplacementCost) return;
    const base = computeBlackReplacementTotal(schoolRows);
    const add = computeAdditionCost();
    const total = Math.round((base || 0) + (add || 0));
    elTotalReplacementCost.textContent = total ? `$${total.toLocaleString()}` : "—";

    // Priority subtotals (include addition cost in the selected story's priority bucket).
    const t = computeReplacementTotalsByPriority(schoolRows);
    const storyProject =
      additionPlanningState.stories === 2
        ? "New 2-story building"
        : additionPlanningState.stories === 3
          ? "New 3-story building"
          : "New 1-story building (addition)";
    const storyRow =
      (schoolRows || []).find(
        (r) => norm(r?.SystemCategory) === "03_addition" && norm(r?.AssetType) === storyProject
      ) || null;
    const addPriority = storyRow ? norm(getPriorityForRow(storyRow)) : "Medium";
    if (add) {
      if (addPriority === "Low") t.Low += add;
      else if (addPriority === "High") t.High += add;
      else t.Medium += add;
    }

    if (elTotalLowCost) elTotalLowCost.textContent = t.Low ? `$${Math.round(t.Low).toLocaleString()}` : "—";
    if (elTotalMediumCost) elTotalMediumCost.textContent = t.Medium ? `$${Math.round(t.Medium).toLocaleString()}` : "—";
    if (elTotalHighCost) elTotalHighCost.textContent = t.High ? `$${Math.round(t.High).toLocaleString()}` : "—";
  }

  function compareValues(a, b, dir) {
    const mult = dir === "desc" ? -1 : 1;
    // Priority compare when both are priority labels
    const ap = normLoose(a);
    const bp = normLoose(b);
    const priorityOrder = { low: 0, medium: 1, high: 2 };
    const ahas = Object.prototype.hasOwnProperty.call(priorityOrder, ap);
    const bhas = Object.prototype.hasOwnProperty.call(priorityOrder, bp);
    if (ahas && bhas) return (priorityOrder[ap] - priorityOrder[bp]) * mult;
    // numeric compare when both numeric-ish
    const an = parseNumberMaybe(a);
    const bn = parseNumberMaybe(b);
    if (an !== null && bn !== null) return (an - bn) * mult;
    // string compare
    return norm(a).localeCompare(norm(b), undefined, { sensitivity: "base", numeric: true }) * mult;
  }

  function applyFilters() {
    const q = norm(elSearch.value).toLowerCase();
    const prioritySel = norm(elPriorityFilter.value);
    const systemSel = norm(elSystemFilter.value);
    const assetSel = norm(elAssetFilter.value);

    const filtered = schoolRows.filter((r) => {
      if (prioritySel && norm(getPriorityForRow(r)) !== prioritySel) return false;
      if (systemSel && norm(r.SystemCategory) !== systemSel) return false;
      if (assetSel && norm(r.AssetType) !== assetSel) return false;
      if (q) {
        const hay = DISPLAY_COLS.map((c) => norm(getCellValue(r, c))).join(" | ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // Group by SystemCategory; sort within groups
    const grouped = new Map();
    filtered.forEach((r) => {
      const key = norm(r.SystemCategory) || "(Uncategorized)";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(r);
    });

    const groupNames = Array.from(grouped.keys()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base", numeric: true })
    );

    const out = [];
    groupNames.forEach((g) => {
      const rows = grouped.get(g) || [];
      rows.sort((ra, rb) => {
        // keep grouping intact; primary sort inside group
        const key = sortState.key;
        return compareValues(getCellValue(ra, key), getCellValue(rb, key), sortState.dir);
      });
      out.push({ __group: g, __rows: rows });
    });

    viewRows = out;
  }

  function render() {
    elTableMount.innerHTML = "";

    if (!viewRows.length) {
      elTableMount.innerHTML = '<div class="empty">No assets/projects match the current filters.</div>';
      return;
    }

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");

    DISPLAY_COLS.forEach((col) => {
      const th = document.createElement("th");
      th.textContent = col + (sortState.key === col ? (sortState.dir === "asc" ? " ▲" : " ▼") : "");
      th.title = "Sort by " + col;
      th.addEventListener("click", () => {
        if (sortState.key === col) {
          sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
        } else {
          sortState.key = col;
          sortState.dir = "asc";
        }
        applyFilters();
        render();
      });
      trh.appendChild(th);
    });

    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    viewRows.forEach((g) => {
      const groupTr = document.createElement("tr");
      groupTr.className = "group-row";
      const td = document.createElement("td");
      td.colSpan = DISPLAY_COLS.length;
      td.textContent = g.__group;
      groupTr.appendChild(td);
      tbody.appendChild(groupTr);

      // Insert Building Addition planning block directly under the 03_addition group header
      if (additionPlanningState.show && norm(g.__group).toLowerCase() === "03_addition") {
        const infoTr = document.createElement("tr");
        const infoTd = document.createElement("td");
        infoTd.colSpan = DISPLAY_COLS.length;
        infoTd.style.padding = "10px";

        const TARGETS = [
          { key: "elementary", label: "Elementary (ES)", gsfPerStudent: 110 },
          { key: "middle", label: "Middle School (MS)", gsfPerStudent: 135 },
          { key: "k8", label: "K–8", gsfPerStudent: 125 },
          { key: "high", label: "High School (HS)", gsfPerStudent: 180 },
        ];

        const studentsOverText =
          additionPlanningState.studentsOver != null ? Number(additionPlanningState.studentsOver).toLocaleString() : "—";
        const gsfText = additionPlanningState.gsfTarget != null ? Number(additionPlanningState.gsfTarget).toLocaleString() : "—";
        const story = additionPlanningState.stories === 2 || additionPlanningState.stories === 3 ? additionPlanningState.stories : 1;
        const isCollapsed = !!additionPlanningState.collapsed;

        const story1RateLib = (() => {
          const lib = unitCostIndex && unitCostIndex.get(makeUnitCostKey("03_addition", "New 1-story building (addition)"));
          const n = lib ? parseUnitCostNumber(lib.unitCost) : null;
          return n !== null ? n : 500;
        })();
        const story2RateLib = (() => {
          const lib = unitCostIndex && unitCostIndex.get(makeUnitCostKey("03_addition", "New 2-story building"));
          const n = lib ? parseUnitCostNumber(lib.unitCost) : null;
          return n !== null ? n : 600;
        })();
        const story3RateLib = (() => {
          const lib = unitCostIndex && unitCostIndex.get(makeUnitCostKey("03_addition", "New 3-story building"));
          const n = lib ? parseUnitCostNumber(lib.unitCost) : null;
          return n !== null ? n : 700;
        })();

        infoTd.innerHTML =
          `<div class="addition-info ${isCollapsed ? "is-collapsed" : ""}">` +
          `<div class="addition-header">` +
          `<div class="title">Building Addition</div>` +
          `<button type="button" class="addition-collapse" aria-expanded="${!isCollapsed}">${isCollapsed ? "See details" : "Hide details"}</button>` +
          `</div>` +
          `<div class="addition-body">` +
          `<div class="addition-story-row">` +
          `<div class="addition-note">Stories included in total cost:</div>` +
          `<div class="story-toggle" role="group" aria-label="Addition stories">` +
          `<button type="button" data-stories="1" aria-pressed="${story === 1}">1 story ($${story1RateLib}/SF)</button>` +
          `<button type="button" data-stories="2" aria-pressed="${story === 2}">2 story ($${story2RateLib}/SF)</button>` +
          `<button type="button" data-stories="3" aria-pressed="${story === 3}">3 story ($${story3RateLib}/SF)</button>` +
          `</div>` +
          `</div>` +
          `<div class="addition-kpis">` +
          `<div class="addition-kpi"><div class="k">Students over capacity</div><div class="v">${studentsOverText}</div></div>` +
          `<div class="addition-kpi"><div class="k">Target addition size (GSF)</div><div class="v">${gsfText}</div></div>` +
          `</div>` +
          `<table class="addition-target-table" aria-label="Planning target GSF per student">` +
          `<thead><tr><th>School Type</th><th>Planning Target (GSF / student)</th></tr></thead>` +
          `<tbody>` +
          TARGETS.map((t) => {
            const active = additionPlanningState.selectedKey && additionPlanningState.selectedKey === t.key;
            return `<tr class="${active ? "is-active" : ""}"><td>${escapeHtmlText(t.label)}</td><td>${t.gsfPerStudent} GSF/student</td></tr>`;
          }).join("") +
          `</tbody></table>` +
          `</div>` +
          `</div>`;

        infoTr.appendChild(infoTd);
        tbody.appendChild(infoTr);

        // Wire up story toggle buttons
        const toggle = infoTd.querySelector(".story-toggle");
        if (toggle) {
          toggle.querySelectorAll("button[data-stories]").forEach((btn) => {
            btn.addEventListener("click", () => {
              const next = Number(btn.getAttribute("data-stories"));
              if (next !== 1 && next !== 2 && next !== 3) return;
              additionPlanningState.stories = next;
              saveAdditionStoriesForSchool(resolvedUniqueId, next);
              updateTotalReplacementCostDisplay();
              render();
            });
          });
        }

        const collapseBtn = infoTd.querySelector(".addition-collapse");
        if (collapseBtn) {
          collapseBtn.addEventListener("click", () => {
            additionPlanningState.collapsed = !additionPlanningState.collapsed;
            saveAdditionCollapsedForSchool(resolvedUniqueId, additionPlanningState.collapsed);
            render();
          });
        }
      }

      g.__rows.forEach((r) => {
        const tr = document.createElement("tr");
        if (r && r.__excludedFromTotals) {
          tr.classList.add("excluded-row");
          if (r.__excludedReason === "level") tr.classList.add("excluded-level");
          if (r.__excludedReason === "good") tr.classList.add("excluded-good");
        }
        DISPLAY_COLS.forEach((col) => {
          const cell = document.createElement("td");
          if (col === "Project Type") cell.classList.add("project-type-cell");
          if (col === "ConditionScore") cell.classList.add("condition-score-cell");
          if (col === "Priority") {
            const current = getPriorityForRow(r);
            const seg = document.createElement("div");
            seg.className = "priority-segment";
            seg.setAttribute("role", "group");
            seg.setAttribute("aria-label", "Priority");

            ["Low", "Medium", "High"].forEach((p) => {
              const b = document.createElement("button");
              b.type = "button";
              b.className = "priority-segment-btn";
              b.textContent = p;
              b.setAttribute("aria-pressed", String(normLoose(current) === normLoose(p)));
              b.title = `Set priority to ${p}`;
              b.addEventListener("click", () => {
                const key = getRowKey(r);
                if (key) {
                  priorityOverrides[key] = p;
                  savePriorityOverrides();
                }
                updateTotalReplacementCostDisplay();
                populateFilters();
                applyFilters();
                render();
              });
              seg.appendChild(b);
            });

            cell.appendChild(seg);
          } else {
            const systemCategory = norm(r?.SystemCategory);
            const assetTypeRaw = norm(r?.AssetType);
            const assetType = assetTypeRaw.toLowerCase();
            const isDemolition = assetType === "demolition";

            // Story-based addition rows (show $/SF + $ total, highlight selected story)
            const isAdditionStoryRow =
              additionPlanningState.show &&
              systemCategory === "03_addition" &&
              (assetTypeRaw === "New 1-story building (addition)" ||
                assetTypeRaw === "New 2-story building" ||
                assetTypeRaw === "New 3-story building");

            if (isAdditionStoryRow) {
              const storyForRow =
                assetTypeRaw === "New 1-story building (addition)" ? 1 : assetTypeRaw === "New 2-story building" ? 2 : 3;
              const storyProject =
                storyForRow === 1 ? "New 1-story building (addition)" : storyForRow === 2 ? "New 2-story building" : "New 3-story building";
              const lib = unitCostIndex && unitCostIndex.get(makeUnitCostKey("03_addition", storyProject));
              const libRate = lib ? parseUnitCostNumber(lib.unitCost) : null;
              const rate = (libRate !== null ? libRate : (ADDITION_STORY_COST[storyForRow] || 0)) || 0;
              const isSelected = (additionPlanningState.stories || 1) === storyForRow;
              const addCostForRow =
                additionPlanningState.gsfTarget != null ? Math.round(Number(additionPlanningState.gsfTarget) * rate) : 0;

              if (col === "UnitCost") {
                const text = rate ? `$${rate}/SF` : "—";
                cell.textContent = text;
                cell.title = text;
                if (!isSelected) cell.classList.add("muted");
              } else if (col === "UnitValue") {
                const v = additionPlanningState.gsfTarget != null ? Math.round(Number(additionPlanningState.gsfTarget)) : null;
                const text = v !== null ? v.toLocaleString() : "—";
                cell.textContent = text;
                cell.title = text;
                if (!isSelected) cell.classList.add("muted");
              } else if (col === "ReplacementCost") {
                const text = addCostForRow ? `$${addCostForRow.toLocaleString()}` : "—";
                cell.textContent = text;
                cell.title = text;
                if (isSelected) cell.classList.add("cost-highlight");
                else cell.classList.add("muted");
              } else {
                const v = getCellValue(r, col);
                cell.textContent = norm(v) ? norm(v) : "—";
                cell.title = norm(v);
                if ((col === "RemainingUsefulLife") && !norm(v)) {
                  cell.className = "muted";
                }
              }

              tr.appendChild(cell);
              return;
            }

            let v = "";
            // Condition score display:
            // - Show N/A (black) when row is level-not-relevant (e.g. non-matching new construction / gut reno)
            // - Otherwise show Good/Poor and colorize
            if (col === "ConditionScore") {
              const isNA = r && (r.__excludedReason === "level" || r.__excludedReason === "decision");
              const display = isNA ? "N/A" : (norm(r?.ConditionScore) || norm(getCellValue(r, col)));
              const text = display ? display : "—";
              cell.textContent = text;
              cell.title = text;
              const k = text.toLowerCase();
              if (k === "good") cell.classList.add("score-good");
              else if (k === "poor") cell.classList.add("score-poor");
              else if (k === "n/a" || k === "na") cell.classList.add("score-na");
            } else {
              v = getCellValue(r, col);
              cell.textContent = norm(v) ? norm(v) : "—";
              cell.title = norm(v);
            }
            if ((col === "RemainingUsefulLife" || col === "UnitCost" || col === "UnitValue" || col === "ReplacementCost") && !norm(v)) {
              cell.className = "muted";
            }

            // Grey out demolition unit cost unless the school is a Building Replacement case
            if (col === "UnitCost" && norm(v) && isDemolition && !keepBlackForDemolitionCost) {
              cell.classList.add("muted");
            }

            // Grey out dollar totals (ReplacementCost) for non-target decision outcomes,
            // but allow Demolition-related values to stay black for replacement cases.
            if (col === "ReplacementCost" && norm(v)) {
              if (isDemolition) {
                if (!keepBlackForDemolitionCost) cell.classList.add("muted");
              } else {
                if (!keepBlackForCosts) cell.classList.add("muted");
              }
            }
          }
          tr.appendChild(cell);
        });
        tbody.appendChild(tr);
      });
    });

    table.appendChild(tbody);
    elTableMount.appendChild(table);
  }

  function populateFilters() {
    const prevPriority = norm(elPriorityFilter.value);
    const prevSystem = norm(elSystemFilter.value);
    const prevAsset = norm(elAssetFilter.value);

    const priorities = prioritiesInOrder(schoolRows.map((r) => getPriorityForRow(r)));
    const systems = uniqueSorted(schoolRows.map((r) => r.SystemCategory));
    const assets = uniqueSorted(schoolRows.map((r) => r.AssetType));

    elPriorityFilter.innerHTML =
      '<option value="">All</option>' +
      priorities.map((v) => `<option value="${escapeHtmlAttr(v)}">${escapeHtmlText(v)}</option>`).join("");
    elSystemFilter.innerHTML = '<option value="">All</option>' + systems.map((v) => `<option value="${escapeHtmlAttr(v)}">${escapeHtmlText(v)}</option>`).join("");
    elAssetFilter.innerHTML = '<option value="">All</option>' + assets.map((v) => `<option value="${escapeHtmlAttr(v)}">${escapeHtmlText(v)}</option>`).join("");

    if (prevPriority && Array.from(elPriorityFilter.options).some((o) => o.value === prevPriority)) elPriorityFilter.value = prevPriority;
    if (prevSystem && Array.from(elSystemFilter.options).some((o) => o.value === prevSystem)) elSystemFilter.value = prevSystem;
    if (prevAsset && Array.from(elAssetFilter.options).some((o) => o.value === prevAsset)) elAssetFilter.value = prevAsset;
  }

  function renderNoMatchChooser(uniqueSchoolNames) {
    const box = document.createElement("div");
    box.className = "empty";
    box.innerHTML =
      `<div style="font-weight:900; color:#111827; margin-bottom:6px;">No assets found for clicked school</div>` +
      `<div class="muted" style="margin-bottom:10px;">` +
      `Clicked SchoolName: <strong>${escapeHtmlText(selectedSchoolNameFromQuery)}</strong><br/>` +
      `This usually means the Step 2 school name text does not exactly match the Assets CSV <code>SchoolName</code> values.` +
      `</div>`;

    const label = document.createElement("label");
    label.className = "muted";
    label.style.display = "block";
    label.style.marginBottom = "6px";
    label.textContent = "Pick the matching SchoolName from the Assets CSV:";

    const select = document.createElement("select");
    select.style.width = "100%";
    select.style.maxWidth = "520px";
    select.style.padding = "8px 10px";
    select.style.border = "1px solid var(--border)";
    select.style.borderRadius = "8px";
    select.style.fontFamily = "inherit";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— Select SchoolName —";
    select.appendChild(opt0);

    uniqueSchoolNames.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });

    select.addEventListener("change", () => {
      const v = norm(select.value);
      if (!v) return;
      resolvedSchoolName = v;
      schoolRows = allRows.filter((r) => normKey(r.SchoolName) === normKey(resolvedSchoolName));
      elSchoolMeta.textContent =
        `CSV rows: ${allRows.length.toLocaleString()} • ` +
        `Resolved SchoolName="${resolvedSchoolName}" • ` +
        `Rows: ${schoolRows.length.toLocaleString()}`;

      populateFilters();
      applyFilters();
      render();
    });

    box.appendChild(label);
    box.appendChild(select);
    elTableMount.innerHTML = "";
    elTableMount.appendChild(box);
  }

  function escapeHtmlText(s) {
    return norm(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function escapeHtmlAttr(s) {
    return escapeHtmlText(s).replace(/"/g, "&quot;");
  }

  function downloadFilteredCsv() {
    // Flatten viewRows into rows with DISPLAY_COLS only
    const flat = [];
    viewRows.forEach((g) => {
      (g.__rows || []).forEach((r) => {
        const out = {};
        DISPLAY_COLS.forEach((c) => (out[c] = getCellValue(r, c) ?? ""));
        flat.push(out);
      });
    });

    const csv = Papa.unparse(flat, { quotes: true });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    const safeName = norm(elSchoolNameHeader.textContent || "school").replace(/[^\w\- ]+/g, "").trim() || "school";
    a.href = URL.createObjectURL(blob);
    a.download = `${safeName}-assets.csv`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  }

  function init() {
    const school = getSchoolFromQuery();
    const uid = getUidFromQuery();
    selectedSchoolNameFromQuery = school ? school : "";
    selectedUniqueIdFromQuery = uid ? uid : "";

    elSchoolMeta.textContent = `Loading school summary (${DECISION_CSV_PATH}), projects (${ASSETS_CSV_PATH}), unit cost library (${UNITCOST_LIBRARY_CSV_PATH}), and room schedule (${ROOM_SCHEDULE_CSV_PATH})…`;
    elDownload.disabled = true;

    Promise.all([
      parseCsv(DECISION_CSV_PATH),
      parseCsv(ASSETS_CSV_PATH),
      parseCsv(UNITCOST_LIBRARY_CSV_PATH).catch(() => []),
      parseCsv(ROOM_SCHEDULE_CSV_PATH).catch(() => []),
    ])
      .then(([decRows, assetRows, unitCostLibRows, roomScheduleRows]) => {
        decisionRows = decRows || [];
        buildDecisionIndexes(decisionRows);

        unitCostIndex = buildUnitCostLibraryIndex(unitCostLibRows || []);
        // In pivot mode, we don't mutate the assets file; we rebuild row-wise records per school using the library.
        const roomTotals = buildRoomScheduleTotals(roomScheduleRows || []);
        roomScheduleByUid = roomTotals.byUid || new Map();
        roomScheduleByFacility = roomTotals.byFacility || new Map();

        const COLUMNS_TO_REMOVE = new Set([
          "AssetID",
          "InstallYear",
          "ExpectedUsefulLife",
          "OverrideEOLYear",
          "OverrideReason",
          "Quantity",
          "Criticality",
        ]);

        assetsPivotRows = Array.isArray(assetRows) ? assetRows : [];
        buildPivotIndexes(assetsPivotRows);
        // Preserve legacy variable name used in a couple UI messages
        allRows = assetsPivotRows;

      // Debug: confirm the loaded pivot CSV actually has the Bear Creek HS unit value.
        try {
          const bc = (assetsPivotRows || []).find((r) => norm(r?.SchoolName) === "Bear Creek HS");
          if (bc) {
            const keys = Object.keys(bc || {});
            const brandingNeedle = normKeyLoose("Front of school branding, landscape upgrades");
            const brandingKeys = keys.filter((k) => normKeyLoose(k).includes(brandingNeedle));
            const unitValueKeys = keys.filter((k) => /unit\s*value/i.test(k));
            const brandingUnitValueKeys = unitValueKeys.filter((k) => /branding|landscape/i.test(k));

            const directUv = bc["Front of school branding, landscape upgrades UnitValue"];
            const directScore = bc["Front of school branding, landscape upgrades score"];

            const out = {
              totalKeys: keys.length,
              brandingKeys,
              unitValueKeyCount: unitValueKeys.length,
              sampleUnitValueKeys: unitValueKeys.slice(0, 10),
              brandingUnitValueKeys,
              direct: {
                scoreKeyExists: Object.prototype.hasOwnProperty.call(bc, "Front of school branding, landscape upgrades score"),
                unitValueKeyExists: Object.prototype.hasOwnProperty.call(bc, "Front of school branding, landscape upgrades UnitValue"),
                score: directScore,
                unitValue: directUv,
              },
              brandingKeyValues: {},
            };
            brandingKeys.slice(0, 10).forEach((k) => {
              out.brandingKeyValues[k] = bc[k];
            });

            console.log("Bear Creek HS pivot check (detailed):\n" + JSON.stringify(out, null, 2));
          }
        } catch {
          // ignore
        }

        const linkedUids = new Set(allRows.map((r) => norm(r.UniqueID)).filter(Boolean));

        const colCheck = hasAllRequiredColumns(allRows);
        if (!colCheck.ok) {
          elSchoolMeta.textContent = `Projects CSV is missing required columns: ${colCheck.missing.join(", ")}`;
          elTableMount.innerHTML = '<div class="empty">Cannot render profile due to missing required columns.</div>';
          return;
        }

        // Populate school selector from Decision Data Export,
        // but only include schools that exist in the Projects (pivot) CSV.
        if (elSchoolSelect) {
          const opts = (decisionRows || [])
            .map((r) => ({
              uid: norm(r["UniqueID"] ?? r.UniqueID),
              name: norm(r["Building Name"] ?? r.BuildingName ?? r["BuildingName"]),
            }))
            .filter((o) => o.uid && o.name && linkedUids.has(o.uid))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));

          elSchoolSelect.innerHTML =
            '<option value="">— Select a school —</option>' +
            opts
              .map((o) => {
                return `<option value="${escapeHtmlAttr(o.uid)}">${escapeHtmlText(o.name)}</option>`;
              })
              .join("");

          elSchoolSelect.addEventListener("change", () => {
            const selectedUid = norm(elSchoolSelect.value);
            const r = selectedUid ? decisionByUid.get(selectedUid) : null;
            const nm = norm(r?.["Building Name"]) || "";
            if (selectedUid) setSelectedSchool(selectedUid, nm);
          });
        }

        const pkToggle = document.getElementById("includePKInEnrollmentToggle");
        if (pkToggle) {
          pkToggle.checked = getIncludePKInEnrollment();
          pkToggle.addEventListener("change", () => {
            setIncludePKInEnrollment(pkToggle.checked);
            if (resolvedUniqueId) setSelectedSchool(resolvedUniqueId, resolvedSchoolName);
          });
        }

        // Resolve selection (uid first, then name)
        let resolvedUid = norm(selectedUniqueIdFromQuery);
        let resolvedName = norm(selectedSchoolNameFromQuery);

        if (resolvedUid && decisionByUid.has(resolvedUid)) {
          const r = decisionByUid.get(resolvedUid);
          resolvedName = norm(r?.["Building Name"]) || resolvedName;
        } else if (resolvedName) {
          const r = decisionByNameKey.get(normName(resolvedName));
          resolvedUid = norm(r?.["UniqueID"]) || resolvedUid;
          resolvedName = norm(r?.["Building Name"]) || resolvedName;
        }

        if (!resolvedUid && !resolvedName) {
          elSchoolNameHeader.textContent = "—";
          elSchoolMeta.textContent = "Select a school above to view summary and projects.";
          elTableMount.innerHTML = '<div class="empty">No school selected.</div>';
          return;
        }

        setSelectedSchool(resolvedUid, resolvedName);
      })
      .catch((err) => {
        console.error("Failed to load CSVs:", err);
        elSchoolMeta.textContent = "Failed to load school summary and/or projects/unit-cost CSV.";
        elTableMount.innerHTML = '<div class="empty">Could not load the CSV file(s).</div>';
        elDownload.disabled = true;
      });

    elSearch.addEventListener("input", () => {
      applyFilters();
      render();
    });
    elPriorityFilter.addEventListener("change", () => {
      applyFilters();
      render();
    });
    elSystemFilter.addEventListener("change", () => {
      applyFilters();
      render();
    });
    elAssetFilter.addEventListener("change", () => {
      applyFilters();
      render();
    });
    elClearFilters.addEventListener("click", () => {
      elSearch.value = "";
      elPriorityFilter.value = "";
      elSystemFilter.value = "";
      elAssetFilter.value = "";
      sortState = { key: "SystemCategory", dir: "asc" };
      applyFilters();
      render();
    });
    elDownload.addEventListener("click", downloadFilteredCsv);
  }

  document.addEventListener("DOMContentLoaded", init);
})();


