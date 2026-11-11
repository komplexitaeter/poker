/* B-113 (cut 1): the column on large screens with a mouse can be collapsed to a narrow rail and resized with the
 * grip on its left edge. The look is in style.css ("Sidebar (B-113)"); this file sets its hooks on .container:
 * .side-collapsed, .side-peek, .side-anim, .side-no-anim, .side-pinning, .side-dragging, .side-menu, --side-w,
 * data-phase.
 * The state (collapsed, width in vw) is kept per phase (voting / revealed) in localStorage, for all boards of the
 * browser. Without a stored state the column stays as it always was (open, --col-w). Phones and the carousel
 * tablets: nothing is set at all.
 * The open column has "collapse" (»») at the top right; the overlay has the pin ("Keep open") at the same spot.
 * The rail mirrors the round: "3/6" voted, the range of the cards down after the reveal, the timer and the round
 * button (#rail_round does what #newroundbtn does).
 * While the menu panel is open (.side-menu) the grip lies above it at its left edge, also while collapsed: dragging
 * sets the width of the phase (the menu and, later, the column use it) but never collapses or opens the column.
 * B-113 (Andreas): the grip sets the width only (20-60vw), it never collapses the column, neither dragged nor by
 * arrow keys; collapsing is the job of »».
 * B-113 (Delia's advice, Andreas): the overlay (collapsed, .side-peek) has the grip at its left edge too. It sets the
 * width of the phase only: the column stays collapsed, the overlay (and the open menu) follow the width. While it is
 * dragged the overlay does not close (no close timer, no hoverBlocked); after the release it closes as usual once the
 * mouse is outside rail, overlay and grip.
 * B-113 (to try out, Andreas): right after collapsing (»»), pinning or resizing, a quiet line next to the column says
 * that this is kept for the phase ("setting saved for voting panel" / "... results panel"; #side_hint, style.css .side-hint), for
 * about 2s; only the first SIDE_HINT_MAX times per case in this browser (counted in localStorage per case: collapse,
 * pin, width while voting, width for results; Andreas). */

const SIDE_STORE_KEY = 'SIDEBAR_STATE';
const SIDE_MIN_VW = 20;
const SIDE_MAX_VW = 60;
const SIDE_KEY_STEP_VW = 2;
const SIDE_PEEK_OPEN_MS = 120;  // hover over the rail: the overlay opens after this
const SIDE_PEEK_CLOSE_MS = 250; // the pointer left rail and overlay: it closes after this
const SIDE_ANIM_MS = 450;       // .side-anim stays this long (the width transition is 0.35s)
const SIDE_HINT_KEY = 'SIDEBAR_HINTS';
const SIDE_HINT_MAX = 3;        // the hint shows after the first 3 actions of each case only
const SIDE_HINT_MS = 2000;      // and stays this long (while dragging: until 2s after the release)

const gSideQuery = window.matchMedia('(min-width: 800px) and (hover: hover), (min-width: 800px) and (pointer: fine)');

const gSide = {
    active: false,     // large screen with a mouse
    phase: null,       // 'voting' | 'revealed' once the first board state is shown
    peek: false,       // collapsed: the overlay is open
    peekSticky: false, // opened by a click (stays until a click, Escape or a click elsewhere)
    openTimer: null,
    closeTimer: null,
    animTimer: null,
    drag: null,        // { id, startW } while the grip is dragged (also on the overlay: it stays open meanwhile)
    inside: false,     // the mouse is over the rail or the overlay
    mouse: null,       // { x, y }: the mouse's last position (real moves only, see sideMouseMove)
    hoverBlocked: false, // closed (or collapsed) under the mouse: hover opens again only after it left the rail
    hintTimer: null,
    hintText: '',      // the hint shown now ('' while none)
    hintCase: '',      // its case (sideHintCase)
};

function sideContainer() {
    return document.querySelector('.container');
}

