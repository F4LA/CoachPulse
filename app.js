/**
 * Coach Pulse Dashboard — App
 *
 * Phase 4B wiring:
 *   - Default meeting date is the most recently closed Wednesday (Thu-Wed
 *     coaching week), not the next Thursday.
 *   - WeekCache.init(data) is called after data loads so subsequent phases
 *     (4B.2 navigation, 4B.3 historical table) can request other weeks.
 *
 * Pipeline for the initial render still runs synchronously here. Phase
 * 4B.2 will route initial render through WeekCache too, but for now
 * the current snapshot is computed inline as before.
 */
(function (root) {
  "use strict";

  var CFG = root.CoachPulseConfig;

  // ---------------------------------------------------------------------------
  // Default meeting date: most recently closed Wednesday 23:59:59.999 ET.
  //
  // ET-anchored to handle DST. Weekday in ET: Sun=0..Wed=3..Sat=6.
  // Days to subtract from "today" to reach the most recent Wednesday:
  //   Sun (0) -> -4   Mon (1) -> -5   Tue (2) -> -6
  //   Wed (3) -> -7 if before 23:59:59.999 ET, else 0
  //   Thu (4) -> -1   Fri (5) -> -2   Sat (6) -> -3
  //
  // Today (May 14) is Thursday → -1 → Wednesday May 13 23:59:59.999 ET.
  // ---------------------------------------------------------------------------

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

    // Candidate: today's Wed end if today is Wed; otherwise back up to prior Wed.
    var daysBack;
    if (et.weekday === 3) {
      // Today is Wed in ET. Compare against today's 23:59:59.999 ET.
      daysBack = 0;
    } else {
      // Days back to reach prior Wed: weekday - 3, mod 7, with Wed→7 (not 0).
      daysBack = (et.weekday - 3 + 7) % 7;
      if (daysBack === 0) daysBack = 7; // safety, shouldn't hit here
    }

    // Build candidate Wed 23:59:59.999 ET.
    var baseNoon = fromET(et.year, et.month, et.day, 12, 0, 0, 0);
    var wedNoon = new Date(baseNoon.getTime() - daysBack * 86400000);
    var wedEt = etPartsOf(wedNoon);
    var wedEnd = fromET(wedEt.year, wedEt.month, wedEt.day, 23, 59, 59, 999);

    // If today is Wed but the day hasn't closed yet, step back one full week.
    if (et.weekday === 3 && now.getTime() < wedEnd.getTime()) {
      wedEnd = new Date(wedEnd.getTime() - 7 * 86400000);
    }
    return wedEnd;
  }

  function showStatus(msg, kind) {
    var el = document.getElementById("status");
    if (!el) return;
    el.className = "status " + (kind || "");
    el.textContent = msg;
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
      "RenewalRadar", "Tabs", "WeekCache"
    ];
    var missing = [];
    for (var i = 0; i < required.length; i++) {
      if (!root[required[i]]) missing.push(required[i]);
    }
    if (missing.length) {
      throw new Error("Dashboard modules not loaded. Missing: " + missing.join(", "));
    }
  }

  function hideStatus() {
    var el = document.getElementById("status");
    if (el) el.style.display = "none";
  }

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

        // Initialize the week cache so phases 4B.2 / 4B.3 can request other weeks.
        // The initial render below still computes inline; we'll route it through
        // WeekCache in 4B.2.
        root.WeekCache.init(data);

        var states = root.StateBuilder.build(data, meetingDate);
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

        root.__cpMetrics = metrics;
        root.__cpMeetingDate = meetingDate;
        console.log("[CoachPulse] Metrics:", metrics);

        hideStatus();
        root.Tabs.mountTabs(metrics, meetingDate);
      })
      .catch(function (err) {
        showStatus("Load failed: " + err.message, "error");
        console.error("[CoachPulse] Error:", err);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : this);
