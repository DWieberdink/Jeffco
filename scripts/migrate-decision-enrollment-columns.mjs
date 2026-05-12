/**
 * One-time / idempotent: rename Decision Data Export `Enrollment` → `Enrollment2025`,
 * insert `Enrollment2015`. When Enrollment2015 is empty, fill from 10-year % change:
 *   Enrollment2015 ≈ Enrollment2025 / (1 + r)   [same basis as published growth column]
 *
 * Run: node scripts/migrate-decision-enrollment-columns.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSV_PATH = path.join(ROOT, "Decision Data Export.csv");

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

function pctTo2015(enr2025Str, pctStr) {
  const enr = parseFloat(String(enr2025Str ?? "").replace(/,/g, "").trim());
  const pct = parseFloat(String(pctStr ?? "").replace(/,/g, "").trim());
  if (!Number.isFinite(enr)) return "";
  if (!Number.isFinite(pct) || String(pctStr).trim() === "-1" || /^#n\/a$/i.test(String(pctStr ?? "").trim())) return "";
  const d = 1 + pct;
  if (Math.abs(d) < 1e-12) return "";
  const e15 = enr / d;
  return Number.isFinite(e15) ? String(e15) : "";
}

function main() {
  const raw = fs.readFileSync(CSV_PATH, "utf8");
  const rows = parseCsv(raw);
  if (!rows.length) throw new Error("empty csv");
  const header = rows[0].map((h) => String(h).trim());
  const iEnr = header.indexOf("Enrollment");
  const i2025 = header.indexOf("Enrollment2025");
  if (i2025 !== -1 && header.includes("Enrollment2015")) {
    console.log("Decision Data Export already has Enrollment2015 / Enrollment2025 — skipping migration.");
    return;
  }
  if (iEnr === -1) throw new Error('expected column "Enrollment" or migration already applied incorrectly');

  const iPct = header.indexOf("10 Year Percent Change 2015-2025");
  const newHeader = [...header.slice(0, iEnr), "Enrollment2015", "Enrollment2025", ...header.slice(iEnr + 1)];
  const out = [serializeRow(newHeader)];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const pad = Math.max(0, header.length - cells.length);
    const row = cells.concat(Array(pad).fill(""));
    const enr2025 = row[iEnr] ?? "";
    let enr2015 = "";
    if (iPct >= 0) enr2015 = pctTo2015(enr2025, row[iPct]);
    const next = [
      ...row.slice(0, iEnr),
      enr2015,
      enr2025,
      ...row.slice(iEnr + 1),
    ];
    out.push(serializeRow(next));
  }
  const bak = path.join(ROOT, "Decision Data Export.backup-enrollment.csv");
  const altOut = path.join(ROOT, "Decision Data Export.migrated.csv");
  try {
    fs.copyFileSync(CSV_PATH, bak);
    fs.writeFileSync(CSV_PATH, out.join("\n") + "\n", "utf8");
    console.log("Backed up to", bak);
    console.log("Updated", CSV_PATH, "— added Enrollment2015, Enrollment2025 (from Enrollment + derived 2015 where possible).");
  } catch (e) {
    if (e && e.code === "EBUSY") {
      fs.writeFileSync(altOut, out.join("\n") + "\n", "utf8");
      console.warn("Could not write (file locked). Wrote", altOut, "— replace Decision Data Export.csv when unlocked.");
    } else throw e;
  }
}

main();
