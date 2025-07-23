// ✅ FlowchartLogic.js
let g;
let svg; // ✅ Make svg globally accessible
let nodes = []; 
window.FlowUtils = {};
let links = []; 
let schoolData = [];
let mapExportData = null;

// ✅ Global initialization function for main page
window.initializeFlowchartFromScript = function(svgElement) {
  console.log("🎯 Initializing flowchart from main script...");
  
  // Set up the SVG
  svg = d3.select(svgElement.node()); // ✅ Assign to global svg
  g = svg.append("g");

  g.append("g").attr("class", "links");
  g.append("g").attr("class", "nodes");
  g.append("g").attr("class", "link-labels");

  svg.call(d3.zoom().scaleExtent([0.5, 2]).on("zoom", e => g.attr("transform", e.transform)))
     .call(d3.zoom().transform, d3.zoomIdentity.translate(100, 250).scale(0.65)); // ✅ Original zoom level

 

  // Initialize the flowchart
  initializeFlowchartData();
  renderFlowchart();
  
  // Load school data
  loadSchoolData();
};

// ✅ Manual setup function for fallback
window.setupFlowchartManually = function(svgElement) {
  console.log("🎯 Setting up flowchart manually...");
  window.initializeFlowchartFromScript(svgElement);
};

function mapSliderKeyToThresholdKey(sliderId) {
  const mapping = {
    enrollmentSlider: "enrollmentThreshold",
    utilSlider: "utilization",
    utilHighSlider: "utilizationHigh",
    growthSlider: "enrollmentGrowth",
    projUtilSlider: "projectedUtilization",
    distSlider: "distanceUnderutilized",
    buildSlider: "buildingThreshold",
    progSlider: "adequateProgramsMin"
  };
  return mapping[sliderId];
}

// ✅ Initialize flowchart data
function initializeFlowchartData() {
  // Data Definition for the flowchart
  nodes = [
     // Enrollment Check (NEW - First Row) - moved up to fy: -30
    { id: "E", label: "Enrollment above", fx: 255, fy: -30, thresholdKey: "enrollmentSlider" },
   
     // First Row (remains at fy: 60)
    { id: "F", label: "Utilization above", fx: 5, fy: 60, thresholdKey: "utilSlider" },
    { id: "I", label: "Past 10 year growth", fx: 255, fy: 60, thresholdKey: "growthSlider" },
    { id: "M", label: "Within mile of another underutilized school", fx: 505, fy: 60, thresholdKey: "distSlider" },
   
   
     // Second Row
    { id: "G", label: "Utilization above", fx: 5, fy: 155, thresholdKey: "utilHighSlider" },

    // Third Row
    { id: "K", label: "5-yr projection above", fx: 5, fy: 255, thresholdKey: "projUtilSlider" },
    { id: "U", label: "Building Score ≤", fx: 255, fy: 255, thresholdKey: "buildSlider" },
    { id: "1", label: "Candidate for\nClosure/Merger", fx: 505, fy: 205 },
    
   
    // Fourth Row
    { id: "O", label: "Within mile of another underutilized school", fx: 5, fy: 355, thresholdKey: "distSlider" },
    { id: "X", label: "More programs than", fx: 255, fy: 355, thresholdKey: "progSlider" },
    { id: "W", label: "More programs than", fx: 505, fy: 355, thresholdKey: "progSlider" },
    

    // Fifth Row
    { id: "Z", label: "Can School expand on site?", fx: 105, fy: 455, thresholdKey: null },

    // Outcomes (shifted to the right a bit)
    //Sixth Row
    { id: "5", label: "Building Investment", fx: 600, fy: 550 }, 
    { id: "20", label: "School-Specific Evaluation", fx: -50, fy: 550},

    // Seventh Row 
    { id: "4", label: "Building + Program Investment", fx: 475, fy: 630 },
    { id: "21", label: "Candidate for\nBuilding Addition", fx: 25, fy: 630 },

    // Eighth Row
    { id: "2", label: "Monitoring", fx: 150, fy: 700 },
    { id: "3", label: "Program Investment", fx: 350, fy: 700 },
  ];

  links = [
    { source: "E", target: "F", label: "Yes" },
    { source: "E", target: "1", label: "No" },
    { source: "F", target: "G", label: "Yes" }, 
    { source: "G", target: "K" }, 
    { source: "G", target: "U" },
    { source: "F", target: "I", label: "No"}, 
    { source: "I", target: "U" }, 
    { source: "I", target: "M" },
    { source: "M", target: "1" }, 
    { source: "M", target: "U" }, 
    { source: "K", target: "O" },
    { source: "K", target: "U" }, 
    { source: "O", target: "20" }, { source: "O", target: "Z" },
    { source: "Z", target: "21" }, { source: "Z", target: "20" }, { source: "U", target: "X" },
    { source: "U", target: "W" }, { source: "X", target: "2" }, { source: "X", target: "3" },
    { source: "W", target: "5" }, { source: "W", target: "4" }
  ];
}