/* the stored state, { voting: {collapsed, width}, revealed: {...} }; width null: as before (--col-w) */
function sideLoadAll() {
    let all = {};
    try {
        const raw = localStorage.getItem(SIDE_STORE_KEY);
        if (raw) all = JSON.parse(raw) || {};
    } catch (e) { all = {}; }
    return typeof all === 'object' ? all : {};
}

function sideLoad(phase) {
    const entry = sideLoadAll()[phase];
    const state = { collapsed: false, width: null };
    if (entry && typeof entry === 'object') {
        state.collapsed = entry.collapsed === true;
        if (typeof entry.width === 'number' && isFinite(entry.width)) state.width = sideClampW(entry.width);
    }
    return state;
}

function sideSave(phase, state) {
    if (phase === null) return;
    try {
        const all = sideLoadAll();
        all[phase] = { collapsed: state.collapsed === true, width: state.width };
        localStorage.setItem(SIDE_STORE_KEY, JSON.stringify(all));
    } catch (e) { /* no localStorage: the state lasts until the next load */ }
}

function sideClampW(w) {
    return Math.min(SIDE_MAX_VW, Math.max(SIDE_MIN_VW, Math.round(w * 10) / 10));
}

/* the state shown now (read from the DOM) */
function sideShown() {
    const box = sideContainer();
    const w = parseFloat(box.style.getPropertyValue('--side-w'));
    return { collapsed: box.classList.contains('side-collapsed'), width: isFinite(w) ? w : null };
}

/* the column's width in vw as shown now (also without --side-w) */
function sideMeasuredW() {
    const shown = sideShown();
    if (shown.width !== null) return shown.width;
    const sidebar = document.getElementById('sidebar');
    const width = sidebar ? sidebar.getBoundingClientRect().width : 0;
    return width > 0 ? Math.round(width / window.innerWidth * 1000) / 10 : SIDE_MIN_VW;
}

function sideSetWidth(width) {
    const box = sideContainer();
    if (width === null) box.style.removeProperty('--side-w');
    else box.style.setProperty('--side-w', width + 'vw');
    sideUpdateGrip();
}

function sideUpdateGrip() {
    const grip = document.getElementById('side_grip');
    if (grip === null || !gSide.active) return;
    const now = String(Math.round(sideMeasuredW()));
    if (grip.getAttribute('aria-valuenow') !== now) grip.setAttribute('aria-valuenow', now);
}

/* shows a state; how: 'none' (first paint, restore), 'anim' (toggle, phase change) or 'plain' (drag, keys) */
function sideApply(state, how) {
    const box = sideContainer();
    box.classList.remove('side-pinning');
    if (how === 'none') {
        box.classList.add('side-no-anim');
        requestAnimationFrame(() => requestAnimationFrame(() => box.classList.remove('side-no-anim')));
    } else if (how === 'anim') {
        box.classList.add('side-anim');
        clearTimeout(gSide.animTimer);
        gSide.animTimer = setTimeout(() => box.classList.remove('side-anim', 'side-pinning'), SIDE_ANIM_MS);
    }
    sideSetWidth(state.width);
    if (!state.collapsed) sidePeek(false);
    box.classList.toggle('side-collapsed', state.collapsed);
    sideUpdateGrip();
}

/* the menu panel (#menu) is open: the grip only sets the width then */
function sideMenuOpen() {
    const menu = document.getElementById('menu');
    return menu !== null && menu.open;
}

/* the overlay over the table while collapsed */
function sidePeek(open, sticky = false) {
    sideCancelOpen();
    clearTimeout(gSide.closeTimer);
    const box = sideContainer();
    if (box === null) return;
    if (open && !box.classList.contains('side-collapsed')) return;
    if (!open && gSide.peek && gSide.inside) gSide.hoverBlocked = true;
    gSide.peek = open;
    gSide.peekSticky = open && sticky;
    box.classList.toggle('side-peek', open);
    const button = document.getElementById('side_open');
    if (button !== null) button.setAttribute('aria-expanded', open ? 'true' : 'false');
}

