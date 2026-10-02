import {
  dateKey, windowState, periodProgress, nextClass,
  marksFor, computeStats, coursePercent, courseHistory, csvReport, setForceOpen,
  setSaturdayRules, resolvedDayKey,
} from "./attendance.js";
import { load as loadStore, setMark, clearMark, exportBlob, importFile } from "./store.js";

const IS_DEV = new URLSearchParams(location.search).has("dev");
if (IS_DEV) setForceOpen(true);

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const DAY_LABEL = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let DATA = null;
const state = { section: "III", view: "today", query: "", saturdays: {} };
let RECORDS = loadStore();
let deferredInstall = null;

const sectionData = () => DATA.sections[state.section];
const periodOf = (id) => DATA.periods.find((p) => p.id === id);
const facName = (init) => (DATA.faculty && DATA.faculty[init]) || init;
const courseName = (cell) => cell?.name || (DATA.courses && DATA.courses[cell?.code]) || cell?.code || "";

/* ---------------- rendering helpers ---------------- */

function cellCard(cell) {
  const name = courseName(cell);
  const facs = (cell.faculty || []).map(facName).join(", ");
  let sub = [];
  if (cell.room) sub.push(`Room ${esc(cell.room)}`);
  if (facs) sub.push(esc(facs));
  const badges = [];
  if (cell.type === "T") badges.push(`<span class="badge type-T">Tutorial</span>`);
  if (cell.type === "SP") badges.push(`<span class="badge type-SP">Seminar Paper</span>`);
  if (!cell.type || cell.type === "L") badges.push(`<span class="badge">Lecture</span>`);
  let options = "";
  if (cell.options) {
    options = cell.options.map((o) =>
      `<div class="option-line">${esc(o.group)} · Room ${esc(o.room)}${o.faculty?.length ? " · " + esc(o.faculty.map(facName).join(", ")) : ""}</div>`
    ).join("");
  }
  return { name, sub: sub.join('<span class="dot">·</span>'), badges: badges.join(""), options };
}

function markControls(pid, period, now) {
  const dk = dateKey(now);
  const marks = marksFor(RECORDS, state.section, now);
  const rec = marks[pid];
  const st = windowState(period, now);
  if (rec) {
    const label = rec.status === "present" ? "Present" : "Absent";
    return `<span class="pill ${rec.status}">${label}</span><button class="btn ghost" data-undo="${pid}">Undo</button>`;
  }
  if (st === "open") {
    return `<button class="btn present" data-present="${pid}">Mark present</button><button class="btn absent" data-absent="${pid}">Mark absent</button>`;
  }
  return "";
}

/* ---------------- Today ---------------- */

