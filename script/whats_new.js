/* B-164: "What's new" – release notes on the board.
 * Entry: the line on top of the feedback panel (#wn_open, board.html) opens #whats_new, a full-screen modal dialog
 * (showModal: the focus stays inside, Escape closes, the focus goes back to the opener). The notes come from
 * release_notes.json, fetched only when the dialog opens (once per page). Screenshots exist in dark and light
 * (src/notes/<name>-dark.webp / -light.webp) and follow the app's colour mode (html.pk-light, set by setColor() in
 * script.js), also when it changes while the dialog is open.
 * Red dot: the feedback menu (renderFeedbackDot() in script_feedback.js) also shows a dot while NOTES_LATEST is newer
 * than the last release this browser opened (localStorage NOTES_SEEN). Only for returning people: a browser that never
 * stored a release takes the current one as seen, silently (first-time players and managers get no dot). The empty
 * string is set by ensureUid() (script.js) when a browser gets its very first UID - a new person. A browser with a UID
 * from before this feature but no NOTES_SEEN yet is a returning person and gets the dot once.
 * Texts come from our own file, but are still set via textContent only. */

const NOTES_LATEST = '2026.13'; // the first release in release_notes.json (an E2E test checks they match)
const NOTES_URL = './release_notes.json?v=51';
const NOTES_SEEN_KEY = 'NOTES_SEEN'; // literal in ensureUid() (script.js) too
const NOTES_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* a UID stored before this page loaded: a browser that has been here before (read before ensureUid() runs) */
const gNotesHadUid = (() => {
    try {
        return localStorage.getItem('SID') !== null;
    } catch (e) {
        return false;
    }
})();

let gNotesDot = false;       // the dot for an unseen release (read by renderFeedbackDot())
let gNotesLoad = null;       // the one fetch of release_notes.json per page (a promise)
let gNotesOpener = null;     // gets the focus back when the dialog closes

/* -1, 0, 1 for release numbers like "2026.3.1" and "2026.13" (numeric per part) */
function compareReleases(a, b) {
    const pa = String(a).split('.').map(Number);
    const pb = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = pa[i] || 0, y = pb[i] || 0;
        if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
}

function storeNotesSeen() {
    try { localStorage.setItem(NOTES_SEEN_KEY, NOTES_LATEST); } catch (e) { /* no storage: no dot either */ }
}

function initNotesDot() {
    let seen;
    try {
        seen = localStorage.getItem(NOTES_SEEN_KEY);
    } catch (e) {
        return; // no storage: we cannot tell new from returning people, no dot
    }
    if (seen === '' || (seen === null && !gNotesHadUid)) {
        storeNotesSeen(); // a new person: the current release counts as seen
        return;
    }
    gNotesDot = seen === null || compareReleases(seen, NOTES_LATEST) < 0;
    renderNotesDot();
}

function renderNotesDot() {
    const entry = document.getElementById('wn_open');
    if (entry !== null) entry.classList.toggle('is-new', gNotesDot);
    if (typeof renderFeedbackDot === 'function') renderFeedbackDot();
}

/* "28 Nov 2026" from "2026-11-28" (fixed English month names, as the rest of the UI) */
function formatNotesDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
    if (m === null) return '';
    return Number(m[3]) + ' ' + NOTES_MONTHS[Number(m[2]) - 1] + ' ' + m[1];
}

function notesMode() {
    return document.documentElement.classList.contains('pk-light') ? 'light' : 'dark';
}

/* every screenshot in the dialog shows the file of the current colour mode */
function syncNotesImages() {
    const mode = notesMode();
    document.querySelectorAll('#wn_list img[data-name]').forEach(img => {
        const src = './src/notes/' + img.dataset.name + '-' + mode + '.webp';
        if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    });
}

function notesEl(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
}

/* a chip for items people asked for: a speech bubble (#i-chat, as the feedback menu) plus a text, never the icon alone */
function notesAskedBadge() {
    const chip = notesEl('span', 'wn-asked');
    chip.title = 'This came from user feedback';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'i');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-chat');
    svg.appendChild(use);
    chip.appendChild(svg);
    chip.appendChild(notesEl('span', '', 'Requested by users'));
    return chip;
}

