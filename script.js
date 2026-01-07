mapboxgl.accessToken = 'pk.eyJ1IjoicGF0d2QwNSIsImEiOiJjbTZ2bGVhajIwMTlvMnFwc2owa3BxZHRoIn0.moDNfqMUolnHphdwsIF87w';

// --- Debug logging -----------------------------------------------------------
// Set to true if you want verbose console output while developing.
const DEBUG = false;
const __origLog = console.log.bind(console);
if (!DEBUG) {
  console.log = function () {};
} else {
  // Keep a predictable prefix for debug sessions.
  console.log = (...args) => __origLog('[DEBUG]', ...args);
}

// Map style management
const MAP_STYLES = {
  light: 'mapbox://styles/mapbox/light-v11',
  standard: 'mapbox://styles/mapbox/standard',
  satellite: 'mapbox://styles/mapbox/standard-satellite'
};

// Decision outcome colors (keep consistent with map circle coloring)
const DECISION_COLORS = {
  "Building Addition": "#2E8B57",
  "Policy Solution for Overcrowding": "#66BB6A",
  "Building Addition with Capital Investment": "#1B5E20",
  "Building Replacement": "#4B830D",
  "Targeted Capital Investment": "#FFA726",
  "Standard Maintenance": "#FFD54F",
  "Major Capital Investment": "#FB8C00",
  "Welcoming School": "#C62828",
  "Welcoming School with Capital Investment": "#E53935",
  "Closure (Goes to Welcoming School)": "#B71C1C",
  "Welcoming School with Building Replacement": "#8B0000",
  "Other / Unknown": "#2F4F4F",
  "Unknown": "#7f8c8d"
};
function getDecisionColorHex(decisionType) {
  const key = (decisionType || "").toString().trim();
  return DECISION_COLORS[key] || "#7f8c8d";
}
function getDecisionColorKey(decisionType) {
  return getDecisionColorHex(decisionType).replace("#", "").toLowerCase();
}

// Base-map label/POI visibility (applied to Mapbox style layers)
const MAP_LABEL_PREFS_KEY = 'mapLabelPrefs';
const DEFAULT_MAP_LABEL_PREFS = {
  roadLabels: true,
  placeLabels: true,
  poiLabels: true
};
function getSavedMapLabelPrefs() {
  try {
    const raw = localStorage.getItem(MAP_LABEL_PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_MAP_LABEL_PREFS };
    return {
      roadLabels: parsed.roadLabels !== false,
      placeLabels: parsed.placeLabels !== false,
      poiLabels: parsed.poiLabels !== false
    };
  } catch {
    return { ...DEFAULT_MAP_LABEL_PREFS };
  }
}
function saveMapLabelPrefs(prefs) {
  try {
    localStorage.setItem(MAP_LABEL_PREFS_KEY, JSON.stringify({
      roadLabels: prefs.roadLabels !== false,
      placeLabels: prefs.placeLabels !== false,
      poiLabels: prefs.poiLabels !== false
    }));
  } catch {}
}

function rebuildMapLabelLayerIndex() {
  const m = window.map;
  if (!m || typeof m.getStyle !== 'function') {
    window.__mapLabelLayerIndex = null;
    return;
  }
  let layers = [];
  try {
    const style = m.getStyle();
    layers = (style && Array.isArray(style.layers)) ? style.layers : [];
  } catch {
    layers = [];
  }

  const idx = { roadLabels: [], placeLabels: [], poiLabels: [] };

  const classify = (layer) => {
    if (!layer || layer.type !== 'symbol') return null;
    // Avoid hiding our dashboard layers (schools, selections, etc.)
    const src = (layer.source || '').toString().toLowerCase();
    const layerIdLower = ((layer.id || '').toString()).toLowerCase();
    if (
      src === 'schools' ||
      src === 'selected-school' ||
      layerIdLower.startsWith('schools-') ||
      layerIdLower.startsWith('selected-school-') ||
      layerIdLower.includes('sending-school') ||
      layerIdLower.includes('receiving-school')
    ) {
      return null;
    }
    const sourceLayer = (layer['source-layer'] || '').toString().toLowerCase();

    if (
      layerIdLower.includes('poi') ||
      layerIdLower.includes('landmark') ||
      layerIdLower.includes('park') ||
      sourceLayer.includes('poi') ||
      sourceLayer.includes('landmark') ||
      sourceLayer.includes('park')
    ) return 'poiLabels';

    if (
      layerIdLower.includes('road') ||
      layerIdLower.includes('street') ||
      layerIdLower.includes('highway') ||
      layerIdLower.includes('motorway') ||
      layerIdLower.includes('shield') ||
      sourceLayer.includes('road') ||
      sourceLayer.includes('transportation')
    ) return 'roadLabels';

    if (
      layerIdLower.includes('place') ||
      layerIdLower.includes('settlement') ||
      layerIdLower.includes('country') ||
      layerIdLower.includes('state') ||
      layerIdLower.includes('admin') ||
      sourceLayer.includes('place') ||
      sourceLayer.includes('settlement') ||
      sourceLayer.includes('country') ||
      sourceLayer.includes('admin')
    ) return 'placeLabels';

    return null;
  };

  layers.forEach(layer => {
    const key = classify(layer);
    if (!key) return;
    idx[key].push(layer.id);
  });

  window.__mapLabelLayerIndex = idx;
  window.__mapLabelLayerIndexBuiltAt = Date.now();
  console.warn(
    '🗺️ Map Labels index rebuilt:',
    'roads=', idx.roadLabels.length,
    'places=', idx.placeLabels.length,
    'pois=', idx.poiLabels.length
  );
}

function applyMapLabelPrefsViaConfig() {
  const m = window.map;
  if (!m || typeof m.setConfigProperty !== 'function') return false;
  const prefs = getSavedMapLabelPrefs();

  // Mapbox "Standard" styles often expose label control via style config (not plain layers).
  // Try a small set of likely config keys; ignore failures and fall back to layer toggles.
  const attempts = [];
  const trySet = (group, key, val) => {
    try {
      m.setConfigProperty(group, key, val);
      attempts.push(`${group}.${key}=${val}`);
      return true;
    } catch {
      return false;
    }
  };

  const wantRoad = !!prefs.roadLabels;
  const wantPlace = !!prefs.placeLabels;
  const wantPoi = !!prefs.poiLabels;

  // Common naming patterns seen in Standard-style configs
  const ok =
    trySet('basemap', 'showRoadLabels', wantRoad) |
    trySet('basemap', 'showRoadLabel', wantRoad) |
    trySet('basemap', 'showRoadsAndTransitLabels', wantRoad) |
    trySet('basemap', 'showPlaceLabels', wantPlace) |
    trySet('basemap', 'showPlaceLabel', wantPlace) |
    trySet('basemap', 'showPointOfInterestLabels', wantPoi) |
    trySet('basemap', 'showPoiLabels', wantPoi) |
    trySet('basemap', 'showPOILabels', wantPoi);

  if (attempts.length) {
    console.warn('🗺️ Map Labels applied via config:', attempts.join(', '));
  }
  return !!ok;
}

function applyMapLabelPrefs() {
  const m = window.map;
  if (!m || typeof m.getStyle !== 'function') return;
  try {
    if (typeof m.isStyleLoaded === 'function' && !m.isStyleLoaded()) return;
  } catch {}

  // First try Standard-style config toggles (works for Standard / Standard Satellite).
  try {
    if (applyMapLabelPrefsViaConfig()) return;
  } catch {}

  // Fallback: hide symbol layers (works for classic styles like Light).
  if (typeof m.setLayoutProperty !== 'function') return;
  const prefs = getSavedMapLabelPrefs();

  if (!window.__mapLabelLayerIndex) {
    rebuildMapLabelLayerIndex();
  }
  const idx = window.__mapLabelLayerIndex || { roadLabels: [], placeLabels: [], poiLabels: [] };

  const setGroup = (key) => {
    const visibility = prefs[key] ? 'visible' : 'none';
    (idx[key] || []).forEach(layerId => {
      try { m.setLayoutProperty(layerId, 'visibility', visibility); } catch {}
    });
  };
  setGroup('roadLabels');
  setGroup('placeLabels');
  setGroup('poiLabels');
  console.warn('🗺️ Map Labels applied:', prefs);
}

function getSavedMapStyle() {
  const saved = localStorage.getItem('mapStyleChoice');
  return saved || MAP_STYLES.light;
}
function applyMapStyle(styleId) {
  if (!window.map || !styleId) return;
  const mapRef = window.map;
  // Style switching can rebuild the style from scratch; sources/layers/images are wiped.
  // `style.load` can fire before the style is actually ready for addSource/addLayer.
  // Use a retry loop + `idle` to guarantee we re-add our layers.
  const applyToken = (window.__mapStyleApplyToken = (window.__mapStyleApplyToken || 0) + 1);
  const tryFinishApply = (attempt = 0) => {
    // Stop if a newer style change started.
    if (window.__mapStyleApplyToken !== applyToken) return;
    // Wait for style readiness.
    try {
      if (typeof mapRef.isStyleLoaded === 'function' && !mapRef.isStyleLoaded()) {
        if (attempt < 80) setTimeout(() => tryFinishApply(attempt + 1), 75);
        return;
      }
    } catch {}
    try {
      ensureBaseSourcesLayers();
      // Apply base-map label toggles after the style has rebuilt.
      try { rebuildMapLabelLayerIndex(); } catch {}
      try { applyMapLabelPrefs(); } catch {}
      // ensureBaseSourcesLayers may call updateLayer internally, but call once more
      // to ensure we restore visibility/filters after layers exist.
      try { updateLayer(); } catch {}
    } catch (e) {
      // If we raced the style rebuild, retry briefly.
      if (attempt < 80) {
        setTimeout(() => tryFinishApply(attempt + 1), 75);
      } else {
        console.warn('⚠️ Unable to reapply filters after style change:', e);
      }
    }
  };

  const onStyleLoadOnce = () => {
    // Schedule after the style has had a chance to fully rebuild.
    setTimeout(() => tryFinishApply(0), 0);
    try {
      mapRef.once('idle', () => tryFinishApply(0));
    } catch {}
  };
  try {
    // Avoid piling up listeners from rapid clicks
    mapRef.off('style.load', onStyleLoadOnce);
    mapRef.on('style.load', onStyleLoadOnce);
    // Rebuild label-layer index for the incoming style.
    try { mapRef.off('style.load', rebuildMapLabelLayerIndex); } catch {}
    try { mapRef.on('style.load', rebuildMapLabelLayerIndex); } catch {}
    // Some styles (Standard) populate layers after style.load; rebuild again at idle.
    try { mapRef.once('idle', rebuildMapLabelLayerIndex); } catch {}
    mapRef.setStyle(styleId);
    localStorage.setItem('mapStyleChoice', styleId);
  } catch (e) {
    console.warn('⚠️ Unable to set map style:', e);
    // Fallback to light if the chosen style fails
    if (styleId !== MAP_STYLES.light) {
      try {
        mapRef.setStyle(MAP_STYLES.light);
        localStorage.setItem('mapStyleChoice', MAP_STYLES.light);
      } catch (e2) {
        console.warn('⚠️ Fallback to light style also failed:', e2);
      }
    }
  }
}

// --- Halo animation (Sending School) ----------------------------------------
let haloInterval = null;
let haloRadius = 15;
let haloGrowing = true;

function startBlinkingHalo() {
  if (haloInterval) clearInterval(haloInterval);
  haloRadius = 15;
  haloGrowing = true;
  haloInterval = setInterval(() => {
    if (!map || !map.getLayer || !map.getLayer('sending-school-halo')) return;
    map.setPaintProperty('sending-school-halo', 'circle-radius', haloRadius);
    map.setPaintProperty('sending-school-halo', 'circle-opacity', 0.5 + 0.5 * Math.sin(Date.now() / 300));
    if (haloGrowing) {
      haloRadius += 1;
      if (haloRadius >= 30) haloGrowing = false;
    } else {
      haloRadius -= 1;
      if (haloRadius <= 15) haloGrowing = true;
    }
  }, 50);
}

function stopBlinkingHalo() {
  if (haloInterval) {
    clearInterval(haloInterval);
    haloInterval = null;
  }
  if (map && map.getLayer && map.getLayer('sending-school-halo')) {
    map.setPaintProperty('sending-school-halo', 'circle-opacity', 0);
  }
}

// Application initialization
document.addEventListener('DOMContentLoaded', function() {
  // Tour now starts after password authentication (see index.html password overlay)
  // startOnboardingWalkthrough();

  // Auto-open "School Decision Evaluation: Results" when "School Decision Evaluation" is opened
  const decisionInputPanel = document.getElementById('decision-input-panel');
  const decisionOutputPanel = document.getElementById('decision-output-panel');

  // Sidebar hamburger toggle (collapse/expand)
  (function setupSidebarToggle() {
    const toggleBtn = document.getElementById('sidebarToggle');
    const menu = document.getElementById('sidebarMenu');
    const closeBtn = document.getElementById('sidebarMenuClose');
    const body = document.body;
    const leftToggle = document.getElementById('toggleLeftSidebar');
    const rightToggle = document.getElementById('toggleRightSidebar');
    const startTourBtn = document.getElementById('menuStartTour');
    const dataLogicBtn = document.getElementById('menuDataLogic');
    const rightSidebar = document.getElementById('map-sidebar');
    const showMapBtn = document.getElementById('menuShowMap');
    const showFlowchartBtn = document.getElementById('menuShowFlowchart');

    // --- Mobile/iPad drawer helpers (allow both sidebars open at once) ---
    const isSmallScreen = () => {
      try {
        return window.matchMedia && window.matchMedia('(max-width: 1024px)').matches;
      } catch (e) {
        return false;
      }
    };

    const ensureBackdrop = () => {
      let el = document.getElementById('mobileDrawerBackdrop');
      if (el) return el;
      el = document.createElement('div');
      el.id = 'mobileDrawerBackdrop';
      el.style.position = 'fixed';
      el.style.left = '0';
      el.style.top = '0';
      el.style.width = '100vw';
      el.style.height = '100vh';
      el.style.background = 'rgba(0,0,0,0.35)';
      el.style.zIndex = '2090';
      el.style.display = 'none';
      el.addEventListener('click', () => {
        // Close BOTH drawers (user requested both can be open, but tapping backdrop closes all)
        body.classList.add('sidebar-collapsed');
        body.classList.add('right-sidebar-collapsed');
        if (leftToggle) leftToggle.checked = false;
        if (rightToggle) rightToggle.checked = false;
        updateMobileBackdrop();
        if (window.map && typeof window.map.resize === 'function') {
          setTimeout(() => window.map.resize(), 50);
        }
      });
      document.body.appendChild(el);
      return el;
    };

    const updateMobileBackdrop = () => {
      const backdrop = ensureBackdrop();
      if (!isSmallScreen()) {
        backdrop.style.display = 'none';
        return;
      }
      const leftOpen = !body.classList.contains('sidebar-collapsed');
      const rightOpen = !body.classList.contains('right-sidebar-collapsed');
      backdrop.style.display = (leftOpen || rightOpen) ? 'block' : 'none';
    };

    const ensureDrawerHeader = (sidebarEl, title, onClose) => {
      if (!sidebarEl) return;
      if (sidebarEl.querySelector('.mobile-drawer-header')) return;
      const header = document.createElement('div');
      header.className = 'mobile-drawer-header';
      header.style.display = isSmallScreen() ? 'flex' : 'none';
      header.style.alignItems = 'center';
      header.style.justifyContent = 'space-between';
      header.style.gap = '8px';
      header.style.padding = '10px 12px';
      header.style.borderBottom = '1px solid #e5e7eb';
      header.style.background = '#fff';
      header.style.position = 'sticky';
      header.style.top = '0';
      header.style.zIndex = '1';

      const label = document.createElement('div');
      label.textContent = title;
      label.style.fontWeight = '700';
      label.style.fontSize = '14px';
      label.style.color = '#111';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Close';
      btn.style.border = '1px solid #d1d5db';
      btn.style.background = '#fff';
      btn.style.borderRadius = '8px';
      btn.style.padding = '8px 10px';
      btn.style.cursor = 'pointer';
      btn.style.fontSize = '13px';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose && onClose();
      });

      header.appendChild(label);
      header.appendChild(btn);
      sidebarEl.insertBefore(header, sidebarEl.firstChild);

      // Keep header visibility in sync with breakpoints
      const syncHeaderVisibility = () => {
        header.style.display = isSmallScreen() ? 'flex' : 'none';
      };
      syncHeaderVisibility();
      window.addEventListener('resize', syncHeaderVisibility);
    };

    const setMenuViewActive = (mode) => {
      if (showMapBtn) showMapBtn.classList.toggle('active', mode === 'map');
      if (showFlowchartBtn) showFlowchartBtn.classList.toggle('active', mode === 'flowchart');
    };

    const syncMenuState = () => {
      if (leftToggle) leftToggle.checked = !body.classList.contains('sidebar-collapsed');
      if (rightToggle) rightToggle.checked = !body.classList.contains('right-sidebar-collapsed');
    };

    const showMenu = () => {
      if (menu) menu.style.display = 'block';
      syncMenuState();
      updateMobileBackdrop();
    };
    const hideMenu = () => {
      if (menu) menu.style.display = 'none';
      updateMobileBackdrop();
    };

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        if (!menu) return;
        const isOpen = menu.style.display === 'block';
        if (isOpen) {
          hideMenu();
        } else {
          showMenu();
        }
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', hideMenu);
    }
    if (leftToggle) {
      leftToggle.addEventListener('change', () => {
        if (leftToggle.checked) {
          body.classList.remove('sidebar-collapsed');
        } else {
          body.classList.add('sidebar-collapsed');
        }
        updateMobileBackdrop();
        if (window.map && typeof window.map.resize === 'function') {
          setTimeout(() => window.map.resize(), 50);
        }
      });
    }
    if (rightToggle) {
      rightToggle.addEventListener('change', () => {
        const shouldShow = rightToggle.checked;
        if (shouldShow) {
          body.classList.remove('right-sidebar-collapsed');
        } else {
          body.classList.add('right-sidebar-collapsed');
        }
        updateMobileBackdrop();
        if (window.map && typeof window.map.resize === 'function') {
          setTimeout(() => window.map.resize(), 50);
        }
      });
    }
    if (startTourBtn) {
      startTourBtn.addEventListener('click', () => {
        hideMenu();
        const startBtn = document.getElementById('startTourBtn');
        if (typeof window.startOnboardingWalkthrough === 'function') {
          window.startOnboardingWalkthrough();
        } else if (startBtn) {
          startBtn.click();
        }
      });
    }
    if (dataLogicBtn) {
      dataLogicBtn.addEventListener('click', () => {
        hideMenu();
        window.open('data-viewer.html', '_blank');
      });
    }
    if (showMapBtn) {
      showMapBtn.addEventListener('click', () => {
        hideMenu();
        if (typeof window.switchToMap === 'function') {
          window.switchToMap();
        }
        setMenuViewActive('map');
      });
    }
    if (showFlowchartBtn) {
      showFlowchartBtn.addEventListener('click', () => {
        hideMenu();
        if (typeof window.switchToFlowchart === 'function') {
          window.switchToFlowchart();
        }
        setMenuViewActive('flowchart');
      });
    }
    // Map style radio buttons
    const styleRadios = document.querySelectorAll('input[name="mapStyle"]');
    styleRadios.forEach(r => {
      r.addEventListener('change', () => {
        if (r.checked) applyMapStyle(r.value);
      });
    });
    // Initialize radio selection from saved style

    // Map label toggles (Road / Place / POI)
    const roadCb = document.getElementById('toggleRoadLabels');
    const placeCb = document.getElementById('togglePlaceLabels');
    const poiCb = document.getElementById('togglePoiLabels');
    const prefs = getSavedMapLabelPrefs();
    if (roadCb) roadCb.checked = !!prefs.roadLabels;
    if (placeCb) placeCb.checked = !!prefs.placeLabels;
    if (poiCb) poiCb.checked = !!prefs.poiLabels;
    const onLabelChange = () => {
      saveMapLabelPrefs({
        roadLabels: roadCb ? roadCb.checked : true,
        placeLabels: placeCb ? placeCb.checked : true,
        poiLabels: poiCb ? poiCb.checked : true
      });
      console.warn('🗺️ Map Labels changed:', {
        roadLabels: roadCb ? roadCb.checked : true,
        placeLabels: placeCb ? placeCb.checked : true,
        poiLabels: poiCb ? poiCb.checked : true
      });
      try { applyMapLabelPrefs(); } catch {}
    };
    if (roadCb) roadCb.addEventListener('change', onLabelChange);
    if (placeCb) placeCb.addEventListener('change', onLabelChange);
    if (poiCb) poiCb.addEventListener('change', onLabelChange);
    const savedStyle = getSavedMapStyle();
    styleRadios.forEach(r => { r.checked = r.value === savedStyle; });

    // Close menu on outside click
    document.addEventListener('click', (e) => {
      if (!menu || !toggleBtn) return;
      const target = e.target;
      if (menu.contains(target) || toggleBtn.contains(target)) return;
      hideMenu();
    });

    // Default: hide both sidebars on load
    body.classList.add('sidebar-collapsed');
    body.classList.add('right-sidebar-collapsed');
    syncMenuState();
    setMenuViewActive('map');
    updateMobileBackdrop();

    // Mobile drawer headers + close buttons
    ensureDrawerHeader(document.getElementById('sidebar'), 'Controls', () => {
      body.classList.add('sidebar-collapsed');
      if (leftToggle) leftToggle.checked = false;
      updateMobileBackdrop();
      if (window.map && typeof window.map.resize === 'function') setTimeout(() => window.map.resize(), 50);
    });
    ensureDrawerHeader(document.getElementById('map-sidebar'), 'Results', () => {
      body.classList.add('right-sidebar-collapsed');
      if (rightToggle) rightToggle.checked = false;
      updateMobileBackdrop();
      if (window.map && typeof window.map.resize === 'function') setTimeout(() => window.map.resize(), 50);
    });

    // Keep backdrop correct on resize/orientation changes
    window.addEventListener('resize', updateMobileBackdrop);
  })();
  
  if (decisionInputPanel && decisionOutputPanel) {
    decisionInputPanel.addEventListener('toggle', function() {
      if (this.open) {
        // When the input panel opens, also open the results panel
        decisionOutputPanel.open = true;
      }
    });
  }

  // --- Scenario Modeling: Show options only after decision type is selected ---
  const decisionFilter = document.getElementById('decisionFilter');
  const scenarioOptionsContainer = document.getElementById('scenarioOptionsContainer');
  const assignmentModeDetails = document.getElementById('assignmentModeDetails');

  if (decisionFilter && scenarioOptionsContainer && assignmentModeDetails) {
    // --- Add a container for the investments table ---
    let investmentsTableContainer = document.getElementById('investmentsTableContainer');
    if (!investmentsTableContainer) {
      investmentsTableContainer = document.createElement('div');
      investmentsTableContainer.id = 'investmentsTableContainer';
      investmentsTableContainer.style.marginTop = '1em';
      scenarioOptionsContainer.parentNode.insertBefore(investmentsTableContainer, scenarioOptionsContainer.nextSibling);
    }

    function updateScenarioOptionsVisibility() {
      const ongoingContainer = document.getElementById('ongoingMonitoringContainer');
      const ongoingMessage = document.getElementById('ongoingMonitoringMessage');
      const ongoingList = document.getElementById('ongoingMonitoringList');
      // Hide all by default
      scenarioOptionsContainer.style.display = 'none';
      assignmentModeDetails.style.display = 'none';
      if (ongoingContainer) ongoingContainer.style.display = 'none';
      // Hide investments table by default
      investmentsTableContainer.style.display = 'none';
      investmentsTableContainer.innerHTML = '';

      if (decisionFilter.value === 'Ongoing Monitoring & Evaluation') {
        // Show only the message and list
        if (scenarioOptionsContainer) scenarioOptionsContainer.style.display = '';
        if (ongoingContainer && ongoingMessage && ongoingList) {
          ongoingContainer.style.display = '';
          ongoingMessage.textContent = 'These schools are in good condition and no immediate action is required.';
          // Get list of schools in this category
          let schools = [];
          if (window.decisionLogic && window.decisionLogic.schoolData) {
            schools = window.decisionLogic.schoolData.filter(row => row.decision === 'Ongoing Monitoring & Evaluation').map(row => row['Building Name']);
          }
          ongoingList.innerHTML = schools.length ? schools.map(s => `<li>${s}</li>`).join('') : '<li>No schools found.</li>';
        }
        if (assignmentModeDetails) assignmentModeDetails.style.display = 'none';
        // Hide school select and header
        const schoolSelectHeader = scenarioOptionsContainer.querySelector('h3');
        const schoolSelectDropdown = document.getElementById('schoolSelect');
        if (schoolSelectHeader) schoolSelectHeader.style.display = 'none';
        if (schoolSelectDropdown) schoolSelectDropdown.style.display = 'none';
        return;
      }
      // --- Show message and list for School-specific evaluation of alternative options ---
      if (decisionFilter.value === 'School-specific evaluation of alternative options') {
        if (scenarioOptionsContainer) scenarioOptionsContainer.style.display = '';
        if (ongoingContainer && ongoingMessage && ongoingList) {
          ongoingContainer.style.display = '';
          ongoingMessage.textContent = 'The uniqueness of these schools require school specific evaluation.';
          // Get list of schools in this category
          let schools = [];
          if (window.decisionLogic && window.decisionLogic.schoolData) {
            schools = window.decisionLogic.schoolData.filter(row => row.decision === 'School-specific evaluation of alternative options').map(row => row['Building Name']);
          }
          ongoingList.innerHTML = schools.length ? schools.map(s => `<li>${s}</li>`).join('') : '<li>No schools found.</li>';
        }
        if (assignmentModeDetails) assignmentModeDetails.style.display = 'none';
        // Hide school select and header
        const schoolSelectHeader = scenarioOptionsContainer.querySelector('h3');
        const schoolSelectDropdown = document.getElementById('schoolSelect');
        if (schoolSelectHeader) schoolSelectHeader.style.display = 'none';
        if (schoolSelectDropdown) schoolSelectDropdown.style.display = 'none';
        return;
      }
      // --- Show investments table for Building & Programmatic Investments, Programmatic Investment, or Building Investment ---
      if (
        decisionFilter.value === 'Building & Programmatic Investments' ||
        decisionFilter.value === 'Building Investment'
      ) {
        if (scenarioOptionsContainer) scenarioOptionsContainer.style.display = '';
        if (assignmentModeDetails) assignmentModeDetails.style.display = 'none';
        // Hide school select and header
        const schoolSelectHeader = scenarioOptionsContainer.querySelector('h3');
        const schoolSelectDropdown = document.getElementById('schoolSelect');
        if (schoolSelectHeader) schoolSelectHeader.style.display = 'none';
        if (schoolSelectDropdown) schoolSelectDropdown.style.display = 'none';
        // Build the table
        if (window.decisionLogic && window.decisionLogic.schoolData) {
          const data = window.decisionLogic.schoolData;
          // Helper to format square footage with 'K' for thousands
          function formatSquareFt(value) {
            if (!value) return '';
            const num = parseFloat(value.toString().replace(/,/g, ''));
            if (isNaN(num)) return value;
            if (num >= 1000) return (num / 1000).toLocaleString(undefined, {maximumFractionDigits: 0}) + 'K';
            return num.toLocaleString();
          }
          // Helper to format cost (optional: add $ and commas)
          let costMultiplier = 300; // Default multiplier
          function formatCost(value) {
            if (!value) return '';
            const num = parseFloat(value.toString().replace(/,/g, ''));
            if (isNaN(num)) return value;
            // Multiply square footage by the selected multiplier to get cost
            const cost = num * costMultiplier;
            if (cost >= 1_000_000) {
              return '$' + (cost / 1_000_000).toLocaleString(undefined, {maximumFractionDigits: 2}) + 'M';
            }
            return '$' + cost.toLocaleString();
          }
          
          // Function to update cost display when multiplier changes
          function updateCostDisplay() {
            if (window.decisionLogic && window.decisionLogic.schoolData) {
              const data = window.decisionLogic.schoolData;
              // Calculate total cost
              const totalSquareFt = data.filter(row => 
                row.decision === 'Building & Programmatic Investments' || 
                row.decision === 'Building Investment'
              ).reduce((sum, row) => sum + (parseFloat(row['SquareFt']) || 0), 0);
              // Rebuild the table with new multiplier
              let tableHTML = `<table class=\"data-table\"><thead><tr><th>School Name</th><th>Square Footage</th><th>Cost <div style=\"display:flex; gap:5px; margin-top:5px; justify-content:center;\">
                <span class=\"dollar-sign-tooltip\" style=\"cursor:pointer; padding:2px 4px; border-radius:3px; background:${costMultiplier === 300 ? '#007cbf' : '#e0e0e0'}; color:${costMultiplier === 300 ? 'white' : 'black'};\" onclick=\"updateCostMultiplier(300)\" data-tooltip=\"Low level renovation\">$</span>
                <span class=\"dollar-sign-tooltip\" style=\"cursor:pointer; padding:2px 4px; border-radius:3px; background:${costMultiplier === 600 ? '#007cbf' : '#e0e0e0'}; color:${costMultiplier === 600 ? 'white' : 'black'};\" onclick=\"updateCostMultiplier(600)\" data-tooltip=\"Medium level renovation\">$$</span>
                <span class=\"dollar-sign-tooltip\" style=\"cursor:pointer; padding:2px 4px; border-radius:3px; background:${costMultiplier === 1200 ? '#007cbf' : '#e0e0e0'}; color:${costMultiplier === 1200 ? 'white' : 'black'};\" onclick=\"updateCostMultiplier(1200)\" data-tooltip=\"High level renovation\">$$$</span>
              </div></th></tr></thead><tbody>`;
              
              // Add total row at the top
              tableHTML += `<tr style=\"font-weight:bold; background:#cccccc;\"><td style='border:1px solid #888;'>Total</td><td style='border:1px solid #888;'>${formatSquareFt(totalSquareFt)}</td><td style='border:1px solid #888;'>${formatCost(totalSquareFt)}</td></tr>`;
              
              // Determine order based on selected filter
              let sectionOrder;
              if (decisionFilter.value === 'Building Investment') {
                sectionOrder = [
                  {type: 'Building Investment', label: 'Building Investment', color: '#2ecc71'},
                  {type: 'Building & Programmatic Investments', label: 'Building & Programmatic Investments', color: '#1abc9c'},
                ];
              } else {
                sectionOrder = [
                  {type: 'Building & Programmatic Investments', label: 'Building & Programmatic Investments', color: '#1abc9c'},
                  {type: 'Building Investment', label: 'Building Investment', color: '#2ecc71'},
                ];
              }
              sectionOrder.forEach(section => {
                const rows = buildRows(section.type);
                if (rows) {
                  tableHTML += `<tr><td colspan=\"3\" style=\"font-weight:bold;background:#f2f2f2;color:#000;\">${section.label}</td></tr>` + rows;
                }
              });
              tableHTML += '</tbody></table>';
              investmentsTableContainer.innerHTML = tableHTML;
              investmentsTableContainer.style.display = '';
              setupDollarSignTooltips(); // <-- Add this line
            }
          }
          
          // Global function to update cost multiplier
          window.updateCostMultiplier = function(multiplier) {
            costMultiplier = multiplier;
            updateCostDisplay();
          };
          
          // Helper to build rows for a category
          function buildRows(decisionType) {
            return data.filter(row => row.decision === decisionType)
              .map(row => `<tr><td class="truncate-cell" data-tooltip="${row['Building Name']}">${row['Building Name']}</td><td>${formatSquareFt(row['SquareFt'])}</td><td>${formatCost(row['SquareFt'])}</td></tr>`)
              .join('');
          }
          let tableHTML = `<table class=\"data-table\"><thead><tr><th>School Name</th><th>Square Footage</th><th>Cost <div style=\"display:flex; gap:5px; margin-top:5px; justify-content:center;\">
            <span class=\"dollar-sign-tooltip\" style=\"cursor:pointer; padding:2px 4px; border-radius:3px; background:${costMultiplier === 300 ? '#007cbf' : '#e0e0e0'}; color:${costMultiplier === 300 ? 'white' : 'black'};\" onclick=\"updateCostMultiplier(300)\" data-tooltip=\"Low renovation\">$</span>
            <span class=\"dollar-sign-tooltip\" style=\"cursor:pointer; padding:2px 4px; border-radius:3px; background:${costMultiplier === 600 ? '#007cbf' : '#e0e0e0'}; color:${costMultiplier === 600 ? 'white' : 'black'};\" onclick=\"updateCostMultiplier(600)\" data-tooltip=\"Medium renovation\">$$</span>
            <span class=\"dollar-sign-tooltip\" style=\"cursor:pointer; padding:2px 4px; border-radius:3px; background:${costMultiplier === 1200 ? '#007cbf' : '#e0e0e0'}; color:${costMultiplier === 1200 ? 'white' : 'black'};\" onclick=\"updateCostMultiplier(1200)\" data-tooltip=\"High renovation\">$$$</span>
          </div></th></tr></thead><tbody>`;
          
          // Calculate total cost for initial display
          const totalSquareFt = data.filter(row => 
            row.decision === 'Building & Programmatic Investments' || 
            row.decision === 'Building Investment'
          ).reduce((sum, row) => sum + (parseFloat(row['SquareFt']) || 0), 0);
          // Add total row at the top
          tableHTML += `<tr style=\"font-weight:bold; background:#cccccc;\"><td style='border:1px solid #888;'>Total</td><td style='border:1px solid #888;'>${formatSquareFt(totalSquareFt)}</td><td style='border:1px solid #888;'>${formatCost(totalSquareFt)}</td></tr>`;
          
          // Determine order based on selected filter
          let sectionOrder;
          if (decisionFilter.value === 'Building Investment') {
            sectionOrder = [
              {type: 'Building Investment', label: 'Building Investment', color: '#2ecc71'},
              {type: 'Building & Programmatic Investments', label: 'Building & Programmatic Investments', color: '#1abc9c'},
            ];
          } else {
            sectionOrder = [
              {type: 'Building & Programmatic Investments', label: 'Building & Programmatic Investments', color: '#1abc9c'},
              {type: 'Building Investment', label: 'Building Investment', color: '#2ecc71'},
            ];
          }
          sectionOrder.forEach(section => {
            const rows = buildRows(section.type);
            if (rows) {
              tableHTML += `<tr><td colspan=\"3\" style=\"font-weight:bold;background:#f2f2f2;color:#000;\">${section.label}</td></tr>` + rows;
            }
          });
          tableHTML += '</tbody></table>';
          investmentsTableContainer.innerHTML = tableHTML;
          investmentsTableContainer.style.display = '';
          setupDollarSignTooltips(); // <-- Add this line
        }
        return;
      }
      // --- Show message and list for Programmatic Investment ---
      if (decisionFilter.value === 'Programmatic Investment') {
        if (scenarioOptionsContainer) scenarioOptionsContainer.style.display = '';
        if (ongoingContainer && ongoingMessage && ongoingList) {
          ongoingContainer.style.display = '';
          ongoingMessage.textContent = 'These schools need academic investments.';
          // Get list of schools in this category
          let schools = [];
          if (window.decisionLogic && window.decisionLogic.schoolData) {
            schools = window.decisionLogic.schoolData.filter(row => row.decision === 'Programmatic Investment').map(row => row['Building Name']);
          }
          ongoingList.innerHTML = schools.length ? schools.map(s => `<li>${s}</li>`).join('') : '<li>No schools found.</li>';
        }
        if (assignmentModeDetails) assignmentModeDetails.style.display = 'none';
        // Hide school select and header
        const schoolSelectHeader = scenarioOptionsContainer.querySelector('h3');
        const schoolSelectDropdown = document.getElementById('schoolSelect');
        if (schoolSelectHeader) schoolSelectHeader.style.display = 'none';
        if (schoolSelectDropdown) schoolSelectDropdown.style.display = 'none';
        // Hide the investments table
        if (investmentsTableContainer) {
          investmentsTableContainer.style.display = 'none';
          investmentsTableContainer.innerHTML = '';
        }
        return;
      }
      // Show normal options
      if (scenarioOptionsContainer) scenarioOptionsContainer.style.display = '';
      if (ongoingContainer) ongoingContainer.style.display = 'none';
      if (assignmentModeDetails) assignmentModeDetails.style.display = '';
      // Show school select and header
      const schoolSelectHeader = scenarioOptionsContainer.querySelector('h3');
      const schoolSelectDropdown = document.getElementById('schoolSelect');
      if (schoolSelectHeader) schoolSelectHeader.style.display = '';
      if (schoolSelectDropdown) schoolSelectDropdown.style.display = '';
    }
    decisionFilter.addEventListener('change', updateScenarioOptionsVisibility);
    // Initial state
    updateScenarioOptionsVisibility();
    // Expose globally so it can be called from elsewhere
    window.updateScenarioOptionsVisibility = updateScenarioOptionsVisibility;
  }
});

const map = new mapboxgl.Map({
  container: 'map',
  style: getSavedMapStyle()
  // center and zoom will be set dynamically after loading GeoJSON
});

// Expose map and geojsonData globally for prioritization UI
window.map = map;
window.geojsonData = null; // Will be set when geojson is loaded

