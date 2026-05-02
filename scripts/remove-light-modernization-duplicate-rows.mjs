/**
 * Removes paired light-modernization rows from JeffCoProjectListAllSchools.csv
 * when heavy/light share inputs (heavy row retains data; School Profile synthesizes light).
 *
 * Run from repo root: node scripts/remove-light-modernization-duplicate-rows.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, "..", "JeffCoProjectListAllSchools.csv");

/** Must match school-profile.js HEAVY_LIGHT_MODERNIZATION_PAIRS light AssetTypes exactly */
const LIGHT_ASSET_REMOVE = new Set([
  "Lightly modernize admin",
  "Lightly modernize classrooms",
  "Lightly modernize gym / assembly space",
  "Lightly modernize cafeteria",
  "Lightly modernize multipurpose room",
]);

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
const assetIdx = header.indexOf("AssetType");
if (assetIdx < 0) throw new Error("AssetType column not found");

const outRows = [rows[0]];
let removed = 0;
for (let r = 1; r < rows.length; r++) {
  const cells = rows[r];
  const asset = (cells[assetIdx] ?? "").trim();
  if (LIGHT_ASSET_REMOVE.has(asset)) {
    removed++;
    continue;
  }
  outRows.push(cells);
}

const line = outRows.map((row) => row.map(escapeField).join(",")).join("\n");
fs.writeFileSync(CSV_PATH, line + "\n", "utf8");
console.log(`Removed ${removed} light-modernization duplicate rows. Kept ${outRows.length - 1} data rows (+ header).`);
