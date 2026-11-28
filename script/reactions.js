/* B-14: reactions (B-110, B-131, B-139) and the nudge with its sound and title blink (B-133), moved out of
 * script.js unchanged. A classic deferred script before script.js: it shares the globals of script.js
 * (gConn, gLastJson, gPop, ...), which are only used inside functions. */

// the emojis of the bar (board.html data-react); 'nudge' is the nudge circle (no emoji, no flight)
const REACT_EMOJI = { cake: '🎂', heart: '❤️', clap: '👏', party: '🎉', think: '🤔', thumbs: '👍', fish: '🐟' };
const REACT_NUDGE = 'nudge';
// the same format check as poker-msg (MsgServer::parseReact, format only); unknown codes are ignored (onReaction)
const REACT_MSG = /^react:([0-9]{1,10}):([0-9]{1,10}):([a-z]{1,12})$/;
const REACT_LAND_SLOTS = 4; // landings on the same target at once get offset (--land-i 0..3), more overlap

function reactLabel(name) {
    return 'Throw a reaction at ' + name;
}

/* B-110: the smiley of the reaction button (.react, next to the delete button), same sketch as the trash can:
 * a tinted, hatched face, the outline and the face in ink. Static paths only, no user data. */
const REACT_ICON_PATHS = [
    { d: 'M12 3.6c4.7-.1 8.3 3.6 8.3 8.4 0 4.7-3.7 8.4-8.4 8.4-4.6 0-8.3-3.8-8.3-8.5 0-4.6 3.8-8.2 8.4-8.3z', cls: 'body' },
    { d: 'M5.6 13.9l2.2-1.9M6.6 16.6l3-2.6M15.9 16.4l2.6-2.3', cls: 'hatch', w: 1 },
    { d: 'M12 3.6c4.7-.1 8.3 3.6 8.3 8.4 0 4.7-3.7 8.4-8.4 8.4-4.6 0-8.3-3.8-8.3-8.5 0-4.6 3.8-8.2 8.4-8.3z', cls: 'ink', w: 1.8 },
    { d: 'M9.3 9.3v1.6M14.7 9.2v1.6', cls: 'ink', w: 2.1 },
    { d: 'M8.2 14c1.9 2.6 5.8 2.6 7.6-.2', cls: 'ink', w: 1.8 },
];

/* B-110: the nudge button (.nudge, left of the smiley): a tilted card that wobbles, same sketch as the trash can and
 * the smiley: a tinted, hatched card with the bar on top, in ink, and motion lines on both sides. Static paths only, no user data. */
const NUDGE_ICON_PATHS = [
    { d: 'M7.7 6.3l5.8-1.3c1.1-.2 1.8.2 2.1 1.3l2 9.8c.3 1.1-.1 1.8-1.3 2l-5.8 1.3c-1.1.2-1.8-.2-2.1-1.3l-2-9.8c-.3-1.1.2-1.8 1.3-2z', cls: 'body' },
    { d: 'M8.6 14.6l2-2.7M9.2 17.5l4.8-6.2M10.2 18.5l5.8-5.8', cls: 'hatch', w: 1 },
    { d: 'M7.7 6.3l5.8-1.3c1.1-.2 1.8.2 2.1 1.3l2 9.8c.3 1.1-.1 1.8-1.3 2l-5.8 1.3c-1.1.2-1.8-.2-2.1-1.3l-2-9.8c-.3-1.1.2-1.8 1.3-2z', cls: 'ink', w: 1.8 },
    { d: 'M8.2 8.6l6-1.3', cls: 'ink', w: 1.5 },
    { d: 'M4.4 7.4c-1 1.3-1.1 2.8-.3 4.2M2.3 6.1c-1.6 2.1-1.8 4.6-.5 6.7', cls: 'ink', w: 1.6 },
    { d: 'M19.9 12.9c1 1.3 1 2.8.1 4.2M22 11.6c1.6 2.1 1.6 4.6.3 6.7', cls: 'ink', w: 1.6 },
];

function nudgeLabel(name) {
    return 'Nudge ' + name;
}

/* B-110: for the reaction button (.react); the "no connection" symbol of an away player is CSS only (.c.is-away) */
function reactIcon() {
    return sketchIcon(REACT_ICON_PATHS);
}