function renderNotes(data) {
    const list = document.getElementById('wn_list');
    list.textContent = '';
    const releases = data !== null && typeof data === 'object' && Array.isArray(data.releases) ? data.releases : [];
    releases.forEach(rel => {
        const sec = notesEl('section', 'wn-rel');
        const h = notesEl('h3', 'wn-rel-h');
        h.appendChild(notesEl('span', 'wn-rel-n', String(rel.number)));
        const date = formatNotesDate(rel.date);
        if (date !== '') h.appendChild(notesEl('span', 'wn-rel-d', ' · ' + date));
        sec.appendChild(h);
        const ul = notesEl('ul', 'wn-items');
        (Array.isArray(rel.items) ? rel.items : []).forEach(item => {
            const li = notesEl('li', 'wn-item');
            const head = notesEl('div', 'wn-item-h'); // title and chip on one line (style.css)
            head.appendChild(notesEl('h4', 'wn-item-t', String(item.title ?? '')));
            if (item.asked === true) head.appendChild(notesAskedBadge());
            li.appendChild(head);
            li.appendChild(notesEl('p', 'wn-item-x', String(item.text ?? '')));
            if (item.where) {
                const where = notesEl('p', 'wn-where');
                where.appendChild(notesEl('span', 'wn-where-l', 'Find it in: '));
                where.appendChild(notesEl('span', '', String(item.where)));
                li.appendChild(where);
            }
            const image = item.image;
            if (image && /^[a-z0-9-]+$/.test(String(image.name))) {
                const img = document.createElement('img');
                img.className = 'wn-img';
                img.loading = 'lazy';
                img.decoding = 'async';
                img.alt = String(image.alt ?? '');
                img.dataset.name = image.name;
                if (image.w > 0 && image.h > 0) {
                    img.width = image.w;
                    img.height = image.h;
                    img.style.maxWidth = Math.round(image.w / 2) + 'px'; // taken at 2x: never larger than on the board
                }
                li.appendChild(img);
            }
            ul.appendChild(li);
        });
        sec.appendChild(ul);
        list.appendChild(sec);
    });
    if (releases.length === 0) list.appendChild(notesEl('p', 'hint', 'No notes yet.'));
    syncNotesImages();
}

function loadNotes() {
    if (gNotesLoad === null) {
        const list = document.getElementById('wn_list');
        list.setAttribute('aria-busy', 'true');
        gNotesLoad = fetch(NOTES_URL)
            .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
            .then(data => renderNotes(data))
            .catch(error => {
                console.log('release_notes.json failed', error);
                gNotesLoad = null; // try again on the next open
                list.textContent = '';
                list.appendChild(notesEl('p', 'hint', 'The notes could not be loaded. Please try again later.'));
            })
            .finally(() => list.removeAttribute('aria-busy'));
    }
    return gNotesLoad;
}

function openNotes(opener = null) {
    const dialog = document.getElementById('whats_new');
    if (dialog === null) return;
    gNotesOpener = opener;
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    const close = document.getElementById('wn_close');
    if (typeof focusQuietly === 'function') focusQuietly(close); else close.focus();
    loadNotes();
    syncNotesImages(); // the colour mode may have changed while the dialog was closed (the list is built once)
    storeNotesSeen();
    if (gNotesDot) {
        gNotesDot = false;
        renderNotesDot();
    }
}

function closeNotes() {
    const dialog = document.getElementById('whats_new');
    if (dialog !== null && dialog.open) dialog.close();
}

document.addEventListener('DOMContentLoaded', () => {
    const label = document.getElementById('wn_open_n');
    if (label !== null) label.textContent = NOTES_LATEST;
    initNotesDot();
    const dialog = document.getElementById('whats_new');
    const opener = document.getElementById('wn_open');
    if (dialog === null || opener === null) return;
    opener.addEventListener('click', () => openNotes(opener));
    document.getElementById('wn_close').addEventListener('click', closeNotes);
    // Escape closes natively (cancel); every way out gives the focus back to the opener
    dialog.addEventListener('close', () => {
        if (gNotesOpener !== null && gNotesOpener.isConnected) {
            if (typeof focusQuietly === 'function') focusQuietly(gNotesOpener); else gNotesOpener.focus();
        }
        gNotesOpener = null;
    });
    // the colour mode changes (switch, another tab, the server's value): the screenshots follow
    new MutationObserver(() => { if (dialog.open) syncNotesImages(); })
        .observe(document.documentElement, {attributes: true, attributeFilter: ['class']});
});
