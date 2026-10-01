#!/usr/bin/env python3
"""Verify data/timetable.json invariants. Run: python3 tools/verify_data.py"""
import json, os, sys

D = os.path.join(os.path.dirname(__file__), "..", "data")
tt = json.load(open(os.path.join(D, "timetable.json")))
courses = json.load(open(os.path.join(D, "courses.json")))["courses"]
faculty = json.load(open(os.path.join(D, "faculty.json")))["faculty"]

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"]
KNOWN_FAC = set("DB DP KJ KG TT HRN SC MG AM SK ADH PPS NG DD UD SHK PC NS IB KAG AC MB DS SD SYS ABC AB AD SI RV SR SN MR ST".split())
problems = []

assert len(tt["periods"]) == 8, "expected 8 periods"
assert set(tt["sections"]) == {"I-A", "I-B", "III", "V", "VII", "IX"}, "unexpected sections"

for sec, s in tt["sections"].items():
    assert set(s["days"]) <= set(DAYS), f"{sec}: bad day keys"
    for day, row in s["days"].items():
        seen = []
        for pid, cells in row.items():
            for c in cells:
                if not c.get("code"):
                    problems.append(f"{sec} {day} {pid}: missing code")
                    continue
                seen.append(c["code"])
                if c["code"] not in courses:
                    problems.append(f"{sec} {day} {pid}: code {c['code']} not in courses.json")
                for f in (c.get("faculty") or []):
                    if f not in KNOWN_FAC:
                        problems.append(f"{sec} {day} {pid}: unknown faculty {f}")
                for o in (c.get("options") or []):
                    for f in (o.get("faculty") or []):
                        if f not in KNOWN_FAC:
                            problems.append(f"{sec} {day} {pid}: unknown option faculty {f}")
        # first-year and III: exactly the six papers each day
        if sec in ("I-A", "I-B"):
            if sorted(seen) != sorted(["1.1", "1.2", "1.3", "1.4", "1.5", "1.6"]):
                problems.append(f"{sec} {day}: expected all six 1.x papers, got {sorted(seen)}")
        if sec == "III":
            if sorted(seen) != sorted(["3.1", "3.2", "3.3", "3.4", "3.5", "3.6"]):
                problems.append(f"{sec} {day}: expected all six 3.x papers, got {sorted(seen)}")

if problems:
    print("FAIL")
    for p in problems:
        print(" -", p)
    sys.exit(1)
print(f"OK: {len(tt['sections'])} sections, all invariants hold")
