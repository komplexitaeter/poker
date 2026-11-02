/* R3 F5 (B-98): the deck menu (Board settings -> Deck), mock-up "Deck menu R3", variant C.
 * Overview: the deck as small cards, the card set ("Change" opens the list of sets), the variant (Fibonacci:
 * Classic / Short / Pure Fibonacci, only a preset: it switches its cards on and the others off), every card of the set to
 * switch off or on (a selection that matches no variant is "custom"), and the control cards (☕ ? ! ✋, per team,
 * with every set). The list: every set group with a fan of its cards.
 * The variant is saved on click, Space or Enter only; arrow keys just move the choice (Sina, PR #113).
 * Data: card_catalog.json (gCatalogV2, gCardByKey in script.js) and the deck of dao ({id, group, cards, controls,
 * rev}). Every change is written at once (api/update_deck.php, api/update_controls.php, apiWrite()); the menu shows
 * it right away (a local copy of the deck) and takes the server's deck again when its rev changes.
 * While cards are down a note says that a new deck starts a new round (the server starts it in the same request).
 * Own sets (editor) come later (R3 S4/F6). Only createElement / textContent; keys in URLs encoded. */

const DECK_MIN_CARDS = 2; // a deck keeps at least two cards of its set

/* a short line per set group where the catalog has none: what the set is for (R3 review V10, L40) */
const DECK_GROUP_NOTES = {
    fib: 'Estimate effort in story points',
    numbers: 'Simple scale, e.g. confidence or value',
    tshirt: 'Rough sizing for big items',
    traffic: 'Quick go / no-go check',
    emotions: 'How does the team feel? For retros and check-ins',
    stars: 'Rate something from 0 to 5',
    judge: 'Make a team decision by consent',
    delegation: 'Who decides? 7 levels of delegation',
};

const gDeckMenu = {
    view: 'main',     // 'main' (overview) | 'pick' (list of sets)
    json: null,       // the last board state
    deck: null,       // the deck as shown: the server's, with own changes on top until the server has them
    serverRev: null,  // rev of the server's deck the local copy is based on
    sig: null,        // what the menu was last built from
    variantKeyMove: false, // the next change of the variant radios comes from an arrow key
    refusal: null,    // R3 review V1: a refused toggle, shown below the cards until fixed or dismissed ({ key, text })
};

function deckMenuGroups() {
    const groups = gCatalogV2 && Array.isArray(gCatalogV2.groups) ? gCatalogV2.groups : [];
    return groups.filter(group => group && typeof group.id === 'string' && Array.isArray(group.variants)
        && group.variants.length > 0 && Array.isArray(group.cards));
}

function deckMenuControls() {
    const controls = gCatalogV2 && Array.isArray(gCatalogV2.controls) ? gCatalogV2.controls : [];
    return controls.map(entry => gCardByKey.get(entry.card_key)).filter(card => card !== undefined);
}

function deckMenuGroup(id) {
    return deckMenuGroups().find(group => group.id === id);
}

function deckMenuVariant(group, id) {
    return group.variants.find(variant => variant.id === id) || group.variants[0];
}

/* every card of the group in catalog order (sort_order): the variant is only a preset, any card can be switched on */
function deckGroupKeys(group) {
    return group.cards.map((entry, index) => ({ entry, index }))
        .sort((a, b) => (Number(a.entry.sort_order) || 0) - (Number(b.entry.sort_order) || 0) || a.index - b.index)
        .map(item => item.entry.card_key);
}

/* the variant whose cards are exactly the deck's cards, or null (a custom selection) */
function deckMatchingVariant(group, cards) {
    const on = new Set(cards);
    return group.variants.find(v => v.cards.length === on.size && v.cards.every(key => on.has(key))) || null;
}

/* B-107: the values of cards for the variant hint, separated by spaces: plain text where the card is shown as text
 * small (0 1 2 3 …), a mini symbol for drawings (the faces of "Mood" and "Team Assessment": never a system emoji) */
function deckValueParts(keys) {
    return keys.map(key => gCardByKey.get(key)).filter(card => card !== undefined)
        .flatMap((card, i) => [...(i > 0 ? [' '] : []), cardSmallKind(card) === 'text' ? String(card.text) : cardSmall(card)]);
}

