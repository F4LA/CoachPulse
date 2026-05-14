/**
 * Coach Pulse Dashboard — App
 *
 * Phase 2 scope:
 *   - Load all 6 sheet sources in parallel.
 *   - Run engine per client (this Thursday + last Thursday).
 *   - Compute S1-S4, CA, CB, CC, CD per coach.
 *   - Render compact validation table per coach.
 *   - Expose state on window for DevTools inspection.
 *
 * Phase 3 will replace the validation table with the real per-coach tab UI.
 */
(function (root) {
  "use strict";

  var CFG = root.CoachPulseConfig;

  /* ---------- date helpers ---------- */

  /**
   * Returns the Date representing "this Thursday" — the Coach Pulse meeting
   * day. If today IS Thursday, returns today (at 09:30 local for clarity).
   * If today is any other day, returns the upcoming Thursday.
   *
   * This date is what gets passed to the engine as `currentDate`. The engine
   * uses it to identify the just-closed Coaching Week (Wed 23:59 ET before it).
   */
  function getMeetingDate(now) {
    now = now || new Date();
    var d = new Date(now.getTime());
    d.setHours(9, 30, 0, 0);
    var dayOfWeek = d.getDay();  // 0=Sun, 4=Thu
    if (dayOfWeek === 4) {
      return d;  // It's Thursday already.
    }
    // Next Thursday
    var daysUntilThu = (4 - dayOfWeek + 7) % 7;
    if (daysUntilThu === 0) daysUntilThu = 7;
    d.setDate(d.getDate() + daysUntilThu);
    return d;
  }

  /* ---------- UI ---------- */

  function showStatus(msg, kind) {
    var el = document.getElementById("status");
    if (!el) return;
    el.className = "status " + (kind || "");
    el.textContent = msg;
  }

  function confirmEngineLoaded() {
    var required = [
      "CoachingWeek",
      "ClientTimeline",
      "ConsecutiveEvaluable",
      "PathwayEvaluators",
      "ColorDeriver",
      "PathwayEngine"
    ];
    var missing = [];
    for (var i = 0; i < required.length; i++) {
      if (!root[required[i]]) missing.push(required[i]);
    }
    if (missing.length) {
      throw new Error("Engine not fully loaded. Missing: " + missing.join(", "));
    }
  }

  function colorBadge(color, text) {
    var bg = {
      green:   "var(--green-bg)",
      yellow:  "var(--yellow-bg)",
      red:     "var(--red-bg)",
      neutral: "var(--surface-2)"
    }[color] || "var(--surface-2)";
    var fg = {
      green:   "var(--green)",
      yellow:  "var(--yellow)",
      red:     "var(--red)",
      neutral: "var(--text-muted)"
    }[color] || "var(--text-muted)";
    return "<span style=\"background:" + bg + ";color:" + fg +
           ";padding:3px 8px;border-radius:4px;font-weight:600;font-size:12px;" +
           "display:inline-block;min-width:48px;text-align:center\">" + text + "</span>";
  }

  function renderResults(metricsByCoach, meetingDate) {
    var rows = "";
    CFG.COACHES.forEach(function (coachName) {
      var m = metricsByCoach[coachName];
      if (!m) return;
      rows +=
        "<tr>" +
          "<td><strong>" + coachName + "</strong></td>" +
          "<td>" + m.activeClients + "</td>" +
          "<td>" + colorBadge(m.S1.color, m.S1.displayString) + "</td>" +
          "<td>" + colorBadge(m.S2.color, m.S2.displayString) + "</td>" +
          "<td>" + colorBadge(m.S3.color, m.S3.displayString) + "</td>" +
          "<td>" + colorBadge(m.S4.color, m.S4.displayString) + "</td>" +
          "<td>" + colorBadge(m.CA.color, m.CA.displayString) + "</td>" +
          "<td>" + colorBadge(m.CB.color, m.CB.displayString) + "</td>" +
          "<td>" + colorBadge(m.CC.color, m.CC.displayString) + "</td>" +
          "<td>" + colorBadge(m.CD.color, m.CD.displayString) + "</td>" +
        "</tr>";
    });

    var thursStr = meetingDate.toDateString();

    var html =
      "<div class=\"shell-card\">" +
        "<h2>Phase 2 — Calculations</h2>" +
        "<p class=\"muted\">Meeting date used for engine: <code>" + thursStr + "</code>. " +
        "Closed coaching week is the just-ended Thu→Wed before it.</p>" +
        "<table class=\"metrics-table\">" +
          "<thead><tr>" +
            "<th>Coach</th>" +
            "<th>Active</th>" +
            "<th>S1<br><small>New Red</small></th>" +
            "<th>S2<br><small>Y/R Cum</small></th>" +
            "<th>S3<br><small>Black</small></th>" +
            "<th>S4<br><small>Renewals LW</small></th>" +
            "<th>CA<br><small>Submit %</small></th>" +
            "<th>CB<br><small>Community</small></th>" +
            "<th>CC<br><small>Shoutout</small></th>" +
            "<th>CD<br><small>Next 2 wks</small></th>" +
          "</tr></thead>" +
          "<tbody>" + rows + "</tbody>" +
        "</table>" +
        "<p class=\"muted\" style=\"margin-top:16px\">" +
          "Open DevTools → Console. Inspect <code>window.__cpData</code> (raw sheets), " +
          "<code>window.__cpStates</code> (per-client engine output), and " +
          "<code>window.__cpMetrics</code> (computed per-coach metrics).</p>" +
      "</div>";

    document.getElementById("main").innerHTML = html;
  }

  /* ---------- main pipeline ---------- */

  function init() {
    showStatus("Loading coaching data…", "loading");

    try {
      confirmEngineLoaded();
    } catch (err) {
      showStatus("Engine load failure: " + err.message, "error");
      console.error(err);
      return;
    }

    var meetingDate = getMeetingDate();
    console.log("[CoachPulse] Meeting date:", meetingDate.toString());

    root.SheetsReader.loadAll()
      .then(function (data) {
        root.__cpData = data;
        console.log("[CoachPulse] All data loaded:", data);

        showStatus("Computing engine state for active clients…", "loading");

        // 1. Run engine per client (this Thursday + last Thursday)
        var states = root.StateBuilder.buildAll(data, meetingDate);
        root.__cpStates = states;
        console.log("[CoachPulse] Engine states (" + states.length + " clients):", states);

        // 2. Group by coach
        var grouped = root.StateBuilder.groupByCoach(states);
        root.__cpStatesByCoach = grouped;

        // 3. Compute metrics per coach
        var metrics = {};
        CFG.COACHES.forEach(function (coachName) {
          var coachStates = grouped[coachName] || [];
          var sc = root.Scorecard.computeForCoach(coachName, coachStates, data.masterSheet, meetingDate);
          var cl = root.Checklist.computeForCoach(coachName, coachStates, data, meetingDate);
          var cd = root.RenewalRadar.computeForCoach(coachName, data.masterSheet, data.manualCD, meetingDate);
          metrics[coachName] = {
            activeClients: coachStates.length,
            S1: sc.S1, S2: sc.S2, S3: sc.S3, S4: sc.S4,
            CA: cl.CA, CB: cl.CB, CC: cl.CC,
            CD: cd
          };
        });
        root.__cpMetrics = metrics;
        console.log("[CoachPulse] Computed metrics:", metrics);

        showStatus("Ready.", "ok");
        renderResults(metrics, meetingDate);
      })
      .catch(function (err) {
        showStatus("Load/compute failed: " + err.message, "error");
        console.error("[CoachPulse] Error:", err);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : this);