/* B-113: called with every board state shown (updateSide): the rail's content and the phase */
function syncSidebar(json) {
    if (!json) return;
    const revealed = json.all_players_ready && json.players_count > 0;
    const phase = revealed ? 'revealed' : 'voting';

    const count = document.getElementById('rail_count');
    if (count !== null) {
        const text = (json.ready_players_count || 0) + '/' + (json.players_count || 0);
        if (count.textContent !== text) count.textContent = text;
    }
    syncRailRound();

    if (!gSide.active) {
        gSide.phase = phase;
        return;
    }
    const box = sideContainer();
    if (box.getAttribute('data-phase') !== phase) box.setAttribute('data-phase', phase);
    if (gSide.phase === phase) return;
    const first = gSide.phase === null;
    gSide.phase = phase;
    if (gSide.drag !== null) sideEndDrag(null);
    sideHintHide();
    if (!first) sidePeek(false);
    sideApply(sideLoad(phase), first ? 'none' : 'anim');
}

/* the range in the rail: exactly what the column's #spread_range shows (its values cloned, "–" between them; the
 * "range" label comes from style.css), one value when all agree, nothing when it shows nothing (cards without a
 * value, sets that are no numbers). No colours of its own (B-113, Andreas: no third look of the cards). Called by
 * updateSide() once #spread_range is up to date. */
function syncRailRange(revealed) {
    const range = document.getElementById('rail_range');
    const source = document.getElementById('spread_range');
    if (range === null || source === null) return;
    syncRailBars(revealed);
    const key = revealed ? (source.getAttribute('data-shows') || '') : '';
    if (range.getAttribute('data-shows') === key) return;
    range.setAttribute('data-shows', key);
    const values = key === '' ? [] : Array.from(source.children).map(element => element.cloneNode(true));
    if (values.length === 2) {
        const to = document.createElement('span');
        to.className = 'rail-to'; // a hook only, no style of its own
        to.textContent = '\u2013';
        range.replaceChildren(values[0], to, values[1]);
    } else {
        range.replaceChildren(...values);
    }
}

/* B-113 (Andreas): the spread in mini above the range (or the check), a fingerprint of the big spread: the same columns (every card of
 * the deck, in deck order), the same height logic (a bar's share of the full height is its votes per player on the
 * board, --voters of #spread_bars, as the blocks there) and the same accent rule (.top: the most chosen, from two votes
 * on), only without blocks, counts and labels; a 1px base line for a column without votes. Read from #spread_bars
 * itself (its .spread-col: the count, .top), so the two never differ. Colours and sizes: style.css .rail-bars. */
function syncRailBars(revealed) {
    const bars = document.getElementById('rail_bars');
    const source = document.getElementById('spread_bars');
    if (bars === null || source === null) return;
    const cols = revealed ? Array.from(source.children).map(col => ({
        n: parseInt(col.querySelector('.spread-count')?.textContent || '0', 10) || 0,
        top: col.classList.contains('top') || col.classList.contains('est'), // B-52 S1: or the result of the active item
    })) : [];
    const voters = parseInt(source.style.getPropertyValue('--voters'), 10) || 1;
    const key = voters + ':' + cols.map(col => col.n + (col.top ? 't' : '')).join(',');
    if (bars.getAttribute('data-shows') === key) return;
    bars.setAttribute('data-shows', key);
    const max = Math.max(voters, ...cols.map(col => col.n));
    bars.replaceChildren(...cols.map(col => {
        const bar = document.createElement('i');
        if (col.top) bar.className = 'top';
        // no votes: the base line (style.css); votes: their share of the full height, as in #spread_bars
        if (col.n > 0) bar.style.height = Math.round(col.n / max * 100) + '%';
        return bar;
    }));
}

/* #rail_round mirrors #newroundbtn */
function syncRailRound() {
    const source = document.getElementById('newroundbtn');
    const rail = document.getElementById('rail_round');
    if (source === null || rail === null) return;
    if (rail.disabled !== source.disabled) rail.disabled = source.disabled;
    rail.classList.toggle('primary', source.classList.contains('primary'));
    if (rail.getAttribute('aria-label') !== source.value) rail.setAttribute('aria-label', source.value);
    if (rail.title !== source.value) rail.title = source.value;
}

