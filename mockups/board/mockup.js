/* Throw-away mockup logic (Sprint 8, B-51, round 3). Static: no API calls, no analytics.
   Reads only ../../cards.json and images from ../../src/. All names/topics are rendered via textContent.
   Deep links: see ../index.html. Mockup states: handle on the left edge or key M (also ` / ^). */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const app = $('#app'), stage = $('#stage'), device = $('#device');
const SRC = '../../src/';

/* ---------------------------------------------------------------- data */
const NAMES = ['Ann', 'Ben', 'Chris', 'Dana', 'Emil', 'Fatma', 'Gero', 'Maximiliane-Sophie', 'Ilias', 'Jule', 'Kemal',
    'Lena', 'Mo', 'Nora', 'Oskar', 'Paula', 'Quirin', 'Rosa', 'Sven', 'Tara', 'Ulla'];
/* vote pattern per scenario: offset from the middle card of the scale, or a fixed card key */
const PATTERN = {
    consensus: [0],
    close: [0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1],
    spread: [0, 1, -2, 0, 3, 1, 0, 1, 0, -2, 1, 0, 0, 3, 1, 0, 1, 0, 0, 1, 0],
    mixed: [0, 1, 0, 'qstmrk1', 1, 'break01', 0, 1, 0, 0, 1, 0, 'qstmrk1', 0, 1, 0, 0, 1, 0, 0, 1]
};
const TOPIC_SHORT = 'PAY-142 Checkout: pay by invoice for B2B customers';
const TOPIC_LONG = TOPIC_SHORT + '\n\n' +
    'As a business customer I want to pay by invoice so that our accounting can process purchases in bulk.\n\n' +
    'Acceptance criteria:\n- Invoice option only for verified B2B accounts\n- Credit limit check via the risk service (timeout 3 s, fallback: decline)\n' +
    '- PDF invoice by email, also downloadable in the account area\n- Payment terms 14 or 30 days, configurable per customer\n\n' +
    'Out of scope: dunning process, partial payments, foreign currencies.';
const HISTORY = [
    { day: 'Tue, 21 Oct', items: [['PAY-120 Login via company SSO', '8', 2], ['PAY-121 Address book for shipping', '5', 1],
        ['PAY-124 Rate limit for the public API', '13', 3], ['PAY-125 Remove legacy coupon codes', '2', 1], ['Spike: invoice PDF library', '?', 1]] },
    { day: 'Tue, 14 Oct', items: [['PAY-101 Card payment via new PSP', '20', 2], ['PAY-104 Retry failed webhooks', '5', 1],
        ['PAY-107 Currency field in orders', '3', 1]] }
];

/* PROPOSAL for a new optional field "symbol" in cards.json (fallback: description).
   Short, one glyph or a few letters, so it fits a chart axis, a status line and a chip. */
const SYMBOL = {
    '1pnt501': '½', infin01: '∞',
    green01: '🟢', yellow1: '🟡', red0001: '🔴',
    satis01: '🙂', annoy01: '😒', sad0001: '😢', unint01: '😐', angry01: '😡', enthu01: '🤩',
    break01: '☕\uFE0F', qstmrk1: '?', xclam01: '!', veto: '✋',
    xxs0001: 'XXS', xs00001: 'XS', s000001: 'S', m000001: 'M', l000001: 'L', xl00001: 'XL', xxl0001: 'XXL',
    '0star01': '0★', '1star01': '1★', '2stars1': '2★', '3stars1': '3★', '4stars1': '4★', '5stars1': '5★'
};
const DECK_SLUG = { fibonacci: 1, 'fibonacci-short': 2, 'true-fibonacci': 9, traffic: 3, delegation: 4, judge: 5,
    emotions: 6, tshirt: 7, stars: 8, '0-10': 10 };

const S = {
    theme: 'console', mode: 'dark', device: 'fluid', n: 7, state: 'revealed', result: 'spread', topics: 'single', long: false,
    anon: '0', sort: 'value', pointer: '1', timer: true, role: 'player', presetId: 1, disabled: new Set(),
    myKey: null, noted: null, me: 'Ann', team: 'Team Phoenix Payments', removed: new Set(),
    tRun: false, tSec: 83, sec: null, list: [], settings: 'groups', clean: false
};
let CARDS = [], PRESETS = [];

/* ---------------------------------------------------------------- cards */
const img = key => SRC + 'c_' + key + '.png';
const byKey = key => CARDS.find(c => c.card_key === key);
const sym = c => c ? (SYMBOL[c.card_key] || c.description) : '';
const ordinal = c => c.numeric_value != null && !c.flow_control;      /* has a place on a scale */
const symOf = key => sym(byKey(key));
function deckCards(withDisabled) {
    if (!PRESETS.length) return [];
    const p = preset();
    return CARDS.filter(c => (p.index_list.includes(c.index) || c.flow_control) && (withDisabled || !S.disabled.has(c.card_key)));
}
const preset = () => PRESETS.find(x => x.id === S.presetId) || PRESETS[0];

/* ---------------------------------------------------------------- votes */
function scaleOf(deck) { const o = deck.filter(ordinal); return o.length ? o : deck.filter(c => !c.flow_control); }
function keyFor(offset, deck) {
    const sc = scaleOf(deck);
    if (!sc.length) return deck[0].card_key;
    if (typeof offset === 'string') return deck.some(c => c.card_key === offset) ? offset : sc[0].card_key;
    const c = Math.min(sc.length - 1, Math.floor(sc.length / 2));
    return sc[Math.max(0, Math.min(sc.length - 1, c + offset))].card_key;
}
function players() {
    const deck = deckCards(), list = [];
    if (!deck.length) return list;
    const pat = PATTERN[S.result];
    for (let i = 0; i < S.n; i++) {
        if (S.removed.has(i)) continue;
        const me = i === 0;
        if (me && S.role === 'observer') continue;
        let key = me && S.myKey ? S.myKey : keyFor(pat[i % pat.length], deck);
        if (!deck.some(c => c.card_key === key)) key = keyFor(pat[i % pat.length], deck);
        const done = S.state === 'revealed' || (me ? !!S.myKey : i % 3 !== 2);
        list.push({ i, me, name: me ? S.me : NAMES[i], key, done, away: i === 4 && S.state !== 'revealed' });
    }
    return list;
}

