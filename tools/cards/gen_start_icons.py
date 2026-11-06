#!/usr/bin/env python3
"""Print the two sketched step pictures of the start page (init.html, R3 start page): a pencil (Name) and a
chain (Invite), drawn with the helpers of gen_symbols.py, so they look like the card symbols
(ink outline, tint, hatching, wobble). Not part of src/cards.svg: init.html carries them inline.

The chain: two links at different angles, the end of each one through the hole of the other. They
interlock like a real chain: the lower link is drawn first, then the upper one, then the upper half of
the lower link once more on top (over()), so each link lies in front at one crossing and behind at the
other.

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


# pencil: axis from the tip (10, 106) up to the right; body width 30 (as much room as the chain link and the card)
ux, uy = 1 / math.sqrt(2), -1 / math.sqrt(2)     # along the pencil
px, py = 1 / math.sqrt(2), 1 / math.sqrt(2)      # across
def at(s, w):
    return (10 + ux * s + px * w, 106 + uy * s + py * w)

g.DIG["st_body"] = f'<path d="{pts_d([at(26, -15), at(88, -15), at(88, 15), at(26, 15)])}"/>'
g.DIG["st_cap"] = f'<path d="{pts_d([at(88, -15), at(104, -15), at(104, 15), at(88, 15)])}"/>'
g.DIG["st_wood"] = f'<path d="{pts_d([at(0, 0), at(26, -15), at(26, 15)])}"/>'
g.DIG["st_lead"] = f'<path d="{pts_d([at(0, 0), at(9, -5.2), at(9, 5.2)])}"/>'
# chain: two links, centres 46 apart on the diagonal, turned -26 and -64 degrees (not near the hatching angle of
# -32: there the hatching grazes the inner edge of a link and leaves tiny ticks)
LINK_W = 8
LINK_ANGLE = -26
CHAIN = (50, 60)
C1 = (CHAIN[0] - 23 * math.cos(math.radians(45)), CHAIN[1] + 23 * math.sin(math.radians(45)))
C2 = (CHAIN[0] + 23 * math.cos(math.radians(45)), CHAIN[1] - 23 * math.sin(math.radians(45)))
g.DIG["st_link1"] = f'<path d="{stadium(*C1, 58, 16, LINK_ANGLE)}"/>'
g.DIG["st_link2"] = f'<path d="{stadium(*C2, 58, 16, -90 - LINK_ANGLE)}"/>'


def side(p, o, u):
    """> 0 if p lies to the right of the line through o along u (y down)"""
    return u[0] * (p[1] - o[1]) - u[1] * (p[0] - o[0])


def cut(a, b, o, u):
    sa, sb = side(a, o, u), side(b, o, u)
    t = sa / (sa - sb)
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def clip_open(pts, o, u):
    """the parts of an open polyline on the positive side of the line"""
    out, cur = [], []
    for i, p in enumerate(pts):
        inside = side(p, o, u) > 0
        if i and (side(pts[i - 1], o, u) > 0) != inside:
            cur.append(cut(pts[i - 1], p, o, u))
            if not inside:
                out.append(cur)
                cur = []
        if inside:
            cur.append(p)
    out.append(cur)
    return [c for c in out if len(c) > 1]


def run_on_side(ring, o, u):
    """the one stretch of a closed ring on the positive side of the line, with exact end points"""
    k = len(ring)
    ins = [side(p, o, u) > 0 for p in ring]
    i = next(j for j in range(k) if ins[j] and not ins[j - 1])
    pts = [cut(ring[i - 1], ring[i], o, u)]
    while ins[i % k]:
        pts.append(ring[i % k])
        i += 1
    pts.append(cut(ring[(i - 1) % k], ring[i % k], o, u))
    return pts


def trim(pts, e):
    """shorten an open polyline by e at both ends"""
    def front(p):
        rest = e
        while len(p) > 1:
            d = math.dist(p[0], p[1])
            if d > rest:
                t = rest / d
                return [(p[0][0] + (p[1][0] - p[0][0]) * t, p[0][1] + (p[1][1] - p[0][1]) * t)] + p[1:]
            rest -= d
            p = p[1:]
        return p
    return front(front(pts)[::-1])[::-1]


def over(ref, w, o, u):
    """The stretch of an L() line on the positive side of the line through o along u, drawn once more on top:
    the same (wobbled) outline, tint and hatching, cut off square. The ink stops 1 short of the tint (it is shifted
    by SHIFT / 2), so the joints to the first drawing don't show."""
    subs, sc = g.shape(ref)
    wa = w * sc
    ring = g.outline_polys(subs)[0][0]
    if math.dist(ring[0], ring[-1]) < .05:
        ring = ring[:-1]
    piece = run_on_side(ring, o, u)
    ink = [(x + g.SHIFT[0] / 2, y + g.SHIFT[1] / 2) for x, y in trim(piece, 1)]
    r = g.Raster()
    r.stroke(subs, wa)
    hatch = [q for pts, _ in g.hatch_polys(r, g.bbox_of(subs, wa / 2 + 1)) for q in clip_open(pts, o, u)]
    butt = ' stroke-linecap="butt"'
    return [g.el(g.d_of([(ink, False)]), f"stroke:{g.INK}", wa + 2 * g.O + math.hypot(*g.SHIFT), butt),
            g.el(g.d_of([(piece, False)]), f"stroke:{g.TINT}", wa, butt),
            g.el(g.d_of([(h, False) for h in hatch]), f"stroke:{g.HATCH}", g.HATCH_W, butt)]


g.SYM["st-name"] = ([g.S("st_body"), g.E("st_cap"), g.E("st_wood"), g.P("st_lead", fill=g.INK),
                     g.T("M44 113c5-4 8 2 13-1s8-4 12 0 7 1 11-2", 3)], "pencil")
g.SYM["st-invite"] = ([g.L("st_link1", w=LINK_W), g.L("st_link2", w=LINK_W)], "chain")
# The cut through the lower link, where its upper half (in front) meets its lower half (behind): from the middle of
# the stretch that runs through the upper link's hole (as far from the upper link as it gets) to the centre of its
# left end (there the cut crosses the line at a right angle). Both joints thus lie where nothing else is drawn.
AXIS1 = (math.cos(math.radians(LINK_ANGLE)), math.sin(math.radians(LINK_ANGLE)))
CUT_IN_HOLE = (57.2, 59.6)
CUT_LEFT = (C1[0] - 13 * AXIS1[0], C1[1] - 13 * AXIS1[1])


def chain():
    """st-invite: the lower link, the upper link, then the upper half of the lower link on top again"""
    parts = []
    for it in g.SYM["st-invite"][0]:
        parts += g.layers(it)
    u = (CUT_LEFT[0] - CUT_IN_HOLE[0], CUT_LEFT[1] - CUT_IN_HOLE[1])     # pointing left: positive side = above
    parts += over("st_link1", LINK_W, CUT_IN_HOLE, u)
    g.check_bounds("st-invite", "\n".join(parts))
    return f'<symbol id="st-invite" viewBox="0 0 100 120"{g.PRES}>\n' + "\n".join(g.merge(parts)) + "\n</symbol>"


if __name__ == "__main__":
    print(g.symbol("st-name"))
    print(chain())
