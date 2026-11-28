/* global QRCodeStyling */
/* global Remarkable */

let t;
let gConn = null;
let gColorMode = readStoredColorMode() || "dark"; // B-141: the mode last used on this device first
let gScreenWidth = null;
let gDisplayType = null;
let gTopic = null;
let gCardsConfig = null;   // cards.json (v1) as loaded; only for the fallback deck (cardset_flags)
let gCatalogV2 = null;     // card_catalog.json (v2, B-98): groups, variants, control cards (deck menu, script_deck.js)
// B-99 (F1): the card model (script/deck.js). The catalog: all cards in deck order; the deck: the team's cards
let gCardCatalog = [];
let gCardByKey = new Map();
let gDeck = { rev: null, cards: [] };
// one element per card in the tray (built once, attached while the card is in the deck): key -> { slot, card, keyLabel }
const gDeckElements = new Map();
let gAllPlayersReady = false;
let gLastJson = null;
let gJsonBefore = null;
// B-75: touch devices (no hover, coarse pointer): no focus without a tap (iOS keyboard).
// B-75/B-77: on these the deck is a carousel at any width (same query as style.css "Card deck");
// a mouse or a trackpad keeps the deck row with the "<" / ">" bars (B-69)
const gTouchQuery = window.matchMedia('(hover: none) and (pointer: coarse)');
let gUserName = null;

/* B-152: the user id (UID, localStorage 'SID') is the secret of the person. A browser without one gets it from the
 * server (api/uid.php, 16 characters, 80 bits), never from Math.random. It travels only in the header X-Poker-User
 * (apiFetch), never in a URL. Readers use getUid(); whoever needs it for sure waits for ensureUid(). */
const UID_STORE_KEY = 'SID';
const UID_HEADER = 'X-Poker-User';
const UID_PATTERN = /^[A-Za-z0-9_-]{10,16}$/; // as get_uid() in api/lib.php; existing UIDs of old clients stay valid
let gUid = null;          // the UID of this page, once known
let gUidPromise = null;   // the one pending ensureUid() of this page

function readStoredUid() {
    try {
        const uid = localStorage.getItem(UID_STORE_KEY);
        return typeof uid === 'string' && UID_PATTERN.test(uid) ? uid : null;
    } catch (e) {
        return null; // no storage: the UID of this page only (gUid)
    }
}

/* the UID of this page, '' while none is known yet (then ensureUid() gets one) */
function getUid() {
    if (gUid === null) gUid = readStoredUid();
    return gUid ?? '';
}

/* resolves with the UID: the stored one, else a new one of api/uid.php. One request per page at a time; it is
 * retried (1 s, 2 s, 4 s, then every 5 s) until it works - meanwhile everything that needs the UID waits (the board
 * stays in its loading state, B-34). Another tab may have stored a UID meanwhile: an existing one wins. */
function ensureUid() {
    if (getUid() !== '') return Promise.resolve(gUid);
    if (gUidPromise !== null) return gUidPromise;
    let tries = 0;
    const attempt = () => fetch('./api/uid.php', { method: 'POST', cache: 'no-store' })
        .then(response => response.ok ? response.json() : Promise.reject(new Error('HTTP ' + response.status)))
        .then(json => {
            const fresh = json !== null && typeof json === 'object' && typeof json.id === 'string' ? json.id : '';
            if (!UID_PATTERN.test(fresh)) throw new Error('no uid');
            const stored = readStoredUid(); // another tab was faster: its UID wins
            if (stored !== null) return stored;
            try { localStorage.setItem(UID_STORE_KEY, fresh); } catch (e) { /* this page only */ }
            return fresh;
        })
        .catch(error => {
            console.log('uid.php failed', error);
            const stored = readStoredUid();
            if (stored !== null) return stored;
            const wait = tries < CONFIG_RETRY_MS.length ? CONFIG_RETRY_MS[tries] : CONFIG_RETRY_MAX_MS;
            tries++;
            return delay(wait).then(attempt);
        });
    gUidPromise = attempt().then(uid => {
        gUid = uid;
        gUidPromise = null;
        return uid;
    });
    return gUidPromise;
}

/* B-152: another tab of this browser deleted the user ("Delete user": SID removed, storage cleared) or stored
 * another UID: this page forgets its UID, getUid() reads the storage again and ensureUid() gets a new one if none is
 * there. Never keeps a deleted UID (dao.php would create it again). Not fired in the tab that made the change. */
window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === UID_STORE_KEY) gUid = null;
});

/* B-152: every call of the own API (relative ./api/ URL) goes through here: it waits for the UID and sends it in the
 * header X-Poker-User. Other URLs (other hosts, static files) are fetched as they are, never with the UID.
 * B-150: calls of the public API (./api/v1/) carry the board's team in the header X-Poker-Team as well (browser mode
 * of the API: UID + team, never in the URL). */
function apiFetch(url, init = {}) {
    if (typeof url !== 'string' || !url.startsWith('./api/')) return fetch(url, init);
    return ensureUid().then(uid => {
        const headers = new Headers(init.headers || undefined);
        headers.set(UID_HEADER, uid);
        if (url.startsWith('./api/v1/') && typeof t === 'string' && t !== '') headers.set('X-Poker-Team', t);
        return fetch(url, Object.assign({}, init, { headers: headers }));
    });
}

String.prototype.hashCode = function() {
    let hash = 0;
    if (this.length === 0) return hash;
    for (let i = 0; i < this.length; i++) {
        let char = this.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
}

function getBrowserWidth(){
    gScreenWidth = document.body.clientWidth;
    if(gScreenWidth < 800){
        // Extra Small Device
        gDisplayType = "xs";
    } else if(gScreenWidth < 991){
        // Small Device
        gDisplayType = "m";
    } else if(gScreenWidth < 1199){
        // Medium Device
        gDisplayType = "md";
    } else {
        // Large Device
        gDisplayType = "lg";
    }

    return gDisplayType;
}

function newRound() {
    let url = './api/newround.php?t=' + encodeURIComponent(t);
    apiWrite(url);
}

function playerTypeUpdate(playerType, name, teamName) {
    let ctl = document.getElementById("ctl");
    let overlayNameInput = document.getElementById("overlay_name_input");
    let privacyLink = document.getElementById("overlay_privacy_link");

    if (playerType === 'PLAYER' || playerType === 'OBSERVER') {
        // the deck (#ctl) is shown by controlsDsp() right after (B-110: no hidden/visible flip on every load)
        toggleStyleClass(overlayNameInput, "hidden", "visible");
        toggleStyleClass(privacyLink, 'hidden', 'visible');
    }
    else {
        let nameinput = document.getElementById("nameinput");
        let removedMsg = document.getElementById("removed_msg");
        // R3 review V4: "Join <team>" above the field (not when removed: that state has its own heading)
        let joinTitle = document.getElementById("join_title");
        const joinText = teamName ? 'Join ' + teamName : 'Join';
        if (joinTitle.textContent !== joinText) joinTitle.textContent = joinText;

        updateBecomeUserButtons(nameinput);

        if (playerType === 'REMOVED') {
            toggleStyleClass(nameinput, 'display_none', 'display_unset');
            toggleStyleClass(joinTitle, 'display_none', 'display_unset');
            toggleStyleClass(removedMsg, 'display_unset', 'display_none');
            toggleStyleClass(privacyLink, 'hidden', 'visible');

        } else {
            toggleStyleClass(nameinput, 'display_unset', 'display_none');
            toggleStyleClass(joinTitle, 'display_unset', 'display_none');
            toggleStyleClass(removedMsg, 'display_none', 'display_unset');
            toggleStyleClass(privacyLink, 'visible', 'hidden');
        }
        toggleStyleClass(ctl, "visible", "hidden");

        if (overlayNameInput.classList.contains("hidden")) {
            toggleStyleClass(overlayNameInput, "visible", "hidden");

            nameinput.value = name;
            updateBecomeUserButtons(nameinput);

            if (playerType === 'REMOVED') {
                setTimeout(function () {
                    document.getElementById('become_player_btn').focus();
                }, 100);
            } else if (!gTouchQuery.matches) {
                // B-75: not on touch devices: iOS opens the keyboard only for a focus inside a tap,
                // a focus here would only show the ring (the overlay focuses the field on a tap)
                setTimeout(function () {
                    document.getElementById('nameinput').focus();
                }, 100);
            }
        }
    }
}

function controlsDsp(playerType) {
    let ctl = document.getElementById("ctl");

    toggleStyleClass(ctl, "visible", "hidden");

    if (playerType === "PLAYER") {
        ctl.classList.remove('ctl_as_guest');
    }
    else {
        ctl.classList.add('ctl_as_guest');
    }


    gDeckElements.forEach(({ card }) => {
        if (playerType === "PLAYER") {
            card.classList.add("ctl_hover");
            card.addEventListener("click", setC);
            card.removeAttribute("aria-disabled");
        }
        else {
            card.classList.remove("ctl_hover");
            card.removeEventListener("click", setC);
            card.setAttribute("aria-disabled", "true"); // observers do not pick
        }
    });
}

function deletePlayer(mkey) {
    let url = './api/delete.php?mkey=' + encodeURIComponent(mkey) + '&t=' + encodeURIComponent(t);
    apiWrite(url);
}

function updateSelectedC(currKey) {
    gDeckElements.forEach(({ card }, key) => {
        card.classList.toggle('selected', key === currKey);
        card.setAttribute('aria-pressed', key === currKey ? 'true' : 'false');
    });
    updateDeckTabStop();
    scheduleCarousel(); // B-75: the dot of the picked card
}

/* the card key of a deck element (data-card) */
function deckCardKey(element) {
    return element.getAttribute('data-card');
}

function setC(e) {
    const element = e.currentTarget;
    let url = null;
    if (element.classList.contains('selected')) {
        if (!gAllPlayersReady) {
            url = './api/setc.php?cardkey=' + '&t=' + encodeURIComponent(t);
            element.classList.remove('selected');
            element.setAttribute('aria-pressed', 'false');
        }
    }
    else
        url = './api/setc.php?cardkey=' + encodeURIComponent(deckCardKey(element)) + '&t=' + encodeURIComponent(t);

    if (url !== null) apiWrite(url);
}

/* B-99 (F1): the card of the catalog for a key (also cards no longer in the deck), undefined if unknown */
function cardByKey(key) {
    return gCardByKey.get(key);
}

/* true when the card is in the team's deck */
function deckHas(key) {
    return gDeck.cards.some(card => card.key === key);
}

/* the tray elements of the deck's cards, in deck order */
function deckCardElements() {
    return gDeck.cards.map(card => gDeckElements.get(card.key)).filter(entry => entry !== undefined).map(entry => entry.card);
}

/* the element of a card in the tray (B-99 F2: a button with the rendered card, cards.js), with its key below
 * it (B-68). Built once per card, so a card switched off and on again keeps its element (no listeners lost);
 * the face is rebuilt when the deck shows texts or not (setDeck). */
function deckElement(card) {
    let entry = gDeckElements.get(card.key);
    if (entry === undefined) {
        const element = document.createElement("button");
        element.type = "button";
        element.id = card.key;
        element.classList.add("ctl", "on");
        element.setAttribute("data-card", card.key);
        element.setAttribute("aria-pressed", "false");
        element.setAttribute("aria-label", cardAriaLabel(card, false));
        element.tabIndex = -1;
        element.addEventListener("pointerenter", showDeckInfoByPointer);
        element.addEventListener("pointerleave", hideDeckInfo);
        element.addEventListener("focus", showDeckInfoByFocus);
        element.addEventListener("blur", hideDeckInfo);
        element.addEventListener("keydown", moveDeckFocus);
        element.addEventListener("pointerdown", () => {
            if (document.activeElement === element) gDeckPointerFocus = element;
        });
        element.addEventListener("focus", () => { gDeckPointerFocus = gKeyboardInput ? null : element; });
        element.addEventListener("blur", () => { if (gDeckPointerFocus === element) gDeckPointerFocus = null; });
        // B-68: the card with its key below it (shown on devices with a mouse, style.css)
        const slot = document.createElement("span");
        slot.className = "ctl-slot";
        const keyLabel = document.createElement("span");
        keyLabel.className = "ctl-key";
        keyLabel.setAttribute("aria-hidden", "true");
        slot.append(element, keyLabel);
        entry = { slot, card: element, keyLabel, texts: null, model: card };
        gDeckElements.set(card.key, entry);
    }
    // R3 fix (Andreas): a custom card keeps its key when only its set's style changes; addCustomCards() then builds
    // a new card model, so a new model means a new face
    if (entry.texts !== gDeckTexts || entry.model !== card) {
        entry.texts = gDeckTexts;
        entry.model = card;
        entry.card.replaceChildren(cardFace(card, 'deck', true)); // F7: control cards show their heading in every set
        entry.card.setAttribute('aria-label', cardAriaLabel(card, false));
    }
    return entry;
}

/* B-99 (F2): the deck shows texts (headings / descriptions) when one of its cards (not a control card) has
 * some. F7 (Andreas): the control cards show their heading in every set (Fibonacci too) in the deck, the info
 * line explains them; F8: on the table they show heading and description in every set. */
let gDeckTexts = false;
/* the layout level of the table cards (deckTextSize) */
let gDeckTextSize = 'none';

/* D4: the longest description of a "short texts" deck (control cards: 51, J.U.D.G.E. up to 160 characters) */
const DECK_SHORT_INFO = 60;
/* D5: the longest text of a "one word" deck (emotions: "uninterested", stars: "no stars") */
const DECK_WORD_TEXT = 16;

/* D5: how much text the cards of a deck carry; the table cards of a deck share one layout (style.css,
 * #cbox[data-text-size]): none (Fibonacci), word (one short word: emotions, stars), short (descriptions up to DECK_SHORT_INFO: traffic lights, Delegation),
 * long (J.U.D.G.E.) */
function deckTextSize(deck) {
    if (!deckHasTexts(deck)) return 'none';
    const cards = deck.cards.filter(card => !card.controlCard);
    const word = cards.every(card => !(card.heading && card.info)
        && String(card.heading || card.info || '').length <= DECK_WORD_TEXT);
    if (word) return 'word';
    return deck.cards.every(card => String(card.info || '').length <= DECK_SHORT_INFO) ? 'short' : 'long';
}

function deckHasTexts(deck) {
    return deck.cards.some(card => !card.controlCard && (card.heading || card.info));
}

/* B-99 (F2): the info line above the tray (devices with a mouse: pointing at a card; keyboard: focus) shows
 * the value, heading and description of the card. Sets without texts (Fibonacci): only for control cards. */
function deckInfoCard(element) {
    const card = cardByKey(deckCardKey(element));
    if (card === undefined || !(card.heading || card.info)) return undefined;
    return gDeckTexts || card.controlCard ? card : undefined;
}

function showDeckInfo(element) {
    const line = document.getElementById('deck_info');
    if (line === null) return;
    const card = deckInfoCard(element);
    if (card === undefined) { hideDeckInfo(); return; }
    const chip = document.createElement('span');
    chip.className = 'deck-info-value';
    const look = cardLook(card);
    setCardColor(chip, look.color);
    chip.appendChild(cardSmall(card, !card.heading)); // B-99 (F6): mono text or mini symbol, no system emoji
    // F8 (Andreas): left the chip, right the text, left-aligned: a second line starts below the first one's start
    const text = document.createElement('span');
    text.className = 'deck-info-text';
    if (card.heading) {
        const heading = document.createElement('b');
        heading.textContent = card.heading;
        text.appendChild(heading);
    }
    // F7: a description alone (emotions) reads like a heading
    if (card.info && card.heading) text.appendChild(document.createTextNode(' — ' + card.info));
    else if (card.info) text.appendChild(Object.assign(document.createElement('b'), { textContent: card.info }));
    const parts = [chip, text];
    line.replaceChildren(...parts);
    line.hidden = false;
}

function showDeckInfoByPointer(event) {
    if (event.pointerType === 'mouse') showDeckInfo(event.currentTarget);
}

function showDeckInfoByFocus(event) {
    const element = event.currentTarget;
    gDeckElements.forEach(({ card }) => { card.tabIndex = card === element ? 0 : -1; }); // roving tab stop
    if (!gCarousel.on) showDeckInfo(element);
}

function hideDeckInfo() {
    const line = document.getElementById('deck_info');
    if (line === null || line.hidden) return;
    const focused = document.activeElement;
    if (focused instanceof Element && focused.matches('#ctl .ctl') && focused.matches(':focus-visible') && !gCarousel.on) {
        showDeckInfo(focused); // the pointer left, the keyboard focus stays
        return;
    }
    line.hidden = true;
    line.replaceChildren();
}

/* R3 (Andreas, 2026-11-02): the deck card that got the focus from a pointer press (mouse, finger), null when the
 * focus came from the keyboard or left the card. A letter key then moves the focus along (pickCardByKey). */
let gDeckPointerFocus = null;

/* R3 (Andreas, 2026-11-03): did the last action come from the keyboard (true) or from a pointer (mouse, finger)?
 * Focus the app moves itself (a dialog opens or closes, a view changes: focusQuietly) shows its ring only after a key.
 * Chrome decides so on its own; Safari (a click does not focus a button) showed the ring after a click as well. */
let gKeyboardInput = false;
document.addEventListener('keydown', event => {
    if (event.metaKey || event.ctrlKey || ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(event.key)) return;
    gKeyboardInput = true;
    // a key shows the ring on the focused control again (as browsers do after a click)
    const focused = document.activeElement;
    if (focused instanceof Element) focused.classList.remove('no-ring');
}, true);
document.addEventListener('pointerdown', () => { gKeyboardInput = false; }, true);

// text fields show their ring after a click too: they are focused as usual
const RING_ALWAYS = 'textarea, select, [contenteditable], input:not([type="button"], [type="submit"], [type="reset"], '
    + '[type="checkbox"], [type="radio"], [type="range"], [type="color"])';

/* focuses el (null: nothing); after a pointer action without the focus ring: FocusOptions.focusVisible where the
 * browser knows it (Firefox), else the class no-ring until el loses the focus or a key is pressed (style.css) */
function focusQuietly(el, options = {}) {
    if (el === null || el === undefined) return;
    if (gKeyboardInput || el.matches(RING_ALWAYS)) {
        el.focus(options);
        return;
    }
    el.focus({ ...options, focusVisible: false });
    if (document.activeElement !== el || !el.matches(':focus-visible')) return;
    el.classList.add('no-ring');
    el.addEventListener('blur', () => el.classList.remove('no-ring'), { once: true });
}

/* B-99 (F3): one tab stop for the deck; the arrow keys move between its cards */
function moveDeckFocus(event) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0 || event.altKey || event.ctrlKey || event.metaKey) return;
    const cards = deckCardElements();
    const next = cards[cards.indexOf(event.currentTarget) + step];
    event.preventDefault();
    if (next !== undefined) next.focus();
}

/* the deck card that takes the tab stop: the picked one, else the first */
function updateDeckTabStop() {
    const cards = deckCardElements();
    const stop = cards.find(card => card.classList.contains('selected')) || cards[0];
    if (cards.includes(document.activeElement)) return; // the focus is in the deck: it keeps the stop
    gDeckElements.forEach(({ card }) => { card.tabIndex = card === stop ? 0 : -1; });
}

/* B-99 (F1): shows a deck (deck.js) in the tray: only its cards, in its order. The tray is only
 * rebuilt when the deck changed (rev). */
