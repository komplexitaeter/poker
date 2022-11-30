let sid = localStorage.getItem('SID');
let gColorMode = "dark";
let gDisplayType = null;
let gTopic = null;
let gCardsConfig = null;
let gCardsPresets = null;
let gOnLoadFocus = null;
let gSurvey = null;


String.prototype.hashCode = function(){
    let hash = 0;
    if (this.length == 0) return hash;
    for (i = 0; i < this.length; i++) {
        char = this.charCodeAt(i);
        hash = ((hash<<5)-hash)+char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
}

function getBrowserWidth(){

    if(window.innerWidth < 768){
        // Extra Small Device
        gDisplayType = "xs";
    } else if(window.innerWidth < 991){
        // Small Device
        gDisplayType = "sm";
    } else if(window.innerWidth < 1199){
        // Medium Device
        gDisplayType = "md";
    } else {
        // Large Device
        gDisplayType = "lg";
    }

    return gDisplayType;
}

if (sid === null) {
    let uid = (Date.now().toString(36) + Math.random().toString(36).substr(2, 8)).toUpperCase();
    localStorage.setItem('SID', uid);
}

function nameChanged(e) {
    fetch('./api/name.php?id=' + localStorage.getItem('SID') + '&name=' + e.value + '&t=' + document.getElementById("t").value).then();
    document.getElementById('cbox').focus();
}

function newRound() {
    fetch('./api/newround.php?t=' + document.getElementById("t").value).then();
    toggleStyleClass(document.getElementById('newroundbtn'), "display_none", "display_unset");
    toggleMobileMenu("closed");
}

function nameUpdate(e) {
    let ctl = document.getElementById("ctl");
    if (e.value === null || e.value === "") {
        toggleStyleClass(ctl, "hidden", "visible");
        gOnLoadFocus = e;
    }
    else {
        toggleStyleClass(ctl, "visible", "hidden");
        gOnLoadFocus = document.getElementById('cbox');
    }
}

function controlsDsp(e) {
    let ctl = document.getElementById("ctl");
    if (e.name !== null && e.name !== '') {
        toggleStyleClass(ctl, "visible", "hidden");
    }
    else {
        toggleStyleClass(ctl, "hidden", "visible");
    }
}

function deletePlayer(mkey) {
    fetch('./api/delete.php?mkey=' + mkey + '&t=' + document.getElementById("t").value).then();
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
    if (e.target.classList.contains('selected')) {
        let all_players_ready = localStorage.getItem('all_players_ready');
        if (all_players_ready === 'false') {
            fetch('./api/setc.php?id=' + localStorage.getItem('SID') + '&cardkey=' + '&t=' + document.getElementById("t").value).then();
            e.target.classList.remove('ctl_hover');
            e.target.classList.remove('selected');
        }
    }
    else
        fetch('./api/setc.php?id=' + localStorage.getItem('SID') + '&cardkey=' + e.target.id + '&t=' + document.getElementById("t").value).then();
}

function setCHover(e) {
    e.target.classList.add('ctl_hover');
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
    const url = './api/dao.php?id=' + localStorage.getItem('SID') + '&t=' + document.getElementById("t").value;

    fetch(url)
        .then((response) => {
            return response.json();
        })
        .then((myJson) => {

            updateDom(myJson, isOnLoad)

        });
}

function updateDom(myJson, isOnLoad) {
    localStorage.setItem('all_players_ready', myJson.all_players_ready);

    let e = document.getElementById('nameinput');
    if (isOnLoad ||
        (e !== document.activeElement && e.value !== myJson.name)) {
        e.value = e.value = unescape(myJson.name);
        nameUpdate(e);
        const delayMinutes = Math.random() * 10;
        if(myJson.survey == "LOUD") {
            setTimeout(function () {
                toggleSurvey(true);
            }, Math.round(1000 * 60 * delayMinutes));
        }
    }

    let topic = document.getElementById('topic');
    let topicHash = myJson.topic.hashCode();
    if (topic.getAttribute("data-hash") !== topicHash) {

        topic.setAttribute("data-hash", topicHash);
        gTopic = myJson.topic;
        gSurvey = myJson.survey;

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

        if (topicHash == 0) {
            topic.classList.add("display_none");
        } else {
            topic.classList.remove("display_none");
        }

    }

    if (isOnLoad) {

        if (myJson.color_mode && myJson.color_mode.length > 0) {
            gColorMode = myJson.color_mode;
        }

        if(gSurvey != "NO"){
            document.getElementById("survey-container").style.visibility="visible";
        }

        setColor();

        document.title += " " + myJson.team_name;
        document.getElementById("team_name").innerHTML = myJson.team_name;

    }

    setCSet(myJson.cardset_flags);

    e = document.getElementById("cbox");

    let needsUpdate = false;

    if (e.childElementCount === myJson.players.length) {
        for (let i = 0; i < e.childElementCount; i++) {
            if (e.children[i].children[0].getAttribute('src') !== 'src/c_' + myJson.players[i].display_card_key + '.png') needsUpdate = true;
            if (e.children[i].children[1].innerHTML !== myJson.players[i].name) needsUpdate = true;
            if (e.children[i].children[2].getAttribute('onclick') !== 'deletePlayer(' + myJson.players[i].mkey + ')') needsUpdate = true;
        }
    } else needsUpdate = true;


    if (needsUpdate) {
        let htmlStr = '';
        let currentColorClass;
        if (gColorMode === "dark") {
            currentColorClass = "dark"
        } else {
            currentColorClass = "light"
        }

        myJson.players.forEach(player => {
            htmlStr = htmlStr
                + '<div class="c sizefit">'
                + '<img class="background sizefit switchable '+currentColorClass+'" src = "src/c_' + player.display_card_key + '.png" alt = "' + player.name + '" >'
                + '<span class="sizefit">' + player.name + '</span>'
                + '<img onclick="deletePlayer(' + player.mkey + ')" class="delete sizefit" src="./src/delete.png" alt="Delete">'
                + '</div>';
        });

        e.innerHTML = htmlStr;
        adaptToDevice();

    }


    updateSelectedC(myJson.selected_card_key);

    let newroundbtn = document.getElementById('newroundbtn');

    if (myJson.one_ore_more_player_ready === 'true') {
        toggleStyleClass(newroundbtn, "display_unset", "display_none");
        if (myJson.all_players_ready === 'true') {
            document.getElementById('newroundbtn').value = 'New Round';
        } else {
            document.getElementById('newroundbtn').value = 'Cancel Round';
        }
    }
    else {
    toggleStyleClass(newroundbtn, "display_none", "display_unset");
    }

    controlsDsp(myJson);
    updateStopwatch(myJson.timer_status, myJson.timer_time, myJson.timer_visibility);
    updateOrderByConfig(myJson.results_order);

    if (isOnLoad) {
        document.body.style.display = 'inherit';

        if (gOnLoadFocus) {
            gOnLoadFocus.focus();
            gOnLoadFocus = null;
        }
    }


}


function handleNewData() {
    updateDao(false);
}

function loadBoard() {
    loadCardConfig();

    let baseUrl = 'api/dao';
    let params = {
        "id": localStorage.getItem('SID'),
        "t": document.getElementById("t").value,
    }

    updateDao(true);

    initializeConnection(baseUrl, params, handleNewData);
    initDisplayHandling();

    measureEvent("BOARD_ON_LOAD");
}

function loadInit() {
    initDisplayHandling();
    document.body.style.display = "unset";
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
    Array.from(document.getElementsByClassName("switchable")).forEach(element => {
        if (gColorMode === "dark") {
            element.classList.add("dark");
            element.classList.remove("light");
            toggleImg.src = "./src/toggle_light.png";
        } else {
            element.classList.add("light");
            element.classList.remove("dark");
            toggleImg.src = "./src/toggle_dark.png";
        }
    });

    if (gColorMode === "dark") {
        document.body.style.backgroundColor = "black";
    } else {
    document.body.style.backgroundColor = "white";
    }

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
    let dummy = document.createElement('input'),
        text = window.location.href;
    document.body.appendChild(dummy);
    dummy.value = text;
    dummy.select();
    document.execCommand('copy');
    document.body.removeChild(dummy);
    setTimeout(function () {
        document.getElementById("copy_link_btn").classList.remove("react");
    }, 10);
    setTimeout(function () {
        document.getElementById("copy_link_btn").classList.add("react");
    }, 75);

}

function adaptToDevice(){
    /*TODO: find out why this line registers twice in log when switching viewport size*/

    let size = getBrowserWidth();
    if (size === "xs" || size === "sm") {
        Array.from(document.getElementsByClassName("sizefit")).forEach(e => {
            e.classList.add("mobile");
            e.classList.remove("desktop");
            //measureEvent("LOAD_MOBILE");
        });
    } else {
        Array.from(document.getElementsByClassName("sizefit")).forEach(e => {
            e.classList.add("desktop");
            e.classList.remove("mobile");
            //measureEvent("LOAD_DESKTOP");
        });
    }
}

function updateStopwatch(timer_status, timer_time, timer_visibility){

    timer_time = new Date(timer_time * 1000).toISOString().substr(11, 8);

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

    if(document.getElementById("stopwatch_timer").value != timer_time){
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
}

function switchStopwatchVisiblity(){
    fetch('./api/timer.php?t=' + document.getElementById("t").value + '&action=toggle_visibility');
    measureEvent("TOGGLE_TIMER");
}

function stopwatchStart(){
    fetch('./api/timer.php?t=' + document.getElementById("t").value + '&action=start');
}

function stopwatchPause(){
    fetch('./api/timer.php?t=' + document.getElementById("t").value + '&action=pause');
}

function stopwatchReset(){
    fetch('./api/timer.php?t=' + document.getElementById("t").value + '&action=reset');
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
        cardElement.classList.add("ctl_hover");
        cardElement.classList.add("sizefit");
        cardElement.alt = card.description;
        cardElement.addEventListener("click", setC);
        cardElement.addEventListener("mouseleave", setCHover);
        ctl.appendChild(cardElement);

        let thumbElement = document.createElement("img");
        thumbElement.id = "_" + card.card_key;
        thumbElement.src = "src/c_" + card.card_key + ".png";
        thumbElement.setAttribute("data-card_key", card.card_key);
        thumbElement.src = "src/c_" + card.card_key + ".png";
        thumbElement.classList.add("topnav");
        thumbElement.classList.add("cs_c");
        thumbElement.classList.add("sizefit");
        thumbElement.classList.add("switchable");
        thumbElement.alt = card.description;
        thumbElement.addEventListener("click", toggleCSet);
        cardsThumbs.appendChild(thumbElement);
    });

    let cetPre = document.getElementById("cet_pre");

    gCardsPresets.forEach(preSet => {
        let option = document.createElement("option");
        option.value = preSet.id;
        option.textContent = preSet.description;
        cetPre.appendChild(option);
    });
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
    if (xmlHttp.status==200 && xmlHttp.readyState == 4 )
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

function initDisplayHandling() {
    adaptToDevice();
    window.addEventListener('resize', adaptToDevice);
}

/*** ******** ****/