#!/usr/bin/env python3
"""Generate the card symbol library src/cards.svg and the card colour tokens style/cards.css (B-99, D1).

Run from anywhere:  python3 tools/cards/gen_symbols.py
Standard library only and deterministic: the same input always gives byte-identical files, so a
diff of the generated files shows exactly what changed. Both generated files are committed; the
app has no build step.

Style "F1 sketch" (mock-ups R3, Delia): every symbol is drawn as a thick centre line (or a filled
shape) with an ink outline, a second, slightly shifted outline, a light tint of the value colour
and a hatching in the value colour. The wobble (in the mock-ups an SVG turbulence filter at
runtime) and the hatching (a pattern mask) are baked into plain paths here, so the browser draws
simple strokes only and the symbols work inside <use href="cards.svg#…">.

Colours come from CSS (they are inherited into <use>):
  color         value colour (outline tint and hatching)
  --sym-ink     outlines and details        (default #1d2027)
  --sym-face    paper / knock-out           (default #fbfaf5)
  --sym-tint    body of the strokes/shapes  (default: 22 % value colour on --sym-face)
  --sym-hatch   hatching                    (default: currentColor)
"""
import colorsys
import math
import os
import re
import xml.dom.minidom

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT_SVG = os.path.join(ROOT, "src", "cards.svg")
OUT_CSS = os.path.join(ROOT, "style", "cards.css")
OUT_PREVIEW = os.path.join(ROOT, "tools", "cards", "preview.html")

# ------------------------------------------------------------------ geometry (box 0 0 100 120)
# Copied from the R3 card catalogue mock-up (cards-catalog/gen_catalog.py), the binding template.
W, O = 14, 1.6  # centre-line stroke width, outline per side
DIG = {
    "d0": '<ellipse cx="50" cy="62" rx="24" ry="38"/>',
    "d1": '<path d="M38 38L56 22v78"/>',
    "d2": '<path d="M32 42c0-14 10-22 20-22 12 0 20 8 20 20 0 14-14 26-38 60h40"/>',
    "d3": '<path d="M30 30c10-10 42-12 42 10 0 12-12 18-24 18 16 0 28 8 28 22 0 24-36 26-48 14"/>',
    "d4": '<path d="M60 102V22L26 76h54"/>',
    "d5": '<path d="M72 30H40l-3 30c7-5 13-7 19-7 13 0 21 10 21 23 0 16-11 25-25 25-10 0-17-3-23-9"/>',
    "d6": '<path d="M68 30c-6-6-12-8-18-8-16 0-24 18-24 40 0 24 8 40 24 40 13 0 22-9 22-22s-9-21-21-21c-11 0-19 7-25 15"/>',
    "d7": '<path d="M28 26h44c-14 22-22 46-24 76"/>',
    "d8": '<circle cx="50" cy="46" r="14"/><circle cx="50" cy="82" r="18"/>',
    "d9": '<path d="M74 46c-6 8-14 15-25 15-12 0-21-9-21-20s9-19 22-19c16 0 24 16 24 38 0 26-10 42-28 42-7 0-13-3-17-7"/>',
    "dinf": '<path d="M50 62c-10-12-18-18-26-18a18 18 0 0 0 0 36c8 0 16-6 26-18s18-18 26-18a18 18 0 0 1 0 36c-8 0-16-6-26-18z"/>',
    "dq": '<path d="M30 40c0-14 10-22 22-22 12 0 20 8 20 19 0 16-20 18-20 36v4M52 99h.1"/>',
    "dx": '<path d="M50 22v54M50 99h.1"/>',
    "dsl": '<path d="M72 22L28 104"/>',
    "dchk": '<path d="M22 60l20 22 40-52"/>',
    "lX": '<path d="M30 26l40 76M70 26l-40 76"/>',
    "lS": '<path d="M70 36c-4-9-12-14-21-14-12 0-21 7-21 18 0 24 44 14 44 40 0 12-10 20-23 20-10 0-18-5-23-13"/>',
    "lM": '<path d="M24 102V26l26 46 26-46v76"/>',
    "lL": '<path d="M34 24v78h38"/>',
    "mug": '<path d="M22 52h46v30c0 14-10 22-23 22s-23-8-23-22z"/>',
    "hand": '<path d="M36 106c-8-6-14-16-17-28l-7-18c-2-7 7-11 11-4l7 12V32c0-7 10-7 10 0v24V22c0-7 10-7 10 0v32V24c0-7 10-7 10 0v32V34c0-7 10-7 10 0v40c0 18-6 28-14 32z"/>',
    "face": '<circle cx="50" cy="62" r="37"/>',
    "house": '<path d="M36 12h28c7 0 11 4 11 11v78c0 7-4 11-11 11H36c-7 0-11-4-11-11V23c0-7 4-11 11-11z"/>',
    "lamp": '<circle cx="0" cy="0" r="11"/>',
    "cloud": '<path d="M22 60a12 12 0 0 1 4-20a14 14 0 0 1 22-12a14 14 0 0 1 24 2a12 12 0 0 1 10 22a12 12 0 0 1-12 16a14 14 0 0 1-24 2a12 12 0 0 1-24-10z"/>',
    "bub1": '<circle cx="31" cy="87" r="7"/>',
    "bub2": '<circle cx="21" cy="102" r="4"/>',
    "gfmask": '<path d="M50 12c22 0 35 14 35 38 0 26-15 46-35 58-20-12-35-32-35-58 0-24 13-38 35-38z"/>',
    "square": '<path d="M15 6h70c5 0 9 4 9 9v70c0 5-4 9-9 9H15c-5 0-9-4-9-9V15c0-5 4-9 9-9z"/>',
}


def n(x):
    return f"{x:.2f}".rstrip("0").rstrip(".")


