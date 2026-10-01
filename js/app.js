import {
  dateKey, dayKey, windowState, nextClass,
  marksFor, computeStats, coursePercent,
} from "./attendance.js";
import { load as loadStore, setMark, clearMark, exportBlob, importFile } from "./store.js";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const DAY_LABEL = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let DATA = null;
const state = { section: "III", view: "today", query: "" };
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
  const day = dayKey(now);
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
    const isNow = windowState(p, now) === "open";
    const first = cells[0];
    const info = cellCard(first);
    const extra = cells.length > 1
      ? cells.slice(1).map((c) => `<div class="class-sub" style="margin-top:8px">${esc(c.code)} · ${esc(courseName(c))}${c.room ? " · Room " + esc(c.room) : ""}</div>`).join("")
      : "";
    return `<div class="class-card ${isNow ? "now" : ""}">
      <div class="timecol">
        <div class="t-start">${esc(p.start)}</div>
        <div class="t-end">${esc(p.end)}</div>
        <div class="bar"></div>
      </div>
      <div class="class-body">
        <div class="class-code">${esc(first.code)}</div>
        <div class="class-name" data-detail="${pid}">${esc(info.name)}</div>
        ${info.sub ? `<div class="class-sub">${info.sub}</div>` : ""}
        ${info.options}
        ${extra}
        <div class="badges">${info.badges}</div>
        <div class="actions">${markControls(pid, p, now)}</div>
      </div>
    </div>`;
  }).join("");

  $("#view-today").innerHTML = hero + (entries.length ? `<div class="section-title">Today's schedule</div>${list}` : "");
}

/* ---------------- Week ---------------- */

function renderWeek() {
  const sec = sectionData();
  const now = new Date();
  const today = dayKey(now);
  const q = state.query.trim().toLowerCase();
  const blocks = DAYS.map((day) => {
    const row = sec.days[day] || {};
    let entries = Object.entries(row).sort((a, b) => periodOf(a[0]).start.localeCompare(periodOf(b[0]).start));
    if (q) {
      entries = entries.filter(([pid, cells]) =>
        cells.some((c) =>
          [c.code, courseName(c), c.room, c.title, ...(c.faculty || []).map(facName), ...((c.options || []).map((o) => o.group))]
            .join(" ").toLowerCase().includes(q)
        )
      );
    }
    const cards = entries.map(([pid, cells]) => cells.map((c) => {
      const p = periodOf(pid);
      const info = cellCard(c);
      return `<div class="class-card">
        <div class="timecol"><div class="t-start">${esc(p.start)}</div><div class="t-end">${esc(p.end)}</div></div>
        <div class="class-body">
          <div class="class-code">${esc(c.code)}</div>
          <div class="class-name">${esc(info.name)}</div>
          ${info.sub ? `<div class="class-sub">${info.sub}</div>` : ""}
          ${info.options}
          <div class="badges">${info.badges}</div>
        </div>
      </div>`;
    }).join("")).join("");
    return `<div class="day-block ${day === today ? "today" : ""}">
      <div class="day-head"><span class="d-name">${DAY_LABEL[day]}</span><span class="d-count">${entries.length} class${entries.length === 1 ? "" : "es"}</span></div>
      ${entries.length ? cards : `<div class="free">No classes</div>`}
    </div>`;
  }).join("");
  $("#view-week").innerHTML =
    `<input class="search" id="searchInput" placeholder="Search course, faculty, room…" value="${esc(state.query)}" />
     <div class="section-title">${esc(sec.label)} · Full week</div>${blocks}`;
}

/* ---------------- Attendance ---------------- */

function ringColor(p) { return p >= 75 ? "var(--ok)" : p >= 50 ? "var(--soon)" : "var(--no)"; }

function renderAttendance() {
  const sec = sectionData();
  const stats = computeStats(RECORDS, state.section, sec);
  const p = stats.percent ?? 0;
  const rows = stats.per.length ? stats.per.map((r) => {
    const cp = coursePercent(r) ?? 0;
    return `<div class="course-row">
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

function openDetail(pid) {
  const now = new Date();
  const day = dayKey(now);
  const cells = (sectionData().days[day] || {})[pid] || [];
  if (!cells.length) return;
  const p = periodOf(pid);
  const marks = marksFor(RECORDS, state.section, now);
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
  const mark = marks[pid];
  showSheet(`<div class="grabber"></div>
    <h3>${esc(p.start)}–${esc(p.end)}</h3>${body}
    ${mark ? `<div class="detail-row"><span class="k">Attendance</span><span class="v">${mark.status === "present" ? "Present" : "Absent"}</span></div>` : ""}`);
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

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-view],[data-present],[data-absent],[data-undo],[data-section],[data-detail]");
  if (!t) return;
  if (t.dataset.view) return switchView(t.dataset.view);
  const now = new Date();
  const dk = dateKey(now);
  if (t.dataset.present) { RECORDS = setMark(RECORDS, state.section, dk, t.dataset.present, "present"); renderToday(); }
  else if (t.dataset.absent) { RECORDS = setMark(RECORDS, state.section, dk, t.dataset.absent, "absent"); renderToday(); }
  else if (t.dataset.undo) { RECORDS = clearMark(RECORDS, state.section, dk, t.dataset.undo); renderToday(); }
  else if (t.dataset.section) { applySection(t.dataset.section); document.querySelector(".overlay")?.remove(); }
  else if (t.dataset.detail) openDetail(t.dataset.detail);
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
  $("#sectionBtn").textContent = DATA.sections[state.section].label;

  const savedTheme = localStorage.getItem("nluja.theme");
  setTheme(savedTheme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

  switchView("today");
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
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); deferredInstall = e;
    $("#installBtn").classList.remove("hidden");
  });
  $("#installBtn").addEventListener("click", async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    $("#installBtn").classList.add("hidden");
  });
}

boot();