function setDeck(deck) {
    const ctl = document.getElementById('ctl');
    if (ctl === null || deck.rev === gDeck.rev) return;
    gDeck = deck;
    const texts = deckHasTexts(deck);
    const textSize = deckTextSize(deck);
    const textsChanged = texts !== gDeckTexts || textSize !== gDeckTextSize;
    // R3 fix: a card of the deck with a new model (style of a custom set changed, same key): table and result anew
    const restyled = deck.cards.some(card => {
        const entry = gDeckElements.get(card.key);
        return entry !== undefined && entry.model !== card;
    });
    gDeckTexts = texts;
    gDeckTextSize = textSize;
    ctl.classList.toggle('deck-texts', texts);
    // D4/D5: the table cards' layout follows the deck's longest text (style.css, "data-text-size")
    const cbox = document.getElementById('cbox');
    if (cbox !== null) cbox.dataset.textSize = textSize;
    ctl.replaceChildren(...deck.cards.map(card => deckElement(card).slot));
    updateDeckTabStop();
    // R3 fix: the carousel's hint line caches by card key; a new deck (texts of a custom card changed, same key)
    // builds it anew on the next frame
    document.getElementById('deck_pick')?.removeAttribute('data-shows');
    scheduleCarousel();
    if (textsChanged || restyled) refreshTableFaces();
    if (restyled) {
        // the spread labels, the range and the tip show small faces of the cards: built anew on the next update
        ['spread_bars', 'spread_range'].forEach(id => document.getElementById(id)?.removeAttribute(id === 'spread_bars' ? 'data-keys' : 'data-shows'));
        const tip = document.getElementById('round_tip');
        if (tip !== null) delete tip.dataset.key;
    }
}

/* R3 F4: the team's deck from dao ("deck", card data from card_catalog.json); without it (catalog missing or
 * broken on the server) the old way from cardset_flags and cards.json (adapter in deck.js) */
function setTeamDeck(json) {
    const deck = deckFromServer(json.deck, gCardByKey)
        || deckFromLegacy(gCardCatalog, String(json.cardset_flags || '').padEnd((gCardsConfig || []).length, '0'));
    setDeck(deck);
    updateDeckKeys();
}

/* B-68, F8 (B-99 planning, Andreas): the letter rows pick the cards from left to right, in deck order:
 * Q W E R T Z U I O P, then A S D F G H J K L, then Y X C V B N M (26 cards, control cards included).
 * The physical key counts (event.code), so QWERTZ, QWERTY and AZERTY pick the same card with the same finger. */
const DECK_KEY_CODES = [
    'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP',
    'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL',
    'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM',
];

/* the label under a card: the character of the key in the user's layout. navigator.keyboard.getLayoutMap()
 * tells it (Chromium); where it is missing (Firefox, Safari) the browser language guesses it (R3 review E9):
 * QWERTZ for German and the other QWERTZ languages, QWERTY otherwise (only Y and Z swap places). */
const DECK_KEY_LABELS_QWERTY = {
    KeyQ: 'Q', KeyW: 'W', KeyE: 'E', KeyR: 'R', KeyT: 'T', KeyY: 'Y', KeyU: 'U', KeyI: 'I', KeyO: 'O', KeyP: 'P',
    KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyF: 'F', KeyG: 'G', KeyH: 'H', KeyJ: 'J', KeyK: 'K', KeyL: 'L',
    KeyZ: 'Z', KeyX: 'X', KeyC: 'C', KeyV: 'V', KeyB: 'B', KeyN: 'N', KeyM: 'M',
};
const DECK_KEY_LABELS_QWERTZ = { ...DECK_KEY_LABELS_QWERTY, KeyY: 'Z', KeyZ: 'Y' };
const QWERTZ_LANGS = ['de', 'cs', 'sk', 'hu', 'sl', 'hr', 'sq'];

function defaultDeckKeyLabels() {
    const lang = String(navigator.language || '').toLowerCase().split('-')[0];
    return QWERTZ_LANGS.includes(lang) ? DECK_KEY_LABELS_QWERTZ : DECK_KEY_LABELS_QWERTY;
}

const DECK_KEY_LABELS_DEFAULT = defaultDeckKeyLabels();
let gDeckKeyLabels = DECK_KEY_LABELS_DEFAULT;

function deckKeyLabel(code) {
    return gDeckKeyLabels[code] || DECK_KEY_LABELS_DEFAULT[code];
}

/* reads the layout (again: on load and when the window gets the focus back, the user may have switched it) */
function loadDeckKeyLayout() {
    const keyboard = navigator.keyboard;
    if (!keyboard || typeof keyboard.getLayoutMap !== 'function') return;
    keyboard.getLayoutMap().then(map => {
        const labels = {};
        DECK_KEY_CODES.forEach(code => {
            const char = map.get(code);
            // one printable character only; anything else keeps the default label
            labels[code] = typeof char === 'string' && [...char].length === 1 && char.trim() !== ''
                ? char.toUpperCase() : DECK_KEY_LABELS_DEFAULT[code];
        });
        if (DECK_KEY_CODES.every(code => labels[code] === gDeckKeyLabels[code])) return;
        gDeckKeyLabels = labels;
        updateDeckKeys();
    }).catch(() => {}); // e.g. not allowed in a frame: the default labels
}

function updateDeckKeys() {
    // B-110: written only when a label changes (the board loads often, the same state changes nothing)
    const labels = new Map();
    gDeck.cards.forEach((card, i) => {
        if (i < DECK_KEY_CODES.length) labels.set(card.key, deckKeyLabel(DECK_KEY_CODES[i]));
    });
    gDeckElements.forEach(({ keyLabel }, key) => {
        const label = labels.get(key) || '';
        if (keyLabel.textContent !== label) keyLabel.textContent = label;
    });
    // the hint names the first and the last key in use, lower case like a console line: "press q–p to pick a card"
    const hint = document.querySelector('.deck-hint');
    const used = Math.min(gDeck.cards.length, DECK_KEY_CODES.length);
    if (hint !== null && used > 0) {
        const first = deckKeyLabel(DECK_KEY_CODES[0]).toLowerCase();
        const text = used === 1 ? 'press ' + first + ' to pick the card'
            : 'press ' + first + '\u2013' + deckKeyLabel(DECK_KEY_CODES[used - 1]).toLowerCase() + ' to pick a card';
        if (hint.textContent !== text) hint.textContent = text;
    }
    updateDeckRoom();
    syncCarousel(); // B-75
}

/* B-68: the hint "press q–p to pick a card" sits in the row of the keys; it is hidden (class
 * hint-off) when the deck scrolls or its last key does not stay clear of it, so the tray keeps its
 * height. Only where the keys show (style.css "Card deck"). */
function updateDeckRoom() {
    const container = document.getElementById('down-container');
    const ctl = document.getElementById('ctl');
    const hint = container === null ? null : container.querySelector('.deck-hint');
    if (ctl === null || container === null) return;
    const keyed = gDeck.cards.slice(0, DECK_KEY_CODES.length);
    const lastKey = keyed.length > 0 ? gDeckElements.get(keyed[keyed.length - 1].key).keyLabel : null;
    const fits = hint !== null && ctl.scrollWidth <= ctl.clientWidth + 1
        && (lastKey === null || lastKey.getBoundingClientRect().right + 8 <= hint.getBoundingClientRect().left);
    container.classList.toggle('hint-off', !fits);
    // B-69: the "<" / ">" bars where more cards are hidden (style.css "Card deck")
    const left = Math.abs(ctl.scrollLeft); // 0 at the start
    container.classList.toggle('more-left', left > 1);
    container.classList.toggle('more-right', left + ctl.clientWidth < ctl.scrollWidth - 1);
}

/* B-69: the deck has no scrollbar; a vertical mouse wheel scrolls it sideways while it overflows */
function scrollDeckByWheel(event) {
    const ctl = event.currentTarget;
    if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    if (ctl.scrollWidth <= ctl.clientWidth + 1) return;
    const step = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
    event.preventDefault();
    ctl.scrollLeft += event.deltaY * step;
}

/* B-69: a click / tap on the "<" (direction -1) or ">" (1) bar scrolls the deck by its visible
 * width minus one card, so the card at the edge stays in view */
function scrollDeckByBar(direction) {
    const ctl = document.getElementById('ctl');
    if (ctl === null) return;
    const card = deckCardElements()[0] || null;
    const cardWidth = card === null ? 0 : card.getBoundingClientRect().width;
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    ctl.scrollBy({ left: direction * Math.max(ctl.clientWidth - cardWidth, cardWidth), behavior });
}

/* B-75/B-77: touch devices (gTouchQuery, phones and tablets): the deck is a carousel (style.css "Card deck"). The
 * card in the middle is larger, the others smaller and paler (per frame, by their distance from the
 * middle, relative to the deck's width). Below the deck one dot per card (#deck_dots, display only), or a bar when they do not fit,
 * and a line with the picked card (#deck_pick).
 * Tap vs. swipe: a card is only picked by a real tap (short, hardly moved, not a touch that stops
 * a running swipe); other clicks on the deck are dropped before they reach setC(). A picked card
 * comes to the middle. A pull from the server never moves the deck; only a changed deck (cards
 * switched on/off) or the breakpoint centers a card again (the one in the middle, else the picked,
 * else the middle one). Haptics (navigator.vibrate, Android) only while the user swipes. */
const gCarousel = {
    on: false,         // carousel layout active (touch devices)
    keys: '',          // the deck's cards when last laid out
    currentKey: null,  // card in the middle
    raf: 0,
    press: null,       // pointer down on the deck
    swiping: false,    // the user's finger moved the deck (until it comes to rest)
    tapOk: false,      // the last press on the deck was a tap
    tween: 0,          // a tap brings a card to the middle: rAF id of the running tween (snap off meanwhile)
    restTimer: 0,
    lastTick: 0,
};

function carouselCards() {
    return deckCardElements();
}

/* brings a deck card (its element) to the middle of the deck. Animated by an own tween of scrollLeft
 * (easeOutCubic, CAROUSEL_TWEEN_MS) instead of the browser's smooth scroll, which is jerky on
 * iPhones; scroll snapping is off meanwhile (.steering, style.css), or iOS stops at a snap point
 * on the way (scroll-snap-stop). The last frame sets the exact position, then snapping is on
 * again. Each tween frame also lays out the carousel (carouselFrame), so the scroll events it
 * causes do no work of their own. A finger on the deck ends the tween (pointerdown). */
const CAROUSEL_TWEEN_MS = 250;
function carouselCenter(card, instant) {
    const ctl = document.getElementById('ctl');
    const slot = card.parentElement;
    const max = ctl.scrollWidth - ctl.clientWidth;
    const to = Math.min(max, Math.max(0, slot.offsetLeft + slot.offsetWidth / 2 - ctl.clientWidth / 2));
    carouselSteerEnd(ctl);
    const from = ctl.scrollLeft;
    if (instant || prefersReducedMotion() || Math.abs(to - from) < 0.5) {
        ctl.scrollLeft = to;
        return;
    }
    ctl.classList.add('steering');
    const start = performance.now();
    const step = now => {
        const p = Math.min(1, (now - start) / CAROUSEL_TWEEN_MS);
        const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
        ctl.scrollLeft = p < 1 ? from + (to - from) * eased : to;
        if (gCarousel.raf) { cancelAnimationFrame(gCarousel.raf); gCarousel.raf = 0; } // done here
        carouselFrame();
        if (p < 1) {
            gCarousel.tween = requestAnimationFrame(step);
        } else {
            gCarousel.tween = 0;
            ctl.classList.remove('steering');
        }
    };
    gCarousel.tween = requestAnimationFrame(step);
}

/* ends a running tween (if any): snapping on again */
function carouselSteerEnd(ctl) {
    if (gCarousel.tween) cancelAnimationFrame(gCarousel.tween);
    gCarousel.tween = 0;
    ctl.classList.remove('steering');
}

/* layout: called when the deck may have changed (pull, card set, resize, breakpoint) */
function syncCarousel(recenter = false) {
    const ctl = document.getElementById('ctl');
    const dots = document.getElementById('deck_dots');
    if (ctl === null || dots === null) return;
    if (!gTouchQuery.matches) {
        if (gCarousel.on) { // back to the deck row (mouse / trackpad): no traces of the carousel
            gCarousel.on = false;
            gCarousel.keys = '';
            gDeckElements.forEach(({ card }) => { card.style.transform = ''; card.style.opacity = ''; card.style.pointerEvents = ''; });
            carouselSteerEnd(ctl);
        }
        return;
    }
    gCarousel.on = true;
    const cards = carouselCards();
    const keys = cards.map(deckCardKey).join(',');
    if (keys !== gCarousel.keys) {
        gCarousel.keys = keys;
        const row = dots.querySelector('.deck-dots-row');
        row.replaceChildren(...cards.map(() => {
            const dot = document.createElement('span');
            dot.className = 'deck-dot';
            return dot;
        }));
        recenter = true;
    }
    // many cards: the dots get closer; below 5px per dot the bar takes their place
    const room = dots.clientWidth - 32; // padding of .deck-dots
    dots.classList.toggle('as-bar', cards.length > 0 && room / cards.length < 5);
    if (recenter && cards.length > 0) {
        const picked = gLastJson ? gLastJson.selected_card_key : null;
        const target = cards.find(card => deckCardKey(card) === gCarousel.currentKey)
            || cards.find(card => deckCardKey(card) === picked)
            || cards[Math.floor((cards.length - 1) / 2)];
        carouselCenter(target, true);
    }
    carouselFrame();
}

function scheduleCarousel() {
    if (gCarousel.on && !gCarousel.raf) gCarousel.raf = requestAnimationFrame(carouselFrame);
}

/* per frame: size, position and fade by the distance from the middle (cover-flow like), dots / bar.
 * B-77: the falloff is relative to the deck's width, not per card: u = distance from the middle / half
 * the deck width (0 in the middle, 1 at the edge). scale: 1.25 in the middle, times CAROUSEL_EDGE at
 * the edge (at least 0.3); so a wide tray (tablet) shows more large cards, a phone (390px, about 2.8
 * cards per half) looks like B-75 (0.7 per card). The cards move toward the middle by the width they
 * lost, so the gaps shrink along with the cards (pos = the integral of the scaled step). Opacity falls
 * with u; the picked card stays readable (0.85).
 * Visual only (transform): the snap positions stay where the slots are; taps hit the drawn card. */
const CAROUSEL_GROW = 1.25;
const CAROUSEL_EDGE = 0.37; // scale factor at the edge of the deck (0.7 per card on a 390px phone)
function carouselFrame() {
    gCarousel.raf = 0;
    if (!gCarousel.on) return;
    const ctl = document.getElementById('ctl');
    const dots = document.getElementById('deck_dots');
    const cards = carouselCards();
    if (cards.length === 0) return;
    // reads first (layout), then the writes
    const half = Math.max(1, ctl.clientWidth / 2);
    const mid = ctl.scrollLeft + half;
    const centers = cards.map(card => card.parentElement.offsetLeft + card.parentElement.offsetWidth / 2);
    const step = (cards.length > 1 ? centers[1] - centers[0] : 0) || 1;
    const k = Math.log(CAROUSEL_EDGE) * step / half; // ln of the factor per card
    let best = 0;
    let bestDist = Infinity;
    cards.forEach((card, i) => {
        const signed = (centers[i] - mid) / step; // in cards, < 0 left of the middle
        const d = Math.abs(signed);
        const u = d * step / half;                // relative to the deck's width, 1 at its edge
        if (d < bestDist) { bestDist = d; best = i; }
        const fall = Math.exp(k * d);
        const scale = Math.max(0.3, CAROUSEL_GROW * fall);
        const pos = step * CAROUSEL_GROW * (fall - 1) / k; // where the card is drawn, in px
        const shift = Math.sign(signed) * pos - signed * step;
        const opacity = Math.max(card.classList.contains('selected') ? 0.85 : 0.12, 1 - 0.7 * u);
        card.style.transform = 'translateX(' + shift.toFixed(1) + 'px) scale(' + scale.toFixed(3) + ')';
        card.style.opacity = opacity.toFixed(3);
        // far cards pile up faintly at the edges: not tappable, or a tap there would pick a card far away
        card.style.pointerEvents = u > 1.1 ? 'none' : '';
    });
    const currentKey = deckCardKey(cards[best]);
    if (currentKey !== gCarousel.currentKey) {
        gCarousel.currentKey = currentKey;
        if (gCarousel.swiping) carouselTick();
    }
    let pickedIndex = -1;
    dots.querySelectorAll('.deck-dot').forEach((dot, i) => {
        const picked = cards[i] !== undefined && cards[i].classList.contains('selected');
        if (picked) pickedIndex = i;
        dot.classList.toggle('current', i === best);
        dot.classList.toggle('picked', picked);
    });
    // the line below the dots: what you picked (players only; observers have no line, style.css).
    // B-99 (F3): a card with texts in the middle: "tap to pick 3 · Consult" (+ its description in sets with
    // texts; Fibonacci: the control cards with their heading only)
    const line = document.getElementById('deck_pick');
    if (line !== null) setDeckPickLine(line, cards[best], pickedIndex >= 0 ? cards[pickedIndex] : null);
    if (dots.classList.contains('as-bar')) {
        const bar = dots.querySelector('.deck-bar');
        const thumb = dots.querySelector('.deck-bar-thumb');
        const pick = dots.querySelector('.deck-bar-pick');
        const max = ctl.scrollWidth - ctl.clientWidth;
        const frac = max > 0 ? ctl.scrollLeft / max : 0;
        const thumbW = Math.max(18, bar.clientWidth / cards.length);
        thumb.style.width = thumbW + 'px';
        thumb.style.transform = 'translateX(' + (frac * (bar.clientWidth - thumbW)).toFixed(1) + 'px)';
        pick.hidden = pickedIndex < 0;
        if (pickedIndex >= 0) pick.style.left = (pickedIndex / Math.max(1, cards.length - 1) * 100) + '%';
    }
}

/* B-99 (F3): the hint line of the carousel (textContent only) */
function setDeckPickLine(line, middle, picked) {
    const card = deckInfoCard(middle);
    let key;
    let parts;
    if (card === undefined) {
        const pickedCard = picked !== null ? cardByKey(deckCardKey(picked)) : undefined;
        key = pickedCard ? 'p:' + pickedCard.key : '-';
        parts = () => deckPickParts(pickedCard, true, false);
    } else {
        const isPicked = middle === picked;
        key = (isPicked ? 'P:' : 'm:') + card.key + (gDeckTexts ? '+' : '');
        parts = () => deckPickParts(card, isPicked, true);
    }
    if (line.getAttribute('data-shows') === key) return; // only on a change (per frame while swiping)
    line.setAttribute('data-shows', key);
    // F8, D17 (Andreas): the text centred, the description below as well (style.css)
    const body = document.createElement('span');
    body.className = 'deck-pick-body';
    body.append(...parts());
    line.replaceChildren(body);
}

/* the content of the hint line: "tap to pick a card", "you picked 5" or, for a card with texts,
 * "tap to pick 3 · Consult" (+ its description in sets with texts) */
function deckPickParts(card, isPicked, withTexts) {
    if (card === undefined) return [document.createTextNode('tap to pick a card')];
    if (!withTexts) return [document.createTextNode('you picked '), cardSmall(card)];
    const name = document.createElement('b');
    name.append(cardSmall(card, !card.heading), card.heading ? ' · ' + card.heading : '');
    const list = [document.createTextNode(isPicked ? 'you picked ' : 'tap to pick '), name];
    // F7: a description alone (emotions) reads like a heading (one-text)
    if (gDeckTexts && card.info) list.push(Object.assign(document.createElement('span'),
        { className: 'deck-pick-info' + (card.heading ? '' : ' one-text'), textContent: card.info }));
    return list;
}

