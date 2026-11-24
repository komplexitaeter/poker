/* B-14: the timer / stopwatch (B-67, B-73, B-130), moved out of script.js unchanged. A classic deferred script
 * before script.js: it shares the globals of script.js, which are only used inside functions. */

let gTimerTime = null;
let gTimerBaseTime = new Date();
let gTimerInterval = null;

/* B-67: timer instead of stopwatch. The server keeps the state per team (api/timer.php, dao.php):
 * visibility (on for everyone), mode STOPWATCH | TIMER, timebox (seconds), auto-restart and the
 * elapsed seconds (timer_time) with the status RUNNING | PAUSED (also before the first start).
 * STOPWATCH shows just the elapsed time (B-79: no T+). TIMER shows T−rest (rest = timebox − elapsed)
 * while rest > 0, then T+ (over time, amber). Between two server updates the client counts on by itself (interval).
 * gTimer: the last server state, gTimerBaseTime: when it arrived. */
let gTimer = null;

/* B-73: an own timer change (a radio in the panel) is shown right away; a board state that was read
 * before the change reached the server would set the panel back (the radio jumps back until the next
 * pull, or for good when the older answer comes last). So the timer part of a board state is only
 * taken when no own change was under way while it was asked for and answered. After the change the
 * board loads itself (apiWrite, after the counters are back) and gets the new state. */
let gTimerWrites = 0;     // own timer changes under way
let gTimerWriteGen = 0;   // own timer changes finished so far

/* writeGen: gTimerWriteGen when updateDao asked, -1 if a change was under way then */
function timerStateFresh(writeGen) {
    return writeGen === gTimerWriteGen && gTimerWrites === 0;
}

const TIMER_PRESETS = [3, 5, 10, 15, 30, 60];

/* B-130: auto-start 0 = off, 1 = new round, 2 = next item: the hint below the switch and the toast of an own change */
const TIMER_AUTO_RESTART_HINTS = [
    'You start it yourself.',
    'Restarts with every new round.',
    'Restarts with every next item.',
];
const TIMER_AUTO_RESTART_TOASTS = ['Auto-start off', 'Auto-start with every new round', 'Auto-start with every next item'];

function updateTimer(json) {
    gTimer = {
        status: json.timer_status,
        time: json.timer_time || 0,
        visible: json.timer_visibility === 1,
        mode: json.timer_mode === 'TIMER' ? 'TIMER' : 'STOPWATCH',
        timebox: json.timer_timebox > 0 ? json.timer_timebox : 300,
        // B-130: 0 = off, 1 = new round, 2 = next item
        autoRestart: [1, 2].includes(json.timer_auto_restart) ? json.timer_auto_restart : 0,
    };
    gTimerTime = gTimer.time;
    gTimerBaseTime = new Date();

    let running = gTimer.status === 'RUNNING';
    let box = document.getElementById('timer');
    if (box !== null) {
        box.classList.toggle('display_none', !gTimer.visible);
        // R3 (Andreas): phones without the timer: the round button takes the whole row (style.css .dock.no-timer)
        if (box.parentElement !== null) box.parentElement.classList.toggle('no-timer', !gTimer.visible);
        // not started yet (or reset): "ready"; both ready and paused are shown dimmed
        box.setAttribute('data-state', running ? 'running' : (gTimer.time === 0 ? 'ready' : 'paused'));
        document.getElementById('timer_start').hidden = running;
        document.getElementById('timer_pause').hidden = !running;
        // keep the focus on the control when play turns into pause (and back) by keyboard
        let focused = document.activeElement;
        if (focused !== null && focused.hidden && (focused.id === 'timer_start' || focused.id === 'timer_pause')) {
            document.getElementById(running ? 'timer_pause' : 'timer_start').focus();
        }
        renderTimer(gTimer.time);
    }
    updateTimerConfig();

    if (running && gTimer.visible) {
        if (gTimerInterval === null) gTimerInterval = setInterval(updateTimerInterval, 500);
    } else if (gTimerInterval !== null) {
        clearInterval(gTimerInterval);
        gTimerInterval = null;
    }
}

/* the seconds elapsed since the last server update are added locally (the illusion of time) */
function updateTimerInterval() {
    renderTimer(gTimerTime + Math.round((new Date() - gTimerBaseTime) / 1000));
}

