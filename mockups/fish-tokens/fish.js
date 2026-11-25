/* Fish tokens mockup: a donation gives thank-you tokens, tokens load the emoji bar or a fish blocker.
   Static, throw-away: no API calls, no analytics, fake data only (in memory, mirrored to localStorage).
   All texts go through textContent (h()). Mockup states: handle on the left edge or key M.
   Deep links: ?state=board|bar|load|support|checkout|code|blocker &mode=light &motion=reduced &clean=1 &redeem=CODE */
'use strict';

const $ = s => document.querySelector(s);
const SVGNS = 'http://www.w3.org/2000/svg';
function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v);
    for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : String(k));
    return e;
}
function sv(tag, attrs, ...kids) {
    const e = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    kids.forEach(k => e.append(k));
    return e;
}
const icon = (id, cls) => sv('svg', { class: cls || 'i', 'aria-hidden': 'true' }, sv('use', { href: '#i-' + id }));
const tok = () => icon('tok', 'tok');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const center = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
const reduced = () => S.motion === 'reduced' || typeof Element.prototype.animate !== 'function';

/* ---------------------------------------------------------------- data (examples only) */
const EMOJI = [['cake', '🎂', 'Cake'], ['heart', '❤️', 'Heart'], ['clap', '👏', 'Applause'], ['party', '🎉', 'Party'],
    ['think', '🤔', 'Thinking'], ['thumbs', '👍', 'Thumbs up'], ['fish', '🐟', 'Fish']];
const GLYPH = Object.fromEntries(EMOJI.map(e => [e[0], e[1]]));
const PACKS = [{ eur: 3, tok: 50 }, { eur: 5, tok: 100, tag: 'popular' }, { eur: 10, tok: 250 }]; // placeholders
const ME = 'me';
const PLAYERS = [
    { id: 'vf', name: 'vf', card: 'back' },
    { id: 'kim', name: 'Kim', card: 'back', blocker: 3 },
    { id: ME, name: 'Sam', card: '5' },
    { id: 'lena', name: 'Lena', card: 'back' },
    { id: 'ole', name: 'Ole', card: 'back' },
    { id: 'priya', name: 'Priya', card: 'back' }
];
const byId = id => PLAYERS.find(p => p.id === id);
const STORE = 'FISH_TOKENS_MOCK';
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
const newCode = () => 'FISH-' + [4, 4].map(n => Array.from({ length: n }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')).join('-');

/* W: the wallet of this browser. codes: [{ code, bal }] (the balance belongs to the code; a redeemed gift is linked
   here as a second code). loaded: tokens put on the bar (they stay there). used: today's free throws. */
const emptyWallet = () => ({ codes: [], dead: [], loaded: {}, used: {}, blockerOn: true });
const richWallet = () => ({ codes: [{ code: 'FISH-7KQ2-M9XA', bal: 37 }], dead: [], loaded: { fish: 12, heart: 3, party: 2, shield: 5 }, used: { fish: true }, blockerOn: true });
let W = emptyWallet();
const S = { state: 'board', mode: 'dark', motion: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full', clean: false };
const balance = () => W.codes.reduce((a, c) => a + c.bal, 0);
const loaded = k => W.loaded[k] || 0;
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(W)); } catch (e) { /* private mode: memory only */ } };
function spend(n) { // takes n tokens from the codes, first one first
    if (balance() < n) return false;
    for (const c of W.codes) { const t = Math.min(c.bal, n); c.bal -= t; n -= t; if (!n) break; }
    return true;
}

/* ---------------------------------------------------------------- the table */
const CARD_COLOR = { '5': '#9765d7' };
function renderTable() {
    const box = $('#cbox');
    box.replaceChildren(...PLAYERS.map(p => {
        const me = p.id === ME;
        const face = p.card === 'back' ? h('div', { class: 'pc back' })
            : h('div', { class: 'pc', style: '--cc:' + CARD_COLOR[p.card] },
                sv('svg', { viewBox: '0 0 100 120', 'aria-label': p.card }, sv('use', { href: '../../src/cards.svg?v=11#s-' + p.card })));
        const c = h('div', { class: 'c' + (me ? ' is-me' : ''), 'data-id': p.id }, h('span', { class: 'nm' }, p.name), face);
        if (me) {
            if (loaded('shield') > 0) {
                const b = h('button', { type: 'button', class: 'shield-badge' + (W.blockerOn ? '' : ' off'), id: 'shieldBadge',
                    title: W.blockerOn ? 'Fish blocker on – click to pause' : 'Fish blocker paused – click to turn on',
                    'aria-label': 'Fish blocker ' + (W.blockerOn ? 'on' : 'paused') + ', ' + loaded('shield') + ' charges', 'aria-pressed': String(W.blockerOn) },
                icon('shield'), String(loaded('shield')));
                c.append(b);
            }
        } else {
            c.append(h('button', { type: 'button', class: 'circ nudge', 'aria-label': 'Nudge ' + p.name, title: 'Nudge' }, nudgeIcon()),
                h('button', { type: 'button', class: 'circ react', 'aria-label': 'Throw a reaction at ' + p.name, title: 'Throw a reaction',
                    'aria-haspopup': 'menu', 'aria-expanded': String(bar.to === p.id) }, smileIcon()));
        }
        return c;
    }));
}
function smileIcon() {
    return sv('svg', { viewBox: '0 0 24 24', class: 'smile', 'aria-hidden': 'true' },
        sv('path', { class: 'body', d: 'M12 3.6c4.7-.1 8.3 3.6 8.3 8.4 0 4.7-3.7 8.4-8.4 8.4-4.6 0-8.3-3.8-8.3-8.5 0-4.6 3.8-8.2 8.4-8.3z' }),
        sv('path', { class: 'hatch', d: 'M5.6 13.9l2.2-1.9M6.6 16.6l3-2.6M15.9 16.4l2.6-2.3' }),
        sv('path', { class: 'ink', d: 'M12 3.6c4.7-.1 8.3 3.6 8.3 8.4 0 4.7-3.7 8.4-8.4 8.4-4.6 0-8.3-3.8-8.3-8.5 0-4.6 3.8-8.2 8.4-8.3zM9.3 9.3v1.6M14.7 9.2v1.6M8.2 14c1.9 2.6 5.8 2.6 7.6-.2' }));
}
function nudgeIcon() {
    return sv('svg', { viewBox: '0 0 24 24', class: 'smile', 'aria-hidden': 'true' },
        sv('path', { class: 'body', d: 'M7.7 6.3l5.8-1.3c1.1-.2 1.8.2 2.1 1.3l2 9.8c.3 1.1-.1 1.8-1.3 2l-5.8 1.3c-1.1.2-1.8-.2-2.1-1.3l-2-9.8c-.3-1.1.2-1.8 1.3-2z' }),
        sv('path', { class: 'ink', d: 'M7.7 6.3l5.8-1.3c1.1-.2 1.8.2 2.1 1.3l2 9.8c.3 1.1-.1 1.8-1.3 2l-5.8 1.3c-1.1.2-1.8-.2-2.1-1.3l-2-9.8c-.3-1.1.2-1.8 1.3-2zM8.2 8.6l6-1.3M4.4 7.4c-1 1.3-1.1 2.8-.3 4.2M19.9 12.9c1 1.3 1 2.8.1 4.2' }));
}
const cardOf = id => document.querySelector('.c[data-id="' + id + '"]');
const faceOf = id => cardOf(id)?.querySelector('.pc');

