/* B-52 S1/S1b: topics as a list of items (api/topic_item_*.php, api/get_topics.php; dao topic_items and deck.aim,
 * see script/types.ts). The topmost open item is the active one.
 * S1b (Andreas, 2026-11-12): the note stays a note. The topic field (update_topic.php, dao topic) is the general note
 * of the team, always shown in the column as before; the items come in addition. Without items everything looks as
 * before S1 (plus "+ Add item" in the topics menu).
 * - dao.php brings only the summary (topic_items: active, open_count, done_count, next_heading, topics_rev). The column
 *   (active item, "+N more · next: …") and the results panel live on it.
 * - The lists come from get_topics.php, only while the topics menu shows them and only when topics_rev differs from
 *   the rev the last lists were loaded for (the done items when there are any). One request at a time; a request
 *   asked for meanwhile follows when the running one is done (loadTopicLists()).
 * - The results panel (updateSide() in script.js) marks the result of the active item (deck aim 'agree') and offers a
 *   dropdown; after the reveal "Next item" next to "New round", for the last open item "Finish item" (then no item
 *   is active, the note stays).
 * - Done items (history): agreed value (if any), rounds, date of the last round, the spread behind a triangle.
 * S1c (Andreas, 2026-11-12):
 * - The note stands on the board above the cards (#board_note), for everyone and always (also with the column
 *   collapsed); cut to a few lines, "more" unfolds it. The column shows the item only.
 * - The topics menu has tabs Note · Items · Done with counters (Andreas: "Items" for the open items); it starts on Items while items are open, else on Note.
 *   The done items load when their tab opens (get_topics.php?done=1).
 * - "Next item" / "Finish item" (column, phone dock, rail) always ask first: the overlay #leave_item (close with the
 *   current estimate / close without a value / bring it back later; perspectives: close / later), the first choice
 *   focused, Enter confirms; topic_item_next.php with mode close | close_empty | later.
 * - The collapsed column (rail): the item marker "1/3" on top, after the reveal "next item" / "new round" as one
 *   split block (#rail_acts.split).
 * topic_items null (table missing on the server): the old behaviour, no items.
 * Free text only via textContent (or remarkable without HTML); free text goes in the POST body, never in the URL.
 * After every write the board loads itself (apiWrite). */

const MATURITY_STAGES = ['new', 'rough', 'shaping', 'ready'];
const MATURITY_TEXTS = [
    'We don’t know the topic yet and need to take a look.',
    'We have a rough idea and can start asking the right questions.',
    'The direction is getting clearer, but everything can still change.',
    'Final polish – we should actually start building.',
];
/* B-132 (Andreas, 2026-11-13): no maturity input in the item form for now; stored values are still shown and kept
 * (the edit sends no maturity = unchanged). Set to true to bring the input back. */
const MATURITY_INPUT = false;


let gTopicItems = null;       // dao topic_items (the summary); null: the note only (old server)
let gTopicLists = null;       // the last answer of get_topics.php {topics_rev, open, open_count, done_count, limits, done?}
let gTopicListsFor = null;    // the dao topics_rev the lists were asked for (compared for inequality only)
let gTopicListsDone = false;  // the lists were asked for with the done items
let gTopicLoad = null;        // { seq } while a get_topics.php request runs
let gTopicLoadAgain = false;  // another load was asked for while one ran
let gTopicLoadSeq = 0;
let gTopicLoadError = false;  // the last load failed (the menu offers "Try again")
let gTopicTab = 'note';      // the tab of the topics menu: 'note' | 'open' | 'done'
let gTopicNextTab = null;     // the tab the menu opens on next (an opener asked for it), else the start rule
let gTopicNoteMore = false;   // the board note: unfolded ("more")
let gTopicNoteKey = null;     // what the board note shows now
let gLeave = null;            // { id, opener } while the "leave this item" overlay is open
let gTopicEditor = null;      // { id: number | 'new' } while the item form is open in the menu
let gTopicConfirmDelete = null; // id of the item whose trash can asks "Delete?"
let gTopicDistOpen = new Set(); // ids of done items whose spread is unfolded
let gTopicDrag = null;         // the open item being dragged by its grip (startTopicDrag)
let gTopicMenuKey = '';       // what the menu list shows now
let gTopicViewKey = '';       // what the column shows now
let gTopicDescMore = false;   // the column: the whole description ("more")
let gTopicMatOpen = false;    // results panel: the maturity text unfolded (a click on the triangle)
let gTopicRevealed = false;

function topicMarkdown(text) {
    const markDown = new Remarkable({ html: false, xhtmlOut: true, breaks: true, linkify: true, typographer: false });
    return markDown.render(text);
}

function validTopicItems(items) {
    return items !== null && typeof items === 'object' && typeof items.topics_rev === 'number'
        && typeof items.open_count === 'number' && typeof items.done_count === 'number';
}

function activeTopicItem() {
    return gTopicItems !== null && gTopicItems.active ? gTopicItems.active : null;
}

/* the team has items at all (open or done) */
function topicHasItems() {
    return gTopicItems !== null && gTopicItems.open_count + gTopicItems.done_count > 0;
}

function svgEl(tag, attrs) {
    const element = document.createElementNS(SVG_NS, tag);
    for (const name in attrs) element.setAttribute(name, attrs[name]);
    return element;
}

function iconSvg(id) {
    const svg = svgEl('svg', { class: 'i', 'aria-hidden': 'true' });
    svg.appendChild(svgEl('use', { href: '#i-' + id }));
    return svg;
}

function iconButton(icon, label, act, id) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-btn';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.dataset.tiAct = act;
    if (id !== undefined) button.dataset.tiId = String(id);
    button.appendChild(iconSvg(icon));
    return button;
}

/* ---------- maturity: a lying triangle (wide left = much open, point right = ready), the stage marked ---------- */

function maturityValid(level) {
    return Number.isInteger(level) && level >= 0 && level < MATURITY_STAGES.length;
}

