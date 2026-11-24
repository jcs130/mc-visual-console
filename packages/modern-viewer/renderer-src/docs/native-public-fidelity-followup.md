# Public viewer follow-up, 2026-11-09

This is a shared-source candidate. Merging it does not replace a consumer's frozen renderer or restart its observer.

## Changes

- Keep the original selected actor visible when a third-person camera collides within 0.9 blocks. Only explicit first person hides its body. Transient appearance downloads retry with a bounded backoff up to 60 seconds; invalid assets/identity never retry into a substitute.
- Reuse original minimap pixels while position/route overlays remain current. Recapture after terrain commits, movement of two blocks, height changes, or five seconds; one readback at a time, at most one capture per 750ms. Identity/epoch changes clear pixels. No new world/chunk request or game account.
- Paper dropped stacks now carry the same verified vanilla registry provenance required by the native item renderer. Existing original components, custom model data and unavailable registry paths are retained.
- Add nine explicitly audited vanilla weighted-block registrations. `block-seed-inheritance-20261109.json` records original 1.21.1 class hierarchy/registration hashes; no namespace-wide guessed seed.
- Optional `maid-ysm.json` catalog, pinned by `ysmCatalogSha256`, binds an original tracked maid UUID and exact native model/texture choice to a hashed original YSM 2.6.5 bundle. `paper_tracked_maids` identity, world, generation and freshness remain mandatory. No owner/history export or player facade. A model change cannot retain a different maid's projection.

## Evidence and limits

Offline suite: 1,622 passed, 41 pre-existing optional-fixture skips. Additional original maid bundle test passed with 32 bones/180 cubes and preserved PNG/geometry hashes. Real browser WebGL showed that original source with 17 draw calls; this is an isolated preview, not native Java pixel parity.

Public CorMy sessions confirmed the original model loads in a fresh browser. The owning frame callback regression also covers camera distance 0.5 blocks and first-person hiding. This does not prove every old tab/device is recovered. Public baseline/candidate CPU samples used software WebGL and different live scenes: readback samples were 4,072ms/424ms over 20 seconds; those samples are not a controlled FPS comparison. The deterministic stationary-map test eliminates repeated readbacks inside five seconds while updating coordinates.

Maid YSM seated/bed poses, held equipment/backpack layers, other unsupported original entities and full scene/light parity remain explicitly unverified. Original rig clips and live facing/walking are used; unsupported native inputs are reported, not replaced with another model.

Deployment must freeze matching host, browser and immutable catalog, record actual served hashes and verify embedded/full-page consumers. The game-side observer must also supply actual `ysmModelId`/`ysmTexture`; old observers correctly remain unavailable. Roll back code/catalog pointers only, preserving current world, identities, inventories and receipts.
