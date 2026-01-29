// ✅ FlowchartLogic.js
let g;
let svg; // ✅ Make svg globally accessible
let flowchartZoomBehavior = null; // active d3.zoom() behavior for the currently-initialized zoomable flowchart (main or iframe)
let nodes = []; 
window.FlowUtils = {};
let links = []; 
let schoolData = [];
let mapExportData = null;

// --- ELK layout (graph layout engine) ---------------------------------------
// Used to auto-layout nodes/edges when the user does NOT have a saved manual layout.
let elkInstance = null;
let elkEdgeRouteById = new Map(); // link.id -> ELK edge (with routed sections)
let elkLastLayoutOk = false;

function getNodeDimsForElk(d) {
  // Must match rect dimensions used in renderFlowchart()
  let width = 180;
  let height = 80;
  if (d && d.type === "start") { width = 150; height = 65; }
  else if (d && d.type === "routing") { width = 140; height = 90; }
  else if (d && d.type === "flowStart") { width = 120; height = 60; }
  else if (d && d.type === "outcome") { width = 150; height = 65; }
  return { width, height };
}

function ensureLinkIds() {
  links = (links || []).map((l, idx) => ({
    ...l,
    id: l.id || `${l.source}__${l.target}__${(l.label || '').toString()}__${idx}`
  }));
}

async function applyElkLayoutIfAvailable() {
  // Only apply ELK when the user does NOT have a saved manual layout.
  let savedPositions = {};
  try { savedPositions = JSON.parse(localStorage.getItem('flowchartNodePositions') || '{}'); } catch (e) {}
  const hasSaved = savedPositions && Object.keys(savedPositions).length > 0;
  if (hasSaved) {
    elkLastLayoutOk = false;
    elkEdgeRouteById = new Map();
    return false;
  }

  // ELK must be loaded via CDN (GitHub Pages-friendly).
  if (typeof window.ELK !== 'function') {
    elkLastLayoutOk = false;
    elkEdgeRouteById = new Map();
    console.warn("⚠️ ELK not available; using existing flowchart positions.");
    return false;
  }

  try {
    if (!elkInstance) elkInstance = new window.ELK();
    ensureLinkIds();

    const elkGraph = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
        'elk.edgeRouting': 'ORTHOGONAL',
        // Give the horizontal layout more breathing room.
        'elk.spacing.nodeNode': '55',
        'elk.layered.spacing.nodeNodeBetweenLayers': '95',
        'elk.layered.spacing.edgeNodeBetweenLayers': '45',
        'elk.spacing.edgeNode': '22',
        'elk.spacing.edgeEdge': '16',
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP'
      },
      children: (nodes || []).map((n) => {
        const { width, height } = getNodeDimsForElk(n);
        return { id: n.id, width, height };
      }),
      edges: (links || []).map((l) => ({
        id: l.id,
        sources: [l.source],
        targets: [l.target]
      }))
    };

    const layout = await elkInstance.layout(elkGraph);
    const childById = new Map((layout.children || []).map(c => [c.id, c]));

    // Apply node positions (ELK uses top-left; this flowchart uses center points)
    (nodes || []).forEach((n) => {
      const c = childById.get(n.id);
      if (!c) return;
      const { width, height } = getNodeDimsForElk(n);
      const x = Number(c.x) || 0;
      const y = Number(c.y) || 0;
      n.fx = x + (width / 2);
      n.fy = y + (height / 2);
    });

    // Capture routed edges for orthogonal paths
    elkEdgeRouteById = new Map();
    (layout.edges || []).forEach((e) => {
      elkEdgeRouteById.set(e.id, e);
    });

    elkLastLayoutOk = true;
    console.log("✅ ELK layout applied:", { nodes: (nodes || []).length, edges: (links || []).length });
    return true;
  } catch (e) {
    elkLastLayoutOk = false;
    elkEdgeRouteById = new Map();
    console.warn("⚠️ ELK layout failed; using existing flowchart positions.", e);
    return false;
  }
}

// Coerce a value that may be stored as a ratio (0–1) or percent (0–100)
// into a percent on the 0–100 scale.
function coercePercent0to100(raw) {
  const n = parseFloat((raw ?? "").toString().trim());
  if (!isFinite(n)) return 0;
  // AttendanceAreaEnrollment may appear as a ratio (0–1, e.g. 0.46 = 46%)
  // or as a percent (0–100, e.g. 46.6). Handle both.
  return n <= 1.5 ? n * 100 : n;
}

// BuildingScore may be stored either on a 0–1 scale (e.g. 0.62)
// or a 0–10 scale (e.g. 6.20). Normalize to 0–10 for dashboard logic.
function coerceBuildingScore0to10(raw) {
  const n = parseFloat((raw ?? "").toString().trim().replace(/,/g, ''));
  if (!isFinite(n)) return NaN;
  return n <= 1.5 ? n * 10 : n;
}

// --- Flowchart link hover menu (Cursor-like flyout) ---
let flowLinkMenuEl = null;
let flowLinkMenuHideTimer = null;
let flowLinkMenuPinned = false; // pinned by click/tap (useful on touch devices)

function ensureFlowLinkMenuStyles() {
  if (document.getElementById('flow-link-menu-style')) return;
  const style = document.createElement('style');
  style.id = 'flow-link-menu-style';
  style.textContent = `
    .flow-link-menu {
      position: fixed;
      z-index: 30000;
      min-width: 260px;
      max-width: 340px;
      background: #fff;
      border: 1px solid #d1d5db;
      border-radius: 10px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.22);
      font-family: 'Franklin Gothic Book', 'Franklin Gothic', 'Arial Narrow', Arial, sans-serif;
      color: #111;
      overflow: hidden;
    }
    .flow-link-menu .flm-header {
      padding: 10px 12px;
      border-bottom: 1px solid #e5e7eb;
      background: #f9fafb;
      font-weight: 700;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .flow-link-menu .flm-chip {
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 999px;
      border: 1px solid #e5e7eb;
      background: #fff;
      white-space: nowrap;
    }
    .flow-link-menu .flm-body {
      padding: 10px 12px;
      font-size: 12px;
      line-height: 1.35;
    }
    .flow-link-menu .flm-kv {
      display: grid;
      grid-template-columns: 72px 1fr;
      gap: 6px 10px;
    }
    .flow-link-menu .flm-k {
      color: #6b7280;
      font-weight: 700;
    }
    .flow-link-menu .flm-v {
      color: #111827;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .flow-link-menu .flm-actions {
      margin-top: 10px;
      border-top: 1px solid #e5e7eb;
      padding-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .flow-link-menu .flm-item {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 8px 8px;
      border-radius: 8px;
      cursor: pointer;
      user-select: none;
      color: #111827;
    }
    .flow-link-menu .flm-item:hover {
      background: #f3f4f6;
    }
    .flow-link-menu .flm-item .flm-arrow {
      color: #6b7280;
      font-weight: 700;
    }
    .flow-link-menu .flm-submenu {
      display: none;
      position: absolute;
      top: 0;
      left: calc(100% - 6px);
      min-width: 220px;
      background: #fff;
      border: 1px solid #d1d5db;
      border-radius: 10px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.22);
      padding: 6px;
      z-index: 30001;
    }
    .flow-link-menu .flm-item:hover .flm-submenu {
      display: block;
    }
    .flow-link-menu .flm-subitem {
      padding: 8px 8px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 12px;
      color: #111827;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .flow-link-menu .flm-subitem:hover {
      background: #f3f4f6;
    }
  `;
  document.head.appendChild(style);
}

function ensureFlowLinkMenuEl() {
  ensureFlowLinkMenuStyles();
  if (flowLinkMenuEl) return flowLinkMenuEl;
  flowLinkMenuEl = document.createElement('div');
  flowLinkMenuEl.className = 'flow-link-menu';
  flowLinkMenuEl.style.display = 'none';
  flowLinkMenuEl.addEventListener('mouseenter', () => {
    if (flowLinkMenuHideTimer) clearTimeout(flowLinkMenuHideTimer);
  });
  flowLinkMenuEl.addEventListener('mouseleave', () => {
    if (!flowLinkMenuPinned) scheduleHideFlowLinkMenu();
  });
  document.body.appendChild(flowLinkMenuEl);

  // Click outside closes (useful for touch)
  document.addEventListener('mousedown', (e) => {
    if (!flowLinkMenuEl || flowLinkMenuEl.style.display === 'none') return;
    if (flowLinkMenuEl.contains(e.target)) return;
    flowLinkMenuPinned = false;
    hideFlowLinkMenu();
  });
  document.addEventListener('touchstart', (e) => {
    if (!flowLinkMenuEl || flowLinkMenuEl.style.display === 'none') return;
    if (flowLinkMenuEl.contains(e.target)) return;
    flowLinkMenuPinned = false;
    hideFlowLinkMenu();
  }, { passive: true });

  return flowLinkMenuEl;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function scheduleHideFlowLinkMenu() {
  if (flowLinkMenuHideTimer) clearTimeout(flowLinkMenuHideTimer);
  flowLinkMenuHideTimer = setTimeout(() => {
    if (!flowLinkMenuPinned) hideFlowLinkMenu();
  }, 180);
}

function hideFlowLinkMenu() {
  if (!flowLinkMenuEl) return;
  flowLinkMenuEl.style.display = 'none';
}

function formatNodeTitle(node) {
  if (!node) return '';
  return (node.label || node.id || '').toString().replace(/\n/g, ' ').trim();
}

function getThresholdDisplayForNode(node) {
  if (!node || !node.thresholdKey) return null;
  const sliderId = node.thresholdKey;
  const key = mapSliderKeyToThresholdKey(sliderId);
  const raw = (window.thresholds && key) ? window.thresholds[key] : undefined;
  if (raw === undefined || raw === null) return null;
  return { sliderId, key, value: raw };
}

function showFlowLinkMenuAt(clientX, clientY, linkDatum) {
  const el = ensureFlowLinkMenuEl();
  if (!linkDatum) return;

  const sourceNode = nodes.find(n => n.id === linkDatum.source);
  const targetNode = nodes.find(n => n.id === linkDatum.target);
  const label = linkDatum.label || 'Next';
  const chipColor = label === 'Yes' ? '#28a745' : (label === 'No' ? '#dc3545' : '#6c757d');
  const thresholdInfo = getThresholdDisplayForNode(sourceNode);
  const thresholdLine = thresholdInfo
    ? `${thresholdInfo.sliderId} (${thresholdInfo.key}): ${thresholdInfo.value}`
    : null;

  // Build menu
  el.innerHTML = `
    <div class="flm-header">
      <div>Link details</div>
      <div class="flm-chip" style="border-color:${chipColor}; color:${chipColor};">${label}</div>
    </div>
    <div class="flm-body">
      <div class="flm-kv">
        <div class="flm-k">From</div><div class="flm-v" title="${formatNodeTitle(sourceNode)}">${formatNodeTitle(sourceNode) || (linkDatum.source || '')}</div>
        <div class="flm-k">To</div><div class="flm-v" title="${formatNodeTitle(targetNode)}">${formatNodeTitle(targetNode) || (linkDatum.target || '')}</div>
        ${thresholdLine ? `<div class="flm-k">Threshold</div><div class="flm-v" title="${thresholdLine}">${thresholdLine}</div>` : ``}
      </div>
      <div class="flm-actions">
        <div class="flm-item" data-action="more">
          <span>More options</span>
          <span class="flm-arrow">▸</span>
          <div class="flm-submenu">
            <div class="flm-subitem" data-action="copy-link">Copy link info</div>
            <div class="flm-subitem" data-action="copy-from">Copy “From” node id</div>
            <div class="flm-subitem" data-action="copy-to">Copy “To” node id</div>
            <div class="flm-subitem" data-action="jump-from">Center on “From” node</div>
            <div class="flm-subitem" data-action="jump-to">Center on “To” node</div>
          </div>
        </div>
      </div>
    </div>
  `;

  const onAction = async (action) => {
    try {
      if (action === 'copy-link') {
        const payload = JSON.stringify({ source: linkDatum.source, target: linkDatum.target, label: linkDatum.label || null }, null, 2);
        await navigator.clipboard.writeText(payload);
      } else if (action === 'copy-from') {
        await navigator.clipboard.writeText((linkDatum.source || '').toString());
      } else if (action === 'copy-to') {
        await navigator.clipboard.writeText((linkDatum.target || '').toString());
      } else if (action === 'jump-from') {
        if (sourceNode && typeof window.centerFlowchartOnNode === 'function') window.centerFlowchartOnNode(sourceNode.id);
      } else if (action === 'jump-to') {
        if (targetNode && typeof window.centerFlowchartOnNode === 'function') window.centerFlowchartOnNode(targetNode.id);
      }
    } catch (e) {
      console.warn("⚠️ Flow link menu action failed:", e);
    }
  };

  el.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.getAttribute('data-action');
      if (!action || action === 'more') return;
      onAction(action);
      // Keep open on desktop hover; on touch/click, close after action
      if (flowLinkMenuPinned) {
        flowLinkMenuPinned = false;
        hideFlowLinkMenu();
      }
    });
    btn.addEventListener('touchstart', (e) => {
      // ensure taps register without delaying by scrolling
      e.stopPropagation();
    }, { passive: true });
  });

  // Position
  el.style.display = 'block';
  const margin = 10;
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth || document.documentElement.clientWidth || 0;
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  const left = clamp(clientX + 12, margin, Math.max(margin, vw - rect.width - margin));
  const top = clamp(clientY + 12, margin, Math.max(margin, vh - rect.height - margin));
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}

// Helper: fetch a field by any of several candidate column names (case/spacing agnostic)
function getVal(rowObj, candidates) {
  if (!rowObj) return undefined;
  const norm = (s) => (s || "").toString().trim().toLowerCase().replace(/[\s_]/g, "");
  const keys = Object.keys(rowObj);
  const target = candidates.map(norm);
  const hitKey = keys.find(k => target.includes(norm(k)));
  return hitKey ? rowObj[hitKey] : undefined;
}

// ✅ Global initialization function for main page
window.initializeFlowchartFromScript = function(svgElement) {
  console.log("🎯 Initializing flowchart from main script...");
  
  // Set up the SVG
  svg = d3.select(svgElement.node()); // ✅ Assign to global svg
  g = svg.append("g");

  g.append("g").attr("class", "flow-boxes");
  g.append("g").attr("class", "links");
  g.append("g").attr("class", "nodes");
  g.append("g").attr("class", "link-labels");

  // Add arrow markers for different link types
  const defs = svg.append("defs");
  
  // Green arrow for "Yes" links
  defs.append("marker")
    .attr("id", "arrow-yes")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 8)
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "#28a745")
    .attr("stroke", "#28a745");

  // Red arrow for "No" links
  defs.append("marker")
    .attr("id", "arrow-no")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 8)
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "#dc3545")
    .attr("stroke", "#dc3545");

  // Gray arrow for neutral links
  defs.append("marker")
    .attr("id", "arrow-neutral")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 8)
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "#6c757d")
    .attr("stroke", "#6c757d");

  // Get current zoom level from localStorage or use default.
  // Default to identity and auto-fit after first render (unless user saved a default zoom).
  let currentTransform = d3.zoomIdentity;
  const savedTransform = localStorage.getItem('flowchartZoom');
  const hasSavedTransform = !!savedTransform;
  if (savedTransform) {
    try {
      const parsed = JSON.parse(savedTransform);
      currentTransform = d3.zoomIdentity.translate(parsed.x, parsed.y).scale(parsed.k);
      console.log('Restoring saved flowchart transform:', parsed);
    } catch (e) {
      console.log('Could not parse saved zoom level, using default');
    }
  } else {
    console.log('No saved flowchart transform found, using default');
  }

  const zoomBehavior = d3.zoom()
    .scaleExtent([0.3, 3])
    .wheelDelta(function(event) {
      // Make zoom steps smaller by reducing the wheel delta
      return -event.deltaY * 0.002;
    })
    .on("zoom", e => {
      g.attr("transform", e.transform);
      // Don't auto-save zoom - only save when user clicks "Save Layout"
    });

  flowchartZoomBehavior = zoomBehavior;
  window.flowchartZoomBehavior = zoomBehavior;
  svg.call(zoomBehavior);

  // Apply the initial transform using d3's zoom API (not just the transform attribute)
  setTimeout(() => {
    svg.call(zoomBehavior.transform, currentTransform);
    console.log('Applied saved transform using zoom API:', currentTransform.toString());
  }, 100);

 

  // Initialize the flowchart (ELK layout when no saved manual layout exists)
  initializeFlowchartData();
  Promise.resolve(applyElkLayoutIfAvailable())
    .then((elkApplied) => {
      renderFlowchart();
      loadSchoolData();
      // If the user hasn't saved a preferred zoom, auto-fit so the ELK layout is framed nicely.
      if (!hasSavedTransform) {
        setTimeout(() => {
          if (typeof window.zoomFlowchartToFit === 'function') window.zoomFlowchartToFit();
        }, 250);
      }
    });
  
};

