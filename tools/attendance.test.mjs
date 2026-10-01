// Runnable self-check: node tools/attendance.test.mjs
import assert from "node:assert";
import {
  dateKey, dayKey, classWindow, windowState, computeStats, coursePercent, nextClass,
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

// empty
const empty = computeStats({}, "V", { days: {} });
assert.equal(empty.percent, null);

console.log("attendance self-check: all assertions passed");
