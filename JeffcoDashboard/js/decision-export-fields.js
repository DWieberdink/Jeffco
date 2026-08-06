/**
 * Stable Decision Data Export column names + legacy/year-specific aliases.
 * Canonical headers carry no survey year; refresh cadence and snapshot years live in DataSourceTracker (date_reflected).
 *
 * Keep in sync with scripts/decision-field-utils.mjs (Node scripts).
 */
(function (global) {
  /** @type {Record<string, string[]>} Aliases per logical field (canonical header first). */
  /** Headers the dashboard expects in 01 Decision Data Export.csv (edit when canonical names change). */
  const DECISION_EXPECTED_COLUMNS = [
    "JeffCoFacilityID",
    "UniqueID",
    "Building Name",
    "Status",
    "Include_Flow_Chart",
    "School Level",
    "Capacity",
    "EducationalCapacity",
    "HistoricalEnrollment",
    "CurrPKEnrollment",
    "CurrEnrollment",
    "ProjEnrollment_PK",
    "ProjEnrollment_Total",
    "ProjEnrollment_KPlus",
    "FCI",
    "EducationalAdequacy",
    "SiteCapacity",
    "SquareFt",
    "BuildingScore",
    "ClassroomEAScore",
    "ClassroomCount",
    "RecentInvestments",
    "AttendanceAreaEnrollment",
    "NonPKAttendanceAreaEnrollment",
    "HighNeedStudents",
    "ROFTSStudentsREceived",
  ];

  const DECISION_FIELD_ALIASES = {
    enrollmentTotal: ["CurrEnrollment", "Enrollment", "Enrollment2026", "Enrollment2025"],
    enrollmentPK: ["CurrPKEnrollment", "PKEnrollment", "PKEnrollment2026", "PKEnrollment2025"],
    enrollmentBaseline: ["HistoricalEnrollment", "EnrollmentHistorical", "EnrollmentBaseline", "2015Enrollment", "2016Enrollment", "Enrollment2015"],
    projPK: ["ProjEnrollment_PK", "2030_PK", "2030 PK"],
    projTotal: ["ProjEnrollment_Total", "2030_Total", "2030 Total"],
    projKPlus: ["ProjEnrollment_KPlus", "2030_K+", "2030 K+"],
  };

  /** Header names to try for a logical field (custom map first, then built-in aliases). */
  function keysForLogicalField(logicalKey) {
    const aliases = DECISION_FIELD_ALIASES[logicalKey];
    if (!aliases) return [];
    const map = global.decisionColumnMap;
    const custom = map && map[logicalKey];
    if (custom && String(custom).trim()) {
      const name = String(custom).trim();
      return [name, ...aliases.filter((k) => k !== name)];
    }
    return aliases.slice();
  }

  /**
   * First non-empty cell for any alias (allows numeric 0).
   * @param {Record<string, unknown>|null|undefined} row
   * @param {keyof typeof DECISION_FIELD_ALIASES} logicalKey
   * @returns {unknown|undefined}
   */
  function pickDecisionRowField(row, logicalKey) {
    const keys = keysForLogicalField(logicalKey);
    if (!row || !keys.length) return undefined;
    for (const k of keys) {
      if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
      const v = row[k];
      if (v === undefined || v === null) continue;
      if (typeof v === "string" && !String(v).trim()) continue;
      return v;
    }
    return undefined;
  }

  /**
   * Whether the parsed header row includes any alias for this logical field.
   * @param {Record<string, unknown>|null|undefined} sample First data row from Papa (object keys = headers).
   * @param {keyof typeof DECISION_FIELD_ALIASES} logicalKey
   */
  function sampleHasDecisionField(sample, logicalKey) {
    const keys = keysForLogicalField(logicalKey);
    if (!sample || !keys.length) return false;
    return keys.some((k) => Object.prototype.hasOwnProperty.call(sample, k));
  }

  /** @param {Record<string, unknown>|null|undefined} row */
  function parseEducationalAdequacy0to1(row) {
    if (!row) return null;
    const raw = row.EducationalAdequacy ?? row["Educational Adequacy"];
    if (raw === undefined || raw === null || raw === "") return null;
    const n = parseFloat(String(raw).replace(/,/g, ""));
    if (!Number.isFinite(n)) return null;
    if (n > 1 && n <= 10) return n / 10;
    if (n > 10) return n / 100;
    return n;
  }

  /**
   * Median Educational Adequacy (0–1) across rows with a valid score.
   * @param {Record<string, unknown>[]} rows
   */
  function medianEducationalAdequacy(rows) {
    const vals = [];
    for (const r of rows || []) {
      const n = parseEducationalAdequacy0to1(r);
      if (n != null) vals.push(n);
    }
    if (!vals.length) return null;
    vals.sort((a, b) => a - b);
    const mid = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
  }

  /**
   * Yes when EA is strictly below the district median; No when at/above; null when EA missing.
   * @param {Record<string, unknown>} row
   * @param {number|Record<string, unknown>[]} medianOrRows
   */
  function below50PctlEaYesNo(row, medianOrRows) {
    const ea = parseEducationalAdequacy0to1(row);
    if (ea == null) return null;
    const median = Array.isArray(medianOrRows)
      ? medianEducationalAdequacy(medianOrRows)
      : medianOrRows;
    if (median == null || !Number.isFinite(median)) return null;
    return ea < median ? "Yes" : "No";
  }

  /**
   * Sets Below50PCTL_EA_Cat on each row from EducationalAdequacy vs district median.
   * @param {Record<string, unknown>[]} rows Rows to annotate
   * @param {Record<string, unknown>[]|number|null} [medianOrSourceRows] Optional full cohort for median, or explicit median
   * @returns {number|null} median used
   */
  const LOGICAL_FIELD_KEYS = new Set(Object.keys(DECISION_FIELD_ALIASES));

  /** User CSV header → canonical column name (from DecisionColumnMap.json). */
  function buildDecisionColumnRenameMap() {
    const out = {};
    const colMap = global.decisionColumnMapColumns;
    if (colMap && typeof colMap === "object") {
      Object.entries(colMap).forEach(([canonical, userHeader]) => {
        const h = userHeader != null ? String(userHeader).trim() : "";
        if (h && h !== canonical) out[canonical] = h;
      });
    }
    const logicalMap = global.decisionColumnMap;
    if (logicalMap && typeof logicalMap === "object") {
      Object.entries(logicalMap).forEach(([logicalKey, userHeader]) => {
        if (!LOGICAL_FIELD_KEYS.has(logicalKey)) return;
        const h = userHeader != null ? String(userHeader).trim() : "";
        if (!h) return;
        const aliases = DECISION_FIELD_ALIASES[logicalKey];
        const canonical = aliases && aliases[0];
        if (canonical && h !== canonical) out[canonical] = h;
      });
    }
    return out;
  }

  /**
   * Copies values from your renamed CSV headers onto canonical keys the dashboard expects.
   * @param {Record<string, unknown>[]} rows
   */
  function applyDecisionColumnMapToRows(rows) {
    const rename = buildDecisionColumnRenameMap();
    const keys = Object.keys(rename);
    if (!keys.length) return;
    for (const row of rows || []) {
      if (!row || typeof row !== "object") continue;
      for (const canonical of keys) {
        const userHeader = rename[canonical];
        if (!userHeader) continue;
        if (Object.prototype.hasOwnProperty.call(row, userHeader)) {
          row[canonical] = row[userHeader];
        }
      }
    }
  }

  /** Apply column map, then compute Below50PCTL_EA_Cat from EducationalAdequacy. */
  function normalizeDecisionExportRows(rows, medianOrSourceRows) {
    applyDecisionColumnMapToRows(rows);
    return enrichDecisionRowsWithBelow50PctlEa(rows, medianOrSourceRows);
  }

  function enrichDecisionRowsWithBelow50PctlEa(rows, medianOrSourceRows) {
    const median = Number.isFinite(medianOrSourceRows)
      ? medianOrSourceRows
      : Array.isArray(medianOrSourceRows)
        ? medianEducationalAdequacy(medianOrSourceRows)
        : medianEducationalAdequacy(rows);
    for (const row of rows || []) {
      const v = below50PctlEaYesNo(row, median);
      if (v != null) row.Below50PCTL_EA_Cat = v;
      else delete row.Below50PCTL_EA_Cat;
    }
    if (typeof global !== "undefined") {
      global.__jeffcoEducationalAdequacyMedian = median;
    }
    return median;
  }

  global.DECISION_EXPECTED_COLUMNS = DECISION_EXPECTED_COLUMNS;
  global.DECISION_FIELD_ALIASES = DECISION_FIELD_ALIASES;
  global.keysForLogicalField = keysForLogicalField;
  global.pickDecisionRowField = pickDecisionRowField;
  global.sampleHasDecisionField = sampleHasDecisionField;
  global.parseEducationalAdequacy0to1 = parseEducationalAdequacy0to1;
  global.medianEducationalAdequacy = medianEducationalAdequacy;
  global.below50PctlEaYesNo = below50PctlEaYesNo;
  global.applyDecisionColumnMapToRows = applyDecisionColumnMapToRows;
  global.normalizeDecisionExportRows = normalizeDecisionExportRows;
  global.enrichDecisionRowsWithBelow50PctlEa = enrichDecisionRowsWithBelow50PctlEa;
})(typeof window !== "undefined" ? window : globalThis);
