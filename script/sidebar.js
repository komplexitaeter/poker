/* B-113 (cut 1): the column on large screens with a mouse can be collapsed to a narrow rail and resized with the
 * grip on its left edge. The look is in style.css ("Sidebar (B-113)"); this file sets its hooks on .container:
 * .side-collapsed, .side-peek, .side-anim, .side-no-anim, .side-pinning, .side-dragging, .side-snap, --side-w, data-phase.
 * The state (collapsed, width in vw) is kept per phase (voting / revealed) in localStorage, for all boards of the
 * browser. Without a stored state the column stays as it always was (open, --col-w). Phones and the carousel
 * tablets: nothing is set at all.
 * The open column has "collapse" (»») at the top right; the overlay has the pin ("Keep open") at the same spot.
 * The rail mirrors the round: "3/6" voted, the range of the cards down after the reveal, the timer and the round
 * button (#rail_round does what #newroundbtn does). */

const SIDE_STORE_KEY = 'SIDEBAR_STATE';
const SIDE_MIN_VW = 20;
const SIDE_MAX_VW = 60;
const SIDE_SNAP_VW = 14;        // dragged narrower than this: collapses on release
const SIDE_KEY_STEP_VW = 2;
const SIDE_PEEK_OPEN_MS = 120;  // hover over the rail: the overlay opens after this
const SIDE_PEEK_CLOSE_MS = 250; // the pointer left rail and overlay: it closes after this
const SIDE_ANIM_MS = 450;
const SIDE_PIN_GUARD_MS = 400;  // a click on the pin this soon after a hover opened the overlay was meant for «« below it       // .side-anim stays this long (the width transition is 0.35s)

const gSideQuery = window.matchMedia('(min-width: 800px) and (hover: hover), (min-width: 800px) and (pointer: fine)');