/* B-110: for the nudge button (.nudge) */
function nudgeIcon() {
    return sketchIcon(NUDGE_ICON_PATHS);
}

/* the nudge and the smiley on a card or an observer: added when wanted (before the trash can, if any), removed
 * otherwise. Order: .nudge, .react, .delete (style.css "Table interaction"). */
function syncReactButton(holder, wanted, name, before = null) {
    let btn = holder.querySelector(':scope > .react');
    let nudge = holder.querySelector(':scope > .nudge');
    if (!wanted) {
        if (btn !== null) {
            if (gPop !== null && gPop.opener === btn) closePopover(false);
            btn.remove();
        }
        if (nudge !== null) nudge.remove();
        return;
    }
    if (btn === null) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'react';
        btn.title = 'Throw a reaction';
        btn.setAttribute('aria-haspopup', 'menu');
        btn.setAttribute('aria-expanded', 'false');
        btn.appendChild(reactIcon());
        holder.insertBefore(btn, before);
    }
    if (nudge === null) {
        nudge = document.createElement('button');
        nudge.type = 'button';
        nudge.className = 'nudge';
        nudge.title = 'Nudge';
        nudge.appendChild(nudgeIcon());
        holder.insertBefore(nudge, btn);
    }
    setAttrIfChanged(btn, 'aria-label', reactLabel(name));
    setAttrIfChanged(nudge, 'aria-label', nudgeLabel(name));
}

function openReactBar(btn) {
    const holder = holderOf(btn);
    if (holder === null) return;
    const bar = document.getElementById('react_bar');
    bar.querySelector('.react-bar-name').textContent = holderName(holder);
    bar.dataset.to = holderMkey(holder);
    updateReactBarQuota(); // B-139 (also a new day since the last opening)
    if (gTapQuery.matches) setOpenHolder(holder);
    openPopover(bar, btn, holder, btn);
    const first = bar.querySelector('button[data-react]');
    if (first !== null) first.focus({ preventScroll: true });
}

/* B-110 part 2: sends "react:<from>:<to>:<code>" over the WebSocket. Nothing happens here before the echo: poker-msg
 * sends the same text to every board of the team, the sender's too, and all of them animate on it (onReaction).
 * Not sent without an open connection (the reaction is lost) or above the limit of poker-msg (B-131, reactionAllowed).
 * A nudge is anonymous: from is always 0, also in the message. */
function sendReaction(toMkey, code) {
    const from = code === REACT_NUDGE ? '0' : (gLastJson === null ? '' : String(gLastJson.mkey ?? ''));
    if (code !== REACT_NUDGE && !Object.hasOwn(REACT_EMOJI, code)) return;
    const msg = 'react:' + from + ':' + String(toMkey) + ':' + code;
    if (!REACT_MSG.test(msg)) return;
    if (gConn === null || gConn.readyState !== WebSocket.OPEN) return;
    if (code !== REACT_NUDGE && reactLeft(code) <= 0) return; // B-139: used up today (poker-msg would drop it)
    if (!reactionAllowed()) return;
    try {
        gConn.send(msg);
        gReactSent.push(performance.now());
    } catch (e) {
        console.log('reaction not sent', e);
        return;
    }
    if (code !== REACT_NUDGE) countReaction(code); // B-139: only what really went out
}

/* B-139: every emoji of the bar can be thrown REACT_DAILY_QUOTA times a day per person and team (the nudge is no
 * throw: not counted). Must match the daily quota of poker-msg, which counts per sender mkey, emoji and UTC day and
 * drops throws above it. The day is the UTC calendar day, the same boundary as poker-msg.
 * The board counts in localStorage (REACT_USED: { day, used: { "<team>:<user id>": { fish: 1 } } }), so a reload
 * and other tabs of the same person see it (storage event). Another day: all counts are dropped. Without
 * localStorage only in memory (per page); poker-msg limits anyway. */
const REACT_DAILY_QUOTA = 1;
const REACT_USED_KEY = 'REACT_USED';
let gReactUsedMem = null; // the last state written, for a browser without (working) localStorage

function reactDay() {
    return new Date().toISOString().slice(0, 10);
}

function reactUsedOwner() {
    return String(t ?? '') + ':' + getUid();
}

