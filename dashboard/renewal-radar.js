/**
 * Coach Pulse Dashboard — Renewal Radar (CD: Renewals Next 2 Weeks)
 *
 * Builds the list of clients with End Date in the next 14 calendar days,
 * grouped by coach, with HC-assigned status from Manual Inputs Tab 2.
 *
 * Window: Thursday 00:00 ET (meeting day) → Wednesday 23:59 ET 14 days later.
 *
 * Color (per coach):
 *   Green: all clients in Green statuses
 *   Red:   any single client in Red status
 *   Gray:  any client unset
 */
(function (root) {
  "use strict";

  var CFG = root.CoachPulseConfig;
  if (!CFG) throw new Error("renewal-radar: CoachPulseConfig not loaded");

  function parseDate(s) {
    if (!s) return null;
    if (s instanceof Date) return s;
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function formatYMD(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function closingWedOfClosedWeek(meetingDate) {
    var wed = new Date(meetingDate.getTime());
    wed.setDate(wed.getDate() - 1);
    return formatYMD(wed);
  }

  /**
   * Returns a list of clients whose End Date falls within the next 14 days
   * from meetingDate (Thursday 00:00 ET → Wednesday 23:59 ET +14d).
   */
  function clientsInWindow(coachName, masterSheet, meetingDate) {
    var windowStart = new Date(meetingDate.getTime());
    windowStart.setHours(0, 0, 0, 0);  // Thu 00:00 ET

    var windowEnd = new Date(windowStart.getTime());
    windowEnd.setDate(windowEnd.getDate() + 14);  // Wed 23:59 ET 14d later
    windowEnd.setHours(23, 59, 59, 999);
    // Note: windowEnd is actually the same calendar day as today+14, which
    // is the Wednesday 14 days from today. Inclusive upper bound.

    var out = [];
    for (var i = 0; i < masterSheet.length; i++) {
      var row = masterSheet[i];
      if (row.coach !== coachName) continue;
      var endDate = parseDate(row.newEndDate);
      if (!endDate) continue;
      if (endDate >= windowStart && endDate <= windowEnd) {
        out.push({
          clientName: (row.firstName + " " + row.lastName).trim(),
          firstName:  row.firstName,
          lastName:   row.lastName,
          email:      row.email,
          endDate:    row.newEndDate
        });
      }
    }
    return out;
  }

  /**
   * Looks up the HC-assigned Status for a client from the Manual Inputs Tab 2.
   * Matches by (week, coach, client name).
   */
  function lookupStatus(weekEndingWed, coachName, clientName, manualCD) {
    var hit = manualCD.find(function (r) {
      return r.weekEndingWed === weekEndingWed
          && r.coach === coachName
          && r.clientName === clientName;
    });
    return hit ? (hit.status || "") : "";
  }

  function classifyStatus(status) {
    if (!status) return "unset";
    if (CFG.CD_STATUSES.GREEN.indexOf(status) !== -1) return "green";
    if (CFG.CD_STATUSES.RED.indexOf(status)   !== -1) return "red";
    return "unset";
  }

  /**
   * Per-coach color rule:
   *   - any client with red-class status → red
   *   - else any client unset            → neutral (gray)
   *   - else all green                   → green
   */
  function rollupColor(items) {
    var anyRed = false;
    var anyUnset = false;
    for (var i = 0; i < items.length; i++) {
      var cls = items[i].statusClass;
      if (cls === "red") anyRed = true;
      if (cls === "unset") anyUnset = true;
    }
    if (anyRed) return "red";
    if (anyUnset) return "neutral";
    return "green";
  }

  function computeForCoach(coachName, masterSheet, manualCD, meetingDate) {
    var weekEndingWed = closingWedOfClosedWeek(meetingDate);
    var inWindow = clientsInWindow(coachName, masterSheet, meetingDate);

    var items = inWindow.map(function (c) {
      var status = lookupStatus(weekEndingWed, coachName, c.clientName, manualCD);
      return {
        clientName:  c.clientName,
        endDate:     c.endDate,
        status:      status,
        statusClass: classifyStatus(status)
      };
    });

    var color = items.length === 0 ? "neutral" : rollupColor(items);
    var display = items.length === 0 ? "0 clients" :
                  items.length + " client" + (items.length === 1 ? "" : "s");

    return {
      value:         items.length,
      color:         color,
      displayString: display,
      breakdown: {
        clients:       items,
        weekEndingWed: weekEndingWed
      }
    };
  }

  root.RenewalRadar = {
    computeForCoach: computeForCoach,
    _internal: {
      clientsInWindow: clientsInWindow,
      classifyStatus:  classifyStatus,
      rollupColor:     rollupColor
    }
  };
})(typeof window !== "undefined" ? window : this);
