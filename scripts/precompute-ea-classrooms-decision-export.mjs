/**
 * Refresh classroom columns on Decision Data Export.csv:
 *   - ClassroomCount: recomputed from Jeffco Room Schedule (CostEstimateLink bucket "modernize classrooms",
 *     SPACE = "Classroom" — same bucket logic as school-profile.js).
 *   - ClassroomEAScore: not overwritten — maintain scores only in Decision Data Export.csv (source of truth).
 *
 * Join: counts are summed by schedule Campus Code and by normalized Facility Name (CamelCase split),
 * then matched to each decision row by UniqueID first, then by Building Name variants (same idea as script.js).
 *
 * Run from repo root:
 *   npm run precompute:ea-classrooms
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DECISION_PATH = path.join(ROOT, "Decision Data Export.csv");
const SCHEDULE_PATH = path.join(ROOT, "Jeffco Room Schedule.csv");

const COL_SCORE = "ClassroomEAScore";
const COL_COUNT = "ClassroomCount";

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

function norm(s) {
  return (s ?? "").toString().trim();
}

function normName(s) {
  return norm(s)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeId(id) {
  return norm(id).toLowerCase();
}

function normalizeName(name) {
  return norm(name).toLowerCase().replace(/\s+/g, " ").trim();
}

function buildNameVariants(name) {
  const n0 = normalizeName(name || "");
  if (!n0) return [];
  const variants = new Set();
  variants.add(n0);
  const n1 = n0
    .replace(/elementary/g, "es")
    .replace(/middle school/g, "ms")
    .replace(/middle/g, "ms")
    .replace(/high school/g, "hs")
    .replace(/high/g, "hs");
  variants.add(n1);
  const n2 = n0.replace(/school/g, "").replace(/\s+/g, " ").trim();
  variants.add(n2);
  const n3 = n1.replace(/school/g, "").replace(/\s+/g, " ").trim();
  variants.add(n3);
  return Array.from(variants).filter(Boolean);
}

/** Match school-profile.js normalizeFacilityName for schedule Facility Name keys. */
function normalizeFacilityName(raw) {
  let s = norm(raw);
  if (!s) return "";
  s = s.replace(/([a-z])([A-Z])/g, "$1 $2");
  s = s.replace(/\b(K|PK)(\d)/gi, "$1 $2");
  s = s.replace(/\b(K)-(\d)/gi, "$1 $2");
  return normName(s);
}

