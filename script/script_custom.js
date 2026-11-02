/* B-98 S5: the editor of an own card set (Andreas: the idea of the deck-menu mockup, calm and fitting the window).
 * A modal <dialog> (#cs_editor, showModal: top layer above the menu, focus stays inside), opened from the deck menu
 * (script_deck.js): the pen of a set, "Edit set" or "+ New set". Full screen (Andreas), head and foot fixed. Large
 * screens: the card strip on the left in full height, the fields of the card on the right (only these two scroll);
 * phones: one column, the strip scrolls sideways above the fields.
 * - B-98 copy (Andreas): "+ New set" first shows a choice in the same overlay (csRenderStart()): "Start from scratch"
 *   (cards 1 and 2) or one of the built-in sets (a row per catalog group: name, note, fan). A built-in set fills the
 *   editor with all cards of its group (every variant, catalog order, no control cards) with symbol, heading,
 *   description, value, colour and the group's style; each card sends its catalog card_key as key. The name stays
 *   empty (required). Esc / × / Cancel close the choice; nothing is stored before Save.
 * - Head: title, "The team sees changes after Save" (unsaved / errors, live region), × (= Cancel).
 * - Top: set name (24, counter), Style (card_catalog.json styles: plain | badge | banner | inverted).
 * - Left: "Cards (n of max)" (max: dao custom_limits.cards), a strip of the cards in the set's style: the selected one large as it looks on the
 *   table (cardFace()) with ↑ ↓ ×, the others as compact rows (small card, name, value; phones: small cards only),
 *   at the end "+ Add card" (up to the limit - a bigger migrated set keeps its size but does not grow -, × down to 2 cards).
 * - Right, the selected card: Symbol (a button with the symbol and its name opens a picker: search field and a list
 *   grouped by Numbers, Sizes, Lights, Faces, Stars, "Text" on top; next to the button the text field of a text card,
 *   1-6 characters, no emoji), Heading (16), Description (160), Numeric value (default from custom_symbol_values, may
 *   be empty, decimals), Colour (custom_colors).
 * - Foot: Delete set (asks first), Cancel (asks first with unsaved changes; Esc the same), "Save & play" (only when the
 *   set is not in play: save and put it in play), Save. A hint when saving starts a new round.
 * - Save: api/custom_set_create.php (activate with "Save & play") or api/custom_set_save.php with rev; a 409 (someone
 *   else saved meanwhile) is saved again with force (the last one wins); "Save & play" of a saved set then puts it in
 *   play with api/update_deck.php. Delete: api/custom_set_delete.php. The result as a toast; errors at the field
 *   (name, text, heading, description, value) or at the card (index of the API), else a toast above the editor.
 * Only createElement / textContent / setAttribute (name and texts are free text); symbols and colours only from the
 * whitelists of the catalog; requests as JSON body. */

const CS_TEXT_MAX = 6;
const CS_NAME_MAX = 24;
const CS_HEADING_MAX = 16;
const CS_DESCRIPTION_MAX = 160;
const CS_MIN_CARDS = 2;
const CS_STYLE_NAMES = { plain: 'Plain', badge: 'Badge', banner: 'Banner', inverted: 'Inverted' };
const CS_TEXT_OPTION = 'text'; // the option "Text" of the symbol picker

/* the groups of the symbol picker (by symbol id, csCategory()) */
const CS_CATEGORIES = [
    { id: 'numbers', name: 'Numbers' },
    { id: 'sizes', name: 'Sizes' },
    { id: 'lights', name: 'Lights' },
    { id: 'faces', name: 'Faces' },
    { id: 'stars', name: 'Stars' },
];

/* the messages of the API error codes (api/lib_custom.php) */
const CS_ERRORS = {
    name: 'Give the set a name.',
    style: 'Choose a style.',
    text: 'Up to 6 letters, digits or signs – no emoji.',
    symbol: 'Choose a symbol.',
    symbol_or_text: 'Choose a symbol or enter a text.',
    heading: 'Up to 16 characters, no control characters.',
    description: 'Up to 160 characters, no control characters.',
    numeric_value: 'Enter a number (or leave it empty).',
    color: 'Choose a colour.',
    too_many_cards: 'Too many cards in this set.',
    no_cards: 'A set needs at least two cards.',
    set_limit: 'Your team has the maximum number of sets already.',
    not_found: 'This set has been deleted meanwhile.',
};

/* the fields of a card that can show an error (gCs.errors key -> input id), in their order */
const CS_FIELDS = { text: 'cs_text', heading: 'cs_heading', description: 'cs_desc', value: 'cs_value' };

const gCs = {
    dialog: null,
    set: null,        // the set as loaded (null: a new set)
    name: '',
    style: 'plain',
    cards: [],        // { key, mode: 'symbol'|'text', symbol, text, heading, description, value (string), color, colorSet }
    sel: 0,
    pick: null,       // the open symbol picker: { query, active } or null
    maxCards: 20,
    view: 'edit',     // 'start' (the choice of "+ New set") | 'edit'
    start: '',        // signature of the state when opened (unsaved changes)
    errors: {},       // { name, text, heading, description, value, card: index, general }
    opener: null,     // data-f of the element that opened the editor (focus back)
    busy: null,       // null | 'save' | 'play' | 'delete'
    ask: null,        // the open question: 'discard' | 'delete' | null
    state: null,      // #cs_state (role status), built once
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

function csStyles() {
    const list = csCatalog().styles;
    const styles = Array.isArray(list) ? list.filter(id => typeof id === 'string' && CARD_STYLES.has(id)) : [];
    return styles.length > 0 ? styles : ['plain'];
}

/* the default value of a symbol (card_catalog.json custom_symbol_values) as text for the field, '' for none */
function csSymbolValue(symbol) {
    const map = csCatalog().custom_symbol_values || {};
    const value = Object.hasOwn(map, symbol) ? map[symbol] : null;
    return typeof value === 'number' && isFinite(value) ? String(value) : '';
}

/* the catalog entry of the first card with this symbol ({entry, group}) or null */
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

/* a readable name of a symbol: numbers and sizes as shown, "green light", the face by the catalog ("satisfied"),
 * "3 stars" */
function csSymbolName(symbol) {
    const category = csCategory(symbol);
    if (category === 'lights') return symbol.replace('s-light-', '') + ' light';
    if (category === 'stars') {
        const n = symbol.replace('s-stars-', '');
        return n + (n === '1' ? ' star' : ' stars');
    }
    const found = csCatalogEntry(symbol);
    const entry = found ? found.entry : {};
    if (category === 'faces') return catalogText(entry.heading) || catalogText(entry.description) || symbol.replace('s-face-', '');
    const text = csSymbolText(symbol);
    if (text === '½') return '½ (half)';
    if (text === '∞') return '∞ (infinity)';
    return text || symbol.replace('s-', '');
}

/* the numbers of the library by value (∞ last) */
function csNumberRank(symbol) {
    return symbol === 's-inf' ? Infinity : Number(csSymbolValue(symbol) || 0);
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
        heading: typeof card.heading === 'string' ? card.heading : '',
        description: typeof card.description === 'string' ? card.description : '',
        value: typeof card.numeric_value === 'number' ? String(card.numeric_value) : '',
        color: typeof card.color === 'string' ? card.color : csColors()[0],
        colorSet: true,
    };
}

