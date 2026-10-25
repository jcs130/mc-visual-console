# Shared cloud observation

`createSpectatorRelay({sharedStreams:true, cacheAssets:true, maxViewers:32, ...})`
keeps one upstream SSE per authorized publisher channel. It still uses the
original native renderer, models, textures, motion samples and camera modes.
The browser renders the scene; this is not a video transcoder or another
Minecraft login. Existing consumers keep their previous behavior by default.

Late visitors receive the current identity, one full terrain checkpoint, its
ordered `snapshot_delta` chain and the latest pose/presentation. Old effects,
attacks, sounds and Agent output are not replayed. Epoch changes clear the
bootstrap. A 128-delta/24 MiB bound requests one fresh checkpoint; missing
events for ten seconds closes the stale stream. Every browser must still pass
the consumer's current authorization, including cache hits.

Original assets are coalesced and cached within the source instance: 64 MiB
LRU, 8 MiB per entry, eight concurrent cache misses. Larger assets keep the
bounded original transport. Live status, manifests and Agent status are not
asset cache entries. Original asset routes remain private and revalidate via
ETag; only the existing hash-addressed application code is globally public.

Each downstream obeys its own backpressure. Consecutive obsolete motion/HUD
samples are coalesced, terrain order is preserved, and a slow consumer is
disconnected at a bounded queue rather than stalling other spectators. See
[Node stream backpressure](https://nodejs.org/download/release/latest-jod/docs/api/stream.html)
and [EventSource reconnection](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events).

The portal owns visibility and redaction. It must call `relay.invalidate(id)`
**before** changing scope/ownership, retiring the old source and all caches.
Do not publish a private source and attempt to hide inventory with CSS.

Validation: isolated HTTP/WS tests connect 32 spectators to one upstream and
16 concurrent asset readers to one exact-byte read. Tests cover late joins,
delta reconstruction, old epochs, UTF-8 boundaries, slow clients, permission
revocation and cache invalidation during a fetch. These fixtures do not prove
32 real mobile renderers or production WAN capacity. Runtime deployment must
freeze the shared site and home renderer together.

Run `node --test tools/test/spectator-fanout.test.mjs tools/test/spectator-relay.test.mjs`
from `renderer-src`.