def _star(r=18.5, ri=8.2):
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else ri
        pts.append(f"{n(rr * math.cos(a))} {n(rr * math.sin(a))}")
    return '<path d="M' + "L".join(pts) + 'z"/>'


DIG["star"] = _star()


def L(ref, t="", s=1.0, w=W):    # thick centre line: outline, shadow, tint, hatching
    return ("L", ref, t, s, w)


def S(ref, t="", s=1.0):          # filled, hatched shape in the value colour
    return ("S", ref, t, s)


def E(ref, t="", s=1.0):          # empty shape: paper fill, ink outline
    return ("E", ref, t, s)


def T(d, w=2 * O):                # ink line (details)
    return ("T", d, w)


def row(refs):
    """1-3 glyphs side by side (13, 100, XXL …)."""
    k = len(refs)
    if k == 1:
        return [L(refs[0])]
    s = {2: .62, 3: .44}[k]
    xs = {2: [31, 69], 3: [24, 51, 78]}[k]
    ty = 62 - 62 * s
    return [L(r, f"translate({n(x - 50 * s)} {n(ty)}) scale({s})", s, W * 1.5 if k == 3 else 11 / s) for r, x in zip(refs, xs)]


def stars(k):
    pos = [(29, 30), (71, 30), (50, 62), (29, 94), (71, 94)]
    return [(S if i < k else E)("star", f"translate({x} {y})") for i, (x, y) in enumerate(pos)]


def ampel(lit):
    ys = {"red": 34, "yellow": 62, "green": 90}
    out = [E("house")]
    for c, y in ys.items():
        out.append((S if c == lit else E)("lamp", f"translate(50 {y})"))
    return out


FACE = {
    "satisfied": [T("M37 50v7M63 50v7", 5), T("M31 72c9 13 29 13 38 0", 4.5)],
    "annoyed": [T("M30 52h14M56 52h14", 4), T("M41 57h.1M67 57h.1", 6), T("M35 82c8-5 20 1 30-3", 4.5)],
    "sad": [T("M37 52v6M63 52v6", 5), T("M34 86c6-12 26-12 32 0", 4.5), T("M68 62c-3 5-3 8 0 9 3-1 3-4 0-9z", 2.6)],
    "uninterested": [T("M32 55h11M57 55h11", 4.5), T("M36 80h28", 4.5)],
    "angry": [T("M29 44l15 7M71 44l-15 7", 4.5), T("M38 58v4M62 58v4", 5), T("M35 86c6-9 24-9 30 0", 4.5)],
    "enthusiastic": [T("M37 44v14M30 51h14M32 46l10 10M42 46l-10 10M63 44v14M56 51h14M58 46l10 10M68 46l-10 10", 2.8),
                     T("M30 68h40c0 14-9 21-20 21s-20-7-20-21z", 3.6)],
}

# Symbol id -> (motif layers, title). Ids "s-0", "s-1", "s-coffee" … as agreed with Ben (cards.json v2).
SYM = {}
for d in "0123456789":
    SYM[f"s-{d}"] = (row([f"d{d}"]), d)
SYM["s-8"] = ([L("d8", "translate(-8 -11) scale(1.16)", 1.16, W / 1.16)], "8")
SYM["s-10"] = (row(["d1", "d0"]), "10")
SYM["s-13"] = ([L("d1", "translate(2 23.6) scale(.62)", .62, 11 / .62), L("d3", "translate(37 23.6) scale(.62)", .62, 11 / .62)], "13")
for v, refs in (("20", ["d2", "d0"]), ("21", ["d2", "d1"]), ("34", ["d3", "d4"]), ("40", ["d4", "d0"]),
                ("55", ["d5", "d5"]), ("100", ["d1", "d0", "d0"])):
    SYM[f"s-{v}"] = (row(refs), v)
SYM["s-half"] = ([L("d1", "translate(4 4) scale(.5)", .5, 20), L("dsl", "", 1, 10), L("d2", "translate(46 52) scale(.5)", .5, 20)], "one half")
# The infinity glyph is wider than the digits: scaled down around the centre (50 62), line width kept.
SYM["s-inf"] = ([L("dinf", "translate(8 9.92) scale(.84)", .84, W / .84)], "infinity")
for v, refs in (("xxs", ["lX", "lX", "lS"]), ("xs", ["lX", "lS"]), ("s", ["lS"]), ("m", ["lM"]), ("l", ["lL"]),
                ("xl", ["lX", "lL"]), ("xxl", ["lX", "lX", "lL"])):
    SYM[f"s-{v}"] = (row(refs), v.upper())
for c in ("green", "yellow", "red"):
    SYM[f"s-light-{c}"] = (ampel(c), f"{c} light")
for f, feats in FACE.items():
    SYM[f"s-face-{f}"] = ([S("face")] + feats, f"{f} face")
for k in range(6):
    SYM[f"s-stars-{k}"] = (stars(k), f"{k} of 5 stars")
SYM["s-coffee"] = ([S("mug", "translate(0 4)"), T("M68 64c15 0 15 22 0 22"), T("M46 46c-4-5 4-9 0-15M58 46c-4-5 4-9 0-15")], "coffee cup")
SYM["s-question"] = (row(["dq"]), "question mark")
SYM["s-exclam"] = (row(["dx"]), "exclamation mark")
SYM["s-hand"] = ([S("hand"), T("M14 40l-6-4M18 30l-4-7M26 24l-2-8", 2.6)], "raised hand")
SYM["s-check"] = (row(["dchk"]), "check mark")
SYM["s-thought"] = ([S("cloud", "translate(6 7)"), S("bub1", "translate(6 7)"), S("bub2", "translate(6 7)"),
                     T("M42 55h.1M56 55h.1M70 55h.1", 9)], "thought bubble")