/* summary of one round. Works for scales (numbers, T-shirt, stars, traffic) and for nominal sets (emotions). */
function summarize(keys, deck) {
    const cnt = new Map(); keys.forEach(k => cnt.set(k, (cnt.get(k) || 0) + 1));
    const ord = deck.filter(ordinal), pos = k => ord.findIndex(c => c.card_key === k);
    const ek = keys.filter(k => pos(k) >= 0).sort((a, b) => pos(a) - pos(b));
    const axis = deck.filter(c => !c.flow_control).map(c => c.card_key);
    const onAxis = keys.filter(k => axis.includes(k));
    const other = keys.filter(k => pos(k) < 0 && !(!ord.length && axis.includes(k)));
    let verdict = null;
    if (ek.length) {
        const lo = pos(ek[0]), hi = pos(ek[ek.length - 1]);
        verdict = lo === hi ? 'consensus' : hi - lo <= 1 ? 'close' : 'spread';
    } else if (!ord.length && onAxis.length) {
        verdict = new Set(onAxis).size === 1 ? 'consensus' : 'mixed';
    }
    const cand = ek.length ? ek : onAxis, rank = k => ek.length ? pos(k) : axis.indexOf(k);
    let top = null, best = 0;
    cand.forEach(k => { const n = cnt.get(k); if (n > best || (n === best && rank(k) > rank(top))) { best = n; top = k; } });
    return { cnt, ek, other, verdict, lo: ek[0], hi: ek[ek.length - 1], top, max: Math.max(1, ...cnt.values()), nominal: !ord.length };
}

/* ---------------------------------------------------------------- topics (default: one free topic like today) */
function seedTopics() {
    const deck = deckCards();
    const r = (at, pat) => ({ at, keys: pat.map(o => keyFor(o, deck)) });
    const finalOf = rounds => summarize(rounds[rounds.length - 1].keys, deck).top;
    const mk = (text, status, rounds) => ({ text, status, rounds, final: status === 'done' ? finalOf(rounds) : null });
    if (S.topics === 'backlog') {
        S.list = [
            mk('PAY-138 Show invoice PDF in the account area', 'done', [r('09:41', [0, 0, -1, 0, 1, 0, 0])]),
            mk('PAY-140 Credit limit check via the risk service', 'done', [r('09:47', [0, 2, 3, 1, 2, -1, 2]), r('09:52', [2, 2, 1, 2, 2, 2, 1])]),
            mk(null, 'active', [r('09:58', [-1, 1, -2, 0, 3, 1, 0])]),
            mk('PAY-145 Dunning e-mails for overdue invoices', 'open', []),
            mk('PAY-147 Payment terms per customer (14 / 30 days)', 'open', []),
            mk('PAY-151 Invoice export for DATEV', 'open', [])
        ];
    } else {
        S.list = [mk(S.topics === 'none' ? '' : null, 'active', [r('09:58', [-1, 1, -2, 0, 3, 1, 0])])];
    }
}
const topicText = t => t.text != null ? t.text : (S.long ? TOPIC_LONG : TOPIC_SHORT);
const activeIdx = () => S.list.findIndex(t => t.status === 'active');
const active = () => S.list[activeIdx()];
const nextOpen = () => S.list.find(t => t.status === 'open');
const firstLine = t => topicText(t).split('\n')[0];
const isList = () => S.topics === 'backlog';

/* markdown-lite for the mockup (the app uses remarkable with html:false) */
function renderMd(target, text) {
    target.textContent = '';
    text.split('\n\n').forEach((block, k) => {
        const lines = block.split('\n');
        const head = lines.filter(l => !l.startsWith('- ')), items = lines.filter(l => l.startsWith('- '));
        if (head.length) {
            const p = el('p');
            if (k === 0) p.appendChild(el('strong', null, head.join(' '))); else p.textContent = head.join(' ');
            target.appendChild(p);
        }
        if (items.length) { const ul = el('ul'); items.forEach(l => ul.appendChild(el('li', null, l.slice(2)))); target.appendChild(ul); }
    });
}

/* ---------------------------------------------------------------- render: table */
function renderTable() {
    const t = $('#table'); t.textContent = '';
    const deck = deckCards();
    const ps = players();
    const sum = summarize(ps.map(p => p.key), deck);
    const order = k => { const c = byKey(k); return c ? c.sort_order : 1e9; };
    if (S.state === 'revealed') {
        if (S.sort === 'name' && S.anon === '0') ps.sort((a, b) => a.name.localeCompare(b.name));
        else ps.sort((a, b) => order(a.key) - order(b.key));
    }
    ps.forEach(p => {
        const c = el('div', 'card' + (p.me ? ' me' : '') + (p.away ? ' away' : ''));
        const shown = S.state === 'revealed' ? p.key : p.done ? 'done001' : (S.anon === '1' ? 'prgrss2' : 'prgrss1');
        const im = el('img'); im.src = img(shown); im.alt = ''; c.appendChild(im);
        c.appendChild(el('span', 'nm', S.state === 'revealed' && S.anon === '1' ? '' : p.name));
        if (S.state === 'revealed' && sum.verdict === 'spread' && (p.key === sum.lo || p.key === sum.hi)) {
            c.classList.add('outlier');
            c.appendChild(el('span', 'tag', p.key === sum.lo ? 'lowest' : 'highest'));
        }
        const card = byKey(p.key);
        c.setAttribute('role', 'img');
        c.setAttribute('aria-label', (S.anon === '1' && S.state === 'revealed' ? 'Card' : p.name) +
            (S.state === 'revealed' ? ': ' + (card ? card.description : '') : p.done ? ': voted' : ': thinking'));
        t.appendChild(c);
    });
    app.toggleAttribute('data-many', ps.length > 12);

    const voted = ps.filter(p => p.done).length;
    $('#progress').style.width = (ps.length ? voted / ps.length * 100 : 0) + '%';
    $('#rStatus').textContent = S.state === 'voting' ? voted + ' of ' + ps.length + ' voted' : '';
    $('#roundNo').textContent = (active() ? active().rounds.length : 0) + 1;
    app.toggleAttribute('data-someone', voted > 0);
    renderResult(sum, deck, ps);
    renderDeck(deck);
    renderCounts();
    renderStatusLine(voted, ps.length);
}