/* m:ss as mm:ss below one hour, h:mm:ss from 60 minutes on */
function formatTimerSeconds(seconds) {
    let h = Math.floor(seconds / 3600);
    let m = Math.floor(seconds % 3600 / 60);
    let s = seconds % 60;
    let pad = n => String(n).padStart(2, '0');
    return (h > 0 ? h + ':' + pad(m) : pad(m)) + ':' + pad(s);
}

/* spoken form for the aria-label, e.g. "3 min 12 s" */
function spokenTimerSeconds(seconds) {
    let h = Math.floor(seconds / 3600);
    let m = Math.floor(seconds % 3600 / 60);
    let s = seconds % 60;
    return (h > 0 ? h + ' h ' : '') + (h > 0 || m > 0 ? m + ' min ' : '') + s + ' s';
}

function renderTimer(elapsed) {
    if (gTimer === null) return;
    let display = document.getElementById('timer_display');
    let box = document.getElementById('timer');
    if (display === null) return;
    let text, label, over = false;
    if (gTimer.mode === 'TIMER') {
        let rest = gTimer.timebox - elapsed;
        if (rest > 0) {
            text = 'T−' + formatTimerSeconds(rest);
            label = spokenTimerSeconds(rest) + ' left';
        } else {
            over = true;
            text = 'T+' + formatTimerSeconds(-rest);
            label = 'time is up, ' + spokenTimerSeconds(-rest) + ' over';
        }
    } else {
        text = formatTimerSeconds(elapsed);
        label = spokenTimerSeconds(elapsed) + ' elapsed';
    }
    let state = box.getAttribute('data-state');
    if (state === 'ready') label += ', not started';
    if (state === 'paused') label += ', paused';
    if (display.textContent !== text) display.textContent = text;
    label = (gTimer.mode === 'TIMER' ? 'Timer: ' : 'Stopwatch: ') + label;
    if (display.getAttribute('aria-label') !== label) display.setAttribute('aria-label', label);
    box.setAttribute('data-over', over ? 'true' : 'false');
    syncRailTimer(); // B-113 (sidebar.js)
}

/* the timer panel follows the server state (also when someone else changes it); the "other"
 * field is left alone while the user types in it */
function updateTimerConfig(force = false) {
    if (gTimer === null || document.getElementById('timer_box') === null) return;
    checkRadio('tmr_visibility', gTimer.visible ? '1' : '0');
    checkRadio('tmr_mode', gTimer.mode);
    checkRadio('tmr_auto_restart', String(gTimer.autoRestart));
    let autoHint = document.getElementById('tmr_auto_restart_hint');
    // B-130: written only when it changes (a load with the same state changes nothing on the page, B-110)
    const autoText = TIMER_AUTO_RESTART_HINTS[gTimer.autoRestart] ?? '';
    if (autoHint !== null && autoHint.textContent !== autoText) autoHint.textContent = autoText;
    document.getElementById('tmr_timebox').hidden = gTimer.mode !== 'TIMER';

    let minutes = Math.round(gTimer.timebox / 60);
    let preset = TIMER_PRESETS.includes(minutes);
    document.querySelectorAll('input[name="tmr_timebox"]').forEach(radio => {
        radio.checked = preset && radio.value === String(minutes);
    });
    let other = document.getElementById('tmr_other');
    if (force || document.activeElement !== other) {
        // a custom value is marked like a checked preset (data-set, style.css); a preset leaves the field empty
        other.value = preset ? '' : String(minutes);
        other.closest('.tmr-other').setAttribute('data-set', preset ? 'false' : 'true');
        showTimerOtherError(false);
    }
}

function timerAction(action, value = null) {
    let url = './api/timer.php?t=' + encodeURIComponent(t) + '&action=' + action
        + (value === null ? '' : '&value=' + encodeURIComponent(value));
    gTimerWrites++;
    // B-73: the counters are back before the board loads itself after the write (apiWrite),
    // otherwise the timer part of that answer would be dropped
    return apiWrite(url, {}, () => {
        gTimerWrites--;
        gTimerWriteGen++;
    }).then(response => {
        if (response === null || !response.ok) throw new Error('timer.php ' + (response ? response.status : 'failed'));
    });
}

