/* B-14: the connection to poker-msg and the writing API calls (B-81, B-82, B-86, B-92, B-135), moved out of
 * script.js unchanged. A classic deferred script before script.js: it shares the globals of script.js
 * (gConn, t, gDaoSeq, ...), which are only used inside functions. */

/* ---------- Connection to poker-msg (B-81, B-82, B-86) ----------
 * The connection only receives: after 'subscribe' poker-msg sends 'pull' whenever the team changed
 * (the API notifies it after every write, B-81) and 'hb' to every connection every 30 s. The board
 * never sends 'push'; after an own write it loads the board itself (afterWrite), so the own board
 * never depends on the signal. A connection that is closed, or silent for longer than HB_TIMEOUT_MS
 * (half open: sleep, network change, proxies), is rebuilt; its onopen calls updateDao (B-82).
 * While the connection is down #conn_hint covers the board after a short delay and vanishes by
 * itself when it is back (B-86). */
const WS_RECONNECT_MS = 300;       // reconnect after an open connection closed
const WS_RETRY_MS = 2000;          // try again after a connection could not be opened
const WS_CHECK_MS = 3000;          // how often the connection is checked
const HB_TIMEOUT_MS = 40000;       // B-81: no 'hb' or 'pull' for this long: the connection is dead
const CONN_HINT_DELAY_MS = 1200;   // B-86: show the hint only when the trouble lasts longer (no flicker)
const WRITE_TIMEOUT_MS = 15000;    // B-92: a writing API call that hangs longer is given up
const WRITE_RETRY_MS = 300;        // B-135: wait before the one retry of an idempotent write after a network error

let gWsTimer = null;          // check / reconnect timer, only one at a time
let gWsLastMsgAt = 0;         // B-81: when the current connection opened or last received something
let gConnTrouble = false;     // B-86: connection closed or silent
let gConnHintTimer = null;
let gConnHintFocusBack = null;

function initializeWSConnection(teamId) {

    console.log("initializeWSConnection");

    // close an existing connection that is open or still opening
    if (gConn && (gConn.readyState === WebSocket.OPEN || gConn.readyState === WebSocket.CONNECTING)) {
        gConn.close();
    }

    let wsProtocol = 'wss://';
    if (window.location.protocol.includes('http:')) wsProtocol = 'ws://';

    const conn = new WebSocket(wsProtocol+window.location.host+'/poker-msg');
    gConn = conn;
    gWsLastMsgAt = Date.now();
    setConnTrouble(true); // until it is open

    conn.onmessage = function(e){
        if (conn !== gConn) return;
        gWsLastMsgAt = Date.now(); // 'hb', 'pull': the connection is alive
        if (typeof e.data !== 'string') return;
        if (e.data.startsWith('react:')) { // B-110: a reaction (never a pull, even if it contained the word)
            const m = REACT_MSG.exec(e.data); // hidden tab: dropped in onReaction (B-133: a nudge for me still rings)
            if (m !== null) onReaction(m[1], m[2], m[3]);
            return;
        }
        if (e.data.includes('pull')) updateDao(false);
        else if (e.data === 'hb') scheduleHbLoad(); // B-110
    };

    let wasOpen = false;
    conn.onopen = () => {
        if (conn !== gConn) return;
        wasOpen = true;
        gWsLastMsgAt = Date.now();
        conn.send('subscribe: '+teamId);
        setConnTrouble(false);
        updateDao(false);
    };

    conn.onclose = () => {
        if (conn !== gConn) return; // replaced on purpose
        setConnTrouble(true);
        scheduleWSCheck(wasOpen ? WS_RECONNECT_MS : WS_RETRY_MS);
    };

    scheduleWSCheck(10000);
}

function scheduleWSCheck(ms) {
    clearTimeout(gWsTimer);
    gWsTimer = setTimeout(checkWSConnection, ms);
}

