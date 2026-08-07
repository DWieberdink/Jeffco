mapboxgl.accessToken = 'pk.eyJ1IjoicGF0d2QwNSIsImEiOiJjbTZ2bGVhajIwMTlvMnFwc2owa3BxZHRoIn0.moDNfqMUolnHphdwsIF87w';

// --- Debug logging -----------------------------------------------------------
// Set to true if you want verbose console output while developing.
const DEBUG = false;
const __origLog = console.log.bind(console);
if (!DEBUG) {
  console.log = function () {};
} else {
  // Keep a predictable prefix for debug sessions.
  console.log = (...args) => __origLog('[DEBUG]', ...args);
}

const mainDisplaySchoolName = window.formatSchoolDisplayName || ((name) => String(name ?? '').trim());

// Cache-bust static data files when needed (bump when CSV/GeoJSON changes).
const ASSET_VERSION = '2026-08-06-7';

const DASHBOARD_STEP_DEFS = {
  1: {
    title: 'School Portfolio Explore',
    subtitle: 'Review enrollment and capacity metrics by school'
  },
  2: {
    title: 'Explore the Interactive Map',
    subtitle: 'Locate schools by facility data or strategic decision'
  },
  3: {
    title: 'Sort by Strategic Decision',
    subtitle: 'Adjust thresholds and sort schools by decision category'
  },
  4: {
    title: 'Prioritize within Strategy Groups',
    subtitle: 'Weight criteria and rank schools within each group'
  }
};

/** Open Data & Logic / School Project List in a new browser tab. */
window.openDashboardPopout = function (url) {
  return window.open(url, '_blank', 'noopener');
};

// --- PK Enrollment: exclude by default (Enrollment - PKEnrollment) -------------------
const PK_ENROLLMENT_STORAGE_KEY = 'jeffco_include_pk_enrollment_v2';
const CAPACITY_SOURCE_STORAGE_KEY = 'jeffco_capacity_source_v1'; // "capacity" | "educational"
const CAPACITY_SOURCE_DEFAULT = 'capacity';
window.getIncludePKInEnrollment = function () {
  try {
    // Default: exclude PK / unchecked (return false when no preference stored)
    const v = window.localStorage && window.localStorage.getItem(PK_ENROLLMENT_STORAGE_KEY);
    return v === 'true';
  } catch (_) { return false; }
};
window.setIncludePKInEnrollment = function (v) {
  try {
    if (window.localStorage) window.localStorage.setItem(PK_ENROLLMENT_STORAGE_KEY, v ? 'true' : 'false');
  } catch (_) {}
};
window.getEffectiveEnrollment = function (row) {
  if (!row) return 0;
  const inc = window.getIncludePKInEnrollment && window.getIncludePKInEnrollment();
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
        row["Enrollment"] ??
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
        row.CurrPKEnrollment ??
        row["CurrPKEnrollment"] ??
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
};
window.getCapacitySource = function () {
  try {
    const raw = window.localStorage && window.localStorage.getItem(CAPACITY_SOURCE_STORAGE_KEY);
    return raw === 'educational' ? 'educational' : CAPACITY_SOURCE_DEFAULT;
  } catch (_) {
    return CAPACITY_SOURCE_DEFAULT;
  }
};
window.setCapacitySource = function (source) {
  const next = source === 'educational' ? 'educational' : 'capacity';
  try {
    if (window.localStorage) window.localStorage.setItem(CAPACITY_SOURCE_STORAGE_KEY, next);
  } catch (_) {}
};
window.getCapacitySourceLabel = function () {
  const src = window.getCapacitySource && window.getCapacitySource();
  return src === 'educational' ? 'Educational Capacity' : 'Capacity';
};
window.getEffectiveCapacityDetails = function (row) {
  const parseMaybe = (v) => {
    const n = parseFloat((v ?? '').toString().replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : null;
  };
  const rawCapacity = row ? (row.Capacity ?? row.capacity ?? row['Capacity'] ?? null) : null;
  const rawEducational = row ? (row.EducationalCapacity ?? row['EducationalCapacity'] ?? row['Educational Capacity'] ?? null) : null;
  const capacity = parseMaybe(rawCapacity);
  const educationalCapacity = parseMaybe(rawEducational);
  const source = (window.getCapacitySource && window.getCapacitySource()) || CAPACITY_SOURCE_DEFAULT;
  if (source === 'educational') {
    if (Number.isFinite(educationalCapacity) && educationalCapacity > 0) {
      return {
        value: educationalCapacity,
        source: 'educational',
        label: 'Educational Capacity',
        missingEducational: false,
        rawEducational
      };
    }
    const rawText = (rawEducational ?? '').toString().trim();
    const rawSuffix = rawText ? ` (${rawText})` : '';
    return {
      value: null,
      source: 'educational',
      label: 'Educational Capacity',
      missingEducational: true,
      rawEducational,
      note: `Educational capacity does not exist${rawSuffix}.`
    };
  }
  return {
    value: Number.isFinite(capacity) && capacity > 0 ? capacity : null,
    source: 'capacity',
    label: 'Capacity',
    missingEducational: false,
    rawCapacity
  };
};
window.getEffectiveCapacity = function (row) {
  const details = window.getEffectiveCapacityDetails ? window.getEffectiveCapacityDetails(row) : null;
  return details && Number.isFinite(details.value) && details.value > 0 ? details.value : null;
};
window.getEffectiveUtilization = function (row) {
  if (!row) return null;
  const cap = window.getEffectiveCapacity ? window.getEffectiveCapacity(row) : null;
  if (!Number.isFinite(cap) || cap <= 0) return null;
  const enr = window.getEffectiveEnrollment ? window.getEffectiveEnrollment(row) : null;
  if (!Number.isFinite(enr)) return null;
  return enr / cap;
};
window.getEffectiveAvailableSeats = function (row) {
  if (!row) return null;
  const cap = window.getEffectiveCapacity ? window.getEffectiveCapacity(row) : null;
  if (!Number.isFinite(cap) || cap <= 0) return null;
  const effEnr = window.getEffectiveEnrollment ? window.getEffectiveEnrollment(row) : 0;
  return Math.round(cap - effEnr);
};
/** Projection horizon headcount: mirrors PK toggle — prefer ProjEnrollment_KPlus when PK excluded, else ProjEnrollment_Total − ProjEnrollment_PK. */
window.getEffectiveProjectedEnrollment = function (row) {
  if (!row) return null;
  const inc = window.getIncludePKInEnrollment && window.getIncludePKInEnrollment();
  const pick = typeof window.pickDecisionRowField === "function" ? window.pickDecisionRowField : null;
  const parse = (v) => {
    const n = parseFloat((v ?? '').toString().replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : null;
  };
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
};
window.getEffectiveEnrollmentGrowth = function (row) {
  if (!row) return null;
  const parse = (v) => {
    const n = parseFloat((v ?? '').toString().replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : null;
  };
  const inc = window.getIncludePKInEnrollment && window.getIncludePKInEnrollment();
  const pick = typeof window.pickDecisionRowField === "function" ? window.pickDecisionRowField : null;
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
    const pk = parse(
      (pick && pick(row, "enrollmentPK")) ??
        row.PKEnrollment2026 ??
        row.PKEnrollment2025 ??
        row.PKEnrollment ??
        row["PKEnrollment"]
    ) ?? 0;
    const total = parse(totalRaw) ?? 0;
    current = Math.max(0, total - pk);
  }
  const projected = window.getEffectiveProjectedEnrollment(row);
  if (projected == null || !(current > 0)) return null;
  return (projected - current) / current;
};
/**
 * Enrollment growth threshold is stored as a ratio (e.g. 0.05 = 5% on the slider).
 * If a value is in (1, 100], treat it as a whole percent (legacy or mistaken storage) so 5 compares to growth as 5%, not 500%.
 */
window.normalizeEnrollmentGrowthThreshold = function (raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0.05;
  if (n > 1 && n <= 100) return n / 100;
  return n;
};
/**
 * Ratio (0–1) for growth threshold.
 * Prefer live `#growthSlider` when present so path logic matches the number shown on flowchart nodes,
 * then `t.enrollmentGrowth`, then 5%.
 */
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
window.getEffectiveAttendanceAreaEnrollment = function (row) {
  if (!row) return null;
  const inc = window.getIncludePKInEnrollment && window.getIncludePKInEnrollment();
  const parse = (v) => {
    const n = parseFloat((v ?? '').toString().replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : null;
  };
  if (inc) return parse(row['AttendanceAreaEnrollment'] ?? row['Attendance Area Enrollment']) ?? null;
  return parse(row['NonPKAttendanceAreaEnrollment'] ?? row['NonPK Attendance Area Enrollment']) ?? parse(row['AttendanceAreaEnrollment']) ?? null;
};
const withCacheBust = (url) => {
  if (!ASSET_VERSION) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${encodeURIComponent(ASSET_VERSION)}`;
};

// Map style management
const MAP_STYLES = {
  light: 'mapbox://styles/mapbox/light-v11',
  standard: 'mapbox://styles/mapbox/standard',
  satellite: 'mapbox://styles/mapbox/standard-satellite'
};

// Articulation areas overlay (polygons)
const DATA_URL_PREFIX =
  (typeof window !== 'undefined' && window.JEFFCO_DATA_PREFIX) || '/Facility Data/';
const ARTICULATION_AREAS_GEOJSON_PATH = DATA_URL_PREFIX + '08 ArticulationArea.geojson';
const ARTICULATION_AREA_COLORS = {
  'Alameda': '#7c3aed',
  'Arvada': '#6d28d9',
  'Arvada West': '#0f766e',
  'Bear Creek': '#0f766e',
  'Chatfield': '#c2410c',
  'Columbine': '#4d7c0f',
  'Conifer': '#6d28d9',
  'Dakota Ridge': '#6d28d9',
  'Evergreen': '#0f766e',
  'Golden': '#0f766e',
  'Green Mountain': '#c2410c',
  'Jefferson': '#4d7c0f',
  'Lakewood': '#6d28d9',
  'Pomona': '#6d28d9',
  'Ralston Valley': '#0f766e',
  'Standley Lake': '#1d4ed8',
  'Wheat Ridge': '#c2410c'
};
// FCI: overall index on Decision Data Export.csv; per-system costs from 02.2 deficiency CSV (08_* rows)
const PROJECT_LIST_CSV_PATH = DATA_URL_PREFIX + '02 JeffCoProjectListAllSchools.csv';
const FACILITIES_DEFICIENCY_CSV_PATH = DATA_URL_PREFIX + '02.2_FacilitiesDeficiencyProjects.csv';
const FCI_STATUS_COLORS = {
  excellent: '#166534',
  good: '#84cc16',
  fair: '#f59e0b',
  poor: '#f97316',
  deficient: '#dc2626',
  nodata: '#2563eb'
};
// Historic bond spending by articulation; enrollment growth is computed client-side from Decision + Map_Export
const BOND_SPENDING_CSV_PATH = DATA_URL_PREFIX + '04 HistoricBondSpendingByArticulationArea.csv';
/** Sentinel for GeoJSON: no enrollment growth value from CSV */
const ENROLLMENT_GROWTH_NODATA = -999;
const BUILDING_CONDITION_COLORS = {
  poor: '#dc2626',
  fair: '#f59e0b',
  good: '#a3e635',
  excellent: '#16a34a',
  nodata: '#9ca3af'
};
let articulationAreasGeojson4326 = null;
let articulationAreasLoaded = false;
let articulationLabelPartsIndex = [];
let articulationLabelRefreshTimer = null;
// articulation name -> { totalSpending, pctOfTotal, enrollmentGrowthPct? } (growth computed after Decision + Map_Export load)
let bondSpendingByArticulation = new Map();

function getBondSpendingEntryByName(name) {
  if (!name) return null;
  const exact = bondSpendingByArticulation.get(name);
  if (exact) return exact;
  const nl = name.toString().toLowerCase();
  for (const [k, v] of bondSpendingByArticulation) {
    if (k.toLowerCase() === nl) return v;
  }
  return null;
}
let projectListRowsForMap = [];
let fciBySchoolId = new Map(); // id -> { squareFt, overallFci, bySystem: Map }
let fciSystems = [];
let fciOverallQuartiles = null; // { q1, q3 }
let fciSystemQuartiles = new Map(); // system -> { q1, q3 }
let fciSelectedSystem = '';
let buildingScoresById = new Map(); // id -> BuildingScore
let buildingQuartiles = null; // { q1, q2, q3 }
let compareFciSystem = [];

function getFciStatusColorHex(status) {
  const key = (status || '').toString().trim().toLowerCase();
  if (key === 'excellent') return FCI_STATUS_COLORS.excellent;
  if (key === 'good') return FCI_STATUS_COLORS.good;
  if (key === 'fair') return FCI_STATUS_COLORS.fair;
  if (key === 'poor') return FCI_STATUS_COLORS.poor;
  if (key === 'deficient') return FCI_STATUS_COLORS.deficient;
  return FCI_STATUS_COLORS.nodata;
}
function getFciStatusColorKey(status) {
  return getFciStatusColorHex(status).replace('#', '').toLowerCase();
}

function getBuildingConditionColorHex(status) {
  const key = (status || '').toString().trim().toLowerCase();
  if (key === 'poor') return BUILDING_CONDITION_COLORS.poor;
  if (key === 'fair') return BUILDING_CONDITION_COLORS.fair;
  if (key === 'good') return BUILDING_CONDITION_COLORS.good;
  if (key === 'excellent') return BUILDING_CONDITION_COLORS.excellent;
  return BUILDING_CONDITION_COLORS.nodata;
}
function getBuildingConditionColorKey(status) {
  return getBuildingConditionColorHex(status).replace('#', '').toLowerCase();
}

function getLegendFilterState(mode) {
  if (!window.__legendFilterState) window.__legendFilterState = {};
  if (!window.__legendFilterState[mode]) window.__legendFilterState[mode] = {};
  return window.__legendFilterState[mode];
}

function legendFilterAllows(mode, key) {
  const state = window.__legendFilterState?.[mode];
  if (!state) return true;
  const values = Object.values(state);
  if (!values.length) return true;
  const anyOn = values.some(v => v === true);
  if (!anyOn) return false;
  if (key == null) return true;
  return state[key] !== false;
}

const COMPARE_CATEGORY_DEFS = {
  utilization: { label: 'Utilization' },
  fci: { label: 'FCI' },
  building: { label: 'Composite Building Score' }
};

function getCompareBuckets(categoryKey) {
  if (categoryKey === 'utilization') {
    const { low, high } = getUtilizationThresholds();
    const lowPct = Math.round(low * 100);
    const highPct = Math.round(high * 100);
    return [
      { key: 'low', label: `Too low (< ${lowPct}%)`, color: UTILIZATION_PHASE_COLORS.low },
      { key: 'mid', label: `In range (${lowPct}%–${highPct}%)`, color: UTILIZATION_PHASE_COLORS.mid },
      { key: 'high', label: `Too high (> ${highPct}%)`, color: UTILIZATION_PHASE_COLORS.high }
    ];
  }
  if (categoryKey === 'fci') {
    return [
      { key: 'Excellent', label: 'Excellent (<= 0.10)', color: FCI_STATUS_COLORS.excellent },
      { key: 'Good', label: 'Good (<= 0.20)', color: FCI_STATUS_COLORS.good },
      { key: 'Fair', label: 'Fair (<= 0.40)', color: FCI_STATUS_COLORS.fair },
      { key: 'Poor', label: 'Poor (<= 0.60)', color: FCI_STATUS_COLORS.poor },
      { key: 'Deficient', label: 'Deficient (<= 1.00)', color: FCI_STATUS_COLORS.deficient },
      { key: 'No Data', label: 'No Deferred Maintenance', color: FCI_STATUS_COLORS.nodata }
    ];
  }
  if (categoryKey === 'building') {
    return [
      { key: 'Poor', label: 'Poor (<= Q1)', color: BUILDING_CONDITION_COLORS.poor },
      { key: 'Fair', label: 'Fair (Q1–Q2)', color: BUILDING_CONDITION_COLORS.fair },
      { key: 'Good', label: 'Good (Q2–Q3)', color: BUILDING_CONDITION_COLORS.good },
      { key: 'Excellent', label: 'Excellent (> Q3)', color: BUILDING_CONDITION_COLORS.excellent },
      { key: 'No Data', label: 'No Data', color: BUILDING_CONDITION_COLORS.nodata }
    ];
  }
  return [];
}

function getCompareBucketForFeature(categoryKey, feature) {
  if (!feature || !feature.properties) return 'No Data';
  if (categoryKey === 'utilization') {
    const { low, high } = getUtilizationThresholds();
    const util = normalizeUtilizationValue(feature?.properties?.['Utilization'] ?? 0);
    return (util < low) ? 'low' : (util > high) ? 'high' : 'mid';
  }
  if (categoryKey === 'fci') {
    const getSelectedCompareFciSystemsFromDom = () => {
      const list = document.getElementById('compareFciSystemList');
      if (!list) return [];
      const selected = [];
      list.querySelectorAll('input[data-compare-fci-system]').forEach((cb) => {
        if (cb.checked) selected.push(cb.getAttribute('data-compare-fci-system'));
      });
      return selected;
    };
    const sysList = getSelectedCompareFciSystemsFromDom().length
      ? getSelectedCompareFciSystemsFromDom()
      : (Array.isArray(compareFciSystem) ? compareFciSystem : []);
    if (sysList.length) {
      // Average system statuses by mapping to numeric index (per-school, per-system)
      const values = [];
      const schoolId = normalizeId(feature?.properties?.["UniqueID"]);
      const entry = schoolId ? fciBySchoolId.get(schoolId) : null;
      sysList.forEach((sys) => {
        const p1Value = entry?.bySystem?.get(sys)?.priorityAvgCostPerSf?.[1];
        const quartiles = computeFciQuartilesForSystem(sys);
        const status = getFciStatusFromValue(p1Value, quartiles, false);
        const idx =
          status === 'Good' ? 1 :
          status === 'Fair' ? 2 :
          status === 'Poor' ? 3 :
          null;
        if (idx) values.push(idx);
      });
      if (!values.length) return 'No Data';
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      return avg <= 1.5 ? 'Good' : (avg <= 2.5 ? 'Fair' : 'Poor');
    }
    const overall = feature?.properties?.__fciOverall;
    return getFciStatusFromValue(overall, fciOverallQuartiles, true);
  }
  if (categoryKey === 'building') {
    return feature?.properties?.__buildingCondition || 'No Data';
  }
  return 'No Data';
}

function getSchoolLevelForFeature(feature) {
  if (!feature || !feature.properties) return 'Unknown';
  return feature?.properties?.__schoolLevelNorm || normalizeSchoolLevel(feature?.properties?.['School Level']) || 'Unknown';
}

function getCompareBucketForSchool(categoryKey, schoolId, feature) {
  if (categoryKey === 'fci') {
    const entry = schoolId ? fciBySchoolId.get(schoolId) : null;
    if (!entry) return 'No Data';
    const sysList = (Array.isArray(compareFciSystem) && compareFciSystem.length) ? compareFciSystem : [];
    if (sysList.length) {
      const values = [];
      sysList.forEach((sys) => {
        const p1Value = entry?.bySystem?.get(sys)?.priorityAvgCostPerSf?.[1];
        const quartiles = computeFciQuartilesForSystem(sys);
        const status = getFciStatusFromValue(p1Value, quartiles, false);
        const idx =
          status === 'Good' ? 1 :
          status === 'Fair' ? 2 :
          status === 'Poor' ? 3 :
          null;
        if (idx) values.push(idx);
      });
      if (!values.length) return 'No Data';
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      return avg <= 1.5 ? 'Good' : (avg <= 2.5 ? 'Fair' : 'Poor');
    }
    return getFciStatusFromValue(entry?.overallFci, fciOverallQuartiles, true);
  }
  if (feature) return getCompareBucketForFeature(categoryKey, feature);
  return 'No Data';
}

function normalizeArticulationAreaKey(v) {
  return (v || '').toString().trim().toLowerCase();
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseNumberLoose(v) {
  if (v == null) return null;
  const s = String(v)
    .replace(/\$/g, '')
    .replace(/,/g, '')
    .replace(/%/g, '')
    .trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseCountLoose(v) {
  const n = parseNumberLoose(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

/** CDE suffixes for ORIGINAL_122 — keep in sync with school-profile.js */
const ARTICULATION_GROWTH_ORIGINAL_122_SUFFIXES = new Set([
  '0030', '0033', '0108', '0370', '0378', '0660', '0664', '0694', '0724', '0779',
  '0950', '0951', '0952', '0965', '1001', '1244', '1318', '1522', '1861', '1864',
  '1876', '1886', '1976', '2093', '2120', '2130', '2194', '2288', '2300', '2322',
  '2496', '2550', '2616', '2820', '2832', '2836', '2866', '2963', '3025', '3088',
  '3201', '3216', '3502', '3536', '3622', '3628', '3726', '4190', '4422', '4548',
  '4549', '4550', '4798', '4830', '4942', '5004', '5024', '5036', '5222', '5350',
  '5354', '5454', '5472', '5524', '5580', '5623', '5758', '5892', '5944', '6133',
  '6135', '6285', '6286', '6330', '6470', '6539', '6804', '6808', '6848', '7114',
  '7128', '7190', '7238', '7239', '7282', '7468', '7483', '7529', '7708', '7753',
  '7780', '7833', '7870', '7962', '8036', '8090', '8102', '8209', '8223', '8276',
  '8280', '8300', '8381', '8432', '8856', '9008', '9052', '9058', '9232', '9234',
  '9245', '9299', '9328', '9342', '9412', '9424', '9428', '9429', '9432', '9490',
  '9510', '9648'
]);

/** Closed sites included in articulation rollups — keep in sync with scripts/compute-articulation-enrollment-growth.mjs */
const ARTICULATION_GROWTH_CLOSED_UIDS = new Set([
  'CO-1420-5972', 'CO-1420-9154', 'CO-1420-4802', 'CO-1420-6806', 'CO-1420-1790',
  'CO-1420-6828', 'CO-1420-4478', 'CO-1420-2946', 'CO-1420-3624', 'CO-1420-9678',
  'CO-1420-9638', 'CO-1420-0776', 'CO-1420-0109', 'CO-1420-3450', 'CO-1420-0148',
  'CO-1420-6844', 'CO-1420-8248', 'CO-1420-6090', 'CO-1420-8834'
]);

function getUidSuffixFor122(uid) {
  const parts = String(uid || '').split('-');
  return (parts[parts.length - 1] || '').toString().trim();
}

function uidInArticulationGrowthUniverse(uid) {
  const u = String(uid || '').trim();
  if (ARTICULATION_GROWTH_CLOSED_UIDS.has(u)) return true;
  return ARTICULATION_GROWTH_ORIGINAL_122_SUFFIXES.has(getUidSuffixFor122(u));
}

function parseGrowthFractionArticulation(raw) {
  const s = String(raw ?? '').trim();
  if (!s || /^#n\/a$/i.test(s)) return null;
  if (s === '-1') return null;
  const n = Number(String(s).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function deriveArticulationE15FromPct(e25, pctRaw) {
  const r = parseGrowthFractionArticulation(pctRaw);
  if (r == null) return null;
  const d = 1 + r;
  if (Math.abs(d) < 1e-12) return null;
  const v = e25 / d;
  return Number.isFinite(v) ? Math.max(0, v) : null;
}

/** True when the Decision export includes a historical enrollment column (canonical HistoricalEnrollment or legacy headers). */
function decisionExportSampleHasBaselineEnrollmentColumn(sample) {
  if (typeof window.sampleHasDecisionField === "function")
    return window.sampleHasDecisionField(sample, "enrollmentBaseline");
  if (!sample || typeof sample !== "object") return false;
  return (
    Object.prototype.hasOwnProperty.call(sample, "HistoricalEnrollment") ||
    Object.prototype.hasOwnProperty.call(sample, "EnrollmentHistorical") ||
    Object.prototype.hasOwnProperty.call(sample, "EnrollmentBaseline") ||
    Object.prototype.hasOwnProperty.call(sample, "2015Enrollment") ||
    Object.prototype.hasOwnProperty.call(sample, "Enrollment2015")
  );
}

function parseEnrollmentBaselineFromDecisionRow(row) {
  const pick = typeof window.pickDecisionRowField === "function" ? window.pickDecisionRowField : null;
  const e15v = parseNumberLoose(
    (pick && pick(row, "enrollmentBaseline")) ??
      row["HistoricalEnrollment"] ??
      row["EnrollmentHistorical"] ??
      row["EnrollmentBaseline"] ??
      row["2015Enrollment"] ??
      row.Enrollment2015 ??
      row["Enrollment2015"]
  );
  if (e15v != null && Number.isFinite(e15v)) return Math.max(0, e15v);
  return 0;
}

function getArticulationE15E25ForRow(row, hasBaselineCol) {
  const pick = typeof window.pickDecisionRowField === "function" ? window.pickDecisionRowField : null;
  const e25Raw = parseNumberLoose(
    (pick && pick(row, "enrollmentTotal")) ??
      row.Enrollment2026 ??
      row.Enrollment2025 ??
      row["Enrollment2025"] ??
      row.Enrollment ??
      row["Enrollment"]
  );
  const e25 = Math.max(0, e25Raw ?? 0);
  if (hasBaselineCol) {
    return { e15: parseEnrollmentBaselineFromDecisionRow(row), e25 };
  }
  const e15 = deriveArticulationE15FromPct(e25, row["10 Year Percent Change 2015-2025"]) ?? 0;
  return { e15, e25 };
}

function buildUidToArticulationFromMapExport(mapRows) {
  const m = new Map();
  (mapRows || []).forEach((r) => {
    const code = String(r['Building Code'] ?? '').trim();
    const art = String(r.Articulation ?? '').trim();
    if (code) m.set(code, art);
  });
  return m;
}

function computeArticulationEnrollmentGrowthByArea(decisionRows, mapRows) {
  const sample = Array.isArray(decisionRows) && decisionRows[0] ? decisionRows[0] : null;
  const hasBaseline = decisionExportSampleHasBaselineEnrollmentColumn(sample);
  const uidToArt = buildUidToArticulationFromMapExport(mapRows);
  const byArea = new Map();
  let d15 = 0;
  let d25 = 0;
  (decisionRows || []).forEach((row) => {
    const uid = String(row['UniqueID'] ?? row.UniqueID ?? '').trim();
    if (!uidInArticulationGrowthUniverse(uid)) return;
    const { e15, e25 } = getArticulationE15E25ForRow(row, hasBaseline);
    d15 += e15;
    d25 += e25;
    const rawArt = uidToArt.get(uid) || '';
    const ak = normalizeArticulationAreaKey(rawArt);
    if (ak && ak !== 'noarticulationarea' && ak !== 'n/a') {
      const label = rawArt.trim();
      if (!byArea.has(label)) byArea.set(label, { s15: 0, s25: 0 });
      const b = byArea.get(label);
      b.s15 += e15;
      b.s25 += e25;
    }
  });
  const growthPct = (s15, s25) => {
    if (!(s15 > 0)) return null;
    return ((s25 - s15) / s15) * 100;
  };
  const areaPctByKey = new Map();
  byArea.forEach((v, label) => {
    const nk = normalizeArticulationAreaKey(label);
    const g = growthPct(v.s15, v.s25);
    if (Number.isFinite(g)) areaPctByKey.set(nk, g);
  });
  return { areaPctByKey, districtPct: growthPct(d15, d25) };
}

function mergeComputedArticulationEnrollmentGrowth(decisionRows, mapExportRows) {
  try {
    const { areaPctByKey, districtPct } = computeArticulationEnrollmentGrowthByArea(decisionRows, mapExportRows);
    bondSpendingByArticulation.forEach((entry, name) => {
      const nk = normalizeArticulationAreaKey(name);
      if (nk === 'districtwide') {
        entry.enrollmentGrowthPct = Number.isFinite(districtPct) ? districtPct : null;
      } else {
        const v = areaPctByKey.get(nk);
        entry.enrollmentGrowthPct = Number.isFinite(v) ? v : null;
      }
    });
  } catch (e) {
    console.warn('⚠️ Failed to compute articulation enrollment growth:', e);
  }
}

function refreshArticulationGeojsonBondEnrollmentProps() {
  if (!articulationAreasGeojson4326 || !articulationAreasGeojson4326.features) return;
  try {
    ensureBondDataInArticulationGeoJSON(articulationAreasGeojson4326);
    const m = window.map;
    if (m && m.getSource && m.getSource('articulation-areas')) {
      setArticulationAreasMapData(m, articulationAreasGeojson4326);
    }
  } catch (e) {
    console.warn('⚠️ Failed to refresh articulation enrollment overlay:', e);
  }
}

// Reusable percentile/quantile helper (client-side)
function computeQuantiles(values, quantiles) {
  const nums = (values || []).filter(v => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (!nums.length) return quantiles.map(() => null);
  const getAt = (q) => {
    const pos = (nums.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (nums[base + 1] != null) {
      return nums[base] + rest * (nums[base + 1] - nums[base]);
    }
    return nums[base];
  };
  return quantiles.map(q => getAt(q));
}

function getFciStatusFromValue(value, quartiles, useFixedThresholds) {
  if (!Number.isFinite(value)) {
    return 'No Data';
  }
  if (useFixedThresholds) {
    if (value <= 0.10) return 'Excellent';
    if (value <= 0.20) return 'Good';
    if (value <= 0.40) return 'Fair';
    if (value <= 0.60) return 'Poor';
    return 'Deficient';
  }
  if (!quartiles || !Number.isFinite(quartiles.q1) || !Number.isFinite(quartiles.q3)) {
    return 'No Data';
  }
  if (value >= quartiles.q3) return 'Poor';
  if (value <= quartiles.q1) return 'Good';
  return 'Fair';
}

function getArticulationColorExpression() {
  const expr = ['match', ['get', '__aaName']];
  Object.entries(ARTICULATION_AREA_COLORS).forEach(([name, color]) => {
    expr.push(name, color);
  });
  expr.push('#94a3b8'); // fallback
  return expr;
}

// Color scale: low % = light green, high % = dark green (0–15% of total bond spending)
function getArticulationBondSpendingColorExpression() {
  return [
    'interpolate', ['linear'], ['coalesce', ['get', '__bondSpendingPct'], 0],
    0, '#dcfce7',      // 0% – very light green
    3, '#86efac',
    6, '#4ade80',
    9, '#22c55e',
    12, '#16a34a',
    15, '#14532d'      // 15%+ – dark green
  ];
}

// Diverging scale: enrollment change past 10 years (% points), clamped ±50; grey = no data
const ENROLLMENT_GROWTH_LEGEND_STOPS = [
  [-50, '#b91c1c'],
  [-25, '#fca5a5'],
  [0, '#f8fafc'],
  [25, '#86efac'],
  [50, '#15803d'],
];

function enrollmentGrowthLegendGradientCss() {
  const parts = ENROLLMENT_GROWTH_LEGEND_STOPS.map(([pct, color]) => {
    const pos = ((pct + 50) / 100) * 100;
    return `${color} ${pos}%`;
  });
  return `linear-gradient(to right, ${parts.join(', ')})`;
}

function getArticulationEnrollmentGrowthColorExpression() {
  const v = [
    'max',
    -50,
    ['min', 50, ['coalesce', ['get', '__enrollmentGrowthPct'], 0]]
  ];
  return [
    'case',
    ['==', ['get', '__enrollmentGrowthPct'], ENROLLMENT_GROWTH_NODATA],
    '#94a3b8',
    [
      'interpolate',
      ['linear'],
      v,
      ...ENROLLMENT_GROWTH_LEGEND_STOPS.flat()
    ]
  ];
}

function getArticulationFillColorExpression() {
  const enrollCb = document.getElementById('toggleEnrollmentGrowthColors');
  if (enrollCb && enrollCb.checked) return getArticulationEnrollmentGrowthColorExpression();
  const bondCb = document.getElementById('toggleBondSpendingColors');
  if (bondCb && bondCb.checked) return getArticulationBondSpendingColorExpression();
  return getArticulationColorExpression();
}

/** Articulation polygons: black outlines by default; bond/enrollment toggles show colored fill. */
const ARTICULATION_OUTLINE_COLOR = '#000000';
const ARTICULATION_OUTLINE_COLOR_MUTED = '#9ca3af';
const ARTICULATION_SELECTED_OUTLINE_COLOR = '#000000';
const ARTICULATION_OUTLINE_OPACITY = 1;
const ARTICULATION_OUTLINE_WIDTH = 1.5;
const ARTICULATION_SELECTED_OUTLINE_WIDTH = 3.5;
const ARTICULATION_FILL_OPACITY = 0;
const ARTICULATION_HIT_FILL_OPACITY = 0.001;
const ARTICULATION_DATA_FILL_OPACITY = 0.65;
const ARTICULATION_SELECTED_FILL_OPACITY = 0.12;

function isArticulationDataColorModeActive() {
  const enrollCb = document.getElementById('toggleEnrollmentGrowthColors');
  const bondCb = document.getElementById('toggleBondSpendingColors');
  return !!(enrollCb && enrollCb.checked) || !!(bondCb && bondCb.checked);
}

function updateArticulationCompareSectionVisibility() {
  const aaCb = document.getElementById('toggleArticulationAreas');
  const compareSection = document.getElementById('articulationCompareSection');
  if (!compareSection) return;
  const show = !!(aaCb && aaCb.checked);
  compareSection.style.display = show ? 'flex' : 'none';
  if (show) {
    try { updateCompareFciSystemsVisibility(); } catch {}
    try { updateArticulationAreaPickerVisibility(); } catch {}
  } else {
    try { updateArticulationAreaPickerVisibility(); } catch {}
  }
}

function updateCompareFciSystemsVisibility() {
  const block = document.getElementById('compareFciSystemsBlock');
  const fciCategoryCb = document.querySelector('#compareCategoryList input[data-compare-category="fci"]');
  if (!block) return;
  block.style.display = (fciCategoryCb && fciCategoryCb.checked) ? 'flex' : 'none';
}

function shouldShowArticulationLegend() {
  const aaCb = document.getElementById('toggleArticulationAreas');
  if (!aaCb || !aaCb.checked) return false;
  return isArticulationDataColorModeActive();
}

function buildArticulationLegendSectionHtml() {
  const bondCb = document.getElementById('toggleBondSpendingColors');
  const enrollCb = document.getElementById('toggleEnrollmentGrowthColors');
  if (bondCb && bondCb.checked) {
    return (
      '<div class="legend-items-wrap">' +
        '<div class="legend-section-title">2018 GO Bond Spending %</div>' +
        '<div class="legend-gradient-block">' +
          '<div class="legend-gradient-bar" style="background:linear-gradient(to right, #dcfce7 0%, #86efac 20%, #4ade80 40%, #22c55e 60%, #16a34a 80%, #14532d 100%);"></div>' +
          '<div class="legend-gradient-labels">' +
            '<span>0%</span><span>3%</span><span>6%</span><span>9%</span><span>12%</span><span>15%+</span>' +
          '</div>' +
        '</div>' +
        '<div class="legend-helper-text legend-helper-text--sm">Darker = higher share of total bond spending</div>' +
      '</div>'
    );
  }
  if (enrollCb && enrollCb.checked) {
    return (
      '<div class="legend-items-wrap">' +
        '<div class="legend-section-title">Enrollment change (2015-16 to 2025-26)</div>' +
        '<div class="legend-gradient-block">' +
          `<div class="legend-gradient-bar" style="background:${enrollmentGrowthLegendGradientCss()};"></div>` +
          '<div class="legend-gradient-labels">' +
            '<span>−50%</span><span>−25%</span><span>0%</span><span>25%</span><span>50%</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="legend-helper-text legend-helper-text--sm">Red = decline, green = growth; grey = no data</div>'
    );
  }
  return '';
}

function updateArticulationLegendSection() {
  const section = document.getElementById('legend-articulation-section');
  const legend = document.getElementById('map-legend');
  if (!section) return;
  if (shouldShowArticulationLegend()) {
    section.hidden = false;
    section.innerHTML = buildArticulationLegendSectionHtml();
    if (legend) legend.classList.remove('legend-collapsed');
  } else {
    section.hidden = true;
    section.innerHTML = '';
  }
}

function updateArticulationHistoricLegends() {
  try {
    if (typeof updateLegend === 'function') {
      updateLegend();
      return;
    }
  } catch (_) {}
  updateArticulationLegendSection();
}

function getArticulationFillOpacity() {
  return isArticulationDataColorModeActive() ? ARTICULATION_DATA_FILL_OPACITY : ARTICULATION_HIT_FILL_OPACITY;
}

function refreshArticulationAreaSelectionOutline() {
  try {
    const m = window.map;
    if (!m || !m.getLayer('articulation-areas-outline')) return;
    const selected = (window.__aaPopupAreaName || '').toString().trim();
    if (!selected) {
      m.setPaintProperty('articulation-areas-outline', 'line-width', ARTICULATION_OUTLINE_WIDTH);
      m.setPaintProperty('articulation-areas-outline', 'line-opacity', ARTICULATION_OUTLINE_OPACITY);
      m.setPaintProperty('articulation-areas-outline', 'line-color', ARTICULATION_OUTLINE_COLOR);
      if (m.getLayer('articulation-areas-fill') && !isArticulationDataColorModeActive()) {
        m.setPaintProperty('articulation-areas-fill', 'fill-opacity', ARTICULATION_HIT_FILL_OPACITY);
      }
      return;
    }
    m.setPaintProperty('articulation-areas-outline', 'line-width', [
      'case',
      ['==', ['get', '__aaName'], selected],
      ARTICULATION_SELECTED_OUTLINE_WIDTH,
      ARTICULATION_OUTLINE_WIDTH,
    ]);
    m.setPaintProperty('articulation-areas-outline', 'line-opacity', [
      'case',
      ['==', ['get', '__aaName'], selected],
      1,
      0.55,
    ]);
    m.setPaintProperty('articulation-areas-outline', 'line-color', [
      'case',
      ['==', ['get', '__aaName'], selected],
      ARTICULATION_SELECTED_OUTLINE_COLOR,
      ARTICULATION_OUTLINE_COLOR_MUTED,
    ]);
    if (m.getLayer('articulation-areas-fill') && !isArticulationDataColorModeActive()) {
      m.setPaintProperty('articulation-areas-fill', 'fill-opacity', [
        'case',
        ['==', ['get', '__aaName'], selected],
        ARTICULATION_SELECTED_FILL_OPACITY,
        ARTICULATION_HIT_FILL_OPACITY,
      ]);
    }
  } catch (e) {}
}

function refreshArticulationAreaPaintColors() {
  try {
    const m = window.map;
    if (!m || !m.getLayer('articulation-areas-fill')) return;
    m.setPaintProperty('articulation-areas-fill', 'fill-color', getArticulationFillColorExpression());
    m.setPaintProperty('articulation-areas-fill', 'fill-opacity', getArticulationFillOpacity());
    if (m.getLayer('articulation-areas-outline')) {
      refreshArticulationAreaSelectionOutline();
    }
  } catch (e) {}
}

function resolveArticulationAreaOutlineName(areaName) {
  const key = normalizeArticulationAreaKey(areaName);
  const feats = articulationAreasGeojson4326?.features || [];
  const match = feats.find(
    (f) => normalizeArticulationAreaKey(f?.properties?.__aaName || '') === key
  );
  if (match?.properties?.__aaName) return String(match.properties.__aaName).trim();
  const data = articulationSchoolsByArea && articulationSchoolsByArea.get(key);
  return ((data && data.areaName) ? data.areaName : areaName || '').toString().trim();
}
try {
  window.refreshArticulationAreaSelectionOutline = refreshArticulationAreaSelectionOutline;
} catch (_) {}

async function loadArticulationAreas4326() {
  if (articulationAreasLoaded) return articulationAreasGeojson4326;
  const res = await fetch(withCacheBust(ARTICULATION_AREAS_GEOJSON_PATH));
  const gj = await res.json();
  const crsName = ((gj && gj.crs && gj.crs.properties && gj.crs.properties.name) || '').toString();

  // Reproject from EPSG:2232 (StatePlane ftUS) to EPSG:4326 for Mapbox
  if (crsName && crsName.toUpperCase().includes('2232')) {
    if (typeof proj4 !== 'function') {
      console.warn('proj4 missing; cannot reproject articulation areas');
    } else {
      proj4.defs(
        'EPSG:2232',
        '+proj=lcc +lat_0=37.8333333333333 +lon_0=-105.5 +lat_1=39.75 +lat_2=38.45 +x_0=914401.828803657 +y_0=304800.609601219 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs +type=crs'
      );
      const reprojectCoords = (coords) => {
        if (!Array.isArray(coords)) return coords;
        if (coords.length === 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
          return proj4('EPSG:2232', 'EPSG:4326', coords);
        }
        return coords.map(reprojectCoords);
      };
      const feats = Array.isArray(gj.features) ? gj.features : [];
      gj.features = feats.map((f) => {
        const aaName = (f && f.properties && f.properties['Articulation Area']) ? String(f.properties['Articulation Area']) : '';
        const geom = f && f.geometry ? f.geometry : null;
        const coords = geom && geom.coordinates ? reprojectCoords(geom.coordinates) : null;
        return {
          ...f,
          properties: { ...(f.properties || {}), __aaName: aaName },
          geometry: geom ? { ...geom, coordinates: coords } : geom
        };
      });
      try { delete gj.crs; } catch {}
    }
  } else {
    // Still normalize property name for styling
    (gj.features || []).forEach((f) => {
      if (!f || !f.properties) return;
      if (f.properties.__aaName) return;
      f.properties.__aaName = (f.properties['Articulation Area'] || f.properties['ArticulationArea'] || f.properties['name'] || '').toString();
    });
  }

  // Link historic CSV metrics to each articulation polygon (case-insensitive name match)
  (gj.features || []).forEach((f) => {
    if (!f || !f.properties) return;
    const aaName = (f.properties.__aaName || '').toString().trim();
    const entry = getBondSpendingEntryByName(aaName);
    f.properties.__bondSpendingPct = entry ? entry.pctOfTotal : null;
    if (entry) f.properties.__bondSpendingTotal = entry.totalSpending;
    if (entry && Number.isFinite(entry.enrollmentGrowthPct)) {
      f.properties.__enrollmentGrowthPct = Math.max(-50, Math.min(50, entry.enrollmentGrowthPct));
    } else {
      f.properties.__enrollmentGrowthPct = ENROLLMENT_GROWTH_NODATA;
    }
  });

  articulationAreasGeojson4326 = gj;
  articulationAreasLoaded = true;
  return articulationAreasGeojson4326;
}

// Re-apply bond spending to cached GeoJSON when source is set (handles late bond data load)
function ensureBondDataInArticulationGeoJSON(gj) {
  if (!gj || !gj.features) return gj;
  (gj.features || []).forEach((f) => {
    if (!f || !f.properties) return;
    const aaName = (f.properties.__aaName || '').toString().trim();
    const entry = getBondSpendingEntryByName(aaName);
    f.properties.__bondSpendingPct = entry ? entry.pctOfTotal : null;
    if (entry) f.properties.__bondSpendingTotal = entry.totalSpending;
    if (entry && Number.isFinite(entry.enrollmentGrowthPct)) {
      f.properties.__enrollmentGrowthPct = Math.max(-50, Math.min(50, entry.enrollmentGrowthPct));
    } else {
      f.properties.__enrollmentGrowthPct = ENROLLMENT_GROWTH_NODATA;
    }
  });
  return gj;
}

function polygonRingCentroid(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return null;
  let sumLng = 0;
  let sumLat = 0;
  let count = 0;
  ring.forEach((coord) => {
    if (!Array.isArray(coord) || coord.length < 2) return;
    const lng = coord[0];
    const lat = coord[1];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    sumLng += lng;
    sumLat += lat;
    count += 1;
  });
  if (!count) return null;
  return [sumLng / count, sumLat / count];
}

function polygonRingSignedArea(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const x1 = ring[i][0];
    const y1 = ring[i][1];
    const x2 = ring[i + 1][0];
    const y2 = ring[i + 1][1];
    if (![x1, y1, x2, y2].every(Number.isFinite)) continue;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

function polygonPartOuterRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') {
    const outer = geometry.coordinates && geometry.coordinates[0];
    return outer ? [outer] : [];
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates || [])
      .map((poly) => (Array.isArray(poly) && poly[0] ? poly[0] : null))
      .filter(Boolean);
  }
  return [];
}

function buildArticulationLabelPartsIndex(gj) {
  const parts = [];
  (gj && gj.features ? gj.features : []).forEach((f, featureIndex) => {
    if (!f || !f.properties) return;
    const aaName = (f.properties.__aaName || '').toString().trim();
    if (!aaName) return;
    polygonPartOuterRings(f.geometry).forEach((ring, partIndex) => {
      parts.push({
        featureIndex,
        partIndex,
        aaName,
        ring,
        partArea: polygonRingSignedArea(ring),
      });
    });
  });
  return parts;
}

function closePolygonRing(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring.slice();
  return ring.concat([first]);
}

function ringToTurfPolygon(ring, props = {}) {
  if (typeof turf === 'undefined') return null;
  return turf.polygon([closePolygonRing(ring)], props);
}

function getMapViewportBboxPolygon(map, paddingRatio = 0.02) {
  if (typeof turf === 'undefined' || !map || typeof map.getBounds !== 'function') return null;
  const b = map.getBounds();
  const lngSpan = b.getEast() - b.getWest();
  const latSpan = b.getNorth() - b.getSouth();
  return turf.bboxPolygon([
    b.getWest() - lngSpan * paddingRatio,
    b.getSouth() - latSpan * paddingRatio,
    b.getEast() + lngSpan * paddingRatio,
    b.getNorth() + latSpan * paddingRatio,
  ]);
}

function getPrimaryPolygonFeature(geo) {
  if (!geo || typeof turf === 'undefined') return null;
  const feature = geo.type === 'Feature'
    ? geo
    : { type: 'Feature', geometry: geo.geometry || geo, properties: geo.properties || {} };
  if (!feature.geometry) return null;
  if (feature.geometry.type === 'Polygon') return feature;
  if (feature.geometry.type === 'MultiPolygon') {
    let best = null;
    let bestArea = -1;
    (feature.geometry.coordinates || []).forEach((coords) => {
      try {
        const candidate = turf.polygon(coords);
        const area = turf.area(candidate);
        if (area > bestArea) {
          bestArea = area;
          best = candidate;
        }
      } catch {}
    });
    return best;
  }
  return null;
}

function getInteriorLabelPointForPolygonFeature(polyFeature) {
  if (!polyFeature) return null;
  try {
    if (typeof turf.polylabel === 'function') {
      const labeled = turf.polylabel(polyFeature, 1.0);
      if (labeled?.geometry?.coordinates) return labeled.geometry.coordinates;
    }
    if (typeof turf.pointOnFeature === 'function') {
      const pt = turf.pointOnFeature(polyFeature);
      if (pt?.geometry?.coordinates) return pt.geometry.coordinates;
    }
  } catch {}
  return null;
}

function getArticulationLabelInsetKm(map) {
  if (!map || typeof map.getZoom !== 'function') return 0.35;
  const zoom = map.getZoom();
  return Math.max(0.1, 950 / Math.pow(2, Math.max(8, zoom) - 9.5));
}

function getDistanceToBoundaryKm(point, ring) {
  if (typeof turf === 'undefined' || !point || !ring) return 0;
  try {
    const line = turf.lineString(closePolygonRing(ring));
    return turf.pointToLineDistance(turf.point(point), line, { units: 'kilometers' });
  } catch {
    return 0;
  }
}

function pointInViewportPolygon(point, viewportBboxPoly) {
  if (!viewportBboxPoly || !point) return true;
  try {
    return turf.booleanPointInPolygon(turf.point(point), viewportBboxPoly);
  } catch {
    return true;
  }
}

function bufferPolygonInward(polyFeature, km) {
  if (!polyFeature || typeof turf === 'undefined' || !Number.isFinite(km) || km <= 0) {
    return polyFeature;
  }
  try {
    const buffered = turf.buffer(polyFeature, -km, { units: 'kilometers' });
    return getPrimaryPolygonFeature(buffered);
  } catch {
    return null;
  }
}

function isViewportFragmentUsable(intersectionFeature, minAreaSqm) {
  if (!intersectionFeature) return false;
  try {
    return turf.area(intersectionFeature) >= minAreaSqm;
  } catch {
    return false;
  }
}

function tryLabelPointFromPolygon(polyFeature, ring, minInsetKm) {
  if (!polyFeature || typeof turf === 'undefined') return null;
  const hostPoly = ringToTurfPolygon(ring);
  if (!hostPoly) return null;

  const candidates = [];
  const insetSteps = [1, 0.75, 0.5, 0.3];
  insetSteps.forEach((scale) => {
    const km = minInsetKm * scale;
    const target = km > 0.015 ? bufferPolygonInward(polyFeature, km) : polyFeature;
    if (!target) return;
    const pt = getInteriorLabelPointForPolygonFeature(target);
    if (pt) candidates.push(pt);
  });

  const direct = getInteriorLabelPointForPolygonFeature(polyFeature);
  if (direct) candidates.push(direct);

  let best = null;
  let bestDist = -1;
  const minDist = minInsetKm * 0.9;
  for (let i = 0; i < candidates.length; i += 1) {
    const pt = candidates[i];
    try {
      if (!turf.booleanPointInPolygon(turf.point(pt), hostPoly)) continue;
    } catch {
      continue;
    }
    const dist = getDistanceToBoundaryKm(pt, ring);
    if (dist >= minDist) return pt;
    if (dist > bestDist) {
      bestDist = dist;
      best = pt;
    }
  }

  return best;
}

function findFullArticulationLabelPoint(part, map) {
  const fallback = polygonRingCentroid(part.ring);
  if (typeof turf === 'undefined') return fallback;
  try {
    const poly = ringToTurfPolygon(part.ring, { __aaName: part.aaName });
    if (!poly) return fallback;
    const insetKm = getArticulationLabelInsetKm(map);
    return tryLabelPointFromPolygon(poly, part.ring, insetKm) || fallback;
  } catch {
    return fallback;
  }
}

function findViewportAwareArticulationLabelPoint(part, viewportBboxPoly, map) {
  const insetKm = getArticulationLabelInsetKm(map);
  const fallback = findFullArticulationLabelPoint(part, map);
  if (!viewportBboxPoly || typeof turf === 'undefined') return fallback;
  try {
    const poly = ringToTurfPolygon(part.ring, { __aaName: part.aaName });
    if (!poly) return null;
    if (!turf.booleanIntersects(poly, viewportBboxPoly)) return null;

    const minFragmentAreaSqm = Math.max(120000, insetKm * insetKm * 4e6);
    const ranked = [];

    const fullPt = tryLabelPointFromPolygon(poly, part.ring, insetKm);
    if (fullPt && pointInViewportPolygon(fullPt, viewportBboxPoly)) {
      ranked.push({
        point: fullPt,
        score: getDistanceToBoundaryKm(fullPt, part.ring) + 0.05,
      });
    }

    const clipped = getPrimaryPolygonFeature(turf.intersect(poly, viewportBboxPoly));
    if (isViewportFragmentUsable(clipped, minFragmentAreaSqm)) {
      const clipPt = tryLabelPointFromPolygon(clipped, part.ring, insetKm);
      if (clipPt && pointInViewportPolygon(clipPt, viewportBboxPoly)) {
        ranked.push({
          point: clipPt,
          score: getDistanceToBoundaryKm(clipPt, part.ring),
        });
      }
    }

    if (ranked.length) {
      ranked.sort((a, b) => b.score - a.score);
      return ranked[0].point;
    }

    if (fallback && pointInViewportPolygon(fallback, viewportBboxPoly)) {
      return fallback;
    }
    return null;
  } catch {
    return fallback;
  }
}

function buildArticulationLabelPointsGeoJSON(gj, map) {
  const parts = articulationLabelPartsIndex.length
    ? articulationLabelPartsIndex
    : buildArticulationLabelPartsIndex(gj);
  const viewportBboxPoly = map ? getMapViewportBboxPolygon(map) : null;
  const features = [];
  parts.forEach((part) => {
    const center = viewportBboxPoly
      ? findViewportAwareArticulationLabelPoint(part, viewportBboxPoly, map)
      : findFullArticulationLabelPoint(part, map);
    if (!center) return;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: center },
      properties: {
        __aaName: part.aaName,
        __partIndex: part.partIndex,
        __featureIndex: part.featureIndex,
        __partArea: part.partArea,
      },
    });
  });
  return { type: 'FeatureCollection', features };
}

function refreshArticulationAreaLabelPositions() {
  const m = window.map;
  const aaCb = document.getElementById('toggleArticulationAreas');
  if (!m || !aaCb || !aaCb.checked || !articulationAreasGeojson4326) return;
  try {
    const labelSrc = m.getSource('articulation-area-label-points');
    if (!labelSrc || typeof labelSrc.setData !== 'function') return;
    labelSrc.setData(buildArticulationLabelPointsGeoJSON(articulationAreasGeojson4326, m));
  } catch {}
}

function scheduleArticulationLabelRefresh() {
  if (articulationLabelRefreshTimer) clearTimeout(articulationLabelRefreshTimer);
  articulationLabelRefreshTimer = setTimeout(() => {
    articulationLabelRefreshTimer = null;
    refreshArticulationAreaLabelPositions();
  }, 80);
}

function bindArticulationLabelViewportRefresh(map) {
  if (!map || map.__aaLabelViewportBound) return;
  map.__aaLabelViewportBound = true;
  map.on('moveend', scheduleArticulationLabelRefresh);
  map.on('zoomend', scheduleArticulationLabelRefresh);
}

function getArticulationAreaLabelLayerLayout(visibility) {
  return {
    'text-field': ['get', '__aaName'],
    'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10, 10, 12, 12, 14, 14, 16, 16, 18, 18, 20],
    'text-anchor': 'center',
    'text-allow-overlap': false,
    'text-ignore-placement': false,
    'text-padding': 4,
    'symbol-sort-key': ['get', '__partArea'],
    visibility: visibility || 'none',
  };
}

function getArticulationAreaLabelLayerPaint() {
  return {
    'text-color': '#1f2937',
    'text-halo-color': '#ffffff',
    'text-halo-width': 1.5,
  };
}

function setArticulationAreasMapData(m, gj) {
  if (!m) return;
  const data = gj || { type: 'FeatureCollection', features: [] };
  const enriched = ensureBondDataInArticulationGeoJSON(data);
  articulationLabelPartsIndex = buildArticulationLabelPartsIndex(enriched);
  try {
    const polySrc = m.getSource('articulation-areas');
    if (polySrc && typeof polySrc.setData === 'function') polySrc.setData(enriched);
  } catch {}
  try {
    const labelSrc = m.getSource('articulation-area-label-points');
    if (labelSrc && typeof labelSrc.setData === 'function') {
      labelSrc.setData(buildArticulationLabelPointsGeoJSON(enriched, m));
    }
  } catch {}
  try { bindArticulationLabelViewportRefresh(m); } catch {}
}

function buildArticulationSchoolsIndexFromMapExport(mapExportRows, decisionRows) {
  // Build: areaKey -> { total, groupKeys: [], groups: { [level]: [names...] } }
  const levelByName = new Map();
  (decisionRows || []).forEach((r) => {
    const name = (r && (r["Building Name"] ?? r["BuildingName"] ?? "")).toString().trim();
    if (!name) return;
    const levelRaw = (r && (r["School Level"] ?? r["School level"] ?? r["SchoolLevel"] ?? "")).toString().trim();
    const level = normalizeSchoolLevel(levelRaw) || (levelRaw || 'Unknown');
    levelByName.set(normalizeName(name), level || 'Unknown');
  });

  const perArea = new Map();
  const areaNameByKey = new Map();
  const ensureArea = (areaKey) => {
    if (!perArea.has(areaKey)) perArea.set(areaKey, new Map()); // level -> Set(names)
    return perArea.get(areaKey);
  };

  (mapExportRows || []).forEach((r) => {
    const areaRaw = (r && (r["Articulation"] ?? r["Articulation Area"] ?? r["ArticulationArea"] ?? "")).toString().trim();
    const name = (r && (r["Building Name"] ?? r["BuildingName"] ?? "")).toString().trim();
    const areaKey = normalizeArticulationAreaKey(areaRaw);
    if (!areaKey || !name) return;
    // Map_Export.csv uses this sentinel for schools not in an articulation area
    if (areaKey === 'noarticulationarea' || areaKey === 'no articulation area' || areaKey === 'n/a') return;

    if (!areaNameByKey.has(areaKey) && areaRaw) {
      areaNameByKey.set(areaKey, areaRaw);
    }

    const level = levelByName.get(normalizeName(name)) || 'Unknown';
    const levels = ensureArea(areaKey);
    const key = (level || 'Unknown').toString().trim() || 'Unknown';
    if (!levels.has(key)) levels.set(key, new Set());
    levels.get(key).add(name);
  });

  const preferredOrder = [
    'Elementary',
    'Middle',
    'K-8',
    'High',
    'Alternative',
    'Charter',
    'Unknown'
  ];
  const orderIndex = new Map(preferredOrder.map((k, i) => [k.toLowerCase(), i]));
  const sortGroupKeys = (keys) => {
    return keys.slice().sort((a, b) => {
      const ai = orderIndex.has(a.toLowerCase()) ? orderIndex.get(a.toLowerCase()) : 999;
      const bi = orderIndex.has(b.toLowerCase()) ? orderIndex.get(b.toLowerCase()) : 999;
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
    });
  };

  const out = new Map();
  perArea.forEach((levelsMap, areaKey) => {
    const groups = {};
    let total = 0;
    const rawKeys = Array.from(levelsMap.keys());
    const groupKeys = sortGroupKeys(rawKeys);
    groupKeys.forEach((k) => {
      const arr = Array.from(levelsMap.get(k) || []).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
      );
      groups[k] = arr;
      total += arr.length;
    });
    out.set(areaKey, {
      total,
      groupKeys,
      groups,
      areaName: areaNameByKey.get(areaKey) || ''
    });
  });

  return out;
}

function getDecisionSquareFt(row) {
  const raw =
    row?.[" SquareFt "] ??
    row?.["SquareFt"] ??
    row?.["Square Ft"] ??
    row?.["Square Feet"] ??
    row?.["SquareFeet"];
  return parseNumberLoose(raw);
}

function calcAvgCostPerSf(sf, totalCost, rowCount) {
  if (!Number.isFinite(sf) || !Number.isFinite(totalCost) || !Number.isFinite(rowCount)) return null;
  if (sf <= 0 || totalCost <= 0 || rowCount <= 0) return null;
  return (sf / totalCost) / rowCount;
}

function isProjectListDeficiencyCategory(catRaw) {
  const s = (catRaw ?? '').toString().trim().toLowerCase();
  return (
    s === '08_facilities deficiency' ||
    s === '08_facilities deficiency_new' ||
    s === '08_site infrastructure' ||
    s === '08_site infrastructure_new'
  );
}

function parseProjectListReplacementCostRaw(raw) {
  if (raw == null) return 0;
  const s = String(raw).trim();
  if (!s || /^none$/i.test(s) || /^n\/a$/i.test(s)) return 0;
  const n = parseNumberLoose(String(s).replace(/^\$/u, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 02.2 may be line-item grain. Collapse to UniqueID × AssetType × Priority before
 * FCI / map costing so we do not reprocess thousands of detail rows.
 */
function normalizeFacilitiesDeficiencyRollupRows(rawRows) {
  const rows = Array.isArray(rawRows) ? rawRows : [];
  if (!rows.length) return [];
  const looksLikeLineItems = rows.some((r) =>
    String(r?.['New RSMeans Deficiency Description'] ?? '').trim() ||
    String(r?.['Deficiency (Scope Of Work)'] ?? '').trim() ||
    String(r?.ID ?? r?.['ID'] ?? '').trim() ||
    String(r?.System ?? r?.['System'] ?? '').trim()
  );
  if (!looksLikeLineItems) return rows;

  const byKey = new Map();
  rows.forEach((r) => {
    const uid = String(r?.UniqueID ?? r?.['UniqueID'] ?? '').trim();
    const school = String(r?.SchoolName ?? r?.['SchoolName'] ?? r?.Location ?? '').trim();
    const asset = String(r?.System ?? r?.['System'] ?? r?.AssetType ?? r?.['AssetType'] ?? '').trim();
    if (!uid || !asset) return;
    const priorityRaw = String(r?.Priority ?? r?.['Priority'] ?? r?.PriorityScore ?? r?.['PriorityScore'] ?? '2').trim();
    const priority = ['1', '2', '3', '4'].includes(priorityRaw) ? priorityRaw : '2';
    const cost = parseProjectListReplacementCostRaw(
      r?.['Cost with Inflation Factor'] ?? r?.ReplacementCost ?? r?.['ReplacementCost']
    );
    const key = `${uid.toLowerCase()}||${asset}||${priority}`;
    let agg = byKey.get(key);
    if (!agg) {
      agg = {
        JeffCoFacilityID: String(r?.JeffCoFacilityID ?? r?.['JeffCoFacilityID'] ?? '').trim(),
        UniqueID: uid,
        SchoolName: school,
        SystemCategory: '08_Facilities Deficiency',
        AssetType: asset,
        PriorityScore: priority,
        ConditionSource: '02.2 Facilities Deficiency Projects',
        ReplacementCost: 0
      };
      byKey.set(key, agg);
    }
    if (cost > 0) agg.ReplacementCost += cost;
  });

  return Array.from(byKey.values()).map((agg) => ({
    ...agg,
    ReplacementCost: agg.ReplacementCost > 0 ? Number(agg.ReplacementCost.toFixed(2)).toString() : 'None'
  }));
}

/** Read-time FCI system alias for dashboard map/compare UI (source CSV unchanged). */
function canonicalFciSystemName(name) {
  const s = (name ?? '').toString().trim();
  if (s === 'Structure') return 'Structural';
  return s;
}

function buildFciModelFromProjectList(projectRows, decisionRows) {
  const squareFtById = new Map();
  (decisionRows || []).forEach((r) => {
    const id = normalizeId(r?.UniqueID ?? r?.['UniqueID'] ?? r?.['Unique Id']);
    if (!id) return;
    const sf = getDecisionSquareFt(r);
    if (Number.isFinite(sf)) squareFtById.set(id, sf);
  });

  const dmById = new Map();
  const nonDmById = new Map();
  (projectRows || []).forEach((r) => {
    const schoolId = normalizeId(r?.UniqueID ?? r?.['UniqueID']);
    if (!schoolId) return;
    const rc = parseProjectListReplacementCostRaw(r?.ReplacementCost ?? r?.['ReplacementCost']);
    if (isProjectListDeficiencyCategory(r?.SystemCategory ?? r?.['SystemCategory'])) {
      dmById.set(schoolId, (dmById.get(schoolId) || 0) + rc);
    } else {
      nonDmById.set(schoolId, (nonDmById.get(schoolId) || 0) + rc);
    }
  });

  const ratioFciForId = (id) => {
    const dm = dmById.get(id) || 0;
    const nd = nonDmById.get(id) || 0;
    const den = dm + nd;
    if (!(den > 0)) return null;
    const ratio = dm / den;
    if (!Number.isFinite(ratio)) return null;
    return Math.min(1, Math.max(0, ratio));
  };

  const bySchoolId = new Map();
  const systemsSet = new Set();

  (projectRows || []).forEach((r) => {
    const schoolId = normalizeId(r?.UniqueID ?? r?.['UniqueID']);
    if (!schoolId) return;
    if (!isProjectListDeficiencyCategory(r?.SystemCategory ?? r?.['SystemCategory'])) return;
    const systemRaw = (r?.AssetType ?? r?.['AssetType'] ?? '').toString().trim();
    if (!systemRaw) return;
    const system = canonicalFciSystemName(systemRaw);
    systemsSet.add(system);

    const entry = bySchoolId.get(schoolId) || {
      id: schoolId,
      squareFt: squareFtById.get(schoolId) ?? null,
      overallFci: null,
      bySystem: new Map(),
      fciValues: []
    };
    bySchoolId.set(schoolId, entry);

    const lineCost = parseProjectListReplacementCostRaw(r?.ReplacementCost ?? r?.['ReplacementCost']);
    const pri = parseInt(String(r?.PriorityScore ?? r?.['PriorityScore'] ?? '').trim(), 10);

    const existingSys = entry.bySystem.get(system) || {
      system,
      totalCostSystem: 0,
      priorityCounts: { 1: 0, 2: 0, 3: 0, 4: 0 },
      priorityCosts: { 1: 0, 2: 0, 3: 0, 4: 0 },
      fciValues: []
    };
    if (Number.isFinite(lineCost) && lineCost > 0) {
      existingSys.totalCostSystem += lineCost;
    }
    if (pri >= 1 && pri <= 4 && Number.isFinite(lineCost) && lineCost > 0) {
      existingSys.priorityCosts[pri] += lineCost;
      existingSys.priorityCounts[pri] += 1;
    }
    entry.bySystem.set(system, existingSys);
  });

  (decisionRows || []).forEach((r) => {
    const id = normalizeId(r?.UniqueID ?? r?.['UniqueID'] ?? r?.['Unique Id']);
    if (!id) return;
    const colFci = parseNumberLoose(r?.FCI ?? r?.['FCI']);
    const ratio = ratioFciForId(id);
    const sf = getDecisionSquareFt(r);
    if (bySchoolId.has(id)) {
      const e = bySchoolId.get(id);
      e.overallFci = Number.isFinite(colFci) ? colFci : (ratio != null ? ratio : e.overallFci);
      if (Number.isFinite(sf)) e.squareFt = sf;
    } else if (Number.isFinite(colFci) || ratio != null) {
      bySchoolId.set(id, {
        id,
        squareFt: Number.isFinite(sf) ? sf : (squareFtById.get(id) ?? null),
        overallFci: Number.isFinite(colFci) ? colFci : ratio,
        bySystem: new Map(),
        fciValues: []
      });
    }
  });

  bySchoolId.forEach((entry, id) => {
    if (!Number.isFinite(entry.overallFci)) {
      const r = ratioFciForId(id);
      if (r != null) entry.overallFci = r;
    }
    if (!Number.isFinite(entry.squareFt) && squareFtById.has(id)) {
      entry.squareFt = squareFtById.get(id);
    }
  });

  bySchoolId.forEach((entry) => {
    const sf = entry.squareFt;
    entry.bySystem.forEach((sysEntry) => {
      const rowCount =
        (sysEntry.priorityCounts[1] || 0) +
        (sysEntry.priorityCounts[2] || 0) +
        (sysEntry.priorityCounts[3] || 0) +
        (sysEntry.priorityCounts[4] || 0);
      const fallbackRowCount = rowCount || ((sysEntry.totalCostSystem && sysEntry.totalCostSystem > 0) ? 1 : 0);
      if (!sysEntry.priorityCounts[1] && sysEntry.priorityCosts[1] > 0) sysEntry.priorityCounts[1] = 1;
      if (!sysEntry.priorityCounts[2] && sysEntry.priorityCosts[2] > 0) sysEntry.priorityCounts[2] = 1;
      if (!sysEntry.priorityCounts[3] && sysEntry.priorityCosts[3] > 0) sysEntry.priorityCounts[3] = 1;
      if (!sysEntry.priorityCounts[4] && sysEntry.priorityCosts[4] > 0) sysEntry.priorityCounts[4] = 1;
      sysEntry.rowCount = fallbackRowCount || null;
      sysEntry.avgCostPerSf = calcAvgCostPerSf(sf, sysEntry.totalCostSystem, sysEntry.rowCount);
      sysEntry.priorityAvgCostPerSf = {
        1: calcAvgCostPerSf(sf, sysEntry.priorityCosts[1], sysEntry.priorityCounts[1]),
        2: calcAvgCostPerSf(sf, sysEntry.priorityCosts[2], sysEntry.priorityCounts[2]),
        3: calcAvgCostPerSf(sf, sysEntry.priorityCosts[3], sysEntry.priorityCounts[3]),
        4: calcAvgCostPerSf(sf, sysEntry.priorityCosts[4], sysEntry.priorityCounts[4])
      };
      sysEntry.fciSystem = null;
    });
  });

  const overallValues = Array.from(bySchoolId.values())
    .map(e => e.overallFci)
    .filter(v => Number.isFinite(v));
  const [q1, q3] = computeQuantiles(overallValues, [0.25, 0.75]);
  const overallQuartiles = { q1, q3 };

  return {
    bySchoolId,
    systems: Array.from(systemsSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })),
    overallQuartiles
  };
}

function getBuildingScoreValue(row) {
  const raw = row?.BuildingScore ?? row?.["BuildingScore"] ?? row?.["Building Score"];
  return parseNumberLoose(raw);
}

function buildBuildingConditionModel(rows) {
  const byId = new Map();
  const scores = [];
  (rows || []).forEach((r) => {
    const id = normalizeId(r?.UniqueID ?? r?.["UniqueID"] ?? r?.["Unique Id"]);
    if (!id) return;
    const score = getBuildingScoreValue(r);
    if (!Number.isFinite(score)) return;
    byId.set(id, score);
    scores.push(score);
  });
  const [q1, q2, q3] = computeQuantiles(scores, [0.25, 0.5, 0.75]);
  return { byId, quartiles: { q1, q2, q3 } };
}

function computeBuildingQuartilesForFeatures(features) {
  const scores = [];
  (features || []).forEach((f) => {
    if (!f || !f.properties) return;
    const id = normalizeId(f.properties["UniqueID"]);
    let score = buildingScoresById.get(id);
    if (!Number.isFinite(score)) {
      const nameKey = f.properties["Building Name"] || f.properties["School Name"] || '';
      const row = decisionAllByName.get(normalizeName(nameKey));
      score = row ? getBuildingScoreValue(row) : null;
    }
    if (Number.isFinite(score)) scores.push(score);
  });
  const [q1, q2, q3] = computeQuantiles(scores, [0.25, 0.5, 0.75]);
  return { q1, q2, q3 };
}

function getBuildingConditionFromValue(value, quartiles) {
  if (!Number.isFinite(value) || !quartiles) return 'No Data';
  const { q1, q2, q3 } = quartiles;
  if (!Number.isFinite(q1) || !Number.isFinite(q2) || !Number.isFinite(q3)) return 'No Data';
  if (value <= q1) return 'Poor';
  if (value <= q2) return 'Fair';
  if (value <= q3) return 'Good';
  return 'Excellent';
}

function applyBuildingMetricsToFeatures(features) {
  if (!Array.isArray(features) || !features.length) return;
  features.forEach((f) => {
    if (!f || !f.properties) return;
    const id = normalizeId(f.properties["UniqueID"]);
    let score = buildingScoresById.get(id);
    if (!Number.isFinite(score) && decisionAllByName && typeof decisionAllByName.get === "function") {
      const nameKey = f.properties["Building Name"] || f.properties["School Name"] || "";
      const row = decisionAllByName.get(normalizeName(nameKey));
      score = row ? getBuildingScoreValue(row) : null;
    }
    f.properties.__buildingScore = Number.isFinite(score) ? score : null;
    f.properties.__buildingCondition = getBuildingConditionFromValue(score, buildingQuartiles);
  });
}

function computeFciQuartilesForSystem(systemName) {
  systemName = canonicalFciSystemName(systemName);
  if (!systemName) return null;
  const cached = fciSystemQuartiles.get(systemName);
  if (cached) return cached;
  const values = [];
  fciBySchoolId.forEach((entry) => {
    const val = entry?.bySystem?.get(systemName)?.priorityAvgCostPerSf?.[1];
    if (Number.isFinite(val)) values.push(val);
  });
  const [q1, q3] = computeQuantiles(values, [0.25, 0.75]);
  const quartiles = { q1, q3 };
  fciSystemQuartiles.set(systemName, quartiles);
  return quartiles;
}

function getActiveFciQuartiles() {
  if (fciSelectedSystem) return computeFciQuartilesForSystem(fciSelectedSystem);
  return fciOverallQuartiles;
}

function getFciPriority1ValueForSchoolId(schoolId) {
  const entry = fciBySchoolId.get(schoolId);
  if (!entry) return null;
  if (fciSelectedSystem) {
    return entry.bySystem?.get(fciSelectedSystem)?.priorityAvgCostPerSf?.[1] ?? null;
  }
  return entry.overallFci ?? null;
}

function getFciStatusForSchoolId(schoolId) {
  const value = getFciPriority1ValueForSchoolId(schoolId);
  const useFixed = !fciSelectedSystem;
  return getFciStatusFromValue(value, getActiveFciQuartiles(), useFixed);
}

function applyFciMetricsToFeatures(features) {
  if (!Array.isArray(features) || !features.length) return;
  const overallQuartiles = fciOverallQuartiles;
  const systemQuartiles = getActiveFciQuartiles();
  features.forEach((f) => {
    if (!f || !f.properties) return;
    const id = normalizeId(f.properties["UniqueID"]);
    const entry = fciBySchoolId.get(id);
    const overall = entry?.overallFci ?? null;
    const p1Value = entry?.bySystem?.get(fciSelectedSystem)?.priorityAvgCostPerSf?.[1] ?? null;
    const status = fciSelectedSystem
      ? getFciStatusFromValue(p1Value, systemQuartiles, false)
      : getFciStatusFromValue(overall, overallQuartiles, true);

    f.properties.__fciOverall = overall;
    f.properties.__fciSystemPriority1 = p1Value;
    f.properties.__fciStatus = status;
    f.properties.__fciOverallStatus = getFciStatusFromValue(overall, overallQuartiles, true);
  });
}

function setFciSelectedSystem(systemName) {
  fciSelectedSystem = canonicalFciSystemName(systemName);
  window.__fciSelectedSystem = fciSelectedSystem;
  if (originalGeojsonData && Array.isArray(originalGeojsonData.features)) {
    applyFciMetricsToFeatures(originalGeojsonData.features);
  }
  try {
    if (typeof updateLayer === 'function') updateLayer();
  } catch {}
  try { updateLegend(); } catch {}
  try { updateArticulationAreaFciTable(); } catch {}
  try { window.__aaRefreshPopup && window.__aaRefreshPopup(); } catch {}
}

function ensureFeatureByIdMap() {
  if (window.__featureById && window.__featureById.size) return;
  const map = new Map();
  (originalGeojsonData?.features || []).forEach((f) => {
    const id = normalizeId(f?.properties?.["UniqueID"]);
    if (id) map.set(id, f);
  });
  window.__featureById = map;
}

function getFeatureById(id) {
  ensureFeatureByIdMap();
  return window.__featureById?.get(id);
}

function shortLevelLabel(level) {
  const key = (level || '').toString();
  if (key.toLowerCase() === 'elementary') return 'Elem';
  if (key.toLowerCase() === 'middle') return 'Mid';
  if (key.toLowerCase() === 'high') return 'High';
  if (key.toLowerCase() === 'alternative') return 'Alt';
  if (key.toLowerCase() === 'multi-level') return 'Multi';
  if (key.toLowerCase() === 'option') return 'Option';
  return key || 'Unknown';
}

function getArticulationAreaSchoolNames(areaKey) {
  const data = articulationSchoolsByArea?.get(areaKey);
  if (!data) return [];
  const names = [];
  (data.groupKeys || []).forEach((k) => {
    (data.groups?.[k] || []).forEach((n) => names.push(n));
  });
  return names;
}

const AA_LAST_SELECT_KEY = 'jeffco_last_aa_selection_v1';

function isSchoolIdVisibleOnMap(schoolId) {
  const ids = window.__currentFilteredSchoolIds;
  if (!ids || !ids.size) return true;
  const id = normalizeId(schoolId);
  if (!id) return false;
  return ids.has(id);
}

/** Schools in an articulation area that pass current map filters (level, closed, etc.). */
function getFilteredSchoolsInArticulationArea(areaKey) {
  const data = articulationSchoolsByArea?.get(areaKey);
  if (!data) return { groupKeys: [], groups: {}, total: 0, areaName: '' };
  const groups = {};
  const groupKeys = [];
  let total = 0;
  (data.groupKeys || []).forEach((k) => {
    const filtered = (data.groups?.[k] || []).filter((name) => {
      const id = resolveSchoolIdFromName(name);
      return id && isSchoolIdVisibleOnMap(id);
    });
    if (filtered.length) {
      groups[k] = filtered;
      groupKeys.push(k);
      total += filtered.length;
    }
  });
  return {
    groupKeys,
    groups,
    total,
    areaName: data.areaName || areaKey
  };
}

function computeArticulationAreaHoverStats(areaName) {
  const areaKey = normalizeArticulationAreaKey(areaName);
  const { total, groupKeys, groups } = getFilteredSchoolsInArticulationArea(areaKey);
  const bondEntry = getBondSpendingEntryByName(areaName);
  let utilSum = 0;
  let utilCount = 0;
  groupKeys.forEach((k) => {
    (groups[k] || []).forEach((name) => {
      const id = resolveSchoolIdFromName(name);
      const feature = id ? getFeatureById(id) : null;
      const util = normalizeUtilizationValue(feature?.properties?.['Utilization'] ?? NaN);
      if (Number.isFinite(util)) {
        utilSum += util * 100;
        utilCount += 1;
      }
    });
  });
  return {
    schoolCount: total,
    bondSpending: bondEntry?.totalSpending,
    bondPct: bondEntry?.pctOfTotal,
    enrollmentGrowthPct: bondEntry?.enrollmentGrowthPct,
    avgUtilization: utilCount ? utilSum / utilCount : null
  };
}

function buildArticulationHoverTooltipHtml(areaName) {
  const stats = computeArticulationAreaHoverStats(areaName);
  const fmtCurrency = (n) => {
    if (!Number.isFinite(n)) return '—';
    return `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  };
  const bondLine = Number.isFinite(stats.bondPct)
    ? `${fmtCurrency(stats.bondSpending)} (${stats.bondPct.toFixed(1)}% of total)`
    : '—';
  const growthLine = Number.isFinite(stats.enrollmentGrowthPct)
    ? `${stats.enrollmentGrowthPct > 0 ? '+' : ''}${stats.enrollmentGrowthPct.toFixed(0)}%`
    : '—';
  const utilLine = Number.isFinite(stats.avgUtilization) ? `${stats.avgUtilization.toFixed(1)}%` : '—';
  return (
    `<div class="aa-hover-tooltip">` +
    `<div class="aa-hover-tooltip-title">${escapeHtml(areaName)} Area</div>` +
    `<div class="aa-hover-tooltip-row"><span>Schools</span><strong>${stats.schoolCount}</strong></div>` +
    `<div class="aa-hover-tooltip-row"><span>Bond spending</span><strong>${bondLine}</strong></div>` +
    `<div class="aa-hover-tooltip-row"><span>Enrollment change</span><strong>${growthLine}</strong></div>` +
    `<div class="aa-hover-tooltip-row"><span>Avg. utilization</span><strong>${utilLine}</strong></div>` +
    `<div class="aa-hover-tooltip-hint">Click for full summary</div>` +
    `</div>`
  );
}

function getArticulationAreaBounds(areaName) {
  const gj = articulationAreasGeojson4326;
  if (!gj || !Array.isArray(gj.features) || typeof turf === 'undefined') return null;
  const key = normalizeArticulationAreaKey(areaName);
  const feats = gj.features.filter(
    (f) => normalizeArticulationAreaKey(f?.properties?.__aaName || '') === key
  );
  if (!feats.length) return null;
  try {
    return turf.bbox(turf.featureCollection(feats));
  } catch (_) {
    return null;
  }
}

function flyMapToArticulationArea(areaName) {
  const m = window.map;
  const bbox = getArticulationAreaBounds(areaName);
  if (!m || !bbox) return;
  try {
    m.fitBounds(
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]]
      ],
      { padding: 72, duration: 900, maxZoom: 13.5, essential: true }
    );
  } catch (_) {}
}

function populateMapArticulationAreaSelect() {
  const sel = document.getElementById('mapArticulationAreaSelect');
  if (!sel || !articulationSchoolsByArea || !articulationSchoolsByArea.size) return;
  const saved = (() => {
    try {
      return localStorage.getItem(AA_LAST_SELECT_KEY) || '';
    } catch (_) {
      return '';
    }
  })();
  sel.innerHTML = '';
  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = 'Select an area…';
  sel.appendChild(ph);
  const rows = [];
  articulationSchoolsByArea.forEach((data, areaKey) => {
    const filtered = getFilteredSchoolsInArticulationArea(areaKey);
    if (!filtered.total) return;
    rows.push({
      key: areaKey,
      name: filtered.areaName || data.areaName || areaKey,
      count: filtered.total
    });
  });
  rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
  rows.forEach(({ key, name, count }) => {
    const o = document.createElement('option');
    o.value = key;
    o.textContent = `${name} (${count} school${count === 1 ? '' : 's'})`;
    sel.appendChild(o);
  });
  if (saved && Array.from(sel.options).some((o) => o.value === saved)) {
    sel.value = saved;
  }
}

function saveLastArticulationAreaSelection(areaKey) {
  if (!areaKey) return;
  try {
    localStorage.setItem(AA_LAST_SELECT_KEY, areaKey);
  } catch (_) {}
  const sel = document.getElementById('mapArticulationAreaSelect');
  if (sel) sel.value = areaKey;
}

function updateArticulationAreaPickerVisibility() {
  const aaCb = document.getElementById('toggleArticulationAreas');
  const block = document.getElementById('articulationAreaPickerBlock');
  if (!block) return;
  const show = !!(aaCb && aaCb.checked);
  block.style.display = show ? 'block' : 'none';
  if (show) populateMapArticulationAreaSelect();
}

try {
  window.populateMapArticulationAreaSelect = populateMapArticulationAreaSelect;
  window.flyMapToArticulationArea = flyMapToArticulationArea;
  window.saveLastArticulationAreaSelection = saveLastArticulationAreaSelection;
  window.getFilteredSchoolsInArticulationArea = getFilteredSchoolsInArticulationArea;
} catch (_) {}

function resolveSchoolIdFromName(name) {
  const row = decisionAllByName?.get(normalizeName(name));
  let id = normalizeId(row?.UniqueID ?? row?.["UniqueID"] ?? row?.["Unique Id"]);
  if (id) return id;
  const mapRow = mapExportLookupMaps?.byName?.get(normalizeName(name));
  const mapCode = (mapRow?.["Building Code"] || mapRow?.["BuildingCode"] || '').toString().trim();
  id = normalizeId(mapCode);
  return id || null;
}

function computeArticulationAreaCategoryStats(areaKey, categoryKey) {
  const names = getArticulationAreaSchoolNames(areaKey);
  const visibleIds = window.__currentFilteredSchoolIds;
  const buckets = getCompareBuckets(categoryKey);
  const bucketKeys = buckets.map(b => b.key);
  const counts = {};
  bucketKeys.forEach((k) => { counts[k] = 0; });
  if (!counts['No Data']) counts['No Data'] = 0;
  const byLevel = {};

  names.forEach((name) => {
    const id = resolveSchoolIdFromName(name);
    if (!id) return;
    if (visibleIds && visibleIds.size && !visibleIds.has(id)) return;
    const feature = getFeatureById(id);
    const level = getSchoolLevelForFeature(feature) || 'Unknown';
    const bucket = getCompareBucketForSchool(categoryKey, id, feature) || 'No Data';
    if (!counts.hasOwnProperty(bucket)) counts[bucket] = 0;
    counts[bucket] += 1;
    if (!byLevel[level]) {
      byLevel[level] = { counts: {}, total: 0 };
    }
    byLevel[level].counts[bucket] = (byLevel[level].counts[bucket] || 0) + 1;
    byLevel[level].total += 1;
  });

  const denom = Object.entries(counts).reduce((sum, [k, v]) => (k === 'No Data' ? sum : sum + v), 0);
  const pct = {};
  Object.keys(counts).forEach((k) => {
    pct[k] = denom ? (counts[k] / denom) * 100 : null;
  });

  return {
    buckets,
    counts,
    pct,
    byLevel
  };
}

function updateArticulationAreaFciTable() {
  try {
    const container = document.getElementById('articulationAreaFciTable');
    if (!container) return;
    if (!articulationSchoolsByArea || !articulationSchoolsByArea.size) {
      container.innerHTML = '<div style="font-size:12px; color:#6b7280;">Articulation areas not loaded.</div>';
      return;
    }

    const fmtPct = (n) => (Number.isFinite(n) ? `${n.toFixed(1)}%` : '—');

    const selectedCategories = Array.isArray(window.__compareCategories) && window.__compareCategories.length
      ? window.__compareCategories.slice()
      : Object.keys(COMPARE_CATEGORY_DEFS);

    if (!selectedCategories.length) {
      container.innerHTML = '<div style="font-size:12px; color:#6b7280;">Select categories to compare.</div>';
      return;
    }

    const needsFci = selectedCategories.includes('fci');
    if (needsFci && (!fciBySchoolId || !fciBySchoolId.size)) {
      container.innerHTML = '<div style="font-size:12px; color:#6b7280;">FCI data not loaded.</div>';
      return;
    }

    const rows = [];
    articulationSchoolsByArea.forEach((data, areaKey) => {
      const areaName = (data && data.areaName) ? data.areaName : areaKey;
      const perCategory = {};
      selectedCategories.forEach((catKey) => {
        perCategory[catKey] = computeArticulationAreaCategoryStats(areaKey, catKey);
      });
      rows.push({
        area: areaName || areaKey,
        perCategory
      });
    });

    rows.sort((a, b) => a.area.localeCompare(b.area, undefined, { sensitivity: 'base', numeric: true }));

    const headerNote = `<div style="font-size:11px; color:#6b7280; margin-bottom:6px;">Categories shown in articulation area popup (FCI uses selected compare systems if any)</div>`;
    const categoryBuckets = {};
    selectedCategories.forEach((k) => {
      categoryBuckets[k] = getCompareBuckets(k) || [];
    });

    const shortBucketLabel = (key) => {
      const k = (key || '').toString().toLowerCase();
      if (k === 'excellent') return 'Ex';
      if (k === 'deficient') return 'Def';
      if (k === 'no data') return 'ND';
      if (k === 'good') return 'Good';
      if (k === 'fair') return 'Fair';
      if (k === 'poor') return 'Poor';
      if (k === 'low') return 'Low';
      if (k === 'mid') return 'Mid';
      if (k === 'high') return 'High';
      return key;
    };

    const renderAreaAvg = (stats) => {
      const row = stats.buckets.map((b) => {
        const pct = stats.pct?.[b.key];
        const pctText = Number.isFinite(pct) ? `${pct.toFixed(0)}%` : '—';
        return `<span style="display:flex; align-items:center; gap:4px;">
          <span class="compare-swatch" style="background:${b.color};"></span>${pctText}
        </span>`;
      }).join('');
      return `<div class="compare-row">${row}</div>`;
    };

    const renderLevelAvg = (stats) => {
      const levels = Object.keys(stats.byLevel || {}).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
      if (!levels.length) return `<div class="compare-row"><span>—</span></div>`;
      const row = levels.map((lvl) => {
        const entry = stats.byLevel[lvl];
        const total = entry.total || 0;
        if (!total) return '';
        let bestKey = null;
        let bestCount = -1;
        Object.entries(entry.counts || {}).forEach(([k, v]) => {
          if (k === 'No Data') return;
          if (v > bestCount) {
            bestCount = v;
            bestKey = k;
          }
        });
        const bucket = stats.buckets.find(b => b.key === bestKey) || stats.buckets[stats.buckets.length - 1];
        const pct = bestCount >= 0 ? Math.round((bestCount / total) * 100) : null;
        return `<span style="display:flex; align-items:center; gap:4px;">
          <span class="compare-swatch" style="background:${bucket?.color || '#cbd5e1'};"></span>${shortLevelLabel(lvl)} ${pct ?? '—'}%
        </span>`;
      }).join('');
      return `<div class="compare-row">${row}</div>`;
    };

    const tableHtml = `
      ${headerNote}
      <table>
        <thead>
          <tr>
            <th>Area</th>
            ${selectedCategories.map(k => {
              const label = escapeHtml(COMPARE_CATEGORY_DEFS[k]?.label || k);
              const buckets = categoryBuckets[k] || [];
              const legend = buckets.length
                ? `<div class="compare-row" style="margin-top:4px; font-size:10px; color:#4b5563;">
                    ${buckets.map(b => `<span style="display:flex; align-items:center; gap:4px;">
                      <span class="compare-swatch" style="background:${b.color};"></span>${escapeHtml(shortBucketLabel(b.key))}
                    </span>`).join('')}
                  </div>`
                : '';
              return `<th>${label}${legend}</th>`;
            }).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${escapeHtml(r.area)}</td>
              ${selectedCategories.map(k => {
                const stats = r.perCategory[k];
                if (!stats) return `<td>—</td>`;
                return `<td>
                  <div class="compare-cell">
                    <div class="compare-subtitle">Area avg</div>
                    ${renderAreaAvg(stats)}
                    <div class="compare-subtitle">By level</div>
                    ${renderLevelAvg(stats)}
                  </div>
                </td>`;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    container.innerHTML = tableHtml;
  } catch (err) {
    const container = document.getElementById('articulationAreaFciTable');
    if (container) {
      container.innerHTML = '<div style="font-size:12px; color:#b91c1c;">Articulation table failed to render. Please refresh.</div>';
    }
    console.warn('Articulation table render error:', err);
  }
}

// Ensure the articulation table renders at least once after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  try {
    updateArticulationAreaFciTable();
  } catch (e) {
    const container = document.getElementById('articulationAreaFciTable');
    if (container) {
      container.innerHTML = '<div style="font-size:12px; color:#6b7280;">Loading articulation summary...</div>';
    }
  }
});

// Decision outcome colors (keep consistent with map circle coloring)
const DECISION_COLORS = {
  // Expansion: blue family
  "Building Addition": "#1D4ED8",
  "Policy Solution for Overcrowding": "#3B82F6",
  "Building Addition with Capital Investment": "#1E3A8A",
  "Building Replacement": "#5B21B6",
  "Targeted Capital Investment": "#FBBF24", // Gold
  "Standard Maintenance": "#9c5326",      // Medium brown
  "Major Capital Investment": "#F97316",  // Deep orange
  // Welcoming school: green palette
  "Welcoming School": "#62d48c",
  "Welcoming School with Capital Investment": "#7a9a72",
  "Welcoming School with Building Replacement": "#0c4d24",
  "Closure (Goes to Welcoming School)": "#fa5b5b",  // Light red
  "Other / Unknown": "#2F4F4F",
  "Unknown": "#7f8c8d"
};
function getDecisionColorHex(decisionType) {
  const key = (decisionType || "").toString().trim();
  return DECISION_COLORS[key] || "#7f8c8d";
}
function getDecisionColorKey(decisionType) {
  return getDecisionColorHex(decisionType).replace("#", "").toLowerCase();
}

// School level colors (used by "Color by school level" and utilization pies)
const SCHOOL_LEVEL_COLORS = {
  'Elementary': '#2563eb',  // blue
  'Middle': '#7c3aed',      // purple
  'High': '#dc2626',        // red
  'K-8': '#f59e0b',         // amber
  'Alternative': '#10b981', // green
  'Multi-Level': '#0ea5e9', // sky
  'Option': '#f97316',      // orange
  'Unknown': '#64748b'
};
function getSchoolLevelColorHex(level) {
  const key = (level || '').toString().trim();
  return SCHOOL_LEVEL_COLORS[key] || '#94a3b8';
}
function getSchoolLevelColorKey(level) {
  return getSchoolLevelColorHex(level).replace('#', '').toLowerCase();
}

// Utilization phase colors (Color by Utilization)
const UTILIZATION_PHASE_COLORS = {
  low: '#2563eb',  // blue
  mid: '#10b981',  // green
  high: '#dc2626', // red
};
function normalizeUtilizationValue(raw) {
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return 0;
  // If utilization came in as a percent (e.g. 92), convert to ratio.
  if (n > 1.5) return n / 100;
  return n;
}
function getUtilizationThresholds() {
  const t = window.thresholds || window.decisionLogic?.thresholds || {};
  const low = normalizeUtilizationValue(t.utilization ?? 0.6);
  const high = normalizeUtilizationValue(t.utilizationHigh ?? 0.9);
  // Ensure low <= high
  return (low <= high) ? { low, high } : { low: high, high: low };
}

// Base-map label/POI visibility (applied to Mapbox style layers)
const MAP_LABEL_PREFS_KEY = 'mapLabelPrefs';
const DEFAULT_MAP_LABEL_PREFS = {
  roadLabels: true,
  placeLabels: true,
  poiLabels: true
};
function getSavedMapLabelPrefs() {
  try {
    const raw = localStorage.getItem(MAP_LABEL_PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_MAP_LABEL_PREFS };
    return {
      roadLabels: parsed.roadLabels !== false,
      placeLabels: parsed.placeLabels !== false,
      poiLabels: parsed.poiLabels !== false
    };
  } catch {
    return { ...DEFAULT_MAP_LABEL_PREFS };
  }
}
function saveMapLabelPrefs(prefs) {
  try {
    localStorage.setItem(MAP_LABEL_PREFS_KEY, JSON.stringify({
      roadLabels: prefs.roadLabels !== false,
      placeLabels: prefs.placeLabels !== false,
      poiLabels: prefs.poiLabels !== false
    }));
  } catch {}
}

function rebuildMapLabelLayerIndex() {
  const m = window.map;
  if (!m || typeof m.getStyle !== 'function') {
    window.__mapLabelLayerIndex = null;
    return;
  }
  let layers = [];
  try {
    const style = m.getStyle();
    layers = (style && Array.isArray(style.layers)) ? style.layers : [];
  } catch {
    layers = [];
  }

  const idx = { roadLabels: [], placeLabels: [], poiLabels: [] };

  const classify = (layer) => {
    if (!layer || layer.type !== 'symbol') return null;
    // Avoid hiding our dashboard layers (schools, selections, etc.)
    const src = (layer.source || '').toString().toLowerCase();
    const layerIdLower = ((layer.id || '').toString()).toLowerCase();
    if (
      src === 'schools' ||
      src === 'selected-school' ||
      layerIdLower.startsWith('schools-') ||
      layerIdLower.startsWith('selected-school-')
    ) {
      return null;
    }
    const sourceLayer = (layer['source-layer'] || '').toString().toLowerCase();

    if (
      layerIdLower.includes('poi') ||
      layerIdLower.includes('landmark') ||
      layerIdLower.includes('park') ||
      sourceLayer.includes('poi') ||
      sourceLayer.includes('landmark') ||
      sourceLayer.includes('park')
    ) return 'poiLabels';

    if (
      layerIdLower.includes('road') ||
      layerIdLower.includes('street') ||
      layerIdLower.includes('highway') ||
      layerIdLower.includes('motorway') ||
      layerIdLower.includes('shield') ||
      sourceLayer.includes('road') ||
      sourceLayer.includes('transportation')
    ) return 'roadLabels';

    if (
      layerIdLower.includes('place') ||
      layerIdLower.includes('settlement') ||
      layerIdLower.includes('country') ||
      layerIdLower.includes('state') ||
      layerIdLower.includes('admin') ||
      sourceLayer.includes('place') ||
      sourceLayer.includes('settlement') ||
      sourceLayer.includes('country') ||
      sourceLayer.includes('admin')
    ) return 'placeLabels';

    return null;
  };

  layers.forEach(layer => {
    const key = classify(layer);
    if (!key) return;
    idx[key].push(layer.id);
  });

  window.__mapLabelLayerIndex = idx;
  window.__mapLabelLayerIndexBuiltAt = Date.now();
  console.warn(
    '🗺️ Map Labels index rebuilt:',
    'roads=', idx.roadLabels.length,
    'places=', idx.placeLabels.length,
    'pois=', idx.poiLabels.length
  );
}

function applyMapLabelPrefsViaConfig() {
  const m = window.map;
  if (!m || typeof m.setConfigProperty !== 'function') return false;
  const prefs = getSavedMapLabelPrefs();

  // Mapbox "Standard" styles often expose label control via style config (not plain layers).
  // Try a small set of likely config keys; ignore failures and fall back to layer toggles.
  const attempts = [];
  const trySet = (group, key, val) => {
    try {
      m.setConfigProperty(group, key, val);
      attempts.push(`${group}.${key}=${val}`);
      return true;
    } catch {
      return false;
    }
  };

  const wantRoad = !!prefs.roadLabels;
  const wantPlace = !!prefs.placeLabels;
  const wantPoi = !!prefs.poiLabels;

  // Common naming patterns seen in Standard-style configs
  const ok =
    trySet('basemap', 'showRoadLabels', wantRoad) |
    trySet('basemap', 'showRoadLabel', wantRoad) |
    trySet('basemap', 'showRoadsAndTransitLabels', wantRoad) |
    trySet('basemap', 'showPlaceLabels', wantPlace) |
    trySet('basemap', 'showPlaceLabel', wantPlace) |
    trySet('basemap', 'showPointOfInterestLabels', wantPoi) |
    trySet('basemap', 'showPoiLabels', wantPoi) |
    trySet('basemap', 'showPOILabels', wantPoi);

  if (attempts.length) {
    console.warn('🗺️ Map Labels applied via config:', attempts.join(', '));
  }
  return !!ok;
}

function applyMapLabelPrefs() {
  const m = window.map;
  if (!m || typeof m.getStyle !== 'function') return;
  try {
    if (typeof m.isStyleLoaded === 'function' && !m.isStyleLoaded()) return;
  } catch {}

  // First try Standard-style config toggles (works for Standard / Standard Satellite).
  try {
    if (applyMapLabelPrefsViaConfig()) return;
  } catch {}

  // Fallback: hide symbol layers (works for classic styles like Light).
  if (typeof m.setLayoutProperty !== 'function') return;
  const prefs = getSavedMapLabelPrefs();

  if (!window.__mapLabelLayerIndex) {
    rebuildMapLabelLayerIndex();
  }
  const idx = window.__mapLabelLayerIndex || { roadLabels: [], placeLabels: [], poiLabels: [] };

  const setGroup = (key) => {
    const visibility = prefs[key] ? 'visible' : 'none';
    (idx[key] || []).forEach(layerId => {
      try { m.setLayoutProperty(layerId, 'visibility', visibility); } catch {}
    });
  };
  setGroup('roadLabels');
  setGroup('placeLabels');
  setGroup('poiLabels');
  console.warn('🗺️ Map Labels applied:', prefs);
}

function getSavedMapStyle() {
  const saved = localStorage.getItem('mapStyleChoice');
  return saved || MAP_STYLES.light;
}
window.applyMapStyle = function applyMapStyle(styleId) {
  if (!window.map || !styleId) return;
  const mapRef = window.map;
  // Style switching can rebuild the style from scratch; sources/layers/images are wiped.
  // `style.load` can fire before the style is actually ready for addSource/addLayer.
  // Use a retry loop + `idle` to guarantee we re-add our layers.
  const applyToken = (window.__mapStyleApplyToken = (window.__mapStyleApplyToken || 0) + 1);
  const tryFinishApply = (attempt = 0) => {
    // Stop if a newer style change started.
    if (window.__mapStyleApplyToken !== applyToken) return;
    // Wait for style readiness.
    try {
      if (typeof mapRef.isStyleLoaded === 'function' && !mapRef.isStyleLoaded()) {
        if (attempt < 80) setTimeout(() => tryFinishApply(attempt + 1), 75);
        return;
      }
    } catch {}
    try {
      ensureBaseSourcesLayers();
      // Apply base-map label toggles after the style has rebuilt.
      try { rebuildMapLabelLayerIndex(); } catch {}
      try { applyMapLabelPrefs(); } catch {}
      // ensureBaseSourcesLayers may call updateLayer internally, but call once more
      // to ensure we restore visibility/filters after layers exist.
      try { updateLayer(); } catch {}
    } catch (e) {
      // If we raced the style rebuild, retry briefly.
      if (attempt < 80) {
        setTimeout(() => tryFinishApply(attempt + 1), 75);
      } else {
        console.warn('⚠️ Unable to reapply filters after style change:', e);
      }
    }
  };

  const onStyleLoadOnce = () => {
    // Schedule after the style has had a chance to fully rebuild.
    setTimeout(() => tryFinishApply(0), 0);
    try {
      mapRef.once('idle', () => tryFinishApply(0));
    } catch {}
  };
  try {
    // Avoid piling up listeners from rapid clicks
    mapRef.off('style.load', onStyleLoadOnce);
    mapRef.on('style.load', onStyleLoadOnce);
    // Rebuild label-layer index for the incoming style.
    try { mapRef.off('style.load', rebuildMapLabelLayerIndex); } catch {}
    try { mapRef.on('style.load', rebuildMapLabelLayerIndex); } catch {}
    // Some styles (Standard) populate layers after style.load; rebuild again at idle.
    try { mapRef.once('idle', rebuildMapLabelLayerIndex); } catch {}
    mapRef.setStyle(styleId);
    localStorage.setItem('mapStyleChoice', styleId);
  } catch (e) {
    console.warn('⚠️ Unable to set map style:', e);
    // Fallback to light if the chosen style fails
    if (styleId !== MAP_STYLES.light) {
      try {
        mapRef.setStyle(MAP_STYLES.light);
        localStorage.setItem('mapStyleChoice', MAP_STYLES.light);
      } catch (e2) {
        console.warn('⚠️ Fallback to light style also failed:', e2);
      }
    }
  }
}

// Application initialization
document.addEventListener('DOMContentLoaded', function() {
  // Tour now starts after password authentication (see index.html password overlay)
  // startOnboardingWalkthrough();

  // Sidebar hamburger toggle (collapse/expand)
  (function setupSidebarToggle() {
    const toggleBtn = document.getElementById('sidebarToggle');
    const menu = document.getElementById('sidebarMenu');
    const closeBtn = document.getElementById('sidebarMenuClose');
    const menuBackdrop = document.getElementById('sidebarMenuBackdrop');
    const body = document.body;
    const leftToggle = document.getElementById('toggleLeftSidebar');
    const rightToggle = document.getElementById('toggleRightSidebar');
    const closeLeftPanelBtn = document.getElementById('closeLeftPanelBtn');
    const closeRightPanelBtn = document.getElementById('closeRightPanelBtn');
    const startTourBtn = document.getElementById('menuStartTour');
    const dataLogicBtn = document.getElementById('menuDataLogic');
    const schoolProjectListBtn = document.getElementById('menuSchoolProjectList');
    const rightSidebar = document.getElementById('map-sidebar');
    const showMapBtn = document.getElementById('menuShowMap');
    const showFlowchartBtn = document.getElementById('menuShowFlowchart');
    const topBarStepIndicator = document.getElementById('topBarStepIndicator');
    const menuPageViewSection = document.getElementById('menuPageViewSection');
    const menuPageViewDivider = document.getElementById('menuPageViewDivider');

    // --- Mobile/iPad drawer helpers (allow both sidebars open at once) ---
    const isSmallScreen = () => {
      try {
        return window.matchMedia && window.matchMedia('(max-width: 1024px)').matches;
      } catch (e) {
        return false;
      }
    };

    const ensureBackdrop = () => {
      let el = document.getElementById('mobileDrawerBackdrop');
      if (el) return el;
      el = document.createElement('div');
      el.id = 'mobileDrawerBackdrop';
      el.style.position = 'fixed';
      el.style.left = '0';
      el.style.top = '0';
      el.style.width = '100vw';
      el.style.height = '100vh';
      el.style.background = 'rgba(0,0,0,0.35)';
      el.style.zIndex = '2090';
      el.style.display = 'none';
      el.addEventListener('click', () => {
        // Close BOTH drawers (user requested both can be open, but tapping backdrop closes all)
        body.classList.add('sidebar-collapsed');
        body.classList.add('right-sidebar-collapsed');
        if (leftToggle) leftToggle.checked = false;
        if (rightToggle) rightToggle.checked = false;
        updateMobileBackdrop();
        if (window.map && typeof window.map.resize === 'function') {
          setTimeout(() => window.map.resize(), 50);
        }
      });
      document.body.appendChild(el);
      return el;
    };

    const updateMobileBackdrop = () => {
      const backdrop = ensureBackdrop();
      if (!isSmallScreen()) {
        backdrop.style.display = 'none';
        return;
      }
      const leftOpen = !body.classList.contains('sidebar-collapsed');
      const rightOpen = !body.classList.contains('right-sidebar-collapsed');
      backdrop.style.display = (leftOpen || rightOpen) ? 'block' : 'none';
    };

    const ensureDrawerHeader = (sidebarEl, title, onClose) => {
      if (!sidebarEl) return;
      if (sidebarEl.querySelector('.mobile-drawer-header')) return;
      const header = document.createElement('div');
      header.className = 'mobile-drawer-header';
      header.style.display = isSmallScreen() ? 'flex' : 'none';
      header.style.alignItems = 'center';
      header.style.justifyContent = 'space-between';
      header.style.gap = '8px';
      header.style.padding = '10px 12px';
      header.style.borderBottom = '1px solid #e5e7eb';
      header.style.background = '#fff';
      header.style.position = 'sticky';
      header.style.top = '0';
      header.style.zIndex = '1';

      const label = document.createElement('div');
      label.textContent = title;
      label.style.fontWeight = '700';
      label.style.fontSize = '14px';
      label.style.color = '#111';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Close';
      btn.style.border = '1px solid #d1d5db';
      btn.style.background = '#fff';
      btn.style.borderRadius = '8px';
      btn.style.padding = '8px 10px';
      btn.style.cursor = 'pointer';
      btn.style.fontSize = '13px';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose && onClose();
      });

      header.appendChild(label);
      header.appendChild(btn);
      sidebarEl.insertBefore(header, sidebarEl.firstChild);

      // Keep header visibility in sync with breakpoints
      const syncHeaderVisibility = () => {
        header.style.display = isSmallScreen() ? 'flex' : 'none';
      };
      syncHeaderVisibility();
      window.addEventListener('resize', syncHeaderVisibility);
    };

    const setMenuViewActive = (mode) => {
      if (showMapBtn) showMapBtn.classList.toggle('active', mode === 'map');
      if (showFlowchartBtn) showFlowchartBtn.classList.toggle('active', mode === 'flowchart');
    };

    const syncMenuPageViewSection = (stepNum) => {
      const n = Number(stepNum);
      const showPageView = n === 3 || n === 4;
      if (menuPageViewSection) menuPageViewSection.hidden = !showPageView;
      if (menuPageViewDivider) menuPageViewDivider.hidden = !showPageView;
    };
    window.syncMenuPageViewSection = syncMenuPageViewSection;

    const syncMenuState = () => {
      if (leftToggle) leftToggle.checked = !body.classList.contains('sidebar-collapsed');
      if (rightToggle) rightToggle.checked = !body.classList.contains('right-sidebar-collapsed');
    };

    const showMenu = () => {
      if (!menu) return;
      body.classList.add('menu-open');
      syncMenuState();
      try {
        const step = window.__currentDashboardStep || 2;
        syncMenuPageViewSection(step);
      } catch {}
      updateMobileBackdrop();
      try { menu.focus && menu.focus(); } catch (e) {}
    };
    const hideMenu = () => {
      body.classList.remove('menu-open');
      updateMobileBackdrop();
    };

    // Expose for onboarding steps (and any other callers)
    window.openSidebarMenu = showMenu;
    window.closeSidebarMenu = hideMenu;

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        if (!menu) return;
        const isOpen = body.classList.contains('menu-open');
        if (isOpen) {
          hideMenu();
        } else {
          showMenu();
        }
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideMenu();
      });
    }
    if (menuBackdrop) {
      menuBackdrop.addEventListener('click', () => hideMenu());
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && body.classList.contains('menu-open')) {
        hideMenu();
      }
    });
    if (leftToggle) {
      leftToggle.addEventListener('change', () => {
        if (leftToggle.checked) {
          body.classList.remove('sidebar-collapsed');
        } else {
          body.classList.add('sidebar-collapsed');
        }
        updateMobileBackdrop();
        if (window.map && typeof window.map.resize === 'function') {
          setTimeout(() => window.map.resize(), 50);
        }
      });
    }
    if (rightToggle) {
      rightToggle.addEventListener('change', () => {
        const shouldShow = rightToggle.checked;
        if (shouldShow) {
          body.classList.remove('right-sidebar-collapsed');
        } else {
          body.classList.add('right-sidebar-collapsed');
        }
        updateMobileBackdrop();
        if (window.map && typeof window.map.resize === 'function') {
          setTimeout(() => window.map.resize(), 50);
        }
      });
    }

    // Hide controls / results panel shortcuts
    if (closeLeftPanelBtn) {
      closeLeftPanelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        body.classList.add('sidebar-collapsed');
        if (leftToggle) leftToggle.checked = false;
        updateMobileBackdrop();
        if (window.map && typeof window.map.resize === 'function') setTimeout(() => window.map.resize(), 50);
      });
    }
    if (closeRightPanelBtn) {
      closeRightPanelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        body.classList.add('right-sidebar-collapsed');
        if (rightToggle) rightToggle.checked = false;
        updateMobileBackdrop();
        if (window.map && typeof window.map.resize === 'function') setTimeout(() => window.map.resize(), 50);
      });
    }
    if (startTourBtn) {
      startTourBtn.addEventListener('click', () => {
        hideMenu();
        if (typeof window.startOnboardingWalkthrough === 'function') {
          window.startOnboardingWalkthrough({ force: true });
        }
      });
    }
    if (dataLogicBtn) {
      dataLogicBtn.addEventListener('click', () => {
        hideMenu();
        (window.openDashboardPopout || window.open)('pages/data-viewer.html?popout=1');
      });
    }
    if (schoolProjectListBtn) {
      schoolProjectListBtn.addEventListener('click', () => {
        hideMenu();
        // Opens the School Project List / profile page in a new tab.
        (window.openDashboardPopout || window.open)('school-profile.html?popout=1');
      });
    }
    if (topBarStepIndicator) {
      topBarStepIndicator.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showMenu();
      });
    }
    if (showMapBtn) {
      showMapBtn.addEventListener('click', () => {
        if (typeof window.switchToMap === 'function') {
          window.switchToMap();
        }
        setMenuViewActive('map');
      });
    }
    if (showFlowchartBtn) {
      showFlowchartBtn.addEventListener('click', () => {
        if (typeof window.switchToFlowchart === 'function') {
          window.switchToFlowchart();
        }
        setMenuViewActive('flowchart');
      });
    }
    document.querySelectorAll('.menu-nav-step[data-step]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const step = btn.getAttribute('data-step');
        if (step && typeof window._goToStep === 'function') {
          window._goToStep(Number(step));
        }
        hideMenu();
      });
    });
    // Map style radio buttons
    const styleRadios = document.querySelectorAll('input[name="mapStyle"]');
    styleRadios.forEach(r => {
      r.addEventListener('change', () => {
        if (r.checked) applyMapStyle(r.value);
      });
    });
    // Initialize radio selection from saved style

    // Map label toggles (Road / Place / POI)
    const roadCb = document.getElementById('toggleRoadLabels');
    const placeCb = document.getElementById('togglePlaceLabels');
    const poiCb = document.getElementById('togglePoiLabels');
    const aaCb = document.getElementById('toggleArticulationAreas');
    const prefs = getSavedMapLabelPrefs();
    if (roadCb) roadCb.checked = !!prefs.roadLabels;
    if (placeCb) placeCb.checked = !!prefs.placeLabels;
    if (poiCb) poiCb.checked = !!prefs.poiLabels;
    const onLabelChange = () => {
      saveMapLabelPrefs({
        roadLabels: roadCb ? roadCb.checked : true,
        placeLabels: placeCb ? placeCb.checked : true,
        poiLabels: poiCb ? poiCb.checked : true
      });
      console.warn('🗺️ Map Labels changed:', {
        roadLabels: roadCb ? roadCb.checked : true,
        placeLabels: placeCb ? placeCb.checked : true,
        poiLabels: poiCb ? poiCb.checked : true
      });
      try { applyMapLabelPrefs(); } catch {}
    };
    if (roadCb) roadCb.addEventListener('change', onLabelChange);
    if (placeCb) placeCb.addEventListener('change', onLabelChange);
    if (poiCb) poiCb.addEventListener('change', onLabelChange);
    if (aaCb) {
      const updateArticulationVisibility = () => {
        try {
          const m = window.map;
          if (!m) return;
          const vis = aaCb.checked ? 'visible' : 'none';
          const labelsVis = aaCb.checked ? 'visible' : 'none';
          if (m.getLayer('articulation-areas-fill')) m.setLayoutProperty('articulation-areas-fill', 'visibility', vis);
          if (m.getLayer('articulation-areas-outline')) m.setLayoutProperty('articulation-areas-outline', 'visibility', vis);
          if (m.getLayer('articulation-areas-labels')) m.setLayoutProperty('articulation-areas-labels', 'visibility', labelsVis);
        } catch (e) {}
        try { updateArticulationCompareSectionVisibility(); } catch (_) {}
        try { updateArticulationHistoricLegends(); } catch (_) {}
        try { if (aaCb.checked) scheduleArticulationLabelRefresh(); } catch (_) {}
      };
      aaCb.addEventListener('change', updateArticulationVisibility);
      updateArticulationCompareSectionVisibility();
    }
    const mapAaSelect = document.getElementById('mapArticulationAreaSelect');
    if (mapAaSelect && !mapAaSelect.__aaSelectBound) {
      mapAaSelect.__aaSelectBound = true;
      mapAaSelect.addEventListener('change', () => {
        const areaKey = (mapAaSelect.value || '').toString().trim();
        if (!areaKey) return;
        const data = articulationSchoolsByArea && articulationSchoolsByArea.get(areaKey);
        const areaName = (data && data.areaName) ? data.areaName : areaKey;
        saveLastArticulationAreaSelection(areaKey);
        if (typeof window.__aaOpenAreaPanel === 'function') {
          window.__aaOpenAreaPanel(areaName);
        }
      });
    }
    const bondCb = document.getElementById('toggleBondSpendingColors');
    const enrollCb = document.getElementById('toggleEnrollmentGrowthColors');

    const wireArticulationHistoricToggles = () => {
      refreshArticulationAreaPaintColors();
      updateArticulationHistoricLegends();
    };

    if (bondCb) {
      bondCb.addEventListener('change', () => {
        if (bondCb.checked && enrollCb) enrollCb.checked = false;
        wireArticulationHistoricToggles();
      });
    }
    if (enrollCb) {
      enrollCb.addEventListener('change', () => {
        if (enrollCb.checked && bondCb) bondCb.checked = false;
        wireArticulationHistoricToggles();
      });
    }
    updateArticulationHistoricLegends();
    try { refreshArticulationAreaPaintColors(); } catch (_) {}
    window.__updateArticulationHistoricLegends = updateArticulationHistoricLegends;
    window.__updateBondMapLegend = () => {
      refreshArticulationAreaPaintColors();
      updateArticulationHistoricLegends();
    };
    const savedStyle = getSavedMapStyle();
    styleRadios.forEach(r => { r.checked = r.value === savedStyle; });

    // Close menu on outside click
    document.addEventListener('click', (e) => {
      if (!menu || !toggleBtn) return;
      const target = e.target;
      if (menu.contains(target) || toggleBtn.contains(target)) return;
      hideMenu();
    });

    // Default: hide both sidebars on load
    body.classList.add('sidebar-collapsed');
    body.classList.add('right-sidebar-collapsed');
    syncMenuState();
    setMenuViewActive('map');
    updateMobileBackdrop();

    // Mobile drawer headers + close buttons
    ensureDrawerHeader(document.getElementById('sidebar'), 'Controls', () => {
      body.classList.add('sidebar-collapsed');
      if (leftToggle) leftToggle.checked = false;
      updateMobileBackdrop();
      if (window.map && typeof window.map.resize === 'function') setTimeout(() => window.map.resize(), 50);
    });
    ensureDrawerHeader(document.getElementById('map-sidebar'), 'Results', () => {
      body.classList.add('right-sidebar-collapsed');
      if (rightToggle) rightToggle.checked = false;
      updateMobileBackdrop();
      if (window.map && typeof window.map.resize === 'function') setTimeout(() => window.map.resize(), 50);
    });

    // Keep backdrop correct on resize/orientation changes
    window.addEventListener('resize', updateMobileBackdrop);
  })();

  // --- Scenario Modeling: Show options only after decision type is selected ---
  const decisionFilter = document.getElementById('decisionFilter');
  const scenarioOptionsContainer = document.getElementById('scenarioOptionsContainer');
  const assignmentModeDetails = document.getElementById('assignmentModeDetails');

  if (decisionFilter && scenarioOptionsContainer && assignmentModeDetails) {
    // --- Add a container for the investments table ---
    let investmentsTableContainer = document.getElementById('investmentsTableContainer');
    if (!investmentsTableContainer) {
      investmentsTableContainer = document.createElement('div');
      investmentsTableContainer.id = 'investmentsTableContainer';
      investmentsTableContainer.style.marginTop = '1em';
      scenarioOptionsContainer.parentNode.insertBefore(investmentsTableContainer, scenarioOptionsContainer.nextSibling);
    }

    function updateScenarioOptionsVisibility() {
      const ongoingContainer = document.getElementById('ongoingMonitoringContainer');
      const ongoingMessage = document.getElementById('ongoingMonitoringMessage');
      const ongoingList = document.getElementById('ongoingMonitoringList');
      // Hide all by default
      scenarioOptionsContainer.style.display = 'none';
      assignmentModeDetails.style.display = 'none';
      if (ongoingContainer) ongoingContainer.style.display = 'none';
      // Hide investments table by default
      investmentsTableContainer.style.display = 'none';
      investmentsTableContainer.innerHTML = '';

      if (decisionFilter.value === 'Ongoing Monitoring & Evaluation') {
        // Show only the message and list
        if (scenarioOptionsContainer) scenarioOptionsContainer.style.display = '';
        if (ongoingContainer && ongoingMessage && ongoingList) {
          ongoingContainer.style.display = '';
          ongoingMessage.textContent = 'These schools are in good condition and no immediate action is required.';
          // Get list of schools in this category
          let schools = [];
          if (window.decisionLogic && window.decisionLogic.schoolData) {
            schools = window.decisionLogic.schoolData.filter(row => row.decision === 'Ongoing Monitoring & Evaluation').map(row => row['Building Name']);
          }
          ongoingList.innerHTML = schools.length ? schools.map(s => `<li>${s}</li>`).join('') : '<li>No schools found.</li>';
        }
        if (assignmentModeDetails) assignmentModeDetails.style.display = 'none';
        // Hide school select and header
        const schoolSelectHeader = scenarioOptionsContainer.querySelector('h3');
        const schoolSelectDropdown = document.getElementById('schoolSelect');
        if (schoolSelectHeader) schoolSelectHeader.style.display = 'none';
        if (schoolSelectDropdown) schoolSelectDropdown.style.display = 'none';
        return;
      }
      // --- Show message and list for School-specific evaluation of alternative options ---
      if (decisionFilter.value === 'School-specific evaluation of alternative options') {
        if (scenarioOptionsContainer) scenarioOptionsContainer.style.display = '';
        if (ongoingContainer && ongoingMessage && ongoingList) {
          ongoingContainer.style.display = '';
          ongoingMessage.textContent = 'The uniqueness of these schools require school specific evaluation.';
          // Get list of schools in this category
          let schools = [];
          if (window.decisionLogic && window.decisionLogic.schoolData) {
            schools = window.decisionLogic.schoolData.filter(row => row.decision === 'School-specific evaluation of alternative options').map(row => row['Building Name']);
          }
          ongoingList.innerHTML = schools.length ? schools.map(s => `<li>${s}</li>`).join('') : '<li>No schools found.</li>';
        }
        if (assignmentModeDetails) assignmentModeDetails.style.display = 'none';
        // Hide school select and header
        const schoolSelectHeader = scenarioOptionsContainer.querySelector('h3');
        const schoolSelectDropdown = document.getElementById('schoolSelect');
        if (schoolSelectHeader) schoolSelectHeader.style.display = 'none';
        if (schoolSelectDropdown) schoolSelectDropdown.style.display = 'none';
        return;
      }
      // --- Show investments table for Building & Programmatic Investments, Programmatic Investment, or Building Investment ---
      if (
        decisionFilter.value === 'Building & Programmatic Investments' ||
        decisionFilter.value === 'Building Investment'
      ) {
        if (scenarioOptionsContainer) scenarioOptionsContainer.style.display = '';
        if (assignmentModeDetails) assignmentModeDetails.style.display = 'none';
        // Hide school select and header
        const schoolSelectHeader = scenarioOptionsContainer.querySelector('h3');
        const schoolSelectDropdown = document.getElementById('schoolSelect');
        if (schoolSelectHeader) schoolSelectHeader.style.display = 'none';
        if (schoolSelectDropdown) schoolSelectDropdown.style.display = 'none';
        // Build the table
        if (window.decisionLogic && window.decisionLogic.schoolData) {
          const data = window.decisionLogic.schoolData;
          // Helper to format square footage with 'K' for thousands
          function formatSquareFt(value) {
            if (!value) return '';
            const num = parseFloat(value.toString().replace(/,/g, ''));
            if (isNaN(num)) return value;
            if (num >= 1000) return (num / 1000).toLocaleString(undefined, {maximumFractionDigits: 0}) + 'K';
            return num.toLocaleString();
          }
          // Helper to format cost (optional: add $ and commas)
          let costMultiplier = 300; // Default multiplier
          function formatCost(value) {
            if (!value) return '';
            const num = parseFloat(value.toString().replace(/,/g, ''));
            if (isNaN(num)) return value;
            // Multiply square footage by the selected multiplier to get cost
            const cost = num * costMultiplier;
            if (cost >= 1_000_000) {
              return '$' + (cost / 1_000_000).toLocaleString(undefined, {maximumFractionDigits: 2}) + 'M';
            }
            return '$' + cost.toLocaleString();
          }
          
          // Function to update cost display when multiplier changes
          function updateCostDisplay() {
            if (window.decisionLogic && window.decisionLogic.schoolData) {
              const data = window.decisionLogic.schoolData;
              // Calculate total cost
              const totalSquareFt = data.filter(row => 
                row.decision === 'Building & Programmatic Investments' || 
                row.decision === 'Building Investment'
              ).reduce((sum, row) => sum + (parseFloat(row['SquareFt']) || 0), 0);
              // Rebuild the table with new multiplier
              let tableHTML = `<table class=\"data-table\"><thead><tr><th>School Name</th><th>Square Footage</th><th>Cost <div style=\"display:flex; gap:5px; margin-top:5px; justify-content:center;\">
                <span class=\"dollar-sign-tooltip\" style=\"cursor:pointer; padding:2px 4px; border-radius:3px; background:${costMultiplier === 300 ? '#007cbf' : '#e0e0e0'}; color:${costMultiplier === 300 ? 'white' : 'black'};\" onclick=\"updateCostMultiplier(300)\" data-tooltip=\"Low level renovation\">$</span>
                <span class=\"dollar-sign-tooltip\" style=\"cursor:pointer; padding:2px 4px; border-radius:3px; background:${costMultiplier === 600 ? '#007cbf' : '#e0e0e0'}; color:${costMultiplier === 600 ? 'white' : 'black'};\" onclick=\"updateCostMultiplier(600)\" data-tooltip=\"Medium level renovation\">$$</span>
                <span class=\"dollar-sign-tooltip\" style=\"cursor:pointer; padding:2px 4px; border-radius:3px; background:${costMultiplier === 1200 ? '#007cbf' : '#e0e0e0'}; color:${costMultiplier === 1200 ? 'white' : 'black'};\" onclick=\"updateCostMultiplier(1200)\" data-tooltip=\"High level renovation\">$$$</span>
              </div></th></tr></thead><tbody>`;
              
              // Add total row at the top
              tableHTML += `<tr style=\"font-weight:bold; background:#cccccc;\"><td style='border:1px solid #888;'>Total</td><td style='border:1px solid #888;'>${formatSquareFt(totalSquareFt)}</td><td style='border:1px solid #888;'>${formatCost(totalSquareFt)}</td></tr>`;
              
              // Determine order based on selected filter
              let sectionOrder;
              if (decisionFilter.value === 'Building Investment') {
                sectionOrder = [
                  {type: 'Building Investment', label: 'Building Investment', color: '#2ecc71'},
                  {type: 'Building & Programmatic Investments', label: 'Building & Programmatic Investments', color: '#1abc9c'},
                ];
              } else {
                sectionOrder = [
                  {type: 'Building & Programmatic Investments', label: 'Building & Programmatic Investments', color: '#1abc9c'},
                  {type: 'Building Investment', label: 'Building Investment', color: '#2ecc71'},
                ];
              }
              sectionOrder.forEach(section => {
                const rows = buildRows(section.type);
                if (rows) {
                  tableHTML += `<tr><td colspan=\"3\" style=\"font-weight:bold;background:#f2f2f2;color:#000;\">${section.label}</td></tr>` + rows;
                }
              });
              tableHTML += '</tbody></table>';
              investmentsTableContainer.innerHTML = tableHTML;
              investmentsTableContainer.style.display = '';
              setupDollarSignTooltips(); // <-- Add this line
            }
          }
          
          // Global function to update cost multiplier
          window.updateCostMultiplier = function(multiplier) {
            costMultiplier = multiplier;
            updateCostDisplay();
          };
          
          // Helper to build rows for a category
          function buildRows(decisionType) {
            return data.filter(row => row.decision === decisionType)
              .map(row => `<tr><td class="truncate-cell" data-tooltip="${row['Building Name']}">${row['Building Name']}</td><td>${formatSquareFt(row['SquareFt'])}</td><td>${formatCost(row['SquareFt'])}</td></tr>`)
              .join('');
          }
          let tableHTML = `<table class=\"data-table\"><thead><tr><th>School Name</th><th>Square Footage</th><th>Cost <div style=\"display:flex; gap:5px; margin-top:5px; justify-content:center;\">
            <span class=\"dollar-sign-tooltip\" style=\"cursor:pointer; padding:2px 4px; border-radius:3px; background:${costMultiplier === 300 ? '#007cbf' : '#e0e0e0'}; color:${costMultiplier === 300 ? 'white' : 'black'};\" onclick=\"updateCostMultiplier(300)\" data-tooltip=\"Low renovation\">$</span>
            <span class=\"dollar-sign-tooltip\" style=\"cursor:pointer; padding:2px 4px; border-radius:3px; background:${costMultiplier === 600 ? '#007cbf' : '#e0e0e0'}; color:${costMultiplier === 600 ? 'white' : 'black'};\" onclick=\"updateCostMultiplier(600)\" data-tooltip=\"Medium renovation\">$$</span>
            <span class=\"dollar-sign-tooltip\" style=\"cursor:pointer; padding:2px 4px; border-radius:3px; background:${costMultiplier === 1200 ? '#007cbf' : '#e0e0e0'}; color:${costMultiplier === 1200 ? 'white' : 'black'};\" onclick=\"updateCostMultiplier(1200)\" data-tooltip=\"High renovation\">$$$</span>
          </div></th></tr></thead><tbody>`;
          
          // Calculate total cost for initial display
          const totalSquareFt = data.filter(row => 
            row.decision === 'Building & Programmatic Investments' || 
            row.decision === 'Building Investment'
          ).reduce((sum, row) => sum + (parseFloat(row['SquareFt']) || 0), 0);
          // Add total row at the top
          tableHTML += `<tr style=\"font-weight:bold; background:#cccccc;\"><td style='border:1px solid #888;'>Total</td><td style='border:1px solid #888;'>${formatSquareFt(totalSquareFt)}</td><td style='border:1px solid #888;'>${formatCost(totalSquareFt)}</td></tr>`;
          
          // Determine order based on selected filter
          let sectionOrder;
          if (decisionFilter.value === 'Building Investment') {
            sectionOrder = [
              {type: 'Building Investment', label: 'Building Investment', color: '#2ecc71'},
              {type: 'Building & Programmatic Investments', label: 'Building & Programmatic Investments', color: '#1abc9c'},
            ];
          } else {
            sectionOrder = [
              {type: 'Building & Programmatic Investments', label: 'Building & Programmatic Investments', color: '#1abc9c'},
              {type: 'Building Investment', label: 'Building Investment', color: '#2ecc71'},
            ];
          }
          sectionOrder.forEach(section => {
            const rows = buildRows(section.type);
            if (rows) {
              tableHTML += `<tr><td colspan=\"3\" style=\"font-weight:bold;background:#f2f2f2;color:#000;\">${section.label}</td></tr>` + rows;
            }
          });
          tableHTML += '</tbody></table>';
          investmentsTableContainer.innerHTML = tableHTML;
          investmentsTableContainer.style.display = '';
          setupDollarSignTooltips(); // <-- Add this line
        }
        return;
      }
      // --- Show message and list for Programmatic Investment ---
      if (decisionFilter.value === 'Programmatic Investment') {
        if (scenarioOptionsContainer) scenarioOptionsContainer.style.display = '';
        if (ongoingContainer && ongoingMessage && ongoingList) {
          ongoingContainer.style.display = '';
          ongoingMessage.textContent = 'These schools need academic investments.';
          // Get list of schools in this category
          let schools = [];
          if (window.decisionLogic && window.decisionLogic.schoolData) {
            schools = window.decisionLogic.schoolData.filter(row => row.decision === 'Programmatic Investment').map(row => row['Building Name']);
          }
          ongoingList.innerHTML = schools.length ? schools.map(s => `<li>${s}</li>`).join('') : '<li>No schools found.</li>';
        }
        if (assignmentModeDetails) assignmentModeDetails.style.display = 'none';
        // Hide school select and header
        const schoolSelectHeader = scenarioOptionsContainer.querySelector('h3');
        const schoolSelectDropdown = document.getElementById('schoolSelect');
        if (schoolSelectHeader) schoolSelectHeader.style.display = 'none';
        if (schoolSelectDropdown) schoolSelectDropdown.style.display = 'none';
        // Hide the investments table
        if (investmentsTableContainer) {
          investmentsTableContainer.style.display = 'none';
          investmentsTableContainer.innerHTML = '';
        }
        return;
      }
      // Show normal options
      if (scenarioOptionsContainer) scenarioOptionsContainer.style.display = '';
      if (ongoingContainer) ongoingContainer.style.display = 'none';
      if (assignmentModeDetails) assignmentModeDetails.style.display = '';
      // Show school select and header
      const schoolSelectHeader = scenarioOptionsContainer.querySelector('h3');
      const schoolSelectDropdown = document.getElementById('schoolSelect');
      if (schoolSelectHeader) schoolSelectHeader.style.display = '';
      if (schoolSelectDropdown) schoolSelectDropdown.style.display = '';
    }
    decisionFilter.addEventListener('change', updateScenarioOptionsVisibility);
    // Initial state
    updateScenarioOptionsVisibility();
    // Expose globally so it can be called from elsewhere
    window.updateScenarioOptionsVisibility = updateScenarioOptionsVisibility;
  }
});

const JEFFCO_STARTUP_BOUNDS = [
  [-105.3729216, 39.47280646],
  [-105.0543277, 39.90533128]
];

const map = new mapboxgl.Map({
  container: 'map',
  style: getSavedMapStyle(),
  bounds: JEFFCO_STARTUP_BOUNDS,
  fitBoundsOptions: {
    padding: { top: 48, bottom: 48, left: 48, right: 48 },
    duration: 0
  }
});

// Expose map and geojsonData globally for prioritization UI
window.map = map;
window.geojsonData = null; // Will be set when geojson is loaded
window.__mapSchoolFitPending = true;
window.__mapSchoolFitVerified = false;

function getSchoolBoundsLngLat() {
  const dataToUse = originalGeojsonData || geojsonData || window.geojsonData;
  if (!dataToUse || !dataToUse.features || !dataToUse.features.length) return null;
  const bounds = new mapboxgl.LngLatBounds();
  let count = 0;
  for (const f of dataToUse.features) {
    const c = f.geometry && f.geometry.coordinates;
    if (!Array.isArray(c) || c.length < 2) continue;
    const lng = Number(c[0]);
    const lat = Number(c[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    bounds.extend([lng, lat]);
    count++;
  }
  return count > 0 ? bounds : null;
}

function mapNeedsSchoolExtentFit(mapInst) {
  if (!mapInst) return true;
  if (window.__mapSchoolFitVerified) return false;
  try {
    const z = mapInst.getZoom();
    const c = mapInst.getCenter();
    if (!Number.isFinite(z) || z < 7) return true;
    if (!c || c.lng > -100 || c.lng < -106.5 || c.lat < 37 || c.lat > 41) return true;
  } catch {
    return true;
  }
  return false;
}

let _fitMapToAllSchoolsTimer = null;
window.scheduleFitMapToAllSchools = function(delayMs) {
  const delay = delayMs == null ? 80 : delayMs;
  if (_fitMapToAllSchoolsTimer) clearTimeout(_fitMapToAllSchoolsTimer);
  _fitMapToAllSchoolsTimer = setTimeout(() => {
    _fitMapToAllSchoolsTimer = null;
    if (typeof window.fitMapToAllSchools === 'function') window.fitMapToAllSchools();
  }, delay);
};

window.fitMapToAllSchools = function(options) {
  const opts = options || {};
  const mapToUse = window.map || map;
  if (!mapToUse) {
    console.warn('⚠️ fitMapToAllSchools: map not ready');
    return false;
  }

  const bounds = getSchoolBoundsLngLat();
  if (!bounds) {
    console.warn('⚠️ fitMapToAllSchools: no school coordinates yet');
    return false;
  }

  const runFit = () => {
    const container = mapToUse.getContainer && mapToUse.getContainer();
    const w = container ? container.clientWidth : 0;
    const h = container ? container.clientHeight : 0;
    if (w < 50 || h < 50) {
      window.__mapFitSizeRetries = (window.__mapFitSizeRetries || 0) + 1;
      if (window.__mapFitSizeRetries < 25) {
        window.scheduleFitMapToAllSchools(120);
      }
      return false;
    }
    window.__mapFitSizeRetries = 0;

    if (mapToUse.resize) mapToUse.resize();

    try {
      mapToUse.fitBounds(bounds, {
        padding: { top: 48, bottom: 48, left: 48, right: 48 },
        maxZoom: 12,
        duration: opts.instant ? 0 : 800,
      });
    } catch (e) {
      console.warn('⚠️ fitBounds failed:', e);
      return false;
    }

    const verify = () => {
      if (!mapNeedsSchoolExtentFit(mapToUse)) {
        window.__mapSchoolFitPending = false;
        window.__mapSchoolFitVerified = true;
        window.__mapFitVerifyRetries = 0;
        console.log('✅ Map framed to school extents (zoom', mapToUse.getZoom().toFixed(2) + ')');
        return;
      }
      window.__mapFitVerifyRetries = (window.__mapFitVerifyRetries || 0) + 1;
      if (window.__mapFitVerifyRetries < 8) {
        window.__mapSchoolFitPending = true;
        window.scheduleFitMapToAllSchools(150);
      }
    };

    if (typeof mapToUse.once === 'function') {
      mapToUse.once('idle', verify);
    } else {
      setTimeout(verify, 100);
    }
    return true;
  };

  if (mapToUse.isStyleLoaded && mapToUse.isStyleLoaded()) {
    requestAnimationFrame(() => requestAnimationFrame(runFit));
  } else if (typeof mapToUse.once === 'function') {
    // 'idle' rather than 'load': the style also reports unloaded right after a
    // source update, and 'load' has already fired by then so it never returns.
    mapToUse.once('idle', () => requestAnimationFrame(() => requestAnimationFrame(runFit)));
  } else {
    setTimeout(runFit, 100);
  }
  return true;
};

let geojsonData;
let originalGeojsonData; // Keep a copy of the original unfiltered data
// (cleanup) Removed unused state placeholders (initialDecisionData, mapIsReady).
let selectedTypes = [];
let minEnrollment = 0;
let maxEnrollment = 2000;
let minSeats = -500;  // Allow negative seats (over capacity schools)
let maxSeats = 500;
let enrollmentSliderBounds = { min: 0, max: 2500 };
let seatsSliderBounds = { min: -2000, max: 5000 };
let seatsRangeInitialSynced = false;

function applyShowHideDualRange(minEl, maxEl, boundsMin, boundsMax, startMin, startMax) {
  if (!minEl || !maxEl) return false;
  const lo = Math.max(boundsMin, Math.min(startMin, boundsMax));
  const hi = Math.min(boundsMax, Math.max(startMax, boundsMin));
  minEl.min = String(boundsMin);
  minEl.max = String(boundsMax);
  maxEl.min = String(boundsMin);
  maxEl.max = String(boundsMax);
  minEl.value = String(Math.min(lo, hi));
  maxEl.value = String(Math.max(lo, hi));
  return true;
}

function setupShowHideDualRange(minEl, maxEl, { min, max, step, initialMin, initialMax, onUpdate }) {
  if (!minEl || !maxEl || typeof onUpdate !== 'function') return null;
  minEl.step = String(step);
  maxEl.step = String(step);

  const emit = () => {
    let lo = Number(minEl.value);
    let hi = Number(maxEl.value);
    if (lo > hi) {
      if (document.activeElement === minEl) {
        lo = hi;
        minEl.value = String(lo);
      } else {
        hi = lo;
        maxEl.value = String(hi);
      }
    }
    onUpdate(lo, hi);
  };

  applyShowHideDualRange(minEl, maxEl, min, max, initialMin, initialMax);
  emit();

  minEl.addEventListener('input', emit);
  maxEl.addEventListener('input', emit);

  return {
    setBounds(boundsMin, boundsMax, values) {
      const startLo = values ? values[0] : boundsMin;
      const startHi = values ? values[1] : boundsMax;
      applyShowHideDualRange(minEl, maxEl, boundsMin, boundsMax, startLo, startHi);
      emit();
    },
    setValues(lo, hi) {
      applyShowHideDualRange(
        minEl,
        maxEl,
        Number(minEl.min),
        Number(maxEl.max),
        lo,
        hi
      );
      emit();
    },
  };
}

function upgradeToSleekSingleRange(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  root.querySelectorAll('input[type="range"]').forEach((input) => {
    if (input.closest('.sleek-single-range') || input.closest('.show-hide-dual-range')) return;
    const wrap = document.createElement('div');
    wrap.className = 'sleek-single-range';
    input.classList.add('sleek-single-range__input');
    const parent = input.parentNode;
    if (!parent) return;
    parent.insertBefore(wrap, input);
    wrap.appendChild(input);
  });
}
try { window.upgradeToSleekSingleRange = upgradeToSleekSingleRange; } catch (_) {}

function resyncSeatsSliderFromDecisionData(options = {}) {
  const { force = false, markInitialSynced = false } = options;
  if (seatsRangeInitialSynced && !force) return false;

  const data = window.decisionLogic && Array.isArray(window.decisionLogic.schoolData)
    ? window.decisionLogic.schoolData
    : null;
  if (!data || !data.length) return false;

  const getSeats = (r) => {
    const v = window.getEffectiveAvailableSeats && window.getEffectiveAvailableSeats(r);
    return Number.isFinite(v) ? v : 0;
  };
  const seatValues = data.map((r) => getSeats(r));
  if (!seatValues.length) return false;

  const minVal = Math.min(...seatValues);
  const maxVal = Math.max(...seatValues);
  if (!Number.isFinite(minVal) || !Number.isFinite(maxVal)) return false;

  const paddedMin = Math.floor(minVal / 10) * 10;
  const paddedMax = Math.ceil(maxVal / 10) * 10;
  const safeMax = paddedMax > paddedMin ? paddedMax : (paddedMin + 10);

  const minSeatsRange = document.getElementById('minSeatsRange');
  const maxSeatsRange = document.getElementById('maxSeatsRange');
  const minSeatsDisplay = document.getElementById('minSeatsDisplay');
  const maxSeatsDisplay = document.getElementById('maxSeatsDisplay');
  if (!minSeatsRange || !maxSeatsRange) return false;

  seatsSliderBounds = { min: paddedMin, max: safeMax };
  applyShowHideDualRange(minSeatsRange, maxSeatsRange, paddedMin, safeMax, paddedMin, safeMax);
  minSeats = paddedMin;
  maxSeats = safeMax;
  if (minSeatsDisplay) minSeatsDisplay.textContent = paddedMin;
  if (maxSeatsDisplay) maxSeatsDisplay.textContent = safeMax;
  if (markInitialSynced) {
    seatsRangeInitialSynced = true;
  }
  if (force) {
    try { updateLayer(); } catch {}
  }
  return true;
}
window.resyncSeatsSliderFromDecisionData = resyncSeatsSliderFromDecisionData;
// Landing page default: size dots by capacity/enrollment
let showVariableRadius = true;
let showUtilizationPie = false;
let selectedFlows = ['expansion', 'maintenance', 'closure', 'other']; // Track selected flows
let schoolDistancesByOrigin = {}; // Origin UniqueID -> array of destination rows (normalized lower)
let nearbyFilterIds = null; // Active filter (origin + destinations), stored normalized
// (cleanup) Removed unused state placeholders (nearbyOverlapOnly, nearbyShowAllSchools).
let includeNonEvalSchools = false; // Include Include_Flow_Chart = "No"
let includeClosedSchools = false; // Include status = "Closed"/"No"

function isClosedSchoolFeature(feature) {
  const p = feature?.properties || {};
  const statusNorm = (p.status || p.Status || '').toString().trim().toLowerCase();
  return (
    p.isClosed === true ||
    p['isClosed'] === true ||
    statusNorm === 'no' ||
    statusNorm.includes('closed')
  );
}

function isNonEvalSchoolFeature(feature) {
  const p = feature?.properties || {};
  if (p.isNonEval === true || p['isNonEval'] === true) return true;
  const includeVal = (p.includeFlowChart || p['Include_Flow_Chart'] || '').toString().trim().toLowerCase();
  const includeYes = includeVal === 'yes' || includeVal === 'y' || includeVal === 'true' || includeVal === '1';
  return !includeYes;
}

function shouldUseSparseSchoolTooltip(feature) {
  return isClosedSchoolFeature(feature) || isNonEvalSchoolFeature(feature);
}

function isUnknownDisplayValue(value) {
  const v = (value || '').toString().trim().toLowerCase();
  return !v || v === 'unknown' || v === 'no data';
}

function hasPositiveNumeric(value) {
  const n = parseFloat(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) && n > 0;
}

function hasMeaningfulFciForSparseSchoolTooltip(feature, entry) {
  if (fciSelectedSystem) {
    const sysEntry = entry?.bySystem?.get(fciSelectedSystem);
    const p1 = sysEntry?.priorityCosts?.[1];
    if (Number.isFinite(p1) && p1 > 0) return true;
    const p1Avg = sysEntry?.priorityAvgCostPerSf?.[1];
    return Number.isFinite(p1Avg) && p1Avg > 0;
  }
  const overall = entry?.overallFci ?? feature?.properties?.__fciOverall;
  if (Number.isFinite(overall) && overall > 0) return true;
  const status = (feature?.properties?.__fciStatus || '').toString().trim();
  if (isUnknownDisplayValue(status) || status === 'No Deferred Maintenance') return false;
  return Number.isFinite(overall);
}

let mapExportRowsData = []; // Rows from Map_Export.csv
let mapExportLookupMaps = { byName: new Map(), byCode: new Map() }; // Lookups for name/code
let decisionAllRows = []; // Full Decision Data Export.csv rows (includes excluded schools)
let decisionAllByName = new Map(); // normalized name -> row
let decisionAllById = new Map();   // normalized UniqueID -> row
let articulationSchoolsByArea = new Map(); // area name -> array of school names

// Normalize school level strings from data to our filter values
function normalizeSchoolLevel(level) {
  const norm = (level || '').toString().trim().toLowerCase();
  if (!norm) return '';
  if (norm.includes('elementary')) return 'Elementary';
  if (norm.includes('middle')) return 'Middle';
  if (norm.includes('high')) return 'High';
  if (norm.includes('k-8') || norm.includes('k8')) return 'K-8';
  if (norm.includes('alternative')) return 'Alternative';
  if (norm.includes('multi') || norm.includes('multi-level') || norm.includes('multilevel')) return 'Multi-Level';
  if (norm.includes('option')) return 'Option';
  return level; // fallback to raw value
}

// Ensure the map-origin dropdown shows the selected school's name even when set programmatically
function setMapOriginSelect(originId, schoolName) {
  const mapOriginSelect = document.getElementById('mapOriginSchoolSelect');
  if (!mapOriginSelect) return;
  const schoolDisplayName = mainDisplaySchoolName(schoolName);

  const norm = (s) => (s || '').toString().trim().toLowerCase();
  let match = null;

  if (originId) {
    match = Array.from(mapOriginSelect.options || []).find(opt => opt.value === originId);
  }

  if (!match && schoolName) {
    match = Array.from(mapOriginSelect.options || []).find(
      opt => norm(opt.textContent) === norm(schoolName) || norm(opt.textContent) === norm(schoolDisplayName) || norm(opt.value) === norm(schoolName)
    );
  }

  if (!match) {
    const opt = document.createElement('option');
    opt.value = originId || schoolName || '';
    opt.textContent = schoolDisplayName || originId || '';
    mapOriginSelect.appendChild(opt);
    match = opt;
  } else if (schoolDisplayName && match.textContent !== schoolDisplayName) {
    match.textContent = schoolDisplayName;
  }

  mapOriginSelect.value = match.value;
  Array.from(mapOriginSelect.options || []).forEach(opt => {
    opt.selected = opt === match;
  });

  // Keep "School Matches" hidden until a school is selected (even for programmatic changes)
  setNearbySchoolsSectionVisibility(mapOriginSelect.value, schoolName);
}

const SCHOOL_MATCHES_INACTIVE_MSG = 'Select one or more match filters above to view schools.';

function setSchoolMatchesSummaryHelper(showInSummary, message = SCHOOL_MATCHES_INACTIVE_MSG) {
  const helper = document.getElementById('schoolMatchesSummaryHelper');
  if (!helper) return;
  if (showInSummary) {
    helper.textContent = message;
    helper.hidden = false;
  } else {
    helper.textContent = '';
    helper.hidden = true;
  }
}

function updateSchoolMatchesHeading(schoolName) {
  const heading = document.getElementById('schoolMatchesHeading');
  if (!heading) return;
  const displayName = schoolName ? mainDisplaySchoolName(schoolName) : '';
  heading.textContent = displayName
    ? `School Matches to ${displayName}`
    : 'School Matches';
}

function setNearbySchoolsSectionVisibility(selectedId, schoolName = '') {
  const block = document.getElementById('schoolMatchesBlock');
  const tableDetails = document.getElementById('schoolMatchesTableDetails');
  if (!block) return;

  const hasSelection = !!(selectedId && selectedId.toString().trim());
  block.style.display = hasSelection ? '' : 'none';
  if (tableDetails) tableDetails.open = false;

  if (hasSelection) {
    let resolvedName = schoolName;
    if (!resolvedName && window.decisionLogic && Array.isArray(window.decisionLogic.schoolData)) {
      const row = window.decisionLogic.schoolData.find(r => {
        const uid = (r.UniqueID || r["UniqueID"] || r["Unique Id"] || '').toString().trim();
        return uid === selectedId.toString().trim();
      });
      resolvedName = row ? row["Building Name"] : '';
    }
    updateSchoolMatchesHeading(resolvedName);
  } else {
    updateSchoolMatchesHeading('');
    setSchoolMatchesSummaryHelper(false);
    const list = document.getElementById('nearbySchoolsList');
    if (list) list.textContent = '';
  }
}

function getSchoolMatchesFilterOptions() {
  const withinCb = document.getElementById('schoolMatchesWithinDistance');
  const overlapCb = document.getElementById('schoolMatchesOverlappingGrades');
  const withinDistanceOnly = !!(withinCb && withinCb.checked);
  const overlapOnly = !!(overlapCb && overlapCb.checked);
  return {
    withinDistanceOnly,
    overlapOnly,
    active: withinDistanceOnly || overlapOnly,
  };
}

function getNearbyDistanceThresholdForOriginKey(originKey) {
  const norm = (s) => (s || '').toString().trim().toLowerCase();
  const key = norm(originKey);
  const decisionRows = (window.decisionLogic && Array.isArray(window.decisionLogic.schoolData))
    ? window.decisionLogic.schoolData
    : [];
  const originRow = decisionRows.find(r => norm(r.UniqueID || r["UniqueID"] || r["Unique Id"]) === key);
  const thresholds = window.thresholds || (window.decisionLogic && window.decisionLogic.thresholds) || {};
  const levelStr = ((originRow && originRow["School Level"]) || '').toString().toLowerCase();
  if (levelStr.includes('elementary')) return thresholds.elementaryDistance;
  if (levelStr.includes('k-8')) return thresholds.k8Distance;
  if (levelStr.includes('middle')) return thresholds.middleDistance;
  if (levelStr.includes('high')) return thresholds.highDistance;
  if (levelStr.includes('6-12')) return thresholds.k12Distance;
  const fallback = parseFloat(thresholds.middleDistance);
  return Number.isFinite(fallback) ? fallback : 5.0;
}

function cleanNearbyCsvText(val) {
  return (val || '').toString().trim().replace(/^'+\s*/, '');
}

function rowPassesNearbySchoolFilter(row, originKey, options = {}) {
  const { overlapOnly = false, withinDistanceOnly = true } = options;
  if (withinDistanceOnly && originKey) {
    const threshold = getNearbyDistanceThresholdForOriginKey(originKey);
    const distVal = parseFloat(row.distanceMiles);
    if (Number.isFinite(threshold) && (!Number.isFinite(distVal) || distVal > threshold)) return false;
  }
  if (overlapOnly) {
    const overlapClean = cleanNearbyCsvText(row.gradeOverlap);
    if (overlapClean && overlapClean.toLowerCase() === 'no') return false;
  }
  return true;
}

function lookupDestSchoolLevel(destId, destName) {
  const norm = (s) => (s || '').toString().trim().toLowerCase();
  const rows = (window.decisionLogic && Array.isArray(window.decisionLogic.schoolData))
    ? window.decisionLogic.schoolData
    : [];
  const match = rows.find(r => {
    const uid = norm(r.UniqueID || r["UniqueID"] || r["Unique Id"]);
    const name = norm(r["Building Name"]);
    return (destId && uid === norm(destId)) || (destName && name === norm(destName));
  });
  return match ? (match["School Level"] || '—') : '—';
}

function renderNearbySchoolsTableHtml(rows, { showOverlapColumn = true } = {}) {
  const tableRows = rows.map(r => {
    const name = r.destName || r.destId || 'School';
    const displayName = mainDisplaySchoolName(name);
    const level = lookupDestSchoolLevel(r.destId, r.destName);
    const overlapClean = cleanNearbyCsvText(r.gradeOverlap);
    const overlap = overlapClean && overlapClean.toLowerCase() !== 'no' ? overlapClean : '—';
    const distVal = parseFloat(r.distanceMiles);
    const dist = Number.isFinite(distVal) ? `${distVal.toFixed(1)} mi` : 'N/A';
    const overlapCell = showOverlapColumn
      ? `<td class="col-overlap">${overlap}</td>`
      : '';
    return `
      <tr>
        <td class="col-school" title="${displayName}">${displayName}</td>
        <td class="col-level">${level}</td>
        ${overlapCell}
        <td class="col-distance">${dist}</td>
      </tr>`;
  }).join('');
  const overlapHeader = showOverlapColumn
    ? '<th class="col-overlap">Grade Overlap</th>'
    : '';
  return `
    <table class="nearby-schools-table">
      <thead>
        <tr>
          <th class="col-school">School</th>
          <th class="col-level">School Level</th>
          ${overlapHeader}
          <th class="col-distance">Distance</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>`;
}

function refreshNearbySchoolMatchesUi(originId, originName) {
  const opts = getSchoolMatchesFilterOptions();
  applyNearbyFilter(originId, originName, opts);
}

function getOriginIdForName(schoolName) {
  const norm = (s) => (s || '').toString().trim().toLowerCase();
  if (!schoolName || !window.decisionLogic || !Array.isArray(window.decisionLogic.schoolData)) return '';
  const row = window.decisionLogic.schoolData.find(r => norm(r["Building Name"]) === norm(schoolName));
  if (!row) return '';
  return (row.UniqueID || row["UniqueID"] || row["Unique Id"] || '').toString().trim();
}

// Clear the selected-school highlight ring on the map
function clearSelectedSchoolHighlight() {
  try {
    if (!window.map || typeof window.map.getSource !== 'function') return;
    const src = window.map.getSource('selected-school');
    if (!src || typeof src.setData !== 'function') return;
    src.setData({ type: 'FeatureCollection', features: [] });
  } catch (e) {
    console.warn("⚠️ Unable to clear selected-school highlight:", e);
  }
}

// Given an origin + destination, show the distance using the SchooltoSchoolDistances.csv data.
// This is used when an origin is already selected and the user clicks a different school on the map.
window.updateDistanceToSelected = function(originId, destId, destName, coordinates) {
  const norm = (s) => (s || '').toString().trim().toLowerCase();
  const originKey = norm(originId);
  const destKey = norm(destId);
  const originName = window.currentOriginName || 'selected school';
  const destinationName = destName || destId || 'destination school';

  let distMiles = null;
  try {
    if (originKey && destKey && originKey === destKey) {
      distMiles = 0;
    } else if (originKey && window.schoolDistancesByOrigin && Array.isArray(window.schoolDistancesByOrigin[originKey])) {
      const rows = window.schoolDistancesByOrigin[originKey];
      const match =
        rows.find(r => norm(r.destId) === destKey) ||
        rows.find(r => norm(r.destName) === norm(destinationName));
      if (match && match.distanceMiles !== null && match.distanceMiles !== undefined && match.distanceMiles !== '') {
        const v = parseFloat(match.distanceMiles);
        if (isFinite(v)) distMiles = v;
      }
    }

    // Fallback: try reverse direction if origin->dest isn't present in the loaded slice
    if (distMiles === null && destKey && window.schoolDistancesByOrigin && Array.isArray(window.schoolDistancesByOrigin[destKey])) {
      const rowsRev = window.schoolDistancesByOrigin[destKey];
      const matchRev = rowsRev.find(r => norm(r.destId) === originKey);
      if (matchRev && matchRev.distanceMiles !== null && matchRev.distanceMiles !== undefined && matchRev.distanceMiles !== '') {
        const v = parseFloat(matchRev.distanceMiles);
        if (isFinite(v)) distMiles = v;
      }
    }
  } catch (e) {
    console.warn("⚠️ updateDistanceToSelected lookup failed:", e);
  }

  const distText = (distMiles === null || distMiles === undefined || !isFinite(distMiles))
    ? 'N/A'
    : distMiles.toFixed(1);
  const originDisplayName = mainDisplaySchoolName(originName);
  const destinationDisplayName = mainDisplaySchoolName(destinationName);

  // Show a popup at the clicked destination (if we have a coordinate), otherwise do nothing visual.
  try {
    if (window.map && window.mapboxgl && coordinates && Array.isArray(coordinates) && coordinates.length === 2) {
      new window.mapboxgl.Popup({ closeOnMove: true })
        .setLngLat(coordinates)
        .setHTML(
          `<div style="font-size:12px; line-height:1.25;">
            <div style="font-weight:700; margin-bottom:4px;">${destinationDisplayName}</div>
            <div>Distance to <span style="font-weight:600;">${originDisplayName}</span>: <span style="font-weight:700;">${distText} mi</span></div>
          </div>`
        )
        .addTo(window.map);
    } else {
      console.log(`📏 Distance to ${originDisplayName} from ${destinationDisplayName}: ${distText} mi`);
    }
  } catch (ePopup) {
    console.warn("⚠️ Unable to display distance popup:", ePopup);
  }
};

function updateNearbySchoolsPanel(originId, schoolName, options = {}) {
  const filterOpts = { ...getSchoolMatchesFilterOptions(), ...options };
  const { overlapOnly = false, active = true } = filterOpts;
  const container = document.getElementById('nearbySchoolsList');
  if (!container) return;

  if (!active) {
    setSchoolMatchesSummaryHelper(true);
    container.textContent = '';
    return;
  }

  setSchoolMatchesSummaryHelper(false);

  const norm = (s) => (s || '').toString().trim().toLowerCase();
  const originKey = norm(originId) || norm(getOriginIdForName(schoolName));

  if (!originKey || !schoolDistancesByOrigin || !Array.isArray(schoolDistancesByOrigin[originKey])) {
    container.innerHTML = 'Select a school to see matches within the distance threshold.';
    return;
  }

  const rows = schoolDistancesByOrigin[originKey];
  if (!rows.length) {
    container.innerHTML = `No nearby schools found for ${mainDisplaySchoolName(schoolName) || 'selection'}.`;
    return;
  }

  const filteredRows = rows.filter(r => rowPassesNearbySchoolFilter(r, originKey, filterOpts));
  const threshold = getNearbyDistanceThresholdForOriginKey(originKey);
  const thresholdLabel = Number.isFinite(threshold) ? `${threshold.toFixed(1)} mi` : 'the distance threshold';

  if (!filteredRows.length) {
    const hasAnyRows = rows.length > 0;
    const bothFilters = filterOpts.withinDistanceOnly && filterOpts.overlapOnly;
    container.innerHTML = bothFilters && hasAnyRows
      ? `No schools within ${thresholdLabel} with overlapping grades for ${mainDisplaySchoolName(schoolName) || 'selection'}.`
      : overlapOnly && !filterOpts.withinDistanceOnly && hasAnyRows
        ? `No schools serving overlapping grades for ${mainDisplaySchoolName(schoolName) || 'selection'}.`
        : `No schools within ${thresholdLabel} for ${mainDisplaySchoolName(schoolName) || 'selection'}. Adjust nearby school distance sliders in the control panel.`;
    return;
  }

  container.innerHTML = renderNearbySchoolsTableHtml(filteredRows, { showOverlapColumn: true });
}

function buildNearbyFilter(originId, originName, options = {}) {
  const norm = (s) => (s || '').toString().trim().toLowerCase();
  const filterOpts = { ...getSchoolMatchesFilterOptions(), ...options };
  if (!filterOpts.active) {
    nearbyFilterIds = null;
    return;
  }
  const originKey = norm(originId) || norm(getOriginIdForName(originName));
  if (!originKey || !schoolDistancesByOrigin || !Array.isArray(schoolDistancesByOrigin[originKey])) {
    nearbyFilterIds = null;
    return;
  }
  const rows = schoolDistancesByOrigin[originKey];
  const ids = new Set();
  ids.add(originKey);
  rows.forEach(r => {
    if (!rowPassesNearbySchoolFilter(r, originKey, filterOpts)) return;
    if (r.destId) ids.add(norm(r.destId));
    if (r.destName) ids.add(norm(r.destName));
  });
  nearbyFilterIds = Array.from(ids);
}

function applyNearbyFilter(originId, originName, options = {}) {
  buildNearbyFilter(originId, originName, options);
  updateNearbySchoolsPanel(originId, originName, options);
  updateLayer();
}

function clearFlowchartSelection() {
  const flowSelect = document.getElementById('mainFlowchartSchoolSelect');
  if (flowSelect) {
    flowSelect.value = '';
    Array.from(flowSelect.options || []).forEach(opt => { opt.selected = false; });
  }
  window.currentSelectedSchoolName = '';
  window.currentOriginId = '';
  window.currentOriginName = '';
}

function clearAllSchoolSelections() {
  const mapSelect = document.getElementById('mapOriginSchoolSelect');
  const flowSelect = document.getElementById('mainFlowchartSchoolSelect');
  if (mapSelect) {
    mapSelect.value = '';
    Array.from(mapSelect.options || []).forEach(opt => { opt.selected = false; });
  }
  if (flowSelect) {
    flowSelect.value = '';
    Array.from(flowSelect.options || []).forEach(opt => { opt.selected = false; });
  }
  window.currentSelectedSchoolName = '';
  window.currentOriginId = '';
  window.currentOriginName = '';
}

// Keep flowchart dropdown empty until user explicitly picks a school
let flowchartUserSelected = false;
function enforceFlowchartEmptyUntilUser() {
  const flowSelect = document.getElementById('mainFlowchartSchoolSelect');
  if (!flowSelect || flowchartUserSelected) return;
  flowSelect.value = '';
  Array.from(flowSelect.options || []).forEach(opt => { opt.selected = false; });
}

// Recreate core map sources/layers after a style change (or if missing)
function ensureBaseSourcesLayers() {
  if (!window.map) return;
  const m = window.map;
  // When switching styles, Mapbox may not be ready for addSource/addLayer yet.
  try {
    if (typeof m.isStyleLoaded === 'function' && !m.isStyleLoaded()) {
      return;
    }
  } catch {}
  const data = originalGeojsonData || geojsonData;
  if (!data) return;

  // If utilization pie mode is active, sprites must be re-registered after setStyle()
  // because Mapbox clears images when the style is rebuilt.
  try {
    if (showUtilizationPie && typeof window.ensureUtilizationPieSprites === 'function') {
      window.ensureUtilizationPieSprites();
    }
  } catch (e) {
    console.warn("⚠️ Unable to ensure utilization pie sprites after style change:", e);
  }

  // Schools source
  if (!m.getSource('schools')) {
    m.addSource('schools', { type: 'geojson', data });
  } else {
    // Do not reset to unfiltered data; updateLayer will reapply filtered data
  }
  // Selected school source
  if (!m.getSource('selected-school')) {
    m.addSource('selected-school', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  }

  // Selected school highlight
  if (!m.getLayer('selected-school-highlight')) {
    m.addLayer({
      id: 'selected-school-highlight',
      type: 'circle',
      source: 'selected-school',
      paint: {
        'circle-radius': 14,
        'circle-color': '#007cbf',
        'circle-opacity': 0.35,
        'circle-blur': 0.4
      }
    });
  }
  // Selected school center
  if (!m.getLayer('selected-school-center')) {
    m.addLayer({
      id: 'selected-school-center',
      type: 'circle',
      source: 'selected-school',
      paint: {
        'circle-radius': 6,
        'circle-color': [
          'match',
          ['get', 'Decision Type'],
          "Building Addition", '#1D4ED8',
          "Policy Solution for Overcrowding", '#3B82F6',
          "Building Addition with Capital Investment", '#1E3A8A',
          "Building Replacement", '#5B21B6',
          "Targeted Capital Investment", '#FBBF24',
          "Standard Maintenance", '#9c5326',
          "Major Capital Investment", '#F97316',
          "Welcoming School", '#62d48c',
          "Welcoming School with Capital Investment", '#7a9a72',
          "Welcoming School with Building Replacement", '#0c4d24',
          "Closure (Goes to Welcoming School)", '#fa5b5b',
          "Other / Unknown", '#2F4F4F',
          '#7f8c8d'
        ],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff'
      }
    });
  }

  // Articulation areas overlay (optional; keep below school dots)
  // NOTE: Mapbox wipes sources/layers on map.setStyle(), so we must rebuild these here.
  try {
    const aaCb = document.getElementById('toggleArticulationAreas');
    const aaVis = (aaCb && aaCb.checked) ? 'visible' : 'none';
    const emptyFc = { type: 'FeatureCollection', features: [] };

    if (!m.getSource('articulation-areas')) {
      m.addSource('articulation-areas', {
        type: 'geojson',
        data: articulationAreasGeojson4326 || emptyFc
      });
    } else {
      // Keep current data if already loaded (avoids a blank overlay after style change)
      try {
        if (articulationAreasGeojson4326) {
          setArticulationAreasMapData(m, articulationAreasGeojson4326);
        }
      } catch {}
    }

    if (!m.getSource('articulation-area-label-points')) {
      m.addSource('articulation-area-label-points', {
        type: 'geojson',
        data: buildArticulationLabelPointsGeoJSON(articulationAreasGeojson4326 || emptyFc)
      });
    }

    const insertBefore = (m.getLayer('schools-layer') ? 'schools-layer' : undefined);

    if (!m.getLayer('articulation-areas-fill')) {
      const layerDef = {
        id: 'articulation-areas-fill',
        type: 'fill',
        source: 'articulation-areas',
        layout: { visibility: aaVis },
        paint: {
          'fill-color': '#000000',
          'fill-opacity': ARTICULATION_FILL_OPACITY
        }
      };
      if (insertBefore) m.addLayer(layerDef, insertBefore);
      else m.addLayer(layerDef);
    } else {
      try { m.setLayoutProperty('articulation-areas-fill', 'visibility', aaVis); } catch {}
    }

    if (!m.getLayer('articulation-areas-outline')) {
      const layerDef = {
        id: 'articulation-areas-outline',
        type: 'line',
        source: 'articulation-areas',
        layout: { visibility: aaVis },
        paint: {
          'line-color': ARTICULATION_OUTLINE_COLOR,
          'line-opacity': ARTICULATION_OUTLINE_OPACITY,
          'line-width': ARTICULATION_OUTLINE_WIDTH
        }
      };
      if (insertBefore) m.addLayer(layerDef, insertBefore);
      else m.addLayer(layerDef);
    } else {
      try { m.setLayoutProperty('articulation-areas-outline', 'visibility', aaVis); } catch {}
    }
    try { refreshArticulationAreaSelectionOutline(); } catch (_) {}

    const labelsVis = (aaCb && aaCb.checked) ? 'visible' : 'none';
    const articulationLabelsLayerDef = {
      id: 'articulation-areas-labels',
      type: 'symbol',
      source: 'articulation-area-label-points',
      filter: ['!=', ['coalesce', ['get', '__aaName'], ''], ''],
      layout: getArticulationAreaLabelLayerLayout(labelsVis),
      paint: getArticulationAreaLabelLayerPaint()
    };
    const existingLabelsLayer = m.getLayer('articulation-areas-labels');
    if (existingLabelsLayer && existingLabelsLayer.source === 'articulation-areas') {
      try { m.removeLayer('articulation-areas-labels'); } catch {}
    }
    if (!m.getLayer('articulation-areas-labels')) {
      if (insertBefore) m.addLayer(articulationLabelsLayerDef, insertBefore);
      else m.addLayer(articulationLabelsLayerDef);
    } else {
      try { m.setLayoutProperty('articulation-areas-labels', 'visibility', labelsVis); } catch {}
      try { m.setLayoutProperty('articulation-areas-labels', 'symbol-sort-key', ['get', '__partArea']); } catch {}
    }

    // Ensure data is (re)loaded after style changes; safe no-op if already cached.
    try {
      loadArticulationAreas4326()
        .then((gj) => {
          try { setArticulationAreasMapData(m, gj || emptyFc); } catch {}
        })
        .catch(() => {});
    } catch {}
    try { refreshArticulationAreaPaintColors(); } catch {}
  } catch (e) {}

  // Main schools layer
  if (!m.getLayer('schools-layer')) {
    m.addLayer({
      id: 'schools-layer',
      type: 'circle',
      source: 'schools',
      paint: {
        'circle-radius': 6,
        'circle-color': [
          'match',
          ['get', 'Decision Type'],
          "Building Addition", '#1D4ED8',
          "Policy Solution for Overcrowding", '#3B82F6',
          "Building Addition with Capital Investment", '#1E3A8A',
          "Building Replacement", '#5B21B6',
          "Targeted Capital Investment", '#FBBF24',
          "Standard Maintenance", '#9c5326',
          "Major Capital Investment", '#F97316',
          "Welcoming School", '#62d48c',
          "Welcoming School with Capital Investment", '#7a9a72',
          "Welcoming School with Building Replacement", '#0c4d24',
          "Closure (Goes to Welcoming School)", '#fa5b5b',
          "Other / Unknown", '#2F4F4F',
          '#7f8c8d'
        ]
      }
    });
  }

  // Pie layer
  if (!m.getLayer('schools-pie-layer')) {
    m.addLayer({
      id: 'schools-pie-layer',
      type: 'symbol',
      source: 'schools',
      layout: {
        'visibility': showUtilizationPie ? 'visible' : 'none',
        'icon-image': ['coalesce', ['get', 'utilPieImage'], 'util-pie-0.0'],
        'icon-size': 0.8,
        'icon-allow-overlap': true
      }
    });
  }
  // Ensure circle vs pie visibility is consistent after a style change
  try {
    if (m.getLayer('schools-layer')) {
      m.setLayoutProperty('schools-layer', 'visibility', showUtilizationPie ? 'none' : 'visible');
    }
    if (m.getLayer('schools-pie-layer')) {
      m.setLayoutProperty('schools-pie-layer', 'visibility', showUtilizationPie ? 'visible' : 'none');
    }
  } catch {}

  // Closed stripe layer
  if (!m.getLayer('closed-stripe-layer')) {
    m.addLayer({
      id: 'closed-stripe-layer',
      type: 'symbol',
      source: 'schools',
      layout: {
        'visibility': includeClosedSchools ? 'visible' : 'none',
        'text-field': '/',
        'text-size': 22,
        'text-rotate': 45,
        'text-allow-overlap': true,
        'text-ignore-placement': true
      },
      paint: {
        'text-color': '#d32f2f',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.3
      },
      filter: ['==', ['get', 'isClosed'], true]
    });
  } else {
    try {
      m.setLayoutProperty('closed-stripe-layer', 'visibility', includeClosedSchools ? 'visible' : 'none');
    } catch {}
  }
  // Keep the closed stripe on top of the school symbols/circles so it stays visible.
  try {
    if (m.getLayer('closed-stripe-layer')) {
      m.moveLayer('closed-stripe-layer');
    }
  } catch {}

  // Reapply current filters after ensuring sources/layers exist
  try {
    updateLayer();
  } catch (err) {
    console.warn("⚠️ Failed to reapply filters after ensuring base layers:", err);
  }
}

function updateLayer() {
    if (!originalGeojsonData) { 
      console.log("⚠️ updateLayer called but originalGeojsonData not loaded yet");
      return; 
    }

  // Sync include/exclude toggles from DOM to avoid accidental resets
  const includeNonEvalEl = document.getElementById('toggleIncludeNonEval');
  const includeClosedEl = document.getElementById('toggleIncludeClosed');
  includeNonEvalSchools = !!(includeNonEvalEl && includeNonEvalEl.checked);
  includeClosedSchools = !!(includeClosedEl && includeClosedEl.checked);

  // If utilization pie mode is enabled, make sure sprite images exist.
  // Slider updates can change the underlying data and users can toggle pie right after.
  try {
    if (
      showUtilizationPie &&
      typeof window.ensureUtilizationPieSprites === 'function' &&
      window.map &&
      typeof window.map.hasImage === 'function' &&
      !window.map.hasImage('util-pie-0.0')
    ) {
      window.ensureUtilizationPieSprites();
    }
  } catch (e) {
    console.warn("⚠️ Unable to ensure utilization pie sprites in updateLayer:", e);
  }

  console.log("🔄 Updating layer with filters:", { selectedFlows, selectedTypes, minEnrollment, maxEnrollment });

  // Always filter from the original unfiltered data
  let flow2Count = 0;
  let flow2Filtered = 0;
  
  const baseFilteredFeatures = originalGeojsonData.features.filter(f => {
    const nameRaw = (f.properties['Building Name'] || '').toString();
    const nameNorm = nameRaw.toLowerCase();
    // Read precomputed flags injected into GeoJSON (keeps behavior consistent after slider updates/style changes)
    const includeVal = (f.properties['includeFlowChart'] || '').toString().trim().toLowerCase();
    const includeYes = includeVal === 'yes' || includeVal === 'y' || includeVal === 'true' || includeVal === '1';
    const isNonEval = (f.properties['isNonEval'] === true) || (!includeYes);

    const statusNorm = (f.properties['status'] || '').toString().trim().toLowerCase();
    const isClosed =
      f.properties.isClosed === true ||
      f.properties['isClosed'] === true ||
      statusNorm === 'no' ||
      statusNorm.includes('closed');

    // Hard gates (independent) + BYPASS behavior:
    // - If "Include closed" is ON, closed schools should show regardless of all other filters.
    // - If "Include non-eval" is ON, non-eval (but not closed) schools should show regardless of all other filters.
    // - A school that is both closed and non-eval is governed by the closed toggle.
    if (isClosed) {
      return includeClosedSchools;
    }
    if (isNonEval) {
      if (!includeNonEvalSchools) {
        return false;
      }
      return true; // bypass all other filters for non-eval schools
    }

    // Eval + open schools continue through normal filters
    if (!isClosed && isNonEval && !includeNonEvalSchools) {
      if (nameNorm.includes('compass')) {
        console.log("🚫 Filtered (non-eval) Compass:", {
          name: nameRaw,
          includeVal,
          isNonEval,
          includeNonEvalSchools
        });
      }
      return false;
    }

    const enrollment = parseInt(f.properties['Enrollment']) || 0;
    const availableSeats = parseInt(f.properties['Available Seats']) || 0;
    const level = normalizeSchoolLevel(f.properties['School Level']);
    const decisionType = f.properties['Decision Type'];
    const flowNumber = f.properties['flow']; // Get the flow number stored during evaluation
    const normLocal = (s) => (s || '').toString().trim().toLowerCase();
    const uid = normLocal(f.properties['UniqueID']);
    const name = normLocal(f.properties['Building Name']);

    const matchesEnrollment = enrollment >= minEnrollment && enrollment <= maxEnrollment;
    const matchesSeats = availableSeats >= minSeats && availableSeats <= maxSeats;
    const matchesType = selectedTypes.length > 0 && selectedTypes.includes(level);
    const matchesFlow = matchesFlowFilter(decisionType, flowNumber);
    const matchesNearby = !nearbyFilterIds || nearbyFilterIds.length === 0
      ? true
      : nearbyFilterIds.includes(uid) || nearbyFilterIds.includes(name);

    // Track Flow 2 (expansion) schools
    if (flowNumber === 2) {
      flow2Count++;
      if (matchesEnrollment && matchesSeats && matchesType && matchesFlow) {
        flow2Filtered++;
      } else {
        console.log(`❌ Flow 2 school filtered out: ${f.properties['Building Name']}`, {
          availableSeats: availableSeats,
          seatsFilter: `${minSeats} to ${maxSeats}`,
          matchesEnrollment,
          matchesSeats,
          matchesType,
          matchesFlow
        });
      }
    }

    if (!(matchesEnrollment && matchesSeats && matchesType && matchesFlow && matchesNearby)) return false;
    return true;
  });

  // Recompute building score quartiles from the currently included schools
  // so each visible filter set yields all four quartiles.
  try {
    buildingQuartiles = computeBuildingQuartilesForFeatures(baseFilteredFeatures);
    applyBuildingMetricsToFeatures(originalGeojsonData.features);
  } catch (e) {
    console.warn("⚠️ Failed to recompute building quartiles:", e);
  }

  const filteredFeatures = baseFilteredFeatures.filter(f => {
    // Legend-based filtering (applies to current color-by mode)
    const mode =
      (window.__mapColorByMode === 'building') ? 'building'
      : ((window.__mapColorByMode === 'fci') ? 'fci'
        : ((window.__mapColorByMode === 'utilization') ? 'utilization'
          : ((window.__mapColorByMode === 'level') ? 'level' : 'decision')));

    let legendKey = null;
    if (mode === 'decision') {
      legendKey = (f && f.properties) ? (f.properties["Decision Type"] || f.properties["decision"] || "Unknown") : "Unknown";
    } else if (mode === 'level') {
      legendKey = (f && f.properties) ? (f.properties.__schoolLevelNorm || normalizeSchoolLevel(f.properties['School Level']) || 'Unknown') : 'Unknown';
    } else if (mode === 'utilization') {
      const { low, high } = getUtilizationThresholds();
      const util = normalizeUtilizationValue(f?.properties?.['Utilization'] ?? 0);
      legendKey = (util < low) ? 'low' : (util > high) ? 'high' : 'mid';
    } else if (mode === 'fci') {
      legendKey = f?.properties?.__fciStatus || 'No Data';
    } else if (mode === 'building') {
      legendKey = f?.properties?.__buildingCondition || 'No Data';
    }
    if (!legendFilterAllows(mode, legendKey)) return false;

    return true;
  });
  
  console.log(`🟦 Flow 2 (Expansion): ${flow2Filtered} of ${flow2Count} schools passed all filters`);
  
  // Count how many schools per flow
  const flowCounts = {};
  const sampleSchools = [];
  originalGeojsonData.features.forEach((f, idx) => {
    const flowNumber = f.properties['flow'];
    flowCounts[flowNumber] = (flowCounts[flowNumber] || 0) + 1;
    
    // Sample first 3 schools
    if (idx < 3) {
      sampleSchools.push({
        name: f.properties['Building Name'],
        flow: flowNumber,
        decision: f.properties['Decision Type']
      });
    }
  });
  console.log("📊 Schools per flow:", flowCounts);
  console.log("🏫 Sample schools:", sampleSchools);

  console.log(`📍 Filtered ${originalGeojsonData.features.length} schools to ${filteredFeatures.length} schools`);

  // Prepare pie icon names before updating the source so symbols render immediately
  if (showUtilizationPie) {
    const getPieColorKeyForFeature = (f) => {
      const mode =
        (window.__mapColorByMode === 'building') ? 'building'
        : ((window.__mapColorByMode === 'fci') ? 'fci'
          : ((window.__mapColorByMode === 'utilization') ? 'utilization'
            : ((window.__mapColorByMode === 'level') ? 'level' : 'decision')));

      if (mode === 'level') {
        const lvl = (f && f.properties) ? (f.properties.__schoolLevelNorm || normalizeSchoolLevel(f.properties['School Level']) || 'Unknown') : 'Unknown';
        return getSchoolLevelColorKey(lvl);
      }
      if (mode === 'building') {
        const status = f?.properties?.__buildingCondition || 'No Data';
        return getBuildingConditionColorKey(status);
      }
      if (mode === 'fci') {
        const status = f?.properties?.__fciStatus || 'No Data';
        return getFciStatusColorKey(status);
      }
      if (mode === 'utilization') {
        const { low, high } = getUtilizationThresholds();
        const util = normalizeUtilizationValue(f?.properties?.['Utilization'] ?? 0);
        if (util < low) return UTILIZATION_PHASE_COLORS.low.replace('#', '').toLowerCase();
        if (util > high) return UTILIZATION_PHASE_COLORS.high.replace('#', '').toLowerCase();
        return UTILIZATION_PHASE_COLORS.mid.replace('#', '').toLowerCase();
      }
      const decisionType = (f && f.properties) ? (f.properties["Decision Type"] || f.properties["decision"] || "Unknown") : "Unknown";
      return getDecisionColorKey(decisionType);
    };
    filteredFeatures.forEach(f => {
      const bucket = f.properties["utilPieBucket"] || "0.0";
      const colorKey = getPieColorKeyForFeature(f);
      f.properties["utilPieImage"] = `util-pie-${bucket}-${colorKey}`;
    });
  }

  // Cache normalized school level for Mapbox expressions (used by "Color by school level")
  filteredFeatures.forEach(f => {
    try {
      const lvl = normalizeSchoolLevel(f && f.properties ? f.properties['School Level'] : '');
      f.properties.__schoolLevelNorm = lvl || 'Unknown';
    } catch (e) {
      if (f && f.properties) f.properties.__schoolLevelNorm = 'Unknown';
    }
  });

  const updatedData = { ...originalGeojsonData, features: filteredFeatures };
  
  // Update both schools and halo layers
  if (map.getSource('schools')) {
    map.getSource('schools').setData(updatedData);
  }

  // Track filtered schools for rollups (articulation area table)
  try {
    window.__currentFilteredSchoolIds = new Set(
      filteredFeatures.map(f => normalizeId(f?.properties?.["UniqueID"]))
    );
  } catch {}
  try { updateArticulationAreaFciTable(); } catch {}
  try { populateMapArticulationAreaSelect(); } catch {}

  // If layers aren't ready yet, skip styling updates
  if (!map.getLayer || !map.getLayer('schools-layer')) {
    return;
  }

  // Ensure circle color matches current "Color by" selection
  try {
    if (typeof window.applyMapColorByMode === 'function') window.applyMapColorByMode();
  } catch (e) {}

  // Prepare pie icon names when utilization pies are enabled
  if (showUtilizationPie) {
    filteredFeatures.forEach(f => {
      const bucket = f.properties["utilPieBucket"] || "0.0";
      const mode =
        (window.__mapColorByMode === 'building') ? 'building'
        : ((window.__mapColorByMode === 'fci') ? 'fci'
          : ((window.__mapColorByMode === 'utilization') ? 'utilization'
            : ((window.__mapColorByMode === 'level') ? 'level' : 'decision')));
      const colorKey =
        (mode === 'building')
          ? getBuildingConditionColorKey(f.properties.__buildingCondition || 'No Data')
          : (mode === 'fci')
          ? getFciStatusColorKey(f.properties.__fciStatus || 'No Data')
          : (mode === 'level')
          ? getSchoolLevelColorKey(f.properties.__schoolLevelNorm || normalizeSchoolLevel(f.properties['School Level']) || 'Unknown')
          : (mode === 'utilization')
            ? (() => {
                const { low, high } = getUtilizationThresholds();
                const util = normalizeUtilizationValue(f?.properties?.['Utilization'] ?? 0);
                if (util < low) return UTILIZATION_PHASE_COLORS.low.replace('#', '').toLowerCase();
                if (util > high) return UTILIZATION_PHASE_COLORS.high.replace('#', '').toLowerCase();
                return UTILIZATION_PHASE_COLORS.mid.replace('#', '').toLowerCase();
              })()
            : getDecisionColorKey(f.properties["Decision Type"] || f.properties["decision"] || "Unknown");
      f.properties["utilPieImage"] = `util-pie-${bucket}-${colorKey}`;
    });
  }

  // Size dots by enrollment when "Show size by capacity" is active
  // otherwise use a constant radius. If utilization pies are enabled, hide circle sizing
  // and show pie icons instead.
  if (!showUtilizationPie) {
    if (showVariableRadius && originalGeojsonData && Array.isArray(originalGeojsonData.features) && originalGeojsonData.features.length > 0) {
      // IMPORTANT: scale is based on ALL schools, not the filtered subset,
      // so dot sizes remain stable when filters hide/show features.
      const allEnrollValues = originalGeojsonData.features
        .map(f => parseFloat(f?.properties?.["Enrollment"] || 0))
        .filter(v => Number.isFinite(v) && v > 0);

      if (allEnrollValues.length > 0) {
        const minEnrollVal = Math.min(...allEnrollValues);
        const maxEnrollVal = Math.max(...allEnrollValues);
        // Avoid zero-width ranges; pad a bit
        const rangeMin = Math.max(0, Math.floor(minEnrollVal / 10) * 10);
        const rangeMax = Math.ceil(maxEnrollVal / 10) * 10;
        const clampedRangeMax = rangeMax > rangeMin ? rangeMax : rangeMin + 10;

        map.setPaintProperty(
          'schools-layer',
          'circle-radius',
          [
            'interpolate',
            ['linear'],
            ['to-number', ['coalesce', ['get', 'Enrollment'], 0]],
            rangeMin, 4,
            clampedRangeMax, 14
          ]
        );
        console.log("📏 Variable radius enabled (global enrollment scale)", { rangeMin, rangeMax: clampedRangeMax });
      } else {
        map.setPaintProperty('schools-layer', 'circle-radius', 6);
        console.warn("⚠️ Variable radius requested but no enrollment values found in originalGeojsonData; using constant size.");
      }
    } else {
      map.setPaintProperty('schools-layer', 'circle-radius', 6);
    }
  }

  // When utilization pies are enabled, size the pie icons by enrollment if requested
  if (map.getLayer('schools-pie-layer')) {
    if (showUtilizationPie && showVariableRadius && originalGeojsonData && Array.isArray(originalGeojsonData.features) && originalGeojsonData.features.length > 0) {
      // IMPORTANT: scale is based on ALL schools, not the filtered subset,
      // so icon sizes remain stable when filters hide/show features.
      const allEnrollValues = originalGeojsonData.features
        .map(f => parseFloat(f?.properties?.["Enrollment"] || 0))
        .filter(v => Number.isFinite(v) && v > 0);

      if (allEnrollValues.length > 0) {
        const minEnrollVal = Math.min(...allEnrollValues);
        const maxEnrollVal = Math.max(...allEnrollValues);
        const rangeMin = Math.max(0, Math.floor(minEnrollVal / 10) * 10);
        const rangeMax = Math.ceil(maxEnrollVal / 10) * 10;
        const clampedRangeMax = rangeMax > rangeMin ? rangeMax : rangeMin + 10;

        // Map enrollment to icon-size between ~0.6 and 1.2 (on 40px sprites → 24–48px)
        map.setLayoutProperty(
          'schools-pie-layer',
          'icon-size',
          [
            'interpolate',
            ['linear'],
            ['to-number', ['coalesce', ['get', 'Enrollment'], 0]],
            rangeMin, 0.6,
            clampedRangeMax, 1.2
          ]
        );
      } else {
        map.setLayoutProperty('schools-pie-layer', 'icon-size', 0.8);
      }
    } else {
      map.setLayoutProperty('schools-pie-layer', 'icon-size', 0.8);
    }
  }

  // Toggle pie layer vs circles
  if (map.getLayer('schools-pie-layer')) {
    map.setLayoutProperty('schools-pie-layer', 'visibility', showUtilizationPie ? 'visible' : 'none');
  }
  if (map.getLayer('schools-layer')) {
    map.setLayoutProperty('schools-layer', 'visibility', showUtilizationPie ? 'none' : 'visible');
  }
}

// Flow filtering functions - now uses actual flow number from evaluation
function matchesFlowFilter(decisionType, flowNumber) {
  if (selectedFlows.length === 0) {
    console.log("⚠️ No flows selected, filtering out all schools");
    return false;
  }
  
  // Map flow numbers (from decision logic) to category names
  const flowNumberMapping = {
    2: 'expansion',      // Flow 2: Building Addition
    3: 'maintenance',    // Flow 3: Maintenance/Investment  
    4: 'closure',        // Flow 4: Consolidation/Closure
  };

  // Prefer flow number if provided
  const flowNum = Number(flowNumber);
  if (Number.isFinite(flowNum) && flowNumberMapping[flowNum]) {
    return selectedFlows.includes(flowNumberMapping[flowNum]);
  }

  // Fallback to decision type mapping
  const flowMapping = {
    'Building Addition': 'expansion',
    'Policy Solution for Overcrowding': 'expansion',
    'Building Addition with Capital Investment': 'expansion',
    'Building Replacement': 'maintenance',
    'Targeted Capital Investment': 'maintenance',
    'Standard Maintenance': 'maintenance',
    'Major Capital Investment': 'maintenance',
    'Welcoming School': 'closure',
    'Welcoming School with Capital Investment': 'closure',
    'Closure (Goes to Welcoming School)': 'closure',
    'Welcoming School with Building Replacement': 'closure',
    'Other / Unknown': 'other'
  };

  const flow = flowMapping[decisionType] || 'other';
  return selectedFlows.includes(flow);
}

function normalizeId(id) {
  return (id || "").toString().trim().toLowerCase();
}

function buildMapExportLookup(rows) {
  const byName = new Map();
  const byCode = new Map();
  (rows || []).forEach(row => {
    const nameKey = normalizeName(row["Building Name"]);
    const codeKey = normalizeId(row["Building Code"]);
    if (nameKey) byName.set(nameKey, row);
    if (codeKey) byCode.set(codeKey, row);
  });
  return { byName, byCode };
}

function mergeGeojsonWithMapExport(geojson, rows) {
  if (!geojson || !Array.isArray(geojson.features)) {
    return { geojson, lookup: { byName: new Map(), byCode: new Map() } };
  }

  const lookup = buildMapExportLookup(rows);
  const seenNames = new Set();

  const mergedFeatures = geojson.features.map(feature => {
    const f = { ...feature, properties: { ...(feature.properties || {}) } };
    const nameKey = normalizeName(f.properties["Building Name"]);
    const existingId = normalizeId(f.properties["UniqueID"]);
    const csvRow = nameKey ? lookup.byName.get(nameKey) : null;
    const csvCode = normalizeId(csvRow?.["Building Code"]);

    // Fill UniqueID from Map_Export when missing
    if (!existingId && csvCode) {
      f.properties["UniqueID"] = csvRow["Building Code"].toString().trim();
    }

    // Backfill coordinates if missing/invalid
    const needsCoords =
      !f.geometry ||
      !Array.isArray(f.geometry.coordinates) ||
      f.geometry.coordinates.some(c => c === null || Number.isNaN(c));
    const lat = parseFloat(csvRow?.["Latitude"]);
    const lon = parseFloat(csvRow?.["Longitude"]);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);
    if (needsCoords && hasCoords) {
      f.geometry = { type: "Point", coordinates: [lon, lat] };
      f.properties["Latitude"] = lat;
      f.properties["Longitude"] = lon;
    }

    if (nameKey) seenNames.add(nameKey);
    return f;
  });

  // Add any schools present in Map_Export.csv but missing from GeoJSON
  (rows || []).forEach(row => {
    const nameKey = normalizeName(row["Building Name"]);
    const lat = parseFloat(row["Latitude"]);
    const lon = parseFloat(row["Longitude"]);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);
    if (nameKey && !seenNames.has(nameKey) && hasCoords) {
      mergedFeatures.push({
        type: "Feature",
        properties: {
          "Building Name": row["Building Name"],
          "Latitude": lat,
          "Longitude": lon,
          "UniqueID": row["Building Code"] ? row["Building Code"].toString().trim() : "",
          "Decision Type": "Not Evaluated",
          "includeFlowChart": "no",
          "isNonEval": true,
          "status": "",
          "isClosed": false
        },
        geometry: { type: "Point", coordinates: [lon, lat] }
      });
      seenNames.add(nameKey);
    }
  });

  return { geojson: { ...geojson, features: mergedFeatures }, lookup };
}
function updateFlowFilter() {
  selectedFlows = [];
  
  console.log("🔍 Current checkbox states from storage:", flowCheckboxStates);
  
  // Use the stored state instead of querying DOM (in case DOM is stale)
  if (flowCheckboxStates['flow-expansion']) {
    selectedFlows.push('expansion');
  }
  if (flowCheckboxStates['flow-maintenance']) {
    selectedFlows.push('maintenance');
  }
  if (flowCheckboxStates['flow-closure']) {
    selectedFlows.push('closure');
  }
  if (flowCheckboxStates['flow-other']) {
    selectedFlows.push('other');
  }
  
  console.log("✅ Selected flows after update:", selectedFlows);
  
  if (map && map.getSource && map.getSource('schools')) {
    updateLayer();
  } else {
    console.warn("⚠️ Map or schools source not ready yet");
  }
}

function normalize(str) {
    return str?.toLowerCase().replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
}

// ✅ Move updateLegend function outside map.on('load') for global access
// Always showing decisions view (toggle buttons removed)
let flowCheckboxStates = {
  'flow-expansion': true,
  'flow-maintenance': true,
  'flow-closure': true,
  'flow-other': true
};

function updateLegend() {
  console.log("🔄 updateLegend called, current checkbox states:", JSON.stringify(flowCheckboxStates));
  
  const legendWrapper = document.getElementById('legend-content');
  const legendSchoolSection = document.getElementById('legend-school-section');
  const legendToggle = document.getElementById('legend-toggle');
  if (!legendWrapper || !legendSchoolSection) return;

  updateArticulationLegendSection();

  const colorMode =
    (window.__mapColorByMode === 'building') ? 'building'
    : ((window.__mapColorByMode === 'fci') ? 'fci'
      : ((window.__mapColorByMode === 'utilization') ? 'utilization'
        : ((window.__mapColorByMode === 'level') ? 'level' : 'decision')));
  const useDecisionColors = colorMode === 'decision';
  
  legendSchoolSection.innerHTML = '';
  legendSchoolSection.classList.toggle('legend-section--utilization', colorMode === 'utilization');
  const legendItemsWrap = document.createElement('div');
  legendItemsWrap.className = 'legend-items-wrap';
  legendSchoolSection.appendChild(legendItemsWrap);
  // Match the padding scale used by Map Filters panel content
  legendWrapper.style.cssText = 'padding: 8px 10px 12px 10px; line-height: 1.4; max-height: 80vh; overflow-y: auto; overflow-x: auto;';

  const schoolSectionTitle =
    (colorMode === 'building')
      ? 'Composite Building Score'
      : (colorMode === 'fci')
          ? (fciSelectedSystem ? `${fciSelectedSystem} FCI` : 'FCI')
          : (colorMode === 'utilization')
            ? 'Utilization'
            : (colorMode === 'level')
              ? 'School Level'
              : 'Strategic Decision';

  // Update the toggle label for the unified map legend panel
  if (legendToggle) {
    const chevron = legendToggle.querySelector('span.chevron');
    const textSpan = legendToggle.querySelector('.legend-title') || legendToggle.querySelector('span:not(.chevron)');
    if (textSpan) textSpan.textContent = 'Map Legend';
    if (chevron) chevron.textContent = '▸';
  }

  const legendContent = legendItemsWrap;
  if (shouldShowArticulationLegend()) {
    const sectionHdr = document.createElement('div');
    sectionHdr.textContent = schoolSectionTitle;
    sectionHdr.className = 'legend-section-title';
    legendContent.appendChild(sectionHdr);
  }

  const decisionLegendGroups = {
    "Expansion": {
      "Building Addition": '#1D4ED8',           // Blue
      "Policy Solution for Overcrowding": '#3B82F6',     // Light blue
      "Building Addition with Capital Investment": '#1E3A8A', // Navy
      "Building Replacement": '#5B21B6'                  // Blue-purple
    },
    "Maintenance/Investment": {
      "Targeted Capital Investment": '#FBBF24',   // Gold
      "Standard Maintenance": '#9c5326',        // Medium brown
      "Major Capital Investment": '#F97316'     // Deep orange
    },
    "Closure/Consolidation": {
      "Welcoming School": '#62d48c',             // Green
      "Welcoming School with Capital Investment": '#7a9a72',
      "Welcoming School with Building Replacement": '#0c4d24',
      "Closure (Goes to Welcoming School)": '#fa5b5b'  // Light red
    }
  };

  // Title is now handled by the legend toggle header; no separate title inside content

  const appendInlineLegendHelper = (text) => {
    const note = document.createElement('div');
    note.className = 'legend-helper-text legend-helper-text--md';
    note.textContent = text;
    legendContent.appendChild(note);
  };

  const appendLegendHelper = (text) => {
    const note = document.createElement('div');
    note.className = 'legend-helper-text legend-helper-text--md';
    note.textContent = text;
    legendSchoolSection.appendChild(note);
  };

  const addLegendFilterRow = (mode, key, label, color) => {
    const state = getLegendFilterState(mode);
    if (!(key in state)) state[key] = true;
    const row = document.createElement('label');
    row.className = 'legend-filter-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state[key] !== false;
    cb.addEventListener('change', (e) => {
      state[key] = !!e.target.checked;
      try { updateLayer(); } catch {}
    });
    const swatch = document.createElement('span');
    swatch.className = 'legend-filter-swatch';
    swatch.style.background = color;
    const txt = document.createElement('span');
    txt.className = 'legend-filter-label';
    txt.textContent = label;
    row.appendChild(cb);
    row.appendChild(swatch);
    row.appendChild(txt);
    legendContent.appendChild(row);
  };

  const appendModeHeader = (title) => {
    if (shouldShowArticulationLegend()) return;
    const hdr = document.createElement('div');
    hdr.textContent = title;
    hdr.className = 'legend-mode-header';
    legendContent.appendChild(hdr);
  };

  const appendSchoolLevelLegend = () => {
    appendModeHeader('School Level Colors');

    const levels = [
      ['Elementary', '#2563eb'],
      ['Middle', '#7c3aed'],
      ['High', '#dc2626'],
      ['Alternative', '#10b981'],
      ['Multi-Level', '#0ea5e9'],
      ['Option', '#f97316']
    ];
    levels.forEach(([label, color]) => {
      addLegendFilterRow('level', label, label, color);
    });
  };

  if (colorMode === 'building') {
      appendModeHeader('Composite Building Score');

      addLegendFilterRow('building', 'Poor', 'Poor (<= Q1)', BUILDING_CONDITION_COLORS.poor);
      addLegendFilterRow('building', 'Fair', 'Fair (Q1–Q2)', BUILDING_CONDITION_COLORS.fair);
      addLegendFilterRow('building', 'Good', 'Good (Q2–Q3)', BUILDING_CONDITION_COLORS.good);
      addLegendFilterRow('building', 'Excellent', 'Excellent (> Q3)', BUILDING_CONDITION_COLORS.excellent);
      addLegendFilterRow('building', 'No Data', 'No Data', BUILDING_CONDITION_COLORS.nodata);

      return;
    }

    if (colorMode === 'fci') {
      appendModeHeader(fciSelectedSystem ? `${fciSelectedSystem} FCI` : 'FCI');

      if (fciSelectedSystem) {
        addLegendFilterRow('fci', 'Good', 'Good (<= Q1)', FCI_STATUS_COLORS.good);
        addLegendFilterRow('fci', 'Fair', 'Fair (Q1–Q3)', FCI_STATUS_COLORS.fair);
        addLegendFilterRow('fci', 'Poor', 'Poor (>= Q3)', FCI_STATUS_COLORS.poor);
      } else {
        addLegendFilterRow('fci', 'Excellent', 'Excellent (<= 0.10)', FCI_STATUS_COLORS.excellent);
        addLegendFilterRow('fci', 'Good', 'Good (<= 0.20)', FCI_STATUS_COLORS.good);
        addLegendFilterRow('fci', 'Fair', 'Fair (<= 0.40)', FCI_STATUS_COLORS.fair);
        addLegendFilterRow('fci', 'Poor', 'Poor (<= 0.60)', FCI_STATUS_COLORS.poor);
        addLegendFilterRow('fci', 'Deficient', 'Deficient (<= 1.00)', FCI_STATUS_COLORS.deficient);
      }
      addLegendFilterRow('fci', 'No Data', 'No Deferred Maintenance', FCI_STATUS_COLORS.nodata);

      return;
    }
    // Utilization mode: show the 3-phase legend + keep flow filter checkboxes (without decision colors).
    if (colorMode === 'utilization') {
      const { low, high } = getUtilizationThresholds();
      const lowPct = Math.round(low * 100);
      const highPct = Math.round(high * 100);

      appendModeHeader('Utilization');

      addLegendFilterRow('utilization', 'low', `Too low (< ${lowPct}%)`, UTILIZATION_PHASE_COLORS.low);
      addLegendFilterRow('utilization', 'mid', `In range (${lowPct}%–${highPct}%)`, UTILIZATION_PHASE_COLORS.mid);
      addLegendFilterRow('utilization', 'high', `Too high (> ${highPct}%)`, UTILIZATION_PHASE_COLORS.high);

      appendInlineLegendHelper('Thresholds follow the utilization sliders in Strategic Sorting.');

      const sep1 = document.createElement('div');
      sep1.style.cssText = 'height:1px; background:#e5e7eb; margin:10px 0;';
      legendContent.appendChild(sep1);

      const filterHdr = document.createElement('div');
      filterHdr.textContent = 'Strategy Groups';
      filterHdr.className = 'legend-section-title';
      legendContent.appendChild(filterHdr);

      const groups = [
        { id: 'flow-expansion', label: 'Expansion' },
        { id: 'flow-maintenance', label: 'Maintenance/Investment' },
        { id: 'flow-closure', label: 'Closure/Consolidation' },
        { id: 'flow-other', label: 'Other' },
      ];

      groups.forEach((g) => {
        const row = document.createElement('label');
        row.className = 'legend-filter-row';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = g.id;
        cb.checked = flowCheckboxStates[g.id] !== false;
        cb.addEventListener('change', (e) => {
          flowCheckboxStates[g.id] = !!e.target.checked;
          updateFlowFilter();
        });
        const txt = document.createElement('span');
        txt.textContent = g.label;
        txt.style.cssText = 'font-size: 12px; color:#111827; font-weight:800;';
        row.appendChild(cb);
        row.appendChild(txt);
        legendContent.appendChild(row);
      });

      appendLegendHelper('Filter schools by recommended strategy group based on your threshold inputs.');

      return;
    }

    // In School level mode, show ONLY the school-level legend (no decision groups).
    if (colorMode === 'level') {
      appendSchoolLevelLegend();
      return;
    }

    for (const [groupName, items] of Object.entries(decisionLegendGroups)) {
      const groupColorMap = {
        'Expansion': '#1D4ED8',                // Blue
        'Maintenance/Investment': '#C4B5A0',    // Soft warm beige (subtle)
        'Closure/Consolidation': '#16a34a',    // Green (Welcoming palette)
        'Other': '#6B7280'                     // Gray
      };
      const groupBgMap = {
        'Expansion': '#EFF6FF',               // Light blue
        'Maintenance/Investment': '#F8F4EC',  // Very light warm beige
        'Closure/Consolidation': '#ECFDF5',   // Light green
        'Other': '#F3F4F6'                    // Light gray
      };

      // Add group header with checkbox
      const groupHeader = document.createElement('div');
      groupHeader.className = 'legend-group-header';
      groupHeader.style.cssText = 'font-weight: bold; margin-top: 6px; margin-bottom: 2px; color: #333; border-bottom: 2px solid #ddd; padding-bottom: 2px; display: flex; align-items: center; background: #f8f9fa; padding: 2px 4px; border-radius: 4px;';
      // Tint group header to match the strategy color
      if (useDecisionColors) {
        if (groupColorMap[groupName]) groupHeader.style.borderBottomColor = groupColorMap[groupName];
        if (groupBgMap[groupName]) groupHeader.style.background = groupBgMap[groupName];
      }
      
      // Create checkbox
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.style.cssText = 'margin-right: 4px; transform: scale(1.1); cursor: pointer;';
      
      // Map group names to flow IDs
      const flowIdMap = {
        'Expansion': 'flow-expansion',
        'Maintenance/Investment': 'flow-maintenance',
        'Closure/Consolidation': 'flow-closure',
        'Other': 'flow-other'
      };
      
      checkbox.id = flowIdMap[groupName];
      // Restore checkbox state from saved state
      const savedState = flowCheckboxStates[checkbox.id];
      checkbox.checked = savedState !== undefined ? savedState : true;
      console.log(`🔧 Restoring checkbox ${checkbox.id} to:`, checkbox.checked);
      
      if (checkbox.id) {
        checkbox.addEventListener('change', (e) => {
          const isChecked = e.target.checked;
          console.log(`🔲 Checkbox ${checkbox.id} changed to:`, isChecked);
          
          // Save checkbox state
          flowCheckboxStates[checkbox.id] = isChecked;
          console.log("📦 All checkbox states:", JSON.stringify(flowCheckboxStates));
          
          updateFlowFilter();
        });
      }
      
      // Create label with emoji and text
      const label = document.createElement('span');
      const emojiMap = {
        // Expansion gets a custom SVG icon below (avoid the green emoji square)
        'Expansion': '',
        'Maintenance/Investment': '🛠️',
        'Closure/Consolidation': '🚫',
        'Other': '⚪'
      };
      if (groupName === 'Expansion') {
        const iconColor = groupColorMap[groupName] || '#1D4ED8';
        label.style.cssText = 'font-size: 14px; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;';
        label.innerHTML =
          `<span style="display:inline-flex; width:16px; height:16px; color:${iconColor};" aria-hidden="true">` +
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">` +
              `<polyline points="15 3 21 3 21 9"></polyline>` +
              `<polyline points="9 21 3 21 3 15"></polyline>` +
              `<line x1="21" y1="3" x2="14" y2="10"></line>` +
              `<line x1="3" y1="21" x2="10" y2="14"></line>` +
            `</svg>` +
          `</span>` +
          `<span>${groupName}</span>`;
      } else {
        label.textContent = `${emojiMap[groupName] || '⚪'} ${groupName}`;
        label.style.cssText = 'font-size: 14px; letter-spacing: 0.5px;';
      }
      
      groupHeader.appendChild(checkbox);
      groupHeader.appendChild(label);
      legendContent.appendChild(groupHeader);
      
      // Add items in this group
      for (const [label, color] of Object.entries(items)) {
        const swatchColor = useDecisionColors ? color : '#cbd5e1';
        addLegendFilterRow('decision', label, label, swatchColor);
      }
    }

}

map.on('load', () => {
  console.log("Map loaded. Fetching initial data...");

  // Apply saved base-map label settings (roads/places/POIs) once the initial style is ready.
  try { rebuildMapLabelLayerIndex(); } catch {}
  try { applyMapLabelPrefs(); } catch {}

  const geojsonPromise = fetch(withCacheBust(DATA_URL_PREFIX + '07 Schools.geojson')).then(res => res.json());
  const decisionDataPromise = window.decisionLogic.initialize();
  decisionDataPromise.then(() => {
    try {
      if (typeof window.refreshStep1ArticulationDropdown === 'function') {
        window.refreshStep1ArticulationDropdown();
      }
    } catch (e) { /* Step 1 optional */ }
  }).catch(() => {});
  const decisionAllPromise = fetch(withCacheBust(DATA_URL_PREFIX + '01 Decision Data Export.csv'))
    .then(res => res.text())
    .then(text => new Promise(resolve => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: results => {
          const data = results.data || [];
          if (typeof window.applyDecisionColumnMapToRows === "function") {
            window.applyDecisionColumnMapToRows(data);
          }
          resolve(data);
        }
      });
    }))
    .catch(err => {
      console.warn("⚠️ Failed to load full Decision Data Export.csv:", err);
      return [];
    });
  const projectListPromise = Promise.all([
    fetch(withCacheBust(PROJECT_LIST_CSV_PATH))
      .then(res => res.text())
      .then(text => new Promise(resolve => {
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: results => resolve(results.data || [])
        });
      }))
      .catch(err => {
        console.warn("⚠️ Failed to load JeffCoProjectListAllSchools.csv:", err);
        return [];
      }),
    fetch(withCacheBust(FACILITIES_DEFICIENCY_CSV_PATH))
      .then(res => res.text())
      .then(text => new Promise(resolve => {
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: results => resolve(results.data || [])
        });
      }))
      .catch(err => {
        console.warn("⚠️ Failed to load 02.2_FacilitiesDeficiencyProjects.csv:", err);
        return [];
      })
  ]).then(([projectRows, deficiencyRows]) =>
    (Array.isArray(projectRows) ? projectRows : []).concat(
      normalizeFacilitiesDeficiencyRollupRows(deficiencyRows)
    )
  );
  const distancesPromise = fetch(withCacheBust(DATA_URL_PREFIX + '06 SchooltoSchoolDistances.csv'))
    .then(res => res.text())
    .then(text => {
      return new Promise(resolve => {
        Papa.parse(text, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: results => resolve(results.data || [])
        });
      });
    })
    .then(rows => {
      const grouped = {};
      const norm = s => (s || '').toString().trim().toLowerCase();
      rows.forEach(row => {
        const originId =
          norm(row["Origin CDE Prefix"]) || // match our UniqueID format (CO-1420-####)
          norm(row["Origin CDE Code"]) ||
          norm(row["Origin CDE"]) ||
          "";
        if (!originId) return;
        if (!grouped[originId]) grouped[originId] = [];
        grouped[originId].push({
          destName: row["Destination Facility Name"],
          destGrades: row["Destination Grades"],
          gradeOverlap: row["Grade Overlap"],
          destId: norm(row["Destination CDE Prefix"] || row["Destination CDE Code"] || row["Destination CDE"]),
          distanceMiles: row["Network Distance (Miles)"] ?? row["Linear Distance (Miles)"] ?? null,
          nthClosest: row["Nth Closest to Origin"]
        });
      });
      // sort by nth closest
      Object.keys(grouped).forEach(key => {
        grouped[key].sort((a, b) => (a.nthClosest || 0) - (b.nthClosest || 0));
      });
      schoolDistancesByOrigin = grouped;
      window.schoolDistancesByOrigin = grouped;
      const gradesServedByOriginId = {};
      rows.forEach((row) => {
        const originId =
          norm(row["Origin CDE Prefix"]) ||
          norm(row["Origin CDE Code"]) ||
          norm(row["Origin CDE"]) ||
          "";
        if (!originId) return;
        const g = (row["Origin Grades"] ?? row.OriginGrades ?? "")
          .toString()
          .trim()
          .replace(/^'+/, "");
        if (g && !gradesServedByOriginId[originId]) gradesServedByOriginId[originId] = g;
      });
      window.gradesServedByOriginId = gradesServedByOriginId;
      try {
        document.dispatchEvent(new CustomEvent('jeffco-grades-served-ready'));
      } catch (_) {}
      // Mirror school-to-school rows in the shape legacy map code expected from OD_Draft (nearby highlight).
      const rowsByOrigin = {};
      const minByOrigin = {};
      Object.keys(grouped).forEach((originKey) => {
        (grouped[originKey] || []).forEach((r) => {
          const d = r.distanceMiles;
          if (!Number.isFinite(d)) return;
          if (!rowsByOrigin[originKey]) rowsByOrigin[originKey] = [];
          rowsByOrigin[originKey].push({
            "Network Distance (Miles)": d,
            NetworkDistanceMiles: d,
            "Destination CDE Prefix": r.destId,
            DestinationCDEPrefix: r.destId,
            "Destination Facility Name": r.destName,
            "Destination Grades": r.destGrades
          });
          if (minByOrigin[originKey] === undefined || d < minByOrigin[originKey]) minByOrigin[originKey] = d;
        });
      });
      window.distanceToWelcomingRowsByOrigin = rowsByOrigin;
      window.distanceToWelcomingMap = minByOrigin;
      if (!window.distanceToWelcomingMapByName || typeof window.distanceToWelcomingMapByName !== "object") {
        window.distanceToWelcomingMapByName = {};
      }
      console.log("📏 Loaded school-to-school distances for origins:", Object.keys(grouped).length);
      try {
        document.dispatchEvent(new CustomEvent("jeffco-school-distances-ready"));
      } catch (_) {}
    })
    .catch(err => {
      console.warn("⚠️ Failed to load SchooltoSchoolDistances.csv:", err);
      schoolDistancesByOrigin = {};
      window.schoolDistancesByOrigin = {};
      window.gradesServedByOriginId = {};
      window.distanceToWelcomingRowsByOrigin = {};
      window.distanceToWelcomingMap = {};
    });

  const mapExportPromise = fetch(withCacheBust(DATA_URL_PREFIX + '09 Map_Export.csv'))
    .then(res => res.text())
    .then(text => new Promise(resolve => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: results => resolve(results.data || [])
      });
    }))
    .catch(err => {
      console.warn("⚠️ Failed to load Map_Export.csv:", err);
      return [];
    });

  const bondSpendingPromise = fetch(withCacheBust(BOND_SPENDING_CSV_PATH))
    .then(res => res.text())
    .then(text => new Promise(resolve => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: results => resolve(results.data || [])
      });
    }))
    .then(rows => {
      const total = (rows || []).reduce((sum, r) => {
        const v = parseNumberLoose(r.TotalSpending);
        return sum + (Number.isFinite(v) ? v : 0);
      }, 0);
      bondSpendingByArticulation = new Map();
      (rows || []).forEach(r => {
        const name = (r.Articulation ?? '').toString().trim();
        if (!name) return;
        const spending = parseNumberLoose(r.TotalSpending) || 0;
        const pct = total > 0 ? (spending / total) * 100 : 0;
        bondSpendingByArticulation.set(name, { totalSpending: spending, pctOfTotal: pct, enrollmentGrowthPct: null });
      });
      return bondSpendingByArticulation;
    })
    .catch(err => {
      console.warn("⚠️ Failed to load HistoricBondSpendingByArticulationArea.csv:", err);
      bondSpendingByArticulation = new Map();
      return bondSpendingByArticulation;
    });

  const columnMapPromise =
    typeof window.loadDecisionColumnMap === "function"
      ? window.loadDecisionColumnMap()
      : Promise.resolve();

  Promise.all([geojsonPromise, decisionDataPromise, decisionAllPromise, projectListPromise, distancesPromise, mapExportPromise, bondSpendingPromise, columnMapPromise])
    .then(([geojson, decisionData, decisionAll, projectListRowsData, _distances, mapExportRows, _bondSpending]) => {
      void _distances; void _bondSpending; // preloaded for side-effects; bondSpendingByArticulation populated
      console.log("✅ GeoJSON, Decision Data, full Decision export, and Map Export are loaded.");

      mapExportRowsData = Array.isArray(mapExportRows) ? mapExportRows : [];
      const merged = mergeGeojsonWithMapExport(geojson, mapExportRowsData);
      mapExportLookupMaps = merged.lookup;
      window.mapExportRowsData = mapExportRowsData;
      window.mapExportLookupMaps = mapExportLookupMaps;

      // Build lookups from the FULL decision export (includes excluded/non-eval + closed)
      decisionAllRows = Array.isArray(decisionAll) ? decisionAll : [];
      // Normalize BuildingScore for any downstream display/logic that uses the full export.
      // Accept either 0–1 or 0–10 inputs; keep as a 2-decimal string for consistent display.
      decisionAllRows.forEach((r) => {
        const raw = r && (r.BuildingScore ?? r["BuildingScore"]);
        const n = Number(String(raw ?? "").trim().replace(/,/g, ''));
        if (!Number.isFinite(n)) return;
        const scaled = n <= 1.5 ? n * 10 : n;
        r.BuildingScore = scaled.toFixed(2);
      });
      decisionAllByName = new Map(
        decisionAllRows
          .map(r => [normalizeName(r["Building Name"]), r])
          .filter(([k]) => !!k)
      );
      decisionAllById = new Map(
        decisionAllRows
          .map(r => [normalizeId(r.UniqueID || r["UniqueID"] || r["Unique Id"]), r])
          .filter(([k]) => !!k)
      );
      window.decisionAllById = decisionAllById;
      window.decisionAllByName = decisionAllByName;
      try {
        if (typeof window.refreshStep1ArticulationDropdown === 'function') {
          window.refreshStep1ArticulationDropdown();
        }
      } catch (_) {}

      mergeComputedArticulationEnrollmentGrowth(decisionAllRows, mapExportRowsData);
      try {
        refreshArticulationGeojsonBondEnrollmentProps();
        refreshArticulationAreaPaintColors();
      } catch (_) {}

      // Build building condition model (BuildingScore from Decision Data Export)
      try {
        const bModel = buildBuildingConditionModel(decisionAllRows);
        buildingScoresById = bModel.byId;
        buildingQuartiles = bModel.quartiles;
      } catch (e) {
        console.warn("⚠️ Failed to build building condition model:", e);
        buildingScoresById = new Map();
        buildingQuartiles = null;
      }

      // Build FCI model: per-system costs from project list (08_* deficiency); overall FCI from Decision Data Export.csv column FCI when present, else DM/(DM+non-DM replacement) from project list.
      projectListRowsForMap = Array.isArray(projectListRowsData) ? projectListRowsData : [];
      try {
        fciSystemQuartiles = new Map();
        const model = buildFciModelFromProjectList(projectListRowsForMap, decisionAllRows);
        fciBySchoolId = model.bySchoolId;
        fciSystems = model.systems;
        fciOverallQuartiles = model.overallQuartiles;
        fciSelectedSystem = canonicalFciSystemName(fciSelectedSystem);
        if (fciSelectedSystem && !fciSystems.includes(fciSelectedSystem)) fciSelectedSystem = '';
        compareFciSystem = [...new Set(
          (Array.isArray(compareFciSystem) ? compareFciSystem : [])
            .map(canonicalFciSystemName)
            .filter((s) => fciSystems.includes(s))
        )];
      } catch (e) {
        console.warn("⚠️ Failed to build FCI model:", e);
        fciBySchoolId = new Map();
        fciSystems = [];
        fciOverallQuartiles = null;
      }

      // Populate FCI system dropdown (if present)
      try {
        const fciSelect = document.getElementById('fciSystemSelect');
        if (fciSelect) {
          fciSelect.innerHTML = '<option value="">All systems (overall FCI)</option>';
          fciSystems.forEach((sys) => {
            const opt = document.createElement('option');
            opt.value = sys;
            opt.textContent = sys;
            fciSelect.appendChild(opt);
          });
          fciSelect.value = fciSelectedSystem || '';
        }
      } catch (e) {}
      try {
        const compareList = document.getElementById('compareFciSystemList');
        if (compareList) {
          compareList.innerHTML = '';
          fciSystems.slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).forEach((sys) => {
            const label = document.createElement('label');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.setAttribute('data-compare-fci-system', sys);
            cb.checked = Array.isArray(compareFciSystem) && compareFciSystem.includes(sys);
            const span = document.createElement('span');
            span.textContent = sys;
            label.appendChild(cb);
            label.appendChild(span);
            compareList.appendChild(label);
          });
        }
        try { updateCompareFciSystemsVisibility(); } catch {}
      } catch (e) {}

      // Build articulation area -> school list index (for map popups)
      try {
        // Use Map_Export.csv because it contains the per-school articulation area assignment.
        // Use Decision Data Export.csv to group by School Level.
        articulationSchoolsByArea = buildArticulationSchoolsIndexFromMapExport(mapExportRowsData, decisionAllRows);
      } catch (e) {
        articulationSchoolsByArea = new Map();
      }
      try { populateMapArticulationAreaSelect(); } catch {}
      try { updateArticulationAreaFciTable(); } catch {}
      try {
        if (typeof window.globalSearchRegisterFciSystems === "function") {
          window.globalSearchRegisterFciSystems(fciSystems || []);
        }
      } catch (_) {}
      try {
        if (typeof window.syncGlobalSearchArticulationAreas === "function") {
          window.syncGlobalSearchArticulationAreas();
        }
      } catch (_) {}

      // Keep all schools; filtering will be controlled by toggles
      geojsonData = merged.geojson;
      window.geojsonData = geojsonData; // Expose globally for prioritization UI
      
      injectDecisionsIntoGeoJSON(geojsonData, decisionData);

      // Inject FCI metrics (overall + selected system status)
      try {
        applyFciMetricsToFeatures(geojsonData.features || []);
      } catch (e) {
        console.warn("⚠️ Unable to apply FCI metrics to GeoJSON:", e);
      }

      // Inject building condition metrics
      try {
        applyBuildingMetricsToFeatures(geojsonData.features || []);
      } catch (e) {
        console.warn("⚠️ Unable to apply building metrics to GeoJSON:", e);
      }
      
      // Store a deep copy of the original data for filtering
      originalGeojsonData = JSON.parse(JSON.stringify(geojsonData));
      console.log("✅ Original GeoJSON data saved for filtering");

      // Apply initial filters so non-eval/closed are hidden until toggled on
      try {
        if (map && map.getSource && map.getSource('schools')) {
          updateLayer();
        }
      } catch (initFilterErr) {
        console.warn("⚠️ Initial filter failed:", initFilterErr);
      }
      
      initializeDropdownFilters(decisionData);
      try { setFciSelectedSystem(fciSelectedSystem); } catch {}
      // Wire up School Matches filter checkboxes
      const schoolMatchesWithinDistance = document.getElementById('schoolMatchesWithinDistance');
      const schoolMatchesOverlappingGrades = document.getElementById('schoolMatchesOverlappingGrades');
      function applyNearbyFromSchoolMatchesControls() {
        const mapSelect = document.getElementById('mapOriginSchoolSelect');
        const selectedId = mapSelect ? mapSelect.value : '';
        let selectedName = '';
        if (selectedId && window.decisionLogic && Array.isArray(window.decisionLogic.schoolData)) {
          const row = window.decisionLogic.schoolData.find(r => {
            const uid = (r.UniqueID || r["UniqueID"] || r["Unique Id"] || '').toString().trim();
            return uid === selectedId;
          });
          selectedName = row ? row["Building Name"] : '';
        }
        refreshNearbySchoolMatchesUi(selectedId, selectedName);
      }
      [schoolMatchesWithinDistance, schoolMatchesOverlappingGrades].forEach(el => {
        if (el) el.addEventListener('change', applyNearbyFromSchoolMatchesControls);
      });

      // Populate and sync the origin dropdown that appears on the map
      try {
        const mapOriginSelect = document.getElementById('mapOriginSchoolSelect');
        const flowchartSelect = document.getElementById('mainFlowchartSchoolSelect');
        if (mapOriginSelect) {
          // Build sorted list of schools from decisionLogic.schoolData if available,
          // otherwise from the raw decisionData passed into this function. Store the
          // UniqueID as the option value and the Building Name as the label so we
          // can reliably sync using IDs from the map features.
          const sourceRows = (window.decisionLogic && Array.isArray(window.decisionLogic.schoolData) && window.decisionLogic.schoolData.length > 0)
            ? window.decisionLogic.schoolData
            : decisionData;

          const rowsWithIds = sourceRows
            .filter(r => {
              const name = r["Building Name"];
              const uid = (r.UniqueID || r["UniqueID"] || r["Unique Id"] || "").toString().trim();
              return !!name && !!uid;
            })
            .sort((a, b) => {
              const an = (a["Building Name"] || "").toString();
              const bn = (b["Building Name"] || "").toString();
              return an.localeCompare(bn, undefined, { numeric: true, sensitivity: 'base' });
            });

          mapOriginSelect.innerHTML = '<option value="">-- Select School --</option>';
          rowsWithIds.forEach(row => {
            const uid = (row.UniqueID || row["UniqueID"] || row["Unique Id"] || "").toString().trim();
            const name = row["Building Name"];
            const opt = document.createElement('option');
            opt.value = uid;          // store UniqueID for reliable matching
            opt.textContent = mainDisplaySchoolName(name);   // show human-readable name
            mapOriginSelect.appendChild(opt);
          });

          // Hide School Matches until a school is selected
          setNearbySchoolsSectionVisibility(mapOriginSelect.value);

          // Keep map dropdown selection in sync with the flowchart dropdown.
          // When the user changes the map dropdown, look up the corresponding
          // school by UniqueID, then drive the flowchart + map from the name.
          mapOriginSelect.addEventListener('change', () => {
            if (mapSelectSyncing) return;
            const selectedId = mapOriginSelect.value;
            setNearbySchoolsSectionVisibility(selectedId);
            if (!selectedId) {
              updateNearbySchoolsPanel('', '');
              window.currentSelectedSchoolName = '';
              window.currentOriginId = '';
              window.currentOriginName = '';
              clearSelectedSchoolHighlight();
              nearbyFilterIds = null;
              try {
                localStorage.removeItem('mapSelectedOriginId');
                localStorage.removeItem('mapSelectedOriginName');
              } catch (_) {}
              updateLayer();
              // Selecting a school zooms the map in; clearing it must zoom back
              // out or the restored schools sit outside the viewport.
              if (typeof window.fitMapToAllSchools === 'function') {
                window.__mapSchoolFitVerified = false;
                window.fitMapToAllSchools();
              }
              return;
            }

            // Find the matching row by UniqueID to recover the canonical name
            const allRows = (window.decisionLogic && Array.isArray(window.decisionLogic.schoolData) && window.decisionLogic.schoolData.length > 0)
              ? window.decisionLogic.schoolData
              : decisionData;
            const selectedRow = (allRows || []).find(r => {
              const uid = (r.UniqueID || r["UniqueID"] || r["Unique Id"] || "").toString().trim();
              return uid === selectedId;
            });
            const selectedName = selectedRow ? selectedRow["Building Name"] : "";

            // Track the current selection globally so other components (like
            // the flowchart and slider updates) can use it even if the
            // flowchart dropdown hasn't been interacted with yet.
            if (selectedName) {
              window.currentSelectedSchoolName = selectedName;
              window.currentOriginId = selectedId;
              window.currentOriginName = selectedName;
              localStorage.setItem('mapSelectedOriginId', selectedId);
              localStorage.setItem('mapSelectedOriginName', selectedName);
            }

            // Update School Matches panel using dropdown filter + distance sliders
            refreshNearbySchoolMatchesUi(selectedId, selectedName);

            if (flowchartSelect && selectedName) {
              mapSelectSyncing = true;
              try {
                // Update the flowchart dropdown value and fire its change handler
                flowchartSelect.value = selectedName;
                const evt = new Event('change', { bubbles: true });
                flowchartSelect.dispatchEvent(evt);
              } finally {
                mapSelectSyncing = false;
              }
            }

            // Always ensure the map reflects the newly selected origin,
            // even if the flowchart has not been initialized yet.
            if (selectedName && typeof window.showOnMapFromFlowchart === 'function') {
              mapSelectSyncing = true;
              try {
                window.showOnMapFromFlowchart(selectedName);
              } finally {
                mapSelectSyncing = false;
              }
            }
          });

          // Restore saved selection if available, otherwise auto-select first option
          const tryRestoreSavedSelection = () => {
            const norm = (s) => (s || "").toString().trim().toLowerCase();
            let restored = false;
            if (savedOriginId) {
              const matchById = Array.from(mapOriginSelect.options || []).find(opt => opt.value === savedOriginId);
              if (matchById) {
                mapOriginSelect.value = savedOriginId;
                restored = true;
              }
            }
            if (!restored && savedOriginName) {
              const matchByName = Array.from(mapOriginSelect.options || []).find(opt => norm(opt.textContent) === norm(savedOriginName));
              if (matchByName) {
                mapOriginSelect.value = matchByName.value;
                restored = true;
              }
            }
            if (restored) {
              window.initialSelectionApplied = true;
              const evt = new Event('change', { bubbles: true });
              mapOriginSelect.dispatchEvent(evt);
              console.log("🎯 Restored saved selection:", mapOriginSelect.value);
            }
            return restored;
          };

          if (!window.initialSelectionApplied) {
            const restored = tryRestoreSavedSelection();
            // If not restored, leave selection empty (no auto-selection)
          }

          // No auto-selection: leave empty unless a saved/restored selection was applied
          window.initialSelectionApplied = true;
        }
      } catch (e) {
        console.warn("⚠️ Unable to initialize map origin dropdown:", e);
      }

      // Initialize prioritization UI with school data and decisions
      if (typeof window.prioritizationUI !== 'undefined' && typeof window.prioritizationUI.initialize === 'function') {
        console.log("🎯 Initializing prioritization UI");
        const schoolDataWithDecisions = decisionData.map(row => ({
          ...row,
          decision: row.decision || row["Decision Type"]
        }));
        window.prioritizationUI.initialize(schoolDataWithDecisions);
      }

      // Add the source for the school data
      map.addSource('schools', {
        type: 'geojson',
        data: geojsonData
      });

      // Optional overlay: articulation areas (below school dots)
      try {
        const aaCb = document.getElementById('toggleArticulationAreas');
        const aaVis = (aaCb && aaCb.checked) ? 'visible' : 'none';
        map.addSource('articulation-areas', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
        map.addSource('articulation-area-label-points', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
        map.addLayer({
          id: 'articulation-areas-fill',
          type: 'fill',
          source: 'articulation-areas',
          layout: { visibility: aaVis },
          paint: {
            'fill-color': '#000000',
            'fill-opacity': ARTICULATION_FILL_OPACITY
          }
        });
        map.addLayer({
          id: 'articulation-areas-outline',
          type: 'line',
          source: 'articulation-areas',
          layout: { visibility: aaVis },
          paint: {
            'line-color': ARTICULATION_OUTLINE_COLOR,
            'line-opacity': ARTICULATION_OUTLINE_OPACITY,
            'line-width': ARTICULATION_OUTLINE_WIDTH
          }
        });

        const labelsVisInit = (aaCb && aaCb.checked) ? 'visible' : 'none';
        map.addLayer({
          id: 'articulation-areas-labels',
          type: 'symbol',
          source: 'articulation-area-label-points',
          filter: ['!=', ['coalesce', ['get', '__aaName'], ''], ''],
          layout: getArticulationAreaLabelLayerLayout(labelsVisInit),
          paint: getArticulationAreaLabelLayerPaint()
        });

        // Load + reproject on demand
        loadArticulationAreas4326()
          .then((gj) => {
            setArticulationAreasMapData(map, gj || { type: 'FeatureCollection', features: [] });
            try { if (typeof window.__updateBondMapLegend === 'function') window.__updateBondMapLegend(); } catch {}
            try { populateMapArticulationAreaSelect(); } catch {}
          })
          .catch((e) => console.warn('Failed to load articulation areas', e));

        // Click popups for articulation areas (no hover-follow)
        // Note: allow resizing beyond Mapbox default maxWidth.
        const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: false, maxWidth: 'none', className: 'aa-popup' });
        let pinned = false;
        popup.on('close', () => {
          if (window.__aaRefreshing) return;
          pinned = false;
          try { window.__aaPopupAreaName = null; } catch {}
          try { window.__aaPopup = null; } catch {}
          try { refreshArticulationAreaSelectionOutline(); } catch (_) {}
        });
        const _aaRefreshingGuard = (fn) => {
          window.__aaRefreshing = true;
          try { fn(); } finally { window.__aaRefreshing = false; }
        };

        // Make the popup behave like a small movable/resizable "panel"
        const enhanceArticulationPopupPanel = () => {
          try {
            const root = popup.getElement ? popup.getElement() : null;
            if (!root) return;
            const content = root.querySelector('.mapboxgl-popup-content');
            if (!content) return;

            // Make close button visible + black (some themes/styles override it)
            try {
              const btn = root.querySelector('.mapboxgl-popup-close-button');
              if (btn) {
                btn.style.display = 'block';
                btn.style.opacity = '1';
                btn.style.color = '#111827';
                btn.style.fontWeight = '900';
                btn.style.fontSize = '18px';
                btn.style.lineHeight = '18px';
              }
            } catch {}

            // Panel sizing + layout
            content.style.minWidth = '260px';
            content.style.minHeight = '140px';
            content.style.maxWidth = '80vw';
            content.style.maxHeight = '70vh';
            content.style.display = 'flex';
            content.style.flexDirection = 'column';
            content.style.overflow = 'hidden'; // needed for resize handles; body will scroll
            content.style.resize = 'both';
            content.style.position = 'relative';
            // Reset any prior drag transform if we are using fixed placement.
            content.style.transform = '';
            if (!content.style.left) content.style.left = '0px';
            if (!content.style.top) content.style.top = '0px';

            // Ensure header text clears the close button.
            const headerRow = content.querySelector('.aa-popup-header-row');
            if (headerRow && !headerRow.style.paddingRight) {
              headerRow.style.paddingRight = '22px';
            }

            if (!content.dataset.aaFciToggleBound) {
              content.dataset.aaFciToggleBound = '1';
              content.addEventListener('click', (ev) => {
                const btn = ev.target && ev.target.closest ? ev.target.closest('.aa-fci-detail-toggle-btn') : null;
                if (!btn) return;
                ev.preventDefault();
                ev.stopPropagation();
                window.__aaFciSystemsExpanded = !window.__aaFciSystemsExpanded;
                try {
                  if (window.__aaRefreshPopupNow) window.__aaRefreshPopupNow();
                  else if (window.__aaRefreshPopup) window.__aaRefreshPopup();
                } catch (_) {}
              });
              content.addEventListener('mousedown', (ev) => {
                const btn = ev.target && ev.target.closest ? ev.target.closest('.aa-fci-detail-toggle-btn') : null;
                if (btn) ev.stopPropagation();
              });
            }

            const body = content.querySelector('.aa-popup-body');
            if (body) {
              body.style.flex = '1 1 auto';
              body.style.minHeight = '0';
              body.style.overflowY = 'auto';
              body.style.overflowX = 'hidden';
            }

            content.style.overflowX = 'hidden';

            const gridHeader = content.querySelector('.aa-school-grid-header');
            if (gridHeader) {
              const colCount = gridHeader.querySelectorAll('.aa-th-metric, .aa-th-school').length;
              content.style.minWidth = `${Math.max(300, 96 + colCount * 32)}px`;
            }

            // Resize handles on all sides (rebind each time)
            if (content.__aaResizeHandles) {
              content.querySelectorAll('.aa-resize-handle').forEach(h => h.remove());
              content.__aaResizeHandles = false;
            }
            if (!content.__aaResizeHandles) {
              content.__aaResizeHandles = true;
              const makeHandle = (dir, style) => {
                const h = document.createElement('div');
                h.className = `aa-resize-handle aa-resize-${dir}`;
                h.style.cssText = style;
                h.dataset.dir = dir;
                return h;
              };
              const handles = [
                makeHandle('n', 'position:absolute; top:-3px; left:10px; right:10px; height:6px; cursor:n-resize;'),
                makeHandle('s', 'position:absolute; bottom:-3px; left:10px; right:10px; height:6px; cursor:s-resize;'),
                makeHandle('e', 'position:absolute; right:-3px; top:10px; bottom:10px; width:6px; cursor:e-resize;'),
                makeHandle('w', 'position:absolute; left:-3px; top:10px; bottom:10px; width:6px; cursor:w-resize;'),
                makeHandle('ne', 'position:absolute; right:-3px; top:-3px; width:10px; height:10px; cursor:ne-resize;'),
                makeHandle('nw', 'position:absolute; left:-3px; top:-3px; width:10px; height:10px; cursor:nw-resize;'),
                makeHandle('se', 'position:absolute; right:-3px; bottom:-3px; width:10px; height:10px; cursor:se-resize;'),
                makeHandle('sw', 'position:absolute; left:-3px; bottom:-3px; width:10px; height:10px; cursor:sw-resize;')
              ];
              handles.forEach(h => {
                h.addEventListener('mousedown', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const rect = content.getBoundingClientRect();
                  const startX = e.clientX;
                  const startY = e.clientY;
                  const startW = rect.width;
                  const startH = rect.height;
                  const minW = 260;
                  const minH = 140;
                  const maxW = Math.min(window.innerWidth - 40, window.innerWidth * 0.9);
                  const maxH = Math.min(window.innerHeight - 40, window.innerHeight * 0.9);
                  const startLeft = parseFloat(content.style.left || '0') || 0;
                  const startTop = parseFloat(content.style.top || '0') || 0;

                  const onMove = (ev) => {
                    const dx = ev.clientX - startX;
                    const dy = ev.clientY - startY;
                    let newW = startW;
                    let newH = startH;
                    let newLeft = startLeft;
                    let newTop = startTop;
                    const dir = h.dataset.dir || '';
                    if (dir.includes('e')) {
                      newW = Math.min(maxW, Math.max(minW, startW + dx));
                    }
                    if (dir.includes('s')) {
                      newH = Math.min(maxH, Math.max(minH, startH + dy));
                    }
                    if (dir.includes('w')) {
                      newW = Math.min(maxW, Math.max(minW, startW - dx));
                      newLeft = startLeft + dx;
                    }
                    if (dir.includes('n')) {
                      newH = Math.min(maxH, Math.max(minH, startH - dy));
                      newTop = startTop + dy;
                    }
                    content.style.width = `${newW}px`;
                    content.style.height = `${newH}px`;
                    content.style.left = `${newLeft}px`;
                    content.style.top = `${newTop}px`;
                  };
                  const onUp = () => {
                    document.body.style.userSelect = '';
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                  };
                  document.body.style.userSelect = 'none';
                  window.addEventListener('mousemove', onMove);
                  window.addEventListener('mouseup', onUp);
                });
                content.appendChild(h);
              });
            }

            // Draggable (drag the header)
            const handle = content.querySelector('.aa-popup-drag');
            if (!handle) return;
            if (handle.__aaDragBound) return;
            handle.__aaDragBound = true;

            const num = (v) => {
              const n = Number.parseFloat(v);
              return Number.isFinite(n) ? n : 0;
            };
            if (content.dataset.aaDx == null) content.dataset.aaDx = '0';
            if (content.dataset.aaDy == null) content.dataset.aaDy = '0';

            let dragging = false;
            let startX = 0;
            let startY = 0;
            let baseDx = 0;
            let baseDy = 0;

            const clampToViewport = () => {
              const margin = 8;
              const rect = content.getBoundingClientRect();
              let dx = num(content.dataset.aaDx);
              let dy = num(content.dataset.aaDy);

              const maxRight = window.innerWidth - margin;
              const maxBottom = window.innerHeight - margin;

              if (rect.left < margin) dx += (margin - rect.left);
              if (rect.top < margin) dy += (margin - rect.top);
              if (rect.right > maxRight) dx -= (rect.right - maxRight);
              if (rect.bottom > maxBottom) dy -= (rect.bottom - maxBottom);

              if (dx !== num(content.dataset.aaDx) || dy !== num(content.dataset.aaDy)) {
                applyTransform(dx, dy, true);
              }
            };

            const applyTransform = (dx, dy, skipClamp) => {
              content.dataset.aaDx = String(dx);
              content.dataset.aaDy = String(dy);
              // Apply translate only to content so Mapbox can keep positioning the popup container.
              content.style.transform = `translate(${dx}px, ${dy}px)`;
              if (!skipClamp) clampToViewport();
            };

            const onMove = (clientX, clientY) => {
              const dx = baseDx + (clientX - startX);
              const dy = baseDy + (clientY - startY);
              applyTransform(dx, dy);
            };

            const onMouseMove = (ev) => {
              if (!dragging) return;
              ev.preventDefault();
              onMove(ev.clientX, ev.clientY);
            };
            const onMouseUp = () => {
              if (!dragging) return;
              dragging = false;
              document.removeEventListener('mousemove', onMouseMove, true);
              document.removeEventListener('mouseup', onMouseUp, true);
            };

            const onTouchMove = (ev) => {
              if (!dragging) return;
              const t = ev.touches && ev.touches[0] ? ev.touches[0] : null;
              if (!t) return;
              ev.preventDefault();
              onMove(t.clientX, t.clientY);
            };
            const onTouchEnd = () => {
              if (!dragging) return;
              dragging = false;
              document.removeEventListener('touchmove', onTouchMove, { capture: true });
              document.removeEventListener('touchend', onTouchEnd, { capture: true });
              document.removeEventListener('touchcancel', onTouchEnd, { capture: true });
            };

            handle.addEventListener('mousedown', (ev) => {
              if (ev.button !== 0) return;
              // Don't start a map drag; treat as panel drag.
              ev.preventDefault();
              dragging = true;
              startX = ev.clientX;
              startY = ev.clientY;
              baseDx = num(content.dataset.aaDx);
              baseDy = num(content.dataset.aaDy);
              document.addEventListener('mousemove', onMouseMove, true);
              document.addEventListener('mouseup', onMouseUp, true);
            });

            handle.addEventListener('touchstart', (ev) => {
              const t = ev.touches && ev.touches[0] ? ev.touches[0] : null;
              if (!t) return;
              ev.preventDefault();
              dragging = true;
              startX = t.clientX;
              startY = t.clientY;
              baseDx = num(content.dataset.aaDx);
              baseDy = num(content.dataset.aaDy);
              document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
              document.addEventListener('touchend', onTouchEnd, { capture: true });
              document.addEventListener('touchcancel', onTouchEnd, { capture: true });
            }, { passive: false });

            // Keep popup within viewport on map move/zoom/resize
            if (!content.__aaClampBound) {
              content.__aaClampBound = true;
              const onMapMove = () => {
                try { clampToViewport(); } catch {}
              };
              content.__aaClampHandler = onMapMove;
              try {
                map.on('move', onMapMove);
                map.on('zoom', onMapMove);
                map.on('resize', onMapMove);
              } catch {}
              popup.on('close', () => {
                try {
                  map.off('move', onMapMove);
                  map.off('zoom', onMapMove);
                  map.off('resize', onMapMove);
                } catch {}
              });
            }

            // Initial clamp to keep header on screen
            try { clampToViewport(); } catch {}

          } catch {}
        };

        const positionArticulationPopupTopRight = () => {
          try {
            const canvas = map.getCanvas();
            const w = canvas.clientWidth || canvas.width;
            const offset = 12;
            const lngLat = map.unproject([w - offset, offset]);
            popup.setLngLat(lngLat);
          } catch {}
        };

        const buildPopupHtml = (areaName) => {
          const areaKey = normalizeArticulationAreaKey(areaName);
          const filteredArea = getFilteredSchoolsInArticulationArea(areaKey);
          const groups = filteredArea.groups || {};
          const allGroupKeys = filteredArea.groupKeys || [];
          const getSelectedSchoolTypesFromDom = () => {
            try {
              const menu = document.getElementById('schoolTypeDropdownMenu');
              let selected = [];
              if (menu) {
                selected = Array.from(menu.querySelectorAll('input[type="checkbox"]'))
                  .filter(cb => cb.checked)
                  .map(cb => (cb.value || '').toString().trim())
                  .filter(Boolean);
              }
              if (!selected.length) {
                const select = document.getElementById('schoolTypeFilter');
                if (select) {
                  selected = Array.from(select.options)
                    .filter(opt => opt.selected)
                    .map(opt => (opt.value || '').toString().trim())
                    .filter(Boolean);
                }
              }
              return selected;
            } catch {
              return [];
            }
          };
          const selectedLevelKeys = getSelectedSchoolTypesFromDom()
            .map(k => (k || '').toString().trim().toLowerCase());
          const groupKeys = selectedLevelKeys.length
            ? allGroupKeys.filter((k) => selectedLevelKeys.includes((k || '').toString().trim().toLowerCase()))
            : allGroupKeys;
          const total = groupKeys.reduce((sum, k) => sum + ((groups[k] || []).length), 0);

          const getSelectedCompareCategories = () => {
            const list = document.getElementById('compareCategoryList');
            if (list) {
              const selected = [];
              list.querySelectorAll('input[data-compare-category]').forEach((cb) => {
                if (cb.checked) selected.push(cb.getAttribute('data-compare-category'));
              });
              if (selected.length) return selected;
            }
            if (Array.isArray(window.__compareCategories) && window.__compareCategories.length) {
              return window.__compareCategories.slice();
            }
            return Object.keys(COMPARE_CATEGORY_DEFS);
          };
          const selectedCategories = getSelectedCompareCategories();

          const getBucketColor = (catKey, bucketKey) => {
            const buckets = getCompareBuckets(catKey) || [];
            return (buckets.find(b => b.key === bucketKey)?.color) || '#cbd5e1';
          };

          const getSelectedCompareSystemsFromDom = () => {
            const list = document.getElementById('compareFciSystemList');
            if (!list) return [];
            const selected = [];
            list.querySelectorAll('input[data-compare-fci-system]').forEach((cb) => {
              if (cb.checked) selected.push(cb.getAttribute('data-compare-fci-system'));
            });
            return selected;
          };
          const selectedCompareSystems = (() => {
            const fromDom = getSelectedCompareSystemsFromDom()
              .map((s) => canonicalFciSystemName(s))
              .filter(Boolean);
            if (fromDom.length) return fromDom;
            return (Array.isArray(compareFciSystem) ? compareFciSystem : [])
              .map((s) => canonicalFciSystemName(s))
              .filter(Boolean);
          })();
          const fmtNum2 = (n) => (Number.isFinite(n) ? n.toFixed(2) : '—');
          const fmtCurrency = (n) => {
            if (!Number.isFinite(n)) return '$0.00';
            const fixed = n.toFixed(2);
            return `$${fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
          };
          const fmtCurrencyK = (n) => {
            if (!Number.isFinite(n)) return '$0k';
            const k = Math.round(n / 1000);
            const withCommas = k.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            return `$${withCommas}k`;
          };

          const getNumericValue = (catKey, schoolId, feature, fciEntry, fciSystemName) => {
            if (catKey === 'utilization') {
              const util = normalizeUtilizationValue(feature?.properties?.['Utilization'] ?? 0);
              return Number.isFinite(util) ? util * 100 : null;
            }
            if (catKey === 'building') {
              const v = feature?.properties?.__buildingScore;
              return Number.isFinite(v) ? v : null;
            }
            if (catKey === 'fci') {
              if (fciSystemName) {
                const sysEntry = fciEntry?.bySystem?.get(fciSystemName);
                const pc = sysEntry?.priorityCosts || {};
                const p1 = pc[1];
                return Number.isFinite(p1) ? p1 : null;
              }
              const v = fciEntry?.overallFci;
              return Number.isFinite(v) ? v : null;
            }
            return null;
          };

          const getColorValue = (catKey, schoolId, feature, fciEntry, fciSystemName) => {
            if (catKey === 'fci') {
              if (fciSystemName) {
                const v = fciEntry?.bySystem?.get(fciSystemName)?.priorityAvgCostPerSf?.[1];
                return Number.isFinite(v) ? v : null;
              }
              const v = fciEntry?.overallFci;
              return Number.isFinite(v) ? v : null;
            }
            return getNumericValue(catKey, schoolId, feature, fciEntry, fciSystemName);
          };

          const computeAverageData = () => {
            const levelTotals = {};
            const areaTotals = {};
            const ensureEntry = (key) => {
              if (!areaTotals[key]) areaTotals[key] = { sumDisplay: 0, countDisplay: 0, sumColor: 0, countColor: 0 };
            };
            const ensureLevelEntry = (level, key) => {
              if (!levelTotals[level]) levelTotals[level] = {};
              if (!levelTotals[level][key]) levelTotals[level][key] = { sumDisplay: 0, countDisplay: 0, sumColor: 0, countColor: 0 };
            };
            const avgKeys = [];
            const baseOrder = ['utilization', 'building'];
            baseOrder.forEach((catKey) => {
              if (!selectedCategories.includes(catKey)) return;
              avgKeys.push({
                key: catKey,
                label: COMPARE_CATEGORY_DEFS[catKey]?.label || catKey,
                catKey,
                system: null,
                isPercent: catKey === 'utilization',
                isSum: false
              });
            });
            if (selectedCategories.includes('fci')) {
              avgKeys.push({ key: 'fci_overall', label: 'FCI (Overall)', catKey: 'fci', system: null, isPercent: false, isSum: false });
            }
            if (selectedCompareSystems.length) {
              selectedCompareSystems.forEach((sys) => {
                avgKeys.push({ key: `fci_${sys}`, label: `FCI (${sys})`, catKey: 'fci', system: sys, isPercent: false, isSum: true });
              });
            }
            const schoolNames = [];
            groupKeys.forEach((gk) => {
              (groups[gk] || []).forEach((n) => schoolNames.push(n));
            });
            schoolNames.forEach((name) => {
              const id = resolveSchoolIdFromName(name);
              if (!id) return;
              const feature = getFeatureById(id);
              const level = getSchoolLevelForFeature(feature) || 'Unknown';
              const entry = fciBySchoolId.get(id);
              avgKeys.forEach(({ key, catKey, system }) => {
                const displayVal = getNumericValue(catKey, id, feature, entry, system);
                const colorVal = getColorValue(catKey, id, feature, entry, system);
                if (!Number.isFinite(displayVal) && !Number.isFinite(colorVal)) return;
                ensureEntry(key);
                if (Number.isFinite(displayVal)) {
                  areaTotals[key].sumDisplay += displayVal;
                  areaTotals[key].countDisplay += 1;
                }
                if (Number.isFinite(colorVal)) {
                  areaTotals[key].sumColor += colorVal;
                  areaTotals[key].countColor += 1;
                }
                ensureLevelEntry(level, key);
                if (Number.isFinite(displayVal)) {
                  levelTotals[level][key].sumDisplay += displayVal;
                  levelTotals[level][key].countDisplay += 1;
                }
                if (Number.isFinite(colorVal)) {
                  levelTotals[level][key].sumColor += colorVal;
                  levelTotals[level][key].countColor += 1;
                }
              });
            });
            return { avgKeys, areaTotals, levelTotals };
          };

          const { avgKeys, areaTotals, levelTotals } = computeAverageData();

          const SWATCH_SIZE = 10;
          const swatchStyle = `width:${SWATCH_SIZE}px; height:${SWATCH_SIZE}px; border-radius:2px; border:1px solid #9ca3af; display:inline-block;`;

          const getBucketForAvg = (catKey, system, avg) => {
            if (!Number.isFinite(avg)) return 'No Data';
            if (catKey === 'fci') {
              return system
                ? getFciStatusFromValue(avg, computeFciQuartilesForSystem(system), false)
                : getFciStatusFromValue(avg, fciOverallQuartiles, true);
            }
            if (catKey === 'utilization') {
              const { low, high } = getUtilizationThresholds();
              const util = normalizeUtilizationValue((avg ?? 0) / 100);
              return (util < low) ? 'low' : (util > high) ? 'high' : 'mid';
            }
            if (catKey === 'building') return getBuildingConditionFromValue(avg, buildingQuartiles);
            return 'No Data';
          };

          const getColorForBucket = (catKey, bucket) => {
            if (catKey === 'fci') return getFciStatusColorHex(bucket);
            if (catKey === 'utilization') {
              return bucket === 'low' ? UTILIZATION_PHASE_COLORS.low
                : bucket === 'high' ? UTILIZATION_PHASE_COLORS.high
                : UTILIZATION_PHASE_COLORS.mid;
            }
            if (catKey === 'building') return getBuildingConditionColorHex(bucket);
            return '#cbd5e1';
          };

          const hasFciSystems = selectedCompareSystems.length > 0;
          if (!hasFciSystems) {
            window.__aaFciSystemsExpanded = false;
          } else if (typeof window.__aaFciSystemsExpanded !== 'boolean') {
            window.__aaFciSystemsExpanded = false;
          }
          const fciDetailExpanded = hasFciSystems && !!window.__aaFciSystemsExpanded;
          const fciCategoryOn = selectedCategories.includes('fci');
          const showFciOverall = fciCategoryOn;
          const showFciSystemColumns = hasFciSystems && fciDetailExpanded;

          const buildAreaAvgSwatchCell = (avgKeyDef) => {
            const { key, label, isPercent, catKey, system, isSum } = avgKeyDef;
            const entry = areaTotals[key];
            const hasDisplay = entry && entry.countDisplay;
            const hasColor = entry && entry.countColor;
            const displayVal = hasDisplay ? (isSum ? entry.sumDisplay : (entry.sumDisplay / entry.countDisplay)) : (isSum ? 0 : null);
            const colorVal = hasColor ? (entry.sumColor / entry.countColor) : null;
            const bucket = getBucketForAvg(catKey, system, colorVal);
            const color = getColorForBucket(catKey, bucket);
            const valText = hasDisplay
              ? (isSum ? fmtCurrencyK(displayVal) : (fmtNum2(displayVal) + (isPercent ? '%' : '')))
              : (isSum ? fmtCurrencyK(displayVal) : '—');
            return `<span class="aa-col-metric"><span title="${escapeHtml(label)}: ${valText}" style="${swatchStyle} background:${color};"></span></span>`;
          };

          const buildLevelAvgSwatchCell = (level, avgKeyDef) => {
            const { key, label, isPercent, catKey, system, isSum } = avgKeyDef;
            const entry = levelTotals[level]?.[key];
            const hasDisplay = entry && entry.countDisplay;
            const hasColor = entry && entry.countColor;
            const displayVal = hasDisplay ? (isSum ? entry.sumDisplay : (entry.sumDisplay / entry.countDisplay)) : (isSum ? 0 : null);
            const colorVal = hasColor ? (entry.sumColor / entry.countColor) : null;
            const bucket = getBucketForAvg(catKey, system, colorVal);
            const color = getColorForBucket(catKey, bucket);
            const valText = hasDisplay
              ? (isSum ? fmtCurrencyK(displayVal) : (fmtNum2(displayVal) + (isPercent ? '%' : '')))
              : (isSum ? fmtCurrencyK(displayVal) : '—');
            return `<span class="aa-col-metric"><span title="${escapeHtml(label)} average: ${valText}" style="${swatchStyle} background:${color};"></span></span>`;
          };

          const baseMetricOrder = ['utilization', 'building'].filter((k) => selectedCategories.includes(k));
          const abbrevFciSystem = (sys) => {
            const s = (sys || '').toString();
            if (s.length <= 7) return s;
            return `${s.slice(0, 6)}…`;
          };
          const gridColParts = ['minmax(88px,1fr)'];
          baseMetricOrder.forEach(() => gridColParts.push('28px'));
          if (showFciOverall) gridColParts.push('28px');
          if (showFciSystemColumns) {
            selectedCompareSystems.forEach(() => gridColParts.push('28px'));
          }
          const gridCols = gridColParts.join(' ');
          const metricShortLabels = { utilization: 'Util', building: 'Bldg' };

          const buildSchoolGridHeaderHtml = () => {
            const cells = [`<span class="aa-th-school">School</span>`];
            baseMetricOrder.forEach((k) => {
              cells.push(
                `<span class="aa-th-metric" title="${escapeHtml(COMPARE_CATEGORY_DEFS[k]?.label || k)}">${metricShortLabels[k] || k}</span>`
              );
            });
            if (showFciOverall) {
              cells.push(`<span class="aa-th-metric" title="FCI (Overall)">FCI</span>`);
            }
            if (showFciSystemColumns) {
              selectedCompareSystems.forEach((sys) => {
                cells.push(
                  `<span class="aa-th-metric aa-th-fci-sys" title="FCI: ${escapeHtml(sys)}">${escapeHtml(abbrevFciSystem(sys))}</span>`
                );
              });
            }
            return `<div class="aa-school-grid aa-school-grid-header" style="grid-template-columns:${gridCols}">${cells.join('')}</div>`;
          };

          const buildAreaSummaryRowHtml = () => {
            const rowCells = [`<span class="aa-col-school">Average</span>`];
            baseMetricOrder.forEach((catKey) => {
              const def = avgKeys.find((k) => k.key === catKey);
              rowCells.push(def ? buildAreaAvgSwatchCell(def) : `<span class="aa-col-metric"></span>`);
            });
            if (showFciOverall) {
              const def = avgKeys.find((k) => k.key === 'fci_overall');
              rowCells.push(def ? buildAreaAvgSwatchCell(def) : `<span class="aa-col-metric"></span>`);
            }
            if (showFciSystemColumns) {
              selectedCompareSystems.forEach((sys) => {
                const def = avgKeys.find((k) => k.key === `fci_${sys}`);
                rowCells.push(def ? buildAreaAvgSwatchCell(def) : `<span class="aa-col-metric"></span>`);
              });
            }
            return `<div class="aa-school-grid aa-school-grid-row" style="grid-template-columns:${gridCols}">${rowCells.join('')}</div>`;
          };

          const getFciSystemStatusForSchool = (schoolId, systemName) => {
            const entry = schoolId ? fciBySchoolId.get(schoolId) : null;
            const p1Value = entry?.bySystem?.get(systemName)?.priorityAvgCostPerSf?.[1];
            const quartiles = computeFciQuartilesForSystem(systemName);
            return getFciStatusFromValue(p1Value, quartiles, false);
          };

          const getCategoryValueForSchool = (catKey, id, feature, schoolName) => {
            if (catKey === 'utilization') {
              const raw = feature?.properties?.['Utilization'];
              const util = normalizeUtilizationValue(raw ?? 0);
              return Number.isFinite(util) ? util * 100 : null;
            }
            if (catKey === 'building') {
              return feature?.properties?.__buildingScore ?? null;
            }
            if (catKey === 'fci') {
              const entry = id ? fciBySchoolId.get(id) : null;
              return entry?.overallFci ?? null;
            }
            return null;
          };

          const buildSchoolSwatchCell = (catKey, id, feature, schoolName) => {
            const bucket = getCompareBucketForSchool(catKey, id, feature);
            const color = getBucketColor(catKey, bucket);
            const value = getCategoryValueForSchool(catKey, id, feature, schoolName);
            const fmtLocal = (n) => (Number.isFinite(n) ? n.toFixed(2) : null);
            const valueText = (value == null)
              ? ''
              : (catKey === 'utilization'
                ? ` (value ${fmtLocal(value)}%)`
                : ` (value ${fmtLocal(value)})`);
            return `<span class="aa-col-metric"><span title="${escapeHtml(COMPARE_CATEGORY_DEFS[catKey]?.label || catKey)}: ${escapeHtml(bucket)}${valueText}" style="${swatchStyle} background:${color};"></span></span>`;
          };

          const buildLevelSummaryHtml = (level, schoolCount) => {
            if (schoolCount <= 1 || !avgKeys.length) return '';
            const rowCells = [
              `<span class="aa-col-school aa-level-avg-label">${escapeHtml(level)} average</span>`
            ];
            baseMetricOrder.forEach((catKey) => {
              const def = avgKeys.find((k) => k.key === catKey);
              rowCells.push(def ? buildLevelAvgSwatchCell(level, def) : `<span class="aa-col-metric"></span>`);
            });
            if (showFciOverall) {
              const def = avgKeys.find((k) => k.key === 'fci_overall');
              rowCells.push(def ? buildLevelAvgSwatchCell(level, def) : `<span class="aa-col-metric"></span>`);
            }
            if (showFciSystemColumns) {
              selectedCompareSystems.forEach((sys) => {
                const def = avgKeys.find((k) => k.key === `fci_${sys}`);
                rowCells.push(def ? buildLevelAvgSwatchCell(level, def) : `<span class="aa-col-metric"></span>`);
              });
            }
            return (
              `<div class="aa-school-grid aa-school-grid-row" style="grid-template-columns:${gridCols}">` +
              `${rowCells.join('')}` +
              `</div>`
            );
          };

          const maxPerGroup = 25;
          const groupHtml = groupKeys.map((k) => {
            const list = Array.isArray(groups[k]) ? groups[k] : [];
            const shown = list.slice(0, maxPerGroup);
            const more = list.length > maxPerGroup ? (list.length - maxPerGroup) : 0;
            const levelColor = getSchoolLevelColorHex(k);
            const levelSummaryHtml = buildLevelSummaryHtml(k, list.length);
            const schoolRows = shown.map((s) => {
              const id = resolveSchoolIdFromName(s);
              const feature = id ? getFeatureById(id) : null;
              const rowCells = [`<span class="aa-col-school">${escapeHtml(mainDisplaySchoolName(s))}</span>`];
              baseMetricOrder.forEach((catKey) => {
                rowCells.push(buildSchoolSwatchCell(catKey, id, feature, s));
              });
              if (showFciOverall) {
                const entry = id ? fciBySchoolId.get(id) : null;
                const overallStatus = entry ? getFciStatusFromValue(entry.overallFci, fciOverallQuartiles, true) : 'No Data';
                const overallColor = getFciStatusColorHex(overallStatus);
                const overallVal = Number.isFinite(entry?.overallFci) ? entry.overallFci.toFixed(2) : null;
                rowCells.push(
                  `<span class="aa-col-metric"><span title="FCI: ${escapeHtml(overallStatus)}${overallVal != null ? ` (value ${overallVal})` : ''}" style="${swatchStyle} background:${overallColor};"></span></span>`
                );
              }
              if (showFciSystemColumns) {
                selectedCompareSystems.forEach((sys) => {
                  const status = getFciSystemStatusForSchool(id, sys);
                  const color = getFciStatusColorHex(status);
                  const entry = id ? fciBySchoolId.get(id) : null;
                  const sysEntry = entry?.bySystem?.get(sys);
                  const pc = sysEntry?.priorityCosts || {};
                  const p1 = Number.isFinite(pc[1]) ? pc[1] : null;
                  const costText = fmtCurrencyK(p1);
                  rowCells.push(
                    `<span class="aa-col-metric"><span title="${escapeHtml(sys)}: ${escapeHtml(status)} (Priority 1 ${costText})" style="${swatchStyle} background:${color};"></span></span>`
                  );
                });
              }
              return (
                `<div class="aa-school-grid aa-school-grid-row" style="grid-template-columns:${gridCols}">${rowCells.join('')}</div>`
              );
            }).join('');
            const moreLine = more ? `<div style="margin:4px 0 0 0; color:#6b7280; font-size:12px;">+${more} more…</div>` : '';
            return (
              `<div class="aa-section-heading aa-section-heading--level">` +
                `<span class="aa-section-level-swatch" style="background:${levelColor};"></span>` +
                `${escapeHtml(k)} (${list.length})` +
              `</div>` +
              `${buildSchoolGridHeaderHtml()}` +
              `${schoolRows}` +
              `${moreLine}` +
              `${levelSummaryHtml}`
            );
          }).join('');

          const areaSummarySectionHtml = (total > 0 && avgKeys.length)
            ? (
              `<div class="aa-section-heading">${escapeHtml(areaName)} Area Summary</div>` +
              `${buildSchoolGridHeaderHtml()}` +
              `${buildAreaSummaryRowHtml()}`
            )
            : '';

          const bondEntry = getBondSpendingEntryByName(areaName);
          const bondLine = bondEntry
            ? `<div class="aa-popup-secondary">Historic bond spending: ${fmtCurrency(bondEntry.totalSpending)} (${bondEntry.pctOfTotal.toFixed(1)}% of total)</div>`
            : '';
          const growthLine =
            bondEntry && Number.isFinite(bondEntry.enrollmentGrowthPct)
              ? `<div class="aa-popup-secondary">Enrollment change (past 10 years): ${
                  bondEntry.enrollmentGrowthPct > 0 ? '+' : ''
                }${bondEntry.enrollmentGrowthPct.toFixed(0)}%</div>`
              : '';
          const schoolCountLabel = `${total} School${total === 1 ? '' : 's'}`;
          const fciDetailBtn = hasFciSystems
            ? (
              `<button type="button" class="aa-fci-detail-toggle-btn" aria-expanded="${fciDetailExpanded ? 'true' : 'false'}">` +
              `${fciDetailExpanded ? 'Hide FCI Detail' : 'Show FCI Detail'}` +
              `</button>`
            )
            : '';
          const emptyHtml = `<div style="color:#6b7280; font-size:12px;">No schools found for this area.</div>`;
          return (
            `<div class="aa-popup-top${hasFciSystems ? ' aa-popup-top--has-fci-toggle' : ''}">` +
            `${fciDetailBtn ? `<div class="aa-popup-corner-actions">${fciDetailBtn}</div>` : ''}` +
            `<div class="aa-popup-header-row aa-popup-drag">` +
              `<div class="aa-popup-title">${escapeHtml(areaName)} Area (${schoolCountLabel})</div>` +
            `</div>` +
            `${bondLine}` +
            `${growthLine}` +
            `</div>` +
            `<div class="aa-popup-body">` +
            `${groupKeys.length ? (areaSummarySectionHtml + groupHtml) : emptyHtml}` +
            `</div>`
          );
        };

        // Expose for refresh when compare selections change
        try { window.__aaBuildPopupHtml = buildPopupHtml; } catch {}
        try {
          window.__aaRefreshPopup = () => {
            try {
              if (!pinned || !window.__aaPopupAreaName) return;
              _aaRefreshingGuard(() => {
                popup.setHTML(buildPopupHtml(window.__aaPopupAreaName)).addTo(map);
                positionArticulationPopupTopRight();
              });
              try { refreshArticulationAreaSelectionOutline(); } catch (_) {}
              setTimeout(() => {
                try { enhanceArticulationPopupPanel(); } catch {}
                try { positionArticulationPopupTopRight(); } catch {}
              }, 0);
            } catch {}
          };
        } catch {}
        try {
          window.__aaRefreshPopupNow = (areaNameOverride) => {
            const areaName = areaNameOverride != null ? areaNameOverride : window.__aaPopupAreaName;
            if (!areaName) return;
            if (!pinned) return;
            _aaRefreshingGuard(() => {
              try {
                const root = popup.getElement ? popup.getElement() : null;
                const content = root && document.body.contains(root) ? root.querySelector('.mapboxgl-popup-content') : null;
                if (!content) {
                  popup.setHTML(buildPopupHtml(areaName)).addTo(map);
                } else {
                  content.innerHTML = buildPopupHtml(areaName);
                }
                positionArticulationPopupTopRight();
                setTimeout(() => {
                  try { enhanceArticulationPopupPanel(); } catch {}
                  try { positionArticulationPopupTopRight(); } catch {}
                  try { refreshArticulationAreaSelectionOutline(); } catch (_) {}
                }, 0);
              } catch {}
            });
          };
        } catch {}
        try { window.__aaPositionPopupTopRight = positionArticulationPopupTopRight; } catch {}
        try { window.__aaEnhancePopupPanel = enhanceArticulationPopupPanel; } catch {}

        const aaHoverPopup = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          maxWidth: '280px',
          className: 'aa-hover-popup',
          offset: 12
        });
        let aaHoveredAreaName = null;

        const ensureArticulationPopupPositionHandlers = () => {
          if (popup.__aaFixedPosBound) return;
          popup.__aaFixedPosBound = true;
          const onMove = () => positionArticulationPopupTopRight();
          popup.__aaFixedPosHandler = onMove;
          try {
            map.on('move', onMove);
            map.on('zoom', onMove);
            map.on('resize', onMove);
          } catch {}
          popup.on('close', () => {
            try {
              map.off('move', onMove);
              map.off('zoom', onMove);
              map.off('resize', onMove);
            } catch {}
            popup.__aaFixedPosBound = false;
          });
        };

        const openArticulationAreaPanel = (areaName) => {
          if (!areaName) return;
          const areaKey = normalizeArticulationAreaKey(areaName);
          const data = articulationSchoolsByArea && articulationSchoolsByArea.get(areaKey);
          const displayName = (data && data.areaName) ? data.areaName : areaName;
          const outlineName = resolveArticulationAreaOutlineName(displayName);
          try { aaHoverPopup.remove(); } catch (_) {}
          aaHoveredAreaName = null;
          pinned = true;
          window.__aaPopupAreaName = outlineName;
          try { window.__aaPopup = popup; } catch {}
          saveLastArticulationAreaSelection(areaKey);
          flyMapToArticulationArea(displayName);
          _aaRefreshingGuard(() => {
            popup.setHTML(buildPopupHtml(displayName)).addTo(map);
            positionArticulationPopupTopRight();
            ensureArticulationPopupPositionHandlers();
          });
          try { refreshArticulationAreaSelectionOutline(); } catch (_) {}
          try {
            map.once('moveend', () => {
              try { refreshArticulationAreaSelectionOutline(); } catch (_) {}
            });
          } catch (_) {}
          setTimeout(() => {
            try { enhanceArticulationPopupPanel(); } catch {}
            try { positionArticulationPopupTopRight(); } catch {}
            try { refreshArticulationAreaSelectionOutline(); } catch (_) {}
          }, 0);
        };
        try { window.__aaOpenAreaPanel = openArticulationAreaPanel; } catch {}

        const updateArticulationHoverTooltip = (e) => {
          try {
            const aaCb = document.getElementById('toggleArticulationAreas');
            if (!aaCb || !aaCb.checked || !map.getLayer('articulation-areas-fill')) {
              aaHoveredAreaName = null;
              try { aaHoverPopup.remove(); } catch (_) {}
              return;
            }
            const origTarget = e.originalEvent && e.originalEvent.target;
            if (origTarget && origTarget.closest && origTarget.closest('.mapboxgl-popup')) {
              return;
            }
            const schoolLayers = ['schools-layer', 'schools-pie-layer'].filter((id) => map.getLayer && map.getLayer(id));
            if (schoolLayers.length) {
              const schoolHits = map.queryRenderedFeatures(e.point, { layers: schoolLayers }) || [];
              if (schoolHits.length) {
                aaHoveredAreaName = null;
                try { aaHoverPopup.remove(); } catch (_) {}
                return;
              }
            }
            const hits = map.queryRenderedFeatures(e.point, { layers: ['articulation-areas-fill'] }) || [];
            const f = hits[0];
            const areaName = f && f.properties
              ? (f.properties.__aaName || f.properties['Articulation Area'] || '')
              : '';
            if (!areaName) {
              aaHoveredAreaName = null;
              try { aaHoverPopup.remove(); } catch (_) {}
              return;
            }
            map.getCanvas().style.cursor = 'pointer';
            if (aaHoveredAreaName === areaName) {
              try { aaHoverPopup.setLngLat(e.lngLat); } catch (_) {}
              return;
            }
            aaHoveredAreaName = areaName;
            try {
              aaHoverPopup.setLngLat(e.lngLat).setHTML(buildArticulationHoverTooltipHtml(areaName)).addTo(map);
            } catch (_) {}
          } catch (_) {}
        };

        if (!map.__aaHoverTooltipBound) {
          map.__aaHoverTooltipBound = true;
          map.on('mousemove', updateArticulationHoverTooltip);
          try {
            map.getCanvas().addEventListener('mouseleave', () => {
              aaHoveredAreaName = null;
              try { aaHoverPopup.remove(); } catch (_) {}
              try { map.getCanvas().style.cursor = ''; } catch (_) {}
            });
          } catch (_) {}
        }

        map.on('mouseenter', 'articulation-areas-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'articulation-areas-fill', () => {
          if (!aaHoveredAreaName) map.getCanvas().style.cursor = '';
        });

        map.on('click', 'articulation-areas-fill', (e) => {
          // If the user clicked directly on a school point, let school interaction win.
          try {
            const schoolLayers = ['schools-layer', 'schools-pie-layer'].filter((id) => map.getLayer && map.getLayer(id));
            if (schoolLayers.length) {
              const schoolHits = map.queryRenderedFeatures(e.point, { layers: schoolLayers }) || [];
              if (schoolHits.length) return;
            }
          } catch {}

          const f = e.features && e.features[0] ? e.features[0] : null;
          const areaName = f && f.properties ? (f.properties.__aaName || f.properties['Articulation Area'] || '') : '';
          if (!areaName) return;
          openArticulationAreaPanel(areaName);
        });

        // Refresh popup when compare selections change
        window.addEventListener('aaPopupRefresh', () => {
          try {
            if (window.__aaRefreshPopupNow) window.__aaRefreshPopupNow();
            else if (pinned && window.__aaRefreshPopup) window.__aaRefreshPopup();
          } catch {}
        });

        // Allow click-away to dismiss (X button also works), but not when clicking filter panel / compare controls
        map.on('click', (e) => {
          if (!pinned) return;
          const target = e.originalEvent && e.originalEvent.target;
          if (target && (target.closest('#filter-panel') || target.closest('#articulationAreasSection') || target.closest('.map-school-select-panel'))) return;
          let hits = [];
          try {
            hits = map.queryRenderedFeatures(e.point, { layers: ['articulation-areas-fill'] }) || [];
          } catch {
            hits = [];
          }
          if (!hits.length) {
            popup.remove();
            pinned = false;
            try { window.__aaPopupAreaName = null; } catch (_) {}
            try { refreshArticulationAreaSelectionOutline(); } catch (_) {}
          }
        });
      } catch (e) {
        console.warn('Articulation areas setup failed', e);
      }

      // Apply initial filters so non‑eval/closed are hidden until toggled on
      try {
        updateLayer();
      } catch (initialFilterErr) {
        console.warn("⚠️ Initial filter failed:", initialFilterErr);
      }

        // Ensure dropdowns start empty (no default selection) and stay empty until user picks
        setTimeout(() => {
          clearAllSchoolSelections();
          clearFlowchartSelection();
          enforceFlowchartEmptyUntilUser();
          const flowSelect = document.getElementById('mainFlowchartSchoolSelect');
          if (flowSelect) {
            flowSelect.addEventListener('change', () => {
              flowchartUserSelected = !!flowSelect.value;
            });
            const mo = new MutationObserver(() => {
              enforceFlowchartEmptyUntilUser();
            });
            mo.observe(flowSelect, { childList: true, subtree: false });
          }
        }, 0);

      // Fit map to the extent of the loaded GeoJSON
      if (geojsonData.features && geojsonData.features.length > 0) {
        const coordinates = geojsonData.features
          .filter(f => f.geometry && f.geometry.coordinates) // Only features with valid geometry
          .map(f => f.geometry.coordinates);
        console.log("🔍 Found coordinates:", coordinates.length);
        if (coordinates.length > 0) {
          const lats = coordinates.map(c => c[1]);
          const lngs = coordinates.map(c => c[0]);
          const bounds = [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)]
          ];
          console.log("🗺️ Calculated bounds:", bounds);
          if (typeof window.scheduleFitMapToAllSchools === 'function') {
            window.scheduleFitMapToAllSchools(0);
          }
        }
      }

      // Automatically fit to all schools once GeoJSON is ready (WebView2 may need retries).
      window.__mapSchoolFitPending = true;
      window.__mapSchoolFitVerified = false;
      try {
        window.scheduleFitMapToAllSchools(100);
        window.scheduleFitMapToAllSchools(600);
        window.scheduleFitMapToAllSchools(1500);
        if (!window.__mapSchoolFitListenersAdded) {
          window.__mapSchoolFitListenersAdded = true;
          window.addEventListener('load', () => window.scheduleFitMapToAllSchools(250));
          window.addEventListener('resize', () => {
            if (window.__mapSchoolFitPending || mapNeedsSchoolExtentFit(window.map)) {
              window.scheduleFitMapToAllSchools(100);
            }
          });
        }
      } catch (e) {
        console.warn("⚠️ Automatic initial fitMapToAllSchools failed:", e);
      }

      // Add a source and layer for the selected school's "halo" highlight
      map.addSource('selected-school', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Add the highlight layer first, so it's drawn underneath the school dots
      map.addLayer({
        id: 'selected-school-highlight',
        type: 'circle',
        source: 'selected-school',
        paint: {
          // Slightly larger, soft, glowing halo under the selected school
          'circle-radius': 14,
          'circle-color': '#007cbf',
          'circle-opacity': 0.35,
          'circle-blur': 0.4
        }
      });

      // Add a focused center dot on top of the halo so the selected school stays visible
      map.addLayer({
        id: 'selected-school-center',
        type: 'circle',
        source: 'selected-school',
        paint: {
          'circle-radius': 6,
          'circle-color': [
            'match',
            ['get', 'Decision Type'],
            "Building Addition", '#1D4ED8',
            "Policy Solution for Overcrowding", '#3B82F6',
            "Building Addition with Capital Investment", '#1E3A8A',
            "Building Replacement", '#5B21B6',
            "Targeted Capital Investment", '#FBBF24',
            "Standard Maintenance", '#9c5326',
            "Major Capital Investment", '#F97316',
            "Welcoming School", '#62d48c',
            "Welcoming School with Capital Investment", '#7a9a72',
            "Welcoming School with Building Replacement", '#0c4d24',
            "Closure (Goes to Welcoming School)", '#fa5b5b',
            "Other / Unknown", '#2F4F4F',
            '#7f8c8d'
          ],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff'
        }
      });

      // Add the main schools layer on top of the halo
      map.addLayer({
        id: 'schools-layer',
        type: 'circle',
        source: 'schools',
        paint: {
          'circle-radius': 6,
          'circle-color': [
            'match',
            ['get', 'Decision Type'],
            "Building Addition", '#1D4ED8',
            "Policy Solution for Overcrowding", '#3B82F6',
            "Building Addition with Capital Investment", '#1E3A8A',
            "Building Replacement", '#5B21B6',
            "Targeted Capital Investment", '#FBBF24',
            "Standard Maintenance", '#9c5326',
            "Major Capital Investment", '#F97316',
            "Welcoming School", '#62d48c',
            "Welcoming School with Capital Investment", '#7a9a72',
            "Welcoming School with Building Replacement", '#0c4d24',
            "Closure (Goes to Welcoming School)", '#fa5b5b',
            "Other / Unknown", '#2F4F4F',
            '#7f8c8d'
          ]
        }
      });

      // Symbol layer for utilization pie images (initially hidden)
      map.addLayer({
        id: 'schools-pie-layer',
        type: 'symbol',
        source: 'schools',
        layout: {
          'visibility': 'none',
          'icon-image': ['coalesce', ['get', 'utilPieImage'], 'util-pie-0.0'],
          'icon-size': 0.8,
          'icon-allow-overlap': true
        }
      });

      // Closed-school red slash overlay (shown only when "Include closed schools" is enabled)
      map.addLayer({
        id: 'closed-stripe-layer',
        type: 'symbol',
        source: 'schools',
        layout: {
          'visibility': includeClosedSchools ? 'visible' : 'none',
          'text-field': '/',
          'text-size': 22,
          'text-rotate': 45,
          'text-allow-overlap': true,
          'text-ignore-placement': true
        },
        paint: {
          'text-color': '#d32f2f',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.3
        },
        filter: ['==', ['get', 'isClosed'], true]
      });
      
      // Now that the schools layers exist, reapply filters + sizing so
      // "Show Size by Capacity" works immediately on first load.
      try { updateLayer(); } catch (e) { console.warn("⚠️ updateLayer after schools-layer add failed:", e); }

      updateLegend();

      // Setup other map features that depend on the 'schools' source
      // School details: show on hover (not on click).
      const schoolHoverPopup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false
      });

      map.on('mouseenter', 'schools-layer', () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', 'schools-layer', () => {
        map.getCanvas().style.cursor = '';
      });

      const normLower = (s) => (s || "").toString().toLowerCase().trim();

      function resolveCanonicalSchoolFromFeature(feature) {
        const schoolNameRaw = feature?.properties?.['Building Name'];
        const uniqueIdFromFeature = (feature?.properties?.['UniqueID'] || "").toString().trim();
        let schoolName = schoolNameRaw;
        let originRow = null;

        // Prefer DecisionLogic name normalization so it matches dropdowns.
        if (window.decisionLogic && Array.isArray(window.decisionLogic.schoolData)) {
          originRow = window.decisionLogic.schoolData.find(r => normLower(r["Building Name"]) === normLower(schoolNameRaw));
          if (!originRow && uniqueIdFromFeature) {
            originRow = window.decisionLogic.schoolData.find(r => {
              const uid = (r.UniqueID || r["UniqueID"] || r["Unique Id"] || "").toString().trim();
              return uid === uniqueIdFromFeature;
            });
          }
          if (originRow && originRow["Building Name"]) schoolName = originRow["Building Name"];
        }

        // Determine best UniqueID for distance/highlight logic
        let originUniqueId = "";
        if (originRow) {
          originUniqueId = (
            originRow.UniqueID ||
            originRow["UniqueID"] ||
            originRow["Unique Id"] ||
            ""
          ).toString().trim();
        }
        if (!originUniqueId && uniqueIdFromFeature) originUniqueId = uniqueIdFromFeature;

        return { schoolName, originRow, originUniqueId, uniqueIdFromFeature };
      }

      function lookupDistanceMiles(originId, destId, destName) {
        const originKey = normLower(originId);
        const destKey = normLower(destId);
        const destinationName = destName || destId || '';
        let distMiles = null;
        try {
          if (originKey && destKey && originKey === destKey) {
            distMiles = 0;
          } else if (originKey && window.schoolDistancesByOrigin && Array.isArray(window.schoolDistancesByOrigin[originKey])) {
            const rows = window.schoolDistancesByOrigin[originKey];
            const match =
              rows.find(r => normLower(r.destId) === destKey) ||
              rows.find(r => normLower(r.destName) === normLower(destinationName));
            if (match && match.distanceMiles !== null && match.distanceMiles !== undefined && match.distanceMiles !== '') {
              const v = parseFloat(match.distanceMiles);
              if (isFinite(v)) distMiles = v;
            }
          }
          // Fallback reverse direction
          if (distMiles === null && destKey && window.schoolDistancesByOrigin && Array.isArray(window.schoolDistancesByOrigin[destKey])) {
            const rowsRev = window.schoolDistancesByOrigin[destKey];
            const matchRev = rowsRev.find(r => normLower(r.destId) === originKey);
            if (matchRev && matchRev.distanceMiles !== null && matchRev.distanceMiles !== undefined && matchRev.distanceMiles !== '') {
              const v = parseFloat(matchRev.distanceMiles);
              if (isFinite(v)) distMiles = v;
            }
          }
        } catch {}
        return (distMiles === null || distMiles === undefined || !isFinite(distMiles)) ? null : distMiles;
      }

      function buildSchoolPopupHtml(feature, schoolName, originUniqueId) {
        const sparseTooltip = shouldUseSparseSchoolTooltip(feature);
        const capacity = feature?.properties?.['Capacity'];
        const utilization = feature?.properties?.['Utilization'];
        const capSourceLabel = feature?.properties?.['_CapacitySourceLabel'] || (window.getCapacitySourceLabel ? window.getCapacitySourceLabel() : 'Capacity');
        const eduCapMissing = String(feature?.properties?.['_EducationalCapacityMissing'] || '') === '1';
        const eduCapNote = feature?.properties?.['_EducationalCapacityNote'];
        const fmtCurrencyK = (n) => {
          if (!Number.isFinite(n)) return '—';
          const k = Math.round(n / 1000);
          const withCommas = k.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          return `$${withCommas}k`;
        };
        const parseCapNum = (v) => {
          const n = parseFloat(String(v ?? '').replace(/,/g, '').trim());
          return Number.isFinite(n) ? n : null;
        };
        const fmtCapacityDisplay = (n, isEducational) => {
          if (!Number.isFinite(n)) return null;
          return isEducational
            ? Math.round(n).toLocaleString('en-US')
            : n.toLocaleString('en-US');
        };

        let html = `<strong>${mainDisplaySchoolName(schoolName)}</strong>`;

        const enrYear = window.yearLabels?.enrollmentYear ?? window.dashboardYearLabels?.enrollmentYear ?? '';
        const enrYearParen = enrYear ? ` (${enrYear})` : '';
        const enrLabel = window.yearLabels?.enrollmentCard?.() ?? 'Enrollment';

        const totalEnr = parseFloat(feature?.properties?.['_TotalEnrollment']);
        const pkEnr = parseFloat(feature?.properties?.['_PKEnrollment']);
        const showEnrollment = !sparseTooltip
          || (Number.isFinite(totalEnr) && totalEnr > 0)
          || (Number.isFinite(pkEnr) && pkEnr > 0);
        if (showEnrollment && (Number.isFinite(totalEnr) || Number.isFinite(pkEnr))) {
          const fmtN = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString() : '—');
          if (Number.isFinite(pkEnr) && pkEnr > 0 && Number.isFinite(totalEnr)) {
            const nonPK = Math.max(0, totalEnr - pkEnr);
            html += `<br><span>Enrollment, excl. PK${enrYearParen}: ${fmtN(nonPK)}</span>`;
            html += `<br><span>PK enrollment${enrYearParen}: ${fmtN(pkEnr)}</span>`;
            html += `<br><span>Total enrollment${enrYearParen}: ${fmtN(totalEnr)}</span>`;
          } else if (Number.isFinite(totalEnr) && totalEnr > 0) {
            html += `<br><span>${enrLabel}: ${fmtN(totalEnr)}</span>`;
          } else if (!sparseTooltip && Number.isFinite(totalEnr)) {
            html += `<br><span>${enrLabel}: ${fmtN(totalEnr)}</span>`;
          }
        }

        const capNum = parseCapNum(capacity);
        const showCapacity = !sparseTooltip
          ? (capacity !== undefined && capacity !== null && capacity !== '')
          : hasPositiveNumeric(capNum);
        if (showCapacity) {
          const isEducationalCap =
            capSourceLabel === 'Educational Capacity' ||
            String(feature?.properties?.['_CapacitySource'] || '') === 'educational';
          const capText = fmtCapacityDisplay(capNum, isEducationalCap);
          html += `<br><span>${capSourceLabel}: ${capText ?? capacity}</span>`;
        } else if (!sparseTooltip && eduCapMissing) {
          html += `<br><span>${eduCapNote || 'Educational capacity does not exist.'}</span>`;
        }

        const utilNum = parseFloat(utilization);
        const utilNorm = Number.isFinite(utilNum)
          ? normalizeUtilizationValue(utilNum <= 1.5 ? utilNum : utilNum / 100)
          : null;
        const showUtilization = !sparseTooltip
          ? (utilization !== undefined && utilization !== null && utilization !== '')
          : (utilNorm !== null && utilNorm > 0);
        if (showUtilization) {
          if (Number.isFinite(utilNum)) {
            const pct = utilNum <= 1.5 ? utilNum * 100 : utilNum;
            html += `<br><span>Utilization: ${pct.toFixed(0)}%</span>`;
          } else if (!sparseTooltip) {
            html += `<br><span>Utilization: ${utilization}</span>`;
          }
        } else if (!sparseTooltip && eduCapMissing) {
          html += `<br><span>Utilization: Educational capacity does not exist.</span>`;
        }

        // Show the selected "Color by" value
        try {
          const mode =
            (window.__mapColorByMode === 'building') ? 'building'
            : ((window.__mapColorByMode === 'fci') ? 'fci'
              : ((window.__mapColorByMode === 'utilization') ? 'utilization'
                : ((window.__mapColorByMode === 'level') ? 'level' : 'decision')));
          const buildingCond = feature?.properties?.__buildingCondition || 'No Data';
          const buildingScore = feature?.properties?.__buildingScore;
          const buildingScoreNum = Number.isFinite(buildingScore) ? buildingScore.toFixed(3) : '—';
          const showBuildingScore = !sparseTooltip
            || (Number.isFinite(buildingScore) && buildingScore > 0);

          if (mode === 'decision') {
            const decision = feature?.properties?.['Decision Type'] || feature?.properties?.['decision'] || 'Unknown';
            if (!sparseTooltip || !isUnknownDisplayValue(decision)) {
              html += `<br><span>Decision: ${decision}</span>`;
            }
          } else if (mode === 'level') {
            const lvl = feature?.properties?.__schoolLevelNorm || normalizeSchoolLevel(feature?.properties?.['School Level']) || 'Unknown';
            if (!sparseTooltip || !isUnknownDisplayValue(lvl)) {
              html += `<br><span>School Level: ${lvl}</span>`;
            }
          } else if (mode === 'building') {
            if (showBuildingScore) {
              html += `<br><span>Composite Building Score: ${buildingCond} (${buildingScoreNum})</span>`;
            }
          } else if (mode === 'utilization') {
            if (showUtilization && utilNorm !== null) {
              const { low, high } = getUtilizationThresholds();
              const band = (utilNorm < low) ? 'Too low' : (utilNorm > high) ? 'Too high' : 'In range';
              html += `<br><span>Utilization Band: ${band}</span>`;
            }
          } else if (mode === 'fci') {
            const schoolId = normalizeId(feature?.properties?.['UniqueID']);
            const entry = schoolId ? fciBySchoolId.get(schoolId) : null;
            if (!sparseTooltip || hasMeaningfulFciForSparseSchoolTooltip(feature, entry)) {
              const status = feature?.properties?.__fciStatus || 'No Data';
              if (fciSelectedSystem) {
                const sysEntry = entry?.bySystem?.get(fciSelectedSystem);
                const p1Cost = sysEntry?.priorityCosts?.[1];
                html += `<br><span>${fciSelectedSystem}: ${status} (Priority 1 ${fmtCurrencyK(p1Cost)})</span>`;
              } else {
                const val = feature?.properties?.__fciOverall;
                const num = Number.isFinite(val) ? val.toFixed(3) : '—';
                html += `<br><span>FCI: ${status} (${num})</span>`;
              }
            }
          }

          // Always include building score (even when not the active color mode).
          if (mode !== 'building' && showBuildingScore) {
            html += `<br><span>Composite Building Score: ${buildingCond} (${buildingScoreNum})</span>`;
          }
        } catch {}

        // If an origin is selected, include distance in the hover popup.
        const originId = (window.currentOriginId || '').toString().trim() || getOriginIdForName(window.currentOriginName);
        const originName = window.currentOriginName || 'selected school';
        const originDisplayName = mainDisplaySchoolName(originName);
        if (originId && originUniqueId) {
          const miles = lookupDistanceMiles(originId, originUniqueId, schoolName);
          if (miles !== null) {
            html += `<br><span>Distance to ${originDisplayName}: ${miles.toFixed(1)} mi</span>`;
          }
        }

        return html;
      }

      // Hover handlers (both circle + utilization pie layers)
      const handleSchoolHover = (e) => {
        const feature = e.features && e.features[0];
        if (!feature) return;
        const coordinates = feature.geometry.coordinates.slice();
        const { schoolName, originUniqueId } = resolveCanonicalSchoolFromFeature(feature);
        const html = buildSchoolPopupHtml(feature, schoolName, originUniqueId);
        schoolHoverPopup.setLngLat(coordinates).setHTML(html).addTo(map);
      };

      const clearSchoolHoverPopup = () => {
        try { schoolHoverPopup.remove(); } catch {}
      };

      map.on('mousemove', 'schools-layer', handleSchoolHover);
      map.on('mouseleave', 'schools-layer', clearSchoolHoverPopup);
      map.on('mousemove', 'schools-pie-layer', handleSchoolHover);
      map.on('mouseleave', 'schools-pie-layer', clearSchoolHoverPopup);

      // Support clicks on both circle and pie layers for selection logic,
      // but do NOT show a school info popup (hover handles that).
      const handleSchoolClick = (e) => {
        const feature = e.features && e.features[0];
        if (!feature) return;

        const coordinates = feature.geometry.coordinates.slice();
        const { schoolName, originUniqueId, uniqueIdFromFeature } = resolveCanonicalSchoolFromFeature(feature);

        const hasOrigin = (window.currentOriginId && window.currentOriginId.trim()) ||
                          (window.currentOriginName && window.currentOriginName.trim());
        const destName = schoolName;
        const destId = originUniqueId || getOriginIdForName(destName) || "";

        // If an origin is already selected, treat map clicks as destination lookups only (do not change origin).
        // NOTE: do not show a click-popup (hover handles school info).
        if (hasOrigin) {
          return;
        }

        // No origin selected yet: first map click sets the origin, but avoid changing other dropdowns
        if (schoolName) {
          window.currentSelectedSchoolName = schoolName;
          window.currentOriginId = originUniqueId;
          window.currentOriginName = schoolName;
          setNearbySchoolsSectionVisibility(originUniqueId || getOriginIdForName(schoolName), schoolName);
          if (originUniqueId) {
            localStorage.setItem('mapSelectedOriginId', originUniqueId);
            localStorage.setItem('mapSelectedOriginName', schoolName);
          }
          if (typeof window.updateFlowForSchool === 'function') {
            window.updateFlowForSchool(schoolName, window.thresholds || {});
          }
          if (typeof window.showOnMapFromFlowchart === 'function') {
            window.showOnMapFromFlowchart(schoolName);
          }
        }

        // Remember current origin for distance calculations and destination
        // highlighting.
        if (originUniqueId) {
          window.currentOriginName = schoolName;
          window.currentOriginId = originUniqueId;
        }

        refreshNearbySchoolMatchesUi(originUniqueId || getOriginIdForName(schoolName), schoolName);

        // Drive the flowchart path directly from the map click so that the
        // correct flow is highlighted even if the dropdown change handler does
        // not fire.
        if (typeof window.updateFlowForSchool === 'function' && schoolName) {
          const thresholdsForFlow =
            window.thresholds ||
            (window.decisionLogic && window.decisionLogic.thresholds) ||
            {};
          console.log("🎯 Calling updateFlowForSchool from map click for:", schoolName);
          window.updateFlowForSchool(schoolName, thresholdsForFlow);
        }
      };

      map.on('click', 'schools-layer', handleSchoolClick);
      map.on('click', 'schools-pie-layer', handleSchoolClick);

      map.on('mouseenter', 'schools-pie-layer', () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', 'schools-pie-layer', () => {
        map.getCanvas().style.cursor = '';
      });

      // Define helper so dropdowns and the flowchart "Show on map" button can
      // highlight the selected origin school and zoom the map to it.
      window.showOnMapFromFlowchart = function(originName, opts = {}) {
        const forceSwitch = !!opts.forceSwitch;
        if (!originName) {
          console.warn("⚠️ showOnMapFromFlowchart called with empty originName");
          return;
        }

        // Style changes wipe sources/layers; ensure they're recreated before we try to highlight.
        try {
          ensureBaseSourcesLayers();
        } catch (e) {
          console.warn("⚠️ Unable to ensure base sources/layers before showOnMapFromFlowchart:", e);
        }

        if (!window.map || !window.geojsonData || !Array.isArray(window.geojsonData.features)) {
          console.warn("⚠️ Map or geojsonData not ready for showOnMapFromFlowchart");
          return;
        }

        const norm = (s) => (s || "").toString().toLowerCase().trim();
        const features = window.geojsonData.features;

        // Try exact name match first
        let originFeature = features.find(
          f => norm(f.properties["Building Name"]) === norm(originName)
        );
        // If not found, try a more flexible match (contains / contained in)
        if (!originFeature) {
          originFeature =
            features.find(f => norm(f.properties["Building Name"]).includes(norm(originName))) ||
            features.find(f => norm(originName).includes(norm(f.properties["Building Name"])));
        }

        if (!originFeature) {
          console.warn("⚠️ Origin school not found on map:", originName);
          return;
        }

        // Derive a robust originId, preferring decisionLogic data but
        // falling back to the GeoJSON feature if needed.
        let originId = "";
        const originRow = window.decisionLogic && window.decisionLogic.schoolData
          ? window.decisionLogic.schoolData.find(r => r["Building Name"] === originName)
          : null;
        if (originRow) {
          originId = (
            originRow.UniqueID ||
            originRow["UniqueID"] ||
            originRow["Unique Id"] ||
            ""
          ).toString().trim();
        }
        if (!originId && originFeature && originFeature.properties) {
          originId = (
            originFeature.properties.UniqueID ||
            originFeature.properties["UniqueID"] ||
            originFeature.properties["Unique Id"] ||
            ""
          ).toString().trim();
        }

        // Remember current origin for distance calculations and click popups
        window.currentOriginName = originName;
        window.currentOriginId = originId;

        // Sync the map dropdown and persist selection so the UI reflects the zoom target.
        try {
          const mapSelect = document.getElementById('mapOriginSchoolSelect');
          const targetId = originId || originName;
          if (mapSelect && targetId) {
            const prevValue = mapSelect.value;
            setMapOriginSelect(targetId, originName);
            localStorage.setItem('mapSelectedOriginId', targetId);
            localStorage.setItem('mapSelectedOriginName', originName);
            if (mapSelect.value !== prevValue) {
              const evt = new Event('change', { bubbles: true });
              mapSelect.dispatchEvent(evt);
            }
          }
        } catch (e) {
          console.warn("⚠️ Unable to sync/persist mapOriginSchoolSelect from showOnMapFromFlowchart:", e);
        }

        // Switch to the map view so the user can actually see the highlight (only when explicitly requested)
        if (forceSwitch && typeof window.switchToMap === 'function') {
          window.switchToMap();
        }

        // Update the selected-school highlight with just this origin point
        const highlightSource = window.map.getSource('selected-school');
        if (highlightSource) {
          highlightSource.setData({
            type: 'FeatureCollection',
            features: [originFeature]
          });
        } else {
          console.warn("⚠️ selected-school source not found on map");
        }

        // Zoom to the origin school
        if (originFeature.geometry && originFeature.geometry.coordinates) {
          const [lng, lat] = originFeature.geometry.coordinates;
          window.map.easeTo({ center: [lng, lat], zoom: 13, duration: 800 });
        }
      };

    })
    .catch(error => {
      console.error("❌ Failed to load initial map data:", error);
    });

  // --- MAP FILTERS INITIALIZATION ---
  const minEnrollRange = document.getElementById('minEnrollRange');
  const maxEnrollRange = document.getElementById('maxEnrollRange');
  const minSeatsRange = document.getElementById('minSeatsRange');
  const maxSeatsRange = document.getElementById('maxSeatsRange');
  const minEnrollDisplay = document.getElementById('minEnrollDisplay');
  const maxEnrollDisplay = document.getElementById('maxEnrollDisplay');
  const minSeatsDisplay = document.getElementById('minSeatsDisplay');
  const maxSeatsDisplay = document.getElementById('maxSeatsDisplay');
  let enrollmentRangeControl = null;
  let seatsRangeControl = null;
  const toggleShowSizeByCapacity = document.getElementById('toggleShowSizeByCapacity');
  const toggleUtilizationPie = document.getElementById('toggleUtilizationPie');
  const schoolTypeFilter = document.getElementById('schoolTypeFilter');
  const schoolTypeDropdownToggle = document.getElementById('schoolTypeDropdownToggle');
  const schoolTypeDropdownMenu = document.getElementById('schoolTypeDropdownMenu');
  const resetShowHideSchoolsBtn = document.getElementById('resetShowHideSchoolsBtn');
  const colorByDecisionBtn = document.getElementById('colorByDecisionBtn');
  const colorByLevelBtn = document.getElementById('colorByLevelBtn');
  const colorByUtilBtn = document.getElementById('colorByUtilBtn');
  const colorByFciBtn = document.getElementById('colorByFciBtn');
  const colorByBuildingBtn = document.getElementById('colorByBuildingBtn');
  const fciSystemSelect = document.getElementById('fciSystemSelect');
  const fciSystemSymbologyRow = document.getElementById('fciSystemSymbologyRow');
  const compareFciSystemSelect = document.getElementById('compareFciSystemSelect');
  const compareCategoryList = document.getElementById('compareCategoryList');
  const compareFciSystemList = document.getElementById('compareFciSystemList');
  let enrollmentRangeSynced = false;
  let utilSpritesAdded = false;
  // Disable restoring prior selections to avoid auto-selecting a school on load
  const savedOriginId = '';
  const savedOriginName = '';
  const defaultFilterPosition = { top: '20px', right: '20px' };
  let mapSelectSyncing = false;
  // Landing page default: color by school level
  let mapColorByMode = 'level'; // 'decision' | 'level' | 'utilization' | 'fci' | 'building'
  // Expose so global helpers (legend/updateLayer) can read it safely.
  window.__mapColorByMode = mapColorByMode;

  function getDecisionColorExpression() {
    const expr = ['match', ['get', 'Decision Type']];
    // Preserve insertion order of DECISION_COLORS
    Object.keys(DECISION_COLORS).forEach((k) => {
      expr.push(k, DECISION_COLORS[k]);
    });
    expr.push('#7f8c8d');
    return expr;
  }

  function getSchoolLevelColorExpression() {
    const expr = ['match', ['get', '__schoolLevelNorm']];
    Object.keys(SCHOOL_LEVEL_COLORS).forEach((k) => {
      expr.push(k, SCHOOL_LEVEL_COLORS[k]);
    });
    expr.push('#94a3b8');
    return expr;
  }

  function getUtilizationPhaseColorExpression() {
    const { low, high } = getUtilizationThresholds();
    // Blue: too low (below low threshold)
    // Red: too high (above high threshold)
    // Green: in between
    return [
      'case',
      ['<', ['coalesce', ['get', 'Utilization'], 0], low], UTILIZATION_PHASE_COLORS.low,
      ['>', ['coalesce', ['get', 'Utilization'], 0], high], UTILIZATION_PHASE_COLORS.high,
      UTILIZATION_PHASE_COLORS.mid
    ];
  }

  function getFciStatusColorExpression() {
    return [
      'match',
      ['get', '__fciStatus'],
      'Excellent', FCI_STATUS_COLORS.excellent,
      'Good', FCI_STATUS_COLORS.good,
      'Fair', FCI_STATUS_COLORS.fair,
      'Poor', FCI_STATUS_COLORS.poor,
      'Deficient', FCI_STATUS_COLORS.deficient,
      'No Data', FCI_STATUS_COLORS.nodata,
      FCI_STATUS_COLORS.nodata
    ];
  }

  function getBuildingConditionColorExpression() {
    return [
      'match',
      ['get', '__buildingCondition'],
      'Poor', BUILDING_CONDITION_COLORS.poor,
      'Fair', BUILDING_CONDITION_COLORS.fair,
      'Good', BUILDING_CONDITION_COLORS.good,
      'Excellent', BUILDING_CONDITION_COLORS.excellent,
      'No Data', BUILDING_CONDITION_COLORS.nodata,
      BUILDING_CONDITION_COLORS.nodata
    ];
  }

  function applyMapColorByMode() {
    try {
      if (!window.map || !window.map.getLayer || !window.map.getLayer('schools-layer')) return;
      const mapRef = window.map;
      const mode = (window.__mapColorByMode === 'building')
        ? 'building'
        : ((window.__mapColorByMode === 'fci')
          ? 'fci'
          : ((window.__mapColorByMode === 'utilization')
            ? 'utilization'
            : ((window.__mapColorByMode === 'level') ? 'level' : 'decision')));
      const expr =
        (mode === 'building') ? getBuildingConditionColorExpression()
        : (mode === 'fci') ? getFciStatusColorExpression()
        : (mode === 'utilization') ? getUtilizationPhaseColorExpression()
        : (mode === 'level') ? getSchoolLevelColorExpression()
        : getDecisionColorExpression();
      mapRef.setPaintProperty('schools-layer', 'circle-color', expr);
      // Keep halo/assigned layers as-is
    } catch (e) {
      console.warn("⚠️ Unable to apply map color mode:", e);
    }
  }
  // Make globally accessible (updateLayer / assignment code paths).
  window.applyMapColorByMode = applyMapColorByMode;

  // Generate and register pie icon sprites for utilization buckets
  function ensureUtilizationPieSprites() {
    const mapRef = window.map;
    if (!mapRef) return;
    // Styles wipes all custom images. If the flag is set but the images are gone,
    // allow re-registering.
    try {
      const baseOk = mapRef.hasImage && mapRef.hasImage('util-pie-0.0');
      const sentinelKey = `util-pie-0.0-${getDecisionColorKey("Building Addition")}`;
      const sentinelOk = mapRef.hasImage && mapRef.hasImage(sentinelKey);
      const sentinelLevelKey = `util-pie-0.0-${getSchoolLevelColorKey("Elementary")}`;
      const sentinelLevelOk = mapRef.hasImage && mapRef.hasImage(sentinelLevelKey);
      if (utilSpritesAdded && baseOk && sentinelOk && sentinelLevelOk) {
        return;
      }
    } catch {}
    utilSpritesAdded = false;
    const buckets = [];
    for (let i = 0; i <= 10; i++) { // 0.0 to 1.0 in 0.1 increments
      buckets.push((i / 10).toFixed(1));
    }

    // Include both decision colors and school-level colors so pie icons can
    // follow either "Color by" mode.
    const colorHexes = Array.from(
      new Set(
        Object.values(DECISION_COLORS)
          .concat(Object.values(SCHOOL_LEVEL_COLORS))
          .concat(Object.values(UTILIZATION_PHASE_COLORS))
          .concat(Object.values(FCI_STATUS_COLORS))
          .concat(Object.values(BUILDING_CONDITION_COLORS))
          .concat(["#7f8c8d", "#94a3b8"])
      )
    );
    const colorKeys = colorHexes.map(h => h.replace("#", "").toLowerCase());

    const drawPie = (ctx, utilValue, fillColor) => {
      const size = 40;
      const cx = size / 2;
      const cy = size / 2;
      const r = size / 2 - 2;
      ctx.clearRect(0, 0, size, size);
      // Background ring
      ctx.fillStyle = '#e0e0e0';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fill();

      // Foreground arc proportional to utilization.
      // We treat 1.0 as 100% (full pie). Values > 1.0 (over-capacity) are clamped to full.
      const util = Number.isFinite(utilValue) ? utilValue : 0;
      const frac = Math.max(0, Math.min(util / 1.0, 1)); // clamp to [0,1]
      const endAngle = -Math.PI / 2 + frac * Math.PI * 2; // start at top
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, -Math.PI / 2, endAngle, false);
      ctx.closePath();
      ctx.fill();

      // White border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    };

    buckets.forEach(bucket => {
      const util = parseFloat(bucket);
      // Legacy neutral name (kept for fallback)
      {
        const legacyName = `util-pie-${bucket}`;
        if (!(mapRef.hasImage && mapRef.hasImage(legacyName))) {
          const canvas = document.createElement('canvas');
          canvas.width = 40;
          canvas.height = 40;
          const ctx = canvas.getContext('2d');
          drawPie(ctx, util, '#7f8c8d');
          const imageData = ctx.getImageData(0, 0, 40, 40);
          if (mapRef.addImage) {
            mapRef.addImage(legacyName, imageData, { pixelRatio: 2 });
          }
        }
      }

      // Colored names by decision outcome (preferred)
      colorKeys.forEach(colorKey => {
        const name = `util-pie-${bucket}-${colorKey}`;
        if (mapRef.hasImage && mapRef.hasImage(name)) return;
        const canvas = document.createElement('canvas');
        canvas.width = 40;
        canvas.height = 40;
        const ctx = canvas.getContext('2d');
        drawPie(ctx, util, `#${colorKey}`);
        const imageData = ctx.getImageData(0, 0, 40, 40);
        if (mapRef.addImage) {
          mapRef.addImage(name, imageData, { pixelRatio: 2 });
        }
      });
    });
    utilSpritesAdded = true;
  }
  // Expose so style switching + updateLayer can re-register images after map.setStyle()
  window.ensureUtilizationPieSprites = ensureUtilizationPieSprites;

  // Ensure symbology checkbox state is applied on load.
  try {
    if (toggleShowSizeByCapacity) {
      showVariableRadius = toggleShowSizeByCapacity.checked;
    }
  } catch {}

  if (minEnrollRange && maxEnrollRange) {
    enrollmentRangeControl = setupShowHideDualRange(minEnrollRange, maxEnrollRange, {
      min: 0,
      max: 2500,
      step: 10,
      initialMin: 0,
      initialMax: 2500,
      onUpdate: (lo, hi) => {
        minEnrollment = lo;
        maxEnrollment = hi;
        if (minEnrollDisplay) minEnrollDisplay.textContent = lo;
        if (maxEnrollDisplay) maxEnrollDisplay.textContent = hi;
        updateLayer();
      },
    });
  }

  if (minSeatsRange && maxSeatsRange) {
    seatsRangeControl = setupShowHideDualRange(minSeatsRange, maxSeatsRange, {
      min: -2000,
      max: 5000,
      step: 1,
      initialMin: -2000,
      initialMax: 5000,
      onUpdate: (lo, hi) => {
        minSeats = lo;
        maxSeats = hi;
        if (minSeatsDisplay) minSeatsDisplay.textContent = lo;
        if (maxSeatsDisplay) maxSeatsDisplay.textContent = hi;
        updateLayer();
      },
    });
  }

  // Sync enrollment slider range to Decision Data Export (decisionLogic.schoolData)
  const syncEnrollmentRangeFromDecisionData = (retry = 0) => {
    if (enrollmentRangeSynced) return;
    const data = window.decisionLogic && Array.isArray(window.decisionLogic.schoolData)
      ? window.decisionLogic.schoolData
      : null;
    if (!data || !data.length) {
      if (retry < 50) {
        setTimeout(() => syncEnrollmentRangeFromDecisionData(retry + 1), 200);
      }
      return;
    }

    const enrollValues = data
      .map((r) => {
        if (window.getEffectiveEnrollment) return window.getEffectiveEnrollment(r);
        const pick = typeof window.pickDecisionRowField === "function" ? window.pickDecisionRowField : null;
        const raw =
          (pick && pick(r, "enrollmentTotal")) ??
          r.Enrollment2026 ??
          r.Enrollment2025 ??
          r["Enrollment2025"] ??
          r.Enrollment ??
          r["Enrollment"] ??
          r[" Total Enrollment"] ??
          r["Total Enrollment"] ??
          0;
        return parseFloat(raw || 0);
      })
      .filter(v => Number.isFinite(v) && v > 0);
    if (!enrollValues.length) {
      return;
    }

    let minVal = Math.min(...enrollValues);
    let maxVal = Math.max(...enrollValues);

    // If min/max collapse or are invalid, bail and keep defaults
    if (!Number.isFinite(minVal) || !Number.isFinite(maxVal) || minVal >= maxVal) {
      console.warn("⚠️ Enrollment sync skipped due to invalid range", { minVal, maxVal });
      return;
    }

    // Pad to nice step-aligned bounds (and keep at least the requested 0–2500 range)
    const paddedMin = Math.max(0, Math.floor(minVal / 10) * 10);
    const paddedMax = Math.ceil(maxVal / 10) * 10;
    const effectiveMax = Math.max(2500, paddedMax);

    if (enrollmentRangeControl) {
      enrollmentSliderBounds = { min: paddedMin, max: effectiveMax };
      enrollmentRangeControl.setBounds(paddedMin, effectiveMax, [paddedMin, effectiveMax]);
      minEnrollment = paddedMin;
      maxEnrollment = effectiveMax;
      if (minEnrollDisplay) minEnrollDisplay.textContent = paddedMin;
      if (maxEnrollDisplay) maxEnrollDisplay.textContent = effectiveMax;
      enrollmentRangeSynced = true;
      updateLayer();
      console.log("📊 Enrollment slider synced to Decision Data Export range:", { minVal, maxVal, paddedMin, paddedMax, effectiveMax });
    }
  };
  syncEnrollmentRangeFromDecisionData();

  // Sync seats slider range to Decision Data Export (decisionLogic.schoolData)
  const syncSeatsRangeFromDecisionData = (retry = 0) => {
    if (seatsRangeInitialSynced) return;
    const data = window.decisionLogic && Array.isArray(window.decisionLogic.schoolData)
      ? window.decisionLogic.schoolData
      : null;
    if (!data || !data.length) {
      if (retry < 50) {
        setTimeout(() => syncSeatsRangeFromDecisionData(retry + 1), 200);
      }
      return;
    }
    if (resyncSeatsSliderFromDecisionData({ markInitialSynced: true })) {
      updateLayer();
      console.log('📊 Seats slider synced to Decision Data Export range:', seatsSliderBounds);
    }
  };
  syncSeatsRangeFromDecisionData();

  if (toggleShowSizeByCapacity) {
    toggleShowSizeByCapacity.addEventListener('change', () => {
      showVariableRadius = toggleShowSizeByCapacity.checked;
      updateLayer();
    });
  }

  if (typeof window.ensureUtilizationPieSprites === 'function' && toggleUtilizationPie) {
    const applyUtilizationToggle = () => {
      showUtilizationPie = toggleUtilizationPie.checked;
      if (showUtilizationPie) {
        window.ensureUtilizationPieSprites();
      }
      if (window.map) {
        if (window.map.getLayer('schools-pie-layer')) {
          window.map.setLayoutProperty('schools-pie-layer', 'visibility', showUtilizationPie ? 'visible' : 'none');
        }
        if (window.map.getLayer('schools-layer')) {
          window.map.setLayoutProperty('schools-layer', 'visibility', showUtilizationPie ? 'none' : 'visible');
        }
      }
      updateLayer();
    };
    toggleUtilizationPie.addEventListener('change', applyUtilizationToggle);
    applyUtilizationToggle();
  }

  // Include non-eval schools toggle
  const toggleIncludeNonEval = document.getElementById('toggleIncludeNonEval');
  if (toggleIncludeNonEval) {
    const applyIncludeNonEval = () => {
      includeNonEvalSchools = toggleIncludeNonEval.checked;
      updateLayer();
    };
    // Default OFF on landing page (evaluation-only). Ignore any saved state.
    toggleIncludeNonEval.checked = false;
    includeNonEvalSchools = false;
    toggleIncludeNonEval.addEventListener('change', applyIncludeNonEval);
    applyIncludeNonEval();
  }

  // Include closed schools toggle
  const toggleIncludeClosed = document.getElementById('toggleIncludeClosed');
  if (toggleIncludeClosed) {
    const applyIncludeClosed = () => {
      includeClosedSchools = toggleIncludeClosed.checked;
      // Toggle red slash overlay visibility if present
      try {
        if (window.map && window.map.getLayer && window.map.getLayer('closed-stripe-layer')) {
          window.map.setLayoutProperty('closed-stripe-layer', 'visibility', includeClosedSchools ? 'visible' : 'none');
        }
      } catch {}
      updateLayer();
    };
    // Default OFF on landing page (evaluation-only). Ignore any saved state.
    toggleIncludeClosed.checked = false;
    includeClosedSchools = false;
    toggleIncludeClosed.addEventListener('change', applyIncludeClosed);
    applyIncludeClosed();
  }

  // --- Map filter panel positioning (static, no drag) ---
  const filterPanel = document.getElementById('filter-panel');
  const filterResizeHandle = document.getElementById('filter-resize-handle');
  const mapFiltersToggleBtn = document.getElementById('mapFiltersToggleBtn');
  if (filterPanel) {
    // If the Map Filters panel is embedded inside the School Selection panel,
    // it should behave like a normal in-flow <details> section (no absolute positioning/resize).
    const isFilterPanelEmbedded = !!filterPanel.closest('#map-school-select-panel');
    if (isFilterPanelEmbedded) {
      // Clear any previously applied inline positioning from older UI versions.
      filterPanel.style.position = '';
      filterPanel.style.top = '';
      filterPanel.style.right = '';
      filterPanel.style.left = '';
      filterPanel.style.width = '';
      filterPanel.style.height = '';
    } else {
    const enableFilterPanelDrag = false;
    if (enableFilterPanelDrag) {
      const summary = filterPanel.querySelector('summary');
      let dragging = false;
      let dragOffset = [0, 0];

      const startDrag = (e) => {
        if (!filterPanel.open) return;
        dragging = true;
        const rect = filterPanel.getBoundingClientRect();
        dragOffset = [e.clientX - rect.left, e.clientY - rect.top];
        document.body.style.userSelect = 'none';
      };

      const endDrag = () => {
        dragging = false;
        document.body.style.userSelect = '';
      };

      const onMove = (e) => {
        if (!dragging) return;
        filterPanel.style.left = `${e.clientX - dragOffset[0]}px`;
        filterPanel.style.top = `${e.clientY - dragOffset[1]}px`;
        filterPanel.style.right = 'auto';
      };

      if (summary) {
        summary.addEventListener('mousedown', startDrag);
        document.addEventListener('mouseup', endDrag);
        document.addEventListener('mousemove', onMove);
      }
    }

    const resetFilterPanelPosition = () => {
      filterPanel.style.position = 'absolute';
      filterPanel.style.top = defaultFilterPosition.top;
      filterPanel.style.right = defaultFilterPosition.right;
      filterPanel.style.left = 'auto';
      filterPanel.style.width = '';
      filterPanel.style.height = '';
    };

    resetFilterPanelPosition();
    filterPanel.addEventListener('toggle', resetFilterPanelPosition);

    // Custom bottom-left resize handle
    if (filterResizeHandle) {
      const minW = 200;
      const maxW = 420;
      const minH = 160;
      const maxH = 800;
      let startX = 0;
      let startY = 0;
      let startW = 0;
      let startH = 0;

      const onMouseMove = (e) => {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const newW = Math.min(maxW, Math.max(minW, startW - dx)); // left handle shrinks when dragging right
        const newH = Math.min(maxH, Math.max(minH, startH + dy));
        filterPanel.style.width = `${newW}px`;
        filterPanel.style.height = `${newH}px`;
      };

      const endResize = () => {
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', endResize);
      };

      filterResizeHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const rect = filterPanel.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startW = rect.width;
        startH = rect.height;
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', endResize);
      });
    }
    }
  }

  // Map banner toggle button (Google-Maps-style): keep School dropdown always visible.
  if (filterPanel && mapFiltersToggleBtn) {
    const syncMapFiltersScrollHeight = () => {
      const content = document.getElementById('filter-panel-content');
      if (!content || !filterPanel?.open) {
        if (content) content.style.maxHeight = '';
        return;
      }
      const buffer = 12;
      const contentTop = content.getBoundingClientRect().top;
      const available = window.innerHeight - contentTop - buffer;
      content.style.maxHeight = (Number.isFinite(available) && available > 80)
        ? `${Math.floor(available)}px`
        : '';
    };
    const syncToggle = () => {
      try { mapFiltersToggleBtn.setAttribute('aria-expanded', filterPanel.open ? 'true' : 'false'); } catch (e) {}
      requestAnimationFrame(() => requestAnimationFrame(syncMapFiltersScrollHeight));
    };
    mapFiltersToggleBtn.addEventListener('click', () => {
      filterPanel.open = !filterPanel.open;
      syncToggle();
    });
    filterPanel.addEventListener('toggle', syncToggle);
    window.addEventListener('resize', syncMapFiltersScrollHeight);
    window.addEventListener('orientationchange', syncMapFiltersScrollHeight);
    syncToggle();
  }

  // --- School level (show/hide) filter logic ---
  function resetShowHideSchoolSettings() {
    if (schoolTypeDropdownMenu) {
      schoolTypeDropdownMenu.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.checked = true;
      });
    }
    syncSchoolTypeFromDropdown();

    const enrollMin = enrollmentSliderBounds.min;
    const enrollMax = enrollmentSliderBounds.max;
    if (enrollmentRangeControl) {
      enrollmentRangeControl.setValues(enrollMin, enrollMax);
    }

    const seatsMin = seatsSliderBounds.min;
    const seatsMax = seatsSliderBounds.max;
    if (seatsRangeControl) {
      seatsRangeControl.setValues(seatsMin, seatsMax);
    }

    const nonEvalEl = document.getElementById('toggleIncludeNonEval');
    const closedEl = document.getElementById('toggleIncludeClosed');
    if (nonEvalEl) nonEvalEl.checked = false;
    if (closedEl) closedEl.checked = false;
    includeNonEvalSchools = false;
    includeClosedSchools = false;
    try {
      if (window.map && window.map.getLayer && window.map.getLayer('closed-stripe-layer')) {
        window.map.setLayoutProperty('closed-stripe-layer', 'visibility', 'none');
      }
    } catch {}

    updateLayer();
  }

  function syncSchoolTypeFromDropdown() {
    if (!schoolTypeDropdownMenu) return;
    const allTypeInputs = schoolTypeDropdownMenu.querySelectorAll('input[type="checkbox"]');
    const checked = Array.from(allTypeInputs)
      .filter((cb) => cb.checked)
      .map((cb) => cb.value);
    selectedTypes = checked;
    // Sync hidden select for any legacy uses
    if (schoolTypeFilter) {
      Array.from(schoolTypeFilter.options).forEach(opt => {
        opt.selected = checked.includes(opt.value);
      });
    }
    updateLayer();
    try {
      if (window.__aaRefreshPopupNow) {
        window.__aaRefreshPopupNow();
      } else if (window.__aaRefreshPopup) {
        window.__aaRefreshPopup();
      }
    } catch {}
  }

  if (schoolTypeDropdownMenu) {
    schoolTypeDropdownMenu.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', syncSchoolTypeFromDropdown);
    });
  }

  if (schoolTypeDropdownToggle && schoolTypeDropdownMenu) {
    schoolTypeDropdownToggle.addEventListener('click', () => {
      schoolTypeDropdownMenu.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!schoolTypeDropdownMenu.contains(e.target) && !schoolTypeDropdownToggle.contains(e.target)) {
        schoolTypeDropdownMenu.classList.remove('open');
      }
    });
  }

  if (resetShowHideSchoolsBtn) {
    resetShowHideSchoolsBtn.addEventListener('click', resetShowHideSchoolSettings);
  }

  // Initialize selection label
  syncSchoolTypeFromDropdown();

  // --- Color-by toggle (School Level default; Building Score, Strategic Decision, FCI, Utilization) ---
  function setMapColorMode(mode) {
    mapColorByMode =
      (mode === 'building') ? 'building'
      : ((mode === 'fci') ? 'fci'
        : ((mode === 'utilization') ? 'utilization'
          : ((mode === 'level') ? 'level' : 'decision')));
    window.__mapColorByMode = mapColorByMode;
    if (colorByDecisionBtn) colorByDecisionBtn.classList.toggle('active', mapColorByMode === 'decision');
    if (colorByLevelBtn) colorByLevelBtn.classList.toggle('active', mapColorByMode === 'level');
    if (colorByUtilBtn) colorByUtilBtn.classList.toggle('active', mapColorByMode === 'utilization');
    if (colorByFciBtn) colorByFciBtn.classList.toggle('active', mapColorByMode === 'fci');
    if (colorByBuildingBtn) colorByBuildingBtn.classList.toggle('active', mapColorByMode === 'building');
    if (fciSystemSymbologyRow) {
      fciSystemSymbologyRow.style.display = mapColorByMode === 'fci' ? '' : 'none';
    }
    try {
      if (typeof window.applyMapColorByMode === 'function') window.applyMapColorByMode();
    } catch (e) {}
    if (mapColorByMode === 'building') {
      try {
        if (originalGeojsonData && Array.isArray(originalGeojsonData.features)) {
          applyBuildingMetricsToFeatures(originalGeojsonData.features);
        }
      } catch {}
    }
    // If utilization pies are active, we need to update the chosen sprite per feature
    // so the pie color follows the selected "Color by" mode.
    try {
      updateLayer();
    } catch (e) {}
    // Keep legend updated (it contains the decision filter checkboxes)
    try { updateLegend(); } catch (e) {}
  }
  if (colorByDecisionBtn) colorByDecisionBtn.addEventListener('click', () => setMapColorMode('decision'));
  if (colorByLevelBtn) colorByLevelBtn.addEventListener('click', () => setMapColorMode('level'));
  if (colorByUtilBtn) colorByUtilBtn.addEventListener('click', () => setMapColorMode('utilization'));
  if (colorByFciBtn) colorByFciBtn.addEventListener('click', () => setMapColorMode('fci'));
  if (colorByBuildingBtn) colorByBuildingBtn.addEventListener('click', () => setMapColorMode('building'));
  setMapColorMode('level');

  const getSelectedCompareCategoriesFromDom = () => {
    const selected = [];
    if (compareCategoryList) {
      compareCategoryList.querySelectorAll('input[data-compare-category]').forEach((cb) => {
        if (cb.checked) selected.push(cb.getAttribute('data-compare-category'));
      });
    }
    return selected;
  };
  const getSelectedCompareSystemsFromDom = () => {
    const selected = [];
    if (compareFciSystemList) {
      compareFciSystemList.querySelectorAll('input[data-compare-fci-system]').forEach((cb) => {
        if (cb.checked) selected.push(cb.getAttribute('data-compare-fci-system'));
      });
    }
    return selected;
  };
  const syncCompareCategories = () => {
    const selected = getSelectedCompareCategoriesFromDom();
    window.__compareCategories = selected;
    updateCompareFciSystemsVisibility();
    try { updateArticulationAreaFciTable(); } catch {}
    const areaName = window.__aaPopupAreaName;
    try {
      if (window.__aaRefreshPopupNow) {
        requestAnimationFrame(() => window.__aaRefreshPopupNow(areaName));
      } else if (window.__aaRefreshPopup) {
        window.__aaRefreshPopup();
      }
    } catch {}
    try { window.__aaPopupDirty = true; } catch {}
    try { window.dispatchEvent(new CustomEvent('aaPopupRefresh')); } catch {}
  };
  if (compareCategoryList) {
    compareCategoryList.querySelectorAll('input[data-compare-category]').forEach((cb) => {
      cb.addEventListener('change', syncCompareCategories);
    });
    // Fallback: capture bubbling changes at the container level
    compareCategoryList.addEventListener('change', syncCompareCategories);
  }
  try { updateCompareFciSystemsVisibility(); } catch {}
  // Global fallback: ensure checkbox changes always sync
  document.addEventListener('change', (e) => {
    if (e.target && e.target.matches && e.target.matches('input[data-compare-category]')) {
      syncCompareCategories();
    }
    if (e.target && e.target.matches && e.target.matches('input[data-compare-fci-system]')) {
      syncCompareFciSystems();
    }
  }, true);
  document.addEventListener('input', (e) => {
    if (e.target && e.target.matches && e.target.matches('input[data-compare-category]')) {
      syncCompareCategories();
    }
    if (e.target && e.target.matches && e.target.matches('input[data-compare-fci-system]')) {
      syncCompareFciSystems();
    }
  }, true);
  const syncCompareFciSystems = () => {
    if (!compareFciSystemList) return;
    const selected = getSelectedCompareSystemsFromDom().map(canonicalFciSystemName);
    compareFciSystem = selected;
    try { updateArticulationAreaFciTable(); } catch {}
    try {
      if (window.__aaRefreshPopupNow) requestAnimationFrame(() => window.__aaRefreshPopupNow(window.__aaPopupAreaName));
      else if (window.__aaRefreshPopup) window.__aaRefreshPopup();
    } catch {}
    try { window.__aaPopupDirty = true; } catch {}
    try { window.dispatchEvent(new CustomEvent('aaPopupRefresh')); } catch {}
  };
  if (compareFciSystemList) {
    compareFciSystemList.addEventListener('change', syncCompareFciSystems);
  }
  // Poll for compare selections in case events are swallowed
  let lastCompareCategoriesKey = '';
  let lastCompareSystemsKey = '';
  const getCompareSelectionKey = () => {
    const cats = getSelectedCompareCategoriesFromDom().sort().join('|');
    const systems = getSelectedCompareSystemsFromDom().sort().join('|');
    const fciSys = (fciSelectedSystem || '').toString().trim();
    return `${cats}__${systems}__${fciSys}`;
  };
  const pollCompareSelections = () => {
    const cats = getSelectedCompareCategoriesFromDom().sort().join('|');
    const systems = getSelectedCompareSystemsFromDom().sort().join('|');
    if (cats !== lastCompareCategoriesKey) {
      lastCompareCategoriesKey = cats;
      syncCompareCategories();
    }
    if (systems !== lastCompareSystemsKey) {
      lastCompareSystemsKey = systems;
      syncCompareFciSystems();
    }
  };
  try { setInterval(pollCompareSelections, 300); } catch {}

  // Mutation observer fallback: detect checkbox state changes
  try {
    const compareObserver = new MutationObserver(() => {
      try {
        syncCompareCategories();
        syncCompareFciSystems();
      } catch {}
    });
    if (compareCategoryList) {
      compareObserver.observe(compareCategoryList, { attributes: true, subtree: true });
    }
    if (compareFciSystemList) {
      compareObserver.observe(compareFciSystemList, { attributes: true, subtree: true });
    }
  } catch {}

  // Final fallback: refresh popup when marked dirty
  try {
    if (!window.__aaPopupRefreshTimer) {
      window.__aaPopupRefreshTimer = setInterval(() => {
        if (window.__aaPopupDirty) {
          window.__aaPopupDirty = false;
          try {
            if (window.__aaRefreshPopupNow) window.__aaRefreshPopupNow();
            else if (window.__aaRefreshPopup) window.__aaRefreshPopup();
          } catch {}
        }
      }, 400);
    }
  } catch {}

  // Always refresh popup if compare selections changed while pinned
  try {
    if (!window.__aaPopupSelectionTimer) {
      window.__aaLastSelectionKey = getCompareSelectionKey();
      if (!window.__aaRefreshPopupNow) {
        window.__aaRefreshPopupNow = () => {
          try {
            if (!window.__aaPopup || !window.__aaBuildPopupHtml || !window.__aaPopupAreaName) return;
            window.__aaPopup.setHTML(window.__aaBuildPopupHtml(window.__aaPopupAreaName)).addTo(window.map);
            try { window.__aaPositionPopupTopRight && window.__aaPositionPopupTopRight(); } catch {}
            setTimeout(() => {
              try { window.__aaEnhancePopupPanel && window.__aaEnhancePopupPanel(); } catch {}
              try { window.__aaPositionPopupTopRight && window.__aaPositionPopupTopRight(); } catch {}
            }, 0);
          } catch {}
        };
      }
      window.__aaPopupSelectionTimer = setInterval(() => {
        try {
          if (!window.__aaPopupAreaName) return;
          const key = getCompareSelectionKey();
          if (key !== window.__aaLastSelectionKey) {
            window.__aaLastSelectionKey = key;
            if (window.__aaRefreshPopupNow) {
              window.__aaRefreshPopupNow();
            } else if (window.__aaRefreshPopup) {
              window.__aaRefreshPopup();
            }
          }
        } catch {}
      }, 500);
    }
  } catch {}
  syncCompareCategories();
  syncCompareFciSystems();

  if (fciSystemSelect) {
    fciSystemSelect.addEventListener('change', () => {
      setFciSelectedSystem(fciSystemSelect.value);
      // Selecting a system implies FCI view
      setMapColorMode('fci');
    });
  }
  if (compareFciSystemSelect) {
    compareFciSystemSelect.addEventListener('change', () => {
      compareFciSystem = compareFciSystemSelect.value;
      try { updateArticulationAreaFciTable(); } catch {}
    });
  }

  // --- LEGEND AND TOGGLE LOGIC ---
  // Toggle buttons removed - always showing decisions view
  
  // Apply initial circle color based on current mode (Decision by default).
  try {
    if (typeof window.applyMapColorByMode === 'function') window.applyMapColorByMode();
  } catch (e) {}

  updateLegend();
  // Initialize decisions view if available
  if (typeof window.showDecisionsView === 'function') {
    showDecisionsView();
  } else {
    console.warn("⚠️ showDecisionsView not found; skipping initial decisions view toggle");
  }

  // --- SIDEBAR AND MAP RESIZE LOGIC ---
  // --- INITIAL MAP RESIZE ON LOAD ---
  // Map container will automatically take available space with flex: 1
  // Just ensure map resizes after initial load
  setTimeout(() => {
    if (map && map.resize) {
      map.resize();
    }
  }, 100);

  // Startup bounds are set to Jeffco; loaded school coordinates refine the fit.

  // --- IFRAME COMMUNICATION ---
  // The iframe has been removed. All communication is now direct function calls.
  // The DecisionLogic.js script, once loaded, will expose `window.decisionLogic`.
  
  // --- MAP/FLOWCHART TOGGLE ---
  // Define switch functions globally so they can be called from inline handlers
  window.switchToFlowchart = function() {
    const step1View = document.getElementById('step1-school-view');
    const flowchartContainer = document.getElementById('main-flowchart-container');
    const mapContainer = document.getElementById('map-container');
    const toggleViewContainer = document.querySelector('#map-container .toggle-buttons');

    if (step1View) step1View.style.display = 'none';
    if (flowchartContainer) flowchartContainer.style.display = 'flex';
    if (mapContainer) mapContainer.style.display = 'none';
    
    // Update toggle button states
    const toggleMapFlowchartMap = document.getElementById('toggleMapFlowchartMap');
    const toggleMapFlowchartFlowchart = document.getElementById('toggleMapFlowchartFlowchart');
    const toggleMapFlowchartMap2 = document.getElementById('toggleMapFlowchartMap2');
    const toggleMapFlowchartFlowchart2 = document.getElementById('toggleMapFlowchartFlowchart2');
    
    if (toggleMapFlowchartMap) toggleMapFlowchartMap.classList.remove('active');
    if (toggleMapFlowchartFlowchart) toggleMapFlowchartFlowchart.classList.add('active');
    if (toggleMapFlowchartMap2) toggleMapFlowchartMap2.classList.remove('active');
    if (toggleMapFlowchartFlowchart2) toggleMapFlowchartFlowchart2.classList.add('active');
    const menuShowMap = document.getElementById('menuShowMap');
    const menuShowFlowchart = document.getElementById('menuShowFlowchart');
    if (menuShowMap && menuShowFlowchart) {
      menuShowMap.classList.remove('active');
      menuShowFlowchart.classList.add('active');
    }
    
    // Hide the decisions/assignments toggle when in flowchart view
    if (toggleViewContainer) toggleViewContainer.style.display = 'none';
    
    if (!window.flowchartInitialized) {
      initializeFlowchart();
    }
    window.__centerViewPrefersFlowchart = true;
  };

  window.switchToMap = function() {
    const step1View = document.getElementById('step1-school-view');
    const flowchartContainer = document.getElementById('main-flowchart-container');
    const mapContainer = document.getElementById('map-container');
    const toggleViewContainer = document.querySelector('#map-container .toggle-buttons');

    if (step1View) step1View.style.display = 'none';
    if (flowchartContainer) flowchartContainer.style.display = 'none';
    if (mapContainer) mapContainer.style.display = 'block';
    
    // Update toggle button states
    const toggleMapFlowchartMap = document.getElementById('toggleMapFlowchartMap');
    const toggleMapFlowchartFlowchart = document.getElementById('toggleMapFlowchartFlowchart');
    const toggleMapFlowchartMap2 = document.getElementById('toggleMapFlowchartMap2');
    const toggleMapFlowchartFlowchart2 = document.getElementById('toggleMapFlowchartFlowchart2');
    
    if (toggleMapFlowchartMap) toggleMapFlowchartMap.classList.add('active');
    if (toggleMapFlowchartFlowchart) toggleMapFlowchartFlowchart.classList.remove('active');
    if (toggleMapFlowchartMap2) toggleMapFlowchartMap2.classList.add('active');
    if (toggleMapFlowchartFlowchart2) toggleMapFlowchartFlowchart2.classList.remove('active');
    const menuShowMap = document.getElementById('menuShowMap');
    const menuShowFlowchart = document.getElementById('menuShowFlowchart');
    if (menuShowMap && menuShowFlowchart) {
      menuShowMap.classList.add('active');
      menuShowFlowchart.classList.remove('active');
    }
    
    // Show the decisions/assignments toggle when in map view
    if (toggleViewContainer) toggleViewContainer.style.display = 'flex';
    
    setTimeout(() => {
      if (map && map.resize) map.resize();
      if (typeof window.scheduleFitMapToAllSchools === 'function') {
        window.scheduleFitMapToAllSchools(80);
      }
    }, 100);
    window.__centerViewPrefersFlowchart = false;
  };
  
  function setupFlowchartToggleButtons() {
    const toggleMapFlowchartMap = document.getElementById('toggleMapFlowchartMap');
    const toggleMapFlowchartFlowchart = document.getElementById('toggleMapFlowchartFlowchart');
    const toggleMapFlowchartMap2 = document.getElementById('toggleMapFlowchartMap2');
    const toggleMapFlowchartFlowchart2 = document.getElementById('toggleMapFlowchartFlowchart2');

    if (!toggleMapFlowchartMap || !toggleMapFlowchartFlowchart || !toggleMapFlowchartMap2 || !toggleMapFlowchartFlowchart2) {
      console.warn("⚠️ Flowchart toggle buttons not found, will retry...");
      setTimeout(setupFlowchartToggleButtons, 100);
      return;
    }

    // Add event listeners for all toggle buttons
    toggleMapFlowchartMap.addEventListener('click', window.switchToMap);
    toggleMapFlowchartFlowchart.addEventListener('click', window.switchToFlowchart);
    toggleMapFlowchartMap2.addEventListener('click', window.switchToMap);
    toggleMapFlowchartFlowchart2.addEventListener('click', window.switchToFlowchart);

    console.log("✅ Flowchart toggle buttons set up");
  }

  // Set up flowchart toggle buttons
  setupFlowchartToggleButtons();

  // Add event listener for "Fit to All Schools" button
  function setupFitToSchoolsButton() {
    const fitToSchoolsBtn = document.getElementById('fitToSchoolsBtn');
    if (fitToSchoolsBtn) {
      // Remove any existing inline handlers and add our own
      fitToSchoolsBtn.onclick = null; // Clear any inline onclick
      
      fitToSchoolsBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log("🔘 Fit to All Schools button clicked");
        
        if (typeof window.fitMapToAllSchools === 'function') {
          try {
            window.fitMapToAllSchools();
          } catch (error) {
            console.error("❌ Error in fitMapToAllSchools:", error);
            alert("Error fitting map to schools: " + error.message);
          }
        } else {
          console.warn("⚠️ fitMapToAllSchools function not available yet");
          alert("Map is still loading. Please wait a moment and try again.");
        }
      }, true); // Use capture phase to ensure it fires
      
      console.log("✅ Fit to All Schools button event listener added");
      return true;
    } else {
      console.warn("⚠️ fitToSchoolsBtn not found");
      return false;
    }
  }
  
  // Try multiple times to set up the button
  if (!setupFitToSchoolsButton()) {
    // If button not found, try again after DOMContentLoaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        setTimeout(setupFitToSchoolsButton, 100);
      });
    } else {
      setTimeout(setupFitToSchoolsButton, 100);
    }
  }
  
  // Also try after map loads (in case button is added dynamically)
  if (window.map) {
    setTimeout(setupFitToSchoolsButton, 500);
  }

  function initializeFlowchart() {
    console.log("🎯 Initializing flowchart...");
    setupFlowchart();
  }

  function setupFlowchart() {
    console.log("🎯 Setting up flowchart...");
    
    const svg = d3.select("#main-flowchart-svg");
    if (svg.empty()) {
      console.error("❌ Could not find flowchart SVG element");
      return;
    }

    svg.selectAll("*").remove();
    // Keep the flowchart framed for the default left-to-right ELK layout.
    svg.attr("viewBox", "-50 -50 1800 1000").attr("preserveAspectRatio", "xMidYMid meet");

    if (typeof window.initializeFlowchartFromScript === 'function') {
      window.initializeFlowchartFromScript(svg);
    } else {
      console.error("❌ initializeFlowchartFromScript function not found!");
    }

    const flowchartSchoolSelect = document.getElementById('mainFlowchartSchoolSelect');
    const mapOriginSelect = document.getElementById('mapOriginSchoolSelect');
    if (geojsonData && geojsonData.features && flowchartSchoolSelect) {
      flowchartSchoolSelect.innerHTML = '<option value="">-- Select School --</option>';
      
      // Use filtered school data from DecisionLogic instead of geojsonData
      // This ensures we only include schools where Include_Flow_Chart is not "No"
      if (window.decisionLogic && window.decisionLogic.schoolData) {
        console.log("📊 Using filtered school data for flowchart dropdown");
        const sortedSchools = window.decisionLogic.schoolData
          .map(row => row["Building Name"])
          .filter(name => name) // Remove any null/undefined names
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        
        sortedSchools.forEach(schoolName => {
          const option = document.createElement('option');
          option.value = schoolName;
          option.textContent = mainDisplaySchoolName(schoolName);
          flowchartSchoolSelect.appendChild(option);
        });
      } else {
        console.log("⚠️ Using geojsonData for flowchart dropdown (filtered data not available yet)");
        // Fallback to geojsonData if filtered data isn't available yet
        const sortedSchools = geojsonData.features
          .map(feature => feature.properties['Building Name'])
          .filter(name => name) // Remove any null/undefined names
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        
        sortedSchools.forEach(schoolName => {
          const option = document.createElement('option');
          option.value = schoolName;
          option.textContent = mainDisplaySchoolName(schoolName);
          flowchartSchoolSelect.appendChild(option);
        });
      }

      // Helper to sync the map dropdown from a school name
      const syncMapDropdownFromName = (schoolName) => {
        if (!schoolName || !mapOriginSelect) return;
        const norm = (s) => (s || "").toString().trim().toLowerCase();
        let originId = "";
        if (window.decisionLogic && Array.isArray(window.decisionLogic.schoolData)) {
          const row = window.decisionLogic.schoolData.find(r => norm(r["Building Name"]) === norm(schoolName));
          if (row) {
            originId = (
              row.UniqueID ||
              row["UniqueID"] ||
              row["Unique Id"] ||
              ""
            ).toString().trim();
          }
        }

        setMapOriginSelect(originId || schoolName, schoolName);
        if (originId || schoolName) {
          updateNearbySchoolsPanel(originId || schoolName, schoolName);
        } else {
          updateNearbySchoolsPanel('', '');
        }
      };

      // Do NOT auto-select a school on flowchart landing.
      // If there is an existing selection (e.g., user picked from map first), sync map to it.
      if (flowchartSchoolSelect.value) {
        syncMapDropdownFromName(flowchartSchoolSelect.value);
      }

      flowchartSchoolSelect.addEventListener('change', (e) => {
        const selectedSchool = e.target.value;
        console.log("🎯 School selection changed to:", selectedSchool);
        console.log("🎯 updateFlowForSchool function available:", typeof window.updateFlowForSchool === 'function');
        console.log("🎯 Current thresholds:", window.thresholds);

        // Track the current selection globally so slider updates and other
        // components can use it even if the user switches back to the map.
        if (selectedSchool) {
          window.currentSelectedSchoolName = selectedSchool;
        } else {
          window.currentSelectedSchoolName = '';
          window.currentOriginId = '';
          window.currentOriginName = '';
          clearSelectedSchoolHighlight();
        }

        // Keep the map-origin dropdown in sync when user selects from the flowchart dropdown
        try {
          syncMapDropdownFromName(selectedSchool);
        } catch (syncErr) {
          console.warn("⚠️ Unable to sync mapOriginSchoolSelect with mainFlowchartSchoolSelect:", syncErr);
        }

        if (typeof window.updateFlowForSchool === 'function') {
          window.updateFlowForSchool(selectedSchool, window.thresholds || {});
        } else {
          console.warn("⚠️ updateFlowForSchool function not available");
        }

        // Treat the newly selected school as the current origin for map logic
        if (window.decisionLogic && Array.isArray(window.decisionLogic.schoolData) && selectedSchool) {
          const originRow = window.decisionLogic.schoolData.find(r => r["Building Name"] === selectedSchool);
          const originId = originRow
            ? (originRow.UniqueID || originRow["UniqueID"] || originRow["Unique Id"] || "").toString().trim()
            : "";
          if (originId) {
            window.currentOriginName = selectedSchool;
            window.currentOriginId = originId;
          }
        }

        // Automatically update the map to show the origin + nearby schools
        if (selectedSchool && typeof window.showOnMapFromFlowchart === 'function') {
          window.showOnMapFromFlowchart(selectedSchool);
        }
      });

      // If a school was selected from the map before the flowchart was
      // initialized, apply that pending selection now that the options and
      // SVG nodes exist.
      if (window.pendingFlowchartSchoolName) {
        const pendingName = window.pendingFlowchartSchoolName;
        const pendingOriginId = window.pendingFlowchartOriginId || "";

        // Ensure an option exists for the pending school name
        let hasPendingOption = Array.from(flowchartSchoolSelect.options || []).some(
          opt => opt.value === pendingName
        );
        if (!hasPendingOption) {
          const opt = document.createElement('option');
          opt.value = pendingName;
          opt.textContent = mainDisplaySchoolName(pendingName);
          flowchartSchoolSelect.appendChild(opt);
          hasPendingOption = true;
          console.log("➕ Added pending option to mainFlowchartSchoolSelect for", pendingName);
        }

        if (hasPendingOption) {
          console.log("🎯 Applying pending flowchart selection from map click:", pendingName);
          flowchartSchoolSelect.value = pendingName;
          const evt = new Event('change', { bubbles: true });
          flowchartSchoolSelect.dispatchEvent(evt);
        } else {
          console.warn("⚠️ Pending flowchart school name has no option:", pendingName);
        }

        // Also try to sync the map-origin dropdown if we have an origin ID
        setMapOriginSelect(pendingOriginId || pendingName, pendingName);

        // Clear pending state either way so we don't re-apply it.
        window.pendingFlowchartSchoolName = null;
        window.pendingFlowchartOriginId = null;
      }
    }

    window.flowchartInitialized = true;
  }

  // --- Render blank/zeroed graphs in model output section on first load ---
  function renderBlankModelOutputCharts() {
    // Enrollment/Utilization Impact: blank chart
    if (window.decisionLogic && typeof window.decisionLogic.handleAssignmentResults === 'function') {
      const blankResults = {
        summaryHTML: '',
        enrollmentChartData: {
          labels: [],
          datasets: [
            { label: 'Current Enrollment', data: [], backgroundColor: '#0033A0', barThickness: 12 },
            { label: 'New Assignments', data: [], backgroundColor: '#FFC72C', barThickness: 12 },
            { label: 'Capacity', data: [], type: 'line', borderColor: '#FF530D', borderWidth: 3, pointStyle: 'line', pointRadius: 7, pointHoverRadius: 7, rotation: 90, fill: false, showLine: false, yAxisID: 'y' }
          ]
        },
        distanceChartData: {
          labels: ['Current School', 'Assigned School'],
          datasets: [{ label: 'Avg Distance (mi)', data: [0, 0], backgroundColor: ['#0033A0', '#ffcc00'] }]
        },
        assignments: {},
        selectedSchoolName: ''
      };
      window.decisionLogic.handleAssignmentResults(blankResults);
    }
    // Show placeholders
    const enrollPlaceholder = document.getElementById('enrollmentChartPlaceholder');
    if (enrollPlaceholder) enrollPlaceholder.style.display = '';
    const distancePlaceholder = document.getElementById('distanceChartPlaceholder');
    if (distancePlaceholder) distancePlaceholder.style.display = '';
  }

  // Call this after DOM is ready and decisionLogic is loaded
  if (window.decisionLogic && typeof window.decisionLogic.handleAssignmentResults === 'function') {
    renderBlankModelOutputCharts();
  } else {
    // If decisionLogic isn't ready yet, wait for it
    const interval = setInterval(() => {
      if (window.decisionLogic && typeof window.decisionLogic.handleAssignmentResults === 'function') {
        renderBlankModelOutputCharts();
        clearInterval(interval);
      }
    }, 100);
  }
});

// ✅ Inject decisions into geojson features
function normalizeName(name) {
  return name?.toLowerCase().replace(/\s+/g, ' ').trim();
}

function buildNameVariants(name) {
  const n0 = normalizeName(name || '');
  if (!n0) return [];
  const variants = new Set();
  variants.add(n0);
  const n1 = n0
    .replace(/elementary/g, 'es')
    .replace(/middle school/g, 'ms')
    .replace(/middle/g, 'ms')
    .replace(/high school/g, 'hs')
    .replace(/high/g, 'hs');
  variants.add(n1);
  const n2 = n0.replace(/school/g, '').replace(/\s+/g, ' ').trim();
  variants.add(n2);
  const n3 = n1.replace(/school/g, '').replace(/\s+/g, ' ').trim();
  variants.add(n3);
  return Array.from(variants).filter(Boolean);
}

function injectDecisionsIntoGeoJSON(geojson, decisions, options = {}) {
  console.log("🔄 injectDecisionsIntoGeoJSON called with", decisions.length, "decision records");
  
  // Log sample decision data to see if flow is present
  const sampleDecisions = decisions.slice(0, 3).map(row => ({
    name: row["Building Name"],
    decision: row["decision"],
    flow: row["flow"]
  }));
  console.log("📋 Sample decision data:", sampleDecisions);
  
  const num = (v) => {
    const s = (v ?? '').toString().trim().replace(/^'+\s*/, '').replace(/,/g, '');
    if (!s) return 0;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };

  const decisionMap = new Map(decisions.map(row => [normalizeName(row["Building Name"]), row["decision"] || "Unknown"]));
  const buildingQualityMap = new Map(decisions.map(row => [normalizeName(row["Building Name"]), num(row["BuildingScore"] ?? row["Building Score"])]));
  // Add a map for Utilization
  const getEff =
    window.getEffectiveEnrollment ||
    ((r) =>
      num(
        (typeof window.pickDecisionRowField === "function"
          ? window.pickDecisionRowField(r, "enrollmentTotal")
          : undefined) ??
          r["Enrollment"] ??
          r["Enrollment2026"] ??
          r["Enrollment2025"] ??
          r[" Total Enrollment"] ??
          r["Total Enrollment"]
      ));
  const getEffUtil = window.getEffectiveUtilization || ((r) => {
    const c = (window.getEffectiveCapacity && window.getEffectiveCapacity(r)) ?? num(r.Capacity);
    const pick = typeof window.pickDecisionRowField === "function" ? window.pickDecisionRowField : null;
    const e =
      (window.getEffectiveEnrollment && window.getEffectiveEnrollment(r)) ??
      num(
        (pick && pick(r, "enrollmentTotal")) ??
          r.Enrollment ??
          r.Enrollment2026 ??
          r.Enrollment2025 ??
          r.Enrollment
      );
    return c > 0 && Number.isFinite(e) ? e / c : null;
  });
  const utilizationMap = new Map(decisions.map(row => [normalizeName(row["Building Name"]), getEffUtil(row)]));
  const capacityMap = new Map(decisions.map(row => [normalizeName(row["Building Name"]), num(row["Capacity"])]));
  const educationalCapacityMap = new Map(decisions.map(row => [
    normalizeName(row["Building Name"]),
    row["EducationalCapacity"] ?? row["Educational Capacity"] ?? row.EducationalCapacity
  ]));
  const activeCapacityDetailsMap = new Map(
    decisions.map(row => [normalizeName(row["Building Name"]), (window.getEffectiveCapacityDetails ? window.getEffectiveCapacityDetails(row) : null)])
  );
  const getEffSeats = (r) => (window.getEffectiveAvailableSeats && window.getEffectiveAvailableSeats(r)) ?? 0;
  const availableSeatsMap = new Map(decisions.map(row => [normalizeName(row["Building Name"]), getEffSeats(row)]));
  const enrollmentMap = new Map(decisions.map(row => [
    normalizeName(row["Building Name"]),
    getEff(row)
  ]));
  const totalEnrollmentMap = new Map(decisions.map(row => [
    normalizeName(row["Building Name"]),
    num(
      (typeof window.pickDecisionRowField === "function"
        ? window.pickDecisionRowField(row, "enrollmentTotal")
        : undefined) ??
        row["Enrollment"] ??
        row["Enrollment2026"] ??
        row["Enrollment2025"] ??
        row[" Total Enrollment"] ??
        row["Total Enrollment"]
    )
  ]));
  const pkEnrollmentMap = new Map(decisions.map(row => [
    normalizeName(row["Building Name"]),
    num(
      (typeof window.pickDecisionRowField === "function"
        ? window.pickDecisionRowField(row, "enrollmentPK")
        : undefined) ??
        row["PKEnrollment"] ??
        row["PKEnrollment2026"] ??
        row["PKEnrollment2025"] ??
        row["PK Enrollment"] ??
        row["PK Enrollment "]
    )
  ]));
  const schoolLevelMap = new Map(decisions.map(row => [normalizeName(row["Building Name"]), row["School Level"] || "Unknown"]));
  const flowMap = new Map(decisions.map(row => [normalizeName(row["Building Name"]), row["flow"] || 0]));
  const uniqueIdMap = new Map(decisions.map(row => [normalizeName(row["Building Name"]), (row.UniqueID || row["UniqueID"] || row["Unique Id"] || "").toString().trim()]));
  // IMPORTANT:
  // - `window.decisionLogic.schoolData` (used by sliders) often does NOT include
  //   Include_Flow_Chart or Status columns.
  // - If we default missing values to "no"/"" we accidentally overwrite the base
  //   inclusion/closed flags, which then breaks the map filters and toggles.
  // So: store `null` when the column is missing/empty so downstream `??`/`||`
  // fallbacks can use the full decision export or existing feature values.
  const includeFlowMap = new Map(
    decisions.map(row => {
      const rawInclude = row["Include_Flow_Chart"];
      const cleaned = (rawInclude ?? "").toString().trim();
      if (!cleaned) return [normalizeName(row["Building Name"]), null];
      return [normalizeName(row["Building Name"]), cleaned.toLowerCase()];
    })
  );
  const statusMap = new Map(
    decisions.map(row => {
      const rawStatus = row["Status"];
      const cleaned = (rawStatus ?? "").toString().trim();
      if (!cleaned) return [normalizeName(row["Building Name"]), null];
      return [normalizeName(row["Building Name"]), cleaned];
    })
  );
  const distanceWelcomingMap = new Map(
    decisions.map(row => [
      normalizeName(row["Building Name"]),
      parseFloat(row["DistanceUnderutilizedschools"] || "0")
    ])
  );

  // Helper to bucket utilization for pie images (0.0 to 1.2+)
  function utilizationBucket(util) {
    // Bucket at most 1.0 (100%) so full pies are stable.
    const clamped = Math.max(0, Math.min(util, 1.0));
    const step = 0.1;
    const bucket = Math.round(clamped / step) * step; // e.g., 0.0, 0.1, 0.2...
    return bucket.toFixed(1); // string like "0.0"
  }

  geojson.features.forEach(f => {
    const name = normalizeName(f.properties["Building Name"]);
    const uidExistingRaw = (f.properties["UniqueID"] || "").toString().trim();
    const uidExistingNorm = normalizeId(uidExistingRaw);
    const decisionUidRaw = (uniqueIdMap.get(name) || "").toString().trim();
    const mapRow =
      mapExportLookupMaps.byName.get(name) ||
      (uidExistingNorm ? mapExportLookupMaps.byCode.get(uidExistingNorm) : null);
    const mapUidRaw = (mapRow?.["Building Code"] || "").toString().trim();

    // Prefer decision UID, else existing, else map UID (preserve original casing)
    const resolvedUidRaw = decisionUidRaw || uidExistingRaw || mapUidRaw;
    if (resolvedUidRaw) {
      f.properties["UniqueID"] = resolvedUidRaw;
    }

    // Backfill coordinates from Map_Export if missing
    const needsCoords =
      !f.geometry ||
      !Array.isArray(f.geometry.coordinates) ||
      f.geometry.coordinates.some(c => c === null || Number.isNaN(c));
    const lat = parseFloat(mapRow?.["Latitude"]);
    const lon = parseFloat(mapRow?.["Longitude"]);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);
    if (needsCoords && hasCoords) {
      f.geometry = { type: "Point", coordinates: [lon, lat] };
      f.properties["Latitude"] = lat;
      f.properties["Longitude"] = lon;
    }

    f.properties["Decision Type"] = decisionMap.get(name) || "Unknown";
    f.properties["Building Quality"] = buildingQualityMap.get(name) || 0;
    // Normalize utilization to a ratio (0..1+) when possible.
    const utilRaw = utilizationMap.get(name);
    const utilNorm = Number.isFinite(utilRaw) ? normalizeUtilizationValue(utilRaw) : null;
    const capDetails = activeCapacityDetailsMap.get(name);
    f.properties["Utilization"] = utilNorm;
    f.properties["Capacity"] =
      (capDetails && Number.isFinite(capDetails.value)) ? capDetails.value : null;
    f.properties["_CapacitySource"] = capDetails ? capDetails.source : (window.getCapacitySource ? window.getCapacitySource() : "capacity");
    f.properties["_CapacitySourceLabel"] = capDetails ? capDetails.label : (window.getCapacitySourceLabel ? window.getCapacitySourceLabel() : "Capacity");
    f.properties["_EducationalCapacityMissing"] = capDetails && capDetails.missingEducational ? "1" : "0";
    f.properties["_EducationalCapacityNote"] = capDetails && capDetails.note ? capDetails.note : "";
    f.properties["_RawCapacity"] = capacityMap.get(name) || null;
    f.properties["EducationalCapacity"] = educationalCapacityMap.get(name) ?? null;
    f.properties["Available Seats"] = availableSeatsMap.get(name) || 0;
    const enrollmentVal = enrollmentMap.get(name);
    if (Number.isFinite(enrollmentVal)) {
      f.properties["Enrollment"] = enrollmentVal;
    }
    const totalEnr = totalEnrollmentMap.get(name);
    const pkEnr = pkEnrollmentMap.get(name);
    if (Number.isFinite(totalEnr)) f.properties["_TotalEnrollment"] = totalEnr;
    if (Number.isFinite(pkEnr)) f.properties["_PKEnrollment"] = pkEnr;
    f.properties["School Level"] = schoolLevelMap.get(name) || "Unknown";
    f.properties["flow"] = flowMap.get(name) || f.properties["flow"] || 0;
    f.properties["DistanceToWelcoming"] = distanceWelcomingMap.get(name) || null;

    // Inclusion + status
    // During slider updates we only want to recompute decisions/flows, not which schools
    // are considered closed or non-eval. Those flags come from the full export + Map_Export
    // merge and must remain stable unless the user toggles filters.
    const updateInclusionStatus = options.updateInclusionStatus !== false;
    // Preserve original include flag; only override when we have real data.
    if (updateInclusionStatus) {
      if (f.properties._includeFlowChartBase === undefined) {
        f.properties._includeFlowChartBase = (f.properties["includeFlowChart"] || "").toString().trim().toLowerCase();
      }

      const includeVal =
        includeFlowMap.get(name) ??
        (decisionAllByName.get(name)?.Include_Flow_Chart ?? decisionAllByName.get(name)?.["Include_Flow_Chart"]) ??
        (decisionAllById.get(normalizeId(f.properties["UniqueID"]))?.Include_Flow_Chart ?? decisionAllById.get(normalizeId(f.properties["UniqueID"]))?.["Include_Flow_Chart"]);

      const yesVals = new Set(["yes", "y", "true", "1"]);
      const noVals = new Set(["no", "n", "false", "0"]);
      const candidate = (includeVal ?? "").toString().trim().toLowerCase();
      const hasExplicitInclude = !!candidate;
      if (hasExplicitInclude) {
        let includeNorm = "no"; // default exclude unless explicitly yes
        if (yesVals.has(candidate)) includeNorm = "yes";
        else if (noVals.has(candidate)) includeNorm = "no";
        else includeNorm = "no";
        f.properties["includeFlowChart"] = includeNorm;
        f.properties["isNonEval"] = includeNorm !== "yes";
      } else {
        // If no include flag is available, do not overwrite.
        const existingInclude = (f.properties["includeFlowChart"] ?? f.properties._includeFlowChartBase ?? "").toString().trim().toLowerCase();
        if (existingInclude) {
          f.properties["includeFlowChart"] = existingInclude;
          f.properties["isNonEval"] = existingInclude !== "yes";
        }
      }

      const statusValDecision =
        statusMap.get(name) ||
        (decisionAllByName.get(name)?.Status ?? decisionAllByName.get(name)?.["Status"]) ||
        (decisionAllById.get(normalizeId(f.properties["UniqueID"]))?.Status ?? decisionAllById.get(normalizeId(f.properties["UniqueID"]))?.["Status"]) ||
        "";
      const statusExisting = f.properties["status"] || "";
      const statusVal = statusValDecision || statusExisting || "";
      const statusNorm = statusVal.toString().trim().toLowerCase();
      if (statusVal) {
        f.properties["status"] = statusVal;
      }
      f.properties["isClosed"] =
        f.properties.isClosed === true ||
        f.properties["isClosed"] === true ||
        statusNorm === "no" ||
        statusNorm.includes("closed");
    }

    const utilNum = Number.isFinite(utilNorm) ? utilNorm : 0;
    f.properties["utilPieBucket"] = utilizationBucket(utilNum);
  });
  
  // Log sample GeoJSON features to verify flow was injected
  const sampleFeatures = geojson.features.slice(0, 3).map(f => ({
    name: f.properties["Building Name"],
    decision: f.properties["Decision Type"],
    flow: f.properties["flow"]
  }));
  console.log("🗺️ Sample GeoJSON features after injection:", sampleFeatures);
}

function initializeDropdownFilters(schoolData) {
  const allSchoolData = schoolData;
  const decisionFilter = document.getElementById("decisionFilter");
  const schoolSelect = document.getElementById("schoolSelect");

  if (!decisionFilter || !schoolSelect) {
    console.warn("⚠️ Missing #decisionFilter or #schoolSelect element.");
    return;
  }

  const uniqueDecisions = [...new Set(
    allSchoolData.map(row => row.decision || "Unknown")
  )].sort();

  decisionFilter.innerHTML = '<option value="">-- All Decisions --</option>';
  uniqueDecisions.forEach(decision => {
    const option = document.createElement("option");
    option.value = decision;
    option.textContent = decision;
    decisionFilter.appendChild(option);
  });

  function updateSchoolSelect(filterDecision = "") {
    schoolSelect.innerHTML = '<option value="">-- Select --</option>';
    
    // Filter schools based on decision if specified
    const filteredSchools = allSchoolData.filter(row => {
      return !filterDecision || row.decision === filterDecision;
    });
    
    // Sort schools alphabetically by name
    const sortedSchools = filteredSchools
      .map(row => row["Building Name"])
      .filter(name => name) // Remove any null/undefined names
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    
    sortedSchools.forEach(schoolName => {
      const option = document.createElement("option");
      option.value = schoolName;
      option.textContent = mainDisplaySchoolName(schoolName);
      schoolSelect.appendChild(option);
    });
  }

  updateSchoolSelect(); // Populate with all schools initially

  decisionFilter.addEventListener("change", () => {
    const selectedDecision = decisionFilter.value;
    updateSchoolSelect(selectedDecision);
    console.log("🎯 Updated school list for decision:", selectedDecision);
  });

  // Expose globally so it can be called after slider changes
  window.updateSchoolSelect = updateSchoolSelect;
  
  // Function to update flowchart dropdown with filtered data
  window.updateFlowchartDropdown = function() {
    const flowchartSchoolSelect = document.getElementById('mainFlowchartSchoolSelect');
    if (!flowchartSchoolSelect || !window.decisionLogic || !window.decisionLogic.schoolData) {
      return;
    }
    
    console.log("🔄 Updating flowchart dropdown with filtered data");
    flowchartSchoolSelect.innerHTML = '<option value="">-- Select School --</option>';
    
    const sortedSchools = window.decisionLogic.schoolData
      .map(row => row["Building Name"])
      .filter(name => name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    
    sortedSchools.forEach(schoolName => {
      const option = document.createElement('option');
      option.value = schoolName;
      option.textContent = mainDisplaySchoolName(schoolName);
      flowchartSchoolSelect.appendChild(option);
    });
    
    console.log(`📊 Flowchart dropdown updated: ${sortedSchools.length} schools included`);
  };
}

// Strategic sorting: sync #schoolSelect with the map "selected-school" highlight (legacy assignment / isochrone UI removed).
document.addEventListener('DOMContentLoaded', function() {
  (function setupCollapsibleLegend() {
    const legend = document.getElementById('map-legend');
    const toggle = document.getElementById('legend-toggle');
    if (!legend || !toggle) {
      return;
    }

    const chevron = toggle.querySelector('span.chevron');
    if (chevron) {
      chevron.textContent = '▸';
    }

    toggle.addEventListener('click', () => {
      legend.classList.toggle('legend-collapsed');
    });
  })();

  const select = document.getElementById('schoolSelect');
  if (!select) return;

  select.addEventListener('change', function () {
    const selectedSchoolName = this.value;
    const data = window.geojsonData;
    if (!data || !Array.isArray(data.features) || !map || typeof map.getSource !== 'function') return;

    const selectedFeature = data.features.find(
      (f) => normalize(f.properties['Building Name']) === normalize(selectedSchoolName)
    );

    const highlightSource = map.getSource('selected-school');
    if (!highlightSource) return;

    if (selectedFeature) {
      highlightSource.setData({
        type: 'FeatureCollection',
        features: [selectedFeature]
      });
    } else {
      highlightSource.setData({
        type: 'FeatureCollection',
        features: []
      });
    }
  });
});

// showOnMapFromFlowchart remains available via global search and other callers.

// ✅ New script to connect sidebar sliders to the DecisionLogic iframe - REPLACED
document.addEventListener("DOMContentLoaded", function() {
    try { upgradeToSleekSingleRange(document.getElementById('decision-sliders')); } catch (_) {}
    const sliderIds = [
      "utilSlider", "utilHighSlider", "growthSlider",
      "buildSlider", "buildAboveSlider", "buildBelowSlider", "buildFlow4Slider", "progSlider", "progFlow3Slider",
      "attendanceAreaEnrollmentSlider",
      "elementaryEnrollmentSlider", "k8EnrollmentSlider", "middleEnrollmentSlider", 
      "highEnrollmentSlider", "k12EnrollmentSlider",
      "elementaryDistanceSlider", "k8DistanceSlider", "middleDistanceSlider", 
      "highDistanceSlider", "k12DistanceSlider"
    ];

    const sliders = sliderIds.map(id => document.getElementById(id));
    
    console.log("🔍 Found sliders:", sliderIds.map((id, i) => ({ id, found: !!sliders[i] })));

    function sendSliderData() {
      console.log("📊 sendSliderData called");
      const thresholds = {
        utilization: parseFloat(document.getElementById("utilSlider").value)/100,
        utilizationHigh: parseFloat(document.getElementById("utilHighSlider").value)/100,
        enrollmentGrowth: parseFloat(document.getElementById("growthSlider").value)/100,
        distanceUnderutilized: window.thresholds?.distanceUnderutilized ?? window.decisionLogic?.thresholds?.distanceUnderutilized ?? 3.5,
        siteCapacity: "Yes", // Default value - dropdown removed
        buildingThreshold: parseFloat(document.getElementById("buildSlider").value),
        buildingThresholdAbove: parseFloat(document.getElementById("buildAboveSlider").value),
        buildingThresholdBelow: parseFloat(document.getElementById("buildBelowSlider").value),
        buildingThresholdFlow4: parseFloat(document.getElementById("buildFlow4Slider").value),
        adequateProgramsMin: parseInt(document.getElementById("progSlider").value, 10),
        adequateProgramsMinFlow3: (() => {
          const f3 = document.getElementById("progFlow3Slider");
          if (f3 && f3.value != null && f3.value !== "") return parseInt(f3.value, 10);
          const p = document.getElementById("progSlider");
          if (p && p.value != null && p.value !== "") return parseInt(p.value, 10);
          return 80;
        })(),
        attendanceAreaEnrollment: parseInt(document.getElementById("attendanceAreaEnrollmentSlider").value, 10),
        // Enrollment thresholds by school level
        elementaryEnrollment: parseInt(document.getElementById("elementaryEnrollmentSlider").value, 10),
        k8Enrollment: parseInt(document.getElementById("k8EnrollmentSlider").value, 10),
        middleEnrollment: parseInt(document.getElementById("middleEnrollmentSlider").value, 10),
        highEnrollment: parseInt(document.getElementById("highEnrollmentSlider").value, 10),
        k12Enrollment: parseInt(document.getElementById("k12EnrollmentSlider").value, 10),
        // Distance thresholds by school level
        elementaryDistance: parseFloat(document.getElementById("elementaryDistanceSlider").value),
        k8Distance: parseFloat(document.getElementById("k8DistanceSlider").value),
        middleDistance: parseFloat(document.getElementById("middleDistanceSlider").value),
        highDistance: parseFloat(document.getElementById("highDistanceSlider").value),
        k12Distance: parseFloat(document.getElementById("k12DistanceSlider").value),
      };
      
      console.log("📊 New thresholds:", thresholds);
      
      // Store thresholds globally for flowchart access
      window.thresholds = thresholds;

      // Persist so school-profile can match dashboard decisions
      try {
        window.localStorage && window.localStorage.setItem("jeffco_thresholds_v1", JSON.stringify(thresholds));
      } catch (e) {
        // ignore
      }
      
      if (window.decisionLogic) {
        window.decisionLogic.updateThresholds(thresholds);
        const updatedSchoolData = window.decisionLogic.schoolData;
        
        if (geojsonData && map.getSource('schools')) {
          // Slider updates should not change which schools are considered closed/non-eval.
          injectDecisionsIntoGeoJSON(geojsonData, updatedSchoolData, { updateInclusionStatus: false });
          // Keep base copy in sync with latest decisions for future filtering
          originalGeojsonData = JSON.parse(JSON.stringify(geojsonData));
          // Reapply current map filters instead of resetting to full data
          updateLayer();
          updateLegend();
        }
        // Update scenario modeling table/lists if present
        if (typeof window.updateScenarioOptionsVisibility === 'function') {
          window.updateScenarioOptionsVisibility();
        }
        // Update school select dropdown live as decision types change
        const decisionFilter = document.getElementById('decisionFilter');
        if (typeof window.updateSchoolSelect === 'function' && decisionFilter) {
          window.updateSchoolSelect(decisionFilter.value);
        }
      } else {
        console.warn("⚠️ DecisionLogic not ready, cannot send slider data.");
      }

      window.sendSliderData = sendSliderData;

      // ✅ Update flowchart node labels with new threshold values
      if (typeof window.FlowUtils !== 'undefined' && typeof window.FlowUtils.updateNodeLabels === 'function') {
        console.log("🔄 Updating flowchart node labels with new thresholds");
        window.FlowUtils.updateNodeLabels();
      } else {
        console.warn("⚠️ FlowUtils.updateNodeLabels not available");
      }
      
      // ✅ Update prioritization UI when decisions change
      if (typeof window.prioritizationUI !== 'undefined' && typeof window.prioritizationUI.refresh === 'function') {
        console.log("🔄 Refreshing prioritization UI with updated decisions");
        const schoolDataWithDecisions = window.decisionLogic.schoolData.map(row => ({
          ...row,
          decision: row.decision || row["Decision Type"]
        }));
        window.prioritizationUI.refresh(schoolDataWithDecisions);
      }

      // ✅ Determine the currently selected school for flow/impact updates.
      const flowchartSelect = document.getElementById('mainFlowchartSchoolSelect');
      const selectedSchoolForFlow =
        (flowchartSelect && flowchartSelect.value) ||
        window.currentSelectedSchoolName ||
        "";

      console.log("🔍 Flowchart select element:", flowchartSelect);
      console.log("🔍 updateFlowForSchool function available:", typeof window.updateFlowForSchool === 'function');
      console.log("🔍 Selected school for flow updates:", selectedSchoolForFlow || "(none)");

      // Keep the map dropdown in sync with the chosen flow school (even on first load)
      if (selectedSchoolForFlow) {
        try {
          const mapSelect = document.getElementById('mapOriginSchoolSelect');
          if (mapSelect) {
            const norm = (s) => (s || "").toString().trim().toLowerCase();
            // Resolve originId from decisionLogic if available
            let originId = "";
            if (window.decisionLogic && Array.isArray(window.decisionLogic.schoolData)) {
              const row = window.decisionLogic.schoolData.find(r => norm(r["Building Name"]) === norm(selectedSchoolForFlow));
              if (row) {
                originId = (
                  row.UniqueID ||
                  row["UniqueID"] ||
                  row["Unique Id"] ||
                  ""
                ).toString().trim();
              }
            }
            // Ensure an option exists
            if (originId) {
              let hasIdOption = Array.from(mapSelect.options || []).some(opt => opt.value === originId);
              if (!hasIdOption) {
                const opt = document.createElement('option');
                opt.value = originId;
                opt.textContent = selectedSchoolForFlow;
                mapSelect.appendChild(opt);
              }
              mapSelect.value = originId;
            } else {
              let match = Array.from(mapSelect.options || []).find(
                opt => norm(opt.textContent) === norm(selectedSchoolForFlow) || norm(opt.value) === norm(selectedSchoolForFlow)
              );
              if (!match) {
                const opt = document.createElement('option');
                opt.value = selectedSchoolForFlow;
                opt.textContent = selectedSchoolForFlow;
                mapSelect.appendChild(opt);
                match = opt;
              }
              mapSelect.value = match.value;
            }
            Array.from(mapSelect.options || []).forEach(opt => {
              opt.selected = opt.value === mapSelect.value;
            });
            window.currentOriginId = mapSelect.value;
            window.currentOriginName = selectedSchoolForFlow;
          }
        } catch (syncErr) {
          console.warn("⚠️ Unable to sync mapOriginSchoolSelect during flow update:", syncErr);
        }
      }

      // If we have a remembered selection but the dropdown is empty (for
      // example, when the user selected via the map before visiting the
      // flowchart), try to sync the dropdown UI to that selection.
      if (
        selectedSchoolForFlow &&
        flowchartSelect &&
        !flowchartSelect.value
      ) {
        const hasOption = Array.from(flowchartSelect.options || []).some(
          opt => opt.value === selectedSchoolForFlow
        );
        if (hasOption) {
          flowchartSelect.value = selectedSchoolForFlow;
          console.log("🎯 Synchronized flowchart dropdown to remembered school:", selectedSchoolForFlow);
        } else {
          console.warn("⚠️ Remembered school not found in flowchart dropdown options:", selectedSchoolForFlow);
        }
      }

      // ✅ Update flowchart path for the selected school
      if (selectedSchoolForFlow && typeof window.updateFlowForSchool === 'function') {
        console.log("🔄 Updating flowchart path for school:", selectedSchoolForFlow);
        window.updateFlowForSchool(selectedSchoolForFlow, thresholds);
      } else {
        console.log("🔍 No school available for flowchart path update");
      }

      // Refresh School Matches list + map filter when distance sliders change
      const originIdForMatches = (window.currentOriginId || '').toString().trim();
      if (originIdForMatches) {
        refreshNearbySchoolMatchesUi(originIdForMatches, window.currentOriginName || '');
      }
    }

    sliders.forEach(slider => {
      if (slider) {
        console.log("✅ Adding event listener to slider:", slider.id);
        // Use 'input' for range sliders
        const eventType = "input";
        slider.addEventListener(eventType, () => {
          console.log("🎛️ Slider changed:", slider.id, "value:", slider.value);
          const outSpan = document.getElementById(slider.id.replace("Slider", "Out"));
          if (outSpan) {
            // Format percentage sliders
            if (
              slider.id === "attendanceAreaEnrollmentSlider" ||
              slider.id === "progSlider" ||
              slider.id === "progFlow3Slider"
            ) {
              outSpan.textContent = slider.value;
            } else {
              outSpan.textContent = slider.value;
            }
          }
          sendSliderData(); // Call the main update function
        });
      } else {
        console.warn("⚠️ Slider not found:", sliderIds[sliders.indexOf(slider)]);
      }
    });

    // Flow 4: Closure/Consolidation distance sliders — update flowchart F4_DIST node when these change
    const flow4DistanceSliderIds = [
      "elementaryDistanceSliderFlow4", "k8DistanceSliderFlow4", "middleDistanceSliderFlow4",
      "highDistanceSliderFlow4", "k12DistanceSliderFlow4"
    ];
    flow4DistanceSliderIds.forEach(function (id) {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("input", function () {
          const outId = id.replace("Slider", "Out");
          const outSpan = document.getElementById(outId);
          if (outSpan) outSpan.textContent = el.value;
          if (typeof window.FlowUtils !== "undefined" && typeof window.FlowUtils.updateNodeLabels === "function") {
            window.FlowUtils.updateNodeLabels();
          }
        });
      }
    });

    function syncPKToggleFromStorage() {
      const inc = window.getIncludePKInEnrollment && window.getIncludePKInEnrollment();
      [document.getElementById("includePKInEnrollmentToggle"), document.getElementById("step1IncludePKToggle"), document.getElementById("toggleIncludePKInUtilization")].forEach(el => {
        if (el) el.checked = !!inc;
      });
      // Sync flowchart PK checkbox if it exists (dynamically created when school selected)
      const flowchartPkCb = document.getElementById("flowchartIncludePKUtilization");
      if (flowchartPkCb) flowchartPkCb.checked = !!inc;
    }
    window.syncPKToggleFromStorage = syncPKToggleFromStorage;

    const DECISION_FLOW_ROOT_SELECTORS = {
      1: 'details.flow-root-flow1',
      2: 'details.flow-root-flow2',
      3: 'details.flow-root-flow3',
      4: 'details.flow-root-flow4',
    };

    function updateDecisionSliderOutput(slider) {
      if (!slider || !slider.id) return;
      const outSpan = document.getElementById(slider.id.replace('Slider', 'Out'));
      if (outSpan) outSpan.textContent = slider.value;
    }

    function resetDecisionSliderElement(slider) {
      if (!slider) return;
      slider.value = slider.defaultValue;
      updateDecisionSliderOutput(slider);
    }

    function resetDecisionFlow1PKToggle() {
      if (window.setIncludePKInEnrollment) window.setIncludePKInEnrollment(false);
      [
        document.getElementById('includePKInEnrollmentToggle'),
        document.getElementById('step1IncludePKToggle'),
        document.getElementById('toggleIncludePKInUtilization'),
      ].forEach(el => {
        if (el) el.checked = false;
      });
      const flowchartPkCb = document.getElementById('flowchartIncludePKUtilization');
      if (flowchartPkCb) flowchartPkCb.checked = false;
    }

    function resetDecisionFlowSliders(flowNum, options = {}) {
      const selector = DECISION_FLOW_ROOT_SELECTORS[flowNum];
      if (!selector) return;
      const root = document.querySelector(`#decision-sliders ${selector}`);
      if (!root) return;
      root.querySelectorAll('input[type="range"]').forEach(resetDecisionSliderElement);
      if (flowNum === 1) resetDecisionFlow1PKToggle();
      if (options.triggerUpdate !== false) {
        sendSliderData();
        if (typeof window.step1Rerender === 'function') window.step1Rerender();
      }
    }

    function resetAllDecisionFlowSliders() {
      [1, 2, 3, 4].forEach(n => resetDecisionFlowSliders(n, { triggerUpdate: false }));
      sendSliderData();
      if (typeof window.step1Rerender === 'function') window.step1Rerender();
    }

    window.resetDecisionFlowSliders = resetDecisionFlowSliders;
    window.resetAllDecisionFlowSliders = resetAllDecisionFlowSliders;

    document.querySelectorAll('[data-decision-flow-reset]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const flowNum = parseInt(btn.getAttribute('data-decision-flow-reset'), 10);
        if (!Number.isNaN(flowNum)) resetDecisionFlowSliders(flowNum);
      });
    });

    const resetAllDecisionSlidersBtn = document.getElementById('resetAllDecisionSlidersBtn');
    if (resetAllDecisionSlidersBtn) {
      resetAllDecisionSlidersBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        resetAllDecisionFlowSliders();
      });
    }

    const resetAllPrioritizationWeightsBtn = document.getElementById('resetAllPrioritizationWeightsBtn');
    if (resetAllPrioritizationWeightsBtn && !resetAllPrioritizationWeightsBtn.dataset.prioritizationResetWired) {
      resetAllPrioritizationWeightsBtn.dataset.prioritizationResetWired = '1';
      resetAllPrioritizationWeightsBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        if (window.prioritizationUI && typeof window.prioritizationUI.resetToDefaults === 'function') {
          window.prioritizationUI.resetToDefaults();
        }
      });
    }

    function onPKToggleChange(checked) {
      if (window.setIncludePKInEnrollment) window.setIncludePKInEnrollment(checked);
      syncPKToggleFromStorage();
      sendSliderData();
      if (typeof window.step1Rerender === "function") window.step1Rerender();
    }
    function syncCapacityToggleFromStorage() {
      const useEducational = (window.getCapacitySource && window.getCapacitySource()) === "educational";
      [
        document.getElementById("toggleUseEducationalCapacity"),
        document.getElementById("step1UseEducationalCapacityToggle"),
        document.getElementById("flowchartUseEducationalCapacity")
      ].forEach(el => {
        if (el) el.checked = !!useEducational;
      });
    }
    window.syncCapacityToggleFromStorage = syncCapacityToggleFromStorage;
    function onCapacityToggleChange(checked) {
      if (window.setCapacitySource) window.setCapacitySource(checked ? "educational" : "capacity");
      syncCapacityToggleFromStorage();
      if (typeof window.resyncSeatsSliderFromDecisionData === "function") {
        window.resyncSeatsSliderFromDecisionData({ force: true });
      }
      sendSliderData();
      if (typeof window.step1Rerender === "function") window.step1Rerender();
      if (typeof window.updateFlowchartSchoolInfo === "function") {
        const selected = document.getElementById("mainFlowchartSchoolSelect");
        if (selected && selected.value) window.updateFlowchartSchoolInfo(selected.value);
      }
    }
    syncPKToggleFromStorage();
    syncCapacityToggleFromStorage();
    ["includePKInEnrollmentToggle", "step1IncludePKToggle", "toggleIncludePKInUtilization"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", () => onPKToggleChange(el.checked));
    });
    ["toggleUseEducationalCapacity", "step1UseEducationalCapacityToggle"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", () => onCapacityToggleChange(el.checked));
    });

    // Set initial values on load
    if (sliders.every(s => s)) {
      // Initialize output display values
      sliders.forEach(slider => {
        const outSpan = document.getElementById(slider.id.replace("Slider", "Out"));
        if (outSpan) outSpan.textContent = slider.value;
      });
      
      sendSliderData();
      
      // Force refresh flowchart after a short delay to ensure everything is loaded
      setTimeout(() => {
        console.log("🔄 Force refreshing flowchart with current slider values");
        sendSliderData();
      }, 1000);
    }
});

// --- ONBOARDING WALKTHROUGH LOGIC ---
let isSettingUpPath = false; // Flag to track if we're setting up a specific path

const TOUR_DISMISS_STORAGE_KEY = 'jeffcoTourDismissed';

function startOnboardingWalkthrough(options = {}) {
  const requestedStartAt = (options && options.startAt) ? String(options.startAt) : '';
  const forceTour = !!(options && options.force);
  if (!forceTour && localStorage.getItem(TOUR_DISMISS_STORAGE_KEY) === '1') {
    return;
  }
  // If a tour is already running, end it first (prevents duplicate listeners/overlays)
  if (window.__onboardingTourCleanup && typeof window.__onboardingTourCleanup === 'function') {
    try { window.__onboardingTourCleanup(); } catch (e) {}
    window.__onboardingTourCleanup = null;
  }

  // Close all major details sections before starting the tour
  const detailsIds = [
    'decision-input-panel',
    'scenario-input-panel',
    'decision-output-panel',
    'scenario-output-panel',
    'summary-table-details',
    'decision-by-school-details'
  ];
  detailsIds.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.tagName === 'DETAILS') el.open = false;
  });

  const steps = [
    {
      target: 'body',
      title: 'Welcome to the Jeffco Facility Planning Dashboard',
      text:
        'This dashboard helps Jeffco explore facility planning options by combining school-level indicators, a map view, and decision logic into a single workflow.' +
        ' Use the <strong>Menu</strong> (hamburger icon or the step badge in the top bar) to move between steps.' +
        '<ul style="margin:8px 0 8px 18px; padding:0;">' +
          '<li><strong>Step 1 – School-level Data</strong>: Pick a school to see building and enrollment details, or compare several schools side-by-side.</li>' +
          '<li><strong>Step 2 – Map</strong>: Explore patterns on the map.</li>' +
          '<li><strong>Step 3 – Sort by Strategic Decision</strong>: Adjust thresholds in the <strong>controls column</strong> (left); outcomes appear in <strong>results tables</strong> (bottom). Toggle Map / Flowchart under <strong>Page View</strong> in the menu.</li>' +
          '<li><strong>Step 4 – Prioritization</strong>: Set weights in the controls column; review ranked lists in the bottom tables.</li>' +
        '</ul>' +
        'You can jump to a specific module at any time using the dropdown, or run the full tour.',
      isIntro: true
    },
    {
      target: '#topBarStepIndicator',
      title: 'Current step (top bar)',
      text:
        'The numbered badge and title show which step you are on. Click this control anytime to open the <strong>Menu</strong> — the same as the hamburger icon on the right.',
      ensureMenuClosed: true,
      ensureProcessStep: 1
    },
    {
      target: '#sidebarToggle',
      title: 'Menu (important)',
      text:
        'Click the hamburger icon to open the dashboard menu. Under <strong>Navigation</strong>, choose Steps 1–4 to jump between modules. On Steps 3–4, the <strong>Page View</strong> section lets you switch Map / Flowchart and show or hide <strong>Controls</strong> and <strong>Results</strong>. You can also start this tour again from <strong>Help &amp; Data</strong>.',
      ensureMenuClosed: true
    },
    {
      target: '.menu-nav-step-list',
      tourKey: 'navigation',
      title: 'Navigation (Steps 1–4)',
      text:
        '<strong>Highlighted in yellow:</strong> the <strong>Navigation</strong> list. Each row is a workflow step — title, short summary, and step number. Click a row to go to that step; the menu closes automatically.',
      openMenu: true,
      ensureProcessStep: 1
    },
    {
      target: '#step1SchoolSelect',
      tourKey: 'step1',
      title: 'Focusing on: School picker (Step 1)',
      text:
        '<strong>Highlighted in yellow:</strong> the <strong>School</strong> dropdown at the top of Step 1. ' +
        'Choose a school to load its profile — you will see building facts, enrollment KPIs, and utilization bars for that school.',
      ensureProcessStep: 1,
      ensureMenuClosed: true
    },
    {
      target: '#step1SingleSection',
      title: 'Focusing on: School details (Step 1)',
      text:
        '<strong>Highlighted in yellow:</strong> the detail panels for the school you selected. ' +
        '<strong>Building Information</strong> lists square footage, age, and condition-style metrics; <strong>Enrollment</strong> shows counts, capacity, utilization, and available seats. ' +
        'Use <strong>Include PK</strong> or <strong>Use Educational Capacity</strong> above to change how enrollment metrics are calculated.',
      ensureProcessStep: 1,
      ensureMenuClosed: true,
      ensureStep1SchoolSelected: true,
      ensureStep1CompareOff: true
    },
    {
      target: '#step1CompareControls',
      title: 'Focusing on: Compare Selected Schools (Step 1)',
      text:
        '<strong>Highlighted in yellow:</strong> the <strong>Compare Selected Schools</strong> controls. ' +
        'Turn on the checkbox to switch from a single-school view to side-by-side cards. ' +
        'Pick extra schools in the rows that appear, use <strong>+</strong> for more slots, or choose an <strong>Articulation area</strong> at the top to load all schools in that area at once.',
      ensureProcessStep: 1,
      ensureMenuClosed: true,
      ensureStep1SchoolSelected: true,
      ensureStep1CompareOff: true
    },
    {
      target: '#step1CompareGrid',
      title: 'Focusing on: Side-by-side comparison (Step 1)',
      text:
        '<strong>Highlighted in yellow:</strong> the comparison cards. Each column is a school with the same metrics aligned so you can spot differences quickly. ' +
        'Adjust <strong>Card width</strong> or <strong>Fit all in view</strong> when comparing many schools. Turn off <strong>Compare Selected Schools</strong> to return to the single-school detail view.',
      ensureProcessStep: 1,
      ensureMenuClosed: true,
      ensureStep1SchoolSelected: true,
      ensureStep1CompareOn: true,
      ensureStep1CompareSamples: true
    },
    {
      target: '#map-container',
      tourKey: 'step2',
      title: 'Map View: Explore Schools',
      text: 'Use the map to pan/zoom and explore schools spatially. Clicking a school will surface its data and help you connect results to geography.',
      ensureProcessStep: 2,
      ensureMapView: true,
      ensureMenuClosed: true
    },
    {
      target: '#fitToSchoolsBtn',
      title: 'Fit to Schools',
      text: 'Click this button to zoom the map to show all schools.',
      ensureProcessStep: 2,
      ensureMapView: true,
      ensureMenuClosed: true
    },
    {
      target: '#menuPageViewSection',
      title: 'Page View (Steps 3–4)',
      text:
        '<strong>Highlighted in yellow:</strong> <strong>Page View</strong> — visible only on Steps 3 and 4. Use <strong>Map</strong> / <strong>Flowchart</strong> to change the center view, and the checkboxes below to show the <strong>controls column</strong> (left) and <strong>results tables</strong> (bottom).',
      openMenu: true,
      ensureProcessStep: 3
    },
    {
      target: '#toggleLeftSidebar',
      title: 'Focusing on: Controls switch (menu)',
      text:
        '<strong>Highlighted in yellow:</strong> the <strong>Controls</strong> checkbox under <strong>Page View</strong>. ' +
        'Turn it on or off to show the <strong>controls column</strong> docked on the left of the map. ' +
        'That column holds Strategic Sorting sliders and Prioritization weights — it stays in place on desktop (not a pop-out panel).',
      openMenu: true,
      ensureProcessStep: 3
    },
    {
      target: '#toggleRightSidebar',
      title: 'Focusing on: Results switch (menu)',
      text:
        '<strong>Highlighted in yellow:</strong> the <strong>Results</strong> checkbox under <strong>Page View</strong>. ' +
        'Turn it on or off to show the <strong>results tables</strong> along the bottom of the screen: Strategic Decision Summary, Decision by School, and Strategy Prioritization.',
      openMenu: true,
      ensureProcessStep: 3
    },
    {
      target: '#sidebar',
      title: 'Focusing on: Controls column (left)',
      text:
        '<strong>Highlighted in yellow:</strong> the full <strong>controls column</strong> on the left. ' +
        'This is separate from the menu switches you just saw — here you edit assumptions. Expand a section for sliders and help icons (?).',
      ensureProcessStep: 3,
      ensureMapView: true,
      ensureLeftSidebar: true,
      ensureMenuClosed: true
    },
    {
      target: '#decision-input-panel',
      tourKey: 'step3',
      title: 'Focusing on: Sort by Strategic Decision (controls)',
      text:
        '<strong>Highlighted in yellow:</strong> the <strong>Sort by Strategic Decision</strong> controls. ' +
        'Adjust threshold sliders to change strategy groups; the <strong>results tables</strong> at the bottom update as you move them.',
      ensureProcessStep: 3,
      ensureLeftSidebar: true
    },
    {
      target: '#bottom-tables-compact-bar',
      tourKey: 'showTables',
      title: 'Focusing on: Show tables strip (bottom)',
      text:
        '<strong>Highlighted in yellow:</strong> the thin strip with the <strong>Show tables</strong> button (results are collapsed to give the map more room). ' +
        'Click it to expand the tables again. Only this bottom area can <strong>Float</strong>; the controls column on the left does not.',
      ensureProcessStep: 3,
      ensureMapView: true,
      ensureBottomTablesCollapsed: true
    },
    {
      target: '.bottom-panel-tabs',
      title: 'Focusing on: Results table tabs (bottom)',
      text:
        '<strong>Highlighted in yellow:</strong> the tab bar for <strong>results tables</strong> at the bottom (not the controls column). ' +
        'On Steps 3–4: <strong>Strategic Decision Summary</strong> (counts by group), <strong>Decision by School</strong> (each school’s outcome), and on Step 4 <strong>Strategy Prioritization</strong> (ranked lists). ' +
        'Use <strong>Hide tables</strong> above the tabs to collapse back to the strip you saw on the previous step.',
      ensureProcessStep: 3,
      ensureBottomTablesExpanded: true
    },
    {
      target: '#menuShowFlowchart',
      tourKey: 'flowchart',
      title: 'Flowchart view',
      text:
        'On Steps 3–4, open the menu and under <strong>Page View</strong> click <strong>Flowchart</strong> to switch from the map to the decision flowchart. Click <strong>Map</strong> to return.',
      openMenu: true,
      ensureProcessStep: 3
    },
    {
      target: '#main-flowchart-container',
      title: 'Decision flowchart',
      text:
        'This diagram shows how a school moves through thresholds into strategy groups. ' +
        'Pick a school from the dropdown (next step) to highlight its path. Yellow nodes and links show which rules apply to that school.',
      ensureProcessStep: 3,
      ensureFlowchartView: true,
      ensureMenuClosed: true,
      highlightFlowchart: true
    },
    {
      target: '#mainFlowchartSchoolSelect',
      title: 'Select a School (Flowchart)',
      text:
        'Choose a school from this dropdown to render its decision flowchart and see which thresholds are “active” for that school. Use global search or the map to locate a school geographically.',
      ensureProcessStep: 3,
      ensureFlowchartView: true
    },
    {
      target: '#scenario-input-panel',
      tourKey: 'step4',
      title: 'Focusing on: Prioritization (controls column)',
      text:
        '<strong>Highlighted in yellow:</strong> the <strong>Prioritization</strong> section in the controls column (left). ' +
        'Choose a strategy group, then adjust weight sliders. Ranked output appears in the bottom results tables, not here.',
      ensureProcessStep: 4,
      ensureLeftSidebar: true
    },
    {
      target: '.bottom-panel-tab[data-bp-tab="impact-tab"]',
      title: 'Focusing on: Strategy Prioritization tab (bottom)',
      text:
        '<strong>Highlighted in yellow:</strong> the <strong>Strategy Prioritization</strong> tab in the bottom results tables. ' +
        'Here you see ranked schools for the group you picked in the controls column. Use the group tabs and values/scores toggle above the table.',
      ensureProcessStep: 4,
      ensureBottomTablesExpanded: true,
      activateImpactTab: true
    },
    {
      target: 'body',
      title: 'All set',
      text:
        'You’re ready to explore. Use the step badge or hamburger menu anytime to switch steps, and re-open <strong>How to Use | Start Tour</strong> under <strong>Help &amp; Data</strong> to run this walkthrough again.',
      ensureMenuClosed: true
    }
  ];

  let currentStep = 0;
  let overlay = null;
  let popup = null;
  let tourHighlights = [];
  let keyHandler = null;
  let resizeHandler = null;
  const body = document.body;
  const menu = document.getElementById('sidebarMenu');
  const leftToggle = document.getElementById('toggleLeftSidebar');
  const rightToggle = document.getElementById('toggleRightSidebar');

  function setSidebarVisibility({ left, right } = {}) {
    if (typeof left === 'boolean') {
      if (left) body.classList.remove('sidebar-collapsed');
      else body.classList.add('sidebar-collapsed');
      if (leftToggle) leftToggle.checked = left;
    }
    if (typeof right === 'boolean') {
      if (right) body.classList.remove('right-sidebar-collapsed');
      else body.classList.add('right-sidebar-collapsed');
      if (rightToggle) rightToggle.checked = right;
    }
    if (window.map && typeof window.map.resize === 'function') {
      setTimeout(() => window.map.resize(), 50);
    }
  }

  function openMenu() {
    if (typeof window.openSidebarMenu === 'function') window.openSidebarMenu();
    else if (menu) menu.style.display = 'block';
  }
  function closeMenu() {
    if (typeof window.closeSidebarMenu === 'function') window.closeSidebarMenu();
    else if (menu) menu.style.display = 'none';
  }

  const TOUR_Z = { overlay: 32000, highlight: 32001, popup: 32002 };
  const TOUR_Z_MENU = { overlay: 32000, highlight: 32002, popup: 32003 };
  let savedMenuZIndex = null;
  let savedResultsPanelZIndex = null;

  function isMenuTourStep(step) {
    if (!step) return false;
    const t = String(step.target || '');
    return (
      !!step.openMenu ||
      t === '#toggleLeftSidebar' ||
      t === '#toggleRightSidebar' ||
      t === '#menuShowFlowchart' ||
      t === '#menuShowMap' ||
      t === '#menuPageViewSection' ||
      t === '#topBarStepIndicator' ||
      t === '#sidebarToggle' ||
      t === '.menu-nav-step-list' ||
      /^#menuNavStep[1-4]$/.test(t)
    );
  }

  function boostMenuAboveTourOverlay() {
    const menuEl = document.getElementById('sidebarMenu');
    const backdrop = document.getElementById('sidebarMenuBackdrop');
    if (!menuEl || savedMenuZIndex) return;
    savedMenuZIndex = {
      menu: menuEl.style.zIndex,
      backdrop: backdrop ? backdrop.style.zIndex : '',
    };
    menuEl.style.zIndex = '32001';
    if (backdrop) backdrop.style.zIndex = '32000';
  }

  function restoreMenuZIndex() {
    if (!savedMenuZIndex) return;
    const menuEl = document.getElementById('sidebarMenu');
    const backdrop = document.getElementById('sidebarMenuBackdrop');
    if (menuEl) menuEl.style.zIndex = savedMenuZIndex.menu;
    if (backdrop) backdrop.style.zIndex = savedMenuZIndex.backdrop;
    savedMenuZIndex = null;
  }

  function isResultsTablesTourStep(step) {
    if (!step) return false;
    const t = String(step.target || '');
    return (
      step.tourKey === 'showTables' ||
      t === '#bottom-tables-compact-bar' ||
      t === '.bottom-panel-tabs' ||
      t === '#bottom-panel-tabs' ||
      t === '#bottom-tables-main' ||
      t === '#bottomTablesShowTablesBtn' ||
      t === '#bottomTablesHideDockedBtn' ||
      t === '#bottomTablesPopoutBtn' ||
      t.includes('bottom-panel-tab') ||
      !!step.ensureBottomTablesExpanded ||
      !!step.ensureBottomTablesCollapsed ||
      !!step.activateImpactTab
    );
  }

  function boostResultsPanelForTour() {
    /* Tour z-index is above all panels; no need to raise map-sidebar. */
  }

  function restoreResultsPanelZIndex() {
    if (!savedResultsPanelZIndex) return;
    const panel = document.getElementById('map-sidebar');
    if (panel) panel.style.zIndex = savedResultsPanelZIndex.panel;
    savedResultsPanelZIndex = null;
  }

  function resolveTourHighlightElement(target, step) {
    if (!target) return target;
    if (
      step.target === '#toggleLeftSidebar' ||
      step.target === '#toggleRightSidebar'
    ) {
      return target.closest('label') || target.parentElement || target;
    }
    if (step.target === '#menuPageViewSection' || step.target === '.menu-nav-step-list') {
      return target;
    }
    return target;
  }

  function tourZIndexForStep(step) {
    if (isMenuTourStep(step) || isResultsTablesTourStep(step)) return TOUR_Z_MENU;
    return TOUR_Z;
  }

  function ensureProcessStep(stepNum) {
    try {
      if (typeof window._goToStep === 'function') {
        window._goToStep(Number(stepNum));
      }
    } catch (e) {}
  }

  function ensureMapView() {
    if (typeof window.switchToMap === 'function') window.switchToMap();
  }
  function ensureFlowchartView() {
    if (typeof window.switchToFlowchart === 'function') window.switchToFlowchart();
  }

  function ensureBottomTablesExpanded() {
    setSidebarVisibility({ right: true });
    document.body.classList.add('bottom-tables-step34');
    if (document.body.classList.contains('bottom-tables-docked-collapsed')) {
      const btn = document.getElementById('bottomTablesShowTablesBtn');
      if (btn) btn.click();
      else document.body.classList.remove('bottom-tables-docked-collapsed');
    }
  }

  function ensureStep1SchoolSelected() {
    const select = document.getElementById('step1SchoolSelect');
    if (!select || select.options.length <= 1) return false;
    if (!select.value) {
      select.selectedIndex = 1;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (typeof window.step1Rerender === 'function') {
      window.step1Rerender();
    }
    return true;
  }

  function ensureStep1CompareMode(enabled) {
    const cb = document.getElementById('step1CompareMode');
    if (!cb) return;
    const want = !!enabled;
    if (cb.checked !== want) {
      cb.checked = want;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (typeof window.step1Rerender === 'function') {
      window.step1Rerender();
    }
  }

  function ensureStep1CompareSampleSchools() {
    const mainSelect = document.getElementById('step1SchoolSelect');
    const slotSelects = document.querySelectorAll(
      '#step1CompareSelectsList select.step1-compare-school-select'
    );
    if (!mainSelect || !slotSelects.length) return;
    const names = Array.from(mainSelect.options)
      .map((o) => o.value)
      .filter(Boolean);
    const primary = mainSelect.value;
    let pickIdx = 0;
    slotSelects.forEach((sel, slotIdx) => {
      while (pickIdx < names.length && names[pickIdx] === primary) pickIdx += 1;
      if (pickIdx >= names.length) pickIdx = 0;
      const name = names[(pickIdx + slotIdx) % names.length];
      if (name && name !== primary) sel.value = name;
      pickIdx += 1;
    });
    if (typeof window.step1Rerender === 'function') window.step1Rerender();
  }

  function ensureBottomTablesCollapsed() {
    setSidebarVisibility({ right: true });
    document.body.classList.add('bottom-tables-step34');
    if (document.body.classList.contains('bottom-tables-floating-open')) {
      document.body.classList.remove('bottom-tables-floating-open');
      const main = document.getElementById('bottom-tables-main');
      if (main) {
        main.classList.remove('bottom-tables-main--floating');
        main.style.width = '';
        main.style.height = '';
        main.style.left = '';
        main.style.top = '';
        main.style.right = '';
        main.style.bottom = '';
      }
    }
    if (!document.body.classList.contains('bottom-tables-docked-collapsed')) {
      const hideBtn = document.getElementById('bottomTablesHideDockedBtn');
      if (hideBtn && hideBtn.offsetParent !== null) hideBtn.click();
      else document.body.classList.add('bottom-tables-docked-collapsed');
    }
    try {
      if (window.map && typeof window.map.resize === 'function') {
        setTimeout(() => {
          try {
            window.map.resize();
          } catch {}
        }, 80);
      }
    } catch {}
  }

  /** Zoom flowchart content in for tour (fit, then boost scale so nodes are readable). */
  function zoomFlowchartForTour(done) {
    const finish = typeof done === 'function' ? done : () => {};
    if (typeof window.zoomFlowchartToFit === 'function') {
      window.zoomFlowchartToFit();
    }
    setTimeout(() => {
      try {
        const svg = d3.select('#main-flowchart-svg');
        const zb = window.flowchartZoomBehavior;
        if (zb && !svg.empty() && svg.node()) {
          const t = d3.zoomTransform(svg.node());
          if (t && isFinite(t.k) && t.k > 0) {
            const boosted = d3.zoomIdentity.translate(t.x, t.y).scale(Math.min(t.k * 1.45, 4.5));
            svg
              .transition()
              .duration(400)
              .call(zb.transform, boosted)
              .on('end', finish);
            return;
          }
        }
      } catch (e) { /* ignore */ }
      finish();
    }, 750);
  }

  function openDetailsPanel(selector) {
    const el = document.querySelector(selector);
    if (el && !el.open) {
      el.open = true;
      void el.offsetWidth;
    }
    return el;
  }

  function persistTourDismissPreference() {
    const cb = document.getElementById('tourDismissCheckbox');
    if (cb && cb.checked) {
      localStorage.setItem(TOUR_DISMISS_STORAGE_KEY, '1');
    }
  }

  // Build a stable index so "jump to module" doesn't depend on hard-coded step numbers.
  const stepIndexByKey = {};
  steps.forEach((s, idx) => {
    if (s && s.tourKey) stepIndexByKey[String(s.tourKey)] = idx;
  });

  function getCurrentModuleKey(stepIdx) {
    const hit = Object.entries(stepIndexByKey).find(([, idx]) => idx === stepIdx);
    return hit ? hit[0] : 'full';
  }

  function jumpToModule(key) {
    const k = String(key || 'full');
    if (k === 'full') {
      currentStep = 0;
      showStep(currentStep);
      return;
    }
    const idx = stepIndexByKey[k];
    if (typeof idx === 'number') {
      currentStep = idx;
      showStep(currentStep);
    }
  }

  function clearTourLayers() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    if (popup) {
      popup.remove();
      popup = null;
    }
    tourHighlights.forEach((el) => {
      try {
        el.remove();
      } catch (e) {}
    });
    tourHighlights = [];
  }

  function showStep(stepIdx) {
    // Remove previous overlay/popup/highlights
    clearTourLayers();

    const step = steps[stepIdx];
    
    // Menu + visibility preconditions
    if (step.openMenu) openMenu();
    if (step.ensureMenuClosed) closeMenu();
    if (step.ensureLeftSidebar) setSidebarVisibility({ left: true });
    if (step.ensureRightSidebar) setSidebarVisibility({ right: true });
    if (typeof step.ensureProcessStep === 'number') ensureProcessStep(step.ensureProcessStep);
    if (step.ensureMapView) ensureMapView();
    if (step.ensureFlowchartView) ensureFlowchartView();
    if (step.activateImpactTab) {
      const impactTab = document.querySelector('.bottom-panel-tab[data-bp-tab="impact-tab"]');
      if (impactTab) impactTab.click();
    }

    const finishShowStep = () => {
      let target = document.querySelector(step.target);
      // Open dropdown <details> if the step is for a details section
      const detailsIds = ['#decision-output-panel', '#scenario-output-panel'];
      if (detailsIds.includes(step.target) && target && target.tagName === 'DETAILS' && !target.open) {
        target.open = true;
      }

      drawStepHighlightAndPopup(target, step, stepIdx);
    };

    // For scenario/model output, wait for the section to open before highlighting
    const scenarioPanelTarget = document.querySelector(step.target);
    if ((step.target === '#scenario-input-panel' || step.target === '#scenario-output-panel') && scenarioPanelTarget) {
      scenarioPanelTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (step.target === '#scenario-input-panel') {
        const highlightTarget = document.getElementById('scenario-input-panel');
        const drawAfterScroll = () => {
          drawHighlight(highlightTarget, step);
          setTimeout(() => {
            drawPopup(highlightTarget, step, stepIdx);
          }, 60);
        };
        if (highlightTarget.tagName === 'DETAILS' && !highlightTarget.open) {
          highlightTarget.open = true;
          void highlightTarget.offsetWidth;
          setTimeout(drawAfterScroll, 600);
        } else {
          setTimeout(drawAfterScroll, 350);
        }
        return;
      }
      // For scenario output panel, highlight after open and scroll
      if (step.target === '#scenario-output-panel') {
        let highlightTarget = document.getElementById('scenario-output-panel');
        const drawAfterScroll = () => {
          drawHighlight(highlightTarget, step);
          setTimeout(() => {
            drawPopup(highlightTarget, step, stepIdx);
          }, 60);
        };
        if (!highlightTarget.open) {
          highlightTarget.open = true;
          void highlightTarget.offsetWidth; // Force reflow
          setTimeout(drawAfterScroll, 600); // Wait for open + scroll
        } else {
          setTimeout(drawAfterScroll, 350); // Wait for scroll
        }
        return;
      }
    }

    if (
      step.ensureStep1SchoolSelected ||
      step.ensureStep1CompareOn ||
      step.ensureStep1CompareOff ||
      step.ensureStep1CompareSamples
    ) {
      setTimeout(() => {
        if (step.ensureStep1SchoolSelected) ensureStep1SchoolSelected();
        if (step.ensureStep1CompareOff) ensureStep1CompareMode(false);
        else if (step.ensureStep1CompareOn) ensureStep1CompareMode(true);
        if (step.ensureStep1CompareSamples) ensureStep1CompareSampleSchools();
        void document.body.offsetWidth;
        setTimeout(finishShowStep, step.ensureStep1CompareOn ? 460 : 360);
      }, step.ensureProcessStep === 1 ? 420 : 300);
      return;
    }

    if (step.ensureBottomTablesCollapsed) {
      setTimeout(() => {
        ensureBottomTablesCollapsed();
        void document.body.offsetWidth;
        setTimeout(finishShowStep, 360);
      }, 300);
      return;
    }

    if (step.ensureBottomTablesExpanded) {
      setTimeout(() => {
        ensureBottomTablesExpanded();
        setTimeout(finishShowStep, 220);
      }, 280);
      return;
    }

    const leftPanelDetails =
      step.target === '#decision-input-panel' || step.target === '#scenario-input-panel';
    if (leftPanelDetails && step.ensureLeftSidebar) {
      openDetailsPanel(step.target);
      setTimeout(finishShowStep, 550);
      return;
    }

    if (step.target === '#sidebar' && step.ensureLeftSidebar) {
      setTimeout(finishShowStep, 520);
      return;
    }

    if (step.highlightFlowchart || (step.ensureFlowchartView && step.target === '#main-flowchart-container')) {
      setTimeout(() => {
        zoomFlowchartForTour(() => setTimeout(finishShowStep, 120));
      }, 560);
      return;
    }

    if (step.openMenu && isMenuTourStep(step)) {
      setTimeout(finishShowStep, 360);
      return;
    }

    if (step.ensureFlowchartView && step.target !== '#menuShowFlowchart') {
      setTimeout(finishShowStep, 480);
      return;
    }

    finishShowStep();
  }

  function drawStepHighlightAndPopup(target, step, stepIdx) {
    if (!target) {
      nextStep();
      return;
    }

    // Scroll target into view unless it's the intro body step
    if (!step.isIntro && step.target !== 'body') {
      try {
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      } catch (e) {}
    }

    drawHighlight(target, step);
    drawPopup(target, step, stepIdx);
  }

  // ---- Exit-anytime + resize safety helpers ----
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function popupBoxOverlapsTarget(popupBox, targetRect, gap = 12) {
    return !(
      popupBox.right + gap <= targetRect.left ||
      popupBox.left - gap >= targetRect.right ||
      popupBox.bottom + gap <= targetRect.top ||
      popupBox.top - gap >= targetRect.bottom
    );
  }

  function positionPopup(target, step) {
    if (!popup) return;
    const margin = 12;
    const gap = 16;
    const z = tourZIndexForStep(step);
    popup.style.zIndex = String(z.popup);

    // Ensure popup stays inside viewport even on small screens
    popup.style.maxHeight = `calc(100vh - ${margin * 2}px)`;
    popup.style.overflowY = 'auto';

    // Measure after DOM append
    const popupRect = popup.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;

    let desiredLeft = margin;
    let desiredTop = margin;

    if (step.isIntro || step.target === 'body') {
      desiredLeft = (vw - popupRect.width) / 2;
      desiredTop = Math.max(margin, Math.round(vh * 0.18));
    } else {
      const rect = target.getBoundingClientRect();
      const targetNearBottom = rect.top > vh * 0.55;
      const isBottomUiStep =
        isResultsTablesTourStep(step) ||
        step.target === '#map-sidebar' ||
        String(step.target || '').includes('bottom-');

      if (step.target === '#fitToSchoolsBtn') {
        desiredLeft = clamp(rect.left, margin, Math.max(margin, vw - popupRect.width - margin));
        desiredTop = rect.top - popupRect.height - gap;
        if (desiredTop < margin) {
          desiredTop = clamp(rect.bottom + gap, margin, Math.max(margin, vh - popupRect.height - margin));
        }
      } else if (step.target === '#step1CompareControls') {
        // Keep left-side compare controls visible: place card below (or above if needed)
        desiredLeft = clamp(rect.left, margin, Math.max(margin, vw - popupRect.width - margin));
        desiredTop = rect.bottom + gap;
        if (desiredTop + popupRect.height + margin > vh) {
          desiredTop = rect.top - popupRect.height - gap;
        }
      } else if (targetNearBottom || isBottomUiStep) {
        desiredLeft = margin;
        desiredTop = margin;
      } else {
        const candidates = [
          { left: rect.right + gap, top: rect.top },
          { left: rect.left, top: rect.bottom + gap },
          { left: rect.left, top: rect.top - popupRect.height - gap },
          { left: rect.left - popupRect.width - gap, top: rect.top },
          { left: margin, top: margin },
        ];
        let placed = false;
        for (const candidate of candidates) {
          const left = clamp(candidate.left, margin, Math.max(margin, vw - popupRect.width - margin));
          const top = clamp(candidate.top, margin, Math.max(margin, vh - popupRect.height - margin));
          const box = {
            left,
            top,
            right: left + popupRect.width,
            bottom: top + popupRect.height,
          };
          if (!popupBoxOverlapsTarget(box, rect, gap)) {
            desiredLeft = left;
            desiredTop = top;
            placed = true;
            break;
          }
        }
        if (!placed) {
          desiredLeft = clamp(rect.right + gap, margin, Math.max(margin, vw - popupRect.width - margin));
          desiredTop = clamp(rect.top, margin, Math.max(margin, vh - popupRect.height - margin));
        }
      }

      desiredLeft = clamp(desiredLeft, margin, Math.max(margin, vw - popupRect.width - margin));
      desiredTop = clamp(desiredTop, margin, Math.max(margin, vh - popupRect.height - margin));
    }

    popup.style.left = `${desiredLeft}px`;
    popup.style.top = `${desiredTop}px`;
    popup.style.right = '';
    popup.style.transform = '';
  }

  function createChoiceButton(icon, title, description, color, onClick) {
    const button = document.createElement('div');
    button.style.flex = '1';
    button.style.minWidth = '200px';
    button.style.maxWidth = '250px';
    button.style.height = '280px'; // Fixed height for all buttons
    button.style.padding = '30px 15px';
    button.style.border = `3px solid ${color}`;
    button.style.borderRadius = '12px';
    button.style.cursor = 'pointer';
    button.style.transition = 'all 0.3s ease';
    button.style.background = '#fff';
    button.style.display = 'flex';
    button.style.flexDirection = 'column';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center'; // Center content vertically
    button.style.gap = '15px';
    button.style.boxSizing = 'border-box'; // Include padding in height calculation

    // Hover effect
    button.addEventListener('mouseenter', () => {
      button.style.transform = 'translateY(-5px)';
      button.style.boxShadow = `0 8px 25px rgba(0,0,0,0.2)`;
      button.style.background = color;
      button.style.color = '#fff';
    });

    button.addEventListener('mouseleave', () => {
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = 'none';
      button.style.background = '#fff';
      button.style.color = '#333';
    });

    // Icon
    const iconEl = document.createElement('div');
    iconEl.textContent = icon;
    iconEl.style.fontSize = '48px';
    iconEl.style.marginBottom = '10px';
    button.appendChild(iconEl);

    // Title
    const titleEl = document.createElement('h3');
    titleEl.textContent = title;
    titleEl.style.margin = '0';
    titleEl.style.fontSize = '18px';
    titleEl.style.fontWeight = 'bold';
    titleEl.style.color = 'inherit';
    button.appendChild(titleEl);

    // Description
    const descEl = document.createElement('p');
    descEl.textContent = description;
    descEl.style.margin = '0';
    descEl.style.fontSize = '14px';
    descEl.style.lineHeight = '1.4';
    descEl.style.color = 'inherit';
    descEl.style.opacity = '0.8';
    button.appendChild(descEl);

    // Click handler
    button.addEventListener('click', () => {
      console.log("🔘 Choice button clicked:", title);
      // Add a small delay to ensure DOM is ready
      setTimeout(() => {
        onClick();
        // Delay endWalkthrough to allow panels to open
        setTimeout(() => {
          endWalkthrough();
        }, 200);
      }, 50);
    });

    return button;
  }

  function setupSchoolDecisionEvaluation() {
    console.log("🏫 Setting up School Decision Evaluation path...");
    isSettingUpPath = true; // Set flag to prevent panel closing
    
    // Ensure sidebar is visible
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      console.log("📋 Sidebar found, ensuring visibility");
      sidebar.style.display = 'flex';
    } else {
      console.error("❌ Could not find sidebar");
    }
    
    // Ensure right sidebar (map-sidebar) is visible and properly configured
    const mapSidebar = document.getElementById('map-sidebar');
    if (mapSidebar) {
      console.log("📋 Map sidebar found, ensuring visibility");
      mapSidebar.style.display = 'flex';
      mapSidebar.classList.remove('hidden', 'wide');
      mapSidebar.classList.add('normal');
    } else {
      console.error("❌ Could not find map-sidebar");
    }
    
    // Close all panels first
    const allPanels = [
      document.getElementById('decision-input-panel'),
      document.getElementById('scenario-input-panel'),
      document.getElementById('decision-output-panel'),
      document.getElementById('scenario-output-panel')
    ];
    
    console.log("🔍 Found panels:", allPanels.map(p => p ? p.id : 'null'));
    
    allPanels.forEach(panel => {
      if (panel && panel.tagName === 'DETAILS' && panel.open) {
        console.log("🔒 Closing panel:", panel.id);
        panel.open = false;
      }
    });

    // Wait a bit before opening panels to ensure everything is settled
    setTimeout(() => {
      const decisionOutputPanel = document.getElementById('decision-output-panel');
      
      if (decisionOutputPanel && decisionOutputPanel.tagName === 'DETAILS') {
        console.log("🔓 Opening decision output panel");
        decisionOutputPanel.open = true;
        decisionOutputPanel.offsetHeight;
      } else {
        console.error("❌ Could not find decision-output-panel");
      }
    }, 200);

    // Switch to flowchart view (and keep it there)
    const flowchartBtn = document.getElementById('toggleMapFlowchartFlowchart');
    if (flowchartBtn && !flowchartBtn.classList.contains('active')) {
      console.log("📊 Switching to flowchart view");
      flowchartBtn.click();
    } else {
      console.log("📊 Flowchart view already active or button not found");
    }
    
    console.log("✅ School Decision Evaluation setup complete");
  }

  function setupScenarioModeling() {
    console.log("📊 Setting up Scenario Modeling path...");
    isSettingUpPath = true; // Set flag to prevent panel closing
    
    // Ensure sidebar is visible
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      console.log("📋 Sidebar found, ensuring visibility");
      sidebar.style.display = 'flex';
    } else {
      console.error("❌ Could not find sidebar");
    }
    
    // Ensure right sidebar (map-sidebar) is visible and properly configured
    const mapSidebar = document.getElementById('map-sidebar');
    if (mapSidebar) {
      console.log("📋 Map sidebar found, ensuring visibility");
      mapSidebar.style.display = 'flex';
      mapSidebar.classList.remove('hidden', 'wide');
      mapSidebar.classList.add('normal');
    } else {
      console.error("❌ Could not find map-sidebar");
    }
    
    // Close all panels first
    const allPanels = [
      document.getElementById('decision-input-panel'),
      document.getElementById('scenario-input-panel'),
      document.getElementById('decision-output-panel'),
      document.getElementById('scenario-output-panel')
    ];
    
    console.log("🔍 Found panels:", allPanels.map(p => p ? p.id : 'null'));
    
    allPanels.forEach(panel => {
      if (panel && panel.tagName === 'DETAILS' && panel.open) {
        console.log("🔒 Closing panel:", panel.id);
        panel.open = false;
      }
    });

    // Wait a bit before opening panels to ensure everything is settled
    setTimeout(() => {
      const scenarioInputPanel = document.getElementById('scenario-input-panel');
      const scenarioOutputPanel = document.getElementById('scenario-output-panel');
      
      if (scenarioInputPanel) {
        /* weights section is always visible (flat div) */
      } else {
        console.error("❌ Could not find scenario-input-panel");
      }
      
      if (scenarioOutputPanel && scenarioOutputPanel.tagName === 'DETAILS') {
        console.log("🔓 Opening scenario output panel");
        scenarioOutputPanel.open = true;
        // Force a reflow to ensure the panel opens
        scenarioOutputPanel.offsetHeight;
        
        // Check if it actually opened
        setTimeout(() => {
          console.log("🔍 Scenario output panel open state:", scenarioOutputPanel.open);
          console.log("🔍 Scenario output panel display:", window.getComputedStyle(scenarioOutputPanel).display);
          console.log("🔍 Scenario output panel visibility:", window.getComputedStyle(scenarioOutputPanel).visibility);
          
          // If it's still not open, try again
          if (!scenarioOutputPanel.open) {
            console.log("🔄 Retrying to open scenario output panel");
            scenarioOutputPanel.open = true;
            scenarioOutputPanel.offsetHeight;
          }
        }, 100);
      } else {
        console.error("❌ Could not find scenario-output-panel");
      }
    }, 200);

    // Switch to map view
    const mapBtn = document.getElementById('toggleMapFlowchartMap');
    if (mapBtn && !mapBtn.classList.contains('active')) {
      console.log("🗺️ Switching to map view");
      mapBtn.click();
    } else {
      console.log("🗺️ Map view already active or button not found");
    }
    
    console.log("✅ Scenario Modeling setup complete");
  }

  function setupOwnPath() {
    console.log("🗺️ Setting up Own Path...");
    
    // Close all panels
    const allPanels = [
      document.getElementById('decision-input-panel'),
      document.getElementById('scenario-input-panel'),
      document.getElementById('decision-output-panel'),
      document.getElementById('scenario-output-panel')
    ];
    allPanels.forEach(panel => {
      if (panel && panel.tagName === 'DETAILS' && panel.open) {
        console.log("🔒 Closing panel:", panel.id);
        panel.open = false;
      }
    });

    // Switch to map view
    const mapBtn = document.getElementById('toggleMapFlowchartMap');
    if (mapBtn && !mapBtn.classList.contains('active')) {
      console.log("🗺️ Switching to map view");
      mapBtn.click();
    } else {
      console.log("🗺️ Map view already active or button not found");
    }
    
    console.log("✅ Own Path setup complete");
  }

  function drawHighlight(target, step) {
    restoreMenuZIndex();
    restoreResultsPanelZIndex();

    const z = tourZIndexForStep(step);
    if (isMenuTourStep(step)) boostMenuAboveTourOverlay();
    if (isResultsTablesTourStep(step)) boostResultsPanelForTour();

    // Create overlay
    overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'rgba(0,0,0,0.1)';
    overlay.style.zIndex = String(z.overlay);
    // IMPORTANT: allow user to interact with the app during the tour (hamburger menu, panels, sliders, etc.)
    overlay.style.pointerEvents = 'none';
    document.body.appendChild(overlay);

    // Highlight target (skip for intro step)
    let rect = {left: 0, top: 0, width: 0, height: 0};
    let highlight = null;
    if (!step.isIntro) {
      let highlightEl = resolveTourHighlightElement(target, step);
      let pad = 8;
      if (step.highlightFlowchart || step.target === '#main-flowchart-container') {
        const fc = document.getElementById('main-flowchart-container');
        const svgContainer = fc && fc.querySelector('.flowchart-svg-container');
        highlightEl = svgContainer || fc || target;
        pad = 4;
      } else if (step.target === '#sidebar') {
        highlightEl = document.getElementById('sidebar') || target;
        pad = 6;
      } else if (
        step.target === '#toggleLeftSidebar' ||
        step.target === '#toggleRightSidebar'
      ) {
        pad = 6;
      } else if (
        step.target === '#bottom-tables-compact-bar' ||
        step.target === '#bottomTablesShowTablesBtn'
      ) {
        const compactBar = document.getElementById('bottom-tables-compact-bar');
        const showBtn = document.getElementById('bottomTablesShowTablesBtn');
        const resultsPanel = document.getElementById('map-sidebar');
        highlightEl = showBtn || compactBar || target;
        let probe = highlightEl.getBoundingClientRect();
        if ((probe.width < 8 || probe.height < 8) && resultsPanel) {
          highlightEl = resultsPanel;
        }
        pad = 8;
      } else if (step.target === '.bottom-panel-tabs' || step.target === '#bottom-panel-tabs') {
        highlightEl =
          document.querySelector('.bottom-panel-tabs') ||
          document.getElementById('bottom-panel-tabs') ||
          target;
        pad = 6;
      } else if (step.target === '.menu-nav-step-list') {
        highlightEl = document.querySelector('.menu-nav-step-list') || target;
        pad = 6;
      } else if (
        step.target === '#decision-input-panel' ||
        step.target === '#scenario-input-panel'
      ) {
        pad = 4;
      } else if (step.target === '#step1SchoolSelect') {
        highlightEl =
          (target && target.closest('label')) ||
          document.getElementById('step1SchoolSelect') ||
          target;
        pad = 8;
      } else if (step.target === '#step1SingleSection') {
        highlightEl = document.getElementById('step1SingleSection') || target;
        pad = 4;
      } else if (step.target === '#step1CompareControls') {
        highlightEl = document.getElementById('step1CompareControls') || target;
        pad = 6;
      } else if (
        step.target === '#step1CompareGrid' ||
        step.target === '#step1CompareSection'
      ) {
        highlightEl =
          document.getElementById('step1CompareSection') ||
          document.getElementById('step1CompareGrid') ||
          target;
        pad = 4;
      } else {
        pad = 0;
      }
      rect = highlightEl.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) {
        const fallback =
          step.target === '#sidebar'
            ? document.getElementById('sidebar')
            : step.target === '#main-flowchart-container'
              ? document.getElementById('main-flowchart-container')
              : step.target === '#toggleLeftSidebar' || step.target === '#toggleRightSidebar'
                ? (target && target.closest('label')) || null
                : step.target === '#bottom-tables-compact-bar' ||
                    step.target === '#bottomTablesShowTablesBtn'
                  ? document.getElementById('map-sidebar') ||
                    document.getElementById('bottom-tables-compact-bar')
                  : step.target === '.bottom-panel-tabs' || step.target === '#bottom-panel-tabs'
                    ? document.querySelector('.bottom-panel-tabs')
                    : step.target === '#step1SingleSection'
                      ? document.getElementById('step1SchoolDataCard')
                      : step.target === '#step1CompareGrid' ||
                          step.target === '#step1CompareSection'
                        ? document.getElementById('step1CompareControls')
                        : null;
        if (fallback) {
          highlightEl = fallback;
          rect = fallback.getBoundingClientRect();
        }
      }
     
      highlight = document.createElement('div');
      highlight.style.position = 'fixed';
      highlight.style.left = (rect.left - pad) + 'px';
      highlight.style.top = (rect.top - pad) + 'px';
      highlight.style.width = (rect.width + pad * 2) + 'px';
      highlight.style.height = (rect.height + pad * 2) + 'px';
      highlight.style.border = '3px solid #FFD600';
      highlight.style.borderRadius = '10px';
      highlight.style.boxShadow = '0 0 0 9999px rgba(0,0,0,0.7)';
      highlight.style.zIndex = String(z.highlight);
      highlight.style.pointerEvents = 'none';
      document.body.appendChild(highlight);
      tourHighlights.push(highlight);
    }
  }

  function drawPopup(target, step, stepIdx) {
    const z = tourZIndexForStep(step);
    // Create popup
    popup = document.createElement('div');
    popup.style.position = 'fixed';
    popup.style.left = '12px';
    popup.style.top = '12px';
    popup.style.background = '#fff';
    popup.style.color = '#222';
    popup.style.border = '2px solid #007cbf';
    popup.style.borderRadius = '8px';
    popup.style.boxShadow = '0 4px 24px rgba(0,0,0,0.2)';
    // Add right padding so the close "×" never overlaps the title/text
    popup.style.padding = '16px 56px 14px 20px';
    popup.style.zIndex = String(z.popup);
    popup.style.maxWidth = '460px';
    popup.style.fontSize = '15px';
    popup.style.fontFamily = "'Franklin Gothic Book', 'Franklin Gothic', 'Arial Narrow', Arial, sans-serif";
    popup.innerHTML =
      `<h3 style='margin:0 0 8px 0;color:#007cbf; padding-right: 6px;'>${step.title}</h3>` +
      `<div style="margin:0 0 8px 0; line-height:1.28;">${step.text}</div>`;

    // Prevent overlay click from closing when interacting with popup
    popup.addEventListener('click', (e) => e.stopPropagation());

    // Exit any time: close (×)
    const closeBtn = document.createElement('button');
    closeBtn.setAttribute('aria-label', 'Close tour');
    closeBtn.textContent = '×';
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '10px';
    closeBtn.style.right = '12px';
    closeBtn.style.border = 'none';
    closeBtn.style.background = 'transparent';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontSize = '22px';
    closeBtn.style.lineHeight = '1';
    closeBtn.style.color = '#007cbf';
    closeBtn.onclick = () => {
      persistTourDismissPreference();
      endWalkthrough();
    };
    popup.appendChild(closeBtn);

    if (step.isIntro) {
      const dismissWrap = document.createElement('label');
      dismissWrap.style.display = 'flex';
      dismissWrap.style.alignItems = 'flex-start';
      dismissWrap.style.gap = '8px';
      dismissWrap.style.marginTop = '10px';
      dismissWrap.style.fontSize = '13px';
      dismissWrap.style.lineHeight = '1.4';
      dismissWrap.style.cursor = 'pointer';
      const dismissCb = document.createElement('input');
      dismissCb.type = 'checkbox';
      dismissCb.id = 'tourDismissCheckbox';
      dismissCb.style.marginTop = '2px';
      dismissWrap.appendChild(dismissCb);
      const dismissText = document.createElement('span');
      dismissText.textContent = 'Do not show the tour popup anymore';
      dismissWrap.appendChild(dismissText);
      popup.appendChild(dismissWrap);
    }

    // Always-available jump-to-module (so users can switch topics mid-tour)
    const moduleWrap = document.createElement('div');
    moduleWrap.style.marginTop = '6px';
    moduleWrap.style.marginBottom = '10px';

    const moduleRow = document.createElement('div');
    moduleRow.style.display = 'flex';
    moduleRow.style.gap = '8px';
    moduleRow.style.alignItems = 'center';
    moduleRow.style.flexWrap = 'wrap';

    const moduleLabel = document.createElement('div');
    moduleLabel.textContent = 'Jump to:';
    moduleLabel.style.fontWeight = '800';
    moduleLabel.style.fontSize = '13px';
    moduleLabel.style.color = '#111827';

    const moduleSelect = document.createElement('select');
    moduleSelect.id = 'tourModuleSelect';
    moduleSelect.style.flex = '1';
    moduleSelect.style.minWidth = '190px';
    moduleSelect.style.padding = '8px 10px';
    moduleSelect.style.border = '1px solid #d1d5db';
    moduleSelect.style.borderRadius = '8px';
    moduleSelect.style.fontSize = '13px';
    moduleSelect.style.fontFamily = "'Franklin Gothic Book', 'Franklin Gothic', 'Arial Narrow', Arial, sans-serif";
    moduleSelect.style.background = '#fff';

    [
      { v: 'full', t: 'Full tour (restart)' },
      { v: 'navigation', t: 'Menu & Navigation' },
      { v: 'step1', t: 'Step 1 — School-level data' },
      { v: 'step2', t: 'Step 2 — Map' },
      { v: 'step3', t: 'Step 3 — Sort by Strategic Decision' },
      { v: 'step4', t: 'Step 4 — Prioritization' },
      { v: 'showTables', t: 'Results tables (Show tables)' },
      { v: 'flowchart', t: 'Flowchart (Steps 3–4)' }
    ].forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.v;
      opt.textContent = o.t;
      moduleSelect.appendChild(opt);
    });
    moduleSelect.value = getCurrentModuleKey(stepIdx);
    moduleSelect.addEventListener('change', () => jumpToModule(moduleSelect.value));

    moduleRow.appendChild(moduleLabel);
    moduleRow.appendChild(moduleSelect);
    moduleWrap.appendChild(moduleRow);
    popup.appendChild(moduleWrap);

    // Next/Close/Skip button(s)
    if (step.isIntro) {
      // Skip button
      const skipBtn = document.createElement('button');
      skipBtn.textContent = 'Skip';
      skipBtn.style.marginTop = '18px';
      skipBtn.style.background = '#e74c3c';
      skipBtn.style.color = '#fff';
      skipBtn.style.border = 'none';
      skipBtn.style.borderRadius = '4px';
      skipBtn.style.padding = '8px 20px';
      skipBtn.style.fontSize = '16px';
      skipBtn.style.fontFamily = "'Franklin Gothic Book', 'Franklin Gothic', 'Arial Narrow', Arial, sans-serif";
      skipBtn.style.cursor = 'pointer';
      skipBtn.style.marginRight = '12px';
      skipBtn.onclick = () => {
        persistTourDismissPreference();
        endWalkthrough();
      };
      popup.appendChild(skipBtn);
      // Start button
      const startBtn = document.createElement('button');
      startBtn.textContent = 'Start Tour';
      startBtn.style.marginTop = '18px';
      startBtn.style.background = '#007cbf';
      startBtn.style.color = '#fff';
      startBtn.style.border = 'none';
      startBtn.style.borderRadius = '4px';
      startBtn.style.padding = '8px 20px';
      startBtn.style.fontSize = '16px';
      startBtn.style.fontFamily = "'Franklin Gothic Book', 'Franklin Gothic', 'Arial Narrow', Arial, sans-serif";
      startBtn.style.cursor = 'pointer';
      startBtn.onclick = () => {
        persistTourDismissPreference();
        // Start the tour from whatever module is selected in the jump dropdown.
        const sel = document.getElementById('tourModuleSelect');
        const key = sel ? String(sel.value || 'full') : 'full';
        if (key && key !== 'full') return jumpToModule(key);
        nextStep();
      };
      popup.appendChild(startBtn);
    } else {
      // Back button (except for first step)
      if (stepIdx > 0) {
        const backBtn = document.createElement('button');
        backBtn.textContent = 'Back';
        backBtn.style.marginTop = '18px';
        backBtn.style.background = '#6c757d';
        backBtn.style.color = '#fff';
        backBtn.style.border = 'none';
        backBtn.style.borderRadius = '4px';
        backBtn.style.padding = '8px 20px';
        backBtn.style.fontSize = '16px';
        backBtn.style.fontFamily = "'Franklin Gothic Book', 'Franklin Gothic', 'Arial Narrow', Arial, sans-serif";
        backBtn.style.cursor = 'pointer';
        backBtn.style.marginRight = '12px';
        backBtn.onclick = previousStep;
        popup.appendChild(backBtn);
      }

      // End tour button (always available)
      const endBtn = document.createElement('button');
      endBtn.textContent = 'End Tour';
      endBtn.style.marginTop = '18px';
      endBtn.style.background = '#e74c3c';
      endBtn.style.color = '#fff';
      endBtn.style.border = 'none';
      endBtn.style.borderRadius = '4px';
      endBtn.style.padding = '8px 20px';
      endBtn.style.fontSize = '16px';
      endBtn.style.fontFamily = "'Franklin Gothic Book', 'Franklin Gothic', 'Arial Narrow', Arial, sans-serif";
      endBtn.style.cursor = 'pointer';
      endBtn.style.marginRight = '12px';
      endBtn.onclick = () => {
        persistTourDismissPreference();
        endWalkthrough();
      };
      popup.appendChild(endBtn);
      
      const btn = document.createElement('button');
      btn.textContent = (stepIdx === steps.length - 1) ? 'Finish' : 'Next';
      btn.style.marginTop = '18px';
      btn.style.background = '#007cbf';
      btn.style.color = '#fff';
      btn.style.border = 'none';
      btn.style.borderRadius = '4px';
      btn.style.padding = '8px 20px';
      btn.style.fontSize = '16px';
      btn.style.fontFamily = "'Franklin Gothic Book', 'Franklin Gothic', 'Arial Narrow', Arial, sans-serif";
      btn.style.cursor = 'pointer';
      btn.onclick = () => {
        if (stepIdx === steps.length - 1) {
          persistTourDismissPreference();
          endWalkthrough();
        } else {
          nextStep();
        }
      };
      popup.appendChild(btn);
    }
    document.body.appendChild(popup);
    // After append, clamp to viewport (prevents falling outside the window)
    positionPopup(target, step);
  }

  function nextStep() {
    currentStep++;
    if (currentStep < steps.length) {
      showStep(currentStep);
    } else {
      endWalkthrough();
    }
  }

  function previousStep() {
    currentStep--;
    if (currentStep >= 0) {
      // Close any sections that were opened in the current step before going back
      const currentStepTarget = steps[currentStep + 1]?.target;
      if (currentStepTarget === '#scenario-input-panel') {
        /* flat weights section; nothing to collapse */
      } else if (currentStepTarget === '#decision-input-panel') {
        // Input panels are flat sections; nothing to collapse on back navigation.
      } else if (currentStepTarget === '#decision-output-panel') {
        const decisionOutputPanel = document.getElementById('decision-output-panel');
        if (decisionOutputPanel && decisionOutputPanel.open) {
          decisionOutputPanel.open = false;
        }
      } else if (currentStepTarget === '#scenario-output-panel') {
        const scenarioOutputPanel = document.getElementById('scenario-output-panel');
        if (scenarioOutputPanel && scenarioOutputPanel.open) {
          scenarioOutputPanel.open = false;
        }
      } else if (
        currentStepTarget === '#main-flowchart-container' ||
        currentStepTarget === '#mainFlowchartSchoolSelect' ||
        currentStepTarget === '#menuShowFlowchart'
      ) {
        // Switch back to map view if we were on flowchart
        if (typeof window.switchToMap === 'function') window.switchToMap();
      }
      
      showStep(currentStep);
    } else {
      endWalkthrough();
    }
  }

  function endWalkthrough() {
    persistTourDismissPreference();
    restoreMenuZIndex();
    restoreResultsPanelZIndex();
    clearTourLayers();

    // Remove listeners
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler, true);
      keyHandler = null;
    }
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
      resizeHandler = null;
    }
    
    // Only close panels if we're not setting up a specific path
    if (!isSettingUpPath) {
      // Close hamburger menu (if open)
      closeMenu();

      // Close all dropdown sections
      const panels = [
        document.getElementById('decision-input-panel'),
        document.getElementById('scenario-input-panel'),
        document.getElementById('decision-output-panel'),
        document.getElementById('scenario-output-panel')
      ];
      panels.forEach(panel => {
        if (panel && panel.tagName === 'DETAILS' && panel.open) panel.open = false;
      });

      // Collapse both sidebars back to the default "everything collapsed" state
      setSidebarVisibility({ left: false, right: false });
      
      // Switch to map view if currently on flowchart (only when not setting up a path)
      if (typeof window.switchToMap === 'function') {
        window.switchToMap();
      }
    } else {
      // Reset the flag after a delay
      setTimeout(() => {
        isSettingUpPath = false;
      }, 1000);
    }
  }

  // Exit any time: Esc
  keyHandler = (e) => {
    if (e && e.key === 'Escape') {
      e.preventDefault();
      endWalkthrough();
    }
  };
  document.addEventListener('keydown', keyHandler, true);

  // Keep the popup inside the viewport on resize
  resizeHandler = () => {
    try {
      const step = steps[currentStep];
      const target = document.querySelector(step?.target || 'body');
      if (popup && target && step) positionPopup(target, step);
    } catch (e) {}
  };
  window.addEventListener('resize', resizeHandler);

  // Expose cleanup so a new tour run can safely terminate the previous one
  window.__onboardingTourCleanup = endWalkthrough;

  // Optional: start at a specific module (skips intro)
  if (requestedStartAt && stepIndexByKey[requestedStartAt] !== undefined) {
    currentStep = stepIndexByKey[requestedStartAt];
  }

  showStep(currentStep);
}

window.startOnboardingWalkthrough = startOnboardingWalkthrough;

// 1. Add a helper to inject tooltip CSS if not already present
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

// 2. Add a function to handle custom tooltips for dollar sign buttons
function setupDollarSignTooltips() {
  injectTooltipCSS();
  // Remove any previous listeners to avoid duplicates
  const container = document.getElementById('investmentsTableContainer');
  if (!container) return;
  let tooltip = null;

  container.addEventListener('mouseover', function(e) {
    const target = e.target.closest('.dollar-sign-tooltip');
    if (target && target.dataset.tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'custom-tooltip';
      tooltip.textContent = target.dataset.tooltip;
      document.body.appendChild(tooltip);
      // Position tooltip near mouse
      const move = (evt) => {
        tooltip.style.left = (evt.clientX + 12) + 'px';
        tooltip.style.top = (evt.clientY + 12) + 'px';
      };
      move(e);
      document.addEventListener('mousemove', move);
      target._moveHandler = move;
    }
  });
  container.addEventListener('mouseout', function(e) {
    const target = e.target.closest('.dollar-sign-tooltip');
    if (target && tooltip) {
      document.body.removeChild(tooltip);
      tooltip = null;
      if (target._moveHandler) {
        document.removeEventListener('mousemove', target._moveHandler);
        target._moveHandler = null;
      }
    }
  });
  // Remove tooltip on click as well
  container.addEventListener('click', function(e) {
    const target = e.target.closest('.dollar-sign-tooltip');
    if (target && tooltip) {
      document.body.removeChild(tooltip);
      tooltip = null;
      if (target._moveHandler) {
        document.removeEventListener('mousemove', target._moveHandler);
        target._moveHandler = null;
      }
    }
  });
}

// ✅ Global close for all help tooltips (question mark textboxes)
document.addEventListener('DOMContentLoaded', function() {
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('close-tooltip-btn')) {
      // Find the parent tooltip/span and hide it
      const tooltip = e.target.parentElement;
      if (tooltip && (tooltip.classList.contains('tooltip') || tooltip.classList.contains('draggable-tooltip') || tooltip.id.endsWith('-help-tooltip'))) {
        tooltip.style.display = 'none';
      }
    }
  });
});

// ✅ Prevent <details> toggle when clicking help icon or tooltip in summary
// This ensures only clicks on the summary text toggle the section

document.addEventListener('DOMContentLoaded', function() {
  // Prevent toggle when clicking help icon
  document.querySelectorAll('.help-icon').forEach(function(icon) {
    icon.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
    });
  });
  // Prevent toggle when clicking inside any help tooltip
  document.querySelectorAll('.tooltip').forEach(function(tooltip) {
    tooltip.addEventListener('click', function(e) {
      e.stopPropagation();
    });
  });
});

// === HELP TOOLTIP LOGIC: Move tooltips to body and position absolutely ===
document.addEventListener('DOMContentLoaded', function() {
  const helpTooltips = [
    { icon: 'decision-help-icon', tooltip: 'decision-help-tooltip' },
    { icon: 'decision-flow1-help-icon', tooltip: 'decision-flow1-help-tooltip' },
    { icon: 'decision-flow2-help-icon', tooltip: 'decision-flow2-help-tooltip' },
    { icon: 'decision-flow3-help-icon', tooltip: 'decision-flow3-help-tooltip' },
    { icon: 'decision-flow4-help-icon', tooltip: 'decision-flow4-help-tooltip' },
    { icon: 'scenario-help-icon', tooltip: 'scenario-help-tooltip' },
    { icon: 'decision-results-help-icon', tooltip: 'decision-results-help-tooltip' },
    { icon: 'model-output-help-icon', tooltip: 'model-output-help-tooltip' },
    { icon: 'flowchart-help-icon', tooltip: 'flowchart-help-tooltip' },
  ];
  helpTooltips.forEach(({icon, tooltip}) => {
    const iconEl = document.getElementById(icon);
    const tooltipEl = document.getElementById(tooltip);
    if (!iconEl || !tooltipEl) return;
    // Always hide initially
    tooltipEl.style.display = 'none';
    // On click, move to body, position, and show
    iconEl.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      // Move tooltip to body if not already
      if (tooltipEl.parentElement !== document.body) {
        document.body.appendChild(tooltipEl);
      }
      
      // Position near the icon with smart positioning
      const rect = iconEl.getBoundingClientRect();
      const tooltipWidth = 300; // Approximate tooltip width
      const margin = 10;
      
      tooltipEl.style.position = 'fixed';
      tooltipEl.style.zIndex = 10000;
      tooltipEl.style.display = 'block';
      
      // Check if positioning to the right would go off-screen
      const rightPosition = rect.right + margin;
      const leftPosition = rect.left - tooltipWidth - margin;
      
      if (rightPosition + tooltipWidth > window.innerWidth) {
        // Position to the left if right would go off-screen
        tooltipEl.style.left = Math.max(margin, leftPosition) + 'px';
        tooltipEl.style.right = 'auto';
      } else {
        // Position to the right (default behavior)
        tooltipEl.style.left = rightPosition + 'px';
        tooltipEl.style.right = 'auto';
      }
      
      // Vertical positioning
      tooltipEl.style.top = (rect.top - 10) + 'px';
    });
    // Hide on click outside
    document.addEventListener('mousedown', function(e) {
      if (tooltipEl.style.display === 'block' && !tooltipEl.contains(e.target) && e.target !== iconEl) {
        tooltipEl.style.display = 'none';
      }
    });
    // Hide on close button (handled by markup)
    // Prevent <details> toggle when clicking help icon or tooltip
    iconEl.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); });
    tooltipEl.addEventListener('click', function(e) { e.stopPropagation(); });
  });
});

document.addEventListener('DOMContentLoaded', function() {
  // ... existing help icon logic ...

  // Map toggle help icon logic
  var mapToggleHelpIcon = document.getElementById('map-toggle-help-icon');
  var mapToggleHelpTooltip = document.getElementById('map-toggle-help-tooltip');
  if (mapToggleHelpIcon && mapToggleHelpTooltip) {
    mapToggleHelpIcon.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (mapToggleHelpTooltip.style.display === 'none' || mapToggleHelpTooltip.style.display === '') {
        mapToggleHelpTooltip.style.display = 'block';
      } else {
        mapToggleHelpTooltip.style.display = 'none';
      }
    });
    document.addEventListener('click', function(e) {
      if (mapToggleHelpTooltip.style.display === 'block' && !mapToggleHelpTooltip.contains(e.target) && e.target !== mapToggleHelpIcon) {
        mapToggleHelpTooltip.style.display = 'none';
      }
    });
    // Make the tooltip draggable
    mapToggleHelpTooltip.classList.add('draggable-tooltip');
    let isMouseDown = false, offset = [0, 0];
    mapToggleHelpTooltip.addEventListener('mousedown', function(e) {
      isMouseDown = true;
      offset = [
        mapToggleHelpTooltip.offsetLeft - e.clientX,
        mapToggleHelpTooltip.offsetTop - e.clientY
      ];
      mapToggleHelpTooltip.style.cursor = 'move';
      e.preventDefault();
    }, true);
    document.addEventListener('mouseup', function() {
      isMouseDown = false;
      mapToggleHelpTooltip.style.cursor = '';
    }, true);
    document.addEventListener('mousemove', function(e) {
      if (!isMouseDown) return;
      mapToggleHelpTooltip.style.left = (e.clientX + offset[0]) + 'px';
      mapToggleHelpTooltip.style.top = (e.clientY + offset[1]) + 'px';
      mapToggleHelpTooltip.style.right = 'auto';
      mapToggleHelpTooltip.style.bottom = 'auto';
    }, true);
  }

  // Summary Table help icon logic
  var summaryTableHelpIcon = document.getElementById('summary-table-help-icon');
  var summaryTableHelpTooltip = document.getElementById('summary-table-help-tooltip');
  if (summaryTableHelpIcon && summaryTableHelpTooltip) {
    summaryTableHelpTooltip.classList.add('draggable-tooltip');
    summaryTableHelpIcon.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (summaryTableHelpTooltip.style.display === 'none' || summaryTableHelpTooltip.style.display === '') {
        summaryTableHelpTooltip.style.display = 'block';
      } else {
        summaryTableHelpTooltip.style.display = 'none';
      }
    });
    document.addEventListener('click', function(e) {
      if (summaryTableHelpTooltip.style.display === 'block' && !summaryTableHelpTooltip.contains(e.target) && e.target !== summaryTableHelpIcon) {
        summaryTableHelpTooltip.style.display = 'none';
      }
    });
    // Draggable logic
    let isMouseDown = false, offset = [0, 0];
    summaryTableHelpTooltip.addEventListener('mousedown', function(e) {
      isMouseDown = true;
      offset = [
        summaryTableHelpTooltip.offsetLeft - e.clientX,
        summaryTableHelpTooltip.offsetTop - e.clientY
      ];
      summaryTableHelpTooltip.style.cursor = 'move';
      e.preventDefault();
    }, true);
    document.addEventListener('mouseup', function() {
      isMouseDown = false;
      summaryTableHelpTooltip.style.cursor = '';
    }, true);
    document.addEventListener('mousemove', function(e) {
      if (!isMouseDown) return;
      summaryTableHelpTooltip.style.left = (e.clientX + offset[0]) + 'px';
      summaryTableHelpTooltip.style.top = (e.clientY + offset[1]) + 'px';
      summaryTableHelpTooltip.style.right = 'auto';
    }, true);
  }

  // Decision by School help icon logic (now outside details)
  var decisionBySchoolHelpIcon = document.getElementById('decision-by-school-help-icon');
  var decisionBySchoolHelpTooltip = document.getElementById('decision-by-school-help-tooltip');
  if (decisionBySchoolHelpIcon && decisionBySchoolHelpTooltip) {
    decisionBySchoolHelpIcon.style.cursor = 'pointer';
    decisionBySchoolHelpTooltip.classList.add('draggable-tooltip');
    decisionBySchoolHelpIcon.addEventListener('click', function(e) {
      console.log('Decision by School help icon clicked');
      e.preventDefault();
      e.stopPropagation();
      if (decisionBySchoolHelpTooltip.style.display === 'none' || decisionBySchoolHelpTooltip.style.display === '') {
        decisionBySchoolHelpTooltip.style.display = 'block';
      } else {
        decisionBySchoolHelpTooltip.style.display = 'none';
      }
    });
    document.addEventListener('click', function(e) {
      if (decisionBySchoolHelpTooltip.style.display === 'block' && !decisionBySchoolHelpTooltip.contains(e.target) && e.target !== decisionBySchoolHelpIcon) {
        decisionBySchoolHelpTooltip.style.display = 'none';
      }
    });
    // Draggable logic
    let isMouseDown2 = false, offset2 = [0, 0];
    decisionBySchoolHelpTooltip.addEventListener('mousedown', function(e) {
      isMouseDown2 = true;
      offset2 = [
        decisionBySchoolHelpTooltip.offsetLeft - e.clientX,
        decisionBySchoolHelpTooltip.offsetTop - e.clientY
      ];
      decisionBySchoolHelpTooltip.style.cursor = 'move';
      e.preventDefault();
    }, true);
    document.addEventListener('mouseup', function() {
      isMouseDown2 = false;
      decisionBySchoolHelpTooltip.style.cursor = '';
    }, true);
    document.addEventListener('mousemove', function(e) {
      if (!isMouseDown2) return;
      decisionBySchoolHelpTooltip.style.left = (e.clientX + offset2[0]) + 'px';
      decisionBySchoolHelpTooltip.style.top = (e.clientY + offset2[1]) + 'px';
      decisionBySchoolHelpTooltip.style.right = 'auto';
    }, true);
  }

  // ✅ Sidebar Resizer Functionality
  function setupSidebarResizers() {
    const leftSidebar = document.getElementById('sidebar');
    const rightSidebar = document.getElementById('map-sidebar');
    const leftResizer = document.getElementById('left-sidebar-resizer');
    const rightResizer = document.getElementById('right-sidebar-resizer');
    const mapContainer = document.getElementById('map-container');

    if (!leftSidebar || !rightSidebar || !leftResizer || !rightResizer) {
      console.warn('⚠️ Sidebar resizers not found');
      return;
    }

    // Setup ResizeObserver for map container to automatically resize map
    if (mapContainer && window.ResizeObserver) {
      let lastWidth = mapContainer.offsetWidth;
      let lastHeight = mapContainer.offsetHeight;
      let isAdjustingZoom = false; // Prevent recursive adjustments
      
      const resizeObserver = new ResizeObserver((entries) => {
        if (window.map && window.map.resize && !isAdjustingZoom) {
          const entry = entries[0];
          const newWidth = entry.contentRect.width;
          const newHeight = entry.contentRect.height;
          
          // Only adjust if size actually changed significantly (more than 1px)
          if (Math.abs(newWidth - lastWidth) > 1 || Math.abs(newHeight - lastHeight) > 1) {
            // Refit to schools when the panel gains size or the view is still at world/default zoom.
            const needsSchoolFit = window.__mapSchoolFitPending || mapNeedsSchoolExtentFit(window.map);
            if (needsSchoolFit && newWidth > 50 && newHeight > 50) {
              lastWidth = newWidth;
              lastHeight = newHeight;
              if (typeof window.scheduleFitMapToAllSchools === 'function') {
                window.scheduleFitMapToAllSchools(0);
              }
              return;
            }

            isAdjustingZoom = true;
            
            // Get current bounds before resize (as array format)
            const bounds = window.map.getBounds();
            const boundsArray = [
              [bounds.getWest(), bounds.getSouth()],
              [bounds.getEast(), bounds.getNorth()]
            ];
            
            // Resize the map first
            window.map.resize();
            
            // Then fit to the same bounds to maintain geographic extent
            // Use a small delay to ensure resize has taken effect
            setTimeout(() => {
              if (window.map) {
                // Fit to the same bounds - this will auto-adjust zoom
                window.map.fitBounds(boundsArray, {
                  padding: 0,
                  duration: 0 // Instant adjustment
                });
                
                lastWidth = newWidth;
                lastHeight = newHeight;
                
                // Reset flag after a short delay
                setTimeout(() => {
                  isAdjustingZoom = false;
                }, 50);
              }
            }, 10);
          }
        }
      });
      resizeObserver.observe(mapContainer);
      console.log('✅ ResizeObserver set up for map container');
    }

    // Load saved widths from localStorage
    const savedLeftWidth = localStorage.getItem('leftSidebarWidth');
    const savedBottomHeight = localStorage.getItem('bottomPanelHeight');
    
    if (savedLeftWidth) {
      leftSidebar.style.flex = `0 0 ${savedLeftWidth}px`;
    }
    if (savedBottomHeight) {
      rightSidebar.style.flex = `0 0 ${savedBottomHeight}px`;
    }

    // Left sidebar resizer (between left sidebar and map container)
    let isResizingLeft = false;
    let startXLeft = 0;
    let startWidthLeft = 0;

    leftResizer.addEventListener('mousedown', (e) => {
      isResizingLeft = true;
      startXLeft = e.clientX;
      startWidthLeft = leftSidebar.offsetWidth;
      leftResizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
      e.stopPropagation();
    });

    // Bottom panel resizer (between top-row and bottom panel, vertical)
    let isResizingRight = false;
    let startYRight = 0;
    let startHeightRight = 0;

    rightResizer.addEventListener('mousedown', (e) => {
      isResizingRight = true;
      startYRight = e.clientY;
      startHeightRight = rightSidebar.offsetHeight;
      rightResizer.classList.add('dragging');
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
      e.stopPropagation();
    });

    document.addEventListener('mousemove', (e) => {
      if (isResizingLeft) {
        const diff = e.clientX - startXLeft; // Positive when dragging right
        const newWidth = Math.max(250, Math.min(window.innerWidth * 0.6, startWidthLeft + diff));
        
        // Store current map state before resize (only once at start)
        if (!isResizingLeft._mapState) {
          isResizingLeft._mapState = {
            bounds: window.map ? window.map.getBounds() : null,
            containerWidth: mapContainer.offsetWidth
          };
        }
        
        leftSidebar.style.flex = `0 0 ${newWidth}px`;
        
        // Trigger map resize during drag with zoom adjustment
        if (window.map && window.map.resize && isResizingLeft._mapState.bounds) {
          // Use a throttled approach - only update every few frames
          if (!isResizingLeft._updatePending) {
            isResizingLeft._updatePending = true;
            requestAnimationFrame(() => {
              const containerWidthAfter = mapContainer.offsetWidth;
              const containerWidthBefore = isResizingLeft._mapState.containerWidth;
              
              if (containerWidthBefore > 0 && Math.abs(containerWidthAfter - containerWidthBefore) > 1) {
                // Get bounds as array format for fitBounds
                const bounds = isResizingLeft._mapState.bounds;
                const boundsArray = [
                  [bounds.getWest(), bounds.getSouth()],
                  [bounds.getEast(), bounds.getNorth()]
                ];
                
                // Resize first
                window.map.resize();
                
                // Then fit to same bounds to maintain geographic extent
                // Use a small timeout to ensure resize has taken effect
                setTimeout(() => {
                  if (window.map) {
                    window.map.fitBounds(boundsArray, {
                      padding: 0,
                      duration: 0 // Instant during drag
                    });
                  }
                  isResizingLeft._updatePending = false;
                }, 10);
              } else {
                window.map.resize();
                isResizingLeft._updatePending = false;
              }
            });
          }
        }
      }
      
      if (isResizingRight) {
        const diff = startYRight - e.clientY; // Positive when dragging up (growing bottom panel)
        const newHeight = Math.max(100, Math.min(window.innerHeight * 0.7, startHeightRight + diff));
        
        if (!isResizingRight._mapState) {
          isResizingRight._mapState = {
            bounds: window.map ? window.map.getBounds() : null,
            containerHeight: mapContainer.offsetHeight
          };
        }
        
        rightSidebar.style.flex = `0 0 ${newHeight}px`;
        rightSidebar.style.flexShrink = '0';
        rightSidebar.style.flexGrow = '0';
        
        if (window.map && window.map.resize && isResizingRight._mapState && isResizingRight._mapState.bounds) {
          if (!isResizingRight._updatePending) {
            isResizingRight._updatePending = true;
            requestAnimationFrame(() => {
              const bounds = isResizingRight._mapState.bounds;
              const boundsArray = [
                [bounds.getWest(), bounds.getSouth()],
                [bounds.getEast(), bounds.getNorth()]
              ];
              window.map.resize();
              setTimeout(() => {
                if (window.map) {
                  window.map.fitBounds(boundsArray, { padding: 0, duration: 0 });
                }
                isResizingRight._updatePending = false;
              }, 10);
            });
          }
        }
      }
    });

    document.addEventListener('mouseup', () => {
      // Capture whether a resize was in progress before we reset the flags
      const didResize = isResizingLeft || isResizingRight;

      if (isResizingLeft) {
        // Clean up any stored drag state
        if (isResizingLeft._mapState) {
          delete isResizingLeft._mapState;
          delete isResizingLeft._updatePending;
        }
        
        isResizingLeft = false;
        leftResizer.classList.remove('dragging');
        const currentWidth = leftSidebar.offsetWidth;
        localStorage.setItem('leftSidebarWidth', currentWidth);
      }
      
      if (isResizingRight) {
        if (isResizingRight._mapState) {
          delete isResizingRight._mapState;
          delete isResizingRight._updatePending;
        }
        
        isResizingRight = false;
        rightResizer.classList.remove('dragging');
        const currentHeight = rightSidebar.offsetHeight;
        localStorage.setItem('bottomPanelHeight', currentHeight);
      }
      
      // After either sidebar resize is completed, automatically refit the map
      // to show all schools, mirroring the "Fit to All Schools" button.
      if (didResize && typeof window.fitMapToAllSchools === 'function') {
        setTimeout(() => {
          try {
            window.fitMapToAllSchools();
          } catch (e) {
            console.error("❌ Error auto-fitting map after sidebar resize:", e);
          }
        }, 50);
      } else if (didResize && window.map) {
        // Fallback: at least trigger a resize so symbols stay circular
        try {
          window.map.resize();
        } catch (e) {
          console.error("❌ Error resizing map after sidebar resize:", e);
        }
      }
      
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  }

  // Initialize resizers when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupSidebarResizers);
  } else {
    setupSidebarResizers();
  }
});

// --- Global fallback map/flowchart toggle functions ---
// In some browsers/extensions, the Mapbox 'load' handler may not complete,
// which can prevent the in-handler definitions of window.switchToFlowchart /
// window.switchToMap from being created. These lightweight fallbacks ensure
// the buttons remain clickable and at least toggle the views.
if (typeof window.switchToFlowchart !== 'function') {
  window.switchToFlowchart = function() {
    const step1View = document.getElementById('step1-school-view');
    const flowchartContainer = document.getElementById('main-flowchart-container');
    const mapContainer = document.getElementById('map-container');

    if (step1View) step1View.style.display = 'none';
    if (flowchartContainer) flowchartContainer.style.display = 'flex';
    if (mapContainer) mapContainer.style.display = 'none';

    // If the main flowchart SVG has never been initialized, do it now
    if (!window.flowchartInitialized &&
        typeof window.initializeFlowchartFromScript === 'function' &&
        typeof d3 !== 'undefined') {
      try {
        const svgElem = document.getElementById('main-flowchart-svg');
        if (svgElem) {
          console.log('🎯 Fallback initializing flowchart via initializeFlowchartFromScript');
          const svgSelection = d3.select(svgElem);
          window.initializeFlowchartFromScript(svgSelection);
          window.flowchartInitialized = true;
        } else {
          console.warn('⚠️ main-flowchart-svg element not found for fallback initialization');
        }
      } catch (e) {
        console.error('❌ Error during fallback flowchart initialization:', e);
      }
    }
    window.__centerViewPrefersFlowchart = true;
  };
}

if (typeof window.switchToMap !== 'function') {
  window.switchToMap = function() {
    const step1View = document.getElementById('step1-school-view');
    const flowchartContainer = document.getElementById('main-flowchart-container');
    const mapContainer = document.getElementById('map-container');

    if (step1View) step1View.style.display = 'none';
    if (flowchartContainer) flowchartContainer.style.display = 'none';
    if (mapContainer) mapContainer.style.display = 'block';

    if (window.map && typeof window.map.resize === 'function') {
      setTimeout(() => {
        try {
          window.map.resize();
        } catch (e) {
          console.error("❌ Error resizing map in fallback switchToMap:", e);
        }
        if (typeof window.scheduleFitMapToAllSchools === 'function') {
          window.scheduleFitMapToAllSchools(80);
        }
      }, 100);
    }
    window.__centerViewPrefersFlowchart = false;
  };
}

// --- Process Steps stripe (Step 1–4) ---
// Declarative mapping between process steps and UI panels.
(function initProcessStepsStripe() {
  /** Steps 3–4: entering from Step 1/2 defaults to collapsed (“Show tables”); 3↔4 preserves layout; “Float” → movable, resizable overlay panel. */
  let prevBottomTablesStep = 2;
  function requestMapResize() {
    setTimeout(() => {
      try {
        if (window.map && typeof window.map.resize === 'function') window.map.resize();
      } catch {}
    }, 80);
  }

  function getBrandBarHeight() {
    return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--brand-bar-height') || '52', 10) || 52;
  }

  function getProcessStepsHeight() {
    return 12;
  }

  const BOTTOM_TABLES_FLOAT_STATE_KEY = 'jeffco_bottom_tables_float_v1';
  const BOTTOM_TABLES_FLOAT_MIN_W = 380;
  const BOTTOM_TABLES_FLOAT_MIN_H = 160;
  /** Sliver of the panel that must stay on screen so it can always be grabbed back. */
  const BOTTOM_TABLES_FLOAT_KEEP_VISIBLE = 90;

  function bottomTablesFloatMaxWidth() {
    return Math.max(BOTTOM_TABLES_FLOAT_MIN_W, window.innerWidth - 8);
  }

  function bottomTablesFloatMaxHeight() {
    return Math.max(BOTTOM_TABLES_FLOAT_MIN_H, window.innerHeight - getBrandBarHeight() - 12);
  }

  function readBottomTablesFloatState() {
    try {
      const raw = window.localStorage && window.localStorage.getItem(BOTTOM_TABLES_FLOAT_STATE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Number.isFinite(parsed.width) || !Number.isFinite(parsed.height)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function saveBottomTablesFloatState() {
    const main = document.getElementById('bottom-tables-main');
    if (!main || !main.classList.contains('bottom-tables-main--floating')) return;
    const rect = main.getBoundingClientRect();
    try {
      window.localStorage && window.localStorage.setItem(
        BOTTOM_TABLES_FLOAT_STATE_KEY,
        JSON.stringify({
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        })
      );
    } catch {}
  }

  function placeBottomTablesFloatingPanel() {
    const main = document.getElementById('bottom-tables-main');
    if (!main) return;
    const topBrand = getBrandBarHeight();
    const saved = readBottomTablesFloatState();
    let w;
    let h;
    let left;
    let top;
    if (saved) {
      w = Math.min(Math.max(saved.width, BOTTOM_TABLES_FLOAT_MIN_W), bottomTablesFloatMaxWidth());
      h = Math.min(Math.max(saved.height, BOTTOM_TABLES_FLOAT_MIN_H), bottomTablesFloatMaxHeight());
      left = Number.isFinite(saved.left) ? saved.left : Math.round((window.innerWidth - w) / 2);
      top = Number.isFinite(saved.top) ? saved.top : topBrand + 8;
    } else {
      w = Math.min(Math.round(window.innerWidth * 0.92), 1400);
      h = Math.max(260, Math.round(window.innerHeight * 0.38));
      left = Math.round((window.innerWidth - w) / 2);
      top = Math.max(topBrand + 6, Math.round(window.innerHeight - getProcessStepsHeight() - 12 - h));
    }
    main.style.width = `${w}px`;
    main.style.height = `${h}px`;
    main.style.left = `${Math.round(left)}px`;
    main.style.top = `${Math.round(top)}px`;
    main.style.right = 'auto';
    main.style.bottom = 'auto';
  }

  /**
   * Keep the panel reachable rather than trapped: it may hang off the left,
   * right or bottom edge as long as a grabbable sliver and the drag bar remain
   * on screen.
   */
  function clampBottomTablesFloatingPanel() {
    const main = document.getElementById('bottom-tables-main');
    if (!main || !main.classList.contains('bottom-tables-main--floating')) return;
    const topBrand = getBrandBarHeight();
    const rect = main.getBoundingClientRect();
    let left = parseFloat(main.style.left);
    let top = parseFloat(main.style.top);
    if (!Number.isFinite(left)) left = rect.left;
    if (!Number.isFinite(top)) top = rect.top;
    const keep = Math.min(BOTTOM_TABLES_FLOAT_KEEP_VISIBLE, rect.width);
    const minLeft = -(rect.width - keep);
    const maxLeft = window.innerWidth - keep;
    const minTop = topBrand + 4;
    const maxTop = Math.max(minTop, window.innerHeight - 44);
    left = Math.min(Math.max(left, minLeft), maxLeft);
    top = Math.min(Math.max(top, minTop), maxTop);
    main.style.left = `${Math.round(left)}px`;
    main.style.top = `${Math.round(top)}px`;
  }

  function isBottomTablesFloatMaximized() {
    const main = document.getElementById('bottom-tables-main');
    return !!(main && main.dataset.floatMaximized === '1');
  }

  function syncBottomTablesMaximizeBtn() {
    const btn = document.getElementById('bottomTablesFloatMaxBtn');
    if (!btn) return;
    const max = isBottomTablesFloatMaximized();
    btn.textContent = max ? '❐' : '⛶';
    btn.title = max ? 'Restore previous size' : 'Fill the window';
    btn.setAttribute('aria-label', btn.title);
  }

  function toggleBottomTablesFloatMaximized() {
    const main = document.getElementById('bottom-tables-main');
    if (!main || !main.classList.contains('bottom-tables-main--floating')) return;
    if (isBottomTablesFloatMaximized()) {
      let prev = null;
      try {
        prev = JSON.parse(main.dataset.floatPrevBox || 'null');
      } catch {
        prev = null;
      }
      main.dataset.floatMaximized = '';
      if (prev) {
        main.style.width = `${prev.width}px`;
        main.style.height = `${prev.height}px`;
        main.style.left = `${prev.left}px`;
        main.style.top = `${prev.top}px`;
      } else {
        placeBottomTablesFloatingPanel();
      }
    } else {
      const rect = main.getBoundingClientRect();
      main.dataset.floatPrevBox = JSON.stringify({
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
      const topBrand = getBrandBarHeight();
      main.dataset.floatMaximized = '1';
      main.style.left = '8px';
      main.style.top = `${topBrand + 8}px`;
      main.style.width = `${window.innerWidth - 16}px`;
      main.style.height = `${window.innerHeight - topBrand - 20}px`;
    }
    syncBottomTablesMaximizeBtn();
    clampBottomTablesFloatingPanel();
    saveBottomTablesFloatState();
    requestMapResize();
  }

  function expandBottomTablesDocked() {
    document.body.classList.remove('bottom-tables-docked-collapsed');
    requestMapResize();
  }

  function collapseBottomTablesDocked() {
    if (!document.body.classList.contains('bottom-tables-step34')) return;
    if (document.body.classList.contains('bottom-tables-floating-open')) return;
    document.body.classList.add('bottom-tables-docked-collapsed');
    requestMapResize();
  }

  /** Maximized panels re-fill the viewport; everything else just stays reachable. */
  function onBottomTablesWindowResize() {
    const main = document.getElementById('bottom-tables-main');
    if (!main || !main.classList.contains('bottom-tables-main--floating')) return;
    if (isBottomTablesFloatMaximized()) {
      const topBrand = getBrandBarHeight();
      main.style.left = '8px';
      main.style.top = `${topBrand + 8}px`;
      main.style.width = `${window.innerWidth - 16}px`;
      main.style.height = `${window.innerHeight - topBrand - 20}px`;
      return;
    }
    const rect = main.getBoundingClientRect();
    const w = Math.min(Math.max(rect.width, BOTTOM_TABLES_FLOAT_MIN_W), bottomTablesFloatMaxWidth());
    const h = Math.min(Math.max(rect.height, BOTTOM_TABLES_FLOAT_MIN_H), bottomTablesFloatMaxHeight());
    main.style.width = `${Math.round(w)}px`;
    main.style.height = `${Math.round(h)}px`;
    clampBottomTablesFloatingPanel();
  }

  function hideBottomTablesFloating() {
    const main = document.getElementById('bottom-tables-main');
    document.body.classList.remove('bottom-tables-floating-open');
    document.body.classList.remove('bottom-tables-docked-collapsed');
    if (main) {
      saveBottomTablesFloatState();
      main.classList.remove('bottom-tables-main--floating');
      main.dataset.floatMaximized = '';
      main.style.width = '';
      main.style.height = '';
      main.style.left = '';
      main.style.top = '';
      main.style.right = '';
      main.style.bottom = '';
    }
    try {
      window.removeEventListener('resize', onBottomTablesWindowResize);
    } catch {}
    requestMapResize();
  }

  function showBottomTablesFloating() {
    const main = document.getElementById('bottom-tables-main');
    if (!main) return;
    document.body.classList.remove('bottom-tables-docked-collapsed');
    main.classList.add('bottom-tables-main--floating');
    document.body.classList.add('bottom-tables-floating-open');
    placeBottomTablesFloatingPanel();
    syncBottomTablesMaximizeBtn();
    try {
      window.removeEventListener('resize', onBottomTablesWindowResize);
      window.addEventListener('resize', onBottomTablesWindowResize);
    } catch {}
    requestMapResize();
    setTimeout(() => { try { clampBottomTablesFloatingPanel(); } catch {} }, 0);
  }

  function initBottomTablesFloatingDrag() {
    const handle = document.querySelector('.bottom-tables-float-drag');
    const main = document.getElementById('bottom-tables-main');
    if (!handle || !main || handle.__bottomTablesDragInit) return;
    handle.__bottomTablesDragInit = true;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let baseLeft = 0;
    let baseTop = 0;

    handle.addEventListener('mousedown', (ev) => {
      if (ev.button !== 0) return;
      if (!main.classList.contains('bottom-tables-main--floating')) return;
      ev.preventDefault();
      dragging = true;
      startX = ev.clientX;
      startY = ev.clientY;
      baseLeft = parseFloat(main.style.left) || main.getBoundingClientRect().left;
      baseTop = parseFloat(main.style.top) || main.getBoundingClientRect().top;
      document.body.style.userSelect = 'none';
    });

    handle.addEventListener('dblclick', (ev) => {
      ev.preventDefault();
      toggleBottomTablesFloatMaximized();
    });

    document.addEventListener('mousemove', (ev) => {
      if (!dragging) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      main.style.left = `${Math.round(baseLeft + dx)}px`;
      main.style.top = `${Math.round(baseTop + dy)}px`;
      clampBottomTablesFloatingPanel();
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.userSelect = '';
      // Dragging away from a filled-window layout means it is no longer maximized.
      if (isBottomTablesFloatMaximized()) {
        main.dataset.floatMaximized = '';
        syncBottomTablesMaximizeBtn();
      }
      saveBottomTablesFloatState();
    });
  }

  const BOTTOM_TABLES_RESIZE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

  /** Eight-way resize for the floating results tables panel. */
  function initBottomTablesFloatingResize() {
    const main = document.getElementById('bottom-tables-main');
    if (!main || main.__bottomTablesResizeInit) return;
    main.__bottomTablesResizeInit = true;

    let active = null;

    BOTTOM_TABLES_RESIZE_DIRS.forEach((dir) => {
      const grip = document.createElement('div');
      grip.className = `bottom-tables-resize-handle bottom-tables-resize-${dir}`;
      grip.dataset.dir = dir;
      main.appendChild(grip);
      grip.addEventListener('mousedown', (ev) => {
        if (ev.button !== 0) return;
        if (!main.classList.contains('bottom-tables-main--floating')) return;
        ev.preventDefault();
        ev.stopPropagation();
        const rect = main.getBoundingClientRect();
        active = {
          dir,
          x: ev.clientX,
          y: ev.clientY,
          left: rect.left,
          top: rect.top,
          w: rect.width,
          h: rect.height,
        };
        document.body.style.userSelect = 'none';
        document.body.style.cursor = window.getComputedStyle(grip).cursor;
      });
    });

    document.addEventListener('mousemove', (ev) => {
      if (!active) return;
      const dx = ev.clientX - active.x;
      const dy = ev.clientY - active.y;
      let w = active.w;
      let h = active.h;
      if (active.dir.includes('e')) w = active.w + dx;
      if (active.dir.includes('w')) w = active.w - dx;
      if (active.dir.includes('s')) h = active.h + dy;
      if (active.dir.includes('n')) h = active.h - dy;
      w = Math.min(Math.max(w, BOTTOM_TABLES_FLOAT_MIN_W), bottomTablesFloatMaxWidth());
      h = Math.min(Math.max(h, BOTTOM_TABLES_FLOAT_MIN_H), bottomTablesFloatMaxHeight());
      // Pulling a top/left edge keeps the opposite edge pinned in place.
      const left = active.dir.includes('w') ? active.left + (active.w - w) : active.left;
      const top = active.dir.includes('n') ? active.top + (active.h - h) : active.top;
      main.style.width = `${Math.round(w)}px`;
      main.style.height = `${Math.round(h)}px`;
      main.style.left = `${Math.round(left)}px`;
      main.style.top = `${Math.round(top)}px`;
    });

    document.addEventListener('mouseup', () => {
      if (!active) return;
      active = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      if (isBottomTablesFloatMaximized()) {
        main.dataset.floatMaximized = '';
        syncBottomTablesMaximizeBtn();
      }
      clampBottomTablesFloatingPanel();
      saveBottomTablesFloatState();
      requestMapResize();
    });
  }

  function applyBottomTablesStepMode(stepNum) {
    const n = Number(stepNum);
    const is34 = n === 3 || n === 4;
    const wasOutside34 = prevBottomTablesStep !== 3 && prevBottomTablesStep !== 4;

    if (!is34) {
      document.body.classList.remove('bottom-tables-step34', 'bottom-tables-floating-open', 'bottom-tables-docked-collapsed');
      hideBottomTablesFloating();
      prevBottomTablesStep = n;
      return;
    }

    document.body.classList.add('bottom-tables-step34');
    const main = document.getElementById('bottom-tables-main');
    const wasFloating = !!(main && main.classList.contains('bottom-tables-main--floating'));

    if (!wasFloating) {
      document.body.classList.remove('bottom-tables-floating-open');
      if (main) {
        main.classList.remove('bottom-tables-main--floating');
        main.style.width = '';
        main.style.height = '';
        main.style.left = '';
        main.style.top = '';
        main.style.right = '';
        main.style.bottom = '';
      }
      try {
        window.removeEventListener('resize', onBottomTablesWindowResize);
      } catch {}
      if (wasOutside34) {
        document.body.classList.add('bottom-tables-docked-collapsed');
      }
    } else {
      document.body.classList.add('bottom-tables-floating-open');
      placeBottomTablesFloatingPanel();
      syncBottomTablesMaximizeBtn();
      try {
        window.removeEventListener('resize', onBottomTablesWindowResize);
        window.addEventListener('resize', onBottomTablesWindowResize);
      } catch {}
    }
    prevBottomTablesStep = n;
    requestMapResize();
  }

  function setActiveStep(stepNum) {
    const stepKey = String(stepNum);
    window.__currentDashboardStep = Number(stepNum);
    document.querySelectorAll('.menu-nav-step[data-step]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.step === stepKey);
    });
    const def = DASHBOARD_STEP_DEFS[Number(stepNum)];
    const numEl = document.getElementById('topBarStepNum');
    const titleEl = document.getElementById('topBarStepTitle');
    if (numEl) numEl.textContent = stepKey;
    if (titleEl && def) titleEl.textContent = def.title;
    if (typeof window.syncMenuPageViewSection === 'function') {
      window.syncMenuPageViewSection(stepNum);
    }
  }

  function setMainView(mode) {
    const step1View = document.getElementById('step1-school-view');
    const mapContainer = document.getElementById('map-container');
    const flowchartContainer = document.getElementById('main-flowchart-container');

    if (step1View) step1View.style.display = (mode === 'step1') ? 'block' : 'none';
    if (mapContainer) mapContainer.style.display = (mode === 'map') ? 'block' : 'none';
    if (flowchartContainer) flowchartContainer.style.display = (mode === 'flowchart') ? 'flex' : 'none';

    if (mode === 'map' && window.map && typeof window.map.resize === 'function') {
      setTimeout(() => {
        try { window.map.resize(); } catch {}
        if (typeof window.scheduleFitMapToAllSchools === 'function') {
          window.scheduleFitMapToAllSchools(80);
        }
      }, 100);
    }
    if (mode === 'map') {
      window.__centerViewPrefersFlowchart = false;
    }
    if (mode === 'flowchart') {
      window.__centerViewPrefersFlowchart = true;
    }
  }

  function applyCenterViewForMapSteps() {
    if (window.__centerViewPrefersFlowchart && typeof window.switchToFlowchart === 'function') {
      window.switchToFlowchart();
    } else if (typeof window.switchToMap === 'function') {
      window.switchToMap();
    } else {
      setMainView(window.__centerViewPrefersFlowchart ? 'flowchart' : 'map');
    }
  }

  function syncSidebarPanelChrome(stepNum) {
    const title = document.getElementById('sidebarPanelTitle');
    const help3 = document.getElementById('sidebarHelpStep3');
    const help4 = document.getElementById('sidebarHelpStep4');
    const n = Number(stepNum);
    if (title) {
      if (n === 3) title.textContent = 'Sort by Strategic Decision';
      else if (n === 4) title.textContent = 'Prioritize within Strategy Groups';
      else title.textContent = '';
    }
    if (help3) help3.hidden = n !== 3;
    if (help4) help4.hidden = n !== 4;
    const resetAllBtn = document.getElementById('resetAllDecisionSlidersBtn');
    if (resetAllBtn) resetAllBtn.hidden = n !== 3;
    const resetWeightsBtn = document.getElementById('resetAllPrioritizationWeightsBtn');
    if (resetWeightsBtn) resetWeightsBtn.hidden = n !== 4;
    document.body.classList.toggle('controls-step-3', n === 3);
    document.body.classList.toggle('controls-step-4', n === 4);
  }

  function setStepPanelsVisibility(stepNum) {
    const decisionInput = document.getElementById('decision-input-panel');
    const decisionOutput = document.getElementById('decision-output-panel');
    const scenarioInput = document.getElementById('scenario-input-panel');
    const scenarioOutput = document.getElementById('scenario-output-panel');

    const hideScenario = Number(stepNum) === 3;
    const hideDecision = Number(stepNum) === 4;

    function applyHidden(el, hidden) {
      if (!el) return;
      el.hidden = !!hidden;
      if (hidden && el.tagName === 'DETAILS') {
        try { el.open = false; } catch {}
      }
    }

    applyHidden(scenarioInput, hideScenario);
    applyHidden(scenarioOutput, hideScenario);
    applyHidden(decisionInput, hideDecision);
    applyHidden(decisionOutput, hideDecision);
    syncSidebarPanelChrome(stepNum);
  }

  function ensurePanelsVisible({ left, right } = {}) {
    const body = document.body;
    const leftToggle = document.getElementById('toggleLeftSidebar');
    const rightToggle = document.getElementById('toggleRightSidebar');
    if (typeof left === 'boolean') {
      if (left) body.classList.remove('sidebar-collapsed');
      else body.classList.add('sidebar-collapsed');
      if (leftToggle) leftToggle.checked = left;
    }
    if (typeof right === 'boolean') {
      if (right) body.classList.remove('right-sidebar-collapsed');
      else body.classList.add('right-sidebar-collapsed');
      if (rightToggle) rightToggle.checked = right;
    }
  }

  function openDetails(id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.hidden) return;
    try { el.open = true; } catch {}
    try {
      // Account for the fixed top brand bar when scrolling panel sections into view.
      const offset = (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--brand-bar-height') || '52', 10) || 52);
      const y = el.getBoundingClientRect().top + window.scrollY - offset - 12;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    } catch {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /** Open Strategic Sorting nested slider groups; keep "Distance to Underutilized…" collapsed. */
  function expandDecisionInputSliderSections() {
    const panel = document.getElementById('decision-input-panel');
    if (!panel || panel.hidden) return;
    panel.querySelectorAll('details.flow-section').forEach((el) => {
      const sm = el.querySelector(':scope > summary');
      const label = sm ? sm.textContent.trim() : '';
      if (label.indexOf('Enrollment Thresholds by School Level') !== -1) return;
      if (label.indexOf('Distance to Underutilized Schools') !== -1) return;
      if (label.indexOf('Distance to Welcoming Schools') !== -1) return;
      try {
        el.open = true;
      } catch {}
    });
  }

  function expandScenarioInputSliderSections() {
    const panel = document.getElementById('scenario-input-panel');
    if (!panel || panel.hidden) return;
  }

  function ensureBottomResultsPanelVisible() {
    const bottomPanel = document.getElementById('map-sidebar');
    if (bottomPanel && bottomPanel.classList.contains('hidden')) {
      bottomPanel.classList.remove('hidden');
    }
    document.body.classList.remove('right-sidebar-collapsed');
    const rightToggle = document.getElementById('toggleRightSidebar');
    if (rightToggle) rightToggle.checked = true;
  }

  let goToStepInProgress = false;

  window._goToStep = goToStep;
  function goToStep(stepNum, opts) {
    opts = opts || {};
    goToStepInProgress = true;
    try {
      setStepPanelsVisibility(stepNum);
      switch (Number(stepNum)) {
        case 1:
          // Step 1 is a dedicated school-level view: no map, no side panels.
          ensurePanelsVisible({ left: false, right: false });
          setMainView('step1');
          break;
        case 2:
          // Step 2 is map exploration: hide both side panels; always show map.
          ensurePanelsVisible({ left: false, right: false });
          window.__centerViewPrefersFlowchart = false;
          setMainView('map');
          try {
            const menuShowMap = document.getElementById('menuShowMap');
            const menuShowFlowchart = document.getElementById('menuShowFlowchart');
            if (menuShowMap) menuShowMap.classList.add('active');
            if (menuShowFlowchart) menuShowFlowchart.classList.remove('active');
          } catch {}
          break;
        case 3:
          ensurePanelsVisible({ left: true, right: true });
          ensureBottomResultsPanelVisible();
          // Steps 3–4 default to flowchart (map remains available via the view toggle).
          window.__centerViewPrefersFlowchart = true;
          applyCenterViewForMapSteps();
          try {
            const menuShowMap = document.getElementById('menuShowMap');
            const menuShowFlowchart = document.getElementById('menuShowFlowchart');
            if (menuShowMap) menuShowMap.classList.remove('active');
            if (menuShowFlowchart) menuShowFlowchart.classList.add('active');
          } catch {}
          expandDecisionInputSliderSections();
          if (opts.preferredTab && typeof window._activateBottomTab === 'function') {
            window._activateBottomTab(opts.preferredTab);
          } else {
            openDetails('decision-output-panel');
          }
          break;
        case 4:
          ensurePanelsVisible({ left: true, right: true });
          ensureBottomResultsPanelVisible();
          // Steps 3–4 default to flowchart (map remains available via the view toggle).
          window.__centerViewPrefersFlowchart = true;
          applyCenterViewForMapSteps();
          try {
            const menuShowMap = document.getElementById('menuShowMap');
            const menuShowFlowchart = document.getElementById('menuShowFlowchart');
            if (menuShowMap) menuShowMap.classList.remove('active');
            if (menuShowFlowchart) menuShowFlowchart.classList.add('active');
          } catch {}
          expandScenarioInputSliderSections();
          if (opts.preferredTab === 'impact-tab' && typeof window._activateBottomTab === 'function') {
            window._activateBottomTab('impact-tab');
          } else {
            openDetails('scenario-output-panel');
          }
          break;
        default:
          break;
      }
      setActiveStep(stepNum);
      applyBottomTablesStepMode(stepNum);
      if (Number(stepNum) === 3 || Number(stepNum) === 4) {
        expandBottomTablesDocked();
      }
    } finally {
      goToStepInProgress = false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initBottomTablesFloatingDrag();
    initBottomTablesFloatingResize();
    const maxBtn = document.getElementById('bottomTablesFloatMaxBtn');
    if (maxBtn) {
      maxBtn.addEventListener('click', (e) => {
        e.preventDefault();
        toggleBottomTablesFloatMaximized();
      });
      syncBottomTablesMaximizeBtn();
    }
    const showTablesBtn = document.getElementById('bottomTablesShowTablesBtn');
    const dockBtn = document.getElementById('bottomTablesDockBtn');
    const hideDockedBtn = document.getElementById('bottomTablesHideDockedBtn');
    const popoutBtn = document.getElementById('bottomTablesPopoutBtn');
    const closeBtn = document.getElementById('bottomTablesFloatCloseBtn');
    if (showTablesBtn) {
      showTablesBtn.addEventListener('click', () => {
        expandBottomTablesDocked();
      });
    }
    if (dockBtn) {
      dockBtn.addEventListener('click', () => {
        hideBottomTablesFloating();
      });
    }
    if (hideDockedBtn) {
      hideDockedBtn.addEventListener('click', () => {
        collapseBottomTablesDocked();
      });
    }
    if (popoutBtn) {
      popoutBtn.addEventListener('click', () => {
        if (!document.body.classList.contains('bottom-tables-step34')) return;
        showBottomTablesFloating();
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        hideBottomTablesFloating();
      });
    }

    // Sync result tables when user opens left-panel sections (Steps 3–4)
    const stepMap = [
      { id: 'decision-output-panel', step: 3 },
      { id: 'scenario-output-panel', step: 4 },
    ];
    stepMap.forEach(({ id, step }) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('toggle', () => {
        if (!el.open || el.hidden || goToStepInProgress) return;
        const current = window.__currentDashboardStep != null
          ? String(window.__currentDashboardStep)
          : null;
        if (current !== String(step)) goToStep(step);
        else setActiveStep(step);
      });
    });

    // Default to Step 2 (map) on landing
    setActiveStep(2);
    setStepPanelsVisibility(2);
    applyBottomTablesStepMode(2);
    // Step 2 should be map-only by default.
    ensurePanelsVisible({ left: false, right: false });
    setMainView('map');
  });
})();

// --- Step 1: School-level data view (no map) ---
(function initStep1SchoolView() {
  function norm(s) {
    return String(s || '').trim().toLowerCase();
  }

  function pickFirstNonEmpty(row, keys) {
    if (!row || !keys || !keys.length) return '';
    for (const k of keys) {
      if (!k) continue;
      const v = row[k];
      const s = (v ?? '').toString().trim();
      if (s) return s;
    }
    return '';
  }

  function pickSchoolLevelFromRow(row) {
    return pickFirstNonEmpty(row, ['School Level', 'School level', 'SchoolLevel']) || '';
  }

  function pickGradesServedFromRow(row) {
    const fromRow = pickFirstNonEmpty(row, [
      'Grades Served',
      'GradesServed',
      'Grades',
      'Grade Levels',
      'GradeLevels',
    ]);
    if (fromRow) return fromRow;
    const uid = norm(row?.UniqueID || row?.['UniqueID'] || '');
    const byId = window.gradesServedByOriginId;
    if (uid && byId && byId[uid]) return String(byId[uid]).trim();
    return '';
  }

  const OPTION_SCHOOLS_AREA_LABEL = 'Option Schools';
  const OPTION_SCHOOLS_AREA_KEY = '__option_schools__';
  const OFFICIAL_OPTION_SCHOOL_IDS = new Set([
    'CO-1420-0965', // Brady Exploration
    'CO-1420-4798', // Connections Learning Center on Earle Johnson Campus
    'CO-1420-2120', // D'Evelyn Jr/Sr High
    'CO-1420-9432', // Dennison Elementary
    'CO-1420-5892', // Fletcher Miller Special Education
    'CO-1420-3088', // Foster Dual Language K-8
    'CO-1420-3201', // Free Horizon Montessori
    'CO-1420-4127', // Jeffco Remote Learning
    'CO-1420-4408', // Jeffco Virtual Academy
    'CO-1420-6539', // Jefferson County Open Elementary
    'CO-1420-6541', // Jefferson County Open Secondary
    'CO-1420-5623', // Long View High School
    'CO-1420-5472', // Manning Options
    'CO-1420-0033', // McLain Community High
    'CO-1420-8036', // Sobesky Academy
    'CO-1420-9234', // Warren Tech Central
    'CO-1420-9245'  // Warren Tech North
  ]);

  function getRowUniqueId(row) {
    return String(row?.UniqueID || row?.['UniqueID'] || row?.['Unique Id'] || '').trim();
  }

  function isOfficialOptionSchoolStep1(row) {
    return OFFICIAL_OPTION_SCHOOL_IDS.has(getRowUniqueId(row));
  }

  function getArticulationAreaDisplayForStep1(row) {
    if (isOfficialOptionSchoolStep1(row)) return OPTION_SCHOOLS_AREA_LABEL;
    const raw = pickFirstNonEmpty(row, ['Articulation Area', 'ArticulationArea', 'Articulation']);
    const key = normalizeArticulationKeyStep1(raw);
    if (isValidArticulationAreaKey(key)) return String(raw).trim();
    return 'No Articulation Area';
  }

  function parseNumber(v) {
    if (v === null || typeof v === 'undefined') return null;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const s = String(v).trim();
    if (!s) return null;
    // Remove commas and percent signs (we'll infer percent by column name elsewhere)
    const cleaned = s.replace(/,/g, '').replace(/%/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  // BuildingScore may be stored either on a 0–1 scale (e.g. 0.62)
  // or a 0–10 scale (e.g. 6.20). Normalize to 0–10 for dashboard logic.
  function coerceBuildingScore0to10(raw) {
    const n = parseNumber(raw);
    if (!Number.isFinite(n)) return null;
    return n <= 1.5 ? n * 10 : n;
  }

  function clamp(n, a, b) {
    if (!Number.isFinite(n)) return a;
    return Math.min(b, Math.max(a, n));
  }

  function fmtInt(n) {
    if (!Number.isFinite(n)) return '';
    return Math.round(n).toLocaleString();
  }

  function fmtPctFromUnit(n) {
    if (!Number.isFinite(n)) return '';
    return `${(n * 100).toFixed(1)}%`;
  }

  function fmtPct(n) {
    if (!Number.isFinite(n)) return '';
    return `${n.toFixed(1)}%`;
  }

  function fmtGrowthPctSmart(raw) {
    const n = parseNumber(raw);
    if (!Number.isFinite(n)) return '';
    const pct = (n >= -1.5 && n <= 1.5) ? (n * 100) : n;
    return `${pct.toFixed(1)}%`;
  }

  function htmlEscape(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getSchoolName(row) {
    if (!row) return '';
    const pick =
      typeof window.pickDecisionRowField === 'function' ? window.pickDecisionRowField : null;
    if (pick) {
      const fromPick = pick(row, 'buildingName') || pick(row, 'schoolName');
      if (fromPick != null && String(fromPick).trim()) return String(fromPick).trim();
    }
    return (
      row['Building Name'] ||
      row.SchoolName ||
      row['School Name'] ||
      row.School ||
      row.Name ||
      ''
    );
  }

  function findDecisionRowBySchoolName(name) {
    const rows = getDecisionSchoolRows();
    if (!rows || !rows.length || !name) return null;
    const n = norm(name);
    return rows.find((r) => norm(getSchoolName(r)) === n) || null;
  }

  function updateStep1OpenProjectListBtnState() {
    // Action pill lives in the expanded school KPI row; no header button state to sync.
  }

  function openStep1SchoolProjectList(schoolNameOpt) {
    const select = document.getElementById('step1SchoolSelect');
    const name =
      (schoolNameOpt && String(schoolNameOpt).trim()) ||
      (select && select.value) ||
      step1PortfolioState.selectedSchoolName ||
      '';
    if (!name) {
      try {
        window.alert('Select a school first, then open the School Project List.');
      } catch (_) {}
      return;
    }
    if (select && select.value !== name) {
      try { select.value = name; } catch (_) {}
    }
    const row = findDecisionRowBySchoolName(name);
    const uid = row ? (row.UniqueID || row['UniqueID'] || '').toString() : '';
    let url =
      `school-profile.html?school=${encodeURIComponent(name)}` +
      (uid ? `&uid=${encodeURIComponent(uid)}` : '') +
      '&popout=1';
    try {
      url = new URL(url, window.location.href).href;
    } catch (_) {}
    const opener = window.openDashboardPopout || window.open;
    const opened = opener(url);
    if (!opened && !window.__JEFFCO_DESKTOP__) {
      try {
        window.location.href = url;
      } catch (_) {}
    }
  }

  function bindStep1OpenProjectListBtn() {
    const root = document.getElementById('step1-school-view');
    if (!root || root.dataset.step1OpenBound === '1') return;
    root.dataset.step1OpenBound = '1';
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('.step1-open-project-list-pill, #step1OpenSchoolProfileBtn');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const name = btn.getAttribute('data-school-name') || '';
      openStep1SchoolProjectList(name);
    });
  }
  try {
    window.openStep1SchoolProjectList = openStep1SchoolProjectList;
  } catch (_) {}

  function getDecisionSchoolRows() {
    const rows = window.decisionLogic && Array.isArray(window.decisionLogic.schoolData) ? window.decisionLogic.schoolData : [];
    const merged = [];
    const seen = new Set();
    const add = (row) => {
      if (!row) return;
      const key = getRowUniqueId(row) || `name:${norm(getSchoolName(row))}`;
      if (!key || seen.has(key)) return;
      seen.add(key);
      merged.push(row);
    };
    rows.forEach(add);
    (decisionAllRows || [])
      .filter((row) => isOfficialOptionSchoolStep1(row))
      .forEach(add);
    return merged;
  }

  function buildStep1DecisionRowLookups() {
    const rows = (Array.isArray(decisionAllRows) && decisionAllRows.length > 0)
      ? decisionAllRows
      : getDecisionSchoolRows();
    const byId = new Map();
    const byName = new Map();
    (rows || []).forEach((row) => {
      const id = norm(getRowUniqueId(row));
      const name = norm(getSchoolName(row));
      if (id && !byId.has(id)) byId.set(id, row);
      if (name && !byName.has(name)) byName.set(name, row);
    });
    return { byId, byName };
  }

  function isActiveSchoolDistanceCandidate(row) {
    if (!row) return false;
    const status = norm(pickFirstNonEmpty(row, ['Status', 'status']));
    if (status !== 'active') return false;
    const name = norm(getSchoolName(row));
    if (!name || name.includes('central services') || name.includes('transition services')) return false;
    return true;
  }

  // Rebuilding the row lookups per school made this O(n^2) on every slider move,
  // and the flowchart now calls it for every school. Cache per (rows, threshold).
  let nearestUnderutilizedCache = null;
  function getNearestUnderutilizedContext() {
    const grouped = window.schoolDistancesByOrigin || schoolDistancesByOrigin || {};
    const { low } = getUtilizationThresholds();
    const rowCount = (decisionAllRows || []).length;
    const originCount = Object.keys(grouped).length;
    const capacitySource = (window.getCapacitySource && window.getCapacitySource()) || '';
    const includePK = !!(window.getIncludePKInEnrollment && window.getIncludePKInEnrollment());
    const token = `${rowCount}|${originCount}|${low}|${capacitySource}|${includePK}`;
    if (!nearestUnderutilizedCache || nearestUnderutilizedCache.token !== token) {
      nearestUnderutilizedCache = {
        token,
        grouped,
        low,
        lookups: buildStep1DecisionRowLookups(),
        results: new Map()
      };
    }
    return nearestUnderutilizedCache;
  }
  function invalidateNearestUnderutilizedCache() {
    nearestUnderutilizedCache = null;
  }
  window.invalidateNearestUnderutilizedCache = invalidateNearestUnderutilizedCache;

  function getNearestUnderutilizedOverlappingSchool(row) {
    const originId = norm(getRowUniqueId(row));
    if (!originId) return null;
    const ctx = getNearestUnderutilizedContext();
    if (ctx.results.has(originId)) return ctx.results.get(originId);
    const grouped = ctx.grouped;
    const rows = grouped[originId] || [];
    if (!rows.length) {
      ctx.results.set(originId, null);
      return null;
    }

    const { byId, byName } = ctx.lookups;
    const low = ctx.low;
    let best = null;

    rows.forEach((distanceRow) => {
      const overlap = cleanNearbyCsvText(distanceRow.gradeOverlap);
      if (!overlap || norm(overlap) === 'no') return;
      const destId = norm(distanceRow.destId);
      if (!destId || destId === originId) return;
      const destNameKey = norm(distanceRow.destName);
      const destRow = byId.get(destId) || byName.get(destNameKey);
      if (!isActiveSchoolDistanceCandidate(destRow)) return;
      const util = window.getEffectiveUtilization ? window.getEffectiveUtilization(destRow) : null;
      if (!Number.isFinite(util) || util >= low) return;
      const distanceMiles = parseNumber(distanceRow.distanceMiles);
      if (!Number.isFinite(distanceMiles)) return;
      if (!best || distanceMiles < best.distanceMiles) {
        best = {
          distanceMiles,
          schoolName: getSchoolName(destRow) || distanceRow.destName || '',
          utilization: util
        };
      }
    });

    ctx.results.set(originId, best);
    return best;
  }
  window.getNearestUnderutilizedOverlappingSchool = getNearestUnderutilizedOverlappingSchool;

  /**
   * Single source of truth for "distance to welcoming schools".
   * Decision Data Export no longer ships a DistanceUnderutilizedschools column, so the
   * school-to-school matrix drives this; the CSV columns stay as a fallback for datasets
   * that still provide them. Returns null when no underutilized overlapping school exists.
   */
  function resolveDistanceToWelcomingSchool(row) {
    if (!row) return null;
    const nearest = getNearestUnderutilizedOverlappingSchool(row);
    if (nearest && Number.isFinite(nearest.distanceMiles)) return nearest.distanceMiles;
    const raw = pickFirstNonEmpty(row, [
      'DistanceUnderutilizedschools',
      'Distance Underutilized Schools',
      'Distance to Underutilized'
    ]);
    const n = parseNumber(raw);
    return Number.isFinite(n) ? n : null;
  }
  window.resolveDistanceToWelcomingSchool = resolveDistanceToWelcomingSchool;

  // The distance matrix loads asynchronously, so decisions computed before it arrives
  // treat every school as having no welcoming school nearby. Recompute once it lands.
  if (!window.__jeffcoDistanceDecisionRefreshBound) {
    window.__jeffcoDistanceDecisionRefreshBound = true;
    document.addEventListener('jeffco-school-distances-ready', function () {
      invalidateNearestUnderutilizedCache();
      try {
        if (window.decisionLogic && typeof window.decisionLogic.recalculateEverything === 'function') {
          window.decisionLogic.recalculateEverything();
        }
      } catch (err) {
        console.warn('⚠️ Decision refresh after distances load failed:', err);
      }
      try {
        const sel = document.getElementById('mainFlowchartSchoolSelect');
        if (sel && sel.value && typeof window.updateFlowForSchool === 'function') {
          window.updateFlowForSchool(sel.value, window.thresholds);
        }
      } catch (err) {
        console.warn('⚠️ Flowchart refresh after distances load failed:', err);
      }
    });
  }

  function formatPctSmart(raw, { assumeUnitIfSmall = true, decimals = 0 } = {}) {
    const n = parseNumber(raw);
    if (!Number.isFinite(n)) return '';
    // If stored as 0..1, treat as unit and convert to %.
    const pct = (assumeUnitIfSmall && n <= 1.5) ? (n * 100) : n;
    const d = Math.max(0, Math.min(2, Number(decimals) || 0));
    return `${pct.toFixed(d)}%`;
  }

  function kpiTileHtml({ theme, label, value, sub, valueClass }) {
    const safeTheme = theme === 'green' ? 'green' : 'purple';
    const v = (value ?? '').toString().trim();
    const show = v ? htmlEscape(v) : '—';
    const subLine = (sub ?? '').toString().trim();
    const subHtml = subLine ? `<div class="sub">${htmlEscape(subLine)}</div>` : '';
    const vCls = valueClass ? ` ${htmlEscape(valueClass)}` : '';
    return `<div class="step1-kpi-tile ${safeTheme}">
      <div class="label">${htmlEscape(label)}</div>
      <div class="value${vCls}">${show}</div>
      ${subHtml}
    </div>`;
  }

  function step1MetricRowHtml({ label, value, sub, barW, barC, valueColor }) {
    const v = (value ?? '').toString().trim();
    const show = v ? htmlEscape(v) : '—';
    const bar = (typeof barW === 'number')
      ? `<div class="step1-bar" style="--w:${clamp(barW, 0, 100)}%; --c:${barC || '#007cbf'}"><span></span></div>`
      : '';
    const subHtml = (sub ?? '').toString().trim() ? `<div class="step1-metric-sub">${htmlEscape(sub)}</div>` : '';
    const valueAttr = valueColor ? ` style="color:${valueColor}; font-weight:800;"` : '';
    return `<div class="step1-metric">
      <div class="step1-metric-row">
        <div class="step1-metric-label">${htmlEscape(label)}</div>
        <div class="step1-metric-value"${valueAttr}>${show}</div>
      </div>
      ${subHtml}
      ${bar}
    </div>`;
  }

  function computeStep1RollupMetrics(rows) {
    let totalCap = 0;
    let totalEnr = 0;
    let totalSeats = 0;
    let bldgScoreWeightSum = 0;
    let bldgScoreWeight = 0;
    let eduAdeqWeightSum = 0;
    let eduAdeqWeight = 0;

    (rows || []).forEach((row) => {
      const cap = window.getEffectiveCapacity ? window.getEffectiveCapacity(row) : null;
      const enr = window.getEffectiveEnrollment ? window.getEffectiveEnrollment(row) : null;
      const seats = window.getEffectiveAvailableSeats ? window.getEffectiveAvailableSeats(row) : null;

      if (Number.isFinite(cap) && cap > 0) totalCap += cap;
      if (Number.isFinite(enr)) totalEnr += enr;
      if (Number.isFinite(seats)) totalSeats += seats;

      const bScore = coerceBuildingScore0to10(pickFirstNonEmpty(row, ['BuildingScore', 'Building Score']));
      const eduAdeq = parseNumber(pickFirstNonEmpty(row, ['EducationalAdequacy', 'Educational Adequacy']));
      const w = Number.isFinite(enr) && enr > 0 ? enr : 1;
      if (Number.isFinite(bScore)) {
        bldgScoreWeightSum += bScore * w;
        bldgScoreWeight += w;
      }
      if (Number.isFinite(eduAdeq)) {
        eduAdeqWeightSum += eduAdeq * w;
        eduAdeqWeight += w;
      }
    });

    const util = totalCap > 0 ? totalEnr / totalCap : null;
    const avgBldg = bldgScoreWeight > 0 ? bldgScoreWeightSum / bldgScoreWeight : null;
    const avgEdu = eduAdeqWeight > 0 ? eduAdeqWeightSum / eduAdeqWeight : null;
    const capLabel = window.getCapacitySourceLabel ? window.getCapacitySourceLabel() : 'Capacity';
    const yl = window.yearLabels || {};

    return {
      schoolCount: (rows || []).length,
      totalCap,
      totalEnr,
      totalSeats,
      util,
      avgBldg,
      avgEdu,
      capLabel,
      utilizationLabel: yl.utilizationCard ? yl.utilizationCard() : 'Utilization (25-26)',
      enrollmentLabel: yl.enrollmentCard ? yl.enrollmentCard() : 'Enrollment',
    };
  }

  const step1PortfolioState = {
    search: '',
    sortKey: 'utilization',
    sortDir: 'desc',
    panelWidth: null,
    panelFullWidth: false,
    selectedAreaKey: null,
    selectedSchoolName: null,
    /** Multi-select (checkboxes / filter bar). Empty = no filter (show all). */
    checkedAreaKeys: new Set(),
    checkedSchoolNames: new Set(),
  };

  function step1AreaIsChecked(key) {
    return step1PortfolioState.checkedAreaKeys.has(key);
  }

  function step1SchoolIsChecked(name) {
    if (!name) return false;
    const n = norm(name);
    for (const s of step1PortfolioState.checkedSchoolNames) {
      if (norm(s) === n) return true;
    }
    return false;
  }

  function toggleStep1CheckedArea(key, force) {
    if (!key) return;
    const on = force === undefined ? !step1AreaIsChecked(key) : !!force;
    if (on) step1PortfolioState.checkedAreaKeys.add(key);
    else step1PortfolioState.checkedAreaKeys.delete(key);
  }

  function toggleStep1CheckedSchool(name, force) {
    if (!name) return;
    const on = force === undefined ? !step1SchoolIsChecked(name) : !!force;
    // Keep a single canonical name in the set.
    for (const s of [...step1PortfolioState.checkedSchoolNames]) {
      if (norm(s) === norm(name)) step1PortfolioState.checkedSchoolNames.delete(s);
    }
    if (on) step1PortfolioState.checkedSchoolNames.add(name);
  }

  function syncStep1FilterBarLabels() {
    const artBtn = document.getElementById('step1AreaMultiBtn');
    const schoolBtn = document.getElementById('step1SchoolMultiBtn');
    const areaN = step1PortfolioState.checkedAreaKeys.size;
    const schoolN = step1PortfolioState.checkedSchoolNames.size;
    if (artBtn) {
      if (areaN === 0) artBtn.textContent = 'All Areas';
      else if (areaN === 1) {
        const key = [...step1PortfolioState.checkedAreaKeys][0];
        const input = document.querySelector(`#step1AreaMultiMenu input.step1-area-multi-cb[value="${CSS.escape ? CSS.escape(key) : key.replace(/"/g, '\\"')}"]`);
        const text = input?.closest('label')?.querySelector('.step1-multi-option-text')?.textContent || '';
        artBtn.textContent = (text.split('—')[0] || '').trim() || '1 area';
      } else {
        artBtn.textContent = `${areaN} areas`;
      }
    }
    if (schoolBtn) {
      if (schoolN === 0) schoolBtn.textContent = 'All Schools';
      else if (schoolN === 1) schoolBtn.textContent = mainDisplaySchoolName([...step1PortfolioState.checkedSchoolNames][0]);
      else schoolBtn.textContent = `${schoolN} schools`;
    }
  }

  function getArticulationAreaKeyForSchoolRow(row) {
    if (isOfficialOptionSchoolStep1(row)) return OPTION_SCHOOLS_AREA_KEY;
    const raw = pickFirstNonEmpty(row, ['Articulation Area', 'ArticulationArea', 'Articulation']);
    const key = normalizeArticulationKeyStep1(raw);
    return isValidArticulationAreaKey(key) ? key : null;
  }

  function openStep1SchoolInPortfolio(schoolName, { syncSelect = true } = {}) {
    if (!schoolName) {
      step1PortfolioState.selectedSchoolName = null;
      return false;
    }
    const row = findDecisionRowBySchoolName(schoolName);
    if (!row) return false;
    const areaKey = getArticulationAreaKeyForSchoolRow(row);
    if (areaKey) step1PortfolioState.selectedAreaKey = areaKey;
    step1PortfolioState.selectedSchoolName = schoolName;
    if (syncSelect) {
      const select = document.getElementById('step1SchoolSelect');
      if (select && select.value !== schoolName) select.value = schoolName;
    }
    const artSel = document.getElementById('step1CompareArticulationSelect');
    if (artSel && areaKey && artSel.value !== areaKey) artSel.value = areaKey;
    updateStep1OpenProjectListBtnState();
    return true;
  }

  function getStep1AreaSortValue(entry, sortKey) {
    const m = entry.metrics;
    switch (sortKey) {
      case 'label': return entry.label || '';
      case 'schools': return entry.count ?? null;
      case 'capacity': return m.totalCap ?? null;
      case 'enrollment': return m.totalEnr ?? null;
      case 'utilization': return m.util ?? null;
      case 'seats': return m.totalSeats ?? null;
      case 'building': return m.avgBldg ?? null;
      case 'adequacy': return m.avgEdu ?? null;
      default: return null;
    }
  }

  function sortStep1AreaEntries(entries, sortKey, sortDir) {
    const key = sortKey || 'utilization';
    const dir = sortDir === 'asc' ? 1 : -1;
    return entries.slice().sort((a, b) => {
      const va = getStep1AreaSortValue(a, key);
      const vb = getStep1AreaSortValue(b, key);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'string' || typeof vb === 'string') {
        return dir * String(va).localeCompare(String(vb), undefined, { sensitivity: 'base', numeric: true });
      }
      return dir * (va - vb);
    });
  }

  function updateStep1SortHeaderIndicators() {
    document.querySelectorAll('.step1-portfolio-table thead th[data-sort-key]').forEach((th) => {
      const key = th.getAttribute('data-sort-key');
      const ind = th.querySelector('.step1-sort-indicator');
      const active = key === step1PortfolioState.sortKey;
      th.classList.toggle('is-sorted', active);
      th.setAttribute('aria-sort', active ? (step1PortfolioState.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
      if (ind) ind.textContent = active ? (step1PortfolioState.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    });
  }

  function handleStep1ColumnSort(sortKey) {
    if (!sortKey) return;
    if (step1PortfolioState.sortKey === sortKey) {
      step1PortfolioState.sortDir = step1PortfolioState.sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      step1PortfolioState.sortKey = sortKey;
      step1PortfolioState.sortDir = sortKey === 'label' ? 'asc' : 'desc';
    }
  }

  function step1PortfolioUtilColor(pct) {
    if (!Number.isFinite(pct)) return '#94a3b8';
    if (pct >= 70) return '#16a34a';
    if (pct >= 50) return '#f59e0b';
    return '#dc2626';
  }

  function step1PortfolioEduColor(pct) {
    if (!Number.isFinite(pct)) return '#94a3b8';
    if (pct >= 70) return '#16a34a';
    if (pct >= 50) return '#f59e0b';
    return '#dc2626';
  }

  function step1PortfolioDonutHtml(pct) {
    if (!Number.isFinite(pct)) return '<div class="step1-util-donut" style="--p:0;--c:#94a3b8"><div class="step1-util-donut-inner">—</div></div>';
    const p = clamp(pct, 0, 100);
    const c = step1PortfolioUtilColor(p);
    return `<div class="step1-util-donut" style="--p:${p.toFixed(1)};--c:${c}"><div class="step1-util-donut-inner">${Math.round(p)}%</div></div>`;
  }

  function step1PortfolioMiniBarHtml(pct, color) {
    if (!Number.isFinite(pct)) return '';
    const w = clamp(pct, 0, 100);
    return `<div class="step1-portfolio-mini-bar"><span style="width:${w}%;background:${color || step1PortfolioUtilColor(w)}"></span></div>`;
  }

  function step1PortfolioSchoolCountLabel(count) {
    const n = Number(count);
    if (!Number.isFinite(n) || n < 0) return '';
    return n === 1 ? '1 school' : `${n} schools`;
  }

  function step1PortfolioSectionTitle(name, schoolCount) {
    const label = (name ?? '').toString().trim();
    const countLabel = step1PortfolioSchoolCountLabel(schoolCount);
    if (!label) return countLabel || '';
    return countLabel ? `${label} (${countLabel})` : label;
  }

  function buildStep1DistrictSummaryTopCard({ title, metrics }) {
    return `<div class="step1-portfolio-kpi-section">
      <div class="step1-portfolio-kpi-section-header">
        <div class="step1-portfolio-kpi-section-title">${htmlEscape(title)}</div>
        <div class="step1-portfolio-kpi-section-actions step1-portfolio-kpi-section-actions--spacer" aria-hidden="true"></div>
      </div>
      <div class="step1-portfolio-kpi-grid">${buildStep1PortfolioKpisHtml(metrics)}</div>
    </div>`;
  }

  function step1PortfolioKpiHtml({ iconClass, icon, label, value, donutHtml, sub }) {
    if (donutHtml) {
      return `<div class="step1-portfolio-kpi step1-portfolio-kpi--donut">
        ${donutHtml}
        <div class="step1-portfolio-kpi-body">
          <div class="step1-portfolio-kpi-label">${htmlEscape(label)}</div>
        </div>
      </div>`;
    }
    const subLine = (sub ?? '').toString().trim();
    const subHtml = subLine ? `<div class="step1-portfolio-kpi-sub">${htmlEscape(subLine)}</div>` : '';
    return `<div class="step1-portfolio-kpi">
      <div class="step1-summary-metric-icon ${iconClass || 'cap'}">${icon || '&#9632;'}</div>
      <div class="step1-portfolio-kpi-body">
        <div class="step1-portfolio-kpi-label">${htmlEscape(label)}</div>
        <div class="step1-portfolio-kpi-value">${htmlEscape((value ?? '').toString().trim() || '—')}</div>
        ${subHtml}
      </div>
    </div>`;
  }

  function buildStep1PortfolioKpisHtml(metrics) {
    const utilPct = Number.isFinite(metrics.util) ? metrics.util * 100 : null;
    const eduPct = Number.isFinite(metrics.avgEdu)
      ? clamp((metrics.avgEdu <= 1.5 ? metrics.avgEdu * 100 : metrics.avgEdu), 0, 100)
      : null;
    const yl = window.yearLabels || {};
    return [
      step1PortfolioKpiHtml({
        iconClass: 'cap',
        icon: '&#9632;',
        label: metrics.capLabel || 'Capacity',
        value: Number.isFinite(metrics.totalCap) && metrics.totalCap > 0 ? fmtInt(metrics.totalCap) : '',
      }),
      step1PortfolioKpiHtml({
        iconClass: 'enr',
        icon: '&#9679;',
        label: metrics.enrollmentLabel || 'Enrollment',
        value: Number.isFinite(metrics.totalEnr) ? fmtInt(metrics.totalEnr) : '',
      }),
      step1PortfolioKpiHtml({
        iconClass: 'enr',
        icon: '',
        label: yl.utilizationCard ? yl.utilizationCard() : (metrics.utilizationLabel || 'Utilization'),
        donutHtml: step1PortfolioDonutHtml(utilPct),
      }),
      step1PortfolioKpiHtml({
        iconClass: 'seats',
        icon: '&#9633;',
        label: 'Available Seats',
        value: Number.isFinite(metrics.totalSeats) ? fmtInt(metrics.totalSeats) : '',
      }),
      step1PortfolioKpiHtml({
        iconClass: 'bldg',
        icon: '&#9733;',
        label: 'Building Score',
        value: Number.isFinite(metrics.avgBldg) ? `${metrics.avgBldg.toFixed(1)}/10` : '',
      }),
      step1PortfolioKpiHtml({
        iconClass: 'edu',
        icon: '&#127891;',
        label: 'Educational Adequacy',
        value: Number.isFinite(eduPct) ? fmtPct(eduPct) : '',
      }),
    ].join('');
  }

  function buildStep1AreaTableRow(entry, yl) {
    const { valueKey, label, count, metrics } = entry;
    const utilPct = Number.isFinite(metrics.util) ? metrics.util * 100 : null;
    const eduPct = Number.isFinite(metrics.avgEdu)
      ? clamp((metrics.avgEdu <= 1.5 ? metrics.avgEdu * 100 : metrics.avgEdu), 0, 100)
      : null;
    const utilColor = step1PortfolioUtilColor(utilPct);
    const eduColor = step1PortfolioEduColor(eduPct);
    const selected = step1PortfolioState.selectedAreaKey === valueKey ? ' is-selected' : '';
    const checked = step1AreaIsChecked(valueKey) ? ' is-checked' : '';
    const utilLabel = yl.utilizationCard ? yl.utilizationCard() : 'Utilization';

    return `<tr data-area-key="${htmlEscape(valueKey)}" class="${(selected + checked).trim()}">
      <td class="col-check">
        <input type="checkbox" class="step1-row-check step1-area-row-check" data-area-key="${htmlEscape(valueKey)}"
          aria-label="Select ${htmlEscape(label)}" ${step1AreaIsChecked(valueKey) ? 'checked' : ''} />
      </td>
      <td class="col-area" title="${htmlEscape(label)}">${htmlEscape(label)}</td>
      <td class="col-schools">${count}</td>
      <td class="col-cap">${Number.isFinite(metrics.totalCap) && metrics.totalCap > 0 ? fmtInt(metrics.totalCap) : '—'}</td>
      <td class="col-enr">${Number.isFinite(metrics.totalEnr) ? fmtInt(metrics.totalEnr) : '—'}</td>
      <td class="col-util">
        <div class="step1-portfolio-util-cell" title="${htmlEscape(utilLabel)}">
          <span class="step1-portfolio-util-pct">${Number.isFinite(utilPct) ? fmtPct(utilPct) : '—'}</span>
          ${Number.isFinite(utilPct) ? step1PortfolioMiniBarHtml(utilPct, utilColor) : ''}
        </div>
      </td>
      <td class="col-seats">${Number.isFinite(metrics.totalSeats) ? fmtInt(metrics.totalSeats) : '—'}</td>
      <td class="col-bldg">${Number.isFinite(metrics.avgBldg) ? `${metrics.avgBldg.toFixed(1)}/10` : '—'}</td>
      <td class="col-edu">
        <div class="step1-portfolio-edu-cell">
          <span class="step1-portfolio-util-pct">${Number.isFinite(eduPct) ? fmtPct(eduPct) : '—'}</span>
          ${Number.isFinite(eduPct) ? step1PortfolioMiniBarHtml(eduPct, eduColor) : ''}
        </div>
      </td>
    </tr>`;
  }

  function buildStep1AreaDetailKpisHtml(metrics) {
    return buildStep1PortfolioKpisHtml(metrics);
  }

  function buildStep1SchoolExtraPillsHtml(row) {
    const yl = window.yearLabels || {};
    const articulationArea = getArticulationAreaDisplayForStep1(row);
    const schoolLevel = pickSchoolLevelFromRow(row);
    const gradesServed = pickGradesServedFromRow(row);
    const statusRaw = pickFirstNonEmpty(row, ['Status', 'status']) || '';
    const siteCapRaw = pickFirstNonEmpty(row, ['SiteCapacity', 'Site Capacity']) || '';
    const sqftRaw = pickFirstNonEmpty(row, [' SquareFt ', 'SquareFt', 'SquareFt ', 'Square Footage', 'SquareFootage']) || '';
    const yearBuilt = pickFirstNonEmpty(row, ['Year Built', 'YearBuilt', 'Year_Built', 'Build Year', 'Built Year']) || '';
    const buildingLife = pickFirstNonEmpty(row, ['Building Life Expectancy (years)', 'Building Life Expectancy', 'BuildingLifeExpectancy']) || '';
    const desirability = pickFirstNonEmpty(row, ['Desirability of Property', 'Property Desirability', 'Desirability']) || '';
    const terminal = pickFirstNonEmpty(row, ['Transportation Terminal', 'TransportationTerminal', 'Terminal', 'Transportation']) || '';
    const distanceRaw = pickFirstNonEmpty(row, ['DistanceUnderutilizedschools', 'Distance Underutilized Schools', 'Distance to Underutilized']) || '';
    const nearestUnderutilized = getNearestUnderutilizedOverlappingSchool(row);
    const pkRaw = pickFirstNonEmpty(row, ['PKEnrollment', 'PK Enrollment', 'PK Enrollment ']) || '';
    const enrollmentRaw = pickFirstNonEmpty(row, ['Enrollment', 'Enrollment2026', 'Enrollment2025']) || '';
    const recentInv = pickFirstNonEmpty(row, ['RecentInvestments', 'Recent Investments']);

    const enrollment = parseNumber(enrollmentRaw);
    const distance = parseNumber(distanceRaw);
    const pk = parseNumber(pkRaw);
    const sqftNum = parseNumber(sqftRaw);
    const effAttArea = window.getEffectiveAttendanceAreaEnrollment ? window.getEffectiveAttendanceAreaEnrollment(row) : null;
    const effGrowth = window.getEffectiveEnrollmentGrowth ? window.getEffectiveEnrollmentGrowth(row) : null;
    const effEnr = window.getEffectiveEnrollment ? window.getEffectiveEnrollment(row) : enrollment;
    const totalEnr = Number.isFinite(enrollment) ? enrollment : (Number.isFinite(effEnr) && Number.isFinite(pk) ? effEnr + pk : NaN);
    const projEnr = window.getEffectiveProjectedEnrollment ? window.getEffectiveProjectedEnrollment(row) : null;

    const distStr = Number.isFinite(nearestUnderutilized?.distanceMiles)
      ? `${nearestUnderutilized.distanceMiles.toFixed(1)} mi`
      : (Number.isFinite(distance) ? `${distance.toFixed(1)} mi` : (distanceRaw ? distanceRaw.toString().trim() : ''));
    const distSub = nearestUnderutilized?.schoolName ? mainDisplaySchoolName(nearestUnderutilized.schoolName) : '';
    const pkStr = Number.isFinite(pk) ? fmtInt(pk) : (pkRaw ? pkRaw.toString().trim() : '');
    const totalStr = Number.isFinite(totalEnr) ? fmtInt(totalEnr) : '';
    const attAreaStr = (effAttArea != null && Number.isFinite(effAttArea))
      ? formatPctSmart(effAttArea, { assumeUnitIfSmall: true, decimals: 1 }) : '';
    const growthStr = (effGrowth != null && Number.isFinite(effGrowth)) ? fmtGrowthPctSmart(effGrowth) : '';
    const growthSub = (projEnr != null && Number.isFinite(projEnr))
      ? (yl.projEnrollmentSub ? yl.projEnrollmentSub(fmtInt(projEnr)) : `Proj. 2030: ${fmtInt(projEnr)}`)
      : '';

    const pills = [
      step1PortfolioKpiHtml({ iconClass: 'cap', icon: '&#9632;', label: 'Articulation Area', value: articulationArea }),
      step1PortfolioKpiHtml({ iconClass: 'edu', icon: '&#127891;', label: 'School Level', value: schoolLevel }),
      step1PortfolioKpiHtml({ iconClass: 'edu', icon: '&#127891;', label: 'Grades Served', value: gradesServed }),
      step1PortfolioKpiHtml({ iconClass: 'seats', icon: '&#9633;', label: 'Status', value: statusRaw }),
      step1PortfolioKpiHtml({ iconClass: 'cap', icon: '&#9632;', label: 'Site Capacity', value: siteCapRaw }),
      step1PortfolioKpiHtml({ iconClass: 'bldg', icon: '&#9733;', label: 'Square Footage', value: Number.isFinite(sqftNum) ? fmtInt(sqftNum) : sqftRaw }),
      yearBuilt ? step1PortfolioKpiHtml({ iconClass: 'bldg', icon: '&#9733;', label: 'Year Built', value: yearBuilt }) : '',
      buildingLife ? step1PortfolioKpiHtml({ iconClass: 'bldg', icon: '&#9733;', label: 'Building Life Expectancy', value: buildingLife }) : '',
      desirability ? step1PortfolioKpiHtml({ iconClass: 'seats', icon: '&#9633;', label: 'Desirability of Property', value: desirability }) : '',
      terminal ? step1PortfolioKpiHtml({ iconClass: 'seats', icon: '&#9633;', label: 'Transportation Terminal', value: terminal }) : '',
      step1PortfolioKpiHtml({
        iconClass: 'enr',
        icon: '&#9679;',
        label: 'PK Enrollment',
        value: pkStr,
        sub: totalStr ? `Total enrollment: ${totalStr}` : '',
      }),
      step1PortfolioKpiHtml({
        iconClass: 'enr',
        icon: '&#9679;',
        label: yl.attendanceAreaKpi ? yl.attendanceAreaKpi() : 'Attendance Area Enrollment',
        value: attAreaStr,
      }),
      step1PortfolioKpiHtml({
        iconClass: 'enr',
        icon: '&#9679;',
        label: yl.futureGrowthCard ? yl.futureGrowthCard() : 'Future Enrollment Growth (2030)',
        value: growthStr,
        sub: growthSub,
      }),
      step1PortfolioKpiHtml({
        iconClass: 'seats',
        icon: '&#9633;',
        label: 'Distance to Nearest Underutilized School',
        value: distStr,
        sub: distSub,
      }),
      recentInv ? step1PortfolioKpiHtml({ iconClass: 'bldg', icon: '&#9733;', label: 'Recent Investments', value: String(recentInv) }) : '',
      `<button type="button" id="step1OpenSchoolProfileBtn" class="step1-portfolio-kpi step1-portfolio-kpi--action step1-open-project-list-pill" data-school-name="${htmlEscape(getSchoolName(row))}" title="Open School Project List for this school">
        <div class="step1-summary-metric-icon action" aria-hidden="true">↗</div>
        <div class="step1-portfolio-kpi-body">
          <div class="step1-portfolio-kpi-label">School Project List</div>
          <div class="step1-portfolio-kpi-value">Open ↗</div>
        </div>
      </button>`,
    ].filter(Boolean);

    return `<div class="step1-portfolio-kpi-grid step1-portfolio-kpi-grid--dense">${pills.join('')}</div>`;
  }

  function buildStep1SchoolExpandRow(row) {
    return `<tr class="step1-school-expand-row">
      <td colspan="8">
        <div class="step1-school-expand-panel">${buildStep1SchoolExtraPillsHtml(row)}</div>
      </td>
    </tr>`;
  }

  function renderStep1AreaSchoolsTableBody(areaRows, yl) {
    const selected = step1PortfolioState.selectedSchoolName;
    const sortedRows = areaRows
      .slice()
      .filter((row) => getSchoolName(row))
      .sort((a, b) => getSchoolName(a).localeCompare(getSchoolName(b), undefined, { sensitivity: 'base', numeric: true }));
    const parts = [];
    sortedRows.forEach((row) => {
      const name = getSchoolName(row);
      const isExpanded = selected && norm(selected) === norm(name);
      parts.push(buildStep1SchoolTableRow(row, yl, { expanded: isExpanded }));
      if (isExpanded) parts.push(buildStep1SchoolExpandRow(row));
    });
    return parts.join('');
  }

  function buildStep1SchoolTableRow(row, yl, opts) {
    opts = opts || {};
    const expanded = !!opts.expanded;
    const name = getSchoolName(row);
    if (!name) return '';
    const capDetails = window.getEffectiveCapacityDetails ? window.getEffectiveCapacityDetails(row) : null;
    const cap = (capDetails && Number.isFinite(capDetails.value)) ? capDetails.value : null;
    const effEnr = window.getEffectiveEnrollment ? window.getEffectiveEnrollment(row) : null;
    const effUtil = window.getEffectiveUtilization ? window.getEffectiveUtilization(row) : null;
    const utilPct = Number.isFinite(effUtil) ? effUtil * 100 : null;
    const seats = window.getEffectiveAvailableSeats ? window.getEffectiveAvailableSeats(row) : null;
    const bScore = coerceBuildingScore0to10(pickFirstNonEmpty(row, ['BuildingScore', 'Building Score']));
    const eduAdeq = parseNumber(pickFirstNonEmpty(row, ['EducationalAdequacy', 'Educational Adequacy']));
    const eduPct = Number.isFinite(eduAdeq) ? clamp((eduAdeq <= 1.5 ? eduAdeq * 100 : eduAdeq), 0, 100) : null;
    const utilColor = step1PortfolioUtilColor(utilPct);
    const eduColor = step1PortfolioEduColor(eduPct);
    const utilLabel = yl.utilizationCard ? yl.utilizationCard() : 'Utilization';
    const schoolLevel = pickSchoolLevelFromRow(row);
    const gradesServed = pickGradesServedFromRow(row);
    const meta = [schoolLevel, gradesServed].filter(Boolean).join(' · ');
    const title = meta ? `${mainDisplaySchoolName(name)} · ${meta}` : mainDisplaySchoolName(name);
    const expandedCls = expanded ? ' is-expanded' : '';
    const checkedCls = step1SchoolIsChecked(name) ? ' is-checked' : '';
    const chevron = expanded ? '▾' : '▸';

    return `<tr data-school-name="${htmlEscape(name)}" class="step1-school-row${expandedCls}${checkedCls}">
      <td class="col-check">
        <input type="checkbox" class="step1-row-check step1-school-row-check" data-school-name="${htmlEscape(name)}"
          aria-label="Select ${htmlEscape(mainDisplaySchoolName(name))}" ${step1SchoolIsChecked(name) ? 'checked' : ''} />
      </td>
      <td class="col-school-name" title="${htmlEscape(title)}"><span class="step1-school-row-chevron" aria-hidden="true">${chevron}</span>${htmlEscape(mainDisplaySchoolName(name))}</td>
      <td class="col-cap">${Number.isFinite(cap) && cap > 0 ? fmtInt(cap) : '—'}</td>
      <td class="col-enr">${Number.isFinite(effEnr) ? fmtInt(effEnr) : '—'}</td>
      <td class="col-util">
        <div class="step1-portfolio-util-cell" title="${htmlEscape(utilLabel)}">
          <span class="step1-portfolio-util-pct">${Number.isFinite(utilPct) ? fmtPct(utilPct) : '—'}</span>
          ${Number.isFinite(utilPct) ? step1PortfolioMiniBarHtml(utilPct, utilColor) : ''}
        </div>
      </td>
      <td class="col-seats">${Number.isFinite(seats) ? fmtInt(seats) : '—'}</td>
      <td class="col-bldg">${Number.isFinite(bScore) ? `${bScore.toFixed(1)}/10` : '—'}</td>
      <td class="col-edu">
        <div class="step1-portfolio-edu-cell">
          <span class="step1-portfolio-util-pct">${Number.isFinite(eduPct) ? fmtPct(eduPct) : '—'}</span>
          ${Number.isFinite(eduPct) ? step1PortfolioMiniBarHtml(eduPct, eduColor) : ''}
        </div>
      </td>
    </tr>`;
  }

  const STEP1_PORTFOLIO_PANEL_LS = 'step1PortfolioPanelWidth';

  function getStep1PortfolioSplitMetrics() {
    const main = document.getElementById('step1PortfolioMain');
    const resizer = document.getElementById('step1PortfolioSplitResizer');
    if (!main) return null;
    const splitOpen = main.classList.contains('is-split-open');
    const resizerW = (resizer && !resizer.hidden) ? (resizer.offsetWidth || 4) : 0;
    const resizerMargin = splitOpen ? 16 : 0;
    const available = Math.max(0, main.clientWidth - resizerW - resizerMargin);
    return {
      main,
      available,
      resizerW,
      resizerMargin,
      min: 280,
      max: Math.max(280, Math.floor(available * 0.85)),
    };
  }

  function applyStep1PortfolioPanelWidth(widthPx) {
    const main = document.getElementById('step1PortfolioMain');
    if (!main || step1PortfolioState.panelFullWidth) return;
    const m = getStep1PortfolioSplitMetrics();
    if (!m) return;
    let w;
    if (typeof widthPx === 'string' && widthPx.trim().endsWith('%')) {
      w = Math.floor(m.available * (parseFloat(widthPx) / 100));
    } else {
      w = Number(widthPx) || Math.floor(m.available * 0.5);
    }
    w = Math.min(Math.max(w, m.min), m.max);
    main.style.setProperty('--step1-panel-w', `${w}px`);
    step1PortfolioState.panelWidth = w;
  }

  function applyStep1PortfolioPanelLayout() {
    const main = document.getElementById('step1PortfolioMain');
    const panel = document.getElementById('step1AreaDetailPanel');
    const popoutBtn = document.getElementById('step1AreaDetailPopout');
    if (!main) return;
    const panelOpen = !!(panel && !panel.hidden);
    main.classList.toggle('is-split-open', panelOpen && !step1PortfolioState.panelFullWidth);
    main.classList.toggle('is-panel-fullwidth', !!step1PortfolioState.panelFullWidth);
    if (popoutBtn) {
      const expanded = !!step1PortfolioState.panelFullWidth;
      popoutBtn.classList.toggle('is-active', expanded);
      popoutBtn.setAttribute('aria-label', expanded ? 'Restore split view' : 'Expand panel to full width');
      popoutBtn.title = expanded ? 'Restore split view' : 'Expand to full width';
    }
    if (!step1PortfolioState.panelFullWidth && panelOpen) {
      if (step1PortfolioState.panelWidth == null) {
        applyStep1PortfolioPanelWidth('50%');
      } else {
        applyStep1PortfolioPanelWidth(step1PortfolioState.panelWidth);
      }
      setStep1PortfolioSplitVisible(true);
    } else if (step1PortfolioState.panelFullWidth) {
      setStep1PortfolioSplitVisible(false);
    } else if (!panelOpen) {
      setStep1PortfolioSplitVisible(false);
    }
  }

  function toggleStep1PortfolioPanelFullWidth() {
    step1PortfolioState.panelFullWidth = !step1PortfolioState.panelFullWidth;
    applyStep1PortfolioPanelLayout();
    if (!step1PortfolioState.panelFullWidth) {
      try {
        const w = step1PortfolioState.panelWidth;
        if (typeof w === 'number' && Number.isFinite(w)) {
          localStorage.setItem(STEP1_PORTFOLIO_PANEL_LS, String(w));
        }
      } catch (_) {}
    }
  }

  function ensureStep1PortfolioPanelDefaultWidth() {
    if (step1PortfolioState.panelFullWidth) return;
    let saved = null;
    try { saved = localStorage.getItem(STEP1_PORTFOLIO_PANEL_LS); } catch (_) {}
    if (saved && /^\d+$/.test(saved)) {
      applyStep1PortfolioPanelWidth(parseInt(saved, 10));
    } else {
      applyStep1PortfolioPanelWidth('50%');
    }
  }

  function bindStep1PortfolioSplitResizerOnce() {
    if (window.__step1PortfolioSplitBound) return;
    const resizer = document.getElementById('step1PortfolioSplitResizer');
    const main = document.getElementById('step1PortfolioMain');
    const panel = document.getElementById('step1AreaDetailPanel');
    if (!resizer || !main || !panel) return;
    window.__step1PortfolioSplitBound = true;

    let saved = null;
    try { saved = localStorage.getItem(STEP1_PORTFOLIO_PANEL_LS); } catch (_) {}
    if (saved && /^\d+$/.test(saved)) applyStep1PortfolioPanelWidth(parseInt(saved, 10));

    let dragging = false;

    const stopDrag = () => {
      if (!dragging) return;
      dragging = false;
      resizer.classList.remove('is-dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        const w = step1PortfolioState.panelWidth;
        if (typeof w === 'number' && Number.isFinite(w)) {
          localStorage.setItem(STEP1_PORTFOLIO_PANEL_LS, String(w));
        }
      } catch (_) {}
    };

    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (step1PortfolioState.panelFullWidth) {
        step1PortfolioState.panelFullWidth = false;
        applyStep1PortfolioPanelLayout();
      }
      dragging = true;
      resizer.classList.add('is-dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const m = getStep1PortfolioSplitMetrics();
      if (!m) return;
      const rect = m.main.getBoundingClientRect();
      applyStep1PortfolioPanelWidth(rect.right - e.clientX - m.resizerW - (m.resizerMargin / 2));
    });
    window.addEventListener('mouseup', stopDrag);
    window.addEventListener('blur', stopDrag);
  }

  function setStep1PortfolioSplitVisible(visible) {
    const resizer = document.getElementById('step1PortfolioSplitResizer');
    if (!resizer) return;
    if (visible) {
      resizer.hidden = false;
      resizer.removeAttribute('aria-hidden');
    } else {
      resizer.hidden = true;
      resizer.setAttribute('aria-hidden', 'true');
    }
  }

  function renderStep1AreaDetailPanel(entry, allSchoolRows) {
    const panel = document.getElementById('step1AreaDetailPanel');
    const titleEl = document.getElementById('step1AreaDetailTitle');
    const kpisEl = document.getElementById('step1AreaDetailKpis');
    const schoolsBody = document.getElementById('step1AreaSchoolsBody');
    const viewAllBtn = document.getElementById('step1AreaViewAllBtn');
    if (!panel || !entry) return;

    const { valueKey, label, count, metrics } = entry;
    const areaKeys =
      Array.isArray(entry.areaKeys) && entry.areaKeys.length
        ? entry.areaKeys
        : valueKey
          ? [valueKey]
          : [];
    const areaRows = schoolsInArticulationAreas(allSchoolRows, areaKeys);
    const yl = window.yearLabels || {};

    if (titleEl) titleEl.textContent = step1PortfolioSectionTitle(label, count);

    if (kpisEl) {
      kpisEl.innerHTML = buildStep1AreaDetailKpisHtml(metrics);
    }

    const utilTh = document.querySelector('.step1-area-schools-table thead .col-util');
    if (utilTh) utilTh.textContent = yl.utilizationCard ? yl.utilizationCard() : 'Utilization';

    if (schoolsBody) {
      schoolsBody.innerHTML = renderStep1AreaSchoolsTableBody(areaRows, yl);
      const schoolSelectAll = document.getElementById('step1SchoolSelectAll');
      if (schoolSelectAll) {
        const names = areaRows.map((r) => getSchoolName(r)).filter(Boolean);
        const checked = names.filter((n) => step1SchoolIsChecked(n));
        schoolSelectAll.checked = names.length > 0 && checked.length === names.length;
        schoolSelectAll.indeterminate = checked.length > 0 && checked.length < names.length;
      }
    }

    if (viewAllBtn) {
      const checkedSchoolNames = getStep1CheckedSchoolNamesSorted();
      if (checkedSchoolNames.length >= 2) {
        viewAllBtn.hidden = false;
        viewAllBtn.textContent = `Compare Selected Schools (${checkedSchoolNames.length})`;
        viewAllBtn.dataset.areaKey = '';
        viewAllBtn.dataset.compareMode = 'schools';
        viewAllBtn.disabled = false;
      } else if (areaKeys.length === 1) {
        viewAllBtn.hidden = false;
        viewAllBtn.textContent = `View all ${count} school${count === 1 ? '' : 's'} in area`;
        viewAllBtn.dataset.areaKey = areaKeys[0];
        viewAllBtn.dataset.compareMode = 'area';
        viewAllBtn.disabled = false;
      } else if (areaKeys.length > 1) {
        // Multi-area with no school picks: compare every school currently listed in the panel.
        const listedNames = areaRows.map((r) => getSchoolName(r)).filter(Boolean);
        const uniqueListed = Array.from(new Set(listedNames.map(String)));
        if (uniqueListed.length >= 2) {
          viewAllBtn.hidden = false;
          viewAllBtn.textContent = `Compare Selected Schools (${uniqueListed.length})`;
          viewAllBtn.dataset.areaKey = '';
          viewAllBtn.dataset.compareMode = 'panel';
          viewAllBtn.disabled = false;
        } else {
          viewAllBtn.hidden = true;
          viewAllBtn.dataset.areaKey = '';
          viewAllBtn.dataset.compareMode = '';
        }
      } else {
        viewAllBtn.hidden = true;
        viewAllBtn.dataset.areaKey = '';
        viewAllBtn.dataset.compareMode = '';
      }
    }

    setStep1PortfolioSplitVisible(true);
    panel.hidden = false;
    applyStep1PortfolioPanelLayout();
    requestAnimationFrame(() => {
      ensureStep1PortfolioPanelDefaultWidth();
      applyStep1PortfolioPanelLayout();
    });

    if (step1PortfolioState.selectedSchoolName) {
      requestAnimationFrame(() => {
        const expanded = schoolsBody && schoolsBody.querySelector('tr.step1-school-row.is-expanded');
        if (expanded) expanded.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }
  }

  function closeStep1AreaDetailPanel() {
    const panel = document.getElementById('step1AreaDetailPanel');
    step1PortfolioState.selectedAreaKey = null;
    step1PortfolioState.selectedSchoolName = null;
    step1PortfolioState.panelFullWidth = false;
    step1PortfolioState.panelWidth = null;
    const artSel = document.getElementById('step1CompareArticulationSelect');
    if (artSel) artSel.value = '';
    if (panel) panel.hidden = true;
    applyStep1PortfolioPanelLayout();
    setStep1PortfolioSplitVisible(false);
    document.querySelectorAll('#step1AreaTableBody tr.is-selected').forEach((tr) => tr.classList.remove('is-selected'));
  }

  function bindStep1PortfolioControlsOnce(onRerender) {
    if (window.__step1PortfolioControlsBound) return;
    window.__step1PortfolioControlsBound = true;

    const searchEl = document.getElementById('step1AreaSearch');
    const tableHead = document.querySelector('.step1-portfolio-table thead');
    const tableBody = document.getElementById('step1AreaTableBody');
    const closeBtn = document.getElementById('step1AreaDetailClose');
    const popoutBtn = document.getElementById('step1AreaDetailPopout');
    const viewAllBtn = document.getElementById('step1AreaViewAllBtn');
    const schoolsBody = document.getElementById('step1AreaSchoolsBody');

    if (searchEl) {
      searchEl.addEventListener('input', () => {
        step1PortfolioState.search = searchEl.value.trim();
        if (typeof onRerender === 'function') onRerender();
      });
    }
    if (tableHead) {
      tableHead.addEventListener('click', (e) => {
        const th = e.target.closest('th[data-sort-key]');
        if (!th) return;
        handleStep1ColumnSort(th.getAttribute('data-sort-key'));
        if (typeof onRerender === 'function') onRerender();
      });
    }
    if (tableBody) {
      tableBody.addEventListener('click', (e) => {
        if (e.target.closest('.step1-area-row-check, .col-check')) {
          e.stopPropagation();
          return;
        }
        const tr = e.target.closest('tr[data-area-key]');
        if (!tr) return;
        const key = tr.getAttribute('data-area-key');
        if (!key) return;
        step1PortfolioState.selectedAreaKey = key;
        step1PortfolioState.selectedSchoolName = null;
        const artSel = document.getElementById('step1CompareArticulationSelect');
        if (artSel) artSel.value = key;
        if (typeof onRerender === 'function') onRerender({ openPanel: true });
      });
      tableBody.addEventListener('change', (e) => {
        const check = e.target.closest('.step1-area-row-check');
        if (!check) return;
        const key = check.getAttribute('data-area-key') || check.value;
        if (!key) return;
        toggleStep1CheckedArea(key, check.checked);
        syncStep1MultiMenusFromState();
        syncStep1FilterBarLabels();
        if (typeof onRerender === 'function') onRerender({ openPanel: step1DetailPanelShouldStayOpen() });
      });
    }
    if (closeBtn) closeBtn.addEventListener('click', closeStep1AreaDetailPanel);
    if (popoutBtn) popoutBtn.addEventListener('click', toggleStep1PortfolioPanelFullWidth);
    if (viewAllBtn) {
      viewAllBtn.addEventListener('click', () => {
        const mode = viewAllBtn.dataset.compareMode || '';
        if (mode === 'schools') {
          applySelectedSchoolsCompareSelection(getStep1CheckedSchoolNamesSorted(), onRerender);
        } else if (mode === 'panel') {
          const names = Array.from(document.querySelectorAll('#step1AreaSchoolsBody tr.step1-school-row[data-school-name]'))
            .map((tr) => tr.getAttribute('data-school-name'))
            .filter(Boolean);
          applySelectedSchoolsCompareSelection(names, onRerender);
        } else {
          const key = viewAllBtn.dataset.areaKey;
          if (!key) return;
          const artSel = document.getElementById('step1CompareArticulationSelect');
          if (artSel) artSel.value = key;
          applyArticulationAreaCompareSelection(key, onRerender);
        }
        const compareMode = document.getElementById('step1CompareMode');
        const schoolSelect = document.getElementById('step1SchoolSelect');
        if (compareMode && compareMode.checked && schoolSelect && schoolSelect.value) {
          const card = document.getElementById('step1SchoolDataCard');
          if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }
    if (schoolsBody) {
      schoolsBody.addEventListener('click', (e) => {
        if (e.target.closest('.step1-school-row-check, .col-check')) {
          e.stopPropagation();
          return;
        }
        const tr = e.target.closest('tr.step1-school-row[data-school-name]');
        if (!tr) return;
        const name = tr.getAttribute('data-school-name');
        if (!name) return;
        const isSame = step1PortfolioState.selectedSchoolName && norm(step1PortfolioState.selectedSchoolName) === norm(name);
        if (isSame) {
          step1PortfolioState.selectedSchoolName = null;
          const schoolSelect = document.getElementById('step1SchoolSelect');
          if (schoolSelect) schoolSelect.value = '';
          updateStep1OpenProjectListBtnState();
        } else {
          openStep1SchoolInPortfolio(name);
        }
        if (typeof onRerender === 'function') onRerender({ openPanel: true });
      });
      schoolsBody.addEventListener('change', (e) => {
        const check = e.target.closest('.step1-school-row-check');
        if (!check) return;
        const name = check.getAttribute('data-school-name');
        if (!name) return;
        toggleStep1CheckedSchool(name, check.checked);
        syncStep1MultiMenusFromState();
        syncStep1FilterBarLabels();
        if (typeof onRerender === 'function') onRerender({ openPanel: true });
      });
    }

    const areaSelectAll = document.getElementById('step1AreaSelectAll');
    if (areaSelectAll) {
      areaSelectAll.addEventListener('change', () => {
        const keys = Array.from(document.querySelectorAll('#step1AreaTableBody tr[data-area-key]'))
          .map((tr) => tr.getAttribute('data-area-key'))
          .filter(Boolean);
        keys.forEach((key) => toggleStep1CheckedArea(key, areaSelectAll.checked));
        syncStep1MultiMenusFromState();
        syncStep1FilterBarLabels();
        if (typeof onRerender === 'function') onRerender({ openPanel: step1DetailPanelShouldStayOpen() });
      });
    }
    const schoolSelectAll = document.getElementById('step1SchoolSelectAll');
    if (schoolSelectAll) {
      schoolSelectAll.addEventListener('change', () => {
        const names = Array.from(document.querySelectorAll('#step1AreaSchoolsBody tr.step1-school-row[data-school-name]'))
          .map((tr) => tr.getAttribute('data-school-name'))
          .filter(Boolean);
        names.forEach((name) => toggleStep1CheckedSchool(name, schoolSelectAll.checked));
        syncStep1MultiMenusFromState();
        syncStep1FilterBarLabels();
        if (typeof onRerender === 'function') onRerender({ openPanel: true });
      });
    }

    bindStep1PortfolioSplitResizerOnce();
  }

  function equalizeCompareCardHeaderHeights(compareGridEl) {
    if (!compareGridEl) return;
    const headers = Array.from(compareGridEl.querySelectorAll('.step1-compare-top'));
    if (headers.length < 2) return;
    headers.forEach(h => { h.style.minHeight = ''; });
    const maxH = headers.reduce((m, h) => Math.max(m, h.getBoundingClientRect().height || 0), 0);
    if (!maxH) return;
    headers.forEach(h => { h.style.minHeight = `${Math.ceil(maxH)}px`; });
  }
  try { window.equalizeCompareCardHeaderHeights = equalizeCompareCardHeaderHeights; } catch {}

  function renderStep1DistrictAreaCompare(opts) {
    opts = opts || {};
    const wrap = document.getElementById('step1DistrictAreaCompare');
    const districtTop = document.getElementById('step1DistrictSummaryTop');
    const tableBody = document.getElementById('step1AreaTableBody');
    const searchEl = document.getElementById('step1AreaSearch');
    if (!wrap || !tableBody) return;

    const rows = getDecisionSchoolRows();
    if (!rows || rows.length === 0) {
      wrap.style.display = 'none';
      if (districtTop) districtTop.innerHTML = '';
      tableBody.innerHTML = '';
      closeStep1AreaDetailPanel();
      return;
    }

    wrap.style.display = 'block';
    if (searchEl && searchEl.value !== step1PortfolioState.search) searchEl.value = step1PortfolioState.search;

    const yl = window.yearLabels || {};
    const utilTh = document.querySelector('.step1-portfolio-table thead .col-util');
    if (utilTh) utilTh.textContent = yl.utilizationCard ? yl.utilizationCard() : 'Utilization';
    const areas = collectArticulationAreasForStep1(rows);
    let entries = areas.map(({ valueKey, label, count }) => ({
      valueKey,
      label,
      count,
      metrics: computeStep1RollupMetrics(schoolsInArticulationArea(rows, valueKey)),
    }));

    const q = norm(step1PortfolioState.search);
    if (q) {
      entries = entries.filter((e) => {
        if (norm(e.label).includes(q)) return true;
        return schoolsInArticulationArea(rows, e.valueKey).some((r) => {
          const nm = getSchoolName(r);
          return nm && (norm(nm).includes(q) || norm(mainDisplaySchoolName(nm)).includes(q));
        });
      });
    }

    // Multi-select school filter: show areas that contain any checked school.
    // Area checkboxes do not hide rows (so you can keep selecting); they drive the summary KPIs.
    if (step1PortfolioState.checkedSchoolNames.size > 0) {
      entries = entries.filter((e) =>
        schoolsInArticulationArea(rows, e.valueKey).some((r) => step1SchoolIsChecked(getSchoolName(r)))
      );
    }

    entries = sortStep1AreaEntries(entries, step1PortfolioState.sortKey, step1PortfolioState.sortDir);

    // District / selection summary KPIs
    let summaryRows = rows;
    let summaryTitle = 'Jeffco District';
    if (step1PortfolioState.checkedAreaKeys.size > 0 || step1PortfolioState.checkedSchoolNames.size > 0) {
      const areaKeys = step1PortfolioState.checkedAreaKeys;
      const schoolNames = step1PortfolioState.checkedSchoolNames;
      summaryRows = rows.filter((r) => {
        const areaKey = getArticulationAreaKeyForSchoolRow(r);
        const name = getSchoolName(r);
        const areaOk = areaKeys.size === 0 || (areaKey && step1AreaIsChecked(areaKey));
        const schoolOk = schoolNames.size === 0 || step1SchoolIsChecked(name);
        return areaOk && schoolOk;
      });
      const parts = [];
      if (areaKeys.size) parts.push(`${areaKeys.size} area${areaKeys.size === 1 ? '' : 's'}`);
      if (schoolNames.size) parts.push(`${schoolNames.size} school${schoolNames.size === 1 ? '' : 's'}`);
      summaryTitle = `Selected (${parts.join(', ')})`;
    }
    const districtMetrics = computeStep1RollupMetrics(summaryRows);
    if (districtTop) {
      districtTop.innerHTML = buildStep1DistrictSummaryTopCard({
        title: step1PortfolioSectionTitle(summaryTitle, districtMetrics.schoolCount),
        metrics: districtMetrics,
      });
    }

    tableBody.innerHTML = entries.length
      ? entries.map((e) => buildStep1AreaTableRow(e, yl)).join('')
      : '<tr><td colspan="9" style="padding:12px;color:#64748b;text-align:center;">No articulation areas match your filters.</td></tr>';
    updateStep1SortHeaderIndicators();

    const areaSelectAll = document.getElementById('step1AreaSelectAll');
    if (areaSelectAll) {
      const visibleKeys = entries.map((e) => e.valueKey);
      const checkedVisible = visibleKeys.filter((k) => step1AreaIsChecked(k));
      areaSelectAll.checked = visibleKeys.length > 0 && checkedVisible.length === visibleKeys.length;
      areaSelectAll.indeterminate = checkedVisible.length > 0 && checkedVisible.length < visibleKeys.length;
    }

    syncStep1FilterBarLabels();

    // Prefer checked articulation areas (multi-select) for the right school panel.
    const checkedKeys = Array.from(step1PortfolioState.checkedAreaKeys);
    if (checkedKeys.length > 0) {
      const labelByKey = new Map();
      areas.forEach(({ valueKey, label }) => labelByKey.set(valueKey, label));
      entries.forEach((e) => labelByKey.set(e.valueKey, e.label));
      const areaRows = schoolsInArticulationAreas(rows, checkedKeys);
      const metrics = computeStep1RollupMetrics(areaRows);
      const schoolCount = metrics.schoolCount || areaRows.length;
      const label =
        checkedKeys.length === 1
          ? labelByKey.get(checkedKeys[0]) || 'Selected area'
          : `Selected (${checkedKeys.length} areas)`;
      renderStep1AreaDetailPanel(
        {
          valueKey: checkedKeys.length === 1 ? checkedKeys[0] : '',
          areaKeys: checkedKeys,
          label,
          count: schoolCount,
          metrics,
        },
        rows
      );
    } else if (step1PortfolioState.selectedAreaKey) {
      const selected = entries.find((e) => e.valueKey === step1PortfolioState.selectedAreaKey)
        || areas
          .map(({ valueKey, label, count }) => ({
            valueKey,
            label,
            count,
            metrics: computeStep1RollupMetrics(schoolsInArticulationArea(rows, valueKey)),
          }))
          .find((e) => e.valueKey === step1PortfolioState.selectedAreaKey);
      if (selected) {
        renderStep1AreaDetailPanel(selected, rows);
      } else {
        closeStep1AreaDetailPanel();
      }
    } else if (!opts.openPanel) {
      closeStep1AreaDetailPanel();
    } else {
      closeStep1AreaDetailPanel();
    }
  }
  try { window.renderStep1DistrictAreaCompare = renderStep1DistrictAreaCompare; } catch {}

  function renderStep1Summary(row) {
    const detailsTbody = document.getElementById('step1BuildingInfoDetails');
    const buildingTiles = document.getElementById('step1BuildingInfoTiles');
    const enrollmentTiles = document.getElementById('step1EnrollmentTiles');

    // Building detail fields (fixed order, show "—" when missing to match the screenshot layout)
    const schoolLevel = pickSchoolLevelFromRow(row);
    const articulationArea = getArticulationAreaDisplayForStep1(row);
    const gradesServed = pickGradesServedFromRow(row);
    const yearBuilt = pickFirstNonEmpty(row, ['Year Built', 'YearBuilt', 'Year_Built', 'Build Year', 'Built Year']) || '';
    const sqftRaw = pickFirstNonEmpty(row, [' SquareFt ', 'SquareFt', 'SquareFt ', 'Square Footage', 'SquareFootage']) || '';
    const buildingLife = pickFirstNonEmpty(row, ['Building Life Expectancy (years)', 'Building Life Expectancy', 'BuildingLifeExpectancy']) || '';
    const desirability = pickFirstNonEmpty(row, ['Desirability of Property', 'Property Desirability', 'Desirability']) || '';
    const terminal = pickFirstNonEmpty(row, ['Transportation Terminal', 'TransportationTerminal', 'Terminal', 'Transportation']) || '';

    // FCI (prefer explicit columns; fall back to BuildingScore if it looks like a 0..1 index)
    const fciRaw =
      pickFirstNonEmpty(row, ['Facility Condition Index', 'Facility Condition Index %', 'FacilityConditionIndex', 'FCI', 'FCI %']) ||
      pickFirstNonEmpty(row, ['BuildingScore', 'Building Score']);

    const capRaw = pickFirstNonEmpty(row, ['K-5 Capacity', 'K5 Capacity', 'Capacity']) || '';
    const enrollmentRaw = pickFirstNonEmpty(row, ['Enrollment', 'Enrollment2026', 'Enrollment2025']) || '';
    const seatsComputedFromRow = (window.getEffectiveAvailableSeats && window.getEffectiveAvailableSeats(row)) ?? null;
    const buildingScoreRaw = pickFirstNonEmpty(row, ['BuildingScore', 'Building Score']) || '';
    const eduAdeqRaw = pickFirstNonEmpty(row, ['EducationalAdequacy', 'Educational Adequacy']) || '';
    const distanceRaw = pickFirstNonEmpty(row, ['DistanceUnderutilizedschools', 'Distance Underutilized Schools', 'Distance to Underutilized']) || '';
    const nearestUnderutilized = getNearestUnderutilizedOverlappingSchool(row);
    const pkRaw = pickFirstNonEmpty(row, ['PKEnrollment', 'PK Enrollment', 'PK Enrollment ']) || '';
    const statusRaw = pickFirstNonEmpty(row, ['Status', 'status']) || '';
    const siteCapRaw = pickFirstNonEmpty(row, ['SiteCapacity', 'Site Capacity']) || '';

    const capDetails = window.getEffectiveCapacityDetails ? window.getEffectiveCapacityDetails(row) : null;
    const cap = (capDetails && Number.isFinite(capDetails.value)) ? capDetails.value : null;
    const capSourceLabel = capDetails && capDetails.label ? capDetails.label : 'Capacity';
    const capMissingNote = capDetails && capDetails.missingEducational ? (capDetails.note || 'Educational capacity does not exist.') : '';
    const enrollment = parseNumber(enrollmentRaw);
    const buildingScore0to10 = coerceBuildingScore0to10(buildingScoreRaw);
    const eduAdeq = parseNumber(eduAdeqRaw);
    const distance = parseNumber(distanceRaw);
    const pk = parseNumber(pkRaw);

    // Enrollment tiles
    // Attendance Area Enrollment + Growth live in the Enrollment section per request (PK-aware)
    const effAttArea = window.getEffectiveAttendanceAreaEnrollment ? window.getEffectiveAttendanceAreaEnrollment(row) : null;
    const effGrowth = window.getEffectiveEnrollmentGrowth ? window.getEffectiveEnrollmentGrowth(row) : null;

    // Render details table
    if (detailsTbody) {
      const rows = [];
      const addRow = (k, v) => rows.push({ k, v: (v ?? '').toString().trim() || '—' });
      const addRowIf = (k, v) => {
        const s = (v ?? '').toString().trim();
        if (!s) return;
        rows.push({ k, v: s });
      };

      // Always show these
      addRow('Status', statusRaw);
      addRow('Articulation Area', articulationArea);
      addRow('School Level', schoolLevel);
      addRow('Grades Served', gradesServed);
      addRow('Site Capacity', siteCapRaw);
      addRow('Square Footage', (Number.isFinite(parseNumber(sqftRaw)) ? fmtInt(parseNumber(sqftRaw)) : sqftRaw));

      // Only show these when present in the data
      addRowIf('Year Built', yearBuilt);
      addRowIf('Building Life Expectancy (years)', buildingLife);
      addRowIf('Desirability of Property', desirability);
      addRowIf('Transportation Terminal', terminal);

      detailsTbody.innerHTML = rows
        .map(r => `<tr><td>${htmlEscape(r.k)}</td><td><strong>${htmlEscape(r.v)}</strong></td></tr>`)
        .join('');
    }

    // Determine capacity label based on grades served string (best-effort)
    let capacityLabel = 'Capacity';
    const gNorm = norm(gradesServed);
    if (gNorm.includes('pk') && (gNorm.includes('5') || gNorm.includes('k-5') || gNorm.includes('pk-5'))) capacityLabel = 'K-5 Capacity';
    else if (gNorm.includes('k-8') || gNorm.includes('pk-8') || gNorm.includes('k8')) capacityLabel = 'K-8 Capacity';
    else if (gNorm.includes('6-8') || gNorm.includes('ms') || gNorm.includes('middle')) capacityLabel = '6-8 Capacity';
    else if (gNorm.includes('9-12') || gNorm.includes('hs') || gNorm.includes('high')) capacityLabel = '9-12 Capacity';
    else if (gNorm.includes('k-12') || gNorm.includes('6-12') || gNorm.includes('k12')) capacityLabel = 'K-12 Capacity';

    // Render building tiles
    if (buildingTiles) {
      const capStr = Number.isFinite(cap) ? fmtInt(cap) : (capMissingNote || (capRaw ? capRaw.toString().trim() : '—'));
      const effUtil = window.getEffectiveUtilization ? window.getEffectiveUtilization(row) : null;
      const utilStr = Number.isFinite(effUtil)
        ? formatPctSmart(effUtil, { assumeUnitIfSmall: true, decimals: 1 })
        : (capMissingNote ? 'Educational capacity does not exist' : '—');
      const seatsComputed = seatsComputedFromRow;
      const seatsStr = Number.isFinite(seatsComputed) ? fmtInt(seatsComputed) : '—';
      const bldgScoreStr = Number.isFinite(buildingScore0to10) ? `${buildingScore0to10.toFixed(2)}/10` : (buildingScoreRaw ? buildingScoreRaw.toString().trim() : '—');
      const eduAdeqStr = Number.isFinite(eduAdeq) ? formatPctSmart(eduAdeq, { assumeUnitIfSmall: true, decimals: 0 }) : (eduAdeqRaw ? eduAdeqRaw.toString().trim() : '—');
      const distStr = Number.isFinite(nearestUnderutilized?.distanceMiles)
        ? `${nearestUnderutilized.distanceMiles.toFixed(1)} mi`
        : (Number.isFinite(distance) ? `${distance.toFixed(1)} mi` : (distanceRaw ? distanceRaw.toString().trim() : '—'));
      const distSub = nearestUnderutilized?.schoolName
        ? mainDisplaySchoolName(nearestUnderutilized.schoolName)
        : '';
      const sqftNum = parseNumber(sqftRaw);
      const sqftStr = Number.isFinite(sqftNum) ? fmtInt(sqftNum) : (sqftRaw ? sqftRaw.toString().trim() : '—');

      buildingTiles.innerHTML = [
        kpiTileHtml({ theme: 'purple', label: capSourceLabel || capacityLabel, value: capStr }),
        kpiTileHtml({ theme: 'purple', label: (window.yearLabels && window.yearLabels.utilizationKpi()) || '25-26 Utilization %', value: utilStr }),
        kpiTileHtml({ theme: 'purple', label: 'Available Seats', value: seatsStr }),
        kpiTileHtml({ theme: 'purple', label: 'Composite Building Score', value: bldgScoreStr }),
        kpiTileHtml({ theme: 'purple', label: 'Educational Adequacy', value: eduAdeqStr }),
        kpiTileHtml({ theme: 'purple', label: 'Distance to Nearest Underutilized School serving Overlapping Grades', value: distStr, sub: distSub })
      ].join('');
    }

    // Render enrollment tiles (Enrollment excl. PK, PK, Total)
    if (enrollmentTiles) {
      const effEnr = window.getEffectiveEnrollment ? window.getEffectiveEnrollment(row) : enrollment;
      const totalEnr = Number.isFinite(enrollment) ? enrollment : (Number.isFinite(effEnr) && Number.isFinite(pk) ? effEnr + pk : NaN);
      const enrStr = Number.isFinite(effEnr) ? fmtInt(effEnr) : (enrollmentRaw ? enrollmentRaw.toString().trim() : '—');
      const pkStr = Number.isFinite(pk) ? `${fmtInt(pk)} PK` : (pkRaw ? `${pkRaw.toString().trim()} PK` : '');
      const totalStr = Number.isFinite(totalEnr) ? fmtInt(totalEnr) : '';
      const attAreaStr = (effAttArea != null && Number.isFinite(effAttArea)) ? formatPctSmart(effAttArea, { assumeUnitIfSmall: true, decimals: 1 }) : '—';
      const growthStr = (effGrowth != null && Number.isFinite(effGrowth)) ? fmtGrowthPctSmart(effGrowth) : '—';
      const projEnr = window.getEffectiveProjectedEnrollment ? window.getEffectiveProjectedEnrollment(row) : null;
      const yl = window.yearLabels || {};
      const growthSub = (projEnr != null && Number.isFinite(projEnr))
        ? (yl.projEnrollmentSub ? yl.projEnrollmentSub(fmtInt(projEnr)) : `Proj. 2030: ${fmtInt(projEnr)}`)
        : '';

      enrollmentTiles.innerHTML = [
        kpiTileHtml({ theme: 'green', label: yl.enrollmentCard ? yl.enrollmentCard() : 'Enrollment', value: enrStr, sub: pkStr ? `${pkStr} • Total: ${totalStr || enrStr}` : (totalStr ? `Total: ${totalStr}` : '') }),
        kpiTileHtml({ theme: 'green', label: yl.attendanceAreaKpi ? yl.attendanceAreaKpi() : 'Attendance Area Enrollment', value: attAreaStr }),
        kpiTileHtml({ theme: 'green', label: yl.futureGrowthCard ? yl.futureGrowthCard() : 'Future Enrollment Growth (2030)', value: growthStr, sub: growthSub })
      ].join('');
    }
  }

  function renderSchoolRow(row, filterText, showEmpty) {
    const heading = document.getElementById('step1SchoolNameHeading');
    const badgesWrap = document.getElementById('step1SchoolBadges');
    const kpiGrid = document.getElementById('step1KpiGrid');
    const compareMode = document.getElementById('step1CompareMode');
    const compareSelects = document.getElementById('step1CompareSelects');
    const compareSection = document.getElementById('step1CompareSection');
    const compareGrid = document.getElementById('step1CompareGrid');
    const singleSection = document.getElementById('step1SingleSection');
    if (!row) return;

    const q = norm(filterText);
    const showEmptyMetrics = !!showEmpty;

    const name = getSchoolName(row) || 'Selected school';
    if (heading) heading.textContent = mainDisplaySchoolName(name);

    function buildBadges(r) {
      const siteCap = r['SiteCapacity'] || r['Site Capacity'] || '';
      const decision = r['decision'] || r['Decision'] || '';
      const badges = [];
      if (siteCap) badges.push(`<span class="step1-badge">${htmlEscape(`Site capacity: ${siteCap}`)}</span>`);
      if (decision) badges.push(`<span class="step1-badge">${htmlEscape(decision)}</span>`);
      return badges.join('');
    }

    // KPI tiles (only render if values exist)
    function buildKpiTiles(r) {
      // "All metrics" should exclude metrics that are now promoted into the
      // Building Information / Enrollment sections (avoid duplicates).
      // Keep this as an "additional metrics" area.
      const pk = parseNumber(r['PKEnrollment'] || r['PK Enrollment'] || r['PK Enrollment ']);
      const recentInv = pickFirstNonEmpty(r, ['RecentInvestments', 'Recent Investments']);

      function kpiCard({ label, value, sub, barW, barC }) {
        if (!showEmptyMetrics && (!value || String(value).trim() === '')) return '';
        if (q && !norm(label).includes(q) && !norm(value).includes(q) && !norm(sub || '').includes(q)) return '';

        const v = htmlEscape(value);
        const s = sub ? `<div class="step1-kpi-sub">${htmlEscape(sub)}</div>` : `<div class="step1-kpi-sub">&nbsp;</div>`;
        const bar = (typeof barW === 'number')
          ? `<div class="step1-bar" style="--w:${clamp(barW, 0, 100)}%; --c:${barC || '#007cbf'}"><span></span></div>`
          : `<div class="step1-bar" style="--w:0%; --c:#e5e7eb"><span></span></div>`;
        return `<div class="step1-kpi">
          <div class="step1-kpi-label">${htmlEscape(label)}</div>
          <div class="step1-kpi-value">${v || '&nbsp;'}</div>
          ${s}
          ${bar}
        </div>`;
      }

      const cards = [];
      cards.push(kpiCard({ label: 'PK Enrollment', value: Number.isFinite(pk) ? fmtInt(pk) : '', sub: 'Students', barW: null }));
      cards.push(kpiCard({ label: 'Recent Investments', value: recentInv ? String(recentInv) : '', sub: '', barW: null }));

      return cards.filter(Boolean).join('');
    }

    function metricRow({ label, value, sub, barW, barC, valueColor }) {
      if (!showEmptyMetrics && (!value || String(value).trim() === '')) return '';
      if (q && !norm(label).includes(q) && !norm(value).includes(q) && !norm(sub || '').includes(q)) return '';
      const bar = (typeof barW === 'number')
        ? `<div class="step1-bar" style="--w:${clamp(barW, 0, 100)}%; --c:${barC || '#007cbf'}"><span></span></div>`
        : ``;
      const subHtml = sub ? `<div class="step1-metric-sub">${htmlEscape(sub)}</div>` : ``;
      const valueAttr = valueColor ? ` style="color:${valueColor}; font-weight:800;"` : '';
      return `<div class="step1-metric">
        <div class="step1-metric-row">
          <div class="step1-metric-label">${htmlEscape(label)}</div>
          <div class="step1-metric-value"${valueAttr}>${htmlEscape(value)}</div>
        </div>
        ${subHtml}
        ${bar}
      </div>`;
    }

    function buildCompareCard(r) {
      const schoolName = getSchoolName(r) || 'School';
      const schoolDisplayName = mainDisplaySchoolName(schoolName);

      /** pct = percent change (e.g. -12 or 8). Match the fixed red/green used by other Step 1 metric bars. */
      function compareEnrollmentGrowthColors(pct) {
        if (!Number.isFinite(pct)) return { bar: '#94a3b8', value: '#64748b' };
        if (Math.abs(pct) < 0.01) return { bar: '#cbd5e1', value: '#475569' };
        const c = pct < 0 ? '#dc2626' : '#16a34a';
        return { bar: c, value: c };
      }

      const enrollment = parseNumber(
        (typeof window.pickDecisionRowField === "function"
          ? window.pickDecisionRowField(r, "enrollmentTotal")
          : undefined) ?? r["Enrollment"] ?? r["Enrollment2026"] ?? r["Enrollment2025"] ?? r["Enrollment"]
      );
      const capDetails = window.getEffectiveCapacityDetails ? window.getEffectiveCapacityDetails(r) : null;
      const capacity = (capDetails && Number.isFinite(capDetails.value)) ? capDetails.value : null;
      const capLabel = capDetails && capDetails.label ? capDetails.label : 'Capacity';
      const capMissingNote = capDetails && capDetails.missingEducational ? 'Educational capacity does not exist.' : '';
      const pk = parseNumber(pickFirstNonEmpty(r, ['PKEnrollment', 'PK Enrollment', 'PK Enrollment ']));
      const effEnr = window.getEffectiveEnrollment ? window.getEffectiveEnrollment(r) : enrollment;
      const effUtil = window.getEffectiveUtilization ? window.getEffectiveUtilization(r) : null;
      const buildingScore = coerceBuildingScore0to10(r['BuildingScore']);
      const eduAdeq = parseNumber(r['EducationalAdequacy']);
      const effAttArea = window.getEffectiveAttendanceAreaEnrollment ? window.getEffectiveAttendanceAreaEnrollment(r) : null;
      const effGrowth = window.getEffectiveEnrollmentGrowth ? window.getEffectiveEnrollmentGrowth(r) : null;
      const effProjEnr = window.getEffectiveProjectedEnrollment ? window.getEffectiveProjectedEnrollment(r) : null;
      const nearestUnderutilized = getNearestUnderutilizedOverlappingSchool(r);
      const distance = Number.isFinite(nearestUnderutilized?.distanceMiles)
        ? nearestUnderutilized.distanceMiles
        : parseNumber(r['DistanceUnderutilizedschools']);

      const utilPct = Number.isFinite(effUtil) ? effUtil * 100 : null;
      const seatsComputed = (window.getEffectiveAvailableSeats && window.getEffectiveAvailableSeats(r)) ?? null;
      const totalEnr = Number.isFinite(enrollment) ? enrollment : (Number.isFinite(effEnr) && Number.isFinite(pk) ? effEnr + pk : NaN);
      const enrSub = Number.isFinite(pk) ? `${fmtInt(pk)} PK${Number.isFinite(totalEnr) ? ` • Total: ${fmtInt(totalEnr)}` : ''}` : 'Students';

      const yl = window.yearLabels || {};
      const metrics = [];
      const schoolLevel = pickSchoolLevelFromRow(r);
      const articulationArea = getArticulationAreaDisplayForStep1(r);
      const gradesServed = pickGradesServedFromRow(r);
      metrics.push(metricRow({
        label: 'Articulation Area',
        value: articulationArea || '—',
        sub: '',
        barW: null,
      }));
      metrics.push(metricRow({
        label: 'School Level',
        value: schoolLevel || '—',
        sub: '',
        barW: null,
      }));
      metrics.push(metricRow({
        label: 'Grades Served',
        value: gradesServed || '—',
        sub: '',
        barW: null,
      }));
      if (Number.isFinite(utilPct)) {
        const color = utilPct >= 95 ? '#dc2626' : (utilPct >= 85 ? '#f59e0b' : '#16a34a');
        const utilSubText = (Number.isFinite(effEnr) && Number.isFinite(capacity) && capacity > 0) ? `${fmtInt(effEnr)} / ${fmtInt(capacity)} students` : '';
        metrics.push(metricRow({ label: yl.utilizationCard ? yl.utilizationCard() : 'Utilization (25-26)', value: fmtPct(utilPct), sub: utilSubText, barW: utilPct, barC: color }));
      } else {
        metrics.push(metricRow({ label: yl.utilizationCard ? yl.utilizationCard() : 'Utilization (25-26)', value: capMissingNote || '', sub: '', barW: null, barC: null }));
      }
      metrics.push(metricRow({ label: yl.enrollmentCard ? yl.enrollmentCard() : 'Enrollment', value: Number.isFinite(effEnr) ? fmtInt(effEnr) : '', sub: enrSub, barW: null }));
      metrics.push(metricRow({ label: capLabel, value: Number.isFinite(capacity) ? fmtInt(capacity) : capMissingNote, sub: 'Seats', barW: null }));
      metrics.push(metricRow({ label: 'Available Seats', value: Number.isFinite(seatsComputed) ? fmtInt(seatsComputed) : '', sub: '', barW: null }));
      if (Number.isFinite(buildingScore)) {
        const pct = clamp((buildingScore / 10) * 100, 0, 100);
        const color = pct >= 70 ? '#16a34a' : (pct >= 45 ? '#f59e0b' : '#dc2626');
        metrics.push(metricRow({ label: 'Composite Building Score', value: `${buildingScore.toFixed(2)}/10`, sub: '', barW: pct, barC: color }));
      } else {
        metrics.push(metricRow({ label: 'Composite Building Score', value: '', sub: '', barW: null }));
      }
      if (Number.isFinite(eduAdeq)) {
        const pct = clamp(eduAdeq * 100, 0, 100);
        const color = pct >= 70 ? '#16a34a' : (pct >= 45 ? '#f59e0b' : '#dc2626');
        metrics.push(metricRow({ label: 'Educational Adequacy', value: fmtPct(pct), sub: '', barW: pct, barC: color }));
      } else {
        metrics.push(metricRow({ label: 'Educational Adequacy', value: '', sub: '', barW: null }));
      }
      if (effAttArea != null && Number.isFinite(effAttArea)) {
        const pct = clamp((effAttArea <= 1.5 ? effAttArea * 100 : effAttArea), 0, 100);
        const color = pct >= 90 ? '#dc2626' : (pct >= 80 ? '#f59e0b' : '#16a34a');
        metrics.push(metricRow({ label: yl.attendanceAreaCard ? yl.attendanceAreaCard() : 'Attendance Area Enrollment', value: fmtPct(pct), sub: '', barW: pct, barC: color }));
      } else {
        metrics.push(metricRow({ label: yl.attendanceAreaCard ? yl.attendanceAreaCard() : 'Attendance Area Enrollment', value: '', sub: '', barW: null }));
      }
      if (effGrowth != null && Number.isFinite(effGrowth)) {
        const pct = (effGrowth >= -1 && effGrowth <= 1) ? effGrowth * 100 : effGrowth;
        const { bar: growthBar, value: growthValue } = compareEnrollmentGrowthColors(pct);
        const growthSub = (effProjEnr != null && Number.isFinite(effProjEnr))
          ? (yl.projEnrollmentSub ? yl.projEnrollmentSub(fmtInt(effProjEnr)) : `Proj. 2030: ${fmtInt(effProjEnr)}`)
          : '';
        metrics.push(metricRow({
          label: yl.futureGrowthCard ? yl.futureGrowthCard() : 'Future Enrollment Growth (2030)',
          value: fmtPct(pct),
          sub: growthSub,
          barW: clamp(Math.abs(pct), 0, 100),
          barC: growthBar,
          valueColor: growthValue
        }));
      } else {
        const growthSub = (effProjEnr != null && Number.isFinite(effProjEnr))
          ? (yl.projEnrollmentSub ? yl.projEnrollmentSub(fmtInt(effProjEnr)) : `Proj. 2030: ${fmtInt(effProjEnr)}`)
          : '';
        metrics.push(metricRow({ label: yl.futureGrowthCard ? yl.futureGrowthCard() : 'Future Enrollment Growth (2030)', value: '', sub: growthSub, barW: null }));
      }
      metrics.push(metricRow({
        label: 'Distance to Nearest Underutilized School serving Overlapping Grades',
        value: Number.isFinite(distance) ? `${distance.toFixed(1)} mi` : '',
        sub: nearestUnderutilized?.schoolName ? mainDisplaySchoolName(nearestUnderutilized.schoolName) : '',
        barW: null
      }));

      return `<div class="step1-card step1-compare-card">
        <div class="step1-compare-top">
          <div class="step1-compare-title">${htmlEscape(schoolDisplayName)}</div>
          <div class="step1-compare-meta">${buildBadges(r)}</div>
        </div>
        <div class="step1-compare-body" style="margin-top:6px;">${metrics.filter(Boolean).join('')}</div>
      </div>`;
    }

    // Compare toggle visibility
    const isCompare = !!(compareMode && compareMode.checked);
    if (compareSelects) compareSelects.style.display = isCompare ? 'flex' : 'none';
    if (singleSection) singleSection.style.display = isCompare ? 'none' : 'block';
    if (compareSection) compareSection.style.display = isCompare ? 'block' : 'none';

    // Badges for single view header
    if (badgesWrap) {
      badgesWrap.innerHTML = isCompare ? '' : buildBadges(row);
    }

    if (!isCompare) {
      // Summary sections (Building Information + Enrollment)
      try { renderStep1Summary(row); } catch (e) {}
      if (kpiGrid) {
        const tiles = buildKpiTiles(row);
        kpiGrid.innerHTML = tiles || `<div style="grid-column: span 12; color:#6b7280; font-size:13px; padding: 8px 0;">No additional metrics (all key metrics are shown above).</div>`;
      }
      if (heading) heading.textContent = mainDisplaySchoolName(name);
      return;
    }

    // Compare mode: render cards side-by-side (primary + any picks from compare dropdowns)
    if (heading) heading.textContent = 'Compare Selected Schools';
    if (compareGrid) {
      const rows = getDecisionSchoolRows();
      const primaryName = getSchoolName(row) || '';
      const extras = getStep1ComparePickNames();
      const selectedNames = [primaryName, ...extras];
      const deduped = Array.from(new Set(selectedNames.map(s => String(s))));
      const selectedRows = deduped
        .map(nm => rows.find(r => norm(getSchoolName(r)) === norm(nm)))
        .filter(Boolean);
      compareGrid.innerHTML = selectedRows.map(buildCompareCard).join('') || `<div style="color:#6b7280; font-size:13px;">Select schools in the compare rows above.</div>`;
      // Align the metric sections across cards by equalizing the top/header height.
      requestAnimationFrame(() => {
        equalizeCompareCardHeaderHeights(compareGrid);
        if (typeof window.applyStep1CompareLayout === 'function') window.applyStep1CompareLayout();
        // Second frame: clientWidth is reliable after layout / fit width
        requestAnimationFrame(() => {
          if (typeof window.applyStep1CompareLayout === 'function') window.applyStep1CompareLayout();
          equalizeCompareCardHeaderHeights(compareGrid);
        });
      });
    }
  }

  const STEP1_COMPARE_DEFAULT_SLOTS = 5;
  const STEP1_COMPARE_MAX_SLOTS = 14;

  function getStep1CompareSelectElements() {
    const list = document.getElementById('step1CompareSelectsList');
    if (!list) return [];
    return Array.from(list.querySelectorAll('select.step1-compare-school-select'));
  }

  function getStep1ComparePickNames() {
    return getStep1CompareSelectElements()
      .map((s) => (s && s.value ? String(s.value).trim() : ''))
      .filter(Boolean);
  }

  function fillStep1CompareSelectOptions(selectEl, names) {
    if (!selectEl) return;
    const cur = selectEl.value;
    while (selectEl.options.length > 1) selectEl.remove(1);
    names.forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = mainDisplaySchoolName(name);
      selectEl.appendChild(opt);
    });
    if (cur && names.includes(cur)) selectEl.value = cur;
  }

  function refreshStep1CompareSelectOptions(names) {
    getStep1CompareSelectElements().forEach((s) => fillStep1CompareSelectOptions(s, names));
  }

  function appendStep1CompareSlot(list, names, compareIndex, onRerender) {
    const label = document.createElement('label');
    label.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:12px; color:#111827; flex-shrink:0;';
    const span = document.createElement('span');
    span.style.cssText = 'font-weight:800; white-space:nowrap;';
    span.textContent = `Compare ${compareIndex}`;
    const sel = document.createElement('select');
    sel.className = 'step1-compare-school-select';
    sel.style.cssText = 'flex-shrink:0; min-width: 220px; width: 220px; max-width: 220px; padding: 6px 8px; border:1px solid #d1d5db; border-radius:8px; background:#fff; font-size:12px;';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = '-- Select School --';
    sel.appendChild(ph);
    fillStep1CompareSelectOptions(sel, names);
    if (typeof onRerender === 'function') sel.addEventListener('change', onRerender);
    label.appendChild(span);
    label.appendChild(sel);
    list.appendChild(label);
  }

  function ensureStep1CompareSlotsInitialized(names, onRerender) {
    const list = document.getElementById('step1CompareSelectsList');
    const addBtn = document.getElementById('step1AddCompareSlot');
    if (!list) return;

    if (list.dataset.slotsBuilt === '1') {
      refreshStep1CompareSelectOptions(names);
      populateStep1ArticulationCompareSelect(getDecisionSchoolRows());
      return;
    }

    list.innerHTML = '';
    for (let i = 1; i <= STEP1_COMPARE_DEFAULT_SLOTS; i += 1) {
      appendStep1CompareSlot(list, names, i, onRerender);
    }
    list.dataset.slotsBuilt = '1';
    if (addBtn) addBtn.disabled = getStep1CompareSelectElements().length >= STEP1_COMPARE_MAX_SLOTS;

    if (addBtn && !addBtn.dataset.bound) {
      addBtn.dataset.bound = '1';
      addBtn.addEventListener('click', () => {
        const rowsNow = getDecisionSchoolRows();
        if (!rowsNow || rowsNow.length === 0) return;
        const nm = Array.from(new Set(rowsNow.map(getSchoolName).filter(Boolean).map(String))).sort((a, b) => a.localeCompare(b));
        const count = getStep1CompareSelectElements().length;
        if (count >= STEP1_COMPARE_MAX_SLOTS) return;
        appendStep1CompareSlot(list, nm, count + 1, () => {
          if (typeof window.step1Rerender === 'function') window.step1Rerender();
        });
        addBtn.disabled = getStep1CompareSelectElements().length >= STEP1_COMPARE_MAX_SLOTS;
      });
    }
  }

  function normalizeArticulationKeyStep1(v) {
    return String(v ?? '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function isValidArticulationAreaKey(key) {
    return !!key && (key === OPTION_SCHOOLS_AREA_KEY || (key !== 'noarticulationarea' && key !== 'no articulation area' && key !== 'n/a'));
  }

  function collectArticulationAreasForStep1(rows) {
    const byKey = new Map();
    (rows || []).forEach((r) => {
      const isOptionSchool = isOfficialOptionSchoolStep1(r);
      const raw = isOptionSchool
        ? OPTION_SCHOOLS_AREA_LABEL
        : pickFirstNonEmpty(r, ['Articulation Area', 'ArticulationArea', 'Articulation']);
      const key = isOptionSchool ? OPTION_SCHOOLS_AREA_KEY : normalizeArticulationKeyStep1(raw);
      if (!isValidArticulationAreaKey(key)) return;
      const disp = isOptionSchool ? OPTION_SCHOOLS_AREA_LABEL : String(raw).trim();
      if (!byKey.has(key)) byKey.set(key, { label: disp, names: new Set() });
      const nm = getSchoolName(r);
      if (nm) byKey.get(key).names.add(String(nm).trim());
    });
    return Array.from(byKey.entries())
      .map(([valueKey, { label, names }]) => ({
        valueKey,
        label,
        count: names.size
      }))
      .filter((a) => a.count > 0)
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true }));
  }

  function schoolsInArticulationArea(rows, areaKey) {
    return (rows || []).filter((r) => {
      if (areaKey === OPTION_SCHOOLS_AREA_KEY) return isOfficialOptionSchoolStep1(r);
      if (isOfficialOptionSchoolStep1(r)) return false;
      const raw = pickFirstNonEmpty(r, ['Articulation Area', 'ArticulationArea', 'Articulation']);
      return normalizeArticulationKeyStep1(raw) === areaKey;
    });
  }

  /** Union of schools across multiple articulation areas (deduped by school name). */
  function schoolsInArticulationAreas(rows, areaKeys) {
    const keys = Array.from(areaKeys || []).filter(Boolean);
    if (!keys.length) return [];
    if (keys.length === 1) return schoolsInArticulationArea(rows, keys[0]);
    const seen = new Set();
    const out = [];
    keys.forEach((key) => {
      schoolsInArticulationArea(rows, key).forEach((r) => {
        const n = getSchoolName(r);
        const nk = norm(n);
        if (!nk || seen.has(nk)) return;
        seen.add(nk);
        out.push(r);
      });
    });
    return out;
  }

  function step1DetailPanelShouldStayOpen() {
    return step1PortfolioState.checkedAreaKeys.size > 0 || !!step1PortfolioState.selectedAreaKey;
  }

  function populateStep1ArticulationCompareSelect(rows) {
    const artSel = document.getElementById('step1CompareArticulationSelect');
    if (!artSel) return;
    const cur = artSel.value;
    const areas = collectArticulationAreasForStep1(rows);
    artSel.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'All Areas';
    artSel.appendChild(ph);
    areas.forEach(({ valueKey, label, count }) => {
      const o = document.createElement('option');
      o.value = valueKey;
      const sc = count === 1 ? '1 school' : `${count} schools`;
      o.textContent = `${label} — ${sc}`;
      artSel.appendChild(o);
    });
    if (cur && Array.from(artSel.options).some((o) => o.value === cur)) artSel.value = cur;
    populateStep1AreaMultiMenu(areas);
    try {
      if (typeof window.syncGlobalSearchArticulationAreas === 'function') {
        window.syncGlobalSearchArticulationAreas();
      }
    } catch (_) {}
  }

  function populateStep1AreaMultiMenu(areas) {
    const menu = document.getElementById('step1AreaMultiMenu');
    if (!menu) return;
    const list = Array.isArray(areas) ? areas : [];
    menu.innerHTML = '';

    const tools = document.createElement('div');
    tools.className = 'step1-multi-menu-tools';
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      step1PortfolioState.checkedAreaKeys.clear();
      syncStep1MultiMenusFromState();
      syncStep1FilterBarLabels();
      if (typeof window.step1Rerender === 'function') window.step1Rerender({ openPanel: step1DetailPanelShouldStayOpen() });
    });
    tools.appendChild(clearBtn);
    menu.appendChild(tools);

    list.forEach(({ valueKey, label, count }) => {
      const row = document.createElement('label');
      row.className = 'step1-multi-option';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'step1-area-multi-cb';
      cb.value = valueKey;
      cb.checked = step1AreaIsChecked(valueKey);
      cb.addEventListener('change', () => {
        toggleStep1CheckedArea(valueKey, cb.checked);
        syncStep1FilterBarLabels();
        if (typeof window.step1Rerender === 'function') window.step1Rerender({ openPanel: step1DetailPanelShouldStayOpen() });
      });
      const text = document.createElement('span');
      text.className = 'step1-multi-option-text';
      const sc = count === 1 ? '1 school' : `${count} schools`;
      text.textContent = `${label} — ${sc}`;
      row.appendChild(cb);
      row.appendChild(text);
      menu.appendChild(row);
    });
    syncStep1FilterBarLabels();
  }

  function populateStep1SchoolMultiMenu(names) {
    const menu = document.getElementById('step1SchoolMultiMenu');
    if (!menu) return;
    const list = Array.isArray(names) ? names : [];
    menu.innerHTML = '';

    const tools = document.createElement('div');
    tools.className = 'step1-multi-menu-tools';
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      step1PortfolioState.checkedSchoolNames.clear();
      syncStep1MultiMenusFromState();
      syncStep1FilterBarLabels();
      if (typeof window.step1Rerender === 'function') window.step1Rerender({ openPanel: !!step1PortfolioState.selectedAreaKey });
    });
    tools.appendChild(clearBtn);
    menu.appendChild(tools);

    list.forEach((name) => {
      const row = document.createElement('label');
      row.className = 'step1-multi-option';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'step1-school-multi-cb';
      cb.value = name;
      cb.checked = step1SchoolIsChecked(name);
      cb.addEventListener('change', () => {
        toggleStep1CheckedSchool(name, cb.checked);
        syncStep1FilterBarLabels();
        if (typeof window.step1Rerender === 'function') window.step1Rerender({ openPanel: !!step1PortfolioState.selectedAreaKey });
      });
      const text = document.createElement('span');
      text.className = 'step1-multi-option-text';
      text.textContent = mainDisplaySchoolName(name);
      row.appendChild(cb);
      row.appendChild(text);
      menu.appendChild(row);
    });
    syncStep1FilterBarLabels();
  }

  function syncStep1MultiMenusFromState() {
    document.querySelectorAll('#step1AreaMultiMenu input.step1-area-multi-cb').forEach((cb) => {
      cb.checked = step1AreaIsChecked(cb.value);
    });
    document.querySelectorAll('#step1SchoolMultiMenu input.step1-school-multi-cb').forEach((cb) => {
      cb.checked = step1SchoolIsChecked(cb.value);
    });
  }

  function bindStep1MultiSelectMenusOnce() {
    if (window.__step1MultiSelectBound) return;
    window.__step1MultiSelectBound = true;

    const closeMenus = () => {
      document.querySelectorAll('.step1-multi-menu').forEach((m) => { m.hidden = true; });
      document.querySelectorAll('.step1-multi-btn').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    };

    const wire = (btnId, menuId) => {
      const btn = document.getElementById(btnId);
      const menu = document.getElementById(menuId);
      if (!btn || !menu) return;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const open = menu.hidden;
        closeMenus();
        menu.hidden = !open;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      menu.addEventListener('click', (e) => e.stopPropagation());
    };
    wire('step1AreaMultiBtn', 'step1AreaMultiMenu');
    wire('step1SchoolMultiBtn', 'step1SchoolMultiMenu');
    document.addEventListener('click', closeMenus);
  }

  function setStep1CompareSlotCount(targetCompareSlots, allNames, onRerender) {
    const list = document.getElementById('step1CompareSelectsList');
    const addBtn = document.getElementById('step1AddCompareSlot');
    if (!list || list.dataset.slotsBuilt !== '1') return;
    const cap = Math.min(Math.max(0, targetCompareSlots), STEP1_COMPARE_MAX_SLOTS);
    let selects = getStep1CompareSelectElements();
    while (selects.length < cap) {
      appendStep1CompareSlot(list, allNames, selects.length + 1, onRerender);
      selects = getStep1CompareSelectElements();
    }
    while (selects.length > cap) {
      const labels = list.querySelectorAll(':scope > label');
      const last = labels[labels.length - 1];
      if (last) last.remove();
      else break;
      selects = getStep1CompareSelectElements();
    }
    refreshStep1CompareSelectOptions(allNames);
    if (addBtn) addBtn.disabled = selects.length >= STEP1_COMPARE_MAX_SLOTS;
  }

  function getStep1CheckedSchoolNamesSorted() {
    const names = Array.from(step1PortfolioState.checkedSchoolNames || [])
      .map((n) => String(n || '').trim())
      .filter(Boolean);
    const seen = new Set();
    const out = [];
    names.forEach((n) => {
      const k = norm(n);
      if (!k || seen.has(k)) return;
      seen.add(k);
      out.push(n);
    });
    return out.sort((a, b) =>
      mainDisplaySchoolName(a).localeCompare(mainDisplaySchoolName(b), undefined, {
        sensitivity: 'base',
        numeric: true,
      })
    );
  }

  function applySelectedSchoolsCompareSelection(schoolNames, onRerender) {
    const rows = getDecisionSchoolRows();
    const selectEl = document.getElementById('step1SchoolSelect');
    const compareModeCb = document.getElementById('step1CompareMode');
    if (!rows || !selectEl) return;

    const requested = Array.isArray(schoolNames) ? schoolNames : [];
    const byNorm = new Map();
    rows.forEach((r) => {
      const n = getSchoolName(r);
      if (!n) return;
      const k = norm(n);
      if (k && !byNorm.has(k)) byNorm.set(k, n);
    });

    const resolved = [];
    const seen = new Set();
    requested.forEach((raw) => {
      const hit = byNorm.get(norm(raw));
      if (!hit) return;
      const k = norm(hit);
      if (seen.has(k)) return;
      seen.add(k);
      resolved.push(hit);
    });

    if (resolved.length === 0) return;

    // Cross-area school picks: fit cards so every selected school stays visible.
    setStep1FitAllInView(true);

    const maxSchools = STEP1_COMPARE_MAX_SLOTS + 1;
    const useNames = resolved.length > maxSchools ? resolved.slice(0, maxSchools) : resolved;
    const allNames = Array.from(new Set(rows.map(getSchoolName).filter(Boolean).map(String))).sort((a, b) =>
      a.localeCompare(b)
    );

    if (compareModeCb) compareModeCb.checked = true;

    selectEl.value = useNames[0];
    const compareCount = Math.min(Math.max(0, useNames.length - 1), STEP1_COMPARE_MAX_SLOTS);
    setStep1CompareSlotCount(compareCount, allNames, onRerender);
    const cmpSelects = getStep1CompareSelectElements();
    for (let i = 0; i < compareCount; i += 1) {
      const nm = useNames[i + 1];
      if (cmpSelects[i]) cmpSelects[i].value = nm || '';
    }

    if (typeof onRerender === 'function') onRerender();
  }

  function applyArticulationAreaCompareSelection(areaKey, onRerender) {
    const rows = getDecisionSchoolRows();
    const selectEl = document.getElementById('step1SchoolSelect');
    const compareModeCb = document.getElementById('step1CompareMode');
    if (!rows || !selectEl || !isValidArticulationAreaKey(areaKey)) return;
    setStep1FitAllInView(areaKey !== OPTION_SCHOOLS_AREA_KEY);

    const namesInArea = Array.from(
      new Set(
        schoolsInArticulationArea(rows, areaKey)
          .map((r) => getSchoolName(r))
          .filter(Boolean)
          .map(String)
      )
    ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));

    if (namesInArea.length === 0) return;

    const maxSchools = STEP1_COMPARE_MAX_SLOTS + 1;
    const useNames = namesInArea.length > maxSchools ? namesInArea.slice(0, maxSchools) : namesInArea;

    const allNames = Array.from(new Set(rows.map(getSchoolName).filter(Boolean).map(String))).sort((a, b) => a.localeCompare(b));

    if (compareModeCb) compareModeCb.checked = true;

    selectEl.value = useNames[0];
    const compareCount = Math.min(useNames.length - 1, STEP1_COMPARE_MAX_SLOTS);
    setStep1CompareSlotCount(compareCount, allNames, onRerender);
    const cmpSelects = getStep1CompareSelectElements();
    for (let i = 0; i < compareCount; i += 1) {
      const nm = useNames[i + 1];
      if (cmpSelects[i]) cmpSelects[i].value = nm || '';
    }

    if (typeof onRerender === 'function') onRerender();
  }

  /** Rebuild articulation options after Map_Export merge (schoolData exists before articulation is applied). */
  function refreshStep1ArticulationDropdown() {
    const rows = getDecisionSchoolRows();
    if (!rows || rows.length === 0) return;
    populateStep1ArticulationCompareSelect(rows);
    const names = Array.from(new Set(rows.map(getSchoolName).filter(Boolean).map(String))).sort((a, b) => a.localeCompare(b));
    const schoolSelect = document.getElementById('step1SchoolSelect');
    if (schoolSelect) {
      const current = schoolSelect.value;
      const existingValues = new Set(Array.from(schoolSelect.options).map((option) => option.value));
      names.forEach((name) => {
        if (existingValues.has(name)) return;
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = mainDisplaySchoolName(name);
        schoolSelect.appendChild(opt);
        existingValues.add(name);
      });
      if (current) schoolSelect.value = current;
    }
    populateStep1SchoolMultiMenu(names);
    const list = document.getElementById('step1CompareSelectsList');
    if (list && list.dataset.slotsBuilt === '1') {
      refreshStep1CompareSelectOptions(names);
    }
    renderStep1DistrictAreaCompare();
  }
  try { window.refreshStep1ArticulationDropdown = refreshStep1ArticulationDropdown; } catch {}

  window.syncGlobalSearchArticulationAreas = function syncGlobalSearchArticulationAreas() {
    if (typeof window.globalSearchRegisterArticulationAreas !== 'function') return;
    const rows = getDecisionSchoolRows();
    const areas = collectArticulationAreasForStep1(rows).map(({ valueKey, label }) => ({
      key: valueKey,
      label,
      hasMapBoundary:
        valueKey !== OPTION_SCHOOLS_AREA_KEY
        && typeof articulationSchoolsByArea !== 'undefined'
        && articulationSchoolsByArea
        && articulationSchoolsByArea.has(valueKey),
    }));
    window.globalSearchRegisterArticulationAreas(areas);
  };

  const STEP1_LS_CARD = 'step1CompareCardPx';
  const STEP1_LS_FIT = 'step1CompareFitWidth';

  function applyStep1CompareLayout() {
    const grid = document.getElementById('step1CompareGrid');
    const fitCb = document.getElementById('step1CompareFitWidth');
    const cardRange = document.getElementById('step1CompareCardWidth');
    const cardLbl = document.getElementById('step1CompareCardWidthLabel');
    if (!grid) return;
    const cards = grid.querySelectorAll('.step1-compare-card');
    const n = cards.length;
    const gap = parseFloat(getComputedStyle(grid).gap) || 8;

    if (fitCb && fitCb.checked && n > 0) {
      const w = grid.clientWidth;
      if (w > 0) {
        const cw = Math.floor((w - gap * Math.max(0, n - 1)) / n);
        const cl = Math.max(140, Math.min(720, cw));
        grid.style.setProperty('--step1-card-w', `${cl}px`);
      }
      if (cardRange) cardRange.disabled = true;
      if (cardLbl) {
        const v = (grid.style.getPropertyValue('--step1-card-w') || '').trim();
        cardLbl.textContent = v || 'auto';
      }
    } else {
      if (cardRange) {
        cardRange.disabled = false;
        grid.style.setProperty('--step1-card-w', `${cardRange.value}px`);
      }
      if (cardLbl && cardRange) cardLbl.textContent = `${cardRange.value}px`;
    }
  }
  try { window.applyStep1CompareLayout = applyStep1CompareLayout; } catch {}

  function setStep1FitAllInView(enabled, { persist = true } = {}) {
    const fitCb = document.getElementById('step1CompareFitWidth');
    if (!fitCb) return;
    fitCb.checked = !!enabled;
    if (persist) {
      try { localStorage.setItem(STEP1_LS_FIT, fitCb.checked ? '1' : '0'); } catch {}
    }
    applyStep1CompareLayout();
    requestAnimationFrame(() => {
      const g = document.getElementById('step1CompareGrid');
      if (g && typeof window.equalizeCompareCardHeaderHeights === 'function') {
        window.equalizeCompareCardHeaderHeights(g);
      }
    });
  }

  function bindStep1LayoutControlsOnce() {
    if (window.__step1LayoutControlsBound) return;
    const cardR = document.getElementById('step1CompareCardWidth');
    const cardLbl = document.getElementById('step1CompareCardWidthLabel');
    const fitCb = document.getElementById('step1CompareFitWidth');
    if (!cardR || !cardLbl || !fitCb) return;
    window.__step1LayoutControlsBound = true;

    function persistCard() {
      try { localStorage.setItem(STEP1_LS_CARD, cardR.value); } catch {}
    }

    let savedCard = null;
    try { savedCard = localStorage.getItem(STEP1_LS_CARD); } catch {}
    if (savedCard) {
      const sv = Number(savedCard);
      if (Number.isFinite(sv)) {
        const lo = Number(cardR.min);
        const hi = Number(cardR.max);
        cardR.value = String(Math.min(Math.max(sv, lo), hi));
      }
    }
    try {
      const savedFit = localStorage.getItem(STEP1_LS_FIT);
      fitCb.checked = savedFit == null ? true : savedFit === '1';
    } catch {
      fitCb.checked = true;
    }

    applyStep1CompareLayout();

    cardR.addEventListener('input', () => {
      if (fitCb.checked) return;
      const grid = document.getElementById('step1CompareGrid');
      if (grid) grid.style.setProperty('--step1-card-w', `${cardR.value}px`);
      cardLbl.textContent = `${cardR.value}px`;
      persistCard();
    });

    fitCb.addEventListener('change', () => {
      try { localStorage.setItem(STEP1_LS_FIT, fitCb.checked ? '1' : '0'); } catch {}
      applyStep1CompareLayout();
      requestAnimationFrame(() => {
        const g = document.getElementById('step1CompareGrid');
        if (g && typeof window.equalizeCompareCardHeaderHeights === 'function') {
          window.equalizeCompareCardHeaderHeights(g);
        }
      });
    });
  }

  function setVisibleState(hasSelection) {
    const compareMode = document.getElementById('step1CompareMode');
    const isCompare = !!(compareMode && compareMode.checked);
    const emptyState = document.getElementById('step1SchoolDataEmptyState');
    const card = document.getElementById('step1SchoolDataCard');
    if (emptyState) emptyState.style.display = isCompare ? (hasSelection ? 'none' : 'block') : 'none';
    if (card) card.style.display = (hasSelection && isCompare) ? 'block' : 'none';
    updateStep1OpenProjectListBtnState();
  }

  function initOnceReady() {
    const select = document.getElementById('step1SchoolSelect');
    const filterInput = document.getElementById('step1FieldFilter'); // optional (removed from UI)
    const showEmptyCb = document.getElementById('step1ShowEmptyFields'); // optional (removed from UI)
    const compareMode = document.getElementById('step1CompareMode');

    if (!select) return false;
    if (select.dataset.step1InitDone === '1') return true;

    const rows = getDecisionSchoolRows();
    if (!rows || rows.length === 0) return false;

    const names = Array.from(new Set(rows.map(getSchoolName).filter(Boolean).map(String))).sort((a, b) => a.localeCompare(b));

    function getSelectedRow() {
      const name = select.value;
      if (!name) return null;
      return findDecisionRowBySchoolName(name);
    }

    function rerender(opts) {
      opts = opts || {};
      renderStep1DistrictAreaCompare(opts);
      const row = getSelectedRow();
      const isCompare = !!(compareMode && compareMode.checked);
      setVisibleState(!!row);
      if (!row || !isCompare) return;
      const filterText = filterInput ? filterInput.value : '';
      const showEmpty = showEmptyCb ? !!showEmptyCb.checked : false;
      renderSchoolRow(row, filterText, showEmpty);
    }
    window.step1Rerender = rerender;

    // Populate main school select once; always sync compare slot options
    if (select.options.length <= 1) {
      names.forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = mainDisplaySchoolName(name);
        select.appendChild(opt);
      });
    }
    ensureStep1CompareSlotsInitialized(names, rerender);
    populateStep1ArticulationCompareSelect(rows);
    populateStep1SchoolMultiMenu(names);
    bindStep1MultiSelectMenusOnce();

    const artSel = document.getElementById('step1CompareArticulationSelect');
    if (artSel && !artSel.dataset.bound) {
      artSel.dataset.bound = '1';
      // Hidden focus select — kept in sync from row clicks / openStep1SchoolInPortfolio.
    }

    select.addEventListener('change', () => {
      if (filterInput) filterInput.value = '';
      const name = select.value;
      if (!name) {
        step1PortfolioState.selectedSchoolName = null;
        rerender({ openPanel: !!step1PortfolioState.selectedAreaKey });
        return;
      }
      openStep1SchoolInPortfolio(name, { syncSelect: false });
      rerender({ openPanel: true });
    });
    if (filterInput) filterInput.addEventListener('input', rerender);
    if (showEmptyCb) showEmptyCb.addEventListener('change', rerender);
    if (compareMode) compareMode.addEventListener('change', rerender);

    const step1PkTogg = document.getElementById('step1IncludePKToggle');
    if (step1PkTogg) {
      step1PkTogg.checked = (window.getIncludePKInEnrollment && window.getIncludePKInEnrollment()) || false;
      step1PkTogg.addEventListener('change', () => {
        if (window.setIncludePKInEnrollment) window.setIncludePKInEnrollment(step1PkTogg.checked);
        const flow1Togg = document.getElementById('includePKInEnrollmentToggle');
        if (flow1Togg) flow1Togg.checked = step1PkTogg.checked;
        if (typeof window.sendSliderData === 'function') window.sendSliderData();
        rerender();
      });
    }

    select.dataset.step1InitDone = '1';

    bindStep1PortfolioControlsOnce(rerender);
    renderStep1DistrictAreaCompare();

    // Initial state
    setVisibleState(false);

    bindStep1LayoutControlsOnce();

    // Keep compare cards aligned when the viewport changes size.
    if (!window.__step1CompareResizeBound) {
      window.__step1CompareResizeBound = true;
      let t = null;
      window.addEventListener('resize', () => {
        if (t) clearTimeout(t);
        t = setTimeout(() => {
          if (typeof window.applyStep1CompareLayout === 'function') window.applyStep1CompareLayout();
          const grid = document.getElementById('step1CompareGrid');
          if (grid && typeof window.equalizeCompareCardHeaderHeights === 'function') {
            window.equalizeCompareCardHeaderHeights(grid);
          }
        }, 120);
      });
    }
    return true;
  }

  document.addEventListener('jeffco-year-labels-updated', () => {
    try {
      if (typeof window.step1Rerender === 'function') window.step1Rerender();
    } catch (e) { /* ignore */ }
  });

  document.addEventListener('jeffco-grades-served-ready', () => {
    try {
      if (typeof window.step1Rerender === 'function') window.step1Rerender();
    } catch (e) { /* ignore */ }
  });

  document.addEventListener('DOMContentLoaded', () => {
    bindStep1OpenProjectListBtn();
    // decisionLogic loads async; poll briefly until data is ready.
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (initOnceReady() || tries > 200) { // ~20s max
        clearInterval(timer);
        updateStep1OpenProjectListBtnState();
      }
    }, 100);
  });
})();