// ✅ Render flowchart
function renderFlowchart() {
  console.log("🎯 Rendering flowchart with nodes:", nodes);
  
  // Clear all existing highlights
  svg.selectAll(".node")
    .classed("highlight", false)
    .classed("special-highlight", false);

  svg.selectAll(".link")
    .classed("active", false);

  // Draw Lines (Links) - use <path> for all, with custom curve for E→1
  g.select(".links")
    .selectAll("path")
    .data(links)
    .join("path")
    .attr("class", "link")
    .attr("d", d => {
      const source = nodes.find(n => n.id === d.source);
      const target = nodes.find(n => n.id === d.target);
      if (d.source === "E" && d.target === "1") {
        // Right-angle path: right from E, then down, then left to 1, all to the right of M
        const nodeWidth = 150;
        const nodeHeight = 65;
        const horizontalGap = 120; // distance to the right of M
        const startX = source.fx + nodeWidth / 2;
        const startY = source.fy;
        const m = nodes.find(n => n.id === "M");
        const rightOfM_X = m.fx + nodeWidth / 2 + horizontalGap;
        const endX = target.fx + nodeWidth / 2;
        const endY = target.fy;
        // Path: right from E, down to 1's y, left to 1
        return [
          `M${startX},${startY}`,
          `L${rightOfM_X},${startY}`,
          `L${rightOfM_X},${endY}`,
          `L${endX},${endY}`
        ].join(' ');
      } else if (d.source === "E" && d.target === "F") {
        // Custom right-angle path: left from E, left to center of F, then down into center of F
        const nodeWidthE = 180; // E is a rectangle node
        const nodeHeightE = 80;
        const nodeWidthF = 180;
        const nodeHeightF = 80;
        const startX = source.fx - nodeWidthE / 2; // left edge of E
        const startY = source.fy;
        const centerFX = target.fx; // center x of F
        const centerFY = target.fy; // center y of F
        return [
          `M${startX},${startY}`,
          `L${centerFX},${startY}`,
          `L${centerFX},${centerFY}`
        ].join(' ');
      } else if (d.source === "O" && d.target === "20") {
        // Custom path: left from O, down to center left of 20, then right into center left of 20
        const nodeWidthO = 180;
        const nodeHeightO = 80;
        const nodeWidth20 = 150;
        const nodeHeight20 = 65;
        const leftGap = 60; // how far left to go before turning down
        const startX = source.fx - nodeWidthO / 2; // left edge of O
        const startY = source.fy;
        const leftX = startX - leftGap;
        const endX = target.fx - nodeWidth20 / 2; // center left of 20
        const endY = target.fy; // vertical center of 20
        return [
          `M${startX},${startY}`,
          `L${leftX},${startY}`,
          `L${leftX},${endY}`,
          `L${endX},${endY}`
        ].join(' ');
      } else if (d.source === "Z" && d.target === "20") {
        // Custom path: right from Z, right to center of 20, then down into top of 20
        const nodeWidthZ = 180;
        const nodeHeightZ = 80;
        const nodeWidth20 = 150;
        const nodeHeight20 = 65;
        const startX = source.fx + nodeWidthZ / 2; // right edge of Z
        const startY = source.fy;
        const center20X = target.fx; // center x of 20
        const top20Y = target.fy - nodeHeight20 / 2; // top of 20
        return [
          `M${startX},${startY}`,
          `L${center20X},${startY}`,
          `L${center20X},${top20Y}`
        ].join(' ');
      } else if (d.source === "W" && d.target === "5") {
        // Custom path: right from W, further right, then down, entering slightly right of center of 5
        const nodeWidthW = 150;
        const nodeHeightW = 65;
        const nodeWidth5 = 150;
        const nodeHeight5 = 65;
        const offset = 40; // how far to go right before going down
        const startX = source.fx + nodeWidthW / 2; // right edge of W
        const startY = source.fy;
        const rightX = startX + offset;
        const entryX = target.fx + offset; // enter slightly right of center
        const top5Y = target.fy - nodeHeight5 / 2; // top of 5
        return [
          `M${startX},${startY}`,
          `L${rightX},${startY}`,
          `L${rightX},${top5Y}`,
          `L${entryX},${top5Y}`,
          `L${entryX},${target.fy}`
        ].join(' ');
      } else if (d.source === "G" && d.target === "U") {
        // Custom path: start at center right of G, go to center of U
        const nodeWidthG = 180;
        const startX = source.fx + nodeWidthG / 2; // right edge of G
        const startY = source.fy;
        const endX = target.fx;
        const endY = target.fy;
        return `M${startX},${startY} L${endX},${endY}`;
      } else if (d.source === "U" && d.target === "W"){
        const nodeWidthU = 180;
        const startX = source.fx + nodeWidthU / 2; // right edge of U
        const startY = source.fy;
        const endX = target.fx;
        const endY = target.fy;
        return `M${startX},${startY} L${endX},${endY}`;
      }
       else {
        return `M${source.fx},${source.fy} L${target.fx},${target.fy}`;
      }
    });

  g.select(".nodes")
    .selectAll("g")
    .data(nodes)
    .join("g")
    .attr("class", "node")
    .attr("transform", d => `translate(${d.fx},${d.fy})`)
    .each(function (d) {
      const group = d3.select(this);
      const ellipseIds = ["1","4", "5", "2", "3", "20", "21"];
  
      if (ellipseIds.includes(d.id)) {
        group.append("rect")
          .attr("width", 150)
          .attr("height", 65)
          .attr("x", -75)
          .attr("y", -32.5)
          .attr("rx", 20)
          .attr("ry", 20)
          .attr("class", "ellipse-node");
      } else {
        group.append("rect")
          .attr("width", 180)
          .attr("height", 80)
          .attr("x", -90)
          .attr("y", -40)
          .attr("rx", 6)
          .attr("ry", 6);
      }
  
      let text = d.label;
      if (d.thresholdKey && window.thresholds) {
        const key = mapSliderKeyToThresholdKey(d.thresholdKey);
        if (key && window.thresholds[key] !== undefined) {
          const rawVal = window.thresholds[key];
          const formatted = formatSliderValue(d.thresholdKey, rawVal);
          text += `\n(${formatted})`;
        }
      }
  
      group.append("foreignObject")
        .attr("x", -75)
        .attr("y", -32.5)
        .attr("width", 150)
        .attr("height", 65)
        .append("xhtml:div")
        .style("display", "flex")
        .style("align-items", "center")
        .style("justify-content", "center")
        .style("height", "100%")
        .style("width", "100%")
        .style("font", "16px 'Franklin Gothic Book', 'Franklin Gothic', 'Arial Narrow', Arial, sans-serif")
        .style("font-family", "'Franklin Gothic Book', 'Franklin Gothic', 'Arial Narrow', Arial, sans-serif")
        .style("text-align", "center")
        .style("word-wrap", "break-word")
        .style("white-space", "pre-line")
        .text(text);
        
    });

  FlowUtils.updateNodeLabels();
}

