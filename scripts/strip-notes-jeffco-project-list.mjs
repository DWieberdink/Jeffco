/**
 * Removes the Notes column from JeffCoProjectListAllSchools.csv (in place).
 * Run: node scripts/strip-notes-jeffco-project-list.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSV_PATH = path.join(ROOT, "JeffCoProjectListAllSchools.csv");
const TMP_PATH = CSV_PATH + ".tmp";
const FALLBACK_PATH = path.join(ROOT, "JeffCoProjectListAllSchools.EBUSY-out.csv");
const CANONICAL_NAME = "JeffCoProjectListAllSchools.csv";
const COL = "Notes";

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
      rows.push(row);
      row = [];
      field = "";
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

const raw = fs.readFileSync(CSV_PATH, "utf8");
const rows = parseCSV(raw);
if (!rows.length) throw new Error("empty csv");

const header = rows[0].map((h) => (h ?? "").toString().trim());
const idx = header.indexOf(COL);
if (idx === -1) {
  console.log(`${CSV_PATH}: no "${COL}" column — nothing to do.`);
  process.exit(0);
}

const keepIdx = header.map((_, i) => i).filter((i) => i !== idx);
const newHeader = keepIdx.map((i) => rows[0][i]);
while (newHeader.length && String(newHeader[newHeader.length - 1] ?? "").trim() === "") {
  newHeader.pop();
  keepIdx.pop();
}
const out = [newHeader.map(csvEscape).join(",")];
for (let r = 1; r < rows.length; r++) {
  const row = rows[r] || [];
  out.push(keepIdx.map((i) => csvEscape(row[i] ?? "")).join(","));
}

fs.writeFileSync(TMP_PATH, out.join("\n") + "\n", "utf8");
try {
  fs.copyFileSync(TMP_PATH, CSV_PATH);
  fs.unlinkSync(TMP_PATH);
  console.log(`Removed column "${COL}" (index ${idx}). ${rows.length - 1} data rows, ${newHeader.length} columns. Updated: ${CSV_PATH}`);
} catch (err) {
  if (err && (err.code === "EBUSY" || err.code === "EPERM")) {
    fs.copyFileSync(TMP_PATH, FALLBACK_PATH);
    fs.unlinkSync(TMP_PATH);
    console.warn(
      `Could not overwrite ${CSV_PATH} (file open elsewhere). Wrote:\n  ${FALLBACK_PATH}\nClose the CSV, then replace ${CANONICAL_NAME} with that file.`
    );
    process.exit(0);
  }
  try {
    fs.unlinkSync(TMP_PATH);
  } catch (_) {}
  throw err;
}