/* a custom selection, told against its last chosen variant: "True + 100 ∞ − 0" (as parts, see deckValueParts) */
function deckCustomParts(variant, cards) {
    const on = new Set(cards);
    const base = new Set(variant.cards);
    const added = deckValueParts(cards.filter(key => !base.has(key)));
    const removed = deckValueParts(variant.cards.filter(key => !on.has(key)));
    return [variant.name, ...(added.length ? [' + ', ...added] : []), ...(removed.length ? [' \u2212 ', ...removed] : [])];
}

function deckRoundRunning() {
    return !!(gDeckMenu.json && gDeckMenu.json.one_ore_more_player_ready);
}

/* ------------------------------------------------------------------ building blocks */

function dmEl(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = text;
    return element;
}

function dmIcon(id, className) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'i' + (className ? ' ' + className : ''));
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-' + id);
    svg.appendChild(use);
    return svg;
}

/* a small rendered card (cards.js, deck level); texts: with its heading */
function dmCard(card, texts) {
    const wrap = dmEl('span', 'dm-card');
    wrap.appendChild(cardFace(card, 'deck', texts));
    return wrap;
}

/* the first cards of a set, slightly fanned */
function dmFan(keys) {
    const fan = dmEl('span', 'dm-fan');
    fan.setAttribute('aria-hidden', 'true');
    keys.slice(0, 4).forEach(key => {
        const card = gCardByKey.get(key);
        if (card !== undefined) fan.appendChild(dmCard(card, false));
    });
    return fan;
}

function dmRoundNote() {
    if (!deckRoundRunning()) return null;
    const note = dmEl('p', 'hint warn dm-round', 'Cards have been played \u2013 changing the card set starts a new round.');
    note.id = 'deck_round_hint';
    note.setAttribute('role', 'note');
    return note;
}

/* R3 review V1: a refused toggle, right below the cards (not a toast): stays until fixed or dismissed (×) */
function dmRefusal(refusal) {
    const box = dmEl('div', 'dm-refusal');
    box.id = 'deck_refusal';
    box.setAttribute('role', 'alert');
    const text = dmEl('p', null);
    text.append(dmEl('b', null, refusal.text), dmEl('small', null, refusal.help));
    const close = dmEl('button', 'icon-btn dm-refusal-x');
    close.type = 'button';
    close.setAttribute('data-f', 'refusal-x');
    close.setAttribute('aria-label', 'Dismiss');
    close.appendChild(dmIcon('x'));
    close.addEventListener('click', () => {
        gDeckMenu.refusal = null;
        renderDeckMenu(true);
        const toggle = document.querySelector('#deck_menu [data-f="card:' + CSS.escape(refusal.key) + '"]');
        if (toggle !== null) toggle.focus({ preventScroll: true });
    });
    box.append(text, close);
    return box;
}

/* ------------------------------------------------------------------ views */

