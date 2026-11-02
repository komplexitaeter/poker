/* B-98 S5: the editor of an own card set (Version 1, Andreas: "bloß nicht zu komplex"). A full-screen <dialog>
 * (#cs_editor, showModal: top layer above the menu, focus stays inside), opened from the deck menu (script_deck.js):
 * the pen of a set, "Edit set" or "+ New set".
 * - Top bar: title, Cancel, Save ("Save and start new round" when cards are down and the cards of the set in play
 *   change). Esc = Cancel; unsaved changes ask first. The focus goes back to the opener.
 * - Name (24), the cards in order (select, "+ Add card" up to 16 - a bigger migrated set keeps its size but does not
 *   grow -, remove down to 2, move with < >), per card: symbol (card_catalog.json custom_symbols, by category) or text
 *   (1-6 characters, no emoji), value (default from custom_symbol_values, may be empty, decimals) and colour
 *   (custom_colors). Style is always plain; heading / description of a card are kept as long as its symbol / text
 *   stays (not editable here).
 * - Save: api/custom_set_create.php (activate: the new set is in play) or api/custom_set_save.php with rev; a 409
 *   (someone else saved meanwhile) is saved again with force (the last one wins). Delete: api/custom_set_delete.php
 *   after a short question. Errors at the field (name, text, value) or at the card (index of the API).
 * Only createElement / textContent / setAttribute (name and texts are free text); requests as JSON body. */

const CS_TEXT_MAX = 6;
const CS_NAME_MAX = 24;
const CS_MIN_CARDS = 2;

/* symbol categories of the picker (by symbol id) */
const CS_CATEGORIES = [
    { id: 'numbers', name: 'Numbers' },
    { id: 'sizes', name: 'Sizes' },
    { id: 'faces', name: 'Faces' },
    { id: 'lights', name: 'Lights' },
    { id: 'stars', name: 'Stars' },
];

/* the messages of the API error codes (api/lib_custom.php) */
const CS_ERRORS = {
    name: 'Give the set a name.',
    text: 'Up to 6 letters, digits or signs – no emoji.',
    symbol: 'Choose a symbol.',
    symbol_or_text: 'Choose a symbol or enter a text.',
    numeric_value: 'Enter a number (or leave it empty).',
    color: 'Choose a colour.',
    too_many_cards: 'Too many cards in this set.',
    no_cards: 'A set needs at least two cards.',
    set_limit: 'Your team has the maximum number of sets already.',
    not_found: 'This set has been deleted meanwhile.',
};

const gCs = {
    dialog: null,
    set: null,        // the set as loaded (null: a new set)
    name: '',
    cards: [],        // { key, mode: 'symbol'|'text', symbol, text, value (string), color, colorSet, heading, description, orig }
    sel: 0,
    cat: 'numbers',
    maxCards: 16,
    start: '',        // signature of the state when opened (unsaved changes)
    errors: {},       // { name, text, value, card: index, general }
    opener: null,     // data-f of the element that opened the editor (focus back)
    busy: false,
    ask: null,        // the open question: 'discard' | 'delete' | null
};

function csCatalog() {
    return gCatalogV2 && typeof gCatalogV2 === 'object' ? gCatalogV2 : {};
}

function csSymbols() {
    const list = csCatalog().custom_symbols;
    return Array.isArray(list) ? list.filter(id => typeof id === 'string' && CARD_SYMBOLS.has(id)) : [];
}

function csColors() {
    const list = csCatalog().custom_colors;
    return Array.isArray(list) ? list.filter(id => typeof id === 'string' && CARD_COLORS.has(id)) : ['grey'];
}

/* the default value of a symbol (card_catalog.json custom_symbol_values) as text for the field, '' for none */
function csSymbolValue(symbol) {
    const map = csCatalog().custom_symbol_values || {};
    const value = map[symbol];
    return typeof value === 'number' && isFinite(value) ? String(value) : '';
}

/* the catalog entry of the first card with this symbol ({value, color}) or null */
function csCatalogEntry(symbol) {
    const groups = Array.isArray(csCatalog().groups) ? csCatalog().groups : [];
    for (const group of groups) {
        for (const entry of (Array.isArray(group.cards) ? group.cards : [])) {
            if (entry && entry.symbol === symbol) return { entry, group };
        }
    }
    return null;
}

/* the value a symbol shows as text (api/lib_custom.php catalog_symbol_values: '3', '∞', '🙂') */
function csSymbolText(symbol) {
    const found = csCatalogEntry(symbol);
    return found && typeof found.entry.value === 'string' ? found.entry.value : '';
}

function csCategory(symbol) {
    if (symbol.startsWith('s-face-')) return 'faces';
    if (symbol.startsWith('s-stars-')) return 'stars';
    if (symbol.startsWith('s-light-')) return 'lights';
    if (/^s-(x*s|m|x*l)$/.test(symbol)) return 'sizes';
    return 'numbers';
}

