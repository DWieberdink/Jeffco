/* generate-unitcost-library.js
   - Reads JeffCoProjectDataTemplate.csv
   - Produces a de-duplicated UnitCost library CSV to stdout:
       SystemCategory,Project,Unit,UnitCost
   - For duplicate keys (SystemCategory + Project) with multiple UnitCost values,
     chooses the most common value and prints conflicts to stderr.
*/

const fs = require("node:fs");

const INPUT_PATH = "JeffCoProjectListAllSchools_rowwise.csv";

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
        // Escaped quote ("")
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

  // Last field/row (if any)
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function norm(v) {
  return (v ?? "").toString().trim();
}

function pickMode(counts) {
  let best = "";
  let bestN = 0;
  for (const [k, n] of counts.entries()) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

function csvEscape(v) {
  const s = (v ?? "").toString();
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const text = fs.readFileSync(INPUT_PATH, "utf8");
const rows = parseCSV(text);
const header = rows[0] || [];

const idx = {};
header.forEach((h, i) => {
  idx[h] = i;
});

const requiredCols = ["SystemCategory", "AssetType", "Unit", "UnitCost"];
for (const c of requiredCols) {
  if (idx[c] == null) {
    console.error(`Missing required column: ${c}`);
    process.exit(1);
  }
}

// key = SystemCategory||AssetType
const byKey = new Map();

for (let r = 1; r < rows.length; r++) {
  const row = rows[r];
  const sys = norm(row[idx.SystemCategory]);
  const proj = norm(row[idx.AssetType]);
  if (!sys || !proj) continue;

  const unit = norm(row[idx.Unit]);
  const uc = norm(row[idx.UnitCost]);
  const key = `${sys}||${proj}`;

  if (!byKey.has(key)) {
    byKey.set(key, {
      sys,
      proj,
      unitCounts: new Map(),
      unitCostCounts: new Map(),
    });
  }

  const rec = byKey.get(key);
  if (unit) rec.unitCounts.set(unit, (rec.unitCounts.get(unit) || 0) + 1);
  if (uc) rec.unitCostCounts.set(uc, (rec.unitCostCounts.get(uc) || 0) + 1);
}

const keys = [...byKey.keys()].sort((a, b) =>
  a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }),
);

const outLines = [];
outLines.push(["SystemCategory", "Project", "Unit", "UnitCost"].join(","));

const conflicts = [];
let emittedRows = 0;

for (const k of keys) {
  const rec = byKey.get(k);
  const unit = pickMode(rec.unitCounts);
  const uc = pickMode(rec.unitCostCounts);

  const uniqueCosts = [...rec.unitCostCounts.keys()];
  if (uniqueCosts.length > 1) {
    conflicts.push({ sys: rec.sys, proj: rec.proj, values: uniqueCosts });
  }

  // Skip rows with no unit cost; this library is meant to store only actual defaults.
  if (!uc) continue;

  outLines.push(
    [csvEscape(rec.sys), csvEscape(rec.proj), csvEscape(unit), csvEscape(uc)].join(","),
  );
  emittedRows += 1;
}

process.stdout.write(outLines.join("\n"));

console.error(`\nINFO: Emitted ${emittedRows} library rows from ${byKey.size} unique (SystemCategory+Project) keys.`);

if (conflicts.length) {
  console.error(
    `\nCONFLICTS: ${conflicts.length} keys have multiple UnitCost values (showing up to 50).`,
  );
  conflicts.slice(0, 50).forEach((c) => {
    console.error(`- ${c.sys} | ${c.proj}: ${c.values.join(" ; ")}`);
  });
  if (conflicts.length > 50) console.error(`...and ${conflicts.length - 50} more`);
}

