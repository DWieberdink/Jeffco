/* school-profile.js
   - Loads project list CSV (one row per school+asset)
   - Filters rows by SchoolName == selected school (string match with trim)
   - Renders ONE table grouped by SystemCategory
   - Allows sorting (click header) + filtering (search + dropdowns)
   - Does not mutate underlying data
*/

(function () {
  const _data = (typeof window !== "undefined" && window.jeffcoDataUrl) || ((leaf) => "../../Facility Data/" + leaf);
  const displaySchoolName = window.formatSchoolDisplayName || ((name) => String(name ?? "").trim());
  const ASSETS_CSV_PATH = _data("02 JeffCoProjectListAllSchools.csv");
  const SAFETY_SECURITY_CSV_PATH = _data("02.1_SafetyandSecurityProjects.csv");
  /** Facility Deficiency line items; also drives project-type rollups and detail dropdowns. */
  const FACILITIES_DEFICIENCY_CSV_PATH = _data("02.2_FacilitiesDeficiencyProjects.csv");
  const DECISION_CSV_PATH = _data("01 Decision Data Export.csv");
  const UNITCOST_LIBRARY_CSV_PATH = _data("03 UnitCostLibrary.csv");
  const ROOM_SCHEDULE_CSV_PATH = _data("05 Jeffco Room Schedule.csv");
  const MAP_EXPORT_CSV_PATH = _data("09 Map_Export.csv");
  // Bump this to force browsers to refetch CSV/JS.
  const CACHE_BUST = "20260806_06";
  const UNKNOWN_ARTICULATION_LABEL = "No articulation area";
  /** Super-section banners in the assets / projects table (fixed display order). */
  const SELECTED_PROJECTS_SUPER_LABEL = "Selected Projects";
  /** Parent rollup over Educational Adequacy categories only (00–07). */
  const PROJECT_CALC_SUPER_LABEL = "Project Calculator";
  /** Logical bucket for EA system categories — no banner; categories nest under Project Calculator. */
  const EDUCATIONAL_ADEQUACY_SUPER_LABEL = "Educational Adequacy Projects";
  const FACILITY_DEFICIENCY_SUPER_LABEL = "Facility Deficiency Projects";
  const FOOD_NUTRITION_SUPER_LABEL = "Food And Nutrition Projects";
  const SAFETY_SECURITY_SUPER_LABEL = "Safety & Security Projects";
  const IT_PROJECTS_SUPER_LABEL = "Information Technology Projects";
  const SCHOOL_LEADER_PRIORITIES_SUPER_LABEL = "School Leader Project Priorities";
  /**
   * Top-level sections after Project Calculator (not rolled into calculator totals).
   * Educational Adequacy has no banner — its categories render directly under Project Calculator.
   */
  const STANDALONE_SECTION_LABELS = [
    FACILITY_DEFICIENCY_SUPER_LABEL,
    SAFETY_SECURITY_SUPER_LABEL,
    FOOD_NUTRITION_SUPER_LABEL,
    IT_PROJECTS_SUPER_LABEL,
    SCHOOL_LEADER_PRIORITIES_SUPER_LABEL,
  ];
  const STANDALONE_SECTION_LABEL_SET = new Set(STANDALONE_SECTION_LABELS);
  const SUPER_GROUP_DISPLAY_ORDER = [
    SELECTED_PROJECTS_SUPER_LABEL,
    PROJECT_CALC_SUPER_LABEL,
    ...STANDALONE_SECTION_LABELS,
  ];
  /** Always-visible empty team / survey-style sections (no CSV rows yet). */
  const EMPTY_TEMPLATE_SUPER_LABELS = new Set([
    FOOD_NUTRITION_SUPER_LABEL,
    IT_PROJECTS_SUPER_LABEL,
    SCHOOL_LEADER_PRIORITIES_SUPER_LABEL,
  ]);
  const SAFETY_SECURITY_SYSTEM_CATEGORY = "02.1_SafetyandSecurityProjects";
  /** Unified modernization bucket in project list + `UnitCostLibrary.csv` (tier distinguished by AssetType). */
  function isModernizationSystemCategory(systemCategory) {
    const s = (systemCategory ?? "").toString().trim().toLowerCase();
    return (
      s === "05_modernization" ||
      s === "05_heavy modernization" ||
      s === "06_light modernization" ||
      s === "02_modernization" ||
      s === "modernization"
    );
  }

  /**
   * Library AssetType → { level, space } for the three modernization tiers, e.g.
   * "Level 2 - targeted modernization - group restrooms" → { level: 2, space: "group restrooms" }.
   */
  const MODERNIZATION_TIER_RE =
    /^level\s*([123])\s*-\s*(?:light|targeted|heavy)\s+modernization\s*-\s*(.+)$/i;

  function parseModernizationTier(assetType) {
    const m = MODERNIZATION_TIER_RE.exec((assetType ?? "").toString().trim());
    if (!m) return null;
    return { level: Number(m[1]), space: m[2].trim().toLowerCase() };
  }

  /** Former `08_site infrastructure` rows; keep legacy string support for older CSV snapshots. */
  function isFacilitiesDeficiencySystemCategory(systemCategory) {
    const s = (systemCategory ?? "").toString().trim().toLowerCase();
    return (
      s === "08_facilities deficiency" ||
      s === "08_facilities deficiency_new" ||
      s === "08_site infrastructure" ||
      s === "08_site infrastructure_new"
    );
  }
  const PRIORITY_OVERRIDES_STORAGE_KEY = "jeffco_priority_overrides_per_row_v1";
  const MANUAL_QTY_OVERRIDES_STORAGE_KEY = "jeffco_manual_site_qty_overrides_v2";
  /** Bump version when include defaults change so old localStorage overrides do not mask new behavior. */
  const ROW_INCLUDE_TOGGLE_STORAGE_KEY = "jeffco_row_include_toggle_v9";
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
    "ConditionScore": "Condition",
    "UnitCost": "Unit Cost",
    "UnitValue": "Unit Value",
    "ReplacementCost": "Project Cost",
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
    stories: 2, // 2-story only (rate from New Construction ES/MS/HS/K-8)
    collapsed: false,
  };
  /** Fallback $/SF if school level or library rate is missing */
  const ADDITION_STORY_FALLBACK_SF = 600;
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
  /** Facility Deficiency line items keyed by facility/location + system. */
  let facilitiesDeficiencyDetailByFacilitySystem = new Map();
  let sortState = { key: "SystemCategory", dir: "asc" };
  const collapsedGroups = new Set();
  const collapsedSuperGroups = new Set();
  let lastContextKeyForDefaultGroupCollapse = "";
  /** Non–site-infra FCI: keys for asset rollups the user collapsed (default = expanded). */
  const collapsedFciAssets = new Set();
  /** 08_Facilities Deficiency* (ex–site infrastructure): asset rollup expanded state (default collapsed until expanded here). */
  const expandedFciSiteInfraAssets = new Set();

  function isSiteInfrastructureFciGroupKey(groupKey) {
    return isFacilitiesDeficiencySystemCategory(groupKey);
  }

  /**
   * Maps SystemCategory → super-group banner.
   * 02.1_* → Safety & Security Projects (must check before generic 02_*).
   * 00–07 → Educational Adequacy (categories nest under Project Calculator; no EA banner).
   * 08 → Facility Deficiency Projects.
   * Project Calculator rolls up Educational Adequacy only.
   */
  function isSafetySecurityProjectsCategory(systemCategory) {
    const g = norm(systemCategory).toLowerCase();
    return (
      g.startsWith("02.1") ||
      g.includes("safetyandsecurityprojects") ||
      g === "safety & security projects"
    );
  }

  function getSuperGroupKey(groupName) {
    const g = norm(groupName).toLowerCase();
    if (isSafetySecurityProjectsCategory(groupName)) return SAFETY_SECURITY_SUPER_LABEL;
    if (
      g.startsWith("00") ||
      g.startsWith("01") ||
      g.startsWith("02") ||
      g.startsWith("03") ||
      g.startsWith("04") ||
      g.startsWith("05") ||
      g.startsWith("06") ||
      g.startsWith("07")
    ) {
      return EDUCATIONAL_ADEQUACY_SUPER_LABEL;
    }
    if (g.startsWith("08")) return FACILITY_DEFICIENCY_SUPER_LABEL;
    return null;
  }

  /** @deprecated alias — prefer getSuperGroupKey */
  function getProjectSuperGroupKey(groupName) {
    return getSuperGroupKey(groupName);
  }

  function isCalculatorSystemCategory(systemCategory) {
    const g = norm(systemCategory).toLowerCase();
    return (
      g.startsWith("00") ||
      g.startsWith("01") ||
      g.startsWith("02") ||
      g.startsWith("03") ||
      g.startsWith("04") ||
      g.startsWith("05") ||
      g.startsWith("06") ||
      g.startsWith("07")
    );
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
  let uidByFacilityId = new Map();
  let priorityOverrides = loadPriorityOverrides();
  let manualQtyOverrides = loadManualQtyOverrides();
  let rowIncludeToggleOverrides = loadRowIncludeToggleOverrides();
  let unitCostIndex = new Map();
  let unitCostByProjectKey = new Map();
  let libraryProjectOrder = []; // [{ proj, pk, sys }]
  let modernizationTiersBySpace = new Map(); // space (lowercase) → [{ level, proj, pk }] ascending
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

  /** Opt-in: Facility Deficiency (08_*) for gut/new-construction paths only when localStorage is "1". */
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

  /** Facility Deficiency (08_*); gut/NC gate uses same toggle as legacy "include FCI". */
  function isAssetLifeCycleCategoryForGutNcGate(systemCategory) {
    const s = norm(systemCategory);
    return isFacilitiesDeficiencySystemCategory(s) || s.startsWith("08");
  }

  function getEffectiveEnrollment(row) {
    if (!row) return 0;
    const inc = getIncludePKInEnrollment();
    const pick = typeof window.pickDecisionRowField === "function" ? window.pickDecisionRowField : null;
    const e =
      parseFloat(
        (
          (pick && pick(row, "enrollmentTotal")) ??
          row.Enrollment2026 ??
          row.Enrollment2025 ??
          row["Enrollment2025"] ??
          row.Enrollment ??
          row.enrollment ??
          ""
        )
          .toString()
          .replace(/,/g, "")
          .trim()
      ) || 0;
    const pk =
      parseFloat(
        (
          (pick && pick(row, "enrollmentPK")) ??
          row.PKEnrollment2026 ??
          row.PKEnrollment2025 ??
          row.PKEnrollment ??
          row["PKEnrollment"] ??
          row["PK Enrollment"] ??
          ""
        )
          .toString()
          .replace(/,/g, "")
          .trim()
      ) || 0;
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
    const pick = typeof window.pickDecisionRowField === "function" ? window.pickDecisionRowField : null;
    const n = parseFloat(
      (
        (pick && pick(row, "enrollmentTotal")) ??
        row.Enrollment2026 ??
        row.Enrollment2025 ??
        row["Enrollment2025"] ??
        row.Enrollment ??
        row.enrollment ??
        ""
      )
        .toString()
        .replace(/,/g, "")
        .trim()
    );
    return Number.isFinite(n) ? n : null;
  }

  function parseDecisionPkEnrollment(row) {
    if (!row) return 0;
    const pick = typeof window.pickDecisionRowField === "function" ? window.pickDecisionRowField : null;
    const n = parseFloat(
      (
        (pick && pick(row, "enrollmentPK")) ??
        row.PKEnrollment2026 ??
        row.PKEnrollment2025 ??
        row.PKEnrollment ??
        row["PKEnrollment"] ??
        row["PK Enrollment"] ??
        ""
      )
        .toString()
        .replace(/,/g, "")
        .trim()
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
    if (resolvedDecisionOutcome) parts.push(schoolMetaItem("Project", resolvedDecisionOutcome));

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
    const pick = typeof window.pickDecisionRowField === "function" ? window.pickDecisionRowField : null;
    const inc = getIncludePKInEnrollment();
    if (inc)
      return (
        parse(
          (pick && pick(row, "projTotal")) ??
            row["ProjEnrollment_Total"] ??
            row["2030_Total"] ??
            row["2030 Total"]
        ) ?? null
      );
    const kPlus = parse(
      (pick && pick(row, "projKPlus")) ??
        row["ProjEnrollment_KPlus"] ??
        row["2030_K+"] ??
        row["2030 K+"]
    );
    if (kPlus != null) return kPlus;
    const total2030 = parse(
      (pick && pick(row, "projTotal")) ??
        row["ProjEnrollment_Total"] ??
        row["2030_Total"] ??
        row["2030 Total"]
    );
    if (total2030 == null) return null;
    const pk2030 = parse(
      (pick && pick(row, "projPK")) ?? row["ProjEnrollment_PK"] ?? row["2030_PK"] ?? row["2030 PK"]
    );
    const pkPart = pk2030 != null ? pk2030 : 0;
    return Math.max(0, total2030 - pkPart);
  }

  function getEffectiveEnrollmentGrowthLocal(row) {
    if (!row) return null;
    const parse = (v) => {
      const n = parseFloat((v ?? "").toString().replace(/,/g, "").trim());
      return Number.isFinite(n) ? n : null;
    };
    const pick = typeof window.pickDecisionRowField === "function" ? window.pickDecisionRowField : null;
    const inc = getIncludePKInEnrollment();
    const totalRaw =
      (pick && pick(row, "enrollmentTotal")) ??
      row.Enrollment2026 ??
      row.Enrollment2025 ??
      row["Enrollment2025"] ??
      row.Enrollment ??
      row["Enrollment"];
    let current;
    if (inc) {
      current = parse(totalRaw) ?? 0;
    } else {
      const pk =
        parse(
          (pick && pick(row, "enrollmentPK")) ??
            row.PKEnrollment2026 ??
            row.PKEnrollment2025 ??
            row.PKEnrollment ??
            row["PKEnrollment"]
        ) ?? 0;
      const total = parse(totalRaw) ?? 0;
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
    const pick = typeof window.pickDecisionRowField === "function" ? window.pickDecisionRowField : null;
    const e =
      parseFloat(
        (
          (pick && pick(row, "enrollmentTotal")) ??
          row.Enrollment2026 ??
          row.Enrollment2025 ??
          row["Enrollment2025"] ??
          row.Enrollment ??
          row.enrollment ??
          ""
        )
          .toString()
          .replace(/,/g, "")
          .trim()
      ) || 0;
    const pk =
      parseFloat(
        (
          (pick && pick(row, "enrollmentPK")) ??
          row.PKEnrollment2026 ??
          row.PKEnrollment2025 ??
          row.PKEnrollment ??
          row["PKEnrollment"] ??
          row["PK Enrollment"] ??
          ""
        )
          .toString()
          .replace(/,/g, "")
          .trim()
      ) || 0;
    return Math.max(0, e - pk);
  }

  function getDecisionUtilization(row) {
    if (!row) return null;
    const cap = getDecisionCapacity(row);
    if (!cap || cap <= 0) return null;
    return getDecisionEnrollment(row) / cap;
  }

  /** Projected enrollment for growth calc — excludes PK component when projection fields allow it. */
  function getDecisionProjectedEnrollmentLocal(row) {
    if (!row) return null;
    const parse = (v) => {
      const n = parseFloat((v ?? "").toString().replace(/,/g, "").trim());
      return Number.isFinite(n) ? n : null;
    };
    const pick = typeof window.pickDecisionRowField === "function" ? window.pickDecisionRowField : null;
    const kPlus = parse(
      (pick && pick(row, "projKPlus")) ??
        row["ProjEnrollment_KPlus"] ??
        row["2030_K+"] ??
        row["2030 K+"]
    );
    if (kPlus != null) return kPlus;
    const total2030 = parse(
      (pick && pick(row, "projTotal")) ??
        row["ProjEnrollment_Total"] ??
        row["2030_Total"] ??
        row["2030 Total"]
    );
    if (total2030 == null) return null;
    const pk2030 = parse(
      (pick && pick(row, "projPK")) ?? row["ProjEnrollment_PK"] ?? row["2030_PK"] ?? row["2030 PK"]
    );
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

  function evaluateSchoolDecisionMeta(row, t = DECISION_THRESHOLDS) {
    if (!row) return { decision: "Unknown", flow: 1 };
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
    let edu3_2 = "No";
    const below50Cat = row["Below50PCTL_EA_Cat"];
    if (below50Cat === "Yes" || below50Cat === "yes" || below50Cat === "YES") {
      edu3_2 = "Yes";
    } else if (typeof window.below50PctlEaYesNo === "function") {
      edu3_2 = window.below50PctlEaYesNo(row, decisionRows) === "Yes" ? "Yes" : "No";
    }
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

    return { decision: finalDecision, flow: currentFlow };
  }

  function evaluateSchoolDecision(row, t = DECISION_THRESHOLDS) {
    return evaluateSchoolDecisionMeta(row, t).decision;
  }

  const STRATEGY_GROUP_ORDER = ["Expansion", "Maintenance/Investment", "Closure/Consolidation", "Other"];

  function getStrategyGroupForDecisionLocal(decision, flow) {
    if (!decision) return "Other";
    if (decision === "Building Replacement") {
      const f = flow != null && flow !== "" ? Number(flow) : NaN;
      if (f === 2) return "Expansion";
      return "Maintenance/Investment";
    }
    const groups = window.prioritizationLogic && window.prioritizationLogic.strategyGroups;
    if (groups) {
      for (const groupName of STRATEGY_GROUP_ORDER) {
        const group = groups[groupName];
        if (group && Array.isArray(group.outcomes) && group.outcomes.includes(decision)) {
          return groupName;
        }
      }
    }
    if (decision.includes("Welcoming") || decision.includes("Closure")) return "Closure/Consolidation";
    if (decision.includes("Building Addition") || decision.includes("Overcrowding")) return "Expansion";
    if (
      decision.includes("Capital Investment") ||
      decision.includes("Replacement") ||
      decision.includes("Maintenance")
    ) {
      return "Maintenance/Investment";
    }
    return "Other";
  }

  let listViewMode = "school";
  let schoolCatalogOpts = [];
  let getScopedSchoolCatalogFn = null;
  const collapsedStrategyGroups = new Set();
  const collapsedStrategySchools = new Set();
  const collapsedStrategyProjectTypes = new Set();
  let strategyPivotSort = { key: "strategyGroup", dir: "asc" };
  const STRATEGY_PIVOT_DIM_DEFS = {
    strategyGroup: { label: "Strategy Group", icon: "🏢" },
    projectCategory: { label: "Project Category", icon: "🎯" },
    projectType: { label: "Project Type", icon: "🔧" },
    project: { label: "Projects", icon: "📌" },
    school: { label: "School", icon: "🏫" },
    systemCategory: { label: "System Category", icon: "📋" },
    priority: { label: "Priority", icon: "⚠" },
  };
  /** Default when no school is selected (district strategy project list). */
  const DEFAULT_STRATEGY_PIVOT_HIERARCHY = [
    "priority",
    "strategyGroup",
    "projectCategory",
    "school",
    "systemCategory",
    "projectType",
    "project",
  ];
  /** All hierarchy dims visible by default (incl. School). */
  const DEFAULT_STRATEGY_PIVOT_HIDDEN_COLS = [
    "compositeBuildingScore",
    "educationalAdequacyScore",
  ];
  /** School-level scores (shown via Columns ▾ → School sub-options). */
  const SCHOOL_SCORE_METRIC_KEYS = new Set([
    "priorityScore",
    "compositeBuildingScore",
    "educationalAdequacyScore",
  ]);
  const STRATEGY_PIVOT_METRIC_COLUMNS = [
    { key: "priorityScore", label: "Priority Score", align: "right", isDim: false },
    { key: "compositeBuildingScore", label: "Composite Building Score", align: "right", isDim: false },
    { key: "educationalAdequacyScore", label: "Educational Adequacy Score", align: "right", isDim: false },
    { key: "condition", label: "Condition", align: "right", isDim: false },
    { key: "unitCost", label: "Unit Cost", align: "right", isDim: false },
    { key: "replacementCost", label: "Project Cost", align: "right", isDim: false },
    { key: "pctTotal", label: "% of Total", align: "right", isDim: false },
  ];
  let strategyPivotHierarchyOrder = DEFAULT_STRATEGY_PIVOT_HIERARCHY.slice();
  const PIVOT_HIERARCHY_STORAGE_KEY = "jeffco_profile_pivot_hierarchy_v7";
  /** Hidden column keys (dims + metrics). Empty = all visible. */
  let strategyPivotHiddenCols = new Set(DEFAULT_STRATEGY_PIVOT_HIDDEN_COLS);
  const PIVOT_HIDDEN_COLS_STORAGE_KEY = "jeffco_profile_pivot_hidden_cols_v7";
  const collapsedStrategyPivotGroups = new Set();
  /**
   * When Projects is the leaf dim, deeper nest levels stay collapsed until expanded here.
   * Avoids painting thousands of Project Type / System Category rows on every filter pass.
   */
  const expandedStrategyDeepGroups = new Set();
  /** @type {Record<string, Set<string>>} selected values per pivot column filter */
  const strategyPivotFilterSelected = {};
  /** @type {Record<string, Set<string>>} all available values per pivot column filter */
  const strategyPivotFilterAll = {};
  const STRATEGY_PIVOT_FILTERABLE_KEYS = [
    "strategyGroup",
    "projectCategory",
    "projectType",
    "project",
    "school",
    "systemCategory",
    "priority",
  ];
  const STRATEGY_PIVOT_PRIORITY_FILTER_LABELS = {
    "1": "P1 Critical",
    "2": "P2 High",
    "3": "P3 Medium",
    "4": "P4 Low",
  };
  /** Default column widths (px) — no-school / district strategy list layout. */
  const DEFAULT_STRATEGY_PIVOT_COL_WIDTHS = {
    priority: 110,
    strategyGroup: 130,
    projectCategory: 200,
    school: 180,
    systemCategory: 140,
    projectType: 150,
    project: 220,
    priorityScore: 110,
    compositeBuildingScore: 130,
    educationalAdequacyScore: 130,
    condition: 110,
    unitCost: 92,
    replacementCost: 140,
    pctTotal: 120,
  };
  /**
   * Metric columns contain compact numeric widgets and do not wrap like hierarchy labels.
   * Keep them wide enough for the header, largest value, and percentage bar.
   */
  const MIN_STRATEGY_PIVOT_COL_WIDTHS = {
    priorityScore: 100,
    compositeBuildingScore: 120,
    educationalAdequacyScore: 120,
    condition: 110,
    unitCost: 92,
    replacementCost: 140,
    pctTotal: 120,
  };
  let strategyPivotColWidths = { ...DEFAULT_STRATEGY_PIVOT_COL_WIDTHS };
  const PIVOT_COL_WIDTHS_STORAGE_KEY = "jeffco_profile_pivot_col_widths_v3";
  const LIST_VIEW_STORAGE_KEY = "jeffco_profile_list_view_v2";

  function loadStrategyPivotColWidths() {
    try {
      const raw = window.localStorage?.getItem(PIVOT_COL_WIDTHS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      strategyPivotColWidths = { ...DEFAULT_STRATEGY_PIVOT_COL_WIDTHS, ...parsed };
    } catch {
      // ignore
    }
  }

  function saveStrategyPivotColWidths() {
    try {
      window.localStorage?.setItem(
        PIVOT_COL_WIDTHS_STORAGE_KEY,
        JSON.stringify(strategyPivotColWidths)
      );
    } catch {
      // ignore
    }
  }

  function getStrategyPivotColWidth(key) {
    const w = Number(strategyPivotColWidths[key]);
    const min = MIN_STRATEGY_PIVOT_COL_WIDTHS[key] || 36;
    if (Number.isFinite(w)) return Math.max(min, w);
    return Math.max(min, DEFAULT_STRATEGY_PIVOT_COL_WIDTHS[key] || 100);
  }

  function setStrategyPivotColWidth(key, px) {
    const min = MIN_STRATEGY_PIVOT_COL_WIDTHS[key] || 36;
    const next = Math.max(min, Math.min(640, Math.round(px)));
    strategyPivotColWidths[key] = next;
  }

  function getStrategyPivotTableWidthPx() {
    return getStrategyPivotColumns().reduce((sum, col) => sum + getStrategyPivotColWidth(col.key), 0);
  }

  function applyStrategyPivotTableWidths(table) {
    if (!table) return;
    const columns = getStrategyPivotColumns();
    columns.forEach((col) => {
      const w = getStrategyPivotColWidth(col.key);
      const colEl = table.querySelector(`colgroup col[data-col-key="${col.key}"]`);
      if (colEl) {
        colEl.style.width = `${w}px`;
        colEl.style.minWidth = `${w}px`;
        colEl.style.maxWidth = `${w}px`;
      }
      const th = table.querySelector(`thead th[data-col-key="${col.key}"]`);
      if (th) {
        th.style.width = `${w}px`;
        th.style.minWidth = `${w}px`;
        th.style.maxWidth = `${w}px`;
      }
    });
    const total = getStrategyPivotTableWidthPx();
    table.style.width = `${total}px`;
    table.style.minWidth = `${total}px`;
  }

  function resetStrategyPivotColWidths() {
    strategyPivotColWidths = { ...DEFAULT_STRATEGY_PIVOT_COL_WIDTHS };
    saveStrategyPivotColWidths();
  }

  function isNumericPivotSortKey(key) {
    return [
      "condition",
      "unitCost",
      "replacementCost",
      "pctTotal",
      "projects",
      "priorityScore",
      "compositeBuildingScore",
      "educationalAdequacyScore",
    ].includes(key);
  }

  function setStrategyPivotSort(key, dir) {
    strategyPivotSort = { key, dir: dir === "desc" ? "desc" : "asc" };
    renderStrategyGroupView();
  }

  function buildStrategyPivotFilterCatalog(groupIndex) {
    const catalog = {
      strategyGroup: new Set(),
      projectCategory: new Set(),
      projectType: new Set(),
      project: new Set(),
      school: new Set(),
      systemCategory: new Set(),
      priority: new Set(["1", "2", "3", "4"]),
    };
    const expandProjectDim = getStrategyPivotVisibleHierarchyOrder().includes("project");
    if (expandProjectDim && facilitiesDeficiencyDetailByFacilitySystem.size) {
      // Seed once from the detail index instead of re-looking up every school row.
      facilitiesDeficiencyDetailByFacilitySystem.forEach((list) => {
        (list || []).forEach((d) => {
          const label = displayProjectTypeLabel(d) || d.__masterDetailLabel;
          if (label) catalog.project.add(label);
        });
      });
    }
    STRATEGY_GROUP_ORDER.forEach((strategyGroup) => {
      const schools = groupIndex.get(strategyGroup) || [];
      schools.forEach((school) => {
        catalog.strategyGroup.add(strategyGroup);
        catalog.projectCategory.add(school.decisionOutcome || "Unknown");
        catalog.school.add(displaySchoolName(school.name));
        (school.rows || []).forEach((r) => {
          const projectType = displayProjectTypeLabel(r) || "Unknown";
          catalog.projectType.add(projectType);
          catalog.systemCategory.add(displaySystemCategoryLabel(r?.SystemCategory) || "—");
          const p = norm(getPriorityForRow(r));
          if (p) catalog.priority.add(p);
          if (!expandProjectDim || !isFacilitiesDeficiencySystemCategory(r.SystemCategory)) {
            catalog.project.add(projectType);
          }
        });
      });
    });
    return catalog;
  }

  function syncStrategyPivotFilterState(catalog) {
    STRATEGY_PIVOT_FILTERABLE_KEYS.forEach((key) => {
      const allVals = Array.from(catalog[key] || [])
        .map(norm)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }));
      const allSet = new Set(allVals);
      const prevAll = strategyPivotFilterAll[key];
      const prevSel = strategyPivotFilterSelected[key];
      const wasAll =
        !prevSel ||
        !prevAll ||
        prevSel.size === 0 ||
        (prevAll.size > 0 && prevSel.size >= prevAll.size);

      strategyPivotFilterAll[key] = allSet;
      if (wasAll) {
        strategyPivotFilterSelected[key] = new Set(allSet);
      } else {
        const next = new Set();
        allSet.forEach((v) => {
          if (prevSel.has(v)) next.add(v);
        });
        strategyPivotFilterSelected[key] = next.size ? next : new Set(allSet);
      }
    });
  }

  function isStrategyPivotColumnFilterActive(key) {
    const all = strategyPivotFilterAll[key];
    const sel = strategyPivotFilterSelected[key];
    if (!all || !sel || all.size === 0) return false;
    return sel.size > 0 && sel.size < all.size;
  }

  function anyStrategyPivotColumnFilterActive() {
    return STRATEGY_PIVOT_FILTERABLE_KEYS.some(isStrategyPivotColumnFilterActive);
  }

  function strategyPivotColumnValuePasses(key, value) {
    if (!isStrategyPivotColumnFilterActive(key)) return true;
    return strategyPivotFilterSelected[key].has(norm(value));
  }

  function strategyPivotFieldsPassColumnFilters(fields) {
    return STRATEGY_PIVOT_FILTERABLE_KEYS.every((key) =>
      strategyPivotColumnValuePasses(key, fields[key])
    );
  }

  function resetStrategyPivotColumnFilters() {
    STRATEGY_PIVOT_FILTERABLE_KEYS.forEach((key) => {
      const all = strategyPivotFilterAll[key];
      if (all) strategyPivotFilterSelected[key] = new Set(all);
    });
  }

  function closeAllPivotColumnFilterMenus() {
    document.querySelectorAll(".pivot-col-filter-menu").forEach((m) => {
      m.classList.remove("is-open");
      if (m.dataset.pivotFilterMenu === "1") m.remove();
    });
  }

  function formatPivotFilterValueLabel(colKey, val) {
    if (colKey === "priority") return STRATEGY_PIVOT_PRIORITY_FILTER_LABELS[val] || `P${val}`;
    return val;
  }

  /** Excel-style AutoFilter: sort + value checklist (when filterable) + OK/Cancel. */
  function appendPivotColumnFilterControl(th, colKey, colLabel) {
    const wrap = document.createElement("span");
    wrap.className = "pivot-col-filter";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "pivot-col-filter-btn" + (isStrategyPivotColumnFilterActive(colKey) ? " is-active" : "");
    btn.title = "Sort & filter";
    btn.setAttribute("aria-label", `Sort and filter ${colLabel || colKey}`);
    btn.innerHTML = '<span class="pivot-col-filter-icon" aria-hidden="true"></span>';
    wrap.appendChild(btn);

    const canFilter = STRATEGY_PIVOT_FILTERABLE_KEYS.includes(colKey);
    const numeric = isNumericPivotSortKey(colKey);

    const openMenu = () => {
      closeAllPivotColumnFilterMenus();
      const menu = document.createElement("div");
      menu.className = "pivot-col-filter-menu is-open";
      menu.dataset.pivotFilterMenu = "1";
      menu.dataset.filterKey = colKey;
      menu.addEventListener("click", (e) => e.stopPropagation());

      const sortBlock = document.createElement("div");
      sortBlock.className = "pivot-autofilter-sort";

      const sortAsc = document.createElement("button");
      sortAsc.type = "button";
      sortAsc.className = "pivot-autofilter-sort-btn";
      sortAsc.textContent = numeric ? "Sort Smallest to Largest" : "Sort A to Z";
      if (strategyPivotSort.key === colKey && strategyPivotSort.dir === "asc") {
        sortAsc.classList.add("is-current");
      }
      sortAsc.addEventListener("click", () => {
        closeAllPivotColumnFilterMenus();
        setStrategyPivotSort(colKey, "asc");
      });

      const sortDesc = document.createElement("button");
      sortDesc.type = "button";
      sortDesc.className = "pivot-autofilter-sort-btn";
      sortDesc.textContent = numeric ? "Sort Largest to Smallest" : "Sort Z to A";
      if (strategyPivotSort.key === colKey && strategyPivotSort.dir === "desc") {
        sortDesc.classList.add("is-current");
      }
      sortDesc.addEventListener("click", () => {
        closeAllPivotColumnFilterMenus();
        setStrategyPivotSort(colKey, "desc");
      });

      sortBlock.appendChild(sortAsc);
      sortBlock.appendChild(sortDesc);
      menu.appendChild(sortBlock);

      if (canFilter) {
        const sep = document.createElement("div");
        sep.className = "pivot-autofilter-sep";
        menu.appendChild(sep);

        const clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.className = "pivot-autofilter-sort-btn";
        clearBtn.textContent = `Clear Filter From "${colLabel}"`;
        clearBtn.disabled = !isStrategyPivotColumnFilterActive(colKey);
        clearBtn.addEventListener("click", () => {
          const all = strategyPivotFilterAll[colKey];
          if (all) strategyPivotFilterSelected[colKey] = new Set(all);
          if (colKey === "priority") syncPriorityIncludeCheckboxesFromColumnFilter();
          closeAllPivotColumnFilterMenus();
          renderStrategyGroupView();
        });
        menu.appendChild(clearBtn);

        const sep2 = document.createElement("div");
        sep2.className = "pivot-autofilter-sep";
        menu.appendChild(sep2);

        const searchWrap = document.createElement("div");
        searchWrap.className = "pivot-autofilter-search";
        const search = document.createElement("input");
        search.type = "search";
        search.placeholder = "Search";
        search.setAttribute("aria-label", `Search ${colLabel}`);
        searchWrap.appendChild(search);
        menu.appendChild(searchWrap);

        const list = document.createElement("div");
        list.className = "pivot-autofilter-list";

        const allSet = strategyPivotFilterAll[colKey] || new Set();
        const selSet = new Set(strategyPivotFilterSelected[colKey] || allSet);
        const values = Array.from(allSet);

        const selectAllLbl = document.createElement("label");
        selectAllLbl.className = "pivot-col-filter-item ms-select-all";
        const selectAllCb = document.createElement("input");
        selectAllCb.type = "checkbox";
        selectAllCb.checked = selSet.size === allSet.size && allSet.size > 0;
        selectAllCb.indeterminate = selSet.size > 0 && selSet.size < allSet.size;
        selectAllLbl.appendChild(selectAllCb);
        selectAllLbl.append(" (Select All)");
        list.appendChild(selectAllLbl);

        const valueCbs = [];
        values.forEach((val) => {
          const lbl = document.createElement("label");
          lbl.className = "pivot-col-filter-item";
          lbl.dataset.filterVal = String(val).toLowerCase();
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.className = "pivot-col-filter-cb";
          cb.value = val;
          cb.checked = selSet.has(val);
          lbl.appendChild(cb);
          lbl.append(" " + formatPivotFilterValueLabel(colKey, val));
          list.appendChild(lbl);
          valueCbs.push({ lbl, cb });
        });
        menu.appendChild(list);

        const syncSelectAll = () => {
          const visible = valueCbs.filter(({ lbl }) => lbl.style.display !== "none");
          const checked = visible.filter(({ cb }) => cb.checked).length;
          selectAllCb.checked = visible.length > 0 && checked === visible.length;
          selectAllCb.indeterminate = checked > 0 && checked < visible.length;
        };

        search.addEventListener("input", () => {
          const q = norm(search.value).toLowerCase();
          valueCbs.forEach(({ lbl }) => {
            const hay = lbl.dataset.filterVal || "";
            lbl.style.display = !q || hay.includes(q) ? "" : "none";
          });
          syncSelectAll();
        });

        selectAllCb.addEventListener("change", () => {
          valueCbs.forEach(({ lbl, cb }) => {
            if (lbl.style.display === "none") return;
            cb.checked = selectAllCb.checked;
          });
          syncSelectAll();
        });

        list.addEventListener("change", (e) => {
          if (e.target === selectAllCb) return;
          if (!e.target.classList?.contains("pivot-col-filter-cb")) return;
          syncSelectAll();
        });

        const footer = document.createElement("div");
        footer.className = "pivot-autofilter-footer";
        const okBtn = document.createElement("button");
        okBtn.type = "button";
        okBtn.className = "pivot-autofilter-ok";
        okBtn.textContent = "OK";
        okBtn.addEventListener("click", () => {
          const next = new Set();
          valueCbs.forEach(({ cb }) => {
            if (cb.checked) next.add(norm(cb.value));
          });
          if (!next.size) {
            strategyPivotFilterSelected[colKey] = new Set(allSet);
          } else {
            strategyPivotFilterSelected[colKey] = next;
          }
          if (colKey === "priority") syncPriorityIncludeCheckboxesFromColumnFilter();
          closeAllPivotColumnFilterMenus();
          renderStrategyGroupView();
        });
        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "pivot-autofilter-cancel";
        cancelBtn.textContent = "Cancel";
        cancelBtn.addEventListener("click", () => closeAllPivotColumnFilterMenus());
        footer.appendChild(okBtn);
        footer.appendChild(cancelBtn);
        menu.appendChild(footer);

        // Focus search after attach
        setTimeout(() => search.focus(), 0);
      }

      document.body.appendChild(menu);
      const rect = btn.getBoundingClientRect();
      menu.style.position = "fixed";
      menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 280))}px`;
      menu.style.top = `${rect.bottom + 2}px`;
    };

    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const open = document.querySelector(
        `.pivot-col-filter-menu.is-open[data-filter-key="${colKey}"]`
      );
      if (open) {
        closeAllPivotColumnFilterMenus();
        return;
      }
      openMenu();
    });

    th.appendChild(wrap);

    if (!window.__jeffcoPivotFilterDocWired) {
      window.__jeffcoPivotFilterDocWired = true;
      document.addEventListener("click", (e) => {
        if (e.target.closest(".pivot-col-filter-btn") || e.target.closest(".pivot-col-filter-menu")) {
          return;
        }
        closeAllPivotColumnFilterMenus();
      });
    }
  }

  function appendPivotColResizeHandle(th, colKey) {
    const handle = document.createElement("span");
    handle.className = "pivot-col-resize";
    handle.title = "Drag to resize column";
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeAllPivotColumnFilterMenus();
      const table = th.closest("table");
      const startX = e.clientX;
      const startW = getStrategyPivotColWidth(colKey);
      th.classList.add("is-resizing");
      document.body.classList.add("pivot-col-resizing");

      const onMove = (ev) => {
        const next = startW + (ev.clientX - startX);
        setStrategyPivotColWidth(colKey, next);
        applyStrategyPivotTableWidths(table);
      };
      const onUp = () => {
        th.classList.remove("is-resizing");
        document.body.classList.remove("pivot-col-resizing");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        saveStrategyPivotColWidths();
        applyStrategyPivotTableWidths(table);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
    th.appendChild(handle);
  }

  /**
   * Pivot staircase model
   * ----------------------
   * hierarchyOrder = drag-reorderable leading columns (including Priority)
   * visibleHierarchy = hierarchyOrder minus hidden columns
   * groupDims      = visibleHierarchy minus leafDims   // collapsible nest levels
   * leafDims       = last 2 dims, or only "project" when it is last
   *                  (so Project Type nests above individual Projects)
   *
   * Reordering columns changes header order AND nest order together.
   * Turning a column off removes it from the table and from nesting.
   */
  function getAllStrategyPivotColumnKeys() {
    return [
      ...DEFAULT_STRATEGY_PIVOT_HIERARCHY,
      ...STRATEGY_PIVOT_METRIC_COLUMNS.map((c) => c.key),
    ];
  }

  function isStrategyPivotColumnVisible(key) {
    return !strategyPivotHiddenCols.has(key);
  }

  function getStrategyPivotVisibleHierarchyOrder() {
    return getStrategyPivotHierarchyOrder().filter(isStrategyPivotColumnVisible);
  }

  function getStrategyPivotGroupDims() {
    const leaf = new Set(getStrategyPivotLeafDims());
    return getStrategyPivotVisibleHierarchyOrder().filter((k) => !leaf.has(k));
  }

  /**
   * Whenever Projects is visible it is the only leaf, so every other dim
   * (including Project Type) stays an expandable group no matter which
   * columns are hidden or how they are ordered.
   */
  function getStrategyPivotLeafDims() {
    const order = getStrategyPivotVisibleHierarchyOrder();
    if (!order.length) return [];
    if (order.includes("project")) return ["project"];
    if (order.length <= 2) return order.slice();
    return order.slice(-2);
  }

  function loadStrategyPivotHiddenCols() {
    try {
      const raw = window.localStorage?.getItem(PIVOT_HIDDEN_COLS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const allowed = new Set(getAllStrategyPivotColumnKeys());
      strategyPivotHiddenCols = new Set(parsed.filter((k) => allowed.has(k)));
      // Always keep at least one dimension column visible.
      const visibleDims = DEFAULT_STRATEGY_PIVOT_HIERARCHY.filter((k) => !strategyPivotHiddenCols.has(k));
      if (!visibleDims.length) {
        strategyPivotHiddenCols.delete(DEFAULT_STRATEGY_PIVOT_HIERARCHY[0]);
      }
    } catch {
      // ignore
    }
  }

  function saveStrategyPivotHiddenCols() {
    try {
      window.localStorage?.setItem(
        PIVOT_HIDDEN_COLS_STORAGE_KEY,
        JSON.stringify([...strategyPivotHiddenCols])
      );
    } catch {
      // ignore
    }
  }

  function setStrategyPivotColumnVisible(key, visible) {
    const allowed = new Set(getAllStrategyPivotColumnKeys());
    if (!allowed.has(key)) return false;
    if (visible) {
      strategyPivotHiddenCols.delete(key);
    } else {
      if (STRATEGY_PIVOT_DIM_DEFS[key]) {
        const visibleDims = getStrategyPivotVisibleHierarchyOrder().filter((k) => k !== key);
        if (!visibleDims.length) return false;
      }
      strategyPivotHiddenCols.add(key);
    }
    saveStrategyPivotHiddenCols();
    const sortKeys = getStrategyPivotColumns().map((c) => c.key);
    if (!sortKeys.includes(strategyPivotSort.key)) {
      strategyPivotSort = {
        key: sortKeys[0] || "strategyGroup",
        dir: "asc",
      };
    }
    return true;
  }

  function showAllStrategyPivotColumns() {
    strategyPivotHiddenCols = new Set();
    saveStrategyPivotHiddenCols();
    renderStrategyGroupView();
  }

  function strategyPivotFieldsPassColumnFiltersExcept(fields, skipKey) {
    return STRATEGY_PIVOT_FILTERABLE_KEYS.every(
      (key) => key === skipKey || strategyPivotColumnValuePasses(key, fields[key])
    );
  }

  /** Keep top P1–P4 checkboxes and Priority column AutoFilter in sync. */
  function syncPriorityIncludeCheckboxesFromColumnFilter() {
    const sel = strategyPivotFilterSelected.priority;
    const all = strategyPivotFilterAll.priority;
    const cbs = document.querySelectorAll(".priority-include-cb");
    if (!cbs.length) return;
    if (!sel || !all || sel.size >= all.size) {
      cbs.forEach((cb) => {
        cb.checked = true;
      });
      return;
    }
    cbs.forEach((cb) => {
      const p = norm(cb.getAttribute("data-priority"));
      cb.checked = sel.has(p);
    });
  }

  function syncPriorityColumnFilterFromIncludeCheckboxes() {
    const included = getIncludedPriorities();
    const all = strategyPivotFilterAll.priority || new Set(["1", "2", "3", "4"]);
    if (!included.size) {
      // Avoid empty filter (would show no rows) — treat as all on.
      strategyPivotFilterSelected.priority = new Set(all);
      document.querySelectorAll(".priority-include-cb").forEach((cb) => {
        cb.checked = true;
      });
      return;
    }
    strategyPivotFilterSelected.priority = new Set(
      [...included].map((p) => norm(p)).filter((p) => all.has(p) || ["1", "2", "3", "4"].includes(p))
    );
  }

  function setPrioritySummaryCostEl(el, amount, included) {
    if (!el) return;
    el.textContent = amount ? formatLocaleUsdInteger(amount) : "—";
    el.classList.toggle("is-excluded", !included);
  }

  function formatStrategyPivotDimDisplay(dim, raw) {
    const v = (raw ?? "").toString().trim();
    if (!v || v === "—") return "—";
    if (dim === "priority") {
      return STRATEGY_PIVOT_PRIORITY_FILTER_LABELS[v] || `P${v}`;
    }
    return v;
  }

  const PIVOT_TREE_BADGE = {
    strategyGroup: { text: "P", cls: "pivot-tree-badge--strategy" },
    projectCategory: { text: "T", cls: "pivot-tree-badge--category" },
    projectType: { text: "T", cls: "pivot-tree-badge--type" },
    project: { text: "•", cls: "pivot-tree-badge--project" },
    school: { text: "S", cls: "pivot-tree-badge--school" },
    systemCategory: { text: "C", cls: "pivot-tree-badge--system" },
    priority: { text: "!", cls: "pivot-tree-badge--priority" },
  };

  /** Nest-level tone (0…) for color-coding headers / legend to match group row bands. */
  function getStrategyPivotDimNestTone(dimKey) {
    const gi = getStrategyPivotGroupDims().indexOf(dimKey);
    return gi >= 0 ? gi : null;
  }

  function appendEmptyPivotDimCell(tr, dim) {
    const td = document.createElement("td");
    td.className = `pivot-dim-cell pivot-dim-empty pivot-dim-cell--${dim}`;
    tr.appendChild(td);
  }

  /** Group label cell: chevron + badge + text. Optional colspan lets label use empty columns to the right. */
  function appendPivotGroupLabelCell(tr, { dim, label, collapsed, meta, colSpan }) {
    const td = document.createElement("td");
    td.className = `pivot-dim-cell pivot-group-label-cell pivot-dim-cell--${dim}`;
    if (colSpan > 1) td.colSpan = colSpan;

    const inner = document.createElement("div");
    inner.className = "pivot-group-label-wrap";

    const chev = document.createElement("span");
    chev.className = "pivot-tree-chevron" + (collapsed ? " is-collapsed" : "");
    chev.setAttribute("aria-hidden", "true");
    chev.title = "Click to expand/collapse · Right-click for group options";
    inner.appendChild(chev);

    if (dim === "priority") {
      const p = norm(label);
      if (p && p !== "—") appendPriorityBadge(inner, p);
      else {
        const lbl = document.createElement("span");
        lbl.className = "pivot-tree-label tree-metric-muted";
        lbl.textContent = "—";
        inner.appendChild(lbl);
      }
    } else {
      const badgeDef = PIVOT_TREE_BADGE[dim] || { text: "•", cls: "pivot-tree-badge--strategy" };
      const badge = document.createElement("span");
      badge.className = `pivot-tree-badge ${badgeDef.cls}`;
      badge.textContent = badgeDef.text;
      inner.appendChild(badge);

      const display = formatStrategyPivotDimDisplay(dim, label);
      const lbl = document.createElement("span");
      lbl.className = "pivot-tree-label";
      lbl.textContent = display;
      lbl.title = display;
      inner.appendChild(lbl);
    }

    if (meta) {
      const metaEl = document.createElement("span");
      metaEl.className = "pivot-tree-meta";
      metaEl.textContent = meta;
      inner.appendChild(metaEl);
    }

    td.appendChild(inner);
    tr.appendChild(td);
  }

  function appendPivotLeafDimCell(tr, dim, value) {
    const td = document.createElement("td");
    td.className = `pivot-dim-cell pivot-leaf-dim pivot-dim-cell--${dim}`;
    const text = value || "—";
    td.textContent = text;
    td.title = value || "";
    if (!value || text === "—") td.classList.add("tree-metric-muted");
    tr.appendChild(td);
  }

  function pivotGroupMetaLabel(node, { isDeepestGroup } = {}) {
    // Deepest group sits just above project rows — count is redundant and crowds the label.
    if (isDeepestGroup) return "";
    if (!node?.metrics?.projects) return "";
    const n = node.metrics.projects;
    return `${n} ${n === 1 ? "project" : "projects"}`;
  }

  function getStrategyPivotHierarchyOrder() {
    const valid = strategyPivotHierarchyOrder.filter((k) => STRATEGY_PIVOT_DIM_DEFS[k]);
    if (valid.length !== DEFAULT_STRATEGY_PIVOT_HIERARCHY.length) {
      return DEFAULT_STRATEGY_PIVOT_HIERARCHY.slice();
    }
    return valid;
  }

  function getStrategyPivotDimLabel(key) {
    return STRATEGY_PIVOT_DIM_DEFS[key]?.label || key;
  }

  function getStrategyPivotColumns() {
    const dims = getStrategyPivotVisibleHierarchyOrder().map((key) => ({
      key,
      label: getStrategyPivotDimLabel(key),
      align: key === "priority" ? "center" : "left",
      isDim: true,
    }));
    const metrics = STRATEGY_PIVOT_METRIC_COLUMNS.filter((c) => isStrategyPivotColumnVisible(c.key));
    return dims.concat(metrics);
  }

  function loadStrategyPivotHierarchyOrder() {
    try {
      const raw = window.localStorage?.getItem(PIVOT_HIERARCHY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const valid = parsed.filter((k) => STRATEGY_PIVOT_DIM_DEFS[k]);
      if (valid.length === DEFAULT_STRATEGY_PIVOT_HIERARCHY.length) {
        strategyPivotHierarchyOrder = valid;
      }
    } catch {
      // ignore
    }
  }

  function saveStrategyPivotHierarchyOrder() {
    try {
      window.localStorage?.setItem(
        PIVOT_HIERARCHY_STORAGE_KEY,
        JSON.stringify(getStrategyPivotHierarchyOrder())
      );
    } catch {
      // ignore
    }
  }

  function moveStrategyPivotDim(dragKey, dropKey) {
    if (!dragKey || !dropKey || dragKey === dropKey) return;
    const order = getStrategyPivotHierarchyOrder().slice();
    const from = order.indexOf(dragKey);
    const to = order.indexOf(dropKey);
    if (from < 0 || to < 0) return;
    order.splice(from, 1);
    order.splice(to, 0, dragKey);
    strategyPivotHierarchyOrder = order;
    saveStrategyPivotHierarchyOrder();
    const sortKeys = getStrategyPivotColumns().map((c) => c.key);
    if (!sortKeys.includes(strategyPivotSort.key)) {
      strategyPivotSort = { key: order[0], dir: "asc" };
    }
    renderStrategyGroupView();
  }

  function resetStrategyPivotHierarchyOrder() {
    strategyPivotHierarchyOrder = DEFAULT_STRATEGY_PIVOT_HIERARCHY.slice();
    saveStrategyPivotHierarchyOrder();
    strategyPivotHiddenCols = new Set(DEFAULT_STRATEGY_PIVOT_HIDDEN_COLS);
    saveStrategyPivotHiddenCols();
    resetStrategyPivotColWidths();
    strategyPivotSort = { key: "strategyGroup", dir: "asc" };
    renderStrategyGroupView();
  }

  function wirePivotDimDrag(el) {
    if (!el || el.dataset.pivotDragWired === "1") return;
    el.dataset.pivotDragWired = "1";
    el.addEventListener("dragstart", (e) => {
      if (!el.dataset.dimKey) return;
      if (e.target.closest(".pivot-col-resize, .pivot-col-filter-btn, .pivot-col-filter")) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData("text/pivot-dim", el.dataset.dimKey);
      e.dataTransfer.effectAllowed = "move";
      el.classList.add("is-dragging");
    });
    el.addEventListener("dragend", () => {
      el.classList.remove("is-dragging");
      document.querySelectorAll(".drag-over").forEach((n) => n.classList.remove("drag-over"));
    });
    el.addEventListener("dragover", (e) => {
      if (!el.dataset.dimKey) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      el.classList.add("drag-over");
    });
    el.addEventListener("dragleave", () => el.classList.remove("drag-over"));
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      el.classList.remove("drag-over");
      const dragKey = e.dataTransfer.getData("text/pivot-dim");
      if (dragKey && el.dataset.dimKey) moveStrategyPivotDim(dragKey, el.dataset.dimKey);
    });
  }
  let strategyGroupCacheKey = "";
  let strategyGroupCache = null;
  const collapsedSelectedStrategyGroups = new Set();
  const collapsedSelectedStrategySchools = new Set();

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

  function normalizeArticulationAreaKey(v) {
    return String(v ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
  }

  function displayArticulationAreaLabel(raw) {
    const t = String(raw ?? "").trim();
    if (!t) return UNKNOWN_ARTICULATION_LABEL;
    const key = normalizeArticulationAreaKey(t);
    if (!key || key === "noarticulationarea" || key === "n/a" || key === "na" || key === "none") {
      return UNKNOWN_ARTICULATION_LABEL;
    }
    return t;
  }

  function buildArticulationLookups(mapRows) {
    const byUid = new Map();
    const byName = new Map();
    (mapRows || []).forEach((r) => {
      const code = normUid(r["Building Code"] ?? r.BuildingCode ?? "");
      const name = norm(r["Building Name"] ?? r.BuildingName ?? "");
      const art = String(r.Articulation ?? r["Articulation Area"] ?? r.ArticulationArea ?? "").trim();
      if (code) byUid.set(code, art);
      if (name) {
        const nk = normName(name);
        if (nk && !byName.has(nk)) byName.set(nk, art);
      }
    });
    return { byUid, byName };
  }

  function resolveArticulationAreaLabel(opt, lookups) {
    if (!opt) return UNKNOWN_ARTICULATION_LABEL;
    const uid = normUid(opt.uid);
    if (uid && !String(opt.uid).startsWith("name:") && lookups?.byUid?.has(uid)) {
      return displayArticulationAreaLabel(lookups.byUid.get(uid));
    }
    const nk = normName(opt.name);
    if (nk && lookups?.byName?.has(nk)) {
      return displayArticulationAreaLabel(lookups.byName.get(nk));
    }
    return UNKNOWN_ARTICULATION_LABEL;
  }

  function articulationAreaSortKey(label) {
    return label === UNKNOWN_ARTICULATION_LABEL ? "\uffff" : String(label || "");
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

  /**
   * Normalize 02.1 Safety & Security inventory rows into project-list shape.
   * AssetType becomes "Camera — Axis" (etc.) so each equipment line is distinct.
   */
  function normalizeSafetySecurityProjectRows(rawRows) {
    return (rawRows || [])
      .map((r) => {
        const asset = norm(r.AssetType ?? r["AssetType"]);
        const equip = norm(r.EquipmentType ?? r["EquipmentType"]);
        let projectType = asset || equip;
        if (asset && equip && equip.toLowerCase() !== asset.toLowerCase()) {
          projectType = `${asset} — ${equip}`;
        }
        const qty = norm(r.Quantity ?? r["Quantity"] ?? r.UnitValue ?? r["UnitValue"]);
        const unitCost = norm(r.UnitCost ?? r["UnitCost"]);
        const rc = norm(r.ReplacementCost ?? r["ReplacementCost"]);
        const priority = norm(r.PriorityScore ?? r["PriorityScore"]) || "1";
        const source = norm(r.ConditionSource ?? r["ConditionSource"]) || "Infrastructure costs April 2026";
        return {
          JeffCoFacilityID: norm(r.JeffCoFacilityID ?? r["JeffCoFacilityID"]),
          UniqueID: norm(r.UniqueID ?? r["UniqueID"]),
          SchoolName: norm(r.SchoolName ?? r["SchoolName"]),
          SystemCategory: SAFETY_SECURITY_SYSTEM_CATEGORY,
          AssetType: projectType,
          PriorityScore: priority,
          ConditionScore: "",
          ConditionSource: source,
          Unit: "EA",
          UnitCost: unitCost,
          UnitValue: qty,
          ReplacementCost: rc,
          __safetySecurityProject: true,
        };
      })
      .filter((r) => r.SchoolName && r.AssetType && (parseNumberMaybe(r.ReplacementCost) || 0) > 0);
  }

  /** Index 02.2 line items for expandable detail under each FD asset type. */
  function buildFacilitiesDeficiencyDetailIndex(rawRows) {
    const map = new Map();
    (rawRows || []).forEach((r) => {
      const fid = norm(r.JeffCoFacilityID ?? r["JeffCoFacilityID"]);
      const system = norm(r.System ?? r["System"] ?? r.AssetType ?? r["AssetType"]);
      if (!fid || !system) return;
      const cost = parseNumberMaybe(
        r["Cost with Inflation Factor"] ??
          r["Cost with Inflation Factor "] ??
          r.ReplacementCost ??
          r["ReplacementCost"] ??
          r.Cost
      );
      if (cost === null || !Number.isFinite(cost) || cost <= 0) return;
      const priorityRaw = norm(r.Priority ?? r["Priority"] ?? r.PriorityScore ?? r["PriorityScore"]) || "2";
      const priority = ["1", "2", "3", "4"].includes(priorityRaw) ? priorityRaw : "2";
      const desc = norm(r["New RSMeans Deficiency Description"]);
      const scope = norm(r["Deficiency (Scope Of Work)"]);
      const qty = norm(r.Qty ?? r["Qty"] ?? r.UnitValue ?? r["UnitValue"]);
      const uom = norm(r.UoM ?? r["UoM"] ?? r.Unit ?? r["Unit"]);
      const building = norm(r.Building ?? r["Building"]);
      const location = norm(r.Location ?? r["Location"] ?? r.SchoolName ?? r["SchoolName"]);
      const deficiencyId = norm(r.ID ?? r["ID"]);
      let unitValue = "";
      if (qty && uom) unitValue = `${qty} ${uom}`;
      else if (qty) unitValue = qty;
      const detail = {
        JeffCoFacilityID: fid,
        UniqueID: norm(r.UniqueID ?? r["UniqueID"]),
        SchoolName: location,
        SystemCategory: "08_Facilities Deficiency",
        AssetType: system,
        PriorityScore: priority,
        __csvPriority: priority,
        ConditionScore: building,
        ConditionSource: "02.2 Facilities Deficiency Projects",
        UnitCost: "",
        UnitValue: unitValue,
        ReplacementCost: formatLocaleUsdInteger(Math.round(cost)),
        __masterDeficiencyDetail: true,
        __masterDetailLabel: desc || scope || system,
        __masterScope: scope,
        __masterBuilding: building,
        __masterLocation: location,
        __masterDeficiencyId: deficiencyId,
        __excludedFromTotals: false,
      };
      const sysKey = system.toLowerCase();
      const keys = ["fid:" + fid + "||" + sysKey];
      if (location) keys.push("name:" + normName(location) + "||" + sysKey);
      keys.forEach((key) => {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(detail);
      });
    });
    map.forEach((list) => {
      list.sort((a, b) => {
        const pa = norm(a.__csvPriority);
        const pb = norm(b.__csvPriority);
        if (pa !== pb) return pa.localeCompare(pb, undefined, { numeric: true });
        return norm(a.__masterDetailLabel).localeCompare(norm(b.__masterDetailLabel), undefined, {
          sensitivity: "base",
          numeric: true,
        });
      });
    });
    facilitiesDeficiencyDetailByFacilitySystem = map;
    if (!map.size) {
      console.warn("Facilities Deficiency detail index is empty.");
    }
  }

  /**
   * Collapse 02.2 line items into AssetType × Priority rollups for the project list.
   * Line-item detail stays in facilitiesDeficiencyDetailByFacilitySystem for dropdowns.
   * Without this, strategy/school costing reprocesses thousands of rows on every load/filter.
   */
  function normalizeFacilitiesDeficiencyProjectRows(rawRows) {
    const rows = Array.isArray(rawRows) ? rawRows : [];
    if (!rows.length) return [];
    const looksLikeLineItems = rows.some(
      (r) =>
        norm(r["New RSMeans Deficiency Description"]) ||
        norm(r["Deficiency (Scope Of Work)"]) ||
        norm(r.ID ?? r["ID"]) ||
        norm(r.System ?? r["System"])
    );
    if (!looksLikeLineItems) {
      return rows.filter((r) => {
        const name = norm(r.SchoolName ?? r["SchoolName"]);
        const asset = norm(r.AssetType ?? r["AssetType"]);
        return !!(name && asset);
      });
    }

    const byKey = new Map();
    rows.forEach((r) => {
      const fid = norm(r.JeffCoFacilityID ?? r["JeffCoFacilityID"]);
      const uid = norm(r.UniqueID ?? r["UniqueID"]);
      const school = norm(r.SchoolName ?? r["SchoolName"] ?? r.Location ?? r["Location"]);
      const asset = norm(r.System ?? r["System"] ?? r.AssetType ?? r["AssetType"]);
      if (!school || !asset) return;
      const priorityRaw =
        norm(r.Priority ?? r["Priority"] ?? r.PriorityScore ?? r["PriorityScore"]) || "2";
      const priority = ["1", "2", "3", "4"].includes(priorityRaw) ? priorityRaw : "2";
      const cost = parseNumberMaybe(
        r["Cost with Inflation Factor"] ??
          r["Cost with Inflation Factor "] ??
          r.ReplacementCost ??
          r["ReplacementCost"]
      );
      const key = `${fid || uid || school}||${asset}||${priority}`;
      let agg = byKey.get(key);
      if (!agg) {
        agg = {
          JeffCoFacilityID: fid,
          UniqueID: uid,
          SchoolName: school,
          SystemCategory: "08_Facilities Deficiency",
          AssetType: asset,
          PriorityScore: priority,
          ConditionSource: "02.2 Facilities Deficiency Projects",
          ReplacementCost: 0,
        };
        byKey.set(key, agg);
      }
      if (!agg.UniqueID && uid) agg.UniqueID = uid;
      if (!agg.JeffCoFacilityID && fid) agg.JeffCoFacilityID = fid;
      if (cost !== null && Number.isFinite(cost) && cost > 0) agg.ReplacementCost += cost;
    });

    return Array.from(byKey.values()).map((agg) => ({
      JeffCoFacilityID: agg.JeffCoFacilityID,
      UniqueID: agg.UniqueID,
      SchoolName: agg.SchoolName,
      SystemCategory: agg.SystemCategory,
      AssetType: agg.AssetType,
      PriorityScore: agg.PriorityScore,
      ConditionSource: agg.ConditionSource,
      ReplacementCost:
        agg.ReplacementCost > 0 ? Number(agg.ReplacementCost.toFixed(2)).toString() : "None",
    }));
  }

  /**
   * Lookup keys ("fid:…" / "name:…") identifying which facilities an FD rollup covers.
   * Rows built for the profile drop JeffCoFacilityID, so UniqueID and SchoolName are used as fallbacks.
   */
  function collectMasterDeficiencyFacilityKeys(assetRows) {
    const keys = new Set();
    const walk = (r) => {
      if (!r) return;
      if (Array.isArray(r.__rollupRows) && r.__rollupRows.length) {
        r.__rollupRows.forEach(walk);
        return;
      }
      const fid = norm(r.JeffCoFacilityID ?? r["JeffCoFacilityID"]);
      if (fid) keys.add("fid:" + fid);
      const uid = normUid(r.UniqueID ?? r["UniqueID"]);
      const uidFid = uid ? norm(facilityIdByUid.get(uid)) : "";
      if (uidFid) keys.add("fid:" + uidFid);
      const name = norm(r.SchoolName ?? r["SchoolName"]);
      if (name) keys.add("name:" + normName(name));
    };
    (assetRows || []).forEach(walk);
    if (!keys.size) {
      const fallbackFid = norm(facilityIdByUid.get(normUid(resolvedUniqueId)));
      if (fallbackFid) keys.add("fid:" + fallbackFid);
      if (resolvedSchoolName) keys.add("name:" + normName(resolvedSchoolName));
    }
    return keys;
  }

  /** Master line items for an FD asset rollup, filtered by active priority checkboxes. */
  function getMasterDeficiencyDetailsForAsset(assetRows, assetType) {
    const system = norm(assetType);
    if (!system || !facilitiesDeficiencyDetailByFacilitySystem.size) return [];
    const facilityKeys = collectMasterDeficiencyFacilityKeys(assetRows);
    if (!facilityKeys.size) return [];
    const sysKey = system.toLowerCase();
    const filteredPriorities = getFilteredPriorities();
    const totalPriorityCbs = document.querySelectorAll(".priority-filter-cb").length;
    const filterByPriority =
      filteredPriorities.size > 0 && filteredPriorities.size < totalPriorityCbs;

    const matched = new Set();
    facilityKeys.forEach((fk) => {
      const list = facilitiesDeficiencyDetailByFacilitySystem.get(fk + "||" + sysKey);
      if (list) list.forEach((d) => matched.add(d));
    });
    if (!matched.size) return [];

    const locations = new Set();
    matched.forEach((d) => locations.add(norm(d.__masterLocation || d.SchoolName)));
    const multiFacility = locations.size > 1;

    const out = [];
    matched.forEach((d) => {
      const p = norm(d.__csvPriority || d.PriorityScore);
      if (filterByPriority && !filteredPriorities.has(p)) return;
      if (!multiFacility) {
        out.push(d);
        return;
      }
      const loc = norm(d.__masterLocation || d.SchoolName);
      out.push({
        ...d,
        __masterDetailLabel: loc
          ? `${loc} · ${norm(d.__masterDetailLabel) || system}`
          : d.__masterDetailLabel,
      });
    });
    out.sort((a, b) => {
      const pa = norm(a.__csvPriority);
      const pb = norm(b.__csvPriority);
      if (pa !== pb) return pa.localeCompare(pb, undefined, { numeric: true });
      return norm(a.__masterDetailLabel).localeCompare(norm(b.__masterDetailLabel), undefined, {
        sensitivity: "base",
        numeric: true,
      });
    });
    return out;
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
   * Outcomes that trigger full-building new-construction costing and mark other lines as decision N/A.
   * (Former gut-reno path now uses New construction by level.)
   * 02.1 Safety & Security inventory always stays in scope (real equipment costs, not behind the FCI toggle).
   */
  const DECISION_GUT_OR_NC_PROJECT_SCOPE_CATEGORIES = new Set([
    "01_new construction",
    "02.1_SafetyandSecurityProjects",
    "04_campus upgrade",
    "05_Modernization",
  ]);

  function isInDecisionGutOrNcProjectScope(systemCategory) {
    const s = norm(systemCategory);
    if (!s) return false;
    if (DECISION_GUT_OR_NC_PROJECT_SCOPE_CATEGORIES.has(s)) return true;
    if (isSafetySecurityProjectsCategory(s)) return true;
    if (isSecurityPackageSystemCategory(s)) return true;
    if (isModernizationSystemCategory(s)) return true;
    if (s === "04_campus upgrade" || s.startsWith("04_")) return true;
    if (s === "01_new construction" || s.startsWith("01_")) return true;
    return false;
  }

  /** AssetTypes where Replacement Cost is labeled (not $). Never applied to full-building New construction / Demolition. */
  const SITE_SPECIFIC_REPLACEMENT_ASSET_NAMES = [
    "ADA compliance",
    "New auditorium",
    "New cafeteria",
    "New kitchen",
    "New gym",
    "New gym locker rooms",
    "New administrative / support site",
    "New stadium",
    "New construction OELS",
    // Multipurpose room tiers intentionally carry no unit cost — JeffCo supplies the value per school.
    "Level 2 - targeted modernization - multipurpose room",
    "Level 3 - heavy modernization - multipurpose room",
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
      "Level 1 - campus landscaping upgrade - standard",
      "Level 2 - campus landscaping upgrade - climate resiliency",
      "Campus landscaping upgrade", // legacy CSV key
      "Parking lot expansion",
      "Expand parking", // legacy CSV key
      "Front of school branding, landscape upgrades",
      "Improve drop-off / pick-up zone",
      "Bioswales",
      "Playground replacement (ECE grades)",
      "Playground replacement (K-2nd grades)",
      "Playground replacement (3rd-5th grades)",
      "Playground replacement (ages 2-5)", // legacy
      "Playground replacement (ages 5-12)", // legacy
      "Interior LED lighting upgrades",
      "Exterior LED lighting upgrades (building-mounted)",
      "Exterior LED lighting upgrades (pole-mounted)",
    ].map((n) => normProjectKey(n))
  );

  /** Planning defaults when Unit Value is blank after hydration (04_campus upgrade playgrounds). */
  const PLAYGROUND_ECE_DEFAULT_SF = 2500;
  const PLAYGROUND_K2_DEFAULT_SF = 4000;
  const PLAYGROUND_3_5_DEFAULT_SF = 6000;
  const PLAYGROUND_ECE_PK = normProjectKey("Playground replacement (ECE grades)");
  const PLAYGROUND_K2_PK = normProjectKey("Playground replacement (K-2nd grades)");
  const PLAYGROUND_3_5_PK = normProjectKey("Playground replacement (3rd-5th grades)");
  // Legacy keys still accepted for saved qty overrides.
  const PLAYGROUND_2_5_PK = normProjectKey("Playground replacement (ages 2-5)");
  const PLAYGROUND_5_12_PK = normProjectKey("Playground replacement (ages 5-12)");
  const PLAYGROUND_2_5_DEFAULT_SF = PLAYGROUND_ECE_DEFAULT_SF;
  const PLAYGROUND_5_12_DEFAULT_SF = PLAYGROUND_K2_DEFAULT_SF;

  /** Yes/No condition, qty 1 + $ when Good (reference); no 0–1 gradient bar. */
  const CAMPUS_YES_NO_REFERENCE_ASSET_KEYS = new Set(
    [
      "Add shade structure(s)",
      "Small shade structure installation (12'x12')",
      "Large shade structure installation (16'x32')",
      "New outdoor classroom",
    ].map((n) => normProjectKey(n))
  );

  function manualPlanningAssetKey(row) {
    return normProjectKey(row?.AssetType ?? row?.["Asset Type"] ?? row?.["Project"] ?? row?.assetType ?? "");
  }

  function isPlaygroundPlanningAssetRow(row) {
    const pk = manualPlanningAssetKey(row);
    return (
      pk === PLAYGROUND_ECE_PK ||
      pk === PLAYGROUND_K2_PK ||
      pk === PLAYGROUND_3_5_PK ||
      pk === PLAYGROUND_2_5_PK ||
      pk === PLAYGROUND_5_12_PK
    );
  }

  function isCampusYesNoReferenceAssetRow(row) {
    return CAMPUS_YES_NO_REFERENCE_ASSET_KEYS.has(manualPlanningAssetKey(row));
  }

  /** Matches the condition column when it shows "Yes" for shade / outdoor classroom (Good in source data). */
  function campusYesNoReferenceRowShowsYes(row) {
    if (!isCampusYesNoReferenceAssetRow(row)) return false;
    return norm(row?.ConditionScore || row?.__libraryScore || "").toLowerCase() === "good";
  }

  /** Strip leading `01_`-style prefix and title-case for UI (rows keep canonical SystemCategory). */
  function displaySystemCategoryLabel(raw) {
    const s0 = norm(raw);
    if (!s0) return "";
    if (s0 === "(Uncategorized)") return "Uncategorized";
    if (isSafetySecurityProjectsCategory(s0)) return "Safety & Security";
    const stripped = s0.replace(/^\d{2}(?:\.\d+)?_/i, "").replace(/_/g, " ");
    return stripped
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => {
        const lo = w.toLowerCase();
        if (lo === "k-8" || lo === "k–8") return "K–8";
        if (w === "&") return "&";
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      })
      .join(" ");
  }

  /** Display labels only (library + project CSV keep canonical AssetType strings). */
  const PROJECT_TYPE_DISPLAY_LABEL_BY_ASSET_PK = new Map([
    [normProjectKey("Front of school branding, landscape upgrades"), "Front of school branding, curb appeal"],
    [normProjectKey("New construction ES"), "New Construction ES"],
    [normProjectKey("New construction MS"), "New Construction MS"],
    [normProjectKey("New construction HS"), "New Construction HS"],
    [normProjectKey("New construction K-8"), "New Construction K-8"],
    [normProjectKey("New construction OELS"), "New Construction OELS"],
    [normProjectKey("New administrative / support site"), "New Administrative / Support Site"],
    [normProjectKey("New auditorium"), "New Auditorium"],
    [normProjectKey("New cafeteria"), "New Cafeteria"],
    [normProjectKey("New kitchen"), "New Kitchen"],
    [normProjectKey("New gym"), "New Gym"],
    [normProjectKey("New gym locker rooms"), "New Gym Locker Rooms"],
    [normProjectKey("New stadium"), "New Stadium"],
  ]);

  function displayProjectTypeLabel(row) {
    if (!row) return "";
    if (row.__masterDeficiencyDetail) {
      return norm(row.__masterDetailLabel) || (row.AssetType ?? row["AssetType"] ?? "");
    }
    const pk = manualPlanningAssetKey(row);
    const mapped = PROJECT_TYPE_DISPLAY_LABEL_BY_ASSET_PK.get(pk);
    if (mapped) return mapped;
    return row.AssetType ?? row["AssetType"] ?? "";
  }

  /** Full-building New construction lines that use school SquareFt (not standalone addition SF). */
  function isFullBuildingNewConstructionAsset(assetType) {
    const pk = normProjectKey(assetType);
    return (
      pk === normProjectKey("New construction ES") ||
      pk === normProjectKey("New construction MS") ||
      pk === normProjectKey("New construction HS") ||
      pk === normProjectKey("New construction K-8") ||
      pk === normProjectKey("Demolition")
    );
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
    if (sys === "01_new construction") return false;
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
      if (r.__excludedReason === "modernization_tier") return;
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
      if (r.__excludedReason === "modernization_tier") return;
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
      let n = PLAYGROUND_K2_DEFAULT_SF;
      if (pk === PLAYGROUND_ECE_PK || pk === PLAYGROUND_2_5_PK) n = PLAYGROUND_ECE_DEFAULT_SF;
      else if (pk === PLAYGROUND_3_5_PK) n = PLAYGROUND_3_5_DEFAULT_SF;
      else if (pk === PLAYGROUND_K2_PK || pk === PLAYGROUND_5_12_PK) n = PLAYGROUND_K2_DEFAULT_SF;
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
    if (norm(row.__excludedReason) === "modernization_tier") return false;
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
   * 01_new construction standalone additions / 04_campus: bucket matches normalizeRoomCategory(Project).
   */
  function buildScheduleSfBucketByProjectKey() {
    const m = new Map();
    const put = (assetName, schedulePhrase) => {
      m.set(normProjectKey(assetName), normalizeRoomCategory(schedulePhrase));
    };
    const putSelf = (assetName) => put(assetName, assetName);

    putSelf("New auditorium");
    putSelf("New cafeteria");
    putSelf("New kitchen");
    putSelf("New gym");
    putSelf("New gym locker rooms");

    putSelf("Playground replacement (ECE grades)");
    putSelf("Playground replacement (K-2nd grades)");
    putSelf("Playground replacement (3rd-5th grades)");
    putSelf("Playground replacement (ages 2-5)");
    putSelf("Playground replacement (ages 5-12)");
    putSelf("Resurface asphalt");
    putSelf("Resurface concrete");

    return m;
  }

  const SCHEDULE_SF_BUCKET_BY_PROJECT_KEY = buildScheduleSfBucketByProjectKey();

  /**
   * Modernization space → room-schedule CostEstimateLink bucket. All tiers of a space draw the same SF.
   * Spaces absent here (auditorium, gym locker rooms, specialty CTE labs) are not tagged in the room
   * schedule; `main entry / vestibule` falls back to the library size assumption below.
   */
  const MODERNIZATION_SCHEDULE_BUCKET_BY_SPACE = new Map(
    [
      ["interiors", "modernize corridors"],
      ["admin", "modernize admin"],
      ["cafeteria", "modernize cafeteria"],
      ["classrooms", "modernize classrooms"],
      ["group restrooms", "modernize restrooms"],
      ["gym", "modernize gym / assembly space"],
      ["kitchen - es", "modernize kitchen"],
      ["kitchen - ms", "modernize kitchen"],
      ["kitchen - hs", "modernize kitchen"],
      ["library / media center", "modernize library/media center"],
      ["multipurpose room", "modernize multipurpose room"],
      ["science labs (ms & hs)", "modernize STEM/specialized labs"],
    ].map(([space, phrase]) => [space, normalizeRoomCategory(phrase)])
  );

  /** Planning SF for scored spaces the room schedule does not tag; from the library size assumptions. */
  const MODERNIZATION_FALLBACK_PLANNING_SF_BY_SPACE = new Map([["main entry / vestibule", 950]]);

  function getModernizationScheduleBucket(row) {
    const tier = parseModernizationTier(row?.AssetType);
    if (!tier) return null;
    if (!isModernizationSystemCategory(row?.SystemCategory)) return null;
    return MODERNIZATION_SCHEDULE_BUCKET_BY_SPACE.get(tier.space) || null;
  }

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
    const facilityIdKey = findRoomScheduleKey(keys, /jeffcofacilityid/i);
    const campusKey = findRoomScheduleKey(keys, /campus\s*code/i);
    const areaKey = findRoomScheduleKey(keys, /^area$/i) || findRoomScheduleKey(keys, /\barea\b/i);
    const categoryKey =
      findRoomScheduleKey(keys, /cost\s*estimate|costestimate|cost\s*link|category|project/i) ||
      findRoomScheduleKey(keys, /costestimate/i);
    return { facilityKey, facilityIdKey, campusKey, areaKey, categoryKey };
  }

  function buildRoomScheduleSfTotals(rows) {
    const idx = buildRoomScheduleIndex(rows);
    if (!idx.areaKey || !idx.categoryKey) {
      console.warn("Room schedule: missing AREA or CostEstimateLink column for SF totals.", idx);
      return new Map();
    }

    const allowedBuckets = new Set();
    SCHEDULE_SF_BUCKET_BY_PROJECT_KEY.forEach((bucket) => allowedBuckets.add(bucket));
    MODERNIZATION_SCHEDULE_BUCKET_BY_SPACE.forEach((bucket) => allowedBuckets.add(bucket));

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
      let scheduleUid = "";
      if (idx.facilityIdKey) {
        const fid = norm(getRoomScheduleFieldValue(r, idx.facilityIdKey));
        if (fid && uidByFacilityId.has(fid)) scheduleUid = uidByFacilityId.get(fid);
      }
      if (!scheduleUid && idx.campusKey) {
        const campusRaw = norm(getRoomScheduleFieldValue(r, idx.campusKey));
        if (/^co-1420-/i.test(campusRaw)) scheduleUid = normUid(campusRaw);
      }
      if (scheduleUid) {
        maps.byUid.set(scheduleUid, (maps.byUid.get(scheduleUid) || 0) + area);
      }
      if (idx.facilityKey) {
        const facilityRaw = norm(getRoomScheduleFieldValue(r, idx.facilityKey));
        const fk = normalizeFacilityName(facilityRaw);
        if (fk) maps.byFacility.set(fk, (maps.byFacility.get(fk) || 0) + area);
      }
    });

    (out || []).forEach((r) => {
      if (norm(r.SystemCategory) === "07_Asset Life Cycle") r.SystemCategory = "07_Safety & Security";
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
    const bucket = getModernizationScheduleBucket(row) || SCHEDULE_SF_BUCKET_BY_PROJECT_KEY.get(pk);
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
  function getModernizationFallbackPlanningSf(row) {
    const tier = parseModernizationTier(row?.AssetType);
    if (!tier) return null;
    if (!isModernizationSystemCategory(row?.SystemCategory)) return null;
    return MODERNIZATION_FALLBACK_PLANNING_SF_BY_SPACE.get(tier.space) ?? null;
  }

  function resolveProjectRowPlanningSf(row, uid, schoolName, decisionRow, projectListSchoolName) {
    const sf = getScheduleSfForMappedProjectRow(row, uid, schoolName, decisionRow, projectListSchoolName);
    if (sf != null && Number.isFinite(sf) && sf > 0) return sf;
    return getModernizationFallbackPlanningSf(row);
  }

  function hydrateScheduleSfIntoUnitValue(row, uid, schoolName, decisionRow, projectListSchoolName) {
    if (hasManualPlanningQtyOverrideStored(row)) return;
    const sf = resolveProjectRowPlanningSf(row, uid, schoolName, decisionRow, projectListSchoolName);
    if (sf != null && Number.isFinite(sf) && sf > 0) {
      row.UnitValue = formatLocaleInt(Math.round(sf));
    }
  }

  function applyRoomScheduleUnitValues(rows, uid, schoolName, decisionRow, projectListSchoolName) {
    if (!rows || !rows.length) return;
    rows.forEach((r) => {
      if (hasManualPlanningQtyOverrideStored(r)) return;
      const sum = resolveProjectRowPlanningSf(r, uid, schoolName, decisionRow, projectListSchoolName);
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
  function isLegacy07SafetySecurityProjectRow(r) {
    if (r?.__safetySecurityProject) return false;
    const sys = norm(r?.SystemCategory ?? r?.["SystemCategory"]).toLowerCase();
    // Old Camera / Door Phone / POE Switch lines under Educational Adequacy (07_*).
    // Replaced by 02.1_SafetyandSecurityProjects under Safety & Security projects.
    return sys.startsWith("07") || sys.includes("asset life cycle");
  }

  function isExcludedFromProjectSheetRow(r) {
    if (isLegacy07SafetySecurityProjectRow(r)) return true;
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
      const fid = norm(
        r["JeffCoFacilityID"] ??
          r.JeffCoFacilityID ??
          r["NEWJeffCoFacilityID"] ??
          r.NEWJeffCoFacilityID
      );
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

  /** Multipurpose modernization rows show "-" instead of "does not apply". */
  function doesNotApplyConditionDisplay(row) {
    return isMultipurposeRoomAsset(row) ? "-" : "does not apply";
  }

  /** @param {unknown} raw @param {object} [row] — when set, multipurpose + “does not apply” displays as "-" */
  function formatDisplayQuantityCell(raw, row) {
    const s = norm(raw);
    if (!s) {
      if (row && isAssetLifeCycle07Row(row)) return "None";
      return s;
    }
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

  function isAssetLifeCycle07Row(row) {
    if (!row) return false;
    // Legacy 07_* safety lines plus current 02.1 inventory (cameras, door phones, POE switches).
    return isSafetySecurityProjectsCategory(row.SystemCategory) || norm(row.SystemCategory).toLowerCase().startsWith("07");
  }

  /** @param {unknown} raw @param {object} [row] */
  function formatDisplayReplacementCell(raw, row) {
    const s = norm(raw);
    const is07 = isAssetLifeCycle07Row(row);
    if (!s) {
      if (is07) return "None";
      return s;
    }
    if (/not included/i.test(s)) return s;
    if (isReplacementCostPlaceholder(s)) return RC_PLACEHOLDER;
    if (/^none$/i.test(s)) return "None";
    const n = parseNumberMaybe(s);
    if (n !== null && Number.isFinite(n)) {
      if (n === 0 && is07) return "None";
      return formatLocaleUsdInteger(n);
    }
    return s;
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

    modernizationTiersBySpace = new Map();
    order.forEach((p) => {
      if (!isModernizationSystemCategory(p?.sys)) return;
      const tier = parseModernizationTier(p?.proj);
      if (!tier) return;
      if (!modernizationTiersBySpace.has(tier.space)) modernizationTiersBySpace.set(tier.space, []);
      modernizationTiersBySpace.get(tier.space).push({ level: tier.level, proj: p.proj, pk: p.pk });
    });
    modernizationTiersBySpace.forEach((entries) => entries.sort((a, b) => a.level - b.level));

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

  /**
   * Project-list AssetType → modernization space(s) in `UnitCostLibrary.csv`. One score per space
   * feeds every tier the library offers for it; the tier logic then picks which one applies.
   * Spaces with no entry here (auditorium, gym locker rooms, specialty CTE labs) have no score in the
   * project list yet, so they stay as unscored planning lines.
   */
  const MODERNIZATION_CSV_ASSET_SPACES = new Map(
    [
      ["Lightly modernize corridors", ["interiors"]],
      ["Modernize admin", ["admin"]],
      ["Modernize cafeteria", ["cafeteria"]],
      ["Modernize classrooms", ["classrooms"]],
      ["Modernize gym / assembly space", ["gym"]],
      ["Modernize kitchen", ["kitchen - es", "kitchen - ms", "kitchen - hs"]],
      ["Modernize multipurpose room", ["multipurpose room"]],
      ["Heavily modernize restrooms", ["group restrooms"]],
      ["Lightly modernize library/media center", ["library / media center"]],
      ["Lightly modernize entry lobby", ["main entry / vestibule"]],
      ["Heavily modernize STEM / CTE / specialized labs (MS/HS)", ["science labs (ms & hs)"]],
    ].map(([csvAsset, spaces]) => [normProjectKey(csvAsset), spaces])
  );

  /** Project-list "Security package" score fans out to Level 1/2/3 × ES/MS/HS library rows. */
  const SECURITY_PACKAGE_CSV_ASSET = "Security package";
  const SECURITY_PACKAGE_LEVEL_SUFFIXES = ["ES", "MS", "HS"];
  const SECURITY_PACKAGE_LIBRARY_PROJECTS = [1, 2, 3].flatMap((level) =>
    SECURITY_PACKAGE_LEVEL_SUFFIXES.map((suffix) => `Level ${level} - security package - ${suffix}`)
  );
  const SECURITY_PACKAGE_LIBRARY_PKS = new Set(
    SECURITY_PACKAGE_LIBRARY_PROJECTS.map((n) => normProjectKey(n))
  );

  /** CSV AssetType → one or more NK campus-upgrade library projects. */
  const CAMPUS_CSV_ASSET_EXPAND = new Map(
    [
      ["Add shade structure(s)", ["Small shade structure installation (12'x12')", "Large shade structure installation (16'x32')"]],
      [
        "Campus landscaping upgrade",
        [
          "Level 1 - campus landscaping upgrade - standard",
          "Level 2 - campus landscaping upgrade - climate resiliency",
        ],
      ],
      ["Playground replacement (ages 2-5)", ["Playground replacement (ECE grades)"]],
      [
        "Playground replacement (ages 5-12)",
        ["Playground replacement (K-2nd grades)", "Playground replacement (3rd-5th grades)"],
      ],
      [
        "Furniture upgrades",
        [
          "Classroom furniture upgrades - ES (per campus)",
          "Classroom furniture upgrades - MS (per campus)",
          "Classroom furniture upgrades - HS (per campus)",
        ],
      ],
    ].map(([csv, projs]) => [normProjectKey(csv), projs.map((p) => normProjectKey(p))])
  );

  function expandRowwiseAssetTypeIndexKeys(assetTypeRaw) {
    const pkOne = normProjectKey(norm(assetTypeRaw));
    if (!pkOne) return [];
    const spaces = MODERNIZATION_CSV_ASSET_SPACES.get(pkOne);
    if (spaces) {
      const out = [];
      spaces.forEach((space) => {
        (modernizationTiersBySpace.get(space) || []).forEach((entry) => {
          if (entry.pk) out.push(entry.pk);
        });
      });
      return out.length ? out : [pkOne];
    }
    if (pkOne === normProjectKey(SECURITY_PACKAGE_CSV_ASSET)) {
      return [...SECURITY_PACKAGE_LIBRARY_PKS];
    }
    const campusExpand = CAMPUS_CSV_ASSET_EXPAND.get(pkOne);
    if (campusExpand && campusExpand.length) return [...campusExpand];
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
        const scoreVal = match ? norm(match.ConditionScore ?? match["ConditionScore"]) : "";
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
          UnitValue: "",
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
        let sys = norm(match.SystemCategory ?? match["SystemCategory"]);
        if (sys === "07_Asset Life Cycle") sys = "07_Safety & Security";
        const scoreVal = norm(match.ConditionScore ?? match["ConditionScore"]);
        const source = norm(match.ConditionSource ?? match["ConditionSource"]);
        const csvPriority = norm(match.PriorityScore ?? match["PriorityScore"]);
        const csvReplacementCost = norm(match.ReplacementCost ?? match["ReplacementCost"]);
        const csvUnit = norm(match.Unit ?? match["Unit"]);
        const csvUnitCost = norm(match.UnitCost ?? match["UnitCost"]);
        const csvUnitValue = norm(
          match.UnitValue ?? match["UnitValue"] ?? match.Quantity ?? match["Quantity"]
        );
        const deficiencyDescription = norm(match["New RSMeans Deficiency Description"]);
        const deficiencyScope = norm(match["Deficiency (Scope Of Work)"]);
        const isFacilityDeficiencyLineItem =
          isFacilitiesDeficiencySystemCategory(sys) &&
          !!(deficiencyDescription || deficiencyScope || norm(match.ID));

        const validCsvPriority = (csvPriority === "1" || csvPriority === "2" || csvPriority === "3" || csvPriority === "4") ? csvPriority : "";

        out.push({
          UniqueID: uid,
          SchoolName: school,
          JeffCoFacilityID: norm(match.JeffCoFacilityID ?? match["JeffCoFacilityID"]),
          SystemCategory: sys || "(Uncategorized)",
          AssetType: project,
          ConditionScore: scoreVal,
          ConditionSource: source,
          Unit: csvUnit,
          UnitCost: csvUnitCost,
          UnitValue: csvUnitValue,
          ReplacementCost: csvReplacementCost ? formatCsvCost(csvReplacementCost) : "",
          __libraryScore: "",
          __pivotConditionScore: scoreVal,
          __csvPriority: validCsvPriority,
          __rowId: rowId++,
          __safetySecurityProject: !!match.__safetySecurityProject,
          __facilityDeficiencyLineItem: isFacilityDeficiencyLineItem,
          __masterDetailLabel: deficiencyDescription || deficiencyScope || project,
          __masterScope: deficiencyScope,
          __masterBuilding: norm(match.Building),
          __masterLocation: norm(match.Location ?? match.SchoolName),
          __masterDeficiencyId: norm(match.ID),
        });
      });
    }

    (out || []).forEach((r) => {
      if (norm(r.SystemCategory) === "07_Asset Life Cycle") r.SystemCategory = "07_Safety & Security";
    });

    return out;
  }

  function buildDecisionIndexes(rows) {
    decisionByUid = new Map();
    decisionByNameKey = new Map();
    uidByFacilityId = new Map();
    (rows || []).forEach((r) => {
      const uid = normUid(r["UniqueID"] ?? r.UniqueID);
      const name = norm(r["Building Name"] ?? r.BuildingName ?? r["BuildingName"]);
      const fid = norm(r.JeffCoFacilityID ?? r["JeffCoFacilityID"]);
      if (uid) decisionByUid.set(uid, r);
      if (fid && uid) uidByFacilityId.set(fid, uid);
      const nk = normName(name);
      if (nk && !decisionByNameKey.has(nk)) decisionByNameKey.set(nk, r);
    });
  }

  function buildSchoolProjectRowsForSelection(uid, name) {
    const resolvedUniqueId = uid ? normUid(uid) : "";
    const resolvedSchoolName = norm(name);
    const decision = resolvedUniqueId
      ? decisionByUid.get(resolvedUniqueId)
      : decisionByNameKey.get(normName(resolvedSchoolName));
    const meta = evaluateSchoolDecisionMeta(decision, getActiveThresholds());
    const resolvedDecisionOutcome = meta.decision || "";
    const keepBlackOutcomes = [
      "Major Capital Investment",
      "Welcoming School with Capital Investment",
      "Building Addition with Capital Investment",
    ];
    const outcomeTrim = (resolvedDecisionOutcome || "").trim();
    // Former gut-reno outcomes (Major Cap / Welcoming Cap) cost via full-building New construction by level.
    // Building Addition stays in keepBlackOutcomes for scope gating, but uses the planner helper (not full-building NC).
    const needsGutReno = keepBlackOutcomes.includes(outcomeTrim);
    const needsNewConstruction =
      ["Major Capital Investment", "Welcoming School with Capital Investment"].includes(outcomeTrim) ||
      ["Building Replacement", "Welcoming School with Building Replacement"].includes(outcomeTrim) ||
      outcomeTrim.toLowerCase().includes("demolition");

    const rawSchoolRows = getRowwiseRowsForSelection(resolvedUniqueId, resolvedSchoolName);
    const profileProjectSchoolName = norm(rawSchoolRows[0]?.SchoolName ?? "");
    let rows = buildRowsFromRowwise(rawSchoolRows);
    applyRoomScheduleUnitValues(rows, resolvedUniqueId, resolvedSchoolName, decision, profileProjectSchoolName);
    hydrateAdaComplianceUnitValue(rows, decision);
    hydrateManualQtyOverrides(rows);
    hydratePlaygroundDefaultPlanningSf(rows);

    (rows || []).forEach((r) => {
      const systemCategory = norm(r?.SystemCategory);

      if (systemCategory === "01_new construction" && !isRelevantNewConstructionRow(r, decision)) {
        r.__hiddenBySchoolLevel = true;
        return;
      }
      if (!isRelevantPlaygroundRow(r, decision)) {
        r.__hiddenBySchoolLevel = true;
        return;
      }
      if (!isRelevantFurnitureUpgradeRow(r, decision)) {
        r.__hiddenBySchoolLevel = true;
        return;
      }
      if (!isRelevantCampusTurfRow(r, decision)) {
        r.__hiddenBySchoolLevel = true;
        return;
      }
      if (!isRelevantModernizationRow(r, decision)) {
        r.__hiddenBySchoolLevel = true;
        return;
      }
      if (!isRelevantSecurityPackageRow(r, decision)) {
        r.__hiddenBySchoolLevel = true;
        return;
      }

      if (systemCategory === "01_new construction" && !needsNewConstruction && isFullBuildingNewConstructionAsset(r.AssetType)) {
        r.__excludedFromTotals = true;
        r.__excludedReason = "decision";
        r.UnitValue = "";
        r.ReplacementCost = "Not included";
        return;
      }

      const isAlcForGutNc = isAssetLifeCycleCategoryForGutNcGate(systemCategory);
      if ((needsGutReno || needsNewConstruction) && !isInDecisionGutOrNcProjectScope(systemCategory)) {
        if (!(isAlcForGutNc && getIncludeFciForMajor())) {
          r.__excludedFromTotals = true;
          r.__excludedReason = "decision";
        }
      }

      const lib = unitCostIndex ? unitCostIndex.get(makeUnitCostKey(r.SystemCategory, r.AssetType)) : null;
      let computed = deriveNewConstructionConditionScore(r, needsNewConstruction);
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
        if (strictMetricUnresolvedBypass(r)) {
          r.ConditionScore = "Poor";
          r.__libraryScore = "Poor";
        } else {
          if (!r.__excludedFromTotals) {
            r.__excludedFromTotals = true;
            r.__excludedReason = "unresolved";
          }
          if (!isModernizationSystemCategory(systemCategory)) {
            r.UnitValue = "";
          }
          r.ReplacementCost = "";
          return;
        }
      }

      const s = norm(r?.ConditionScore || r?.__libraryScore).toLowerCase();
      const excludedByScore = s === "good";
      r.__excludedFromTotals = excludedByScore ? true : false;
      r.__excludedReason = excludedByScore ? "good" : "";

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
    clearQuantitiesAndCostsForGoodCondition(
      rows,
      resolvedUniqueId,
      resolvedSchoolName,
      decision,
      profileProjectSchoolName
    );
    suppressUnselectedModernizationTiers(rows);
    suppressLowerSecurityPackageLevelsWhenHigherIncluded(rows);
    applySiteSpecificReplacementCostLabels(rows);
    applyManualQtySiteSpecificLabels(rows);
    applyFurnitureUpgradesLumpSumReplacementCosts(rows, decision);

    rows = (rows || []).filter((r) => !r.__hiddenBySchoolLevel);
    snapshotNaturalRowIncludeState(rows);
    pruneRowIncludeToggleOverridesAgainstDefaults(rows);
    applyRowIncludeToggleOverrides(rows);

    const catalogUid = resolvedUniqueId || (resolvedSchoolName ? "name:" + resolvedSchoolName : "");
    const displayName = norm(decision?.["Building Name"] ?? resolvedSchoolName) || resolvedSchoolName || "—";

    return {
      uid: catalogUid,
      name: displayName,
      decision,
      decisionOutcome: resolvedDecisionOutcome,
      flow: meta.flow,
      strategyGroup: getStrategyGroupForDecisionLocal(resolvedDecisionOutcome, meta.flow),
      rows,
    };
  }

  function renderSchoolMetaStripForSchool(uid, name, decisionOutcomeOverride) {
    if (!elSchoolMeta) return;
    const normalizedUid = uid ? normUid(uid) : "";
    const decision = normalizedUid
      ? decisionByUid.get(normalizedUid)
      : decisionByNameKey.get(normName(norm(name)));
    const sqfRaw = norm(
      decision?.[" SquareFt "] ??
        decision?.SquareFt ??
        decision?.["SquareFt"] ??
        decision?.["Square Ft"] ??
        decision?.["Sq Ft"] ??
        decision?.["SqFt"]
    );
    const sqfNum = sqfRaw ? Number(sqfRaw.replace(/,/g, "")) : NaN;
    const outcome =
      decisionOutcomeOverride !== undefined
        ? decisionOutcomeOverride
        : decision
        ? evaluateSchoolDecision(decision, getActiveThresholds())
        : "";
    elSchoolMeta.innerHTML = buildSchoolDetailsMetaHtml(decision || null, {
      resolvedFacilityId: normalizedUid ? facilityIdByUid.get(normalizedUid) : "",
      resolvedUniqueId: normalizedUid,
      status: norm(decision?.Status),
      level: norm(decision?.["School Level"]),
      sqfDisplay: Number.isFinite(sqfNum) ? sqfNum.toLocaleString(DISPLAY_NUMBER_LOCALE) : sqfRaw,
      resolvedDecisionOutcome: outcome,
    });
  }

  /** Keeps the summary strip in sync with the facility picker in every view mode. */
  function refreshSchoolMetaStripForSelection() {
    if (!elSchoolMeta) return;
    const count = selectedSchoolUids ? selectedSchoolUids.size : 0;
    if (!count) {
      if (elSchoolNameHeader) elSchoolNameHeader.textContent = "—";
      elSchoolMeta.textContent = "Select one or more schools above to view summary and projects.";
      return;
    }
    if (count === 1) {
      const uid = Array.from(selectedSchoolUids)[0];
      if (uid.startsWith("name:")) renderSchoolMetaStripForSchool("", uid.slice(5));
      else renderSchoolMetaStripForSchool(uid, norm(decisionByUid.get(uid)?.["Building Name"]) || "");
      return;
    }
    elSchoolMeta.textContent = `${count} facilities selected`;
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
    elSchoolNameHeader.textContent = displaySchoolName(buildingName);

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
      ["Major Capital Investment", "Welcoming School with Capital Investment"].includes(outcomeTrim) ||
      ["Building Replacement", "Welcoming School with Building Replacement"].includes(outcomeTrim) ||
      outcomeTrim.toLowerCase().includes("demolition");

    if (elTotalReplacementCost) {
      elTotalReplacementCost.textContent = "—";
    }

    // Building addition planning helper — rendered under 01_new construction group
    additionPlanningState.show = false;
    additionPlanningState.studentsOver = null;
    additionPlanningState.gsfTarget = null;
    additionPlanningState.selectedKey = null;
    additionPlanningState.stories = 2;
    saveAdditionStoriesForSchool(resolvedUniqueId, 2);
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

    renderSchoolMetaStripForSchool(resolvedUniqueId, resolvedSchoolName, resolvedDecisionOutcome);

    const built = buildSchoolProjectRowsForSelection(resolvedUniqueId, resolvedSchoolName);
    schoolRows = built.rows;

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

  function tableLabelColumnSpan() {
    return DISPLAY_COLS.length - 1;
  }

  function prioritySubtotalTitle(byP) {
    return [
      "P1: " + formatLocaleUsdInteger(byP["1"]),
      "P2: " + formatLocaleUsdInteger(byP["2"]),
      "P3: " + formatLocaleUsdInteger(byP["3"]),
      "P4: " + formatLocaleUsdInteger(byP["4"]),
    ].join("\n");
  }

  function createBannerToggleCell() {
    const td = document.createElement("td");
    td.className = "col-include-toggle banner-toggle-spacer";
    return td;
  }

  function createBannerLabelCell(labelText, { trailingEl } = {}) {
    const td = document.createElement("td");
    td.colSpan = tableLabelColumnSpan();
    td.className = "banner-label-cell";
    const labelDiv = document.createElement("div");
    labelDiv.className = "group-label";
    const arrow = document.createElement("span");
    arrow.className = "group-arrow";
    arrow.textContent = "▼";
    labelDiv.appendChild(arrow);
    labelDiv.appendChild(document.createTextNode(labelText));
    td.appendChild(labelDiv);
    if (trailingEl) td.appendChild(trailingEl);
    return td;
  }

  function createBannerSubtotalCell(total, byP, { trailingEl } = {}) {
    const td = document.createElement("td");
    td.className = "banner-subtotal-cell";
    const wrap = document.createElement("div");
    wrap.className = "banner-subtotal-wrap";
    if (total) {
      const sub = document.createElement("span");
      sub.className = "group-subtotal";
      sub.textContent = formatLocaleUsdInteger(total);
      sub.title = prioritySubtotalTitle(byP);
      wrap.appendChild(sub);
    }
    if (trailingEl) wrap.appendChild(trailingEl);
    td.appendChild(wrap);
    return td;
  }

  function superGroupRowClassName(sgKey, collapsed) {
    let cls = "super-group-row" + (collapsed ? " collapsed" : "");
    if (sgKey === SELECTED_PROJECTS_SUPER_LABEL) cls += " selected-projects";
    if (sgKey === PROJECT_CALC_SUPER_LABEL) cls += " project-calculator";
    if (
      sgKey === EDUCATIONAL_ADEQUACY_SUPER_LABEL ||
      sgKey === FACILITY_DEFICIENCY_SUPER_LABEL
    ) {
      cls += " educational-adequacy";
    }
    if (EMPTY_TEMPLATE_SUPER_LABELS.has(sgKey)) cls += " facility-survey empty-template";
    return cls;
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
   * - 05_Modernization: the score picks one tier per space (below 0.65 / 0.5 / 0.35); only that tier is Poor and defaults on.
   * - Elsewhere: on when project-list condition input exists and row is in capital need; or when the row already has a positive replacement $ (e.g. 07_* pivot) and is not naturally score-excluded. 00_general / 01 / 02 / 08_* follow exclusion flags only.
   */
  const ROW_INCLUDE_ALWAYS_OFF_ASSET_KEYS = new Set(
    [
      "Campus landscaping upgrade",
      "Level 1 - campus landscaping upgrade - standard",
      "Level 2 - campus landscaping upgrade - climate resiliency",
      "Expand parking",
      "Parking lot expansion",
      "Improve drop-off / pick-up zone",
    ].map((n) => normProjectKey(n))
  );

  const ROW_INCLUDE_DEFAULT_OFF_ASSET_KEYS = new Set(
    ["Resurface asphalt", "Resurface concrete"].map((n) => normProjectKey(n))
  );

  const FURNITURE_UPGRADES_ASSET_PKS = new Set(
    [
      "Furniture upgrades",
      "Classroom furniture upgrades - ES (per campus)",
      "Classroom furniture upgrades - MS (per campus)",
      "Classroom furniture upgrades - HS (per campus)",
    ].map((n) => normProjectKey(n))
  );
  /** Lump-sum planning replacement cost for campus furniture (by school level) — matches NK per-campus rates. */
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

  function getFurnitureCampusLibraryProjectForDecision(decision) {
    const levelKey = getEffectiveSchoolLevelKey(decision);
    if (levelKey === "elementary" || levelKey === "k8") return "Classroom furniture upgrades - ES (per campus)";
    if (levelKey === "middle") return "Classroom furniture upgrades - MS (per campus)";
    if (levelKey === "high" || levelKey === "k12") return "Classroom furniture upgrades - HS (per campus)";
    return null;
  }

  function isRelevantFurnitureUpgradeRow(row, decision) {
    const pk = manualPlanningAssetKey(row);
    if (!FURNITURE_UPGRADES_ASSET_PKS.has(pk) && !/classroom furniture upgrades/i.test(norm(row?.AssetType))) {
      return true;
    }
    // Only campus lump-sum lines are shown; per-classroom rates stay in the library for reference.
    if (/per classroom/i.test(norm(row?.AssetType))) return false;
    const wanted = getFurnitureCampusLibraryProjectForDecision(decision);
    if (!wanted) return true;
    return pk === normProjectKey(wanted) || pk === normProjectKey("Furniture upgrades");
  }

  /** After unit-cost × qty, replace Furniture upgrades with level-based lump sum when in capital need (not Good). */
  function applyFurnitureUpgradesLumpSumReplacementCosts(rows, decisionRow) {
    const budget = getFurnitureUpgradesPlanningBudgetUsd(decisionRow);
    if (budget === null || !Number.isFinite(budget)) return;
    (rows || []).forEach((r) => {
      if (norm(r?.SystemCategory) !== "04_campus upgrade") return;
      if (!FURNITURE_UPGRADES_ASSET_PKS.has(manualPlanningAssetKey(r))) return;
      if (norm(r?.ConditionScore || r?.__libraryScore).toLowerCase() === "good") return;
      if (r.__excludedReason === "modernization_tier") return;
      if (/not included/i.test(norm(r?.ReplacementCost))) return;
      r.ReplacementCost = formatLocaleUsdInteger(Math.round(budget));
    });
  }
  const FRONT_SCHOOL_BRANDING_ASSET_PK = normProjectKey("Front of school branding, landscape upgrades");

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

  /** CSV / computed replacement $ (not "-" placeholder or "Site specific"). */
  function rowHasMeaningfulReplacementCostForIncludeDefault(r) {
    if (!r) return false;
    if (isReplacementCostPlaceholder(r.ReplacementCost)) return false;
    const n = parseNumberMaybe(r?.ReplacementCost);
    return n !== null && Number.isFinite(n) && n > 0;
  }

  function rowIncludeToggleDefaultOn(r) {
    if (!r) return false;
    const pk = manualPlanningAssetKey(r);
    if (ROW_INCLUDE_ALWAYS_OFF_ASSET_KEYS.has(pk)) return false;

    const sys = norm(r?.SystemCategory);
    if (sys === "04_campus upgrade") {
      if (pk === FRONT_SCHOOL_BRANDING_ASSET_PK) return false;
      if (FURNITURE_UPGRADES_ASSET_PKS.has(pk)) {
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
      !r.__naturalExcludedFromTotals &&
      rowHasMeaningfulReplacementCostForIncludeDefault(r)
    ) {
      return true;
    }

    if (sys === "00_general" || sys === "01_new construction" || sys.startsWith("08")) {
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

    suppressUnselectedModernizationTiers(rows);
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

  /** Walk leaf project rows (including FCI rollup children). */
  function forEachLeafProjectRow(callback) {
    if (!schoolRows || !schoolRows.length) return;
    schoolRows.forEach((row) => {
      if (row.__isRollup && row.__rollupRows && row.__rollupRows.length) {
        row.__rollupRows.forEach(callback);
      } else {
        callback(row);
      }
    });
  }

  /** True when every visible leaf row with a positive replacement cost is included in totals. */
  function computeAllPositiveReplacementCostRowsIncluded() {
    if (!schoolRows || !schoolRows.length) return false;
    let anyPositive = false;
    let allIncluded = true;
    forEachLeafProjectRow((r) => {
      if (!r || r.__hiddenBySchoolLevel) return;
      const rc = parseNumberMaybe(r.ReplacementCost);
      if (rc === null || !Number.isFinite(rc) || rc <= 0) return;
      anyPositive = true;
      if (!rowIncludeToggleEffectiveDesired(r)) allIncluded = false;
    });
    return anyPositive && allIncluded;
  }

  function syncTurnOnAllRowsWithValuesToggle() {
    const el = document.getElementById("turnOnAllRowsWithValuesToggle");
    if (!el) return;
    el.checked = computeAllPositiveReplacementCostRowsIncluded();
  }

  /**
   * Inverse of bulk turn-on: drop include overrides for default-off rows that have a $ replacement cost
   * (reverts the bulk action without changing defaults that are already on).
   */
  function turnOffAllRowsWithValuesBulkReset() {
    if (!schoolRows || !schoolRows.length) return;
    let changed = false;
    function visitLeafRow(r) {
      if (!r || r.__hiddenBySchoolLevel) return;
      const rc = parseNumberMaybe(r.ReplacementCost);
      if (rc === null || !Number.isFinite(rc) || rc <= 0) return;
      if (rowIncludeToggleDefaultOn(r)) return;
      const key = getRowKey(r);
      const leg = key ? getRowKeyLegacy(r) : "";
      if (key && Object.prototype.hasOwnProperty.call(rowIncludeToggleOverrides, key)) {
        delete rowIncludeToggleOverrides[key];
        changed = true;
      }
      if (leg && leg !== key && Object.prototype.hasOwnProperty.call(rowIncludeToggleOverrides, leg)) {
        delete rowIncludeToggleOverrides[leg];
        changed = true;
      }
    }
    schoolRows.forEach((r) => {
      if (r.__isRollup && r.__rollupRows && r.__rollupRows.length) {
        r.__rollupRows.forEach(visitLeafRow);
      } else {
        visitLeafRow(r);
      }
    });
    if (!changed) {
      syncTurnOnAllRowsWithValuesToggle();
      return;
    }
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
    if (row?.__masterDeficiencyDetail) {
      if (col === "Priority") return getPriorityForRow(row);
      if (col === "Project Type") return displayProjectTypeLabel(row);
      if (col === "ConditionScore") return norm(row.__masterBuilding || row.ConditionScore) || "";
      if (col === "UnitValue") return norm(row.UnitValue) || "";
      if (col === "ReplacementCost") return norm(row.ReplacementCost) || "";
      if (col === "UnitCost") return "";
      return "";
    }
    if (col === "Priority") return getPriorityForRow(row);
    if (col === "Project Type") return row ? displayProjectTypeLabel(row) : "";
    if (col === "SystemCategory" && row) return displaySystemCategoryLabel(row.SystemCategory);
    if (col === "ConditionScore") return row ? formatConditionScoreDisplay(row) : "";
    if (col === "UnitValue" && row) return formatDisplayQuantityCell(row[col], row);
    if (col === "ReplacementCost" && row) return formatDisplayReplacementCell(row[col], row);
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
   * Rows that still show $ but are excluded from totals do not qualify.
   * For 08_Facilities Deficiency*, CSV ReplacementCost drives visibility (Unit Value is often blank).
   * For 07_Safety & Security*, empty or zero replacement $ counts as no cost (display "None").
   */
  function rowHasReplacementCostInformation(r) {
    if (!r) return false;
    if (r.__excludedFromTotals) return false;
    if (isFacilitiesDeficiencySystemCategory(r.SystemCategory)) {
      const rcStr = norm(String(r.ReplacementCost ?? ""));
      if (!rcStr || /^none$/i.test(rcStr)) return false;
      if (/not included/i.test(rcStr)) return false;
      if (isReplacementCostPlaceholder(r.ReplacementCost)) return false;
      const n = parseNumberMaybe(r.ReplacementCost);
      return n !== null && Number.isFinite(n) && n > 0;
    }
    if (isAssetLifeCycle07Row(r)) {
      const rcStr = norm(String(r.ReplacementCost ?? ""));
      if (!rcStr || /^none$/i.test(rcStr)) return false;
      const rcNum = parseNumberMaybe(r.ReplacementCost);
      if (rcNum === null || !Number.isFinite(rcNum) || rcNum <= 0) return false;
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

  /** Row has a usable planning quantity (Unit Value column — not blank, None, or zero). */
  function rowHasPlanningUnitValue(r) {
    if (!r) return false;
    const raw = getRawUnitValue(r);
    const s = norm(String(raw ?? "")).toLowerCase();
    if (!s || s === "none" || s === "n/a" || s === "—" || s === "-") return false;
    const q = getUnitValueNumber(r);
    return q !== null && Number.isFinite(q) && q > 0;
  }

  /** Visible planning row: positive Replacement Cost included in totals; calculator rows also need Unit Value. */
  function rowHasPlanningValues(r) {
    if (!r) return false;
    if (!rowHasReplacementCostInformation(r)) return false;
    // Facilities deficiency (08) and Safety & Security (07): CSV replacement $ is the value; Unit Value is often blank.
    if (isFacilitiesDeficiencySystemCategory(r?.SystemCategory) || isAssetLifeCycle07Row(r)) {
      return true;
    }
    return rowHasPlanningUnitValue(r);
  }

  function rowPassesValueFilter(r) {
    if (!r) return false;
    // On: show every project row for the school (including Good / Not included / blank $).
    if (getShowRowsWithoutReplacementCost()) return true;
    return rowHasPlanningValues(r);
  }

  /**
   * For strict metric categories, unresolved pivot still allows costing when quantity exists:
   * manual campus planning rows, or heavy/light modernization with SF from room schedule.
   */
  function strictMetricUnresolvedBypass(row) {
    if (hasManualPlanningQtyOverrideStored(row)) return true;
    if (isManualQtyPlanningAssetRow(row)) return true;
    const sys = norm(row?.SystemCategory);
    if (!isModernizationSystemCategory(sys)) return false;
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

  function isDoesNotApplyPhrase(s) {
    return s && /does not apply/i.test(norm(s));
  }

  /** Deficiency / replacement cost still uses metrics internally; list UI omits the score column for facilities deficiency. */
  function isSiteInfrastructureSystemCategory(systemCategory) {
    return isFacilitiesDeficiencySystemCategory(systemCategory);
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
    if (isDoesNotApplyPhrase(row?.__pivotConditionScore)) return doesNotApplyConditionDisplay(row);
    if (isDoesNotApplyPhrase(row?.ConditionSource)) return doesNotApplyConditionDisplay(row);
    if (isDoesNotApplyPhrase(row?.Unit)) return doesNotApplyConditionDisplay(row);
    const internalPoor =
      norm(row?.ConditionScore || row?.__libraryScore || "").toLowerCase() === "poor";
    if (isManualQtyPlanningAssetRow(row) && internalPoor) return "—";
    const lib = unitCostIndex ? unitCostIndex.get(makeUnitCostKey(row.SystemCategory, row.AssetType)) : null;
    const n = getConditionMetricNumberForDisplay(row, lib);
    if (n !== null && Number.isFinite(n)) return formatLocaleDecimal(n, 2, 2);
    return "—";
  }

  /** 0–1 gradient scale + cutoff lines; structure/FCI (non–facilities-deficiency 08_*) uses binary bar. */
  function getConditionScaleConfig(row) {
    if (isCampusYesNoReferenceAssetRow(row)) return { mode: "none", cutoff: null };
    const sysRaw = norm(row?.SystemCategory);
    const sys = sysRaw.toLowerCase();
    if (sys === "04_campus upgrade") return { mode: "continuous", cutoff: 0.5 };
    // Each modernization tier is its own library row; the bar cutoff is that tier's "need below" Value.
    if (isModernizationSystemCategory(sysRaw)) {
      const lib = unitCostIndex ? unitCostIndex.get(makeUnitCostKey(row.SystemCategory, row.AssetType)) : null;
      const th = lib ? parseLibraryValueThreshold(norm(row?.Unit) || norm(lib?.unit), lib?.value) : null;
      if (th !== null && Number.isFinite(th)) {
        return { mode: "continuous", cutoff: th };
      }
      return { mode: "continuous", cutoff: 0.5 };
    }
    if (isSecurityPackageSystemCategory(sysRaw)) {
      const lib = unitCostIndex ? unitCostIndex.get(makeUnitCostKey(row.SystemCategory, row.AssetType)) : null;
      const th = lib ? parseLibraryValueThreshold(norm(row?.Unit) || norm(lib?.unit), lib?.value) : null;
      return { mode: "continuous", cutoff: th !== null && Number.isFinite(th) ? th : 0.5 };
    }
    if (isFacilitiesDeficiencySystemCategory(sys)) {
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
    // For 08_* (FCI) only, fall back to computed UnitValue when the condition metric is absent.
    // For other categories (e.g. 04_campus upgrade), UnitValue is for costing only; without a numeric
    // condition input, the score is unresolved (null).
    //
    // If (metric) > Value => return UnitCostLibrary.Score (if present)
    // Else => return the opposite.
    //
    // If the library has NO Score column (or it's blank), default mapping is:
    // above threshold = Good, below threshold = Poor
    const libScore = norm(lib?.score);
    const sys = norm(row?.SystemCategory);
    const sysLo = sys.toLowerCase();
    const lowerIsBetter = sysLo === "08_facilities deficiency" || sysLo === "08_site infrastructure";
    // For these strategy buckets, higher score means more need (worse),
    // so "above threshold" should map to Poor (included in totals).
    const higherIsWorse = sys === "01_new construction";
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

    // Security package: score selects which tier is needed (below 0.65 / 0.5 / 0.35).
    // At or above 0.65 no package is needed, so the row is Good and carries no cost.
    if (isSecurityPackageLibraryRow(row) && m !== null) {
      return getSecurityPackageTierForRow(row) > 0 ? "Poor" : "Good";
    }

    // Modernization uses the same tiered cutoffs; only the score-selected tier carries a cost.
    if (isModernizationLibraryRow(row) && m !== null) {
      return isSelectedModernizationTierRow(row) ? "Poor" : "Good";
    }

    if (threshold === null || m === null) {
      if (libScore === "Good" || libScore === "Poor") return libScore;
      const pivotLegacy = norm(row?.__pivotConditionScore);
      if (/^good$/i.test(pivotLegacy)) return "Good";
      if (/^poor$/i.test(pivotLegacy)) return "Poor";
      return null;
    }
    // When Score column is missing, default interpretation differs:
    // - Most projects: higher score/value = better  => above threshold = Good
    // - 08_Facilities Deficiency (ex–site infrastructure): lower score/value = better => above threshold = Poor
    // - 01_new construction: higher score/value = worse => above threshold = Poor
    const defaultAbove = (lowerIsBetter || higherIsWorse) ? "Poor" : "Good";
    const above = libScore || defaultAbove;
    const below = invertGoodPoor(above) || ((lowerIsBetter || higherIsWorse) ? "Good" : "Poor");
    if (m > threshold) return above;
    return below;
  }

  /**
   * 01_new construction full-building lines: condition follows capital strategy
   * (Major Cap / replacement / demolition → Poor). Standalone addition lines are unscored here.
   */
  function deriveNewConstructionConditionScore(row, needsNewConstruction) {
    if (norm(row?.SystemCategory) !== "01_new construction") return null;
    if (!isFullBuildingNewConstructionAsset(row?.AssetType)) return null;
    if (!needsNewConstruction) return null;
    return "Poor";
  }

  /** No $ totals unless Good/Poor can be resolved from CSV/library metric rules (see computeConditionScoreFromValue). */
  function needsStrictConditionMetricForCosting(systemCategory) {
    const sys = norm(systemCategory);
    return (
      sys === "00_general" ||
      sys === "01_new construction" ||
      sys === "04_campus upgrade" ||
      isModernizationSystemCategory(systemCategory) ||
      isSecurityPackageSystemCategory(systemCategory)
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

  function getSecurityPackageLevelSuffixForDecision(decision) {
    const levelKey = getEffectiveSchoolLevelKey(decision);
    if (levelKey === "elementary" || levelKey === "k8") return "ES";
    if (levelKey === "middle") return "MS";
    if (levelKey === "high" || levelKey === "k12") return "HS";
    return null;
  }

  function parseSecurityPackageLevelNumber(assetType) {
    const m = norm(assetType).match(/^level\s*([123])\s*-\s*security package/i);
    return m ? Number(m[1]) : null;
  }

  /**
   * Library Value columns are "need below" cutoffs: below 0.65 → Level 1, below 0.5 → Level 2,
   * below 0.35 → Level 3. At or above 0.65 (or blank / #N/A) no package is needed (no cost).
   */
  function getSecurityPackageTierForRow(row) {
    const raw = getConditionMetricRaw(row);
    if (!raw || /^#?n\/?a$/i.test(norm(raw))) return 0;
    const metric = parseNumberMaybe(raw);
    if (metric === null || !Number.isFinite(metric)) return 0;
    if (metric >= 0.65) return 0;
    if (metric >= 0.5) return 1;
    if (metric >= 0.35) return 2;
    return 3;
  }

  function isSecurityPackageSystemCategory(systemCategory) {
    const s = norm(systemCategory).toLowerCase();
    // Legacy category only — NK places packages under 04_campus upgrade (detect via AssetType).
    return s.startsWith("06") && s.includes("security");
  }

  function isSecurityPackageLibraryRow(row) {
    if (!row) return false;
    return SECURITY_PACKAGE_LIBRARY_PKS.has(normProjectKey(norm(row.AssetType)));
  }

  /**
   * Keep only the score-selected tier and ES/MS/HS variant (K-8→ES, K-12→HS).
   * When no package is needed, keep the Level 1 row so the score still shows (scored Good, no cost).
   */
  function isRelevantSecurityPackageRow(row, decision) {
    if (!isSecurityPackageLibraryRow(row)) return true;
    const wanted = getSecurityPackageLevelSuffixForDecision(decision);
    const wantedTier = getSecurityPackageTierForRow(row);
    if (!wanted || wantedTier === null) return true;
    const asset = norm(row?.AssetType);
    const suffix = asset.slice(asset.lastIndexOf("-") + 1).trim().toUpperCase();
    if (suffix !== wanted) return false;
    return parseSecurityPackageLevelNumber(asset) === (wantedTier || 1);
  }

  /**
   * Levels are nested packages (L2 includes L1, L3 includes L2). Default-include only the
   * highest Poor tier so costs are not stacked.
   */
  function suppressLowerSecurityPackageLevelsWhenHigherIncluded(rows) {
    const visible = (rows || []).filter((r) => !r.__hiddenBySchoolLevel && isSecurityPackageLibraryRow(r));
    if (visible.length < 2) return;
    let selected = null;
    let selectedLevel = 0;
    visible.forEach((r) => {
      if (r.__excludedFromTotals) return;
      if (norm(r?.ConditionScore || r?.__libraryScore).toLowerCase() !== "poor") return;
      const level = parseSecurityPackageLevelNumber(r.AssetType) || 0;
      if (level >= selectedLevel) {
        selected = r;
        selectedLevel = level;
      }
    });
    if (!selected) return;
    visible.forEach((r) => {
      if (r === selected) return;
      if (r.__excludedFromTotals && r.__excludedReason === "good") return;
      r.__excludedFromTotals = true;
      if (!r.__excludedReason) r.__excludedReason = "security_package_tier";
      r.UnitValue = "";
      const rc = norm(r?.ReplacementCost);
      if (rc && !/not included/i.test(rc)) r.ReplacementCost = "";
    });
  }

  /**
   * Modernization Value columns are "need below" cutoffs shared with the security package:
   * below 0.65 → Level 1, below 0.5 → Level 2, below 0.35 → Level 3. At or above 0.65 nothing is needed.
   */
  function getModernizationNeededLevel(metric) {
    if (metric === null || !Number.isFinite(metric)) return null;
    if (metric >= 0.65) return 0;
    if (metric >= 0.5) return 1;
    if (metric >= 0.35) return 2;
    return 3;
  }

  function isModernizationLibraryRow(row) {
    if (!row) return false;
    if (!isModernizationSystemCategory(row.SystemCategory)) return false;
    return !!parseModernizationTier(row.AssetType);
  }

  /**
   * Deepest tier the library actually offers for this space that the score calls for — corridors only
   * exist at Level 1, so a corridors score of 0.2 still resolves to Level 1 rather than nothing.
   * Returns 0 when the space needs no work, null when the score is missing.
   */
  function getSelectedModernizationLevelForRow(row) {
    const tier = parseModernizationTier(row?.AssetType);
    if (!tier) return null;
    const needed = getModernizationNeededLevel(parseNumberMaybe(getConditionMetricRaw(row)));
    if (needed === null) return null;
    const available = modernizationTiersBySpace.get(tier.space) || [];
    if (!available.length) return null;
    let best = 0;
    available.forEach((entry) => {
      if (entry.level <= needed && entry.level > best) best = entry.level;
    });
    return best;
  }

  function isSelectedModernizationTierRow(row) {
    const tier = parseModernizationTier(row?.AssetType);
    if (!tier) return false;
    const selected = getSelectedModernizationLevelForRow(row);
    return selected !== null && selected > 0 && selected === tier.level;
  }

  /** Spaces the library splits by school level; K-8 follows ES and K-12 follows HS. */
  function modernizationSpaceMatchesSchoolLevel(space, decision) {
    const levelKey = getEffectiveSchoolLevelKey(decision);
    if (!levelKey) return true;
    const isES = levelKey === "elementary" || levelKey === "k8";
    const isMS = levelKey === "middle";
    const isHS = levelKey === "high" || levelKey === "k12";
    if (space.startsWith("kitchen - ")) {
      const suffix = space.slice("kitchen - ".length).trim();
      if (suffix === "es") return isES;
      if (suffix === "ms") return isMS;
      if (suffix === "hs") return isHS;
      return true;
    }
    if (space.includes("science labs")) return !isES;
    if (space.includes("cte")) return isHS;
    return true;
  }

  /**
   * Keep the level-appropriate variant and only the score-selected tier. A space that needs no work —
   * or has no score yet — falls back to its entry tier so one line per space still shows.
   */
  function isRelevantModernizationRow(row, decision) {
    const tier = parseModernizationTier(row?.AssetType);
    if (!tier || !isModernizationSystemCategory(row?.SystemCategory)) return true;
    if (!modernizationSpaceMatchesSchoolLevel(tier.space, decision)) return false;
    const selected = getSelectedModernizationLevelForRow(row);
    if (selected !== null && selected > 0) return selected === tier.level;
    const available = modernizationTiersBySpace.get(tier.space) || [];
    return tier.level === (available.length ? available[0].level : tier.level);
  }

  function getNewConstructionProjectForDecision(decision) {
    const levelKey = getEffectiveSchoolLevelKey(decision);
    if (levelKey === "elementary") return "New construction ES";
    if (levelKey === "middle") return "New construction MS";
    if (levelKey === "high") return "New construction HS";
    if (levelKey === "k8") return "New construction K-8";
    if (levelKey === "k12") return "New construction HS";
    return null;
  }

  function getAdditionBaseNewConstructionProject(decision) {
    return getNewConstructionProjectForDecision(decision);
  }

  function getAdditionStoryRatePerSf(_stories, decision) {
    const ncProj = getAdditionBaseNewConstructionProject(decision);
    if (!ncProj || !unitCostIndex) return null;
    const lib = unitCostIndex.get(makeUnitCostKey("01_new construction", ncProj));
    const rate = lib ? parseUnitCostNumber(lib.unitCost) : null;
    if (rate === null || !Number.isFinite(rate)) return null;
    return rate;
  }

  function formatAdditionRateLabel(rate) {
    if (rate === null || !Number.isFinite(rate)) return "—";
    const n = Math.round(rate * 100) / 100;
    return formatLocaleDecimal(n, 0, 2);
  }

  function getDecisionForResolvedSchool() {
    const uid = normUid(resolvedUniqueId);
    if (uid && decisionByUid.has(uid)) return decisionByUid.get(uid);
    return null;
  }

  /**
   * Educational adequacy from decision export (0-1). Legacy 0-100 values normalized to 0-1.
   * Used to fill ADA compliance % quantity when Unit Value is still blank after hydration.
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

  /** Cache of dashboard Priority Scores keyed by `strategyGroup||normName`. */
  let priorityScoreByStrategyName = null;
  let priorityScoreCacheToken = "";

  /**
   * Step 4 scores use map-derived inputs (nearest underutilized school) that this page
   * cannot reproduce, so prefer the values the dashboard publishes and only fall back
   * to a local re-rank when they are missing or stale.
   */
  let publishedScoreByName = null;
  let publishedScoreToken = null;

  function getPrioritizationWeightsStorageToken() {
    try {
      return window.localStorage?.getItem("jeffco_prioritization_weights_v1") || "";
    } catch {
      return "";
    }
  }

  function invalidatePriorityScoreCache() {
    priorityScoreByStrategyName = null;
    priorityScoreCacheToken = "";
    publishedScoreByName = null;
    publishedScoreToken = null;
  }

  function getPublishedPriorityScores() {
    let raw = "";
    try {
      raw = window.localStorage?.getItem("jeffco_priority_scores_v1") || "";
    } catch {
      raw = "";
    }
    if (!raw) {
      publishedScoreByName = null;
      publishedScoreToken = "";
      return null;
    }
    if (publishedScoreToken === raw) return publishedScoreByName;
    publishedScoreToken = raw;
    publishedScoreByName = null;

    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!parsed || !Array.isArray(parsed.scores) || !parsed.scores.length) return null;
    // Stale scores would silently contradict the sliders, so require the same weights.
    if ((parsed.weightsSig || "") !== getPrioritizationWeightsStorageToken()) return null;

    const map = new Map();
    const indexScore = (key, score) => {
      const k = norm(key);
      if (!k || !Number.isFinite(score)) return;
      if (!map.has(k)) map.set(k, score);
    };
    parsed.scores.forEach((entry) => {
      const score = Number(entry?.score);
      if (!Number.isFinite(score)) return;
      const name = norm(entry?.name);
      const uid = normUid(entry?.uid);
      if (uid) {
        indexScore(`uid:${uid}`, score);
        indexScore(uid, score);
      }
      if (name) {
        indexScore(normName(name), score);
        const alias = normName(displaySchoolName(name));
        if (alias) indexScore(alias, score);
      }
    });
    publishedScoreByName = map.size ? map : null;
    return publishedScoreByName;
  }

  function resolveDecisionForSchoolLabel(schoolLabel) {
    const label = norm(schoolLabel);
    if (!label || label === "—") return null;
    const byNorm = decisionByNameKey.get(normName(label));
    if (byNorm) return byNorm;
    const labelDisplay = displaySchoolName(label);
    for (const r of decisionByUid.values()) {
      const bn = norm(r?.["Building Name"]);
      if (!bn) continue;
      if (normName(bn) === normName(label) || displaySchoolName(bn) === label || displaySchoolName(bn) === labelDisplay) {
        return r;
      }
    }
    return null;
  }

  function lookupPublishedPriorityScore(schoolLabel, decisionOpt) {
    const published = getPublishedPriorityScores();
    if (!published) return null;

    const decision = decisionOpt || resolveDecisionForSchoolLabel(schoolLabel);
    const uid = normUid(decision?.UniqueID ?? decision?.["UniqueID"]);
    if (uid) {
      const byUid = published.get(`uid:${uid}`) ?? published.get(uid);
      if (byUid != null) return byUid;
    }

    const candidates = [
      schoolLabel,
      displaySchoolName(schoolLabel),
      decision?.["Building Name"],
      displaySchoolName(decision?.["Building Name"]),
    ];
    for (const c of candidates) {
      if (!c) continue;
      const hit = published.get(normName(c));
      if (hit != null) return hit;
    }
    return null;
  }

  /**
   * Rank with the current Step 4 weights and group scope (shared via localStorage).
   * Normalization is min/max across the ranked cohort, so the scope must match the
   * dashboard exactly or the same school scores differently here.
   */
  function ensurePriorityScoreCache() {
    const token = `${getPrioritizationWeightsStorageToken()}|${decisionByUid.size}`;
    if (priorityScoreByStrategyName && priorityScoreCacheToken === token) {
      return priorityScoreByStrategyName;
    }
    const map = new Map();
    priorityScoreByStrategyName = map;
    priorityScoreCacheToken = token;

    const logic = window.prioritizationLogic;
    if (!logic || typeof logic.initialize !== "function") return map;

    const schools = [];
    decisionByUid.forEach((r) => {
      if (!r) return;
      const meta = evaluateSchoolDecisionMeta(r, getActiveThresholds());
      schools.push({
        ...r,
        decision: meta.decision || r.decision || r["Decision Type"] || "",
        flow: meta.flow,
        name: r["Building Name"],
      });
    });
    logic.initialize(schools);

    const scope =
      typeof logic.resolveStrategyScope === "function"
        ? logic.resolveStrategyScope()
        : ["Expansion", "Maintenance/Investment", "Closure/Consolidation"];

    const record = (s, groupName) => {
      const name = s?.["Building Name"] || s?.name;
      if (!name || s.priorityScore == null || !Number.isFinite(Number(s.priorityScore))) return;
      const score = Number(s.priorityScore);
      const uid = normUid(s.UniqueID ?? s["UniqueID"]);
      map.set(`${groupName}||${normName(name)}`, score);
      map.set(`${groupName}||${normName(displaySchoolName(name))}`, score);
      // Name/uid-only keys so pivot rows under a different strategy branch still match.
      map.set(`*||${normName(name)}`, score);
      map.set(`*||${normName(displaySchoolName(name))}`, score);
      if (uid) map.set(`uid:${uid}`, score);
    };

    try {
      if (scope.length > 1 && typeof logic.rankSchoolsAcrossStrategies === "function") {
        (logic.rankSchoolsAcrossStrategies(scope, null) || []).forEach((s) => {
          record(s, s.strategyGroup || scope[0]);
        });
      } else if (scope.length && typeof logic.rankSchools === "function") {
        (logic.rankSchools(scope[0], null) || []).forEach((s) => record(s, scope[0]));
      }
    } catch (err) {
      console.warn("Priority score ranking failed:", err);
    }
    return map;
  }

  function lookupPriorityScore(schoolLabel, strategyGroup) {
    if (!schoolLabel) return null;

    // Published Step 4 scores are school-level (not pivot-branch-level). Prefer them
    // for every school row so slider moves update the full Custom list together.
    const publishedHit = lookupPublishedPriorityScore(schoolLabel);
    if (publishedHit != null) return publishedHit;

    const map = ensurePriorityScoreCache();
    const decision = resolveDecisionForSchoolLabel(schoolLabel);
    const uid = normUid(decision?.UniqueID ?? decision?.["UniqueID"]);
    if (uid && map.has(`uid:${uid}`)) return map.get(`uid:${uid}`);

    const keys = [];
    if (strategyGroup && strategyGroup !== "Other") {
      keys.push(
        `${strategyGroup}||${normName(schoolLabel)}`,
        `${strategyGroup}||${normName(displaySchoolName(schoolLabel))}`
      );
    }
    keys.push(`*||${normName(schoolLabel)}`, `*||${normName(displaySchoolName(schoolLabel))}`);
    const bn = decision?.["Building Name"];
    if (bn) {
      if (strategyGroup && strategyGroup !== "Other") {
        keys.push(`${strategyGroup}||${normName(bn)}`);
      }
      keys.push(`*||${normName(bn)}`);
    }
    for (const k of keys) {
      if (map.has(k)) return map.get(k);
    }
    return null;
  }

  function getSchoolScoreMetricsForLabel(schoolLabel, strategyGroup) {
    const decision = resolveDecisionForSchoolLabel(schoolLabel);
    const buildingRaw = decision
      ? coerceBuildingScore0to10(decision.BuildingScore ?? decision["Building Score"])
      : NaN;
    const ea01 = getEducationalAdequacy0to1(decision);
    return {
      priorityScore: lookupPriorityScore(schoolLabel, strategyGroup),
      compositeBuildingScore: Number.isFinite(buildingRaw) ? buildingRaw : null,
      educationalAdequacyScore: ea01 != null ? ea01 * 100 : null,
    };
  }

  function formatSchoolScoreMetric(key, value) {
    if (value == null || !Number.isFinite(Number(value))) return "";
    const n = Number(value);
    if (key === "educationalAdequacyScore") return `${(Math.round(n * 10) / 10).toFixed(1)}%`;
    return (Math.round(n * 10) / 10).toFixed(1);
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

  function isRelevantNewConstructionRow(row, decision) {
    if (norm(row?.SystemCategory) !== "01_new construction") return true;
    const asset = norm(row?.AssetType);
    if (!asset) return true;
    // Only level-specific full-building lines are filtered; Demolition + standalone additions stay.
    if (!/^new construction\b/i.test(asset) || /oels/i.test(asset)) return true;
    const wanted = getNewConstructionProjectForDecision(decision);
    if (!wanted) return true;
    return normProjectKey(asset) === normProjectKey(wanted);
  }

  /** Playground replacement: ECE needs PK; K-2 / 3rd-5th for elementary/K-8; hide for MS/HS. */
  function isRelevantPlaygroundRow(row, decision) {
    const assetLo = (norm(row?.AssetType) || "").toLowerCase();
    if (!assetLo.includes("playground")) return true;
    const levelKey = getEffectiveSchoolLevelKey(decision);
    if (levelKey === "middle" || levelKey === "high") return false;
    const pk = parseFloat(
      (decision?.PKEnrollment ?? decision?.["PK Enrollment"] ?? decision?.["PK_Enrollment"] ?? "")
        .toString()
        .replace(/,/g, "")
        .trim()
    );
    const hasPK = Number.isFinite(pk) && pk > 0;
    const isEce =
      assetLo.includes("ece") || assetLo.includes("2-5") || assetLo.includes("ages 2");
    if (isEce) {
      if (!hasPK && (levelKey === "elementary" || levelKey === "k8" || !levelKey)) return false;
      return true;
    }
    return true;
  }

  function isRelevantCampusTurfRow(row, decision) {
    const asset = norm(row?.AssetType);
    if (!/turf|athletic field lighting/i.test(asset)) return true;
    const levelKey = getEffectiveSchoolLevelKey(decision);
    if (/track resurfacing - hs/i.test(asset) || /artificial turf field replacement and track/i.test(asset)) {
      return levelKey === "high" || levelKey === "k12" || !levelKey;
    }
    if (/install new artificial turf field and track - ms/i.test(asset)) {
      return levelKey === "middle" || !levelKey;
    }
    if (/install new athletic field lighting/i.test(asset)) {
      return levelKey === "middle" || levelKey === "high" || levelKey === "k12" || !levelKey;
    }
    return true;
  }

  function shouldUseSchoolSqfForRow(row) {
    if (norm(row?.SystemCategory) !== "01_new construction") return false;
    if (!isFullBuildingNewConstructionAsset(row?.AssetType)) return false;
    const unit = normalizeUnit(row?.Unit, row?.UnitCost);
    return unit === "SF" || unit === "SQFT" || unit === "SQ FT" || unit === "SQF";
  }

  function computeDerivedQuantity(row, decision) {
    const unit = normalizeUnit(row?.Unit, row?.UnitCost);
    if (!unit) return null;

    // Full-building New construction lines derive quantity from school GSF.
    if (shouldUseSchoolSqfForRow(row)) {
      return getSchoolSqf(decision);
    }

    // Everything else uses hydrated / derived UnitValue (room schedule, defaults, overrides).
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

  /**
   * Tiers of one space are nested scopes, so only the score-selected tier may carry quantity and cost.
   * `isRelevantModernizationRow` already hides the others when a score exists; this is the backstop for
   * rows that slipped through with a stale quantity.
   */
  function suppressUnselectedModernizationTiers(rows) {
    (rows || []).forEach((r) => {
      if (r.__hiddenBySchoolLevel) return;
      if (!isModernizationLibraryRow(r)) return;
      const selected = getSelectedModernizationLevelForRow(r);
      if (selected === null) return;
      if (isSelectedModernizationTierRow(r)) return;
      r.__excludedFromTotals = true;
      if (!r.__excludedReason) r.__excludedReason = "modernization_tier";
      r.UnitValue = "";
      const rc = norm(r?.ReplacementCost);
      if (rc && !/not included/i.test(rc)) r.ReplacementCost = "";
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

  function loadAdditionStoriesForSchool(_uniqueId) {
    return 2;
  }

  function saveAdditionStoriesForSchool(uniqueId, _stories) {
    try {
      const uid = normUid(uniqueId);
      if (!uid || !window.localStorage) return;
      window.localStorage.setItem(`jeffco_addition_stories_v1:${uid}`, "2");
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
      if (cb.checked) selected.add(norm(cb.value));
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
      const vals = Array.from(selected);
      const show = cbClass === "system-filter-cb" ? vals.map((v) => displaySystemCategoryLabel(v)) : vals;
      labelEl.textContent = show.join(", ");
    } else {
      labelEl.textContent = selected.size + " selected";
    }
    if (allCb) {
      allCb.checked = selected.size === cbs.length;
      allCb.indeterminate = selected.size > 0 && selected.size < cbs.length;
    }
  }

  function wireMultiSelect(wrapId, btn, dropdown, cbClass, labelEl, onChange) {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
    });
    dropdown.addEventListener("click", (e) => e.stopPropagation());
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

    // Project Calculator header totals: Educational Adequacy only (00–07).
    const filteredRows = getFilteredFlatRows().filter((r) =>
      getSuperGroupKey(r?.SystemCategory) === EDUCATIONAL_ADEQUACY_SUPER_LABEL
    );
    const t = computeReplacementTotalsByPriority(filteredRows);

    // Building Addition planner is informational only (not summed into priority totals).
    const included = getIncludedPriorities();
    setPrioritySummaryCostEl(elTotalP1Cost, t["1"], included.has("1"));
    setPrioritySummaryCostEl(elTotalP2Cost, t["2"], included.has("2"));
    setPrioritySummaryCostEl(elTotalP3Cost, t["3"], included.has("3"));
    setPrioritySummaryCostEl(elTotalP4Cost, t["4"], included.has("4"));

    let total = 0;
    ["1", "2", "3", "4"].forEach((p) => {
      if (included.has(p)) total += t[p] || 0;
    });
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
    if (listViewMode === "strategy") {
      renderStrategyGroupView();
      return;
    }
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
      if (!rowPassesValueFilter(r)) return false;
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
      // Sort by canonical SystemCategory (00_, 01_, …) so General stays first; labels hide the prefix.
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

    const ctxKey =
      selectedSchoolUids && selectedSchoolUids.size > 1
        ? `multi:${Array.from(selectedSchoolUids).sort().join("|")}`
        : `${normUid(resolvedUniqueId)}||${norm(resolvedSchoolName)}`;
    const groupsToDefaultCollapse = new Set();
    viewRows.forEach((g) => {
      const lo = norm(g.__group).toLowerCase();
      if (
        lo.startsWith("00") ||
        lo.startsWith("01") ||
        lo.startsWith("02") ||
        lo.startsWith("03") ||
        lo.startsWith("04") ||
        lo.startsWith("05") ||
        lo.startsWith("06") ||
        lo.startsWith("07") ||
        lo.startsWith("08")
      ) {
        groupsToDefaultCollapse.add(g.__group);
      }
    });
    if (groupsToDefaultCollapse.size && ctxKey !== lastContextKeyForDefaultGroupCollapse) {
      lastContextKeyForDefaultGroupCollapse = ctxKey;
      groupsToDefaultCollapse.forEach((gk) => collapsedGroups.add(gk));
      collapsedSuperGroups.add(PROJECT_CALC_SUPER_LABEL);
      collapsedSuperGroups.add(FACILITY_DEFICIENCY_SUPER_LABEL);
      EMPTY_TEMPLATE_SUPER_LABELS.forEach((label) => collapsedSuperGroups.add(label));
      collapsedSuperGroups.delete(SELECTED_PROJECTS_SUPER_LABEL);
    }
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

  /**
   * Mirror rollup for Selected projects: Priority 1 rows only.
   * Calculator (00–07): include toggle ON and priority 1.
   * Facility Deficiency (08_*): priority 1.
   * Rows without a planning dollar amount are excluded.
   */
  function collectSelectedRowsFromProjectList(rows) {
    const out = [];
    const seen = new Set();
    function addRow(r) {
      if (!r || r.__isRollup) return;
      if (!rowHasPlanningValues(r)) return;
      const key = getRowKey(r) || `${norm(r.SystemCategory)}||${norm(r.AssetType)}||${getPriorityForRow(r)}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(r);
    }
    function consider(r) {
      if (!r) return;
      if (r.__isRollup && Array.isArray(r.__rollupRows)) {
        r.__rollupRows.forEach(consider);
        return;
      }
      if (norm(getPriorityForRow(r)) !== "1") return;
      const sys = norm(r.SystemCategory);
      if (isCalculatorSystemCategory(sys)) {
        if (rowIncludeToggleEffectiveDesired(r)) addRow(r);
      } else if (sys.toLowerCase().startsWith("08")) {
        addRow(r);
      }
    }
    (rows || []).forEach((r) => consider(r));
    return out;
  }

  function collectSelectedMirrorRows() {
    const out = [];
    const seen = new Set();
    const rowLists =
      listViewMode === "strategy"
        ? (viewRows || []).map((g) => g.__rows)
        : schoolRows && schoolRows.length
          ? [schoolRows]
          : (viewRows || []).map((g) => g.__rows);
    rowLists.forEach((rows) => {
      collectSelectedRowsFromProjectList(rows).forEach((r) => {
        const key = getRowKey(r) || `${norm(r.SystemCategory)}||${norm(r.AssetType)}||${getPriorityForRow(r)}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(r);
      });
    });
    return out;
  }

  function getStrategyGroupForSchoolCatalogEntry(uid, name) {
    const isNameOnly = uid && String(uid).startsWith("name:");
    const decision = isNameOnly
      ? decisionByNameKey.get(normName(name || uid.slice(5)))
      : uid
        ? decisionByUid.get(normUid(uid))
        : decisionByNameKey.get(normName(name));
    const meta = evaluateSchoolDecisionMeta(decision, getActiveThresholds());
    return getStrategyGroupForDecisionLocal(meta.decision, meta.flow);
  }

  function buildSelectedProjectsSchoolIndexFromMirrorRows(mirrorRows) {
    const bySchool = new Map();
    (mirrorRows || []).forEach((r) => {
      const schoolName = norm(r.__schoolLabel || resolvedSchoolName || "");
      let uid = resolvedUniqueId || "";
      if (schoolName) {
        const byName = decisionByNameKey.get(normName(schoolName));
        if (byName) uid = normUid(byName["UniqueID"] ?? byName.UniqueID) || uid;
      }
      const schoolKey = uid || "name:" + schoolName || "(unknown)";
      if (!bySchool.has(schoolKey)) {
        bySchool.set(schoolKey, {
          uid: schoolKey,
          name: schoolName || resolvedSchoolName || "—",
          decisionOutcome: evaluateSchoolDecision(
            uid && !String(uid).startsWith("name:") ? decisionByUid.get(uid) : decisionByNameKey.get(normName(schoolName)),
            getActiveThresholds()
          ),
          rows: [],
        });
      }
      bySchool.get(schoolKey).rows.push(r);
    });
    return Array.from(bySchool.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true })
    );
  }

  function selectedSchoolViewCollapseKey(uid) {
    return `selected||school||${uid}`;
  }

  function emptyTemplatePlaceholderText(sgKey) {
    if (sgKey === FOOD_NUTRITION_SUPER_LABEL) {
      return "Food and Nutrition project data will be added in a future update.";
    }
    if (sgKey === SAFETY_SECURITY_SUPER_LABEL) {
      return "Safety & Security project data will be added in a future update.";
    }
    if (sgKey === IT_PROJECTS_SUPER_LABEL) {
      return "Information Technology project data will be added in a future update.";
    }
    if (sgKey === SCHOOL_LEADER_PRIORITIES_SUPER_LABEL) {
      return "School leader project priorities will be added in a future update.";
    }
    return "Data will be added in a future update.";
  }

  function appendEmptyTemplateSection(tbody, sgKey) {
    const isCollapsed = collapsedSuperGroups.has(sgKey);
    const surveyTr = document.createElement("tr");
    surveyTr.className = superGroupRowClassName(sgKey, isCollapsed);
    surveyTr.appendChild(createBannerToggleCell());
    surveyTr.appendChild(createBannerLabelCell(sgKey));
    surveyTr.appendChild(createBannerSubtotalCell(0, { "1": 0, "2": 0, "3": 0, "4": 0 }));
    surveyTr.addEventListener("click", () => {
      closePivotGroupChevronMenu();
      if (collapsedSuperGroups.has(sgKey)) collapsedSuperGroups.delete(sgKey);
      else collapsedSuperGroups.add(sgKey);
      render();
    });
    wireSchoolViewCollapseMenu(surveyTr, {
      levelLabel: "section",
      onCollapseAll: () => setSchoolViewSectionBannersCollapsed(true),
      onExpandAll: () => setSchoolViewSectionBannersCollapsed(false),
    });
    tbody.appendChild(surveyTr);
    if (!isCollapsed) {
      const placeholderTr = document.createElement("tr");
      placeholderTr.className = "facility-survey-placeholder";
      const placeholderTd = document.createElement("td");
      placeholderTd.colSpan = tableTotalColumnCount();
      placeholderTd.textContent = emptyTemplatePlaceholderText(sgKey);
      placeholderTr.appendChild(placeholderTd);
      tbody.appendChild(placeholderTr);
    }
  }

  /** Read-only mirror row for Selected projects (no include toggle / priority editing). */
  function appendSelectedMirrorRow(tbody, r) {
    const tr = document.createElement("tr");
    tr.classList.add("selected-projects-mirror");
    if (r && r.__excludedFromTotals) {
      tr.classList.add("excluded-row");
      if (r.__excludedReason === "level") tr.classList.add("excluded-level");
      if (r.__excludedReason === "good" || r.__excludedReason === "modernization_tier") tr.classList.add("excluded-good");
    }
    const toggleTd = document.createElement("td");
    toggleTd.className = "col-include-toggle";
    tr.appendChild(toggleTd);

    DISPLAY_COLS.forEach((col) => {
      const cell = document.createElement("td");
      if (col === "Project Type") cell.classList.add("project-type-cell");
      if (col === "ConditionScore") cell.classList.add("condition-score-cell");
      if (col === "Priority") {
        cell.textContent = getPriorityForRow(r) || "—";
        cell.style.textAlign = "center";
      } else if (col === "Project Type") {
        const cat = displaySystemCategoryLabel(r?.SystemCategory);
        const proj = getCellValue(r, "Project Type") || "—";
        const wrap = document.createElement("span");
        wrap.className = "selected-project-type-with-cat";
        if (cat) {
          const catSpan = document.createElement("span");
          catSpan.className = "selected-project-cat";
          catSpan.textContent = cat;
          wrap.appendChild(catSpan);
          const sep = document.createElement("span");
          sep.className = "selected-project-cat-sep";
          sep.textContent = " · ";
          wrap.appendChild(sep);
        }
        const projSpan = document.createElement("span");
        projSpan.className = "selected-project-name";
        projSpan.textContent = proj;
        wrap.appendChild(projSpan);
        cell.appendChild(wrap);
        cell.title = cat ? `${cat} · ${proj}` : proj;
      } else if (col === "ConditionScore") {
        if (isSiteInfrastructureRow(r)) {
          cell.textContent = "";
          cell.classList.add("muted");
        } else {
          const text = getCellValue(r, col);
          const display = norm(text) ? text : "—";
          appendConditionScoreVisual(cell, r, display, false);
          cell.title = display;
        }
      } else {
        let v = getCellValue(r, col);
        if (col === "UnitCost") v = formatDisplayUnitCostCell(v);
        cell.textContent = norm(v) ? norm(v) : "—";
        cell.title = norm(v);
        if (!norm(v)) cell.classList.add("muted");
      }
      tr.appendChild(cell);
    });
    tbody.appendChild(tr);
  }

  /** Subtotal Educational Adequacy rows only (Project Calculator parent). */
  function computeProjectCalculatorRollupByP() {
    const all = [];
    (viewRows || []).forEach((g) => {
      if (getSuperGroupKey(g.__group) === EDUCATIONAL_ADEQUACY_SUPER_LABEL) {
        (g.__rows || []).forEach((r) => all.push(r));
      }
    });
    return computeGroupByP(all);
  }

  function appendProjectCalculatorParentBanner(tbody) {
    const byP = computeProjectCalculatorRollupByP();
    const total = byP["1"] + byP["2"] + byP["3"] + byP["4"];
    const isCollapsed = collapsedSuperGroups.has(PROJECT_CALC_SUPER_LABEL);
    const sgTr = document.createElement("tr");
    sgTr.className = superGroupRowClassName(PROJECT_CALC_SUPER_LABEL, isCollapsed);
    sgTr.appendChild(createBannerToggleCell());
    sgTr.appendChild(createBannerLabelCell(PROJECT_CALC_SUPER_LABEL));
    sgTr.appendChild(createBannerSubtotalCell(total, byP));
    sgTr.addEventListener("click", () => {
      closePivotGroupChevronMenu();
      if (collapsedSuperGroups.has(PROJECT_CALC_SUPER_LABEL)) {
        collapsedSuperGroups.delete(PROJECT_CALC_SUPER_LABEL);
      } else {
        collapsedSuperGroups.add(PROJECT_CALC_SUPER_LABEL);
      }
      render();
    });
    wireSchoolViewCollapseMenu(sgTr, {
      levelLabel: "banner",
      onCollapseAll: () => setSchoolViewTopBannersCollapsed(true),
      onExpandAll: () => setSchoolViewTopBannersCollapsed(false),
    });
    tbody.appendChild(sgTr);
    return !isCollapsed;
  }

  function appendSelectedProjectsSection(tbody) {
    const mirrorRows = collectSelectedMirrorRows();
    if (!mirrorRows.length) return;
    const byP = computeGroupByP(mirrorRows);
    const total = byP["1"] + byP["2"] + byP["3"] + byP["4"];
    const isCollapsed = collapsedSuperGroups.has(SELECTED_PROJECTS_SUPER_LABEL);
    const sgTr = document.createElement("tr");
    sgTr.className = superGroupRowClassName(SELECTED_PROJECTS_SUPER_LABEL, isCollapsed);
    sgTr.appendChild(createBannerToggleCell());
    sgTr.appendChild(createBannerLabelCell(SELECTED_PROJECTS_SUPER_LABEL));
    sgTr.appendChild(createBannerSubtotalCell(total, byP));
    sgTr.addEventListener("click", () => {
      closePivotGroupChevronMenu();
      if (collapsedSuperGroups.has(SELECTED_PROJECTS_SUPER_LABEL)) {
        collapsedSuperGroups.delete(SELECTED_PROJECTS_SUPER_LABEL);
      } else {
        collapsedSuperGroups.add(SELECTED_PROJECTS_SUPER_LABEL);
      }
      render();
    });
    wireSchoolViewCollapseMenu(sgTr, {
      levelLabel: "banner",
      onCollapseAll: () => setSchoolViewTopBannersCollapsed(true),
      onExpandAll: () => setSchoolViewTopBannersCollapsed(false),
    });
    tbody.appendChild(sgTr);
    if (isCollapsed) return;

    const multiSchool = selectedSchoolUids && selectedSchoolUids.size > 1;
    if (multiSchool) {
      buildSelectedProjectsSchoolIndexFromMirrorRows(mirrorRows).forEach((school) => {
        const schoolByP = computeGroupByP(school.rows);
        const schoolTotal = schoolByP["1"] + schoolByP["2"] + schoolByP["3"] + schoolByP["4"];
        const schoolKey = selectedSchoolViewCollapseKey(school.uid);
        const schoolCollapsed = collapsedSelectedStrategySchools.has(schoolKey);
        const schoolTr = document.createElement("tr");
        schoolTr.className = "group-row selected-projects-school" + (schoolCollapsed ? " collapsed" : "");
        schoolTr.appendChild(createBannerToggleCell());
        schoolTr.appendChild(createBannerLabelCell(
          `${displaySchoolName(school.name)} · ${school.decisionOutcome || "Unknown"}`
        ));
        schoolTr.appendChild(createBannerSubtotalCell(schoolTotal, schoolByP));
        schoolTr.addEventListener("click", (ev) => {
          ev.stopPropagation();
          closePivotGroupChevronMenu();
          if (collapsedSelectedStrategySchools.has(schoolKey)) collapsedSelectedStrategySchools.delete(schoolKey);
          else collapsedSelectedStrategySchools.add(schoolKey);
          render();
        });
        wireSchoolViewCollapseMenu(schoolTr, {
          levelLabel: "school",
          onCollapseAll: () => setSchoolViewSelectedSchoolsCollapsed(true),
          onExpandAll: () => setSchoolViewSelectedSchoolsCollapsed(false),
        });
        tbody.appendChild(schoolTr);
        if (schoolCollapsed) return;
        school.rows.forEach((r) => appendSelectedMirrorRow(tbody, r));
      });
      return;
    }

    mirrorRows.forEach((r) => appendSelectedMirrorRow(tbody, r));
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
    const sections = [];
    const projectCalcCollapsed = collapsedSuperGroups.has(PROJECT_CALC_SUPER_LABEL);

    if (!collapsedSuperGroups.has(SELECTED_PROJECTS_SUPER_LABEL)) {
      const mirrorRows = collectSelectedMirrorRows();
      if (mirrorRows.length) {
        sections.push({
          groupKey: SELECTED_PROJECTS_SUPER_LABEL,
          isFci: false,
          rows: mirrorRows,
        });
      }
    }

    const superGroupMap = new Map();
    viewRows.forEach((g) => {
      const sgKey = getSuperGroupKey(g.__group) || g.__group;
      if (!superGroupMap.has(sgKey)) superGroupMap.set(sgKey, []);
      superGroupMap.get(sgKey).push(g);
    });

    if (!projectCalcCollapsed) {
      const calcByP = computeProjectCalculatorRollupByP();
      sections.push({
        groupKey: PROJECT_CALC_SUPER_LABEL,
        isFci: false,
        rows: [],
        byP: calcByP,
        sum: calcByP["1"] + calcByP["2"] + calcByP["3"] + calcByP["4"],
        bannerOnly: true,
      });
      // EA categories nest under Project Calculator (no EA section banner).
      (superGroupMap.get(EDUCATIONAL_ADEQUACY_SUPER_LABEL) || []).forEach((g) => {
        const groupKey = g.__group;
        if (collapsedGroups.has(groupKey)) return;
        const rowsOut = [];
        (g.__rows || []).forEach((r) => rowsOut.push(r));
        if (rowsOut.length) sections.push({ groupKey, isFci: false, rows: rowsOut });
      });
    }

    SUPER_GROUP_DISPLAY_ORDER.forEach((sgKey) => {
      if (sgKey === SELECTED_PROJECTS_SUPER_LABEL || sgKey === PROJECT_CALC_SUPER_LABEL) return;
      if (EMPTY_TEMPLATE_SUPER_LABELS.has(sgKey)) {
        if (!collapsedSuperGroups.has(sgKey)) {
          sections.push({
            groupKey: sgKey,
            isFci: false,
            rows: [],
            placeholder: emptyTemplatePlaceholderText(sgKey),
          });
        }
        return;
      }
      const groups = superGroupMap.get(sgKey);
      if (!groups || !groups.length) return;
      const isSuperGroup =
        groups.length > 1 || (getSuperGroupKey(groups[0].__group) !== null && groups[0].__group !== sgKey);
      if (isSuperGroup && collapsedSuperGroups.has(sgKey)) return;

      const isFciParent = sgKey === FACILITY_DEFICIENCY_SUPER_LABEL;
      const isSafetyParent = sgKey === SAFETY_SECURITY_SUPER_LABEL;
      // Facility Deficiency keeps its category banner so its hierarchy matches
      // Educational Adequacy: section → system category → project/asset rows.
      const skipFciSubcategoryBanner = isSafetyParent && groups.length === 1;

      groups.forEach((g) => {
        const groupKey = g.__group;
        if (!skipFciSubcategoryBanner && collapsedGroups.has(groupKey)) return;

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
          const items = [];
          if (!skipFciSubcategoryBanner) {
            const catByP = computeGroupByP(g.__rows);
            const catSum = catByP["1"] + catByP["2"] + catByP["3"] + catByP["4"];
            items.push({ type: "categorySubtotal", groupKey, byP: catByP, sum: catSum });
          }
          sortedEntries.forEach(([at, assetRows]) => {
            if (!assetRows.length) return;
            const collapseKey = groupKey + "||" + at;
            const isSiteInfra = isSiteInfrastructureFciGroupKey(groupKey);
            const isAssetCollapsed = isSiteInfra
              ? !expandedFciSiteInfraAssets.has(collapseKey)
              : collapsedFciAssets.has(collapseKey);
            const assetByP = computeFciAssetRollupByP(assetRows);
            const assetSum = assetByP["1"] + assetByP["2"] + assetByP["3"] + assetByP["4"];
            items.push({
              type: "rollup",
              assetType: at,
              byP: assetByP,
              sum: assetSum,
              priorityLabel,
            });
            if (!isAssetCollapsed) {
              const masterDetails = getMasterDeficiencyDetailsForAsset(assetRows, at);
              if (masterDetails.length) {
                masterDetails.forEach((d) => items.push({ type: "row", row: d }));
              } else {
                assetRows.forEach((r) => items.push({ type: "row", row: r }));
              }
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

  function projectRowPassesActiveFilters(r) {
    const q = norm(elSearch && elSearch.value).toLowerCase();
    const prioritySelected = getFilteredPriorities();
    const totalPriorityCbs = document.querySelectorAll(".priority-filter-cb").length;
    const filterByPriority = prioritySelected.size > 0 && prioritySelected.size < totalPriorityCbs;
    const systemSel = elSystemDropdown ? getMultiSelectValues(elSystemDropdown, "system-filter-cb") : new Set();
    const systemTotal = elSystemDropdown ? elSystemDropdown.querySelectorAll(".system-filter-cb").length : 0;
    const filterBySystem = systemSel.size > 0 && systemSel.size < systemTotal;
    const assetSel = elAssetDropdown ? getMultiSelectValues(elAssetDropdown, "asset-filter-cb") : new Set();
    const assetTotal = elAssetDropdown ? elAssetDropdown.querySelectorAll(".asset-filter-cb").length : 0;
    const filterByAsset = assetSel.size > 0 && assetSel.size < assetTotal;

    if (filterByPriority && !prioritySelected.has(norm(getPriorityForRow(r)))) return false;
    if (filterBySystem && !systemSel.has(norm(r.SystemCategory))) return false;
    if (filterByAsset && !assetSel.has(norm(r.AssetType))) return false;
    if (q) {
      const hay = [
        displaySystemCategoryLabel(r?.SystemCategory),
        displayProjectTypeLabel(r),
        r?.__strategyGroup || "",
        r?.__schoolName || "",
        ...DISPLAY_COLS.map((c) => norm(getCellValue(r, c))),
      ]
        .join(" | ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (!rowPassesValueFilter(r)) return false;
    return true;
  }

  function getStrategyGroupCacheKey() {
    return JSON.stringify(getActiveThresholds());
  }

  function buildStrategyGroupIndex() {
    const cacheKey = getStrategyGroupCacheKey();
    if (strategyGroupCache && strategyGroupCacheKey === cacheKey) return strategyGroupCache;

    const scoped = typeof getScopedSchoolCatalogFn === "function" ? getScopedSchoolCatalogFn() : schoolCatalogOpts;
    const byGroup = new Map();
    STRATEGY_GROUP_ORDER.forEach((g) => byGroup.set(g, []));

    (scoped || []).forEach((opt) => {
      const uid = opt.uid;
      const built = buildSchoolProjectRowsForSelection(
        uid.startsWith("name:") ? "" : uid,
        uid.startsWith("name:") ? uid.slice(5) : opt.name
      );
      if (!built.rows.length) return;
      const group = built.strategyGroup || "Other";
      if (!byGroup.has(group)) byGroup.set(group, []);
      byGroup.get(group).push(built);
    });

    STRATEGY_GROUP_ORDER.forEach((g) => {
      const schools = byGroup.get(g) || [];
      schools.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
      byGroup.set(g, schools);
    });

    strategyGroupCacheKey = cacheKey;
    strategyGroupCache = byGroup;
    return byGroup;
  }

  function strategySchoolCollapseKey(strategyGroup, uid) {
    return `${strategyGroup}||${uid}`;
  }

  function strategyProjectTypeCollapseKey(strategyGroup, projectTypeLabel) {
    return `${strategyGroup}||${projectTypeLabel}`;
  }

  function strategySchoolInTreeCollapseKey(strategyGroup, projectTypeLabel, uid) {
    return `${strategyGroup}||${projectTypeLabel}||${uid}`;
  }

  function clearTableMountContent() {
    if (!elTableMount) return;
    elTableMount.querySelectorAll(".portfolio-table-wrap, .empty").forEach((n) => n.remove());
  }

  function mountTableFilterBar() {
    const controls = document.getElementById("tableFilterControls");
    if (!controls || !elTableMount) return;
    let bar = document.getElementById("tableFilterBarMount");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "tableFilterBarMount";
      bar.className = "portfolio-filter-bar";
    }
    if (controls.parentElement !== bar) {
      bar.appendChild(controls);
    }
    controls.hidden = false;
    if (bar.parentElement !== elTableMount) {
      elTableMount.insertBefore(bar, elTableMount.firstChild);
    }
  }

  function syncStrategyPivotToolbar(show) {
    const toolbar = document.getElementById("strategyPivotToolbar");
    const colsBtn = document.getElementById("strategyColumnsBtn");
    const colsMenu = document.getElementById("strategyColumnsMenu");
    const resetBtn = document.getElementById("strategyResetOrderBtn");
    if (toolbar) toolbar.hidden = !show;
    if (!show) {
      if (colsMenu) colsMenu.hidden = true;
      if (colsBtn) colsBtn.setAttribute("aria-expanded", "false");
      return;
    }
    if (!colsBtn || !colsMenu || !resetBtn) return;

    const schoolScoreHidden = [...SCHOOL_SCORE_METRIC_KEYS].filter((k) => strategyPivotHiddenCols.has(k)).length;
    const hiddenCount = Math.max(0, strategyPivotHiddenCols.size - schoolScoreHidden);
    colsBtn.textContent = hiddenCount ? `Columns (${hiddenCount} hidden) ▾` : "Columns ▾";

    colsMenu.innerHTML = "";
    const addOption = (sec, { key, label: itemLabel, sub }) => {
      const row = document.createElement("label");
      row.className = "pivot-columns-option" + (sub ? " is-sub" : "");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = isStrategyPivotColumnVisible(key);
      cb.dataset.colKey = key;
      cb.addEventListener("change", () => {
        const ok = setStrategyPivotColumnVisible(key, cb.checked);
        if (!ok) {
          cb.checked = true;
          return;
        }
        renderStrategyGroupView();
      });
      row.appendChild(cb);
      row.appendChild(document.createTextNode(itemLabel));
      sec.appendChild(row);
    };

    const nestSec = document.createElement("div");
    nestSec.className = "pivot-columns-section";
    const nestTitle = document.createElement("div");
    nestTitle.className = "pivot-columns-section-title";
    nestTitle.textContent = "Nesting columns";
    nestSec.appendChild(nestTitle);
    getStrategyPivotHierarchyOrder().forEach((key) => {
      addOption(nestSec, { key, label: getStrategyPivotDimLabel(key) });
      if (key === "school") {
        STRATEGY_PIVOT_METRIC_COLUMNS.filter((c) => SCHOOL_SCORE_METRIC_KEYS.has(c.key)).forEach((c) => {
          addOption(nestSec, { key: c.key, label: c.label, sub: true });
        });
      }
    });
    colsMenu.appendChild(nestSec);

    const metricSec = document.createElement("div");
    metricSec.className = "pivot-columns-section";
    const metricTitle = document.createElement("div");
    metricTitle.className = "pivot-columns-section-title";
    metricTitle.textContent = "Metric columns";
    metricSec.appendChild(metricTitle);
    STRATEGY_PIVOT_METRIC_COLUMNS.filter((c) => !SCHOOL_SCORE_METRIC_KEYS.has(c.key)).forEach((c) => {
      addOption(metricSec, { key: c.key, label: c.label });
    });
    colsMenu.appendChild(metricSec);

    const showAll = document.createElement("button");
    showAll.type = "button";
    showAll.className = "pivot-columns-show-all";
    showAll.textContent = "Show all columns";
    showAll.addEventListener("click", (e) => {
      e.preventDefault();
      showAllStrategyPivotColumns();
    });
    colsMenu.appendChild(showAll);

    if (colsBtn.dataset.wired !== "1") {
      colsBtn.dataset.wired = "1";
      colsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = colsMenu.hidden;
        document.querySelectorAll(".pivot-columns-menu").forEach((m) => {
          m.hidden = true;
        });
        colsMenu.hidden = !open;
        colsBtn.setAttribute("aria-expanded", open ? "true" : "false");
      });
      colsMenu.addEventListener("click", (e) => e.stopPropagation());
    }

    if (resetBtn.dataset.wired !== "1") {
      resetBtn.dataset.wired = "1";
      resetBtn.addEventListener("click", () => {
        resetStrategyPivotHierarchyOrder();
      });
    }
  }

  function syncHierarchyLegend(show) {
    // Nesting legend bar removed — column headers stay drag-reorderable.
    // Columns / Reset live next to the settings gear in strategy view.
    const legend = document.getElementById("portfolioHierarchyLegend");
    if (legend) {
      legend.hidden = true;
      legend.innerHTML = "";
    }
    syncStrategyPivotToolbar(!!show);
  }

  function mountHierarchyLegend(show) {
    syncHierarchyLegend(show);
  }

  function parkTableFilterBar() {
    const pool = document.getElementById("tableFilterPool");
    const controls = document.getElementById("tableFilterControls");
    const bar = document.getElementById("tableFilterBarMount");
    if (bar && bar.parentElement) bar.remove();
    if (controls && pool && controls.parentElement !== pool) {
      pool.appendChild(controls);
      controls.hidden = true;
    }
  }

  function parkHierarchyLegend() {
    const legend = document.getElementById("portfolioHierarchyLegend");
    if (legend) legend.hidden = true;
    syncStrategyPivotToolbar(false);
  }

  function buildStrategyPivotTableHeader() {
    const columns = getStrategyPivotColumns();
    const thead = document.createElement("thead");
    const trTitles = document.createElement("tr");
    trTitles.className = "portfolio-header-row portfolio-header-titles";
    columns.forEach((col) => {
      const th = document.createElement("th");
      const w = getStrategyPivotColWidth(col.key);
      th.className =
        (col.align === "right" ? "col-metric" : col.align === "center" ? "col-priority" : "col-dim") +
        " is-sortable pivot-col-header";
      if (col.isDim) {
        th.classList.add("pivot-dim-header");
        const nestTone = getStrategyPivotDimNestTone(col.key);
        if (nestTone === null) th.classList.add("pivot-dim-header--leaf");
        else th.classList.add(`pivot-dim-header--level-${Math.min(nestTone, 4)}`);
      }
      if (strategyPivotSort.key === col.key) th.classList.add("is-sorted");
      if (isStrategyPivotColumnFilterActive(col.key)) th.classList.add("is-filtered");
      th.style.width = `${w}px`;
      th.style.minWidth = `${w}px`;
      th.dataset.colKey = col.key;

      const inner = document.createElement("div");
      inner.className = "pivot-th-inner";

      if (col.isDim) {
        th.draggable = true;
        th.dataset.dimKey = col.key;
        const grip = document.createElement("span");
        grip.className = "col-drag-handle";
        grip.textContent = "⋮⋮";
        grip.title = "Drag to reorder columns";
        inner.appendChild(grip);
        wirePivotDimDrag(th);
      }

      const label = document.createElement("span");
      label.className = "th-label";
      label.textContent = col.label;
      if (strategyPivotSort.key === col.key) {
        label.appendChild(
          document.createTextNode(strategyPivotSort.dir === "asc" ? " ↑" : " ↓")
        );
      }
      inner.appendChild(label);
      th.appendChild(inner);
      appendPivotColumnFilterControl(th, col.key, col.label);
      appendPivotColResizeHandle(th, col.key);
      trTitles.appendChild(th);
    });
    thead.appendChild(trTitles);
    return thead;
  }

  function buildPortfolioSortHeader(columns, sortState, onSort) {
    const thead = document.createElement("thead");
    const trTitles = document.createElement("tr");
    trTitles.className = "portfolio-header-row portfolio-header-titles";
    columns.forEach((col) => {
      const th = document.createElement("th");
      th.className =
        (col.align === "right" ? "col-metric" : col.align === "center" ? "col-priority" : "col-dim") +
        " is-sortable";
      if (sortState.key === col.key) th.classList.add("is-sorted");
      const label = document.createElement("span");
      label.className = "th-label";
      label.textContent = col.label;
      th.appendChild(label);
      const indicator = document.createElement("span");
      indicator.className = "sort-indicator";
      if (sortState.key === col.key) {
        indicator.textContent = sortState.dir === "asc" ? "▲" : "▼";
      }
      th.appendChild(indicator);
      th.addEventListener("click", () => onSort(col.key));
      trTitles.appendChild(th);
    });
    thead.appendChild(trTitles);
    return thead;
  }

  function toggleStrategyPivotSort(key) {
    if (strategyPivotSort.key === key) {
      strategyPivotSort.dir = strategyPivotSort.dir === "asc" ? "desc" : "asc";
    } else {
      strategyPivotSort.key = key;
      const textKeys = new Set(getStrategyPivotVisibleHierarchyOrder());
      strategyPivotSort.dir = textKeys.has(key) ? "asc" : "desc";
    }
    renderStrategyGroupView();
  }

  function compareStrategyPivotRows(a, b, key, dir) {
    if (key === "priority") {
      return compareValues(getPriorityForRow(a.row), getPriorityForRow(b.row), dir);
    }
    const av = a[key];
    const bv = b[key];
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return compareValues(av, bv, dir);
  }

  function sortStrategyPivotRows(rows) {
    const { key, dir } = strategyPivotSort;
    const hierarchy = getStrategyPivotHierarchyOrder();
    const tieKeys = [key, ...hierarchy.filter((k) => k !== key)];
    rows.sort((a, b) => {
      for (const tk of tieKeys) {
        const tkDir = tk === key ? dir : "asc";
        const cmp = compareStrategyPivotRows(a, b, tk, tkDir);
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
  }

  function computePivotNodeMetrics(rows, grandTotal) {
    let conditionSum = 0;
    let conditionCount = 0;
    let unitCostSum = 0;
    let unitCostCount = 0;
    let replacementCost = 0;
    const schools = new Set();
    (rows || []).forEach((r) => {
      replacementCost += r.replacementCost || 0;
      if (r.school) schools.add(r.school);
      if (r.condition !== null && r.condition !== undefined) {
        conditionSum += r.condition;
        conditionCount += 1;
      }
      if (r.unitCost !== null && r.unitCost !== undefined) {
        unitCostSum += r.unitCost;
        unitCostCount += 1;
      }
    });
    return {
      projects: (rows || []).length,
      schools: schools.size,
      condition: conditionCount ? conditionSum / conditionCount : null,
      unitCost: unitCostCount ? unitCostSum / unitCostCount : null,
      replacementCost,
      pctTotal: grandTotal > 0 ? (replacementCost / grandTotal) * 100 : 0,
      priorityScore: null,
      compositeBuildingScore: null,
      educationalAdequacyScore: null,
    };
  }

  /**
   * Keys are dim-qualified so hiding or reordering a column cannot make a group
   * inherit another level's stale collapsed state.
   */
  function strategyPivotGroupCollapseKey(groupDims, level, label, sampleRow) {
    return groupDims
      .slice(0, level + 1)
      .map((d) => `${d}=${sampleRow?.[d] ?? (d === groupDims[level] ? label : "")}`)
      .join("||");
  }

  function isStrategyDeepCollapseDim(dim) {
    return dim === "systemCategory" || dim === "projectType";
  }

  function isStrategyPivotGroupCollapsed(node) {
    if (!node || node.type !== "group") return false;
    // Keep System Category / Project Type closed by default when Projects is the leaf.
    if (isStrategyDeepCollapseDim(node.dim) && getStrategyPivotLeafDims().includes("project")) {
      return !expandedStrategyDeepGroups.has(node.collapseKey);
    }
    return collapsedStrategyPivotGroups.has(node.collapseKey);
  }

  function toggleStrategyPivotGroupCollapsed(node) {
    if (!node || node.type !== "group" || !node.collapseKey) return;
    if (isStrategyDeepCollapseDim(node.dim) && getStrategyPivotLeafDims().includes("project")) {
      if (expandedStrategyDeepGroups.has(node.collapseKey)) {
        expandedStrategyDeepGroups.delete(node.collapseKey);
      } else {
        expandedStrategyDeepGroups.add(node.collapseKey);
      }
      return;
    }
    if (collapsedStrategyPivotGroups.has(node.collapseKey)) {
      collapsedStrategyPivotGroups.delete(node.collapseKey);
    } else {
      collapsedStrategyPivotGroups.add(node.collapseKey);
    }
  }

  function buildStrategyPivotTree(flatRows, grandTotal) {
    const groupDims = getStrategyPivotGroupDims();
    function nest(rows, level) {
      if (level >= groupDims.length) {
        return rows.map((data) => ({ type: "leaf", data }));
      }
      const dim = groupDims[level];
      const byLabel = new Map();
      rows.forEach((r) => {
        const label = r[dim] || "—";
        if (!byLabel.has(label)) byLabel.set(label, []);
        byLabel.get(label).push(r);
      });
      return Array.from(byLabel.entries()).map(([label, groupRows]) => {
        const metrics = computePivotNodeMetrics(groupRows, grandTotal);
        if (dim === "school") {
          const strategyGroup = groupRows[0]?.strategyGroup || "";
          Object.assign(metrics, getSchoolScoreMetricsForLabel(label, strategyGroup));
        }
        return {
          type: "group",
          dim,
          level,
          label,
          collapseKey: strategyPivotGroupCollapseKey(groupDims, level, label, groupRows[0]),
          metrics,
          children: nest(groupRows, level + 1),
          rows: groupRows,
        };
      });
    }
    return nest(flatRows, 0);
  }

    function comparePivotTreeNodes(a, b, sortKey, dir) {
    if (a.type === "leaf" && b.type === "leaf") {
      return compareStrategyPivotRows(a.data, b.data, sortKey, dir);
    }
    if (a.type === "group" && b.type === "group") {
      if (sortKey === a.dim || (a.dim === "priority" && sortKey === "priority")) {
        return compareValues(a.label, b.label, dir);
      }
      if (["replacementCost", "condition", "unitCost", "pctTotal", "projects", "priorityScore", "compositeBuildingScore", "educationalAdequacyScore"].includes(sortKey)) {
        const av = a.metrics[sortKey] ?? 0;
        const bv = b.metrics[sortKey] ?? 0;
        return compareValues(av, bv, dir);
      }
      // Stable default: priority groups sort P1→P4 even when sorted by another column.
      if (a.dim === "priority") return compareValues(a.label, b.label, "asc");
      return compareValues(a.label, b.label, dir);
    }
    return 0;
  }

  function sortPivotTreeNodes(nodes) {
    const { key, dir } = strategyPivotSort;
    nodes.sort((a, b) => comparePivotTreeNodes(a, b, key, dir));
    nodes.forEach((n) => {
      if (n.type === "group") sortPivotTreeNodes(n.children);
    });
  }

  function appendPriorityBadge(cell, p) {
    const labels = { "1": "P1 Critical", "2": "P2 High", "3": "P3 Medium", "4": "P4 Low" };
    const pill = document.createElement("span");
    pill.className = `priority-badge priority-badge--p${p || "2"}`;
    pill.textContent = labels[p] || `P${p}`;
    cell.appendChild(pill);
  }

  function appendPivotMetricCells(tr, metrics, { isGroup, level = 0 } = {}) {
    const m = metrics || {};
    const levelCls = isGroup
      ? ` pivot-metric-level-${Math.min(Math.max(level, 0), 4)}`
      : " pivot-metric-level-leaf";

    const appendSchoolScoreCell = (key) => {
      if (!isStrategyPivotColumnVisible(key)) return;
      const td = document.createElement("td");
      td.className = "col-metric" + levelCls;
      const text = formatSchoolScoreMetric(key, m[key]);
      if (text) {
        td.textContent = text;
        td.classList.add("pivot-school-score");
      } else {
        td.classList.add("pivot-group-metric-empty");
      }
      tr.appendChild(td);
    };

    appendSchoolScoreCell("priorityScore");
    appendSchoolScoreCell("compositeBuildingScore");
    appendSchoolScoreCell("educationalAdequacyScore");

    if (isStrategyPivotColumnVisible("condition")) {
      const condTd = document.createElement("td");
      condTd.className = "col-metric" + levelCls + (isGroup ? " pivot-group-metric-empty" : "");
      if (!isGroup && m.condition !== null && m.condition !== undefined) {
        appendTreeConditionPill(condTd, m.condition);
      } else if (!isGroup) {
        condTd.textContent = "—";
        condTd.classList.add("tree-metric-muted");
      }
      tr.appendChild(condTd);
    }

    if (isStrategyPivotColumnVisible("unitCost")) {
      const unitTd = document.createElement("td");
      unitTd.className = "col-metric" + levelCls + (isGroup ? " pivot-group-metric-empty" : "");
      if (!isGroup && m.unitCost !== null && m.unitCost !== undefined) {
        unitTd.textContent = formatDisplayUnitCostCell(String(m.unitCost));
      } else if (!isGroup) {
        unitTd.textContent = "—";
        unitTd.classList.add("tree-metric-muted");
      }
      tr.appendChild(unitTd);
    }

    if (isStrategyPivotColumnVisible("replacementCost")) {
      const rcTd = document.createElement("td");
      rcTd.className =
        "col-metric tree-replacement-cost" +
        levelCls +
        (isGroup ? " is-group-total" : "");
      rcTd.textContent = m.replacementCost
        ? formatLocaleUsdInteger(Math.round(m.replacementCost))
        : isGroup
          ? ""
          : "—";
      if (!rcTd.textContent || rcTd.textContent === "—") {
        rcTd.classList.remove("tree-replacement-cost", "is-group-total");
        if (!isGroup) rcTd.classList.add("tree-metric-muted");
        else rcTd.classList.add("pivot-group-metric-empty");
      }
      tr.appendChild(rcTd);
    }

    if (isStrategyPivotColumnVisible("pctTotal")) {
      const pctTd = document.createElement("td");
      pctTd.className =
        "col-metric" +
        levelCls +
        (isGroup && !m.pctTotal ? " pivot-group-metric-empty" : "");
      if (!isGroup) appendTreePctBar(pctTd, m.pctTotal || 0);
      else if (m.pctTotal) appendTreePctBar(pctTd, m.pctTotal);
      tr.appendChild(pctTd);
    }
  }

  let lastStrategyPivotTree = null;

  function collectPivotGroupNodesAtLevel(nodes, level, out = []) {
    (nodes || []).forEach((n) => {
      if (!n || n.type !== "group") return;
      if (n.level === level) out.push(n);
      if (n.children) collectPivotGroupNodesAtLevel(n.children, level, out);
    });
    return out;
  }

  /** Collapse / expand every group row at the same nest level as `node`. */
  function setPivotGroupsCollapsedAtLevel(node, collapsed) {
    if (!node || node.type !== "group") return;
    const roots = lastStrategyPivotTree || [node];
    const peers = collectPivotGroupNodesAtLevel(roots, node.level);
    const deepMode =
      isStrategyDeepCollapseDim(node.dim) && getStrategyPivotLeafDims().includes("project");
    peers.forEach((n) => {
      if (!n.collapseKey) return;
      if (deepMode) {
        if (collapsed) expandedStrategyDeepGroups.delete(n.collapseKey);
        else expandedStrategyDeepGroups.add(n.collapseKey);
      } else if (collapsed) {
        collapsedStrategyPivotGroups.add(n.collapseKey);
      } else {
        collapsedStrategyPivotGroups.delete(n.collapseKey);
      }
    });
    renderStrategyGroupView();
  }

  function closePivotGroupChevronMenu() {
    document.querySelectorAll(".pivot-group-chevron-menu").forEach((m) => m.remove());
  }

  /**
   * Shared right-click menu: Collapse all / Expand all at a nesting level
   * (strategy pivot + By school banners).
   */
  function showCollapseLevelMenu(clientX, clientY, { levelLabel, onCollapseAll, onExpandAll }) {
    closePivotGroupChevronMenu();
    const label = levelLabel || "group";
    const menu = document.createElement("div");
    menu.className = "pivot-group-chevron-menu";
    menu.setAttribute("role", "menu");

    const collapseBtn = document.createElement("button");
    collapseBtn.type = "button";
    collapseBtn.textContent = `Collapse all ${label}`;
    collapseBtn.title = `Collapse every ${label} row at this nesting level`;
    collapseBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closePivotGroupChevronMenu();
      if (typeof onCollapseAll === "function") onCollapseAll();
    });
    menu.appendChild(collapseBtn);

    const expandBtn = document.createElement("button");
    expandBtn.type = "button";
    expandBtn.textContent = `Expand all ${label}`;
    expandBtn.title = `Expand every ${label} row at this nesting level`;
    expandBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closePivotGroupChevronMenu();
      if (typeof onExpandAll === "function") onExpandAll();
    });
    menu.appendChild(expandBtn);

    document.body.appendChild(menu);
    const pad = 8;
    const rect = menu.getBoundingClientRect();
    let left = clientX;
    let top = clientY;
    if (left + rect.width > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - rect.width - pad);
    if (top + rect.height > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - rect.height - pad);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    const onDoc = (ev) => {
      if (menu.contains(ev.target)) return;
      closePivotGroupChevronMenu();
      document.removeEventListener("mousedown", onDoc, true);
      document.removeEventListener("scroll", onDoc, true);
      document.removeEventListener("keydown", onKey, true);
    };
    const onKey = (ev) => {
      if (ev.key === "Escape") onDoc(ev);
    };
    setTimeout(() => {
      document.addEventListener("mousedown", onDoc, true);
      document.addEventListener("scroll", onDoc, true);
      document.addEventListener("keydown", onKey, true);
    }, 0);
  }

  function showPivotGroupChevronMenu(clientX, clientY, node) {
    if (!node || node.type !== "group") return;
    const levelLabel = getStrategyPivotDimLabel(node.dim) || "group";
    showCollapseLevelMenu(clientX, clientY, {
      levelLabel,
      onCollapseAll: () => setPivotGroupsCollapsedAtLevel(node, true),
      onExpandAll: () => setPivotGroupsCollapsedAtLevel(node, false),
    });
  }

  /** Collect Facility Deficiency asset-band collapse keys currently in the school table. */
  function collectSchoolViewFciAssetCollapseEntries() {
    const entries = [];
    (viewRows || []).forEach((g) => {
      if (getSuperGroupKey(g.__group) !== FACILITY_DEFICIENCY_SUPER_LABEL) return;
      const groupKey = g.__group;
      const seen = new Set();
      (g.__rows || []).forEach((r) => {
        const at = norm(r?.AssetType) || "(Unknown)";
        if (seen.has(at)) return;
        seen.add(at);
        entries.push({
          collapseKey: groupKey + "||" + at,
          isSiteInfra: isSiteInfrastructureFciGroupKey(groupKey),
        });
      });
    });
    return entries;
  }

  function setSchoolViewFciAssetsCollapsed(collapsed) {
    collectSchoolViewFciAssetCollapseEntries().forEach(({ collapseKey, isSiteInfra }) => {
      if (isSiteInfra) {
        if (collapsed) expandedFciSiteInfraAssets.delete(collapseKey);
        else expandedFciSiteInfraAssets.add(collapseKey);
      } else if (collapsed) {
        collapsedFciAssets.add(collapseKey);
      } else {
        collapsedFciAssets.delete(collapseKey);
      }
    });
    render();
  }

  function setSchoolViewTopBannersCollapsed(collapsed) {
    [SELECTED_PROJECTS_SUPER_LABEL, PROJECT_CALC_SUPER_LABEL].forEach((k) => {
      if (collapsed) collapsedSuperGroups.add(k);
      else collapsedSuperGroups.delete(k);
    });
    render();
  }

  function setSchoolViewSectionBannersCollapsed(collapsed) {
    STANDALONE_SECTION_LABELS.forEach((k) => {
      if (collapsed) collapsedSuperGroups.add(k);
      else collapsedSuperGroups.delete(k);
    });
    render();
  }

  function setSchoolViewCategoryGroupsCollapsed(collapsed) {
    (viewRows || []).forEach((g) => {
      if (!g || !g.__group) return;
      if (collapsed) collapsedGroups.add(g.__group);
      else collapsedGroups.delete(g.__group);
    });
    render();
  }

  function setSchoolViewSelectedSchoolsCollapsed(collapsed) {
    const mirrorRows = collectSelectedMirrorRows();
    buildSelectedProjectsSchoolIndexFromMirrorRows(mirrorRows).forEach((school) => {
      const key = selectedSchoolViewCollapseKey(school.uid);
      if (collapsed) collapsedSelectedStrategySchools.add(key);
      else collapsedSelectedStrategySchools.delete(key);
    });
    render();
  }

  function wireSchoolViewCollapseMenu(tr, { levelLabel, onCollapseAll, onExpandAll }) {
    if (!tr) return;
    const chev = tr.querySelector(".group-arrow");
    if (!chev) return;
    chev.title = "Right-click for Collapse all / Expand all";
    chev.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showCollapseLevelMenu(e.clientX, e.clientY, { levelLabel, onCollapseAll, onExpandAll });
    });
  }

  /**
   * Staircase group row: label starts under its column header, then colspans
   * across the empty dim columns to the right so long names stay on one line.
   */
  function appendStrategyPivotGroupRow(tbody, node, hierarchy, groupDims, grandTotal) {
    const collapsed = isStrategyPivotGroupCollapsed(node);
    const dimIndex = hierarchy.indexOf(node.dim);
    const isDeepestGroup = node.dim === groupDims[groupDims.length - 1];
    const tr = document.createElement("tr");
    tr.className =
      `pivot-group-row pivot-group-row--level-${node.level} pivot-group-row--${node.dim}` +
      (collapsed ? " is-collapsed" : "");
    tr.title = "Click to expand or collapse";

    hierarchy.forEach((dim, i) => {
      if (i < dimIndex) {
        appendEmptyPivotDimCell(tr, dim);
      } else if (i === dimIndex) {
        appendPivotGroupLabelCell(tr, {
          dim: node.dim,
          label: node.label,
          collapsed,
          meta: pivotGroupMetaLabel(node, { isDeepestGroup }),
          // Spill into empty dim columns to the right (headers still mark the start column).
          colSpan: Math.max(1, hierarchy.length - dimIndex),
        });
      }
      // i > dimIndex: covered by colspan — do not add cells
    });

    appendPivotMetricCells(tr, node.metrics, { isGroup: true, level: node.level });

    const chev = tr.querySelector(".pivot-tree-chevron");
    if (chev) {
      chev.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showPivotGroupChevronMenu(e.clientX, e.clientY, node);
      });
    }

    tr.addEventListener("click", () => {
      closePivotGroupChevronMenu();
      toggleStrategyPivotGroupCollapsed(node);
      renderStrategyGroupView();
    });
    tbody.appendChild(tr);

    if (collapsed) return;

    const leafDims = getStrategyPivotLeafDims();
    const lazyFdProjects =
      isDeepestGroup &&
      leafDims.includes("project") &&
      (node.rows || []).some((pr) =>
        isFacilitiesDeficiencySystemCategory(pr?.row?.SystemCategory)
      );

    if (lazyFdProjects) {
      buildLazyStrategyFdProjectLeaves(node, grandTotal || 0).forEach((leaf) => {
        appendStrategyPivotLeafRow(tbody, leaf, hierarchy, groupDims);
      });
      return;
    }

    (node.children || []).forEach((child) => {
      if (child.type === "group") appendStrategyPivotGroupRow(tbody, child, hierarchy, groupDims, grandTotal);
      else appendStrategyPivotLeafRow(tbody, child.data, hierarchy, groupDims);
    });
  }

  /**
   * Leaf project row: blank under group columns; values under leaf columns only.
   * Example (default): blank ×4 group cols | System Category | Priority | metrics…
   */
  function appendStrategyPivotLeafRow(tbody, pivotRow, hierarchy, groupDims) {
    const leafDims = getStrategyPivotLeafDims();
    const tr = document.createElement("tr");
    tr.className = "strategy-pivot-row pivot-leaf-row";
    if (pivotRow.row?.__excludedFromTotals) tr.classList.add("excluded-row");

    hierarchy.forEach((dim) => {
      if (groupDims.includes(dim)) {
        appendEmptyPivotDimCell(tr, dim);
      } else if (dim === "priority") {
        const td = document.createElement("td");
        td.className = "col-priority pivot-leaf-dim pivot-dim-cell--priority";
        const p = norm(getPriorityForRow(pivotRow.row));
        if (p) appendPriorityBadge(td, p);
        else {
          td.textContent = "—";
          td.classList.add("tree-metric-muted");
        }
        tr.appendChild(td);
      } else if (leafDims.includes(dim)) {
        appendPivotLeafDimCell(tr, dim, pivotRow[dim]);
      } else {
        appendEmptyPivotDimCell(tr, dim);
      }
    });

    appendPivotMetricCells(tr, {
      condition: pivotRow.condition,
      unitCost: pivotRow.unitCost,
      replacementCost: pivotRow.replacementCost,
      pctTotal: pivotRow.pctTotal || 0,
      // School scores on leaf rows only when School itself is a leaf column.
      ...(leafDims.includes("school")
        ? {
            priorityScore: pivotRow.priorityScore,
            compositeBuildingScore: pivotRow.compositeBuildingScore,
            educationalAdequacyScore: pivotRow.educationalAdequacyScore,
          }
        : {}),
    }, { isGroup: false, level: groupDims.length });

    tbody.appendChild(tr);
  }

  function renderStrategyPivotTree(tbody, flatRows, grandTotal) {
    const hierarchy = getStrategyPivotVisibleHierarchyOrder();
    const groupDims = getStrategyPivotGroupDims();
    const tree = buildStrategyPivotTree(flatRows, grandTotal);
    sortPivotTreeNodes(tree);
    lastStrategyPivotTree = tree;
    tree.forEach((node) => {
      if (node.type === "group") {
        appendStrategyPivotGroupRow(tbody, node, hierarchy, groupDims, grandTotal);
      } else {
        appendStrategyPivotLeafRow(tbody, node.data, hierarchy, groupDims);
      }
    });
  }

  function collectLeavesFromPivotNode(node, out) {
    if (node.type === "leaf") {
      out.push(node.data);
      return;
    }
    (node.children || []).forEach((c) => collectLeavesFromPivotNode(c, out));
  }

  function buildStrategyPivotBaseFields(strategyGroup, school, r) {
    return {
      strategyGroup,
      projectCategory: school.decisionOutcome || "Unknown",
      projectType: displayProjectTypeLabel(r) || "Unknown",
      school: displaySchoolName(school.name),
      systemCategory: displaySystemCategoryLabel(r?.SystemCategory) || "—",
      priority: getPriorityForRow(r) || "—",
    };
  }

  /** Individual project labels for strategy leaves; otherwise the project type. */
  function expandStrategyPivotProjectLabels(r) {
    const fallback = displayProjectTypeLabel(r) || "Unknown";
    if (!r || !isFacilitiesDeficiencySystemCategory(r.SystemCategory)) return [fallback];
    if (r.__facilityDeficiencyLineItem) {
      return [norm(r.__masterDetailLabel) || fallback];
    }
    if (!facilitiesDeficiencyDetailByFacilitySystem.size) return [fallback];
    const rowP = norm(getPriorityForRow(r));
    const details = getMasterDeficiencyDetailsForAsset([r], r.AssetType).filter((d) => {
      const p = norm(d.__csvPriority || d.PriorityScore);
      return !rowP || p === rowP;
    });
    if (!details.length) return [fallback];
    return details.map((d) => displayProjectTypeLabel(d) || d.__masterDetailLabel || fallback);
  }

  /**
   * Expand a school project row into strategy-pivot leaf entries.
   * Facility Deficiency line items are expanded lazily when a Project Type group opens.
   */
  function expandStrategyPivotEntries(strategyGroup, school, r, grandTotal) {
    const baseFields = buildStrategyPivotBaseFields(strategyGroup, school, r);
    const cs = isSiteInfrastructureRow(r)
      ? null
      : parseNumberMaybe(getCellValue(r, "ConditionScore"));
    const uc = parseNumberMaybe(getCellValue(r, "UnitCost"));
    const fields = {
      ...baseFields,
      project: baseFields.projectType,
    };
    if (!strategyPivotFieldsPassColumnFilters(fields)) return [];
    const rc = computeIncludedReplacementCost([r]);
    const schoolScores = getSchoolScoreMetricsForLabel(baseFields.school, strategyGroup);
    return [
      {
        ...fields,
        ...schoolScores,
        condition: cs,
        unitCost: uc,
        replacementCost: rc,
        pctTotal: grandTotal > 0 ? (rc / grandTotal) * 100 : 0,
        row: r,
      },
    ];
  }

  function buildLazyStrategyFdProjectLeaves(node, grandTotal) {
    const assetRows = [];
    (node.rows || []).forEach((pr) => {
      if (pr?.row) assetRows.push(pr.row);
    });
    if (!assetRows.length) return [];
    const assetType = norm(node.label) || displayProjectTypeLabel(assetRows[0]);
    const sample = node.rows[0] || {};
    const details = getMasterDeficiencyDetailsForAsset(assetRows, assetType);
    const included = getIncludedPriorities();
    const out = [];
    details.forEach((d) => {
      const projectLabel = displayProjectTypeLabel(d) || d.__masterDetailLabel || assetType;
      if (!strategyPivotColumnValuePasses("project", projectLabel)) return;
      const p = norm(d.__csvPriority || d.PriorityScore);
      if (p && included.size && !included.has(p)) return;
      const detailRow = {
        ...d,
        UniqueID: assetRows[0].UniqueID || d.UniqueID,
        SchoolName: assetRows[0].SchoolName || d.SchoolName,
        JeffCoFacilityID: assetRows[0].JeffCoFacilityID || d.JeffCoFacilityID,
        __excludedFromTotals: assetRows.some((r) => r && r.__excludedFromTotals),
      };
      const rc = computeIncludedReplacementCost([detailRow]);
      out.push({
        strategyGroup: sample.strategyGroup,
        projectCategory: sample.projectCategory,
        projectType: assetType,
        project: projectLabel,
        school: sample.school,
        systemCategory: sample.systemCategory,
        priority: p || sample.priority,
        condition: null,
        unitCost: null,
        replacementCost: rc,
        pctTotal: grandTotal > 0 ? (rc / grandTotal) * 100 : 0,
        row: detailRow,
      });
    });
    return out;
  }

  function strategyPivotSourceRowPassesFilters(strategyGroup, school, r, skipPriority) {
    if (!projectRowPassesActiveFilters(r)) return false;
    const baseFields = buildStrategyPivotBaseFields(strategyGroup, school, r);
    const projectActive = isStrategyPivotColumnFilterActive("project");
    const skipKeys = new Set();
    if (skipPriority) skipKeys.add("priority");
    if (projectActive) {
      const labels = expandStrategyPivotProjectLabels(r);
      if (!labels.some((label) => strategyPivotColumnValuePasses("project", label))) return false;
      skipKeys.add("project");
    } else {
      baseFields.project = baseFields.projectType;
    }
    return STRATEGY_PIVOT_FILTERABLE_KEYS.every((key) => {
      if (skipKeys.has(key)) return true;
      return strategyPivotColumnValuePasses(key, baseFields[key]);
    });
  }

  function buildStrategyPivotRows(groupIndex, grandTotal) {
    const rows = [];
    STRATEGY_GROUP_ORDER.forEach((strategyGroup) => {
      const schools = groupIndex.get(strategyGroup) || [];
      schools.forEach((school) => {
        (school.rows || []).forEach((r) => {
          if (!projectRowPassesActiveFilters(r)) return;
          expandStrategyPivotEntries(strategyGroup, school, r, grandTotal).forEach((entry) => {
            rows.push(entry);
          });
        });
      });
    });
    sortStrategyPivotRows(rows);
    return rows;
  }

  function appendStrategyPivotRow(tbody, pivotRow) {
    appendStrategyPivotLeafRow(
      tbody,
      pivotRow,
      getStrategyPivotHierarchyOrder(),
      getStrategyPivotGroupDims()
    );
  }

  function computeIncludedReplacementCost(rows) {
    const included = getIncludedPriorities();
    let total = 0;
    (rows || []).forEach((r) => {
      if (!r || r.__excludedFromTotals) return;
      const rc = parseNumberMaybe(r?.ReplacementCost);
      if (rc === null) return;
      const p = norm(getPriorityForRow(r));
      if (included.has(p)) total += rc;
    });
    return total;
  }

  function getStrategyPivotGrandTotal(groupIndex) {
    const allRows = [];
    STRATEGY_GROUP_ORDER.forEach((strategyGroup) => {
      const schools = groupIndex.get(strategyGroup) || [];
      schools.forEach((school) => {
        (school.rows || []).forEach((r) => {
          if (!strategyPivotSourceRowPassesFilters(strategyGroup, school, r, false)) return;
          allRows.push(r);
        });
      });
    });
    return computeIncludedReplacementCost(allRows);
  }

  function appendTreeConditionPill(cell, value) {
    if (value === null || value === undefined) {
      cell.textContent = "—";
      cell.classList.add("tree-metric-muted");
      return;
    }
    const pill = document.createElement("span");
    pill.className = "tree-condition-pill";
    const v = Math.round(value * 10) / 10;
    pill.textContent = v.toFixed(1);
    if (v <= 2.5) pill.classList.add("is-poor");
    else if (v <= 3.5) pill.classList.add("is-fair");
    else pill.classList.add("is-good");
    cell.appendChild(pill);
  }

  function appendTreePctBar(cell, pct) {
    const wrap = document.createElement("div");
    wrap.className = "tree-pct-wrap";
    const label = document.createElement("span");
    label.className = "tree-pct-label";
    label.textContent = `${(Math.round(pct * 10) / 10).toFixed(1)}%`;
    const bar = document.createElement("div");
    bar.className = "tree-pct-bar";
    const fill = document.createElement("div");
    fill.className = "tree-pct-fill";
    fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    bar.appendChild(fill);
    wrap.appendChild(label);
    wrap.appendChild(bar);
    cell.appendChild(wrap);
  }

  function updateStrategyGroupSummaryHeader(groupIndex) {
    // Apply all column filters except Priority so unchecked priorities stay visible (greyed).
    const allRows = [];
    STRATEGY_GROUP_ORDER.forEach((strategyGroup) => {
      const schools = groupIndex.get(strategyGroup) || [];
      (schools || []).forEach((school) => {
        (school.rows || []).forEach((r) => {
          if (!strategyPivotSourceRowPassesFilters(strategyGroup, school, r, true)) return;
          allRows.push(r);
        });
      });
    });
    const t = computeReplacementTotalsByPriority(allRows);
    const included = getIncludedPriorities();
    setPrioritySummaryCostEl(elTotalP1Cost, t["1"], included.has("1"));
    setPrioritySummaryCostEl(elTotalP2Cost, t["2"], included.has("2"));
    setPrioritySummaryCostEl(elTotalP3Cost, t["3"], included.has("3"));
    setPrioritySummaryCostEl(elTotalP4Cost, t["4"], included.has("4"));
    let total = 0;
    ["1", "2", "3", "4"].forEach((p) => {
      if (included.has(p)) total += t[p] || 0;
    });
    if (elTotalReplacementCost) {
      elTotalReplacementCost.textContent = total ? formatLocaleUsdInteger(Math.round(total)) : "—";
    }
  }

  function renderStrategyGroupView() {
    if (!elTableMount) return;
    closeAllPivotColumnFilterMenus();
    clearTableMountContent();
    // Strategy view uses per-column AutoFilters; hide the legacy search/filter bar.
    parkTableFilterBar();
    mountHierarchyLegend(true);
    populateStrategyScopeFilters();

    const groupIndex = buildStrategyGroupIndex();
    syncStrategyPivotFilterState(buildStrategyPivotFilterCatalog(groupIndex));
    syncPriorityIncludeCheckboxesFromColumnFilter();
    updateStrategyGroupSummaryHeader(groupIndex);
    elExportBtn.disabled = false;
    syncTurnOnAllRowsWithValuesToggle();

    const grandTotal = getStrategyPivotGrandTotal(groupIndex);
    const pivotRows = buildStrategyPivotRows(groupIndex, grandTotal);
    const wrap = document.createElement("div");
    wrap.className = "portfolio-table-wrap";

    const table = document.createElement("table");
    table.className = "strategy-pivot-table portfolio-tree-table wrike-tree-table";
    const columns = getStrategyPivotColumns();
    const colgroup = document.createElement("colgroup");
    columns.forEach((col) => {
      const colEl = document.createElement("col");
      const w = getStrategyPivotColWidth(col.key);
      colEl.dataset.colKey = col.key;
      colEl.style.width = `${w}px`;
      colEl.style.minWidth = `${w}px`;
      colEl.style.maxWidth = `${w}px`;
      colgroup.appendChild(colEl);
    });
    table.appendChild(colgroup);
    const thead = buildStrategyPivotTableHeader();
    table.appendChild(thead);
    applyStrategyPivotTableWidths(table);

    if (!pivotRows.length) {
      wrap.appendChild(table);
      elTableMount.appendChild(wrap);
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No projects match the current filters for facilities in scope.";
      elTableMount.appendChild(empty);
      return;
    }

    const tbody = document.createElement("tbody");
    renderStrategyPivotTree(tbody, pivotRows, grandTotal);
    table.appendChild(tbody);
    wrap.appendChild(table);
    elTableMount.appendChild(wrap);
  }

  function formatStrategyPivotExportCell(colKey, pivotRow) {
    if (!pivotRow) return "";
    if (colKey === "priority") {
      return formatStrategyPivotDimDisplay("priority", pivotRow.priority);
    }
    if (
      colKey === "strategyGroup" ||
      colKey === "projectCategory" ||
      colKey === "projectType" ||
      colKey === "project" ||
      colKey === "school" ||
      colKey === "systemCategory"
    ) {
      const v = pivotRow[colKey];
      if (v == null || v === "" || v === "—") return "";
      return formatStrategyPivotDimDisplay(colKey, v);
    }
    if (colKey === "condition") {
      return pivotRow.condition != null && pivotRow.condition !== undefined
        ? String(pivotRow.condition)
        : "";
    }
    if (
      colKey === "priorityScore" ||
      colKey === "compositeBuildingScore" ||
      colKey === "educationalAdequacyScore"
    ) {
      const scores = getSchoolScoreMetricsForLabel(
        pivotRow.school,
        pivotRow.strategyGroup
      );
      return formatSchoolScoreMetric(colKey, scores[colKey]);
    }
    if (colKey === "unitCost") {
      return pivotRow.unitCost != null && pivotRow.unitCost !== undefined
        ? formatDisplayUnitCostCell(String(pivotRow.unitCost))
        : "";
    }
    if (colKey === "replacementCost") {
      return pivotRow.replacementCost
        ? formatLocaleUsdInteger(Math.round(pivotRow.replacementCost))
        : "";
    }
    if (colKey === "pctTotal") {
      const pct = Number(pivotRow.pctTotal) || 0;
      return `${(Math.round(pct * 10) / 10).toFixed(1)}%`;
    }
    return pivotRow[colKey] != null ? String(pivotRow[colKey]) : "";
  }

  /**
   * Export leaf rows as currently shown: same filters, column set/order, sort, and display values.
   * (Collapsed groups still export their leaf projects — same filtered set as the table.)
   */
  function collectStrategyGroupExportRows(_includeCollapsed) {
    const groupIndex = buildStrategyGroupIndex();
    const grandTotal = getStrategyPivotGrandTotal(groupIndex);
    const pivotRows = buildStrategyPivotRows(groupIndex, grandTotal);
    const columns = getStrategyPivotColumns();
    return {
      fields: columns.map((c) => c.label),
      data: pivotRows.map((pr) => columns.map((col) => formatStrategyPivotExportCell(col.key, pr))),
    };
  }

  function downloadStrategyGroupCsv(includeCollapsed) {
    const { fields, data } = collectStrategyGroupExportRows(includeCollapsed);
    if (!data.length) {
      alert("No rows to export for the current filters and scope.");
      return;
    }
    const csv = Papa.unparse({ fields, data }, { quotes: true });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "school-projects-strategy-view.csv";
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  }

  function setListViewMode(mode) {
    listViewMode = mode === "strategy" ? "strategy" : "school";
    try {
      if (window.localStorage) {
        window.localStorage.setItem(LIST_VIEW_STORAGE_KEY, listViewMode);
      }
    } catch {
      // ignore
    }
    const schoolPicker = document.getElementById("schoolMultiSelect");
    const viewToggleSchool = document.getElementById("listViewModeSchool");
    const viewToggleStrategy = document.getElementById("listViewModeStrategy");
    if (viewToggleSchool) viewToggleSchool.classList.toggle("is-active", listViewMode === "school");
    if (viewToggleStrategy) viewToggleStrategy.classList.toggle("is-active", listViewMode === "strategy");

    if (listViewMode === "strategy") {
      strategyGroupCache = null;
      refreshSchoolMetaStripForSelection();
      renderStrategyGroupView();
      return;
    }
    if (selectedSchoolUids.size) applyMultiSchoolSelection();
    else {
      clearTableMountContent();
      parkTableFilterBar();
      parkHierarchyLegend();
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No school selected.";
      elTableMount.appendChild(empty);
      elExportBtn.disabled = true;
    }
  }

  function render() {
    if (listViewMode === "strategy") {
      renderStrategyGroupView();
      return;
    }
    clearTableMountContent();
    mountTableFilterBar();
    mountHierarchyLegend(false);

    if (!viewRows.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No assets/projects match the current filters.";
      elTableMount.appendChild(empty);
      updateTotalReplacementCostDisplay();
      syncTurnOnAllRowsWithValuesToggle();
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
      th.className = "is-sortable";
      if (sortState.key === col) th.classList.add("is-sorted");
      const displayName = COL_DISPLAY_NAMES[col] || col;
      const label = document.createElement("span");
      label.className = "th-label";
      label.textContent = displayName;
      th.appendChild(label);
      const indicator = document.createElement("span");
      indicator.className = "sort-indicator";
      if (sortState.key === col) indicator.textContent = sortState.dir === "asc" ? "▲" : "▼";
      th.appendChild(indicator);
      th.title = "Sort by " + displayName;
      th.addEventListener("click", () => {
        if (sortState.key === col) {
          sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
        } else {
          sortState.key = col;
          sortState.dir = "desc";
        }
        applyFilters();
        render();
      });
      trh.appendChild(th);
    });

    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    const superGroupMap = new Map();
    viewRows.forEach((g) => {
      const sgKey = getSuperGroupKey(g.__group) || g.__group;
      if (!superGroupMap.has(sgKey)) superGroupMap.set(sgKey, []);
      superGroupMap.get(sgKey).push(g);
    });

    const orderedSuperKeys = [];
    const hasSelectedProjects = collectSelectedMirrorRows().length > 0;
    SUPER_GROUP_DISPLAY_ORDER.forEach((k) => {
      if (k === SELECTED_PROJECTS_SUPER_LABEL) {
        if (hasSelectedProjects) orderedSuperKeys.push(k);
        return;
      }
      if (k === PROJECT_CALC_SUPER_LABEL) {
        // Parent always shown when the table has content (children include empty templates).
        orderedSuperKeys.push(k);
        return;
      }
      if (EMPTY_TEMPLATE_SUPER_LABELS.has(k) || superGroupMap.has(k)) {
        orderedSuperKeys.push(k);
      }
    });

    orderedSuperKeys.forEach((sgKey) => {
      if (sgKey === SELECTED_PROJECTS_SUPER_LABEL) {
        appendSelectedProjectsSection(tbody);
        return;
      }

      if (sgKey === PROJECT_CALC_SUPER_LABEL) {
        const calcExpanded = appendProjectCalculatorParentBanner(tbody);
        if (calcExpanded) {
          appendSchoolViewSectionGroups(tbody, EDUCATIONAL_ADEQUACY_SUPER_LABEL, {
            groups: superGroupMap.get(EDUCATIONAL_ADEQUACY_SUPER_LABEL) || [],
            skipSuperBanner: true,
            nestUnderProjectCalc: true,
          });
        }
        return;
      }

      if (EMPTY_TEMPLATE_SUPER_LABELS.has(sgKey)) {
        appendEmptyTemplateSection(tbody, sgKey);
        return;
      }

      appendSchoolViewSectionGroups(tbody, sgKey, {
        groups: superGroupMap.get(sgKey) || [],
        skipSuperBanner: false,
        nestUnderProjectCalc: false,
      });
    });

    table.appendChild(tbody);
    const wrap = document.createElement("div");
    wrap.className = "portfolio-table-wrap";
    wrap.appendChild(table);
    elTableMount.appendChild(wrap);

    updateTotalReplacementCostDisplay();
    syncTurnOnAllRowsWithValuesToggle();
  }

  /**
   * Render one top-level section's category groups + rows.
   * Educational Adequacy uses skipSuperBanner + nestUnderProjectCalc so categories
   * sit directly under Project Calculator with no EA banner.
   */
  function appendSchoolViewSectionGroups(tbody, sgKey, { groups, skipSuperBanner, nestUnderProjectCalc }) {
      if (!groups || !groups.length) return;
      const isSuperGroup =
        !skipSuperBanner &&
        (groups.length > 1 || (getSuperGroupKey(groups[0].__group) !== null && groups[0].__group !== sgKey));
      const isSuperCollapsed = collapsedSuperGroups.has(sgKey);

      if (isSuperGroup) {
        const superByP = { "1": 0, "2": 0, "3": 0, "4": 0 };
        groups.forEach((g) => {
          const gp = computeGroupByP(g.__rows);
          ["1", "2", "3", "4"].forEach((p) => {
            superByP[p] += gp[p];
          });
        });
        const superTotal = superByP["1"] + superByP["2"] + superByP["3"] + superByP["4"];

        const sgTr = document.createElement("tr");
        sgTr.className = superGroupRowClassName(sgKey, isSuperCollapsed);
        sgTr.appendChild(createBannerToggleCell());
        sgTr.appendChild(createBannerLabelCell(sgKey));
        sgTr.appendChild(createBannerSubtotalCell(superTotal, superByP));
        sgTr.addEventListener("click", () => {
          closePivotGroupChevronMenu();
          if (collapsedSuperGroups.has(sgKey)) collapsedSuperGroups.delete(sgKey);
          else collapsedSuperGroups.add(sgKey);
          render();
        });
        wireSchoolViewCollapseMenu(sgTr, {
          levelLabel: "section",
          onCollapseAll: () => setSchoolViewSectionBannersCollapsed(true),
          onExpandAll: () => setSchoolViewSectionBannersCollapsed(false),
        });
        tbody.appendChild(sgTr);

        if (isSuperCollapsed) return;
      }

      const isFciParent = sgKey === FACILITY_DEFICIENCY_SUPER_LABEL;
      const isSafetyParent = sgKey === SAFETY_SECURITY_SUPER_LABEL;
      /** Safety inventory has one category; Facility Deficiency keeps its category level for hierarchy alignment. */
      const skipFciSubcategoryBanner = isSafetyParent && groups.length === 1;

      groups.forEach((g) => {

      const groupKey = g.__group;
      const isCollapsed = skipFciSubcategoryBanner ? false : collapsedGroups.has(groupKey);

      const groupByP = computeGroupByP(g.__rows);
      const groupSubtotal = groupByP["1"] + groupByP["2"] + groupByP["3"] + groupByP["4"];

      if (!skipFciSubcategoryBanner) {
        const groupTr = document.createElement("tr");
        groupTr.className =
          "group-row" +
          (isCollapsed ? " collapsed" : "") +
          (nestUnderProjectCalc ? " project-calc-child" : "");
        groupTr.appendChild(createBannerToggleCell());
        groupTr.appendChild(createBannerLabelCell(displaySystemCategoryLabel(groupKey)));
        groupTr.appendChild(createBannerSubtotalCell(groupSubtotal, groupByP));
        groupTr.addEventListener("click", () => {
          closePivotGroupChevronMenu();
          if (collapsedGroups.has(groupKey)) collapsedGroups.delete(groupKey);
          else collapsedGroups.add(groupKey);
          render();
        });
        wireSchoolViewCollapseMenu(groupTr, {
          levelLabel: "category",
          onCollapseAll: () => setSchoolViewCategoryGroupsCollapsed(true),
          onExpandAll: () => setSchoolViewCategoryGroupsCollapsed(false),
        });
        tbody.appendChild(groupTr);

        if (isCollapsed) return;
      }

      // Insert Building Addition planning helper under the 01_new construction group header
      if (additionPlanningState.show && norm(g.__group).toLowerCase() === "01_new construction") {
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
        const isCollapsed = !!additionPlanningState.collapsed;
        const planDecision = getDecisionForResolvedSchool();
        const r2 = getAdditionStoryRatePerSf(2, planDecision);
        const story2RateLabel = formatAdditionRateLabel(r2 !== null ? r2 : ADDITION_STORY_FALLBACK_SF);
        const ncLabel = (() => {
          const p = getAdditionBaseNewConstructionProject(planDecision);
          if (p === "New construction ES") return "ES new-school rate";
          if (p === "New construction MS") return "MS new-school rate";
          if (p === "New construction HS") return "HS new-school rate";
          if (p === "New construction K-8") return "K–8 new-school rate";
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
          `<div class="addition-note">2-story addition rate (${escapeHtmlText(ncLabel)}): <strong>$${story2RateLabel}/SF</strong></div>` +
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
            closePivotGroupChevronMenu();
            if (isSiteInfra) {
              if (expandedFciSiteInfraAssets.has(collapseKey)) expandedFciSiteInfraAssets.delete(collapseKey);
              else expandedFciSiteInfraAssets.add(collapseKey);
            } else if (collapsedFciAssets.has(collapseKey)) collapsedFciAssets.delete(collapseKey);
            else collapsedFciAssets.add(collapseKey);
            render();
          });
          wireSchoolViewCollapseMenu(rollupTr, {
            levelLabel: "asset",
            onCollapseAll: () => setSchoolViewFciAssetsCollapsed(true),
            onExpandAll: () => setSchoolViewFciAssetsCollapsed(false),
          });
          const masterDetails = getMasterDeficiencyDetailsForAsset(assetRows, at);
          if (masterDetails.length) {
            const rollupProxy = {
              __isRollup: true,
              __rollupRows: assetRows,
              SystemCategory: assetRows[0] && assetRows[0].SystemCategory,
              AssetType: at,
            };
            rollupToggleTd.appendChild(createRowIncludeToggleControl(rollupProxy));
          }
          tbody.appendChild(rollupTr);

          if (!isAssetCollapsed) {
            if (masterDetails.length) {
              masterDetails.forEach((d) => renderFciMasterDetailRow(d));
            } else {
              assetRows.forEach((r) => renderSingleRow(r));
            }
          }
        });
      } else {
        g.__rows.forEach((r) => renderSingleRow(r));
      }

      function renderFciMasterDetailRow(d) {
        const tr = document.createElement("tr");
        tr.className = "fci-leaf-row fci-detail-row";
        const toggleTd = document.createElement("td");
        toggleTd.className = "col-include-toggle fci-rollup-toggle-spacer";
        tr.appendChild(toggleTd);
        DISPLAY_COLS.forEach((col) => {
          const cell = document.createElement("td");
          if (col === "Project Type") {
            cell.classList.add("project-type-cell");
            const label = displayProjectTypeLabel(d);
            cell.textContent = label;
            const tipParts = [
              d.__masterBuilding ? `Building: ${d.__masterBuilding}` : "",
              d.__masterScope || "",
              d.__masterDeficiencyId ? `ID ${d.__masterDeficiencyId}` : "",
            ].filter(Boolean);
            if (tipParts.length) cell.title = tipParts.join("\n");
            else cell.title = label;
          } else if (col === "Priority") {
            cell.textContent = getPriorityForRow(d) || "—";
            cell.style.textAlign = "center";
          } else if (col === "ConditionScore") {
            cell.classList.add("condition-score-cell");
            const bldg = norm(d.__masterBuilding || d.ConditionScore);
            cell.textContent = bldg || "";
            if (!bldg) cell.classList.add("muted");
            else cell.title = bldg;
          } else if (col === "ReplacementCost") {
            cell.textContent = norm(d.ReplacementCost) || "";
            cell.title = cell.textContent;
          } else if (col === "UnitValue") {
            cell.textContent = norm(d.UnitValue) || "";
            if (!cell.textContent) cell.classList.add("muted");
          } else {
            cell.textContent = "";
            cell.classList.add("muted");
          }
          tr.appendChild(cell);
        });
        tbody.appendChild(tr);
      }

      function renderSingleRow(r) {
        const tr = document.createElement("tr");
        if (isFciParent) tr.classList.add("fci-leaf-row");
        if (r && r.__excludedFromTotals) {
          tr.classList.add("excluded-row");
          if (r.__excludedReason === "level") tr.classList.add("excluded-level");
          if (r.__excludedReason === "good" || r.__excludedReason === "modernization_tier") tr.classList.add("excluded-good");
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
              const isSiteInfraRollup = isFacilitiesDeficiencySystemCategory(rollupSys);
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
            const assetType = norm(r?.AssetType).toLowerCase();
            const isDemolition = assetType === "demolition";

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
                  span.textContent = "No deficiency score — new building.";
                  span.title =
                    "There is no facilities deficiency score for this category because this campus includes a new building.";
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
              cell.textContent = norm(v) ? norm(v) : "—";
              cell.title = norm(v);
              if (
                isAssetLifeCycle07Row(r) &&
                (col === "UnitValue" || col === "ReplacementCost") &&
                norm(v) === "None"
              ) {
                cell.classList.add("muted");
              }
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

            // Safety & Security / FCI (07/08): grey out UnitCost, UnitValue (condition column muted inside widget)
            if (isFciParent && (col === "UnitCost" || col === "UnitValue")) {
              cell.classList.add("muted");
            }
          }
          tr.appendChild(cell);
        });
        tbody.appendChild(tr);
      }

      }); // end groups.forEach
  }

  function populateStrategyScopeFilters() {
    if (listViewMode !== "strategy") return;
    const prevSystems = elSystemDropdown ? getMultiSelectValues(elSystemDropdown, "system-filter-cb") : new Set();
    const prevAssets = elAssetDropdown ? getMultiSelectValues(elAssetDropdown, "asset-filter-cb") : new Set();
    const groupIndex = buildStrategyGroupIndex();
    const scopeRows = [];
    groupIndex.forEach((schools) => {
      (schools || []).forEach((school) => {
        (school.rows || []).forEach((r) => scopeRows.push(r));
      });
    });
    const systems = uniqueSorted(scopeRows.map((r) => r.SystemCategory)).map((sc) => ({
      value: sc,
      label: displaySystemCategoryLabel(sc),
    }));
    const assets = uniqueSorted(scopeRows.map((r) => r.AssetType)).map((a) => ({
      value: a,
      label: displayProjectTypeLabel({ AssetType: a }),
    }));
    if (elSystemDropdown) {
      buildMultiSelectDropdown(elSystemDropdown, systems, "system-filter-cb");
      if (prevSystems.size) restoreMultiSelectState(elSystemDropdown, "system-filter-cb", prevSystems, elSystemLabel);
      else updateMultiSelectLabel(elSystemDropdown, "system-filter-cb", elSystemLabel);
    }
    if (elAssetDropdown) {
      buildMultiSelectDropdown(elAssetDropdown, assets, "asset-filter-cb");
      if (prevAssets.size) restoreMultiSelectState(elAssetDropdown, "asset-filter-cb", prevAssets, elAssetLabel);
      else updateMultiSelectLabel(elAssetDropdown, "asset-filter-cb", elAssetLabel);
    }
    updatePriorityFilterLabel();
  }

  function populateFilters() {
    const prevSystems = elSystemDropdown ? getMultiSelectValues(elSystemDropdown, "system-filter-cb") : new Set();
    const prevAssets = elAssetDropdown ? getMultiSelectValues(elAssetDropdown, "asset-filter-cb") : new Set();

    const systems = uniqueSorted(schoolRows.map((r) => r.SystemCategory)).map((sc) => ({
      value: sc,
      label: displaySystemCategoryLabel(sc),
    }));
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
    cbs.forEach((cb) => allValues.add(norm(cb.value)));
    const stillValid = new Set([...prevSelected].map(norm).filter((v) => allValues.has(v)));
    if (stillValid.size && stillValid.size < allValues.size) {
      cbs.forEach((cb) => { cb.checked = stillValid.has(norm(cb.value)); });
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
    lastContextKeyForDefaultGroupCollapse = "";
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
      syncTurnOnAllRowsWithValuesToggle();
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
      applyRoomScheduleUnitValues(rows, uid, nm, decision, profileProjectSchoolName);
      hydrateAdaComplianceUnitValue(rows, decision);
      hydrateManualQtyOverrides(rows);
      hydratePlaygroundDefaultPlanningSf(rows);

      const schoolDecision = decision ? evaluateSchoolDecision(decision, getActiveThresholds()) : "";
      const schoolOutcome = (schoolDecision || "").trim();
      const keepBlackOutcomes = [
        "Major Capital Investment",
        "Welcoming School with Capital Investment",
        "Building Addition with Capital Investment",
      ];
      // Former gut-reno outcomes (Major Cap / Welcoming Cap) cost via full-building New construction by level.
      // Building Addition uses the planner helper under 01_new construction (not full-building NC).
      const schoolNeedsGutReno = keepBlackOutcomes.includes(schoolOutcome);
      const schoolNeedsNewConstruction =
        ["Major Capital Investment", "Welcoming School with Capital Investment"].includes(schoolOutcome) ||
        ["Building Replacement", "Welcoming School with Building Replacement"].includes(schoolOutcome) ||
        schoolOutcome.toLowerCase().includes("demolition");

      rows.forEach((r) => {
        r.__schoolLabel = nm;
        r.__rowId = rowId++;
        const systemCategory = norm(r?.SystemCategory);

        if (systemCategory === "01_new construction" && !isRelevantNewConstructionRow(r, decision)) {
          r.__hiddenBySchoolLevel = true;
          return;
        }
        if (!isRelevantPlaygroundRow(r, decision)) {
          r.__hiddenBySchoolLevel = true;
          return;
        }
        if (!isRelevantFurnitureUpgradeRow(r, decision)) {
          r.__hiddenBySchoolLevel = true;
          return;
        }
        if (!isRelevantCampusTurfRow(r, decision)) {
          r.__hiddenBySchoolLevel = true;
          return;
        }
        if (!isRelevantModernizationRow(r, decision)) {
          r.__hiddenBySchoolLevel = true;
          return;
        }
        if (!isRelevantSecurityPackageRow(r, decision)) {
          r.__hiddenBySchoolLevel = true;
          return;
        }

        if (systemCategory === "01_new construction" && !schoolNeedsNewConstruction && isFullBuildingNewConstructionAsset(r.AssetType)) {
          r.__excludedFromTotals = true;
          r.__excludedReason = "decision";
          r.UnitValue = "";
          r.ReplacementCost = "Not included";
          return;
        }

        const isAlcForGutNc = isAssetLifeCycleCategoryForGutNcGate(systemCategory);
        if ((schoolNeedsGutReno || schoolNeedsNewConstruction) && !isInDecisionGutOrNcProjectScope(systemCategory)) {
          if (!(isAlcForGutNc && getIncludeFciForMajor())) {
            r.__excludedFromTotals = true;
            r.__excludedReason = "decision";
          }
        }

        const lib = unitCostIndex ? unitCostIndex.get(makeUnitCostKey(r.SystemCategory, r.AssetType)) : null;
        let computed = deriveNewConstructionConditionScore(r, schoolNeedsNewConstruction);
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
            if (!isModernizationSystemCategory(systemCategory)) {
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
      suppressUnselectedModernizationTiers(rows);
      suppressLowerSecurityPackageLevelsWhenHigherIncluded(rows);
      applySiteSpecificReplacementCostLabels(rows);
      applyManualQtySiteSpecificLabels(rows);
      applyFurnitureUpgradesLumpSumReplacementCosts(rows, decision);

      snapshotNaturalRowIncludeState(rows);
      pruneRowIncludeToggleOverridesAgainstDefaults(rows);
      applyRowIncludeToggleOverrides(rows);

      combined.push(...rows.filter((r) => !r.__hiddenBySchoolLevel));
    });

    const SITE_INFRA_CATS = new Set([
      "08_facilities deficiency",
      "08_facilities deficiency_new",
      "08_site infrastructure",
      "08_site infrastructure_new",
    ]);
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
        !isPercent && isModernizationSystemCategory(sysFirst);

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
    elSchoolNameHeader.textContent = names.length <= 3 ? names.map(displaySchoolName).join(", ") : `${names.length} Facilities`;
    elSchoolMeta.textContent = `${names.length} facilities selected`;

    populateFilters();
    applyFilters();
    render();
    elExportBtn.disabled = !schoolRows.length;
  }

  function downloadFilteredCsv() {
    if (listViewMode === "strategy") {
      downloadStrategyGroupCsv(false);
      return;
    }
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
    if (listViewMode === "strategy") {
      alert("PDF export is available in By school view. Use Excel for the Custom layout.");
      return;
    }
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
      const rawG = norm(sec.groupKey);
      const isSuperBanner =
        rawG === SELECTED_PROJECTS_SUPER_LABEL ||
        rawG === PROJECT_CALC_SUPER_LABEL ||
        rawG === FACILITY_DEFICIENCY_SUPER_LABEL ||
        rawG === SAFETY_SECURITY_SUPER_LABEL ||
        EMPTY_TEMPLATE_SUPER_LABELS.has(rawG);
      const gname = esc(isSuperBanner ? rawG : rawG ? displaySystemCategoryLabel(rawG) : "Uncategorized");
      bodyParts.push(`<tr class="pdf-group"><td colspan="${colCount}">${gname}</td></tr>`);
      if (sec.bannerOnly) {
        // Parent Project Calculator rollup — banner only (EA category detail follows).
        return;
      }
      if (sec.placeholder) {
        estTablePt += Math.max(11, fontPt * 1.15 + 6);
        bodyParts.push(
          `<tr class="pdf-data"><td colspan="${colCount}">${esc(sec.placeholder)}</td></tr>`
        );
      } else if (sec.isFci) {
        (sec.items || []).forEach((it) => {
          if (it.type === "categorySubtotal") {
            pushPdfFciSubtotalRow(
              "category",
              "▼ Subtotal · " + displaySystemCategoryLabel(norm(it.groupKey)),
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
      ? "Facility Deficiency rows included for gut reno / new construction."
      : "Facility Deficiency rows excluded for gut reno / new construction (default). Safety & Security inventory always included.";

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
      additionBlock = `<div class="pdf-add"><strong>Building addition (planning):</strong> Students over capacity: ${esc(so)} · Target GSF: ${esc(gsfT)} · Stories: 2</div>`;
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
<div class="pdf-banner">Jeffco Facility Planning Dashboard · School Profile · Exported ${stamp}</div>
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
<p class="pdf-foot">Export lists only table rows visible with your current expand/collapse state (Selected Projects, Project Calculator, Facility Deficiency, and empty team sections). Grey text = excluded from totals unless the row still shows a dollar replacement amount (then body prints black). Shade structure and new outdoor classroom <strong>Yes</strong> rows print in black (reference cost).${pdfZoomPct < 99 ? ` Print zoom set to ${pdfZoomPct}% to target two pages (Chrome/Edge).` : ""} If a third page appears, reduce print margins slightly.</p>
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

    elExportBtn.disabled = true;

    const columnMapReady =
      typeof window.loadDecisionColumnMap === "function"
        ? window.loadDecisionColumnMap()
        : Promise.resolve();

    elSchoolMeta.textContent = `Loading school summary (${DECISION_CSV_PATH}), projects (${ASSETS_CSV_PATH}), safety & security (${SAFETY_SECURITY_CSV_PATH}), facilities deficiency (${FACILITIES_DEFICIENCY_CSV_PATH}), unit cost library (${UNITCOST_LIBRARY_CSV_PATH}), room schedule (${ROOM_SCHEDULE_CSV_PATH}), and map export (${MAP_EXPORT_CSV_PATH})…`;

    Promise.all([
      columnMapReady,
      parseCsv(DECISION_CSV_PATH),
      parseCsv(ASSETS_CSV_PATH),
      parseCsv(SAFETY_SECURITY_CSV_PATH).catch((err) => {
        console.warn("Safety & Security projects CSV not loaded:", err);
        return [];
      }),
      parseCsv(FACILITIES_DEFICIENCY_CSV_PATH).catch((err) => {
        console.warn("Facilities Deficiency projects CSV not loaded:", err);
        return [];
      }),
      parseCsv(UNITCOST_LIBRARY_CSV_PATH).catch(() => []),
      parseCsv(ROOM_SCHEDULE_CSV_PATH).catch(() => []),
      parseCsv(MAP_EXPORT_CSV_PATH).catch((err) => {
        console.warn("Map export CSV not loaded (articulation areas unavailable):", err);
        return [];
      }),
    ])
      .then(async ([_columnMap, decRows, assetRows, safetySecurityRows, facilitiesDeficiencyRows, unitCostLibRows, roomScheduleRows, mapExportRows]) => {
        decisionRows = decRows || [];
        if (typeof window.applyDecisionColumnMapToRows === "function") {
          window.applyDecisionColumnMapToRows(decRows);
        }
        if (typeof window.normalizeDecisionExportRows === "function") {
          window.normalizeDecisionExportRows(decRows);
        } else if (typeof window.enrichDecisionRowsWithBelow50PctlEa === "function") {
          window.enrichDecisionRowsWithBelow50PctlEa(decRows);
        }
        buildDecisionIndexes(decisionRows);

        unitCostIndex = buildUnitCostLibraryIndex(unitCostLibRows || []);
        roomScheduleSfByBucket = buildRoomScheduleSfTotals(roomScheduleRows || []);
        buildFacilitiesDeficiencyDetailIndex(facilitiesDeficiencyRows || []);

        const safetyRows = normalizeSafetySecurityProjectRows(safetySecurityRows || []);
        // Keep line-item detail in the index; project list / strategy costing use compact rollups.
        const deficiencyRows = normalizeFacilitiesDeficiencyProjectRows(facilitiesDeficiencyRows || []);
        allRows = (Array.isArray(assetRows) ? assetRows : []).concat(safetyRows, deficiencyRows);
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

        const articulationLookups = buildArticulationLookups(mapExportRows || []);
        const schoolOpts = [...decisionOpts, ...csvOnlyOpts]
          .map((o) => ({
            ...o,
            articulation: resolveArticulationAreaLabel(o, articulationLookups),
          }))
          .sort((a, b) => {
            const artCmp = articulationAreaSortKey(a.articulation).localeCompare(
              articulationAreaSortKey(b.articulation),
              undefined,
              { sensitivity: "base", numeric: true }
            );
            if (artCmp) return artCmp;
            return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
          });

        schoolCatalogOpts = schoolOpts;

        const articulationAreaLabels = [];
        {
          const seen = new Set();
          schoolOpts.forEach((o) => {
            const label = o.articulation || UNKNOWN_ARTICULATION_LABEL;
            if (seen.has(label)) return;
            seen.add(label);
            articulationAreaLabels.push(label);
          });
          articulationAreaLabels.sort((a, b) =>
            articulationAreaSortKey(a).localeCompare(articulationAreaSortKey(b), undefined, {
              sensitivity: "base",
              numeric: true,
            })
          );
        }

        // Register school names for global search
        if (typeof window.globalSearchRegisterSchools === "function") {
          window.globalSearchRegisterSchools(schoolOpts.map(function (o) { return o.name; }));
        }

        const elDeficiencyToggle = document.getElementById("deficiencyOnlyToggle");

        if (elSchoolSelectDropdown) {
          elSchoolSelectDropdown.classList.add("excel-filter-menu");

          const searchWrap = document.createElement("div");
          searchWrap.className = "pivot-autofilter-search";
          const searchInput = document.createElement("input");
          searchInput.type = "search";
          searchInput.placeholder = "Search";
          searchInput.setAttribute("aria-label", "Search facilities");
          searchWrap.appendChild(searchInput);
          elSchoolSelectDropdown.appendChild(searchWrap);

          const listEl = document.createElement("div");
          listEl.className = "pivot-autofilter-list";

          const allLabel = document.createElement("label");
          allLabel.className = "pivot-col-filter-item ms-select-all";
          const allCb = document.createElement("input");
          allCb.type = "checkbox";
          allCb.id = "schoolSelectAll";
          allLabel.appendChild(allCb);
          const allLabelText = document.createElement("span");
          allLabelText.textContent = "(Select All)";
          allLabel.appendChild(allLabelText);
          listEl.appendChild(allLabel);

          function updateSelectAllLabel() {
            const targets = getSelectAllTargets();
            const checkedTargets = targets.filter((cb) => cb.checked);
            allCb.checked = checkedTargets.length === targets.length && targets.length > 0;
            allCb.indeterminate = checkedTargets.length > 0 && checkedTargets.length < targets.length;
          }

          let lastArtHeader = null;
          schoolOpts.forEach((o) => {
            if (o.articulation !== lastArtHeader) {
              lastArtHeader = o.articulation;
              const hdr = document.createElement("div");
              hdr.className = "school-articulation-group-header";
              hdr.dataset.articulation = o.articulation;
              hdr.textContent = o.articulation;
              listEl.appendChild(hdr);
            }
            const label = document.createElement("label");
            label.className = "pivot-col-filter-item";
            if (!o.deficiency) label.classList.add("non-deficiency-school");
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.className = "school-cb";
            cb.value = o.uid;
            cb.dataset.name = o.name;
            cb.dataset.deficiency = o.deficiency ? "1" : "0";
            cb.dataset.facilityType = o.facilityType;
            cb.dataset.articulation = o.articulation || UNKNOWN_ARTICULATION_LABEL;
            const isOriginalReport = o.deficiency;
            cb.dataset.originalReport = isOriginalReport ? "1" : "0";
            label.appendChild(cb);
            const nameSpan = document.createElement("span");
            nameSpan.textContent = displaySchoolName(o.name) || o.name || o.uid;
            label.appendChild(nameSpan);
            listEl.appendChild(label);
          });
          elSchoolSelectDropdown.appendChild(listEl);

          const footer = document.createElement("div");
          footer.className = "pivot-autofilter-footer";
          const schoolOkBtn = document.createElement("button");
          schoolOkBtn.type = "button";
          schoolOkBtn.className = "pivot-autofilter-ok";
          schoolOkBtn.id = "schoolScopeOk";
          schoolOkBtn.textContent = "OK";
          const schoolCancelBtn = document.createElement("button");
          schoolCancelBtn.type = "button";
          schoolCancelBtn.className = "pivot-autofilter-cancel";
          schoolCancelBtn.id = "schoolScopeCancel";
          schoolCancelBtn.textContent = "Cancel";
          footer.appendChild(schoolOkBtn);
          footer.appendChild(schoolCancelBtn);
          elSchoolSelectDropdown.appendChild(footer);

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
          const elFacilityScopeOk = document.getElementById("facilityScopeOk");
          const elFacilityScopeCancel = document.getElementById("facilityScopeCancel");
          const elArticulationAreaBtn = document.getElementById("articulationAreaBtn");
          const elArticulationAreaDropdown = document.getElementById("articulationAreaDropdown");
          const elArticulationAreaLabel = document.getElementById("articulationAreaLabel");

          const FACILITY_SCOPE_LABELS = {
            school: "Schools",
            "cte-pathway": "CTE Pathways",
            cte: "CTE",
            athletics: "Athletics",
            oels: "OELs",
            "admin-support": "Admin & Support",
          };

          let schoolMenuDrafting = false;
          let schoolDraftSnapshot = null;
          let facilityMenuDrafting = false;
          let facilityDraftSnapshot = null;
          let articulationMenuDrafting = false;
          let articulationDraftSnapshot = null;
          let articulationAreaCbs = [];
          let articulationSelectAllCb = null;

          function buildArticulationAreaDropdown() {
            if (!elArticulationAreaDropdown) return;
            elArticulationAreaDropdown.innerHTML = "";
            elArticulationAreaDropdown.hidden = true;
            elArticulationAreaDropdown.style.display = "none";

            const listElArt = document.createElement("div");
            listElArt.className = "pivot-autofilter-list";

            const allArtLabel = document.createElement("label");
            allArtLabel.className = "facility-scope-row facility-scope-row--primary pivot-col-filter-item";
            articulationSelectAllCb = document.createElement("input");
            articulationSelectAllCb.type = "checkbox";
            articulationSelectAllCb.checked = true;
            const allArtSpan = document.createElement("span");
            allArtSpan.textContent = "(Select All)";
            allArtLabel.appendChild(articulationSelectAllCb);
            allArtLabel.appendChild(allArtSpan);
            listElArt.appendChild(allArtLabel);

            articulationAreaCbs = [];
            articulationAreaLabels.forEach((areaLabel) => {
              const row = document.createElement("label");
              row.className = "facility-scope-row pivot-col-filter-item";
              const cb = document.createElement("input");
              cb.type = "checkbox";
              cb.className = "articulation-area-cb";
              cb.value = areaLabel;
              cb.checked = true;
              const span = document.createElement("span");
              span.textContent = areaLabel;
              row.appendChild(cb);
              row.appendChild(span);
              listElArt.appendChild(row);
              articulationAreaCbs.push(cb);
            });
            elArticulationAreaDropdown.appendChild(listElArt);

            const footer = document.createElement("div");
            footer.className = "pivot-autofilter-footer";
            const okBtn = document.createElement("button");
            okBtn.type = "button";
            okBtn.className = "pivot-autofilter-ok";
            okBtn.id = "articulationAreaOk";
            okBtn.textContent = "OK";
            const cancelBtn = document.createElement("button");
            cancelBtn.type = "button";
            cancelBtn.className = "pivot-autofilter-cancel";
            cancelBtn.id = "articulationAreaCancel";
            cancelBtn.textContent = "Cancel";
            footer.appendChild(okBtn);
            footer.appendChild(cancelBtn);
            elArticulationAreaDropdown.appendChild(footer);

            function syncArticulationSelectAllState() {
              if (!articulationSelectAllCb) return;
              const n = articulationAreaCbs.length;
              const checked = articulationAreaCbs.filter((cb) => cb.checked).length;
              articulationSelectAllCb.checked = n > 0 && checked === n;
              articulationSelectAllCb.indeterminate = checked > 0 && checked < n;
            }

            articulationSelectAllCb.addEventListener("change", () => {
              const on = !!articulationSelectAllCb.checked;
              articulationAreaCbs.forEach((cb) => {
                cb.checked = on;
              });
              articulationSelectAllCb.indeterminate = false;
              if (!articulationMenuDrafting) {
                updateArticulationAreaLabel();
                applyFacilityVisibility();
              }
            });
            articulationAreaCbs.forEach((cb) => {
              cb.addEventListener("change", () => {
                syncArticulationSelectAllState();
                if (!articulationMenuDrafting) {
                  updateArticulationAreaLabel();
                  applyFacilityVisibility();
                }
              });
            });
            okBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              closeArticulationMenu({ commit: true });
            });
            cancelBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              closeArticulationMenu({ restore: true });
            });
            syncArticulationSelectAllState();
            updateArticulationAreaLabel();
          }

          function updateArticulationAreaLabel() {
            if (!elArticulationAreaLabel) return;
            const selected = articulationAreaCbs.filter((cb) => cb.checked);
            if (!selected.length) {
              elArticulationAreaLabel.textContent = "— Select area —";
              return;
            }
            if (selected.length === articulationAreaCbs.length) {
              elArticulationAreaLabel.textContent = "All articulation areas";
              return;
            }
            if (selected.length <= 2) {
              elArticulationAreaLabel.textContent = selected.map((cb) => cb.value).join(", ");
              return;
            }
            elArticulationAreaLabel.textContent = `${selected.length} areas selected`;
          }

          function getSelectedArticulationAreas() {
            const set = new Set();
            articulationAreaCbs.forEach((cb) => {
              if (cb.checked) set.add(cb.value);
            });
            return set;
          }

          function isArticulationAreaVisible(cb) {
            if (!articulationAreaCbs.length) return true;
            const selected = getSelectedArticulationAreas();
            if (!selected.size) return false;
            if (selected.size === articulationAreaCbs.length) return true;
            return selected.has(cb.dataset.articulation || UNKNOWN_ARTICULATION_LABEL);
          }

          function snapshotArticulationMenu() {
            return {
              areas: articulationAreaCbs.map((cb) => cb.checked),
              allChecked: !!(articulationSelectAllCb && articulationSelectAllCb.checked),
              allIndeterminate: !!(articulationSelectAllCb && articulationSelectAllCb.indeterminate),
            };
          }

          function restoreArticulationMenu(snap) {
            if (!snap) return;
            articulationAreaCbs.forEach((cb, i) => {
              cb.checked = !!snap.areas[i];
            });
            if (articulationSelectAllCb) {
              articulationSelectAllCb.checked = !!snap.allChecked;
              articulationSelectAllCb.indeterminate = !!snap.allIndeterminate;
            }
            updateArticulationAreaLabel();
          }

          function isArticulationMenuOpen() {
            return !!(
              elArticulationAreaDropdown &&
              elArticulationAreaDropdown.style.display !== "none" &&
              elArticulationAreaDropdown.style.display !== ""
            );
          }

          function closeArticulationMenu(opts) {
            if (!elArticulationAreaDropdown || !elArticulationAreaBtn) return;
            const commit = !!(opts && opts.commit);
            const restore = !!(opts && opts.restore);
            if (articulationMenuDrafting) {
              if (commit) {
                updateArticulationAreaLabel();
                applyFacilityVisibility();
              } else if (restore) {
                restoreArticulationMenu(articulationDraftSnapshot);
              }
            }
            articulationMenuDrafting = false;
            articulationDraftSnapshot = null;
            elArticulationAreaDropdown.style.display = "none";
            elArticulationAreaDropdown.hidden = true;
            elArticulationAreaBtn.setAttribute("aria-expanded", "false");
          }

          function openArticulationMenu() {
            closeSchoolMenu({ restore: true });
            closeFacilityMenu({ restore: true });
            articulationDraftSnapshot = snapshotArticulationMenu();
            articulationMenuDrafting = true;
            elArticulationAreaDropdown.hidden = false;
            elArticulationAreaDropdown.style.display = "block";
            elArticulationAreaBtn.setAttribute("aria-expanded", "true");
          }

          buildArticulationAreaDropdown();

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

          function applyFacilityScopeDraftRules() {
            syncFacilityScopeCategoriesDimming();
          }

          function snapshotSchoolMenu() {
            const schools = {};
            schoolCbs.forEach((cb) => { schools[cb.value] = cb.checked; });
            return {
              schools,
              allChecked: allCb.checked,
              allIndeterminate: allCb.indeterminate,
            };
          }

          function restoreSchoolMenu(snap) {
            if (!snap) return;
            schoolCbs.forEach((cb) => { cb.checked = !!snap.schools[cb.value]; });
            allCb.checked = !!snap.allChecked;
            allCb.indeterminate = !!snap.allIndeterminate;
          }

          function snapshotFacilityMenu() {
            return {
              deficiency: !!(elDeficiencyToggle && elDeficiencyToggle.checked),
              types: facilityTypeCbs.map((cb) => cb.checked),
            };
          }

          function restoreFacilityMenu(snap) {
            if (!snap) return;
            if (elDeficiencyToggle) elDeficiencyToggle.checked = !!snap.deficiency;
            facilityTypeCbs.forEach((cb, i) => { cb.checked = !!snap.types[i]; });
            applyFacilityScopeDraftRules();
          }

          function isSchoolMenuOpen() {
            return elSchoolSelectDropdown.style.display !== "none" && elSchoolSelectDropdown.style.display !== "";
          }

          function isFacilityMenuOpen() {
            return !!(elFacilityScopeDropdown && elFacilityScopeDropdown.style.display !== "none" && elFacilityScopeDropdown.style.display !== "");
          }

          function resetSchoolSearch() {
            searchInput.value = "";
            searchInput.dispatchEvent(new Event("input"));
          }

          function closeSchoolMenu(opts) {
            const commit = !!(opts && opts.commit);
            const restore = !!(opts && opts.restore);
            if (schoolMenuDrafting) {
              if (commit) {
                onSchoolSelectionChanged();
              } else if (restore) {
                restoreSchoolMenu(schoolDraftSnapshot);
              }
            }
            schoolMenuDrafting = false;
            schoolDraftSnapshot = null;
            elSchoolSelectDropdown.style.display = "none";
            if (elSchoolSelectBtn) elSchoolSelectBtn.setAttribute("aria-expanded", "false");
            resetSchoolSearch();
          }

          function openSchoolMenu() {
            closeFacilityMenu({ restore: true });
            closeArticulationMenu({ restore: true });
            schoolDraftSnapshot = snapshotSchoolMenu();
            schoolMenuDrafting = true;
            elSchoolSelectDropdown.style.display = "block";
            if (elSchoolSelectBtn) elSchoolSelectBtn.setAttribute("aria-expanded", "true");
            resetSchoolSearch();
            setTimeout(() => searchInput.focus(), 0);
          }

          function closeFacilityMenu(opts) {
            if (!elFacilityScopeDropdown || !elFacilityScopeBtn) return;
            const commit = !!(opts && opts.commit);
            const restore = !!(opts && opts.restore);
            if (facilityMenuDrafting) {
              if (commit) {
                applyFacilityVisibility();
              } else if (restore) {
                restoreFacilityMenu(facilityDraftSnapshot);
              }
            }
            facilityMenuDrafting = false;
            facilityDraftSnapshot = null;
            elFacilityScopeDropdown.style.display = "none";
            elFacilityScopeBtn.setAttribute("aria-expanded", "false");
          }

          function openFacilityMenu() {
            closeSchoolMenu({ restore: true });
            closeArticulationMenu({ restore: true });
            facilityDraftSnapshot = snapshotFacilityMenu();
            facilityMenuDrafting = true;
            elFacilityScopeDropdown.style.display = "block";
            elFacilityScopeBtn.setAttribute("aria-expanded", "true");
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
            if (!isArticulationAreaVisible(cb)) return false;
            if (isOriginal122Mode()) {
              return cb.dataset.deficiency === "1";
            }
            const activeTypes = getActiveFacilityTypes();
            if (activeTypes.size === 0) return false;
            return isFacilityTypeVisible(cb.dataset.facilityType, activeTypes);
          }

          function syncSchoolArticulationHeaders() {
            const headers = elSchoolSelectDropdown.querySelectorAll(".school-articulation-group-header");
            headers.forEach((hdr) => {
              let show = false;
              let el = hdr.nextElementSibling;
              while (el && !el.classList.contains("school-articulation-group-header")) {
                if (
                  el.classList.contains("pivot-col-filter-item") &&
                  el.style.display !== "none" &&
                  el.querySelector(".school-cb")
                ) {
                  show = true;
                  break;
                }
                el = el.nextElementSibling;
              }
              hdr.style.display = show ? "" : "none";
            });
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
              schoolCbs.forEach((cb) => { if (cb.checked) names.push(displaySchoolName(cb.dataset.name)); });
              elSchoolSelectLabel.textContent = names.join(", ");
            } else {
              elSchoolSelectLabel.textContent = `${count} facilities selected`;
            }
            allCb.checked = checkedTargets.length === targets.length && targets.length > 0;
            allCb.indeterminate = checkedTargets.length > 0 && checkedTargets.length < targets.length;
            if (listViewMode === "strategy") {
              strategyGroupCache = null;
              refreshSchoolMetaStripForSelection();
              renderStrategyGroupView();
              return;
            }
            applyMultiSchoolSelection();
          }

          getScopedSchoolCatalogFn = function () {
            return getVisibleSchoolCbs()
              .filter((cb) => cb.checked)
              .map((cb) => ({
                uid: cb.value,
                name: cb.dataset.name,
              }));
          };

          function applyFacilityVisibility() {
            schoolCbs.forEach((cb) => {
              const lbl = cb.closest("label");
              if (!lbl) return;
              const vis = isCbVisible(cb);
              lbl.style.display = vis ? "" : "none";
              cb.checked = vis;
            });
            syncSchoolArticulationHeaders();
            allCb.checked = true;
            allCb.indeterminate = false;
            updateSelectAllLabel();
            syncFacilityScopeCategoriesDimming();
            updateArticulationAreaLabel();
            onSchoolSelectionChanged();
          }

          if (elDeficiencyToggle) {
            elDeficiencyToggle.addEventListener("change", () => {
              if (elDeficiencyToggle.checked) {
                facilityTypeCbs.forEach((cb) => {
                  cb.checked = false;
                });
              }
              if (facilityMenuDrafting) {
                applyFacilityScopeDraftRules();
              } else {
                applyFacilityVisibility();
              }
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
              if (facilityMenuDrafting) {
                applyFacilityScopeDraftRules();
              } else {
                applyFacilityVisibility();
              }
            });
          });

          if (elFacilityScopeBtn && elFacilityScopeDropdown) {
            elFacilityScopeBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              if (isFacilityMenuOpen()) {
                closeFacilityMenu({ restore: true });
              } else {
                openFacilityMenu();
              }
            });
            elFacilityScopeDropdown.addEventListener("click", (e) => e.stopPropagation());
          }

          if (elFacilityScopeOk) {
            elFacilityScopeOk.addEventListener("click", (e) => {
              e.stopPropagation();
              closeFacilityMenu({ commit: true });
            });
          }
          if (elFacilityScopeCancel) {
            elFacilityScopeCancel.addEventListener("click", (e) => {
              e.stopPropagation();
              closeFacilityMenu({ restore: true });
            });
          }

          if (elArticulationAreaBtn && elArticulationAreaDropdown) {
            elArticulationAreaBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              if (isArticulationMenuOpen()) {
                closeArticulationMenu({ restore: true });
              } else {
                openArticulationMenu();
              }
            });
            elArticulationAreaDropdown.addEventListener("click", (e) => e.stopPropagation());
          }

          schoolCbs.forEach((cb) => cb.addEventListener("change", () => {
            if (schoolMenuDrafting) {
              updateSelectAllLabel();
              return;
            }
            onSchoolSelectionChanged();
          }));

          allCb.addEventListener("change", () => {
            const targets = getSelectAllTargets();
            if (allCb.checked) {
              targets.forEach((cb) => { cb.checked = true; });
            } else {
              schoolCbs.forEach((cb) => { cb.checked = false; });
            }
            if (schoolMenuDrafting) {
              updateSelectAllLabel();
              return;
            }
            onSchoolSelectionChanged();
          });

          schoolOkBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            closeSchoolMenu({ commit: true });
          });
          schoolCancelBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            closeSchoolMenu({ restore: true });
          });

          if (elDeficiencyToggle) {
            elDeficiencyToggle.checked = true;
          }
          facilityTypeCbs.forEach((cb) => {
            cb.checked = false;
          });

          // Default to By school; Custom (strategy pivot) remains available via the toggle.
          listViewMode = "school";

          // Initial state: Active District-Operated Sites — all matching facilities selected
          applyFacilityVisibility();

          const elViewModeSchool = document.getElementById("listViewModeSchool");
          const elViewModeStrategy = document.getElementById("listViewModeStrategy");
          if (elViewModeSchool) {
            elViewModeSchool.addEventListener("click", () => setListViewMode("school"));
          }
          if (elViewModeStrategy) {
            elViewModeStrategy.addEventListener("click", () => setListViewMode("strategy"));
          }
          loadStrategyPivotHierarchyOrder();
          loadStrategyPivotHiddenCols();
          loadStrategyPivotColWidths();
          setListViewMode(listViewMode);

          let lastPriorityLiveSig = "";
          const readPriorityLiveSig = () => {
            try {
              const w = window.localStorage?.getItem("jeffco_prioritization_weights_v1") || "";
              const s = window.localStorage?.getItem("jeffco_priority_scores_v1") || "";
              const t = window.localStorage?.getItem("jeffco_thresholds_v1") || "";
              return `${w}\n${s}\n${t}`;
            } catch {
              return "";
            }
          };
          const refreshPriorityScoresFromDashboard = () => {
            const sig = readPriorityLiveSig();
            if (sig === lastPriorityLiveSig) return;
            lastPriorityLiveSig = sig;
            invalidatePriorityScoreCache();
            if (listViewMode === "strategy") {
              renderStrategyGroupView();
            }
          };
          lastPriorityLiveSig = readPriorityLiveSig();

          window.addEventListener("storage", (e) => {
            if (
              e.key !== "jeffco_prioritization_weights_v1" &&
              e.key !== "jeffco_priority_scores_v1" &&
              e.key !== "jeffco_thresholds_v1"
            ) {
              return;
            }
            refreshPriorityScoresFromDashboard();
          });

          try {
            const bc = new BroadcastChannel("jeffco_priority_scores");
            bc.addEventListener("message", () => refreshPriorityScoresFromDashboard());
          } catch (_) {
            /* BroadcastChannel unavailable */
          }

          // Poll as a safety net so every school row stays in sync even if a
          // storage/BroadcastChannel event is missed while the Custom view is open.
          window.setInterval(() => {
            if (listViewMode !== "strategy") return;
            if (document.hidden) return;
            refreshPriorityScoresFromDashboard();
          }, 1500);

          searchInput.addEventListener("input", () => {
            const q = searchInput.value.trim().toLowerCase();
            schoolCbs.forEach((cb) => {
              const lbl = cb.closest("label");
              if (!lbl) return;
              if (!isCbVisible(cb)) { lbl.style.display = "none"; return; }
              if (!q) { lbl.style.display = ""; return; }
              const name = (cb.dataset.name || "").toLowerCase();
              const art = (cb.dataset.articulation || "").toLowerCase();
              lbl.style.display = name.includes(q) || art.includes(q) ? "" : "none";
            });
            if (q) { allLabel.style.display = "none"; }
            else { allLabel.style.display = ""; }
            syncSchoolArticulationHeaders();
          });
          searchInput.addEventListener("click", (e) => e.stopPropagation());
          searchInput.addEventListener("keydown", (e) => e.stopPropagation());

          if (elSchoolSelectBtn) {
            elSchoolSelectBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              if (isSchoolMenuOpen()) {
                closeSchoolMenu({ restore: true });
              } else {
                openSchoolMenu();
              }
            });
            elSchoolSelectDropdown.addEventListener("click", (e) => e.stopPropagation());
            document.addEventListener("click", (e) => {
              const schoolWrap = document.getElementById("schoolMultiSelect");
              if (schoolWrap && !schoolWrap.contains(e.target)) {
                if (schoolMenuDrafting || isSchoolMenuOpen()) {
                  closeSchoolMenu({ restore: true });
                }
              }
              const facilityWrap = document.getElementById("facilityTypeFilter");
              if (facilityWrap && !facilityWrap.contains(e.target)) {
                if (facilityMenuDrafting || isFacilityMenuOpen()) {
                  closeFacilityMenu({ restore: true });
                }
              }
              const artWrap = document.getElementById("articulationAreaFilter");
              if (artWrap && !artWrap.contains(e.target)) {
                if (articulationMenuDrafting || isArticulationMenuOpen()) {
                  closeArticulationMenu({ restore: true });
                }
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
          } else if (selectedSchoolUids.size === 0) {
            elSchoolNameHeader.textContent = "—";
            elSchoolMeta.textContent = "Select one or more schools above to view summary and projects.";
            elTableMount.innerHTML = '<div class="empty">No school selected.</div>';
          }
          // else: landing default — applyFacilityVisibility already selected all Active District-Operated Sites
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
      if (listViewMode !== "strategy") render();
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

    const turnOnAllRowsToggle = document.getElementById("turnOnAllRowsWithValuesToggle");
    if (turnOnAllRowsToggle) {
      syncTurnOnAllRowsWithValuesToggle();
      turnOnAllRowsToggle.addEventListener("change", () => {
        if (turnOnAllRowsToggle.checked) turnOnAllRowsWithValues();
        else turnOffAllRowsWithValuesBulkReset();
        syncTurnOnAllRowsWithValuesToggle();
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
      if (listViewMode !== "strategy") render();
    }
    priorityFilterCbs.forEach((cb) => cb.addEventListener("change", onPriorityFilterChanged));
    if (elPrioritySelectAll) {
      elPrioritySelectAll.addEventListener("change", () => {
        priorityFilterCbs.forEach((cb) => { cb.checked = elPrioritySelectAll.checked; });
        onPriorityFilterChanged();
      });
    }
    if (elPriorityFilterBtn) {
      elPriorityFilterBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = elPriorityFilterDropdown.style.display !== "none";
        elPriorityFilterDropdown.style.display = isOpen ? "none" : "block";
      });
      elPriorityFilterDropdown.addEventListener("click", (e) => e.stopPropagation());
      document.addEventListener("click", (e) => {
        const container = document.getElementById("priorityMultiSelect");
        if (container && !container.contains(e.target)) {
          elPriorityFilterDropdown.style.display = "none";
        }
      });
    }

    function onFilterChanged() {
      applyFilters();
      if (listViewMode !== "strategy") render();
    }
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
      if (listViewMode === "strategy") {
        resetStrategyPivotColumnFilters();
        strategyPivotSort = { key: getStrategyPivotHierarchyOrder()[0], dir: "asc" };
        applyFilters();
      } else {
        sortState = { key: "SystemCategory", dir: "asc" };
        applyFilters();
        render();
      }
    });

    if (elResetManualQtyOverrides) {
      elResetManualQtyOverrides.addEventListener("click", () => {
        const msg =
          "Clear all saved planning quantities (SF/qty you typed for site-specific rows) in this browser?\n\n" +
          "Values will come from the room schedule and planning defaults again.";
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
    const elExportExcelOption = document.getElementById("exportExcelOption");
    if (elExportExcelOption) {
      elExportExcelOption.addEventListener("click", () => {
        elExportDropdown.style.display = "none";
        if (listViewMode !== "strategy") {
          setListViewMode("strategy");
        }
        downloadStrategyGroupCsv(true);
      });
    }
    document.addEventListener("click", () => {
      if (elExportDropdown) elExportDropdown.style.display = "none";
      document.querySelectorAll(".pivot-columns-menu").forEach((m) => {
        m.hidden = true;
      });
      document.querySelectorAll(".pivot-columns-btn").forEach((b) => {
        b.setAttribute("aria-expanded", "false");
      });
    });
    if (elExportDropdown) {
      elExportDropdown.addEventListener("click", (e) => e.stopPropagation());
    }

    document.querySelectorAll(".priority-include-cb").forEach((cb) => {
      cb.addEventListener("change", () => {
        if (listViewMode === "strategy") {
          syncPriorityColumnFilterFromIncludeCheckboxes();
          renderStrategyGroupView();
          return;
        }
        updateTotalReplacementCostDisplay();
      });
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();


