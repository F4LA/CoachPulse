/**
 * Coach Pulse Dashboard — Renderer
 *
 * Phase 3B: CB and CC tiles have interactive controls.
 * Phase 4A: All scorecard tiles + CA + CD are clickable, opening a side
 *           panel with the per-client breakdown. CB and CC are NOT
 *           clickable — their full state is already on the tile.
 * Phase 4B.2:
 *   - Removed .meeting-meta block (replaced by WeekNav above coach-header).
 *   - Added #week-nav-container slot for WeekNav.mount.
 *   - Fixed getWeekKey: meetingDate is already Wed 23:59:59.999, so the
 *     weekKey is the Wed of that date (no -1 day shift).
 *   - render() and renderCoachContent() accept options.loading for
 *     skeleton tiles during week transitions.
 *   - handleControlClick invalidates WeekCache for the active week after
 *     a successful write.
 */
(function (root) {
  "use strict";

  var CFG = root.CoachPulseConfig;
  if (!CFG) throw new Error("renderer: CoachPulseConfig not loaded");

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * meetingDate is Wed 23:59:59.999 — weekKey is that same Wed formatted
   * as YYYY-MM-DD. (Previously this subtracted 1 day, producing Tuesday
   * weekKeys — bug fixed in 4B.2.)
   */
  function getWeekKey(meetingDate) {
    var y = meetingDate.getFullYear();
    var m = String(meetingDate.getMonth() + 1).padStart(2, "0");
    var d = String(meetingDate.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  /* ---------- Tile renderers ---------- */

  function renderControlsCB(coach, currentValue, weekKey) {
    var v = (currentValue || "").toLowerCase();
    var yesActive = v === "yes" ? " ctrl-active ctrl-active-green" : "";
    var noActive  = v === "no"  ? " ctrl-active ctrl-active-red"   : "";
    return (
      '<div class="tile-controls" data-control="cb" data-coach="' + escapeHtml(coach) +
      '" data-week="' + escapeHtml(weekKey) + '">' +
        '<button class="ctrl-btn' + yesActive + '" data-value="Yes">Yes</button>' +
        '<button class="ctrl-btn' + noActive  + '" data-value="No">No</button>' +
      '</div>'
    );
  }

  function renderControlsCC(coach, currentValue, weekKey) {
    var v = (currentValue || "").toLowerCase();
    var doneA    = v === "done"    ? " ctrl-active ctrl-active-green"  : "";
    var pendingA = v === "pending" ? " ctrl-active ctrl-active-yellow" : "";
    var missedA  = v === "missed"  ? " ctrl-active ctrl-active-red"    : "";
    return (
      '<div class="tile-controls" data-control="cc" data-coach="' + escapeHtml(coach) +
      '" data-week="' + escapeHtml(weekKey) + '">' +
        '<button class="ctrl-btn' + doneA    + '" data-value="Done">Done</button>' +
        '<button class="ctrl-btn' + pendingA + '" data-value="Pending">Pending</button>' +
        '<button class="ctrl-btn' + missedA  + '" data-value="Missed">Missed</button>' +
      '</div>'
    );
  }

  function isClickable(metricKey) {
    return !!(root.BreakdownPanel && root.BreakdownPanel.isClickable && root.BreakdownPanel.isClickable(metricKey));
  }

  function renderLoadingTile(metricKey) {
    var meta = CFG.METRICS[metricKey];
    if (!meta) return "";
    return (
      '<div class="tile tile-loading" data-metric="' + metricKey + '">' +
        '<div class="tile-header">' +
          '<div class="tile-title">' + escapeHtml(meta.title) + '</div>' +
          '<div class="tile-description">' + escapeHtml(meta.description) + '</div>' +
        '</div>' +
        '<div class="tile-value-block">' +
          '<div class="tile-skeleton tile-skeleton-value"></div>' +
          '<div class="tile-skeleton tile-skeleton-sub"></div>' +
        '</div>' +
        '<div class="tile-legend">' + escapeHtml(meta.legend) + '</div>' +
      '</div>'
    );
  }

  function renderTile(metricKey, metricData, coach, weekKey) {
    var meta = CFG.METRICS[metricKey];
    if (!meta) return "";

    var color = metricData.color || "neutral";
    var clickable = isClickable(metricKey);

    var valueBlock;
    if (metricKey === "CB") {
      valueBlock =
        '<div class="tile-value-block tile-value-block-controls">' +
          '<div class="tile-current">' + escapeHtml(metricData.displayString) + '</div>' +
          renderControlsCB(coach, metricData.value, weekKey) +
          (metricData.subDisplay
            ? '<div class="tile-sub">' + escapeHtml(metricData.subDisplay) + '</div>'
            : '') +
        '</div>';
    } else if (metricKey === "CC") {
      valueBlock =
        '<div class="tile-value-block tile-value-block-controls">' +
          '<div class="tile-current">' + escapeHtml(metricData.displayString) + '</div>' +
          renderControlsCC(coach, metricData.value, weekKey) +
          (metricData.subDisplay
            ? '<div class="tile-sub">' + escapeHtml(metricData.subDisplay) + '</div>'
            : '') +
        '</div>';
    } else {
      valueBlock =
        '<div class="tile-value-block">' +
          '<div class="tile-value">' + escapeHtml(metricData.displayString) + '</div>' +
          (metricData.subDisplay
            ? '<div class="tile-sub">' + escapeHtml(metricData.subDisplay) + '</div>'
            : '') +
        '</div>';
    }

    var tileClass = 'tile tile-' + color + (clickable ? ' tile-clickable' : '');
    var clickAttrs = clickable
      ? ' role="button" tabindex="0" data-clickable="true" data-coach="' + escapeHtml(coach) + '"'
      : '';

    return (
      '<div class="' + tileClass + '" data-metric="' + metricKey + '"' + clickAttrs + '>' +
        '<div class="tile-header">' +
          '<div class="tile-title">' + escapeHtml(meta.title) + '</div>' +
          '<div class="tile-description">' + escapeHtml(meta.description) + '</div>' +
        '</div>' +
        valueBlock +
        '<div class="tile-legend">' + escapeHtml(meta.legend) + '</div>' +
      '</div>'
    );
  }

  function renderSection(sectionKey, coachMetrics, coach, weekKey, loading) {
    var order = CFG.METRIC_ORDER[sectionKey];
    var tiles = order.map(function (key) {
      if (loading) return renderLoadingTile(key);
      return renderTile(key, coachMetrics[key], coach, weekKey);
    }).join("");

    var sectionTitle = sectionKey === "scorecard" ? "Scorecard" : "Behaviors";
    return (
      '<section class="metric-section" data-section="' + sectionKey + '">' +
        '<h2 class="section-title">' + sectionTitle + '</h2>' +
        '<div class="tile-grid">' + tiles + '</div>' +
      '</section>'
    );
  }

  function renderCoachTab(coach, allMetrics, weekKey, loading) {
    var m = loading ? {} : (allMetrics ? allMetrics[coach] : null);
    if (!loading && !m) return '<div class="empty">No data for ' + escapeHtml(coach) + '</div>';

    return (
      '<div class="coach-tab" data-coach="' + escapeHtml(coach) + '">' +
        '<div class="coach-header">' +
          '<h1 class="coach-name">' + escapeHtml(coach) + '</h1>' +
        '</div>' +
        renderSection("scorecard", m, coach, weekKey, loading) +
        renderSection("behaviors", m, coach, weekKey, loading) +
        '<div id="historical-container"></div>' +
      '</div>'
    );
  }

  /**
   * render(allMetrics, meetingDate, activeCoach, options)
   *   options.loading: true → skeleton tiles. allMetrics may be null.
   */
  function render(allMetrics, meetingDate, activeCoach, options) {
    var main = document.getElementById("main");
    if (!main) return;

    var loading = !!(options && options.loading);
    var weekKey = getWeekKey(meetingDate);
    var coachContent = renderCoachTab(activeCoach, allMetrics, weekKey, loading);

    main.innerHTML =
      '<div id="week-nav-container"></div>' +
      '<div id="coach-content">' + coachContent + '</div>';

    if (!loading) {
      wireControls(allMetrics, meetingDate);
      wireBreakdownClicks();
      if (root.HistoricalTable && typeof root.HistoricalTable.mount === "function") {
        root.HistoricalTable.mount(activeCoach, meetingDate);
      }
    }
  }

  /**
   * renderCoachContent(allMetrics, coach, meetingDate, options)
   *   options.loading: true → skeleton tiles.
   */
  function renderCoachContent(allMetrics, coach, meetingDate, options) {
    var container = document.getElementById("coach-content");
    if (!container) return;
    var loading = !!(options && options.loading);
    var weekKey = getWeekKey(meetingDate);
    container.innerHTML = renderCoachTab(coach, allMetrics, weekKey, loading);
    if (!loading) {
      wireControls(allMetrics, meetingDate);
      wireBreakdownClicks();
      if (root.HistoricalTable && typeof root.HistoricalTable.mount === "function") {
        root.HistoricalTable.mount(coach, meetingDate);
      }
    }
  }

  /* ---------- Wire CB/CC controls ---------- */

  function wireControls(allMetrics, meetingDate) {
    var groups = document.querySelectorAll(".tile-controls");
    groups.forEach(function (group) {
      group.addEventListener("click", function (e) { e.stopPropagation(); });

      var control = group.getAttribute("data-control");
      var coach   = group.getAttribute("data-coach");
      var week    = group.getAttribute("data-week");
      var buttons = group.querySelectorAll(".ctrl-btn");
      buttons.forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          var value = e.currentTarget.getAttribute("data-value");
          handleControlClick(control, coach, week, value, allMetrics, meetingDate, e.currentTarget);
        });
      });
    });
  }

  /* ---------- Wire breakdown clicks ---------- */

  function wireBreakdownClicks() {
    if (!root.BreakdownPanel) return;
    var tiles = document.querySelectorAll('.tile[data-clickable="true"]');
    tiles.forEach(function (tile) {
      tile.addEventListener("click", function () {
        var metricKey = tile.getAttribute("data-metric");
        var coach     = tile.getAttribute("data-coach");
        if (!metricKey || !coach) return;
        root.BreakdownPanel.show(metricKey, coach);
      });
      tile.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          var metricKey = tile.getAttribute("data-metric");
          var coach     = tile.getAttribute("data-coach");
          if (!metricKey || !coach) return;
          root.BreakdownPanel.show(metricKey, coach);
        }
      });
    });
  }

  function handleControlClick(control, coach, week, value, allMetrics, meetingDate, btnEl) {
    var fields = {};
    if (control === "cb") fields.cb = value;
    if (control === "cc") fields.cc = value;

    var group = btnEl.parentNode;
    Array.prototype.forEach.call(group.querySelectorAll(".ctrl-btn"), function (b) {
      b.classList.remove("ctrl-active", "ctrl-active-green", "ctrl-active-yellow", "ctrl-active-red");
      b.classList.add("ctrl-saving");
    });
    var activeClass = "ctrl-active";
    if (value === "Yes" || value === "Done")    activeClass += " ctrl-active-green";
    else if (value === "Pending")                activeClass += " ctrl-active-yellow";
    else if (value === "No" || value === "Missed") activeClass += " ctrl-active-red";
    btnEl.classList.add.apply(btnEl.classList, activeClass.split(" "));

    root.ManualInputs.setCB_CC(week, coach, fields)
      .then(function () {
        Array.prototype.forEach.call(group.querySelectorAll(".ctrl-btn"), function (b) {
          b.classList.remove("ctrl-saving");
        });
        if (allMetrics[coach] && allMetrics[coach][control.toUpperCase()]) {
          allMetrics[coach][control.toUpperCase()].value = value;
          allMetrics[coach][control.toUpperCase()].displayString = value;
          allMetrics[coach][control.toUpperCase()].color =
            (value === "Yes" || value === "Done")      ? "green"  :
            (value === "Pending")                       ? "yellow" :
            (value === "No"  || value === "Missed")     ? "red"    : "neutral";
        }
        if (root.WeekCache && root.WeekCache.invalidate) {
          root.WeekCache.invalidate(meetingDate);
        }
      })
      .catch(function (err) {
        console.error("[CoachPulse] Write failed:", err);
        Array.prototype.forEach.call(group.querySelectorAll(".ctrl-btn"), function (b) {
          b.classList.remove("ctrl-saving");
        });
        btnEl.classList.add("ctrl-error");
        setTimeout(function () { btnEl.classList.remove("ctrl-error"); }, 2000);
      });
  }

  root.Renderer = {
    render: render,
    renderCoachContent: renderCoachContent
  };
})(typeof window !== "undefined" ? window : this);