SYM["s-mask"] = ([S("gfmask"),
                  T("M24 45c6-8 15-9 22-5M76 45c-6-8-15-9-22-5", 3),          # raised brows
                  T("M29 55c5-4 11-4 16 0M71 55c-5-4-11-4-16 0", 4.4),        # slit eyes
                  T("M50 52v17c-2 3-6 3-8 1", 2.8),                            # nose
                  T("M50 77c-7-5-15-5-21 0-4 3-8 0-7-5M50 77c7-5 15-5 21 0 4 3 8 0 7-5", 3.6),  # curled moustache
                  T("M39 85c6 4 16 4 22 0", 2.6),                              # smile
                  T("M47 90l3 13 3-13", 2.6)], "anonymous mask")              # goatee
# Frame of the "inverted" style (J.U.D.G.E.): hatched, coloured rounded square, 100 x 100.
# The value symbol goes on top at x=10 y=.4 width=80 height=96 (see README).
SYM["s-frame-inv"] = ([S("square")], "frame")
VIEWBOX = {"s-frame-inv": "0 0 100 100"}

# ------------------------------------------------------------------ path parsing and flattening
NUM = r"-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?"


def parse_elements(markup):
    """-> list of SVG elements as (tag, attrs)."""
    out = []
    for m in re.finditer(r"<(path|circle|ellipse)\s+([^>]*?)/>", markup):
        attrs = dict(re.findall(r'([a-z]+)="([^"]*)"', m.group(2)))
        out.append((m.group(1), attrs))
    return out


def arc_points(x1, y1, rx, ry, phi, fa, fs, x2, y2):
    """SVG arc (endpoint form) -> points after the start point."""
    if rx == 0 or ry == 0:
        return [(x2, y2)]
    rx, ry = abs(rx), abs(ry)
    cp, sp = math.cos(math.radians(phi)), math.sin(math.radians(phi))
    dx, dy = (x1 - x2) / 2, (y1 - y2) / 2
    x1p, y1p = cp * dx + sp * dy, -sp * dx + cp * dy
    lam = x1p ** 2 / rx ** 2 + y1p ** 2 / ry ** 2
    if lam > 1:
        rx, ry = rx * math.sqrt(lam), ry * math.sqrt(lam)
    num = rx ** 2 * ry ** 2 - rx ** 2 * y1p ** 2 - ry ** 2 * x1p ** 2
    den = rx ** 2 * y1p ** 2 + ry ** 2 * x1p ** 2
    co = math.sqrt(max(0, num / den)) * (-1 if fa == fs else 1)
    cxp, cyp = co * rx * y1p / ry, -co * ry * x1p / rx
    cx, cy = cp * cxp - sp * cyp + (x1 + x2) / 2, sp * cxp + cp * cyp + (y1 + y2) / 2

    def ang(ux, uy, vx, vy):
        a = math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
        return a
    t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
    dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
    if not fs and dt > 0:
        dt -= 2 * math.pi
    elif fs and dt < 0:
        dt += 2 * math.pi
    k = max(4, int(abs(dt) * max(rx, ry) / .5))
    pts = []
    for i in range(1, k + 1):
        t = t1 + dt * i / k
        x, y = rx * math.cos(t), ry * math.sin(t)
        pts.append((cp * x - sp * y + cx, sp * x + cp * y + cy))
    return pts


def cubic(p0, p1, p2, p3):
    est = math.dist(p0, p1) + math.dist(p1, p2) + math.dist(p2, p3)
    k = max(2, int(est / .5))
    out = []
    for i in range(1, k + 1):
        t = i / k
        u = 1 - t
        out.append((u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
                    u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]))
    return out


def path_subpaths(d):
    """-> list of (points, closed, corners): fine polylines (about 0.5 units), corners = indices of
    command end points (kept when the line is simplified, so sharp corners stay sharp)."""
    toks = re.findall(r"[MmLlHhVvCcSsAaZz]|" + NUM, d)
    i, cmd = 0, None
    cur, start, last_c2 = (0.0, 0.0), (0.0, 0.0), None
    subs, pts, corners = [], [], set()

    def flush(closed):
        nonlocal pts, corners
        if len(pts) > 1:
            subs.append((pts, closed, corners))
        pts, corners = [], set()

    def num():
        nonlocal i
        v = float(toks[i])
        i += 1
        return v

    def line_to(p):
        steps = max(1, int(math.dist(cur, p) / .5))
        for k in range(1, steps + 1):
            pts.append((cur[0] + (p[0] - cur[0]) * k / steps, cur[1] + (p[1] - cur[1]) * k / steps))
    while i < len(toks):
        if re.match(r"[A-Za-z]", toks[i]):
            cmd = toks[i]
            i += 1
            if cmd in "Zz":
                if pts and math.dist(cur, start) > 1e-6:
                    line_to(start)
                cur = start
                flush(True)
                last_c2 = None
                continue
        rel = cmd.islower()
        c = cmd.upper()
        ox, oy = cur if rel else (0.0, 0.0)
        if c == "M":
            flush(False)
            cur = (ox + num(), oy + num())
            start = cur
            pts, corners = [cur], {0}
            cmd = "l" if rel else "L"
            last_c2 = None
            continue
        if c == "L":
            p = (ox + num(), oy + num())
        elif c == "H":
            p = ((cur[0] if rel else 0) + num(), cur[1])
        elif c == "V":
            p = (cur[0], (cur[1] if rel else 0) + num())
        if c in "LHV":
            if math.dist(cur, p) < .5:          # dots ("h.1") stay as tiny segments
                pts.append(p)
            else:
                line_to(p)
            cur = p
            last_c2 = None
        elif c in "CS":
            if c == "C":
                c1 = (ox + num(), oy + num())
            else:
                c1 = (2 * cur[0] - last_c2[0], 2 * cur[1] - last_c2[1]) if last_c2 else cur
            c2 = (ox + num(), oy + num())
            p = (ox + num(), oy + num())
            pts.extend(cubic(cur, c1, c2, p))
            cur, last_c2 = p, c2
        elif c == "A":
            rx, ry, phi, fa, fs = num(), num(), num(), num(), num()
            p = (ox + num(), oy + num())
            pts.extend(arc_points(cur[0], cur[1], rx, ry, phi, int(fa), int(fs), p[0], p[1]))
            cur = p
            last_c2 = None
        corners.add(len(pts) - 1)
    flush(False)
    return subs