/* a short tick when a card snaps into the middle while swiping (Android; not for fast flings) */
function carouselTick() {
    const now = performance.now();
    if (now - gCarousel.lastTick < 35 || typeof navigator.vibrate !== 'function') return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    gCarousel.lastTick = now;
    navigator.vibrate(5);
}

/* the deck came to rest (no scroll for 120 ms) */
function carouselRest() {
    gCarousel.swiping = false;
}

function initCarousel() {
    const ctl = document.getElementById('ctl');
    if (ctl === null) return;

    ctl.addEventListener('scroll', () => {
        if (!gCarousel.on || gCarousel.tween) return; // the tween lays out its frames itself
        if (gCarousel.press !== null) gCarousel.swiping = true;
        scheduleCarousel();
        clearTimeout(gCarousel.restTimer);
        gCarousel.restTimer = setTimeout(carouselRest, 120); // no scrollend in iOS Safari yet
    }, { passive: true });

    // tap vs. swipe: a press that starts while the user's swipe is still running only stops it
    ctl.addEventListener('pointerdown', event => {
        gCarousel.tapOk = false;
        gCarousel.lastDown = performance.now();
        if (!gCarousel.on || !event.isPrimary) { gCarousel.press = null; return; }
        carouselSteerEnd(ctl); // the finger takes over: the tween stops, snapping on again
        gCarousel.press = { x: event.clientX, y: event.clientY, t: performance.now(), stops: gCarousel.swiping };
    });
    ctl.addEventListener('pointercancel', () => { // the browser took over (the finger swipes)
        if (gCarousel.press !== null) gCarousel.swiping = true;
        gCarousel.press = null;
        // a swipe that cannot move (first card to the left, last to the right) fires no scroll event:
        // end the swipe anyway, or every later tap would count as stopping it
        clearTimeout(gCarousel.restTimer);
        gCarousel.restTimer = setTimeout(carouselRest, 120);
    });
    ctl.addEventListener('pointerup', event => {
        const p = gCarousel.press;
        gCarousel.press = null;
        if (p === null) return;
        gCarousel.tapOk = !p.stops && performance.now() - p.t < 600
            && Math.hypot(event.clientX - p.x, event.clientY - p.y) < 8;
    });
    // before setC() (on the card): drop clicks that were no tap; keyboard clicks (detail 0) count
    ctl.addEventListener('click', event => {
        if (!gCarousel.on) return;
        // keyboard clicks (detail 0) and clicks without a press of their own (screen readers) count too
        const ok = event.detail === 0 || gCarousel.tapOk || performance.now() - (gCarousel.lastDown || 0) > 1000;
        gCarousel.tapOk = false;
        if (!ok) {
            event.stopPropagation();
            event.preventDefault();
            return;
        }
        const card = event.target instanceof Element ? event.target.closest('#ctl .ctl') : null;
        if (card !== null) carouselCenter(card, false);
    }, true);

    // carousel on / off at runtime (resize, a mouse plugged in): lay out the deck anew
    gTouchQuery.addEventListener('change', () => {
        syncCarousel(true);
        updateDeckRoom();
    });
}

/* B-68, F8: a letter key (DECK_KEY_CODES, physical position) picks (or, on the picked card, takes back) a card
 * like a click, players only (observers have no click handler). Not with a modifier (browser and system
 * shortcuts, Shift, AltGr), not while typing, in the menu or in an overlay. */
function pickCardByKey(event) {
    const n = DECK_KEY_CODES.indexOf(event.code);
    if (n < 0 || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
        || (event.getModifierState && event.getModifierState('AltGraph'))) return;
    if (event.isComposing) return; // an input method is composing a character
    const target = event.target;
    if (target instanceof Element && target.closest('input, textarea, select, [contenteditable], dialog')) return;
    if (target instanceof Element && target.closest('.tbl-pop')) return; // B-110: emoji bar, remove confirm
    const menu = document.getElementById('menu');
    if (menu !== null && menu.open) return;
    if (document.querySelector('.overlay:not(.hidden), .overlay.visible') !== null) return; // name, delete user, QR
    if (connHintVisible()) return; // B-86: no connection, the board cannot be used
    const cards = deckCardElements();
    const card = cards[n];
    if (card === undefined) return;
    event.preventDefault();
    // B-69: a card outside the visible part of the deck comes into view, clear of the edge bars;
    // the first and the last card scroll the deck to its start / end (no bar left there)
    // (touch phones: the carousel brings the clicked card to the middle itself, initCarousel(), B-75)
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    const ctl = card.closest('#ctl');
    if (!gCarousel.on) {
        if (n === 0) ctl.scrollTo({ left: 0, behavior });
        else if (n === cards.length - 1) ctl.scrollTo({ left: ctl.scrollWidth, behavior });
        else card.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior });
    }
    const focused = document.activeElement;
    const focusInDeck = cards.includes(focused);
    const pointerFocus = focusInDeck && gDeckPointerFocus === focused;
    const wasPicked = card.classList.contains('selected');
    card.click();
    // R3 (Andreas, 2026-11-02): the key switches the browser to showing the focus ring (:focus-visible); a deck
    // card that kept the focus (from a click or Tab) would look picked as well. So the focus goes with the key
    // to its card. A card taken back by key loses a focus that came from the pointer (it would still look
    // picked); a keyboard focus stays on it.
    if (!focusInDeck) return;
    if (wasPicked && !card.classList.contains('selected')) {
        if (pointerFocus) focused.blur();
        else if (focused !== card) card.focus({ preventScroll: true });
        return;
    }
    if (focused !== card) {
        card.focus({ preventScroll: true });
        if (pointerFocus) gDeckPointerFocus = card; // still the pointer's focus: a later take-back drops it
    }
}

/* B-92: every board state asked for gets a number; an answer older than the one shown last is
 * dropped (answers may come in any order). B-34: the first answer rendered without an error sets up the
 * page (whichever load brought it: on load, onopen, pull, retry) and asks again right away; an older answer
 * that comes after the set-up is dropped like any other. */
let gDaoSeq = 0;        // board states asked for so far
let gDaoShownSeq = 0;   // number of the board state shown last

let gDaoLoading = 0;     // B-110: dao.php loads in flight
let gAwaySig = null;     // B-127: away_sig of the board state shown last (null: none shown yet / unknown)

/* B-94: a load that fails (network error, HTTP error, no JSON) is tried once more after DAO_RETRY_MS, else the
 * board would stay on the old state until the next pull or heartbeat. Only the latest load is retried (an older
 * one is made void by the newer one), and a load asked for meanwhile replaces the pending retry. The load on page
 * load sets the page up, so its retry is never dropped: it runs, or the load that replaces it does the set-up.
 * B-34: until the page is set up, every failed load is retried without limit, with a growing wait (800 ms,
 * 1.6 s, 3.2 s, then every 5 s; a load that hangs is given up after DAO_BOOT_TIMEOUT_MS: 8 s, 16 s, then 30 s per
 * try, so a slow but working server still gets through), so a short outage on load never leaves the page hidden
 * for good. After the
 * set-up the B-94 rule above applies again (one retry, only the latest load). */
const DAO_RETRY_MS = 800;
const DAO_BOOT_RETRY_MAX_MS = 5000;
let gDaoRetry = null;    // pending retry: {timer, isOnLoad}
let gBootRetryN = 0;     // B-34: retries before the set-up so far (the wait grows with them)
let gBootTryN = 0;       // B-34: loads before the set-up so far (the timeout grows with them)

function updateDao(isOnLoad, isRetry = false) {
    // B-34: no team yet (e.g. a double click before loadBoard() ran): nothing to load
    if (typeof t !== 'string' || t === '') return;
    if (gDaoRetry !== null) { // this load brings the newer state anyway
        clearTimeout(gDaoRetry.timer);
        isOnLoad = isOnLoad || gDaoRetry.isOnLoad;
        gDaoRetry = null;
    }
    const url = './api/dao.php?t=' + encodeURIComponent(t);
    const seq = ++gDaoSeq;
    // B-110: any load does what a pending heartbeat would do (it refreshes last_callback_time and the away state)
    clearTimeout(gHbLoadTimer);
    gHbLoadTimer = null;
    gDaoLoading++;
    // B-73: the timer part of an answer counts only when no own timer change was under way or
    // finished meanwhile (see timerStateFresh)
    const timerWrite = gTimerWrites === 0 ? gTimerWriteGen : -1;

    // B-34: before the set-up a hanging load is given up after DAO_BOOT_TIMEOUT_MS (growing per try), so it runs
    // into the boot retry
    const ctrl = !gBoardSetUp && typeof AbortController === 'function' ? new AbortController() : null;
    const bootTimeout = DAO_BOOT_TIMEOUT_MS[Math.min(gBootTryN, DAO_BOOT_TIMEOUT_MS.length - 1)];
    if (ctrl !== null) gBootTryN++;
    const abortTimer = ctrl !== null ? setTimeout(() => ctrl.abort(), bootTimeout) : 0;
    apiFetch(url, ctrl !== null ? { signal: ctrl.signal } : {})
        .then((response) => {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
        })
        .then((myJson) => {
            clearTimeout(abortTimer);
            if (myJson === null || typeof myJson !== 'object') throw new Error('no board state');
            return myJson;
        })
        .catch((error) => {
            clearTimeout(abortTimer);
            console.log('dao.php failed', error);
            const booting = !gBoardSetUp; // B-34
            if ((booting || !isRetry) && (booting || seq === gDaoSeq || isOnLoad)) {
                const wait = booting
                    ? Math.min(DAO_RETRY_MS * Math.pow(2, gBootRetryN++), DAO_BOOT_RETRY_MAX_MS)
                    : DAO_RETRY_MS;
                const retry = { isOnLoad: isOnLoad, timer: 0 };
                retry.timer = setTimeout(() => {
                    if (gDaoRetry !== retry) return;
                    gDaoRetry = null;
                    console.log('dao.php retry');
                    updateDao(retry.isOnLoad, true);
                }, wait);
                gDaoRetry = retry;
            }
            return null;
        })
        // B-34: no board state is rendered before cards.json and card_catalog.json are there (or given up)
        .then((myJson) => myJson === null ? null : gConfigReady.then(() => myJson))
        .then((myJson) => {
            if (myJson === null) return;

            const setup = !gBoardSetUp; // B-34: the first answer rendered without an error sets up the page
            if (!setup && seq < gDaoShownSeq) return; // B-92: a newer state is shown already
            gDaoShownSeq = Math.max(gDaoShownSeq, seq);
            noteDeckGroup(myJson, seq);
            gAwaySig = typeof myJson.away_sig === 'string' ? myJson.away_sig : null; // B-127

            gLastJson = myJson;
            updateDom(myJson, setup, timerStateFresh(timerWrite));
            gJsonBefore = myJson;

        })
        // not retried: the same state would fail again. B-34: a failed set-up leaves the page hidden; the next
        // answer (pull, heartbeat, reconnect, double click) tries the set-up again, the watchdog offers a reload
        .catch(error => console.log('board update failed', error))
        .finally(() => { gDaoLoading--; });
}

/* V6 (Andreas): when someone else switches the team to another card set (group of card_catalog.json), the others
 * see a toast ("Card set changed to J.U.D.G.E."); otherwise their cards would change without a word. Not on the
 * first load, not for a new variant or other cards of the same set, not for the one who changed it (the deck menu
 * shows it to them): an own deck write counts until a board state asked for after its answer is shown. */
let gShownDeckGroup = null;   // the set group of the board state shown last (null: none yet / unknown)
let gOwnDeckWrites = [];      // own deck writes: {doneSeq} = the last board state asked for before their answer

function isDeckWrite(url) {
    return /\/api\/(update_(deck|cardset)|custom_set_(create|save|delete))\.php/.test(url);
}

/* B-98 S5: what counts as "another card set" for the toast: the group, for a custom set the set itself */
function shownDeckSet(json) {
    const deck = json && json.deck;
    if (!deck || typeof deck.group !== 'string') return null;
    return deck.group === 'custom' ? 'custom:' + deck.id : deck.group;
}

function noteDeckGroup(json, seq) {
    const own = gOwnDeckWrites.length > 0;
    gOwnDeckWrites = gOwnDeckWrites.filter(write => seq <= write.doneSeq);
    const group = shownDeckSet(json);
    if (group === null) return;
    const before = gShownDeckGroup;
    gShownDeckGroup = group;
    if (before === null || before === group || own) return;
    const name = json.deck.group === 'custom' ? customSetName(json) : deckGroupName(group);
    // B-98: who switched (dao deck.changed_by, free text: showToast() sets it with textContent)
    const by = typeof json.deck.changed_by === 'string' ? json.deck.changed_by.trim() : '';
    showToast(by !== '' ? by + ' changed the card set to ' + name : 'Card set changed to ' + name);
}

/* B-98 S5: the name of the team's custom set in play (free text: only ever shown with textContent) */
function customSetName(json) {
    const sets = Array.isArray(json.custom_sets) ? json.custom_sets : [];
    const set = sets.find(entry => entry && entry.deck_id === json.deck.id);
    return set && typeof set.name === 'string' ? set.name : 'your own set';
}

/* the name of a set group (card_catalog.json), else its id */
function deckGroupName(groupId) {
    const groups = gCatalogV2 && Array.isArray(gCatalogV2.groups) ? gCatalogV2.groups : [];
    const group = groups.find(entry => entry && entry.id === groupId);
    return group && typeof group.name === 'string' && group.name !== '' ? group.name : groupId;
}

/* B-110: on every 'hb' of poker-msg (30 s) the board calls home once, 0-5 s later (the boards of a team do not all
 * come at the same moment). The call keeps the own last_callback_time fresh: a board that stops calling (closed,
 * locked phone, frozen tab) shows as away to the others (dao.php "away", AWAY_AFTER_SEC). Only one such call is
 * pending; any dao.php load meanwhile (pull, own write) replaces it, and none starts while a load is in flight.
 * B-127: the call is the light api/seen.php, not dao.php: it returns only away_sig, the signature of the away persons.
 * dao.php is loaded only when it differs from the one of the board state shown last, or when it is unknown, or the
 * call fails (no answer, no JSON, no away_sig): away never gets stuck. B-34: before the page is set up, dao.php is
 * always loaded (a heartbeat retries a set-up that failed; a known away_sig alone does not mean the page shows). */
const HB_LOAD_JITTER_MS = 5000;
let gHbLoadTimer = null;

function scheduleHbLoad() {
    if (gHbLoadTimer !== null) return;
    gHbLoadTimer = setTimeout(() => {
        gHbLoadTimer = null;
        if (gDaoLoading === 0) hbSeen();
    }, Math.round(Math.random() * HB_LOAD_JITTER_MS));
}

function hbSeen() {
    // B-34: before the set-up (or without a known away_sig) always the full board state: a heartbeat then also
    // retries a set-up that failed
    if (gAwaySig === null || !gBoardSetUp) {
        updateDao(false);
        return;
    }
    const seq = gDaoSeq;
    apiFetch('./api/seen.php?t=' + encodeURIComponent(t))
        .then(response => response.json())
        .then(json => {
            if (json === null || typeof json !== 'object' || typeof json.away_sig !== 'string') {
                throw new Error('no away_sig');
            }
            if (gDaoSeq !== seq) return; // a load asked for meanwhile brings the newer state anyway
            if (json.away_sig !== gAwaySig) updateDao(false);
        })
        .catch(error => {
            console.log('seen.php failed', error);
            if (gDaoSeq === seq) updateDao(false);
        });
}

/* B-41: The cards are laid out by CSS (#cbox is a centered flex-wrap container),
 * the DOM order is the display order. When the order changes, the cards glide to
 * their new place via FLIP (First, Last, Invert, Play) with the Web Animations API.
 * When the number of rows changes, the height of #cbox glides along. Resizing the
 * window does not animate anything (B-39). */
const CARD_ANIMATION_MS = 1000;

function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function finishAnimations(element, animationId) {
    element.getAnimations().forEach(animation => {
        if (animation.id === animationId) animation.finish();
    });
}

function cancelAnimations(element, animationId) {
    element.getAnimations().forEach(animation => {
        if (animation.id === animationId) animation.cancel();
    });
}

/* Card positions and widths relative to #cbox, including a running FLIP transform. */
function getCardPositions(cardsDiv) {
    const boxRect = cardsDiv.getBoundingClientRect();
    const positions = new Map();
    Array.from(cardsDiv.children).forEach(card => {
        const rect = card.getBoundingClientRect();
        positions.set(card, { left: rect.left - boxRect.left, top: rect.top - boxRect.top, width: rect.width });
    });
    return positions;
}

/* B-49: fit to table. The cards get the largest width between --card-min and --card-max
 * (style.css, :root) at which all of them fit into the table without scrolling; below
 * --card-min the table scrolls. Gaps and padding scale with the width as in style.css
 * (div#cbox). The result is set as --card-w on #cbox; returns true when it changed.
 * The measured area does not depend on --card-w: the table height comes from the page
 * grid, the width is taken including a possible scrollbar. B-68: the round actions (.dock) and
 * the spread sit outside the table with a fixed height (the column, or the strip above the
 * deck on phones), so the cards keep their size when the first vote, the timer or a new round
 * changes them.
 * The side gutter of #cbox (--card-gutter: the gap between two cards, at least
 * --card-gutter-min) is taken off the width. */
function fitCardsToTable() {
    const cbox = document.getElementById('cbox');
    const table = document.getElementById('table');
    if (cbox === null || table === null) return false;

    const rootStyle = getComputedStyle(document.documentElement);
    const token = name => parseFloat(rootStyle.getPropertyValue(name));
    const min = token('--card-min');
    const max = token('--card-max');
    const ratio = token('--card-ratio');
    const delMin = token('--card-del-min') || 0;
    const gutterMin = token('--card-gutter-min') || 0;
    const nameH = token('--card-name-h') || 0; // B-99: the name tag above the card
    if (!(min > 0 && max >= min && ratio > 0)) return false;

    const tableStyle = getComputedStyle(table);
    const width = table.offsetWidth - parseFloat(tableStyle.paddingLeft) - parseFloat(tableStyle.paddingRight);

    // #cbox: margin-top, 4px padding on top, 2px below the gap under the last row, 1px to spare
    // B-110: minus the observers row below the cards (with its margins)
    // B-52 S1c: minus the team's note above the cards
    // B-151: minus the summary line below the cards (anonymous mode after the reveal)
    const height = table.clientHeight - parseFloat(getComputedStyle(cbox).marginTop) - 7 - observersHeight()
        - boardNoteHeight() - tableSummaryHeight();

    const n = cbox.children.length;
    let fit = min;
    for (let w = max; w > min; w--) {
        const gapX = 0.1 * w;
        const gapY = Math.max(delMin, 0.2 * w) / 2 + 0.1 * w;
        const inner = width - 2 * Math.max(gutterMin, gapX);
        // half a pixel to spare: the browser must not wrap a card earlier than computed
        const cols = Math.max(1, Math.floor((inner + gapX - 0.5) / (w + gapX)));
        const rows = Math.ceil(n / cols);
        if (rows * (nameH + w * ratio + gapY) <= height) {
            fit = w;
            break;
        }
    }

    const value = fit + 'px';
    if (cbox.style.getPropertyValue('--card-w') === value) return false;
    cbox.style.setProperty('--card-w', value);
    return true;
}

