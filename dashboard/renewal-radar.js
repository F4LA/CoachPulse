/**
 * Coach Pulse Dashboard — Renewal Radar (CD: Renewals Next 2 Weeks)
 *
 * Phase 4B.2 fix: meetingDate is Wed 23:59:59.999 ET (post 4B.1). The
 * 14-day forward window starts on the Thursday AFTER meetingDate (the
 * day after the closed coaching week). weekKey is the Wed itself, not
 * meetingDate - 1.
 *
 * Phase 4B.3 fix: clients with refund=true (col Y) are excluded from the
 * window, consistent with S4 (Renewals Last Week) and the Slack Renewal
 * Radar automation.
 */
(function (root) {
  "use strict";

  var CFG = root.CoachPulseConfig;
  var helpers = root.Scorecard && root.Scorecard.helpers;
  if (!CFG)     throw new Error("renewal-radar: CoachPulseConfig not loaded");
  if (!helpers) throw new Error("renewal-radar: Scorecard helpers not loaded");

  /**
   * meetingDate is Wed 23:59:59.999 (ET-anchored). Renewals Next 2 Weeks
   * looks forward starting Thursday (the day after meetingDate) for 14 days.
   *
   * Timezone-safe: the window is built from meetingDate's calendar Y/M/D via
   * the local Date constructor, NOT from `meetingDate + 1ms` + setHours().
   * The old idiom assumed meetingDate sat at *local* 23:59:59.999, which is
   * only true in ET. For a browser west of ET (Central/Mountain/Pacific) the
   * instant reads as the prior evening, so `+1ms` never crossed into Thursday
   * and the whole 14-day window shifted back a day — silently dropping the
   * 14th day (e.g. a client ending exactly two weeks out). Calendar-day math
   * matches parseDateLoose (which yields local-midnight dates) on every tz.
   */
  function getWindow(meetingDate) {
    var y = meetingDate.getFullYear();
    var mo = meetingDate.getMonth();
    var d = meetingDate.getDate();
    // Thursday after meetingDate at 00:00:00.000 (day rollover handled by Date).
    var start = new Date(y, mo, d + 1, 0, 0, 0, 0);
    // 14th day inclusive, at 23:59:59.999.
    var end = new Date(y, mo, d + 14, 23, 59, 59, 999);
    return { start: start, end: end };
  }

  function classifyStatus(status) {
    if (!status) return "unset";
    var s = String(status).trim();
    if (CFG.CD_STATUSES.GREEN.indexOf(s) !== -1) return "green";
    if (CFG.CD_STATUSES.RED.indexOf(s) !== -1)   return "red";
    return "unset";
  }

  function deriveCoachColor(clientList) {
    if (clientList.length === 0) return "neutral";
    var hasUnset = false, hasRed = false;
    for (var i = 0; i < clientList.length; i++) {
      var k = classifyStatus(clientList[i].status);
      if (k === "red") hasRed = true;
      else if (k === "unset") hasUnset = true;
    }
    if (hasRed) return "red";
    if (hasUnset) return "neutral";
    return "green";
  }

  function findStatus(manualCD, weekKey, coach, clientName) {
    for (var i = 0; i < manualCD.length; i++) {
      var r = manualCD[i];
      if (r.weekEndingWed === weekKey && r.coach === coach && r.clientName === clientName) {
        return r.status || "";
      }
    }
    return "";
  }

  /**
   * weekKey is the Wed itself (meetingDate's date), not meetingDate - 1.
   */
  function weekKeyOf(meetingDate) {
    return meetingDate.getFullYear() + "-" +
      String(meetingDate.getMonth() + 1).padStart(2, "0") + "-" +
      String(meetingDate.getDate()).padStart(2, "0");
  }

  function compute(data, meetingDate) {
    var window = getWindow(meetingDate);
    var weekKey = weekKeyOf(meetingDate);

    var out = {};
    for (var i = 0; i < CFG.COACHES.length; i++) out[CFG.COACHES[i]] = { clients: [] };

    for (var j = 0; j < data.masterSheet.length; j++) {
      var r = data.masterSheet[j];
      if (!out[r.coach]) continue;
      if (r.refund) continue;  // refunded clients excluded — consistent with S4 and Slack Radar
      var end = helpers.parseDateLoose(r.newEndDate);
      if (!end) continue;
      if (end < window.start || end > window.end) continue;

      var clientName = (r.firstName + " " + r.lastName).trim();
      var status     = findStatus(data.manualCD, weekKey, r.coach, clientName);

      out[r.coach].clients.push({
        client:    clientName,
        endDate:   r.newEndDate,
        status:    status,
        classification: classifyStatus(status)
      });
    }

    var result = {};
    for (var k = 0; k < CFG.COACHES.length; k++) {
      var c = CFG.COACHES[k];
      var list = out[c].clients;
      var unsetCount = 0;
      for (var m = 0; m < list.length; m++) {
        if (classifyStatus(list[m].status) === "unset") unsetCount++;
      }
      result[c] = {
        CD: {
          value: list.length,
          displayString: list.length === 0 ? "—" : String(list.length),
          subDisplay: list.length === 0
            ? "no clients in window"
            : (list.length === 1 ? "1 client" : list.length + " clients") +
              (unsetCount > 0 ? " · " + unsetCount + " unset" : ""),
          color: deriveCoachColor(list),
          breakdown: list
        }
      };
    }
    return result;
  }

  root.RenewalRadar = {
    compute: compute,
    helpers: { getWindow: getWindow, classifyStatus: classifyStatus }
  };
})(typeof window !== "undefined" ? window : this);
