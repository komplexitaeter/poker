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
let gResultOder = 'NAME';
let gAllPlayersReady = false;
let gLastJson = null;
let gTimerTime = null;
let gTimerBaseTime = new Date();
let gTimerInterval = null;
let gLastShowAvg = null;
let gUserName = null;

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
    fetch(url).then(()=>{pushDomChange();});
    toggleMobileMenu("closed");
}

function playerTypeUpdate(playerType, name) {
    let ctl = document.getElementById("ctl");
    let overlayNameInput = document.getElementById("overlay_name_input");

    if (playerType === 'PLAYER' || playerType === 'OBSERVER') {
        toggleStyleClass(ctl, "hidden", "visible");
        toggleStyleClass(overlayNameInput, "hidden", "visible");
    }
    else {
        let nameinput = document.getElementById("nameinput");
        let removedMsg = document.getElementById("removed_msg");

        updateBecomeUserButtons(nameinput);

        if (playerType === 'REMOVED') {
            toggleStyleClass(nameinput, 'display_none', 'display_unset');
            toggleStyleClass(removedMsg, 'display_unset', 'display_none');
        } else {
            toggleStyleClass(nameinput, 'display_unset', 'display_none');
            toggleStyleClass(removedMsg, 'display_none', 'display_unset');
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
    fetch(url).then(()=>{pushDomChange();});
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

    if (url !== null) fetch(url).then(()=>{pushDomChange();});
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

        });
}

function updateOrderByButtons(results_order, allPlayersReady, anonymousMode) {
    let order_by_switch = document.getElementById("order_by_switch");
    let orderByDiv = document.getElementById("order_by_div");

        if (results_order.includes('CHOOSE') && !anonymousMode) {
            if (allPlayersReady) {
                if (results_order.includes('SEQUENCE')) {
                    toggleStyleClass(order_by_switch, "by_value","by_name");
                } else {
                    toggleStyleClass(order_by_switch, "by_name","by_value");
                }
                toggleStyleClass(orderByDiv, "display_flex","display_none");
            } else {
                toggleStyleClass(orderByDiv, "display_none","display_flex");
            }
        } else {
            toggleStyleClass(orderByDiv, "display_none","display_flex");
        }


    gResultOder = results_order;
}

function getCardPos(pos, cardsCount) {
    let cardsWidth = 110;
    let cardsHeight = Math.round(cardsWidth * 1.48);
    let cardsInCol =  Math.min(Math.floor(gScreenWidth / cardsWidth), cardsCount);
    let posInCol = ( pos % cardsInCol );
    let row = Math.floor(pos / cardsInCol);
    let cardsInCurrentCol = cardsInCol;
    let rows = Math.floor((cardsCount-1) / cardsInCol ) + 1;
    if (row + 1 >= rows) {
        cardsInCurrentCol = cardsCount - ((row)*cardsInCol);
    }
    let margin = Math.round( ( gScreenWidth - (cardsInCurrentCol * cardsWidth))/2 );
    if (gDisplayType === "xs" || gDisplayType === "sm") {
        margin = Math.round( ( gScreenWidth - (cardsInCol * cardsWidth))/2 );
    }
    let leftPos = margin + posInCol * cardsWidth;
    let topPos = row * cardsHeight;
    let totalYDim = rows * cardsHeight;
    //console.log('pos='+pos+' cardsInCol='+cardsInCol+' posInCol='+posInCol+' row='+row);
    return {
        left: leftPos + 'px',
        top: topPos + 'px',
        totalYDim: totalYDim + 'px'};

}

function removeCards(cardsDiv, players) {
    Array.from(cardsDiv.children).forEach(card => {
        if (players.find(player => player.mkey === card.id) === undefined) {
            card.remove();
        }
    });
}