// ✅ Load school data
function loadSchoolData() {
  Papa.parse("https://raw.githubusercontent.com/DWieberdink/JeffCo/main/Decision%20Data%20Export.csv", {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function (res) {
      schoolData = res.data;
      console.log("✅ School data loaded for flowchart:", schoolData.length, "schools");
      
      // Make updateFlowForSchool available globally
      window.updateFlowForSchool = updateFlowForSchool;
      window.schoolData = schoolData;
      
      // Set default thresholds if not already set
      window.thresholds = window.thresholds || {
        enrollmentThreshold: 200,
        utilization: 0.65,
        utilizationHigh: 0.95,
        enrollmentGrowth: 0,
        projectedUtilization: 0.95,
        distanceUnderutilized: 1.0,
        buildingThreshold: 1.5,
        adequateProgramsMin: 2
      };
      
      FlowUtils.updateNodeLabels();
    },
    error: function(err) {
      console.error("❌ Failed to load school data for flowchart:", err);
    }
  });
}

// Label Formatting
function formatSliderValue(key, value) {
  const num = parseFloat(value);
  switch (key) {
    case "enrollmentSlider":
      return num.toFixed(0);
    case "utilSlider":
    case "utilHighSlider":
    case "projUtilSlider":
      return `${Math.round(num * 100)}%`;
    case "growthSlider":
      return `${Math.round(num * 100)}%`;
    case "distSlider":
    case "buildSlider":
      return num.toFixed(1);
    case "progSlider":
      return parseInt(value, 10);
    default:
      return value;
  }
}