def ellipse_sub(cx, cy, rx, ry):
    k = max(16, int(2 * math.pi * max(rx, ry) / .5))
    pts = [(cx + rx * math.cos(-math.pi / 2 + 2 * math.pi * i / k), cy + ry * math.sin(-math.pi / 2 + 2 * math.pi * i / k))
           for i in range(k + 1)]
    return [(pts, True, set())]


def element_subpaths(tag, a):
    if tag == "path":
        return path_subpaths(a["d"])
    if tag == "circle":
        r = float(a["r"])
        return ellipse_sub(float(a.get("cx", 0)), float(a.get("cy", 0)), r, r)
    return ellipse_sub(float(a["cx"]), float(a["cy"]), float(a["rx"]), float(a["ry"]))


def parse_transform(t):
    """'translate(a b) scale(s)' -> (s, tx, ty) for p' = p * s + t."""
    s, tx, ty = 1.0, 0.0, 0.0
    m = re.search(r"translate\(\s*(" + NUM + r")[\s,]+(" + NUM + r")\s*\)", t or "")
    if m:
        tx, ty = float(m.group(1)), float(m.group(2))
    m = re.search(r"scale\(\s*(" + NUM + r")\s*\)", t or "")
    if m:
        s = float(m.group(1))
    return s, tx, ty


def shape(ref, t=""):
    s, tx, ty = parse_transform(t)
    subs = []
    for tag, a in parse_elements(DIG[ref]):
        for pts, closed, corners in element_subpaths(tag, a):
            subs.append(([(x * s + tx, y * s + ty) for x, y in pts], closed, corners))
    return subs, s


# ------------------------------------------------------------------ wobble (baked displacement)
# Smooth value noise, 2 octaves, like the feTurbulence/feDisplacementMap filter of the mock-ups
# (baseFrequency .06, scale 2.6). Fixed seeds: deterministic output.
FREQ, AMP = .06, 2.0


def _hash(ix, iy, seed):
    h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0


def _vnoise(x, y, seed):
    ix, iy = math.floor(x), math.floor(y)
    fx, fy = x - ix, y - iy
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b = _hash(ix, iy, seed), _hash(ix + 1, iy, seed)
    c, d = _hash(ix, iy + 1, seed), _hash(ix + 1, iy + 1, seed)
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy


def wobble(p):
    x, y = p
    dx = (_vnoise(x * FREQ, y * FREQ, 7) - .5) + .5 * (_vnoise(x * FREQ * 2, y * FREQ * 2, 8) - .5)
    dy = (_vnoise(x * FREQ, y * FREQ, 17) - .5) + .5 * (_vnoise(x * FREQ * 2, y * FREQ * 2, 18) - .5)
    return (x + AMP * dx, y + AMP * dy)


# ------------------------------------------------------------------ simplify + serialise
STEP, TURN = 4.0, math.radians(20)


def simplify(pts, closed, corners):
    """Keep a point every STEP units, at every sharp corner and where the line has turned TURN."""
    keep = [pts[0]]
    run, turn = 0.0, 0.0
    for i in range(1, len(pts) - 1):
        run += math.dist(pts[i - 1], pts[i])
        a1 = math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0])
        a2 = math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0])
        da = abs((a2 - a1 + math.pi) % (2 * math.pi) - math.pi)
        turn += da
        sharp = i in corners and da > math.radians(25)
        if sharp or run >= STEP or turn >= TURN:
            keep.append(pts[i])
            run, turn = 0.0, 0.0
    keep.append(pts[-1])
    return keep


def fmt(v):
    s = f"{v:.1f}"
    if s.endswith(".0"):
        s = s[:-2]
    if s.startswith("0."):
        s = s[1:]
    elif s.startswith("-0."):
        s = "-" + s[2:]
    return "0" if s in ("-0", "") else s


def nums(values):
    """compact number list: no separator before "-", nor before "." after a number with a dot."""
    out, prev = "", None
    for v in values:
        t = fmt(v)
        if prev is not None and not t.startswith("-") and not (t.startswith(".") and "." in prev):
            out += " "
        out += t
        prev = t
    return out


def d_of(polys):
    """polylines (already wobbled) -> compact path data: relative m/l (first m absolute), z."""
    out, prev = [], (0.0, 0.0)
    for pts, closed in polys:
        q = [(round(x, 1), round(y, 1)) for x, y in pts]
        if closed and len(q) > 2 and q[-1] == q[0]:
            q = q[:-1]
        rel = []
        last = q[0]
        for p in q[1:]:
            dx, dy = p[0] - last[0], p[1] - last[1]
            if abs(dx) < .05 and abs(dy) < .05:
                continue
            rel += [dx, dy]
            last = p
        if not rel:
            rel = [.1, 0]                       # a dot: round caps draw it
            last = (q[0][0] + .1, q[0][1])
        out.append("m" + nums([q[0][0] - prev[0], q[0][1] - prev[1]]) + "l" + nums(rel) + ("z" if closed else ""))
        prev = q[0] if closed else last
    return "M" + "".join(out)[1:] if out else ""


def outline_polys(subs):
    return [([wobble(p) for p in simplify(pts, closed, corners)], closed) for pts, closed, corners in subs]


