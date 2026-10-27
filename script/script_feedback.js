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
    if (sec === 'feedback') showMenuTab(document.getElementById('feedback_box'), 'send');
    if (sec === 'user_settings') {
        document.getElementById('cet_usr_name').value = gUserName;
        document.getElementById('cet_change_user').disabled = true;
    }
    if (sec === 'topic') {
        document.getElementById('topic_reset').disabled = !gTopicChangePending;
        document.getElementById('topic_save').disabled = !gTopicChangePending;
        if (!gTopicChangePending) document.getElementById('topic_txt').value = gTopic;
    }
}

/* Tabs in a menu section (board settings: Deck | Results | Team; B-57 feedback: Send feedback | Backlog).
 * The tab buttons carry role="tab" and data-tab, the panels role="tabpanel" and data-tab as well; the
 * selected tab has aria-selected="true" and is the only one in the tab order, the other panels are
 * hidden. box: the section element; focusTab: move the focus to the tab. */
function showMenuTab(box, name, focusTab = false) {
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
    if (box.id === 'feedback_box' && name === 'backlog') loadFeedbackBacklog(); // B-57
}

function showCsetTab(name, focusTab = false) {
    showMenuTab(document.getElementById('cset_box'), name, focusTab);
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

    if (sec === 'feedback') markFeedbackSeen(); // B-57
    if (gMenuSections[sec].event) measureEvent(gMenuSections[sec].event);
}

/* B-57: a red dot on the feedback menu (header button, phone menu button and index entry) until the user has
 * opened the feedback panel once. Stored per user on the server: pok_user_tbl.hide_teaser = 1 means "seen"
 * (the column of the former teaser, reused). Board only; the start page has no user profile (gFeedbackDot
 * stays null). true: dot shown, false: seen - a pull update (updateDom) never brings the dot back. */
let gFeedbackDot = null;

function updateFeedbackDot(seen) {
    if (gFeedbackDot === false) return;
    gFeedbackDot = !seen;
    renderFeedbackDot();
}

function renderFeedbackDot() {
    let on = gFeedbackDot === true;
    document.body.classList.toggle('fb-new', on);
    let labels = {feedback_btn: 'Feedback', menu_btn: 'Menu'};
    for (let id in labels) {
        let btn = document.getElementById(id);
        if (btn !== null) btn.setAttribute('aria-label', labels[id] + (on ? ' \u2013 new' : ''));
    }
    let entry = document.querySelector('#menu_index [data-open="feedback"]');
    if (entry !== null) {
        if (on) entry.setAttribute('aria-label', 'Feedback \u2013 new: Tell us what to improve');
        else entry.removeAttribute('aria-label');
    }
}

