# Original Touhou Little Maid models in Paper observation

The Java-compatible server stream projects a maid to an Allay. That packet alone
does not contain the original maid model ID. Do not infer a maid from an Allay,
display name, owner, location, or a nearby character.

The observation adapter accepts `nativeMaids` from the authenticated server
observation source. The target player UUID, world UUID, dimension and stream
generation must match, and an existing received entity must match both UUID and
entity ID. Despawn and world reset remove the binding. Only public render state
is included; the supplement never creates entities or reveals maid inventories.

`tools/export-tlm-maid-bundles.py` exports the original definitions, geometry and
PNG from the pinned original TLM 1.5.3 JAR. Each immutable bundle and file is
verified by SHA-256. Configure the worker's optional `maidAppearance` with an
absolute export directory and the printed catalog digest. The host asynchronously
loads these bundles, shares a bounded cache, and serves them through the existing
hashed appearance endpoint. World and HUD delivery do not await model I/O.

The browser retains original bones, pivots, UVs, authored cube transforms and
render scale. Static faces are combined per bone, preserving animated hierarchy.
Original ordered inner animations support walking, facing, idle, blinking,
sitting and the supported state-specific motions. Facing uses the existing
received-sample jitter buffer; it does not predict new movement.

Original implementation reference: [Touhou Little Maid](https://github.com/TartaricAcid/TouhouLittleMaid),
`MaidModelInfo.decorate`, `MaidBaseAnimation`, `MaidExtraAnimation`,
`MaidArmorAnimation`, and `EntityBaseAnimation` on the 1.21 branch, checked against
the pinned 1.5.3 JAR. Upstream code is MIT; exported assets retain upstream's
CC-BY-NC-SA-4.0 attribution. JARs, generated bundles and private captures are not
committed to this repository.

## Verification and boundaries

The matched isolated Youer 1.21.1 server supplied real clocklalier, wine fox and
Reimu entities through WorldObserver into desktop and portrait browser WebGL.
Standing, sitting, position updates and despawn passed. These models use 41, 88
and 31 bone draw calls respectively, instead of one draw per original face.
The count is a rendering-work measurement, not a production FPS guarantee.

The exporter found 254 definitions/variants and could export resources for 249.
A separate geometry audit accepted 241; this is not full-model compatibility.
GeckoLib animation JSON is explicitly unavailable, and unsupported custom
animations, equipment/backpack layers, sleeping orientation, baby scaling and
swimming retain specific diagnostics. Do not substitute an Allay or an unrelated
model after a recognized original binding fails. Complete Java pixel/material/
scene parity remains false.

This integration is for `paper_server_observation`. A direct Minecraft client
adapter must supply its own authenticated, matching tracked render state; merely
copying the renderer into a Web play host does not create that data source.

Shared full regression: 1,590 passed, 39 pre-existing conditional skips. The
initial full run's six missing-dependency failures were resolved by configuring
the existing test dependencies; no production dependencies were modified.
Source, a frozen consumer build, cloud installation and production pixels remain
separate acceptance stages. This document currently records the candidate stage.
