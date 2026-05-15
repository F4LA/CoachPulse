/**
 * Coach Pulse Dashboard — Tabs
 *
 * Renders the tab strip at the top of the main content area.
 * Each tab = one coach. Active tab is highlighted. Click switches content.
 *
 * Tab order: coaches with any Red metric first (leftmost),
 * then any Yellow, then Green. Within tier: by config order.
 *
 * Phase 4B.2:
 *   - mountTabs no longer triggers the initial Renderer.render — app.js
 *     owns that, because the initial render must come AFTER WeekNav.mount
 *     can target the rendered slot.
 *   - switchTo reads the current meeting date from WeekNav (so tab
 *     switches preserve the selected historical week).
 *   - updateTabStrip() refreshes dots/order after a week change.
 *   - Click handler delegates to app.js via window.CoachPulseApp.switchCoach
 *     so app.js can update its activeCoach state.
 */
(function (root) {
  "use strict";

  var CFG = root.CoachPulseConfig;
  if (!CFG) throw new Error("tabs: CoachPulseConfig not loaded");

  function worstColorForCoach(coachMetrics) {
    if (!coachMetrics) return "neutral";
    var metrics = ["S1", "S2", "S3", "S4", "CA", "CB", "CC", "CD"];
    var hasRed = false, hasYellow = false;
    for (var i = 0; i < metrics.length; i++) {
      var m = coachMetrics[metrics[i]];
      if (!m) continue;
      if (m.color === "red")    hasRed = true;
      if (m.color === "yellow") hasYellow = true;
    }
    if (hasRed)    return "red";
    if (hasYellow) return "yellow";
    return "neutral";
  }

  function sortCoaches(allMetrics) {
    var rank = { red: 0, yellow: 1, neutral: 2 };
    var coaches = CFG.COACHES.slice();
    return coaches.sort(function (a, b) {
      var ca = rank[worstColorForCoach(allMetrics[a])];
      var cb = rank[worstColorForCoach(allMetrics[b])];
      if (ca !== cb) return ca - cb;
      return CFG.COACHES.indexOf(a) - CFG.COACHES.indexOf(b);
    });
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderTabStrip(allMetrics, activeCoach) {
    var ordered = sortCoaches(allMetrics);
    var html = ordered.map(function (c) {
      var color = worstColorForCoach(allMetrics[c]);
      var dot = (color === "red" || color === "yellow")
        ? '<span class="tab-dot tab-dot-' + color + '"></span>'
        : '';
      var activeCls = (c === activeCoach) ? ' tab-active' : '';
      return (
        '<button class="tab' + activeCls + '" data-coach="' + escapeHtml(c) + '">' +
          dot + escapeHtml(c) +
        '</button>'
      );
    }).join("");

    return '<div class="tab-strip" role="tablist">' + html + '</div>';
  }

  function handleTabClick(e) {
    var coach = e.currentTarget.getAttribute("data-coach");
    if (!coach) return;
    if (root.CoachPulseApp && typeof root.CoachPulseApp.switchCoach === "function") {
      root.CoachPulseApp.switchCoach(coach);
    }
  }

  function wireClicks(container) {
    var buttons = container.querySelectorAll(".tab");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", handleTabClick);
    }
  }

  /**
   * mountTabs(allMetrics, meetingDate, initialCoach)
   *
   * Renders the tab strip and wires click handlers. Does NOT trigger the
   * initial Renderer.render — app.js owns that.
   */
  function mountTabs(allMetrics, meetingDate, initialCoach) {
    var container = document.getElementById("tab-container");
    if (!container) return;

    var activeCoach = initialCoach || sortCoaches(allMetrics)[0];
    container.innerHTML = renderTabStrip(allMetrics, activeCoach);
    wireClicks(container);
  }

  /**
   * updateTabStrip(allMetrics, activeCoach)
   *
   * Re-renders the tab strip with fresh metrics. Called by app.js after
   * a week change so dot colors and ordering reflect the current week.
   */
  function updateTabStrip(allMetrics, activeCoach) {
    var container = document.getElementById("tab-container");
    if (!container) return;
    container.innerHTML = renderTabStrip(allMetrics, activeCoach);
    wireClicks(container);
  }

  /**
   * setActiveTab(coach)
   *
   * Updates only the visual active state of the tab strip without
   * re-rendering it. Called by app.js when switching coaches within
   * the same week.
   */
  function setActiveTab(coach) {
    var container = document.getElementById("tab-container");
    if (!container) return;
    var buttons = container.querySelectorAll(".tab");
    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i].getAttribute("data-coach") === coach) {
        buttons[i].classList.add("tab-active");
      } else {
        buttons[i].classList.remove("tab-active");
      }
    }
  }

  root.Tabs = {
    mountTabs: mountTabs,
    updateTabStrip: updateTabStrip,
    setActiveTab: setActiveTab,
    sortCoaches: sortCoaches,
    worstColorForCoach: worstColorForCoach
  };
})(typeof window !== "undefined" ? window : this);
