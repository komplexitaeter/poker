/* R3 review V10 (L17): below the field, "Please enter a team name." while the name is missing */
function showTeamError(show) {
    const error = document.getElementById('team_err');
    const input = document.getElementById('teaminput');
    if (error === null || input === null) return;
    error.hidden = !show;
    if (show) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
}

function addTeam() {
    let e = document.getElementById('teaminput');
    if (e.value.trim() === '') {
        showTeamError(true);
        e.focus();
    }
    else {
        showTeamError(false);
        fetch('./api/addteam.php?t=' + encodeURIComponent(e.value), { method: 'POST' })
            .then((response) => {
                return response.json();
            })
            .then((myJson) => {
                if (myJson.id === '') {
                    e.value = '';
                    showTeamError(true);
                    e.focus();
                }
                else {
                    e.disabled = true;
                    location.href = '?t=' + myJson.id;
                }
            });
    }
}
