/**
 * Optional CLI: writes EnrollmentGrowth column to a CSV (default HistoricArticulationData.generated.csv).
 * The main map computes articulation enrollment growth at runtime from Decision Data Export + Map_Export
 * (see script.js mergeComputedArticulationEnrollmentGrowth); this script is for exporting a static snapshot.
 *
 * Universe: all ORIGINAL_122 schools plus fixed closed-site UIDs.
 * Aggregation: sum Enrollment2015 and Enrollment2025 by articulation, then
 *   growth % = ((Σ E2025) − (Σ E2015)) / (Σ E2015) × 100.
 *
 * Run: node scripts/compute-articulation-enrollment-growth.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Must match school-profile.js ORIGINAL_122 */
const ORIGINAL_122 = new Set([
  "0030", "0033", "0108", "0370", "0378", "0660", "0664", "0694", "0724", "0779",
  "0950", "0951", "0952", "0965", "1001", "1244", "1318", "1522", "1861", "1864",
  "1876", "1886", "1976", "2093", "2120", "2130", "2194", "2288", "2300", "2322",
  "2496", "2550", "2616", "2820", "2832", "2836", "2866", "2963", "3025", "3088",
  "3201", "3216", "3502", "3536", "3622", "3628", "3726", "4190", "4422", "4548",
  "4549", "4550", "4798", "4830", "4942", "5004", "5024", "5036", "5222", "5350",
  "5354", "5454", "5472", "5524", "5580", "5623", "5758", "5892", "5944", "6133",
  "6135", "6285", "6286", "6330", "6470", "6539", "6804", "6808", "6848", "7114",
  "7128", "7190", "7238", "7239", "7282", "7468", "7483", "7529", "7708", "7753",
  "7780", "7833", "7870", "7962", "8036", "8090", "8102", "8209", "8223", "8276",
  "8280", "8300", "8381", "8432", "8856", "9008", "9052", "9058", "9232", "9234",
  "9245", "9299", "9328", "9342", "9412", "9424", "9428", "9429", "9432", "9490",
  "9510", "9648",
]);

/** Closed schools to include in rollups (full UniqueID) */
const CLOSED_UIDS = new Set([
  "CO-1420-5972",
  "CO-1420-9154",
  "CO-1420-4802",
  "CO-1420-6806",
  "CO-1420-1790",
  "CO-1420-6828",
  "CO-1420-4478",
  "CO-1420-2946",
  "CO-1420-3624",
  "CO-1420-9678",
  "CO-1420-9638",
  "CO-1420-0776",
  "CO-1420-0109",
  "CO-1420-3450",
  "CO-1420-0148",
  "CO-1420-6844",
  "CO-1420-8248",
  "CO-1420-6090",
  "CO-1420-8834",
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

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h).trim());
  return rows.slice(1).map((cells) => {
    const o = {};
    headers.forEach((h, j) => {
      o[h] = cells[j] != null ? String(cells[j]) : "";
    });
    return o;
  });
}

