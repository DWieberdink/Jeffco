/**
 * Builds the unified UnitCostLibrary.csv:
 *   SystemCategory, Project, Unit, UnitCost, Value  (used by the app — unchanged semantics)
 *   + optional documentation columns from UnitCostLibrary_withvalues.csv when that file exists.
 *
 * UnitCost / Value are always taken from the current canonical rows (first five columns of
 * UnitCostLibrary.csv) so runtime costs stay stable; withvalues supplies scope / range text only.
 *
 * When UnitCostLibrary_withvalues.csv is absent, rewrites the library from the existing unified
 * CSV (first 5 columns per row) so the script stays safe to run in CI without the Excel export.
 *
 * Run from repo root: node scripts/merge-unit-cost-library.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CANON = path.join(ROOT, "UnitCostLibrary.csv");
const WV = path.join(ROOT, "UnitCostLibrary_withvalues.csv");
const OUT = path.join(ROOT, "UnitCostLibrary.csv");

const META_HEADERS = [
  "ScopeAssumption",
  "UpgradeScopeAssumption",
  "SizeAssumptions",
];

const OUT_HEADER = ["SystemCategory", "Project", "Unit", "UnitCost", "Value", ...META_HEADERS];

function norm(s) {
  return (s ?? "").toString().trim();
}

/** RFC4180-style parse (handles quoted fields with commas) */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let i = 0;
  let inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQ = false;
        i++;
        continue;
      }
      cur += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQ = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(cur);
      cur = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

function rowsToObjects(header, dataRows) {
  return dataRows.map((cells) => {
    const o = {};
    header.forEach((h, j) => {
      o[norm(h)] = cells[j] ?? "";
    });
    return o;
  });
}

/** Alternate names in withvalues "Project" column for canonical Project */
const PROJECT_LOOKUP_KEYS = {
  "New multipurpose room": ["new mpr (multi-purpose room)", "new mpr"],
  "Heavily modernize STEM / CTE / specialized labs (MS/HS)": [
    "heavily modernize stem / cte labs (ms/hs)",
    "heavily modernize stem / cte / specialized labs (ms/hs)",
  ],
  "Modernize kitchen": ["heavily modernize kitchen / cafeteria"],
  "Heavily modernize cafeteria": ["heavily modernize kitchen / cafeteria"],
  "Lightly modernize cafeteria": ["lightly modernize kitchen / cafeteria"],
};