/* the triangle (decorative) and the stage name; null for "not set" */
function maturityBadge(level) {
    if (!maturityValid(level)) return null;
    const W = 34, H = 12;
    const half = x => H / 2 * (1 - x / W);
    const x = (level + 0.5) / MATURITY_STAGES.length * W;
    const svg = svgEl('svg', { class: 'mat-tri', width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    svg.appendChild(svgEl('polygon', { class: 'mat-fill', points: `0,0 ${x},${H / 2 - half(x)} ${x},${H / 2 + half(x)} 0,${H}` }));
    svg.appendChild(svgEl('polygon', { class: 'mat-out', points: `0,0 ${W},${H / 2} 0,${H}` }));
    svg.appendChild(svgEl('line', { class: 'mat-mark', x1: x, x2: x, y1: 0, y2: H }));
    const badge = document.createElement('span');
    badge.className = 'mat';
    badge.dataset.level = String(level);
    badge.append(svg, textElement('span', 'mat-name', MATURITY_STAGES[level]));
    return badge;
}

/* ---------- the column (voting and results panel) ---------- */

/* called by updateDom() before updateSide(): the note on the board; the active item in the column (none: no bar) */
function updateTopicView(json) {
    gTopicItems = validTopicItems(json.topic_items) ? json.topic_items : null;
    gTopic = json.topic;
    gTopicRevealed = json.all_players_ready && json.players_count > 0;
    const topic = document.getElementById('topic');
    const label = document.querySelector('.topic-bar .topic-label');
    const edit = document.querySelector('.topic-bar .topic-edit');
    const item = activeTopicItem();
    updateBoardNote(json.topic);

    if (item === null) {
        // S1c: the note is on the board, the column has no topic bar without an item
        if (gTopicViewKey !== '') {
            gTopicViewKey = '';
            topic.setAttribute('data-hash', '0');
            topic.classList.remove('ti-view');
            topic.replaceChildren();
            topic.classList.add('display_none');
        }
    } else {
        const key = 'i:' + JSON.stringify([item.id, item.ext_id, item.heading, item.description, item.maturity,
            gTopicItems.open_count, gTopicItems.next_heading, gTopicRevealed, gTopicDescMore, gTopicMatOpen]);
        if (gTopicViewKey !== key) {
            gTopicViewKey = key;
            topic.setAttribute('data-hash', key.hashCode().toString());
            topic.classList.add('ti-view');
            topic.replaceChildren(...topicItemView(item, gTopicItems.open_count, gTopicItems.next_heading));
            topic.classList.remove('display_none');
            label.textContent = 'item 1 of ' + gTopicItems.open_count;
            edit.setAttribute('aria-label', 'Edit items');
            requestAnimationFrame(updateTopicMoreButton);
        }
    }
    renderTopicMenu();
    loadTopicLists();
    updateNextItemButton(json);
    updateRailItem(json);
    syncLeaveItem(json);
}

/* ---------- the note on the board (S1c) ---------- */

/* the team's note above the cards (markdown without HTML); hidden without one (no room taken) */
function updateBoardNote(note) {
    const box = document.getElementById('board_note');
    const text = document.getElementById('board_note_text');
    if (box === null || text === null) return;
    const value = typeof note === 'string' ? note : '';
    if (gTopicNoteKey === value) return;
    if (gTopicNoteKey !== null && gTopicNoteKey !== value) gTopicNoteMore = false; // a new note starts cut
    gTopicNoteKey = value;
    box.hidden = value.trim() === '';
    text.innerHTML = box.hidden ? '' : topicMarkdown(value);
    syncBoardNoteMore();
    requestAnimationFrame(syncBoardNoteMore);
}

/* "more" only when the note is cut (or unfolded) */
function syncBoardNoteMore() {
    const box = document.getElementById('board_note');
    const text = document.getElementById('board_note_text');
    const more = document.getElementById('board_note_more');
    if (box === null || text === null || more === null) return;
    text.classList.toggle('open', gTopicNoteMore);
    const cut = !gTopicNoteMore && text.scrollHeight > text.clientHeight + 1;
    text.classList.toggle('cut', cut);
    more.hidden = box.hidden || (!gTopicNoteMore && !cut);
    more.textContent = gTopicNoteMore ? 'less' : 'more';
    more.setAttribute('aria-expanded', gTopicNoteMore ? 'true' : 'false');
}

function toggleBoardNote() {
    gTopicNoteMore = !gTopicNoteMore;
    syncBoardNoteMore();
}

function topicItemView(item, openCount, nextHeading) {
    const parts = [];
    const meta = document.createElement('div');
    meta.className = 'ti-meta';
    if (item.ext_id) meta.appendChild(textElement('span', 'ti-ext', item.ext_id));
    const hasMat = maturityValid(item.maturity);
    if (hasMat) {
        const badge = maturityBadge(item.maturity);
        if (gTopicRevealed) {
            // results panel: the text unfolds with a click on the triangle (no tooltip only)
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'ti-mat-btn';
            button.id = 'ti_mat_btn';
            button.setAttribute('aria-expanded', gTopicMatOpen ? 'true' : 'false');
            button.setAttribute('aria-controls', 'ti_mat_text');
            button.setAttribute('aria-label', 'Maturity: ' + MATURITY_STAGES[item.maturity] + ' – show what it means');
            button.appendChild(badge);
            meta.appendChild(button);
        } else {
            meta.appendChild(badge);
        }
    }
    if (meta.childNodes.length > 0) parts.push(meta);

    parts.push(textElement('h3', 'ti-heading', item.heading));

    if (item.description) {
        const desc = document.createElement('div');
        desc.className = 'ti-desc' + (gTopicDescMore ? '' : ' clamp');
        desc.id = 'ti_desc_view';
        desc.innerHTML = topicMarkdown(item.description);
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'ti-link ti-desc-more';
        more.id = 'ti_desc_more';
        more.setAttribute('aria-expanded', gTopicDescMore ? 'true' : 'false');
        more.setAttribute('aria-controls', 'ti_desc_view');
        more.textContent = gTopicDescMore ? 'less' : 'more';
        more.hidden = true; // updateTopicMoreButton(): only when the text is cut
        parts.push(desc, more);
    }

    if (hasMat) {
        const text = textElement('p', 'ti-mat-text', MATURITY_TEXTS[item.maturity]);
        text.id = 'ti_mat_text';
        text.hidden = gTopicRevealed && !gTopicMatOpen;
        parts.push(text);
    }

    if (openCount > 1 && nextHeading !== null && nextHeading !== undefined) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'ti-next';
        more.id = 'ti_next_hint';
        more.title = 'Open the topic list';
        more.dataset.open = 'topic'; // the menu's own opener handling (script_feedback.js), on the "Items" tab
        more.addEventListener('click', () => { gTopicNextTab = 'open'; });
        more.setAttribute('aria-controls', 'menu');
        more.textContent = '+' + (openCount - 1) + ' more · next: ' + nextHeading;
        parts.push(more);
    }

    return parts;
}

/* "more" only when the description is cut (two lines) or unfolded */
function updateTopicMoreButton() {
    const desc = document.getElementById('ti_desc_view');
    const more = document.getElementById('ti_desc_more');
    if (desc === null || more === null) return;
    more.hidden = !gTopicDescMore && desc.scrollHeight <= desc.clientHeight + 1;
}

function onTopicViewClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (target === null) return;
    if (target.closest('#ti_desc_more')) {
        gTopicDescMore = !gTopicDescMore;
        refreshTopicView();
    } else if (target.closest('#ti_mat_btn')) {
        gTopicMatOpen = !gTopicMatOpen;
        refreshTopicView();
        const button = document.getElementById('ti_mat_btn');
        if (button !== null) focusQuietly(button);
    }
}

function refreshTopicView() {
    const active = document.activeElement && document.activeElement.id;
    gTopicViewKey = '';
    if (gLastJson) updateTopicView(gLastJson);
    if (active === 'ti_desc_more' || active === 'ti_mat_btn') {
        const element = document.getElementById(active);
        if (element !== null) element.focus({ preventScroll: true });
    }
}

/* ---------- results panel: the result of the active item ---------- */

/* what the spread marks: { show: an active item, aim, key: the result card (agree) or null } */
function topicEstimate(json) {
    const item = activeTopicItem();
    if (item === null) return { show: false, aim: 'agree', key: null, item: null };
    const aim = json.deck && json.deck.aim === 'perspectives' ? 'perspectives' : 'agree';
    return { show: true, aim, key: aim === 'agree' ? item.result_card_key : null, item };
}

/* a spread column (updateSide): marked as the result, clickable when it has votes (agree only) */
function syncEstimateColumn(col, estimate, n) {
    const key = col.getAttribute('data-card');
    const clickable = estimate.show && estimate.aim === 'agree' && n > 0;
    const marked = estimate.show && estimate.aim === 'agree' && estimate.key !== null && estimate.key === key;
    col.classList.toggle('est', marked);
    col.classList.toggle('pick', clickable);
    if (clickable) {
        const card = cardByKey(key);
        const name = card ? cardName(card) : key;
        setAttrIfChanged(col, 'role', 'button');
        setAttrIfChanged(col, 'tabindex', '0');
        setAttrIfChanged(col, 'aria-pressed', marked ? 'true' : 'false');
        setAttrIfChanged(col, 'aria-label', name + ': ' + n + (n === 1 ? ' vote' : ' votes') + ' – use as estimate');
    } else if (col.hasAttribute('role')) {
        ['role', 'tabindex', 'aria-pressed', 'aria-label'].forEach(name => col.removeAttribute(name));
    }
}

/* the row below the spread: "Current estimate" with the dropdown (agree) or the sentence (perspectives) */
function updateEstimateRow(json, revealed, cardStats) {
    const row = document.getElementById('spread_est');
    const note = document.getElementById('spread_note');
    if (row === null || note === null) return;
    const estimate = topicEstimate(json);
    // kept (invisible inside the hidden spread) before the reveal as well, so nothing moves when the cards turn
    row.hidden = !(estimate.show && estimate.aim === 'agree');
    note.hidden = !(estimate.show && estimate.aim === 'perspectives');
    if (row.hidden || !revealed) return;

    const item = estimate.item;
    // the options: auto, the played cards (no control cards) and every deck card with a value, in deck order
    const keys = [];
    const add = card => { if (card && !card.controlCard && !keys.includes(card.key)) keys.push(card.key); };
    const played = new Set(Object.keys(cardStats).filter(key => cardStats[key].usageCount > 0));
    gDeck.cards.forEach(card => { if (played.has(card.key) || (card.value !== null && !card.controlCard)) add(card); });
    played.forEach(key => add(cardByKey(key)));
    if (item.result_card_key !== null && !keys.includes(item.result_card_key)) keys.push(item.result_card_key);

    const select = document.getElementById('spread_est_sel');
    const autoText = item.result_card_key === null ? '–' : 'auto';
    const optionsKey = autoText + '|' + keys.join(',');
    if (select.dataset.keys !== optionsKey) {
        select.dataset.keys = optionsKey;
        const auto = document.createElement('option');
        auto.value = '';
        auto.textContent = autoText;
        select.replaceChildren(auto, ...keys.map(key => {
            const option = document.createElement('option');
            const card = cardByKey(key);
            option.value = key;
            option.textContent = card ? String(card.text || card.label || key) : key;
            return option;
        }));
    }
    const value = item.result_card_key === null ? '' : item.result_card_key;
    if (select.value !== value) select.value = value;

    const why = document.getElementById('spread_est_why');
    const text = item.result_card_key === null ? 'No card with a value yet.'
        : item.result_auto === 0 ? 'Picked by the team.' : 'Highest card – click a bar to pick another.';
    if (why.textContent !== text) why.textContent = text;
}

