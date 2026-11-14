"""Build the app's runtime artifacts from _d2r_extract (never ships the extract itself, rule G-extract-not-in-app).

  python tools/build_data.py [--strict]

Inputs : ../_d2r_extract/data/derived/skills.json   (tools/build_boosts.py in the extract)
         ../_d2r_extract/assets/png/...             (tools/sprite2png.py in the extract)
         ../_d2r_extract/data/casc/data/hd/ui/fonts (game fonts)
Outputs: data.js, assets/icons/<cls>.webp (icon sheet), assets/trees/<cls>_<page>.webp, assets/fonts/*
--strict fails on any missing asset instead of reporting it (rule A-provenance-guards).
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys

from PIL import Image

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT = os.path.join(os.path.dirname(APP), "_d2r_extract")
PNG = os.path.join(EXT, "assets", "png")
STRICT = "--strict" in sys.argv

CLASSES = [  # code, art prefix, icon folder, display name key in strings is the class name itself
    ("ama", "Am", "amazon", "Amazon"), ("sor", "So", "Sorceress", "Sorceress"), ("nec", "Ne", "Necromancer", "Necromancer"),
    ("pal", "Pa", "paladin", "Paladin"), ("bar", "Ba", "Barbarian", "Barbarian"), ("dru", "Dr", "Druid", "Druid"),
    ("ass", "As", "Assassin", "Assassin"), ("war", "Wa", "Warlock", "Warlock"),
]
ICON = 130          # native icon frame size
SHEET_ICON = 96     # icon size in the shipped sheet (Lanczos down, no sharpen; rule G-no-ai-scaler)
# Slot origins on the native 895x1169 tree panel, measured from the panel art (column x, row y).
SLOT_X = [119, 381, 641]
SLOT_Y = [129, 308, 484, 665, 844, 1020]
TREE_W, TREE_H = 895, 1169

missing = []


def need(path, what):
    if not os.path.exists(path):
        missing.append(f"{what}: {path}")
        return False
    return True


def ver(path):
    with open(path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()[:8]


def rel(path):
    return os.path.relpath(path, APP).replace("\\", "/") + "?v=" + ver(path)


def main():
    src = os.path.join(EXT, "data", "derived", "skills.json")
    if not need(src, "boost graph"):
        sys.exit("\n".join(missing))
    skills = json.load(open(src, encoding="utf-8"))
    os.makedirs(os.path.join(APP, "assets", "icons"), exist_ok=True)
    os.makedirs(os.path.join(APP, "assets", "trees"), exist_ok=True)
    os.makedirs(os.path.join(APP, "assets", "fonts"), exist_ok=True)

    classes = []
    for code, ab, folder, name in CLASSES:
        mine = [s for s in skills.values() if s["cls"] == code]
        # Icon sheet: only the frames this class uses, in a single row, provenance = sprite frame index.
        used = sorted({s["icon"] for s in mine})
        sheet = Image.new("RGBA", (SHEET_ICON * len(used), SHEET_ICON))
        for i, cel in enumerate(used):
            p = os.path.join(PNG, folder, f"{ab}SkillIcon_{cel:02d}.png")
            if need(p, f"{code} icon cel {cel}"):
                sheet.paste(Image.open(p).convert("RGBA").resize((SHEET_ICON, SHEET_ICON), Image.LANCZOS), (i * SHEET_ICON, 0))
        sheet_path = os.path.join(APP, "assets", "icons", f"{code}.webp")
        sheet.save(sheet_path, "WEBP", quality=92, method=6)
        # Tree panels: art frame = 3 - page (verified for all 8 classes by slot layout, CONTEXT_MAP § Assets).
        trees = []
        for page in (1, 2, 3):
            p = os.path.join(PNG, "Skill_Trees", f"{ab}Skilltree_{3 - page:02d}.png")
            out = os.path.join(APP, "assets", "trees", f"{code}_{page}.webp")
            if need(p, f"{code} tree page {page}"):
                if not os.path.exists(out) or os.path.getmtime(out) < os.path.getmtime(p):
                    Image.open(p).convert("RGBA").save(out, "WEBP", quality=90, method=4)
                trees.append(rel(out))
            else:
                trees.append("")
        tabs = {}
        for s in mine:
            tabs[s["page"]] = s["tab"]
        classes.append({"code": code, "name": name, "sheet": rel(sheet_path), "sheetCount": len(used),
                        "trees": trees, "tabs": [tabs.get(p, "") for p in (1, 2, 3)],
                        "cel": {str(c): i for i, c in enumerate(used)}})

    # Compact item table: each item once, skill boosts reference it by index.
    # Item boosts that apply to many skills (all skills, a class, a tab, an element, physical) are stored once as a
    # shared group; a skill lists the group keys it belongs to ("ig"). Keeps data.js small on phones.
    items, item_ix = [], {}
    groups = {}
    out_skills = {}

    def scope(s, kind, key):
        if kind == "all skills":
            return "*"
        if kind == "class skills":
            return s["cls"]
        if kind == "skill tab":
            return f"tab{s['tabParam']}"
        if kind in ("single skill", "oskill"):
            return key
        if kind in ("damage", "crit", "crush"):
            return "phys"
        return s["element"]

    for key, s in skills.items():
        bl, ig = [], []
        for b in s["boosts"]:
            if b["type"] in ("item", "grant"):
                ik = (b["itemKind"], b["item"])
                if ik not in item_ix:
                    item_ix[ik] = len(items)
                    items.append([b["itemKind"], b["itemName"], b["lvlreq"], 1 if b["spawnable"] else 0])
                row = [item_ix[ik], b["prop"], b["param"], b["min"], b["max"]]
                if b["type"] == "grant":
                    bl.append({"t": "grant", "h": b["how"], "i": row[0], "p": row[1], "a": row[2], "lo": row[3], "hi": row[4]})
                    continue
                gk = f"{b['kind']}|{scope(s, b['kind'], key)}"
                g = groups.setdefault(gk, {"rows": [], "seen": set()})
                if tuple(row) not in g["seen"]:
                    g["seen"].add(tuple(row))
                    g["rows"].append(row)
                if gk not in ig:
                    ig.append(gk)
            elif b["type"] == "synergy":
                bl.append({"t": "synergy", "f": b["from"], "fld": b["field"], "fd": b.get("fieldDesc", ""),
                           "fx": b["formula"], "par": b["params"], "lk": b["levelKind"]})
            elif b["type"] == "form":
                bl.append({"t": "form", "f": b["from"], "st": b["stat"], "lb": b["label"], "fx": b["calc"],
                           "also": b["also"]})
            elif b["type"] == "skill":
                bl.append({"t": "skill", "f": b["from"], "k": b["kind"], "st": b["stat"], "fx": b["calc"], "via": b["via"], "w": b.get("weapon", "")})
        out_skills[key] = {k: s[k] for k in ("id", "name", "cls", "page", "row", "col", "icon", "tab", "reqlevel",
                                             "maxlvl", "req", "element", "physical", "passive", "aura", "nums")}
        out_skills[key]["b"] = bl
        out_skills[key]["ig"] = ig

    fonts = {}
    for fn in ("ExocetBlizzardOT-Medium.otf", "Formal436BT.ttf"):
        p = os.path.join(EXT, "data", "casc", "data", "hd", "ui", "fonts", fn)
        if need(p, f"font {fn}"):
            dst = os.path.join(APP, "assets", "fonts", fn)
            shutil.copyfile(p, dst)
            fonts[fn.split("-")[0].split(".")[0]] = rel(dst)

    data = {"classes": classes, "skills": out_skills, "items": items, "fonts": fonts,
            "groups": {k: g["rows"] for k, g in groups.items()},
            "layout": {"w": TREE_W, "h": TREE_H, "x": SLOT_X, "y": SLOT_Y, "icon": ICON}}
    with open(os.path.join(APP, "data.js"), "w", encoding="utf-8", newline="\n") as f:
        f.write("// generated by tools/build_data.py - do not edit\nwindow.D2R = ")
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    if missing:
        print("MISSING:\n  " + "\n  ".join(missing))
        if STRICT:
            sys.exit(1)
    stamp = os.path.join(os.path.dirname(APP), "tools", "app", "stamp_cache.py")
    subprocess.run([sys.executable, stamp, APP], check=True)
    print(f"BUILD OK skills={len(out_skills)} items={len(items)} classes={len(classes)}")


if __name__ == "__main__":
    main()
