/* Session planner mockup (B-129 / B-52). Static, throw-away: no API calls, no analytics.
   Example data only. All texts go through textContent (h()). Mockup states: handle on the left edge or key M.
   Deep links: ?state=plan|maturity|meeting|results|history &mat=a|b &pace=ontime|behind &hist=a|b &mode=light &clean=1 */
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
const STAGES = ['new', 'rough', 'shaping', 'ready'];
const STAGE_TEXT = [
    'We do not know it yet and need to have a look.',
    'We have a rough idea and can start asking the right questions.',
    'The direction gets clearer, but everything can still change.',
    'Final polish – we could start building.'
];
const SESSION = { day: 'Thu, 13 Nov', min: 60 };
const ITEMS = [
    { id: 'PAY-142', h: 'Pay by invoice for B2B customers', d: 'Business customers pay by invoice; credit check via the risk service.', min: 20, mat: 2 },
    { id: 'PAY-150', h: 'Export orders as CSV', d: 'New – just introduce it and collect first questions.', min: 5, mat: 0 },
    { id: '', h: 'Spike: replace the PDF library', d: 'What would it take? Time-boxed look.', min: 10, mat: 1 },
    { id: 'PAY-133', h: 'Rate limit for the public API', d: '', min: 15, mat: 2 },
    { id: 'PAY-151', h: 'Saved carts across devices', d: 'Idea from the customer survey.', min: 5, mat: 0 }
];
const DECK = ['0', '½', '1', '2', '3', '5', '8', '13', '20', '40', '100', '∞', '☕', '?'];
const SYM = { '3': 's-3', '5': 's-5', '8': 's-8', '13': 's-13' };
const COLOR = { '3': 'var(--c-orange)', '5': 'var(--c-violet)', '8': 'var(--c-blue)', '13': 'var(--c-yellow)' };
const PLAYERS = ['Ann', 'Ben', 'Chris', 'Dana', 'Emil', 'Fatma'];
const VOTES = ['3', '8', '5', '5', '8', '5'];
/* B-52 passes of PAY-142: the spread as counts per deck value, maturity set after the pass */
const PASSES = [
    { day: '23 Oct', c: { '1': 1, '3': 1, '8': 1, '13': 1, '20': 2 }, range: '1–20', rounds: 1, mat: 1 },
    { day: '30 Oct', c: { '3': 1, '5': 2, '8': 2, '13': 1 }, range: '3–13', rounds: 2, mat: 2 },
    { day: '6 Nov', c: { '5': 3, '8': 3 }, range: '5–8', rounds: 2, mat: 2 }
];
const NOTES = ['Who owns the risk service? Fatma asks the risk team.', 'Reuse the invoice job for the PDF, no new library.',
    'Open: payment terms per customer or per contract?'];
const DONE = [['PAY-142', 'Pay by invoice for B2B customers', '8']];

const S = { state: 'plan', mat: 'a', pace: 'ontime', hist: 'b', mode: 'dark', proposal: '8', clean: false };

/* ---------------------------------------------------------------- maturity control (B-129) */
/* (a) lying triangle: wide left (many open questions), point right (ready); the knob wanders right.
   (b) standing triangle: wide at the bottom, point on top; the knob wanders up.
   A real <input type=range> (0–3) lies invisibly on top, so it works with mouse, touch and keys. */