# ------------------------------------------------------------------ hatching (baked)
# Mock-up: pattern 3.6 x 3.6 rotated -32 deg, line at 1.2, width 1.5, anchored at the origin.
RES = 5           # raster cells per unit
X0, Y0, XN, YN = -15, -15, 130, 150
HATCH_ANGLE, HATCH_GAP, HATCH_OFF, HATCH_W = math.radians(-32), 3.6, 1.2, 1.5


class Raster:
    def __init__(self):
        self.w, self.h = XN * RES, YN * RES
        self.b = bytearray(self.w * self.h)

    def span(self, row, xa, xb):
        if 0 <= row < self.h:
            a, b = max(0, int(math.floor((xa - X0) * RES))), min(self.w, int(math.ceil((xb - X0) * RES)))
            if b > a:
                self.b[row * self.w + a: row * self.w + b] = b"\x01" * (b - a)

    def disc(self, cx, cy, r):
        for row in range(int((cy - r - Y0) * RES), int((cy + r - Y0) * RES) + 2):
            y = row / RES + Y0 + .5 / RES
            dy = y - cy
            if abs(dy) <= r:
                hw = math.sqrt(r * r - dy * dy)
                self.span(row, cx - hw, cx + hw)

    def stroke(self, subs, width):
        r = width / 2
        for pts, _, _ in subs:
            for i in range(len(pts)):
                self.disc(pts[i][0], pts[i][1], r)
                if i:                            # fill between fine points (< .5 apart): few extra discs
                    a, b = pts[i - 1], pts[i]
                    k = int(math.dist(a, b) / .15)
                    for j in range(1, k):
                        self.disc(a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k, r)

    def fill(self, subs):
        """even-odd scanline fill of closed polylines."""
        edges = []
        for pts, _, _ in subs:
            q = pts if pts[0] == pts[-1] else pts + [pts[0]]
            edges += [(q[i], q[i + 1]) for i in range(len(q) - 1)]
        for row in range(self.h):
            y = row / RES + Y0 + .5 / RES
            xs = sorted(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1])
                        for a, b in edges if (a[1] <= y < b[1]) or (b[1] <= y < a[1]))
            for k in range(0, len(xs) - 1, 2):
                self.span(row, xs[k], xs[k + 1])

    def get(self, x, y):
        c, r = int((x - X0) * RES), int((y - Y0) * RES)
        return 0 <= c < self.w and 0 <= r < self.h and self.b[r * self.w + c]


def hatch_polys(raster, bbox):
    ux, uy = math.cos(HATCH_ANGLE), math.sin(HATCH_ANGLE)     # line direction
    nx, ny = -uy, ux                                          # line normal
    x0, y0, x1, y1 = bbox
    corners = [(x0, y0), (x1, y0), (x0, y1), (x1, y1)]
    offs = [cx * nx + cy * ny for cx, cy in corners]
    ts = [cx * ux + cy * uy for cx, cy in corners]
    polys = []
    k0 = math.floor((min(offs) - HATCH_OFF) / HATCH_GAP)
    k1 = math.ceil((max(offs) - HATCH_OFF) / HATCH_GAP)
    dt = 1 / RES
    for k in range(k0, k1 + 1):
        o = k * HATCH_GAP + HATCH_OFF
        t, tend = min(ts) - 1, max(ts) + 1
        run = None
        while t <= tend:
            x, y = o * nx + t * ux, o * ny + t * uy
            inside = raster.get(x, y)
            if inside and run is None:
                run = t
            elif not inside and run is not None:
                seg(polys, o, run, t - dt, nx, ny, ux, uy)
                run = None
            t += dt
        if run is not None:
            seg(polys, o, run, tend, nx, ny, ux, uy)
    return polys


def seg(polys, o, ta, tb, nx, ny, ux, uy):
    if tb - ta < .8:
        return
    k = max(1, round((tb - ta) / 6))      # wobble long hatch lines a little in between
    pts = [wobble((o * nx + t * ux, o * ny + t * uy)) for t in (ta + (tb - ta) * i / k for i in range(k + 1))]
    polys.append((pts, False))


def bbox_of(subs, pad):
    xs = [p[0] for pts, _, _ in subs for p in pts]
    ys = [p[1] for pts, _, _ in subs for p in pts]
    return (min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad)


# ------------------------------------------------------------------ SVG output
# Short fallbacks only; the real defaults (theme colours, tint) come from style/cards.css.
INK = "var(--sym-ink,#1d2027)"
FACEC = "var(--sym-face,#fbfaf5)"
TINT = "var(--sym-tint,#fbfaf5)"
HATCH = "var(--sym-hatch,currentColor)"
SHADOW = 'transform="translate(.9 .7)"'
SHIFT = (.9, .7)  # the second, shifted outline of the mock-ups


def el(d, style, width=None, extra=""):
    w = f' stroke-width="{n(width)}"' if width is not None else ""
    return f'<path{extra} style="{style}"{w} d="{d}"/>'


def layers(item):
    kind = item[0]
    if kind == "L":
        _, ref, t, s, w = item
        subs, sc = shape(ref, t)
        wa = w * sc
        d = d_of(outline_polys(subs))
        r = Raster()
        r.stroke(subs, wa)
        h = d_of(hatch_polys(r, bbox_of(subs, wa / 2 + 1)))
        # Outline plus shifted outline (both ink, both under the body) = one wider ink stroke,
        # moved by half the shift: saves a copy of the path, looks the same.
        do = d_of([([(x + SHIFT[0] / 2, y + SHIFT[1] / 2) for x, y in pts], c) for pts, c in outline_polys(subs)])
        return [el(do, f"stroke:{INK}", wa + 2 * O + math.hypot(*SHIFT)),
                el(d, f"stroke:{TINT}", wa),
                el(h, f"stroke:{HATCH}", HATCH_W, ' stroke-linecap="butt"')]
    if kind == "S":
        _, ref, t, _ = item
        subs, _ = shape(ref, t)
        d = d_of(outline_polys(subs))
        r = Raster()
        r.fill(subs)
        h = d_of(hatch_polys(r, bbox_of(subs, 1)))
        return [el(d, f"fill:{TINT};stroke:{INK}", 2 * O),
                el(h, f"stroke:{HATCH}", HATCH_W, ' stroke-linecap="butt"'),
                el(d, f"stroke:{INK}", 2 * O, " " + SHADOW)]
    if kind == "E":
        _, ref, t, _ = item
        subs, _ = shape(ref, t)
        return [el(d_of(outline_polys(subs)), f"fill:{FACEC};stroke:{INK}", 1.6 * O)]
    if kind == "T":
        subs = path_subpaths(item[1])
        return [el(d_of(outline_polys(subs)), f"stroke:{INK}", item[2])]
    raise ValueError(kind)


