/* global QRCodeStyling */
/* global Remarkable */

let t;
let sid = localStorage.getItem('SID');
let gConn = null;
let gColorMode = "dark";
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
let gSurvey = null;
let gAllPlayersReady = false;
let gLastJson = null;
let gJsonBefore = null;
let gTimerTime = null;
let gTimerBaseTime = new Date();
let gTimerInterval = null;
let gLastShowAvg = null;
// B-75: touch devices (no hover, coarse pointer): no focus without a tap (iOS keyboard).
// B-75/B-77: on these the deck is a carousel at any width (same query as style.css "Card deck");
// a mouse or a trackpad keeps the deck row with the "<" / ">" bars (B-69)
const gTouchQuery = window.matchMedia('(hover: none) and (pointer: coarse)');
let gUserName = null;
let gPromoInitiated = false;

if (sid === null) {
    let uid = (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).toUpperCase();
    localStorage.setItem('SID', uid);
    sid = uid;
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
    let url = './api/newround.php?t=' + t;
    apiWrite(url);
}

function playerTypeUpdate(playerType, name) {
    let ctl = document.getElementById("ctl");
    let overlayNameInput = document.getElementById("overlay_name_input");
    let privacyLink = document.getElementById("overlay_privacy_link");

    if (playerType === 'PLAYER' || playerType === 'OBSERVER') {
        toggleStyleClass(ctl, "hidden", "visible");
        toggleStyleClass(overlayNameInput, "hidden", "visible");
        toggleStyleClass(privacyLink, 'hidden', 'visible');
    }
    else {
        let nameinput = document.getElementById("nameinput");
        let removedMsg = document.getElementById("removed_msg");

        updateBecomeUserButtons(nameinput);

        if (playerType === 'REMOVED') {
            toggleStyleClass(nameinput, 'display_none', 'display_unset');
            toggleStyleClass(removedMsg, 'display_unset', 'display_none');
            toggleStyleClass(privacyLink, 'hidden', 'visible');

        } else {
            toggleStyleClass(nameinput, 'display_unset', 'display_none');
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

function deletePlayer(e) {
    let url = './api/delete.php?mkey=' + e.target.parentElement.id + '&t=' + t;
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
            url = './api/setc.php?id=' + localStorage.getItem('SID') + '&cardkey=' + '&t=' + t;
            element.classList.remove('selected');
            element.setAttribute('aria-pressed', 'false');
        }
    }
    else
        url = './api/setc.php?id=' + localStorage.getItem('SID') + '&cardkey=' + encodeURIComponent(deckCardKey(element)) + '&t=' + t;

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
        // B-68: the card with its key below it (shown on devices with a mouse, style.css)
        const slot = document.createElement("span");
        slot.className = "ctl-slot";
        const keyLabel = document.createElement("span");
        keyLabel.className = "ctl-key";
        keyLabel.setAttribute("aria-hidden", "true");
        slot.append(element, keyLabel);
        entry = { slot, card: element, keyLabel, texts: null };
        gDeckElements.set(card.key, entry);
    }
    if (entry.texts !== gDeckTexts) {
        entry.texts = gDeckTexts;
        entry.card.replaceChildren(cardFace(card, 'deck', cardShowsTexts(card)));
    }
    return entry;
}

/* B-99 (F2): the deck shows texts (headings / descriptions) when one of its cards (not a control card) has
 * some; then the control cards show their headings too. Fibonacci: symbols only, the info line explains
 * the control cards. */
let gDeckTexts = false;

/* D4: the longest description of a "short texts" deck (control cards: 51, J.U.D.G.E. up to 160 characters) */
const DECK_SHORT_INFO = 60;
/* D5: the longest text of a "one word" deck (emotions: "uninterested", stars: "no stars") */
const DECK_WORD_TEXT = 16;

/* D5: how much text the cards of a deck carry; the table cards of a deck share one layout (style.css,
 * #cbox[data-text-size]): none (Fibonacci), word (one short word: emotions, stars; the control cards then
 * show their heading only), short (descriptions up to DECK_SHORT_INFO: traffic lights, Delegation),
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

function cardShowsTexts(card) {
    return gDeckTexts || !card.controlCard;
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
    const parts = [chip];
    if (card.heading) {
        const heading = document.createElement('b');
        heading.textContent = card.heading;
        parts.push(heading);
    }
    if (card.info) parts.push(document.createTextNode((card.heading ? ' — ' : '') + card.info));
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
    const textsChanged = texts !== gDeckTexts;
    gDeckTexts = texts;
    ctl.classList.toggle('deck-texts', texts);
    // D4/D5: the table cards' layout follows the deck's longest text (style.css, "data-text-size")
    const cbox = document.getElementById('cbox');
    if (cbox !== null) cbox.dataset.textSize = deckTextSize(deck);
    ctl.replaceChildren(...deck.cards.map(card => deckElement(card).slot));
    updateDeckTabStop();
    if (textsChanged) refreshTableFaces();
}

/* R3 F4: the team's deck from dao ("deck", card data from card_catalog.json); without it (catalog missing or
 * broken on the server) the old way from cardset_flags and cards.json (adapter in deck.js) */
function setTeamDeck(json) {
    const deck = deckFromServer(json.deck, gCardByKey)
        || deckFromLegacy(gCardCatalog, String(json.cardset_flags || '').padEnd(gCardsConfig.length, '0'));
    setDeck(deck);
    updateDeckKeys();
}

/* B-68: keys 1–9 and 0 pick the first ten cards of the deck (in deck order) */
const DECK_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

function updateDeckKeys() {
    gDeckElements.forEach(({ keyLabel }) => { keyLabel.textContent = ''; });
    gDeck.cards.forEach((card, i) => {
        const entry = gDeckElements.get(card.key);
        if (entry !== undefined && i < DECK_KEYS.length) entry.keyLabel.textContent = DECK_KEYS[i];
    });
    updateDeckRoom();
    syncCarousel(); // B-75
}

/* B-68: the hint "keys 1–9 pick a card" sits in the row of the keys; it is hidden (class
 * hint-off) when the deck scrolls or its last key does not stay clear of it, so the tray keeps its
 * height. Only where the keys show (style.css "Card deck"). */
