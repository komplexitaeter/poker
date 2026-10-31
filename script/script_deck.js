/* R3 F5 (B-98): the deck menu (Board settings -> Deck), mock-up "Deck menu R3", variant C.
 * Overview: the deck as small cards, the card set ("change" opens the list of sets), the variant (Fibonacci:
 * Classic / Short / True), the cards of the set to switch off or on, and the control cards (☕ ? ! ✋, per team,
 * with every set). The list: every set group with a fan of its cards.
 * Data: card_catalog.json (gCatalogV2, gCardByKey in script.js) and the deck of dao ({id, group, cards, controls,
 * rev}). Every change is written at once (api/update_deck.php, api/update_controls.php, apiWrite()); the menu shows
 * it right away (a local copy of the deck) and takes the server's deck again when its rev changes.
 * While cards are down a note says that a new deck starts a new round (the server starts it in the same request).
 * Own sets (editor) come later (R3 S4/F6). Only createElement / textContent; keys in URLs encoded. */

const DECK_MIN_CARDS = 2; // a deck keeps at least two cards of its set

/* a short line per set group where the catalog has none */
const DECK_GROUP_NOTES = {
    fib: 'Planning poker, the classic', numbers: 'Plain scale', tshirt: 'Rough sizing', traffic: 'Quick check',
    emotions: 'Team mood', stars: 'Rate it', judge: 'Decide together', delegation: 'Who decides? Seven levels',
};