let geojsonData;
let originalGeojsonData; // Keep a copy of the original unfiltered data
// (cleanup) Removed unused state placeholders (initialDecisionData, mapIsReady).
let selectedEnrollment = 0;
let odData = [];
let selectedTypes = [];
let minEnrollment = 0;
let maxEnrollment = 2000;
let minSeats = -500;  // Allow negative seats (over capacity schools)
let maxSeats = 500;
let showVariableRadius = false;
let showUtilizationPie = false;
let selectedFlows = ['expansion', 'maintenance', 'closure', 'other']; // Track selected flows
let schoolDistancesByOrigin = {}; // Origin UniqueID -> array of destination rows (normalized lower)
let nearbyFilterIds = null; // Active filter (origin + destinations), stored normalized
// (cleanup) Removed unused state placeholders (nearbyOverlapOnly, nearbyShowAllSchools).
let includeNonEvalSchools = false; // Include Include_Flow_Chart = "No"
let includeClosedSchools = false; // Include status = "Closed"/"No"
let mapExportRowsData = []; // Rows from Map_Export.csv
let mapExportLookupMaps = { byName: new Map(), byCode: new Map() }; // Lookups for name/code
let decisionAllRows = []; // Full Decision Data Export.csv rows (includes excluded schools)
let decisionAllByName = new Map(); // normalized name -> row
let decisionAllById = new Map();   // normalized UniqueID -> row

// Normalize school level strings from data to our filter values
function normalizeSchoolLevel(level) {
  const norm = (level || '').toString().trim().toLowerCase();
  if (!norm) return '';
  if (norm.includes('elementary')) return 'Elementary';
  if (norm.includes('middle')) return 'Middle';
  if (norm.includes('high')) return 'High';
  if (norm.includes('k-8') || norm.includes('k8')) return 'K-8';
  if (norm.includes('alternative')) return 'Alternative';
  return level; // fallback to raw value
}

// Ensure the map-origin dropdown shows the selected school's name even when set programmatically
function setMapOriginSelect(originId, schoolName) {
  const mapOriginSelect = document.getElementById('mapOriginSchoolSelect');
  if (!mapOriginSelect) return;

  const norm = (s) => (s || '').toString().trim().toLowerCase();
  let match = null;

  if (originId) {
    match = Array.from(mapOriginSelect.options || []).find(opt => opt.value === originId);
  }

  if (!match && schoolName) {
    match = Array.from(mapOriginSelect.options || []).find(
      opt => norm(opt.textContent) === norm(schoolName) || norm(opt.value) === norm(schoolName)
    );
  }

  if (!match) {
    const opt = document.createElement('option');
    opt.value = originId || schoolName || '';
    opt.textContent = schoolName || originId || '';
    mapOriginSelect.appendChild(opt);
    match = opt;
  } else if (schoolName && match.textContent !== schoolName) {
    match.textContent = schoolName;
  }

  mapOriginSelect.value = match.value;
  Array.from(mapOriginSelect.options || []).forEach(opt => {
    opt.selected = opt === match;
  });

  // Keep "School Matches" hidden until a school is selected (even for programmatic changes)
  setNearbySchoolsSectionVisibility(mapOriginSelect.value);
}

function setNearbySchoolsSectionVisibility(selectedId) {
  const section = document.getElementById('nearbySchoolsSection');
  if (!section) return;

  const hasSelection = !!(selectedId && selectedId.toString().trim());
  section.style.display = hasSelection ? '' : 'none';
  if (!hasSelection) {
    section.open = false;
    const list = document.getElementById('nearbySchoolsList');
    if (list) list.textContent = 'Select a school to see matches.';
    const btn = document.getElementById('showNearbySchoolsBtn');
    if (btn) {
      btn.dataset.lastRequested = 'false';
      btn.dataset.mode = 'all';
      btn.textContent = 'Show Overlapping Grades Schools';
    }
  }
}

function getOriginIdForName(schoolName) {
  const norm = (s) => (s || '').toString().trim().toLowerCase();
  if (!schoolName || !window.decisionLogic || !Array.isArray(window.decisionLogic.schoolData)) return '';
  const row = window.decisionLogic.schoolData.find(r => norm(r["Building Name"]) === norm(schoolName));
  if (!row) return '';
  return (row.UniqueID || row["UniqueID"] || row["Unique Id"] || '').toString().trim();
}

// Clear the selected-school highlight ring on the map
function clearSelectedSchoolHighlight() {
  try {
    if (!window.map || typeof window.map.getSource !== 'function') return;
    const src = window.map.getSource('selected-school');
    if (!src || typeof src.setData !== 'function') return;
    src.setData({ type: 'FeatureCollection', features: [] });
  } catch (e) {
    console.warn("⚠️ Unable to clear selected-school highlight:", e);
  }
}

// Given an origin + destination, show the distance using the SchooltoSchoolDistances.csv data.
// This is used when an origin is already selected and the user clicks a different school on the map.
window.updateDistanceToSelected = function(originId, destId, destName, coordinates) {
  const norm = (s) => (s || '').toString().trim().toLowerCase();
  const originKey = norm(originId);
  const destKey = norm(destId);
  const originName = window.currentOriginName || 'selected school';
  const destinationName = destName || destId || 'destination school';

  let distMiles = null;
  try {
    if (originKey && destKey && originKey === destKey) {
      distMiles = 0;
    } else if (originKey && window.schoolDistancesByOrigin && Array.isArray(window.schoolDistancesByOrigin[originKey])) {
      const rows = window.schoolDistancesByOrigin[originKey];
      const match =
        rows.find(r => norm(r.destId) === destKey) ||
        rows.find(r => norm(r.destName) === norm(destinationName));
      if (match && match.distanceMiles !== null && match.distanceMiles !== undefined && match.distanceMiles !== '') {
        const v = parseFloat(match.distanceMiles);
        if (isFinite(v)) distMiles = v;
      }
    }

    // Fallback: try reverse direction if origin->dest isn't present in the loaded slice
    if (distMiles === null && destKey && window.schoolDistancesByOrigin && Array.isArray(window.schoolDistancesByOrigin[destKey])) {
      const rowsRev = window.schoolDistancesByOrigin[destKey];
      const matchRev = rowsRev.find(r => norm(r.destId) === originKey);
      if (matchRev && matchRev.distanceMiles !== null && matchRev.distanceMiles !== undefined && matchRev.distanceMiles !== '') {
        const v = parseFloat(matchRev.distanceMiles);
        if (isFinite(v)) distMiles = v;
      }
    }
  } catch (e) {
    console.warn("⚠️ updateDistanceToSelected lookup failed:", e);
  }

  const distText = (distMiles === null || distMiles === undefined || !isFinite(distMiles))
    ? 'N/A'
    : distMiles.toFixed(1);

  // Show a popup at the clicked destination (if we have a coordinate), otherwise do nothing visual.
  try {
    if (window.map && window.mapboxgl && coordinates && Array.isArray(coordinates) && coordinates.length === 2) {
      new window.mapboxgl.Popup({ closeOnMove: true })
        .setLngLat(coordinates)
        .setHTML(
          `<div style="font-size:12px; line-height:1.25;">
            <div style="font-weight:700; margin-bottom:4px;">${destinationName}</div>
            <div>Distance to <span style="font-weight:600;">${originName}</span>: <span style="font-weight:700;">${distText} mi</span></div>
          </div>`
        )
        .addTo(window.map);
    } else {
      console.log(`📏 Distance to ${originName} from ${destinationName}: ${distText} mi`);
    }
  } catch (ePopup) {
    console.warn("⚠️ Unable to display distance popup:", ePopup);
  }
};