function setTopicResult(card) {
    const item = activeTopicItem();
    if (item === null) return;
    const current = item.result_auto === 0 ? item.result_card_key : '';
    if (card === current) return;
    // shown at once, the reload brings the server's state
    item.result_card_key = card === '' ? null : card;
    item.result_auto = card === '' ? 1 : 0;
    if (gLastJson) updateSide(gLastJson, false);
    topicWrite('topic_item_result.php', { item: item.id, card: card });
    measureEvent('TOPIC_RESULT_SET');
}

function onSpreadPick(event) {
    const col = event.target instanceof Element ? event.target.closest('.spread-col.pick') : null;
    if (col === null) return;
    if (event.type === 'keydown') {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
    }
    setTopicResult(col.getAttribute('data-card'));
}

/* "Next item" next to "New round" after the reveal while an item is active; "Finish item" for the last open one */
function updateNextItemButton(json) {
    const button = document.getElementById('nextitem_btn');
    if (button === null) return;
    const revealed = json.all_players_ready && json.players_count > 0;
    const show = revealed && activeTopicItem() !== null;
    const last = gTopicItems === null || gTopicItems.open_count <= 1;
    const text = last ? 'Finish item' : 'Next item';
    const label = button.querySelector('.lbl');
    if (label !== null && label.textContent !== text) label.textContent = text;
    button.dataset.last = last ? 'true' : 'false';
    button.title = last ? 'Leave this item – no item after it' : 'Leave this item and go to the next one';
    button.hidden = !show;
    button.closest('.dock').classList.toggle('has-next', show);
}

/* ---------- the rail (collapsed column): the item marker and the split "next item" / "new round" ---------- */

function updateRailItem(json) {
    const marker = document.getElementById('rail_item');
    const acts = document.getElementById('rail_acts');
    const next = document.getElementById('rail_next');
    if (marker === null || acts === null || next === null) return;
    const item = activeTopicItem();
    const count = gTopicItems === null ? 0 : gTopicItems.open_count;
    marker.hidden = item === null;
    if (item !== null) {
        const pos = '1/' + count;
        const posEl = document.getElementById('rail_item_pos');
        if (posEl.textContent !== pos) posEl.textContent = pos;
        marker.setAttribute('aria-label', 'Item 1 of ' + count + ' – open sidebar');
        marker.title = item.heading;
    }
    const revealed = json.all_players_ready && json.players_count > 0;
    const show = revealed && item !== null;
    const last = count <= 1;
    acts.classList.toggle('split', show);
    next.hidden = !show;
    next.classList.toggle('last', last);
    next.setAttribute('aria-label', last ? 'Finish item' : 'Next item');
    const word = document.getElementById('rail_next_w');
    const text = last ? 'finish' : 'next';
    if (word !== null && word.textContent !== text) word.textContent = text;
}

/* ---------- "leave this item": the overlay behind "Next item" / "Finish item" (S1c) ---------- */

/* the choices for the active item: deck aim 'agree': close with the current estimate (when there is one), close
 * without a value, later; 'perspectives': close, later. The first one is the suggestion. */
function leaveItemChoices(json, item) {
    const aim = json.deck && json.deck.aim === 'perspectives' ? 'perspectives' : 'agree';
    const later = gTopicItems !== null && gTopicItems.open_count > 1
        ? 'Stays open and moves to the end of the list' : 'Stays open – it is the only open item';
    const choices = [];
    if (aim === 'agree') {
        if (item.result_card_key !== null) {
            const card = cardByKey(item.result_card_key);
            choices.push({ mode: 'close', card: item.result_card_key, text: 'Close with ',
                value: card ? String(card.text || card.label || item.result_card_key) : item.result_card_key,
                hint: 'Done – the estimate is kept' });
        }
        choices.push({ mode: 'close_empty', text: 'Close without a value', hint: 'Done – no estimate' });
    } else {
        choices.push({ mode: 'close', text: 'Close', hint: 'Done – the spread is kept' });
    }
    choices.push({ mode: 'later', text: 'Bring it back later', hint: later });
    return choices;
}

function leaveItemOpen() {
    const dialog = document.getElementById('leave_item');
    return dialog !== null && dialog.open;
}

/* opener: the button that gets the focus back (#nextitem_btn or #rail_next) */
function openLeaveItem(opener) {
    const item = activeTopicItem();
    const dialog = document.getElementById('leave_item');
    if (item === null || dialog === null || !gLastJson || dialog.open) return;
    gLeave = { id: item.id, opener: opener || null };
    document.getElementById('leave_item_heading').textContent = (item.ext_id ? item.ext_id + ' ' : '') + item.heading;
    const box = document.getElementById('leave_item_opts');
    box.replaceChildren(...leaveItemChoices(gLastJson, item).map((choice, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'leave-opt' + (index === 0 ? ' primary' : '');
        button.dataset.mode = choice.mode;
        if (choice.card) button.dataset.card = choice.card;
        const title = textElement('span', 'leave-opt-t', choice.text);
        if (choice.value !== undefined) title.appendChild(textElement('b', 'leave-opt-v', choice.value));
        button.append(title, textElement('small', 'leave-opt-h', choice.hint));
        return button;
    }));
    dialog.showModal();
    const first = box.querySelector('.leave-opt');
    if (first !== null) first.focus();
}

function closeLeaveItem() {
    const dialog = document.getElementById('leave_item');
    if (dialog !== null && dialog.open) dialog.close();
}

/* the dialog closed (any way): the focus back to its opener while that can take it */
function onLeaveItemClosed() {
    const opener = gLeave === null ? null : gLeave.opener;
    gLeave = null;
    if (opener !== null && opener.isConnected && !opener.hidden && opener.offsetParent !== null) {
        opener.focus({ preventScroll: true });
    }
}

/* a board update while the overlay is open: someone else left the item or a new round started -> it closes */
function syncLeaveItem(json) {
    if (gLeave === null || !leaveItemOpen()) return;
    const item = activeTopicItem();
    const revealed = json.all_players_ready && json.players_count > 0;
    if (item === null || item.id !== gLeave.id || !revealed) closeLeaveItem();
}

function leaveItem(mode, card) {
    const item = activeTopicItem();
    const id = gLeave === null ? null : gLeave.id;
    closeLeaveItem();
    if (item === null || item.id !== id) return;
    const last = gTopicItems === null || gTopicItems.open_count <= 1;
    const params = { item: item.id, mode };
    if (card) params.card = card;
    const buttons = ['nextitem_btn', 'rail_next'].map(bid => document.getElementById(bid)).filter(b => b !== null);
    buttons.forEach(button => { button.disabled = true; });
    gTopicDescMore = false;
    gTopicMatOpen = false;
    // 409 not_active: someone else was quicker; the reload shows the new item
    topicWrite('topic_item_next.php', params, null, [409]).then(() => {
        buttons.forEach(button => { button.disabled = false; });
    });
    measureEvent(mode === 'later' ? 'TOPIC_ITEM_LATER' : (last ? 'TOPIC_FINISH_ITEM' : 'TOPIC_NEXT_ITEM'));
}