function deckMainView(deck, group, variant) {
    const parts = [];

    const note = dmRoundNote();
    if (note !== null) parts.push(note);

    // the card set, "Change" opens the list
    const change = dmEl('button', 'dm-setbtn');
    change.type = 'button';
    change.id = 'deck_change';
    change.setAttribute('data-f', 'change');
    const title = dmEl('span', 'dm-t');
    title.append(dmEl('small', null, 'Card set'), dmEl('b', null, group.name));
    change.append(title, dmFan(variant.cards), dmEl('span', 'cm', 'Change'), dmIcon('next'));
    change.setAttribute('aria-label', 'Card set: ' + group.name + '. Change');
    change.addEventListener('click', () => showDeckView('pick'));
    parts.push(change);

    // the variant (Fibonacci)
    if (group.variants.length > 1) {
        const match = deckMatchingVariant(group, deck.cards);
        const field = dmEl('fieldset', 'f dm-variant');
        field.id = 'deck_variant';
        field.appendChild(dmEl('legend', 'lab', 'Variant'));
        const seg = dmEl('div', 'seg');
        group.variants.forEach(v => {
            const label = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = 'deck_variant';
            input.value = v.id;
            input.checked = match !== null && v.id === match.id;
            input.setAttribute('data-f', 'variant:' + v.id);
            // arrow keys only move the choice (no write, no new round per key); a click, Space or Enter saves it
            input.addEventListener('keydown', event => {
                if (event.key.startsWith('Arrow')) {
                    gDeckMenu.variantKeyMove = true;
                } else if (event.key === ' ' || event.key === 'Enter') {
                    event.preventDefault();
                    input.checked = true;
                    pickDeckVariant(group, v);
                }
            });
            input.addEventListener('pointerdown', () => { gDeckMenu.variantKeyMove = false; });
            input.addEventListener('change', () => {
                if (gDeckMenu.variantKeyMove) {
                    gDeckMenu.variantKeyMove = false;
                    return;
                }
                pickDeckVariant(group, v);
            });
            label.append(input, dmEl('span', null, v.name));
            seg.appendChild(label);
        });
        // the preset's values, or what differs from the last chosen variant
        const values = match !== null ? deckValueParts(match.cards) : ['Custom: ', ...deckCustomParts(variant, deck.cards)];
        const hint = dmEl('p', 'hint');
        hint.append(...values);
        hint.id = 'deck_variant_hint';
        field.append(seg, hint);
        parts.push(field);
    }

    // the cards of the set
    const on = new Set(deck.cards);
    const toggles = dmEl('fieldset', 'f');
    toggles.id = 'deck_cards';
    toggles.appendChild(dmEl('legend', 'lab', 'Cards in this set \u2013 ' + (gTouchQuery.matches ? 'tap' : 'click') + ' to turn on or off'));
    const grid = dmEl('div', 'dm-tgs');
    deckGroupKeys(group).forEach(key => {
        const card = gCardByKey.get(key);
        if (card === undefined) return;
        const button = dmEl('button', 'dm-tg');
        button.type = 'button';
        button.setAttribute('data-card', key);
        button.setAttribute('data-f', 'card:' + key);
        button.setAttribute('aria-pressed', on.has(key) ? 'true' : 'false');
        button.setAttribute('aria-label', cardAriaLabel(card, false));
        if (card.heading || card.info) button.title = card.heading || card.info;
        button.appendChild(dmCard(card, true));
        button.addEventListener('click', () => toggleDeckCard(group, variant, key));
        grid.appendChild(button);
    });
    toggles.appendChild(grid);
    if (gDeckMenu.refusal !== null) toggles.appendChild(dmRefusal(gDeckMenu.refusal));
    parts.push(toggles);

    // the control cards (per team)
    const controls = dmEl('fieldset', 'f');
    controls.id = 'deck_controls';
    controls.appendChild(dmEl('legend', 'lab', 'Special cards'));
    const ctlGrid = dmEl('div', 'dm-tgs');
    const ctlOn = new Set(deck.controls);
    deckMenuControls().forEach(card => {
        const button = dmEl('button', 'dm-tg');
        button.type = 'button';
        button.setAttribute('data-card', card.key);
        button.setAttribute('data-f', 'control:' + card.key);
        button.setAttribute('aria-pressed', ctlOn.has(card.key) ? 'true' : 'false');
        button.setAttribute('aria-label', card.heading || cardAriaLabel(card, false));
        if (card.info) button.title = card.info;
        button.appendChild(dmCard(card, false));
        button.addEventListener('click', () => toggleDeckControl(card.key));
        ctlGrid.appendChild(button);
    });
    controls.appendChild(ctlGrid);
    parts.push(controls);

    return parts;
}

function deckPickView(deck) {
    const parts = [];
    const back = dmEl('button', 'dm-back');
    back.type = 'button';
    back.id = 'deck_back';
    back.setAttribute('data-f', 'back');
    back.append(dmIcon('back'), 'Deck');
    back.addEventListener('click', () => showDeckView('main'));
    parts.push(back);

    const title = dmEl('h3', 'dm-sub', 'Choose a card set');
    title.id = 'deck_pick_title';
    title.tabIndex = -1;
    parts.push(title);

    const note = dmRoundNote();
    if (note !== null) parts.push(note);

    const list = dmEl('ul', 'dm-plist');
    list.setAttribute('aria-labelledby', 'deck_pick_title');
    deckMenuGroups().forEach(group => {
        const current = group.id === deck.group;
        const item = dmEl('li', 'dm-prow' + (current ? ' sel' : ''));
        const button = dmEl('button', 'dm-prow-b');
        button.type = 'button';
        button.setAttribute('data-group', group.id);
        button.setAttribute('data-f', 'group:' + group.id);
        if (current) button.setAttribute('aria-current', 'true');
        const text = dmEl('span', 'dm-t');
        const note = typeof group.description === 'string' && group.description !== ''
            ? group.description : DECK_GROUP_NOTES[group.id] || '';
        const variants = group.variants.length > 1 ? ' · ' + group.variants.map(v => v.name).join(', ') : '';
        text.append(dmEl('b', null, group.name), dmEl('small', null, note + variants));
        const keys = current ? deck.cards : group.variants[0].cards;
        const mark = current ? dmEl('span', 'dm-tick', '✓') : dmIcon('next');
        if (current) mark.setAttribute('aria-hidden', 'true');
        button.append(text, dmFan(keys), mark);
        button.addEventListener('click', () => pickDeckGroup(group));
        item.appendChild(button);
        list.appendChild(item);
    });
    parts.push(list);
    return parts;
}