function markFeedbackSeen() {
    if (gFeedbackDot !== true) return;
    gFeedbackDot = false;
    renderFeedbackDot();
    fetch('./api/update_user.php?id=' + encodeURIComponent(localStorage.getItem('SID')) + '&hide_teaser=1',
        {method: 'POST'}).then();
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
                if (event.detail === 0) {
                    closeMenu(); // keyboard (Enter/Space): the focus goes back to the button, ring visible
                } else {
                    // mouse/touch: no programmatic focus, it would show the focus ring (Safari focuses
                    // nothing on a click, so the focus would come from a field in the panel)
                    if (menu.contains(document.activeElement)) document.activeElement.blur();
                    closeMenu(false);
                }
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

    // tabs in menu sections (board settings, feedback): click, arrow keys, Home and End
    // (focus follows the selection)
    menu.querySelectorAll('section.menu_sec:has([role="tablist"])').forEach(box => {
        box.addEventListener('click', function (event) {
            let tab = event.target.closest('[role="tab"][data-tab]');
            if (tab !== null) showMenuTab(box, tab.getAttribute('data-tab'));
        });
        box.addEventListener('keydown', function (event) {
            let tab = event.target.closest('[role="tab"][data-tab]');
            if (tab === null) return;
            let tabs = Array.from(box.querySelectorAll('[role="tab"][data-tab]'));
            let i = tabs.indexOf(tab);
            if (event.key === 'ArrowRight') i = (i + 1) % tabs.length;
            else if (event.key === 'ArrowLeft') i = (i - 1 + tabs.length) % tabs.length;
            else if (event.key === 'Home') i = 0;
            else if (event.key === 'End') i = tabs.length - 1;
            else return;
            event.preventDefault();
            showMenuTab(box, tabs[i].getAttribute('data-tab'), true);
        });
    });

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

/* B-57: "Send feedback" tab. The type (Bug | Feature | Other) sets the placeholder of the text; with a bug the
 * technical context (no team id, no names) goes along. An empty text is not sent. */
function feedbackType() {
    let radio = document.querySelector('input[name="fb_type"]:checked');
    return radio === null ? 'OTHER' : radio.value;
}

function setFeedbackType(type) {
    checkRadio('fb_type', type);
    let radio = document.querySelector('input[name="fb_type"]:checked');
    let txt = document.getElementById('feedback_txt');
    if (radio !== null && txt !== null) txt.placeholder = radio.getAttribute('data-placeholder') || '';
}

/* the ?v= of a script or stylesheet in the page, e.g. assetVersion('script/script.js') -> '2.17' */
function assetVersion(file) {
    let el = document.querySelector('script[src*="' + file + '"], link[href*="' + file + '"]');
    if (el === null) return null;
    return new URL(el.getAttribute('src') || el.getAttribute('href'), location.href).searchParams.get('v');
}

/* compact JSON with what helps to reproduce a bug: browser, window size, touch, app version, theme */
function bugContext() {
    return JSON.stringify({
        browser: navigator.userAgent.slice(0, 250),
        window: window.innerWidth + 'x' + window.innerHeight,
        touch: navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches,
        version: 'js ' + assetVersion('script/script.js') + ', css ' + assetVersion('style/style.css'),
        theme: document.body.classList.contains('light-theme') ? 'light' : 'dark'
    });
}

function feedback_submit() {
    let txt = document.getElementById('feedback_txt');
    let fb_text = txt.value.trim();
    if (fb_text === '') {
        txt.focus();
        return;
    }
    let type = feedbackType();

    // B-54: free text in URLs always encoded; stars are no longer asked for (0)
    let url = './api/feedback.php?id=' + encodeURIComponent(localStorage.getItem('SID'))
        + '&stars=0'
        + '&type=' + encodeURIComponent(type)
        + '&text=' + encodeURIComponent(fb_text);
    if (type === 'BUG') url += '&context=' + encodeURIComponent(bugContext());
    fetch(url, { method: 'POST' }).then();

    closeMenu();
    txt.value = '';
    setFeedbackType('OTHER');
    showToast('Thanks – we read every message.');
}

/* B-57: "Backlog" tab - our public list (api/get_roadmap.php) with status and reactions (api/vote_roadmap.php).
 * Loaded each time the tab is shown; entries are clones of #fb_item_tpl, filled via textContent only.
 * Pull updates of the board do not touch it. On the start page (#fb_react_hint present) the user may not be
 * known yet (vote_roadmap.php: 403), so the reactions are shown, but disabled. */
const gFbStatusText = {PLANNED: 'planned', IN_PROGRESS: 'in progress', DONE: 'done ✅'};
let gFbBacklogRequest = 0; // only the latest load fills the list

function fbCanReact() {
    return document.getElementById('fb_react_hint') === null;
}

function fillBacklogItem(li, item) {
    li.dataset.item = item.id;
    li.querySelector('.fb-title').textContent = item.title;
    li.querySelector('.fb-desc').textContent = item.description || '';
    let status = li.querySelector('.fb-status');
    status.dataset.status = item.status;
    status.textContent = gFbStatusText[item.status] || '';
    li.querySelectorAll('.fb-react-btn').forEach(btn => {
        let reaction = btn.dataset.reaction;
        btn.setAttribute('aria-pressed', item.my_reaction === reaction ? 'true' : 'false');
        btn.querySelector('.fb-count').textContent = (item.reactions && item.reactions[reaction]) || 0;
        btn.disabled = !fbCanReact();
    });
}

function loadFeedbackBacklog() {
    let list = document.getElementById('fb_backlog');
    let empty = document.getElementById('fb_backlog_empty');
    let tpl = document.getElementById('fb_item_tpl');
    if (list === null || tpl === null) return;
    let request = ++gFbBacklogRequest;
    // no "Nothing here yet." while loading; the entries of the last load stay until the new ones are there
    if (empty !== null && list.children.length === 0) empty.hidden = true;
    list.setAttribute('aria-busy', 'true');

    fetch('./api/get_roadmap.php?id=' + encodeURIComponent(localStorage.getItem('SID')))
        .then(response => response.ok ? response.json() : Promise.reject(response.status))
        .then(json => {
            if (request !== gFbBacklogRequest) return;
            list.replaceChildren(...json.items.map(item => {
                let li = tpl.content.firstElementChild.cloneNode(true);
                fillBacklogItem(li, item);
                return li;
            }));
        })
        .catch(() => {})
        .finally(() => {
            if (request !== gFbBacklogRequest) return;
            list.removeAttribute('aria-busy');
            if (empty !== null) empty.hidden = false; // CSS hides it while the list has entries
        });
}

/* a click on a reaction: set it, or remove it when it is the own one already (NONE) */
function reactOnBacklogItem(btn) {
    let li = btn.closest('li.fb-item');
    if (li === null || !fbCanReact()) return;
    let reaction = btn.getAttribute('aria-pressed') === 'true' ? 'NONE' : btn.dataset.reaction;
    let buttons = li.querySelectorAll('.fb-react-btn');
    buttons.forEach(b => { b.disabled = true; });

    fetch('./api/vote_roadmap.php?id=' + encodeURIComponent(localStorage.getItem('SID'))
        + '&item=' + encodeURIComponent(li.dataset.item)
        + '&reaction=' + encodeURIComponent(reaction), { method: 'POST' })
        .then(response => {
            if (response.ok) return response.json();
            if (response.status === 403) showToast('Join a board to react.');
            return Promise.reject(response.status);
        })
        .then(item => fillBacklogItem(li, item))
        .catch(() => { buttons.forEach(b => { b.disabled = false; }); });
}

function initFeedbackPanel() {
    let types = document.getElementById('fb_type');
    if (types !== null) {
        types.addEventListener('change', () => setFeedbackType(feedbackType()));
        setFeedbackType(feedbackType());
    }
    let list = document.getElementById('fb_backlog');
    if (list !== null) {
        list.addEventListener('click', function (event) {
            let btn = event.target.closest('.fb-react-btn');
            if (btn !== null && !btn.disabled) reactOnBacklogItem(btn);
        });
    }
    let empty = document.getElementById('fb_backlog_empty');
    if (empty !== null) empty.hidden = true; // until the first load
}

document.addEventListener('DOMContentLoaded', initFeedbackPanel);

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