/* a colour token as [r, g, b] from the theme (style/cards.css --c-<token>), null if unknown */
function csRgb(token) {
    const raw = getComputedStyle(document.body).getPropertyValue('--c-' + token).trim();
    let m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(raw);
    if (m !== null) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
    m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(raw);
    return m !== null ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/* the default colour of a symbol: the palette colour nearest to its catalog colour, else the first of the palette */
function csSymbolColor(symbol) {
    const palette = csColors();
    const found = csCatalogEntry(symbol);
    const token = found ? cardLook({ symbol, text: found.entry.value, color: found.entry.color || null,
        group: found.group.id }).color : null;
    const rgb = token !== null ? csRgb(token) : null;
    if (rgb === null) return palette[0];
    let best = palette[0];
    let bestDistance = Infinity;
    palette.forEach(color => {
        const other = csRgb(color);
        if (other === null) return;
        const distance = (rgb[0] - other[0]) ** 2 + (rgb[1] - other[1]) ** 2 + (rgb[2] - other[2]) ** 2;
        if (distance < bestDistance) {
            best = color;
            bestDistance = distance;
        }
    });
    return best;
}

/* a text of a card: 1 to 6 characters, no emoji (as is_custom_value_text() in api/lib_custom.php) */
function csTextOk(text) {
    const length = [...text].length;
    return length >= 1 && length <= CS_TEXT_MAX
        && !/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE00}-\u{FE0F}\u{20E3}\p{Cc}\p{Cf}\p{Co}\p{Cs}]/u.test(text);
}

/* the value field as a number: '' -> null, '1,5' -> 1.5, undefined if it is no number */
function csNumber(value) {
    const text = String(value).trim().replace(',', '.');
    if (text === '') return null;
    if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(text)) return undefined;
    const number = Number(text);
    return isFinite(number) && Math.abs(number) <= 99999999 ? number : undefined;
}

/* an editor card from a stored card (dao custom_sets[].cards) */
function csFromStored(card) {
    const symbol = typeof card.symbol === 'string' && card.symbol !== '' ? card.symbol : null;
    return {
        key: card.card_key,
        mode: symbol !== null ? 'symbol' : 'text',
        symbol: symbol !== null ? symbol : 's-1',
        text: symbol === null ? String(card.value || '') : '',
        value: typeof card.numeric_value === 'number' ? String(card.numeric_value) : '',
        color: typeof card.color === 'string' ? card.color : csColors()[0],
        colorSet: true,
        heading: card.heading || null,
        description: card.description || null,
        orig: { symbol, text: symbol === null ? String(card.value || '') : null },
    };
}

function csNewCard(symbol) {
    return { key: null, mode: 'symbol', symbol, text: '', value: csSymbolValue(symbol), color: csSymbolColor(symbol),
        colorSet: false, heading: null, description: null, orig: null };
}

/* the card as the board would show it (cards.js), for the tiles and the preview */
function csCardModel(card, index) {
    const symbol = card.mode === 'symbol';
    const number = csNumber(card.value);
    return cardFromCustom({
        card_key: 'cs-edit-' + index,
        symbol: symbol ? card.symbol : null,
        value: symbol ? csSymbolText(card.symbol) : (card.text.trim() || '?'),
        numeric_value: typeof number === 'number' ? number : null,
        color: card.color,
        infinite: symbol && card.symbol === 's-inf',
    });
}

/* the card of a request (custom_set_create.php / custom_set_save.php) */
function csRequestCard(card) {
    const symbol = card.mode === 'symbol';
    const same = card.orig !== null && (symbol ? card.orig.symbol === card.symbol : card.orig.text === card.text.trim());
    const number = csNumber(card.value);
    return {
        key: card.key,
        symbol: symbol ? card.symbol : null,
        text: symbol ? null : card.text.trim(),
        // heading and description stay with the card while its symbol / text stays (not editable here)
        heading: same ? card.heading : null,
        description: same ? card.description : null,
        numeric_value: typeof number === 'number' ? number : null,
        color: card.color,
    };
}

function csSignature() {
    return JSON.stringify([gCs.name.trim(), gCs.cards.map(csRequestCard)]);
}

function csDirty() {
    return csSignature() !== gCs.start;
}

/* the set is in play, cards are down and its cards change (not just their order or the name): a new round starts */
function csStartsRound() {
    if (!deckRoundRunning()) return false;
    if (gCs.set === null) return true; // a new set is put in play
    if (gDeckMenu.deck === null || gDeckMenu.deck.id !== gCs.set.deck_id) return false;
    const now = gCs.cards.map(csRequestCard).map(card => card.key !== null && !csCardChanged(card) ? card.key : '+').sort();
    const before = gCs.set.cards.map(card => card.card_key).sort();
    return JSON.stringify(now) !== JSON.stringify(before);
}