function initLeaveItem() {
    const dialog = document.getElementById('leave_item');
    if (dialog === null) return;
    dialog.addEventListener('close', onLeaveItemClosed);
    document.getElementById('leave_item_cancel').addEventListener('click', closeLeaveItem);
    dialog.addEventListener('click', event => {
        const option = event.target instanceof Element ? event.target.closest('.leave-opt') : null;
        if (option !== null) {
            leaveItem(option.dataset.mode, option.dataset.card || '');
            return;
        }
        // a click beside the box (on the backdrop: the dialog itself, outside its rectangle) cancels
        if (event.target === dialog) {
            const r = dialog.getBoundingClientRect();
            if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) {
                closeLeaveItem();
            }
        }
    });
    dialog.addEventListener('keydown', event => {
        // Escape: closed here (not only by the dialog's cancel), so the menu panel and the column overlay below it
        // stay as they are (they skip a handled Escape)
        if (event.key === 'Escape') {
            event.preventDefault();
            closeLeaveItem();
            return;
        }
        if (event.key === 'Tab') {
            // the focus stays inside (a modal dialog alone lets it go on to the browser's own controls)
            const controls = Array.from(dialog.querySelectorAll('button:not([disabled])'));
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
            return;
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        const options = Array.from(dialog.querySelectorAll('.leave-opt'));
        const index = options.indexOf(document.activeElement);
        if (index < 0) return;
        event.preventDefault();
        const to = (index + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length;
        options[to].focus();
    });
}

/* ---------- writes ---------- */

function topicWrite(endpoint, params, form = null, quiet = []) {
    const query = new URLSearchParams(Object.assign({ t: t }, params));
    const init = form === null ? {} : { body: new URLSearchParams(form) };
    return apiWrite('./api/' + endpoint + '?' + query.toString(), init).then(response => {
        if (response === null || (!response.ok && !quiet.includes(response.status))) {
            showToast('Not saved – please try again', DECK_TOAST_MS, 'error');
        }
        return response;
    });
}

/* ---------- the lists (get_topics.php) ---------- */

/* loads the lists while the topics menu shows the tab "Items" (open items) or "Done" (with the done items; S1c: only
 * then), only when the dao topics_rev differs from the rev of the last lists (or the done items are missing). One
 * request at a time; asked again meanwhile, the next follows when it is done. An answer that an own change made
 * outdated (topicListsChanged()) is dropped. opening: the menu is about to show it. */
function loadTopicLists(opening = false) {
    if (gTopicItems === null || !topicHasItems()) return;
    if (!opening && openMenuSection() !== 'topic') return;
    if (gTopicTab === 'note') return;
    if (gTopicTab === 'open' && gTopicItems.open_count === 0) return;
    if (gTopicTab === 'done' && gTopicItems.done_count === 0) return;
    const rev = gTopicItems.topics_rev;
    const done = gTopicTab === 'done';
    if (rev === gTopicListsFor && (!done || gTopicListsDone)) return;
    if (gTopicLoad !== null) {
        gTopicLoadAgain = true;
        return;
    }
    const seq = ++gTopicLoadSeq;
    gTopicLoad = { seq };
    const query = new URLSearchParams({ t: t });
    if (done) query.set('done', '1');
    fetch('./api/get_topics.php?' + query.toString(), { cache: 'no-store' })
        .then(response => response.ok ? response.json() : Promise.reject(new Error('HTTP ' + response.status)))
        .then(lists => {
            if (lists === null || typeof lists !== 'object' || !Array.isArray(lists.open)) throw new Error('lists');
            if (seq !== gTopicLoadSeq) return; // outdated meanwhile
            gTopicLists = lists;
            gTopicListsFor = rev;
            gTopicListsDone = done && Array.isArray(lists.done);
            gTopicLoadError = false;
        })
        .catch(() => {
            if (seq !== gTopicLoadSeq) return;
            // no retry loop: the next change of topics_rev or "Try again" loads again
            gTopicLoadError = true;
            gTopicListsFor = rev;
            gTopicListsDone = done;
        })
        .finally(() => {
            gTopicLoad = null;
            renderTopicMenu();
            if (gTopicLoadAgain || seq !== gTopicLoadSeq) {
                gTopicLoadAgain = false;
                loadTopicLists();
            }
        });
}

/* an own change shown at once (move): a running load is outdated, the lists are loaded again afterwards */
function topicListsChanged() {
    gTopicLoadSeq++;
    gTopicListsFor = null;
}

function topicListItem(id) {
    if (gTopicLists === null) return null;
    return gTopicLists.open.find(item => item.id === id)
        || (gTopicLists.done || []).find(item => item.id === id) || null;
}

/* ---------- moving an open item: drag the grip or the arrow keys on it ---------- */

/* shown at once, the reload brings the server's state (an answer started before is dropped, topicListsChanged) */
function moveTopicItem(from, to) {
    const open = gTopicLists ? gTopicLists.open : [];
    if (from < 0 || from >= open.length || to < 0 || to >= open.length || from === to) return;
    const moved = open[from];
    topicListsChanged();
    open.splice(from, 1);
    open.splice(to, 0, moved);
    renderTopicMenu(true);
    const live = document.getElementById('ti_live');
    if (live !== null) live.textContent = 'Moved to position ' + (to + 1) + ' of ' + open.length + '.';
    topicWrite('topic_item_move.php', { item: moved.id, to });
}

function openItemIndex(id) {
    return gTopicLists ? gTopicLists.open.findIndex(item => item.id === id) : -1;
}

function onTopicGripKey(event) {
    const grip = event.target instanceof Element ? event.target.closest('.ti-grip') : null;
    if (grip === null) return;
    if (gTopicDrag !== null) {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            endTopicDrag(false);
        }
        return;
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    if (gTopicEditor !== null) return;
    const from = openItemIndex(Number(grip.dataset.tiId));
    moveTopicItem(from, from + (event.key === 'ArrowUp' ? -1 : 1));
}

/* the drag starts on the grip only (touch-action: none there), so the list keeps scrolling everywhere else. It starts
 * after a few pixels; the item then follows the pointer (fixed) and a placeholder in the list marks where it lands */
function onTopicGripDown(event) {
    const grip = event.target instanceof Element ? event.target.closest('.ti-grip') : null;
    if (grip === null || gTopicDrag !== null || gTopicEditor !== null) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const li = grip.closest('li.ti-it');
    const id = Number(grip.dataset.tiId);
    const from = openItemIndex(id);
    if (li === null || from < 0) return;
    event.preventDefault(); // no text selection, no focus jump on touch
    grip.setPointerCapture(event.pointerId);
    gTopicDrag = { id, from, grip, li, pointerId: event.pointerId, startY: event.clientY, active: false,
        offsetY: 0, fixY: 0, placeholder: null, scroller: scrollParent(li.parentElement) };
}

function scrollParent(element) {
    for (let el = element; el !== null && el !== document.body; el = el.parentElement) {
        const style = getComputedStyle(el);
        if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight) return el;
    }
    return null;
}

function onTopicGripMove(event) {
    const drag = gTopicDrag;
    if (drag === null || event.pointerId !== drag.pointerId) return;
    if (!drag.active) {
        if (Math.abs(event.clientY - drag.startY) < 4) return;
        const rect = drag.li.getBoundingClientRect();
        const placeholder = document.createElement('li');
        placeholder.className = 'ti-drop';
        placeholder.setAttribute('aria-hidden', 'true');
        placeholder.style.height = rect.height + 'px';
        drag.li.before(placeholder);
        drag.placeholder = placeholder;
        drag.offsetY = drag.startY - rect.top;
        drag.li.classList.add('dragging');
        Object.assign(drag.li.style, { position: 'fixed', boxSizing: 'border-box', left: rect.left + 'px', width: rect.width + 'px',
            top: rect.top + 'px', margin: '0' });
        // a transformed ancestor (the sliding menu) is the containing block of "fixed": correct by what it moved
        const placed = drag.li.getBoundingClientRect();
        drag.fixY = placed.top - rect.top;
        drag.li.style.left = (rect.left - (placed.left - rect.left)) + 'px';
        drag.active = true;
    }
    event.preventDefault();
    drag.li.style.top = (event.clientY - drag.offsetY - drag.fixY) + 'px';
    // near the edge of the scrolling panel: scroll along
    if (drag.scroller !== null) {
        const box = drag.scroller.getBoundingClientRect();
        if (event.clientY < box.top + 32) drag.scroller.scrollTop -= 12;
        else if (event.clientY > box.bottom - 32) drag.scroller.scrollTop += 12;
    }
    // the placeholder goes before the first item whose middle lies below the pointer
    const list = drag.placeholder.parentElement;
    const others = Array.from(list.children).filter(el => el.classList.contains('ti-it') && el !== drag.li);
    const before = others.find(el => {
        const r = el.getBoundingClientRect();
        return event.clientY < r.top + r.height / 2;
    });
    if (before === undefined) {
        if (list.lastElementChild !== drag.placeholder) list.appendChild(drag.placeholder);
    } else if (drag.placeholder.nextElementSibling !== before) {
        list.insertBefore(drag.placeholder, before);
    }
}

function onTopicGripUp(event) {
    if (gTopicDrag === null || event.pointerId !== gTopicDrag.pointerId) return;
    endTopicDrag(event.type === 'pointerup');
}

/* drop: the index of the placeholder among the open items (the dragged one left out) -> topic_item_move.php */
function endTopicDrag(drop) {
    const drag = gTopicDrag;
    if (drag === null) return;
    gTopicDrag = null;
    if (drag.grip.hasPointerCapture(drag.pointerId)) drag.grip.releasePointerCapture(drag.pointerId);
    if (!drag.active) return; // a press without moving: nothing happens
    const list = drag.placeholder.parentElement;
    const to = Array.from(list.children).filter(el => el !== drag.li && (el.classList.contains('ti-it')
        || el === drag.placeholder)).indexOf(drag.placeholder);
    drag.placeholder.remove();
    drag.li.classList.remove('dragging');
    drag.li.removeAttribute('style');
    if (drop && to >= 0 && to !== drag.from) {
        moveTopicItem(drag.from, to);
    } else {
        renderTopicMenu(true);
    }
    const grip = document.querySelector('#ti_open .ti-grip[data-ti-id="' + drag.id + '"]');
    if (grip !== null) focusQuietly(grip);
}

/* ---------- the topics menu ---------- */

/* the tabs Note · Items · Done (S1c) with their counters, the open items and the done items. force: also while the
 * item form is open */
