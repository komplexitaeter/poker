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
    toggleMobileMenu("closed");
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

            if (isOnLoad) {
                getPromo();
            }

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

/* Card positions relative to #cbox, including a running FLIP transform. */
function getCardPositions(cardsDiv) {
    const boxRect = cardsDiv.getBoundingClientRect();
    const positions = new Map();
    Array.from(cardsDiv.children).forEach(card => {
        const rect = card.getBoundingClientRect();
        positions.set(card, { left: rect.left - boxRect.left, top: rect.top - boxRect.top });
    });
    return positions;
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

    // Last + Invert + Play
    const lastPositions = getCardPositions(cardsDiv);
    const movedCards = new Set();
    if (flip) {
        firstPositions.forEach((first, card) => {
            const last = lastPositions.get(card);
            if (last === undefined) return; // removed
            const dx = first.left - last.left;
            const dy = first.top - last.top;
            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
            movedCards.add(card);
            card.animate(
                [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
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

    if (myJson.player_type === "PLAYER") {
        document.getElementById('cet_toggle_user_type').value = "Become Observer";
    } else {
        document.getElementById('cet_toggle_user_type').value = "Participate as a Player";
    }

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

        if (myJson.hide_teaser === 1) {
            hideTeaser(false);
        }

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

    showCardUsage(myJson.players, myJson.all_players_ready, myJson.show_avg);


    controlsDsp(myJson.player_type);
    updateStopwatch(myJson.timer_status, myJson.timer_time, myJson.timer_visibility);
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

        if (myJson.needs_setup) toggle_box('cset');

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
    let newRoundBtn = document.getElementById('newroundbtn');

    if (oneOreMorePlayerReady) {
        toggleStyleClass(newRoundBtn, "display_unset", "display_none");
        let newButtonText;
        if (allPlayersReady) {
            newButtonText = 'New Round';
        } else {
            newButtonText = 'Cancel Round';
        }
        if (document.getElementById('newroundbtn').value !== newButtonText) {
            document.getElementById('newroundbtn').value = newButtonText
        }
    }
    else {
        toggleStyleClass(newRoundBtn, "display_none", "display_unset");
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

    if (gColorMode === "dark") {
        brandImg.src = "./src/brand_dark.svg";
        document.body.classList.remove('light-theme');
    } else {
        brandImg.src = "./src/brand_light.svg";
        document.body.classList.add('light-theme');
    }

    Array.from(document.getElementsByClassName("switchable")).forEach(element => {
        if (gColorMode === "dark") {
            element.classList.remove("light");
        } else {
            element.classList.add("light");
        }
    });
}

function switchColorMode(){
    if (gColorMode === "dark") gColorMode = "light";
    else gColorMode = "dark";
    measureEvent("USE_COLOR_SWITCH");
    setColor();
    fetch('./api/update_user.php?id=' + localStorage.getItem('SID') + '&color_mode=' + gColorMode, { method: 'POST' }).then();
}


function toggleMobileMenu(target_state){
    let menu = document.getElementById("mobile-menu");
    let newroundbtn = document.getElementById("newroundbtn");
    // breakpoint mirrored in style/style.css (@media (max-width: 799.98px))
    if(menu.getAttribute('data-state') !== target_state && window.matchMedia('(max-width: 799.98px)').matches){
        menu.setAttribute('data-state', target_state);
        newroundbtn.setAttribute('data-state', target_state);
    }
}

function copyLink() {
    let text = window.location.href;
    navigator.clipboard.writeText(text).then(function() {
        let copyButton = document.getElementById("copy_link_btn");
        copyButton.classList.remove("react");
        setTimeout(function() {
            copyButton.classList.add("react");
        }, 75);
    });
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
        image: "src/logo_qr_code.png",
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

function hideTeaser(updateUser=true) {
    let e = document.getElementById("cta_teaser");

    if (updateUser && !e.classList.contains("hidden")) {
        fetch('./api/update_user.php?id=' + localStorage.getItem('SID') + '&hide_teaser=1', { method: 'POST' }).then();
    }

    addStyleClass(e, "hidden");
}

function updateStopwatch(timer_status, timer_time, timer_visibility){

    /* Save last timer value from Json response according to the base date (now),
     * so the correct clock value can be calculated by the client, without
     * relying on frequent server responses.
     * */
    gTimerTime = timer_time;
    gTimerBaseTime = new Date();

    switch(timer_status){
        case "PAUSED":
            addStyleClass(document.getElementById("stopwatch_pause"),"display_none");
            removeStyleClass(document.getElementById("stopwatch_start"),"display_none");
        break;

        case "RUNNING":
            addStyleClass(document.getElementById("stopwatch_start"),"display_none");
            removeStyleClass(document.getElementById("stopwatch_pause"),"display_none");
        break;

        default:
        break;
    }

    timer_time = new Date(timer_time * 1000).toISOString().slice(11, 19);

    if(document.getElementById("stopwatch_timer").value !== timer_time){
        document.getElementById("stopwatch_timer").value = timer_time;
    }

    switch(timer_visibility){
        case 0:
            addStyleClass(document.getElementById("stopwatch"),"display_none");
            document.getElementById("stopwatch_btn").setAttribute("aria-pressed", "false");
        break;

        case 1:
            removeStyleClass(document.getElementById("stopwatch"),"display_none");
            document.getElementById("stopwatch_btn").setAttribute("aria-pressed", "true");
        break;

        default:
        break;
    }

    /* Initiate r clear the Interval function, based on the timer status
     */
    if (timer_status === "RUNNING" && timer_visibility === 1) {
        if (gTimerInterval === null) gTimerInterval = setInterval(updateStopwatchInterval, 500);
    } else {
        if (gTimerInterval !== null) {
            clearInterval(gTimerInterval);
            gTimerInterval = null;
        }
    }
}

function updateStopwatchInterval() {
    /* Add the number of seconds elapsed since the last update of the timer time
     * to this value und update the DOM accordingly (just to create the illusion
     * of time).
     * */
    let timer_time = gTimerTime + Math.round((new Date() - gTimerBaseTime)/1000);

    timer_time = new Date(timer_time * 1000).toISOString().slice(11, 19);


    if(document.getElementById("stopwatch_timer").value !== timer_time){
        document.getElementById("stopwatch_timer").value = timer_time;
    }
}

function switchStopwatchVisiblity(){
    let url = './api/timer.php?t=' +t + '&action=toggle_visibility';
    fetch(url, { method: 'POST' }).then(()=>{pushDomChange();});
    measureEvent("TOGGLE_TIMER");
}

function stopwatchStart(){
    let url = './api/timer.php?t=' + t + '&action=start';
    fetch(url, { method: 'POST' }).then(()=>{pushDomChange();});
}

function stopwatchPause(){
    let url = './api/timer.php?t=' + t + '&action=pause';
    fetch(url, { method: 'POST' }).then(()=>{pushDomChange();});
}

function stopwatchReset(){
    let url = './api/timer.php?t=' + t + '&action=reset';
    fetch(url, { method: 'POST' }).then(()=>{pushDomChange();});
}


/* B-42: The sort order is only set in the menu (Card value = SEQUENCE, Player name = NAME).
 * Legacy values like 'CHOOSE:SEQUENCE' (before the data update) are shown as Card value.
 * In anonymous mode the server always arranges revealed cards by card value, so the
 * select is disabled and shows "Card value", whatever is stored; a hint explains why.
 * Nothing is sent to the API: the stored value stays and shows up again as soon as
 * anonymous mode is switched off. This already applies when anonymous mode is
 * requested for the next round, so it reacts as soon as "Hide names" is chosen.
 * The hint is only referenced via aria-describedby while it is visible. */
function updateOrderByConfig(resultsOrder, anonymousMode) {
    let dropDown = document.getElementById("cet_order_by");
    let hint = document.getElementById("cet_order_by_hint");
    let order = (resultsOrder === 'NAME' && !anonymousMode) ? 'NAME' : 'SEQUENCE';

    if (dropDown.value !== order) {
        dropDown.value = order;
    }

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
    let dropDown = document.getElementById("cet_anonymous");

    if (dropDown.value !== anonymousRequestToggle ) {
        dropDown.value = anonymousRequestToggle;
    }
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
        ctl.appendChild(cardElement);

        let thumbElement = document.createElement("img");
        thumbElement.id = "_" + card.card_key;
        thumbElement.src = "src/c_" + card.card_key + ".png";
        thumbElement.setAttribute("data-card_key", card.card_key);
        thumbElement.src = "src/c_" + card.card_key + ".png";
        thumbElement.classList.add("topnav");
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
    showCardUsage(gLastJson.players, gLastJson.all_players_ready, gLastJson.show_avg);
}

function initDisplayHandling() {
    window.addEventListener('resize', handleResize);
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

function calculateIndicatorLefPosition(cardStats) {
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
            let e = document.getElementById(cardKey);
            curPos = e.getBoundingClientRect().left;
            returnPos = curPos + 15;
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
                let e = document.getElementById(img.id);
                curPos = e.getBoundingClientRect().left;

                let range = curVal - lastVal;
                let relativePosition = (avgResult - lastVal) / range;
                let newPosition = lastPos + relativePosition * (curPos - lastPos);
                return Math.round(newPosition) + 15;
            }

            if (curVal >= avgResult - 0.1 && curVal <= avgResult + 0.1) {
                let e = document.getElementById(img.id);
                curPos = e.getBoundingClientRect().left;
                return curPos + 15;
            }

            lastVal = curVal;
            let e = document.getElementById(img.id);
            curPos = e.getBoundingClientRect().left;
            lastPos = curPos;
        }
    }

    return null;
}


function updateAvgIndicator(cardStats, showStats) {
    let index = document.getElementById("index");
    if (showStats) {
        let indicatorLeftPos = calculateIndicatorLefPosition(cardStats);
        if (indicatorLeftPos != null) {
            index.style.left = indicatorLeftPos + "px";
            if (index.classList.contains("hidden")) {
                toggleStyleClass(index, "visible", "hidden")
            }
        } else {
            toggleStyleClass(index, "hidden", "visible");
        }
    } else {
        toggleStyleClass(index, "hidden", "visible");
    }
}

function showCardUsage(players, allPlayersReady, showAvg) {
    let cardStats = calculateCardStats(players);

    const images = document.querySelectorAll('#ctl img.on');

    images.forEach(img => {
        const cardStat = cardStats[img.id];

        if (cardStat) {
            const usagePercentage = cardStat.usagePercentage || 0;
            const boxShadowSize = Math.round(75 * usagePercentage);

            if (cardStat.usageCount >0 && allPlayersReady) {
                img.style.boxShadow = `0 -${boxShadowSize}px 0 0 var(--secondary-border-color)`;
            } else {
                img.style.boxShadow = '0 0px 0 0 var(--secondary-border-color)';
            }
        } else {
            img.style.boxShadow = '0 0px 0 0 var(--secondary-border-color)';
        }
    });

    let ctl = document.getElementById("ctl");

    if (allPlayersReady && players.length>0) {
        ctl.classList.add("show_card_stats");
        if (showAvg === 1) {
            updateAvgIndicator(cardStats, true);
        } else {
            updateAvgIndicator(cardStats,false);
        }
    } else {
        ctl.classList.remove("show_card_stats");
        updateAvgIndicator(cardStats,false);
    }
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
    if (openIt) removeStyleClass(overlayDiv, 'hidden')
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