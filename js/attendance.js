// Attendance logic — pure functions, no DOM, no storage. Testable in Node.
// A class may only be marked from its start time until the END of that calendar
// day (local time). This matches the "mark any time during that day" rule.

export const WINDOW_CLOSE = "end-of-day"; // 'end-of-day' | 'start+24h'

export function pad(n) { return String(n).padStart(2, "0"); }

export function dateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function dayKey(d) { return DOW[d.getDay()]; }

function atTime(date, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

export function classWindow(period, date) {
  const start = atTime(date, period.start);
  let end;
  if (WINDOW_CLOSE === "start+24h") {
    end = new Date(start.getTime() + 24 * 3600 * 1000);
  } else {
    end = new Date(date);
    end.setHours(23, 59, 59, 999);
  }
  return { start, end };
}

// 'upcoming' | 'open' | 'closed'
export function windowState(period, date, now = new Date()) {
  const { start, end } = classWindow(period, date);
  if (now < start) return "upcoming";
  if (now > end) return "closed";
  return "open";
}

export function todayPeriodsFor(sectionData, date) {
  const day = dayKey(date);
  const row = sectionData?.days?.[day] || {};
  return Object.entries(row); // [periodId, cells[]]
}

// seconds until the next class starts today; null if none upcoming
export function nextClass(sectionData, periods, date, now = new Date()) {
  const day = dayKey(date);
  const row = sectionData?.days?.[day] || {};
  let best = null;
  for (const [pid, cells] of Object.entries(row)) {
    const p = periods.find((x) => x.id === pid);
    if (!p) continue;
    const { start } = classWindow(p, date);
    if (start >= now && (!best || start < best.start)) best = { pid, cells, start, period: p };
  }
  return best;
}

// records: the store object { version, records: { section: { dateKey: { periodId: {status,at} } } } }
export function marksFor(store, section, date) {
  return store?.records?.[section]?.[dateKey(date)] || {};
}

export function computeStats(store, section, sectionData) {
  const per = {}; // code -> {present, absent, total, dates:[], name}
  let present = 0, absent = 0;
  const sec = store?.records?.[section] || {};
  for (const [dk, dayMarks] of Object.entries(sec)) {
    const d = new Date(dk + "T12:00:00");
    const day = dayKey(d);
    const row = sectionData?.days?.[day] || {};
    for (const [pid, rec] of Object.entries(dayMarks)) {
      if (!rec || rec.status === "cancelled") continue;
      const cell = (row[pid] || [])[0];
      const code = cell?.code || "?";
      const name = cell?.name || code;
      per[code] = per[code] || { code, name, present: 0, absent: 0, total: 0 };
      per[code].total++;
      if (rec.status === "present") { per[code].present++; present++; }
      else if (rec.status === "absent") { per[code].absent++; absent++; }
    }
  }
  const total = present + absent;
  return {
    per: Object.values(per).sort((a, b) => b.total - a.total || a.code.localeCompare(b.code)),
    present, absent, total,
    percent: total ? Math.round((present / total) * 100) : null,
  };
}

export function coursePercent(row) {
  const t = row.present + row.absent;
  return t ? Math.round((row.present / t) * 100) : null;
}
