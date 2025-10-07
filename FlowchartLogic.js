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

  // Get current zoom level from localStorage or use default
  let currentTransform = d3.zoomIdentity.translate(50, 50).scale(0.85);
  const savedTransform = localStorage.getItem('flowchartZoom');
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

  svg.call(zoomBehavior);

  // Apply the initial transform using d3's zoom API (not just the transform attribute)
  setTimeout(() => {
    svg.call(zoomBehavior.transform, currentTransform);
    console.log('Applied saved transform using zoom API:', currentTransform.toString());
  }, 100);

 

  // Initialize the flowchart
  initializeFlowchartData();
  renderFlowchart();
  
  // Load school data
  loadSchoolData();
  
};

// ✅ Draw flow boxes to visually group each flow
function drawFlowBoxes() {
  console.log("📦 Drawing flow boxes");
  
  // Define flow box data (store globally) - Updated with saved layout positions
  flowBoxes = [
    {
      id: "flow1",
      label: "FLOW 1 - MAIN DECISION",
      x: -271.03200912475586,
      y: -333.68441009521484,
      width: 237.47534942626953,
      height: 626.8837738037109,
      color: "#e3f2fd"
    },
    {
      id: "flow2", 
      label: "FLOW 2 - BUILDING ADDITION",
      x: -29.000279426574707,
      y: -456.79920959472656,
      width: 699.0092468261719,
      height: 370.4703483581543,
      color: "#fff3e0"
    },
    {
      id: "flow3",
      label: "FLOW 3 - MAINTENANCE",
      x: -26.81069564819336,
      y: -81.96510314941406,
      width: 693.5711059570312,
      height: 298.2346954345703,
      color: "#e8f5e8"
    },
    {
      id: "flow4",
      label: "FLOW 4 - CONSOLIDATION",
      x: -26.216888427734375,
      y: 220.00949096679688,
      width: 688.54345703125,
      height: 398.50335693359375,
      color: "#fce4ec"
    }
  ];
  
  // Load saved positions if they exist
  loadFlowBoxPositions();
  
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
    distSlider: "distanceUnderutilized",
    siteCapacitySlider: "siteCapacity",
    buildSlider: "buildingThreshold",
    buildAboveSlider: "buildingThresholdAbove",
    buildBelowSlider: "buildingThresholdBelow",
    buildFlow4Slider: "buildingThresholdFlow4",
    progSlider: "adequateProgramsMin",
    recentInvestSlider: "recentInvestments",
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
  const flowchartData = {
      nodes: [
        // FLOW 1 - MAIN DECISION TREE (Centered) - Updated with saved layout positions
        { id: "START", label: "START HERE", fx: -351.5224304199219, fy: 2.6905438899993896, type: "start" },
        
        // Flow 1 Decision Nodes (Vertical stack)
        { id: "F1_UTIL1", label: "Enrollment below X students OR \nutilization below", fx: -150.195556640625, fy: -0.011830427683889866, thresholdKey: "utilSlider", flow: 1 },
        { id: "F1_UTIL2", label: "Current utilization\nabove threshold?", fx: -150.195556640625, fy: -97.29730224609375, thresholdKey: "utilHighSlider", flow: 1 },
        { id: "F1_GROWTH2", label: "Enrollment projected\nto grow?", fx: -151.3953399658203, fy: -196.53440856933594, thresholdKey: "growthSlider", flow: 1 },
        { id: "F1_DIST", label: "Distance to\nUnderutilized Schools", fx: -159.65386962890625, fy: 110.78551483154297, thresholdKey: "distSlider", flow: 1 },
        { id: "F1_GROWTH", label: "Enrollment projected\nto grow?", fx: -161.0050506591797, fy: 216.17811584472656, thresholdKey: "growthSlider", flow: 1 },
        
        // Flow Routing Nodes (Horizontal spread)
        { id: "TO_FLOW2", label: "Building Addition", fx: 52.85620880126953, fy: -138.92300415039062, type: "routing", targetFlow: 2 },
        { id: "TO_FLOW3", label: "Maintenance", fx: 50.530696868896484, fy: -0.057380907237529755, type: "routing", targetFlow: 3 },
        { id: "TO_FLOW4", label: "Consolidation", fx: 58.2057991027832, fy: 293.67974853515625, type: "routing", targetFlow: 4 },
        
        // FLOW 2 - BUILDING ADDITION (Left column) - Updated with saved layout positions
        { id: "F2_EXPAND", label: "Property has\nspace to expand?", fx: 221.39076232910156, fy: -135.09266662597656, thresholdKey: "siteCapacitySlider", flow: 2 },
        { id: "F2_FAC", label: "Facility condition\nabove threshold?", fx: 223.94432067871094, fy: -223.19027709960938, thresholdKey: "buildSlider", flow: 2 },
        { id: "F2_EDU1", label: "Educational adequacy\nabove threshold?", fx: 225.22109985351562, fy: -312.5646667480469, thresholdKey: "progSlider", flow: 2 },
        { id: "F2_EDU2", label: "Educational adequacy\nabove threshold?", fx: 415.46087646484375, fy: -221.91351318359375, thresholdKey: "progSlider", flow: 2 },
        { id: "F2_OUT1", label: "Building\nAddition", fx: 227.774658203125, fy: -396.8319396972656, type: "outcome", flow: 2 },
        { id: "F2_OUT2", label: "Policy Change\n& Re-Sort", fx: 409.07696533203125, fy: -129.98556518554688, type: "outcome", flow: 2 },
        { id: "F2_OUT3", label: "Replacement", fx: 590.3793334960938, fy: -216.806396484375, type: "outcome", flow: 2 },
        { id: "F2_OUT4", label: "Building Addition\n& Major Capital", fx: 416.7376403808594, fy: -308.7343444824219, type: "outcome", flow: 2 },
        
        // FLOW 3 - MAINTENANCE/INVESTMENT (Center column) - Updated with saved layout positions
        { id: "F3_FAC_ABOVE", label: "Facility condition\nabove threshold?", fx: 220.6871337890625, fy: -0.8997395038604736, thresholdKey: "buildAboveSlider", flow: 3 },
        { id: "F3_FAC_BELOW", label: "Facility condition\nbelow threshold?", fx: 406.35528564453125, fy: 1.3768327236175537, thresholdKey: "buildBelowSlider", flow: 3 },
        { id: "F3_EDU1", label: "Educational adequacy\nabove threshold?", fx: 216.475341796875, fy: 87.54791259765625, thresholdKey: "progSlider", flow: 3 },
        { id: "F3_EDU2", label: "Below 50% percentile EA or\nsafety/security issues?", fx: 405.512939453125, fy: 88.98212432861328, flow: 3 },
        { id: "F3_OUT1", label: "Target Capital\nInvestment", fx: 584.0929565429688, fy: 40.96768569946289, type: "outcome", flow: 3 },
        { id: "F3_OUT2", label: "Standard\nMaintenance", fx: 581.5658569335938, fy: 112.56816864013672, type: "outcome", flow: 3 },
        { id: "F3_OUT3", label: "Major Capital\nInvestment", fx: 403.8282165527344, fy: 169.8485565185547, type: "outcome", flow: 3 },
        { id: "F3_OUT4", label: "Replacement", fx: 215.6329803466797, fy: 171.7837677001953, type: "outcome", flow: 3 },
        
        // FLOW 4 - CONSOLIDATION/CLOSURE (Right column) - Updated with saved layout positions
        { id: "F4_INVEST", label: "Investments in past 5 years\nin school?", fx: 238.26861572265625, fy: 290.3452453613281, thresholdKey: "recentInvestSlider", flow: 4 },
        { id: "F4_EDU1", label: "Educational adequacy\nabove threshold?", fx: 239.38011169433594, fy: 379.26513671875, thresholdKey: "progSlider", flow: 4 },
        { id: "F4_FAC1", label: "Composite Building Score\nabove threshold?", fx: 435.00390625, fy: 375.9306640625, thresholdKey: "buildFlow4Slider", flow: 4 },
        { id: "F4_FAC2", label: "Composite Building Score\nabove threshold?", fx: 240.54241943359375, fy: 472.6531677246094, thresholdKey: "buildFlow4Slider", flow: 4 },
        { id: "F4_DIST", label: "Distance to\nWelcoming Schools", fx: 237.98886108398438, fy: 565.8578491210938, thresholdKey: "elementaryDistanceSlider", flow: 4 },
        { id: "F4_OUT1", label: "Consolidation\n(Welcoming)", fx: 436.11541748046875, fy: 285.89923095703125, type: "outcome", flow: 4 },
        { id: "F4_OUT2", label: "Consolidation\nWith Capital", fx: 433.33575439453125, fy: 470.099609375, type: "outcome", flow: 4 },
        { id: "F4_OUT3", label: "Closure\n(Goes Into Welcoming)", fx: 54.13298416137695, fy: 560.7507934570312, type: "outcome", flow: 4 },
        { id: "F4_OUT4", label: "Closure &\nReplacement", fx: 432.0589599609375, fy: 562.0275268554688, type: "outcome", flow: 4 },
      ],
      links: [
                        // FLOW 1 LINKS
                        { source: "START", target: "F1_UTIL1" },
                        { source: "F1_UTIL1", target: "F1_DIST", label: "Yes" },
                        { source: "F1_UTIL1", target: "F1_UTIL2", label: "No" },
                        { source: "F1_UTIL2", target: "F1_GROWTH2", label: "Yes" },
                        { source: "F1_UTIL2", target: "TO_FLOW3", label: "No" },
                        { source: "F1_GROWTH2", target: "TO_FLOW2", label: "Yes" },
                        { source: "F1_GROWTH2", target: "TO_FLOW3", label: "No" },
                        { source: "F1_DIST", target: "F1_GROWTH", label: "Yes" },
                        { source: "F1_DIST", target: "TO_FLOW3", label: "No" },
                        { source: "F1_GROWTH", target: "TO_FLOW3", label: "Yes" },
                        { source: "F1_GROWTH", target: "TO_FLOW4", label: "No" },
        
        // FLOW 2 LINKS
        { source: "TO_FLOW2", target: "F2_EXPAND" },
        { source: "F2_EXPAND", target: "F2_FAC", label: "Yes" },
        { source: "F2_EXPAND", target: "F2_OUT2", label: "No" }, // Direct to POLICY CHANGE & RE-SORT
        { source: "F2_FAC", target: "F2_EDU1", label: "Yes" },
        { source: "F2_FAC", target: "F2_EDU2", label: "No" },
        { source: "F2_EDU1", target: "F2_OUT1", label: "Yes" },
        { source: "F2_EDU1", target: "F2_OUT4", label: "No" },
        { source: "F2_EDU2", target: "F2_OUT4", label: "Yes" },
        { source: "F2_EDU2", target: "F2_OUT3", label: "No" },
        
        // FLOW 3 LINKS
        { source: "TO_FLOW3", target: "F3_FAC_ABOVE" },
        { source: "F3_FAC_ABOVE", target: "F3_FAC_BELOW", label: "Yes" },
        { source: "F3_FAC_ABOVE", target: "F3_EDU1", label: "No" },
        { source: "F3_FAC_BELOW", target: "F3_OUT1", label: "Yes" },
        { source: "F3_FAC_BELOW", target: "F3_EDU2", label: "No" },
        { source: "F3_EDU1", target: "F3_OUT3", label: "Yes" },
        { source: "F3_EDU1", target: "F3_OUT4", label: "No" },
        { source: "F3_EDU2", target: "F3_OUT2", label: "Yes" },
        { source: "F3_EDU2", target: "F3_OUT1", label: "No" },
        
        // FLOW 4 LINKS
        { source: "TO_FLOW4", target: "F4_INVEST" },
        { source: "F4_INVEST", target: "F4_OUT1", label: "Yes" },
        { source: "F4_INVEST", target: "F4_EDU1", label: "No" },
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
}

// ✅ Render flowchart
function renderFlowchart() {
  console.log("🎯 Rendering flowchart with nodes:", nodes);
  
  // Load any saved node positions
  loadSavedPositions();
  
  // Draw flow boxes to group each flow
  drawFlowBoxes();
  
  // Clear all existing highlights and dim all nodes and links
  svg.selectAll(".node")
    .classed("highlight", false)
    .classed("special-highlight", false)
    .classed("dimmed", true);

  svg.selectAll(".link")
    .classed("active", false)
    .classed("dimmed", true);

  // Draw Lines (Links) - simple straight lines with arrows
  g.select(".links")
    .selectAll("path")
    .data(links)
    .join("path")
    .attr("class", d => {
      if (d.label === "Yes") return "link link-yes";
      if (d.label === "No") return "link link-no";
      return "link";
    })
    .style("stroke-width", "3")
    .style("fill", "none")
    .attr("marker-end", d => {
      if (d.label === "Yes") return "url(#arrow-yes)";
      if (d.label === "No") return "url(#arrow-no)";
      return "url(#arrow-neutral)";
    })
    .attr("d", d => {
      const source = nodes.find(n => n.id === d.source);
      const target = nodes.find(n => n.id === d.target);
      
      if (!source || !target) return "";
      
      // Simple straight line between node centers
        return `M${source.fx},${source.fy} L${target.fx},${target.fy}`;
    });

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
      
      // Make the first utilization node bigger to fit the longer text
      if (d.id === "F1_UTIL1") {
        width = 220;
        height = 100;
        x = -110;
        y = -50;
      }
      
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
          
          dynamicNumber = `<span class="dynamic-number" style="background:#fff;padding:4px 0;border-top:1px solid #ddd;display:block;text-align:center;font-weight:bold;position:absolute;left:-2px;right:-2px;bottom:0;width:calc(100% + 4px);box-sizing:border-box;">${formatted}</span>`;
          console.log("🔍 Initial text for", d.id, ":", mainText, "Dynamic number:", dynamicNumber);
        } else {
          console.warn("⚠️ Initial render - Threshold value undefined for", d.id, "key:", key);
          dynamicNumber = `<span class="dynamic-number" style="background:#fff;padding:4px 0;border-top:1px solid #ddd;display:block;text-align:center;font-weight:bold;position:absolute;left:-2px;right:-2px;bottom:0;width:calc(100% + 4px);box-sizing:border-box;">undefined</span>`;
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
  Papa.parse("./Decision Data Export.csv", {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function (res) {
      // Filter out schools with Include_Flow_Chart = "No"
      schoolData = res.data.filter(row => {
        const includeFlowChart = row.Include_Flow_Chart;
        const shouldInclude = includeFlowChart && 
                             includeFlowChart.toLowerCase() !== 'no' && 
                             includeFlowChart.trim() !== '';
        if (!shouldInclude) {
          console.log(`🚫 Excluding school from flowchart: ${row["Building Name"]} (Include_Flow_Chart: "${includeFlowChart}")`);
        }
        return shouldInclude;
      });
      
      console.log(`📊 Filtered school data for flowchart: ${res.data.length} total schools → ${schoolData.length} included schools`);
      console.log("🔍 Sample school data:", schoolData[0]);
      console.log("🔍 Stober Elementary data:", schoolData.find(r => r["Building Name"] === "Stober Elementary"));
      
      // Make updateFlowForSchool available globally
      window.updateFlowForSchool = updateFlowForSchool;
      window.schoolData = schoolData;
      
      // Set default thresholds if not already set
      window.thresholds = window.thresholds || {
        enrollmentThreshold: 200,
        utilization: 0.60,
        utilizationHigh: 1.00,
        enrollmentGrowth: 0,
        projectedUtilization: 1.00,
        distanceUnderutilized: 3.5,
        buildingThreshold: 1.5,
        adequateProgramsMin: 50, // Changed to percentage (0-100)
        siteCapacity: "Yes",
        recentInvestments: 5, // Changed to millions of dollars
        // School-level enrollment thresholds
        elementaryEnrollment: 240,
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
    },
    error: function(err) {
      console.error("❌ Failed to load school data for flowchart:", err);
    }
  });
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
        const schoolLevel = (schoolData["School Level"] || '').toLowerCase();
        let enrollmentThreshold;
        
        console.log("🔍 formatSliderValue for utilSlider with schoolData:", schoolData["Building Name"], "School Level:", schoolLevel);
        
        if (schoolLevel.includes("elementary")) {
          enrollmentThreshold = window.thresholds?.elementaryEnrollment || 240;
        } else if (schoolLevel.includes("k-8")) {
          enrollmentThreshold = window.thresholds?.k8Enrollment || 360;
        } else if (schoolLevel.includes("middle")) {
          enrollmentThreshold = window.thresholds?.middleEnrollment || 500;
        } else if (schoolLevel.includes("high")) {
          enrollmentThreshold = window.thresholds?.highEnrollment || 700;
        } else if (schoolLevel.includes("6-12")) {
          enrollmentThreshold = window.thresholds?.k12Enrollment || 600;
        } else {
          enrollmentThreshold = 400;
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
    case "distSlider":
      return `${num.toFixed(1)} mi`;
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
      return parseInt(value, 10) + "%";
    case "recentInvestSlider":
      return `$${parseInt(value, 10)}M`;
    default:
      return value;
  }
}

//Update Node Labels
FlowUtils.updateNodeLabels = function (selectedSchoolData = null) {
  console.log("🔍 updateNodeLabels called with school data:", selectedSchoolData);
  d3.selectAll(".node").each(function (d) {
    const group = d3.select(this);
    const foreign = group.select("foreignObject div");
    
    let mainText = d.label;
    let dynamicNumber = "";
    
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
        } else {
          formatted = formatSliderValue(d.thresholdKey, rawVal, selectedSchoolData);
        }
        dynamicNumber = `<span class=\"dynamic-number\" style=\"background:#fff;padding:4px 0;border-top:1px solid #ddd;display:block;text-align:center;font-weight:bold;position:absolute;left:-2px;right:-2px;bottom:0;width:calc(100% + 4px);box-sizing:border-box;\">${formatted}</span>`;
        console.log("🔍 Final text for", d.id, ":", mainText, "Dynamic number:", dynamicNumber);
      } else {
        console.warn("⚠️ Threshold value undefined for", d.id, "thresholdKey:", thresholdKey);
        dynamicNumber = `<span class=\"dynamic-number\" style=\"background:#fff;padding:4px 0;border-top:1px solid #ddd;display:block;text-align:center;font-weight:bold;position:absolute;left:-2px;right:-2px;bottom:0;width:calc(100% + 4px);box-sizing:border-box;\">undefined</span>`;
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
  const schoolLevel = (row["School Level"] || '').toLowerCase();
  
  // Get enrollment thresholds from slider values
  let enrollmentThreshold;
  if (schoolLevel.includes("elementary")) {
    enrollmentThreshold = t.elementaryEnrollment || 240;
  } else if (schoolLevel.includes("k-8")) {
    enrollmentThreshold = t.k8Enrollment || 360;
  } else if (schoolLevel.includes("middle")) {
    enrollmentThreshold = t.middleEnrollment || 500;
  } else if (schoolLevel.includes("high")) {
    enrollmentThreshold = t.highEnrollment || 700;
  } else if (schoolLevel.includes("6-12")) {
    enrollmentThreshold = t.k12Enrollment || 600;
  } else {
    // Default threshold for unknown school types
    enrollmentThreshold = 400;
  }
  
  // Check if utilization below threshold OR enrollment below level-specific threshold
  // Either condition must be true for the school to be considered underutilized.
  // Note: Using OR logic allows schools to be flagged if either utilization is low OR enrollment is low.
  const utilizationBelowThreshold = utilization < t.utilization;
  const enrollmentBelowThreshold = enrollment < enrollmentThreshold;
  
  console.log(`📊 Enrollment decision for ${row["Building Name"]}:`);
  console.log(`  - Utilization: ${utilization} < ${t.utilization}? ${utilizationBelowThreshold}`);
  console.log(`  - Enrollment: ${enrollment} < ${enrollmentThreshold}? ${enrollmentBelowThreshold}`);
  console.log(`  - School Level: "${schoolLevel}"`);
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
      const schoolLevel = (row["School Level"] || '').toLowerCase();
      let distanceThreshold;
      
      if (schoolLevel.includes("elementary")) {
        distanceThreshold = t.elementaryDistance;
      } else if (schoolLevel.includes("k-8")) {
        distanceThreshold = t.k8Distance;
      } else if (schoolLevel.includes("middle")) {
        distanceThreshold = t.middleDistance;
      } else if (schoolLevel.includes("high")) {
        distanceThreshold = t.highDistance;
      } else if (schoolLevel.includes("6-12") || schoolLevel.includes("k-12")) {
        distanceThreshold = t.k12Distance;
      } else {
        distanceThreshold = t.middleDistance; // Default fallback
      }
      
      return +row.DistanceUnderutilizedschools <= distanceThreshold ? "Yes" : "No";
    })(),
    growth: +row["Future_EnrollmentGrowth"] > t.enrollmentGrowth ? "Yes" : "No",
    
    // Flow 2 - Building Addition
    edu2: (+row.EducationalAdequacy * 100) >= t.adequateProgramsMin ? "Yes" : "No",
    fac2: +row.BuildingScore <= t.buildingThreshold ? "Yes" : "No",
    expand: (row.SiteCapacity === "Yes" || row.SiteCapacity === "yes" || row.SiteCapacity === "YES") ? "Yes" : "No",
    
    // Flow 3 - Maintenance/Investment
    fac3_below: +row.BuildingScore <= t.buildingThresholdBelow ? "Yes" : "No",
    edu3: (+row.EducationalAdequacy * 100) >= t.adequateProgramsMin ? "Yes" : "No",
    edu3_2: (() => {
      // OR function: Below 50% percentile EA category OR safety/security issues
      const hasBelow50PercentileCategory = row["Below50PCTL_EA_Cat"];
      const isBelow50Percentile = hasBelow50PercentileCategory === "Yes" || hasBelow50PercentileCategory === "yes" || hasBelow50PercentileCategory === "YES";
      const hasSafetyIssues = (row.DepartmentalDeficiency && row.DepartmentalDeficiency.toLowerCase().includes('safety')) || 
                             (row.DepartmentalDeficiency && row.DepartmentalDeficiency.toLowerCase().includes('security'));
      return (isBelow50Percentile || hasSafetyIssues) ? "Yes" : "No";
    })(),
    fac3_above: +row.BuildingScore <= t.buildingThresholdAbove ? "Yes" : "No",
    
    // Flow 4 - Consolidation/Closure
    invest: +row.RecentInvestments >= t.recentInvestments ? "Yes" : "No",
    edu4: (+row.EducationalAdequacy * 100) >= t.adequateProgramsMin ? "Yes" : "No",
    fac4: +row.BuildingScore <= t.buildingThresholdFlow4 ? "Yes" : "No",
    dist4: (() => {
      const schoolLevel = (row["School Level"] || '').toLowerCase();
      let distanceThreshold;
      
      if (schoolLevel.includes("elementary")) {
        distanceThreshold = t.elementaryDistance;
      } else if (schoolLevel.includes("k-8")) {
        distanceThreshold = t.k8Distance;
      } else if (schoolLevel.includes("middle")) {
        distanceThreshold = t.middleDistance;
      } else if (schoolLevel.includes("high")) {
        distanceThreshold = t.highDistance;
      } else if (schoolLevel.includes("6-12")) {
        distanceThreshold = t.k12Distance;
      } else {
        distanceThreshold = t.middleDistance; // Default to middle school distance
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
        path.push("TO_FLOW3");
        currentFlow = 3;
      } else {
        path.push("TO_FLOW4");
        currentFlow = 4;
      }
    } else {
      path.push("TO_FLOW3");
      currentFlow = 3;
    }
  } else {
    // School does NOT meet both criteria (above at least one threshold)
    path.push("F1_UTIL2");
    if (decisions.util2 === "Yes") {
      path.push("TO_FLOW2");
      currentFlow = 2;
    } else {
      path.push("TO_FLOW3");
      currentFlow = 3;
    }
  }

  // FLOW 2 - Building Addition
  if (currentFlow === 2) {
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
    path.push("F4_INVEST");
    if (decisions.invest === "Yes") {
      path.push("F4_OUT1"); // CONSOLIDATION (Receiving)
    } else {
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
    
    // Restore full opacity to visible nodes with smooth transition
    d3.selectAll(".node")
      .filter(d => visibleNodes.has(d.id))
      .transition()
      .duration(400)
      .style("opacity", 1);
    
    // Restore full opacity to visible links with smooth transition
    d3.selectAll(".link")
      .filter(d => visibleLinks.has(`${d.source}-${d.target}`))
      .transition()
      .duration(400)
      .style("opacity", 1);
    
    // Restore full opacity to visible link labels with smooth transition
    d3.selectAll(".link-label")
      .filter(d => d && d.source && d.target && visibleLinks.has(`${d.source}-${d.target}`))
      .transition()
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
      
      // Simple straight line between node centers
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

    // Get current zoom level from localStorage or use default
    let currentTransform = d3.zoomIdentity.translate(50, 50).scale(0.85);
    const savedTransform = localStorage.getItem('flowchartZoom');
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

    svg.call(zoomBehavior);

    // Apply the initial transform using d3's zoom API (not just the transform attribute)
    setTimeout(() => {
      svg.call(zoomBehavior.transform, currentTransform);
      console.log('Applied saved transform using zoom API (second init):', currentTransform.toString());
    }, 100);


    initializeFlowchartData();
    renderFlowchart();
    loadSchoolData();
    
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
    return;
  }
  // Get enrollment from Map_Export.csv if available
  let enroll = getEnrollmentFromMapExport(name);
  if (!enroll) enroll = row["Enrollment"] || "N/A";
  const util = row["Utilization"] ? (parseFloat(row["Utilization"]) * 100).toFixed(1) + "%" : "N/A";
  // Find the actual key for School Level (case-insensitive, trimmed)
  let schoolLevelKey = Object.keys(row).find(k => k.trim().toLowerCase() === "school level");
  let schoolType = (schoolLevelKey && row[schoolLevelKey] && row[schoolLevelKey].trim() !== "") ? row[schoolLevelKey] : "N/A";

  let growth = row["Future_EnrollmentGrowth"];
  if (growth !== undefined && growth !== null && growth !== "") {
    growth = (parseFloat(growth) * 100).toFixed(1) + "%";
  } else {
    growth = "N/A";
  }
  // Get building quality score from Decision Data Export.csv
  let buildingScore = row["BuildingTreshhold"];
  if (buildingScore !== undefined && buildingScore !== null && buildingScore !== "") {
    buildingScore = parseFloat(buildingScore).toFixed(2);
  } else {
    buildingScore = "N/A";
  }
  
  // Get Educational Adequacy
  let educationalAdequacy = row["EducationalAdequacy"];
  if (educationalAdequacy !== undefined && educationalAdequacy !== null && educationalAdequacy !== "") {
    educationalAdequacy = (parseFloat(educationalAdequacy) * 100).toFixed(1) + "%";
  } else {
    educationalAdequacy = "N/A";
  }
  
  // Get Departmental Deficiency
  let departmentalDeficiency = row["DepartmentalDeficiency"];
  if (departmentalDeficiency === undefined || departmentalDeficiency === null || departmentalDeficiency === "") {
    departmentalDeficiency = "N/A";
  }
  
  // Get Site Capacity (Space to expand)
  let siteCapacity = row["SiteCapacity"];
  if (siteCapacity === undefined || siteCapacity === null || siteCapacity === "") {
    siteCapacity = "N/A";
  } else {
    // Convert to more readable format
    siteCapacity = siteCapacity === "Yes" || siteCapacity === "yes" || siteCapacity === "YES" ? "Yes" : "No";
  }
  
  // Get Distance to Underutilized Schools
  let distanceUnderutilized = row["DistanceUnderutilizedschools"];
  if (distanceUnderutilized !== undefined && distanceUnderutilized !== null && distanceUnderutilized !== "") {
    distanceUnderutilized = parseFloat(distanceUnderutilized).toFixed(1) + " mi";
  } else {
    distanceUnderutilized = "N/A";
  }
  
  // Get Recent Investments
  let recentInvestments = row["RecentInvestments"];
  if (recentInvestments !== undefined && recentInvestments !== null && recentInvestments !== "") {
    recentInvestments = "$" + parseFloat(recentInvestments).toFixed(1) + "M";
  } else {
    recentInvestments = "N/A";
  }
  
  // Get Below 50% Percentile EA Category
  let below50PercentileEA = row["Below50PCTL_EA_Cat"];
  if (below50PercentileEA === undefined || below50PercentileEA === null || below50PercentileEA === "") {
    below50PercentileEA = "N/A";
  } else {
    // Convert to more readable format
    below50PercentileEA = below50PercentileEA === "Yes" || below50PercentileEA === "yes" || below50PercentileEA === "YES" ? "Yes" : "No";
  }
  
  infoDiv.innerHTML = `<div style='font-size:13px;font-weight:bold;margin-bottom:2px;text-decoration:none;font-family:"Franklin Gothic Book", "Franklin Gothic", "Arial Narrow", Arial, sans-serif;'>
  ${name}</div>
  <div style='font-family:"Franklin Gothic Book", "Franklin Gothic", "Arial Narrow", Arial, sans-serif; font-size:11px; margin-bottom:1px; line-height:1.3;'>
    School Type: <strong>${schoolType}</strong> &nbsp; | &nbsp; Utilization: <strong>${util}</strong> &nbsp; | &nbsp; Enrollment: <strong>${enroll}</strong> &nbsp; | &nbsp; Growth: <strong>${growth}</strong>
  </div>
  <div style='font-family:"Franklin Gothic Book", "Franklin Gothic", "Arial Narrow", Arial, sans-serif; font-size:11px; margin-bottom:1px; line-height:1.3;'>
    Educational Adequacy: <strong>${educationalAdequacy}</strong> &nbsp; | &nbsp; Building Score: <strong>${buildingScore}</strong> &nbsp; | &nbsp; Space to Expand: <strong>${siteCapacity}</strong> &nbsp; | &nbsp; Distance: <strong>${distanceUnderutilized}</strong>
  </div>
  <div style='font-family:"Franklin Gothic Book", "Franklin Gothic", "Arial Narrow", Arial, sans-serif; font-size:11px; line-height:1.3;'>
    Departmental Deficiency: <strong>${departmentalDeficiency}</strong> &nbsp; | &nbsp; Below 50% Percentile EA: <strong>${below50PercentileEA}</strong> &nbsp; | &nbsp; Recent Investments: <strong>${recentInvestments}</strong>
  </div>`;
}

// Patch the dropdown event to update info, loading Map_Export.csv if needed
const mainFlowchartSelect = document.getElementById('mainFlowchartSchoolSelect');
if (mainFlowchartSelect) {
  mainFlowchartSelect.addEventListener('change', function() {
    loadMapExportData(() => updateFlowchartSchoolInfo(this.value));
  });
  
  // Ensure school info is displayed on page load if a school is already selected
  if (mainFlowchartSelect.value) {
    loadMapExportData(() => updateFlowchartSchoolInfo(mainFlowchartSelect.value));
  }
}
// Also update info when flow is updated programmatically
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
    const { path, decisions, currentFlow} = evaluatePath(row, thresholds);
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