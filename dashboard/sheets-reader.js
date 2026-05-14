/**
 * Coach Pulse Dashboard — Sheets Reader
 *
 * Parallel-fetches all source sheets via the Google Sheets API (v4) and
 * normalizes the responses into JS arrays / objects ready for downstream
 * modules. Returns:
 *
 *   {
 *     roster:        [{ firstName, lastName, email, program, contractStart, coach, endDate, client }, ...],
 *     formResponses: [[row]...] raw rows,
 *     hcActions:     [[row]...] raw rows,
 *     masterSheet:   [{ firstName, lastName, email, coach, newEndDate, resign, raw }, ...],
 *     manualCB_CC:   [{ weekEndingWed, coach, cb, cc, lastUpdated }, ...],
 *     manualCD:      [{ weekEndingWed, coach, clientName, endDate, status }, ...]
 *   }
 *
 * Engine consumers (formResponses, hcActions) are passed through as raw rows
 * because the engine expects that shape (matches Flag System pattern).
 */
(function (root) {
  "use strict";

  var CFG = root.CoachPulseConfig;
  if (!CFG) throw new Error("sheets-reader: CoachPulseConfig not loaded");

  var BASE = "https://sheets.googleapis.com/v4/spreadsheets";

  function buildUrl(sheetId, tab, range) {
    var r = range ? "!" + range : "";
    var encoded = encodeURIComponent(tab + r);
    return BASE + "/" + sheetId + "/values/" + encoded + "?key=" + CFG.API_KEY;
  }

  function fetchSheet(sheetId, tab, range) {
    return fetch(buildUrl(sheetId, tab, range))
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (body) {
            var msg = (body && body.error && body.error.message) || ("HTTP " + res.status);
            throw new Error("Sheets fetch failed [" + tab + "]: " + msg);
          });
        }
        return res.json();
      })
      .then(function (data) {
        return data.values || [];
      });
  }

  /* ---------- Parsers ---------- */

  function parseRoster(rows) {
    // Roster tab has header row at index 0:
    // First Name | Last Name | Email | Program | Contract Start | Coach | End Date
    if (!rows.length) return [];
    var out = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r || !r[0]) continue;
      var firstName = (r[0] || "").trim();
      var lastName  = (r[1] || "").trim();
      out.push({
        firstName:     firstName,
        lastName:      lastName,
        email:         (r[2] || "").trim().toLowerCase(),
        program:       r[3] || "",
        contractStart: r[4] || "",
        coach:         (r[5] || "").trim(),
        endDate:       r[6] || "",
        // 'client' field is the format the engine expects: "First Last"
        client:        (firstName + " " + lastName).trim()
      });
    }
    return out;
  }

  function parseMasterSheet(rows) {
    // Master Sheet — has its own header; we only use specific columns.
    if (!rows.length) return [];
    var C = CFG.MASTER_COLS;
    var out = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r || !r[C.FIRST_NAME]) continue;
      out.push({
        firstName:  (r[C.FIRST_NAME] || "").trim(),
        lastName:   (r[C.LAST_NAME]  || "").trim(),
        email:      (r[C.EMAIL]      || "").trim().toLowerCase(),
        coach:      (r[C.COACH]      || "").trim(),
        newEndDate: r[C.NEW_END_DATE] || "",
        resign:     (r[C.RESIGN]     || "").trim(),
        raw:        r
      });
    }
    return out;
  }

  function parseManualCB_CC(rows) {
    // Header: Week_Ending_Wed | Coach | CB_Community_Post | CC_Client_Win_Shoutout | Last_Updated
    if (!rows.length) return [];
    var out = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r || !r[0]) continue;
      out.push({
        weekEndingWed: (r[0] || "").trim(),
        coach:         (r[1] || "").trim(),
        cb:            (r[2] || "").trim(),
        cc:            (r[3] || "").trim(),
        lastUpdated:   r[4] || ""
      });
    }
    return out;
  }

  function parseManualCD(rows) {
    // Header: Week_Ending_Wed | Coach | Client_Name | End_Date | Status
    if (!rows.length) return [];
    var out = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r || !r[0]) continue;
      out.push({
        weekEndingWed: (r[0] || "").trim(),
        coach:         (r[1] || "").trim(),
        clientName:    (r[2] || "").trim(),
        endDate:       r[3] || "",
        status:        (r[4] || "").trim()
      });
    }
    return out;
  }

  /* ---------- Public ---------- */

  function loadAll() {
    var S = CFG.SHEETS;

    return Promise.all([
      fetchSheet(S.ROSTER.id,         S.ROSTER.tab),
      fetchSheet(S.FORM_RESPONSES.id, S.FORM_RESPONSES.tab),
      fetchSheet(S.HC_ACTIONS.id,     S.HC_ACTIONS.tab),
      fetchSheet(S.MASTER_SHEET.id,   S.MASTER_SHEET.tab),
      fetchSheet(S.MANUAL_INPUTS.id,  S.MANUAL_INPUTS.tabs.CB_CC),
      fetchSheet(S.MANUAL_INPUTS.id,  S.MANUAL_INPUTS.tabs.CD_STATUS)
    ]).then(function (results) {
      return {
        roster:        parseRoster(results[0]),
        formResponses: results[1],          // raw rows for engine
        hcActions:     results[2],          // raw rows for engine
        masterSheet:   parseMasterSheet(results[3]),
        manualCB_CC:   parseManualCB_CC(results[4]),
        manualCD:      parseManualCD(results[5])
      };
    });
  }

  root.SheetsReader = { loadAll: loadAll };
})(typeof window !== "undefined" ? window : this);