function csNewCard(symbol) {
    return { key: null, mode: 'symbol', symbol, text: '', heading: '', description: '', value: csSymbolValue(symbol),
        color: csSymbolColor(symbol), colorSet: false };
}

/* the card as the board shows it (cards.js) in the set's style */
function csCardModel(card, index) {
    const symbol = card.mode === 'symbol';
    const number = csNumber(card.value);
    return cardFromCustom({
        card_key: 'cs-edit-' + index,
        symbol: symbol ? card.symbol : null,
        value: symbol ? csSymbolText(card.symbol) : (card.text.trim() || '?'),
        heading: card.heading.trim() || null,
        description: card.description.trim() || null,
        numeric_value: typeof number === 'number' ? number : null,
        color: card.color,
        infinite: symbol && card.symbol === 's-inf',
    }, gCs.style);
}

/* the name of a card (screen readers): heading, else symbol name or text */
function csCardTitle(card) {
    if (card.heading.trim() !== '') return card.heading.trim();
    if (card.mode === 'symbol') return csSymbolName(card.symbol);
    return card.text.trim() || 'empty text';
}

/* the card of a request (custom_set_create.php / custom_set_save.php) */
function csRequestCard(card) {
    const symbol = card.mode === 'symbol';
    const number = csNumber(card.value);
    return {
        key: card.key,
        symbol: symbol ? card.symbol : null,
        text: symbol ? null : card.text.trim(),
        heading: card.heading.trim() || null,
        description: card.description.trim() || null,
        numeric_value: typeof number === 'number' ? number : null,
        color: card.color,
    };
}

function csSignature() {
    return JSON.stringify([gCs.name.trim(), gCs.style, gCs.cards.map(csRequestCard)]);
}

function csDirty() {
    return csSignature() !== gCs.start;
}

/* the set being edited is the team's deck */
function csActive() {
    return gCs.set !== null && gDeckMenu.deck !== null && gDeckMenu.deck.id === gCs.set.deck_id;
}

/* Save starts a new round: the set is in play, cards are down and its cards change (not just their order, the name
 * or the style) */
function csStartsRound() {
    if (!deckRoundRunning() || !csActive()) return false;
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
        || request.heading !== (stored.heading || null) || request.description !== (stored.description || null)
        || request.numeric_value !== value || request.color !== stored.color;
}

/* ------------------------------------------------------------------ open / close */

function csDialog() {
    if (gCs.dialog !== null) return gCs.dialog;
    const dialog = document.createElement('dialog');
    dialog.id = 'cs_editor';
    dialog.className = 'cs-ovl';
    dialog.setAttribute('aria-labelledby', 'cs_title');
    // Esc: closes the picker (its search field handles it), else Cancel (asks first with unsaved changes);
    // preventDefault keeps the dialog open
    dialog.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        if (gCs.view === 'start') csClose();
        else if (gCs.ask !== null) csCloseQuestion();
        else if (gCs.pick !== null) csClosePicker(true);
        else csCancel();
    });
    dialog.addEventListener('cancel', event => {
        event.preventDefault();
        if (gCs.view === 'start') csClose();
        else if (gCs.ask === null && gCs.pick === null) csCancel();
    });
    // a press outside the picker (and its button) closes it
    dialog.addEventListener('pointerdown', event => {
        if (gCs.pick === null || !(event.target instanceof Element)) return;
        if (event.target.closest('#cs_pick, #cs_sym') === null) csClosePicker(false);
    });
    document.body.appendChild(dialog);
    gCs.dialog = dialog;
    return dialog;
}

/* the card limit of the team (dao custom_limits.cards) */
function csCardLimit() {
    const max = gDeckMenu.limits && gDeckMenu.limits.cards;
    return typeof max === 'number' && max >= CS_MIN_CARDS ? max : 20;
}

/* set: an own set (dao custom_sets) or null for a new one (first the choice: from scratch or a built-in set);
 * opener: the button (gets the focus back) */
function openCustomEditor(set, opener) {
    gCs.opener = opener ? opener.getAttribute('data-f') : null;
    if (set) {
        csStartEditor(set, null);
        return;
    }
    gCs.set = null;
    gCs.view = 'start';
    gCs.pick = null;
    gCs.ask = null;
    gCs.busy = null;
    gCs.errors = {};
    const dialog = csDialog();
    csRenderStart();
    if (!dialog.open) dialog.showModal();
    const first = document.getElementById('cs_scratch');
    if (first !== null) first.focus();
}

/* the editor: set (an own set) or null for a new one; group: a catalog group to start from (null: cards 1 and 2) */
function csStartEditor(set, group) {
    gCs.view = 'edit';
    gCs.set = set;
    gCs.name = set ? set.name : '';
    if (set) gCs.style = CARD_STYLES.has(set.style) ? set.style : 'plain';
    else gCs.style = group && CARD_STYLES.has(group.style) ? group.style : 'plain';
    gCs.maxCards = Math.max(csCardLimit(), set ? set.cards.length : 0);
    gCs.cards = set ? set.cards.map(csFromStored)
        : group ? csGroupCards(group).slice(0, gCs.maxCards) : [csNewCard('s-1'), csNewCard('s-2')];
    gCs.sel = 0;
    gCs.pick = null;
    gCs.errors = {};
    gCs.busy = null;
    gCs.ask = null;
    gCs.start = csSignature();
    const dialog = csDialog();
    csRender();
    if (!dialog.open) dialog.showModal();
    const first = set ? dialog.querySelector('[data-f="card:0"]') : document.getElementById('cs_name');
    if (first !== null) first.focus();
}

/* every card of a catalog group (the union of its variants, catalog order, no control cards) as editor cards */
function csGroupCards(group) {
    const entries = new Map(group.cards.map(entry => [entry.card_key, entry]));
    return deckGroupKeys(group).map(key => entries.get(key)).filter(Boolean).map(entry => csFromCatalog(entry, group));
}

/* an editor card from a catalog card: its symbol (else its value as text), heading, description, the value of the
 * symbol in own sets (custom_symbol_values; the catalog sorts T-shirts etc. by values like 10000), its colour;
 * key: the catalog card_key (the API takes symbol and colour of the catalog card) */
