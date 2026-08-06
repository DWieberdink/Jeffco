# Unit cost library

## File

| File | Role |
|------|------|
| **`03 UnitCostLibrary.csv`** | **Single source used by the app** (school profile, pivot scripts). |

### Columns

| Column | Used by app |
|--------|-------------|
| `SystemCategory` | Yes — groups projects (e.g. `05_heavy modernization`). |
| `Project` | Yes — matches `AssetType` in `02 JeffCoProjectListAllSchools.csv`. |
| `Unit` | Yes — measure (SF, Quantity, EA, Project cost, etc.). |
| `UnitCost` | Yes — numeric rate, `Site specific`, `%`, or blank. |
| `Value` | Yes — condition threshold input for the profile logic. |
| `DirectCostHigh` | **No** — documentation (former high end of direct unit range from the cost study export). |
| `ScopeAssumption` | **No** — documentation / scope narrative. |
| `UpgradeScopeAssumption` | **No** — documentation. |
| `SizeAssumptions` | **No** — documentation. |

The browser loader only reads the first five fields for costing and ordering; extra columns are ignored but stay in the CSV for humans and exports.

## Refreshing metadata from a new Excel export

If you export a detailed sheet again, save it as **`UnitCostLibrary_withvalues.csv`** in the repo root (same shape as before: `Project`, `Project Type`, `Unit Measure Normalized`, range columns, scope columns, etc.), then run:

```bash
node scripts/merge-unit-cost-library.mjs
```

The script:

1. Reads **`03 UnitCostLibrary.csv`** for the canonical **list, order, `UnitCost`, and `Value`** (those stay as-is so dashboard numbers do not change unless you edit them).
2. When `UnitCostLibrary_withvalues.csv` is present, fills **`DirectCostHigh`** … **`SizeAssumptions`** from the matching detailed row (`Project Type` = system category, `Project` with the same aliases as before, unit matching with fallbacks for EA ↔ Quantity, blank unit, etc.).
3. When the withvalues file is **absent**, rewrites the library from the existing unified CSV and **preserves** documentation columns already on disk.

After a merge that changes `UnitCost` or `Value` manually in the CSV, bump the school profile cache bust if browsers should refetch.

## What was removed

The old **`UnitCostLibrary_withvalues.csv`** as a permanent second file is gone. Its information is folded into the documentation columns above, **one row per library project** (no duplicate alternate-unit rows in git). Rows that existed only in the detailed export (for example alternate Quantity vs SF marketing rows, or `08_Facilities Deficiency` / legacy `08_site infrastructure` lines) are not kept unless you add matching projects to `03 UnitCostLibrary.csv` first.