function removeCards(cardsDiv, players) {
    Array.from(cardsDiv.children).forEach(card => {
        if (players.find(player => player.mkey === card.id) === undefined) {
            card.remove();
        }
    });
}

/* Updates image and name of the existing cards; returns the cards whose
 * revealed value changed (they get the shake animation). */
function updateCards(cardsDiv, players) {
    const valueChangedCards = [];

    Array.from(cardsDiv.children).forEach(card => {

        if (card.classList.contains('c_fade-in')) {
            setTimeout(function () {
                removeStyleClass(card, 'c_fade-in');
            }, 1800);
        }

        let player = players.find(p => p.mkey === card.id);

        // B-99 (F1): compared by the card key (data-card), not by the image
        const oldKey = card.getAttribute('data-card');
        const newKey = String(player.display_card_key);
        const awayFace = player.away === true && isThinkingCardKey(newKey);
        if (oldKey === newKey && (card.getAttribute('data-away-face') === 'true') !== awayFace) {
            setTableCardFace(card, newKey, player.away === true); // L30a: thinking <-> away, same card
        }
        if (oldKey !== newKey) {
            setTableCardFace(card, newKey, player.away === true);
            removeStyleClass(card, 'cardValueChanged');
            if (!isStatusCardKey(oldKey) && !isStatusCardKey(newKey)) {
                valueChangedCards.push(card);
            }
        }
        // B-104: the original card of the reveal behind the current one (after the face, it sets the label)
        setTableCardOriginal(card, player.original_card_key, true);

        const nameSpan = card.getElementsByClassName('card_player_name')[0];
        if (nameSpan.textContent !== player.name) nameSpan.textContent = player.name;
        // B-151: the AI mark in front of the name (style.css .c.via-ai), the reason in the tooltip
        const viaAi = viaAiCard(player);
        if (card.classList.contains('via-ai') !== viaAi) card.classList.toggle('via-ai', viaAi);
        setAttrIfChanged(nameSpan, 'title', nameTitle(player.name, viaAi));
        // B-110: no connection for a while (dao.php "away"); attributes only when they change (quiet re-render)
        const away = player.away === true;
        if (card.classList.contains('is-away') !== away) card.classList.toggle('is-away', away);
        setAttrIfChanged(card.querySelector('.delete'), 'aria-label', deleteLabel(player.name, away, card.classList.contains('is-me')));
        const react = card.querySelector('.react');
        if (react !== null) setAttrIfChanged(react, 'aria-label', reactLabel(player.name));
        const nudge = card.querySelector('.nudge');
        if (nudge !== null) setAttrIfChanged(nudge, 'aria-label', nudgeLabel(player.name));
    });

    return valueChangedCards;
}

/* B-99: the face of a card on the table for a card key (a card of the deck or a status card:
 * prgrss1/prgrss2 thinking, done001 ready). The key is kept in data-card; F2: the face is rendered
 * (cards.js). A key the client does not know (e.g. a newer card) shows as its key. */
function tableCardModel(key, away = false) {
    // R3 review V10 (L30a): no card yet and no connection: "away" instead of "thinking"
    if (away && isThinkingCardKey(key)) return { ...STATUS_CARDS[key], caption: 'away', aria: 'away \u2013 no connection' };
    return STATUS_CARDS[key] || cardByKey(key) || { key, text: key, heading: null, info: null, style: 'plain' };
}

function isThinkingCardKey(key) {
    return key === 'prgrss1' || key === 'prgrss2';
}

function setTableCardFace(cardDiv, key, away = false) {
    cardDiv.setAttribute('data-card', key);
    cardDiv.setAttribute('data-away-face', away && isThinkingCardKey(key) ? 'true' : 'false');
    const card = tableCardModel(key, away);
    // F8 (Andreas): every card on the table shows all its texts; control cards heading and description in
    // every set (small cards shorten the description, style.css "Rendered cards")
    const face = cardFace(card, 'table', true);
    const old = cardDiv.querySelector('.pc:not(.pc-orig)');
    if (old === null) cardDiv.insertBefore(face, cardDiv.querySelector('.nudge, .react, .delete'));
    else old.replaceWith(face);
}

/* B-104: a card changed after the reveal shows as a stack in the place of one card: the original card of the
 * reveal behind (upper left, its value small in the visible rim), the current card on top (lower right). key null (or a status card, or the current card) = no stack. The
 * label of the top card says both values. animate: the original slides back when the stack appears. */
function setTableCardOriginal(cardDiv, key, animate) {
    const current = cardDiv.getAttribute('data-card');
    const original = key === null || key === undefined || isStatusCardKey(current) || isStatusCardKey(String(key))
        || String(key) === current ? null : String(key);
    const oldOriginal = cardDiv.getAttribute('data-original');
    const top = cardDiv.querySelector('.pc:not(.pc-orig)');
    let back = cardDiv.querySelector('.pc-orig');

    if (original === null) {
        cardDiv.removeAttribute('data-original');
        cardDiv.classList.remove('is-changed');
        if (back !== null) {
            back.remove();
            top.setAttribute('aria-label', cardAriaLabel(tableCardModel(current), true));
        }
        return;
    }
    if (original !== oldOriginal || back === null) {
        const face = cardFace(tableCardModel(original), 'table', true);
        face.classList.add('pc-orig');
        face.removeAttribute('role');
        face.removeAttribute('aria-label');
        face.setAttribute('aria-hidden', 'true');
        // its value in the visible upper rim, like the corner index of a playing card. Andreas: the card's own
        // symbol (as drawn on the card, small, full opacity, in the card colour; a text value in the card's style),
        // not the mono text of cardSmall()
        const corner = document.createElement('span');
        corner.className = 'pc-corner';
        corner.appendChild(cardFace(tableCardModel(original), 'mini'));
        face.appendChild(corner);
        if (back === null && animate && oldOriginal === null) {
            face.classList.add('pc-orig-in'); // once: moving the card would restart it
            face.addEventListener('animationend', () => face.classList.remove('pc-orig-in'), { once: true });
        }
        if (back === null) cardDiv.insertBefore(face, top);
        else back.replaceWith(face);
        back = face;
    }
    cardDiv.setAttribute('data-original', original);
    cardDiv.classList.add('is-changed');
    const model = tableCardModel(current);
    top.setAttribute('aria-label', cardAriaLabel(model, true)
        + ', changed from ' + cardName(tableCardModel(original)) + ' to ' + cardName(model));
}

/* all faces on the table anew (the deck switched between symbols only and texts) */
function refreshTableFaces() {
    document.querySelectorAll('#cbox .c').forEach(card => {
        const original = card.getAttribute('data-original');
        setTableCardFace(card, card.getAttribute('data-card'), card.classList.contains('is-away'));
        card.removeAttribute('data-original'); // the original face anew, too
        setTableCardOriginal(card, original, false);
    });
}

/* B-99 D16: the trash can of the delete button: a tinted body with hatching (currentColor), the outline in the
 * ink of the cards, a lid that tilts on hover (style.css). Static paths only, no user data. */
const DELETE_ICON_PATHS = [
    { d: 'M6.3 8.4l.9 11.3c.1.9.6 1.4 1.5 1.4l6.7-.1c.9 0 1.4-.5 1.5-1.4l.9-11.2', cls: 'body' },
    { d: 'M7.6 12.1l2.6-2.2M7.8 15.4l5.6-4.9M8.1 18.6l7.4-6.6M10.6 20.6l5-4.4', cls: 'hatch', w: 1 },
    { d: 'M6.3 8.4l.9 11.3c.1.9.6 1.4 1.5 1.4l6.7-.1c.9 0 1.4-.5 1.5-1.4l.9-11.2', cls: 'ink', w: 1.9 },
    { d: 'M4.3 7.1l7.6-.3 7.8.2', cls: 'ink', w: 2.1, lid: true },
    { d: 'M9.6 6.8c-.1-1.6.4-2.4 2.3-2.4 2 0 2.5.8 2.5 2.4', cls: 'ink', w: 1.7, lid: true },
];

/* the tooltip of a name on the table: the full name (when it ends with an ellipsis); B-151: via an AI assistant
 * (dao.php via_ai) it says so. Set as an attribute only (no HTML). */
function nameTitle(name, viaAi = false) {
    return viaAi ? name + ' \u2013 joined via an AI assistant' : name;
}

function deleteLabel(name, away = false, isMe = false) {
    if (isMe) return 'Remove yourself from the table'; // B-110: the own card (.is-me)
    return 'Remove ' + name + ' from the table' + (away ? ' (no connection)' : ''); // B-110: away
}

/* a sketched 24x24 icon from static paths; paths with lid: true go into a group .lid (it tilts, style.css) */
function sketchIcon(paths) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const lid = document.createElementNS(NS, 'g');
    lid.setAttribute('class', 'lid');
    paths.forEach(p => {
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', p.d);
        path.setAttribute('class', p.cls);
        if (p.w) path.setAttribute('stroke-width', String(p.w));
        (p.lid ? lid : svg).appendChild(path);
    });
    if (lid.hasChildNodes()) svg.appendChild(lid);
    return svg;
}

function deleteIcon() {
    return sketchIcon(DELETE_ICON_PATHS);
}

/* ---------- B-110: table interaction (markup contract: style.css "Table interaction") ----------
 * Every other card and every other observer has its circles: the nudge (.nudge, shakes the card on every board,
 * anonymous), the smiley (.react, opens the emoji bar #react_bar) and, on cards only, the trash can (.delete).
 * Desktop: the circles on hover / keyboard focus.
 * Touch devices ((hover: none), (pointer: coarse), tablets included): a tap on a card or an observer opens it
 * (.is-open, one at a time, a tap elsewhere closes it); a hint once (#tap_hint).
 * Removing always asks first (#rm_confirm, Esc / Cancel: the focus goes back to the trash can).
 * All names via textContent. The clicks go through one handler (onTableClick). */
const gTapQuery = window.matchMedia('(hover: none), (pointer: coarse)');
const TAP_HINT_KEY = 'TAP_HINT_SEEN';
const POP_GAP = 10;     // between a popover and its anchor (the arrow sits in it)
const POP_MARGIN = 8;   // to the edge of the window

let gPop = null;            // the open popover: { el, anchor, holder, opener }
let gTapHintShown = false;  // once per page, also when localStorage is not available

/* sets an attribute only when its value changes (a re-render with the same state changes nothing) */
function setAttrIfChanged(el, name, value) {
    if (el !== null && el.getAttribute(name) !== value) el.setAttribute(name, value);
}

/* B-110: the row "observing" below the cards: the connected observers (dao.php "observers", away ones are left out
 * by the API), the own one as a name tag like in the header (.is-me, no smiley). Updated in place, by mkey. */
function updateObservers(observers, myMkey) {
    const box = document.getElementById('observers');
    if (box === null) return;
    const list = box.querySelector('.obs-list');
    const existing = new Map(Array.from(list.children).map(li => [li.dataset.okey, li]));
    let next = list.firstElementChild;
    let masked = 0;
    observers.forEach(o => {
        /* B-163: in anonymous mode after the reveal the other observers come as '******' without mkey: kept apart by
         * their position only (all of them look the same), no smiley or nudge (nothing to aim at) */
        const mkey = o.mkey === null || o.mkey === undefined ? '' : String(o.mkey);
        const okey = mkey !== '' ? mkey : 'masked-' + masked++;
        let li = existing.get(okey);
        if (li === undefined) {
            li = document.createElement('li');
            li.className = 'obs';
            li.dataset.okey = okey;
            li.dataset.mkey = mkey;
            const span = document.createElement('span');
            span.className = 'obs-name';
            li.appendChild(span);
        }
        existing.delete(okey);
        const span = li.querySelector('.obs-name');
        const name = String(o.name);
        if (span.textContent !== name) span.textContent = name; // no title: the name is right there (B-110)
        // B-151: the AI mark after the eye (style.css .obs.via-ai); then a title tells what it means
        const viaAi = o.via_ai === true;
        if (li.classList.contains('via-ai') !== viaAi) li.classList.toggle('via-ai', viaAi);
        if (viaAi) setAttrIfChanged(span, 'title', nameTitle(name, true));
        else if (span.hasAttribute('title')) span.removeAttribute('title');
        const isMe = mkey === myMkey;
        if (li.classList.contains('is-me') !== isMe) li.classList.toggle('is-me', isMe);
        syncReactButton(li, !isMe && mkey !== '', name);
        if (li !== next) list.insertBefore(li, next);
        else next = li.nextElementSibling;
    });
    existing.forEach(li => li.remove());
    if (box.hidden !== (observers.length === 0)) box.hidden = observers.length === 0;
}

/* B-151: anonymous mode after the reveal: the cards show neither the AI mark nor "away" (dao.php sets both false for
 * the other players); one line below the cards (#table_summary) gives the team counts ai_count (players and observers)
 * and away_count. A part with 0 drops out, the line with both 0. Numbers via textContent. The own card keeps its
 * flags in dao.php; the board hides its mark too (viaAiCard()), so no card carries one. */
let gAnonRevealed = false; // set by updateTableSummary() before the cards are updated

function updateTableSummary(myJson) {
    const box = document.getElementById('table_summary');
    if (box === null) return;
    const anonRevealed = myJson.anonymous_mode === 1 && myJson.all_players_ready === true && myJson.players_count > 0;
    gAnonRevealed = anonRevealed;
    const ai = anonRevealed ? Number(myJson.ai_count) || 0 : 0;
    const away = anonRevealed ? Number(myJson.away_count) || 0 : 0;
    const part = (cls, n) => {
        const el = box.querySelector('.' + cls);
        const num = el.querySelector('.' + cls + '-n');
        if (num.textContent !== String(n)) num.textContent = String(n);
        if (el.hidden !== (n === 0)) el.hidden = n === 0;
    };
    part('ts-ai', ai);
    part('ts-away', away);
    if (box.hidden !== (ai + away === 0)) box.hidden = ai + away === 0;
}

function viaAiCard(player) {
    return player.via_ai === true && !gAnonRevealed;
}

function tableSummaryHeight() {
    const box = document.getElementById('table_summary');
    if (box === null || box.hidden) return 0;
    const style = getComputedStyle(box);
    return box.offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
}

/* the height the observers row takes from the table, with its margins (0 when hidden) */
/* B-52 S1c: the note above the cards (#board_note) with its margins; 0 without a note */
function boardNoteHeight() {
    const box = document.getElementById('board_note');
    if (box === null || box.hidden) return 0;
    const style = getComputedStyle(box);
    return box.offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
}

function observersHeight() {
    const box = document.getElementById('observers');
    if (box === null || box.hidden) return 0;
    const style = getComputedStyle(box);
    return box.offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
}

/* the card (.c) or observer (.obs) a smiley or trash can belongs to; its mkey and name */
function holderOf(el) {
    return el.closest('#cbox .c, #observers .obs');
}

function holderMkey(holder) {
    if (holder.classList.contains('obs')) return holder.dataset.mkey;
    // B-163: the own card may carry its anonymous handle as id; delete.php (own trash can) needs the real mkey
    if (holder.classList.contains('is-me') && gLastJson !== null) return String(gLastJson.mkey);
    return holder.id;
}

/* B-163: the id of the own card on the table (dao.php card_mkey: in anonymous mode after the reveal every card has a
 * handle per round instead of the mkey, the own one too); an older dao.php without it: the own mkey */
function ownCardMkey(myJson) {
    return String(myJson.card_mkey ?? myJson.mkey);
}

function holderName(holder) {
    const span = holder.querySelector('.card_player_name, .obs-name');
    return span === null ? '' : span.textContent;
}

/* touch: the tap mode, also alone at the table (R3 review E6: the own trash can only after a tap, as with others).
 * #table.tap-mode marks it for style.css; set on start and when the device changes (e.g. a mouse plugged in). */
function tapMode() {
    return gTapQuery.matches;
}

function syncTapModeClass() {
    const table = document.getElementById('table');
    if (table !== null) table.classList.toggle('tap-mode', tapMode());
}

/* touch: while a popover or the circles of a card are open, a tap into the header only closes them
 * (R3 review E5: the team name would copy the link). Capture phase: before the onclick of the button. */
function onHeadClickCapture(event) {
    if (!tapMode()) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target === null || target.closest('header.head') === null) return;
    if (gPop === null && document.querySelector('#cbox .c.is-open, #observers .obs.is-open') === null) return;
    closePopover(false);
    setOpenHolder(null);
    event.preventDefault();
    event.stopPropagation();
}

function setOpenHolder(holder) {
    document.querySelectorAll('#cbox .c.is-open, #observers .obs.is-open').forEach(el => {
        if (el !== holder) el.classList.remove('is-open');
    });
    if (holder !== null) holder.classList.add('is-open');
}

/* places a popover (position: fixed) above its anchor, below when there is no room; the arrow points at the middle
 * of the anchor (--arrow-x). The popover has to be shown already (it is measured). */
function placePopover(el, anchor) {
    const a = anchor.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const mid = a.left + a.width / 2;
    const left = Math.max(POP_MARGIN, Math.min(mid - w / 2, vw - w - POP_MARGIN));
    let top = a.top - h - POP_GAP;
    const below = top < POP_MARGIN && a.bottom + POP_GAP + h <= vh - POP_MARGIN;
    if (below) top = a.bottom + POP_GAP;
    el.classList.toggle('is-below', below);
    el.style.left = Math.round(left) + 'px';
    el.style.top = Math.round(Math.max(POP_MARGIN, top)) + 'px';
    el.style.setProperty('--arrow-x', Math.round(Math.max(14, Math.min(mid - left, w - 14))) + 'px');
}

function openPopover(el, anchor, holder, opener) {
    closePopover(false);
    gPop = { el, anchor, holder, opener };
    el.hidden = false;
    placePopover(el, anchor);
    if (opener !== null && opener.classList.contains('react')) opener.setAttribute('aria-expanded', 'true');
}

/* closes the open emoji bar or remove confirm; focusBack: the focus goes back to the button that opened it */
function closePopover(focusBack) {
    if (gPop === null) return;
    const { el, opener } = gPop;
    gPop = null;
    el.hidden = true;
    if (opener !== null && opener.classList.contains('react')) opener.setAttribute('aria-expanded', 'false');
    if (!tapMode()) setOpenHolder(null); // without the tap mode .is-open only marks the card of the remove confirm
    if (focusBack && opener !== null && opener.isConnected) opener.focus({ preventScroll: true });
}

/* after a re-render: a popover whose card or observer is gone closes, the others follow their anchor */
function repositionPopover() {
    if (gPop === null) return;
    if (!gPop.anchor.isConnected || !gPop.holder.isConnected) {
        const hadFocus = gPop.el.contains(document.activeElement);
        closePopover(false);
        if (hadFocus) document.body.focus();
        return;
    }
    placePopover(gPop.el, gPop.anchor);
}

function openRemoveConfirm(btn) {
    const holder = holderOf(btn);
    if (holder === null) return;
    const box = document.getElementById('rm_confirm');
    // B-110: the own card asks "Remove yourself from the table?"
    const isMe = holder.classList.contains('is-me');
    const name = holderName(holder);
    box.querySelector('.rm-name').textContent = isMe ? 'yourself' : name;
    box.querySelector('.rm-hint').textContent = (isMe ? 'You' : name) + ' can rejoin at any time.';
    box.dataset.mkey = holderMkey(holder);
    setOpenHolder(holder);
    openPopover(box, btn, holder, btn);
    box.querySelector('.rm-cancel').focus({ preventScroll: true });
}

