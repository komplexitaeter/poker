/* B-151 (MCP PR G) – DESIGN PROTOTYPE (Delia), not for merging as is: Fred builds the final behaviour.
 * Making the AI connector discoverable in the header:
 *   variant A (default): a separate icon button #ai_btn right of "Invite" opens #ai_dialog; Invite stays one click.
 *   variant B (html.ai-b; to try it: localStorage.setItem('AI_UI_VARIANT', 'b') and reload): "Invite" opens a small menu #invite_menu: "Copy link" (the old invite) /
 *                          "Invite your AI assistant" (#ai_dialog).
 * The dialog shows the connector URL (location.origin + '/mcp', textContent/value only) with a copy button. */
(function () {
    try { if (localStorage.getItem('AI_UI_VARIANT') === 'b') document.documentElement.classList.add('ai-b'); } catch (e) { /* none */ }

    function el(id) { return document.getElementById(id); }

    function copyText(text, button, status) {
        let done;
        try {
            done = navigator.clipboard.writeText(text);
        } catch (e) {
            done = Promise.reject(e);
        }
        done.then(function () {
            const lbl = button.querySelector('.lbl');
            const before = lbl ? lbl.textContent : button.textContent;
            if (lbl) lbl.textContent = 'Copied'; else button.textContent = 'copied';
            button.classList.add('is-done');
            el('ai_copy_status').textContent = status;
            setTimeout(function () {
                if (lbl) lbl.textContent = before; else button.textContent = before;
                button.classList.remove('is-done');
            }, 2000);
        }, function () {
            window.prompt('Copy:', text);
        });
    }

    function openAiDialog() {
        const dialog = el('ai_dialog');
        el('ai_url').value = window.location.origin + '/mcp';
        if (!dialog.open) dialog.showModal();
        el('ai_url_copy').focus();
    }

    function closeMenu() {
        const menu = el('invite_menu');
        if (menu.hidden) return;
        menu.hidden = true;
        el('invite_btn').setAttribute('aria-expanded', 'false');
    }

    function toggleMenu(event) {
        event.stopImmediatePropagation();
        const menu = el('invite_menu');
        const open = menu.hidden;
        menu.hidden = !open;
        el('invite_btn').setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) menu.querySelector('button').focus();
    }

    document.addEventListener('DOMContentLoaded', function () {
        const dialog = el('ai_dialog');
        if (dialog === null) return;
        el('ai_btn').addEventListener('click', openAiDialog);
        el('ai_dialog_done').addEventListener('click', function () { dialog.close(); });
        dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); }); // beside the box
        el('ai_url_copy').addEventListener('click', function () {
            copyText(el('ai_url').value, el('ai_url_copy'), 'Connector URL copied');
        });
        el('ai_board_copy').addEventListener('click', function () {
            copyText(window.location.href, el('ai_board_copy'), 'Board link copied');
        });

        if (!document.documentElement.classList.contains('ai-b')) return;
        // variant B: Invite becomes a menu button
        const invite = el('invite_btn');
        invite.removeAttribute('onclick');
        invite.setAttribute('aria-haspopup', 'menu');
        invite.setAttribute('aria-expanded', 'false');
        invite.setAttribute('aria-label', 'Invite');
        invite.addEventListener('click', toggleMenu);
        // touch with a share menu: the first entry shares (as Invite does today)
        if (inviteShares()) el('invite_menu').querySelector('[data-act="link"] b').textContent = 'Share link';
        el('invite_menu').addEventListener('click', function (e) {
            const item = e.target.closest('[data-act]');
            if (item === null) return;
            closeMenu();
            if (item.dataset.act === 'ai') openAiDialog();
            else inviteTeam();
        });
        document.addEventListener('click', function (e) {
            if (!e.target.closest('#invite_menu, #invite_btn')) closeMenu();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !el('invite_menu').hidden) { closeMenu(); invite.focus(); }
        });
    });
})();
