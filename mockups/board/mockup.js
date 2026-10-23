/* Throw-away mockup logic (Sprint 8, B-51). Static: no API calls, no analytics.
   Reads only ../../cards.json and images from ../../src/. All names/topics are rendered via textContent. */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const app = $('#app'), stage = $('#stage'), device = $('#device');
const SRC = '../../src/';

/* ---------------------------------------------------------------- data */
const NAMES = ['Ann', 'Ben', 'Chris', 'Dana', 'Emil', 'Fatma', 'Gero', 'Maximiliane-Sophie', 'Ilias', 'Jule', 'Kemal',
    'Lena', 'Mo', 'Nora', 'Oskar', 'Paula', 'Quirin', 'Rosa', 'Sven', 'Tara', 'Ulla'];
/* vote pattern per scenario: offset from the "typical" card (index in the estimable cards) */
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

const S = {
    theme: 'classic', mode: 'dark', device: 'fluid', n: 7, state: 'revealed', result: 'spread', backlog: true, long: false,
    anon: '0', sort: 'value', pointer: '1', timer: true, role: 'player', presetId: 1, disabled: new Set(),
    myKey: null, final: null, me: 'Ann', team: 'Team Phoenix Payments', removed: new Set(),
    tRun: false, tSec: 83, sec: null, topics: []
};
let CARDS = [], PRESETS = [];

/* ---------------------------------------------------------------- cards */
const img = key => SRC + 'c_' + key + '.png';
const byKey = key => CARDS.find(c => c.card_key === key);
const estimable = c => c.numeric_value != null && !c.flow_control;
function shortLabel(c) {
    const map = { infin01: '∞', qstmrk1: '?', break01: 'cof', xclam01: '!', veto: 'veto', xxl0001: 'XXL', '1pnt501': '½',
        green01: 'grn', yellow1: 'yel', red0001: 'red' };
    if (map[c.card_key]) return map[c.card_key];
    if (/star/.test(c.description)) return c.description.split(' ')[0].replace('zero', '0').replace('one', '1').replace('two', '2')
        .replace('three', '3').replace('four', '4').replace('five', '5') + '★';
    return c.description.length > 4 ? c.description.slice(0, 3) : c.description;
}
function deckCards(withDisabled) {
    if (!PRESETS.length) return [];
    const p = PRESETS.find(x => x.id === S.presetId) || PRESETS[0];
    return CARDS.filter(c => (p.index_list.includes(c.index) || c.flow_control) && (withDisabled || !S.disabled.has(c.card_key)));
}

/* ---------------------------------------------------------------- votes */
function voteFor(i, deck) {
    const est = deck.filter(estimable);
    if (!est.length) return deck[i % deck.length].card_key;
    const pat = PATTERN[S.result], o = pat[i % pat.length];
    if (typeof o === 'string') return deck.some(c => c.card_key === o) ? o : est[0].card_key;
    const c = Math.min(est.length - 1, Math.floor(est.length / 2));
    return est[Math.max(0, Math.min(est.length - 1, c + o))].card_key;
}
function players() {
    const deck = deckCards(), list = [];
    if (!deck.length) return list;
    for (let i = 0; i < S.n; i++) {
        if (S.removed.has(i)) continue;
        const me = i === 0;
        if (me && S.role === 'observer') continue;
        let key = me && S.myKey ? S.myKey : voteFor(i, deck);
        if (!deck.some(c => c.card_key === key)) key = voteFor(i, deck);
        const done = S.state === 'revealed' || (me ? !!S.myKey : i % 3 !== 2);
        list.push({ i, me, name: me ? S.me : NAMES[i], key, done, away: i === 4 && S.state !== 'revealed' });
    }
    return list;
}

/* summary of one round: counts per deck card, range, verdict, outliers */
function summarize(keys, deck) {
    const cnt = new Map(); keys.forEach(k => cnt.set(k, (cnt.get(k) || 0) + 1));
    const est = deck.filter(estimable), pos = k => est.findIndex(c => c.card_key === k);
    const ek = keys.filter(k => pos(k) >= 0).sort((a, b) => pos(a) - pos(b));
    const other = keys.filter(k => pos(k) < 0);
    let verdict = null;
    if (ek.length) {
        const lo = pos(ek[0]), hi = pos(ek[ek.length - 1]);
        verdict = lo === hi ? 'consensus' : hi - lo <= 1 ? 'close' : 'spread';
    }
    let top = null, best = 0;
    ek.forEach(k => { const n = cnt.get(k); if (n > best || (n === best && pos(k) > pos(top))) { best = n; top = k; } });
    return { cnt, ek, other, verdict, lo: ek[0], hi: ek[ek.length - 1], top, max: Math.max(1, ...cnt.values()) };
}