/* ------------------------------------------------------------------ render */

/* builds the menu when what it shows changed; the focus stays on the same control */
function renderDeckMenu(force = false) {
    const box = document.getElementById('deck_menu');
    if (box === null) return;
    const deck = gDeckMenu.deck;
    // a refusal goes once it is fixed: the deck has more than the minimum again (also by someone else)
    if (gDeckMenu.refusal !== null && (deck === null || deck.cards.length > DECK_MIN_CARDS)) gDeckMenu.refusal = null;
    const sig = JSON.stringify([gDeckMenu.view, deck, deckRoundRunning(), gDeckMenu.refusal]);
    if (!force && sig === gDeckMenu.sig) return;
    gDeckMenu.sig = sig;

    const focused = document.activeElement;
    const focusKey = focused instanceof Element && box.contains(focused) ? focused.getAttribute('data-f') : null;

    const group = deck ? deckMenuGroup(deck.group) : undefined;
    if (!deck || group === undefined) {
        box.replaceChildren(dmEl('p', 'hint', 'Card sets can\'t be loaded right now. Please reload the page in a moment.'));
        return;
    }
    const variant = deckMenuVariant(group, deck.id);
    box.replaceChildren(...(gDeckMenu.view === 'pick' ? deckPickView(deck) : deckMainView(deck, group, variant)));

    if (focusKey !== null) {
        const again = box.querySelector('[data-f="' + CSS.escape(focusKey) + '"]');
        if (again !== null) again.focus({ preventScroll: true });
    }
}

/* called with every board state (updateDom); takes the server's deck when it changed */
function updateDeckMenu(json) {
    gDeckMenu.json = json;
    const deck = json && json.deck && typeof json.deck === 'object' && Array.isArray(json.deck.cards) ? json.deck : null;
    if (deck === null) {
        gDeckMenu.deck = null;
        gDeckMenu.serverRev = null;
    } else if (deck.rev !== gDeckMenu.serverRev || gDeckMenu.deck === null) {
        gDeckMenu.serverRev = deck.rev;
        gDeckMenu.deck = { id: deck.id, group: deck.group, cards: deck.cards.slice(),
            controls: Array.isArray(deck.controls) ? deck.controls.slice() : [] };
    }
    renderDeckMenu();
}

/* the menu opens at its overview (prepareMenuSection) */
function resetDeckMenu() {
    gDeckMenu.view = 'main';
    gDeckMenu.refusal = null;
    setDeckStatus(null);
    renderDeckMenu(true);
}

function showDeckView(view) {
    gDeckMenu.view = view;
    renderDeckMenu(true);
    const target = document.getElementById(view === 'pick' ? 'deck_pick_title' : 'deck_change');
    if (target !== null) target.focus();
}

/* ------------------------------------------------------------------ writes */

/* B-99 (F7, Andreas): the result of a change; R3 review V1: in a status line at the top of the deck menu (#deck_status)
 * instead of a toast. It stays until the next change or until the menu opens again; an error gets a close button. */
const DECK_DONE = { set: 'Card set changed for everyone', variant: 'Cards changed for everyone',
    card: 'Cards changed for everyone', control: 'Cards changed for everyone' };

