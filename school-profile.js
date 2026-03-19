/* school-profile.js
   - Loads JeffCoProjectListAllSchools.csv (one row per school+asset)
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
  const CACHE_BUST = "20260228_06";
  const PRIORITY_OVERRIDES_STORAGE_KEY = "jeffco_priority_overrides_assetid_v1";

  // The assets CSV is row-wise: one row per school + asset type.
  const REQUIRED_COLS = ["SchoolName", "AssetType"];
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
  const COL_DISPLAY_NAMES = {
    "ConditionScore": "Condition Score",
    "UnitCost": "Unit Cost",
    "UnitValue": "Unit Value",
    "ReplacementCost": "Replacement Cost",
  };

  const elSchoolNameHeader = document.getElementById("schoolNameHeader");
  const elSchoolMeta = document.getElementById("schoolMeta");
  const elTotalReplacementCost = document.getElementById("totalReplacementCost");
  const elTotalP1Cost = document.getElementById("totalP1Cost");
  const elTotalP2Cost = document.getElementById("totalP2Cost");
  const elTotalP3Cost = document.getElementById("totalP3Cost");
  const elTotalP4Cost = document.getElementById("totalP4Cost");
  const additionPlanningState = {
    show: false,
    studentsOver: null,
    gsfTarget: null,
    selectedKey: null, // elementary | middle | k8 | high
    stories: 1, // 1 | 2 | 3
    collapsed: false,
  };
  const ADDITION_STORY_COST = { 1: 500, 2: 600, 3: 700 }; // $/SF
  const elSchoolSelectBtn = document.getElementById("schoolSelectBtn");
  const elSchoolSelectLabel = document.getElementById("schoolSelectLabel");
  const elSchoolSelectDropdown = document.getElementById("schoolSelectDropdown");
  let selectedSchoolUids = new Set();
  const elSearch = document.getElementById("searchInput");
  const elPriorityFilterBtn = document.getElementById("priorityFilterBtn");
  const elPriorityFilterLabel = document.getElementById("priorityFilterLabel");
  const elPriorityFilterDropdown = document.getElementById("priorityFilterDropdown");
  const elPrioritySelectAll = document.getElementById("prioritySelectAll");
  const elSystemBtn = document.getElementById("systemFilterBtn");
  const elSystemLabel = document.getElementById("systemFilterLabel");
  const elSystemDropdown = document.getElementById("systemFilterDropdown");
  const elAssetBtn = document.getElementById("assetFilterBtn");
  const elAssetLabel = document.getElementById("assetFilterLabel");
  const elAssetDropdown = document.getElementById("assetFilterDropdown");
  const elSourceBtn = document.getElementById("sourceFilterBtn");
  const elSourceLabel = document.getElementById("sourceFilterLabel");
  const elSourceDropdown = document.getElementById("sourceFilterDropdown");
  const elClearFilters = document.getElementById("clearFiltersBtn");
  const elTableMount = document.getElementById("tableMount");
  const elExportBtn = document.getElementById("exportBtn");
  const elExportDropdown = document.getElementById("exportDropdown");
  const elExportCsvOption = document.getElementById("exportCsvOption");
  const elExportPdfOption = document.getElementById("exportPdfOption");

  let allRows = [];
  let rowwiseByUid = new Map();
  let rowwiseByNameKey = new Map();
  let schoolRows = [];
  let viewRows = [];
  let sortState = { key: "SystemCategory", dir: "asc" };
  const collapsedGroups = new Set();
  const collapsedSuperGroups = new Set();
  const expandedFciAssets = new Set();
  let groupsInitialized = false;
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
  let facilityIdByUid = new Map();
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

  function getIncludeFciForMajor() {
    try { return !!(window.localStorage && window.localStorage.getItem("includeFciForMajor")); } catch { return false; }
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
    // "Multi-Level" cleans to "multilevel" which wrongly contains "middle" — handle before middle
    if (cleaned === "multilevel" || original.includes("multi-level") || original.includes("multi level")) return null;
    if (cleaned.includes("middle") || cleaned === "ms") return "middle";
    if (cleaned.includes("high") || cleaned === "hs") return "high";
    if (cleaned.includes("612") || cleaned.includes("k12") || original.includes("6-12") || original.includes("k-12") || original.includes("6 12") || original.includes("k 12")) return "k12";
    return null;
  }

  /** Canonical level for project-line filtering (School Level + Building Name + Multi → K-8 heuristic). */
  function getEffectiveSchoolLevelKey(decision) {
    if (!decision) return null;
    const sl = (decision["School Level"] ?? decision.SchoolLevel ?? "").toString();
    const bn = (decision["Building Name"] ?? decision.BuildingName ?? "").toString();
    let key = normalizeSchoolLevel(sl);
    if (!key) key = normalizeSchoolLevel(bn);
    const sll = sl.toLowerCase();
    if (!key && (sll.includes("multi") || sll.includes("option") || sll.includes("charter"))) {
      key = normalizeSchoolLevel(bn);
    }
    if (!key && sll.includes("multi")) key = "k8";
    return key;
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
    // Normalize NBSP and common Unicode dashes to improve matching with UnitCostLibrary headers.
    return norm(s)
      .replace(/\u00A0/g, " ")
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function normProjectKey(s) {
    // normalize whitespace + slash spacing so "A/B" and "A / B" match
    // Also strip PapaParse duplicate-header suffixes like "_1", "_2".
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

  function applyRoomScheduleUnitValues(rows, uid, schoolName, decisionRow) {
    if (!rows || !rows.length) return;
    let catMap = uid ? roomScheduleByUid.get(uid) : null;
    if (!catMap && schoolName) {
      const facName = normalizeFacilityName(schoolName);
      catMap = facName ? roomScheduleByFacility.get(facName) : null;
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

  function buildRowwiseIndex(rows) {
    rowwiseByUid = new Map();
    rowwiseByNameKey = new Map();
    facilityIdByUid = new Map();
    const nameToUid = new Map();
    (rows || []).forEach((r) => {
      const uid = norm(r["UniqueID"] ?? r.UniqueID);
      const name = norm(r["SchoolName"] ?? r.SchoolName);
      const fid = norm(r["NEWJeffCoFacilityID"] ?? r.NEWJeffCoFacilityID);
      if (uid) {
        if (!rowwiseByUid.has(uid)) rowwiseByUid.set(uid, []);
        rowwiseByUid.get(uid).push(r);
        if (name && !nameToUid.has(name)) nameToUid.set(name, uid);
        if (fid && !facilityIdByUid.has(uid)) facilityIdByUid.set(uid, fid);
      }
      const nk = normName(name);
      if (nk) {
        if (!rowwiseByNameKey.has(nk)) rowwiseByNameKey.set(nk, []);
        rowwiseByNameKey.get(nk).push(r);
      }
    });
    // Merge empty-UID rows into their school's UID bucket so that
    // a UID-based lookup returns the school's full data (all categories).
    (rows || []).forEach((r) => {
      const uid = norm(r["UniqueID"] ?? r.UniqueID);
      if (uid) return;
      const name = norm(r["SchoolName"] ?? r.SchoolName);
      const linked = name ? nameToUid.get(name) : null;
      if (linked && rowwiseByUid.has(linked)) {
        rowwiseByUid.get(linked).push(r);
      }
    });
  }

  function getRowwiseRowsForSelection(uid, name) {
    const u = norm(uid);
    const n = norm(name);
    if (u && rowwiseByUid.has(u)) return rowwiseByUid.get(u);
    if (n) return rowwiseByNameKey.get(normName(n)) || [];
    return [];
  }

  function makeUnitCostKey(systemCategory, projectOrAssetType) {
    return `${normKeyLoose(systemCategory)}||${normProjectKey(projectOrAssetType)}`;
  }

  function formatCsvCost(raw) {
    const n = parseNumberMaybe(raw);
    if (n !== null && Number.isFinite(n)) {
      return Number.isInteger(n) ? `$${n.toLocaleString()}` : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return norm(raw);
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

    // Also build a fast lookup by Project name (AssetType).
    unitCostByProjectKey = new Map();
    for (const rec of map.values()) {
      const pk = normProjectKey(rec?.proj);
      if (pk && !unitCostByProjectKey.has(pk)) unitCostByProjectKey.set(pk, rec);
    }

    // Preserve the library's project ordering (this is what drives the profile table rows).
    libraryProjectOrder = order;

    const catSet = new Set(libraryProjectOrder.map((p) => norm(p.sys)).filter(Boolean));
    console.info(
      `UnitCostLibrary.csv: projects=${libraryProjectOrder.length}, categories=${catSet.size}. Categories:`,
      Array.from(catSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }))
    );

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

  function getUniqueSchoolUids(rows) {
    const set = new Set();
    (rows || []).forEach((r) => {
      const uid = norm(r["UniqueID"] ?? r.UniqueID);
      if (uid) set.add(uid);
    });
    return set;
  }

  function isAdditionStoryProject(project) {
    return (
      project === "New 1-story building (addition)" ||
      project === "New 2-story building" ||
      project === "New 3-story building"
    );
  }

  function buildRowsFromRowwise(rawSchoolRows) {
    if (!rawSchoolRows || !rawSchoolRows.length) return [];
    const uid = norm(rawSchoolRows[0]["UniqueID"] ?? rawSchoolRows[0].UniqueID);
    const school = norm(rawSchoolRows[0]["SchoolName"] ?? rawSchoolRows[0].SchoolName);

    // Index the raw rows by normalized project key. Multiple rows per key
    // are possible when the same project has entries for different priorities.
    const byPk = new Map();
    rawSchoolRows.forEach((r) => {
      const pk = normProjectKey(norm(r.AssetType ?? r["AssetType"]));
      if (!pk) return;
      if (!byPk.has(pk)) byPk.set(pk, []);
      byPk.get(pk).push(r);
    });

    const out = [];
    let rowId = 0;

    const consumedPks = new Set();

    // Pass 1: Build rows in the exact order defined by UnitCostLibrary.csv.
    (libraryProjectOrder || []).forEach((p) => {
      const project = norm(p?.proj);
      const pk = norm(p?.pk);
      if (!project || !pk) return;

      const lib = unitCostByProjectKey.get(pk) || null;
      if (!lib) return;
      const sys = norm(lib?.sys);

      consumedPks.add(pk);
      const matches = byPk.get(pk) || [null];

      matches.forEach((match) => {
        const scoreVal = match ? norm(match.ConditionScore ?? match["ConditionScore"]) : "";
        const pv = match ? norm(match.UnitValue ?? match["UnitValue"]) : "";
        const source = match ? norm(match.ConditionSource ?? match["ConditionSource"]) : "";
        const csvPriority = match ? norm(match.PriorityScore ?? match["PriorityScore"]) : "";
        const csvReplacementCost = match ? norm(match.ReplacementCost ?? match["ReplacementCost"]) : "";

        const isAddition = sys === "03_addition";
        const isCafKitchen = project === "New cafeteria and kitchen";
        const allowLibraryForAddition = isAdditionStoryProject(project) || isCafKitchen;

        const unit = (isAddition && !allowLibraryForAddition) ? "" : norm(lib?.unit);
        const unitCost = (isAddition && !allowLibraryForAddition) ? "" : norm(lib?.unitCost);
        const libScore = norm(lib?.score);

        const validCsvPriority = (csvPriority === "1" || csvPriority === "2" || csvPriority === "3" || csvPriority === "4") ? csvPriority : "";

        out.push({
          UniqueID: uid,
          SchoolName: school,
          SystemCategory: sys,
          AssetType: project,
          ConditionScore: libScore || scoreVal,
          ConditionSource: source,
          Unit: unit,
          UnitCost: unitCost,
          UnitValue: pv,
          ReplacementCost: csvReplacementCost ? formatCsvCost(csvReplacementCost) : "",
          __libraryScore: libScore,
          __pivotConditionScore: scoreVal,
          __csvPriority: validCsvPriority,
          __rowId: rowId++,
        });
      });
    });

    // Pass 2: Emit CSV rows whose AssetType is NOT in the UnitCostLibrary.
    // These carry SystemCategory and AssetType directly from the CSV.
    for (const [pk, rows] of byPk) {
      if (consumedPks.has(pk)) continue;
      rows.forEach((match) => {
        const project = norm(match.AssetType ?? match["AssetType"]);
        const sys = norm(match.SystemCategory ?? match["SystemCategory"]);
        const scoreVal = norm(match.ConditionScore ?? match["ConditionScore"]);
        const pv = norm(match.UnitValue ?? match["UnitValue"]);
        const source = norm(match.ConditionSource ?? match["ConditionSource"]);
        const csvPriority = norm(match.PriorityScore ?? match["PriorityScore"]);
        const csvReplacementCost = norm(match.ReplacementCost ?? match["ReplacementCost"]);
        const csvUnit = norm(match.Unit ?? match["Unit"]);

        const validCsvPriority = (csvPriority === "1" || csvPriority === "2" || csvPriority === "3" || csvPriority === "4") ? csvPriority : "";

        out.push({
          UniqueID: uid,
          SchoolName: school,
          SystemCategory: sys || "(Uncategorized)",
          AssetType: project,
          ConditionScore: scoreVal,
          ConditionSource: source,
          Unit: csvUnit,
          UnitCost: "",
          UnitValue: pv,
          ReplacementCost: csvReplacementCost ? formatCsvCost(csvReplacementCost) : "",
          __libraryScore: "",
          __pivotConditionScore: scoreVal,
          __csvPriority: validCsvPriority,
          __rowId: rowId++,
        });
      });
    }

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

    // Multi-select is managed externally; no need to set a single select value.

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
    const pkVal = parseFloat((decision?.PKEnrollment ?? decision?.["PKEnrollment"] ?? decision?.["PK Enrollment"] ?? "").toString().replace(/,/g, "").trim()) || 0;
    if (getIncludePKInEnrollment() && pkVal > 0) {
      const badge = document.createElement("span");
      badge.textContent = " (incl. PK)";
      badge.style.cssText = "font-size:0.65em;color:#2563eb;font-weight:400;vertical-align:middle;";
      elSchoolNameHeader.appendChild(badge);
    }

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
    const resolvedFacilityId = resolvedUniqueId ? facilityIdByUid.get(resolvedUniqueId) : "";
    if (resolvedFacilityId) metaBits.push(`JeffCo Facility ID: ${resolvedFacilityId}`);
    else if (resolvedUniqueId) metaBits.push(`JeffCo Facility ID: ${resolvedUniqueId}`);
    if (status) metaBits.push(`Status: ${status}`);
    if (level) metaBits.push(`Level: ${level}`);
    if (cap) metaBits.push(`Capacity: ${cap}`);
    const enrEff = getEffectiveEnrollment(decision);
    if (Number.isFinite(enrEff) || enr) metaBits.push(`Enrollment: ${Number.isFinite(enrEff) ? enrEff.toLocaleString() : enr}${!getIncludePKInEnrollment() && norm(decision?.PKEnrollment) ? ` (excl. PK: ${norm(decision.PKEnrollment)})` : ""}`);
    if (sqf) metaBits.push(`SQF: ${sqf}`);
    if (resolvedDecisionOutcome) metaBits.push(`Decision: ${resolvedDecisionOutcome}`);
    elSchoolMeta.textContent = metaBits.join(" • ");

    // Get all rowwise records for this school, then build profile rows.
    const rawSchoolRows = getRowwiseRowsForSelection(resolvedUniqueId, resolvedSchoolName);
    schoolRows = buildRowsFromRowwise(rawSchoolRows);
    applyRoomScheduleUnitValues(schoolRows, resolvedUniqueId, resolvedSchoolName, decision);

    // Derive UnitValue + ReplacementCost.
    // Rule:
    // - 01_new construction + 02_gut & renovation: UnitValue is derived from the school's GSF
    // - everything else: UnitValue comes from the rowwise CSV (do not overwrite)
    (schoolRows || []).forEach((r) => {
      const systemCategory = norm(r?.SystemCategory);

      // School-level line items: drop wrong-level rows from the table entirely (not just grey out).
      // Must run BEFORE decision-based early return, or all ES/MS/HS/K-8 lines stay visible when outcome is e.g. Standard Maintenance.
      if (systemCategory === "02_gut & renovation" && !isRelevantGutRenovationRow(r, decision)) {
        r.__hiddenBySchoolLevel = true;
        return;
      }
      if (systemCategory === "01_new construction" && !isRelevantNewConstructionRow(r, decision)) {
        r.__hiddenBySchoolLevel = true;
        return;
      }
      if (!isRelevantPlaygroundRow(r, decision)) {
        r.__hiddenBySchoolLevel = true;
        return;
      }
      if (!isRelevantStemHeavyRow(r, decision)) {
        r.__hiddenBySchoolLevel = true;
        return;
      }

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

      const MAJOR_CATEGORIES = new Set(["01_new construction", "02_gut & renovation", "03_addition"]);
      const isFciCategory = systemCategory.startsWith("08");
      if ((needsGutReno || needsNewConstruction) && !MAJOR_CATEGORIES.has(systemCategory)) {
        if (!(isFciCategory && getIncludeFciForMajor())) {
          r.__excludedFromTotals = true;
          r.__excludedReason = "decision";
          return;
        }
      }

      // Compute Good/Poor from Value threshold (per-school ConditionScore first, then UnitValue).
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

    schoolRows = (schoolRows || []).filter((r) => !r.__hiddenBySchoolLevel);

    populateFilters();
    applyFilters();
    render();
    elExportBtn.disabled = !schoolRows.length;
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

    if (system === "ada" || asset.includes("ada")) return "1";
    if (asset.includes("playground") || asset.includes("site hardscape")) return "3";
    return "2";
  }

  function getPriorityForRow(row) {
    if (row?.__isRollup && row?.__rollupPriority) return row.__rollupPriority;
    if (row?.__csvPriority) return row.__csvPriority;
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
    const c = norm(current);
    if (c === "1") return "2";
    if (c === "2") return "3";
    if (c === "3") return "4";
    return "1";
  }

  function prioritiesInOrder(values) {
    const seen = new Set();
    (values || []).forEach((v) => {
      const n = norm(v);
      if (n) seen.add(n);
    });
    const order = ["1", "2", "3", "4"];
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
    // Primary source: ConditionScore from the rowwise CSV (stored as __pivotConditionScore).
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
    const levelKey = getEffectiveSchoolLevelKey(decision);
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
    const levelKey = getEffectiveSchoolLevelKey(decision);
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

  /** Playground replacement (2–5 vs 5–12): use PK / school level so elementary without PK does not keep the toddler line. */
  function isRelevantPlaygroundRow(row, decision) {
    const assetLo = (norm(row?.AssetType) || "").toLowerCase();
    if (!assetLo.includes("playground")) return true;
    const levelKey = getEffectiveSchoolLevelKey(decision);
    const pk = parseFloat(
      (decision?.PKEnrollment ?? decision?.["PK Enrollment"] ?? decision?.["PK_Enrollment"] ?? "")
        .toString()
        .replace(/,/g, "")
        .trim()
    );
    const hasPK = Number.isFinite(pk) && pk > 0;
    const isAges2to5 = assetLo.includes("2-5") || assetLo.includes("ages 2");
    const isAges5to12 = assetLo.includes("5-12") || assetLo.includes("ages 5");
    if (isAges2to5) {
      if (levelKey === "middle" || levelKey === "high") return false;
      if (!hasPK && (levelKey === "elementary" || levelKey === "k8")) return false;
      return true;
    }
    if (isAges5to12) {
      return true;
    }
    return true;
  }

  /** Heavy modernization STEM: ES line vs MS/HS line by effective school level (K-8 keeps both). */
  function isRelevantStemHeavyRow(row, decision) {
    const sysLo = (norm(row?.SystemCategory) || "").toLowerCase();
    if (!sysLo.includes("heavy")) return true;
    const assetLo = (norm(row?.AssetType) || "").toLowerCase();
    if (!assetLo.includes("stem") && !assetLo.includes("modernize")) return true;
    const isESLine = assetLo.includes("(es)") || assetLo.includes("labs (es)");
    const isMSHSLine = assetLo.includes("ms/hs");
    if (!isESLine && !isMSHSLine) return true;
    const levelKey = getEffectiveSchoolLevelKey(decision);
    if (levelKey === "k8" || levelKey === "k12") return true;
    if (isESLine) {
      if (levelKey === "middle" || levelKey === "high") return false;
      return true;
    }
    if (isMSHSLine) {
      if (levelKey === "elementary") return false;
      return true;
    }
    return true;
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

    // Everything else should come from UnitValue in the rowwise CSV
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
    const totals = { "1": 0, "2": 0, "3": 0, "4": 0 };
    (rows || []).forEach((r) => {
      if (r && r.__excludedFromTotals) return;
      if (r && r.__isRollup && r.__rollupRows) {
        r.__rollupRows.forEach((sub) => {
          if (sub && sub.__excludedFromTotals) return;
          const subRc = parseNumberMaybe(sub?.ReplacementCost);
          if (subRc === null) return;
          const p = norm(getPriorityForRow(sub));
          if (totals.hasOwnProperty(p)) totals[p] += subRc;
          else totals["2"] += subRc;
        });
        return;
      }
      const rc = parseNumberMaybe(r?.ReplacementCost);
      if (rc === null) return;
      const p = norm(getPriorityForRow(r));
      if (totals.hasOwnProperty(p)) totals[p] += rc;
      else totals["2"] += rc;
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

  function getFilteredPriorities() {
    const selected = new Set();
    document.querySelectorAll(".priority-filter-cb").forEach((cb) => {
      if (cb.checked) selected.add(cb.value);
    });
    return selected;
  }

  function updatePriorityFilterLabel() {
    const selected = getFilteredPriorities();
    const total = document.querySelectorAll(".priority-filter-cb").length;
    if (selected.size === 0 || selected.size === total) {
      if (elPriorityFilterLabel) elPriorityFilterLabel.textContent = "All";
    } else {
      if (elPriorityFilterLabel) elPriorityFilterLabel.textContent = Array.from(selected).sort().join(", ");
    }
    if (elPrioritySelectAll) {
      elPrioritySelectAll.checked = selected.size === total;
      elPrioritySelectAll.indeterminate = selected.size > 0 && selected.size < total;
    }
  }

  // --- Generic multi-select filter helpers ---
  function buildMultiSelectDropdown(dropdown, values, cbClass) {
    dropdown.innerHTML = "";
    const allLabel = document.createElement("label");
    allLabel.className = "ms-select-all";
    const allCb = document.createElement("input");
    allCb.type = "checkbox";
    allCb.checked = true;
    allCb.dataset.selectAll = "1";
    allLabel.appendChild(allCb);
    allLabel.append(" Select All");
    dropdown.appendChild(allLabel);

    values.forEach((v) => {
      const lbl = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = cbClass;
      cb.value = v;
      cb.checked = true;
      lbl.appendChild(cb);
      lbl.append(" " + v);
      dropdown.appendChild(lbl);
    });
  }

  function getMultiSelectValues(dropdown, cbClass) {
    const selected = new Set();
    dropdown.querySelectorAll("." + cbClass).forEach((cb) => {
      if (cb.checked) selected.add(cb.value);
    });
    return selected;
  }

  function updateMultiSelectLabel(dropdown, cbClass, labelEl) {
    const cbs = dropdown.querySelectorAll("." + cbClass);
    const selected = getMultiSelectValues(dropdown, cbClass);
    const allCb = dropdown.querySelector("[data-select-all]");
    if (selected.size === 0 || selected.size === cbs.length) {
      labelEl.textContent = "All";
    } else if (selected.size <= 2) {
      labelEl.textContent = Array.from(selected).join(", ");
    } else {
      labelEl.textContent = selected.size + " selected";
    }
    if (allCb) {
      allCb.checked = selected.size === cbs.length;
      allCb.indeterminate = selected.size > 0 && selected.size < cbs.length;
    }
  }

  function wireMultiSelect(wrapId, btn, dropdown, cbClass, labelEl, onChange) {
    btn.addEventListener("click", () => {
      dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
    });
    document.addEventListener("click", (e) => {
      const wrap = document.getElementById(wrapId);
      if (wrap && !wrap.contains(e.target)) dropdown.style.display = "none";
    });
    dropdown.addEventListener("change", (e) => {
      const allCb = dropdown.querySelector("[data-select-all]");
      if (e.target === allCb) {
        dropdown.querySelectorAll("." + cbClass).forEach((cb) => { cb.checked = allCb.checked; });
      }
      updateMultiSelectLabel(dropdown, cbClass, labelEl);
      onChange();
    });
  }

  function clearMultiSelect(dropdown, cbClass, labelEl) {
    const allCb = dropdown.querySelector("[data-select-all]");
    if (allCb) allCb.checked = true;
    dropdown.querySelectorAll("." + cbClass).forEach((cb) => { cb.checked = true; });
    labelEl.textContent = "All";
  }

  function getIncludedPriorities() {
    const included = new Set();
    document.querySelectorAll(".priority-include-cb").forEach((cb) => {
      if (cb.checked) included.add(cb.getAttribute("data-priority"));
    });
    return included;
  }

  function getFilteredFlatRows() {
    const flat = [];
    (viewRows || []).forEach((g) => {
      (g.__rows || []).forEach((r) => flat.push(r));
    });
    return flat;
  }

  function updateTotalReplacementCostDisplay() {
    if (!elTotalReplacementCost) return;

    const filteredRows = getFilteredFlatRows();
    const t = computeReplacementTotalsByPriority(filteredRows);

    const storyProject =
      additionPlanningState.stories === 2
        ? "New 2-story building"
        : additionPlanningState.stories === 3
          ? "New 3-story building"
          : "New 1-story building (addition)";
    const additionVisible = filteredRows.some(
      (r) => norm(r?.SystemCategory) === "03_addition" && norm(r?.AssetType) === storyProject
    );
    if (additionVisible && computeAdditionCost()) {
      const storyRow = filteredRows.find(
        (r) => norm(r?.SystemCategory) === "03_addition" && norm(r?.AssetType) === storyProject
      ) || null;
      const addPriority = storyRow ? norm(getPriorityForRow(storyRow)) : "2";
      const add = computeAdditionCost();
      if (t.hasOwnProperty(addPriority)) t[addPriority] += add;
      else t["2"] += add;
    }

    if (elTotalP1Cost) elTotalP1Cost.textContent = t["1"] ? `$${Math.round(t["1"]).toLocaleString()}` : "—";
    if (elTotalP2Cost) elTotalP2Cost.textContent = t["2"] ? `$${Math.round(t["2"]).toLocaleString()}` : "—";
    if (elTotalP3Cost) elTotalP3Cost.textContent = t["3"] ? `$${Math.round(t["3"]).toLocaleString()}` : "—";
    if (elTotalP4Cost) elTotalP4Cost.textContent = t["4"] ? `$${Math.round(t["4"]).toLocaleString()}` : "—";

    const included = getIncludedPriorities();
    let total = 0;
    ["1", "2", "3", "4"].forEach((p) => { if (included.has(p)) total += (t[p] || 0); });
    total = Math.round(total);
    elTotalReplacementCost.textContent = total ? `$${total.toLocaleString()}` : "—";
  }

  function compareValues(a, b, dir) {
    const mult = dir === "desc" ? -1 : 1;
    // Priority compare when both are priority labels
    const ap = normLoose(a);
    const bp = normLoose(b);
    const priorityOrder = { "1": 0, "2": 1, "3": 2, "4": 3 };
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
    const prioritySelected = getFilteredPriorities();
    const totalPriorityCbs = document.querySelectorAll(".priority-filter-cb").length;
    const filterByPriority = prioritySelected.size > 0 && prioritySelected.size < totalPriorityCbs;
    const systemSel = elSystemDropdown ? getMultiSelectValues(elSystemDropdown, "system-filter-cb") : new Set();
    const systemTotal = elSystemDropdown ? elSystemDropdown.querySelectorAll(".system-filter-cb").length : 0;
    const filterBySystem = systemSel.size > 0 && systemSel.size < systemTotal;

    const assetSel = elAssetDropdown ? getMultiSelectValues(elAssetDropdown, "asset-filter-cb") : new Set();
    const assetTotal = elAssetDropdown ? elAssetDropdown.querySelectorAll(".asset-filter-cb").length : 0;
    const filterByAsset = assetSel.size > 0 && assetSel.size < assetTotal;

    const sourceSel = elSourceDropdown ? getMultiSelectValues(elSourceDropdown, "source-filter-cb") : new Set();
    const sourceTotal = elSourceDropdown ? elSourceDropdown.querySelectorAll(".source-filter-cb").length : 0;
    const filterBySource = sourceSel.size > 0 && sourceSel.size < sourceTotal;

    const filtered = schoolRows.filter((r) => {
      if (filterByPriority) {
        if (r.__isRollup && r.__rollupPriority === "(Multiple)" && r.__rollupRows) {
          const anyMatch = r.__rollupRows.some((sub) => prioritySelected.has(norm(getPriorityForRow(sub))));
          if (!anyMatch) return false;
        } else if (!prioritySelected.has(norm(getPriorityForRow(r)))) {
          return false;
        }
      }
      if (filterBySystem && !systemSel.has(norm(r.SystemCategory))) return false;
      if (filterByAsset && !assetSel.has(norm(r.AssetType))) return false;
      if (filterBySource && !sourceSel.has(norm(r.ConditionSource))) return false;
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
      updateTotalReplacementCostDisplay();
      return;
    }

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");

    DISPLAY_COLS.forEach((col) => {
      const th = document.createElement("th");
      const displayName = COL_DISPLAY_NAMES[col] || col;
      th.textContent = displayName + (sortState.key === col ? (sortState.dir === "asc" ? " ▲" : " ▼") : "");
      th.title = "Sort by " + displayName;
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

    function getSuperGroupKey(groupName) {
      const g = norm(groupName).toLowerCase();
      if (g.startsWith("00") || g.startsWith("01") || g.startsWith("02") || g.startsWith("03") || g.startsWith("04") || g.startsWith("05") || g.startsWith("06")) return "Projects";
      if (g.startsWith("08")) return "FCI Deficiency";
      return null;
    }

    function computeGroupByP(rows) {
      const byP = { "1": 0, "2": 0, "3": 0, "4": 0 };
      (rows || []).forEach((r) => {
        if (r && r.__excludedFromTotals) return;
        if (r && r.__isRollup && r.__rollupRows) {
          r.__rollupRows.forEach((sub) => {
            if (sub && sub.__excludedFromTotals) return;
            const rc = parseNumberMaybe(sub?.ReplacementCost);
            if (rc === null) return;
            const p = norm(getPriorityForRow(sub));
            if (byP.hasOwnProperty(p)) byP[p] += rc;
            else byP["2"] += rc;
          });
        } else {
          const rc = parseNumberMaybe(r?.ReplacementCost);
          if (rc === null) return;
          const p = norm(getPriorityForRow(r));
          if (byP.hasOwnProperty(p)) byP[p] += rc;
          else byP["2"] += rc;
        }
      });
      return byP;
    }

    if (!groupsInitialized) {
      viewRows.forEach((g) => collapsedGroups.add(g.__group));
      groupsInitialized = true;
    }

    const superGroupOrder = [];
    const superGroupMap = new Map();
    viewRows.forEach((g) => {
      const sgKey = getSuperGroupKey(g.__group) || g.__group;
      if (!superGroupMap.has(sgKey)) {
        superGroupMap.set(sgKey, []);
        superGroupOrder.push(sgKey);
      }
      superGroupMap.get(sgKey).push(g);
    });

    superGroupOrder.forEach((sgKey) => {
      const groups = superGroupMap.get(sgKey);
      const isSuperGroup = groups.length > 1 || (getSuperGroupKey(groups[0].__group) !== null && groups[0].__group !== sgKey);
      const isSuperCollapsed = collapsedSuperGroups.has(sgKey);

      if (isSuperGroup) {
        const superByP = { "1": 0, "2": 0, "3": 0, "4": 0 };
        groups.forEach((g) => {
          const gp = computeGroupByP(g.__rows);
          ["1", "2", "3", "4"].forEach((p) => { superByP[p] += gp[p]; });
        });
        const superTotal = superByP["1"] + superByP["2"] + superByP["3"] + superByP["4"];

        const sgTr = document.createElement("tr");
        sgTr.className = "super-group-row" + (isSuperCollapsed ? " collapsed" : "") + (sgKey === "FCI Deficiency" ? " fci-deficiency" : "");
        const sgTd = document.createElement("td");
        sgTd.colSpan = DISPLAY_COLS.length;
        const sgHeader = document.createElement("div");
        sgHeader.className = "group-header";
        const sgLabel = document.createElement("div");
        sgLabel.className = "group-label";
        const sgArrow = document.createElement("span");
        sgArrow.className = "group-arrow";
        sgArrow.textContent = "▼";
        sgLabel.appendChild(sgArrow);
        sgLabel.appendChild(document.createTextNode(sgKey));
        sgHeader.appendChild(sgLabel);
        const sgSub = document.createElement("span");
        sgSub.className = "group-subtotal";
        sgSub.textContent = superTotal ? `$${Math.round(superTotal).toLocaleString()}` : "";
        if (superTotal) {
          sgSub.title = ["P1: $" + Math.round(superByP["1"]).toLocaleString(),
            "P2: $" + Math.round(superByP["2"]).toLocaleString(),
            "P3: $" + Math.round(superByP["3"]).toLocaleString(),
            "P4: $" + Math.round(superByP["4"]).toLocaleString()].join("\n");
        }
        sgHeader.appendChild(sgSub);
        sgTd.appendChild(sgHeader);
        sgTr.appendChild(sgTd);
        sgTr.addEventListener("click", () => {
          if (collapsedSuperGroups.has(sgKey)) collapsedSuperGroups.delete(sgKey);
          else collapsedSuperGroups.add(sgKey);
          render();
        });
        tbody.appendChild(sgTr);

        if (isSuperCollapsed) return;
      }

      const isFciParent = sgKey === "FCI Deficiency";

      groups.forEach((g) => {

      const groupKey = g.__group;
      const isCollapsed = collapsedGroups.has(groupKey);

      const groupByP = computeGroupByP(g.__rows);
      const groupSubtotal = groupByP["1"] + groupByP["2"] + groupByP["3"] + groupByP["4"];

      const groupTr = document.createElement("tr");
      groupTr.className = "group-row" + (isCollapsed ? " collapsed" : "") + (isFciParent ? " fci-child" : "");
      const td = document.createElement("td");
      td.colSpan = DISPLAY_COLS.length;
      const header = document.createElement("div");
      header.className = "group-header";
      const labelDiv = document.createElement("div");
      labelDiv.className = "group-label";
      const arrow = document.createElement("span");
      arrow.className = "group-arrow";
      arrow.textContent = "▼";
      labelDiv.appendChild(arrow);
      labelDiv.appendChild(document.createTextNode(groupKey));
      header.appendChild(labelDiv);
      const subtotalSpan = document.createElement("span");
      subtotalSpan.className = "group-subtotal";
      subtotalSpan.textContent = groupSubtotal ? `$${Math.round(groupSubtotal).toLocaleString()}` : "";
      if (groupSubtotal) {
        const lines = ["P1: $" + Math.round(groupByP["1"]).toLocaleString(),
          "P2: $" + Math.round(groupByP["2"]).toLocaleString(),
          "P3: $" + Math.round(groupByP["3"]).toLocaleString(),
          "P4: $" + Math.round(groupByP["4"]).toLocaleString()];
        subtotalSpan.title = lines.join("\n");
      }
      header.appendChild(subtotalSpan);
      td.appendChild(header);
      groupTr.appendChild(td);
      groupTr.addEventListener("click", () => {
        if (collapsedGroups.has(groupKey)) collapsedGroups.delete(groupKey);
        else collapsedGroups.add(groupKey);
        render();
      });
      tbody.appendChild(groupTr);

      if (isCollapsed) return;

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

      if (isFciParent) {
        const fciAssetGroups = new Map();
        g.__rows.forEach((r) => {
          const at = norm(r?.AssetType) || "(Unknown)";
          if (!fciAssetGroups.has(at)) fciAssetGroups.set(at, []);
          fciAssetGroups.get(at).push(r);
        });


        const filteredPriorities = getFilteredPriorities();
        const totalPriorityCbs = document.querySelectorAll(".priority-filter-cb").length;
        const allPrioritiesSelected = filteredPriorities.size === 0 || filteredPriorities.size === totalPriorityCbs;
        const priorityLabel = allPrioritiesSelected
          ? "P1–P4"
          : "P" + Array.from(filteredPriorities).sort().join(", P");

        fciAssetGroups.forEach((assetRows, at) => {
          if (assetRows.length > 1) {
            const collapseKey = groupKey + "||" + at;
            const isAssetCollapsed = !expandedFciAssets.has(collapseKey);

            const byP = { "1": 0, "2": 0, "3": 0, "4": 0 };
            assetRows.forEach((ar) => {
              if (ar && ar.__excludedFromTotals) return;
              const rc = parseNumberMaybe(ar?.ReplacementCost);
              if (rc === null) return;
              const p = norm(getPriorityForRow(ar));
              if (byP.hasOwnProperty(p)) byP[p] += rc;
              else byP["2"] += rc;
            });
            const sum = byP["1"] + byP["2"] + byP["3"] + byP["4"];

            const rollupTr = document.createElement("tr");
            rollupTr.className = "fci-rollup-row" + (isAssetCollapsed ? " collapsed" : "");
            rollupTr.style.cursor = "pointer";
            DISPLAY_COLS.forEach((col) => {
              const cell = document.createElement("td");
              if (col === "Project Type") {
                const arrow = document.createElement("span");
                arrow.className = "group-arrow";
                arrow.textContent = "▼";
                cell.appendChild(arrow);
                cell.appendChild(document.createTextNode(at));
              } else if (col === "Priority") {
                cell.textContent = priorityLabel;
                cell.style.textAlign = "center";
                cell.style.fontSize = "11px";
              } else if (col === "ReplacementCost") {
                cell.textContent = sum ? `$${Math.round(sum).toLocaleString()}` : "";
                const tooltip = ["P1: $" + Math.round(byP["1"]).toLocaleString(),
                  "P2: $" + Math.round(byP["2"]).toLocaleString(),
                  "P3: $" + Math.round(byP["3"]).toLocaleString(),
                  "P4: $" + Math.round(byP["4"]).toLocaleString()];
                cell.title = tooltip.join("\n");
              } else {
                cell.textContent = "";
              }
              rollupTr.appendChild(cell);
            });
            rollupTr.addEventListener("click", () => {
              if (expandedFciAssets.has(collapseKey)) expandedFciAssets.delete(collapseKey);
              else expandedFciAssets.add(collapseKey);
              render();
            });
            tbody.appendChild(rollupTr);

            if (!isAssetCollapsed) {
              assetRows.forEach((r) => renderSingleRow(r));
            }
          } else {
            assetRows.forEach((r) => renderSingleRow(r));
          }
        });
      } else {
        g.__rows.forEach((r) => renderSingleRow(r));
      }

      function renderSingleRow(r) {
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
            if (r.__isRollup) {
              const rollupSys = norm(r.SystemCategory).toLowerCase();
              const isSiteInfraRollup = rollupSys === "08_site infrastructure" || rollupSys === "08_site infrastructure_new";
              const seg = document.createElement("div");
              const isCommon = r.__rollupPriority !== "(Multiple)";
              seg.className = "priority-segment" + (isSiteInfraRollup ? " priority-external" : isCommon ? " priority-rollup" : "");
              seg.setAttribute("role", "group");
              seg.setAttribute("aria-label", "Priority");
              ["1", "2", "3", "4"].forEach((p) => {
                const b = document.createElement("button");
                b.type = "button";
                b.className = "priority-segment-btn";
                b.textContent = p;
                b.setAttribute("aria-pressed", String(isCommon && normLoose(current) === normLoose(p)));
                if (isSiteInfraRollup) {
                  b.title = `Priority ${p} (hardcoded)`;
                  b.style.cursor = "default";
                } else {
                  b.title = `Set rollup priority to ${p}`;
                  b.addEventListener("click", () => {
                    (r.__rollupRows || []).forEach((sub) => {
                      if (sub.__csvPriority) return;
                      const key = getRowKey(sub);
                      if (key) {
                        priorityOverrides[key] = p;
                      }
                    });
                    savePriorityOverrides();
                    r.__rollupPriority = p;
                    updateTotalReplacementCostDisplay();
                    populateFilters();
                    applyFilters();
                    render();
                  });
                }
                seg.appendChild(b);
              });
              cell.appendChild(seg);
            } else {
            const isExternal = !!r.__csvPriority;
            const seg = document.createElement("div");
            seg.className = "priority-segment" + (isExternal ? " priority-external" : "");
            seg.setAttribute("role", "group");
            seg.setAttribute("aria-label", "Priority");

            ["1", "2", "3", "4"].forEach((p) => {
              const b = document.createElement("button");
              b.type = "button";
              b.className = "priority-segment-btn";
              b.textContent = p;
              b.setAttribute("aria-pressed", String(normLoose(current) === normLoose(p)));
              b.title = isExternal ? `Priority ${p} (set in CSV)` : `Set priority to ${p}`;
              if (!isExternal) {
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
              } else {
                b.style.cursor = "default";
              }
              seg.appendChild(b);
            });

            cell.appendChild(seg);
            }
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
              if (!isFciParent) {
                const k = text.toLowerCase();
                if (k === "good") cell.classList.add("score-good");
                else if (k === "poor") cell.classList.add("score-poor");
                else if (k === "n/a" || k === "na") cell.classList.add("score-na");
              }
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
              if (isFciParent) {
                cell.style.color = "#111827";
              } else if (isDemolition) {
                if (!keepBlackForDemolitionCost) cell.classList.add("muted");
              } else {
                if (!keepBlackForCosts) cell.classList.add("muted");
              }
            }

            // FCI Deficiency: grey out ConditionScore, UnitCost, UnitValue
            if (isFciParent && (col === "ConditionScore" || col === "UnitCost" || col === "UnitValue")) {
              cell.style.color = "var(--muted)";
            }
          }
          tr.appendChild(cell);
        });
        tbody.appendChild(tr);
      }

      }); // end groups.forEach
    }); // end superGroupOrder.forEach

    table.appendChild(tbody);
    elTableMount.appendChild(table);

    const hasExternal = schoolRows.some((r) => !!r.__csvPriority);
    if (hasExternal) {
      const note = document.createElement("div");
      note.style.cssText = "margin-top:8px;font-size:12px;color:#6b7280;display:flex;align-items:center;gap:6px;";
      note.innerHTML = '<span style="display:inline-block;width:12px;height:12px;background:#111827;border-radius:2px;"></span> Priority assigned from project data';
      elTableMount.appendChild(note);
    }

    updateTotalReplacementCostDisplay();
  }

  function populateFilters() {
    const prevSystems = elSystemDropdown ? getMultiSelectValues(elSystemDropdown, "system-filter-cb") : new Set();
    const prevAssets = elAssetDropdown ? getMultiSelectValues(elAssetDropdown, "asset-filter-cb") : new Set();
    const prevSources = elSourceDropdown ? getMultiSelectValues(elSourceDropdown, "source-filter-cb") : new Set();

    const systems = uniqueSorted(schoolRows.map((r) => r.SystemCategory));
    const assets = uniqueSorted(schoolRows.map((r) => r.AssetType));
    const sources = uniqueSorted(schoolRows.map((r) => r.ConditionSource));

    if (elSystemDropdown) {
      buildMultiSelectDropdown(elSystemDropdown, systems, "system-filter-cb");
      if (prevSystems.size) restoreMultiSelectState(elSystemDropdown, "system-filter-cb", prevSystems, elSystemLabel);
    }
    if (elAssetDropdown) {
      buildMultiSelectDropdown(elAssetDropdown, assets, "asset-filter-cb");
      if (prevAssets.size) restoreMultiSelectState(elAssetDropdown, "asset-filter-cb", prevAssets, elAssetLabel);
    }
    if (elSourceDropdown) {
      buildMultiSelectDropdown(elSourceDropdown, sources, "source-filter-cb");
      if (prevSources.size) restoreMultiSelectState(elSourceDropdown, "source-filter-cb", prevSources, elSourceLabel);
    }
  }

  function restoreMultiSelectState(dropdown, cbClass, prevSelected, labelEl) {
    const cbs = dropdown.querySelectorAll("." + cbClass);
    const allValues = new Set();
    cbs.forEach((cb) => allValues.add(cb.value));
    const stillValid = new Set([...prevSelected].filter((v) => allValues.has(v)));
    if (stillValid.size && stillValid.size < allValues.size) {
      cbs.forEach((cb) => { cb.checked = stillValid.has(cb.value); });
      updateMultiSelectLabel(dropdown, cbClass, labelEl);
    }
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

  function applyMultiSchoolSelection() {
    if (!selectedSchoolUids.size) {
      schoolRows = [];
      resolvedUniqueId = "";
      resolvedSchoolName = "";
      resolvedDecisionOutcome = "";
      keepBlackForCosts = false;
      keepBlackForDemolitionCost = false;
      elSchoolNameHeader.textContent = "—";
      elSchoolMeta.textContent = "Select one or more schools above to view summary and projects.";
      if (elTotalReplacementCost) elTotalReplacementCost.textContent = "—";
      if (elTotalP1Cost) elTotalP1Cost.textContent = "—";
      if (elTotalP2Cost) elTotalP2Cost.textContent = "—";
      if (elTotalP3Cost) elTotalP3Cost.textContent = "—";
      if (elTotalP4Cost) elTotalP4Cost.textContent = "—";
      elTableMount.innerHTML = '<div class="empty">No school selected.</div>';
      elExportBtn.disabled = true;
      return;
    }

    if (selectedSchoolUids.size === 1) {
      const uid = Array.from(selectedSchoolUids)[0];
      if (uid.startsWith("name:")) {
        const nm = uid.slice(5);
        setSelectedSchool("", nm);
      } else {
        const r = decisionByUid.get(uid);
        const nm = norm(r?.["Building Name"]) || "";
        setSelectedSchool(uid, nm);
      }
      return;
    }

    // Multi-school: combine rows from all selected schools
    keepBlackForCosts = true;
    keepBlackForDemolitionCost = true;
    resolvedDecisionOutcome = "";
    resolvedUniqueId = "";
    resolvedSchoolName = "";

    const names = [];
    const combined = [];
    let rowId = 0;
    selectedSchoolUids.forEach((id) => {
      const isNameOnly = id.startsWith("name:");
      const uid = isNameOnly ? "" : id;
      const nm = isNameOnly ? id.slice(5) : (norm(decisionByUid.get(id)?.["Building Name"]) || id);
      const decision = uid ? decisionByUid.get(uid) : null;
      names.push(nm);
      const rawSchoolRows = getRowwiseRowsForSelection(uid, nm);
      const rows = buildRowsFromRowwise(rawSchoolRows);
      applyRoomScheduleUnitValues(rows, uid, nm, decision);

      const schoolDecision = decision ? evaluateSchoolDecision(decision, getActiveThresholds()) : "";
      const schoolOutcome = (schoolDecision || "").trim();
      const keepBlackOutcomes = [
        "Major Capital Investment",
        "Welcoming School with Capital Investment",
        "Building Addition with Capital Investment",
      ];
      const schoolNeedsGutReno = keepBlackOutcomes.includes(schoolOutcome);
      const schoolNeedsNewConstruction =
        ["Building Replacement", "Welcoming School with Building Replacement"].includes(schoolOutcome) ||
        schoolOutcome.toLowerCase().includes("demolition");
      const MAJOR_CATEGORIES = new Set(["01_new construction", "02_gut & renovation", "03_addition"]);

      rows.forEach((r) => {
        r.__schoolLabel = nm;
        r.__rowId = rowId++;
        const systemCategory = norm(r?.SystemCategory);

        const lib = unitCostIndex ? unitCostIndex.get(makeUnitCostKey(r.SystemCategory, r.AssetType)) : null;
        const computed = computeConditionScoreFromValue(r, lib);
        if (computed) {
          r.ConditionScore = computed;
          r.__libraryScore = computed;
        }

        if (systemCategory === "02_gut & renovation" && !isRelevantGutRenovationRow(r, decision)) {
          r.__hiddenBySchoolLevel = true;
          return;
        }
        if (systemCategory === "01_new construction" && !isRelevantNewConstructionRow(r, decision)) {
          r.__hiddenBySchoolLevel = true;
          return;
        }
        if (!isRelevantPlaygroundRow(r, decision)) {
          r.__hiddenBySchoolLevel = true;
          return;
        }
        if (!isRelevantStemHeavyRow(r, decision)) {
          r.__hiddenBySchoolLevel = true;
          return;
        }

        if (systemCategory === "02_gut & renovation" && !schoolNeedsGutReno) {
          r.__excludedFromTotals = true;
          r.__excludedReason = "decision";
          r.UnitValue = "";
          r.ReplacementCost = "Not included";
          return;
        }
        if (systemCategory === "01_new construction" && !schoolNeedsNewConstruction) {
          r.__excludedFromTotals = true;
          r.__excludedReason = "decision";
          r.UnitValue = "";
          r.ReplacementCost = "Not included";
          return;
        }

        const isFciCat = systemCategory.startsWith("08");
        if ((schoolNeedsGutReno || schoolNeedsNewConstruction) && !MAJOR_CATEGORIES.has(systemCategory)) {
          if (!(isFciCat && getIncludeFciForMajor())) {
            r.__excludedFromTotals = true;
            r.__excludedReason = "decision";
          }
        }

        const s = norm(r?.ConditionScore || r?.__libraryScore).toLowerCase();
        const excludedByScore = s === "good";
        if (!r.__excludedFromTotals) {
          r.__excludedFromTotals = excludedByScore;
          r.__excludedReason = excludedByScore ? "good" : "";
        }

        const unit = normalizeUnit(r?.Unit, r?.UnitCost);
        if (!unit) return;

        const derivedQ = computeDerivedQuantity(r, decision);
        if (derivedQ !== null && shouldUseSchoolSqfForRow(r)) {
          r.UnitValue = Number.isFinite(derivedQ) ? Math.round(derivedQ).toString() : String(derivedQ);
        }

        const rc = computeReplacementCost(r, decision);
        if (rc !== null && Number.isFinite(rc)) {
          r.ReplacementCost = `$${Math.round(rc).toLocaleString()}`;
        }
      });

      combined.push(...rows.filter((r) => !r.__hiddenBySchoolLevel));
    });

    const SITE_INFRA_CATS = new Set(["08_site infrastructure", "08_site infrastructure_new"]);
    const rollupMap = new Map();
    combined.forEach((r) => {
      const sys = norm(r.SystemCategory).toLowerCase();
      const isSiteInfra = SITE_INFRA_CATS.has(sys);
      const key = isSiteInfra
        ? `${norm(r.SystemCategory)}||${norm(r.AssetType)}||${norm(getPriorityForRow(r))}`
        : `${norm(r.SystemCategory)}||${norm(r.AssetType)}`;
      if (!rollupMap.has(key)) rollupMap.set(key, []);
      rollupMap.get(key).push(r);
    });

    const SCORE_NUM = { "good": 3, "fair": 2, "poor": 1 };
    const NUM_SCORE = { 3: "Good", 2: "Fair", 1: "Poor" };

    const rollupRows = [];
    let rollupId = 0;
    rollupMap.forEach((rows) => {
      const first = rows[0];

      const priorities = rows.map((r) => norm(getPriorityForRow(r)));
      const uniquePriorities = new Set(priorities);
      const rollupPriority = uniquePriorities.size === 1 ? priorities[0] : "(Multiple)";

      const numericScores = rows
        .map((r) => SCORE_NUM[norm(r.ConditionScore || "").toLowerCase()])
        .filter((n) => n != null);
      let avgScoreLabel = norm(first.ConditionScore);
      if (numericScores.length > 0) {
        const avg = numericScores.reduce((a, b) => a + b, 0) / numericScores.length;
        avgScoreLabel = avg >= 2.5 ? "Good" : avg >= 1.5 ? "Fair" : "Poor";
      }

      let totalCost = 0;
      let allExcludedByDecision = true;
      rows.forEach((r) => {
        if (!r.__excludedFromTotals || r.__excludedReason !== "decision") allExcludedByDecision = false;
        if (r.__excludedFromTotals) return;
        const rc = parseNumberMaybe(r.ReplacementCost);
        if (rc !== null) totalCost += rc;
      });

      const excludedByDecision = allExcludedByDecision && rows.length > 0;
      const excludedByScore = !excludedByDecision && avgScoreLabel.toLowerCase() === "good";

      const rollupUnitValue = shouldUseSchoolSqfForRow(first) ? "" : first.UnitValue;

      rollupRows.push({
        UniqueID: "",
        SchoolName: "",
        SystemCategory: first.SystemCategory,
        AssetType: first.AssetType,
        ConditionScore: avgScoreLabel,
        ConditionSource: first.ConditionSource,
        Unit: first.Unit,
        UnitCost: first.UnitCost,
        UnitValue: rollupUnitValue,
        ReplacementCost: totalCost ? `$${Math.round(totalCost).toLocaleString()}` : "",
        __libraryScore: first.__libraryScore,
        __pivotConditionScore: first.__pivotConditionScore,
        __csvPriority: "",
        __rollupPriority: rollupPriority,
        __isRollup: true,
        __rollupRows: rows,
        __rowId: rollupId++,
        __excludedFromTotals: excludedByDecision || excludedByScore,
        __excludedReason: excludedByDecision ? "decision" : (excludedByScore ? "good" : ""),
      });
    });

    schoolRows = rollupRows;
    elSchoolNameHeader.textContent = names.length <= 3 ? names.join(", ") : `${names.length} Facilities`;
    if (getIncludePKInEnrollment()) {
      let anyPK = false;
      selectedSchoolUids.forEach((id) => {
        if (anyPK) return;
        const uid = id.startsWith("name:") ? "" : id;
        const dec = uid ? decisionByUid.get(uid) : null;
        const pk = parseFloat((dec?.PKEnrollment ?? dec?.["PKEnrollment"] ?? dec?.["PK Enrollment"] ?? "").toString().replace(/,/g, "").trim()) || 0;
        if (pk > 0) anyPK = true;
      });
      if (anyPK) {
        const badge = document.createElement("span");
        badge.textContent = " (incl. PK)";
        badge.style.cssText = "font-size:0.65em;color:#2563eb;font-weight:400;vertical-align:middle;";
        elSchoolNameHeader.appendChild(badge);
      }
    }
    elSchoolMeta.textContent = `${names.length} facilities selected • ${rollupRows.length} rollup project rows`;

    populateFilters();
    applyFilters();
    render();
    elExportBtn.disabled = !schoolRows.length;
  }

  function downloadFilteredCsv() {
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

  function escapeHtmlPdf(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function downloadFilteredPdf() {
    function esc(s) {
      return escapeHtmlPdf(s);
    }

    const facilityCount = selectedSchoolUids && selectedSchoolUids.size ? selectedSchoolUids.size : 0;
    const isMultiFacilityRollup = facilityCount > 1;

    let anySchoolLabel = false;
    let tableRowCount = 0;
    (viewRows || []).forEach((g) => {
      tableRowCount += 1;
      (g.__rows || []).forEach((r) => {
        if (r.__schoolLabel) anySchoolLabel = true;
        tableRowCount += 1;
      });
    });

    // Portrait: smaller base when many category+data rows (e.g. select-all rollup).
    let fontPt = 7.5;
    if (tableRowCount > 42) fontPt = 7;
    if (tableRowCount > 58) fontPt = 6.5;
    if (tableRowCount > 76) fontPt = 6;
    if (tableRowCount > 98) fontPt = 5.5;
    if (tableRowCount > 125) fontPt = 5;
    if (tableRowCount > 160) fontPt = 4.5;
    if (isMultiFacilityRollup && facilityCount >= 40) fontPt = Math.min(fontPt, 6);
    if (isMultiFacilityRollup && facilityCount >= 80) fontPt = Math.min(fontPt, 5.5);
    if (isMultiFacilityRollup && facilityCount >= 100) fontPt = Math.min(fontPt, 5);

    const headerLabels = [];
    if (anySchoolLabel) headerLabels.push("Facility");
    DISPLAY_COLS.forEach((c) => {
      const key = typeof c === "string" ? c : c.key || c;
      headerLabels.push((COL_DISPLAY_NAMES && COL_DISPLAY_NAMES[key]) || key);
    });
    const colCount = headerLabels.length;

    const thead =
      "<tr><th>" + headerLabels.map((h) => esc(h)).join("</th><th>") + "</th></tr>";

    const bodyParts = [];
    let pdfDataRowIdx = 0;
    /** Estimated table height (pt) for 2-page print fit */
    let estTablePt = 0;
    (viewRows || []).forEach((g) => {
      estTablePt += Math.max(13, fontPt * 1.05 + 9);
      const gname = esc(norm(g.__group) || "(Uncategorized)");
      bodyParts.push(`<tr class="pdf-group"><td colspan="${colCount}">${gname}</td></tr>`);
      (g.__rows || []).forEach((r) => {
        const proj = norm(getCellValue(r, "Project Type"));
        const fac = anySchoolLabel ? norm(r.__schoolLabel || "") : "";
        const longText = Math.max(proj.length, fac.length, 24);
        const wrapLines = Math.min(5, 1 + Math.floor(longText / 36));
        estTablePt += Math.max(11, fontPt * 1.2 * wrapLines + 6);
        const rowClass = (r.__excludedFromTotals ? "pdf-ex " : "") + "pdf-data" + (pdfDataRowIdx % 2 === 1 ? " pdf-zebra" : "");
        pdfDataRowIdx += 1;
        const cells = [];
        if (anySchoolLabel) cells.push(esc(r.__schoolLabel || "—"));
        DISPLAY_COLS.forEach((c) => {
          const key = typeof c === "string" ? c : c.key || c;
          cells.push(esc(getCellValue(r, key) ?? ""));
        });
        bodyParts.push(`<tr class="${rowClass}"><td>` + cells.join("</td><td>") + "</td></tr>");
      });
    });
    const tbody = bodyParts.join("");

    const schoolTitle = esc((elSchoolNameHeader && elSchoolNameHeader.innerText) || "Project list");
    const docTitle = norm(elSchoolNameHeader && elSchoolNameHeader.innerText) || "Project list";
    const meta = esc((elSchoolMeta && elSchoolMeta.textContent) || "");
    const tot = esc((elTotalReplacementCost && elTotalReplacementCost.textContent) || "—");
    const p1 = esc((elTotalP1Cost && elTotalP1Cost.textContent) || "—");
    const p2 = esc((elTotalP2Cost && elTotalP2Cost.textContent) || "—");
    const p3 = esc((elTotalP3Cost && elTotalP3Cost.textContent) || "—");
    const p4 = esc((elTotalP4Cost && elTotalP4Cost.textContent) || "—");
    const inc = getIncludedPriorities();
    const pInTotal = ["1", "2", "3", "4"]
      .filter((p) => inc.has(p))
      .map((p) => "P" + p)
      .join(", ");

    const filt = [];
    const q = norm(elSearch && elSearch.value);
    if (q) filt.push(`Search: “${esc(q)}”`);
    if (elPriorityFilterLabel && norm(elPriorityFilterLabel.textContent) && elPriorityFilterLabel.textContent !== "All") {
      filt.push("Priority: " + esc(elPriorityFilterLabel.textContent));
    }
    if (elSystemLabel && norm(elSystemLabel.textContent) && elSystemLabel.textContent !== "All") {
      filt.push("System: " + esc(elSystemLabel.textContent));
    }
    if (elAssetLabel && norm(elAssetLabel.textContent) && elAssetLabel.textContent !== "All") {
      filt.push("Project type: " + esc(elAssetLabel.textContent));
    }
    if (elSourceLabel && norm(elSourceLabel.textContent) && elSourceLabel.textContent !== "All") {
      filt.push("Condition source: " + esc(elSourceLabel.textContent));
    }
    const filtBlock = filt.length ? filt.join(" · ") : "No text filters (table filters: All).";

    const def122 = document.getElementById("deficiencyOnlyToggle");
    const facBits = [];
    if (def122 && def122.checked) facBits.push("122 active traditional sites only");
    document.querySelectorAll(".facility-type-cb:checked").forEach((cb) => {
      const v = cb.value;
      const map = {
        school: "Schools",
        "cte-pathway": "CTE Pathways",
        cte: "CTE",
        athletics: "Athletics",
        oels: "OELs",
        "admin-support": "Admin & Support",
      };
      if (map[v]) facBits.push(map[v]);
    });
    const facLine = esc(facBits.length ? facBits.join("; ") : "Facility filters: (none checked)");

    const pkNote = getIncludePKInEnrollment() ? "PK included in enrollment figures." : "PK excluded from enrollment figures.";
    const fciNote = getIncludeFciForMajor()
      ? "FCI rows included for gut reno / new construction."
      : "FCI rows excluded for gut reno / new construction (default).";

    let additionBlock = "";
    if (additionPlanningState.show) {
      const so =
        additionPlanningState.studentsOver != null
          ? Number(additionPlanningState.studentsOver).toLocaleString()
          : "—";
      const gsfT =
        additionPlanningState.gsfTarget != null
          ? Number(additionPlanningState.gsfTarget).toLocaleString()
          : "—";
      const st = additionPlanningState.stories || 1;
      additionBlock = `<div class="pdf-add"><strong>Building addition (planning):</strong> Students over capacity: ${esc(so)} · Target GSF: ${esc(gsfT)} · Stories: ${esc(
        String(st)
      )}</div>`;
    }

    // Target ~2 portrait pages: shrink print zoom (and margins) when the table is tall.
    const PT = 72;
    const pageH = 11 * PT;
    const marginVIn = isMultiFacilityRollup || tableRowCount > 72 ? 0.26 : 0.4;
    const marginHIn = isMultiFacilityRollup || tableRowCount > 72 ? 0.34 : 0.45;
    const marginV = marginVIn * PT * 2;
    const contentPerPage = pageH - marginV;
    const metaRough = (elSchoolMeta && elSchoolMeta.textContent) || "";
    let summaryReserve =
      228 +
      (additionBlock ? 52 : 0) +
      (metaRough.length > 140 ? 32 : metaRough.length > 70 ? 16 : 0);
    const tableBudgetPt = Math.max(236, contentPerPage * 2 - summaryReserve);

    let heightFudge = 1.06;
    if (facilityCount > 1) heightFudge *= 1.05;
    if (facilityCount > 25) heightFudge *= 1.04;
    if (facilityCount > 60) heightFudge *= 1.035;
    if (facilityCount > 100) heightFudge *= 1.025;
    estTablePt *= heightFudge;

    let pdfZoomPct = 100;
    if (estTablePt > tableBudgetPt && tableBudgetPt > 80) {
      pdfZoomPct = Math.round((tableBudgetPt / estTablePt) * 1000) / 10;
      pdfZoomPct = Math.max(34, Math.min(100, pdfZoomPct));
    }

    const cellPad =
      pdfZoomPct < 82 ? "1px 2px" : pdfZoomPct < 90 ? "2px 3px" : "3px 5px";
    const thPad = pdfZoomPct < 82 ? "2px 3px" : pdfZoomPct < 92 ? "4px 4px" : "5px 5px";
    const groupCellPad = pdfZoomPct < 82 ? "2px 3px" : "4px 6px";

    const when = new Date();
    const stamp = esc(
      when.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    );

    const html =
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>" +
      esc(docTitle) +
      `</title><style>
/* Portrait report — blue header / white grid (reference styling) */
html {
  zoom: ${pdfZoomPct}%;
}
@page { size: letter portrait; margin: ${marginVIn}in ${marginHIn}in; }
* { box-sizing: border-box; }
body {
  font-family: Arial, Helvetica, "Segoe UI", sans-serif;
  margin: 0;
  padding: 0;
  color: #111;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.pdf-banner { font-size: 7pt; color: #3071a9; margin: 0 0 4pt 0; font-weight: 600; }
h1 {
  font-size: 12pt;
  margin: 0 0 4pt 0;
  line-height: 1.2;
  font-weight: 800;
  color: #1a365d;
  padding-bottom: 4pt;
  border-bottom: 3px solid #3071a9;
}
.pdf-meta { font-size: 7pt; margin: 4pt 0 6pt 0; line-height: 1.35; color: #333; }
.pdf-cost-wrap {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 10pt 18pt;
  margin: 0 0 6pt 0;
  font-size: 7pt;
  padding: 6pt 8pt;
  background: #f0f6fb;
  border: 1px solid #c5d9ed;
  border-radius: 2pt;
}
.pdf-total { font-weight: 800; font-size: 9pt; color: #1a365d; }
.pdf-pgrid { display: grid; grid-template-columns: auto auto; gap: 1px 10px; align-items: baseline; }
.pdf-pgrid .k { color: #3071a9; font-weight: 700; }
.pdf-note { font-size: 6.5pt; color: #374151; margin: 0 0 5pt 0; line-height: 1.25; }
.pdf-filters { font-size: 6.5pt; margin: 0 0 6pt 0; line-height: 1.3; color: #333; }
.pdf-add {
  font-size: 6.5pt;
  margin: 0 0 6pt 0;
  padding: 5pt 8pt;
  background: #f0f6fb;
  border: 1px solid #c5d9ed;
  border-left: 4px solid #3071a9;
  border-radius: 0 2pt 2pt 0;
}
table.data {
  width: 100%;
  border-collapse: collapse;
  font-size: ${fontPt}pt;
  table-layout: fixed;
  border: 1px solid #cfd8e3;
}
table.data thead th {
  background: #3071a9;
  color: #fff;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: calc(${fontPt}pt + 0.35pt);
  padding: ${thPad};
  border: 1px solid #255a87;
  text-align: left;
  vertical-align: middle;
}
table.data tbody td {
  border: 1px solid #d1d5db;
  padding: ${cellPad};
  vertical-align: top;
  word-wrap: break-word;
  overflow-wrap: anywhere;
  text-align: left;
  background: #fff;
  color: #111;
}
table.data tbody tr.pdf-group td {
  background: #e8f0f8;
  color: #1e3a5f;
  font-weight: 700;
  font-size: calc(${fontPt}pt + 0.4pt);
  padding: ${groupCellPad};
  border: 1px solid #b8cce0;
  page-break-after: avoid;
}
table.data tbody tr.pdf-data.pdf-zebra td { background: #f7fafc; }
table.data tbody tr.pdf-ex td { color: #64748b; }
table.data tbody tr.pdf-ex.pdf-zebra td { background: #f1f5f9; color: #64748b; }
thead { display: table-header-group; }
tfoot { display: table-footer-group; }
.pdf-foot { font-size: 6pt; color: #64748b; margin-top: 6pt; line-height: 1.3; }
/* Column widths (portrait) */
table.data th:nth-child(1), table.data td:nth-child(1) { width: ${anySchoolLabel ? "11%" : "7%"}; }
table.data th:nth-child(2), table.data td:nth-child(2) { width: ${anySchoolLabel ? "8%" : "34%"}; }
table.data th:nth-child(3), table.data td:nth-child(3) { width: ${anySchoolLabel ? "30%" : "12%"}; }
table.data th:nth-child(4), table.data td:nth-child(4) { width: ${anySchoolLabel ? "12%" : "14%"}; }
table.data th:nth-child(5), table.data td:nth-child(5) { width: ${anySchoolLabel ? "14%" : "14%"}; }
table.data th:nth-child(6), table.data td:nth-child(6) { width: ${anySchoolLabel ? "13%" : "14%"}; }
table.data th:nth-child(7), table.data td:nth-child(7) { width: ${anySchoolLabel ? "12%" : "19%"}; }
</style></head><body>
<div class="pdf-banner">School Facility Planning Webtool · School Profile · Exported ${stamp}</div>
<h1>${schoolTitle}</h1>
${meta ? `<p class="pdf-meta">${meta}</p>` : ""}
<div class="pdf-cost-wrap">
  <div class="pdf-total">Total cost (selected priorities): ${tot}</div>
  <div class="pdf-pgrid"><span class="k">P1</span><span>${p1}</span><span class="k">P2</span><span>${p2}</span><span class="k">P3</span><span>${p3}</span><span class="k">P4</span><span>${p4}</span></div>
</div>
<p class="pdf-note">Total uses only checked priority bands (P1–P4 checkboxes). Currently included: ${esc(pInTotal || "none")}. ${esc(pkNote)} ${esc(fciNote)}</p>
<p class="pdf-filters"><strong>Facility selection:</strong> ${facLine}<br><strong>Table filters:</strong> ${filtBlock}</p>
${additionBlock}
<table class="data"><thead>${thead}</thead><tbody>${tbody}</tbody></table>
<p class="pdf-foot">Grey text = row excluded from totals (decision, score, or N/A).${pdfZoomPct < 99 ? ` Print zoom set to ${pdfZoomPct}% to target two pages (Chrome/Edge).` : ""} If a third page appears, reduce print margins slightly.</p>
</body></html>`;

    const w = window.open("", "_blank");
    if (!w) {
      alert("Please allow pop-ups to export PDF.");
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    w.setTimeout(function () {
      w.print();
      w.onafterprint = function () {
        w.close();
      };
    }, 250);
  }

  function init() {
    const school = getSchoolFromQuery();
    const uid = getUidFromQuery();
    selectedSchoolNameFromQuery = school ? school : "";
    selectedUniqueIdFromQuery = uid ? uid : "";

    elSchoolMeta.textContent = `Loading school summary (${DECISION_CSV_PATH}), projects (${ASSETS_CSV_PATH}), unit cost library (${UNITCOST_LIBRARY_CSV_PATH}), and room schedule (${ROOM_SCHEDULE_CSV_PATH})…`;
    elExportBtn.disabled = true;

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
        const roomTotals = buildRoomScheduleTotals(roomScheduleRows || []);
        roomScheduleByUid = roomTotals.byUid || new Map();
        roomScheduleByFacility = roomTotals.byFacility || new Map();

        allRows = Array.isArray(assetRows) ? assetRows : [];
        buildRowwiseIndex(allRows);

        const linkedUids = getUniqueSchoolUids(allRows);

        const colCheck = hasAllRequiredColumns(allRows);
        if (!colCheck.ok) {
          elSchoolMeta.textContent = `Projects CSV is missing required columns: ${colCheck.missing.join(", ")}`;
          elTableMount.innerHTML = '<div class="empty">Cannot render profile due to missing required columns.</div>';
          return;
        }

        // CTE Pathways: high schools with CTE programs (subset of "school")
        const CTE_PATHWAY_NAMES = new Set([
          "golden high school","jefferson junior/senior high school","lakewood high school",
          "arvada west high school","ralston valley high school","bear creek high school",
          "chatfield senior high school","dakota ridge high school",
          "alameda international junior/senior high school","green mountain high school",
          "conifer high school","evergreen high school","columbine high school",
          "arvada high school","wheat ridge high school","pomona junior/senior high school",
          "standley lake high school",
        ]);
        // CTE facilities (Warren Tech)
        const CTE_NAMES = new Set([
          "warren tech","warren tech central","warren tech north","warren tech south",
        ]);
        // Athletics keywords
        const ATHLETICS_KEYWORDS = ["stadium","athletic","field house"];
        // OEL keywords
        const OEL_KEYWORDS = ["oels","outdoor ed"];
        // Admin & Support keywords
        const ADMIN_KEYWORDS = [
          "transportation","service center","conference","driving","landscape",
          "support services","frank deangelis","shop facility","pump house",
          "reservoir","wastewater","water treatment","gallery well","planetarium",
          "809 bldg","809 service","581 conference","cottage","bldg 1","bldg 2",
          "bldg 3","bldg 4","bldg 5","bldg 6","bldg 8","central services",
        ];
        function classifyFacilityType(name) {
          const n = (name || "").toLowerCase();
          if (CTE_NAMES.has(n)) return "cte";
          if (CTE_PATHWAY_NAMES.has(n)) return "cte-pathway";
          if (ATHLETICS_KEYWORDS.some((k) => n.includes(k))) return "athletics";
          if (OEL_KEYWORDS.some((k) => n.includes(k))) return "oels";
          if (ADMIN_KEYWORDS.some((k) => n.includes(k))) return "admin-support";
          return "school";
        }

        // The "original 122" facilities shown by default (toggle unchecked).
        // Keyed by the last segment of the UniqueID (CDE code).
        const ORIGINAL_122 = new Set([
          "0030","0033","0108","0370","0378","0660","0664","0694","0724","0779",
          "0950","0951","0952","0965","1001","1244","1318","1522","1861","1864",
          "1876","1886","1976","2093","2120","2130","2194","2288","2300","2322",
          "2496","2550","2616","2820","2832","2836","2866","2963","3025","3088",
          "3201","3216","3502","3536","3622","3628","3726","4190","4422","4548",
          "4549","4550","4798","4830","4942","5004","5024","5036","5222","5350",
          "5354","5454","5472","5524","5580","5623","5758","5892","5944","6133",
          "6135","6285","6286","6330","6470","6539","6804","6808","6848","7114",
          "7128","7190","7238","7239","7282","7468","7483","7529","7708","7753",
          "7780","7833","7870","7962","8036","8090","8102","8209","8223","8276",
          "8280","8300","8381","8432","8856","9008","9052","9058","9232","9234",
          "9245","9299","9328","9342","9412","9424","9428","9429","9432","9490",
          "9510","9648",
        ]);
        function getCdeSuffix(uid) {
          if (!uid) return "";
          const parts = uid.split("-");
          return parts[parts.length - 1] || "";
        }

        // Populate multi-select school dropdown from Decision Data Export
        // plus any CSV-only schools (those with SchoolName but no UniqueID).
        // deficiency=true for the original 122; deficiency=false for the rest.
        const decisionOpts = (decisionRows || [])
          .map((r) => {
            const uid = norm(r["UniqueID"] ?? r.UniqueID);
            const bname = norm(r["Building Name"] ?? r.BuildingName ?? r["BuildingName"]);
            return {
              uid: uid,
              name: bname,
              deficiency: ORIGINAL_122.has(getCdeSuffix(uid)),
              status: norm(r["Status"] ?? r.Status),
              schoolLevel: norm(r["School Level"]),
              facilityType: classifyFacilityType(bname),
            };
          })
          .filter((o) => o.uid && o.name && (linkedUids.has(o.uid) || o.deficiency));

        const decisionUidSet = new Set(decisionOpts.map((o) => o.uid));
        const schoolNamesCoveredByDecision = new Set();
        (allRows || []).forEach((r) => {
          const uid = norm(r["UniqueID"] ?? r.UniqueID);
          const name = norm(r["SchoolName"] ?? r.SchoolName);
          if (uid && name && decisionUidSet.has(uid)) schoolNamesCoveredByDecision.add(name);
        });
        const csvOnlyNames = new Set();
        (allRows || []).forEach((r) => {
          const name = norm(r["SchoolName"] ?? r.SchoolName);
          if (name && !schoolNamesCoveredByDecision.has(name)) csvOnlyNames.add(name);
        });
        const csvOnlyOpts = Array.from(csvOnlyNames).map((name) => ({
          uid: "name:" + name,
          name: name,
          deficiency: false,
          status: "",
          schoolLevel: "",
          facilityType: classifyFacilityType(name),
        }));

        const schoolOpts = [...decisionOpts, ...csvOnlyOpts]
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));

        // Register school names for global search
        if (typeof window.globalSearchRegisterSchools === "function") {
          window.globalSearchRegisterSchools(schoolOpts.map(function (o) { return o.name; }));
        }

        const elDeficiencyToggle = document.getElementById("deficiencyOnlyToggle");

        if (elSchoolSelectDropdown) {
          const searchWrap = document.createElement("div");
          searchWrap.style.cssText = "padding:6px 10px;border-bottom:1px solid #e5e7eb;position:sticky;top:0;background:#fff;z-index:1;";
          const searchInput = document.createElement("input");
          searchInput.type = "text";
          searchInput.placeholder = "Search facilities\u2026";
          searchInput.style.cssText = "width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit;outline:none;";
          searchWrap.appendChild(searchInput);
          elSchoolSelectDropdown.appendChild(searchWrap);

          const allLabel = document.createElement("label");
          allLabel.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;font-weight:600;border-bottom:1px solid #e5e7eb;";
          const allCb = document.createElement("input");
          allCb.type = "checkbox";
          allCb.id = "schoolSelectAll";
          allCb.style.cssText = "width:14px;height:14px;";
          const originalReportCount = schoolOpts.filter((o) => o.deficiency).length;
          const allLabelText = document.createElement("span");
          allLabelText.textContent = `Select All (${originalReportCount})`;
          allLabel.appendChild(allCb);
          allLabel.appendChild(allLabelText);
          elSchoolSelectDropdown.appendChild(allLabel);

          function updateSelectAllLabel() {
            const targets = getSelectAllTargets();
            allLabelText.textContent = `Select All (${targets.length})`;
          }

          schoolOpts.forEach((o) => {
            const label = document.createElement("label");
            label.style.cssText = "display:flex;align-items:center;gap:8px;padding:4px 12px;cursor:pointer;";
            if (!o.deficiency) label.classList.add("non-deficiency-school");
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.className = "school-cb";
            cb.value = o.uid;
            cb.dataset.name = o.name;
            cb.dataset.deficiency = o.deficiency ? "1" : "0";
            cb.dataset.facilityType = o.facilityType;
            const isOriginalReport = o.deficiency;
            cb.dataset.originalReport = isOriginalReport ? "1" : "0";
            cb.style.cssText = "width:14px;height:14px;";
            label.appendChild(cb);
            label.appendChild(document.createTextNode(o.name));
            elSchoolSelectDropdown.appendChild(label);
          });

          const schoolCbs = elSchoolSelectDropdown.querySelectorAll(".school-cb");

          // Facility type filter checkboxes
          const elFacilityTypeFilter = document.getElementById("facilityTypeFilter");
          const facilityTypeCbs = elFacilityTypeFilter
            ? Array.from(elFacilityTypeFilter.querySelectorAll(".facility-type-cb"))
            : [];

          function getActiveFacilityTypes() {
            const types = new Set();
            facilityTypeCbs.forEach((cb) => { if (cb.checked) types.add(cb.value); });
            return types;
          }

          function isFacilityTypeVisible(ft, activeTypes) {
            if (activeTypes.has(ft)) return true;
            if (ft === "cte-pathway" && activeTypes.has("school")) return true;
            return false;
          }

          function isOriginal122Mode() {
            return elDeficiencyToggle && elDeficiencyToggle.checked;
          }

          function isCbVisible(cb) {
            if (isOriginal122Mode()) {
              return cb.dataset.deficiency === "1";
            }
            const activeTypes = getActiveFacilityTypes();
            if (activeTypes.size === 0) return false;
            return isFacilityTypeVisible(cb.dataset.facilityType, activeTypes);
          }

          function getVisibleSchoolCbs() {
            const cbs = [];
            schoolCbs.forEach((cb) => { if (isCbVisible(cb)) cbs.push(cb); });
            return cbs;
          }

          function getSelectAllTargets() {
            return getVisibleSchoolCbs();
          }

          function onSchoolSelectionChanged() {
            selectedSchoolUids = new Set();
            schoolCbs.forEach((cb) => { if (cb.checked) selectedSchoolUids.add(cb.value); });
            const targets = getSelectAllTargets();
            const checkedTargets = targets.filter((cb) => cb.checked);
            const count = selectedSchoolUids.size;
            if (count === 0) {
              elSchoolSelectLabel.textContent = "— Select facilities —";
            } else if (checkedTargets.length === targets.length && targets.length > 0 && count === checkedTargets.length) {
              elSchoolSelectLabel.textContent = `All Facilities (${count})`;
            } else if (count <= 2) {
              const names = [];
              schoolCbs.forEach((cb) => { if (cb.checked) names.push(cb.dataset.name); });
              elSchoolSelectLabel.textContent = names.join(", ");
            } else {
              elSchoolSelectLabel.textContent = `${count} facilities selected`;
            }
            allCb.checked = checkedTargets.length === targets.length && targets.length > 0;
            allCb.indeterminate = checkedTargets.length > 0 && checkedTargets.length < targets.length;
            applyMultiSchoolSelection();
          }

          function applyFacilityVisibility() {
            schoolCbs.forEach((cb) => {
              const lbl = cb.closest("label");
              if (!lbl) return;
              const vis = isCbVisible(cb);
              lbl.style.display = vis ? "" : "none";
              cb.checked = vis;
            });
            allCb.checked = true;
            allCb.indeterminate = false;
            updateSelectAllLabel();
            onSchoolSelectionChanged();
          }

          // "122 Active Traditional Sites Only" checked -> uncheck all type checkboxes
          if (elDeficiencyToggle) {
            elDeficiencyToggle.addEventListener("change", () => {
              if (elDeficiencyToggle.checked) {
                facilityTypeCbs.forEach((cb) => { cb.checked = false; });
              }
              applyFacilityVisibility();
            });
          }

          // Any type checkbox checked -> uncheck "122 active"
          facilityTypeCbs.forEach((ftCb) => {
            ftCb.addEventListener("change", () => {
              if (ftCb.checked && elDeficiencyToggle && elDeficiencyToggle.checked) {
                elDeficiencyToggle.checked = false;
              }
              // If no types checked and 122 not checked, nothing to show
              const anyTypeChecked = facilityTypeCbs.some((c) => c.checked);
              if (!anyTypeChecked && elDeficiencyToggle && !elDeficiencyToggle.checked) {
                // Re-check 122 active as fallback
                elDeficiencyToggle.checked = true;
              }
              applyFacilityVisibility();
            });
          });

          schoolCbs.forEach((cb) => cb.addEventListener("change", onSchoolSelectionChanged));

          allCb.addEventListener("change", () => {
            const targets = getSelectAllTargets();
            if (allCb.checked) {
              targets.forEach((cb) => { cb.checked = true; });
            } else {
              schoolCbs.forEach((cb) => { cb.checked = false; });
            }
            onSchoolSelectionChanged();
          });

          // Initial state: "122 active" checked, type cbs unchecked
          applyFacilityVisibility();

          searchInput.addEventListener("input", () => {
            const q = searchInput.value.trim().toLowerCase();
            schoolCbs.forEach((cb) => {
              const lbl = cb.closest("label");
              if (!lbl) return;
              if (!isCbVisible(cb)) { lbl.style.display = "none"; return; }
              if (!q) { lbl.style.display = ""; return; }
              const name = (cb.dataset.name || "").toLowerCase();
              lbl.style.display = name.includes(q) ? "" : "none";
            });
            if (q) { allLabel.style.display = "none"; }
            else { allLabel.style.display = ""; }
          });
          searchInput.addEventListener("click", (e) => e.stopPropagation());
          searchInput.addEventListener("keydown", (e) => e.stopPropagation());

          if (elSchoolSelectBtn) {
            elSchoolSelectBtn.addEventListener("click", () => {
              const isOpen = elSchoolSelectDropdown.style.display !== "none";
              elSchoolSelectDropdown.style.display = isOpen ? "none" : "block";
              if (!isOpen) {
                searchInput.value = "";
                searchInput.dispatchEvent(new Event("input"));
                setTimeout(() => searchInput.focus(), 0);
              }
            });
            document.addEventListener("click", (e) => {
              const container = document.getElementById("schoolMultiSelect");
              if (container && !container.contains(e.target)) {
                elSchoolSelectDropdown.style.display = "none";
              }
            });
          }

          window.__schoolCbs = schoolCbs;
          window.__onSchoolSelectionChanged = onSchoolSelectionChanged;
        }

        const pkToggle = document.getElementById("includePKInEnrollmentToggle");
        if (pkToggle) {
          pkToggle.checked = getIncludePKInEnrollment();
          pkToggle.addEventListener("change", () => {
            setIncludePKInEnrollment(pkToggle.checked);
            applyMultiSchoolSelection();
          });
        }

        const fciToggle = document.getElementById("includeFciToggle");
        if (fciToggle) {
          fciToggle.checked = !!localStorage.getItem("includeFciForMajor");
          fciToggle.addEventListener("change", () => {
            if (fciToggle.checked) localStorage.setItem("includeFciForMajor", "1");
            else localStorage.removeItem("includeFciForMajor");
            applyMultiSchoolSelection();
          });
        }

        // If URL has a school/uid param, pre-check that school
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

        if (resolvedUid && window.__schoolCbs) {
          window.__schoolCbs.forEach((cb) => { if (cb.value === resolvedUid) cb.checked = true; });
          if (window.__onSchoolSelectionChanged) window.__onSchoolSelectionChanged();
        } else {
          elSchoolNameHeader.textContent = "—";
          elSchoolMeta.textContent = "Select one or more schools above to view summary and projects.";
          elTableMount.innerHTML = '<div class="empty">No school selected.</div>';
        }
      })
      .catch((err) => {
        console.error("Failed to load CSVs:", err);
        elSchoolMeta.textContent = "Failed to load school summary and/or projects/unit-cost CSV.";
        elTableMount.innerHTML = '<div class="empty">Could not load the CSV file(s).</div>';
        elExportBtn.disabled = true;
      });

    elSearch.addEventListener("input", () => {
      applyFilters();
      render();
    });
    // Priority multi-select dropdown
    const priorityFilterCbs = document.querySelectorAll(".priority-filter-cb");
    function onPriorityFilterChanged() {
      updatePriorityFilterLabel();
      applyFilters();
      render();
    }
    priorityFilterCbs.forEach((cb) => cb.addEventListener("change", onPriorityFilterChanged));
    if (elPrioritySelectAll) {
      elPrioritySelectAll.addEventListener("change", () => {
        priorityFilterCbs.forEach((cb) => { cb.checked = elPrioritySelectAll.checked; });
        onPriorityFilterChanged();
      });
    }
    if (elPriorityFilterBtn) {
      elPriorityFilterBtn.addEventListener("click", () => {
        const isOpen = elPriorityFilterDropdown.style.display !== "none";
        elPriorityFilterDropdown.style.display = isOpen ? "none" : "block";
      });
      document.addEventListener("click", (e) => {
        const container = document.getElementById("priorityMultiSelect");
        if (container && !container.contains(e.target)) {
          elPriorityFilterDropdown.style.display = "none";
        }
      });
    }

    function onFilterChanged() { applyFilters(); render(); }
    if (elSystemBtn && elSystemDropdown && elSystemLabel) {
      wireMultiSelect("systemMultiSelect", elSystemBtn, elSystemDropdown, "system-filter-cb", elSystemLabel, onFilterChanged);
    }
    if (elAssetBtn && elAssetDropdown && elAssetLabel) {
      wireMultiSelect("assetMultiSelect", elAssetBtn, elAssetDropdown, "asset-filter-cb", elAssetLabel, onFilterChanged);
    }
    if (elSourceBtn && elSourceDropdown && elSourceLabel) {
      wireMultiSelect("sourceMultiSelect", elSourceBtn, elSourceDropdown, "source-filter-cb", elSourceLabel, onFilterChanged);
    }

    elClearFilters.addEventListener("click", () => {
      elSearch.value = "";
      priorityFilterCbs.forEach((cb) => { cb.checked = true; });
      if (elPrioritySelectAll) elPrioritySelectAll.checked = true;
      updatePriorityFilterLabel();
      if (elSystemDropdown && elSystemLabel) clearMultiSelect(elSystemDropdown, "system-filter-cb", elSystemLabel);
      if (elAssetDropdown && elAssetLabel) clearMultiSelect(elAssetDropdown, "asset-filter-cb", elAssetLabel);
      if (elSourceDropdown && elSourceLabel) clearMultiSelect(elSourceDropdown, "source-filter-cb", elSourceLabel);
      sortState = { key: "SystemCategory", dir: "asc" };
      applyFilters();
      render();
    });
    if (elExportBtn) {
      elExportBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = elExportDropdown.style.display === "block";
        elExportDropdown.style.display = open ? "none" : "block";
      });
    }
    if (elExportCsvOption) {
      elExportCsvOption.addEventListener("click", () => {
        elExportDropdown.style.display = "none";
        downloadFilteredCsv();
      });
    }
    if (elExportPdfOption) {
      elExportPdfOption.addEventListener("click", () => {
        elExportDropdown.style.display = "none";
        downloadFilteredPdf();
      });
    }
    document.addEventListener("click", () => {
      if (elExportDropdown) elExportDropdown.style.display = "none";
    });
    if (elExportDropdown) {
      elExportDropdown.addEventListener("click", (e) => e.stopPropagation());
    }

    document.querySelectorAll(".priority-include-cb").forEach((cb) => {
      cb.addEventListener("change", () => updateTotalReplacementCostDisplay());
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();