function renderTopicMenu(force = false) {
    const single = document.getElementById('topic_single');
    const list = document.getElementById('topic_list');
    const doneBox = document.getElementById('topic_done');
    const tabs = document.getElementById('topic_tabs');
    if (single === null || list === null || doneBox === null || tabs === null) return;
    const label = single.querySelector('label.lab');
    const labelText = topicHasItems() ? 'Note for everyone (optional, Markdown works)'
        : 'What are you estimating? (optional, Markdown works)';
    if (label !== null && label.textContent !== labelText) label.textContent = labelText;

    tabs.hidden = gTopicItems === null;
    const noteAdd = document.getElementById('topic_note_add');
    if (noteAdd !== null) {
        noteAdd.hidden = gTopicItems === null;
        noteAdd.disabled = !!(gTopicItems && gTopicLists && gTopicLists.limits
            && gTopicItems.open_count >= gTopicLists.limits.open);
    }
    if (gTopicItems === null) {
        // an old server: the note alone
        if (gTopicTab !== 'note') showMenuTab(document.getElementById('topic_box'), 'note');
        gTopicMenuKey = '';
        return;
    }
    setTextIfChanged(document.getElementById('topic_n_open'), String(gTopicItems.open_count));
    setTextIfChanged(document.getElementById('topic_n_done'), String(gTopicItems.done_count));
    // Andreas: "Done 0" is inactive (no click, skipped by the arrow keys); the open Done tab emptied -> Items (or Note)
    const doneTab = document.getElementById('topic_tab_done');
    const noDone = gTopicItems.done_count === 0;
    if (doneTab !== null && (doneTab.getAttribute('aria-disabled') === 'true') !== noDone) {
        if (noDone) doneTab.setAttribute('aria-disabled', 'true'); else doneTab.removeAttribute('aria-disabled');
    }
    if (noDone && gTopicTab === 'done') {
        const box = document.getElementById('topic_box');
        const hadFocus = box !== null && box.contains(document.activeElement)
            && (doneBox.contains(document.activeElement) || document.activeElement === doneTab);
        showMenuTab(box, gTopicItems.open_count > 0 ? 'open' : 'note', hadFocus); // -> onTopicTab() renders
        return;
    }
    if (!force && (gTopicEditor !== null || gTopicDrag !== null)) return;
    const key = JSON.stringify([gTopicItems, gTopicLists, gTopicLoad !== null, gTopicLoadError, gTopicEditor,
        gTopicConfirmDelete, [...gTopicDistOpen], gTopicTab]);
    if (!force && key === gTopicMenuKey) return;
    gTopicMenuKey = key;

    const focus = document.activeElement;
    const focusBox = [list, doneBox].find(box => focus && box.contains(focus)) || null;
    const focusAct = focusBox !== null && focus.dataset ? focus.dataset.tiAct : null;
    const focusId = focusAct ? focus.dataset.tiId : null;
    list.replaceChildren(...topicOpenParts());
    doneBox.replaceChildren(...topicDoneParts());
    if (focusAct) restoreTopicFocus(focusBox, focusAct, focusId);
}

function setTextIfChanged(element, text) {
    if (element !== null && element.textContent !== text) element.textContent = text;
}

function restoreTopicFocus(box, act, id) {
    const sel = id ? '[data-ti-id="' + id + '"]' : '';
    let element = box.querySelector('[data-ti-act="' + act + '"]' + sel + ':not([disabled])')
        || (id ? box.querySelector('[data-ti-act]' + sel + ':not([disabled])') : null)
        || box.querySelector('[data-ti-act="add"]')
        || document.querySelector('#topic_tabs [aria-selected="true"]');
    if (element !== null) element.focus({ preventScroll: true });
}

/* while the lists load (or failed): one line instead of the list */
function topicLoadState() {
    if (gTopicLoadError && gTopicLoad === null) {
        const p = textElement('p', 'hint ti-load', 'The items could not be loaded. ');
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'ti-link';
        retry.dataset.tiAct = 'retry';
        retry.textContent = 'Try again';
        p.appendChild(retry);
        return p;
    }
    return textElement('p', 'hint ti-load', 'Loading items …');
}

/* the tab "Items": the open items (the active one on top) and "+ Add item" */
function topicOpenParts() {
    const summary = gTopicItems;
    const lists = gTopicLists;
    const has = topicHasItems();
    const parts = [];

    if (summary.open_count > 0) {
        const head = document.createElement('div');
        head.className = 'ti-head';
        head.appendChild(textElement('span', 'ti-note', 'The top item is shown to everyone.'));
        parts.push(head);
        if (lists === null) parts.push(topicLoadState());
    }

    const ol = document.createElement('ol');
    ol.className = 'ti-items';
    ol.id = 'ti_open';
    const open = lists !== null && summary.open_count > 0 ? lists.open : [];
    open.forEach((item, index) => {
        ol.appendChild(gTopicEditor !== null && gTopicEditor.id === item.id
            ? topicEditorRow(item) : topicItemRow(item, index, open.length));
    });
    if (gTopicEditor !== null && gTopicEditor.id === 'new') ol.appendChild(topicEditorRow(null));
    if (ol.childNodes.length > 0) parts.push(ol);

    if (gTopicEditor === null || gTopicEditor.id !== 'new') {
        if (has && summary.open_count === 0) {
            parts.push(textElement('p', 'hint ti-empty', 'No open items. Add one, or reopen one under “Done”.'));
        }
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'ti-add';
        add.id = 'ti_add';
        add.dataset.tiAct = 'add';
        add.append(iconSvg('plus'), 'Add item');
        add.disabled = !!(lists && lists.limits && summary.open_count >= lists.limits.open);
        parts.push(add);
        if (!has) parts.push(textElement('p', 'hint ti-add-hint', 'Several topics? Add them as items and go through them one by one.'));
    }
    return parts;
}

/* the tab "Done": the history (loaded when the tab opens) */
function topicDoneParts() {
    const summary = gTopicItems;
    const lists = gTopicLists;
    if (summary.done_count === 0) {
        return [textElement('p', 'hint ti-empty', 'Nothing done yet. Items you close show up here.')];
    }
    const done = lists !== null && gTopicListsDone && Array.isArray(lists.done) ? lists.done : null;
    if (done === null) return [topicLoadState()];
    const parts = [];
    const ul = document.createElement('ul');
    ul.className = 'ti-done';
    ul.id = 'ti_done';
    done.forEach(item => ul.appendChild(gTopicEditor !== null && gTopicEditor.id === item.id
        ? topicEditorRow(item) : topicDoneRow(item)));
    parts.push(ul);
    if (summary.done_count > done.length) {
        parts.push(textElement('p', 'hint', 'The latest ' + done.length + ' of ' + summary.done_count + ' done items.'));
    }
    parts.push(topicExportRow());
    return parts;
}

function topicItemRow(item, index, count) {
    const li = document.createElement('li');
    li.className = 'ti-it' + (index === 0 ? ' now' : '');
    li.dataset.id = String(item.id);
    const main = document.createElement('span');
    main.className = 'ti-main';
    const l1 = document.createElement('span');
    l1.className = 'ti-l1';
    if (index === 0) l1.appendChild(textElement('span', 'ti-tag', 'now'));
    if (item.ext_id) l1.appendChild(textElement('span', 'ti-ext', item.ext_id));
    const badge = maturityBadge(item.maturity);
    if (badge !== null) l1.appendChild(badge);
    if (l1.childNodes.length > 0) main.appendChild(l1);
    const heading = textElement('span', 'ti-h', item.heading);
    heading.title = item.heading;
    main.appendChild(heading);

    const acts = document.createElement('span');
    acts.className = 'ti-acts';
    acts.appendChild(iconButton('pen', 'Edit: ' + item.heading, 'edit', item.id));
    acts.appendChild(topicDeleteButton(item));
    // the grip in front: drag (mouse, touch, pen) or the arrow keys up/down (Andreas: instead of the arrow buttons)
    const grip = iconButton('grip', 'Move item: ' + item.heading, 'grip', item.id);
    grip.classList.add('ti-grip');
    grip.title = 'Drag to move';
    grip.setAttribute('aria-describedby', 'ti_grip_hint');
    li.append(grip, main, acts);
    return li;
}

function topicDeleteButton(item) {
    if (gTopicConfirmDelete === item.id) {
        const sure = document.createElement('button');
        sure.type = 'button';
        sure.className = 'btn-box danger ti-del-sure';
        sure.dataset.tiAct = 'delete-sure';
        sure.dataset.tiId = String(item.id);
        sure.setAttribute('aria-label', 'Delete for good: ' + item.heading);
        sure.textContent = 'Delete';
        return sure;
    }
    return iconButton('trash', 'Delete: ' + item.heading, 'delete', item.id);
}