// ✅ Draw flow boxes to visually group each flow
function drawFlowBoxes() {
  console.log("📦 Drawing flow boxes");

  // Auto-fit flow boxes to current node layout (prevents misalignment when node positions change).
  // Only use saved/manual positions when edit mode is active.
  function getNodeVisualBounds(d) {
    // These match the rect dimensions used in renderFlowchart()
    let width = 180;
    let height = 80;
    let x = -90;
    let y = -40;
    if (d.type === "start") {
      width = 150; height = 65; x = -75; y = -32.5;
    } else if (d.type === "routing") {
      width = 140; height = 90; x = -70; y = -45;
    } else if (d.type === "flowStart") {
      width = 120; height = 60; x = -60; y = -30;
    } else if (d.type === "outcome") {
      width = 150; height = 65; x = -75; y = -32.5;
    }
    const fx = Number.isFinite(d.fx) ? d.fx : 0;
    const fy = Number.isFinite(d.fy) ? d.fy : 0;
    const left = fx + x;
    const top = fy + y;
    return { left, top, right: left + width, bottom: top + height };
  }

  function autoFitFlowBox(flowNum) {
    const flowNodes = nodes.filter(n => n && (n.flow === flowNum));
    // Flow 1 also needs to include the START node (it doesn't have flow:1)
    if (flowNum === 1) {
      const startNode = nodes.find(n => n && n.id === "START");
      if (startNode) flowNodes.push(startNode);
    }
    if (!flowNodes.length) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    flowNodes.forEach(n => {
      const b = getNodeVisualBounds(n);
      minX = Math.min(minX, b.left);
      minY = Math.min(minY, b.top);
      maxX = Math.max(maxX, b.right);
      maxY = Math.max(maxY, b.bottom);
    });

    // Padding: keep the title at the top and give breathing room around nodes.
    const padLeft = 30;
    const padRight = 30;
    const padBottom = 30;
    const padTop = 44; // room for the flow label (y + 20)

    const x = minX - padLeft;
    const y = minY - padTop;
    const width = (maxX - minX) + padLeft + padRight;
    const height = (maxY - minY) + padTop + padBottom;
    return { x, y, width, height };
  }
  
  // Define flow box data (store globally) - Updated with saved layout positions
  flowBoxes = [
    {
      id: "flow1",
      label: "FLOW 1 - INITIAL SORTING",
      x: -271.03200912475586,
      y: -333.68441009521484,
      width: 237.47534942626953,
      height: 626.8837738037109,
      color: "#e3f2fd"
    },
    {
      id: "flow2", 
      label: "FLOW 2 - CAPACITY\n INCREASE",
      x: -29.000279426574707,
      y: -456.79920959472656,
      width: 699.0092468261719,
      height: 370.4703483581543,
      color: "#fff3e0"
    },
    {
      id: "flow3",
      label: "FLOW 3 - BUILDING\n IMPROVEMENT",
      x: -26.81069564819336,
      y: -81.96510314941406,
      width: 693.5711059570312,
      height: 298.2346954345703,
      color: "#e8f5e8"
    },
    {
      id: "flow4",
      label: "FLOW 4 - SCHOOL\n CONSOLIDATION",
      x: -26.216888427734375,
      y: 220.00949096679688,
      width: 688.54345703125,
      height: 398.50335693359375,
      color: "#fce4ec"
    }
  ];
  
  // Default behavior: auto-fit boxes to nodes so they stay aligned.
  // If user is editing boxes, use saved positions (manual layout).
  if (flowBoxEditMode) {
    loadFlowBoxPositions();
  } else {
    const f1 = autoFitFlowBox(1);
    const f2 = autoFitFlowBox(2);
    const f3 = autoFitFlowBox(3);
    const f4 = autoFitFlowBox(4);
    flowBoxes.forEach(b => {
      const fit =
        b.id === "flow1" ? f1 :
        b.id === "flow2" ? f2 :
        b.id === "flow3" ? f3 :
        b.id === "flow4" ? f4 :
        null;
      if (!fit) return;
      b.x = fit.x;
      b.y = fit.y;
      b.width = fit.width;
      b.height = fit.height;
    });
  }
  
  // Draw the flow boxes
  g.select(".flow-boxes")
    .selectAll("rect")
    .data(flowBoxes)
    .join("rect")
    .attr("class", "flow-box")
    .attr("data-id", d => d.id)
    .attr("x", d => d.x)
    .attr("y", d => d.y)
    .attr("width", d => d.width)
    .attr("height", d => d.height)
    .attr("fill", d => d.color)
    .attr("stroke", "#666")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "5,5")
    .attr("opacity", 0.3);
  
  // Add flow labels
  g.select(".flow-boxes")
    .selectAll("text")
    .data(flowBoxes)
    .join("text")
    .attr("class", "flow-label")
    .attr("data-id", d => d.id)
    .attr("x", d => d.x + 10)
    .attr("y", d => d.y + 20)
    .attr("font-family", "Arial, sans-serif")
    .attr("font-size", "14")
    .attr("font-weight", "bold")
    .attr("fill", "#333")
    .text(d => d.label);
}

// ✅ Manual setup function for fallback
window.setupFlowchartManually = function(svgElement) {
  console.log("🎯 Setting up flowchart manually...");
  window.initializeFlowchartFromScript(svgElement);
};

function mapSliderKeyToThresholdKey(sliderId) {
  const mapping = {
    utilSlider: "utilization",
    utilHighSlider: "utilizationHigh",
    growthSlider: "enrollmentGrowth",
    siteCapacitySlider: "siteCapacity",
    attendanceAreaEnrollmentSlider: "attendanceAreaEnrollment",
    buildSlider: "buildingThreshold",
    buildAboveSlider: "buildingThresholdAbove",
    buildBelowSlider: "buildingThresholdBelow",
    buildFlow4Slider: "buildingThresholdFlow4",
    progSlider: "adequateProgramsMin",
    elementaryDistanceSlider: "elementaryDistance",
    k8DistanceSlider: "k8Distance",
    middleDistanceSlider: "middleDistance",
    highDistanceSlider: "highDistance",
    k12DistanceSlider: "k12Distance",
  };
  const result = mapping[sliderId];
  console.log("🔍 mapSliderKeyToThresholdKey:", sliderId, "->", result);
  return result;
}

// ✅ Initialize flowchart data
function initializeFlowchartData() {
  // Use updated standard layout with Flow 2 and Flow 3 restructure
  console.log("🔄 Using updated standard flowchart layout with Flow 2 and Flow 3 updates");
  
  // Load saved positions from localStorage to use as defaults
  let savedPositions = {};
  try {
    savedPositions = JSON.parse(localStorage.getItem('flowchartNodePositions') || '{}');
    if (Object.keys(savedPositions).length > 0) {
      console.log("📂 Using saved layout positions as defaults:", Object.keys(savedPositions).length, "nodes");
    }
  } catch (error) {
    console.warn("⚠️ Could not load saved positions, using hardcoded defaults");
  }
  
  // Helper function to get position (saved or default)
  const getPos = (nodeId, defaultX, defaultY) => {
    if (savedPositions[nodeId]) {
      return { fx: savedPositions[nodeId].x, fy: savedPositions[nodeId].y };
    }
    return { fx: defaultX, fy: defaultY };
  };
  
  const flowchartData = {
      nodes: [
        // FLOW 1 - MAIN DECISION TREE (Centered) - Updated with saved layout positions
        { id: "START", label: "START HERE", ...getPos("START", -247.00234985351562, 8.593657493591309), type: "start" },
        
        // Flow 1 Decision Nodes (Vertical stack)
        { id: "F1_UTIL1", label: "Current enrollment or\nutilization below?", ...getPos("F1_UTIL1", -33.21879196166992, 8.875520706176758), thresholdKey: "utilSlider", flow: 1 },
        { id: "F1_UTIL2", label: "Current\nutilization rate above?", ...getPos("F1_UTIL2", -35.97391891479492, -88.93140411376953), thresholdKey: "utilHighSlider", flow: 1 },
        { id: "F1_GROWTH2", label: "Projected enrollment growth above?", ...getPos("F1_GROWTH2", -34.59635543823242, -188.1158905029297), thresholdKey: "growthSlider", flow: 1 },
        { id: "F1_DIST", label: "Distance to\nwelcoming schools", ...getPos("F1_DIST", -35.97391891479492, 108.06000518798828), thresholdKey: "F1_DIST_dynamic", flow: 1 },
        { id: "F1_GROWTH", label: "Projected enrollment growth above?", ...getPos("F1_GROWTH", -37.351478576660156, 212.75474548339844), thresholdKey: "growthSlider", flow: 1 },
        
        // FLOW 2 - BUILDING ADDITION (Left column) - Updated with saved layout positions
        { id: "F2_ATTENDANCE", label: "Attendance area enrollment above", ...getPos("F2_ATTENDANCE", 223.63880920410156, -132.1666717529297), thresholdKey: "attendanceAreaEnrollmentSlider", flow: 2 },
        { id: "F2_EXPAND", label: "Property has\nspace to expand?", ...getPos("F2_EXPAND", 223.63880920410156, -225.6972198486328), thresholdKey: "siteCapacitySlider", flow: 2 },
        { id: "F2_FAC", label: "Composite Building Score\nabove?", ...getPos("F2_FAC", 417.989013671875, -216.43138122558594), thresholdKey: "buildSlider", flow: 2 },
        { id: "F2_EDU1", label: "Educational Adequacy\nabove?", ...getPos("F2_EDU1", 225.22109985351562, -312.5646667480469), thresholdKey: "progSlider", flow: 2 },
        { id: "F2_EDU2", label: "Educational Adequacy\nabove?", ...getPos("F2_EDU2", 419.5743713378906, -313.1373291015625), thresholdKey: "progSlider", flow: 2 },
        { id: "F2_OUT1", label: "Building\nAddition", ...getPos("F2_OUT1", 227.774658203125, -396.8319396972656), type: "outcome", flow: 2 },
        { id: "F2_OUT2", label: "Policy Solution\nfor Overcrowding", ...getPos("F2_OUT2", 417.989013671875, -130.82284545898438), type: "outcome", flow: 2 },
        { id: "F2_OUT3", label: "Building Replacement", ...getPos("F2_OUT3", 593.16943359375, -313.1373291015625), type: "outcome", flow: 2 },
        { id: "F2_OUT4", label: "Building Addition\nwith Capital Investment", ...getPos("F2_OUT4", 418.78167724609375, -397.95318603515625), type: "outcome", flow: 2 },
        
        // FLOW 3 - MAINTENANCE/INVESTMENT (Center column) - Updated with saved layout positions
        { id: "F3_FAC_ABOVE", label: "Composite Building Score\nabove?", ...getPos("F3_FAC_ABOVE", 220.6871337890625, -0.8997395038604736), thresholdKey: "buildAboveSlider", flow: 3 },
        { id: "F3_FAC_BELOW", label: "Composite Building Score\nbelow?", ...getPos("F3_FAC_BELOW", 406.35528564453125, 1.3768327236175537), thresholdKey: "buildBelowSlider", flow: 3 },
        { id: "F3_EDU1", label: "Educational Adequacy\nabove?", ...getPos("F3_EDU1", 216.475341796875, 87.54791259765625), thresholdKey: "progSlider", flow: 3 },
        { id: "F3_EDU2", label: "Below 50% percentile EA or\nsafety/security issues?", ...getPos("F3_EDU2", 405.512939453125, 88.98212432861328), flow: 3 },
        { id: "F3_OUT1", label: "Targeted Capital\nInvestment", ...getPos("F3_OUT1", 584.0929565429688, 40.96768569946289), type: "outcome", flow: 3 },
        { id: "F3_OUT2", label: "Standard\nMaintenance", ...getPos("F3_OUT2", 581.5658569335938, 112.56816864013672), type: "outcome", flow: 3 },
        { id: "F3_OUT3", label: "Major Capital\nInvestment", ...getPos("F3_OUT3", 403.8282165527344, 169.8485565185547), type: "outcome", flow: 3 },
        { id: "F3_OUT4", label: "Building Replacement", ...getPos("F3_OUT4", 215.6329803466797, 171.7837677001953), type: "outcome", flow: 3 },
        
        // FLOW 4 - CONSOLIDATION/CLOSURE (Right column) - Updated with saved layout positions
        { id: "F4_EDU1", label: "Educational Adequacy\nabove?", ...getPos("F4_EDU1", 393.82550048828125, 387.7051696777344), thresholdKey: "progSlider", flow: 4 },
        { id: "F4_FAC1", label: "Composite Building Score\nabove?", ...getPos("F4_FAC1", 580.3935546875, 382.4497375488281), thresholdKey: "buildFlow4Slider", flow: 4 },
        { id: "F4_FAC2", label: "Composite Building Score\nabove?", ...getPos("F4_FAC2", 397.1777648925781, 480.25665283203125), thresholdKey: "buildFlow4Slider", flow: 4 },
        { id: "F4_DIST", label: "Within distance threshold\n of Welcoming School", ...getPos("F4_DIST", 395.8002014160156, 583.5738525390625), thresholdKey: "elementaryDistanceSlider", flow: 4 },
        { id: "F4_OUT1", label: "Welcoming\nSchool", ...getPos("F4_OUT1", 579.0159912109375, 290.1530456542969), type: "outcome", flow: 4 },
        { id: "F4_OUT2", label: "Welcoming School with\nCapital Investment", ...getPos("F4_OUT2", 584.5262451171875, 483.01177978515625), type: "outcome", flow: 4 },
        { id: "F4_OUT3", label: "Closure (Goes\n to Welcoming School)", ...getPos("F4_OUT3", 213.96197509765625, 578.0635986328125), type: "outcome", flow: 4 },
        { id: "F4_OUT4", label: "Welcoming School\n with Building Replacement", ...getPos("F4_OUT4", 585.90380859375, 582.1962890625), type: "outcome", flow: 4 },
      ],
      links: [
                        // FLOW 1 LINKS
                        { source: "START", target: "F1_UTIL1" },
                        { source: "F1_UTIL1", target: "F1_DIST", label: "Yes" },
                        { source: "F1_UTIL1", target: "F1_UTIL2", label: "No" },
                        { source: "F1_UTIL2", target: "F1_GROWTH2", label: "Yes" },
                        { source: "F1_UTIL2", target: "F3_FAC_ABOVE", label: "No" },
                        { source: "F1_GROWTH2", target: "F2_ATTENDANCE", label: "Yes" },
                        { source: "F1_GROWTH2", target: "F3_FAC_ABOVE", label: "No" },
                        { source: "F1_DIST", target: "F1_GROWTH", label: "Yes" },
                        { source: "F1_DIST", target: "F3_FAC_ABOVE", label: "No" },
                        { source: "F1_GROWTH", target: "F3_FAC_ABOVE", label: "Yes" },
        { source: "F1_GROWTH", target: "F4_EDU1", label: "No" },
        
        // FLOW 2 LINKS
        { source: "F2_ATTENDANCE", target: "F2_EXPAND", label: "Yes" },
        { source: "F2_ATTENDANCE", target: "F2_OUT2", label: "No" }, // Direct to POLICY DECISIONS
        { source: "F2_EXPAND", target: "F2_FAC", label: "Yes" },
        { source: "F2_EXPAND", target: "F2_OUT2", label: "No" }, // Direct to POLICY CHANGE & RE-SORT
        { source: "F2_FAC", target: "F2_EDU1", label: "Yes" },
        { source: "F2_FAC", target: "F2_EDU2", label: "No" },
        { source: "F2_EDU1", target: "F2_OUT1", label: "Yes" },
        { source: "F2_EDU1", target: "F2_OUT4", label: "No" },
        { source: "F2_EDU2", target: "F2_OUT4", label: "Yes" },
        { source: "F2_EDU2", target: "F2_OUT3", label: "No" },
        
        // FLOW 3 LINKS
        { source: "F3_FAC_ABOVE", target: "F3_FAC_BELOW", label: "Yes" },
        { source: "F3_FAC_ABOVE", target: "F3_EDU1", label: "No" },
        { source: "F3_FAC_BELOW", target: "F3_OUT1", label: "Yes" },
        { source: "F3_FAC_BELOW", target: "F3_EDU2", label: "No" },
        { source: "F3_EDU1", target: "F3_OUT3", label: "Yes" },
        { source: "F3_EDU1", target: "F3_OUT4", label: "No" },
        { source: "F3_EDU2", target: "F3_OUT2", label: "Yes" },
        { source: "F3_EDU2", target: "F3_OUT1", label: "No" },
        
        // FLOW 4 LINKS
        { source: "F4_EDU1", target: "F4_FAC1", label: "Yes" },
        { source: "F4_EDU1", target: "F4_FAC2", label: "No" },
        { source: "F4_FAC1", target: "F4_OUT1", label: "Yes" },
        { source: "F4_FAC1", target: "F4_OUT2", label: "No" },
        { source: "F4_FAC2", target: "F4_OUT2", label: "Yes" },
        { source: "F4_FAC2", target: "F4_DIST", label: "No" },
        { source: "F4_DIST", target: "F4_OUT3", label: "Yes" },
        { source: "F4_DIST", target: "F4_OUT4", label: "No" },
      ]
    };

  // Set nodes and links from the data
  nodes = flowchartData.nodes;
  links = flowchartData.links;
  // Stable IDs enable ELK edge routing lookup
  ensureLinkIds();
}

