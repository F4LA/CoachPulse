<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Coach Pulse — Strong Standard</title>

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="icon" href="data:," />
  <link
    href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap"
    rel="stylesheet"
  />

  <link rel="stylesheet" href="styles.css" />

  <style>
    /* ---------- Status banner ---------- */
    .status {
      padding: 10px 16px;
      margin: 16px 32px;
      border-radius: var(--radius);
      font-size: 13px;
      font-weight: 500;
    }
    .status.loading { background: var(--steel-tint); color: var(--steel-700); }
    .status.ok      { background: var(--green-bg);   color: var(--green); }
    .status.error   { background: var(--red-bg);     color: var(--red); }

    main#main { padding: 20px 32px 64px; max-width: var(--container); margin: 0 auto; }

    /* ---------- Meeting meta line ---------- */
    .meeting-meta {
      color: var(--text-muted);
      font-size: 13px;
      margin-bottom: 16px;
    }

    /* ---------- Tab strip ---------- */
    #tab-container {
      max-width: var(--container);
      margin: 0 auto;
      padding: 0 32px;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
    }
    .tab-strip {
      display: flex;
      gap: 4px;
    }
    .tab {
      appearance: none;
      background: transparent;
      border: none;
      border-bottom: 3px solid transparent;
      padding: 14px 22px;
      font-family: var(--font-body);
      font-size: 14px;
      font-weight: 600;
      color: var(--text-muted);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: color 120ms ease, border-color 120ms ease;
    }
    .tab:hover { color: var(--text); }
    .tab-active {
      color: var(--text);
      border-bottom-color: var(--navy-900);
    }
    .tab-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }
    .tab-dot-red    { background: var(--red); }
    .tab-dot-yellow { background: var(--yellow); }

    /* ---------- Coach header ---------- */
    .coach-header {
      margin: 24px 0 8px;
    }
    .coach-name {
      font-family: var(--font-display);
      font-size: 36px;
      letter-spacing: 0.04em;
      margin: 0;
      color: var(--text);
    }

    /* ---------- Sections ---------- */
    .metric-section {
      margin-top: 28px;
    }
    .section-title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--text-faint);
      margin: 0 0 12px;
    }

    /* ---------- Tile grid ---------- */
    .tile-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
    }
    @media (max-width: 1100px) {
      .tile-grid { grid-template-columns: repeat(2, 1fr); }
    }

    /* ---------- Tile ---------- */
    .tile {
      background: var(--surface);
      border: 1px solid var(--border);
      border-left: 4px solid var(--border-strong);
      border-radius: var(--radius);
      padding: 16px 18px;
      display: flex;
      flex-direction: column;
      min-height: 170px;
      box-shadow: var(--shadow-sm);
    }
    .tile-green   { border-left-color: var(--green); }
    .tile-yellow  { border-left-color: var(--yellow); }
    .tile-red     { border-left-color: var(--red); }
    .tile-neutral { border-left-color: var(--border-strong); }

    .tile-header {
      margin-bottom: 12px;
    }
    .tile-title {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.02em;
      color: var(--text);
      line-height: 1.3;
    }
    .tile-description {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 4px;
      line-height: 1.4;
    }

    .tile-value-block {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: flex-start;
      padding: 4px 0;
    }
    .tile-value {
      font-family: var(--font-display);
      font-size: 36px;
      letter-spacing: 0.02em;
      line-height: 1;
      color: var(--text);
    }
    .tile-green  .tile-value { color: var(--green); }
    .tile-yellow .tile-value { color: var(--yellow); }
    .tile-red    .tile-value { color: var(--red); }
    .tile-sub {
      font-size: 11px;
      color: var(--text-faint);
      margin-top: 4px;
      font-weight: 500;
    }

    .tile-legend {
      font-size: 10px;
      color: var(--text-faint);
      border-top: 1px solid var(--border);
      padding-top: 8px;
      margin-top: 8px;
      letter-spacing: 0.02em;
    }
  </style>
</head>
<body>

  <header class="top-bar">
    <div class="brand">
      <span class="brand-mark">COACH PULSE</span>
      <span class="brand-sub">Strong Standard</span>
    </div>
    <div class="top-bar-right">
      <span class="brand-sub">Thursday Meeting Prep</span>
    </div>
  </header>

  <div id="status" class="status loading">Initializing…</div>

  <div id="tab-container"></div>

  <main id="main"></main>

  <!-- Engine: imported from F4LA/FlagSystem via jsdelivr, pinned to commit 9b179bb -->
  <script src="https://cdn.jsdelivr.net/gh/F4LA/FlagSystem@9b179bb/engine/coaching-week.js"></script>
  <script src="https://cdn.jsdelivr.net/gh/F4LA/FlagSystem@9b179bb/engine/client-timeline.js"></script>
  <script src="https://cdn.jsdelivr.net/gh/F4LA/FlagSystem@9b179bb/engine/consecutive-evaluable.js"></script>
  <script src="https://cdn.jsdelivr.net/gh/F4LA/FlagSystem@9b179bb/engine/pathway-evaluators.js"></script>
  <script src="https://cdn.jsdelivr.net/gh/F4LA/FlagSystem@9b179bb/engine/color-deriver.js"></script>
  <script src="https://cdn.jsdelivr.net/gh/F4LA/FlagSystem@9b179bb/engine/pathway-engine.js"></script>

  <!-- Dashboard modules -->
  <script src="dashboard/config.js"></script>
  <script src="dashboard/sheets-reader.js"></script>
  <script src="dashboard/state-builder.js"></script>
  <script src="dashboard/scorecard.js"></script>
  <script src="dashboard/checklist.js"></script>
  <script src="dashboard/renewal-radar.js"></script>
  <script src="dashboard/renderer.js"></script>
  <script src="dashboard/tabs.js"></script>
  <script src="app.js"></script>

</body>
</html>