/* the counts of today (all teams and users of this browser), a fresh object on another day or unreadable data */
function readReactUsed() {
    const day = reactDay();
    let all = gReactUsedMem;
    try {
        all = JSON.parse(localStorage.getItem(REACT_USED_KEY) ?? 'null');
    } catch (e) {
        // no localStorage (or broken JSON): the memory copy
    }
    const ok = all !== null && typeof all === 'object' && all.day === day
        && all.used !== null && typeof all.used === 'object';
    return ok ? all : { day, used: {} };
}

/* how many throws of an emoji are left today for me in this team */
function reactLeft(code) {
    const mine = readReactUsed().used[reactUsedOwner()];
    const n = mine !== null && typeof mine === 'object' ? Number(mine[code]) || 0 : 0;
    return Math.max(0, REACT_DAILY_QUOTA - n);
}

function countReaction(code) {
    const all = readReactUsed();
    const owner = reactUsedOwner();
    const mine = all.used[owner] !== null && typeof all.used[owner] === 'object' ? all.used[owner] : {};
    mine[code] = (Number(mine[code]) || 0) + 1;
    all.used[owner] = mine;
    gReactUsedMem = all;
    try {
        localStorage.setItem(REACT_USED_KEY, JSON.stringify(all));
    } catch (e) {
        // no localStorage: counted in memory only
    }
    updateReactBarQuota();
}

/* the rest under every emoji of the bar ("1×" / "0×"); used up: greyed, aria-disabled, says when it is back */
function updateReactBarQuota() {
    const bar = document.getElementById('react_bar');
    if (bar === null) return;
    bar.querySelectorAll('button[data-react]').forEach(btn => {
        const code = btn.dataset.react;
        if (!Object.hasOwn(REACT_EMOJI, code)) return;
        if (btn.dataset.name === undefined) btn.dataset.name = btn.getAttribute('aria-label') ?? code;
        const left = reactLeft(code);
        const label = btn.dataset.name + (left > 0 ? ' \u2013 ' + left + ' left today' : ' \u2013 used today, back tomorrow');
        const count = btn.querySelector('.react-left');
        if (count !== null && count.textContent !== left + '\u00d7') count.textContent = left + '\u00d7';
        setAttrIfChanged(btn, 'aria-label', label);
        setAttrIfChanged(btn, 'title', label);
        if (left > 0) btn.removeAttribute('aria-disabled');
        else setAttrIfChanged(btn, 'aria-disabled', 'true');
    });
}

/* B-139: a click (or Enter/Space) on a used-up emoji throws nothing and says why, like the rate limit hint (B-131):
 * at most once in REACT_LIMIT_TOAST_MS, so repeated clicks do not spam it */
let gReactUsedToastAt = -Infinity;
function reactUsedUpHint(btn) {
    const now = performance.now();
    if (now - gReactUsedToastAt < REACT_LIMIT_TOAST_MS) return;
    gReactUsedToastAt = now;
    const name = String(btn.dataset.name ?? btn.dataset.react ?? '').toLowerCase();
    showToast('You\u2019ve used today\u2019s ' + name + ' \u2013 back tomorrow.', 3000);
}

/* another tab of the same person threw (or a new day began there): the bar follows */
function onReactUsedStorage(event) {
    if (event.key === REACT_USED_KEY || event.key === null) updateReactBarQuota();
}

/* B-131: the same staggered limit as poker-msg (per connection, sliding windows; keep both in step): at most
 * [count, window in ms]. Above it poker-msg drops the reaction silently, so the board does not send it at all and
 * says so (except for the 1 s window: a double click, nothing to say). Per tab, like the connection. */
const REACT_LIMITS = [[3, 1000], [10, 60 * 1000]];
const REACT_LIMIT_TOAST_MS = 4000; // the hint at most once in this time, so it does not spam itself
let gReactSent = [];               // performance.now() of the own reactions sent (the longest window)
let gReactToastAt = -Infinity;

/* false (and the hint, if due) when one more reaction now would be above a limit */
function reactionAllowed() {
    const now = performance.now();
    const longest = REACT_LIMITS[REACT_LIMITS.length - 1][1];
    gReactSent = gReactSent.filter(t => now - t < longest);
    const over = REACT_LIMITS.filter(([max, ms]) => gReactSent.filter(t => now - t < ms).length >= max);
    if (over.length === 0) return true;
    if (over.some(([, ms]) => ms > 1000) && now - gReactToastAt >= REACT_LIMIT_TOAST_MS) {
        gReactToastAt = now;
        showToast('Easy there \u2013 too many reactions. Try again in a moment.', 3000);
    }
    return false;
}

