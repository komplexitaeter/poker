let sid = localStorage.getItem('SID');
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
    document.getElementById('newroundbtn').style.display = 'none';
}

function nameUpdate(e, isOnLoad) {
    if (e.value === null || e.value === "") {
        document.getElementById("ctl").style.display = 'none';
        if (isOnLoad) e.focus();
    }
    else {
        document.getElementById("ctl").style.display = 'block';
        if (isOnLoad) document.getElementById('cbox').focus();
    }
}

function controlsDsp(e) {
    if (e.name !== null && e.name !== '') {
        document.getElementById("ctl").style.display = 'block';
    }
    else {
        document.getElementById("ctl").style.display = 'none';
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
    let str = parseInt(cSet).toString(2).padStart(19, '0');

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
    toggleC('break01', str.charAt(18));
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
        e.value =         e.value = unescape(myJson.name);
        nameUpdate(e, isOnLoad);
    }

    setCSet(myJson.cardset);

    e = document.getElementById("cbox");

    let needsUpdate = false;

    if (e.childElementCount === myJson.players.length) {
        for (let i = 0; i < e.childElementCount; i++) {
            if (e.children[i].children[0].getAttribute('src') !== 'src/c_' + myJson.players[i].display_card_key + '.png') needsUpdate = true;
            if (e.children[i].children[1].innerHTML !== myJson.players[i].name) needsUpdate = true;
            if (e.children[i].children[2].getAttribute('onclick') !== 'deletePlayer(' + myJson.players[i].mkey + ')') needsUpdate = true;
        }
    }
    else needsUpdate = true;


    if (needsUpdate) {
        let htmlStr='';

        myJson.players.forEach(player=>{
            htmlStr = htmlStr
                + '<div class="c">'
                + '<img class="background" src = "src/c_' + player.display_card_key +'.png" alt = "' + player.name + '" >'
                + '<span>' + player.name + '</span>'
                + '<img onclick="deletePlayer(' + player.mkey + ')" class="delete" src="./src/delete.png" alt="Delete">'
                + '</div>';
        });

        e.innerHTML = htmlStr;
    }


    updateSelectedC(myJson.selected_card_key);

    if (myJson.one_ore_more_player_ready === 'true') {
        document.getElementById('newroundbtn').style.display = 'unset';
        if (myJson.all_players_ready === 'true')
            document.getElementById('newroundbtn').value = 'New Round';
        else
            document.getElementById('newroundbtn').value = 'Cancel Round';
    }
    else
        document.getElementById('newroundbtn').style.display = 'none';


    controlsDsp(myJson);

}


function handleNewData() {
    updateDao(false);
}

let baseUrl = 'api/dao';
let params = {
    "id" :  localStorage.getItem('SID'),
    "t" : document.getElementById("t").value,
}
initializeConnection(baseUrl, params, handleNewData);