function csFromCatalog(entry, group) {
    const look = cardLook({ symbol: entry.symbol || null, text: entry.value, color: entry.color || null, group: group.id });
    const symbol = look.symbol;
    const values = csCatalog().custom_symbol_values || {};
    const value = symbol !== null && Object.hasOwn(values, symbol) ? csSymbolValue(symbol)
        : typeof entry.numeric_value === 'number' ? String(entry.numeric_value) : '';
    const text = typeof entry.value === 'string' ? entry.value : '';
    return {
        key: entry.card_key,
        mode: symbol !== null ? 'symbol' : 'text',
        symbol: symbol !== null ? symbol : 's-1',
        text: symbol === null && csTextOk(text) ? text : '',
        heading: catalogText(entry.heading) || '',
        description: catalogText(entry.description) || '',
        value,
        color: look.color !== null ? look.color : symbol !== null ? csSymbolColor(symbol) : csColors()[0],
        colorSet: true,
    };
}

function csClose() {
    const dialog = gCs.dialog;
    if (dialog === null || !dialog.open) return;
    dialog.close();
    gCs.view = 'edit';
    gCs.ask = null;
    gCs.pick = null;
    // back to the opener (the menu may have been built anew meanwhile), else to the card set
    let target = gCs.opener !== null
        ? document.querySelector('#deck_menu [data-f="' + CSS.escape(gCs.opener) + '"]') : null;
    if (target === null || target.disabled) target = document.getElementById('deck_change') || document.getElementById('deck_pick_title');
    if (target !== null) target.focus();
}

function csCancel() {
    if (gCs.view === 'start') {
        csClose();
        return;
    }
    if (gCs.busy !== null) return;
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

/* a label with "optional" and a counter (n/max) */
function csLabel(forId, text, optional, counter) {
    const label = csEl('label', 'lab cs-lab', text);
    label.htmlFor = forId;
    if (optional) label.append(' ', csEl('span', 'cs-opt', 'optional'));
    if (counter) label.appendChild(counter);
    return label;
}

function csCounter(value, max) {
    const counter = csEl('span', 'cs-ctr', [...value].length + '/' + max);
    counter.setAttribute('aria-hidden', 'true');
    return counter;
}

/* an error below a field (aria-describedby: the error, then the help) */
function csFieldError(box, input, key, helpId) {
    if (!gCs.errors[key]) return;
    input.setAttribute('aria-invalid', 'true');
    const error = csEl('p', 'cs-err', gCs.errors[key]);
    error.id = input.id + '_err';
    input.setAttribute('aria-describedby', helpId ? error.id + ' ' + helpId : error.id);
    box.classList.add('has-err');
    box.appendChild(error);
}

/* the error of a field is gone once it is fine again */
function csClearError(key, input) {
    if (!gCs.errors[key]) return;
    delete gCs.errors[key];
    if (key !== 'name' && gCs.errors.card === gCs.sel && !Object.keys(CS_FIELDS).some(field => gCs.errors[field])) {
        delete gCs.errors.card;
        const card = document.querySelector('#cs_list [data-f="card:' + gCs.sel + '"]');
        if (card !== null) card.closest('li').classList.remove('bad');
    }
    const error = document.getElementById(input.id + '_err');
    if (error !== null) error.remove();
    input.removeAttribute('aria-invalid');
    const described = (input.getAttribute('aria-describedby') || '').split(' ').filter(id => id !== '' && id !== input.id + '_err');
    if (described.length > 0) input.setAttribute('aria-describedby', described.join(' '));
    else input.removeAttribute('aria-describedby');
    const box = input.closest('.has-err');
    if (box !== null) box.classList.remove('has-err');
}

/* the choice of "+ New set" (Andreas): from scratch or from a built-in set (a row per group as in the deck menu) */
function csRenderStart() {
    const dialog = csDialog();
    const head = csEl('div', 'cs-head');
    const title = csEl('h2', null, 'New card set');
    title.id = 'cs_title';
    const fill = csEl('span', 'cs-sub');
    const close = csButton('icon-btn cs-x', null, 'x', csClose);
    close.id = 'cs_x';
    close.setAttribute('aria-label', 'Cancel');
    close.appendChild(dmIcon('x'));
    head.append(title, fill, close);

    const body = csEl('div', 'cs-body cs-start');
    body.id = 'cs_body';
    const scratch = csButton('cs-new cs-scratch', null, 'scratch', () => csStartEditor(null, null));
    scratch.id = 'cs_scratch';
    const text = csEl('span', 'dm-t');
    text.append(csEl('b', null, 'Start from scratch'), csEl('small', null, 'Two cards to begin with'));
    scratch.append(csEl('span', 'cs-plus', '+'), text);

    const from = csEl('h3', 'lab cs-sec cs-sec2', 'Start from a built-in set');
    from.id = 'cs_from_title';
    const list = csEl('ul', 'dm-plist cs-from');
    list.id = 'cs_from';
    list.setAttribute('aria-labelledby', from.id);
    deckMenuGroups().forEach(group => {
        const item = csEl('li', 'dm-prow');
        const button = csButton('dm-prow-b', null, 'from:' + group.id, () => csStartEditor(null, group));
        button.setAttribute('data-group', group.id);
        const note = typeof group.description === 'string' && group.description !== ''
            ? group.description : DECK_GROUP_NOTES[group.id] || '';
        const label = csEl('span', 'dm-t');
        label.append(csEl('b', null, group.name), csEl('small', null, note));
        button.append(label, dmFan(group.variants[0].cards), dmIcon('next'));
        item.appendChild(button);
        list.appendChild(item);
    });
    body.append(scratch, from, list);

    const foot = csEl('div', 'cs-foot');
    foot.id = 'cs_foot';
    foot.appendChild(csEl('span', 'cs-fill'));
    const cancel = csButton('btn-box', 'Cancel', 'cancel', csClose);
    cancel.id = 'cs_cancel';
    foot.appendChild(cancel);

    dialog.replaceChildren(head, body, foot);
}

/* builds the whole editor; the focus stays on the same control (data-f), the scroll positions too */
function csRender() {
    const dialog = csDialog();
    const focused = document.activeElement;
    const focusKey = focused instanceof Element && dialog.contains(focused) ? focused.getAttribute('data-f') : null;
    const scrolls = ['cs_list', 'cs_detail', 'cs_body'].map(id => {
        const element = document.getElementById(id);
        return element !== null ? [element.scrollTop, element.scrollLeft] : [0, 0];
    });

    const head = csEl('div', 'cs-head');
    const title = csEl('h2', null, gCs.set ? 'Edit card set' : 'New card set');
    title.id = 'cs_title';
    // the live region stays the same node (a new one would not be announced reliably); only its text changes
    if (gCs.state === null) {
        gCs.state = csEl('span', 'cs-sub');
        gCs.state.id = 'cs_state';
        gCs.state.setAttribute('role', 'status');
    }
    const close = csButton('icon-btn cs-x', null, 'x', csCancel);
    close.id = 'cs_x';
    close.setAttribute('aria-label', 'Cancel');
    close.appendChild(dmIcon('x'));
    head.append(title, gCs.state, close);

    const body = csEl('div', 'cs-body');
    body.id = 'cs_body';
    const top = csEl('div', 'cs-topf');
    top.append(csNameField(), csStyleField());
    const cards = csEl('div', 'cs-cards');
    cards.id = 'cs_cards';
    const detail = csEl('section', 'cs-detail');
    detail.id = 'cs_detail';
    body.append(top, cards, detail);

    const foot = csEl('div', 'cs-foot');
    foot.id = 'cs_foot';

    const ask = csEl('div', 'cs-scrim');
    ask.id = 'cs_ask';
    ask.hidden = true;

    dialog.replaceChildren(head, body, foot, ask);
    csRenderCards();
    csRenderDetail();
    csRenderState();
    if (gCs.ask !== null) csAsk(gCs.ask);

    ['cs_list', 'cs_detail', 'cs_body'].forEach((id, i) => {
        const element = document.getElementById(id);
        if (element === null) return;
        element.scrollTop = scrolls[i][0];
        element.scrollLeft = scrolls[i][1];
    });
    if (focusKey !== null) {
        const again = dialog.querySelector('[data-f="' + CSS.escape(focusKey) + '"]');
        if (again !== null) again.focus({ preventScroll: true });
    }
}

/* the state line in the head and the foot */
function csRenderState() {
    const state = gCs.state;
    if (state === null) return;
    const errors = ['name', 'text', 'heading', 'description', 'value', 'general'].filter(key => gCs.errors[key]).length;
    state.classList.toggle('bad', errors > 0);
    state.textContent = errors > 0 ? (gCs.errors.general || 'Please check the marked fields.')
        : csDirty() ? 'Unsaved changes · the team sees them after Save' : 'The team sees changes after Save';
    csRenderFoot();
}

function csRenderFoot() {
    const foot = document.getElementById('cs_foot');
    if (foot === null) return;
    const focused = document.activeElement;
    const focusKey = focused instanceof Element && foot.contains(focused) ? focused.getAttribute('data-f') : null;
    const parts = [];
    const busy = gCs.busy !== null;
    const play = !csActive();
    // a new round: Save changes the cards of the set in play / "Save & play" while cards are down
    const round = csStartsRound() ? 'Cards are down – Save starts a new round.'
        : play && deckRoundRunning() ? 'Cards are down – Save & play starts a new round.' : '';
    if (round !== '') {
        const hint = csEl('p', 'hint warn cs-round', round);
        hint.id = 'cs_round';
        hint.setAttribute('role', 'note');
        parts.push(hint);
    }
    if (gCs.set !== null) {
        const remove = csButton('cs-del', 'Delete set', 'delete', () => csAsk('delete'));
        remove.id = 'cs_delete';
        remove.disabled = busy;
        parts.push(remove);
    }
    parts.push(csEl('span', 'cs-fill'));
    const cancel = csButton('btn-box', 'Cancel', 'cancel', csCancel);
    cancel.id = 'cs_cancel';
    cancel.disabled = busy;
    parts.push(cancel);
    if (play) {
        const savePlay = csButton('btn-box', gCs.busy === 'play' ? 'Saving…' : 'Save & play', 'play', () => csSave(true));
        savePlay.id = 'cs_play';
        savePlay.disabled = busy;
        parts.push(savePlay);
    }
    const save = csButton('btn-box primary', gCs.busy === 'save' ? 'Saving…' : 'Save', 'save', () => csSave(false));
    save.id = 'cs_save';
    save.disabled = busy;
    parts.push(save);
    foot.replaceChildren(...parts);
    if (focusKey !== null) {
        const again = foot.querySelector('[data-f="' + CSS.escape(focusKey) + '"]');
        if (again !== null) again.focus({ preventScroll: true });
    }
}

function csNameField() {
    const box = csEl('div', 'f cs-f cs-namef');
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'cs_name';
    input.className = 'field';
    input.maxLength = CS_NAME_MAX;
    input.autocomplete = 'off';
    input.placeholder = 'e.g. Sprint values';
    input.value = gCs.name;
    input.setAttribute('data-f', 'name');
    const counter = csCounter(gCs.name, CS_NAME_MAX);
    input.addEventListener('input', () => {
        gCs.name = input.value;
        counter.textContent = [...input.value].length + '/' + CS_NAME_MAX;
        if (input.value.trim() !== '') csClearError('name', input);
        csRenderState();
    });
    box.append(csLabel('cs_name', 'Set name', false, counter), input);
    csFieldError(box, input, 'name', null);
    return box;
}

function csStyleField() {
    const box = csEl('fieldset', 'f cs-f cs-stylef');
    box.id = 'cs_style';
    box.appendChild(csEl('legend', 'lab cs-lab', 'Style'));
    const seg = csEl('div', 'seg');
    csStyles().forEach(style => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'cs_style';
        input.value = style;
        input.checked = gCs.style === style;
        input.setAttribute('data-f', 'style:' + style);
        input.addEventListener('change', () => {
            gCs.style = style;
            csRenderCards();
            csRenderState();
        });
        label.append(input, csEl('span', null, CS_STYLE_NAMES[style] || style));
        seg.appendChild(label);
    });
    box.appendChild(seg);
    return box;
}

