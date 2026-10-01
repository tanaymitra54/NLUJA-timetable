#!/usr/bin/env python3
"""One-time build tool: PDF -> data/timetable.json + data/courses.json + data/faculty.json.

Not shipped with the app. Reads the source PDF by cell coordinates (the Google-Docs
table has extractable geometry), normalizes the messy wrapped text, and emits JSON.
Run: python3 tools/normalize.py
"""
import fitz, json, re, os

PDF = "Time_Table_UG_Odd_Sem_2026-2027_10_Aug.docx.pdf"
OUT = os.path.join(os.path.dirname(__file__), "..", "data")

FAC = set("DB DP KJ KG TT HRN SC MG AM SK ADH PPS NG DD UD SHK PC NS IB KAG AC MB DS SD SYS ABC AB AD SI RV SR SN MR ST MN".split())
GROUPS = set("ENG ECO POL HIST SOC CN BL CR IL IP".split())

COL_PERIOD = {1: "p1", 2: "p2", 3: "p3", 5: "p4", 6: "p5", 8: "p6", 9: "p7", 10: "p8"}
# (page_index_zero_based, band_top_y) -> (day, track)
BANDS = {
    (0, 200): ("Mon", "I-A"), (0, 284): ("Mon", "I-B"), (0, 346): ("Mon", "III"), (0, 414): ("Mon", "V"),
    (1, 70): ("Mon", "VII"), (1, 186): ("Mon", "IX"),
    (2, 160): ("Tue", "I-A"), (2, 278): ("Tue", "I-B"), (2, 350): ("Tue", "III"), (2, 416): ("Tue", "V"),
    (3, 70): ("Tue", "VII"), (3, 200): ("Tue", "IX"),
    (4, 144): ("Wed", "I-A"), (4, 222): ("Wed", "I-B"), (4, 290): ("Wed", "III"), (4, 362): ("Wed", "V"), (4, 444): ("Wed", "VII"),
    (5, 70): ("Wed", "VII"), (5, 104): ("Wed", "IX"),
    (6, 175): ("Thu", "I-A"), (6, 268): ("Thu", "I-B"), (6, 322): ("Thu", "III"), (6, 382): ("Thu", "V"), (6, 459): ("Thu", "VII"),
    (7, 70): ("Thu", "VII"), (7, 138): ("Thu", "IX"),
    (8, 167): ("Fri", "I-A"), (8, 253): ("Fri", "I-B"), (8, 307): ("Fri", "III"), (8, 371): ("Fri", "V"), (8, 467): ("Fri", "VII"),
    (9, 70): ("Fri", "VII"), (9, 128): ("Fri", "IX"),
}


def cluster(vals, tol=8):
    vals = sorted(vals); out = []
    for v in vals:
        if out and v - out[-1][-1] <= tol:
            out[-1].append(v)
        else:
            out.append([v])
    return [sum(g) / len(g) for g in out]


def extract_grid():
    doc = fitz.open(PDF)
    grid = {}
    for (pno, by), (day, track) in BANDS.items():
        p = doc[pno]
        vx = cluster([(it["rect"].x0 + it["rect"].x1) / 2 for it in p.get_drawings() if it["rect"].width < 2])
        hy = cluster([(it["rect"].y0 + it["rect"].y1) / 2 for it in p.get_drawings() if it["rect"].height < 2])
        y1 = min([h for h in hy if h > by + 5], default=by + 70)
        words = p.get_text("words")
        cells = {c: [] for c in range(len(vx) - 1)}
        for w in words:
            x0, yy0, x1, yy1, txt = w[0], w[1], w[2], w[3], w[4]
            yc = (yy0 + yy1) / 2; xc = (x0 + x1) / 2
            if by <= yc < y1:
                for c in range(len(vx) - 1):
                    if vx[c] <= xc < vx[c + 1]:
                        cells[c].append((round(yy0), round(x0), txt)); break
        g = grid.setdefault((day, track), {})
        for c, per in COL_PERIOD.items():
            if cells[c]:
                s = " ".join(t for _, _, t in sorted(cells[c]))
                g[per] = (g.get(per, "") + " " + s).strip()
    return grid


