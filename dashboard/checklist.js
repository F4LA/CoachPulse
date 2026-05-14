/**
 * Coach Pulse Dashboard — Behavior Checklist (CA, CB, CC)
 *
 * CA — Form Submission Rate (engine-derived from Form Responses + Roster)
 * CB — Community Post        (manual, read from Manual Inputs Tab 1)
 * CC — Client Win Shoutout   (manual, read from Manual Inputs Tab 1)
 *
 * CD is handled separately in renewal-radar.js (it has a per-client list).
 */
(function (root) {
  "use strict";

  var CFG = root.CoachPulseConfig;
  if (!CFG) throw new Error("checklist: CoachPulseConfig not loaded");
  if (!root.CoachingWeek) throw new Error("checklist: CoachingWeek engine not loaded");

  /* ---------- helpers ---------- */

  function pct(num, den) {
    if (!den) return 0;
    return (num / den) * 100;
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function colorForCA(value) {
    var t = CFG.THRESHOLDS.CA;
    if (value >= t.green) return "green";
    if (value >= t.yellow) return "yellow";
    return "red";
  }

  function parseDate(s) {
    if (!s) return null;
    if (s instanceof Date) return s;
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function formatYMD(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  /**
   * Returns the closing Wednesday date (YYYY-MM-DD) of the closed
   * Coaching Week relative to `meetingDate` (this Thursday).
   * Under Thu-Wed engine, closed week ended yesterday (Wed 23:59 ET).
   */
  function closingWedOfClosedWeek(meetingDate) {
    var wed = new Date(meetingDate.getTime());
    wed.setDate(wed.getDate() - 1);
    return formatYMD(wed);
  }

  /* ---------- CA: Form Submission Rate ---------- */
  /*
   * % of coach's active clients who submitted ≥1 form in the just-closed
   * Coaching Week (Thu 00:00 ET → Wed 23:59 ET of the previous week).
   *
   * Source: Form Responses sheet. Engine schema:
   *   row[0] = timestamp, row[1] = client name (matches roster.client)
   *
   * Note: We use the engine's CoachingWeek to compute the window so the
   * boundary stays in sync if the engine changes (and Thu-Wed is now baked
   * into the pinned engine hash).
   */
  function computeCA(coachStates, formResponses, meetingDate) {
    // Compute closed week range from the engine.
    var closedWeekId = root.CoachingWeek.closedCoachingWeek(meetingDate);
    var range = root.CoachingWeek.coachingWeekRange(closedWeekId);
    // range.start, range.end are Date objects in absolute time (representing
    // Thu 00:00 ET start and Wed 23:59:59.999 ET end, post-engine-change).

    // Build a set of clients who submitted in window.
    var submittedClients = {};
    for (var i = 1; i < formResponses.length; i++) {  // skip header
      var row = formResponses[i];
      if (!row || !row[0] || !row[1]) continue;
      var ts = parseDate(row[0]);
      if (!ts) continue;
      if (ts >= range.start && ts <= range.end) {
        submittedClients[String(row[1]).trim()] = true;
      }
    }

    // For each client in coachStates, did they submit?
    var submitted = [];
    var didNotSubmit = [];
    for (var j = 0; j < coachStates.length; j++) {
      var cs = coachStates[j];
      if (submittedClients[cs.clientName]) {
        submitted.push(cs.clientName);
      } else {
        didNotSubmit.push({
          clientName:         cs.clientName,
          lastSubmissionDate: findLastSubmission(cs.clientName, formResponses)
        });
      }
    }

    var total = coachStates.length;
    var value = round1(pct(submitted.length, total));
    return {
      value:         value,
      color:         colorForCA(value),
      displayString: value + "%",
      breakdown: {
        didNotSubmit: didNotSubmit,
        numerator:    submitted.length,
        denominator:  total
      },
      window: {
        weekId: closedWeekId,
        start:  range.start,
        end:    range.end
      }
    };
  }

  function findLastSubmission(clientName, formResponses) {
    var latest = null;
    for (var i = 1; i < formResponses.length; i++) {
      var row = formResponses[i];
      if (!row || !row[1]) continue;
      if (String(row[1]).trim() !== clientName) continue;
      var ts = parseDate(row[0]);
      if (!ts) continue;
      if (!latest || ts > latest) latest = ts;
    }
    return latest ? latest.toISOString().slice(0, 10) : null;
  }

  /* ---------- CB: Community Post ----------
   *
   * Reads manualCB_CC for (week, coach) row.
   * - "Yes" -> green
   * - "No"  -> red
   * - no row, or blank -> neutral "—"
   */

  function computeCB(coachName, manualCB_CC, meetingDate) {
    var wedYMD = closingWedOfClosedWeek(meetingDate);
    var row = manualCB_CC.find(function (r) {
      return r.weekEndingWed === wedYMD && r.coach === coachName;
    });

    if (!row || !row.cb || row.cb === "") {
      return {
        value:         null,
        color:         "neutral",
        displayString: CFG.MANUAL_UNSET_DISPLAY,
        breakdown:     { lastUpdated: null }
      };
    }

    var val = row.cb.trim();
    var color = "neutral";
    if (val.toLowerCase() === "yes") color = "green";
    else if (val.toLowerCase() === "no") color = "red";

    return {
      value:         val,
      color:         color,
      displayString: val,
      breakdown:     { lastUpdated: row.lastUpdated || null }
    };
  }

  /* ---------- CC: Client Win Shoutout ----------
   *
   * Reads manualCB_CC for (week, coach) row.
   * - "Done"    -> green
   * - "Pending" -> yellow
   * - "Missed"  -> red
   * - no row, or blank -> neutral "—"  (no automatic date-based defaults)
   */

  function computeCC(coachName, manualCB_CC, meetingDate) {
    var wedYMD = closingWedOfClosedWeek(meetingDate);
    var row = manualCB_CC.find(function (r) {
      return r.weekEndingWed === wedYMD && r.coach === coachName;
    });

    if (!row || !row.cc || row.cc === "") {
      return {
        value:         null,
        color:         "neutral",
        displayString: CFG.MANUAL_UNSET_DISPLAY,
        breakdown:     { lastUpdated: null }
      };
    }

    var val = row.cc.trim();
    var color = "neutral";
    var lower = val.toLowerCase();
    if (lower === "done") color = "green";
    else if (lower === "pending") color = "yellow";
    else if (lower === "missed") color = "red";

    return {
      value:         val,
      color:         color,
      displayString: val,
      breakdown:     { lastUpdated: row.lastUpdated || null }
    };
  }

  /* ---------- public ---------- */

  function computeForCoach(coachName, coachStates, data, meetingDate) {
    return {
      CA: computeCA(coachStates, data.formResponses, meetingDate),
      CB: computeCB(coachName, data.manualCB_CC, meetingDate),
      CC: computeCC(coachName, data.manualCB_CC, meetingDate)
    };
  }

  root.Checklist = {
    computeForCoach: computeForCoach,
    _internal: {
      computeCA: computeCA,
      computeCB: computeCB,
      computeCC: computeCC,
      closingWedOfClosedWeek: closingWedOfClosedWeek
    }
  };
})(typeof window !== "undefined" ? window : this);
