/* global QRCodeStyling */
/* global Remarkable */

let t;
let sid = localStorage.getItem('SID');
let gConn = null;
let gColorMode = "dark";
let gScreenWidth = null;
let gDisplayType = null;
let gTopic = null;
let gCardsConfig = null;
let gCardsPresets = null;
let gSurvey = null;
let gAllPlayersReady = false;
let gLastJson = null;
let gJsonBefore = null;
let gTimerTime = null;
let gTimerBaseTime = new Date();
let gTimerInterval = null;
let gLastShowAvg = null;
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
    fetch(url, { method: 'POST' }).then(()=>{pushDomChange();});
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
            } else {
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


    const images = document.querySelectorAll('#ctl img.on');

    images.forEach(img => {
        if (playerType === "PLAYER") {
            img.classList.add("ctl_hover");
            img.addEventListener("click", setC);
        }
        else {
            img.classList.remove("ctl_hover");
            img.removeEventListener("click", setC);
        }
    });
}

function deletePlayer(e) {
    let url = './api/delete.php?mkey=' + e.target.parentElement.id + '&t=' + t;
    fetch(url, { method: 'POST' }).then(()=>{pushDomChange();});
}

function updateSelectedC(currKey) {
    let e = document.getElementsByClassName('ctl');
    for (let i = 0; i < e.length; i++) {
        if (e[i].id === currKey) {
            e[i].classList.add('selected');
        }
        else {
            e[i].classList.remove('selected');
        }
    }
}

function setC(e) {
    let url = null;
    if (e.target.classList.contains('selected')) {
        if (!gAllPlayersReady) {
            url = './api/setc.php?id=' + localStorage.getItem('SID') + '&cardkey=' + '&t=' + t;
            e.target.classList.remove('selected');
        }
    }
    else
        url = './api/setc.php?id=' + localStorage.getItem('SID') + '&cardkey=' + e.target.id + '&t=' + t;

    if (url !== null) fetch(url, { method: 'POST' }).then(()=>{pushDomChange();});
}

function toggleC(cardId, flag) {
    let e = document.getElementById(cardId);
    let e_conf = document.getElementById('_'+cardId);
    if (flag === '1') {
        if (e===null) {
            console.log(cardId);
        }
        e.classList.add('on');
        e.classList.remove('off');
        e_conf.classList.add('cs_c_on');
    }
    else {
        e.classList.remove('on');
        e.classList.add('off');
        e_conf.classList.remove('cs_c_on');
    }
}

function setCSet(cSet) {
    let str = cSet.padEnd(gCardsConfig.length, '0');

    localStorage.setItem('cSet', str);

    gCardsConfig.forEach(card => {
        toggleC(card.card_key, str.charAt(card.index));
    });
    updateDeckKeys();
}

/* B-68: keys 1–9 and 0 pick the first ten cards of the deck (in deck order) */
const DECK_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

function updateDeckKeys() {
    document.querySelectorAll('#ctl img.ctl').forEach(img => {
        img.nextElementSibling.textContent = '';
    });
    document.querySelectorAll('#ctl img.on').forEach((img, i) => {
        if (i < DECK_KEYS.length) img.nextElementSibling.textContent = DECK_KEYS[i];
    });
    updateDeckRoom();
}

/* B-68: the hint "keys 1–9 pick a card" sits in the row of the keys; it is hidden (class
 * hint-off) when the deck scrolls or its last key does not stay clear of it, so the tray keeps its
 * height. Only where the keys show (style.css "Card deck"). */
function updateDeckRoom() {
    const container = document.getElementById('down-container');
    const ctl = document.getElementById('ctl');
    const hint = container === null ? null : container.querySelector('.deck-hint');
    if (ctl === null || container === null) return;
    const keyed = Array.from(ctl.querySelectorAll('img.on')).slice(0, DECK_KEYS.length);
    const lastKey = keyed.length > 0 ? keyed[keyed.length - 1].nextElementSibling : null;
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
    const cards = document.querySelectorAll('#ctl img.on');
    const img = cards[n];
    if (img === undefined) return;
    event.preventDefault();
    // B-69: a card outside the visible part of the deck comes into view, clear of the edge bars;
    // the first and the last card scroll the deck to its start / end (no bar left there)
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    const ctl = img.closest('#ctl');
    if (n === 0) ctl.scrollTo({ left: 0, behavior });
    else if (n === cards.length - 1) ctl.scrollTo({ left: ctl.scrollWidth, behavior });
    else img.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior });
    img.click();
}

