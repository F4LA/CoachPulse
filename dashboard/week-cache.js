/**
 * Coach Pulse Dashboard — Week Cache
 *
 * Lazy computes and caches per-week metrics for all coaches.
 *
 * Phase 4B.2 fix: normalizeToWednesdayEnd previously used Intl with
 * timeZone "America/New_York" to extract the weekday. With DST applied,
 * a Date constructed in the browser's local time could shift to a
 * different weekday in ET — pushing the computed Wednesday +7 days.
 * The fix uses local-time date math (getDay/setDate/setHours), matching
 * week-nav.js. This is safe because:
 *   1. getDefaultMeetingDate in app.js already produces a Wed 23:59:59.999
 *      that is the correct ET moment.
 *   2. From that anchor, ±7-day arithmetic preserves the Wed semantics
 *      regardless of DST, because the time-of-day (23:59:59.999) gives
 *      ample buffer.
 *   3. weekKey is just the local YYYY-MM-DD of the Wed, which matches
 *      what users see in the UI ("Week ending Wed May 13").
 *
 * A "week" is identified by its Wednesday end-date (Thu-Wed coaching week).
 *
 * Computation reuses the existing pipeline:
 *   StateBuilder.build(data, meetingDate)
 *     -> Scorecard.compute(states, masterSheet, meetingDate)
 *     -> Checklist.compute(data, states, meetingDate)
 *     -> RenewalRadar.compute(data, meetingDate)
 *
 * API:
 *   WeekCache.init(sheetsData)
 *   WeekCache.getMetricsForWeek(meetingDate)            -> Promise<metrics>
 *   WeekCache.prefetchHistorical(currentMeetingDate, n) -> Promise<void>
 *   WeekCache.hasWeek(meetingDate)                      -> boolean
 *   WeekCache.onWeekReady(callback)                     -> unsubscribe fn
 *   WeekCache.invalidate(meetingDate)                   -> void
 */