/* ---------------------------------------------------------------- topics */
function seedTopics() {
    const deck = deckCards();
    const keysOf = (...vals) => vals.map(v => (CARDS.find(c => c.description === String(v)) || CARDS[0]).card_key);
    S.topics = [
        { text: 'PAY-138 Show invoice PDF in the account area', status: 'done', final: keysOf(5)[0],
            rounds: [{ at: '09:41', keys: keysOf(3, 5, 5, 5, 8, 5, 5) }] },
        { text: 'PAY-140 Credit limit check via the risk service', status: 'done', final: keysOf(13)[0],
            rounds: [{ at: '09:47', keys: keysOf(5, 13, 20, 8, 13, 3, 13) }, { at: '09:52', keys: keysOf(13, 13, 8, 13, 13, 13, 8) }] },
        { text: null, status: 'active', rounds: [{ at: '09:58', keys: keysOf(3, 8, 2, 5, 20, 8, 5) }] },
        { text: 'PAY-145 Dunning e-mails for overdue invoices', status: 'open', rounds: [] },
        { text: 'PAY-147 Payment terms per customer (14 / 30 days)', status: 'open', rounds: [] },
        { text: 'PAY-151 Invoice export for DATEV', status: 'open', rounds: [] }
    ];
    if (!S.backlog) S.topics = [{ text: null, status: 'active', rounds: [] }];
    void deck;
}
const topicText = t => t.text != null ? t.text : (S.long ? TOPIC_LONG : TOPIC_SHORT);
const activeIdx = () => S.topics.findIndex(t => t.status === 'active');
const active = () => S.topics[activeIdx()];
const nextOpen = () => S.topics.find(t => t.status === 'open');
const firstLine = t => topicText(t).split('\n')[0];

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
    let ps = players();
    const sum = summarize(ps.map(p => p.key), deck);
    const est = deck.filter(estimable), order = k => { const c = byKey(k); return c ? c.sort_order : 1e9; };
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
    renderResult(sum, deck, ps);
    renderDeck(deck);
    renderCounts();
    renderStatusLine(voted, ps.length);
    void est;
}

