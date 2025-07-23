mapboxgl.accessToken = 'pk.eyJ1IjoicGF0d2QwNSIsImEiOiJjbTZ2bGVhajIwMTlvMnFwc2owa3BxZHRoIn0.moDNfqMUolnHphdwsIF87w';


// Welcome Popup Password Functionality
document.addEventListener('DOMContentLoaded', function() {
  const welcomePopup = document.getElementById('welcomePopup');
  const passwordInput = document.getElementById('passwordInput');
  const enterBtn = document.getElementById('enterBtn');
  const errorMessage = document.getElementById('errorMessage');
  
  function checkPassword() {
    const password = passwordInput.value.trim();
    if (password === 'JeffCo') {
      welcomePopup.style.display = 'none';
      errorMessage.style.display = 'none';
      passwordInput.value = '';
      // Start onboarding walkthrough after successful login
      startOnboardingWalkthrough();
    } else {
      errorMessage.style.display = 'block';
      passwordInput.value = '';
      passwordInput.focus();
    }
  }
  
  // Enter button click
  enterBtn.addEventListener('click', checkPassword);
  
  // Enter key press
  passwordInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      checkPassword();
    }
  });
  
  // Focus on password input when popup loads
  passwordInput.focus();

  // Auto-open "School Decision Evaluation: Results" when "School Decision Evaluation" is opened
  const decisionInputPanel = document.getElementById('decision-input-panel');
  const decisionOutputPanel = document.getElementById('decision-output-panel');
  
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
              const totalCost = totalSquareFt * costMultiplier;
              
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
          const totalCost = totalSquareFt * costMultiplier;
          
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
  style: 'mapbox://styles/mapbox/light-v11'
  // center and zoom will be set dynamically after loading GeoJSON
});

let geojsonData;
let initialDecisionData = null; // Store data if it arrives before geojson
let mapIsReady = false; // Flag to track if the map's core is loaded
let selectedEnrollment = 0;
let odData = [];
let selectedTypes = [];
let minEnrollment = 0;
let maxEnrollment = 2000;
let minSeats = 0;
let maxSeats = 500;
let showVariableRadius = false;

function updateLayer() {
    if (!geojsonData) { return; } // Do not run if geojson data is not loaded yet

  const filteredFeatures = geojsonData.features.filter(f => {
    const enrollment = parseInt(f.properties['Enrollment']) || 0;
    const availableSeats = parseInt(f.properties['Available Seats']) || 0;
    const level = f.properties['School Level'];

    const matchesEnrollment = enrollment >= minEnrollment && enrollment <= maxEnrollment;
    const matchesSeats = availableSeats >= minSeats && availableSeats <= maxSeats;
    const matchesType = selectedTypes.length === 0 || selectedTypes.includes(level);

    return matchesEnrollment && matchesSeats && matchesType;
  });

  const updatedData = { ...geojsonData, features: filteredFeatures };
  map.getSource('schools').setData(updatedData);

  map.setPaintProperty('schools-layer', 'circle-radius',
    showVariableRadius
      ? ['interpolate', ['linear'], ['get', 'Available Seats'], 0, 4, 200, 20]
      : 6
  );
}

function normalize(str) {
    return str?.toLowerCase().replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
}