/* one click handler for the table, the observers and the popovers (document, bubbling) */
function onTableClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (target === null) return;

    // the emoji bar and the remove confirm
    const emoji = target.closest('#react_bar button[data-react]');
    if (emoji !== null) {
        const code = emoji.dataset.react;
        const to = document.getElementById('react_bar').dataset.to;
        if (emoji.getAttribute('aria-disabled') === 'true') { reactUsedUpHint(emoji); return; } // B-139: bar stays
        closePopover(true);
        if (Object.hasOwn(REACT_EMOJI, code) && to) sendReaction(to, code);
        return;
    }
    if (target.closest('#rm_confirm .rm-cancel') !== null) { closePopover(true); return; }
    if (target.closest('#rm_confirm .rm-ok') !== null) {
        const mkey = document.getElementById('rm_confirm').dataset.mkey;
        closePopover(false);
        setOpenHolder(null);
        if (mkey) deletePlayer(mkey);
        return;
    }
    if (target.closest('#tap_hint .tap-hint-ok') !== null) { hideTapHint(true); return; }
    if (target.closest('.tbl-pop') !== null) return;

    // the circles
    const nudge = target.closest('#cbox .c .nudge, #observers .obs .nudge');
    if (nudge !== null) {
        hideTapHint(true);
        closePopover(false);
        const holder = holderOf(nudge);
        if (holder !== null) sendReaction(holderMkey(holder), REACT_NUDGE);
        return;
    }
    const react = target.closest('#cbox .c .react, #observers .obs .react');
    if (react !== null) {
        hideTapHint(true);
        if (gPop !== null && gPop.opener === react) closePopover(false);
        else openReactBar(react);
        return;
    }
    const del = target.closest('#cbox .c .delete');
    if (del !== null) {
        hideTapHint(true);
        // B-110 (Andreas): removing always asks first, also with a mouse or the keyboard
        if (gPop !== null && gPop.opener === del) closePopover(false);
        else openRemoveConfirm(del);
        return;
    }

    // a tap elsewhere closes an open popover first, with the circles of its card (and does nothing else)
    if (gPop !== null) {
        closePopover(false);
        setOpenHolder(null);
        return;
    }

    // touch: a tap on a card or an observer opens its circles, a second tap or a tap elsewhere closes them
    if (!tapMode()) return;
    const holder = holderOf(target);
    if (holder !== null && holder.querySelector(':scope > .react, :scope > .delete') !== null) {
        hideTapHint(true);
        setOpenHolder(holder.classList.contains('is-open') ? null : holder);
    } else {
        setOpenHolder(null);
    }
}

/* the keys in the emoji bar (arrows, Home/End, Esc, Tab) and in the remove confirm (Esc) */
function onPopoverKeydown(event) {
    if (gPop === null || !gPop.el.contains(event.target)) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closePopover(true);
        return;
    }
    if (gPop.el.id !== 'react_bar') return;
    const buttons = Array.from(gPop.el.querySelectorAll('button[data-react]'));
    const i = buttons.indexOf(document.activeElement);
    let n = -1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') n = (i + 1) % buttons.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') n = (i - 1 + buttons.length) % buttons.length;
    else if (event.key === 'Home') n = 0;
    else if (event.key === 'End') n = buttons.length - 1;
    else if (event.key === 'Tab') {
        // a menu: Tab leaves it, back on the smiley
        event.preventDefault();
        closePopover(true);
        return;
    } else return;
    event.preventDefault();
    event.stopPropagation(); // no card pick, no name overlay keys (document listener)
    buttons[n].focus();
}

/* Touch, once: where the circles are. At the first card with a smiley; "Got it" or using a card hides it for good
 * (localStorage; without it once per page). */
function tapHintSeen() {
    try {
        return localStorage.getItem(TAP_HINT_KEY) === '1';
    } catch (e) {
        return false;
    }
}

function showTapHint() {
    if (gTapHintShown || !tapMode() || tapHintSeen() || gPop !== null || connHintVisible()) return;
    if (document.querySelector('.overlay.visible, .overlay:not(.hidden)') !== null) return; // name input etc.
    const menu = document.getElementById('menu');
    if (menu !== null && menu.open) return;
    const card = document.querySelector('#cbox .c:not(.is-me) > .pc, #observers .obs:not(.is-me) .obs-name');
    const hint = document.getElementById('tap_hint');
    if (card === null || hint === null) return;
    gTapHintShown = true;
    hint.querySelector('p').textContent = 'Tap someone\'s card to nudge them, throw an emoji or remove them from the table.';
    hint.querySelector('.tap-hint-ok').textContent = 'Got it';
    hint.hidden = false;
    placePopover(hint, card);
    gTapHintAnchor = card;
}

let gTapHintAnchor = null;

function hideTapHint(seen) {
    const hint = document.getElementById('tap_hint');
    if (hint === null || hint.hidden) return;
    hint.hidden = true;
    gTapHintAnchor = null;
    if (seen) {
        try {
            localStorage.setItem(TAP_HINT_KEY, '1');
        } catch (e) {
            // private mode etc.: shown once per page only
        }
    }
}

function repositionTapHint() {
    const hint = document.getElementById('tap_hint');
    if (hint === null || hint.hidden) return;
    if (gTapHintAnchor === null || !gTapHintAnchor.isConnected) { hideTapHint(false); return; }
    placePopover(hint, gTapHintAnchor);
}

/* after every board update: popovers follow their anchor (also after a glide), without the tap mode nothing stays
 * open, the tap hint shows once */
function afterTableUpdate() {
    repositionPopover();
    repositionTapHint();
    if (!tapMode()) {
        if (gPop === null) setOpenHolder(null);
        hideTapHint(false);
    }
    // after a glide: at the new place; the tap hint once the new card has arrived
    clearTimeout(afterTableUpdate.timer);
    afterTableUpdate.timer = setTimeout(() => {
        repositionPopover();
        repositionTapHint();
        showTapHint();
    }, CARD_ANIMATION_MS + 50);
}

function initTableInteraction() {
    document.addEventListener('click', onTableClick);
    document.addEventListener('click', onHeadClickCapture, true);
    syncTapModeClass();
    const onTapQueryChange = () => {
        syncTapModeClass();
        if (!tapMode()) setOpenHolder(null);
    };
    if (typeof gTapQuery.addEventListener === 'function') gTapQuery.addEventListener('change', onTapQueryChange);
    else if (typeof gTapQuery.addListener === 'function') gTapQuery.addListener(onTapQueryChange); // Safari < 14
    document.addEventListener('keydown', onPopoverKeydown, true);
    document.addEventListener('keydown', onReactKeyRepeat, true);
    window.addEventListener('storage', onReactUsedStorage); // B-139
    updateReactBarQuota();
    const reposition = () => { repositionPopover(); repositionTapHint(); };
    window.addEventListener('resize', reposition);
    document.getElementById('table').addEventListener('scroll', reposition, { passive: true });
}

function createCardDiv(player, playersCount, isOnLoad) {
    let newCard = document.createElement('div');
    newCard.id = player.mkey;
    newCard.classList.add('c');
    if (!isOnLoad && playersCount>1) newCard.classList.add('c_fade-in');

    // B-76/B-99: the name tag above the card
    let cardSpan = document.createElement('span');
    cardSpan.classList.add('card_player_name');
    cardSpan.textContent = player.name;
    cardSpan.title = nameTitle(player.name, viaAiCard(player));
    newCard.appendChild(cardSpan);
    newCard.classList.toggle('via-ai', viaAiCard(player)); // B-151: the AI mark (style.css)

    // B-99 D16: a real button (focusable, named), a sketched trash can inside
    let cardDeleteBtn = document.createElement('button');
    cardDeleteBtn.type = 'button';
    cardDeleteBtn.classList.add('delete');
    cardDeleteBtn.setAttribute('aria-label', deleteLabel(player.name, player.away === true));
    cardDeleteBtn.title = 'Remove from the table';
    cardDeleteBtn.appendChild(deleteIcon());
    // B-110: the click is handled by onTableClick (always asks first, #rm_confirm)
    newCard.appendChild(cardDeleteBtn);
    if (player.away === true) newCard.classList.add('is-away');
    setTableCardFace(newCard, String(player.display_card_key), player.away === true);
    setTableCardOriginal(newCard, player.original_card_key, false); // B-104

    return newCard;
}

/* Brings the cards into display order. Only cards that are out of place are
 * moved: moving a node restarts its CSS animations (fade-in, shake). The cards
 * that stay are the longest run already in the right relative order. */
function arrangeCards(cardsDiv, orderedCards) {
    const targetIndex = new Map(orderedCards.map((card, i) => [card, i]));
    const current = Array.from(cardsDiv.children).map(card => targetIndex.get(card));

    // longest increasing subsequence of the current target indexes (n is small, O(n^2) is fine)
    const runLength = current.map(() => 1);
    const previous = current.map(() => -1);
    let best = -1;
    for (let i = 0; i < current.length; i++) {
        for (let j = 0; j < i; j++) {
            if (current[j] < current[i] && runLength[j] + 1 > runLength[i]) {
                runLength[i] = runLength[j] + 1;
                previous[i] = j;
            }
        }
        if (best < 0 || runLength[i] > runLength[best]) best = i;
    }
    const staying = new Set();
    for (let i = best; i >= 0; i = previous[i]) staying.add(current[i]);

    // from the end: insert every other card in front of its successor
    let next = null;
    for (let i = orderedCards.length - 1; i >= 0; i--) {
        const card = orderedCards[i];
        if (!staying.has(i)) cardsDiv.insertBefore(card, next);
        next = card;
    }
}

function updatePlayersCards(players, isOnLoad, anonymousMode) {
    let cardsDiv = document.getElementById("cbox");
    const reducedMotion = prefersReducedMotion();
    const flip = !anonymousMode && !reducedMotion;

    // First: where the cards are now (mid-glide if a FLIP is running) and the current height
    const firstPositions = getCardPositions(cardsDiv);
    const hadCards = cardsDiv.children.length > 0;
    const firstHeight = parseFloat(getComputedStyle(cardsDiv).height);
    Array.from(cardsDiv.children).forEach(card => cancelAnimations(card, 'flip'));
    cancelAnimations(cardsDiv, 'height');

    removeCards(cardsDiv, players);
    const valueChangedCards = updateCards(cardsDiv, players);

    let cardsHaveBeenAdded = false;
    const existingCards = new Map(Array.from(cardsDiv.children).map(card => [card.id, card]));
    const orderedCards = players
        .slice()
        .sort((a, b) => a.i - b.i)
        .map(player => {
            let card = existingCards.get(player.mkey);
            if (card === undefined) {
                card = createCardDiv(player, players.length, isOnLoad);
                cardsHaveBeenAdded = true;
            }
            return card;
        });
    arrangeCards(cardsDiv, orderedCards);
    // B-49: the card size follows the number of cards; the change glides with the FLIP below
    fitCardsToTable();

    // Last + Invert + Play
    const lastPositions = getCardPositions(cardsDiv);
    const movedCards = new Set();
    if (flip) {
        firstPositions.forEach((first, card) => {
            const last = lastPositions.get(card);
            if (last === undefined) return; // removed
            const dx = first.left - last.left;
            const dy = first.top - last.top;
            const scale = last.width > 0 ? first.width / last.width : 1;
            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(first.width - last.width) < 0.5) return;
            movedCards.add(card);
            // scaled from the top left corner, so the translation applies to that corner
            card.animate(
                [{ transform: `translate(${dx}px, ${dy}px) scale(${scale})`, transformOrigin: '0 0' },
                 { transform: 'none', transformOrigin: '0 0' }],
                { id: 'flip', duration: CARD_ANIMATION_MS, easing: 'ease' });
        });
    }

    // the shake would be hidden by the glide, so it starts when the card has arrived
    valueChangedCards.forEach(card => {
        const delay = movedCards.has(card) ? CARD_ANIMATION_MS : 10;
        setTimeout(() => {
            addStyleClass(card, 'cardValueChanged');
            card.addEventListener('animationend', function onShakeEnd(e) {
                if (e.animationName !== 'shake') return;
                removeStyleClass(card, 'cardValueChanged');
                card.removeEventListener('animationend', onShakeEnd);
            });
        }, delay);
    });

    // the height glides when the number of rows changes (not on the first render)
    const lastHeight = parseFloat(getComputedStyle(cardsDiv).height);
    if (hadCards && !reducedMotion && Math.abs(firstHeight - lastHeight) >= 1) {
        cardsDiv.animate(
            [{ height: firstHeight + 'px' }, { height: lastHeight + 'px' }],
            { id: 'height', duration: CARD_ANIMATION_MS, easing: 'ease' });
    }

    return cardsHaveBeenAdded;
}

function updateDom(myJson, isOnLoad, timerFresh = true) {

    if (myJson === 0) return;
    addCustomCards(myJson, gCardByKey); // B-98 S5: custom cards of the team's sets and on the table (deck.js)

    if (!gAllPlayersReady
        && myJson.all_players_ready
        && myJson.needs_celebration
        && !isOnLoad) showConfetty(myJson.players_count);

    gAllPlayersReady = myJson.all_players_ready;
    gUserName = myJson.name;
    updateFeedbackDot(myJson.hide_teaser === 1); // B-57

    checkRadio('cet_user_type', myJson.player_type === "PLAYER" ? 'PLAYER' : 'OBSERVER');
    playerTypeUpdate(myJson.player_type, myJson.name, myJson.team_name);

    // B-52 S1: the topic, or the active topic item where the topic stands (topics.js)
    updateTopicView(myJson);
    syncTopicField(); // the note field in the open menu follows the board (script_feedback.js)

    if (document.getElementById("team_name").innerText !== myJson.team_name
        || gJsonBefore === null // B-34: a set-up that failed half-way may have set the name already
        || myJson.players_count !== gJsonBefore.players_count
        || myJson.ready_players_count !== gJsonBefore.ready_players_count
    ) {
        // R3 review V10 (L7): "2/5 voted · Team Phoenix – Agile Poker"
        setPageTitle(myJson.ready_players_count + '/' + myJson.players_count + ' voted \u00b7 '
            + myJson.team_name + ' \u2013 Agile Poker');
        document.getElementById("team_name").innerText = myJson.team_name;
    }

    if (isOnLoad) {

        if (myJson.color_mode && myJson.color_mode.length > 0) {
            gColorMode = myJson.color_mode;
            storeColorMode(gColorMode); // B-141: the server wins over the mode kept on this device
        }

        setColor();

    }

    setTeamDeck(myJson);
    updateDeckMenu(myJson); // R3 F5 (script_deck.js)

    // B-34: on load too, so the page shows complete at once (on load: no fade-in, no glide)
    // B-110: the observers first, their row takes room from the cards (fitCardsToTable)
    updateObservers(Array.isArray(myJson.observers) ? myJson.observers : [], myJson.mkey);
    updateTableSummary(myJson); // B-151: before the cards as well (its line takes room from them)
    if (updatePlayersCards(myJson.players, isOnLoad, myJson.anonymous_mode === 1)) {
        /* returns true when new cards have been added */
        setColor();
    }


    // B-99 D8: the own card's name tag is styled like the name tag in the header
    // B-110: every other card gets the nudge (.nudge) and the smiley (.react) to throw a reaction
    document.querySelectorAll('#cbox .c').forEach(card => {
        const isMe = card.id === ownCardMkey(myJson); // B-163
        if (card.classList.contains('is-me') !== isMe) card.classList.toggle('is-me', isMe);
        const name = card.querySelector('.card_player_name').textContent;
        const del = card.querySelector('.delete');
        setAttrIfChanged(del, 'aria-label', deleteLabel(name, card.classList.contains('is-away'), isMe));
        /* B-159: anonymous mode after the reveal: no trash can on other cards (delete.php refuses it, like MCP;
           removing a remembered mkey would tell its card). Inline style: .c .delete sets display. */
        const hideDel = gAnonRevealed && !isMe;
        if ((del.style.display === 'none') !== hideDel) {
            if (hideDel && gPop !== null && gPop.opener === del) closePopover(false);
            del.style.display = hideDel ? 'none' : '';
        }
        syncReactButton(card, !isMe, name, del);
    });
    afterTableUpdate(); // B-110: popovers, tap hint

    updateSelectedC(myJson.selected_card_key);

    updateNewRoundBtn(myJson.one_ore_more_player_ready, myJson.all_players_ready);

    updateSide(myJson);


    controlsDsp(myJson.player_type);
    if (timerFresh) updateTimer(myJson);
    updateOrderByConfig(myJson.results_order
                        , myJson.anonymous_mode === 1 || myJson.anonymous_request_toggle === 1);
    updateAnonymityConfig(myJson.anonymous_request_toggle, myJson.anonymous_mode);
    checkRadio('cet_show_tips', myJson.show_tips === 0 ? '0' : '1'); // B-96
    updateCardChangesConfig(myJson.show_card_changes, myJson.round_show_card_changes); // B-115
    updateAllowAi(myJson.allow_ai); // B-151

    updateJediBtn();

    if (isOnLoad) {

        gBoardSetUp = true; // B-34: before updateDao below (its failure is retried the B-94 way)
        showPage();

        // a new board opens "Board settings" by itself, without taking the focus (name input first);
        // not on phones, where the sheet would cover the name input
        if (myJson.needs_setup && !gPhoneQuery.matches) openMenu('cset', null, false);

        updateDao(false);
    }


}

function updateNewRoundBtn(oneOreMorePlayerReady, allPlayersReady) {
    // B-67 (Andreas): the button is always there; before the first card it is disabled ("Restart round")
    let newRoundBtn = document.getElementById('newroundbtn');
    let newButtonText = (oneOreMorePlayerReady && allPlayersReady) ? 'New round' : 'Restart round';
    newRoundBtn.disabled = !oneOreMorePlayerReady;
    newRoundBtn.classList.toggle('primary', newButtonText === 'New round'); // all cards revealed
    if (newRoundBtn.value !== newButtonText) {
        newRoundBtn.value = newButtonText;
    }
}

/* a double click on the board loads it again (board.html, body); not inside the menu, the popovers at a card or on
 * the circles (B-110: opening and closing the emoji bar quickly is no double click on the board) */
function onBodyDblClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (target !== null && target.closest('#menu, .tbl-pop, #cbox button, #observers')) return;
    if (target !== null && tapMode() && target.closest('#cbox .c')) return; // B-110: two taps open and close a card
    updateDao(false);
}

let gStarted = false; // B-34: loadBoard() / loadInit() ran (they start on DOMContentLoaded, only once)

function loadBoard() {
    if (gStarted) return;
    gStarted = true;
    const urlParams = new URLSearchParams(window.location.search);
    t = urlParams.get("t");

    // B-152: the first board load, the connection and the page view only with a UID (first visit: from uid.php)
    ensureUid().then(() => {
        updateDao(true); // B-34: cards.json and card_catalog.json load since script.js ran (gConfigReady)
        initializeWSConnection(t);
        measureEvent("BOARD_ON_LOAD");
    });
    generateQRCode(window.location.href);
    initWSReconnect();
    initDisplayHandling();
    initSidebar(); // B-113 (sidebar.js)
    initTableInteraction(); // B-110
    initNudgeAudio(); // B-133

    document.getElementById('nameinput').addEventListener('input', function(event) {
        updateBecomeUserButtons(event.target);
    });

    // B-75: a tap on the name overlay (outside its buttons and links) focuses the name field;
    // inside the tap, so iOS opens the keyboard too
    document.getElementById('overlay_name_input').addEventListener('click', function(event) {
        const nameinput = document.getElementById('nameinput');
        if (event.target instanceof Element && event.target.closest('input, button, a')) return;
        if (nameinput.classList.contains('display_none') || document.activeElement === nameinput) return;
        nameinput.focus();
    });

    document.getElementById('nameinput').addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            document.getElementById('become_player_btn').focus();
        }
    });

    document.getElementById('cet_team_name').addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            if (!document.getElementById('cet_change_name').disabled ) {
                updateTeamName();
            }
        }
    });

    document.getElementById('cet_usr_name').addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            if (!document.getElementById('cet_change_user').disabled ) {
                updateUserName();
            }
        }
    });

    let becomePlayerBtn = document.getElementById("become_player_btn");
    becomePlayerBtn.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            becomePlayer();
        }
    });
    becomePlayerBtn.addEventListener('click', becomePlayer);

    let becomeObserverBtn = document.getElementById("become_observer_btn");
    becomeObserverBtn.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            becomeObserver();
        }
    });
    becomeObserverBtn.addEventListener('click', becomeObserver);


    document.addEventListener('keydown', function(event) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
           keyUpDown(event);
        } else {
           pickCardByKey(event);
        }
    });
}

