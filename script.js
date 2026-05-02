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

// Cache-bust static data files when needed (bump when CSV/GeoJSON changes).
const ASSET_VERSION = '2026-02-05-1';

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
  const e = parseFloat((row.Enrollment ?? row.enrollment ?? row['Enrollment'] ?? '').toString().replace(/,/g, '').trim()) || 0;
  const pk = parseFloat((row.PKEnrollment ?? row['PKEnrollment'] ?? row['PK Enrollment'] ?? '').toString().replace(/,/g, '').trim()) || 0;
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
/** 2030 headcount: mirrors PK toggle — with PK off, prefer explicit 2030_K+ else 2030_Total − 2030_PK. */
window.getEffectiveProjectedEnrollment = function (row) {
  if (!row) return null;
  const inc = window.getIncludePKInEnrollment && window.getIncludePKInEnrollment();
  const parse = (v) => {
    const n = parseFloat((v ?? '').toString().replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : null;
  };
  if (inc) return parse(row['2030_Total'] ?? row['2030 Total']) ?? null;
  const kPlus = parse(row['2030_K+'] ?? row['2030 K+']);
  if (kPlus != null) return kPlus;
  const total2030 = parse(row['2030_Total'] ?? row['2030 Total']);
  if (total2030 == null) return null;
  const pk2030 = parse(row['2030_PK'] ?? row['2030 PK']);
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
  let current;
  if (inc) {
    current = parse(row.Enrollment ?? row['Enrollment']) ?? 0;
  } else {
    const pk = parse(row.PKEnrollment ?? row['PKEnrollment']) ?? 0;
    const total = parse(row.Enrollment ?? row['Enrollment']) ?? 0;
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
const ARTICULATION_AREAS_GEOJSON_PATH = 'ArticulationArea.geojson';
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
// FCI deficiency table
const FCI_DEFICIENCY_CSV_PATH = 'FCIdeficiencytable.csv';
const FCI_STATUS_COLORS = {
  excellent: '#166534',
  good: '#84cc16',
  fair: '#f59e0b',
  poor: '#f97316',
  deficient: '#dc2626',
  nodata: '#16a34a'
};
// Historic bond spending + enrollment growth by articulation (Map_Export Articulation)
const BOND_SPENDING_CSV_PATH = 'HistoricArticulationData.csv';
/** Sentinel for GeoJSON: no enrollment growth value from CSV */
const ENROLLMENT_GROWTH_NODATA = -999;
// EA classroom condition
const EA_CLASSROOMS_CSV_PATH = 'EAClassrooms.csv';
const EA_CONDITION_COLORS = {
  poor: '#dc2626',
  fair: '#f59e0b',
  good: '#a3e635',
  excellent: '#16a34a',
  nodata: '#9ca3af'
};
const BUILDING_CONDITION_COLORS = {
  poor: '#dc2626',
  fair: '#f59e0b',
  good: '#a3e635',
  excellent: '#16a34a',
  nodata: '#9ca3af'
};
let articulationAreasGeojson4326 = null;
let articulationAreasLoaded = false;
// articulation name -> { totalSpending, pctOfTotal, enrollmentGrowthPct? } from HistoricArticulationData.csv
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
let fciRows = [];
let fciBySchoolId = new Map(); // id -> { squareFt, overallFci, bySystem: Map }
let fciSystems = [];
let fciOverallQuartiles = null; // { q1, q3 }
let fciSystemQuartiles = new Map(); // system -> { q1, q3 }
let fciSelectedSystem = '';
let eaScoresById = new Map(); // id -> classroom EA score
let eaClassroomCountsById = new Map(); // id -> classroom count
let eaScoresByName = new Map(); // normalized name -> EA score
let eaClassroomCountsByName = new Map(); // normalized name -> classroom count
let eaQuintiles = null; // { q1, q2, q3, q4 }
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

function getEaConditionColorHex(status) {
  const key = (status || '').toString().trim().toLowerCase();
  if (key === 'poor') return EA_CONDITION_COLORS.poor;
  if (key === 'fair') return EA_CONDITION_COLORS.fair;
  if (key === 'good') return EA_CONDITION_COLORS.good;
  if (key === 'excellent') return EA_CONDITION_COLORS.excellent;
  return EA_CONDITION_COLORS.nodata;
}
function getEaConditionColorKey(status) {
  return getEaConditionColorHex(status).replace('#', '').toLowerCase();
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
  classroom: { label: 'Classroom condition' },
  building: { label: 'Building Score' }
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
  if (categoryKey === 'classroom') {
    return [
      { key: 'Poor', label: 'Poor (<= Q1)', color: EA_CONDITION_COLORS.poor },
      { key: 'Fair', label: 'Fair (Q1–Q2)', color: EA_CONDITION_COLORS.fair },
      { key: 'Good', label: 'Good (Q2–Q3)', color: EA_CONDITION_COLORS.good },
      { key: 'Excellent', label: 'Excellent (> Q3)', color: EA_CONDITION_COLORS.excellent },
      { key: 'No Data', label: 'No Data', color: EA_CONDITION_COLORS.nodata }
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
  if (categoryKey === 'classroom') {
    return feature?.properties?.__eaCondition || 'No Data';
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

// Diverging scale: enrollment change 2015→2025 (% points), clamped ±50; grey = no data
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
      -50, '#b91c1c',
      -25, '#fca5a5',
      0, '#f8fafc',
      25, '#86efac',
      50, '#15803d'
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

/** Choropleth modes use full opacity; default area colors are 30% more transparent. */
const ARTICULATION_FILL_OPACITY_CHOROPLETH = 0.82;
const ARTICULATION_FILL_OPACITY_STANDARD = 0.82 * 0.7;

function getArticulationFillOpacity() {
  const enrollCb = document.getElementById('toggleEnrollmentGrowthColors');
  const bondCb = document.getElementById('toggleBondSpendingColors');
  if (enrollCb && enrollCb.checked) return ARTICULATION_FILL_OPACITY_CHOROPLETH;
  if (bondCb && bondCb.checked) return ARTICULATION_FILL_OPACITY_CHOROPLETH;
  return ARTICULATION_FILL_OPACITY_STANDARD;
}

function refreshArticulationAreaPaintColors() {
  try {
    const m = window.map;
    if (!m || !m.getLayer('articulation-areas-fill')) return;
    const expr = getArticulationFillColorExpression();
    const opacity = getArticulationFillOpacity();
    m.setPaintProperty('articulation-areas-fill', 'fill-color', expr);
    m.setPaintProperty('articulation-areas-fill', 'fill-opacity', opacity);
    if (m.getLayer('articulation-areas-outline')) {
      m.setPaintProperty('articulation-areas-outline', 'line-color', expr);
    }
  } catch (e) {}
}

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

function getFciRowSquareFt(row) {
  const raw =
    row?.Sqft ??
    row?.SqFt ??
    row?.["Sq Ft"] ??
    row?.["SquareFt"] ??
    row?.["Square Ft"] ??
    row?.["Square Feet"] ??
    row?.["SquareFeet"];
  return parseNumberLoose(raw);
}

function getFciRowValue(row) {
  const raw = row?.FCI ?? row?.Fci ?? row?.["Fci"];
  return parseNumberLoose(raw);
}

function getEaRowValue(row) {
  const raw =
    row?.ClassroomEAScore ??
    row?.["Classroom EA Score"] ??
    row?.["EA Score"] ??
    row?.["EAScore"];
  return parseNumberLoose(raw);
}

function getBuildingScoreValue(row) {
  const raw = row?.BuildingScore ?? row?.["BuildingScore"] ?? row?.["Building Score"];
  return parseNumberLoose(raw);
}

function calcAvgCostPerSf(sf, totalCost, rowCount) {
  if (!Number.isFinite(sf) || !Number.isFinite(totalCost) || !Number.isFinite(rowCount)) return null;
  if (sf <= 0 || totalCost <= 0 || rowCount <= 0) return null;
  return (sf / totalCost) / rowCount;
}

function buildFciModel(rows, decisionRows) {
  const squareFtById = new Map();
  (decisionRows || []).forEach((r) => {
    const id = normalizeId(r?.UniqueID ?? r?.["UniqueID"] ?? r?.["Unique Id"]);
    if (!id) return;
    const sf = getDecisionSquareFt(r);
    if (Number.isFinite(sf)) squareFtById.set(id, sf);
  });

  const bySchoolId = new Map();
  const systemsSet = new Set();

  (rows || []).forEach((r) => {
    const schoolId = normalizeId(r?.["School Code"] ?? r?.["SchoolCode"] ?? r?.SchoolCode);
    const system = (r?.System ?? '').toString().trim();
    if (!schoolId || !system) return;
    systemsSet.add(system);

    const entry = bySchoolId.get(schoolId) || {
      id: schoolId,
      squareFt: squareFtById.get(schoolId) ?? null,
      overallFci: null,
      bySystem: new Map(),
      fciValues: []
    };
    bySchoolId.set(schoolId, entry);

    const rowSf = getFciRowSquareFt(r);
    if (Number.isFinite(rowSf)) entry.squareFt = rowSf;

    const fciVal = getFciRowValue(r);
    if (Number.isFinite(fciVal)) entry.fciValues.push(fciVal);

    const totalCostSystem = parseNumberLoose(
      r?.["Total Cost by School, By System"] ??
      r?.["TotalCostBySystem"] ??
      r?.["Total Cost by School, By System"]
    );

    const p1Count = parseCountLoose(r?.["Priority1 Count"] ?? r?.["Priority 1 Count"] ?? r?.["Priority1Count"]);
    const p2Count = parseCountLoose(r?.["Priority2 Count"] ?? r?.["Priority 2 Count"] ?? r?.["Priority2Count"]);
    const p3Count = parseCountLoose(r?.["Priority3 Count"] ?? r?.["Priority 3 Count"] ?? r?.["Priority3Count"]);
    const p4Count = parseCountLoose(r?.["Priority4 Count"] ?? r?.["Priority 4 Count"] ?? r?.["Priority4Count"]);

    const p1Cost = parseNumberLoose(r?.["Priority1 Cost"] ?? r?.["Priority 1 Cost"] ?? r?.["Priority1Cost"]);
    const p2Cost = parseNumberLoose(r?.["Priority2 Cost"] ?? r?.["Priority 2 Cost"] ?? r?.["Priority2Cost"]);
    const p3Cost = parseNumberLoose(r?.["Priority3 Cost"] ?? r?.["Priority 3 Cost"] ?? r?.["Priority3Cost"]);
    const p4Cost = parseNumberLoose(r?.["Priority4 Cost"] ?? r?.["Priority 4 Cost"] ?? r?.["Priority4Cost"]);

    const existingSys = entry.bySystem.get(system) || {
      system,
      totalCostSystem: 0,
      priorityCounts: { 1: 0, 2: 0, 3: 0, 4: 0 },
      priorityCosts: { 1: 0, 2: 0, 3: 0, 4: 0 },
      fciValues: []
    };
    if (Number.isFinite(totalCostSystem)) existingSys.totalCostSystem += totalCostSystem;
    if (Number.isFinite(p1Count)) existingSys.priorityCounts[1] += p1Count;
    if (Number.isFinite(p2Count)) existingSys.priorityCounts[2] += p2Count;
    if (Number.isFinite(p3Count)) existingSys.priorityCounts[3] += p3Count;
    if (Number.isFinite(p4Count)) existingSys.priorityCounts[4] += p4Count;
    if (Number.isFinite(p1Cost)) existingSys.priorityCosts[1] += p1Cost;
    if (Number.isFinite(p2Cost)) existingSys.priorityCosts[2] += p2Cost;
    if (Number.isFinite(p3Cost)) existingSys.priorityCosts[3] += p3Cost;
    if (Number.isFinite(p4Cost)) existingSys.priorityCosts[4] += p4Cost;
    if (Number.isFinite(fciVal)) existingSys.fciValues.push(fciVal);
    entry.bySystem.set(system, existingSys);
  });

  bySchoolId.forEach((entry) => {
    const sf = entry.squareFt;
    entry.bySystem.forEach((sysEntry) => {
      const rowCount =
        (sysEntry.priorityCounts[1] || 0) +
        (sysEntry.priorityCounts[2] || 0) +
        (sysEntry.priorityCounts[3] || 0) +
        (sysEntry.priorityCounts[4] || 0);
      // If counts are missing but we have costs, assume at least 1 row
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
      const sysFciVals = sysEntry.fciValues || [];
      sysEntry.fciSystem = sysFciVals.length
        ? (sysFciVals.reduce((a, b) => a + b, 0) / sysFciVals.length)
        : null;
    });
    const vals = entry.fciValues || [];
    entry.overallFci = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : null;
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

function buildEaModel(rows) {
  const byId = new Map();
  const countsById = new Map();
  const byName = new Map();
  const countsByName = new Map();
  const scores = [];
  (rows || []).forEach((r) => {
    const id = normalizeId(r?.["School Code"] ?? r?.["SchoolCode"] ?? r?.SchoolCode);
    const nameRaw = r?.EASchoolName ?? r?.["School Name"] ?? r?.SchoolName ?? '';
    const nameVariants = buildNameVariants(nameRaw);
    const score = getEaRowValue(r);
    if (!Number.isFinite(score)) return;
    if (id) byId.set(id, score);
    nameVariants.forEach((n) => {
      if (!byName.has(n)) byName.set(n, score);
    });
    scores.push(score);
    const countRaw = r?.ClassroomCount ?? r?.["Classroom Count"] ?? r?.["Classroom_Count"];
    const count = parseCountLoose(countRaw);
    if (Number.isFinite(count)) {
      if (id) countsById.set(id, count);
      nameVariants.forEach((n) => {
        if (!countsByName.has(n)) countsByName.set(n, count);
      });
    }
  });
  const [q1, q2, q3] = computeQuantiles(scores, [0.25, 0.5, 0.75]);
  return { byId, countsById, byName, countsByName, quartiles: { q1, q2, q3 } };
}

function getEaConditionFromValue(value, quintiles) {
  if (!Number.isFinite(value) || !quintiles) return 'No Data';
  const { q1, q2, q3 } = quintiles;
  if (!Number.isFinite(q1) || !Number.isFinite(q2) || !Number.isFinite(q3)) return 'No Data';
  if (value <= q1) return 'Poor';
  if (value <= q2) return 'Fair';
  if (value <= q3) return 'Good';
  return 'Excellent';
}

function applyEaMetricsToFeatures(features) {
  if (!Array.isArray(features) || !features.length) return;
  features.forEach((f) => {
    if (!f || !f.properties) return;
    const id = normalizeId(f.properties["UniqueID"]);
    const score = eaScoresById.get(id);
    const nameKey = f.properties["Building Name"] || f.properties["School Name"] || '';
    const { score: scoreByName, count: countByName } = getEaByName(nameKey);
    const scoreFinal = Number.isFinite(score) ? score : (Number.isFinite(scoreByName) ? scoreByName : null);
    f.properties.__eaScore = scoreFinal;
    f.properties.__eaCondition = getEaConditionFromValue(scoreFinal, eaQuintiles);
    const count = eaClassroomCountsById.get(id) ?? countByName;
    f.properties.__eaClassroomCount = Number.isFinite(count) ? count : null;
    const cond = f.properties.__eaCondition;
    if (Number.isFinite(count)) {
      const cost =
        cond === 'Poor' ? count * 500000 :
        cond === 'Fair' ? count * 250000 :
        0;
      f.properties.__classroomCost = cost;
    } else {
      f.properties.__classroomCost = null;
    }
  });
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
  fciSelectedSystem = (systemName || '').toString().trim();
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
  "Standard Maintenance": "#E5D9C8",      // Light warm beige (subtle)
  "Major Capital Investment": "#F97316",  // Deep orange
  // Welcoming school: green palette
  "Welcoming School": "#22c55e",
  "Welcoming School with Capital Investment": "#16a34a",
  "Welcoming School with Building Replacement": "#15803d",
  "Closure (Goes to Welcoming School)": "#E8A0A0",  // Light red (soft, not aggressive)
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
  'Option': '#14b8a6',      // teal
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
      layerIdLower.startsWith('selected-school-') ||
      layerIdLower.includes('sending-school') ||
      layerIdLower.includes('receiving-school')
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
function applyMapStyle(styleId) {
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

// --- Halo animation (Sending School) ----------------------------------------
let haloInterval = null;
let haloRadius = 15;
let haloGrowing = true;

function startBlinkingHalo() {
  if (haloInterval) clearInterval(haloInterval);
  haloRadius = 15;
  haloGrowing = true;
  haloInterval = setInterval(() => {
    if (!map || !map.getLayer || !map.getLayer('sending-school-halo')) return;
    map.setPaintProperty('sending-school-halo', 'circle-radius', haloRadius);
    map.setPaintProperty('sending-school-halo', 'circle-opacity', 0.5 + 0.5 * Math.sin(Date.now() / 300));
    if (haloGrowing) {
      haloRadius += 1;
      if (haloRadius >= 30) haloGrowing = false;
    } else {
      haloRadius -= 1;
      if (haloRadius <= 15) haloGrowing = true;
    }
  }, 50);
}

function stopBlinkingHalo() {
  if (haloInterval) {
    clearInterval(haloInterval);
    haloInterval = null;
  }
  if (map && map.getLayer && map.getLayer('sending-school-halo')) {
    map.setPaintProperty('sending-school-halo', 'circle-opacity', 0);
  }
}

// Application initialization
document.addEventListener('DOMContentLoaded', function() {
  // Tour now starts after password authentication (see index.html password overlay)
  // startOnboardingWalkthrough();

  // Auto-open "School Decision Evaluation: Results" when "School Decision Evaluation" is opened
  const decisionInputPanel = document.getElementById('decision-input-panel');
  const decisionOutputPanel = document.getElementById('decision-output-panel');

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
    const closureScenariosBtn = document.getElementById('menuClosureScenarios');
    const dataLogicBtn = document.getElementById('menuDataLogic');
    const schoolProjectListBtn = document.getElementById('menuSchoolProjectList');
    const rightSidebar = document.getElementById('map-sidebar');
    const showMapBtn = document.getElementById('menuShowMap');
    const showFlowchartBtn = document.getElementById('menuShowFlowchart');
    const showStep1Btn = document.getElementById('menuShowStep1');

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
      if (showStep1Btn) showStep1Btn.classList.toggle('active', mode === 'step1');
    };

    const updatePanelsHintForMode = (mode) => {
      const hint = document.getElementById('menuPanelsHint');
      if (!hint) return;
      hint.style.display = (mode === 'step1') ? 'block' : 'none';
    };

    const syncMenuState = () => {
      if (leftToggle) leftToggle.checked = !body.classList.contains('sidebar-collapsed');
      if (rightToggle) rightToggle.checked = !body.classList.contains('right-sidebar-collapsed');
    };

    const showMenu = () => {
      if (!menu) return;
      body.classList.add('menu-open');
      syncMenuState();
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

    // Sticky "×" buttons on the panels (desktop + mobile)
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
        const startBtn = document.getElementById('startTourBtn');
        if (typeof window.startOnboardingWalkthrough === 'function') {
          window.startOnboardingWalkthrough();
        } else if (startBtn) {
          startBtn.click();
        }
      });
    }
    if (closureScenariosBtn) {
      closureScenariosBtn.addEventListener('click', () => {
        hideMenu();
        window.open('closure-scenarios.html', '_blank');
      });
    }
    if (dataLogicBtn) {
      dataLogicBtn.addEventListener('click', () => {
        hideMenu();
        window.open('data-viewer.html', '_blank');
      });
    }
    if (schoolProjectListBtn) {
      schoolProjectListBtn.addEventListener('click', () => {
        hideMenu();
        // Opens the School Project List / profile page in a new tab.
        window.open('school-profile.html', '_blank');
      });
    }
    if (showMapBtn) {
      showMapBtn.addEventListener('click', () => {
        hideMenu();
        if (typeof window.switchToMap === 'function') {
          window.switchToMap();
        }
        setMenuViewActive('map');
        updatePanelsHintForMode('map');
      });
    }
    if (showFlowchartBtn) {
      showFlowchartBtn.addEventListener('click', () => {
        hideMenu();
        if (typeof window.switchToFlowchart === 'function') {
          window.switchToFlowchart();
        }
        setMenuViewActive('flowchart');
        updatePanelsHintForMode('flowchart');
      });
    }
    if (showStep1Btn) {
      showStep1Btn.addEventListener('click', () => {
        hideMenu();
        // Step 1 is a dedicated school-level view: no map, no side panels.
        try {
          const btn = document.querySelector('.process-step[data-step="1"]');
          if (btn) btn.click();
        } catch (e) {}
        setMenuViewActive('step1');
        updatePanelsHintForMode('step1');
      });
    }
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
      };
      aaCb.addEventListener('change', updateArticulationVisibility);
    }
    const bondCb = document.getElementById('toggleBondSpendingColors');
    const enrollCb = document.getElementById('toggleEnrollmentGrowthColors');
    const dataLegendCb = document.getElementById('toggleArticulationDataLegend');

    const updateArticulationHistoricLegends = () => {
      const bondLeg = document.getElementById('bond-spending-map-legend');
      const enrollLeg = document.getElementById('enrollment-growth-map-legend');
      const legendOn = dataLegendCb && dataLegendCb.checked;
      const showBondLeg = legendOn && bondCb && bondCb.checked;
      const showEnrollLeg = legendOn && enrollCb && enrollCb.checked;
      if (bondLeg) bondLeg.style.display = showBondLeg ? 'block' : 'none';
      if (enrollLeg) enrollLeg.style.display = showEnrollLeg ? 'block' : 'none';
    };

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
    if (dataLegendCb) dataLegendCb.addEventListener('change', updateArticulationHistoricLegends);
    updateArticulationHistoricLegends();
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
    updatePanelsHintForMode('map');
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
  
  if (decisionInputPanel && decisionOutputPanel) {
    decisionInputPanel.addEventListener('toggle', function() {
      if (this.open) {
        // When the input panel opens, also open the results panel
        decisionOutputPanel.open = true;
      }
    });
  }

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

const map = new mapboxgl.Map({
  container: 'map',
  style: getSavedMapStyle()
  // center and zoom will be set dynamically after loading GeoJSON
});

// Expose map and geojsonData globally for prioritization UI
window.map = map;
window.geojsonData = null; // Will be set when geojson is loaded

let geojsonData;
let originalGeojsonData; // Keep a copy of the original unfiltered data
// (cleanup) Removed unused state placeholders (initialDecisionData, mapIsReady).
let selectedEnrollment = 0;
// Student roster used for Model Simulation (OD_Students.csv)
let odStudentsBySchoolName = new Map(); // normalized Attend School Name -> Array<{ studentId, currentSchoolName, lng, lat }>
let odStudentsLoadPromise = null;
let selectedTypes = [];
let minEnrollment = 0;
let maxEnrollment = 2000;
let minSeats = -500;  // Allow negative seats (over capacity schools)
let maxSeats = 500;
// Landing page default: size dots by capacity/enrollment
let showVariableRadius = true;
let showUtilizationPie = false;
let selectedFlows = ['expansion', 'maintenance', 'closure', 'other']; // Track selected flows
let schoolDistancesByOrigin = {}; // Origin UniqueID -> array of destination rows (normalized lower)
let nearbyFilterIds = null; // Active filter (origin + destinations), stored normalized
// (cleanup) Removed unused state placeholders (nearbyOverlapOnly, nearbyShowAllSchools).
let includeNonEvalSchools = false; // Include Include_Flow_Chart = "No"
let includeClosedSchools = false; // Include status = "Closed"/"No"
let mapExportRowsData = []; // Rows from Map_Export.csv
let mapExportLookupMaps = { byName: new Map(), byCode: new Map() }; // Lookups for name/code
let decisionAllRows = []; // Full Decision Data Export.csv rows (includes excluded schools)
let decisionAllByName = new Map(); // normalized name -> row
let decisionAllById = new Map();   // normalized UniqueID -> row
let articulationSchoolsByArea = new Map(); // area name -> array of school names

function ensureOdStudentsLoaded() {
  if (odStudentsLoadPromise) return odStudentsLoadPromise;
  odStudentsLoadPromise = new Promise((resolve) => {
    try {
      Papa.parse(withCacheBust("OD_Students.csv"), {
        download: true,
        header: true,
        delimiter: ",",
        skipEmptyLines: true,
        complete: function (results) {
          try {
            odStudentsBySchoolName = new Map();
            const rows = (results && results.data) ? results.data : [];
            rows.forEach((r) => {
              const schoolName = normalize(r["Attend School Name"] || r.AttendSchoolName || "");
              const studentId = (r.OBJECTID != null && String(r.OBJECTID).trim() !== "") ? String(r.OBJECTID).trim() : String(r.StudentID || "").trim();
              const lng = parseFloat((r.Longitude || "").toString().trim());
              const lat = parseFloat((r.Latitude || "").toString().trim());
              if (!schoolName || !studentId) return;
              if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
              if (!odStudentsBySchoolName.has(schoolName)) odStudentsBySchoolName.set(schoolName, []);
              odStudentsBySchoolName.get(schoolName).push({
                studentId,
                currentSchoolName: r["Attend School Name"] || r.AttendSchoolName || "",
                lng,
                lat
              });
            });
            console.log("✅ OD_Students loaded. Schools:", odStudentsBySchoolName.size, "Students:", rows.length);
          } catch (e) {
            console.error("❌ Failed to index OD_Students.csv:", e);
            odStudentsBySchoolName = new Map();
          } finally {
            resolve();
          }
        },
        error: function (err) {
          console.error("❌ Failed to load OD_Students.csv:", err);
          odStudentsBySchoolName = new Map();
          resolve();
        }
      });
    } catch (e) {
      console.error("❌ Failed to start OD_Students load:", e);
      odStudentsBySchoolName = new Map();
      resolve();
    }
  });
  return odStudentsLoadPromise;
}

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

  const norm = (s) => (s || '').toString().trim().toLowerCase();
  let match = null;

  if (originId) {
    match = Array.from(mapOriginSelect.options || []).find(opt => opt.value === originId);
  }

  if (!match && schoolName) {
    match = Array.from(mapOriginSelect.options || []).find(
      opt => norm(opt.textContent) === norm(schoolName) || norm(opt.value) === norm(schoolName)
    );
  }

  if (!match) {
    const opt = document.createElement('option');
    opt.value = originId || schoolName || '';
    opt.textContent = schoolName || originId || '';
    mapOriginSelect.appendChild(opt);
    match = opt;
  } else if (schoolName && match.textContent !== schoolName) {
    match.textContent = schoolName;
  }

  mapOriginSelect.value = match.value;
  Array.from(mapOriginSelect.options || []).forEach(opt => {
    opt.selected = opt === match;
  });

  // Keep "School Matches" hidden until a school is selected (even for programmatic changes)
  setNearbySchoolsSectionVisibility(mapOriginSelect.value);
}

function setNearbySchoolsSectionVisibility(selectedId) {
  const section = document.getElementById('nearbySchoolsSection');
  if (!section) return;

  const hasSelection = !!(selectedId && selectedId.toString().trim());
  section.style.display = hasSelection ? '' : 'none';
  // Keep School Matches collapsed until the user opens the <details> manually
  section.open = false;
  if (!hasSelection) {
    const list = document.getElementById('nearbySchoolsList');
    if (list) list.textContent = 'Select a school to see matches.';
    const cb = document.getElementById('showOverlappingGradesCb');
    if (cb) cb.checked = true;
  }
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

  // Show a popup at the clicked destination (if we have a coordinate), otherwise do nothing visual.
  try {
    if (window.map && window.mapboxgl && coordinates && Array.isArray(coordinates) && coordinates.length === 2) {
      new window.mapboxgl.Popup({ closeOnMove: true })
        .setLngLat(coordinates)
        .setHTML(
          `<div style="font-size:12px; line-height:1.25;">
            <div style="font-weight:700; margin-bottom:4px;">${destinationName}</div>
            <div>Distance to <span style="font-weight:600;">${originName}</span>: <span style="font-weight:700;">${distText} mi</span></div>
          </div>`
        )
        .addTo(window.map);
    } else {
      console.log(`📏 Distance to ${originName} from ${destinationName}: ${distText} mi`);
    }
  } catch (ePopup) {
    console.warn("⚠️ Unable to display distance popup:", ePopup);
  }
};

function updateNearbySchoolsPanel(originId, schoolName, options = {}) {
  const { overlapOnly = false, showAllSchools = false } = options;
  const container = document.getElementById('nearbySchoolsList');
  if (!container) return;
  const norm = (s) => (s || '').toString().trim().toLowerCase();
  const originKey = norm(originId) || norm(getOriginIdForName(schoolName));

  // If showing all schools, render from full decision data and skip origin checks
  if (showAllSchools) {
    const allRows = (window.decisionLogic && Array.isArray(window.decisionLogic.schoolData))
      ? window.decisionLogic.schoolData
      : [];
    if (!allRows.length) {
      container.innerHTML = 'No schools available to display.';
      return;
    }

    const cleanTextAll = (val) => {
      const str = (val || '').toString().trim();
      return str.replace(/^'+\s*/, '');
    };

    const tableRowsAll = allRows.map(r => {
      const name = r["Building Name"] || 'School';
      const grades = cleanTextAll(r["School Level"] || r["Grades"] || r["Grade Levels"]) || '—';
      return `
        <tr>
          <td style="padding:4px 6px; border-bottom:1px solid #e5e7eb;" title="${name}">${name}</td>
          <td style="padding:4px 6px; border-bottom:1px solid #e5e7eb;">${grades}</td>
          <td style="padding:4px 6px; border-bottom:1px solid #e5e7eb;">—</td>
          <td style="padding:4px 6px; border-bottom:1px solid #e5e7eb;">—</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <thead>
          <tr>
            <th style="text-align:left; padding:4px 6px; border-bottom:1px solid #d1d5db;">School</th>
            <th style="text-align:left; padding:4px 6px; border-bottom:1px solid #d1d5db;">Grades</th>
            <th style="text-align:left; padding:4px 6px; border-bottom:1px solid #d1d5db;">Overlapping Grades</th>
            <th style="text-align:left; padding:4px 6px; border-bottom:1px solid #d1d5db;">Distance</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsAll}
        </tbody>
      </table>`;
    return;
  }

  if (!originKey || !schoolDistancesByOrigin || !Array.isArray(schoolDistancesByOrigin[originKey])) {
    container.innerHTML = 'Select a school and click “Show Overlapping Grades Schools” to see matches.';
    return;
  }

  const rows = schoolDistancesByOrigin[originKey];
  if (!rows.length) {
    container.innerHTML = `No nearby schools found for ${schoolName || 'selection'}.`;
    return;
  }

  const cleanText = (val) => {
    const str = (val || '').toString().trim();
    return str.replace(/^'+\s*/, ''); // strip leading apostrophes that appear in CSV
  };

  const filteredRows = rows.filter(r => {
    const overlapClean = cleanText(r.gradeOverlap);
    return overlapOnly ? !(overlapClean && overlapClean.toLowerCase() === 'no') : true;
  });

  if (!filteredRows.length) {
    const hasAnyRows = rows.length > 0;
    container.innerHTML = overlapOnly && hasAnyRows
      ? `No overlapping-grade schools found within the threshold for ${schoolName || 'selection'}. Click “Show All Schools” to see all schools.`
      : `No nearby schools found for ${schoolName || 'selection'}.`;
    return;
  }

  const tableRows = filteredRows.map(r => {
    const name = r.destName || r.destId || 'School';
    const grades = cleanText(r.destGrades) || '—';
    const overlapClean = cleanText(r.gradeOverlap);
    const overlap = overlapClean && overlapClean.toLowerCase() !== 'no' ? overlapClean : '—';
    const distVal = parseFloat(r.distanceMiles);
    const dist = Number.isFinite(distVal) ? `${distVal.toFixed(1)} mi` : 'N/A';
    return `
      <tr>
        <td style="padding:4px 6px; border-bottom:1px solid #e5e7eb; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;" title="${name}">${name}</td>
        <td style="padding:4px 6px; border-bottom:1px solid #e5e7eb;">${grades}</td>
        <td style="padding:4px 6px; border-bottom:1px solid #e5e7eb;">${overlap}</td>
        <td style="padding:4px 6px; border-bottom:1px solid #e5e7eb;">${dist}</td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <table style="width:100%; border-collapse:collapse; font-size:12px;">
      <thead>
        <tr>
          <th style="text-align:left; padding:4px 6px; border-bottom:1px solid #d1d5db;">School</th>
          <th style="text-align:left; padding:4px 6px; border-bottom:1px solid #d1d5db;">Grades</th>
          <th style="text-align:left; padding:4px 6px; border-bottom:1px solid #d1d5db;">Overlapping Grades</th>
          <th style="text-align:left; padding:4px 6px; border-bottom:1px solid #d1d5db;">Distance</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>`;
}

function buildNearbyFilter(originId, originName, overlapOnly = false, showAllSchools = false) {
  const norm = (s) => (s || '').toString().trim().toLowerCase();
  if (showAllSchools) {
    nearbyFilterIds = null; // no filter; show all schools
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
  const cleanText = (val) => (val || '').toString().trim().replace(/^'+\s*/, '');
  rows.forEach(r => {
    const overlapClean = cleanText(r.gradeOverlap);
    if (overlapOnly && overlapClean && overlapClean.toLowerCase() === 'no') return;
    if (r.destId) ids.add(norm(r.destId));
    if (r.destName) ids.add(norm(r.destName));
  });
  nearbyFilterIds = Array.from(ids);
}

function applyNearbyFilter(originId, originName, overlapOnly = false, showAllSchools = false) {
  // (cleanup) overlapOnly/showAllSchools are passed through to downstream render/update calls.
  buildNearbyFilter(originId, originName, overlapOnly, showAllSchools);
  updateNearbySchoolsPanel(originId, originName, { overlapOnly, showAllSchools });
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
          "Standard Maintenance", '#E5D9C8',
          "Major Capital Investment", '#F97316',
          "Welcoming School", '#22c55e',
          "Welcoming School with Capital Investment", '#16a34a',
          "Welcoming School with Building Replacement", '#15803d',
          "Closure (Goes to Welcoming School)", '#E8A0A0',
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
        const src = m.getSource('articulation-areas');
        if (src && typeof src.setData === 'function' && articulationAreasGeojson4326) {
          src.setData(ensureBondDataInArticulationGeoJSON(articulationAreasGeojson4326));
        }
      } catch {}
    }

    const insertBefore = (m.getLayer('schools-layer') ? 'schools-layer' : undefined);

    if (!m.getLayer('articulation-areas-fill')) {
      const layerDef = {
        id: 'articulation-areas-fill',
        type: 'fill',
        source: 'articulation-areas',
        layout: { visibility: aaVis },
        paint: {
          'fill-color': getArticulationFillColorExpression(),
          'fill-opacity': getArticulationFillOpacity()
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
          'line-color': getArticulationFillColorExpression(),
          'line-opacity': 0.45,
          'line-width': 1.5
        }
      };
      if (insertBefore) m.addLayer(layerDef, insertBefore);
      else m.addLayer(layerDef);
    } else {
      try { m.setLayoutProperty('articulation-areas-outline', 'visibility', aaVis); } catch {}
    }

    const labelsVis = (aaCb && aaCb.checked) ? 'visible' : 'none';
    if (!m.getLayer('articulation-areas-labels')) {
      m.addLayer({
        id: 'articulation-areas-labels',
        type: 'symbol',
        source: 'articulation-areas',
        filter: ['!=', ['coalesce', ['get', '__aaName'], ''], ''],
        layout: {
          'text-field': ['get', '__aaName'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10, 10, 12, 12, 14, 14, 16, 16, 18, 18, 20],
          'text-anchor': 'center',
          'text-allow-overlap': false,
          'text-ignore-placement': false,
          visibility: labelsVis
        },
        paint: {
          'text-color': '#1f2937',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5
        }
      }, insertBefore);
    } else {
      try { m.setLayoutProperty('articulation-areas-labels', 'visibility', labelsVis); } catch {}
    }

    // Ensure data is (re)loaded after style changes; safe no-op if already cached.
    try {
      loadArticulationAreas4326()
        .then((gj) => {
          try {
            const src = m.getSource('articulation-areas');
            if (src && typeof src.setData === 'function') src.setData(ensureBondDataInArticulationGeoJSON(gj || emptyFc));
          } catch {}
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
          "Standard Maintenance", '#E5D9C8',
          "Major Capital Investment", '#F97316',
          "Welcoming School", '#22c55e',
          "Welcoming School with Capital Investment", '#16a34a',
          "Welcoming School with Building Replacement", '#15803d',
          "Closure (Goes to Welcoming School)", '#E8A0A0',
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

  // Nearby destinations highlight layer
  if (!m.getLayer('nearby-destinations-layer')) {
    m.addLayer({
      id: 'nearby-destinations-layer',
      type: 'circle',
      source: 'schools',
      layout: {
        'visibility': 'none'
      },
      paint: {
        'circle-radius': 10,
        'circle-color': '#ffffff',
        'circle-opacity': 0,
        'circle-stroke-color': '#00bcd4',
        'circle-stroke-width': 2
      }
    });
  }

  // Assigned schools source/layer (for assignments)
  if (!m.getSource('assigned-schools')) {
    m.addSource('assigned-schools', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  }
  if (!m.getLayer('assigned-schools-layer')) {
    m.addLayer({
      id: 'assigned-schools-layer',
      type: 'circle',
      source: 'assigned-schools',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'assigned'], 0, 4, 10, 8, 50, 16, 100, 24],
        'circle-color': '#FF530D',
        'circle-opacity': 0.8,
        'circle-stroke-color': '#333',
        'circle-stroke-width': 1
      }
    });
  }

  // Sending school halo source/layer
  if (!m.getSource('sending-school')) {
    m.addSource('sending-school', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  }
  if (!m.getLayer('sending-school-halo')) {
    m.addLayer({
      id: 'sending-school-halo',
      type: 'circle',
      source: 'sending-school',
      paint: {
        'circle-radius': 15,
        'circle-color': '#FFD700',
        'circle-opacity': 0.8,
        'circle-blur': 0.6
      }
    });
  }

  // Isochrone source/layer (leave empty unless computed)
  if (!m.getSource('isochrone')) {
    m.addSource('isochrone', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  }
  if (!m.getLayer('isochrone-layer')) {
    m.addLayer({
      id: 'isochrone-layer',
      type: 'fill',
      source: 'isochrone',
      paint: { 'fill-color': '#1E90FF', 'fill-opacity': 0.3 }
    });
  }

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
      : ((window.__mapColorByMode === 'classroom') ? 'classroom'
        : ((window.__mapColorByMode === 'fci') ? 'fci'
          : ((window.__mapColorByMode === 'utilization') ? 'utilization'
            : ((window.__mapColorByMode === 'level') ? 'level' : 'decision'))));

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
    } else if (mode === 'classroom') {
      legendKey = f?.properties?.__eaCondition || 'No Data';
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
        : ((window.__mapColorByMode === 'classroom') ? 'classroom'
          : ((window.__mapColorByMode === 'fci') ? 'fci'
            : ((window.__mapColorByMode === 'utilization') ? 'utilization'
              : ((window.__mapColorByMode === 'level') ? 'level' : 'decision'))));

      if (mode === 'level') {
        const lvl = (f && f.properties) ? (f.properties.__schoolLevelNorm || normalizeSchoolLevel(f.properties['School Level']) || 'Unknown') : 'Unknown';
        return getSchoolLevelColorKey(lvl);
      }
      if (mode === 'building') {
        const status = f?.properties?.__buildingCondition || 'No Data';
        return getBuildingConditionColorKey(status);
      }
      if (mode === 'classroom') {
        const status = f?.properties?.__eaCondition || 'No Data';
        return getEaConditionColorKey(status);
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
        : ((window.__mapColorByMode === 'classroom') ? 'classroom'
          : ((window.__mapColorByMode === 'fci') ? 'fci'
            : ((window.__mapColorByMode === 'utilization') ? 'utilization'
              : ((window.__mapColorByMode === 'level') ? 'level' : 'decision'))));
      const colorKey =
        (mode === 'building')
          ? getBuildingConditionColorKey(f.properties.__buildingCondition || 'No Data')
          : (mode === 'classroom')
          ? getEaConditionColorKey(f.properties.__eaCondition || 'No Data')
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

  // Size dots by enrollment when toggleYes ("Show size by capacity (enrollment)") is active
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
const showingAssignments = false;
let flowCheckboxStates = {
  'flow-expansion': true,
  'flow-maintenance': true,
  'flow-closure': true,
  'flow-other': true
};

function updateLegend() {
  console.log("🔄 updateLegend called, current checkbox states:", JSON.stringify(flowCheckboxStates));
  
  const legendContent = document.getElementById('legend-content');
  const legendToggle = document.getElementById('legend-toggle');
  if (!legendContent) return;
  const colorMode =
    (window.__mapColorByMode === 'building') ? 'building'
    : ((window.__mapColorByMode === 'classroom') ? 'classroom'
      : ((window.__mapColorByMode === 'fci') ? 'fci'
        : ((window.__mapColorByMode === 'utilization') ? 'utilization'
          : ((window.__mapColorByMode === 'level') ? 'level' : 'decision'))));
  const useDecisionColors = colorMode === 'decision';
  
  legendContent.innerHTML = '';
  // Match the padding scale used by Map Filters panel content
  legendContent.style.cssText = 'padding: 8px 10px 12px 10px; line-height: 1.4; max-height: 80vh; overflow-y: auto;';

  // Update the toggle label to reflect current mode (Decision Types Legend vs Assignment View)
  if (legendToggle) {
    const baseLabel =
      showingAssignments
        ? 'Assignment View'
        : (colorMode === 'building')
        ? 'Building Score Legend'
          : (colorMode === 'classroom')
            ? 'Classroom Condition Legend'
            : (colorMode === 'fci')
              ? 'FCI Legend'
              : (colorMode === 'utilization')
                ? 'Utilization Legend'
                : (colorMode === 'level')
                  ? 'School Level Legend'
                  : 'Decision Types Legend';
    const chevron = legendToggle.querySelector('span.chevron');
    const textSpan = legendToggle.querySelector('.legend-title') || legendToggle.querySelector('span:not(.chevron)');
    if (textSpan) textSpan.textContent = baseLabel;
    // Chevron glyph stays constant; CSS handles rotation based on collapsed/expanded state.
    if (chevron) chevron.textContent = '▸';
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
      "Standard Maintenance": '#E5D9C8',        // Light warm beige
      "Major Capital Investment": '#F97316'     // Deep orange
    },
    "Closure/Consolidation": {
      "Welcoming School": '#22c55e',             // Green
      "Welcoming School with Capital Investment": '#16a34a',
      "Welcoming School with Building Replacement": '#15803d',
      "Closure (Goes to Welcoming School)": '#E8A0A0'  // Light red (soft)
    }
  };

  const assignmentLegend = {
    "Assigned Students": '#FF530D'
  };

  // Title is now handled by the legend toggle header; no separate title inside content

  const addLegendFilterRow = (mode, key, label, color) => {
    const state = getLegendFilterState(mode);
    if (!(key in state)) state[key] = true;
    const row = document.createElement('label');
    row.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:4px; cursor:pointer;';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state[key] !== false;
    cb.addEventListener('change', (e) => {
      state[key] = !!e.target.checked;
      try { updateLayer(); } catch {}
    });
    const swatch = document.createElement('span');
    swatch.style.cssText = `background:${color}; width: 12px; height: 12px; border-radius: 2px; border: 1px solid #cbd5e1; display:inline-block;`;
    const txt = document.createElement('span');
    txt.textContent = label;
    txt.style.cssText = 'font-size: 12px; color:#111827; font-weight:700;';
    row.appendChild(cb);
    row.appendChild(swatch);
    row.appendChild(txt);
    legendContent.appendChild(row);
  };

  const appendSchoolLevelLegend = () => {
    const hdr = document.createElement('div');
    hdr.textContent = 'School Level Colors';
    hdr.style.cssText = 'font-weight:900; margin: 10px 0 6px 0; color:#111827;';
    legendContent.appendChild(hdr);

    const levels = [
      ['Elementary', '#2563eb'],
      ['Middle', '#7c3aed'],
      ['High', '#dc2626'],
      ['Alternative', '#10b981'],
      ['Multi-Level', '#0ea5e9'],
      ['Option', '#14b8a6']
    ];
    levels.forEach(([label, color]) => {
      addLegendFilterRow('level', label, label, color);
    });
  };

  if (showingAssignments) {
    for (const [label, color] of Object.entries(assignmentLegend)) {
      const row = document.createElement('div');
      row.className = 'legend-row';
      row.style.cssText = 'margin-bottom: 1px; padding: 0; display: flex; align-items: center;';
      
      // Create color swatch
      const swatch = document.createElement('span');
      swatch.className = 'legend-swatch';
      swatch.style.cssText = `background:${color}; width: 12px; height: 12px; border-radius: 2px; margin-right: 4px; border: 1px solid #ccc; display: inline-block;`;
      
      // Create label text
      const labelText = document.createElement('span');
      labelText.textContent = label;
      labelText.style.cssText = 'font-size: 13px; color: #555;';
      
      row.appendChild(swatch);
      row.appendChild(labelText);
      legendContent.appendChild(row);
    }
  } else {
    if (colorMode === 'building') {
      const hdr = document.createElement('div');
      hdr.textContent = 'Building Score';
      hdr.style.cssText = 'font-weight:900; margin: 4px 0 6px 0; color:#111827;';
      legendContent.appendChild(hdr);

      addLegendFilterRow('building', 'Poor', 'Poor (<= Q1)', BUILDING_CONDITION_COLORS.poor);
      addLegendFilterRow('building', 'Fair', 'Fair (Q1–Q2)', BUILDING_CONDITION_COLORS.fair);
      addLegendFilterRow('building', 'Good', 'Good (Q2–Q3)', BUILDING_CONDITION_COLORS.good);
      addLegendFilterRow('building', 'Excellent', 'Excellent (> Q3)', BUILDING_CONDITION_COLORS.excellent);
      addLegendFilterRow('building', 'No Data', 'No Data', BUILDING_CONDITION_COLORS.nodata);

      const note = document.createElement('div');
      note.style.cssText = 'margin-top:6px; font-size:12px; color:#6b7280;';
      note.textContent = 'Quartiles computed client-side from BuildingScore.';
      legendContent.appendChild(note);
      return;
    }

    if (colorMode === 'classroom') {
      const hdr = document.createElement('div');
      hdr.textContent = 'Classroom Condition';
      hdr.style.cssText = 'font-weight:900; margin: 4px 0 6px 0; color:#111827;';
      legendContent.appendChild(hdr);

      addLegendFilterRow('classroom', 'Poor', 'Poor', EA_CONDITION_COLORS.poor);
      addLegendFilterRow('classroom', 'Fair', 'Fair', EA_CONDITION_COLORS.fair);
      addLegendFilterRow('classroom', 'Good', 'Good', EA_CONDITION_COLORS.good);
      addLegendFilterRow('classroom', 'Excellent', 'Excellent', EA_CONDITION_COLORS.excellent);
      addLegendFilterRow('classroom', 'No Data', 'No Data', EA_CONDITION_COLORS.nodata);

      const note = document.createElement('div');
      note.style.cssText = 'margin-top:6px; font-size:12px; color:#6b7280;';
      note.textContent = 'Quartiles computed client-side from Classroom EA scores.';
      legendContent.appendChild(note);
      return;
    }

    if (colorMode === 'fci') {
      const hdr = document.createElement('div');
      hdr.textContent = fciSelectedSystem
        ? `${fciSelectedSystem} FCI`
        : 'FCI';
      hdr.style.cssText = 'font-weight:900; margin: 4px 0 6px 0; color:#111827;';
      legendContent.appendChild(hdr);

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

      const note = document.createElement('div');
      note.style.cssText = 'margin-top:6px; font-size:12px; color:#6b7280;';
      note.textContent = fciSelectedSystem
        ? `Selected system: ${fciSelectedSystem} (Priority 1 quartiles, client-side)`
        : 'Overall FCI thresholds: ≤0.10 Excellent, ≤0.20 Good, ≤0.40 Fair, ≤0.60 Poor, ≤1.00 Deficient (client-side)';
      legendContent.appendChild(note);
      return;
    }
    // Utilization mode: show the 3-phase legend + keep flow filter checkboxes (without decision colors).
    if (colorMode === 'utilization') {
      const { low, high } = getUtilizationThresholds();
      const lowPct = Math.round(low * 100);
      const highPct = Math.round(high * 100);

      const hdr = document.createElement('div');
      hdr.textContent = 'Utilization';
      hdr.style.cssText = 'font-weight:900; margin: 4px 0 6px 0; color:#111827;';
      legendContent.appendChild(hdr);

      addLegendFilterRow('utilization', 'low', `Too low (< ${lowPct}%)`, UTILIZATION_PHASE_COLORS.low);
      addLegendFilterRow('utilization', 'mid', `In range (${lowPct}%–${highPct}%)`, UTILIZATION_PHASE_COLORS.mid);
      addLegendFilterRow('utilization', 'high', `Too high (> ${highPct}%)`, UTILIZATION_PHASE_COLORS.high);

      const note = document.createElement('div');
      note.style.cssText = 'margin-top:6px; font-size:12px; color:#6b7280;';
      note.textContent = 'Thresholds follow the utilization sliders in Strategic Sorting.';
      legendContent.appendChild(note);

      const sep1 = document.createElement('div');
      sep1.style.cssText = 'height:1px; background:#e5e7eb; margin:10px 0;';
      legendContent.appendChild(sep1);

      const filterHdr = document.createElement('div');
      filterHdr.textContent = 'Strategies (filter)';
      filterHdr.style.cssText = 'font-weight:900; margin: 4px 0 6px 0; color:#111827;';
      legendContent.appendChild(filterHdr);

      const groups = [
        { id: 'flow-expansion', label: 'Expansion' },
        { id: 'flow-maintenance', label: 'Maintenance/Investment' },
        { id: 'flow-closure', label: 'Closure/Consolidation' },
        { id: 'flow-other', label: 'Other' },
      ];

      groups.forEach((g) => {
        const row = document.createElement('label');
        row.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:6px; cursor:pointer;';
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
}

// ✅ Global popup for assignment circles
let assignmentPopup = null;

function setupAssignmentPopup() {
  console.log("🔧 Setting up assignment popup...");
  
  // Check if the layer exists
  if (!map.getLayer('assigned-schools-layer')) {
    console.error("❌ assigned-schools-layer does not exist!");
    return;
  }
  
  // Check layer visibility
  const layerVisibility = map.getLayoutProperty('assigned-schools-layer', 'visibility');
  console.log("👁️ Layer visibility:", layerVisibility);
  
  // Check if source exists and has data
  const source = map.getSource('assigned-schools');
  if (source) {
    console.log("📊 Source exists, current data:", source._data);
    console.log("📊 Number of features in source:", source._data?.features?.length || 0);
  } else {
    console.error("❌ assigned-schools source does not exist!");
  }
  
  if (!assignmentPopup) {
    assignmentPopup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false
    });
    console.log("✅ Created new assignment popup");
  }
  
  // Remove existing listeners to avoid duplicates
  map.off('mouseenter', 'assigned-schools-layer');
  map.off('mouseleave', 'assigned-schools-layer');
  
  console.log("🎯 Adding mouse event listeners to assigned-schools-layer...");
  
  // Add popup for assigned-schools layer
  map.on('mouseenter', 'assigned-schools-layer', (e) => {
    console.log("🖱️ Mouse entered assigned-schools layer!");
    console.log("🖱️ Event features:", e.features);
    console.log("🖱️ First feature properties:", e.features[0]?.properties);
    
    if (e.features && e.features.length > 0) {
      map.getCanvas().style.cursor = 'pointer';
      const coordinates = e.features[0].geometry.coordinates.slice();
      const schoolName = e.features[0].properties.name;
      const assignedCount = e.features[0].properties.assigned;
      
      console.log("🏫 School:", schoolName, "Assigned:", assignedCount);
      
      const popupContent = `
        <strong>${schoolName}</strong><br>
        <span style="color: #FF530D; font-weight: bold;">📚 Received ${assignedCount} students</span>
      `;
      
      assignmentPopup.setLngLat(coordinates).setHTML(popupContent).addTo(map);
      console.log("✅ Popup added for:", schoolName);
    } else {
      console.warn("⚠️ No features found in mouseenter event");
    }
  });

  map.on('mouseleave', 'assigned-schools-layer', () => {
    console.log("🖱️ Mouse left assigned-schools layer");
    map.getCanvas().style.cursor = '';
    assignmentPopup.remove();
  });
  
  console.log("✅ Assignment popup setup complete");
}

map.on('load', () => {
  console.log("Map loaded. Fetching initial data...");

  // Apply saved base-map label settings (roads/places/POIs) once the initial style is ready.
  try { rebuildMapLabelLayerIndex(); } catch {}
  try { applyMapLabelPrefs(); } catch {}

  const geojsonPromise = fetch(withCacheBust('Schools.geojson')).then(res => res.json());
  const decisionDataPromise = window.decisionLogic.initialize();
  decisionDataPromise.then(() => {
    try {
      if (typeof window.refreshStep1ArticulationDropdown === 'function') {
        window.refreshStep1ArticulationDropdown();
      }
    } catch (e) { /* Step 1 optional */ }
  }).catch(() => {});
  const decisionAllPromise = fetch(withCacheBust('Decision Data Export.csv'))
    .then(res => res.text())
    .then(text => new Promise(resolve => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: results => resolve(results.data || [])
      });
    }))
    .catch(err => {
      console.warn("⚠️ Failed to load full Decision Data Export.csv:", err);
      return [];
    });
  const eaPromise = fetch(withCacheBust(EA_CLASSROOMS_CSV_PATH))
    .then(res => res.text())
    .then(text => new Promise(resolve => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: results => resolve(results.data || [])
      });
    }))
    .catch(err => {
      console.warn("⚠️ Failed to load EAClassrooms.csv:", err);
      return [];
    });
  const fciPromise = fetch(withCacheBust(FCI_DEFICIENCY_CSV_PATH))
    .then(res => res.text())
    .then(text => new Promise(resolve => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: results => resolve(results.data || [])
      });
    }))
    .catch(err => {
      console.warn("⚠️ Failed to load FCI deficiency table:", err);
      return [];
    });
  const distancesPromise = fetch(withCacheBust('SchooltoSchoolDistances.csv'))
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
      console.log("📏 Loaded school-to-school distances for origins:", Object.keys(grouped).length);
    })
    .catch(err => {
      console.warn("⚠️ Failed to load SchooltoSchoolDistances.csv:", err);
      schoolDistancesByOrigin = {};
      window.schoolDistancesByOrigin = {};
    });

  const mapExportPromise = fetch(withCacheBust('Map_Export.csv'))
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
        const egRaw = r.EnrollmentGrowth ?? r['Enrollment growth'] ?? r.enrollmentgrowth ?? '';
        const eg = parseNumberLoose(egRaw);
        const enrollmentGrowthPct = Number.isFinite(eg) ? eg : null;
        bondSpendingByArticulation.set(name, { totalSpending: spending, pctOfTotal: pct, enrollmentGrowthPct });
      });
      return bondSpendingByArticulation;
    })
    .catch(err => {
      console.warn("⚠️ Failed to load HistoricArticulationData.csv:", err);
      bondSpendingByArticulation = new Map();
      return bondSpendingByArticulation;
    });

  Promise.all([geojsonPromise, decisionDataPromise, decisionAllPromise, eaPromise, fciPromise, distancesPromise, mapExportPromise, bondSpendingPromise])
    .then(([geojson, decisionData, decisionAll, eaRowsData, fciRowsData, _distances, mapExportRows, _bondSpending]) => {
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

      // Build EA classroom condition model
      try {
        const eaModel = buildEaModel(eaRowsData);
        eaScoresById = eaModel.byId;
        eaClassroomCountsById = eaModel.countsById || new Map();
        eaScoresByName = eaModel.byName || new Map();
        eaClassroomCountsByName = eaModel.countsByName || new Map();
        eaQuintiles = eaModel.quartiles;
      } catch (e) {
        console.warn("⚠️ Failed to build EA classroom model:", e);
        eaScoresById = new Map();
        eaClassroomCountsById = new Map();
        eaScoresByName = new Map();
        eaClassroomCountsByName = new Map();
        eaQuintiles = null;
      }

      // Build FCI model (joins FCI table to Decision Data Export by UniqueID)
      fciRows = Array.isArray(fciRowsData) ? fciRowsData : [];
      try {
        const model = buildFciModel(fciRows, decisionAllRows);
        fciBySchoolId = model.bySchoolId;
        fciSystems = model.systems;
        fciOverallQuartiles = model.overallQuartiles;
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
        const compareSummary = document.getElementById('compareFciSystemsSummary');
        if (compareList) {
          compareList.innerHTML = '';
          fciSystems.forEach((sys) => {
            const label = document.createElement('label');
            label.style.cssText = 'display:flex; align-items:center; gap:6px;';
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
          if (compareSummary) {
            const selectedCount = compareList.querySelectorAll('input[data-compare-fci-system]:checked').length;
            compareSummary.textContent = selectedCount ? `${selectedCount} selected` : 'Select systems';
          }
        }
      } catch (e) {}

      // Build articulation area -> school list index (for map popups)
      try {
        // Use Map_Export.csv because it contains the per-school articulation area assignment.
        // Use Decision Data Export.csv to group by School Level.
        articulationSchoolsByArea = buildArticulationSchoolsIndexFromMapExport(mapExportRowsData, decisionAllRows);
      } catch (e) {
        articulationSchoolsByArea = new Map();
      }
      try { updateArticulationAreaFciTable(); } catch {}

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

      // Inject EA classroom metrics
      try {
        applyEaMetricsToFeatures(geojsonData.features || []);
      } catch (e) {
        console.warn("⚠️ Unable to apply EA metrics to GeoJSON:", e);
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
      // Wire up "Show overlapping grade schools" checkbox (default: checked)
      const showOverlappingCb = document.getElementById('showOverlappingGradesCb');
      function applyNearbyFromCheckbox() {
        const mapSelect = document.getElementById('mapOriginSchoolSelect');
        const selectedId = mapSelect ? mapSelect.value : '';
        const overlapOnly = showOverlappingCb ? showOverlappingCb.checked : true;
        const showAllSchools = !overlapOnly;
        let selectedName = '';
        if (selectedId && window.decisionLogic && Array.isArray(window.decisionLogic.schoolData)) {
          const row = window.decisionLogic.schoolData.find(r => {
            const uid = (r.UniqueID || r["UniqueID"] || r["Unique Id"] || '').toString().trim();
            return uid === selectedId;
          });
          selectedName = row ? row["Building Name"] : '';
        }
        applyNearbyFilter(selectedId, selectedName, overlapOnly, showAllSchools);
        updateNearbySchoolsPanel(selectedId, selectedName, { overlapOnly, showAllSchools });
      }
      if (showOverlappingCb) {
        showOverlappingCb.addEventListener('change', applyNearbyFromCheckbox);
      }

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
            opt.textContent = name;   // show human‑readable name
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
              updateLayer();
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

            // Update School Matches panel using checkbox state (default: overlapping only)
            const showOverlappingCb = document.getElementById('showOverlappingGradesCb');
            const overlapOnly = showOverlappingCb ? showOverlappingCb.checked : true;
            const showAllSchools = !overlapOnly;
            applyNearbyFilter(selectedId, selectedName, overlapOnly, showAllSchools);

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
        map.addLayer({
          id: 'articulation-areas-fill',
          type: 'fill',
          source: 'articulation-areas',
          layout: { visibility: aaVis },
          paint: {
            'fill-color': getArticulationFillColorExpression(),
            'fill-opacity': getArticulationFillOpacity()
          }
        });
        map.addLayer({
          id: 'articulation-areas-outline',
          type: 'line',
          source: 'articulation-areas',
          layout: { visibility: aaVis },
          paint: {
            'line-color': getArticulationFillColorExpression(),
            'line-opacity': 0.45,
            'line-width': 1.5
          }
        });

        const labelsVisInit = (aaCb && aaCb.checked) ? 'visible' : 'none';
        map.addLayer({
          id: 'articulation-areas-labels',
          type: 'symbol',
          source: 'articulation-areas',
          filter: ['!=', ['coalesce', ['get', '__aaName'], ''], ''],
          layout: {
            'text-field': ['get', '__aaName'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10, 10, 12, 12, 14, 14, 16, 16, 18, 18, 20],
            'text-anchor': 'center',
            'text-allow-overlap': false,
            'text-ignore-placement': false,
            visibility: labelsVisInit
          },
          paint: {
            'text-color': '#1f2937',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5
          }
        });

        // Load + reproject on demand
        loadArticulationAreas4326()
          .then((gj) => {
            const src = map.getSource('articulation-areas');
            if (src) src.setData(ensureBondDataInArticulationGeoJSON(gj || { type: 'FeatureCollection', features: [] }));
            try { if (typeof window.__updateBondMapLegend === 'function') window.__updateBondMapLegend(); } catch {}
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

            // Ensure close button doesn't overlap the header content.
            const header = content.querySelector('.aa-popup-header');
            if (header) {
              header.style.paddingRight = '28px';
            }

            const body = content.querySelector('.aa-popup-body');
            if (body) {
              body.style.flex = '1 1 auto';
              body.style.minHeight = '0';
              body.style.overflow = 'auto';
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
          const data = articulationSchoolsByArea && articulationSchoolsByArea.get(areaKey) ? articulationSchoolsByArea.get(areaKey) : null;
          const groups = data && data.groups ? data.groups : {};
          const allGroupKeys = data && Array.isArray(data.groupKeys) ? data.groupKeys : Object.keys(groups || {});
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
          const total = data && Number.isFinite(data.total)
            ? groupKeys.reduce((sum, k) => sum + ((groups[k] || []).length), 0)
            : groupKeys.reduce((sum, k) => sum + ((groups[k] || []).length), 0);
          const pct = (n) => (Number.isFinite(n) ? `${n.toFixed(1)}%` : '—');
          const areaColor = ARTICULATION_AREA_COLORS[areaName] || ARTICULATION_AREA_COLORS[(areaName || '').toString().trim()] || '#94a3b8';

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
          const selectedCompareSystems = getSelectedCompareSystemsFromDom();
          const selectedCategoryLine = selectedCategories.length
            ? `Selected categories: ${selectedCategories.map(k => escapeHtml(COMPARE_CATEGORY_DEFS[k]?.label || k)).join(', ')}`
            : 'Selected categories: None';
          const selectedSystemsLine = selectedCompareSystems.length
            ? `FCI systems: ${selectedCompareSystems.map(s => escapeHtml(s)).join(', ')}`
            : '';
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
          const AVG_SWATCH_SIZE = 12;
          const avgSwatchStyle = `width:${AVG_SWATCH_SIZE}px; height:${AVG_SWATCH_SIZE}px; border-radius:2px; border:1px solid #9ca3af; display:inline-block;`;

          const getNumericValue = (catKey, schoolId, feature, fciEntry, fciSystemName) => {
            if (catKey === 'utilization') {
              const util = normalizeUtilizationValue(feature?.properties?.['Utilization'] ?? 0);
              return Number.isFinite(util) ? util * 100 : null;
            }
            if (catKey === 'classroom') {
              const nameKeyRaw = feature?.properties?.["Building Name"] || feature?.properties?.["School Name"] || '';
              const { score: scoreByName, count: countByName } = getEaByName(nameKeyRaw);
              const count = eaClassroomCountsById.get(schoolId) ?? countByName ?? feature?.properties?.__eaClassroomCount;
              const score = eaScoresById.get(schoolId) ?? scoreByName ?? feature?.properties?.__eaScore;
              if (!Number.isFinite(count) || !Number.isFinite(score)) return null;
              const cond = getEaConditionFromValue(score, eaQuintiles);
              const cost =
                cond === 'Poor' ? count * 500000 :
                cond === 'Fair' ? count * 250000 :
                0;
              return Number.isFinite(cost) ? cost : null;
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
            if (catKey === 'classroom') {
              const v = feature?.properties?.__eaScore;
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
            const baseOrder = ['utilization', 'classroom', 'building'];
            baseOrder.forEach((catKey) => {
              if (!selectedCategories.includes(catKey)) return;
              avgKeys.push({
                key: catKey,
                label: COMPARE_CATEGORY_DEFS[catKey]?.label || catKey,
                catKey,
                system: null,
                isPercent: catKey === 'utilization',
                isSum: catKey === 'classroom'
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
            const schoolNames = getArticulationAreaSchoolNames(areaKey);
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
            if (catKey === 'classroom') return getEaConditionFromValue(avg, eaQuintiles);
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
            if (catKey === 'classroom') return getEaConditionColorHex(bucket);
            if (catKey === 'building') return getBuildingConditionColorHex(bucket);
            return '#cbd5e1';
          };

          const buildAveragesHtml = () => {
            if (!avgKeys.length) return '';
            const lines = avgKeys.map(({ key, label, isPercent, catKey, system, isSum }) => {
              const totals = areaTotals[key];
              const displayVal = totals && totals.countDisplay ? (isSum ? totals.sumDisplay : (totals.sumDisplay / totals.countDisplay)) : (isSum ? 0 : null);
              const colorVal = totals && totals.countColor ? (totals.sumColor / totals.countColor) : null;
              const areaLabel = isSum ? fmtCurrencyK(displayVal) : `${fmtNum2(displayVal)}${isPercent ? '%' : ''}`;
              const areaBucket = getBucketForAvg(catKey, system, colorVal);
              const areaColor = getColorForBucket(catKey, areaBucket);
              return `
                <div style="font-size:11px; color:#111827; display:inline-flex; align-items:center; gap:6px;">
                  <strong>${escapeHtml(label)}</strong>
                  <span title="${escapeHtml(label)}: ${areaLabel}" style="${avgSwatchStyle} background:${areaColor};"></span>
                  <span style="color:#6b7280;">${areaLabel}</span>
                </div>
              `;
            }).join('');
            return `<div style="margin:6px 0 10px 0; display:flex; flex-wrap:wrap; gap:12px; align-items:center;">${lines}</div>`;
          };

          const buildLevelAverageSwatches = (level) => {
            if (!avgKeys.length) return '';
            const row = avgKeys.map(({ key, label, isPercent, catKey, system, isSum }) => {
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
              return `<span title="${escapeHtml(label)}: ${valText}" style="${avgSwatchStyle} background:${color};"></span>`;
            }).join('');
            return `<span style="display:inline-flex; gap:6px; align-items:center;">${row}</span>`;
          };

          const maxPerGroup = 25;
          const groupHtml = groupKeys.map((k) => {
            const list = Array.isArray(groups[k]) ? groups[k] : [];
            const shown = list.slice(0, maxPerGroup);
            const more = list.length > maxPerGroup ? (list.length - maxPerGroup) : 0;
            const getFciSystemStatusForSchool = (schoolId, systemName) => {
              const entry = schoolId ? fciBySchoolId.get(schoolId) : null;
              const p1Value = entry?.bySystem?.get(systemName)?.priorityAvgCostPerSf?.[1];
              const quartiles = computeFciQuartilesForSystem(systemName);
              return getFciStatusFromValue(p1Value, quartiles, false);
            };
            const items = shown.map((s) => {
              const id = resolveSchoolIdFromName(s);
              const feature = id ? getFeatureById(id) : null;
              const baseSwatches = [];
              const fciSwatches = [];
              const SWATCH_SIZE = 10;
              const swatchStyle = `width:${SWATCH_SIZE}px; height:${SWATCH_SIZE}px; border-radius:2px; border:1px solid #9ca3af; display:inline-block;`;
              const fmtNum2 = (n) => (Number.isFinite(n) ? n.toFixed(2) : null);
              const getCategoryValueForSchool = (catKey) => {
                if (catKey === 'utilization') {
                  const raw = feature?.properties?.['Utilization'];
                  const util = normalizeUtilizationValue(raw ?? 0);
                  return Number.isFinite(util) ? util * 100 : null;
                }
                if (catKey === 'classroom') {
                  const nameKeyRaw = feature?.properties?.["Building Name"] || feature?.properties?.["School Name"] || s || '';
                  const eaByName = getEaByName(nameKeyRaw || s || '');
                  const count = eaClassroomCountsById.get(id) ?? eaByName.count ?? feature?.properties?.__eaClassroomCount;
                  const score = eaScoresById.get(id) ?? eaByName.score ?? feature?.properties?.__eaScore;
                  if (!Number.isFinite(count) || !Number.isFinite(score)) return null;
                  const cond = getEaConditionFromValue(score, eaQuintiles);
                  const cost =
                    cond === 'Poor' ? count * 500000 :
                    cond === 'Fair' ? count * 250000 :
                    0;
                  return Number.isFinite(cost) ? cost : null;
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
              const includeFciOverall = selectedCategories.includes('fci');
              const includeFciSystems = selectedCompareSystems.length > 0;
              const baseOrder = ['utilization', 'classroom', 'building'];
              baseOrder.forEach((catKey) => {
                if (!selectedCategories.includes(catKey)) return;
                const bucket = getCompareBucketForSchool(catKey, id, feature);
                const color = getBucketColor(catKey, bucket);
                const value = getCategoryValueForSchool(catKey);
                const valueText = (value == null)
                  ? ''
                  : (catKey === 'utilization'
                    ? ` (value ${fmtNum2(value)}%)`
                    : (catKey === 'classroom'
                      ? ` (value ${fmtCurrencyK(value)})`
                      : ` (value ${fmtNum2(value)})`));
                baseSwatches.push(`<span title="${escapeHtml(COMPARE_CATEGORY_DEFS[catKey]?.label || catKey)}: ${escapeHtml(bucket)}${valueText}" style="${swatchStyle} background:${color};"></span>`);
              });
              if (includeFciOverall) {
                const entry = id ? fciBySchoolId.get(id) : null;
                const overallStatus = entry ? getFciStatusFromValue(entry.overallFci, fciOverallQuartiles, true) : 'No Data';
                const overallColor = getFciStatusColorHex(overallStatus);
                const overallVal = fmtNum2(entry?.overallFci);
                  fciSwatches.push(`<span title="FCI: ${escapeHtml(overallStatus)}${overallVal != null ? ` (value ${overallVal})` : ''}" style="${swatchStyle} background:${overallColor};"></span>`);
              }
              if (includeFciSystems) {
                const entry = id ? fciBySchoolId.get(id) : null;
                selectedCompareSystems.forEach((sys) => {
                  const status = getFciSystemStatusForSchool(id, sys);
                  const color = getFciStatusColorHex(status);
                  const sysEntry = entry?.bySystem?.get(sys);
                  const pc = sysEntry?.priorityCosts || {};
                  const p1 = Number.isFinite(pc[1]) ? pc[1] : null;
                  const costText = fmtCurrencyK(p1);
                  fciSwatches.push(`<span title="${escapeHtml(sys)}: ${escapeHtml(status)} (Priority 1 ${costText})" style="${swatchStyle} background:${color};"></span>`);
                });
              }
              const swatches = [
                baseSwatches.join(''),
                fciSwatches.length ? `<span style="display:inline-flex; gap:6px; align-items:center; margin-left:6px;">${fciSwatches.join('')}</span>` : ''
              ].join('');
            const swatchWrap = swatches ? `<div style="display:inline-flex; gap:6px; align-items:center; margin-left:auto; padding-left:8px; flex-wrap:wrap; flex:0 0 auto; align-self:center;">${swatches}</div>` : '';
              return `<li style="margin:0 0 6px 0; display:flex; align-items:flex-start; gap:8px;">
                <span style="flex:1 1 auto; min-width:0; line-height:1.2;">${escapeHtml(s)}</span>
                ${swatchWrap}
              </li>`;
            }).join('');
            const moreLine = more ? `<div style="margin:4px 0 0 0; color:#6b7280; font-size:12px;">+${more} more…</div>` : '';
            const levelColor = getSchoolLevelColorHex(k);
            const levelAvgSwatches = buildLevelAverageSwatches(k);
            return (
              `<div style="margin-top:10px; font-weight:800; display:flex; align-items:center; gap:6px;">
                <span style="width:10px; height:10px; border-radius:2px; border:1px solid #cbd5e1; background:${levelColor}; display:inline-block;"></span>
                ${escapeHtml(k)} (${list.length})
                ${levelAvgSwatches ? `<span style="margin-left:auto; display:inline-flex; gap:6px; align-items:center;">${levelAvgSwatches}</span>` : ''}
              </div>` +
              `<ul style="padding-left:18px; margin:4px 0 0 0;">${items}</ul>` +
              `${moreLine}`
            );
          }).join('');

          const bondEntry = getBondSpendingEntryByName(areaName);
          const bondLine = bondEntry
            ? `<div style="font-size:12px; color:#0369a1; font-weight:600; margin:0 0 6px 0;">Historic bond spending: ${fmtCurrency(bondEntry.totalSpending)} (${bondEntry.pctOfTotal.toFixed(1)}% of total)</div>`
            : '';
          const growthLine =
            bondEntry && Number.isFinite(bondEntry.enrollmentGrowthPct)
              ? `<div style="font-size:12px; color:#065f46; font-weight:600; margin:0 0 6px 0;">Enrollment change (2015–2025): ${
                  bondEntry.enrollmentGrowthPct > 0 ? '+' : ''
                }${bondEntry.enrollmentGrowthPct.toFixed(0)}%</div>`
              : '';
          const emptyHtml = `<div style="color:#6b7280; font-size:12px;">No schools found for this area.</div>`;
          return (
            `<div class="aa-popup-header aa-popup-drag" style="display:flex; align-items:center; gap:10px; font-weight:900; margin-bottom:2px; cursor:move; user-select:none;">` +
              `<span style="width:12px; height:12px; border-radius:2px; border:1px solid #cbd5e1; background:${areaColor}; display:inline-block;"></span>` +
              `<div style="flex:1; min-width:0;">${escapeHtml(areaName)} Area</div>` +
            `</div>` +
            `<div class="aa-popup-meta" style="font-size:12px; color:#6b7280; font-weight:600; margin:0 0 8px 0;">${total} total schools</div>` +
            `${bondLine}` +
            `${growthLine}` +
            `<div class="aa-popup-body" style="border-top:1px solid #e5e7eb; padding-top:6px;">` +
            `<div style="font-size:11px; color:#6b7280; margin:0 0 6px 0;">${selectedCategoryLine}${selectedSystemsLine ? `<br>${selectedSystemsLine}` : ''}</div>` +
            `${buildAveragesHtml()}` +
            `${groupKeys.length ? groupHtml : emptyHtml}` +
            `</div>`
          );
        };

        // Expose for refresh when compare selections change
        try { window.__aaBuildPopupHtml = buildPopupHtml; } catch {}
        try {
          window.__aaRefreshPopup = () => {
            try {
              if (!pinned || !window.__aaPopupAreaName) return;
              popup.setHTML(buildPopupHtml(window.__aaPopupAreaName)).addTo(map);
              positionArticulationPopupTopRight();
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
                }, 0);
              } catch {}
            });
          };
        } catch {}
        try { window.__aaPositionPopupTopRight = positionArticulationPopupTopRight; } catch {}
        try { window.__aaEnhancePopupPanel = enhanceArticulationPopupPanel; } catch {}

        map.on('mouseenter', 'articulation-areas-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'articulation-areas-fill', () => { map.getCanvas().style.cursor = ''; });

        map.on('click', 'articulation-areas-fill', (e) => {
          // If the user clicked directly on a school point, let school interaction win.
          // This prevents "double popups" (area + school) on a single click.
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
          pinned = true;
          window.__aaPopupAreaName = areaName;
          try { window.__aaPopup = popup; } catch {}
          popup.setHTML(buildPopupHtml(areaName)).addTo(map);
          positionArticulationPopupTopRight();
          // Keep pinned to top-right while map moves/zooms/resizes.
          if (!popup.__aaFixedPosBound) {
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
          }
          // Wait one tick so Mapbox has inserted DOM nodes, then enhance (drag/resize).
          setTimeout(() => {
            try { enhanceArticulationPopupPanel(); } catch {}
            try { positionArticulationPopupTopRight(); } catch {}
          }, 0);
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
          if (target && (target.closest('#filter-panel') || target.closest('#compareCategoryList') || target.closest('#compareFciSystemList') || target.closest('#compareFciSystemsDropdown') || target.closest('.map-school-select-panel'))) return;
          let hits = [];
          try {
            hits = map.queryRenderedFeatures(e.point, { layers: ['articulation-areas-fill'] }) || [];
          } catch {
            hits = [];
          }
          if (!hits.length) {
            popup.remove();
            pinned = false;
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
          // Automatically fit map to show all schools in Jeffco district
          map.fitBounds(bounds, { padding: 40 });
          console.log("✅ Map automatically zoomed to Jeffco district bounds");
        }
      }

      // ✅ Function to fit map to all schools (always use originalGeojsonData for all schools)
      window.fitMapToAllSchools = function() {
        console.log("🔍 fitMapToAllSchools called");
        
        // Use window.map if available, otherwise use local map variable
        const mapToUse = window.map || map;
        
        if (!mapToUse) {
          console.error("⚠️ Map not available");
          alert("Map is not ready. Please wait a moment and try again.");
          return;
        }
        
        // Always use originalGeojsonData to show ALL schools, not filtered ones
        const dataToUse = originalGeojsonData || geojsonData;
        
        if (!dataToUse || !dataToUse.features) {
          console.warn("⚠️ No geojson data available");
          alert("Map data not loaded yet. Please wait a moment and try again.");
          return;
        }
        
        const coordinates = dataToUse.features
          .filter(f => f.geometry && f.geometry.coordinates && Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length === 2) // Only features with valid geometry
          .map(f => f.geometry.coordinates);
        
        if (coordinates.length === 0) {
          console.warn("⚠️ No valid coordinates found");
          alert("No school locations found.");
          return;
        }
        
        const lats = coordinates.map(c => c[1]);
        const lngs = coordinates.map(c => c[0]);
        const bounds = [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)]
        ];
        
        console.log("🗺️ Fitting map to bounds:", bounds, "with", coordinates.length, "schools");
        
        // Ensure map is resized first
        if (mapToUse.resize) {
          mapToUse.resize();
        }
        
        // Use fitBounds with a small delay to ensure resize has taken effect
        setTimeout(() => {
          if (mapToUse && typeof mapToUse.fitBounds === 'function') {
            mapToUse.fitBounds(bounds, { padding: 40, duration: 1000 });
            console.log("✅ fitBounds called successfully");
          } else {
            console.error("⚠️ fitBounds not found");
          }
        }, 50);
      };
      
      console.log("✅ fitMapToAllSchools function defined");

      // Automatically fit to all schools once after initial map setup so the
      // user doesn't need to click the button the first time.
      try {
        setTimeout(() => {
          if (typeof window.fitMapToAllSchools === 'function') {
            window.fitMapToAllSchools();
          }
        }, 200);
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
            "Standard Maintenance", '#E5D9C8',
            "Major Capital Investment", '#F97316',
            "Welcoming School", '#22c55e',
            "Welcoming School with Capital Investment", '#16a34a',
            "Welcoming School with Building Replacement", '#15803d',
            "Closure (Goes to Welcoming School)", '#E8A0A0',
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
            "Standard Maintenance", '#E5D9C8',
            "Major Capital Investment", '#F97316',
            "Welcoming School", '#22c55e',
            "Welcoming School with Capital Investment", '#16a34a',
            "Welcoming School with Building Replacement", '#15803d',
            "Closure (Goes to Welcoming School)", '#E8A0A0',
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
      
      // Layer to highlight nearby destination schools within the current
      // distance threshold for the selected origin school.
      map.addLayer({
        id: 'nearby-destinations-layer',
        type: 'circle',
        source: 'schools',
        layout: {
          'visibility': showNearbyHighlight ? 'visible' : 'none'
        },
        paint: {
          'circle-radius': 10,
          'circle-color': '#ffffff',
          'circle-opacity': 0,
          'circle-stroke-color': '#00bcd4',
          'circle-stroke-width': 2
        },
        // Start with no matches; will be updated dynamically
        filter: ['in', ['get', 'UniqueID'], ['literal', []]]
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

        let html = `<strong>${schoolName}</strong>`;

        const totalEnr = parseFloat(feature?.properties?.['_TotalEnrollment']);
        const pkEnr = parseFloat(feature?.properties?.['_PKEnrollment']);
        if (Number.isFinite(totalEnr) || Number.isFinite(pkEnr)) {
          const fmtN = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString() : '—');
          if (Number.isFinite(pkEnr) && pkEnr > 0 && Number.isFinite(totalEnr)) {
            const nonPK = Math.max(0, totalEnr - pkEnr);
            html += `<br><span>Enrollment (excl. PK): ${fmtN(nonPK)}</span>`;
            html += `<br><span>PK Enrollment: ${fmtN(pkEnr)}</span>`;
            html += `<br><span>Total: ${fmtN(totalEnr)}</span>`;
          } else if (Number.isFinite(totalEnr)) {
            html += `<br><span>Enrollment: ${fmtN(totalEnr)}</span>`;
          }
        }

        if (capacity !== undefined && capacity !== null && capacity !== '') {
          html += `<br><span>${capSourceLabel}: ${capacity}</span>`;
        } else if (eduCapMissing) {
          html += `<br><span>${eduCapNote || 'Educational capacity does not exist.'}</span>`;
        }
        if (utilization !== undefined && utilization !== null && utilization !== '') {
          const utilNum = parseFloat(utilization);
          if (isFinite(utilNum)) {
            const pct = utilNum <= 1.5 ? utilNum * 100 : utilNum;
            html += `<br><span>Utilization: ${pct.toFixed(0)}%</span>`;
          } else {
            html += `<br><span>Utilization: ${utilization}</span>`;
          }
        } else if (eduCapMissing) {
          html += `<br><span>Utilization: Educational capacity does not exist.</span>`;
        }

        // Show the selected "Color by" value
        try {
          const mode =
            (window.__mapColorByMode === 'classroom') ? 'classroom'
            : ((window.__mapColorByMode === 'fci') ? 'fci'
              : ((window.__mapColorByMode === 'utilization') ? 'utilization'
                : ((window.__mapColorByMode === 'level') ? 'level' : 'decision')));
          const buildingCond = feature?.properties?.__buildingCondition || 'No Data';
          const buildingScore = feature?.properties?.__buildingScore;
          const buildingScoreNum = Number.isFinite(buildingScore) ? buildingScore.toFixed(3) : '—';
          if (mode === 'decision') {
            const decision = feature?.properties?.['Decision Type'] || feature?.properties?.['decision'] || 'Unknown';
            html += `<br><span>Decision: ${decision}</span>`;
          } else if (mode === 'level') {
            const lvl = feature?.properties?.__schoolLevelNorm || normalizeSchoolLevel(feature?.properties?.['School Level']) || 'Unknown';
            html += `<br><span>School level: ${lvl}</span>`;
          } else if (mode === 'building') {
            html += `<br><span>Building score: ${buildingCond} (${buildingScoreNum})</span>`;
          } else if (mode === 'utilization') {
            const { low, high } = getUtilizationThresholds();
            const util = normalizeUtilizationValue(feature?.properties?.['Utilization'] ?? 0);
            const band = (util < low) ? 'Too low' : (util > high) ? 'Too high' : 'In range';
            html += `<br><span>Utilization band: ${band}</span>`;
          } else if (mode === 'fci') {
            const status = feature?.properties?.__fciStatus || 'No Data';
            const schoolId = normalizeId(feature?.properties?.['UniqueID']);
            const entry = schoolId ? fciBySchoolId.get(schoolId) : null;
            if (fciSelectedSystem) {
              const sysEntry = entry?.bySystem?.get(fciSelectedSystem);
              const p1Cost = sysEntry?.priorityCosts?.[1];
              html += `<br><span>${fciSelectedSystem}: ${status} (Priority 1 ${fmtCurrencyK(p1Cost)})</span>`;
            } else {
              const val = feature?.properties?.__fciOverall;
              const num = Number.isFinite(val) ? val.toFixed(3) : '—';
              html += `<br><span>FCI: ${status} (${num})</span>`;
            }
          } else if (mode === 'classroom') {
            const score = feature?.properties?.__eaScore;
            const num = Number.isFinite(score) ? score.toFixed(3) : '—';
            const schoolId = normalizeId(feature?.properties?.['UniqueID']) || resolveSchoolIdFromName(schoolName);
            const nameKeyRaw = feature?.properties?.["Building Name"] || feature?.properties?.["School Name"] || schoolName || '';
            const eaByName = getEaByName(nameKeyRaw || schoolName || '');
            const count = eaClassroomCountsById.get(schoolId) ?? eaByName.count ?? feature?.properties?.__eaClassroomCount;
            const scoreVal = eaScoresById.get(schoolId) ?? eaByName.score ?? score;
            let cost = null;
            let condLocal = 'No Data';
            if (Number.isFinite(count) && Number.isFinite(scoreVal)) {
              condLocal = getEaConditionFromValue(scoreVal, eaQuintiles);
              cost =
                condLocal === 'Poor' ? count * 500000 :
                condLocal === 'Fair' ? count * 250000 :
                0;
            }
            const costText = fmtCurrencyK(cost);
            html += `<br><span>Classroom condition: ${condLocal} (${num})</span>`;
            html += `<br><span>Classroom $: ${costText}</span>`;
          }

          // Always include building score (even when not the active color mode).
          if (mode !== 'building') {
            html += `<br><span>Building score: ${buildingCond} (${buildingScoreNum})</span>`;
          }
        } catch {}

        // If an origin is selected, include distance in the hover popup.
        const originId = (window.currentOriginId || '').toString().trim() || getOriginIdForName(window.currentOriginName);
        const originName = window.currentOriginName || 'selected school';
        if (originId && originUniqueId) {
          const miles = lookupDistanceMiles(originId, originUniqueId, schoolName);
          if (miles !== null) {
            html += `<br><span>Distance to ${originName}: ${miles.toFixed(1)} mi</span>`;
          }
        }

        if (showingAssignments) {
          const assignedSource = map.getSource('assigned-schools');
          if (assignedSource && assignedSource._data?.features) {
            const assignedFeature = assignedSource._data.features.find(f => f.properties.name === schoolName);
            if (assignedFeature) {
              html += `<br><span style="color: #FF530D; font-weight: bold;">📚 Received ${assignedFeature.properties.assigned} students</span>`;
            }
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
          updateNearbySchoolsPanel(originUniqueId || getOriginIdForName(schoolName), schoolName);
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

        // Only update the panel after user explicitly clicks the nearby toggle
        const showOverlappingCb = document.getElementById('showOverlappingGradesCb');
        const overlapOnly = showOverlappingCb ? showOverlappingCb.checked : true;
        const showAllSchools = !overlapOnly;
        applyNearbyFilter(originUniqueId || getOriginIdForName(schoolName), schoolName, overlapOnly, showAllSchools);

        // Update nearby-destination highlight rings based on the newly selected
        // origin school.
        if (
          originUniqueId &&
          typeof window.updateNearbyDestinationsHighlight === 'function'
        ) {
          window.updateNearbyDestinationsHighlight(originUniqueId.toString().trim());
        }

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

      map.addSource('assigned-schools', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      
      map.addLayer({
        id: 'assigned-schools-layer',
        type: 'circle',
        source: 'assigned-schools',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'assigned'], 0, 4, 10, 8, 50, 16, 100, 24],
          'circle-color': '#FF530D',
          'circle-opacity': 0.8,
          'circle-stroke-color': '#333',
          'circle-stroke-width': 1
        }
      });
      
      setupAssignmentPopup();

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
        
        // Also update nearby destination highlight circles if enabled
        if (originId && typeof window.updateNearbyDestinationsHighlight === 'function' && showNearbyHighlight) {
          window.updateNearbyDestinationsHighlight(originId);
        }
      };

      // Helper to compute and highlight nearby destinations on the map
      window.updateNearbyDestinationsHighlight = function(originUniqueId) {
        if (!showNearbyHighlight) {
          if (window.map && window.map.getLayer('nearby-destinations-layer')) {
            window.map.setLayoutProperty('nearby-destinations-layer', 'visibility', 'none');
            window.map.setFilter('nearby-destinations-layer', ['in', ['get', 'UniqueID'], ['literal', []]]);
          }
          return;
        }
        if (!originUniqueId || !window.map || !window.geojsonData || !window.distanceToWelcomingRowsByOrigin || !window.decisionLogic) {
          return;
        }
        
        const originKey = (originUniqueId.toString().trim() || "").toLowerCase();
        const rowsByOrigin = window.distanceToWelcomingRowsByOrigin || {};
        const candidatesRaw = rowsByOrigin[originKey];
        if (!Array.isArray(candidatesRaw)) {
          if (window.map.getLayer('nearby-destinations-layer')) {
            window.map.setFilter('nearby-destinations-layer', ['in', ['get', 'UniqueID'], ['literal', []]]);
          }
          return;
        }
        
        const decisionRows = window.decisionLogic.schoolData || [];
        const thresholds = window.thresholds || window.decisionLogic.thresholds || {};
        const originRow = decisionRows.find(r => ((r.UniqueID || r["UniqueID"] || r["Unique Id"]) || "").toString().trim().toLowerCase() === originKey);
        const levelStr = (originRow && (originRow["School Level"] || "") || "").toLowerCase();
        let distanceThreshold;
        if (levelStr.includes("elementary")) {
          distanceThreshold = thresholds.elementaryDistance;
        } else if (levelStr.includes("k-8")) {
          distanceThreshold = thresholds.k8Distance;
        } else if (levelStr.includes("middle")) {
          distanceThreshold = thresholds.middleDistance;
        } else if (levelStr.includes("high")) {
          distanceThreshold = thresholds.highDistance;
        } else if (levelStr.includes("6-12")) {
          distanceThreshold = thresholds.k12Distance;
        } else {
          distanceThreshold = thresholds.middleDistance || 5.0;
        }
        
        const destIds = new Set();
        candidatesRaw.forEach(r => {
          const distRaw =
            r["Network Distance (Miles)"] ||
            r["Network Distance"] ||
            r["NetworkDistanceMiles"];
          const dist = parseFloat((distRaw || "").toString().trim());
          if (!isFinite(dist) || (distanceThreshold && dist > distanceThreshold)) return;
          
          const destPrefix =
            r["Destination CDE Prefix"] ||
            r["Destination CDE Prefix "] ||
            r["DestinationCDEPrefix"];
          if (!destPrefix) return;
          destIds.add(destPrefix.toString().trim());
        });
        
        const idsArray = Array.from(destIds);
        if (window.map.getLayer('nearby-destinations-layer')) {
          window.map.setFilter('nearby-destinations-layer', [
            'in',
            ['get', 'UniqueID'],
            ['literal', idsArray]
          ]);
        }
      };

      // Populate excludedSchools select with all school names
      const excludedSchoolsSelect = document.getElementById('excludedSchools');
      if (excludedSchoolsSelect) {
        excludedSchoolsSelect.innerHTML = '';
        // Group schools by type
        const groups = {
          'Elementary and K-8 Schools': [],
          'High Schools': [],
          'Other Schools': []
        };
        geojsonData.features.forEach(f => {
          const name = f.properties['Building Name'];
          const type = f.properties['School Level'];
          if (type === 'High School') {
            groups['High Schools'].push(name);
          } else if (groups[type]) {
            groups[type].push(name);
          } else {
            groups['Other Schools'].push(name);
          }
        });
        // Helper to create optgroup with select-all
        function addGroup(label, schools) {
          if (!schools.length) return;
          const group = document.createElement('optgroup');
          group.label = label;
          // Add select-all option
          const selectAllOption = document.createElement('option');
          selectAllOption.value = '__select_all_' + label.replace(/\s/g, '_');
          selectAllOption.textContent = 'Select All ' + label;
          group.appendChild(selectAllOption);
          schools.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            if (label === 'Other Schools') {
              // Find the type for this school
              const feature = geojsonData.features.find(f => f.properties['Building Name'] === name);
              const type = feature && feature.properties['School Level'] ? feature.properties['School Level'] : 'Unknown';
              option.textContent = `${name} (${type})`;
            } else {
              option.textContent = name;
            }
            group.appendChild(option);
          });
          excludedSchoolsSelect.appendChild(group);
        }
        addGroup('Elementary and K-8 Schools', groups['Elementary and K-8 Schools']);
        addGroup('High Schools', groups['High Schools']);
        addGroup('Other Schools', groups['Other Schools']);
        // Choices.js setup
        if (window.Choices) {
          if (excludedSchoolsSelect.choicesInstance) {
            excludedSchoolsSelect.choicesInstance.destroy();
          }
          excludedSchoolsSelect.choicesInstance = new Choices(excludedSchoolsSelect, {
            removeItemButton: true,
            searchResultLimit: 20,
            placeholder: true,
            placeholderValue: 'Select schools to exclude',
            shouldSort: false
          });
          // Add event listener for select-all
          excludedSchoolsSelect.addEventListener('change', function() {
            const selected = Array.from(excludedSchoolsSelect.selectedOptions).map(opt => opt.value);
            // Handle select-all for each group
            ['Elementary and K-8 Schools', 'High Schools', 'Other Schools'].forEach(label => {
              const selectAllValue = '__select_all_' + label.replace(/\s/g, '_');
              if (selected.includes(selectAllValue)) {
                // Select all schools in this group
                const group = Array.from(excludedSchoolsSelect.querySelectorAll('optgroup[label="' + label + '"] option'))
                  .filter(opt => !opt.value.startsWith('__select_all_'));
                group.forEach(opt => opt.selected = true);
                // Deselect the select-all option
                excludedSchoolsSelect.querySelector('option[value="' + selectAllValue + '"]').selected = false;
                // Update Choices.js UI
                excludedSchoolsSelect.choicesInstance.setChoiceByValue(group.map(opt => opt.value));
              }
            });
          });
        }
      }

      // --- Blinking Halo for Sending School ---
      // Add the sending-school-halo layer on map load
      map.addSource('sending-school', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      map.addLayer({
        id: 'sending-school-halo',
        type: 'circle',
        source: 'sending-school',
        paint: {
          'circle-radius': 15,
          'circle-color': '#FFD700',
          'circle-opacity': 0.8,
          'circle-blur': 0.6
        }
      });
    })
    .catch(error => {
      console.error("❌ Failed to load initial map data:", error);
    });

  // --- MAP FILTERS INITIALIZATION ---
  const enrollmentSlider = document.getElementById('enrollmentRangeSlider');
  const seatsSlider = document.getElementById('seatsRangeSlider');
  const minEnrollDisplay = document.getElementById('minEnrollDisplay');
  const maxEnrollDisplay = document.getElementById('maxEnrollDisplay');
  const minSeatsDisplay = document.getElementById('minSeatsDisplay');
  const maxSeatsDisplay = document.getElementById('maxSeatsDisplay');
  const toggleYes = document.getElementById('toggleYes');
  const toggleNo = document.getElementById('toggleNo');
  const toggleNearbyHighlight = document.getElementById('toggleNearbyHighlight');
  const toggleUtilizationPie = document.getElementById('toggleUtilizationPie');
  const schoolTypeFilter = document.getElementById('schoolTypeFilter');
  const schoolTypeDropdownToggle = document.getElementById('schoolTypeDropdownToggle');
  const schoolTypeDropdownMenu = document.getElementById('schoolTypeDropdownMenu');
  const schoolTypeDropdownLabel = document.getElementById('schoolTypeDropdownLabel');
  const unselectAllSchoolsBtn = document.getElementById('unselectAllSchoolsBtn');
  const colorByDecisionBtn = document.getElementById('colorByDecisionBtn');
  const colorByLevelBtn = document.getElementById('colorByLevelBtn');
  const colorByUtilBtn = document.getElementById('colorByUtilBtn');
  const colorByFciBtn = document.getElementById('colorByFciBtn');
  const colorByClassroomBtn = document.getElementById('colorByClassroomBtn');
  const colorByBuildingBtn = document.getElementById('colorByBuildingBtn');
  const fciSystemSelect = document.getElementById('fciSystemSelect');
  const compareFciSystemSelect = document.getElementById('compareFciSystemSelect');
  const compareCategoryList = document.getElementById('compareCategoryList');
  const compareFciSystemList = document.getElementById('compareFciSystemList');
  let enrollmentRangeSynced = false;
  let seatsRangeSynced = false;
  let utilSpritesAdded = false;
  // Disable restoring prior selections to avoid auto-selecting a school on load
  const savedOriginId = '';
  const savedOriginName = '';
  const defaultFilterPosition = { top: '20px', right: '20px' };
  let mapSelectSyncing = false;
  let showNearbyHighlight = false; // default off; enable via checkbox
  // Landing page default: color by school level
  let mapColorByMode = 'level'; // 'decision' | 'level' | 'utilization' | 'fci' | 'classroom' | 'building'
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

  function getEaConditionColorExpression() {
    return [
      'match',
      ['get', '__eaCondition'],
      'Poor', EA_CONDITION_COLORS.poor,
      'Fair', EA_CONDITION_COLORS.fair,
      'Good', EA_CONDITION_COLORS.good,
      'Excellent', EA_CONDITION_COLORS.excellent,
      'No Data', EA_CONDITION_COLORS.nodata,
      EA_CONDITION_COLORS.nodata
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
        : ((window.__mapColorByMode === 'classroom')
          ? 'classroom'
          : ((window.__mapColorByMode === 'fci')
            ? 'fci'
            : ((window.__mapColorByMode === 'utilization')
              ? 'utilization'
              : ((window.__mapColorByMode === 'level') ? 'level' : 'decision'))));
      const expr =
        (mode === 'building') ? getBuildingConditionColorExpression()
        : (mode === 'classroom') ? getEaConditionColorExpression()
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
          .concat(Object.values(EA_CONDITION_COLORS))
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

  // Ensure the "Show Size by Capacity" UI state is applied on load (so the map
  // matches the selected button even before the user clicks).
  try {
    if (toggleYes && toggleNo) {
      const yesActive = toggleYes.classList.contains('active');
      showVariableRadius = !!yesActive;
      toggleYes.classList.toggle('active', !!yesActive);
      toggleNo.classList.toggle('active', !yesActive);
    }
  } catch {}

  noUiSlider.create(enrollmentSlider, {
    start: [0, 2500], connect: true, step: 10, range: { min: 0, max: 2500 }
  });
  noUiSlider.create(seatsSlider, {
    // Start wide so no schools are hidden before we sync to actual data range.
    start: [-2000, 5000], connect: true, step: 1, range: { min: -2000, max: 5000 }
  });

  // Enforce compact slider styling via inline styles (prevents later overrides)
  function styleCompactSlider(el) {
    if (!el) return;
    const target = el.querySelector('.noUi-target');
    const connect = el.querySelector('.noUi-connect');
    const handles = el.querySelectorAll('.noUi-handle');
    const origins = el.querySelectorAll('.noUi-origin');
    if (target) {
      target.style.height = '2px';
      target.style.border = 'none';
      target.style.boxShadow = 'none';
      target.style.background = 'transparent';
      target.style.margin = '4px 8px 6px 0';
      target.style.width = 'calc(100% - 16px)';
    }
    if (connect) {
      connect.style.background = '#007cbf';
      connect.style.height = '2px';
    }
    origins.forEach(o => {
      o.style.height = '2px';
      o.style.background = 'transparent';
      o.style.border = 'none';
      o.style.boxShadow = 'none';
    });
    handles.forEach(h => {
      h.style.width = '12px';
      h.style.height = '12px';
      h.style.top = '-5px';
      h.style.borderRadius = '50%';
      h.style.border = '1px solid #0f172a';
      h.style.boxShadow = 'none';
      h.style.background = '#fff';
    });
  }

  styleCompactSlider(document.getElementById('enrollmentRangeSlider'));
  styleCompactSlider(document.getElementById('seatsRangeSlider'));

  // Skip auto-inject of utilization toggle; checkbox is placed in HTML near nearby highlight

  enrollmentSlider.noUiSlider.on('update', values => {
    minEnrollment = parseInt(values[0]);
    maxEnrollment = parseInt(values[1]);
    minEnrollDisplay.textContent = minEnrollment;
    maxEnrollDisplay.textContent = maxEnrollment;
    updateLayer();
  });

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
      .map(r => parseFloat(r.Enrollment || r["Enrollment"] || r[" Total Enrollment"] || r["Total Enrollment"] || 0))
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

    if (enrollmentSlider && enrollmentSlider.noUiSlider) {
      enrollmentSlider.noUiSlider.updateOptions({
        range: { min: paddedMin, max: effectiveMax },
        start: [paddedMin, effectiveMax]
      }, false);
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

  seatsSlider.noUiSlider.on('update', values => {
    minSeats = parseInt(values[0]);
    maxSeats = parseInt(values[1]);
    minSeatsDisplay.textContent = minSeats;
    maxSeatsDisplay.textContent = maxSeats;
    updateLayer();
  });

  // Sync seats slider range to Decision Data Export (decisionLogic.schoolData)
  const syncSeatsRangeFromDecisionData = (retry = 0) => {
    if (seatsRangeSynced) return;
    const data = window.decisionLogic && Array.isArray(window.decisionLogic.schoolData)
      ? window.decisionLogic.schoolData
      : null;
    if (!data || !data.length) {
      if (retry < 50) {
        setTimeout(() => syncSeatsRangeFromDecisionData(retry + 1), 200);
      }
      return;
    }

    const getSeats = (r) => (window.getEffectiveAvailableSeats && window.getEffectiveAvailableSeats(r)) ?? NaN;
    const seatValues = data
      .map(r => getSeats(r))
      .filter(v => Number.isFinite(v));
    if (!seatValues.length) {
      return;
    }

    let minVal = Math.min(...seatValues);
    let maxVal = Math.max(...seatValues);

    // If min/max collapse or are invalid, keep defaults.
    if (!Number.isFinite(minVal) || !Number.isFinite(maxVal)) {
      console.warn("⚠️ Seats sync skipped due to invalid range", { minVal, maxVal });
      return;
    }

    // Pad to nice bounds; keep the slider usable while still inclusive.
    const paddedMin = Math.floor(minVal / 10) * 10;
    const paddedMax = Math.ceil(maxVal / 10) * 10;
    const safeMax = paddedMax > paddedMin ? paddedMax : (paddedMin + 10);

    if (seatsSlider && seatsSlider.noUiSlider) {
      seatsSlider.noUiSlider.updateOptions({
        range: { min: paddedMin, max: safeMax },
        start: [paddedMin, safeMax]
      }, false);
      minSeats = paddedMin;
      maxSeats = safeMax;
      if (minSeatsDisplay) minSeatsDisplay.textContent = paddedMin;
      if (maxSeatsDisplay) maxSeatsDisplay.textContent = safeMax;
      seatsRangeSynced = true;
      updateLayer();
      console.log("📊 Seats slider synced to Decision Data Export range:", { minVal, maxVal, paddedMin, paddedMax: safeMax });
    }
  };
  syncSeatsRangeFromDecisionData();

  toggleYes.addEventListener('click', () => {
    showVariableRadius = true;
    toggleYes.classList.add('active');
    toggleNo.classList.remove('active');
    updateLayer();
  });

  toggleNo.addEventListener('click', () => {
    showVariableRadius = false;
    toggleNo.classList.add('active');
    toggleYes.classList.remove('active');
    updateLayer();
  });

  if (toggleNearbyHighlight) {
    // Default to unchecked/off
    toggleNearbyHighlight.checked = false;
    showNearbyHighlight = false;
    if (window.map && window.map.getLayer && window.map.getLayer('nearby-destinations-layer')) {
      window.map.setLayoutProperty('nearby-destinations-layer', 'visibility', 'none');
      window.map.setFilter('nearby-destinations-layer', ['in', ['get', 'UniqueID'], ['literal', []]]);
    }

    toggleNearbyHighlight.addEventListener('change', () => {
      showNearbyHighlight = toggleNearbyHighlight.checked;
      if (!window.map) return;
      const layerId = 'nearby-destinations-layer';
      if (window.map.getLayer(layerId)) {
        window.map.setLayoutProperty(layerId, 'visibility', showNearbyHighlight ? 'visible' : 'none');
        if (!showNearbyHighlight) {
          window.map.setFilter(layerId, ['in', ['get', 'UniqueID'], ['literal', []]]);
        } else if (window.currentOriginId) {
          window.updateNearbyDestinationsHighlight(window.currentOriginId);
        }
      }
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
    const syncToggle = () => {
      try { mapFiltersToggleBtn.setAttribute('aria-expanded', filterPanel.open ? 'true' : 'false'); } catch (e) {}
    };
    mapFiltersToggleBtn.addEventListener('click', () => {
      filterPanel.open = !filterPanel.open;
      syncToggle();
    });
    filterPanel.addEventListener('toggle', syncToggle);
    syncToggle();
  }

  // --- School type dropdown logic ---
  function syncSchoolTypeFromDropdown() {
    if (!schoolTypeDropdownMenu) return;
    const checked = Array.from(schoolTypeDropdownMenu.querySelectorAll('input[type="checkbox"]:checked'))
      .map(cb => cb.value);
    selectedTypes = checked;
    // Sync hidden select for any legacy uses
    if (schoolTypeFilter) {
      Array.from(schoolTypeFilter.options).forEach(opt => {
        opt.selected = checked.includes(opt.value);
      });
    }
    // Update label
    if (schoolTypeDropdownLabel) {
      schoolTypeDropdownLabel.textContent =
        checked.length === 0 ? 'None selected' :
        checked.length === 5 ? 'All types' :
        `${checked.length} selected`;
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

  if (unselectAllSchoolsBtn) {
    unselectAllSchoolsBtn.addEventListener('click', () => {
      if (schoolTypeDropdownMenu) {
        schoolTypeDropdownMenu.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
      }
      syncSchoolTypeFromDropdown();
    });
  }

  // Initialize selection label
  syncSchoolTypeFromDropdown();

  // --- Color-by toggle (Decision vs School level) ---
  function setMapColorMode(mode) {
    mapColorByMode =
      (mode === 'building') ? 'building'
      : ((mode === 'classroom') ? 'classroom'
        : ((mode === 'fci') ? 'fci'
          : ((mode === 'utilization') ? 'utilization'
            : ((mode === 'level') ? 'level' : 'decision'))));
    window.__mapColorByMode = mapColorByMode;
    if (colorByDecisionBtn) colorByDecisionBtn.classList.toggle('active', mapColorByMode === 'decision');
    if (colorByLevelBtn) colorByLevelBtn.classList.toggle('active', mapColorByMode === 'level');
    if (colorByUtilBtn) colorByUtilBtn.classList.toggle('active', mapColorByMode === 'utilization');
    if (colorByFciBtn) colorByFciBtn.classList.toggle('active', mapColorByMode === 'fci');
    if (colorByClassroomBtn) colorByClassroomBtn.classList.toggle('active', mapColorByMode === 'classroom');
    if (colorByBuildingBtn) colorByBuildingBtn.classList.toggle('active', mapColorByMode === 'building');
    try {
      if (typeof window.applyMapColorByMode === 'function') window.applyMapColorByMode();
    } catch (e) {}
    // Ensure classroom/building metrics are present before refresh
    if (mapColorByMode === 'classroom') {
      try {
        if (originalGeojsonData && Array.isArray(originalGeojsonData.features)) {
          applyEaMetricsToFeatures(originalGeojsonData.features);
        }
      } catch {}
    }
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
  if (colorByClassroomBtn) colorByClassroomBtn.addEventListener('click', () => setMapColorMode('classroom'));
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
    const selected = getSelectedCompareSystemsFromDom();
    compareFciSystem = selected;
    try { updateArticulationAreaFciTable(); } catch {}
    try {
      const compareSummary = document.getElementById('compareFciSystemsSummary');
      if (compareSummary) {
        compareSummary.textContent = selected.length ? `${selected.length} selected` : 'Select systems';
      }
    } catch {}
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

  if (map.getLayer('assigned-schools-layer')) {
    map.setLayoutProperty(
      'assigned-schools-layer',
      'visibility',
      'none'
    );
  }

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

  // Removed hardcoded New Haven center - map will be set by fitBounds

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
          option.textContent = schoolName;
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
          option.textContent = schoolName;
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
          opt.textContent = pendingName;
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

function getEaByName(nameRaw) {
  const variants = buildNameVariants(nameRaw);
  const score = variants.map(n => eaScoresByName.get(n)).find(v => Number.isFinite(v));
  const count = variants.map(n => eaClassroomCountsByName.get(n)).find(v => Number.isFinite(v));
  return { score, count };
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
  const getEff = window.getEffectiveEnrollment || (r => num(r["Enrollment"] ?? r[" Total Enrollment"] ?? r["Total Enrollment"]));
  const getEffUtil = window.getEffectiveUtilization || ((r) => {
    const c = (window.getEffectiveCapacity && window.getEffectiveCapacity(r)) ?? num(r.Capacity);
    const e = (window.getEffectiveEnrollment && window.getEffectiveEnrollment(r)) ?? num(r.Enrollment);
    return (c > 0 && Number.isFinite(e)) ? e / c : null;
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
    num(row["Enrollment"] ?? row[" Total Enrollment"] ?? row["Total Enrollment"])
  ]));
  const pkEnrollmentMap = new Map(decisions.map(row => [
    normalizeName(row["Building Name"]),
    num(row["PKEnrollment"] ?? row["PK Enrollment"] ?? row["PK Enrollment "])
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
      option.textContent = schoolName;
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
      option.textContent = schoolName;
      flowchartSchoolSelect.appendChild(option);
    });
    
    console.log(`📊 Flowchart dropdown updated: ${sortedSchools.length} schools included`);
  };
}

// ✅ Move slider setup inside DOMContentLoaded to ensure elements are loaded
document.addEventListener('DOMContentLoaded', function() {
  // ✅ Set up slider event listeners
  const distanceWeightSlider = document.getElementById('distanceWeightSlider');
  const distanceWeightLabel = document.getElementById('distanceWeightLabel');
  const enrollmentWeightSlider = document.getElementById('enrollmentWeightSlider');
  const enrollmentWeightLabel = document.getElementById('enrollmentWeightLabel');
  const buildingWeightSlider = document.getElementById('buildingWeightSlider');
  const buildingWeightLabel = document.getElementById('buildingWeightLabel');

  if (distanceWeightSlider && distanceWeightLabel) {
    distanceWeightSlider.addEventListener('input', () => {
      distanceWeightLabel.textContent = distanceWeightSlider.value;
    });
  }
  if (enrollmentWeightSlider && enrollmentWeightLabel) {
    enrollmentWeightSlider.addEventListener('input', () => {
      enrollmentWeightLabel.textContent = enrollmentWeightSlider.value;
    });
  }
  if (buildingWeightSlider && buildingWeightLabel) {
    buildingWeightSlider.addEventListener('input', () => {
      buildingWeightLabel.textContent = buildingWeightSlider.value;
    });
  }

  const select = document.getElementById('schoolSelect');
  const isoDistanceSelect = document.getElementById('isoDistance');
  const manualBtn = document.getElementById('manualBtn');
  const modelBtn = document.getElementById('modelBtn');
  const manualView = document.getElementById('manualView');
  const modelView = document.getElementById('modelView');

  let selectedFeatureForIsochrone = null;

  // Wire up collapsible legend for Decision Types on the map
  (function setupCollapsibleLegend() {
    const legend = document.getElementById('map-legend');
    const toggle = document.getElementById('legend-toggle');
    if (!legend || !toggle) {
      return;
    }

    // Ensure initial state chevron matches the legend's collapsed/expanded class.
    const chevron = toggle.querySelector('span.chevron');
    if (chevron) {
      // Chevron glyph stays constant; CSS handles rotation based on collapsed/expanded state.
      chevron.textContent = '▸';
    }

    toggle.addEventListener('click', () => {
      legend.classList.toggle('legend-collapsed');
    });
  })();

  function triggerIsochroneUpdate() {
      if(selectedFeatureForIsochrone) {
          const [lng, lat] = selectedFeatureForIsochrone.geometry.coordinates;
          const distance = isoDistanceSelect.value;
          drawIsochrone([lng, lat], distance);
      }
  }

  select.addEventListener('change', async function () {
    const selectedSchoolName = this.value;
    selectedFeatureForIsochrone = geojsonData.features.find(
      f => normalize(f.properties['Building Name']) === normalize(selectedSchoolName)
    );

    // Update the highlight layer data source
    const highlightSource = map.getSource('selected-school');
    if (highlightSource) {
      if (selectedFeatureForIsochrone) {
        highlightSource.setData({
          type: 'FeatureCollection',
          features: [selectedFeatureForIsochrone]
        });
      } else {
        // If "-- Select --" is chosen, clear the highlight
        highlightSource.setData({
          type: 'FeatureCollection',
          features: []
        });
      }
    }
    
    if (!selectedFeatureForIsochrone) {
        // Clear isochrone if no school is selected
        if (map.getSource('isochrone')) {
            map.getSource('isochrone').setData({ type: 'FeatureCollection', features: [] });
        }
        document.querySelector("#isoTable tbody").innerHTML = "";
        return;
    }
    
    selectedEnrollment = parseInt(selectedFeatureForIsochrone.properties['Enrollment']) || 0;
    // Removed automatic flyTo to respect user-set zoom level

    // Only trigger isochrone update if in manual mode
    if (manualView.style.display !== 'none') {
        triggerIsochroneUpdate();
    } else {
        // Clear isochrone if switching to model mode
        if (map.getSource('isochrone')) {
            map.getSource('isochrone').setData({ type: 'FeatureCollection', features: [] });
        }
        document.querySelector("#isoTable tbody").innerHTML = "";
    }

    // Model Simulation roster now uses OD_Students.csv (student home coordinates)
    // The roster is loaded lazily when running the simulation (Assign button).

    // --- Blinking Halo Logic ---
    const sendingSource = map.getSource('sending-school');
    if (sendingSource) {
      if (selectedFeatureForIsochrone) {
        sendingSource.setData({
          type: 'FeatureCollection',
          features: [selectedFeatureForIsochrone]
        });
        startBlinkingHalo();
      } else {
        sendingSource.setData({ type: 'FeatureCollection', features: [] });
        stopBlinkingHalo();
      }
    }
  });

  if (isoDistanceSelect) {
    isoDistanceSelect.addEventListener('change', triggerIsochroneUpdate);
  } else {
    console.warn("⚠️ isoDistanceSelect not found; isochrone updates disabled");
  }

  if (manualBtn && modelBtn && manualView && modelView) {
    manualBtn.addEventListener('click', () => {
      manualView.style.display = 'block';
      modelView.style.display = 'none';
      manualBtn.classList.add('active');
      modelBtn.classList.remove('active');
      
      // Trigger isochrone update when switching to manual mode if a school is selected
      if (selectedFeatureForIsochrone) {
          triggerIsochroneUpdate();
      }
    });

    modelBtn.addEventListener('click', () => {
      manualView.style.display = 'none';
      modelView.style.display = 'block';
      manualBtn.classList.remove('active');
      modelBtn.classList.add('active');
      
      // Clear isochrone when switching to model mode
      if (map.getSource('isochrone')) {
          map.getSource('isochrone').setData({ type: 'FeatureCollection', features: [] });
      }
      const isoTableBody = document.querySelector("#isoTable tbody");
      if (isoTableBody) isoTableBody.innerHTML = "";
    });
  } else {
    console.warn("⚠️ Manual/model controls not found; skipping mode toggle setup");
  }

  // ✅ Debug assign button existence
  const assignButton = document.getElementById('assignButton');
  console.log("🔍 Assign button check during setup:");
  console.log("  assignButton exists:", !!assignButton);
  if (assignButton) {
    console.log("  assignButton text:", assignButton.textContent);
    console.log("  assignButton id:", assignButton.id);
  }

  if (assignButton) {
    assignButton.addEventListener('click', async () => {
    console.log("🔘 Assign button clicked!");
    
    // ✅ Get modal elements
    const progressModal = document.getElementById('assignmentProgress');
    const assignedCountElement = document.getElementById('assignedCount');
    const cancelButton = document.getElementById('cancelAssignment');
    
    console.log("🔍 Modal elements check:");
    console.log("  progressModal exists:", !!progressModal);
    console.log("  assignedCountElement exists:", !!assignedCountElement);
    console.log("  cancelButton exists:", !!cancelButton);
    
    // ✅ Show modal and initialize progress
    if (progressModal && assignedCountElement) {
      progressModal.style.display = 'block';
      assignedCountElement.textContent = '0';
      console.log("📊 Modal displayed and progress initialized to 0");
    } else {
      console.error("❌ Modal elements not found!");
      return;
    }

    // ✅ Add cancel functionality
    let assignmentCancelled = false;
    if (cancelButton) {
      cancelButton.onclick = () => {
        assignmentCancelled = true;
        progressModal.style.display = 'none';
        console.log("❌ Assignment cancelled by user");
      };
    }

    // ✅ Function to hide modal
    const hideModal = () => {
      if (progressModal) {
        progressModal.style.display = 'none';
        console.log("✅ Modal hidden");
      }
    };

    // ✅ Function to update progress
    const updateProgress = (count) => {
      if (assignedCountElement) {
        assignedCountElement.textContent = count;
        console.log("📊 Progress updated:", count);
      }
    };

    try {
        const selectedSchoolName = select.options[select.selectedIndex].textContent;
        console.log("🏫 Selected school:", selectedSchoolName);

        await ensureOdStudentsLoaded();

        const studentsToAssign = odStudentsBySchoolName.get(normalize(selectedSchoolName)) || [];
        console.log("👥 Students to assign (OD_Students):", studentsToAssign.length);

        if (studentsToAssign.length === 0) {
          alert("No students found for the selected school.");
          hideModal();
          return;
        }

        const excluded = new Set(Array.from(document.getElementById("excludedSchools").selectedOptions).map(opt => normalize(opt.value)));
        console.log("🚫 Excluded schools:", excluded.size);

        const featureByName = new Map(geojsonData.features.map(f => [normalize(f.properties["Building Name"]), f]));
        const schoolLookup = new Map(geojsonData.features.map(f => [normalize(f.properties["Building Name"]), f.properties]));

        const milesCrow = (lng1, lat1, lng2, lat2) => {
          const toRad = (d) => (d * Math.PI) / 180;
          const R = 3958.8; // miles
          const dLat = toRad(lat2 - lat1);
          const dLon = toRad(lng2 - lng1);
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return R * c;
        };

        // ✅ Get slider values directly from DOM elements
        const weightDistance = parseFloat(document.getElementById('distanceWeightSlider')?.value || 1);
        const weightEnrollment = parseFloat(document.getElementById('enrollmentWeightSlider')?.value || 1);
        const weightBuilding = parseFloat(document.getElementById('buildingWeightSlider')?.value || 1);
        console.log("⚖️ Weights - Distance:", weightDistance, "Enrollment:", weightEnrollment, "Building:", weightBuilding);
        
        // ✅ Calculate normalization factors for better scoring
        let maxDistance = 0;
        let maxQuality = 0;
        let maxUtilization = 0;
        
        // Find max distance for normalization (student home -> candidate school)
        const candidateFeatures = geojsonData.features.filter(f => {
          const destName = normalize(f.properties["Building Name"]);
          if (!destName) return false;
          if (destName === normalize(selectedSchoolName)) return false;
          if (excluded.has(destName)) return false;
          return true;
        });
        for (const s of studentsToAssign) {
          for (const f of candidateFeatures) {
            const c = f.geometry && f.geometry.coordinates ? f.geometry.coordinates : null;
            if (!c || c.length < 2) continue;
            const d = milesCrow(Number(s.lng), Number(s.lat), Number(c[0]), Number(c[1]));
            if (Number.isFinite(d)) maxDistance = Math.max(maxDistance, d);
          }
        }
        
        for (const feature of geojsonData.features) {
          const enrollment = parseInt(feature.properties["Enrollment"]) || 0;
          const quality = parseFloat(feature.properties["Building Quality"]) || 0;
          const utilization = parseFloat(feature.properties["Utilization"]) || 0;
          
          maxEnrollment = Math.max(maxEnrollment, enrollment);
          maxQuality = Math.max(maxQuality, quality);
          maxUtilization = Math.max(maxUtilization, utilization);
        }
        
        console.log("📊 Normalization factors - Max Distance:", maxDistance, "Max Enrollment:", maxEnrollment, "Max Quality:", maxQuality, "Max Utilization:", maxUtilization);
        
        const finalAssignments = {};
        console.log("🔄 Starting assignment algorithm...");
        
        // ✅ Track assigned counts for each school to enforce seat limits
        const assignedCounts = {};
        geojsonData.features.forEach(f => {
            assignedCounts[normalize(f.properties["Building Name"])] = 0;
        });
        
        // ✅ Process students with progress tracking
        let processedCount = 0;
        
        for (const student of studentsToAssign) {
            // ✅ Check if assignment was cancelled
            if (assignmentCancelled) {
              console.log("❌ Assignment cancelled during processing");
              return;
            }
            
            let bestSchool = null;
            let bestScore = -Infinity;

            for (const f of candidateFeatures) {
                const destName = normalize(f.properties["Building Name"]);
                const destProperties = schoolLookup.get(destName);
                if (!destProperties) continue;

                const coords = f.geometry && f.geometry.coordinates ? f.geometry.coordinates : null;
                if (!coords || coords.length < 2) continue;
                const distance = milesCrow(Number(student.lng), Number(student.lat), Number(coords[0]), Number(coords[1]));
                if (!Number.isFinite(distance)) continue;

                // ✅ Check seat availability (capacity constraint)
                const enrollment = parseInt(destProperties["Enrollment"]) || 0;
                const capacity = parseInt(destProperties["Capacity"]) || 0;
                const assignedSoFar = assignedCounts[destName] || 0;
                if ((enrollment + assignedSoFar) >= capacity) {
                    continue; // Skip if assigning would exceed capacity
                }

                const quality = parseFloat(destProperties["Building Quality"]) || 0;
                const utilization = parseFloat(destProperties["Utilization"]) || 0;

                // Lower Building Quality (BuildingTreshhold) is better
                const qualityScore = maxQuality > 0 ? (1 - (quality / maxQuality)) : 0; // Lower is better
                const distanceScore = maxDistance > 0 ? (1 - (distance / maxDistance)) : 0; // Closer is better
                const enrollmentScore = maxUtilization > 0 ? (utilization / maxUtilization) : 0; // Higher utilization is better

                const score =
                  (weightDistance * distanceScore) +
                  (weightEnrollment * enrollmentScore) +
                  (weightBuilding * qualityScore);

                // Debug logging for first few choices
                console.log(`🏫 ${destName}: Student=${student.studentId}, Distance=${distance.toFixed(2)}(${distanceScore.toFixed(3)}), Utilization=${(utilization * 100).toFixed(1)}%(${enrollmentScore.toFixed(3)}), Quality=${quality}(${qualityScore.toFixed(3)}), Total=${score.toFixed(3)}`);

                if (score > bestScore) {
                  bestScore = score;
                  bestSchool = destProperties["Building Name"] || f.properties["Building Name"];
                }
            }

            if (bestSchool) {
                finalAssignments[student.studentId] = bestSchool;
                // ✅ Increment assigned count for the chosen school
                assignedCounts[normalize(bestSchool)]++;
            }
            
            // ✅ Update progress
            processedCount++;
            updateProgress(processedCount);
            
            // Allow UI to update every 5 students
            if (processedCount % 5 === 0) {
              await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        
        // ✅ Check if assignment was cancelled before proceeding
        if (assignmentCancelled) {
          console.log("❌ Assignment cancelled after processing");
          return;
        }
        
        console.log("✅ Assignment algorithm completed. Assignments:", Object.keys(finalAssignments).length);

        const summaryCounts = {};
        for (const school of Object.values(finalAssignments)) {
            summaryCounts[school] = (summaryCounts[school] || 0) + 1;
        }
        
        // ✅ Update map with assignment results
        const assignedFeatures = geojsonData.features
          .filter(f => summaryCounts[f.properties['Building Name']])
          .map(f => {
            const assignedCount = summaryCounts[f.properties['Building Name']];
            return {
              type: 'Feature',
              geometry: f.geometry,
              properties: {
                name: f.properties['Building Name'],
                assigned: assignedCount
              }
            };
          });

        const assignedGeoJSON = {
          type: 'FeatureCollection',
          features: assignedFeatures
        };

        // Update the assigned-schools source on the map
        if (map.getSource('assigned-schools')) {
          console.log("🗺️ Updating assigned-schools source with data:", assignedGeoJSON);
          console.log("📊 Number of assigned features:", assignedGeoJSON.features.length);
          console.log("🏫 Assigned schools:", assignedGeoJSON.features.map(f => f.properties.name));
          
          map.getSource('assigned-schools').setData(assignedGeoJSON);
          map.setLayoutProperty('assigned-schools-layer', 'visibility', 'visible');
          
          // ✅ Check if data was set correctly
          setTimeout(() => {
            const source = map.getSource('assigned-schools');
            console.log("🔍 Source data after update:", source._data);
            console.log("👁️ Layer visibility after update:", map.getLayoutProperty('assigned-schools-layer', 'visibility'));
          }, 100);
          
          // ✅ Popup is already set up when layer was created
          console.log("✅ Assigned-schools layer updated");
        } else {
          console.error("❌ assigned-schools source not found!");
        }
        
        // Keep main layer coloring consistent with "Color by" toggle
        try {
          if (typeof window.applyMapColorByMode === 'function') window.applyMapColorByMode();
        } catch (e) {}
        
        // Toggle buttons removed - always showing decisions view
        
        // Update the legend
        updateLegend();
        
        const sortedSummary = Object.entries(summaryCounts).sort((a, b) => b[1] - a[1]);
        let output = `<strong style='font-size:18px;'>Student Assignments</strong><br/>`;
        output += `<table style=\"width:100%;margin-top:8px;border-collapse:collapse;font-family:'Franklin Gothic Book','Franklin Gothic','Arial Narrow',Arial,sans-serif;\">`;
        output += `<thead><tr style=\"background-color:#f2f2f2;\">\n                    <th style=\"border:1px solid #ccc;padding:6px;text-align:left;width:70%;min-width:220px;font-family:'Franklin Gothic Book','Franklin Gothic','Arial Narrow',Arial,sans-serif;\">School Name</th>\n                    <th style=\"border:1px solid #ccc;padding:6px;text-align:center;width:30%;min-width:50px;font-family:'Franklin Gothic Book','Franklin Gothic','Arial Narrow',Arial,sans-serif;\"># Students</th></tr>\n                    </thead><tbody>`;
        for (const [school, count] of sortedSummary) {
            output += `<tr><td class=\"truncate-cell\" data-tooltip=\"${school}\" style=\"width:70%;min-width:220px;font-family:'Franklin Gothic Book','Franklin Gothic','Arial Narrow',Arial,sans-serif;\">${school}</td>\n                    <td style=\"border:1px solid #ccc;padding:6px;text-align:center;width:30%;min-width:50px;font-family:'Franklin Gothic Book','Franklin Gothic','Arial Narrow',Arial,sans-serif;\">${count}</td></tr>`;
        }
        output += `</tbody></table>`;
        
        const chartLabels = [];
        const baseEnrollment = [];
        const simulatedAdds = [];
        const capacity = [];

        for (const [schoolName, added] of Object.entries(summaryCounts)) {
            const school = geojsonData.features.find(f => f.properties['Building Name'] === schoolName);
            if (school) {
                const current = parseInt(school.properties['Enrollment']) || 0;
                const cap = parseInt(school.properties['Capacity']) || 0;
                chartLabels.push(schoolName);
                baseEnrollment.push(current);
                simulatedAdds.push(added);
                capacity.push(cap);
            }
        }

        let totalOriginalDistance = 0;
        let totalAssignedDistance = 0;
        let studentCount = 0;

        const originFeature = featureByName.get(normalize(selectedSchoolName));
        const originCoords = originFeature && originFeature.geometry ? originFeature.geometry.coordinates : null;

        studentsToAssign.forEach(student => {
            const sid = student.studentId;
            if (originCoords && originCoords.length >= 2) {
              const d0 = milesCrow(Number(student.lng), Number(student.lat), Number(originCoords[0]), Number(originCoords[1]));
              if (Number.isFinite(d0)) totalOriginalDistance += d0;
            }

            const assignedSchool = finalAssignments[sid];
            const destFeature = assignedSchool ? featureByName.get(normalize(assignedSchool)) : null;
            const destCoords = destFeature && destFeature.geometry ? destFeature.geometry.coordinates : null;
            if (destCoords && destCoords.length >= 2) {
              const d1 = milesCrow(Number(student.lng), Number(student.lat), Number(destCoords[0]), Number(destCoords[1]));
              if (Number.isFinite(d1)) totalAssignedDistance += d1;
            }

            studentCount++;
        });

        const avgOriginal = totalOriginalDistance / studentCount;
        const avgAssigned = totalAssignedDistance / studentCount;
        
        const resultsData = {
            summaryHTML: output,
            enrollmentChartData: {
                labels: chartLabels,
                datasets: [
                    { label: 'Current Enrollment', data: baseEnrollment, backgroundColor: '#0033A0', barThickness: 12 },
                    { label: 'New Assignments', data: simulatedAdds, backgroundColor: '#FFC72C', barThickness: 12 },
                    { label: 'Capacity', data: capacity, type: 'line', borderColor: '#FF530D', borderWidth: 3, pointStyle: 'line', pointRadius: 7, pointHoverRadius: 7, rotation: 90, fill: false, showLine: false, yAxisID: 'y' }
                ]
            },
            distanceChartData: {
                labels: ['Current School', 'Assigned School'],
                datasets: [{ label: 'Avg Distance (mi)', data: [avgOriginal.toFixed(2), avgAssigned.toFixed(2)], backgroundColor: ['#0033A0', '#ffcc00'] }]
            },
            assignments: finalAssignments,
            selectedSchoolName: selectedSchoolName
        };

        console.log("📤 Sending results directly to DecisionLogic...");
        if (window.decisionLogic && window.decisionLogic.handleAssignmentResults) {
            console.log("📤 Sending results directly to DecisionLogic...");
            window.decisionLogic.handleAssignmentResults(resultsData);
        } else {
            console.error("❌ DecisionLogic handler not found!");
        }

        // ✅ Hide the modal when assignment completes
        hideModal();
        console.log("✅ Assignment process completed successfully!");

        // Open the Model Output: Impact Analysis section
        const scenarioOutputPanel = document.getElementById('scenario-output-panel');
        if (scenarioOutputPanel) {
          scenarioOutputPanel.open = true;
        }

        // Update the travel distance impact chart with real data
        if (window.distanceChartInstance) {
          window.distanceChartInstance.data = {
            labels: ['Current School', 'Assigned School'],
            datasets: [{
              label: 'Avg Distance (mi)',
              data: [avgOriginal.toFixed(2), avgAssigned.toFixed(2)],
              backgroundColor: ['#0033A0', '#ffcc00']
            }]
          };
          window.distanceChartInstance.update();
          // Hide the placeholder text
          const placeholder = document.getElementById('distanceChartPlaceholder');
          if (placeholder && placeholder.parentNode) {
            console.log('Removing distanceChartPlaceholder from DOM');
            placeholder.parentNode.removeChild(placeholder);
          }
        }

        // Hide the enrollment chart placeholder as well
        const enrollPlaceholder = document.getElementById('enrollmentChartPlaceholder');
        if (enrollPlaceholder) enrollPlaceholder.style.display = 'none';

        // When updating the model output section, ensure the font is set for the entire container
        // Find the model output container and set its font family
        const modelOutputContainer = document.getElementById('scenario-output-panel');
        if (modelOutputContainer) {
          modelOutputContainer.style.fontFamily = "'Franklin Gothic Book','Franklin Gothic','Arial Narrow',Arial,sans-serif";
        }

        console.log('Simulation completed, checking for and removing distanceChartPlaceholder if present');
        const placeholder = document.getElementById('distanceChartPlaceholder');
        if (placeholder && placeholder.parentNode) {
          console.log('Removing distanceChartPlaceholder from DOM');
          placeholder.parentNode.removeChild(placeholder);
        }

    } catch (error) {
        console.error('❌ Error in assignment process:', error);
        // ✅ Hide the modal on error too
        hideModal();
        alert('An error occurred during the assignment process. Please try again.');
    }
    });
  } else {
    console.warn("⚠️ assignButton not found; assignment click handler not attached");
  }
});

// Wire up the always-visible "Show on map" button next to the main flowchart
// school dropdown. This runs once the DOM is ready, independent of the
// flowchart initialization logic.
document.addEventListener('DOMContentLoaded', () => {
  const showOnMapBtn = document.getElementById('flowchartShowOnMapBtn');
  const flowchartSchoolSelect = document.getElementById('mainFlowchartSchoolSelect');
  if (!showOnMapBtn || !flowchartSchoolSelect) {
    console.warn("⚠️ flowchartShowOnMapBtn or mainFlowchartSchoolSelect not found on DOMContentLoaded");
    return;
  }

  showOnMapBtn.addEventListener('click', () => {
    const currentName = flowchartSchoolSelect.value;
    console.log("🗺️ Show on map button clicked; selected school:", currentName);
    if (!currentName) {
      console.warn("⚠️ No school selected in mainFlowchartSchoolSelect");
      return;
    }
    if (typeof window.showOnMapFromFlowchart === 'function') {
      window.showOnMapFromFlowchart(currentName, { forceSwitch: true });
    } else {
      console.warn("⚠️ showOnMapFromFlowchart is not yet defined");
    }
  });
});

let currentIsochronePolygon = null;

async function drawIsochrone(centerCoords, distanceMeters) {
  if (!centerCoords || !distanceMeters) return;
  try {
      const url = `https://api.mapbox.com/isochrone/v1/mapbox/driving/${centerCoords[0]},${centerCoords[1]}?contours_meters=${distanceMeters}&polygons=true&access_token=${mapboxgl.accessToken}`;
      const res = await fetch(url);
      const data = await res.json();
      
      if (!data.features || data.features.length === 0) {
          console.warn("No isochrone feature returned from API.");
          if (map.getSource('isochrone')) {
            map.getSource('isochrone').setData({ type: 'FeatureCollection', features: [] });
          }
          return;
      }
      const simplified = turf.simplify(data.features[0], { tolerance: 0.001, highQuality: true });
      
      if (map.getSource('isochrone')) {
        map.getSource('isochrone').setData(simplified);
      } else {
        map.addSource('isochrone', { type: 'geojson', data: simplified });
        map.addLayer({
          id: 'isochrone-layer',
          type: 'fill',
          source: 'isochrone',
          paint: { 'fill-color': '#1E90FF', 'fill-opacity': 0.3 }
        });
      }
      
      currentIsochronePolygon = simplified;
      filterSchoolsInIsochrone(currentIsochronePolygon);
  } catch (err) {
    console.error('Failed to fetch or display isochrone:', err);
  }
}

function filterSchoolsInIsochrone(polygon) {
  const isoTableBody = document.querySelector("#isoTable tbody");
  if (!isoTableBody) return;

  let visibleFeatures = geojsonData.features.filter(f => turf.booleanPointInPolygon(f.geometry, polygon));
  // Always exclude the selected school from manual assignment options
  const schoolSelect = document.getElementById('schoolSelect');
  if (schoolSelect && schoolSelect.value) {
    visibleFeatures = visibleFeatures.filter(f => f.properties['Building Name'] !== schoolSelect.value);
  }
  // Exclude the selected school if decision type is 'Candidate for Closure/Merger'
  const decisionFilter = document.getElementById('decisionFilter');
  if (decisionFilter && schoolSelect && decisionFilter.value === 'Candidate for Closure/Merger') {
    const selectedSchool = schoolSelect.value;
    // (Already excluded above)
    // --- Add info above the table ---
    const manualView = document.getElementById('manualView');
    const isoTable = document.getElementById('isoTable');
    if (manualView && isoTable && selectedSchool) {
      // Find the selected school in geojsonData
      const selectedFeature = geojsonData.features.find(
        f => f.properties['Building Name'] === selectedSchool
      );
      const enrollment = selectedFeature ? (selectedFeature.properties['Enrollment'] || 0) : 0;
      // Create or update the info div above the table
      let infoDiv = document.getElementById('closureMergerInfo');
      if (!infoDiv) {
        infoDiv = document.createElement('div');
        infoDiv.id = 'closureMergerInfo';
        infoDiv.style.marginBottom = '10px';
        isoTable.parentNode.insertBefore(infoDiv, isoTable);
      }
      infoDiv.innerHTML = `<strong>Selected School:</strong> ${selectedSchool}<br><strong>Number of students to be assigned:</strong> ${enrollment}`;
    }
  } else {
    // Remove the info div if it exists
    const infoDiv = document.getElementById('closureMergerInfo');
    if (infoDiv) infoDiv.remove();
  }

  isoTableBody.innerHTML = '';
  visibleFeatures.forEach(f => {
    const row = document.createElement('tr');
    const name = f.properties['Building Name'];
    const originalSeats = parseInt(f.properties['Available Seats']) || 0;

    row.innerHTML = `
      <td class="truncate-cell" data-tooltip="${name}">${name}</td>
      <td class="percent-cell">
        <span class="assign-percent-btns" style="display:inline-flex; flex-direction:column; align-items:center; margin-right:2px;">
          <button type="button" class="assign-percent-up" tabindex="-1">&#x25B2;</button>
          <button type="button" class="assign-percent-down" tabindex="-1">&#x25BC;</button>
        </span>
        <input type="text" class="assign-percent" maxlength="3" pattern="[0-9]*" inputmode="numeric" value="0" style="width:50px; text-align:center; margin:0;" />
        <span>%</span>
      </td>
      <td class="assigned-count text-center">0</td>
      <td class="updated-seats text-center">${originalSeats}</td>
    `;
    isoTableBody.appendChild(row);
  });

  addPercentageListeners(visibleFeatures);
  // Add up/down button listeners for % Assigned
  document.querySelectorAll('.assign-percent-up').forEach((btn) => {
    btn.addEventListener('click', function() {
      const input = btn.closest('td').querySelector('.assign-percent');
      let val = parseInt(input.value) || 0;
      if (val < 100) {
        input.value = val + 1;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  });
  document.querySelectorAll('.assign-percent-down').forEach((btn) => {
    btn.addEventListener('click', function() {
      const input = btn.closest('td').querySelector('.assign-percent');
      let val = parseInt(input.value) || 0;
      if (val > 0) {
        input.value = val - 1;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  });
}

function addPercentageListeners(visibleFeatures) {
  const inputs = document.querySelectorAll('.assign-percent');
  // Add or get warning message element above the table
  let warningDiv = document.getElementById('manualAssignWarning');
  const isoTable = document.getElementById('isoTable');
  if (!warningDiv && isoTable) {
    warningDiv = document.createElement('div');
    warningDiv.id = 'manualAssignWarning';
    warningDiv.style.color = '#e74c3c';
    warningDiv.style.fontWeight = 'bold';
    warningDiv.style.marginBottom = '8px';
    warningDiv.style.display = 'none';
    isoTable.parentNode.insertBefore(warningDiv, isoTable);
  }

  function showWarning(msg) {
    if (warningDiv) {
      warningDiv.textContent = msg;
      warningDiv.style.display = 'block';
    }
  }
  function hideWarning() {
    if (warningDiv) {
      warningDiv.style.display = 'none';
      warningDiv.textContent = '';
    }
  }

  inputs.forEach((input, i) => {
    function switchToAssignmentsView() {
      const assignmentsBtn = document.getElementById('toggleViewAssignments');
      if (assignmentsBtn && !assignmentsBtn.classList.contains('active')) {
        assignmentsBtn.click();
      }
    }
    input.addEventListener('focus', function() {
      if (input.value === "0") {
        input.value = "";
      }
    });
    input.addEventListener('input', switchToAssignmentsView);
    input.addEventListener('input', () => {
      if(i >= visibleFeatures.length) return;
      // Calculate total assigned if this input is changed
      let totalAssigned = 0;
      const assignedCounts = [];
      inputs.forEach((inp, idx) => {
        let percent = parseFloat(inp.value) || 0;
        let assigned = Math.round((percent / 100) * selectedEnrollment);
        assignedCounts[idx] = assigned;
        totalAssigned += assigned;
      });
      // If over limit, adjust this input
      if (totalAssigned > selectedEnrollment) {
        // Calculate how many students are already assigned (excluding this input)
        let assignedOther = 0;
        inputs.forEach((inp, idx) => {
          if (idx !== i) {
            let percent = parseFloat(inp.value) || 0;
            assignedOther += Math.round((percent / 100) * selectedEnrollment);
          }
        });
        // Set this input so total = selectedEnrollment
        let maxForThis = Math.max(0, selectedEnrollment - assignedOther);
        let maxPercent = selectedEnrollment > 0 ? Math.floor((maxForThis / selectedEnrollment) * 100) : 0;
        input.value = maxPercent;
        // Update assigned cell and updated seats
        const assignedCell = input.closest('tr').querySelector('.assigned-count');
        const updatedCell = input.closest('tr').querySelector('.updated-seats');
        assignedCell.textContent = maxForThis;
        const originalSeats = parseInt(visibleFeatures[i].properties['Available Seats']) || 0;
        updatedCell.textContent = originalSeats - maxForThis;
        showWarning('Cannot assign more than 100% of students.');
      } else {
        // Normal update
        const percent = parseFloat(input.value) || 0;
        const assignedCell = input.closest('tr').querySelector('.assigned-count');
        const updatedCell = input.closest('tr').querySelector('.updated-seats');
        const assignedStudents = Math.round((percent / 100) * selectedEnrollment);
        const originalSeats = parseInt(visibleFeatures[i].properties['Available Seats']) || 0;
        const remainingSeats = originalSeats - assignedStudents;
        assignedCell.textContent = assignedStudents;
        updatedCell.textContent = remainingSeats;
        // Check if total assigned is now valid, hide warning if so
        // (recalculate totalAssigned in case it changed)
        let validTotal = 0;
        inputs.forEach((inp) => {
          let percent = parseFloat(inp.value) || 0;
          validTotal += Math.round((percent / 100) * selectedEnrollment);
        });
        if (validTotal <= selectedEnrollment) {
          hideWarning();
        }
      }

      // --- Update number of students to be assigned in closure/merger info ---
      const decisionFilter = document.getElementById('decisionFilter');
      const infoDiv = document.getElementById('closureMergerInfo');
      if (infoDiv && decisionFilter && decisionFilter.value === 'Candidate for Closure/Merger') {
        // Sum all assigned students
        let totalAssigned = 0;
        document.querySelectorAll('.assign-percent').forEach(input2 => {
          const percent2 = parseFloat(input2.value) || 0;
          totalAssigned += Math.round((percent2 / 100) * selectedEnrollment);
        });
        // Find the original enrollment from the infoDiv (parse from the HTML)
        const match = infoDiv.innerHTML.match(/Number of students to be assigned:<\/strong> (\d+)/);
        let originalEnrollment = selectedEnrollment;
        if (match) {
          // If the number has already been updated, recalculate from selectedEnrollment
          originalEnrollment = selectedEnrollment;
        }
        const remaining = Math.max(0, originalEnrollment - totalAssigned);
        // Update only the number in the infoDiv
        infoDiv.innerHTML = infoDiv.innerHTML.replace(/(Number of students to be assigned:<\/strong> )\d+/, `$1${remaining}`);
      }

      // --- Update map assignments in real time for manual entry ---
      // Only if 'Show Assignments' is active
      // Build summaryCounts from current table
      let summaryCounts = {};
      document.querySelectorAll('#isoTable tbody tr').forEach((row) => {
        const nameCell = row.querySelector('td');
        const assignedCell = row.querySelector('.assigned-count');
        if (nameCell && assignedCell) {
          const schoolName = nameCell.textContent.trim();
          const assigned = parseInt(assignedCell.textContent) || 0;
          if (assigned > 0) summaryCounts[schoolName] = assigned;
        }
      });
      // Build assignedFeatures for the map
      const assignedFeatures = geojsonData.features
        .filter(f => summaryCounts[f.properties['Building Name']])
        .map(f => {
          const assignedCount = summaryCounts[f.properties['Building Name']];
          return {
            type: 'Feature',
            geometry: f.geometry,
            properties: {
              name: f.properties['Building Name'],
              assigned: assignedCount
            }
          };
        });
      const assignedGeoJSON = {
        type: 'FeatureCollection',
        features: assignedFeatures
      };
      if (map.getSource('assigned-schools')) {
        map.getSource('assigned-schools').setData(assignedGeoJSON);
        if (map.getLayer('assigned-schools-layer')) {
          map.setLayoutProperty('assigned-schools-layer', 'visibility', assignedFeatures.length > 0 ? 'visible' : 'none');
        }
      }
    });
  });
}

// ✅ New script to connect sidebar sliders to the DecisionLogic iframe - REPLACED
document.addEventListener("DOMContentLoaded", function() {
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

      // ✅ Update nearby destination highlight on the map for the selected school
      if (selectedSchoolForFlow && typeof window.updateNearbyDestinationsHighlight === 'function' && window.decisionLogic && Array.isArray(window.decisionLogic.schoolData)) {
        const originRowForFlow = window.decisionLogic.schoolData.find(r => r["Building Name"] === selectedSchoolForFlow);
        const originIdForFlow = originRowForFlow
          ? (originRowForFlow.UniqueID || originRowForFlow["UniqueID"] || originRowForFlow["Unique Id"] || "").toString().trim()
          : "";
        if (originIdForFlow) {
          console.log("🔄 Updating nearby destination highlight for origin:", selectedSchoolForFlow, originIdForFlow);
          window.currentOriginName = selectedSchoolForFlow;
          window.currentOriginId = originIdForFlow;
          window.updateNearbyDestinationsHighlight(originIdForFlow);
        }
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

function startOnboardingWalkthrough(options = {}) {
  const requestedStartAt = (options && options.startAt) ? String(options.startAt) : '';
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
    if (el) el.open = false;
  });

  const steps = [
    {
      target: 'body',
      title: 'Welcome to the JeffCo Facility Planning Dashboard',
      text:
        'This dashboard helps Jeffco explore facility planning options by combining school-level indicators, a map view, and decision logic into a single workflow.' +
        '<ul style="margin:8px 0 8px 18px; padding:0;">' +
          '<li><strong>Step 1 – School-level data</strong>: Review key metrics for a school.</li>' +
          '<li><strong>Step 2 – Map</strong>: Explore patterns on the map.</li>' +
          '<li><strong>Step 3 – Strategic Sorting</strong>: Adjust thresholds and see outcomes update.</li>' +
          '<li><strong>Step 4 – Prioritization</strong>: Prioritize within strategy groups for follow-up planning.</li>' +
        '</ul>' +
        'You can jump to a specific module at any time using the dropdown, or run the full tour.',
      isIntro: true
    },
    {
      target: '#process-steps',
      title: 'Process Steps (Step 1–4)',
      text: 'These buttons are the main workflow navigation. Click Step 1–4 at any time to jump to that part of the dashboard.',
      ensureMenuClosed: true
    },
    {
      target: '#step1SchoolSelect',
      tourKey: 'step1',
      title: 'Step 1: School-level data',
      text: 'Pick a school to see Building Information + Enrollment indicators. Use “Compare schools” if you want to line up multiple schools side-by-side.',
      ensureProcessStep: 1,
      ensureMenuClosed: true
    },
    {
      target: '#sidebarToggle',
      title: 'Hamburger Menu (important)',
      text: 'Click the hamburger menu in the top bar to open the dashboard menu. From there you can show/hide the left and right panels, start this tour again, and switch between Map and Flowchart views.',
      ensureMenuClosed: true
    },
    {
      target: '#toggleLeftSidebar',
      title: 'Show the Left Panel (Inputs)',
      text: 'Use this toggle to show/hide the left panel. The left panel contains Strategic Sorting inputs (threshold sliders) and Prioritization scenario controls.',
      openMenu: true
    },
    {
      target: '#toggleRightSidebar',
      title: 'Show the Right Panel (Results)',
      text: 'Use this toggle to show/hide the right panel. The right panel contains Strategic Sorting results (summary + by-school) and model/scenario outputs.',
      openMenu: true
    },
    {
      target: '#sidebar',
      title: 'Left Panel: Inputs',
      text: 'This is where you control the assumptions. Expand each section to see sliders, options, and help tips.',
      ensureLeftSidebar: true
    },
    {
      target: '#decision-input-panel',
      tourKey: 'step3',
      title: 'Strategic Sorting (Inputs)',
      text: 'Adjust the threshold sliders to change how schools are categorized into strategy groups. As you change sliders, the results update immediately on the right.',
      ensureProcessStep: 3,
      ensureLeftSidebar: true
    },
    {
      target: '#map-sidebar',
      title: 'Right Panel: Results',
      text: 'This panel shows the outcomes of your inputs. Strategic Sorting results update live; model/scenario outputs appear after you run a scenario.',
      ensureRightSidebar: true
    },
    {
      target: '#decision-output-panel',
      title: 'Strategic Sorting (Results)',
      text: 'Open “Summary Table” to see counts by strategy group, and “Decision by School” to see each school’s assigned outcome. Use the help icons (?) for definitions.',
      ensureProcessStep: 3,
      ensureRightSidebar: true
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
      ensureMapView: true
    },
    {
      target: '#scenario-input-panel',
      tourKey: 'step4',
      title: 'Scenario Modeling (Inputs)',
      text: 'Use scenario modeling to test different decision types and see how student enrollment, utilization, and travel distance could change.',
      ensureProcessStep: 4,
      ensureLeftSidebar: true
    },
    {
      target: '#scenario-output-panel',
      title: 'Scenario Modeling (Outputs)',
      text: 'After running a scenario, review the output here to understand impacts (enrollment shifts, utilization changes, and travel distance changes).',
      ensureProcessStep: 4,
      ensureRightSidebar: true
    },
    {
      target: '#toggleMapFlowchartFlowchart2',
      tourKey: 'flowchart',
      title: 'Flowchart View',
      text: 'Switch to the Flowchart view to understand the decision logic for a specific school.',
      ensureFlowchartView: true
    },
    {
      target: '#mainFlowchartSchoolSelect',
      title: 'Select a School (Flowchart)',
      text: 'Choose a school from this dropdown to render its decision flowchart and see which thresholds are “active” for that school.',
      ensureFlowchartView: true
    },
    {
      target: '#flowchartShowOnMapBtn',
      title: 'Show on Map',
      text: 'Use “Show on map” to jump back to the map centered on the selected school.',
      ensureFlowchartView: true
    },
    {
      target: 'body',
      title: 'All set',
      text: 'You’re ready to explore. Re-open the hamburger menu any time to start the tour again.',
      ensureMenuClosed: true
    }
  ];

  let currentStep = 0;
  let overlay = null;
  let popup = null;
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

  function ensureProcessStep(stepNum) {
    try {
      const btn = document.querySelector(`.process-step[data-step="${stepNum}"]`);
      if (btn) btn.click();
    } catch (e) {}
  }

  function ensureMapView() {
    if (typeof window.switchToMap === 'function') window.switchToMap();
  }
  function ensureFlowchartView() {
    if (typeof window.switchToFlowchart === 'function') window.switchToFlowchart();
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

  function showStep(stepIdx) {
    // Remove previous overlay/popup
    if (overlay) overlay.remove();
    if (popup) popup.remove();

    const step = steps[stepIdx];
    
    // Menu + visibility preconditions
    if (step.openMenu) openMenu();
    if (step.ensureMenuClosed) closeMenu();
    if (step.ensureLeftSidebar) setSidebarVisibility({ left: true });
    if (step.ensureRightSidebar) setSidebarVisibility({ right: true });
    if (typeof step.ensureProcessStep === 'number') ensureProcessStep(step.ensureProcessStep);
    if (step.ensureMapView) ensureMapView();
    if (step.ensureFlowchartView) ensureFlowchartView();
    
    let target = document.querySelector(step.target);
    // Open dropdown <details> if the step is for a details section
    const detailsIds = ['#decision-input-panel', '#scenario-input-panel', '#decision-output-panel', '#scenario-output-panel'];
    if (detailsIds.includes(step.target) && target && !target.open) {
      target.open = true;
    }

    // --- ADD THIS: If the step is the flowchart, switch to flowchart view ---
    if (step.target === '#main-flowchart-container') {
      // This is the flowchart step; show the flowchart view
      const flowchartBtn = document.getElementById('toggleMapFlowchartFlowchart');
      if (flowchartBtn && !flowchartBtn.classList.contains('active')) {
        flowchartBtn.click();
      }
    }

    // For scenario/model output, wait for the section to open before highlighting
    if ((step.target === '#scenario-input-panel' || step.target === '#scenario-output-panel') && target) {
      // Scroll into view
      target.scrollIntoView({behavior: 'smooth', block: 'nearest'});
      // For scenario modeling, highlight the entire details border, not just the summary, but only after open and after scroll
      if (step.target === '#scenario-input-panel') {
        let highlightTarget = document.getElementById('scenario-input-panel');
        const drawAfterScroll = () => {
          drawHighlight(highlightTarget, step, stepIdx);
          setTimeout(() => {
            drawPopup(target, step, stepIdx);
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
      // For scenario output panel, highlight after open and scroll
      if (step.target === '#scenario-output-panel') {
        let highlightTarget = document.getElementById('scenario-output-panel');
        const drawAfterScroll = () => {
          drawHighlight(highlightTarget, step, stepIdx);
          setTimeout(() => {
            drawPopup(target, step, stepIdx);
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

    // Default: draw highlight and popup immediately
    drawHighlight(target, step, stepIdx);
    drawPopup(target, step, stepIdx);
  }

  // ---- Exit-anytime + resize safety helpers ----
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function positionPopup(target, step) {
    if (!popup) return;
    const margin = 12;

    // Ensure popup stays inside viewport even on small screens
    popup.style.maxHeight = `calc(100vh - ${margin * 2}px)`;
    popup.style.overflowY = 'auto';

    // Measure after DOM append
    const popupRect = popup.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;

    // Default desired position
    let desiredLeft = margin;
    let desiredTop = margin;

    if (step.isIntro || step.target === 'body') {
      desiredLeft = (vw - popupRect.width) / 2;
      desiredTop = Math.max(margin, Math.round(vh * 0.18));
    } else {
      const rect = target.getBoundingClientRect();

      // Prefer right of target
      desiredLeft = rect.right + 20;
      desiredTop = rect.top;

      // If right would overflow, try left of target
      if (desiredLeft + popupRect.width + margin > vw) {
        desiredLeft = rect.left - popupRect.width - 20;
      }

      // If still overflow (or target is near edges), clamp
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
      if (panel && panel.open) {
        console.log("🔒 Closing panel:", panel.id);
        panel.open = false; 
      }
    });

    // Wait a bit before opening panels to ensure everything is settled
    setTimeout(() => {
      // Open required panels
      const decisionInputPanel = document.getElementById('decision-input-panel');
      const decisionOutputPanel = document.getElementById('decision-output-panel');
      
      if (decisionInputPanel) {
        console.log("🔓 Opening decision input panel");
        decisionInputPanel.open = true;
        // Force a reflow to ensure the panel opens
        decisionInputPanel.offsetHeight;
        
        // Check if it actually opened
        setTimeout(() => {
          console.log("🔍 Decision input panel open state:", decisionInputPanel.open);
          if (!decisionInputPanel.open) {
            console.log("🔄 Retrying to open decision input panel");
            decisionInputPanel.open = true;
            decisionInputPanel.offsetHeight;
          }
        }, 100);
      } else {
        console.error("❌ Could not find decision-input-panel");
      }
      
      if (decisionOutputPanel) {
        console.log("🔓 Opening decision output panel");
        decisionOutputPanel.open = true;
        // Force a reflow to ensure the panel opens
        decisionOutputPanel.offsetHeight;
        
        // Check if it actually opened
        setTimeout(() => {
          console.log("🔍 Decision output panel open state:", decisionOutputPanel.open);
          if (!decisionOutputPanel.open) {
            console.log("🔄 Retrying to open decision output panel");
            decisionOutputPanel.open = true;
            decisionOutputPanel.offsetHeight;
          }
        }, 100);
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
      if (panel && panel.open) {
        console.log("🔒 Closing panel:", panel.id);
        panel.open = false; 
      }
    });

    // Wait a bit before opening panels to ensure everything is settled
    setTimeout(() => {
      // Open required panels
      const scenarioInputPanel = document.getElementById('scenario-input-panel');
      const scenarioOutputPanel = document.getElementById('scenario-output-panel');
      
      if (scenarioInputPanel) {
        console.log("🔓 Opening scenario input panel");
        scenarioInputPanel.open = true;
        // Force a reflow to ensure the panel opens
        scenarioInputPanel.offsetHeight;
        
        // Check if it actually opened
        setTimeout(() => {
          console.log("🔍 Scenario input panel open state:", scenarioInputPanel.open);
          console.log("🔍 Scenario input panel display:", window.getComputedStyle(scenarioInputPanel).display);
          console.log("🔍 Scenario input panel visibility:", window.getComputedStyle(scenarioInputPanel).visibility);
          
          // If it's still not open, try again
          if (!scenarioInputPanel.open) {
            console.log("🔄 Retrying to open scenario input panel");
            scenarioInputPanel.open = true;
            scenarioInputPanel.offsetHeight;
          }
        }, 100);
      } else {
        console.error("❌ Could not find scenario-input-panel");
      }
      
      if (scenarioOutputPanel) {
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
      if (panel && panel.open) {
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
    // Create overlay
    overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'rgba(0,0,0,0.1)';
    overlay.style.zIndex = '20000';
    // IMPORTANT: allow user to interact with the app during the tour (hamburger menu, panels, sliders, etc.)
    overlay.style.pointerEvents = 'none';
    document.body.appendChild(overlay);

    // Highlight target (skip for intro step)
    let rect = {left: 0, top: 0, width: 0, height: 0};
    let highlight = null;
    if (!step.isIntro) {
      rect = target.getBoundingClientRect();
      let pad = 0;
     
      highlight = document.createElement('div');
      highlight.style.position = 'fixed';
      highlight.style.left = (rect.left - pad) + 'px';
      highlight.style.top = (rect.top - pad) + 'px';
      highlight.style.width = (rect.width + pad * 2) + 'px';
      highlight.style.height = (rect.height + pad * 2) + 'px';
      highlight.style.border = '3px solid #FFD600';
      highlight.style.borderRadius = '10px';
      highlight.style.boxShadow = '0 0 0 9999px rgba(0,0,0,0.7)';
      highlight.style.zIndex = '20001';
      highlight.style.pointerEvents = 'none';
      document.body.appendChild(highlight);
      overlay.appendChild(highlight);
      
      // Add additional red circle around "Show Map" button for map step
      if (step.target === '#map-container') {
        const mapButton = document.getElementById('toggleMapFlowchartMap');
        if (mapButton) {
          const buttonRect = mapButton.getBoundingClientRect();
          const buttonHighlight = document.createElement('div');
          buttonHighlight.style.position = 'fixed';
          buttonHighlight.style.left = (buttonRect.left - 10) + 'px';
          buttonHighlight.style.top = (buttonRect.top - 10) + 'px';
          buttonHighlight.style.width = (buttonRect.width + 20) + 'px';
          buttonHighlight.style.height = (buttonRect.height + 20) + 'px';
          buttonHighlight.style.border = '3px solid #e74c3c';
          buttonHighlight.style.borderRadius = '50%';
          buttonHighlight.style.zIndex = '20002';
          buttonHighlight.style.pointerEvents = 'none';
          document.body.appendChild(buttonHighlight);
          overlay.appendChild(buttonHighlight);
        }
      }

      if (step.target === '#main-flowchart-container') {
        const flowchartButton = document.getElementById('toggleMapFlowchartFlowchart2');
        if (flowchartButton) {
          const buttonRect = flowchartButton.getBoundingClientRect();
          const buttonHighlight = document.createElement('div');
          buttonHighlight.style.position = 'fixed';
          buttonHighlight.style.left = (buttonRect.left - 10) + 'px';
          buttonHighlight.style.top = (buttonRect.top - 10) + 'px';
          buttonHighlight.style.width = (buttonRect.width + 20) + 'px';
          buttonHighlight.style.height = (buttonRect.height + 20) + 'px';
          buttonHighlight.style.border = '3px solid #e74c3c';
          buttonHighlight.style.borderRadius = '50%';
          buttonHighlight.style.zIndex = '20002';
          buttonHighlight.style.pointerEvents = 'none';
          document.body.appendChild(buttonHighlight);
          overlay.appendChild(buttonHighlight);
        }
      }
    }
  }

  function drawPopup(target, step, stepIdx) {
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
    popup.style.zIndex = '20002';
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
    closeBtn.onclick = endWalkthrough;
    popup.appendChild(closeBtn);

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
      { v: 'step1', t: 'Step 1 — School-level data' },
      { v: 'step2', t: 'Step 2 — Map' },
      { v: 'step3', t: 'Step 3 — Strategic Sorting' },
      { v: 'step4', t: 'Step 4 — Prioritization' },
      { v: 'flowchart', t: 'Flowchart' }
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
      skipBtn.onclick = endWalkthrough;
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
      endBtn.onclick = endWalkthrough;
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
        const scenarioPanel = document.getElementById('scenario-input-panel');
        if (scenarioPanel && scenarioPanel.open) {
          scenarioPanel.open = false;
        }
      } else if (currentStepTarget === '#decision-input-panel') {
        const decisionPanel = document.getElementById('decision-input-panel');
        if (decisionPanel && decisionPanel.open) {
          decisionPanel.open = false;
        }
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
      } else if (currentStepTarget === '#main-flowchart-container') {
        // Switch back to map view if we were on flowchart
        const mapBtn = document.getElementById('toggleMapFlowchartMap');
        if (mapBtn && !mapBtn.classList.contains('active')) {
          mapBtn.click();
        }
      }
      
      showStep(currentStep);
    } else {
      endWalkthrough();
    }
  }

  function endWalkthrough() {
    if (overlay) overlay.remove();
    if (popup) popup.remove();

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
      panels.forEach(panel => { if (panel && panel.open) panel.open = false; });

      // Collapse both sidebars back to the default "everything collapsed" state
      setSidebarVisibility({ left: false, right: false });
      
      // Switch to map view if currently on flowchart (only when not setting up a path)
      const mapBtn = document.getElementById('toggleMapFlowchartMap');
      if (mapBtn && !mapBtn.classList.contains('active')) {
        mapBtn.click();
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

// === START TOUR BUTTON LOGIC ===
document.addEventListener('DOMContentLoaded', function() {
  const startTourBtn = document.getElementById('startTourBtn');
  if (startTourBtn) {
    startTourBtn.addEventListener('click', function() {
      startOnboardingWalkthrough();
    });
  }
});

// "How to use" section: start tour for a specific module
document.addEventListener('DOMContentLoaded', function() {
  const btn = document.getElementById('howToStartTourBtn');
  const sel = document.getElementById('howToTourModuleSelect');
  if (!btn || !sel) return;
  btn.addEventListener('click', function() {
    const key = String(sel.value || 'full');
    if (key && key !== 'full') {
      startOnboardingWalkthrough({ startAt: key });
    } else {
      startOnboardingWalkthrough();
    }
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
      }, 100);
    }
    window.__centerViewPrefersFlowchart = false;
  };
}

// --- Process Steps stripe (Step 1–4) ---
// Declarative mapping between process steps and UI panels.
(function initProcessStepsStripe() {
  /** Steps 3–4: entering from Step 1/2 defaults to collapsed (“Show tables”); 3↔4 preserves layout; “Pop out” → movable panel (~20vh). */
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
    const nav = document.getElementById('process-steps');
    if (nav) {
      const h = nav.getBoundingClientRect().height;
      if (h > 8) return Math.round(h);
    }
    return getBrandBarHeight();
  }

  function placeBottomTablesFloatingPanel() {
    const main = document.getElementById('bottom-tables-main');
    if (!main) return;
    const w = Math.min(Math.round(window.innerWidth * 0.92), 1400);
    const h = Math.max(120, Math.round(window.innerHeight * 0.2));
    const left = Math.round((window.innerWidth - w) / 2);
    const topBrand = getBrandBarHeight();
    const bottomReserve = getProcessStepsHeight() + 12;
    let top = Math.round(window.innerHeight - bottomReserve - h);
    top = Math.max(topBrand + 6, top);
    main.style.width = `${w}px`;
    main.style.height = `${h}px`;
    main.style.left = `${left}px`;
    main.style.top = `${top}px`;
    main.style.right = 'auto';
    main.style.bottom = 'auto';
  }

  function clampBottomTablesFloatingPanel() {
    const main = document.getElementById('bottom-tables-main');
    if (!main || !main.classList.contains('bottom-tables-main--floating')) return;
    const margin = 6;
    const topBrand = getBrandBarHeight();
    const bottomReserve = getProcessStepsHeight() + margin;
    const rect = main.getBoundingClientRect();
    let left = parseFloat(main.style.left) || rect.left;
    let top = parseFloat(main.style.top) || rect.top;
    if (rect.left < margin) left += margin - rect.left;
    if (rect.top < topBrand + margin) top += topBrand + margin - rect.top;
    if (rect.right > window.innerWidth - margin) left -= rect.right - (window.innerWidth - margin);
    if (rect.bottom > window.innerHeight - bottomReserve) top -= rect.bottom - (window.innerHeight - bottomReserve);
    main.style.left = `${Math.round(left)}px`;
    main.style.top = `${Math.round(top)}px`;
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

  function hideBottomTablesFloating() {
    const main = document.getElementById('bottom-tables-main');
    document.body.classList.remove('bottom-tables-floating-open');
    document.body.classList.remove('bottom-tables-docked-collapsed');
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
      window.removeEventListener('resize', clampBottomTablesFloatingPanel);
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
    try {
      window.removeEventListener('resize', clampBottomTablesFloatingPanel);
      window.addEventListener('resize', clampBottomTablesFloatingPanel);
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
        window.removeEventListener('resize', clampBottomTablesFloatingPanel);
      } catch {}
      if (wasOutside34) {
        document.body.classList.add('bottom-tables-docked-collapsed');
      }
    } else {
      document.body.classList.add('bottom-tables-floating-open');
      placeBottomTablesFloatingPanel();
      try {
        window.removeEventListener('resize', clampBottomTablesFloatingPanel);
        window.addEventListener('resize', clampBottomTablesFloatingPanel);
      } catch {}
    }
    prevBottomTablesStep = n;
    requestMapResize();
  }

  function setActiveStep(stepNum) {
    const nav = document.getElementById('process-steps');
    if (!nav) return;
    nav.querySelectorAll('.process-step').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.step === String(stepNum));
    });
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

  function setStepPanelsVisibility(stepNum) {
    const decisionInput = document.getElementById('decision-input-panel');
    const decisionOutput = document.getElementById('decision-output-panel');
    const scenarioInput = document.getElementById('scenario-input-panel');
    const scenarioOutput = document.getElementById('scenario-output-panel');

    const hideScenario = Number(stepNum) === 3; // Step 3 = Strategic Sorting (hide prioritization + model outputs)
    const hideDecision = Number(stepNum) === 4; // Step 4 = Prioritize (hide strategic sorting inputs + results)

    function applyHidden(el, hidden) {
      if (!el) return;
      el.hidden = !!hidden;
      if (hidden) {
        try { el.open = false; } catch {}
      }
    }

    applyHidden(scenarioInput, hideScenario);
    applyHidden(scenarioOutput, hideScenario);
    applyHidden(decisionInput, hideDecision);
    applyHidden(decisionOutput, hideDecision);
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
      // Only account for the top brand bar; process steps live at the bottom now.
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
    try {
      panel.open = true;
    } catch {}
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
    try {
      panel.open = true;
    } catch {}
    const weights = document.getElementById('prioritizationWeightsDetails');
    if (weights) {
      try {
        weights.open = true;
      } catch {}
    }
  }

  window._goToStep = goToStep;
  function goToStep(stepNum) {
    setStepPanelsVisibility(stepNum);
    switch (Number(stepNum)) {
      case 1:
        // Step 1 is a dedicated school-level view: no map, no side panels.
        ensurePanelsVisible({ left: false, right: false });
        setMainView('step1');
        break;
      case 2:
        // Step 2 is map exploration: hide both side panels.
        ensurePanelsVisible({ left: false, right: false });
        applyCenterViewForMapSteps();
        break;
      case 3:
        ensurePanelsVisible({ left: true, right: true });
        applyCenterViewForMapSteps();
        expandDecisionInputSliderSections();
        openDetails('decision-output-panel');
        break;
      case 4:
        ensurePanelsVisible({ left: true, right: true });
        applyCenterViewForMapSteps();
        expandScenarioInputSliderSections();
        openDetails('scenario-output-panel');
        break;
      default:
        break;
    }
    setActiveStep(stepNum);
    applyBottomTablesStepMode(stepNum);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const nav = document.getElementById('process-steps');
    if (!nav) return;

    initBottomTablesFloatingDrag();
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

    // Click handlers
    nav.querySelectorAll('.process-step').forEach((btn) => {
      btn.addEventListener('click', () => goToStep(btn.dataset.step));
    });

    // Auto-highlight based on panel toggles (user navigation)
    const stepMap = [
      { id: 'decision-input-panel', step: 1 },
      { id: 'decision-output-panel', step: 3 },
      { id: 'scenario-output-panel', step: 4 },
    ];
    stepMap.forEach(({ id, step }) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('toggle', () => {
        if (el.open && !el.hidden) setActiveStep(step);
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
    return row && (row['Building Name'] || row['SchoolName'] || row['School Name'] || row['School'] || row['Name']);
  }

  function getDecisionSchoolRows() {
    const rows = window.decisionLogic && Array.isArray(window.decisionLogic.schoolData) ? window.decisionLogic.schoolData : [];
    return rows;
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

  function renderStep1Summary(row) {
    const detailsTbody = document.getElementById('step1BuildingInfoDetails');
    const buildingTiles = document.getElementById('step1BuildingInfoTiles');
    const enrollmentTiles = document.getElementById('step1EnrollmentTiles');

    // Building detail fields (fixed order, show "—" when missing to match the screenshot layout)
    const grades =
      pickFirstNonEmpty(row, ['Grades', 'Grade Levels', 'GradeLevels', 'School Level', 'School level', 'SchoolLevel']) || '';
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
    const enrollmentRaw = pickFirstNonEmpty(row, ['Enrollment']) || '';
    const seatsComputedFromRow = (window.getEffectiveAvailableSeats && window.getEffectiveAvailableSeats(row)) ?? null;
    const buildingScoreRaw = pickFirstNonEmpty(row, ['BuildingScore', 'Building Score']) || '';
    const eduAdeqRaw = pickFirstNonEmpty(row, ['EducationalAdequacy', 'Educational Adequacy']) || '';
    const distanceRaw = pickFirstNonEmpty(row, ['DistanceUnderutilizedschools', 'Distance Underutilized Schools', 'Distance to Underutilized']) || '';
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
      addRow('Grades', grades);
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

    // Determine capacity label based on grades string (best-effort)
    let capacityLabel = 'Capacity';
    const gNorm = norm(grades);
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
      const distStr = Number.isFinite(distance) ? `${distance.toFixed(1)} mi` : (distanceRaw ? distanceRaw.toString().trim() : '—');
      const sqftNum = parseNumber(sqftRaw);
      const sqftStr = Number.isFinite(sqftNum) ? fmtInt(sqftNum) : (sqftRaw ? sqftRaw.toString().trim() : '—');

      buildingTiles.innerHTML = [
        kpiTileHtml({ theme: 'purple', label: capSourceLabel || capacityLabel, value: capStr }),
        kpiTileHtml({ theme: 'purple', label: '25-26 Utilization %', value: utilStr }),
        kpiTileHtml({ theme: 'purple', label: 'Available Seats', value: seatsStr }),
        kpiTileHtml({ theme: 'purple', label: 'Building Score', value: bldgScoreStr }),
        kpiTileHtml({ theme: 'purple', label: 'Educational Adequacy', value: eduAdeqStr }),
        kpiTileHtml({ theme: 'purple', label: 'Distance to Underutilized School', value: distStr })
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
      const growthSub = (projEnr != null && Number.isFinite(projEnr)) ? `Proj. 2030: ${fmtInt(projEnr)}` : '';

      enrollmentTiles.innerHTML = [
        kpiTileHtml({ theme: 'green', label: 'Enrollment (2025)', value: enrStr, sub: pkStr ? `${pkStr} • Total: ${totalStr || enrStr}` : (totalStr ? `Total: ${totalStr}` : '') }),
        kpiTileHtml({ theme: 'green', label: 'Attendance Area Enrollment (2024)', value: attAreaStr }),
        kpiTileHtml({ theme: 'green', label: 'Future Enrollment Growth (2030)', value: growthStr, sub: growthSub })
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
    if (heading) heading.textContent = String(name);

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
      const level = pickFirstNonEmpty(r, ['School Level', 'SchoolLevel']);

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
      cards.push(kpiCard({ label: 'School Level', value: level ? String(level) : '', sub: '', barW: null }));

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

    // Ensure compare cards line up even when the "high level" badge rows wrap differently.
    function equalizeCompareCardHeaderHeights(compareGridEl) {
      if (!compareGridEl) return;
      const headers = Array.from(compareGridEl.querySelectorAll('.step1-compare-top'));
      if (headers.length < 2) return;

      // Reset first so shrink/grow recalculates correctly (esp. on resize or different selections)
      headers.forEach(h => { h.style.minHeight = ''; });
      const maxH = headers.reduce((m, h) => Math.max(m, h.getBoundingClientRect().height || 0), 0);
      if (!maxH) return;
      headers.forEach(h => { h.style.minHeight = `${Math.ceil(maxH)}px`; });
    }
    // Expose for resize handler outside this scope
    try { window.equalizeCompareCardHeaderHeights = equalizeCompareCardHeaderHeights; } catch {}

    function buildCompareCard(r) {
      const schoolName = getSchoolName(r) || 'School';

      /** pct = percent change (e.g. -12 or 8). Red scales darker as growth is more negative; green brighter as more positive. */
      function compareEnrollmentGrowthColors(pct) {
        if (!Number.isFinite(pct)) return { bar: '#94a3b8', value: '#64748b' };
        if (Math.abs(pct) < 0.01) return { bar: '#cbd5e1', value: '#475569' };
        if (pct < 0) {
          const t = Math.min(1, -pct / 40);
          const s = Math.round(52 + 46 * t);
          const l = Math.round(74 - 46 * t);
          const c = `hsl(0, ${s}%, ${l}%)`;
          return { bar: c, value: c };
        }
        const t = Math.min(1, pct / 40);
        const s = Math.round(62 + 35 * t);
        const l = Math.round(44 + 20 * t);
        const c = `hsl(148, ${s}%, ${l}%)`;
        return { bar: c, value: c };
      }

      const enrollment = parseNumber(r['Enrollment']);
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
      const distance = parseNumber(r['DistanceUnderutilizedschools']);

      const utilPct = Number.isFinite(effUtil) ? effUtil * 100 : null;
      const seatsComputed = (window.getEffectiveAvailableSeats && window.getEffectiveAvailableSeats(r)) ?? null;
      const totalEnr = Number.isFinite(enrollment) ? enrollment : (Number.isFinite(effEnr) && Number.isFinite(pk) ? effEnr + pk : NaN);
      const enrSub = Number.isFinite(pk) ? `${fmtInt(pk)} PK${Number.isFinite(totalEnr) ? ` • Total: ${fmtInt(totalEnr)}` : ''}` : 'Students';

      const metrics = [];
      if (Number.isFinite(utilPct)) {
        const color = utilPct >= 95 ? '#dc2626' : (utilPct >= 85 ? '#f59e0b' : '#16a34a');
        const utilSubText = (Number.isFinite(effEnr) && Number.isFinite(capacity) && capacity > 0) ? `${fmtInt(effEnr)} / ${fmtInt(capacity)} students` : '';
        metrics.push(metricRow({ label: 'Utilization (25-26)', value: fmtPct(utilPct), sub: utilSubText, barW: utilPct, barC: color }));
      } else {
        metrics.push(metricRow({ label: 'Utilization (25-26)', value: capMissingNote || '', sub: '', barW: null, barC: null }));
      }
      metrics.push(metricRow({ label: 'Enrollment (2025)', value: Number.isFinite(effEnr) ? fmtInt(effEnr) : '', sub: enrSub, barW: null }));
      metrics.push(metricRow({ label: capLabel, value: Number.isFinite(capacity) ? fmtInt(capacity) : capMissingNote, sub: 'Seats', barW: null }));
      metrics.push(metricRow({ label: 'Available Seats', value: Number.isFinite(seatsComputed) ? fmtInt(seatsComputed) : '', sub: '', barW: null }));
      if (Number.isFinite(buildingScore)) {
        const pct = clamp((buildingScore / 10) * 100, 0, 100);
        const color = pct >= 70 ? '#16a34a' : (pct >= 45 ? '#f59e0b' : '#dc2626');
        metrics.push(metricRow({ label: 'Building Score', value: `${buildingScore.toFixed(2)}/10`, sub: '', barW: pct, barC: color }));
      } else {
        metrics.push(metricRow({ label: 'Building Score', value: '', sub: '', barW: null }));
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
        metrics.push(metricRow({ label: 'Attendance Area Enroll. (2024)', value: fmtPct(pct), sub: '', barW: pct, barC: color }));
      } else {
        metrics.push(metricRow({ label: 'Attendance Area Enroll. (2024)', value: '', sub: '', barW: null }));
      }
      if (effGrowth != null && Number.isFinite(effGrowth)) {
        const pct = (effGrowth >= -1 && effGrowth <= 1) ? effGrowth * 100 : effGrowth;
        const { bar: growthBar, value: growthValue } = compareEnrollmentGrowthColors(pct);
        const growthSub = (effProjEnr != null && Number.isFinite(effProjEnr)) ? `Proj. 2030: ${fmtInt(effProjEnr)}` : '';
        metrics.push(metricRow({
          label: 'Future Enrollment Growth (2030)',
          value: fmtPct(pct),
          sub: growthSub,
          barW: clamp(Math.abs(pct), 0, 100),
          barC: growthBar,
          valueColor: growthValue
        }));
      } else {
        const growthSub = (effProjEnr != null && Number.isFinite(effProjEnr)) ? `Proj. 2030: ${fmtInt(effProjEnr)}` : '';
        metrics.push(metricRow({ label: 'Future Enrollment Growth (2030)', value: '', sub: growthSub, barW: null }));
      }
      metrics.push(metricRow({ label: 'Distance to Underutilized', value: Number.isFinite(distance) ? `${distance.toFixed(1)} mi` : '', sub: '', barW: null }));

      return `<div class="step1-card step1-compare-card">
        <div class="step1-compare-top">
          <div class="step1-compare-title">${htmlEscape(schoolName)}</div>
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
      if (heading) heading.textContent = String(name);
      return;
    }

    // Compare mode: render cards side-by-side (primary + any picks from compare dropdowns)
    if (heading) heading.textContent = 'Compare schools';
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
      opt.textContent = name;
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
    return !!key && key !== 'noarticulationarea' && key !== 'no articulation area' && key !== 'n/a';
  }

  function collectArticulationAreasForStep1(rows) {
    const byKey = new Map();
    (rows || []).forEach((r) => {
      const raw = pickFirstNonEmpty(r, ['Articulation Area', 'ArticulationArea', 'Articulation']);
      const key = normalizeArticulationKeyStep1(raw);
      if (!isValidArticulationAreaKey(key)) return;
      const disp = String(raw).trim();
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
      const raw = pickFirstNonEmpty(r, ['Articulation Area', 'ArticulationArea', 'Articulation']);
      return normalizeArticulationKeyStep1(raw) === areaKey;
    });
  }

  function populateStep1ArticulationCompareSelect(rows) {
    const artSel = document.getElementById('step1CompareArticulationSelect');
    if (!artSel) return;
    const cur = artSel.value;
    const areas = collectArticulationAreasForStep1(rows);
    artSel.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'Select an articulation area…';
    artSel.appendChild(ph);
    areas.forEach(({ valueKey, label, count }) => {
      const o = document.createElement('option');
      o.value = valueKey;
      const sc = count === 1 ? '1 school' : `${count} schools`;
      o.textContent = `${label} — ${sc}`;
      artSel.appendChild(o);
    });
    if (cur && Array.from(artSel.options).some((o) => o.value === cur)) artSel.value = cur;
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

  function applyArticulationAreaCompareSelection(areaKey, onRerender) {
    const rows = getDecisionSchoolRows();
    const selectEl = document.getElementById('step1SchoolSelect');
    const compareModeCb = document.getElementById('step1CompareMode');
    if (!rows || !selectEl || !isValidArticulationAreaKey(areaKey)) return;

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
    const list = document.getElementById('step1CompareSelectsList');
    if (list && list.dataset.slotsBuilt === '1') {
      refreshStep1CompareSelectOptions(names);
    }
  }
  try { window.refreshStep1ArticulationDropdown = refreshStep1ArticulationDropdown; } catch {}

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
    try { fitCb.checked = localStorage.getItem(STEP1_LS_FIT) === '1'; } catch {}

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
    const emptyState = document.getElementById('step1SchoolDataEmptyState');
    const card = document.getElementById('step1SchoolDataCard');
    if (emptyState) emptyState.style.display = hasSelection ? 'none' : 'block';
    if (card) card.style.display = hasSelection ? 'block' : 'none';
  }

  function initOnceReady() {
    const select = document.getElementById('step1SchoolSelect');
    const openBtn = document.getElementById('step1OpenSchoolProfileBtn');
    const filterInput = document.getElementById('step1FieldFilter'); // optional (removed from UI)
    const showEmptyCb = document.getElementById('step1ShowEmptyFields'); // optional (removed from UI)
    const compareMode = document.getElementById('step1CompareMode');

    if (!select) return false;

    const rows = getDecisionSchoolRows();
    if (!rows || rows.length === 0) return false;

    const names = Array.from(new Set(rows.map(getSchoolName).filter(Boolean).map(String))).sort((a, b) => a.localeCompare(b));

    function getSelectedRow() {
      const name = select.value;
      if (!name) return null;
      const n = norm(name);
      return rows.find(r => norm(getSchoolName(r)) === n) || null;
    }

    function rerender() {
      const row = getSelectedRow();
      setVisibleState(!!row);
      if (!row) return;
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
        opt.textContent = name;
        select.appendChild(opt);
      });
    }
    ensureStep1CompareSlotsInitialized(names, rerender);
    populateStep1ArticulationCompareSelect(rows);

    const artSel = document.getElementById('step1CompareArticulationSelect');
    if (artSel && !artSel.dataset.bound) {
      artSel.dataset.bound = '1';
      artSel.addEventListener('change', () => {
        const key = artSel.value;
        if (!key) return;
        applyArticulationAreaCompareSelection(key, rerender);
      });
    }

    select.addEventListener('change', () => {
      // Clear filter each time user switches schools (keeps it simple)
      if (filterInput) filterInput.value = '';
      rerender();
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

    if (openBtn) {
      openBtn.addEventListener('click', () => {
        const row = getSelectedRow();
        const name = select.value;
        if (!name || !row) return;
        const uid = (row.UniqueID || row["UniqueID"] || "").toString();
        const url =
          `school-profile.html?school=${encodeURIComponent(name)}` +
          (uid ? `&uid=${encodeURIComponent(uid)}` : "");
        window.open(url, '_blank', 'noopener');
      });
    }

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

  document.addEventListener('DOMContentLoaded', () => {
    // decisionLogic loads async; poll briefly until data is ready.
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (initOnceReady() || tries > 200) { // ~20s max
        clearInterval(timer);
      }
    }, 100);
  });
})();