function renderToday() {
  const now = new Date();
  let day = resolvedDayKey(now);
  // Dev preview (?dev=1): on a weekend, show Monday so the marking UI is visible.
  if (IS_DEV && !DAYS.includes(day)) day = "Mon";
  $("#todayLabel").textContent = `${DAY_LABEL[day] || day}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  const sec = sectionData();
  const row = DAYS.includes(day) ? (sec.days[day] || {}) : {};
  const entries = Object.entries(row).sort((a, b) => periodOf(a[0]).start.localeCompare(periodOf(b[0]).start));

  const nx = nextClass(sec, DATA.periods, now);
  let hero;
  if (nx) {
    const first = nx.cells[0];
    hero = `<div class="hero">
      <img class="hero-mark" src="icons/3d/today.png" alt="" />
      <div class="hero-copy">
        <div class="eyebrow">Next class</div>
        <div class="hero-code">${esc(first.code)} · ${esc(courseName(first))}</div>
        <div class="hero-meta">
          <span>${esc(nx.period.start)}–${esc(nx.period.end)}</span>
          ${first.room ? `<span>Room ${esc(first.room)}</span>` : ""}
          ${first.faculty?.length ? `<span>${esc(first.faculty.map(facName).join(", "))}</span>` : ""}
        </div>
      </div>
    </div>`;
  } else if (!entries.length) {
    hero = `<div class="hero gone">
      <img class="hero-mark" src="icons/3d/empty.png" alt="" />
      <div class="hero-copy">
        <div class="eyebrow">Today</div>
        <div class="hero-name">No classes scheduled</div>
        <div class="hero-meta">${DAYS.includes(day) ? "Enjoy the free day." : "It's the weekend."}</div>
      </div>
    </div>`;
  } else {
    hero = `<div class="hero gone">
      <img class="hero-mark" src="icons/3d/empty.png" alt="" />
      <div class="hero-copy">
        <div class="eyebrow">Today</div>
        <div class="hero-name">All classes done</div>
        <div class="hero-meta">${entries.length} class${entries.length > 1 ? "es" : ""} wrapped up.</div>
      </div>
    </div>`;
  }

  const list = entries.map(([pid, cells]) => {
    const p = periodOf(pid);
    const prog = periodProgress(p, now);
    const first = cells[0];
    const info = cellCard(first);
    const extra = cells.length > 1
      ? cells.slice(1).map((c) => `<div class="class-sub" style="margin-top:8px">${esc(c.code)} · ${esc(courseName(c))}${c.room ? " · Room " + esc(c.room) : ""}</div>`).join("")
      : "";
    const actions = markControls(pid, p, now);
    const phase = prog.phase === "live" ? "live" : prog.phase === "past" ? "past" : "";
    const wash = prog.phase === "live" ? ` style="--left:${Math.round(prog.left * 100)}%"` : "";
    return `<div class="class-card ${phase}"${wash}>
      <div class="timecol">
        <div class="t-start">${esc(p.start)}</div>
        <div class="bar"></div>
        <div class="t-end">${esc(p.end)}</div>
      </div>
      <div class="class-body">
        <div class="class-code">${esc(first.code)}</div>
        <div class="class-name" data-detail="${pid}">${esc(info.name)}</div>
        ${info.sub ? `<div class="class-sub">${info.sub}</div>` : ""}
        ${info.options}
        ${extra}
        <div class="badges">${info.badges}</div>
      </div>
      ${actions ? `<div class="actions">${actions}</div>` : ""}
    </div>`;
  }).join("");

  $("#view-today").innerHTML = hero + (entries.length ? `<div class="section-title">Today's schedule</div>${list}` : "");
}

/* ---------------- Week ---------------- */

const SUBJECT_TINT = {
  "Alternative Dispute Resolution": 0, "Civil Procedure Code": 1, "Economics III": 2,
  "Elective (ENG / ECO / POL / HIST / SOC)": 3, "English I": 4, "History I": 5, "History III": 6,
  "Jurisprudence": 7, "Legal Methods": 8, "Paper 503 (CL)": 9, "Paper 504 (FL)": 10,
  "Paper 506 (PL)": 11, "Paper 902 (MED)": 12, "Political Science I": 13, "Political Science III": 14,
  "Seminar Paper": 15, "Seminar Paper (Specialization)": 16, "Sociology I": 17, "Sociology III": 18,
  "Special Contracts": 19, "Specialization Paper": 20, "Taxation": 21, "Torts": 22,
};
function subjectTint(name) {
  if (SUBJECT_TINT[name] != null) return SUBJECT_TINT[name];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i) * (i + 1)) % 23;
  return h;
}

