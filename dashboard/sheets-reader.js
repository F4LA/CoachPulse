/**
 * Coach Pulse Dashboard — Sheets Reader
 *
 * Parallel-fetches all source sheets via the Google Sheets API (v4) and
 * normalizes the responses into JS arrays / objects ready for downstream
 * modules.
 *
 * Phase 4B.2 fix: masterSheet now includes a `refund` boolean derived
 * from column Y ("14 Days Refund?"). A refunded client is treated as if
 * they don't exist for retention purposes (excluded from S4 and CD entirely).
 *
 * Phase 4B.3 — Vacation support:
 *   CB_CC_Inputs now has a `Vacation` column (col E, index 4).
 *   Last_Updated shifts to col F (index 5).
 *   parseManualCB_CC reads the vacation field and exposes it as `vacation`.
 *
 *   CB_CC_Inputs column layout (0-indexed):
 *     0: Week_Ending_Wed
 *     1: Coach
 *     2: CB_Community_Post
 *     3: CC_Client_Win_Shoutout
 *     4: Vacation          ← NEW
 *     5: Last_Updated      ← shifted from 4
 */
(function (root) {
  "use strict";

  var CFG = root.CoachPulseConfig;
  if (!CFG) throw new Error("sheets-reader: CoachPulseConfig not loaded");

  var BASE = "https://sheets.googleapis.com/v4/spreadsheets";

  // Column Y = index 24 (A=0). Fallback if CFG.MASTER_COLS.REFUND missing.
  var REFUND_COL = (CFG.MASTER_COLS && typeof CFG.MASTER_COLS.REFUND === "number")
    ? CFG.MASTER_COLS.REFUND
    : 24;

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

  /**
   * Interpret a cell value as a boolean for refund/vacation/checkbox columns.
   * Sheets API returns checkbox columns as the string "TRUE" / "FALSE",
   * or as boolean true/false depending on the value's type. Empty cells
   * may be undefined/empty string.
   */
  function isTruthy(v) {
    if (v === true) return true;
    if (v === false || v == null || v === "") return false;
    var s = String(v).trim().toLowerCase();
    return s === "true" || s === "yes" || s === "1" || s === "x";
  }

  /* ---------- Parsers ---------- */

  function parseRoster(rows) {
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
        client:        (firstName + " " + lastName).trim()
      });
    }
    return out;
  }

  function parseMasterSheet(rows) {
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
        refund:     isTruthy(r[REFUND_COL]),
        raw:        r
      });
    }
    return out;
  }

  /**
   * CB_CC_Inputs column layout (0-indexed):
   *   0: Week_Ending_Wed
   *   1: Coach
   *   2: CB_Community_Post
   *   3: CC_Client_Win_Shoutout
   *   4: Vacation          ("Yes" or blank)
   *   5: Last_Updated
   */
  function parseManualCB_CC(rows) {
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
        vacation:      (r[4] || "").trim(),   // "Yes" or blank
        lastUpdated:   r[5] || ""             // shifted from index 4
      });
    }
    return out;
  }

  function parseManualCD(rows) {
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
        formResponses: results[1],
        hcActions:     results[2],
        masterSheet:   parseMasterSheet(results[3]),
        manualCB_CC:   parseManualCB_CC(results[4]),
        manualCD:      parseManualCD(results[5])
      };
    });
  }

  root.SheetsReader = { loadAll: loadAll };
})(typeof window !== "undefined" ? window : this);