function numLoose(v) {
  if (v == null) return null;
  const s = String(v).replace(/,/g, "").trim();
  if (!s || /^#n\/a$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function getCdeSuffix(uid) {
  if (!uid) return "";
  const parts = String(uid).split("-");
  return parts[parts.length - 1] || "";
}

function normAreaKey(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseGrowthFraction(raw) {
  const s = String(raw ?? "").trim();
  if (!s || /^#n\/a$/i.test(s)) return null;
  if (s === "-1") return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function deriveE15FromPct(e25, pctRaw) {
  const r = parseGrowthFraction(pctRaw);
  if (r == null) return null;
  const d = 1 + r;
  if (Math.abs(d) < 1e-12) return null;
  const v = e25 / d;
  return Number.isFinite(v) ? Math.max(0, v) : null;
}

function fmtPct(x) {
  if (!Number.isFinite(x)) return "";
  const rounded = Math.round(x * 10) / 10;
  return `${rounded}%`;
}

function inUniverse(uid) {
  const u = String(uid || "").trim();
  if (CLOSED_UIDS.has(u)) return true;
  return ORIGINAL_122.has(getCdeSuffix(u));
}

/**
 * @param {Record<string,string>} row
 * @param {boolean} has2015col
 */
function getE15E25(row, has2015col) {
  const e25Raw = numLoose(row.Enrollment2025 ?? row["Enrollment2025"] ?? row.Enrollment ?? row["Enrollment"]);
  const e25 = Math.max(0, e25Raw ?? 0);

  if (has2015col) {
    const e15v = numLoose(row.Enrollment2015 ?? row["Enrollment2015"]);
    const e15 = e15v != null && Number.isFinite(e15v) ? Math.max(0, e15v) : 0;
    return { e15, e25 };
  }

  const e15 =
    deriveE15FromPct(e25, row["10 Year Percent Change 2015-2025"]) ?? 0;
  return { e15, e25 };
}

function main() {
  const decisionPath = path.join(ROOT, "Decision Data Export.csv");
  const mapPath = path.join(ROOT, "Map_Export.csv");
  const historicPath = path.join(ROOT, "HistoricArticulationData.csv");
  const defaultOut = path.join(ROOT, "HistoricArticulationData.generated.csv");
  const outPath = process.env.ENROLLMENT_GROWTH_OUT || defaultOut;

  const decisionParsed = parseCsv(fs.readFileSync(decisionPath, "utf8"));
  const decisionRows = rowsToObjects(decisionParsed);
  const decisionHeaders = (decisionParsed[0] || []).map((h) => String(h).trim());
  /** Explicit year columns present (vs legacy single Enrollment). */
  const hasEnrollment2015Col = decisionHeaders.includes("Enrollment2015");
  const mapRows = rowsToObjects(parseCsv(fs.readFileSync(mapPath, "utf8")));

  let historicRows = [];
  try {
    historicRows = rowsToObjects(parseCsv(fs.readFileSync(historicPath, "utf8")));
  } catch (e) {
    console.error("Read HistoricArticulationData.csv failed:", e.message);
    process.exit(1);
  }

  const uidToArticulation = new Map();
  for (const r of mapRows) {
    const code = String(r["Building Code"] ?? "").trim();
    const art = String(r["Articulation"] ?? "").trim();
    if (code) uidToArticulation.set(code, art);
  }

  /** @type {Map<string, { s15: number, s25: number }>} */
  const byArea = new Map();

  function bump(areaLabel, e15, e25) {
    if (!byArea.has(areaLabel)) byArea.set(areaLabel, { s15: 0, s25: 0 });
    const b = byArea.get(areaLabel);
    b.s15 += e15;
    b.s25 += e25;
  }

  let nUsed = 0;
  let nSkippedNotInUniverse = 0;

  for (const row of decisionRows) {
    const uid = String(row["UniqueID"] ?? "").trim();
    if (!inUniverse(uid)) {
      nSkippedNotInUniverse++;
      continue;
    }

    const { e15, e25 } = getE15E25(row, hasEnrollment2015Col);

    bump("__districtwide__", e15, e25);
    nUsed++;

    const artRaw = uidToArticulation.get(uid) || "";
    const ak = normAreaKey(artRaw);
    if (ak && ak !== "noarticulationarea" && ak !== "n/a") {
      bump(artRaw.trim(), e15, e25);
    }
  }

  const district15 = byArea.get("__districtwide__")?.s15 ?? 0;
  const district25 = byArea.get("__districtwide__")?.s25 ?? 0;
  byArea.delete("__districtwide__");

  const growthPct = (s15, s25) => {
    if (!(s15 > 0)) return null;
    return ((s25 - s15) / s15) * 100;
  };

  const articulationToGrowth = new Map();
  for (const [label, { s15, s25 }] of byArea) {
    articulationToGrowth.set(normAreaKey(label), growthPct(s15, s25));
  }

  const districtGrowth = growthPct(district15, district25);

  const outLines = ["Articulation,TotalSpending,EnrollmentGrowth"];
  for (const hr of historicRows) {
    const name = String(hr.Articulation ?? "").trim();
    const spending = String(hr.TotalSpending ?? "").trim();
    let eg = "";
    const nk = normAreaKey(name);
    if (nk === "districtwide" && districtGrowth != null) eg = fmtPct(districtGrowth);
    else {
      const v = articulationToGrowth.get(nk);
      eg = v != null ? fmtPct(v) : "";
    }
    outLines.push(`${name},${spending},${eg}`);
  }

  fs.writeFileSync(outPath, outLines.join("\n") + "\n", "utf8");

  console.log("Wrote", outPath);
  console.log("");
  console.log("=== Methodology ===");
  console.log(
    "- Schools: ORIGINAL_122 ∪",
    CLOSED_UIDS.size,
    "closed-site UIDs (no charter/option filter)."
  );
  console.log(
    "- Enrollment:",
    hasEnrollment2015Col
      ? "Enrollment2015 & Enrollment2025 (blank 2015 → 0)."
      : "legacy Enrollment as 2025; 2015 derived from 10-year % change when possible."
  );
  console.log("- Per area: ((Σ E2025 − Σ E2015) / Σ E2015) × 100 from Map_Export articulation; NoArticulationArea → Districtwide only.");
  console.log("");
  console.log("School rows included:", nUsed);
  console.log("Districtwide Σ E2015:", Math.round(district15), "Σ E2025:", Math.round(district25), "growth %:", districtGrowth != null ? districtGrowth.toFixed(2) : "n/a");
  console.log("Rows skipped (not in universe):", nSkippedNotInUniverse);
}

main();