/* ---------------------------------------------------------------- the emoji bar */
const bar = { to: null, loading: false };
function openBar(to, loading) {
    bar.to = to; bar.loading = !!loading;
    renderTable(); renderBar();
    $('#bar').hidden = false; placeBar();
    $('#bar .em')?.focus({ preventScroll: true });
}
function closeBar() {
    if (bar.to === null) return;
    const to = bar.to;
    bar.to = null; bar.loading = false; $('#bar').hidden = true; renderTable();
    cardOf(to)?.querySelector('.react')?.focus({ preventScroll: true });
}
function placeBar() {
    const el = $('#bar'), btn = cardOf(bar.to)?.querySelector('.react');
    if (!btn || el.hidden) return;
    const a = btn.getBoundingClientRect(), w = el.offsetWidth, hh = el.offsetHeight, vw = innerWidth, mid = a.left + a.width / 2;
    const left = Math.max(8, Math.min(mid - w / 2, vw - w - 8));
    let top = a.top - hh - 10;
    const below = top < 56;
    if (below) top = a.bottom + 10;
    el.classList.toggle('is-below', below);
    el.style.left = Math.round(left) + 'px'; el.style.top = Math.round(top) + 'px';
    el.style.setProperty('--arrow-x', Math.round(Math.max(14, Math.min(mid - left, w - 14))) + 'px');
}
function leftLabel(k) {
    const free = W.used[k] ? 0 : 1, ld = loaded(k);
    return h('span', { class: 'left', 'aria-hidden': 'true' }, h('span', { class: 'fr' }, free + '×'), ld ? h('span', { class: 'ld' }, '+' + Math.min(ld, 999)) : null,
        bar.loading && !ld ? h('span', { class: 'ld', style: 'color:var(--muted);font-weight:normal' }, '0') : null);
}
function renderBar() {
    const el = $('#bar'), to = byId(bar.to);
    if (!to) return;
    el.classList.toggle('loading', bar.loading);
    const label = bar.loading
        ? h('p', { class: 'react-bar-label', id: 'barLabel' }, tok(), 'load your bar · ', h('span', { class: 'amt' }, String(balance())), ' tokens left')
        : h('p', { class: 'react-bar-label', id: 'barLabel' }, 'throw at ', h('b', null, to.name));
    const row = h('div', { class: 'react-bar-row' }, EMOJI.map(([k, g, name]) => {
        const free = W.used[k] ? 0 : 1, ld = loaded(k), out = !bar.loading && free + ld === 0;
        const aria = bar.loading ? 'Load ' + name + ' (' + ld + ' loaded)' : name + ' – ' + (free ? '1 free today' : 'free throw used') + (ld ? ', ' + ld + ' loaded' : '');
        return h('button', { type: 'button', role: 'menuitem', class: 'em', 'data-k': k, 'aria-label': aria, title: aria, 'aria-disabled': out ? 'true' : null },
            h('span', { class: 'g' }, g), leftLabel(k));
    }));
    if (bar.loading) row.append(h('button', { type: 'button', role: 'menuitem', class: 'em shield-slot', 'data-k': 'shield',
        'aria-label': 'Load fish blocker (' + loaded('shield') + ' charges)', title: 'Fish blocker – each charge stops one fish thrown at you' },
    h('span', { class: 'g shield-g' }, icon('shield')), h('span', { class: 'left' }, h('span', { class: 'ld' }, '+' + loaded('shield')))));
    let foot;
    const anyLoaded = Object.values(W.loaded).some(n => n > 0);
    if (bar.loading) {
        foot = h('div', { class: 'bar-foot' }, walletChip(),
            balance() ? h('span', { class: 'load-tip' }, 'tap +1 · hold · drag coin +5')
                : h('button', { type: 'button', class: 'support-hint', 'data-go': 'support' }, h('span', { class: 'hrt' }, '♥'), ' get tokens'),
            h('button', { type: 'button', class: 'btn-done', id: 'barDone' }, 'Done'));
    } else if (balance() || anyLoaded) {
        foot = h('div', { class: 'bar-foot' }, walletChip(),
            h('button', { type: 'button', class: 'support-hint', 'data-go': 'support' }, h('span', { class: 'hrt' }, '♥'), ' support us'));
    } else {
        foot = h('div', { class: 'bar-foot only-hint' },
            h('button', { type: 'button', class: 'support-hint', 'data-go': 'support' }, h('span', { class: 'hrt' }, '♥'), ' Support us · get more throws'));
    }
    el.replaceChildren(label, row, foot);
    placeBar();
}
function walletChip() {
    return h('button', { type: 'button', class: 'wallet-chip', id: 'walletChip', title: bar.loading ? 'Drag a coin onto an emoji (+5)' : 'Load your bar with tokens',
        'aria-label': balance() + ' tokens – ' + (bar.loading ? 'drag onto an emoji to load 5' : 'load your bar') }, tok(), h('span', { class: 'amt' }, String(balance())),
    bar.loading ? null : ' · load');
}

