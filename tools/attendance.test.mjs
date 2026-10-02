// Runnable self-check: node tools/attendance.test.mjs
import assert from "node:assert";
import {
  dateKey, dayKey, classWindow, windowState, periodProgress, computeStats, coursePercent, courseHistory, csvReport, nextClass,
  setSaturdayRules, resolvedDayKey,
} from "../js/attendance.js";

const period = { id: "p1", start: "09:00", end: "09:50" };
const day = new Date(2026, 7, 10, 0, 0, 0); // Mon 10 Aug 2026

assert.equal(dateKey(day), "2026-08-10");
assert.equal(dayKey(day), "Mon");

const at = (h, m) => new Date(2026, 7, 10, h, m, 0, 0);

// window opens at class start, not before
assert.equal(windowState(period, day, at(8, 59)), "upcoming");
assert.equal(windowState(period, day, at(9, 0)), "open");
assert.equal(windowState(period, day, at(12, 0)), "open");
assert.equal(windowState(period, day, at(23, 58)), "open");
// closes at end of the same calendar day
assert.equal(windowState(period, day, new Date(2026, 7, 11, 0, 1)), "closed");

// end-of-day boundary
const { end } = classWindow(period, day);
assert.equal(end.getHours(), 23);
assert.equal(end.getDate(), 10);

// next class
const sched = { days: { Mon: { p1: [{ code: "1.6" }] } } };
const periods = [period];
const nx = nextClass(sched, periods, day, at(8, 0));
assert.equal(nx.pid, "p1");
assert.equal(nextClass(sched, periods, day, at(9, 5)), null);

assert.equal(periodProgress(period, at(8, 59)).phase, "upcoming");
assert.equal(periodProgress(period, at(9, 0)).phase, "live");
assert.equal(periodProgress(period, at(9, 0)).left, 1);
assert.equal(periodProgress(period, at(9, 25)).left, 0.5);
assert.equal(periodProgress(period, at(9, 50)).phase, "past");

// stats: present/absent/cancelled
const records = {
  version: 1,
  records: {
    "III": {
      "2026-08-10": { p1: { status: "present" }, p2: { status: "absent" } },
      "2026-08-11": { p1: { status: "cancelled" }, p3: { status: "present" } },
    },
  },
};
const sectionData = {
  days: {
    Mon: { p1: [{ code: "3.1", name: "History III" }], p2: [{ code: "3.2", name: "Pol III" }] },
    Tue: { p1: [{ code: "3.1" }], p3: [{ code: "3.2" }] },
  },
};
const stats = computeStats(records, "III", sectionData);
assert.equal(stats.present, 2);
assert.equal(stats.absent, 1);
assert.equal(stats.total, 3);
assert.equal(stats.percent, 67); // cancelled excluded
const hist = stats.per.find((r) => r.code === "3.1");
assert.equal(hist.present, 1);
assert.equal(hist.absent, 0);
assert.equal(coursePercent(hist), 100);

// course history per code, newest first, cancelled excluded
const ch = courseHistory(records, "III", sectionData);
assert.deepEqual(ch["3.1"], [{ dk: "2026-08-10", day: "Mon", pid: "p1", status: "present", at: records.records["III"]["2026-08-10"].p1.at, name: "History III" }]);
assert.equal(ch["3.2"].length, 2);
assert.equal(ch["3.2"][0].dk, "2026-08-11"); // newest first
assert.equal(ch["3.2"][0].status, "present");
assert.equal(ch["3.2"][1].dk, "2026-08-10");
assert.equal(ch["3.2"][1].status, "absent");
assert.deepEqual(courseHistory({}, "V", { days: {} }), {});

// csv report: course x date matrix, oldest date first, per sorted by total desc
const csv = csvReport(records, "III", sectionData);
const expectCsv = "Course,Class,2026-08-10,2026-08-11,Present,Absent,Total,%\r\n"
  + "3.2,Pol III,A,P,1,1,2,50\r\n"
  + "3.1,History III,P,,1,0,1,100";
assert.equal(csv, expectCsv);

// empty
const empty = computeStats({}, "V", { days: {} });
assert.equal(empty.percent, null);

// Saturday as a working day: a per-date rule maps it to a chosen weekday's
// timetable, and the mark is attributed to that weekday's course even if the
// rule is later removed.
const sat = new Date(2026, 7, 8, 0, 0, 0); // Sat 8 Aug 2026
assert.equal(dayKey(sat), "Sat");
assert.equal(resolvedDayKey(sat), "Sat");
setSaturdayRules({ "2026-08-08": "Mon" });
assert.equal(resolvedDayKey(sat), "Mon");
const satRecords = { version: 1, records: { III: { "2026-08-08": { p1: { status: "present", day: "Mon" } } } } };
assert.equal(computeStats(satRecords, "III", sectionData).percent, 100);
setSaturdayRules({});
assert.equal(resolvedDayKey(sat), "Sat");

console.log("attendance self-check: all assertions passed");
