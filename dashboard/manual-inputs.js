/**
 * Coach Pulse Dashboard — Manual Inputs Writer
 *
 * Posts to the Apps Script Web App to write CB/CC/CD values into
 * the Coach Pulse Manual Inputs sheet.
 *
 * Why fetch with no-cors? Apps Script Web Apps don't return CORS headers
 * by default when deployed publicly. Instead of fighting with that, we use
 * `mode: "no-cors"` which lets the POST go through but we can't read the
 * response body. So we fire-and-forget the write, then re-fetch the sheet
 * a moment later to confirm via the next data load.
 *
 * For a robust workflow we wrap in a Promise and resolve after the request
 * completes. UI optimistically updates the tile, then refreshes data to
 * confirm persistence.
 *
 * Phase 4B.3 — Vacation support:
 *   setCB_CC now accepts an optional `vacation` field in `fields`.
 *   The Apps Script handler must write it to the Vacation column (col E).
 *   Passing vacation:"Yes" marks the week as vacation.
 *   Passing vacation:"" clears it (coach clicked Yes or No to resume normal tracking).
 */
(function (root) {
  "use strict";

  var CFG = root.CoachPulseConfig;
  if (!CFG) throw new Error("manual-inputs: CoachPulseConfig not loaded");

  function post(action, payload) {
    var body = JSON.stringify(Object.assign({ action: action }, payload));
    return fetch(CFG.WEB_APP_URL, {
      method: "POST",
      mode: "no-cors",
      // Note: with no-cors, Content-Type can only be text/plain.
      // Apps Script reads e.postData.contents regardless, so the body string still works.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: body
    });
  }

  /**
   * Set Community Post, Client Win Shoutout, and/or Vacation flag for a (week, coach).
   * @param {string} weekEndingWed — "YYYY-MM-DD" of the closing Wednesday
   * @param {string} coach
   * @param {Object} fields — {
   *   cb?:       "Yes"|"No"|"",
   *   cc?:       "Done"|"Pending"|"Missed"|"",
   *   vacation?: "Yes"|""   ← NEW: "Yes" to mark vacation, "" to clear
   * }
   */
  function setCB_CC(weekEndingWed, coach, fields) {
    return post("setCB_CC", {
      weekEndingWed: weekEndingWed,
      coach:         coach,
      cb:            fields.cb,
      cc:            fields.cc,
      vacation:      fields.vacation  // may be undefined — Apps Script handles gracefully
    });
  }

  /**
   * Set the renewal status for a single (week, coach, client) row.
   */
  function setCDStatus(weekEndingWed, coach, clientName, status, endDate) {
    return post("setCDStatus", {
      weekEndingWed: weekEndingWed,
      coach:         coach,
      clientName:    clientName,
      status:        status,
      endDate:       endDate
    });
  }

  root.ManualInputs = {
    setCB_CC:    setCB_CC,
    setCDStatus: setCDStatus
  };
})(typeof window !== "undefined" ? window : this);
