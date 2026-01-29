/* strip-project-columns.js
   Removes specified columns from the projects CSV, preserving all rows.

   Usage:
     node scripts/strip-project-columns.js
*/

const fs = require("node:fs");

const INPUT_PATH = "JeffCoProjectListAllSchools_rowwise.csv";
const COLUMNS_TO_REMOVE = new Set([
  "AssetID",
  "InstallYear",
  "ExpectedUsefulLife",
  "OverrideEOLYear",
  "OverrideReason",
  "Quantity",
  "Criticality",
]);

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

const original = fs.readFileSync(INPUT_PATH, "utf8");
const rows = parseCSV(original);
if (!rows.length) {
  console.error(`No rows found in ${INPUT_PATH}`);
  process.exit(1);
}

const header = rows[0];
const keepIdx = [];
const newHeader = [];

header.forEach((h, idx) => {
  const name = (h ?? "").toString();
  if (!COLUMNS_TO_REMOVE.has(name)) {
    keepIdx.push(idx);
    newHeader.push(name);
  }
});

const out = [];
out.push(newHeader.map(csvEscape).join(","));

for (let r = 1; r < rows.length; r++) {
  const row = rows[r] || [];
  const kept = keepIdx.map((i) => (row[i] ?? ""));
  out.push(kept.map(csvEscape).join(","));
}

fs.writeFileSync(INPUT_PATH, out.join("\n"), "utf8");
console.log(`Wrote ${INPUT_PATH}: removed ${COLUMNS_TO_REMOVE.size} columns; kept ${newHeader.length} columns; rows=${rows.length - 1}.`);