/* a request card differs from the stored card with its key */
function csCardChanged(request) {
    const stored = gCs.set.cards.find(card => card.card_key === request.key);
    if (!stored) return true;
    const symbol = typeof stored.symbol === 'string' && stored.symbol !== '' ? stored.symbol : null;
    const value = typeof stored.numeric_value === 'number' ? stored.numeric_value : null;
    return request.symbol !== symbol || (symbol === null && request.text !== stored.value)
        || request.numeric_value !== value || request.color !== stored.color;
}

/* ------------------------------------------------------------------ open / close */

function csDialog() {
    if (gCs.dialog !== null) return gCs.dialog;
    const dialog = document.createElement('dialog');
    dialog.id = 'cs_editor';
    dialog.className = 'cs-ovl';
    dialog.setAttribute('aria-labelledby', 'cs_title');
    // Esc: Cancel (asks first with unsaved changes); preventDefault keeps the dialog open
    dialog.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        if (gCs.ask !== null) csCloseQuestion();
        else csCancel();
    });
    dialog.addEventListener('cancel', event => {
        event.preventDefault();
        if (gCs.ask === null) csCancel();
    });
    document.body.appendChild(dialog);
    gCs.dialog = dialog;
    return dialog;
}

/* set: an own set (dao custom_sets) or null for a new one; opener: the button (gets the focus back) */
function openCustomEditor(set, opener) {
    gCs.set = set;
    gCs.name = set ? set.name : '';
    gCs.cards = set ? set.cards.map(csFromStored) : [csNewCard('s-1'), csNewCard('s-2')];
    gCs.sel = 0;
    gCs.maxCards = Math.max(gDeckMenu.limits.cards || 16, set ? set.cards.length : 0);
    gCs.errors = {};
    gCs.busy = false;
    gCs.ask = null;
    gCs.opener = opener ? opener.getAttribute('data-f') : null;
    gCs.cat = gCs.cards[0].mode === 'symbol' ? csCategory(gCs.cards[0].symbol) : 'numbers';
    gCs.start = csSignature();
    const dialog = csDialog();
    csRender();
    if (!dialog.open) dialog.showModal();
    const first = set ? dialog.querySelector('[data-f="tile:0"]') : document.getElementById('cs_name');
    if (first !== null) first.focus();
}

function csClose() {
    const dialog = gCs.dialog;
    if (dialog === null || !dialog.open) return;
    dialog.close();
    gCs.ask = null;
    // back to the opener (the menu may have been built anew meanwhile), else to the card set
    let target = gCs.opener !== null
        ? document.querySelector('#deck_menu [data-f="' + CSS.escape(gCs.opener) + '"]') : null;
    if (target === null || target.disabled) target = document.getElementById('deck_change') || document.getElementById('deck_pick_title');
    if (target !== null) target.focus();
}

function csCancel() {
    if (gCs.busy) return;
    if (csDirty()) csAsk('discard');
    else csClose();
}

/* ------------------------------------------------------------------ render */

function csEl(tag, className, text) {
    return dmEl(tag, className, text);
}

function csButton(className, text, field, onClick) {
    const button = csEl('button', className, text);
    button.type = 'button';
    if (field) button.setAttribute('data-f', field);
    button.addEventListener('click', onClick);
    return button;
}

/* builds the whole editor; the focus stays on the same control (data-f) */
function csRender() {
    const dialog = csDialog();
    const focused = document.activeElement;
    const focusKey = focused instanceof Element && dialog.contains(focused) ? focused.getAttribute('data-f') : null;

    const top = csEl('div', 'cs-top');
    const title = csEl('h2', null, gCs.set ? 'Edit set' : 'New set');
    title.id = 'cs_title';
    const state = csEl('span', 'cs-dirty');
    state.id = 'cs_state';
    state.setAttribute('role', 'status');
    const cancel = csButton('btn-box', 'Cancel', 'cancel', csCancel);
    cancel.id = 'cs_cancel';
    const save = csButton('btn-box primary', '', 'save', csSave);
    save.id = 'cs_save';
    top.append(title, state, cancel, save);

    const body = csEl('div', 'cs-body');
    const left = csEl('div', 'cs-col cs-left');
    left.append(csNameField(), csCardsField());
    const right = csEl('div', 'cs-col cs-detail');
    right.id = 'cs_detail';
    body.append(left, right, csDeleteRow());

    const ask = csEl('div', 'cs-scrim');
    ask.id = 'cs_ask';
    ask.hidden = true;

    dialog.replaceChildren(top, body, ask);
    csRenderDetail();
    csRenderTop();
    if (gCs.ask !== null) csAsk(gCs.ask);

    if (focusKey !== null) {
        const again = dialog.querySelector('[data-f="' + CSS.escape(focusKey) + '"]');
        if (again !== null) again.focus({ preventScroll: true });
    }
}

