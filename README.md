Nostr-DHT is a client side library for deterministically mapping pubkeys to relays without central coordination.

If you're building Nostr apps you can use this to make them more decentralized by publishing to and reading from the deterministic relay set for a given key.

It uses Kademlia-style XOR-distance routing. Each pubkey is deterministically assigned to the relays with URLs that hash closest by XOR distance to the pubkey's hash, enabling clients to independently discover where any participating pubkey publishes without central coordination. It does not use Kademlia style recursive lookup, instead building an exhaustive relay list using broadcast discovery. See the "[about](#about)" section below for an explanation.

You can use this to publish and discover a pubkey's events like kind 0 metadata and NIP-65 relay lists, or any other event, avoiding coordination on large centralized relays.

# Install

```shell
npm i nostr-dht
```

Or import from a CDN.

# Use

## Basic use

```
// gather a list of relays from kind:10002 events
const relays = await discoverRelays(boostrapRelays);
// perform a lookup for the npub relay set over all relays
const closestRelays = await getClosestRelays(npub, relays);
```

To differentiate by namespace, e.g. on a per-application basis, you can append or hash the namespace with the npub `namespace + npub`. This will yield a set of relays unique to the namespace and npub. You also use any other string in place of the npub to find the "closest" relay set to that string.

## Example

Browser:

```html
<script type="module">
  import { discoverRelays, getClosestRelays } from 'https://cdn.jsdelivr.net/npm/nostr-dht/nostr-dht.js';

  const bootstrapRelays = ["wss://relay.damus.io", "wss://relay.snort.social", "wss://nos.lol"];

  // Discover relays
  const relays = await discoverRelays(bootstrapRelays, /* { previousRelays: localStorage["relays"] } */);

  // Cache relays
  // localStorage["relays"] = JSON.stringify(relays);

  // Find the 8 closest relays for a given npub
  const npub = "npub1m2f3j22hf90mt8mw788pne6fg7c8j2mw4gd3xjsptspjdeqf05dqhr54wn";
  const closestRelays = await getClosestRelays(npub, relays, { n: 8 });

  console.log(`\nTop 8 relays for ${npub}:`);
  closestRelays.forEach(url => console.log(url));
</script>
```

In Node.js the code is the same but use `import * from 'nostr-dht';` instead.

Or use require: `const dht = require('nostr-dht')`.

## Command-line

You can also run `nostr-dht` from the command line to discover relays and find the closest ones for a given `npub`.

```shell
npx nostr-dht [npub]
```

If you don't provide an `npub`, it will use a default test `npub`.

# About

How it works.

- The library starts with a small set of bootstrap relays.
- From those it builds a list of relays by filtering for `kind:10002` events.
- Each relay is then hashed and stored.
- To look up an npub (or any other string) the value is hashed.
- The hash is XOR-distance compared with the relay list hashes.
- The result is a set of N relays "close" to the npub.

# Goal

The goal of this library is to reduce centralization on events on large relays.

# Eclipse Attacks

The main threat to participants in any DHT is the eclipse attack. The attacker uses node IDs such that they occupy all of the closest nodes to the target. This DHT is vulnerable
