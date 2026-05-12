/**

 * Removes every row whose AssetType is "Heavily modernize STEM/specialized labs (ES)"

 * from JeffCoProjectListAllSchools.csv (line-wise match — AssetType has no commas).

 *

 * Close Excel / release the file if Windows reports EBUSY, then run:

 *   node scripts/remove-heavily-modernize-stem-es-rows.mjs

 */

import fs from "fs";

import path from "path";

import { fileURLToPath } from "url";



const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CANONICAL_NAME = "JeffCoProjectListAllSchools.csv";

const CSV_PATH = path.join(__dirname, "..", CANONICAL_NAME);

const TMP_PATH = CSV_PATH + ".tmp";

/** Written only when CSV_PATH cannot be overwritten (file locked); rename to CANONICAL_NAME when free. */

const FALLBACK_PATH = path.join(__dirname, "..", "JeffCoProjectListAllSchools.EBUSY-out.csv");



const NEEDLE = "Heavily modernize STEM/specialized labs (ES)";



const text = fs.readFileSync(CSV_PATH, "utf8");

const lines = text.split(/\r?\n/);

const kept = lines.filter((line) => !line.includes(NEEDLE));

const removed = lines.length - kept.length;

const out = kept.join("\n").replace(/\n$/, "") + "\n";



fs.writeFileSync(TMP_PATH, out, "utf8");

try {

  fs.copyFileSync(TMP_PATH, CSV_PATH);

  fs.unlinkSync(TMP_PATH);

  console.log(`Removed ${removed} row(s). Updated: ${CSV_PATH}`);

} catch (err) {

  if (err && (err.code === "EBUSY" || err.code === "EPERM")) {

    fs.copyFileSync(TMP_PATH, FALLBACK_PATH);

    fs.unlinkSync(TMP_PATH);

    console.warn(

      `Could not overwrite ${CSV_PATH} (file is open elsewhere). Wrote filtered copy to:\n  ${FALLBACK_PATH}\n` +

        `Close Excel/VS Code preview, then rename that file to ${CANONICAL_NAME} (replacing the locked original if needed).`

    );

    console.log(`Removed ${removed} row(s) in the output file.`);

    process.exit(0);

  }

  throw err;

}