function minsOf(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function hourLabel(mins) {
  const h = Math.floor(mins / 60);
  const hr = h % 12 || 12;
  return `${hr} ${h >= 12 ? "PM" : "AM"}`;
}

// Next N Saturdays from today (today included when it is Saturday).
function upcomingSaturdays(n = 8) {
  const out = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  for (let i = 0; i < n; i++, d.setDate(d.getDate() + 7)) out.push(new Date(d));
  return out;
}

function renderWeek() {
  const sec = sectionData();
  const now = new Date();
  const today = dateKey(now);
  const q = state.query.trim().toLowerCase();
  const startM = 9 * 60;
  const endM = 17 * 60 + 30;
  const span = endM - startM;
  const pct = (m) => ((m - startM) / span) * 100;
  const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = mon.getDay();
  mon.setDate(mon.getDate() + (dow === 0 ? -6 : 1 - dow));

  const weekDays = DAYS.map((day, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return { key: day, date: d, schedule: day };
  });
  const satDate = new Date(mon);
  satDate.setDate(mon.getDate() + 5);
  const satFollows = state.saturdays[dateKey(satDate)];
  if (satFollows) weekDays.push({ key: "Sat", date: satDate, schedule: satFollows });
  const nCols = weekDays.length;

  const heads = weekDays.map(({ key, date }) =>
    `<div class="wg-day ${dateKey(date) === today ? "today" : ""}"><span>${key}</span><b>${date.getDate()}</b></div>`
  ).join("");

  const hours = [];
  for (let m = startM; m <= endM; m += 60) hours.push(m);
  const hourMarks = hours.map((m) => `<span style="top:${pct(m)}%">${hourLabel(m)}</span>`).join("");
  const lines = hours.map((m) => `<i style="top:${pct(m)}%"></i>`).join("");

  const cols = weekDays.map(({ date, schedule }) => {
    const row = sec.days[schedule] || {};
    const blocks = Object.entries(row).flatMap(([pid, cells]) => {
      const p = periodOf(pid);
      const matched = cells.filter((c) => {
        if (!q) return true;
        return [c.code, courseName(c), c.room, c.title, ...(c.faculty || []).map(facName), ...((c.options || []).map((o) => o.group))]
          .join(" ").toLowerCase().includes(q);
      });
      return matched.map((c, i) => {
        const top = pct(minsOf(p.start));
        const height = ((minsOf(p.end) - minsOf(p.start)) / span) * 100;
        const width = 100 / matched.length;
        const room = c.room ? `Rm ${c.room}` : (c.options?.length ? c.options.map((o) => o.group).slice(0, 2).join(" · ") : "");
        const tint = subjectTint(courseName(c));
        return `<button class="wg-ev wg-c${tint}" data-wdate="${dateKey(date)}" data-wpid="${pid}" style="top:${top}%;height:${height}%;left:calc(${i * width}% + 3px);width:calc(${width}% - 6px)">
          <b>${esc(courseName(c))}</b>
          <small>${esc(p.start)}–${esc(p.end)}${room ? " · " + esc(room) : ""}</small>
        </button>`;
      });
    }).join("");
    return `<div class="wg-col ${dateKey(date) === today ? "today" : ""}">${blocks}</div>`;
  }).join("");

  const nowM = now.getHours() * 60 + now.getMinutes();
  const showNow = weekDays.some(({ date }) => dateKey(date) === today) && nowM >= startM && nowM <= endM;
  const nowLine = showNow ? `<div class="wg-now" style="top:${pct(nowM)}%"></div>` : "";

  const satPanel = `<div class="section-title">Working Saturdays</div>
    <div class="sat-panel">${upcomingSaturdays().map((d) => {
      const k = dateKey(d);
      const val = state.saturdays[k] || "";
      const opts = ["", ...DAYS].map((v) => `<option value="${v}" ${val === v ? "selected" : ""}>${v ? DAY_LABEL[v] : "Holiday"}</option>`).join("");
      return `<label class="sat-row"><span>${d.getDate()} ${MONTHS[d.getMonth()]}</span><select data-sat-date="${k}">${opts}</select></label>`;
    }).join("")}</div>`;

  $("#view-week").innerHTML =
    `<input class="search" id="searchInput" placeholder="Search course, faculty, room…" value="${esc(state.query)}" />
     <div class="section-title">${esc(sec.label)} · Week</div>
     <div class="week-scroll"><div class="week-grid" style="min-width:${52 + nCols * 130}px">
       <div class="wg-head" style="grid-template-columns:52px repeat(${nCols}, 1fr)"><div></div>${heads}</div>
       <div class="wg-body">
         <div class="wg-hours">${hourMarks}</div>
         <div class="wg-cols" style="grid-template-columns:repeat(${nCols}, 1fr)"><div class="wg-lines">${lines}</div>${nowLine}${cols}</div>
       </div>
     </div></div>
     ${satPanel}`;
}

/* ---------------- Attendance ---------------- */

function ringColor(p) { return p >= 75 ? "var(--ok)" : p >= 50 ? "var(--soon)" : "var(--no)"; }

function renderAttendance() {
  const sec = sectionData();
  const stats = computeStats(RECORDS, state.section, sec);
  const p = stats.percent ?? 0;
  const rows = stats.per.length ? stats.per.map((r) => {
    const cp = coursePercent(r) ?? 0;
    return `<div class="course-row" data-course="${esc(r.code)}" data-course-name="${esc(r.name)}">
      <div class="cr-main">
        <div class="cr-name">${esc(r.name)}</div>
        <div class="cr-code">${esc(r.code)} · ${r.present} present · ${r.absent} absent</div>
        <div class="track"><i style="width:${cp}%;background:${ringColor(cp)}"></i></div>
      </div>
      <div class="cr-pct" style="color:${ringColor(cp)}">${cp}%</div>
    </div>`;
  }).join("") : `<div class="empty"><img class="empty-mark" src="icons/3d/empty.png" alt="" /><p>No attendance recorded yet.<br>Mark your classes from the Today tab.</p></div>`;

  $("#view-att").innerHTML = `
    <div class="att-top">
      <div class="ring" style="--p:${p}"><span class="val">${stats.percent == null ? "–" : stats.percent + "%"}</span></div>
      <div class="att-summary">
        <div class="big">${esc(sec.label)}</div>
        <div class="row"><b>${stats.present}</b> present · <b>${stats.absent}</b> absent</div>
        <div class="row">${stats.total} classes marked</div>
        <div class="row" style="margin-top:4px">Overall attendance</div>
      </div>
    </div>
    <div class="section-title">By course</div>${rows}
    <div class="toolbar">
      <button class="btn" id="exportBtn">Export backup</button>
      <button class="btn" id="excelBtn">Export Excel</button>
      <button class="btn" id="importBtn">Import backup</button>
      <button class="btn ghost" id="resetBtn">Reset</button>
      <input type="file" id="importFile" accept="application/json" class="hidden" />
    </div>
    <p class="note">Attendance is stored privately on this device (localStorage). Export a backup file regularly so it survives clearing your browser data or switching phones. Present + absent are counted; unmarked classes are ignored, so a forgotten mark never counts against you.</p>`;
}

/* ---------------- section picker / detail ---------------- */

function openSectionSheet() {
  const items = Object.entries(DATA.sections).map(([key, s]) => {
    const n = DAYS.reduce((a, d) => a + Object.keys(s.days[d] || {}).length, 0);
    return `<button class="opt ${key === state.section ? "sel" : ""}" data-section="${key}">
      <span>${esc(s.label)}</span><small>${n} classes/wk</small></button>`;
  }).join("");
  showSheet(`<div class="grabber"></div><h3>Choose your semester &amp; section</h3>${items}`);
}

function openDetail(pid, date = new Date()) {
  const now = new Date();
  const day = resolvedDayKey(date);
  const cells = (sectionData().days[day] || {})[pid] || [];
  if (!cells.length) return;
  const p = periodOf(pid);
  const marks = marksFor(RECORDS, state.section, date);
  const body = cells.map((c) => {
    const info = cellCard(c);
    const rows = [
      ["Paper", `${c.code} — ${info.name}`],
      c.title ? ["Code", c.title] : null,
      ["Type", c.type === "T" ? "Tutorial" : c.type === "SP" ? "Seminar Paper" : "Lecture"],
      c.room ? ["Room", c.room] : null,
      c.faculty?.length ? ["Faculty", c.faculty.map(facName).join(", ")] : null,
      c.options?.length ? ["Options", c.options.map((o) => `${o.group} → Room ${o.room}${o.faculty?.length ? " (" + o.faculty.map(facName).join(", ") + ")" : ""}`).join("<br>")] : null,
    ].filter(Boolean).map(([k, v]) => `<div class="detail-row"><span class="k">${esc(k)}</span><span class="v">${esc(v).replace(/&lt;br&gt;/g, "<br>")}</span></div>`).join("");
    return rows;
  }).join("");
  const mark = dateKey(date) === dateKey(now) ? marks[pid] : null;
  showSheet(`<div class="grabber"></div>
    <h3>${esc(p.start)}–${esc(p.end)}</h3>${body}
    ${mark ? `<div class="detail-row"><span class="k">Attendance</span><span class="v">${mark.status === "present" ? "Present" : "Absent"}</span></div>` : ""}`);
}

function openCourseHistory(code, name) {
  const hist = courseHistory(RECORDS, state.section, sectionData());
  const list = hist[code];
  if (!list) return;
  const present = list.filter((h) => h.status === "present").length;
  const absent = list.length - present;
  const items = list.map((h) => {
    const [, m, d] = h.dk.split("-").map(Number);
    const t = periodOf(h.pid);
    const time = t ? `${t.start}–${t.end}` : "";
    return `<div class="hist-item">
      <span class="hist-date">${d} ${MONTHS[m - 1]}</span>
      <span class="hist-slot">${h.day} ${time ? "· " + time : ""}</span>
      <span class="pill ${h.status}">${h.status === "present" ? "Present" : "Absent"}</span>
    </div>`;
  }).join("");
  showSheet(`<div class="grabber"></div>
    <h3>${esc(name)}</h3>
    <div class="hist-head">${present} present · ${absent} absent · ${list.length} class${list.length === 1 ? "" : "es"}</div>
    ${items}`);
}

function showSheet(html) {
  const ov = document.createElement("div");
  ov.className = "overlay";
  ov.innerHTML = `<div class="sheet">${html}</div>`;
  ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
  return ov;
}

/* ---------------- navigation + wiring ---------------- */

function switchView(view) {
  state.view = view;
  for (const v of ["today", "week", "att"]) {
    $(`#view-${v}`).classList.toggle("hidden", v !== view);
  }
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === view));
  if (view === "week") renderWeek();
  if (view === "att") renderAttendance();
  if (view === "today") renderToday();
}

