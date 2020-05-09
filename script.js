var sid = localStorage.getItem('SID');
if (sid === null) {
    var uid = (Date.now().toString(36) + Math.random().toString(36).substr(2, 8)).toUpperCase();
    localStorage.setItem('SID', uid);
}

function nameChanged(e) {
    fetch('./name.php?id=' + localStorage.getItem('SID') + '&name=' + e.value + '&t=' + document.getElementById("t").value);
    nameUpdate(e);
}

function newRound() {
    fetch('./newround.php?t=' + document.getElementById("t").value);
    document.getElementById('newroundbtn').style.display = 'none';
}

function nameUpdate(e) {
    if (e.value === null || e.value === '') {
        document.getElementById("ctl").style.display = 'none';
        e.focus();
    }
    else {
        document.getElementById("ctl").style.display = 'block';
        document.getElementById('cardbox').focus();
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
    fetch('./delete.php?mkey=' + mkey + '&t=' + document.getElementById("t").value);
}

function updateSelectedCard(currKey) {
    var e = document.getElementsByClassName('ctl');
    for (var i = 0; i < e.length; i++) {
        if (e[i].id === currKey) {
            e[i].classList.add('selected');
        }
        else {
            e[i].classList.remove('selected');
        }
    }
}

function setCard(e) {
    if (e.classList.contains('selected')) {
        var all_players_ready = localStorage.getItem('all_players_ready');
        if (all_players_ready === 'false') {
            fetch('./setcard.php?id=' + localStorage.getItem('SID') + '&cardkey=' + '&t=' + document.getElementById("t").value);
            e.classList.remove('ctl_hover');
            e.classList.remove('selected');
        }
    }
    else
        fetch('./setcard.php?id=' + localStorage.getItem('SID') + '&cardkey=' + e.id + '&t=' + document.getElementById("t").value);
    updateSelectedCard(e.id);
}

function setCardHover(e) {
    e.classList.add('ctl_hover');
}

function toggleCard(cardId, flag) {
    var e = document.getElementById(cardId);
    var e_conf = document.getElementById('_'+cardId);
    if (flag === '1') {
        e.classList.add('on');
        e.classList.remove('off');
        e_conf.classList.add('cs_card_on');
    }
    else {
        e.classList.remove('on');
        e.classList.add('off');
        e_conf.classList.remove('cs_card_on');
    }
}

function setCardset(cardSet) {
    var str = parseInt(cardSet).toString(2).padStart(16, '0');

    localStorage.setItem('cardSet', str);
    toggleCard('zero001', str.charAt(0));
    toggleCard('1pnt501', str.charAt(1));
    toggleCard('one0001', str.charAt(2));
    toggleCard('two0001', str.charAt(3));
    toggleCard('three01', str.charAt(4));
    toggleCard('five001', str.charAt(5));
    toggleCard('eight01', str.charAt(6));
    toggleCard('thrtn01', str.charAt(7));
    toggleCard('twnty01', str.charAt(8));
    toggleCard('4ty0001', str.charAt(9));
    toggleCard('hundro1', str.charAt(10));
    toggleCard('infin01', str.charAt(11));
    toggleCard('green01', str.charAt(12));
    toggleCard('yellow1', str.charAt(13));
    toggleCard('red0001', str.charAt(14));
    toggleCard('break01', str.charAt(15));
}

function updateDao(isOnLoad) {
    const url = './dao.php?id=' + localStorage.getItem('SID') + '&t=' + document.getElementById("t").value;
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
    if (isOnLoad) {
        e.value = myJson.name;
        nameUpdate(e);
    }
    else if (e !== document.activeElement && e.value !== myJson.name) {
        e.value = myJson.name;
        nameUpdate(e);
    }

    /* Cardset einstellen */
    setCardset(myJson.cardset);

    e = document.getElementById("cardbox");

    let needsUpdate = false;

    if (e.childElementCount === myJson.players.length) {
        for (let i = 0; i < e.childElementCount; i++) {
            if (e.children[0].children[0].getAttribute('src') !== 'src/c_' + myJson.players[i].display_card_key + '.png') needsUpdate = true;
            if (e.children[0].children[1].innerHTML !== myJson.players[i].name) needsUpdate = true;
            if (e.children[0].children[2].getAttribute('onclick') !== 'deletePlayer(' + myJson.players[i].mkey + ')') needsUpdate = true;
        }
    }
    else needsUpdate = true;


    if (needsUpdate) {

        let htmlStr='';



        myJson.players.forEach(player=>{
            htmlStr = htmlStr
                + '<div class="card">'
                + '<img class="background" src = "src/c_' + player.display_card_key +'.png" alt = "' + player.name + '" >'
                + '<span>' + player.name + '</span>'
                + '<img onclick="deletePlayer(' + player.mkey + ')" class="delete" src="src/delete.png" alt="Delete">'
                + '</div>';
        });

        e.innerHTML = htmlStr;
    }


    updateSelectedCard(myJson.selected_card_key);

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

/*
var myInterval = setInterval(function () {
    updateDao(false);
}, 500);
*/

function handleNewData(event) {
    let myJson = JSON.parse(event.data);
    updateDom(myJson, false);
}



function onVisibilityChange() {
    if (document.visibilityState == 'hidden') {
        evtSource.close();
    }
    else {
        evtSource = new EventSource(stream_url);
        evtSource.addEventListener("dao", handleNewData);
    }
}

const stream_url = './dao_stream.php?id=' + localStorage.getItem('SID') + '&t=' + document.getElementById("t").value;
let evtSource = new EventSource(stream_url);
evtSource.addEventListener("dao", handleNewData);
document.addEventListener("visibilitychange", onVisibilityChange);