const gSide = {
    active: false,     // large screen with a mouse
    phase: null,       // 'voting' | 'revealed' once the first board state is shown
    peek: false,       // collapsed: the overlay is open
    peekSticky: false, // opened by a click (stays until a click, Escape or a click elsewhere)
    openTimer: null,
    closeTimer: null,
    animTimer: null,
    drag: null,        // { id, startW, snap } while the grip is dragged
    inside: false,     // the mouse is over the rail or the overlay
    hoverAt: 0,        // when hover opened the overlay
    hoverBlocked: false, // closed (or collapsed) under the mouse: hover opens again only after it left the rail
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

/* the overlay over the table while collapsed */
function sidePeek(open, sticky = false) {
    clearTimeout(gSide.openTimer);
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
    if (!first) sidePeek(false);
    sideApply(sideLoad(phase), first ? 'none' : 'anim');
}

/* the range in the rail: exactly what the column's #spread_range shows (its mini values cloned, without "range"),
 * smallest above largest with "–" between them, one value when all agree, nothing when it shows nothing (cards
 * without a value, sets that are no numbers). Called by updateSide() once #spread_range is up to date. */
function syncRailRange(revealed) {
    const range = document.getElementById('rail_range');
    const source = document.getElementById('spread_range');
    if (range === null || source === null) return;
    const key = revealed ? (source.getAttribute('data-shows') || '') : '';
    if (range.getAttribute('data-shows') === key) return;
    range.setAttribute('data-shows', key);
    const values = key === '' ? [] : Array.from(source.children).map(element => element.cloneNode(true));
    if (values.length === 2) {
        const to = document.createElement('span');
        to.className = 'rail-to';
        to.textContent = '\u2013';
        range.replaceChildren(values[0], to, values[1]);
    } else {
        range.replaceChildren(...values);
    }
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
        sidePeek(false);
        box.classList.remove('side-collapsed', 'side-peek', 'side-anim', 'side-no-anim', 'side-pinning', 'side-dragging', 'side-snap');
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
    // the pin lies where «« is: a click right after hover opened the overlay was aimed at ««, it keeps it open only
    if (gSide.peek && !gSide.peekSticky && Date.now() - gSide.hoverAt < SIDE_PIN_GUARD_MS) {
        sidePeek(true, true);
        return;
    }
    const state = { collapsed: false, width: sideShown().width };
    sideSave(gSide.phase, state);
    sidePeek(false);
    sideApply(state, 'anim');
    // the overlay stays where it is while the table makes room; without this the column would start at the
    // rail's width and grow back (B-113, Andreas)
    sideContainer().classList.add('side-pinning');
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
    gSide.drag = { id: event.pointerId, startW: sideShown().width, snap: false };
    sideContainer().classList.add('side-dragging');
}

function sideMoveDrag(event) {
    const drag = gSide.drag;
    if (drag === null || event.pointerId !== drag.id) return;
    const w = sideGripW(event.clientX);
    drag.snap = w < SIDE_SNAP_VW;
    sideContainer().classList.toggle('side-snap', drag.snap);
    sideSetWidth(sideClampW(w));
}

/* event null: given up (phase change, layout switched); otherwise the release saves */
function sideEndDrag(event) {
    const drag = gSide.drag;
    if (drag === null || (event !== null && event.pointerId !== drag.id)) return;
    gSide.drag = null;
    const box = sideContainer();
    box.classList.remove('side-dragging', 'side-snap');
    if (event === null || event.type === 'pointercancel') {
        sideSetWidth(drag.startW);
        return;
    }
    if (drag.snap) {
        // collapses; the width before the drag stays for the next time it is opened
        const state = { collapsed: true, width: drag.startW };
        sideSave(gSide.phase, state);
        sideApply(state, 'anim');
        sideBlockHoverAt(event);
    } else {
        sideSave(gSide.phase, { collapsed: false, width: sideShown().width });
    }
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
    sideSave(gSide.phase, { collapsed: false, width });
}

/* --- the overlay: hover with a mouse, the button by click or tap, Escape and a click elsewhere close it --- */
/* over the rail (pointerover, also when moving between its parts) or the overlay (pointerenter). The round
 * button and the timer at the rail's foot do not open it: the overlay would slide over the button about to be
 * clicked. */
function sideHoverIn(event) {
    if (!gSide.active || event.pointerType !== 'mouse') return;
    gSide.inside = true;
    const box = sideContainer();
    if (!box.classList.contains('side-collapsed')) return;
    clearTimeout(gSide.closeTimer);
    if (gSide.peek || gSide.hoverBlocked) return;
    clearTimeout(gSide.openTimer);
    if (event.target instanceof Element && event.target.closest('#rail_round, #rail_timer') !== null) return;
    gSide.openTimer = setTimeout(() => {
        sidePeek(true);
        gSide.hoverAt = Date.now();
    }, SIDE_PEEK_OPEN_MS);
}

function sideHoverOut(event) {
    if (!gSide.active || event.pointerType !== 'mouse') return;
    // still over the rail or the overlay: stays
    const to = event.relatedTarget;
    if (to instanceof Node && (document.getElementById('side_rail').contains(to) || document.getElementById('sidebar').contains(to))) return;
    gSide.inside = false;
    gSide.hoverBlocked = false;
    clearTimeout(gSide.openTimer);
    if (!gSide.peek || gSide.peekSticky) return;
    clearTimeout(gSide.closeTimer);
    gSide.closeTimer = setTimeout(() => sidePeek(false), SIDE_PEEK_CLOSE_MS);
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

    rail.addEventListener('pointerover', sideHoverIn);
    sidebar.addEventListener('pointerenter', sideHoverIn);
    [rail, sidebar].forEach(element => element.addEventListener('pointerleave', sideHoverOut));

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
        if (rail.contains(event.target) || sidebar.contains(event.target)) return;
        // the menu panel lies over the column: a click in it is no click elsewhere
        const menu = document.getElementById('menu');
        if (menu !== null && menu.contains(event.target)) return;
        sidePeek(false);
    });

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
