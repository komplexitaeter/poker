/* Topic list S1 mockup (B-52). Static, throw-away: no API calls, no analytics, example data only.
   All texts go through textContent (h()). Mockup states: handle on the left edge or key M.
   Deep links: ?state=single|list|voting|results|traffic &menu=0|1 &edit=1 &hint=0 &mode=light &clean=1 */
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
function iconBtn(id, label, fn) { const b = h('button', { class: 'icon-btn', type: 'button', 'aria-label': label, title: label }, icon(id)); if (fn) b.onclick = fn; return b; }

/* ---------------------------------------------------------------- data (examples only) */
const STAGES = ['new', 'rough', 'shaping', 'ready'];
const STAGE_TEXT = [
    'We do not know it yet and need to have a look.',
    'We have a rough idea and can start asking the right questions.',
    'The direction gets clearer, but everything can still change.',
    'Final polish – we could start building.'
];
const SINGLE = 'Login with SSO for the admin area';
const OPEN0 = [
    { id: 'PAY-142', h: 'Pay by invoice for B2B customers', d: 'Business customers can pay by invoice. Credit check via the risk service, payment terms 14 or 30 days. Open: per customer or per contract? Reminder mails reuse the existing dunning job.', mat: 2 },
    { id: 'PAY-150', h: 'Export orders as CSV', d: 'New – just introduce it and collect first questions.', mat: 0 },
    { id: '', h: 'Spike: replace the PDF library', d: '', mat: 1 }
];
const DONE0 = [
    { id: 'PAY-133', h: 'Rate limit for the public API', res: '5', mat: 3 },
    { id: '', h: 'Release plan Q1 still realistic?', dist: { g: 3, y: 2, r: 1 }, mat: 1 }
];
const FIB = ['0', '½', '1', '2', '3', '5', '8', '13', '20', '40', '100', '∞', '☕', '?'];
const NUMERIC = ['0', '½', '1', '2', '3', '5', '8', '13', '20', '40', '100']; // ∞ ☕ ? carry no value
const SYM = { '3': 's-3', '5': 's-5', '8': 's-8', g: 's-light-green', y: 's-light-yellow', r: 's-light-red' };
const COLOR = { '3': 'var(--c-orange)', '5': 'var(--c-violet)', '8': 'var(--c-blue)', g: 'var(--c-green)', y: 'var(--c-yellow)', r: 'var(--c-red)' };
const TRAFFIC = [['g', 'green'], ['y', 'yellow'], ['r', 'red']];
const PLAYERS = ['Ann', 'Ben', 'Chris', 'Dana', 'Emil', 'Fatma'];
const VOTES = ['3', '8', '5', '5', '8', '5'];
const TVOTES = ['g', 'y', 'g', 'r', 'g', 'y'];

const S = { state: 'single', menu: '1', edit: '0', hint: '1', mode: 'dark', clean: false, est: null, more: false };
let OPEN = OPEN0.map(o => ({ ...o })), DONE = DONE0.map(o => ({ ...o })), single = SINGLE;

/* ---------------------------------------------------------------- maturity: lying triangle (B-129) */
/* wide left (many open questions), point right (ready); the knob wanders right. A real <input type=range>
   (0–3) lies invisibly on top, so it works with mouse, touch and keys. ro: display only (lists). */
function matSvg(level, W, H) {
    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    const pos = i => (i + 0.5) / 4, half = x => H / 2 * (1 - x / W), x = pos(level) * W;
    svg.append(s('polygon', { class: 'done', points: `0,0 ${x},${H / 2 - half(x)} ${x},${H / 2 + half(x)} 0,${H}` }));
    for (let i = 0; i < 4; i++) { const t = pos(i) * W; svg.append(s('line', { class: 'tick', x1: t, x2: t, y1: H / 2 - half(t), y2: H / 2 + half(t) })); }
    svg.append(s('polygon', { class: 'tri', points: `0,0 ${W},${H / 2} 0,${H}` }));
    svg.append(s('line', { class: 'knobline', x1: x, x2: x, y1: -2, y2: H + 2 }));
    svg.append(s('circle', { class: 'knob', cx: x, cy: -2, r: H > 20 ? 5 : 3 }));
    return svg;
}
function mat(item, opts) {
    const o = opts || {}, [W, H] = o.big ? [150, 30] : [40, 12];
    const wrap = h('span', { class: 'mat' + (o.big ? ' big' : '') + (o.ro ? ' ro' : ''), title: 'Maturity: ' + STAGES[item.mat] + ' – ' + STAGE_TEXT[item.mat] });
    const input = h('input', { type: 'range', min: 0, max: 3, step: 1, value: item.mat, 'aria-label': 'Maturity', 'aria-valuetext': STAGES[item.mat] });
    const box = h('span', { style: 'position:relative;display:inline-block' }, input, matSvg(item.mat, W, H));
    input.addEventListener('input', () => { item.mat = +input.value; render(); requestAnimationFrame(() => $('.mat.big input') && $('.mat.big input').focus()); });
    wrap.append(box); if (!o.nolabel) wrap.append(h('span', { class: 'lbl' }, STAGES[item.mat]));
    return wrap;
}