function updateDeckRoom() {
    const container = document.getElementById('down-container');
    const ctl = document.getElementById('ctl');
    const hint = container === null ? null : container.querySelector('.deck-hint');
    if (ctl === null || container === null) return;
    const keyed = gDeck.cards.slice(0, DECK_KEYS.length);
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
        parts = () => pickedCard ? [document.createTextNode('you picked '), cardSmall(pickedCard)]
            : [document.createTextNode('tap to pick a card')];
    } else {
        const isPicked = middle === picked;
        key = (isPicked ? 'P:' : 'm:') + card.key + (gDeckTexts ? '+' : '');
        parts = () => {
            const name = document.createElement('b');
            name.append(cardSmall(card, !card.heading), card.heading ? ' · ' + card.heading : '');
            const list = [document.createTextNode(isPicked ? 'you picked ' : 'tap to pick '), name];
            if (gDeckTexts && card.info) list.push(Object.assign(document.createElement('span'),
                { className: 'deck-pick-info', textContent: card.info }));
            return list;
        };
    }
    if (line.getAttribute('data-shows') === key) return; // only on a change (per frame while swiping)
    line.setAttribute('data-shows', key);
    line.replaceChildren(...parts());
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

/* B-68: a key 1–9 or 0 picks (or, on the picked card, takes back) a card like a click, players only
 * (observers have no click handler). Not while typing, in the menu or in an overlay. */
function pickCardByKey(event) {
    const n = DECK_KEYS.indexOf(event.key);
    if (n < 0 || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target instanceof Element && target.closest('input, textarea, select, [contenteditable], dialog')) return;
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
    card.click();
}

/* B-92: every board state asked for gets a number; an answer older than the one shown last is
 * dropped (answers may come in any order). The answer on load is always taken: it sets up the page
 * and asks again right away. */
let gDaoSeq = 0;        // board states asked for so far
let gDaoShownSeq = 0;   // number of the board state shown last

function updateDao(isOnLoad) {
    const url = './api/dao.php?id=' + localStorage.getItem('SID') + '&t=' + t;
    const seq = ++gDaoSeq;
    // B-73: the timer part of an answer counts only when no own timer change was under way or
    // finished meanwhile (see timerStateFresh)
    const timerWrite = gTimerWrites === 0 ? gTimerWriteGen : -1;

    fetch(url)
        .then((response) => {
            return response.json();
        })
        .then((myJson) => {

            if (seq < gDaoShownSeq && !isOnLoad) return; // B-92: a newer state is shown already
            gDaoShownSeq = Math.max(gDaoShownSeq, seq);

            gLastJson = myJson;
            updateDom(myJson, isOnLoad, timerStateFresh(timerWrite))
            gJsonBefore = myJson;

            // Promo teaser ("THE AGILE GAME") switched off for Rollout 1 (Andreas, 2026-10-28).
            // getPromo() and the markup stay, to switch it on again: call getPromo() here on load.

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
    const height = table.clientHeight - parseFloat(getComputedStyle(cbox).marginTop) - 7;

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
        if (oldKey !== newKey) {
            setTableCardFace(card, newKey);
            removeStyleClass(card, 'cardValueChanged');
            if (!isStatusCardKey(oldKey) && !isStatusCardKey(newKey)) {
                valueChangedCards.push(card);
            }
        }

        const nameSpan = card.getElementsByClassName('card_player_name')[0];
        if (nameSpan.textContent !== player.name) {
            nameSpan.textContent = player.name;
            nameSpan.title = player.name; // the full name when it ends with an ellipsis
        }
    });

    return valueChangedCards;
}

/* B-99: the face of a card on the table for a card key (a card of the deck or a status card:
 * prgrss1/prgrss2 thinking, done001 ready). The key is kept in data-card; F2: the face is rendered
 * (cards.js). A key the client does not know (e.g. a newer card) shows as its key. */
function tableCardModel(key) {
    return STATUS_CARDS[key] || cardByKey(key) || { key, text: key, heading: null, info: null, style: 'plain' };
}

function setTableCardFace(cardDiv, key) {
    cardDiv.setAttribute('data-card', key);
    const card = tableCardModel(key);
    const face = cardFace(card, 'table', card.status === true || cardShowsTexts(card));
    const old = cardDiv.querySelector('.pc');
    if (old === null) cardDiv.insertBefore(face, cardDiv.querySelector('.delete'));
    else old.replaceWith(face);
}