/* the top bar: Save label, unsaved / error state */
function csRenderTop() {
    const save = document.getElementById('cs_save');
    const state = document.getElementById('cs_state');
    if (save === null || state === null) return;
    save.textContent = gCs.busy ? 'Saving…' : csStartsRound() ? 'Save and start new round' : 'Save';
    save.disabled = gCs.busy;
    document.getElementById('cs_cancel').disabled = gCs.busy;
    const errors = ['name', 'text', 'value', 'general'].filter(key => gCs.errors[key]).length;
    state.classList.toggle('bad', errors > 0);
    state.textContent = errors > 0 ? (gCs.errors.general || 'Please check the marked fields.')
        : csDirty() ? 'Unsaved changes' : '';
}

function csNameField() {
    const box = csEl('div', 'cs-f' + (gCs.errors.name ? ' has-err' : ''));
    const label = csEl('label', 'lab', 'Name');
    label.htmlFor = 'cs_name';
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'cs_name';
    input.className = 'field';
    input.maxLength = CS_NAME_MAX;
    input.autocomplete = 'off';
    input.placeholder = 'e.g. Sprint values';
    input.value = gCs.name;
    input.setAttribute('data-f', 'name');
    input.addEventListener('input', () => {
        gCs.name = input.value;
        if (gCs.errors.name && input.value.trim() !== '') {
            delete gCs.errors.name;
            box.classList.remove('has-err');
            const error = document.getElementById('cs_name_err');
            if (error !== null) error.remove();
            input.removeAttribute('aria-invalid');
        }
        csRenderTop();
    });
    box.append(label, input);
    if (gCs.errors.name) {
        input.setAttribute('aria-invalid', 'true');
        const error = csEl('p', 'cs-err', gCs.errors.name);
        error.id = 'cs_name_err';
        input.setAttribute('aria-describedby', error.id);
        box.appendChild(error);
    }
    return box;
}

function csCardsField() {
    const box = csEl('div', 'cs-cards');
    box.id = 'cs_cards';
    const label = csEl('div', 'lab');
    label.id = 'cs_cards_label';
    label.append('Cards ', csEl('span', 'cs-cnt', gCs.cards.length + ' / ' + gCs.maxCards));
    const grid = csEl('div', 'cs-grid');
    grid.setAttribute('role', 'listbox');
    grid.setAttribute('aria-labelledby', 'cs_cards_label');
    grid.setAttribute('aria-orientation', 'horizontal');
    gCs.cards.forEach((card, i) => {
        const model = csCardModel(card, i);
        const tile = csEl('button', 'cs-tile' + (i === gCs.sel ? ' sel' : '') + (gCs.errors.card === i ? ' bad' : ''));
        tile.type = 'button';
        tile.setAttribute('role', 'option');
        tile.setAttribute('aria-selected', i === gCs.sel ? 'true' : 'false');
        tile.setAttribute('aria-label', 'Card ' + (i + 1) + ': ' + cardName(model));
        tile.setAttribute('data-f', 'tile:' + i);
        tile.tabIndex = i === gCs.sel ? 0 : -1;
        tile.appendChild(dmCard(model, false));
        if (gCs.errors.card === i) tile.appendChild(csEl('span', 'cs-bang', '!'));
        tile.addEventListener('click', () => csSelect(i));
        tile.addEventListener('keydown', event => {
            let n = -1;
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') n = Math.min(gCs.cards.length - 1, i + 1);
            else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') n = Math.max(0, i - 1);
            else if (event.key === 'Home') n = 0;
            else if (event.key === 'End') n = gCs.cards.length - 1;
            if (n < 0) return;
            event.preventDefault();
            csSelect(n, true);
        });
        grid.appendChild(tile);
    });
    const add = csButton('cs-add', null, 'add', csAddCard);
    add.id = 'cs_add';
    add.append(csEl('span', 'cs-plus', '+'), csEl('span', null, 'Add card'));
    add.disabled = gCs.cards.length >= gCs.maxCards;
    if (add.disabled) add.title = 'At most ' + gCs.maxCards + ' cards';

    const actions = csEl('div', 'cs-moves');
    const back = csButton('btn-box cs-ico', null, 'left', () => csMove(-1));
    back.id = 'cs_left';
    back.setAttribute('aria-label', 'Move card left');
    back.appendChild(dmIcon('back'));
    back.disabled = gCs.sel === 0;
    const next = csButton('btn-box cs-ico', null, 'right', () => csMove(1));
    next.id = 'cs_right';
    next.setAttribute('aria-label', 'Move card right');
    next.appendChild(dmIcon('next'));
    next.disabled = gCs.sel >= gCs.cards.length - 1;
    const remove = csButton('btn-box danger', 'Remove card', 'remove', csRemoveCard);
    remove.id = 'cs_remove';
    remove.disabled = gCs.cards.length <= CS_MIN_CARDS;
    actions.append(back, next, remove);

    box.append(label, grid, add, actions);
    if (gCs.cards.length <= CS_MIN_CARDS) box.appendChild(csEl('p', 'hint', 'A set needs at least two cards.'));
    else if (gCs.maxCards > (gDeckMenu.limits.cards || 16) && add.disabled) {
        box.appendChild(csEl('p', 'hint', 'This set keeps its ' + gCs.maxCards + ' cards; it cannot grow.'));
    }
    return box;
}