/* ---------------------------------------------------------------- table (cards, deck) */
function face(key, name, me) {
    let card;
    if (key === null) card = h('div', { class: 'face empty' });
    else if (key === 'back') card = h('div', { class: 'face back' });
    else card = h('div', { class: 'face', style: '--c:' + COLOR[key] },
        s('svg', { viewBox: '0 0 100 120', 'aria-label': key }, s('use', { href: '../../src/cards.svg?v=11#' + SYM[key] })));
    return h('div', { class: 'pc' }, h('span', { class: 'nm' + (me ? ' me' : '') }, name), card);
}
function deck(traffic, off, sel) {
    const d = h('div', { class: 'deck' + (off ? ' off' : ''), 'aria-label': 'Your cards' });
    if (traffic) TRAFFIC.forEach(([k]) => d.append(h('span', { class: k === sel ? 'sel' : '' }, h('i', { class: 'dot', style: '--c:' + COLOR[k] }))));
    else FIB.forEach(v => d.append(h('span', { class: v === sel ? 'sel' : '' }, v)));
    return d;
}
function renderTable() {
    const st = S.state, t = $('#table');
    const traffic = st === 'traffic', revealed = st === 'results' || traffic;
    const votes = traffic ? TVOTES : VOTES;
    const cards = h('div', { class: 'cards' }, PLAYERS.map((n, i) =>
        face(revealed ? votes[i] : (i === 3 || i === 4 ? null : 'back'), n, i === 0)));
    const mt = h('div', { class: 'm-topic' }, h('span', { class: 'sl' }, st === 'single' ? 'topic' : '1/' + OPEN.length),
        h('span', { class: 'h' }, st === 'single' ? single : OPEN[0].h), iconBtn('down', 'Show the whole topic'));
    t.replaceChildren(mt, h('div', { style: 'flex:1' }), cards, h('div', { style: 'flex:1' }), deck(traffic, revealed, revealed ? votes[0] : '3'));
}