const gDeckMenu = {
    view: 'main',     // 'main' (overview) | 'pick' (list of sets)
    json: null,       // the last board state
    deck: null,       // the deck as shown: the server's, with own changes on top until the server has them
    serverRev: null,  // rev of the server's deck the local copy is based on
    sig: null,        // what the menu was last built from
    status: '',
    statusTimer: 0,
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

/* the cards that can be switched in the overview: the variant's, plus cards of the group that are in the deck
 * (migrated decks), in the group's order */
function deckToggleKeys(group, variant, deck) {
    const wanted = new Set(variant.cards.concat(deck.cards));
    return group.cards.map(entry => entry.card_key).filter(key => wanted.has(key));
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
    const note = dmEl('p', 'hint warn dm-round', 'Cards are down · changing the deck starts a new round.');
    note.id = 'deck_round_hint';
    note.setAttribute('role', 'note');
    return note;
}

function dmStatus() {
    const status = dmEl('p', 'dm-status', gDeckMenu.status ? '> ' + gDeckMenu.status : '');
    status.id = 'deck_status';
    status.setAttribute('role', 'status');
    return status;
}

function deckSetName(group, variant) {
    return group.name + (group.variants.length > 1 ? ' · ' + variant.name : '');
}

/* ------------------------------------------------------------------ views */

function deckMainView(deck, group, variant) {
    const parts = [];

    // the deck as it is now
    const preview = dmEl('section', 'dm-pv');
    preview.setAttribute('aria-label', 'Your deck');
    const cards = deck.cards.concat(deck.controls).map(key => gCardByKey.get(key)).filter(card => card !== undefined);
    const head = dmEl('p', 'dm-pv-h');
    head.append(dmEl('span', 'cm', '> '), 'deck ', dmEl('b', null, deckSetName(group, variant)),
        dmEl('span', 'dm-cnt', ' · ' + cards.length + ' cards'));
    const row = dmEl('div', 'dm-pv-row');
    row.setAttribute('role', 'img');
    row.setAttribute('aria-label', 'Cards: ' + cards.map(card => cardAriaLabel(card, false)).join(', '));
    cards.forEach(card => row.appendChild(dmCard(card, false)));
    preview.append(head, row);
    parts.push(preview);

    const note = dmRoundNote();
    if (note !== null) parts.push(note);

    // the card set, "change" opens the list
    const change = dmEl('button', 'dm-setbtn');
    change.type = 'button';
    change.id = 'deck_change';
    change.setAttribute('data-f', 'change');
    const title = dmEl('span', 'dm-t');
    title.append(dmEl('small', null, 'Card set'), dmEl('b', null, group.name));
    change.append(title, dmFan(variant.cards), dmEl('span', 'cm', 'change'), dmIcon('next'));
    change.setAttribute('aria-label', 'Card set: ' + group.name + '. Change');
    change.addEventListener('click', () => showDeckView('pick'));
    parts.push(change);

    // the variant (Fibonacci)
    if (group.variants.length > 1) {
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
            input.checked = v.id === variant.id;
            input.setAttribute('data-f', 'variant:' + v.id);
            input.addEventListener('change', () => pickDeckVariant(group, v));
            label.append(input, dmEl('span', null, v.name));
            seg.appendChild(label);
        });
        const values = variant.cards.map(key => gCardByKey.get(key)).filter(card => card !== undefined)
            .map(card => card.text).join(' ');
        field.append(seg, dmEl('p', 'hint', values));
        parts.push(field);
    }

    // the cards of the set
    const on = new Set(deck.cards);
    const toggles = dmEl('fieldset', 'f');
    toggles.id = 'deck_cards';
    toggles.appendChild(dmEl('legend', 'lab', 'Cards (tap to switch off or on)'));
    const grid = dmEl('div', 'dm-tgs');
    deckToggleKeys(group, variant, deck).forEach(key => {
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
    parts.push(toggles);

    // the control cards (per team)
    const controls = dmEl('fieldset', 'f');
    controls.id = 'deck_controls';
    controls.appendChild(dmEl('legend', 'lab', 'Control cards · for this team, with every set'));
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
    controls.append(ctlGrid, dmEl('p', 'hint', 'Need a break, question, important, veto: no value, not in the spread. They stay when you switch sets.'));
    parts.push(controls);

    parts.push(dmStatus());
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
    parts.push(dmStatus());
    return parts;
}

/* ------------------------------------------------------------------ render */

/* builds the menu when what it shows changed; the focus stays on the same control */
function renderDeckMenu(force = false) {
    const box = document.getElementById('deck_menu');
    if (box === null) return;
    const deck = gDeckMenu.deck;
    const sig = JSON.stringify([gDeckMenu.view, deck, deckRoundRunning()]);
    if (!force && sig === gDeckMenu.sig) return;
    gDeckMenu.sig = sig;

    const focused = document.activeElement;
    const focusKey = focused instanceof Element && box.contains(focused) ? focused.getAttribute('data-f') : null;

    const group = deck ? deckMenuGroup(deck.group) : undefined;
    if (!deck || group === undefined) {
        box.replaceChildren(dmEl('p', 'hint', 'The deck cannot be changed right now. Please reload the page later.'));
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
    renderDeckMenu(true);
}

function showDeckView(view) {
    gDeckMenu.view = view;
    renderDeckMenu(true);
    const target = document.getElementById(view === 'pick' ? 'deck_pick_title' : 'deck_change');
    if (target !== null) target.focus();
}

function setDeckStatus(text) {
    gDeckMenu.status = text;
    const status = document.getElementById('deck_status');
    if (status !== null) status.textContent = text ? '> ' + text : '';
    clearTimeout(gDeckMenu.statusTimer);
    if (text) gDeckMenu.statusTimer = setTimeout(() => setDeckStatus(''), 5000);
}

/* ------------------------------------------------------------------ writes */

/* a write of the menu; the local copy shows it at once, the next board state from the server wins */
function writeDeck(url, local) {
    gDeckMenu.deck = local;
    renderDeckMenu();
    setDeckStatus('');
    apiWrite(url, {}, null).then(response => {
        if (response === null || !response.ok) {
            gDeckMenu.serverRev = null; // take the server's deck again with the next board state
            setDeckStatus('not saved · please try again');
            return;
        }
        response.json().then(answer => {
            setDeckStatus(answer && answer.new_round ? 'deck changed · a new round started for everyone'
                : 'saved · everyone sees the new deck now');
        }).catch(() => setDeckStatus('saved'));
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
        { id: variant.id, group: group.id, cards: variant.cards.slice(), controls: deck.controls.slice() });
    showDeckView('main');
}

function pickDeckVariant(group, variant) {
    const deck = gDeckMenu.deck;
    if (deck === null || deck.id === variant.id) return;
    writeDeck(deckUrl(variant.id, null),
        { id: variant.id, group: group.id, cards: variant.cards.slice(), controls: deck.controls.slice() });
}

function toggleDeckCard(group, variant, key) {
    const deck = gDeckMenu.deck;
    if (deck === null) return;
    const on = new Set(deck.cards);
    if (on.has(key)) {
        if (on.size <= DECK_MIN_CARDS) {
            setDeckStatus('a deck needs at least two cards of its set');
            return;
        }
        on.delete(key);
    } else {
        on.add(key);
    }
    const cards = group.cards.map(entry => entry.card_key).filter(k => on.has(k));
    writeDeck(deckUrl(variant.id, cards), { id: variant.id, group: group.id, cards, controls: deck.controls.slice() });
}

function toggleDeckControl(key) {
    const deck = gDeckMenu.deck;
    if (deck === null) return;
    const on = new Set(deck.controls);
    if (on.has(key)) on.delete(key); else on.add(key);
    const controls = deckMenuControls().map(card => card.key).filter(k => on.has(k));
    writeDeck('./api/update_controls.php?t=' + encodeURIComponent(t) + '&controls=' + controls.map(encodeURIComponent).join(','),
        { id: deck.id, group: deck.group, cards: deck.cards.slice(), controls });
}
