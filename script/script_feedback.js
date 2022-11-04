function toggleTopnav(e) {
    if (!e.target.classList.contains('topnav')) {
        toggle_feedback_box(false);
        toggle_topic_box(false);
        toggle_cardset_box(false);
        toggle_info_box(false);
    }
}

function feedback_star_blink() {
    const offset = 300;
    setTimeout(function () { document.getElementById('fb_star_1').classList.add('blink') }, offset);
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
        let e = document.getElementById('feedback_box');
        if (e.style.display === '' || e.style.display === null || e.style.display === 'none') {
            /*toggle_feedback_box(true);
            toggle_topic_box(false);
            toggle_cardset_box(false);
            toggle_info_box(false);*/
            window.open("https://padlet.com/komplexitaeter/poker_feedback", '_blank');
            measureEvent("OPEN_FEEDBACK_BOX");
        }
        else {
            toggle_feedback_box(false);
            toggle_topic_box(false);
            toggle_cardset_box(false);
            toggle_info_box(false);
        }
    }
    if (boxName === 'topic') {
        let e = document.getElementById('topic_box');
        if (e.style.display === '' || e.style.display === null || e.style.display === 'none') {
            toggle_feedback_box(false);
            toggle_topic_box(true);
            toggle_cardset_box(false);
            toggle_info_box(false);
            measureEvent("OPEN_TOPIC_BOX");
        }
        else {
            toggle_feedback_box(false);
            toggle_topic_box(false);
            toggle_cardset_box(false);
            toggle_info_box(false);
        }
    }
    if (boxName === 'cset') {
        let e = document.getElementById('cset_box');
        if (e.style.display === '' || e.style.display === null || e.style.display === 'none') {
            toggle_feedback_box(false);
            toggle_topic_box(false);
            toggle_cardset_box(true);
            toggle_info_box(false);
            measureEvent("OPEN_SETUP_BOX");
        }
        else {
            toggle_feedback_box(false);
            toggle_topic_box(false);
            toggle_cardset_box(false)
            toggle_info_box(false);
        }
    }
    if (boxName === 'info') {
        let e = document.getElementById('info_box');
        if (e.style.display === '' || e.style.display === null || e.style.display === 'none') {
            toggle_feedback_box(false);
            toggle_topic_box(false);
            toggle_cardset_box(false);
            toggle_info_box(true);
            measureEvent("OPEN_INFO_BOX");
        }
        else {
            toggle_feedback_box(false);
            toggle_topic_box(false);
            toggle_cardset_box(false);
            toggle_info_box(false);
        }
    }

}

function toggle_feedback_box(setOn) {
    let e = document.getElementById('feedback_box');

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
        document.getElementById('feedback_btn').src = 'src/feedback.png';
    }
}

function toggle_topic_box(setOn) {
    let e = document.getElementById('topic_box');

    if (setOn) {
        e.style.display = 'block';
        document.getElementById('topic_btn').classList.add('topnav_btn_on');
        document.getElementById('topic_btn').src = 'src/topic_on.png'
        document.getElementById('topic_txt').focus();
    }
    else {
        e.style.display = 'none';
        document.getElementById('topic_btn').classList.remove('topnav_btn_on');
        document.getElementById('topic_btn').src = 'src/topic.png';
    }
}

function toggle_cardset_box(setOn) {
    let e = document.getElementById('cset_box');
    if (e !== null) {
        if (setOn) {
            e.style.display = 'block';
            document.getElementById('cset_btn').classList.add('topnav_btn_on');
            document.getElementById('cset_btn').src = 'src/cset_on.png';
        }
        else {
            e.style.display = 'none';
            document.getElementById('cset_btn').classList.remove('topnav_btn_on');
            document.getElementById('cset_btn').src = 'src/cset.png';
        }
    }
}

function toggle_info_box(setOn) {
    let e = document.getElementById('info_box');
    if (e !== null) {
        if (setOn) {
            e.style.display = 'block';
            document.getElementById('info_btn').classList.add('topnav_btn_on');
            document.getElementById('info_btn').src = 'src/info_on.png';
        }
        else {
            if (document.getElementById('info_btn').classList.contains("topnav_btn_on")) {
                e.style.display = 'none';
                document.getElementById('info_btn').classList.remove('topnav_btn_on');
                document.getElementById('info_btn').src = 'src/info.png';
            }
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
    document.getElementById('feedback_txt').focus();
}

function feedback_submit() {
    const s1 = 'src/star_on.png';
    let fb_text = document.getElementById('feedback_txt').value;
    let fb_star = 0;
    for (let i = 1; i <= 5; i++) {
        if (document.getElementById('fb_star_' + i).src.includes(s1)) {
            fb_star = i;
        }
        else break;
    }
    toggle_feedback_box();
    feedback_rate(0, false);
    document.getElementById('feedback_txt').value = '';

    fetch('./api/feedback.php?id=' + localStorage.getItem('SID')
        + '&stars=' + fb_star
        + '&text=' + fb_text
    ).then();
}

function reset_topic(){
    toggle_topic_box();
}

function save_topic(){
    let t = document.getElementById("t").value;
    let parameters = {
        topic: document.getElementById('topic_txt').value,
    };

    let options = {
        method: 'POST',
        body: JSON.stringify(parameters)
    };

    console.log({parameters, options});
    fetch( './api/update_topic.php?t='+t, options );
    toggle_topic_box();
}


function setCharAt(str, index, chr) {
    return str.substr(0, index) + chr + str.substr(index + 1);
}

function toggleCSet(e, cardIdx) {
    let str = localStorage.getItem('cSet');
    if (str.charAt(cardIdx - 1) === '1') {
        str = setCharAt(str, cardIdx - 1, '0');
    }
    else {
        str = setCharAt(str, cardIdx - 1, '1');
    }

    updateCardset(str);

}

function updateCardset(cardSetDec) {
    fetch('./api/update_cardset.php?cardset_flags=' + cardSetDec + '&t=' + document.getElementById("t").value).then();
}

function preSet(e) {
    let str;
    switch (e.target.value) {
        case '1':
            str = '111110100111111000000000' + localStorage.getItem('cSet').charAt(24);
            break;
        case '2':
            str = '101110100111100000000000' + localStorage.getItem('cSet').charAt(24);
            break;
        case '3':
            str = '000000000000000111000000' + localStorage.getItem('cSet').charAt(24);
            break;
        case '4':
            str = '001111111000000000000000' + localStorage.getItem('cSet').charAt(24);
            break;
        case '5':
            str = '101111110000000000000000' + localStorage.getItem('cSet').charAt(24);
            break;
        case '6':
            str = '000000000000000000111111' + localStorage.getItem('cSet').charAt(24);
            break;
        default:
            str = '111110100111111000000000' + '1';
    }

    updateCardset(str);

    e.target.value = "0";
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
setTimeout(function () { feedback_bling() }, getRandom(60 * 1000, 4 * 60 * 1000));
