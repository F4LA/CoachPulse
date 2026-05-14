# CoachPulse

Coach Pulse Dashboard — Strong Standard coaching team weekly scorecard and behaviors.

**Live:** https://f4la.github.io/CoachPulse/

## What this is

Read-mostly browser dashboard the Head Coach uses every Thursday morning before the 9:30 AM ET Coach Pulse meeting. Aggregates all coaching team scorecard (S1–S4) and behavior checklist (CA–CD) data into one view, with per-coach tabs and clickable metric breakdowns.

See `Coach Pulse Dashboard TDD v1.2` in the Strong Standard project for the full design spec.

## Architecture

- **Engine:** imported via CDN from `F4LA/FlagSystem`, pinned to a specific commit hash. Never modify engine files in this repo — see `Engine_Change_Protocol.md` in the FlagSystem repo.
- **Data:** 6 Google Sheets (Roster, Form Responses, HC Actions, Master Sheet, Coach Pulse Manual Inputs × 2 tabs) read via Google Sheets API v4 with a referrer-restricted API key.
- **Hosting:** GitHub Pages, no build step, no framework.

## File layout

```
index.html             ← shell, CDN engine imports, page structure
app.js                 ← top-level orchestrator
styles.css             ← copied from FlagSystem
dashboard/
├── config.js          ← sheet IDs, API key, coach list, constants
├── sheets-reader.js   ← parallel Sheets API fetch + parsers
├── state-builder.js   ← (Phase 2) iterate roster, call engine
├── scorecard.js       ← (Phase 2) S1–S4 calculations
├── checklist.js       ← (Phase 2) CA + manual reads
├── renewal-radar.js   ← (Phase 2) CD client list
├── manual-inputs.js   ← (Phase 3) reads/writes Manual Inputs sheet
├── tabs.js            ← (Phase 3) per-coach tab UI
├── renderer.js        ← (Phase 3) DOM rendering
├── breakdown-panel.js ← (Phase 4) clickable tile side-panel
├── historical-table.js← (Phase 4) last 8 weeks table
├── week-nav.js        ← (Phase 4) prev/next week arrows
└── url-params.js      ← (Phase 4) coach=Name filter
```

## Build phases

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation: repo, CDN engine, shell, data load | ⏳ in progress |
| 2 | Calculations: S1–S4, CA, CD client list | — |
| 3 | Persistence & UI core: tabs, tiles, manual input writes | — |
| 4 | Breakdowns + week navigation + coach URL view | — |
| 5 | Wednesday Slack automation (Apps Script) | — |

## API key

The `dashboard/config.js` file references the FlagSystem GCP project's API key (`plucky-zodiac-491515-j6`). The key is restricted to HTTP referrer `https://f4la.github.io/*` and to the Google Sheets API only, so committing it is safe.

If the key is ever rotated, update `API_KEY` in `dashboard/config.js`.
