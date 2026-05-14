/**
 * Coach Pulse Dashboard — Config
 *
 * Sheet IDs, API key reference, coach roster, and threshold constants.
 * All values here are non-secret (API key restricted by HTTP referrer).
 */
(function (root) {
  "use strict";

  var CONFIG = {
    /* ---------- Data sources ---------- */
    SHEETS: {
      // Reused from Flag System
      ROSTER:         { id: "1VxxqmOVuXffLOpPvMWnSUHhyhkjIajtBeBoSV3xk1fc", tab: "Roster" },
      FORM_RESPONSES: { id: "1ugM0iOCwdaQpyDVPuJQfKRhu72NQrtC-hEjJ7PkGHoA", tab: "Form Responses 1" },
      HC_ACTIONS:     { id: "1TmlmzNPi-BtLy1C4sizqJmvLFHAxyH6Glb9mWP3Vv64", tab: "HC Actions" },
      // Renewal data
      MASTER_SHEET:   { id: "1ctM6K8hQfh73bi7f-MtXkqW3BaPxU73NZf8xPJQUEOc", tab: "Client Mastersheet" },
      // Manual inputs persistence (created in Chat A1.5)
      MANUAL_INPUTS:  { id: "1jHCwgiOy2MAvaPYtYDkErag3kdCy4jXIAN7sTqhX9BQ", tabs: {
        CB_CC:     "CB_CC_Inputs",
        CD_STATUS: "CD_Statuses"
      }}
    },

    /* ---------- Sheets API ---------- */
    // Same GCP project as Flag System (plucky-zodiac-491515-j6).
    // Restricted by HTTP referrer to https://f4la.github.io/* — safe to commit.
    API_KEY: "AIzaSyCbpE8CmLKpfmbMPLXkEmWe-5zEx53XyIg",

    /* ---------- Coaches ---------- */
    // Names match exactly what appears in Master Sheet column J.
    // Anything in col J not in this list is ignored (e.g., Bernardo, Joey).
    COACHES: ["Brent", "Ceci", "Miguel", "Jackie"],

    /* ---------- Master Sheet column indices ---------- */
    // 0-indexed positions for the columns we read in MASTER_SHEET.
    MASTER_COLS: {
      FIRST_NAME:    0,  // A
      LAST_NAME:     1,  // B
      EMAIL:         2,  // C
      COACH:         9,  // J
      NEW_END_DATE: 17,  // R
      RESIGN:       19   // T
    },

    /* ---------- Engine pinning ---------- */
    // 7-char short SHA of F4LA/FlagSystem commit AFTER the Thu-Wed engine change.
    // Set in Chat A1.5. Bump per Engine Change Protocol.
    ENGINE_HASH: "9b179bb",

    /* ---------- Scorecard thresholds (per Coaching OS v1.1) ---------- */
    THRESHOLDS: {
      // S1 — % New Red Flags
      S1: { green: 6, yellow: 10 },        // <=6 green, 7-10 yellow, >10 red
      // S2 — % Yellow/Red Cumulative
      S2: { green: 15, yellow: 20 },       // <=15 green, 16-20 yellow, >20 red
      // S3 — informational, no thresholds
      // S4 — informational (changed from TDD v1.2: muestra muy pequeña por coach por semana)
      // CA — Form Submission Rate
      CA: { green: 90, yellow: 80 }        // >=90 green, 80-89 yellow, <80 red
      // CB / CC / CD — categorical, handled in their modules
    },

    /* ---------- Behavior: defaults when no manual entry exists ---------- */
    // Decision: if HC has not entered CB/CC for the week, tile is neutral/gray "—".
    // No automatic Red default. Same for CC (no Pending/Missed inference from date).
    MANUAL_UNSET_DISPLAY: "—",

    /* ---------- CD status taxonomy ---------- */
    CD_STATUSES: {
      GREEN: ["Renewed", "Did Not Renew - Call Done", "Call Scheduled"],
      RED:   ["No Decision - No Call Scheduled", "Did Not Renew - No Call Scheduled"]
    },

    /* ---------- Misc ---------- */
    HISTORICAL_WEEKS: 8,
    ENGINE_LOOKBACK_WEEKS: 16,

    // Slack channel for Wednesday Renewal Radar
    SLACK_CHANNEL_RENEWAL: "C095QSAR8M6"  // #retention-updates
  };

  root.CoachPulseConfig = CONFIG;
})(typeof window !== "undefined" ? window : this);