def clean(s):
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"(\d)\.\s+(\d)", r"\1.\2", s)  # "1. 6" -> "1.6"
    prev = None
    while prev != s:  # wrapped digits: "3 14" -> "314"
        prev = s; s = re.sub(r"(\d)\s+(\d)", r"\1\2", s)
    # merge single-capital letter splits: "A C"->"AC", "D P"->"DP", "S Y S"->"SYS"
    prev = None
    while prev != s:
        prev = s; s = re.sub(r"\b([A-Z]) (?=[A-Z]\b)", r"\1", s)
    # rejoin split stream names ("P OL"->"POL", "HI ST"->"HIST") only when valid
    s = re.sub(r"\b[A-Z]{1,5}(?: [A-Z]{1,5})+\b",
               lambda m: m.group(0) if m.group(0).replace(" ", "") not in GROUPS else m.group(0).replace(" ", ""), s)
    # known garbles from line-wrap (must run before the tail-letter rule below)
    s = s.replace("BL(313)I(314)IL", "BL(313)/IL(314)")
    s = s.replace("BL(313)/I(314)L", "BL(313)/IL(314)")
    s = s.replace("I(314)L/IP", "IL(314)/IP")
    s = re.sub(r"\(\s*([^)]*?)\s*\)", lambda m: "(" + re.sub(r"\s+", "", m.group(1)) + ")", s)
    # wrapped tail letters before a room: "(411)IL" -> "IL(411)"
    s = re.sub(r"\((\d+)\)([A-Z]{2})\b", r"\2(\1)", s)
    s = re.sub(r"\s*/\s*", "/", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def split_entries(s):
    pat = re.compile(r"(?:VII|IX|V|III|I)\s*SEM")
    idx = [m.start() for m in pat.finditer(s)]
    if not idx or idx[0] != 0:
        idx = [0] + idx
    merged = []
    for a, b in zip(idx, idx[1:] + [len(s)]):
        if b > a:
            merged.append(s[a:b].strip())
    return [p for p in merged if p] or [s]


def parse_basic(s):
    typ = "L"
    if "(T)" in s:
        typ = "T"; s = s.replace("(T)", " ")
    s = clean(s)
    rooms = re.findall(r"\((\d+)\)", s); room = rooms[-1] if rooms else None
    s = re.sub(r"\(\d+\)", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    m = re.match(r"^(\d+\.\d+)\s+(.*)$", s)
    if not m:
        return {"raw": s, "type": typ}
    code, rest = m.group(1), m.group(2).strip()
    fac, title = [], rest
    parts = re.split(r"(?:\s+-|-\s+)", rest)
    if len(parts) >= 2:
        toks = smart_fac(parts[-1].replace(" ", "").split("/"))
        if toks and all(t in FAC for t in toks):
            fac = toks
            title = " ".join(parts[:-1]).strip()
    title = re.sub(r"\s+", " ", title).strip(" -") or None
    return {"raw": rest, "code": code, "title": title, "type": typ, "room": room, "faculty": fac}


def smart_fac(tokens):
    """Merge fragments like ['RV','AM','SY','S'] -> ['RV','AM','SYS']."""
    out = []; i = 0
    while i < len(tokens):
        t = tokens[i]
        if t in FAC:
            out.append(t); i += 1; continue
        merged = t; j = i + 1
        while j < len(tokens) and merged not in FAC and len(merged) < 4:
            merged += tokens[j]; j += 1
        if merged in FAC:
            out.append(merged); i = j
        else:
            i += 1
    return out


def parse_sem(s):
    typ = "L"
    if "(SP)" in s:
        typ = "SP"; s = s.replace("(SP)", " ")
    if "(T)" in s:
        typ = "T"; s = s.replace("(T)", " ")
    s = clean(s)
    m = re.search(r"SEM\s*:?\s*(\d+)", s)
    if not m:
        return {"raw": s, "type": typ}
    code = m.group(1)
    rest = s[m.end():].strip()
    options, rooms, last_group_end = [], [], 0
    for mm in re.finditer(r"([A-Za-z]*)\s*\((\d+)\)", rest):
        w, r = mm.group(1), mm.group(2)
        if w in GROUPS:
            options.append({"group": w, "room": r, "faculty": []})
            last_group_end = mm.end()
        else:
            rooms.append(r)
    tail = rest[last_group_end:]
    tail_fac = smart_fac([t for t in re.findall(r"[A-Z]+", tail) if len(t) >= 1])
    tail_fac = [f for f in tail_fac if f in FAC]
    if options:
        if len(tail_fac) == len(options):
            for o, f in zip(options, tail_fac):
                o["faculty"] = [f]
        elif len(options) == 1 and tail_fac:
            options[0]["faculty"] = tail_fac
    leftover = re.sub(r"[A-Za-z]*\s*\(\d+\)", " ", rest[:last_group_end] if last_group_end else rest)
    title = [t for t in re.findall(r"[A-Z][A-Za-z\-]+", leftover)
             if t not in GROUPS and t not in FAC and t not in FACULTY_NAMES]
    title_s = " ".join(title).strip(" -") or None
    room = rooms[0] if len(rooms) == 1 else None
    return {"raw": rest, "code": code, "title": title_s, "type": typ,
            "room": room, "faculty": tail_fac, "options": options or None}


COURSE_NAMES = {
    "1.1": "English I", "1.2": "History I", "1.3": "Political Science I",
    "1.4": "Sociology I", "1.5": "Torts", "1.6": "Legal Methods",
    "3.1": "History III", "3.2": "Political Science III", "3.3": "Sociology III",
    "3.4": "Economics III", "3.5": "Jurisprudence", "3.6": "Special Contracts",
    "501": "Elective (ENG / ECO / POL / HIST / SOC)", "502": "Seminar Paper",
    "503": "Paper 503 (CL)", "504": "Paper 504 (FL)",
    "505": "Civil Procedure Code", "506": "Paper 506 (PL)",
    "701": "Seminar Paper", "702": "Taxation",
    "703": "Specialization Paper", "704": "Seminar Paper (Specialization)",
    "705": "Specialization Paper", "706": "Seminar Paper (Specialization)",
    "901": "Alternative Dispute Resolution", "902": "Paper 902 (MED)",
    "903": "Specialization Paper", "904": "Seminar Paper (Specialization)",
    "905": "Specialization Paper", "906": "Seminar Paper (Specialization)",
}
FACULTY_NAMES = {
    "DB": "Prof. (Dr.) Diptimoni Boruah", "DP": "Prof. (Dr.) Debasis Poddar",
    "KJ": "Dr. Kailash Jeenger", "KG": "Dr. Kasturi Gakul", "TT": "Dr. Thangzakhup Tombing",
    "HRN": "Dr. Himangshu Ranjan Nath", "SC": "Mr. Saheb Chowdhury", "MG": "Dr. Monmi Gohain",
    "AM": "Mr. Ankur Madhia", "SK": "Dr. Shailendra Kumar", "ADH": "Dr. Aparajita Dutta Hazarika",
    "PPS": "Ms. Preeti Priyam Sharma", "NG": "Dr. Namrata Gogoi", "DD": "Dr. Dipakshi Das",
    "UD": "Dr. Upasana Devi", "SHK": "Mr. Shangky Khongwar", "PC": "Dr. Preeti Chakravarty",
    "NS": "Dr. Nupur Sinha", "IB": "Mr. Ishaan Borthakur", "KAG": "Ms. Kangkana Goswami",
    "AC": "Mr. Aashirwad Chakravarty", "MB": "Mr. Manash Barman", "DS": "Divya Sharma",
    "SD": "Smriti Devi", "SYS": "Sabina Yasmin Saharia", "ABC": "Abhishek Chakravarty",
    "AB": "Arunav Bhattacharjya", "AD": "Agrata Das", "SI": "Susmit Isfaq",
    "RV": "Rajdeep Vardhan", "SR": "Smriti Rani", "SN": "Souvik Nath", "MR": "Mampi Roy",
    "ST": "ST (not in legend)",
}


DEFAULT_ROOM = {"I-A": "110", "I-B": "112", "III": "210", "V": "212", "VII": "313", "IX": "413"}


def fix_fac(f):
    if f == "MN":
        return "MR"  # source typo (Mampi Roy)
    return f


def main():
    grid = extract_grid()
    sections = {}
    for (day, track), periods in grid.items():
        sec = sections.setdefault(track, {"days": {}})
        for per, raw in periods.items():
            raw = clean(raw)
            cells = []
            for e in split_entries(raw):
                if "SEM" in e:
                    c = parse_sem(e)
                else:
                    c = parse_basic(e)
                c["faculty"] = [fix_fac(f) for f in c.get("faculty", [])]
                for o in (c.get("options") or []):
                    o["faculty"] = [fix_fac(f) for f in o.get("faculty", [])]
                if not c.get("room") and not c.get("options"):
                    c["room"] = DEFAULT_ROOM.get(track)
                if c.get("code"):
                    c["name"] = COURSE_NAMES.get(c["code"])
                cells.append(c)
            sec["days"].setdefault(day, {})[per] = cells
    # source typo: "SK/ST" in Political Science I means SHK/ST
    for sec in sections.values():
        for day in sec["days"].values():
            for cells in day.values():
                for c in cells:
                    if c.get("faculty") == ["SK", "ST"]:
                        c["faculty"] = ["SHK", "ST"]

    order = ["I-A", "I-B", "III", "V", "VII", "IX"]
    labels = {"I-A": "I Year · Section A", "I-B": "I Year · Section B",
              "III": "III Semester", "V": "V Semester", "VII": "VII Semester", "IX": "IX Semester"}
    out = {
        "meta": {
            "university": "National Law University and Judicial Academy, Assam",
            "programme": "B.A., LL.B. (Hons.)",
            "academicYear": "2026-27", "semester": "Odd Semester",
            "source": PDF,
        },
        "periods": [
            {"id": "p1", "start": "09:00", "end": "09:50"},
            {"id": "p2", "start": "09:55", "end": "10:45"},
            {"id": "p3", "start": "10:50", "end": "11:40"},
            {"id": "p4", "start": "11:55", "end": "12:45"},
            {"id": "p5", "start": "12:50", "end": "13:40"},
            {"id": "p6", "start": "14:40", "end": "15:30"},
            {"id": "p7", "start": "15:35", "end": "16:25"},
            {"id": "p8", "start": "16:30", "end": "17:20"},
        ],
        "sections": {s: {"label": labels[s], "days": sections[s]["days"]} for s in order if s in sections},
    }
    os.makedirs(OUT, exist_ok=True)
    json.dump(out, open(os.path.join(OUT, "timetable.json"), "w"), indent=1, ensure_ascii=False)
    json.dump({"courses": COURSE_NAMES}, open(os.path.join(OUT, "courses.json"), "w"), indent=1, ensure_ascii=False)
    json.dump({"faculty": FACULTY_NAMES}, open(os.path.join(OUT, "faculty.json"), "w"), indent=1, ensure_ascii=False)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
