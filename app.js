/**
 * Coach Pulse Dashboard — App (Phase 3A)
 *
 * - Load data
 * - Build engine state for current + previous week
 * - Compute metrics
 * - Mount tab strip and render initial coach view
 */
(function (root) {
  "use strict";

  var CFG = root.CoachPulseConfig;

  function nextOrTodayThursday(today) {
    var d = new Date(today);
    d.setHours(9, 30, 0, 0);
    var dow = d.getDay();
    var daysToThu = (4 - dow + 7) % 7;
    d.setDate(d.getDate() + daysToThu);
    return d;
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

  function hideStatus() {
    var el = document.getElementById("status");
    if (el) el.style.display = "none";
  }

  function init() {
    showStatus("Loading coaching data…", "loading");

    try {
      confirmEngineLoaded();
    } catch (err) {
      showStatus("Engine load failure: " + err.message, "error");
      console.error(err);
      return;
    }

    var meetingDate = nextOrTodayThursday(new Date());

    root.SheetsReader.loadAll()
      .then(function (data) {
        root.__cpData = data;

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

        // Hide loading status, mount tabs
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