/* B-81: true when the connection is open and something came within HB_TIMEOUT_MS */
function wsConnectionAlive() {
    return gConn.readyState === WebSocket.OPEN && Date.now() - gWsLastMsgAt <= HB_TIMEOUT_MS;
}

function checkWSConnection() {
    if (gConn.readyState === WebSocket.CONNECTING) {
        // still opening after 10 s: start over
        if (Date.now() - gWsLastMsgAt > 10000) initializeWSConnection(t);
        else scheduleWSCheck(WS_CHECK_MS);
    } else if (!wsConnectionAlive()) {
        initializeWSConnection(t);
    } else {
        scheduleWSCheck(WS_CHECK_MS);
    }
}

/* B-82: back to the tab, back online or back from the page cache: the connection may be dead or
 * half open without an error, so always build a new one (its onopen calls updateDao). */
function reconnectWSConnection() {
    if (gConn === null) return; // no board on this page
    initializeWSConnection(t);
}

function initWSReconnect() {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            stopTitleBlink(); // B-133
            reconnectWSConnection();
        } else dropReactions(); // B-110: nothing is played late
    });
    window.addEventListener('online', reconnectWSConnection);
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) reconnectWSConnection();
    });
}

/* B-135: endpoints that only set a state, so running them twice gives the same result. Only these are sent once
 * more after a pure network error (Safari: "TypeError: Load failed", e.g. when the server closed the HTTP/2
 * connection): the request may have reached the server anyway. Not in the list: everything that adds or moves
 * on (newround, topic_item_add/next/reopen/move, delete, feedback, name.php - adds a player), toggles
 * (timer.php toggle_visibility, start computes from the pause) or saves with a revision (custom_set_*). */
const WRITE_RETRY_SCRIPTS = new Set([
    'setc.php', 'update_deck.php', 'update_controls.php', 'update_show_avg.php', 'update_team.php',
    'update_topic.php', 'update_results_order.php', 'topic_item_result.php'
]);

function isRetryableWrite(url) {
    const m = /\/api\/([a-z_]+\.php)/.exec(url);
    return m !== null && WRITE_RETRY_SCRIPTS.has(m[1]);
}

/* B-135: the same write target (endpoint, team, player/item and the names of the set fields): a newer write of it
 * makes a pending retry of an older one void (it would overwrite the newer choice) */
const WRITE_TARGET_PARAMS = ['t', 'id', 'item'];
const gWriteGen = new Map();   // write key -> number of the latest write started

function writeKey(url) {
    try {
        const parsed = new URL(url, location.href);
        const names = Array.from(new Set(parsed.searchParams.keys())).sort();
        const target = WRITE_TARGET_PARAMS.map(name => name + '=' + (parsed.searchParams.get(name) ?? ''));
        return parsed.pathname + '|' + target.join('&') + '|' + names.join(',');
    } catch (e) {
        return url;
    }
}

/* B-135: a network error of fetch (TypeError), not a timeout or abort (and never an HTTP status: fetch resolves) */
function isNetworkError(error) {
    return error instanceof TypeError;
}

/* one attempt of a write, with its own WRITE_TIMEOUT_MS */
function fetchWrite(url, init) {
    const options = Object.assign({ method: 'POST' }, init);
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        options.signal = AbortSignal.timeout(WRITE_TIMEOUT_MS);
    }
    try {
        return fetch(url, options);
    } catch (e) {
        return Promise.reject(e);
    }
}

/* B-81: a writing API call (POST). Never rejects: resolves with the response, or null when the
 * request failed or took longer than WRITE_TIMEOUT_MS. An idempotent write (WRITE_RETRY_SCRIPTS) is sent
 * once more after WRITE_RETRY_MS when it failed with a network error (B-135). Afterwards (success or not)
 * beforeReload runs, then the board loads the current state itself (afterWrite); poker-msg tells the other boards. */