function keyUpDown(event) {
    if (document.getElementById("overlay_name_input").classList.contains('visible')) {
        if (event.key === 'ArrowDown') {
            if (document.getElementById('become_player_btn') === document.activeElement) {
                document.getElementById('become_observer_btn').focus();
            }
            if (document.getElementById('nameinput') === document.activeElement) {
                document.getElementById('become_player_btn').focus();
            }
            event.preventDefault();
        } else if (event.key === 'ArrowUp') {
            if (document.getElementById('become_player_btn') === document.activeElement) {
                document.getElementById('nameinput').focus();
            }
            if (document.getElementById('become_observer_btn') === document.activeElement) {
                document.getElementById('become_player_btn').focus();
            }
            event.preventDefault();
        }
    }
}

function updateBecomeUserButtons(nameInput) {
    if (nameInput.value.trim().length === 0) { // B-152: a name of spaces only is no name (name.php: 400)
        document.getElementById("become_player_btn").disabled = true;
        document.getElementById("become_observer_btn").disabled = true;
    } else {
        document.getElementById("become_player_btn").disabled = false;
        document.getElementById("become_observer_btn").disabled = false;
    }
}

function becomePlayer() {
    becomeUser('player');
}

function becomeObserver() {
    becomeUser('observer');
}

function becomeUser(type) {
    let name = document.getElementById("nameinput").value.trim();
    if (name.length > 0) {
        let url = './api/name.php?type=' + type + '&name=' + encodeURIComponent(name) + '&t=' + encodeURIComponent(t);
        apiWrite(url);
    }
}

function loadInit() {
    if (gStarted) return;
    gStarted = true;
    // the form never submits natively, also while the color mode is still loading
    document.getElementById('teamForm').addEventListener('submit', function(event) {
        event.preventDefault();
        addTeam();
    });
    initDisplayHandling();

    // B-34: the page shows once the color mode is known, never half styled. If get_user.php fails or takes longer
    // than USER_WAIT_MS, the page shows in the mode of the system; an answer that comes later still applies.
    // B-141: with a mode kept on this device the page shows at once in it; a different saved mode still applies.
    let shown = false;
    let shownMode = null; // the mode the page showed in (a late answer does not undo a switch made meanwhile)
    const show = () => {
        if (shown) return;
        shown = true;
        shownMode = gColorMode;
        setColor();
        revealPage();
        // only when nobody put the focus somewhere meanwhile
        if (document.activeElement === null || document.activeElement === document.body) {
            document.getElementById("teaminput").focus();
        }
        measureEvent("INIT_ON_LOAD");
    };
    const systemMode = () => {
        gColorMode = typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    };
    const stored = readStoredColorMode();
    if (stored !== null) {
        gColorMode = stored;
        show();
    }
    // B-152: a browser without a UID has no saved settings: no get_user.php (the page view gets the UID)
    if (getUid() === '') {
        if (!shown) { systemMode(); show(); }
        return;
    }
    const waitTimer = shown ? null : setTimeout(() => { if (!shown) { systemMode(); show(); } }, USER_WAIT_MS);
    fetchJsonResult('./api/get_user.php', 0).then((result) => {
        const user = result.json;
        if (user !== null && typeof user.color_mode === 'string' && user.color_mode !== '') {
            if (!shown) {
                gColorMode = user.color_mode;
                storeColorMode(gColorMode);
            } else if (gColorMode === shownMode) { // late: the saved mode wins (unless switched meanwhile)
                storeColorMode(user.color_mode);
                if (user.color_mode !== gColorMode) { gColorMode = user.color_mode; setColor(); }
            }
        } else if (!shown) {
            systemMode();
        }
        clearTimeout(waitTimer);
        show();
    });
}

function measureEvent(eventCode) {
    const url = "./api/measure_event.php?event_code="+eventCode
            +"&display_type="+getBrowserWidth();
    apiFetch(url, { method: 'POST' }).catch(() => {});
}


function setColor() {
    // the color mode button (#cmode_btn) shows moon/sun via CSS (body.light-theme)
    let brandImg = document.getElementById("brand");
    let brandIcon = document.getElementById("brand_icon"); // board only (phones show the mark alone)
    checkRadio('cet_color_mode', gColorMode === "dark" ? 'dark' : 'light');

    // B-97: the logo has no src in the HTML, so the light theme does not load the dark file first;
    // only set it when the theme changed (setColor() runs again on later updates)
    if (gColorMode === "dark") {
        setImgSrc(brandImg, "./src/brand_dark.svg?v=3");
        if (brandIcon) setImgSrc(brandIcon, "./src/brand_icon_dark.svg?v=2");
        document.body.classList.remove('light-theme');
    } else {
        setImgSrc(brandImg, "./src/brand_light.svg?v=3");
        if (brandIcon) setImgSrc(brandIcon, "./src/brand_icon_light.svg?v=2");
        document.body.classList.add('light-theme');
    }
    // B-141: the page background before body is styled (inline style in the head of board.html/init.html)
    document.documentElement.classList.toggle('pk-light', gColorMode !== "dark");
}

/* B-141: the color mode is kept on this device too, so the page starts in it before anything loads (inline script
 * in the head of board.html/init.html). The server value still wins when it arrives. */
// the key 'COLOR_MODE' is a literal: gColorMode is set from it at the top of this file (a const here would not exist yet)
function readStoredColorMode() {
    try {
        const mode = localStorage.getItem('COLOR_MODE');
        return mode === 'light' || mode === 'dark' ? mode : null;
    } catch (e) {
        return null;
    }
}

function storeColorMode(mode) {
    if (mode !== 'light' && mode !== 'dark') return;
    try {
        if (localStorage.getItem('COLOR_MODE') !== mode) localStorage.setItem('COLOR_MODE', mode);
    } catch (e) { /* no storage: the server value only */ }
}

function setImgSrc(img, src) {
    if (img.getAttribute('src') !== src) img.src = src;
}

/* B-51: "Appearance" in the "You" section (radio group) */
function setColorMode(mode) {
    if (mode !== gColorMode) switchColorMode();
}

/* B-51: the segment switches in the menu are radio groups (name = former select id);
 * check the radio with the given value (values are fixed strings, never user input) */
function checkRadio(name, value) {
    let radio = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (radio !== null && !radio.checked) radio.checked = true;
}

function switchColorMode(){
    if (gColorMode === "dark") gColorMode = "light";
    else gColorMode = "dark";
    measureEvent("USE_COLOR_SWITCH");
    setColor();
    storeColorMode(gColorMode); // B-141
    apiFetch('./api/update_user.php?color_mode=' + gColorMode, { method: 'POST' }).catch(() => {});
}


/* B-46: on phones the topic strip shows one line; the arrow button (or a tap on the topic)
 * shows all of it. Elsewhere the button is hidden by CSS and the topic is shown in full. */
function toggleTopic(event) {
    let button = document.getElementById('topic_toggle');
    if (getComputedStyle(button).display === 'none') return;
    if (event.target.closest('a')) return; // links in the topic just open
    if (event.currentTarget && event.currentTarget.id === 'topic' && event.target.closest('button')) return; // B-52
    let expanded = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    button.closest('.topic-bar').setAttribute('data-expanded', expanded ? 'true' : 'false');
}

/* R3 review V2: "Invite" in the header. On touch devices (gTouchQuery, as for the "tap" tip) with navigator.share the
 * native share menu opens; elsewhere (Andreas: on desktops the share menu hides copying), or when sharing fails, the
 * link is copied (copyLink). Cancelling the share menu does nothing. */
function inviteShares() {
    return gTouchQuery.matches && typeof navigator.share === 'function';
}

/* the accessible name says what a click does: share (touch) or copy */
function updateInviteLabel() {
    let button = document.getElementById('invite_btn');
    if (button === null) return;
    button.setAttribute('aria-label', inviteShares() ? 'Invite – share board link' : 'Invite – copy board link');
}
document.addEventListener('DOMContentLoaded', updateInviteLabel);
gTouchQuery.addEventListener('change', updateInviteLabel);

/* B-151 (MCP PR G): the AI connector URL in the hints (.mcp-url) and in #ai_dialog (#ai_url, ai_dialog.js) comes
 * from the current origin (live, staging, local) */
function showMcpUrl() {
    const url = window.location.origin + '/mcp';
    document.querySelectorAll('.mcp-url').forEach(el => { el.textContent = url; });
    const field = document.getElementById('ai_url');
    if (field !== null) field.value = url;
}
document.addEventListener('DOMContentLoaded', showMcpUrl);

/* B-151: team setting "Allow AI assistants" (dao allow_ai, 0 = off): the radio in the board settings, and while off no
 * AI button in the header (#ai_btn, an open #ai_dialog closes) and no AI hint on the join overlay (#join_mcp_hint) */
function updateAllowAi(allowAi) {
    const on = allowAi !== 0;
    checkRadio('cet_allow_ai', on ? '1' : '0');
    ['ai_btn', 'join_mcp_hint'].forEach(id => {
        const el = document.getElementById(id);
        if (el !== null) el.hidden = !on;
    });
    if (!on && typeof closeAiDialog === 'function') closeAiDialog();
}

function inviteTeam() {
    let url = window.location.href;
    if (inviteShares()) {
        let name = document.getElementById('team_name').textContent;
        let data = { title: name ? name + ' – Agile Poker' : 'Agile Poker', url: url };
        let share;
        try {
            share = navigator.share(data);
        } catch (e) {
            share = Promise.reject(e);
        }
        share.catch(function (e) {
            if (!e || e.name !== 'AbortError') copyLink(); // not supported here, not allowed: copy instead
        });
        return;
    }
    copyLink();
}

/* copies the board link; the Invite button confirms it (V1: feedback where the click was). Where the browser
 * refuses (no permission, http, a web view) the link shows in a field, selected, to copy by hand (R3 review E7) */
function copyLink() {
    let text = window.location.href;
    let done;
    try {
        done = navigator.clipboard.writeText(text);
    } catch (e) {
        done = Promise.reject(e); // no navigator.clipboard (http)
    }
    done.then(function () {
        confirmInvite('Link copied');
    }, function () {
        window.prompt('Copy the board link:', text);
    });
}

/* the Invite button reads "Copied" for 2 s (class is-done: check icon, green; short, so the header does not jump on
 * small phones), screen readers hear "Link copied" once */
let gInviteTimer = null;
function confirmInvite(text, label = 'Copied') {
    let button = document.getElementById('invite_btn');
    let lbl = button.querySelector('.lbl');
    let status = document.getElementById('invite_status');
    lbl.textContent = label;
    button.classList.add('is-done');
    status.textContent = text;
    clearTimeout(gInviteTimer);
    gInviteTimer = setTimeout(function () {
        lbl.textContent = 'Invite';
        button.classList.remove('is-done');
        status.textContent = '';
    }, 2000);
}

/* Short message that pops up from the bottom edge for a moment (style.css, .toast).
 * R3 review V1: the result of an own click shows at that control (Invite button; B-165: sent feedback inline in the
 * panel), else a toast (failed writes, the deck and the timer menu: R3 review, Andreas). Plain text only (textContent). Calling it again replaces the
 * text and restarts the timer; ms: how long it stays (the deck menu: a little longer). */
let gToastTimer = null;
/* kind 'error' (R3, Andreas): refusals and failed writes show "!" instead of the ">" prompt (style.css .toast-error) */
function showToast(text, ms = 2200, kind = 'info') {
    let toast = document.getElementById('toast');
    // B-51: a modal menu (phone sheet) lies in the top layer; the toast goes into it to stay visible
    // (closeMenu() puts it back)
    let menu = document.getElementById('menu');
    // B-98 S5: above the editor of an own set (a modal dialog in the top layer as well)
    let editor = document.getElementById('cs_editor');
    let host = editor !== null && editor.open ? editor : isModalOpen(menu) ? menu : document.body;
    if (toast.parentElement !== host) host.appendChild(toast);
    toast.textContent = text;
    toast.classList.toggle('toast-error', kind === 'error');
    if (kind === 'error') {
        // the alert icon of the sprite (board.html) instead of the ">" prompt; the text stays plain text
        const svgNs = 'http://www.w3.org/2000/svg';
        const icon = document.createElementNS(svgNs, 'svg');
        icon.setAttribute('class', 'i toast-ico');
        icon.setAttribute('aria-hidden', 'true');
        icon.setAttribute('focusable', 'false');
        const use = document.createElementNS(svgNs, 'use');
        use.setAttribute('href', '#i-alert');
        icon.appendChild(use);
        toast.prepend(icon);
    }
    toast.classList.add('toast-on');
    clearTimeout(gToastTimer);
    gToastTimer = setTimeout(function () {
        toast.classList.remove('toast-on');
    }, ms);
}



function generateQRCode(url) {

    const qrCode = new QRCodeStyling({
        width: 300,
        height: 300,
        type: "svg",
        data: url,
        dotsOptions: {
            color: "var(--text-color)",
            type: "extra-rounded"
        },
        image: "src/logo_qr_code.png?v=2",
        cornersSquareOptions: {
            type: "extra-rounded"
        },
        backgroundOptions: {
            color: "var(--background-color)",
        },
        qrOptions: {typeNumber: "0", mode: "Byte", errorCorrectionLevel: "Q"}

    });

    qrCode.append(document.getElementById("canvas_qr_code"));
}

function showQRCode(showIt) {
    let overlay = document.getElementById("overlay_qr");
    let overlay_qr = document.getElementById("overlay_qr_code");
    if (showIt) {
        toggleStyleClass(overlay, "visible", "hidden");
        toggleStyleClass(overlay_qr, "visible", "hidden");

    } else {
        toggleStyleClass(overlay_qr, "hidden", "visible");
        toggleStyleClass(overlay, "hidden", "visible");
    }
}


/* B-42: The sort order is only set in the menu (Card value = SEQUENCE, Player name = NAME).
 * Legacy values like 'CHOOSE:SEQUENCE' (before the data update) are shown as Card value.
 * In anonymous mode the server always arranges revealed cards by card value, so the
 * radio group (B-51) is disabled and shows "Card value", whatever is stored; a hint explains why.
 * Nothing is sent to the API: the stored value stays and shows up again as soon as
 * anonymous mode is switched off. This already applies when anonymous mode is
 * requested for the next round, so it reacts as soon as "Hide names" is chosen.
 * The hint is only referenced via aria-describedby while it is visible. */
function updateOrderByConfig(resultsOrder, anonymousMode) {
    let dropDown = document.getElementById("cet_order_by"); // the fieldset of the radio group
    let hint = document.getElementById("cet_order_by_hint");
    let order = (resultsOrder === 'NAME' && !anonymousMode) ? 'NAME' : 'SEQUENCE';

    checkRadio('cet_order_by', order);

    dropDown.disabled = anonymousMode;
    if (anonymousMode) {
        toggleStyleClass(hint, "display_block", "display_none");
        dropDown.setAttribute("aria-describedby", "cet_order_by_hint");
    } else {
        toggleStyleClass(hint, "display_none", "display_block");
        dropDown.removeAttribute("aria-describedby");
    }
}

/* R3 (Andreas): "Takes effect with the next round." under a Results setting only while a change is pending, i.e. the
 * team setting differs from the one of the running round (the server applies it at once while no card is down) */
function showPendingRoundHint(hintId, pending) {
    document.getElementById(hintId).classList.toggle('display_none', !pending);
}

function updateAnonymityConfig(anonymousRequestToggle, anonymousMode) {
    const team = anonymousRequestToggle === 1 ? 1 : 0;
    checkRadio('cet_anonymous', String(team));
    showPendingRoundHint('cet_anonymous_hint', team !== (anonymousMode === 1 ? 1 : 0));
}

/* B-115: the switch follows the team setting (default on), the round setting decides the hint */
function updateCardChangesConfig(showCardChanges, roundShowCardChanges) {
    const team = showCardChanges === 0 ? 0 : 1;
    checkRadio('cet_show_card_changes', String(team));
    showPendingRoundHint('cet_show_card_changes_hint', team !== (roundShowCardChanges === 0 ? 0 : 1));
}


/* B-34: the start of the board loads without blocking. cards.json, card_catalog.json and the card symbols
 * (src/cards.svg) start while the page is parsed (script.js is deferred), in parallel to the rest; dao.php starts
 * on DOMContentLoaded (loadBoard(), board.html: all deferred scripts have run then; images and analytics do not
 * hold it up). Every board state waits for the card config (gConfigReady); the page shows when the
 * first board state is rendered completely, all at once. It does not wait for the card symbols: they appear a
 * moment later when they come after the board (Andreas, 2026-11-17); warmSprite() only starts their download early.
 * Until then a spinner shows after 0.8 s and fades out when the page shows (inline CSS in board.html/init.html),
 * after 12 s a "Still loading" hint with a reload button (inline script there; the loads go on and the hint goes
 * when the page shows). The invisible page takes no clicks meanwhile. Nothing loads synchronously. */
const CONFIG_TIMEOUT_MS = 8000;   // cards.json / card_catalog.json: one try is given up after this (and retried)
const CONFIG_RETRY_MS = [1000, 2000, 4000]; // waits before the first retries of a config file ...
const CONFIG_RETRY_MAX_MS = 5000; // ... then every 5 s, until it loads or the server answers definitively
const DAO_BOOT_TIMEOUT_MS = [8000, 16000, 30000]; // dao.php before the set-up: a hanging load is given up and
                                                  // retried; 1st, 2nd, 3rd and every later try
const USER_WAIT_MS = 3000;        // init.html: get_user.php (color mode); after this the page shows in the system mode
const SPINNER_FADE_MS = 250;      // the spinner fades out in 0.2 s (inline CSS), then it is removed
let gBoardSetUp = false;          // the first board state has been rendered completely
let gPageShown = false;

/* GET a JSON object. Resolves with {json, final}: json is the object or null; final is false when a retry may help
 * (network error, timeout, HTTP 5xx, 408, 429) and true for a definite answer of the server (any other HTTP error
 * status such as 404 or 410, no JSON object). Never rejects. timeoutMs 0: no timeout. */
function fetchJsonResult(url, timeoutMs) {
    const ctrl = typeof AbortController === 'function' && timeoutMs > 0 ? new AbortController() : null;
    const timer = ctrl !== null ? setTimeout(() => ctrl.abort(), timeoutMs) : 0;
    let answered = false;
    return apiFetch(url, ctrl !== null ? { signal: ctrl.signal } : {})
        .then((response) => {
            if (!response.ok) {
                answered = isFinalStatus(response.status);
                throw new Error('HTTP ' + response.status);
            }
            return response.json();
        })
        .then((json) => {
            if (json === null || typeof json !== 'object') throw new Error('no JSON object');
            return { json: json, final: true };
        })
        .catch((error) => {
            // a body that is no JSON (SyntaxError) is an answer too; a cut connection while reading is not
            if (error instanceof SyntaxError || (error instanceof Error && error.message === 'no JSON object')) answered = true;
            console.log('loading failed: ' + url, error);
            return { json: null, final: answered };
        })
        .finally(() => clearTimeout(timer));
}