/* "Cards (n of 16)": every card as it looks, the selected one with ↑ ↓ ×; "+ Add card" at the end */
function csRenderCards() {
    const box = document.getElementById('cs_cards');
    if (box === null) return;
    const old = document.getElementById('cs_list');
    const scroll = old !== null ? [old.scrollTop, old.scrollLeft] : [0, 0];
    const label = csEl('div', 'lab cs-lab');
    label.id = 'cs_cards_label';
    label.textContent = 'Cards (' + gCs.cards.length + ' of ' + gCs.maxCards + ')';
    const list = csEl('ol', 'cs-list');
    list.id = 'cs_list';
    list.setAttribute('aria-labelledby', label.id);
    const last = gCs.cards.length - 1;
    gCs.cards.forEach((card, i) => {
        const selected = i === gCs.sel;
        const item = csEl('li', 'cs-item' + (selected ? ' sel' : '') + (gCs.errors.card === i ? ' bad' : ''));
        // Andreas: only the card being edited is large; the others are compact rows (small card, name, value)
        const pick = csButton(selected ? 'cs-card' : 'cs-row', null, 'card:' + i, () => csSelect(i));
        if (selected) pick.setAttribute('aria-current', 'true');
        const number = csNumber(card.value);
        pick.setAttribute('aria-label', 'Card ' + (i + 1) + ': ' + csCardTitle(card)
            + (typeof number === 'number' ? ', value ' + number : '') + (gCs.errors.card === i ? ' (please check)' : ''));
        if (selected) {
            const face = cardFace(csCardModel(card, i), 'table');
            face.removeAttribute('role'); // the button carries the name
            face.removeAttribute('aria-label');
            face.setAttribute('aria-hidden', 'true');
            pick.appendChild(face);
        } else {
            const text = csEl('span', 'cs-row-t');
            text.append(csEl('b', null, csCardTitle(card)),
                csEl('small', null, typeof number === 'number' ? 'value ' + number : 'no value'));
            pick.append(dmCard(csCardModel(card, i), false), text);
        }
        if (gCs.errors.card === i) pick.appendChild(csEl('span', 'cs-bang', '!'));
        item.appendChild(pick);
        if (selected) {
            const actions = csEl('span', 'cs-acts');
            const up = csButton('cs-mv', '↑', 'up', () => csMove(-1));
            up.id = 'cs_up';
            up.setAttribute('aria-label', 'Move card up');
            up.disabled = i === 0;
            const down = csButton('cs-mv', '↓', 'down', () => csMove(1));
            down.id = 'cs_down';
            down.setAttribute('aria-label', 'Move card down');
            down.disabled = i === last;
            const remove = csButton('cs-mv danger', '×', 'remove', csRemoveCard);
            remove.id = 'cs_remove';
            remove.setAttribute('aria-label', 'Remove card');
            remove.disabled = gCs.cards.length <= CS_MIN_CARDS;
            if (remove.disabled) remove.title = 'A set needs at least two cards';
            actions.append(up, down, remove);
            item.appendChild(actions);
        }
        list.appendChild(item);
    });
    const addItem = csEl('li', 'cs-additem');
    const add = csButton('cs-add', null, 'add', csAddCard);
    add.id = 'cs_add';
    add.disabled = gCs.cards.length >= gCs.maxCards;
    add.append(csEl('span', 'cs-plus', '+'), csEl('span', null, 'Add card'));
    if (add.disabled) add.title = gCs.maxCards > csCardLimit()
        ? 'This set keeps its ' + gCs.maxCards + ' cards; it cannot grow.' : 'At most ' + gCs.maxCards + ' cards';
    addItem.appendChild(add);
    list.appendChild(addItem);
    box.replaceChildren(label, list);
    list.scrollTop = scroll[0];
    list.scrollLeft = scroll[1];
}

