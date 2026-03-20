/**
 * Removes ConditionScore from JeffCoProjectListAllSchools.csv (header + field per row).
 * Run from repo root: node scripts/strip-condition-score-column.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, "..", "JeffCoProjectListAllSchools.csv");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let i = 0;
  let inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQ = false;
        i++;
        continue;
      }
      cur += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQ = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(cur);
      cur = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

function escapeField(f) {
  const s = String(f ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const raw = fs.readFileSync(CSV_PATH, "utf8").replace(/^\uFEFF/, "");
const rows = parseCsv(raw);
if (!rows.length) throw new Error("Empty CSV");
const header = rows[0].map((h) => h.trim());
const idx = header.findIndex((h) => h === "ConditionScore");
if (idx < 0) {
  console.log("ConditionScore column not found; nothing to do.");
  process.exit(0);
}

const outRows = rows.map((cells) => cells.filter((_, j) => j !== idx));
const line = outRows.map((r) => r.map(escapeField).join(",")).join("\n");
fs.writeFileSync(CSV_PATH, line + "\n", "utf8");
console.log("Removed ConditionScore column from", CSV_PATH, "rows:", outRows.length - 1);