function updateNearbySchoolsPanel(originId, schoolName, options = {}) {
  const { overlapOnly = false, showAllSchools = false } = options;
  const container = document.getElementById('nearbySchoolsList');
  if (!container) return;
  const norm = (s) => (s || '').toString().trim().toLowerCase();
  const originKey = norm(originId) || norm(getOriginIdForName(schoolName));

  // If showing all schools, render from full decision data and skip origin checks
  if (showAllSchools) {
    const allRows = (window.decisionLogic && Array.isArray(window.decisionLogic.schoolData))
      ? window.decisionLogic.schoolData
      : [];
    if (!allRows.length) {
      container.innerHTML = 'No schools available to display.';
      return;
    }

    const cleanTextAll = (val) => {
      const str = (val || '').toString().trim();
      return str.replace(/^'+\s*/, '');
    };

    const tableRowsAll = allRows.map(r => {
      const name = r["Building Name"] || 'School';
      const grades = cleanTextAll(r["School Level"] || r["Grades"] || r["Grade Levels"]) || '—';
      return `
        <tr>
          <td style="padding:4px 6px; border-bottom:1px solid #e5e7eb;" title="${name}">${name}</td>
          <td style="padding:4px 6px; border-bottom:1px solid #e5e7eb;">${grades}</td>
          <td style="padding:4px 6px; border-bottom:1px solid #e5e7eb;">—</td>
          <td style="padding:4px 6px; border-bottom:1px solid #e5e7eb;">—</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <thead>
          <tr>
            <th style="text-align:left; padding:4px 6px; border-bottom:1px solid #d1d5db;">School</th>
            <th style="text-align:left; padding:4px 6px; border-bottom:1px solid #d1d5db;">Grades</th>
            <th style="text-align:left; padding:4px 6px; border-bottom:1px solid #d1d5db;">Overlapping Grades</th>
            <th style="text-align:left; padding:4px 6px; border-bottom:1px solid #d1d5db;">Distance</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsAll}
        </tbody>
      </table>`;
    return;
  }

  if (!originKey || !schoolDistancesByOrigin || !Array.isArray(schoolDistancesByOrigin[originKey])) {
    container.innerHTML = 'Select a school and click “Show Overlapping Grades Schools” to see matches.';
    return;
  }

  const rows = schoolDistancesByOrigin[originKey];
  if (!rows.length) {
    container.innerHTML = `No nearby schools found for ${schoolName || 'selection'}.`;
    return;
  }

  const cleanText = (val) => {
    const str = (val || '').toString().trim();
    return str.replace(/^'+\s*/, ''); // strip leading apostrophes that appear in CSV
  };

  const filteredRows = rows.filter(r => {
    const overlapClean = cleanText(r.gradeOverlap);
    return overlapOnly ? !(overlapClean && overlapClean.toLowerCase() === 'no') : true;
  });

  if (!filteredRows.length) {
    const hasAnyRows = rows.length > 0;
    container.innerHTML = overlapOnly && hasAnyRows
      ? `No overlapping-grade schools found within the threshold for ${schoolName || 'selection'}. Click “Show All Schools” to see all schools.`
      : `No nearby schools found for ${schoolName || 'selection'}.`;
    return;
  }

  const tableRows = filteredRows.map(r => {
    const name = r.destName || r.destId || 'School';
    const grades = cleanText(r.destGrades) || '—';
    const overlapClean = cleanText(r.gradeOverlap);
    const overlap = overlapClean && overlapClean.toLowerCase() !== 'no' ? overlapClean : '—';
    const distVal = parseFloat(r.distanceMiles);
    const dist = Number.isFinite(distVal) ? `${distVal.toFixed(1)} mi` : 'N/A';
    return `
      <tr>
        <td style="padding:4px 6px; border-bottom:1px solid #e5e7eb; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;" title="${name}">${name}</td>
        <td style="padding:4px 6px; border-bottom:1px solid #e5e7eb;">${grades}</td>
        <td style="padding:4px 6px; border-bottom:1px solid #e5e7eb;">${overlap}</td>
        <td style="padding:4px 6px; border-bottom:1px solid #e5e7eb;">${dist}</td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <table style="width:100%; border-collapse:collapse; font-size:12px;">
      <thead>
        <tr>
          <th style="text-align:left; padding:4px 6px; border-bottom:1px solid #d1d5db;">School</th>
          <th style="text-align:left; padding:4px 6px; border-bottom:1px solid #d1d5db;">Grades</th>
          <th style="text-align:left; padding:4px 6px; border-bottom:1px solid #d1d5db;">Overlapping Grades</th>
          <th style="text-align:left; padding:4px 6px; border-bottom:1px solid #d1d5db;">Distance</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>`;
}

function buildNearbyFilter(originId, originName, overlapOnly = false, showAllSchools = false) {
  const norm = (s) => (s || '').toString().trim().toLowerCase();
  if (showAllSchools) {
    nearbyFilterIds = null; // no filter; show all schools
    return;
  }
  const originKey = norm(originId) || norm(getOriginIdForName(originName));
  if (!originKey || !schoolDistancesByOrigin || !Array.isArray(schoolDistancesByOrigin[originKey])) {
    nearbyFilterIds = null;
    return;
  }
  const rows = schoolDistancesByOrigin[originKey];
  const ids = new Set();
  ids.add(originKey);
  const cleanText = (val) => (val || '').toString().trim().replace(/^'+\s*/, '');
  rows.forEach(r => {
    const overlapClean = cleanText(r.gradeOverlap);
    if (overlapOnly && overlapClean && overlapClean.toLowerCase() === 'no') return;
    if (r.destId) ids.add(norm(r.destId));
    if (r.destName) ids.add(norm(r.destName));
  });
  nearbyFilterIds = Array.from(ids);
}

function applyNearbyFilter(originId, originName, overlapOnly = false, showAllSchools = false) {
  // (cleanup) overlapOnly/showAllSchools are passed through to downstream render/update calls.
  buildNearbyFilter(originId, originName, overlapOnly, showAllSchools);
  updateNearbySchoolsPanel(originId, originName, { overlapOnly, showAllSchools });
  updateLayer();
}

function clearFlowchartSelection() {
  const flowSelect = document.getElementById('mainFlowchartSchoolSelect');
  if (flowSelect) {
    flowSelect.value = '';
    Array.from(flowSelect.options || []).forEach(opt => { opt.selected = false; });
  }
  window.currentSelectedSchoolName = '';
  window.currentOriginId = '';
  window.currentOriginName = '';
}

function clearAllSchoolSelections() {
  const mapSelect = document.getElementById('mapOriginSchoolSelect');
  const flowSelect = document.getElementById('mainFlowchartSchoolSelect');
  if (mapSelect) {
    mapSelect.value = '';
    Array.from(mapSelect.options || []).forEach(opt => { opt.selected = false; });
  }
  if (flowSelect) {
    flowSelect.value = '';
    Array.from(flowSelect.options || []).forEach(opt => { opt.selected = false; });
  }
  window.currentSelectedSchoolName = '';
  window.currentOriginId = '';
  window.currentOriginName = '';
}

// Keep flowchart dropdown empty until user explicitly picks a school
let flowchartUserSelected = false;
function enforceFlowchartEmptyUntilUser() {
  const flowSelect = document.getElementById('mainFlowchartSchoolSelect');
  if (!flowSelect || flowchartUserSelected) return;
  flowSelect.value = '';
  Array.from(flowSelect.options || []).forEach(opt => { opt.selected = false; });
}

// Recreate core map sources/layers after a style change (or if missing)
function ensureBaseSourcesLayers() {
  if (!window.map) return;
  const m = window.map;
  // When switching styles, Mapbox may not be ready for addSource/addLayer yet.
  try {
    if (typeof m.isStyleLoaded === 'function' && !m.isStyleLoaded()) {
      return;
    }
  } catch {}
  const data = originalGeojsonData || geojsonData;
  if (!data) return;

  // If utilization pie mode is active, sprites must be re-registered after setStyle()
  // because Mapbox clears images when the style is rebuilt.
  try {
    if (showUtilizationPie && typeof window.ensureUtilizationPieSprites === 'function') {
      window.ensureUtilizationPieSprites();
    }
  } catch (e) {
    console.warn("⚠️ Unable to ensure utilization pie sprites after style change:", e);
  }

  // Schools source
  if (!m.getSource('schools')) {
    m.addSource('schools', { type: 'geojson', data });
  } else {
    // Do not reset to unfiltered data; updateLayer will reapply filtered data
  }
  // Selected school source
  if (!m.getSource('selected-school')) {
    m.addSource('selected-school', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  }

  // Selected school highlight
  if (!m.getLayer('selected-school-highlight')) {
    m.addLayer({
      id: 'selected-school-highlight',
      type: 'circle',
      source: 'selected-school',
      paint: {
        'circle-radius': 14,
        'circle-color': '#007cbf',
        'circle-opacity': 0.35,
        'circle-blur': 0.4
      }
    });
  }
  // Selected school center
  if (!m.getLayer('selected-school-center')) {
    m.addLayer({
      id: 'selected-school-center',
      type: 'circle',
      source: 'selected-school',
      paint: {
        'circle-radius': 6,
        'circle-color': [
          'match',
          ['get', 'Decision Type'],
          "Building Addition", '#2E8B57',
          "Policy Solution for Overcrowding", '#66BB6A',
          "Building Addition with Capital Investment", '#1B5E20',
          "Building Replacement", '#4B830D',
          "Targeted Capital Investment", '#FFA726',
          "Standard Maintenance", '#FFD54F',
          "Major Capital Investment", '#FB8C00',
          "Welcoming School", '#C62828',
          "Welcoming School with Capital Investment", '#E53935',
          "Closure (Goes to Welcoming School)", '#B71C1C',
          "Welcoming School with Building Replacement", '#8B0000',
          "Other / Unknown", '#2F4F4F',
          '#7f8c8d'
        ],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff'
      }
    });
  }

  // Main schools layer
  if (!m.getLayer('schools-layer')) {
    m.addLayer({
      id: 'schools-layer',
      type: 'circle',
      source: 'schools',
      paint: {
        'circle-radius': 6,
        'circle-color': [
          'match',
          ['get', 'Decision Type'],
          "Building Addition", '#2E8B57',
          "Policy Solution for Overcrowding", '#66BB6A',
          "Building Addition with Capital Investment", '#1B5E20',
          "Building Replacement", '#4B830D',
          "Targeted Capital Investment", '#FFA726',
          "Standard Maintenance", '#FFD54F',
          "Major Capital Investment", '#FB8C00',
          "Welcoming School", '#C62828',
          "Welcoming School with Capital Investment", '#E53935',
          "Closure (Goes to Welcoming School)", '#B71C1C',
          "Welcoming School with Building Replacement", '#8B0000',
          "Other / Unknown", '#2F4F4F',
          '#7f8c8d'
        ]
      }
    });
  }

  // Pie layer
  if (!m.getLayer('schools-pie-layer')) {
    m.addLayer({
      id: 'schools-pie-layer',
      type: 'symbol',
      source: 'schools',
      layout: {
        'visibility': showUtilizationPie ? 'visible' : 'none',
        'icon-image': ['coalesce', ['get', 'utilPieImage'], 'util-pie-0.0'],
        'icon-size': 0.8,
        'icon-allow-overlap': true
      }
    });
  }
  // Ensure circle vs pie visibility is consistent after a style change
  try {
    if (m.getLayer('schools-layer')) {
      m.setLayoutProperty('schools-layer', 'visibility', showUtilizationPie ? 'none' : 'visible');
    }
    if (m.getLayer('schools-pie-layer')) {
      m.setLayoutProperty('schools-pie-layer', 'visibility', showUtilizationPie ? 'visible' : 'none');
    }
  } catch {}

  // Closed stripe layer
  if (!m.getLayer('closed-stripe-layer')) {
    m.addLayer({
      id: 'closed-stripe-layer',
      type: 'symbol',
      source: 'schools',
      layout: {
        'visibility': includeClosedSchools ? 'visible' : 'none',
        'text-field': '/',
        'text-size': 22,
        'text-rotate': 45,
        'text-allow-overlap': true,
        'text-ignore-placement': true
      },
      paint: {
        'text-color': '#d32f2f',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.3
      },
      filter: ['==', ['get', 'isClosed'], true]
    });
  } else {
    try {
      m.setLayoutProperty('closed-stripe-layer', 'visibility', includeClosedSchools ? 'visible' : 'none');
    } catch {}
  }
  // Keep the closed stripe on top of the school symbols/circles so it stays visible.
  try {
    if (m.getLayer('closed-stripe-layer')) {
      m.moveLayer('closed-stripe-layer');
    }
  } catch {}

  // Nearby destinations highlight layer
  if (!m.getLayer('nearby-destinations-layer')) {
    m.addLayer({
      id: 'nearby-destinations-layer',
      type: 'circle',
      source: 'schools',
      layout: {
        'visibility': 'none'
      },
      paint: {
        'circle-radius': 10,
        'circle-color': '#ffffff',
        'circle-opacity': 0,
        'circle-stroke-color': '#00bcd4',
        'circle-stroke-width': 2
      }
    });
  }

  // Assigned schools source/layer (for assignments)
  if (!m.getSource('assigned-schools')) {
    m.addSource('assigned-schools', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  }
  if (!m.getLayer('assigned-schools-layer')) {
    m.addLayer({
      id: 'assigned-schools-layer',
      type: 'circle',
      source: 'assigned-schools',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'assigned'], 0, 4, 10, 8, 50, 16, 100, 24],
        'circle-color': '#FF530D',
        'circle-opacity': 0.8,
        'circle-stroke-color': '#333',
        'circle-stroke-width': 1
      }
    });
  }

  // Sending school halo source/layer
  if (!m.getSource('sending-school')) {
    m.addSource('sending-school', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  }
  if (!m.getLayer('sending-school-halo')) {
    m.addLayer({
      id: 'sending-school-halo',
      type: 'circle',
      source: 'sending-school',
      paint: {
        'circle-radius': 15,
        'circle-color': '#FFD700',
        'circle-opacity': 0.8,
        'circle-blur': 0.6
      }
    });
  }

  // Isochrone source/layer (leave empty unless computed)
  if (!m.getSource('isochrone')) {
    m.addSource('isochrone', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  }
  if (!m.getLayer('isochrone-layer')) {
    m.addLayer({
      id: 'isochrone-layer',
      type: 'fill',
      source: 'isochrone',
      paint: { 'fill-color': '#1E90FF', 'fill-opacity': 0.3 }
    });
  }

  // Reapply current filters after ensuring sources/layers exist
  try {
    updateLayer();
  } catch (err) {
    console.warn("⚠️ Failed to reapply filters after ensuring base layers:", err);
  }
}

function updateLayer() {
    if (!originalGeojsonData) { 
      console.log("⚠️ updateLayer called but originalGeojsonData not loaded yet");
      return; 
    }

  // Sync include/exclude toggles from DOM to avoid accidental resets
  const includeNonEvalEl = document.getElementById('toggleIncludeNonEval');
  const includeClosedEl = document.getElementById('toggleIncludeClosed');
  includeNonEvalSchools = !!(includeNonEvalEl && includeNonEvalEl.checked);
  includeClosedSchools = !!(includeClosedEl && includeClosedEl.checked);

  // If utilization pie mode is enabled, make sure sprite images exist.
  // Slider updates can change the underlying data and users can toggle pie right after.
  try {
    if (
      showUtilizationPie &&
      typeof window.ensureUtilizationPieSprites === 'function' &&
      window.map &&
      typeof window.map.hasImage === 'function' &&
      !window.map.hasImage('util-pie-0.0')
    ) {
      window.ensureUtilizationPieSprites();
    }
  } catch (e) {
    console.warn("⚠️ Unable to ensure utilization pie sprites in updateLayer:", e);
  }

  console.log("🔄 Updating layer with filters:", { selectedFlows, selectedTypes, minEnrollment, maxEnrollment });

  // Always filter from the original unfiltered data
  let flow2Count = 0;
  let flow2Filtered = 0;
  
  const filteredFeatures = originalGeojsonData.features.filter(f => {
    const nameRaw = (f.properties['Building Name'] || '').toString();
    const nameNorm = nameRaw.toLowerCase();
    // Read precomputed flags injected into GeoJSON (keeps behavior consistent after slider updates/style changes)
    const includeVal = (f.properties['includeFlowChart'] || '').toString().trim().toLowerCase();
    const includeYes = includeVal === 'yes' || includeVal === 'y' || includeVal === 'true' || includeVal === '1';
    const isNonEval = (f.properties['isNonEval'] === true) || (!includeYes);

    const statusNorm = (f.properties['status'] || '').toString().trim().toLowerCase();
    const isClosed =
      f.properties.isClosed === true ||
      f.properties['isClosed'] === true ||
      statusNorm === 'no' ||
      statusNorm.includes('closed');

    // Hard gates (independent) + BYPASS behavior:
    // - If "Include closed" is ON, closed schools should show regardless of all other filters.
    // - If "Include non-eval" is ON, non-eval (but not closed) schools should show regardless of all other filters.
    // - A school that is both closed and non-eval is governed by the closed toggle.
    if (isClosed) {
      return includeClosedSchools;
    }
    if (isNonEval) {
      if (!includeNonEvalSchools) {
        return false;
      }
      return true; // bypass all other filters for non-eval schools
    }

    // Eval + open schools continue through normal filters
    if (!isClosed && isNonEval && !includeNonEvalSchools) {
      if (nameNorm.includes('compass')) {
        console.log("🚫 Filtered (non-eval) Compass:", {
          name: nameRaw,
          includeVal,
          isNonEval,
          includeNonEvalSchools
        });
      }
      return false;
    }

    const enrollment = parseInt(f.properties['Enrollment']) || 0;
    const availableSeats = parseInt(f.properties['Available Seats']) || 0;
    const level = normalizeSchoolLevel(f.properties['School Level']);
    const decisionType = f.properties['Decision Type'];
    const flowNumber = f.properties['flow']; // Get the flow number stored during evaluation
    const normLocal = (s) => (s || '').toString().trim().toLowerCase();
    const uid = normLocal(f.properties['UniqueID']);
    const name = normLocal(f.properties['Building Name']);

    const matchesEnrollment = enrollment >= minEnrollment && enrollment <= maxEnrollment;
    const matchesSeats = availableSeats >= minSeats && availableSeats <= maxSeats;
    const matchesType = selectedTypes.length === 0 || selectedTypes.includes(level);
    const matchesFlow = matchesFlowFilter(decisionType, flowNumber);
    const matchesNearby = !nearbyFilterIds || nearbyFilterIds.length === 0
      ? true
      : nearbyFilterIds.includes(uid) || nearbyFilterIds.includes(name);

    // Track Flow 2 (expansion) schools
    if (flowNumber === 2) {
      flow2Count++;
      if (matchesEnrollment && matchesSeats && matchesType && matchesFlow) {
        flow2Filtered++;
      } else {
        console.log(`❌ Flow 2 school filtered out: ${f.properties['Building Name']}`, {
          availableSeats: availableSeats,
          seatsFilter: `${minSeats} to ${maxSeats}`,
          matchesEnrollment,
          matchesSeats,
          matchesType,
          matchesFlow
        });
      }
    }

    return matchesEnrollment && matchesSeats && matchesType && matchesFlow && matchesNearby;
  });
  
  console.log(`🟩 Flow 2 (Expansion): ${flow2Filtered} of ${flow2Count} schools passed all filters`);
  
  // Count how many schools per flow
  const flowCounts = {};
  const sampleSchools = [];
  originalGeojsonData.features.forEach((f, idx) => {
    const flowNumber = f.properties['flow'];
    flowCounts[flowNumber] = (flowCounts[flowNumber] || 0) + 1;
    
    // Sample first 3 schools
    if (idx < 3) {
      sampleSchools.push({
        name: f.properties['Building Name'],
        flow: flowNumber,
        decision: f.properties['Decision Type']
      });
    }
  });
  console.log("📊 Schools per flow:", flowCounts);
  console.log("🏫 Sample schools:", sampleSchools);

  console.log(`📍 Filtered ${originalGeojsonData.features.length} schools to ${filteredFeatures.length} schools`);

  // Prepare pie icon names before updating the source so symbols render immediately
  if (showUtilizationPie) {
    filteredFeatures.forEach(f => {
      const bucket = f.properties["utilPieBucket"] || "0.0";
      const decisionType = f.properties["Decision Type"] || f.properties["decision"] || "Unknown";
      const colorKey = getDecisionColorKey(decisionType);
      f.properties["utilPieImage"] = `util-pie-${bucket}-${colorKey}`;
    });
  }

  const updatedData = { ...originalGeojsonData, features: filteredFeatures };
  
  // Update both schools and halo layers
  if (map.getSource('schools')) {
    map.getSource('schools').setData(updatedData);
  }

  // If layers aren't ready yet, skip styling updates
  if (!map.getLayer || !map.getLayer('schools-layer')) {
    return;
  }

  // Prepare pie icon names when utilization pies are enabled
  if (showUtilizationPie) {
    filteredFeatures.forEach(f => {
      const bucket = f.properties["utilPieBucket"] || "0.0";
      const decisionType = f.properties["Decision Type"] || f.properties["decision"] || "Unknown";
      const colorKey = getDecisionColorKey(decisionType);
      f.properties["utilPieImage"] = `util-pie-${bucket}-${colorKey}`;
    });
  }

  // Size dots by enrollment when toggleYes ("Show size by capacity (enrollment)") is active
  // otherwise use a constant radius. If utilization pies are enabled, hide circle sizing
  // and show pie icons instead.
  if (!showUtilizationPie) {
    if (showVariableRadius && filteredFeatures.length > 0) {
      const enrollValues = filteredFeatures
        .map(f => parseFloat(f.properties["Enrollment"] || 0))
        .filter(v => Number.isFinite(v) && v > 0);
      if (enrollValues.length > 0) {
        const minEnrollVal = Math.min(...enrollValues);
        const maxEnrollVal = Math.max(...enrollValues);
        // Avoid zero-width ranges; pad a bit
        const rangeMin = Math.max(0, Math.floor(minEnrollVal / 10) * 10);
        const rangeMax = Math.ceil(maxEnrollVal / 10) * 10;
        const clampedRangeMax = rangeMax > rangeMin ? rangeMax : rangeMin + 10;
        map.setPaintProperty(
          'schools-layer',
          'circle-radius',
          [
            'interpolate',
            ['linear'],
            ['coalesce', ['get', 'Enrollment'], 0],
            rangeMin, 4,
            clampedRangeMax, 14
          ]
        );
        console.log("📏 Variable radius enabled (enrollment)", { rangeMin, rangeMax: clampedRangeMax });
      } else {
        map.setPaintProperty('schools-layer', 'circle-radius', 6);
        console.warn("⚠️ Variable radius requested but no enrollment values found; using constant size.");
      }
    } else {
      map.setPaintProperty('schools-layer', 'circle-radius', 6);
    }
  }

  // When utilization pies are enabled, size the pie icons by enrollment if requested
  if (map.getLayer('schools-pie-layer')) {
    if (showUtilizationPie && showVariableRadius && filteredFeatures.length > 0) {
      const enrollValues = filteredFeatures
        .map(f => parseFloat(f.properties["Enrollment"] || 0))
        .filter(v => Number.isFinite(v) && v > 0);
      if (enrollValues.length > 0) {
        const minEnrollVal = Math.min(...enrollValues);
        const maxEnrollVal = Math.max(...enrollValues);
        const rangeMin = Math.max(0, Math.floor(minEnrollVal / 10) * 10);
        const rangeMax = Math.ceil(maxEnrollVal / 10) * 10;
        const clampedRangeMax = rangeMax > rangeMin ? rangeMax : rangeMin + 10;
        // Map enrollment to icon-size between ~0.6 and 1.2 (on 40px sprites → 24–48px)
        map.setLayoutProperty(
          'schools-pie-layer',
          'icon-size',
          [
            'interpolate',
            ['linear'],
            ['coalesce', ['get', 'Enrollment'], 0],
            rangeMin, 0.6,
            clampedRangeMax, 1.2
          ]
        );
      } else {
        map.setLayoutProperty('schools-pie-layer', 'icon-size', 0.8);
      }
    } else {
      map.setLayoutProperty('schools-pie-layer', 'icon-size', 0.8);
    }
  }

  // Toggle pie layer vs circles
  if (map.getLayer('schools-pie-layer')) {
    map.setLayoutProperty('schools-pie-layer', 'visibility', showUtilizationPie ? 'visible' : 'none');
  }
  if (map.getLayer('schools-layer')) {
    map.setLayoutProperty('schools-layer', 'visibility', showUtilizationPie ? 'none' : 'visible');
  }
}

// Flow filtering functions - now uses actual flow number from evaluation
function matchesFlowFilter(decisionType, flowNumber) {
  if (selectedFlows.length === 0) {
    console.log("⚠️ No flows selected, filtering out all schools");
    return false;
  }
  
  // Map flow numbers (from decision logic) to category names
  const flowNumberMapping = {
    2: 'expansion',      // Flow 2: Building Addition
    3: 'maintenance',    // Flow 3: Maintenance/Investment  
    4: 'closure',        // Flow 4: Consolidation/Closure
  };

  // Prefer flow number if provided
  const flowNum = Number(flowNumber);
  if (Number.isFinite(flowNum) && flowNumberMapping[flowNum]) {
    return selectedFlows.includes(flowNumberMapping[flowNum]);
  }

  // Fallback to decision type mapping
  const flowMapping = {
    'Building Addition': 'expansion',
    'Policy Solution for Overcrowding': 'expansion',
    'Building Addition with Capital Investment': 'expansion',
    'Building Replacement': 'maintenance',
    'Targeted Capital Investment': 'maintenance',
    'Standard Maintenance': 'maintenance',
    'Major Capital Investment': 'maintenance',
    'Welcoming School': 'closure',
    'Welcoming School with Capital Investment': 'closure',
    'Closure (Goes to Welcoming School)': 'closure',
    'Welcoming School with Building Replacement': 'closure',
    'Other / Unknown': 'other'
  };

  const flow = flowMapping[decisionType] || 'other';
  return selectedFlows.includes(flow);
}

function normalizeId(id) {
  return (id || "").toString().trim().toLowerCase();
}

function buildMapExportLookup(rows) {
  const byName = new Map();
  const byCode = new Map();
  (rows || []).forEach(row => {
    const nameKey = normalizeName(row["Building Name"]);
    const codeKey = normalizeId(row["Building Code"]);
    if (nameKey) byName.set(nameKey, row);
    if (codeKey) byCode.set(codeKey, row);
  });
  return { byName, byCode };
}

function mergeGeojsonWithMapExport(geojson, rows) {
  if (!geojson || !Array.isArray(geojson.features)) {
    return { geojson, lookup: { byName: new Map(), byCode: new Map() } };
  }

  const lookup = buildMapExportLookup(rows);
  const seenNames = new Set();

  const mergedFeatures = geojson.features.map(feature => {
    const f = { ...feature, properties: { ...(feature.properties || {}) } };
    const nameKey = normalizeName(f.properties["Building Name"]);
    const existingId = normalizeId(f.properties["UniqueID"]);
    const csvRow = nameKey ? lookup.byName.get(nameKey) : null;
    const csvCode = normalizeId(csvRow?.["Building Code"]);

    // Fill UniqueID from Map_Export when missing
    if (!existingId && csvCode) {
      f.properties["UniqueID"] = csvRow["Building Code"].toString().trim();
    }

    // Backfill coordinates if missing/invalid
    const needsCoords =
      !f.geometry ||
      !Array.isArray(f.geometry.coordinates) ||
      f.geometry.coordinates.some(c => c === null || Number.isNaN(c));
    const lat = parseFloat(csvRow?.["Latitude"]);
    const lon = parseFloat(csvRow?.["Longitude"]);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);
    if (needsCoords && hasCoords) {
      f.geometry = { type: "Point", coordinates: [lon, lat] };
      f.properties["Latitude"] = lat;
      f.properties["Longitude"] = lon;
    }

    if (nameKey) seenNames.add(nameKey);
    return f;
  });

  // Add any schools present in Map_Export.csv but missing from GeoJSON
  (rows || []).forEach(row => {
    const nameKey = normalizeName(row["Building Name"]);
    const lat = parseFloat(row["Latitude"]);
    const lon = parseFloat(row["Longitude"]);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);
    if (nameKey && !seenNames.has(nameKey) && hasCoords) {
      mergedFeatures.push({
        type: "Feature",
        properties: {
          "Building Name": row["Building Name"],
          "Latitude": lat,
          "Longitude": lon,
          "UniqueID": row["Building Code"] ? row["Building Code"].toString().trim() : "",
          "Decision Type": "Not Evaluated",
          "includeFlowChart": "no",
          "isNonEval": true,
          "status": "",
          "isClosed": false
        },
        geometry: { type: "Point", coordinates: [lon, lat] }
      });
      seenNames.add(nameKey);
    }
  });

  return { geojson: { ...geojson, features: mergedFeatures }, lookup };
}
function updateFlowFilter() {
  selectedFlows = [];
  
  console.log("🔍 Current checkbox states from storage:", flowCheckboxStates);
  
  // Use the stored state instead of querying DOM (in case DOM is stale)
  if (flowCheckboxStates['flow-expansion']) {
    selectedFlows.push('expansion');
  }
  if (flowCheckboxStates['flow-maintenance']) {
    selectedFlows.push('maintenance');
  }
  if (flowCheckboxStates['flow-closure']) {
    selectedFlows.push('closure');
  }
  if (flowCheckboxStates['flow-other']) {
    selectedFlows.push('other');
  }
  
  console.log("✅ Selected flows after update:", selectedFlows);
  
  if (map && map.getSource && map.getSource('schools')) {
    updateLayer();
  } else {
    console.warn("⚠️ Map or schools source not ready yet");
  }
}

function normalize(str) {
    return str?.toLowerCase().replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
}

// ✅ Move updateLegend function outside map.on('load') for global access
// Always showing decisions view (toggle buttons removed)
const showingAssignments = false;
let flowCheckboxStates = {
  'flow-expansion': true,
  'flow-maintenance': true,
  'flow-closure': true,
  'flow-other': true
};

function updateLegend() {
  console.log("🔄 updateLegend called, current checkbox states:", JSON.stringify(flowCheckboxStates));
  
  const legendContent = document.getElementById('legend-content');
  const legendToggle = document.getElementById('legend-toggle');
  if (!legendContent) return;
  
  legendContent.innerHTML = '';
  // Match the padding scale used by Map Filters panel content
  legendContent.style.cssText = 'padding: 8px 10px 12px 10px; line-height: 1.4; max-height: 80vh; overflow-y: auto;';

  // Update the toggle label to reflect current mode (Decision Types Legend vs Assignment View)
  if (legendToggle) {
    const baseLabel = showingAssignments ? 'Assignment View' : 'Decision Types Legend';
    const chevron = legendToggle.querySelector('span.chevron');
    const textSpan = legendToggle.querySelector('.legend-title') || legendToggle.querySelector('span:not(.chevron)');
    if (textSpan) textSpan.textContent = baseLabel;
    // Chevron glyph stays constant; CSS handles rotation based on collapsed/expanded state.
    if (chevron) chevron.textContent = '▸';
  }

  const decisionLegendGroups = {
    "Expansion": {
      "Building Addition": '#2E8B57',           // Emerald
      "Policy Solution for Overcrowding": '#66BB6A',     // Lime
      "Building Addition with Capital Investment": '#1B5E20', // Forest
      "Building Replacement": '#4B830D'                  // Olive
    },
    "Maintenance/Investment": {
      "Targeted Capital Investment": '#FFA726',   // Amber
      "Standard Maintenance": '#FFD54F',        // Goldenrod
      "Major Capital Investment": '#FB8C00'     // Burnt Orange
    },
    "Closure/Consolidation": {
      "Welcoming School": '#C62828',   // Crimson
      "Welcoming School with Capital Investment": '#E53935',  // Vermilion
      "Closure (Goes to Welcoming School)": '#B71C1C', // Firebrick
      "Welcoming School with Building Replacement": '#8B0000'        // Deep Red Brown
    }
  };

  const assignmentLegend = {
    "Assigned Students": '#FF530D'
  };

  // Title is now handled by the legend toggle header; no separate title inside content

  if (showingAssignments) {
    for (const [label, color] of Object.entries(assignmentLegend)) {
      const row = document.createElement('div');
      row.className = 'legend-row';
      row.style.cssText = 'margin-bottom: 1px; padding: 0; display: flex; align-items: center;';
      
      // Create color swatch
      const swatch = document.createElement('span');
      swatch.className = 'legend-swatch';
      swatch.style.cssText = `background:${color}; width: 12px; height: 12px; border-radius: 2px; margin-right: 4px; border: 1px solid #ccc; display: inline-block;`;
      
      // Create label text
      const labelText = document.createElement('span');
      labelText.textContent = label;
      labelText.style.cssText = 'font-size: 13px; color: #555;';
      
      row.appendChild(swatch);
      row.appendChild(labelText);
      legendContent.appendChild(row);
    }
  } else {
    for (const [groupName, items] of Object.entries(decisionLegendGroups)) {
      // Add group header with checkbox
      const groupHeader = document.createElement('div');
      groupHeader.className = 'legend-group-header';
      groupHeader.style.cssText = 'font-weight: bold; margin-top: 6px; margin-bottom: 2px; color: #333; border-bottom: 2px solid #ddd; padding-bottom: 2px; display: flex; align-items: center; background: #f8f9fa; padding: 2px 4px; border-radius: 4px;';
      
      // Create checkbox
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.style.cssText = 'margin-right: 4px; transform: scale(1.1); cursor: pointer;';
      
      // Map group names to flow IDs
      const flowIdMap = {
        'Expansion': 'flow-expansion',
        'Maintenance/Investment': 'flow-maintenance',
        'Closure/Consolidation': 'flow-closure',
        'Other': 'flow-other'
      };
      
      checkbox.id = flowIdMap[groupName];
      // Restore checkbox state from saved state
      const savedState = flowCheckboxStates[checkbox.id];
      checkbox.checked = savedState !== undefined ? savedState : true;
      console.log(`🔧 Restoring checkbox ${checkbox.id} to:`, checkbox.checked);
      
      if (checkbox.id) {
        checkbox.addEventListener('change', (e) => {
          const isChecked = e.target.checked;
          console.log(`🔲 Checkbox ${checkbox.id} changed to:`, isChecked);
          
          // Save checkbox state
          flowCheckboxStates[checkbox.id] = isChecked;
          console.log("📦 All checkbox states:", JSON.stringify(flowCheckboxStates));
          
          updateFlowFilter();
        });
      }
      
      // Create label with emoji and text
      const label = document.createElement('span');
      const emojiMap = {
        'Expansion': '🟩',
        'Maintenance/Investment': '🛠️',
        'Closure/Consolidation': '🚫',
        'Other': '⚪'
      };
      label.textContent = `${emojiMap[groupName] || '⚪'} ${groupName}`;
      label.style.cssText = 'font-size: 14px; letter-spacing: 0.5px;';
      
      groupHeader.appendChild(checkbox);
      groupHeader.appendChild(label);
      legendContent.appendChild(groupHeader);
      
      // Add items in this group
      for (const [label, color] of Object.entries(items)) {
        const row = document.createElement('div');
        row.className = 'legend-row';
        row.style.cssText = 'margin-left: 15px; margin-bottom: 1px; padding: 0; display: flex; align-items: center;';
        
        // Create color swatch
        const swatch = document.createElement('span');
        swatch.className = 'legend-swatch';
        swatch.style.cssText = `background:${color}; width: 12px; height: 12px; border-radius: 2px; margin-right: 4px; border: 1px solid #ccc; display: inline-block;`;
        
        // Create label text
        const labelText = document.createElement('span');
        labelText.textContent = label;
        labelText.style.cssText = 'font-size: 13px; color: #555;';
        
        row.appendChild(swatch);
        row.appendChild(labelText);
        legendContent.appendChild(row);
      }
    }
  }
}

// ✅ Global popup for assignment circles
let assignmentPopup = null;

function setupAssignmentPopup() {
  console.log("🔧 Setting up assignment popup...");
  
  // Check if the layer exists
  if (!map.getLayer('assigned-schools-layer')) {
    console.error("❌ assigned-schools-layer does not exist!");
    return;
  }
  
  // Check layer visibility
  const layerVisibility = map.getLayoutProperty('assigned-schools-layer', 'visibility');
  console.log("👁️ Layer visibility:", layerVisibility);
  
  // Check if source exists and has data
  const source = map.getSource('assigned-schools');
  if (source) {
    console.log("📊 Source exists, current data:", source._data);
    console.log("📊 Number of features in source:", source._data?.features?.length || 0);
  } else {
    console.error("❌ assigned-schools source does not exist!");
  }
  
  if (!assignmentPopup) {
    assignmentPopup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false
    });
    console.log("✅ Created new assignment popup");
  }
  
  // Remove existing listeners to avoid duplicates
  map.off('mouseenter', 'assigned-schools-layer');
  map.off('mouseleave', 'assigned-schools-layer');
  
  console.log("🎯 Adding mouse event listeners to assigned-schools-layer...");
  
  // Add popup for assigned-schools layer
  map.on('mouseenter', 'assigned-schools-layer', (e) => {
    console.log("🖱️ Mouse entered assigned-schools layer!");
    console.log("🖱️ Event features:", e.features);
    console.log("🖱️ First feature properties:", e.features[0]?.properties);
    
    if (e.features && e.features.length > 0) {
      map.getCanvas().style.cursor = 'pointer';
      const coordinates = e.features[0].geometry.coordinates.slice();
      const schoolName = e.features[0].properties.name;
      const assignedCount = e.features[0].properties.assigned;
      
      console.log("🏫 School:", schoolName, "Assigned:", assignedCount);
      
      const popupContent = `
        <strong>${schoolName}</strong><br>
        <span style="color: #FF530D; font-weight: bold;">📚 Received ${assignedCount} students</span>
      `;
      
      assignmentPopup.setLngLat(coordinates).setHTML(popupContent).addTo(map);
      console.log("✅ Popup added for:", schoolName);
    } else {
      console.warn("⚠️ No features found in mouseenter event");
    }
  });

  map.on('mouseleave', 'assigned-schools-layer', () => {
    console.log("🖱️ Mouse left assigned-schools layer");
    map.getCanvas().style.cursor = '';
    assignmentPopup.remove();
  });
  
  console.log("✅ Assignment popup setup complete");
}

map.on('load', () => {
  console.log("Map loaded. Fetching initial data...");

  // Apply saved base-map label settings (roads/places/POIs) once the initial style is ready.
  try { rebuildMapLabelLayerIndex(); } catch {}
  try { applyMapLabelPrefs(); } catch {}

  const geojsonPromise = fetch('Schools.geojson').then(res => res.json());
  const decisionDataPromise = window.decisionLogic.initialize();
  const decisionAllPromise = fetch('Decision Data Export.csv?v=20260107_1')
    .then(res => res.text())
    .then(text => new Promise(resolve => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: results => resolve(results.data || [])
      });
    }))
    .catch(err => {
      console.warn("⚠️ Failed to load full Decision Data Export.csv:", err);
      return [];
    });
  const distancesPromise = fetch('SchooltoSchoolDistances.csv')
    .then(res => res.text())
    .then(text => {
      return new Promise(resolve => {
        Papa.parse(text, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: results => resolve(results.data || [])
        });
      });
    })
    .then(rows => {
      const grouped = {};
      const norm = s => (s || '').toString().trim().toLowerCase();
      rows.forEach(row => {
        const originId =
          norm(row["Origin CDE Prefix"]) || // match our UniqueID format (CO-1420-####)
          norm(row["Origin CDE Code"]) ||
          norm(row["Origin CDE"]) ||
          "";
        if (!originId) return;
        if (!grouped[originId]) grouped[originId] = [];
        grouped[originId].push({
          destName: row["Destination Facility Name"],
          destGrades: row["Destination Grades"],
          gradeOverlap: row["Grade Overlap"],
          destId: norm(row["Destination CDE Prefix"] || row["Destination CDE Code"] || row["Destination CDE"]),
          distanceMiles: row["Network Distance (Miles)"] ?? row["Linear Distance (Miles)"] ?? null,
          nthClosest: row["Nth Closest to Origin"]
        });
      });
      // sort by nth closest
      Object.keys(grouped).forEach(key => {
        grouped[key].sort((a, b) => (a.nthClosest || 0) - (b.nthClosest || 0));
      });
      schoolDistancesByOrigin = grouped;
      window.schoolDistancesByOrigin = grouped;
      console.log("📏 Loaded school-to-school distances for origins:", Object.keys(grouped).length);
    })
    .catch(err => {
      console.warn("⚠️ Failed to load SchooltoSchoolDistances.csv:", err);
      schoolDistancesByOrigin = {};
      window.schoolDistancesByOrigin = {};
    });

  const mapExportPromise = fetch('Map_Export.csv')
    .then(res => res.text())
    .then(text => new Promise(resolve => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: results => resolve(results.data || [])
      });
    }))
    .catch(err => {
      console.warn("⚠️ Failed to load Map_Export.csv:", err);
      return [];
    });

  Promise.all([geojsonPromise, decisionDataPromise, decisionAllPromise, distancesPromise, mapExportPromise])
    .then(([geojson, decisionData, decisionAll, _distances, mapExportRows]) => {
      void _distances; // preloaded for side-effects; not otherwise referenced
      console.log("✅ GeoJSON, Decision Data, full Decision export, and Map Export are loaded.");

      mapExportRowsData = Array.isArray(mapExportRows) ? mapExportRows : [];
      const merged = mergeGeojsonWithMapExport(geojson, mapExportRowsData);
      mapExportLookupMaps = merged.lookup;
      window.mapExportRowsData = mapExportRowsData;
      window.mapExportLookupMaps = mapExportLookupMaps;

      // Build lookups from the FULL decision export (includes excluded/non-eval + closed)
      decisionAllRows = Array.isArray(decisionAll) ? decisionAll : [];
      // Normalize BuildingScore for any downstream display/logic that uses the full export.
      // Accept either 0–1 or 0–10 inputs; keep as a 2-decimal string for consistent display.
      decisionAllRows.forEach((r) => {
        const raw = r && (r.BuildingScore ?? r["BuildingScore"]);
        const n = Number(String(raw ?? "").trim().replace(/,/g, ''));
        if (!Number.isFinite(n)) return;
        const scaled = n <= 1.5 ? n * 10 : n;
        r.BuildingScore = scaled.toFixed(2);
      });
      decisionAllByName = new Map(
        decisionAllRows
          .map(r => [normalizeName(r["Building Name"]), r])
          .filter(([k]) => !!k)
      );
      decisionAllById = new Map(
        decisionAllRows
          .map(r => [normalizeId(r.UniqueID || r["UniqueID"] || r["Unique Id"]), r])
          .filter(([k]) => !!k)
      );

      // Keep all schools; filtering will be controlled by toggles
      geojsonData = merged.geojson;
      window.geojsonData = geojsonData; // Expose globally for prioritization UI
      
      injectDecisionsIntoGeoJSON(geojsonData, decisionData);
      
      // Store a deep copy of the original data for filtering
      originalGeojsonData = JSON.parse(JSON.stringify(geojsonData));
      console.log("✅ Original GeoJSON data saved for filtering");

      // Apply initial filters so non-eval/closed are hidden until toggled on
      try {
        if (map && map.getSource && map.getSource('schools')) {
          updateLayer();
        }
      } catch (initFilterErr) {
        console.warn("⚠️ Initial filter failed:", initFilterErr);
      }
      
      initializeDropdownFilters(decisionData);
      // Wire up "Show Overlapping Grades Schools" toggle button
      const nearbyBtn = document.getElementById('showNearbySchoolsBtn');
      if (nearbyBtn) {
        nearbyBtn.addEventListener('click', () => {
          nearbyBtn.dataset.lastRequested = 'true';
          const currentMode = nearbyBtn.dataset.mode || 'all'; // 'all' or 'overlap'
          const nextMode = currentMode === 'overlap' ? 'all' : 'overlap';
          nearbyBtn.dataset.mode = nextMode;
          const overlapOnly = nextMode === 'overlap';
          const showAllSchools = nextMode === 'all';
          nearbyBtn.textContent = overlapOnly ? 'Show All Schools' : 'Show Overlapping Grades Schools';
          const mapSelect = document.getElementById('mapOriginSchoolSelect');
          const selectedId = mapSelect ? mapSelect.value : '';
          if (!selectedId && !showAllSchools) {
            alert("Please select a school first.");
            return;
          }
          // Build nearby filter set: origin + destinations from distances CSV or all schools
          applyNearbyFilter(selectedId, '', overlapOnly, showAllSchools);

          let selectedName = '';
          if (selectedId && window.decisionLogic && Array.isArray(window.decisionLogic.schoolData)) {
            const row = window.decisionLogic.schoolData.find(r => {
              const uid = (r.UniqueID || r["UniqueID"] || r["Unique Id"] || '').toString().trim();
              return uid === selectedId;
            });
            selectedName = row ? row["Building Name"] : '';
          }
          updateNearbySchoolsPanel(
            selectedId,
            selectedName,
            { overlapOnly, showAllSchools }
          );
        });
      }

      // Populate and sync the origin dropdown that appears on the map
      try {
        const mapOriginSelect = document.getElementById('mapOriginSchoolSelect');
        const flowchartSelect = document.getElementById('mainFlowchartSchoolSelect');
        if (mapOriginSelect) {
          // Build sorted list of schools from decisionLogic.schoolData if available,
          // otherwise from the raw decisionData passed into this function. Store the
          // UniqueID as the option value and the Building Name as the label so we
          // can reliably sync using IDs from the map features.
          const sourceRows = (window.decisionLogic && Array.isArray(window.decisionLogic.schoolData) && window.decisionLogic.schoolData.length > 0)
            ? window.decisionLogic.schoolData
            : decisionData;

          const rowsWithIds = sourceRows
            .filter(r => {
              const name = r["Building Name"];
              const uid = (r.UniqueID || r["UniqueID"] || r["Unique Id"] || "").toString().trim();
              return !!name && !!uid;
            })
            .sort((a, b) => {
              const an = (a["Building Name"] || "").toString();
              const bn = (b["Building Name"] || "").toString();
              return an.localeCompare(bn, undefined, { numeric: true, sensitivity: 'base' });
            });

          mapOriginSelect.innerHTML = '<option value="">-- Select School --</option>';
          rowsWithIds.forEach(row => {
            const uid = (row.UniqueID || row["UniqueID"] || row["Unique Id"] || "").toString().trim();
            const name = row["Building Name"];
            const opt = document.createElement('option');
            opt.value = uid;          // store UniqueID for reliable matching
            opt.textContent = name;   // show human‑readable name
            mapOriginSelect.appendChild(opt);
          });

          // Hide School Matches until a school is selected
          setNearbySchoolsSectionVisibility(mapOriginSelect.value);

          // Keep map dropdown selection in sync with the flowchart dropdown.
          // When the user changes the map dropdown, look up the corresponding
          // school by UniqueID, then drive the flowchart + map from the name.
          mapOriginSelect.addEventListener('change', () => {
            if (mapSelectSyncing) return;
            const selectedId = mapOriginSelect.value;
            setNearbySchoolsSectionVisibility(selectedId);
            if (!selectedId) {
              updateNearbySchoolsPanel('', '');
              window.currentSelectedSchoolName = '';
              window.currentOriginId = '';
              window.currentOriginName = '';
              clearSelectedSchoolHighlight();
              nearbyFilterIds = null;
              updateLayer();
              return;
            }

            // Find the matching row by UniqueID to recover the canonical name
            const allRows = (window.decisionLogic && Array.isArray(window.decisionLogic.schoolData) && window.decisionLogic.schoolData.length > 0)
              ? window.decisionLogic.schoolData
              : decisionData;
            const selectedRow = (allRows || []).find(r => {
              const uid = (r.UniqueID || r["UniqueID"] || r["Unique Id"] || "").toString().trim();
              return uid === selectedId;
            });
            const selectedName = selectedRow ? selectedRow["Building Name"] : "";

            // Track the current selection globally so other components (like
            // the flowchart and slider updates) can use it even if the
            // flowchart dropdown hasn't been interacted with yet.
            if (selectedName) {
              window.currentSelectedSchoolName = selectedName;
              window.currentOriginId = selectedId;
              window.currentOriginName = selectedName;
              localStorage.setItem('mapSelectedOriginId', selectedId);
              localStorage.setItem('mapSelectedOriginName', selectedName);
            }

            // Only update the panel after user explicitly clicks the nearby toggle
            const nearbyBtn = document.getElementById('showNearbySchoolsBtn');
            if (nearbyBtn && nearbyBtn.dataset.lastRequested === 'true') {
              const mode = nearbyBtn.dataset.mode || 'all';
              const overlapOnly = mode === 'overlap';
              const showAllSchools = mode === 'all';
              applyNearbyFilter(selectedId, selectedName, overlapOnly, showAllSchools);
            }

            if (flowchartSelect && selectedName) {
              mapSelectSyncing = true;
              try {
                // Update the flowchart dropdown value and fire its change handler
                flowchartSelect.value = selectedName;
                const evt = new Event('change', { bubbles: true });
                flowchartSelect.dispatchEvent(evt);
              } finally {
                mapSelectSyncing = false;
              }
            }

            // Always ensure the map reflects the newly selected origin,
            // even if the flowchart has not been initialized yet.
            if (selectedName && typeof window.showOnMapFromFlowchart === 'function') {
              mapSelectSyncing = true;
              try {
                window.showOnMapFromFlowchart(selectedName);
              } finally {
                mapSelectSyncing = false;
              }
            }
          });

          // Restore saved selection if available, otherwise auto-select first option
          const tryRestoreSavedSelection = () => {
            const norm = (s) => (s || "").toString().trim().toLowerCase();
            let restored = false;
            if (savedOriginId) {
              const matchById = Array.from(mapOriginSelect.options || []).find(opt => opt.value === savedOriginId);
              if (matchById) {
                mapOriginSelect.value = savedOriginId;
                restored = true;
              }
            }
            if (!restored && savedOriginName) {
              const matchByName = Array.from(mapOriginSelect.options || []).find(opt => norm(opt.textContent) === norm(savedOriginName));
              if (matchByName) {
                mapOriginSelect.value = matchByName.value;
                restored = true;
              }
            }
            if (restored) {
              window.initialSelectionApplied = true;
              const evt = new Event('change', { bubbles: true });
              mapOriginSelect.dispatchEvent(evt);
              console.log("🎯 Restored saved selection:", mapOriginSelect.value);
            }
            return restored;
          };

          if (!window.initialSelectionApplied) {
            const restored = tryRestoreSavedSelection();
            // If not restored, leave selection empty (no auto-selection)
          }

          // No auto-selection: leave empty unless a saved/restored selection was applied
          window.initialSelectionApplied = true;
        }
      } catch (e) {
        console.warn("⚠️ Unable to initialize map origin dropdown:", e);
      }

      // Initialize prioritization UI with school data and decisions
      if (typeof window.prioritizationUI !== 'undefined' && typeof window.prioritizationUI.initialize === 'function') {
        console.log("🎯 Initializing prioritization UI");
        const schoolDataWithDecisions = decisionData.map(row => ({
          ...row,
          decision: row.decision || row["Decision Type"]
        }));
        window.prioritizationUI.initialize(schoolDataWithDecisions);
      }

      // Add the source for the school data
      map.addSource('schools', {
        type: 'geojson',
        data: geojsonData
      });

      // Apply initial filters so non‑eval/closed are hidden until toggled on
      try {
        updateLayer();
      } catch (initialFilterErr) {
        console.warn("⚠️ Initial filter failed:", initialFilterErr);
      }

        // Ensure dropdowns start empty (no default selection) and stay empty until user picks
        setTimeout(() => {
          clearAllSchoolSelections();
          clearFlowchartSelection();
          enforceFlowchartEmptyUntilUser();
          const flowSelect = document.getElementById('mainFlowchartSchoolSelect');
          if (flowSelect) {
            flowSelect.addEventListener('change', () => {
              flowchartUserSelected = !!flowSelect.value;
            });
            const mo = new MutationObserver(() => {
              enforceFlowchartEmptyUntilUser();
            });
            mo.observe(flowSelect, { childList: true, subtree: false });
          }
        }, 0);

      // Fit map to the extent of the loaded GeoJSON
      if (geojsonData.features && geojsonData.features.length > 0) {
        const coordinates = geojsonData.features
          .filter(f => f.geometry && f.geometry.coordinates) // Only features with valid geometry
          .map(f => f.geometry.coordinates);
        console.log("🔍 Found coordinates:", coordinates.length);
        if (coordinates.length > 0) {
          const lats = coordinates.map(c => c[1]);
          const lngs = coordinates.map(c => c[0]);
          const bounds = [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)]
          ];
          console.log("🗺️ Calculated bounds:", bounds);
          // Automatically fit map to show all schools in Jeffco district
          map.fitBounds(bounds, { padding: 40 });
          console.log("✅ Map automatically zoomed to Jeffco district bounds");
        }
      }

      // ✅ Function to fit map to all schools (always use originalGeojsonData for all schools)
      window.fitMapToAllSchools = function() {
        console.log("🔍 fitMapToAllSchools called");
        
        // Use window.map if available, otherwise use local map variable
        const mapToUse = window.map || map;
        
        if (!mapToUse) {
          console.error("⚠️ Map not available");
          alert("Map is not ready. Please wait a moment and try again.");
          return;
        }
        
        // Always use originalGeojsonData to show ALL schools, not filtered ones
        const dataToUse = originalGeojsonData || geojsonData;
        
        if (!dataToUse || !dataToUse.features) {
          console.warn("⚠️ No geojson data available");
          alert("Map data not loaded yet. Please wait a moment and try again.");
          return;
        }
        
        const coordinates = dataToUse.features
          .filter(f => f.geometry && f.geometry.coordinates && Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length === 2) // Only features with valid geometry
          .map(f => f.geometry.coordinates);
        
        if (coordinates.length === 0) {
          console.warn("⚠️ No valid coordinates found");
          alert("No school locations found.");
          return;
        }
        
        const lats = coordinates.map(c => c[1]);
        const lngs = coordinates.map(c => c[0]);
        const bounds = [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)]
        ];
        
        console.log("🗺️ Fitting map to bounds:", bounds, "with", coordinates.length, "schools");
        
        // Ensure map is resized first
        if (mapToUse.resize) {
          mapToUse.resize();
        }
        
        // Use fitBounds with a small delay to ensure resize has taken effect
        setTimeout(() => {
          if (mapToUse && typeof mapToUse.fitBounds === 'function') {
            mapToUse.fitBounds(bounds, { padding: 40, duration: 1000 });
            console.log("✅ fitBounds called successfully");
          } else {
            console.error("⚠️ fitBounds not found");
          }
        }, 50);
      };
      
      console.log("✅ fitMapToAllSchools function defined");

      // Automatically fit to all schools once after initial map setup so the
      // user doesn't need to click the button the first time.
      try {
        setTimeout(() => {
          if (typeof window.fitMapToAllSchools === 'function') {
            window.fitMapToAllSchools();
          }
        }, 200);
      } catch (e) {
        console.warn("⚠️ Automatic initial fitMapToAllSchools failed:", e);
      }

      // Add a source and layer for the selected school's "halo" highlight
      map.addSource('selected-school', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Add the highlight layer first, so it's drawn underneath the school dots
      map.addLayer({
        id: 'selected-school-highlight',
        type: 'circle',
        source: 'selected-school',
        paint: {
          // Slightly larger, soft, glowing halo under the selected school
          'circle-radius': 14,
          'circle-color': '#007cbf',
          'circle-opacity': 0.35,
          'circle-blur': 0.4
        }
      });

      // Add a focused center dot on top of the halo so the selected school stays visible
      map.addLayer({
        id: 'selected-school-center',
        type: 'circle',
        source: 'selected-school',
        paint: {
          'circle-radius': 6,
          'circle-color': [
            'match',
            ['get', 'Decision Type'],
            "Building Addition", '#2E8B57',
            "Policy Solution for Overcrowding", '#66BB6A',
            "Building Addition with Capital Investment", '#1B5E20',
            "Building Replacement", '#4B830D',
            "Targeted Capital Investment", '#FFA726',
            "Standard Maintenance", '#FFD54F',
            "Major Capital Investment", '#FB8C00',
            "Welcoming School", '#C62828',
            "Welcoming School with Capital Investment", '#E53935',
            "Closure (Goes to Welcoming School)", '#B71C1C',
            "Welcoming School with Building Replacement", '#8B0000',
            "Other / Unknown", '#2F4F4F',
            '#7f8c8d'
          ],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff'
        }
      });

      // Add the main schools layer on top of the halo
      map.addLayer({
        id: 'schools-layer',
        type: 'circle',
        source: 'schools',
        paint: {
          'circle-radius': 6,
          'circle-color': [
            'match',
            ['get', 'Decision Type'],
            "Building Addition", '#2E8B57',
            "Policy Solution for Overcrowding", '#66BB6A',
            "Building Addition with Capital Investment", '#1B5E20',
            "Building Replacement", '#4B830D',
            "Targeted Capital Investment", '#FFA726',
            "Standard Maintenance", '#FFD54F',
            "Major Capital Investment", '#FB8C00',
            "Welcoming School", '#C62828',
            "Welcoming School with Capital Investment", '#E53935',
            "Closure (Goes to Welcoming School)", '#B71C1C',
            "Welcoming School with Building Replacement", '#8B0000',
            "Other / Unknown", '#2F4F4F',
            '#7f8c8d'
          ]
        }
      });

      // Symbol layer for utilization pie images (initially hidden)
      map.addLayer({
        id: 'schools-pie-layer',
        type: 'symbol',
        source: 'schools',
        layout: {
          'visibility': 'none',
          'icon-image': ['coalesce', ['get', 'utilPieImage'], 'util-pie-0.0'],
          'icon-size': 0.8,
          'icon-allow-overlap': true
        }
      });

      // Closed-school red slash overlay (shown only when "Include closed schools" is enabled)
      map.addLayer({
        id: 'closed-stripe-layer',
        type: 'symbol',
        source: 'schools',
        layout: {
          'visibility': includeClosedSchools ? 'visible' : 'none',
          'text-field': '/',
          'text-size': 22,
          'text-rotate': 45,
          'text-allow-overlap': true,
          'text-ignore-placement': true
        },
        paint: {
          'text-color': '#d32f2f',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.3
        },
        filter: ['==', ['get', 'isClosed'], true]
      });
      
      // Layer to highlight nearby destination schools within the current
      // distance threshold for the selected origin school.
      map.addLayer({
        id: 'nearby-destinations-layer',
        type: 'circle',
        source: 'schools',
        layout: {
          'visibility': showNearbyHighlight ? 'visible' : 'none'
        },
        paint: {
          'circle-radius': 10,
          'circle-color': '#ffffff',
          'circle-opacity': 0,
          'circle-stroke-color': '#00bcd4',
          'circle-stroke-width': 2
        },
        // Start with no matches; will be updated dynamically
        filter: ['in', ['get', 'UniqueID'], ['literal', []]]
      });
      
      updateLegend();

      // Setup other map features that depend on the 'schools' source
      // Distance/details popup for school clicks: allow closing by clicking
      // anywhere else on the map.
      const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: true
      });

      map.on('mouseenter', 'schools-layer', () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', 'schools-layer', () => {
        map.getCanvas().style.cursor = '';
      });

      // Support clicks on both circle and pie layers
      const handleSchoolClick = (e) => {
        const feature = e.features && e.features[0];
        if (!feature) return;

        const coordinates = feature.geometry.coordinates.slice();
        const schoolNameRaw = feature.properties['Building Name'];
        const uniqueIdFromFeature = (feature.properties['UniqueID'] || "").toString().trim();

        // Derive a canonical school name using DecisionLogic data when possible,
        // so that it matches the names used in all dropdowns. Prefer matching by
        // normalized name rather than relying solely on UniqueID on the feature,
        // since some features may not yet have that ID injected.
        const norm = (s) => (s || "").toString().toLowerCase().trim();
        console.log("🖱️ Map click on school feature:", {
          rawName: schoolNameRaw,
          uniqueIdFromFeature
        });

        let schoolName = schoolNameRaw;
        let originRow = null;
        if (window.decisionLogic && Array.isArray(window.decisionLogic.schoolData)) {
          originRow = window.decisionLogic.schoolData.find(r => norm(r["Building Name"]) === norm(schoolNameRaw));
          if (!originRow && uniqueIdFromFeature) {
            originRow = window.decisionLogic.schoolData.find(r => {
              const uid = (r.UniqueID || r["UniqueID"] || r["Unique Id"] || "").toString().trim();
              return uid === uniqueIdFromFeature;
            });
          }
          if (originRow && originRow["Building Name"]) {
            schoolName = originRow["Building Name"];
          }
        }

        // Determine a robust origin ID using either the joined decision data or
        // the feature properties as a fallback.
        let originUniqueId = "";
        if (originRow) {
          originUniqueId = (
            originRow.UniqueID ||
            originRow["UniqueID"] ||
            originRow["Unique Id"] ||
            ""
          ).toString().trim();
        }
        if (!originUniqueId && uniqueIdFromFeature) {
          originUniqueId = uniqueIdFromFeature;
        }

        console.log("🖱️ Canonical school name resolved from map click:", schoolName, "originRow found?", !!originRow, "originUniqueId:", originUniqueId);

        const hasOrigin = (window.currentOriginId && window.currentOriginId.trim()) ||
                          (window.currentOriginName && window.currentOriginName.trim());
        const destName = schoolName;
        const destId = originUniqueId || getOriginIdForName(destName) || "";

        // If an origin is already selected, treat map clicks as destination lookups only (do not change origin)
        if (hasOrigin) {
          try {
            const originId = window.currentOriginId || getOriginIdForName(window.currentOriginName);
            if (originId && destId && typeof window.updateDistanceToSelected === 'function') {
              window.updateDistanceToSelected(originId, destId, destName, coordinates);
            } else if (map && mapboxgl && coordinates) {
              new mapboxgl.Popup({ closeOnMove: true })
                .setLngLat(coordinates)
                .setHTML(`<div style="font-size:12px;"><strong>${destName}</strong></div>`)
                .addTo(map);
            }
          } catch (eDistance) {
            console.warn("⚠️ Unable to compute distance to selected origin:", eDistance);
          }
          return;
        }

        // No origin selected yet: first map click sets the origin, but avoid changing other dropdowns
        if (schoolName) {
          window.currentSelectedSchoolName = schoolName;
          window.currentOriginId = originUniqueId;
          window.currentOriginName = schoolName;
          updateNearbySchoolsPanel(originUniqueId || getOriginIdForName(schoolName), schoolName);
          if (originUniqueId) {
            localStorage.setItem('mapSelectedOriginId', originUniqueId);
            localStorage.setItem('mapSelectedOriginName', schoolName);
          }
          if (typeof window.updateFlowForSchool === 'function') {
            window.updateFlowForSchool(schoolName, window.thresholds || {});
          }
          if (typeof window.showOnMapFromFlowchart === 'function') {
            window.showOnMapFromFlowchart(schoolName);
          }
        }

        const capacity = feature.properties['Capacity'];
        const utilization = feature.properties['Utilization'];

        let popupContent = `<strong>${schoolName}</strong>`;
        if (capacity !== undefined && capacity !== null && capacity !== '') {
          popupContent += `<br><span>Capacity: ${capacity}</span>`;
        }
        if (utilization !== undefined && utilization !== null && utilization !== '') {
          const utilNum = parseFloat(utilization);
          if (isFinite(utilNum)) {
            // If stored as a ratio (e.g., 0.99), convert to percent; if already percent (e.g., 99), keep as is.
            const pct = utilNum <= 1.5 ? utilNum * 100 : utilNum;
            const utilText = `${pct.toFixed(0)}%`;
            popupContent += `<br><span>Utilization: ${utilText}</span>`;
          } else {
            popupContent += `<br><span>Utilization: ${utilization}</span>`;
          }
        }

        // Remember current origin for distance calculations and destination
        // highlighting.
        if (originUniqueId) {
          window.currentOriginName = schoolName;
          window.currentOriginId = originUniqueId;
        }

        // Only update the panel after user explicitly clicks the nearby toggle
        const nearbyBtn = document.getElementById('showNearbySchoolsBtn');
        if (nearbyBtn && nearbyBtn.dataset.lastRequested === 'true') {
          const mode = nearbyBtn.dataset.mode || 'all';
          const overlapOnly = mode === 'overlap';
          const showAllSchools = mode === 'all';
          applyNearbyFilter(originUniqueId || getOriginIdForName(schoolName), schoolName, overlapOnly, showAllSchools);
        }

        // If we have a current origin school, show distance from that origin
        // to this clicked school (0 if it's the origin itself).
        if (window.currentOriginId && window.distanceToWelcomingRowsByOrigin) {
          const originId = window.currentOriginId.toString().trim();
          const originName = window.currentOriginName || "origin school";
          let distText = "N/A";
          if (uniqueIdFromFeature && uniqueIdFromFeature === originId) {
            distText = "0.0";
          } else if (uniqueIdFromFeature) {
            const rowsByOrigin = window.distanceToWelcomingRowsByOrigin || {};
            const candidatesRaw = rowsByOrigin[originId];
            if (Array.isArray(candidatesRaw)) {
              const match = candidatesRaw.find(r => {
                const destPrefix =
                  r["Destination CDE Prefix"] ||
                  r["Destination CDE Prefix "] ||
                  r["DestinationCDEPrefix"];
                return destPrefix && destPrefix.toString().trim() === uniqueIdFromFeature;
              });
              if (match) {
                const distRaw =
                  match["Network Distance (Miles)"] ||
                  match["Network Distance"] ||
                  match["NetworkDistanceMiles"];
                const dist = parseFloat((distRaw || "").toString().trim());
                if (isFinite(dist)) {
                  distText = dist.toFixed(1);
                }
              }
            }
          }
          popupContent += `<br><span>Distance to ${originName}: ${distText} mi</span>`;
        }

        if (showingAssignments) {
          const assignedSource = map.getSource('assigned-schools');
          if (assignedSource && assignedSource._data?.features) {
            const assignedFeature = assignedSource._data.features.find(f => f.properties.name === schoolName);
            if (assignedFeature) {
              popupContent += `<br><span style="color: #FF530D; font-weight: bold;">📚 Received ${assignedFeature.properties.assigned} students</span>`;
            }
          }
        }

        popup.setLngLat(coordinates).setHTML(popupContent).addTo(map);

        // Update nearby-destination highlight rings based on the newly selected
        // origin school.
        if (
          originUniqueId &&
          typeof window.updateNearbyDestinationsHighlight === 'function'
        ) {
          window.updateNearbyDestinationsHighlight(originUniqueId.toString().trim());
        }

        // Drive the flowchart path directly from the map click so that the
        // correct flow is highlighted even if the dropdown change handler does
        // not fire.
        if (typeof window.updateFlowForSchool === 'function' && schoolName) {
          const thresholdsForFlow =
            window.thresholds ||
            (window.decisionLogic && window.decisionLogic.thresholds) ||
            {};
          console.log("🎯 Calling updateFlowForSchool from map click for:", schoolName);
          window.updateFlowForSchool(schoolName, thresholdsForFlow);
        }
      };

      map.on('click', 'schools-layer', handleSchoolClick);
      map.on('click', 'schools-pie-layer', handleSchoolClick);

      map.on('mouseenter', 'schools-pie-layer', () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', 'schools-pie-layer', () => {
        map.getCanvas().style.cursor = '';
      });

      map.addSource('assigned-schools', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      
      map.addLayer({
        id: 'assigned-schools-layer',
        type: 'circle',
        source: 'assigned-schools',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'assigned'], 0, 4, 10, 8, 50, 16, 100, 24],
          'circle-color': '#FF530D',
          'circle-opacity': 0.8,
          'circle-stroke-color': '#333',
          'circle-stroke-width': 1
        }
      });
      
      setupAssignmentPopup();

      // Define helper so dropdowns and the flowchart "Show on map" button can
      // highlight the selected origin school and zoom the map to it.
      window.showOnMapFromFlowchart = function(originName, opts = {}) {
        const forceSwitch = !!opts.forceSwitch;
        if (!originName) {
          console.warn("⚠️ showOnMapFromFlowchart called with empty originName");
          return;
        }

        // Style changes wipe sources/layers; ensure they're recreated before we try to highlight.
        try {
          ensureBaseSourcesLayers();
        } catch (e) {
          console.warn("⚠️ Unable to ensure base sources/layers before showOnMapFromFlowchart:", e);
        }

        if (!window.map || !window.geojsonData || !Array.isArray(window.geojsonData.features)) {
          console.warn("⚠️ Map or geojsonData not ready for showOnMapFromFlowchart");
          return;
        }

        const norm = (s) => (s || "").toString().toLowerCase().trim();
        const features = window.geojsonData.features;

        // Try exact name match first
        let originFeature = features.find(
          f => norm(f.properties["Building Name"]) === norm(originName)
        );
        // If not found, try a more flexible match (contains / contained in)
        if (!originFeature) {
          originFeature =
            features.find(f => norm(f.properties["Building Name"]).includes(norm(originName))) ||
            features.find(f => norm(originName).includes(norm(f.properties["Building Name"])));
        }

        if (!originFeature) {
          console.warn("⚠️ Origin school not found on map:", originName);
          return;
        }

        // Derive a robust originId, preferring decisionLogic data but
        // falling back to the GeoJSON feature if needed.
        let originId = "";
        const originRow = window.decisionLogic && window.decisionLogic.schoolData
          ? window.decisionLogic.schoolData.find(r => r["Building Name"] === originName)
          : null;
        if (originRow) {
          originId = (
            originRow.UniqueID ||
            originRow["UniqueID"] ||
            originRow["Unique Id"] ||
            ""
          ).toString().trim();
        }
        if (!originId && originFeature && originFeature.properties) {
          originId = (
            originFeature.properties.UniqueID ||
            originFeature.properties["UniqueID"] ||
            originFeature.properties["Unique Id"] ||
            ""
          ).toString().trim();
        }

        // Remember current origin for distance calculations and click popups
        window.currentOriginName = originName;
        window.currentOriginId = originId;

        // Sync the map dropdown and persist selection so the UI reflects the zoom target.
        try {
          const mapSelect = document.getElementById('mapOriginSchoolSelect');
          const targetId = originId || originName;
          if (mapSelect && targetId) {
            const prevValue = mapSelect.value;
            setMapOriginSelect(targetId, originName);
            localStorage.setItem('mapSelectedOriginId', targetId);
            localStorage.setItem('mapSelectedOriginName', originName);
            if (mapSelect.value !== prevValue) {
              const evt = new Event('change', { bubbles: true });
              mapSelect.dispatchEvent(evt);
            }
          }
        } catch (e) {
          console.warn("⚠️ Unable to sync/persist mapOriginSchoolSelect from showOnMapFromFlowchart:", e);
        }

        // Switch to the map view so the user can actually see the highlight (only when explicitly requested)
        if (forceSwitch && typeof window.switchToMap === 'function') {
          window.switchToMap();
        }

        // Update the selected-school highlight with just this origin point
        const highlightSource = window.map.getSource('selected-school');
        if (highlightSource) {
          highlightSource.setData({
            type: 'FeatureCollection',
            features: [originFeature]
          });
        } else {
          console.warn("⚠️ selected-school source not found on map");
        }

        // Zoom to the origin school
        if (originFeature.geometry && originFeature.geometry.coordinates) {
          const [lng, lat] = originFeature.geometry.coordinates;
          window.map.easeTo({ center: [lng, lat], zoom: 13, duration: 800 });
        }
        
        // Also update nearby destination highlight circles if enabled
        if (originId && typeof window.updateNearbyDestinationsHighlight === 'function' && showNearbyHighlight) {
          window.updateNearbyDestinationsHighlight(originId);
        }
      };

      // Helper to compute and highlight nearby destinations on the map
      window.updateNearbyDestinationsHighlight = function(originUniqueId) {
        if (!showNearbyHighlight) {
          if (window.map && window.map.getLayer('nearby-destinations-layer')) {
            window.map.setLayoutProperty('nearby-destinations-layer', 'visibility', 'none');
            window.map.setFilter('nearby-destinations-layer', ['in', ['get', 'UniqueID'], ['literal', []]]);
          }
          return;
        }
        if (!originUniqueId || !window.map || !window.geojsonData || !window.distanceToWelcomingRowsByOrigin || !window.decisionLogic) {
          return;
        }
        
        const originKey = originUniqueId.toString().trim();
        const rowsByOrigin = window.distanceToWelcomingRowsByOrigin || {};
        const candidatesRaw = rowsByOrigin[originKey];
        if (!Array.isArray(candidatesRaw)) {
          if (window.map.getLayer('nearby-destinations-layer')) {
            window.map.setFilter('nearby-destinations-layer', ['in', ['get', 'UniqueID'], ['literal', []]]);
          }
          return;
        }
        
        const decisionRows = window.decisionLogic.schoolData || [];
        const thresholds = window.thresholds || window.decisionLogic.thresholds || {};
        const originRow = decisionRows.find(r => (r.UniqueID || r["UniqueID"] || r["Unique Id"]) === originKey);
        const levelStr = (originRow && (originRow["School Level"] || "") || "").toLowerCase();
        let distanceThreshold;
        if (levelStr.includes("elementary")) {
          distanceThreshold = thresholds.elementaryDistance;
        } else if (levelStr.includes("k-8")) {
          distanceThreshold = thresholds.k8Distance;
        } else if (levelStr.includes("middle")) {
          distanceThreshold = thresholds.middleDistance;
        } else if (levelStr.includes("high")) {
          distanceThreshold = thresholds.highDistance;
        } else if (levelStr.includes("6-12")) {
          distanceThreshold = thresholds.k12Distance;
        } else {
          distanceThreshold = thresholds.middleDistance || 5.0;
        }
        
        const destIds = new Set();
        candidatesRaw.forEach(r => {
          const distRaw =
            r["Network Distance (Miles)"] ||
            r["Network Distance"] ||
            r["NetworkDistanceMiles"];
          const dist = parseFloat((distRaw || "").toString().trim());
          if (!isFinite(dist) || (distanceThreshold && dist > distanceThreshold)) return;
          
          const destPrefix =
            r["Destination CDE Prefix"] ||
            r["Destination CDE Prefix "] ||
            r["DestinationCDEPrefix"];
          if (!destPrefix) return;
          destIds.add(destPrefix.toString().trim());
        });
        
        const idsArray = Array.from(destIds);
        if (window.map.getLayer('nearby-destinations-layer')) {
          window.map.setFilter('nearby-destinations-layer', [
            'in',
            ['get', 'UniqueID'],
            ['literal', idsArray]
          ]);
        }
      };

      // Populate excludedSchools select with all school names
      const excludedSchoolsSelect = document.getElementById('excludedSchools');
      if (excludedSchoolsSelect) {
        excludedSchoolsSelect.innerHTML = '';
        // Group schools by type
        const groups = {
          'Elementary and K-8 Schools': [],
          'High Schools': [],
          'Other Schools': []
        };
        geojsonData.features.forEach(f => {
          const name = f.properties['Building Name'];
          const type = f.properties['School Level'];
          if (type === 'High School') {
            groups['High Schools'].push(name);
          } else if (groups[type]) {
            groups[type].push(name);
          } else {
            groups['Other Schools'].push(name);
          }
        });
        // Helper to create optgroup with select-all
        function addGroup(label, schools) {
          if (!schools.length) return;
          const group = document.createElement('optgroup');
          group.label = label;
          // Add select-all option
          const selectAllOption = document.createElement('option');
          selectAllOption.value = '__select_all_' + label.replace(/\s/g, '_');
          selectAllOption.textContent = 'Select All ' + label;
          group.appendChild(selectAllOption);
          schools.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            if (label === 'Other Schools') {
              // Find the type for this school
              const feature = geojsonData.features.find(f => f.properties['Building Name'] === name);
              const type = feature && feature.properties['School Level'] ? feature.properties['School Level'] : 'Unknown';
              option.textContent = `${name} (${type})`;
            } else {
              option.textContent = name;
            }
            group.appendChild(option);
          });
          excludedSchoolsSelect.appendChild(group);
        }
        addGroup('Elementary and K-8 Schools', groups['Elementary and K-8 Schools']);
        addGroup('High Schools', groups['High Schools']);
        addGroup('Other Schools', groups['Other Schools']);
        // Choices.js setup
        if (window.Choices) {
          if (excludedSchoolsSelect.choicesInstance) {
            excludedSchoolsSelect.choicesInstance.destroy();
          }
          excludedSchoolsSelect.choicesInstance = new Choices(excludedSchoolsSelect, {
            removeItemButton: true,
            searchResultLimit: 20,
            placeholder: true,
            placeholderValue: 'Select schools to exclude',
            shouldSort: false
          });
          // Add event listener for select-all
          excludedSchoolsSelect.addEventListener('change', function() {
            const selected = Array.from(excludedSchoolsSelect.selectedOptions).map(opt => opt.value);
            // Handle select-all for each group
            ['Elementary and K-8 Schools', 'High Schools', 'Other Schools'].forEach(label => {
              const selectAllValue = '__select_all_' + label.replace(/\s/g, '_');
              if (selected.includes(selectAllValue)) {
                // Select all schools in this group
                const group = Array.from(excludedSchoolsSelect.querySelectorAll('optgroup[label="' + label + '"] option'))
                  .filter(opt => !opt.value.startsWith('__select_all_'));
                group.forEach(opt => opt.selected = true);
                // Deselect the select-all option
                excludedSchoolsSelect.querySelector('option[value="' + selectAllValue + '"]').selected = false;
                // Update Choices.js UI
                excludedSchoolsSelect.choicesInstance.setChoiceByValue(group.map(opt => opt.value));
              }
            });
          });
        }
      }

      // --- Blinking Halo for Sending School ---
      // Add the sending-school-halo layer on map load
      map.addSource('sending-school', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      map.addLayer({
        id: 'sending-school-halo',
        type: 'circle',
        source: 'sending-school',
        paint: {
          'circle-radius': 15,
          'circle-color': '#FFD700',
          'circle-opacity': 0.8,
          'circle-blur': 0.6
        }
      });
    })
    .catch(error => {
      console.error("❌ Failed to load initial map data:", error);
    });

  // --- MAP FILTERS INITIALIZATION ---
  const enrollmentSlider = document.getElementById('enrollmentRangeSlider');
  const seatsSlider = document.getElementById('seatsRangeSlider');
  const minEnrollDisplay = document.getElementById('minEnrollDisplay');
  const maxEnrollDisplay = document.getElementById('maxEnrollDisplay');
  const minSeatsDisplay = document.getElementById('minSeatsDisplay');
  const maxSeatsDisplay = document.getElementById('maxSeatsDisplay');
  const toggleYes = document.getElementById('toggleYes');
  const toggleNo = document.getElementById('toggleNo');
  const toggleNearbyHighlight = document.getElementById('toggleNearbyHighlight');
  const toggleUtilizationPie = document.getElementById('toggleUtilizationPie');
  const schoolTypeFilter = document.getElementById('schoolTypeFilter');
  const schoolTypeDropdownToggle = document.getElementById('schoolTypeDropdownToggle');
  const schoolTypeDropdownMenu = document.getElementById('schoolTypeDropdownMenu');
  const schoolTypeDropdownLabel = document.getElementById('schoolTypeDropdownLabel');
  const unselectAllSchoolsBtn = document.getElementById('unselectAllSchoolsBtn');
  let enrollmentRangeSynced = false;
  let utilSpritesAdded = false;
  // Disable restoring prior selections to avoid auto-selecting a school on load
  const savedOriginId = '';
  const savedOriginName = '';
  const defaultFilterPosition = { top: '20px', right: '20px' };
  let mapSelectSyncing = false;
  let showNearbyHighlight = false; // default off; enable via checkbox

  // Generate and register pie icon sprites for utilization buckets
  function ensureUtilizationPieSprites() {
    const mapRef = window.map;
    if (!mapRef) return;
    // Styles wipes all custom images. If the flag is set but the images are gone,
    // allow re-registering.
    try {
      const baseOk = mapRef.hasImage && mapRef.hasImage('util-pie-0.0');
      const sentinelKey = `util-pie-0.0-${getDecisionColorKey("Building Addition")}`;
      const sentinelOk = mapRef.hasImage && mapRef.hasImage(sentinelKey);
      if (utilSpritesAdded && baseOk && sentinelOk) {
        return;
      }
    } catch {}
    utilSpritesAdded = false;
    const buckets = [];
    for (let i = 0; i <= 12; i++) { // 0.0 to 1.2 in 0.1 increments
      buckets.push((i / 10).toFixed(1));
    }

    const colorHexes = Array.from(
      new Set(Object.values(DECISION_COLORS).concat(["#7f8c8d"]))
    );
    const colorKeys = colorHexes.map(h => h.replace("#", "").toLowerCase());

    const drawPie = (ctx, utilValue, fillColor) => {
      const size = 40;
      const cx = size / 2;
      const cy = size / 2;
      const r = size / 2 - 2;
      ctx.clearRect(0, 0, size, size);
      // Background ring
      ctx.fillStyle = '#e0e0e0';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fill();

      // Foreground arc proportional to utilization (0..1.2 mapped to 0..1 of circle)
      const util = Number.isFinite(utilValue) ? utilValue : 0;
      const frac = Math.max(0, Math.min(util / 1.2, 1)); // clamp to [0,1]
      const endAngle = -Math.PI / 2 + frac * Math.PI * 2; // start at top
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, -Math.PI / 2, endAngle, false);
      ctx.closePath();
      ctx.fill();

      // White border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    };

    buckets.forEach(bucket => {
      const util = parseFloat(bucket);
      // Legacy neutral name (kept for fallback)
      {
        const legacyName = `util-pie-${bucket}`;
        if (!(mapRef.hasImage && mapRef.hasImage(legacyName))) {
          const canvas = document.createElement('canvas');
          canvas.width = 40;
          canvas.height = 40;
          const ctx = canvas.getContext('2d');
          drawPie(ctx, util, '#7f8c8d');
          const imageData = ctx.getImageData(0, 0, 40, 40);
          if (mapRef.addImage) {
            mapRef.addImage(legacyName, imageData, { pixelRatio: 2 });
          }
        }
      }

      // Colored names by decision outcome (preferred)
      colorKeys.forEach(colorKey => {
        const name = `util-pie-${bucket}-${colorKey}`;
        if (mapRef.hasImage && mapRef.hasImage(name)) return;
        const canvas = document.createElement('canvas');
        canvas.width = 40;
        canvas.height = 40;
        const ctx = canvas.getContext('2d');
        drawPie(ctx, util, `#${colorKey}`);
        const imageData = ctx.getImageData(0, 0, 40, 40);
        if (mapRef.addImage) {
          mapRef.addImage(name, imageData, { pixelRatio: 2 });
        }
      });
    });
    utilSpritesAdded = true;
  }
  // Expose so style switching + updateLayer can re-register images after map.setStyle()
  window.ensureUtilizationPieSprites = ensureUtilizationPieSprites;

  noUiSlider.create(enrollmentSlider, {
    start: [0, 2000], connect: true, step: 10, range: { min: 0, max: 2000 }
  });
  noUiSlider.create(seatsSlider, {
    start: [-500, 500], connect: true, step: 1, range: { min: -500, max: 500 }
  });

  // Enforce compact slider styling via inline styles (prevents later overrides)
  function styleCompactSlider(el) {
    if (!el) return;
    const target = el.querySelector('.noUi-target');
    const connect = el.querySelector('.noUi-connect');
    const handles = el.querySelectorAll('.noUi-handle');
    const origins = el.querySelectorAll('.noUi-origin');
    if (target) {
      target.style.height = '2px';
      target.style.border = 'none';
      target.style.boxShadow = 'none';
      target.style.background = 'transparent';
      target.style.margin = '4px 8px 6px 0';
      target.style.width = 'calc(100% - 16px)';
    }
    if (connect) {
      connect.style.background = '#007cbf';
      connect.style.height = '2px';
    }
    origins.forEach(o => {
      o.style.height = '2px';
      o.style.background = 'transparent';
      o.style.border = 'none';
      o.style.boxShadow = 'none';
    });
    handles.forEach(h => {
      h.style.width = '12px';
      h.style.height = '12px';
      h.style.top = '-5px';
      h.style.borderRadius = '50%';
      h.style.border = '1px solid #0f172a';
      h.style.boxShadow = 'none';
      h.style.background = '#fff';
    });
  }

  styleCompactSlider(document.getElementById('enrollmentRangeSlider'));
  styleCompactSlider(document.getElementById('seatsRangeSlider'));

  // Skip auto-inject of utilization toggle; checkbox is placed in HTML near nearby highlight

  enrollmentSlider.noUiSlider.on('update', values => {
    minEnrollment = parseInt(values[0]);
    maxEnrollment = parseInt(values[1]);
    minEnrollDisplay.textContent = minEnrollment;
    maxEnrollDisplay.textContent = maxEnrollment;
    updateLayer();
  });

  // Sync enrollment slider range to Decision Data Export (decisionLogic.schoolData)
  const syncEnrollmentRangeFromDecisionData = (retry = 0) => {
    if (enrollmentRangeSynced) return;
    const data = window.decisionLogic && Array.isArray(window.decisionLogic.schoolData)
      ? window.decisionLogic.schoolData
      : null;
    if (!data || !data.length) {
      if (retry < 50) {
        setTimeout(() => syncEnrollmentRangeFromDecisionData(retry + 1), 200);
      }
      return;
    }

    const enrollValues = data
      .map(r => parseFloat(r.Enrollment || r["Enrollment"] || r[" Total Enrollment"] || r["Total Enrollment"] || 0))
      .filter(v => Number.isFinite(v) && v > 0);
    if (!enrollValues.length) {
      return;
    }

    let minVal = Math.min(...enrollValues);
    let maxVal = Math.max(...enrollValues);

    // If min/max collapse or are invalid, bail and keep defaults
    if (!Number.isFinite(minVal) || !Number.isFinite(maxVal) || minVal >= maxVal) {
      console.warn("⚠️ Enrollment sync skipped due to invalid range", { minVal, maxVal });
      return;
    }

    // Pad to nice step-aligned bounds
    const paddedMin = Math.max(0, Math.floor(minVal / 10) * 10);
    const paddedMax = Math.ceil(maxVal / 10) * 10;

    if (enrollmentSlider && enrollmentSlider.noUiSlider) {
      enrollmentSlider.noUiSlider.updateOptions({
        range: { min: paddedMin, max: paddedMax },
        start: [paddedMin, paddedMax]
      }, false);
      minEnrollment = paddedMin;
      maxEnrollment = paddedMax;
      if (minEnrollDisplay) minEnrollDisplay.textContent = paddedMin;
      if (maxEnrollDisplay) maxEnrollDisplay.textContent = paddedMax;
      enrollmentRangeSynced = true;
      updateLayer();
      console.log("📊 Enrollment slider synced to Decision Data Export range:", { minVal, maxVal, paddedMin, paddedMax });
    }
  };
  syncEnrollmentRangeFromDecisionData();

  seatsSlider.noUiSlider.on('update', values => {
    minSeats = parseInt(values[0]);
    maxSeats = parseInt(values[1]);
    minSeatsDisplay.textContent = minSeats;
    maxSeatsDisplay.textContent = maxSeats;
    updateLayer();
  });

  toggleYes.addEventListener('click', () => {
    showVariableRadius = true;
    toggleYes.classList.add('active');
    toggleNo.classList.remove('active');
    updateLayer();
  });

  toggleNo.addEventListener('click', () => {
    showVariableRadius = false;
    toggleNo.classList.add('active');
    toggleYes.classList.remove('active');
    updateLayer();
  });

  if (toggleNearbyHighlight) {
    // Default to unchecked/off
    toggleNearbyHighlight.checked = false;
    showNearbyHighlight = false;
    if (window.map && window.map.getLayer && window.map.getLayer('nearby-destinations-layer')) {
      window.map.setLayoutProperty('nearby-destinations-layer', 'visibility', 'none');
      window.map.setFilter('nearby-destinations-layer', ['in', ['get', 'UniqueID'], ['literal', []]]);
    }

    toggleNearbyHighlight.addEventListener('change', () => {
      showNearbyHighlight = toggleNearbyHighlight.checked;
      if (!window.map) return;
      const layerId = 'nearby-destinations-layer';
      if (window.map.getLayer(layerId)) {
        window.map.setLayoutProperty(layerId, 'visibility', showNearbyHighlight ? 'visible' : 'none');
        if (!showNearbyHighlight) {
          window.map.setFilter(layerId, ['in', ['get', 'UniqueID'], ['literal', []]]);
        } else if (window.currentOriginId) {
          window.updateNearbyDestinationsHighlight(window.currentOriginId);
        }
      }
    });
  }

  if (typeof window.ensureUtilizationPieSprites === 'function' && toggleUtilizationPie) {
    const applyUtilizationToggle = () => {
      showUtilizationPie = toggleUtilizationPie.checked;
      if (showUtilizationPie) {
        window.ensureUtilizationPieSprites();
      }
      if (window.map) {
        if (window.map.getLayer('schools-pie-layer')) {
          window.map.setLayoutProperty('schools-pie-layer', 'visibility', showUtilizationPie ? 'visible' : 'none');
        }
        if (window.map.getLayer('schools-layer')) {
          window.map.setLayoutProperty('schools-layer', 'visibility', showUtilizationPie ? 'none' : 'visible');
        }
      }
      updateLayer();
    };
    toggleUtilizationPie.addEventListener('change', applyUtilizationToggle);
    applyUtilizationToggle();
  }

  // Include non-eval schools toggle
  const toggleIncludeNonEval = document.getElementById('toggleIncludeNonEval');
  if (toggleIncludeNonEval) {
    const applyIncludeNonEval = () => {
      includeNonEvalSchools = toggleIncludeNonEval.checked;
      updateLayer();
    };
    // Default OFF on landing page (evaluation-only). Ignore any saved state.
    toggleIncludeNonEval.checked = false;
    includeNonEvalSchools = false;
    toggleIncludeNonEval.addEventListener('change', applyIncludeNonEval);
    applyIncludeNonEval();
  }

  // Include closed schools toggle
  const toggleIncludeClosed = document.getElementById('toggleIncludeClosed');
  if (toggleIncludeClosed) {
    const applyIncludeClosed = () => {
      includeClosedSchools = toggleIncludeClosed.checked;
      // Toggle red slash overlay visibility if present
      try {
        if (window.map && window.map.getLayer && window.map.getLayer('closed-stripe-layer')) {
          window.map.setLayoutProperty('closed-stripe-layer', 'visibility', includeClosedSchools ? 'visible' : 'none');
        }
      } catch {}
      updateLayer();
    };
    // Default OFF on landing page (evaluation-only). Ignore any saved state.
    toggleIncludeClosed.checked = false;
    includeClosedSchools = false;
    toggleIncludeClosed.addEventListener('change', applyIncludeClosed);
    applyIncludeClosed();
  }

  // --- Map filter panel positioning (static, no drag) ---
  const filterPanel = document.getElementById('filter-panel');
  const filterResizeHandle = document.getElementById('filter-resize-handle');
  if (filterPanel) {
    // If the Map Filters panel is embedded inside the School Selection panel,
    // it should behave like a normal in-flow <details> section (no absolute positioning/resize).
    const isFilterPanelEmbedded = !!filterPanel.closest('#map-school-select-panel');
    if (isFilterPanelEmbedded) {
      // Clear any previously applied inline positioning from older UI versions.
      filterPanel.style.position = '';
      filterPanel.style.top = '';
      filterPanel.style.right = '';
      filterPanel.style.left = '';
      filterPanel.style.width = '';
      filterPanel.style.height = '';
    } else {
    const enableFilterPanelDrag = false;
    if (enableFilterPanelDrag) {
      const summary = filterPanel.querySelector('summary');
      let dragging = false;
      let dragOffset = [0, 0];

      const startDrag = (e) => {
        if (!filterPanel.open) return;
        dragging = true;
        const rect = filterPanel.getBoundingClientRect();
        dragOffset = [e.clientX - rect.left, e.clientY - rect.top];
        document.body.style.userSelect = 'none';
      };

      const endDrag = () => {
        dragging = false;
        document.body.style.userSelect = '';
      };

      const onMove = (e) => {
        if (!dragging) return;
        filterPanel.style.left = `${e.clientX - dragOffset[0]}px`;
        filterPanel.style.top = `${e.clientY - dragOffset[1]}px`;
        filterPanel.style.right = 'auto';
      };

      if (summary) {
        summary.addEventListener('mousedown', startDrag);
        document.addEventListener('mouseup', endDrag);
        document.addEventListener('mousemove', onMove);
      }
    }

    const resetFilterPanelPosition = () => {
      filterPanel.style.position = 'absolute';
      filterPanel.style.top = defaultFilterPosition.top;
      filterPanel.style.right = defaultFilterPosition.right;
      filterPanel.style.left = 'auto';
      filterPanel.style.width = '';
      filterPanel.style.height = '';
    };

    resetFilterPanelPosition();
    filterPanel.addEventListener('toggle', resetFilterPanelPosition);

    // Custom bottom-left resize handle
    if (filterResizeHandle) {
      const minW = 200;
      const maxW = 420;
      const minH = 160;
      const maxH = 800;
      let startX = 0;
      let startY = 0;
      let startW = 0;
      let startH = 0;

      const onMouseMove = (e) => {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const newW = Math.min(maxW, Math.max(minW, startW - dx)); // left handle shrinks when dragging right
        const newH = Math.min(maxH, Math.max(minH, startH + dy));
        filterPanel.style.width = `${newW}px`;
        filterPanel.style.height = `${newH}px`;
      };

      const endResize = () => {
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', endResize);
      };

      filterResizeHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const rect = filterPanel.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startW = rect.width;
        startH = rect.height;
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', endResize);
      });
    }
    }
  }

  // --- School type dropdown logic ---
  function syncSchoolTypeFromDropdown() {
    if (!schoolTypeDropdownMenu) return;
    const checked = Array.from(schoolTypeDropdownMenu.querySelectorAll('input[type="checkbox"]:checked'))
      .map(cb => cb.value);
    selectedTypes = checked;
    // Sync hidden select for any legacy uses
    if (schoolTypeFilter) {
      Array.from(schoolTypeFilter.options).forEach(opt => {
        opt.selected = checked.includes(opt.value);
      });
    }
    // Update label
    if (schoolTypeDropdownLabel) {
      schoolTypeDropdownLabel.textContent =
        checked.length === 0 ? 'None selected' :
        checked.length === 5 ? 'All types' :
        `${checked.length} selected`;
    }
    updateLayer();
  }

  if (schoolTypeDropdownMenu) {
    schoolTypeDropdownMenu.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', syncSchoolTypeFromDropdown);
    });
  }

  if (schoolTypeDropdownToggle && schoolTypeDropdownMenu) {
    schoolTypeDropdownToggle.addEventListener('click', () => {
      schoolTypeDropdownMenu.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!schoolTypeDropdownMenu.contains(e.target) && !schoolTypeDropdownToggle.contains(e.target)) {
        schoolTypeDropdownMenu.classList.remove('open');
      }
    });
  }

  if (unselectAllSchoolsBtn) {
    unselectAllSchoolsBtn.addEventListener('click', () => {
      if (schoolTypeDropdownMenu) {
        schoolTypeDropdownMenu.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
      }
      syncSchoolTypeFromDropdown();
    });
  }

  // Initialize selection label
  syncSchoolTypeFromDropdown();

  // --- LEGEND AND TOGGLE LOGIC ---
  // Toggle buttons removed - always showing decisions view
  
  // Always show decisions view (default behavior)
  if (map.getLayer('schools-layer')) {
    map.setPaintProperty(
      'schools-layer',
      'circle-color',
      ['match', ['get', 'Decision Type'],
        "Building Addition", '#2E8B57',
        "Policy Solution for Overcrowding", '#66BB6A',
        "Building Addition with Capital Investment", '#1B5E20',
        "Building Replacement", '#4B830D',
        "Targeted Capital Investment", '#FFA726',
        "Standard Maintenance", '#FFD54F',
        "Major Capital Investment", '#FB8C00',
        "Welcoming School", '#C62828',
        "Welcoming School with Capital Investment", '#E53935',
        "Closure (Goes to Welcoming School)", '#B71C1C',
        "Welcoming School with Building Replacement", '#8B0000',
        "Other / Unknown", '#2F4F4F',
        '#7f8c8d']
    );
  }

  if (map.getLayer('assigned-schools-layer')) {
    map.setLayoutProperty(
      'assigned-schools-layer',
      'visibility',
      'none'
    );
  }

  updateLegend();
  // Initialize decisions view if available
  if (typeof window.showDecisionsView === 'function') {
    showDecisionsView();
  } else {
    console.warn("⚠️ showDecisionsView not found; skipping initial decisions view toggle");
  }

  // --- SIDEBAR AND MAP RESIZE LOGIC ---
  // --- INITIAL MAP RESIZE ON LOAD ---
  // Map container will automatically take available space with flex: 1
  // Just ensure map resizes after initial load
  setTimeout(() => {
    if (map && map.resize) {
      map.resize();
    }
  }, 100);

  // Removed hardcoded New Haven center - map will be set by fitBounds

  // --- IFRAME COMMUNICATION ---
  // The iframe has been removed. All communication is now direct function calls.
  // The DecisionLogic.js script, once loaded, will expose `window.decisionLogic`.
  
  // --- MAP/FLOWCHART TOGGLE ---
  // Define switch functions globally so they can be called from inline handlers
  window.switchToFlowchart = function() {
    const flowchartContainer = document.getElementById('main-flowchart-container');
    const mapContainer = document.getElementById('map-container');
    const toggleViewContainer = document.querySelector('#map-container .toggle-buttons');
    
    if (flowchartContainer) flowchartContainer.style.display = 'flex';
    if (mapContainer) mapContainer.style.display = 'none';
    
    // Update toggle button states
    const toggleMapFlowchartMap = document.getElementById('toggleMapFlowchartMap');
    const toggleMapFlowchartFlowchart = document.getElementById('toggleMapFlowchartFlowchart');
    const toggleMapFlowchartMap2 = document.getElementById('toggleMapFlowchartMap2');
    const toggleMapFlowchartFlowchart2 = document.getElementById('toggleMapFlowchartFlowchart2');
    
    if (toggleMapFlowchartMap) toggleMapFlowchartMap.classList.remove('active');
    if (toggleMapFlowchartFlowchart) toggleMapFlowchartFlowchart.classList.add('active');
    if (toggleMapFlowchartMap2) toggleMapFlowchartMap2.classList.remove('active');
    if (toggleMapFlowchartFlowchart2) toggleMapFlowchartFlowchart2.classList.add('active');
    const menuShowMap = document.getElementById('menuShowMap');
    const menuShowFlowchart = document.getElementById('menuShowFlowchart');
    if (menuShowMap && menuShowFlowchart) {
      menuShowMap.classList.remove('active');
      menuShowFlowchart.classList.add('active');
    }
    
    // Hide the decisions/assignments toggle when in flowchart view
    if (toggleViewContainer) toggleViewContainer.style.display = 'none';
    
    if (!window.flowchartInitialized) {
      initializeFlowchart();
    }
  };

  window.switchToMap = function() {
    const flowchartContainer = document.getElementById('main-flowchart-container');
    const mapContainer = document.getElementById('map-container');
    const toggleViewContainer = document.querySelector('#map-container .toggle-buttons');
    
    if (flowchartContainer) flowchartContainer.style.display = 'none';
    if (mapContainer) mapContainer.style.display = 'block';
    
    // Update toggle button states
    const toggleMapFlowchartMap = document.getElementById('toggleMapFlowchartMap');
    const toggleMapFlowchartFlowchart = document.getElementById('toggleMapFlowchartFlowchart');
    const toggleMapFlowchartMap2 = document.getElementById('toggleMapFlowchartMap2');
    const toggleMapFlowchartFlowchart2 = document.getElementById('toggleMapFlowchartFlowchart2');
    
    if (toggleMapFlowchartMap) toggleMapFlowchartMap.classList.add('active');
    if (toggleMapFlowchartFlowchart) toggleMapFlowchartFlowchart.classList.remove('active');
    if (toggleMapFlowchartMap2) toggleMapFlowchartMap2.classList.add('active');
    if (toggleMapFlowchartFlowchart2) toggleMapFlowchartFlowchart2.classList.remove('active');
    const menuShowMap = document.getElementById('menuShowMap');
    const menuShowFlowchart = document.getElementById('menuShowFlowchart');
    if (menuShowMap && menuShowFlowchart) {
      menuShowMap.classList.add('active');
      menuShowFlowchart.classList.remove('active');
    }
    
    // Show the decisions/assignments toggle when in map view
    if (toggleViewContainer) toggleViewContainer.style.display = 'flex';
    
    setTimeout(() => {
      if (map && map.resize) map.resize();
    }, 100);
  };
  
  function setupFlowchartToggleButtons() {
    const toggleMapFlowchartMap = document.getElementById('toggleMapFlowchartMap');
    const toggleMapFlowchartFlowchart = document.getElementById('toggleMapFlowchartFlowchart');
    const toggleMapFlowchartMap2 = document.getElementById('toggleMapFlowchartMap2');
    const toggleMapFlowchartFlowchart2 = document.getElementById('toggleMapFlowchartFlowchart2');

    if (!toggleMapFlowchartMap || !toggleMapFlowchartFlowchart || !toggleMapFlowchartMap2 || !toggleMapFlowchartFlowchart2) {
      console.warn("⚠️ Flowchart toggle buttons not found, will retry...");
      setTimeout(setupFlowchartToggleButtons, 100);
      return;
    }

    // Add event listeners for all toggle buttons
    toggleMapFlowchartMap.addEventListener('click', window.switchToMap);
    toggleMapFlowchartFlowchart.addEventListener('click', window.switchToFlowchart);
    toggleMapFlowchartMap2.addEventListener('click', window.switchToMap);
    toggleMapFlowchartFlowchart2.addEventListener('click', window.switchToFlowchart);

    console.log("✅ Flowchart toggle buttons set up");
  }

  // Set up flowchart toggle buttons
  setupFlowchartToggleButtons();

  // Add event listener for "Fit to All Schools" button
  function setupFitToSchoolsButton() {
    const fitToSchoolsBtn = document.getElementById('fitToSchoolsBtn');
    if (fitToSchoolsBtn) {
      // Remove any existing inline handlers and add our own
      fitToSchoolsBtn.onclick = null; // Clear any inline onclick
      
      fitToSchoolsBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log("🔘 Fit to All Schools button clicked");
        
        if (typeof window.fitMapToAllSchools === 'function') {
          try {
            window.fitMapToAllSchools();
          } catch (error) {
            console.error("❌ Error in fitMapToAllSchools:", error);
            alert("Error fitting map to schools: " + error.message);
          }
        } else {
          console.warn("⚠️ fitMapToAllSchools function not available yet");
          alert("Map is still loading. Please wait a moment and try again.");
        }
      }, true); // Use capture phase to ensure it fires
      
      console.log("✅ Fit to All Schools button event listener added");
      return true;
    } else {
      console.warn("⚠️ fitToSchoolsBtn not found");
      return false;
    }
  }
  
  // Try multiple times to set up the button
  if (!setupFitToSchoolsButton()) {
    // If button not found, try again after DOMContentLoaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        setTimeout(setupFitToSchoolsButton, 100);
      });
    } else {
      setTimeout(setupFitToSchoolsButton, 100);
    }
  }
  
  // Also try after map loads (in case button is added dynamically)
  if (window.map) {
    setTimeout(setupFitToSchoolsButton, 500);
  }

  function initializeFlowchart() {
    console.log("🎯 Initializing flowchart...");
    setupFlowchart();
  }

  function setupFlowchart() {
    console.log("🎯 Setting up flowchart...");
    
    const svg = d3.select("#main-flowchart-svg");
    if (svg.empty()) {
      console.error("❌ Could not find flowchart SVG element");
      return;
    }

    svg.selectAll("*").remove();
    svg.attr("viewBox", "-50 -50 1000 1400").attr("preserveAspectRatio", "xMidYMid meet");

    if (typeof window.initializeFlowchartFromScript === 'function') {
      window.initializeFlowchartFromScript(svg);
    } else {
      console.error("❌ initializeFlowchartFromScript function not found!");
    }

    const flowchartSchoolSelect = document.getElementById('mainFlowchartSchoolSelect');
    const mapOriginSelect = document.getElementById('mapOriginSchoolSelect');
    if (geojsonData && geojsonData.features && flowchartSchoolSelect) {
      flowchartSchoolSelect.innerHTML = '<option value="">-- Select School --</option>';
      
      // Use filtered school data from DecisionLogic instead of geojsonData
      // This ensures we only include schools where Include_Flow_Chart is not "No"
      if (window.decisionLogic && window.decisionLogic.schoolData) {
        console.log("📊 Using filtered school data for flowchart dropdown");
        const sortedSchools = window.decisionLogic.schoolData
          .map(row => row["Building Name"])
          .filter(name => name) // Remove any null/undefined names
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        
        sortedSchools.forEach(schoolName => {
          const option = document.createElement('option');
          option.value = schoolName;
          option.textContent = schoolName;
          flowchartSchoolSelect.appendChild(option);
        });
      } else {
        console.log("⚠️ Using geojsonData for flowchart dropdown (filtered data not available yet)");
        // Fallback to geojsonData if filtered data isn't available yet
        const sortedSchools = geojsonData.features
          .map(feature => feature.properties['Building Name'])
          .filter(name => name) // Remove any null/undefined names
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        
        sortedSchools.forEach(schoolName => {
          const option = document.createElement('option');
          option.value = schoolName;
          option.textContent = schoolName;
          flowchartSchoolSelect.appendChild(option);
        });
      }

      // Helper to sync the map dropdown from a school name
      const syncMapDropdownFromName = (schoolName) => {
        if (!schoolName || !mapOriginSelect) return;
        const norm = (s) => (s || "").toString().trim().toLowerCase();
        let originId = "";
        if (window.decisionLogic && Array.isArray(window.decisionLogic.schoolData)) {
          const row = window.decisionLogic.schoolData.find(r => norm(r["Building Name"]) === norm(schoolName));
          if (row) {
            originId = (
              row.UniqueID ||
              row["UniqueID"] ||
              row["Unique Id"] ||
              ""
            ).toString().trim();
          }
        }

        setMapOriginSelect(originId || schoolName, schoolName);
        if (originId || schoolName) {
          updateNearbySchoolsPanel(originId || schoolName, schoolName);
        } else {
          updateNearbySchoolsPanel('', '');
        }
      };

      // If flowchart has no selection yet, default to first school and sync map
      if (!flowchartSchoolSelect.value && flowchartSchoolSelect.options.length > 1) {
        const firstName = flowchartSchoolSelect.options[1].value;
        flowchartSchoolSelect.value = firstName;
        Array.from(flowchartSchoolSelect.options || []).forEach(opt => {
          opt.selected = opt.value === firstName;
        });
        window.currentSelectedSchoolName = firstName;
        syncMapDropdownFromName(firstName);
      } else if (flowchartSchoolSelect.value) {
        // If there is an existing value, sync map to it
        syncMapDropdownFromName(flowchartSchoolSelect.value);
      }

      flowchartSchoolSelect.addEventListener('change', (e) => {
        const selectedSchool = e.target.value;
        console.log("🎯 School selection changed to:", selectedSchool);
        console.log("🎯 updateFlowForSchool function available:", typeof window.updateFlowForSchool === 'function');
        console.log("🎯 Current thresholds:", window.thresholds);

        // Track the current selection globally so slider updates and other
        // components can use it even if the user switches back to the map.
        if (selectedSchool) {
          window.currentSelectedSchoolName = selectedSchool;
        } else {
          window.currentSelectedSchoolName = '';
          window.currentOriginId = '';
          window.currentOriginName = '';
          clearSelectedSchoolHighlight();
        }

        // Keep the map-origin dropdown in sync when user selects from the flowchart dropdown
        try {
          syncMapDropdownFromName(selectedSchool);
        } catch (syncErr) {
          console.warn("⚠️ Unable to sync mapOriginSchoolSelect with mainFlowchartSchoolSelect:", syncErr);
        }

        if (typeof window.updateFlowForSchool === 'function') {
          window.updateFlowForSchool(selectedSchool, window.thresholds || {});
        } else {
          console.warn("⚠️ updateFlowForSchool function not available");
        }

        // Treat the newly selected school as the current origin for map logic
        if (window.decisionLogic && Array.isArray(window.decisionLogic.schoolData) && selectedSchool) {
          const originRow = window.decisionLogic.schoolData.find(r => r["Building Name"] === selectedSchool);
          const originId = originRow
            ? (originRow.UniqueID || originRow["UniqueID"] || originRow["Unique Id"] || "").toString().trim()
            : "";
          if (originId) {
            window.currentOriginName = selectedSchool;
            window.currentOriginId = originId;
          }
        }

        // Automatically update the map to show the origin + nearby schools
        if (selectedSchool && typeof window.showOnMapFromFlowchart === 'function') {
          window.showOnMapFromFlowchart(selectedSchool);
        }
      });

      // If a school was selected from the map before the flowchart was
      // initialized, apply that pending selection now that the options and
      // SVG nodes exist.
      if (window.pendingFlowchartSchoolName) {
        const pendingName = window.pendingFlowchartSchoolName;
        const pendingOriginId = window.pendingFlowchartOriginId || "";

        // Ensure an option exists for the pending school name
        let hasPendingOption = Array.from(flowchartSchoolSelect.options || []).some(
          opt => opt.value === pendingName
        );
        if (!hasPendingOption) {
          const opt = document.createElement('option');
          opt.value = pendingName;
          opt.textContent = pendingName;
          flowchartSchoolSelect.appendChild(opt);
          hasPendingOption = true;
          console.log("➕ Added pending option to mainFlowchartSchoolSelect for", pendingName);
        }

        if (hasPendingOption) {
          console.log("🎯 Applying pending flowchart selection from map click:", pendingName);
          flowchartSchoolSelect.value = pendingName;
          const evt = new Event('change', { bubbles: true });
          flowchartSchoolSelect.dispatchEvent(evt);
        } else {
          console.warn("⚠️ Pending flowchart school name has no option:", pendingName);
        }

        // Also try to sync the map-origin dropdown if we have an origin ID
        setMapOriginSelect(pendingOriginId || pendingName, pendingName);

        // Clear pending state either way so we don't re-apply it.
        window.pendingFlowchartSchoolName = null;
        window.pendingFlowchartOriginId = null;
      }
    }

    window.flowchartInitialized = true;
  }

  // --- Render blank/zeroed graphs in model output section on first load ---
  function renderBlankModelOutputCharts() {
    // Enrollment/Utilization Impact: blank chart
    if (window.decisionLogic && typeof window.decisionLogic.handleAssignmentResults === 'function') {
      const blankResults = {
        summaryHTML: '',
        enrollmentChartData: {
          labels: [],
          datasets: [
            { label: 'Current Enrollment', data: [], backgroundColor: '#0033A0', barThickness: 12 },
            { label: 'New Assignments', data: [], backgroundColor: '#FFC72C', barThickness: 12 },
            { label: 'Capacity', data: [], type: 'line', borderColor: '#FF530D', borderWidth: 3, pointStyle: 'line', pointRadius: 7, pointHoverRadius: 7, rotation: 90, fill: false, showLine: false, yAxisID: 'y' }
          ]
        },
        distanceChartData: {
          labels: ['Current School', 'Assigned School'],
          datasets: [{ label: 'Avg Distance (mi)', data: [0, 0], backgroundColor: ['#0033A0', '#ffcc00'] }]
        },
        assignments: {},
        selectedSchoolName: ''
      };
      window.decisionLogic.handleAssignmentResults(blankResults);
    }
    // Show placeholders
    const enrollPlaceholder = document.getElementById('enrollmentChartPlaceholder');
    if (enrollPlaceholder) enrollPlaceholder.style.display = '';
    const distancePlaceholder = document.getElementById('distanceChartPlaceholder');
    if (distancePlaceholder) distancePlaceholder.style.display = '';
  }

  // Call this after DOM is ready and decisionLogic is loaded
  if (window.decisionLogic && typeof window.decisionLogic.handleAssignmentResults === 'function') {
    renderBlankModelOutputCharts();
  } else {
    // If decisionLogic isn't ready yet, wait for it
    const interval = setInterval(() => {
      if (window.decisionLogic && typeof window.decisionLogic.handleAssignmentResults === 'function') {
        renderBlankModelOutputCharts();
        clearInterval(interval);
      }
    }, 100);
  }
});

