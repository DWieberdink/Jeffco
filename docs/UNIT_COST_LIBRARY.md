# Unit cost library

## Files

| File | Role |
|------|------|
| **`UnitCostLibrary.csv`** | **Used by the app** (school profile, scripts). Columns: `SystemCategory`, `Project`, `Unit`, `UnitCost`, `Value`. |
| **`UnitCostLibrary_withvalues.csv`** | Source workbook export (detailed ranges, scope notes, `#VALUE!` where Excel couldn’t resolve). **Not loaded by the browser.** |

## Regenerating `UnitCostLibrary.csv`

When you update `UnitCostLibrary_withvalues.csv`, run from the repo root:

```bash
node scripts/merge-unit-cost-library.mjs
```

The script:

1. Reads the **current** `UnitCostLibrary.csv` for the canonical **list and order** of projects (must stay aligned with `JeffCoProjectListAllSchools.csv` / pivot).
2. Pulls costs from `UnitCostLibrary_withvalues.csv` using row matches on **Project Type** (= system category), **Project** name (with a few aliases), and **Unit Measure Normalized** (= `SF`, `Quantity`, `Acre`, `Percentage`).
3. For **SF** rows, uses blended **ACF & hard cost** figures when present; falls back to direct ranges or the previous library value.
4. For **Quantity** / **Acre**, prefers **Direct unit cost range (low)** so totals in the export aren’t mistaken for per-unit costs.
5. Keeps **ADA** at the legacy `50` percentage basis (the detailed sheet uses a different scale).
6. Leaves **kitchen / cafeteria** combined lines at legacy **`50`** where the source has `#VALUE!`.
7. Skips rows that only exist in the detailed sheet (e.g. alternate units, `08_site infrastructure` line items) unless they are added to the canonical list first.

After merging, bump the school profile cache bust if needed so browsers reload the CSV.
