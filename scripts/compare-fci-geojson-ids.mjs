import fs from "node:fs";

const fciText = fs.readFileSync("FCIdeficiencytable.csv", "utf8");
const gj = JSON.parse(fs.readFileSync("Schools.geojson", "utf8"));

function parseFciIds(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const h = lines[0].split(",");
  const iCode = h.indexOf("School Code");
  const ids = new Set();
  for (let r = 1; r < lines.length; r++) {
    // naive split — FCI file uses quoted fields; use School Code column from simple regex
    const m = lines[r].match(/,((?:CO-1420-)[^,]+),/);
    if (m) ids.add(m[1].trim().toLowerCase());
  }
  return ids;
}

// Better: use same manual parse as validate script
let inQ = false;
let field = "";
let row = [];
const rows = [];
for (const c of fciText) {
  if (c === '"') {
    inQ = !inQ;
    continue;
  }
  if (!inQ && c === ",") {
    row.push(field);
    field = "";
    continue;
  }
  if (!inQ && c === "\r") continue;
  if (!inQ && c === "\n") {
    row.push(field);
    rows.push(row);
    row = [];
    field = "";
    continue;
  }
  field += c;
}
if (field.length || row.length) {
  row.push(field);
  rows.push(row);
}
const header = rows[0];
const iSch = header.indexOf("School Code");
const fciIds = new Set();
for (let r = 1; r < rows.length; r++) {
  const id = (rows[r][iSch] ?? "").toString().trim().toLowerCase();
  if (id) fciIds.add(id);
}

const featIds = new Set();
const noId = [];
for (const f of gj.features || []) {
  const id = (f.properties?.UniqueID ?? "").toString().trim().toLowerCase();
  if (id) featIds.add(id);
  else noId.push(f.properties?.["Building Name"] || "?");
}

const inFciNotGeo = [...fciIds].filter((x) => !featIds.has(x));
const inGeoNotFci = [...featIds].filter((x) => !fciIds.has(x));
console.log("FCI unique school codes", fciIds.size, "GeoJSON with UniqueID", featIds.size);
console.log("in FCI but not in GeoJSON (first 15)", inFciNotGeo.slice(0, 15));
console.log("in GeoJSON but not in FCI (count)", inGeoNotFci.length);
console.log("Geo features missing UniqueID (count)", noId.length, noId.slice(0, 5));
