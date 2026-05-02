/**
 * Rewrites SystemCategory in JeffCoProjectListAllSchools.csv only (human-readable label).
 * School Profile still uses UnitCostLibrary categories when merging rows — CSV values are ignored for Pass 1.
 *
 * Run: node scripts/set-project-list-modernization-label.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, "..", "JeffCoProjectListAllSchools.csv");

const HEAVY = "05_heavy modernization";
const LIGHT = "06_light modernization";
const LABEL = "modernization";

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
const sysIdx = header.indexOf("SystemCategory");
if (sysIdx < 0) throw new Error("SystemCategory column not found");

let n = 0;
for (let r = 1; r < rows.length; r++) {
  const v = (rows[r][sysIdx] ?? "").trim();
  if (v === HEAVY || v === LIGHT) {
    rows[r][sysIdx] = LABEL;
    n++;
  }
}

const line = rows.map((row) => row.map(escapeField).join(",")).join("\n");
fs.writeFileSync(CSV_PATH, line + "\n", "utf8");
console.log(`Set SystemCategory to "${LABEL}" for ${n} rows (${HEAVY} / ${LIGHT}).`);
