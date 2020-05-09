
function toggleTopnav(e) {
    if (!e.target.classList.contains('topnav')) {
        toggle_feedback_box(false);
        toggle_cardset_box(false);
    }
}

function feedback_star_blink() {
    const offset = 300;
    setTimeout(function () { document.getElementById('fb_star_1').classList.add('blink') }, offset + 0);
    setTimeout(function () { document.getElementById('fb_star_1').classList.remove('blink') }, offset + 400);
    setTimeout(function () { document.getElementById('fb_star_2').classList.add('blink') }, offset + 200);
    setTimeout(function () { document.getElementById('fb_star_2').classList.remove('blink') }, offset + 600);
    setTimeout(function () { document.getElementById('fb_star_3').classList.add('blink') }, offset + 400);
    setTimeout(function () { document.getElementById('fb_star_3').classList.remove('blink') }, offset + 800);
    setTimeout(function () { document.getElementById('fb_star_4').classList.add('blink') }, offset + 600);
    setTimeout(function () { document.getElementById('fb_star_4').classList.remove('blink') }, offset + 1000);
    setTimeout(function () { document.getElementById('fb_star_5').classList.add('blink') }, offset + 800);
    setTimeout(function () { document.getElementById('fb_star_5').classList.remove('blink') }, offset + 1200);
}

function toggle_box(boxName) {
    if (boxName === 'feedback') {
        var e = document.getElementById('feedback_box');
        if (e.style.display === '' || e.style.display === null || e.style.display === 'none') {
            toggle_feedback_box(true);
            toggle_cardset_box(false)
        }
        else {
            toggle_feedback_box(false);
            toggle_cardset_box(false)
        }
    }
    if (boxName === 'cardset') {
        var e = document.getElementById('cardset_box');
        if (e.style.display === '' || e.style.display === null || e.style.display === 'none') {
            toggle_feedback_box(false);
            toggle_cardset_box(true)
        }
        else {
            toggle_feedback_box(false);
            toggle_cardset_box(false)
        }
    }

}

function toggle_feedback_box(setOn) {
    var e = document.getElementById('feedback_box');

    if (setOn) {
        e.style.display = 'block';
        document.getElementById('feedback_btn').classList.add('topnav_btn_on');
        document.getElementById('feedback_btn').src = 'src/feedback_on.png'
        document.getElementById('feedback_txt').focus();
        feedback_star_blink();
    }
    else {
        e.style.display = 'none';
        document.getElementById('fb_star_1').classList.remove('blink');
        document.getElementById('fb_star_2').classList.remove('blink');
        document.getElementById('fb_star_3').classList.remove('blink');
        document.getElementById('fb_star_4').classList.remove('blink');
        document.getElementById('fb_star_5').classList.remove('blink');
        document.getElementById('feedback_btn').classList.remove('topnav_btn_on');
        document.getElementById('feedback_btn').src = 'src/feedback.png'
    }
}

function toggle_cardset_box(setOn) {
    var e = document.getElementById('cardset_box');
    if (e !== null) {
        if (setOn) {
            e.style.display = 'block';
            document.getElementById('cardset_btn').classList.add('topnav_btn_on');
            document.getElementById('cardset_btn').src = 'src/cardset_on.png'
        }
        else {
            e.style.display = 'none';
            document.getElementById('cardset_btn').classList.remove('topnav_btn_on');
            document.getElementById('cardset_btn').src = 'src/cardset.png'
        }
    }
}

function feedback_rate(val, db) {
    const s0 = 'src/star_off.png';
    const s1 = 'src/star_on.png';
    if (val>0 && document.getElementById('fb_star_' + val).src.includes(s1) && (val === 5 || document.getElementById('fb_star_' + (val+1)).src.includes(s0) )) val--;
    if (val >= 1) document.getElementById('fb_star_1').src = s1; else document.getElementById('fb_star_1').src = s0;
    if (val >= 2) document.getElementById('fb_star_2').src = s1; else document.getElementById('fb_star_2').src = s0; 
    if (val >= 3) document.getElementById('fb_star_3').src = s1; else document.getElementById('fb_star_3').src = s0; 
    if (val >= 4) document.getElementById('fb_star_4').src = s1; else document.getElementById('fb_star_4').src = s0; 
    if (val >= 5) document.getElementById('fb_star_5').src = s1; else document.getElementById('fb_star_5').src = s0;
    if (db) {

    }
}

function feedback_submit() {
    const s1 = 'src/star_on.png';
    var fb_text = document.getElementById('feedback_txt').value;
    var fb_star = 0;
    for (i = 1; i <= 5; i++) {
        if (document.getElementById('fb_star_' + i).src.includes(s1)) {
            fb_star = i;
        }
        else break;
    }
    toggle_feedback_box();
    feedback_rate(0, false);
    document.getElementById('feedback_txt').value = '';

    fetch('./feedback.php?id=' + localStorage.getItem('SID')
        + '&stars=' + fb_star
        + '&text=' + fb_text
    );
}

function setCharAt(str, index, chr) {
    return str.substr(0, index) + chr + str.substr(index + 1);
}

function toggleCardSet(e, cardIdx) {
    str = localStorage.getItem('cardSet');
    if (str.charAt(cardIdx - 1) === '1') {
        str = setCharAt(str, cardIdx-1, '0');
    }
    else {
        str = setCharAt(str, cardIdx - 1, '1');
    }

    updateCardset(parseInt(str, 2));

}

function updateCardset(cardSetDec) {
    fetch('./update_cardset.php?cardset=' + cardSetDec + '&t=' + document.getElementById("t").value);
}

function preSetDeck(e) {
    switch (e.value) {
        case '1':
            str = '111111111111000' + localStorage.getItem('cardSet').charAt(15);
            int = parseInt(str, 2);
            break;
        case '2':
            str = '101111111100000' + localStorage.getItem('cardSet').charAt(15);
            int = parseInt(str, 2);            break;
        case '3':
            str = '000000000000111' + localStorage.getItem('cardSet').charAt(15);
            int = parseInt(str, 2);
            break;
        default:
            int = getRandom(0, 65535 + 1);
    }

    updateCardset(int);

    os = e.options;
    os[0].selected = true;
}

/**
 * Returns a random number between min (inclusive) and max (exclusive)
 */
function getRandom(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min;
}

function feedback_bling() {
    setTimeout(function () { document.getElementById('feedback_btn').classList.add('topnav_btn_bling') }, 0);
    setTimeout(function () { document.getElementById('feedback_btn').classList.remove('topnav_btn_bling') }, 400);
    setTimeout(function () { feedback_bling() }, getRandom(2 * 60 * 1000, 8 * 60 * 1000));
}

document.addEventListener('click', toggleTopnav);
setTimeout(function () { feedback_bling() }, getRandom(1 * 60 * 1000, 4 * 60 * 1000));