function matSvg(level, v, W, H) {
    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    const pos = i => (i + 0.5) / 4;
    if (v === 'a') {
        const half = x => H / 2 * (1 - x / W), x = pos(level) * W;
        svg.append(s('polygon', { class: 'done', points: `0,0 ${x},${H / 2 - half(x)} ${x},${H / 2 + half(x)} 0,${H}` }));
        for (let i = 0; i < 4; i++) { const t = pos(i) * W; svg.append(s('line', { class: 'tick', x1: t, x2: t, y1: H / 2 - half(t), y2: H / 2 + half(t) })); }
        svg.append(s('polygon', { class: 'tri', points: `0,0 ${W},${H / 2} 0,${H}` }));
        svg.append(s('line', { class: 'knobline', x1: x, x2: x, y1: -2, y2: H + 2 }));
        svg.append(s('circle', { class: 'knob', cx: x, cy: -2, r: H > 30 ? 6 : 3.2 }));
    } else {
        const half = y => W / 2 * (y / H), y = H - pos(level) * H;
        svg.append(s('polygon', { class: 'done', points: `0,${H} ${W},${H} ${W / 2 + half(y)},${y} ${W / 2 - half(y)},${y}` }));
        for (let i = 0; i < 4; i++) { const t = H - pos(i) * H; svg.append(s('line', { class: 'tick', y1: t, y2: t, x1: W / 2 - half(t), x2: W / 2 + half(t) })); }
        svg.append(s('polygon', { class: 'tri', points: `${W / 2},0 ${W},${H} 0,${H}` }));
        svg.append(s('line', { class: 'knobline', y1: y, y2: y, x1: -2, x2: W + 2 }));
        svg.append(s('circle', { class: 'knob', cy: y, cx: W + 2, r: W > 30 ? 6 : 3.2 }));
    }
    return svg;
}
function mat(item, v, big) {
    v = v || S.mat;
    const [W, H] = v === 'a' ? (big ? [240, 64] : [46, 14]) : (big ? [80, 150] : [16, 26]);
    const wrap = h('span', { class: 'mat ' + (v === 'b' ? 'v' : 'h') + (big ? ' big' : '') });
    const input = h('input', { type: 'range', min: 0, max: 3, step: 1, value: item.mat, 'aria-label': 'Maturity',
        'aria-valuetext': STAGES[item.mat] });
    const lbl = h('span', { class: 'lbl' }, STAGES[item.mat]);
    const box = h('span', { style: 'position:relative;display:inline-block' }, input, matSvg(item.mat, v, W, H));
    input.addEventListener('input', () => {
        item.mat = +input.value; box.lastChild.replaceWith(matSvg(item.mat, v, W, H));
        lbl.textContent = STAGES[item.mat]; input.setAttribute('aria-valuetext', STAGES[item.mat]);
        $$('.mat-sync').forEach(n => n.dispatchEvent(new Event('sync')));
    });
    wrap.append(box, lbl);
    return wrap;
}

