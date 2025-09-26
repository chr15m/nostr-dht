Nostr-DHT is a client side library for deterministically mapping pubkeys to relays without central coordination.

If you're building Nostr apps you can use this to make them more decentralized, by automatically publishing to and reading from the relays for a given key.

It uses Kademlia-style XOR-distance routing. Each pubkey is deterministically assigned to the relays with URLs that hash closest by XOR distance to the pubkey's hash, enabling clients to independently discover where any participating pubkey publishes without central coordination.

You can use this to publish and discover a pubkey's events like kind 0 metadata and NIP-65 relay lists, or any other event, avoiding coordination on large centralized relays.

# Install

```shell
npm i nostr-dht
```

# Use

```javascript
const { discoverRelays, getClosestRelays } = require('nostr-dht');

async function main() {
    const bootstrapRelays = ["wss://relay.damus.io", "wss://relay.snort.social", "wss://nos.lol"];

    // Discover relays
    const relays = await discoverRelays(bootstrapRelays, /* { previousRelays: cachedRelays } */);

    // Cache relays
    // localStorage["relays"] = JSON.stringify(relays);

    // Find the 8 closest relays for a given npub
    const npub = "npub1m2f3j22hf90mt8mw788pne6fg7c8j2mw4gd3xjsptspjdeqf05dqhr54wn";
    const closestRelays = await getClosestRelays(npub, allRelays, { n: 8 });

    console.log(`\nTop 8 relays for ${npub}:`);
    closestRelays.forEach(url => console.log(url));
}

main().catch(console.error);
```

# About

How it works.

- The library starts with a small set of bootstrap relays.
- From those it builds a large list of known relays by filtering for `kind:10002 events.
- Each relay is then hashed.
- To look up an npub (or any other string) the value is hashed.
- The hash is XOR-distance compared with the relay list hashes.
- The result is a set of N relays "close" to the npub.

# Goal

The goal of this library is to reduce centralization on events on large relays.