/* ---------------------------------------------------------------- sidebar */
function openMenu() { S.menu = '1'; render(); }
function itemSection(compact, noMat) {
    const it = OPEN[0], rest = OPEN.slice(1);
    const desc = it.d ? h('p', { class: 'desc' + (S.more ? '' : ' clamp') }, it.d) : null;
    const moreBtn = it.d && it.d.length > 90 ? h('button', { class: 'link', type: 'button', 'aria-expanded': String(S.more) },
        S.more ? 'less' : 'more', icon(S.more ? 'up' : 'down')) : null;
    if (moreBtn) moreBtn.onclick = () => { S.more = !S.more; render(); };
    const sec = h('section', { class: 'item', 'aria-label': 'Current item' },
        h('div', { class: 'sec-head' }, h('h2', { class: 'sl' }, 'item 1 of ' + OPEN.length), iconBtn('pen', 'Edit items', openMenu)),
        h('div', { class: 'meta' }, it.id ? h('span', { class: 'id' }, it.id) : null, compact || noMat ? null : mat(it, { ro: true })),
        h('h3', null, it.h), compact ? null : desc, compact ? null : moreBtn);
    if (rest.length) {
        const m = h('button', { class: 'more-items', type: 'button', title: 'Open the topic list' }, '+' + rest.length + ' more · next: ' + rest[0].h);
        m.onclick = openMenu;
        sec.append(m);
    }
    return sec;
}
function singleSection() {
    return h('section', { class: 'item', 'aria-label': 'Topic' },
        h('div', { class: 'sec-head' }, h('h2', { class: 'sl' }, 'topic'), iconBtn('pen', 'Edit topic', openMenu)),
        h('p', { class: 'topic-text' }, single));
}
function spread(traffic) {
    const votes = traffic ? TVOTES : VOTES, c = {};
    votes.forEach(v => { c[v] = (c[v] || 0) + 1; });
    const max = Math.max(...Object.values(c)), keys = traffic ? TRAFFIC.map(t => t[0]) : FIB;
    const bars = h('div', { class: 'spread-bars' + (traffic ? ' traffic' : ''), role: traffic ? null : 'group', 'aria-label': traffic ? null : 'Spread – pick the current estimate' });
    keys.forEach(v => {
        const n = c[v] || 0, clickable = !traffic && NUMERIC.includes(v);
        const cls = 'spread-col' + (n === max ? ' top' : '') + (!traffic && v === S.est ? ' est' : '');
        const bar = h('span', { class: 'bar' + (n ? '' : ' zero') }, Array.from({ length: n }, () => h('i', null)));
        const val = traffic ? h('span', { class: 'val' }, h('i', { class: 'dot', style: '--c:' + COLOR[v] })) : h('span', { class: 'val' }, v);
        const col = h(clickable ? 'button' : 'span', { class: cls, type: clickable ? 'button' : null, style: traffic ? '--c:' + COLOR[v] : null,
            'aria-pressed': clickable ? String(v === S.est) : null, 'aria-label': (traffic ? TRAFFIC.find(t => t[0] === v)[1] : v) + ': ' + n + ' vote' + (n === 1 ? '' : 's') },
        h('span', { class: 'cnt' }, n || ''), bar, val);
        if (clickable) col.onclick = () => { S.est = v; render(); };
        bars.append(col);
    });
    const range = traffic ? '3 green · 2 yellow · 1 red' : 'range 3–8';
    const sec = h('section', { 'aria-label': 'Round result' }, h('div', { class: 'spread-head' }, h('h2', { class: 'sl' }, 'spread'), h('span', null, range)), bars);
    if (traffic) {
        sec.append(h('p', { class: 'round-tip', style: 'margin-top:10px' }, 'No single value for this deck – the spread is what you talk about.'));
    } else {
        const sel = h('select', { id: 'estSel' }, NUMERIC.map(v => h('option', { value: v, selected: v === S.est }, v)));
        sel.onchange = () => { S.est = sel.value; render(); };
        sec.append(h('div', { class: 'estimate' }, h('label', { for: 'estSel' }, 'Current estimate'), sel,
            h('span', { class: 'why' }, S.est === '8' ? 'Highest card. Click a bar to pick another.' : 'Picked by the team. The highest card was 8.')));
    }
    return sec;
}
function matSection() {
    const it = OPEN[0];
    return h('section', { class: 'mat-sec', 'aria-label': 'Maturity' },
        h('div', { class: 'sec-head' }, h('h2', { class: 'sl' }, 'maturity'), mat(it, { big: true })),
        h('p', { class: 'stage-text' }, STAGE_TEXT[it.mat]));
}
function renderSide() {
    const st = S.state, side = $('#sidebar'), kids = [];
    const revealed = st === 'results' || st === 'traffic';
    kids.push(h('p', { class: 'round-status' }, revealed ? 'revealed' : 'voting  4 of 6'));
    if (S.hint === '1' && st !== 'single') kids.push(h('div', { class: 'tl-hint', 'aria-hidden': 'true' }, h('span', null, 'later: session timeline')));
    if (st === 'single') kids.push(singleSection());
    else kids.push(itemSection(false, revealed));
    if (revealed) kids.push(spread(st === 'traffic'), matSection());
    else kids.push(h('p', { class: 'round-tip' }, 'Waiting for ', h('b', null, 'Dana'), ' and ', h('b', null, 'Emil'), ' …'));
    kids.push(h('div', { class: 'grow' }));
    const dock = h('div', { class: 'dock' },
        h('div', { class: 'timer' }, h('span', null, revealed ? '04:37' : '03:12'), h('span', { class: 'acts' }, icon('play'), icon('reset'))));
    if (revealed && st !== 'single' && OPEN.length > 1) {
        const next = h('button', { class: 'btn next', type: 'button' }, 'Next item', icon('next'));
        next.onclick = () => toast(st === 'traffic' ? '“' + OPEN[0].h + '” is done (spread kept). Next: ' + OPEN[1].h
            : '“' + OPEN[0].h + '” is done with ' + S.est + '. Next: ' + OPEN[1].h);
        dock.append(h('div', { class: 'two' }, h('button', { class: 'btn primary', type: 'button' }, 'New round'), next),
            h('p', { class: 'next-note' }, (st === 'traffic' ? 'keeps the spread' : 'keeps ' + S.est) + ' · ' + (OPEN.length - 1) + ' waiting'));
    } else dock.append(h('button', { class: 'btn primary wide', type: 'button' }, revealed ? 'New round' : 'Cancel round'));
    kids.push(dock);
    side.replaceChildren(...kids);
}

