/**
 * Coach Pulse Dashboard — Config
 */
(function (root) {
  "use strict";

  var CONFIG = {
    /* ---------- Data sources (read via Google Sheets API) ---------- */
    SHEETS: {
      ROSTER:         { id: "1VxxqmOVuXffLOpPvMWnSUHhyhkjIajtBeBoSV3xk1fc", tab: "Roster" },
      FORM_RESPONSES: { id: "1ugM0iOCwdaQpyDVPuJQfKRhu72NQrtC-hEjJ7PkGHoA", tab: "Form Responses 1" },
      HC_ACTIONS:     { id: "1TmlmzNPi-BtLy1C4sizqJmvLFHAxyH6Glb9mWP3Vv64", tab: "HC Actions" },
      MASTER_SHEET:   { id: "1ctM6K8hQfh73bi7f-MtXkqW3BaPxU73NZf8xPJQUEOc", tab: "Client Mastersheet" },
      MANUAL_INPUTS:  { id: "1jHCwgiOy2MAvaPYtYDkErag3kdCy4jXIAN7sTqhX9BQ", tabs: {
        CB_CC:     "CB_CC_Inputs",
        CD_STATUS: "CD_Statuses"
      }}
    },

    /* ---------- Sheets API (read-only, referrer-restricted) ---------- */
    API_KEY: "AIzaSyCbpE8CmLKpfmbMPLXkEmWe-5zEx53XyIg",

    /* ---------- Apps Script Web App (writes for CB/CC/CD) ---------- */
    WEB_APP_URL: "https://script.google.com/macros/s/AKfycbyRh5mZqGOsmso9NUtta_lQ2GEfSAPQFyso0eC4CJodbqLxvantIaEGlUIT_tCD8Zv6qA/exec",

    /* ---------- Coaches ---------- */
    COACHES: ["Brent", "Ceci", "Miguel", "Jackie"],

    /* ---------- Master Sheet columns (0-indexed) ---------- */
    MASTER_COLS: {
      FIRST_NAME:    0,   // A
      LAST_NAME:     1,   // B
      EMAIL:         2,   // C
      COACH:         9,   // J
      NEW_END_DATE: 17,   // R
      RESIGN:       19,   // T  ("Resign?" — Yes means client re-signed/renewed)
      REFUND:       24    // Y  ("14 Days Refund?" — TRUE means refunded; excluded from retention)
    },

    /* ---------- Engine pinning ---------- */
    ENGINE_HASH: "9b179bb",

    /* ---------- Scorecard thresholds ---------- */
    THRESHOLDS: {
      newRed:     { green: 6, yellow: 10 },
      yrCum:      { green: 15, yellow: 20 },
      formSub:    { green: 100, yellow: 95 }
    },

    /* ---------- Display defaults ---------- */
    MANUAL_UNSET_DISPLAY: "—",

    /* ---------- CD status taxonomy ---------- */
    CD_STATUSES: {
      GREEN: ["Renewed", "Did Not Renew - Call Done", "Call Scheduled"],
      RED:   ["No Decision - No Call Scheduled", "Did Not Renew - No Call Scheduled"]
    },

    /* ---------- Metric metadata ---------- */
    METRICS: {
      S1: {
        title:       "New Red Flags",
        description: "% of clients that crossed into Red this week",
        legend:      "Green ≤6%  ·  Yellow 7-10%  ·  Red >10%",
        section:     "scorecard"
      },
      S2: {
        title:       "Yellow/Red Cumulative",
        description: "% of roster currently in Yellow or Red",
        legend:      "Green ≤15%  ·  Yellow 16-20%  ·  Red >20%",
        section:     "scorecard"
      },
      S3: {
        title:       "Black-Flagged",
        description: "% of clients with active Black badge",
        legend:      "Informational",
        section:     "scorecard"
      },
      S4: {
        title:       "Renewals Last Week",
        description: "Clients whose contract ended last week and renewed",
        legend:      "Informational",
        section:     "scorecard"
      },
      CA: {
        title:       "Form Submission Rate",
        description: "% of total clients for whom the Minimum Standards form was filled in this week",
        legend:      "Green 100%  ·  Yellow 95-99%  ·  Red <95%",
        section:     "behaviors"
      },
      CB: {
        title:       "Community Post",
        description: "Coach published at least 1 post in Everfit community this week",
        legend:      "Green = Yes  ·  Red = No",
        section:     "behaviors"
      },
      CC: {
        title:       "Client Win Shoutout",
        description: "Coach posted or scheduled a win shoutout this month",
        legend:      "Green = Done  ·  Yellow = Pending  ·  Red = Missed",
        section:     "behaviors"
      },
      CD: {
        title:       "Renewals Next 2 Weeks",
        description: "Clients with contract ending in the next 14 days",
        legend:      "Green = all on track  ·  Red = any at risk  ·  Gray = pending status",
        section:     "behaviors"
      }
    },

    METRIC_ORDER: {
      scorecard: ["S1", "S2", "S3", "S4"],
      behaviors: ["CA", "CB", "CC", "CD"]
    },

    HISTORICAL_WEEKS: 8,
    ENGINE_LOOKBACK_WEEKS: 16,
    SLACK_CHANNEL_RENEWAL: "C095QSAR8M6"
  };

  root.CoachPulseConfig = CONFIG;
})(typeof window !== "undefined" ? window : this);
