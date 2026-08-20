/**
 * Coach Pulse Dashboard — Scorecard (S1–S4)
 *
 * Phase 4B.2 fixes for S4 (Renewals Last Week):
 *   1. meetingDate is Wed 23:59:59.999 — no -1 day shift.
 *   2. Refunded clients (col Y = TRUE) are excluded entirely — they don't
 *      appear in the panel and don't count in either numerator or denominator.
 *   3. "Resign?" = Yes means the client renewed (re-signed). The previous
 *      code counted Resign=No as renewed, which was inverted.
 *      Now: numerator counts Resign=Yes, denominator counts all
 *      non-refunded contracts whose end date falls in the Thu-Wed window.
 */
(function (root) {
  "use strict";

  var CFG = root.CoachPulseConfig;
  if (!CFG) throw new Error("scorecard: CoachPulseConfig not loaded");

  /* ---------- Color helpers ---------- */

  function colorForPercentLowerBetter(pct, thresholds) {
    if (pct <= thresholds.green) return "green";
    if (pct <= thresholds.yellow) return "yellow";
    return "red";
  }

  function colorForPercentHigherBetter(pct, thresholds) {
    if (pct >= thresholds.green) return "green";
    if (pct >= thresholds.yellow) return "yellow";
    return "red";
  }

  function pct(num, denom) {
    if (denom === 0) return 0;
    return (num / denom) * 100;
  }

  function fmtPct(v) {
    if (v === Math.floor(v)) return v + "%";
    return v.toFixed(1) + "%";
  }

  function parseDateLoose(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    var d = new Date(v);
    if (!isNaN(d.getTime())) return d;
    var parts = String(v).split("/");
    if (parts.length === 3) {
      var m = parseInt(parts[0], 10);
      var day = parseInt(parts[1], 10);
      var y = parseInt(parts[2], 10);
      if (!isNaN(m) && !isNaN(day) && !isNaN(y)) {
        return new Date(y, m - 1, day);
      }
    }
    return null;
  }

  function groupByCoach(states) {
    var out = {};
    for (var i = 0; i < CFG.COACHES.length; i++) out[CFG.COACHES[i]] = [];
    for (var j = 0; j < states.length; j++) {
      var s = states[j];
      if (out[s.coach]) out[s.coach].push(s);
    }
    return out;
  }

  /* ---------- Pathway extraction ---------- */

  // Red-transition threshold per pathway: the streak length at which the
  // coach asks for the call (P1 = 3, P2 = 4, P3 = 5 consecutive evaluable
  // weeks). Used to show how many weeks remain before the call is due.
  var RED_THRESHOLD = { p1: 3, p2: 4, p3: 5 };

  // Engine standard names -> short HC-facing display names. Short-name
  // mapping is a presentation concern (the engine keeps full names).
  var STANDARD_SHORT = {
    "Check-In Submission": "Check-in",
    "Training Adherence":  "Training",
    "Nutrition Adherence": "Nutrition",
    "Movement Target":     "Movement",
    "Technique Feedback":  "Technique"
  };

  var CHECKIN_STD = "Check-In Submission";

  function shortStandard(name) {
    return STANDARD_SHORT[name] || name || "";
  }

  // P1 cause label, derived from the failed standards of the most recent
  // streak week (falls back to streakWeeks if templateData is absent):
  //   check-in only              -> "Acute Crisis · Missed Check-in"
  //   check-in + other(s)        -> "Acute Crisis · Check-in + Misses"
  //   no check-in (5+ via others)-> "Acute Crisis · Multiple Misses"
  function p1CauseLabel(p1) {
    var recent =
      (p1 && p1.templateData && p1.templateData.standards_list_recent) ||
      (p1 && p1.streakWeeks && p1.streakWeeks.length
        ? p1.streakWeeks[p1.streakWeeks.length - 1].failedStandards
        : null) ||
      [];
    var hasCheckin = recent.indexOf(CHECKIN_STD) !== -1;
    if (hasCheckin && recent.length === 1) return "Acute Crisis · Missed Check-in";
    if (hasCheckin) return "Acute Crisis · Check-in + Misses";
    return "Acute Crisis · Multiple Misses";
  }

  // Pick the P2 entry with the longest current streak. That streak defines
  // both the standard we name and the week number we surface.
  function dominantP2(arr) {
    if (!arr || !arr.length) return null;
    var best = null;
    for (var i = 0; i < arr.length; i++) {
      var e = arr[i];
      var sl = (e && e.streakLength) || 0;
      if (!best || sl > best.streakLength) {
        best = { standard: e.standard, streakLength: sl };
      }
    }
    return best;
  }

  // Pathway Week label:
  //   Red client              -> "Week N · call requested" (call already asked)
  //   Yellow, weeks remaining -> "Week N · X to call"
  //   Yellow, at/over threshold -> "Week N · call due"
  function pathwayWeekLabel(key, week, color) {
    if (week == null || week <= 0) return "—";
    if (color === "Red") return "Week " + week + " · call requested";
    var threshold = RED_THRESHOLD[key] || 0;
    var toCall = threshold - week;
    if (toCall > 0) return "Week " + week + " · " + toCall + " to call";
    return "Week " + week + " · call due";
  }

  function pathwayInfo(state) {
    if (!state) return { activePathway: "—", pathwayWeek: "—" };
    var dom = state.dominantPathway;
    if (!dom) return { activePathway: "—", pathwayWeek: "—" };
    var key = String(dom).toLowerCase();
    var ps = state.pathwayStates || {};
    var color = state.color;

    var label = "—";
    var week = null;

    if (key === "p1") {
      label = p1CauseLabel(ps.p1);
      week = (ps.p1 && ps.p1.streakLength) || null;
    } else if (key === "p2" || key.indexOf("p2:") === 0) {
      key = "p2"; // dominantPathway arrives as "P2:<standard>"; normalize for threshold lookup
      var d = dominantP2(ps.p2);
      if (d) {
        label = "Repeated " + shortStandard(d.standard);
        week = d.streakLength > 0 ? d.streakLength : null;
      }
    } else if (key === "p3") {
      label = "Persistent Inconsistency";
      week = (ps.p3 && ps.p3.streakLength) || null;
    }

    return {
      activePathway: label,
      pathwayWeek:   pathwayWeekLabel(key, week, color)
    };
  }

  /* ---------- S1: New Red Flags ---------- */

  function buildS1(coachCurrent, coachPrevious) {
    var prevByClient = {};
    for (var i = 0; i < coachPrevious.length; i++) {
      prevByClient[coachPrevious[i].client] = coachPrevious[i];
    }

    var newReds = [];
    for (var j = 0; j < coachCurrent.length; j++) {
      var cur = coachCurrent[j];
      if (cur.color !== "Red") continue;
      var prev = prevByClient[cur.client];
      if (!prev || prev.color !== "Red") {
        var info = pathwayInfo(cur);
        newReds.push({
          client:        cur.client,
          activePathway: info.activePathway,
          pathwayWeek:   info.pathwayWeek
        });
      }
    }

    var denom = coachCurrent.length;
    var percent = pct(newReds.length, denom);
    return {
      value: percent,
      displayString: denom === 0 ? "—" : fmtPct(percent),
      subDisplay: newReds.length + " of " + denom,
      color: colorForPercentLowerBetter(percent, CFG.THRESHOLDS.newRed),
      breakdown: newReds
    };
  }

  /* ---------- S2: Yellow/Red Cumulative ---------- */

  function buildS2(coachCurrent) {
    var yellows = [], reds = [];
    for (var i = 0; i < coachCurrent.length; i++) {
      var s = coachCurrent[i];
      if (s.color === "Yellow") yellows.push(s);
      else if (s.color === "Red") reds.push(s);
    }
    var denom = coachCurrent.length;
    var num   = yellows.length + reds.length;
    var percent = pct(num, denom);

    return {
      value: percent,
      displayString: denom === 0 ? "—" : fmtPct(percent),
      subDisplay: num + " of " + denom,
      color: colorForPercentLowerBetter(percent, CFG.THRESHOLDS.yrCum),
      breakdown: {
        yellows: yellows.map(function (s) {
          var info = pathwayInfo(s);
          return { client: s.client, activePathway: info.activePathway, pathwayWeek: info.pathwayWeek };
        }),
        reds: reds.map(function (s) {
          var info = pathwayInfo(s);
          return { client: s.client, activePathway: info.activePathway, pathwayWeek: info.pathwayWeek };
        })
      }
    };
  }

  /* ---------- S3: Black-Flagged ---------- */

  function buildS3(coachCurrent) {
    var blacks = [];
    for (var i = 0; i < coachCurrent.length; i++) {
      var s = coachCurrent[i];
      var bf = s.blackFlags;
      if (bf && bf.active) {
        blacks.push({
          client:        s.client,
          triggeredDate: bf.lastTriggeredAt || bf.triggeredDate || bf.activatedDate || "—"
        });
      }
    }
    var denom = coachCurrent.length;
    var percent = pct(blacks.length, denom);

    return {
      value: percent,
      displayString: blacks.length === 0 ? "0%" : fmtPct(percent),
      subDisplay: blacks.length + " of " + denom,
      color: "neutral",
      breakdown: blacks
    };
  }

  /* ---------- S4: Renewals Last Week ----------
   *
   * Scans masterSheet for rows where:
   *   - coach matches
   *   - newEndDate (col R) falls in [weekStart, weekEnd] = Thu-Wed window
   *   - refund (col Y) is NOT true
   *
   * Numerator: # of those with Resign? = "Yes" (re-signed = renewed)
   * Denominator: total non-refunded contracts in window
   */
  function buildS4(coach, masterSheet, meetingDate) {
    var weekEnd = new Date(meetingDate.getTime());
    weekEnd.setHours(23, 59, 59, 999);
    var weekStart = new Date(weekEnd.getTime() - 6 * 24 * 60 * 60 * 1000);
    weekStart.setHours(0, 0, 0, 0);

    var inWindow = [];
    for (var i = 0; i < masterSheet.length; i++) {
      var r = masterSheet[i];
      if (r.coach !== coach) continue;
      if (r.refund) continue;  // refunded clients excluded entirely
      var end = parseDateLoose(r.newEndDate);
      if (!end) continue;
      if (end >= weekStart && end <= weekEnd) {
        inWindow.push({
          client:  (r.firstName + " " + r.lastName).trim(),
          endDate: r.newEndDate,
          resign:  r.resign
        });
      }
    }

    var Y = inWindow.length;  // denominator: all non-refunded contracts in window
    var X = 0;                // numerator: those that renewed (Resign=Yes)
    for (var j = 0; j < inWindow.length; j++) {
      if ((inWindow[j].resign || "").trim().toLowerCase() === "yes") X++;
    }

    var display, sub;
    if (Y === 0) {
      display = "—";
      sub = "no contracts";
    } else {
      display = X + "/" + Y;
      sub = fmtPct(pct(X, Y)) + " renewed";
    }

    return {
      value: Y > 0 ? pct(X, Y) : null,
      displayString: display,
      subDisplay: sub,
      color: "neutral",
      breakdown: inWindow
    };
  }

  /* ---------- Top-level ---------- */

  function compute(states, masterSheet, meetingDate) {
    var curByCoach  = groupByCoach(states.current);
    var prevByCoach = groupByCoach(states.previous);

    var out = {};
    for (var i = 0; i < CFG.COACHES.length; i++) {
      var c = CFG.COACHES[i];
      out[c] = {
        S1: buildS1(curByCoach[c], prevByCoach[c] || []),
        S2: buildS2(curByCoach[c]),
        S3: buildS3(curByCoach[c]),
        S4: buildS4(c, masterSheet, meetingDate)
      };
    }
    return out;
  }

  root.Scorecard = {
    compute: compute,
    helpers: {
      pct: pct,
      fmtPct: fmtPct,
      colorForPercentLowerBetter: colorForPercentLowerBetter,
      colorForPercentHigherBetter: colorForPercentHigherBetter,
      parseDateLoose: parseDateLoose
    }
  };
})(typeof window !== "undefined" ? window : this);