// ✅ Inject decisions into geojson features
function normalizeName(name) {
  return name?.toLowerCase().replace(/\s+/g, ' ').trim();
}

function injectDecisionsIntoGeoJSON(geojson, decisions, options = {}) {
  console.log("🔄 injectDecisionsIntoGeoJSON called with", decisions.length, "decision records");
  
  // Log sample decision data to see if flow is present
  const sampleDecisions = decisions.slice(0, 3).map(row => ({
    name: row["Building Name"],
    decision: row["decision"],
    flow: row["flow"]
  }));
  console.log("📋 Sample decision data:", sampleDecisions);
  
  const decisionMap = new Map(decisions.map(row => [normalizeName(row["Building Name"]), row["decision"] || "Unknown"]));
  const scorecardMap = new Map(decisions.map(row => [normalizeName(row["Building Name"]), parseFloat(row["Scorecard"] || "0")]));
  const buildingQualityMap = new Map(decisions.map(row => [normalizeName(row["Building Name"]), parseFloat(row["BuildingTreshhold"] || "0")]));
  // Add a map for Utilization
  const utilizationMap = new Map(decisions.map(row => [normalizeName(row["Building Name"]), parseFloat(row["Utilization"] || "0")]));
  const capacityMap = new Map(decisions.map(row => [normalizeName(row["Building Name"]), parseFloat(row["Capacity"] || "0")]));
  const availableSeatsMap = new Map(decisions.map(row => [normalizeName(row["Building Name"]), parseFloat(row["Available Seats"] || "0")]));
  const enrollmentMap = new Map(decisions.map(row => [normalizeName(row["Building Name"]), parseFloat(row["Enrollment"] || "0")]));
  const schoolLevelMap = new Map(decisions.map(row => [normalizeName(row["Building Name"]), row["School Level"] || "Unknown"]));
  const flowMap = new Map(decisions.map(row => [normalizeName(row["Building Name"]), row["flow"] || 0]));
  const uniqueIdMap = new Map(decisions.map(row => [normalizeName(row["Building Name"]), (row.UniqueID || row["UniqueID"] || row["Unique Id"] || "").toString().trim()]));
  // IMPORTANT:
  // - `window.decisionLogic.schoolData` (used by sliders) often does NOT include
  //   Include_Flow_Chart or Status columns.
  // - If we default missing values to "no"/"" we accidentally overwrite the base
  //   inclusion/closed flags, which then breaks the map filters and toggles.
  // So: store `null` when the column is missing/empty so downstream `??`/`||`
  // fallbacks can use the full decision export or existing feature values.
  const includeFlowMap = new Map(
    decisions.map(row => {
      const rawInclude = row["Include_Flow_Chart"];
      const cleaned = (rawInclude ?? "").toString().trim();
      if (!cleaned) return [normalizeName(row["Building Name"]), null];
      return [normalizeName(row["Building Name"]), cleaned.toLowerCase()];
    })
  );
  const statusMap = new Map(
    decisions.map(row => {
      const rawStatus = row["Status"];
      const cleaned = (rawStatus ?? "").toString().trim();
      if (!cleaned) return [normalizeName(row["Building Name"]), null];
      return [normalizeName(row["Building Name"]), cleaned];
    })
  );
  const distanceWelcomingMap = new Map(
    decisions.map(row => [
      normalizeName(row["Building Name"]),
      parseFloat(row["DistanceUnderutilizedschools"] || "0")
    ])
  );

  // Helper to bucket utilization for pie images (0.0 to 1.2+)
  function utilizationBucket(util) {
    const clamped = Math.max(0, Math.min(util, 1.2));
    const step = 0.1;
    const bucket = Math.round(clamped / step) * step; // e.g., 0.0, 0.1, 0.2...
    return bucket.toFixed(1); // string like "0.0"
  }

  geojson.features.forEach(f => {
    const name = normalizeName(f.properties["Building Name"]);
    const uidExistingRaw = (f.properties["UniqueID"] || "").toString().trim();
    const uidExistingNorm = normalizeId(uidExistingRaw);
    const decisionUidRaw = (uniqueIdMap.get(name) || "").toString().trim();
    const mapRow =
      mapExportLookupMaps.byName.get(name) ||
      (uidExistingNorm ? mapExportLookupMaps.byCode.get(uidExistingNorm) : null);
    const mapUidRaw = (mapRow?.["Building Code"] || "").toString().trim();

    // Prefer decision UID, else existing, else map UID (preserve original casing)
    const resolvedUidRaw = decisionUidRaw || uidExistingRaw || mapUidRaw;
    if (resolvedUidRaw) {
      f.properties["UniqueID"] = resolvedUidRaw;
    }

    // Backfill coordinates from Map_Export if missing
    const needsCoords =
      !f.geometry ||
      !Array.isArray(f.geometry.coordinates) ||
      f.geometry.coordinates.some(c => c === null || Number.isNaN(c));
    const lat = parseFloat(mapRow?.["Latitude"]);
    const lon = parseFloat(mapRow?.["Longitude"]);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);
    if (needsCoords && hasCoords) {
      f.geometry = { type: "Point", coordinates: [lon, lat] };
      f.properties["Latitude"] = lat;
      f.properties["Longitude"] = lon;
    }

    f.properties["Decision Type"] = decisionMap.get(name) || "Unknown";
    f.properties["Scorecard"] = scorecardMap.get(name) || 0;
    f.properties["Building Quality"] = buildingQualityMap.get(name) || 0;
    f.properties["Utilization"] = utilizationMap.get(name) || 0;
    f.properties["Capacity"] = capacityMap.get(name) || 0;
    f.properties["Available Seats"] = availableSeatsMap.get(name) || 0;
    const enrollmentVal = enrollmentMap.get(name);
    if (Number.isFinite(enrollmentVal)) {
      f.properties["Enrollment"] = enrollmentVal;
    }
    f.properties["School Level"] = schoolLevelMap.get(name) || "Unknown";
    f.properties["flow"] = flowMap.get(name) || f.properties["flow"] || 0;
    f.properties["DistanceToWelcoming"] = distanceWelcomingMap.get(name) || null;

    // Inclusion + status
    // During slider updates we only want to recompute decisions/flows, not which schools
    // are considered closed or non-eval. Those flags come from the full export + Map_Export
    // merge and must remain stable unless the user toggles filters.
    const updateInclusionStatus = options.updateInclusionStatus !== false;
    // Preserve original include flag; only override when we have real data.
    if (updateInclusionStatus) {
      if (f.properties._includeFlowChartBase === undefined) {
        f.properties._includeFlowChartBase = (f.properties["includeFlowChart"] || "").toString().trim().toLowerCase();
      }

      const includeVal =
        includeFlowMap.get(name) ??
        (decisionAllByName.get(name)?.Include_Flow_Chart ?? decisionAllByName.get(name)?.["Include_Flow_Chart"]) ??
        (decisionAllById.get(normalizeId(f.properties["UniqueID"]))?.Include_Flow_Chart ?? decisionAllById.get(normalizeId(f.properties["UniqueID"]))?.["Include_Flow_Chart"]);

      const yesVals = new Set(["yes", "y", "true", "1"]);
      const noVals = new Set(["no", "n", "false", "0"]);
      const candidate = (includeVal ?? "").toString().trim().toLowerCase();
      const hasExplicitInclude = !!candidate;
      if (hasExplicitInclude) {
        let includeNorm = "no"; // default exclude unless explicitly yes
        if (yesVals.has(candidate)) includeNorm = "yes";
        else if (noVals.has(candidate)) includeNorm = "no";
        else includeNorm = "no";
        f.properties["includeFlowChart"] = includeNorm;
        f.properties["isNonEval"] = includeNorm !== "yes";
      } else {
        // If no include flag is available, do not overwrite.
        const existingInclude = (f.properties["includeFlowChart"] ?? f.properties._includeFlowChartBase ?? "").toString().trim().toLowerCase();
        if (existingInclude) {
          f.properties["includeFlowChart"] = existingInclude;
          f.properties["isNonEval"] = existingInclude !== "yes";
        }
      }

      const statusValDecision =
        statusMap.get(name) ||
        (decisionAllByName.get(name)?.Status ?? decisionAllByName.get(name)?.["Status"]) ||
        (decisionAllById.get(normalizeId(f.properties["UniqueID"]))?.Status ?? decisionAllById.get(normalizeId(f.properties["UniqueID"]))?.["Status"]) ||
        "";
      const statusExisting = f.properties["status"] || "";
      const statusVal = statusValDecision || statusExisting || "";
      const statusNorm = statusVal.toString().trim().toLowerCase();
      if (statusVal) {
        f.properties["status"] = statusVal;
      }
      f.properties["isClosed"] =
        f.properties.isClosed === true ||
        f.properties["isClosed"] === true ||
        statusNorm === "no" ||
        statusNorm.includes("closed");
    }

    const utilVal = utilizationMap.get(name);
    const utilNum = Number.isFinite(utilVal) ? utilVal : 0;
    f.properties["utilPieBucket"] = utilizationBucket(utilNum);
  });
  
  // Log sample GeoJSON features to verify flow was injected
  const sampleFeatures = geojson.features.slice(0, 3).map(f => ({
    name: f.properties["Building Name"],
    decision: f.properties["Decision Type"],
    flow: f.properties["flow"]
  }));
  console.log("🗺️ Sample GeoJSON features after injection:", sampleFeatures);
}