/* R3 (Andreas): a failed setting of the timer menu as an error toast, like the deck menu (the board loaded itself,
 * apiWrite, so the menu shows the server's state again) */
function timerSettingFailed() {
    showToast('Not saved \u2013 please try again', DECK_TOAST_MS, 'error');
}

function setTimerVisibility(value) {
    // B-46: confirm the own change (others just see the timer appear); R3 (Andreas): as a toast like the deck menu
    timerAction('set_visibility', value).then(() => {
        showToast(value === '1' ? 'Timer on \u2013 everyone on the board sees it' : 'Timer off', DECK_TOAST_MS);
    }).catch(timerSettingFailed);
    measureEvent("TOGGLE_TIMER");
}

function setTimerMode(value) {
    timerAction('set_mode', value).catch(timerSettingFailed);
}

function setTimerTimebox(minutes) {
    let other = document.getElementById('tmr_other');
    other.value = '';
    other.closest('.tmr-other').setAttribute('data-set', 'false');
    showTimerOtherError(false);
    timerAction('set_timebox', minutes).catch(timerSettingFailed);
}

/* "other: __ min" (whole minutes 1..240), a plain text field (no number field: Safari and Chrome
 * differ there). The field keeps its value while typing (Tab selects it, a click puts the caret in),
 * Enter saves and leaves the field, Escape drops the input, leaving the field saves a valid input
 * (an invalid one is dropped). Invalid on Enter: a short message below the field, nothing is saved,
 * the field keeps the focus. While the field has the focus, updates from others leave it alone
 * (updateTimerConfig). */
function timerOtherKeydown(event) {
    let other = event.target;
    if (event.key === 'Enter') {
        event.preventDefault();
        if (saveTimerOther(true)) other.blur();
    } else if (event.key === 'Escape') {
        // drop the input; preventDefault keeps the menu open (initMenu ignores handled keys)
        event.preventDefault();
        updateTimerConfig(true);
        other.blur();
    }
}

function timerOtherBlur() {
    saveTimerOther(false);
    updateTimerConfig(true);
}

function showTimerOtherError(show) {
    let other = document.getElementById('tmr_other');
    let error = document.getElementById('tmr_other_error');
    if (other === null || error === null) return;
    error.hidden = !show;
    if (show) other.setAttribute('aria-invalid', 'true');
    else other.removeAttribute('aria-invalid');
}

/* saves the typed minutes; returns false for an invalid input (with the message if showError) */
function saveTimerOther(showError) {
    let other = document.getElementById('tmr_other');
    let value = other.value.trim();
    if (value === '') {
        showTimerOtherError(false);
        return true;
    }
    let minutes = Number(value);
    if (!/^[0-9]+$/.test(value) || minutes < 1 || minutes > 240) {
        showTimerOtherError(showError);
        return false;
    }
    showTimerOtherError(false);
    if (gTimer === null || gTimer.timebox === minutes * 60) return true;
    // show the new value right away (the server resets the timer, the next pull brings the rest)
    gTimer.timebox = minutes * 60;
    gTimerTime = 0;
    gTimerBaseTime = new Date();
    timerAction('set_timebox', String(minutes)).catch(timerSettingFailed);
    return true;
}

function setTimerAutoRestart(value) {
    // B-130: the hint follows right away, the toast confirms the saved value
    let hint = document.getElementById('tmr_auto_restart_hint');
    if (hint !== null && TIMER_AUTO_RESTART_HINTS[value] !== undefined) hint.textContent = TIMER_AUTO_RESTART_HINTS[value];
    timerAction('set_auto_restart', value).then(() => {
        showToast(TIMER_AUTO_RESTART_TOASTS[value] ?? 'Saved', DECK_TOAST_MS);
    }).catch(timerSettingFailed);
}

function timerStart() {
    timerAction('start').catch(() => {}); // the board loaded itself (apiWrite)
}

function timerPause() {
    timerAction('pause').catch(() => {}); // the board loaded itself (apiWrite)
}

function timerReset() {
    timerAction('reset').catch(() => {}); // the board loaded itself (apiWrite)
}