/* #rail_timer mirrors #timer (text, data-state, data-over); called by renderTimer(). The rail shows just the time,
 * without the prefix T−/T+ (Andreas, B-113): it counts down and, past the timebox, up again in amber (data-over);
 * the aria-label stays the full one of #timer */
function syncRailTimer() {
    const rail = document.getElementById('rail_timer');
    const box = document.getElementById('timer');
    const display = document.getElementById('timer_display');
    if (rail === null || box === null || display === null) return;
    const text = (display.textContent ?? '').replace(/^T[−+-]/, '');
    if (rail.textContent !== text) rail.textContent = text;
    ['data-state', 'data-over'].forEach(name => {
        const value = box.getAttribute(name);
        if (value !== null && rail.getAttribute(name) !== value) rail.setAttribute(name, value);
    });
    const label = display.getAttribute('aria-label');
    if (label !== null && rail.getAttribute('aria-label') !== label) rail.setAttribute('aria-label', label);
}

/* large screen with a mouse or not (also at runtime: window resized, a mouse plugged in) */
function sideSetActive(active) {
    const box = sideContainer();
    if (box === null || gSide.active === active) return;
    gSide.active = active;
    if (active) {
        // the stored state of the phase shown, without animation; before the first board state syncSidebar does it
        if (gSide.phase !== null) {
            box.setAttribute('data-phase', gSide.phase);
            sideApply(sideLoad(gSide.phase), 'none');
        }
    } else {
        if (gSide.drag !== null) sideEndDrag(null);
        sideHintHide();
        sidePeek(false);
        box.classList.remove('side-collapsed', 'side-peek', 'side-anim', 'side-no-anim', 'side-pinning', 'side-dragging');
        box.style.removeProperty('--side-w');
        box.removeAttribute('data-phase');
    }
}

function sideCollapse(event) {
    if (!gSide.active || gSide.phase === null) return;
    const state = { collapsed: true, width: sideShown().width };
    sideSave(gSide.phase, state);
    sideApply(state, 'anim');
    sideBlockHoverAt(event);
    sideHint('collapse');
}

/* collapsed by a click or a release on the right edge: the rail is now under the mouse; it opens the overlay only
 * after the mouse left the rail once (it would slide right back in) */
function sideBlockHoverAt(event) {
    if (!event || !(event.clientX > 0)) return; // not by the keyboard
    const box = sideContainer();
    const railW = parseFloat(getComputedStyle(box).getPropertyValue('--rail-w')) || 60;
    if (event.clientX >= box.getBoundingClientRect().right - railW) {
        gSide.hoverBlocked = true;
        gSide.inside = true;
    }
}

/* the pin in the overlay: open for good (this phase) */
function sidePin() {
    if (!gSide.active || gSide.phase === null) return;
    // a click on the pin always pins, also right after hover opened the overlay with the mouse on «« (the pin lies
    // there): guessing whether it was meant for «« was unreliable (B-113, Andreas). Only a look: »» collapses again.
    const state = { collapsed: false, width: sideShown().width };
    sideSave(gSide.phase, state);
    sidePeek(false);
    sideApply(state, 'anim');
    // the overlay stays where it is while the table makes room; without this the column would start at the
    // rail's width and grow back (B-113, Andreas)
    sideContainer().classList.add('side-pinning');
    sideHint('pin');
}

/* --- the hint: "setting saved for voting panel" etc. next to the column, right after an action (B-113, to try out) --- */
/* how often each case was shown in this browser: { collapse: n, pin: n, width_voting: n, width_revealed: n };
 * null without localStorage (then it always shows). An old count as a plain number is ignored (overwritten). */
function sideHintCounts() {
    try {
        const counts = JSON.parse(localStorage.getItem(SIDE_HINT_KEY) || '{}');
        return counts !== null && typeof counts === 'object' && !Array.isArray(counts) ? counts : {};
    } catch (e) {
        try { localStorage.getItem(SIDE_HINT_KEY); } catch (e2) { return null; }
        return {}; // unreadable JSON
    }
}