// ✅ Populate the main-page flowchart dropdown using loaded schoolData
function populateMainFlowchartDropdown() {
  try {
    const select = document.getElementById('mainFlowchartSchoolSelect');
    if (!select) {
      // Not in main-page context
      return;
    }
    if (!Array.isArray(schoolData) || schoolData.length === 0) {
      console.log("⚠️ populateMainFlowchartDropdown: schoolData empty or not loaded yet");
      return;
    }

    // Landing behavior: do NOT auto-select a school.
    // Only keep an existing selection, or apply an explicit external selection
    // (e.g., user selected a school on the map first).
    let previousValue = select.value;
    let externalValue = "";
    try {
      if ((!previousValue || previousValue === "") && window.currentSelectedSchoolName) {
        externalValue = window.currentSelectedSchoolName;
      }
      if ((!previousValue || previousValue === "") && !externalValue && window.currentOriginName) {
        externalValue = window.currentOriginName;
      }
      if ((!previousValue || previousValue === "") && !externalValue && window.currentOriginId) {
        const uid = window.currentOriginId.toString().trim();
        const rowForUid = schoolData.find(r => {
          const rowUid = (r.UniqueID || r["UniqueID"] || r["Unique Id"] || "").toString().trim();
          return rowUid === uid;
        });
        if (rowForUid && rowForUid["Building Name"]) {
          externalValue = rowForUid["Building Name"];
        }
      }
    } catch (syncErr) {
      console.warn("⚠️ Unable to read external selection for flowchart dropdown sync:", syncErr);
    }

    // Build sorted list of building names
    const names = schoolData
      .map(r => r["Building Name"])
      .filter(name => !!name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    select.innerHTML = '<option value="">-- Select School --</option>';

    names.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });

    // Restore selection only if we already had one, or if an explicit external selection exists.
    const desired = (previousValue && previousValue.trim()) ? previousValue : (externalValue && externalValue.trim()) ? externalValue : "";
    if (desired && names.includes(desired)) {
      select.value = desired;

      // If this is the first time we are syncing from an external selection
      // (e.g., user started by choosing a school on the map), trigger the
      // change handler once so the flowchart + info panel update immediately.
      if (!window.flowchartDropdownSyncedOnce) {
        const evt = new Event('change', { bubbles: true });
        select.dispatchEvent(evt);
        window.flowchartDropdownSyncedOnce = true;
      }
    }

    console.log(`✅ Populated mainFlowchartSchoolSelect with ${names.length} schools`);
  } catch (e) {
    console.error("❌ Error populating main flowchart dropdown:", e);
  }
}

// ✅ Render flowchart
function renderFlowchart() {
  console.log("🎯 Rendering flowchart with nodes:", nodes);
  
  // Load any saved node positions
  loadSavedPositions();
  
  // Draw flow boxes to group each flow
  drawFlowBoxes();
  
  // Landing behavior: if no school is selected, show the full diagram (no dimming).
  const hasSelection = (() => {
    const sel = document.getElementById('mainFlowchartSchoolSelect');
    return !!(sel && sel.value);
  })();

  svg.selectAll(".node")
    .classed("highlight", false)
    .classed("special-highlight", false)
    .classed("dimmed", hasSelection);

  svg.selectAll(".link")
    .classed("active", false)
    .classed("dimmed", hasSelection);

  // Draw Lines (Links)
  const linkPath = (d) => {
    const source = nodes.find(n => n.id === d.source);
    const target = nodes.find(n => n.id === d.target);
    if (!source || !target) return "";

    // Use ELK orthogonal routing when available and not in manual edit mode.
    if (!flowBoxEditMode && elkLastLayoutOk && d && d.id && elkEdgeRouteById && elkEdgeRouteById.has(d.id)) {
      const e = elkEdgeRouteById.get(d.id);
      const section = e && e.sections && e.sections[0] ? e.sections[0] : null;
      if (section && section.startPoint && section.endPoint) {
        const pts = [section.startPoint, ...(section.bendPoints || []), section.endPoint]
          .filter(p => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))
          .map(p => ({ x: Number(p.x), y: Number(p.y) }));
        if (pts.length >= 2) {
          return `M${pts[0].x},${pts[0].y} ` + pts.slice(1).map(p => `L${p.x},${p.y}`).join(' ');
        }
      }
    }

    // Fallback: straight line between node centers
    return `M${source.fx},${source.fy} L${target.fx},${target.fy}`;
  };

  const visibleLinks = g.select(".links")
    .selectAll("path.link-visible")
    .data(links)
    .join("path")
    .attr("class", d => {
      if (d.label === "Yes") return "link link-yes";
      if (d.label === "No") return "link link-no";
      return "link";
    })
    .classed("link-visible", true)
    .style("stroke-width", "3")
    .style("fill", "none")
    .attr("marker-end", d => {
      if (d.label === "Yes") return "url(#arrow-yes)";
      if (d.label === "No") return "url(#arrow-no)";
      return "url(#arrow-neutral)";
    })
    .attr("d", linkPath)
    .style("pointer-events", "none"); // interactions handled by hit paths below

  // Intentionally disable link hover/click menus.
  // (Users found link "More options" flyouts hard to read; keep the diagram clean.)
  g.select(".links").selectAll("path.link-hit").remove();
  flowLinkMenuPinned = false;
  if (typeof hideFlowLinkMenu === 'function') hideFlowLinkMenu();

  g.select(".nodes")
    .selectAll("g")
    .data(nodes)
    .join("g")
    .attr("class", "node")
    .attr("transform", d => `translate(${d.fx},${d.fy})`)
    .style("cursor", flowBoxEditMode ? "move" : "default")
      .call(d3.drag()
        .filter(() => flowBoxEditMode) // Only allow dragging when edit mode is active
        .on("start", function(event, d) {
          if (!flowBoxEditMode) return;
          d3.select(this).classed("dragging", true);
          console.log("🎯 Started dragging node:", d.id);
        })
        .on("drag", function(event, d) {
          if (!flowBoxEditMode) return;
          // Update the fixed position to allow manual positioning
          d.fx = event.x;
          d.fy = event.y;
          
          // Update the visual position
          d3.select(this)
            .attr("transform", `translate(${event.x},${event.y})`);
          
          // Update connected links
          updateLinks();
        })
        .on("end", function(event, d) {
          if (!flowBoxEditMode) return;
          d3.select(this).classed("dragging", false);
          console.log("✅ Finished dragging node:", d.id, "to position:", d.fx, d.fy);
          
          // Save the new position to localStorage
          saveNodePosition(d.id, d.fx, d.fy);
        })
      )
    .each(function (d) {
      const group = d3.select(this);
      
      // Define node types and their styling
      let nodeClass = "decision-node";
      let width = 180;
      let height = 80;
      let x = -90;
      let y = -40;
      let rx = 6;
      let ry = 6;
      
      if (d.type === "start") {
        nodeClass = "start-node";
        width = 150;
        height = 65;
        x = -75;
        y = -32.5;
        rx = 20;
        ry = 20;
      } else if (d.type === "routing") {
        nodeClass = "routing-node";
        width = 140;
        height = 90;
        x = -70;
        y = -45;
        rx = 15;
        ry = 15;
      } else if (d.type === "flowStart") {
        nodeClass = "flow-start-node";
        width = 120;
        height = 60;
        x = -60;
        y = -30;
        rx = 10;
        ry = 10;
      } else if (d.type === "outcome") {
        nodeClass = "outcome-node";
        width = 150;
        height = 65;
        x = -75;
        y = -32.5;
        rx = 20;
        ry = 20;
      }
      
      group.append("rect")
        .attr("width", width)
        .attr("height", height)
        .attr("x", x)
        .attr("y", y)
        .attr("rx", rx)
        .attr("ry", ry)
        .attr("class", nodeClass);
  
      let mainText = d.label;
      let dynamicNumber = "";
      
      if (d.thresholdKey && window.thresholds && d.thresholdKey !== "siteCapacitySlider") {
        const key = mapSliderKeyToThresholdKey(d.thresholdKey);
        console.log("🔍 Initial render for node", d.id, "thresholdKey:", d.thresholdKey, "mapped to:", key, "window.thresholds:", window.thresholds);
        if (key && window.thresholds[key] !== undefined) {
          const rawVal = window.thresholds[key];
          // Get currently selected school data for dynamic enrollment display
          const selectedSchool = getSelectedSchoolData();
          console.log("🔍 Initial render for node", d.id, "thresholdKey:", d.thresholdKey, "rawVal:", rawVal, "selectedSchool:", selectedSchool ? selectedSchool["Building Name"] : "none");
          
          let formatted;
          if (d.id === "F4_DIST") {
            // Special handling for F4_DIST node - show dynamic distance based on school level
            formatted = formatSliderValue("F4_DIST_dynamic", rawVal, selectedSchool);
          } else if (d.id === "F1_DIST") {
            // Special handling for F1_DIST node - show dynamic distance based on school level
            formatted = formatSliderValue("F1_DIST_dynamic", rawVal, selectedSchool);
          } else {
            formatted = formatSliderValue(d.thresholdKey, rawVal, selectedSchool);
          }
          
          dynamicNumber = `<span class="dynamic-number">${formatted}</span>`;
          console.log("🔍 Initial text for", d.id, ":", mainText, "Dynamic number:", dynamicNumber);
        } else {
          console.warn("⚠️ Initial render - Threshold value undefined for", d.id, "key:", key);
          dynamicNumber = `<span class="dynamic-number">undefined</span>`;
        }
      }
      
      let text;
      if (d.type === "outcome" || d.type === "start" || d.type === "routing") {
        // Simple centered text for outcome, start, and routing nodes (purple, green, orange nodes)
        text = `<div style="display: flex; align-items: center; justify-content: center; height: 100%; width: 100%;">${mainText}</div>`;
      } else {
        // Complex structure with dynamic numbers for decision nodes (gray nodes)
        text = `<div style="position: relative; width: 100%; height: 100%; display: flex; flex-direction: column;">
               <div style="flex: 1; display: flex; align-items: center; justify-content: center; padding-bottom: 25px;">${mainText}</div>
            ${dynamicNumber}
          </div>`;
      }
  
      group.append("foreignObject")
        .attr("x", d.id === "F1_UTIL1" ? -100 : -75)
        .attr("y", d.id === "F1_UTIL1" ? -45 : -32.5)
        .attr("width", d.id === "F1_UTIL1" ? 200 : 150)
        .attr("height", d.id === "F1_UTIL1" ? 90 : 65)
        .append("xhtml:div")
        .style("position", "relative")
        .style("height", "100%")
        .style("width", "100%")
        .style("font", d.type === "routing" ? "14px 'Franklin Gothic Book', 'Franklin Gothic', 'Arial Narrow', Arial, sans-serif" : "12px 'Franklin Gothic Book', 'Franklin Gothic', 'Arial Narrow', Arial, sans-serif")
        .style("font-family", "'Franklin Gothic Book', 'Franklin Gothic', 'Arial Narrow', Arial, sans-serif")
        .style("font-weight", d.type === "routing" ? "bold" : "normal")
        .style("text-align", "center")
        .style("word-wrap", "break-word")
        .style("white-space", "pre-line")
        .style("line-height", "1.2")
        .html(text);
        
    });

  FlowUtils.updateNodeLabels();
}