(function (root) {
  "use strict";

  // ---- Module state ----
  var _sheetsData = null;
  var _cache = Object.create(null);
  var _listeners = [];

  // ---- Date helpers (local time) ----

  /**
   * Normalize any Date into the Wednesday 23:59:59.999 (local time) of
   * the Thu-Wed coaching week containing it.
   *
   * Uses local-time math:
   *   Thu (4) -> +6 days   Fri (5) -> +5   Sat (6) -> +4
   *   Sun (0) -> +3        Mon (1) -> +2   Tue (2) -> +1
   *   Wed (3) -> +0
   */
  function normalizeToWednesdayEnd(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      throw new Error("week-cache: invalid Date");
    }
    var d = new Date(date.getTime());
    var dow = d.getDay();
    var daysToWed = (3 - dow + 7) % 7;
    d.setDate(d.getDate() + daysToWed);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  /**
   * weekKey = "YYYY-MM-DD" of the Wednesday end-date (local).
   */
  function weekKeyOf(date) {
    var wedEnd = normalizeToWednesdayEnd(date);
    var y = wedEnd.getFullYear();
    var m = String(wedEnd.getMonth() + 1).padStart(2, "0");
    var d = String(wedEnd.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  // ---- Compute pipeline ----

  function ensureDeps() {
    if (!_sheetsData) {
      throw new Error("week-cache: init(sheetsData) must be called first");
    }
    if (!root.StateBuilder || !root.Scorecard || !root.Checklist || !root.RenewalRadar) {
      throw new Error("week-cache: required modules not loaded");
    }
  }

  function mergeMetrics(scorecard, checklist, renewalRadar) {
    var coaches = {};
    function collect(src) {
      if (!src) return;
      for (var coach in src) {
        if (!Object.prototype.hasOwnProperty.call(src, coach)) continue;
        coaches[coach] = coaches[coach] || {};
        var bucket = src[coach];
        for (var k in bucket) {
          if (Object.prototype.hasOwnProperty.call(bucket, k)) {
            coaches[coach][k] = bucket[k];
          }
        }
      }
    }
    collect(scorecard);
    collect(checklist);
    collect(renewalRadar);
    return coaches;
  }

  function _computeWeek(meetingDate) {
    ensureDeps();
    var states = root.StateBuilder.build(_sheetsData, meetingDate);
    var scorecard = root.Scorecard.compute(states, _sheetsData.masterSheet, meetingDate);
    var checklist = root.Checklist.compute(_sheetsData, states, meetingDate);
    var renewalRadar = root.RenewalRadar.compute(_sheetsData, meetingDate);
    return mergeMetrics(scorecard, checklist, renewalRadar);
  }

  function _notifyReady(meetingDate, metrics) {
    for (var i = 0; i < _listeners.length; i++) {
      try {
        _listeners[i](meetingDate, metrics);
      } catch (err) {
        if (root.console && root.console.warn) {
          root.console.warn("week-cache: listener threw — " + err.message);
        }
      }
    }
  }

  // ---- Public API ----

  function init(sheetsData) {
    _sheetsData = sheetsData;
    _cache = Object.create(null);
  }

  function getMetricsForWeek(meetingDate) {
    var key = weekKeyOf(meetingDate);
    var normalized = normalizeToWednesdayEnd(meetingDate);
    var entry = _cache[key];

    if (entry) {
      if (entry.status === "ready")   return Promise.resolve(entry.metrics);
      if (entry.status === "pending") return entry.promise;
      // 'error' falls through to retry.
    }

    var promise = new Promise(function (resolve) {
      setTimeout(function () {
        try {
          var metrics = _computeWeek(normalized);
          _cache[key] = { status: "ready", metrics: metrics };
          _notifyReady(normalized, metrics);
          resolve(metrics);
        } catch (err) {
          if (root.console && root.console.error) {
            root.console.error("week-cache: compute failed for " + key + " — " + err.message);
          }
          _cache[key] = { status: "error", error: err };
          resolve(null);
        }
      }, 0);
    });

    _cache[key] = { status: "pending", promise: promise };
    return promise;
  }

  function prefetchHistorical(currentMeetingDate, n) {
    if (!Number.isInteger(n) || n < 1) {
      return Promise.resolve();
    }
    var currentNormalized = normalizeToWednesdayEnd(currentMeetingDate);
    var weeks = [];
    for (var i = 1; i <= n; i++) {
      var d = new Date(currentNormalized.getTime() - i * 7 * 86400000);
      weeks.push(normalizeToWednesdayEnd(d));
    }

    return weeks.reduce(function (chain, weekDate) {
      return chain.then(function () {
        var key = weekKeyOf(weekDate);
        if (_cache[key] && _cache[key].status === "ready") {
          return null;
        }
        return getMetricsForWeek(weekDate);
      });
    }, Promise.resolve());
  }

  function hasWeek(meetingDate) {
    var key = weekKeyOf(meetingDate);
    return !!(_cache[key] && _cache[key].status === "ready");
  }

  function onWeekReady(callback) {
    if (typeof callback !== "function") {
      throw new Error("week-cache: onWeekReady requires a function");
    }
    _listeners.push(callback);
    return function unsubscribe() {
      var idx = _listeners.indexOf(callback);
      if (idx !== -1) _listeners.splice(idx, 1);
    };
  }

  function invalidate(meetingDate) {
    var key = weekKeyOf(meetingDate);
    delete _cache[key];
  }

  // ---- Exports ----

  root.WeekCache = {
    init: init,
    getMetricsForWeek: getMetricsForWeek,
    prefetchHistorical: prefetchHistorical,
    hasWeek: hasWeek,
    onWeekReady: onWeekReady,
    invalidate: invalidate,
    _internal: {
      weekKeyOf: weekKeyOf,
      normalizeToWednesdayEnd: normalizeToWednesdayEnd
    }
  };
})(typeof window !== "undefined" ? window : this);
