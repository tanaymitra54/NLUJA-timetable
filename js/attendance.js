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

// Working Saturdays: per-date override mapping a Saturday to a weekday's
// timetable, keyed by dateKey. Dates absent from the map are non-working.
let SATURDAYS = {}; // { "YYYY-MM-DD": "Mon" }
export function setSaturdayRules(map) { SATURDAYS = map || {}; }
export function resolvedDayKey(d) {
  const k = dayKey(d);
  return k === "Sat" ? (SATURDAYS[dateKey(d)] || k) : k;
}

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

// Dev-only override: force every class to be markable so the UI can be previewed
// outside class hours. Enabled by ?dev=1 in app.js. Never on in production.
let FORCE_OPEN = false;
export function setForceOpen(v) { FORCE_OPEN = !!v; }

// 'upcoming' | 'open' | 'closed'
export function windowState(period, date, now = new Date()) {
  if (FORCE_OPEN) return "open";
  const { start, end } = classWindow(period, date);
  if (now < start) return "upcoming";
  if (now > end) return "closed";
  return "open";
}

// How a period sits against the clock. left is the share of the period still to go (1 = just started).
export function periodProgress(period, now = new Date()) {
  const start = atTime(now, period.start);
  const end = atTime(now, period.end);
  if (now < start) return { phase: "upcoming", left: 1 };
  if (now >= end) return { phase: "past", left: 0 };
  const span = end - start;
  return { phase: "live", left: span > 0 ? (end - now) / span : 0 };
}

export function todayPeriodsFor(sectionData, date) {
  const day = resolvedDayKey(date);
  const row = sectionData?.days?.[day] || {};
  return Object.entries(row); // [periodId, cells[]]
}

// seconds until the next class starts today; null if none upcoming
export function nextClass(sectionData, periods, date, now = new Date()) {
  const day = resolvedDayKey(date);
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
    for (const [pid, rec] of Object.entries(dayMarks)) {
      if (!rec || rec.status === "cancelled") continue;
      const row = sectionData?.days?.[rec.day || resolvedDayKey(d)] || {};
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

// Full history per course code, newest first. Each entry is one marked
// class: { dk, day, pid, status, at }. Follows computeStats' convention of
// mapping a period's mark to its first cell's course code.
export function courseHistory(store, section, sectionData) {
  const hist = {}; // code -> [{dk, day, pid, status, at, name}]
  const sec = store?.records?.[section] || {};
  for (const [dk, dayMarks] of Object.entries(sec)) {
    const d = new Date(dk + "T12:00:00");
    for (const [pid, rec] of Object.entries(dayMarks)) {
      if (!rec || rec.status === "cancelled") continue;
      const day = rec.day || resolvedDayKey(d);
      const row = sectionData?.days?.[day] || {};
      const cell = (row[pid] || [])[0];
      const code = cell?.code || "?";
      const name = cell?.name || code;
      (hist[code] = hist[code] || []).push({ dk, day, pid, status: rec.status, at: rec.at, name });
    }
  }
  for (const list of Object.values(hist)) list.sort((a, b) => (a.dk < b.dk ? 1 : a.dk > b.dk ? -1 : 0));
  return hist;
}

// Build a CSV attendance matrix (opens in Excel): one row per course, one
// column per marked date, each cell P/A, followed by Present/Absent/Total/%.
function csvCell(v) {
  v = String(v ?? "");
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function csvReport(store, section, sectionData) {
  const per = computeStats(store, section, sectionData).per;
  const hist = courseHistory(store, section, sectionData);
  const dates = [...new Set(Object.values(hist).flat().map((h) => h.dk))].sort();
  const byCode = {}; // code -> { dk: 'P'|'A' }
  for (const [code, list] of Object.entries(hist)) {
    byCode[code] = {};
    for (const h of list) byCode[code][h.dk] = h.status === "present" ? "P" : "A";
  }
  const lines = [
    ["Course", "Class", ...dates, "Present", "Absent", "Total", "%"].map(csvCell).join(","),
  ];
  for (const r of per) {
    const cp = coursePercent(r);
    const row = [r.code, r.name, ...dates.map((d) => byCode[r.code]?.[d] || ""), r.present, r.absent, r.total, cp == null ? "" : cp].map(csvCell).join(",");
    lines.push(row);
  }
  return lines.join("\r\n");
}

export function coursePercent(row) {
  const t = row.present + row.absent;
  return t ? Math.round((row.present / t) * 100) : null;
}