/* ---------------------------------------------------------------- topics menu */
function toast(text, undo) {
    const t = $('#toast'); t.replaceChildren(h('span', null, text));
    if (undo) { const u = h('button', { class: 'link', type: 'button' }, 'Undo'); u.onclick = () => { undo(); t.hidden = true; }; t.append(u); }
    t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 4000);
}
function panelSingle() {
    const ta = h('textarea', { class: 'field', id: 'topicTxt', rows: 7, maxlength: 1800,
        placeholder: 'A short description of what you are talking about (e.g. the story you are estimating)' }, single);
    const add = h('button', { class: 'link add-next', type: 'button' }, icon('plus'), 'next item');
    add.onclick = () => { S.state = 'list'; render(); };
    return [h('label', { class: 'lab', for: 'topicTxt' }, 'What are you estimating? (optional, Markdown works)'), ta,
        h('div', { class: 'row spread' }, add,
            h('span', { class: 'row' }, h('button', { class: 'btn', type: 'button' }, 'Undo'), h('button', { class: 'btn primary', type: 'button', style: 'font-size:14px;min-height:40px' }, 'Save')))];
}
function editor(it) {
    return h('li', { class: 'it editing' },
        h('div', { class: 'ed-grid' },
            h('span', null, h('label', { class: 'lab', for: 'edId' }, 'ID (optional)'), h('input', { class: 'field', id: 'edId', value: it.id, placeholder: 'e.g. PAY-150' })),
            h('span', null, h('label', { class: 'lab', for: 'edH' }, 'Heading'), h('input', { class: 'field', id: 'edH', value: it.h }))),
        h('span', null, h('label', { class: 'lab', for: 'edD' }, 'Description (optional, Markdown works)'), h('textarea', { class: 'field', id: 'edD', rows: 3 }, it.d)),
        h('div', { class: 'row spread' }, h('span', { class: 'row', style: 'font-size:13px' }, h('span', { class: 'muted' }, 'maturity'), mat(it)),
            h('span', { class: 'row' }, (() => { const b = h('button', { class: 'btn', type: 'button' }, 'Cancel'); b.onclick = () => { S.edit = '0'; render(); }; return b; })(),
                (() => { const b = h('button', { class: 'btn primary', type: 'button', style: 'font-size:14px;min-height:40px' }, 'Save'); b.onclick = () => { S.edit = '0'; render(); }; return b; })())));
}
function itemRow(it, i) {
    if (S.edit === '1' && i === 1) return editor(it);
    const move = (d) => () => { const j = i + d; if (j < 0 || j >= OPEN.length) return; [OPEN[i], OPEN[j]] = [OPEN[j], OPEN[i]]; render(); };
    const del = () => { const gone = OPEN.splice(i, 1)[0]; render(); toast('Deleted “' + gone.h + '”.', () => { OPEN.splice(i, 0, gone); render(); }); };
    const edit = () => { if (i !== 1) { const x = OPEN.splice(i, 1)[0]; OPEN.splice(1, 0, x); } S.edit = '1'; render(); };
    return h('li', { class: 'it' + (i === 0 ? ' now' : '') + (i === 1 && S.edit !== '1' ? ' hover' : '') },
        h('span', { class: 'grip', title: 'Drag to reorder', 'aria-hidden': 'true' }, icon('grip')),
        h('span', { class: 'main' },
            h('span', { class: 'l1' }, i === 0 ? h('span', { class: 'tag' }, 'now') : null, it.id ? h('span', null, it.id) : null, mat(it, { ro: true })),
            h('span', { class: 'h' }, it.h)),
        h('span', { class: 'acts' },
            h('span', { class: 'move' }, iconBtn('up', 'Move up', move(-1)), iconBtn('down', 'Move down', move(1))),
            iconBtn('pen', 'Edit', edit), iconBtn('trash', 'Delete', del)));
}
function doneRow(d, i) {
    const res = d.res ? h('span', { class: 'res', title: 'Estimate' }, d.res)
        : h('span', { class: 'res dist', title: 'Spread (no single value for this deck)' }, TRAFFIC.map(([k]) => h('span', null, h('i', { class: 'dot', style: '--c:' + COLOR[k] }), d.dist[k])));
    const re = h('button', { class: 'link', type: 'button', title: 'Back to the open items' }, icon('reopen'), 'reopen');
    re.onclick = () => { const x = DONE.splice(i, 1)[0]; OPEN.push({ id: x.id, h: x.h, d: '', mat: x.mat }); render(); toast('“' + x.h + '” is open again (at the end of the list).'); };
    return h('li', null, h('span', { class: 'h' }, d.id ? d.id + ' ' : '', h('b', null, d.h)),
        h('span', { class: 'l2' }, h('span', { class: 'muted' }, d.res ? 'estimate' : 'spread'), res, mat(d, { ro: true }), h('span', { class: 'grow' }), re));
}
function panelList() {
    const add = h('button', { class: 'add-item', type: 'button' }, icon('plus'), 'Add item');
    add.onclick = () => { OPEN.push({ id: '', h: 'New item', d: '', mat: 0 }); render(); };
    return [h('div', { class: 'row spread' }, h('h3', { class: 'sl' }, 'open · ' + OPEN.length), h('span', { class: 'p-note' }, 'top item = the one you talk about now')),
        h('ol', { class: 'items' }, OPEN.map(itemRow)), add,
        h('div', { class: 'done-head' }, h('h3', { class: 'sl' }, 'done · ' + DONE.length)),
        h('ul', { class: 'done-list' }, DONE.map(doneRow)),
        h('p', { class: 'p-note', style: 'margin-top:6px' }, 'Done items keep the spread of their last round. Reopen one to talk about it again.')];
}
function renderPanel() {
    const p = $('#panel'), open = S.menu === '1' && (S.state === 'single' || S.state === 'list');
    p.hidden = !open; $('#scrim').hidden = !open;
    $('#navTopics').classList.toggle('on', open);
    if (!open) return;
    const close = iconBtn('x', 'Close', () => { S.menu = '0'; render(); });
    p.replaceChildren(h('header', { class: 'p-head' }, icon('list'), h('h2', { id: 'pTitle' }, 'Topics'), close),
        h('div', { class: 'p-body' }, S.state === 'single' ? panelSingle() : panelList()));
}

