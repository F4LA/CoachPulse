/**
 * Coach Pulse Dashboard — Scorecard (S1–S4)
 */
(function (root) {
  "use strict";

  var CFG = root.CoachPulseConfig;
  if (!CFG) throw new Error("scorecard: CoachPulseConfig not loaded");

  /* ---------- Color helpers ---------- */

  function colorForPercentLowerBetter(pct, thresholds) {
    // lower is better. green if <=green, yellow if <=yellow, else red
    if (pct <= thresholds.green) return "green";
    if (pct <= thresholds.yellow) return "yellow";
    return "red";
  }

  function colorForPercentHigherBetter(pct, thresholds) {
    // higher is better. green if >=green, yellow if >=yellow, else red
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

  /* ---------- Pathway extraction from engine state ----------
   *
   * The engine returns:
   *   {
   *     dominantPathway: "P1" | "P2" | "P3" | null,
   *     pathwayStates: {
   *       p1: { color, streakLength, active, ... },
   *       p2: [ { color, streakLength, ... }, ... ],
   *       p3: { color, streakLength, active, ... }
   *     }
   *   }
   *
   * For the breakdown panel we need a human-readable
   * { activePathway, pathwayWeek } pair.
   *
   * - activePathway: dominantPathway string ("P1", "P2", "P3"), or "—".
   * - pathwayWeek: streakLength of the dominant pathway. For P2 (array),
   *   we pick the entry with the highest streakLength that matches the
   *   client's current color (driving the dominant call).
   */
  function pathwayInfo(state) {
    if (!state) return { activePathway: "—", pathwayWeek: "—" };
    var dom = state.dominantPathway;
    if (!dom) return { activePathway: "—", pathwayWeek: "—" };
    var key = String(dom).toLowerCase();
    var ps = state.pathwayStates || {};

    var week = null;
    if (key === "p2") {
      var arr = ps.p2 || [];
      var maxLen = 0;
      for (var i = 0; i < arr.length; i++) {
        var sl = (arr[i] && arr[i].streakLength) || 0;
        if (sl > maxLen) maxLen = sl;
      }
      week = maxLen > 0 ? maxLen : null;
    } else if (key === "p1") {
      week = (ps.p1 && ps.p1.streakLength) || null;
    } else if (key === "p3") {
      week = (ps.p3 && ps.p3.streakLength) || null;
    }

    return {
      activePathway: String(dom).toUpperCase(),
      pathwayWeek:   week != null && week > 0 ? "Week " + week : "—"
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

  /* ---------- S3: Black-Flagged (informational) ---------- */

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

  /* ---------- S4: Renewals Last Week (informational) ---------- */

  function buildS4(coach, masterSheet, meetingDate) {
    var weekEnd = new Date(meetingDate.getTime() - 1 * 24 * 60 * 60 * 1000);
    weekEnd.setHours(23, 59, 59, 999);
    var weekStart = new Date(weekEnd.getTime() - 6 * 24 * 60 * 60 * 1000);
    weekStart.setHours(0, 0, 0, 0);

    var inWindow = [];
    for (var i = 0; i < masterSheet.length; i++) {
      var r = masterSheet[i];
      if (r.coach !== coach) continue;
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

    var X = 0, Y = 0;
    for (var j = 0; j < inWindow.length; j++) {
      var resign = (inWindow[j].resign || "").trim();
      if (resign === "") continue;
      Y++;
      if (resign.toLowerCase() === "no") X++;
    }

    var display, sub;
    if (inWindow.length === 0) {
      display = "—";
      sub = "no contracts";
    } else if (Y === 0) {
      display = "0/0";
      sub = "no decisions yet";
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
