/**
 * Coach Pulse Dashboard — Scorecard (S1-S4)
 *
 * Per-coach metrics computed from engine state (states grouped by coach)
 * and Master Sheet (for S4).
 *
 * Each metric returns:
 *   { value, color, displayString, breakdown }
 *
 * `color` ∈ "green" | "yellow" | "red" | "neutral"
 * `breakdown` is the data for the side-panel client list (used in Phase 4).
 */
(function (root) {
  "use strict";

  var CFG = root.CoachPulseConfig;
  if (!CFG) throw new Error("scorecard: CoachPulseConfig not loaded");

  /* ---------- helpers ---------- */

  function pct(num, den) {
    if (!den) return 0;
    return (num / den) * 100;
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function colorForS1(value) {
    var t = CFG.THRESHOLDS.S1;
    if (value <= t.green) return "green";
    if (value <= t.yellow) return "yellow";
    return "red";
  }

  function colorForS2(value) {
    var t = CFG.THRESHOLDS.S2;
    if (value <= t.green) return "green";
    if (value <= t.yellow) return "yellow";
    return "red";
  }

  function parseDate(s) {
    if (!s) return null;
    if (s instanceof Date) return s;
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  /* ---------- S1: % New Red Flags ---------- */
  // Clients whose color flipped Red this week (previous != Red, current == Red).

  function computeS1(coachStates) {
    var newReds = [];
    var total = coachStates.length;

    for (var i = 0; i < total; i++) {
      var s = coachStates[i];
      var prevColor = (s.previousState && s.previousState.color) || "Green";
      var currColor = (s.currentState  && s.currentState.color)  || "Green";

      if (prevColor !== "Red" && currColor === "Red") {
        newReds.push({
          clientName:      s.clientName,
          dominantPathway: s.currentState.dominantPathway || null
        });
      }
    }

    var value = round1(pct(newReds.length, total));
    return {
      value:         value,
      color:         colorForS1(value),
      displayString: value + "%",
      breakdown: {
        clients:    newReds,
        numerator:  newReds.length,
        denominator: total
      }
    };
  }

  /* ---------- S2: % Yellow/Red Cumulative ---------- */

  function computeS2(coachStates) {
    var total = coachStates.length;
    var yellows = [];
    var reds = [];

    for (var i = 0; i < total; i++) {
      var s = coachStates[i];
      var c = (s.currentState && s.currentState.color) || "Green";
      if (c === "Yellow") {
        yellows.push({
          clientName:      s.clientName,
          dominantPathway: s.currentState.dominantPathway || null
        });
      } else if (c === "Red") {
        reds.push({
          clientName:      s.clientName,
          dominantPathway: s.currentState.dominantPathway || null
        });
      }
    }

    var combined = yellows.length + reds.length;
    var value = round1(pct(combined, total));

    return {
      value:         value,
      color:         colorForS2(value),
      displayString: value + "%",
      breakdown: {
        yellows:    yellows,
        reds:       reds,
        numerator:  combined,
        denominator: total
      }
    };
  }

  /* ---------- S3: % Black-Flagged (informational) ---------- */

  function computeS3(coachStates) {
    var total = coachStates.length;
    var blackFlagged = [];

    for (var i = 0; i < total; i++) {
      var s = coachStates[i];
      var bf = s.currentState && s.currentState.blackFlags;
      if (bf && bf.active) {
        blackFlagged.push({
          clientName:    s.clientName,
          lastTriggered: bf.lastTriggeredAt || null
        });
      }
    }

    var value = round1(pct(blackFlagged.length, total));
    return {
      value:         value,
      color:         "neutral",
      displayString: blackFlagged.length === 0 ? "0% ✓" : value + "%",
      breakdown: {
        clients:    blackFlagged,
        numerator:  blackFlagged.length,
        denominator: total
      }
    };
  }

  /* ---------- S4: Renewals Last Week (informational) ----------
   *
   * Per decision in Phase 1 design: muestra muy pequeña por coach por semana
   * (0-3 clientes típicamente). Mostrar como informational, sin thresholds.
   *
   * Source: Master Sheet col R (New End Date), col T (Resign?), col J (Coach).
   * Window: the just-closed Coaching Week (Thu 00:00 -> Wed 23:59 ET).
   *   With meetingDate = Thursday, the closed window is:
   *     previous Thursday 00:00 -> previous Wednesday 23:59
   *
   * Numerator: clients in window with Resign? === "No"  (renewed)
   * Denominator: clients in window with Resign? not blank (decision made)
   * Excluded: rows with blank Resign?
   */

  function computeS4(coachName, masterSheet, meetingDate) {
    // Window: previous Thursday 00:00 ET through previous Wednesday 23:59 ET
    // (the just-closed Coaching Week relative to today/Thursday).
    var windowEnd = new Date(meetingDate.getTime());
    windowEnd.setHours(0, 0, 0, 0);
    // windowEnd is Thursday 00:00 ET → exclusive upper bound

    var windowStart = new Date(windowEnd.getTime());
    windowStart.setDate(windowStart.getDate() - 7);
    // windowStart is previous Thursday 00:00 ET (inclusive)

    var inWindow = [];
    for (var i = 0; i < masterSheet.length; i++) {
      var row = masterSheet[i];
      if (row.coach !== coachName) continue;
      var endDate = parseDate(row.newEndDate);
      if (!endDate) continue;
      if (endDate >= windowStart && endDate < windowEnd) {
        inWindow.push(row);
      }
    }

    var decided = inWindow.filter(function (r) {
      return r.resign && r.resign.trim() !== "";
    });
    var renewed = decided.filter(function (r) {
      return r.resign.trim().toLowerCase() === "no";
    });

    var pctValue = decided.length > 0 ? round1(pct(renewed.length, decided.length)) : null;
    var display;
    if (decided.length === 0) {
      display = "—";
    } else {
      display = renewed.length + "/" + decided.length + " (" + pctValue + "%)";
    }

    return {
      value:         pctValue,
      color:         "neutral",
      displayString: display,
      breakdown: {
        clients:    inWindow.map(function (r) {
          return {
            clientName: (r.firstName + " " + r.lastName).trim(),
            endDate:    r.newEndDate,
            resign:     r.resign
          };
        }),
        renewed:    renewed.length,
        decided:    decided.length,
        inWindow:   inWindow.length
      }
    };
  }

  /* ---------- public ---------- */

  function computeForCoach(coachName, coachStates, masterSheet, meetingDate) {
    return {
      S1: computeS1(coachStates),
      S2: computeS2(coachStates),
      S3: computeS3(coachStates),
      S4: computeS4(coachName, masterSheet, meetingDate)
    };
  }

  root.Scorecard = {
    computeForCoach: computeForCoach,
    _internal: {
      computeS1: computeS1,
      computeS2: computeS2,
      computeS3: computeS3,
      computeS4: computeS4
    }
  };
})(typeof window !== "undefined" ? window : this);
