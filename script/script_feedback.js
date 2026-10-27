let gTopicChangePending = false;

/* B-51: the menu (#menu, a <dialog>, board.html and init.html). One section (section.menu_sec[data-sec])
 * is visible at a time. Large screens: a non-modal side panel (show()), it stays put and a click on the
 * table does not close it. Phones (breakpoint as in style.css): a modal bottom sheet (showModal()) that
 * starts at the index (#menu_btn) and has a back button. Openers carry data-open="<section>", the close
 * button data-close (one delegated click listener below).
 * Per section: the header button (aria-expanded), the field focused when the user opens it, analytics. */
const gMenuSections = {
    index:         {btn: 'menu_btn'},
    topic:         {btn: 'topic_btn',         event: 'OPEN_TOPIC_BOX',         focus: 'topic_txt'},
    cset:          {btn: 'cset_btn',          event: 'OPEN_SETUP_BOX',         focus: 'cet_pre'},
    user_settings: {btn: 'user_settings_btn', event: 'OPEN_USER_SETTINGS_BOX', focus: 'cet_usr_name'},
    feedback:      {btn: 'feedback_btn',      event: 'OPEN_FEEDBACK_BOX',      focus: 'feedback_txt'}
};
const gPhoneQuery = window.matchMedia('(max-width: 799.98px)');
let gMenuOpener = null; // gets the focus back when the menu closes

function getMenu() {
    return document.getElementById('menu');
}

/* the section shown in the open menu, or null when it is closed */
function openMenuSection() {
    let menu = getMenu();
    if (menu === null || !menu.open) return null;
    let sec = menu.querySelector('section.menu_sec:not([hidden])');
    return sec === null ? null : sec.getAttribute('data-sec');
}

/* fills the fields of a section with the current values when it is opened */
function prepareMenuSection(sec) {
    if (sec === 'cset') {
        showCsetTab('deck');
        document.getElementById('cet_team_name').value = document.getElementById('team_name').innerText;
        document.getElementById('cet_change_name').disabled = true;
    }
    if (sec === 'user_settings') {
        hideTeaser();
        document.getElementById('cet_usr_name').value = gUserName;
        document.getElementById('cet_change_user').disabled = true;
    }
    if (sec === 'topic') {
        document.getElementById('topic_reset').disabled = !gTopicChangePending;
        document.getElementById('topic_save').disabled = !gTopicChangePending;
        if (!gTopicChangePending) document.getElementById('topic_txt').value = gTopic;
    }
}

/* Board settings: tabs (Deck | Results | Team). The tab buttons carry role="tab" and data-tab, the
 * panels role="tabpanel" and data-tab as well; the selected tab has aria-selected="true" and is the
 * only one in the tab order, the other panels are hidden. focusTab: move the focus to the tab. */
function showCsetTab(name, focusTab = false) {
    let box = document.getElementById('cset_box');
    if (box === null) return;
    let tab = box.querySelector('[role="tab"][data-tab="' + name + '"]');
    if (tab === null) return;
    box.querySelectorAll('[role="tab"]').forEach(t => {
        let selected = t === tab;
        t.setAttribute('aria-selected', selected ? 'true' : 'false');
        t.tabIndex = selected ? 0 : -1;
    });
    box.querySelectorAll('[role="tabpanel"]').forEach(p => { p.hidden = p.getAttribute('data-tab') !== name; });
    if (focusTab) tab.focus();
}

/* aria-expanded of the openers outside the menu: the header button of the open section, the menu
 * button (phones) while the menu is open */
function updateMenuExpanded() {
    let sec = openMenuSection();
    document.querySelectorAll('[data-open][aria-expanded]').forEach(btn => {
        if (btn.closest('#menu') !== null) return;
        let expanded = sec !== null && (btn.id === 'menu_btn' || btn.getAttribute('data-open') === sec);
        btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    });
}

/* sec: index, topic, cset, user_settings, feedback; opener: the element that gets the focus back on
 * close (null: none). focusField: false when the board opens the menu by itself (needs_setup). */
