/**
 * Coach Pulse Dashboard — Renderer
 *
 * Renders the per-coach tab content: Scorecard section + Behaviors section.
 * Each metric tile shows:
 *   - Title (full name, no abbreviation)
 *   - Description (what it measures)
 *   - Value (large number)
 *   - Sub-display (denominator or context)
 *   - Threshold legend
 *   - Color border based on metric color
 *
 * Phase 3A: read-only. Clicks and writes come in 3B / 4.
 */
(function (root) {
  "use strict";

  var CFG = root.CoachPulseConfig;
  if (!CFG) throw new Error("renderer: CoachPulseConfig not loaded");

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderTile(metricKey, metricData) {
    var meta = CFG.METRICS[metricKey];
    if (!meta) return "";

    var color = metricData.color || "neutral";
    return (
      '<div class="tile tile-' + color + '" data-metric="' + metricKey + '">' +
        '<div class="tile-header">' +
          '<div class="tile-title">' + escapeHtml(meta.title) + '</div>' +
          '<div class="tile-description">' + escapeHtml(meta.description) + '</div>' +
        '</div>' +
        '<div class="tile-value-block">' +
          '<div class="tile-value">' + escapeHtml(metricData.displayString) + '</div>' +
          (metricData.subDisplay
            ? '<div class="tile-sub">' + escapeHtml(metricData.subDisplay) + '</div>'
            : '') +
        '</div>' +
        '<div class="tile-legend">' + escapeHtml(meta.legend) + '</div>' +
      '</div>'
    );
  }

  function renderSection(sectionKey, coachMetrics) {
    var order = CFG.METRIC_ORDER[sectionKey];
    var tiles = order.map(function (key) {
      return renderTile(key, coachMetrics[key]);
    }).join("");

    var sectionTitle = sectionKey === "scorecard" ? "Scorecard" : "Behaviors";
    return (
      '<section class="metric-section" data-section="' + sectionKey + '">' +
        '<h2 class="section-title">' + sectionTitle + '</h2>' +
        '<div class="tile-grid">' + tiles + '</div>' +
      '</section>'
    );
  }

  function renderCoachTab(coach, allMetrics) {
    var m = allMetrics[coach];
    if (!m) return '<div class="empty">No data for ' + escapeHtml(coach) + '</div>';

    return (
      '<div class="coach-tab" data-coach="' + escapeHtml(coach) + '">' +
        '<div class="coach-header">' +
          '<h1 class="coach-name">' + escapeHtml(coach) + '</h1>' +
        '</div>' +
        renderSection("scorecard", m) +
        renderSection("behaviors", m) +
      '</div>'
    );
  }

  /**
   * Top-level render. Replaces #main content.
   * @param {Object} allMetrics — { Brent: {S1, S2, ...}, Ceci: {...}, ... }
   * @param {Date}   meetingDate
   * @param {string} activeCoach — currently selected coach name
   */
  function render(allMetrics, meetingDate, activeCoach) {
    var main = document.getElementById("main");
    if (!main) return;

    // Build content for active coach only (others render on tab switch)
    var coachContent = renderCoachTab(activeCoach, allMetrics);

    var dateStr = meetingDate.toDateString();

    main.innerHTML =
      '<div class="meeting-meta">Meeting day: <strong>' + escapeHtml(dateStr) +
      '</strong>  ·  Closed coaching week ended Wednesday ' +
      escapeHtml(new Date(meetingDate.getTime() - 24*60*60*1000).toDateString()) +
      '</div>' +
      '<div id="coach-content">' + coachContent + '</div>';
  }

  /**
   * Re-render content for a different active coach without re-fetching data.
   */
  function renderCoachContent(allMetrics, coach) {
    var container = document.getElementById("coach-content");
    if (!container) return;
    container.innerHTML = renderCoachTab(coach, allMetrics);
  }

  root.Renderer = {
    render: render,
    renderCoachContent: renderCoachContent
  };
})(typeof window !== "undefined" ? window : this);
