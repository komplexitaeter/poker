function addTeam() {
    let e = document.getElementById('teaminput');
    if (e.value === '') {
        e.focus();
    }
    else {

        fetch('./api/addteam.php?t=' + e.value)
            .then((response) => {
                return response.json();
            })
            .then((myJson) => {
                if (myJson.id === '') {
                    e.value = '';
                    e.focus();
                }
                else {
                    e.disabled = true;
                    location.href = '?t=' + myJson.id;
                }
            });
    }
}