/* the case counted: »» and the pin in all phases together, the grip per phase */
function sideHintCase(kind) {
    return kind === 'width' ? 'width_' + gSide.phase : kind;
}

/* kind: 'collapse' (»»), 'pin' (both at the column's top) or 'width' (the grip; next to its handle). The same hint
 * still on screen (the grip dragged on, arrow keys) only stays longer, it does not count again. hold: while dragging
 * it does not fade (sideHintRelease starts the timer) */
function sideHint(kind, hold = false) {
    const hint = document.getElementById('side_hint');
    if (hint === null || !gSide.active || gSide.phase === null) return;
    const text = 'setting saved for ' + (gSide.phase === 'revealed' ? 'results' : 'voting') + ' panel';
    const hintCase = sideHintCase(kind);
    if (gSide.hintText !== text || gSide.hintCase !== hintCase) {
        const counts = sideHintCounts();
        const count = counts === null ? 0 : (parseInt(counts[hintCase], 10) || 0);
        if (count >= SIDE_HINT_MAX) {
            // not this case any more; another hint still on screen fades as planned
            return;
        }
        if (counts !== null) {
            counts[hintCase] = count + 1;
            try { localStorage.setItem(SIDE_HINT_KEY, JSON.stringify(counts)); } catch (e) { /* shows anyway */ }
        }
        gSide.hintText = text;
        gSide.hintCase = hintCase;
        hint.setAttribute('data-at', kind === 'width' ? 'grip' : 'top');
        hint.textContent = text;
        hint.classList.add('shown');
    }
    clearTimeout(gSide.hintTimer);
    gSide.hintTimer = hold ? null : setTimeout(sideHintHide, SIDE_HINT_MS);
}

function sideHintRelease() {
    if (gSide.hintText === '' || gSide.hintTimer !== null) return;
    gSide.hintTimer = setTimeout(sideHintHide, SIDE_HINT_MS);
}

function sideHintHide() {
    clearTimeout(gSide.hintTimer);
    gSide.hintTimer = null;
    gSide.hintText = '';
    gSide.hintCase = '';
    const hint = document.getElementById('side_hint');
    if (hint !== null) hint.classList.remove('shown'); // the text stays while it fades out
}

/* --- the grip: drag (pointer events: mouse, pen, touch) and arrow keys --- */
function sideGripW(clientX) {
    const right = sideContainer().getBoundingClientRect().right;
    return (right - clientX) / window.innerWidth * 100;
}

function sideStartDrag(event) {
    if (!gSide.active || event.button !== 0 || gSide.drag !== null) return;
    event.preventDefault();
    const grip = event.currentTarget;
    try { grip.setPointerCapture(event.pointerId); } catch (e) { /* captured anyway */ }
    gSide.drag = { id: event.pointerId, startW: sideShown().width };
    sideContainer().classList.add('side-dragging');
    // on the overlay: it stays open while dragging
    clearTimeout(gSide.closeTimer);
    sideCancelOpen();
}

function sideMoveDrag(event) {
    const drag = gSide.drag;
    if (drag === null || event.pointerId !== drag.id) return;
    const w = sideGripW(event.clientX);
    const width = sideClampW(w);
    if (String(width) === String(sideShown().width)) return;
    sideSetWidth(width);
    sideHint('width', true);
}

/* event null: given up (phase change, layout switched); otherwise the release saves */
function sideEndDrag(event) {
    const drag = gSide.drag;
    if (drag === null || (event !== null && event.pointerId !== drag.id)) return;
    gSide.drag = null;
    const box = sideContainer();
    box.classList.remove('side-dragging');
    sideHintRelease();
    if (event === null || event.type === 'pointercancel') {
        sideSetWidth(drag.startW);
        return;
    }
    // never collapses (B-113); collapsed with the menu open or on the overlay: stays collapsed, the width is kept
    // for the overlay, the menu and later
    sideSave(gSide.phase, sideShown());
    sidePeekAfterDrag(event);
}