/* load one slot with n tokens (a coin flies from the chip into the slot) */
function loadSlot(k, n, from) {
    n = Math.min(n, balance());
    if (n <= 0) { $('#walletChip')?.classList.remove('shake'); void document.body.offsetWidth; $('#walletChip')?.classList.add('shake'); toastNoTokens(); return false; }
    spend(n);
    W.loaded[k] = loaded(k) + n;
    save();
    const btn = $('#bar .em[data-k="' + k + '"]');
    const end = btn ? center(btn) : null;
    const start = from || ($('#walletChip') ? center($('#walletChip')) : end);
    renderBar(); renderTable(); renderMenuIfOpen(); updateYou();
    const nb = $('#bar .em[data-k="' + k + '"]');
    if (nb) { nb.classList.remove('gulp'); void nb.offsetWidth; nb.classList.add('gulp'); }
    if (end) {
        const pop = h('span', { class: 'plus-one', style: `left:${end.x}px;top:${end.y - 30}px` }, '+' + n);
        document.body.append(pop); setTimeout(() => pop.remove(), 800);
        if (!reduced() && start) {
            const c = icon('tok', 'tok coin-fly');
            document.body.append(c);
            c.animate(curve(start, end, { arc: 40, steps: 6, s0: 0.8, half: 10 }), { duration: 260, easing: 'ease-in' }).onfinish = () => c.remove();
        }
    }
    return true;
}
let lastNoTok = 0;
function toastNoTokens() {
    if (Date.now() - lastNoTok < 2500) return;
    lastNoTok = Date.now();
    toast('Out of tokens.', 'Get tokens', () => { closeBar(); openMenu(true); });
}

/* hold to load: +1 at once, then faster and faster */
let hold = null;
function startHold(k) {
    stopHold();
    if (!loadSlot(k, 1)) return;
    let delay = 320;
    const tick = () => { if (!loadSlot(k, 1)) return stopHold(); delay = Math.max(45, delay * 0.78); hold = setTimeout(tick, delay); };
    hold = setTimeout(tick, delay);
}
function stopHold() { clearTimeout(hold); hold = null; }

/* drag a coin from the wallet chip onto a slot: +5 */
let drag = null;
function startDrag(e) {
    drag = { x: e.clientX, y: e.clientY, moved: false, ghost: null, hot: null };
}
function moveDrag(e) {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    if (!drag.moved) {
        drag.moved = true;
        if (!bar.loading) { bar.loading = true; renderBar(); }
        drag.ghost = h('span', { class: 'coin-drag' }, tok(), '+5');
        document.body.append(drag.ghost);
    }
    drag.ghost.style.transform = `translate(${e.clientX - 14}px, ${e.clientY - 34}px)`;
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('#bar .em');
    if (drag.hot !== over) { drag.hot?.classList.remove('drop-hot'); over?.classList.add('drop-hot'); drag.hot = over; }
}
function endDrag(e) {
    if (!drag) return;
    const d = drag; drag = null;
    d.ghost?.remove(); d.hot?.classList.remove('drop-hot');
    if (!d.moved) { if (!bar.loading) { bar.loading = true; renderBar(); $('#bar .em')?.focus(); } return; }
    if (d.hot) loadSlot(d.hot.dataset.k, 5, { x: e.clientX, y: e.clientY });
}

/* ---------------------------------------------------------------- throwing */
function throwFromBar(k) {
    const to = bar.to;
    if (W.used[k] && !loaded(k)) {
        const name = EMOJI.find(e => e[0] === k)[2].toLowerCase();
        if (balance()) toast('Today’s ' + name + ' is used – load it with tokens.', 'Load', () => { bar.loading = true; renderBar(); });
        else toast('You’ve used today’s ' + name + ' – back tomorrow.', '♥ Get more throws', () => { closeBar(); openMenu(true); });
        return;
    }
    if (!W.used[k]) W.used[k] = true; else W.loaded[k]--;
    save(); closeBar(); renderMenuIfOpen(); // like the live bar: closes after a throw
    throwEmoji(ME, to, k);
}

/* a quadratic curve as keyframes: arc = how high above the higher end, spin in degrees, scale from s0 to s1 */
function curve(a, b, { arc = 60, steps = 12, spin = 0, r0 = 0, s0 = 1, s1 = 1, mid = 0, half = 20 } = {}) {
    const ctrl = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - arc };
    const fr = [];
    for (let i = 0; i <= steps; i++) {
        const k = i / steps, x = (1 - k) ** 2 * a.x + 2 * (1 - k) * k * ctrl.x + k * k * b.x, y = (1 - k) ** 2 * a.y + 2 * (1 - k) * k * ctrl.y + k * k * b.y;
        const sc = s0 + (s1 - s0) * k + mid * Math.sin(Math.PI * k);
        fr.push({ transform: `translate(${(x - half).toFixed(1)}px, ${(y - half).toFixed(1)}px) rotate(${Math.round(r0 + spin * k)}deg) scale(${sc.toFixed(2)})`, offset: k });
    }
    return fr;
}
const pointOn = (a, b, arc, k) => {
    const c = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - arc };
    return { x: (1 - k) ** 2 * a.x + 2 * (1 - k) * k * c.x + k * k * b.x, y: (1 - k) ** 2 * a.y + 2 * (1 - k) * k * c.y + k * k * b.y };
};
function flyer(g) {
    const f = h('span', { class: 'react-fly', 'aria-hidden': 'true' }, g);
    document.body.append(f);
    return f;
}