/* ---------------------------------------------------------------- render: result (separate from the deck) */
function renderResult(sum, deck, ps) {
    const v = $('#verdict'); v.textContent = '';
    const lab = c => c ? (estimable(c) ? c.description : shortLabel(c)) : '';
    if (sum.verdict) {
        const names = { consensus: 'Consensus', close: 'Close', spread: 'Spread' };
        v.appendChild(el('span', 'v ' + sum.verdict, names[sum.verdict]));
        const lo = byKey(sum.lo), hi = byKey(sum.hi);
        v.appendChild(el('span', null, sum.verdict === 'consensus' ? 'everyone chose ' + lab(lo) : lab(lo) + ' – ' + lab(hi)));
    } else {
        v.appendChild(el('span', 'v', 'No estimate'));
    }
    if (sum.other.length) v.appendChild(el('span', 'muted', '+ ' + sum.other.length + ' × ' + Array.from(new Set(sum.other.map(k => byKey(k).description))).join(', ')));

    if (!S.final || !sum.cnt.has(S.final)) S.final = sum.top;
    const h = $('#histo'); h.textContent = '';
    let prevEst = true;
    deck.forEach(c => {
        const n = sum.cnt.get(c.card_key) || 0;
        const b = el('button', 'hcol' + (n === 0 ? ' zero' : '') + (n === sum.max && n > 0 ? ' top' : '') +
            (c.card_key === S.final ? ' sel' : '') + (!estimable(c) && prevEst ? ' sep' : ''));
        prevEst = estimable(c);
        b.dataset.key = c.card_key;
        b.style.setProperty('--p', (n / sum.max).toFixed(3));
        b.appendChild(el('span', 'cnt', n ? '×' + n : ''));
        b.appendChild(el('span', 'bar'));
        const lb = el('span', 'lb'); lb.style.backgroundImage = 'url(' + img(c.card_key) + ')'; b.appendChild(lb);
        b.appendChild(el('span', 'lt', shortLabel(c)));
        b.title = (c.description) + ': ' + n + (estimable(c) ? ' – click to set as final value' : '');
        b.setAttribute('aria-label', c.description + ': ' + n + ' votes');
        if (estimable(c)) b.onclick = () => { S.final = c.card_key; renderTable(); };
        h.appendChild(b);
    });
    h.setAttribute('aria-label', 'Distribution of the votes');
    /* pointer: where the votes lean, interpolated between the columns (same idea as today's index.png on the deck) */
    if (S.theme === 'classic') { const p = el('img', 'pointer'); p.src = SRC + 'index.png'; p.alt = ''; h.appendChild(p); }
    else h.appendChild(el('span', 'pointer', '▲'));
    if (S.theme === 'console') { const p = $('.pointer', h); p.style.color = 'var(--brand-pink)'; p.style.width = 'auto'; p.style.font = '12px/1 var(--font)'; }
    requestAnimationFrame(() => placePointer(sum, deck));

    const o = $('#outliers'); o.textContent = '';
    if (sum.verdict === 'spread') {
        const who = k => ps.filter(p => p.key === k).map(p => p.name).join(', ');
        if (S.anon === '1') o.textContent = 'Lowest ' + lab(byKey(sum.lo)) + ', highest ' + lab(byKey(sum.hi)) + ' – let both sides explain.';
        else {
            o.append('Let them explain: ');
            o.appendChild(el('b', null, who(sum.lo) + ' (' + lab(byKey(sum.lo)) + ')'));
            o.append(' and ');
            o.appendChild(el('b', null, who(sum.hi) + ' (' + lab(byKey(sum.hi)) + ')'));
        }
    } else if (sum.verdict) {
        o.textContent = sum.verdict === 'consensus' ? 'Nothing to discuss – take it.' : 'Close enough – pick one and go on.';
    }
    if (sum.other.length) o.textContent = 'Someone has a question or needs a break – talk first. ' + o.textContent;
    let hf = $('.hint-final');
    if (!hf) { hf = el('p', 'hint-final'); $('#result').appendChild(hf); }
    hf.textContent = S.final ? 'Final value: ' + lab(byKey(S.final)) + ' – click a bar to change it.' : '';

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
    const pts = deck.map((c, i) => [c, cols[i]]).filter(([c]) => estimable(c))
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
    deck.filter(estimable).forEach(c => { const i = el('i'); i.style.setProperty('--p', ((s.cnt.get(c.card_key) || 0) / s.max).toFixed(2)); sp.appendChild(i); });
    li.appendChild(sp);
    const lab = k2 => { const c = byKey(k2); return c ? c.description : ''; };
    li.appendChild(el('span', 'rg', s.verdict === 'consensus' ? lab(s.lo) : lab(s.lo) + ' – ' + lab(s.hi)));
    li.appendChild(el('span', null, (s.verdict || '') + ' · ' + r.at));
    return li;
}
function renderButtons() {
    const nx = nextOpen(), rv = $('#btnRevote'), bn = $('#btnNext');
    bn.hidden = !nx;
    rv.classList.toggle('primary', !nx);
    rv.lastChild.textContent = nx ? 'Re-vote' : 'New round';
    bn.title = nx ? 'Save the final value and estimate: ' + firstLine(nx) : '';
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

/* ---------------------------------------------------------------- render: queue / topic strip */
function renderQueue() {
    const t = active(), i = activeIdx(), total = S.topics.length;
    const note = $('#activeTopic'); note.textContent = '';
    note.classList.toggle('empty', !t);
    const pos = S.backlog ? (i + 1) + ' / ' + total : '';
    $('#qPos').textContent = pos;
    $('#tsPos').textContent = S.backlog ? (i + 1) + '/' + total : '';
    if (t) {
        const body = el('div'); renderMd(body, topicText(t)); note.appendChild(body);
        $('#tsTxt').textContent = firstLine(t);
    } else {
        note.textContent = 'All topics done – add more with the pen.';
        $('#tsTxt').textContent = 'No topic – tap to add';
    }
    $('.topic-strip').classList.toggle('empty', !t);

    const ol = $('#qNext'); ol.textContent = '';
    if (!S.backlog) return;
    const open = S.topics.filter(x => x.status === 'open'), done = S.topics.filter(x => x.status === 'done');
    open.slice(0, 3).forEach((x) => {
        const li = el('li'); li.appendChild(el('span', 'n', String(S.topics.indexOf(x) + 1)));
        li.appendChild(el('span', 'tx', firstLine(x))); ol.appendChild(li);
    });
    if (open.length > 3) { const li = el('li', 'more'); li.appendChild(el('span', 'n', '')); li.appendChild(el('span', 'tx', '+ ' + (open.length - 3) + ' more')); ol.appendChild(li); }
    done.forEach(x => {
        const li = el('li', 'done'); li.appendChild(el('span', 'n', '✓'));
        li.appendChild(el('span', 'tx', firstLine(x)));
        const f = byKey(x.final); li.appendChild(el('span', 'chip final', f ? shortLabel(f) : '–'));
        ol.appendChild(li);
    });
}

/* ---------------------------------------------------------------- menu sections */
function renderTopicsMenu() {
    const ol = $('#tList'); ol.textContent = '';
    const deck = deckCards();
    S.topics.forEach((x, k) => {
        const li = el('li', x.status);
        const row = el('div', 't-row');
        row.appendChild(el('span', 'st', x.status === 'done' ? '✓' : x.status === 'active' ? '▶' : String(k + 1)));
        row.appendChild(el('span', 'tx', firstLine(x)));
        if (x.status === 'done') { const f = byKey(x.final); row.appendChild(el('span', 'chip final', f ? shortLabel(f) : '–')); }
        if (x.status === 'active') row.appendChild(el('span', 'chip', 'now'));
        const acts = el('span', 'acts');
        if (x.status === 'open') {
            acts.appendChild(iconBtn('i-up', 'Move up', () => { const j = S.topics.indexOf(x); if (S.topics[j - 1] && S.topics[j - 1].status === 'open') { [S.topics[j - 1], S.topics[j]] = [S.topics[j], S.topics[j - 1]]; renderAll(); } }));
            acts.appendChild(iconBtn('i-trash', 'Delete', () => { S.topics.splice(S.topics.indexOf(x), 1); renderAll(); }));
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
    deckCards(true).forEach(c => {
        const b = el('button', 'dcard'); b.setAttribute('aria-pressed', String(!S.disabled.has(c.card_key)));
        b.setAttribute('aria-label', 'Card ' + c.description);
        const im = el('img'); im.src = img(c.card_key); im.alt = ''; b.appendChild(im);
        b.onclick = () => { S.disabled.has(c.card_key) ? S.disabled.delete(c.card_key) : S.disabled.add(c.card_key); renderBoard(); renderTable(); };
        t.appendChild(b);
    });
    $('#teamTxt').value = S.team;
}
function renderCounts() {
    const total = S.n - S.removed.size + 1;
    $$('[data-count]').forEach(b => b.textContent = total);
    $('#ixPlayers').textContent = total + ' on the board';
    $('#ixYou').textContent = S.me + ' · ' + (S.role === 'observer' ? 'Observer' : 'Player') + ' · ' + S.mode;
    const t = active();
    $('#ixTopics').textContent = S.backlog ? (S.topics.filter(x => x.status === 'open').length) + ' open · now: ' + (t ? firstLine(t) : '–') : (t ? firstLine(t) : 'No topic');
    $$('[data-me]').forEach(s => s.textContent = S.me);
}
function renderStatusLine(voted, total) {
    const sl = $('#statusLine'); sl.textContent = '';
    const t = active(), p = PRESETS.find(x => x.id === S.presetId);
    sl.appendChild(el('span', 'mode', S.state === 'revealed' ? 'REVEALED' : 'VOTING'));
    sl.appendChild(el('span', 'fill', ' round ' + ((t ? t.rounds.length : 0) + 1) + ' · ' + (t ? firstLine(t) : 'no topic') +
        (S.state === 'voting' ? ' · ' + voted + '/' + total + ' voted' : '')));
    if (S.timer) sl.appendChild(el('span', 'r t', '⏱ ' + $('#tTime').textContent));
    sl.appendChild(el('span', 'r', p ? p.description.toLowerCase() : ''));
    sl.appendChild(el('span', 'r', S.me.toLowerCase() + '@' + S.team.toLowerCase().replace(/^team\s+/, '').replace(/\s+/g, '-')));
}

/* ---------------------------------------------------------------- round actions */
function closeRound() {
    const t = active(); if (!t) return;
    const now = new Date(); const at = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    t.rounds.push({ at, keys: players().map(p => p.key) });
}
$('#btnCancel').onclick = () => { S.myKey = null; renderAll(); toast('Round cancelled – it is kept in the history as CANCEL_ROUND'); };
$('#btnRevote').onclick = () => { closeRound(); S.myKey = null; S.final = null; setState('voting'); };
$('#btnNext').onclick = () => {
    const t = active(), nx = nextOpen(); if (!t || !nx) return;
    closeRound(); t.status = 'done'; t.final = S.final; nx.status = 'active';
    S.myKey = null; S.final = null; setState('voting'); toast('Saved ' + shortLabel(byKey(t.final)) + ' – next: ' + firstLine(nx));
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
    $('#menuTitle').textContent = s.dataset.title;
    $('#mBack').hidden = sec === 'index';
    if (sec === 'topics') renderTopicsMenu();
    if (sec === 'players') renderPlayers();
    if (sec === 'board') renderBoard();
    if (sec === 'you') $('#youTxt').value = S.me;
    if (sec === 'invite') drawQr();
    m.hidden = false; $('#scrim').hidden = false;
    $$('.head [data-open]').forEach(b => b.setAttribute('aria-expanded', String(b.dataset.open === sec || b.classList.contains('menu-btn'))));
    $('.m-body').scrollTop = 0;
    setTimeout(() => { const f = $('[data-sec="' + sec + '"] :is(input:not([readonly]), textarea, button)', m) || $('[data-close]', m); if (f) f.focus({ preventScroll: true }); }, 50);
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
    if (e.key === 'Escape') { closeMenu(); return; }
    if (e.target.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
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
    if (k === 'theme') return setTheme(v);
    if (k === 'timer') { S.timer = v === '1'; app.toggleAttribute('data-timer', S.timer); }
    else S[k] = v;
    if (k === 'pointer') app.toggleAttribute('data-pointer', v === '1');
    if (k === 'role') app.toggleAttribute('data-observer', v === 'observer');
    syncControls(); renderAll();
}));
$('#presetSel').onchange = e => { S.presetId = +e.target.value; S.disabled.clear(); S.myKey = null; S.final = null; renderBoard(); renderAll(); };
$('#teamSave').onclick = () => { S.team = $('#teamTxt').value.trim() || S.team; $('#teamName').textContent = S.team; renderAll(); toast('Team name saved'); };
$('#youSave').onclick = () => { S.me = $('#youTxt').value.trim() || S.me; renderAll(); toast('Name saved'); };
$('#fbSend').onclick = () => { $('#fbTxt').value = ''; closeMenu(); toast('Thank you for your feedback!'); };
$('#tAddBtn').onclick = () => {
    const lines = $('#tAdd').value.split('\n').map(l => l.trim()).filter(Boolean);
    lines.forEach(text => S.topics.push({ text, status: active() || S.topics.some(t => t.status === 'open') ? 'open' : 'active', rounds: [] }));
    if (!active()) { const o = nextOpen(); if (o) o.status = 'active'; }
    $('#tAdd').value = ''; S.backlog = true; $('#mTopics').checked = true; renderAll(); renderTopicsMenu();
    if (lines.length) toast(lines.length + (lines.length > 1 ? ' topics' : ' topic') + ' added');
};

/* ---------------------------------------------------------------- stopwatch */
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

/* ---------------------------------------------------------------- theme / mode */
function setMode(m) { S.mode = m; app.classList.toggle('light', m === 'light'); syncControls(); renderAll(); }
function setTheme(t) { S.theme = t; app.dataset.theme = t; syncControls(); renderAll(); }

/* ---------------------------------------------------------------- mockup controls */
const NOTES = {
    classic: '<b>Classic</b> – today’s look and assets, new layout (variant C): panel on the right (topics, round, result), dock above the deck on phones, menus as side panel / bottom sheet with the same content.',
    console: '<b>Console</b> – proposal: mono type, prompt in the header, status line, keys 1–9 pick a card; same layout, cards and colours.'
};
function syncControls() {
    const set = (id, val) => $$('#' + id + ' button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === val)));
    set('mTheme', S.theme); set('mMode', S.mode); set('mDevice', S.device); set('mState', S.state);
    const vals = { anon: S.anon, sort: S.sort, pointer: S.pointer, role: S.role, mode: S.mode, theme: S.theme, timer: S.timer ? '1' : '0' };
    $$('.seg[data-setting]').forEach(g => $$('button', g).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === vals[g.dataset.setting]))));
    $$('.seg[data-setting=sort] button').forEach(b => b.disabled = S.anon === '1');
    $('#mNote').innerHTML = NOTES[S.theme]; /* static mockup text only */
    $('.brand-img').src = SRC + (S.mode === 'dark' ? 'brand_dark.svg' : 'brand_light.svg');
}
const grp = (id, fn) => $('#' + id).addEventListener('click', e => { const b = e.target.closest('button'); if (b) fn(b.dataset.val); });
grp('mTheme', setTheme);
grp('mMode', setMode);
grp('mDevice', v => { S.device = v; stage.dataset.device = v; syncControls(); relayout(); });
grp('mState', v => { if (v === 'voting') S.myKey = null; setState(v); });
$('#mResult').onchange = e => { S.result = e.target.value; S.myKey = null; S.final = null; if (S.state !== 'revealed') setState('revealed'); else renderAll(); };
$('#mPlayers').oninput = e => { S.n = +e.target.value; $('#mPlayersOut').textContent = S.n; S.removed.clear(); renderAll(); };
$('#mTopics').onchange = e => { S.backlog = e.target.checked; seedTopics(); renderAll(); if (S.sec === 'topics') renderTopicsMenu(); };
$('#mLong').onchange = e => { S.long = e.target.checked; renderAll(); };
$('#mFold').onclick = () => { const o = $('#mockCtl').classList.toggle('open'); $('#mFold').setAttribute('aria-expanded', String(o)); $('#mFold').textContent = o ? 'Mockup ▴' : 'Mockup ▾'; relayout(); };

/* fixed-size frames: scale to fit the stage, placed from the top-left corner (never cut off) */
const SIZES = { desktop: [1280, 800], portrait: [375, 667], landscape: [667, 375] };
function relayout() {
    const sz = SIZES[S.device];
    if (sz) {
        const W = stage.clientWidth, H = stage.clientHeight, pad = W < 500 ? 12 : 32;
        const s = Math.min(1, (W - pad) / sz[0], (H - pad) / sz[1]);
        device.style.transform = 'translate(' + Math.round((W - sz[0] * s) / 2) + 'px,' + Math.round((H - sz[1] * s) / 2) + 'px) scale(' + s.toFixed(4) + ')';
    } else device.style.transform = '';
    requestAnimationFrame(() => { if (S.state === 'revealed') { const deck = deckCards(); placePointer(summarize(players().map(p => p.key), deck), deck); } });
}
new ResizeObserver(relayout).observe(stage);
new ResizeObserver(() => requestAnimationFrame(() => { if (S.state === 'revealed') { const deck = deckCards(); placePointer(summarize(players().map(p => p.key), deck), deck); } })).observe(app);

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
    const q = new URLSearchParams(location.search); /* deep links for screenshots: ?theme=console&mode=light&device=portrait&state=voting&menu=board */
    if (q.get('theme')) S.theme = q.get('theme');
    if (q.get('mode')) S.mode = q.get('mode');
    if (q.get('device')) S.device = q.get('device');
    if (q.get('state')) S.state = q.get('state');
    if (q.get('result')) S.result = q.get('result');
    if (q.get('players')) S.n = Math.max(1, Math.min(21, +q.get('players') || 7));
    if (q.get('long')) S.long = true;
    if (q.get('backlog') === '0') S.backlog = false;
    app.dataset.theme = S.theme; app.dataset.state = S.state; app.classList.toggle('light', S.mode === 'light');
    app.toggleAttribute('data-pointer', true); stage.dataset.device = S.device;
    $('#mPlayers').value = S.n; $('#mPlayersOut').textContent = S.n; $('#mResult').value = S.result;
    $('#mTopics').checked = S.backlog; $('#mLong').checked = S.long;
    fetch('../../cards.json').then(r => r.json()).then(d => {
        CARDS = d.cards.slice().sort((a, b) => a.sort_order - b.sort_order);
        PRESETS = d.presets;
        seedTopics(); syncControls(); renderAll(); drawTime(); relayout();
        if (q.get('menu')) openMenu(q.get('menu'));
    }).catch(() => { $('#table').textContent = 'Could not load ../../cards.json – open the mockup via a web server.'; });
})();