function csDeleteRow() {
    const row = csEl('div', 'cs-delrow');
    if (gCs.set === null) return row;
    const remove = csButton('cs-del', 'Delete set', 'delete', () => csAsk('delete'));
    remove.id = 'cs_delete';
    row.appendChild(remove);
    return row;
}

/* the selected card: symbol or text, value, colour */
function csRenderDetail() {
    const box = document.getElementById('cs_detail');
    if (box === null) return;
    const card = gCs.cards[gCs.sel];
    const parts = [];
    parts.push(csEl('h3', 'cs-h', 'Card ' + (gCs.sel + 1) + ' of ' + gCs.cards.length));

    const preview = csEl('div', 'cs-preview');
    preview.setAttribute('aria-hidden', 'true');
    preview.appendChild(dmCard(csCardModel(card, gCs.sel), false));
    parts.push(preview);

    // symbol or text
    const mode = csEl('fieldset', 'f');
    mode.appendChild(csEl('legend', 'lab', 'Shows'));
    const seg = csEl('div', 'seg');
    [['symbol', 'Symbol'], ['text', 'Text']].forEach(([id, name]) => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'cs_mode';
        input.value = id;
        input.checked = card.mode === id;
        input.setAttribute('data-f', 'mode:' + id);
        input.addEventListener('change', () => csSetMode(id));
        label.append(input, csEl('span', null, name));
        seg.appendChild(label);
    });
    mode.appendChild(seg);
    parts.push(mode);

    parts.push(card.mode === 'symbol' ? csSymbolField(card) : csTextField(card));
    parts.push(csValueField(card));
    parts.push(csColorField(card));
    box.replaceChildren(...parts);
}

function csSymbolField(card) {
    const box = csEl('fieldset', 'f');
    box.id = 'cs_symbols';
    box.appendChild(csEl('legend', 'lab', 'Symbol'));
    const chips = csEl('div', 'cs-chips');
    CS_CATEGORIES.forEach(category => {
        const chip = csButton('cs-chip' + (gCs.cat === category.id ? ' on' : ''), category.name, 'cat:' + category.id, () => {
            gCs.cat = category.id;
            csRenderDetail();
        });
        chip.setAttribute('aria-pressed', gCs.cat === category.id ? 'true' : 'false');
        chips.appendChild(chip);
    });
    box.appendChild(chips);

    const used = new Set(gCs.cards.filter((other, i) => i !== gCs.sel && other.mode === 'symbol').map(other => other.symbol));
    let symbols = csSymbols().filter(symbol => csCategory(symbol) === gCs.cat);
    if (gCs.cat === 'numbers') {
        const rank = symbol => symbol === 's-inf' ? Infinity : Number(csSymbolValue(symbol) || 0);
        symbols = symbols.slice().sort((a, b) => rank(a) - rank(b));
    }
    // a migrated card may keep a symbol outside the library
    if (csCategory(card.symbol) === gCs.cat && !symbols.includes(card.symbol)) symbols.unshift(card.symbol);
    const grid = csEl('div', 'cs-syms');
    symbols.forEach(symbol => {
        const model = cardFromCustom({ card_key: symbol, symbol, value: csSymbolText(symbol), color: null });
        const button = csButton('cs-sym' + (symbol === card.symbol ? ' on' : '') + (used.has(symbol) ? ' taken' : ''),
            null, 'sym:' + symbol, () => csSetSymbol(symbol));
        button.setAttribute('aria-pressed', symbol === card.symbol ? 'true' : 'false');
        button.setAttribute('aria-label', cardName(model) + (used.has(symbol) ? ' (already in this set)' : ''));
        button.appendChild(cardFace(model, 'mini'));
        grid.appendChild(button);
    });
    box.appendChild(grid);
    return box;
}

function csTextField(card) {
    const box = csEl('div', 'f' + (gCs.errors.text ? ' has-err' : ''));
    const label = csEl('label', 'lab', 'Text');
    label.htmlFor = 'cs_text';
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'cs_text';
    input.className = 'field cs-mono';
    input.maxLength = CS_TEXT_MAX;
    input.autocomplete = 'off';
    input.placeholder = 'e.g. M';
    input.value = card.text;
    input.setAttribute('data-f', 'text');
    const help = csEl('p', 'hint', 'Up to 6 characters: letters, digits, signs. No emoji.');
    help.id = 'cs_text_help';
    input.setAttribute('aria-describedby', help.id);
    input.addEventListener('input', () => {
        card.text = input.value;
        csRefreshCard();
    });
    box.append(label, input);
    if (gCs.errors.text) {
        input.setAttribute('aria-invalid', 'true');
        const error = csEl('p', 'cs-err', gCs.errors.text);
        error.id = 'cs_text_err';
        input.setAttribute('aria-describedby', error.id + ' ' + help.id);
        box.appendChild(error);
    }
    box.appendChild(help);
    return box;
}

