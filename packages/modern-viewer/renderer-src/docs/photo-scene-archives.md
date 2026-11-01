# Photograph scene archives

`host/photo-scene-archive.mjs` records the native photographer's **already received** world. It calls only `visual_frame`, `visual_registry` and `visual_chunk`; it does not log in, move a body, load server terrain or claim a controller.

The gzip JSON schema is `mc-photo-scene/v1`. A record contains the server-issued photograph ID, real owner/world UUID, original PNG digest and dimensions, camera coordinates/angles, native dimension/epoch, original block-state and biome registries, received section palettes and both light arrays, observed entity poses/equipment, and optional exact model/resource references. Chunks retain their revisions and observation timestamps. Missing/changing columns remain explicit. Readback checks the compressed digest, photo ID, owner, size and decompression budget.

Consumers retain immutable resources under their SHA256 and upload each once to private object storage. Resource bytes and selected encrypted originals are preserved; encryption is not removed. No credentials, capture capabilities, private inventory contents or authentication commands belong in an archive. The original PNG remains deliverable if its companion scene fails; the failure must be reported separately.

This is a bounded scene record, **not a complete world save or a complete replay**. Block-entity contents, complete entity metadata and the native projection matrix are not currently exported. A missing field of view, undisclosed geometry or unloaded distant terrain cannot be reconstructed accurately. Existing photographs cannot acquire a historical scene from a newer world observation.

## November 1, 2026 candidate acceptance

Six archive checks cover observation identity/epoch, photo ownership, missing columns, bounded inflation, private fields and immutable storage. A real native client produced a 49-column record with 52 nearby entities, 26,684 block states, 163 biomes and 15 exact resource references in 2.348 seconds; gzip was 522,194 bytes versus 11,528,753 raw JSON bytes. This was a private read-only QA capture, not a production player photograph or proof of reconstruction pixel parity.

The shared browser now exposes the actual server model/version and explicitly distinguishes native-only encrypted appearances from available public geometry. It does not silently replace them with a default character. Inventory panels are layered above the toolbar so their close controls remain accessible. Source publication does not update a copied consumer: freeze matching renderer/host modules, rebuild, and retain strict browser/console bundle checks before activation.