function updateDao(isOnLoad) {
    const url = './api/dao.php?id=' + localStorage.getItem('SID') + '&t=' + t;

    fetch(url)
        .then((response) => {
            return response.json();
        })
        .then((myJson) => {

            gLastJson = myJson;
            updateDom(myJson, isOnLoad)
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
        if (rows * (w * ratio + gapY) <= height) {
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

        const srcStr = 'src/c_' + player.display_card_key + '.png';
        const cardImage = card.getElementsByClassName('card_image')[0];
        const oldSrc = cardImage.src;
        if (!oldSrc.includes(srcStr)) {
            cardImage.src = srcStr;
            removeStyleClass(card, 'cardValueChanged');
            if (!oldSrc.includes('c_done') && !oldSrc.includes('c_prgrss') &&
                !srcStr.includes('c_done') && !srcStr.includes('c_prgrss'))
            {
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

function createCardDiv(player, playersCount, isOnLoad) {
    let newCard = document.createElement('div');
    newCard.id = player.mkey;
    newCard.classList.add('c');
    if (!isOnLoad && playersCount>1) newCard.classList.add('c_fade-in');

    let cardImg = document.createElement('img');
    cardImg.classList.add('background', 'card_image');
    cardImg.src = 'src/c_' + player.display_card_key + '.png';
    newCard.appendChild(cardImg);

    let cardSpan = document.createElement('span');
    cardSpan.classList.add('card_player_name');
    cardSpan.innerText = player.name;
    cardSpan.title = player.name; // the full name when it ends with an ellipsis
    newCard.appendChild(cardSpan);

    let cardDeleteImg = document.createElement('img');
    cardDeleteImg.classList.add('delete');
    cardDeleteImg.src = "./src/delete.png";
    cardDeleteImg.alt = "Delete";
    cardDeleteImg.onclick = deletePlayer;
    newCard.appendChild(cardDeleteImg);

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

function updateDom(myJson, isOnLoad) {

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

    setCSet(myJson.cardset_flags);

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
    updateTimer(myJson);
    updateOrderByConfig(myJson.results_order
                        , myJson.anonymous_mode === 1 || myJson.anonymous_request_toggle === 1);
    updateAnonymityConfig(myJson.anonymous_request_toggle);

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

function initializeWSConnection(teamId) {

    console.log("initializeWSConnection");

    // Überprüfen, ob eine bestehende Verbindung existiert und offen ist
    if (gConn && (gConn.readyState === WebSocket.OPEN || gConn.readyState === WebSocket.CONNECTING)) {
        // Bestehende Verbindung schließen
        gConn.close();
    }

    let wsProtocol = 'wss://';
    if (window.location.protocol.includes('http:')) wsProtocol = 'ws://';

    gConn = new WebSocket(wsProtocol+window.location.host+'/poker-msg');
    gConn.onmessage = function(e){
        if (e.data.includes('pull')) updateDao(false);
    };

    gConn.onopen = () => {
        gConn.send('subscribe: '+teamId);
        updateDao(false);
    }

    setTimeout(function () {
        heartbeatWSConnection();
    }, 10000);
}

function heartbeatWSConnection() {

    //console.log("heartbeatWSConnection");

    if (gConn && gConn.readyState !== WebSocket.OPEN) {
        initializeWSConnection(t);
    } else {
        setTimeout(function () {
            heartbeatWSConnection();
        }, 3000);
    }

}

function pushDomChange() {
    gConn.send('push');
}

function loadBoard() {
    const urlParams = new URLSearchParams(window.location.search);
    t = urlParams.get("t");

    loadCardConfig();
    updateDao(true);
    generateQRCode(window.location.href);
    initializeWSConnection(t);
    initDisplayHandling();
    measureEvent("BOARD_ON_LOAD");

    document.getElementById('nameinput').addEventListener('input', function(event) {
        updateBecomeUserButtons(event.target);
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
        fetch(url, { method: 'POST' }).then(() => {
            pushDomChange();
        });
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
    checkRadio('cet_color_mode', gColorMode === "dark" ? 'dark' : 'light');

    if (gColorMode === "dark") {
        brandImg.src = "./src/brand_dark.svg?v=2";
        document.body.classList.remove('light-theme');
    } else {
        brandImg.src = "./src/brand_light.svg?v=2";
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
    let host = (menu !== null && menu.open && menu.matches(':modal')) ? menu : document.body;
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
 * STOPWATCH shows T+elapsed. TIMER shows T−rest (rest = timebox − elapsed) while rest > 0, then
 * T+ (over time, amber). Between two server updates the client counts on by itself (interval).
 * gTimer: the last server state, gTimerBaseTime: when it arrived. */
let gTimer = null;

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
        text = 'T+' + formatTimerSeconds(elapsed);
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
    return fetch(url, { method: 'POST' }).then(response => {
        if (!response.ok) throw new Error('timer.php ' + response.status);
        pushDomChange();
    });
}

function setTimerVisibility(value) {
    // B-46: confirm the own change with a toast (others just see the timer appear)
    timerAction('set_visibility', value).then(() => {
        showToast(value === '1' ? 'Timer on – everyone on the board sees it' : 'Timer off');
    }).catch(() => updateDao(false));
    measureEvent("TOGGLE_TIMER");
}

function setTimerMode(value) {
    timerAction('set_mode', value).catch(() => updateDao(false));
}

function setTimerTimebox(minutes) {
    let other = document.getElementById('tmr_other');
    other.value = '';
    other.closest('.tmr-other').setAttribute('data-set', 'false');
    showTimerOtherError(false);
    timerAction('set_timebox', minutes).catch(() => updateDao(false));
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
    timerAction('set_timebox', String(minutes)).catch(() => updateDao(false));
    return true;
}

function setTimerAutoRestart(value) {
    timerAction('set_auto_restart', value).catch(() => updateDao(false));
}

function timerStart() {
    timerAction('start').catch(() => updateDao(false));
}

function timerPause() {
    timerAction('pause').catch(() => updateDao(false));
}

function timerReset() {
    timerAction('reset').catch(() => updateDao(false));
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
    /* - load card config from cards.json to create all the html needed
       - to add new cards to the config, put them at the end of the json file
       - increment the index attribute so that all cards get a unique int index,
         starting by 0
       - only change index values of existing cards, if you really know what you are doing!!!
       - to chang the order of the cards just use the attribute sort_order
       - sort_order does not have to be unique, but it will help to maintain consistency
     */

    const url = "./cards.json";
    let jsonCardsConf = loadJSON(url);
    gCardsConfig = jsonCardsConf.cards;
    gCardsConfig.sort((a,b) => a.sort_order - b.sort_order);

    gCardsPresets = jsonCardsConf.presets;

    let ctl = document.getElementById("ctl");
    let cardsThumbs = document.getElementById("cards_thumbs");

    gCardsConfig.forEach(card => {
        let cardElement = document.createElement("img");
        cardElement.id = card.card_key;
        cardElement.src = "src/c_" + card.card_key + ".png";
        cardElement.classList.add("ctl");
        cardElement.alt = card.description;
        // B-68: the card with its key below it (shown on devices with a mouse, style.css)
        let slot = document.createElement("span");
        slot.className = "ctl-slot";
        let key = document.createElement("span");
        key.className = "ctl-key";
        key.setAttribute("aria-hidden", "true");
        slot.append(cardElement, key);
        ctl.appendChild(slot);

        let thumbElement = document.createElement("img");
        thumbElement.id = "_" + card.card_key;
        thumbElement.src = "src/c_" + card.card_key + ".png";
        thumbElement.setAttribute("data-card_key", card.card_key);
        thumbElement.classList.add("cs_c");
        thumbElement.alt = card.description;
        thumbElement.addEventListener("click", toggleCSet);
        cardsThumbs.appendChild(thumbElement);
    });

    let cetPre = document.getElementById("cet_pre");

    gCardsPresets.forEach(preSet => {
        let option = document.createElement("option");
        option.value = preSet.id.toString();
        option.textContent = preSet.description;
        cetPre.appendChild(option);
    });
}

function getCardConfig(cardKey) {
    return gCardsConfig.find(card => card.card_key === cardKey);
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
}

function initDisplayHandling() {
    window.addEventListener('resize', handleResize);
    // B-69: the "<" / ">" bars follow the deck's scroll position; the wheel scrolls it sideways
    const ctl = document.getElementById('ctl');
    if (ctl !== null) {
        ctl.addEventListener('scroll', updateDeckRoom, { passive: true });
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
    const deckCards = Array.from(document.querySelectorAll('#ctl img.on'));
    const keys = deckCards.map(img => img.id).join(',');
    if (bars.getAttribute('data-keys') !== keys) {
        bars.replaceChildren(...deckCards.map(img => {
            const config = getCardConfig(img.id);
            const col = document.createElement('div');
            col.className = 'spread-col zero';
            col.setAttribute('data-card', img.id);
            const count = document.createElement('span');
            count.className = 'spread-count';
            const bar = document.createElement('span');
            bar.className = 'spread-bar';
            const value = document.createElement('span');
            value.className = 'spread-value';
            value.textContent = config ? (config.symbol || config.description) : '';
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
        const config = getCardConfig(col.getAttribute('data-card'));
        if (n > 0 && config && config.numeric_value != null) chosen.push(col.querySelector('.spread-value').textContent);
    });
    if (grown.length > 0) {
        void bars.offsetHeight; // the new blocks start invisible (class "in"), then fade in
        grown.forEach(seg => seg.classList.remove('in'));
    }

    // the range of the chosen numeric values, in deck order: "2 – 20", or "5" when all agree
    let range = '';
    if (chosen.length > 0) {
        range = chosen[0] === chosen[chosen.length - 1] ? chosen[0] : chosen[0] + ' – ' + chosen[chosen.length - 1];
    }
    const rangeElement = document.getElementById('spread_range');
    if (rangeElement.textContent !== range) rangeElement.textContent = range;

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
    const parts = tipText(json, revealed);
    const key = JSON.stringify(parts);
    if (tip.dataset.key === key) return;
    tip.dataset.key = key;
    tip.replaceChildren(...parts.map(part => {
        if (typeof part === 'string') return document.createTextNode(part);
        const b = document.createElement('b');
        b.textContent = part.name;
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
function tipSide(players, value) {
    const names = players.slice(0, 2).map(player => player.name).join(', ');
    return { name: names + (players.length > 2 ? ' +' + (players.length - 2) : '') + ' (' + value + ')' };
}

/* the tip as a list of plain strings and highlighted { name } parts; [] for none */
function tipText(json, revealed) {
    const players = json.players || [];
    if (json.players_count < 2) return ['Copy the board link and invite your team.'];

    if (!revealed) {
        if (json.player_type === 'PLAYER' && !json.selected_card_key) {
            return ['Pick the card that fits best from your point of view. Once everyone has voted, you\'ll see the result.'];
        }
        const missing = players.filter(player => String(player.display_card_key).startsWith('prgrss'));
        if (missing.length === 0) return [];
        const who = missing.length > 3 ? [{ name: missing.length + ' players' }] : tipNames(missing.map(player => player.name));
        return ['Waiting for ', ...who, '. The cards are revealed once everyone has voted.'];
    }

    // lowest and highest numeric card; coffee, ?, ! and infinity do not count
    const numeric = players
        .map(player => ({ player, config: getCardConfig(player.display_card_key) }))
        .filter(entry => entry.config && entry.config.numeric_value != null);
    if (numeric.length === 0) return [];
    const values = numeric.map(entry => entry.config.numeric_value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) return numeric.length === players.length ? ['Everyone agrees \u2013 start a new round.'] : [];
    const side = value => {
        const entries = numeric.filter(entry => entry.config.numeric_value === value);
        return { players: entries.map(entry => entry.player), label: entries[0].config.symbol || entries[0].config.description };
    };
    const low = side(min);
    const high = side(max);
    if (json.anonymous_mode === 1) {
        return ['Let them explain: lowest ', { name: '(' + low.label + ')' }, ' and highest ', { name: '(' + high.label + ')' }];
    }
    return ['Let them explain: ', tipSide(low.players, low.label), ' and ', tipSide(high.players, high.label)];
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
        let cardConfig = getCardConfig(cardKey);

        if (cardConfig && cardConfig.numeric_value != null
            && document.getElementById(cardKey).classList.contains('on')) {
            hasResult = true;
            resultCnt += cardStats[cardKey].usageCount;
            resultSum += cardStats[cardKey].usageCount * cardConfig.numeric_value;
        } else if (cardConfig && cardConfig.description === "infinity") {
            let e = elementFor(cardKey);
            if (e !== null) returnPos = indicatorLeft(e, e.getBoundingClientRect().left, pointer);
        }
    });

    if (returnPos != null) return returnPos;

    if (hasResult) {
        let avgResult = resultSum / resultCnt;

        const images = document.querySelectorAll('#ctl img.on');
        let lastVal = null;
        let lastPos = null;

        for (let img of images) {
            let curVal = getCardConfig(img.id).numeric_value;

            if (curVal > avgResult) {
                let e = elementFor(img.id);
                curPos = e.getBoundingClientRect().left;

                let range = curVal - lastVal;
                let relativePosition = (avgResult - lastVal) / range;
                let newPosition = lastPos + relativePosition * (curPos - lastPos);
                return Math.round(indicatorLeft(e, newPosition, pointer));
            }

            if (curVal >= avgResult - 0.1 && curVal <= avgResult + 0.1) {
                let e = elementFor(img.id);
                curPos = e.getBoundingClientRect().left;
                return indicatorLeft(e, curPos, pointer);
            }

            lastVal = curVal;
            let e = elementFor(img.id);
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
    fetch(url, { method: 'POST' }).then(()=>{
        localStorage.clear();
        sid = '-1';
        pushDomChange();
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