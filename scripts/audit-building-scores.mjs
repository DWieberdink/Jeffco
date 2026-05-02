/**
 * Audit Decision Data Export.csv for missing/non-numeric BuildingScore values.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const csvPath = path.join(root, "Decision Data Export.csv");

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let i = 0;
  let inQ = false;
  while (i < line.length) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
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
      out.push(cur);
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  out.push(cur);
  return out;
}

const lines = fs.readFileSync(csvPath, "utf8").trim().split(/\r?\n/);
const header = parseCsvLine(lines[0]);
const idxUid = header.indexOf("UniqueID");
const idxName = header.indexOf("Building Name");
const idxScore = header.indexOf("BuildingScore");

function parseScore(raw) {
  const s = String(raw ?? "")
    .trim()
    .replace(/,/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const missing = [];
const zero = [];
const ok = [];

for (let li = 1; li < lines.length; li++) {
  const cells = parseCsvLine(lines[li]);
  const uid = cells[idxUid] ?? "";
  const name = cells[idxName] ?? "";
  const raw = idxScore >= 0 ? cells[idxScore] : "";
  const n = parseScore(raw);
  if (n === null && String(raw ?? "").trim() === "") {
    missing.push({ uid, name, raw });
  } else if (n === 0) {
    zero.push({ uid, name, raw });
  } else if (n !== null) {
    ok.push(uid);
  } else {
    missing.push({ uid, name, raw: String(raw) });
  }
}

console.log("Decision Data Export rows:", lines.length - 1);
console.log("BuildingScore present (numeric, non-null):", ok.length);
console.log("BuildingScore explicitly 0:", zero.length);
console.log("BuildingScore missing or non-numeric:", missing.length);
if (missing.length) {
  console.log("\n--- Missing / invalid BuildingScore ---");
  missing.forEach((x) => console.log(`${x.uid}\t${x.name}\t${JSON.stringify(x.raw)}`));
}
if (zero.length && zero.length <= 40) {
  console.log("\n--- Zero BuildingScore (may be intentional) ---");
  zero.forEach((x) => console.log(`${x.uid}\t${x.name}`));
} else if (zero.length) {
  console.log("\nZero-score schools (first 25):");
  zero.slice(0, 25).forEach((x) => console.log(`${x.uid}\t${x.name}`));
}