//Update Node Labels
FlowUtils.updateNodeLabels = function () {
  d3.selectAll(".node").each(function (d) {
    const group = d3.select(this);
    const foreign = group.select("foreignObject div");
    let text = d.label;
    if (d.thresholdKey && window.thresholds) {
      const rawVal = window.thresholds[mapSliderKeyToThresholdKey(d.thresholdKey)];
      const formatted = formatSliderValue(d.thresholdKey, rawVal);
      text += `\n(${formatted})`;
    }
    foreign.text(text);
  });
};

// ✅ Evaluate Path function
function evaluatePath(row, t) {
  // Robust enrollment field lookup
  const enrollmentRaw = row.Enrollment || row['Enrollment'] || row[' Enrollment'] || row['Enrollment '] || row['Enrollemnt'] || row['Enrolled'] || row['enrollment'] || row['enrollment_total'] || undefined;
  const enrollment = parseFloat((enrollmentRaw || '').toString().replace(/,/g, '').trim());
  console.log("🔍 Evaluating path for school:", row["Building Name"], "with enrollment:", enrollment, "threshold:", t.enrollmentThreshold);
  
  const d = {
    E: enrollment > t.enrollmentThreshold ? "Yes" : "No",
    F: +row.Utilization > t.utilization ? "Yes" : "No",
    G: +row.Utilization > t.utilizationHigh ? "Yes" : "No",
    K: +row.ExpectedUtilization10yrs > t.projectedUtilization ? "Yes" : "No",
    I: +row["2014-2024_EnrollmentGrowth"] > t.enrollmentGrowth ? "Yes" : "No",
    M: +row.DistanceUnderutilizedschools <= t.distanceUnderutilized ? "Yes" : "No",
    U: +row.BuildingTreshhold <= t.buildingThreshold ? "Yes" : "No",
    X: +row.AdequateProgramOffer >= t.adequateProgramsMin ? "Yes" : "No",
    W: +row.AdequateProgramOffer >= t.adequateProgramsMin ? "Yes" : "No",
    Z: (row.SiteCapacity || "").toLowerCase().includes("yes") ? "Yes" : "No",
  };
  d.O = d.M;

  console.log("📊 Decision values:", d);

  const path = [];
  
  // Start with enrollment check
  if (d.E === "No") {
    console.log("🚨 Enrollment below threshold - immediate closure/merger");
    path.push("E", "1"); // Immediate closure/merger
  } else {
    console.log("✅ Enrollment above threshold - continuing with normal logic");
    path.push("E", "F");
    // Continue with existing logic
    if (d.F === "No") {
      path.push("I");
      if (d.I === "No") {
        path.push("M");
        if (d.M === "Yes") path.push("1");
        else {
          path.push("U");
          if (d.U === "Yes") {
            if (d.X === "Yes") path.push("X", "2");
            else path.push("X", "3");
          } else {
            if (d.W === "Yes") path.push("W", "5");
            else path.push("W", "4");
          }
        }
      } else {
        path.push("U");
        if (d.U === "Yes") {
          if (d.X === "Yes") path.push("X", "2");
          else path.push("X", "3");
        } else {
          if (d.W === "Yes") path.push("W", "5");
          else path.push("W", "4");
        }
      }
    } else if (d.G === "No") {
      path.push("G", "U");
      if (d.U === "Yes") {
        if (d.X === "Yes") path.push("X", "2");
        else path.push("X", "3");
      } else {
        if (d.W === "Yes") path.push("W", "5");
        else path.push("W", "4");
      }
    } else if (d.K === "No") {
      path.push("G", "K", "U");
      if (d.U === "Yes") {
        if (d.X === "Yes") path.push("X", "2");
        else path.push("X", "3");
      } else {
        if (d.W === "Yes") path.push("W", "5");
        else path.push("W", "4");
      }
    } else {
      path.push("G", "K", "O");
      if (d.O === "Yes") path.push("20");
      else path.push("Z", d.Z === "Yes" ? "21" : "20");
    }
  }
  
  console.log("🛤️ Final path:", path);
  return { path, decisions: d };
}

