/**
 * Coach Pulse Dashboard — Week Cache
 *
 * Lazy computes and caches per-week metrics for all coaches.
 *
 * A "week" is identified by its Wednesday end-date (Thu-Wed coaching week,
 * post engine change commit 9b179bb). Internal weekKey format: "YYYY-MM-DD"
 * of the Wednesday in ET.
 *
 * Computation reuses the existing pipeline:
 *   StateBuilder.build(data, meetingDate)
 *     -> Scorecard.compute(states, masterSheet, meetingDate)
 *     -> Checklist.compute(data, states, meetingDate)
 *     -> RenewalRadar.compute(data, meetingDate)
 *
 * The result for each week is merged into:
 *   { [coach]: { S1, S2, S3, S4, CA, CB, CC, CD } }
 *
 * API:
 *   WeekCache.init(sheetsData)
 *   WeekCache.getMetricsForWeek(meetingDate)            -> Promise<metrics>
 *   WeekCache.prefetchHistorical(currentMeetingDate, n) -> Promise<void>
 *   WeekCache.hasWeek(meetingDate)                      -> boolean
 *   WeekCache.onWeekReady(callback)                     -> unsubscribe fn
 *   WeekCache.invalidate(meetingDate)                   -> void (optional, future use)
 *
 * Concurrency model:
 *   - getMetricsForWeek is idempotent: concurrent calls for the same week
 *     receive the same in-flight promise (deduplication).
 *   - prefetchHistorical serializes its own compute calls with `await` so
 *     the UI stays responsive and historical-table rows fill in visibly.
 *   - Errors are caught per-week; status becomes 'error' and the promise
 *     resolves to null so the renderer can show a fallback instead of
 *     hanging on a spinner.
 *
 * No external dependencies beyond the global modules already loaded by
 * index.html (StateBuilder, Scorecard, Checklist, RenewalRadar).
 */