/* ---------------------------------------------------------------- render: result (separate from the deck) */
const VERDICT = { consensus: 'Consensus', close: 'Close', spread: 'Spread', mixed: 'Mixed' };
function renderResult(sum, deck, ps) {
    const v = $('#verdict'); v.textContent = '';
    if (sum.verdict) {
        v.appendChild(el('span', 'v ' + sum.verdict, VERDICT[sum.verdict]));
        let txt;
        if (sum.nominal) txt = sum.verdict === 'consensus' ? 'everyone: ' + symOf(sum.top) + ' ' + byKey(sum.top).description
            : 'most: ' + symOf(sum.top) + ' ' + byKey(sum.top).description;
        else txt = sum.verdict === 'consensus' ? 'everyone chose ' + symOf(sum.lo) : symOf(sum.lo) + ' – ' + symOf(sum.hi);
        v.appendChild(el('span', null, txt));
    } else {
        v.appendChild(el('span', 'v', 'No estimate'));
    }
    if (sum.other.length) v.appendChild(el('span', 'muted', '+ ' + sum.other.length + ' × ' + Array.from(new Set(sum.other.map(symOf))).join(' ')));

    if (S.noted && !sum.cnt.has(S.noted)) S.noted = null;
    const noted = S.noted || sum.top;
    const h = $('#histo'); h.textContent = ''; h.classList.toggle('nominal', sum.nominal);
    let prevAxis = true;
    deck.forEach(c => {
        const n = sum.cnt.get(c.card_key) || 0, onAxis = sum.nominal ? !c.flow_control : ordinal(c);
        const b = el('button', 'hcol' + (n === 0 ? ' zero' : '') + (c.card_key === sum.top && n > 0 ? ' top' : '') +
            (c.card_key === noted && S.noted ? ' sel' : '') + (!onAxis && prevAxis ? ' sep' : '') + (/\p{Extended_Pictographic}/u.test(sym(c)) ? ' emo' : ''));
        prevAxis = onAxis;
        b.dataset.key = c.card_key;
        b.style.setProperty('--p', (n / sum.max).toFixed(3));
        b.appendChild(el('span', 'cnt', n ? String(n) : ''));
        b.appendChild(el('span', 'bar'));
        const lb = el('span', 'lb'); lb.style.backgroundImage = 'url(' + img(c.card_key) + ')'; b.appendChild(lb);
        b.appendChild(el('span', 'lt', sym(c)));
        b.title = c.description + ': ' + n + (onAxis && n ? ' – click to note this value instead' : '');
        b.setAttribute('aria-label', c.description + ': ' + n + ' votes');
        if (onAxis && n) b.onclick = () => { S.noted = c.card_key === sum.top ? null : c.card_key; renderTable(); };
        h.appendChild(b);
    });
    h.setAttribute('aria-label', 'Distribution of the votes');
    /* pointer: where the votes lean (only for scales with numbers behind them) */
    if (S.theme === 'classic') { const p = el('img', 'pointer'); p.src = SRC + 'index.png'; p.alt = ''; h.appendChild(p); }
    else h.appendChild(el('span', 'pointer', '▲'));
    requestAnimationFrame(() => placePointer(sum, deck));

    const o = $('#outliers'); o.textContent = '';
    if (sum.verdict === 'spread') {
        const who = k => ps.filter(p => p.key === k).map(p => p.name).join(', ');
        if (S.anon === '1') o.textContent = 'Lowest ' + symOf(sum.lo) + ', highest ' + symOf(sum.hi) + ' – let both sides explain.';
        else {
            o.append('Let them explain: ');
            o.appendChild(el('b', null, who(sum.lo) + ' (' + symOf(sum.lo) + ')'));
            o.append(' and ');
            o.appendChild(el('b', null, who(sum.hi) + ' (' + symOf(sum.hi) + ')'));
        }
    } else if (sum.verdict === 'mixed') {
        o.textContent = 'Ask how each of you sees it.';
    } else if (sum.verdict) {
        o.textContent = sum.verdict === 'consensus' ? 'Nothing to discuss.' : 'Close – pick one and go on.';
    }
    if (sum.other.length) o.textContent = 'Someone has a question or needs a break – talk first. ' + o.textContent;

    /* implicit result: the most chosen card is noted silently; changing it is possible, never required */
    const nt = $('#noted'); nt.textContent = '';
    if (noted && !sum.nominal) {
        nt.append('noted: ');
        nt.appendChild(el('b', null, symOf(noted)));
        nt.append(S.noted ? ' (changed) · ' : ' (most votes) · ');
        const a = el('button', 'link', S.noted ? 'reset' : 'change');
        a.onclick = () => { if (S.noted) { S.noted = null; renderTable(); } else toast('Click a bar to note another value'); };
        nt.appendChild(a);
    }

    renderRoundLog(deck);
    renderButtons();
}
function placePointer(sum, deck) {
    const h = $('#histo'), p = $('.pointer', h); if (!p) return;
    const cols = $$('.hcol', h);
    const vals = sum.ek.map(k => byKey(k).numeric_value);
    if (!vals.length) { p.hidden = true; return; }
    p.hidden = false;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const pts = deck.map((c, i) => [c, cols[i]]).filter(([c]) => ordinal(c))
        .map(([c, col]) => [c.numeric_value, col.offsetLeft + col.offsetWidth / 2]);
    let x = pts[pts.length - 1][1];
    for (let i = 0; i < pts.length; i++) {
        if (pts[i][0] >= avg) {
            x = i === 0 ? pts[0][1] : pts[i - 1][1] + (avg - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]) * (pts[i][1] - pts[i - 1][1]);
            break;
        }
    }
    p.style.left = x + 'px';
}
function renderRoundLog(deck) {
    const ol = $('#roundLog'); ol.textContent = '';
    const t = active(); if (!t) return;
    t.rounds.forEach((r, k) => ol.appendChild(roundRow(r, k, deck)));
}
function roundRow(r, k, deck) {
    const s = summarize(r.keys, deck), li = el('li');
    li.appendChild(el('span', null, 'R' + (k + 1)));
    const sp = el('span', 'spark'); sp.setAttribute('aria-hidden', 'true');
    scaleOf(deck).forEach(c => { const i = el('i'); i.style.setProperty('--p', ((s.cnt.get(c.card_key) || 0) / s.max).toFixed(2)); sp.appendChild(i); });
    li.appendChild(sp);
    li.appendChild(el('span', 'rg', s.nominal ? symOf(s.top) : s.verdict === 'consensus' ? symOf(s.lo) : symOf(s.lo) + ' – ' + symOf(s.hi)));
    li.appendChild(el('span', null, (s.verdict || '') + ' · ' + r.at));
    return li;
}
function renderButtons() {
    const nx = isList() ? nextOpen() : null, bn = $('#btnNext');
    bn.hidden = !nx;
    bn.title = nx ? 'Estimate next: ' + firstLine(nx) : '';
}

