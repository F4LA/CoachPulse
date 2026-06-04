/**
 * Coach Pulse Dashboard — Behavior Checklist (CA, CB, CC)
 *
 * Phase 4B.2 fix: meetingDate is Wed 23:59:59.999 ET (post 4B.1 change to
 * getDefaultMeetingDate). The Thu-Wed coaching week ends ON meetingDate,
 * not the day before. Removed the legacy -1 day shift.
 *
 * CA: Form Responses has columns:
 *   A: Timestamp
 *   B: Client (NOT coach — this is the client the form is about)
 *   C: Exempt
 *   D: Justification
 *
 * To attribute a form to a coach, we look up the client in the roster
 * and use that client's assigned coach.
 *
 * Phase 4B.3 — Vacation support:
 *   When CB_CC_Inputs has Vacation=Yes for a (week, coach) entry:
 *     - CA returns neutral / "—" / "On vacation"
 *     - CB returns neutral / "—" / "On vacation"
 *     - CC is unaffected (monthly obligation, should be scheduled before vacation)
 *   The vacation flag is stored in the `vacation` field of the manual entry
 *   (column E in CB_CC_Inputs, before Last_Updated which shifts to column F).
 */
(function (root) {
  "use strict";

  var CFG = root.CoachPulseConfig;
  var helpers = root.Scorecard && root.Scorecard.helpers;
  if (!CFG)     throw new Error("checklist: CoachPulseConfig not loaded");
  if (!helpers) throw new Error("checklist: Scorecard helpers not loaded");

  /**
   * meetingDate is Wed 23:59:59.999 ET. The coaching week is the Thu-Wed
   * span ending ON meetingDate. So:
   *   weekEnd   = meetingDate (Wed 23:59:59.999)
   *   weekStart = meetingDate - 6 days, set to 00:00:00 (the Thu of that week)
   */
  function getCoachingWeekWindow(meetingDate) {
    var weekEnd = new Date(meetingDate.getTime());
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
  var FR_COL_CLIENT    = 1;

  /* ---------- CA: Form Submission Rate ---------- */

  function buildCA(coach, formResponses, clientToCoach, activeClients, window, isVacation, lateClients) {
    // Vacation override — coach not working this week, metric does not apply.
    if (isVacation) {
      return {
        value: null,
        displayString: "—",
        subDisplay: "On vacation",
        color: "neutral",
        breakdown: { submittedClientNames: [], nonSubmitters: [], lateCredited: [], vacation: true }
      };
    }

    var rosterCount = activeClients.length;

    // Set of this coach's active clients — late credit only applies to them,
    // so the numerator can never exceed the denominator.
    var activeSet = {};
    for (var a = 0; a < activeClients.length; a++) activeSet[activeClients[a]] = true;

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

    // Late check-in credit: a client manually marked as "late check-in" for
    // this week/coach counts as submitted for CA only — even though no form
    // response exists in-window. Restricted to active clients not already
    // submitted, so it strictly closes the gap toward 100%.
    var lateCredited = [];
    var late = lateClients || [];
    for (var L = 0; L < late.length; L++) {
      var lateName = late[L];
      if (!activeSet[lateName]) continue;
      if (submitted[lateName]) continue;
      submitted[lateName] = true;
      lateCredited.push(lateName);
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
        nonSubmitters: [],
        lateCredited: lateCredited
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

  /**
   * Client names with a late check-in recorded for this exact week/coach.
   * weekKey match is the same exact-string compare used by findManualEntry.
   */
  function lateCheckinsFor(lateCheckins, weekKey, coach) {
    var out = [];
    if (!lateCheckins) return out;
    for (var i = 0; i < lateCheckins.length; i++) {
      var r = lateCheckins[i];
      if (r.weekEndingWed === weekKey && r.coach === coach && r.client) {
        out.push(r.client);
      }
    }
    return out;
  }

  function buildCB(entry, isVacation) {
    // Vacation override — CB does not apply this week.
    if (isVacation) {
      return {
        value: null,
        displayString: "—",
        subDisplay: "On vacation",
        color: "neutral",
        breakdown: { value: null, lastUpdated: null, vacation: true }
      };
    }

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
    // CC is not affected by vacation — monthly obligation.
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
    // Skip when vacation — there are no submitters or non-submitters this week.
    if (caResult.breakdown && caResult.breakdown.vacation) return caResult;

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

  /* ---------- Vacation helper ---------- */

  function isCoachOnVacation(entry) {
    if (!entry) return false;
    var v = (entry.vacation || "").trim().toLowerCase();
    return v === "yes";
  }

  /* ---------- Top-level ---------- */

  function compute(data, states, meetingDate) {
    var window  = getCoachingWeekWindow(meetingDate);
    var weekKey = ymdET(window.end);  // window.end is the Wed itself

    // Build client → coach map from roster
    var clientToCoach = {};
    for (var r = 0; r < data.roster.length; r++) {
      var entry = data.roster[r];
      if (entry.client) clientToCoach[entry.client] = entry.coach;
    }

    // Active clients per coach
    var clientsByCoach = {};
    for (var i = 0; i < CFG.COACHES.length; i++) clientsByCoach[CFG.COACHES[i]] = [];
    for (var j = 0; j < states.current.length; j++) {
      var s = states.current[j];
      if (clientsByCoach[s.coach]) clientsByCoach[s.coach].push(s.client);
    }

    // Diagnostic: log forms whose client isn't in roster
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
      var manualEntry = findManualEntry(data.manualCB_CC, weekKey, c);
      var vacation    = isCoachOnVacation(manualEntry);
      var lateClients = lateCheckinsFor(data.lateCheckins, weekKey, c);

      var ca = buildCA(c, data.formResponses, clientToCoach, clientsByCoach[c], window, vacation, lateClients);
      fillNonSubmitters(ca, clientsByCoach[c], data.formResponses);

      out[c] = {
        CA: ca,
        CB: buildCB(manualEntry, vacation),
        CC: buildCC(manualEntry)
      };
    }
    return out;
  }

  root.Checklist = {
    compute: compute,
    helpers: {
      getCoachingWeekWindow: getCoachingWeekWindow,
      ymdET: ymdET,
      isCoachOnVacation: isCoachOnVacation
    }
  };
})(typeof window !== "undefined" ? window : this);