function initializeDropdownFilters(schoolData) {
  const allSchoolData = schoolData;
  const decisionFilter = document.getElementById("decisionFilter");
  const schoolSelect = document.getElementById("schoolSelect");

  if (!decisionFilter || !schoolSelect) {
    console.warn("⚠️ Missing #decisionFilter or #schoolSelect element.");
    return;
  }

  const uniqueDecisions = [...new Set(
    allSchoolData.map(row => row.decision || "Unknown")
  )].sort();

  decisionFilter.innerHTML = '<option value="">-- All Decisions --</option>';
  uniqueDecisions.forEach(decision => {
    const option = document.createElement("option");
    option.value = decision;
    option.textContent = decision;
    decisionFilter.appendChild(option);
  });

  function updateSchoolSelect(filterDecision = "") {
    schoolSelect.innerHTML = '<option value="">-- Select --</option>';
    
    // Filter schools based on decision if specified
    const filteredSchools = allSchoolData.filter(row => {
      return !filterDecision || row.decision === filterDecision;
    });
    
    // Sort schools alphabetically by name
    const sortedSchools = filteredSchools
      .map(row => row["Building Name"])
      .filter(name => name) // Remove any null/undefined names
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    
    sortedSchools.forEach(schoolName => {
      const option = document.createElement("option");
      option.value = schoolName;
      option.textContent = schoolName;
      schoolSelect.appendChild(option);
    });
  }

  updateSchoolSelect(); // Populate with all schools initially

  decisionFilter.addEventListener("change", () => {
    const selectedDecision = decisionFilter.value;
    updateSchoolSelect(selectedDecision);
    console.log("🎯 Updated school list for decision:", selectedDecision);
  });

  // Expose globally so it can be called after slider changes
  window.updateSchoolSelect = updateSchoolSelect;
  
  // Function to update flowchart dropdown with filtered data
  window.updateFlowchartDropdown = function() {
    const flowchartSchoolSelect = document.getElementById('mainFlowchartSchoolSelect');
    if (!flowchartSchoolSelect || !window.decisionLogic || !window.decisionLogic.schoolData) {
      return;
    }
    
    console.log("🔄 Updating flowchart dropdown with filtered data");
    flowchartSchoolSelect.innerHTML = '<option value="">-- Select School --</option>';
    
    const sortedSchools = window.decisionLogic.schoolData
      .map(row => row["Building Name"])
      .filter(name => name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    
    sortedSchools.forEach(schoolName => {
      const option = document.createElement('option');
      option.value = schoolName;
      option.textContent = schoolName;
      flowchartSchoolSelect.appendChild(option);
    });
    
    console.log(`📊 Flowchart dropdown updated: ${sortedSchools.length} schools included`);
  };
}

// ✅ Move slider setup inside DOMContentLoaded to ensure elements are loaded
document.addEventListener('DOMContentLoaded', function() {
  // ✅ Set up slider event listeners
  const distanceWeightSlider = document.getElementById('distanceWeightSlider');
  const distanceWeightLabel = document.getElementById('distanceWeightLabel');
  const enrollmentWeightSlider = document.getElementById('enrollmentWeightSlider');
  const enrollmentWeightLabel = document.getElementById('enrollmentWeightLabel');
  const buildingWeightSlider = document.getElementById('buildingWeightSlider');
  const buildingWeightLabel = document.getElementById('buildingWeightLabel');
  const scorecardWeightSlider = document.getElementById('scorecardWeightSlider');
  const scorecardWeightLabel = document.getElementById('scorecardWeightLabel');

  if (distanceWeightSlider && distanceWeightLabel) {
    distanceWeightSlider.addEventListener('input', () => {
      distanceWeightLabel.textContent = distanceWeightSlider.value;
    });
  }
  if (enrollmentWeightSlider && enrollmentWeightLabel) {
    enrollmentWeightSlider.addEventListener('input', () => {
      enrollmentWeightLabel.textContent = enrollmentWeightSlider.value;
    });
  }
  if (buildingWeightSlider && buildingWeightLabel) {
    buildingWeightSlider.addEventListener('input', () => {
      buildingWeightLabel.textContent = buildingWeightSlider.value;
    });
  }
  if (scorecardWeightSlider && scorecardWeightLabel) {
    scorecardWeightSlider.addEventListener('input', () => {
      scorecardWeightLabel.textContent = scorecardWeightSlider.value;
    });
  }

  const select = document.getElementById('schoolSelect');
  const isoDistanceSelect = document.getElementById('isoDistance');
  const manualBtn = document.getElementById('manualBtn');
  const modelBtn = document.getElementById('modelBtn');
  const manualView = document.getElementById('manualView');
  const modelView = document.getElementById('modelView');

  let selectedFeatureForIsochrone = null;

  // Wire up collapsible legend for Decision Types on the map
  (function setupCollapsibleLegend() {
    const legend = document.getElementById('map-legend');
    const toggle = document.getElementById('legend-toggle');
    if (!legend || !toggle) {
      return;
    }

    // Ensure initial state chevron matches the legend's collapsed/expanded class.
    const chevron = toggle.querySelector('span.chevron');
    if (chevron) {
      // Chevron glyph stays constant; CSS handles rotation based on collapsed/expanded state.
      chevron.textContent = '▸';
    }

    toggle.addEventListener('click', () => {
      legend.classList.toggle('legend-collapsed');
    });
  })();

  function triggerIsochroneUpdate() {
      if(selectedFeatureForIsochrone) {
          const [lng, lat] = selectedFeatureForIsochrone.geometry.coordinates;
          const distance = isoDistanceSelect.value;
          drawIsochrone([lng, lat], distance);
      }
  }

  select.addEventListener('change', async function () {
    const selectedSchoolName = this.value;
    selectedFeatureForIsochrone = geojsonData.features.find(
      f => normalize(f.properties['Building Name']) === normalize(selectedSchoolName)
    );

    // Update the highlight layer data source
    const highlightSource = map.getSource('selected-school');
    if (highlightSource) {
      if (selectedFeatureForIsochrone) {
        highlightSource.setData({
          type: 'FeatureCollection',
          features: [selectedFeatureForIsochrone]
        });
      } else {
        // If "-- Select --" is chosen, clear the highlight
        highlightSource.setData({
          type: 'FeatureCollection',
          features: []
        });
      }
    }
    
    if (!selectedFeatureForIsochrone) {
        // Clear isochrone if no school is selected
        if (map.getSource('isochrone')) {
            map.getSource('isochrone').setData({ type: 'FeatureCollection', features: [] });
        }
        document.querySelector("#isoTable tbody").innerHTML = "";
        return;
    }
    
    selectedEnrollment = parseInt(selectedFeatureForIsochrone.properties['Enrollment']) || 0;
    // Removed automatic flyTo to respect user-set zoom level

    // Only trigger isochrone update if in manual mode
    if (manualView.style.display !== 'none') {
        triggerIsochroneUpdate();
    } else {
        // Clear isochrone if switching to model mode
        if (map.getSource('isochrone')) {
            map.getSource('isochrone').setData({ type: 'FeatureCollection', features: [] });
        }
        document.querySelector("#isoTable tbody").innerHTML = "";
    }

    // OD Matrix logic for Model Simulation
    odData = [];
    Papa.parse("https://raw.githubusercontent.com/DWieberdink/JeffCo/main/OD_Draft.csv" , {
      download: true,
      header: true,
      delimiter: ",",
      skipEmptyLines: true,
      complete: function(results) {
        odData = results.data.filter(row =>
          normalize(row.CurrentSchoolName) === normalize(selectedSchoolName)
        );
        console.log("✅ OD Matrix loaded for:", selectedSchoolName, "Rows:", odData.length);
      },
      error: function(err) {
        console.error("❌ Failed to load OD matrix:", err);
      }
    });

    // --- Blinking Halo Logic ---
    const sendingSource = map.getSource('sending-school');
    if (sendingSource) {
      if (selectedFeatureForIsochrone) {
        sendingSource.setData({
          type: 'FeatureCollection',
          features: [selectedFeatureForIsochrone]
        });
        startBlinkingHalo();
      } else {
        sendingSource.setData({ type: 'FeatureCollection', features: [] });
        stopBlinkingHalo();
      }
    }
  });

  if (isoDistanceSelect) {
    isoDistanceSelect.addEventListener('change', triggerIsochroneUpdate);
  } else {
    console.warn("⚠️ isoDistanceSelect not found; isochrone updates disabled");
  }

  if (manualBtn && modelBtn && manualView && modelView) {
    manualBtn.addEventListener('click', () => {
      manualView.style.display = 'block';
      modelView.style.display = 'none';
      manualBtn.classList.add('active');
      modelBtn.classList.remove('active');
      
      // Trigger isochrone update when switching to manual mode if a school is selected
      if (selectedFeatureForIsochrone) {
          triggerIsochroneUpdate();
      }
    });

    modelBtn.addEventListener('click', () => {
      manualView.style.display = 'none';
      modelView.style.display = 'block';
      manualBtn.classList.remove('active');
      modelBtn.classList.add('active');
      
      // Clear isochrone when switching to model mode
      if (map.getSource('isochrone')) {
          map.getSource('isochrone').setData({ type: 'FeatureCollection', features: [] });
      }
      const isoTableBody = document.querySelector("#isoTable tbody");
      if (isoTableBody) isoTableBody.innerHTML = "";
    });
  } else {
    console.warn("⚠️ Manual/model controls not found; skipping mode toggle setup");
  }

  // ✅ Debug assign button existence
  const assignButton = document.getElementById('assignButton');
  console.log("🔍 Assign button check during setup:");
  console.log("  assignButton exists:", !!assignButton);
  if (assignButton) {
    console.log("  assignButton text:", assignButton.textContent);
    console.log("  assignButton id:", assignButton.id);
  }

  if (assignButton) {
    assignButton.addEventListener('click', async () => {
    console.log("🔘 Assign button clicked!");
    
    // ✅ Get modal elements
    const progressModal = document.getElementById('assignmentProgress');
    const assignedCountElement = document.getElementById('assignedCount');
    const cancelButton = document.getElementById('cancelAssignment');
    
    console.log("🔍 Modal elements check:");
    console.log("  progressModal exists:", !!progressModal);
    console.log("  assignedCountElement exists:", !!assignedCountElement);
    console.log("  cancelButton exists:", !!cancelButton);
    
    // ✅ Show modal and initialize progress
    if (progressModal && assignedCountElement) {
      progressModal.style.display = 'block';
      assignedCountElement.textContent = '0';
      console.log("📊 Modal displayed and progress initialized to 0");
    } else {
      console.error("❌ Modal elements not found!");
      return;
    }

    // ✅ Add cancel functionality
    let assignmentCancelled = false;
    if (cancelButton) {
      cancelButton.onclick = () => {
        assignmentCancelled = true;
        progressModal.style.display = 'none';
        console.log("❌ Assignment cancelled by user");
      };
    }

    // ✅ Function to hide modal
    const hideModal = () => {
      if (progressModal) {
        progressModal.style.display = 'none';
        console.log("✅ Modal hidden");
      }
    };

    // ✅ Function to update progress
    const updateProgress = (count) => {
      if (assignedCountElement) {
        assignedCountElement.textContent = count;
        console.log("📊 Progress updated:", count);
      }
    };

    try {
        const selectedSchoolName = select.options[select.selectedIndex].textContent;
        console.log("🏫 Selected school:", selectedSchoolName);
      
        const studentsToAssign = odData.filter(d =>
          d.CurrentSchoolName &&
          normalize(d.CurrentSchoolName) === normalize(selectedSchoolName)
        );
        console.log("👥 Students to assign:", studentsToAssign.length);

        if (studentsToAssign.length === 0) {
          alert("No students found for the selected school.");
          hideModal();
          return;
        }

        const excluded = new Set(Array.from(document.getElementById("excludedSchools").selectedOptions).map(opt => normalize(opt.value)));
        console.log("🚫 Excluded schools:", excluded.size);

        const schoolLookup = new Map(geojsonData.features.map(f => [normalize(f.properties["Building Name"]), f.properties]));
        const odLookup = new Map();
        odData.forEach(d => {
            if (!odLookup.has(d.StudentID)) {
                odLookup.set(d.StudentID, []);
            }
            odLookup.get(d.StudentID).push(d);
        });

        // ✅ Get slider values directly from DOM elements
        const weightDistance = parseFloat(document.getElementById('distanceWeightSlider').value);
        const weightEnrollment = parseFloat(document.getElementById('enrollmentWeightSlider').value);
        const weightBuilding = parseFloat(document.getElementById('buildingWeightSlider').value);
        const weightScorecard = parseFloat(document.getElementById('scorecardWeightSlider').value);
        console.log("⚖️ Weights - Distance:", weightDistance, "Enrollment:", weightEnrollment, "Building:", weightBuilding, "Scorecard:", weightScorecard);
        
        // ✅ Calculate normalization factors for better scoring
        let maxDistance = 0;
        let maxQuality = 0;
        let maxScorecard = 0;
        let minScorecard = Infinity;
        let maxUtilization = 0;
        
        // Find max values for normalization
        for (const d of odData) {
          if (d.Distance) {
            const distance = parseFloat((d.Distance || "").replace(/[^\d.-]/g, "")) || 0;
            maxDistance = Math.max(maxDistance, distance);
          }
        }
        
        for (const feature of geojsonData.features) {
          const enrollment = parseInt(feature.properties["Enrollment"]) || 0;
          const quality = parseFloat(feature.properties["Building Quality"]) || 0;
          const scorecard = parseFloat(feature.properties["Scorecard"]) || 0;
          const utilization = parseFloat(feature.properties["Utilization"]) || 0;
          
          maxEnrollment = Math.max(maxEnrollment, enrollment);
          maxQuality = Math.max(maxQuality, quality);
          maxScorecard = Math.max(maxScorecard, scorecard);
          minScorecard = Math.min(minScorecard, scorecard);
          maxUtilization = Math.max(maxUtilization, utilization);
        }
        
        console.log("📊 Normalization factors - Max Distance:", maxDistance, "Max Enrollment:", maxEnrollment, "Max Quality:", maxQuality, "Max Scorecard:", maxScorecard, "Min Scorecard:", minScorecard, "Max Utilization:", maxUtilization);
        
        const finalAssignments = {};
        console.log("🔄 Starting assignment algorithm...");
        
        // ✅ Track assigned counts for each school to enforce seat limits
        const assignedCounts = {};
        geojsonData.features.forEach(f => {
            assignedCounts[normalize(f.properties["Building Name"])] = 0;
        });
        
        // ✅ Process students with progress tracking
        let processedCount = 0;
        
        for(const student of studentsToAssign) {
            // ✅ Check if assignment was cancelled
            if (assignmentCancelled) {
              console.log("❌ Assignment cancelled during processing");
              return;
            }
            
            const studentChoices = odLookup.get(student.StudentID) || [];
            const choices = studentChoices.filter(d =>
                d.DestinationSchoolName &&
                normalize(d.DestinationSchoolName) !== normalize(d.CurrentSchoolName) &&
                !excluded.has(normalize(d.DestinationSchoolName))
            );

            let bestSchool = null;
            let bestScore = -Infinity;

            for (const d of choices) {
                const distance = parseFloat((d.Distance || "").replace(/[^\d.-]/g, "")) || 0;
                const destName = normalize(d.DestinationSchoolName);
                const destProperties = schoolLookup.get(destName);
                if (!destProperties) continue;

                // ✅ Check seat availability (capacity constraint)
                const enrollment = parseInt(destProperties["Enrollment"]) || 0;
                const capacity = parseInt(destProperties["Capacity"]) || 0;
                const assignedSoFar = assignedCounts[destName] || 0;
                if ((enrollment + assignedSoFar) >= capacity) {
                    continue; // Skip if assigning would exceed capacity
                }

                const quality = parseFloat(destProperties["Building Quality"]) || 0;
                const scorecard = parseFloat(destProperties["Scorecard"]) || 0;
                const utilization = parseFloat(destProperties["Utilization"]) || 0;

                // Lower Building Quality (BuildingTreshhold) is better
                const qualityScore = maxQuality > 0 ? (1 - (quality / maxQuality)) : 0; // Lower is better
                const distanceScore = maxDistance > 0 ? (1 - (distance / maxDistance)) : 0; // Closer is better
                const enrollmentScore = maxUtilization > 0 ? (utilization / maxUtilization) : 0; // Higher utilization is better
                // Lower scorecard is better, but 1 is best and 5 is worst
                // Normalize so that 1 gets highest score, 5 gets lowest
                let scorecardScore = 0;
                if (maxScorecard > minScorecard) {
                  scorecardScore = (maxScorecard - scorecard) / (maxScorecard - minScorecard);
                } else {
                  scorecardScore = 1; // If all scorecards are the same
                }

                const score =
                  (weightDistance * distanceScore) +
                  (weightEnrollment * enrollmentScore) +
                  (weightBuilding * qualityScore) +
                  (weightScorecard * scorecardScore);

                // Debug logging for first few choices
                console.log(`🏫 ${destName}: Student=${student.StudentID}, Distance=${distance}(${distanceScore.toFixed(3)}), Utilization=${(utilization * 100).toFixed(1)}%(${enrollmentScore.toFixed(3)}), Quality=${quality}(${qualityScore.toFixed(3)}), Scorecard=${scorecard}(${scorecardScore.toFixed(3)}), Total=${score.toFixed(3)}`);

                if (score > bestScore) {
                  bestScore = score;
                  bestSchool = d.DestinationSchoolName;
                }
            }

            if (bestSchool) {
                finalAssignments[student.StudentID] = bestSchool;
                // ✅ Increment assigned count for the chosen school
                assignedCounts[normalize(bestSchool)]++;
            }
            
            // ✅ Update progress
            processedCount++;
            updateProgress(processedCount);
            
            // Allow UI to update every 5 students
            if (processedCount % 5 === 0) {
              await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        
        // ✅ Check if assignment was cancelled before proceeding
        if (assignmentCancelled) {
          console.log("❌ Assignment cancelled after processing");
          return;
        }
        
        console.log("✅ Assignment algorithm completed. Assignments:", Object.keys(finalAssignments).length);

        const summaryCounts = {};
        for (const school of Object.values(finalAssignments)) {
            summaryCounts[school] = (summaryCounts[school] || 0) + 1;
        }
        
        // ✅ Update map with assignment results
        const assignedFeatures = geojsonData.features
          .filter(f => summaryCounts[f.properties['Building Name']])
          .map(f => {
            const assignedCount = summaryCounts[f.properties['Building Name']];
            return {
              type: 'Feature',
              geometry: f.geometry,
              properties: {
                name: f.properties['Building Name'],
                assigned: assignedCount
              }
            };
          });

        const assignedGeoJSON = {
          type: 'FeatureCollection',
          features: assignedFeatures
        };

        // Update the assigned-schools source on the map
        if (map.getSource('assigned-schools')) {
          console.log("🗺️ Updating assigned-schools source with data:", assignedGeoJSON);
          console.log("📊 Number of assigned features:", assignedGeoJSON.features.length);
          console.log("🏫 Assigned schools:", assignedGeoJSON.features.map(f => f.properties.name));
          
          map.getSource('assigned-schools').setData(assignedGeoJSON);
          map.setLayoutProperty('assigned-schools-layer', 'visibility', 'visible');
          
          // ✅ Check if data was set correctly
          setTimeout(() => {
            const source = map.getSource('assigned-schools');
            console.log("🔍 Source data after update:", source._data);
            console.log("👁️ Layer visibility after update:", map.getLayoutProperty('assigned-schools-layer', 'visibility'));
          }, 100);
          
          // ✅ Popup is already set up when layer was created
          console.log("✅ Assigned-schools layer updated");
        } else {
          console.error("❌ assigned-schools source not found!");
        }
        
        // Always showing decisions view (toggle removed)
        // showingAssignments = true; // Removed
        if (map.getLayer('schools-layer')) {
          map.setPaintProperty('schools-layer', 'circle-color', '#007cbf');
        }
        
        // Toggle buttons removed - always showing decisions view
        
        // Update the legend
        updateLegend();
        
        const sortedSummary = Object.entries(summaryCounts).sort((a, b) => b[1] - a[1]);
        let output = `<strong style='font-size:18px;'>Student Assignments</strong><br/>`;
        output += `<table style=\"width:100%;margin-top:8px;border-collapse:collapse;font-family:'Franklin Gothic Book','Franklin Gothic','Arial Narrow',Arial,sans-serif;\">`;
        output += `<thead><tr style=\"background-color:#f2f2f2;\">\n                    <th style=\"border:1px solid #ccc;padding:6px;text-align:left;width:70%;min-width:220px;font-family:'Franklin Gothic Book','Franklin Gothic','Arial Narrow',Arial,sans-serif;\">School Name</th>\n                    <th style=\"border:1px solid #ccc;padding:6px;text-align:center;width:30%;min-width:50px;font-family:'Franklin Gothic Book','Franklin Gothic','Arial Narrow',Arial,sans-serif;\"># Students</th></tr>\n                    </thead><tbody>`;
        for (const [school, count] of sortedSummary) {
            output += `<tr><td class=\"truncate-cell\" data-tooltip=\"${school}\" style=\"width:70%;min-width:220px;font-family:'Franklin Gothic Book','Franklin Gothic','Arial Narrow',Arial,sans-serif;\">${school}</td>\n                    <td style=\"border:1px solid #ccc;padding:6px;text-align:center;width:30%;min-width:50px;font-family:'Franklin Gothic Book','Franklin Gothic','Arial Narrow',Arial,sans-serif;\">${count}</td></tr>`;
        }
        output += `</tbody></table>`;
        
        const chartLabels = [];
        const baseEnrollment = [];
        const simulatedAdds = [];
        const capacity = [];

        for (const [schoolName, added] of Object.entries(summaryCounts)) {
            const school = geojsonData.features.find(f => f.properties['Building Name'] === schoolName);
            if (school) {
                const current = parseInt(school.properties['Enrollment']) || 0;
                const cap = parseInt(school.properties['Capacity']) || 0;
                chartLabels.push(schoolName);
                baseEnrollment.push(current);
                simulatedAdds.push(added);
                capacity.push(cap);
            }
        }

        let totalOriginalDistance = 0;
        let totalAssignedDistance = 0;
        let studentCount = 0;

        studentsToAssign.forEach(student => {
            const sid = student.StudentID;
            const original = odData.find(d => d.StudentID === sid && normalize(d.CurrentSchoolName) === normalize(d.DestinationSchoolName));
            if (original) totalOriginalDistance += parseFloat(original.Distance);

            const assignedSchool = finalAssignments[sid];
            const reassigned = odData.find(d => d.StudentID === sid && normalize(d.DestinationSchoolName) === normalize(assignedSchool));
            if (reassigned) totalAssignedDistance += parseFloat(reassigned.Distance);

            studentCount++;
        });

        const avgOriginal = totalOriginalDistance / studentCount;
        const avgAssigned = totalAssignedDistance / studentCount;
        
        const resultsData = {
            summaryHTML: output,
            enrollmentChartData: {
                labels: chartLabels,
                datasets: [
                    { label: 'Current Enrollment', data: baseEnrollment, backgroundColor: '#0033A0', barThickness: 12 },
                    { label: 'New Assignments', data: simulatedAdds, backgroundColor: '#FFC72C', barThickness: 12 },
                    { label: 'Capacity', data: capacity, type: 'line', borderColor: '#FF530D', borderWidth: 3, pointStyle: 'line', pointRadius: 7, pointHoverRadius: 7, rotation: 90, fill: false, showLine: false, yAxisID: 'y' }
                ]
            },
            distanceChartData: {
                labels: ['Current School', 'Assigned School'],
                datasets: [{ label: 'Avg Distance (mi)', data: [avgOriginal.toFixed(2), avgAssigned.toFixed(2)], backgroundColor: ['#0033A0', '#ffcc00'] }]
            },
            assignments: finalAssignments,
            selectedSchoolName: selectedSchoolName
        };

        console.log("📤 Sending results directly to DecisionLogic...");
        if (window.decisionLogic && window.decisionLogic.handleAssignmentResults) {
            console.log("📤 Sending results directly to DecisionLogic...");
            window.decisionLogic.handleAssignmentResults(resultsData);
        } else {
            console.error("❌ DecisionLogic handler not found!");
        }

        // ✅ Hide the modal when assignment completes
        hideModal();
        console.log("✅ Assignment process completed successfully!");

        // Open the Model Output: Impact Analysis section
        const scenarioOutputPanel = document.getElementById('scenario-output-panel');
        if (scenarioOutputPanel) {
          scenarioOutputPanel.open = true;
        }

        // Update the travel distance impact chart with real data
        if (window.distanceChartInstance) {
          window.distanceChartInstance.data = {
            labels: ['Current School', 'Assigned School'],
            datasets: [{
              label: 'Avg Distance (mi)',
              data: [avgOriginal.toFixed(2), avgAssigned.toFixed(2)],
              backgroundColor: ['#0033A0', '#ffcc00']
            }]
          };
          window.distanceChartInstance.update();
          // Hide the placeholder text
          const placeholder = document.getElementById('distanceChartPlaceholder');
          if (placeholder && placeholder.parentNode) {
            console.log('Removing distanceChartPlaceholder from DOM');
            placeholder.parentNode.removeChild(placeholder);
          }
        }

        // Hide the enrollment chart placeholder as well
        const enrollPlaceholder = document.getElementById('enrollmentChartPlaceholder');
        if (enrollPlaceholder) enrollPlaceholder.style.display = 'none';

        // When updating the model output section, ensure the font is set for the entire container
        // Find the model output container and set its font family
        const modelOutputContainer = document.getElementById('scenario-output-panel');
        if (modelOutputContainer) {
          modelOutputContainer.style.fontFamily = "'Franklin Gothic Book','Franklin Gothic','Arial Narrow',Arial,sans-serif";
        }

        console.log('Simulation completed, checking for and removing distanceChartPlaceholder if present');
        const placeholder = document.getElementById('distanceChartPlaceholder');
        if (placeholder && placeholder.parentNode) {
          console.log('Removing distanceChartPlaceholder from DOM');
          placeholder.parentNode.removeChild(placeholder);
        }

    } catch (error) {
        console.error('❌ Error in assignment process:', error);
        // ✅ Hide the modal on error too
        hideModal();
        alert('An error occurred during the assignment process. Please try again.');
    }
    });
  } else {
    console.warn("⚠️ assignButton not found; assignment click handler not attached");
  }
});

// Wire up the always-visible "Show on map" button next to the main flowchart
// school dropdown. This runs once the DOM is ready, independent of the
// flowchart initialization logic.
document.addEventListener('DOMContentLoaded', () => {
  const showOnMapBtn = document.getElementById('flowchartShowOnMapBtn');
  const flowchartSchoolSelect = document.getElementById('mainFlowchartSchoolSelect');
  if (!showOnMapBtn || !flowchartSchoolSelect) {
    console.warn("⚠️ flowchartShowOnMapBtn or mainFlowchartSchoolSelect not found on DOMContentLoaded");
    return;
  }

  showOnMapBtn.addEventListener('click', () => {
    const currentName = flowchartSchoolSelect.value;
    console.log("🗺️ Show on map button clicked; selected school:", currentName);
    if (!currentName) {
      console.warn("⚠️ No school selected in mainFlowchartSchoolSelect");
      return;
    }
    if (typeof window.showOnMapFromFlowchart === 'function') {
      window.showOnMapFromFlowchart(currentName, { forceSwitch: true });
    } else {
      console.warn("⚠️ showOnMapFromFlowchart is not yet defined");
    }
  });
});

let currentIsochronePolygon = null;

async function drawIsochrone(centerCoords, distanceMeters) {
  if (!centerCoords || !distanceMeters) return;
  try {
      const url = `https://api.mapbox.com/isochrone/v1/mapbox/driving/${centerCoords[0]},${centerCoords[1]}?contours_meters=${distanceMeters}&polygons=true&access_token=${mapboxgl.accessToken}`;
      const res = await fetch(url);
      const data = await res.json();
      
      if (!data.features || data.features.length === 0) {
          console.warn("No isochrone feature returned from API.");
          if (map.getSource('isochrone')) {
            map.getSource('isochrone').setData({ type: 'FeatureCollection', features: [] });
          }
          return;
      }
      const simplified = turf.simplify(data.features[0], { tolerance: 0.001, highQuality: true });
      
      if (map.getSource('isochrone')) {
        map.getSource('isochrone').setData(simplified);
      } else {
        map.addSource('isochrone', { type: 'geojson', data: simplified });
        map.addLayer({
          id: 'isochrone-layer',
          type: 'fill',
          source: 'isochrone',
          paint: { 'fill-color': '#1E90FF', 'fill-opacity': 0.3 }
        });
      }
      
      currentIsochronePolygon = simplified;
      filterSchoolsInIsochrone(currentIsochronePolygon);
  } catch (err) {
    console.error('Failed to fetch or display isochrone:', err);
  }
}

function filterSchoolsInIsochrone(polygon) {
  const isoTableBody = document.querySelector("#isoTable tbody");
  if (!isoTableBody) return;

  let visibleFeatures = geojsonData.features.filter(f => turf.booleanPointInPolygon(f.geometry, polygon));
  // Always exclude the selected school from manual assignment options
  const schoolSelect = document.getElementById('schoolSelect');
  if (schoolSelect && schoolSelect.value) {
    visibleFeatures = visibleFeatures.filter(f => f.properties['Building Name'] !== schoolSelect.value);
  }
  // Exclude the selected school if decision type is 'Candidate for Closure/Merger'
  const decisionFilter = document.getElementById('decisionFilter');
  if (decisionFilter && schoolSelect && decisionFilter.value === 'Candidate for Closure/Merger') {
    const selectedSchool = schoolSelect.value;
    // (Already excluded above)
    // --- Add info above the table ---
    const manualView = document.getElementById('manualView');
    const isoTable = document.getElementById('isoTable');
    if (manualView && isoTable && selectedSchool) {
      // Find the selected school in geojsonData
      const selectedFeature = geojsonData.features.find(
        f => f.properties['Building Name'] === selectedSchool
      );
      const enrollment = selectedFeature ? (selectedFeature.properties['Enrollment'] || 0) : 0;
      // Create or update the info div above the table
      let infoDiv = document.getElementById('closureMergerInfo');
      if (!infoDiv) {
        infoDiv = document.createElement('div');
        infoDiv.id = 'closureMergerInfo';
        infoDiv.style.marginBottom = '10px';
        isoTable.parentNode.insertBefore(infoDiv, isoTable);
      }
      infoDiv.innerHTML = `<strong>Selected School:</strong> ${selectedSchool}<br><strong>Number of students to be assigned:</strong> ${enrollment}`;
    }
  } else {
    // Remove the info div if it exists
    const infoDiv = document.getElementById('closureMergerInfo');
    if (infoDiv) infoDiv.remove();
  }

  isoTableBody.innerHTML = '';
  visibleFeatures.forEach(f => {
    const row = document.createElement('tr');
    const name = f.properties['Building Name'];
    const originalSeats = parseInt(f.properties['Available Seats']) || 0;

    row.innerHTML = `
      <td class="truncate-cell" data-tooltip="${name}">${name}</td>
      <td class="percent-cell">
        <span class="assign-percent-btns" style="display:inline-flex; flex-direction:column; align-items:center; margin-right:2px;">
          <button type="button" class="assign-percent-up" tabindex="-1">&#x25B2;</button>
          <button type="button" class="assign-percent-down" tabindex="-1">&#x25BC;</button>
        </span>
        <input type="text" class="assign-percent" maxlength="3" pattern="[0-9]*" inputmode="numeric" value="0" style="width:50px; text-align:center; margin:0;" />
        <span>%</span>
      </td>
      <td class="assigned-count text-center">0</td>
      <td class="updated-seats text-center">${originalSeats}</td>
    `;
    isoTableBody.appendChild(row);
  });

  addPercentageListeners(visibleFeatures);
  // Add up/down button listeners for % Assigned
  document.querySelectorAll('.assign-percent-up').forEach((btn) => {
    btn.addEventListener('click', function() {
      const input = btn.closest('td').querySelector('.assign-percent');
      let val = parseInt(input.value) || 0;
      if (val < 100) {
        input.value = val + 1;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  });
  document.querySelectorAll('.assign-percent-down').forEach((btn) => {
    btn.addEventListener('click', function() {
      const input = btn.closest('td').querySelector('.assign-percent');
      let val = parseInt(input.value) || 0;
      if (val > 0) {
        input.value = val - 1;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  });
}

function addPercentageListeners(visibleFeatures) {
  const inputs = document.querySelectorAll('.assign-percent');
  // Add or get warning message element above the table
  let warningDiv = document.getElementById('manualAssignWarning');
  const isoTable = document.getElementById('isoTable');
  if (!warningDiv && isoTable) {
    warningDiv = document.createElement('div');
    warningDiv.id = 'manualAssignWarning';
    warningDiv.style.color = '#e74c3c';
    warningDiv.style.fontWeight = 'bold';
    warningDiv.style.marginBottom = '8px';
    warningDiv.style.display = 'none';
    isoTable.parentNode.insertBefore(warningDiv, isoTable);
  }

  function showWarning(msg) {
    if (warningDiv) {
      warningDiv.textContent = msg;
      warningDiv.style.display = 'block';
    }
  }
  function hideWarning() {
    if (warningDiv) {
      warningDiv.style.display = 'none';
      warningDiv.textContent = '';
    }
  }

  inputs.forEach((input, i) => {
    function switchToAssignmentsView() {
      const assignmentsBtn = document.getElementById('toggleViewAssignments');
      if (assignmentsBtn && !assignmentsBtn.classList.contains('active')) {
        assignmentsBtn.click();
      }
    }
    input.addEventListener('focus', function() {
      if (input.value === "0") {
        input.value = "";
      }
    });
    input.addEventListener('input', switchToAssignmentsView);
    input.addEventListener('input', () => {
      if(i >= visibleFeatures.length) return;
      // Calculate total assigned if this input is changed
      let totalAssigned = 0;
      const assignedCounts = [];
      inputs.forEach((inp, idx) => {
        let percent = parseFloat(inp.value) || 0;
        let assigned = Math.round((percent / 100) * selectedEnrollment);
        assignedCounts[idx] = assigned;
        totalAssigned += assigned;
      });
      // If over limit, adjust this input
      if (totalAssigned > selectedEnrollment) {
        // Calculate how many students are already assigned (excluding this input)
        let assignedOther = 0;
        inputs.forEach((inp, idx) => {
          if (idx !== i) {
            let percent = parseFloat(inp.value) || 0;
            assignedOther += Math.round((percent / 100) * selectedEnrollment);
          }
        });
        // Set this input so total = selectedEnrollment
        let maxForThis = Math.max(0, selectedEnrollment - assignedOther);
        let maxPercent = selectedEnrollment > 0 ? Math.floor((maxForThis / selectedEnrollment) * 100) : 0;
        input.value = maxPercent;
        // Update assigned cell and updated seats
        const assignedCell = input.closest('tr').querySelector('.assigned-count');
        const updatedCell = input.closest('tr').querySelector('.updated-seats');
        assignedCell.textContent = maxForThis;
        const originalSeats = parseInt(visibleFeatures[i].properties['Available Seats']) || 0;
        updatedCell.textContent = originalSeats - maxForThis;
        showWarning('Cannot assign more than 100% of students.');
      } else {
        // Normal update
        const percent = parseFloat(input.value) || 0;
        const assignedCell = input.closest('tr').querySelector('.assigned-count');
        const updatedCell = input.closest('tr').querySelector('.updated-seats');
        const assignedStudents = Math.round((percent / 100) * selectedEnrollment);
        const originalSeats = parseInt(visibleFeatures[i].properties['Available Seats']) || 0;
        const remainingSeats = originalSeats - assignedStudents;
        assignedCell.textContent = assignedStudents;
        updatedCell.textContent = remainingSeats;
        // Check if total assigned is now valid, hide warning if so
        // (recalculate totalAssigned in case it changed)
        let validTotal = 0;
        inputs.forEach((inp) => {
          let percent = parseFloat(inp.value) || 0;
          validTotal += Math.round((percent / 100) * selectedEnrollment);
        });
        if (validTotal <= selectedEnrollment) {
          hideWarning();
        }
      }

      // --- Update number of students to be assigned in closure/merger info ---
      const decisionFilter = document.getElementById('decisionFilter');
      const infoDiv = document.getElementById('closureMergerInfo');
      if (infoDiv && decisionFilter && decisionFilter.value === 'Candidate for Closure/Merger') {
        // Sum all assigned students
        let totalAssigned = 0;
        document.querySelectorAll('.assign-percent').forEach(input2 => {
          const percent2 = parseFloat(input2.value) || 0;
          totalAssigned += Math.round((percent2 / 100) * selectedEnrollment);
        });
        // Find the original enrollment from the infoDiv (parse from the HTML)
        const match = infoDiv.innerHTML.match(/Number of students to be assigned:<\/strong> (\d+)/);
        let originalEnrollment = selectedEnrollment;
        if (match) {
          // If the number has already been updated, recalculate from selectedEnrollment
          originalEnrollment = selectedEnrollment;
        }
        const remaining = Math.max(0, originalEnrollment - totalAssigned);
        // Update only the number in the infoDiv
        infoDiv.innerHTML = infoDiv.innerHTML.replace(/(Number of students to be assigned:<\/strong> )\d+/, `$1${remaining}`);
      }

      // --- Update map assignments in real time for manual entry ---
      // Only if 'Show Assignments' is active
      // Build summaryCounts from current table
      let summaryCounts = {};
      document.querySelectorAll('#isoTable tbody tr').forEach((row) => {
        const nameCell = row.querySelector('td');
        const assignedCell = row.querySelector('.assigned-count');
        if (nameCell && assignedCell) {
          const schoolName = nameCell.textContent.trim();
          const assigned = parseInt(assignedCell.textContent) || 0;
          if (assigned > 0) summaryCounts[schoolName] = assigned;
        }
      });
      // Build assignedFeatures for the map
      const assignedFeatures = geojsonData.features
        .filter(f => summaryCounts[f.properties['Building Name']])
        .map(f => {
          const assignedCount = summaryCounts[f.properties['Building Name']];
          return {
            type: 'Feature',
            geometry: f.geometry,
            properties: {
              name: f.properties['Building Name'],
              assigned: assignedCount
            }
          };
        });
      const assignedGeoJSON = {
        type: 'FeatureCollection',
        features: assignedFeatures
      };
      if (map.getSource('assigned-schools')) {
        map.getSource('assigned-schools').setData(assignedGeoJSON);
        if (map.getLayer('assigned-schools-layer')) {
          map.setLayoutProperty('assigned-schools-layer', 'visibility', assignedFeatures.length > 0 ? 'visible' : 'none');
        }
      }
    });
  });
}

// ✅ New script to connect sidebar sliders to the DecisionLogic iframe - REPLACED
document.addEventListener("DOMContentLoaded", function() {
    const sliderIds = [
      "utilSlider", "utilHighSlider", "growthSlider",
      "buildSlider", "buildAboveSlider", "buildBelowSlider", "buildFlow4Slider", "progSlider",
      "attendanceAreaEnrollmentSlider",
      "elementaryEnrollmentSlider", "k8EnrollmentSlider", "middleEnrollmentSlider", 
      "highEnrollmentSlider", "k12EnrollmentSlider",
      "elementaryDistanceSlider", "k8DistanceSlider", "middleDistanceSlider", 
      "highDistanceSlider", "k12DistanceSlider"
    ];

    const sliders = sliderIds.map(id => document.getElementById(id));
    
    console.log("🔍 Found sliders:", sliderIds.map((id, i) => ({ id, found: !!sliders[i] })));

    function sendSliderData() {
      console.log("📊 sendSliderData called");
      const thresholds = {
        utilization: parseFloat(document.getElementById("utilSlider").value)/100,
        utilizationHigh: parseFloat(document.getElementById("utilHighSlider").value)/100,
        enrollmentGrowth: parseFloat(document.getElementById("growthSlider").value)/100,
        distanceUnderutilized: window.thresholds?.distanceUnderutilized ?? window.decisionLogic?.thresholds?.distanceUnderutilized ?? 3.5,
        siteCapacity: "Yes", // Default value - dropdown removed
        buildingThreshold: parseFloat(document.getElementById("buildSlider").value),
        buildingThresholdAbove: parseFloat(document.getElementById("buildAboveSlider").value),
        buildingThresholdBelow: parseFloat(document.getElementById("buildBelowSlider").value),
        buildingThresholdFlow4: parseFloat(document.getElementById("buildFlow4Slider").value),
        adequateProgramsMin: parseInt(document.getElementById("progSlider").value, 10),
        attendanceAreaEnrollment: parseInt(document.getElementById("attendanceAreaEnrollmentSlider").value, 10),
        // Enrollment thresholds by school level
        elementaryEnrollment: parseInt(document.getElementById("elementaryEnrollmentSlider").value, 10),
        k8Enrollment: parseInt(document.getElementById("k8EnrollmentSlider").value, 10),
        middleEnrollment: parseInt(document.getElementById("middleEnrollmentSlider").value, 10),
        highEnrollment: parseInt(document.getElementById("highEnrollmentSlider").value, 10),
        k12Enrollment: parseInt(document.getElementById("k12EnrollmentSlider").value, 10),
        // Distance thresholds by school level
        elementaryDistance: parseFloat(document.getElementById("elementaryDistanceSlider").value),
        k8Distance: parseFloat(document.getElementById("k8DistanceSlider").value),
        middleDistance: parseFloat(document.getElementById("middleDistanceSlider").value),
        highDistance: parseFloat(document.getElementById("highDistanceSlider").value),
        k12Distance: parseFloat(document.getElementById("k12DistanceSlider").value),
      };
      
      console.log("📊 New thresholds:", thresholds);
      
      // Store thresholds globally for flowchart access
      window.thresholds = thresholds;
      
      if (window.decisionLogic) {
        window.decisionLogic.updateThresholds(thresholds);
        const updatedSchoolData = window.decisionLogic.schoolData;
        
        if (geojsonData && map.getSource('schools')) {
          // Slider updates should not change which schools are considered closed/non-eval.
          injectDecisionsIntoGeoJSON(geojsonData, updatedSchoolData, { updateInclusionStatus: false });
          // Keep base copy in sync with latest decisions for future filtering
          originalGeojsonData = JSON.parse(JSON.stringify(geojsonData));
          // Reapply current map filters instead of resetting to full data
          updateLayer();
          updateLegend();
        }
        // Update scenario modeling table/lists if present
        if (typeof window.updateScenarioOptionsVisibility === 'function') {
          window.updateScenarioOptionsVisibility();
        }
        // Update school select dropdown live as decision types change
        const decisionFilter = document.getElementById('decisionFilter');
        if (typeof window.updateSchoolSelect === 'function' && decisionFilter) {
          window.updateSchoolSelect(decisionFilter.value);
        }
      } else {
        console.warn("⚠️ DecisionLogic not ready, cannot send slider data.");
      }

      // ✅ Update flowchart node labels with new threshold values
      if (typeof window.FlowUtils !== 'undefined' && typeof window.FlowUtils.updateNodeLabels === 'function') {
        console.log("🔄 Updating flowchart node labels with new thresholds");
        window.FlowUtils.updateNodeLabels();
      } else {
        console.warn("⚠️ FlowUtils.updateNodeLabels not available");
      }
      
      // ✅ Update prioritization UI when decisions change
      if (typeof window.prioritizationUI !== 'undefined' && typeof window.prioritizationUI.refresh === 'function') {
        console.log("🔄 Refreshing prioritization UI with updated decisions");
        const schoolDataWithDecisions = window.decisionLogic.schoolData.map(row => ({
          ...row,
          decision: row.decision || row["Decision Type"]
        }));
        window.prioritizationUI.refresh(schoolDataWithDecisions);
      }

      // ✅ Determine the currently selected school for flow/impact updates.
      const flowchartSelect = document.getElementById('mainFlowchartSchoolSelect');
      const selectedSchoolForFlow =
        (flowchartSelect && flowchartSelect.value) ||
        window.currentSelectedSchoolName ||
        "";

      console.log("🔍 Flowchart select element:", flowchartSelect);
      console.log("🔍 updateFlowForSchool function available:", typeof window.updateFlowForSchool === 'function');
      console.log("🔍 Selected school for flow updates:", selectedSchoolForFlow || "(none)");

      // Keep the map dropdown in sync with the chosen flow school (even on first load)
      if (selectedSchoolForFlow) {
        try {
          const mapSelect = document.getElementById('mapOriginSchoolSelect');
          if (mapSelect) {
            const norm = (s) => (s || "").toString().trim().toLowerCase();
            // Resolve originId from decisionLogic if available
            let originId = "";
            if (window.decisionLogic && Array.isArray(window.decisionLogic.schoolData)) {
              const row = window.decisionLogic.schoolData.find(r => norm(r["Building Name"]) === norm(selectedSchoolForFlow));
              if (row) {
                originId = (
                  row.UniqueID ||
                  row["UniqueID"] ||
                  row["Unique Id"] ||
                  ""
                ).toString().trim();
              }
            }
            // Ensure an option exists
            if (originId) {
              let hasIdOption = Array.from(mapSelect.options || []).some(opt => opt.value === originId);
              if (!hasIdOption) {
                const opt = document.createElement('option');
                opt.value = originId;
                opt.textContent = selectedSchoolForFlow;
                mapSelect.appendChild(opt);
              }
              mapSelect.value = originId;
            } else {
              let match = Array.from(mapSelect.options || []).find(
                opt => norm(opt.textContent) === norm(selectedSchoolForFlow) || norm(opt.value) === norm(selectedSchoolForFlow)
              );
              if (!match) {
                const opt = document.createElement('option');
                opt.value = selectedSchoolForFlow;
                opt.textContent = selectedSchoolForFlow;
                mapSelect.appendChild(opt);
                match = opt;
              }
              mapSelect.value = match.value;
            }
            Array.from(mapSelect.options || []).forEach(opt => {
              opt.selected = opt.value === mapSelect.value;
            });
            window.currentOriginId = mapSelect.value;
            window.currentOriginName = selectedSchoolForFlow;
          }
        } catch (syncErr) {
          console.warn("⚠️ Unable to sync mapOriginSchoolSelect during flow update:", syncErr);
        }
      }

      // If we have a remembered selection but the dropdown is empty (for
      // example, when the user selected via the map before visiting the
      // flowchart), try to sync the dropdown UI to that selection.
      if (
        selectedSchoolForFlow &&
        flowchartSelect &&
        !flowchartSelect.value
      ) {
        const hasOption = Array.from(flowchartSelect.options || []).some(
          opt => opt.value === selectedSchoolForFlow
        );
        if (hasOption) {
          flowchartSelect.value = selectedSchoolForFlow;
          console.log("🎯 Synchronized flowchart dropdown to remembered school:", selectedSchoolForFlow);
        } else {
          console.warn("⚠️ Remembered school not found in flowchart dropdown options:", selectedSchoolForFlow);
        }
      }

      // ✅ Update flowchart path for the selected school
      if (selectedSchoolForFlow && typeof window.updateFlowForSchool === 'function') {
        console.log("🔄 Updating flowchart path for school:", selectedSchoolForFlow);
        window.updateFlowForSchool(selectedSchoolForFlow, thresholds);
      } else {
        console.log("🔍 No school available for flowchart path update");
      }

      // ✅ Update nearby welcoming schools list for the selected school
      if (selectedSchoolForFlow && typeof window.showNearbyWelcomingSchools === 'function') {
        console.log("🔄 Updating nearby welcoming schools list for:", selectedSchoolForFlow);
        window.showNearbyWelcomingSchools(selectedSchoolForFlow);
      }
      
      // ✅ Update nearby destination highlight on the map for the selected school
      if (selectedSchoolForFlow && typeof window.updateNearbyDestinationsHighlight === 'function' && window.decisionLogic && Array.isArray(window.decisionLogic.schoolData)) {
        const originRowForFlow = window.decisionLogic.schoolData.find(r => r["Building Name"] === selectedSchoolForFlow);
        const originIdForFlow = originRowForFlow
          ? (originRowForFlow.UniqueID || originRowForFlow["UniqueID"] || originRowForFlow["Unique Id"] || "").toString().trim()
          : "";
        if (originIdForFlow) {
          console.log("🔄 Updating nearby destination highlight for origin:", selectedSchoolForFlow, originIdForFlow);
          window.currentOriginName = selectedSchoolForFlow;
          window.currentOriginId = originIdForFlow;
          window.updateNearbyDestinationsHighlight(originIdForFlow);
        }
      }
    }

    sliders.forEach(slider => {
      if (slider) {
        console.log("✅ Adding event listener to slider:", slider.id);
        // Use 'input' for range sliders
        const eventType = "input";
        slider.addEventListener(eventType, () => {
          console.log("🎛️ Slider changed:", slider.id, "value:", slider.value);
          const outSpan = document.getElementById(slider.id.replace("Slider", "Out"));
          if (outSpan) {
            // Format percentage sliders
            if (slider.id === "attendanceAreaEnrollmentSlider" || slider.id === "progSlider") {
              outSpan.textContent = slider.value;
            } else {
              outSpan.textContent = slider.value;
            }
          }
          sendSliderData(); // Call the main update function
        });
      } else {
        console.warn("⚠️ Slider not found:", sliderIds[sliders.indexOf(slider)]);
      }
    });

    // Set initial values on load
    if (sliders.every(s => s)) {
      // Initialize output display values
      sliders.forEach(slider => {
        const outSpan = document.getElementById(slider.id.replace("Slider", "Out"));
        if (outSpan) outSpan.textContent = slider.value;
      });
      
      sendSliderData();
      
      // Force refresh flowchart after a short delay to ensure everything is loaded
      setTimeout(() => {
        console.log("🔄 Force refreshing flowchart with current slider values");
        sendSliderData();
      }, 1000);
    }
});

// --- ONBOARDING WALKTHROUGH LOGIC ---
let isSettingUpPath = false; // Flag to track if we're setting up a specific path

function startOnboardingWalkthrough() {
  // If a tour is already running, end it first (prevents duplicate listeners/overlays)
  if (window.__onboardingTourCleanup && typeof window.__onboardingTourCleanup === 'function') {
    try { window.__onboardingTourCleanup(); } catch (e) {}
    window.__onboardingTourCleanup = null;
  }

  // Close all major details sections before starting the tour
  const detailsIds = [
    'decision-input-panel',
    'scenario-input-panel',
    'decision-output-panel',
    'scenario-output-panel',
    'summary-table-details',
    'decision-by-school-details'
  ];
  detailsIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.open = false;
  });

  const steps = [
    {
      target: 'body',
      title: 'Welcome to the JeffCo Facility Planning Dashboard',
      text: 'This quick tour explains how the dashboard is organized and where to click to access the panels and tools. You can exit at any time using the “×” button or pressing Esc.',
      isIntro: true
    },
    {
      target: '#sidebarToggle',
      title: 'Hamburger Menu (important)',
      text: 'Click the hamburger menu in the top bar to open the dashboard menu. From there you can show/hide the left and right panels, start this tour again, and switch between Map and Flowchart views.',
      ensureMenuClosed: true
    },
    {
      target: '#toggleLeftSidebar',
      title: 'Show the Left Panel (Inputs)',
      text: 'Use this toggle to show/hide the left panel. The left panel contains Strategic Sorting inputs (threshold sliders) and Prioritization scenario controls.',
      openMenu: true
    },
    {
      target: '#toggleRightSidebar',
      title: 'Show the Right Panel (Results)',
      text: 'Use this toggle to show/hide the right panel. The right panel contains Strategic Sorting results (summary + by-school) and model/scenario outputs.',
      openMenu: true
    },
    {
      target: '#sidebar',
      title: 'Left Panel: Inputs',
      text: 'This is where you control the assumptions. Expand each section to see sliders, options, and help tips.',
      ensureLeftSidebar: true
    },
    {
      target: '#decision-input-panel',
      title: 'Strategic Sorting (Inputs)',
      text: 'Adjust the threshold sliders to change how schools are categorized into strategy groups. As you change sliders, the results update immediately on the right.',
      ensureLeftSidebar: true
    },
    {
      target: '#map-sidebar',
      title: 'Right Panel: Results',
      text: 'This panel shows the outcomes of your inputs. Strategic Sorting results update live; model/scenario outputs appear after you run a scenario.',
      ensureRightSidebar: true
    },
    {
      target: '#decision-output-panel',
      title: 'Strategic Sorting (Results)',
      text: 'Open “Summary Table” to see counts by strategy group, and “Decision by School” to see each school’s assigned outcome. Use the help icons (?) for definitions.',
      ensureRightSidebar: true
    },
    {
      target: '#map-container',
      title: 'Map View: Explore Schools',
      text: 'Use the map to pan/zoom and explore schools spatially. Clicking a school will surface its data and help you connect results to geography.',
      ensureMapView: true,
      ensureMenuClosed: true
    },
    {
      target: '#fitToSchoolsBtn',
      title: 'Fit to Schools',
      text: 'Click this button to zoom the map to show all schools.',
      ensureMapView: true
    },
    {
      target: '#scenario-input-panel',
      title: 'Scenario Modeling (Inputs)',
      text: 'Use scenario modeling to test different decision types and see how student enrollment, utilization, and travel distance could change.',
      ensureLeftSidebar: true
    },
    {
      target: '#scenario-output-panel',
      title: 'Scenario Modeling (Outputs)',
      text: 'After running a scenario, review the output here to understand impacts (enrollment shifts, utilization changes, and travel distance changes).',
      ensureRightSidebar: true
    },
    {
      target: '#toggleMapFlowchartFlowchart2',
      title: 'Flowchart View',
      text: 'Switch to the Flowchart view to understand the decision logic for a specific school.',
      ensureFlowchartView: true
    },
    {
      target: '#mainFlowchartSchoolSelect',
      title: 'Select a School (Flowchart)',
      text: 'Choose a school from this dropdown to render its decision flowchart and see which thresholds are “active” for that school.',
      ensureFlowchartView: true
    },
    {
      target: '#flowchartShowOnMapBtn',
      title: 'Show on Map',
      text: 'Use “Show on map” to jump back to the map centered on the selected school.',
      ensureFlowchartView: true
    },
    {
      target: 'body',
      title: 'All set',
      text: 'You’re ready to explore. Re-open the hamburger menu any time to start the tour again.',
      ensureMenuClosed: true
    }
  ];

  let currentStep = 0;
  let overlay = null;
  let popup = null;
  let keyHandler = null;
  let resizeHandler = null;
  const body = document.body;
  const menu = document.getElementById('sidebarMenu');
  const leftToggle = document.getElementById('toggleLeftSidebar');
  const rightToggle = document.getElementById('toggleRightSidebar');

  function setSidebarVisibility({ left, right } = {}) {
    if (typeof left === 'boolean') {
      if (left) body.classList.remove('sidebar-collapsed');
      else body.classList.add('sidebar-collapsed');
      if (leftToggle) leftToggle.checked = left;
    }
    if (typeof right === 'boolean') {
      if (right) body.classList.remove('right-sidebar-collapsed');
      else body.classList.add('right-sidebar-collapsed');
      if (rightToggle) rightToggle.checked = right;
    }
    if (window.map && typeof window.map.resize === 'function') {
      setTimeout(() => window.map.resize(), 50);
    }
  }

  function openMenu() {
    if (menu) menu.style.display = 'block';
  }
  function closeMenu() {
    if (menu) menu.style.display = 'none';
  }

  function ensureMapView() {
    if (typeof window.switchToMap === 'function') window.switchToMap();
  }
  function ensureFlowchartView() {
    if (typeof window.switchToFlowchart === 'function') window.switchToFlowchart();
  }

  function showStep(stepIdx) {
    // Remove previous overlay/popup
    if (overlay) overlay.remove();
    if (popup) popup.remove();

    const step = steps[stepIdx];
    
    // Menu + visibility preconditions
    if (step.openMenu) openMenu();
    if (step.ensureMenuClosed) closeMenu();
    if (step.ensureLeftSidebar) setSidebarVisibility({ left: true });
    if (step.ensureRightSidebar) setSidebarVisibility({ right: true });
    if (step.ensureMapView) ensureMapView();
    if (step.ensureFlowchartView) ensureFlowchartView();
    
    let target = document.querySelector(step.target);
    // Open dropdown <details> if the step is for a details section
    const detailsIds = ['#decision-input-panel', '#scenario-input-panel', '#decision-output-panel', '#scenario-output-panel'];
    if (detailsIds.includes(step.target) && target && !target.open) {
      target.open = true;
    }

    // --- ADD THIS: If the step is the flowchart, switch to flowchart view ---
    if (step.target === '#main-flowchart-container') {
      // This is the flowchart step; show the flowchart view
      const flowchartBtn = document.getElementById('toggleMapFlowchartFlowchart');
      if (flowchartBtn && !flowchartBtn.classList.contains('active')) {
        flowchartBtn.click();
      }
    }

    // For scenario/model output, wait for the section to open before highlighting
    if ((step.target === '#scenario-input-panel' || step.target === '#scenario-output-panel') && target) {
      // Scroll into view
      target.scrollIntoView({behavior: 'smooth', block: 'nearest'});
      // For scenario modeling, highlight the entire details border, not just the summary, but only after open and after scroll
      if (step.target === '#scenario-input-panel') {
        let highlightTarget = document.getElementById('scenario-input-panel');
        const drawAfterScroll = () => {
          drawHighlight(highlightTarget, step, stepIdx);
          setTimeout(() => {
            drawPopup(target, step, stepIdx);
          }, 60);
        };
        if (!highlightTarget.open) {
          highlightTarget.open = true;
          void highlightTarget.offsetWidth; // Force reflow
          setTimeout(drawAfterScroll, 600); // Wait for open + scroll
        } else {
          setTimeout(drawAfterScroll, 350); // Wait for scroll
        }
        return;
      }
      // For scenario output panel, highlight after open and scroll
      if (step.target === '#scenario-output-panel') {
        let highlightTarget = document.getElementById('scenario-output-panel');
        const drawAfterScroll = () => {
          drawHighlight(highlightTarget, step, stepIdx);
          setTimeout(() => {
            drawPopup(target, step, stepIdx);
          }, 60);
        };
        if (!highlightTarget.open) {
          highlightTarget.open = true;
          void highlightTarget.offsetWidth; // Force reflow
          setTimeout(drawAfterScroll, 600); // Wait for open + scroll
        } else {
          setTimeout(drawAfterScroll, 350); // Wait for scroll
        }
        return;
      }
    }

    if (!target) {
      nextStep();
      return;
    }

    // Scroll target into view unless it's the intro body step
    if (!step.isIntro && step.target !== 'body') {
      try {
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      } catch (e) {}
    }

    // Default: draw highlight and popup immediately
    drawHighlight(target, step, stepIdx);
    drawPopup(target, step, stepIdx);
  }

  // ---- Exit-anytime + resize safety helpers ----
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function positionPopup(target, step) {
    if (!popup) return;
    const margin = 12;

    // Ensure popup stays inside viewport even on small screens
    popup.style.maxHeight = `calc(100vh - ${margin * 2}px)`;
    popup.style.overflowY = 'auto';

    // Measure after DOM append
    const popupRect = popup.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;

    // Default desired position
    let desiredLeft = margin;
    let desiredTop = margin;

    if (step.isIntro || step.target === 'body') {
      desiredLeft = (vw - popupRect.width) / 2;
      desiredTop = Math.max(margin, Math.round(vh * 0.18));
    } else {
      const rect = target.getBoundingClientRect();

      // Prefer right of target
      desiredLeft = rect.right + 20;
      desiredTop = rect.top;

      // If right would overflow, try left of target
      if (desiredLeft + popupRect.width + margin > vw) {
        desiredLeft = rect.left - popupRect.width - 20;
      }

      // If still overflow (or target is near edges), clamp
      desiredLeft = clamp(desiredLeft, margin, Math.max(margin, vw - popupRect.width - margin));
      desiredTop = clamp(desiredTop, margin, Math.max(margin, vh - popupRect.height - margin));
    }

    popup.style.left = `${desiredLeft}px`;
    popup.style.top = `${desiredTop}px`;
    popup.style.right = '';
    popup.style.transform = '';
  }

  function createChoiceButton(icon, title, description, color, onClick) {
    const button = document.createElement('div');
    button.style.flex = '1';
    button.style.minWidth = '200px';
    button.style.maxWidth = '250px';
    button.style.height = '280px'; // Fixed height for all buttons
    button.style.padding = '30px 15px';
    button.style.border = `3px solid ${color}`;
    button.style.borderRadius = '12px';
    button.style.cursor = 'pointer';
    button.style.transition = 'all 0.3s ease';
    button.style.background = '#fff';
    button.style.display = 'flex';
    button.style.flexDirection = 'column';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center'; // Center content vertically
    button.style.gap = '15px';
    button.style.boxSizing = 'border-box'; // Include padding in height calculation

    // Hover effect
    button.addEventListener('mouseenter', () => {
      button.style.transform = 'translateY(-5px)';
      button.style.boxShadow = `0 8px 25px rgba(0,0,0,0.2)`;
      button.style.background = color;
      button.style.color = '#fff';
    });

    button.addEventListener('mouseleave', () => {
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = 'none';
      button.style.background = '#fff';
      button.style.color = '#333';
    });

    // Icon
    const iconEl = document.createElement('div');
    iconEl.textContent = icon;
    iconEl.style.fontSize = '48px';
    iconEl.style.marginBottom = '10px';
    button.appendChild(iconEl);

    // Title
    const titleEl = document.createElement('h3');
    titleEl.textContent = title;
    titleEl.style.margin = '0';
    titleEl.style.fontSize = '18px';
    titleEl.style.fontWeight = 'bold';
    titleEl.style.color = 'inherit';
    button.appendChild(titleEl);

    // Description
    const descEl = document.createElement('p');
    descEl.textContent = description;
    descEl.style.margin = '0';
    descEl.style.fontSize = '14px';
    descEl.style.lineHeight = '1.4';
    descEl.style.color = 'inherit';
    descEl.style.opacity = '0.8';
    button.appendChild(descEl);

    // Click handler
    button.addEventListener('click', () => {
      console.log("🔘 Choice button clicked:", title);
      // Add a small delay to ensure DOM is ready
      setTimeout(() => {
        onClick();
        // Delay endWalkthrough to allow panels to open
        setTimeout(() => {
          endWalkthrough();
        }, 200);
      }, 50);
    });

    return button;
  }

  function setupSchoolDecisionEvaluation() {
    console.log("🏫 Setting up School Decision Evaluation path...");
    isSettingUpPath = true; // Set flag to prevent panel closing
    
    // Ensure sidebar is visible
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      console.log("📋 Sidebar found, ensuring visibility");
      sidebar.style.display = 'flex';
    } else {
      console.error("❌ Could not find sidebar");
    }
    
    // Ensure right sidebar (map-sidebar) is visible and properly configured
    const mapSidebar = document.getElementById('map-sidebar');
    if (mapSidebar) {
      console.log("📋 Map sidebar found, ensuring visibility");
      mapSidebar.style.display = 'flex';
      mapSidebar.classList.remove('hidden', 'wide');
      mapSidebar.classList.add('normal');
    } else {
      console.error("❌ Could not find map-sidebar");
    }
    
    // Close all panels first
    const allPanels = [
      document.getElementById('decision-input-panel'),
      document.getElementById('scenario-input-panel'),
      document.getElementById('decision-output-panel'),
      document.getElementById('scenario-output-panel')
    ];
    
    console.log("🔍 Found panels:", allPanels.map(p => p ? p.id : 'null'));
    
    allPanels.forEach(panel => { 
      if (panel && panel.open) {
        console.log("🔒 Closing panel:", panel.id);
        panel.open = false; 
      }
    });

    // Wait a bit before opening panels to ensure everything is settled
    setTimeout(() => {
      // Open required panels
      const decisionInputPanel = document.getElementById('decision-input-panel');
      const decisionOutputPanel = document.getElementById('decision-output-panel');
      
      if (decisionInputPanel) {
        console.log("🔓 Opening decision input panel");
        decisionInputPanel.open = true;
        // Force a reflow to ensure the panel opens
        decisionInputPanel.offsetHeight;
        
        // Check if it actually opened
        setTimeout(() => {
          console.log("🔍 Decision input panel open state:", decisionInputPanel.open);
          if (!decisionInputPanel.open) {
            console.log("🔄 Retrying to open decision input panel");
            decisionInputPanel.open = true;
            decisionInputPanel.offsetHeight;
          }
        }, 100);
      } else {
        console.error("❌ Could not find decision-input-panel");
      }
      
      if (decisionOutputPanel) {
        console.log("🔓 Opening decision output panel");
        decisionOutputPanel.open = true;
        // Force a reflow to ensure the panel opens
        decisionOutputPanel.offsetHeight;
        
        // Check if it actually opened
        setTimeout(() => {
          console.log("🔍 Decision output panel open state:", decisionOutputPanel.open);
          if (!decisionOutputPanel.open) {
            console.log("🔄 Retrying to open decision output panel");
            decisionOutputPanel.open = true;
            decisionOutputPanel.offsetHeight;
          }
        }, 100);
      } else {
        console.error("❌ Could not find decision-output-panel");
      }
    }, 200);

    // Switch to flowchart view (and keep it there)
    const flowchartBtn = document.getElementById('toggleMapFlowchartFlowchart');
    if (flowchartBtn && !flowchartBtn.classList.contains('active')) {
      console.log("📊 Switching to flowchart view");
      flowchartBtn.click();
    } else {
      console.log("📊 Flowchart view already active or button not found");
    }
    
    console.log("✅ School Decision Evaluation setup complete");
  }

  function setupScenarioModeling() {
    console.log("📊 Setting up Scenario Modeling path...");
    isSettingUpPath = true; // Set flag to prevent panel closing
    
    // Ensure sidebar is visible
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      console.log("📋 Sidebar found, ensuring visibility");
      sidebar.style.display = 'flex';
    } else {
      console.error("❌ Could not find sidebar");
    }
    
    // Ensure right sidebar (map-sidebar) is visible and properly configured
    const mapSidebar = document.getElementById('map-sidebar');
    if (mapSidebar) {
      console.log("📋 Map sidebar found, ensuring visibility");
      mapSidebar.style.display = 'flex';
      mapSidebar.classList.remove('hidden', 'wide');
      mapSidebar.classList.add('normal');
    } else {
      console.error("❌ Could not find map-sidebar");
    }
    
    // Close all panels first
    const allPanels = [
      document.getElementById('decision-input-panel'),
      document.getElementById('scenario-input-panel'),
      document.getElementById('decision-output-panel'),
      document.getElementById('scenario-output-panel')
    ];
    
    console.log("🔍 Found panels:", allPanels.map(p => p ? p.id : 'null'));
    
    allPanels.forEach(panel => { 
      if (panel && panel.open) {
        console.log("🔒 Closing panel:", panel.id);
        panel.open = false; 
      }
    });

    // Wait a bit before opening panels to ensure everything is settled
    setTimeout(() => {
      // Open required panels
      const scenarioInputPanel = document.getElementById('scenario-input-panel');
      const scenarioOutputPanel = document.getElementById('scenario-output-panel');
      
      if (scenarioInputPanel) {
        console.log("🔓 Opening scenario input panel");
        scenarioInputPanel.open = true;
        // Force a reflow to ensure the panel opens
        scenarioInputPanel.offsetHeight;
        
        // Check if it actually opened
        setTimeout(() => {
          console.log("🔍 Scenario input panel open state:", scenarioInputPanel.open);
          console.log("🔍 Scenario input panel display:", window.getComputedStyle(scenarioInputPanel).display);
          console.log("🔍 Scenario input panel visibility:", window.getComputedStyle(scenarioInputPanel).visibility);
          
          // If it's still not open, try again
          if (!scenarioInputPanel.open) {
            console.log("🔄 Retrying to open scenario input panel");
            scenarioInputPanel.open = true;
            scenarioInputPanel.offsetHeight;
          }
        }, 100);
      } else {
        console.error("❌ Could not find scenario-input-panel");
      }
      
      if (scenarioOutputPanel) {
        console.log("🔓 Opening scenario output panel");
        scenarioOutputPanel.open = true;
        // Force a reflow to ensure the panel opens
        scenarioOutputPanel.offsetHeight;
        
        // Check if it actually opened
        setTimeout(() => {
          console.log("🔍 Scenario output panel open state:", scenarioOutputPanel.open);
          console.log("🔍 Scenario output panel display:", window.getComputedStyle(scenarioOutputPanel).display);
          console.log("🔍 Scenario output panel visibility:", window.getComputedStyle(scenarioOutputPanel).visibility);
          
          // If it's still not open, try again
          if (!scenarioOutputPanel.open) {
            console.log("🔄 Retrying to open scenario output panel");
            scenarioOutputPanel.open = true;
            scenarioOutputPanel.offsetHeight;
          }
        }, 100);
      } else {
        console.error("❌ Could not find scenario-output-panel");
      }
    }, 200);

    // Switch to map view
    const mapBtn = document.getElementById('toggleMapFlowchartMap');
    if (mapBtn && !mapBtn.classList.contains('active')) {
      console.log("🗺️ Switching to map view");
      mapBtn.click();
    } else {
      console.log("🗺️ Map view already active or button not found");
    }
    
    console.log("✅ Scenario Modeling setup complete");
  }

  function setupOwnPath() {
    console.log("🗺️ Setting up Own Path...");
    
    // Close all panels
    const allPanels = [
      document.getElementById('decision-input-panel'),
      document.getElementById('scenario-input-panel'),
      document.getElementById('decision-output-panel'),
      document.getElementById('scenario-output-panel')
    ];
    allPanels.forEach(panel => { 
      if (panel && panel.open) {
        console.log("🔒 Closing panel:", panel.id);
        panel.open = false; 
      }
    });

    // Switch to map view
    const mapBtn = document.getElementById('toggleMapFlowchartMap');
    if (mapBtn && !mapBtn.classList.contains('active')) {
      console.log("🗺️ Switching to map view");
      mapBtn.click();
    } else {
      console.log("🗺️ Map view already active or button not found");
    }
    
    console.log("✅ Own Path setup complete");
  }

  function drawHighlight(target, step) {
    // Create overlay
    overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'rgba(0,0,0,0.1)';
    overlay.style.zIndex = '20000';
    // IMPORTANT: allow user to interact with the app during the tour (hamburger menu, panels, sliders, etc.)
    overlay.style.pointerEvents = 'none';
    document.body.appendChild(overlay);

    // Highlight target (skip for intro step)
    let rect = {left: 0, top: 0, width: 0, height: 0};
    let highlight = null;
    if (!step.isIntro) {
      rect = target.getBoundingClientRect();
      let pad = 0;
     
      highlight = document.createElement('div');
      highlight.style.position = 'fixed';
      highlight.style.left = (rect.left - pad) + 'px';
      highlight.style.top = (rect.top - pad) + 'px';
      highlight.style.width = (rect.width + pad * 2) + 'px';
      highlight.style.height = (rect.height + pad * 2) + 'px';
      highlight.style.border = '3px solid #FFD600';
      highlight.style.borderRadius = '10px';
      highlight.style.boxShadow = '0 0 0 9999px rgba(0,0,0,0.7)';
      highlight.style.zIndex = '20001';
      highlight.style.pointerEvents = 'none';
      document.body.appendChild(highlight);
      overlay.appendChild(highlight);
      
      // Add additional red circle around "Show Map" button for map step
      if (step.target === '#map-container') {
        const mapButton = document.getElementById('toggleMapFlowchartMap');
        if (mapButton) {
          const buttonRect = mapButton.getBoundingClientRect();
          const buttonHighlight = document.createElement('div');
          buttonHighlight.style.position = 'fixed';
          buttonHighlight.style.left = (buttonRect.left - 10) + 'px';
          buttonHighlight.style.top = (buttonRect.top - 10) + 'px';
          buttonHighlight.style.width = (buttonRect.width + 20) + 'px';
          buttonHighlight.style.height = (buttonRect.height + 20) + 'px';
          buttonHighlight.style.border = '3px solid #e74c3c';
          buttonHighlight.style.borderRadius = '50%';
          buttonHighlight.style.zIndex = '20002';
          buttonHighlight.style.pointerEvents = 'none';
          document.body.appendChild(buttonHighlight);
          overlay.appendChild(buttonHighlight);
        }
      }

      if (step.target === '#main-flowchart-container') {
        const flowchartButton = document.getElementById('toggleMapFlowchartFlowchart2');
        if (flowchartButton) {
          const buttonRect = flowchartButton.getBoundingClientRect();
          const buttonHighlight = document.createElement('div');
          buttonHighlight.style.position = 'fixed';
          buttonHighlight.style.left = (buttonRect.left - 10) + 'px';
          buttonHighlight.style.top = (buttonRect.top - 10) + 'px';
          buttonHighlight.style.width = (buttonRect.width + 20) + 'px';
          buttonHighlight.style.height = (buttonRect.height + 20) + 'px';
          buttonHighlight.style.border = '3px solid #e74c3c';
          buttonHighlight.style.borderRadius = '50%';
          buttonHighlight.style.zIndex = '20002';
          buttonHighlight.style.pointerEvents = 'none';
          document.body.appendChild(buttonHighlight);
          overlay.appendChild(buttonHighlight);
        }
      }
    }
  }

  function drawPopup(target, step, stepIdx) {
    // Create popup
    popup = document.createElement('div');
    popup.style.position = 'fixed';
    popup.style.left = '12px';
    popup.style.top = '12px';
    popup.style.background = '#fff';
    popup.style.color = '#222';
    popup.style.border = '2px solid #007cbf';
    popup.style.borderRadius = '8px';
    popup.style.boxShadow = '0 4px 24px rgba(0,0,0,0.2)';
    popup.style.padding = '24px 32px';
    popup.style.zIndex = '20002';
    popup.style.maxWidth = '340px';
    popup.style.fontSize = '16px';
    popup.style.fontFamily = "'Franklin Gothic Book', 'Franklin Gothic', 'Arial Narrow', Arial, sans-serif";
    popup.innerHTML = `<h3 style='margin-top:0;color:#007cbf;'>${step.title}</h3><p>${step.text}</p>`;

    // Prevent overlay click from closing when interacting with popup
    popup.addEventListener('click', (e) => e.stopPropagation());

    // Exit any time: close (×)
    const closeBtn = document.createElement('button');
    closeBtn.setAttribute('aria-label', 'Close tour');
    closeBtn.textContent = '×';
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '8px';
    closeBtn.style.right = '10px';
    closeBtn.style.border = 'none';
    closeBtn.style.background = 'transparent';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontSize = '22px';
    closeBtn.style.lineHeight = '1';
    closeBtn.style.color = '#007cbf';
    closeBtn.onclick = endWalkthrough;
    popup.appendChild(closeBtn);

    // Next/Close/Skip button(s)
    if (step.isIntro) {
      // Skip button
      const skipBtn = document.createElement('button');
      skipBtn.textContent = 'Skip';
      skipBtn.style.marginTop = '18px';
      skipBtn.style.background = '#e74c3c';
      skipBtn.style.color = '#fff';
      skipBtn.style.border = 'none';
      skipBtn.style.borderRadius = '4px';
      skipBtn.style.padding = '8px 20px';
      skipBtn.style.fontSize = '16px';
      skipBtn.style.fontFamily = "'Franklin Gothic Book', 'Franklin Gothic', 'Arial Narrow', Arial, sans-serif";
      skipBtn.style.cursor = 'pointer';
      skipBtn.style.marginRight = '12px';
      skipBtn.onclick = endWalkthrough;
      popup.appendChild(skipBtn);
      // Start button
      const startBtn = document.createElement('button');
      startBtn.textContent = 'Start Tour';
      startBtn.style.marginTop = '18px';
      startBtn.style.background = '#007cbf';
      startBtn.style.color = '#fff';
      startBtn.style.border = 'none';
      startBtn.style.borderRadius = '4px';
      startBtn.style.padding = '8px 20px';
      startBtn.style.fontSize = '16px';
      startBtn.style.fontFamily = "'Franklin Gothic Book', 'Franklin Gothic', 'Arial Narrow', Arial, sans-serif";
      startBtn.style.cursor = 'pointer';
      startBtn.onclick = nextStep;
      popup.appendChild(startBtn);
    } else {
      // Back button (except for first step)
      if (stepIdx > 0) {
        const backBtn = document.createElement('button');
        backBtn.textContent = 'Back';
        backBtn.style.marginTop = '18px';
        backBtn.style.background = '#6c757d';
        backBtn.style.color = '#fff';
        backBtn.style.border = 'none';
        backBtn.style.borderRadius = '4px';
        backBtn.style.padding = '8px 20px';
        backBtn.style.fontSize = '16px';
        backBtn.style.fontFamily = "'Franklin Gothic Book', 'Franklin Gothic', 'Arial Narrow', Arial, sans-serif";
        backBtn.style.cursor = 'pointer';
        backBtn.style.marginRight = '12px';
        backBtn.onclick = previousStep;
        popup.appendChild(backBtn);
      }

      // End tour button (always available)
      const endBtn = document.createElement('button');
      endBtn.textContent = 'End Tour';
      endBtn.style.marginTop = '18px';
      endBtn.style.background = '#e74c3c';
      endBtn.style.color = '#fff';
      endBtn.style.border = 'none';
      endBtn.style.borderRadius = '4px';
      endBtn.style.padding = '8px 20px';
      endBtn.style.fontSize = '16px';
      endBtn.style.fontFamily = "'Franklin Gothic Book', 'Franklin Gothic', 'Arial Narrow', Arial, sans-serif";
      endBtn.style.cursor = 'pointer';
      endBtn.style.marginRight = '12px';
      endBtn.onclick = endWalkthrough;
      popup.appendChild(endBtn);
      
      const btn = document.createElement('button');
      btn.textContent = (stepIdx === steps.length - 1) ? 'Finish' : 'Next';
      btn.style.marginTop = '18px';
      btn.style.background = '#007cbf';
      btn.style.color = '#fff';
      btn.style.border = 'none';
      btn.style.borderRadius = '4px';
      btn.style.padding = '8px 20px';
      btn.style.fontSize = '16px';
      btn.style.fontFamily = "'Franklin Gothic Book', 'Franklin Gothic', 'Arial Narrow', Arial, sans-serif";
      btn.style.cursor = 'pointer';
      btn.onclick = () => {
        if (stepIdx === steps.length - 1) {
          endWalkthrough();
        } else {
          nextStep();
        }
      };
      popup.appendChild(btn);
    }
    document.body.appendChild(popup);
    // After append, clamp to viewport (prevents falling outside the window)
    positionPopup(target, step);
  }

  function nextStep() {
    currentStep++;
    if (currentStep < steps.length) {
      showStep(currentStep);
    } else {
      endWalkthrough();
    }
  }

  function previousStep() {
    currentStep--;
    if (currentStep >= 0) {
      // Close any sections that were opened in the current step before going back
      const currentStepTarget = steps[currentStep + 1]?.target;
      if (currentStepTarget === '#scenario-input-panel') {
        const scenarioPanel = document.getElementById('scenario-input-panel');
        if (scenarioPanel && scenarioPanel.open) {
          scenarioPanel.open = false;
        }
      } else if (currentStepTarget === '#decision-input-panel') {
        const decisionPanel = document.getElementById('decision-input-panel');
        if (decisionPanel && decisionPanel.open) {
          decisionPanel.open = false;
        }
      } else if (currentStepTarget === '#decision-output-panel') {
        const decisionOutputPanel = document.getElementById('decision-output-panel');
        if (decisionOutputPanel && decisionOutputPanel.open) {
          decisionOutputPanel.open = false;
        }
      } else if (currentStepTarget === '#scenario-output-panel') {
        const scenarioOutputPanel = document.getElementById('scenario-output-panel');
        if (scenarioOutputPanel && scenarioOutputPanel.open) {
          scenarioOutputPanel.open = false;
        }
      } else if (currentStepTarget === '#main-flowchart-container') {
        // Switch back to map view if we were on flowchart
        const mapBtn = document.getElementById('toggleMapFlowchartMap');
        if (mapBtn && !mapBtn.classList.contains('active')) {
          mapBtn.click();
        }
      }
      
      showStep(currentStep);
    } else {
      endWalkthrough();
    }
  }

  function endWalkthrough() {
    if (overlay) overlay.remove();
    if (popup) popup.remove();

    // Remove listeners
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler, true);
      keyHandler = null;
    }
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
      resizeHandler = null;
    }
    
    // Only close panels if we're not setting up a specific path
    if (!isSettingUpPath) {
      // Close hamburger menu (if open)
      closeMenu();

      // Close all dropdown sections
      const panels = [
        document.getElementById('decision-input-panel'),
        document.getElementById('scenario-input-panel'),
        document.getElementById('decision-output-panel'),
        document.getElementById('scenario-output-panel')
      ];
      panels.forEach(panel => { if (panel && panel.open) panel.open = false; });

      // Collapse both sidebars back to the default "everything collapsed" state
      setSidebarVisibility({ left: false, right: false });
      
      // Switch to map view if currently on flowchart (only when not setting up a path)
      const mapBtn = document.getElementById('toggleMapFlowchartMap');
      if (mapBtn && !mapBtn.classList.contains('active')) {
        mapBtn.click();
      }
    } else {
      // Reset the flag after a delay
      setTimeout(() => {
        isSettingUpPath = false;
      }, 1000);
    }
  }

  // Exit any time: Esc
  keyHandler = (e) => {
    if (e && e.key === 'Escape') {
      e.preventDefault();
      endWalkthrough();
    }
  };
  document.addEventListener('keydown', keyHandler, true);

  // Keep the popup inside the viewport on resize
  resizeHandler = () => {
    try {
      const step = steps[currentStep];
      const target = document.querySelector(step?.target || 'body');
      if (popup && target && step) positionPopup(target, step);
    } catch (e) {}
  };
  window.addEventListener('resize', resizeHandler);

  // Expose cleanup so a new tour run can safely terminate the previous one
  window.__onboardingTourCleanup = endWalkthrough;

  showStep(currentStep);
}

// 1. Add a helper to inject tooltip CSS if not already present
function injectTooltipCSS() {
  if (document.getElementById('custom-tooltip-style')) return;
  const style = document.createElement('style');
  style.id = 'custom-tooltip-style';
  style.textContent = `
    .custom-tooltip {
      position: fixed;
      z-index: 9999;
      background: #222;
      color: #fff;
      padding: 7px 14px;
      border-radius: 6px;
      font-size: 15px;
      font-family: 'Franklin Gothic Book', 'Franklin Gothic', 'Arial Narrow', Arial, sans-serif;
      pointer-events: none;
      box-shadow: 0 1px 4px rgba(0,0,0,0.15);
      white-space: nowrap;
      opacity: 0.97;
      transition: opacity 0.1s;
    }
  `;
  document.head.appendChild(style);
}

// 2. Add a function to handle custom tooltips for dollar sign buttons
function setupDollarSignTooltips() {
  injectTooltipCSS();
  // Remove any previous listeners to avoid duplicates
  const container = document.getElementById('investmentsTableContainer');
  if (!container) return;
  let tooltip = null;

  container.addEventListener('mouseover', function(e) {
    const target = e.target.closest('.dollar-sign-tooltip');
    if (target && target.dataset.tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'custom-tooltip';
      tooltip.textContent = target.dataset.tooltip;
      document.body.appendChild(tooltip);
      // Position tooltip near mouse
      const move = (evt) => {
        tooltip.style.left = (evt.clientX + 12) + 'px';
        tooltip.style.top = (evt.clientY + 12) + 'px';
      };
      move(e);
      document.addEventListener('mousemove', move);
      target._moveHandler = move;
    }
  });
  container.addEventListener('mouseout', function(e) {
    const target = e.target.closest('.dollar-sign-tooltip');
    if (target && tooltip) {
      document.body.removeChild(tooltip);
      tooltip = null;
      if (target._moveHandler) {
        document.removeEventListener('mousemove', target._moveHandler);
        target._moveHandler = null;
      }
    }
  });
  // Remove tooltip on click as well
  container.addEventListener('click', function(e) {
    const target = e.target.closest('.dollar-sign-tooltip');
    if (target && tooltip) {
      document.body.removeChild(tooltip);
      tooltip = null;
      if (target._moveHandler) {
        document.removeEventListener('mousemove', target._moveHandler);
        target._moveHandler = null;
      }
    }
  });
}

// ✅ Global close for all help tooltips (question mark textboxes)
document.addEventListener('DOMContentLoaded', function() {
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('close-tooltip-btn')) {
      // Find the parent tooltip/span and hide it
      const tooltip = e.target.parentElement;
      if (tooltip && (tooltip.classList.contains('tooltip') || tooltip.classList.contains('draggable-tooltip') || tooltip.id.endsWith('-help-tooltip'))) {
        tooltip.style.display = 'none';
      }
    }
  });
});

