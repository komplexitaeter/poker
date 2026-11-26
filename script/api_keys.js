/* B-150 (docs/api-v1-concept.md, section 5.5): "API keys" in the You menu (board.html, #api_keys). A key belongs to
 * one person in one team: the list shows only the own keys of this team (name, last 4 characters, created, last
 * used), "Create key" makes one, the trash can (then a red "Delete") removes one. Calls go to the public API
 * (./api/v1/keys) through apiFetch(), which sends the UID (X-Poker-User) and the team (X-Poker-Team).
 * The new key itself is shown exactly once in the dialog #api_key_new and taken out of the field when it closes.
 * It is never stored (no localStorage, no global variable), never logged and never sent to measure_event. */

const API_KEYS_URL = './api/v1/keys';
let gApiKeysLoad = 0;         // number of the latest list load; older answers are dropped
let gApiKeysShown = false;    // a list has been shown since the menu opened (no "Loading" flash on reloads)
let gApiKeyConfirm = null;    // id of the key whose row asks "Delete key ...?"
let gApiKeyBusy = false;      // a create or delete is on its way
let gApiKeys = [];            // the shown list (id, name, hint, dates - never a key)

function apiKeysEl(id) {
    return document.getElementById(id);
}

/* the team name of the board (header) in the scope sentences of the section and the dialog */
function fillApiKeyTeam() {
    const name = apiKeysEl('team_name');
    const text = name !== null ? name.textContent : '';
    document.querySelectorAll('.api-key-team').forEach(el => { el.textContent = text; });
}

/* the You menu opens (prepareMenuSection in script_feedback.js): fresh list, empty name field */
function prepareApiKeys() {
    if (apiKeysEl('api_keys') === null) return;
    fillApiKeyTeam();
    gApiKeyConfirm = null;
    gApiKeysShown = false;
    const name = apiKeysEl('api_key_name');
    name.value = '';
    updateApiKeyCreate();
    loadApiKeys();
}

function updateApiKeyCreate() {
    apiKeysEl('api_key_create').disabled = gApiKeyBusy || apiKeysEl('api_key_name').value.trim() === '';
}

function setApiKeysStatus(text) {
    apiKeysEl('api_keys_status').textContent = text;
    apiKeysEl('api_keys_status').hidden = text === '';
}

/* GET /keys; while the first load runs "Loading…", on an error a line with "Try again" */
function loadApiKeys() {
    const load = ++gApiKeysLoad;
    if (!gApiKeysShown) {
        setApiKeysStatus('Loading…');
        apiKeysEl('api_keys_list').hidden = true;
        apiKeysEl('api_keys_empty').hidden = true;
    }
    apiFetch(API_KEYS_URL, { cache: 'no-store' })
        .then(response => response.ok ? response.json() : Promise.reject(new Error('HTTP ' + response.status)))
        .then(json => {
            if (load !== gApiKeysLoad) return;
            const keys = json !== null && typeof json === 'object' && Array.isArray(json.keys) ? json.keys : [];
            gApiKeysShown = true;
            setApiKeysStatus('');
            renderApiKeys(keys);
        })
        .catch(error => {
            if (load !== gApiKeysLoad) return;
            console.log('api keys not loaded', error.message);
            if (gApiKeysShown) return; // the shown list stays
            apiKeysEl('api_keys_list').hidden = true;
            apiKeysEl('api_keys_empty').hidden = true;
            const status = apiKeysEl('api_keys_status');
            status.hidden = false;
            status.textContent = 'Your keys could not be loaded. ';
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.className = 'btn-box api-keys-retry';
            retry.dataset.keyAct = 'retry';
            retry.textContent = 'Try again';
            status.appendChild(retry);
        });
}

/* "26 Nov 2026"; today: "today" */
function apiKeyDate(iso) {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    if (date.toDateString() === new Date().toDateString()) return 'today';
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function apiKeyText(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = text;
    return el;
}

function apiKeyButton(className, act, id, label, text, icon) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.dataset.keyAct = act;
    button.dataset.keyId = String(id);
    if (label) {
        button.setAttribute('aria-label', label);
        button.title = label;
    }
    if (icon) {
        const svgNs = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNs, 'svg');
        svg.setAttribute('class', 'i');
        svg.setAttribute('aria-hidden', 'true');
        const use = document.createElementNS(svgNs, 'use');
        use.setAttribute('href', '#i-' + icon);
        svg.appendChild(use);
        button.appendChild(svg);
    }
    if (text) button.appendChild(document.createTextNode(text));
    return button;
}