function openMenu(sec, opener = null, focusField = true) {
    let menu = getMenu();
    if (menu === null) return;
    let section = menu.querySelector('section.menu_sec[data-sec="' + sec + '"]');
    if (section === null) return;
    let previousSec = openMenuSection();
    let previousFocus = document.activeElement;

    prepareMenuSection(sec);
    menu.querySelectorAll('section.menu_sec').forEach(s => { s.hidden = s !== section; });
    document.getElementById('menu_title').textContent = section.getAttribute('data-title');

    if (!menu.open) {
        gMenuOpener = opener;
        if (gPhoneQuery.matches) menu.showModal(); else menu.show();
    } else if (opener !== null && !menu.contains(opener)) {
        gMenuOpener = opener; // another header button while the panel is open
    }
    updateMenuExpanded();

    if (focusField) {
        let field = gMenuSections[sec].focus;
        if (field) {
            if (sec === 'topic') document.getElementById(field).select();
            else document.getElementById(field).focus();
        } else if (sec === 'index') {
            // back from a section: the focus on its entry, otherwise on the first entry
            let entry = previousSec !== null && menu.querySelector('#menu_index [data-open="' + previousSec + '"]');
            (entry || menu.querySelector('#menu_index [data-open]')).focus();
        }
    } else if (previousFocus !== null && previousFocus !== document.body && !menu.contains(previousFocus)) {
        previousFocus.focus({preventScroll: true}); // show() moves the focus into the dialog
    } else if (menu.contains(document.activeElement)) {
        document.activeElement.blur();
    }

    if (gMenuSections[sec].event) measureEvent(gMenuSections[sec].event);
}

/* restoreFocus: false when something else takes the focus (overlay) or the opener is gone */
function closeMenu(restoreFocus = true) {
    let menu = getMenu();
    if (menu === null || !menu.open) return;
    let toast = document.getElementById('toast');
    if (toast !== null && menu.contains(toast)) document.body.appendChild(toast);
    menu.close();
    updateMenuExpanded();
    if (restoreFocus && gMenuOpener !== null && gMenuOpener.isConnected) gMenuOpener.focus();
    gMenuOpener = null;
}

/* The breakpoint changes while the menu is open: the panel (show()) and the sheet (showModal()) are
 * the same dialog, so it is reopened in the other mode with the same section. Fields, the tab in
 * board settings and the focus stay (no prepareMenuSection()). The index exists on phones only:
 * an index open at the switch to the large layout closes the menu. */
function switchMenuLayout() {
    let menu = getMenu();
    let sec = openMenuSection();
    if (sec === null) return;
    if (sec === 'index' && !gPhoneQuery.matches) {
        closeMenu(false);
        return;
    }
    if (menu.matches(':modal') === gPhoneQuery.matches) return;

    let focused = menu.contains(document.activeElement) ? document.activeElement : null;
    let toast = document.getElementById('toast');
    if (toast !== null && menu.contains(toast)) document.body.appendChild(toast);
    let opener = gMenuOpener;
    menu.close();
    if (gPhoneQuery.matches) menu.showModal(); else menu.show();
    gMenuOpener = opener;
    if (focused !== null && focused.isConnected) focused.focus({preventScroll: true});
    else if (menu.contains(document.activeElement)) document.activeElement.blur();
    updateMenuExpanded();
}

function initMenu() {
    let menu = getMenu();
    if (menu === null) return;

    document.addEventListener('click', function (event) {
        let target = event.target;
        if (!(target instanceof Element)) return;

        let closer = target.closest('[data-close]');
        if (closer !== null && menu.contains(closer)) {
            closeMenu();
            return;
        }

        let opener = target.closest('[data-open]');
        if (opener !== null) {
            let sec = opener.getAttribute('data-open');
            // a header button of the open section closes the menu
            if (!menu.contains(opener) && opener.hasAttribute('aria-expanded') && openMenuSection() !== null
                && (opener.id === 'menu_btn' || openMenuSection() === sec)) {
                closeMenu();
            } else {
                openMenu(sec, opener);
            }
            return;
        }

        // phones: a tap on the backdrop (the dialog itself, outside its box) closes the sheet
        if (target === menu && menu.matches(':modal')) {
            let r = menu.getBoundingClientRect();
            if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) {
                closeMenu();
            }
        }
    });

    // board settings: tabs by click, arrow keys, Home and End (focus follows the selection)
    let csetBox = document.getElementById('cset_box');
    if (csetBox !== null) {
        csetBox.addEventListener('click', function (event) {
            let tab = event.target.closest('[role="tab"][data-tab]');
            if (tab !== null) showCsetTab(tab.getAttribute('data-tab'));
        });
        csetBox.addEventListener('keydown', function (event) {
            let tab = event.target.closest('[role="tab"][data-tab]');
            if (tab === null) return;
            let tabs = Array.from(csetBox.querySelectorAll('[role="tab"][data-tab]'));
            let i = tabs.indexOf(tab);
            if (event.key === 'ArrowRight') i = (i + 1) % tabs.length;
            else if (event.key === 'ArrowLeft') i = (i - 1 + tabs.length) % tabs.length;
            else if (event.key === 'Home') i = 0;
            else if (event.key === 'End') i = tabs.length - 1;
            else return;
            event.preventDefault();
            showCsetTab(tabs[i].getAttribute('data-tab'), true);
        });
    }

    // Escape: modal (phones) via the cancel event, non-modal (large screens) via keydown
    menu.addEventListener('cancel', function (event) {
        event.preventDefault();
        closeMenu();
    });
    document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape' || event.defaultPrevented || !menu.open || menu.matches(':modal')) return;
        event.preventDefault();
        closeMenu();
    });

    gPhoneQuery.addEventListener('change', switchMenuLayout);
}