/* B-163: true when a reaction target is the own card or the own observer row (the own card may carry its anonymous
 * handle, see ownCardMkey() in script.js) */
function isOwnTarget(to) {
    return gLastJson !== null && (String(gLastJson.mkey) === to || ownCardMkey(gLastJson) === to);
}

/* the card (#cbox .c) or the observer (#observers .obs) of a mkey, null when not on the board.
 * B-163: in anonymous mode after the reveal the cards carry handles (dao.php), reactions aim at those */
function reactHolder(mkey) {
    const card = document.getElementById(mkey);
    if (card !== null && card.matches('#cbox .c')) return card;
    return Array.from(document.querySelectorAll('#observers .obs')).find(li => li.dataset.mkey === mkey) ?? null;
}

/* the middle of an element in the window, null when it is not visible (outside the table or the window) */
function visibleCenter(el) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    const table = document.getElementById('table');
    const box = table === null ? null : table.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return null;
    if (box !== null && (x < box.left || x > box.right || y < box.top || y > box.bottom)) return null;
    return { x, y };
}

/* where a flight starts when the sender cannot be shown (not visible, anonymous mode): the top edge of the table */
function neutralFlightStart() {
    const table = document.getElementById('table');
    const r = table === null ? { left: 0, width: window.innerWidth, top: 0 } : table.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: Math.max(0, r.top) };
}

/* a CSS duration token ("900ms", "1.8s") in ms */
function cssDurationMs(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return fallback;
    return v.endsWith('ms') ? n : (v.endsWith('s') ? n * 1000 : fallback);
}

/* the flights under way: { fly, anim }; dropped when the tab is hidden (nothing is played late) */
const gFlights = new Set();

/* an echo of poker-msg: "react:<from>:<to>:<code>" (format checked already). A nudge only shakes the target card on
 * every board (harder on the board of the nudged one): no flight, no emoji, no name. An emoji flies from the sender to
 * the target, then lands. Unknown code or target gone: nothing. Anonymous mode: no sender name and the flight starts
 * at the top of the table (no hint who threw it). Tab hidden: dropped, not buffered (Andreas). */
/* the visible part of a holder a flight starts or lands on: the card face of a card, the name tag of an observer
 * (not the room for the circles above it) */
function flightAnchor(holder) {
    const part = holder.querySelector(holder.classList.contains('c') ? ':scope > .pc' : '.obs-name');
    return part ?? holder;
}

function onReaction(from, to, code) {
    // B-133: a nudge for me also rings and, in a hidden tab, flashes the title (the shake is dropped there)
    if (code === REACT_NUDGE && isOwnTarget(to)) alertNudge();
    if (document.visibilityState !== 'visible') return;
    if (code !== REACT_NUDGE && !Object.hasOwn(REACT_EMOJI, code)) return;
    const target = reactHolder(to);
    if (target === null) return;
    if (code === REACT_NUDGE) { nudgeTarget(target, to); return; }
    const anonymous = gLastJson !== null && gLastJson.anonymous_mode === 1;
    const sender = anonymous ? null : reactHolder(from);
    const name = sender === null ? '' : holderName(sender);
    const land = () => landReaction(to, code, name);

    if (prefersReducedMotion() || typeof Element.prototype.animate !== 'function') { land(); return; }
    const ra = flightAnchor(target).getBoundingClientRect();
    const end = { x: ra.left + ra.width / 2, y: ra.top + ra.height / 2 };
    const start = (sender === null ? null : visibleCenter(flightAnchor(sender))) ?? neutralFlightStart();

    const fly = document.createElement('span');
    fly.className = 'react-fly';
    fly.setAttribute('aria-hidden', 'true');
    fly.textContent = REACT_EMOJI[code];
    document.body.appendChild(fly);
    const half = fly.offsetWidth / 2;
    const halfH = fly.offsetHeight / 2;
    // a quadratic curve with its top above the higher end (a throw), the emoji turns and grows a little
    const dist = Math.hypot(end.x - start.x, end.y - start.y);
    const ctrl = { x: (start.x + end.x) / 2, y: Math.min(start.y, end.y) - Math.max(60, dist * 0.35) };
    const steps = 12;
    const frames = [];
    for (let i = 0; i <= steps; i++) {
        const k = i / steps;
        const x = (1 - k) * (1 - k) * start.x + 2 * (1 - k) * k * ctrl.x + k * k * end.x;
        const y = (1 - k) * (1 - k) * start.y + 2 * (1 - k) * k * ctrl.y + k * k * end.y;
        const scale = 0.6 + 0.6 * Math.sin(Math.PI * k) + 0.4 * k;
        frames.push({ transform: `translate(${(x - half).toFixed(1)}px, ${(y - halfH).toFixed(1)}px) `
                + `rotate(${Math.round(-30 + 390 * k)}deg) scale(${scale.toFixed(2)})`, offset: k });
    }
    const anim = fly.animate(frames, { duration: cssDurationMs('--react-fly-dur', 900), easing: 'ease-in-out' });
    const flight = { fly, anim, dropped: false };
    gFlights.add(flight);
    const done = () => {
        gFlights.delete(flight);
        fly.remove();
        if (!flight.dropped) land();
    };
    anim.onfinish = done;
    anim.oncancel = done;
}