/* ---------------------------------------------------------------- render: deck (input only) */
function renderDeck(deck) {
    const d = $('#deck'); d.textContent = '';
    deck.forEach((c, k) => {
        const b = el('button', 'dcard');
        b.setAttribute('aria-pressed', String(c.card_key === S.myKey));
        b.setAttribute('aria-label', 'Card ' + c.description);
        const im = el('img'); im.src = img(c.card_key); im.alt = ''; b.appendChild(im);
        if (k < 10) b.appendChild(el('span', 'key', String((k + 1) % 10)));
        b.onclick = () => pick(c.card_key);
        d.appendChild(b);
    });
    requestAnimationFrame(() => {
        const sel = $('.dcard[aria-pressed=true]', d);
        if (sel && d.scrollWidth > d.clientWidth) d.scrollLeft = sel.offsetLeft - d.clientWidth / 2 + sel.offsetWidth / 2;
    });
}
function pick(key) {
    if (S.role === 'observer') return;
    S.myKey = key;
    renderTable();
    const mine = $('.card.me'); if (mine) mine.classList.add('pop');
}

/* ---------------------------------------------------------------- render: topic in the panel / phone strip */
function renderQueue() {
    const t = active(), i = activeIdx(), total = S.list.length, list = isList();
    const note = $('#activeTopic'); note.textContent = '';
    const txt = t ? topicText(t) : '';
    const empty = !txt;
    note.classList.toggle('empty', empty);
    $('#qHead').textContent = list ? 'Topics' : 'Topic';
    $$('[data-topics-lbl]').forEach(x => x.textContent = list ? 'Topics' : 'Topic');
    $('#qPos').textContent = list ? (i + 1) + ' / ' + total : '';
    $('#tsPos').textContent = list ? (i + 1) + '/' + total : '';
    if (!empty) {
        const body = el('div'); renderMd(body, txt); note.appendChild(body);
        $('#tsTxt').textContent = firstLine(t);
    } else {
        note.textContent = t ? 'No topic – click to write one (optional)' : 'All topics done – add more with the pen.';
        $('#tsTxt').textContent = 'No topic – tap to write one';
    }
    $('.topic-strip').classList.toggle('empty', empty);
    note.setAttribute('aria-label', 'Edit topic');
    $('#addNext').hidden = list;

    const ol = $('#qNext'); ol.textContent = '';
    if (!list) return;
    const open = S.list.filter(x => x.status === 'open'), done = S.list.filter(x => x.status === 'done');
    open.slice(0, 3).forEach((x) => {
        const li = el('li'); li.appendChild(el('span', 'n', String(S.list.indexOf(x) + 1)));
        li.appendChild(el('span', 'tx', firstLine(x))); ol.appendChild(li);
    });
    if (open.length > 3) { const li = el('li', 'more'); li.appendChild(el('span', 'n', '')); li.appendChild(el('span', 'tx', '+ ' + (open.length - 3) + ' more')); ol.appendChild(li); }
    done.forEach(x => {
        const li = el('li', 'done'); li.appendChild(el('span', 'n', '✓'));
        li.appendChild(el('span', 'tx', firstLine(x)));
        li.appendChild(el('span', 'chip final', x.final ? symOf(x.final) : '–'));
        ol.appendChild(li);
    });
}