/* the list: one row per key, names and dates via textContent only */
function renderApiKeys(keys) {
    gApiKeys = keys;
    const list = apiKeysEl('api_keys_list');
    if (gApiKeyConfirm !== null && !keys.some(key => key.id === gApiKeyConfirm)) gApiKeyConfirm = null;
    list.replaceChildren(...keys.map(key => {
        const li = document.createElement('li');
        li.className = 'api-key';
        li.dataset.keyId = String(key.id);
        const main = document.createElement('span');
        main.className = 'api-key-main';
        const head = document.createElement('span');
        head.className = 'api-key-head';
        head.append(apiKeyText('b', 'api-key-name', key.name),
            apiKeyText('code', 'api-key-hint', '••••' + key.hint));
        const used = key.last_used ? 'last used ' + apiKeyDate(key.last_used) : 'never used';
        main.append(head, apiKeyText('small', 'api-key-meta', 'Created ' + apiKeyDate(key.created) + ' · ' + used));
        li.appendChild(main);
        if (gApiKeyConfirm === key.id) {
            li.classList.add('is-confirm');
            const ask = document.createElement('span');
            ask.className = 'api-key-ask';
            ask.appendChild(apiKeyText('span', 'api-key-ask-text',
                'Delete key “' + key.name + '”? Tools using it stop working right away.'));
            const buttons = document.createElement('span');
            buttons.className = 'api-key-ask-btns';
            buttons.append(apiKeyButton('btn-box', 'keep', key.id, null, 'Keep'),
                apiKeyButton('btn-box danger api-key-del-sure', 'delete-sure', key.id, 'Delete key: ' + key.name, 'Delete'));
            ask.appendChild(buttons);
            li.appendChild(ask);
        } else {
            li.appendChild(apiKeyButton('icon-btn api-key-del', 'delete', key.id, 'Delete key: ' + key.name, null, 'trash'));
        }
        return li;
    }));
    list.hidden = keys.length === 0;
    apiKeysEl('api_keys_empty').hidden = keys.length !== 0;
}

/* the error code of a v1 answer ({"error": ...}), '' if none */
function apiKeyError(response) {
    return response.json().then(json => (json && typeof json.error === 'string' ? json.error : ''), () => '');
}

function createApiKey() {
    const field = apiKeysEl('api_key_name');
    const name = field.value.trim();
    if (name === '' || gApiKeyBusy) return;
    gApiKeyBusy = true;
    updateApiKeyCreate();
    apiFetch(API_KEYS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name }),
        cache: 'no-store'
    }).then(response => {
        if (response.status === 201) {
            return response.json().then(created => {
                field.value = '';
                showNewApiKey(created !== null && typeof created === 'object' ? created.key : '');
                measureEvent('API_KEY_CREATED');
            });
        }
        return apiKeyError(response).then(code => {
            if (code === 'limit_reached') {
                showToast('Limit reached – delete a key first (20 per team)', DECK_TOAST_MS, 'error');
            } else {
                showToast('Not created – please try again', DECK_TOAST_MS, 'error');
            }
        });
    }, () => {
        showToast('Not created – please try again', DECK_TOAST_MS, 'error');
    }).finally(() => {
        gApiKeyBusy = false;
        updateApiKeyCreate();
        loadApiKeys();
    });
}

/* the new key, once: the value lives only in the field of the dialog until it closes */
function showNewApiKey(key) {
    const dialog = apiKeysEl('api_key_new');
    if (dialog === null || typeof key !== 'string' || key === '') return;
    fillApiKeyTeam();
    apiKeysEl('api_key_value').value = key;
    apiKeysEl('api_key_copy_status').textContent = '';
    resetApiKeyCopy();
    if (!dialog.open) dialog.showModal();
    focusQuietly(apiKeysEl('api_key_copy'));
}

let gApiKeyCopyTimer = null;