function normKey(s) {
  return norm(s)
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function wvMatchesProject(canonicalProject, wvProject) {
  const a = normKey(canonicalProject);
  const b = normKey(wvProject);
  if (a === b) return true;
  const alts = PROJECT_LOOKUP_KEYS[canonicalProject];
  if (alts && alts.some((x) => normKey(x) === b)) return true;
  return false;
}

function unitMatches(wanted, wvNorm, canonicalProject) {
  const w = normKey(wanted);
  const n = normKey(wvNorm);
  if (w === "quantity" && n === "quantity") return true;
  if (w === "sf" && n === "sf") return true;
  if (w === "percentage" && n === "percentage") return true;
  if (w === "acre" && n === "acre") return true;
  /* Row-wise / library uses EA; detailed sheet uses Quantity (per structure, per room, etc.). */
  if ((w === "ea" || w === "each") && n === "quantity") return true;
  if (
    normKey(canonicalProject) === normKey("ADA compliance") &&
    w === "project cost" &&
    n === "percentage"
  ) {
    return true;
  }
  return false;
}

/** When strict unit match fails, pick a single withvalues row for documentation columns. */
function findWithvaluesCandidates(sys, proj, unit, wvObjs) {
  const strict = wvObjs.filter(
    (w) =>
      normKey(w["Project Type"]) === normKey(sys) &&
      wvMatchesProject(proj, w["Project"]) &&
      unitMatches(unit, w["Unit Measure Normalized"], proj)
  );
  if (strict.length) return strict;

  const loose = wvObjs.filter(
    (w) => normKey(w["Project Type"]) === normKey(sys) && wvMatchesProject(proj, w["Project"])
  );
  if (!loose.length) return [];

  const u = normKey(unit);
  const byNorm = (n) => loose.filter((w) => normKey(w["Unit Measure Normalized"]) === n);

  if (u === "quantity") {
    const q = byNorm("quantity");
    if (q.length) return q;
    const sf = byNorm("sf");
    if (sf.length) return sf;
  }
  if (u === "sf") {
    const sf = byNorm("sf");
    if (sf.length) return sf;
  }
  if (u === "ea" || u === "each") {
    const q = byNorm("quantity");
    if (q.length) return q;
    const sf = byNorm("sf");
    if (sf.length) return sf;
  }
  /* Blank unit (e.g. Site specific) or unknown: prefer SF then Quantity for stable notes. */
  if (!u) {
    const sf = byNorm("sf");
    if (sf.length) return sf;
    const q = byNorm("quantity");
    if (q.length) return q;
  }

  return [loose[0]];
}

function escapeField(f) {
  const s = String(f ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvLine(fields) {
  return fields.map(escapeField).join(",");
}

function extractMeta(wv) {
  return [
    norm(wv["Scope Assumption"]),
    norm(wv["Upgrade Scope Assumption"]),
    norm(wv["Size Assumptions"]),
  ];
}

function loadCanonicalFiveColRows() {
  const canText = fs.readFileSync(CANON, "utf8").replace(/^\uFEFF/, "");
  const canRows = parseCsv(canText);
  const canHeader = canRows[0].map(norm);
  const idx = Object.fromEntries(canHeader.map((h, i) => [h, i]));
  const hasExtended = META_HEADERS.every((h) => idx[h] !== undefined);
  const dataRows = canRows.slice(1).filter((r) => r.some((c) => norm(c)));
  const out = [];
  for (const row of dataRows) {
    const sys = norm(row[idx.SystemCategory]);
    const proj = norm(row[idx.Project]);
    const unit = norm(row[idx.Unit]);
    const unitCost = row[idx.UnitCost] ?? "";
    const value = norm(row[idx.Value]) || "0.5";
    if (!sys || !proj) continue;
    const meta = hasExtended
      ? META_HEADERS.map((h) => norm(row[idx[h]]))
      : META_HEADERS.map(() => "");
    out.push({ sys, proj, unit, unitCost, value, meta });
  }
  return { rows: out, hadExtendedMeta: hasExtended };
}

function loadWithvaluesObjects() {
  if (!fs.existsSync(WV)) return null;
  const wvText = fs.readFileSync(WV, "utf8").replace(/^\uFEFF/, "");
  const wvRows = parseCsv(wvText);
  const wvHeader = wvRows[0].map(norm);
  return rowsToObjects(wvHeader, wvRows.slice(1)).filter((o) => norm(o.Project));
}

// --- Main ---
const { rows: canonicalRows, hadExtendedMeta } = loadCanonicalFiveColRows();
if (!canonicalRows.length) {
  console.error("No data rows in", CANON);
  process.exit(1);
}

const wvObjs = loadWithvaluesObjects();
const warnings = [];

const outLines = [csvLine(OUT_HEADER)];

for (const rec of canonicalRows) {
  const { sys, proj, unit, unitCost, value } = rec;
  let meta = [...rec.meta];

  if (wvObjs) {
    const candidates = findWithvaluesCandidates(sys, proj, unit, wvObjs);

    if (candidates.length === 0) {
      warnings.push(`No withvalues row: ${sys} | ${proj} | ${unit}`);
    } else {
      if (candidates.length > 1) {
        warnings.push(`Multiple withvalues rows (using first): ${sys} | ${proj}`);
      }
      meta = extractMeta(candidates[0]);
    }
  } else if (!hadExtendedMeta) {
    warnings.push("No UnitCostLibrary_withvalues.csv and no existing metadata columns — metadata left blank.");
  }

  outLines.push(
    csvLine([sys, proj, unit, unitCost, value, ...meta])
  );
}

fs.writeFileSync(OUT, outLines.join("\n") + "\n", "utf8");
console.log("Wrote", OUT, "data rows:", outLines.length - 1);
if (warnings.length) {
  console.warn("Warnings:", warnings.length);
  warnings.slice(0, 30).forEach((w) => console.warn("  ", w));
  if (warnings.length > 30) console.warn("  ...");
}
