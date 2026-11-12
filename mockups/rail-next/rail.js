/* "Next item" in the collapsed sidebar (B-52 S1b). Static, throw-away: no API calls, example data only.
   All texts go through textContent (h()). Mockup states: handle on the left edge or key M.
   Deep links: ?view=board|compare &v=a|b|c &phase=voting|revealed &items=none|first|last &peek=0|1 &mode=light &clean=1 */
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const SVGNS = 'http://www.w3.org/2000/svg';
function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v);
    for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : String(k));
    return e;
}
function s(tag, attrs, ...kids) {
    const e = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    kids.forEach(k => e.append(k));
    return e;
}
const icon = id => s('svg', { class: 'i', 'aria-hidden': 'true' }, s('use', { href: '#i-' + id }));

/* ---------------------------------------------------------------- data (examples only) */
const ITEMS = [
    { id: 'PAY-142', h: 'Pay by invoice for B2B customers' },
    { id: 'PAY-150', h: 'Export orders as CSV' },
    { id: '', h: 'Spike: replace the PDF library' }
];
const FIB = ['0', '½', '1', '2', '3', '5', '8', '13', '20', '40', '100', '∞', '☕', '?'];
const SYM = { '3': 's-3', '5': 's-5', '8': 's-8' };
const COLOR = { '3': 'var(--c-orange)', '5': 'var(--c-violet)', '8': 'var(--c-blue)' };
const PLAYERS = ['Ann', 'Ben', 'Chris', 'Dana', 'Emil', 'Fatma'];
const VOTES = ['3', '8', '5', '5', '8', '5'];

const S = { view: 'board', v: 'a', phase: 'revealed', items: 'first', peek: '0', mode: 'dark', clean: false };

function toast(t) { const e = $('#toast'); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { e.hidden = true; }, 2600); }

/* ---------------------------------------------------------------- table */
function face(key, name, me) {
    let card;
    if (key === null) card = h('div', { class: 'face empty' });
    else if (key === 'back') card = h('div', { class: 'face back' });
    else card = h('div', { class: 'face', style: '--c:' + COLOR[key] },
        s('svg', { viewBox: '0 0 100 120', 'aria-label': key }, s('use', { href: '../../src/cards.svg?v=11#' + SYM[key] })));
    return h('div', { class: 'pc' }, h('span', { class: 'nm' + (me ? ' me' : '') }, name), card);
}
function renderTable() {
    const t = $('#table');
    if (S.view === 'compare') { t.replaceChildren(compare()); return; }
    const rev = S.phase === 'revealed';
    const cards = h('div', { class: 'cards' }, PLAYERS.map((n, i) => face(rev ? VOTES[i] : (i === 3 || i === 4 ? null : 'back'), n, i === 0)));
    const d = h('div', { class: 'deck' + (rev ? ' off' : '') }, FIB.map(v => h('span', { class: v === (rev ? '3' : '3') ? 'sel' : '' }, v)));
    t.replaceChildren(h('div', { style: 'flex:1' }), cards, h('div', { style: 'flex:1' }), d);
}