/* who blocks: me with an active blocker and charges, Kim (and others in the mock) with their own charges */
function blocks(id) {
    if (id === ME) return W.blockerOn && loaded('shield') > 0;
    return (byId(id).blocker || 0) > 0;
}
async function throwEmoji(from, to, k) {
    if (!faceOf(from) || !faceOf(to)) return;
    if (k === 'fish' && blocks(to)) return blockedThrow(from, to);
    if (reduced()) return land(to, k, byId(from).name);
    const a = center(faceOf(from)), b = center(faceOf(to)), f = flyer(GLYPH[k]);
    const arc = Math.max(60, Math.hypot(b.x - a.x, b.y - a.y) * 0.35);
    await f.animate(curve(a, b, { arc, spin: 390, r0: -30, s0: 0.6, mid: 0.6 }), { duration: 900, easing: 'ease-in-out' }).finished.catch(() => {});
    f.remove();
    land(to, k, byId(from).name);
}
function land(to, k, fromName, opts = {}) {
    const c = cardOf(to);
    if (!c) return;
    const sp = h('span', { class: 'react-land' + (opts.belly ? ' belly' : ''), 'aria-hidden': 'true' }, h('span', { class: 'react-emoji' }, GLYPH[k]));
    if (opts.tag) sp.append(opts.tag);
    else if (fromName) sp.append(h('span', { class: 'react-from' }, fromName));
    c.append(sp);
    setTimeout(() => sp.remove(), opts.belly ? 2800 : 2000);
    restart(c, 'is-hit', 450);
}
function restart(el, cls, ms) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), ms); }

/* THE blocker: field pops up while the fish is on its way, the fish smacks into it (hit-stop, squash, BONK, ripple),
   ricochets back on a higher arc, spinning, and plops onto the thrower's own card (splash, belly up, "blocked by …") */