/* B-34: an HTTP error status that a retry will not change (4xx except 408 Request Timeout and 429 Too Many
 * Requests); 5xx, 408 and 429 are passing troubles */
function isFinalStatus(status) {
    return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/* a file of the card config: retried (1 s, 2 s, 4 s, then every 5 s) until it loads; null only when the server
 * answered definitively (404, 410 or another 4xx except 408/429, broken JSON); 5xx/408/429 are retried */
function fetchConfigFile(url) {
    let tries = 0;
    const attempt = () => fetchJsonResult(url, CONFIG_TIMEOUT_MS).then((result) => {
        if (result.json !== null || result.final) return result.json;
        const wait = tries < CONFIG_RETRY_MS.length ? CONFIG_RETRY_MS[tries] : CONFIG_RETRY_MAX_MS;
        tries++;
        return delay(wait).then(attempt);
    });
    return attempt();
}

/* warms the HTTP cache for the card symbols (<use href="src/cards.svg#...">): starts their download while the
 * page is parsed instead of when the first cards are rendered. Nothing waits for it. */
function warmSprite() {
    if (typeof CARDS_SPRITE !== 'string') return; // cards.js missing
    fetch(CARDS_SPRITE)
        .then(response => response.ok ? response.text() : null)
        .catch(() => null);
}

/* the board is set up: shows the page with the next frame (the card symbols are not waited for) */
function showPage() {
    if (gPageShown) return;
    gPageShown = true;
    requestAnimationFrame(revealPage);
}

/* everything in one go: the page fades in (board: .body-fade-in), the spinner fades out, the reload hint goes */
function revealPage() {
    const root = document.documentElement;
    let spin = 0; // the spinner is hidden while the reload hint shows (html.load-fail)
    try {
        if (!root.classList.contains('load-fail')) spin = parseFloat(getComputedStyle(root, '::after').opacity) || 0;
    } catch (e) { spin = 0; }
    if (spin > 0) { // visible: it fades out from where it is instead of vanishing (inline CSS: .spin-out)
        root.style.setProperty('--pk-o', String(spin));
        root.classList.add('spin-out');
        setTimeout(() => root.classList.remove('spin-out'), SPINNER_FADE_MS);
    }
    document.body.style.opacity = '1';
    document.body.removeAttribute('aria-busy');
    root.classList.add('ready');
    root.classList.remove('load-fail');
    const hint = document.getElementById('load_fail');
    if (hint !== null) hint.remove();
}

function loadCardConfig() {
    /* - cards.json (v1): the old card list, only for the fallback deck from cardset_flags (deck.js, adapter)
       - card_catalog.json (v2, B-98): groups, variants, control cards and the card texts; the deck of the
         team comes from dao ("deck") and refers to these cards (R3 F4)
       B-34: both in parallel and asynchronous. A file is retried until it loads; its fallback below only applies
       when the server answered definitively. The promise resolves only when at least one of them really loaded
       (else both are tried again every 5 s): the board never shows with an empty deck.
     */
    return Promise.all([
        fetchConfigFile('./cards.json?v=3'),          // bump when cards.json changes (Safari keeps it cached)
        fetchConfigFile('./card_catalog.json?v=13'),  // bump when card_catalog.json changes
    ]).then((files) => {
        if (files[0] === null && files[1] === null) {
            console.log('card config missing, trying again');
            return delay(CONFIG_RETRY_MAX_MS).then(loadCardConfig);
        }
        const cardsConf = files[0];
        gCardsConfig = cardsConf !== null && Array.isArray(cardsConf.cards) ? cardsConf.cards : [];
        gCardsConfig.sort((a,b) => a.sort_order - b.sort_order);

        // B-99 (F1): the card model (deck.js); the tray shows the team's deck once the board state is there.
        // F2/F4: values, headings, descriptions, groups and styles from card_catalog.json (v2); without it the
        // cards still show (value as text, no texts) and the deck falls back to cardset_flags
        const catalogV2 = files[1];
        gCatalogV2 = catalogV2;
        gCardCatalog = catalogFromLegacy(gCardsConfig, catalogV2Index(catalogV2));
        // the catalog v2 cards win; v1 cards only for keys v2 does not know
        gCardByKey = new Map(gCardCatalog.map(entry => [entry.card.key, entry.card]));
        catalogV2Cards(catalogV2).forEach((card, key) => gCardByKey.set(key, card));
    });
}


/*** COMMON JS FUNCTIONS ****/

function addStyleClass(element, className) {
    if (!element.classList.contains(className)) element.classList.add(className);
}

function removeStyleClass(element, className) {
    if (element.classList.contains(className)) element.classList.remove(className);
}

function toggleStyleClass(element, addClassName, removeClassName) {
    removeStyleClass(element, removeClassName);
    addStyleClass(element, addClassName);
}

function handleResize() {
    if (!gLastJson) return;
    // B-39/B-41: the flex layout reflows by itself; nothing glides on resize.
    // A running glide or height animation would end at a stale spot, so finish it.
    const cbox = document.getElementById('cbox');
    Array.from(cbox.children).forEach(card => finishAnimations(card, 'flip'));
    finishAnimations(cbox, 'height');
    fitCardsToTable(); // B-49: no glide either
    repositionSpread();
    updateDeckRoom();
    syncCarousel(true); // B-75: the card in the middle stays there
}

/* B-68: the spread's blocks jump to their new height (e.g. at the breakpoint), only votes animate; the average
 * pointer jumps to its new spot. Also when only the column changes its width (B-113, sidebar.js). */
function repositionSpread() {
    if (!gLastJson) return;
    const spread = document.getElementById('spread');
    if (spread === null) return;
    spread.classList.add('no-anim');
    updateSide(gLastJson, false);
    void spread.offsetHeight;
    spread.classList.remove('no-anim');
}

function initDisplayHandling() {
    window.addEventListener('resize', handleResize);
    initCarousel(); // B-75
    loadDeckKeyLayout(); // F8
    window.addEventListener('focus', loadDeckKeyLayout);
    // B-69: the "<" / ">" bars follow the deck's scroll position; the wheel scrolls it sideways
    const ctl = document.getElementById('ctl');
    if (ctl !== null) {
        // (not on the carousel: no bars there, and its frames stay light)
        ctl.addEventListener('scroll', () => { if (!gCarousel.on) updateDeckRoom(); }, { passive: true });
        ctl.addEventListener('wheel', scrollDeckByWheel, { passive: false });
    }
    // B-113: pinning the sidebar or dragging its grip changes the deck's width without a window
    // resize: measure the hint's room again (once per frame, also during the width animation)
    const down = document.getElementById('down-container');
    if (down !== null && typeof ResizeObserver === 'function') {
        let roomFrame = 0;
        const observer = new ResizeObserver(() => {
            if (roomFrame !== 0) return;
            roomFrame = requestAnimationFrame(() => {
                roomFrame = 0;
                if (!gCarousel.on) updateDeckRoom();
            });
        });
        observer.observe(down);
        if (ctl !== null) observer.observe(ctl);
    }
    // B-68: a deck card image that loads late widens the deck; measure again (load does not bubble)
    document.addEventListener('load', event => {
        if (event.target instanceof HTMLImageElement && event.target.closest('#ctl') !== null) updateDeckRoom();
    }, true);
    // B-49: the table also changes its size without a window resize (topic shown, unfolded or
    // hidden): the cards jump to their new size like on a resize. Only the border box counts,
    // a scrollbar coming or going does not change the area the cards are fitted to.
    const table = document.getElementById('table');
    if (table !== null && typeof ResizeObserver === 'function') {
        const tableObserver = new ResizeObserver(() => {
            const cbox = document.getElementById('cbox');
            if (!fitCardsToTable()) return;
            Array.from(cbox.children).forEach(card => finishAnimations(card, 'flip'));
            finishAnimations(cbox, 'height');
        });
        tableObserver.observe(table, { box: 'border-box' });
        // B-52 S1c: the note above the cards shown, unfolded or hidden
        const note = document.getElementById('board_note');
        if (note !== null) tableObserver.observe(note, { box: 'border-box' });
    }
}

/* B-68: the column (style.css "Column"; large screens on the right, phones a strip above the deck):
 * where the round is and, once the cards are revealed, the spread. Plain text only (textContent).
 * The spread has one bar per card in the deck (a stack of blocks, one per vote; a block's height
 * follows the number of players, see style.css), the vote count above it and the card's value below it (cards.json
 * "symbol", else its description); the most chosen card(s) in the accent color, from two votes
 * on. Its room is kept before the reveal (style.css), so nothing moves. The average pointer
 * follows the board setting (show_avg).
 * The columns and blocks are updated in place, so style.css can let the blocks fade in and out
 * and the pointer slide (glide = false: jump, e.g. on a resize). */
function updateSide(json, glide = true) {
    const status = document.getElementById('round_status');
    const spread = document.getElementById('spread');
    if (status === null || spread === null || !json) return;
    syncSidebar(json); // B-113: the rail and the state of the phase (sidebar.js)

    const revealed = json.all_players_ready && json.players_count > 0;
    let text = 'waiting for players';
    if (revealed) text = 'revealed';
    else if (json.players_count > 0) text = 'voting · ' + json.ready_players_count + ' of ' + json.players_count + ' voted';
    if (status.textContent !== text) status.textContent = text;

    spread.hidden = !revealed;
    updateTip(json, revealed);

    // the columns follow the deck, also before the reveal (they keep the spread's room)
    const bars = document.getElementById('spread_bars');
    const deckCards = gDeck.cards;
    const keys = deckCards.map(card => card.key).join(',');
    if (bars.getAttribute('data-keys') !== keys) {
        bars.replaceChildren(...deckCards.map(card => spreadColumn(card, card.key)));
        bars.setAttribute('data-keys', keys);
    }

    // the block height is fixed per round: the bar height shared by the players on the board
    // (style.css); only a player joining or leaving changes it
    const voters = String(Math.max(1, json.players_count));
    if (bars.style.getPropertyValue('--voters') !== voters) bars.style.setProperty('--voters', voters);

    const pointer = document.getElementById('spread_index');
    if (!revealed) {
        // empty bars, so the votes grow in on the next reveal
        bars.querySelectorAll('.spread-bar').forEach(bar => bar.replaceChildren());
        toggleStyleClass(pointer, 'hidden', 'visible');
        syncMedianLine(null); // B-53
        syncRailRange(false); // B-113 (sidebar.js)
        bars.querySelectorAll('.spread-col').forEach(col => syncEstimateColumn(col, { show: false }, 0));
        updateEstimateRow(json, false, {}); // B-52 S1 (topics.js)
        return;
    }

    // B-102: the "joined in" card is no vote
    const cardStats = calculateCardStats(json.players.filter(player => !isLateCardKey(player.display_card_key)));
    const top = Math.max(0, ...Object.values(cardStats).map(stat => stat.usageCount));
    // B-52 S1: the result of the active topic item is the only accent (deck aim 'agree'); the most chosen card(s)
    // only while no result is marked. Columns with votes are buttons then (topics.js)
    const estimate = topicEstimate(json);
    const estMarked = estimate.show && estimate.aim === 'agree' && estimate.key !== null;
    const chosen = [];
    let unvalued = false; // B-98 S5: a custom card without a value is down (no range then)
    const grown = [];
    Array.from(bars.children).forEach(col => {
        const stat = cardStats[col.getAttribute('data-card')];
        const n = stat ? stat.usageCount : 0;
        col.classList.toggle('top', !estMarked && n > 1 && n === top);
        syncEstimateColumn(col, estimate, n);
        col.classList.toggle('zero', n === 0);
        col.querySelector('.spread-count').textContent = n > 0 ? String(n) : '';
        grown.push(...setSpreadSegments(col.querySelector('.spread-bar'), n));
        const card = cardByKey(col.getAttribute('data-card'));
        const rank = cardRank(card);
        if (n > 0 && rank !== null && card.range !== false) chosen.push({ rank, card }); // B-113: catalog flag range
        else if (n > 0 && card && card.custom) unvalued = true;
    });
    if (grown.length > 0) {
        void bars.offsetHeight; // the new blocks start invisible (class "in"), then fade in
        grown.forEach(seg => seg.classList.remove('in'));
    }

    // the range of the chosen numeric values (B-79: infinity as the top end): "range 2–20", "range 3–∞",
    // or "5" when all agree; B-99 (F6): each end in its mini look (cardSmall: mono text or mini symbol).
    // B-113 (Andreas): every card with a value counts, ordered by that value – also stars ("range 1★–3★") and
    // T-shirt sizes; cards without a value (faces, control cards) and groups with "range": false in
    // card_catalog.json (traffic lights) stay out of it (card.range, deck.js).
    // B-98 S5: a custom set shows the range only when every card down has a value (control cards aside)
    let ends = [];
    if (chosen.length > 0 && !unvalued) {
        chosen.sort((a, b) => (a.rank === b.rank ? 0 : (a.rank < b.rank ? -1 : 1)));
        const low = chosen[0].card;
        const high = chosen[chosen.length - 1].card;
        ends = low.key === high.key ? [low] : [low, high];
    }
    const rangeElement = document.getElementById('spread_range');
    const rangeKey = ends.map(card => card.key).join(',');
    if (rangeElement.getAttribute('data-shows') !== rangeKey) {
        rangeElement.setAttribute('data-shows', rangeKey);
        rangeElement.replaceChildren(...(ends.length === 2
            ? ['range ', cardSmall(ends[0]), '\u2013', cardSmall(ends[1])]
            : ends.map(card => cardSmall(card))));
    }
    syncRailRange(true); // B-113: the same range in the rail (sidebar.js)
    updateEstimateRow(json, revealed, cardStats); // B-52 S1 (topics.js)

    let left = null;
    if (json.show_avg === 1) {
        left = calculateIndicatorLefPosition(cardStats,
            key => bars.querySelector('[data-card="' + key + '"]'), pointer);
    }
    // B-53: the median line, coupled to the same switch as the average pointer; only for decks that aim to agree
    syncMedianLine(json.show_avg === 1 && !(json.deck && json.deck.aim === 'perspectives')
        ? medianColumns(cardStats) : null);
    if (left === null) {
        toggleStyleClass(pointer, 'hidden', 'visible');
    } else {
        // it slides to a new spot, but jumps when it shows up or on a resize
        const jump = !glide || !pointer.classList.contains('visible');
        pointer.classList.toggle('no-glide', jump);
        pointer.style.left = (left - bars.getBoundingClientRect().left) + 'px';
        toggleStyleClass(pointer, 'visible', 'hidden');
        if (jump) {
            void pointer.offsetWidth;
            pointer.classList.remove('no-glide');
        }
    }
}

/* B-53: the median of the votes: { value, low, high, share } or null. Votes on cards with a numeric value count, and
 * ∞ as the highest value (Andreas); not: control cards, cards without a value, cards with "range": false. At least
 * two of them. Odd number: the value of the middle vote; even: the mean of the two middle votes (5 and 13: 9), as the
 * average pointer works on values too. low/high: the neighbouring deck cards it lies between (both the same card when
 * one has exactly that value; both ∞ when the upper middle vote is ∞). share: the way from low to high (0..1).
 * Between a value and ∞ (3, 5, ∞, ∞) the median is ∞, as ∞ counts as a very large value (Andreas): the line stands on
 * the ∞ column, like the average pointer on the ∞ card. The line follows deck order, so a deck whose values do
 * not rise in deck order (a custom set, ∞ not after the values) has none. */
function medianColumns(cardStats) {
    const valued = gDeck.cards.filter(card => (card.value != null || card.infinite) && !card.control
        && !card.controlCard && card.range !== false);
    const rank = card => card.infinite ? Infinity : card.value;
    if (valued.some((card, i) => i > 0 && rank(card) < rank(valued[i - 1]))) return null;
    const votes = [];
    valued.forEach(card => {
        const n = cardStats[card.key] ? cardStats[card.key].usageCount : 0;
        for (let i = 0; i < n; i++) votes.push(card);
    });
    if (votes.length < 2) return null;
    const half = votes.length >> 1;
    if (votes.length % 2 === 1 || rank(votes[half - 1]) === rank(votes[half])) {
        const card = votes[half];
        return { value: rank(card), low: card, high: card, share: 0 };
    }
    const lowVote = votes[half - 1];
    const highVote = votes[half];
    if (highVote.infinite) return { value: Infinity, low: highVote, high: highVote, share: 0 };
    const value = (rank(lowVote) + rank(highVote)) / 2;
    const exact = valued.find(card => rank(card) === value);
    if (exact) return { value, low: exact, high: exact, share: 0 };
    const low = valued.filter(card => rank(card) < value).pop();
    const high = valued.find(card => rank(card) > value);
    return low && high ? { value, low, high, share: (value - low.value) / (high.value - low.value) } : null;
}

/* B-53: the dashed median line in the spread (#spread_median, left set here): through the middle of the column with
 * the median's value, else between the middles of its neighbouring columns, by value (median 9 between 8 and 13: a
 * fifth of the way from the 8; between a value and ∞ the median is ∞: its column). median: medianColumns() or null
 * (no line). Its sr-only text and data-median say the value ("Median 3", "Median 9", "Median ∞"; the card's label when
 * a column has exactly that value). */
function syncMedianLine(median) {
    const centerOf = col => { const r = col.getBoundingClientRect(); return r.left + r.width / 2; };
    const line = document.getElementById('spread_median');
    const bars = document.getElementById('spread_bars');
    if (line === null || bars === null) return;
    const colLow = median ? bars.querySelector('[data-card="' + median.low.key + '"]') : null;
    const colHigh = median ? bars.querySelector('[data-card="' + median.high.key + '"]') : null;
    let x = null;
    if (colLow !== null && colHigh !== null) {
        x = centerOf(colLow) + median.share * (centerOf(colHigh) - centerOf(colLow));
    }
    if (x === null) {
        line.hidden = true;
        return;
    }
    const left = x - line.parentElement.getBoundingClientRect().left;
    line.style.left = Math.round(left * 2) / 2 + 'px';
    let value, text;
    if (median.low === median.high) {
        value = median.low.infinite ? '\u221e' : String(Math.round(median.value * 100) / 100);
        text = 'Median ' + (median.low.infinite ? '\u221e' : median.low.label);
    } else {
        value = String(Math.round(median.value * 100) / 100);
        text = 'Median ' + value;
    }
    const label = line.querySelector('.sr-only');
    if (label.textContent !== text) label.textContent = text;
    line.setAttribute('data-median', value);
    line.hidden = false;
}

/* a column of the spread (updateSide; B-52: also the history of done items, topics.js): the count, the bar (blocks
 * via setSpreadSegments), the value. card: the catalog card or undefined (unknown key: the key as text) */
function spreadColumn(card, key) {
    const col = document.createElement('div');
    col.className = 'spread-col zero';
    col.setAttribute('data-card', key);
    const count = document.createElement('span');
    count.className = 'spread-count';
    const bar = document.createElement('span');
    bar.className = 'spread-bar';
    const value = document.createElement('span');
    value.className = 'spread-value';
    // B-99 (F6): per symbol mono text or a mini symbol (cards.js cardSmall), never a system emoji
    value.appendChild(card ? cardSmall(card) : document.createTextNode(key));
    col.append(count, bar, value);
    return col;
}

/* B-70: a short tip what to do now, in the column (before the reveal where the spread will be, then
 * below it; style.css). Built from text nodes and <b> (textContent only: names are user input).
 * Names are highlighted like in the mockup ("Let them explain: Chris (2) and Emil (20)"). Hidden on phones. */
function updateTip(json, revealed) {
    const tip = document.getElementById('round_tip');
    if (tip === null) return;
    // B-96: team setting "Tips" off: no tip and no room for it (hidden, style.css)
    const off = json.show_tips === 0;
    tip.hidden = off;
    const parts = off ? [] : tipText(json, revealed);
    const key = JSON.stringify(parts);
    if (tip.dataset.key === key) return;
    tip.dataset.key = key;
    tip.replaceChildren(...parts.map(part => {
        if (typeof part === 'string') return document.createTextNode(part);
        const b = document.createElement('b');
        b.textContent = part.name;
        // B-99 (F6): "Dan (3)", "Eve (✋ as mini symbol)". The last name and "(symbol)" never break apart:
        // no-break space plus a nowrap group (style.css), the names before it still wrap normally.
        const card = part.card !== undefined ? cardByKey(part.card) : undefined;
        if (card !== undefined) {
            const value = document.createElement('span');
            value.className = 'tip-value';
            // B-104: a changed card shows both values, "(5→8)"
            const from = part.from !== undefined ? cardByKey(part.from) : undefined;
            if (from !== undefined) value.append('(', cardSmall(from), '\u2192', cardSmall(card), ')');
            else value.append('(', cardSmall(card), ')');
            b.append('\u00a0', value);
        }
        return b;
    }));
}

/* "Bob", "Bob and Cleo", "Bob, Cleo and Dan" – each name highlighted */
function tipNames(names) {
    const parts = [];
    names.forEach((name, i) => {
        if (i > 0) parts.push(i === names.length - 1 ? ' and ' : ', ');
        parts.push({ name });
    });
    return parts;
}

/* the players on one side of the spread: "Dan (3)", "Dan, Eve +2 (8)" */
function tipSide(players, card) {
    const names = players.slice(0, 2).map(player => player.name).join(', ');
    return { name: names + (players.length > 2 ? ' +' + (players.length - 2) : ''), card: card.key };
}

/* B-79: the value of a card for lowest/highest: its numeric value, Infinity for the infinity card
 * ("too big to estimate"), null for cards without a value (veto, control cards). ∞ counts as the highest value
 * here as in the average pointer (it points at ∞ as soon as one ∞ is played) and the median (B-53). */
function cardRank(card) {
    if (!card) return null;
    if (card.infinite) return Infinity;
    return card.value;
}

/* the tip as a list of plain strings and highlighted { name } parts; [] for none */
function tipText(json, revealed) {
    // B-102: a player who joined in after the reveal (late001) has no vote: not in any tip after the reveal
    const players = (json.players || []).filter(player => !revealed || !isLateCardKey(player.display_card_key));
    if (json.players_count < 2) return ['Invite your team: ' + (gTouchQuery.matches ? 'tap' : 'click') + ' Invite and share the link.'];

    if (!revealed) {
        if (json.player_type === 'PLAYER' && !json.selected_card_key) {
            return ['Pick the card that fits best from your point of view. Once everyone has voted, cards are revealed automatically.'];
        }
        const missing = players.filter(player => String(player.display_card_key).startsWith('prgrss'));
        if (missing.length === 0) return [];
        // R3 review V10 (L30a): everyone missing is away (no connection): only removing them reveals the cards
        if (missing.every(player => player.away === true)) {
            const away = missing.length > 3 ? [{ name: missing.length + ' players' }] : tipNames(missing.map(player => player.name));
            const them = missing.length > 3 ? ['them'] : away;
            return ['Waiting for ', ...away, ' (away). Remove ', ...them, ' from the table to reveal.'];
        }
        const who = missing.length > 3 ? [{ name: missing.length + ' players' }] : tipNames(missing.map(player => player.name));
        return ['Waiting for ', ...who, '. Once everyone has voted, cards are revealed automatically.'];
    }

    // B-79: coffee adds a hint for a break (also in anonymous mode); ? and ! are asked first
    const configs = players.map(player => ({ player, config: cardByKey(player.display_card_key) }));
    const pause = configs.some(entry => entry.config && entry.config.key === 'break01');
    const withBreak = parts => {
        if (!pause) return parts;
        if (parts.length === 0) return ['Maybe take a short break.'];
        const last = parts[parts.length - 1];
        const done = typeof last === 'string' && /[.?!]$/.test(last);
        return [...parts, done ? ' Maybe take a short break.' : '. Maybe take a short break.'];
    };

    // B-101: J.U.D.G.E. is a decision, not an estimate: own rules (also in anonymous mode)
    if (isJudgeDeck(json)) return withBreak(judgeTip(configs, json.anonymous_mode === 1));

    // B-79: in anonymous mode always a general, gentle line – nobody is asked to explain
    if (json.anonymous_mode === 1) return withBreak(['Take the chance and talk about what you see.']);

    // "Maria (?)", "Jogi, Paul +1 (!)" – one group per control card that asks for a word
    const asking = ['qstmrk1', 'xclam01'].map(key => {
        const entries = configs.filter(entry => entry.config && entry.config.key === key);
        return entries.length === 0 ? null : tipSide(entries.map(entry => entry.player), entries[0].config);
    }).filter(group => group !== null);
    // groups joined by commas: "Let them explain: Alice (3), Bob (8), Maria (?)"
    const explain = groups => {
        const parts = ['Let them explain: '];
        groups.forEach((group, i) => {
            if (i > 0) parts.push(asking.length > 0 || i < groups.length - 1 ? ', ' : ' and ');
            parts.push(group);
        });
        return parts;
    };
    const talk = asking.length === 0
        ? ['Talk about the cards you chose.']
        : ['Talk about the cards you chose \u2013 ', ...explain(asking).slice(1), ' first.'];

    // the cards actually chosen; control cards (coffee, ?, !, shruggie) stay neutral
    const chosen = configs.filter(entry => entry.config && !entry.config.control);
    if (chosen.length === 0) return withBreak(asking.length > 0 ? explain(asking) : []);
    // B-79: emotions and traffic lights have no range (or just three values): talk instead of names
    if (chosen.some(entry => entry.config.talk)) return withBreak(talk);

    // lowest and highest numeric card; B-79: infinity counts as the highest, veto does not count
    const numeric = chosen.filter(entry => cardRank(entry.config) !== null);
    // no numbers at all (only veto): talk about them
    if (numeric.length === 0) return withBreak(talk);
    const values = numeric.map(entry => cardRank(entry.config));
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) {
        // B-106: the shruggie ("can't say – and that's ok") is no objection: the others may still agree,
        // as long as at least two of them do
        const shrugs = configs.filter(entry => entry.config && entry.config.key === 'shrug01').length;
        if (numeric.length === players.length - shrugs && (shrugs === 0 || numeric.length > 1)) {
            return ['Everyone agrees \u2013 on to the next topic.'];
        }
        // the same number next to a veto: talk about them
        if (chosen.length > numeric.length) return withBreak(talk);
        // next to control cards only: ? and ! explain, otherwise no tip
        return withBreak(asking.length > 0 ? explain(asking) : []);
    }
    return withBreak(explain([...extremeGroups(configs, min, max), ...asking]));
}

