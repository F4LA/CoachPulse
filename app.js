/**
 * Coach Pulse Dashboard — App
 *
 * Phase 4B.2 wiring:
 *   - Default meeting date is the most recently closed Wednesday (Thu-Wed
 *     coaching week), not the next Thursday.
 *   - WeekCache.init(data) is called after data loads.
 *   - After initial render, WeekNav is mounted into the #week-nav-container
 *     slot rendered by Renderer.
 *   - WeekNav.onWeekChange triggers loading-state rerender + fetch +
 *     final rerender + tab strip refresh.
 *   - activeCoach is owned by app.js and survives rerenders.
 *   - Tabs delegate clicks back to CoachPulseApp.switchCoach.
 */
(function (root) {
  "use strict";

  var CFG = root.CoachPulseConfig;

  // ----- App state -----
  var activeCoach = null;
  var currentMetrics = null;
  var currentMeetingDate = null;

  // ----- Default meeting date (ET-anchored) -----

  var TZ = "America/New_York";

  function etPartsOf(date) {
    var fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", millisecond: undefined,
      weekday: "short", hour12: false
    });
    var parts = {};
    var formatted = fmt.formatToParts(date);
    for (var i = 0; i < formatted.length; i++) {
      parts[formatted[i].type] = formatted[i].value;
    }
    var weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    var hour = parseInt(parts.hour, 10);
    if (hour === 24) hour = 0;
    return {
      year: parseInt(parts.year, 10),
      month: parseInt(parts.month, 10),
      day: parseInt(parts.day, 10),
      hour: hour,
      minute: parseInt(parts.minute, 10),
      second: parseInt(parts.second, 10),
      weekday: weekdayMap[parts.weekday]
    };
  }

  function fromET(year, month, day, hour, minute, second, ms) {
    hour = hour || 0; minute = minute || 0; second = second || 0; ms = ms || 0;
    var guess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
    for (var i = 0; i < 2; i++) {
      var d = new Date(guess);
      var et = etPartsOf(d);
      var target = Date.UTC(year, month - 1, day, hour, minute, second, ms);
      var actual = Date.UTC(et.year, et.month - 1, et.day, et.hour, et.minute, et.second, ms);
      var diff = target - actual;
      if (diff === 0) return d;
      guess += diff;
    }
    return new Date(guess);
  }

  /**
   * Returns the most recently closed Wednesday end-of-day (23:59:59.999 ET).
   * If today is Wed and the day is already past, today's Wed end is returned.
   * If today is Wed and it hasn't ended yet, the prior Wed end is returned.
   */
  function getDefaultMeetingDate() {
    var now = new Date();
    var et = etPartsOf(now);

    var daysBack;
    if (et.weekday === 3) {
      daysBack = 0;
    } else {
      daysBack = (et.weekday - 3 + 7) % 7;
      if (daysBack === 0) daysBack = 7;
    }

    var baseNoon = fromET(et.year, et.month, et.day, 12, 0, 0, 0);
    var wedNoon = new Date(baseNoon.getTime() - daysBack * 86400000);
    var wedEt = etPartsOf(wedNoon);
    var wedEnd = fromET(wedEt.year, wedEt.month, wedEt.day, 23, 59, 59, 999);

    if (et.weekday === 3 && now.getTime() < wedEnd.getTime()) {
      wedEnd = new Date(wedEnd.getTime() - 7 * 86400000);
    }
    return wedEnd;
  }

  // ----- Status helpers -----

  function showStatus(msg, kind) {
    var el = document.getElementById("status");
    if (!el) return;
    el.style.display = "";
    el.className = "status " + (kind || "");
    el.textContent = msg;
  }

  function hideStatus() {
    var el = document.getElementById("status");
    if (el) el.style.display = "none";
  }

  function confirmEngineLoaded() {
    var required = [
      "CoachingWeek", "ClientTimeline", "ConsecutiveEvaluable",
      "PathwayEvaluators", "ColorDeriver", "PathwayEngine"
    ];
    var missing = [];
    for (var i = 0; i < required.length; i++) {
      if (!root[required[i]]) missing.push(required[i]);
    }
    if (missing.length) {
      throw new Error("Engine not fully loaded. Missing: " + missing.join(", "));
    }
  }

  function confirmDashboardModulesLoaded() {
    var required = [
      "SheetsReader", "StateBuilder", "Scorecard", "Checklist",
      "RenewalRadar", "Tabs", "WeekCache", "WeekNav", "Renderer"
    ];
    var missing = [];
    for (var i = 0; i < required.length; i++) {
      if (!root[required[i]]) missing.push(required[i]);
    }
    if (missing.length) {
      throw new Error("Dashboard modules not loaded. Missing: " + missing.join(", "));
    }
  }

  // ----- Core handlers -----

  /**
   * Called by tabs.js when a coach tab is clicked.
   * Updates activeCoach, repaints the tab strip's active state, and
   * rerenders the coach content for the current week.
   */
  function switchCoach(coach) {
    if (!coach || coach === activeCoach) return;
    activeCoach = coach;
    root.Tabs.setActiveTab(coach);
    root.Renderer.renderCoachContent(currentMetrics, coach, currentMeetingDate);
  }

  /**
   * Called by WeekNav when the user clicks ◀ or ▶.
   * 1) Render skeleton tiles for the active coach immediately.
   * 2) Fetch metrics for the new week via WeekCache.
   * 3) Rerender with real data + refresh tab strip dots/order.
   */
  function handleWeekChange(newMeetingDate) {
    currentMeetingDate = newMeetingDate;

    // 1. Optimistic skeleton render.
    root.Renderer.renderCoachContent(null, activeCoach, newMeetingDate, { loading: true });

    // 2. Fetch.
    root.WeekCache.getMetricsForWeek(newMeetingDate)
      .then(function (metrics) {
        if (!metrics) {
          console.error("[CoachPulse] Failed to load metrics for week:", newMeetingDate);
          showStatus("Failed to load that week. Try again.", "error");
          return;
        }
        // Ignore stale responses (user clicked again before this resolved).
        if (currentMeetingDate.getTime() !== newMeetingDate.getTime()) return;

        currentMetrics = metrics;
        root.Renderer.renderCoachContent(metrics, activeCoach, newMeetingDate);
        root.Tabs.updateTabStrip(metrics, activeCoach);
      })
      .catch(function (err) {
        console.error("[CoachPulse] Week change error:", err);
        showStatus("Failed to load that week: " + err.message, "error");
      });
  }

  // ----- Init -----

  function init() {
    showStatus("Loading coaching data…", "loading");

    try {
      confirmEngineLoaded();
      confirmDashboardModulesLoaded();
    } catch (err) {
      showStatus("Load failure: " + err.message, "error");
      console.error(err);
      return;
    }

    var meetingDate = getDefaultMeetingDate();
    console.log("[CoachPulse] Default meeting date (Wed end ET):", meetingDate.toString());

    root.SheetsReader.loadAll()
      .then(function (data) {
        root.__cpData = data;

        root.WeekCache.init(data);

        var states    = root.StateBuilder.build(data, meetingDate);
        var scorecard = root.Scorecard.compute(states, data.masterSheet, meetingDate);
        var checklist = root.Checklist.compute(data, states, meetingDate);
        var renewal   = root.RenewalRadar.compute(data, meetingDate);

        var metrics = {};
        for (var i = 0; i < CFG.COACHES.length; i++) {
          var c = CFG.COACHES[i];
          metrics[c] = {
            S1: scorecard[c].S1, S2: scorecard[c].S2,
            S3: scorecard[c].S3, S4: scorecard[c].S4,
            CA: checklist[c].CA, CB: checklist[c].CB,
            CC: checklist[c].CC, CD: renewal[c].CD
          };
        }

        // Stash state.
        currentMetrics = metrics;
        currentMeetingDate = meetingDate;
        activeCoach = root.Tabs.sortCoaches(metrics)[0];

        root.__cpMetrics = metrics;
        root.__cpMeetingDate = meetingDate;
        console.log("[CoachPulse] Metrics:", metrics);

        hideStatus();

        // Order matters:
        // 1) Tabs first (renders #tab-container only).
        // 2) Renderer.render (renders #week-nav-container slot + content).
        // 3) WeekNav.mount (fills the slot).
        // 4) Subscribe to week changes.
        root.Tabs.mountTabs(metrics, meetingDate, activeCoach);
        root.Renderer.render(metrics, meetingDate, activeCoach);
        root.WeekNav.mount(meetingDate);
        root.WeekNav.onWeekChange(handleWeekChange);
      })
      .catch(function (err) {
        showStatus("Load failed: " + err.message, "error");
        console.error("[CoachPulse] Error:", err);
      });
  }

  // Public hooks (tabs.js calls this; tests may also).
  root.CoachPulseApp = {
    switchCoach: switchCoach,
    getActiveCoach: function () { return activeCoach; },
    getCurrentMeetingDate: function () { return currentMeetingDate; },
    getCurrentMetrics: function () { return currentMetrics; }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : this);