function csValueField(card) {
    const box = csEl('div', 'f' + (gCs.errors.value ? ' has-err' : ''));
    const label = csEl('label', 'lab', 'Value');
    label.htmlFor = 'cs_value';
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.id = 'cs_value';
    input.className = 'field cs-num';
    input.maxLength = 12;
    input.autocomplete = 'off';
    input.placeholder = 'none';
    input.value = card.value;
    input.setAttribute('data-f', 'value');
    const help = csEl('p', 'hint', 'For the average and the range. Empty: the card does not count.');
    help.id = 'cs_value_help';
    input.setAttribute('aria-describedby', help.id);
    input.addEventListener('input', () => {
        card.value = input.value;
        csRefreshCard();
    });
    box.append(label, input);
    if (gCs.errors.value) {
        input.setAttribute('aria-invalid', 'true');
        const error = csEl('p', 'cs-err', gCs.errors.value);
        error.id = 'cs_value_err';
        input.setAttribute('aria-describedby', error.id + ' ' + help.id);
        box.appendChild(error);
    }
    box.appendChild(help);
    return box;
}

function csColorField(card) {
    const box = csEl('fieldset', 'f');
    box.id = 'cs_colors';
    box.appendChild(csEl('legend', 'lab', 'Colour'));
    const grid = csEl('div', 'cs-sw');
    const colors = csColors();
    // a migrated card may keep a catalog colour outside the palette
    if (!colors.includes(card.color) && CARD_COLORS.has(card.color)) colors.unshift(card.color);
    colors.forEach(color => {
        const swatch = csButton('cs-swatch' + (color === card.color ? ' on' : ''), null, 'color:' + color, () => {
            card.color = color;
            card.colorSet = true;
            csRefreshCard(true);
        });
        setCardColor(swatch, color);
        swatch.setAttribute('aria-pressed', color === card.color ? 'true' : 'false');
        swatch.setAttribute('aria-label', color);
        swatch.title = color;
        grid.appendChild(swatch);
    });
    box.appendChild(grid);
    return box;
}

/* after a change of the selected card: the tiles and the preview (detail: the whole detail, e.g. a new symbol) */
function csRefreshCard(detail = false) {
    const cards = document.getElementById('cs_cards');
    const focused = document.activeElement;
    const focusKey = focused instanceof Element && gCs.dialog.contains(focused) ? focused.getAttribute('data-f') : null;
    if (cards !== null) cards.replaceWith(csCardsField());
    if (detail) {
        csRenderDetail();
    } else {
        const preview = document.querySelector('#cs_detail .cs-preview');
        if (preview !== null) preview.replaceChildren(dmCard(csCardModel(gCs.cards[gCs.sel], gCs.sel), false));
    }
    csRenderTop();
    if (focusKey !== null && focused !== document.activeElement) {
        const again = gCs.dialog.querySelector('[data-f="' + CSS.escape(focusKey) + '"]');
        if (again !== null) again.focus({ preventScroll: true });
    }
}

/* ------------------------------------------------------------------ changes */

function csSelect(index, focus = false) {
    gCs.sel = index;
    const card = gCs.cards[index];
    if (card.mode === 'symbol') gCs.cat = csCategory(card.symbol);
    const cards = document.getElementById('cs_cards');
    if (cards !== null) cards.replaceWith(csCardsField());
    csRenderDetail();
    // the list was built anew: the focus on the selected card (roving tabindex)
    const tile = gCs.dialog.querySelector('[data-f="tile:' + index + '"]');
    if (tile !== null) tile.focus({ preventScroll: !focus });
}

function csSetMode(mode) {
    const card = gCs.cards[gCs.sel];
    if (card.mode === mode) return;
    card.mode = mode;
    if (mode === 'text' && card.text === '') {
        // the symbol's value as a start when it is plain text ("3", "XL")
        const text = csSymbolText(card.symbol);
        card.text = csTextOk(text) ? text : '';
    }
    if (mode === 'symbol') gCs.cat = csCategory(card.symbol);
    delete gCs.errors.text;
    if (gCs.errors.card === gCs.sel) delete gCs.errors.card;
    csRefreshCard(true);
    if (mode === 'text') {
        const input = document.getElementById('cs_text');
        if (input !== null) input.focus();
    }
}

function csSetSymbol(symbol) {
    const card = gCs.cards[gCs.sel];
    card.symbol = symbol;
    card.value = csSymbolValue(symbol);
    if (!card.colorSet) card.color = csSymbolColor(symbol);
    delete gCs.errors.value;
    if (gCs.errors.card === gCs.sel) delete gCs.errors.card;
    csRefreshCard(true);
}

