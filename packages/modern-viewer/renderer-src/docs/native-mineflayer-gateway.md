# Native Mineflayer gateway adapter

`host/native-mineflayer.mjs` exports `prepareNativeConnection({assetDirectory, viewerPort})`.
Prepare it before logging in, then attach synchronously to the existing action bot:

```js
const prepared = await prepareNativeConnection({assetDirectory: matchedAssets, viewerPort: 3007})
const bot = mineflayer.createBot(connectionOptions)
const native = prepared.attach(bot)
// Later, once this same bot has spawned:
await native.listen()
native.query({action: 'inventory'})
// Dispose together with the action connection:
await native.close()
```

No second Minecraft account, game writes, model loop or server discovery is created. The caller owns reconnection. The HTTP host binds loopback and follows the existing original-resource reader and bounded SSE lifecycle.

Transport: `mcviewer:native_packet`, `MCNP` magic plus deflateRaw of a V8 serialized v1 envelope. Accept only the exact 1.21.1 native state-registry SHA, monotonic sequence, supported names, and bounded wire/decoded sizes. Registry snapshots and all inventory/entity/chunk observations belong to this connection before vanilla projection. Unknown menus cannot borrow a coincidentally valid vanilla layout. Disconnect, epoch changes and gaps retire cached native state.

`status`, `inventory`, `block` (absolute integer coordinates), and `entities` are read-only queries. Block/entity queries filter unobserved cells, distance and visibility. Original static collision geometry is labelled with its source and `playerContextVerified:false`; it is not a native pathfinder implementation. Missing required components remain an explicit codec error alongside the original identity/count, never an empty slot.

`nativeItemIdentity(item)` reads a nonenumerable `Symbol.for('mcviewer.native_item.v1')` alias after matching original and projected window/stateId/slot/count. It leaves the Prismarine Item and wire operation unchanged. Consumers may use it for original-ID selection; it is revoked on stale updates, unknown menus and teardown.

Original-resource fidelity and actual WebGL scene parity remain separate. FOM QA rendered original Create casing, Farmer tomato crate and experience block, original casing/rice icons, and the TLM seven-frame soul-slab sprite. The owner UUID component is encoded with its original typed int array. GUI glint atlas UV remains unavailable. Native static item admissions are tied to original constructor/source evidence, not filenames alone. Unknown mod renderers, resource priority conflicts, all NPCs and Java pixel parity are not accepted by this incremental adapter.

The portable native host hashes its included renderer/host sources without requiring a sibling vanilla-wrapper directory. Ordinary viewer release verification still hashes the existing sibling wrappers. Original pack resources, runtime bundles and private player captures are not committed with this change.
