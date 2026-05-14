/**
 * Coach Pulse Dashboard — State Builder
 *
 * Iterates over the active roster, calls PathwayEngine.calculateClientState
 * for each client TWICE:
 *   - once at `meetingDate` (this Thursday)         → currentState
 *   - once at `meetingDate - 7 days` (last Thursday) → previousState
 *
 * Both runs are needed because S1 (% New Red Flags) requires comparing
 * a client's color at this week vs last week to detect transitions.
 *
 * Coaches not in CFG.COACHES are filtered out (excludes Bernardo, Joey,
 * blanks, and any other entries in col J that aren't an active coach).
 *
 * Output:
 *   [
 *     {
 *       clientName, coach,
 *       currentState:  { color, dominantPathway, pathwayStates, blackFlags, ... },
 *       previousState: { color, dominantPathway, pathwayStates, blackFlags, ... }
 *     },
 *     ...
 *   ]
 */
(function (root) {
  "use strict";

  var CFG = root.CoachPulseConfig;
  if (!CFG) throw new Error("state-builder: CoachPulseConfig not loaded");
  if (!root.PathwayEngine) throw new Error("state-builder: PathwayEngine not loaded");

  function isValidCoach(coachName) {
    return CFG.COACHES.indexOf(coachName) !== -1;
  }

  function buildAll(data, meetingDate) {
    var roster = data.roster || [];
    var formResponses = data.formResponses || [];
    var hcActions = data.hcActions || [];

    var lookback = CFG.ENGINE_LOOKBACK_WEEKS || 16;

    // Previous Thursday = meeting date - 7 days
    var previousDate = new Date(meetingDate.getTime());
    previousDate.setDate(previousDate.getDate() - 7);

    var results = [];

    for (var i = 0; i < roster.length; i++) {
      var entry = roster[i];

      // Filter: only the 4 active coaches
      if (!isValidCoach(entry.coach)) continue;

      try {
        var currentState = root.PathwayEngine.calculateClientState(
          entry.client,
          formResponses,
          hcActions,
          { lookbackWeeks: lookback, currentDate: meetingDate }
        );

        var previousState = root.PathwayEngine.calculateClientState(
          entry.client,
          formResponses,
          hcActions,
          { lookbackWeeks: lookback, currentDate: previousDate }
        );

        results.push({
          clientName:    entry.client,
          coach:         entry.coach,
          currentState:  currentState,
          previousState: previousState
        });
      } catch (err) {
        if (root.console && root.console.warn) {
          root.console.warn("state-builder: skipped " + entry.client + " — " + err.message);
        }
      }
    }

    return results;
  }

  function groupByCoach(states) {
    var out = {};
    for (var i = 0; i < CFG.COACHES.length; i++) {
      out[CFG.COACHES[i]] = [];
    }
    for (var j = 0; j < states.length; j++) {
      var s = states[j];
      if (out[s.coach]) out[s.coach].push(s);
    }
    return out;
  }

  root.StateBuilder = {
    buildAll: buildAll,
    groupByCoach: groupByCoach
  };
})(typeof window !== "undefined" ? window : this);