function applySection(key) {
  state.section = key;
  localStorage.setItem("nluja.section", key);
  $("#sectionBtn").textContent = DATA.sections[key].label;
  switchView(state.view);
}

function setSaturday(dateK, day) {
  if (DAYS.includes(day)) state.saturdays[dateK] = day;
  else delete state.saturdays[dateK];
  localStorage.setItem("nluja.saturdays", JSON.stringify(state.saturdays));
  setSaturdayRules(state.saturdays);
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-view],[data-present],[data-absent],[data-undo],[data-section],[data-detail],[data-course],[data-wpid]");
  if (!t) return;
  if (t.dataset.view) return switchView(t.dataset.view);
  const now = new Date();
  const dk = dateKey(now);
  if (t.dataset.present || t.dataset.absent) {
    const status = t.dataset.present ? "present" : "absent";
    RECORDS = setMark(RECORDS, state.section, dk, t.dataset.present || t.dataset.absent, status, resolvedDayKey(now));
    t.classList.add("just-" + status); // plays the pop animation
    setTimeout(() => renderToday(), 360);
  }
  else if (t.dataset.undo) { RECORDS = clearMark(RECORDS, state.section, dk, t.dataset.undo); renderToday(); }
  else if (t.dataset.section) { applySection(t.dataset.section); document.querySelector(".overlay")?.remove(); }
  else if (t.dataset.detail) openDetail(t.dataset.detail);
  else if (t.dataset.wpid) openDetail(t.dataset.wpid, new Date(t.dataset.wdate + "T12:00:00"));
  else if (t.dataset.course) openCourseHistory(t.dataset.course, t.dataset.courseName);
});