/* ---------------------------------------------------------------- the rail */
/* o: { v, phase, items } – one rail; used on the board and (several times) in the compare view */
function rail(o, el) {
    const rev = o.phase === 'revealed', n = ITEMS.length;
    const pos = o.items === 'none' ? 0 : o.items === 'last' ? n : 1, last = pos === n;
    const kids = [h('button', { class: 'icon-btn rail-open', type: 'button', 'aria-label': 'Open sidebar', title: 'Open sidebar' }, icon('dleft'))];
    kids[0].onclick = openPeek;

    /* the item marker: list icon, "1/3", and a word – "item" while voting; in C after the reveal "next"/"finish" */
    if (pos) {
        const cta = o.v === 'c' && rev;
        const word = cta ? (last ? 'finish' : 'next') : 'item';
        const b = h('button', { class: 'rail-item' + (cta ? ' cta' : ''), type: 'button',
            'aria-label': 'Item ' + pos + ' of ' + n + (cta ? ' – ' + (last ? 'finish item' : 'next item') : '') + ' – open sidebar' },
        icon(cta ? (last ? 'flag' : 'skip') : 'list'), h('b', null, pos + '/' + n), h('small', null, word));
        b.onclick = () => openPeek(cta);
        kids.push(b, h('span', { class: 'rail-sep' }));
    }

    if (!rev) kids.push(h('p', { class: 'rail-tile', style: 'margin:0' }, h('b', { class: 'rail-count' }, '4/6'), h('small', null, 'voted'),
        h('span', { class: 'rail-wait', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'))));
    else {
        const c = {}; VOTES.forEach(v => { c[v] = (c[v] || 0) + 1; });
        const max = Math.max(...Object.values(c));
        kids.push(h('div', { class: 'rail-tile rail-result', style: 'margin:0' },
            h('span', { class: 'rail-bars', 'aria-hidden': 'true' }, FIB.map(v => h('i', { class: c[v] === max ? 'top' : null, style: c[v] ? 'height:' + Math.round(22 * c[v] / max) + 'px' : null }))),
            h('p', { class: 'rail-range' }, '3–8')));
    }
    kids.push(h('span', { class: 'grow' }));

    const foot = h('div', { class: 'rail-foot' }, h('span', { class: 'rail-timer' }, rev ? '04:12' : '02:47'));
    const round = rev ? h('button', { class: 'rail-btn primary', type: 'button', 'aria-label': 'New round', title: 'New round' }, icon('arrow'))
        : h('button', { class: 'rail-btn', type: 'button', 'aria-label': 'Restart round', title: 'Restart round' }, icon('reset'));
    const nextShown = rev && pos && o.v !== 'c';
    const nextLabel = last ? 'Finish item' : 'Next item', nextWord = last ? 'finish' : 'next', nextIcon = last ? 'flag' : 'skip';
    if (nextShown && o.v === 'a') {
        /* A: a second button above "New round" (which stays where it is), each with its word below */
        const nb = h('button', { class: 'rail-btn next', type: 'button', 'aria-label': nextLabel, title: nextLabel }, icon(nextIcon));
        nb.onclick = () => toast(nextLabel + ' (mockup)');
        foot.append(h('span', { class: 'rail-act' }, nb, h('small', { class: 'acc' }, nextWord)),
            h('span', { class: 'rail-act' }, round, h('small', null, 'round')));
    } else if (nextShown && o.v === 'b') {
        /* B: one block, two equal halves; word inside each half */
        const nb = h('button', { type: 'button', 'aria-label': nextLabel }, icon(nextIcon), nextWord);
        const rb = h('button', { type: 'button', 'aria-label': 'New round' }, icon('arrow'), 'round');
        nb.onclick = () => toast(nextLabel + ' (mockup)');
        rb.onclick = () => toast('New round (mockup)');
        foot.append(h('div', { class: 'rail-split', role: 'group', 'aria-label': 'What next?' }, nb, rb));
    } else foot.append(round);
    kids.push(foot);
    el.replaceChildren(...kids);
    return el;
}

/* ---------------------------------------------------------------- overlay (the whole column over the table) */
function openPeek(fromCta) { S.peek = '1'; S.flash = fromCta === true; render(); }
function renderPeek() {
    const p = $('#peek'), open = S.view === 'board' && S.peek === '1';
    p.hidden = !open;
    if (!open) return;
    const n = ITEMS.length, pos = S.items === 'none' ? 0 : S.items === 'last' ? n : 1, it = ITEMS[pos - 1], rev = S.phase === 'revealed';
    const close = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', title: 'Collapse' }, icon('dright'));
    close.onclick = () => { S.peek = '0'; S.flash = false; render(); };
    const item = pos ? h('section', { class: 'item' },
        h('h2', { class: 'sl' }, 'item ' + pos + ' of ' + n),
        it.id ? h('div', { class: 'meta' }, h('span', { class: 'id' }, it.id)) : null,
        h('h3', null, it.h),
        pos < n ? h('button', { class: 'more-items', type: 'button' }, '+' + (n - pos) + ' more · next: ' + ITEMS[pos].h) : null)
        : h('section', { class: 'item' }, h('h2', { class: 'sl' }, 'topic'), h('p', { class: 'muted', style: 'margin:0' }, 'Sprint 42 refinement'));
    const res = rev ? h('p', { class: 'range' }, 'range ', h('b', null, '3–8'), ' · estimate ', h('b', null, '8')) : h('p', { class: 'range' }, h('b', null, '4/6'), ' voted');
    const dock = h('div', { class: 'dock' });
    if (rev) {
        dock.append(h('button', { class: 'btn', type: 'button' }, 'New round'));
        if (pos) dock.append(h('button', { class: 'btn' + (S.flash ? ' flash' : ''), type: 'button', id: 'peekNext' }, pos === n ? 'Finish item' : 'Next item', icon('next')));
        else dock.style.gridTemplateColumns = '1fr';
    } else { dock.style.gridTemplateColumns = '1fr'; dock.append(h('button', { class: 'btn', type: 'button', style: 'background:var(--bg);color:var(--text);border-color:var(--line-strong)' }, 'Restart round')); }
    p.replaceChildren(h('div', { class: 'status' }, rev ? 'revealed' : 'voting', close), item, res, h('div', { class: 'grow' }), dock);
}

/* ---------------------------------------------------------------- compare view */
function compare() {
    const NOTES = {
        a: 'Second button above “New round” (that one stays where it is). Both with a word below: “next”/“finish” and “round”. Next framed, New round filled.',
        b: 'One block with two equal halves, word inside the button. Reads as “what now?”. Same weight as in the open column (both filled).',
        c: 'Nothing new at the bottom. The item marker on top turns into “next”/“finish” after the reveal; a click opens the column, its “Next item” is marked.'
    };
    const TITLES = { a: 'A stack', b: 'B split', c: 'C item chip' };
    return h('div', { class: 'compare' }, ['a', 'b', 'c'].map(v => h('div', { class: 'col' },
        h('h2', null, TITLES[v]),
        h('div', { class: 'pair' }, [['voting', 'first', 'voting'], ['revealed', 'first', 'item 1/3'], ['revealed', 'last', 'last item']].map(([ph, it, cap]) =>
            h('div', { class: 'spec' }, rail({ v, phase: ph, items: it }, h('div', { class: 'rail' })), h('p', null, cap)))),
        h('p', { class: 'note' }, NOTES[v]))));
}

function render() {
    document.body.classList.toggle('light-theme', S.mode === 'light');
    document.body.classList.toggle('clean', S.clean);
    $('#brand').src = '../../src/' + (S.mode === 'light' ? 'brand_light.svg' : 'brand_dark.svg');
    $('#page').classList.toggle('compare-on', S.view === 'compare');
    $('#rail').hidden = S.view === 'compare';
    $('#page').style.gridTemplateColumns = S.view === 'compare' ? '1fr' : '';
    renderTable();
    if (S.view === 'board') rail(S, $('#rail'));
    renderPeek();
    if (S.flash) requestAnimationFrame(() => $('#peekNext') && $('#peekNext').focus());
    $$('#mockPanel [data-m]').forEach(g => g.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === S[g.dataset.m]))));
}

/* ---------------------------------------------------------------- mockup handle (not part of the app) */
function toggleMock(force) {
    const p = $('#mockPanel'), open = force != null ? force : p.hidden;
    p.hidden = !open; $('#mockHandle').setAttribute('aria-expanded', String(open));
}
$('#mockHandle').onclick = () => toggleMock();
$('#mockPanel').addEventListener('click', e => {
    const b = e.target.closest('[data-m] button'); if (!b) return;
    S[b.closest('[data-m]').dataset.m] = b.dataset.val; S.flash = false;
    render();
});
$('#btnMode').onclick = () => { S.mode = S.mode === 'dark' ? 'light' : 'dark'; render(); };
document.addEventListener('keydown', e => {
    if (e.key === 'm' || e.key === 'M') toggleMock();
    if (e.key === 'Escape') { toggleMock(false); if (S.peek === '1') { S.peek = '0'; render(); } }
});
$('#mpLink').onclick = e => {
    e.preventDefault();
    const q = new URLSearchParams();
    ['view', 'v', 'phase', 'items', 'peek', 'mode'].forEach(k => q.set(k, S[k]));
    history.replaceState(null, '', '?' + q.toString());
    toast('URL updated – copy it from the address bar');
};
const q = new URLSearchParams(location.search);
for (const k of ['view', 'v', 'phase', 'items', 'peek', 'mode']) if (q.get(k)) S[k] = q.get(k);
S.clean = q.get('clean') === '1';
S.flash = S.peek === '1' && S.v === 'c' && q.get('flash') === '1';
render();
if (q.get('mock')) toggleMock(true);
