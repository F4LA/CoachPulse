/**
 * Coach Pulse Dashboard — Breakdown Panel (Phase 4A + 4B.2 fix)
 *
 * Phase 4B.2 fix: read live metrics from CoachPulseApp.getCurrentMetrics()
 * so the panel reflects the currently-selected week, not the initial load.
 * Falls back to window.__cpMetrics for legacy compatibility.
 */
(function (root) {
  "use strict";

  var CFG = root.CoachPulseConfig;
  if (!CFG) throw new Error("breakdown-panel: CoachPulseConfig not loaded");

  /* ---------- HTML utilities ---------- */

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------- DOM scaffolding ---------- */

  function ensureRoot() {
    var existing = document.getElementById("breakdown-root");
    if (existing) return existing;
    var root_ = document.createElement("div");
    root_.id = "breakdown-root";
    root_.className = "bp-root hidden";
    root_.innerHTML =
      '<div class="bp-overlay" data-bp-close="true"></div>' +
      '<aside class="bp-panel" role="dialog" aria-modal="true" aria-labelledby="bp-title">' +
        '<header class="bp-header">' +
          '<h2 class="bp-title" id="bp-title">—</h2>' +
          '<button class="bp-close" data-bp-close="true" aria-label="Close">×</button>' +
        '</header>' +
        '<div class="bp-body" id="bp-body"></div>' +
      '</aside>';
    document.body.appendChild(root_);

    root_.addEventListener("click", function (e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute("data-bp-close") === "true") {
        close();
        return;
      }
      if (t && t.getAttribute && t.getAttribute("data-late-checkin") === "true") {
        handleLateCheckinClick(t);
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !root_.classList.contains("hidden")) close();
    });

    return root_;
  }

  function close() {
    var root_ = document.getElementById("breakdown-root");
    if (root_) root_.classList.add("hidden");
  }

  function open(title, bodyHtml) {
    var root_ = ensureRoot();
    var t = root_.querySelector(".bp-title");
    var b = root_.querySelector("#bp-body");
    if (t) t.textContent = title;
    if (b) b.innerHTML = bodyHtml;
    root_.classList.remove("hidden");
  }

  /* ---------- Body renderers per metric ---------- */

  function listSection(headingText, rows, columns, emptyText) {
    if (!rows || rows.length === 0) {
      return (
        (headingText ? '<h3 class="bp-section-title">' + escapeHtml(headingText) + '</h3>' : "") +
        '<div class="bp-empty">' + escapeHtml(emptyText) + '</div>'
      );
    }
    var head = columns.map(function (c) {
      return '<th>' + escapeHtml(c.label) + '</th>';
    }).join("");
    var body = rows.map(function (row) {
      var cells = columns.map(function (c) {
        var val = c.get(row);
        return '<td>' + escapeHtml(val == null || val === "" ? "—" : val) + '</td>';
      }).join("");
      return '<tr>' + cells + '</tr>';
    }).join("");
    return (
      (headingText ? '<h3 class="bp-section-title">' + escapeHtml(headingText) + '</h3>' : "") +
      '<table class="bp-table">' +
        '<thead><tr>' + head + '</tr></thead>' +
        '<tbody>' + body + '</tbody>' +
      '</table>'
    );
  }

  function footerLine(text) {
    return '<div class="bp-footer-line">' + escapeHtml(text) + '</div>';
  }

  function renderS1(metric) {
    var rows = metric.breakdown || [];
    var cols = [
      { label: "Client",         get: function (r) { return r.client; } },
      { label: "Active Pathway", get: function (r) { return r.activePathway; } },
      { label: "Pathway Week",   get: function (r) { return r.pathwayWeek; } }
    ];
    var html = listSection(null, rows, cols, "No new Red flags this week.");
    if (metric.subDisplay) html += footerLine(metric.subDisplay + " new Red this week");
    return html;
  }

  function renderS2(metric) {
    var bd = metric.breakdown || { yellows: [], reds: [] };
    var cols = [
      { label: "Client",         get: function (r) { return r.client; } },
      { label: "Active Pathway", get: function (r) { return r.activePathway; } },
      { label: "Pathway Week",   get: function (r) { return r.pathwayWeek; } }
    ];
    var yHtml = listSection("Yellow", bd.yellows || [], cols, "No Yellow clients.");
    var rHtml = listSection("Red",    bd.reds    || [], cols, "No Red clients.");
    var html = yHtml + rHtml;
    if (metric.subDisplay) html += footerLine(metric.subDisplay);
    return html;
  }

  function renderS3(metric) {
    var rows = metric.breakdown || [];
    var cols = [
      { label: "Client",         get: function (r) { return r.client; } },
      { label: "Triggered Date", get: function (r) { return r.triggeredDate; } }
    ];
    var html = listSection(null, rows, cols, "No black-flagged clients.");
    if (metric.subDisplay) html += footerLine(metric.subDisplay + " black-flagged");
    return html;
  }

  function renderS4(metric) {
    var rows = metric.breakdown || [];
    var cols = [
      { label: "Client",  get: function (r) { return r.client; } },
      { label: "End Date", get: function (r) { return r.endDate; } },
      { label: "Resign?", get: function (r) { return r.resign; } }
    ];
    var html = listSection(null, rows, cols, "No contracts ended last week.");
    if (metric.subDisplay) html += footerLine(metric.subDisplay);
    return html;
  }

  function weekKeyOf(meetingDate) {
    if (!meetingDate) return "";
    var y = meetingDate.getFullYear();
    var m = String(meetingDate.getMonth() + 1).padStart(2, "0");
    var d = String(meetingDate.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function currentWeekKey() {
    var md = root.CoachPulseApp && typeof root.CoachPulseApp.getCurrentMeetingDate === "function"
      ? root.CoachPulseApp.getCurrentMeetingDate()
      : null;
    return weekKeyOf(md);
  }

  function renderCA(metric, coach) {
    var bd = metric.breakdown || {};
    var nonSubs = bd.nonSubmitters || [];
    var lateCredited = bd.lateCredited || [];
    var readOnly = !!root.CoachPulseReadOnly;
    var weekKey = currentWeekKey();

    var html = "";

    // Non-submitters table, each with a "late check-in" action (HC only).
    if (!nonSubs.length) {
      html +=
        '<h3 class="bp-section-title">Did not submit this week</h3>' +
        '<div class="bp-empty">All active clients submitted this week.</div>';
    } else {
      var head =
        '<th>Client</th><th>Last Submission</th>' + (readOnly ? '' : '<th></th>');
      var body = nonSubs.map(function (r) {
        var client = r.client;
        var actionCell = readOnly
          ? ''
          : '<td>' +
              '<button class="bp-late-btn" data-late-checkin="true"' +
              ' data-coach="' + escapeHtml(coach) + '"' +
              ' data-week="' + escapeHtml(weekKey) + '"' +
              ' data-client="' + escapeHtml(client) + '">' +
              'Marcar late check-in' +
            '</button></td>';
        return (
          '<tr>' +
            '<td>' + escapeHtml(client) + '</td>' +
            '<td>' + escapeHtml(r.lastSubmission == null || r.lastSubmission === "" ? "—" : r.lastSubmission) + '</td>' +
            actionCell +
          '</tr>'
        );
      }).join("");
      html +=
        '<h3 class="bp-section-title">Did not submit this week</h3>' +
        '<table class="bp-table">' +
          '<thead><tr>' + head + '</tr></thead>' +
          '<tbody>' + body + '</tbody>' +
        '</table>';
    }

    // Informational: clients credited via a late check-in this week.
    if (lateCredited.length) {
      var lateRows = lateCredited.map(function (name) {
        return '<tr><td>' + escapeHtml(name) + '</td><td>Late check-in</td></tr>';
      }).join("");
      html +=
        '<h3 class="bp-section-title">Credited via late check-in</h3>' +
        '<table class="bp-table">' +
          '<thead><tr><th>Client</th><th>Credit</th></tr></thead>' +
          '<tbody>' + lateRows + '</tbody>' +
        '</table>';
    }

    if (metric.subDisplay) html += footerLine(metric.subDisplay + " submitted");
    return html;
  }

  function renderCD(metric) {
    var rows =
      (metric.breakdown && (metric.breakdown.clients || metric.breakdown)) ||
      metric.clients ||
      [];
    if (!Array.isArray(rows)) rows = [];

    var cols = [
      { label: "Client",   get: function (r) { return r.client || r.name; } },
      { label: "End Date", get: function (r) { return r.endDate || r.end_date; } },
      { label: "Status",   get: function (r) { return r.status; } }
    ];
    var html = listSection(null, rows, cols, "No contracts ending in the next 14 days.");
    if (metric.subDisplay) html += footerLine(metric.subDisplay);
    return html;
  }

  /* ---------- Dispatch ---------- */

  var METRIC_RENDERERS = {
    S1: renderS1,
    S2: renderS2,
    S3: renderS3,
    S4: renderS4,
    CA: renderCA,
    CD: renderCD
  };

  /**
   * Returns the live metrics object for the currently-selected week.
   * Prefers CoachPulseApp (which app.js updates on every week change).
   * Falls back to window.__cpMetrics for legacy compatibility.
   */
  function getCurrentMetrics() {
    if (root.CoachPulseApp && typeof root.CoachPulseApp.getCurrentMetrics === "function") {
      var m = root.CoachPulseApp.getCurrentMetrics();
      if (m) return m;
    }
    return root.__cpMetrics || {};
  }

  function show(metricKey, coach) {
    var meta = CFG.METRICS[metricKey];
    if (!meta) {
      console.warn("[breakdown-panel] unknown metric:", metricKey);
      return;
    }
    var allMetrics = getCurrentMetrics();
    var coachMetrics = allMetrics[coach];
    if (!coachMetrics || !coachMetrics[metricKey]) {
      console.warn("[breakdown-panel] no data for", coach, metricKey);
      open(meta.title + " — " + coach, '<div class="bp-empty">No data available.</div>');
      return;
    }
    var renderer = METRIC_RENDERERS[metricKey];
    if (!renderer) return;
    var bodyHtml = renderer(coachMetrics[metricKey], coach);
    open(meta.title + " — " + coach, bodyHtml);
  }

  /* ---------- Late check-in (CA only) ---------- */

  /**
   * Recompute CA in-place after crediting `client` with a late check-in:
   * move them out of nonSubmitters, into submittedClientNames + lateCredited,
   * and recompute percent / color / display / sub. rosterCount is preserved
   * because it equals submitted + nonSubmitters at all times.
   */
  function applyLateCheckinOptimistic(coach, client) {
    var metrics = getCurrentMetrics();
    var ca = metrics && metrics[coach] && metrics[coach].CA;
    if (!ca || !ca.breakdown) return null;
    var bd = ca.breakdown;
    bd.nonSubmitters = (bd.nonSubmitters || []).filter(function (r) {
      return r.client !== client;
    });
    bd.submittedClientNames = bd.submittedClientNames || [];
    if (bd.submittedClientNames.indexOf(client) === -1) bd.submittedClientNames.push(client);
    bd.lateCredited = bd.lateCredited || [];
    if (bd.lateCredited.indexOf(client) === -1) bd.lateCredited.push(client);

    var submittedCount = bd.submittedClientNames.length;
    var rosterCount = submittedCount + bd.nonSubmitters.length;
    var H = root.Scorecard && root.Scorecard.helpers;
    if (H && rosterCount > 0) {
      var percent = H.pct(submittedCount, rosterCount);
      ca.value = percent;
      ca.displayString = H.fmtPct(percent);
      ca.color = H.colorForPercentHigherBetter(percent, CFG.THRESHOLDS.formSub);
    }
    ca.subDisplay = submittedCount + " of " + rosterCount;
    return ca;
  }

  /**
   * Patch the live CA tile (active coach) so the dashboard reflects the new
   * percentage immediately, without a full re-render.
   */
  function patchCATile(ca) {
    if (!ca) return;
    var tile = document.querySelector('.tile[data-metric="CA"]');
    if (!tile) return;
    var valEl = tile.querySelector(".tile-value");
    var subEl = tile.querySelector(".tile-sub");
    if (valEl) valEl.textContent = ca.displayString || "—";
    if (subEl) subEl.textContent = ca.subDisplay || "";
    tile.className = tile.className.replace(/\btile-(green|yellow|red|neutral)\b/g, "").trim();
    tile.classList.add("tile-" + (ca.color || "neutral"));
  }

  function handleLateCheckinClick(btn) {
    if (root.CoachPulseReadOnly) return;
    var coach  = btn.getAttribute("data-coach");
    var week   = btn.getAttribute("data-week");
    var client = btn.getAttribute("data-client");
    if (!coach || !week || !client) return;
    if (!root.ManualInputs || typeof root.ManualInputs.setLateCheckin !== "function") return;

    btn.disabled = true;
    btn.textContent = "Guardando…";

    root.ManualInputs.setLateCheckin(week, coach, client)
      .then(function () {
        var ca = applyLateCheckinOptimistic(coach, client);
        patchCATile(ca);

        // Invalidate the cached week so a later reload recomputes from sheet.
        var md = root.CoachPulseApp && typeof root.CoachPulseApp.getCurrentMeetingDate === "function"
          ? root.CoachPulseApp.getCurrentMeetingDate()
          : null;
        if (md && root.WeekCache && root.WeekCache.invalidate) {
          root.WeekCache.invalidate(md);
        }

        // Re-render the panel body to reflect the moved client.
        show("CA", coach);
      })
      .catch(function (err) {
        if (root.console && root.console.error) {
          root.console.error("[CoachPulse] late check-in write failed:", err);
        }
        btn.disabled = false;
        btn.textContent = "Reintentar";
      });
  }

  function isClickable(metricKey) {
    return !!METRIC_RENDERERS[metricKey];
  }

  root.BreakdownPanel = {
    show:        show,
    close:       close,
    isClickable: isClickable
  };
})(typeof window !== "undefined" ? window : this);