/* ---------------------------------------------------------------- pieces */
const total = () => ITEMS.reduce((a, i) => a + i.min, 0);
const PACE = {
    ontime: { used: '03:12', left: '01:48 left', frac: 0.64, over: false, sess: 'on time', clock: 23.2 },
    behind: { used: '07:10', left: '+02:10 over timebox', frac: 1, over: true, sess: '6 min behind plan', clock: 32.2 }
};
function face(key, name, me) {
    let card;
    if (key === null) card = h('div', { class: 'face empty' });
    else if (key === 'back') card = h('div', { class: 'face back' });
    else card = h('div', { class: 'face', style: '--c:' + COLOR[key] },
        s('svg', { viewBox: '0 0 100 120', 'aria-label': key }, s('use', { href: '../../src/cards.svg?v=11#' + SYM[key] })));
    return h('div', { class: 'pc' }, h('span', { class: 'nm' + (me ? ' me' : '') }, name), card);
}
function itemCard(item, opts) {
    const p = PACE[S.pace], o = opts || {};
    const meta = h('div', { class: 'meta' },
        h('span', { class: 'left' }, item.id ? h('span', null, item.id) : null, h('span', null, o.pos || ''), mat(item)),
        h('span', null, item.min + ' min timebox'));
    const card = h('article', { class: 'item-card', 'aria-label': 'Active item' }, meta, h('h1', null, item.h));
    if (o.desc && item.d) card.append(h('p', { class: 'desc' }, item.d));
    if (o.timer) {
        card.append(h('div', { class: 'tbar' + (p.over ? ' over' : '') }, h('i', { style: 'width:' + p.frac * 100 + '%' })),
            h('div', { class: 'tline' }, h('span', { class: 'muted' }, p.used + ' of ' + item.min + ':00'),
                h('span', { class: 'left' + (p.over ? ' warn over-dot' : '') }, p.left)));
    } else if (o.planned) {
        card.append(h('div', { class: 'tbar' }, h('i', { style: 'width:0' })),
            h('div', { class: 'tline' }, h('span', { class: 'muted' }, 'not started'), h('span', { class: 'muted' }, o.planned)));
    }
    if (o.results) card.append(resultRow(item));
    const next = o.next || [];
    const stack = h('div', { class: 'item-stack' }, card);
    if (next[0]) stack.append(h('div', { class: 'peek p1' }, h('span', { class: 'k' }, 'next'), (next[0].id ? next[0].id + ' ' : '') + next[0].h));
    if (next[1]) stack.append(h('div', { class: 'peek p2' }, h('span', { class: 'k' }, '+' + (next.length - 1) + ' more'), ''));
    return stack;
}
function resultRow(item) {
    const prop = h('b', null, S.proposal);
    const chips = h('div', { class: 'chips' }, 'take', ['3', '5', '8', '13', '?'].map(v => {
        const c = h('button', { class: 'chip', 'aria-pressed': String(v === S.proposal) }, v);
        c.onclick = () => { S.proposal = v; render(); };
        return c;
    }));
    const next = h('button', { class: 'btn' }, h('span', null, 'Next item ', icon('next')), h('small', null, 'keep ' + S.proposal + ', go on'));
    const back = h('button', { class: 'btn' }, h('span', null, 'Bring back ', icon('back')), h('small', null, 'talk again next session'));
    next.onclick = () => toast('Next item: result ' + S.proposal + ' kept, "' + item.h + '" goes to Done.');
    back.onclick = () => toast('Brought back: "' + item.h + '" goes onto the next agenda with its notes and maturity.');
    return h('div', null,
        h('div', { class: 'result-row' },
            h('div', { class: 'proposal', title: 'Proposed result' }, prop, h('small', null, 'proposed')),
            h('div', { class: 'res-right' },
                h('div', { class: 'chips' }, h('span', { class: 'sl' }, 'proposal'), 'highest card · spread 3–8 · 2 rounds'),
                chips,
                h('div', { class: 'chips' }, h('span', { class: 'sl' }, 'maturity now'), mat(item)))),
        h('div', { class: 'choice' }, back, next));
}
function bars(counts, cls) {
    const max = Math.max(1, ...Object.values(counts));
    const top = Object.keys(counts).filter(k => counts[k] === max);
    return h('div', { class: cls || 'bars' }, DECK.map(v => {
        const n = counts[v] || 0;
        const i = h('i', { class: n ? (top.includes(v) && cls !== 'mini' ? 'top' : '') : 'zero', style: 'height:' + (n ? n / max * 100 : 2) + '%' });
        return cls ? i : h('span', { class: 'col' }, h('span', null, n || ''), h('span', { style: 'height:44px;display:flex;align-items:flex-end;width:100%;justify-content:center' }, i), v);
    }));
}
function sessionBar(activeIdx) {
    const p = PACE[S.pace];
    const bar = h('div', { class: 'sess', 'aria-hidden': 'true' }, ITEMS.map((it, i) =>
        h('i', { class: i < activeIdx ? 'done' : i === activeIdx ? 'now' + (p.over ? ' over' : '') : '', style: 'flex:' + it.min })),
        h('i', { class: 'free', style: 'flex:' + (SESSION.min - total()) }));
    if (activeIdx >= 0) bar.append(h('span', { class: 'clock', style: 'left:' + (p.clock / SESSION.min * 100) + '%' }));
    return bar;
}
function agendaStatus(activeIdx) {
    const p = PACE[S.pace], left = ITEMS.length - activeIdx - 1;
    const line = activeIdx < 0
        ? h('div', { class: 'line muted' }, h('b', null, SESSION.day), ' · ' + ITEMS.length + ' items · ' + total() + ' of ' + SESSION.min + ' min planned')
        : h('div', { class: 'line muted' }, h('b', { class: p.over ? 'warn' : '' }, p.sess), ' · ' + left + ' items left · ends 10:00');
    return h('section', { class: 'agenda-status', 'aria-label': 'Agenda' }, h('h2', { class: 'sl' }, 'agenda'), line, sessionBar(activeIdx));
}
function toast(text, pre) {
    const t = $('#toast'); t.replaceChildren(h('div', null, text), pre ? h('pre', null, pre) : '');
    t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, pre ? 9000 : 3500);
}
function agendaText() {
    return 'Agenda ' + SESSION.day + ' · ' + SESSION.min + ' min (' + total() + ' planned)\n' +
        ITEMS.map((it, i) => (i + 1) + '. ' + (it.id ? it.id + ' ' : '') + it.h + ' · ' + it.min + ' min · ' + STAGES[it.mat]).join('\n') +
        '\nBoard: https://poker.komplexitaeter.de/?t=…';
}
function resultsText() {
    return 'ID\tHeading\tResult\tMaturity\n' + DONE.map(d => d.join('\t') + '\tshaping').join('\n') +
        '\nPAY-150\tExport orders as CSV\t' + S.proposal + '\trough';
}

