/**
 * Discovers Nostr relays by querying bootstrap relays for kind 10002 events.
 * @param {string[]} bootstrapRelays - An array of WebSocket URLs for bootstrap relays.
 * @param {object} [options] - Optional parameters.
 * @param {number} [options.timeout=10000] - Time in milliseconds to wait for each relay to respond.
 * @param {number} [options.limit=1000] - The number of kind 10002 events to request from each relay.
 * @returns {Promise<string[]>} A promise that resolves to an array of unique discovered relay URLs.
 */
async function discoverRelays(bootstrapRelays, { timeout = 10000, limit = 1000 } = {}) {
    // In Node.js, WebSocket is not global and needs to be required.
    // In browsers, WebSocket is global.
    const WebSocketImpl = (typeof WebSocket === 'undefined') ? require('ws') : WebSocket;

    const queryRelay = (relayUrl) => {
        return new Promise((resolve) => {
            let ws;
            try {
                ws = new WebSocketImpl(relayUrl);
            } catch (e) {
                console.error(`Failed to connect to ${relayUrl}: ${e.message}`);
                return resolve(new Set());
            }
            
            const relaysFromThisSocket = new Set();
            let timer;

            const cleanUp = () => {
                if (timer) clearTimeout(timer);
                if (ws.readyState === WebSocketImpl.OPEN || ws.readyState === WebSocketImpl.CONNECTING) {
                    ws.close();
                }
                resolve(relaysFromThisSocket);
            };

            timer = setTimeout(cleanUp, timeout);

            ws.onopen = () => {
                const subId = `discover-${Math.random().toString(36).substring(2, 8)}`;
                ws.send(JSON.stringify(["REQ", subId, { "kinds": [10002], "limit": limit }]));
                
                ws.onmessage = (event) => {
                    try {
                        if (typeof event.data !== 'string') return;
                        const data = JSON.parse(event.data);
                        if (data[0] === "EVENT" && data[1] === subId && data[2]) {
                            const eventData = data[2];
                            if (eventData.kind === 10002) {
                                eventData.tags.forEach(tag => {
                                    if (tag[0] === 'r' && tag[1] && (tag[1].startsWith('wss://') || tag[1].startsWith('ws://'))) {
                                        relaysFromThisSocket.add(tag[1]);
                                    }
                                });
                            }
                        } else if (data[0] === "EOSE" && data[1] === subId) {
                            cleanUp();
                        }
                    } catch (e) {
                        // Ignore JSON parse errors on incoming messages
                    }
                };
            };

            ws.onerror = (err) => {
                console.error(`WebSocket error on ${relayUrl}: ${err.message}`);
                cleanUp();
            };
            
            ws.onclose = () => {
                // This ensures the promise resolves even if the connection closes unexpectedly.
                cleanUp();
            };
        });
    };

    const promises = bootstrapRelays.map(queryRelay);
    const results = await Promise.all(promises);

    const discoveredRelays = new Set();
    results.forEach(resultSet => {
        resultSet.forEach(relay => discoveredRelays.add(relay));
    });

    return Array.from(discoveredRelays);
}

// Export for CommonJS/Node.js and handle direct execution
if (typeof module !== 'undefined' && module.exports) {
    module.exports = discoverRelays;
    // If run directly from Node.js
    if (require.main === module) {
        console.log('Running relay discovery directly...');
        const bootstrap = ["wss://relay.damus.io", "wss://relay.snort.social", "wss://nos.lol"];
        discoverRelays(bootstrap).then(relays => {
            console.log(`Discovered ${relays.length} unique relays:`);
            relays.sort().forEach(r => console.log(r));
        }).catch(console.error);
    }
}