async function blockedThrow(from, to) {
    const blocker = byId(to), thrower = byId(from);
    useCharge(to);
    const tag = h('span', { class: 'react-from blocked' }, icon('shield'), ' blocked by ' + (to === ME ? 'you' : blocker.name));
    if (from === ME) setTimeout(() => toast(blocker.name + ' has a fish blocker – your fish came back. 🐟'), reduced() ? 300 : 2300);
    if (to === ME) setTimeout(() => toast('🛡 Blocked a fish from ' + thrower.name + '. ' + loaded('shield') + ' charges left.'), reduced() ? 300 : 2300);
    if (reduced()) {
        showField(to);
        await sleep(450);
        land(from, 'fish', '', { belly: true, tag });
        return;
    }
    const a = center(faceOf(from)), b = center(faceOf(to));
    const dist = Math.hypot(b.x - a.x, b.y - a.y), arc = Math.max(60, dist * 0.35);
    const IMPACT = 0.8; // the fish meets the field a bit before the middle of the card
    const hit = pointOn(a, b, arc, IMPACT);
    const f = flyer('🐟');
    const frames = curve(a, b, { arc, spin: 390, r0: -30, s0: 0.6, mid: 0.6 }).filter(fr => fr.offset <= IMPACT + 1e-6).map(fr => ({ ...fr, offset: fr.offset / IMPACT }));
    frames[frames.length - 1].offset = 1;
    const dur = 900 * IMPACT;
    setTimeout(() => showField(to), dur * 0.45); // anticipation: the shield is up before the fish arrives
    await f.animate(frames, { duration: dur, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
    // impact: hit-stop with a squash against the field
    const field = cardOf(to)?.querySelector('.field');
    if (field) { field.classList.remove('hit'); void field.offsetWidth; field.classList.add('hit'); }
    burst(hit);
    const last = frames[frames.length - 1].transform;
    await f.animate([{ transform: last }, { transform: last + ' scale(1.35, .6)' }, { transform: last + ' scale(.9, 1.15)' }],
        { duration: 170, easing: 'ease-out', fill: 'forwards' }).finished.catch(() => {});
    // ricochet: back along a higher arc, spinning wildly, a little dazed (smaller)
    const back = curve(hit, a, { arc: Math.max(110, dist * 0.55), steps: 16, spin: -900, r0: -30 + 390 * IMPACT, s0: 1, s1: 0.95, mid: 0.25 });
    await f.animate(back, { duration: 780, easing: 'cubic-bezier(.25,.1,.6,1)' }).finished.catch(() => {});
    f.remove();
    const c = cardOf(from);
    if (!c) return;
    restart(c, 'is-plopped', 600);
    splash(c);
    land(from, 'fish', '', { belly: true, tag });
}
function useCharge(id) {
    if (id === ME) {
        W.loaded.shield--; save();
        renderTable(); renderMenuIfOpen();
        const badge = $('#shieldBadge'), c = cardOf(ME);
        if (badge) restart(badge, 'tick', 500);
        if (c) { const m = h('span', { class: 'minus-one' }, '−1'); c.append(m); setTimeout(() => m.remove(), 1000); }
        if (!loaded('shield')) setTimeout(() => toast('Your fish blocker is empty.', 'Load blocker', () => openMenu(true, 'blocker')), 3200);
    } else byId(id).blocker--;
}
function showField(id) {
    const c = cardOf(id);
    if (!c) return;
    c.querySelector('.field')?.remove();
    const f = h('span', { class: 'field', 'aria-hidden': 'true' });
    c.append(f);
    setTimeout(() => f.remove(), 2700);
}
function burst(p) {
    const parts = [h('span', { class: 'ripple', style: `left:${p.x}px;top:${p.y}px` }),
        h('span', { class: 'bonk', style: `left:${p.x}px;top:${p.y}px` }, 'BONK!')];
    for (let i = 0; i < 8; i++) parts.push(h('span', { class: 'spark', style: `left:${p.x}px;top:${p.y}px;--a:${i * 45 + 20}deg` }));
    document.body.append(...parts);
    setTimeout(() => parts.forEach(x => x.remove()), 950);
}
function splash(c) {
    const drops = [];
    for (let i = 0; i < 7; i++) {
        const ang = -Math.PI * (0.1 + 0.8 * i / 6), r = 26 + (i % 3) * 8;
        drops.push(h('span', { class: 'drop', style: `--dx:${(Math.cos(ang) * r).toFixed(0)}px;--dy:${(Math.sin(ang) * r).toFixed(0)}px` }));
    }
    c.append(...drops);
    setTimeout(() => drops.forEach(d => d.remove()), 700);
}

/* ---------------------------------------------------------------- the You menu */
let pack = 1, renewAsk = false, freshCode = false;
function openMenu(scroll, where = 'support') {
    $('#menu').hidden = false; document.body.classList.add('menu-open');
    $('#navYou').setAttribute('aria-expanded', 'true');
    renderMenu();
    if (scroll) {
        const t = $('#' + where);
        if (t) { t.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' }); restart(t, 'flash', 1200); }
    }
}
function closeMenu() {
    $('#menu').hidden = true; document.body.classList.remove('menu-open');
    $('#navYou').setAttribute('aria-expanded', 'false');
}
const renderMenuIfOpen = () => { if (!$('#menu').hidden) renderMenu(); };
function renderMenu() {
    const body = $('#menuBody'), top = body.scrollTop;
    const parts = [
        h('div', { class: 'f' }, h('label', { class: 'lab', for: 'nm' }, 'Your name'),
            h('div', { class: 'row' }, h('input', { class: 'field-in', id: 'nm', value: 'Sam', maxlength: '40' }), h('button', { type: 'button', class: 'btn-box' }, 'Save'))),
        h('div', { class: 'f' }, h('span', { class: 'lab' }, 'Appearance'),
            h('div', { class: 'seg' }, ['light', 'dark'].map(m => h('button', { type: 'button', 'data-mode': m, 'aria-pressed': String(S.mode === m) }, m[0].toUpperCase() + m.slice(1))))),
        h('hr', { class: 'sep' })
    ];
    if (W.codes.length) parts.push(walletBox());
    parts.push(supportBox(), redeemBox(), blockerBox());
    body.replaceChildren(...parts);
    body.scrollTop = top;
}
function supportBox() {
    return h('section', { class: 'support', id: 'support', 'aria-labelledby': 'supTitle' },
        h('h3', { id: 'supTitle' }, icon('heart'), 'Support Agile Poker'),
        h('p', null, 'Agile Poker is free and has no ads. Three of us build it in our spare time and pay the servers ourselves.'),
        h('p', null, 'If it helps your team, chip in a few euros. As a thank-you you get ', h('b', { class: 'amt' }, 'tokens'),
            ': extra throws for any emoji, or a fish blocker.'),
        h('div', { class: 'packs', role: 'radiogroup', 'aria-label': 'Donation' }, PACKS.map((p, i) =>
            h('button', { type: 'button', role: 'radio', class: 'pack', 'data-pack': i, 'aria-checked': String(pack === i) },
                p.tag ? h('span', { class: 'tag' }, p.tag) : null, h('span', { class: 'eur' }, '€' + p.eur), h('span', { class: 'gets' }, tok(), h('b', null, String(p.tok)))))),
        h('button', { type: 'button', class: 'btn-box primary wide', id: 'btnDonate' }, 'Support with €' + PACKS[pack].eur + ' →'),
        h('p', { class: 'hint' }, 'One-time, via Paddle. No account: you get a code that holds your tokens. ', h('span', { class: 'ph' }, 'Prices are placeholders.')));
}
function walletBox() {
    const main = W.codes[0], others = W.codes.slice(1);
    const loadedTotal = Object.values(W.loaded).reduce((a, n) => a + Math.max(0, n), 0);
    const box = h('section', { class: 'wallet' + (freshCode ? ' fresh' : ''), id: 'wallet', 'aria-labelledby': 'walTitle' },
        h('span', { class: 'lab', id: 'walTitle' }, 'Your tokens'),
        h('div', { class: 'bal' }, tok(), h('span', null, h('span', { class: 'n' }, String(balance())),
            h('small', null, 'in your wallet' + (loadedTotal ? ' · ' + loadedTotal + ' loaded on your bar' : '')))),
        h('div', { class: 'code' }, h('output', { 'aria-label': 'Your code' }, main.code),
            h('button', { type: 'button', class: 'btn-box', 'data-copy': main.code, 'aria-label': 'Copy code' }, icon('copy'), 'Copy')),
        h('div', { class: 'acts' },
            h('button', { type: 'button', class: 'btn-box', 'data-gift': main.code }, icon('gift'), 'Share as gift'),
            h('button', { type: 'button', class: 'btn-box', id: 'btnLoadBar' }, tok(), 'Load bar'),
            h('button', { type: 'button', class: 'btn-box danger', id: 'btnRenew' }, icon('renew'), 'Renew code')),
        h('p', { class: 'hint' }, 'The tokens belong to the code: use it on another device, or give it away – whoever has it can spend it.'));
    if (others.length) box.append(h('p', { class: 'loaded-list' }, 'linked: ', others.map(c => h('span', null, c.code + ' ', h('b', null, String(c.bal))))));
    if (loadedTotal) box.append(h('p', { class: 'loaded-list' }, [...EMOJI.map(e => [e[0], e[1]]), ['shield', '🛡']].filter(([k]) => loaded(k) > 0)
        .map(([k, g]) => h('span', null, g + ' ', h('b', null, '+' + loaded(k))))));
    if (renewAsk) box.append(h('div', { class: 'renew-confirm', role: 'alert' },
        h('b', null, 'Renew your code?'), ' Your tokens move to a new code. The old code stops working – also for anyone you shared it with. Use this if it got into the wrong hands.',
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn-box', id: 'renewNo' }, 'Cancel'),
            h('button', { type: 'button', class: 'btn-box danger', id: 'renewYes' }, 'Renew'))));
    return box;
}
function redeemBox() {
    return h('div', { class: 'f', id: 'redeem' }, h('label', { class: 'lab', for: 'redeemIn' }, 'Have a code?'),
        h('div', { class: 'row' }, h('input', { class: 'field-in', id: 'redeemIn', placeholder: 'FISH-XXXX-XXXX', autocomplete: 'off', spellcheck: 'false', maxlength: '20' }),
            h('button', { type: 'button', class: 'btn-box', id: 'btnRedeem' }, 'Redeem')),
        h('p', { class: 'hint' }, 'A gift or your code from another device. Its tokens show up here.'));
}
function blockerBox() {
    const n = loaded('shield');
    return h('div', { class: 'f', id: 'blocker' }, h('span', { class: 'lab' }, 'Fish blocker'),
        h('div', { class: 'switch-row' }, icon('shield'),
            h('span', { class: 'txt' }, n ? n + (n === 1 ? ' charge' : ' charges') : 'No charges', h('small', null, 'Each blocked fish uses one. It flies back to the thrower.')),
            h('button', { type: 'button', role: 'switch', class: 'switch', id: 'swBlocker', 'aria-checked': String(W.blockerOn && n > 0), 'aria-label': 'Fish blocker', disabled: n ? null : true })),
        h('div', { class: 'mini-load' }, [1, 5, 10].map(k => h('button', { type: 'button', class: 'btn-box', 'data-shield': k, disabled: balance() ? null : true }, '+' + k + ' ', tok()))),
        h('p', { class: 'hint' }, 'Only fish are blocked – hearts and cakes still get through.'));
}

function redeem(raw) {
    const code = String(raw || '').trim().toUpperCase();
    if (!/^FISH-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return toast('That doesn’t look like a code (FISH-XXXX-XXXX).');
    if (W.dead.includes(code)) return toast('This code was renewed and no longer works.');
    if (W.codes.some(c => c.code === code)) return toast('This code is already in your wallet.');
    W.codes.push({ code, bal: 100 }); // the mock: every new code holds 100
    save(); renderMenuIfOpen(); updateYou(); if (bar.to) renderBar();
    toast('🎁 Code redeemed: +100 tokens.');
    return true;
}

/* ---------------------------------------------------------------- fake checkout */
function openCheckout() {
    const p = PACKS[pack];
    $('#payBox').replaceChildren(h('div', { class: 'mockbar' }, 'Paddle checkout (mock) – nothing is charged'),
        h('div', { class: 'pin' },
            h('button', { type: 'button', class: 'icon-btn x', id: 'payClose', 'aria-label': 'Close' }, icon('x')),
            h('h2', { id: 'payTitle' }, 'Support Agile Poker'),
            h('p', { class: 'for' }, 'komplexitäter · one-time donation'),
            h('div', { class: 'sum' }, h('span', null, 'Donation', h('br'), h('small', { style: 'color:#777' }, 'thank-you: ' + p.tok + ' tokens')), h('b', null, '€' + p.eur.toFixed(2))),
            h('label', { for: 'pEmail' }, 'Email for the receipt (optional)'), h('input', { class: 'pf', id: 'pEmail', type: 'email', placeholder: 'you@example.com' }),
            h('label', { for: 'pCard' }, 'Card number'), h('input', { class: 'pf', id: 'pCard', value: '4242 4242 4242 4242', inputmode: 'numeric' }),
            h('div', { class: 'two' }, h('div', null, h('label', { for: 'pExp' }, 'Expiry'), h('input', { class: 'pf', id: 'pExp', value: '12 / 29' })),
                h('div', null, h('label', { for: 'pCvc' }, 'CVC'), h('input', { class: 'pf', id: 'pCvc', value: '123' }))),
            h('button', { type: 'button', class: 'pay', id: 'payBtn' }, 'Pay €' + p.eur.toFixed(2)),
            h('p', { class: 'fine' }, icon('lock'), 'Secured by Paddle (mock)')));
    $('#checkout').hidden = false;
    $('#payBtn').focus();
}
async function pay() {
    const btn = $('#payBtn'), p = PACKS[pack];
    btn.disabled = true; btn.replaceChildren(h('span', { class: 'spin', 'aria-label': 'Paying' }));
    await sleep(1100);
    if (W.codes.length) W.codes[0].bal += p.tok;
    else W.codes.push({ code: S.state === 'checkout' ? 'FISH-7KQ2-M9XA' : newCode(), bal: p.tok });
    save();
    $('#payBox .pin').replaceChildren(h('div', { class: 'paid' }, h('div', { class: 'check', 'aria-hidden': 'true' }, '✓'),
        h('h2', null, 'Thank you!'), h('p', null, p.tok + ' tokens are in your wallet.'),
        h('button', { type: 'button', class: 'pay', id: 'payDone' }, 'Show my code')));
    $('#payDone').focus();
    coinRain();
}
function closeCheckout(done) {
    $('#checkout').hidden = true;
    if (done) { freshCode = true; openMenu(true, 'wallet'); updateYou(); setTimeout(() => { freshCode = false; }, 1500); }
}
function coinRain() {
    if (reduced()) return;
    for (let i = 0; i < 24; i++) {
        const c = icon('tok', 'tok rain');
        c.style.left = Math.random() * 100 + 'vw';
        c.style.setProperty('--dx', (Math.random() * 80 - 40).toFixed(0) + 'px');
        c.style.setProperty('--r', (Math.random() * 720 - 360).toFixed(0) + 'deg');
        c.style.animationDelay = (Math.random() * 0.6).toFixed(2) + 's';
        document.body.append(c);
        setTimeout(() => c.remove(), 2200);
    }
}

/* ---------------------------------------------------------------- toast, header */
let toastT = null;
function toast(text, action, fn) {
    const t = $('#toast');
    t.replaceChildren(text);
    if (action) { const b = h('button', { type: 'button' }, action); b.onclick = () => { t.hidden = true; fn(); }; t.append(b); }
    t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, action ? 5000 : 3200);
}
function updateYou() {
    const y = $('#youTok'), n = balance();
    y.hidden = !n;
    y.replaceChildren(tok(), h('span', { class: 'n' }, String(n)));
}
async function copy(text, msg) {
    try { await navigator.clipboard.writeText(text); toast(msg); } catch (e) { toast(msg + ' (mock: ' + text + ')'); }
}

/* ---------------------------------------------------------------- events */
let downInBar = false; // a slot re-renders on pointerdown: the click then has no connected target, the bar stays
document.addEventListener('pointerdown', e => { downInBar = !!e.target.closest('#bar'); }, true);
document.addEventListener('click', e => {
    const t = e.target;
    if (!t.isConnected) return;
    if (t === document.body && document.body.classList.contains('menu-open')) return closeMenu(); // the phone scrim
    const react = t.closest('.c .react');
    if (react) { const id = react.closest('.c').dataset.id; return bar.to === id ? closeBar() : openBar(id); }
    if (t.closest('.c .nudge')) { const c = t.closest('.c'); c.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-4deg)' }, { transform: 'rotate(4deg)' }, { transform: 'rotate(0)' }], 300); return; }
    if (t.closest('#shieldBadge')) { W.blockerOn = !W.blockerOn; save(); renderTable(); renderMenuIfOpen(); toast(W.blockerOn ? '🛡 Fish blocker on.' : 'Fish blocker paused – your charges stay.'); return; }
    if (t.closest('#walletChip')) { // pointer: handled on pointerdown/up; keyboard: switch to loading
        if (e.detail === 0 && !bar.loading) { bar.loading = true; renderBar(); $('#bar .em')?.focus(); }
        return;
    }
    const em = t.closest('#bar .em');
    if (em) {
        if (bar.loading) { if (e.detail === 0) loadSlot(em.dataset.k, 1); return; } // pointer: handled on pointerdown
        return throwFromBar(em.dataset.k);
    }
    if (t.closest('#barDone')) { bar.loading = false; renderBar(); return; }
    const go = t.closest('[data-go]');
    if (go) { closeBar(); openMenu(true, go.dataset.go); return; }
    if (t.closest('#navYou')) return $('#menu').hidden ? openMenu(false) : closeMenu();
    if (t.closest('#menuClose')) return closeMenu();
    const m = t.closest('[data-mode]');
    if (m) { S.mode = m.dataset.mode; applyMode(); return renderMenu(); }
    const pk = t.closest('[data-pack]');
    if (pk) { pack = Number(pk.dataset.pack); renderMenu(); $('[data-pack="' + pack + '"]')?.focus(); return; }
    if (t.closest('#btnDonate')) return openCheckout();
    if (t.closest('#payClose')) return closeCheckout(false);
    if (t.closest('#payBtn')) return pay();
    if (t.closest('#payDone')) return closeCheckout(true);
    if (t === $('#checkout')) return closeCheckout(false);
    const cp = t.closest('[data-copy]');
    if (cp) return copy(cp.dataset.copy, 'Code copied.');
    const gift = t.closest('[data-gift]');
    if (gift) {
        const url = location.origin + location.pathname + '?redeem=' + encodeURIComponent(gift.dataset.gift);
        if (navigator.share && matchMedia('(pointer: coarse)').matches) navigator.share({ title: 'Fish tokens for you 🐟', url }).catch(() => {});
        else copy(url, 'Gift link copied – whoever opens it gets your tokens.');
        return;
    }
    if (t.closest('#btnLoadBar')) { closeMenu(); openBar('vf', true); return; }
    if (t.closest('#btnRenew')) { renewAsk = true; return renderMenu(); }
    if (t.closest('#renewNo')) { renewAsk = false; return renderMenu(); }
    if (t.closest('#renewYes')) { W.dead.push(W.codes[0].code); W.codes[0].code = newCode(); renewAsk = false; save(); freshCode = true; renderMenu(); freshCode = false; toast('New code ready. The old one no longer works.'); return; }
    if (t.closest('#btnRedeem')) { if (redeem($('#redeemIn').value)) $('#redeemIn').value = ''; return; }
    if (t.closest('#swBlocker')) { W.blockerOn = !W.blockerOn; save(); renderMenu(); renderTable(); return; }
    const sh = t.closest('[data-shield]');
    if (sh) {
        const n = Math.min(Number(sh.dataset.shield), balance());
        if (n && spend(n)) { W.loaded.shield = loaded('shield') + n; W.blockerOn = true; save(); renderMenu(); renderTable(); updateYou(); toast('🛡 +' + n + ' blocker charges.'); }
        return;
    }
    if (bar.to && !downInBar && !t.closest('#bar, #toast')) closeBar();
});
document.addEventListener('pointerdown', e => {
    if (e.target.closest('#walletChip')) { e.preventDefault(); startDrag(e); return; }
    const em = e.target.closest('#bar.loading .em');
    if (em && e.button === 0) { e.preventDefault(); startHold(em.dataset.k); }
});
document.addEventListener('pointermove', moveDrag);
document.addEventListener('pointerup', e => { stopHold(); endDrag(e); });
document.addEventListener('pointercancel', e => { stopHold(); if (drag) { drag.moved = false; endDrag(e); } });
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (!$('#checkout').hidden) return closeCheckout(false);
        if (bar.to) return bar.loading ? (bar.loading = false, renderBar()) : closeBar();
        if (!$('#mockPanel').hidden) return toggleMock(false);
        return closeMenu();
    }
    if (e.key === 'Enter' && e.target.id === 'redeemIn') { if (redeem(e.target.value)) e.target.value = ''; return; }
    if (e.target.closest('input, textarea')) return;
    if (e.key === 'm' || e.key === 'M') toggleMock();
    if (bar.to && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        const bs = [...document.querySelectorAll('#bar .em')], i = bs.indexOf(document.activeElement);
        if (i >= 0) bs[(i + (e.key === 'ArrowRight' ? 1 : -1) + bs.length) % bs.length].focus();
    }
});
addEventListener('resize', placeBar);
$('#btnMode').onclick = () => { S.mode = S.mode === 'dark' ? 'light' : 'dark'; applyMode(); renderMenuIfOpen(); };
function applyMode() {
    document.body.classList.toggle('light-theme', S.mode === 'light');
    document.body.classList.toggle('reduced', S.motion === 'reduced');
    $('#brand').src = '../../src/' + (S.mode === 'light' ? 'brand_light.svg' : 'brand_dark.svg');
    document.querySelectorAll('#mockPanel [data-m]').forEach(g => g.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(S[g.dataset.m] === b.dataset.val))));
}