document.addEventListener('DOMContentLoaded', initMenu);

// B-51: "Average pointer" Hide/Show (radio group); the lock on "Show" is CSS
function updateJediBtn() {
    checkRadio('cet_dark_side', gLastJson.show_avg === 1 ? '1' : '0');
}

function pushJediBtn(showAvg) {
    let url = './api/update_show_avg.php?id=' + localStorage.getItem('SID') + '&show_avg=' + (showAvg === '1' ? '1' : '0') + '&t=' + t;
    fetch(url, { method: 'POST' }).then(()=>{pushDomChange();});
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
            fetch(url, { method: 'POST' }).then(()=>{
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
    fetch(url, { method: 'POST' }).then( () => {
        gSurvey = "VOTED";
        generateSurveyContents();
    });

}

function feedback_submit() {
    let fb_text = document.getElementById('feedback_txt').value;
    closeMenu();
    document.getElementById('feedback_txt').value = '';

    // B-54: free text in URLs always encoded; stars are no longer asked for (0)
    fetch('./api/feedback.php?id=' + localStorage.getItem('SID')
        + '&stars=0'
        + '&text=' + encodeURIComponent(fb_text)
    , { method: 'POST' }).then();
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
    // notify the other boards only once the topic is saved, otherwise they reload the old one
    httpRequest.onload = () => pushDomChange();
    httpRequest.send(
        "topic=" + encodeURIComponent(topic)
    );

    closeMenu();

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
    fetch(url, { method: 'POST' }).then(()=>{pushDomChange();});
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

// B-51: called by the radio group with SEQUENCE or NAME
function changeSortOrder(resultsOrder) {
    const url = './api/update_results_order.php?t='+t+'&results_order='+(resultsOrder === 'NAME' ? 'NAME' : 'SEQUENCE');
    let httpRequest = new XMLHttpRequest();
    httpRequest.open("POST", url, false);
    httpRequest.send();
    pushDomChange();
}

// B-51: called by the radio group with 0 (show names) or 1 (anonymous)
function changeAnonymity(anonymous) {
    const url = './api/update_team.php?t='+t+'&anonymous_request_toggle='+(anonymous === '1' ? '1' : '0');
    let httpRequest = new XMLHttpRequest();
    httpRequest.open("POST", url, false);
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

    let url = './api/update_team.php?name=' + encodeURIComponent(teamInput.value) + '&t=' + t;
    fetch(url, { method: 'POST' }).then(()=>{pushDomChange();});
}

function updateUserName() {
    let userInput =  document.getElementById("cet_usr_name");
    userInput.value = userInput.value.trim();
    document.getElementById('cet_change_user').disabled = true;

    let url = './api/name.php?name=' + encodeURIComponent(userInput.value) + '&t=' + t +'&id='+sid + '&type=' + gLastJson.player_type;
    fetch(url, { method: 'POST' }).then(()=>{pushDomChange();});
}

// B-51: called by the radio group with PLAYER or OBSERVER
function toggleUserType(playerType) {
    if (playerType !== 'OBSERVER') playerType = 'PLAYER';

    let url = './api/name.php?name=' + encodeURIComponent(gUserName) + '&t=' + t +'&id='+sid + '&type=' + playerType;
    fetch(url, { method: 'POST' }).then(()=>{pushDomChange();});
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

setTimeout(function () { feedback_bling() }, getRandom(60 * 1000, 4 * 60 * 1000));


