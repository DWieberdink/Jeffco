let mapExportLookup = {}; // 📦 global lookup

// Map_Export.csv references removed

// 🔵 Listen for live updates (from iframe/postMessage)
window.addEventListener("message", (event) => {
  const { from, schoolData } = event.data || {};

  if (from === "DecisionLogic-A" && Array.isArray(schoolData)) {
    console.log("📨 [mergeDecisionMap.js] Received updated schoolData:", schoolData);

    window.schoolData = schoolData;

    if (Object.keys(mapExportLookup).length > 0) {
      console.log("🔁 [mergeDecisionMap.js] Merging immediately (CSV already loaded)");
      clearPreviousMergedSummary();
      startMerging(window.schoolData);
    } else {
      console.log(
        "⏳ [mergeDecisionMap.js] CSV not ready — window.schoolData updated; merge when mapExportLookup is loaded."
      );
    }
  }
});

// 🔥 Helper: Clear old merged tables
function clearPreviousMergedSummary() {
  const resultsDiv = document.getElementById("results");
  if (resultsDiv) {
    resultsDiv.innerHTML = "";  // 🧹 FULLY clear all old content inside #results
    console.log("🧹 Cleared previous merged summary.");
  }
}


// 🔥 Merge Map_Export + Decisions dynamically
function startMerging(schoolDataFromMessage) {
  const displaySchoolName = window.formatSchoolDisplayName || ((name) => String(name ?? "").trim());

  if (!schoolDataFromMessage || !Array.isArray(schoolDataFromMessage)) {
    console.warn("⚠️ No valid schoolData provided to startMerging.");
    return;
  }

  if (Object.keys(mapExportLookup).length === 0) {
    console.warn("⚠️ mapExportLookup is empty (CSV missing?)");
    return;
  }

  clearPreviousMergedSummary(); // ✅ Always clear first

  const mergedData = schoolDataFromMessage.map(row => {
    const schoolName = row["Building Name"]?.trim() || row.School?.trim() || row.name?.trim() || "Unknown";
    const decision = row.decision?.trim() || row.Decision?.trim() || "Unknown";
    const schoolLevel = mapExportLookup[schoolName] || "Unknown";

    return {
      School: schoolName,
      Decision: decision,
      SchoolLevel: schoolLevel
    };
  });

  // 🧹 Summarize
  const summary = {};
  mergedData.forEach(record => {
    const key = `${record.SchoolLevel} | ${record.School} | ${record.Decision}`;
    summary[key] = (summary[key] || 0) + 1;
  });

  const summaryTable = document.createElement("table");
  summaryTable.innerHTML = `
    <thead>
      <tr>
        <th>School Level</th>  
        <th>schoolName</th>
        <th>Decision</th>
        <th># Buildings</th>
      </tr>
    </thead>
    <tbody>
      ${Object.entries(summary).map(([key, count]) => {
        const [schoolLevel, schoolName, decision] = key.split(" | "); // 👈 correct split
      return `<tr><td>${schoolLevel}</td><td>${displaySchoolName(schoolName)}</td><td>${decision}</td><td>${count}</td></tr>`;
      }).join("")}
    </tbody>
  `;

  const container = document.createElement("div");
  container.classList.add("merged-summary");
  container.innerHTML = `<h2>Merged Decision Map</h2>`;
  container.appendChild(summaryTable);

  const resultsDiv = document.getElementById("results");
  if (resultsDiv) {
    resultsDiv.appendChild(container);
    console.log("✅ [mergeDecisionMap.js] Merged summary updated in DOM.");
  } else {
    console.warn("⚠️ [mergeDecisionMap.js] No #results container found.");
  }
}