function resetApiKeyCopy() {
    clearTimeout(gApiKeyCopyTimer);
    const button = apiKeysEl('api_key_copy');
    button.classList.remove('is-done');
    button.querySelector('.lbl').textContent = 'Copy';
    button.querySelector('use').setAttribute('href', '#i-copy');
}

/* copies the key; where the browser refuses (no permission, http) the key is selected to copy by hand */
function copyApiKey() {
    const field = apiKeysEl('api_key_value');
    const status = apiKeysEl('api_key_copy_status');
    let done;
    try {
        done = navigator.clipboard.writeText(field.value);
    } catch (e) {
        done = Promise.reject(e);
    }
    done.then(() => {
        const button = apiKeysEl('api_key_copy');
        button.classList.add('is-done');
        button.querySelector('.lbl').textContent = 'Copied';
        button.querySelector('use').setAttribute('href', '#i-check');
        status.textContent = 'Key copied';
        clearTimeout(gApiKeyCopyTimer);
        gApiKeyCopyTimer = setTimeout(resetApiKeyCopy, 2000);
    }, () => {
        field.focus();
        field.select();
        status.textContent = 'Copy the selected key by hand.';
    });
}

function deleteApiKey(id) {
    if (gApiKeyBusy) return;
    gApiKeyBusy = true;
    document.querySelectorAll('#api_keys_list button').forEach(button => { button.disabled = true; });
    apiFetch(API_KEYS_URL + '/' + encodeURIComponent(String(id)), { method: 'DELETE', cache: 'no-store' })
        .then(response => {
            // 404: gone already (another tab, the API) - the list shows it
            if (response.status === 204 || response.status === 404) {
                showToast('Key deleted');
                measureEvent('API_KEY_DELETED');
            } else {
                showToast('Not deleted – please try again', DECK_TOAST_MS, 'error');
            }
        }, () => {
            showToast('Not deleted – please try again', DECK_TOAST_MS, 'error');
        })
        .finally(() => {
            gApiKeyBusy = false;
            gApiKeyConfirm = null;
            updateApiKeyCreate();
            loadApiKeys();
            focusQuietly(apiKeysEl('api_key_name'));
        });
}

function onApiKeysClick(event) {
    const button = event.target instanceof Element ? event.target.closest('[data-key-act]') : null;
    if (button === null || button.disabled) return;
    const act = button.dataset.keyAct;
    const id = Number(button.dataset.keyId);
    if (act === 'retry') {
        loadApiKeys();
    } else if (act === 'delete') {
        gApiKeyConfirm = id;
        reRenderApiKeys();
        const keep = document.querySelector('#api_keys_list [data-key-act="keep"]');
        if (keep !== null) focusQuietly(keep);
    } else if (act === 'keep') {
        gApiKeyConfirm = null;
        reRenderApiKeys();
        const trash = document.querySelector('#api_keys_list [data-key-act="delete"][data-key-id="' + id + '"]');
        if (trash !== null) focusQuietly(trash);
    } else if (act === 'delete-sure') {
        deleteApiKey(id);
    }
}

/* the rows again from the shown list (asking or not), without a request */
function reRenderApiKeys() {
    renderApiKeys(gApiKeys);
}

function initApiKeys() {
    const box = apiKeysEl('api_keys');
    if (box === null) return;
    const field = apiKeysEl('api_key_name');
    field.addEventListener('input', updateApiKeyCreate);
    field.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.isComposing) {
            event.preventDefault();
            createApiKey();
        }
    });
    apiKeysEl('api_key_create').addEventListener('click', createApiKey);
    box.addEventListener('click', onApiKeysClick);

    const dialog = apiKeysEl('api_key_new');
    apiKeysEl('api_key_copy').addEventListener('click', copyApiKey);
    apiKeysEl('api_key_done').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        // the key is gone from the page once the dialog closes
        apiKeysEl('api_key_value').value = '';
        apiKeysEl('api_key_copy_status').textContent = '';
        resetApiKeyCopy();
        const create = apiKeysEl('api_key_name');
        if (create !== null && create.getClientRects().length > 0) focusQuietly(create);
    });
}

document.addEventListener('DOMContentLoaded', initApiKeys);