/* ---------------------------------------------------------------- menu sections */
function renderTopicsMenu(openAdd) {
    const list = isList();
    $('#tSingle').hidden = list;
    $('#tTxt').value = active() ? topicText(active()) : '';
    $('#tAddOpen').hidden = list || openAdd;
    $('#tAddBox').hidden = !(list || openAdd);
    $('#tAdd').previousElementSibling.textContent = list ? 'Add topics – one per line (paste from Jira works)' : 'Next topics – one per line (paste from Jira works)';
    const ol = $('#tList'); ol.textContent = '';
    const deck = deckCards();
    if (list) S.list.forEach((x, k) => {
        const li = el('li', x.status);
        const row = el('div', 't-row');
        row.appendChild(el('span', 'st', x.status === 'done' ? '✓' : x.status === 'active' ? '▶' : String(k + 1)));
        row.appendChild(el('span', 'tx', firstLine(x)));
        if (x.status === 'done') row.appendChild(el('span', 'chip final', x.final ? symOf(x.final) : '–'));
        if (x.status === 'active') row.appendChild(el('span', 'chip', 'now'));
        const acts = el('span', 'acts');
        if (x.status === 'open') {
            acts.appendChild(iconBtn('i-up', 'Move up', () => { const j = S.list.indexOf(x); if (S.list[j - 1] && S.list[j - 1].status === 'open') { [S.list[j - 1], S.list[j]] = [S.list[j], S.list[j - 1]]; renderAll(); renderTopicsMenu(); } }));
            acts.appendChild(iconBtn('i-trash', 'Delete', () => { S.list.splice(S.list.indexOf(x), 1); renderAll(); renderTopicsMenu(); }));
        } else acts.appendChild(iconBtn('i-pen', 'Edit', () => toast('Would edit the topic text inline')));
        row.appendChild(acts);
        li.appendChild(row);
        if (x.rounds.length) {
            const d = el('details'); d.appendChild(el('summary', null, x.rounds.length + (x.rounds.length > 1 ? ' rounds' : ' round')));
            const rl = el('ol', 'rounds'); x.rounds.forEach((r, i) => rl.appendChild(roundRow(r, i, deck))); d.appendChild(rl);
            li.appendChild(d);
        }
        ol.appendChild(li);
    });
    const h = $('#hist'); h.textContent = '';
    HISTORY.forEach((day, k) => {
        const d = el('details', 'hist-day'); if (k === 0) d.open = true;
        const s = el('summary', null, day.day + ' '); s.appendChild(el('small', null, '· ' + day.items.length + ' topics · ' + day.items.reduce((a, i) => a + i[2], 0) + ' rounds'));
        d.appendChild(s);
        const ul = el('ul');
        day.items.forEach(([tx, v, r]) => { const li = el('li'); li.appendChild(el('span', 'tx', tx)); li.appendChild(el('span', 'muted', r + 'R')); li.appendChild(el('span', 'chip final', v)); ul.appendChild(li); });
        d.appendChild(ul); h.appendChild(d);
    });
}
function iconBtn(icon, label, fn) {
    const b = el('button', 'icon-btn sm'); b.setAttribute('aria-label', label); b.title = label;
    b.innerHTML = '<svg class="i"><use href="#' + icon + '"/></svg>'; /* static icon markup only */
    b.onclick = fn; return b;
}
function renderPlayers() {
    const ul = $('#pList'); ul.textContent = '';
    const ps = players();
    const rows = [];
    for (let i = 0; i < S.n; i++) if (!S.removed.has(i)) rows.push(i);
    rows.push('obs');
    rows.forEach(i => {
        const li = el('li'), dot = el('span', 'dot'), who = el('span', 'who');
        const b = el('b'), sm = el('small');
        if (i === 'obs') { b.textContent = 'Olaf'; sm.textContent = 'Observer'; dot.classList.add('obs'); }
        else {
            const me = i === 0, p = ps.find(x => x.i === i);
            b.textContent = (me ? S.me + ' (you)' : NAMES[i]);
            if (me && S.role === 'observer') { sm.textContent = 'Observer'; dot.classList.add('obs'); }
            else if (i === 4) { sm.textContent = 'Player · inactive for 14 min'; dot.classList.add('away'); }
            else { sm.textContent = 'Player · ' + (p && p.done ? 'voted' : 'thinking'); if (p && p.done) dot.classList.add('done'); }
        }
        who.append(b, sm); li.append(dot, who);
        if (i !== 0) {
            const rm = el('button', 'btn sm' + (i === 4 ? ' danger' : ''), 'Remove');
            rm.onclick = () => {
                const c = el('span', 'confirm'); c.appendChild(el('span', null, 'Remove ' + b.textContent + '?'));
                const no = el('button', 'btn sm', 'Cancel'), yes = el('button', 'btn sm danger', 'Remove');
                no.onclick = renderPlayers;
                yes.onclick = () => { if (i === 'obs') li.remove(); else { S.removed.add(i); renderTable(); renderPlayers(); } toast('Removed – they can rejoin via the link'); };
                c.append(no, yes); rm.replaceWith(c); no.focus();
            };
            li.appendChild(rm);
        }
        ul.appendChild(li);
    });
}
function renderBoard() {
    const sel = $('#presetSel'); if (!sel.options.length) PRESETS.forEach(p => { const o = el('option', null, p.description); o.value = p.id; sel.appendChild(o); });
    sel.value = S.presetId;
    const t = $('#thumbs'); t.textContent = '';
    const all = deckCards(true);
    all.forEach(c => {
        const b = el('button', 'dcard'); b.setAttribute('aria-pressed', String(!S.disabled.has(c.card_key)));
        b.setAttribute('aria-label', 'Card ' + c.description);
        const im = el('img'); im.src = img(c.card_key); im.alt = ''; b.appendChild(im);
        b.onclick = () => { S.disabled.has(c.card_key) ? S.disabled.delete(c.card_key) : S.disabled.add(c.card_key); renderBoard(); renderTable(); };
        t.appendChild(b);
    });
    $('#teamTxt').value = S.team;
    /* one-line summaries: what is set, without opening the group */
    $('#sumDeck').textContent = preset().description + ' · ' + (all.length - S.disabled.size) + ' of ' + all.length + ' cards';
    $('#sumResults').textContent = (S.anon === '1' ? 'anonymous' : 'names shown') + ' · by ' + (S.anon === '1' || S.sort === 'value' ? 'value' : 'name') +
        ' · pointer ' + (S.pointer === '1' ? 'on' : 'off');
    $('#sumTeam').textContent = S.team;
    $('#ixBoard').textContent = preset().description + ' · results · team name';
    applySettingsVariant();
}
/* variant A: exclusive collapsible groups (default) · variant B: tabs (?settings=tabs) */
function applySettingsVariant() {
    const sec = $('[data-sec=board]'), tabs = $('#gTabs'), grps = $$('.grp', sec);
    sec.dataset.variant = S.settings;
    if (S.settings === 'tabs') {
        if (!tabs.childElementCount) grps.forEach((g, k) => {
            const b = el('button', null, $('summary b', g).textContent); b.setAttribute('role', 'tab');
            b.setAttribute('aria-selected', String(k === 0)); b.dataset.grp = g.dataset.grp;
            b.onclick = () => { $$('button', tabs).forEach(x => x.setAttribute('aria-selected', String(x === b))); showTab(); };
            tabs.appendChild(b);
        });
        showTab();
    } else {
        grps.forEach(g => { g.hidden = false; g.setAttribute('name', 'bset'); });
    }
    function showTab() {
        const cur = ($('[aria-selected=true]', tabs) || {}).dataset.grp;
        grps.forEach(g => { g.removeAttribute('name'); g.open = true; g.hidden = g.dataset.grp !== cur; });
    }
}
function renderCounts() {
    const total = S.n - S.removed.size + 1;
    $$('[data-count]').forEach(b => b.textContent = total);
    $('#ixPlayers').textContent = total + ' on the board';
    $('#ixYou').textContent = S.me + ' · ' + (S.role === 'observer' ? 'Observer' : 'Player') + ' · ' + S.mode;
    const t = active();
    $('#ixTopics').textContent = isList() ? (S.list.filter(x => x.status === 'open').length) + ' open · now: ' + (t ? firstLine(t) : '–')
        : (t && topicText(t) ? firstLine(t) : 'None – optional');
    $$('[data-me]').forEach(s => s.textContent = S.me);
}
function renderStatusLine(voted, total) {
    const sl = $('#statusLine'); sl.textContent = '';
    const t = active(), p = preset();
    sl.appendChild(el('span', 'mode', S.state === 'revealed' ? 'REVEALED' : 'VOTING'));
    sl.appendChild(el('span', 'fill', ' round ' + ((t ? t.rounds.length : 0) + 1) + ' · ' + (t && topicText(t) ? firstLine(t) : 'no topic') +
        (S.state === 'voting' ? ' · ' + voted + '/' + total + ' voted' : '')));
    if (S.timer) sl.appendChild(el('span', 'r t', '⏱ ' + $('#tTime').textContent));
    sl.appendChild(el('span', 'r', p ? p.description.toLowerCase() : ''));
    sl.appendChild(el('span', 'r', S.me.toLowerCase() + '@' + S.team.toLowerCase().replace(/^team\s+/, '').replace(/\s+/g, '-')));
}

