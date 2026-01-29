/* simulate-profile-mapping.js
   Simulates the school-profile.js mapping for one school:
   - reads UnitCostLibrary.csv to build pk list
   - reads JeffCoProjectListAllSchools.csv pivot row for SchoolName
   - builds scoreByPk/unitValueByPk from pivot headers
   - prints a few sample projects to confirm mapping

   Usage:
     node scripts/simulate-profile-mapping.js "Bear Creek HS"
*/

const fs = require("node:fs");

const schoolName = process.argv[2] || "Bear Creek HS";

const PIVOT_PATH = "JeffCoProjectListAllSchools.csv";
const LIB_PATH = "UnitCostLibrary.csv";

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

function buildPivotValueMaps(pivotObj) {
  const scoreByPk = new Map();
  const unitValueByPk = new Map();
  Object.keys(pivotObj).forEach((k) => {
    const mScore = k.match(/^(.*)\s+score\s*$/i);
    const mUv = k.match(/^(.*)\s+unit\s*value\s*$/i) || k.match(/^(.*)\s+unitvalue\s*$/i);
    if (mScore) {
      const pk = normProjectKey((mScore[1] || "").trim());
      if (pk && !scoreByPk.has(pk)) scoreByPk.set(pk, pivotObj[k]);
    } else if (mUv) {
      const pk = normProjectKey((mUv[1] || "").trim());
      if (pk && !unitValueByPk.has(pk)) unitValueByPk.set(pk, pivotObj[k]);
    }
  });
  return { scoreByPk, unitValueByPk };
}

// Load library projects/pks
const libRows = parseCSV(fs.readFileSync(LIB_PATH, "utf8"));
const libHeader = libRows[0] || [];
const li = Object.fromEntries(libHeader.map((h, i) => [h, i]));
const libProjects = [];
for (let r = 1; r < libRows.length; r++) {
  const row = libRows[r] || [];
  const sys = norm(row[li.SystemCategory]);
  const proj = norm(row[li.Project]);
  if (!sys || !proj) continue;
  libProjects.push({ sys, proj, pk: normProjectKey(proj) });
}

// Load pivot row
const pivotRows = parseCSV(fs.readFileSync(PIVOT_PATH, "utf8"));
const header = pivotRows[0] || [];
const idxName = header.indexOf("SchoolName");
if (idxName < 0) throw new Error("SchoolName column missing in pivot");
const rowArr = pivotRows.find((r) => norm(r[idxName]) === norm(schoolName));
if (!rowArr) throw new Error(`SchoolName not found: ${schoolName}`);
const pivotObj = {};
header.forEach((h, i) => {
  pivotObj[h] = rowArr[i] ?? "";
});

const { scoreByPk, unitValueByPk } = buildPivotValueMaps(pivotObj);

console.log("School:", schoolName);
console.log("Pivot keys:", Object.keys(pivotObj).length);
console.log("scoreByPk:", scoreByPk.size, "unitValueByPk:", unitValueByPk.size);

// Print a few checks
const checks = [
  "ADA compliance",
  "Hazmat remediation",
  "Demolition",
  "Front of school branding, landscape upgrades",
];

checks.forEach((p) => {
  const pk = normProjectKey(p);
  console.log(`- ${p}`);
  console.log("  pk:", pk);
  console.log("  score:", norm(scoreByPk.get(pk)));
  console.log("  unitValue:", norm(unitValueByPk.get(pk)));
});