/* status: null (none) | { text, error } */
function setDeckStatus(status) {
    const line = document.getElementById('deck_status');
    if (line === null) return;
    const close = line.querySelector('.dm-status-x');
    // the line hides itself while empty (CSS); screen readers hear it from a live region that is always there
    line.classList.toggle('is-error', status !== null && status.error);
    close.hidden = status === null || !status.error;
    close.onclick = () => setDeckStatus(null);
    line.querySelector('.dm-status-t').textContent = status === null ? '' : (status.error ? '! ' : '\u2713 ') + status.text;
    const live = document.getElementById('deck_status_live');
    if (live !== null) live.textContent = status === null ? '' : status.text;
}

/* a write of the menu; the local copy shows it at once, the next board state from the server wins.
 * kind: 'set' | 'variant' | 'card' | 'control' (the text of the status line) */
function writeDeck(url, local, kind) {
    gDeckMenu.deck = local;
    gDeckMenu.refusal = null;
    renderDeckMenu();
    const done = DECK_DONE[kind] || 'Saved';
    setDeckStatus(null);
    apiWrite(url, {}, null).then(response => {
        if (response === null || !response.ok) {
            gDeckMenu.serverRev = null; // take the server's deck again with the next board state
            setDeckStatus({ text: 'Not saved – please try again', error: true });
            return;
        }
        response.json().then(answer => {
            setDeckStatus({ text: done + (answer && answer.new_round ? ' \u2013 new round started' : ''), error: false });
        }).catch(() => setDeckStatus({ text: done, error: false }));
    });
}

function deckUrl(variantId, cards) {
    let url = './api/update_deck.php?t=' + encodeURIComponent(t) + '&deck=' + encodeURIComponent(variantId);
    if (cards !== null) url += '&cards=' + cards.map(encodeURIComponent).join(',');
    return url;
}

function pickDeckGroup(group) {
    const deck = gDeckMenu.deck;
    gDeckMenu.view = 'main';
    if (deck === null || group.id === deck.group) {
        showDeckView('main');
        return;
    }
    const variant = group.variants[0];
    writeDeck(deckUrl(variant.id, null),
        { id: variant.id, group: group.id, cards: variant.cards.slice(), controls: deck.controls.slice() }, 'set');
    showDeckView('main');
}

function pickDeckVariant(group, variant) {
    const deck = gDeckMenu.deck;
    if (deck === null) return;
    // a click on the variant again sets its cards again (after own changes)
    const match = deckMatchingVariant(group, deck.cards);
    if (deck.id === variant.id && match !== null && match.id === variant.id) return;
    writeDeck(deckUrl(variant.id, null),
        { id: variant.id, group: group.id, cards: variant.cards.slice(), controls: deck.controls.slice() }, 'variant');
}

function toggleDeckCard(group, variant, key) {
    const deck = gDeckMenu.deck;
    if (deck === null) return;
    const on = new Set(deck.cards);
    if (on.has(key)) {
        if (on.size <= DECK_MIN_CARDS) {
            // R3 review V1: the refusal shows right below the cards, the toggle shakes once
            gDeckMenu.refusal = { key, text: 'A card set needs at least two cards.', help: 'Switch another card on first.' };
            setDeckStatus(null); // one message at a time: the refusal
            renderDeckMenu(true);
            const toggle = document.querySelector('#deck_menu [data-f="card:' + CSS.escape(key) + '"]');
            if (toggle !== null) toggle.classList.add('is-refused');
            return;
        }
        on.delete(key);
    } else {
        on.add(key);
    }
    const cards = deckGroupKeys(group).filter(k => on.has(k));
    // a selection that is exactly a variant becomes that variant, else it stays with the last chosen one
    const match = deckMatchingVariant(group, cards);
    const id = match !== null ? match.id : variant.id;
    writeDeck(deckUrl(id, cards), { id, group: group.id, cards, controls: deck.controls.slice() }, 'card');
}

function toggleDeckControl(key) {
    const deck = gDeckMenu.deck;
    if (deck === null) return;
    const on = new Set(deck.controls);
    if (on.has(key)) on.delete(key); else on.add(key);
    const controls = deckMenuControls().map(card => card.key).filter(k => on.has(k));
    writeDeck('./api/update_controls.php?t=' + encodeURIComponent(t) + '&controls=' + controls.map(encodeURIComponent).join(','),
        { id: deck.id, group: deck.group, cards: deck.cards.slice(), controls }, 'control');
}
