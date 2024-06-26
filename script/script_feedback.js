let gTopicChangePending = false;

function toggleTopnav(e) {
    if (!e.target.classList.contains('topnav')) {
        toggle_feedback_box(false);
        toggle_topic_box(false);
        toggle_cardset_box(false);
        toggle_info_box(false);
        toggle_user_settings_box(false);
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
            toggle_feedback_box(true);
            toggle_topic_box(false);
            toggle_cardset_box(false);
            toggle_info_box(false);
            toggle_user_settings_box(false);
            measureEvent("OPEN_FEEDBACK_BOX");
        }
        else {
            toggle_feedback_box(false);
            toggle_topic_box(false);
            toggle_cardset_box(false);
            toggle_info_box(false);
            toggle_user_settings_box(false);
        }
    }
    if (boxName === 'topic') {
        let e = document.getElementById('topic_box');
        if (e.style.display === '' || e.style.display === null || e.style.display === 'none') {
            toggle_feedback_box(false);
            toggle_topic_box(true);
            toggle_cardset_box(false);
            toggle_info_box(false);
            toggle_user_settings_box(false);
            measureEvent("OPEN_TOPIC_BOX");
        }
        else {
            toggle_feedback_box(false);
            toggle_topic_box(false);
            toggle_cardset_box(false);
            toggle_info_box(false);
            toggle_user_settings_box(false);
        }
    }
    if (boxName === 'cset') {
        let e = document.getElementById('cset_box');
        if (e.style.display === '' || e.style.display === null || e.style.display === 'none') {

            document.getElementById('cet_team_name').value
                    = document.getElementById('team_name').innerText;
            document.getElementById('cet_change_name').disabled = true;

            toggle_feedback_box(false);
            toggle_topic_box(false);
            toggle_cardset_box(true);
            toggle_info_box(false);
            toggle_user_settings_box(false);
            measureEvent("OPEN_SETUP_BOX");
        }
        else {
            toggle_feedback_box(false);
            toggle_topic_box(false);
            toggle_cardset_box(false)
            toggle_info_box(false);
            toggle_user_settings_box(false);
        }
    }
    if (boxName === 'info') {
        let e = document.getElementById('info_box');
        if (e.style.display === '' || e.style.display === null || e.style.display === 'none') {
            toggle_feedback_box(false);
            toggle_topic_box(false);
            toggle_cardset_box(false);
            toggle_info_box(true);
            toggle_user_settings_box(false);
            measureEvent("OPEN_INFO_BOX");
        }
        else {
            toggle_feedback_box(false);
            toggle_topic_box(false);
            toggle_cardset_box(false);
            toggle_info_box(false);
            toggle_user_settings_box(false);
        }
    }
    if (boxName === 'user_settings') {
        let e = document.getElementById('user_settings_box');
        if (e.style.display === '' || e.style.display === null || e.style.display === 'none') {

            document.getElementById('cet_usr_name').value = gUserName;
            document.getElementById('cet_change_user').disabled = true;

            toggle_feedback_box(false);
            toggle_topic_box(false);
            toggle_cardset_box(false);
            toggle_info_box(false);
            toggle_user_settings_box(true);
            measureEvent("OPEN_USER_SETTINGS_BOX");
        }
        else {
            toggle_feedback_box(false);
            toggle_topic_box(false);
            toggle_cardset_box(false);
            toggle_info_box(false);
            toggle_user_settings_box(false);
        }
    }

}

function updateJediBtn() {
    let jediBtn = document.getElementById("cet_dark_side");
    if (gLastJson.show_avg === 1) {
        jediBtn.value = "Hide average indicator";
        jediBtn.setAttribute("data-state", "1");
        jediBtn.classList.remove("locked");
    } else {
        jediBtn.value = "Show average (join the dark side)";
        jediBtn.setAttribute("data-state", "0");
        jediBtn.classList.add("locked");
    }
}

function pushJediBtn() {
    let jediBtn = document.getElementById("cet_dark_side");
    let state = jediBtn.getAttribute("data-state");
    if (state === "0") {
        let url = './api/update_show_avg.php?id=' + localStorage.getItem('SID') + '&show_avg=1&t=' + t;
        fetch(url).then(()=>{pushDomChange();});
    }
    if (state === "1") {
        let url = './api/update_show_avg.php?id=' + localStorage.getItem('SID') + '&show_avg=0&t=' + t;
        fetch(url).then(()=>{pushDomChange();});
    }
}

function toggle_feedback_box(setOn) {
    let e = document.getElementById('feedback_box');

    if (setOn) {
        e.style.display = 'block';
        document.getElementById('feedback_btn').classList.add('topnav_btn_on');
        document.getElementById('feedback_btn').src = 'src/feedback_on.svg'
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
        document.getElementById('feedback_btn').src = 'src/feedback.svg';
    }
}