// ✅ Load school data
function loadSchoolData() {
  // Prefer the already-processed decisionLogic.schoolData if available,
  // so we reuse the same filters and joined distance-to-welcoming values.
  if (window.decisionLogic && Array.isArray(window.decisionLogic.schoolData) && window.decisionLogic.schoolData.length > 0) {
    schoolData = window.decisionLogic.schoolData;
    console.log("📊 Using decisionLogic.schoolData for flowchart:", schoolData.length, "schools");

    // Make updateFlowForSchool available globally
    window.updateFlowForSchool = updateFlowForSchool;
    window.schoolData = schoolData;

    // Ensure thresholds exist (mirror DecisionLogic defaults if needed)
    window.thresholds = window.thresholds || {
      enrollmentThreshold: 200,
      utilization: 0.60,
      utilizationHigh: 0.90,
      enrollmentGrowth: 0,
      projectedUtilization: 0.90,
      distanceUnderutilized: 3.5,
      buildingThreshold: 1.5,
      adequateProgramsMin: 50,
      attendanceAreaEnrollment: 80,
      siteCapacity: "Yes",
      // School-level enrollment thresholds
      elementaryEnrollment: 220,
      k8Enrollment: 360,
      middleEnrollment: 500,
      highEnrollment: 700,
      k12Enrollment: 600,
      // School-level distance thresholds
      elementaryDistance: 3.5,
      k8Distance: 3.5,
      middleDistance: 5.0,
      highDistance: 7.0,
      k12Distance: 6.0
    };

    // Force update thresholds from sliders if they exist
    if (typeof document !== 'undefined') {
      const utilSlider = document.getElementById('utilSlider');
      const utilHighSlider = document.getElementById('utilHighSlider');
      const growthSlider = document.getElementById('growthSlider');
      
      if (utilSlider) window.thresholds.utilization = parseFloat(utilSlider.value) / 100;
      if (utilHighSlider) window.thresholds.utilizationHigh = parseFloat(utilHighSlider.value) / 100;
      if (growthSlider) window.thresholds.enrollmentGrowth = parseFloat(growthSlider.value) / 100;
    }
    
    FlowUtils.updateNodeLabels();
    
    // Force refresh node labels to ensure correct display
    setTimeout(() => {
      FlowUtils.updateNodeLabels();
      console.log("🔄 Node labels refreshed with thresholds:", window.thresholds);
    }, 100);

    // Populate the main page flowchart dropdown if present
    populateMainFlowchartDropdown();
    return;
  }

  // Fallback: load directly from CSV (iframe/standalone contexts)
  Papa.parse("./Decision Data Export.csv", {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function (res) {
      // Filter out schools only when Include_Flow_Chart explicitly says "No"
      schoolData = res.data.filter(row => {
        const includeFlowChartRaw = row.Include_Flow_Chart;
        const normalizedInclude = (includeFlowChartRaw ?? "yes").toString().trim().toLowerCase();
        const shouldInclude =
          normalizedInclude !== "no" &&
          normalizedInclude !== "0" &&
          normalizedInclude !== "false";
        if (!shouldInclude) {
          console.log(`🚫 Excluding school from flowchart: ${row["Building Name"]} (Include_Flow_Chart: "${includeFlowChartRaw}")`);
        }
        return shouldInclude;
      });
      
      console.log(`📊 Filtered school data for flowchart (fallback CSV load): ${res.data.length} total schools → ${schoolData.length} included schools`);
      console.log("🔍 Sample school data:", schoolData[0]);
      
      // Make updateFlowForSchool available globally
      window.updateFlowForSchool = updateFlowForSchool;
      window.schoolData = schoolData;
      
      // Set default thresholds if not already set
      window.thresholds = window.thresholds || {
        enrollmentThreshold: 200,
        utilization: 0.60,
        utilizationHigh: 0.90,
        enrollmentGrowth: 0,
        projectedUtilization: 0.90,
        distanceUnderutilized: 3.5,
        buildingThreshold: 1.5,
        adequateProgramsMin: 50, // Changed to percentage (0-100)
        attendanceAreaEnrollment: 80, // Percentage threshold for attendance area enrollment (0-100)
        siteCapacity: "Yes",
        // School-level enrollment thresholds
        elementaryEnrollment: 220,
        k8Enrollment: 360,
        middleEnrollment: 500,
        highEnrollment: 700,
        k12Enrollment: 600,
        // School-level distance thresholds
        elementaryDistance: 3.5,
        k8Distance: 3.5,
        middleDistance: 5.0,
        highDistance: 7.0,
        k12Distance: 6.0
      };
      
      // Force update thresholds from sliders if they exist
      if (typeof document !== 'undefined') {
        const utilSlider = document.getElementById('utilSlider');
        const utilHighSlider = document.getElementById('utilHighSlider');
        const growthSlider = document.getElementById('growthSlider');
        
        if (utilSlider) window.thresholds.utilization = parseFloat(utilSlider.value) / 100;
        if (utilHighSlider) window.thresholds.utilizationHigh = parseFloat(utilHighSlider.value) / 100;
        if (growthSlider) window.thresholds.enrollmentGrowth = parseFloat(growthSlider.value) / 100;
      }
      
      FlowUtils.updateNodeLabels();
      
      // Force refresh node labels to ensure correct display
      setTimeout(() => {
        FlowUtils.updateNodeLabels();
        console.log("🔄 Node labels refreshed with thresholds:", window.thresholds);
      }, 100);

      // Populate the main page flowchart dropdown if present
      populateMainFlowchartDropdown();
    },
    error: function(err) {
      console.error("❌ Failed to load school data for flowchart:", err);
    }
  });

  // If there is no selection, ensure everything is visible (all flows/paths).
  const selNow = document.getElementById('mainFlowchartSchoolSelect');
  if (!selNow || !selNow.value) {
    resetFlowchartVisibility();
  }
}

// Helper: Normalize school level strings to canonical keys (namespaced to avoid clobbering other globals)
function normalizeSchoolLevelFlow(rawLevel) {
  if (!rawLevel) {
    console.log("⚠️ normalizeSchoolLevel: rawLevel is falsy");
    return null;
  }
  
  const trimmed = rawLevel.toString().trim();
  if (!trimmed) {
    console.log("⚠️ normalizeSchoolLevel: rawLevel is empty after trim");
    return null;
  }
  
  const original = trimmed.toLowerCase();
  const cleaned = original.replace(/[^a-z0-9]/g, '');
  
  console.log("🔍 normalizeSchoolLevel:", { raw: rawLevel, trimmed, original, cleaned });
  
  // Check for elementary
  if (cleaned.includes('elementary') || cleaned === 'es' || original === 'elementary') {
    return 'elementary';
  }
  
  // Check for K-8: look for "k" followed by "8" (with or without hyphen/dash, potentially with text after)
  // Patterns: "k-8", "k8", "k 8", "kindergarten8", "k through 8", etc.
  // Check cleaned first (after removing special chars)
  if (cleaned.includes('k8')) {
    console.log("✅ Matched K-8 via cleaned string contains 'k8'");
    return 'k8';
  }
  // Check original string for hyphenated/spaced versions
  if (original.includes('k-8') || original.includes('k 8') || original.includes('kthrough8') || /k\s*[-–—]\s*8/i.test(rawLevel)) {
    console.log("✅ Matched K-8 via original string pattern");
    return 'k8';
  }
  // Check if it starts with k and has 8 somewhere
  if (/^k.*8|8.*k/i.test(cleaned) && cleaned.length <= 5) {
    console.log("✅ Matched K-8 via k/8 pattern");
    return 'k8';
  }
  
  // Check for middle
  if (cleaned.includes('middle') || cleaned === 'ms' || original === 'middle') {
    return 'middle';
  }
  
  // Check for high
  if (cleaned.includes('high') || cleaned === 'hs' || original === 'high') {
    return 'high';
  }
  
  // Check for K-12 or 6-12
  if (cleaned.includes('612') || cleaned.includes('k12') || original.includes('6-12') || original.includes('k-12') || original.includes('6 12') || original.includes('k 12') || original.includes('6through12')) {
    return 'k12';
  }
  
  console.log("⚠️ normalizeSchoolLevel: No match found for:", rawLevel);
  return null;
}

// Label Formatting
function formatSliderValue(key, value, schoolData = null) {
  const num = parseFloat(value);
  
  switch (key) {
    case "utilSlider":
      // Special handling for utilization slider to show both dynamic thresholds
      console.log("🔍🔍🔍 formatSliderValue for utilSlider called");
      console.log("🔍🔍🔍 schoolData parameter:", schoolData);
      console.log("🔍🔍🔍 schoolData exists?", !!schoolData);
      
      if (schoolData) {
        // Try multiple possible field names for school level
        let schoolLevelRaw = schoolData["School Level"] || 
                             schoolData["SchoolLevel"] || 
                             schoolData["school_level"] ||
                             schoolData["SCHOOL LEVEL"] ||
                             '';
        
        // If still empty, search for any field containing "level"
        if (!schoolLevelRaw) {
          const levelFields = Object.keys(schoolData).filter(k => k.toLowerCase().includes('level'));
          if (levelFields.length > 0) {
            schoolLevelRaw = schoolData[levelFields[0]] || '';
            console.log("🔍 Found school level via field search:", levelFields[0], "=", schoolLevelRaw);
          }
        }
        
        let level = normalizeSchoolLevelFlow(schoolLevelRaw);
        
        // Special handling: If school level is "Multi-Level" or unrecognized, try to infer from school name
        if (!level && schoolData["Building Name"]) {
          const schoolName = schoolData["Building Name"].toString();
          console.log("🔍 School level not recognized, trying to infer from school name:", schoolName);
          level = normalizeSchoolLevelFlow(schoolName);
          if (level) {
            console.log("✅ Inferred school level from name:", level);
          }
        }
        
        let enrollmentThreshold;
        
        console.log("🔍 formatSliderValue for utilSlider with schoolData:", schoolData["Building Name"], "School Level field:", schoolLevelRaw, "→ normalized:", level);
        console.log("🔍 All schoolData keys:", Object.keys(schoolData));
        
        if (level === 'elementary') {
          enrollmentThreshold = window.thresholds?.elementaryEnrollment || 220;
        } else if (level === 'k8') {
          enrollmentThreshold = window.thresholds?.k8Enrollment || 360;
        } else if (level === 'middle') {
          enrollmentThreshold = window.thresholds?.middleEnrollment || 500;
        } else if (level === 'high') {
          enrollmentThreshold = window.thresholds?.highEnrollment || 700;
        } else if (level === 'k12') {
          enrollmentThreshold = window.thresholds?.k12Enrollment || 600;
        } else {
          // Unknown level – do not mislead; ask user to choose a level
          const resultUnknown = `choose level    |    ${Math.round(num * 100)}%`;
          console.log("🔍 Unknown school level, returning:", resultUnknown);
          return resultUnknown;
        }
        
        console.log("🔍 Dynamic thresholds for", schoolData["Building Name"], ":", Math.round(num * 100) + "% utilization,", enrollmentThreshold + " students enrollment");
        const result = `${enrollmentThreshold} students    |    ${Math.round(num * 100)}%`;
        console.log("🔍🔍🔍 Returning:", result);
        return result;
      } else {
        console.log("🔍 formatSliderValue for utilSlider with NO school data");
        const result = `choose level    |    ${Math.round(num * 100)}%`;
        console.log("🔍🔍🔍 Returning:", result);
        return result;
      }
    case "utilHighSlider":
      return `${Math.round(num * 100)}%`;
    case "growthSlider":
      return `${Math.round(num * 100)}%`;
    case "elementaryDistanceSlider":
    case "k8DistanceSlider":
    case "middleDistanceSlider":
    case "highDistanceSlider":
    case "k12DistanceSlider":
      return `${num.toFixed(1)} mi`;
    case "siteCapacitySlider":
      return value;
    case "F1_DIST_dynamic":
    case "F4_DIST_dynamic":
      // Special case for F1_DIST and F4_DIST nodes - show dynamic distance based on school level
      if (schoolData) {
        const schoolLevel = (schoolData["School Level"] || '').toLowerCase();
        let distanceThreshold;
        
        if (schoolLevel.includes("elementary")) {
          distanceThreshold = window.thresholds?.elementaryDistance || 3.5;
        } else if (schoolLevel.includes("k-8")) {
          distanceThreshold = window.thresholds?.k8Distance || 3.5;
        } else if (schoolLevel.includes("middle")) {
          distanceThreshold = window.thresholds?.middleDistance || 5.0;
        } else if (schoolLevel.includes("high")) {
          distanceThreshold = window.thresholds?.highDistance || 7.0;
        } else if (schoolLevel.includes("6-12")) {
          distanceThreshold = window.thresholds?.k12Distance || 6.0;
        } else {
          distanceThreshold = window.thresholds?.middleDistance || 5.0;
        }
        
        return `${distanceThreshold.toFixed(1)} mi`;
      }
      return "choose level"; // Default fallback when no school selected
    case "buildSlider":
    case "buildAboveSlider":
    case "buildBelowSlider":
    case "buildFlow4Slider":
      return num.toFixed(1);
    case "progSlider":
    case "attendanceAreaEnrollmentSlider":
      return parseInt(value, 10) + "%";
    case "recentInvestSlider":
      return `$${parseInt(value, 10)}M`;
    default:
      return value;
  }
}

//Update Node Labels
FlowUtils.updateNodeLabels = function (selectedSchoolData = null) {
  // If no school data explicitly provided, use currently selected (if any)
  if (!selectedSchoolData) {
    try {
      const current = getSelectedSchoolData();
      if (current) {
        selectedSchoolData = current;
        console.log("✅ Auto-retrieved school data for labels:", selectedSchoolData["Building Name"]);
      } else {
        console.log("⚠️ No school selected and no school data provided");
      }
    } catch (e) {
      console.error("❌ Error getting selected school data:", e);
    }
  } else {
    console.log("✅ School data provided to updateNodeLabels:", selectedSchoolData["Building Name"]);
  }
  console.log("🔍 updateNodeLabels called with school data:", selectedSchoolData);
  const nodeCount = d3.selectAll(".node").size();
  console.log("🔍 Total nodes found:", nodeCount);
  
  d3.selectAll(".node").each(function (d) {
    const group = d3.select(this);
    const foreign = group.select("foreignObject div");
    
    let mainText = d.label;
    let dynamicNumber = "";
    
    // Special logging for F1_UTIL1
    if (d.id === "F1_UTIL1") {
      console.log("🎯🎯🎯 F1_UTIL1 NODE FOUND AND PROCESSING:", {
        id: d.id,
        label: d.label,
        thresholdKey: d.thresholdKey,
        hasThresholds: !!window.thresholds,
        thresholdsKeys: window.thresholds ? Object.keys(window.thresholds) : "none",
        selectedSchoolData: selectedSchoolData ? selectedSchoolData["Building Name"] : "none",
        selectedSchoolDataKeys: selectedSchoolData ? Object.keys(selectedSchoolData) : "none"
      });
    }
    
    if (d.thresholdKey && window.thresholds && d.thresholdKey !== "siteCapacitySlider") {
      const thresholdKey = mapSliderKeyToThresholdKey(d.thresholdKey);
      const rawVal = window.thresholds[thresholdKey];
      console.log("🔍 Updating node", d.id, "thresholdKey:", d.thresholdKey, "mapped to:", thresholdKey, "rawVal:", rawVal, "window.thresholds:", window.thresholds);
      if (rawVal !== undefined) {
        let formatted;
        if (d.id === "F4_DIST") {
          // Special handling for F4_DIST node - show dynamic distance based on school level
          formatted = formatSliderValue("F4_DIST_dynamic", rawVal, selectedSchoolData);
        } else if (d.id === "F1_DIST") {
          // Special handling for F1_DIST node - show dynamic distance based on school level
          formatted = formatSliderValue("F1_DIST_dynamic", rawVal, selectedSchoolData);
        } else if (d.id === "F1_UTIL1") {
          // Special handling for F1_UTIL1 - MUST pass school data to show enrollment threshold
          console.log("🎯 F1_UTIL1: Formatting with schoolData:", selectedSchoolData);
          formatted = formatSliderValue(d.thresholdKey, rawVal, selectedSchoolData);
        } else {
          formatted = formatSliderValue(d.thresholdKey, rawVal, selectedSchoolData);
        }
        dynamicNumber = `<span class=\"dynamic-number\">${formatted}</span>`;
        console.log("🔍 Final text for", d.id, ":", mainText, "Dynamic number:", dynamicNumber);
      } else {
        console.warn("⚠️ Threshold value undefined for", d.id, "thresholdKey:", thresholdKey);
        dynamicNumber = `<span class=\"dynamic-number\">undefined</span>`;
      }
    }
    
    let text;
    if (d.type === "outcome" || d.type === "start" || d.type === "routing") {
      // Simple centered text for outcome, start, and routing nodes (purple, green, orange nodes)
      text = `<div style="display: flex; align-items: center; justify-content: center; height: 100%; width: 100%;">${mainText}</div>`;
    } else {
      // Complex structure with dynamic numbers for decision nodes (gray nodes)
      // Add a small clickable icon for the F1_DIST node to show nearby schools
      let extraControl = "";
      if (d.id === "F1_DIST") {
        extraControl = `
          <button type="button"
                  class="welcoming-node-btn"
                  onclick="window.handleWelcomingNodeClick && window.handleWelcomingNodeClick()"
                  style="margin-top:2px; align-self:center; padding:1px 4px; font-size:9px; border:1px solid #007cbf; border-radius:10px; background:#ffffff; color:#007cbf; cursor:pointer;">
            nearby ▾
          </button>`;
      }
      text = `<div style="position: relative; width: 100%; height: 100%; display: flex; flex-direction: column;">
             <div style="flex: 1; display: flex; align-items: center; justify-content: center; padding-bottom: 25px;">${mainText}</div>
        ${dynamicNumber}
        ${extraControl}
      </div>`;
    }
    foreign
      .style("position", "relative")
      .style("height", "100%")
      .style("width", "100%")
      .style("text-align", "center")
      .html(text);
    
    // Update foreignObject size for F1_UTIL1 if needed
    if (d.id === "F1_UTIL1") {
      const foreignObject = group.select("foreignObject");
      foreignObject
        .attr("x", -100)
        .attr("y", -45)
        .attr("width", 200)
        .attr("height", 90);
    }
  });
};

// ✅ Helper function to get currently selected school data
function getSelectedSchoolData() {
  // Try to get the currently selected school from the main flowchart select
  const mainFlowchartSelect = document.getElementById('mainFlowchartSchoolSelect');
  if (mainFlowchartSelect && mainFlowchartSelect.value) {
    const selectedSchoolName = mainFlowchartSelect.value;
    const foundSchool = schoolData.find(r => r["Building Name"] === selectedSchoolName);
    console.log("🔍 getSelectedSchoolData found:", selectedSchoolName, foundSchool);
    return foundSchool;
  }
  console.log("🔍 No school selected or select not found");
  return null;
}

