// mergeTableControl.js

window.addEventListener("message", (event) => {
    const { from, schoolData } = event.data || {};
  
    console.log("📨 [mergeTableControl.js] Received message:", event.data);
  
    if (from === "DecisionLogic-A" && Array.isArray(schoolData)) {
      console.log("✅ [mergeTableControl.js] Received updated schoolData from DecisionLogic-A:", schoolData);
  
      // ✅ Save the latest data globally
      window.schoolData = schoolData;
  
      // ✅ Always clear old merged data first
      if (typeof clearPreviousMergedSummary === "function") {
        console.log("🧹 [mergeTableControl.js] Clearing previous merged summary...");
        clearPreviousMergedSummary();
      }
  
      // ✅ Then re-merge and re-render
      if (typeof startMerging === "function") {
        console.log("🔄 [mergeTableControl.js] Merging updated schoolData...");
        startMerging(window.schoolData);
      } else {
        console.error("❌ [mergeTableControl.js] startMerging function not found!");
      }
    }
  });