/* the selected card: symbol or text, heading, description, value, colour */
function csRenderDetail() {
    const box = document.getElementById('cs_detail');
    if (box === null) return;
    const card = gCs.cards[gCs.sel];
    const title = csEl('h3', 'cs-h', 'Card ' + (gCs.sel + 1));
    title.id = 'cs_card_title';
    box.setAttribute('aria-labelledby', title.id);
    box.replaceChildren(title, csSymbolField(card), csHeadingField(card), csDescriptionField(card), csValueField(card),
        csColorField(card));
    if (gCs.pick !== null) csRenderPickerList();
}

/* a symbol of the library, drawn small and whole (decorative) */
function csSymbolMini(symbol) {
    const face = cardFace(cardFromCustom({ card_key: symbol, symbol, value: csSymbolText(symbol), color: null }), 'mini');
    face.classList.add('cs-mini');
    return face;
}

/* "Text" in the picker and on the button */
function csTextMini() {
    const mini = csEl('span', 'mini cs-mini cs-abc', 'Abc');
    mini.setAttribute('aria-hidden', 'true');
    return mini;
}

/* Symbol (Andreas): a button with the symbol and its name opens a picker below it; a text card has its text field
 * next to the button */
function csSymbolField(card) {
    const box = csEl('div', 'f cs-f cs-symf');
    box.id = 'cs_symbol';
    const label = csEl('span', 'lab cs-lab', 'Symbol');
    label.id = 'cs_sym_label';
    const row = csEl('div', 'cs-symrow');
    const button = csButton('cs-symbtn', null, 'sym', () => (gCs.pick !== null ? csClosePicker(true) : csOpenPicker()));
    button.id = 'cs_sym';
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', gCs.pick !== null ? 'true' : 'false');
    button.setAttribute('aria-labelledby', 'cs_sym_label cs_sym');
    const text = card.mode === 'text';
    button.append(text ? csTextMini() : csSymbolMini(card.symbol),
        csEl('span', 'cs-symname', text ? 'Text' : csSymbolName(card.symbol)), dmIcon('down'));
    row.appendChild(button);
    box.appendChild(label);
    if (text) {
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'cs_text';
        input.className = 'field cs-mono';
        input.maxLength = 12; // the check counts characters, not UTF-16 units
        input.autocomplete = 'off';
        input.placeholder = 'e.g. XL';
        input.value = card.text;
        input.setAttribute('data-f', 'text');
        input.setAttribute('aria-label', 'Text (up to 6 characters, no emoji)');
        input.addEventListener('input', () => {
            card.text = input.value;
            if (csTextOk(input.value.trim())) csClearError('text', input);
            csRefreshCard();
        });
        row.appendChild(input);
        box.appendChild(row);
        csFieldError(box, input, 'text', null);
    } else {
        box.appendChild(row);
    }
    if (gCs.pick !== null) box.appendChild(csPickerBox());
    return box;
}

/* the options of the picker: "Text", then the symbols by group, filtered by the search (name, group, id) */
function csPickerGroups(query) {
    const q = query.trim().toLowerCase();
    const card = gCs.cards[gCs.sel];
    let symbols = csSymbols();
    // a migrated card may keep a symbol outside the library
    if (card.mode === 'symbol' && !symbols.includes(card.symbol)) symbols = [card.symbol, ...symbols];
    const groups = CS_CATEGORIES.map(category => {
        let list = symbols.filter(symbol => csCategory(symbol) === category.id);
        if (category.id === 'numbers') list = list.slice().sort((a, b) => csNumberRank(a) - csNumberRank(b));
        if (q !== '' && !category.name.toLowerCase().includes(q)) {
            list = list.filter(symbol => csSymbolName(symbol).toLowerCase().includes(q) || symbol.includes(q));
        }
        return { category, list };
    }).filter(group => group.list.length > 0);
    if (q === '' || 'text'.includes(q) || 'abc'.includes(q)) groups.unshift({ category: null, list: [CS_TEXT_OPTION] });
    return groups;
}

function csPickerBox() {
    const pop = csEl('div', 'cs-pop');
    pop.id = 'cs_pick';
    const search = document.createElement('input');
    search.type = 'search';
    search.id = 'cs_sym_search';
    search.className = 'field';
    search.placeholder = 'Search symbols';
    search.autocomplete = 'off';
    search.setAttribute('aria-label', 'Search symbols');
    search.setAttribute('role', 'combobox');
    search.setAttribute('aria-expanded', 'true');
    search.setAttribute('aria-controls', 'cs_sym_list');
    search.setAttribute('aria-autocomplete', 'list');
    search.setAttribute('data-f', 'symsearch');
    search.value = gCs.pick.query;
    search.addEventListener('input', () => {
        gCs.pick.query = search.value;
        gCs.pick.active = null;
        csRenderPickerList();
    });
    search.addEventListener('keydown', csPickerKey);
    const list = csEl('ul', 'cs-plist');
    list.id = 'cs_sym_list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Symbols');
    pop.append(search, list);
    return pop;
}

