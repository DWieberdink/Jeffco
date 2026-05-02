/* One-off: validate FCIdeficiencytable.csv rows (empty System / School Code). */
import fs from "node:fs";

const txt = fs.readFileSync("FCIdeficiencytable.csv", "utf8");
let inQ = false;
let field = "";
let row = [];
const rows = [];
for (let k = 0; k < txt.length; k++) {
  const c = txt[k];
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

const h = rows[0];
const idx = (name) => h.indexOf(name);
const sch = idx("School Code");
const sys = idx("System");
let badSys = 0;
let badSch = 0;
const schools = new Set();
for (let r = 1; r < rows.length; r++) {
  const line = rows[r];
  const id = (line[sch] ?? "").toString().trim();
  const sy = (line[sys] ?? "").toString().trim();
  if (!id) badSch++;
  if (!sy) {
    badSys++;
    if (r < 130) console.warn("empty System row", r + 1, "school", id, "firstCols", line.slice(0, 8));
  }
  if (id) schools.add(id);
}
console.log("data rows", rows.length - 1, "unique School Code", schools.size, "empty School Code rows", badSch, "empty System rows", badSys);
