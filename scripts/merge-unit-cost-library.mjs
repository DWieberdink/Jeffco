/**
 * Merges UnitCostLibrary_withvalues.csv (detailed cost study) into the canonical
 * UnitCostLibrary.csv shape: SystemCategory,Project,Unit,UnitCost,Value
 *
 * UnitCost is taken from Direct Unit Cost $ Range (High) only (not ACF / composite totals).
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

function parseMoney(s) {
  const t = norm(s);
  if (!t || /#value/i.test(t)) return null;
  if (/^no idea/i.test(t)) return null;
  if (/^owner cost/i.test(t)) return null;
  if (/^cte labs vary/i.test(t)) return null;
  if (/^all new es/i.test(t)) return null;
  if (/^gym \$/i.test(t) && /locker room/i.test(t)) return null;
  if (/^cafeteria \$/i.test(t) && /kitchen \$/i.test(t)) return null;
  if (/^[\d.]+%$/.test(t.replace(/\s/g, ""))) return null;
  const cleaned = t.replace(/[\$,]/g, "").replace(/\s+/g, " ").trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
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
  "Heavily modernize STEM / CTE / specialized labs (MS/HS)": ["heavily modernize stem / cte labs (ms/hs)"],
  "Heavily modernize STEM/specialized labs (ES)": ["heavily modernize stem labs (es)"],
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
  // Canonical "Project cost" (ADA) aligns with withvalues row Unit Measure Normalized = Percentage.
  if (
    normKey(canonicalProject) === normKey("ADA compliance") &&
    w === "project cost" &&
    n === "percentage"
  ) {
    return true;
  }
  return false;
}

/** Project list unit cost: Direct Unit Cost $ Range (High) only (no ACF / rolled-up totals). */
function extractCost(wv, _unitWanted) {
  return parseMoney(wv["Direct Unit Cost $ Range (High)"]);
}

function sfSanity(project, cost, oldCost) {
  if (cost === null) return oldCost;
  const p = normKey(project);
  const highOk =
    p.includes("new construction") ||
    p.includes("gut & major") ||
    p.includes("new auditorium") ||
    p.includes("new mpr") ||
    p.includes("multipurpose room") ||
    p.includes("playground replacement") ||
    p.includes("heavily modernize") ||
    p.includes("lightly modernize") ||
    p.includes("new cafeteria") ||
    p.includes("new gym");
  if (!highOk && cost > 1500) return oldCost;
  if (cost < 0.01) return oldCost;
  return cost;
}

function formatCost(num, unit) {
  if (num === null || num === undefined) return "";
  if (!Number.isFinite(num)) return "";
  const rounded = Math.abs(num - Math.round(num)) < 1e-6 ? String(Math.round(num)) : String(Math.round(num * 100) / 100);
  return rounded;
}

// --- Load canonical template (first row = header) ---
const canText = fs.readFileSync(CANON, "utf8").replace(/^\uFEFF/, "");
const canRows = parseCsv(canText);
const canHeader = canRows[0].map(norm);
if (canHeader.join(",") !== "SystemCategory,Project,Unit,UnitCost,Value") {
  console.warn("Unexpected canonical header:", canHeader);
}
const canonical = canRows.slice(1).filter((r) => r.some((c) => norm(c)));

// --- Load withvalues ---
const wvText = fs.readFileSync(WV, "utf8").replace(/^\uFEFF/, "");
const wvRows = parseCsv(wvText);
const wvHeader = wvRows[0].map(norm);
const wvObjs = rowsToObjects(wvHeader, wvRows.slice(1)).filter((o) => norm(o.Project));

const outLines = ["SystemCategory,Project,Unit,UnitCost,Value"];
const warnings = [];

for (const cells of canonical) {
  const sys = norm(cells[0]);
  const proj = norm(cells[1]);
  const unit = norm(cells[2]);
  const oldCostRaw = norm(cells[3]);
  const value = norm(cells[4]) || "0.5";
  const oldNum = parseMoney(oldCostRaw);

  if (!sys || !proj) continue;

  let costNum = null;

  const candidates = wvObjs.filter(
    (w) =>
      normKey(w["Project Type"]) === normKey(sys) &&
      wvMatchesProject(proj, w["Project"]) &&
      unitMatches(unit, w["Unit Measure Normalized"], proj)
  );

  if (candidates.length === 0) {
    warnings.push(`No withvalues row: ${sys} | ${proj} | ${unit}`);
  } else {
    if (candidates.length > 1) {
      warnings.push(`Multiple withvalues rows (using first SF/Quantity match): ${sys} | ${proj}`);
    }
    const wv = candidates[0];
    costNum = extractCost(wv, unit);
    if (norm(unit).toLowerCase() === "sf") {
      costNum = sfSanity(proj, costNum, oldNum);
    }
    // ADA: Direct Unit Cost $ Range (High) is 3% of project cost (not a $/unit figure).
    if (
      proj.toLowerCase().includes("ada") &&
      (norm(unit).toLowerCase() === "percentage" || normKey(unit) === "project cost")
    ) {
      const high = norm(wv["Direct Unit Cost $ Range (High)"]);
      const t = high.replace(/\s/g, "");
      const m = t.match(/^([\d.]+)%$/);
      if (m) {
        outLines.push(csvLine([sys, proj, unit, `${m[1]}%`, value]));
        continue;
      }
    }
  }

  if (costNum === null || !Number.isFinite(costNum)) {
    costNum = oldNum;
    if (oldCostRaw && !parseMoney(oldCostRaw)) {
      // keep non-numeric old string e.g. "$25 "
      outLines.push(csvLine([sys, proj, unit, oldCostRaw, value]));
      continue;
    }
  }

  const costStr = costNum !== null && Number.isFinite(costNum) ? formatCost(costNum, unit) : "";
  outLines.push(csvLine([sys, proj, unit, costStr, value]));
}

function csvLine(fields) {
  return fields.map(escapeField).join(",");
}

function escapeField(f) {
  const s = String(f ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

fs.writeFileSync(OUT, outLines.join("\n") + "\n", "utf8");
console.log("Wrote", OUT, "rows:", outLines.length - 1);
if (warnings.length) {
  console.warn("Warnings:", warnings.length);
  warnings.slice(0, 25).forEach((w) => console.warn("  ", w));
  if (warnings.length > 25) console.warn("  ...");
}
