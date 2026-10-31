# Card symbols (B-99, R3)

`gen_symbols.py` generates the symbol library for the rendered cards. Standard library only,
deterministic. The generated files are committed (the app has no build step):

| File | Content |
|---|---|
| `src/cards.svg` | sprite, one `<symbol id="s-…">` per symbol (viewBox `0 0 100 120`, `s-frame-inv`: `0 0 100 100`) |
| `style/cards.css` | colour tokens `--c-<name>` / `--on-c-<name>` (dark on `body`, light on `body.light-theme`), symbol defaults `--sym-*` |
| `tools/cards/preview.html` | preview for developers |

```bash
python3 tools/cards/gen_symbols.py                  # regenerate all three files
python3 -m http.server 8099                         # from the repository root
# http://localhost:8099/tools/cards/preview.html    (?light for the light theme)
```

The generator aborts if a symbol (outlines incl. half the stroke width) leaves its viewBox.
After a change: raise `?v=` wherever `cards.svg`/`cards.css` are referenced (once they are linked, F2).

## Use

```html
<svg viewBox="0 0 100 120" style="color: var(--c-v3)"><use href="src/cards.svg?v=1#s-3"/></svg>
```

Wobble and hatching are baked into the paths (no SVG filter, no mask). Colours come from CSS and
are inherited into the `<use>`:

| Property | Meaning | Default (`cards.css`) |
|---|---|---|
| `color` | value colour (tint, hatching) | – set per card |
| `--sym-ink` | outlines, details | `--cardc-ink` (theme) |
| `--sym-face` | paper (empty stars, traffic-light housing) | `--cardc-face` (theme) |
| `--sym-tint` | body of lines/shapes | 22 % `color` on `--cardc-face` |
| `--sym-hatch` | hatching | `currentColor` |

Inverted style (J.U.D.G.E.): frame plus value symbol, see the preview:

```html
<svg viewBox="0 0 100 100" style="color: var(--c-j3)">
  <use href="src/cards.svg#s-frame-inv" style="--sym-tint: currentColor;
       --sym-hatch: color-mix(in srgb, var(--cardc-ink) 18%, currentColor)"/>
  <use href="src/cards.svg#s-3" x="10" y=".4" width="80" height="96"
       style="--sym-ink: var(--inv-o); --sym-tint: var(--on-inv); --sym-hatch: transparent"/>
</svg>
```

The value symbol is always dark ink (`--on-inv`) with a light outline (`--inv-o`); the generator lightens
the `j…` square colours until dark ink reaches 3.5:1 on them.

Further symbol defaults: `--sym-strong` / `--sym-hatch-strong` (filled stars), `--sym-faint` (empty stars:
faint outline only), `--sym-hood` / `--sym-bubble` (`s-mask`: black hood, grey thought bubble). Faces are
hatched only in a thin crescent at the edge; the laughing mouth of `s-face-enthusiastic` is paper.

## Symbol ids (50)

| Group | Ids |
|---|---|
| Values | `s-0` … `s-10`, `s-13`, `s-20`, `s-21`, `s-34`, `s-40`, `s-55`, `s-100`, `s-half` (½), `s-inf` (∞) |
| T-shirt | `s-xxs`, `s-xs`, `s-s`, `s-m`, `s-l`, `s-xl`, `s-xxl` |
| Traffic light | `s-light-green`, `s-light-yellow`, `s-light-red` |
| Emotions | `s-face-satisfied`, `s-face-annoyed`, `s-face-sad`, `s-face-uninterested`, `s-face-angry`, `s-face-enthusiastic` |
| Stars | `s-stars-0` … `s-stars-5` (five stars, the first n filled) |
| Control cards | `s-coffee` (☕ need a break), `s-question` (?), `s-exclam` (! important), `s-hand` (✋ veto) |
| Status cards | `s-check` (ready), `s-thought` (thinking), `s-mask` (thinking, anonymous mode) |
| Frames | `s-frame-inv` (inverted style) |

Ids name the motif, not the card: one symbol can be used by several cards (`s-3` in Fibonacci,
J.U.D.G.E. and Delegation) and chosen for custom cards. Never rename an id once it is used in
`cards.json` or in custom sets in the database; add new symbols instead.

## Colours

Catalogue tokens (predefined sets, colour of today's card): `v0 vh v1 … v100 vinf` (values), `vbrk vq vx vveto`
(control cards), `vthink vdone` (status), `tXXS … tXXL`, `agreen ayellow ared`, `esatis … eenthu`, `star`,
`j0 … j6` (J.U.D.G.E.), `g1 … g7` (Delegation).

Palette for custom cards (the only allowed choice, whitelist for the API):
`red orange amber yellow lime green teal cyan blue indigo violet pink brown grey`.

`--on-c-<name>` is the text colour on that colour (dark ink or white, whichever has the higher contrast).
