/* debug-pivot-column.js
   Quick sanity check: prints a specific pivot column value for a given school.

   Usage:
     node scripts/debug-pivot-column.js "Bear Creek HS" "Front of school branding, landscape upgrades UnitValue"
*/

const fs = require("node:fs");

const filePath = "JeffCoProjectListAllSchools.csv";
const schoolName = process.argv[2];
const columnName = process.argv[3];

if (!schoolName || !columnName) {
  console.error('Usage: node scripts/debug-pivot-column.js "SchoolName" "ColumnName"');
  process.exit(1);
}

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

const text = fs.readFileSync(filePath, "utf8");
const rows = parseCSV(text);
const header = rows[0] || [];
const colIdx = header.indexOf(columnName);
const nameIdx = header.indexOf("SchoolName");

if (colIdx < 0) {
  console.error("Column not found. Closest matches:");
  header
    .filter((h) => (h || "").toLowerCase().includes(columnName.split(" ")[0].toLowerCase()))
    .slice(0, 20)
    .forEach((h) => console.error(" -", h));
  process.exit(2);
}
if (nameIdx < 0) {
  console.error("SchoolName column not found.");
  process.exit(3);
}

const row = rows.find((r) => (r[nameIdx] || "").trim() === schoolName);
if (!row) {
  console.error(`SchoolName "${schoolName}" not found.`);
  process.exit(4);
}

console.log("School:", schoolName);
console.log("Column:", columnName);
console.log("Value:", row[colIdx] ?? "");