def merge(parts):
    """Join neighbouring paths with the same style into one element (fewer bytes, same picture)."""
    out = []
    for p in parts:
        m = re.match(r'(<path[^>]* d=")([^"]*)("/>)', p)
        if out:
            q = re.match(r'(<path[^>]* d=")([^"]*)("/>)', out[-1])
            if q.group(1) == m.group(1):
                out[-1] = q.group(1) + q.group(2) + m.group(2) + q.group(3)
                continue
        out.append(p)
    return out


# On every symbol: <use> inherits from the symbol, not from the sprite's root <svg>.
PRES = ' fill="none" stroke-linecap="round" stroke-linejoin="round"'


def symbol(sid):
    items, title = SYM[sid]
    parts = []
    for it in items:
        parts += layers(it)
    vb = VIEWBOX.get(sid, "0 0 100 120")
    check_bounds(sid, "\n".join(parts))
    return (f'<symbol id="{sid}" viewBox="{vb}"{PRES}><title>{title}</title>\n' + "\n".join(merge(parts)) + "\n</symbol>")


def path_extent(d):
    """Absolute points of a path written by d_of() (M/m/l/z only)."""
    pts, cur, start, cmd = [], (0.0, 0.0), (0.0, 0.0), None
    for tok in re.findall(r"[MmLlZz]|-?(?:\d+\.?\d*|\.\d+)", d):
        if tok in "MmLlZz":
            cmd = tok
            if tok in "Zz":
                cur = start
            buf = []
            continue
        buf.append(float(tok))
        if len(buf) == 2:
            x, y = buf
            buf = []
            if cmd in "Mm":
                cur = (x, y) if cmd == "M" else (cur[0] + x, cur[1] + y)
                start, cmd = cur, ("L" if cmd == "M" else "l")
            else:
                cur = (x, y) if cmd == "L" else (cur[0] + x, cur[1] + y)
            pts.append(cur)
    return pts


def check_bounds(sid, markup):
    """Abort if any stroke (incl. half its width) leaves the symbol's viewBox."""
    vx, vy, vw, vh = map(float, VIEWBOX.get(sid, "0 0 100 120").split())
    x0 = y0 = math.inf
    x1 = y1 = -math.inf
    for m in re.finditer(r"<path([^>]*)/>", markup):
        a = m.group(1)
        w = re.search(r'stroke-width="([^"]+)"', a)
        h = float(w.group(1)) / 2 if w else 0.0
        t = re.search(r'translate\(([-\d.]+) ([-\d.]+)\)', a)
        tx, ty = (float(t.group(1)), float(t.group(2))) if t else (0.0, 0.0)
        for x, y in path_extent(re.search(r' d="([^"]*)"', a).group(1)):
            x0, y0 = min(x0, x + tx - h), min(y0, y + ty - h)
            x1, y1 = max(x1, x + tx + h), max(y1, y + ty + h)
    if x0 < vx or y0 < vy or x1 > vx + vw or y1 > vy + vh:
        raise SystemExit(f"{sid}: drawing {x0:.1f} {y0:.1f} .. {x1:.1f} {y1:.1f} (incl. stroke width) "
                         f"leaves viewBox {vx:g} {vy:g} {vx + vw:g} {vy + vh:g}")


def build_svg():
    head = ('<svg xmlns="http://www.w3.org/2000/svg">\n'
            "<!-- Card symbol library (B-99). GENERATED by tools/cards/gen_symbols.py – do not edit by hand.\n"
            "     Use: <svg viewBox=\"0 0 100 120\"><use href=\"src/cards.svg?v=1#s-3\"/></svg>, colours via CSS\n"
            "     (color and the sym-ink, sym-face, sym-tint, sym-hatch custom properties), see style/cards.css. -->\n")
    return head + "\n".join(symbol(s) for s in SYM) + "\n</svg>\n"


# ------------------------------------------------------------------ colour tokens (cards.css)
def dark_of(hexs):
    r, g, b = (int(hexs[i:i + 2], 16) / 255 for i in (1, 3, 5))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    l = max(l, .62) if l < .62 else min(l + .04, .8)
    r, g, b = colorsys.hls_to_rgb(h, l, min(1, s * .95))
    return "#%02x%02x%02x" % (round(r * 255), round(g * 255), round(b * 255))