/* ---------------------------------------------------------------- topics panel with the timeline */
function block(it, i, opts) {
    const o = opts || {};
    const row = h('div', { class: 'row1' }, it.id ? h('span', { class: 'id' }, it.id) : null, h('span', { class: 'h' }, it.h),
        mat(it), h('span', { class: 't' }, it.min + ' min'));
    const inner = h('div', { class: 'in' }, row);
    if (it.d && it.min >= 10 && !o.open) inner.append(h('div', { class: 'd' }, it.d));
    if (o.open) inner.append(o.open);
    const b = h('div', { class: 'blk' + (o.drag ? ' drag' : '') + (o.open ? ' open' : ''), style: '--min:' + it.min },
        inner, h('span', { class: 'grip', title: 'Drag to change the timebox', 'aria-hidden': 'true' }));
    if (o.drag) b.append(h('span', { class: 'hint' }, 'drag ↕ ' + it.min + ' min'));
    b.querySelector('.h').onclick = () => { S.openIdx = S.openIdx === i ? -1 : i; render(); };
    return b;
}
function historyOpen(it) {
    const notes = h('div', null, h('span', { class: 'k' }, 'notes'), h('ul', { class: 'notes' }, NOTES.map(n => h('li', null, n))));
    if (S.hist === 'a') {
        const last = PASSES[PASSES.length - 1];
        return h('div', { class: 'hist' },
            h('div', { class: 'laststate' }, h('span', null, h('span', { class: 'k' }, 'maturity '), mat(it)),
                h('span', null, h('span', { class: 'k' }, 'last time '), h('b', null, last.day + ' · spread ' + last.range + ' · ' + last.rounds + ' rounds'))),
            h('div', { class: 'd', style: '-webkit-line-clamp:3' }, it.d), notes);
    }
    const grid = h('div', { class: 'passes' }, h('span', { class: 'hd' }, 'session'), h('span', { class: 'hd' }, 'spread'),
        h('span', { class: 'hd' }, ''), h('span', { class: 'hd' }, 'maturity after'));
    PASSES.forEach(p => grid.append(h('span', null, p.day), bars(p.c, 'mini'), h('span', null, p.range),
        mat({ mat: p.mat }, S.mat === 'b' ? 'b' : 'a')));
    grid.append(h('span', { class: 'now' }, '13 Nov'), h('span', { class: 'muted' }, 'today'), h('span', { class: 'muted' }, '·'), h('span', { class: 'muted' }, it.min + ' min planned'));
    return h('div', { class: 'hist' }, h('div', { class: 'd', style: '-webkit-line-clamp:3' }, it.d), grid, notes);
}
function renderPanel() {
    const p = $('#panel');
    if (S.state !== 'plan' && S.state !== 'history') { p.hidden = true; return; }
    p.hidden = false;
    const sum = total(), over = sum > SESSION.min;
    const ticks = h('div', { class: 'ruler', 'aria-hidden': 'true' });
    for (let m = 0; m <= SESSION.min; m += 10) ticks.append(h('span', { style: 'top:calc(' + m + ' * var(--ppm))' }, m));
    const blocks = h('div', { class: 'blocks' }, ITEMS.map((it, i) =>
        block(it, i, { drag: S.state === 'plan' && i === 0, open: S.state === 'history' && i === S.openIdx ? historyOpen(it) : null })));
    if (!over) blocks.append(h('div', { class: 'blk free', style: '--min:' + (SESSION.min - sum) }, h('div', { class: 'in' }, (SESSION.min - sum) + ' min free')));
    const copy = h('button', { class: 'btn' }, icon('copy'), 'Copy agenda');
    copy.onclick = () => toast('Agenda copied – paste it into the invite or chat:', agendaText());
    const add = h('button', { class: 'btn' }, icon('plus'), 'Item');
    const close = h('button', { class: 'x', 'aria-label': 'Close' }, icon('x'));
    close.onclick = () => { S.state = 'meeting'; render(); };
    p.replaceChildren(
        h('header', { class: 'p-head' }, icon('list'), h('h2', { id: 'pTitle' }, 'Topics'), close),
        h('div', { class: 'p-body' },
            h('div', { class: 'tabs' }, h('span', { class: 'on' }, 'Agenda ' + SESSION.day.slice(5)), h('span', null, 'Later (4)'), h('span', null, 'Done (12)')),
            h('div', { class: 'sess-head' }, h('span', { class: 'sl' }, 'session'), h('span', { class: 'box' }, SESSION.day + ' 09:00'),
                h('span', { class: 'muted' }, 'timebox'), h('span', { class: 'box' }, SESSION.min + ' min')),
            h('div', { class: 'fit' + (over ? ' over' : '') }, h('span', null, h('b', null, sum + ' of ' + SESSION.min + ' min planned')),
                h('span', { class: 'muted' }, ITEMS.length + ' items')),
            h('div', { class: 'tl' + (S.state === 'history' ? ' has-open' : '') }, ticks, blocks)),
        h('footer', { class: 'p-foot' }, add, copy));
}