function updateCards(cardsDiv, players) {

    Array.from(cardsDiv.children).forEach(card => {

        if (card.classList.contains('c_fade-in')) {
            setTimeout(function () {
                removeStyleClass(card, 'c_fade-in');
            }, 1800);
        }

        let player = players.find(p => p.mkey === card.id);

        const newPos = getCardPos(player.i, players.length);

        const srcStr = 'src/c_' + player.display_card_key + '.png';
        const oldSrc = Array.from(card.getElementsByClassName('card_image'))[0].src;
        if (!oldSrc.includes(srcStr)) {
            Array.from(card.getElementsByClassName('card_image'))[0].src = srcStr;
            removeStyleClass(card, 'cardValueChanged');
            if (!oldSrc.includes('c_done') && !oldSrc.includes('c_prgrss') &&
                !srcStr.includes('c_done') && !srcStr.includes('c_prgrss'))
            {
                let animationDelay = 10;
                if (players.length > 1 && (
                    card.style.left !== newPos.left ||
                    card.style.top !== newPos.top
                )) animationDelay = 900;
                setTimeout(function () {
                    addStyleClass(card, 'cardValueChanged');
                }, animationDelay);
            }
        }

        if (Array.from(card.getElementsByClassName('card_player_name'))[0].textContent !== player.name) {
            Array.from(card.getElementsByClassName('card_player_name'))[0].textContent = player.name;
        }

        if (card.style.left !== newPos.left) {
            card.style.left = newPos.left;
        }
        if (card.style.top !== newPos.top) {
            card.style.top = newPos.top;
        }
    });
}

function createCardDiv(player, playersCount, isOnLoad) {
    let newCard = document.createElement('div');
    newCard.id = player.mkey;
    newCard.classList.add('c', 'sizefit');
    if (!isOnLoad && playersCount>1) newCard.classList.add('c_fade-in');
    const cardPos = getCardPos(player.i, playersCount);
    newCard.style.left = cardPos.left;
    newCard.style.top = cardPos.top;

    let cardImg = document.createElement('img');
    cardImg.classList.add('background', 'sizefit', 'card_image');
    cardImg.src = 'src/c_' + player.display_card_key + '.png';
    newCard.appendChild(cardImg);

    let cardSpan = document.createElement('span');
    cardSpan.classList.add('sizefit', 'card_player_name');
    cardSpan.innerText = player.name;
    newCard.appendChild(cardSpan);

    let cardDeleteImg = document.createElement('img');
    cardDeleteImg.classList.add('delete', 'sizefit');
    cardDeleteImg.src = "./src/delete.png";
    cardDeleteImg.alt = "Delete";
    cardDeleteImg.onclick = deletePlayer;
    newCard.appendChild(cardDeleteImg);

    return newCard;
}

function addCards(cardsDiv, players, isOnLoad) {
    let cardsHaveBeenAdded = false;

    players.forEach(player => {
        if (Array.from(cardsDiv.children).find(card => card.id === player.mkey) === undefined) {
                cardsDiv.appendChild(createCardDiv(player, players.length, isOnLoad));
                cardsHaveBeenAdded = true;
        }
    });

    return cardsHaveBeenAdded;
}

