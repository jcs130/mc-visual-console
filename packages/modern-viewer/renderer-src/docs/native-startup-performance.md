# Native observer startup

The portal can preload the exact, operator-built `native-console.js` from
`site.preload()` while its private world source is being prepared. Only immutable
application code is exposed by this helper. Pages, manifests, original resources,
models, inventory and live state still require the existing viewer authorization.
Consumers should default a new observation to `/watch/:id/third/`, preserve an
explicitly selected camera mode, and poll a pending source more promptly than an
already established observation. This does not change action clients' first-person
default or the source identity/lease.

## Cache writes are not part of scene preparation

Previously every original asset awaited `CacheStorage.put`, listed every cache
key, and evicted entries before returning downloaded bytes. On the measured Windows
browser this serialized many small disk operations into the model dependency chains.

Original-asset persistence is now optional background work: one writer, at most
256 pending assets of 64 KiB (16 MiB), a SHA-256 check before storing, and eviction
every 32 writes or at drain. Steady storage is 512 entries (32 MiB maximum at the
default file limit); a writer may temporarily exceed that by 32 entries. Cache
overflow/quota errors only skip persistence. Downloads and cache hits still pass
the original manifest length/SHA checks. Private uploads and live game state are
not eligible. `flush()` exists for deterministic tests, not foreground rendering.

Original model-layer metadata, the two colormaps and the appearance catalog start
in parallel after the manifest. Model prefetch remains bounded to eight dependency
chains; increasing this to sixteen did not improve the HTTP/1 latency fixture and
was not retained. No model, texture, block state or collision data is substituted.

The native viewport exposes bounded duration-only `data-startup-timing` diagnostics:
manifest, bootstrap, first decoded snapshot, model readiness and first terrain
render. `data-terrain-progress` now separates prefetch and preparation time.
Model readiness alone is not proof of visible pixels.

## Isolated acceptance (2026-10-25)

Using the same captured original 18,410-block NEKO scene/model and a clearly
labelled loopback replay (zero Minecraft connections and zero LLM calls):

| Measurement | Previous deployed renderer | Candidate |
| --- | ---: | ---: |
| Cold terrain build, loopback | 27.254 s | 3.082 s |
| Cold terrain build, 150 ms extra delay per resource request | 31.906 s | 14.718 s |
| Complete first terrain render in the delayed candidate | — | 16.033 s |
| Repeat page load with populated original-asset cache, same delay | — | 3.059 s |

Actual WebGL showed the original NEKO, held shield, terrain and third-person
follow. The fixture's small scripted movement is not autonomous Agent play.
The production page observed before the change took 57.884 s for its first terrain
build; that different live scene is diagnostic evidence, not an apples-to-apples
performance comparison. Public WAN, mobile and multi-viewer timings still require
consumer deployment and separate acceptance. Generated bundles/private captures
stay outside Git.