// ✅ highlight flow function
function highlightFlow(path, decisions) {
  // Clear all existing highlights
  d3.selectAll(".node")
    .classed("highlight", false)
    .classed("special-highlight", false); 

  d3.selectAll(".link")
    .classed("active", false)
    .attr("marker-end", null);

  d3.selectAll(".link-label")
    .classed("active-label", false);

  // Highlight the path
  d3.selectAll(".node")
    .filter(d => path.includes(d.id))
    .classed("highlight", true);

  d3.selectAll(".node")
    .filter(d => [ "1", "2", "3", "4", "5", "20", "21"].includes(d.id) && path.includes(d.id))
    .classed("special-highlight", true);

  // Highlight the links
  d3.selectAll(".link")
    .filter(d => {
      const i = path.indexOf(d.source);
      return i >= 0 && path[i + 1] === d.target;
    })
    .classed("active", true)

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
  const row = schoolData.find(r => r["Building Name"] === name);
  if (row) {
    console.log("✅ Found school data for:", name);
    const { path, decisions} = evaluatePath(row, thresholds);
    console.log("🎨 Highlighting flow with path:", path);
    highlightFlow(path, decisions);
  } else {
    console.warn("⚠️ School not found:", name);
  }
}

// ✅ Make window globally available
window.updateFlowForSchool = updateFlowForSchool;