(function (root) {
  "use strict";

  // ---------------------------------------------------------------------------
  // Module state
  // ---------------------------------------------------------------------------

  var _sheetsData = null;
  var _cache = Object.create(null);   // weekKey -> entry
  var _listeners = [];                 // Array<fn(meetingDate, metrics)>

  // Entry shape:
  //   { status: 'pending' | 'ready' | 'error',
  //     metrics?: { [coach]: {...} },
  //     promise?: Promise,
  //     error?: Error }

  // ---------------------------------------------------------------------------
  // Date normalization (ET-anchored, Thu-Wed coaching week)
  // ---------------------------------------------------------------------------

  var TZ = "America/New_York";

  /**
   * Extract ET wall-clock components from a Date.
   * Returns { year, month (1-12), day, weekday (0=Sun..6=Sat) }.
   */
  function toET(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      throw new Error("week-cache: invalid Date");
    }
    var fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short"
    });
    var parts = {};
    var formatted = fmt.formatToParts(date);
    for (var i = 0; i < formatted.length; i++) {
      parts[formatted[i].type] = formatted[i].value;
    }
    var weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      year: parseInt(parts.year, 10),
      month: parseInt(parts.month, 10),
      day: parseInt(parts.day, 10),
      weekday: weekdayMap[parts.weekday]
    };
  }

  /**
   * Build a Date representing a specific wall-clock instant in ET.
   * Handles DST by iterating up to 2 times.
   */
  function fromET(year, month, day, hour, minute, second, ms) {
    hour = hour || 0; minute = minute || 0; second = second || 0; ms = ms || 0;
    var guess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
    for (var i = 0; i < 2; i++) {
      var d = new Date(guess);
      var et = toET(d);
      // toET only returns date+weekday; we need to refine hour/min/sec too.
      // For our purposes (normalizing to Wednesday 23:59:59.999), we
      // re-derive using a dedicated formatter here.
      var fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: TZ,
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
      });
      var hParts = {};
      var formatted = fmt.formatToParts(d);
      for (var j = 0; j < formatted.length; j++) {
        hParts[formatted[j].type] = formatted[j].value;
      }
      var actualH = parseInt(hParts.hour, 10);
      if (actualH === 24) actualH = 0;
      var actualM = parseInt(hParts.minute, 10);
      var actualS = parseInt(hParts.second, 10);
      var target = Date.UTC(year, month - 1, day, hour, minute, second, ms);
      var actual = Date.UTC(et.year, et.month - 1, et.day, actualH, actualM, actualS, ms);
      var diff = target - actual;
      if (diff === 0) return d;
      guess += diff;
    }
    return new Date(guess);
  }

  /**
   * Normalize any Date into the Wednesday end-date (23:59:59.999 ET) of
   * the Thu-Wed coaching week that contains it.
   *
   * Weekday in ET: Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6.
   * Closing Wednesday of a Thu-Wed week:
   *   Thu (4) -> +6 days
   *   Fri (5) -> +5 days
   *   Sat (6) -> +4 days
   *   Sun (0) -> +3 days
   *   Mon (1) -> +2 days
   *   Tue (2) -> +1 day
   *   Wed (3) -> +0 days
   */
  function normalizeToWednesdayEnd(date) {
    var et = toET(date);
    var wd = et.weekday;
    var daysToWed = (3 - wd + 7) % 7;
    // Use noon-ET base so DST shifts don't pull us into the prior day.
    var baseNoon = fromET(et.year, et.month, et.day, 12, 0, 0, 0);
    var wedNoon = new Date(baseNoon.getTime() + daysToWed * 86400000);
    var wedEt = toET(wedNoon);
    return fromET(wedEt.year, wedEt.month, wedEt.day, 23, 59, 59, 999);
  }

  /**
   * weekKey = "YYYY-MM-DD" of the Wednesday end-date in ET.
   */
  function weekKeyOf(date) {
    var wedEnd = normalizeToWednesdayEnd(date);
    var et = toET(wedEnd);
    var mm = et.month < 10 ? "0" + et.month : "" + et.month;
    var dd = et.day < 10 ? "0" + et.day : "" + et.day;
    return et.year + "-" + mm + "-" + dd;
  }

  // ---------------------------------------------------------------------------
  // Compute pipeline
  // ---------------------------------------------------------------------------

  function ensureDeps() {
    if (!_sheetsData) {
      throw new Error("week-cache: init(sheetsData) must be called first");
    }
    if (!root.StateBuilder || !root.Scorecard || !root.Checklist || !root.RenewalRadar) {
      throw new Error("week-cache: required modules not loaded (StateBuilder, Scorecard, Checklist, RenewalRadar)");
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

  /**
   * Run the full pipeline for a given meetingDate (already normalized to
   * the Wednesday end-date). Returns the merged per-coach metrics object.
   */
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

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  function init(sheetsData) {
    _sheetsData = sheetsData;
    _cache = Object.create(null);
    // Listeners are preserved across init for convenience; reset if needed.
  }

  /**
   * Returns a Promise resolving to the metrics object for the given week.
   * Concurrent calls for the same week share the same in-flight promise.
   * On error, the promise resolves to null and the entry is marked 'error'.
   */
  function getMetricsForWeek(meetingDate) {
    var key = weekKeyOf(meetingDate);
    var normalized = normalizeToWednesdayEnd(meetingDate);
    var entry = _cache[key];

    if (entry) {
      if (entry.status === "ready") {
        return Promise.resolve(entry.metrics);
      }
      if (entry.status === "pending") {
        return entry.promise;
      }
      if (entry.status === "error") {
        // Retry once on subsequent calls — fail-soft, but don't loop on broken data.
        // Drop through to recompute below.
      }
    }

    // Schedule compute on a microtask to keep the call site non-blocking
    // and allow loading state to render before CPU-heavy work runs.
    var promise = new Promise(function (resolve) {
      // Yield to the event loop so the UI can paint loading state first.
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

  /**
   * Fire-and-forget prefetch of n weeks before the given current week.
   * Serializes computes with await so each week resolves before the next
   * begins — UI stays responsive and historical-table rows fill in visibly.
   *
   * Returns a Promise that resolves when all n weeks have been attempted
   * (including errors).
   */
  function prefetchHistorical(currentMeetingDate, n) {
    if (!Number.isInteger(n) || n < 1) {
      return Promise.resolve();
    }
    var currentNormalized = normalizeToWednesdayEnd(currentMeetingDate);
    var weeks = [];
    for (var i = 1; i <= n; i++) {
      var d = new Date(currentNormalized.getTime() - i * 7 * 86400000);
      // Re-normalize defensively — DST shifts can knock us off Wed midnight.
      weeks.push(normalizeToWednesdayEnd(d));
    }

    return weeks.reduce(function (chain, weekDate) {
      return chain.then(function () {
        // Skip if already cached as ready.
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

  // ---------------------------------------------------------------------------
  // Exports
  // ---------------------------------------------------------------------------

  root.WeekCache = {
    init: init,
    getMetricsForWeek: getMetricsForWeek,
    prefetchHistorical: prefetchHistorical,
    hasWeek: hasWeek,
    onWeekReady: onWeekReady,
    invalidate: invalidate,
    // Exposed for testing/debugging only:
    _internal: {
      weekKeyOf: weekKeyOf,
      normalizeToWednesdayEnd: normalizeToWednesdayEnd
    }
  };
})(typeof window !== "undefined" ? window : this);
