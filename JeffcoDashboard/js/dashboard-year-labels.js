/**
 * Display-year labels for school cards, sliders, and flowchart (not CSV column names).
 * Loaded from DashboardYearLabels.json next to index.html (edit that file directly).
 */
(function () {
  const DEFAULTS = {
    utilizationSchoolYear: '25-26',
    enrollmentYear: '2025',
    attendanceAreaYear: '2024',
    projectionYear: '2030',
  };

  function mergeLabels(into, from) {
    if (!from || typeof from !== 'object') return;
    Object.keys(DEFAULTS).forEach((k) => {
      const v = from[k];
      if (v != null && String(v).trim()) into[k] = String(v).trim();
    });
  }

  window.dashboardYearLabels = { ...DEFAULTS };

  function syncYearLabelHelpers() {
    const y = window.dashboardYearLabels;
    window.yearLabels = {
      utilizationSchoolYear: y.utilizationSchoolYear,
      enrollmentYear: y.enrollmentYear,
      attendanceAreaYear: y.attendanceAreaYear,
      projectionYear: y.projectionYear,
      utilizationCard: () => `Utilization (${y.utilizationSchoolYear})`,
      utilizationKpi: () => `${y.utilizationSchoolYear} Utilization %`,
      enrollmentCard: () => 'Enrollment',
      attendanceAreaCard: () => 'Attendance Area Enrollment',
      attendanceAreaKpi: () => 'Attendance Area Enrollment',
      futureGrowthCard: () => `Future Enrollment Growth (${y.projectionYear})`,
      futureGrowthFlowchart: () => `Future Enrollment Growth (${y.projectionYear})`,
      projEnrollmentSub: (countText) => `Proj. ${y.projectionYear}: ${countText}`,
      utilThresholdLow: () => `Current Utilization Threshold (${y.utilizationSchoolYear})`,
      utilThresholdHigh: () => `High Utilization Threshold (${y.utilizationSchoolYear})`,
      attendanceAreaSlider: () => `Attendance Area Enrollment (${y.attendanceAreaYear})`,
    };
  }
  syncYearLabelHelpers();

  window.applyDashboardYearLabelsToDom = function () {
    const yl = window.yearLabels;
    if (!yl) return;

    const set = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    set('yl-util-threshold-low-text', yl.utilThresholdLow());
    set('yl-util-threshold-high-text', yl.utilThresholdHigh());
    set('yl-attendance-area-slider-text', yl.attendanceAreaSlider());
    set('yl-help-util-low', yl.utilThresholdLow());
    set('yl-help-util-high', yl.utilThresholdHigh());
    set('yl-help-attendance-area', yl.attendanceAreaSlider());
  };

  window.loadDashboardYearLabels = async function () {
    try {
      const res = await fetch('DashboardYearLabels.json?cb=' + Date.now());
      if (res.ok) mergeLabels(window.dashboardYearLabels, await res.json());
    } catch (e) {
      /* file optional */
    }
    syncYearLabelHelpers();
    window.applyDashboardYearLabelsToDom?.();
    document.dispatchEvent(new CustomEvent('jeffco-year-labels-updated'));
    return window.dashboardYearLabels;
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.loadDashboardYearLabels());
  } else {
    window.loadDashboardYearLabels();
  }
})();