// ✅ Move updateLegend function outside map.on('load') for global access
let showingAssignments = false;
function updateLegend() {
  const legendContent = document.getElementById('legend-content');
  if (!legendContent) return;
  
  legendContent.innerHTML = '';

  const decisionLegend = {
    "Ongoing Monitoring & Evaluation": '#3498db',
    "Programmatic Investment": '#27ae60',
    "Building Investment": '#2ecc71',
    "Building & Programmatic Investments": '#1abc9c',
    "Candidate for Building Addition": '#9b59b6',
    "School-specific evaluation of alternative options": '#f1c40f',
    "Candidate for Closure/Merger": '#e74c3c',
    "Other / Unknown": '#7f8c8d'
  };

  const assignmentLegend = {
    "Assigned Students": '#FF530D'
  };

  const items = showingAssignments ? assignmentLegend : decisionLegend;

  const title = document.createElement('div');
  title.innerHTML = `<strong>${showingAssignments ? 'Assignment View' : 'Decision Types'}</strong>`;
  legendContent.appendChild(title);

  for (const [label, color] of Object.entries(items)) {
    const row = document.createElement('div');
    row.className = 'legend-row';
    row.innerHTML = `<span class="legend-swatch" style="background:${color};"></span>${label}`;
    legendContent.appendChild(row);
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

  const geojsonPromise = fetch('Schools.geojson').then(res => res.json());
  const decisionDataPromise = window.decisionLogic.initialize();

  Promise.all([geojsonPromise, decisionDataPromise])
    .then(([geojson, decisionData]) => {
      console.log("✅ Both GeoJSON and Decision Data are loaded.");
      geojsonData = geojson;
      
      injectDecisionsIntoGeoJSON(geojsonData, decisionData);
      initializeDropdownFilters(decisionData);

      // Add the source for the school data
      map.addSource('schools', {
        type: 'geojson',
        data: geojsonData
      });

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
          // Add a small delay to ensure map is ready
          setTimeout(() => {
            map.fitBounds(bounds, { padding: 40 });
            console.log("✅ Map should now be focused on Jeffco area");
          }, 100);
        }
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
          'circle-radius': 10,
          'circle-color': '#007cbf',
          'circle-opacity': 0.6
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
            "Ongoing Monitoring & Evaluation", '#3498db',
            "Programmatic Investment", '#27ae60',
            "Building Investment", '#2ecc71',
            "Building & Programmatic Investments", '#1abc9c',
            "Candidate for Building Addition", '#9b59b6',
            "School-specific evaluation of alternative options", '#f1c40f',
            "Candidate for Closure/Merger", '#e74c3c',
            '#7f8c8d'
          ]
        }
      });
      
      updateLegend();

      // Setup other map features that depend on the 'schools' source
      const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false
      });

      map.on('mouseenter', 'schools-layer', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const coordinates = e.features[0].geometry.coordinates.slice();
        const schoolName = e.features[0].properties['Building Name'];
        let popupContent = `<strong>${schoolName}</strong>`;
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
      });

      map.on('mouseleave', 'schools-layer', () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
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
          excludedSchoolsSelect.addEventListener('change', function(e) {
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
      let haloInterval = null;
      let haloRadius = 15;
      let haloGrowing = true;

      function startBlinkingHalo() {
        if (haloInterval) clearInterval(haloInterval);
        haloRadius = 15;
        haloGrowing = true;
        haloInterval = setInterval(() => {
          if (!map.getLayer('sending-school-halo')) return;
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
        if (map.getLayer('sending-school-halo')) {
          map.setPaintProperty('sending-school-halo', 'circle-opacity', 0);
        }
      }

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
  const schoolTypeFilter = document.getElementById('schoolTypeFilter');
  const unselectAllSchoolsBtn = document.getElementById('unselectAllSchoolsBtn');

  noUiSlider.create(enrollmentSlider, {
    start: [0, 2000], connect: true, step: 10, range: { min: 0, max: 2000 }
  });
  noUiSlider.create(seatsSlider, {
    start: [0, 500], connect: true, step: 1, range: { min: 0, max: 500 }
  });

  enrollmentSlider.noUiSlider.on('update', values => {
    minEnrollment = parseInt(values[0]);
    maxEnrollment = parseInt(values[1]);
    minEnrollDisplay.textContent = minEnrollment;
    maxEnrollDisplay.textContent = maxEnrollment;
    updateLayer();
  });

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

  schoolTypeFilter.addEventListener('change', () => {
    selectedTypes = Array.from(schoolTypeFilter.selectedOptions).map(o => o.value);
    updateLayer();
  });

  unselectAllSchoolsBtn.addEventListener('click', () => {
    for (let i = 0; i < schoolTypeFilter.options.length; i++) {
      schoolTypeFilter.options[i].selected = false;
    }
    schoolTypeFilter.dispatchEvent(new Event('change'));
  });

  // --- LEGEND AND TOGGLE LOGIC ---
  const toggleDecisionsBtn = document.getElementById('toggleViewDecisions');
  const toggleAssignmentsBtn = document.getElementById('toggleViewAssignments');
  
  toggleDecisionsBtn.addEventListener('click', () => {
    showingAssignments = false;
    toggleDecisionsBtn.classList.add('active');
    toggleAssignmentsBtn.classList.remove('active');

    if (map.getLayer('schools-layer')) {
      map.setPaintProperty(
        'schools-layer',
        'circle-color',
        ['match', ['get', 'Decision Type'],
          "Ongoing Monitoring & Evaluation", '#3498db',
          "Programmatic Investment", '#27ae60',
          "Building Investment", '#2ecc71',
          "Building & Programmatic Investments", '#1abc9c',
          "Candidate for Building Addition", '#9b59b6',
          "School-specific evaluation of alternative options", '#f1c40f',
          "Candidate for Closure/Merger", '#e74c3c',
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
  });

  toggleAssignmentsBtn.addEventListener('click', () => {
    showingAssignments = true;
    toggleAssignmentsBtn.classList.add('active');
    toggleDecisionsBtn.classList.remove('active');

    if (map.getLayer('schools-layer')) {
      map.setPaintProperty(
        'schools-layer',
        'circle-color',
        '#007cbf'
      );
    }

    if (map.getLayer('assigned-schools-layer')) {
      const assignedSource = map.getSource('assigned-schools');
      const hasAssignments = assignedSource && assignedSource._data?.features?.length > 0;

      map.setLayoutProperty(
        'assigned-schools-layer',
        'visibility',
        hasAssignments ? 'visible' : 'none'
      );
    }

    updateLegend();
  });

  // --- SIDEBAR AND MAP RESIZE LOGIC ---
  const sidebar = document.getElementById('map-sidebar');
  const mapContainer = document.getElementById('map-container');
  const mapToggleGroup = document.getElementById('map-toggle-group');

  // All toggle buttons
  const buttons = {
    wide: [document.getElementById('sidebar-wide-btn'), document.getElementById('flowchart-sidebar-wide-btn')],
    normal: [document.getElementById('sidebar-normal-btn'), document.getElementById('flowchart-sidebar-normal-btn')],
    hidden: [document.getElementById('sidebar-hidden-btn'), document.getElementById('flowchart-sidebar-hidden-btn')],
  };

  function updateSidebarState(newState) {
    const center = map.getCenter();

    // Update sidebar classes
    sidebar.classList.remove('wide', 'hidden');
    if (newState === 'wide' || newState === 'hidden') {
      sidebar.classList.add(newState);
    }
    
    // Update map toggle group classes for positioning
    mapToggleGroup.classList.remove('state-wide', 'state-hidden');
    if (newState === 'wide' || newState === 'hidden') {
      mapToggleGroup.classList.add(`state-${newState}`);
    }

    // Update active class on all relevant buttons
    Object.values(buttons).flat().forEach(btn => btn?.classList.remove('active'));
    buttons[newState].forEach(btn => btn?.classList.add('active'));

    // Recalculate container sizes
    const sidebarWidth = (newState === 'wide') ? 800 : (newState === 'normal') ? 400 : 0;
    const activeContainer = (mapContainer.style.display !== 'none') ? mapContainer : document.getElementById('main-flowchart-container');
    activeContainer.style.flexBasis = `calc(100% - ${sidebarWidth}px)`;

    // Resize map if it's visible
    if (mapContainer.style.display !== 'none') {
      setTimeout(() => {
        map.resize();
        map.setCenter(center);
      }, 350);
    }
    // Zoom flowchart to fit if in wide view and flowchart is visible
    if (newState === 'wide' && flowchartContainer && flowchartContainer.style.display !== 'none' && typeof window.zoomFlowchartToFit === 'function') {
      console.log('[updateSidebarState] Triggering zoomFlowchartToFit. flowchartContainer display:', flowchartContainer.style.display);
      setTimeout(() => {
        window.zoomFlowchartToFit();
      }, 400);
    }
  }

  // Add event listeners to all buttons
  Object.entries(buttons).forEach(([state, btnPair]) => {
    btnPair.forEach(btn => btn?.addEventListener('click', () => updateSidebarState(state)));
  });

  // --- INITIAL MARGIN & CENTER ON LOAD ---
  const sidebarWidth = sidebar.offsetWidth;
  mapContainer.style.flexBasis = `calc(100% - ${sidebarWidth}px)`;
  map.resize();

  // Removed hardcoded New Haven center - map will be set by fitBounds

  // --- IFRAME COMMUNICATION ---
  // The iframe has been removed. All communication is now direct function calls.
  // The DecisionLogic.js script, once loaded, will expose `window.decisionLogic`.
  
  // --- MAP/FLOWCHART TOGGLE ---
  let showingFlowchart = false;
  const toggleMapFlowchartMap = document.getElementById('toggleMapFlowchartMap');
  const toggleMapFlowchartFlowchart = document.getElementById('toggleMapFlowchartFlowchart');
  const toggleMapFlowchartMap2 = document.getElementById('toggleMapFlowchartMap2');
  const toggleMapFlowchartFlowchart2 = document.getElementById('toggleMapFlowchartFlowchart2');
  const toggleViewContainer = document.querySelector('#map-container .toggle-buttons');
  const flowchartContainer = document.getElementById('main-flowchart-container');
  const flowchartSchoolSelect = document.getElementById('mainFlowchartSchoolSelect');

  function switchToFlowchart() {
    showingFlowchart = true;
    flowchartContainer.style.display = 'flex';
    mapContainer.style.display = 'none';
    
    // Update toggle button states
    toggleMapFlowchartMap.classList.remove('active');
    toggleMapFlowchartFlowchart.classList.add('active');
    toggleMapFlowchartMap2.classList.remove('active');
    toggleMapFlowchartFlowchart2.classList.add('active');
    
    // Hide the decisions/assignments toggle when in flowchart view
    toggleViewContainer.style.display = 'none';
    
    if (!window.flowchartInitialized) {
      initializeFlowchart();
    }
  }

  function switchToMap() {
    showingFlowchart = false;
    flowchartContainer.style.display = 'none';
    mapContainer.style.display = 'block';
    
    // Update toggle button states
    toggleMapFlowchartMap.classList.add('active');
    toggleMapFlowchartFlowchart.classList.remove('active');
    toggleMapFlowchartMap2.classList.add('active');
    toggleMapFlowchartFlowchart2.classList.remove('active');
    
    // Show the decisions/assignments toggle when in map view
    toggleViewContainer.style.display = 'flex';
    
    setTimeout(() => {
      map.resize();
    }, 100);
  }

  // Add event listeners for all toggle buttons
  toggleMapFlowchartMap.addEventListener('click', switchToMap);
  toggleMapFlowchartFlowchart.addEventListener('click', switchToFlowchart);
  toggleMapFlowchartMap2.addEventListener('click', switchToMap);
  toggleMapFlowchartFlowchart2.addEventListener('click', switchToFlowchart);

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
    svg.attr("viewBox", "20 -130 520 960").attr("preserveAspectRatio", "xMidYMid meet");

    if (typeof window.initializeFlowchartFromScript === 'function') {
      window.initializeFlowchartFromScript(svg);
    } else {
      console.error("❌ initializeFlowchartFromScript function not found!");
    }

    if (geojsonData && geojsonData.features) {
      flowchartSchoolSelect.innerHTML = '<option value="">-- Select School --</option>';
      geojsonData.features.forEach(feature => {
        const option = document.createElement('option');
        option.value = feature.properties['Building Name'];
        option.textContent = feature.properties['Building Name'];
        flowchartSchoolSelect.appendChild(option);
      });

      flowchartSchoolSelect.addEventListener('change', (e) => {
        const selectedSchool = e.target.value;
        if (selectedSchool && typeof window.updateFlowForSchool === 'function') {
          window.updateFlowForSchool(selectedSchool, window.thresholds || {});
        }
      });
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

function injectDecisionsIntoGeoJSON(geojson, decisions) {
  const decisionMap = new Map(decisions.map(row => [normalizeName(row["Building Name"]), row["decision"] || "Unknown"]));
  const scorecardMap = new Map(decisions.map(row => [normalizeName(row["Building Name"]), parseFloat(row["Scorecard"] || "0")]));
  const buildingQualityMap = new Map(decisions.map(row => [normalizeName(row["Building Name"]), parseFloat(row["BuildingTreshhold"] || "0")]));
  // Add a map for Utilization
  const utilizationMap = new Map(decisions.map(row => [normalizeName(row["Building Name"]), parseFloat(row["Utilization"] || "0")]));
  const capacityMap = new Map(decisions.map(row => [normalizeName(row["Building Name"]), parseFloat(row["Capacity"] || "0")]));
  const availableSeatsMap = new Map(decisions.map(row => [normalizeName(row["Building Name"]), parseFloat(row["Available Seats"] || "0")]));
  const schoolLevelMap = new Map(decisions.map(row => [normalizeName(row["Building Name"]), row["School Level"] || "Unknown"]));

  geojson.features.forEach(f => {
    const name = normalizeName(f.properties["Building Name"]);
    f.properties["Decision Type"] = decisionMap.get(name) || "Unknown";
    f.properties["Scorecard"] = scorecardMap.get(name) || 0;
    f.properties["Building Quality"] = buildingQualityMap.get(name) || 0;
    // Inject Utilization
    f.properties["Utilization"] = utilizationMap.get(name) || 0;
    // Inject Capacity and Available Seats
    f.properties["Capacity"] = capacityMap.get(name) || 0;
    f.properties["Available Seats"] = availableSeatsMap.get(name) || 0;
    // Inject School Level
    f.properties["School Level"] = schoolLevelMap.get(name) || "Unknown";
  });
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
    allSchoolData.forEach(row => {
      if (!filterDecision || row.decision === filterDecision) {
        const option = document.createElement("option");
        option.value = row["Building Name"];
        option.textContent = row["Building Name"];
        schoolSelect.appendChild(option);
      }
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
    
    const [lng, lat] = selectedFeatureForIsochrone.geometry.coordinates;
    selectedEnrollment = parseInt(selectedFeatureForIsochrone.properties['Enrollment']) || 0;
    map.flyTo({ center: [lng, lat], zoom: 14 });

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

  isoDistanceSelect.addEventListener('change', triggerIsochroneUpdate);

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
    document.querySelector("#isoTable tbody").innerHTML = "";
  });

  // ✅ Debug assign button existence
  const assignButton = document.getElementById('assignButton');
  console.log("🔍 Assign button check during setup:");
  console.log("  assignButton exists:", !!assignButton);
  if (assignButton) {
    console.log("  assignButton text:", assignButton.textContent);
    console.log("  assignButton id:", assignButton.id);
  }

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

                const availableSeats = parseInt(destProperties["Available Seats"]) || 0;
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
        
        // ✅ Switch to assignment view to show the results
        showingAssignments = true;
        if (map.getLayer('schools-layer')) {
          map.setPaintProperty('schools-layer', 'circle-color', '#007cbf');
        }
        
        // Update the toggle button states
        const toggleDecisionsBtn = document.getElementById('toggleViewDecisions');
        const toggleAssignmentsBtn = document.getElementById('toggleViewAssignments');
        if (toggleDecisionsBtn && toggleAssignmentsBtn) {
          toggleDecisionsBtn.classList.remove('active');
          toggleAssignmentsBtn.classList.add('active');
        }
        
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
  document.querySelectorAll('.assign-percent-up').forEach((btn, idx) => {
    btn.addEventListener('click', function() {
      const input = btn.closest('td').querySelector('.assign-percent');
      let val = parseInt(input.value) || 0;
      if (val < 100) {
        input.value = val + 1;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  });
  document.querySelectorAll('.assign-percent-down').forEach((btn, idx) => {
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
      const assignmentsBtn = document.getElementById('toggleViewAssignments');
      const showingAssignmentsNow = assignmentsBtn && assignmentsBtn.classList.contains('active');
      // Build summaryCounts from current table
      let summaryCounts = {};
      document.querySelectorAll('#isoTable tbody tr').forEach((row, idx) => {
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
      "enrollmentSlider", "utilSlider", "utilHighSlider", "growthSlider", 
      "projUtilSlider", "distSlider", "buildSlider", "progSlider"
    ];

    const sliders = sliderIds.map(id => document.getElementById(id));
    
    console.log("🔍 Found sliders:", sliderIds.map((id, i) => ({ id, found: !!sliders[i] })));

    function sendSliderData() {
      console.log("📊 sendSliderData called");
      const thresholds = {
        enrollmentThreshold: parseInt(document.getElementById("enrollmentSlider").value, 10),
        utilization: parseFloat(document.getElementById("utilSlider").value)/100,
        utilizationHigh: parseFloat(document.getElementById("utilHighSlider").value)/100,
        enrollmentGrowth: parseFloat(document.getElementById("growthSlider").value)/100,
        projectedUtilization: parseFloat(document.getElementById("projUtilSlider").value)/100,
        distanceUnderutilized: parseFloat(document.getElementById("distSlider").value),
        buildingThreshold: parseFloat(document.getElementById("buildSlider").value),
        adequateProgramsMin: parseInt(document.getElementById("progSlider").value, 10),
      };
      
      console.log("📊 New thresholds:", thresholds);
      
      // Store thresholds globally for flowchart access
      window.thresholds = thresholds;
      
      if (window.decisionLogic) {
        window.decisionLogic.updateThresholds(thresholds);
        const updatedSchoolData = window.decisionLogic.schoolData;
        
        if (geojsonData && map.getSource('schools')) {
          injectDecisionsIntoGeoJSON(geojsonData, updatedSchoolData);
          map.getSource('schools').setData(geojsonData);
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
      
      // ✅ Update flowchart path for currently selected school
      const flowchartSelect = document.getElementById('mainFlowchartSchoolSelect');
      console.log("🔍 Flowchart select element:", flowchartSelect);
      console.log("🔍 updateFlowForSchool function available:", typeof window.updateFlowForSchool === 'function');
      if (flowchartSelect && flowchartSelect.value && typeof window.updateFlowForSchool === 'function') {
        console.log("🔄 Updating flowchart path for school:", flowchartSelect.value);
        window.updateFlowForSchool(flowchartSelect.value, thresholds);
      } else {
        console.log("🔍 Flowchart select or updateFlowForSchool not available");
        console.log("  - flowchartSelect exists:", !!flowchartSelect);
        console.log("  - flowchartSelect has value:", flowchartSelect ? !!flowchartSelect.value : "N/A");
        console.log("  - updateFlowForSchool function:", typeof window.updateFlowForSchool);
      }
    }

    sliders.forEach(slider => {
      if (slider) {
        console.log("✅ Adding event listener to slider:", slider.id);
        // Use 'input' for real-time updates
        slider.addEventListener("input", () => {
          console.log("🎛️ Slider changed:", slider.id, "value:", slider.value);
          const outSpan = document.getElementById(slider.id.replace("Slider", "Out"));
          if (outSpan) outSpan.textContent = slider.value;
          sendSliderData(); // Call the main update function
        });
      } else {
        console.warn("⚠️ Slider not found:", sliderIds[sliders.indexOf(slider)]);
      }
    });

    // Set initial values on load
    if (sliders.every(s => s)) {
      sendSliderData();
    }
});

// --- ONBOARDING WALKTHROUGH LOGIC ---
let isSettingUpPath = false; // Flag to track if we're setting up a specific path

function startOnboardingWalkthrough() {
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
      title: 'How to use this Tool',
      text: 'We will walk you through the main features of this tool. You can skip this explanation at any time.',
      isIntro: true
    },
    {
      target: '#sidebar',
      title: 'Input Sidebar',
      text: 'This sidebar contains the input controls for the planning tool, including criteria for school decision evaluations and scenario modeling.'
    },
    // New step for right sidebar
    {
      target: '#map-sidebar',
      title: 'Results Sidebar',
      text: 'This sidebar displays the results of your evaluations and scenario modeling, including recommended actions and impact analysis.'
    },
    {
      target: '#decision-input-panel',
      title: 'School Decision Evaluation',
      text: 'Adjust how schools are evaluated using these sliders. This affects the results and recommendations.'
    },
    {
      target: '#decision-output-panel',
      title: 'School Decision Evaluation: Results',
      text: 'This section summarizes recommended actions for each school based on the criteria you set on the left. You can view both a summary and detailed results for each school.'
    },
    {
      target: '#map-container',
      title: 'Output Visualizations: Map',
      text: 'The map shows all schools and their current decision status. You can interact with the map to explore decision and student assignment data.'
    },
    {
      target: '#main-flowchart-container',
      title: 'Output Visualizations: Flowchart',
      text: 'The flowchart visualizes the decision logic for a selected school chosen from the dropdown menu.'
    },
    {
      target: '#scenario-input-panel',
      title: 'Scenario Modeling',
      text: 'Test and evaluate the impact of different decision types here.'
    },
    {
      target: '#scenario-output-panel',
      title: 'Model Output: Impact Analysis',
      text: 'After running a scenario or simulation, this section shows changes in enrollment, utilization, and travel distances for students. Use this to understand the effects of your decisions on the school system.'
    },
    {
      target: 'body',
      title: 'Choose Your Path',
      text: 'Now that you\'ve seen the main features, choose how you\'d like to start using the tool.',
      isChoice: true
    }
  ];

  let currentStep = 0;
  let overlay = null;
  let popup = null;

  function showStep(stepIdx) {
    // Remove previous overlay/popup
    if (overlay) overlay.remove();
    if (popup) popup.remove();

    const step = steps[stepIdx];
    
    // Handle choice screen
    if (step.isChoice) {
      showChoiceScreen();
      return;
    }
    
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

    // Default: draw highlight and popup immediately
    drawHighlight(target, step, stepIdx);
    drawPopup(target, step, stepIdx);
  }

  function showChoiceScreen() {
    // Create overlay
    overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'rgba(0,0,0,0.8)';
    overlay.style.zIndex = '20000';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    document.body.appendChild(overlay);

    // Create choice container
    const choiceContainer = document.createElement('div');
    choiceContainer.style.background = '#fff';
    choiceContainer.style.borderRadius = '12px';
    choiceContainer.style.padding = '40px';
    choiceContainer.style.maxWidth = '900px';
    choiceContainer.style.width = '90%';
    choiceContainer.style.textAlign = 'center';
    choiceContainer.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';
    choiceContainer.style.fontFamily = "'Franklin Gothic Book', 'Franklin Gothic', 'Arial Narrow', Arial, sans-serif";

    // Title
    const title = document.createElement('h2');
    title.textContent = 'Choose Your Path';
    title.style.color = '#007cbf';
    title.style.marginBottom = '30px';
    title.style.fontSize = '28px';
    title.style.fontWeight = 'bold';
    choiceContainer.appendChild(title);

    // Subtitle
    const subtitle = document.createElement('p');
    subtitle.textContent = 'Now that you\'ve seen the main features, choose how you\'d like to start using the tool.';
    subtitle.style.color = '#666';
    subtitle.style.marginBottom = '40px';
    subtitle.style.fontSize = '18px';
    choiceContainer.appendChild(subtitle);

    // Buttons container
    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.display = 'flex';
    buttonsContainer.style.gap = '20px';
    buttonsContainer.style.justifyContent = 'center';
    buttonsContainer.style.flexWrap = 'nowrap';
    buttonsContainer.style.alignItems = 'stretch';

    // Button 1: School Decision Evaluation
    const btn1 = createChoiceButton(
      '🏫',
      'Start the School Decision Evaluation',
      'Begin by evaluating schools using the decision criteria sliders',
      '#007cbf',
      () => setupSchoolDecisionEvaluation()
    );

    // Button 2: Scenario Modeling
    const btn2 = createChoiceButton(
      '📊',
      'Go Directly into Scenario Modeling',
      'Jump straight into testing different portfolio decisions',
      '#27ae60',
      () => setupScenarioModeling()
    );

    // Button 3: Choose Own Path
    const btn3 = createChoiceButton(
      '🗺️',
      'Choose My Own Path',
      'Start with a clean slate and explore at your own pace',
      '#9b59b6',
      () => setupOwnPath()
    );

    buttonsContainer.appendChild(btn1);
    buttonsContainer.appendChild(btn2);
    buttonsContainer.appendChild(btn3);
    choiceContainer.appendChild(buttonsContainer);

    overlay.appendChild(choiceContainer);
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

  function drawHighlight(target, step, stepIdx) {
    // Create overlay
    overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'rgba(0,0,0,0.1)';
    overlay.style.zIndex = '20000';
    overlay.style.pointerEvents = 'auto';
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
    if (step.isIntro) {
      popup.style.left = '50%';
      popup.style.top = '20%';
      popup.style.transform = 'translate(-50%, 0)';
    } else if (step.target === '#decision-output-panel' || step.target === '#scenario-output-panel') {
      // Position to the left of the panel, with a larger gap
      const rect = target.getBoundingClientRect();
      const popupWidth = 340;
      const gap = 100; // Consistent gap for both panels
      popup.style.left = (rect.left - popupWidth - gap > 20 ? rect.left - popupWidth - gap : 20) + 'px';
      popup.style.top = rect.top + 'px';
      popup.style.right = '';
      popup.style.transform = '';
    } else if (step.target === '#map-sidebar') {
      // Always position to the left of the sidebar for the Results Sidebar step
      const rect = target.getBoundingClientRect();
      const popupWidth = 340;
      const gap = 100;
      popup.style.left = (rect.left - popupWidth - gap > 20 ? rect.left - popupWidth - gap : 20) + 'px';
      popup.style.top = rect.top + 'px';
      popup.style.right = '';
      popup.style.transform = '';
    } else {
      const rect = target.getBoundingClientRect();
      popup.style.left = (rect.left + rect.width + 20) + 'px';
      popup.style.top = rect.top + 'px';
      popup.style.transform = '';
    }
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
    
    // Only close panels if we're not setting up a specific path
    if (!isSettingUpPath) {
      // Close all dropdown sections
      const panels = [
        document.getElementById('decision-input-panel'),
        document.getElementById('scenario-input-panel'),
        document.getElementById('decision-output-panel'),
        document.getElementById('scenario-output-panel')
      ];
      panels.forEach(panel => { if (panel && panel.open) panel.open = false; });
      
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
});