/* the cards of a distribution with votes, in deck order where known */
function topicDistKeys(distribution) {
    const keys = Object.keys(distribution || {}).filter(key => distribution[key] > 0);
    const order = gDeck ? gDeck.cards.map(card => card.key) : [];
    const rank = key => (order.indexOf(key) < 0 ? 999 : order.indexOf(key));
    return keys.sort((a, b) => rank(a) - rank(b));
}

/* the columns of a done item's spread (Andreas, after the staging test: like the spread of the results panel).
 * An item does not keep its deck. So: every card of the current deck (also those without votes, as in the
 * spread) when it still holds every played card; else the deck has changed since, and the played cards alone
 * tell the most, in catalog order (sort_order: the order of gCardByKey) – a different deck around them would
 * only mislead. */
function topicDistColumnKeys(distribution) {
    const played = topicDistKeys(distribution);
    const deck = gDeck ? gDeck.cards.map(card => card.key) : [];
    if (deck.length > 0 && played.every(key => deck.includes(key))) return deck;
    const order = [...gCardByKey.keys()];
    const rank = key => (order.indexOf(key) < 0 ? order.length : order.indexOf(key));
    return played.sort((a, b) => rank(a) - rank(b));
}

/* the spread of a done item: the columns of the results panel's spread (spreadColumn, setSpreadSegments in
 * script.js): a column per card (topicDistColumnKeys), a block per vote, the count above, the card below; the
 * agreed value marked like the current estimate (.est), without one the most chosen card(s) as in the spread
 * (.top). No motion: the blocks are there when it unfolds. The columns share the menu's width (style.css). */
function topicDistView(item) {
    const distribution = item.distribution || {};
    const keys = topicDistColumnKeys(distribution);
    const votes = key => (distribution[key] > 0 ? distribution[key] : 0);
    const total = keys.reduce((sum, key) => sum + votes(key), 0);
    const top = Math.max(0, ...keys.map(votes));
    const estMarked = item.result_card_key !== null && keys.includes(item.result_card_key);
    const bars = document.createElement('div');
    bars.className = 'spread-bars ti-dist no-anim';
    bars.id = 'ti_dist_' + item.id;
    bars.style.setProperty('--voters', String(Math.max(1, total)));
    keys.forEach(key => {
        const card = cardByKey(key);
        const n = votes(key);
        const col = spreadColumn(card, key);
        bars.appendChild(col);
        col.classList.toggle('zero', n === 0);
        col.classList.toggle('est', estMarked && item.result_card_key === key);
        col.classList.toggle('top', !estMarked && n > 1 && n === top);
        col.querySelector('.spread-count').textContent = n > 0 ? String(n) : '';
        setSpreadSegments(col.querySelector('.spread-bar'), n).forEach(seg => {
            seg.classList.remove('in');
            seg.style.transitionDelay = '';
        });
        const name = card ? cardName(card) : key;
        col.title = name + ': ' + n + (n === 1 ? ' vote' : ' votes');
        col.appendChild(textElement('span', 'sr-only', name + ': ' + n + (n === 1 ? ' vote' : ' votes')
            + (estMarked && item.result_card_key === key ? ', agreed' : '')));
    });
    return bars;
}

/* a date of the API -> a Date (null if unknown): see topicDate() */
function topicParseDate(value) {
    if (typeof value !== 'string') return null;
    let date;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(value)) {
        date = new Date(value);
    } else {
        const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
        if (m === null) return null;
        date = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    }
    return isNaN(date.getTime()) ? null : date;
}

/* a Date -> 'YYYY-MM-DD' in local time */
function isoLocalDate(date) {
    const pad = n => String(n).padStart(2, '0');
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

/* a date of the API -> a short local date ("12 Nov"; other years with the year), '' if unknown. S1c: ISO 8601 in UTC
 * ("2026-11-12T14:03:00Z", or with an offset) -> new Date() puts it into the browser's time zone; the former
 * 'YYYY-MM-DD hh:mm:ss' (no zone) is read as local time */
function topicDate(value) {
    const date = topicParseDate(value);
    if (date === null) return { short: '', long: '' };
    const sameYear = date.getFullYear() === new Date().getFullYear();
    const short = date.toLocaleDateString(undefined, sameYear ? { day: 'numeric', month: 'short' }
        : { day: 'numeric', month: 'short', year: 'numeric' });
    const long = date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    return { short, long };
}

/* a done item (history): heading; agreed value (only if there is one), rounds, date of the last round, the spread
 * behind a triangle (a disclosure); delete, reopen. No pen (Andreas): a done item is changed after "reopen" */
function topicDoneRow(item) {
    const li = document.createElement('li');
    li.dataset.id = String(item.id);
    const line = document.createElement('span');
    line.className = 'ti-h';
    if (item.ext_id) line.appendChild(textElement('span', 'ti-ext', item.ext_id + ' '));
    line.appendChild(textElement('b', '', item.heading));
    line.title = item.heading;

    const hasDist = topicDistKeys(item.distribution).length > 0;
    const open = hasDist && gTopicDistOpen.has(item.id);
    const sum = document.createElement(hasDist ? 'button' : 'span');
    sum.className = 'ti-hist';
    if (hasDist) {
        sum.type = 'button';
        sum.dataset.tiAct = 'dist';
        sum.dataset.tiId = String(item.id);
        sum.setAttribute('aria-expanded', open ? 'true' : 'false');
        sum.setAttribute('aria-controls', 'ti_dist_' + item.id);
        sum.title = open ? 'Hide the spread' : 'Show the spread';
        const tri = svgEl('svg', { class: 'ti-tri', width: 8, height: 8, viewBox: '0 0 8 8', 'aria-hidden': 'true' });
        tri.appendChild(svgEl('polygon', { points: '1,0 7,4 1,8' }));
        sum.appendChild(tri);
    }
    if (item.result_card_key !== null) {
        const card = cardByKey(item.result_card_key);
        const value = document.createElement('b');
        value.className = 'ti-res-val';
        value.appendChild(card ? cardSmall(card) : document.createTextNode(item.result_card_key));
        const res = document.createElement('span');
        res.className = 'ti-res';
        res.append(textElement('span', 'ti-res-lab', 'agreed'), value);
        sum.appendChild(res);
    }
    const rounds = item.rounds_cnt === 1 ? '1 round' : (item.rounds_cnt > 0 ? item.rounds_cnt + ' rounds' : 'no round');
    sum.appendChild(textElement('span', 'ti-rounds', rounds));
    const date = topicDate(item.last_round_date);
    if (date.short !== '') {
        const time = textElement('span', 'ti-date', date.short);
        time.title = 'Last round: ' + date.long;
        sum.appendChild(time);
    }

    const l2 = document.createElement('span');
    l2.className = 'ti-l2';
    const grow = document.createElement('span');
    grow.className = 'ti-grow';
    const reopen = document.createElement('button');
    reopen.type = 'button';
    reopen.className = 'ti-link';
    reopen.dataset.tiAct = 'reopen';
    reopen.dataset.tiId = String(item.id);
    reopen.title = 'Back to the open items, right after the current one';
    reopen.setAttribute('aria-label', 'Reopen: ' + item.heading);
    reopen.append(iconSvg('reset'), 'reopen');
    l2.append(sum, grow, topicDeleteButton(item), reopen);
    li.append(line, l2);
    if (hasDist) {
        const dist = topicDistView(item);
        dist.hidden = !open;
        li.appendChild(dist);
    }
    return li;
}

/* ---------- B-52 export (Andreas, 2026-11-10/12): the done items as a table, for Jira, Linear, a spreadsheet ----------
 * Two buttons below the done list: "Copy" (tab separated with a header row, pastes into Excel, Google Sheets, Jira
 * tables) and "Download CSV" (topics-YYYY-MM-DD.csv, UTF-8 with BOM, comma separated, RFC 4180 quoting). All done items
 * (not only the loaded page): get_topics.php?done=1 page by page. Everything stays in the browser.
 * Order: chronological by closing, the oldest first – pasted into a backlog or a sheet, the rows then follow the
 * order in which the team estimated them (and new exports append at the end); the list in the menu shows the newest
 * first because there the latest result matters. */
const TOPIC_EXPORT_PAGE = 100;   // TOPIC_DONE_PAGE_MAX in api/lib_topics.php
const TOPIC_EXPORT_MAX = 1000;   // TOPIC_ITEMS_TOTAL_MAX: no team has more
const TOPIC_EXPORT_HEAD = ['ID', 'Heading', 'Description', 'Agreed value', 'Rounds', 'Last round', 'Maturity'];
let gTopicExportBusy = false; // false, or 'copy' | 'csv' while that export loads

function topicExportRow() {
    const row = document.createElement('div');
    row.className = 'ti-export'; // quiet text buttons like "reopen" in the rows (style.css "B-52 export")
    const button = (act, icon, label, title) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ti-link';
        b.id = 'ti_export_' + act;
        b.dataset.tiAct = act;
        b.title = title;
        if (gTopicExportBusy === act) b.setAttribute('aria-busy', 'true');
        b.append(iconSvg(icon), label);
        return b;
    };
    row.append(button('copy', 'copy', 'Copy', 'Copy all done items as a table (paste into a spreadsheet or Jira)'),
        button('csv', 'down', 'Download CSV', 'Download all done items as a CSV file'));
    return row;
}