// ✅ Listen for incoming thresholds and update labels
window.addEventListener("message", (event) => {
  const { thresholds } = event.data || {};

  if (thresholds) {
    console.log("📨 FlowchartLogic received thresholds:", thresholds);
    window.thresholds = thresholds;
    
    if (typeof FlowUtils.updateNodeLabels === 'function') {
      FlowUtils.updateNodeLabels();
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

    svg.call(d3.zoom().scaleExtent([0.5, 2]).on("zoom", e => g.attr("transform", e.transform)))
       .call(d3.zoom().transform, d3.zoomIdentity.translate(100, 250).scale(0.65)); // ✅ Original zoom level


    initializeFlowchartData();
    renderFlowchart();
    loadSchoolData();

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
      infoDiv.style.margin = "8px 0 16px 0";
      infoDiv.style.fontSize = "16px";
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
    return;
  }
  // Get enrollment from Map_Export.csv if available
  let enroll = getEnrollmentFromMapExport(name);
  if (!enroll) enroll = row["Enrollment"] || "N/A";
  const util = row["Utilization"] ? (parseFloat(row["Utilization"]) * 100).toFixed(1) + "%" : "N/A";
  // Find the actual key for School Level (case-insensitive, trimmed)
  let schoolLevelKey = Object.keys(row).find(k => k.trim().toLowerCase() === "school level");
  let schoolType = (schoolLevelKey && row[schoolLevelKey] && row[schoolLevelKey].trim() !== "") ? row[schoolLevelKey] : "N/A";

  let growth = row["2014-2024_EnrollmentGrowth"];
  if (growth !== undefined && growth !== null && growth !== "") {
    growth = (parseFloat(growth) * 100).toFixed(1) + "%";
  } else {
    growth = "N/A";
  }
  let numPrograms = row["AdequateProgramOffer"];
  if (numPrograms === undefined || numPrograms === null || numPrograms === "") {
    numPrograms = "N/A";
  }
  // Get building quality score from Decision Data Export.csv
  let buildingScore = row["BuildingTreshhold"];
  if (buildingScore !== undefined && buildingScore !== null && buildingScore !== "") {
    buildingScore = parseFloat(buildingScore).toFixed(2);
  } else {
    buildingScore = "N/A";
  }
  infoDiv.innerHTML = `<div style='font-size:18px;font-weight:bold;margin-bottom:4px;text-decoration:none;font-family:"Franklin Gothic Book", "Franklin Gothic", "Arial Narrow", Arial, sans-serif;'>
  ${name}</div>
  <span style='font-family:"Franklin Gothic Book", "Franklin Gothic", "Arial Narrow", Arial, sans-serif; font-size:14px;'>
    <span>School Type: <strong>${schoolType}</strong></span> &nbsp; | &nbsp; Current Utilization: <strong>${util}</strong> &nbsp; | &nbsp; Current Enrollment: <strong>${enroll}</strong>
  </span>
  <div style='font-family:"Franklin Gothic Book", "Franklin Gothic", "Arial Narrow", Arial, sans-serif; margin-top:4px; font-size:14px;'>
    Enrollment Growth (2014-2024): <strong>${growth}</strong> &nbsp; | &nbsp; Number of Programs: <strong>${numPrograms}</strong> &nbsp; | &nbsp; Building Quality Score: <strong>${buildingScore}</strong>
  </div>`;
}

// Patch the dropdown event to update info, loading Map_Export.csv if needed
const mainFlowchartSelect = document.getElementById('mainFlowchartSchoolSelect');
if (mainFlowchartSelect) {
  mainFlowchartSelect.addEventListener('change', function() {
    loadMapExportData(() => updateFlowchartSchoolInfo(this.value));
  });
}
// Also update info when flow is updated programmatically
window.updateFlowForSchool = function(name, thresholds) {
  loadMapExportData(() => updateFlowchartSchoolInfo(name));
  const row = schoolData.find(r => r["Building Name"] === name);
  if (row) {
    const { path, decisions} = evaluatePath(row, thresholds);
    highlightFlow(path, decisions);
  }
};

// --- Zoom to fit function ---
window.zoomFlowchartToFit = function() {
  console.log('[zoomFlowchartToFit] Called');
  if (!svg || !g) {
    console.log('[zoomFlowchartToFit] svg or g not initialized', {svg, g});
    return;
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
  // Use d3.zoom to set transform after a longer delay
  setTimeout(() => {
    console.log('[zoomFlowchartToFit] Applying transform', {tx, ty, scale});
    svg.transition().duration(400)
      .call(d3.zoom().transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }, 250);
};