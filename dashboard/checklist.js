/**
 * Coach Pulse Dashboard — Behavior Checklist (CA, CB, CC)
 *
 * CA = Form Submission Rate (engine-derived from Form Responses)
 * CB = Community Post (manual, gray default if no entry)
 * CC = Client Win Shoutout (manual, gray default if no entry)
 *
 * CD is in renewal-radar.js since it's tied to Master Sheet logic.
 *
 * Output:
 *   { Brent: { CA, CB, CC }, Ceci: ..., ... }
 *
 * Each metric returns { value, displayString, color, breakdown }.
 */
(function (root) {
  "use strict";

  var CFG = root.CoachPulseConfig;
  var helpers = root.Scorecard && root.Scorecard.helpers;
  if (!CFG)     throw new Error("checklist: CoachPulseConfig not loaded");
  if (!helpers) throw new Error("checklist: Scorecard helpers not loaded (load scorecard.js first)");

  /* ---------- Date helpers ---------- */

  function getCoachingWeekWindow(meetingDate) {
    // Closed coaching week: previous Thursday 00:00 ET → Wednesday 23:59 ET
    var weekEnd = new Date(meetingDate.getTime() - 1 * 24 * 60 * 60 * 1000);
    weekEnd.setHours(23, 59, 59, 999);
    var weekStart = new Date(weekEnd.getTime() - 6 * 24 * 60 * 60 * 1000);
    weekStart.setHours(0, 0, 0, 0);
    return { start: weekStart, end: weekEnd };
  }

  function ymdET(date) {
    // Treat as ET-naive YYYY-MM-DD for matching keys in Manual Inputs sheet.
    // We're not adjusting for timezones in the data — the sheet stores
    // YYYY-MM-DD strings keyed to the closing Wednesday.
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  /* ---------- CA: Form Submission Rate ---------- */
  /*
   * Form Responses schema (per Flag System Form & Sheet Reference):
   *   - col A: Timestamp
   *   - col B: Coach Name (the COACH submitting on behalf of client)
   *   - col C: Client Name
   *   ... etc
   *
   * The engine uses these to build per-week timelines per client.
   * For CA we count unique clients (per coach) who submitted at least one
   * form whose Timestamp is inside the closed coaching week window.
   *
   * Denominator: that coach's active roster size.
   * Exempt is a field within a submission — a submitted form marked Exempt
   * still counts as submitted.
   */

  // Form Responses column positions (matches Flag System form layout).
  // Adjust if FlagSystem form ever changes column order.
  var FR_COL_TIMESTAMP = 0;
  var FR_COL_COACH     = 1;
  var FR_COL_CLIENT    = 2;

  function buildCA(coach, formResponses, rosterCount, window) {
    // Set of unique client names that submitted in window for this coach
    var submitted = {};
    var nonSubmittersBreakdown = []; // filled at end

    for (var i = 1; i < formResponses.length; i++) {  // skip header
      var row = formResponses[i];
      if (!row || !row[FR_COL_TIMESTAMP]) continue;
      var rowCoach = (row[FR_COL_COACH] || "").trim();
      if (rowCoach !== coach) continue;
      var ts = helpers.parseDateLoose(row[FR_COL_TIMESTAMP]);
      if (!ts) continue;
      if (ts < window.start || ts > window.end) continue;
      var client = (row[FR_COL_CLIENT] || "").trim();
      if (client) submitted[client] = ts;
    }

    var submittedCount = Object.keys(submitted).length;
    var percent = helpers.pct(submittedCount, rosterCount);

    // Breakdown: clients who did NOT submit. To populate name + last submission date,
    // we'd need the coach's active client list. That's available through state-builder
    // but we don't pass it here. For Phase 2 the breakdown is "X submitted of Y active".
    // Phase 3 wires the full list with last-submission dates.

    return {
      value: percent,
      displayString: submittedCount + " / " + rosterCount + " (" + helpers.fmtPct(percent) + ")",
      color: helpers.colorForPercentReverse(percent, CFG.THRESHOLDS.CA),
      breakdown: {
        submittedClientNames: Object.keys(submitted),
        // nonSubmitters will be filled at compute() level where we have roster
        nonSubmitters: nonSubmittersBreakdown
      }
    };
  }

  /* ---------- CB / CC: manual inputs, gray when unset ---------- */

  function findManualEntry(manualCB_CC, weekKey, coach) {
    for (var i = 0; i < manualCB_CC.length; i++) {
      var r = manualCB_CC[i];
      if (r.weekEndingWed === weekKey && r.coach === coach) return r;
    }
    return null;
  }

  function buildCB(entry) {
    if (!entry || !entry.cb) {
      return {
        value: null,
        displayString: CFG.MANUAL_UNSET_DISPLAY,
        color: "neutral",
        breakdown: { value: null, lastUpdated: null }
      };
    }
    var v = entry.cb.trim();
    return {
      value: v,
      displayString: v,
      color: v.toLowerCase() === "yes" ? "green" : "red",
      breakdown: { value: v, lastUpdated: entry.lastUpdated }
    };
  }

  function buildCC(entry) {
    if (!entry || !entry.cc) {
      return {
        value: null,
        displayString: CFG.MANUAL_UNSET_DISPLAY,
        color: "neutral",
        breakdown: { value: null, lastUpdated: null }
      };
    }
    var v = entry.cc.trim();
    var color = "neutral";
    if (v.toLowerCase() === "done")    color = "green";
    if (v.toLowerCase() === "pending") color = "yellow";
    if (v.toLowerCase() === "missed")  color = "red";
    return {
      value: v,
      displayString: v,
      color: color,
      breakdown: { value: v, lastUpdated: entry.lastUpdated }
    };
  }

  /* ---------- Compute non-submitters list using roster ---------- */

  function fillNonSubmitters(caResult, coachActiveClients, formResponses) {
    var submittedSet = {};
    for (var i = 0; i < caResult.breakdown.submittedClientNames.length; i++) {
      submittedSet[caResult.breakdown.submittedClientNames[i]] = true;
    }

    // For each active client NOT in submittedSet, find last submission date (any time)
    var lastSubByClient = {};
    for (var j = 1; j < formResponses.length; j++) {
      var row = formResponses[j];
      if (!row || !row[FR_COL_TIMESTAMP]) continue;
      var client = (row[FR_COL_CLIENT] || "").trim();
      if (!client) continue;
      var ts = helpers.parseDateLoose(row[FR_COL_TIMESTAMP]);
      if (!ts) continue;
      if (!lastSubByClient[client] || ts > lastSubByClient[client]) {
        lastSubByClient[client] = ts;
      }
    }

    var nonSubs = [];
    for (var k = 0; k < coachActiveClients.length; k++) {
      var name = coachActiveClients[k];
      if (submittedSet[name]) continue;
      var last = lastSubByClient[name];
      nonSubs.push({
        client: name,
        lastSubmission: last ? last.toISOString().slice(0, 10) : "never"
      });
    }

    caResult.breakdown.nonSubmitters = nonSubs;
    return caResult;
  }

  /* ---------- Top-level ---------- */

  function compute(data, states, meetingDate) {
    var window  = getCoachingWeekWindow(meetingDate);
    var weekKey = ymdET(window.end);  // Wednesday closing date

    // Group active clients by coach (for CA denominator + non-submitters list)
    var clientsByCoach = {};
    for (var i = 0; i < CFG.COACHES.length; i++) clientsByCoach[CFG.COACHES[i]] = [];
    for (var j = 0; j < states.current.length; j++) {
      var s = states.current[j];
      if (clientsByCoach[s.coach]) clientsByCoach[s.coach].push(s.client);
    }

    var out = {};
    for (var k = 0; k < CFG.COACHES.length; k++) {
      var c = CFG.COACHES[k];
      var entry = findManualEntry(data.manualCB_CC, weekKey, c);
      var ca = buildCA(c, data.formResponses, clientsByCoach[c].length, window);
      fillNonSubmitters(ca, clientsByCoach[c], data.formResponses);

      out[c] = {
        CA: ca,
        CB: buildCB(entry),
        CC: buildCC(entry)
      };
    }
    return out;
  }

  root.Checklist = {
    compute: compute,
    helpers: { getCoachingWeekWindow: getCoachingWeekWindow, ymdET: ymdET }
  };
})(typeof window !== "undefined" ? window : this);