/* all faces on the table anew (the deck switched between symbols only and texts) */
function refreshTableFaces() {
    document.querySelectorAll('#cbox .c').forEach(card => setTableCardFace(card, card.getAttribute('data-card')));
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
    cardSpan.title = player.name; // the full name when it ends with an ellipsis
    newCard.appendChild(cardSpan);

    let cardDeleteImg = document.createElement('img');
    cardDeleteImg.classList.add('delete');
    cardDeleteImg.src = "./src/delete.png";
    cardDeleteImg.alt = "Delete";
    cardDeleteImg.onclick = deletePlayer;
    newCard.appendChild(cardDeleteImg);
    setTableCardFace(newCard, String(player.display_card_key));

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

    if (!gAllPlayersReady
        && myJson.all_players_ready
        && myJson.needs_celebration
        && !isOnLoad) showConfetty(myJson.players_count);

    gAllPlayersReady = myJson.all_players_ready;
    gSurvey = myJson.survey;
    gUserName = myJson.name;
    updateFeedbackDot(myJson.hide_teaser === 1); // B-57

    checkRadio('cet_user_type', myJson.player_type === "PLAYER" ? 'PLAYER' : 'OBSERVER');
    // B-51: the player's name as a tag on the cursor behind the team name in the header; plain text only
    let promptUser = document.getElementById('prompt_user');
    let promptText = myJson.name ? myJson.name : '';
    if (promptUser.textContent !== promptText) promptUser.textContent = promptText;

    let topic = document.getElementById('topic');
    let topicHash = myJson.topic.hashCode().toString();

    playerTypeUpdate(myJson.player_type, myJson.name);

    if (topic.getAttribute("data-hash") !== topicHash) {

        topic.setAttribute("data-hash", topicHash);
        gTopic = myJson.topic;

        let markDown = new Remarkable({
            html: false, // Enable HTML tags in source
            xhtmlOut: true, // Use '/' to close single tags (<br />)
            breaks: true, // Convert '\n' in paragraphs into <br>
            linkify: true, // Autoconvert URL-like text to links
            // Enable some language-neutral replacement + quotes beautification
            typographer: false,
            // Double + single quotes replacement pairs, when typographer enabled,
            // and smartquotes on. Set doubles to '«»' for Russian, '„“' for German.
            quotes: '“”‘’'
        });
        topic.innerHTML = markDown.render(myJson.topic);

        if (topicHash === "0") {
            topic.classList.add("display_none");
        } else {
            topic.classList.remove("display_none");
        }

    }

    if (document.getElementById("team_name").innerText !== myJson.team_name
        || myJson.players_count !== gJsonBefore.players_count
        || myJson.ready_players_count !== gJsonBefore.ready_players_count
    ) {
        document.title = "" + myJson.ready_players_count + "|" + myJson.players_count +""
        + " Agile Estimations: " + myJson.team_name;
        document.getElementById("team_name").innerText = myJson.team_name;
    }

    if (isOnLoad) {

        if (myJson.color_mode && myJson.color_mode.length > 0) {
            gColorMode = myJson.color_mode;
        }

        if(gSurvey !== "NO"){
            document.getElementById("survey-container").style.visibility="visible";
        }

        setColor();

    }

    setTeamDeck(myJson);
    updateDeckMenu(myJson); // R3 F5 (script_deck.js)

    if (!isOnLoad) {
        if (updatePlayersCards(myJson.players, isOnLoad, myJson.anonymous_mode === 1)) {
            /* returns true when new cards have been added */
            setColor();
        }
    }


    updateSelectedC(myJson.selected_card_key);

    updateNewRoundBtn(myJson.one_ore_more_player_ready, myJson.all_players_ready);

    updateSide(myJson);


    controlsDsp(myJson.player_type);
    if (timerFresh) updateTimer(myJson);
    updateOrderByConfig(myJson.results_order
                        , myJson.anonymous_mode === 1 || myJson.anonymous_request_toggle === 1);
    updateAnonymityConfig(myJson.anonymous_request_toggle);
    checkRadio('cet_show_tips', myJson.show_tips === 0 ? '0' : '1'); // B-96

    activateJediMode(myJson.show_avg);
    updateJediBtn();

    if (isOnLoad) {

        const delayMinutes = Math.random() * 10;
        if(myJson.survey === "LOUD") {
            setTimeout(function () {
                toggleSurvey(true);
            }, Math.round(1000 * 60 * delayMinutes));
        }

        document.body.style.opacity = '1';

        // a new board opens "Board settings" by itself, without taking the focus (name input first);
        // not on phones, where the sheet would cover the name input
        if (myJson.needs_setup && !gPhoneQuery.matches) openMenu('cset', null, false);

        updateDao(false);
    }


}

function activateJediMode(showAvg) {
    if (showAvg === 1 && gLastShowAvg !== null && gLastShowAvg === 0) {
        let body = document.body;
        body.classList.add('flash-red');

        body.addEventListener('animationend', () => {
            body.classList.remove('flash-red');
        }, { once: true });
    }
    gLastShowAvg = showAvg;
}

function updateNewRoundBtn(oneOreMorePlayerReady, allPlayersReady) {
    // B-67 (Andreas): the button is always there; before the first card it is disabled ("Cancel Round")
    let newRoundBtn = document.getElementById('newroundbtn');
    let newButtonText = (oneOreMorePlayerReady && allPlayersReady) ? 'New Round' : 'Cancel Round';
    newRoundBtn.disabled = !oneOreMorePlayerReady;
    newRoundBtn.classList.toggle('primary', newButtonText === 'New Round'); // all cards revealed
    if (newRoundBtn.value !== newButtonText) {
        newRoundBtn.value = newButtonText;
    }
}

/* ---------- Connection to poker-msg (B-81, B-82, B-86) ----------
 * The connection only receives: after 'subscribe' poker-msg sends 'pull' whenever the team changed
 * (the API notifies it after every write, B-81) and 'hb' to every connection every 30 s. The board
 * never sends 'push'; after an own write it loads the board itself (afterWrite), so the own board
 * never depends on the signal. A connection that is closed, or silent for longer than HB_TIMEOUT_MS
 * (half open: sleep, network change, proxies), is rebuilt; its onopen calls updateDao (B-82).
 * While the connection is down #conn_hint covers the board after a short delay and vanishes by
 * itself when it is back (B-86). */
const WS_RECONNECT_MS = 300;       // reconnect after an open connection closed
const WS_RETRY_MS = 2000;          // try again after a connection could not be opened
const WS_CHECK_MS = 3000;          // how often the connection is checked
const HB_TIMEOUT_MS = 40000;       // B-81: no 'hb' or 'pull' for this long: the connection is dead
const CONN_HINT_DELAY_MS = 1200;   // B-86: show the hint only when the trouble lasts longer (no flicker)
const WRITE_TIMEOUT_MS = 15000;    // B-92: a writing API call that hangs longer is given up

let gWsTimer = null;          // check / reconnect timer, only one at a time
let gWsLastMsgAt = 0;         // B-81: when the current connection opened or last received something
let gConnTrouble = false;     // B-86: connection closed or silent
let gConnHintTimer = null;
let gConnHintFocusBack = null;

function initializeWSConnection(teamId) {

    console.log("initializeWSConnection");

    // close an existing connection that is open or still opening
    if (gConn && (gConn.readyState === WebSocket.OPEN || gConn.readyState === WebSocket.CONNECTING)) {
        gConn.close();
    }

    let wsProtocol = 'wss://';
    if (window.location.protocol.includes('http:')) wsProtocol = 'ws://';

    const conn = new WebSocket(wsProtocol+window.location.host+'/poker-msg');
    gConn = conn;
    gWsLastMsgAt = Date.now();
    setConnTrouble(true); // until it is open

    conn.onmessage = function(e){
        if (conn !== gConn) return;
        gWsLastMsgAt = Date.now(); // 'hb', 'pull': the connection is alive
        if (e.data.includes('pull')) updateDao(false);
    };

    let wasOpen = false;
    conn.onopen = () => {
        if (conn !== gConn) return;
        wasOpen = true;
        gWsLastMsgAt = Date.now();
        conn.send('subscribe: '+teamId);
        setConnTrouble(false);
        updateDao(false);
    };

    conn.onclose = () => {
        if (conn !== gConn) return; // replaced on purpose
        setConnTrouble(true);
        scheduleWSCheck(wasOpen ? WS_RECONNECT_MS : WS_RETRY_MS);
    };

    scheduleWSCheck(10000);
}

