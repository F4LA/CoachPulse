/**
 * Coach Pulse Dashboard — Tabs
 *
 * Renders the tab strip at the top of the main content area.
 * Each tab = one coach. Active tab is highlighted. Click switches content.
 *
 * Tab order: coaches with any Red metric first (leftmost),
 * then any Yellow, then Green. Within tier: by config order.
 *
 * Each tab gets a colored dot indicator:
 *   - Red dot:    any Red metric in this coach's tab
 *   - Yellow dot: any Yellow but no Red
 *   - No dot:     all Green/Neutral
 */
(function (root) {
  "use strict";

  var CFG = root.CoachPulseConfig;
  if (!CFG) throw new Error("tabs: CoachPulseConfig not loaded");

  function worstColorForCoach(coachMetrics) {
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
    // Tier rank: red=0, yellow=1, neutral/green=2
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

  function mountTabs(allMetrics, meetingDate, initialCoach) {
    var container = document.getElementById("tab-container");
    if (!container) return;

    var activeCoach = initialCoach || sortCoaches(allMetrics)[0];
    container.innerHTML = renderTabStrip(allMetrics, activeCoach);

    // Wire click handlers
    var buttons = container.querySelectorAll(".tab");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", function (e) {
        var coach = e.currentTarget.getAttribute("data-coach");
        switchTo(allMetrics, coach, meetingDate);
      });
    }

    // Initial render
    root.Renderer.render(allMetrics, meetingDate, activeCoach);
  }

  function switchTo(allMetrics, coach, meetingDate) {
    // Update tab strip active state
    var container = document.getElementById("tab-container");
    if (container) {
      var buttons = container.querySelectorAll(".tab");
      for (var i = 0; i < buttons.length; i++) {
        if (buttons[i].getAttribute("data-coach") === coach) {
          buttons[i].classList.add("tab-active");
        } else {
          buttons[i].classList.remove("tab-active");
        }
      }
    }

    // Re-render coach content only
    root.Renderer.renderCoachContent(allMetrics, coach, meetingDate);
  }

  root.Tabs = {
    mountTabs: mountTabs,
    switchTo: switchTo,
    sortCoaches: sortCoaches,
    worstColorForCoach: worstColorForCoach
  };
})(typeof window !== "undefined" ? window : this);
