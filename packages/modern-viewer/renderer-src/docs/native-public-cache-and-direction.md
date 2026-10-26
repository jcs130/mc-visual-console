# Shared spectator cache and direction corrections

This is source-level work, not proof that a downstream deployment has restarted.
Freeze matching browser and observation-host code. Java 1.21.1 is the native
resource target; legacy 1.20.6 compatibility remains independently tested.

## Terrain and resource transfer

`native-terrain-wire.js` now supports bounded multiple splices in addition to
the existing single-span format. A view moving one block changes the edges of
many rows: the former prefix/suffix span retransmitted unchanged middle rows.
Unique coordinate/row anchors preserve exact order, duplicates, fractional
provider coordinates, state IDs and hidden-solid collision runs. Choose this
format only when smaller; cap at 4,096 spans and the existing array limit.
Decoding rejects invalid baseline/epoch/registry, overlap, bounds and oversize
output. New connections still need a full snapshot. An old browser does not
decode multiple splices, so rebuild both sides with the same verified digest.

An isolated replay of seven overlapping subwindows from an actual 17,350-block
Paper scene reduced JSON from 2,600,423 to 1,251,943 bytes and equivalent gzip
from 503,483 to 215,622 bytes (57.17%). Every reconstructed frame deep-equalled
its input. Local encoding changed from roughly 16–23 to 25–30ms per update.
This is a bandwidth/CPU comparison, not a claim about live WAN startup speed.

`SpectatorAssetCache` previously stopped coalescing beyond eight unique misses
and let excess requests bypass it. It now queues up to 256 unique misses behind
eight active loads. Requests for the same queued path share one result. Queue
overflow returns 429; invalidation cancels queued/active reads, and cached bytes
still require fresh viewer authorization. Per-source LRU byte limits are
unchanged. The relay state exposes hit/miss/coalescing/active/queued counters.
No global public resource URL, disk cache or additional gameplay connection is
introduced. Large or uncacheable assets retain the existing streaming fallback.

## YSM direction and held items

Paper head/body relative yaw now matches the original Mineflayer YSM query.
The Y-down head bone converts handedness exactly once. This fixes models whose
original run animation banks `Root.rotation.z` from `ysm.head_yaw`, without
flipping every animation Z channel or editing model assets.

Legacy `minecraft-renderer` mob main/off-hand attachment is corrected at the
drawing boundary using observed LeftHanded metadata. Player slots and raw
equipment arrays are not exchanged. Native ModelPart held-item mounting is
tested against independent Java/JOML matrices and original item display data.

Inactive bows/crossbows use exact 1.21.1 models selected from observed use state
and complete charged-projectile components (standby, arrow, firework). Legitimate
override-to-base-model inheritance is separated from actual parent cycles.
Missing active pull/charge progress and unsupported special trident geometry
remain unavailable, not invented animations.

## Validation

- Shared renderer suite: 1,354 passed, 39 existing conditional asset skips.
- Transport/delta/cache regression: 51 passed, including 48 concurrent HTTP
  reads across 12 textures, one upstream read per texture, 32-viewer single SSE,
  queue cancellation/revocation and malformed terrain patches.
- Original 1.21.1 mob and ranged-item tests: 8 passed without skips.
- Explicit legacy version/asset/equipment checks: 12 passed; both TypeScript
  projects passed.
- Actual browser isolated original-resource rendering covers bow/crossbow in
  both hands, sword/axe and the original Cormy model. It is not Java pixel parity
  or a production multiplayer latency test. Original assets/private captures
  remain outside this source change.

For deployment planning, [BlueMap's tile serving design](https://bluemap.bluecolored.de/wiki/webserver/ExternalWebserversFile.html)
is useful for static world geometry; [HTTP caching rules](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching)
apply to immutable verified resources. Neither replaces the separate live
pose/HUD stream or justifies exposing private model paths to a public CDN.