/* ---------------------------------------------------------------- round actions (same flow as today) */
function closeRound() {
    const t = active(); if (!t) return;
    const now = new Date(); const at = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    t.rounds.push({ at, keys: players().map(p => p.key) });
}
function notedNow() { const deck = deckCards(); return S.noted || summarize(players().map(p => p.key), deck).top; }
$('#btnCancel').onclick = () => { S.myKey = null; renderAll(); toast('Round cancelled'); };
$('#btnNew').onclick = () => { closeRound(); S.myKey = null; S.noted = null; setState('voting'); };
$('#btnNext').onclick = () => {
    const t = active(), nx = nextOpen(); if (!t || !nx) return;
    t.final = notedNow(); closeRound(); t.status = 'done'; nx.status = 'active';
    S.myKey = null; S.noted = null; setState('voting'); toast('Noted ' + symOf(t.final) + ' – next: ' + firstLine(nx));
};
function setState(s) { S.state = s; app.dataset.state = s; syncControls(); renderAll(); }

/* ---------------------------------------------------------------- menu open/close */
let opener = null;
function openMenu(sec, from) {
    const m = $('#menu'), wasOpen = !m.hidden;
    if (!wasOpen) opener = from || document.activeElement;
    S.sec = sec;
    $$('[data-sec]', m).forEach(s => s.hidden = s.dataset.sec !== sec);
    const s = $('[data-sec="' + sec + '"]', m);
    $('#menuTitle').textContent = sec === 'topics' ? (isList() ? 'Topics' : 'Topic') : s.dataset.title;
    $('#mBack').hidden = sec === 'index';
    if (sec === 'topics') renderTopicsMenu(from && from.hasAttribute && from.hasAttribute('data-add'));
    if (sec === 'players') renderPlayers();
    if (sec === 'board') renderBoard();
    if (sec === 'you') $('#youTxt').value = S.me;
    if (sec === 'invite') drawQr();
    m.hidden = false; $('#scrim').hidden = false;
    $$('.head [data-open]').forEach(b => b.setAttribute('aria-expanded', String(b.dataset.open === sec || b.classList.contains('menu-btn'))));
    $('.m-body').scrollTop = 0;
    setTimeout(() => {
        const f = (sec === 'topics' && !$('#tAddBox').hidden && $('#tAdd')) ||
            $('[data-sec="' + sec + '"] :is(input:not([readonly]), textarea, button, summary)', m) || $('[data-close]', m);
        if (f) f.focus({ preventScroll: true });
    }, 50);
}
function closeMenu() {
    const m = $('#menu'); if (m.hidden) return;
    m.hidden = true; $('#scrim').hidden = true; S.sec = null;
    $$('.head [data-open]').forEach(b => b.setAttribute('aria-expanded', 'false'));
    if (opener && opener.focus) opener.focus();
}
$('#mBack').onclick = () => openMenu('index');
$('#scrim').onclick = closeMenu;
app.addEventListener('click', e => {
    const o = e.target.closest('[data-open]');
    if (o) { if (S.sec === o.dataset.open && o.closest('.head')) closeMenu(); else openMenu(o.dataset.open, o); return; }
    if (e.target.closest('[data-close]')) closeMenu();
    const ts = e.target.closest('[data-toast]'); if (ts) toast(ts.dataset.toast);
    if (e.target.closest('[data-noop]')) e.preventDefault();
    if (e.target.closest('[data-action=mode]')) setMode(S.mode === 'dark' ? 'light' : 'dark');
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (!$('#mockPanel').hidden) toggleMock(false); else closeMenu(); return; }
    if (e.target.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'm' || e.key === 'M' || e.key === 'Dead' || e.key === '^' || e.code === 'Backquote' || e.key === '`') { e.preventDefault(); toggleMock(); return; } /* M, or ` / ^ */
    if (/^[0-9]$/.test(e.key) && S.state === 'voting') {
        const deck = deckCards(), k = e.key === '0' ? 9 : +e.key - 1;
        if (deck[k]) pick(deck[k].card_key);
    }
});
$$('.tabs [role=tab]').forEach(b => b.onclick = () => {
    $$('.tabs [role=tab]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    $$('[data-tabpanel]').forEach(p => p.hidden = p.dataset.tabpanel !== b.dataset.tab);
});

/* settings */
$$('.seg[data-setting]').forEach(g => g.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const k = g.dataset.setting, v = b.dataset.val;
    if (k === 'mode') return setMode(v);
    S[k] = v;
    if (k === 'pointer') app.toggleAttribute('data-pointer', v === '1');
    if (k === 'role') app.toggleAttribute('data-observer', v === 'observer');
    syncControls(); renderAll(); if (S.sec === 'board') renderBoard();
}));
$('#presetSel').onchange = e => { setDeck(+e.target.value); renderBoard(); };
$('#teamSave').onclick = () => { S.team = $('#teamTxt').value.trim() || S.team; $('#teamName').textContent = S.team; renderAll(); renderBoard(); toast('Team name saved'); };
$('#youSave').onclick = () => { S.me = $('#youTxt').value.trim() || S.me; renderAll(); toast('Name saved'); };
$('#fbSend').onclick = () => { $('#fbTxt').value = ''; closeMenu(); toast('Thank you for your feedback!'); };
$('#tSave').onclick = () => { const t = active(); if (t) t.text = $('#tTxt').value.trim(); renderAll(); closeMenu(); toast('Topic saved'); };
$('#tAddOpen').onclick = () => { renderTopicsMenu(true); $('#tAdd').focus(); };
$('#tAddBtn').onclick = () => {
    const lines = $('#tAdd').value.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    if (!isList()) { const t = active(); if (t && t.text == null) t.text = topicText(t); if (t && !t.text) t.text = $('#tTxt').value.trim(); S.topics = 'backlog'; }
    lines.forEach(text => S.list.push({ text, status: active() ? 'open' : 'active', rounds: [] }));
    $('#tAdd').value = ''; syncControls(); renderAll(); renderTopicsMenu();
    $('#menuTitle').textContent = 'Topics';
    toast(lines.length + (lines.length > 1 ? ' topics' : ' topic') + ' added – the panel now shows the list');
};