/* released on the overlay's grip: the mouse is outside rail, overlay and grip – the overlay closes after the usual
 * delay (as if the mouse had just left it); inside it stays open */
function sidePeekAfterDrag(event) {
    if (!gSide.peek || gSide.peekSticky || event.pointerType !== 'mouse') return;
    const over = document.elementFromPoint(event.clientX, event.clientY);
    if (over !== null && sideIsInside(over)) {
        gSide.inside = true;
        return;
    }
    gSide.inside = false;
    gSide.hoverBlocked = false;
    clearTimeout(gSide.closeTimer);
    gSide.closeTimer = setTimeout(() => sidePeek(false), SIDE_PEEK_CLOSE_MS);
}

function sideGripKey(event) {
    if (!gSide.active) return;
    let step = 0;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') step = SIDE_KEY_STEP_VW;   // the grip moves left: wider
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') step = -SIDE_KEY_STEP_VW;
    if (step === 0) return;
    event.preventDefault();
    event.stopPropagation(); // not the deck's keys
    const width = sideClampW(Math.round(sideMeasuredW()) + step);
    sideSetWidth(width);
    sideSave(gSide.phase, { collapsed: sideShown().collapsed, width });
    sideHint('width');
}

/* --- the overlay: hover with a mouse, the button by click or tap, Escape and a click elsewhere close it --- */
/* Hover opens it only after a real move of the mouse in the rail's upper part (sideMouseMove), not when the rail
 * comes under a mouse standing still (the menu panel closed over it, the overlay slid away; B-113, Andreas: the
 * overlay opened by itself and the pin under the mouse then counted as ««). The rail's foot (timer and round button
 * with the room around them down to the rail's edges) does not open it: the overlay would slide over the button
 * about to be clicked. */
function sideCancelOpen() {
    clearTimeout(gSide.openTimer);
    gSide.openTimer = null;
}

/* over the rail (pointerover, also when moving between its parts) or the overlay (pointerenter): keeps it open */
function sideHoverIn(event) {
    if (!gSide.active || event.pointerType !== 'mouse') return;
    gSide.inside = true;
    if (sideContainer().classList.contains('side-collapsed')) clearTimeout(gSide.closeTimer);
}

/* the rail, the overlay (#sidebar) and the grip (on the overlay's left edge) count as one */
function sideIsInside(node) {
    return ['side_rail', 'sidebar', 'side_grip'].some(id => {
        const element = document.getElementById(id);
        return element !== null && element.contains(node);
    });
}

function sideHoverOut(event) {
    if (!gSide.active || event.pointerType !== 'mouse') return;
    // still over the rail or the overlay: stays
    const to = event.relatedTarget;
    if (to instanceof Node && sideIsInside(to)) return;
    // dragging the grip on the overlay (the pointer may leave everything meanwhile): nothing closes; the release
    // decides (sideEndDrag)
    if (gSide.drag !== null) return;
    gSide.inside = false;
    gSide.hoverBlocked = false;
    sideCancelOpen();
    if (!gSide.peek || gSide.peekSticky) return;
    clearTimeout(gSide.closeTimer);
    gSide.closeTimer = setTimeout(() => sidePeek(false), SIDE_PEEK_CLOSE_MS);
}

/* the rail's element under the mouse: the target itself, or – while the overlay slides away over the rail – the
 * rail's element below it; null elsewhere (also over the menu panel) */
function sideRailTarget(event) {
    const target = event.target instanceof Element ? event.target : null;
    const rail = document.getElementById('side_rail');
    if (target === null || rail === null) return null;
    if (rail.contains(target)) return target;
    if (gSide.peek || !document.getElementById('sidebar').contains(target)) return null;
    return document.elementsFromPoint(event.clientX, event.clientY).find(element => rail.contains(element)) || null;
}

/* the mouse's position. Only a move to a new position counts (browsers may send a move at the same spot when the
 * page changes under the mouse). Moved in the rail's upper part: hover opens the overlay. */
