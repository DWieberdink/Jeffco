/**
 * Shortens paired heavy/light AssetType strings in JeffCoProjectListAllSchools.csv (rowwise).
 * Single-space projects (restrooms, STEM, corridors-only, etc.) unchanged.
 * Run: node scripts/shorten-paired-modernize-assettype.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, "..", "JeffCoProjectListAllSchools.csv");

/** Exact CSV cell replacements (AssetType column) */
const REPLACEMENTS = [
  ["Heavily modernize admin", "Modernize admin"],
  ["Lightly modernize admin", "Modernize admin"],
  ["Heavily modernize classrooms", "Modernize classrooms"],
  ["Lightly modernize classrooms", "Modernize classrooms"],
  ["Heavily modernize gym / assembly space", "Modernize gym / assembly space"],
  ["Lightly modernize gym / assembly space", "Modernize gym / assembly space"],
  ["Heavily modernize cafeteria", "Modernize cafeteria"],
  ["Lightly modernize cafeteria", "Modernize cafeteria"],
  ["Heavily modernize multipurpose room", "Modernize multipurpose room"],
  ["Lightly modernize multipurpose room", "Modernize multipurpose room"],
];

const OLD_TO_NEW = new Map(REPLACEMENTS);

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

let n = 0;
for (let r = 1; r < rows.length; r++) {
  const cell = rows[r][assetIdx] ?? "";
  const trimmed = cell.trim();
  if (OLD_TO_NEW.has(trimmed)) {
    rows[r][assetIdx] = OLD_TO_NEW.get(trimmed);
    n++;
  }
}

const line = rows.map((row) => row.map(escapeField).join(",")).join("\n");
fs.writeFileSync(CSV_PATH, line + "\n", "utf8");
console.log(`Shortened paired modernization AssetType on ${n} rows.`);
