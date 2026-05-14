/**
 * Coach Pulse Dashboard — App
 *
 * Phase 1 scope:
 *   - Load all 6 sheet sources in parallel.
 *   - Confirm engine loaded from CDN.
 *   - Expose loaded data on window for DevTools inspection.
 *   - Render a minimal shell (not the real UI — that comes in Phase 3).
 *
 * Phases 2-5 will replace renderShell() with real metric calculation
 * and the per-coach tab UI.
 */
(function (root) {
  "use strict";

  var CFG = root.CoachPulseConfig;

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

  function renderShell(data) {
    var counts = {
      roster:        data.roster.length,
      formResponses: data.formResponses.length,
      hcActions:     data.hcActions.length,
      masterSheet:   data.masterSheet.length,
      manualCB_CC:   data.manualCB_CC.length,
      manualCD:      data.manualCD.length
    };

    var coachCounts = {};
    for (var i = 0; i < data.roster.length; i++) {
      var c = data.roster[i].coach;
      coachCounts[c] = (coachCounts[c] || 0) + 1;
    }

    var rows = CFG.COACHES.map(function (coach) {
      return "<tr><td>" + coach + "</td><td>" + (coachCounts[coach] || 0) + "</td></tr>";
    }).join("");

    var html =
      "<div class=\"shell-card\">" +
        "<h2>Phase 1 — Foundation</h2>" +
        "<p class=\"muted\">All 6 data sources loaded. Engine pinned to <code>" + CFG.ENGINE_HASH + "</code>.</p>" +
        "<h3>Source row counts</h3>" +
        "<ul>" +
          "<li>Roster: <strong>" + counts.roster + "</strong></li>" +
          "<li>Form Responses: <strong>" + counts.formResponses + "</strong></li>" +
          "<li>HC Actions: <strong>" + counts.hcActions + "</strong></li>" +
          "<li>Master Sheet: <strong>" + counts.masterSheet + "</strong></li>" +
          "<li>Manual CB/CC: <strong>" + counts.manualCB_CC + "</strong></li>" +
          "<li>Manual CD: <strong>" + counts.manualCD + "</strong></li>" +
        "</ul>" +
        "<h3>Active clients by coach</h3>" +
        "<table class=\"simple-table\">" +
          "<thead><tr><th>Coach</th><th>Active clients</th></tr></thead>" +
          "<tbody>" + rows + "</tbody>" +
        "</table>" +
        "<p class=\"muted\">Open DevTools → Console. Inspect <code>window.__cpData</code> for the full payload.</p>" +
      "</div>";

    document.getElementById("main").innerHTML = html;
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

    root.SheetsReader.loadAll()
      .then(function (data) {
        root.__cpData = data;
        console.log("[CoachPulse] All data loaded:", data);
        showStatus("Ready.", "ok");
        renderShell(data);
      })
      .catch(function (err) {
        showStatus("Data load failed: " + err.message, "error");
        console.error("[CoachPulse] Load error:", err);
      });
  }

  // Wait for DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : this);