/* all done items of the team, oldest first (by done_date, then id) */
async function loadAllDoneItems() {
    const byId = new Map();
    // the next page from where the last one ended; done when a page is empty or all done items are there
    for (let offset = 0; offset < TOPIC_EXPORT_MAX;) {
        const query = new URLSearchParams({ t: t, done: '1', done_offset: String(offset),
            done_limit: String(TOPIC_EXPORT_PAGE) });
        const response = await fetch('./api/get_topics.php?' + query.toString(), { cache: 'no-store' });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const lists = await response.json();
        if (lists === null || typeof lists !== 'object' || !Array.isArray(lists.done)) throw new Error('lists');
        lists.done.forEach(item => byId.set(item.id, item)); // an item closed meanwhile shifts the pages: no doubles
        offset += lists.done.length;
        if (lists.done.length === 0 || offset >= lists.done_count) break;
    }
    const time = item => {
        const date = topicParseDate(item.done_date);
        return date === null ? 0 : date.getTime();
    };
    return [...byId.values()].sort((a, b) => time(a) - time(b) || a.id - b.id);
}

/* the agreed value as text: what the card shows (its text), else its name; '' without one */
function topicExportValue(key) {
    if (key === null || key === undefined) return '';
    const card = cardByKey(key);
    if (!card) return String(key);
    return String(card.text || card.label || cardName(card) || key);
}

/* the rows of the table: the header row and one row per item (plain strings) */
function topicExportRows(items) {
    const rows = [TOPIC_EXPORT_HEAD];
    items.forEach(item => {
        const date = topicParseDate(item.last_round_date);
        rows.push([
            item.ext_id || '',
            item.heading || '',
            item.description || '',
            topicExportValue(item.result_card_key),
            String(item.rounds_cnt || 0),
            date === null ? '' : isoLocalDate(date),
            maturityValid(item.maturity) ? MATURITY_STAGES[item.maturity] : '',
        ]);
    });
    return rows;
}

/* CSV injection: a cell a spreadsheet would read as a formula gets a leading apostrophe */
function topicExportSafe(cell) {
    return /^[=+\-@\t\r]/.test(cell) ? "'" + cell : cell;
}