// ✅ Prevent <details> toggle when clicking help icon or tooltip in summary
// This ensures only clicks on the summary text toggle the section

document.addEventListener('DOMContentLoaded', function() {
  // Prevent toggle when clicking help icon
  document.querySelectorAll('.help-icon').forEach(function(icon) {
    icon.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
    });
  });
  // Prevent toggle when clicking inside any help tooltip
  document.querySelectorAll('.tooltip').forEach(function(tooltip) {
    tooltip.addEventListener('click', function(e) {
      e.stopPropagation();
    });
  });
});

// === HELP TOOLTIP LOGIC: Move tooltips to body and position absolutely ===
document.addEventListener('DOMContentLoaded', function() {
  const helpTooltips = [
    { icon: 'decision-help-icon', tooltip: 'decision-help-tooltip' },
    { icon: 'scenario-help-icon', tooltip: 'scenario-help-tooltip' },
    { icon: 'decision-results-help-icon', tooltip: 'decision-results-help-tooltip' },
    { icon: 'model-output-help-icon', tooltip: 'model-output-help-tooltip' },
    { icon: 'flowchart-help-icon', tooltip: 'flowchart-help-tooltip' },
  ];
  helpTooltips.forEach(({icon, tooltip}) => {
    const iconEl = document.getElementById(icon);
    const tooltipEl = document.getElementById(tooltip);
    if (!iconEl || !tooltipEl) return;
    // Always hide initially
    tooltipEl.style.display = 'none';
    // On click, move to body, position, and show
    iconEl.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      // Move tooltip to body if not already
      if (tooltipEl.parentElement !== document.body) {
        document.body.appendChild(tooltipEl);
      }
      
      // Position near the icon with smart positioning
      const rect = iconEl.getBoundingClientRect();
      const tooltipWidth = 300; // Approximate tooltip width
      const margin = 10;
      
      tooltipEl.style.position = 'fixed';
      tooltipEl.style.zIndex = 10000;
      tooltipEl.style.display = 'block';
      
      // Check if positioning to the right would go off-screen
      const rightPosition = rect.right + margin;
      const leftPosition = rect.left - tooltipWidth - margin;
      
      if (rightPosition + tooltipWidth > window.innerWidth) {
        // Position to the left if right would go off-screen
        tooltipEl.style.left = Math.max(margin, leftPosition) + 'px';
        tooltipEl.style.right = 'auto';
      } else {
        // Position to the right (default behavior)
        tooltipEl.style.left = rightPosition + 'px';
        tooltipEl.style.right = 'auto';
      }
      
      // Vertical positioning
      tooltipEl.style.top = (rect.top - 10) + 'px';
    });
    // Hide on click outside
    document.addEventListener('mousedown', function(e) {
      if (tooltipEl.style.display === 'block' && !tooltipEl.contains(e.target) && e.target !== iconEl) {
        tooltipEl.style.display = 'none';
      }
    });
    // Hide on close button (handled by markup)
    // Prevent <details> toggle when clicking help icon or tooltip
    iconEl.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); });
    tooltipEl.addEventListener('click', function(e) { e.stopPropagation(); });
  });
});