/* the options of the open picker (after a search or a key) */
function csRenderPickerList() {
    const list = document.getElementById('cs_sym_list');
    const search = document.getElementById('cs_sym_search');
    if (list === null || search === null) return;
    const card = gCs.cards[gCs.sel];
    const current = card.mode === 'text' ? CS_TEXT_OPTION : card.symbol;
    const used = new Set(gCs.cards.filter((other, i) => i !== gCs.sel && other.mode === 'symbol').map(other => other.symbol));
    const groups = csPickerGroups(gCs.pick.query);
    const options = groups.flatMap(group => group.list);
    if (!options.includes(gCs.pick.active)) {
        gCs.pick.active = gCs.pick.query.trim() === '' && options.includes(current) ? current
            : options.find(option => option !== CS_TEXT_OPTION) || options[0] || null;
    }
    const items = [];
    groups.forEach(group => {
        if (group.category !== null) {
            const head = csEl('li', 'cs-pgroup', group.category.name);
            head.setAttribute('role', 'presentation');
            items.push(head);
        }
        group.list.forEach(symbol => {
            const isText = symbol === CS_TEXT_OPTION;
            const option = csEl('li', 'cs-option' + (used.has(symbol) ? ' taken' : '') + (symbol === gCs.pick.active ? ' active' : ''));
            option.id = 'cs_opt_' + symbol;
            option.setAttribute('role', 'option');
            option.setAttribute('data-sym', symbol);
            option.setAttribute('aria-selected', symbol === current ? 'true' : 'false');
            option.append(isText ? csTextMini() : csSymbolMini(symbol),
                csEl('span', 'cs-optname', isText ? 'Text' : csSymbolName(symbol)));
            if (isText) option.appendChild(csEl('span', 'cs-optnote', 'your own value'));
            else if (used.has(symbol)) option.appendChild(csEl('span', 'cs-optnote', 'in this set'));
            if (symbol === current) option.appendChild(dmIcon('check', 'cs-optcheck'));
            // pointerdown: no focus change (the search field keeps it), click picks
            option.addEventListener('pointerdown', event => event.preventDefault());
            option.addEventListener('click', () => csPickOption(symbol));
            items.push(option);
        });
    });
    if (options.length === 0) {
        const none = csEl('li', 'cs-pnone', 'No symbol found');
        none.setAttribute('role', 'presentation');
        items.push(none);
    }
    list.replaceChildren(...items);
    if (gCs.pick.active !== null) {
        search.setAttribute('aria-activedescendant', 'cs_opt_' + gCs.pick.active);
        const active = document.getElementById('cs_opt_' + gCs.pick.active);
        if (active !== null) active.scrollIntoView({ block: 'nearest' });
    } else {
        search.removeAttribute('aria-activedescendant');
    }
}

function csPickerKey(event) {
    const options = csPickerGroups(gCs.pick.query).flatMap(group => group.list);
    const i = options.indexOf(gCs.pick.active);
    let n = null;
    if (event.key === 'ArrowDown') n = Math.min(options.length - 1, i + 1);
    else if (event.key === 'ArrowUp') n = Math.max(0, i - 1);
    else if (event.key === 'PageDown') n = Math.min(options.length - 1, i + 8);
    else if (event.key === 'PageUp') n = Math.max(0, i - 8);
    else if (event.key === 'Enter') {
        event.preventDefault();
        if (gCs.pick.active !== null) csPickOption(gCs.pick.active);
        return;
    } else if (event.key === 'Escape') {
        // only the picker closes, not the editor
        event.preventDefault();
        event.stopPropagation();
        csClosePicker(true);
        return;
    } else if (event.key === 'Tab') {
        csClosePicker(false);
        return;
    }
    if (n === null || options.length === 0) return;
    event.preventDefault();
    gCs.pick.active = options[n];
    csRenderPickerList();
}

function csOpenPicker() {
    gCs.pick = { query: '', active: null };
    const scroll = document.getElementById('cs_detail').scrollTop;
    csRenderDetail();
    document.getElementById('cs_detail').scrollTop = scroll;
    const pop = document.getElementById('cs_pick');
    if (pop !== null) pop.scrollIntoView({ block: 'nearest' });
    const search = document.getElementById('cs_sym_search');
    if (search !== null) search.focus({ preventScroll: true });
}

/* focus: back on the symbol button */
function csClosePicker(focus) {
    if (gCs.pick === null) return;
    gCs.pick = null;
    const pop = document.getElementById('cs_pick');
    if (pop !== null) pop.remove();
    const button = document.getElementById('cs_sym');
    if (button !== null) {
        button.setAttribute('aria-expanded', 'false');
        if (focus) button.focus({ preventScroll: true });
    }
}

function csPickOption(symbol) {
    gCs.pick = null;
    if (symbol === CS_TEXT_OPTION) csSetText();
    else csSetSymbol(symbol);
}

function csTextInput(card, id, field, max, area) {
    const input = document.createElement(area ? 'textarea' : 'input');
    if (area) input.rows = 2;
    else input.type = 'text';
    input.id = id;
    input.className = 'field';
    input.maxLength = max;
    input.autocomplete = 'off';
    input.value = card[field];
    input.setAttribute('data-f', field);
    return input;
}

function csHeadingField(card) {
    const box = csEl('div', 'f cs-f');
    const input = csTextInput(card, 'cs_heading', 'heading', CS_HEADING_MAX, false);
    const counter = csCounter(card.heading, CS_HEADING_MAX);
    input.addEventListener('input', () => {
        card.heading = input.value;
        counter.textContent = [...input.value].length + '/' + CS_HEADING_MAX;
        csClearError('heading', input);
        csRefreshCard();
    });
    box.append(csLabel(input.id, 'Heading', true, counter), input);
    csFieldError(box, input, 'heading', null);
    return box;
}

function csDescriptionField(card) {
    const box = csEl('div', 'f cs-f');
    const input = csTextInput(card, 'cs_desc', 'description', CS_DESCRIPTION_MAX, true);
    const counter = csCounter(card.description, CS_DESCRIPTION_MAX);
    input.addEventListener('input', () => {
        card.description = input.value;
        counter.textContent = [...input.value].length + '/' + CS_DESCRIPTION_MAX;
        csClearError('description', input);
        csRefreshCard();
    });
    box.append(csLabel(input.id, 'Description', true, counter), input);
    csFieldError(box, input, 'description', null);
    return box;
}