function csAddCard() {
    if (gCs.cards.length >= gCs.maxCards) return;
    // the next number symbol not in the set yet
    const used = new Set(gCs.cards.filter(card => card.mode === 'symbol').map(card => card.symbol));
    const numbers = csSymbols().filter(symbol => csCategory(symbol) === 'numbers' && symbol !== 's-inf')
        .sort((a, b) => Number(csSymbolValue(a) || 0) - Number(csSymbolValue(b) || 0));
    const symbol = numbers.find(id => !used.has(id)) || numbers[0] || 's-1';
    gCs.cards.push(csNewCard(symbol));
    gCs.sel = gCs.cards.length - 1;
    gCs.cat = 'numbers';
    csRefreshCard(true);
    const tile = gCs.dialog.querySelector('[data-f="tile:' + gCs.sel + '"]');
    if (tile !== null) {
        tile.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        tile.focus();
    }
}

function csRemoveCard() {
    if (gCs.cards.length <= CS_MIN_CARDS) return;
    gCs.cards.splice(gCs.sel, 1);
    gCs.errors = {};
    gCs.sel = Math.min(gCs.sel, gCs.cards.length - 1);
    csSelect(gCs.sel, true);
    csRenderTop();
}

function csMove(step) {
    const to = gCs.sel + step;
    if (to < 0 || to >= gCs.cards.length) return;
    const [card] = gCs.cards.splice(gCs.sel, 1);
    gCs.cards.splice(to, 0, card);
    if (gCs.errors.card === gCs.sel) gCs.errors.card = to;
    gCs.sel = to;
    csRefreshCard();
    // the move button keeps the focus while it can move on, else the card itself
    const button = document.getElementById(step < 0 ? 'cs_left' : 'cs_right');
    if (button !== null && !button.disabled) button.focus();
    else gCs.dialog.querySelector('[data-f="tile:' + to + '"]').focus();
}

/* ------------------------------------------------------------------ questions (discard, delete) */

function csAsk(kind) {
    gCs.ask = kind;
    const scrim = document.getElementById('cs_ask');
    if (scrim === null) return;
    const box = csEl('div', 'cs-dlg');
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'cs_ask_title');
    box.setAttribute('aria-describedby', 'cs_ask_text');
    const title = csEl('h3', null);
    title.id = 'cs_ask_title';
    const text = csEl('p', null);
    text.id = 'cs_ask_text';
    const buttons = csEl('div', 'cs-dlgbtns');
    let keep;
    if (kind === 'discard') {
        title.textContent = 'Discard your changes?';
        text.textContent = 'The set stays as it was.';
        keep = csButton('btn-box', 'Keep editing', 'ask-keep', csCloseQuestion);
        buttons.append(keep, csButton('btn-box danger', 'Discard', 'ask-ok', csClose));
        box.append(title, text, buttons);
    } else {
        const active = gDeckMenu.deck !== null && gCs.set !== null && gDeckMenu.deck.id === gCs.set.deck_id;
        title.textContent = 'Delete “' + gCs.set.name + '”?';
        text.textContent = 'The set and its cards are gone for the whole team.';
        box.append(title, text);
        if (active) {
            box.appendChild(csEl('p', 'cs-warnp', 'Your team plays with this set right now: the deck goes back to Fibonacci'
                + (deckRoundRunning() ? ' and a new round starts.' : '.')));
        }
        keep = csButton('btn-box', 'Keep it', 'ask-keep', csCloseQuestion);
        const confirm = csButton('btn-box danger strong', 'Delete set', 'ask-ok', csDelete);
        confirm.id = 'cs_delete_ok';
        buttons.append(keep, confirm);
        box.appendChild(buttons);
    }
    scrim.replaceChildren(box);
    scrim.hidden = false;
    // the rest of the editor is out of reach while the question is open
    gCs.dialog.querySelectorAll(':scope > .cs-top, :scope > .cs-body').forEach(part => { part.inert = true; });
    keep.focus();
}

function csCloseQuestion() {
    const kind = gCs.ask;
    gCs.ask = null;
    const scrim = document.getElementById('cs_ask');
    if (scrim !== null) {
        scrim.hidden = true;
        scrim.replaceChildren();
    }
    gCs.dialog.querySelectorAll(':scope > .cs-top, :scope > .cs-body').forEach(part => { part.inert = false; });
    const back = document.getElementById(kind === 'delete' ? 'cs_delete' : 'cs_cancel');
    if (back !== null) back.focus();
}

/* ------------------------------------------------------------------ save, delete */

/* checks the fields before the request; marks the first wrong card. true if fine */
function csCheck() {
    gCs.errors = {};
    if (gCs.name.trim() === '') gCs.errors.name = CS_ERRORS.name;
    for (let i = 0; i < gCs.cards.length; i++) {
        const card = gCs.cards[i];
        const textBad = card.mode === 'text' && !csTextOk(card.text.trim());
        const valueBad = csNumber(card.value) === undefined;
        if (textBad || valueBad) {
            gCs.errors.card = i;
            if (textBad) gCs.errors.text = card.text.trim() === '' ? 'Enter a text.' : CS_ERRORS.text;
            if (valueBad) gCs.errors.value = CS_ERRORS.numeric_value;
            gCs.sel = i;
            break;
        }
    }
    return Object.keys(gCs.errors).length === 0;
}