/* ---------------------------------------------------------------- stopwatch: one switch for the whole team */
function setTimer(on) {
    S.timer = on; app.toggleAttribute('data-timer', on);
    $('#swBtn').setAttribute('aria-pressed', String(on));
    $('#swRow').setAttribute('aria-checked', String(on));
    renderAll();
    toast(on ? 'Stopwatch on – for everyone' : 'Stopwatch off – for everyone');
}
$('#swBtn').onclick = () => setTimer(!S.timer);
$('#swRow').onclick = () => setTimer(!S.timer);
setInterval(() => { if (S.tRun) { S.tSec++; drawTime(); } }, 1000);
function drawTime() {
    const m = Math.floor(S.tSec / 60), s = S.tSec % 60;
    $('#tTime').textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    const r = $('#statusLine .t'); if (r && S.timer) r.textContent = '⏱ ' + $('#tTime').textContent;
}
$('#tPlay').onclick = () => {
    S.tRun = !S.tRun;
    $('#tPlay use').setAttribute('href', S.tRun ? '#i-pause' : '#i-play');
    $('#tPlay').setAttribute('aria-label', S.tRun ? 'Pause stopwatch' : 'Start stopwatch');
};
$('#tReset').onclick = () => { S.tSec = 0; drawTime(); };

/* ---------------------------------------------------------------- mode / deck */
function setMode(m) { S.mode = m; app.classList.toggle('light', m === 'light'); syncControls(); renderAll(); }
function setDeck(id) {
    S.presetId = id; S.disabled.clear(); S.myKey = null; S.noted = null;
    const keepTexts = S.list.map(t => t.text);
    seedTopics(); if (keepTexts.length === S.list.length) S.list.forEach((t, k) => { t.text = keepTexts[k]; });
    syncControls(); renderAll();
}
function syncControls() {
    const vals = { anon: S.anon, sort: S.sort, pointer: S.pointer, role: S.role, mode: S.mode };
    $$('.seg[data-setting]').forEach(g => $$('button', g).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === vals[g.dataset.setting]))));
    $$('.seg[data-setting=sort] button').forEach(b => b.disabled = S.anon === '1');
    $('.brand-img').src = SRC + (S.mode === 'dark' ? 'brand_dark.svg' : 'brand_light.svg');
    $('#swBtn').setAttribute('aria-pressed', String(S.timer));
    $('#swRow').setAttribute('aria-checked', String(S.timer));
    const m = { state: S.state, result: S.result, topics: S.topics, mode: S.mode, device: S.device, settings: S.settings };
    $$('#mockPanel [data-m]').forEach(g => $$('button', g).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === m[g.dataset.m]))));
    $('#mpDeck').value = S.presetId;
    $('#mpPlayers').value = S.n; $('#mpPlayersOut').textContent = S.n;
}