function render() {
    if (S.est === null) S.est = '8'; // highest card laid
    document.body.classList.toggle('light-theme', S.mode === 'light');
    document.body.classList.toggle('clean', S.clean);
    $('#brand').src = '../../src/' + (S.mode === 'light' ? 'brand_light.svg' : 'brand_dark.svg');
    renderTable(); renderSide(); renderPanel();
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
    const k = b.closest('[data-m]').dataset.m; S[k] = b.dataset.val;
    if (k === 'state') S.menu = (S.state === 'single' || S.state === 'list') ? '1' : '0';
    if (k === 'state' && S.state === 'single') { OPEN = OPEN0.map(o => ({ ...o })); DONE = DONE0.map(o => ({ ...o })); }
    render();
});
$('#btnMode').onclick = () => { S.mode = S.mode === 'dark' ? 'light' : 'dark'; render(); };
$('#navTopics').onclick = $('#btnMenu').onclick = () => {
    S.menu = S.menu === '1' && !$('#panel').hidden ? '0' : '1';
    if (S.menu === '1' && S.state !== 'single') S.state = 'list';
    render();
};
$('#scrim').onclick = () => { S.menu = '0'; render(); };
document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'm' || e.key === 'M') toggleMock();
    if (e.key === 'Escape') toggleMock(false);
});
$('#mpLink').onclick = e => {
    e.preventDefault();
    const q = new URLSearchParams();
    ['state', 'menu', 'edit', 'hint', 'mode'].forEach(k => q.set(k, S[k]));
    history.replaceState(null, '', '?' + q.toString());
    toast('URL updated – copy it from the address bar');
};
const q = new URLSearchParams(location.search);
for (const k of ['state', 'menu', 'edit', 'hint', 'mode']) if (q.get(k)) S[k] = q.get(k);
if (!q.get('menu')) S.menu = (S.state === 'single' || S.state === 'list') ? '1' : '0';
S.clean = q.get('clean') === '1';
render();
if (q.get('mock')) toggleMock(true);