function scheduleWSCheck(ms) {
    clearTimeout(gWsTimer);
    gWsTimer = setTimeout(checkWSConnection, ms);
}

/* B-81: true when the connection is open and something came within HB_TIMEOUT_MS */
function wsConnectionAlive() {
    return gConn.readyState === WebSocket.OPEN && Date.now() - gWsLastMsgAt <= HB_TIMEOUT_MS;
}

function checkWSConnection() {
    if (gConn.readyState === WebSocket.CONNECTING) {
        // still opening after 10 s: start over
        if (Date.now() - gWsLastMsgAt > 10000) initializeWSConnection(t);
        else scheduleWSCheck(WS_CHECK_MS);
    } else if (!wsConnectionAlive()) {
        initializeWSConnection(t);
    } else {
        scheduleWSCheck(WS_CHECK_MS);
    }
}

/* B-82: back to the tab, back online or back from the page cache: the connection may be dead or
 * half open without an error, so always build a new one (its onopen calls updateDao). */
function reconnectWSConnection() {
    if (gConn === null) return; // no board on this page
    initializeWSConnection(t);
}

function initWSReconnect() {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reconnectWSConnection();
    });
    window.addEventListener('online', reconnectWSConnection);
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) reconnectWSConnection();
    });
}

/* B-81: a writing API call (POST). Never rejects: resolves with the response, or null when the
 * request failed or took longer than WRITE_TIMEOUT_MS. Afterwards (success or not) beforeReload
 * runs, then the board loads the current state itself (afterWrite); poker-msg tells the other boards. */
function apiWrite(url, init = {}, beforeReload = null) {
    const options = Object.assign({ method: 'POST' }, init);
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        options.signal = AbortSignal.timeout(WRITE_TIMEOUT_MS);
    }
    let request;
    try {
        request = fetch(url, options);
    } catch (e) {
        request = Promise.reject(e);
    }
    return request.catch(error => {
        console.log('write failed', url, error);
        return null;
    }).then(response => {
        if (beforeReload !== null) beforeReload();
        afterWrite();
        return response;
    });
}

/* B-81: after an own write: load the board, and do not wait for a dead connection to be found */
function afterWrite() {
    if (gConn === null) return; // no board on this page (start page)
    if (gConn.readyState !== WebSocket.CONNECTING && !wsConnectionAlive()) {
        initializeWSConnection(t); // its onopen loads the board again
    }
    updateDao(false);
}

/* B-86: #conn_hint (board.html) shows up when the trouble lasts longer than CONN_HINT_DELAY_MS.
 * It takes the focus (role="alertdialog"), the rest of the page is inert meanwhile; an open phone
 * menu (modal, top layer, it would cover the hint) is closed. When the connection is there again
 * the hint hides and gives the focus back. */
function setConnTrouble(trouble) {
    if (trouble === gConnTrouble) return;
    gConnTrouble = trouble;
    clearTimeout(gConnHintTimer);
    gConnHintTimer = null;
    if (trouble) {
        gConnHintTimer = setTimeout(() => showConnHint(true), CONN_HINT_DELAY_MS);
    } else {
        showConnHint(false);
    }
}

function connHintVisible() {
    const hint = document.getElementById('conn_hint');
    return hint !== null && !hint.hidden;
}

let gConnHintInert = [];   // the elements made inert while the hint is shown

function showConnHint(show) {
    const hint = document.getElementById('conn_hint');
    if (hint === null || hint.hidden === !show) return;
    if (show) {
        gConnHintFocusBack = document.activeElement;
        const menu = document.getElementById('menu');
        if (isModalOpen(menu)) {
            if (typeof gMenuOpener !== 'undefined' && gMenuOpener !== null) gConnHintFocusBack = gMenuOpener;
            closeMenu(false);
        }
        hint.hidden = false;
        hint.focus({ preventScroll: true });
        gConnHintInert = Array.from(document.body.children).filter(el => el !== hint && !el.inert);
        gConnHintInert.forEach(el => { el.inert = true; });
    } else {
        gConnHintInert.forEach(el => { el.inert = false; });
        gConnHintInert = [];
        hint.hidden = true;
        const back = gConnHintFocusBack;
        gConnHintFocusBack = null;
        if (document.activeElement === hint || document.activeElement === document.body) {
            if (back instanceof HTMLElement && back !== document.body && back.isConnected) {
                back.focus({ preventScroll: true });
            }
        }
    }
}

