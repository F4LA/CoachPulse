/**
 * Coach Pulse Dashboard — State Builder
 *
 * For S1 (% New Red Flags) we need to know two things per client:
 *   - Current state at end of just-closed coaching week (Wed 23:59 ET)
 *   - State at end of the week BEFORE that
 *
 * If previous !== Red and current === Red, the client is a "new Red" this week.
 *
 * We build TWO state arrays. Both are filtered to only include clients whose
 * roster.coach is in CONFIG.COACHES (excludes Bernardo, Joey, blank, etc.).
 *
 * Output shape:
 *   {
 *     current:  [{ client, coach, color, activePathway, blackFlags, ...engineResult }, ...],
 *     previous: [...same shape, but one week earlier]
 *   }
 */
(function (root) {
  "use strict";

  var CFG = root.CoachPulseConfig;
  if (!CFG) throw new Error("state-builder: CoachPulseConfig not loaded");
  if (!root.PathwayEngine) throw new Error("state-builder: PathwayEngine not loaded");

  function isValidCoach(coachName) {
    if (!coachName) return false;
    return CFG.COACHES.indexOf(coachName) !== -1;
  }

  /**
   * Thu-Wed coaching week window for a given evaluation moment.
   * Mirrors Checklist.helpers.getCoachingWeekWindow exactly. Inlined here
   * (rather than referenced) because state-builder.js loads before
   * checklist.js in index.html — this avoids any load-order coupling.
   *   weekEnd   = currentDate (forced to 23:59:59.999)
   *   weekStart = weekEnd - 6 days (forced to 00:00:00.000) — the Thu
   */
  function getCoachingWeekWindow(currentDate) {
    var weekEnd = new Date(currentDate.getTime());
    weekEnd.setHours(23, 59, 59, 999);
    var weekStart = new Date(weekEnd.getTime() - 6 * 24 * 60 * 60 * 1000);
    weekStart.setHours(0, 0, 0, 0);
    return { start: weekStart, end: weekEnd };
  }

  /**
   * 1B rule — exclude a client from ALL metrics during their first coaching
   * week. A client is "in their first week" for the week being evaluated when
   * their contractStart date falls inside the Thu-Wed window of `currentDate`.
   * From the following week onward they evaluate normally.
   *
   * parseDateLoose is referenced lazily (Scorecard loads after this module).
   */
  function isFirstCoachingWeek(contractStart, currentDate) {
    if (!contractStart) return false;
    var helpers = root.Scorecard && root.Scorecard.helpers;
    if (!helpers || !helpers.parseDateLoose) return false;
    var start = helpers.parseDateLoose(contractStart);
    if (!start) return false;
    var win = getCoachingWeekWindow(currentDate);
    return start >= win.start && start <= win.end;
  }

  function buildOneRun(roster, formResponses, hcActions, currentDate) {
    var states = [];
    for (var i = 0; i < roster.length; i++) {
      var entry = roster[i];
      if (!isValidCoach(entry.coach)) continue;
      // 1B: client in their first coaching week is excluded from every metric.
      if (isFirstCoachingWeek(entry.contractStart, currentDate)) continue;
      try {
        var state = root.PathwayEngine.calculateClientState(
          entry.client,
          formResponses,
          hcActions,
          {
            lookbackWeeks: CFG.ENGINE_LOOKBACK_WEEKS,
            currentDate:   currentDate
          }
        );
        state.coach  = entry.coach;
        state.client = entry.client;
        state.email  = entry.email;
        states.push(state);
      } catch (err) {
        if (root.console && root.console.warn) {
          root.console.warn("[state-builder] skipped " + entry.client + " — " + err.message);
        }
      }
    }
    return states;
  }

  /**
   * @param {Object} data        — output of SheetsReader.loadAll()
   * @param {Date}   meetingDate — Thursday meeting day (current or historical)
   * @returns {{current: Array, previous: Array}}
   */
  function build(data, meetingDate) {
    var current = buildOneRun(
      data.roster,
      data.formResponses,
      data.hcActions,
      meetingDate
    );

    var prevDate = new Date(meetingDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    var previous = buildOneRun(
      data.roster,
      data.formResponses,
      data.hcActions,
      prevDate
    );

    return { current: current, previous: previous };
  }

  root.StateBuilder = { build: build, isValidCoach: isValidCoach };
})(typeof window !== "undefined" ? window : this);
