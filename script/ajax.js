const gPreferStreaming = false;
const gPullInterval = 500;
const gPauseWhenInvisible = false;

let gLastExecutionTime="";
let gFetchCount = 0;
let gT1;
let gT2;

function initializeConnection(baseUrl, params, func) {
    let useStreaming = false;

    if (gPreferStreaming && typeof EventSource == 'function') {
        useStreaming = true;
    }

    if (useStreaming) {
        let url = getUrl(baseUrl, params, useStreaming);
        initializeStreaming(url, func);
    } else {
        initializePulling(baseUrl, params, func);
    }
}

function getUrl(baseUrl, params, useStreaming) {
    let separator = '?';
    let url="./"+baseUrl;
    if (useStreaming) url+='_stream';
    url+=".php";
    for (let param in params) {
        if (params.hasOwnProperty(param)) {
            url += separator + param + "=" + params[param];
            separator = '&';
        }
    }
    return url;
}

function initializePulling(baseUrl, params, func) {
    try {
        params["execution_time"] = gLastExecutionTime;
        let url = getUrl(baseUrl, params, false);

        gT1 = performance.now();

        fetch(url)
            .then(function(response) {
                gT2 = performance.now();
                gLastExecutionTime = Math.round(gT2 - gT1);
                gFetchCount++;
                return response.json();
            })
            .then((myJson) => {
                let refreshInterval;
                func(myJson, gFetchCount, gLastExecutionTime);
                if (gLastExecutionTime >= gPullInterval) {
                    refreshInterval = 0;
                } else {
                    refreshInterval = gPullInterval - gLastExecutionTime;
                }
                setTimeout(function () {
                    initializePulling(baseUrl, params, func);
                }, refreshInterval);

            })
            .catch(function(e) {
                setTimeout(function () {
                    initializePulling(baseUrl, params, func);
                }, gPullInterval);
                console.error(e);
            });
    }
    catch(e) {
        setTimeout(function () {
            initializePulling(baseUrl, params, func);
        }, gPullInterval);
        console.error(e);
    }
}

function initializeStreaming(url, func) {
    let eventSource = new EventSource(url);

    eventSource.addEventListener("update"
        ,function(event) {
            handleStreamEvent(event, func);
        });

    if (gPauseWhenInvisible) {
        document.addEventListener("visibilitychange"
            , function () {
                onVisibilityChange(eventSource, func, url);
            });
    }
}

function handleStreamEvent(event, func) {
    let myJson = JSON.parse(event.data);
    gFetchCount++;
    func(myJson, gFetchCount, gLastExecutionTime);
}

function onVisibilityChange(eventSource, func, url) {
    if (document.visibilityState === 'hidden') {
        eventSource.close();
    }
    else if (eventSource === null || eventSource.readyState === 2) {
        eventSource = new EventSource(url);
        eventSource.addEventListener("update"
            , function (event) {
                handleStreamEvent(event, func);
            });
    }
}