// ✅ Helper function to determine enrollment decision based on school level
function getEnrollmentDecision(row, t) {
  const utilization = +row.Utilization;
  const enrollment = parseFloat((row.Enrollment || '').toString().replace(/,/g, '').trim());
  let schoolLevelRaw = row["School Level"] || '';
  let level = normalizeSchoolLevelFlow(schoolLevelRaw);
  
  // Special handling: If school level is "Multi-Level" or unrecognized, try to infer from school name
  if (!level && row["Building Name"]) {
    const schoolName = row["Building Name"].toString();
    level = normalizeSchoolLevelFlow(schoolName);
    if (level) {
      console.log(`✅ getEnrollmentDecision: Inferred level "${level}" from school name "${schoolName}" (original level: "${schoolLevelRaw}")`);
    }
  }
  
  // Get enrollment thresholds from slider values
  let enrollmentThreshold;
  if (level === 'elementary') {
    enrollmentThreshold = t.elementaryEnrollment || 220;
  } else if (level === 'k8') {
    enrollmentThreshold = t.k8Enrollment || 360;
  } else if (level === 'middle') {
    enrollmentThreshold = t.middleEnrollment || 500;
  } else if (level === 'high') {
    enrollmentThreshold = t.highEnrollment || 700;
  } else if (level === 'k12') {
    enrollmentThreshold = t.k12Enrollment || 600;
  } else {
    // Unknown type - use a safe default (median of configured thresholds)
    const candidates = [t.elementaryEnrollment, t.k8Enrollment, t.middleEnrollment, t.highEnrollment, t.k12Enrollment].filter(v => typeof v === 'number');
    enrollmentThreshold = candidates.length > 0 ? candidates.sort((a,b)=>a-b)[Math.floor(candidates.length/2)] : (t.middleEnrollment || 500);
  }
  
  // Check if utilization below threshold OR enrollment below level-specific threshold
  // Either condition must be true for the school to be considered underutilized.
  // Note: Using OR logic allows schools to be flagged if either utilization is low OR enrollment is low.
  const utilizationBelowThreshold = utilization < t.utilization;
  const enrollmentBelowThreshold = enrollment < enrollmentThreshold;
  
  console.log(`📊 Enrollment decision for ${row["Building Name"]}:`);
  console.log(`  - School Level: "${schoolLevelRaw}" → normalized: "${level}"`);
  console.log(`  - Utilization: ${utilization} < ${t.utilization}? ${utilizationBelowThreshold}`);
  console.log(`  - Enrollment: ${enrollment} < ${enrollmentThreshold}? ${enrollmentBelowThreshold}`);
  console.log(`  - Final decision (either below): ${(utilizationBelowThreshold || enrollmentBelowThreshold) ? "Yes" : "No"}`);
  
  return (utilizationBelowThreshold || enrollmentBelowThreshold) ? "Yes" : "No";
}

// ✅ Evaluate Path function
function evaluatePath(row, t) {
  console.log("🔍 Evaluating 4-flow path for school:", row["Building Name"]);
  console.log("🔍 Thresholds being used:", t);
  
  // Get all decision values
  const decisions = {
    // Flow 1 - Main Decision (F1_UTIL1 now includes enrollment logic)
    util1: getEnrollmentDecision(row, t),
    util2: +row.Utilization > t.utilizationHigh ? "Yes" : "No", 
    dist: (() => {
      let schoolLevelRaw = row["School Level"] || '';
      let level = normalizeSchoolLevelFlow(schoolLevelRaw);
      
      // Special handling: If school level is "Multi-Level" or unrecognized, try to infer from school name
      if (!level && row["Building Name"]) {
        const schoolName = row["Building Name"].toString();
        level = normalizeSchoolLevelFlow(schoolName);
      }
      
      let distanceThreshold;
      
      if (level === 'elementary') {
        distanceThreshold = t.elementaryDistance;
      } else if (level === 'k8') {
        distanceThreshold = t.k8Distance;
      } else if (level === 'middle') {
        distanceThreshold = t.middleDistance;
      } else if (level === 'high') {
        distanceThreshold = t.highDistance;
      } else if (level === 'k12') {
        distanceThreshold = t.k12Distance;
      } else {
        distanceThreshold = t.middleDistance || 5.0; // Default fallback
      }
      
      return +row.DistanceUnderutilizedschools <= distanceThreshold ? "Yes" : "No";
    })(),
    growth: +row["Future_EnrollmentGrowth"] > t.enrollmentGrowth ? "Yes" : "No",
    
    // Flow 2 - Building Addition
    attendance: (() => {
      const attendanceAreaEnrollmentPct = coercePercent0to100(row.AttendanceAreaEnrollment);
      return attendanceAreaEnrollmentPct >= t.attendanceAreaEnrollment ? "Yes" : "No";
    })(),
    edu2: (+row.EducationalAdequacy * 100) >= t.adequateProgramsMin ? "Yes" : "No",
    // Node label: "Composite Building Score above?"
    fac2: coerceBuildingScore0to10(row.BuildingScore) >= t.buildingThreshold ? "Yes" : "No",
    expand: (row.SiteCapacity === "Yes" || row.SiteCapacity === "yes" || row.SiteCapacity === "YES") ? "Yes" : "No",
    
    // Flow 3 - Maintenance/Investment
    // Node label: "Composite Building Score below?"
    fac3_below: coerceBuildingScore0to10(row.BuildingScore) <= t.buildingThresholdBelow ? "Yes" : "No",
    edu3: (+row.EducationalAdequacy * 100) >= t.adequateProgramsMin ? "Yes" : "No",
    edu3_2: (() => {
      // OR function: Below 50% percentile EA category OR safety/security issues
      const hasBelow50PercentileCategory = row["Below50PCTL_EA_Cat"];
      const isBelow50Percentile = hasBelow50PercentileCategory === "Yes" || hasBelow50PercentileCategory === "yes" || hasBelow50PercentileCategory === "YES";
      const hasSafetyIssues = (row.DepartmentalDeficiency && row.DepartmentalDeficiency.toLowerCase().includes('safety')) || 
                             (row.DepartmentalDeficiency && row.DepartmentalDeficiency.toLowerCase().includes('security'));
      return (isBelow50Percentile || hasSafetyIssues) ? "Yes" : "No";
    })(),
    // Node label: "Composite Building Score above?"
    fac3_above: coerceBuildingScore0to10(row.BuildingScore) >= t.buildingThresholdAbove ? "Yes" : "No",
    
    // Flow 4 - Consolidation/Closure
    invest: "No",
    edu4: (+row.EducationalAdequacy * 100) >= t.adequateProgramsMin ? "Yes" : "No",
    // Node label: "Composite Building Score above?"
    fac4: coerceBuildingScore0to10(row.BuildingScore) >= t.buildingThresholdFlow4 ? "Yes" : "No",
    dist4: (() => {
      let schoolLevelRaw = row["School Level"] || '';
      let level = normalizeSchoolLevelFlow(schoolLevelRaw);
      
      // Special handling: If school level is "Multi-Level" or unrecognized, try to infer from school name
      if (!level && row["Building Name"]) {
        const schoolName = row["Building Name"].toString();
        level = normalizeSchoolLevelFlow(schoolName);
      }
      
      let distanceThreshold;
      
      if (level === 'elementary') {
        distanceThreshold = t.elementaryDistance;
      } else if (level === 'k8') {
        distanceThreshold = t.k8Distance;
      } else if (level === 'middle') {
        distanceThreshold = t.middleDistance;
      } else if (level === 'high') {
        distanceThreshold = t.highDistance;
      } else if (level === 'k12') {
        distanceThreshold = t.k12Distance;
      } else {
        distanceThreshold = t.middleDistance || 5.0; // Default to middle school distance
      }
      
      return +row.DistanceUnderutilizedschools <= distanceThreshold ? "Yes" : "No";
    })(),
  };

  console.log("📊 Decision values:", decisions);

  const path = ["START"];
  let currentFlow = 1;
  
  // FLOW 1 - Main Decision Tree (Updated with OR logic)
  path.push("F1_UTIL1");
  if (decisions.util1 === "Yes") {
    // School is below utilization OR enrollment threshold (or both)
    path.push("F1_DIST");
    if (decisions.dist === "Yes") {
      path.push("F1_GROWTH");
      if (decisions.growth === "Yes") {
        path.push("F3_FAC_ABOVE");
        currentFlow = 3;
      } else {
        path.push("F4_EDU1");
        currentFlow = 4;
      }
    } else {
      path.push("F3_FAC_ABOVE");
      currentFlow = 3;
    }
  } else {
    // School does NOT meet both criteria (above at least one threshold)
    path.push("F1_UTIL2");
    if (decisions.util2 === "Yes") {
      // Include projected enrollment growth in the "overcrowding" branch:
      // only route into Flow 2 if growth is above the threshold.
      path.push("F1_GROWTH2");
      if (decisions.growth === "Yes") {
        path.push("F2_ATTENDANCE");
        currentFlow = 2;
      } else {
        path.push("F3_FAC_ABOVE");
        currentFlow = 3;
      }
    } else {
      path.push("F3_FAC_ABOVE");
      currentFlow = 3;
    }
  }

  // FLOW 2 - Building Addition
  if (currentFlow === 2) {
    path.push("F2_ATTENDANCE");
    if (decisions.attendance === "Yes") {
      path.push("F2_EXPAND");
      if (decisions.expand === "Yes") {
      path.push("F2_FAC");
      if (decisions.fac2 === "Yes") {
        path.push("F2_EDU1");
        if (decisions.edu2 === "Yes") {
          path.push("F2_OUT1"); // BUILDING ADDITION
      } else {
          path.push("F2_OUT4"); // BUILDING ADDITION & MAJOR CAPITAL
        }
        } else {
        path.push("F2_EDU2");
        if (decisions.edu2 === "Yes") {
          path.push("F2_OUT4"); // BUILDING ADDITION & MAJOR CAPITAL
        } else {
          path.push("F2_OUT3"); // REPLACEMENT
        }
      }
      } else {
        path.push("F2_OUT2"); // POLICY CHANGE & RE-SORT
      }
    } else {
      path.push("F2_OUT2"); // POLICY DECISIONS (attendance area enrollment below threshold)
    }
  }

  // FLOW 3 - Maintenance/Investment
  if (currentFlow === 3) {
    path.push("F3_FAC_ABOVE");
    if (decisions.fac3_above === "Yes") {
      path.push("F3_FAC_BELOW");
      if (decisions.fac3_below === "Yes") {
        path.push("F3_OUT1"); // TARGET CAPITAL INVESTMENT
        } else {
        path.push("F3_EDU2");
        if (decisions.edu3_2 === "Yes") {
          path.push("F3_OUT2"); // STANDARD MAINTENANCE
        } else {
          path.push("F3_OUT1"); // TARGET CAPITAL INVESTMENT
        }
      }
    } else {
      path.push("F3_EDU1");
      if (decisions.edu3 === "Yes") {
        path.push("F3_OUT3"); // MAJOR CAPITAL INVESTMENT
      } else {
        path.push("F3_OUT4"); // REPLACEMENT
      }
    }
  }

  // FLOW 4 - Consolidation/Closure
  if (currentFlow === 4) {
    path.push("F4_EDU1");
    if (decisions.edu4 === "Yes") {
      path.push("F4_FAC1");
      if (decisions.fac4 === "Yes") {
        path.push("F4_OUT1"); // CONSOLIDATION (Receiving)
      } else {
        path.push("F4_OUT2"); // CONSOLIDATION with CAPITAL
      }
    } else {
      path.push("F4_FAC2");
      if (decisions.fac4 === "Yes") {
        path.push("F4_OUT2"); // CONSOLIDATION with CAPITAL
      } else {
        path.push("F4_DIST");
        if (decisions.dist4 === "Yes") {
          path.push("F4_OUT3"); // CLOSURE (Receiving)
        } else {
          path.push("F4_OUT4"); // CLOSURE & REPLACEMENT
        }
      }
    }
  }

  console.log("🎯 Final 4-flow path:", path, "Current Flow:", currentFlow);
  return { path, decisions, currentFlow };
}

