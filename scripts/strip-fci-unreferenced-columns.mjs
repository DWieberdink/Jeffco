/**
 * Removes FCIdeficiencytable.csv columns that script.js buildFciModel() never reads
 * (human / Excel context only). Keeps School Code, System, FCI, Sqft, per-system cost,
 * priority counts/costs.
 *
 * Run: npm run strip:fci-columns
 * Close the CSV in Excel if Windows reports EBUSY.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSV_PATH = path.join(ROOT, "FCIdeficiencytable.csv");
const TMP_PATH = CSV_PATH + ".tmp";
const FALLBACK_PATH = path.join(ROOT, "FCIdeficiencytable.EBUSY-out.csv");

const REMOVE = new Set([
  "School Name",
  "Articulation Area",
  "School Type",
  "Total Cost by School, All Systems",
  "Priority1 % of Total Cost",
  "Priority2 % of Total Cost",
  "Priority3 % of Total Cost",
  "Priority4 % of Total Cost",
]);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQ = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQ = true;
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

function serializeRow(cells) {
  return cells
    .map((f) => {
      const s = f == null ? "" : String(f);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    })
    .join(",");
}

const raw = fs.readFileSync(CSV_PATH, "utf8");
const rows = parseCsv(raw);
if (!rows.length) throw new Error("empty FCI csv");

const header = rows[0].map((h) => (h ?? "").toString().trim());
const keepIdx = header.map((h, i) => (REMOVE.has(h) ? -1 : i)).filter((i) => i >= 0);
const removed = header.filter((h) => REMOVE.has(h));

if (removed.length === 0) {
  console.log("No matching columns to remove (already stripped or header differs).");
  process.exit(0);
}

const out = [];
out.push(serializeRow(keepIdx.map((i) => rows[0][i])));
for (let r = 1; r < rows.length; r++) {
  const row = rows[r] || [];
  out.push(serializeRow(keepIdx.map((i) => row[i] ?? "")));
}

const body = out.join("\n") + "\n";
fs.writeFileSync(TMP_PATH, body, "utf8");
try {
  fs.copyFileSync(TMP_PATH, CSV_PATH);
  fs.unlinkSync(TMP_PATH);
  console.log(`Updated ${CSV_PATH}; removed ${removed.length} columns:`, removed.join(", "));
} catch (err) {
  if (err && (err.code === "EBUSY" || err.code === "EPERM")) {
    fs.copyFileSync(TMP_PATH, FALLBACK_PATH);
    fs.unlinkSync(TMP_PATH);
    console.warn(`Could not overwrite ${CSV_PATH}. Wrote ${FALLBACK_PATH}`);
    process.exit(0);
  }
  try {
    fs.unlinkSync(TMP_PATH);
  } catch (_) {}
  throw err;
}
