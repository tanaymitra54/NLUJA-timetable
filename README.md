# NLUJA Timetable

An offline-first, installable web app (PWA) for the **National Law University and Judicial Academy, Assam** odd-semester timetable (Academic Year 2026–27), with personal attendance tracking.

Pick your semester once → see today at a glance → **Add to Home Screen** → works with no internet.

## Features

- **All semesters** — I Year (Sections A & B), III, V, VII, IX. Choice is remembered.
- **Today view** — next class with a live countdown, current class highlighted, room + faculty names resolved from the legend.
- **Week view** — the full Mon–Fri grid as clean day cards, with instant search across course, faculty, room and specialization.
- **Attendance tracking** — mark **Present / Absent** for a class only during that day (window opens at class start, closes at midnight). Live percentages per course and overall.
- **Private & offline** — attendance lives in `localStorage`; a service worker caches the whole app. No accounts, no server, no tracking.
- **Backup** — export/import a JSON file so your attendance survives a device change.
- **Dark / light**, installable on Android, iOS and desktop, designed mobile-first.

## Run locally

Any static file server works (the app fetches JSON over `http`):

```bash
python3 -m http.server 8765
# open http://localhost:8765
```

## Test

```bash
npm test        # attendance logic assertions + timetable-data invariants
```

## Deploy for free

Static hosting — pick one:

| Host | How |
|------|-----|
| **Cloudflare Pages** | Connect the GitHub repo, build command: none, output dir: `/` |
| **Netlify** | Drag-and-drop the folder, or connect the repo |
| **GitHub Pages** | Settings → Pages → Deploy from branch → `main` / root |
| **Vercel** | Import repo, framework preset: Other, no build |

The app uses relative paths, so it works from a subpath (e.g. `user.github.io/nitika-time-table/`).

## Project structure

```
index.html              app shell
styles.css              design system + all styling
js/app.js               views, rendering, wiring
js/attendance.js        pure attendance/window logic (unit-tested)
js/store.js             localStorage adapter (swap for a DB here)
data/timetable.json     the timetable for all six tracks
data/courses.json       paper-code → name
data/faculty.json       initials → full name
manifest.webmanifest    PWA manifest
sw.js                   offline service worker
icons/                  generated app icons
tools/                  one-time build/verify scripts (not shipped)
```

## Attendance rules

- A class can be marked only from its **start time until 23:59 the same day**.
- `Present` and `Absent` are both counted; a **forgotten / unmarked** class is never counted against you.
- Overall % = `present / (present + absent)`.
- Records are stored per section (`I-A`, `III`, …) so switching semesters never loses data.

## Notes on the source data

The timetable is extracted from the official PDF by cell coordinates (`tools/normalize.py`), then verified (`tools/verify_data.py`). V/VII/IX papers are specialization/elective courses shown with all stream options (CN, CR, BL, IL, IP, and ENG/ECO/POL/HIST/SOC) exactly as printed. TU = tutorial, SP = seminar paper.

Regenerate the data (requires the source PDF + `pymupdf`):

```bash
python3 tools/normalize.py && python3 tools/verify_data.py
```
