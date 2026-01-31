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

  // Articulation area colors (match dashboard regional palette)
  const CS_ARTICULATION_AREA_COLORS = {
    // Northwest (green): Arvada West, Green Mountain, Golden, Ralston Valley
    "Arvada West": "#c7d59b",
    "Green Mountain": "#c7d59b",
    "Golden": "#c7d59b",
    "Ralston Valley": "#c7d59b",
    // Northeast (blue): Arvada, Pomona, Standley Lake
    "Arvada": "#82c9e8",
    "Pomona": "#82c9e8",
    "Standley Lake": "#82c9e8",
    // Central (red/pink): Wheat Ridge, Lakewood, Jefferson, Alameda
    "Wheat Ridge": "#e7a3a7",
    "Lakewood": "#e7a3a7",
    "Jefferson": "#e7a3a7",
    "Alameda": "#e7a3a7",
    // Southeast (purple): Bear Creek, Chatfield, Dakota Ridge, Columbine
    "Bear Creek": "#b693c9",
    "Chatfield": "#b693c9",
    "Dakota Ridge": "#b693c9",
    "Columbine": "#b693c9",
    // Mountain (orange): Conifer, Evergreen
    "Conifer": "#f1bd7b",
    "Evergreen": "#f1bd7b",
  };

  function getCsArticulationColorExpression() {
    const expr = ["match", ["get", "__aaName"]];
    Object.entries(CS_ARTICULATION_AREA_COLORS).forEach(([name, color]) => {
      expr.push(name, color);
    });
    expr.push("#94a3b8");
    return expr;
  }

  // Match main dashboard token
  mapboxgl.accessToken = "pk.eyJ1IjoicGF0d2QwNSIsImEiOiJjbTZ2bGVhajIwMTlvMnFwc2owa3BxZHRoIn0.moDNfqMUolnHphdwsIF87w";

  const elSelect = document.getElementById("closeSchoolSelect");
  const elRun = document.getElementById("runBtn");
  const elResultsCard = document.getElementById("resultsCard");
  const elKpis = document.getElementById("kpis");
  const elDestTbody = document.getElementById("destTbody");
  const elResultsNote = document.getElementById("resultsNote");
  const elProgWrap = document.getElementById("odProgress");
  const elProg = document.getElementById("odProgressBar");
  const elProgMeta = document.getElementById("odProgressMeta");
  const elToggleArticulationAreas = document.getElementById("toggleArticulationAreas");
  const elIncludeHomeSchool = document.getElementById("includeHomeSchool");
  const elIncludeChoice = document.getElementById("includeChoice");
  const elIncludeOutOfDistrictChoice = document.getElementById("includeOutOfDistrictChoice");
  const elMinMiles = document.getElementById("minMiles");
  const elMaxMiles = document.getElementById("maxMiles");
  const elAllowBeyondMax = document.getElementById("allowBeyondMax");
  const elDrawerToggle = document.getElementById("csDrawerToggle");
  const elDrawerClose = document.getElementById("csDrawerClose");
  const elDrawerBackdrop = document.getElementById("csDrawerBackdrop");
  const elDrawerPin = document.getElementById("csDrawerPin");
  const elMapFullscreenBtn = document.getElementById("csMapFullscreenBtn");
  const elToggleStudentOrigins = document.getElementById("toggleStudentOrigins");
  const elToggleStudentDecisions = document.getElementById("toggleStudentDecisions");
  const elExcludeDestinations = document.getElementById("csExcludeDestinations");
  const elClearExcludedDestinations = document.getElementById("csClearExcludedDestinations");

  const CS_PIN_KEY = "csScenarioPinned";
  const CS_EXCLUDE_DEST_KEY = "csExcludedDestinations_v1";

  let decisionReady = false;
  let odStudentsReady = false;
  let coordsReady = false;
  let gradeSpansReady = false;

  /** Map<schoolCode, { name, status, seats, enrollment } > */
  const schoolMetaByCode = new Map();
  /** Map<articulationAreaKey, Array<schoolName>> (key is normalized) */
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
  let pendingSchoolsFc = null;
  let pendingStudentOriginLinesFc = null;
  let pendingStudentDecisionLinesFc = null;
  let articulationGeojson = null;
  let articulationLoaded = false;
  let dropdownWired = false;
  let excludedDestinations = new Set(); // Set<schoolCode>

  // Assignment behavior:
  // - Capacity is always respected (remaining seats never negative)
  // - Grade rule is respected unless user explicitly allows non-overlap
  // - "Allow beyond max" only relaxes the distance constraint as a fallback
  const FORCE_ASSIGN_ALL = false;

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
      .sort((a, b) => (a.name || a.code).localeCompare((b.name || b.code), undefined, { sensitivity: "base", numeric: true }));

    const current = norm(elSelect.value);
    elSelect.innerHTML = '<option value="">— Select a school to close —</option>';
    activeWithStudents.forEach((s) => {
      const enrollment = Number(s.enrollment) || 0;
      const seats = Number(s.seats) || 0;
      const cap = enrollment + seats;
      const utilPct = cap > 0 ? (enrollment / cap) * 100 : null;
      const utilText = (utilPct === null) ? "— util" : `${utilPct.toFixed(0)}% util`;
      const opt = document.createElement("option");
      opt.value = s.code;
      opt.textContent = `${s.name || s.code} (${s.code}) — ${s.__n.toLocaleString()} students — ${utilText}`;
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

  function normalizeSchoolCode(codeRaw) {
    // OD_Students.csv sometimes uses non-zero-padded codes like "CO-1420-30"
    // while Decision/Map data uses "CO-1420-0030". Normalize to padded form.
    const s = norm(codeRaw);
    if (!s) return "";
    const m = s.match(/^(.*-)(\d+)$/);
    if (!m) return s;
    const prefix = m[1];
    const num = m[2];
    // Only pad short numeric suffixes; keep 4+ digits as-is.
    const padded = num.length < 4 ? num.padStart(4, "0") : num;
    return `${prefix}${padded}`;
  }

  function loadExcludedDestinationsFromStorage() {
    let raw = "";
    try { raw = localStorage.getItem(CS_EXCLUDE_DEST_KEY) || ""; } catch (e) { raw = ""; }
    const out = new Set();
    try {
      const arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) {
        arr.forEach((v) => {
          const c = norm(v);
          if (c) out.add(c);
        });
      }
    } catch (e) {}
    excludedDestinations = out;
  }

  function persistExcludedDestinationsToStorage() {
    try { localStorage.setItem(CS_EXCLUDE_DEST_KEY, JSON.stringify(Array.from(excludedDestinations || []))); } catch (e) {}
  }

  function populateExcludedDestinationsDropdown() {
    if (!elExcludeDestinations) return;
    // Populate from Active schools with coords (valid destinations)
    const list = Array.from(schoolMetaByCode.values())
      .filter((s) => norm(s.status).toLowerCase() === "active")
      .filter((s) => coordsByCode.has(s.code))
      .sort((a, b) => (a.name || a.code).localeCompare((b.name || b.code), undefined, { sensitivity: "base", numeric: true }));

    elExcludeDestinations.innerHTML = "";
    list.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.code;
      opt.textContent = `${s.name || s.code} (${s.code})`;
      if (excludedDestinations && excludedDestinations.has(s.code)) opt.selected = true;
      elExcludeDestinations.appendChild(opt);
    });
  }

  function normNameKey(s) {
    return norm(s).replace(/\u00A0/g, " ").replace(/\s+/g, " ").toLowerCase();
  }

  function normalizeArticulationAreaKey(v) {
    // Match dashboard behavior, but also collapse whitespace/NBSP.
    return norm(v).replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setTopbarHeightVar() {
    try {
      const topbar = document.querySelector(".topbar");
      if (!topbar) return;
      const h = Math.max(40, Math.round(topbar.getBoundingClientRect().height || 0));
      document.documentElement.style.setProperty("--cs-topbar-h", `${h}px`);
    } catch (e) {}
  }

  function mapResizeSoon() {
    if (!map) return;
    try {
      setTimeout(() => {
        try { map.resize(); } catch (e2) {}
      }, 60);
    } catch (e) {}
  }

  function isPinned() {
    return !!document.body.classList.contains("cs-drawer-pinned");
  }

  function openDrawer() {
    document.body.classList.add("cs-drawer-open");
    mapResizeSoon();
  }
  function closeDrawer() {
    if (isPinned()) return;
    document.body.classList.remove("cs-drawer-open");
    mapResizeSoon();
  }
  function toggleFullscreen() {
    const on = !document.body.classList.contains("cs-fullscreen");
    document.body.classList.toggle("cs-fullscreen", on);
    mapResizeSoon();
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
    // Normalize common variants coming from OD_Students.csv (e.g., "KGF")
    if (g === "PK" || g === "PREK" || g.startsWith("PK")) return -1;
    if (g === "K" || g === "KG" || g.startsWith("KG") || g === "KF") return 0;
    const n = Number(g);
    return Number.isFinite(n) ? n : null;
  }

  function gradeLabel(gRaw) {
    const g = norm(gRaw).toUpperCase();
    if (!g) return "";
    if (g === "PREK" || g.startsWith("PK")) return "PK";
    if (g === "KG" || g.startsWith("KG") || g === "KF") return "K";
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
      const code = normalizeSchoolCode(r["UniqueID"] ?? r.UniqueID);
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

    decisionReady = true;
    setRunEnabled();
  }

  async function loadOdStudents() {
    try {
      const res = await parseCsv(OD_STUDENTS_CSV_PATH, {});
      const rows = (res && res.data) ? res.data : [];
      studentsBySchoolCode.clear();

      rows.forEach((r) => {
        const schoolCode = normalizeSchoolCode(r["Attend School Code"] ?? r.AttendSchoolCode ?? r.CurrentSchoolCode ?? r["CurrentSchoolCode"]);
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
    const includeOutOfDistrictChoice = !elIncludeOutOfDistrictChoice ? true : !!elIncludeOutOfDistrictChoice.checked;
    return { includeHome, includeChoice, includeOutOfDistrictChoice };
  }

  function choiceBucket(choiceRaw) {
    const c = norm(choiceRaw).toLowerCase();
    if (!c) return "unknown";
    if (c.includes("out of district")) return "out_of_district_choice";
    if (c.includes("ood")) return "out_of_district_choice";
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
    // Build articulation area -> schools index from Map_Export.csv (matches dashboard behavior)
    const tmpByArea = new Map(); // areaKey -> Set(schoolName)
    (rows || []).forEach((r) => {
      const code = normalizeSchoolCode(r["Building Code"] ?? r.BuildingCode ?? r["BuildingCode"]);
      const name = norm(r["Building Name"] ?? r.BuildingName ?? r["BuildingName"]);
      const areaRaw = norm(r["Articulation"] ?? r["Articulation Area"] ?? r["ArticulationArea"] ?? "");
      const areaKey = normalizeArticulationAreaKey(areaRaw);
      const lat = parseNumberMaybe(r.Latitude ?? r["Latitude"]);
      const lng = parseNumberMaybe(r.Longitude ?? r["Longitude"]);
      if (!code || lat === null || lng === null) return;
      coordsByCode.set(code, [lng, lat]);

      // Map_Export.csv uses a sentinel for schools not in an articulation area
      if (areaKey && name) {
        if (areaKey !== "noarticulationarea" && areaKey !== "no articulation area" && areaKey !== "n/a") {
          if (!tmpByArea.has(areaKey)) tmpByArea.set(areaKey, new Set());
          tmpByArea.get(areaKey).add(name);
        }
      }
    });
    coordsReady = coordsByCode.size > 0;

    // Finalize articulationSchoolsByArea (sorted arrays)
    try {
      const out = new Map();
      tmpByArea.forEach((set, areaKey) => {
        const arr = Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }));
        out.set(areaKey, arr);
      });
      articulationSchoolsByArea = out;
    } catch (e) {
      articulationSchoolsByArea = new Map();
    }

    // If map is already up, draw all schools dots now (even before a run).
    updateSchoolsLayer(null, []);
  }

  function buildSchoolsFeatureCollection(closeCode, destRows) {
    const close = norm(closeCode);
    const destCountByCode = new Map();
    (destRows || []).forEach((r) => {
      const c = normalizeSchoolCode(r?.code);
      const n = Number(r?.assigned) || 0;
      if (c) destCountByCode.set(c, n);
    });

    const features = [];
    schoolMetaByCode.forEach((m, code) => {
      if (norm(m.status).toLowerCase() !== "active") return;
      const coords = coordsByCode.get(code);
      if (!coords) return;
      const receiving = destCountByCode.get(code) || 0;
      features.push({
        type: "Feature",
        properties: {
          code,
          name: m.name || code,
          isClosed: close && code === close,
          isReceiving: receiving > 0,
          receiving,
        },
        geometry: { type: "Point", coordinates: coords },
      });
    });
    return { type: "FeatureCollection", features };
  }

  function updateSchoolsLayer(closeCode, destRows) {
    ensureMap();
    const fc = buildSchoolsFeatureCollection(closeCode, destRows);
    if (!mapReady || !map) {
      pendingSchoolsFc = fc;
      return;
    }
    const src = map.getSource("cs-schools");
    if (src) src.setData(fc);
  }

  async function loadGradeSpans() {
    // Infer each school's grade span from SchooltoSchoolDistances.csv
    const res = await parseCsv(SCHOOL_DISTANCES_CSV_PATH, {});
    const rows = (res && res.data) ? res.data : [];
    gradeSpanByCode.clear();

    const cleanGrades = (v) => norm(v).replace(/'/g, "").trim();

    (rows || []).forEach((r) => {
      const origin = normalizeSchoolCode(r["Origin CDE Prefix"] ?? r["Origin CDE"] ?? r["Origin CDE Code"]);
      const dest = normalizeSchoolCode(r["Destination CDE Prefix"] ?? r["Destination CDE"] ?? r["Destination CDE Code"]);
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
          "fill-color": getCsArticulationColorExpression(),
          "fill-opacity": 0.12,
        },
      });
      map.addLayer({
        id: "cs-articulation-outline",
        type: "line",
        source: "cs-articulation-areas",
        layout: { visibility: (elToggleArticulationAreas && elToggleArticulationAreas.checked) ? "visible" : "none" },
        paint: {
          "line-color": getCsArticulationColorExpression(),
          "line-opacity": 0.45,
          "line-width": 1.5,
        },
      });

      // Hover/click popups for articulation areas
      const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: false });
      let pinned = false;
      popup.on("close", () => { pinned = false; });

      const buildPopupHtml = (areaName) => {
        const areaKey = normalizeArticulationAreaKey(areaName);
        const list = articulationSchoolsByArea && articulationSchoolsByArea.get(areaKey) ? articulationSchoolsByArea.get(areaKey) : [];
        const maxShow = 30;
        const shown = list.slice(0, maxShow);
        const more = list.length > maxShow ? (list.length - maxShow) : 0;
        const items = shown.map((s) => `<li style="margin:0 0 2px 0;">${escapeHtml(s)}</li>`).join("");
        const moreLine = more ? `<div style="margin-top:6px; color:#6b7280; font-size:12px;">+${more} more…</div>` : "";
        return (
          `<div style="font-weight:900; margin-bottom:6px;">${escapeHtml(areaName)} Area</div>` +
          `<div style="max-height:180px; overflow:auto; border-top:1px solid #e5e7eb; padding-top:6px;">` +
          `<div style="font-size:12px; color:#6b7280; margin-bottom:4px;">Schools (${list.length}):</div>` +
          `${list.length ? `<ul style="padding-left:18px; margin:0;">${items}</ul>` : `<div style="color:#6b7280; font-size:12px;">No schools found for this area.</div>`}` +
          `${moreLine}` +
          `</div>`
        );
      };

      map.on("mouseenter", "cs-articulation-fill", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "cs-articulation-fill", () => { map.getCanvas().style.cursor = ""; });
      map.on("click", "cs-articulation-fill", (e) => {
        const f = e.features && e.features[0] ? e.features[0] : null;
        const areaName = f && f.properties ? (f.properties.__aaName || f.properties["Articulation Area"] || "") : "";
        if (!areaName) return;
        pinned = true;
        popup.setLngLat(e.lngLat).setHTML(buildPopupHtml(areaName)).addTo(map);
      });

      // Click-away to dismiss articulation popup (manual click-out)
      map.on("click", (e) => {
        if (!pinned) return;
        let hits = [];
        try {
          hits = map.queryRenderedFeatures(e.point, { layers: ["cs-articulation-fill"] }) || [];
        } catch (err) {
          hits = [];
        }
        if (!hits.length) {
          popup.remove();
          pinned = false;
        }
      });

      map.addSource("cs-assignments", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addSource("cs-origin", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addSource("cs-schools", {
        type: "geojson",
        data: pendingSchoolsFc || { type: "FeatureCollection", features: [] },
      });
      map.addSource("cs-student-origins", {
        type: "geojson",
        data: pendingStudentOriginLinesFc || { type: "FeatureCollection", features: [] },
      });
      map.addSource("cs-student-decisions", {
        type: "geojson",
        data: pendingStudentDecisionLinesFc || { type: "FeatureCollection", features: [] },
      });

      // Student origin lines (home -> closed school). Light orange.
      map.addLayer({
        id: "cs-student-origin-lines",
        type: "line",
        source: "cs-student-origins",
        layout: { visibility: (elToggleStudentOrigins && elToggleStudentOrigins.checked) ? "visible" : "none" },
        paint: {
          "line-color": "#f59e0b",
          "line-opacity": 0.08,
          "line-width": 0.7,
        },
      });
      // Student decision lines (home -> assigned destination). Thin purple.
      map.addLayer({
        id: "cs-student-decision-lines",
        type: "line",
        source: "cs-student-decisions",
        layout: { visibility: (elToggleStudentDecisions && elToggleStudentDecisions.checked) ? "visible" : "none" },
        paint: {
          "line-color": "#7c3aed",
          "line-opacity": 0.09,
          "line-width": 0.7,
        },
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

      // All schools dots (orange if not receiving; blue + sized if receiving)
      map.addLayer({
        id: "cs-school-circles",
        type: "circle",
        source: "cs-schools",
        paint: {
          "circle-color": [
            "case",
            ["==", ["get", "isClosed"], true], "#111827",
            ["==", ["get", "isReceiving"], true], "#2563eb",
            "#f59e0b",
          ],
          "circle-opacity": [
            "case",
            ["==", ["get", "isClosed"], true], 0.95,
            0.78,
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": [
            "case",
            ["==", ["get", "isReceiving"], true], 1.5,
            1,
          ],
          "circle-radius": [
            "case",
            ["==", ["get", "isClosed"], true], 10,
            ["==", ["get", "isReceiving"], true],
              ["interpolate", ["linear"], ["get", "receiving"], 1, 7, 50, 12, 200, 18],
            4,
          ],
        },
      });

      // Hover tooltip for schools
      const schoolPopup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });
      map.on("mouseenter", "cs-school-circles", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "cs-school-circles", () => {
        map.getCanvas().style.cursor = "";
        schoolPopup.remove();
      });
      map.on("mousemove", "cs-school-circles", (e) => {
        const f = e.features && e.features[0] ? e.features[0] : null;
        if (!f || !f.properties) return;
        const name = f.properties.name || "";
        const code = f.properties.code || "";
        const receiving = Number(f.properties.receiving) || 0;
        const isReceiving = String(f.properties.isReceiving) === "true" || receiving > 0;
        const isClosed = String(f.properties.isClosed) === "true";
        const extra = isClosed
          ? `<div style="font-size:12px; color:#6b7280; margin-top:4px;">Closed school</div>`
          : (isReceiving ? `<div style="font-size:12px; color:#6b7280; margin-top:4px;">Receiving: <strong>${receiving.toLocaleString()}</strong></div>` : "");
        schoolPopup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-weight:900;">${escapeHtml(name)}</div>` +
            `<div style="font-size:12px; color:#6b7280;">${escapeHtml(code)}</div>` +
            `${extra}`
          )
          .addTo(map);
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
      // If schools were queued before map load, ensure they show now.
      if (pendingSchoolsFc && map.getSource("cs-schools")) {
        try { map.getSource("cs-schools").setData(pendingSchoolsFc); } catch (e) {}
      } else if (decisionReady && coordsReady && map.getSource("cs-schools")) {
        // Best-effort initial draw
        try { map.getSource("cs-schools").setData(buildSchoolsFeatureCollection(null, [])); } catch (e) {}
      }
      if (pendingStudentOriginLinesFc && map.getSource("cs-student-origins")) {
        try { map.getSource("cs-student-origins").setData(pendingStudentOriginLinesFc); } catch (e) {}
      }
      if (pendingStudentDecisionLinesFc && map.getSource("cs-student-decisions")) {
        try { map.getSource("cs-student-decisions").setData(pendingStudentDecisionLinesFc); } catch (e) {}
      }
    });
  }

  function setStudentOriginsVisibility(show) {
    if (!mapReady || !map) return;
    const vis = show ? "visible" : "none";
    if (map.getLayer("cs-student-origin-lines")) map.setLayoutProperty("cs-student-origin-lines", "visibility", vis);
  }

  function setStudentDecisionsVisibility(show) {
    if (!mapReady || !map) return;
    const vis = show ? "visible" : "none";
    if (map.getLayer("cs-student-decision-lines")) map.setLayoutProperty("cs-student-decision-lines", "visibility", vis);
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

    const lineFeatures = [];

    (result.destRows || []).forEach((r) => {
      const destCoords = coordsByCode.get(r.code) || null;
      if (!destCoords) return;

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
    const linesFc = { type: "FeatureCollection", features: lineFeatures };

    const srcLines = map.getSource("cs-assignments");
    const srcOrigin = map.getSource("cs-origin");
    if (srcLines) srcLines.setData(linesFc);
    if (srcOrigin) srcOrigin.setData(originFc);
    // Update all schools layer to show receiving schools + counts
    updateSchoolsLayer(result.closeCode, result.destRows || []);
    // Update student origin lines (if computed)
    if (map.getSource("cs-student-origins")) {
      const fc = result.studentOriginLinesFc || { type: "FeatureCollection", features: [] };
      map.getSource("cs-student-origins").setData(fc);
    }
    if (map.getSource("cs-student-decisions")) {
      const fc = result.studentDecisionLinesFc || { type: "FeatureCollection", features: [] };
      map.getSource("cs-student-decisions").setData(fc);
    }

    // Fit bounds
    const all = [originCoords, ...lineFeatures.map((f) => f.geometry.coordinates[1])];
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

  function runSimulation(closeCode, allowNonOverlapping) {
    const rosterFromOdStudents = studentsBySchoolCode.get(closeCode) || [];
    const { includeHome, includeChoice, includeOutOfDistrictChoice } = getStudentFilterConfig();
    const { min, max, allowBeyondMax } = getDistanceConfig();
    const forceAssignAll = FORCE_ASSIGN_ALL;

    const filteredRoster = rosterFromOdStudents.filter((s) => {
      const b = choiceBucket(s.choice);
      if (b === "choice") return includeChoice;
      if (b === "home") return includeHome;
      if (b === "out_of_district_choice") return includeOutOfDistrictChoice;
      return includeHome || includeChoice || includeOutOfDistrictChoice;
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
    const studentOriginLineFeatures = [];
    const MAX_ORIGIN_LINES = 5000;
    const studentDecisionLineFeatures = [];
    const MAX_DECISION_LINES = 5000;

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

    // Manual exclusions: always remove these destinations, independent of other filters.
    const eligibleCandidates = (excludedDestinations && excludedDestinations.size)
      ? candidates.filter((c) => !excludedDestinations.has(c.code))
      : candidates;

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
        if (studentOriginLineFeatures.length < MAX_ORIGIN_LINES) {
          studentOriginLineFeatures.push({
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: [[Number(slng), Number(slat)], originCoords] },
          });
        }
      }

      const options = [];
      for (const c of eligibleCandidates) {
        const d = milesCrow(Number(slng), Number(slat), c.coords[0], c.coords[1]);
        if (!Number.isFinite(d)) continue;
        if (d < min) continue;
        const overlaps = gradeInDestination(grade, c.gradeSpan);
        options.push({ code: c.code, name: c.name, miles: d, overlaps, gradeSpan: c.gradeSpan });
      }
      options.sort((a, b) => a.miles - b.miles);

      const optionsWithinMax = (max !== null) ? options.filter((o) => o.miles <= max) : options;

      const pickFrom = (list) => {
        for (const opt of list) {
          const seatsLeft = remaining.get(opt.code) ?? 0;
          if (!forceAssignAll && seatsLeft <= 0) continue;
          if (!opt.overlaps && !allowNonOverlapping && !forceAssignAll) continue;
          remaining.set(opt.code, seatsLeft - 1);
          return opt;
        }
        return null;
      };

      // First pass: honor max distance if provided
      let chosen = pickFrom(optionsWithinMax);
      // Second pass: if soft max enabled, allow beyond max when needed
      if (!chosen && allowBeyondMax && max !== null) {
        chosen = pickFrom(options);
      }
      if (!chosen) {
        unassigned += 1;
        return;
      }

      assigned += 1;
      scenarioMilesSum += chosen.miles;
      scenarioMilesMax = Math.max(scenarioMilesMax, chosen.miles);
      if (max !== null && chosen.miles > max) exceededMax += 1;

      // Student decision line (home -> chosen destination)
      if (studentDecisionLineFeatures.length < MAX_DECISION_LINES) {
        const destCoords = coordsByCode.get(chosen.code) || null;
        if (destCoords) {
          studentDecisionLineFeatures.push({
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: [[Number(slng), Number(slat)], destCoords] },
          });
        }
      }

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
      filters: { includeHome, includeChoice, minMiles: min, maxMiles: max, allowBeyondMax },
      studentOriginLinesFc: { type: "FeatureCollection", features: studentOriginLineFeatures },
      studentDecisionLinesFc: { type: "FeatureCollection", features: studentDecisionLineFeatures },
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
      `${f.includeHome ? "Attending Home School" : ""}` +
      `${(f.includeHome && (f.includeChoice || f.includeOutOfDistrictChoice)) ? " + " : ""}` +
      `${f.includeChoice ? "Choice" : ""}` +
      `${(f.includeChoice && f.includeOutOfDistrictChoice) ? " + " : ""}` +
      `${f.includeOutOfDistrictChoice ? "Out of District Choice" : ""}` +
      `, miles ${Number(f.minMiles || 0).toFixed(1)}–${(f.maxMiles === null || f.maxMiles === undefined) ? "∞" : Number(f.maxMiles).toFixed(1)}` +
      `${f.maxMiles !== null && f.allowBeyondMax ? " (soft max)" : ""}.`;
    elResultsNote.textContent =
      `Closed school: ${closedMeta ? (closedMeta.name || result.closeCode) : result.closeCode} (${result.closeCode}). ` +
      `Rule: ${result.allowNonOverlapping ? "allow non-overlapping grades" : "overlapping grades only"}.` +
      ` Distances are crow-fly miles from student home → school.` +
      filterNote;

    elResultsCard.classList.remove("hidden");

    updateMapWithResult(result);
  }

  // (CSV export removed)

  function wireUI() {
    // Drawer + full screen toggles
    if (elDrawerToggle) elDrawerToggle.addEventListener("click", () => openDrawer());
    if (elDrawerClose) elDrawerClose.addEventListener("click", () => closeDrawer());
    if (elDrawerBackdrop) elDrawerBackdrop.addEventListener("click", () => closeDrawer());
    if (elMapFullscreenBtn) elMapFullscreenBtn.addEventListener("click", () => toggleFullscreen());
    if (elDrawerPin) {
      elDrawerPin.addEventListener("change", () => {
        const on = !!elDrawerPin.checked;
        document.body.classList.toggle("cs-drawer-pinned", on);
        try { localStorage.setItem(CS_PIN_KEY, on ? "true" : "false"); } catch (e) {}
        if (on) openDrawer();
      });
    }
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDrawer();
    });

    if (elRun) {
      elRun.addEventListener("click", () => {
        if (!canRun()) return;
        const closeCode = norm(elSelect.value);
        const allow = getGradeRuleMode() === "allow";
        const result = runSimulation(closeCode, allow);
        renderResult(result);
      });
    }
    document.querySelectorAll('input[name="gradeRule"]').forEach((el) => {
      el.addEventListener("change", () => {
        // If user already ran a scenario, rerun instantly.
        if (!lastResult) return;
        if (!canRun()) return;
        const closeCode = norm(elSelect.value);
        const allow = getGradeRuleMode() === "allow";
        const result = runSimulation(closeCode, allow);
        renderResult(result);
      });
    });
    [elIncludeHomeSchool, elIncludeChoice, elIncludeOutOfDistrictChoice, elMinMiles, elMaxMiles, elAllowBeyondMax].forEach((el) => {
      if (!el) return;
      el.addEventListener("change", () => {
        if (!lastResult) return;
        if (!canRun()) return;
        const closeCode = norm(elSelect.value);
        const allow = getGradeRuleMode() === "allow";
        const result = runSimulation(closeCode, allow);
        renderResult(result);
      });
    });
    if (elExcludeDestinations) {
      elExcludeDestinations.addEventListener("change", () => {
        // Sync selection -> Set
        try {
          excludedDestinations = new Set(
            Array.from(elExcludeDestinations.selectedOptions || [])
              .map((o) => norm(o.value))
              .filter(Boolean)
          );
        } catch (e) {
          excludedDestinations = new Set();
        }
        persistExcludedDestinationsToStorage();

        if (!lastResult) return;
        if (!canRun()) return;
        const closeCode = norm(elSelect.value);
        const allow = getGradeRuleMode() === "allow";
        const result = runSimulation(closeCode, allow);
        renderResult(result);
      });
    }
    if (elClearExcludedDestinations) {
      elClearExcludedDestinations.addEventListener("click", () => {
        excludedDestinations = new Set();
        persistExcludedDestinationsToStorage();
        populateExcludedDestinationsDropdown();

        if (!lastResult) return;
        if (!canRun()) return;
        const closeCode = norm(elSelect.value);
        const allow = getGradeRuleMode() === "allow";
        const result = runSimulation(closeCode, allow);
        renderResult(result);
      });
    }
    if (elToggleArticulationAreas) {
      elToggleArticulationAreas.addEventListener("change", () => {
        // Ensure map is created before toggling
        ensureMap();
        setArticulationVisibility(!!elToggleArticulationAreas.checked);
      });
    }
    if (elToggleStudentOrigins) {
      elToggleStudentOrigins.addEventListener("change", () => {
        ensureMap();
        setStudentOriginsVisibility(!!elToggleStudentOrigins.checked);
        // If toggled on after a run, show the current run's lines immediately
        if (mapReady && map && map.getSource("cs-student-origins") && lastResult && lastResult.studentOriginLinesFc) {
          try { map.getSource("cs-student-origins").setData(lastResult.studentOriginLinesFc); } catch (e) {}
        }
      });
    }
    if (elToggleStudentDecisions) {
      elToggleStudentDecisions.addEventListener("change", () => {
        ensureMap();
        setStudentDecisionsVisibility(!!elToggleStudentDecisions.checked);
        if (mapReady && map && map.getSource("cs-student-decisions") && lastResult && lastResult.studentDecisionLinesFc) {
          try { map.getSource("cs-student-decisions").setData(lastResult.studentDecisionLinesFc); } catch (e) {}
        }
      });
    }
  }

  async function main() {
    try {
      // #region agent log (debug)
      try {
        const brand = document.querySelector('#topbar .cs-brand-title') || document.querySelector('#top-brand-bar .brand-title') || document.querySelector('.brand-title');
        const sub = document.querySelector('#topbar .cs-brand-sub') || document.querySelector('#top-brand-bar .brand-title .sub') || document.querySelector('.brand-title .sub');
        const h2 = document.querySelector('h2');
        const localScripts = Array.from(document.scripts || [])
          .map(s => s && s.src ? s.src : '')
          .filter(src => !!src && !/^https?:\/\//i.test(src))
          .map(src => src.split('/').pop())
          .slice(0, 30);
        fetch('http://127.0.0.1:7242/ingest/0c9cdb70-a708-4eb8-8215-2339a4485391', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'debug-session',
            runId: 'pre-clean-audit',
            hypothesisId: 'A_titles_B_brand_C_menu_D_cachebust',
            location: 'closure-scenarios.js:main',
            message: 'Closure scenarios page snapshot',
            data: {
              path: location && location.pathname,
              title: document.title,
              brandTitle: brand ? (brand.childNodes[0]?.textContent || brand.textContent || '').trim() : null,
              brandSub: sub ? (sub.textContent || '').trim() : null,
              h2: h2 ? (h2.textContent || '').trim() : null,
              localScripts
            },
            timestamp: Date.now()
          })
        }).catch(() => {});
      } catch (e) {}
      // #endregion agent log (debug)

      // #region agent log (debug)
      try {
        const topbarTitle = document.querySelector('.topbar .title');
        const topbarSub = document.querySelector('.topbar .title .sub');
        fetch('http://127.0.0.1:7242/ingest/0c9cdb70-a708-4eb8-8215-2339a4485391', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'debug-session',
            runId: 'post-fix',
            hypothesisId: 'B_brand_C_pagecopy',
            location: 'closure-scenarios.js:main:topbar',
            message: 'Closure scenarios topbar snapshot',
            data: {
              path: location && location.pathname,
              title: document.title,
              topbarTitle: topbarTitle ? (topbarTitle.childNodes[0]?.textContent || topbarTitle.textContent || '').trim() : null,
              topbarSub: topbarSub ? (topbarSub.textContent || '').trim() : null
            },
            timestamp: Date.now()
          })
        }).catch(() => {});
      } catch (e) {}
      // #endregion agent log (debug)

      setTopbarHeightVar();
      window.addEventListener("resize", setTopbarHeightVar);
      wireUI();
      // Build map immediately so the page starts as "map-first"
      ensureMap();

      // Restore excluded destinations early (UI populated after data loads).
      loadExcludedDestinationsFromStorage();

      updateProgress(0, "Loading Decision Data Export (seats)…");
      await loadDecisionData();
      await loadSchoolCoordsFromMapExport();
      await loadGradeSpans();
      await loadArticulationAreas();
      await loadOdStudents();
      updateProgress(100, "Student roster loaded (OD_Students).");

      // Populate destination exclusion UI once we have names + coords.
      populateExcludedDestinationsDropdown();

      // Restore pinned state (and open drawer by default)
      let pinned = false;
      try { pinned = localStorage.getItem(CS_PIN_KEY) === "true"; } catch (e) { pinned = false; }
      document.body.classList.toggle("cs-drawer-pinned", pinned);
      if (elDrawerPin) elDrawerPin.checked = pinned;
      openDrawer();
    } catch (e) {
      console.error("Closure scenarios failed to load", e);
      updateProgress(0, "Error loading data. See console for details.");
    }
  }

  main();
})();