$("#sectionBtn").addEventListener("click", openSectionSheet);

$("#themeBtn").addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  setTheme(next);
});

$("#view-att").addEventListener("click", async (e) => {
  if (e.target.id === "exportBtn") {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(exportBlob(RECORDS));
    a.download = `nluja-attendance-${dateKey(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  } else if (e.target.id === "excelBtn") {
    const csv = csvReport(RECORDS, state.section, sectionData());
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `nluja-attendance-${dateKey(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  } else if (e.target.id === "importBtn") {
    $("#importFile")?.click();
  } else if (e.target.id === "resetBtn") {
    if (confirm("Delete ALL attendance records on this device? This cannot be undone. Export a backup first if unsure.")) {
      RECORDS = { version: 1, records: {} };
      localStorage.removeItem("nluja.attendance.v1");
      renderAttendance();
    }
  }
});

$("#view-att").addEventListener("change", async (e) => {
  if (e.target.id === "importFile" && e.target.files[0]) {
    try { RECORDS = await importFile(e.target.files[0]); renderAttendance(); alert("Backup imported."); }
    catch (err) { alert("Could not import: " + err.message); }
  }
});

$("#view-week").addEventListener("input", (e) => {
  if (e.target.id === "searchInput") {
    state.query = e.target.value;
    const pos = e.target.selectionStart;
    renderWeek();
    const el = $("#searchInput");
    el.focus(); el.setSelectionRange(pos, pos);
  }
});

$("#view-week").addEventListener("change", (e) => {
  if (e.target.dataset.satDate !== undefined) {
    setSaturday(e.target.dataset.satDate, e.target.value);
    if (state.view === "today") renderToday();
  }
});

function setTheme(mode) {
  document.documentElement.setAttribute("data-theme", mode);
  localStorage.setItem("nluja.theme", mode);
  const img = document.querySelector("#themeBtn img");
  const btn = document.getElementById("themeBtn");
  if (img) img.src = mode === "dark" ? "icons/3d/sun.png" : "icons/3d/moon.png";
  if (btn) btn.setAttribute("aria-label", mode === "dark" ? "Switch to light theme" : "Switch to dark theme");
}

/* ---------------- boot ---------------- */

async function boot() {
  const [tt, courses, faculty] = await Promise.all([
    fetch("data/timetable.json").then((r) => r.json()),
    fetch("data/courses.json").then((r) => r.json()),
    fetch("data/faculty.json").then((r) => r.json()),
  ]);
  DATA = tt;
  DATA.courses = courses.courses;
  DATA.faculty = faculty.faculty;

  const saved = localStorage.getItem("nluja.section");
  state.section = DATA.sections[saved] ? saved : "III";
  try { state.saturdays = JSON.parse(localStorage.getItem("nluja.saturdays")) || {}; } catch { state.saturdays = {}; }
  setSaturdayRules(state.saturdays);
  $("#sectionBtn").textContent = DATA.sections[state.section].label;

  setTheme(localStorage.getItem("nluja.theme") || "light");

  switchView("today");
  if (IS_DEV) {
    const b = document.createElement("div");
    b.textContent = "DEV MODE · marking always open";
    b.style.cssText = "position:fixed;bottom:82px;left:50%;transform:translateX(-50%);background:#111;color:#fbca1f;font:700 11px/1 system-ui;padding:6px 10px;border-radius:999px;z-index:50;opacity:.92;pointer-events:none";
    document.body.appendChild(b);
  }
  setInterval(() => { if (state.view === "today") renderToday(); }, 30000);

  // Skip the service worker while developing locally so edits show on refresh.
  // On a real host, unregister any stale SW and register for offline support.
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  if ("serviceWorker" in navigator) {
    if (isLocal) {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    } else {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }
  const isStandalone = () => navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
  const isIOS = /iP(hone|od|ad)/.test(navigator.platform) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); deferredInstall = e;
    $("#installBtn").classList.remove("hidden");
  });
  // iOS Safari has no install prompt — show the manual Add to Home Screen steps.
  if (isIOS && !isStandalone()) {
    $("#installBtn").textContent = "Add to Home Screen";
    $("#installBtn").classList.remove("hidden");
  }
  $("#installBtn").addEventListener("click", async () => {
    if (!deferredInstall) {
      if (isIOS) showSheet(`<div class="grabber"></div><h3>Add to Home Screen</h3><p>Tap the <b>Share</b> button in Safari, then choose <b>Add to Home Screen</b>.</p>`);
      return;
    }
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    $("#installBtn").classList.add("hidden");
  });
}

boot();