/* a cell in quotes when it holds the separator, a quote or a line break ("" for a quote) */
function topicExportQuote(cell, separator) {
    const safe = topicExportSafe(cell);
    return safe.includes(separator) || /["\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}

function topicExportText(rows, separator) {
    return rows.map(row => row.map(cell => topicExportQuote(cell, separator)).join(separator)).join('\r\n') + '\r\n';
}

const topicExportCount = n => n + (n === 1 ? ' item' : ' items');

/* "Copy" / "Download CSV": loads all done items, then copies or downloads them; a toast confirms */
function exportDoneItems(kind) {
    if (gTopicExportBusy !== false) return; // one at a time; the button stays focusable (aria-busy, no disabled)
    gTopicExportBusy = kind;
    const button = document.getElementById('ti_export_' + kind);
    if (button !== null) button.setAttribute('aria-busy', 'true');
    const loaded = loadAllDoneItems();
    let done;
    if (kind === 'copy') {
        const text = loaded.then(items => topicExportText(topicExportRows(items), '\t'));
        done = copyExportText(text).then(() => loaded).then(items => {
            showToast('Copied ' + topicExportCount(items.length));
        }, () => showToast('Not copied – try “Download CSV”', DECK_TOAST_MS, 'error'));
    } else {
        done = loaded.then(items => {
            const name = 'topics-' + isoLocalDate(new Date()) + '.csv';
            downloadExport(name, '﻿' + topicExportText(topicExportRows(items), ','));
            showToast('Downloaded ' + name + ' (' + topicExportCount(items.length) + ')');
        }, () => showToast('Not loaded – please try again', DECK_TOAST_MS, 'error'));
    }
    done.finally(() => {
        gTopicExportBusy = false;
        const again = document.getElementById('ti_export_' + kind);
        if (again !== null) again.removeAttribute('aria-busy');
    });
}

/* the text into the clipboard. Safari allows the write only during the click: a ClipboardItem with the promise of the
 * text is handed over at once; where that fails (older browsers), writeText() once the text is there */
function copyExportText(textPromise) {
    const clipboard = navigator.clipboard;
    if (!clipboard) return Promise.reject(new Error('no clipboard'));
    if (typeof ClipboardItem === 'function' && typeof clipboard.write === 'function') {
        let item;
        try {
            item = new ClipboardItem({ 'text/plain': textPromise.then(text => new Blob([text], { type: 'text/plain' })) });
        } catch (e) {
            item = null;
        }
        if (item !== null) {
            return clipboard.write([item]).catch(() => textPromise.then(text => clipboard.writeText(text)));
        }
    }
    return textPromise.then(text => clipboard.writeText(text));
}

function downloadExport(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function labelled(labelText, field) {
    const span = document.createElement('span');
    span.className = 'ti-field';
    const label = textElement('label', 'lab', labelText);
    label.htmlFor = field.id;
    span.append(label, field);
    return span;
}

function topicEditorRow(item) {
    const limits = (gTopicLists && gTopicLists.limits) || { ext_id: 20, heading: 200, description: 2000 };
    const li = document.createElement('li');
    li.className = 'ti-it editing';
    const form = document.createElement('form');
    form.className = 'ti-form';
    form.id = 'ti_form';
    form.noValidate = true;
    form.setAttribute('aria-label', item === null ? 'New item' : 'Edit item');

    const ext = document.createElement('input');
    ext.id = 'ti_ext';
    ext.className = 'field';
    ext.maxLength = limits.ext_id;
    ext.placeholder = 'e.g. PAY-150';
    ext.autocomplete = 'off';
    ext.value = item && item.ext_id ? item.ext_id : '';
    const heading = document.createElement('input');
    heading.id = 'ti_heading';
    heading.className = 'field';
    heading.maxLength = limits.heading;
    heading.required = true;
    heading.autocomplete = 'off';
    heading.value = item ? item.heading : '';
    const grid = document.createElement('div');
    grid.className = 'ti-grid';
    grid.append(labelled('ID (optional)', ext), labelled('Heading', heading));

    const desc = document.createElement('textarea');
    desc.id = 'ti_desc';
    desc.className = 'field';
    desc.rows = 3;
    desc.maxLength = limits.description;
    desc.value = item && item.description ? item.description : '';

    const fieldset = MATURITY_INPUT ? maturityFieldset(item) : null;

    const error = textElement('p', 'hint ti-error', '');
    error.id = 'ti_error';
    error.setAttribute('role', 'alert');
    const row = document.createElement('div');
    row.className = 'row end';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn-box';
    cancel.dataset.tiAct = 'cancel';
    cancel.textContent = 'Cancel';
    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'btn-box primary';
    save.id = 'ti_save';
    save.textContent = 'Save';
    row.append(cancel, save);

    form.append(grid, labelled('Description (optional, Markdown works)', desc));
    if (fieldset !== null) form.appendChild(fieldset);
    form.append(error, row);
    form.addEventListener('submit', event => {
        event.preventDefault();
        saveTopicEditor(item);
    });
    li.appendChild(form);
    return li;
}

/* the maturity input of the item form (hidden for now, MATURITY_INPUT) */
function maturityFieldset(item) {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'f ti-mat-field';
    fieldset.appendChild(textElement('legend', 'lab', 'Maturity (optional)'));
    const seg = document.createElement('div');
    seg.className = 'seg ti-seg';
    const current = item && maturityValid(item.maturity) ? String(item.maturity) : '';
    [['', 'not set']].concat(MATURITY_STAGES.map((name, i) => [String(i), name])).forEach(([value, name]) => {
        const label = document.createElement('label');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'ti_mat';
        radio.value = value;
        radio.checked = value === current;
        label.append(radio, textElement('span', '', name));
        seg.appendChild(label);
    });
    const matHint = textElement('p', 'hint ti-mat-hint', current === '' ? '' : MATURITY_TEXTS[+current]);
    matHint.id = 'ti_mat_hint';
    seg.addEventListener('change', event => {
        const v = event.target.value;
        matHint.textContent = v === '' ? '' : MATURITY_TEXTS[+v];
    });
    fieldset.append(seg, matHint);
    return fieldset;
}

function saveTopicEditor(item) {
    const heading = document.getElementById('ti_heading');
    const error = document.getElementById('ti_error');
    if (heading.value.trim() === '') {
        heading.setAttribute('aria-invalid', 'true');
        error.textContent = 'Please enter a heading.';
        heading.focus();
        return;
    }
    // without the input no maturity is sent: add = not set, edit = unchanged
    const checked = document.querySelector('#ti_form input[name="ti_mat"]:checked');
    const maturity = checked ? { maturity: checked.value } : {};
    const form = {
        heading: heading.value,
        description: document.getElementById('ti_desc').value,
        ext_id: document.getElementById('ti_ext').value,
    };
    const save = document.getElementById('ti_save');
    save.disabled = true;
    const request = item === null
        ? topicWrite('topic_item_add.php', Object.assign({ at: 'end' }, maturity), form)
        : topicWrite('topic_item_edit.php', Object.assign({ item: item.id }, maturity), form);
    request.then(response => {
        if (response !== null && response.ok) {
            gTopicEditor = null;
            renderTopicMenu(true);
            const target = item === null ? document.getElementById('ti_add')
                : document.querySelector('#topic_box [data-ti-act="edit"][data-ti-id="' + item.id + '"]');
            if (target !== null) target.focus({ preventScroll: true });
        } else if (document.getElementById('ti_save') !== null) {
            document.getElementById('ti_save').disabled = false;
        }
    });
    measureEvent(item === null ? 'TOPIC_ITEM_ADDED' : 'TOPIC_ITEM_EDITED');
}

function openTopicEditor(id) {
    gTopicEditor = { id };
    gTopicConfirmDelete = null;
    renderTopicMenu(true);
    const heading = document.getElementById('ti_heading');
    if (heading !== null) {
        heading.focus();
        heading.scrollIntoView({ block: 'nearest' });
    }
}

function onTopicListClick(event) {
    const button = event.target instanceof Element ? event.target.closest('[data-ti-act]') : null;
    if (button === null || button.disabled) return;
    const act = button.dataset.tiAct;
    const id = button.dataset.tiId ? Number(button.dataset.tiId) : null;
    if (act !== 'delete-sure' && act !== 'delete') gTopicConfirmDelete = null;
    if (act === 'add') {
        openTopicEditor('new');
    } else if (act === 'cancel') {
        const wasNew = gTopicEditor !== null && gTopicEditor.id === 'new';
        const editedId = gTopicEditor !== null ? gTopicEditor.id : null;
        gTopicEditor = null;
        renderTopicMenu(true);
        const target = wasNew ? document.getElementById('ti_add')
            : document.querySelector('#topic_box [data-ti-act="edit"][data-ti-id="' + editedId + '"]');
        if (target !== null) focusQuietly(target);
    } else if (act === 'edit') {
        openTopicEditor(id);
    } else if (act === 'delete') {
        gTopicConfirmDelete = id;
        renderTopicMenu(true);
        const sure = document.querySelector('#topic_box [data-ti-act="delete-sure"]');
        if (sure !== null) sure.focus();
    } else if (act === 'delete-sure') {
        gTopicConfirmDelete = null;
        topicWrite('topic_item_delete.php', { item: id });
        measureEvent('TOPIC_ITEM_DELETED');
    } else if (act === 'reopen') {
        topicWrite('topic_item_reopen.php', { item: id, at: 'next' });
        measureEvent('TOPIC_ITEM_REOPENED');
    } else if (act === 'dist') {
        if (gTopicDistOpen.has(id)) gTopicDistOpen.delete(id); else gTopicDistOpen.add(id);
        renderTopicMenu(true);
    } else if (act === 'copy' || act === 'csv') {
        exportDoneItems(act);
    } else if (act === 'retry') {
        gTopicLoadError = false;
        gTopicListsFor = null;
        loadTopicLists();
        renderTopicMenu(true);
    }
}

/* the red "Delete" of an item is on screen (the menu open) */
function topicConfirmShown() {
    if (gTopicConfirmDelete === null) return false;
    const sure = document.querySelector('#topic_box .ti-del-sure');
    return sure !== null && sure.getClientRects().length > 0;
}

/* cancels the red "Delete": the trash can again, focused (keyboard: with ring, else quietly), unless the focus went
 * on to something else (a field, a tab) */
function cancelTopicDelete(keyboard) {
    const id = gTopicConfirmDelete;
    const active = document.activeElement;
    const elsewhere = active !== null && active !== document.body && !active.matches('.ti-del-sure')
        && active.closest('#topic_box') !== null && !active.matches('dialog, [role="tabpanel"]');
    gTopicConfirmDelete = null;
    renderTopicMenu(true);
    if (elsewhere) return;
    const trash = document.querySelector('#topic_box [data-ti-act="delete"][data-ti-id="' + id + '"]');
    if (trash === null || trash.getClientRects().length === 0) return;
    if (keyboard) trash.focus(); else focusQuietly(trash);
}

/* the topics menu is opened (prepareMenuSection in script_feedback.js): the start tab (an opener's wish, else "Items"
 * while items are open, else "Note"), the lists fresh */
function prepareTopicMenu() {
    gTopicEditor = null;
    gTopicConfirmDelete = null;
    let tab = gTopicNextTab || (gTopicItems !== null && gTopicItems.open_count > 0 ? 'open' : 'note');
    gTopicNextTab = null;
    if (gTopicItems === null) tab = 'note';
    showMenuTab(document.getElementById('topic_box'), tab); // -> onTopicTab()
    renderTopicMenu(true);
    loadTopicLists(true);
}

/* a tab of the topics menu is shown (showMenuTab in script_feedback.js) */
function onTopicTab(name) {
    if (gTopicTab === name) return;
    gTopicTab = name;
    gTopicConfirmDelete = null;
    renderTopicMenu(true);
    loadTopicLists(true);
}

/* where the focus goes when the topics menu opens: the note field on "Note" (as before), else the chosen tab */
function topicMenuFocus() {
    if (gTopicTab === 'note') return document.getElementById('topic_txt');
    return document.querySelector('#topic_tabs [aria-selected="true"]');
}

function initTopicItems() {
    const topic = document.getElementById('topic');
    if (topic !== null) topic.addEventListener('click', onTopicViewClick);
    [document.getElementById('topic_list'), document.getElementById('topic_done')].forEach(list => {
        if (list === null) return;
        list.addEventListener('click', onTopicListClick);
        list.addEventListener('keydown', onTopicGripKey);
        list.addEventListener('pointerdown', onTopicGripDown);
        list.addEventListener('pointermove', onTopicGripMove);
        list.addEventListener('pointerup', onTopicGripUp);
        list.addEventListener('pointercancel', onTopicGripUp);
        list.addEventListener('lostpointercapture', onTopicGripUp);
    });
    // the red "Delete" asks: Escape (before the menu's own Escape, which skips a handled one) and a click beside it
    // cancel; the focus goes back to the trash can. A tab change cancels in onTopicTab().
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || event.defaultPrevented || !topicConfirmShown()) return;
        event.preventDefault();
        cancelTopicDelete(true);
    }, true);
    document.addEventListener('click', event => {
        if (!topicConfirmShown()) return;
        const target = event.target instanceof Element ? event.target : null;
        // a button of the lists is handled by onTopicListClick (another trash can, the "Delete" itself, …); it may be
        // gone already (the lists render anew), so no check for its list
        if (target !== null && target.closest('[data-ti-act]') !== null) return;
        cancelTopicDelete(event.detail === 0);
    });
    const bars = document.getElementById('spread_bars');
    if (bars !== null) {
        bars.addEventListener('click', onSpreadPick);
        bars.addEventListener('keydown', onSpreadPick);
    }
    const select = document.getElementById('spread_est_sel');
    if (select !== null) select.addEventListener('change', () => setTopicResult(select.value));
    // the openers ask for their tab (before the menu's own click handler on the document)
    const noteEdit = document.getElementById('board_note_edit');
    if (noteEdit !== null) noteEdit.addEventListener('click', () => { gTopicNextTab = 'note'; });
    const itemEdit = document.querySelector('.topic-bar .topic-edit');
    if (itemEdit !== null) itemEdit.addEventListener('click', () => { gTopicNextTab = 'open'; });
    // "+ Add item" below the note: to "Items", the form open there
    const noteAdd = document.getElementById('topic_note_add');
    if (noteAdd !== null) noteAdd.addEventListener('click', () => {
        showMenuTab(document.getElementById('topic_box'), 'open');
        openTopicEditor('new');
    });
    const noteMore = document.getElementById('board_note_more');
    if (noteMore !== null) noteMore.addEventListener('click', toggleBoardNote);
    initLeaveItem();
    window.addEventListener('resize', () => requestAnimationFrame(() => {
        updateTopicMoreButton();
        syncBoardNoteMore();
    }));
}

document.addEventListener('DOMContentLoaded', initTopicItems);