/* ---------------------------------------------------------------- mockup states (not part of the app) */
function setState(st) {
    S.state = st;
    closeBar(); closeMenu(); $('#checkout').hidden = true; renewAsk = false;
    if (['bar', 'support', 'checkout', 'board'].includes(st)) W = emptyWallet();
    if (st === 'load' || st === 'blocker') W = richWallet();
    if (st === 'code') W = { ...emptyWallet(), codes: [{ code: 'FISH-7KQ2-M9XA', bal: 100 }] };
    save(); applyMode(); renderTable(); updateYou();
    if (st === 'bar') openBar('vf');
    if (st === 'load') openBar('vf', true);
    if (st === 'support') openMenu(true);
    if (st === 'checkout') { pack = 1; openMenu(true); openCheckout(); }
    if (st === 'code') { freshCode = true; openMenu(true, 'wallet'); freshCode = false; }
    if (st === 'blocker') setTimeout(() => throwEmoji('vf', ME, 'fish'), 700);
}
function toggleMock(force) {
    const p = $('#mockPanel'), open = force != null ? force : p.hidden;
    p.hidden = !open; $('#mockHandle').setAttribute('aria-expanded', String(open));
}
let chaos = null;
const ACTS = {
    vfFish: () => throwEmoji('vf', ME, 'fish'),
    vfHeart: () => throwEmoji('vf', ME, 'heart'),
    meKim: () => { byId('kim').blocker = Math.max(byId('kim').blocker, 1); throwEmoji(ME, 'kim', 'fish'); },
    meOle: () => throwEmoji(ME, 'ole', 'fish'),
    chaos: () => {
        if (chaos) { clearInterval(chaos); chaos = null; } else {
            chaos = setInterval(() => {
                const others = PLAYERS.filter(p => p.id !== ME), from = others[Math.floor(Math.random() * others.length)];
                const tos = PLAYERS.filter(p => p.id !== from.id), to = Math.random() < 0.35 ? byId(ME) : tos[Math.floor(Math.random() * tos.length)];
                const k = Math.random() < 0.45 ? 'fish' : EMOJI[Math.floor(Math.random() * 6)][0];
                throwEmoji(from.id, to.id, k);
            }, 750);
        }
        $('#actChaos').textContent = 'auto chaos: ' + (chaos ? 'on' : 'off');
    },
    gift: () => { history.replaceState(null, '', '?redeem=FISH-GIFT-4U2B'); redeemFromUrl(); },
    rich: () => { W = richWallet(); save(); refresh(); },
    empty: () => { W = emptyWallet(); save(); refresh(); },
    reset: () => { W.used = {}; save(); refresh(); toast('A new day: one free throw per emoji again.'); }
};
function refresh() { renderTable(); updateYou(); renderMenuIfOpen(); if (bar.to) renderBar(); }
$('#mockHandle').onclick = () => toggleMock();
$('#mockPanel').addEventListener('click', e => {
    const a = e.target.closest('[data-act]');
    if (a) { e.stopPropagation(); return ACTS[a.dataset.act](); }
    const b = e.target.closest('[data-m] button');
    if (!b) return;
    e.stopPropagation();
    const k = b.closest('[data-m]').dataset.m;
    S[k] = b.dataset.val;
    if (k === 'state') setState(S.state); else { applyMode(); renderMenuIfOpen(); }
});
$('#mpLink').onclick = e => {
    e.preventDefault();
    const q = new URLSearchParams({ state: S.state, mode: S.mode });
    if (S.motion === 'reduced') q.set('motion', 'reduced');
    history.replaceState(null, '', '?' + q.toString());
    toast('URL updated – copy it from the address bar');
};
function redeemFromUrl() {
    const code = new URLSearchParams(location.search).get('redeem');
    if (!code) return;
    const ok = redeem(code);
    history.replaceState(null, '', location.pathname);
    if (ok) setTimeout(() => openMenu(true, 'wallet'), 300);
}

const q = new URLSearchParams(location.search);
for (const k of ['mode', 'motion']) if (q.get(k)) S[k] = q.get(k);
S.clean = q.get('clean') === '1';
document.body.classList.toggle('clean', S.clean);
if (q.get('state')) setState(q.get('state'));
else {
    try { W = Object.assign(emptyWallet(), JSON.parse(localStorage.getItem(STORE) || 'null') || {}); } catch (e) { W = emptyWallet(); }
    applyMode(); renderTable(); updateYou();
}
redeemFromUrl();
if (q.get('mock')) toggleMock(true);
