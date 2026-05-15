/**
 * Coach Pulse Dashboard — Renderer
 *
 * Phase 3B: CB and CC tiles now have interactive controls.
 * CB: Yes/No toggle
 * CC: Done/Pending/Missed segmented control
 *
 * On change → optimistic update + write to Apps Script Web App.
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

  /* ---------- Compute the week key (closing Wednesday) ---------- */
  function getWeekKey(meetingDate) {
    var wed = new Date(meetingDate.getTime() - 24 * 60 * 60 * 1000);
    var y = wed.getFullYear();
    var m = String(wed.getMonth() + 1).padStart(2, "0");
    var d = String(wed.getDate()).padStart(2, "0");
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

  function renderTile(metricKey, metricData, coach, weekKey) {
    var meta = CFG.METRICS[metricKey];
    if (!meta) return "";

    var color = metricData.color || "neutral";

    // CB and CC get interactive controls IN PLACE OF the big value
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

    return (
      '<div class="tile tile-' + color + '" data-metric="' + metricKey + '">' +
        '<div class="tile-header">' +
          '<div class="tile-title">' + escapeHtml(meta.title) + '</div>' +
          '<div class="tile-description">' + escapeHtml(meta.description) + '</div>' +
        '</div>' +
        valueBlock +
        '<div class="tile-legend">' + escapeHtml(meta.legend) + '</div>' +
      '</div>'
    );
  }

  function renderSection(sectionKey, coachMetrics, coach, weekKey) {
    var order = CFG.METRIC_ORDER[sectionKey];
    var tiles = order.map(function (key) {
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

  function renderCoachTab(coach, allMetrics, weekKey) {
    var m = allMetrics[coach];
    if (!m) return '<div class="empty">No data for ' + escapeHtml(coach) + '</div>';

    return (
      '<div class="coach-tab" data-coach="' + escapeHtml(coach) + '">' +
        '<div class="coach-header">' +
          '<h1 class="coach-name">' + escapeHtml(coach) + '</h1>' +
        '</div>' +
        renderSection("scorecard", m, coach, weekKey) +
        renderSection("behaviors", m, coach, weekKey) +
      '</div>'
    );
  }

  function formatLong(d) {
    var months = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];
    var days   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    return days[d.getDay()] + ", " + months[d.getMonth()] + " " + d.getDate() + " " + d.getFullYear();
  }

  function render(allMetrics, meetingDate, activeCoach) {
    var main = document.getElementById("main");
    if (!main) return;

    var weekKey = getWeekKey(meetingDate);
    var coachContent = renderCoachTab(activeCoach, allMetrics, weekKey);

    var meetingStr = formatLong(meetingDate);
    var weekEndStr = formatLong(new Date(meetingDate.getTime() - 24*60*60*1000));

    main.innerHTML =
      '<div class="meeting-meta">Meeting day: <strong>' + escapeHtml(meetingStr) +
      '</strong>  ·  Closed coaching week ended ' + escapeHtml(weekEndStr) +
      '</div>' +
      '<div id="coach-content">' + coachContent + '</div>';

    wireControls(allMetrics, meetingDate);
  }

  function renderCoachContent(allMetrics, coach, meetingDate) {
    var container = document.getElementById("coach-content");
    if (!container) return;
    var weekKey = getWeekKey(meetingDate);
    container.innerHTML = renderCoachTab(coach, allMetrics, weekKey);
    wireControls(allMetrics, meetingDate);
  }

  /* ---------- Wire interactive controls ---------- */

  function wireControls(allMetrics, meetingDate) {
    var groups = document.querySelectorAll(".tile-controls");
    groups.forEach(function (group) {
      var control = group.getAttribute("data-control");
      var coach   = group.getAttribute("data-coach");
      var week    = group.getAttribute("data-week");
      var buttons = group.querySelectorAll(".ctrl-btn");
      buttons.forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          var value = e.currentTarget.getAttribute("data-value");
          handleControlClick(control, coach, week, value, allMetrics, meetingDate, e.currentTarget);
        });
      });
    });
  }

  function handleControlClick(control, coach, week, value, allMetrics, meetingDate, btnEl) {
    var fields = {};
    if (control === "cb") fields.cb = value;
    if (control === "cc") fields.cc = value;

    // Optimistic UI: mark this button active, others in group inactive
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

    // Fire-and-forget the write
    root.ManualInputs.setCB_CC(week, coach, fields)
      .then(function () {
        // no-cors means we can't read the response, but if no exception, assume success
        Array.prototype.forEach.call(group.querySelectorAll(".ctrl-btn"), function (b) {
          b.classList.remove("ctrl-saving");
        });
        // Optimistically update local state so a tab switch still shows the new value
        if (allMetrics[coach] && allMetrics[coach][control.toUpperCase()]) {
          allMetrics[coach][control.toUpperCase()].value = value;
          allMetrics[coach][control.toUpperCase()].displayString = value;
          allMetrics[coach][control.toUpperCase()].color =
            (value === "Yes" || value === "Done")      ? "green"  :
            (value === "Pending")                       ? "yellow" :
            (value === "No"  || value === "Missed")     ? "red"    : "neutral";
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
