/**
 * Reorders Decision Data Export.csv columns (header-name safe; Papa uses names, not order).
 * Matches data-viewer "Suggested column order" for decision_export.
 *
 * Run: npm run reorder:decision-export
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSV_PATH = path.join(ROOT, "Decision Data Export.csv");
const TMP_PATH = CSV_PATH + ".tmp";
const FALLBACK_PATH = path.join(ROOT, "Decision Data Export.EBUSY-out.csv");

/** Logical order (trimmed names must match header cells after trim). */
const COLUMN_ORDER = [
  "UniqueID",
  "Building Name",
  "Status",
  "Include_Flow_Chart",
  "School Level",
  "Capacity",
  "EducationalCapacity",
  "PKEnrollment2025",
  "Enrollment2025",
  "2030_PK",
  "2030_Total",
  "EducationalAdequacy",
  "Below50PCTL_EA_Cat",
  "SiteCapacity",
  "SquareFt",
  "BuildingScore",
  "ClassroomEAScore",
  "ClassroomCount",
  "RecentInvestments",
  "AttendanceAreaEnrollment",
  "NonPKAttendanceAreaEnrollment",
  "HighNeedStudents",
  "ROFTSStudentsREceived",
  "2015Enrollment",
  "10 Year Percent Change 2015-2025",
];

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

function main() {
  const raw = fs.readFileSync(CSV_PATH, "utf8");
  const rows = parseCsv(raw);
  if (!rows.length) throw new Error("empty csv");

  const rawHeader = rows[0].map((h) => String(h));
  const trimToIdx = new Map();
  rawHeader.forEach((h, i) => {
    const t = h.trim();
    if (t && !trimToIdx.has(t)) trimToIdx.set(t, i);
  });

  const missing = COLUMN_ORDER.filter((name) => !trimToIdx.has(name));
  if (missing.length) {
    throw new Error(`CSV missing expected columns: ${missing.join(", ")}`);
  }

  const orderIdx = COLUMN_ORDER.map((name) => trimToIdx.get(name));
  const used = new Set(orderIdx);
  const extras = rawHeader.map((_, i) => i).filter((i) => !used.has(i));
  if (extras.length) {
    console.warn("Appending columns not in COLUMN_ORDER:", extras.map((i) => rawHeader[i].trim()).join(", "));
  }

  const newHeader = [...orderIdx.map((i) => rawHeader[i]), ...extras.map((i) => rawHeader[i])];
  const out = [serializeRow(newHeader)];

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r] || [];
    const pad = Math.max(0, rawHeader.length - cells.length);
    const row = cells.concat(Array(pad).fill(""));
    const next = [...orderIdx.map((i) => row[i] ?? ""), ...extras.map((i) => row[i] ?? "")];
    out.push(serializeRow(next));
  }

  const body = out.join("\n") + "\n";
  fs.writeFileSync(TMP_PATH, body, "utf8");
  try {
    fs.copyFileSync(TMP_PATH, CSV_PATH);
    fs.unlinkSync(TMP_PATH);
    console.log(`Reordered ${CSV_PATH}: ${COLUMN_ORDER.length} primary columns${extras.length ? ` + ${extras.length} extra` : ""}.`);
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
}

main();
