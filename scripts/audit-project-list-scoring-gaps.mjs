/**
 * Scoring gaps with filters:
 * - 01–07 / modernization: only "traditional 122" sites (ORIGINAL_122 CDE suffix in school-profile.js).
 * - FCI (08): only Decision export Status === Active (open).
 *
 * Output: schools where (traditional ∧ no condition source) OR (open ∧ no FCI $), with labels.
 */
import fs from "node:fs";

const PROJECT_CSV = "JeffCoProjectListAllSchools.csv";
const DECISION_CSV = "Decision Data Export.csv";

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

function parseCSV(t) {
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let inQ = false;
  while (i < t.length) {
    const c = t[i];
    if (inQ) {
      if (c === '"') {
        if (t[i + 1] === '"') {
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

const norm = (s) => (s == null ? "" : String(s)).trim();

function normLooseName(s) {
  return norm(s)
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getCdeSuffix(uid) {
  if (!uid) return "";
  const parts = uid.split("-");
  return parts[parts.length - 1] || "";
}

function isCondCat(sys) {
  if (!sys) return false;
  if (/^0[1-7]_/.test(sys)) return true;
  if (sys.toLowerCase() === "modernization") return true;
  return false;
}

function is08(sys) {
  return Boolean(sys && /^08_/.test(sys));
}

function condPop(v) {
  return norm(v) !== "";
}

function rcPop(v) {
  const t = norm(v);
  if (!t) return false;
  if (t.toLowerCase() === "none") return false;
  return true;
}

function projectAggregateKey(uidRaw, schoolName) {
  const u = norm(uidRaw);
  if (/^CO-1420-/i.test(u)) return { kind: "uid", key: u };
  return { kind: "name", key: normLooseName(schoolName) };
}

// --- Decision export ---
const decRows = parseCSV(fs.readFileSync(DECISION_CSV, "utf8"));
const dh = decRows[0].map(norm);
const di = Object.fromEntries(dh.map((h, i) => [h, i]));
const decisionByUid = new Map();
const decisionByName = new Map();
for (let r = 1; r < decRows.length; r++) {
  const row = decRows[r] || [];
  const uid = norm(row[di.UniqueID]);
  const bname = norm(row[di["Building Name"]] ?? row[di.BuildingName]);
  const status = norm(row[di.Status]);
  if (!uid) continue;
  const rec = { uid, buildingName: bname || uid, status };
  decisionByUid.set(uid, rec);
  if (bname) decisionByName.set(normLooseName(bname), rec);
}

// --- Project list: merge rows by CO id or by normalized school name ---
const agg = new Map();
function ensureAgg(metaKey) {
  if (!agg.has(metaKey)) {
    agg.set(metaKey, { anyCond: false, any08rc: false, sampleName: "" });
  }
  return agg.get(metaKey);
}

const projRows = parseCSV(fs.readFileSync(PROJECT_CSV, "utf8"));
const ph = projRows[0].map(norm);
const pi = Object.fromEntries(ph.map((h, i) => [h, i]));

for (let r = 1; r < projRows.length; r++) {
  const row = projRows[r] || [];
  const school = norm(row[pi.SchoolName]);
  if (!school) continue;
  const uidRaw = norm(row[pi.UniqueID]);
  const meta = projectAggregateKey(uidRaw, school);
  const metaKey = meta.kind === "uid" ? `uid:${meta.key}` : `name:${meta.key}`;
  const o = ensureAgg(metaKey);
  if (!o.sampleName) o.sampleName = school;
  const sys = norm(row[pi.SystemCategory]);
  if (isCondCat(sys) && condPop(row[pi.ConditionSource])) o.anyCond = true;
  if (is08(sys) && rcPop(row[pi.ReplacementCost])) o.any08rc = true;
}

const condGap = (o) => !o.anyCond;
const fciGap = (o) => !o.any08rc;

function resolveUidAndDecision(metaKey) {
  if (metaKey.startsWith("uid:")) {
    const uid = metaKey.slice(4);
    return { uid, dec: decisionByUid.get(uid) || null };
  }
  const nn = metaKey.slice(5);
  const dec = decisionByName.get(nn);
  return { uid: dec?.uid || "", dec };
}

const out = [];

for (const [metaKey, o] of agg) {
  const { uid, dec } = resolveUidAndDecision(metaKey);
  const displayName = dec?.buildingName || o.sampleName;
  const displayUid = uid || "(no CO id in project list)";
  const suffix = getCdeSuffix(uid);
  const isTraditional = ORIGINAL_122.has(suffix);
  const isOpen = dec?.status?.toLowerCase() === "active";

  const cat01 = isTraditional && condGap(o);
  const catFci = isOpen && fciGap(o);

  if (!cat01 && !catFci) continue;

  let label = "";
  if (cat01 && catFci) label = "Both (01–07 empty on traditional 122, FCI $ empty on open site)";
  else if (cat01) label = "01–07 only (traditional 122, no condition scores)";
  else label = "FCI only (open site, no FCI replacement $)";

  out.push({
    displayName,
    displayUid,
    label,
    cat01,
    catFci,
  });
}

out.sort((a, b) =>
  a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }),
);

console.log(
  "Traditional 122 = CDE suffix in ORIGINAL_122 (school-profile.js). Open = Decision Status Active.\n",
);
for (const row of out) {
  console.log(`${row.displayName}\t${row.displayUid}\t${row.label}`);
}