// ✅ highlight flow function - show only relevant flow for selected school
function highlightFlow(path, decisions, currentFlow) {
  // Clear all existing highlights and visibility
  d3.selectAll(".node")
    .classed("highlight", false)
    .classed("special-highlight", false)
    .classed("flow-1-active", false)
    .classed("flow-2-active", false)
    .classed("flow-3-active", false)
    .classed("flow-4-active", false)
    .classed("hidden-flow", false); 

  d3.selectAll(".link")
    .classed("active", false)
    .classed("hidden-flow", false)
    .attr("marker-end", null);

  d3.selectAll(".link-label")
    .classed("active-label", false)
    .classed("hidden-flow", false);

  // Show ALL nodes and links first, then fade irrelevant ones with smooth transition
  d3.selectAll(".node").style("display", "block").transition().duration(400).style("opacity", 0.08);
  d3.selectAll(".link").style("display", "block").transition().duration(400).style("opacity", 0.08);
  d3.selectAll(".link-label").style("display", "block").transition().duration(400).style("opacity", 0.08);
  d3.selectAll(".flow-box").transition().duration(400).style("opacity", 0.15);
  d3.selectAll(".flow-label").transition().duration(400).style("opacity", 0.15);
  
  console.log("🔍 Faded all elements - nodes:", d3.selectAll(".node").size(), "links:", d3.selectAll(".link").size());

  // Show only the relevant flow path
  if (currentFlow) {
    // Define only the nodes that should be visible - just the exact path taken
    const visibleNodes = new Set();
    const visibleLinks = new Set();
    
    // Add ONLY the nodes in the actual path taken
    path.forEach(nodeId => visibleNodes.add(nodeId));
    
    // Add only the links that connect consecutive nodes in the path
    for (let i = 0; i < path.length - 1; i++) {
      const source = path[i];
      const target = path[i + 1];
      visibleLinks.add(`${source}-${target}`);
    }
    
    // Map each node in the path to its index so we can stagger the animation
    const pathIndex = {};
    path.forEach((id, i) => {
      pathIndex[id] = i;
    });

    const stepDelay = 80; // ms per step – small stagger so early nodes appear first

    // Restore full opacity to visible nodes with smooth, slightly staggered transition
    d3.selectAll(".node")
      .filter(d => visibleNodes.has(d.id))
      .transition()
      .delay(d => (pathIndex[d.id] || 0) * stepDelay)
      .duration(400)
      .style("opacity", 1);
    
    // Restore full opacity to visible links with matching stagger
    d3.selectAll(".link")
      .filter(d => visibleLinks.has(`${d.source}-${d.target}`))
      .transition()
      .delay(d => {
        const i = pathIndex[d.source];
        return (i || 0) * stepDelay;
      })
      .duration(400)
      .style("opacity", 1);
    
    // Restore full opacity to visible link labels with matching stagger
    d3.selectAll(".link-label")
      .filter(d => d && d.source && d.target && visibleLinks.has(`${d.source}-${d.target}`))
      .transition()
      .delay(d => {
        const i = pathIndex[d.source];
        return (i || 0) * stepDelay;
      })
      .duration(400)
      .style("opacity", 1);
    
    console.log("🔍 Visible nodes (exact path):", Array.from(visibleNodes));
    console.log("🔍 Visible links (exact path):", Array.from(visibleLinks));
    console.log("🔍 Total nodes faded:", d3.selectAll(".node").size() - visibleNodes.size, "Total links faded:", d3.selectAll(".link").size() - visibleLinks.size);
  }

  // Highlight the active path
  d3.selectAll(".node")
    .filter(d => path.includes(d.id))
    .classed("highlight", true)
    .style("display", "block"); // Ensure active nodes are shown

  // Add flow-specific highlighting
  if (currentFlow) {
    const flowClass = `flow-${currentFlow}-active`;
  d3.selectAll(".node")
      .filter(d => path.includes(d.id))
      .classed(flowClass, true);
  }

  // Highlight outcome nodes
  const outcomeNodes = ["F2_OUT1", "F2_OUT2", "F2_OUT3", "F2_OUT4", "F3_OUT1", "F3_OUT2", "F3_OUT3", "F3_OUT4", "F4_OUT1", "F4_OUT2", "F4_OUT3", "F4_OUT4"];
  d3.selectAll(".node")
    .filter(d => outcomeNodes.includes(d.id) && path.includes(d.id))
    .classed("special-highlight", true);

  // Highlight the links
  d3.selectAll(".link")
    .filter(d => {
      const i = path.indexOf(d.source);
      return i >= 0 && path[i + 1] === d.target;
    })
    .classed("active", true)
    .style("display", "block"); // Ensure active links are shown

  // Highlight labels for active links
  const labelGroup = d3.select(".link-labels");
  labelGroup.selectAll("text").remove();

  for (let i = 0; i < path.length - 1; i++) {
    const source = nodes.find(n => n.id === path[i]);
    const target = nodes.find(n => n.id === path[i + 1]);

    if (!source || !target) {
      console.warn(`⚠️ Could not find node for: ${path[i]} ➝ ${path[i + 1]}`);
      continue; // Skip this label
    }
    let midX, midY;
    // Custom label placement for E→F and E→1
    if (source.id === "E" && target.id === "F") {
      // Place label above the horizontal segment between left of E and center of F
      const nodeWidthE = 180;
      const startX = source.fx - nodeWidthE / 2;
      const endX = target.fx;
      midX = (startX + endX) / 2;
      midY = source.fy - 10; // slightly above the line
    } else if (source.id === "E" && target.id === "1") {
      // Place label above the first horizontal segment (right from E)
      const nodeWidthE = 150;
      const startX = source.fx + nodeWidthE / 2;
      const m = nodes.find(n => n.id === "M");
      const horizontalGap = 120;
      const rightOfM_X = m.fx + nodeWidthE / 2 + horizontalGap;
      midX = (startX + rightOfM_X) / 2;
      midY = source.fy - 10;
    } else if (source.id === "O" && target.id === "20") {
      // Place label above the first horizontal segment (left from O)
      const nodeWidthO = 180;
      const startX = source.fx - nodeWidthO / 2;
      const leftGap = 60;
      const leftX = startX - leftGap;
      midX = ((startX + leftX) / 2)-50;
      midY = source.fy +70;
    } else if (source.id === "Z" && target.id === "20") {
      // Place label above the first horizontal segment (right from Z)
      const nodeWidthZ = 180;
      const startX = source.fx + nodeWidthZ / 2;
      const center20X = target.fx;
      midX = (startX + center20X) / 2;
      midY = source.fy - 10;
    } else if (source.id === "W" && target.id === "5") {
      // Place label to the right and slightly down from the first horizontal segment (right from W)
      const nodeWidthW = 150;
      const offset = 40;
      const startX = source.fx + nodeWidthW / 2;
      const rightX = startX + offset;
      midX = (startX + rightX) / 2 + 35; // move right
      midY = source.fy + 70; // move down
    } else if (source.id === "G" && target.id === "U") {
      // Place label at midpoint between right edge of G and center of U
      const nodeWidthG = 180;
      const startX = source.fx + nodeWidthG / 2;
      const startY = source.fy;
      const endX = target.fx;
      const endY = target.fy;
      midX = (startX + endX) / 2-20;
      midY = (startY + endY) / 2 - 20; // slightly above the line
    } else if (source.id === "U" && target.id === "W"){
      // Place label at midpoint between right edge of U and center of W
      const nodeWidthU = 180;
      const startX = source.fx + nodeWidthU / 2;
      const startY = source.fy;
      const endX = target.fx;
      const endY = target.fy;
      midX = (startX + endX) / 2-20;
      midY = (startY + endY) / 2 - 20; // slightly above the line
    }
    else {
      // Default: midpoint of straight line
      midX = (source.fx + target.fx) / 2;
      midY = ((source.fy + target.fy) / 2)+5;
    }
    const label = decisions[source.id] || "";
    labelGroup.append("text")
      .attr("x", midX)
      .attr("y", midY)
      .attr("text-anchor", "middle")
      .attr("class", "link-label")
      .text(label);
  }
}

function updateFlowForSchool(name, thresholds) {
  console.log("🎯 updateFlowForSchool called with:", name, "thresholds:", thresholds);
  
  if (!name || name === "") {
    // No school selected - show all flows
    console.log("🔄 No school selected, updating labels without school data");
    resetFlowchartVisibility();
    FlowUtils.updateNodeLabels(); // Update labels without school-specific data
    return;
  }
  
  // Helper to fetch a field by any of several candidate column names (case/spacing agnostic)
  const getVal = (rowObj, candidates) => {
    if (!rowObj) return undefined;
    const norm = (s) => (s || "").toString().trim().toLowerCase().replace(/[\s_]/g, "");
    const keys = Object.keys(rowObj);
    const target = candidates.map(norm);
    const hitKey = keys.find(k => target.includes(norm(k)));
    return hitKey ? rowObj[hitKey] : undefined;
  };

  const row = schoolData.find(r => r["Building Name"] === name);
  if (row) {
    console.log("✅ Found school data for:", name);
    const { path, decisions, currentFlow} = evaluatePath(row, thresholds);
    console.log("🎨 Highlighting flow with path:", path, "current flow:", currentFlow);
    highlightFlow(path, decisions, currentFlow);
    
    // Update node labels with school-specific data to show enrollment threshold
    console.log("🔄 Updating labels with school data:", row["Building Name"]);
    FlowUtils.updateNodeLabels(row);
  } else {
    console.warn("⚠️ School not found:", name);
    resetFlowchartVisibility();
    FlowUtils.updateNodeLabels(); // Update labels without school-specific data
  }
}

// ✅ Reset flowchart to show all flows when no school is selected
function resetFlowchartVisibility() {
  console.log("🔄 Resetting flowchart visibility - showing all flows");
  
  // Clear all highlights and show all elements at full opacity with smooth transition
  d3.selectAll(".node")
    .classed("highlight", false)
    .classed("special-highlight", false)
    .classed("flow-1-active", false)
    .classed("flow-2-active", false)
    .classed("flow-3-active", false)
    .classed("flow-4-active", false)
    .style("display", "block")
    .transition()
    .duration(400)
    .style("opacity", 1); // Show all nodes at full opacity

  d3.selectAll(".link")
    .classed("active", false)
    .style("display", "block")
    .transition()
    .duration(400)
    .style("opacity", 1); // Show all links at full opacity

  d3.selectAll(".link-label")
    .classed("active-label", false)
    .style("display", "block")
    .transition()
    .duration(400)
    .style("opacity", 1); // Show all labels at full opacity

  d3.selectAll(".flow-box").transition().duration(400).style("opacity", 0.3); // Show flow boxes
  d3.selectAll(".flow-label").transition().duration(400).style("opacity", 0.3); // Show flow labels
}

// ✅ Flow box editing functionality
let flowBoxEditMode = false;
let flowBoxes = []; // Store flow box data globally

// ✅ Toggle flow box edit mode
window.toggleFlowBoxEditMode = function() {
  flowBoxEditMode = !flowBoxEditMode;
  const btn = document.getElementById('editFlowBoxesBtn');
  
  if (flowBoxEditMode) {
    btn.textContent = 'Exit Edit Mode';
    btn.style.background = '#dc3545';
    enableFlowBoxEditing();
  } else {
    btn.textContent = 'Edit Flow Boxes';
    btn.style.background = '#007bff';
    disableFlowBoxEditing();
  }
  
  // Update node cursors based on edit mode
  d3.selectAll(".node")
    .style("cursor", flowBoxEditMode ? "move" : "default");
  
  console.log("📦 Flow box edit mode:", flowBoxEditMode ? "ENABLED" : "DISABLED");
};

// ✅ Enable flow box editing
function enableFlowBoxEditing() {
  // Make flow boxes draggable and resizable
  d3.selectAll(".flow-box")
    .style("cursor", "move")
    .call(d3.drag()
      .on("start", function(event, d) {
        console.log("🎯 Started dragging flow box:", d.id);
      })
      .on("drag", function(event, d) {
        const newX = d.x + event.dx; // Allow negative X for more positioning freedom
        const newY = d.y + event.dy; // Allow moving anywhere vertically
        
        d3.select(this)
          .attr("x", newX)
          .attr("y", newY);
        
        // Update corresponding label position
        d3.select(`.flow-label[data-id="${d.id}"]`)
          .attr("x", newX + 10)
          .attr("y", newY + 20);
        
        // Update the data
        d.x = newX;
        d.y = newY;
      })
      .on("end", function(event, d) {
        console.log("🎯 Finished dragging flow box:", d.id, "to", d.x, d.y);
        saveFlowBoxPositions();
      })
    );
  
  // Add resize handles
  addResizeHandles();
}

// ✅ Disable flow box editing
function disableFlowBoxEditing() {
  // Remove drag behavior
  d3.selectAll(".flow-box")
    .style("cursor", "default")
    .on(".drag", null);
  
  // Remove resize handles
  d3.selectAll(".resize-handle").remove();
}

// ✅ Add resize handles to flow boxes
function addResizeHandles() {
  // Remove existing handles
  d3.selectAll(".resize-handle").remove();
  
  d3.selectAll(".flow-box").each(function(d) {
    const box = d3.select(this);
    const x = parseFloat(box.attr("x"));
    const y = parseFloat(box.attr("y"));
    const width = parseFloat(box.attr("width"));
    const height = parseFloat(box.attr("height"));
    
    // Add corner resize handle
    const handle = g.select(".flow-boxes")
      .append("rect")
      .attr("class", "resize-handle")
      .attr("x", x + width - 10)
      .attr("y", y + height - 10)
      .attr("width", 10)
      .attr("height", 10)
      .attr("fill", "#007bff")
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .style("cursor", "nw-resize")
      .datum(d);
    
    // Make handle draggable for resizing
    handle.call(d3.drag()
      .on("drag", function(event, d) {
        const newWidth = Math.max(50, d.width + event.dx); // Allow smaller minimum width
        const newHeight = Math.max(50, d.height + event.dy); // Allow smaller minimum height
        
        // Update box size
        d3.select(`.flow-box[data-id="${d.id}"]`)
          .attr("width", newWidth)
          .attr("height", newHeight);
        
        // Update handle position
        d3.select(this)
          .attr("x", d.x + newWidth - 10)
          .attr("y", d.y + newHeight - 10);
        
        // Update the data
        d.width = newWidth;
        d.height = newHeight;
      })
      .on("end", function(event, d) {
        console.log("🎯 Finished resizing flow box:", d.id, "to", d.width, "x", d.height);
        saveFlowBoxPositions();
      })
    );
  });
}

// ✅ Save flow box positions and sizes
function saveFlowBoxPositions() {
  try {
    const savedBoxes = flowBoxes.map(box => ({
      id: box.id,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height
    }));
    
    localStorage.setItem('flowBoxPositions', JSON.stringify(savedBoxes));
    console.log("💾 Saved flow box positions:", savedBoxes);
  } catch (error) {
    console.error("❌ Error saving flow box positions:", error);
  }
}

// ✅ Load saved flow box positions
function loadFlowBoxPositions() {
  try {
    const savedBoxes = JSON.parse(localStorage.getItem('flowBoxPositions') || '[]');
    
    if (savedBoxes.length > 0) {
      savedBoxes.forEach(savedBox => {
        const box = flowBoxes.find(b => b.id === savedBox.id);
        if (box) {
          box.x = savedBox.x;
          box.y = savedBox.y;
          box.width = savedBox.width;
          box.height = savedBox.height;
        }
      });
      console.log("📂 Loaded saved flow box positions:", savedBoxes);
    }
  } catch (error) {
    console.error("❌ Error loading saved flow box positions:", error);
  }
}

// ✅ Make window globally available
window.updateFlowForSchool = updateFlowForSchool;

// ✅ Test function for debugging
window.testStoberElementary = function() {
  console.log("🧪 Testing Stober Elementary logic");
  const stober = schoolData.find(r => r["Building Name"] === "Stober Elementary");
  if (stober) {
    console.log("Stober data:", stober);
    console.log("Current thresholds:", window.thresholds);
    const decision = getEnrollmentDecision(stober, window.thresholds);
    console.log("Enrollment decision:", decision);
  } else {
    console.log("Stober Elementary not found in school data");
  }
};

// ✅ Test function for dynamic display
window.testDynamicDisplay = function() {
  console.log("🧪 Testing dynamic display");
  const stober = schoolData.find(r => r["Building Name"] === "Stober Elementary");
  if (stober) {
    console.log("Testing formatSliderValue with Stober data:");
    const formatted = formatSliderValue("utilSlider", 0.6, stober);
    console.log("Formatted result:", formatted);
  } else {
    console.log("Stober Elementary not found in school data");
  }
};

// ✅ Test function to force update node labels
window.forceUpdateNodes = function() {
  console.log("🧪 Force updating all node labels");
  const stober = schoolData.find(r => r["Building Name"] === "Stober Elementary");
  console.log("Current thresholds:", window.thresholds);
  FlowUtils.updateNodeLabels(stober);
  console.log("✅ Force update complete");
};

// ✅ Helper function to update links when nodes are moved
function updateLinks() {
  g.select(".links")
    .selectAll("path")
    .attr("d", d => {
      const source = nodes.find(n => n.id === d.source);
      const target = nodes.find(n => n.id === d.target);
      
      if (!source || !target) return "";

      // When editing layout manually, keep links simple/fast.
      // ELK routing is only valid for the last auto-layout.
      return `M${source.fx},${source.fy} L${target.fx},${target.fy}`;
    });
}

// ✅ Helper function to save node positions to localStorage
function saveNodePosition(nodeId, x, y) {
  try {
    const savedPositions = JSON.parse(localStorage.getItem('flowchartNodePositions') || '{}');
    savedPositions[nodeId] = { x: x, y: y };
    localStorage.setItem('flowchartNodePositions', JSON.stringify(savedPositions));
    console.log("💾 Saved position for node", nodeId, ":", x, y);
  } catch (error) {
    console.error("❌ Error saving node position:", error);
  }
}

// ✅ Helper function to load saved node positions
function loadSavedPositions() {
  try {
    const savedPositions = JSON.parse(localStorage.getItem('flowchartNodePositions') || '{}');
    nodes.forEach(node => {
      if (savedPositions[node.id]) {
        node.fx = savedPositions[node.id].x;
        node.fy = savedPositions[node.id].y;
        console.log("📂 Loaded saved position for node", node.id, ":", node.fx, node.fy);
      }
    });
  } catch (error) {
    console.error("❌ Error loading saved positions:", error);
  }
}


// ✅ Save current layout as default
window.saveCurrentLayoutAsDefault = function() {
  try {
    // Get current positions from the nodes array
    const currentPositions = {};
    nodes.forEach(node => {
      if (node.fx !== undefined && node.fy !== undefined) {
        currentPositions[node.id] = { x: node.fx, y: node.fy };
      }
    });
    
    // Save node positions to localStorage
    localStorage.setItem('flowchartNodePositions', JSON.stringify(currentPositions));
    console.log("💾 Saved current layout as default for", Object.keys(currentPositions).length, "nodes");
    
    // Also save the current zoom level
    if (svg && g) {
      const currentTransform = d3.zoomTransform(svg.node());
      if (currentTransform) {
        localStorage.setItem('flowchartZoom', JSON.stringify({
          x: currentTransform.x,
          y: currentTransform.y,
          k: currentTransform.k
        }));
        console.log("💾 Saved current zoom level:", {
          x: currentTransform.x,
          y: currentTransform.y,
          k: currentTransform.k
        });
      }
    }
    
    alert("Current layout and zoom level saved as default! This will be used when the page loads.");
    
  } catch (error) {
    console.error("❌ Error saving current layout:", error);
    alert("Error saving layout. Please try again.");
  }
};

