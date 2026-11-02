#!/usr/bin/env python3
"""Print the two sketched step pictures of the start page (init.html, R3 start page): a pencil (Name) and a
chain link (Invite), drawn with the helpers of gen_symbols.py, so they look like the card symbols
(ink outline, tint, hatching, wobble). Not part of src/cards.svg: init.html carries them inline.

    python3 tools/cards/gen_start_icons.py    # paste the output into the sprite of init.html
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_symbols as g  # noqa: E402


def pts_d(points):
    return "M" + "L".join(f"{g.n(x)} {g.n(y)}" for x, y in points) + "z"


def stadium(cx, cy, length, r, angle, steps=10):
    """a rounded chain link around (cx, cy), turned by angle (degrees)"""
    a = math.radians(angle)
    ca, sa = math.cos(a), math.sin(a)
    half = length / 2 - r
    pts = []
    for i in range(steps + 1):          # right end
        t = -math.pi / 2 + math.pi * i / steps
        pts.append((half + r * math.cos(t), r * math.sin(t)))
    for i in range(steps + 1):          # left end
        t = math.pi / 2 + math.pi * i / steps
        pts.append((-half + r * math.cos(t), r * math.sin(t)))
    return pts_d([(cx + x * ca - y * sa, cy + x * sa + y * ca) for x, y in pts])


# pencil: axis from the tip (20, 100) up to the right; body width 24
ux, uy = 1 / math.sqrt(2), -1 / math.sqrt(2)     # along the pencil
px, py = 1 / math.sqrt(2), 1 / math.sqrt(2)      # across
def at(s, w):
    return (20 + ux * s + px * w, 100 + uy * s + py * w)

g.DIG["st_body"] = f'<path d="{pts_d([at(22, -12), at(80, -12), at(80, 12), at(22, 12)])}"/>'
g.DIG["st_cap"] = f'<path d="{pts_d([at(80, -12), at(96, -12), at(96, 12), at(80, 12)])}"/>'
g.DIG["st_wood"] = f'<path d="{pts_d([at(0, 0), at(22, -12), at(22, 12)])}"/>'
g.DIG["st_lead"] = f'<path d="{pts_d([at(0, 0), at(8, -4.4), at(8, 4.4)])}"/>'
g.DIG["st_link1"] = f'<path d="{stadium(37, 74, 50, 14, -45)}"/>'
g.DIG["st_link2"] = f'<path d="{stadium(63, 48, 50, 14, -45)}"/>'

g.SYM["st-name"] = ([g.S("st_body"), g.E("st_cap"), g.E("st_wood"), g.P("st_lead", fill=g.INK),
                     g.T("M40 112c5-4 8 2 13-1s8-4 12 0 7 1 11-2", 2.6)], "pencil")
g.SYM["st-invite"] = ([g.L("st_link1", w=9), g.L("st_link2", w=9)], "chain link")

if __name__ == "__main__":
    for sid in ("st-name", "st-invite"):
        print(g.symbol(sid))