function updatePlayersCards(players, isOnLoad) {
    let cardsHaveBeenAdded ;
    let cardsDiv = document.getElementById("cbox");

    removeCards(cardsDiv, players);
    updateCards(cardsDiv, players);
    cardsHaveBeenAdded = addCards(cardsDiv, players, isOnLoad);

    let newCardsDivHeight = getCardPos(players.length, players.length).totalYDim;
    if (cardsDiv.style.height !== newCardsDivHeight) {
        cardsDiv.style.height = newCardsDivHeight;
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

    if (document.getElementById("team_name").innerText !== myJson.team_name) {
        document.title = "Agile Estimations Online - " + myJson.team_name;
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

        const elements = document.querySelectorAll('.c');
        elements.forEach(e => {
            if (myJson.anonymous_mode === 1) {
                removeStyleClass(e, 'c_move');
            }
        });

        if (updatePlayersCards(myJson.players, isOnLoad)) {
            /* returns true when new cards have been added */
            adaptToDevice();
            setColor();
        }

        elements.forEach(e => {
            if (!(myJson.anonymous_mode === 1)) {
                addStyleClass(e, 'c_move');
            }
        });
    }


    updateSelectedC(myJson.selected_card_key);

    updateNewRoundBtn(myJson.one_ore_more_player_ready, myJson.all_players_ready);

    showCardUsage(myJson.players, myJson.all_players_ready, myJson.show_avg);


    controlsDsp(myJson.player_type);
    updateOrderByButtons(myJson.results_order
                        , myJson.all_players_ready && myJson.players.length>0
                        , myJson.anonymous_mode);
    updateStopwatch(myJson.timer_status, myJson.timer_time, myJson.timer_visibility);
    updateOrderByConfig(myJson.results_order);
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
        adaptToDevice();

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
            becomePlayer();
        }
    });
    becomePlayerBtn.addEventListener('click', becomePlayer);

    let becomeObserverBtn = document.getElementById("become_observer_btn");
    becomeObserverBtn.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
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
        let url = './api/name.php?id=' + localStorage.getItem('SID') + '&type=' + type + '&name=' + name + '&t=' + t;
        fetch(url).then(() => {
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
            +"&display_type="+gDisplayType;
    fetch(url).then();
}


function setColor() {
    let toggleImg = document.getElementById("cmode_btn");
    let brandImg = document.getElementById("brand");


    if (gColorMode === "dark") {
        toggleImg.src = "./src/toggle_light.svg";
        brandImg.src = "./src/brand_dark.svg";
        document.body.classList.remove('light-theme');
    } else {
        toggleImg.src = "./src/toggle_dark.svg";
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
    fetch('./api/update_user.php?id=' + localStorage.getItem('SID') + '&color_mode=' + gColorMode).then();
}


function toggleMobileMenu(target_state){
    let menu = document.getElementById("mobile-menu");
    let newroundbtn = document.getElementById("newroundbtn");
    if(menu.getAttribute('data-state') !== target_state && (getBrowserWidth() === "xs" || getBrowserWidth() === "sm")){
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
        fetch('./api/update_user.php?id=' + localStorage.getItem('SID') + '&hide_teaser=1').then();
    }

    addStyleClass(e, "hidden");
}

function adaptToDevice() {
    let size = getBrowserWidth();
    if (size === "xs" || size === "sm") {
        Array.from(document.getElementsByClassName("sizefit")).forEach(e => {
            e.classList.add("mobile");
            e.classList.remove("desktop");
        });
    } else {
        Array.from(document.getElementsByClassName("sizefit")).forEach(e => {
            e.classList.add("desktop");
            e.classList.remove("mobile");
        });
    }
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
        break;

        case 1:
            removeStyleClass(document.getElementById("stopwatch"),"display_none");
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
    fetch(url).then(()=>{pushDomChange();});
    measureEvent("TOGGLE_TIMER");
}

function stopwatchStart(){
    let url = './api/timer.php?t=' + t + '&action=start';
    fetch(url).then(()=>{pushDomChange();});
}

function stopwatchPause(){
    let url = './api/timer.php?t=' + t + '&action=pause';
    fetch(url).then(()=>{pushDomChange();});
}

function stopwatchReset(){
    let url = './api/timer.php?t=' + t + '&action=reset';
    fetch(url).then(()=>{pushDomChange();});
}


function updateOrderByConfig(resultsOrder) {
    let dropDown = document.getElementById("cet_order_by");
    let order = resultsOrder;

    if (resultsOrder.includes('CHOOSE')) {
        order = 'CHOOSE';
    }

    if (dropDown.value !== resultsOrder ) {
        dropDown.value = order;
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
        cardElement.classList.add("sizefit");
        cardElement.alt = card.description;
        ctl.appendChild(cardElement);

        let thumbElement = document.createElement("img");
        thumbElement.id = "_" + card.card_key;
        thumbElement.src = "src/c_" + card.card_key + ".png";
        thumbElement.setAttribute("data-card_key", card.card_key);
        thumbElement.src = "src/c_" + card.card_key + ".png";
        thumbElement.classList.add("topnav");
        thumbElement.classList.add("cs_c");
        thumbElement.classList.add("sizefit");
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

function toggleOrderBy() {
    let url = './api/update_results_order.php?t='+t+'&results_order=';
    if (gResultOder === 'CHOOSE:SEQUENCE') {
        url += 'CHOOSE:NAME';
        fetch(url).then(()=>{pushDomChange();});
    } else if (gResultOder === 'CHOOSE:NAME') {
        url += 'CHOOSE:SEQUENCE';
        fetch(url).then(()=>{pushDomChange();});
    }
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
    adaptToDevice();
    updatePlayersCards(gLastJson.players, false);
    showCardUsage(gLastJson.players, gLastJson.all_players_ready, gLastJson.show_avg);
}

function initDisplayHandling() {
    adaptToDevice();
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