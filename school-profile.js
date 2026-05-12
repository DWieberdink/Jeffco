/* school-profile.js
   - Loads project list CSV (one row per school+asset)
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
  const CACHE_BUST = "20260506_14";
  const PRIORITY_OVERRIDES_STORAGE_KEY = "jeffco_priority_overrides_per_row_v1";
  const MANUAL_QTY_OVERRIDES_STORAGE_KEY = "jeffco_manual_site_qty_overrides_v2";
  /** Bump version when include defaults change so old localStorage overrides do not mask new behavior. */
  const ROW_INCLUDE_TOGGLE_STORAGE_KEY = "jeffco_row_include_toggle_v8";
  /** Legacy key — migrated once into MANUAL_QTY_OVERRIDES_STORAGE_KEY on load. */
  const LEGACY_RESURFACE_SF_STORAGE_KEY = "jeffco_resurface_sf_overrides_v1";

  // The assets CSV is row-wise: one row per school + asset type.
  const REQUIRED_COLS = ["SchoolName", "AssetType"];
  // Add computed Priority column (derived from SystemCategory) as the left-most column.
  /** Replacement-cost placeholder when no $ total (displayed as "-"). */
  const RC_PLACEHOLDER = "-";

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
    stories: 2, // 2 | 3 (rates from New Construction ES/MS/HS/K-8; 3-story +5% foundations)
    collapsed: false,
  };
  /** Fallback $/SF if school level or library rate is missing */
  const ADDITION_STORY_FALLBACK_SF = { 2: 600, 3: 630 };
  /** Applied to New Construction rate for 3-story additions (foundations / pad prep) */
  const ADDITION_THIRD_STORY_FOUNDATION_FACTOR = 1.05;

  /**
   * New cafeteria and kitchen (03_addition): shell $/SF from cost-study assumptions (see UnitCostLibrary UnitCost / scope columns).
   * Direct Unit Cost $ Range (Low)=(E) and (High)=(F) for Cafeteria and Kitchen rows → use mids.
   * Kitchen equipment $/SF by school level from same row (ES/MS/HS), mid of E and F each.
   * Composite: ⅓×(kitchen shell + equipment) + ⅔×(cafeteria shell), then × (1 + 0.065) hard-cost factor.
   */
  const CK_CAF_SHELL_E = 470;
  const CK_CAF_SHELL_F = 515;
  const CK_KIT_SHELL_E = 580;
  const CK_KIT_SHELL_F = 640;
  const CK_SHELL_CAF_MID = (CK_CAF_SHELL_E + CK_CAF_SHELL_F) / 2;
  const CK_SHELL_KIT_MID = (CK_KIT_SHELL_E + CK_KIT_SHELL_F) / 2;
  const CK_EQUIP_ES_MID = (8.52 + 9.41) / 2;
  const CK_EQUIP_MS_MID = (4.41 + 4.83) / 2;
  const CK_EQUIP_HS_MID = (4.1 + 4.54) / 2;
  const CK_HARD_COST_FACTOR = 1.065;

  /**
   * Heavy kitchen/caf modernization — combined kitchen/cafeteria cost study line (mapped to Modernize kitchen / Heavily modernize cafeteria).
   * Kitchen: $/SF = (kitchen shell mid + kitchen equipment mid by school level) × hard-cost factor; quantity = kitchen SF (schedule, else 2,800 basis).
   * Cafeteria: $/SF = cafeteria shell mid × hard-cost factor (equipment on kitchen line only); quantity = cafeteria SF (schedule, else 5,800 basis).
   */
  const HM_KITCHEN_BASIS_SF = 2800;
  const HM_CAFETERIA_BASIS_SF = 5800;
  const HM_KIT_SHELL_E = 357.86;
  const HM_KIT_SHELL_F = 393.64;
  const HM_CAF_SHELL_E = 213.73;
  const HM_CAF_SHELL_F = 235.11;
  const HM_SHELL_KIT_MID = (HM_KIT_SHELL_E + HM_KIT_SHELL_F) / 2;
  const HM_SHELL_CAF_MID = (HM_CAF_SHELL_E + HM_CAF_SHELL_F) / 2;

  /** Light cafeteria — combined kitchen/cafeteria light-mod line; equipment not in % reduction (omit from this $/SF). */
  const LM_CAF_SHELL_E = 146.69;
  const LM_CAF_SHELL_F = 161.36;
  const LM_SHELL_CAF_MID = (LM_CAF_SHELL_E + LM_CAF_SHELL_F) / 2;

  /**
   * New gym and locker rooms (03_addition): cost-study direct range mids reflected in UnitCostLibrary `UnitCost`.
   * (Gym $445–$490/SF, Locker Room $1,035–$1,150/SF). Composite: ⅔ gym + ⅓ lockers; × hard-cost factor.
   */
  const GL_GYM_SHELL_E = 445;
  const GL_GYM_SHELL_F = 490;
  const GL_LOCKER_SHELL_E = 1035;
  const GL_LOCKER_SHELL_F = 1150;
  const GL_SHELL_GYM_MID = (GL_GYM_SHELL_E + GL_GYM_SHELL_F) / 2;
  const GL_SHELL_LOCKER_MID = (GL_LOCKER_SHELL_E + GL_LOCKER_SHELL_F) / 2;
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
  const elClearFilters = document.getElementById("clearFiltersBtn");
  const elResetManualQtyOverrides = document.getElementById("resetManualQtyOverridesBtn");
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
  /** Non–site-infra FCI: keys for asset rollups the user collapsed (default = expanded). */
  const collapsedFciAssets = new Set();
  /** 08_site infrastructure*: asset rollup expanded state (default collapsed until expanded here). */
  const expandedFciSiteInfraAssets = new Set();

  function isSiteInfrastructureFciGroupKey(groupKey) {
    return /^08_site infrastructure/i.test(norm(groupKey));
  }

  /** Aligns with render() `getSuperGroupKey` — used outside render for FCI bulk expand/collapse. */
  function getProjectSuperGroupKey(groupName) {
    const g = norm(groupName).toLowerCase();
    if (
      g.startsWith("00") ||
      g.startsWith("01") ||
      g.startsWith("02") ||
      g.startsWith("03") ||
      g.startsWith("04") ||
      g.startsWith("05") ||
      g.startsWith("06")
    )
      return "Projects";
    if (g.startsWith("08")) return "FCI Deficiency";
    return null;
  }

  /** Distinct FCI asset rollup bands (tan P1–P4 subgroup rows) in the current filtered table. */
  function countFciAssetBands() {
    let n = 0;
    viewRows.forEach((g) => {
      if (getProjectSuperGroupKey(g.__group) !== "FCI Deficiency") return;
      const seenAt = new Set();
      (g.__rows || []).forEach((r) => {
        const at = norm(r?.AssetType) || "(Unknown)";
        if (seenAt.has(at)) return;
        seenAt.add(at);
        n++;
      });
    });
    return n;
  }

  function allFciAssetBandsExpanded() {
    let bands = 0;
    let expanded = 0;
    viewRows.forEach((g) => {
      if (getProjectSuperGroupKey(g.__group) !== "FCI Deficiency") return;
      const groupKey = g.__group;
      const seenAt = new Set();
      (g.__rows || []).forEach((r) => {
        const at = norm(r?.AssetType) || "(Unknown)";
        if (seenAt.has(at)) return;
        seenAt.add(at);
        bands++;
        const ck = groupKey + "||" + at;
        const isExp = isSiteInfrastructureFciGroupKey(groupKey)
          ? expandedFciSiteInfraAssets.has(ck)
          : !collapsedFciAssets.has(ck);
        if (isExp) expanded++;
      });
    });
    return bands > 0 && expanded === bands;
  }

  /** Expand or collapse only FCI asset-level bands (P1–P4 rollups), not 08 category rows or the FCI super-row. */
  function toggleAllFciAssetBands() {
    const wantExpand = !allFciAssetBandsExpanded();
    viewRows.forEach((g) => {
      if (getProjectSuperGroupKey(g.__group) !== "FCI Deficiency") return;
      const groupKey = g.__group;
      const seenAt = new Set();
      (g.__rows || []).forEach((r) => {
        const at = norm(r?.AssetType) || "(Unknown)";
        if (seenAt.has(at)) return;
        seenAt.add(at);
        const ck = groupKey + "||" + at;
        if (isSiteInfrastructureFciGroupKey(groupKey)) {
          if (wantExpand) expandedFciSiteInfraAssets.add(ck);
          else expandedFciSiteInfraAssets.delete(ck);
        } else {
          if (wantExpand) collapsedFciAssets.delete(ck);
          else collapsedFciAssets.add(ck);
        }
      });
    });
    render();
  }
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
  let manualQtyOverrides = loadManualQtyOverrides();
  let rowIncludeToggleOverrides = loadRowIncludeToggleOverrides();
  let unitCostIndex = new Map();
  let unitCostByProjectKey = new Map();
  let libraryProjectOrder = []; // [{ proj, pk, sys }]
  /** Room schedule AREA sums by normalized CostEstimateLink bucket (STEM labs rolled into one bucket). */
  let roomScheduleSfByBucket = new Map();

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
    buildingThresholdBelow: 7,
    buildingThresholdFlow4: 1.5,
    adequateProgramsMin: 80,
    adequateProgramsMinFlow3: 80,
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

  // Align with script.js (v2); still read legacy v1 so toggles match the main dashboard.
  const PK_ENROLLMENT_KEY_V2 = "jeffco_include_pk_enrollment_v2";
  const PK_ENROLLMENT_KEY_V1 = "jeffco_include_pk_enrollment_v1";
  const CAPACITY_SOURCE_STORAGE_KEY = "jeffco_capacity_source_v1";
  /** When true, rows without a dollar replacement cost remain visible (audit / gaps). Default off = hide those rows. */
  const SHOW_ROWS_WITHOUT_RC_KEY = "jeffco_profile_show_rows_without_rc_v1";
  const SHOW_ROWS_WITHOUT_RC_DEFAULTS_REV_KEY = "jeffco_show_rows_without_rc_defaults_off_v1";
  const RELEVANT_ROWS_ONLY_LEGACY_KEY = "jeffco_profile_relevant_rows_only_v1";

  function ensureShowRowsWithoutRcDefaultOffOnce() {
    try {
      if (!window.localStorage) return;
      if (window.localStorage.getItem(SHOW_ROWS_WITHOUT_RC_DEFAULTS_REV_KEY)) return;
      window.localStorage.setItem(SHOW_ROWS_WITHOUT_RC_KEY, "0");
      window.localStorage.setItem(SHOW_ROWS_WITHOUT_RC_DEFAULTS_REV_KEY, "1");
    } catch {
      // ignore
    }
  }

  function migrateRowsWithoutRcPreferenceOnce() {
    try {
      if (!window.localStorage) return;
      if (window.localStorage.getItem(SHOW_ROWS_WITHOUT_RC_KEY) !== null) return;
      const leg = window.localStorage.getItem(RELEVANT_ROWS_ONLY_LEGACY_KEY);
      if (leg === "1") {
        window.localStorage.setItem(SHOW_ROWS_WITHOUT_RC_KEY, "0");
      } else if (leg === "0") {
        window.localStorage.setItem(SHOW_ROWS_WITHOUT_RC_KEY, "1");
      } else {
        window.localStorage.setItem(SHOW_ROWS_WITHOUT_RC_KEY, "0");
      }
      window.localStorage.removeItem(RELEVANT_ROWS_ONLY_LEGACY_KEY);
    } catch {
      // ignore
    }
  }

  function getShowRowsWithoutReplacementCost() {
    migrateRowsWithoutRcPreferenceOnce();
    ensureShowRowsWithoutRcDefaultOffOnce();
    try {
      return window.localStorage && window.localStorage.getItem(SHOW_ROWS_WITHOUT_RC_KEY) === "1";
    } catch {
      return false;
    }
  }

  function setShowRowsWithoutReplacementCost(v) {
    try {
      if (window.localStorage) window.localStorage.setItem(SHOW_ROWS_WITHOUT_RC_KEY, v ? "1" : "0");
    } catch {
      // ignore
    }
  }
  function getIncludePKInEnrollment() {
    try {
      if (!window.localStorage) return false;
      const v2 = window.localStorage.getItem(PK_ENROLLMENT_KEY_V2);
      if (v2 === "true" || v2 === "false") return v2 === "true";
      return window.localStorage.getItem(PK_ENROLLMENT_KEY_V1) === "true";
    } catch {
      return false;
    }
  }
  function setIncludePKInEnrollment(v) {
    try {
      if (window.localStorage) window.localStorage.setItem(PK_ENROLLMENT_KEY_V2, v ? "true" : "false");
    } catch {}
  }
  function getCapacitySource() {
    try {
      const v = window.localStorage ? window.localStorage.getItem(CAPACITY_SOURCE_STORAGE_KEY) : null;
      return v === "educational" ? "educational" : "capacity";
    } catch {
      return "capacity";
    }
  }
  function setCapacitySource(v) {
    try {
      if (window.localStorage) window.localStorage.setItem(CAPACITY_SOURCE_STORAGE_KEY, v === "educational" ? "educational" : "capacity");
    } catch {}
  }
  function getEffectiveCapacityDetails(row) {
    const parseNum = (v) => {
      const n = parseFloat((v ?? "").toString().replace(/,/g, "").trim());
      return Number.isFinite(n) ? n : null;
    };
    const source = getCapacitySource();
    const rawCapacity = row ? (row.Capacity ?? row.capacity ?? row["Capacity"] ?? null) : null;
    const rawEducational = row ? (row.EducationalCapacity ?? row["EducationalCapacity"] ?? row["Educational Capacity"] ?? null) : null;
    const capacity = parseNum(rawCapacity);
    const educational = parseNum(rawEducational);
    if (source === "educational") {
      if (Number.isFinite(educational) && educational > 0) {
        return { value: educational, label: "Educational Capacity", source: "educational", missingEducational: false };
      }
      const rawText = (rawEducational ?? "").toString().trim();
      return {
        value: null,
        label: "Educational Capacity",
        source: "educational",
        missingEducational: true,
        note: rawText ? `Educational capacity does not exist (${rawText}).` : "Educational capacity does not exist."
      };
    }
    return {
      value: Number.isFinite(capacity) && capacity > 0 ? capacity : null,
      label: "Capacity",
      source: "capacity",
      missingEducational: false
    };
  }
  function getEffectiveCapacity(row) {
    const d = getEffectiveCapacityDetails(row);
    return d && Number.isFinite(d.value) && d.value > 0 ? d.value : null;
  }

  /** Opt-in: FCI (08_) for gut/new-construction paths only when localStorage is "1". */
  const INCLUDE_FCI_MAJOR_STORAGE_KEY = "includeFciForMajor";
  /** One-time: baseline both asset-settings switches to off for existing profiles. */
  const INCLUDE_FCI_MAJOR_DEFAULTS_REV_KEY = "jeffco_include_fci_major_defaults_off_v1";

  function ensureIncludeFciMajorDefaultOffOnce() {
    try {
      if (!window.localStorage) return;
      if (window.localStorage.getItem(INCLUDE_FCI_MAJOR_DEFAULTS_REV_KEY)) return;
      window.localStorage.setItem(INCLUDE_FCI_MAJOR_STORAGE_KEY, "0");
      window.localStorage.setItem(INCLUDE_FCI_MAJOR_DEFAULTS_REV_KEY, "1");
    } catch {
      // ignore
    }
  }

  function getIncludeFciForMajor() {
    ensureIncludeFciMajorDefaultOffOnce();
    try {
      return !!(window.localStorage && window.localStorage.getItem(INCLUDE_FCI_MAJOR_STORAGE_KEY) === "1");
    } catch {
      return false;
    }
  }
  function getEffectiveEnrollment(row) {
    if (!row) return 0;
    const inc = getIncludePKInEnrollment();
    const e = parseFloat((row.Enrollment2025 ?? row["Enrollment2025"] ?? row.Enrollment ?? row.enrollment ?? "").toString().replace(/,/g, "").trim()) || 0;
    const pk = parseFloat((row.PKEnrollment ?? row["PKEnrollment"] ?? row["PK Enrollment"] ?? "").toString().replace(/,/g, "").trim()) || 0;
    return inc ? e : Math.max(0, e - pk);
  }
  function getEffectiveUtilization(row) {
    if (!row) return null;
    const cap = getEffectiveCapacity(row);
    if (!cap || cap <= 0) return null;
    return getEffectiveEnrollment(row) / cap;
  }

  function parseDecisionEnrollmentTotal(row) {
    if (!row) return null;
    const n = parseFloat((row.Enrollment2025 ?? row["Enrollment2025"] ?? row.Enrollment ?? row.enrollment ?? "").toString().replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : null;
  }

  function parseDecisionPkEnrollment(row) {
    if (!row) return 0;
    const n = parseFloat(
      (row.PKEnrollment ?? row["PKEnrollment"] ?? row["PK Enrollment"] ?? "").toString().replace(/,/g, "").trim()
    );
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function parseDecisionTotalCapacity(row) {
    if (!row) return null;
    const n = parseFloat((row.Capacity ?? row.capacity ?? row["Capacity"] ?? "").toString().replace(/,/g, "").trim());
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function parseDecisionEducationalCapacity(row) {
    if (!row) return null;
    const n = parseFloat(
      (row.EducationalCapacity ?? row["EducationalCapacity"] ?? row["Educational Capacity"] ?? "").toString().replace(/,/g, "").trim()
    );
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function escSchoolMetaHtml(s) {
    return norm(String(s ?? "")).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function schoolMetaItem(label, value) {
    let display;
    if (typeof value === "number" && Number.isFinite(value)) {
      display = value.toLocaleString(DISPLAY_NUMBER_LOCALE);
    } else {
      display = escSchoolMetaHtml(String(value ?? ""));
    }
    return `<span class="school-meta-item"><span class="school-meta-k">${escSchoolMetaHtml(label)}</span>${display}</span>`;
  }

  function buildSchoolDetailsMetaHtml(decision, opts) {
    const {
      resolvedFacilityId,
      resolvedUniqueId,
      status,
      level,
      sqfDisplay,
      resolvedDecisionOutcome,
    } = opts;
    const parts = [];
    const fid = resolvedFacilityId || resolvedUniqueId;
    if (fid) parts.push(schoolMetaItem("JeffCo Facility ID", fid));
    if (status) parts.push(schoolMetaItem("Status", status));
    if (level) parts.push(schoolMetaItem("Level", level));

    const totalCap = decision ? parseDecisionTotalCapacity(decision) : null;
    const eduCap = decision ? parseDecisionEducationalCapacity(decision) : null;
    if (totalCap !== null) parts.push(schoolMetaItem("Total capacity", totalCap));
    if (eduCap !== null) parts.push(schoolMetaItem("Educational capacity", eduCap));

    const totalEnr = decision ? parseDecisionEnrollmentTotal(decision) : null;
    const pkVal = decision ? parseDecisionPkEnrollment(decision) : 0;
    const pkApplicable = pkVal > 0;

    if (pkApplicable) {
      if (totalEnr !== null) parts.push(schoolMetaItem("Total enrollment", totalEnr));
      parts.push(schoolMetaItem("PK enrollment", pkVal));
      if (totalEnr !== null) {
        parts.push(schoolMetaItem("Enrollment without Pre-K", Math.max(0, totalEnr - pkVal)));
      }
    } else if (totalEnr !== null) {
      parts.push(schoolMetaItem("Enrollment", totalEnr));
    }

    if (sqfDisplay) parts.push(schoolMetaItem("SQF", sqfDisplay));
    if (resolvedDecisionOutcome) parts.push(schoolMetaItem("Decision", resolvedDecisionOutcome));

    const sep = '<span class="school-meta-sep" aria-hidden="true"> · </span>';
    return `<div class="school-meta-inline">${parts.join(sep)}</div>`;
  }

  /** Same rules as script.js (this page does not load script.js). */
  function normalizeEnrollmentGrowthThresholdLocal(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0.05;
    if (n > 1 && n <= 100) return n / 100;
    return n;
  }

  function getEnrollmentGrowthThresholdRatioLocal(t) {
    const raw =
      t && t.enrollmentGrowth !== undefined && t.enrollmentGrowth !== null && t.enrollmentGrowth !== ""
        ? t.enrollmentGrowth
        : 0.05;
    return normalizeEnrollmentGrowthThresholdLocal(raw);
  }

  function getEffectiveProjectedEnrollmentLocal(row) {
    if (!row) return null;
    const parse = (v) => {
      const n = parseFloat((v ?? "").toString().replace(/,/g, "").trim());
      return Number.isFinite(n) ? n : null;
    };
    const inc = getIncludePKInEnrollment();
    if (inc) return parse(row["2030_Total"] ?? row["2030 Total"]) ?? null;
    const kPlus = parse(row["2030_K+"] ?? row["2030 K+"]);
    if (kPlus != null) return kPlus;
    const total2030 = parse(row["2030_Total"] ?? row["2030 Total"]);
    if (total2030 == null) return null;
    const pk2030 = parse(row["2030_PK"] ?? row["2030 PK"]);
    const pkPart = pk2030 != null ? pk2030 : 0;
    return Math.max(0, total2030 - pkPart);
  }

  function getEffectiveEnrollmentGrowthLocal(row) {
    if (!row) return null;
    const parse = (v) => {
      const n = parseFloat((v ?? "").toString().replace(/,/g, "").trim());
      return Number.isFinite(n) ? n : null;
    };
    const inc = getIncludePKInEnrollment();
    let current;
    if (inc) {
      current = parse(row.Enrollment2025 ?? row["Enrollment2025"] ?? row.Enrollment ?? row["Enrollment"]) ?? 0;
    } else {
      const pk = parse(row.PKEnrollment ?? row["PKEnrollment"]) ?? 0;
      const total = parse(row.Enrollment2025 ?? row["Enrollment2025"] ?? row.Enrollment ?? row["Enrollment"]) ?? 0;
      current = Math.max(0, total - pk);
    }
    const projected = getEffectiveProjectedEnrollmentLocal(row);
    if (projected == null || !(current > 0)) return null;
    return (projected - current) / current;
  }

  /**
   * Mirror script.js / FlowchartLogic globals so growth threshold + enrollment growth
   * match the main dashboard (same localStorage thresholds; optional #growthSlider if present).
   */
  function installFlowchartParityWindowShims() {
    if (typeof window === "undefined") return;
    window.getIncludePKInEnrollment = getIncludePKInEnrollment;
    window.getEffectiveCapacityDetails = getEffectiveCapacityDetails;
    window.getEffectiveCapacity = getEffectiveCapacity;
    window.getEffectiveEnrollment = getEffectiveEnrollment;
    window.getEffectiveUtilization = getEffectiveUtilization;
    window.getEffectiveProjectedEnrollment = getEffectiveProjectedEnrollmentLocal;
    window.getEffectiveEnrollmentGrowth = getEffectiveEnrollmentGrowthLocal;
    window.normalizeEnrollmentGrowthThreshold = normalizeEnrollmentGrowthThresholdLocal;
    window.getEnrollmentGrowthThresholdRatio = function (t) {
      const norm = window.normalizeEnrollmentGrowthThreshold;
      let raw = null;
      if (typeof document !== "undefined") {
        const el = document.getElementById("growthSlider");
        if (el && el.value != null && String(el.value).trim() !== "") {
          const n = parseFloat(el.value);
          if (Number.isFinite(n)) raw = n / 100;
        }
      }
      if (raw == null && t && t.enrollmentGrowth !== undefined && t.enrollmentGrowth !== null && t.enrollmentGrowth !== "") {
        raw = t.enrollmentGrowth;
      }
      if (raw == null) raw = 0.05;
      return norm ? norm(raw) : raw;
    };
  }
  installFlowchartParityWindowShims();

  /**
   * Capacity/enrollment for flowchart + project table — **not** affected by facility toggles
   * (Include PK / Use Educational Capacity). Those toggles only change header meta via
   * getEffectiveCapacityDetails / getEffectiveEnrollment.
   */
  function getDecisionCapacityDetails(row) {
    const parseNum = (v) => {
      const n = parseFloat((v ?? "").toString().replace(/,/g, "").trim());
      return Number.isFinite(n) ? n : null;
    };
    const rawCapacity = row ? (row.Capacity ?? row.capacity ?? row["Capacity"] ?? null) : null;
    const capacity = parseNum(rawCapacity);
    return {
      value: Number.isFinite(capacity) && capacity > 0 ? capacity : null,
      label: "Capacity",
      source: "capacity",
      missingEducational: false,
    };
  }

  function getDecisionCapacity(row) {
    const d = getDecisionCapacityDetails(row);
    return d && Number.isFinite(d.value) && d.value > 0 ? d.value : null;
  }

  /** Enrollment minus PK (seat-equivalent); stable for utilization vs toggles. */
  function getDecisionEnrollment(row) {
    if (!row) return 0;
    const e = parseFloat((row.Enrollment2025 ?? row["Enrollment2025"] ?? row.Enrollment ?? row.enrollment ?? "").toString().replace(/,/g, "").trim()) || 0;
    const pk =
      parseFloat(
        (row.PKEnrollment ?? row["PKEnrollment"] ?? row["PK Enrollment"] ?? "").toString().replace(/,/g, "").trim()
      ) || 0;
    return Math.max(0, e - pk);
  }

  function getDecisionUtilization(row) {
    if (!row) return null;
    const cap = getDecisionCapacity(row);
    if (!cap || cap <= 0) return null;
    return getDecisionEnrollment(row) / cap;
  }

  /** Projected enrollment for growth calc — excludes PK component when 2030 fields allow it. */
  function getDecisionProjectedEnrollmentLocal(row) {
    if (!row) return null;
    const parse = (v) => {
      const n = parseFloat((v ?? "").toString().replace(/,/g, "").trim());
      return Number.isFinite(n) ? n : null;
    };
    const kPlus = parse(row["2030_K+"] ?? row["2030 K+"]);
    if (kPlus != null) return kPlus;
    const total2030 = parse(row["2030_Total"] ?? row["2030 Total"]);
    if (total2030 == null) return null;
    const pk2030 = parse(row["2030_PK"] ?? row["2030 PK"]);
    const pkPart = pk2030 != null ? pk2030 : 0;
    return Math.max(0, total2030 - pkPart);
  }

  function getDecisionEnrollmentGrowthLocal(row) {
    if (!row) return null;
    const parse = (v) => {
      const n = parseFloat((v ?? "").toString().replace(/,/g, "").trim());
      return Number.isFinite(n) ? n : null;
    };
    const current = getDecisionEnrollment(row);
    const projected = getDecisionProjectedEnrollmentLocal(row);
    if (projected == null || !(current > 0)) return null;
    return (projected - current) / current;
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

  /** Same rules as FlowchartLogic.js `normalizeSchoolLevelFlow` / DecisionLogic distance + util1. */
  function normalizeSchoolLevelFlow(rawLevel) {
    if (!rawLevel) return null;
    const trimmed = rawLevel.toString().trim();
    if (!trimmed) return null;
    const original = trimmed.toLowerCase();
    const cleaned = original.replace(/[^a-z0-9]/g, "");
    if (cleaned.includes("elementary") || cleaned === "es" || original === "elementary") return "elementary";
    if (cleaned.includes("k8")) return "k8";
    if (
      original.includes("k-8") ||
      original.includes("k 8") ||
      original.includes("kthrough8") ||
      /k\s*[-–—]\s*8/i.test(rawLevel)
    ) {
      return "k8";
    }
    if (/^k.*8|8.*k/i.test(cleaned) && cleaned.length <= 5) return "k8";
    if (cleaned.includes("middle") || cleaned === "ms" || original === "middle") return "middle";
    if (cleaned.includes("high") || cleaned === "hs" || original === "high") return "high";
    if (
      cleaned.includes("612") ||
      cleaned.includes("k12") ||
      original.includes("6-12") ||
      original.includes("k-12") ||
      original.includes("6 12") ||
      original.includes("k 12") ||
      original.includes("6through12")
    ) {
      return "k12";
    }
    return null;
  }

  function pickFirstNonEmpty(row, keys) {
    if (!row || !keys) return "";
    for (let i = 0; i < keys.length; i++) {
      const v = row[keys[i]];
      if (v != null && String(v).trim() !== "") return v;
    }
    return "";
  }

  function getDistanceMilesFromRow(row) {
    const raw = pickFirstNonEmpty(row, [
      "DistanceUnderutilizedschools",
      "Distance Underutilized Schools",
      "Distance to Underutilized",
    ]);
    const n = parseFloat(String(raw ?? "").replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : NaN;
  }

  function getDistanceThresholdForSchoolLevelProfile(row, t) {
    let schoolLevelRaw = row["School Level"] || "";
    let level = normalizeSchoolLevelFlow(schoolLevelRaw);
    if (!level && row["Building Name"]) {
      level = normalizeSchoolLevelFlow(row["Building Name"].toString());
    }
    if (level === "elementary") return t.elementaryDistance;
    if (level === "k8") return t.k8Distance;
    if (level === "middle") return t.middleDistance;
    if (level === "high") return t.highDistance;
    if (level === "k12") return t.k12Distance;
    return t.middleDistance || 5.0;
  }

  /** Distance to underutilized / welcoming schools: use values already present on Decision Data Export rows. */

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
    let level = normalizeSchoolLevelFlow(schoolLevelRaw);
    if (!level && (row?.["Building Name"] || row?.BuildingName)) {
      level = normalizeSchoolLevelFlow(row?.["Building Name"] || row?.BuildingName);
    }

    let enrollmentThreshold;
    if (level === "elementary") enrollmentThreshold = t.elementaryEnrollment || 220;
    else if (level === "k8") enrollmentThreshold = t.k8Enrollment || 360;
    else if (level === "middle") enrollmentThreshold = t.middleEnrollment || 500;
    else if (level === "high") enrollmentThreshold = t.highEnrollment || 700;
    else if (level === "k12") enrollmentThreshold = t.k12Enrollment || 600;
    else {
      const candidates = [t.elementaryEnrollment, t.k8Enrollment, t.middleEnrollment, t.highEnrollment, t.k12Enrollment].filter(
        (v) => typeof v === "number"
      );
      enrollmentThreshold =
        candidates.length > 0
          ? candidates.sort((a, b) => a - b)[Math.floor(candidates.length / 2)]
          : t.middleEnrollment || 500;
    }

    const utilizationBelowThreshold = Number.isFinite(utilization) ? utilization < t.utilization : false;
    const enrollmentBelowThreshold = enrollment < enrollmentThreshold;
    return utilizationBelowThreshold || enrollmentBelowThreshold ? "Yes" : "No";
  }

  function evaluateSchoolDecision(row, t = DECISION_THRESHOLDS) {
    if (!row) return "Unknown";
    const util = getEffectiveUtilization(row);
    const util2 = Number.isFinite(util) && util > t.utilizationHigh ? "Yes" : "No";

    const distanceThreshold = getDistanceThresholdForSchoolLevelProfile(row, t);
    const distVal = getDistanceMilesFromRow(row);
    const dist = Number.isFinite(distVal) && distVal <= distanceThreshold ? "Yes" : "No";
    const growthVal = window.getEffectiveEnrollmentGrowth
      ? window.getEffectiveEnrollmentGrowth(row)
      : getEffectiveEnrollmentGrowthLocal(row);
    const growthTh = window.getEnrollmentGrowthThresholdRatio
      ? window.getEnrollmentGrowthThresholdRatio(t)
      : getEnrollmentGrowthThresholdRatioLocal(t);
    const growth = (growthVal != null && Number.isFinite(growthVal)) && growthVal > growthTh ? "Yes" : "No";

    const attendancePct = coercePercent0to100(row.AttendanceAreaEnrollment);
    const attendance = attendancePct >= t.attendanceAreaEnrollment ? "Yes" : "No";
    const eduAdeqPct = Number(row.EducationalAdequacy) * 100;
    const edu2 = Number.isFinite(eduAdeqPct) && eduAdeqPct >= t.adequateProgramsMin ? "Yes" : "No";
    const fac2 = coerceBuildingScore0to10(row.BuildingScore) >= t.buildingThreshold ? "Yes" : "No";
    const expand = (row.SiteCapacity || "").toString().toLowerCase() === "yes" ? "Yes" : "No";

    const fac3_below = coerceBuildingScore0to10(row.BuildingScore) <= t.buildingThresholdBelow ? "Yes" : "No";
    const flow3AdeqMin = t.adequateProgramsMinFlow3 != null ? t.adequateProgramsMinFlow3 : t.adequateProgramsMin;
    const edu3 = Number.isFinite(eduAdeqPct) && eduAdeqPct >= flow3AdeqMin ? "Yes" : "No";
    const below50 = (row["Below50PCTL_EA_Cat"] || "").toString().toLowerCase() === "yes";
    const edu3_2 = below50 ? "Yes" : "No";
    const fac3_above = coerceBuildingScore0to10(row.BuildingScore) >= t.buildingThresholdAbove ? "Yes" : "No";

    const edu4 = edu2;
    const fac4 = coerceBuildingScore0to10(row.BuildingScore) >= t.buildingThresholdFlow4 ? "Yes" : "No";
    const dist4 = dist;

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
      // Match DecisionLogic.js / FlowchartLogic.js: overcrowding (util2) only enters Flow 2 when growth is above threshold.
      if (util2 === "Yes") {
        currentFlow = growth === "Yes" ? 2 : 3;
      } else {
        currentFlow = 3;
      }
    }

    const enrollmentForOverride = getEffectiveEnrollment(row);
    const enrollmentLow =
      Number.isFinite(enrollmentForOverride) && enrollmentForOverride <= 300;
    const cameFromUnderutilizedBranch = util1 === "Yes";
    if (
      (currentFlow === 2 || currentFlow === 3) &&
      enrollmentLow &&
      cameFromUnderutilizedBranch &&
      growth !== "Yes"
    ) {
      currentFlow = 4;
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
          finalDecision = edu3_2 === "Yes" ? "Targeted Capital Investment" : "Standard Maintenance";
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

  /** Lowercase UniqueID for map keys — matches script.js normalizeId / dashboard joins. */
  function normUid(s) {
    return norm(s).toLowerCase();
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

  /**
   * Outcomes that trigger gut/reno and/or new-construction decision paths used to mark every other
   * line as "decision" N/A (include toggle off, condition column N/A). 03_addition was exempt so it
   * could still be planned; campus (04) and modernization (05/06) need the same treatment.
   */
  const DECISION_GUT_OR_NC_PROJECT_SCOPE_CATEGORIES = new Set([
    "01_new construction",
    "02_gut & renovation",
    "03_addition",
    "04_campus upgrade",
    "05_heavy modernization",
    "06_light modernization",
  ]);

  /** AssetTypes where Replacement Cost is labeled (not $). Never applied to 01_new construction / 02_gut & renovation. */
  const SITE_SPECIFIC_REPLACEMENT_ASSET_NAMES = [
    "ADA compliance",
    "New 2-story building",
    "New 3-story building",
    "New auditorium",
    "New gym and locker rooms",
    "New multipurpose room",
    "New cafeteria and kitchen",
    "Heavily modernize gym / assembly space",
    "Modernize kitchen",
    "Heavily modernize cafeteria",
    "Heavily modernize multipurpose room",
    "Lightly modernize cafeteria",
    "Lightly modernize library/media center",
    "Lightly modernize gym / assembly space",
    "Lightly modernize multipurpose room",
  ];
  const SITE_SPECIFIC_REPLACEMENT_PROJECT_KEYS = new Set(
    SITE_SPECIFIC_REPLACEMENT_ASSET_NAMES.map((n) => normProjectKey(n))
  );

  /**
   * Campus lines where Replacement Cost stays "Site specific" until quantity is entered
   * (stored override or CSV). Same rows get editable Unit Value + optional synthetic Poor for costing.
   */
  const MANUAL_QTY_PLANNING_ASSET_KEYS = new Set(
    [
      "Resurface asphalt",
      "Resurface concrete",
      "Campus landscaping upgrade",
      "Expand parking",
      "Front of school branding, landscape upgrades",
      "Improve drop-off / pick-up zone",
      "Playground replacement (ages 2-5)",
      "Playground replacement (ages 5-12)",
    ].map((n) => normProjectKey(n))
  );

  /** Planning defaults when project CSV leaves Unit Value blank (04_campus upgrade playgrounds). */
  const PLAYGROUND_2_5_DEFAULT_SF = 3500;
  const PLAYGROUND_5_12_DEFAULT_SF = 5000;
  const PLAYGROUND_2_5_PK = normProjectKey("Playground replacement (ages 2-5)");
  const PLAYGROUND_5_12_PK = normProjectKey("Playground replacement (ages 5-12)");

  /** Yes/No condition, qty 1 + $ when Good (reference); no 0–1 gradient bar. */
  const CAMPUS_YES_NO_REFERENCE_ASSET_KEYS = new Set(
    ["Add shade structure(s)", "New outdoor classroom"].map((n) => normProjectKey(n))
  );

  function manualPlanningAssetKey(row) {
    return normProjectKey(row?.AssetType ?? row?.["Asset Type"] ?? row?.["Project"] ?? row?.assetType ?? "");
  }

  function isPlaygroundPlanningAssetRow(row) {
    const pk = manualPlanningAssetKey(row);
    return pk === PLAYGROUND_2_5_PK || pk === PLAYGROUND_5_12_PK;
  }

  function isCampusYesNoReferenceAssetRow(row) {
    return CAMPUS_YES_NO_REFERENCE_ASSET_KEYS.has(manualPlanningAssetKey(row));
  }

  /** Matches the condition column when it shows "Yes" for shade / outdoor classroom (Good in source data). */
  function campusYesNoReferenceRowShowsYes(row) {
    if (!isCampusYesNoReferenceAssetRow(row)) return false;
    return norm(row?.ConditionScore || row?.__libraryScore || "").toLowerCase() === "good";
  }

  /** Display labels only (library + project CSV keep canonical AssetType strings). */
  const PROJECT_TYPE_DISPLAY_LABEL_BY_ASSET_PK = new Map([
    [normProjectKey("Front of school branding, landscape upgrades"), "Front of school branding, curb appeal"],
  ]);

  function displayProjectTypeLabel(row) {
    if (!row) return "";
    const pk = manualPlanningAssetKey(row);
    const mapped = PROJECT_TYPE_DISPLAY_LABEL_BY_ASSET_PK.get(pk);
    if (mapped) return mapped;
    return row.AssetType ?? row["AssetType"] ?? "";
  }

  /** Drop costing stub quantity "1" for acres / parking when user did not save an override (still shows Site specific). */
  function stripManualPlanningStubQuantity(rows) {
    (rows || []).forEach((r) => {
      if (!manualPlanningUnitAllowsInput(r)) return;
      // Only campus/site manual-planning rows — do not strip authored CSV totals on other EA/qty lines (e.g. FCI deficiency).
      if (!isManualQtyPlanningAssetRow(r)) return;
      const key = getRowKey(r);
      const leg = getRowKeyLegacy(r);
      const hasOv =
        (key && Object.prototype.hasOwnProperty.call(manualQtyOverrides || {}, key)) ||
        (leg && leg !== key && Object.prototype.hasOwnProperty.call(manualQtyOverrides || {}, leg));
      if (hasOv) {
        const st = manualQtyOverrides[key] ?? manualQtyOverrides[leg];
        if (st !== null && st !== undefined && st !== "" && Number(st) > 0) return;
      }
      const raw = norm(getRawUnitValue(r));
      if (raw !== "1") return;
      const u = normalizeUnit(r?.Unit, r?.UnitCost).toUpperCase();
      if (isSquareFootMeasureUnit(u)) return;
      r.UnitValue = "";
      r.ReplacementCost = "";
    });
  }

  function isSiteSpecificReplacementRow(row) {
    const sys = norm(row?.SystemCategory);
    if (sys === "01_new construction" || sys === "02_gut & renovation") return false;
    const pk = normProjectKey(row?.AssetType);
    return !!pk && SITE_SPECIFIC_REPLACEMENT_PROJECT_KEYS.has(pk);
  }

  /**
   * Campus manual-qty assets (resurface, playgrounds, …) plus SF-based rows whose Replacement Cost
   * is labeled “Site specific” from the unit-cost library (additions, modernizations, etc.).
   */
  function isManualQtyPlanningAssetRow(row) {
    if (!row || row.__isRollup) return false;
    if (MANUAL_QTY_PLANNING_ASSET_KEYS.has(manualPlanningAssetKey(row))) return true;
    if (isSiteSpecificReplacementRow(row) && isSquareFootMeasureUnit(normalizeUnit(row?.Unit, row?.UnitCost))) {
      return true;
    }
    return false;
  }

  function applySiteSpecificReplacementCostLabels(rows) {
    (rows || []).forEach((r) => {
      if (!isSiteSpecificReplacementRow(r)) return;
      // Still show the label when decision/unresolved excludes $ totals (__excludedFromTotals).
      if (norm(r?.ConditionScore || r?.__libraryScore).toLowerCase() === "good") return;
      if (r.__excludedReason === "heavy_mod") return;
      if (/not included/i.test(norm(r?.ReplacementCost))) return;
      // Keep numeric $ only when quantity meaningfully drives display here (non–manual-qty site-specific rows).
      const dollars = parseNumberMaybe(r?.ReplacementCost);
      if (dollars !== null && Number.isFinite(dollars)) return;
      r.ReplacementCost = RC_PLACEHOLDER;
    });
  }

  /**
   * Campus / site-specific planning rows: Replacement Cost stays "Site specific" until the user saves a quantity
   * in this browser (room schedule & CSV may still show SF/qty in Unit Value). After reset, RC returns here even when UV matches defaults.
   * Playgrounds use built-in planning defaults (3,500 / 5,000 SF): those quantities unlock $ from condition scoring without a browser override.
   */
  function applyManualQtySiteSpecificLabels(rows) {
    (rows || []).forEach((r) => {
      if (!isManualQtyPlanningAssetRow(r)) return;
      if (norm(r?.ConditionScore || r?.__libraryScore).toLowerCase() === "good") return;
      if (r.__excludedReason === "heavy_mod") return;
      if (/not included/i.test(norm(r?.ReplacementCost))) return;
      if (hasManualPlanningQtyOverrideStored(r)) return;
      const q = getUnitValueNumber(r);
      if (isPlaygroundPlanningAssetRow(r) && q !== null && Number.isFinite(q) && q > 0) return;
      r.ReplacementCost = RC_PLACEHOLDER;
    });
  }

  function formatManualQtyDisplayForRow(row, n) {
    const u = normalizeUnit(row?.Unit, row?.UnitCost).toUpperCase();
    if (u === "ACRE" || u === "ACRES") return formatLocaleDecimal(n, 0, 2);
    return formatLocaleInt(Math.round(n));
  }

  function hydrateManualQtyOverrides(rows) {
    (rows || []).forEach((r) => {
      if (!manualPlanningUnitAllowsInput(r)) return;
      const key = getRowKey(r);
      const leg = getRowKeyLegacy(r);
      const stored =
        (key && Object.prototype.hasOwnProperty.call(manualQtyOverrides || {}, key) ? manualQtyOverrides[key] : null) ??
        (leg && leg !== key && Object.prototype.hasOwnProperty.call(manualQtyOverrides || {}, leg) ? manualQtyOverrides[leg] : null);
      if (stored === null || stored === undefined) return;
      if (stored === "") {
        r.UnitValue = "";
        return;
      }
      const n = Number(stored);
      if (Number.isFinite(n) && n > 0) {
        r.UnitValue = formatManualQtyDisplayForRow(r, n);
      }
    });
  }

  /** Default SF for playground lines when CSV quantity is blank or non-positive (editable like other planning SF). */
  function hydratePlaygroundDefaultPlanningSf(rows) {
    (rows || []).forEach((r) => {
      if (!isPlaygroundPlanningAssetRow(r)) return;
      if (hasManualPlanningQtyOverrideStored(r)) return;
      const u = normalizeUnit(r?.Unit, r?.UnitCost).toUpperCase();
      if (!isSquareFootMeasureUnit(u)) return;
      const q = getUnitValueNumber(r);
      if (q !== null && Number.isFinite(q) && q > 0) return;
      const pk = manualPlanningAssetKey(r);
      const n = pk === PLAYGROUND_2_5_PK ? PLAYGROUND_2_5_DEFAULT_SF : PLAYGROUND_5_12_DEFAULT_SF;
      r.UnitValue = formatLocaleInt(Math.round(n));
    });
  }

  function loadManualQtyOverrides() {
    try {
      if (!window.localStorage) return {};
      let raw = window.localStorage.getItem(MANUAL_QTY_OVERRIDES_STORAGE_KEY);
      if (!raw) {
        const legacy = window.localStorage.getItem(LEGACY_RESURFACE_SF_STORAGE_KEY);
        if (legacy) {
          window.localStorage.setItem(MANUAL_QTY_OVERRIDES_STORAGE_KEY, legacy);
          raw = legacy;
        }
      }
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveManualQtyOverrides() {
    try {
      if (!window.localStorage) return;
      window.localStorage.setItem(MANUAL_QTY_OVERRIDES_STORAGE_KEY, JSON.stringify(manualQtyOverrides || {}));
    } catch {
      // ignore
    }
  }

  function manualPlanningUnitAllowsInput(row) {
    const u = normalizeUnit(row?.Unit, row?.UnitCost).toUpperCase();
    if (!u || u === "PERCENT" || u === "PERCENTAGE" || u === "%") return false;
    return (
      isSquareFootMeasureUnit(u) ||
      u === "ACRE" ||
      u === "ACRES" ||
      u === "QUANTITY" ||
      u === "EA" ||
      u === "EACH"
    );
  }

  function manualQtyPlaceholder(row) {
    const u = normalizeUnit(row?.Unit, row?.UnitCost).toUpperCase();
    if (isSquareFootMeasureUnit(u)) return "SF";
    if (u === "ACRE" || u === "ACRES") return "Acres";
    return "Qty";
  }

  /** Any non-rollup row with a countable planning unit (SF, qty, EA, acres) may override Unit Value in localStorage. */
  function manualPlanningQtyCellEditable(row) {
    if (!row || row.__isRollup) return false;
    if (row.__excludedFromTotals) return false;
    if (!manualPlanningUnitAllowsInput(row)) return false;
    if (norm(row.__excludedReason) === "heavy_mod") return false;
    if (norm(row.__excludedReason) === "decision") return false;
    const rc = norm(row?.ReplacementCost);
    if (/not included/i.test(rc)) return false;
    return true;
  }

  /** User saved a planning quantity (localStorage) — not schedule/CSV-only. */
  function hasManualPlanningQtyOverrideStored(row) {
    const key = getRowKey(row);
    const leg = getRowKeyLegacy(row);
    if (!manualQtyOverrides) return false;
    const st =
      (key && Object.prototype.hasOwnProperty.call(manualQtyOverrides, key) ? manualQtyOverrides[key] : null) ??
      (leg && leg !== key && Object.prototype.hasOwnProperty.call(manualQtyOverrides, leg) ? manualQtyOverrides[leg] : null);
    if (st === null || st === undefined || st === "") return false;
    const n = Number(st);
    return Number.isFinite(n) && n > 0;
  }

  function syncManualPlanningQtyPrefilledClass(inp, row) {
    if (!inp) return;
    if (!norm(inp.value)) {
      inp.classList.remove("manual-planning-qty-input--prefilled");
      return;
    }
    if (row && hasManualPlanningQtyOverrideStored(row)) {
      inp.classList.remove("manual-planning-qty-input--prefilled");
    } else {
      inp.classList.add("manual-planning-qty-input--prefilled");
    }
  }

  function createManualPlanningQtyInput(r) {
    const inp = document.createElement("input");
    inp.type = "text";
    inp.className = "manual-planning-qty-input resurface-sf-input";
    inp.setAttribute("aria-label", "Planning quantity (" + manualQtyPlaceholder(r) + ")");
    inp.setAttribute("placeholder", manualQtyPlaceholder(r));
    inp.inputMode = "decimal";
    const uvStart = getUnitValueNumber(r);
    const uMu = normalizeUnit(r?.Unit, r?.UnitCost).toUpperCase();
    inp.value =
      uvStart !== null && Number.isFinite(uvStart) && uvStart > 0
        ? uMu === "ACRE" || uMu === "ACRES"
          ? String(uvStart)
          : String(Math.round(uvStart))
        : "";
    let qtyDirty = false;
    syncManualPlanningQtyPrefilledClass(inp, r);
    let qtyRecalcDebounce = null;
    const rowKeyLegacy = getRowKeyLegacy(r);
    inp.addEventListener("input", () => {
      qtyDirty = true;
      if (norm(inp.value)) inp.classList.remove("manual-planning-qty-input--prefilled");
      else syncManualPlanningQtyPrefilledClass(inp, r);
      if (qtyRecalcDebounce) clearTimeout(qtyRecalcDebounce);
      qtyRecalcDebounce = setTimeout(() => {
        qtyRecalcDebounce = null;
        const key = getRowKey(r);
        if (!key) return;
        const raw = norm(inp.value);
        if (!raw) return;
        const n = parseNumberMaybe(raw);
        if (n === null || !Number.isFinite(n) || n <= 0) return;
        manualQtyOverrides[key] = n;
        saveManualQtyOverrides();
        refreshSchoolDataAfterManualQtyEdit();
      }, 420);
    });
    inp.addEventListener("blur", () => {
      if (qtyRecalcDebounce) {
        clearTimeout(qtyRecalcDebounce);
        qtyRecalcDebounce = null;
      }
      const key = getRowKey(r);
      if (!key) return;
      const raw = norm(inp.value);
      if (!raw) {
        let removed = false;
        if (Object.prototype.hasOwnProperty.call(manualQtyOverrides, key)) {
          delete manualQtyOverrides[key];
          removed = true;
        }
        if (rowKeyLegacy && rowKeyLegacy !== key && Object.prototype.hasOwnProperty.call(manualQtyOverrides, rowKeyLegacy)) {
          delete manualQtyOverrides[rowKeyLegacy];
          removed = true;
        }
        if (removed) saveManualQtyOverrides();
        qtyDirty = false;
        syncManualPlanningQtyPrefilledClass(inp, r);
        refreshSchoolDataAfterManualQtyEdit();
        return;
      }
      const n = parseNumberMaybe(raw);
      if (n === null || !Number.isFinite(n) || n <= 0) {
        const fromStore =
          manualQtyOverrides[key] ??
          (rowKeyLegacy && rowKeyLegacy !== key ? manualQtyOverrides[rowKeyLegacy] : undefined);
        const base =
          fromStore !== undefined && fromStore !== "" ? Number(fromStore) : getUnitValueNumber(r);
        inp.value =
          base !== null && Number.isFinite(base) && base > 0 ? String(Math.round(base)) : "";
        qtyDirty = false;
        syncManualPlanningQtyPrefilledClass(inp, r);
        refreshSchoolDataAfterManualQtyEdit();
        return;
      }
      if (qtyDirty) {
        manualQtyOverrides[key] = n;
        saveManualQtyOverrides();
      }
      qtyDirty = false;
      refreshSchoolDataAfterManualQtyEdit();
    });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        inp.blur();
      }
    });
    return inp;
  }

  function refreshSchoolDataAfterManualQtyEdit() {
    if (!selectedSchoolUids.size) return;
    if (selectedSchoolUids.size === 1) {
      const uid0 = Array.from(selectedSchoolUids)[0];
      if (uid0.startsWith("name:")) setSelectedSchool("", uid0.slice(5));
      else setSelectedSchool(uid0, norm(decisionByUid.get(uid0)?.["Building Name"]) || "");
      return;
    }
    applyMultiSchoolSelection();
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

  const MODERNIZE_STEM_SF_BUCKET = normalizeRoomCategory("modernize STEM/specialized labs");

  /** Roll all STEM/CTE/specialized-lab CostEstimateLink strings into one SF total. */
  function scheduleCostLinkToSfBucket(categoryNorm) {
    if (!categoryNorm) return categoryNorm;
    const isStemLabsLink =
      categoryNorm.includes("modernize") &&
      (categoryNorm.includes("stem") || categoryNorm.includes("cte")) &&
      (categoryNorm.includes("specialized lab") || categoryNorm.includes(" lab"));
    if (isStemLabsLink) return MODERNIZE_STEM_SF_BUCKET;
    return categoryNorm;
  }

  /**
   * AssetType (project list) → normalized CostEstimateLink bucket text found in the room schedule.
   * Heavy/light pairs that share one schedule phrase both receive the same summed SF (no split).
   * 03_addition / 04_campus: bucket matches normalizeRoomCategory(Project) — tag rooms with that phrase in CostEstimateLink.
   */
  function buildScheduleSfBucketByProjectKey() {
    const m = new Map();
    const put = (assetName, schedulePhrase) => {
      m.set(normProjectKey(assetName), normalizeRoomCategory(schedulePhrase));
    };
    const putSelf = (assetName) => put(assetName, assetName);

    put("Heavily modernize admin", "modernize admin");
    put("Lightly modernize admin", "modernize admin");
    put("Heavily modernize cafeteria", "modernize cafeteria");
    put("Lightly modernize cafeteria", "modernize cafeteria");
    put("Heavily modernize classrooms", "modernize classrooms");
    put("Lightly modernize classrooms", "modernize classrooms");
    put("Lightly modernize corridors", "modernize corridors");
    put("Heavily modernize gym / assembly space", "modernize gym / assembly space");
    put("Lightly modernize gym / assembly space", "modernize gym / assembly space");
    put("Modernize kitchen", "modernize kitchen");
    put("Heavily modernize multipurpose room", "modernize multipurpose room");
    put("Lightly modernize multipurpose room", "modernize multipurpose room");
    put("Lightly modernize library/media center", "modernize library/media center");
    put("Heavily modernize restrooms", "modernize restrooms");
    put("Heavily modernize STEM / CTE / specialized labs (MS/HS)", "modernize STEM/specialized labs");

    putSelf("New 2-story building");
    putSelf("New 3-story building");
    putSelf("New auditorium");
    putSelf("New gym and locker rooms");
    putSelf("New multipurpose room");
    putSelf("New cafeteria and kitchen");

    putSelf("Playground replacement (ages 2-5)");
    putSelf("Playground replacement (ages 5-12)");
    putSelf("Resurface asphalt");
    putSelf("Resurface concrete");

    put("Lightly modernize entry lobby", "modernize entry lobby");

    return m;
  }

  const SCHEDULE_SF_BUCKET_BY_PROJECT_KEY = buildScheduleSfBucketByProjectKey();

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

  function buildRoomScheduleSfTotals(rows) {
    const idx = buildRoomScheduleIndex(rows);
    if (!idx.areaKey || !idx.categoryKey) {
      console.warn("Room schedule: missing AREA or CostEstimateLink column for SF totals.", idx);
      return new Map();
    }

    const allowedBuckets = new Set();
    SCHEDULE_SF_BUCKET_BY_PROJECT_KEY.forEach((bucket) => allowedBuckets.add(bucket));

    const out = new Map();
    const ensureMaps = (bucket) => {
      if (!out.has(bucket)) out.set(bucket, { byUid: new Map(), byFacility: new Map() });
      return out.get(bucket);
    };

    (rows || []).forEach((r) => {
      const categoryRaw = norm(getRoomScheduleFieldValue(r, idx.categoryKey));
      if (!categoryRaw) return;
      const categoryNorm = normalizeRoomCategory(categoryRaw);
      if (!categoryNorm) return;
      const bucket = scheduleCostLinkToSfBucket(categoryNorm);
      if (!allowedBuckets.has(bucket)) return;

      const area = parseNumberMaybe(getRoomScheduleFieldValue(r, idx.areaKey));
      if (area === null || !Number.isFinite(area)) return;

      const maps = ensureMaps(bucket);
      if (idx.campusKey) {
        const u = normUid(getRoomScheduleFieldValue(r, idx.campusKey));
        if (u) maps.byUid.set(u, (maps.byUid.get(u) || 0) + area);
      }
      if (idx.facilityKey) {
        const facilityRaw = norm(getRoomScheduleFieldValue(r, idx.facilityKey));
        const fk = normalizeFacilityName(facilityRaw);
        if (fk) maps.byFacility.set(fk, (maps.byFacility.get(fk) || 0) + area);
      }
    });

    return out;
  }

  /** Copy project UniqueID → SF when schedule Campus Code ≠ project uid but Facility Name matches SchoolName. */
  function syncScheduleCategorySfUidsFromProjectList(byUidMap, byFacilityMap) {
    rowwiseByUid.forEach((rows, uid) => {
      const u = normUid(uid);
      if (!u || !rows || !rows.length) return;
      const existing = byUidMap.get(u);
      if (existing != null && Number.isFinite(existing) && existing > 0) return;
      const sn = norm(rows[0]?.SchoolName ?? rows[0]?.["School Name"]);
      if (!sn) return;
      const fk = normalizeFacilityName(sn);
      const sf = fk ? byFacilityMap.get(fk) : null;
      if (sf != null && Number.isFinite(sf) && sf > 0) byUidMap.set(u, sf);
    });
  }

  function getScheduleCategorySfFromMaps(uid, schoolName, decisionRow, projectListSchoolName, byUidMap, byFacilityMap) {
    const u = normUid(uid);
    if (u) {
      const n = byUidMap.get(u);
      if (n != null && Number.isFinite(n) && n > 0) return n;
    }
    const tryFacility = (raw) => {
      const fk = normalizeFacilityName(raw);
      if (!fk) return null;
      const n = byFacilityMap.get(fk);
      return n != null && Number.isFinite(n) && n > 0 ? n : null;
    };
    if (projectListSchoolName) {
      const n = tryFacility(projectListSchoolName);
      if (n != null) return n;
    }
    if (schoolName) {
      const n = tryFacility(schoolName);
      if (n != null) return n;
    }
    if (decisionRow) {
      const n = tryFacility(decisionRow?.["Building Name"] ?? decisionRow?.BuildingName ?? "");
      if (n != null) return n;
    }
    return null;
  }

  function getScheduleSfForMappedProjectRow(row, uid, schoolName, decisionRow, projectListSchoolName) {
    const pk = normProjectKey(norm(row?.AssetType));
    const bucket = SCHEDULE_SF_BUCKET_BY_PROJECT_KEY.get(pk);
    if (!bucket) return null;
    const maps = roomScheduleSfByBucket.get(bucket);
    if (!maps) return null;
    return getScheduleCategorySfFromMaps(
      uid,
      schoolName,
      decisionRow,
      projectListSchoolName,
      maps.byUid,
      maps.byFacility
    );
  }

  /** Room schedule summed AREA → Unit Value when CostEstimateLink maps to this AssetType (any system category). */
  function hydrateScheduleSfIntoUnitValue(row, uid, schoolName, decisionRow, projectListSchoolName) {
    if (hasManualPlanningQtyOverrideStored(row)) return;
    const sf = getScheduleSfForMappedProjectRow(row, uid, schoolName, decisionRow, projectListSchoolName);
    if (sf != null && Number.isFinite(sf) && sf > 0) {
      row.UnitValue = formatLocaleInt(Math.round(sf));
    }
  }

  function applyRoomScheduleUnitValues(rows, uid, schoolName, decisionRow, projectListSchoolName) {
    if (!rows || !rows.length) return;
    rows.forEach((r) => {
      if (hasManualPlanningQtyOverrideStored(r)) return;
      const sum = getScheduleSfForMappedProjectRow(r, uid, schoolName, decisionRow, projectListSchoolName);
      if (sum == null) return;
      const rounded = Math.round(sum);
      r.UnitValue = Number.isFinite(rounded) ? formatLocaleInt(rounded) : r.UnitValue;
    });
  }

  /** Normalized AssetType keys omitted from the project sheet (may still exist in source extracts). */
  const EXCLUDED_PROJECT_SHEET_ASSET_KEYS = new Set(
    ["Hazmat remediation", "Exterior paint entire campus"].map((n) => normProjectKey(n))
  );

  /** Project-sheet lines removed from dashboard (still may exist in source extracts). */
  function isExcludedFromProjectSheetRow(r) {
    const pk = normProjectKey(r?.AssetType ?? r?.["Asset Type"] ?? r?.assetType ?? "");
    return !!pk && EXCLUDED_PROJECT_SHEET_ASSET_KEYS.has(pk);
  }

  function buildRowwiseIndex(rows) {
    rowwiseByUid = new Map();
    rowwiseByNameKey = new Map();
    facilityIdByUid = new Map();
    const nameToUid = new Map();
    const filtered = (rows || []).filter((r) => !isExcludedFromProjectSheetRow(r));
    filtered.forEach((r) => {
      const uid = normUid(r["UniqueID"] ?? r.UniqueID);
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
    filtered.forEach((r) => {
      const uid = normUid(r["UniqueID"] ?? r.UniqueID);
      if (uid) return;
      const name = norm(r["SchoolName"] ?? r.SchoolName);
      const linked = name ? nameToUid.get(name) : null;
      if (linked && rowwiseByUid.has(linked)) {
        rowwiseByUid.get(linked).push(r);
      }
    });
  }

  function getRowwiseRowsForSelection(uid, name) {
    const u = normUid(uid);
    if (u && rowwiseByUid.has(u)) return rowwiseByUid.get(u);
    const n = norm(name);
    if (n) {
      const byProjName = rowwiseByNameKey.get(normName(n)) || [];
      if (byProjName.length) return byProjName;
      const dec = decisionByNameKey.get(normName(n));
      const uidFromDec = dec ? normUid(dec["UniqueID"] ?? dec.UniqueID) : "";
      if (uidFromDec && rowwiseByUid.has(uidFromDec)) return rowwiseByUid.get(uidFromDec);
    }
    return [];
  }

  function makeUnitCostKey(systemCategory, projectOrAssetType) {
    return `${normKeyLoose(systemCategory)}||${normProjectKey(projectOrAssetType)}`;
  }

  /** Thousand separators for displayed numbers (fixed locale). */
  const DISPLAY_NUMBER_LOCALE = "en-US";

  function formatLocaleInt(n) {
    if (!Number.isFinite(n)) return "";
    return Math.round(n).toLocaleString(DISPLAY_NUMBER_LOCALE);
  }

  function formatLocaleUsdInteger(n) {
    if (!Number.isFinite(n)) return "";
    return `$${Math.round(n).toLocaleString(DISPLAY_NUMBER_LOCALE)}`;
  }

  function formatLocaleDecimal(n, minFrac = 0, maxFrac = 2) {
    if (!Number.isFinite(n)) return "";
    return n.toLocaleString(DISPLAY_NUMBER_LOCALE, { minimumFractionDigits: minFrac, maximumFractionDigits: maxFrac });
  }

  function isMultipurposeRoomAsset(row) {
    if (!row) return false;
    const a = norm(row.AssetType).toLowerCase();
    return a.includes("multipurpose");
  }

  function isHeavilyModernizeCafeteriaRow(row) {
    if (!row) return false;
    return normProjectKey(row.AssetType) === normProjectKey("Heavily modernize cafeteria");
  }

  function isHeavilyModernizeGymAssemblyRow(row) {
    if (!row) return false;
    return normProjectKey(row.AssetType) === normProjectKey("Heavily modernize gym / assembly space");
  }

  /** Multipurpose modernization rows show "-" instead of "does not apply". */
  function doesNotApplyConditionDisplay(row) {
    return isMultipurposeRoomAsset(row) ? "-" : "does not apply";
  }

  /** @param {unknown} raw @param {object} [row] — when set, multipurpose + “does not apply” displays as "-" */
  function formatDisplayQuantityCell(raw, row) {
    const s = norm(raw);
    if (!s) return s;
    const n = parseNumberMaybe(s);
    if (n === null || !Number.isFinite(n)) {
      if (row && isMultipurposeRoomAsset(row) && /does not apply/i.test(s)) {
        return "-";
      }
      return s;
    }
    const isInt = Math.abs(n - Math.round(n)) < 1e-9;
    return isInt ? formatLocaleInt(n) : formatLocaleDecimal(n, 0, 6);
  }

  function formatDisplayReplacementCell(raw) {
    const s = norm(raw);
    if (!s) return s;
    if (/not included/i.test(s)) return s;
    if (isReplacementCostPlaceholder(s)) return RC_PLACEHOLDER;
    const n = parseNumberMaybe(s);
    if (n === null || !Number.isFinite(n)) return s;
    return formatLocaleUsdInteger(n);
  }

  function formatDisplayUnitCostCell(raw) {
    const s = norm(raw);
    if (!s) return s;
    if (/site specific/i.test(s)) return RC_PLACEHOLDER;
    const slash = s.indexOf("/");
    if (slash >= 0) {
      const prefix = s.slice(0, slash).trim();
      const suffix = s.slice(slash);
      const n = parseNumberMaybe(prefix);
      if (n === null || !Number.isFinite(n)) return s;
      const isInt = Math.abs(n - Math.round(n)) < 1e-9;
      const mid = isInt ? formatLocaleDecimal(n, 0, 0) : formatLocaleDecimal(n, 0, 2);
      return `$${mid}${suffix}`;
    }
    const n = parseNumberMaybe(s);
    if (n !== null && Number.isFinite(n)) {
      const isInt = Math.abs(n - Math.round(n)) < 1e-9;
      return isInt ? `$${formatLocaleDecimal(n, 0, 0)}` : `$${formatLocaleDecimal(n, 0, 2)}`;
    }
    return s;
  }

  function formatCsvCost(raw) {
    const n = parseNumberMaybe(raw);
    if (n !== null && Number.isFinite(n)) {
      const isInt = Math.abs(n - Math.round(n)) < 1e-9;
      return isInt ? formatLocaleUsdInteger(n) : `$${formatLocaleDecimal(n, 2, 2)}`;
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
      if (n !== null) {
        const isInt = Math.abs(n - Math.round(n)) < 1e-9;
        const mid = isInt ? formatLocaleDecimal(n, 0, 0) : formatLocaleDecimal(n, 0, 2);
        cost = `$${mid}`;
      }
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
      const uid = normUid(r["UniqueID"] ?? r.UniqueID);
      if (uid) set.add(uid);
    });
    return set;
  }

  /** Short CSV AssetType for paired heavy/light spaces → index row under both library project keys. */
  const PAIRED_MODERNIZE_ASSET_SHORT = [
    { short: "Modernize admin", heavy: "Heavily modernize admin", light: "Lightly modernize admin" },
    { short: "Modernize classrooms", heavy: "Heavily modernize classrooms", light: "Lightly modernize classrooms" },
    { short: "Modernize gym / assembly space", heavy: "Heavily modernize gym / assembly space", light: "Lightly modernize gym / assembly space" },
    { short: "Modernize cafeteria", heavy: "Heavily modernize cafeteria", light: "Lightly modernize cafeteria" },
    { short: "Modernize multipurpose room", heavy: "Heavily modernize multipurpose room", light: "Lightly modernize multipurpose room" },
  ];

  function expandRowwiseAssetTypeIndexKeys(assetTypeRaw) {
    const pkOne = normProjectKey(norm(assetTypeRaw));
    if (!pkOne) return [];
    for (let i = 0; i < PAIRED_MODERNIZE_ASSET_SHORT.length; i++) {
      const pair = PAIRED_MODERNIZE_ASSET_SHORT[i];
      if (normProjectKey(pair.short) === pkOne) {
        const h = normProjectKey(pair.heavy);
        const l = normProjectKey(pair.light);
        const out = [];
        if (h) out.push(h);
        if (l) out.push(l);
        return out.length ? out : [pkOne];
      }
    }
    return [pkOne];
  }

  function buildRowsFromRowwise(rawSchoolRows) {
    if (!rawSchoolRows || !rawSchoolRows.length) return [];
    const uid = normUid(rawSchoolRows[0]["UniqueID"] ?? rawSchoolRows[0].UniqueID);
    const school = norm(rawSchoolRows[0]["SchoolName"] ?? rawSchoolRows[0].SchoolName);

    // Index the raw rows by normalized project key. Multiple rows per key
    // are possible when the same project has entries for different priorities.
    const byPk = new Map();
    rawSchoolRows.forEach((r) => {
      const keys = expandRowwiseAssetTypeIndexKeys(r.AssetType ?? r["AssetType"]);
      keys.forEach((pk) => {
        if (!pk) return;
        if (!byPk.has(pk)) byPk.set(pk, []);
        byPk.get(pk).push(r);
      });
    });

    const out = [];
    let rowId = 0;

    const consumedPks = new Set();

    // Pass 1: SystemCategory comes from UnitCostLibrary; CSV SystemCategory is ignored (match is AssetType only).
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
        const csvUnitSemantic = match ? norm(match.Unit ?? match["Unit"]) : "";
        const scoreVal = match ? norm(match.ConditionScore ?? match["ConditionScore"]) : "";
        const pv = match ? norm(match.UnitValue ?? match["UnitValue"]) : "";
        const source = match ? norm(match.ConditionSource ?? match["ConditionSource"]) : "";
        const csvPriority = match ? norm(match.PriorityScore ?? match["PriorityScore"]) : "";
        const csvReplacementCost = match ? norm(match.ReplacementCost ?? match["ReplacementCost"]) : "";

        const unit = norm(lib?.unit);
        const unitCost = norm(lib?.unitCost);
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
          __csvUnitSemantic: csvUnitSemantic,
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
          __csvUnitSemantic: csvUnit,
          __csvPriority: validCsvPriority,
          __rowId: rowId++,
        });
      });
    }

    return out;
  }

  function buildDecisionIndexes(rows) {
    decisionByUid = new Map();
    decisionByNameKey = new Map();
    (rows || []).forEach((r) => {
      const uid = normUid(r["UniqueID"] ?? r.UniqueID);
      const name = norm(r["Building Name"] ?? r.BuildingName ?? r["BuildingName"]);
      if (uid) decisionByUid.set(uid, r);
      const nk = normName(name);
      if (nk && !decisionByNameKey.has(nk)) decisionByNameKey.set(nk, r);
    });
  }

  function setSelectedSchool(uid, name) {
    resolvedUniqueId = uid ? normUid(uid) : "";
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

    const status = norm(decision?.Status);
    const level = norm(decision?.["School Level"]);
    const sqfRaw = norm(
      decision?.[" SquareFt "] ??
        decision?.SquareFt ??
        decision?.["SquareFt"] ??
        decision?.["Square Ft"] ??
        decision?.["Sq Ft"] ??
        decision?.["SqFt"]
    );
    const sqfNum = sqfRaw ? Number(sqfRaw.replace(/,/g, "")) : NaN;
    const sqf = Number.isFinite(sqfNum) ? sqfNum.toLocaleString(DISPLAY_NUMBER_LOCALE) : sqfRaw;

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

    // Building addition planning — rendered under 03_addition group
    additionPlanningState.show = false;
    additionPlanningState.studentsOver = null;
    additionPlanningState.gsfTarget = null;
    additionPlanningState.selectedKey = null;
    additionPlanningState.stories = loadAdditionStoriesForSchool(resolvedUniqueId);
    additionPlanningState.collapsed = loadAdditionCollapsedForSchool(resolvedUniqueId);

    const isBuildingAdditionDecision = (resolvedDecisionOutcome || "").includes("Building Addition");
    if (decision && isBuildingAdditionDecision) {
      const enrollment = getDecisionEnrollment(decision);
      const capacity = getDecisionCapacity(decision);
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

    const resolvedFacilityId = resolvedUniqueId ? facilityIdByUid.get(resolvedUniqueId) : "";
    elSchoolMeta.innerHTML = buildSchoolDetailsMetaHtml(decision || null, {
      resolvedFacilityId,
      resolvedUniqueId,
      status,
      level,
      sqfDisplay: sqf,
      resolvedDecisionOutcome,
    });

    // Get all rowwise records for this school, then build profile rows.
    const rawSchoolRows = getRowwiseRowsForSelection(resolvedUniqueId, resolvedSchoolName);
    const profileProjectSchoolName = norm(rawSchoolRows[0]?.SchoolName ?? "");
    schoolRows = buildRowsFromRowwise(rawSchoolRows);
    hydrateAdditionStoryUnitCosts(schoolRows, decision);
    hydrateNewCafeteriaKitchenUnitCost(schoolRows, decision);
    hydrateNewGymLockersUnitCost(schoolRows);
    applyRoomScheduleUnitValues(schoolRows, resolvedUniqueId, resolvedSchoolName, decision, profileProjectSchoolName);
    hydrateHeavyLightKitchenCafeteriaModUnitCosts(schoolRows, decision);
    hydrateAdaComplianceUnitValue(schoolRows, decision);
    hydrateManualQtyOverrides(schoolRows);
    hydratePlaygroundDefaultPlanningSf(schoolRows);
    synthesizeHeavyLightModernizationPivotFromSibling(schoolRows);

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

      const isFciCategory = systemCategory.startsWith("08");
      if ((needsGutReno || needsNewConstruction) && !DECISION_GUT_OR_NC_PROJECT_SCOPE_CATEGORIES.has(systemCategory)) {
        if (!(isFciCategory && getIncludeFciForMajor())) {
          r.__excludedFromTotals = true;
          r.__excludedReason = "decision";
          return;
        }
      }

      // Good/Poor: gut & new construction from decision outcome; otherwise library threshold vs pivot (CSV) / UnitValue.
      const lib = unitCostIndex ? unitCostIndex.get(makeUnitCostKey(r.SystemCategory, r.AssetType)) : null;
      let computed = deriveGutRenovationNewConstructionConditionScore(r, needsGutReno, needsNewConstruction);
      if (computed === null) {
        computed = computeConditionScoreFromValue(r, lib);
      }
      const conditionResolved = computed === "Good" || computed === "Poor";
      if (conditionResolved) {
        r.ConditionScore = computed;
        r.__libraryScore = computed;
      } else {
        r.ConditionScore = "";
        r.__libraryScore = "";
      }

      hydrateScheduleSfIntoUnitValue(r, resolvedUniqueId, resolvedSchoolName, decision, profileProjectSchoolName);

      if (needsStrictConditionMetricForCosting(systemCategory) && !conditionResolved) {
        // Project CSV often leaves campus resurfacing at ConditionSource Default with no pivoted metric;
        // treat as Poor so SF × $/SF can still be edited and totaled. Same for modernization rows with SF
        // already filled from the room schedule or project CSV.
        if (strictMetricUnresolvedBypass(r)) {
          r.ConditionScore = "Poor";
          r.__libraryScore = "Poor";
        } else {
          if (!r.__excludedFromTotals) {
            r.__excludedFromTotals = true;
            r.__excludedReason = "unresolved";
          }
          if (systemCategory !== "05_heavy modernization" && systemCategory !== "06_light modernization") {
            r.UnitValue = "";
          }
          r.ReplacementCost = "";
          return;
        }
      }

      // Score-based inclusion: Poor = included (black), Good = excluded (grey)
      const s = norm(r?.ConditionScore || r?.__libraryScore).toLowerCase();
      const excludedByScore = s === "good";
      r.__excludedFromTotals = excludedByScore ? true : false;
      r.__excludedReason = excludedByScore ? "good" : "";

      const unit = normalizeUnit(r?.Unit, r?.UnitCost);
      if (!unit) return; // still allow ConditionScore/inclusion above; just skip cost math

      applyDefaultCountableQuantityForCosting(r, excludedByScore);

      const derivedQ = computeDerivedQuantity(r, decision);
      if (
        derivedQ !== null &&
        shouldUseSchoolSqfForRow(r) &&
        !hasManualPlanningQtyOverrideStored(r)
      ) {
        // Only overwrite UnitValue for the GSF-driven categories.
        r.UnitValue = Number.isFinite(derivedQ) ? formatLocaleInt(Math.round(derivedQ)) : String(derivedQ);
      }

      // Yes (Good): one structure → quantity 1 so replacement cost shows in the sheet.
      if (
        isCampusYesNoReferenceAssetRow(r) &&
        norm(r?.ConditionScore || r?.__libraryScore).toLowerCase() === "good" &&
        !hasManualPlanningQtyOverrideStored(r)
      ) {
        r.UnitValue = "1";
      }

      const rc = computeReplacementCost(r, decision);
      if (rc !== null && Number.isFinite(rc)) {
        r.ReplacementCost = formatLocaleUsdInteger(Math.round(rc));
      }
    });

    stripManualPlanningStubQuantity(schoolRows);

    clearQuantitiesAndCostsForGoodCondition(
      schoolRows,
      resolvedUniqueId,
      resolvedSchoolName,
      decision,
      profileProjectSchoolName
    );
    suppressLightModernizationWhenHeavyIncluded(schoolRows);
    applySiteSpecificReplacementCostLabels(schoolRows);
    applyManualQtySiteSpecificLabels(schoolRows);
    applyFurnitureUpgradesLumpSumReplacementCosts(schoolRows, decision);

    schoolRows = (schoolRows || []).filter((r) => !r.__hiddenBySchoolLevel);
    snapshotNaturalRowIncludeState(schoolRows);
    pruneRowIncludeToggleOverridesAgainstDefaults(schoolRows);
    applyRowIncludeToggleOverrides(schoolRows);

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
    // Append __rowId so multiple CSV rows (same asset, different priorities, etc.) get distinct storage keys.
    const uid = normUid(row?.UniqueID);
    const school = norm(row?.SchoolName);
    const sys = norm(row?.SystemCategory);
    const asset = norm(row?.AssetType);
    const composite = [uid, school, sys, asset].filter(Boolean).join("|");
    const rid = row?.__rowId;
    const base = composite || (rid === 0 || rid ? `row:${rid}` : "");
    if (!base) return "";
    if (rid === undefined || rid === null) return base;
    return `${base}||rid:${rid}`;
  }

  /** Pre–normUid localStorage keys used CO-1420 casing; read overrides under legacy keys too. */
  function getRowKeyLegacy(row) {
    const uid = norm(row?.UniqueID);
    const school = norm(row?.SchoolName);
    const sys = norm(row?.SystemCategory);
    const asset = norm(row?.AssetType);
    const composite = [uid, school, sys, asset].filter(Boolean).join("|");
    if (composite) return composite;
    const rid = row?.__rowId;
    return rid === 0 || rid ? String(rid) : "";
  }

  function isReplacementCostPlaceholder(val) {
    const s = norm(val);
    return s === RC_PLACEHOLDER || /^site specific$/i.test(s);
  }

  function loadRowIncludeToggleOverrides() {
    try {
      if (!window.localStorage) return {};
      const raw = window.localStorage.getItem(ROW_INCLUDE_TOGGLE_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveRowIncludeToggleOverrides() {
    try {
      if (!window.localStorage) return;
      window.localStorage.setItem(ROW_INCLUDE_TOGGLE_STORAGE_KEY, JSON.stringify(rowIncludeToggleOverrides || {}));
    } catch {
      // ignore
    }
  }

  function tableTotalColumnCount() {
    return DISPLAY_COLS.length + 1;
  }

  function snapshotNaturalRowIncludeState(rows) {
    (rows || []).forEach((r) => {
      r.__naturalExcludedFromTotals = !!r.__excludedFromTotals;
    });
  }

  /**
   * Include toggle default (1 = in totals):
   * - ALWAYS_OFF: landscaping, expand parking, improve drop-off / pick-up zone (never default on).
   * - DEFAULT_OFF (asset keys below): opt-in for heavy/light cafeteria & gym (all listed), resurface; also applies outside 04.
   * - 04_campus upgrade: Furniture upgrades replacement cost uses lump-sum budgets by level ($750k ES/K–8, $1.5M MS, $3M HS and K–12); include default still uses metric ≤ library Value; branding and improve drop-off default off (opt-in); shade & outdoor classroom
   *   default on only when Good (“Yes”); other 04 lines default off.
   * - 06_light modernization / legacy modernization row “Lightly modernize corridors”: default on only when condition metric is strictly below 0.5 (fixed cutoff; not library Value 0.6).
   * - Elsewhere: on when project-list condition input exists and row is in capital need; 00_general / 01 / 02 / 08_* follow exclusion flags only.
   */
  const ROW_INCLUDE_ALWAYS_OFF_ASSET_KEYS = new Set(
    ["Campus landscaping upgrade", "Expand parking", "Improve drop-off / pick-up zone"].map((n) => normProjectKey(n))
  );

  const ROW_INCLUDE_DEFAULT_OFF_ASSET_KEYS = new Set(
    [
      "Heavily modernize cafeteria",
      "Heavily modernize gym / assembly space",
      "Lightly modernize cafeteria",
      "Lightly modernize gym / assembly space",
      "Resurface asphalt",
      "Resurface concrete",
    ].map((n) => normProjectKey(n))
  );

  const FURNITURE_UPGRADES_ASSET_PK = normProjectKey("Furniture upgrades");
  /** Lump-sum planning replacement cost for 04_campus upgrade → Furniture upgrades (by school level). */
  const FURNITURE_UPGRADE_BUDGET_ES_USD = 750000;
  const FURNITURE_UPGRADE_BUDGET_MS_USD = 1500000;
  const FURNITURE_UPGRADE_BUDGET_HS_K12_USD = 3000000;

  /**
   * Planning budget for Furniture upgrades row: ES/K–8 $750k, MS $1.5M, HS and K–12 $3M.
   */
  function getFurnitureUpgradesPlanningBudgetUsd(decisionRow) {
    if (!decisionRow) return null;
    let level = normalizeSchoolLevel(String(decisionRow["School Level"] ?? decisionRow.SchoolLevel ?? ""));
    if (!level) level = normalizeSchoolLevel(String(decisionRow["Building Name"] ?? ""));
    if (level === "elementary" || level === "k8") return FURNITURE_UPGRADE_BUDGET_ES_USD;
    if (level === "middle") return FURNITURE_UPGRADE_BUDGET_MS_USD;
    if (level === "high" || level === "k12") return FURNITURE_UPGRADE_BUDGET_HS_K12_USD;
    return null;
  }

  /** After unit-cost × qty, replace Furniture upgrades with level-based lump sum when in capital need (not Good). */
  function applyFurnitureUpgradesLumpSumReplacementCosts(rows, decisionRow) {
    const budget = getFurnitureUpgradesPlanningBudgetUsd(decisionRow);
    if (budget === null || !Number.isFinite(budget)) return;
    (rows || []).forEach((r) => {
      if (norm(r?.SystemCategory) !== "04_campus upgrade") return;
      if (manualPlanningAssetKey(r) !== FURNITURE_UPGRADES_ASSET_PK) return;
      if (norm(r?.ConditionScore || r?.__libraryScore).toLowerCase() === "good") return;
      if (r.__excludedReason === "heavy_mod") return;
      if (/not included/i.test(norm(r?.ReplacementCost))) return;
      r.ReplacementCost = formatLocaleUsdInteger(Math.round(budget));
    });
  }
  const FRONT_SCHOOL_BRANDING_ASSET_PK = normProjectKey("Front of school branding, landscape upgrades");
  const LIGHTLY_MODERNIZE_CORRIDORS_ASSET_PK = normProjectKey("Lightly modernize corridors");

  /** Pivot or numeric ConditionSource — mirrors getConditionMetricRaw eligibility (not Default / not DNR-only). */
  function rowHasProjectListConditionInput(row) {
    const piv = norm(row?.__pivotConditionScore);
    if (piv && !/^does not apply$/i.test(piv)) return true;
    const src = norm(row?.ConditionSource);
    if (!src || /^default$/i.test(src)) return false;
    if (/^deficiency data/i.test(src)) return false;
    const t = src.replace(/,/g, "").trim();
    return /^-?\d+(\.\d+)?$/.test(t);
  }

  function rowIncludeToggleDefaultOn(r) {
    if (!r) return false;
    const pk = manualPlanningAssetKey(r);
    if (ROW_INCLUDE_ALWAYS_OFF_ASSET_KEYS.has(pk)) return false;

    const sys = norm(r?.SystemCategory);
    if (pk === LIGHTLY_MODERNIZE_CORRIDORS_ASSET_PK && (sys === "06_light modernization" || sys === "modernization")) {
      return lightModernizeCorridorsIncludeDefaultOn(r);
    }

    if (sys === "04_campus upgrade") {
      if (pk === FRONT_SCHOOL_BRANDING_ASSET_PK) return false;
      if (pk === FURNITURE_UPGRADES_ASSET_PK) {
        return campus04AssetMetricLeLibraryValueIncludeDefaultOn(r, pk);
      }
      if (ROW_INCLUDE_DEFAULT_OFF_ASSET_KEYS.has(pk)) return false;
      if (isCampusYesNoReferenceAssetRow(r)) {
        return campusYesNoReferenceRowShowsYes(r);
      }
      return false;
    }

    if (ROW_INCLUDE_DEFAULT_OFF_ASSET_KEYS.has(pk)) return false;

    if (
      sys === "00_general" ||
      sys === "01_new construction" ||
      sys === "02_gut & renovation" ||
      sys.startsWith("08")
    ) {
      return !r.__naturalExcludedFromTotals;
    }

    if (!rowHasProjectListConditionInput(r)) return false;
    return !r.__naturalExcludedFromTotals;
  }

  function rowIncludeToggleEffectiveDesired(r) {
    const key = getRowKey(r);
    const leg = key ? getRowKeyLegacy(r) : "";
    if (key && Object.prototype.hasOwnProperty.call(rowIncludeToggleOverrides, key)) {
      return !!rowIncludeToggleOverrides[key];
    }
    if (leg && leg !== key && Object.prototype.hasOwnProperty.call(rowIncludeToggleOverrides, leg)) {
      return !!rowIncludeToggleOverrides[leg];
    }
    return rowIncludeToggleDefaultOn(r);
  }

  /** Drop stored include overrides that match the current default (keeps intentional divergences only). */
  function pruneRowIncludeToggleOverridesAgainstDefaults(rows) {
    let changed = false;
    (rows || []).forEach((r) => {
      if (r.__isRollup) return;
      const k = getRowKey(r);
      if (!k || !Object.prototype.hasOwnProperty.call(rowIncludeToggleOverrides, k)) return;
      const def = rowIncludeToggleDefaultOn(r);
      if (rowIncludeToggleOverrides[k] === def) {
        delete rowIncludeToggleOverrides[k];
        changed = true;
      }
    });
    if (changed) saveRowIncludeToggleOverrides();
  }

  /**
   * User turns include ON for strict-metric rows (03/04/05/06) that were excluded as unresolved or Good:
   * treat as Poor for planning and compute replacement $ so the row can enter totals.
   * Campus shade / outdoor classroom (Good "Yes") usually already has $ — skip when no strict unlock needed.
   */
  function materializeStrictMetricRowForPlanning(row, decision) {
    if (!row) return;
    const er = row.__excludedReason;
    if (er !== "unresolved" && er !== "good") return;
    if (er === "good" && !needsStrictConditionMetricForCosting(row.SystemCategory) && !isCampusYesNoReferenceAssetRow(row)) {
      return;
    }
    if (er === "good" && isCampusYesNoReferenceAssetRow(row)) {
      const rc0 = parseNumberMaybe(row?.ReplacementCost);
      if (rc0 !== null && Number.isFinite(rc0) && rc0 > 0) return;
    }

    row.__manualPlanningUnlockStrictMetric = true;
    row.__manualPlanningUnlockStrictMetricWas = er;
    row.ConditionScore = "Poor";
    row.__libraryScore = "Poor";
    row.__excludedReason = "";
    applyDefaultCountableQuantityForCosting(row, false);
    const rc = computeReplacementCost(row, decision);
    if (rc !== null && Number.isFinite(rc)) {
      row.ReplacementCost = formatLocaleUsdInteger(Math.round(rc));
    }
  }

  function revertStrictMetricRowPlanning(row) {
    if (!row || !row.__manualPlanningUnlockStrictMetric) return;
    const was = row.__manualPlanningUnlockStrictMetricWas;
    row.__manualPlanningUnlockStrictMetric = false;
    row.__manualPlanningUnlockStrictMetricWas = null;
    row.__excludedReason = was === "good" ? "good" : "unresolved";
    if (was === "good") {
      row.ConditionScore = "Good";
      row.__libraryScore = "Good";
    } else {
      row.ConditionScore = "";
      row.__libraryScore = "";
    }
    row.ReplacementCost = "";
  }

  function applyRowIncludeToggleOverrides(rows) {
    const decision = getDecisionForResolvedSchool();
    (rows || []).forEach((r) => {
      if (r.__isRollup) return;
      const wantOn = rowIncludeToggleEffectiveDesired(r);
      r.__rowIncludeToggleOn = wantOn;

      if (!wantOn) {
        if (r.__manualPlanningUnlockStrictMetric) revertStrictMetricRowPlanning(r);
        r.__excludedFromTotals = true;
        return;
      }

      if (r.__excludedReason === "decision") {
        r.__excludedFromTotals = true;
        return;
      }

      // Toggle/default wins over Good/unresolved grey state (not decision-based N/A).
      r.__excludedFromTotals = false;
    });

    (rows || []).forEach((r) => {
      if (r.__isRollup) return;
      if (r.__excludedFromTotals) return;
      if (!rowIncludeToggleEffectiveDesired(r)) return;
      if (r.__excludedReason === "unresolved") {
        materializeStrictMetricRowForPlanning(r, decision);
        return;
      }
      if (r.__excludedReason === "good") {
        if (!needsStrictConditionMetricForCosting(r.SystemCategory) && !isCampusYesNoReferenceAssetRow(r)) return;
        materializeStrictMetricRowForPlanning(r, decision);
      }
    });

    suppressLightModernizationWhenHeavyIncluded(rows);
  }

  function commitRowIncludeToggleForRow(row, wantOn) {
    if (row.__isRollup && row.__rollupRows && row.__rollupRows.length) {
      row.__rollupRows.forEach((sub) => {
        const k = getRowKey(sub);
        if (!k) return;
        const def = rowIncludeToggleDefaultOn(sub);
        if (wantOn === def) delete rowIncludeToggleOverrides[k];
        else rowIncludeToggleOverrides[k] = wantOn;
      });
      saveRowIncludeToggleOverrides();
      if (selectedSchoolUids.size > 1) {
        applyMultiSchoolSelection();
      } else {
        applyRowIncludeToggleOverrides(schoolRows);
        applyFilters();
        render();
        updateTotalReplacementCostDisplay();
      }
      return;
    }
    const k = getRowKey(row);
    if (!k) return;
    const def = rowIncludeToggleDefaultOn(row);
    if (wantOn === def) delete rowIncludeToggleOverrides[k];
    else rowIncludeToggleOverrides[k] = wantOn;
    saveRowIncludeToggleOverrides();
    applyRowIncludeToggleOverrides(schoolRows);
    applyFilters();
    render();
    updateTotalReplacementCostDisplay();
  }

  /** Set Include on for every row that shows a positive dollar replacement cost (bulk enable default-off lines). */
  function turnOnAllRowsWithValues() {
    if (!schoolRows || !schoolRows.length) return;
    let changed = false;

    function visitLeafRow(r) {
      if (!r || r.__hiddenBySchoolLevel) return;
      const rc = parseNumberMaybe(r.ReplacementCost);
      if (rc === null || !Number.isFinite(rc) || rc <= 0) return;
      if (rowIncludeToggleEffectiveDesired(r)) return;
      const key = getRowKey(r);
      if (!key) return;
      rowIncludeToggleOverrides[key] = true;
      const leg = getRowKeyLegacy(r);
      if (leg && leg !== key) delete rowIncludeToggleOverrides[leg];
      changed = true;
    }

    schoolRows.forEach((r) => {
      if (r.__isRollup && r.__rollupRows && r.__rollupRows.length) {
        r.__rollupRows.forEach(visitLeafRow);
      } else {
        visitLeafRow(r);
      }
    });

    if (!changed) return;
    saveRowIncludeToggleOverrides();
    pruneRowIncludeToggleOverridesAgainstDefaults(schoolRows);
    if (selectedSchoolUids.size > 1) applyMultiSchoolSelection();
    else {
      applyRowIncludeToggleOverrides(schoolRows);
      applyFilters();
      render();
      updateTotalReplacementCostDisplay();
    }
  }

  function createRowIncludeToggleControl(row) {
    const lab = document.createElement("label");
    lab.className = "row-include-switch";
    const inp = document.createElement("input");
    inp.type = "checkbox";
    inp.setAttribute("role", "switch");
    if (row.__isRollup && row.__rollupRows && row.__rollupRows.length) {
      const subs = row.__rollupRows;
      const onCount = subs.filter((s) => s && !s.__excludedFromTotals).length;
      inp.checked = subs.length > 0 && onCount === subs.length;
      inp.indeterminate = onCount > 0 && onCount < subs.length;
      if (inp.indeterminate) lab.classList.add("row-include-switch--indeterminate");
      lab.title = "0 = all facilities excluded, 1 = all included (click to set)";
    } else {
      inp.checked = row ? !row.__excludedFromTotals : false;
      lab.title = inp.checked
        ? "Included (1) — click to set excluded (0)"
        : "Excluded (0) — click to set included (1)";
    }
    inp.setAttribute("aria-label", inp.checked ? "Include in totals: 1 (on)" : "Include in totals: 0 (off)");
    inp.addEventListener("click", (e) => e.stopPropagation());
    inp.addEventListener("change", () => {
      commitRowIncludeToggleForRow(row, inp.checked);
    });
    lab.appendChild(inp);
    const slider = document.createElement("span");
    slider.className = "row-include-switch-slider";
    slider.setAttribute("aria-hidden", "true");
    const bit0 = document.createElement("span");
    bit0.className = "row-include-switch-bit row-include-switch-0";
    bit0.textContent = "0";
    const bit1 = document.createElement("span");
    bit1.className = "row-include-switch-bit row-include-switch-1";
    bit1.textContent = "1";
    slider.appendChild(bit0);
    slider.appendChild(bit1);
    lab.appendChild(slider);
    return lab;
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
    if (col === "Project Type") return row ? displayProjectTypeLabel(row) : "";
    if (col === "ConditionScore") return row ? formatConditionScoreDisplay(row) : "";
    if (col === "UnitValue" && row) return formatDisplayQuantityCell(row[col], row);
    return row ? row[col] : "";
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

  /**
   * Used when "Show rows without replacement cost" is off (default): hide rows that lack a planning dollar amount.
   * Row qualifies when it parses to a positive $ amount and counts toward planning totals (__excludedFromTotals false).
   * Rows that still show $ but are excluded from totals do not qualify. For 08_site infrastructure*, UnitValue "None"
   * counts as no replacement cost.
   */
  function rowHasReplacementCostInformation(r) {
    if (!r) return false;
    if (r.__excludedFromTotals) return false;
    const sysLo = norm(r.SystemCategory).toLowerCase();
    const isSiteInfra = sysLo === "08_site infrastructure" || sysLo === "08_site infrastructure_new";
    if (isSiteInfra) {
      const uv = norm(String(r.UnitValue ?? "")).toLowerCase();
      if (uv === "none") return false;
    }
    if (r.__isRollup) {
      const n = parseNumberMaybe(r.ReplacementCost);
      return n !== null && Number.isFinite(n) && n > 0;
    }
    const rcStr = norm(String(r.ReplacementCost ?? ""));
    if (!rcStr) return false;
    if (/not included/i.test(rcStr)) return false;
    if (isReplacementCostPlaceholder(r.ReplacementCost)) return false;
    const n = parseNumberMaybe(r.ReplacementCost);
    return n !== null && Number.isFinite(n) && n > 0;
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

  /** Multi-school rollups: quantities in SF should always sum even when $/SF differs by facility. */
  function isSquareFootMeasureUnit(u) {
    const x = norm(u).toUpperCase();
    return x === "SF" || x === "SQFT" || x === "SQF" || x === "SQ FT";
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

  /** ADA uses unit "Project cost" with the same 0–1-style metric handling as Percentage rows. */
  function unitUsesPercentStyleMetric(row) {
    const u = normalizeUnit(row?.Unit, row?.UnitCost);
    if (u === "PERCENT" || u === "PERCENTAGE" || u === "%") return true;
    return u === "PROJECT COST" && norm(row?.AssetType).toLowerCase() === "ada compliance";
  }

  function getUnitValueNumber(row) {
    const raw = getRawUnitValue(row);
    if (unitUsesPercentStyleMetric(row)) {
      return parsePercentTo0to1(raw);
    }
    return parseNumberMaybe(raw);
  }

  /**
   * For strict metric categories, unresolved pivot still allows costing when quantity exists:
   * manual campus planning rows, or heavy/light modernization with SF from room schedule / CSV.
   */
  function strictMetricUnresolvedBypass(row) {
    if (hasManualPlanningQtyOverrideStored(row)) return true;
    if (isManualQtyPlanningAssetRow(row)) return true;
    const sys = norm(row?.SystemCategory);
    if (sys !== "05_heavy modernization" && sys !== "06_light modernization") return false;
    const q = getUnitValueNumber(row);
    return q !== null && Number.isFinite(q) && q > 0;
  }

  function invertGoodPoor(label) {
    const s = norm(label).toLowerCase();
    if (s === "good") return "Poor";
    if (s === "poor") return "Good";
    return "";
  }

  function parseLibraryValueThreshold(unitRaw, valueRaw) {
    const unit = normalizeUnit(unitRaw, "");
    if (unit === "PERCENT" || unit === "PERCENTAGE" || unit === "%" || unit === "PROJECT COST") {
      return parsePercentTo0to1(valueRaw);
    }
    return parseNumberMaybe(valueRaw);
  }

  /**
   * Condition metric 0–1 (or 0–100 legacy) for threshold compare: pivot field first;
   * then ConditionSource when it is a bare number (e.g. 0 / 0.65), not "Default" or FCI labels.
 */
  function getConditionMetricRaw(row) {
    const pivot = norm(row?.__pivotConditionScore);
    if (pivot) return pivot;

    const src = norm(row?.ConditionSource);
    if (!src) return "";
    if (/^default$/i.test(src)) return "";
    if (/^deficiency data/i.test(src)) return "";
    const t = src.replace(/,/g, "").trim();
    if (!/^-?\d+(\.\d+)?$/.test(t)) return "";
    return t;
  }

  /**
   * Numeric condition metric used in threshold logic (same `m` as computeConditionScoreFromValue).
   * Shown in the Condition score column instead of Good/Poor labels.
   */
  function getConditionMetricNumberForDisplay(row, lib) {
    if (!row) return null;
    const sys = norm(row?.SystemCategory);
    const unit = normalizeUnit(norm(row?.Unit) || norm(lib?.unit), "");
    const metricRaw = getConditionMetricRaw(row);
    const metric =
      unit === "PERCENT" || unit === "PERCENTAGE" || unit === "%" || unit === "PROJECT COST"
        ? parsePercentTo0to1(metricRaw)
        : parseNumberMaybe(metricRaw);
    const uv = getUnitValueNumber(row);
    const useUvAsConditionMetric = sys.startsWith("08");
    const m = metric !== null && metric !== undefined ? metric : useUvAsConditionMetric ? uv : null;
    return m;
  }

  /**
   * 04_campus: default include when condition metric ≤ library Value (same 0.5 split as scoring).
   * Used for Furniture upgrades (above threshold ⇒ Good ⇒ default off).
   */
  function campus04AssetMetricLeLibraryValueIncludeDefaultOn(row, expectedPk) {
    if (!row || norm(row?.SystemCategory) !== "04_campus upgrade") return false;
    if (manualPlanningAssetKey(row) !== expectedPk) return false;
    const lib = unitCostIndex?.get(makeUnitCostKey(row.SystemCategory, row.AssetType)) ?? null;
    const th = lib ? parseLibraryValueThreshold(norm(row?.Unit) || norm(lib?.unit), lib?.value) : null;
    const n = getConditionMetricNumberForDisplay(row, lib);
    if (n === null || !Number.isFinite(n) || th === null || !Number.isFinite(th)) return false;
    return n <= th && !row.__naturalExcludedFromTotals;
  }

  /** Default include only when pivot/source metric is strictly below 0.5 (capital need). */
  function lightModernizeCorridorsIncludeDefaultOn(row) {
    if (!row) return false;
    if (manualPlanningAssetKey(row) !== LIGHTLY_MODERNIZE_CORRIDORS_ASSET_PK) return false;
    const sys = norm(row?.SystemCategory);
    if (sys !== "06_light modernization" && sys !== "modernization") return false;
    const lib =
      unitCostIndex?.get(makeUnitCostKey("06_light modernization", row.AssetType)) ??
      unitCostIndex?.get(makeUnitCostKey(row.SystemCategory, row.AssetType)) ??
      null;
    const n = getConditionMetricNumberForDisplay(row, lib);
    if (n === null || !Number.isFinite(n)) return false;
    return n < 0.5 && !row.__naturalExcludedFromTotals;
  }

  function isDoesNotApplyPhrase(s) {
    return s && /does not apply/i.test(norm(s));
  }

  /** Deficiency / replacement cost still uses metrics internally; list UI omits the score column. */
  function isSiteInfrastructureSystemCategory(systemCategory) {
    const s = norm(systemCategory).toLowerCase();
    return s === "08_site infrastructure" || s === "08_site infrastructure_new";
  }
  function isSiteInfrastructureRow(row) {
    return !!(row && isSiteInfrastructureSystemCategory(row.SystemCategory));
  }

  /** Decision export / header names differ from project-list SchoolName; match both. */
  function matchesNewBuildingSiteInfraExemptSchool(nameRaw) {
    const s = norm(nameRaw).toLowerCase();
    if (!s) return false;
    if (/marshdale/.test(s) && (/\bes\b/.test(s) || /elementary/.test(s))) return true;
    if (/prospect\s+valley/.test(s) && (/\bes\b/.test(s) || /elementary/.test(s))) return true;
    if (/warren\s+tech\s+south/.test(s)) return true;
    if (/three\s+creeks/.test(s) && /k\s*-?\s*8/.test(s)) return true;
    if (/fletcher\s+miller/.test(s)) return true;
    return false;
  }

  function shouldShowNewBuildingSiteInfraFciNote() {
    if (!selectedSchoolUids || selectedSchoolUids.size !== 1) return false;
    const headerText = norm((elSchoolNameHeader && elSchoolNameHeader.textContent) || "")
      .replace(/\(\s*incl\.\s*PK\s*\)/gi, "")
      .trim();
    const candidates = [resolvedSchoolName, norm(schoolRows[0]?.SchoolName), headerText].filter(Boolean);
    return candidates.some((n) => matchesNewBuildingSiteInfraExemptSchool(n));
  }

  function formatConditionScoreDisplay(row) {
    if (!row) return "—";
    if (isSiteInfrastructureRow(row)) return "";
    if (row.__excludedReason === "level" || row.__excludedReason === "decision") return "N/A";
    if (row.__isRollup) {
      const cs = norm(row.ConditionScore);
      if (!cs) return "—";
      const pn = parseNumberMaybe(cs.replace(/,/g, ""));
      if (pn !== null && Number.isFinite(pn)) return cs;
      return "—";
    }
    if (isCampusYesNoReferenceAssetRow(row)) {
      if (campusYesNoReferenceRowShowsYes(row)) return "Yes";
      const label = norm(row?.ConditionScore || row?.__libraryScore || "").toLowerCase();
      if (label === "poor") return "No";
      return "—";
    }
    if (isHeavilyModernizeCafeteriaRow(row)) return "-";
    if (isHeavilyModernizeGymAssemblyRow(row)) return "-";
    if (isDoesNotApplyPhrase(row?.__pivotConditionScore)) return doesNotApplyConditionDisplay(row);
    if (isDoesNotApplyPhrase(row?.ConditionSource)) return doesNotApplyConditionDisplay(row);
    if (isDoesNotApplyPhrase(row?.__csvUnitSemantic)) return doesNotApplyConditionDisplay(row);
    if (isDoesNotApplyPhrase(row?.Unit)) return doesNotApplyConditionDisplay(row);
    const internalPoor =
      norm(row?.ConditionScore || row?.__libraryScore || "").toLowerCase() === "poor";
    if (isManualQtyPlanningAssetRow(row) && internalPoor) return "—";
    const lib = unitCostIndex ? unitCostIndex.get(makeUnitCostKey(row.SystemCategory, row.AssetType)) : null;
    const n = getConditionMetricNumberForDisplay(row, lib);
    if (n !== null && Number.isFinite(n)) return formatLocaleDecimal(n, 2, 2);
    return "—";
  }

  /** 0–1 gradient scale + cutoff lines; structure/FCI (non–site-infra 08_*) uses binary bar. */
  function getConditionScaleConfig(row) {
    if (isCampusYesNoReferenceAssetRow(row)) return { mode: "none", cutoff: null };
    if (isHeavilyModernizeCafeteriaRow(row)) return { mode: "none", cutoff: null };
    if (isHeavilyModernizeGymAssemblyRow(row)) return { mode: "none", cutoff: null };
    const sys = norm(row?.SystemCategory).toLowerCase();
    if (sys === "04_campus upgrade") return { mode: "continuous", cutoff: 0.5 };
    // Heavy vs light modernization tiers are separate library rows (AssetType), not chosen by metric bands.
    // Good/Poor uses UnitCostLibrary Value per row (often 0.5 heavy / 0.7 light); align the bar cutoff with that.
    if (sys === "05_heavy modernization" || sys === "06_light modernization") {
      const lib = unitCostIndex ? unitCostIndex.get(makeUnitCostKey(row.SystemCategory, row.AssetType)) : null;
      const th = lib ? parseLibraryValueThreshold(norm(row?.Unit) || norm(lib?.unit), lib?.value) : null;
      if (th !== null && Number.isFinite(th)) {
        return { mode: "continuous", cutoff: th };
      }
      return { mode: "continuous", cutoff: sys === "05_heavy modernization" ? 0.5 : 0.7 };
    }
    if (sys === "08_site infrastructure" || sys === "08_site infrastructure_new") {
      return { mode: "none", cutoff: null };
    }
    if (sys.startsWith("08")) return { mode: "binary", cutoff: null };
    return { mode: "none", cutoff: null };
  }

  function appendConditionScoreVisual(cell, row, displayText, isFciMuted) {
    cell.innerHTML = "";
    if (isSiteInfrastructureRow(row)) return;
    const cfg = getConditionScaleConfig(row);
    const rawStr = String(displayText).replace(/,/g, "").trim();
    const n = parseNumberMaybe(rawStr);

    const wrap = document.createElement("div");
    wrap.className = "condition-score-widget" + (isFciMuted ? " condition-score-widget--fci-muted" : "");

    const numEl = document.createElement("span");
    numEl.className = "condition-score-num condition-score-num--solo";
    numEl.textContent = displayText;

    const clamp01 = (x) => Math.max(0, Math.min(1, x));

    function appendValueUnderBar(chart, pct) {
      const rowEl = document.createElement("div");
      rowEl.className = "condition-score-value-under";
      const span = document.createElement("span");
      span.textContent = displayText;
      span.style.left = `${pct * 100}%`;
      span.title = displayText;
      rowEl.appendChild(span);
      chart.appendChild(rowEl);
    }

    if (cfg.mode === "none" || n === null || !Number.isFinite(n)) {
      wrap.appendChild(numEl);
      cell.appendChild(wrap);
      return;
    }

    const chart = document.createElement("div");
    chart.className = "condition-score-chart";

    if (cfg.mode === "binary") {
      if (n < 0 || n > 1) {
        wrap.appendChild(numEl);
        cell.appendChild(wrap);
        return;
      }
      const pct = clamp01(n);
      const track = document.createElement("div");
      track.className = "condition-score-track condition-score-track--binary condition-score-track--neutral";
      if (pct > 0) {
        const fillClip = document.createElement("div");
        fillClip.className = "condition-score-fill-clip" + (pct >= 1 - 1e-9 ? " condition-score-fill-clip--full" : "");
        fillClip.style.width = `${pct * 100}%`;
        const fill = document.createElement("div");
        fill.className = "condition-score-binary-fill";
        fill.setAttribute("aria-hidden", "true");
        fill.style.width = pct >= 1 - 1e-9 ? "100%" : `${(1 / pct) * 100}%`;
        fillClip.appendChild(fill);
        track.appendChild(fillClip);
      }
      const marker = document.createElement("div");
      marker.className = "condition-score-marker condition-score-marker--value";
      marker.style.left = `${pct * 100}%`;
      marker.title = `Score ${displayText}`;
      track.appendChild(marker);
      const scaleLblBin = document.createElement("div");
      scaleLblBin.className = "condition-score-scale-labels condition-score-scale-labels--binary";
      scaleLblBin.innerHTML = "<span>0</span><span>1</span>";
      chart.appendChild(scaleLblBin);
      chart.appendChild(track);
      appendValueUnderBar(chart, pct);
      wrap.appendChild(chart);
      cell.appendChild(wrap);
      return;
    }

    const pct = clamp01(n);
    const track = document.createElement("div");
    track.className = "condition-score-track condition-score-track--continuous condition-score-track--neutral";
    if (pct > 0) {
      const fillClip = document.createElement("div");
      fillClip.className = "condition-score-fill-clip" + (pct >= 1 - 1e-9 ? " condition-score-fill-clip--full" : "");
      fillClip.style.width = `${pct * 100}%`;
      const grad = document.createElement("div");
      grad.className = "condition-score-gradient";
      grad.setAttribute("aria-hidden", "true");
      grad.style.width = pct >= 1 - 1e-9 ? "100%" : `${(1 / pct) * 100}%`;
      fillClip.appendChild(grad);
      track.appendChild(fillClip);
    }
    if (cfg.cutoff !== null && cfg.cutoff !== undefined) {
      const co = document.createElement("div");
      co.className = "condition-score-marker condition-score-marker--cutoff";
      co.style.left = `${clamp01(cfg.cutoff) * 100}%`;
      co.title = `Cutoff ${formatLocaleDecimal(cfg.cutoff, 2, 2)}`;
      track.appendChild(co);
    }
    const mv = document.createElement("div");
    mv.className = "condition-score-marker condition-score-marker--value";
    mv.style.left = `${pct * 100}%`;
    mv.title = `Score ${displayText}`;
    track.appendChild(mv);
    const scaleLbl = document.createElement("div");
    scaleLbl.className = "condition-score-scale-labels";
    scaleLbl.innerHTML = "<span>0</span><span>0.5</span><span>1</span>";
    chart.appendChild(scaleLbl);
    chart.appendChild(track);
    appendValueUnderBar(chart, pct);
    wrap.appendChild(chart);
    cell.appendChild(wrap);
  }

  function computeConditionScoreFromValue(row, lib) {
    // Compare per-school value to UnitCostLibrary.Value threshold.
    // Metric: __pivotConditionScore, else numeric ConditionSource.
    // For 08_* (FCI) only, fall back to UnitValue when the CSV metric is absent — that field
    // carries deficiency dollars. For other categories (e.g. 04_campus upgrade), UnitValue is
    // for costing only; without a numeric condition input, the score is unresolved (null).
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
    const metricRaw = getConditionMetricRaw(row);
    const unit = normalizeUnit(norm(row?.Unit) || norm(lib?.unit), "");
    const metric =
      unit === "PERCENT" || unit === "PERCENTAGE" || unit === "%" || unit === "PROJECT COST"
        ? parsePercentTo0to1(metricRaw)
        : parseNumberMaybe(metricRaw);
    const uv = getUnitValueNumber(row);
    const useUvAsConditionMetric = sys.startsWith("08");
    const m = metric !== null && metric !== undefined ? metric : useUvAsConditionMetric ? uv : null;

    if (threshold === null || m === null) {
      if (libScore === "Good" || libScore === "Poor") return libScore;
      const pivotLegacy = norm(row?.__pivotConditionScore);
      if (/^good$/i.test(pivotLegacy)) return "Good";
      if (/^poor$/i.test(pivotLegacy)) return "Poor";
      return null;
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

  /**
   * 01_new construction & 02_gut & renovation: condition label follows capital strategy from evaluateSchoolDecision
   * (needsGutReno / needsNewConstruction). In-scope rows are Poor (need); CSV no longer supplies a metric for these.
   */
  function deriveGutRenovationNewConstructionConditionScore(row, needsGutReno, needsNewConstruction) {
    const sys = norm(row?.SystemCategory);
    if (sys === "02_gut & renovation") {
      if (!needsGutReno) return null;
      return "Poor";
    }
    if (sys === "01_new construction") {
      if (!needsNewConstruction) return null;
      return "Poor";
    }
    return null;
  }

  /** No $ totals unless Good/Poor can be resolved from CSV/library metric rules (see computeConditionScoreFromValue). */
  function needsStrictConditionMetricForCosting(systemCategory) {
    const sys = norm(systemCategory);
    return (
      sys === "00_general" ||
      sys === "03_addition" ||
      sys === "04_campus upgrade" ||
      sys === "05_heavy modernization" ||
      sys === "06_light modernization"
    );
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
    if (levelKey === "k12") return "New Construction HS";
    return null;
  }

  function getAdditionBaseNewConstructionProject(decision) {
    return getNewConstructionProjectForDecision(decision);
  }

  function getAdditionStoryRatePerSf(stories, decision) {
    const s = stories === 3 ? 3 : 2;
    const ncProj = getAdditionBaseNewConstructionProject(decision);
    if (!ncProj || !unitCostIndex) return null;
    const lib = unitCostIndex.get(makeUnitCostKey("01_new construction", ncProj));
    let rate = lib ? parseUnitCostNumber(lib.unitCost) : null;
    if (rate === null || !Number.isFinite(rate)) return null;
    if (s === 3) rate *= ADDITION_THIRD_STORY_FOUNDATION_FACTOR;
    return rate;
  }

  function formatAdditionRateLabel(rate) {
    if (rate === null || !Number.isFinite(rate)) return "—";
    const n = Math.round(rate * 100) / 100;
    return formatLocaleDecimal(n, 0, 2);
  }

  function getCafeteriaKitchenEquipmentMidPerSf(decision) {
    const k = getEffectiveSchoolLevelKey(decision);
    if (k === "middle") return CK_EQUIP_MS_MID;
    if (k === "high" || k === "k12") return CK_EQUIP_HS_MID;
    return CK_EQUIP_ES_MID; // elementary, k8, unknown
  }

  function getNewCafeteriaKitchenCompositeRatePerSf(decision) {
    const eq = getCafeteriaKitchenEquipmentMidPerSf(decision);
    const blendedCore =
      (1 / 3) * (CK_SHELL_KIT_MID + eq) +
      (2 / 3) * CK_SHELL_CAF_MID;
    return blendedCore * CK_HARD_COST_FACTOR;
  }

  function getNewGymLockersCompositeRatePerSf() {
    const blendedCore =
      (2 / 3) * GL_SHELL_GYM_MID + (1 / 3) * GL_SHELL_LOCKER_MID;
    return blendedCore * CK_HARD_COST_FACTOR;
  }

  function getHeavyModernizeKitchenRatePerSf(decision) {
    const eq = getCafeteriaKitchenEquipmentMidPerSf(decision);
    return (HM_SHELL_KIT_MID + eq) * CK_HARD_COST_FACTOR;
  }

  function getHeavyModernizeCafeteriaRatePerSf() {
    return HM_SHELL_CAF_MID * CK_HARD_COST_FACTOR;
  }

  function getLightModernizeCafeteriaRatePerSf() {
    return LM_SHELL_CAF_MID * CK_HARD_COST_FACTOR;
  }

  function getDecisionForResolvedSchool() {
    const uid = normUid(resolvedUniqueId);
    if (uid && decisionByUid.has(uid)) return decisionByUid.get(uid);
    return null;
  }

  /** Story addition rows have blank library UnitCost; fill $/SF from New Construction by school level (+5% for 3-story). */
  function hydrateAdditionStoryUnitCosts(rows, decision) {
    (rows || []).forEach((r) => {
      if (norm(r?.SystemCategory) !== "03_addition") return;
      const proj = norm(r?.AssetType);
      if (proj === "New 2-story building") {
        const rate = getAdditionStoryRatePerSf(2, decision);
        const use =
          rate !== null && Number.isFinite(rate) ? rate : ADDITION_STORY_FALLBACK_SF[2];
        if (Number.isFinite(use)) r.UnitCost = `$${formatAdditionRateLabel(use)}/SF`;
      } else if (proj === "New 3-story building") {
        const rate = getAdditionStoryRatePerSf(3, decision);
        const use =
          rate !== null && Number.isFinite(rate) ? rate : ADDITION_STORY_FALLBACK_SF[3];
        if (Number.isFinite(use)) r.UnitCost = `$${formatAdditionRateLabel(use)}/SF`;
      }
    });
  }

  function hydrateNewCafeteriaKitchenUnitCost(rows, decision) {
    (rows || []).forEach((r) => {
      if (norm(r?.SystemCategory) !== "03_addition") return;
      if (norm(r?.AssetType) !== "New cafeteria and kitchen") return;
      const rate = getNewCafeteriaKitchenCompositeRatePerSf(decision);
      if (Number.isFinite(rate)) r.UnitCost = `$${formatAdditionRateLabel(rate)}/SF`;
    });
  }

  function hydrateNewGymLockersUnitCost(rows) {
    (rows || []).forEach((r) => {
      if (norm(r?.SystemCategory) !== "03_addition") return;
      if (norm(r?.AssetType) !== "New gym and locker rooms") return;
      const rate = getNewGymLockersCompositeRatePerSf();
      if (Number.isFinite(rate)) r.UnitCost = `$${formatAdditionRateLabel(rate)}/SF`;
    });
  }

  /**
   * Educational adequacy from decision export (0-1). Legacy 0-100 values normalized to 0-1.
   * Used to fill ADA compliance % quantity when the project list leaves UnitValue blank.
   */
  function getEducationalAdequacy0to1(decision) {
    if (!decision) return null;
    const raw = decision.EducationalAdequacy ?? decision["Educational Adequacy"];
    const n = parseFloat(String(raw ?? "").replace(/,/g, "").trim());
    if (!Number.isFinite(n)) return null;
    if (n >= 0 && n <= 1) return n;
    if (n > 1 && n <= 100) return n / 100;
    return null;
  }

  function hydrateAdaComplianceUnitValue(rows, decision) {
    const ea = getEducationalAdequacy0to1(decision);
    if (ea === null || !Number.isFinite(ea)) return;

    (rows || []).forEach((r) => {
      if (norm(r?.SystemCategory) !== "00_general") return;
      if (norm(r?.AssetType).toLowerCase() !== "ada compliance") return;
      const u = normalizeUnit(r?.Unit, r?.UnitCost);
      if (u !== "PERCENTAGE" && u !== "PERCENT" && u !== "%" && u !== "PROJECT COST") return;

      const raw = norm(getRawUnitValue(r));
      const q = getUnitValueNumber(r);
      const nRaw = raw ? parseNumberMaybe(raw.replace(/%/g, "")) : null;
      const looksLikeDollarsOrGarbage =
        nRaw !== null && Number.isFinite(nRaw) && Math.abs(nRaw) > 100;
      const qtyInvalid =
        !raw ||
        q === null ||
        !Number.isFinite(q) ||
        q < 0 ||
        q > 1 ||
        looksLikeDollarsOrGarbage;

      if (!qtyInvalid) return;

      r.UnitValue = formatLocaleDecimal(ea * 100, 0, 2);
    });
  }

  function hydrateHeavyLightKitchenCafeteriaModUnitCosts(rows, decision) {
    (rows || []).forEach((r) => {
      const sys = norm(r?.SystemCategory);
      const proj = norm(r?.AssetType);
      if (sys === "05_heavy modernization" && proj === "Modernize kitchen") {
        r.Unit = "SF";
        const rate = getHeavyModernizeKitchenRatePerSf(decision);
        if (Number.isFinite(rate)) r.UnitCost = `$${formatAdditionRateLabel(rate)}/SF`;
        const sfRaw = getUnitValueNumber(r);
        if (
          (sfRaw === null || !Number.isFinite(sfRaw) || sfRaw <= 0) &&
          !hasManualPlanningQtyOverrideStored(r)
        ) {
          r.UnitValue = formatLocaleInt(Math.round(HM_KITCHEN_BASIS_SF));
        }
      } else if (sys === "05_heavy modernization" && proj === "Heavily modernize cafeteria") {
        r.Unit = "SF";
        const rate = getHeavyModernizeCafeteriaRatePerSf();
        if (Number.isFinite(rate)) r.UnitCost = `$${formatAdditionRateLabel(rate)}/SF`;
        const sfRaw = getUnitValueNumber(r);
        if (
          (sfRaw === null || !Number.isFinite(sfRaw) || sfRaw <= 0) &&
          !hasManualPlanningQtyOverrideStored(r)
        ) {
          r.UnitValue = formatLocaleInt(Math.round(HM_CAFETERIA_BASIS_SF));
        }
      } else if (sys === "06_light modernization" && proj === "Lightly modernize cafeteria") {
        r.Unit = "SF";
        const rate = getLightModernizeCafeteriaRatePerSf();
        if (Number.isFinite(rate)) r.UnitCost = `$${formatAdditionRateLabel(rate)}/SF`;
        const sfRaw = getUnitValueNumber(r);
        if (
          (sfRaw === null || !Number.isFinite(sfRaw) || sfRaw <= 0) &&
          !hasManualPlanningQtyOverrideStored(r)
        ) {
          r.UnitValue = formatLocaleInt(Math.round(HM_CAFETERIA_BASIS_SF));
        }
      }
    });
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

  /**
   * Condition metric (e.g. numeric ConditionSource) does not fill UnitValue. For Poor, included rows with
   * count-style units and blank quantity, default to 1 so unit cost × qty shows a planning stub.
   */
  function applyDefaultCountableQuantityForCosting(row, excludedByScore) {
    // Good rows normally skip default qty; shade structure (Yes) still shows planning $ in Replacement Cost.
    if (excludedByScore && !isCampusYesNoReferenceAssetRow(row)) return;
    if (row && row.__excludedFromTotals) return;
    const u = normalizeUnit(row?.Unit, row?.UnitCost);
    if (!u) return;
    if (u === "PERCENT" || u === "PERCENTAGE" || u === "%") return;
    if (u === "PROJECT COST" && norm(row?.AssetType).toLowerCase() === "ada compliance") return;
    if (shouldUseSchoolSqfForRow(row)) return;
    if (hasManualPlanningQtyOverrideStored(row)) return;
    if (isManualQtyPlanningAssetRow(row)) return;
    const countable =
      u === "QUANTITY" || u === "EA" || u === "EACH" || u === "ACRE" || u === "ACRES";
    if (!countable) return;
    if (norm(getRawUnitValue(row))) return;
    row.UnitValue = "1";
  }

  /**
   * Condition Good = excluded from need totals; clear replacement $ (and unit value for most rows).
   * Manual planning rows keep UV / show rules above. Rows with SF from the Jeffco room schedule keep **Unit Value**
   * for reference when Good, but clear **Replacement Cost** (no $ need) unless the user saved a planning qty override.
   * Preserves decision-path wording "Not included".
   */
  function clearQuantitiesAndCostsForGoodCondition(rows, contextUid, schoolName, decisionRow, profileProjectSchoolName) {
    const ctxUid = normUid(contextUid || "");
    const ctxSchool = norm(schoolName || "");
    (rows || []).forEach((r) => {
      if (norm(r?.ConditionScore || r?.__libraryScore).toLowerCase() !== "good") return;
      if (isCampusYesNoReferenceAssetRow(r)) return;
      const rc = norm(r?.ReplacementCost);

      const uid = normUid(r?.UniqueID) || ctxUid;
      const sn = norm(r?.SchoolName) || ctxSchool;
      const scheduleSf = getScheduleSfForMappedProjectRow(r, uid, sn, decisionRow || null, profileProjectSchoolName || "");
      const hasScheduleSf = scheduleSf != null && Number.isFinite(scheduleSf) && scheduleSf > 0;

      if (isManualQtyPlanningAssetRow(r)) {
        const q = getUnitValueNumber(r);
        const hasPlanningQty = q !== null && Number.isFinite(q) && q > 0;
        if (hasManualPlanningQtyOverrideStored(r) || hasPlanningQty) return;
        if (rc && !/not included/i.test(rc)) r.ReplacementCost = "";
        return;
      }

      if (hasScheduleSf) {
        if (!hasManualPlanningQtyOverrideStored(r)) {
          r.UnitValue = formatLocaleInt(Math.round(scheduleSf));
        }
        if (hasManualPlanningQtyOverrideStored(r)) return;
        if (rc && !/not included/i.test(rc)) r.ReplacementCost = "";
        return;
      }

      r.UnitValue = "";
      if (rc && !/not included/i.test(rc)) r.ReplacementCost = "";
    });
  }

  /** Heavy + light modernization share the same physical scope — don't double-count the light line. */
  const HEAVY_LIGHT_MODERNIZATION_PAIRS = [
    ["Heavily modernize admin", "Lightly modernize admin"],
    ["Heavily modernize classrooms", "Lightly modernize classrooms"],
    ["Heavily modernize gym / assembly space", "Lightly modernize gym / assembly space"],
    ["Heavily modernize cafeteria", "Lightly modernize cafeteria"],
    ["Heavily modernize multipurpose room", "Lightly modernize multipurpose room"],
  ];

  /** True if the row still reflects authored project-list CSV inputs (quantity or condition pivot). */
  function rowHasHeavyLightPivotInput(r) {
    if (!r) return false;
    if (norm(getRawUnitValue(r))) return true;
    if (norm(r.__pivotConditionScore)) return true;
    if (norm(r.ConditionSource)) return true;
    return false;
  }

  /**
   * When only one side of a heavy/light pair exists in rowwise CSV, copy shared pivot fields from the
   * sibling so Unit Value / condition inputs need not be duplicated. UnitCost and SystemCategory stay
   * per library row; replacement $ still uses each row's own $/SF × quantity.
   */
  function synthesizeHeavyLightModernizationPivotFromSibling(rows) {
    if (!rows || !rows.length) return;
    const byPk = new Map();
    rows.forEach((r) => {
      const pk = normProjectKey(norm(r?.AssetType));
      if (pk) byPk.set(pk, r);
    });
    HEAVY_LIGHT_MODERNIZATION_PAIRS.forEach(([heavyName, lightName]) => {
      const heavyRow = byPk.get(normProjectKey(heavyName));
      const lightRow = byPk.get(normProjectKey(lightName));
      if (!heavyRow || !lightRow) return;
      const hIn = rowHasHeavyLightPivotInput(heavyRow);
      const lIn = rowHasHeavyLightPivotInput(lightRow);
      if (hIn && !lIn && !hasManualPlanningQtyOverrideStored(lightRow)) {
        lightRow.UnitValue = heavyRow.UnitValue;
        lightRow.ConditionSource = heavyRow.ConditionSource;
        lightRow.__pivotConditionScore = heavyRow.__pivotConditionScore;
        lightRow.__csvPriority = heavyRow.__csvPriority;
        lightRow.__heavyLightPivotFromSibling = "heavy";
      } else if (lIn && !hIn && !hasManualPlanningQtyOverrideStored(heavyRow)) {
        heavyRow.UnitValue = lightRow.UnitValue;
        heavyRow.ConditionSource = lightRow.ConditionSource;
        heavyRow.__pivotConditionScore = lightRow.__pivotConditionScore;
        heavyRow.__csvPriority = lightRow.__csvPriority;
        heavyRow.__heavyLightPivotFromSibling = "light";
      }
    });
  }

  function suppressLightModernizationWhenHeavyIncluded(rows) {
    const visible = (rows || []).filter((r) => !r.__hiddenBySchoolLevel);
    const byPk = new Map();
    visible.forEach((r) => {
      const pk = normProjectKey(norm(r?.AssetType));
      if (pk) byPk.set(pk, r);
    });
    HEAVY_LIGHT_MODERNIZATION_PAIRS.forEach(([heavyName, lightName]) => {
      const heavyRow = byPk.get(normProjectKey(heavyName));
      const lightRow = byPk.get(normProjectKey(lightName));
      if (!heavyRow || !lightRow) return;
      if (heavyRow.__excludedFromTotals) return;
      lightRow.__excludedFromTotals = true;
      if (!lightRow.__excludedReason) lightRow.__excludedReason = "heavy_mod";
      lightRow.UnitValue = "";
      const rc = norm(lightRow?.ReplacementCost);
      if (rc && !/not included/i.test(rc)) lightRow.ReplacementCost = "";
    });
  }

  function computeReplacementCost(row, decision) {
    const unit = normalizeUnit(row?.Unit, row?.UnitCost);
    const unitCost = parseUnitCostNumber(row?.UnitCost);
    if (!unit || unitCost === null) return null;

    const q = computeDerivedQuantity(row, decision);
    if (q === null) return null;

    return unitCost * q;
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
      const uid = normUid(uniqueId);
      if (!uid || !window.localStorage) return 2;
      const legacy = norm(uniqueId);
      const raw =
        window.localStorage.getItem(`jeffco_addition_stories_v1:${uid}`) ??
        (legacy !== uid ? window.localStorage.getItem(`jeffco_addition_stories_v1:${legacy}`) : null);
      const n = raw ? Number(raw) : 2;
      if (n === 3) return 3;
      if (n === 2) return 2;
      // Legacy 1-story preference removed — treat as 2-story
      return 2;
    } catch {
      return 2;
    }
  }

  function saveAdditionStoriesForSchool(uniqueId, stories) {
    try {
      const uid = normUid(uniqueId);
      if (!uid || !window.localStorage) return;
      window.localStorage.setItem(`jeffco_addition_stories_v1:${uid}`, String(stories));
    } catch {
      // ignore
    }
  }

  function loadAdditionCollapsedForSchool(uniqueId) {
    try {
      const uid = normUid(uniqueId);
      if (!uid || !window.localStorage) return false;
      const legacy = norm(uniqueId);
      const raw =
        window.localStorage.getItem(`jeffco_addition_collapsed_v1:${uid}`) ??
        (legacy !== uid ? window.localStorage.getItem(`jeffco_addition_collapsed_v1:${legacy}`) : null);
      return raw === "1";
    } catch {
      return false;
    }
  }

  function saveAdditionCollapsedForSchool(uniqueId, collapsed) {
    try {
      const uid = normUid(uniqueId);
      if (!uid || !window.localStorage) return;
      window.localStorage.setItem(`jeffco_addition_collapsed_v1:${uid}`, collapsed ? "1" : "0");
    } catch {
      // ignore
    }
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
      const val = v && typeof v === "object" && "value" in v ? v.value : v;
      const text =
        v && typeof v === "object" && ("label" in v || "value" in v)
          ? String(v.label !== undefined ? v.label : v.value)
          : String(v);
      const lbl = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = cbClass;
      cb.value = val;
      cb.checked = true;
      lbl.appendChild(cb);
      lbl.append(" " + text);
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

    // New 2/3-story addition lines are "Site specific" (not summed from planner $/SF).

    if (elTotalP1Cost) elTotalP1Cost.textContent = t["1"] ? formatLocaleUsdInteger(t["1"]) : "—";
    if (elTotalP2Cost) elTotalP2Cost.textContent = t["2"] ? formatLocaleUsdInteger(t["2"]) : "—";
    if (elTotalP3Cost) elTotalP3Cost.textContent = t["3"] ? formatLocaleUsdInteger(t["3"]) : "—";
    if (elTotalP4Cost) elTotalP4Cost.textContent = t["4"] ? formatLocaleUsdInteger(t["4"]) : "—";

    const included = getIncludedPriorities();
    let total = 0;
    ["1", "2", "3", "4"].forEach((p) => { if (included.has(p)) total += (t[p] || 0); });
    total = Math.round(total);
    elTotalReplacementCost.textContent = total ? formatLocaleUsdInteger(total) : "—";
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
      if (q) {
        const hay = DISPLAY_COLS.map((c) => norm(getCellValue(r, c))).join(" | ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (!getShowRowsWithoutReplacementCost() && !rowHasReplacementCostInformation(r)) return false;
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

  function computeFciAssetRollupByP(assetRows) {
    const byP = { "1": 0, "2": 0, "3": 0, "4": 0 };
    (assetRows || []).forEach((ar) => {
      if (ar && ar.__excludedFromTotals) return;
      const rc = parseNumberMaybe(ar?.ReplacementCost);
      if (rc === null) return;
      const p = norm(getPriorityForRow(ar));
      if (byP.hasOwnProperty(p)) byP[p] += rc;
      else byP["2"] += rc;
    });
    return byP;
  }

  function getExportPriorityFilterLabel() {
    const filteredPriorities = getFilteredPriorities();
    const totalPriorityCbs = document.querySelectorAll(".priority-filter-cb").length;
    const allPrioritiesSelected = filteredPriorities.size === 0 || filteredPriorities.size === totalPriorityCbs;
    return allPrioritiesSelected
      ? "P1–P4"
      : "P" + Array.from(filteredPriorities).sort().join(", P");
  }

  /**
   * Rows currently visible in the assets table after super/group/FCI-asset collapse (matches on-screen table body).
   */
  function collectVisibleExportSections() {
    function getSuperGroupKey(groupName) {
      const g = norm(groupName).toLowerCase();
      if (g.startsWith("00") || g.startsWith("01") || g.startsWith("02") || g.startsWith("03") || g.startsWith("04") || g.startsWith("05") || g.startsWith("06")) return "Projects";
      if (g.startsWith("08")) return "FCI Deficiency";
      return null;
    }

    const sections = [];
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
      if (isSuperGroup && collapsedSuperGroups.has(sgKey)) return;

      const isFciParent = sgKey === "FCI Deficiency";

      groups.forEach((g) => {
        const groupKey = g.__group;
        if (collapsedGroups.has(groupKey)) return;

        if (isFciParent) {
          const fciAssetGroups = new Map();
          (g.__rows || []).forEach((r) => {
            const at = norm(r?.AssetType) || "(Unknown)";
            if (!fciAssetGroups.has(at)) fciAssetGroups.set(at, []);
            fciAssetGroups.get(at).push(r);
          });
          const sortedEntries = Array.from(fciAssetGroups.entries()).sort((a, b) =>
            a[0].localeCompare(b[0], undefined, { sensitivity: "base", numeric: true })
          );
          const priorityLabel = getExportPriorityFilterLabel();
          const catByP = computeGroupByP(g.__rows);
          const catSum = catByP["1"] + catByP["2"] + catByP["3"] + catByP["4"];
          const items = [];
          items.push({ type: "categorySubtotal", groupKey, byP: catByP, sum: catSum });

          sortedEntries.forEach(([at, assetRows]) => {
            if (!assetRows.length) return;
            const collapseKey = groupKey + "||" + at;
            const isSiteInfra = isSiteInfrastructureFciGroupKey(groupKey);
            const isAssetCollapsed = isSiteInfra
              ? !expandedFciSiteInfraAssets.has(collapseKey)
              : collapsedFciAssets.has(collapseKey);
            const assetByP = computeFciAssetRollupByP(assetRows);
            const assetSum = assetByP["1"] + assetByP["2"] + assetByP["3"] + assetByP["4"];
            /* Match on-screen table: rollup band always prints; detail rows only when band is expanded. */
            items.push({
              type: "rollup",
              assetType: at,
              byP: assetByP,
              sum: assetSum,
              priorityLabel,
            });
            if (!isAssetCollapsed) {
              assetRows.forEach((r) => items.push({ type: "row", row: r }));
            }
          });

          sections.push({ groupKey, isFci: true, items });
        } else {
          const rowsOut = [];
          (g.__rows || []).forEach((r) => rowsOut.push(r));
          if (rowsOut.length) sections.push({ groupKey, isFci: false, rows: rowsOut });
        }
      });
    });

    return sections;
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

    const thToggle = document.createElement("th");
    thToggle.className = "col-include-toggle";
    thToggle.textContent = "";
    thToggle.title = "Include row in planning totals";
    trh.appendChild(thToggle);

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
        sgTd.colSpan = tableTotalColumnCount();
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
        if (sgKey === "FCI Deficiency") {
          if (countFciAssetBands() > 0) {
            const tools = document.createElement("div");
            tools.className = "fci-deficiency-tools";
            const allBandsOut = allFciAssetBandsExpanded();
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "fci-deficiency-tool-btn";
            btn.title = allBandsOut
              ? "Collapse all P1–P4 asset bands (sub-rows under each category)"
              : "Expand all P1–P4 asset bands (sub-rows under each category)";
            btn.setAttribute(
              "aria-label",
              allBandsOut ? "Collapse all P1–P4 asset bands" : "Expand all P1–P4 asset bands"
            );
            btn.innerHTML = allBandsOut
              ? '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
                '<circle cx="5" cy="7" r="1.6" fill="currentColor"/><rect x="9" y="6" width="7" height="2.2" rx="1" fill="currentColor"/>' +
                '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><rect x="9" y="11" width="7" height="2.2" rx="1" fill="currentColor"/>' +
                '<circle cx="5" cy="17" r="1.6" fill="currentColor"/><rect x="9" y="16" width="7" height="2.2" rx="1" fill="currentColor"/>' +
                '<path d="M18.5 8V5.5H16M18.5 16v2.5H16M21 7l-2.5 2-2.5-2M21 17l-2.5-2-2.5 2" stroke="currentColor" stroke-width="1.35" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
                "</svg>"
              : '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
                '<circle cx="5" cy="7" r="1.6" fill="currentColor"/><rect x="9" y="6" width="7" height="2.2" rx="1" fill="currentColor"/>' +
                '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><rect x="9" y="11" width="7" height="2.2" rx="1" fill="currentColor"/>' +
                '<circle cx="5" cy="17" r="1.6" fill="currentColor"/><rect x="9" y="16" width="7" height="2.2" rx="1" fill="currentColor"/>' +
                '<path d="M18.5 5.5V9M18.5 15v3.5M16 7l2.5-2 2.5 2M16 17l2.5 2 2.5-2" stroke="currentColor" stroke-width="1.35" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
                "</svg>";
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              toggleAllFciAssetBands();
            });
            tools.appendChild(btn);
            sgHeader.appendChild(tools);
          }
        } else {
          const sgSub = document.createElement("span");
          sgSub.className = "group-subtotal";
          sgSub.textContent = superTotal ? formatLocaleUsdInteger(superTotal) : "";
          if (superTotal) {
            sgSub.title = ["P1: " + formatLocaleUsdInteger(superByP["1"]),
              "P2: " + formatLocaleUsdInteger(superByP["2"]),
              "P3: " + formatLocaleUsdInteger(superByP["3"]),
              "P4: " + formatLocaleUsdInteger(superByP["4"])].join("\n");
          }
          sgHeader.appendChild(sgSub);
        }
        sgTd.appendChild(sgHeader);
        sgTr.appendChild(sgTd);
        sgTr.addEventListener("click", (e) => {
          if (e.target.closest(".fci-deficiency-tools")) return;
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
      td.colSpan = tableTotalColumnCount();
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
      subtotalSpan.textContent = groupSubtotal ? formatLocaleUsdInteger(groupSubtotal) : "";
      if (groupSubtotal) {
        const lines = ["P1: " + formatLocaleUsdInteger(groupByP["1"]),
          "P2: " + formatLocaleUsdInteger(groupByP["2"]),
          "P3: " + formatLocaleUsdInteger(groupByP["3"]),
          "P4: " + formatLocaleUsdInteger(groupByP["4"])];
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
        infoTd.colSpan = tableTotalColumnCount();
        infoTd.style.padding = "10px";

        const TARGETS = [
          { key: "elementary", label: "Elementary (ES)", gsfPerStudent: 110 },
          { key: "middle", label: "Middle School (MS)", gsfPerStudent: 135 },
          { key: "k8", label: "K–8", gsfPerStudent: 125 },
          { key: "high", label: "High School (HS)", gsfPerStudent: 180 },
        ];

        const studentsOverText =
          additionPlanningState.studentsOver != null ? Number(additionPlanningState.studentsOver).toLocaleString(DISPLAY_NUMBER_LOCALE) : "—";
        const gsfText = additionPlanningState.gsfTarget != null ? Number(additionPlanningState.gsfTarget).toLocaleString(DISPLAY_NUMBER_LOCALE) : "—";
        const story = additionPlanningState.stories === 3 ? 3 : 2;
        const isCollapsed = !!additionPlanningState.collapsed;
        const planDecision = getDecisionForResolvedSchool();
        const r2 = getAdditionStoryRatePerSf(2, planDecision);
        const r3 = getAdditionStoryRatePerSf(3, planDecision);
        const story2RateLabel = formatAdditionRateLabel(r2 !== null ? r2 : ADDITION_STORY_FALLBACK_SF[2]);
        const story3RateLabel = formatAdditionRateLabel(r3 !== null ? r3 : ADDITION_STORY_FALLBACK_SF[3]);
        const ncLabel = (() => {
          const p = getAdditionBaseNewConstructionProject(planDecision);
          if (p === "New Construction ES") return "ES new-school rate";
          if (p === "New Construction MS") return "MS new-school rate";
          if (p === "New Construction HS") return "HS new-school rate";
          if (p === "New Construction K-8") return "K–8 new-school rate";
          return "new-school rate";
        })();

        infoTd.innerHTML =
          `<div class="addition-info ${isCollapsed ? "is-collapsed" : ""}">` +
          `<div class="addition-header">` +
          `<div class="title">Building Addition</div>` +
          `<button type="button" class="addition-collapse" aria-expanded="${!isCollapsed}">${isCollapsed ? "See details" : "Hide details"}</button>` +
          `</div>` +
          `<div class="addition-body">` +
          `<div class="addition-story-row">` +
          `<div class="addition-note">Stories included in total cost (${escapeHtmlText(ncLabel)}; 3-story +5% foundations):</div>` +
          `<div class="story-toggle" role="group" aria-label="Addition stories">` +
          `<button type="button" data-stories="2" aria-pressed="${story === 2}">2 story ($${story2RateLabel}/SF)</button>` +
          `<button type="button" data-stories="3" aria-pressed="${story === 3}">3 story ($${story3RateLabel}/SF)</button>` +
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
              if (next !== 2 && next !== 3) return;
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

        const fciSortedAssetEntries = Array.from(fciAssetGroups.entries()).sort((a, b) =>
          a[0].localeCompare(b[0], undefined, { sensitivity: "base", numeric: true })
        );

        fciSortedAssetEntries.forEach(([at, assetRows]) => {
          if (!assetRows.length) return;

          const collapseKey = groupKey + "||" + at;
          const isSiteInfra = isSiteInfrastructureFciGroupKey(groupKey);
          const isAssetCollapsed = isSiteInfra
            ? !expandedFciSiteInfraAssets.has(collapseKey)
            : collapsedFciAssets.has(collapseKey);

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
          const rollupToggleTd = document.createElement("td");
          rollupToggleTd.className = "col-include-toggle fci-rollup-toggle-spacer";
          rollupTr.appendChild(rollupToggleTd);
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
              cell.textContent = sum ? formatLocaleUsdInteger(sum) : "";
              const tooltip = ["P1: " + formatLocaleUsdInteger(byP["1"]),
                "P2: " + formatLocaleUsdInteger(byP["2"]),
                "P3: " + formatLocaleUsdInteger(byP["3"]),
                "P4: " + formatLocaleUsdInteger(byP["4"])];
              cell.title = tooltip.join("\n");
            } else {
              cell.textContent = "";
            }
            rollupTr.appendChild(cell);
          });
          rollupTr.addEventListener("click", () => {
            if (isSiteInfra) {
              if (expandedFciSiteInfraAssets.has(collapseKey)) expandedFciSiteInfraAssets.delete(collapseKey);
              else expandedFciSiteInfraAssets.add(collapseKey);
            } else if (collapsedFciAssets.has(collapseKey)) collapsedFciAssets.delete(collapseKey);
            else collapsedFciAssets.add(collapseKey);
            render();
          });
          tbody.appendChild(rollupTr);

          if (!isAssetCollapsed) {
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
          if (r.__excludedReason === "good" || r.__excludedReason === "heavy_mod") tr.classList.add("excluded-good");
        }
        {
          const rcNum = r ? parseNumberMaybe(r.ReplacementCost) : null;
          if (r && r.__excludedFromTotals && rcNum !== null && rcNum > 0 && !r.__isRollup) {
            tr.classList.add("excluded-but-has-rc");
          }
        }
        if (
          r &&
          isCampusYesNoReferenceAssetRow(r) &&
          norm(r?.ConditionScore || r?.__libraryScore).toLowerCase() === "good" &&
          r.__rowIncludeToggleOn !== false
        ) {
          tr.classList.add("campus-yes-cost-row");
        }
        if (r && hasManualPlanningQtyOverrideStored(r)) {
          tr.classList.add("planning-qty-committed-row");
        }
        const toggleTd = document.createElement("td");
        toggleTd.className = "col-include-toggle";
        if (r) toggleTd.appendChild(createRowIncludeToggleControl(r));
        tr.appendChild(toggleTd);

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
                } else if (r.__excludedFromTotals) {
                  b.disabled = true;
                  b.style.opacity = "0.45";
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
              if (!isExternal && r.__excludedFromTotals) {
                b.disabled = true;
                b.style.opacity = "0.45";
                b.style.cursor = "default";
              } else if (!isExternal) {
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
              (assetTypeRaw === "New 2-story building" || assetTypeRaw === "New 3-story building");

            if (isAdditionStoryRow) {
              const storyForRow = assetTypeRaw === "New 3-story building" ? 3 : 2;
              const rowDecision = getDecisionForResolvedSchool();
              const rateFromNc = getAdditionStoryRatePerSf(storyForRow, rowDecision);
              const fallback = ADDITION_STORY_FALLBACK_SF[storyForRow] || 0;
              const rate =
                rateFromNc !== null && Number.isFinite(rateFromNc) ? rateFromNc : fallback;
              const isSelected =
                (additionPlanningState.stories === 3 ? 3 : 2) === storyForRow;
              const addCostForRow =
                additionPlanningState.gsfTarget != null ? Math.round(Number(additionPlanningState.gsfTarget) * rate) : 0;

              if (col === "UnitCost") {
                const text = rate ? `$${formatAdditionRateLabel(rate)}/SF` : "—";
                cell.textContent = text;
                cell.title = text;
                if (!isSelected) cell.classList.add("muted");
              } else if (col === "UnitValue") {
                const v = additionPlanningState.gsfTarget != null ? Math.round(Number(additionPlanningState.gsfTarget)) : null;
                const text = v !== null ? v.toLocaleString(DISPLAY_NUMBER_LOCALE) : "—";
                cell.textContent = text;
                cell.title = text;
                if (!isSelected) cell.classList.add("muted");
              } else if (col === "ReplacementCost") {
                const score = norm(r?.ConditionScore || r?.__libraryScore).toLowerCase();
                if (score === "good") {
                  cell.textContent = "—";
                  cell.title = "";
                  cell.classList.add("muted");
                } else if (isReplacementCostPlaceholder(r?.ReplacementCost)) {
                  cell.textContent = RC_PLACEHOLDER;
                  cell.title = "";
                  if (!isSelected) cell.classList.add("muted");
                } else {
                  const text = addCostForRow ? formatLocaleUsdInteger(addCostForRow) : "—";
                  cell.textContent = text;
                  cell.title = text;
                  if (isSelected) cell.classList.add("cost-highlight");
                  else cell.classList.add("muted");
                }
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

            if (col === "UnitValue" && manualPlanningQtyCellEditable(r) && !isFciParent) {
              cell.appendChild(createManualPlanningQtyInput(r));
              tr.appendChild(cell);
              return;
            }

            let v = "";
            // Condition score: numeric metric (2 decimals), not Good/Poor labels
            if (col === "ConditionScore") {
              if (isSiteInfrastructureRow(r)) {
                cell.textContent = "";
                cell.title = "";
                cell.classList.remove("muted");
                if (shouldShowNewBuildingSiteInfraFciNote()) {
                  const span = document.createElement("span");
                  span.className = "site-infra-fci-note";
                  span.textContent = "No FCI — new building.";
                  span.title =
                    "There is no FCI for site infrastructure because this campus includes a new building.";
                  cell.appendChild(span);
                } else {
                  cell.classList.add("muted");
                }
              } else {
              const text = getCellValue(r, col);
              const display = norm(text) ? text : "—";
              appendConditionScoreVisual(cell, r, display, !!isFciParent);
              cell.title = display;
              if (!isFciParent) {
                const k = display.toLowerCase();
                if (k === "n/a" || k === "na") cell.classList.add("score-na");
                else if (display === "—" || display === "-") cell.classList.add("muted");
              }
              }
            } else {
              v = getCellValue(r, col);
              if (col === "UnitValue") {
                const u = normalizeUnit(r?.Unit, r?.UnitCost);
                const isAdaPct =
                  norm(r?.SystemCategory) === "00_general" &&
                  norm(r?.AssetType).toLowerCase() === "ada compliance" &&
                  (u === "PERCENTAGE" || u === "PERCENT" || u === "%" || u === "PROJECT COST");
                if (isAdaPct && norm(v) && !String(v).includes("%")) {
                  v = `${v}%`;
                }
              } else if (col === "UnitCost") v = formatDisplayUnitCostCell(v);
              else if (col === "ReplacementCost") v = formatDisplayReplacementCell(v);
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
            // Always show a computed $ total in normal (black) text — including planning SF × $/SF.
            if (col === "ReplacementCost" && norm(v)) {
              if (!isFciParent) {
                if (isDemolition) {
                  if (!keepBlackForDemolitionCost) cell.classList.add("muted");
                } else {
                  const campusYesGood =
                    isCampusYesNoReferenceAssetRow(r) &&
                    norm(r?.ConditionScore || r?.__libraryScore).toLowerCase() === "good";
                  const rcParsed = parseNumberMaybe(r?.ReplacementCost);
                  const hasNumericReplacement =
                    rcParsed !== null && Number.isFinite(rcParsed);
                  if (!keepBlackForCosts && !campusYesGood && !hasNumericReplacement) {
                    cell.classList.add("muted");
                  }
                }
              }
            }

            // FCI Deficiency: grey out UnitCost, UnitValue (condition column muted inside widget)
            if (isFciParent && (col === "UnitCost" || col === "UnitValue")) {
              cell.classList.add("muted");
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

    const systems = uniqueSorted(schoolRows.map((r) => r.SystemCategory));
    const assets = uniqueSorted(schoolRows.map((r) => r.AssetType)).map((a) => ({
      value: a,
      label: displayProjectTypeLabel({ AssetType: a }),
    }));

    if (elSystemDropdown) {
      buildMultiSelectDropdown(elSystemDropdown, systems, "system-filter-cb");
      if (prevSystems.size) restoreMultiSelectState(elSystemDropdown, "system-filter-cb", prevSystems, elSystemLabel);
    }
    if (elAssetDropdown) {
      buildMultiSelectDropdown(elAssetDropdown, assets, "asset-filter-cb");
      if (prevAssets.size) restoreMultiSelectState(elAssetDropdown, "asset-filter-cb", prevAssets, elAssetLabel);
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

  function escapeHtmlText(s) {
    return norm(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /** Category expand/collapse and FCI drill-in state must not carry across facilities or the next school can render with every section still collapsed. */
  function resetProjectTableUiStateForSchoolChange() {
    collapsedGroups.clear();
    collapsedSuperGroups.clear();
    collapsedFciAssets.clear();
    expandedFciSiteInfraAssets.clear();
    if (elSearch) elSearch.value = "";
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

    resetProjectTableUiStateForSchoolChange();

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
      const profileProjectSchoolName = norm(rawSchoolRows[0]?.SchoolName ?? "");
      const rows = buildRowsFromRowwise(rawSchoolRows);
      hydrateAdditionStoryUnitCosts(rows, decision);
      hydrateNewCafeteriaKitchenUnitCost(rows, decision);
      hydrateNewGymLockersUnitCost(rows);
      applyRoomScheduleUnitValues(rows, uid, nm, decision, profileProjectSchoolName);
      hydrateHeavyLightKitchenCafeteriaModUnitCosts(rows, decision);
      hydrateAdaComplianceUnitValue(rows, decision);
      hydrateManualQtyOverrides(rows);
      hydratePlaygroundDefaultPlanningSf(rows);
      synthesizeHeavyLightModernizationPivotFromSibling(rows);

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

      rows.forEach((r) => {
        r.__schoolLabel = nm;
        r.__rowId = rowId++;
        const systemCategory = norm(r?.SystemCategory);

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
        if ((schoolNeedsGutReno || schoolNeedsNewConstruction) && !DECISION_GUT_OR_NC_PROJECT_SCOPE_CATEGORIES.has(systemCategory)) {
          if (!(isFciCat && getIncludeFciForMajor())) {
            r.__excludedFromTotals = true;
            r.__excludedReason = "decision";
          }
        }

        const lib = unitCostIndex ? unitCostIndex.get(makeUnitCostKey(r.SystemCategory, r.AssetType)) : null;
        let computed = deriveGutRenovationNewConstructionConditionScore(r, schoolNeedsGutReno, schoolNeedsNewConstruction);
        if (computed === null) {
          computed = computeConditionScoreFromValue(r, lib);
        }
        const conditionResolved = computed === "Good" || computed === "Poor";
        if (conditionResolved) {
          r.ConditionScore = computed;
          r.__libraryScore = computed;
        } else {
          r.ConditionScore = "";
          r.__libraryScore = "";
        }

        hydrateScheduleSfIntoUnitValue(r, uid, nm, decision, profileProjectSchoolName);

        if (needsStrictConditionMetricForCosting(systemCategory) && !conditionResolved) {
          if (strictMetricUnresolvedBypass(r)) {
            r.ConditionScore = "Poor";
            r.__libraryScore = "Poor";
          } else {
            if (!r.__excludedFromTotals) {
              r.__excludedFromTotals = true;
              r.__excludedReason = "unresolved";
            }
            if (systemCategory !== "05_heavy modernization" && systemCategory !== "06_light modernization") {
              r.UnitValue = "";
            }
            r.ReplacementCost = "";
            return;
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

        applyDefaultCountableQuantityForCosting(r, excludedByScore);

        const derivedQ = computeDerivedQuantity(r, decision);
        if (
          derivedQ !== null &&
          shouldUseSchoolSqfForRow(r) &&
          !hasManualPlanningQtyOverrideStored(r)
        ) {
          r.UnitValue = Number.isFinite(derivedQ) ? formatLocaleInt(Math.round(derivedQ)) : String(derivedQ);
        }

        if (
          isCampusYesNoReferenceAssetRow(r) &&
          norm(r?.ConditionScore || r?.__libraryScore).toLowerCase() === "good" &&
          !hasManualPlanningQtyOverrideStored(r)
        ) {
          r.UnitValue = "1";
        }

        const rc = computeReplacementCost(r, decision);
        if (rc !== null && Number.isFinite(rc)) {
          r.ReplacementCost = formatLocaleUsdInteger(Math.round(rc));
        }
      });

      stripManualPlanningStubQuantity(rows);

      clearQuantitiesAndCostsForGoodCondition(rows, uid, nm, decision, profileProjectSchoolName);
      suppressLightModernizationWhenHeavyIncluded(rows);
      applySiteSpecificReplacementCostLabels(rows);
      applyManualQtySiteSpecificLabels(rows);
      applyFurnitureUpgradesLumpSumReplacementCosts(rows, decision);

      snapshotNaturalRowIncludeState(rows);
      pruneRowIncludeToggleOverridesAgainstDefaults(rows);
      applyRowIncludeToggleOverrides(rows);

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

      let rollupMetricSum = 0;
      let rollupMetricCount = 0;
      rows.forEach((r) => {
        const lib = unitCostIndex ? unitCostIndex.get(makeUnitCostKey(r.SystemCategory, r.AssetType)) : null;
        const mn = getConditionMetricNumberForDisplay(r, lib);
        if (mn !== null && Number.isFinite(mn)) {
          rollupMetricSum += mn;
          rollupMetricCount += 1;
        }
      });
      let rollupConditionScoreDisplay =
        rollupMetricCount > 0 ? formatLocaleDecimal(rollupMetricSum / rollupMetricCount, 2, 2) : "";
      if (SITE_INFRA_CATS.has(norm(first.SystemCategory).toLowerCase())) {
        rollupConditionScoreDisplay = "";
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

      let rollupReplacementCost = "";
      const anyChildIncludedInTotals = rows.some((sub) => !sub.__excludedFromTotals);
      const allChildrenToggleOn = rows.length > 0 && rows.every((sub) => sub && !sub.__excludedFromTotals);
      if (!excludedByScore) {
        if (totalCost) {
          rollupReplacementCost = formatLocaleUsdInteger(Math.round(totalCost));
        } else if (isSiteSpecificReplacementRow(first)) {
          rollupReplacementCost = RC_PLACEHOLDER;
        } else if (
          isManualQtyPlanningAssetRow(first) &&
          rows.some((sub) => !sub.__excludedFromTotals)
        ) {
          rollupReplacementCost = RC_PLACEHOLDER;
        }
      }

      let rollupUnitValue = "";
      const activeRows = rows.filter((r) => !r.__excludedFromTotals);
      const u = normalizeUnit(first?.Unit, first?.UnitCost);
      const isPercent =
        u === "PERCENT" || u === "PERCENTAGE" || u === "%" ||
        (u === "PROJECT COST" && norm(first?.AssetType).toLowerCase() === "ada compliance");
      const sumSfAcrossSchools = isSquareFootMeasureUnit(u);
      const sysFirst = norm(first?.SystemCategory);
      /** Heavy/light mod: schedule-filled UV often exists while rows stay excluded (unresolved "Default" metric). Still show Σ qty across the portfolio. */
      const portfolioHeavyLightModRollup =
        !isPercent && (sysFirst === "05_heavy modernization" || sysFirst === "06_light modernization");

      if (isPercent) {
        rollupUnitValue = first.UnitValue || "";
      } else if (sumSfAcrossSchools || portfolioHeavyLightModRollup) {
        let sum = 0;
        let any = false;
        rows.forEach((r) => {
          const n = getUnitValueNumber(r);
          if (n != null && Number.isFinite(n)) {
            sum += n;
            any = true;
          }
        });
        rollupUnitValue = any ? formatLocaleInt(Math.round(sum)) : "";
      } else if (!activeRows.length) {
        rollupUnitValue = "";
      } else {
        let sum = 0;
        let any = false;
        activeRows.forEach((r) => {
          const n = getUnitValueNumber(r);
          if (n != null && Number.isFinite(n)) {
            sum += n;
            any = true;
          }
        });
        let showSummedQty = any;
        if (showSummedQty && activeRows.length > 1) {
          const ucs = activeRows.map((r) => parseUnitCostNumber(r?.UnitCost));
          const allParsed = ucs.every((n) => n != null && Number.isFinite(n));
          if (!allParsed) {
            showSummedQty = false;
          } else {
            const ref = ucs[0];
            showSummedQty = ucs.every((n) => Math.abs(n - ref) < 0.5);
          }
        }
        rollupUnitValue = showSummedQty ? formatLocaleInt(Math.round(sum)) : "";
      }

      rollupRows.push({
        UniqueID: "",
        SchoolName: "",
        SystemCategory: first.SystemCategory,
        AssetType: first.AssetType,
        ConditionScore: rollupConditionScoreDisplay,
        ConditionSource: first.ConditionSource,
        Unit: first.Unit,
        UnitCost: first.UnitCost,
        UnitValue: rollupUnitValue,
        ReplacementCost: rollupReplacementCost,
        __libraryScore: first.__libraryScore,
        __pivotConditionScore: first.__pivotConditionScore,
        __csvPriority: "",
        __rollupPriority: rollupPriority,
        __isRollup: true,
        __rollupRows: rows,
        __rowId: rollupId++,
        __excludedFromTotals: !anyChildIncludedInTotals,
        __excludedReason: excludedByDecision ? "decision" : (excludedByScore ? "good" : ""),
        __rowIncludeToggleOn: allChildrenToggleOn,
      });
    });

    schoolRows = rollupRows;
    elSchoolNameHeader.textContent = names.length <= 3 ? names.join(", ") : `${names.length} Facilities`;
    elSchoolMeta.textContent = `${names.length} facilities selected • ${rollupRows.length} rollup project rows`;

    populateFilters();
    applyFilters();
    render();
    elExportBtn.disabled = !schoolRows.length;
  }

  function downloadFilteredCsv() {
    const flat = [];
    collectVisibleExportSections().forEach((sec) => {
      if (sec.isFci) {
        (sec.items || []).forEach((it) => {
          if (it.type !== "row") return;
          const r = it.row;
          const out = {};
          DISPLAY_COLS.forEach((c) => (out[c] = getCellValue(r, c) ?? ""));
          flat.push(out);
        });
      } else {
        (sec.rows || []).forEach((r) => {
          const out = {};
          DISPLAY_COLS.forEach((c) => (out[c] = getCellValue(r, c) ?? ""));
          flat.push(out);
        });
      }
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

    const pdfSections = collectVisibleExportSections();

    let anySchoolLabel = false;
    let tableRowCount = 0;
    pdfSections.forEach((sec) => {
      tableRowCount += 1;
      if (sec.isFci) {
        (sec.items || []).forEach((it) => {
          tableRowCount += 1;
          if (it.type === "row" && it.row && it.row.__schoolLabel) anySchoolLabel = true;
        });
      } else {
        (sec.rows || []).forEach((r) => {
          if (r.__schoolLabel) anySchoolLabel = true;
          tableRowCount += 1;
        });
      }
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

    function pushPdfDataRow(r) {
      const proj = norm(getCellValue(r, "Project Type"));
      const fac = anySchoolLabel ? norm(r.__schoolLabel || "") : "";
      const longText = Math.max(proj.length, fac.length, 24);
      const wrapLines = Math.min(5, 1 + Math.floor(longText / 36));
      estTablePt += Math.max(11, fontPt * 1.2 * wrapLines + 6);
      const campusYesPdf =
        isCampusYesNoReferenceAssetRow(r) &&
        norm(r?.ConditionScore || r?.__libraryScore).toLowerCase() === "good";
      const rcPdf = parseNumberMaybe(r?.ReplacementCost);
      const pdfExcludedButRc =
        r.__excludedFromTotals && rcPdf !== null && rcPdf > 0 && !r.__isRollup;
      const rowClass =
        (r.__excludedFromTotals ? "pdf-ex " : "") +
        (pdfExcludedButRc ? "pdf-ex-has-rc " : "") +
        (campusYesPdf ? "pdf-campus-yes " : "") +
        "pdf-data" +
        (pdfDataRowIdx % 2 === 1 ? " pdf-zebra" : "");
      pdfDataRowIdx += 1;
      const cells = [];
      if (anySchoolLabel) cells.push(esc(r.__schoolLabel || "—"));
      DISPLAY_COLS.forEach((c) => {
        const key = typeof c === "string" ? c : c.key || c;
        cells.push(esc(getCellValue(r, key) ?? ""));
      });
      bodyParts.push(`<tr class="${rowClass}"><td>` + cells.join("</td><td>") + "</td></tr>");
    }

    function pushPdfFciSubtotalRow(kind, title, priorityText, sumRounded, byP) {
      estTablePt += Math.max(11, fontPt * 1.15 + 6);
      const tip = ["P1: " + formatLocaleUsdInteger(byP["1"]),
        "P2: " + formatLocaleUsdInteger(byP["2"]),
        "P3: " + formatLocaleUsdInteger(byP["3"]),
        "P4: " + formatLocaleUsdInteger(byP["4"])].join("\n");
      const rcStr = sumRounded > 0 ? formatLocaleUsdInteger(Math.round(sumRounded)) : "";
      const cells = [];
      if (anySchoolLabel) cells.push("—");
      DISPLAY_COLS.forEach((c) => {
        const key = typeof c === "string" ? c : c.key || c;
        if (key === "Project Type") cells.push(esc(title));
        else if (key === "Priority") cells.push(esc(priorityText));
        else if (key === "ReplacementCost") cells.push(esc(rcStr));
        else cells.push("");
      });
      const cls = kind === "category" ? "pdf-fci-subtotal pdf-fci-subtotal--category" : "pdf-fci-subtotal pdf-fci-subtotal--rollup";
      bodyParts.push(
        `<tr class="${cls}" title="${esc(tip)}"><td>` + cells.join("</td><td>") + "</td></tr>"
      );
    }

    pdfSections.forEach((sec) => {
      estTablePt += Math.max(13, fontPt * 1.05 + 9);
      const gname = esc(norm(sec.groupKey) || "(Uncategorized)");
      bodyParts.push(`<tr class="pdf-group"><td colspan="${colCount}">${gname}</td></tr>`);
      if (sec.isFci) {
        (sec.items || []).forEach((it) => {
          if (it.type === "categorySubtotal") {
            pushPdfFciSubtotalRow(
              "category",
              "▼ Subtotal · " + norm(it.groupKey),
              getExportPriorityFilterLabel(),
              it.sum,
              it.byP
            );
          } else if (it.type === "rollup") {
            pushPdfFciSubtotalRow(
              "rollup",
              "▼ " + norm(it.assetType),
              it.priorityLabel || getExportPriorityFilterLabel(),
              it.sum,
              it.byP
            );
          } else if (it.type === "row") {
            pushPdfDataRow(it.row);
          }
        });
      } else {
        (sec.rows || []).forEach((r) => pushPdfDataRow(r));
      }
    });
    const tbody = bodyParts.join("");

    const schoolTitle = esc((elSchoolNameHeader && elSchoolNameHeader.innerText) || "Project list");
    const docTitle = norm(elSchoolNameHeader && elSchoolNameHeader.innerText) || "Project list";
    const meta = esc((elSchoolMeta && elSchoolMeta.innerText) || "");
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
    const filtBlock = filt.length ? filt.join(" · ") : "No text filters (table filters: All).";

    const def122 = document.getElementById("deficiencyOnlyToggle");
    const facBits = [];
    if (def122 && def122.checked) facBits.push("active district-operated sites");
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
          ? Number(additionPlanningState.studentsOver).toLocaleString(DISPLAY_NUMBER_LOCALE)
          : "—";
      const gsfT =
        additionPlanningState.gsfTarget != null
          ? Number(additionPlanningState.gsfTarget).toLocaleString(DISPLAY_NUMBER_LOCALE)
          : "—";
      const st = additionPlanningState.stories === 3 ? 3 : 2;
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
    const metaRough = (elSchoolMeta && elSchoolMeta.innerText) || "";
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
table.data tbody tr.pdf-fci-subtotal td {
  background: #f5e6c8;
  color: #4a3a14;
  font-weight: 700;
  font-size: calc(${fontPt}pt - 0.3pt);
  padding: ${cellPad};
  border: 1px solid #c9a96e;
  border-top-width: 1.5px;
}
table.data tbody tr.pdf-fci-subtotal--category td {
  font-weight: 800;
}
table.data tbody tr.pdf-data.pdf-zebra td { background: #f7fafc; }
table.data tbody tr.pdf-ex td { color: #64748b; }
table.data tbody tr.pdf-ex.pdf-zebra td { background: #f1f5f9; color: #64748b; }
/* Match on-screen campus Yes (shade / outdoor classroom): excluded from totals but full-weight black text */
table.data tbody tr.pdf-ex.pdf-campus-yes td {
  color: #111;
  font-weight: 600;
}
table.data tbody tr.pdf-ex.pdf-campus-yes.pdf-zebra td {
  background: #f7fafc;
  color: #111;
}
table.data tbody tr.pdf-ex.pdf-ex-has-rc td { color: #111; }
table.data tbody tr.pdf-ex.pdf-ex-has-rc.pdf-zebra td { background: #f7fafc; color: #111; }
thead { display: table-header-group; }
tfoot { display: table-footer-group; }
.pdf-foot { font-size: 6pt; color: #64748b; margin-top: 6pt; line-height: 1.3; }
/* Column widths (portrait): Priority narrow, Project Type wide; Unit Cost wider + nowrap so “/QUANTITY” stays one line */
table.data th:nth-child(1), table.data td:nth-child(1) { width: ${anySchoolLabel ? "13%" : "7%"}; }
table.data th:nth-child(2), table.data td:nth-child(2) { width: ${anySchoolLabel ? "6%" : "34%"}; }
table.data th:nth-child(3), table.data td:nth-child(3) { width: ${anySchoolLabel ? "26%" : "10%"}; }
table.data th:nth-child(4), table.data td:nth-child(4) { width: ${anySchoolLabel ? "9%" : "17%"}; }
table.data th:nth-child(5), table.data td:nth-child(5) { width: ${anySchoolLabel ? "15%" : "12%"}; }
table.data th:nth-child(6), table.data td:nth-child(6) { width: ${anySchoolLabel ? "11%" : "20%"}; }
${anySchoolLabel ? `table.data th:nth-child(7), table.data td:nth-child(7) { width: 20%; }\n` : ""}
${anySchoolLabel ? `table.data th:nth-child(5), table.data td:nth-child(5) {
  white-space: nowrap;
  overflow-wrap: normal;
  word-break: normal;
}
` : `table.data th:nth-child(4), table.data td:nth-child(4) {
  white-space: nowrap;
  overflow-wrap: normal;
  word-break: normal;
}
`}
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
<p class="pdf-foot">Export lists only table rows visible with your current expand/collapse state (super-groups, categories, and 08 site-infrastructure P1–P4 bands). Grey text = excluded from totals unless the row still shows a dollar replacement amount (then body prints black). Shade structure and new outdoor classroom <strong>Yes</strong> rows print in black (reference cost).${pdfZoomPct < 99 ? ` Print zoom set to ${pdfZoomPct}% to target two pages (Chrome/Edge).` : ""} If a third page appears, reduce print margins slightly.</p>
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
      .then(async ([decRows, assetRows, unitCostLibRows, roomScheduleRows]) => {
        decisionRows = decRows || [];
        buildDecisionIndexes(decisionRows);

        unitCostIndex = buildUnitCostLibraryIndex(unitCostLibRows || []);
        roomScheduleSfByBucket = buildRoomScheduleSfTotals(roomScheduleRows || []);

        allRows = Array.isArray(assetRows) ? assetRows : [];
        buildRowwiseIndex(allRows);
        roomScheduleSfByBucket.forEach((maps) => {
          syncScheduleCategorySfUidsFromProjectList(maps.byUid, maps.byFacility);
        });

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
            const uid = normUid(r["UniqueID"] ?? r.UniqueID);
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
          const uid = normUid(r["UniqueID"] ?? r.UniqueID);
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
          const elFacilityScopeCategories = document.getElementById("facilityScopeCategories");
          const elFacilityScopeBtn = document.getElementById("facilityScopeBtn");
          const elFacilityScopeDropdown = document.getElementById("facilityScopeDropdown");
          const elFacilityScopeLabel = document.getElementById("facilityScopeLabel");

          const FACILITY_SCOPE_LABELS = {
            school: "Schools",
            "cte-pathway": "CTE Pathways",
            cte: "CTE",
            athletics: "Athletics",
            oels: "OELs",
            "admin-support": "Admin & Support",
          };

          function updateFacilityScopeLabel() {
            if (!elFacilityScopeLabel || !elDeficiencyToggle) return;
            if (elDeficiencyToggle.checked) {
              elFacilityScopeLabel.textContent = "Active District-Operated Sites";
              return;
            }
            const parts = [];
            facilityTypeCbs.forEach((cb) => {
              if (cb.checked) parts.push(FACILITY_SCOPE_LABELS[cb.value] || cb.value);
            });
            elFacilityScopeLabel.textContent = parts.length ? parts.join(", ") : "— Select scope —";
          }

          function syncFacilityScopeCategoriesDimming() {
            if (elFacilityScopeCategories) {
              elFacilityScopeCategories.classList.toggle("is-district-mode", !!isOriginal122Mode());
            }
            updateFacilityScopeLabel();
          }

          function closeFacilityScopeDropdown() {
            if (!elFacilityScopeDropdown || !elFacilityScopeBtn) return;
            elFacilityScopeDropdown.style.display = "none";
            elFacilityScopeBtn.setAttribute("aria-expanded", "false");
          }

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
            syncFacilityScopeCategoriesDimming();
            onSchoolSelectionChanged();
          }

          if (elDeficiencyToggle) {
            elDeficiencyToggle.addEventListener("change", () => {
              if (elDeficiencyToggle.checked) {
                facilityTypeCbs.forEach((cb) => {
                  cb.checked = false;
                });
              }
              applyFacilityVisibility();
            });
          }

          facilityTypeCbs.forEach((ftCb) => {
            ftCb.addEventListener("change", () => {
              if (ftCb.checked && elDeficiencyToggle) {
                elDeficiencyToggle.checked = false;
              }
              const anyTypeChecked = facilityTypeCbs.some((c) => c.checked);
              if (!anyTypeChecked && elDeficiencyToggle && !elDeficiencyToggle.checked) {
                elDeficiencyToggle.checked = true;
              }
              applyFacilityVisibility();
            });
          });

          if (elFacilityScopeBtn && elFacilityScopeDropdown) {
            elFacilityScopeBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              const wasOpen = elFacilityScopeDropdown.style.display !== "none";
              elFacilityScopeDropdown.style.display = wasOpen ? "none" : "block";
              elFacilityScopeBtn.setAttribute("aria-expanded", wasOpen ? "false" : "true");
            });
            elFacilityScopeDropdown.addEventListener("click", (e) => e.stopPropagation());
          }

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

          // Initial state: district-operated (122) scope checked, type cbs unchecked
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
              const schoolWrap = document.getElementById("schoolMultiSelect");
              if (schoolWrap && !schoolWrap.contains(e.target)) {
                elSchoolSelectDropdown.style.display = "none";
              }
              const facilityWrap = document.getElementById("facilityTypeFilter");
              if (facilityWrap && !facilityWrap.contains(e.target)) {
                closeFacilityScopeDropdown();
              }
            });
          }

          window.__schoolCbs = schoolCbs;
          window.__onSchoolSelectionChanged = onSchoolSelectionChanged;
        }

        const fciToggle = document.getElementById("includeFciToggle");
        if (fciToggle) {
          fciToggle.checked = getIncludeFciForMajor();
          fciToggle.addEventListener("change", () => {
            try {
              if (window.localStorage) {
                window.localStorage.setItem(INCLUDE_FCI_MAJOR_STORAGE_KEY, fciToggle.checked ? "1" : "0");
              }
            } catch {
              // ignore
            }
            applyMultiSchoolSelection();
          });
        }

        // If URL has a school/uid param, pre-select ONLY that facility (uncheck all others).
        // applyFacilityVisibility() runs first and checks every visible facility; only toggling
        // the matching row to checked leaves all others checked too, so applyMultiSchoolSelection
        // treats the visit as multi-school and shows combined projects for everyone.
        let resolvedUid = normUid(selectedUniqueIdFromQuery);
        let resolvedName = norm(selectedSchoolNameFromQuery);
        const hadUrlSchool = !!(selectedUniqueIdFromQuery || selectedSchoolNameFromQuery);

        if (resolvedUid && decisionByUid.has(resolvedUid)) {
          const r = decisionByUid.get(resolvedUid);
          resolvedName = norm(r?.["Building Name"]) || resolvedName;
        } else if (resolvedName) {
          const r = decisionByNameKey.get(normName(resolvedName));
          resolvedUid = normUid(r?.["UniqueID"]) || resolvedUid;
          resolvedName = norm(r?.["Building Name"]) || resolvedName;
        }

        if (window.__schoolCbs) {
          let targetValue = null;
          if (resolvedUid) {
            const byUid = Array.from(window.__schoolCbs).find((cb) => cb.value === resolvedUid);
            if (byUid) targetValue = resolvedUid;
          }
          if (!targetValue && resolvedName) {
            const nk = normName(resolvedName);
            const byName = Array.from(window.__schoolCbs).find(
              (cb) =>
                cb.value === "name:" + resolvedName || normName(cb.dataset.name || "") === nk
            );
            if (byName) targetValue = byName.value;
          }

          if (targetValue) {
            window.__schoolCbs.forEach((cb) => {
              cb.checked = cb.value === targetValue;
            });
            if (window.__onSchoolSelectionChanged) window.__onSchoolSelectionChanged();
          } else if (hadUrlSchool) {
            elSchoolNameHeader.textContent = "—";
            elSchoolMeta.textContent =
              "That facility could not be found in the list, or it has no linked project data.";
            elTableMount.innerHTML = '<div class="empty">No school selected.</div>';
          } else {
            elSchoolNameHeader.textContent = "—";
            elSchoolMeta.textContent = "Select one or more schools above to view summary and projects.";
            elTableMount.innerHTML = '<div class="empty">No school selected.</div>';
          }
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

    function closeAssetsSettingsDropdown() {
      const dd = document.getElementById("assetsSettingsDropdown");
      const btn = document.getElementById("assetsSettingsBtn");
      if (dd) dd.style.display = "none";
      if (btn) btn.setAttribute("aria-expanded", "false");
    }

    const assetsSettingsBtn = document.getElementById("assetsSettingsBtn");
    const assetsSettingsDropdown = document.getElementById("assetsSettingsDropdown");
    if (assetsSettingsBtn && assetsSettingsDropdown) {
      assetsSettingsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const wasOpen = assetsSettingsDropdown.style.display !== "none";
        assetsSettingsDropdown.style.display = wasOpen ? "none" : "block";
        assetsSettingsBtn.setAttribute("aria-expanded", wasOpen ? "false" : "true");
      });
      assetsSettingsDropdown.addEventListener("click", (e) => e.stopPropagation());
    }

    const showRowsWithoutRcToggle = document.getElementById("showRowsWithoutRcToggle");
    if (showRowsWithoutRcToggle) {
      showRowsWithoutRcToggle.checked = getShowRowsWithoutReplacementCost();
      showRowsWithoutRcToggle.addEventListener("change", () => {
        setShowRowsWithoutReplacementCost(showRowsWithoutRcToggle.checked);
        applyFilters();
        render();
      });
    }

    const turnOnAllRowsBtn = document.getElementById("turnOnAllRowsWithValuesBtn");
    if (turnOnAllRowsBtn) {
      turnOnAllRowsBtn.addEventListener("click", () => {
        turnOnAllRowsWithValues();
        closeAssetsSettingsDropdown();
      });
    }

    document.addEventListener("click", (e) => {
      const wrap = document.querySelector(".assets-settings-wrap");
      if (wrap && !wrap.contains(e.target)) closeAssetsSettingsDropdown();
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

    elClearFilters.addEventListener("click", () => {
      elSearch.value = "";
      priorityFilterCbs.forEach((cb) => { cb.checked = true; });
      if (elPrioritySelectAll) elPrioritySelectAll.checked = true;
      updatePriorityFilterLabel();
      if (elSystemDropdown && elSystemLabel) clearMultiSelect(elSystemDropdown, "system-filter-cb", elSystemLabel);
      if (elAssetDropdown && elAssetLabel) clearMultiSelect(elAssetDropdown, "asset-filter-cb", elAssetLabel);
      sortState = { key: "SystemCategory", dir: "asc" };
      applyFilters();
      render();
    });

    if (elResetManualQtyOverrides) {
      elResetManualQtyOverrides.addEventListener("click", () => {
        const msg =
          "Clear all saved planning quantities (SF/qty you typed for site-specific rows) in this browser?\n\n" +
          "Values will come from the room schedule and project CSV again.";
        if (!window.confirm(msg)) return;
        manualQtyOverrides = {};
        saveManualQtyOverrides();
        refreshSchoolDataAfterManualQtyEdit();
      });
    }
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