# Catalogue colours (light, dark or None = derived), from the R3 card catalogue.
COL = {
    "v0": ("#2f6fe0", "#4d8cff"), "vh": ("#b04fa6", "#d27ac8"), "v1": ("#1f8a3b", "#3fb85c"), "v2": ("#e6c35c", "#efd37a"),
    "v3": ("#f29e0c", "#ffb02e"), "v5": ("#3341d6", "#7d86ff"), "v8": ("#1c8ff0", "#4aaaff"), "v13": ("#e8bf55", "#f0cd6a"),
    "v20": ("#3fcf86", "#52dc96"), "v40": ("#6d2fd6", "#9a6cff"), "v100": ("#ec6a2c", "#ff8a52"), "vinf": ("#ef8f8f", "#ff9e9e"),
    "vbrk": ("#9a8466", "#b39d7e"), "vq": ("#c9d21c", "#d7df3a"), "vx": ("#f06aa8", "#ff86bc"), "vthink": ("#f2b02a", "#f5bd45"),
    "vdone": ("#3fcf5a", "#56dc6e"),
    "v4": ("#14bfae", None), "v6": ("#b02ccc", None), "v7": ("#0d9f48", None), "v9": ("#cc3360", None), "v10": ("#a0b43a", None),
    "v21": ("#36b9dc", None), "v34": ("#b86fe0", None), "v55": ("#2fb52a", None),
    "tXXS": ("#d47fe6", None), "tXS": ("#e88a46", None), "tS": ("#8fcf3f", None), "tM": ("#b3d84a", None), "tL": ("#167a8a", None),
    "tXL": ("#e06272", None), "tXXL": ("#14c4ae", None),
    "agreen": ("#5fbf2a", None), "ayellow": ("#e8d21e", None), "ared": ("#c8372e", None),
    "esatis": ("#a8c820", None), "eannoy": ("#ee6a45", None), "esad": ("#8a72dc", None), "eunint": ("#e6cf3c", None),
    "eangry": ("#de2430", None), "eenthu": ("#62b83a", None), "star": ("#f0cf3a", None), "vveto": ("#ef5a32", None),
    "j0": ("#265873", "#3a7b9c"), "j1": ("#4fa587", "#55b08f"), "j2": ("#8fbc3b", "#94c044"), "j3": ("#b54467", "#c45578"),
    "j4": ("#be5a40", "#cc6a4f"), "j5": ("#ded65f", "#d8d06a"), "j6": ("#b23b41", "#c74a50"),
    "g1": ("#b23b41", "#d65a5f"), "g2": ("#d0702c", "#ef8c45"), "g3": ("#d9a300", "#f0c43a"), "g4": ("#8fbc3b", "#a5d14f"),
    "g5": ("#3f9e6a", "#57c287"), "g6": ("#2f7fb8", "#5aa8e6"), "g7": ("#5b4fc4", "#8f84f0"),
}
# Fixed palette for custom cards (B-61/B-98): the only colours a team can pick (whitelist in cards.json).
PALETTE = {
    "red": ("#d23a3a", None), "orange": ("#ec6a2c", None), "amber": ("#f29e0c", None), "yellow": ("#e8d21e", None),
    "lime": ("#a0c428", None), "green": ("#2f9e4a", None), "teal": ("#14a89a", None), "cyan": ("#2aa8d8", None),
    "blue": ("#2f6fe0", None), "indigo": ("#4f4fd0", None), "violet": ("#8a4fd6", None), "pink": ("#e0559a", None),
    "brown": ("#9a7452", None), "grey": ("#7d8592", None),
}
COL = {k: (l, d or dark_of(l)) for k, (l, d) in COL.items()}
PALETTE = {k: (l, d or dark_of(l)) for k, (l, d) in PALETTE.items()}
INK_DARK, INK_LIGHT = "#1d2027", "#ffffff"