/* the tab is hidden: flights and landings under way are dropped, not played when it is back */
function dropReactions() {
    gFlights.forEach(flight => {
        flight.dropped = true;
        flight.anim.cancel();
    });
    gFlights.clear();
    document.querySelectorAll('.react-fly, .react-land').forEach(el => el.remove());
}

/* a nudge: the target shakes on every board, harder on the board of the nudged one */
function nudgeTarget(target, to) {
    const isMe = isOwnTarget(to);
    restartClass(target, 'is-nudged', 700);
    if (isMe) restartClass(target, 'is-nudged-me', 1100);
}

/* B-133: the nudged one hears a short, quiet two-tone chime (Web Audio, no file) and feels a short vibration, both
 * behind the switch "Sound on nudge" (per device, localStorage, default on). A hidden tab also flashes the title
 * until it is visible again (not behind the switch). Browsers only let a page play sound after a click or tap on it:
 * the AudioContext is made (or resumed) on the first one; before that, the nudge stays silent. */
const NUDGE_SOUND_KEY = 'NUDGE_SOUND';
const NUDGE_TITLE_PREFIX = '\u{1F44B} Your turn \u2013 ';
let gAudioCtx = null;
let gTitleBase = null;      // the page title without the nudge prefix (setPageTitle())
let gTitleBlink = null;     // the interval of the flashing title, null when it does not flash

function nudgeSoundOn() {
    try {
        return localStorage.getItem(NUDGE_SOUND_KEY) !== '0';
    } catch (e) {
        return true;
    }
}

function setNudgeSound(value) {
    try {
        localStorage.setItem(NUDGE_SOUND_KEY, value === 'on' ? '1' : '0');
    } catch (e) { /* not remembered */ }
}

/* the first click, tap or key on the page: make or wake the AudioContext (until it runs).
 * On touch, pointerdown is no user activation (iOS only counts pointerup/touchend/click),
 * so all of them are heard; the listeners go away once the context really runs. */
const NUDGE_WAKE_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];

function initNudgeAudio() {
    checkRadio('cet_nudge_sound', nudgeSoundOn() ? 'on' : 'off');
    const Ctx = window.AudioContext ?? window.webkitAudioContext;
    if (typeof Ctx !== 'function') return;
    const done = () => {
        if (gAudioCtx === null || gAudioCtx.state !== 'running') return;
        NUDGE_WAKE_EVENTS.forEach(type => document.removeEventListener(type, wake, true));
    };
    const wake = () => {
        try {
            if (gAudioCtx === null) gAudioCtx = new Ctx();
            if (gAudioCtx.state !== 'running') {
                const p = gAudioCtx.resume();
                if (p && typeof p.then === 'function') p.then(done, () => {});
            }
        } catch (e) {
            gAudioCtx = null;
            return;
        }
        done();
    };
    NUDGE_WAKE_EVENTS.forEach(type => document.addEventListener(type, wake, true));
}

function alertNudge() {
    if (nudgeSoundOn()) {
        playNudgeChime();
        // only after a tap on the page, else Chrome logs a blocked call
        if (typeof navigator.vibrate === 'function' && navigator.userActivation?.hasBeenActive !== false) {
            try { navigator.vibrate([60, 40, 60]); } catch (e) { /* none */ }
        }
    }
    if (document.visibilityState !== 'visible') startTitleBlink();
}