// === START TOUR BUTTON LOGIC ===
document.addEventListener('DOMContentLoaded', function() {
  const startTourBtn = document.getElementById('startTourBtn');
  if (startTourBtn) {
    startTourBtn.addEventListener('click', function() {
      startOnboardingWalkthrough();
    });
  }
});

document.addEventListener('DOMContentLoaded', function() {
  // ... existing help icon logic ...

  // Map toggle help icon logic
  var mapToggleHelpIcon = document.getElementById('map-toggle-help-icon');
  var mapToggleHelpTooltip = document.getElementById('map-toggle-help-tooltip');
  if (mapToggleHelpIcon && mapToggleHelpTooltip) {
    mapToggleHelpIcon.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (mapToggleHelpTooltip.style.display === 'none' || mapToggleHelpTooltip.style.display === '') {
        mapToggleHelpTooltip.style.display = 'block';
      } else {
        mapToggleHelpTooltip.style.display = 'none';
      }
    });
    document.addEventListener('click', function(e) {
      if (mapToggleHelpTooltip.style.display === 'block' && !mapToggleHelpTooltip.contains(e.target) && e.target !== mapToggleHelpIcon) {
        mapToggleHelpTooltip.style.display = 'none';
      }
    });
    // Make the tooltip draggable
    mapToggleHelpTooltip.classList.add('draggable-tooltip');
    let isMouseDown = false, offset = [0, 0];
    mapToggleHelpTooltip.addEventListener('mousedown', function(e) {
      isMouseDown = true;
      offset = [
        mapToggleHelpTooltip.offsetLeft - e.clientX,
        mapToggleHelpTooltip.offsetTop - e.clientY
      ];
      mapToggleHelpTooltip.style.cursor = 'move';
      e.preventDefault();
    }, true);
    document.addEventListener('mouseup', function() {
      isMouseDown = false;
      mapToggleHelpTooltip.style.cursor = '';
    }, true);
    document.addEventListener('mousemove', function(e) {
      if (!isMouseDown) return;
      mapToggleHelpTooltip.style.left = (e.clientX + offset[0]) + 'px';
      mapToggleHelpTooltip.style.top = (e.clientY + offset[1]) + 'px';
      mapToggleHelpTooltip.style.right = 'auto';
      mapToggleHelpTooltip.style.bottom = 'auto';
    }, true);
  }

  // Summary Table help icon logic
  var summaryTableHelpIcon = document.getElementById('summary-table-help-icon');
  var summaryTableHelpTooltip = document.getElementById('summary-table-help-tooltip');
  if (summaryTableHelpIcon && summaryTableHelpTooltip) {
    summaryTableHelpTooltip.classList.add('draggable-tooltip');
    summaryTableHelpIcon.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (summaryTableHelpTooltip.style.display === 'none' || summaryTableHelpTooltip.style.display === '') {
        summaryTableHelpTooltip.style.display = 'block';
      } else {
        summaryTableHelpTooltip.style.display = 'none';
      }
    });
    document.addEventListener('click', function(e) {
      if (summaryTableHelpTooltip.style.display === 'block' && !summaryTableHelpTooltip.contains(e.target) && e.target !== summaryTableHelpIcon) {
        summaryTableHelpTooltip.style.display = 'none';
      }
    });
    // Draggable logic
    let isMouseDown = false, offset = [0, 0];
    summaryTableHelpTooltip.addEventListener('mousedown', function(e) {
      isMouseDown = true;
      offset = [
        summaryTableHelpTooltip.offsetLeft - e.clientX,
        summaryTableHelpTooltip.offsetTop - e.clientY
      ];
      summaryTableHelpTooltip.style.cursor = 'move';
      e.preventDefault();
    }, true);
    document.addEventListener('mouseup', function() {
      isMouseDown = false;
      summaryTableHelpTooltip.style.cursor = '';
    }, true);
    document.addEventListener('mousemove', function(e) {
      if (!isMouseDown) return;
      summaryTableHelpTooltip.style.left = (e.clientX + offset[0]) + 'px';
      summaryTableHelpTooltip.style.top = (e.clientY + offset[1]) + 'px';
      summaryTableHelpTooltip.style.right = 'auto';
    }, true);
  }

  // Decision by School help icon logic (now outside details)
  var decisionBySchoolHelpIcon = document.getElementById('decision-by-school-help-icon');
  var decisionBySchoolHelpTooltip = document.getElementById('decision-by-school-help-tooltip');
  if (decisionBySchoolHelpIcon && decisionBySchoolHelpTooltip) {
    decisionBySchoolHelpIcon.style.cursor = 'pointer';
    decisionBySchoolHelpTooltip.classList.add('draggable-tooltip');
    decisionBySchoolHelpIcon.addEventListener('click', function(e) {
      console.log('Decision by School help icon clicked');
      e.preventDefault();
      e.stopPropagation();
      if (decisionBySchoolHelpTooltip.style.display === 'none' || decisionBySchoolHelpTooltip.style.display === '') {
        decisionBySchoolHelpTooltip.style.display = 'block';
      } else {
        decisionBySchoolHelpTooltip.style.display = 'none';
      }
    });
    document.addEventListener('click', function(e) {
      if (decisionBySchoolHelpTooltip.style.display === 'block' && !decisionBySchoolHelpTooltip.contains(e.target) && e.target !== decisionBySchoolHelpIcon) {
        decisionBySchoolHelpTooltip.style.display = 'none';
      }
    });
    // Draggable logic
    let isMouseDown2 = false, offset2 = [0, 0];
    decisionBySchoolHelpTooltip.addEventListener('mousedown', function(e) {
      isMouseDown2 = true;
      offset2 = [
        decisionBySchoolHelpTooltip.offsetLeft - e.clientX,
        decisionBySchoolHelpTooltip.offsetTop - e.clientY
      ];
      decisionBySchoolHelpTooltip.style.cursor = 'move';
      e.preventDefault();
    }, true);
    document.addEventListener('mouseup', function() {
      isMouseDown2 = false;
      decisionBySchoolHelpTooltip.style.cursor = '';
    }, true);
    document.addEventListener('mousemove', function(e) {
      if (!isMouseDown2) return;
      decisionBySchoolHelpTooltip.style.left = (e.clientX + offset2[0]) + 'px';
      decisionBySchoolHelpTooltip.style.top = (e.clientY + offset2[1]) + 'px';
      decisionBySchoolHelpTooltip.style.right = 'auto';
    }, true);
  }

  // ✅ Sidebar Resizer Functionality
  function setupSidebarResizers() {
    const leftSidebar = document.getElementById('sidebar');
    const rightSidebar = document.getElementById('map-sidebar');
    const leftResizer = document.getElementById('left-sidebar-resizer');
    const rightResizer = document.getElementById('right-sidebar-resizer');
    const mapContainer = document.getElementById('map-container');

    if (!leftSidebar || !rightSidebar || !leftResizer || !rightResizer) {
      console.warn('⚠️ Sidebar resizers not found');
      return;
    }

    // Setup ResizeObserver for map container to automatically resize map
    if (mapContainer && window.ResizeObserver) {
      let lastWidth = mapContainer.offsetWidth;
      let lastHeight = mapContainer.offsetHeight;
      let isAdjustingZoom = false; // Prevent recursive adjustments
      
      const resizeObserver = new ResizeObserver((entries) => {
        if (window.map && window.map.resize && !isAdjustingZoom) {
          const entry = entries[0];
          const newWidth = entry.contentRect.width;
          const newHeight = entry.contentRect.height;
          
          // Only adjust if size actually changed significantly (more than 1px)
          if (Math.abs(newWidth - lastWidth) > 1 || Math.abs(newHeight - lastHeight) > 1) {
            isAdjustingZoom = true;
            
            // Get current bounds before resize (as array format)
            const bounds = window.map.getBounds();
            const boundsArray = [
              [bounds.getWest(), bounds.getSouth()],
              [bounds.getEast(), bounds.getNorth()]
            ];
            
            // Resize the map first
            window.map.resize();
            
            // Then fit to the same bounds to maintain geographic extent
            // Use a small delay to ensure resize has taken effect
            setTimeout(() => {
              if (window.map) {
                // Fit to the same bounds - this will auto-adjust zoom
                window.map.fitBounds(boundsArray, {
                  padding: 0,
                  duration: 0 // Instant adjustment
                });
                
                lastWidth = newWidth;
                lastHeight = newHeight;
                
                // Reset flag after a short delay
                setTimeout(() => {
                  isAdjustingZoom = false;
                }, 50);
              }
            }, 10);
          }
        }
      });
      resizeObserver.observe(mapContainer);
      console.log('✅ ResizeObserver set up for map container');
    }

    // Load saved widths from localStorage
    const savedLeftWidth = localStorage.getItem('leftSidebarWidth');
    const savedRightWidth = localStorage.getItem('rightSidebarWidth');
    
    if (savedLeftWidth) {
      leftSidebar.style.flex = `0 0 ${savedLeftWidth}px`;
    }
    if (savedRightWidth) {
      rightSidebar.style.flex = `0 0 ${savedRightWidth}px`;
    }

    // Left sidebar resizer (between left sidebar and map container)
    let isResizingLeft = false;
    let startXLeft = 0;
    let startWidthLeft = 0;

    leftResizer.addEventListener('mousedown', (e) => {
      isResizingLeft = true;
      startXLeft = e.clientX;
      startWidthLeft = leftSidebar.offsetWidth;
      leftResizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
      e.stopPropagation();
    });

    // Right sidebar resizer (between map container and right sidebar)
    let isResizingRight = false;
    let startXRight = 0;
    let startWidthRight = 0;

    rightResizer.addEventListener('mousedown', (e) => {
      isResizingRight = true;
      startXRight = e.clientX;
      startWidthRight = rightSidebar.offsetWidth;
      rightResizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
      e.stopPropagation();
    });

    document.addEventListener('mousemove', (e) => {
      if (isResizingLeft) {
        const diff = e.clientX - startXLeft; // Positive when dragging right
        const newWidth = Math.max(250, Math.min(window.innerWidth * 0.6, startWidthLeft + diff));
        
        // Store current map state before resize (only once at start)
        if (!isResizingLeft._mapState) {
          isResizingLeft._mapState = {
            bounds: window.map ? window.map.getBounds() : null,
            containerWidth: mapContainer.offsetWidth
          };
        }
        
        leftSidebar.style.flex = `0 0 ${newWidth}px`;
        
        // Trigger map resize during drag with zoom adjustment
        if (window.map && window.map.resize && isResizingLeft._mapState.bounds) {
          // Use a throttled approach - only update every few frames
          if (!isResizingLeft._updatePending) {
            isResizingLeft._updatePending = true;
            requestAnimationFrame(() => {
              const containerWidthAfter = mapContainer.offsetWidth;
              const containerWidthBefore = isResizingLeft._mapState.containerWidth;
              
              if (containerWidthBefore > 0 && Math.abs(containerWidthAfter - containerWidthBefore) > 1) {
                // Get bounds as array format for fitBounds
                const bounds = isResizingLeft._mapState.bounds;
                const boundsArray = [
                  [bounds.getWest(), bounds.getSouth()],
                  [bounds.getEast(), bounds.getNorth()]
                ];
                
                // Resize first
                window.map.resize();
                
                // Then fit to same bounds to maintain geographic extent
                // Use a small timeout to ensure resize has taken effect
                setTimeout(() => {
                  if (window.map) {
                    window.map.fitBounds(boundsArray, {
                      padding: 0,
                      duration: 0 // Instant during drag
                    });
                  }
                  isResizingLeft._updatePending = false;
                }, 10);
              } else {
                window.map.resize();
                isResizingLeft._updatePending = false;
              }
            });
          }
        }
      }
      
      if (isResizingRight) {
        const diff = startXRight - e.clientX; // Positive when dragging left (shrinking right sidebar)
        const newWidth = Math.max(250, Math.min(window.innerWidth * 0.6, startWidthRight + diff));
        
        // Store current map state before resize (only once at start)
        if (!isResizingRight._mapState) {
          isResizingRight._mapState = {
            bounds: window.map ? window.map.getBounds() : null,
            containerWidth: mapContainer.offsetWidth
          };
        }
        
        // Force layout update by reading offsetWidth first
        rightSidebar.offsetWidth;
        
        // Update flex property
        rightSidebar.style.flex = `0 0 ${newWidth}px`;
        rightSidebar.style.flexShrink = '0';
        rightSidebar.style.flexGrow = '0';
        
        // Force reflow to ensure layout updates
        mapContainer.offsetWidth;
        
        // Trigger map resize during drag with zoom adjustment
        if (window.map && window.map.resize && isResizingRight._mapState && isResizingRight._mapState.bounds) {
          // Use a throttled approach - only update every few frames
          if (!isResizingRight._updatePending) {
            isResizingRight._updatePending = true;
            requestAnimationFrame(() => {
              const containerWidthAfter = mapContainer.offsetWidth;
              const containerWidthBefore = isResizingRight._mapState.containerWidth;
              
              if (containerWidthBefore > 0 && Math.abs(containerWidthAfter - containerWidthBefore) > 1) {
                // Get bounds as array format for fitBounds
                const bounds = isResizingRight._mapState.bounds;
                const boundsArray = [
                  [bounds.getWest(), bounds.getSouth()],
                  [bounds.getEast(), bounds.getNorth()]
                ];
                
                // Resize first
                window.map.resize();
                
                // Then fit to same bounds to maintain geographic extent
                // Use a small timeout to ensure resize has taken effect
                setTimeout(() => {
                  if (window.map) {
                    window.map.fitBounds(boundsArray, {
                      padding: 0,
                      duration: 0 // Instant during drag
                    });
                  }
                  isResizingRight._updatePending = false;
                }, 10);
              } else {
                window.map.resize();
                isResizingRight._updatePending = false;
              }
            });
          }
        }
      }
    });

    document.addEventListener('mouseup', () => {
      // Capture whether a resize was in progress before we reset the flags
      const didResize = isResizingLeft || isResizingRight;

      if (isResizingLeft) {
        // Clean up any stored drag state
        if (isResizingLeft._mapState) {
          delete isResizingLeft._mapState;
          delete isResizingLeft._updatePending;
        }
        
        isResizingLeft = false;
        leftResizer.classList.remove('dragging');
        const currentWidth = leftSidebar.offsetWidth;
        localStorage.setItem('leftSidebarWidth', currentWidth);
      }
      
      if (isResizingRight) {
        // Clean up any stored drag state
        if (isResizingRight._mapState) {
          delete isResizingRight._mapState;
          delete isResizingRight._updatePending;
        }
        
        isResizingRight = false;
        rightResizer.classList.remove('dragging');
        const currentWidth = rightSidebar.offsetWidth;
        localStorage.setItem('rightSidebarWidth', currentWidth);
      }
      
      // After either sidebar resize is completed, automatically refit the map
      // to show all schools, mirroring the "Fit to All Schools" button.
      if (didResize && typeof window.fitMapToAllSchools === 'function') {
        setTimeout(() => {
          try {
            window.fitMapToAllSchools();
          } catch (e) {
            console.error("❌ Error auto-fitting map after sidebar resize:", e);
          }
        }, 50);
      } else if (didResize && window.map) {
        // Fallback: at least trigger a resize so symbols stay circular
        try {
          window.map.resize();
        } catch (e) {
          console.error("❌ Error resizing map after sidebar resize:", e);
        }
      }
      
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  }

  // Initialize resizers when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupSidebarResizers);
  } else {
    setupSidebarResizers();
  }
});

