/**
 * Coach Pulse Dashboard — Behavior Checklist (CA, CB, CC)
 *
 * CA fix: Form Responses has columns:
 *   A: Timestamp
 *   B: Client (NOT coach — this is the client the form is about)
 *   C: Exempt
 *   D: Justification
 *   ...
 *
 * To attribute a form to a coach, we look up the client in the roster
 * and use that client's assigned coach.
 */
(function (root) {
  "use strict";

  var CFG = root.CoachPulseConfig;
  var helpers = root.Scorecard && root.Scorecard.helpers;
  if (!CFG)     throw new Error("checklist: CoachPulseConfig not loaded");
  if (!helpers) throw new Error("checklist: Scorecard helpers not loaded");

  function getCoachingWeekWindow(meetingDate) {
    var weekEnd = new Date(meetingDate.getTime() - 1 * 24 * 60 * 60 * 1000);
    weekEnd.setHours(23, 59, 59, 999);
    var weekStart = new Date(weekEnd.getTime() - 6 * 24 * 60 * 60 * 1000);
    weekStart.setHours(0, 0, 0, 0);
    return { start: weekStart, end: weekEnd };
  }

  function ymdET(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  /* ---------- Form Responses column positions ---------- */

  var FR_COL_TIMESTAMP = 0;
  var FR_COL_CLIENT    = 1;  // confirmed via inspection of actual sheet headers

  /* ---------- CA: Form Submission Rate ---------- */
  /*
   * Counts unique clients (per coach) for whom a Minimum Standards form
   * was submitted during the closed coaching week.
   *
   * Coach is derived by looking up the client in the roster map.
   */
  function buildCA(coach, formResponses, clientToCoach, rosterCount, window) {
    var submitted = {};

    for (var i = 1; i < formResponses.length; i++) {
      var row = formResponses[i];
      if (!row || !row[FR_COL_TIMESTAMP]) continue;
      var ts = helpers.parseDateLoose(row[FR_COL_TIMESTAMP]);
      if (!ts) continue;
      if (ts < window.start || ts > window.end) continue;
      var client = (row[FR_COL_CLIENT] || "").trim();
      if (!client) continue;
      var assignedCoach = clientToCoach[client];
      if (assignedCoach !== coach) continue;
      submitted[client] = ts;
    }

    var submittedCount = Object.keys(submitted).length;
    var percent = helpers.pct(submittedCount, rosterCount);

    return {
      value: percent,
      displayString: rosterCount === 0 ? "—" : helpers.fmtPct(percent),
      subDisplay: submittedCount + " of " + rosterCount,
      color: rosterCount === 0
        ? "neutral"
        : helpers.colorForPercentHigherBetter(percent, CFG.THRESHOLDS.formSub),
      breakdown: {
        submittedClientNames: Object.keys(submitted),
        nonSubmitters: []
      }
    };
  }

  /* ---------- CB / CC ---------- */

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
        subDisplay: "not set",
        color: "neutral",
        breakdown: { value: null, lastUpdated: null }
      };
    }
    var v = entry.cb.trim();
    return {
      value: v,
      displayString: v,
      subDisplay: entry.lastUpdated ? "updated " + entry.lastUpdated : "",
      color: v.toLowerCase() === "yes" ? "green" : "red",
      breakdown: { value: v, lastUpdated: entry.lastUpdated }
    };
  }

  function buildCC(entry) {
    if (!entry || !entry.cc) {
      return {
        value: null,
        displayString: CFG.MANUAL_UNSET_DISPLAY,
        subDisplay: "not set",
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
      subDisplay: entry.lastUpdated ? "updated " + entry.lastUpdated : "",
      color: color,
      breakdown: { value: v, lastUpdated: entry.lastUpdated }
    };
  }

  /* ---------- Non-submitters helper ---------- */

  function fillNonSubmitters(caResult, coachActiveClients, formResponses) {
    var submittedSet = {};
    for (var i = 0; i < caResult.breakdown.submittedClientNames.length; i++) {
      submittedSet[caResult.breakdown.submittedClientNames[i]] = true;
    }

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
    var weekKey = ymdET(window.end);

    // Build client → coach map from roster
    var clientToCoach = {};
    for (var r = 0; r < data.roster.length; r++) {
      var entry = data.roster[r];
      if (entry.client) clientToCoach[entry.client] = entry.coach;
    }

    // Active clients per coach (from engine states, already excludes inactive)
    var clientsByCoach = {};
    for (var i = 0; i < CFG.COACHES.length; i++) clientsByCoach[CFG.COACHES[i]] = [];
    for (var j = 0; j < states.current.length; j++) {
      var s = states.current[j];
      if (clientsByCoach[s.coach]) clientsByCoach[s.coach].push(s.client);
    }

    // Diagnostic: log forms whose client isn't in roster (typos, deactivated clients, etc.)
    var unmatched = {};
    for (var f = 1; f < data.formResponses.length; f++) {
      var row = data.formResponses[f];
      if (!row || !row[FR_COL_TIMESTAMP]) continue;
      var ts = helpers.parseDateLoose(row[FR_COL_TIMESTAMP]);
      if (!ts) continue;
      if (ts < window.start || ts > window.end) continue;
      var clientName = (row[FR_COL_CLIENT] || "").trim();
      if (!clientName) continue;
      if (!clientToCoach[clientName]) {
        unmatched[clientName] = (unmatched[clientName] || 0) + 1;
      }
    }
    if (Object.keys(unmatched).length > 0 && root.console && root.console.warn) {
      root.console.warn("[CA] Forms in window with unmatched client names:", unmatched);
    }

    var out = {};
    for (var k = 0; k < CFG.COACHES.length; k++) {
      var c = CFG.COACHES[k];
      var entry = findManualEntry(data.manualCB_CC, weekKey, c);
      var ca = buildCA(c, data.formResponses, clientToCoach, clientsByCoach[c].length, window);
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
