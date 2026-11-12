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


let gTopicItems = null;       // dao topic_items (the summary); null: the note only (old server)
let gTopicLists = null;       // the last answer of get_topics.php {topics_rev, open, open_count, done_count, limits, done?}
let gTopicListsFor = null;    // the dao topics_rev the lists were asked for (compared for inequality only)
let gTopicListsDone = false;  // the lists were asked for with the done items
let gTopicLoad = null;        // { seq } while a get_topics.php request runs
let gTopicLoadAgain = false;  // another load was asked for while one ran
let gTopicLoadSeq = 0;
let gTopicLoadError = false;  // the last load failed (the menu offers "Try again")
let gTopicEditor = null;      // { id: number | 'new' } while the item form is open in the menu
let gTopicConfirmDelete = null; // id of the item whose trash can asks "Delete?"
let gTopicDistOpen = new Set(); // ids of done items whose spread is unfolded
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

/* called by updateDom() before updateSide(): the note as before; with an active item the item and the note below it */
function updateTopicView(json) {
    gTopicItems = validTopicItems(json.topic_items) ? json.topic_items : null;
    gTopic = json.topic;
    gTopicRevealed = json.all_players_ready && json.players_count > 0;
    const topic = document.getElementById('topic');
    const label = document.querySelector('.topic-bar .topic-label');
    const edit = document.querySelector('.topic-bar .topic-edit');
    const item = activeTopicItem();

    if (item === null) {
        // as before S1: the note (markdown), no bar without one
        const key = 's:' + json.topic;
        if (gTopicViewKey !== key) {
            gTopicViewKey = key;
            const hash = json.topic.hashCode().toString();
            topic.setAttribute('data-hash', hash);
            topic.classList.remove('ti-view');
            topic.innerHTML = topicMarkdown(json.topic);
            topic.classList.toggle('display_none', hash === '0');
            label.textContent = 'topic';
            edit.setAttribute('aria-label', 'Edit topic');
        }
    } else {
        const key = 'i:' + JSON.stringify([item.id, item.ext_id, item.heading, item.description, item.maturity,
            gTopicItems.open_count, gTopicItems.next_heading, json.topic, gTopicRevealed, gTopicDescMore, gTopicMatOpen]);
        if (gTopicViewKey !== key) {
            gTopicViewKey = key;
            topic.setAttribute('data-hash', key.hashCode().toString());
            topic.classList.add('ti-view');
            topic.replaceChildren(...topicItemView(item, gTopicItems.open_count, gTopicItems.next_heading, json.topic));
            topic.classList.remove('display_none');
            label.textContent = 'item 1 of ' + gTopicItems.open_count;
            edit.setAttribute('aria-label', 'Edit topic and items');
            requestAnimationFrame(updateTopicMoreButton);
        }
    }
    renderTopicMenu();
    loadTopicLists();
    updateNextItemButton(json);
}

function topicItemView(item, openCount, nextHeading, note) {
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
        more.dataset.open = 'topic'; // the menu's own opener handling (script_feedback.js)
        more.setAttribute('aria-controls', 'menu');
        more.textContent = '+' + (openCount - 1) + ' more · next: ' + nextHeading;
        parts.push(more);
    }

    // S1b: the team's note stays visible below the item
    if (note) {
        const box = document.createElement('div');
        box.className = 'ti-note-view';
        box.id = 'ti_note_view';
        box.appendChild(textElement('span', 'ti-note-lab', 'note'));
        const text = document.createElement('div');
        text.className = 'ti-note-md';
        text.innerHTML = topicMarkdown(note);
        box.appendChild(text);
        parts.push(box);
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
    button.title = last ? 'Finish this item – no item after it' : 'Finish this item and go to the next one';
    button.hidden = !show;
    button.closest('.dock').classList.toggle('has-next', show);
}

