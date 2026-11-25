// Server deployments expose only same-origin URLs; credentials stay on the server.
const starwoodServer = location.pathname.startsWith('/starwood/');
window.STARWOOD_CHAT = { endpoint: starwoodServer ? '/api/starwood/chat' : '' };
window.STARWOOD_LEARNING = { endpoint: starwoodServer ? '/api/starwood/learning' : '' };