// --- Global fallback map/flowchart toggle functions ---
// In some browsers/extensions, the Mapbox 'load' handler may not complete,
// which can prevent the in-handler definitions of window.switchToFlowchart /
// window.switchToMap from being created. These lightweight fallbacks ensure
// the buttons remain clickable and at least toggle the views.
if (typeof window.switchToFlowchart !== 'function') {
  window.switchToFlowchart = function() {
    const flowchartContainer = document.getElementById('main-flowchart-container');
    const mapContainer = document.getElementById('map-container');

    if (flowchartContainer) flowchartContainer.style.display = 'flex';
    if (mapContainer) mapContainer.style.display = 'none';

    // If the main flowchart SVG has never been initialized, do it now
    if (!window.flowchartInitialized &&
        typeof window.initializeFlowchartFromScript === 'function' &&
        typeof d3 !== 'undefined') {
      try {
        const svgElem = document.getElementById('main-flowchart-svg');
        if (svgElem) {
          console.log('🎯 Fallback initializing flowchart via initializeFlowchartFromScript');
          const svgSelection = d3.select(svgElem);
          window.initializeFlowchartFromScript(svgSelection);
          window.flowchartInitialized = true;
        } else {
          console.warn('⚠️ main-flowchart-svg element not found for fallback initialization');
        }
      } catch (e) {
        console.error('❌ Error during fallback flowchart initialization:', e);
      }
    }
  };
}

if (typeof window.switchToMap !== 'function') {
  window.switchToMap = function() {
    const flowchartContainer = document.getElementById('main-flowchart-container');
    const mapContainer = document.getElementById('map-container');

    if (flowchartContainer) flowchartContainer.style.display = 'none';
    if (mapContainer) mapContainer.style.display = 'block';

    if (window.map && typeof window.map.resize === 'function') {
      setTimeout(() => {
        try {
          window.map.resize();
        } catch (e) {
          console.error("❌ Error resizing map in fallback switchToMap:", e);
        }
      }, 100);
    }
  };
}

// --- Process Steps stripe (Step 1–4) ---
// Declarative mapping between process steps and UI panels.
(function initProcessStepsStripe() {
  function setActiveStep(stepNum) {
    const nav = document.getElementById('process-steps');
    if (!nav) return;
    nav.querySelectorAll('.process-step').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.step === String(stepNum));
    });
  }

  function setMainView(mode) {
    const step1View = document.getElementById('step1-school-view');
    const mapContainer = document.getElementById('map-container');
    const flowchartContainer = document.getElementById('main-flowchart-container');

    if (step1View) step1View.style.display = (mode === 'step1') ? 'block' : 'none';
    if (mapContainer) mapContainer.style.display = (mode === 'map') ? 'block' : 'none';
    if (flowchartContainer) flowchartContainer.style.display = (mode === 'flowchart') ? 'flex' : 'none';

    if (mode === 'map' && window.map && typeof window.map.resize === 'function') {
      setTimeout(() => {
        try { window.map.resize(); } catch {}
      }, 100);
    }
  }

  function setStepPanelsVisibility(stepNum) {
    const decisionInput = document.getElementById('decision-input-panel');
    const decisionOutput = document.getElementById('decision-output-panel');
    const scenarioInput = document.getElementById('scenario-input-panel');
    const scenarioOutput = document.getElementById('scenario-output-panel');

    const hideScenario = Number(stepNum) === 3; // Step 3 = Strategic Sorting (hide prioritization + model outputs)
    const hideDecision = Number(stepNum) === 4; // Step 4 = Prioritize (hide strategic sorting inputs + results)

    function applyHidden(el, hidden) {
      if (!el) return;
      el.hidden = !!hidden;
      if (hidden) {
        try { el.open = false; } catch {}
      }
    }

    applyHidden(scenarioInput, hideScenario);
    applyHidden(scenarioOutput, hideScenario);
    applyHidden(decisionInput, hideDecision);
    applyHidden(decisionOutput, hideDecision);
  }

  function ensurePanelsVisible({ left, right } = {}) {
    const body = document.body;
    const leftToggle = document.getElementById('toggleLeftSidebar');
    const rightToggle = document.getElementById('toggleRightSidebar');
    if (typeof left === 'boolean') {
      if (left) body.classList.remove('sidebar-collapsed');
      else body.classList.add('sidebar-collapsed');
      if (leftToggle) leftToggle.checked = left;
    }
    if (typeof right === 'boolean') {
      if (right) body.classList.remove('right-sidebar-collapsed');
      else body.classList.add('right-sidebar-collapsed');
      if (rightToggle) rightToggle.checked = right;
    }
  }

  function openDetails(id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.hidden) return;
    try { el.open = true; } catch {}
    try {
      // Only account for the top brand bar; process steps live at the bottom now.
      const offset = (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--brand-bar-height') || '52', 10) || 52);
      const y = el.getBoundingClientRect().top + window.scrollY - offset - 12;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    } catch {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function goToStep(stepNum) {
    setStepPanelsVisibility(stepNum);
    switch (Number(stepNum)) {
      case 1:
        // Step 1 is a dedicated school-level view: no map, no side panels.
        ensurePanelsVisible({ left: false, right: false });
        setMainView('step1');
        break;
      case 2:
        // Step 2 is map exploration: hide both side panels.
        ensurePanelsVisible({ left: false, right: false });
        setMainView('map');
        break;
      case 3:
        ensurePanelsVisible({ left: true, right: true });
        setMainView('map');
        openDetails('decision-output-panel');
        break;
      case 4:
        ensurePanelsVisible({ left: true, right: true });
        setMainView('map');
        openDetails('scenario-output-panel');
        break;
      default:
        break;
    }
    setActiveStep(stepNum);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const nav = document.getElementById('process-steps');
    if (!nav) return;

    // Click handlers
    nav.querySelectorAll('.process-step').forEach((btn) => {
      btn.addEventListener('click', () => goToStep(btn.dataset.step));
    });

    // Auto-highlight based on panel toggles (user navigation)
    const stepMap = [
      { id: 'decision-input-panel', step: 1 },
      { id: 'decision-output-panel', step: 3 },
      { id: 'scenario-output-panel', step: 4 },
    ];
    stepMap.forEach(({ id, step }) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('toggle', () => {
        if (el.open && !el.hidden) setActiveStep(step);
      });
    });

    // Default to Step 2 (map) on landing
    setActiveStep(2);
    setStepPanelsVisibility(2);
    // Step 2 should be map-only by default.
    ensurePanelsVisible({ left: false, right: false });
    setMainView('map');
  });
})();

// --- Step 1: School-level data view (no map) ---
(function initStep1SchoolView() {
  function norm(s) {
    return String(s || '').trim().toLowerCase();
  }

  function parseNumber(v) {
    if (v === null || typeof v === 'undefined') return null;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const s = String(v).trim();
    if (!s) return null;
    // Remove commas and percent signs (we'll infer percent by column name elsewhere)
    const cleaned = s.replace(/,/g, '').replace(/%/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  // BuildingScore may be stored either on a 0–1 scale (e.g. 0.62)
  // or a 0–10 scale (e.g. 6.20). Normalize to 0–10 for dashboard logic.
  function coerceBuildingScore0to10(raw) {
    const n = parseNumber(raw);
    if (!Number.isFinite(n)) return null;
    return n <= 1.5 ? n * 10 : n;
  }

  function clamp(n, a, b) {
    if (!Number.isFinite(n)) return a;
    return Math.min(b, Math.max(a, n));
  }

  function fmtInt(n) {
    if (!Number.isFinite(n)) return '';
    return Math.round(n).toLocaleString();
  }

  function fmtPctFromUnit(n) {
    if (!Number.isFinite(n)) return '';
    return `${(n * 100).toFixed(1)}%`;
  }

  function fmtPct(n) {
    if (!Number.isFinite(n)) return '';
    return `${n.toFixed(1)}%`;
  }

  function htmlEscape(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getSchoolName(row) {
    return row && (row['Building Name'] || row['SchoolName'] || row['School Name'] || row['School'] || row['Name']);
  }

  function getDecisionSchoolRows() {
    const rows = window.decisionLogic && Array.isArray(window.decisionLogic.schoolData) ? window.decisionLogic.schoolData : [];
    return rows;
  }

  function renderSchoolRow(row, filterText, showEmpty) {
    const heading = document.getElementById('step1SchoolNameHeading');
    const badgesWrap = document.getElementById('step1SchoolBadges');
    const kpiGrid = document.getElementById('step1KpiGrid');
    const compareMode = document.getElementById('step1CompareMode');
    const compareSelects = document.getElementById('step1CompareSelects');
    const compare1 = document.getElementById('step1CompareSchoolSelect1');
    const compare2 = document.getElementById('step1CompareSchoolSelect2');
    const compareSection = document.getElementById('step1CompareSection');
    const compareGrid = document.getElementById('step1CompareGrid');
    const singleSection = document.getElementById('step1SingleSection');
    if (!row) return;

    const q = norm(filterText);
    const showEmptyMetrics = !!showEmpty;

    const name = getSchoolName(row) || 'Selected school';
    if (heading) heading.textContent = String(name);

    function buildBadges(r, includeDecision) {
      const status = r['Status'] || r['status'] || '';
      const level = r['School Level'] || r['School level'] || r['SchoolLevel'] || '';
      const includeFlow = r['Include_Flow_Chart'] || r['Include Flow Chart'] || '';
      const decision = r['decision'] || r['Decision'] || '';
      const flow = r['flow'] || r['Flow'] || '';

      const statusNorm = norm(status);
      const statusClass = statusNorm === 'active' ? 'good' : (statusNorm === 'closed' ? 'bad' : '');
      const includeNorm = norm(includeFlow);

      const badges = [];
      if (status) badges.push(`<span class="step1-badge ${statusClass}">${htmlEscape(status)}</span>`);
      if (level) badges.push(`<span class="step1-badge">${htmlEscape(level)}</span>`);
      if (includeFlow) badges.push(`<span class="step1-badge">${includeNorm === 'yes' ? 'Included in flowchart' : 'Not in flowchart'}</span>`);
      if (includeDecision && decision) badges.push(`<span class="step1-badge">${htmlEscape(decision)}</span>`);
      if (includeDecision && flow !== '' && flow !== null && typeof flow !== 'undefined') badges.push(`<span class="step1-badge">Flow ${htmlEscape(flow)}</span>`);
      return badges.join('');
    }

    // KPI tiles (only render if values exist)
    function buildKpiTiles(r) {
      const enrollment = parseNumber(r['Enrollment']);
      const capacity = parseNumber(r['Capacity']);
      const seats = parseNumber(r['Available Seats']);
      const util = parseNumber(r['Utilization']); // 0..1
      const buildingScore = coerceBuildingScore0to10(r['BuildingScore']); // 0..10
      const eduAdeq = parseNumber(r['EducationalAdequacy']); // 0..1
      const attArea = parseNumber(r['AttendanceAreaEnrollment']); // 0..100
      const growth = parseNumber(r['Future_EnrollmentGrowth']); // unit or percent
      const distance = parseNumber(r['DistanceUnderutilizedschools']); // miles
      const sqft = parseNumber(r[' SquareFt '] || r['SquareFt'] || r['SquareFt ']);

      function kpiCard({ label, value, sub, barW, barC }) {
        if (!showEmptyMetrics && (!value || String(value).trim() === '')) return '';
        if (q && !norm(label).includes(q) && !norm(value).includes(q) && !norm(sub || '').includes(q)) return '';

        const v = htmlEscape(value);
        const s = sub ? `<div class="step1-kpi-sub">${htmlEscape(sub)}</div>` : `<div class="step1-kpi-sub">&nbsp;</div>`;
        const bar = (typeof barW === 'number')
          ? `<div class="step1-bar" style="--w:${clamp(barW, 0, 100)}%; --c:${barC || '#007cbf'}"><span></span></div>`
          : `<div class="step1-bar" style="--w:0%; --c:#e5e7eb"><span></span></div>`;
        return `<div class="step1-kpi">
          <div class="step1-kpi-label">${htmlEscape(label)}</div>
          <div class="step1-kpi-value">${v || '&nbsp;'}</div>
          ${s}
          ${bar}
        </div>`;
      }

      const cards = [];
      if (Number.isFinite(util)) {
        const pct = util * 100;
        const color = pct >= 95 ? '#dc2626' : (pct >= 85 ? '#f59e0b' : '#16a34a');
        cards.push(kpiCard({ label: 'Utilization', value: fmtPct(pct), sub: (Number.isFinite(enrollment) && Number.isFinite(capacity) && capacity > 0) ? `${fmtInt(enrollment)} / ${fmtInt(capacity)} students` : '', barW: pct, barC: color }));
      } else {
        cards.push(kpiCard({ label: 'Utilization', value: '', sub: '', barW: null, barC: null }));
      }
      cards.push(kpiCard({ label: 'Enrollment', value: Number.isFinite(enrollment) ? fmtInt(enrollment) : '', sub: 'Students', barW: null }));
      cards.push(kpiCard({ label: 'Capacity', value: Number.isFinite(capacity) ? fmtInt(capacity) : '', sub: 'Seats', barW: null }));
      if (Number.isFinite(seats)) {
        const color = seats < 0 ? '#dc2626' : (seats < 25 ? '#f59e0b' : '#16a34a');
        cards.push(kpiCard({ label: 'Available Seats', value: fmtInt(seats), sub: seats < 0 ? 'Over capacity' : 'Available', barW: null, barC: color }));
      } else {
        cards.push(kpiCard({ label: 'Available Seats', value: '', sub: '', barW: null }));
      }
      if (Number.isFinite(buildingScore)) {
        const pct = clamp((buildingScore / 10) * 100, 0, 100);
        const color = pct >= 70 ? '#16a34a' : (pct >= 45 ? '#f59e0b' : '#dc2626');
        cards.push(kpiCard({ label: 'Building Score', value: `${buildingScore.toFixed(2)}/10`, sub: '', barW: pct, barC: color }));
      } else {
        cards.push(kpiCard({ label: 'Building Score', value: '', sub: '', barW: null }));
      }
      if (Number.isFinite(eduAdeq)) {
        const pct = clamp(eduAdeq * 100, 0, 100);
        const color = pct >= 70 ? '#16a34a' : (pct >= 45 ? '#f59e0b' : '#dc2626');
        cards.push(kpiCard({ label: 'Educational Adequacy', value: fmtPct(pct), sub: '', barW: pct, barC: color }));
      } else {
        cards.push(kpiCard({ label: 'Educational Adequacy', value: '', sub: '', barW: null }));
      }
      if (Number.isFinite(attArea)) {
        const pct = clamp(attArea, 0, 100);
        const color = pct >= 90 ? '#dc2626' : (pct >= 80 ? '#f59e0b' : '#16a34a');
        cards.push(kpiCard({ label: 'Attendance Area Enroll.', value: fmtPct(pct), sub: '', barW: pct, barC: color }));
      } else {
        cards.push(kpiCard({ label: 'Attendance Area Enroll.', value: '', sub: '', barW: null }));
      }
      if (Number.isFinite(growth)) {
        const pct = (growth >= -1 && growth <= 1) ? growth * 100 : growth;
        const color = pct >= 5 ? '#16a34a' : (pct <= -5 ? '#dc2626' : '#64748b');
        cards.push(kpiCard({ label: 'Future Enrollment Growth', value: fmtPct(pct), sub: '', barW: clamp(Math.abs(pct), 0, 100), barC: color }));
      } else {
        cards.push(kpiCard({ label: 'Future Enrollment Growth', value: '', sub: '', barW: null }));
      }
      cards.push(kpiCard({ label: 'Distance to Underutilized', value: Number.isFinite(distance) ? `${distance.toFixed(1)} mi` : '', sub: '', barW: null }));
      cards.push(kpiCard({ label: 'Square Feet', value: Number.isFinite(sqft) ? fmtInt(sqft) : '', sub: 'Sq ft', barW: null }));

      return cards.filter(Boolean).join('');
    }

    function metricRow({ label, value, sub, barW, barC }) {
      if (!showEmptyMetrics && (!value || String(value).trim() === '')) return '';
      if (q && !norm(label).includes(q) && !norm(value).includes(q) && !norm(sub || '').includes(q)) return '';
      const bar = (typeof barW === 'number')
        ? `<div class="step1-bar" style="--w:${clamp(barW, 0, 100)}%; --c:${barC || '#007cbf'}"><span></span></div>`
        : ``;
      const subHtml = sub ? `<div class="step1-metric-sub">${htmlEscape(sub)}</div>` : ``;
      return `<div class="step1-metric">
        <div class="step1-metric-row">
          <div class="step1-metric-label">${htmlEscape(label)}</div>
          <div class="step1-metric-value">${htmlEscape(value)}</div>
        </div>
        ${subHtml}
        ${bar}
      </div>`;
    }

    // Ensure compare cards line up even when the "high level" badge rows wrap differently.
    function equalizeCompareCardHeaderHeights(compareGridEl) {
      if (!compareGridEl) return;
      const headers = Array.from(compareGridEl.querySelectorAll('.step1-compare-top'));
      if (headers.length < 2) return;

      // Reset first so shrink/grow recalculates correctly (esp. on resize or different selections)
      headers.forEach(h => { h.style.minHeight = ''; });
      const maxH = headers.reduce((m, h) => Math.max(m, h.getBoundingClientRect().height || 0), 0);
      if (!maxH) return;
      headers.forEach(h => { h.style.minHeight = `${Math.ceil(maxH)}px`; });
    }

    function buildCompareCard(r) {
      const schoolName = getSchoolName(r) || 'School';
      const decision = r['decision'] || r['Decision'] || '';
      const flow = r['flow'] || r['Flow'] || '';
      const uid = r['UniqueID'] || r['Unique Id'] || '';
      const siteCap = r['SiteCapacity'] || '';
      const below50 = r['Below50PCTL_EA_Cat'] || '';

      const enrollment = parseNumber(r['Enrollment']);
      const capacity = parseNumber(r['Capacity']);
      const seats = parseNumber(r['Available Seats']);
      const util = parseNumber(r['Utilization']);
      const buildingScore = coerceBuildingScore0to10(r['BuildingScore']);
      const eduAdeq = parseNumber(r['EducationalAdequacy']);
      const attArea = parseNumber(r['AttendanceAreaEnrollment']);
      const growth = parseNumber(r['Future_EnrollmentGrowth']);
      const distance = parseNumber(r['DistanceUnderutilizedschools']);

      const metrics = [];
      if (Number.isFinite(util)) {
        const pct = util * 100;
        const color = pct >= 95 ? '#dc2626' : (pct >= 85 ? '#f59e0b' : '#16a34a');
        metrics.push(metricRow({ label: 'Utilization', value: fmtPct(pct), sub: (Number.isFinite(enrollment) && Number.isFinite(capacity) && capacity > 0) ? `${fmtInt(enrollment)} / ${fmtInt(capacity)} students` : '', barW: pct, barC: color }));
      } else {
        metrics.push(metricRow({ label: 'Utilization', value: '', sub: '', barW: null, barC: null }));
      }
      metrics.push(metricRow({ label: 'Enrollment', value: Number.isFinite(enrollment) ? fmtInt(enrollment) : '', sub: 'Students', barW: null }));
      metrics.push(metricRow({ label: 'Capacity', value: Number.isFinite(capacity) ? fmtInt(capacity) : '', sub: 'Seats', barW: null }));
      metrics.push(metricRow({ label: 'Available Seats', value: Number.isFinite(seats) ? fmtInt(seats) : '', sub: '', barW: null }));
      if (Number.isFinite(buildingScore)) {
        const pct = clamp((buildingScore / 10) * 100, 0, 100);
        const color = pct >= 70 ? '#16a34a' : (pct >= 45 ? '#f59e0b' : '#dc2626');
        metrics.push(metricRow({ label: 'Building Score', value: `${buildingScore.toFixed(2)}/10`, sub: '', barW: pct, barC: color }));
      } else {
        metrics.push(metricRow({ label: 'Building Score', value: '', sub: '', barW: null }));
      }
      if (Number.isFinite(eduAdeq)) {
        const pct = clamp(eduAdeq * 100, 0, 100);
        const color = pct >= 70 ? '#16a34a' : (pct >= 45 ? '#f59e0b' : '#dc2626');
        metrics.push(metricRow({ label: 'Educational Adequacy', value: fmtPct(pct), sub: '', barW: pct, barC: color }));
      } else {
        metrics.push(metricRow({ label: 'Educational Adequacy', value: '', sub: '', barW: null }));
      }
      if (Number.isFinite(attArea)) {
        const pct = clamp(attArea, 0, 100);
        const color = pct >= 90 ? '#dc2626' : (pct >= 80 ? '#f59e0b' : '#16a34a');
        metrics.push(metricRow({ label: 'Attendance Area Enroll.', value: fmtPct(pct), sub: '', barW: pct, barC: color }));
      } else {
        metrics.push(metricRow({ label: 'Attendance Area Enroll.', value: '', sub: '', barW: null }));
      }
      if (Number.isFinite(growth)) {
        const pct = (growth >= -1 && growth <= 1) ? growth * 100 : growth;
        const color = pct >= 5 ? '#16a34a' : (pct <= -5 ? '#dc2626' : '#64748b');
        metrics.push(metricRow({ label: 'Future Enrollment Growth', value: fmtPct(pct), sub: '', barW: clamp(Math.abs(pct), 0, 100), barC: color }));
      } else {
        metrics.push(metricRow({ label: 'Future Enrollment Growth', value: '', sub: '', barW: null }));
      }
      metrics.push(metricRow({ label: 'Distance to Underutilized', value: Number.isFinite(distance) ? `${distance.toFixed(1)} mi` : '', sub: '', barW: null }));

      const keyMeta = [];
      if (decision) keyMeta.push(`<span class="step1-badge">${htmlEscape(decision)}</span>`);
      if (flow !== '' && flow !== null && typeof flow !== 'undefined') keyMeta.push(`<span class="step1-badge">Flow ${htmlEscape(flow)}</span>`);
      if (uid) keyMeta.push(`<span class="step1-badge">${htmlEscape(uid)}</span>`);
      if (siteCap) keyMeta.push(`<span class="step1-badge">${htmlEscape(`Site capacity: ${siteCap}`)}</span>`);
      if (below50) keyMeta.push(`<span class="step1-badge">${htmlEscape(`Below 50th pct EA: ${below50}`)}</span>`);

      return `<div class="step1-card step1-compare-card">
        <div class="step1-compare-top">
          <div class="step1-compare-title">${htmlEscape(schoolName)}</div>
          <div class="step1-compare-meta">${buildBadges(r, false)}</div>
          ${keyMeta.length ? `<div class="step1-compare-meta">${keyMeta.join('')}</div>` : ``}
        </div>
        <div class="step1-compare-body" style="margin-top:10px;">${metrics.filter(Boolean).join('')}</div>
      </div>`;
    }

    // Compare toggle visibility
    const isCompare = !!(compareMode && compareMode.checked);
    if (compareSelects) compareSelects.style.display = isCompare ? 'flex' : 'none';
    if (singleSection) singleSection.style.display = isCompare ? 'none' : 'block';
    if (compareSection) compareSection.style.display = isCompare ? 'block' : 'none';

    // Badges for single view header
    if (badgesWrap) {
      badgesWrap.innerHTML = isCompare ? '' : buildBadges(row, true);
    }

    if (!isCompare) {
      if (kpiGrid) {
        const tiles = buildKpiTiles(row);
        kpiGrid.innerHTML = tiles || `<div style="grid-column: span 12; color:#6b7280; font-size:13px; padding: 8px 0;">No matching metrics.</div>`;
      }
      if (heading) heading.textContent = String(name);
      return;
    }

    // Compare mode: render cards side-by-side (primary + up to 2 comparisons)
    if (heading) heading.textContent = 'Compare schools';
    if (compareGrid) {
      const rows = getDecisionSchoolRows();
      const primaryName = getSchoolName(row) || '';
      const selectedNames = [primaryName];
      const n1 = compare1 && compare1.value ? compare1.value : '';
      const n2 = compare2 && compare2.value ? compare2.value : '';
      if (n1) selectedNames.push(n1);
      if (n2) selectedNames.push(n2);
      const deduped = Array.from(new Set(selectedNames.map(s => String(s))));
      const selectedRows = deduped
        .map(nm => rows.find(r => norm(getSchoolName(r)) === norm(nm)))
        .filter(Boolean);
      compareGrid.innerHTML = selectedRows.map(buildCompareCard).join('') || `<div style="color:#6b7280; font-size:13px;">Select one or two additional schools to compare.</div>`;
      // Align the metric sections across cards by equalizing the top/header height.
      requestAnimationFrame(() => equalizeCompareCardHeaderHeights(compareGrid));
    }
  }

  function setVisibleState(hasSelection) {
    const emptyState = document.getElementById('step1SchoolDataEmptyState');
    const card = document.getElementById('step1SchoolDataCard');
    if (emptyState) emptyState.style.display = hasSelection ? 'none' : 'block';
    if (card) card.style.display = hasSelection ? 'block' : 'none';
  }

  function initOnceReady() {
    const select = document.getElementById('step1SchoolSelect');
    const openBtn = document.getElementById('step1OpenSchoolProfileBtn');
    const filterInput = document.getElementById('step1FieldFilter');
    const showEmptyCb = document.getElementById('step1ShowEmptyFields');
    const compareMode = document.getElementById('step1CompareMode');
    const compare1 = document.getElementById('step1CompareSchoolSelect1');
    const compare2 = document.getElementById('step1CompareSchoolSelect2');

    if (!select || !filterInput || !showEmptyCb) return false;

    const rows = getDecisionSchoolRows();
    if (!rows || rows.length === 0) return false;

    // Populate select once
    if (select.options.length <= 1) {
      const names = Array.from(new Set(rows.map(getSchoolName).filter(Boolean).map(String))).sort((a, b) => a.localeCompare(b));
      names.forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
      });

      // Populate compare selects with same list
      [compare1, compare2].forEach((cmp) => {
        if (!cmp) return;
        while (cmp.options.length > 1) cmp.remove(1);
        names.forEach((name) => {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          cmp.appendChild(opt);
        });
      });
    }

    function getSelectedRow() {
      const name = select.value;
      if (!name) return null;
      const n = norm(name);
      return rows.find(r => norm(getSchoolName(r)) === n) || null;
    }

    function rerender() {
      const row = getSelectedRow();
      setVisibleState(!!row);
      if (!row) return;
      renderSchoolRow(row, filterInput.value, !!showEmptyCb.checked);
    }

    select.addEventListener('change', () => {
      // Clear filter each time user switches schools (keeps it simple)
      filterInput.value = '';
      rerender();
    });
    filterInput.addEventListener('input', rerender);
    showEmptyCb.addEventListener('change', rerender);
    if (compareMode) compareMode.addEventListener('change', rerender);
    if (compare1) compare1.addEventListener('change', rerender);
    if (compare2) compare2.addEventListener('change', rerender);

    if (openBtn) {
      openBtn.addEventListener('click', () => {
        const name = select.value;
        if (!name) return;
        const url = `school-profile.html?school=${encodeURIComponent(name)}`;
        window.open(url, '_blank', 'noopener');
      });
    }

    // Initial state
    setVisibleState(false);

    // Keep compare cards aligned when the viewport changes size.
    if (!window.__step1CompareResizeBound) {
      window.__step1CompareResizeBound = true;
      let t = null;
      window.addEventListener('resize', () => {
        if (t) clearTimeout(t);
        t = setTimeout(() => {
          const grid = document.getElementById('step1CompareGrid');
          if (grid) equalizeCompareCardHeaderHeights(grid);
        }, 120);
      });
    }
    return true;
  }

  document.addEventListener('DOMContentLoaded', () => {
    // decisionLogic loads async; poll briefly until data is ready.
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (initOnceReady() || tries > 200) { // ~20s max
        clearInterval(timer);
      }
    }, 100);
  });
})();