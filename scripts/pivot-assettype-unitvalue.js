/* pivot-assettype-unitvalue.js
   Creates a pivoted CSV where each AssetType becomes two columns:
     - "<AssetType> score" (optional; from ConditionScore if column exists in input)
     - "<AssetType> UnitValue" (from UnitValue)

   Input:  JeffCoProjectListAllSchools.csv
   Output: JeffCoProjectListAllSchools_pivot_UnitValue.csv

   Drops columns: SystemCategory, ConditionSource, Unit, ReplacementCost, Notes
   Keeps identifiers: UniqueID, SchoolName
*/

const fs = require("node:fs");

const INPUT_PATH = "JeffCoProjectListAllSchools_rowwise.csv";
// Dashboard-facing file name (pivoted)
// Note: we write to a temp file and then rename to avoid issues when the CSV is open in Excel.
const OUTPUT_PATH = "JeffCoProjectListAllSchools.csv";
const OUTPUT_TMP_PATH = "JeffCoProjectListAllSchools.csv.tmp";
const UNITCOST_LIBRARY_PATH = "UnitCostLibrary.csv";

// Minimal CSV parser supporting quotes + embedded commas/newlines.
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
  // Match school-profile.js normalization (NBSP + unicode dashes)
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

/** Rowwise CSV may use short AssetType for paired spaces (matches school-profile.js). */
const PAIRED_MODERNIZE_ASSET_SHORT = [
  { short: "Modernize admin", heavy: "Heavily modernize admin", light: "Lightly modernize admin" },
  { short: "Modernize classrooms", heavy: "Heavily modernize classrooms", light: "Lightly modernize classrooms" },
  { short: "Modernize gym / assembly space", heavy: "Heavily modernize gym / assembly space", light: "Lightly modernize gym / assembly space" },
  { short: "Modernize cafeteria", heavy: "Heavily modernize cafeteria", light: "Lightly modernize cafeteria" },
  { short: "Modernize multipurpose room", heavy: "Heavily modernize multipurpose room", light: "Lightly modernize multipurpose room" },
];

function expandRowwiseAssetTypePks(assetTypeNorm) {
  const pkOne = normProjectKey(assetTypeNorm);
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

function loadUnitCostLibraryProjects() {
  if (!fs.existsSync(UNITCOST_LIBRARY_PATH)) return [];
  const libText = fs.readFileSync(UNITCOST_LIBRARY_PATH, "utf8");
  const libRows = parseCSV(libText);
  const libHeader = (libRows[0] || []).map((h) => norm(h));
  const libIdx = Object.fromEntries(libHeader.map((h, i) => [h, i]));
  const out = [];
  const seen = new Set();
  for (let r = 1; r < libRows.length; r++) {
    const row = libRows[r] || [];
    const sys = norm(row[libIdx.SystemCategory]);
    const proj = norm(row[libIdx.Project]);
    if (!sys || !proj) continue;
    const pk = normProjectKey(proj);
    if (!pk || seen.has(pk)) continue;
    seen.add(pk);
    out.push({ pk, systemCategory: sys, project: proj });
  }
  return out;
}

const libraryProjects = loadUnitCostLibraryProjects();
if (!libraryProjects.length) {
  throw new Error(`UnitCostLibrary.csv not found or empty: ${UNITCOST_LIBRARY_PATH}`);
}

const text = fs.readFileSync(INPUT_PATH, "utf8");
const rows = parseCSV(text);
if (!rows.length) throw new Error(`No rows in ${INPUT_PATH}`);

const header = rows[0].map((h) => norm(h));
const idx = Object.fromEntries(header.map((h, i) => [h, i]));

const required = ["UniqueID", "SchoolName", "AssetType", "UnitValue"];
for (const c of required) {
  if (idx[c] == null) throw new Error(`Missing required column "${c}" in ${INPUT_PATH}`);
}

// Build: schoolKey -> projectKey -> {score, unitValue}
const bySchoolProject = new Map();
const dataOnlyProjectKeys = new Set();

for (let r = 1; r < rows.length; r++) {
  const row = rows[r] || [];
  const uid = norm(row[idx.UniqueID]);
  const school = norm(row[idx.SchoolName]);
  const schoolKey = `${uid}||${school}`;
  const assetType = norm(row[idx.AssetType]);
  if (!school || !assetType) continue;

  const pks = expandRowwiseAssetTypePks(assetType);
  if (!pks.length) continue;

  const unitValue = norm(row[idx.UnitValue]);
  const score = idx.ConditionScore != null ? norm(row[idx.ConditionScore]) : "";

  for (let pi = 0; pi < pks.length; pi++) {
    const pk = pks[pi];
    if (!pk) continue;
    dataOnlyProjectKeys.add(pk);

    if (!bySchoolProject.has(schoolKey)) bySchoolProject.set(schoolKey, new Map());
    const m = bySchoolProject.get(schoolKey);
    if (!m.has(pk)) m.set(pk, { score: "", unitValue: "" });
    const rec = m.get(pk);
    if (!rec.unitValue && unitValue) rec.unitValue = unitValue;
    if (!rec.score && score) rec.score = score;
  }
}

// One row per school
const schools = Array.from(bySchoolProject.keys())
  .map((k) => {
    const [uid, school] = k.split("||");
    return { uid: uid || "", school: school || "" };
  })
  .sort((a, b) => a.school.localeCompare(b.school, undefined, { sensitivity: "base", numeric: true }));

// Output header follows UnitCostLibrary.csv order, using canonical Project strings.
const outHeader = [
  "UniqueID",
  "SchoolName",
  ...libraryProjects.flatMap((p) => [`${p.project} score`, `${p.project} UnitValue`]),
];
const outLines = [];
outLines.push(outHeader.map(csvEscape).join(","));

for (const s of schools) {
  const line = [];
  line.push(s.uid);
  line.push(s.school);
  const m = bySchoolProject.get(`${s.uid}||${s.school}`) || new Map();
  for (const p of libraryProjects) {
    const rec = m.get(p.pk);
    line.push(rec?.score ?? "");
    line.push(rec?.unitValue ?? "");
  }
  outLines.push(line.map(csvEscape).join(","));
}

// Diagnostics: projects present in data but not in the library
const libKeys = new Set(libraryProjects.map((p) => p.pk));
const notInLib = Array.from(dataOnlyProjectKeys).filter((k) => !libKeys.has(k));
if (notInLib.length) {
  console.warn(
    `WARN: ${notInLib.length} AssetType values exist in row-wise data but not in UnitCostLibrary.csv; they will not appear in the pivot. First 30:`,
    notInLib.slice(0, 30)
  );
}

fs.writeFileSync(OUTPUT_TMP_PATH, outLines.join("\n"), "utf8");
try {
  // Replace in a single rename step
  if (fs.existsSync(OUTPUT_PATH)) fs.unlinkSync(OUTPUT_PATH);
  fs.renameSync(OUTPUT_TMP_PATH, OUTPUT_PATH);
  console.log(`Wrote ${OUTPUT_PATH}: schools=${schools.length}, projects=${libraryProjects.length}.`);
} catch (e) {
  console.warn(`Wrote ${OUTPUT_TMP_PATH} but could not replace ${OUTPUT_PATH} (likely open/locked). Close the file and rerun the script.`);
  throw e;
}
// Conflicts are already resolved by "first non-empty wins" in bySchoolProject.

