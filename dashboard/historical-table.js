/**
 * Coach Pulse Dashboard — Historical Table (Phase 4B.3)
 *
 * Renders an 8-week historical summary below the Behaviors section.
 * One row per week (current + 7 historical). Columns: Week ending,
 * S1, S2, S3, S4, CA, CB, CC, CD.
 *
 * Behavior:
 *   - Rows render immediately with "…" placeholders.
 *   - WeekCache.prefetchHistorical kicks off the background compute for
 *     all 7 historical weeks.
 *   - Each row updates progressively as its WeekCache.getMetricsForWeek
 *     promise resolves.
 *   - If a week's compute fails (resolves null), the row shows "—" in
 *     each metric cell and remains clickable for retry.
 *   - Click on a row calls WeekNav.setMeetingDate(weekDate), which
 *     triggers the existing week-change pipeline.
 *   - The row matching the currently selected meeting date is highlighted.
 *   - A renderToken (incremented on each mount) gates async updates so
 *     stale promises from a previous mount can't pollute the new table.
 *
 * Public API:
 *   HistoricalTable.mount(coach, currentMeetingDate)
 */
(function (root) {
  "use strict";

  var CFG = root.CoachPulseConfig;
  if (!CFG) throw new Error("historical-table: CoachPulseConfig not loaded");

  var METRIC_KEYS = ["S1", "S2", "S3", "S4", "CA", "CB", "CC", "CD"];
  var METRIC_LABELS = {
    S1: "New Red Flags",
    S2: "Yellow/Red Cum.",
    S3: "Black-Flagged",
    S4: "Renewals LW",
    CA: "Form Submission",
    CB: "Community Post",
    CC: "Win Shoutout",
    CD: "Renewals Next 2W"
  };
  var TOTAL_ROWS  = 8; // current + 7 historical

  // Incremented on every mount() so async resolvers can detect staleness.
  var renderToken = 0;

  // ---- Helpers ----

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * Build an array of 8 normalized Wed-end Date objects, newest first.
   * Index 0 = current week, index 7 = 7 weeks ago.
   */
  function buildWeekDates(currentMeetingDate) {
    var weeks = [];
    var anchor = currentMeetingDate.getTime();
    for (var i = 0; i < TOTAL_ROWS; i++) {
      weeks.push(new Date(anchor - i * 7 * 86400000));
    }
    return weeks;
  }

  function weekKeyOf(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function formatWeekEnding(date) {
    var months = ["Jan","Feb","Mar","Apr","May","Jun",
                  "Jul","Aug","Sep","Oct","Nov","Dec"];
    return months[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear();
  }

  // ---- Cell rendering ----

  /**
   * Render a single metric cell from a metrics object (or null on failure).
   * Returns the inner HTML for the cell's content.
   */
  function renderMetricCellContent(metric) {
    if (!metric) {
      return '<span class="hist-cell-empty">—</span>';
    }
    var color = metric.color || "neutral";
    var display = metric.displayString != null ? metric.displayString : "—";
    var dot = (color === "green" || color === "yellow" || color === "red")
      ? '<span class="hist-dot hist-dot-' + color + '"></span>'
      : '';
    return dot + '<span class="hist-cell-value">' + escapeHtml(display) + '</span>';
  }

  function renderPlaceholderCell() {
    return '<span class="hist-cell-loading">…</span>';
  }

  // ---- Row rendering ----

  function renderRow(weekDate, isActive) {
    var key = weekKeyOf(weekDate);
    var label = formatWeekEnding(weekDate);
    var activeCls = isActive ? " historical-row-active" : "";

    var cells = '<td class="hist-col-week">' + escapeHtml(label) + '</td>';
    for (var i = 0; i < METRIC_KEYS.length; i++) {
      cells += '<td class="hist-col-metric" data-metric="' + METRIC_KEYS[i] + '">' +
                 renderPlaceholderCell() +
               '</td>';
    }

    return (
      '<tr class="historical-row' + activeCls + '" ' +
          'data-weekkey="' + escapeHtml(key) + '" ' +
          'role="button" tabindex="0" ' +
          'aria-label="Jump to week ending ' + escapeHtml(label) + '">' +
        cells +
      '</tr>'
    );
  }

  function renderTable(weekDates, currentWeekKey) {
    var headerCells =
      '<th class="hist-col-week">Week ending</th>';
    for (var i = 0; i < METRIC_KEYS.length; i++) {
      headerCells += '<th class="hist-col-metric">' +
                       escapeHtml(METRIC_LABELS[METRIC_KEYS[i]]) +
                     '</th>';
    }

    var rows = weekDates.map(function (d) {
      return renderRow(d, weekKeyOf(d) === currentWeekKey);
    }).join("");

    return (
      '<section class="historical-section">' +
        '<h2 class="section-title">Last 8 Weeks</h2>' +
        '<div class="historical-table-wrap">' +
          '<table class="historical-table">' +
            '<thead><tr>' + headerCells + '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>' +
      '</section>'
    );
  }

  // ---- Row updating ----

  /**
   * Populate a row's metric cells from a metrics object for the given coach.
   * If metrics is null or coach is missing, all cells become "—".
   */
  function populateRow(tr, allMetricsForWeek, coach) {
    var coachMetrics = (allMetricsForWeek && allMetricsForWeek[coach]) || null;
    for (var i = 0; i < METRIC_KEYS.length; i++) {
      var key = METRIC_KEYS[i];
      var cell = tr.querySelector('td[data-metric="' + key + '"]');
      if (!cell) continue;
      var metric = coachMetrics ? coachMetrics[key] : null;
      cell.innerHTML = renderMetricCellContent(metric);
    }
  }

  // ---- Wiring ----

  function wireRowClicks(container) {
    var rows = container.querySelectorAll(".historical-row");
    rows.forEach(function (tr) {
      tr.addEventListener("click", function () {
        handleRowActivate(tr);
      });
      tr.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleRowActivate(tr);
        }
      });
    });
  }

  function handleRowActivate(tr) {
    var key = tr.getAttribute("data-weekkey");
    if (!key) return;
    // Parse YYYY-MM-DD as local date.
    var parts = key.split("-");
    var d = new Date(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10),
      23, 59, 59, 999
    );
    if (root.WeekNav && typeof root.WeekNav.setMeetingDate === "function") {
      root.WeekNav.setMeetingDate(d);
    }
  }

  // ---- Public API ----

  /**
   * mount(coach, currentMeetingDate)
   *
   * Renders the historical table into #historical-container, kicks off
   * prefetch, and progressively populates each row as data resolves.
   */
  function mount(coach, currentMeetingDate) {
    var container = document.getElementById("historical-container");
    if (!container) return;
    if (!coach || !currentMeetingDate) {
      container.innerHTML = "";
      return;
    }

    // Bump token — any in-flight resolvers from a previous mount become stale.
    renderToken += 1;
    var token = renderToken;

    var weekDates = buildWeekDates(currentMeetingDate);
    var currentKey = weekKeyOf(currentMeetingDate);
    container.innerHTML = renderTable(weekDates, currentKey);
    wireRowClicks(container);

    if (!root.WeekCache) return;

    // Fire prefetch — drives the background compute for all 7 historical
    // weeks. Returns a Promise we don't await (rows update individually).
    if (typeof root.WeekCache.prefetchHistorical === "function") {
      root.WeekCache.prefetchHistorical(currentMeetingDate, TOTAL_ROWS - 1);
    }

    // Resolve each week individually and patch its row when ready.
    weekDates.forEach(function (weekDate) {
      var key = weekKeyOf(weekDate);
      var p = root.WeekCache.getMetricsForWeek(weekDate);
      if (!p || typeof p.then !== "function") return;

      p.then(function (metrics) {
        // Stale guard.
        if (token !== renderToken) return;
        // Container may have been replaced if user switched coach/week
        // before resolution — verify the row still exists.
        var tr = container.querySelector(
          '.historical-row[data-weekkey="' + key + '"]'
        );
        if (!tr) return;
        populateRow(tr, metrics, coach);
      }).catch(function (err) {
        if (token !== renderToken) return;
        var tr = container.querySelector(
          '.historical-row[data-weekkey="' + key + '"]'
        );
        if (!tr) return;
        // populateRow(null) renders "—" everywhere.
        populateRow(tr, null, coach);
        if (root.console && root.console.warn) {
          root.console.warn(
            "[HistoricalTable] Failed to load week " + key + ": " + (err && err.message)
          );
        }
      });
    });
  }

  root.HistoricalTable = {
    mount: mount
  };
})(typeof window !== "undefined" ? window : this);