/* ---------------------------------------------------------------- table + sidebar per state */
function renderMaturitySheet() {
    const it = ITEMS[0];
    const cell = (v, title, note) => h('div', { class: 'cell' }, h('h2', null, title),
        h('div', { class: 'stage' }, mat(it, v, true)), h('p', { class: 'note' }, note),
        h('div', { class: 'sample' }, h('span', { class: 'sl' }, 'on an item card'),
            h('div', { class: 'blocks', style: 'border:0;padding:0' }, block(ITEMS[1], 1, {}), block(it, 0, {}))));
    // samples use the variant of their cell
    const keep = S.mat;
    S.mat = 'a'; const a = cell('a', '(a) lying triangle ▷', 'Wide left: many open questions, everything is possible. The point right: clear, ready. The knob moves right.');
    S.mat = 'b'; const b = cell('b', '(b) standing triangle △', 'Wide at the bottom, the point on top. The knob moves up – "grows" like a pile.');
    S.mat = keep;
    return h('div', { class: 'sheet' }, a, b,
        h('ul', { class: 'legend' }, STAGES.map((n, i) => h('li', null, h('b', null, n), STAGE_TEXT[i]))));
}
function renderSide(active) {
    const side = $('#sidebar'), p = PACE[S.pace];
    const kids = [];
    const status = { plan: 'waiting for the session', maturity: 'waiting', meeting: 'voting  4 of 6', results: 'revealed', history: 'waiting for the session' }[S.state];
    kids.push(h('p', { class: 'sl' }, h('span', { style: 'color:var(--text)' }, status)));
    kids.push(agendaStatus(S.state === 'meeting' || S.state === 'results' ? active : -1));
    if (S.state === 'results') {
        const c = {}; VOTES.forEach(v => { c[v] = (c[v] || 0) + 1; });
        kids.push(h('section', null, h('div', { class: 'spread-head' }, h('span', { class: 'sl' }, 'result'), 'range 3–8'), bars(c)),
            h('p', { class: 'tip' }, 'Let them explain: ', h('b', null, 'Ann (3)'), ' and ', h('b', null, 'Ben (8)')));
        const copy = h('button', { class: 'btn sm' }, icon('copy'), 'Copy results');
        copy.onclick = () => toast('Results copied (tab-separated – paste into Jira, Linear or a sheet):', resultsText());
        kids.push(h('section', null, h('div', { class: 'spread-head', style: 'justify-content:space-between;align-items:center' }, h('span', { class: 'sl' }, 'done today'), copy),
            h('ul', { class: 'done-list', style: 'margin-top:8px' }, DONE.map(d => h('li', null, h('span', { class: 'muted' }, d[0]), h('span', { class: 'h' }, d[1]), h('span', { class: 'r' }, d[2]))))));
    } else if (S.state === 'meeting') {
        kids.push(h('p', { class: 'tip' }, 'Waiting for ', h('b', null, 'Dana'), ' and ', h('b', null, 'Emil'), ' …'));
    }
    kids.push(h('div', { class: 'grow' }));
    const running = S.state === 'meeting' || S.state === 'results';
    kids.push(h('div', { class: 'dock' },
        h('div', { class: 'timer' + (running && p.over ? ' over' : '') }, h('span', null, running ? (p.over ? '● T+02:10' : 'T−01:48') : 'T−20:00'),
            h('span', { style: 'display:flex;gap:10px', class: 'muted' }, icon('play'), icon('reset'))),
        h('button', { class: 'btn primary wide' }, S.state === 'meeting' ? 'Cancel round' : 'New round')));
    side.replaceChildren(...kids);
}
function render() {
    document.body.classList.toggle('light-theme', S.mode === 'light');
    document.body.classList.toggle('clean', S.clean);
    $('#brand').src = '../../src/' + (S.mode === 'light' ? 'brand_light.svg' : 'brand_dark.svg');
    $('#navTopics').classList.toggle('on', S.state === 'plan' || S.state === 'history');
    const table = $('#table');
    const active = 1;
    if (S.state === 'maturity') table.replaceChildren(renderMaturitySheet());
    else if (S.state === 'plan' || S.state === 'history') {
        table.replaceChildren(itemCard(ITEMS[0], { pos: '1 of 5', desc: true, planned: 'planned 09:00–09:20', next: ITEMS.slice(1) }),
            h('div', { class: 'cards' }, PLAYERS.slice(0, 4).map((n, i) => face(null, n, i === 0))),
            h('p', { class: 'muted', style: 'font-size:13px;margin-top:24px' }, 'Everyone with the team link sees this agenda before the session.'));
    } else if (S.state === 'meeting') {
        table.replaceChildren(itemCard(ITEMS[active], { pos: '2 of 5', desc: true, timer: true, next: ITEMS.slice(active + 1) }),
            h('div', { class: 'cards' }, PLAYERS.map((n, i) => face(i === 3 || i === 4 ? null : 'back', n, i === 0))));
    } else {
        table.replaceChildren(itemCard(ITEMS[active], { pos: '2 of 5', timer: true, results: true, next: ITEMS.slice(active + 1) }),
            h('div', { class: 'cards' }, PLAYERS.map((n, i) => face(VOTES[i], n, i === 0))));
    }
    renderSide(active);
    renderPanel();
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
    S[b.closest('[data-m]').dataset.m] = b.dataset.val; render();
});
$('#btnMode').onclick = () => { S.mode = S.mode === 'dark' ? 'light' : 'dark'; render(); };
$('#navTopics').onclick = () => { S.state = S.state === 'plan' ? 'meeting' : 'plan'; render(); };
document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea')) return;
    if (e.key === 'm' || e.key === 'M') toggleMock();
    if (e.key === 'Escape') toggleMock(false);
});
$('#mpLink').onclick = e => {
    e.preventDefault();
    const q = new URLSearchParams();
    ['state', 'mat', 'pace', 'hist', 'mode'].forEach(k => q.set(k, S[k]));
    history.replaceState(null, '', '?' + q.toString());
    toast('URL updated – copy it from the address bar');
};
const q = new URLSearchParams(location.search);
for (const k of ['state', 'mat', 'pace', 'hist', 'mode']) if (q.get(k)) S[k] = q.get(k);
S.clean = q.get('clean') === '1';
S.openIdx = 0;
render();
if (q.get('mock')) toggleMock(true);