function nextTopicItem() {
    const item = activeTopicItem();
    if (item === null) return;
    const button = document.getElementById('nextitem_btn');
    const last = button.dataset.last === 'true';
    button.disabled = true;
    gTopicDescMore = false;
    gTopicMatOpen = false;
    // 409 not_active: someone else was quicker; the reload shows the new item
    topicWrite('topic_item_next.php', { item: item.id }, null, [409]).then(() => { button.disabled = false; });
    measureEvent(last ? 'TOPIC_FINISH_ITEM' : 'TOPIC_NEXT_ITEM');
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

/* loads the lists while the topics menu shows them (opening: it is about to), only when the dao topics_rev differs
 * from the rev of the last lists (or the done items are missing). One request at a time; asked again meanwhile, the
 * next follows when it is done. An answer that an own change made outdated (topicListsChanged()) is dropped. */
function loadTopicLists(opening = false) {
    if (gTopicItems === null || !topicHasItems()) return;
    if (!opening && openMenuSection() !== 'topic') return;
    const rev = gTopicItems.topics_rev;
    const done = gTopicItems.done_count > 0;
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

/* ---------- the topics menu ---------- */

/* the note field stays (S1b); below it the items. force: also while the item form is open */
function renderTopicMenu(force = false) {
    const single = document.getElementById('topic_single');
    const list = document.getElementById('topic_list');
    if (single === null || list === null) return;
    const label = single.querySelector('label.lab');
    const labelText = topicHasItems() ? 'Note for everyone (optional, Markdown works)'
        : 'What are you estimating? (optional, Markdown works)';
    if (label !== null && label.textContent !== labelText) label.textContent = labelText;

    list.hidden = gTopicItems === null;
    if (gTopicItems === null) {
        gTopicMenuKey = '';
        return;
    }
    if (!force && gTopicEditor !== null) return;
    const key = JSON.stringify([gTopicItems, gTopicLists, gTopicLoad !== null, gTopicLoadError, gTopicEditor,
        gTopicConfirmDelete, [...gTopicDistOpen]]);
    if (!force && key === gTopicMenuKey) return;
    gTopicMenuKey = key;

    const focus = document.activeElement;
    const focusAct = focus && list.contains(focus) && focus.dataset ? focus.dataset.tiAct : null;
    const focusId = focusAct ? focus.dataset.tiId : null;
    list.replaceChildren(...topicListParts());
    if (focusAct) restoreTopicFocus(list, focusAct, focusId);
}

function restoreTopicFocus(list, act, id) {
    const sel = id ? '[data-ti-id="' + id + '"]' : '';
    let element = list.querySelector('[data-ti-act="' + act + '"]' + sel + ':not([disabled])')
        || (id ? list.querySelector('[data-ti-act]' + sel + ':not([disabled])') : null)
        || list.querySelector('[data-ti-act="add"]');
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

function topicListParts() {
    const summary = gTopicItems;
    const lists = gTopicLists;
    const has = topicHasItems();
    const parts = [];

    if (has) {
        const head = document.createElement('div');
        head.className = 'ti-head';
        head.appendChild(textElement('h3', 'ti-sl', 'items · ' + summary.open_count + ' open'));
        if (summary.open_count > 0) head.appendChild(textElement('span', 'ti-note', 'top item = the one you talk about now'));
        parts.push(head);
    }

    const ol = document.createElement('ol');
    ol.className = 'ti-items';
    ol.id = 'ti_open';
    if (has && lists === null) parts.push(topicLoadState());
    const open = lists !== null && summary.open_count > 0 ? lists.open : [];
    open.forEach((item, index) => {
        ol.appendChild(gTopicEditor !== null && gTopicEditor.id === item.id
            ? topicEditorRow(item) : topicItemRow(item, index, open.length));
    });
    if (gTopicEditor !== null && gTopicEditor.id === 'new') ol.appendChild(topicEditorRow(null));
    if (ol.childNodes.length > 0) parts.push(ol);

    if (gTopicEditor === null || gTopicEditor.id !== 'new') {
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

    if (summary.done_count > 0) {
        const doneHead = document.createElement('div');
        doneHead.className = 'ti-head ti-done-head';
        doneHead.appendChild(textElement('h3', 'ti-sl', 'done · ' + summary.done_count));
        parts.push(doneHead);
        const done = lists !== null && Array.isArray(lists.done) ? lists.done : null;
        if (done === null) {
            if (lists !== null) parts.push(topicLoadState());
        } else {
            const ul = document.createElement('ul');
            ul.className = 'ti-done';
            ul.id = 'ti_done';
            done.forEach(item => ul.appendChild(gTopicEditor !== null && gTopicEditor.id === item.id
                ? topicEditorRow(item) : topicDoneRow(item)));
            parts.push(ul);
            if (summary.done_count > done.length) {
                parts.push(textElement('p', 'hint', 'The latest ' + done.length + ' of ' + summary.done_count + ' done items.'));
            }
        }
    }
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
    const up = iconButton('up', 'Move up: ' + item.heading, 'up', item.id);
    up.disabled = index === 0;
    const down = iconButton('down', 'Move down: ' + item.heading, 'down', item.id);
    down.disabled = index === count - 1;
    const move = document.createElement('span');
    move.className = 'ti-move';
    move.append(up, down);
    acts.append(move, iconButton('pen', 'Edit: ' + item.heading, 'edit', item.id));
    acts.appendChild(topicDeleteButton(item));
    li.append(main, acts);
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

/* the spread of a done item: a bar per played card, the count above, the card below */
function topicDistView(item) {
    const distribution = item.distribution || {};
    const keys = topicDistKeys(distribution);
    const max = Math.max(1, ...keys.map(key => distribution[key]));
    const bars = document.createElement('div');
    bars.className = 'ti-dist';
    bars.id = 'ti_dist_' + item.id;
    keys.forEach(key => {
        const card = cardByKey(key);
        const col = document.createElement('span');
        col.className = 'ti-dist-col' + (item.result_card_key === key ? ' est' : '');
        col.dataset.card = key;
        const name = card ? cardName(card) : key;
        col.title = name + ': ' + distribution[key];
        col.appendChild(textElement('span', 'ti-dist-n', String(distribution[key])));
        const bar = document.createElement('i');
        bar.style.height = Math.max(3, Math.round(distribution[key] / max * 28)) + 'px';
        if (card && card.color) bar.style.setProperty('--c', 'var(--c-' + card.color + ', var(--line-strong))');
        col.appendChild(bar);
        col.appendChild(card ? cardSmall(card, false) : textElement('span', 'sm-text', key));
        col.appendChild(textElement('span', 'sr-only', name + ': ' + distribution[key] + (distribution[key] === 1 ? ' vote' : ' votes')));
        bars.appendChild(col);
    });
    return bars;
}

/* 'YYYY-MM-DD hh:mm:ss' (server time) -> a short local date ("12 Nov"; other years with the year), '' if unknown */
function topicDate(value) {
    const m = typeof value === 'string' ? value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/) : null;
    if (m === null) return { short: '', long: '' };
    const date = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    if (isNaN(date.getTime())) return { short: '', long: '' };
    const sameYear = date.getFullYear() === new Date().getFullYear();
    const short = date.toLocaleDateString(undefined, sameYear ? { day: 'numeric', month: 'short' }
        : { day: 'numeric', month: 'short', year: 'numeric' });
    const long = date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    return { short, long };
}

/* a done item (history): heading; agreed value (only if there is one), rounds, date of the last round, the spread
 * behind a triangle (a disclosure); edit, delete, reopen */
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
    l2.append(sum, grow, iconButton('pen', 'Edit: ' + item.heading, 'edit', item.id), topicDeleteButton(item), reopen);
    li.append(line, l2);
    if (hasDist) {
        const dist = topicDistView(item);
        dist.hidden = !open;
        li.appendChild(dist);
    }
    return li;
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

    form.append(grid, labelled('Description (optional, Markdown works)', desc), fieldset, error, row);
    form.addEventListener('submit', event => {
        event.preventDefault();
        saveTopicEditor(item);
    });
    li.appendChild(form);
    return li;
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
    const checked = document.querySelector('#ti_form input[name="ti_mat"]:checked');
    const maturity = checked ? checked.value : '';
    const form = {
        heading: heading.value,
        description: document.getElementById('ti_desc').value,
        ext_id: document.getElementById('ti_ext').value,
    };
    const save = document.getElementById('ti_save');
    save.disabled = true;
    const request = item === null
        ? topicWrite('topic_item_add.php', { at: 'end', maturity }, form)
        : topicWrite('topic_item_edit.php', { item: item.id, maturity }, form);
    request.then(response => {
        if (response !== null && response.ok) {
            gTopicEditor = null;
            renderTopicMenu(true);
            const target = item === null ? document.getElementById('ti_add')
                : document.querySelector('#topic_list [data-ti-act="edit"][data-ti-id="' + item.id + '"]');
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
    const open = gTopicLists ? gTopicLists.open : [];
    const index = open.findIndex(item => item.id === id);
    if (act !== 'delete-sure' && act !== 'delete') gTopicConfirmDelete = null;
    if (act === 'add') {
        openTopicEditor('new');
    } else if (act === 'cancel') {
        const wasNew = gTopicEditor !== null && gTopicEditor.id === 'new';
        const editedId = gTopicEditor !== null ? gTopicEditor.id : null;
        gTopicEditor = null;
        renderTopicMenu(true);
        const target = wasNew ? document.getElementById('ti_add')
            : document.querySelector('#topic_list [data-ti-act="edit"][data-ti-id="' + editedId + '"]');
        if (target !== null) focusQuietly(target);
    } else if (act === 'edit') {
        openTopicEditor(id);
    } else if ((act === 'up' || act === 'down') && index >= 0) {
        const to = act === 'up' ? index - 1 : index + 1;
        if (to < 0 || to >= open.length) return;
        // shown at once, the reload brings the server's state
        topicListsChanged();
        const moved = open.splice(index, 1)[0];
        open.splice(to, 0, moved);
        renderTopicMenu(true);
        topicWrite('topic_item_move.php', { item: id, to });
    } else if (act === 'delete') {
        gTopicConfirmDelete = id;
        renderTopicMenu(true);
        const sure = document.querySelector('#topic_list [data-ti-act="delete-sure"]');
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
    } else if (act === 'retry') {
        gTopicLoadError = false;
        gTopicListsFor = null;
        loadTopicLists();
        renderTopicMenu(true);
    }
}

/* the topics menu is opened: the note field, the list fresh (prepareMenuSection in script_feedback.js) */
function prepareTopicMenu() {
    gTopicEditor = null;
    gTopicConfirmDelete = null;
    renderTopicMenu(true);
    loadTopicLists(true);
}

/* where the focus goes when the topics menu opens: the note field (as before) */
function topicMenuFocus() {
    return document.getElementById('topic_txt');
}

function initTopicItems() {
    const topic = document.getElementById('topic');
    if (topic !== null) topic.addEventListener('click', onTopicViewClick);
    const list = document.getElementById('topic_list');
    if (list !== null) {
        list.addEventListener('click', onTopicListClick);
        list.addEventListener('keydown', event => {
            if (event.key === 'Escape' && gTopicConfirmDelete !== null) {
                event.preventDefault();
                event.stopPropagation();
                const id = gTopicConfirmDelete;
                gTopicConfirmDelete = null;
                renderTopicMenu(true);
                const trash = list.querySelector('[data-ti-act="delete"][data-ti-id="' + id + '"]');
                if (trash !== null) trash.focus();
            }
        });
    }
    const bars = document.getElementById('spread_bars');
    if (bars !== null) {
        bars.addEventListener('click', onSpreadPick);
        bars.addEventListener('keydown', onSpreadPick);
    }
    const select = document.getElementById('spread_est_sel');
    if (select !== null) select.addEventListener('change', () => setTopicResult(select.value));
    window.addEventListener('resize', () => requestAnimationFrame(updateTopicMoreButton));
}

document.addEventListener('DOMContentLoaded', initTopicItems);
