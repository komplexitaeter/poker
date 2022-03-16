let sid = localStorage.getItem('SID');
let gColorMode = "dark";
let gDisplayType = null;

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

function nameUpdate(e, isOnLoad) {
    let ctl = document.getElementById("ctl");
    if (e.value === null || e.value === "") {
        toggleStyleClass(ctl, "hidden", "visible");
        if (isOnLoad) e.focus();
    }
    else {
        toggleStyleClass(ctl, "visible", "hidden");
        if (isOnLoad) document.getElementById('cbox').focus();
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
    if (e.classList.contains('selected')) {
        let all_players_ready = localStorage.getItem('all_players_ready');
        if (all_players_ready === 'false') {
            fetch('./api/setc.php?id=' + localStorage.getItem('SID') + '&cardkey=' + '&t=' + document.getElementById("t").value).then();
            e.classList.remove('ctl_hover');
            e.classList.remove('selected');
        }
    }
    else
        fetch('./api/setc.php?id=' + localStorage.getItem('SID') + '&cardkey=' + e.id + '&t=' + document.getElementById("t").value).then();
}

function setCHover(e) {
    e.classList.add('ctl_hover');
}

function toggleC(cardId, flag) {
    let e = document.getElementById(cardId);
    let e_conf = document.getElementById('_'+cardId);
    if (flag === '1') {
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
    let str = cSet.padEnd(25, '0');

    localStorage.setItem('cSet', str);
    toggleC('zero001', str.charAt(0));
    toggleC('1pnt501', str.charAt(1));
    toggleC('one0001', str.charAt(2));
    toggleC('two0001', str.charAt(3));
    toggleC('three01', str.charAt(4));
    toggleC('four001', str.charAt(5));
    toggleC('five001', str.charAt(6));
    toggleC('six0001', str.charAt(7));
    toggleC('seven01', str.charAt(8));
    toggleC('eight01', str.charAt(9));
    toggleC('thrtn01', str.charAt(10));
    toggleC('twnty01', str.charAt(11));
    toggleC('4ty0001', str.charAt(12));
    toggleC('hundro1', str.charAt(13));

    toggleC('infin01', str.charAt(14));

    toggleC('green01', str.charAt(15));
    toggleC('yellow1', str.charAt(16));
    toggleC('red0001', str.charAt(17));

    toggleC('satis01', str.charAt(18));
    toggleC('annoy01', str.charAt(19));
    toggleC('sad0001', str.charAt(20));
    toggleC('unint01', str.charAt(21));
    toggleC('angry01', str.charAt(22));
    toggleC('enthu01', str.charAt(23));

    toggleC('break01', str.charAt(24));
}

function updateDao(isOnLoad) {
    const url = './api/dao.php?id=' + localStorage.getItem('SID') + '&t=' + document.getElementById("t").value;
    //alert(url);
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
        nameUpdate(e, isOnLoad);
    }

    if (isOnLoad) {
        if (myJson.color_mode && myJson.color_mode.length > 0) {
            gColorMode = myJson.color_mode;
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

    if (isOnLoad) document.body.style.display = 'inherit';
}


function handleNewData() {
    updateDao(false);
}

function loadBoard() {
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