/* shows the errors and puts the focus on the first wrong field */
function csShowErrors() {
    csRender();
    const field = gCs.errors.name ? 'cs_name' : gCs.errors.text ? 'cs_text' : gCs.errors.value ? 'cs_value' : null;
    const target = field !== null ? document.getElementById(field)
        : gCs.errors.card !== undefined ? gCs.dialog.querySelector('[data-f="tile:' + gCs.errors.card + '"]') : null;
    if (target !== null) target.focus();
}

function csPost(url, body) {
    return apiWrite(url, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, null)
        .then(response => {
            if (response === null) return { status: 0, answer: null };
            return response.json().catch(() => null).then(answer => ({ status: response.status, answer }));
        });
}

/* an answer of the API: the error at its field / card */
function csApiError(answer) {
    const code = answer && typeof answer.error === 'string' ? answer.error : '';
    gCs.errors = {};
    if (code === 'name') {
        gCs.errors.name = CS_ERRORS.name;
    } else if (answer && typeof answer.index === 'number' && answer.index >= 0 && answer.index < gCs.cards.length) {
        gCs.errors.card = answer.index;
        gCs.sel = answer.index;
        if (code === 'text') gCs.errors.text = CS_ERRORS.text;
        else if (code === 'numeric_value') gCs.errors.value = CS_ERRORS.numeric_value;
        else gCs.errors.general = CS_ERRORS[code] || 'This card can’t be saved.';
    } else {
        gCs.errors.general = CS_ERRORS[code] || 'Not saved – please try again.';
    }
    csShowErrors();
}

/* the menu takes the result at once (the next board state confirms it) */
function csDone(answer, kind) {
    if (answer && answer.set) addCustomCards({ custom_sets: [answer.set] }, gCardByKey);
    if (answer && answer.set) {
        const i = gDeckMenu.sets.findIndex(set => set.set_id === answer.set.set_id);
        if (i >= 0) gDeckMenu.sets[i] = answer.set; else gDeckMenu.sets.push(answer.set);
    }
    if (kind === 'deleted' && gCs.set !== null) gDeckMenu.sets = gDeckMenu.sets.filter(set => set.set_id !== gCs.set.set_id);
    if (answer && answer.deck && Array.isArray(answer.deck.cards)) {
        gDeckMenu.deck = { id: answer.deck.id, group: answer.deck.group, cards: answer.deck.cards.slice(),
            controls: Array.isArray(answer.deck.controls) ? answer.deck.controls.slice() : [] };
        gDeckMenu.serverRev = answer.deck.rev;
    }
    if (kind === 'created') {
        gDeckMenu.view = 'main';
        gCs.opener = 'edit';
    }
    if (kind === 'deleted' && gDeckMenu.view === 'main') gCs.opener = 'change';
    gDeckMenu.refusal = null;
    renderDeckMenu(true);
    setDeckStatus({ text: DECK_DONE[kind] + (answer && answer.new_round ? ' – new round started' : ''), error: false });
    gCs.busy = false;
    csClose();
}

function csSave() {
    if (gCs.busy) return;
    if (!csCheck()) {
        csShowErrors();
        return;
    }
    if (gCs.set !== null && !csDirty()) {
        csClose();
        return;
    }
    const body = { name: gCs.name.trim(), style: 'plain', cards: gCs.cards.map(csRequestCard) };
    const team = encodeURIComponent(t);
    gCs.busy = true;
    csRenderTop();
    let request;
    if (gCs.set === null) {
        request = csPost('./api/custom_set_create.php?t=' + team, { ...body, activate: true })
            .then(result => ({ result, kind: 'created' }));
    } else {
        const url = './api/custom_set_save.php?t=' + team + '&set=' + encodeURIComponent(String(gCs.set.set_id));
        // 409: someone else saved the set meanwhile - Version 1: the last one wins (force)
        request = csPost(url, { ...body, rev: gCs.set.rev })
            .then(result => result.status === 409 ? csPost(url, { ...body, rev: gCs.set.rev, force: true }) : result)
            .then(result => ({ result, kind: 'saved' }));
    }
    request.then(({ result, kind }) => {
        if (result.status === 200 && result.answer) {
            csDone(result.answer, kind);
            return;
        }
        gCs.busy = false;
        csApiError(result.answer);
    });
}

function csDelete() {
    if (gCs.busy || gCs.set === null) return;
    gCs.busy = true;
    const url = './api/custom_set_delete.php?t=' + encodeURIComponent(t) + '&set=' + encodeURIComponent(String(gCs.set.set_id));
    csPost(url, {}).then(result => {
        if ((result.status === 200 && result.answer) || result.status === 404) {
            csDone(result.status === 200 ? result.answer : null, 'deleted');
            return;
        }
        gCs.busy = false;
        csCloseQuestion();
        gCs.errors = { general: 'Not deleted – please try again.' };
        csRenderTop();
    });
}