function apiWrite(url, init = {}, beforeReload = null) {
    const deckWrite = isDeckWrite(url) ? { doneSeq: Infinity } : null;
    if (deckWrite !== null) gOwnDeckWrites.push(deckWrite);
    const key = writeKey(url);
    const gen = (gWriteGen.get(key) || 0) + 1;
    gWriteGen.set(key, gen);
    return fetchWrite(url, init).catch(error => {
        if (!isNetworkError(error) || !isRetryableWrite(url)) throw error;
        return new Promise(resolve => setTimeout(resolve, WRITE_RETRY_MS)).then(() => {
            // a newer write of the same target started meanwhile: it wins, no retry of the old value (and no error
            // message: an empty success, the newer write reports for itself)
            if (gWriteGen.get(key) !== gen) {
                console.log('write superseded', url);
                return new Response(null, { status: 204, statusText: 'Superseded' });
            }
            console.log('write retry', url, error);
            return fetchWrite(url, init);
        });
    }).catch(error => {
        console.log('write failed', url, error);
        return null;
    }).then(response => {
        if (deckWrite !== null) deckWrite.doneSeq = gDaoSeq; // the reload below gets a higher number
        if (beforeReload !== null) beforeReload();
        afterWrite();
        return response;
    });
}

/* R3 (Andreas): a setting of the menu (board settings Results/Team, menu You) written with apiWrite; a failed write
 * shows the error toast only (success needs no message: the board shows the new state). The board reloaded itself
 * (apiWrite), so the radios show the server's state again. Deck and timer menu have their own handling. */
function settingWrite(url, init = {}) {
    return apiWrite(url, init).then(response => {
        if (response === null || !response.ok) showToast('Not saved \u2013 please try again', DECK_TOAST_MS, 'error');
        return response;
    });
}

/* B-81: after an own write: load the board, and do not wait for a dead connection to be found */
function afterWrite() {
    if (gConn === null) return; // no board on this page (start page)
    if (gConn.readyState !== WebSocket.CONNECTING && !wsConnectionAlive()) {
        initializeWSConnection(t); // its onopen loads the board again
    }
    updateDao(false);
}

/* B-86: #conn_hint (board.html) shows up when the trouble lasts longer than CONN_HINT_DELAY_MS.
 * It takes the focus (role="alertdialog"), the rest of the page is inert meanwhile; an open phone
 * menu (modal, top layer, it would cover the hint) is closed. When the connection is there again
 * the hint hides and gives the focus back. */
function setConnTrouble(trouble) {
    if (trouble === gConnTrouble) return;
    gConnTrouble = trouble;
    clearTimeout(gConnHintTimer);
    gConnHintTimer = null;
    if (trouble) {
        gConnHintTimer = setTimeout(() => showConnHint(true), CONN_HINT_DELAY_MS);
    } else {
        showConnHint(false);
    }
}

function connHintVisible() {
    const hint = document.getElementById('conn_hint');
    return hint !== null && !hint.hidden;
}

let gConnHintInert = [];   // the elements made inert while the hint is shown

function showConnHint(show) {
    const hint = document.getElementById('conn_hint');
    if (hint === null || hint.hidden === !show) return;
    if (show) {
        gConnHintFocusBack = document.activeElement;
        const menu = document.getElementById('menu');
        if (isModalOpen(menu)) {
            if (typeof gMenuOpener !== 'undefined' && gMenuOpener !== null) gConnHintFocusBack = gMenuOpener;
            closeMenu(false);
        }
        hint.hidden = false;
        hint.focus({ preventScroll: true });
        gConnHintInert = Array.from(document.body.children).filter(el => el !== hint && !el.inert);
        gConnHintInert.forEach(el => { el.inert = true; });
    } else {
        gConnHintInert.forEach(el => { el.inert = false; });
        gConnHintInert = [];
        hint.hidden = true;
        const back = gConnHintFocusBack;
        gConnHintFocusBack = null;
        if (document.activeElement === hint || document.activeElement === document.body) {
            if (back instanceof HTMLElement && back !== document.body && back.isConnected) {
                back.focus({ preventScroll: true });
            }
        }
    }
}
