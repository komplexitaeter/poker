function addTeam() {
    var e = document.getElementById('teaminput');
    if (e.value === '') {
        e.focus();
    }
    else {

        fetch('./addteam.php?t=' + e.value)
            .then((response) => {
                return response.json();
            })
            .then((myJson) => {
                if (myJson.id === '') {
                    e.value = '';
                    e.focus();
                }
                else {
                    e.value = myJson.id;
                    e.disabled = true;
                    document.getElementById('teambtn').style.display = 'none';
                    document.getElementById('teamlink').style.display = 'inline';
                }
            });

    }
}

function goTeam() {
    location.href = '?t=' + document.getElementById('teaminput').value; 
}