function toggle_topic_box(setOn) {
    let e = document.getElementById('topic_box');

    if (setOn) {
        if (gTopicChangePending) {
            document.getElementById("topic_reset").disabled = false;
            document.getElementById("topic_save").disabled = false;
        } else {
            document.getElementById("topic_reset").disabled = true;
            document.getElementById("topic_save").disabled = true;
            document.getElementById("topic_txt").value = gTopic;
        }

        e.style.display = 'block';
        document.getElementById('topic_btn').classList.add('topnav_btn_on');
        document.getElementById('topic_btn').src = 'src/topic_on.svg'
        document.getElementById('topic_txt').select();
    }
    else {
        e.style.display = 'none';
        document.getElementById('topic_btn').classList.remove('topnav_btn_on');
        document.getElementById('topic_btn').src = 'src/topic.svg';
    }
}

function toggle_cardset_box(setOn) {
    let e = document.getElementById('cset_box');
    if (e !== null) {
        if (setOn) {
            e.style.display = 'block';
            document.getElementById('cset_btn').classList.add('topnav_btn_on');
            document.getElementById('cset_btn').src = 'src/cset_on.svg';
        }
        else {
            e.style.display = 'none';
            document.getElementById('cset_btn').classList.remove('topnav_btn_on');
            document.getElementById('cset_btn').src = 'src/cset.svg';
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

function toggle_user_settings_box(setOn) {
    let e = document.getElementById('user_settings_box');
    if (e !== null) {
        if (setOn) {
            e.style.display = 'block';
            document.getElementById('user_settings_btn').classList.add('topnav_btn_on');
            document.getElementById('user_settings_btn').src = 'src/user_settings_on.svg';
        }
        else {
            if (document.getElementById('user_settings_btn').classList.contains("topnav_btn_on")) {
                e.style.display = 'none';
                document.getElementById('user_settings_btn').classList.remove('topnav_btn_on');
                document.getElementById('user_settings_btn').src = 'src/user_settings_off.svg';
            }
        }
    }
}

function toggleSurvey(forceSurvey){

    let survey = document.getElementById('survey-content');
    let surveyArrow = document.getElementById('survey-arrow');
    let surveyDisplayStatus;
    if(!forceSurvey){
        surveyDisplayStatus = survey.getAttribute('data-state');
    }
    else{
        if(gSurvey === "LOUD") {
            surveyDisplayStatus = "closed";
        } else return;
    }

    switch(surveyDisplayStatus){
        case "closed":
            generateSurveyContents();
            toggleStyleClass(survey, 'survey-open', 'survey-closed');
            toggleStyleClass(surveyArrow, 'down', 'up');
            survey.setAttribute('data-state', "open");
            break;

        default:
            let url = './api/update_user.php?id=' + localStorage.getItem('SID') + '&survey_skipped=1';
            toggleStyleClass(survey, 'survey-closed', 'survey-open');
            toggleStyleClass(surveyArrow, 'up', 'down');
            survey.setAttribute('data-state', "closed");
            fetch(url).then(()=>{
                setTimeout(()=>{updateDao(false)}, 100);
            });
            break;

    }
}

function generateSurveyContents(){

    let url = './api/get_survey.php?id=' + localStorage.getItem('SID');
    let htmlStr = '';
    fetch(url)
        .then((response) => {
            return response.json();
        })
        .then((myJson) => {

            htmlStr += '<div id="survey_intro">' + myJson.survey_intro+ '</div>';

            if(gSurvey === "LOUD" || gSurvey === "SILENT") {
                htmlStr += '<div id="vote_options">';
                myJson.vote_options.forEach(vote_option => {
                    htmlStr += '<button id="vote_option_' + vote_option.id + '" value="' + vote_option.id + '" class="vote_option" onclick="vote('+vote_option.id+')">' + vote_option.text + '</button>';
                });
                htmlStr += '</div>';
            }
            if (gSurvey === "VOTED") {
                htmlStr += '<div id="vote_results">';

                myJson.vote_options.forEach(vote_option => {
                    htmlStr += '<div class="vote_results_bar">' +
                        '<span class="vote_results_bar_value" id="vote_option_results_' + vote_option.id + '" style="width:0;background:transparent;">' + vote_option.text + ' (' + vote_option.votes_percentage + '%)</span></div>';

                });
                htmlStr += '</div>';
            }

            htmlStr+= '<div id="vote_count">'+myJson.votes_count+' votes</div>';
            document.getElementById("survey-content").innerHTML = htmlStr;

            if(gSurvey === "VOTED") {
                let interval = 25;
                let needsFilling = true;
                let wasFilled = false;
                let fillBars = document.getElementsByClassName("vote_results_bar_value");
                setTimeout(function () {
                    fillResultsBars(myJson, needsFilling, wasFilled, fillBars, interval);
                }, 10);
            }
        });
}

function fillResultsBars(myJson, needsFilling, wasFilled, fillBars, interval){

    myJson.vote_options.forEach(vote_option => {
        let currentWidth = parseInt(fillBars[vote_option.id - 1].style.width, 10);
        if (currentWidth < vote_option.votes_percentage) {
            fillBars[vote_option.id - 1].style.width = currentWidth + 1 + '%';
            wasFilled = true;
        }

        needsFilling = wasFilled === true;

        if(currentWidth === 0){
            fillBars[vote_option.id - 1].style.background = "transparent";
        }
        else{fillBars[vote_option.id - 1].style.background = "";}
    });

    if(needsFilling === true) {
        setTimeout(function() {
            fillResultsBars(myJson, needsFilling, false, fillBars, interval);
        }, interval);
    }
}

function vote(option_id){
    let url = './api/update_user.php?id=' + localStorage.getItem('SID') + '&survey_vote='+option_id;
    fetch(url).then( () => {
        gSurvey = "VOTED";
        generateSurveyContents();
    });

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

function topicChanged() {
    gTopicChangePending = true;
    document.getElementById("topic_reset").disabled = false;
    document.getElementById("topic_save").disabled = false;
}

function reset_topic(){
    gTopicChangePending = false;
    document.getElementById("topic_reset").disabled = true;
    document.getElementById("topic_save").disabled = true;
    document.getElementById("topic_txt").value = gTopic;
}

function save_topic(){
    gTopicChangePending = false;

    let topic = document.getElementById('topic_txt').value;

    const url = './api/update_topic.php?t='+t;
    let httpRequest = new XMLHttpRequest();

    httpRequest.open("POST", url, true);
    httpRequest.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
    httpRequest.send(
        "topic=" + topic
    );

    pushDomChange();
    toggle_topic_box();

    measureEvent("TOPIC_SAVED");
}


function setCharAt(str, index, chr) {
    return str.slice(0, index) + chr + str.slice(index + 1);
}

function toggleCSet(e) {
    let str = localStorage.getItem('cSet');
    let cardIdx = gCardsConfig.find(card => card.card_key === e.target.getAttribute("data-card_key")).index;

    if (str.charAt(cardIdx) === '1') {
        str = setCharAt(str, cardIdx, '0');
    }
    else {
        str = setCharAt(str, cardIdx, '1');
    }

    for (let i=gCardsConfig.length - str.length; i>0 ; i--) str = str + "0";
    updateCardset(str);

}

function updateCardset(cardSetDec) {
    let url = './api/update_cardset.php?cardset_flags=' + cardSetDec + '&t=' + t;
    fetch(url).then(()=>{pushDomChange();});
}

function preSet() {
    let preSetElement = document.getElementById("cet_pre");

    if  (preSetElement.value !== "0") {

        let str = "";
        let indexList = gCardsPresets.find(preSet => preSet.id.toString() === preSetElement.value).index_list;
        let cardsConfig = gCardsConfig;
        cardsConfig.sort((a,b) => a.index - b.index);

        cardsConfig.forEach(card => {
            let s;
            if (card.flow_control) {
                if (card.index + 1 <= localStorage.getItem('cSet').length) {
                    s = localStorage.getItem('cSet').charAt(card.index);
                } else {
                    s = "0";
                }
            } else {
                if (indexList.includes(card.index)) {
                    s = "1";
                } else {
                    s = "0";
                }
            }
            str = str + s;
        });

        updateCardset(str);
        preSetElement.value = "0";
    }
}

function changeSortOrder() {
    let e = document.getElementById("cet_order_by");
    const url = './api/update_results_order.php?t='+t+'&results_order='+e.value;
    let httpRequest = new XMLHttpRequest();
    httpRequest.open("GET", url, false);
    httpRequest.send();
    pushDomChange();
}

function changeAnonymity() {
    let e = document.getElementById("cet_anonymous");
    const url = './api/update_team.php?t='+t+'&anonymous_request_toggle='+e.value;
    let httpRequest = new XMLHttpRequest();
    httpRequest.open("GET", url, false);
    httpRequest.send();
    pushDomChange();
}

function onChangeTeamNameInput() {
    document.getElementById('cet_change_name').disabled = document.getElementById('cet_team_name').value
        === document.getElementById('team_name').innerText
        || document.getElementById('cet_team_name').value.length === 0;
}

function onChangeUserNameInput() {
    document.getElementById('cet_change_user').disabled = document.getElementById('cet_usr_name').value
        === gUserName
        || document.getElementById('cet_usr_name').value.length === 0;
}

function updateTeamName() {
    let teamInput =  document.getElementById("cet_team_name");
    teamInput.value = teamInput.value.trim();
    document.getElementById('cet_change_name').disabled = true;

    let url = './api/update_team.php?name=' + teamInput.value + '&t=' + t;
    fetch(url).then(()=>{pushDomChange();});
}

function updateUserName() {
    let userInput =  document.getElementById("cet_usr_name");
    userInput.value = userInput.value.trim();
    document.getElementById('cet_change_user').disabled = true;

    let url = './api/name.php?name=' + userInput.value + '&t=' + t +'&id='+sid + '&type=' + gLastJson.player_type;
    fetch(url).then(()=>{pushDomChange();});
}

function toggleUserType() {
    let playerType = 'PLAYER';
    if (gLastJson.player_type === 'PLAYER') playerType = 'OBSERVER';

    let url = './api/name.php?name=' + gUserName + '&t=' + t +'&id='+sid + '&type=' + playerType;
    fetch(url).then(()=>{pushDomChange();});
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


