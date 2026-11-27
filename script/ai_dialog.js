/* B-151 (MCP PR G): "Play via your AI assistant" (#ai_dialog in board.html), opened by the icon button #ai_btn right
 * of "Invite" (Andreas: variant a, Invite stays one click). A modal dialog (showModal): the focus stays inside, Escape,
 * "Done" and a click beside the box close it, the focus goes back to #ai_btn.
 * The connector URL (#ai_url) is filled from the current origin by showMcpUrl() (script.js), like the hint on the join
 * overlay (#join_mcp_hint). Copy: the connector URL and the board link; where the browser refuses (no permission,
 * http) the URL is selected / the board link shows in a prompt, to copy by hand. */

let gAiCopyTimers = new Map();

function aiDialogEl(id) {
    return document.getElementById(id);
}

function openAiDialog() {
    const dialog = aiDialogEl('ai_dialog');
    if (dialog === null) return;
    if (typeof showMcpUrl === 'function') showMcpUrl();
    aiDialogEl('ai_copy_status').textContent = '';
    if (!dialog.open) dialog.showModal();
    aiDialogEl('ai_url_copy').focus();
}

/* B-151 beta: "Feedback" in the dialog: closes it and opens the feedback panel the way the header's :feedback does
 * (openMenu, script_feedback.js); the panel gives the focus back to the header button on close */
let gAiToFeedback = false;
function aiFeedback() {
    gAiToFeedback = true; // no focus back to #ai_btn: it goes into the panel
    closeAiDialog();
    const btn = aiDialogEl('feedback_btn');
    const visible = btn !== null && btn.offsetParent !== null;
    openMenu('feedback', visible ? btn : aiDialogEl('menu_btn'));
}

function closeAiDialog() {
    const dialog = aiDialogEl('ai_dialog');
    if (dialog !== null && dialog.open) dialog.close();
}

/* the button reads "Copied" / "copied" for 2 s (class is-done), screen readers hear the status once */
function confirmAiCopy(button, status) {
    const lbl = button.querySelector('.lbl') || button;
    if (!gAiCopyTimers.has(button)) button.dataset.label = lbl.textContent;
    lbl.textContent = lbl === button ? 'copied' : 'Copied';
    button.classList.add('is-done');
    aiDialogEl('ai_copy_status').textContent = status;
    clearTimeout(gAiCopyTimers.get(button));
    gAiCopyTimers.set(button, setTimeout(() => {
        lbl.textContent = button.dataset.label;
        button.classList.remove('is-done');
        gAiCopyTimers.delete(button);
    }, 2000));
}

function aiCopy(text, button, status, onRefused) {
    let done;
    try {
        done = navigator.clipboard.writeText(text);
    } catch (e) {
        done = Promise.reject(e); // no navigator.clipboard (http)
    }
    done.then(() => confirmAiCopy(button, status), onRefused);
}

function copyMcpUrl() {
    const field = aiDialogEl('ai_url');
    aiCopy(field.value, aiDialogEl('ai_url_copy'), 'Connector URL copied', () => {
        field.focus();
        field.select();
        aiDialogEl('ai_copy_status').textContent = 'Copy the selected URL by hand.';
    });
}

function copyAiBoardLink() {
    const text = window.location.href;
    aiCopy(text, aiDialogEl('ai_board_copy'), 'Board link copied', () => {
        aiDialogEl('ai_copy_status').textContent = 'Copy the board link by hand.';
        window.prompt('Copy the board link:', text);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const dialog = aiDialogEl('ai_dialog');
    const button = aiDialogEl('ai_btn');
    if (dialog === null || button === null) return;
    button.addEventListener('click', openAiDialog);
    aiDialogEl('ai_dialog_done').addEventListener('click', closeAiDialog);
    aiDialogEl('ai_url_copy').addEventListener('click', copyMcpUrl);
    aiDialogEl('ai_board_copy').addEventListener('click', copyAiBoardLink);
    aiDialogEl('ai_feedback').addEventListener('click', aiFeedback);
    // a click beside the box (on the backdrop: the dialog itself, outside its rectangle) closes it; a click into its
    // padding or a drag out of the URL field (also the dialog as target) does not (as #leave_item, topics.js)
    dialog.addEventListener('click', e => {
        if (e.target !== dialog) return;
        const r = dialog.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeAiDialog();
    });
    // Escape closes natively (cancel); every way out returns the focus to the button
    dialog.addEventListener('close', () => {
        if (!gAiToFeedback) button.focus();
        gAiToFeedback = false;
    });
});