/* Numeric value and colour side by side (large screens) */
function csValueField(card) {
    const box = csEl('div', 'f cs-f cs-valf');
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
    const help = csEl('p', 'hint', 'For range and average. Empty: the card does not count.');
    help.id = 'cs_value_help';
    input.setAttribute('aria-describedby', help.id);
    input.addEventListener('input', () => {
        card.value = input.value;
        if (csNumber(input.value) !== undefined) csClearError('value', input);
        csRefreshCard();
    });
    box.append(csLabel(input.id, 'Numeric value', true, null), input);
    csFieldError(box, input, 'value', help.id);
    box.appendChild(help);
    return box;
}

function csColorField(card) {
    const box = csEl('fieldset', 'f cs-f');
    box.id = 'cs_colors';
    box.appendChild(csEl('legend', 'lab cs-lab', 'Colour'));
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

/* after a change of the selected card: the strip and the state (detail: the whole detail, e.g. a new symbol);
 * the focus stays on the same control */
function csRefreshCard(detail = false) {
    const focused = document.activeElement;
    const focusKey = focused instanceof Element && gCs.dialog.contains(focused) ? focused.getAttribute('data-f') : null;
    csRenderCards();
    if (detail) {
        const box = document.getElementById('cs_detail');
        const scroll = box.scrollTop;
        csRenderDetail();
        box.scrollTop = scroll;
    }
    csRenderState();
    if (focusKey !== null && focused !== document.activeElement) {
        const again = gCs.dialog.querySelector('[data-f="' + CSS.escape(focusKey) + '"]');
        if (again !== null) again.focus({ preventScroll: true });
    }
}

/* ------------------------------------------------------------------ changes */

/* the selected card in view in the strip (vertical on large screens, sideways on phones) */
function csShowCard(index) {
    const card = gCs.dialog.querySelector('[data-f="card:' + index + '"]');
    if (card !== null) card.closest('li').scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return card;
}

function csSelect(index) {
    gCs.sel = index;
    gCs.pick = null;
    csRenderCards();
    csRenderDetail();
    document.getElementById('cs_detail').scrollTop = 0;
    const card = csShowCard(index);
    if (card !== null) card.focus({ preventScroll: true });
}

/* the card becomes a text value (the symbol's value as a start when it is plain text: "3", "XL") */
function csSetText() {
    const card = gCs.cards[gCs.sel];
    if (card.mode !== 'text') {
        card.mode = 'text';
        if (card.text === '') {
            const text = csSymbolText(card.symbol);
            card.text = csTextOk(text) ? text : '';
        }
        if (gCs.errors.card === gCs.sel) delete gCs.errors.card;
    }
    csRefreshCard(true);
    const input = document.getElementById('cs_text');
    if (input !== null) input.focus();
}

function csSetSymbol(symbol) {
    const card = gCs.cards[gCs.sel];
    card.mode = 'symbol';
    card.symbol = symbol;
    card.value = csSymbolValue(symbol);
    if (!card.colorSet) card.color = csSymbolColor(symbol);
    ['text', 'value'].forEach(key => delete gCs.errors[key]);
    if (gCs.errors.card === gCs.sel) delete gCs.errors.card;
    csRefreshCard(true);
    const button = document.getElementById('cs_sym');
    if (button !== null) button.focus({ preventScroll: true });
}

function csAddCard() {
    if (gCs.cards.length >= gCs.maxCards) return;
    // the next number symbol not in the set yet
    const used = new Set(gCs.cards.filter(card => card.mode === 'symbol').map(card => card.symbol));
    const numbers = csSymbols().filter(symbol => csCategory(symbol) === 'numbers' && symbol !== 's-inf')
        .sort((a, b) => csNumberRank(a) - csNumberRank(b));
    const symbol = numbers.find(id => !used.has(id)) || numbers[0] || 's-1';
    gCs.cards.push(csNewCard(symbol));
    csSelect(gCs.cards.length - 1);
    csRenderState();
}

function csRemoveCard() {
    if (gCs.cards.length <= CS_MIN_CARDS) return;
    gCs.cards.splice(gCs.sel, 1);
    gCs.errors = {};
    gCs.sel = Math.min(gCs.sel, gCs.cards.length - 1);
    csSelect(gCs.sel);
    csRenderState();
}

/* moves the selected card by step (-1 up, 1 down) */
function csMove(step) {
    const from = gCs.sel;
    const to = from + step;
    if (to < 0 || to >= gCs.cards.length) return;
    const [card] = gCs.cards.splice(from, 1);
    gCs.cards.splice(to, 0, card);
    if (gCs.errors.card === from) gCs.errors.card = to;
    else if (gCs.errors.card === to) gCs.errors.card = from;
    gCs.sel = to;
    csRenderCards();
    csRenderDetail();
    csRenderState();
    csShowCard(to);
    // the same arrow keeps the focus while it can move on, else the card
    const arrow = document.getElementById(step < 0 ? 'cs_up' : 'cs_down');
    const target = arrow !== null && !arrow.disabled ? arrow : gCs.dialog.querySelector('[data-f="card:' + to + '"]');
    if (target !== null) target.focus({ preventScroll: true });
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
        title.textContent = 'Delete “' + gCs.set.name + '”?';
        text.textContent = 'The set and its cards are gone for the whole team.';
        box.append(title, text);
        if (csActive()) {
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
    gCs.dialog.querySelectorAll(':scope > .cs-head, :scope > .cs-body, :scope > .cs-foot').forEach(part => { part.inert = true; });
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
    gCs.dialog.querySelectorAll(':scope > .cs-head, :scope > .cs-body, :scope > .cs-foot').forEach(part => { part.inert = false; });
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
        const bad = {
            text: card.mode === 'text' && !csTextOk(card.text.trim()),
            heading: [...card.heading.trim()].length > CS_HEADING_MAX,
            description: [...card.description.trim()].length > CS_DESCRIPTION_MAX,
            value: csNumber(card.value) === undefined,
        };
        if (Object.values(bad).some(Boolean)) {
            gCs.errors.card = i;
            if (bad.text) gCs.errors.text = card.text.trim() === '' ? 'Enter a text.' : CS_ERRORS.text;
            if (bad.heading) gCs.errors.heading = CS_ERRORS.heading;
            if (bad.description) gCs.errors.description = CS_ERRORS.description;
            if (bad.value) gCs.errors.value = CS_ERRORS.numeric_value;
            gCs.sel = i;
            break;
        }
    }
    return Object.keys(gCs.errors).length === 0;
}

/* shows the errors and puts the focus on the first wrong field */
function csShowErrors() {
    gCs.pick = null;
    csRender();
    const key = gCs.errors.name ? null : Object.keys(CS_FIELDS).find(field => gCs.errors[field]);
    let target = gCs.errors.name ? document.getElementById('cs_name') : key ? document.getElementById(CS_FIELDS[key]) : null;
    if (target === null && gCs.errors.card !== undefined) target = gCs.dialog.querySelector('[data-f="card:' + gCs.errors.card + '"]');
    if (gCs.errors.card !== undefined) csShowCard(gCs.errors.card);
    if (target !== null) {
        target.scrollIntoView({ block: 'nearest' });
        target.focus({ preventScroll: true });
    }
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
    const known = Object.hasOwn(CS_ERRORS, code);
    const fields = { text: 'text', heading: 'heading', description: 'description', numeric_value: 'value' };
    let toast = null;
    gCs.errors = {};
    if (code === 'name') {
        gCs.errors.name = CS_ERRORS.name;
    } else if (answer && typeof answer.index === 'number' && answer.index >= 0 && answer.index < gCs.cards.length) {
        gCs.errors.card = answer.index;
        gCs.sel = answer.index;
        if (Object.hasOwn(fields, code)) gCs.errors[fields[code]] = CS_ERRORS[code];
        // the card is marked, the reason comes as a toast (Andreas: messages of the menu as toasts)
        else toast = known ? CS_ERRORS[code] : 'This card can’t be saved.';
    } else {
        // no field: a toast, the editor stays open with the changes
        toast = known ? CS_ERRORS[code] : 'Not saved – please try again';
    }
    csShowErrors();
    if (toast !== null) showToast(toast, DECK_TOAST_MS); // after the editor was built anew (the toast lies in it)
}

/* the result of a save / delete as a toast (Andreas: all messages of the deck menu as toasts at the bottom) */
const CS_DONE = { created: 'Set created', played: 'Set saved and in play', saved: 'Set saved', deleted: 'Set deleted' };

/* the menu takes the result at once (the next board state confirms it).
 * kind: 'created' | 'played' (saved and put in play, also a new set) | 'saved' | 'deleted'; newRound: from the API */
function csDone(answer, kind, newRound) {
    const set = answer && answer.set ? answer.set : null;
    if (set !== null) {
        addCustomCards({ custom_sets: [set] }, gCardByKey);
        const i = gDeckMenu.sets.findIndex(other => other.set_id === set.set_id);
        if (i >= 0) gDeckMenu.sets[i] = set; else gDeckMenu.sets.push(set);
    }
    if (kind === 'deleted' && gCs.set !== null) gDeckMenu.sets = gDeckMenu.sets.filter(other => other.set_id !== gCs.set.set_id);
    if (answer && answer.deck && Array.isArray(answer.deck.cards)) {
        gDeckMenu.deck = { id: answer.deck.id, group: answer.deck.group, cards: answer.deck.cards.slice(),
            controls: Array.isArray(answer.deck.controls) ? answer.deck.controls.slice() : [] };
        gDeckMenu.serverRev = answer.deck.rev;
    } else if (kind === 'played' && set !== null && gDeckMenu.deck !== null) {
        // put in play with update_deck.php: the local copy until the next board state
        gDeckMenu.deck = { id: set.deck_id, group: 'custom', cards: set.cards.map(card => card.card_key),
            controls: gDeckMenu.deck.controls.slice() };
        gDeckMenu.serverRev = null;
    }
    if (kind === 'played') {
        gDeckMenu.view = 'main';
        gCs.opener = 'edit';
    } else if (kind === 'created' && set !== null) {
        gCs.opener = 'edit:' + set.set_id; // the pen of the new set in the list
    } else if (kind === 'deleted' && gDeckMenu.view === 'main') {
        gCs.opener = 'change';
    }
    renderDeckMenu(true);
    gCs.busy = null;
    csClose();
    showToast(CS_DONE[kind] + (newRound ? ' – new round started' : ''), DECK_TOAST_MS);
}

/* a create / save answer: done, or the error at its field */
function csSaved(result, kind) {
    if (result.status === 200 && result.answer) {
        csDone(result.answer, kind, result.answer.new_round === true);
        return;
    }
    gCs.busy = null;
    csRenderFoot();
    csApiError(result.answer);
}

/* Save (play false) or "Save & play" (play true: the set becomes the team's deck) */
function csSave(play) {
    if (gCs.busy !== null) return;
    if (!csCheck()) {
        csShowErrors();
        return;
    }
    const active = csActive();
    const dirty = csDirty();
    if (gCs.set !== null && !dirty && (!play || active)) {
        csClose();
        return;
    }
    const body = { name: gCs.name.trim(), style: gCs.style, cards: gCs.cards.map(csRequestCard) };
    const team = encodeURIComponent(t);
    gCs.busy = play ? 'play' : 'save';
    csRenderFoot();
    if (gCs.set === null) {
        csPost('./api/custom_set_create.php?t=' + team + '&id=' + encodeURIComponent(sid), { ...body, activate: play })
            .then(result => csSaved(result, play ? 'played' : 'created'));
        return;
    }
    const set = gCs.set;
    const url = './api/custom_set_save.php?t=' + team + '&set=' + encodeURIComponent(String(set.set_id));
    // 409: someone else saved the set meanwhile - Version 1: the last one wins (force)
    const saving = dirty
        ? csPost(url, { ...body, rev: set.rev })
            .then(result => result.status === 409 ? csPost(url, { ...body, rev: set.rev, force: true }) : result)
        : Promise.resolve({ status: 200, answer: { set, deck: null, new_round: false } });
    saving.then(result => {
        if (!play || active || result.status !== 200 || !result.answer) {
            csSaved(result, 'saved');
            return;
        }
        // "Save & play": the saved set becomes the team's deck (as choosing it in the list)
        apiWrite(deckUrl(set.deck_id, null), {}, null).then(response => {
            if (response === null || !response.ok) {
                csDone(result.answer, 'saved', false);
                showToast('Set saved – not in play, please try again', DECK_TOAST_MS);
                return;
            }
            response.json().catch(() => null).then(answer => {
                csDone({ set: result.answer.set, deck: null }, 'played', !!(answer && answer.new_round));
            });
        });
    });
}

function csDelete() {
    if (gCs.busy !== null || gCs.set === null) return;
    gCs.busy = 'delete';
    const url = './api/custom_set_delete.php?t=' + encodeURIComponent(t) + '&id=' + encodeURIComponent(sid)
        + '&set=' + encodeURIComponent(String(gCs.set.set_id));
    csPost(url, {}).then(result => {
        if ((result.status === 200 && result.answer) || result.status === 404) {
            const answer = result.status === 200 ? result.answer : null;
            csDone(answer, 'deleted', !!(answer && answer.new_round));
            return;
        }
        gCs.busy = null;
        csCloseQuestion();
        csRenderFoot();
        showToast('Not deleted – please try again', DECK_TOAST_MS);
    });
}
