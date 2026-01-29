/* closure-scenarios.js
   - Loads OD_Students.csv (student home coords + current school)
   - Computes current travel distance (crow flies) and simulates reassignment on closure
   - Assigns each student to nearest eligible destination (crow flies), with seat + grade rules
*/

(function () {
  const DECISION_CSV_PATH = "Decision Data Export.csv";
  const OD_STUDENTS_CSV_PATH = "OD_Students.csv";
  const MAP_EXPORT_CSV_PATH = "Map_Export.csv";
  const SCHOOL_DISTANCES_CSV_PATH = "SchooltoSchoolDistances.csv"; // used for grade spans
  const ARTICULATION_AREAS_GEOJSON_PATH = "ArticulationArea.geojson";
  const CACHE_BUST = "20260129_13";

  // Match main dashboard token
  mapboxgl.accessToken = "pk.eyJ1IjoicGF0d2QwNSIsImEiOiJjbTZ2bGVhajIwMTlvMnFwc2owa3BxZHRoIn0.moDNfqMUolnHphdwsIF87w";

  const elSelect = document.getElementById("closeSchoolSelect");
  const elRun = document.getElementById("runBtn");
  const elExport = document.getElementById("exportCsvBtn");
  const elResultsCard = document.getElementById("resultsCard");
  const elKpis = document.getElementById("kpis");
  const elDestTbody = document.getElementById("destTbody");
  const elResultsNote = document.getElementById("resultsNote");
  const elProgWrap = document.getElementById("odProgress");
  const elProg = document.getElementById("odProgressBar");
  const elProgMeta = document.getElementById("odProgressMeta");
  const elForceAssignAll = document.getElementById("forceAssignAll");
  const elToggleArticulationAreas = document.getElementById("toggleArticulationAreas");
  const elIncludeHomeSchool = document.getElementById("includeHomeSchool");
  const elIncludeChoice = document.getElementById("includeChoice");
  const elMinMiles = document.getElementById("minMiles");
  const elMaxMiles = document.getElementById("maxMiles");
  const elAllowBeyondMax = document.getElementById("allowBeyondMax");

  let decisionReady = false;
  let odStudentsReady = false;
  let coordsReady = false;
  let gradeSpansReady = false;

  /** Map<schoolCode, { name, status, seats, enrollment } > */
  const schoolMetaByCode = new Map();
  /** Map<articulationAreaName, Array<schoolName>> */
  let articulationSchoolsByArea = new Map();
  /** Map<schoolCode, [lng, lat]> */
  const coordsByCode = new Map();
  /** Map<schoolCode, gradeSpanString> (e.g., PK-5, 6-8, 6-12) */
  const gradeSpanByCode = new Map();
  /** Map<currentSchoolCode, Array<{id, grade, choice, lng, lat}> > */
  const studentsBySchoolCode = new Map();

  /** Last simulation result for export */
  let lastResult = null;

  let map = null;
  let mapReady = false;
  let pendingMapResult = null;
  let articulationGeojson = null;
  let articulationLoaded = false;
  let dropdownWired = false;

  function getRosterCountForSchool(code) {
    const arr = studentsBySchoolCode.get(norm(code)) || [];
    return Array.isArray(arr) ? arr.length : 0;
  }

  function populateCloseSchoolDropdown() {
    if (!elSelect) return;
    // Only show schools that actually have students in OD_Students.csv
    const activeWithStudents = Array.from(schoolMetaByCode.values())
      .filter((s) => norm(s.status).toLowerCase() === "active")
      .map((s) => ({ ...s, __n: getRosterCountForSchool(s.code) }))
      .filter((s) => s.__n > 0)
      .sort((a, b) => (b.__n - a.__n) || (a.name || a.code).localeCompare((b.name || b.code), undefined, { sensitivity: "base" }));

    const current = norm(elSelect.value);
    elSelect.innerHTML = '<option value="">— Select a school to close —</option>';
    activeWithStudents.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.code;
      opt.textContent = `${s.name || s.code} (${s.code}) — ${s.__n.toLocaleString()} students`;
      elSelect.appendChild(opt);
    });
    if (current && activeWithStudents.some((s) => s.code === current)) elSelect.value = current;

    if (!dropdownWired) {
      dropdownWired = true;
      elSelect.addEventListener("change", () => setRunEnabled());
    }
  }

  function withCacheBust(path) {
    const sep = path.includes("?") ? "&" : "?";
    return `${path}${sep}v=${encodeURIComponent(CACHE_BUST)}`;
  }

  function norm(s) {
    return (s ?? "").toString().trim();
  }

  function normNameKey(s) {
    return norm(s).replace(/\u00A0/g, " ").replace(/\s+/g, " ").toLowerCase();
  }

  function parseNumberMaybe(v) {
    const s = norm(v).replace(/,/g, "");
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function getGradeNum(gRaw) {
    const g = norm(gRaw).toUpperCase();
    if (!g) return null;
    if (g === "PK" || g === "PREK") return -1;
    if (g === "K" || g === "KG") return 0;
    const n = Number(g);
    return Number.isFinite(n) ? n : null;
  }

  function gradeLabel(gRaw) {
    const g = norm(gRaw).toUpperCase();
    if (!g) return "";
    if (g === "PREK") return "PK";
    if (g === "KG") return "K";
    return g;
  }

  function sortGradeLabels(list) {
    const orderKey = (lbl) => {
      const u = gradeLabel(lbl);
      if (u === "PK") return -1;
      if (u === "K") return 0;
      const n = Number(u);
      return Number.isFinite(n) ? n : 999;
    };
    return (list || [])
      .map(gradeLabel)
      .filter(Boolean)
      .sort((a, b) => orderKey(a) - orderKey(b));
  }

  function gradeInDestination(gradeRaw, destGradesRaw) {
    const g = getGradeNum(gradeRaw);
    if (g === null) return false;
    const s = norm(destGradesRaw).replace(/'/g, "").toUpperCase();
    if (!s) return false;

    // Common forms: "PK-5", "K-5", "6-12"
    // If multiple ranges appear, accept if any matches.
    const parts = s.split(/[,;/]+/).map((p) => p.trim()).filter(Boolean);
    for (const p of parts) {
      const m = p.match(/^(PK|PREK|K|KG|\d+)\s*-\s*(PK|PREK|K|KG|\d+)$/i);
      if (m) {
        const a = getGradeNum(m[1]);
        const b = getGradeNum(m[2]);
        if (a === null || b === null) continue;
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        if (g >= lo && g <= hi) return true;
        continue;
      }
      // Single grade token
      const single = getGradeNum(p);
      if (single !== null && single === g) return true;
    }
    return false;
  }

  function getGradeRuleMode() {
    const el = document.querySelector('input[name="gradeRule"]:checked');
    return el ? el.value : "overlap";
  }

  function shouldForceAssignAll() {
    return !!(elForceAssignAll && elForceAssignAll.checked);
  }

  function canRun() {
    const code = norm(elSelect?.value);
    if (!decisionReady || !odStudentsReady || !coordsReady || !gradeSpansReady) return false;
    if (!code) return false;
    return getRosterCountForSchool(code) > 0;
  }

  function setRunEnabled() {
    if (elRun) elRun.disabled = !canRun();
  }

  function parseCsv(path, opts) {
    return new Promise((resolve, reject) => {
      Papa.parse(withCacheBust(path), {
        download: true,
        header: true,
        skipEmptyLines: true,
        ...opts,
        complete: (results) => resolve(results),
        error: (err) => reject(err),
      });
    });
  }

  async function loadDecisionData() {
    const res = await parseCsv(DECISION_CSV_PATH, {});
    const rows = (res && res.data) ? res.data : [];
    schoolMetaByCode.clear();

    rows.forEach((r) => {
      const code = norm(r["UniqueID"] ?? r.UniqueID);
      if (!code) return;
      const name = norm(r["Building Name"] ?? r.BuildingName ?? r["BuildingName"]);
      const status = norm(r.Status);
      const articulationArea = norm(r["Articulation Area"] ?? r["ArticulationArea"] ?? "");
      const seatsRaw = r["Available Seats"] ?? r.AvailableSeats ?? r["AvailableSeats"];
      const seats = Math.max(0, parseNumberMaybe(seatsRaw) ?? 0);
      const enrRaw = r.Enrollment ?? r["Enrollment"];
      const enrollment = Math.max(0, parseNumberMaybe(enrRaw) ?? 0);
      schoolMetaByCode.set(code, { code, name, status, seats, enrollment, articulationArea });
    });

    // Build articulation area -> school list index for popups
    try {
      const tmp = new Map();
      schoolMetaByCode.forEach((m) => {
        const area = norm(m?.articulationArea);
        const n = norm(m?.name);
        if (!area || !n) return;
        if (!tmp.has(area)) tmp.set(area, new Set());
        tmp.get(area).add(n);
      });
      articulationSchoolsByArea = new Map();
      tmp.forEach((set, area) => {
        const arr = Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }));
        articulationSchoolsByArea.set(area, arr);
      });
    } catch (e) {
      articulationSchoolsByArea = new Map();
    }

    decisionReady = true;
    setRunEnabled();
  }

  async function loadOdStudents() {
    try {
      const res = await parseCsv(OD_STUDENTS_CSV_PATH, {});
      const rows = (res && res.data) ? res.data : [];
      studentsBySchoolCode.clear();

      rows.forEach((r) => {
        const schoolCode = norm(r["Attend School Code"] ?? r.AttendSchoolCode ?? r.CurrentSchoolCode ?? r["CurrentSchoolCode"]);
        const id = norm(r.OBJECTID ?? r["OBJECTID"] ?? r.StudentID ?? r["StudentID"]);
        const grade = norm(r.Grade ?? r["Grade"] ?? r.GradeLevel ?? r["GradeLevel"]);
        const choice = norm(r.Choice ?? r["Choice"]);
        const lng = parseNumberMaybe(r.Longitude ?? r["Longitude"]);
        const lat = parseNumberMaybe(r.Latitude ?? r["Latitude"]);
        if (!schoolCode || !id) return;
        if (!studentsBySchoolCode.has(schoolCode)) studentsBySchoolCode.set(schoolCode, []);
        studentsBySchoolCode.get(schoolCode).push({ id, grade, choice, lng, lat });
      });
    } catch (e) {
      console.warn("Failed to load OD_Students.csv (filters will fall back to OD_Draft)", e);
      studentsBySchoolCode.clear();
    } finally {
      odStudentsReady = true;
      populateCloseSchoolDropdown();
      setRunEnabled();
    }
  }

  function getStudentFilterConfig() {
    const includeHome = !elIncludeHomeSchool ? true : !!elIncludeHomeSchool.checked;
    const includeChoice = !elIncludeChoice ? true : !!elIncludeChoice.checked;
    return { includeHome, includeChoice };
  }

  function choiceBucket(choiceRaw) {
    const c = norm(choiceRaw).toLowerCase();
    if (!c) return "unknown";
    if (c.includes("choice")) return "choice";
    if (c.includes("home")) return "home";
    return c;
  }

  function getDistanceConfig() {
    const min = Math.max(0, parseNumberMaybe(elMinMiles?.value) ?? 0);
    const maxRaw = parseNumberMaybe(elMaxMiles?.value);
    const max = maxRaw !== null ? Math.max(0, maxRaw) : null;
    const allowBeyondMax = !!(elAllowBeyondMax && elAllowBeyondMax.checked);
    return { min, max, allowBeyondMax };
  }

  async function loadSchoolCoordsFromMapExport() {
    const res = await parseCsv(MAP_EXPORT_CSV_PATH, {});
    const rows = (res && res.data) ? res.data : [];
    coordsByCode.clear();
    (rows || []).forEach((r) => {
      const code = norm(r["Building Code"] ?? r.BuildingCode ?? r["BuildingCode"]);
      const lat = parseNumberMaybe(r.Latitude ?? r["Latitude"]);
      const lng = parseNumberMaybe(r.Longitude ?? r["Longitude"]);
      if (!code || lat === null || lng === null) return;
      coordsByCode.set(code, [lng, lat]);
    });
    coordsReady = coordsByCode.size > 0;
  }

  async function loadGradeSpans() {
    // Infer each school's grade span from SchooltoSchoolDistances.csv
    const res = await parseCsv(SCHOOL_DISTANCES_CSV_PATH, {});
    const rows = (res && res.data) ? res.data : [];
    gradeSpanByCode.clear();

    const cleanGrades = (v) => norm(v).replace(/'/g, "").trim();

    (rows || []).forEach((r) => {
      const origin = norm(r["Origin CDE Prefix"] ?? r["Origin CDE"] ?? r["Origin CDE Code"]);
      const dest = norm(r["Destination CDE Prefix"] ?? r["Destination CDE"] ?? r["Destination CDE Code"]);
      const originGrades = cleanGrades(r["Origin Grades"] ?? r.OriginGrades);
      const destGrades = cleanGrades(r["Destination Grade"] ?? r["Destination Grades"] ?? r.DestinationGrade);
      if (origin && originGrades && !gradeSpanByCode.has(origin)) gradeSpanByCode.set(origin, originGrades);
      if (dest && destGrades && !gradeSpanByCode.has(dest)) gradeSpanByCode.set(dest, destGrades);
    });

    gradeSpansReady = gradeSpanByCode.size > 0;
  }

  async function loadArticulationAreas() {
    try {
      const res = await fetch(withCacheBust(ARTICULATION_AREAS_GEOJSON_PATH));
      const gj = await res.json();
      const crsName = norm(gj?.crs?.properties?.name);
      // Mapbox expects WGS84 lon/lat. Your file is EPSG:2232 (StatePlane feet).
      if (crsName && crsName.toUpperCase().includes("2232")) {
        if (typeof proj4 !== "function") {
          console.warn("Articulation areas are EPSG:2232 but proj4 isn't available; cannot reproject.");
        } else {
          // EPSG:2232 proj4 string from epsg.io/2232.proj4
          proj4.defs(
            "EPSG:2232",
            "+proj=lcc +lat_0=37.8333333333333 +lon_0=-105.5 +lat_1=39.75 +lat_2=38.45 +x_0=914401.828803657 +y_0=304800.609601219 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs +type=crs"
          );

          const reprojectCoords = (coords) => {
            if (!Array.isArray(coords)) return coords;
            // Leaf position [x,y]
            if (coords.length === 2 && typeof coords[0] === "number" && typeof coords[1] === "number") {
              const out = proj4("EPSG:2232", "EPSG:4326", coords);
              return out;
            }
            return coords.map(reprojectCoords);
          };

          const reprojectGeometry = (geom) => {
            if (!geom || !geom.type) return geom;
            if (!geom.coordinates) return geom;
            return { ...geom, coordinates: reprojectCoords(geom.coordinates) };
          };

          const feats = Array.isArray(gj.features) ? gj.features : [];
          const newFeatures = feats.map((f) => {
            const aaName = norm(f?.properties?.["Articulation Area"] ?? f?.properties?.ArticulationArea ?? "");
            return { ...f, properties: { ...(f.properties || {}), __aaName: aaName }, geometry: reprojectGeometry(f.geometry) };
          });
          gj.features = newFeatures;
          // Remove CRS once reprojected (GeoJSON 7946)
          try { delete gj.crs; } catch (e) {}
        }
      }

      articulationGeojson = gj;
      articulationLoaded = true;

      // If map is already up, refresh the source data immediately.
      if (mapReady && map && map.getSource("cs-articulation-areas")) {
        map.getSource("cs-articulation-areas").setData(articulationGeojson);
      }
    } catch (e) {
      console.warn("Failed to load ArticulationArea.geojson", e);
      articulationGeojson = null;
      articulationLoaded = false;
    }
  }

  function ensureMap() {
    if (map || !document.getElementById("assignmentMap")) return;
    map = new mapboxgl.Map({
      container: "assignmentMap",
      style: "mapbox://styles/mapbox/light-v11",
      center: [-105.15, 39.75],
      zoom: 9,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      mapReady = true;

      // Articulation areas (optional overlay)
      map.addSource("cs-articulation-areas", {
        type: "geojson",
        data: articulationGeojson || { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "cs-articulation-fill",
        type: "fill",
        source: "cs-articulation-areas",
        layout: { visibility: (elToggleArticulationAreas && elToggleArticulationAreas.checked) ? "visible" : "none" },
        paint: {
          "fill-color": "#f59e0b",
          "fill-opacity": 0.12,
        },
      });
      map.addLayer({
        id: "cs-articulation-outline",
        type: "line",
        source: "cs-articulation-areas",
        layout: { visibility: (elToggleArticulationAreas && elToggleArticulationAreas.checked) ? "visible" : "none" },
        paint: {
          "line-color": "#f59e0b",
          "line-opacity": 0.45,
          "line-width": 1.5,
        },
      });

      // Hover/click popups for articulation areas
      const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: false });
      let pinned = false;
      popup.on("close", () => { pinned = false; });
      const buildPopupHtml = (areaName) => {
        const list = articulationSchoolsByArea && articulationSchoolsByArea.get(areaName) ? articulationSchoolsByArea.get(areaName) : [];
        const maxShow = 30;
        const shown = list.slice(0, maxShow);
        const more = list.length > maxShow ? (list.length - maxShow) : 0;
        const esc = (s) => String(s).replace(/</g, "&lt;");
        const items = shown.map((s) => `<li style="margin:0 0 2px 0;">${esc(s)}</li>`).join("");
        const moreLine = more ? `<div style="margin-top:6px; color:#6b7280; font-size:12px;">+${more} more…</div>` : "";
        return (
          `<div style="font-weight:900; margin-bottom:6px;">${esc(areaName)} Area</div>` +
          `<div style="max-height:180px; overflow:auto; border-top:1px solid #e5e7eb; padding-top:6px;">` +
          `<div style="font-size:12px; color:#6b7280; margin-bottom:4px;">Schools (${list.length}):</div>` +
          `<ul style="padding-left:18px; margin:0;">${items}</ul>` +
          `${moreLine}` +
          `</div>`
        );
      };

      map.on("mouseenter", "cs-articulation-fill", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "cs-articulation-fill", () => {
        map.getCanvas().style.cursor = "";
        if (!pinned) popup.remove();
      });
      map.on("mousemove", "cs-articulation-fill", (e) => {
        if (pinned) return;
        const f = e.features && e.features[0] ? e.features[0] : null;
        const areaName = f && f.properties ? (f.properties.__aaName || f.properties["Articulation Area"] || "") : "";
        if (!areaName) return;
        popup.setLngLat(e.lngLat).setHTML(buildPopupHtml(areaName)).addTo(map);
      });
      map.on("click", "cs-articulation-fill", (e) => {
        const f = e.features && e.features[0] ? e.features[0] : null;
        const areaName = f && f.properties ? (f.properties.__aaName || f.properties["Articulation Area"] || "") : "";
        if (!areaName) return;
        pinned = true;
        popup.setLngLat(e.lngLat).setHTML(buildPopupHtml(areaName)).addTo(map);
      });

      map.addSource("cs-assignments", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addSource("cs-destinations", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addSource("cs-origin", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Flow lines
      map.addLayer({
        id: "cs-flow-lines",
        type: "line",
        source: "cs-assignments",
        paint: {
          "line-color": "#2563eb",
          "line-opacity": 0.25,
          "line-width": [
            "interpolate",
            ["linear"],
            ["get", "count"],
            1, 1,
            50, 3,
            200, 6,
          ],
        },
      });

      // Destination bubbles
      map.addLayer({
        id: "cs-destination-circles",
        type: "circle",
        source: "cs-destinations",
        paint: {
          "circle-color": "#2563eb",
          "circle-opacity": 0.7,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "count"],
            1, 6,
            50, 12,
            200, 20,
          ],
        },
      });

      // Closed school marker
      map.addLayer({
        id: "cs-origin-circle",
        type: "circle",
        source: "cs-origin",
        paint: {
          "circle-color": "#111827",
          "circle-opacity": 0.95,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
          "circle-radius": 10,
        },
      });

      // If a result was rendered before the map finished loading, draw it now.
      const toDraw = pendingMapResult || lastResult;
      pendingMapResult = null;
      if (toDraw) {
        setTimeout(() => updateMapWithResult(toDraw), 0);
      }
    });
  }

  function setArticulationVisibility(show) {
    if (!mapReady || !map) return;
    const vis = show ? "visible" : "none";
    if (map.getLayer("cs-articulation-fill")) map.setLayoutProperty("cs-articulation-fill", "visibility", vis);
    if (map.getLayer("cs-articulation-outline")) map.setLayoutProperty("cs-articulation-outline", "visibility", vis);
  }

  function updateMapWithResult(result) {
    ensureMap();
    if (!map || !result) return;
    if (!mapReady) {
      pendingMapResult = result;
      return;
    }

    const originMeta = schoolMetaByCode.get(result.closeCode) || null;
    const originCoords = coordsByCode.get(result.closeCode) || null;
    if (!originCoords) return;

    const destFeatures = [];
    const lineFeatures = [];

    (result.destRows || []).forEach((r) => {
      const destCoords = coordsByCode.get(r.code) || null;
      if (!destCoords) return;

      destFeatures.push({
        type: "Feature",
        properties: {
          code: r.code,
          name: r.name,
          count: r.assigned,
        },
        geometry: { type: "Point", coordinates: destCoords },
      });

      lineFeatures.push({
        type: "Feature",
        properties: {
          destCode: r.code,
          destName: r.name,
          count: r.assigned,
        },
        geometry: { type: "LineString", coordinates: [originCoords, destCoords] },
      });
    });

    const originFc = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            code: result.closeCode,
            name: originMeta ? (originMeta.name || result.closeCode) : result.closeCode,
          },
          geometry: { type: "Point", coordinates: originCoords },
        },
      ],
    };
    const destFc = { type: "FeatureCollection", features: destFeatures };
    const linesFc = { type: "FeatureCollection", features: lineFeatures };

    const srcLines = map.getSource("cs-assignments");
    const srcDest = map.getSource("cs-destinations");
    const srcOrigin = map.getSource("cs-origin");
    if (srcLines) srcLines.setData(linesFc);
    if (srcDest) srcDest.setData(destFc);
    if (srcOrigin) srcOrigin.setData(originFc);

    // Fit bounds
    const all = [originCoords, ...destFeatures.map((f) => f.geometry.coordinates)];
    if (all.length) {
      let minLng = all[0][0], maxLng = all[0][0], minLat = all[0][1], maxLat = all[0][1];
      all.forEach(([lng, lat]) => {
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      });
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 40, duration: 500 });
    }
  }

  function updateProgress(pct, meta) {
    if (elProg) elProg.value = Math.max(0, Math.min(100, pct));
    if (elProgMeta) elProgMeta.textContent = meta || "";
  }

  // OD_Draft is intentionally not used (students are sourced from OD_Students + coordinates).

  function buildKpis(obj) {
    const mk = (k, v) => {
      const div = document.createElement("div");
      div.className = "kpi";
      div.innerHTML = `<div class="k">${k}</div><div class="v">${v}</div>`;
      return div;
    };
    elKpis.innerHTML = "";
    elKpis.appendChild(mk("Impacted students", obj.impacted.toLocaleString()));
    elKpis.appendChild(mk("Assigned", obj.assigned.toLocaleString()));
    elKpis.appendChild(mk("Unassigned", obj.unassigned.toLocaleString()));
    elKpis.appendChild(mk("Current avg miles", obj.currentAvgMiles));
    elKpis.appendChild(mk("Scenario avg miles", obj.scenarioAvgMiles));
    elKpis.appendChild(mk("Scenario max miles (home→new)", obj.scenarioMaxMiles));
  }

  function milesCrow(lng1, lat1, lng2, lat2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 3958.8; // miles
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function runSimulation(closeCode, allowNonOverlapping, forceAssignAll) {
    const rosterFromOdStudents = studentsBySchoolCode.get(closeCode) || [];
    const { includeHome, includeChoice } = getStudentFilterConfig();
    const { min, max, allowBeyondMax } = getDistanceConfig();

    const filteredRoster = rosterFromOdStudents.filter((s) => {
      const b = choiceBucket(s.choice);
      if (b === "choice") return includeChoice;
      if (b === "home") return includeHome;
      return includeHome || includeChoice;
    });

    const impacted = filteredRoster.length;

    // Remaining seats per destination (Active only)
    const remaining = new Map();
    schoolMetaByCode.forEach((m, code) => {
      const isActive = norm(m.status).toLowerCase() === "active";
      if (!isActive) return;
      remaining.set(code, Math.max(0, Number(m.seats) || 0));
    });

    const destAgg = new Map(); // code -> stats
    let assigned = 0;
    let unassigned = 0;
    let scenarioMilesSum = 0;
    let scenarioMilesMax = 0;
    let exceededMax = 0;
    let currentMilesSum = 0;
    let currentMilesMax = 0;
    let currentMilesCount = 0;

    const originCoords = coordsByCode.get(closeCode) || null;

    const candidates = [];
    schoolMetaByCode.forEach((m, code) => {
      if (code === closeCode) return;
      if (norm(m.status).toLowerCase() !== "active") return;
      const coords = coordsByCode.get(code) || null;
      if (!coords) return;
      candidates.push({
        code,
        name: m.name || code,
        coords,
        gradeSpan: gradeSpanByCode.get(code) || "",
      });
    });

    filteredRoster.forEach((s) => {
      const grade = norm(s.grade);
      const slng = s.lng;
      const slat = s.lat;
      if (slng === null || slng === undefined || slat === null || slat === undefined) {
        unassigned += 1;
        return;
      }
      if (!Number.isFinite(Number(slng)) || !Number.isFinite(Number(slat))) {
        unassigned += 1;
        return;
      }

      // Baseline: current home -> current school distance
      if (originCoords) {
        const d0 = milesCrow(Number(slng), Number(slat), originCoords[0], originCoords[1]);
        if (Number.isFinite(d0)) {
          currentMilesSum += d0;
          currentMilesMax = Math.max(currentMilesMax, d0);
          currentMilesCount += 1;
        }
      }

      const options = [];
      for (const c of candidates) {
        const d = milesCrow(Number(slng), Number(slat), c.coords[0], c.coords[1]);
        if (!Number.isFinite(d)) continue;
        if (d < min) continue;
        const overlaps = gradeInDestination(grade, c.gradeSpan);
        options.push({ code: c.code, name: c.name, miles: d, overlaps, gradeSpan: c.gradeSpan });
      }
      options.sort((a, b) => a.miles - b.miles);

      const optionsWithinMax = (max !== null) ? options.filter((o) => o.miles <= max) : options;
      const searchList = (optionsWithinMax.length > 0 || !allowBeyondMax || max === null) ? optionsWithinMax : options;

      let chosen = null;
      for (const opt of searchList) {
        const seatsLeft = remaining.get(opt.code) ?? 0;
        if (!forceAssignAll && seatsLeft <= 0) continue;
        if (!opt.overlaps && !allowNonOverlapping && !forceAssignAll) continue;
        chosen = opt;
        remaining.set(opt.code, seatsLeft - 1);
        break;
      }
      if (!chosen) {
        unassigned += 1;
        return;
      }

      assigned += 1;
      scenarioMilesSum += chosen.miles;
      scenarioMilesMax = Math.max(scenarioMilesMax, chosen.miles);
      if (max !== null && chosen.miles > max) exceededMax += 1;

      let rec = destAgg.get(chosen.code);
      if (!rec) {
        rec = {
          code: chosen.code,
          name: chosen.name,
          assigned: 0,
          milesSum: 0,
          milesMax: 0,
          addedGradesSet: new Set(),
        };
        destAgg.set(chosen.code, rec);
      }
      rec.assigned += 1;
      rec.milesSum += chosen.miles;
      rec.milesMax = Math.max(rec.milesMax, chosen.miles);
      // Added grade tracking:
      // - in allowNonOverlapping mode, track any student assigned to a non-overlapping destination
      // - in forceAssignAll mode, we may have allowed a non-overlap assignment as a fallback too
      if (!chosen.overlaps && (allowNonOverlapping || forceAssignAll)) {
        const gl = gradeLabel(grade);
        if (gl) rec.addedGradesSet.add(gl);
      }
    });

    const scenarioAvgMiles = assigned ? (scenarioMilesSum / assigned) : 0;
    const currentAvgMiles = currentMilesCount ? (currentMilesSum / currentMilesCount) : 0;

    const destRows = Array.from(destAgg.values())
      .map((r) => {
        const seatsLeft = remaining.get(r.code) ?? 0;
        const avg = r.assigned ? (r.milesSum / r.assigned) : 0;
        const addedGrades = allowNonOverlapping ? sortGradeLabels(Array.from(r.addedGradesSet || [])) : [];
        return {
          ...r,
          seatsLeft,
          avgMiles: avg,
          addedGrades,
          addedGradesText: allowNonOverlapping ? (addedGrades.join(", ") || "—") : "—",
        };
      })
      .sort((a, b) => (b.assigned - a.assigned) || (a.avgMiles - b.avgMiles));

    return {
      closeCode,
      impacted,
      assigned,
      unassigned,
      currentAvgMiles,
      currentMaxMiles: currentMilesMax,
      scenarioAvgMiles,
      scenarioMaxMiles: scenarioMilesMax,
      exceededMax,
      destRows,
      remainingSeatsByCode: remaining,
      allowNonOverlapping,
      forceAssignAll,
      filters: { includeHome, includeChoice, minMiles: min, maxMiles: max, allowBeyondMax },
    };
  }

  function renderResult(result) {
    lastResult = result;
    if (!elResultsCard) return;

    const fmtMiles = (n) => {
      if (!Number.isFinite(n)) return "—";
      return n.toFixed(2);
    };

    buildKpis({
      impacted: result.impacted || 0,
      assigned: result.assigned || 0,
      unassigned: result.unassigned || 0,
      currentAvgMiles: (result.currentAvgMiles && result.currentAvgMiles > 0) ? fmtMiles(result.currentAvgMiles) : "—",
      scenarioAvgMiles: result.assigned ? fmtMiles(result.scenarioAvgMiles) : "—",
      scenarioMaxMiles: result.assigned ? fmtMiles(result.scenarioMaxMiles) : "—",
    });

    elDestTbody.innerHTML = "";
    result.destRows.forEach((r) => {
      const tr = document.createElement("tr");
      const avg = r.assigned ? (r.avgMiles || 0) : 0;
      tr.innerHTML =
        `<td title="${r.code}">${r.name} <span class="muted">(${r.code})</span></td>` +
        `<td class="right">${r.assigned.toLocaleString()}</td>` +
        `<td class="right">${Number(r.seatsLeft || 0).toLocaleString()}</td>` +
        `<td class="right">${fmtMiles(avg)}</td>` +
        `<td class="right">${fmtMiles(r.milesMax || 0)}</td>` +
        `<td>${r.addedGradesText || "—"}</td>`;
      elDestTbody.appendChild(tr);
    });

    if (result.unassigned) {
      const tr = document.createElement("tr");
      const suffix = result.unmodeled ? ` <span class="muted">(includes ${result.unmodeled.toLocaleString()} not found in OD_Draft)</span>` : ' <span class="muted">(no seats found)</span>';
      tr.innerHTML =
        `<td><strong>Unassigned</strong>${suffix}</td>` +
        `<td class="right"><strong>${result.unassigned.toLocaleString()}</strong></td>` +
        `<td class="right">—</td>` +
        `<td class="right">—</td>` +
        `<td class="right">—</td>` +
        `<td class="right">—</td>`;
      elDestTbody.appendChild(tr);
    }

    const closedMeta = schoolMetaByCode.get(result.closeCode);
    const f = result.filters || {};
    const filterNote =
      ` Filters: ` +
      `${f.includeHome ? "Home School" : ""}${(f.includeHome && f.includeChoice) ? " + " : ""}${f.includeChoice ? "Choice" : ""}` +
      `, miles ${Number(f.minMiles || 0).toFixed(1)}–${(f.maxMiles === null || f.maxMiles === undefined) ? "∞" : Number(f.maxMiles).toFixed(1)}` +
      `${f.maxMiles !== null && f.allowBeyondMax ? " (soft max)" : ""}.`;
    elResultsNote.textContent =
      `Closed school: ${closedMeta ? (closedMeta.name || result.closeCode) : result.closeCode} (${result.closeCode}). ` +
      `Rule: ${result.allowNonOverlapping ? "allow non-overlapping grades" : "overlapping grades only"}.` +
      ` Distances are crow-fly miles from student home → school.` +
      filterNote;

    elResultsCard.classList.remove("hidden");
    if (elExport) elExport.disabled = !lastResult;

    updateMapWithResult(result);
  }

  function csvEscape(v) {
    const s = (v ?? "").toString();
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function exportLastResultCsv() {
    if (!lastResult) return;
    const rows = [];
    rows.push([
      "DestinationSchoolCode",
      "DestinationSchoolName",
      "Assigned",
      "RemainingSeats",
      "AvgMiles",
      "MaxMiles",
      "AddedGrades",
    ]);
    lastResult.destRows.forEach((r) => {
      const avg = r.assigned ? (r.avgMiles || 0) : 0;
      rows.push([
        r.code,
        r.name,
        r.assigned,
        r.seatsLeft,
        Number.isFinite(avg) ? avg.toFixed(3) : "",
        Number.isFinite(r.milesMax) ? Number(r.milesMax).toFixed(3) : "",
        r.addedGradesText || "",
      ]);
    });
    if (lastResult.unassigned) {
      rows.push(["UNASSIGNED", "Unassigned (no seats found)", lastResult.unassigned, "", "", "", ""]);
    }

    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    const safeCode = norm(lastResult.closeCode).replace(/[^A-Za-z0-9_-]+/g, "_");
    a.download = `closure_scenario_${safeCode}_${lastResult.allowNonOverlapping ? "allow" : "overlap"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function wireUI() {
    if (elRun) {
      elRun.addEventListener("click", () => {
        if (!canRun()) return;
        const closeCode = norm(elSelect.value);
        const allow = getGradeRuleMode() === "allow";
        const result = runSimulation(closeCode, allow, shouldForceAssignAll());
        renderResult(result);
      });
    }
    if (elExport) {
      elExport.addEventListener("click", exportLastResultCsv);
    }
    document.querySelectorAll('input[name="gradeRule"]').forEach((el) => {
      el.addEventListener("change", () => {
        // If user already ran a scenario, rerun instantly.
        if (!lastResult) return;
        if (!canRun()) return;
        const closeCode = norm(elSelect.value);
        const allow = getGradeRuleMode() === "allow";
        const result = runSimulation(closeCode, allow, shouldForceAssignAll());
        renderResult(result);
      });
    });
    if (elForceAssignAll) {
      elForceAssignAll.addEventListener("change", () => {
        if (!lastResult) return;
        if (!canRun()) return;
        const closeCode = norm(elSelect.value);
        const allow = getGradeRuleMode() === "allow";
        const result = runSimulation(closeCode, allow, shouldForceAssignAll());
        renderResult(result);
      });
    }
    [elIncludeHomeSchool, elIncludeChoice, elMinMiles, elMaxMiles, elAllowBeyondMax].forEach((el) => {
      if (!el) return;
      el.addEventListener("change", () => {
        if (!lastResult) return;
        if (!canRun()) return;
        const closeCode = norm(elSelect.value);
        const allow = getGradeRuleMode() === "allow";
        const result = runSimulation(closeCode, allow, shouldForceAssignAll());
        renderResult(result);
      });
    });
    if (elToggleArticulationAreas) {
      elToggleArticulationAreas.addEventListener("change", () => {
        // Ensure map is created before toggling
        ensureMap();
        setArticulationVisibility(!!elToggleArticulationAreas.checked);
      });
    }
  }

  async function main() {
    try {
      wireUI();
      updateProgress(0, "Loading Decision Data Export (seats)…");
      await loadDecisionData();
      await loadSchoolCoordsFromMapExport();
      await loadGradeSpans();
      await loadArticulationAreas();
      await loadOdStudents();
      updateProgress(100, "Student roster loaded (OD_Students).");
    } catch (e) {
      console.error("Closure scenarios failed to load", e);
      updateProgress(0, "Error loading data. See console for details.");
    }
  }

  main();
})();