function sideMouseMove(event) {
    if (event.pointerType !== 'mouse') return;
    const last = gSide.mouse;
    if (last !== null && last.x === event.clientX && last.y === event.clientY) return;
    gSide.mouse = { x: event.clientX, y: event.clientY };
    if (!gSide.active) return;

    if (gSide.peek || gSide.hoverBlocked || !sideContainer().classList.contains('side-collapsed')) return;
    const target = sideRailTarget(event);
    if (target === null || target.closest('.rail-foot') !== null) {
        sideCancelOpen();
        return;
    }
    if (gSide.openTimer !== null) return; // already on its way
    gSide.openTimer = setTimeout(() => {
        gSide.openTimer = null;
        sidePeek(true);
    }, SIDE_PEEK_OPEN_MS);
}

function sideOpenClick() {
    if (!gSide.active) return;
    // open by hover: a click keeps it open; open for good by click: closes
    if (gSide.peek && gSide.peekSticky) sidePeek(false);
    else sidePeek(true, true);
}

function initSidebar() {
    const box = sideContainer();
    const rail = document.getElementById('side_rail');
    const sidebar = document.getElementById('sidebar');
    const grip = document.getElementById('side_grip');
    if (box === null || rail === null || sidebar === null || grip === null) return;

    document.getElementById('side_collapse').addEventListener('click', sideCollapse);
    document.getElementById('side_pin').addEventListener('click', sidePin);
    document.getElementById('side_open').addEventListener('click', sideOpenClick);
    document.getElementById('rail_round').addEventListener('click', () => {
        if (!document.getElementById('newroundbtn').disabled) newRound();
    });

    document.addEventListener('pointermove', sideMouseMove, { passive: true });
    rail.addEventListener('pointerover', sideHoverIn);
    sidebar.addEventListener('pointerenter', sideHoverIn);
    grip.addEventListener('pointerenter', sideHoverIn);
    [rail, sidebar, grip].forEach(element => element.addEventListener('pointerleave', sideHoverOut));

    grip.addEventListener('pointerdown', sideStartDrag);
    grip.addEventListener('pointermove', sideMoveDrag);
    grip.addEventListener('pointerup', sideEndDrag);
    grip.addEventListener('pointercancel', sideEndDrag);
    grip.addEventListener('lostpointercapture', event => { if (gSide.drag !== null) sideEndDrag(event); });
    grip.addEventListener('keydown', sideGripKey);

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && gSide.peek) sidePeek(false);
    });
    document.addEventListener('pointerdown', event => {
        if (!gSide.peek || !(event.target instanceof Node)) return;
        if (rail.contains(event.target) || sidebar.contains(event.target) || grip.contains(event.target)) return;
        // the menu panel lies over the column: a click in it is no click elsewhere
        const menu = document.getElementById('menu');
        if (menu !== null && menu.contains(event.target)) return;
        sidePeek(false);
    });

    // the menu panel open or closed: .side-menu (the grip above the panel)
    const menu = document.getElementById('menu');
    if (menu !== null && typeof MutationObserver === 'function') {
        const syncMenu = () => box.classList.toggle('side-menu', menu.open);
        new MutationObserver(syncMenu).observe(menu, { attributes: true, attributeFilter: ['open'] });
        syncMenu();
    }

    // the spread's average pointer follows the column's width (grip, phase change, peek)
    if (typeof ResizeObserver === 'function') {
        let frame = 0;
        let lastWidth = -1;
        new ResizeObserver(entries => {
            const width = Math.round(entries[entries.length - 1].contentRect.width);
            if (width === lastWidth) return;
            lastWidth = width;
            if (frame !== 0) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                repositionSpread();
            });
        }).observe(sidebar);
    }

    const onChange = () => sideSetActive(gSideQuery.matches);
    if (typeof gSideQuery.addEventListener === 'function') gSideQuery.addEventListener('change', onChange);
    else if (typeof gSideQuery.addListener === 'function') gSideQuery.addListener(onChange);
    onChange();
}
