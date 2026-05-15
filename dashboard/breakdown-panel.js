/**
 * Coach Pulse Dashboard — Breakdown Panel (Phase 4A)
 *
 * Renders a side panel sliding in from the right with the client list
 * behind each metric. Triggered by clicks on tile elements with
 * data-metric attributes (set by renderer.js).
 *
 * Contract:
 *   - reads metric data from window.__cpMetrics for the active coach
 *   - renders into #breakdown-root (which lives once in index.html)
 *   - close: X button, click outside the panel, ESC key
 *
 * Per-metric breakdown shape:
 *   S1: list of newly-Red clients with active pathway + pathway week
 *   S2: two lists (Yellow, Red), each client with pathway + pathway week
 *   S3: list of black-flagged clients with triggered date
 *   S4: list of contracts ending last week with renewal decision
 *   CA: list of NON-submitters with last submission date
 *   CD: list of clients with contract ending in next 14 days + status
 *
 * CB and CC are intentionally NOT clickable — their full state is already
 * visible on the tile (value + last-updated timestamp).
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

    // Click outside / X / ESC to close
    root_.addEventListener("click", function (e) {
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-bp-close") === "true") {
        close();
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
    if (metric.subDisplay) {
      html += footerLine(metric.subDisplay + " new Red this week");
    }
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

  function renderCA(metric) {
    var bd = metric.breakdown || {};
    var nonSubs = bd.nonSubmitters || [];
    var cols = [
      { label: "Client",          get: function (r) { return r.client; } },
      { label: "Last Submission", get: function (r) { return r.lastSubmission; } }
    ];
    var html = listSection(
      "Did not submit this week",
      nonSubs,
      cols,
      "All active clients submitted this week."
    );
    if (metric.subDisplay) html += footerLine(metric.subDisplay + " submitted");
    return html;
  }

  function renderCD(metric) {
    // CD shape may be { breakdown: [...] } or have the list at a different
    // key. Try a few likely keys for resilience; default to empty.
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
    var html = listSection(
      null,
      rows,
      cols,
      "No contracts ending in the next 14 days."
    );
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
   * Open the panel for a given metric/coach using whatever data is currently
   * stored on window.__cpMetrics.
   */
  function show(metricKey, coach) {
    var meta = CFG.METRICS[metricKey];
    if (!meta) {
      console.warn("[breakdown-panel] unknown metric:", metricKey);
      return;
    }
    var allMetrics = root.__cpMetrics || {};
    var coachMetrics = allMetrics[coach];
    if (!coachMetrics || !coachMetrics[metricKey]) {
      console.warn("[breakdown-panel] no data for", coach, metricKey);
      open(meta.title + " — " + coach, '<div class="bp-empty">No data available.</div>');
      return;
    }
    var renderer = METRIC_RENDERERS[metricKey];
    if (!renderer) {
      // Clickability should already be gated, but be defensive.
      return;
    }
    var bodyHtml = renderer(coachMetrics[metricKey]);
    open(meta.title + " — " + coach, bodyHtml);
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
