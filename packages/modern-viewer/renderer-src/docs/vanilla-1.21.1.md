# Vanilla 1.21.1, using the action player's connection

The optional vanilla adapter consumes an existing Mineflayer connection. It never
creates or controls a second player. The consuming application owns connection,
authentication, goals, queues and shutdown. No server plugin or privileged account
is required for this adapter.

`host/vanilla-native-stream.mjs` observes decoded packets on that connection and
supplies contiguous sequence numbers to `prepareNativeWorldPreviewHost().attach()`.
Attach before login so registry identity, chunks, entity IDs and dimension changes
are observed. Close the returned stream and viewer when the owning body disconnects.
The inventory helper reads that body's vanilla slots; it does not invent missing
item components or substitute a proxy registry for a modded server.

## Matching resources

The `vanilla-1.21.1` pack contains original client assets, the exact server registry
and the original Chinese language file. `pack.json` records every file's SHA-256,
plus the official source hashes. It contains no client/server JAR, account or world.

```sh
node tools/prepare-viewer-assets.mjs --verify vanilla-1.21.1
node tools/prepare-viewer-assets.mjs vanilla-1.21.1 /absolute/private/viewer-assets
```

The native preview host builds its browser bundle into this private output.
Consumers can use `host/viewer-pack-selection.mjs` with a local catalog:

```json
{
  "schemaVersion": 1,
  "packs": [{
    "id": "vanilla-1.21.1",
    "minecraftVersion": "1.21.1",
    "registry": "vanilla",
    "registrySha256": "55893d269459e1e05387903c77b2db877d7cece875ed31a5a6a2f965822ea546",
    "assetDirectory": "./viewer-assets"
  }]
}
```

Resolve `assetDirectory` relative to the catalog file. Selection requires an exact
version and, when provided, an exact registry hash. Missing or ambiguous matches
are unavailable, never an older-version fallback. This vanilla transport supports
1.21.1 only; selection alone does not add another protocol adapter. A modded server
must provide its matching native registry and transport.

Server-specific gameplay references and texture overlays are separate extensions.
A hostname, chat message or MOTD is not evidence that such a pack is installed.
The vanilla adapter does not load Qiandengji guides or grant server capabilities.

## Reproducing the registry

Run `tools/ExportVanillaRegistry.java` with Java 21 and the extracted **1.21.1** server
JAR plus its bundled libraries on the classpath. Arguments are the matching official
server mappings and a new output directory. Bootstrap only initializes registries;
it does not start a server socket or load a world. The exporter checks `version.json`
and writes UTF-8/LF in deterministic field order. Feed that registry and the exact
client JAR into `tools/native_viewer_assets.py` using a vanilla lock with no mods.
The asset-index hash must match the client version metadata, even if a launcher
has since overwritten its cached index under the same numeric name.

Two independent registry exports produced 1,060 blocks, 26,684 states and 130 entity
types with the same registry hash shown above. All 8,453 pack files passed the
per-file verifier. The live vanilla body supplied its own chunks, motions and
inventory through HTTP/SSE. These are resource/transport checks, **not** a claim of
complete scene, entity, lighting or Java pixel parity; those flags remain false.

Offline regression checks:

```sh
node --test packages/modern-viewer/renderer-src/tools/test/native-world-preview-host.test.mjs packages/modern-viewer/renderer-src/tools/test/viewer-pack-selection.test.mjs packages/modern-viewer/renderer-src/tools/test/vanilla-native-stream.test.mjs
```