function loadBoard() {
    const urlParams = new URLSearchParams(window.location.search);
    t = urlParams.get("t");

    loadCardConfig();
    updateDao(true);
    generateQRCode(window.location.href);
    initializeWSConnection(t);
    initWSReconnect();
    initDisplayHandling();
    measureEvent("BOARD_ON_LOAD");

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
    if ( nameInput.value.length === 0) {
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
    let name = document.getElementById("nameinput").value;
    if (name.length > 0) {
        let url = './api/name.php?id=' + localStorage.getItem('SID') + '&type=' + type + '&name=' + encodeURIComponent(name) + '&t=' + t;
        apiWrite(url);
    }
}

function loadInit() {
    let url = './api/get_user.php?id=' + localStorage.getItem('SID');
    gColorMode = loadJSON(url).color_mode;
    setColor();

    document.getElementById('teamForm').addEventListener('submit', function(event) {
        event.preventDefault();
        addTeam();
    });

    initDisplayHandling();
    document.body.style.opacity = "1";
    document.getElementById("teaminput").focus();
    measureEvent("INIT_ON_LOAD");
}

function measureEvent(eventCode) {
    const url = "./api/measure_event.php?id="+sid
            +"&event_code="+eventCode
            +"&display_type="+getBrowserWidth();
    fetch(url, { method: 'POST' }).then();
}


function setColor() {
    // the color mode button (#cmode_btn) shows moon/sun via CSS (body.light-theme)
    let brandImg = document.getElementById("brand");
    let brandIcon = document.getElementById("brand_icon"); // board only (phones show the mark alone)
    checkRadio('cet_color_mode', gColorMode === "dark" ? 'dark' : 'light');

    if (gColorMode === "dark") {
        brandImg.src = "./src/brand_dark.svg?v=2";
        if (brandIcon) brandIcon.src = "./src/brand_icon_dark.svg?v=1";
        document.body.classList.remove('light-theme');
    } else {
        brandImg.src = "./src/brand_light.svg?v=2";
        if (brandIcon) brandIcon.src = "./src/brand_icon_light.svg?v=1";
        document.body.classList.add('light-theme');
    }
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
    fetch('./api/update_user.php?id=' + localStorage.getItem('SID') + '&color_mode=' + gColorMode, { method: 'POST' }).then();
}


/* B-46: on phones the topic strip shows one line; the arrow button (or a tap on the topic)
 * shows all of it. Elsewhere the button is hidden by CSS and the topic is shown in full. */
function toggleTopic(event) {
    let button = document.getElementById('topic_toggle');
    if (getComputedStyle(button).display === 'none') return;
    if (event.target.closest('a')) return; // links in the topic just open
    let expanded = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    button.closest('.topic-bar').setAttribute('data-expanded', expanded ? 'true' : 'false');
}

function copyLink() {
    let text = window.location.href;
    navigator.clipboard.writeText(text).then(function() {
        showToast('Board link copied');
    });
}

/* Short message that pops up from the bottom edge for a moment (style.css, .toast).
 * Plain text only (textContent). Calling it again replaces the text and restarts the timer. */
let gToastTimer = null;
function showToast(text) {
    let toast = document.getElementById('toast');
    // B-51: a modal menu (phone sheet) lies in the top layer; the toast goes into it to stay visible
    // (closeMenu() puts it back)
    let menu = document.getElementById('menu');
    let host = isModalOpen(menu) ? menu : document.body;
    if (toast.parentElement !== host) host.appendChild(toast);
    toast.textContent = text;
    toast.classList.add('toast-on');
    clearTimeout(gToastTimer);
    gToastTimer = setTimeout(function () {
        toast.classList.remove('toast-on');
    }, 2200);
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

/* B-67: timer instead of stopwatch. The server keeps the state per team (api/timer.php, dao.php):
 * visibility (on for everyone), mode STOPWATCH | TIMER, timebox (seconds), auto-restart and the
 * elapsed seconds (timer_time) with the status RUNNING | PAUSED (also before the first start).
 * STOPWATCH shows just the elapsed time (B-79: no T+). TIMER shows T−rest (rest = timebox − elapsed)
 * while rest > 0, then T+ (over time, amber). Between two server updates the client counts on by itself (interval).
 * gTimer: the last server state, gTimerBaseTime: when it arrived. */
let gTimer = null;

/* B-73: an own timer change (a radio in the panel) is shown right away; a board state that was read
 * before the change reached the server would set the panel back (the radio jumps back until the next
 * pull, or for good when the older answer comes last). So the timer part of a board state is only
 * taken when no own change was under way while it was asked for and answered. After the change the
 * board loads itself (apiWrite, after the counters are back) and gets the new state. */
let gTimerWrites = 0;     // own timer changes under way
let gTimerWriteGen = 0;   // own timer changes finished so far

/* writeGen: gTimerWriteGen when updateDao asked, -1 if a change was under way then */
function timerStateFresh(writeGen) {
    return writeGen === gTimerWriteGen && gTimerWrites === 0;
}

const TIMER_PRESETS = [3, 5, 10, 15, 30, 60];

function updateTimer(json) {
    gTimer = {
        status: json.timer_status,
        time: json.timer_time || 0,
        visible: json.timer_visibility === 1,
        mode: json.timer_mode === 'TIMER' ? 'TIMER' : 'STOPWATCH',
        timebox: json.timer_timebox > 0 ? json.timer_timebox : 300,
        autoRestart: json.timer_auto_restart === 1,
    };
    gTimerTime = gTimer.time;
    gTimerBaseTime = new Date();

    let running = gTimer.status === 'RUNNING';
    let box = document.getElementById('timer');
    if (box !== null) {
        box.classList.toggle('display_none', !gTimer.visible);
        // not started yet (or reset): "ready"; both ready and paused are shown dimmed
        box.setAttribute('data-state', running ? 'running' : (gTimer.time === 0 ? 'ready' : 'paused'));
        document.getElementById('timer_start').hidden = running;
        document.getElementById('timer_pause').hidden = !running;
        // keep the focus on the control when play turns into pause (and back) by keyboard
        let focused = document.activeElement;
        if (focused !== null && focused.hidden && (focused.id === 'timer_start' || focused.id === 'timer_pause')) {
            document.getElementById(running ? 'timer_pause' : 'timer_start').focus();
        }
        renderTimer(gTimer.time);
    }
    updateTimerConfig();

    if (running && gTimer.visible) {
        if (gTimerInterval === null) gTimerInterval = setInterval(updateTimerInterval, 500);
    } else if (gTimerInterval !== null) {
        clearInterval(gTimerInterval);
        gTimerInterval = null;
    }
}

/* the seconds elapsed since the last server update are added locally (the illusion of time) */
function updateTimerInterval() {
    renderTimer(gTimerTime + Math.round((new Date() - gTimerBaseTime) / 1000));
}

/* m:ss as mm:ss below one hour, h:mm:ss from 60 minutes on */
function formatTimerSeconds(seconds) {
    let h = Math.floor(seconds / 3600);
    let m = Math.floor(seconds % 3600 / 60);
    let s = seconds % 60;
    let pad = n => String(n).padStart(2, '0');
    return (h > 0 ? h + ':' + pad(m) : pad(m)) + ':' + pad(s);
}

/* spoken form for the aria-label, e.g. "3 min 12 s" */
function spokenTimerSeconds(seconds) {
    let h = Math.floor(seconds / 3600);
    let m = Math.floor(seconds % 3600 / 60);
    let s = seconds % 60;
    return (h > 0 ? h + ' h ' : '') + (h > 0 || m > 0 ? m + ' min ' : '') + s + ' s';
}

function renderTimer(elapsed) {
    if (gTimer === null) return;
    let display = document.getElementById('timer_display');
    let box = document.getElementById('timer');
    if (display === null) return;
    let text, label, over = false;
    if (gTimer.mode === 'TIMER') {
        let rest = gTimer.timebox - elapsed;
        if (rest > 0) {
            text = 'T−' + formatTimerSeconds(rest);
            label = spokenTimerSeconds(rest) + ' left';
        } else {
            over = true;
            text = 'T+' + formatTimerSeconds(-rest);
            label = 'time is up, ' + spokenTimerSeconds(-rest) + ' over';
        }
    } else {
        text = formatTimerSeconds(elapsed);
        label = spokenTimerSeconds(elapsed) + ' elapsed';
    }
    let state = box.getAttribute('data-state');
    if (state === 'ready') label += ', not started';
    if (state === 'paused') label += ', paused';
    if (display.textContent !== text) display.textContent = text;
    label = (gTimer.mode === 'TIMER' ? 'Timer: ' : 'Stopwatch: ') + label;
    if (display.getAttribute('aria-label') !== label) display.setAttribute('aria-label', label);
    box.setAttribute('data-over', over ? 'true' : 'false');
}

/* the timer panel follows the server state (also when someone else changes it); the "other"
 * field is left alone while the user types in it */
function updateTimerConfig(force = false) {
    if (gTimer === null || document.getElementById('timer_box') === null) return;
    checkRadio('tmr_visibility', gTimer.visible ? '1' : '0');
    checkRadio('tmr_mode', gTimer.mode);
    checkRadio('tmr_auto_restart', gTimer.autoRestart ? '1' : '0');
    document.getElementById('tmr_timebox').hidden = gTimer.mode !== 'TIMER';

    let minutes = Math.round(gTimer.timebox / 60);
    let preset = TIMER_PRESETS.includes(minutes);
    document.querySelectorAll('input[name="tmr_timebox"]').forEach(radio => {
        radio.checked = preset && radio.value === String(minutes);
    });
    let other = document.getElementById('tmr_other');
    if (force || document.activeElement !== other) {
        // a custom value is marked like a checked preset (data-set, style.css); a preset leaves the field empty
        other.value = preset ? '' : String(minutes);
        other.closest('.tmr-other').setAttribute('data-set', preset ? 'false' : 'true');
        showTimerOtherError(false);
    }
}

function timerAction(action, value = null) {
    let url = './api/timer.php?t=' + encodeURIComponent(t) + '&action=' + action
        + (value === null ? '' : '&value=' + encodeURIComponent(value));
    gTimerWrites++;
    // B-73: the counters are back before the board loads itself after the write (apiWrite),
    // otherwise the timer part of that answer would be dropped
    return apiWrite(url, {}, () => {
        gTimerWrites--;
        gTimerWriteGen++;
    }).then(response => {
        if (response === null || !response.ok) throw new Error('timer.php ' + (response ? response.status : 'failed'));
    });
}

function setTimerVisibility(value) {
    // B-46: confirm the own change with a toast (others just see the timer appear)
    timerAction('set_visibility', value).then(() => {
        showToast(value === '1' ? 'Timer on – everyone on the board sees it' : 'Timer off');
    }).catch(() => {}); // the board loaded itself (apiWrite)
    measureEvent("TOGGLE_TIMER");
}

function setTimerMode(value) {
    timerAction('set_mode', value).catch(() => {}); // the board loaded itself (apiWrite)
}

function setTimerTimebox(minutes) {
    let other = document.getElementById('tmr_other');
    other.value = '';
    other.closest('.tmr-other').setAttribute('data-set', 'false');
    showTimerOtherError(false);
    timerAction('set_timebox', minutes).catch(() => {}); // the board loaded itself (apiWrite)
}

/* "other: __ min" (whole minutes 1..240), a plain text field (no number field: Safari and Chrome
 * differ there). The field keeps its value while typing (Tab selects it, a click puts the caret in),
 * Enter saves and leaves the field, Escape drops the input, leaving the field saves a valid input
 * (an invalid one is dropped). Invalid on Enter: a short message below the field, nothing is saved,
 * the field keeps the focus. While the field has the focus, updates from others leave it alone
 * (updateTimerConfig). */
function timerOtherKeydown(event) {
    let other = event.target;
    if (event.key === 'Enter') {
        event.preventDefault();
        if (saveTimerOther(true)) other.blur();
    } else if (event.key === 'Escape') {
        // drop the input; preventDefault keeps the menu open (initMenu ignores handled keys)
        event.preventDefault();
        updateTimerConfig(true);
        other.blur();
    }
}

function timerOtherBlur() {
    saveTimerOther(false);
    updateTimerConfig(true);
}

function showTimerOtherError(show) {
    let other = document.getElementById('tmr_other');
    let error = document.getElementById('tmr_other_error');
    if (other === null || error === null) return;
    error.hidden = !show;
    if (show) other.setAttribute('aria-invalid', 'true');
    else other.removeAttribute('aria-invalid');
}

/* saves the typed minutes; returns false for an invalid input (with the message if showError) */
function saveTimerOther(showError) {
    let other = document.getElementById('tmr_other');
    let value = other.value.trim();
    if (value === '') {
        showTimerOtherError(false);
        return true;
    }
    let minutes = Number(value);
    if (!/^[0-9]+$/.test(value) || minutes < 1 || minutes > 240) {
        showTimerOtherError(showError);
        return false;
    }
    showTimerOtherError(false);
    if (gTimer === null || gTimer.timebox === minutes * 60) return true;
    // show the new value right away (the server resets the timer, the next pull brings the rest)
    gTimer.timebox = minutes * 60;
    gTimerTime = 0;
    gTimerBaseTime = new Date();
    timerAction('set_timebox', String(minutes)).catch(() => {}); // the board loaded itself (apiWrite)
    return true;
}

function setTimerAutoRestart(value) {
    timerAction('set_auto_restart', value).catch(() => {}); // the board loaded itself (apiWrite)
}

function timerStart() {
    timerAction('start').catch(() => {}); // the board loaded itself (apiWrite)
}

function timerPause() {
    timerAction('pause').catch(() => {}); // the board loaded itself (apiWrite)
}

function timerReset() {
    timerAction('reset').catch(() => {}); // the board loaded itself (apiWrite)
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

function updateAnonymityConfig(anonymousRequestToggle) {
    checkRadio('cet_anonymous', anonymousRequestToggle === 1 ? '1' : '0');
}


function loadCardConfig() {
    /* - cards.json (v1): the old card list, only for the fallback deck from cardset_flags (deck.js, adapter)
       - card_catalog.json (v2, B-98): groups, variants, control cards and the card texts; the deck of the
         team comes from dao ("deck") and refers to these cards (R3 F4)
     */

    const url = "./cards.json?v=3"; // bump when cards.json changes (Safari keeps it cached)
    let jsonCardsConf = loadJSON(url);
    gCardsConfig = jsonCardsConf.cards;
    gCardsConfig.sort((a,b) => a.sort_order - b.sort_order);

    // B-99 (F1): the card model (deck.js); the tray shows the team's deck once the board state is there.
    // F2/F4: values, headings, descriptions, groups and styles from card_catalog.json (v2); without it the
    // cards still show (value as text, no texts) and the deck falls back to cardset_flags
    let catalogV2 = null;
    try {
        catalogV2 = loadJSON('./card_catalog.json?v=3'); // bump when card_catalog.json changes
    } catch (e) {
        catalogV2 = null;
    }
    gCatalogV2 = catalogV2 && typeof catalogV2 === 'object' ? catalogV2 : null;
    gCardCatalog = catalogFromLegacy(gCardsConfig, catalogV2Index(catalogV2));
    // the catalog v2 cards win; v1 cards only for keys v2 does not know
    gCardByKey = new Map(gCardCatalog.map(entry => [entry.card.key, entry.card]));
    catalogV2Cards(catalogV2).forEach((card, key) => gCardByKey.set(key, card));
}


// Load JSON text from server hosted file and return JSON parsed object
function loadJSON(filePath) {
    // Load json file;
    let json = loadTextFileAjaxSync(filePath, "application/json");
    // Parse json
    return JSON.parse(json);
}

// Load text with Ajax synchronously: takes path to file and optional MIME type
function loadTextFileAjaxSync(filePath, mimeType)
{
    let xmlHttp = new XMLHttpRequest();
    xmlHttp.open("GET",filePath,false);
    if (mimeType != null) {
        if (xmlHttp.overrideMimeType) {
            xmlHttp.overrideMimeType(mimeType);
        }
    }
    xmlHttp.send();
    if (xmlHttp.status === 200 && xmlHttp.readyState === 4 )
    {
        return xmlHttp.responseText;
    }
    else {
        return null;
    }
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
    // B-68: the spread's blocks jump to their new height (e.g. at the breakpoint), only votes animate
    const spread = document.getElementById('spread');
    spread.classList.add('no-anim');
    updateSide(gLastJson, false);
    void spread.offsetHeight;
    spread.classList.remove('no-anim');
    updateDeckRoom();
    syncCarousel(true); // B-75: the card in the middle stays there
}

function initDisplayHandling() {
    window.addEventListener('resize', handleResize);
    initCarousel(); // B-75
    // B-69: the "<" / ">" bars follow the deck's scroll position; the wheel scrolls it sideways
    const ctl = document.getElementById('ctl');
    if (ctl !== null) {
        // (not on the carousel: no bars there, and its frames stay light)
        ctl.addEventListener('scroll', () => { if (!gCarousel.on) updateDeckRoom(); }, { passive: true });
        ctl.addEventListener('wheel', scrollDeckByWheel, { passive: false });
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
        new ResizeObserver(() => {
            const cbox = document.getElementById('cbox');
            if (!fitCardsToTable()) return;
            Array.from(cbox.children).forEach(card => finishAnimations(card, 'flip'));
            finishAnimations(cbox, 'height');
        }).observe(table, { box: 'border-box' });
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

    const revealed = json.all_players_ready && json.players_count > 0;
    let text = 'waiting for players';
    if (revealed) text = 'revealed';
    else if (json.players_count > 0) text = 'voting · ' + json.ready_players_count + '/' + json.players_count + ' voted';
    if (status.textContent !== text) status.textContent = text;

    spread.hidden = !revealed;
    updateTip(json, revealed);

    // the columns follow the deck, also before the reveal (they keep the spread's room)
    const bars = document.getElementById('spread_bars');
    const deckCards = gDeck.cards;
    const keys = deckCards.map(card => card.key).join(',');
    if (bars.getAttribute('data-keys') !== keys) {
        bars.replaceChildren(...deckCards.map(card => {
            const col = document.createElement('div');
            col.className = 'spread-col zero';
            col.setAttribute('data-card', card.key);
            const count = document.createElement('span');
            count.className = 'spread-count';
            const bar = document.createElement('span');
            bar.className = 'spread-bar';
            const value = document.createElement('span');
            value.className = 'spread-value';
            // B-99 (F6): per symbol mono text or a mini symbol (cards.js cardSmall), never a system emoji
            value.appendChild(cardSmall(card));
            col.append(count, bar, value);
            return col;
        }));
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
        return;
    }

    const cardStats = calculateCardStats(json.players);
    const top = Math.max(0, ...Object.values(cardStats).map(stat => stat.usageCount));
    const chosen = [];
    const grown = [];
    Array.from(bars.children).forEach(col => {
        const stat = cardStats[col.getAttribute('data-card')];
        const n = stat ? stat.usageCount : 0;
        col.classList.toggle('top', n > 1 && n === top);
        col.classList.toggle('zero', n === 0);
        col.querySelector('.spread-count').textContent = n > 0 ? String(n) : '';
        grown.push(...setSpreadSegments(col.querySelector('.spread-bar'), n));
        const card = cardByKey(col.getAttribute('data-card'));
        const rank = cardRank(card);
        if (n > 0 && rank !== null) chosen.push({ rank, card });
    });
    if (grown.length > 0) {
        void bars.offsetHeight; // the new blocks start invisible (class "in"), then fade in
        grown.forEach(seg => seg.classList.remove('in'));
    }

    // the range of the chosen numeric values (B-79: infinity as the top end): "2 – 20", "3 – ∞",
    // or "5" when all agree; B-99 (F6): each end as mono text or mini symbol (cardSmall)
    let ends = [];
    if (chosen.length > 0) {
        chosen.sort((a, b) => (a.rank === b.rank ? 0 : (a.rank < b.rank ? -1 : 1)));
        const low = chosen[0].card;
        const high = chosen[chosen.length - 1].card;
        ends = low.key === high.key ? [low] : [low, high];
    }
    const rangeElement = document.getElementById('spread_range');
    const rangeKey = ends.map(card => card.key).join(',');
    if (rangeElement.getAttribute('data-shows') !== rangeKey) {
        rangeElement.setAttribute('data-shows', rangeKey);
        rangeElement.replaceChildren(...ends.flatMap((card, i) => i === 0 ? [cardSmall(card)] : [' – ', cardSmall(card)]));
    }

    let left = null;
    if (json.show_avg === 1) {
        left = calculateIndicatorLefPosition(cardStats,
            key => bars.querySelector('[data-card="' + key + '"]'), pointer);
    }
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
        // B-99 (F6): "Dan (3)", "Eve (✋ as mini symbol)"
        const card = part.card !== undefined ? cardByKey(part.card) : undefined;
        if (card !== undefined) b.append(' (', cardSmall(card), ')');
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
 * ("too big to estimate"), null for cards without a value (veto, control cards). Not for the
 * average: infinity stays out of it. */
function cardRank(card) {
    if (!card) return null;
    if (card.infinite) return Infinity;
    return card.value;
}

/* the tip as a list of plain strings and highlighted { name } parts; [] for none */
function tipText(json, revealed) {
    const players = json.players || [];
    if (json.players_count < 2) return ['Copy the board link and invite your team.'];

    if (!revealed) {
        if (json.player_type === 'PLAYER' && !json.selected_card_key) {
            return ['Pick the card that fits best from your point of view. Once everyone has voted, cards are revealed automatically.'];
        }
        const missing = players.filter(player => String(player.display_card_key).startsWith('prgrss'));
        if (missing.length === 0) return [];
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
            if (i > 0) parts.push(asking.length > 0 ? ', ' : ' and ');
            parts.push(group);
        });
        return parts;
    };
    const talk = asking.length === 0
        ? ['Talk about the cards you chose.']
        : ['Talk about the cards you chose \u2013 ', ...explain(asking).slice(1), ' first.'];

    // the cards actually chosen; control cards (coffee, ?, !) stay neutral
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
        if (numeric.length === players.length) return ['Everyone agrees \u2013 on to the next topic.'];
        // the same number next to a veto: talk about them
        if (chosen.length > numeric.length) return withBreak(talk);
        // next to control cards only: ? and ! explain, otherwise no tip
        return withBreak(asking.length > 0 ? explain(asking) : []);
    }
    const side = value => {
        const entries = numeric.filter(entry => cardRank(entry.config) === value);
        return tipSide(entries.map(entry => entry.player), entries[0].config);
    };
    return withBreak(explain([side(min), side(max), ...asking]));
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
    // one group per card: "Bob, Cleo (5)", "Dan (?)"; anonymous: "2 × need to talk"
    const groups = (keys, what) => {
        if (anonymous) {
            const n = of(keys).length;
            return n === 0 ? [] : [n + ' \u00d7 ' + what];
        }
        return keys.map(key => of([key])).filter(entries => entries.length > 0)
            .map(entries => tipSide(entries.map(entry => entry.player), entries[0].config));
    };
    // "A", "A and B", "A, B and C"
    const join = list => list.flatMap((group, i) =>
        i === 0 ? [group] : [i === list.length - 1 ? ' and ' : ', ', group]);

    const talk = groups(['jdg5', 'qstmrk1', 'xclam01'], 'need to talk');
    const veto = groups(['jdg6', 'veto'], 'veto');
    if (talk.length > 0) {
        const parts = ['Let them talk first: ', ...join(talk)];
        return veto.length > 0 ? [...parts, '. Then hear the veto: ', ...join(veto)] : parts;
    }
    if (veto.length > 0) return ['Hear the veto: ', ...join(veto)];
    // no vote of the deck at all (only coffee): no tip
    if (of(['jdg0', 'jdg1', 'jdg2', 'jdg3', 'jdg4']).length === 0) return [];
    const concerns = groups(['jdg3', 'jdg4'], 'concerns');
    if (concerns.length === 0) return ['Decision accepted.'];
    return [anonymous ? 'Decision accepted. ' : 'Decision accepted. Concerns from ', ...join(concerns),
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

    if (hasResult) {
        let avgResult = resultSum / resultCnt;

        let lastVal = null;
        let lastPos = null;

        for (let card of gDeck.cards) {
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
    let url = './api/delete_user.php?id=' + sid;
    // B-81: the API tells the boards of all the user's teams; this page is left, so no reload here
    fetch(url, { method: 'POST' }).then(()=>{
        localStorage.clear();
        sid = '-1';
        document.location = 'about:blank';
    });
}


function getBrowserLanguage() {
    return (navigator.languages && navigator.languages[0]) || navigator.language || navigator.userLanguage;
}


function getPromo() {
    if (getBrowserLanguage().startsWith('de') && !gPromoInitiated) {
        fetch('api/get_promo.php?player_id=' + sid + '&team_id=' + t + '&display_type=' + getBrowserWidth(), { method: 'POST' })
            .then(response => response.json())
            .then(promoData => {
                initPromo(
                    promoData.promo_id,
                    promoData.playout_delay_sec,
                    promoData.promo_headline,
                    promoData.promo_img_url,
                    promoData.promo_link_url,
                    promoData.promo_cta
                );
                gPromoInitiated = true;
            });
    }
}


function initPromo(promoId, playoutDelaySec, promoHeadline, promoImgUrl, promoLinkUrl, promoCTA) {
    const url = "api/update_promo.php?id="+promoId+"&action=";

    const promoTab = document.getElementById('promo-tab');
    const promoQuestionSpan = document.getElementById('promo-question');
    const promoClose = promoTab.querySelector('.promo-close');
    const promoImage = promoTab.querySelector('.promo-image');
    const promoLink = promoTab.querySelector('.promo-link');

    promoQuestionSpan.textContent = promoHeadline;
    promoImage.src = promoImgUrl;
    promoLink.textContent = promoCTA;


    setTimeout(function () {
        promoTab.classList.remove('promo-hidden');
        fetch(url+"played_out", { method: 'POST' }).then();
    }, playoutDelaySec * 1000);

    promoQuestionSpan.addEventListener('mouseover', function () {
        promoTab.classList.add('promo-expanded');
        fetch(url+"expanded", { method: 'POST' }).then();
    });

    promoTab.addEventListener('mouseleave', function () {
        promoTab.classList.remove('promo-expanded');
    });

    promoClose.addEventListener('click', function (e) {
        e.stopPropagation();
        promoTab.style.display = 'none';
        fetch(url+"hided", { method: 'POST' }).then();
    });

    promoImage.addEventListener('click', function (e) {
        e.stopPropagation();
        promoTab.style.display = 'none';
        window.open(promoLinkUrl, '_blank');
        fetch(url+"converted_img", { method: 'POST' }).then();
    });
    promoLink.addEventListener('click', function (e) {
        e.stopPropagation();
        promoTab.style.display = 'none';
        window.open(promoLinkUrl, '_blank');
        fetch(url+"converted_a", { method: 'POST' }).then();
    });
}