/* reorder-pivot-by-library.js
   Rewrites the pivot file so its columns follow UnitCostLibrary.csv exactly.
   - Keeps: UniqueID, SchoolName
   - Outputs only library projects (no uncategorized extras)
   - Column order: "<Project> score", "<Project> UnitValue" in UnitCostLibrary order
   - Writes in-place to JeffCoProjectListAllSchools.csv (safe temp + rename)
*/

const fs = require("node:fs");

const PIVOT_PATH = "JeffCoProjectListAllSchools.csv";
const PIVOT_TMP_PATH = "JeffCoProjectListAllSchools.csv.tmp";
const UNITCOST_LIBRARY_PATH = "UnitCostLibrary.csv";

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (c === "\r") {
      i += 1;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvEscape(v) {
  const s = (v ?? "").toString();
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function norm(v) {
  return (v ?? "").toString().trim();
}

function normKeyLoose(s) {
  return norm(s)
    .replace(/\u00A0/g, " ")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normProjectKey(s) {
  return normKeyLoose(s).replace(/\s*\/\s*/g, "/");
}

function loadLibraryProjects() {
  const text = fs.readFileSync(UNITCOST_LIBRARY_PATH, "utf8");
  const rows = parseCSV(text);
  const header = (rows[0] || []).map((h) => norm(h));
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const out = [];
  const seen = new Set();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const proj = norm(row[idx.Project]);
    const sys = norm(row[idx.SystemCategory]);
    if (!proj || !sys) continue;
    const pk = normProjectKey(proj);
    if (!pk || seen.has(pk)) continue;
    seen.add(pk);
    out.push({ project: proj, pk });
  }
  return out;
}

const libraryProjects = loadLibraryProjects();
if (!libraryProjects.length) {
  console.error("No projects found in UnitCostLibrary.csv");
  process.exit(1);
}

const pivotText = fs.readFileSync(PIVOT_PATH, "utf8");
const pivotRows = parseCSV(pivotText);
if (!pivotRows.length) {
  console.error(`No rows in ${PIVOT_PATH}`);
  process.exit(1);
}

const pivotHeader = pivotRows[0].map((h) => norm(h));
const pivotIdx = Object.fromEntries(pivotHeader.map((h, i) => [h, i]));

if (pivotIdx.UniqueID == null || pivotIdx.SchoolName == null) {
  console.error("Pivot file missing UniqueID and/or SchoolName columns.");
  process.exit(1);
}

// Build lookup from normalized project key -> { scoreColName, unitValueColName }
const SUFFIX_UV = " UnitValue";
const SUFFIX_SCORE = " score";
const headerByPk = new Map();

pivotHeader.forEach((h) => {
  if (h === "UniqueID" || h === "SchoolName") return;
  if (h.endsWith(SUFFIX_UV)) {
    const proj = h.slice(0, -SUFFIX_UV.length).trim();
    const pk = normProjectKey(proj);
    if (!pk) return;
    if (!headerByPk.has(pk)) headerByPk.set(pk, {});
    headerByPk.get(pk).unitValue = h;
  } else if (h.endsWith(SUFFIX_SCORE)) {
    const proj = h.slice(0, -SUFFIX_SCORE.length).trim();
    const pk = normProjectKey(proj);
    if (!pk) return;
    if (!headerByPk.has(pk)) headerByPk.set(pk, {});
    headerByPk.get(pk).score = h;
  }
});

const outHeader = [
  "UniqueID",
  "SchoolName",
  ...libraryProjects.flatMap((p) => [`${p.project} score`, `${p.project} UnitValue`]),
];

const outLines = [];
outLines.push(outHeader.map(csvEscape).join(","));

let missingCols = 0;
for (let r = 1; r < pivotRows.length; r++) {
  const row = pivotRows[r] || [];
  const out = [];
  out.push(row[pivotIdx.UniqueID] ?? "");
  out.push(row[pivotIdx.SchoolName] ?? "");

  for (const p of libraryProjects) {
    const found = headerByPk.get(p.pk) || {};
    const scoreCol = found.score;
    const uvCol = found.unitValue;
    if (!scoreCol && !uvCol) missingCols += 1;
    out.push(scoreCol ? (row[pivotIdx[scoreCol]] ?? "") : "");
    out.push(uvCol ? (row[pivotIdx[uvCol]] ?? "") : "");
  }

  outLines.push(out.map(csvEscape).join(","));
}

fs.writeFileSync(PIVOT_TMP_PATH, outLines.join("\n"), "utf8");
try {
  if (fs.existsSync(PIVOT_PATH)) fs.unlinkSync(PIVOT_PATH);
  fs.renameSync(PIVOT_TMP_PATH, PIVOT_PATH);
} catch (e) {
  console.warn(
    `Wrote ${PIVOT_TMP_PATH} but could not replace ${PIVOT_PATH} (likely open/locked). Close it and rerun this script.`,
  );
  throw e;
}

// Diagnostics
const libKeySet = new Set(libraryProjects.map((p) => p.pk));
const extra = [];
for (const pk of headerByPk.keys()) {
  if (!libKeySet.has(pk)) extra.push(pk);
}
if (extra.length) console.warn(`WARN: ${extra.length} project columns existed in pivot but not in UnitCostLibrary; they were dropped.`);
console.log(`Rewrote ${PIVOT_PATH} using ${libraryProjects.length} library projects.`);

