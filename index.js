// TODO
// - [ ] Filter out invalid relays during discovering
// - [ ] Ability to pass in a previous discovery list and merge with it

/**
 * Calculates the SHA-256 hash of a string in a way that is compatible with both Node.js and browsers.
 * @param {string} str - The string to hash.
 * @returns {Promise<Uint8Array>} A promise that resolves to the hash as a Uint8Array.
 */
async function sha256(str) {
    if (typeof WebSocket === 'undefined') {
        // Node.js environment
        const crypto = require('crypto');
        const hash = crypto.createHash('sha256');
        hash.update(str);
        return new Uint8Array(hash.digest());
    } else {
        // Browser environment
        const textAsBuffer = new TextEncoder().encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', textAsBuffer);
        return new Uint8Array(hashBuffer);
    }
}

/**
 * Calculates the XOR distance between two Uint8Arrays.
 * @param {Uint8Array} buf1 - The first buffer.
 * @param {Uint8Array} buf2 - The second buffer.
 * @returns {bigint} The XOR distance as a BigInt.
 */
function xorDistance(buf1, buf2) {
    let distance = 0n;
    const len = Math.min(buf1.length, buf2.length);
    for (let i = 0; i < len; i++) {
        const xor = buf1[i] ^ buf2[i];
        distance = (distance << 8n) + BigInt(xor);
    }
    return distance;
}


/**
 * Discovers Nostr relays by querying bootstrap relays for kind 10002 events.
 * @param {string[]} bootstrapRelays - An array of WebSocket URLs for bootstrap relays.
 * @param {object} [options] - Optional parameters.
 * @param {number} [options.timeout=10000] - Time in milliseconds to wait for each relay to respond.
 * @param {number} [options.limit=1000] - The number of kind 10002 events to request from each relay.
 * @returns {Promise<Array<{url: string, hash: Uint8Array}>>} A promise that resolves to an array of unique discovered relay URLs with their hashes.
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

    const relayUrls = Array.from(discoveredRelays);
    return Promise.all(relayUrls.map(async (url) => {
        const hash = await sha256(url);
        return { url, hash };
    }));
}

/**
 * Finds the N closest relays to a given ID using XOR distance.
 * @param {string} id - The ID to find relays for (e.g., an npub).
 * @param {Array<{url: string, hash: Uint8Array}>} relays - A list of relays with their hashes, as returned by discoverRelays.
 * @param {object} [options] - Optional parameters.
 * @param {number} [options.n=8] - The number of closest relays to return.
 * @returns {Promise<string[]>} A promise that resolves to an array of the N closest relay URLs.
 */
async function getRelays(id, relays, { n = 8 } = {}) {
    const idHash = await sha256(id);

    const relaysWithDistance = relays.map(relay => {
        const distance = xorDistance(idHash, relay.hash);
        return { url: relay.url, distance };
    });

    relaysWithDistance.sort((a, b) => {
        if (a.distance < b.distance) return -1;
        if (a.distance > b.distance) return 1;
        return 0;
    });

    return relaysWithDistance.slice(0, n).map(r => r.url);
}

// Export for CommonJS/Node.js and handle direct execution
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { discoverRelays, getRelays };
    // If run directly from Node.js
    if (require.main === module) {
        console.log('Running relay discovery directly...');
        const bootstrap = ["wss://relay.damus.io", "wss://relay.snort.social", "wss://nos.lol"];
        discoverRelays(bootstrap).then(async (relays) => {
            console.log(`Discovered ${relays.length} unique relays.`);

            const sortedRelays = relays.sort((a, b) => a.url.localeCompare(b.url));
            if (sortedRelays.length > 20) {
                sortedRelays.slice(0, 10).forEach(r => console.log(r.url));
                console.log('...');
                sortedRelays.slice(-10).forEach(r => console.log(r.url));
            } else {
                sortedRelays.forEach(r => console.log(r.url));
            }

            const testId = process.argv[2] || "npub1m2f3j22hf90mt8mw788pne6fg7c8j2mw4gd3xjsptspjdeqf05dqhr54wn";
            console.log(`\nFinding the 8 closest relays for ${testId}:`);
            const closest = await getRelays(testId, relays);
            closest.forEach(r => console.log(r));
            console.log("\nPass an npub as the first argument to find the closest relays.");
        }).catch(console.error);
    }
}