/* two short sine tones (E5, A5), each with a soft attack and decay, about 280 ms in all */
function playNudgeChime() {
    const ctx = gAudioCtx;
    if (ctx === null || ctx.state !== 'running') return;
    try {
        const t0 = ctx.currentTime;
        [[659.25, 0], [880, 0.13]].forEach(([freq, at]) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t0 + at);
            gain.gain.setValueAtTime(0.0001, t0 + at);
            gain.gain.exponentialRampToValueAtTime(0.08, t0 + at + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.15);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t0 + at);
            osc.stop(t0 + at + 0.16);
        });
    } catch (e) { /* no sound */ }
}

/* the page title; while it flashes, the new title is used from the next step on */
function setPageTitle(title) {
    gTitleBase = title;
    if (gTitleBlink === null || !document.title.startsWith(NUDGE_TITLE_PREFIX)) document.title = title;
    else document.title = NUDGE_TITLE_PREFIX + title;
}

function startTitleBlink() {
    if (gTitleBlink !== null) return;
    if (gTitleBase === null) gTitleBase = document.title;
    document.title = NUDGE_TITLE_PREFIX + gTitleBase;
    gTitleBlink = setInterval(() => {
        document.title = document.title.startsWith(NUDGE_TITLE_PREFIX) ? gTitleBase : NUDGE_TITLE_PREFIX + gTitleBase;
    }, 1000);
}

function stopTitleBlink() {
    if (gTitleBlink === null) return;
    clearInterval(gTitleBlink);
    gTitleBlink = null;
    document.title = gTitleBase;
}

/* the slot of a new landing on a target (--land-i): the first one free, so landings at once are offset; all taken:
 * they overlap ("Gewusel ist ok") */
function landSlot(target) {
    const used = new Set(Array.from(target.querySelectorAll(':scope > .react-land'))
        .map(el => Number(el.style.getPropertyValue('--land-i')) || 0));
    for (let i = 0; i < REACT_LAND_SLOTS; i++) if (!used.has(i)) return i;
    return used.size % REACT_LAND_SLOTS;
}

/* the landing at the target (looked up again: it may have gone or been rebuilt during the flight) */
function landReaction(to, code, name) {
    const target = reactHolder(to);
    if (target === null) return;
    const span = document.createElement('span');
    span.className = 'react-land';
    span.setAttribute('aria-hidden', 'true');
    span.style.setProperty('--land-i', String(landSlot(target)));
    const emoji = document.createElement('span');
    emoji.className = 'react-emoji';
    emoji.textContent = REACT_EMOJI[code];
    span.appendChild(emoji);
    if (name !== '') {
        const from = document.createElement('span');
        from.className = 'react-from';
        from.textContent = name;
        span.appendChild(from);
    }
    target.appendChild(span);
    const remove = () => span.remove();
    span.addEventListener('animationend', remove);
    setTimeout(remove, cssDurationMs('--react-land-dur', 1800) + 500); // no animation (hidden, no CSS): gone anyway

    if (target.classList.contains('c')) restartClass(target, 'is-hit', 450);
}

/* sets a class for ms milliseconds; set again while it is on, the CSS animation starts over */
const gClassTimers = new WeakMap();
function restartClass(el, cls, ms) {
    if (!gClassTimers.has(el)) gClassTimers.set(el, {});
    const timers = gClassTimers.get(el);
    clearTimeout(timers[cls]);
    if (el.classList.contains(cls)) {
        el.classList.remove(cls);
        void el.offsetWidth; // restart the animation
    }
    el.classList.add(cls);
    timers[cls] = setTimeout(() => el.classList.remove(cls), ms);
}

/* B-131: a held Enter/Space on a circle or an emoji sends one reaction, not one per key repeat (the repeats would
 * click the button again and again; with Enter even reopen the emoji bar and throw the next one). The browser
 * clicks a button on Enter keydown and on Space keyup: a repeated keydown is dropped before it clicks. */
function onReactKeyRepeat(event) {
    if (!event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target === null) return;
    if (target.closest('#react_bar button, #cbox .c :is(.nudge, .react), #observers .obs :is(.nudge, .react)') === null) {
        return;
    }
    event.preventDefault();
    event.stopPropagation();
}
