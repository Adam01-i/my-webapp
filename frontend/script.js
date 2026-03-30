async function fetchAPI(url, elementId, statusId) {
    try {
        const response = await fetch(url);
        const data = await response.json();
        document.getElementById(statusId).innerHTML = '✅ Connecté';
        document.getElementById(elementId).innerHTML = JSON.stringify(data, null, 2);
    } catch (error) {
        document.getElementById(statusId).innerHTML = '❌ Erreur de connexion';
        document.getElementById(elementId).innerHTML = error.message;
    }
}
const nodeUrl = 'https://node-route-adam01-i-dev.apps.rm3.7wse.p1.openshiftapps.com';
const pythonUrl = 'https://python-route-adam01-i-dev.apps.rm3.7wse.p1.openshiftapps.com';
fetchAPI(nodeUrl, 'node-data', 'node-status');
fetchAPI(pythonUrl, 'python-data', 'python-status');