/* B-104 (Andreas): who is asked to explain the lowest and highest card. Nobody leaves the list by changing the card
 * after the reveal, but a change can add someone: the extremes of the cards of the reveal (original_card_key, else
 * the current card) and of the current cards (min/max). One group per side and card ("Dan (3)"); a changed card
 * shows both values ("Bob (5→8)"). The current card decides the side, else the card of the reveal. */
function extremeGroups(configs, min, max) {
    const rankOf = config => config && !config.control ? cardRank(config) : null;
    const entries = configs.map(entry => {
        const key = entry.player.original_card_key;
        const original = key !== null && key !== undefined && String(key) !== String(entry.player.display_card_key)
            ? cardByKey(String(key)) : undefined;
        return { ...entry, original, now: rankOf(entry.config), then: original !== undefined ? rankOf(original) : rankOf(entry.config) };
    });
    const thens = entries.map(entry => entry.then).filter(value => value !== null);
    const minThen = Math.min(...thens);
    const maxThen = Math.max(...thens);
    const sideOf = entry => entry.now === min ? 'low' : entry.now === max ? 'high'
        : entry.then === minThen ? 'low' : entry.then === maxThen ? 'high' : null;
    const groupsOf = side => {
        const groups = new Map();
        entries.filter(entry => entry.config && sideOf(entry) === side).forEach(entry => {
            const id = (entry.original ? entry.original.key : '') + '>' + entry.config.key;
            if (!groups.has(id)) groups.set(id, []);
            groups.get(id).push(entry);
        });
        // from low to high like the spread (by the current card, without a value by the card of the reveal)
        const rank = entry => entry.now !== null ? entry.now : entry.then;
        const list = [...groups.values()].sort((a, b) => (rank(a[0]) - rank(b[0])) || 0); // ∞ - ∞: keep the order
        return list.map(group => {
            const part = tipSide(group.map(entry => entry.player), group[0].config);
            if (group[0].original !== undefined) part.from = group[0].original.key;
            return part;
        });
    };
    return [...groupsOf('low'), ...groupsOf('high')];
}

/* B-101: the team's deck is the J.U.D.G.E. group (dao deck.group, else the cards of the deck) */
function isJudgeDeck(json) {
    if (json.deck && typeof json.deck.group === 'string') return json.deck.group === 'judge';
    return gDeck.cards.some(card => card.group === 'judge');
}

/* B-101: the tip after the reveal for a J.U.D.G.E. decision. It is accepted as long as nobody needs to talk
 * (5, or ? and ! which count as a 5) and nobody vetoes (6, also the ✋ card). Those who need to talk come first,
 * then the veto; an accepted decision offers to hear the concerns (3, 4). Anonymous mode: counts, no names.
 * configs: [{ player, config }] of the table; returns the tip parts (tipText) */
function judgeTip(configs, anonymous) {
    const of = keys => configs.filter(entry => entry.config && keys.includes(entry.config.key));
    // R3 review V10 (L28): anonymous mode counts in words, "2 people need to talk", "1 veto"
    const count = (keys, one, many) => {
        const n = of(keys).length;
        return n === 0 ? null : n + ' ' + (n === 1 ? one : many);
    };
    // one group per card: "Bob, Cleo (5)", "Dan (?)"
    const groups = keys => keys.map(key => of([key])).filter(entries => entries.length > 0)
        .map(entries => tipSide(entries.map(entry => entry.player), entries[0].config));
    // "A", "A and B", "A, B and C"
    const join = list => list.flatMap((group, i) =>
        i === 0 ? [group] : [i === list.length - 1 ? ' and ' : ', ', group]);

    const talkKeys = ['jdg5', 'qstmrk1', 'xclam01'];
    const vetoKeys = ['jdg6', 'veto'];
    if (anonymous) {
        const talk = count(talkKeys, 'person needs to talk', 'people need to talk');
        const vetoes = of(vetoKeys).length;
        const veto = vetoes === 0 ? null : (vetoes === 1 ? 'the veto' : 'the ' + vetoes + ' vetoes');
        if (talk !== null) return veto !== null ? [talk + ' first, then hear ' + veto + '.'] : [talk + ' first.'];
        if (veto !== null) return ['Hear ' + veto + ' first.'];
    } else {
        const talk = groups(talkKeys);
        const veto = groups(vetoKeys);
        if (talk.length > 0) {
            const parts = ['Let them talk first: ', ...join(talk)];
            return veto.length > 0 ? [...parts, '. Then hear the veto: ', ...join(veto)] : parts;
        }
        if (veto.length > 0) return ['Hear the veto: ', ...join(veto)];
    }
    // no vote of the deck at all (only coffee): no tip
    if (of(['jdg0', 'jdg1', 'jdg2', 'jdg3', 'jdg4']).length === 0) return [];
    if (anonymous) {
        const concerns = count(['jdg3', 'jdg4'], 'person has concerns', 'people have concerns');
        return concerns === null ? ['Decision accepted.'] : ['Decision accepted. ' + concerns + ' \u2013 want to hear them?'];
    }
    // L29: "Bob (3) has concerns, Eve (4) steps out" – 4 is no concern, it is not taking part
    const said = (keys, one, many) => groups(keys).map(group => {
        const n = of(keys).length;
        return [group, n === 1 ? one : many];
    });
    const concerns = [...said(['jdg3'], ' has concerns', ' have concerns'), ...said(['jdg4'], ' steps out', ' step out')];
    if (concerns.length === 0) return ['Decision accepted.'];
    return ['Decision accepted. ', ...concerns.flatMap((parts, i) => i === 0 ? parts : [', ', ...parts]),
        ' \u2013 want to hear them?'];
}

/* B-68: n blocks (one per vote) in a bar of the spread. New ones are added on top with the class
 * "in" (invisible) and returned, the caller removes it so they fade in; removed ones fade out from
 * the top (class "out") and leave the DOM afterwards. Several at once go one after another: a
 * growing bar builds up from the bottom, a shrinking one fades out from the top. No motion with
 * prefers-reduced-motion or on a resize (no-anim). */
const SPREAD_STEP_MS = 70;
const SPREAD_FADE_MS = 150;

function setSpreadSegments(bar, n) {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        || bar.closest('.no-anim') !== null;
    let segs = Array.from(bar.querySelectorAll('.spread-seg:not(.out)'));
    const added = [];
    if (segs.length < n) {
        // blocks still fading out sit on top: drop them, the new ones go there
        bar.querySelectorAll('.spread-seg.out').forEach(seg => seg.remove());
        for (let i = segs.length; i < n; i++) {
            const seg = document.createElement('span');
            seg.className = 'spread-seg in';
            // the delay only for the fade, not for the height (players joining or leaving)
            if (!still) seg.style.transitionDelay = ((i - segs.length) * SPREAD_STEP_MS) + 'ms, 0s';
            bar.prepend(seg);
            added.push(seg);
        }
    }
    // the blocks in DOM order run from the top: the top ones go first
    segs.slice(0, Math.max(0, segs.length - n)).forEach((seg, i) => {
        if (still) {
            seg.remove();
            return;
        }
        const delay = i * SPREAD_STEP_MS;
        seg.style.transitionDelay = delay + 'ms, 0s';
        seg.classList.add('out');
        setTimeout(() => seg.remove(), delay + SPREAD_FADE_MS + 50);
    });
    return added;
}

function calculateCardStats(players) {
    let cardStats = {};

    players.forEach(player => {
        let cardKey = player.display_card_key;

        if (cardStats[cardKey]) {
            cardStats[cardKey].usageCount++;
        } else {
            cardStats[cardKey] = { usageCount: 1, usagePercentage: 0 };
        }
    });

    let totalUsage = players.length;

    Object.keys(cardStats).forEach(cardKey => {
        cardStats[cardKey].usagePercentage = (cardStats[cardKey].usageCount / totalUsage);
    });

    return cardStats;
}

/* Left edge of the average pointer when it points at the middle of an element (a bar of the
 * spread) whose left edge is at left. */
function indicatorLeft(img, left, pointer) {
    return left + (img.getBoundingClientRect().width - pointer.getBoundingClientRect().width) / 2;
}

/* elementFor: the element the pointer points at for a card key (B-68: its bar in the spread);
 * pointer: the pointer image. Viewport coordinates. */
function calculateIndicatorLefPosition(cardStats, elementFor, pointer) {
    let hasResult = false;
    let resultCnt = 0;
    let resultSum = 0;
    let returnPos = null;
    let curPos;

    Object.keys(cardStats).forEach(cardKey => {
        let card = cardByKey(cardKey);

        if (card && card.value != null && deckHas(cardKey)) {
            hasResult = true;
            resultCnt += cardStats[cardKey].usageCount;
            resultSum += cardStats[cardKey].usageCount * card.value;
        } else if (card && card.infinite) {
            let e = elementFor(cardKey);
            if (e !== null) returnPos = indicatorLeft(e, e.getBoundingClientRect().left, pointer);
        }
    });

    if (returnPos != null) return returnPos;

    // B-98 S5: a custom set: between its cards with a value, in deck order, and only while the values rise
    let line = gDeck.cards;
    if (line.some(card => card.custom)) {
        line = line.filter(card => card.custom && card.value !== null);
        if (line.some((card, i) => i > 0 && card.value < line[i - 1].value)) return null;
    }

    if (hasResult) {
        let avgResult = resultSum / resultCnt;

        let lastVal = null;
        let lastPos = null;

        for (let card of line) {
            let curVal = card.value;

            if (curVal > avgResult) {
                let e = elementFor(card.key);
                curPos = e.getBoundingClientRect().left;

                let range = curVal - lastVal;
                let relativePosition = (avgResult - lastVal) / range;
                let newPosition = lastPos + relativePosition * (curPos - lastPos);
                return Math.round(indicatorLeft(e, newPosition, pointer));
            }

            if (curVal >= avgResult - 0.1 && curVal <= avgResult + 0.1) {
                let e = elementFor(card.key);
                curPos = e.getBoundingClientRect().left;
                return indicatorLeft(e, curPos, pointer);
            }

            lastVal = curVal;
            let e = elementFor(card.key);
            curPos = e.getBoundingClientRect().left;
            lastPos = curPos;
        }
    }

    return null;
}


function showConfetty(playersCount) {
    const jsConfetti = new JSConfetti();
    jsConfetti.addConfetti({
        confettiColors: [
            '#b91267', '#207dbd', '#e5d522'
        ],
        confettiNumber: Math.pow( playersCount, 3)
    });
}

function showDeleteUserOverlay(openIt=true) {
    let overlayDiv= document.getElementById('overlay_delete_user');
    if (openIt) {
        closeMenu(false); // the overlay takes over (B-51)
        removeStyleClass(overlayDiv, 'hidden');
    }
    else addStyleClass(overlayDiv, 'hidden');
}

function deleteUser() {
    // B-152: the UID leaves the storage before the request: delete_user.php tells the boards of all the user's teams
    // (B-81) maybe before its answer is here, and other tabs of this browser must not load them with the deleted UID
    // (dao.php would create it again). They drop it on the storage event and get a new one when they need one.
    const uid = getUid();
    try { localStorage.removeItem(UID_STORE_KEY); } catch (e) { /* no storage */ }
    apiFetch('./api/delete_user.php', { method: 'POST' }).then(() => {
        let fresh = null; // a new UID another tab got meanwhile stays
        try {
            fresh = readStoredUid();
            localStorage.clear();
            if (fresh !== null && fresh !== uid) localStorage.setItem(UID_STORE_KEY, fresh);
        } catch (e) { /* no storage */ }
        gUid = null; // whatever needs a UID afterwards gets a new one (ensureUid)
        document.location = 'about:blank'; // this page is left, so no reload here
    }, () => {
        // not deleted: the UID goes back, unless another tab has a new one already
        try { if (readStoredUid() === null && uid !== '') localStorage.setItem(UID_STORE_KEY, uid); } catch (e) { /* none */ }
    });
}


/* B-34: started while the page is parsed (script.js is deferred), not on window load; board only (#cbox) */
const gOnBoard = document.getElementById('cbox') !== null;
const gConfigReady = gOnBoard ? loadCardConfig() : Promise.resolve();
if (gOnBoard) warmSprite();
