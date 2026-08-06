# Closure Scenarios (standalone)

Student reassignment simulation when a school closes: loads student homes from `Data Source/OD_Students.csv`, seats and enrollment from `Data Source/01 Decision Data Export.csv`, coordinates from `Data Source/09 Map_Export.csv`, grade spans from `Data Source/06 SchooltoSchoolDistances.csv`, and optional articulation polygons from `Data Source/08 ArticulationArea.geojson`.

## Run locally

From this folder, serve static files over HTTP (required for CSV/GeoJSON fetches):

```bash
npx http-server . -p 8767 -c-1
```

Then open `http://localhost:8767/` (uses `index.html`).

Or use the repo root script if you prefer another port.

## Data files

Keep the CSV/GeoJSON files in this directory next to `index.html`. When district data updates, copy refreshed exports from the main dashboard project (or your source of truth) into this folder.

## Password

The page uses the same simple session password gate as the main dashboard (see inline script in `index.html`). Adjust there if needed.