/* ---------------------------------------------------------------- mockup handle (not part of the app) */
function toggleMock(force) {
    const p = $('#mockPanel'), open = force != null ? force : p.hidden;
    p.hidden = !open; $('#mockHandle').setAttribute('aria-expanded', String(open));
}
$('#mockHandle').onclick = () => toggleMock();
$('#mockPanel').addEventListener('click', e => {
    const b = e.target.closest('[data-m] button'); if (!b) return;
    const k = b.closest('[data-m]').dataset.m, v = b.dataset.val;
    if (k === 'state') { if (v === 'voting') S.myKey = null; setState(v); }
    if (k === 'result') { S.result = v; S.myKey = null; S.noted = null; if (S.state !== 'revealed') setState('revealed'); else renderAll(); }
    if (k === 'topics') { S.topics = v; seedTopics(); renderAll(); }
    if (k === 'mode') setMode(v);
    if (k === 'device') { S.device = v; stage.dataset.device = v; relayout(); }
    if (k === 'settings') { S.settings = v; if (S.sec === 'board') renderBoard(); else openMenu('board'); }
    syncControls();
});
$('#mpDeck').onchange = e => setDeck(+e.target.value);
$('#mpPlayers').oninput = e => { S.n = +e.target.value; S.removed.clear(); syncControls(); renderAll(); };
$('#mpLink').onclick = e => {
    e.preventDefault();
    const q = new URLSearchParams();
    if (S.theme !== 'console') q.set('theme', S.theme);
    if (S.mode !== 'dark') q.set('mode', S.mode);
    if (S.device !== 'fluid') q.set('device', S.device);
    if (S.state !== 'revealed') q.set('state', S.state);
    if (S.result !== 'spread') q.set('result', S.result);
    if (S.presetId !== 1) q.set('deck', Object.keys(DECK_SLUG).find(k => DECK_SLUG[k] === S.presetId));
    if (S.topics !== 'single') q.set('topics', S.topics);
    if (S.n !== 7) q.set('players', S.n);
    if (S.settings !== 'groups') q.set('settings', S.settings);
    if (!S.timer) q.set('timer', '0');
    if (S.sec) q.set('menu', S.sec);
    history.replaceState(null, '', '?' + q.toString());
    toast('URL updated – copy it from the address bar');
};

/* fixed-size frames: scale to fit the stage, centred (never cut off) */
const SIZES = { desktop: [1280, 800], portrait: [375, 667], landscape: [667, 375] };
function relayout() {
    const sz = SIZES[S.device];
    if (sz) {
        const W = stage.clientWidth, H = stage.clientHeight, pad = W < 500 ? 12 : 32;
        const s = Math.min(1, (W - pad) / sz[0], (H - pad) / sz[1]);
        device.style.transform = 'translate(' + Math.round((W - sz[0] * s) / 2) + 'px,' + Math.round((H - sz[1] * s) / 2) + 'px) scale(' + s.toFixed(4) + ')';
    } else device.style.transform = '';
    requestAnimationFrame(rePointer);
}
function rePointer() { if (S.state === 'revealed') { const deck = deckCards(); placePointer(summarize(players().map(p => p.key), deck), deck); } }
new ResizeObserver(relayout).observe(stage);
new ResizeObserver(() => requestAnimationFrame(rePointer)).observe(app);

/* ---------------------------------------------------------------- QR placeholder, toast */
function drawQr() {
    const q = $('#qr'); if (q.childElementCount) return;
    let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const ns = 'http://www.w3.org/2000/svg';
    const finder = (x, y) => x >= 0 && x < 7 && y >= 0 && y < 7 && (x === 0 || y === 0 || x === 6 || y === 6 || (x > 1 && x < 5 && y > 1 && y < 5));
    const inFinder = (x, y) => (x < 8 && y < 8) || (x > 16 && y < 8) || (x < 8 && y > 16);
    for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) {
        if (inFinder(x, y) ? (finder(x, y) || finder(x - 18, y) || finder(x, y - 18)) : rnd() > .52) {
            const r = document.createElementNS(ns, 'rect');
            r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', 1); r.setAttribute('height', 1); r.setAttribute('fill', '#111');
            q.appendChild(r);
        }
    }
}
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); }

function renderAll() { renderQueue(); renderTable(); if (S.sec === 'players') renderPlayers(); }

/* ---------------------------------------------------------------- boot */
(function boot() {
    /* deep links: ?mode=light&device=portrait&state=voting&result=mixed&deck=emotions&topics=backlog&menu=board&settings=tabs&timer=0
       ?theme=classic only for comparison with today's look. ?clean=1 hides the mockup handle (screenshots). */
    const q = new URLSearchParams(location.search);
    if (q.get('theme') === 'classic') S.theme = 'classic';
    if (q.get('mode')) S.mode = q.get('mode');
    if (q.get('device')) S.device = q.get('device');
    if (q.get('state')) S.state = q.get('state');
    if (q.get('result')) S.result = q.get('result');
    if (q.get('players')) S.n = Math.max(1, Math.min(21, +q.get('players') || 7));
    if (q.get('long')) S.long = true;
    if (['none', 'single', 'backlog'].includes(q.get('topics'))) S.topics = q.get('topics');
    if (q.get('settings') === 'tabs') S.settings = 'tabs';
    if (q.get('timer') === '0') S.timer = false;
    if (q.get('clean')) document.body.classList.add('clean');
    app.dataset.theme = S.theme; app.dataset.state = S.state; app.classList.toggle('light', S.mode === 'light');
    app.toggleAttribute('data-pointer', true); app.toggleAttribute('data-timer', S.timer); stage.dataset.device = S.device;
    fetch('../../cards.json').then(r => r.json()).then(d => {
        CARDS = d.cards.slice().sort((a, b) => a.sort_order - b.sort_order);
        PRESETS = d.presets;
        const dk = q.get('deck');
        if (dk) { const id = DECK_SLUG[dk] || +dk; if (PRESETS.some(p => p.id === id)) S.presetId = id; }
        PRESETS.forEach(p => { const o = el('option', null, p.description); o.value = p.id; $('#mpDeck').appendChild(o); });
        seedTopics(); syncControls(); renderAll(); drawTime(); relayout();
        if (q.get('menu')) openMenu(q.get('menu'));
        if (q.get('mock')) toggleMock(true);
    }).catch(() => { $('#table').textContent = 'Could not load ../../cards.json – open the mockup via a web server.'; });
})();