def _lum(hexs):
    c = [int(hexs[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= .03928 else ((x + .055) / 1.055) ** 2.4 for x in c]
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]


def contrast(a, b):
    la, lb = sorted((_lum(a), _lum(b)), reverse=True)
    return (la + .05) / (lb + .05)


def on_of(hexs):
    """text colour on a value colour: white only where it reads better than dark ink."""
    return INK_LIGHT if contrast(hexs, INK_LIGHT) >= contrast(hexs, INK_DARK) else INK_DARK


def tokens(group, idx):
    rows = []
    for k, v in group.items():
        rows.append(f"    --c-{k}: {v[idx]}; --on-c-{k}: {on_of(v[idx])};")
    return "\n".join(rows)


def build_css():
    return f"""/* Card colours and symbol defaults (B-99). GENERATED by tools/cards/gen_symbols.py – do not edit by hand.
 * Not yet linked in board.html (D1); the card renderer (F2) will use it together with src/cards.svg.
 *
 * Per colour two tokens: --c-<name> (value colour) and --on-c-<name> (text on that colour: dark ink on
 * light colours such as the yellows, white otherwise; WCAG contrast, whichever is higher).
 * Catalogue colours (v…, t…, a…, e…, j…, g…) belong to the predefined sets; the palette (red … grey)
 * is the fixed choice for custom cards.
 * Theme: dark is the default on body, light on body.light-theme (like style/style.css). */

/* Symbol colours, inherited into <use href="cards.svg#…">: set `color` to the value colour. */
body {{
    --cardc-face: #1b1f27;   /* card paper */
    --cardc-ink: #d9dee8;    /* outlines, text */
    --on-inv: #ffffff;      /* inverted style: symbol on the coloured square */
    --inv-o: #1d2027;       /* inverted style: outline of that symbol */
    --sym-ink: var(--cardc-ink);
    --sym-face: var(--cardc-face);
    /* currentColor resolves where the symbol is used: 22 % of the value colour on the paper */
    --sym-tint: color-mix(in srgb, currentColor 22%, var(--cardc-face));

    /* catalogue */
{tokens(COL, 1)}

    /* palette for custom cards */
{tokens(PALETTE, 1)}
}}

body.light-theme {{
    --cardc-face: #fbfaf5;
    --cardc-ink: #1d2027;

    /* catalogue */
{tokens(COL, 0)}

    /* palette for custom cards */
{tokens(PALETTE, 0)}
}}
"""


# ------------------------------------------------------------------ preview (developers only)
# symbol -> catalogue colour of the card that uses it today
SYM_COLOUR = {"s-half": "vh", "s-inf": "vinf", "s-coffee": "vbrk", "s-question": "vq", "s-exclam": "vx",
              "s-hand": "vveto", "s-check": "vdone", "s-thought": "vthink", "s-mask": "vthink", "s-frame-inv": "j3"}
for _v in ("0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "13", "20", "21", "34", "40", "55", "100"):
    SYM_COLOUR[f"s-{_v}"] = {"20": "v20", "40": "v40"}.get(_v, f"v{_v}")
SYM_COLOUR.update({"s-xxs": "tXXS", "s-xs": "tXS", "s-s": "tS", "s-m": "tM", "s-l": "tL", "s-xl": "tXL", "s-xxl": "tXXL",
                   "s-light-green": "agreen", "s-light-yellow": "ayellow", "s-light-red": "ared",
                   "s-face-satisfied": "esatis", "s-face-annoyed": "eannoy", "s-face-sad": "esad",
                   "s-face-uninterested": "eunint", "s-face-angry": "eangry", "s-face-enthusiastic": "eenthu"})
for _k in range(6):
    SYM_COLOUR[f"s-stars-{_k}"] = "star"


def build_preview():
    def use(sid, vb="0 0 100 120"):
        return f'<svg viewBox="{vb}" aria-hidden="true"><use href="../../src/cards.svg#{sid}"/></svg>'

    tiles = []
    for sid in SYM:
        if sid == "s-frame-inv":
            continue
        c = SYM_COLOUR[sid]
        tiles.append(f'<figure class="t" style="color:var(--c-{c})"><div class="card">{use(sid)}</div>'
                     f'<div class="deck">{use(sid)}</div><figcaption><code>{sid}</code><br>--c-{c}</figcaption></figure>')
    judge = "".join(
        f'<figure class="t inv" style="color:var(--c-j{k})"><div class="card"><svg viewBox="0 0 100 100" aria-hidden="true">'
        f'<use href="../../src/cards.svg#s-frame-inv" style="--sym-tint:currentColor;'
        f'--sym-hatch:color-mix(in srgb,var(--cardc-ink) 18%,currentColor)"/>'
        f'<use href="../../src/cards.svg#s-{k}" x="10" y=".4" width="80" height="96" style="--sym-ink:var(--inv-o);'
        f'--sym-tint:var(--on-c-j{k});--sym-hatch:transparent"/>'
        f'</svg></div><figcaption><code>s-frame-inv + s-{k}</code><br>--c-j{k}</figcaption></figure>' for k in range(7))
    chips = "".join(f'<span class="chip" style="background:var(--c-{k});color:var(--on-c-{k})">{k}</span>' for k in list(COL) + list(PALETTE))
    pal = "".join(f'<figure class="t" style="color:var(--c-{k})"><div class="deck">{use("s-stars-3")}</div>'
                  f'<figcaption>--c-{k}</figcaption></figure>' for k in PALETTE)
    return f"""<!DOCTYPE html>
<!-- GENERATED by tools/cards/gen_symbols.py. Developers only: preview of src/cards.svg and style/cards.css.
     Serve the repository root over http (external <use> does not work from file://), e.g.
     python3 -m http.server 8099  ->  http://localhost:8099/tools/cards/preview.html (?light for the light theme) -->
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Card symbols (preview)</title>
<link rel="stylesheet" href="../../style/cards.css">
<style>
body {{ margin: 0; padding: 16px; font: 13px ui-monospace, Menlo, Consolas, monospace; background: #0c0e12; color: #d9dee8; }}
body.light-theme {{ background: #f7f6f1; color: #1d2027; }}
h2 {{ font-size: 14px; margin: 24px 0 8px; }}
.grid {{ display: flex; flex-wrap: wrap; gap: 12px; }}
.t {{ margin: 0; width: 132px; display: flex; flex-wrap: wrap; align-items: flex-end; gap: 6px; }}
.card {{ width: 84px; aspect-ratio: 100 / 148; background: var(--cardc-face); border: 1px solid #586174; border-radius: 9px;
        display: grid; place-items: center; }}
.card svg {{ width: 84%; }}
.deck {{ width: 38px; aspect-ratio: 100 / 148; background: var(--cardc-face); border: 1px solid #586174; border-radius: 5px;
        display: grid; place-items: center; }}
.deck svg {{ width: 86%; }}
.inv .card svg {{ width: 88%; }}
figcaption {{ width: 100%; font-size: 10px; opacity: .8; }}
.chip {{ display: inline-block; margin: 2px; padding: 2px 6px; border-radius: 3px; font-weight: bold; }}
</style></head>
<body>
<script>if (location.search.indexOf('light') >= 0) document.body.classList.add('light-theme');</script>
<h2>Symbols ({len(SYM)}) - table card and deck card, colour of today's card</h2>
<div class="grid">{"".join(tiles)}</div>
<h2>Inverted style (J.U.D.G.E.): s-frame-inv + value symbol</h2>
<div class="grid">{judge}</div>
<h2>Palette for custom cards</h2>
<div class="grid">{pal}</div>
<h2>Text on colour (--on-c-…)</h2>
<div>{chips}</div>
</body></html>
"""


def main():
    svg = build_svg()
    xml.dom.minidom.parseString(svg)   # fail loudly on malformed output
    with open(OUT_SVG, "w", encoding="utf-8", newline="\n") as f:
        f.write(svg)
    with open(OUT_CSS, "w", encoding="utf-8", newline="\n") as f:
        f.write(build_css())
    with open(OUT_PREVIEW, "w", encoding="utf-8", newline="\n") as f:
        f.write(build_preview())
    print(f"{OUT_SVG}: {len(SYM)} symbols, {len(svg.encode())} bytes")
    print(f"{OUT_CSS}: {len(COL)} catalogue colours, {len(PALETTE)} palette colours")


if __name__ == "__main__":
    main()