// ✅ Export current positions as code for updating hardcoded defaults
window.exportPositionsAsCode = function() {
  try {
    const savedPositions = JSON.parse(localStorage.getItem('flowchartNodePositions') || '{}');
    
    if (Object.keys(savedPositions).length === 0) {
      console.log("⚠️ No saved positions found in localStorage");
      return null;
    }
    
    // Node order matching initializeFlowchartData
    const nodeOrder = [
      "START", "F1_UTIL1", "F1_UTIL2", "F1_GROWTH2", "F1_DIST", "F1_GROWTH",
      "F2_ATTENDANCE", "F2_EXPAND", "F2_FAC", "F2_EDU1", "F2_EDU2", "F2_OUT1", "F2_OUT2", "F2_OUT3", "F2_OUT4",
      "F3_FAC_ABOVE", "F3_FAC_BELOW", "F3_EDU1", "F3_EDU2", "F3_OUT1", "F3_OUT2", "F3_OUT3", "F3_OUT4",
      "F4_EDU1", "F4_FAC1", "F4_FAC2", "F4_DIST", "F4_OUT1", "F4_OUT2", "F4_OUT3", "F4_OUT4"
    ];
    
    console.log("📋 Current positions from localStorage:");
    console.log(JSON.stringify(savedPositions, null, 2));
    
    // Also log in a format that's easy to copy
    let codeOutput = "\n// Copy these positions to update hardcoded defaults:\n";
    nodeOrder.forEach(nodeId => {
      if (savedPositions[nodeId]) {
        codeOutput += `"${nodeId}": { x: ${savedPositions[nodeId].x}, y: ${savedPositions[nodeId].y} },\n`;
      }
    });
    console.log(codeOutput);
    
    return savedPositions;
  } catch (error) {
    console.error("❌ Error exporting positions:", error);
    return null;
  }
};

// ✅ Add function to force refresh thresholds and labels
window.refreshFlowchartThresholds = function() {
  console.log("🔄 Force refreshing flowchart thresholds");
  
  // Clear any cached threshold data
  if (window.thresholds) {
    delete window.thresholds;
  }
  
  // Force reinitialize from sliders
  if (typeof document !== 'undefined') {
    const utilSlider = document.getElementById('utilSlider');
    const utilHighSlider = document.getElementById('utilHighSlider');
    const growthSlider = document.getElementById('growthSlider');
    
    if (utilSlider && utilHighSlider && growthSlider) {
      window.thresholds = {
        utilization: parseFloat(utilSlider.value) / 100,
        utilizationHigh: parseFloat(utilHighSlider.value) / 100,
        enrollmentGrowth: parseFloat(growthSlider.value) / 100
      };
      
      console.log("🔄 Refreshed thresholds:", window.thresholds);
      
      // Update node labels
      if (window.FlowUtils && window.FlowUtils.updateNodeLabels) {
        window.FlowUtils.updateNodeLabels();
      }
      
      // Re-render flowchart
      if (typeof renderFlowchart === 'function') {
        renderFlowchart();
      }
    }
  }
};





// ✅ Listen for incoming thresholds and update labels
window.addEventListener("message", (event) => {
  const { thresholds } = event.data || {};

  if (thresholds) {
    console.log("📨 FlowchartLogic received thresholds:", thresholds);
    window.thresholds = thresholds;
    
    if (typeof FlowUtils.updateNodeLabels === 'function') {
      // Get currently selected school data for dynamic enrollment display
      const selectedSchoolData = getSelectedSchoolData();
      FlowUtils.updateNodeLabels(selectedSchoolData);
    }

    // ✅ Re-evaluate and highlight the path for the currently selected school in the main view
    const mainFlowchartSelect = document.getElementById('mainFlowchartSchoolSelect');
    if (mainFlowchartSelect) { // Check ensures this only runs for the main page's flowchart
      const selectedSchool = mainFlowchartSelect.value;
      if (selectedSchool && typeof updateFlowForSchool === 'function') {
        updateFlowForSchool(selectedSchool, window.thresholds);
      }
    }
  }
});

// ✅ Initialize for iframe context (original functionality)
document.addEventListener("DOMContentLoaded", () => {
  // Only initialize if we're in the iframe context
  if (document.getElementById("flowchart-container") && !document.getElementById("main-flowchart-container")) {
    svg = d3.select("svg"); // ✅ Assign to global svg
    g = svg.append("g");

    g.append("g").attr("class", "links");
    g.append("g").attr("class", "nodes");
    g.append("g").attr("class", "link-labels");

    // Get current zoom level from localStorage or use default.
    // Default to identity and auto-fit after first render (unless user saved a default zoom).
    let currentTransform = d3.zoomIdentity;
    const savedTransform = localStorage.getItem('flowchartZoom');
    const hasSavedTransform = !!savedTransform;
    if (savedTransform) {
      try {
        const parsed = JSON.parse(savedTransform);
        currentTransform = d3.zoomIdentity.translate(parsed.x, parsed.y).scale(parsed.k);
        console.log('Restoring saved flowchart transform (second init):', parsed);
      } catch (e) {
        console.log('Could not parse saved zoom level, using default');
      }
    } else {
      console.log('No saved flowchart transform found (second init), using default');
    }

    const zoomBehavior = d3.zoom()
      .scaleExtent([0.3, 3])
      .wheelDelta(function(event) {
        // Make zoom steps smaller by reducing the wheel delta
        return -event.deltaY * 0.002;
      })
      .on("zoom", e => {
        g.attr("transform", e.transform);
        // Don't auto-save zoom - only save when user clicks "Save Layout"
      });

    flowchartZoomBehavior = zoomBehavior;
    window.flowchartZoomBehavior = zoomBehavior;
    svg.call(zoomBehavior);

    // Apply the initial transform using d3's zoom API (not just the transform attribute)
    setTimeout(() => {
      svg.call(zoomBehavior.transform, currentTransform);
      console.log('Applied saved transform using zoom API (second init):', currentTransform.toString());
    }, 100);


    initializeFlowchartData();
    Promise.resolve(applyElkLayoutIfAvailable())
      .then((elkApplied) => {
        renderFlowchart();
        loadSchoolData();
        // If the user hasn't saved a preferred zoom, auto-fit so the ELK layout is framed nicely.
        if (!hasSavedTransform) {
          setTimeout(() => {
            if (typeof window.zoomFlowchartToFit === 'function') window.zoomFlowchartToFit();
          }, 250);
        }
      });
    
    // Removed aggressive transform re-application that was causing zoom jumps

    // Set up school select for iframe
    const select = document.getElementById("schoolSelect");
    if (select) {
      select.addEventListener("change", () => updateFlowForSchool(select.value, window.thresholds));
    }
  }
});


// Add this utility to get enrollment from Map_Export.csv
function loadMapExportData(callback) {
  if (mapExportData) { callback && callback(); return; }
  Papa.parse("https://raw.githubusercontent.com/DWieberdink/Jeffco/main/Map_Export.csv", {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function(res) {
      mapExportData = res.data;
      if (callback) callback();
    },
    error: function(err) {
      console.error("❌ Failed to load Map_Export.csv:", err);
      if (callback) callback();
    }
  });
}

// function getSchoolType(row, schoolName) {
//   // Use the School Level from Decision Data Export.csv
//   const level = (row["School Level"] || "").toLowerCase();
//   if (level.includes("high")) return "High School";
//   if (level.includes("middle")) return "Middle School";
//   if (level.includes("elementary") || level.includes("k-8")) return "Elementary School";
//   return row["School Level"] || "Unknown";
// }

function getEnrollmentFromMapExport(schoolName) {
  if (!mapExportData) return null;
  const row = mapExportData.find(r => (r["Building Name"] || "").trim() === schoolName.trim());
  return row ? row["Enrollment"] : null;
}

// Update updateFlowchartSchoolInfo to use Map_Export.csv for enrollment
function updateFlowchartSchoolInfo(name) {
  const infoDivId = "flowchart-school-info";
  let infoDiv = document.getElementById(infoDivId);
  if (!infoDiv) {
    // Insert the info div just below the .flowchart-header
    const header = document.querySelector("#main-flowchart-container .flowchart-header");
    if (header) {
      infoDiv = document.createElement("div");
      infoDiv.id = infoDivId;
      infoDiv.style.margin = "2px 0 4px 0";
      infoDiv.style.fontSize = "13px";
      infoDiv.style.fontWeight = "bold";
      infoDiv.style.color = "#333";
      infoDiv.style.fontFamily = "'Franklin Gothic Book', 'Franklin Gothic', 'Arial Narrow', Arial, sans-serif";
      header.insertAdjacentElement("afterend", infoDiv);
    }
  }
  if (!infoDiv) return;
  // Always set font family in case infoDiv already exists
  infoDiv.style.fontFamily = "'Franklin Gothic Book', 'Franklin Gothic', 'Arial Narrow', Arial, sans-serif";
  const row = schoolData.find(r => r["Building Name"] === name);
  if (!row) {
    infoDiv.innerHTML = "";
    const existingList = document.getElementById("flowchart-welcoming-list");
    if (existingList) existingList.innerHTML = "";
    return;
  }
  // Get enrollment from Map_Export.csv if available
  // Enrollment from Decision Data Export only (no Map_Export override)
  let enroll = getVal(row, ["Enrollment"]) || "N/A";
  const utilRaw = getVal(row, ["Utilization"]);
  const util = utilRaw ? (parseFloat(utilRaw) * 100).toFixed(1) + "%" : "N/A";
  // Find the actual key for School Level (case-insensitive, trimmed)
  let schoolLevelKey = Object.keys(row).find(k => k.trim().toLowerCase() === "school level");
  let schoolType = (schoolLevelKey && row[schoolLevelKey] && row[schoolLevelKey].trim() !== "") ? row[schoolLevelKey] : "N/A";

  let growth = getVal(row, ["Future_EnrollmentGrowth", "Projected Enrollment Growth"]);
  if (growth !== undefined && growth !== null && growth !== "") {
    growth = (parseFloat(growth) * 100).toFixed(1) + "%";
  } else {
    growth = "N/A";
  }
  // Get building quality score from Decision Data Export.csv
  let buildingScore = getVal(row, ["Building Score (1-9)", "BuildingScore"]);
  const buildingScoreNum = coerceBuildingScore0to10(buildingScore);
  if (isFinite(buildingScoreNum)) buildingScore = buildingScoreNum.toFixed(2);
  if (buildingScore !== undefined && buildingScore !== null && buildingScore !== "") {
    buildingScore = parseFloat(buildingScore).toFixed(2);
  } else {
    buildingScore = "N/A";
  }
  
  // Get Educational Adequacy
  let educationalAdequacy = getVal(row, ["EducationalAdequacy"]);
  if (educationalAdequacy !== undefined && educationalAdequacy !== null && educationalAdequacy !== "") {
    educationalAdequacy = (parseFloat(educationalAdequacy) * 100).toFixed(1) + "%";
  } else {
    educationalAdequacy = "N/A";
  }
  
  // Get Attendance Area Enrollment
  let attendanceAreaEnrollment = getVal(row, ["AttendanceAreaEnrollment", "Attendance Area Enrollment"]);
  if (attendanceAreaEnrollment !== undefined && attendanceAreaEnrollment !== null && attendanceAreaEnrollment !== "") {
    const pct = coercePercent0to100(attendanceAreaEnrollment);
    attendanceAreaEnrollment = (isFinite(pct) ? pct.toFixed(1) : 0) + "%";
  } else {
    attendanceAreaEnrollment = "N/A";
  }
  
  // Get Site Capacity (Space to expand)
  let siteCapacity = getVal(row, ["SiteCapacity", "Sitecapacity", "Site Capacity"]);
  if (siteCapacity === undefined || siteCapacity === null || siteCapacity === "") {
    siteCapacity = "N/A";
  } else {
    // Convert to more readable format
    siteCapacity = siteCapacity === "Yes" || siteCapacity === "yes" || siteCapacity === "YES" ? "Yes" : "No";
  }
  
  // Get Below 50% Percentile EA Category
  let below50PercentileEA = getVal(row, ["Below50PCTL_EA_Cat", "Below50PCTL EA", "Below50PCTL_EA"]);
  if (below50PercentileEA === undefined || below50PercentileEA === null || below50PercentileEA === "") {
    below50PercentileEA = "N/A";
  } else {
    // Convert to more readable format
    below50PercentileEA = below50PercentileEA === "Yes" || below50PercentileEA === "yes" || below50PercentileEA === "YES" ? "Yes" : "No";
  }
  
  infoDiv.innerHTML = `<div style='font-size:13px;font-weight:bold;margin-bottom:2px;text-decoration:none;font-family:"Franklin Gothic Book", "Franklin Gothic", "Arial Narrow", Arial, sans-serif;'>
  ${name}</div>
  <div style='font-family:"Franklin Gothic Book", "Franklin Gothic", "Arial Narrow", Arial, sans-serif; font-size:11px; margin-bottom:1px; line-height:1.3; display:flex; flex-wrap:wrap; gap:8px; align-items:center;'>
    <span>School Type: <strong>${schoolType}</strong></span>
    <span>Utilization: <strong>${util}</strong></span>
    <span>Enrollment: <strong>${enroll}</strong></span>
    <span>Growth: <strong>${growth}</strong></span>
  </div>
  <div style='font-family:"Franklin Gothic Book", "Franklin Gothic", "Arial Narrow", Arial, sans-serif; font-size:11px; margin-bottom:1px; line-height:1.3; display:flex; flex-wrap:wrap; gap:8px; align-items:center;'>
    <span>Educational Adequacy: <strong>${educationalAdequacy}</strong></span>
    <span>Building Score: <strong>${buildingScore}</strong></span>
    <span>Attendance Area Enrollment: <strong>${attendanceAreaEnrollment}</strong></span>
    <span>Site capacity for building expansion?: <strong>${siteCapacity}</strong></span>
    <button type="button" class="welcoming-schools-btn" data-school-name="${name}" style="padding:2px 6px;font-size:10px;border:1px solid #007cbf;border-radius:3px;background:#fff;color:#007cbf;cursor:pointer; white-space:nowrap;">
      Nearby schools
    </button>
  </div>
  <div style='font-family:"Franklin Gothic Book", "Franklin Gothic", "Arial Narrow", Arial, sans-serif; font-size:11px; line-height:1.3; display:flex; flex-wrap:wrap; gap:8px; align-items:center;'>
    <span>Below 50% Percentile EA: <strong>${below50PercentileEA}</strong></span>
  </div>`;

  // Ensure welcoming schools list container exists just below the info div
  let listDiv = document.getElementById("flowchart-welcoming-list");
  if (!listDiv && infoDiv && infoDiv.parentNode) {
    listDiv = document.createElement("div");
    listDiv.id = "flowchart-welcoming-list";
    listDiv.style.margin = "4px 0 8px 0";
    listDiv.style.fontFamily = "'Franklin Gothic Book', 'Franklin Gothic', 'Arial Narrow', Arial, sans-serif";
    listDiv.style.fontSize = "11px";
    infoDiv.insertAdjacentElement("afterend", listDiv);
  }

  // Wire the button to show nearby welcoming schools
  const btn = infoDiv.querySelector(".welcoming-schools-btn");
  if (btn) {
    // Reset expanded state whenever a new school is selected
    btn.setAttribute("data-expanded", "false");
    btn.textContent = "Nearby schools ▾";

    btn.addEventListener("click", function() {
      const schoolName = this.getAttribute("data-school-name");
      const listDivLocal = document.getElementById("flowchart-welcoming-list");
      if (!listDivLocal) return;

      const isExpanded = this.getAttribute("data-expanded") === "true";

      if (isExpanded) {
        // Collapse: hide the table but keep its content so we can re‑show quickly
        listDivLocal.style.display = "none";
        this.setAttribute("data-expanded", "false");
        this.textContent = "Nearby schools ▾";
      } else {
        // Expand: (re)build the table and show it
        showNearbyWelcomingSchools(schoolName);
        listDivLocal.style.display = "block";
        this.setAttribute("data-expanded", "true");
        this.textContent = "Nearby schools ▴";
      }
    });
  }
}