function normKeyLoose(s) {
  return norm(s)
    .replace(/\u00A0/g, " ")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRoomCategory(raw) {
  return normKeyLoose(raw).replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ").trim().toLowerCase();
}

const MODERNIZE_STEM_SF_BUCKET = normalizeRoomCategory("modernize STEM/specialized labs");

function scheduleCostLinkToSfBucket(categoryNorm) {
  if (!categoryNorm) return categoryNorm;
  const isStemLabsLink =
    categoryNorm.includes("modernize") &&
    (categoryNorm.includes("stem") || categoryNorm.includes("cte")) &&
    (categoryNorm.includes("specialized lab") || categoryNorm.includes(" lab"));
  if (isStemLabsLink) return MODERNIZE_STEM_SF_BUCKET;
  return categoryNorm;
}

const CLASSROOM_BUCKET = normalizeRoomCategory("modernize classrooms");

function scheduleRowIsGeneralClassroom(cells, idx) {
  const linkRaw = cells[idx.link] ?? "";
  const bucket = scheduleCostLinkToSfBucket(normalizeRoomCategory(linkRaw));
  if (bucket !== CLASSROOM_BUCKET) return false;
  const space = norm(cells[idx.space] ?? "").toLowerCase();
  return space === "classroom";
}

function findHeaderIndex(headerCells, matcher) {
  return headerCells.findIndex((h) => matcher.test(String(h).trim()));
}

function buildScheduleClassroomCounts(scheduleRows) {
  const countByUid = new Map();
  const countByFacility = new Map();
  if (!scheduleRows.length) return { countByUid, countByFacility };

  const header = scheduleRows[0].map((h) => String(h).trim());
  const iFacility = findHeaderIndex(header, /^facility\s*name$/i);
  const iCampus = findHeaderIndex(header, /^campus\s*code$/i);
  const iLink =
    findHeaderIndex(header, /cost\s*estimate\s*link/i) !== -1
      ? findHeaderIndex(header, /cost\s*estimate\s*link/i)
      : findHeaderIndex(header, /costestimate/i);
  const iSpace = findHeaderIndex(header, /^space$/i);

  if (iCampus < 0 || iLink < 0 || iSpace < 0) {
    console.warn("Room schedule: need Campus Code, CostEstimateLink, SPACE — counts skipped.");
    return { countByUid, countByFacility };
  }
  if (iFacility < 0) console.warn("Room schedule: Facility Name not found — UID-only joins may miss schools.");

  for (let r = 1; r < scheduleRows.length; r++) {
    const cells = scheduleRows[r];
    if (!scheduleRowIsGeneralClassroom(cells, { facility: iFacility, campus: iCampus, link: iLink, space: iSpace }))
      continue;
    const uid = normalizeId(cells[iCampus] ?? "");
    if (uid) countByUid.set(uid, (countByUid.get(uid) || 0) + 1);
    if (iFacility >= 0) {
      const fk = normalizeFacilityName(cells[iFacility] ?? "");
      if (fk) countByFacility.set(fk, (countByFacility.get(fk) || 0) + 1);
    }
  }
  return { countByUid, countByFacility };
}

function resolveClassroomCount(uniqueId, buildingName, countByUid, countByFacility) {
  const u = normalizeId(uniqueId);
  if (u) {
    const n = countByUid.get(u);
    if (Number.isFinite(n) && n > 0) return String(n);
  }
  for (const v of buildNameVariants(buildingName || "")) {
    const fk = normalizeFacilityName(v);
    if (fk) {
      const n = countByFacility.get(fk);
      if (Number.isFinite(n) && n > 0) return String(n);
    }
    const n2 = countByFacility.get(normName(v));
    if (Number.isFinite(n2) && n2 > 0) return String(n2);
  }
  return "";
}

function main() {
  const decisionRaw = fs.readFileSync(DECISION_PATH, "utf8");
  const decisionRows = parseCsv(decisionRaw);
  if (!decisionRows.length) throw new Error("empty Decision Data Export");

  const rawHeader = decisionRows[0].map((h) => String(h));
  const headerTrim = rawHeader.map((h) => h.trim());

  let scheduleRows = [];
  try {
    scheduleRows = parseCsv(fs.readFileSync(SCHEDULE_PATH, "utf8"));
  } catch (e) {
    console.warn("Jeffco Room Schedule.csv not read — ClassroomCount left unchanged where no new value:", e.message);
  }

  const { countByUid, countByFacility } = buildScheduleClassroomCounts(scheduleRows);

  const iUid = headerTrim.findIndex((h) => /^uniqueid$/i.test(h) || /^unique\s*id$/i.test(h));
  const iName = headerTrim.findIndex((h) => /^building\s*name$/i.test(h));
  if (iUid < 0) throw new Error("Decision export missing UniqueID");
  if (iName < 0) throw new Error("Decision export missing Building Name");

  let iScore = headerTrim.indexOf(COL_SCORE);
  let iCount = headerTrim.indexOf(COL_COUNT);
  const newHeader = [...rawHeader];
  if (iScore < 0) {
    newHeader.push(COL_SCORE);
    iScore = newHeader.length - 1;
  }
  if (iCount < 0) {
    newHeader.push(COL_COUNT);
    iCount = newHeader.length - 1;
  }

  const out = [serializeRow(newHeader)];

  for (let r = 1; r < decisionRows.length; r++) {
    const cells = decisionRows[r];
    const pad = Math.max(0, rawHeader.length - cells.length);
    const row = cells.concat(Array(pad).fill(""));
    const uid = row[iUid] ?? "";
    const bname = row[iName] ?? "";

    const countStr = resolveClassroomCount(uid, bname, countByUid, countByFacility);

    const next = newHeader.map((_, j) => (j < rawHeader.length ? row[j] ?? "" : ""));
    // ClassroomEAScore: only from Decision export (never cleared by this script).
    next[iScore] = iScore < row.length ? row[iScore] ?? "" : "";
    next[iCount] = countStr !== "" ? countStr : iCount < row.length ? row[iCount] ?? "" : "";

    out.push(serializeRow(next));
  }

  fs.writeFileSync(DECISION_PATH, out.join("\n") + "\n", "utf8");
  console.log(
    `Updated ${COL_COUNT} on ${out.length - 1} rows from room schedule; ${COL_SCORE} left as in Decision export (${countByUid.size} campus UIDs, ${countByFacility.size} facility keys).`
  );
}

main();
