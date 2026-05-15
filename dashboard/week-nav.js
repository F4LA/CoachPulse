/**
 * Coach Pulse Dashboard — Week Navigation (Phase 4B.2)
 *
 * Renders a left-arrow / week-label / right-arrow component into the
 * #week-nav-container slot rendered by renderer.js.
 *
 * Conventions:
 *   - meetingDate is always Wednesday 23:59:59.999 (matches what
 *     getDefaultMeetingDate returns in app.js).
 *   - Internally we normalize any Date passed to setMeetingDate to the
 *     Wed 23:59:59.999 of the Thu-Wed coaching week it falls in.
 *   - The "▶" arrow is disabled when currentMeetingDate is the
 *     most-recent closed week (the initial date passed to mount).
 */
(function (root) {
  "use strict";

  // ---- Module state ----
  var currentMeetingDate = null;
  var mostRecentMeetingDate = null;
  var subscribers = [];

  // ---- Helpers ----

  function normalizeToWednesday(date) {
    var d = new Date(date.getTime());
    var dow = d.getDay(); // Sun=0..Sat=6
    var daysToWed = (3 - dow + 7) % 7;
    d.setDate(d.getDate() + daysToWed);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  function sameDayMs(a, b) {
    return a.getTime() === b.getTime();
  }

  function addDays(date, n) {
    var d = new Date(date.getTime());
    d.setDate(d.getDate() + n);
    return d;
  }

  function formatWedShort(date) {
    var months = ["Jan","Feb","Mar","Apr","May","Jun",
                  "Jul","Aug","Sep","Oct","Nov","Dec"];
    return "Wed " + months[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear();
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---- Render ----

  function isAtMostRecent() {
    if (!mostRecentMeetingDate || !currentMeetingDate) return true;
    return currentMeetingDate.getTime() >= mostRecentMeetingDate.getTime();
  }

  function renderHtml() {
    var disabled = isAtMostRecent();
    var nextClasses = "week-nav-arrow week-nav-next" + (disabled ? " week-nav-arrow-disabled" : "");
    var nextAttrs = disabled
      ? ' aria-disabled="true" disabled title="Already on most recent closed week"'
      : ' aria-label="Next week"';

    return (
      '<div class="week-nav">' +
        '<button class="week-nav-arrow week-nav-prev" aria-label="Previous week">◀</button>' +
        '<span class="week-nav-label">Week ending <strong>' +
          escapeHtml(formatWedShort(currentMeetingDate)) +
        '</strong></span>' +
        '<button class="' + nextClasses + '"' + nextAttrs + '>▶</button>' +
      '</div>'
    );
  }

  function paint() {
    var container = document.getElementById("week-nav-container");
    if (!container) return;
    container.innerHTML = renderHtml();
    wire(container);
  }

  function wire(container) {
    var prev = container.querySelector(".week-nav-prev");
    var next = container.querySelector(".week-nav-next");

    if (prev) {
      prev.addEventListener("click", function () {
        setMeetingDate(addDays(currentMeetingDate, -7));
      });
    }

    if (next) {
      next.addEventListener("click", function () {
        if (isAtMostRecent()) return;
        setMeetingDate(addDays(currentMeetingDate, 7));
      });
    }
  }

  // ---- Public API ----

  function mount(initialMeetingDate) {
    if (!(initialMeetingDate instanceof Date)) {
      throw new Error("WeekNav.mount: initialMeetingDate must be a Date");
    }
    var normalized = normalizeToWednesday(initialMeetingDate);
    currentMeetingDate = normalized;
    mostRecentMeetingDate = new Date(normalized.getTime());
    paint();
  }

  function getCurrentMeetingDate() {
    if (!currentMeetingDate) return null;
    return new Date(currentMeetingDate.getTime());
  }

  function setMeetingDate(date) {
    if (!(date instanceof Date)) {
      throw new Error("WeekNav.setMeetingDate: date must be a Date");
    }
    var normalized = normalizeToWednesday(date);
    if (currentMeetingDate && sameDayMs(currentMeetingDate, normalized)) {
      return;
    }
    currentMeetingDate = normalized;
    paint();
    var snapshot = new Date(currentMeetingDate.getTime());
    subscribers.forEach(function (cb) {
      try { cb(snapshot); }
      catch (err) { console.error("[WeekNav] subscriber error:", err); }
    });
  }

  function onWeekChange(callback) {
    if (typeof callback !== "function") {
      throw new Error("WeekNav.onWeekChange: callback must be a function");
    }
    subscribers.push(callback);
    return function unsubscribe() {
      var idx = subscribers.indexOf(callback);
      if (idx !== -1) subscribers.splice(idx, 1);
    };
  }

  root.WeekNav = {
    mount: mount,
    getCurrentMeetingDate: getCurrentMeetingDate,
    setMeetingDate: setMeetingDate,
    onWeekChange: onWeekChange
  };
})(typeof window !== "undefined" ? window : this);