// Compute and render nearby welcoming schools based on SchooltoSchoolDistances.csv
function showNearbyWelcomingSchools(originName) {
  const listDiv = document.getElementById("flowchart-welcoming-list");
  if (!listDiv) return;

  if (!originName) {
    listDiv.innerHTML = "";
    return;
  }

  const originRow = schoolData.find(r => r["Building Name"] === originName);
  if (!originRow) {
    listDiv.innerHTML = "<em>No data available for this school.</em>";
    return;
  }

  // Prefer the shared SchooltoSchoolDistances lookup if available; otherwise fall back to legacy distance map.
  const uniqueId = originRow.UniqueID || originRow["UniqueID"] || originRow["Unique Id"];
  const originKey = (uniqueId && uniqueId.toString().trim().toLowerCase()) || "";
  const distancesByOrigin = window.schoolDistancesByOrigin || window.distanceToWelcomingRowsByOrigin || {};
  const rowsForOrigin = distancesByOrigin[originKey];

  // #region agent log
  // Debug ingest disabled: 127.0.0.1 endpoint not available in production
  // #endregion

  if (!originKey || !rowsForOrigin || !Array.isArray(rowsForOrigin)) {
    listDiv.innerHTML = "<em>No nearby schools found in the distance file.</em>";
    return;
  }

  // Determine the distance threshold from the sliders based on school level
  const thresholds = window.thresholds || (window.decisionLogic && window.decisionLogic.thresholds) || {};
  const level = normalizeSchoolLevelFlow(originRow["School Level"] || "");
  const levelDistances = {
    elementary: thresholds.elementaryDistance,
    k8: thresholds.k8Distance,
    middle: thresholds.middleDistance,
    high: thresholds.highDistance,
    k12: thresholds.k12Distance
  };
  const levelDistance = level ? levelDistances[level] : undefined;
  const globalDistance = thresholds.distanceUnderutilized;

  // Prefer level-specific distance; otherwise fall back to global slider; default to 5 if neither is set.
  let distanceThreshold = null;
  if (isFinite(levelDistance)) {
    distanceThreshold = levelDistance;
  } else if (isFinite(globalDistance)) {
    distanceThreshold = globalDistance;
  } else {
    distanceThreshold = 5.0;
  }

  // #region agent log
  // Debug ingest disabled: 127.0.0.1 endpoint not available in production
  // #endregion
  if (!isFinite(distanceThreshold) || distanceThreshold <= 0) {
    listDiv.innerHTML = "<em>Distance threshold is not set.</em>";
    return;
  }

  // Build a lookup for destination schools by UniqueID from decision data
  const decisionRows = (window.decisionLogic && Array.isArray(window.decisionLogic.schoolData))
    ? window.decisionLogic.schoolData
    : schoolData;
  const destById = new Map(
    (decisionRows || []).map(r => {
      const uid = (r.UniqueID || r["UniqueID"] || r["Unique Id"] || "").toString().trim().toLowerCase();
      return [uid, r];
    })
  );

  const cleanText = (val) => {
    const str = (val || "").toString().trim();
    return str.replace(/^'+\s*/, ""); // strip leading apostrophes often present in CSV
  };

  const candidatesRaw = rowsForOrigin || [];
  const finalCandidates = candidatesRaw
    .map(r => {
      const distRaw =
        r["Network Distance (Miles)"] ||
        r["Network Distance"] ||
        r["NetworkDistanceMiles"] ||
        r.distanceMiles;
      const dist = parseFloat((distRaw || "").toString().trim());
      if (!isFinite(dist) || dist > distanceThreshold) return null;

      const destPrefix =
        r["Destination CDE Prefix"] ||
        r["Destination CDE Prefix "] ||
        r["DestinationCDEPrefix"] ||
        r.destId;
      const destRow = destPrefix ? destById.get(destPrefix.toString().trim().toLowerCase()) : null;
      const destName = (destRow && destRow["Building Name"]) || r["Destination Facility Name"] || "Unknown";
      const destGrades = r["Destination Grades"] || (destRow && destRow["School Level"]) || "N/A";
      const capacity = destRow ? (destRow["Capacity"] || destRow.Capacity) : null;
      const available = destRow ? (destRow["Available Seats"] || destRow["AvailableSeats"] || destRow.AvailableSeats) : null;
      const availableNum = available !== undefined && available !== null && available !== ""
        ? Math.max(0, parseFloat(available.toString().replace(/,/g, "")) || 0)
        : null;
      const gradeOverlapRaw = r["Grade Overlap"] || r.gradeOverlap || "";
      const gradeOverlapClean = cleanText(gradeOverlapRaw);
      if (gradeOverlapClean && gradeOverlapClean.toLowerCase() === "no") return null; // skip non-overlapping rows

      return {
        name: destName,
        grades: destGrades,
        distance: dist,
        capacity: capacity,
        canAbsorb: availableNum,
        gradeOverlap: gradeOverlapClean
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);

  // #region agent log
  // Debug ingest disabled: 127.0.0.1 endpoint not available in production
  // #endregion

  if (!finalCandidates.length) {
    listDiv.innerHTML = "<em>No schools within the current distance threshold.</em>";
    return;
  }

  // #region agent log
  // Debug ingest disabled: 127.0.0.1 endpoint not available in production
  // #endregion

  let html = "<div style='margin-top:2px;'><strong>Nearby schools within threshold:</strong></div>";
  html += "<table style='width:100%;border-collapse:collapse;margin-top:2px;'>";
  html += "<thead><tr>" +
    "<th style='border:1px solid #ccc;padding:2px 4px;font-weight:600;'>Name</th>" +
    "<th style='border:1px solid #ccc;padding:2px 4px;font-weight:600;'>Grades</th>" +
    "<th style='border:1px solid #ccc;padding:2px 4px;font-weight:600;'>Overlapping Grades</th>" +
    "<th style='border:1px solid #ccc;padding:2px 4px;font-weight:600;'>Distance (mi)</th>" +
    "<th style='border:1px solid #ccc;padding:2px 4px;font-weight:600;'>Capacity</th>" +
    "<th style='border:1px solid #ccc;padding:2px 4px;font-weight:600;'>Open seats</th>" +
    "</tr></thead><tbody>";

  finalCandidates.forEach(c => {
    const capText = c.capacity !== undefined && c.capacity !== null && c.capacity !== ""
      ? c.capacity
      : "N/A";
    const absorbText = c.canAbsorb !== null && c.canAbsorb !== undefined
      ? c.canAbsorb.toLocaleString()
      : "N/A";
    const gradesText = cleanText(c.grades) || "—";
    const overlapClean = cleanText(c.gradeOverlap);
    const overlapText = overlapClean && overlapClean.toLowerCase() !== "no" ? overlapClean : "—";
    html += "<tr>" +
      `<td style='border:1px solid #ccc;padding:2px 4px;'>${c.name}</td>` +
      `<td style='border:1px solid #ccc;padding:2px 4px;'>${gradesText}</td>` +
      `<td style='border:1px solid #ccc;padding:2px 4px;'>${overlapText}</td>` +
      `<td style='border:1px solid #ccc;padding:2px 4px;'>${c.distance.toFixed(2)}</td>` +
      `<td style='border:1px solid #ccc;padding:2px 4px;'>${capText}</td>` +
      `<td style='border:1px solid #ccc;padding:2px 4px;'>${absorbText}</td>` +
      "</tr>";
  });

  html += "</tbody></table>";
  listDiv.innerHTML = html;
}

// Expose helpers globally so other scripts can trigger them
window.showNearbyWelcomingSchools = showNearbyWelcomingSchools;

// Click handler for the F1_DIST node icon; uses the currently selected flowchart school
window.handleWelcomingNodeClick = function() {
  const flowchartSelect = document.getElementById('mainFlowchartSchoolSelect');
  if (flowchartSelect && flowchartSelect.value) {
    showNearbyWelcomingSchools(flowchartSelect.value);
  } else {
    console.warn("⚠️ No school selected in mainFlowchartSchoolSelect; cannot show nearby welcoming schools.");
  }
};

// Patch the dropdown event to update info AND highlight flow, loading Map_Export.csv if needed
const mainFlowchartSelect = document.getElementById('mainFlowchartSchoolSelect');
if (mainFlowchartSelect) {
  mainFlowchartSelect.addEventListener('change', function() {
    const name = this.value;

    // Keep the map-view dropdown in sync when the main flowchart dropdown changes
    try {
      const mapOriginSelect = document.getElementById('mapOriginSchoolSelect');
      if (mapOriginSelect) {
        // Convert the selected school name to its UniqueID so we can set the
        // map dropdown, which stores UniqueID as its value.
        let uid = "";
        if (Array.isArray(schoolData) && name) {
          const row = schoolData.find(r => r["Building Name"] === name);
          if (row) {
            uid = (row.UniqueID || row["UniqueID"] || row["Unique Id"] || "").toString().trim();
          }
        }
        mapOriginSelect.value = uid || "";
      }
    } catch (e) {
      console.warn("⚠️ Unable to sync mapOriginSchoolSelect from FlowchartLogic change handler:", e);
    }

    // Ensure school-level info panel is updated
    loadMapExportData(() => updateFlowchartSchoolInfo(name));

    // Use current thresholds from window if available; fall back to decisionLogic thresholds or empty object
    const thresholds =
      (typeof window.thresholds === 'object' && window.thresholds) ||
      (window.decisionLogic && window.decisionLogic.thresholds) ||
      {};

    // Also drive the flowchart highlight when user selects from this dropdown
    if (typeof window.updateFlowForSchool === 'function') {
      window.updateFlowForSchool(name, thresholds);
    }

    // If the nearby-schools panel is visible, update it for the newly selected school
    if (typeof window.showNearbyWelcomingSchools === 'function' && name) {
      window.showNearbyWelcomingSchools(name);
    }
  });
  
  // Ensure school info is displayed on page load if a school is already selected
  if (mainFlowchartSelect.value) {
    const initialName = mainFlowchartSelect.value;
    loadMapExportData(() => updateFlowchartSchoolInfo(initialName));
  }
}

// Also update info and highlighting when flow is updated programmatically
window.updateFlowForSchool = function(name, thresholds) {
  loadMapExportData(() => updateFlowchartSchoolInfo(name));
  
  if (!name || name === "") {
    resetFlowchartVisibility();
    FlowUtils.updateNodeLabels(); // Update labels without school-specific data
    return;
  }
  
  const row = schoolData.find(r => r["Building Name"] === name);
  if (row) {
    console.log("✅ Found school data for:", name, "School Level:", row["School Level"]);
    const safeThresholds =
      thresholds ||
      (typeof window.thresholds === 'object' && window.thresholds) ||
      (window.decisionLogic && window.decisionLogic.thresholds) ||
      {};
    const { path, decisions, currentFlow} = evaluatePath(row, safeThresholds);
    highlightFlow(path, decisions, currentFlow);
    // Update node labels with school-specific data to show enrollment threshold
    console.log("🔄 About to update node labels with school data:", row["Building Name"]);
    FlowUtils.updateNodeLabels(row);
    console.log("✅ Node labels updated");
  } else {
    console.warn("⚠️ School not found in schoolData:", name);
    resetFlowchartVisibility();
    FlowUtils.updateNodeLabels(); // Update labels without school-specific data
  }
};

// --- Set current zoom as default ---
window.setCurrentZoomAsDefault = function() {
  if (!svg || !g) {
    console.log('[setCurrentZoomAsDefault] svg or g not initialized');
    return;
  }
  
  // Get current transform from the SVG
  const currentTransform = d3.zoomTransform(svg.node());
  if (currentTransform) {
    // Save current zoom level as default
    localStorage.setItem('flowchartZoom', JSON.stringify({
      x: currentTransform.x,
      y: currentTransform.y,
      k: currentTransform.k
    }));
    console.log('[setCurrentZoomAsDefault] Saved current zoom as default:', {
      x: currentTransform.x,
      y: currentTransform.y,
      k: currentTransform.k
    });
    alert('Current zoom level has been set as the default!');
  } else {
    console.log('[setCurrentZoomAsDefault] Could not get current transform');
  }
};

// --- Zoom to fit function ---
window.zoomFlowchartToFit = function() {
  console.log('[zoomFlowchartToFit] Called');
  if (!svg || !g) {
    console.log('[zoomFlowchartToFit] svg or g not initialized', {svg, g});
    return;
  }
  // Prefer the user's saved default zoom (from "Save Layout") if it exists.
  // This matches the "blue button" expectation: return to the preferred view.
  try {
    const saved = localStorage.getItem('flowchartZoom');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && isFinite(parsed.x) && isFinite(parsed.y) && isFinite(parsed.k)) {
        const zb0 = flowchartZoomBehavior || window.flowchartZoomBehavior;
        if (zb0) {
          console.log('[zoomFlowchartToFit] Using saved default zoom:', parsed);
          svg.transition().duration(350)
            .call(zb0.transform, d3.zoomIdentity.translate(parsed.x, parsed.y).scale(parsed.k));
          return;
        }
      }
    }
  } catch (e) {
    console.log('[zoomFlowchartToFit] Could not apply saved default zoom, falling back to fit', e);
  }
  // Ensure SVG is 100% width/height
  const svgNode = svg.node();
  if (svgNode) {
    svgNode.style.width = '100%';
    svgNode.style.height = '100%';
    svgNode.setAttribute('width', '100%');
    svgNode.setAttribute('height', '100%');
  }
  // Force reflow
  if (svgNode) void svgNode.offsetWidth;
  // Get bounding box of all content in the <g>
  const gNode = g.node();
  if (!gNode) {
    console.log('[zoomFlowchartToFit] g.node() not found');
    return;
  }
  const bbox = gNode.getBBox();
  // Get the SVG container size
  let width = 0, height = 0;
  if (svgNode) {
    width = svgNode.clientWidth || svgNode.parentNode.clientWidth;
    height = svgNode.clientHeight || svgNode.parentNode.clientHeight;
  }
  console.log('[zoomFlowchartToFit] bbox:', bbox, 'svg size:', width, height);
  if (!width || !height) return;
  // Add some padding
  const pad = 30;
  const boxWidth = bbox.width + pad * 2;
  const boxHeight = bbox.height + pad * 2;
  // Calculate scale to fit
  const scale = Math.min(width / boxWidth, height / boxHeight);
  // Center the content
  const tx = (width - bbox.width * scale) / 2 - bbox.x * scale + pad * scale;
  const ty = (height - bbox.height * scale) / 2 - bbox.y * scale + pad * scale;
  // Use the ACTIVE zoom behavior bound to the svg (not a new d3.zoom()).
  const zb = flowchartZoomBehavior || window.flowchartZoomBehavior;
  if (!zb) {
    console.log('[zoomFlowchartToFit] zoom behavior not initialized');
    return;
  }
  // Use d3.zoom to set transform after a longer delay
  setTimeout(() => {
    console.log('[zoomFlowchartToFit] Applying transform', {tx, ty, scale});
    svg.transition().duration(400)
      .call(zb.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }, 250);
};

// Center the flowchart view on a specific node id (used by the link hover menu)
window.centerFlowchartOnNode = function(nodeId) {
  try {
    if (!svg || !g || !Array.isArray(nodes)) return;
    const node = nodes.find(n => n && n.id === nodeId);
    if (!node) return;

    const svgNode = svg.node();
    if (!svgNode) return;

    const width = svgNode.clientWidth || (svgNode.parentNode ? svgNode.parentNode.clientWidth : 0) || 0;
    const height = svgNode.clientHeight || (svgNode.parentNode ? svgNode.parentNode.clientHeight : 0) || 0;
    if (!width || !height) return;

    // Keep current zoom level; just pan to center the node.
    let current = null;
    try {
      current = d3.zoomTransform(svgNode);
    } catch (e) {
      current = null;
    }
    const k = current && typeof current.k === "number" ? current.k : 1;

    const tx = (width / 2) - (node.fx * k);
    const ty = (height / 2) - (node.fy * k);

    const zb = flowchartZoomBehavior || window.flowchartZoomBehavior;
    if (!zb) return;
    svg.transition().duration(250)
      .call(zb.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
  } catch (e) {
    console.warn("⚠️ centerFlowchartOnNode failed:", e);
  }
};