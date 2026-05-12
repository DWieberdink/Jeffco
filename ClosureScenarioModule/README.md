# Closure Scenarios (standalone)

Student reassignment simulation when a school closes: loads student homes from `OD_Students.csv`, seats and enrollment from `Decision Data Export.csv`, coordinates from `Map_Export.csv`, grade spans from `SchooltoSchoolDistances.csv`, and optional articulation polygons from `ArticulationArea.geojson`.

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
