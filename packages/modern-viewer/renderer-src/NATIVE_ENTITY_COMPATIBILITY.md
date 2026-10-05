# Native entity renderer maintenance

Updated: 2026-10-05. This is a source and protocol compatibility record, not acceptance of full Java-client scene parity.

## Current rendering contract

The native entity registry contains 257 registered types. A registration, exported texture, or renderer-class listing does not mean that the type can be rendered. The implemented factory currently accepts six exact Minecraft 1.21.1 types: `minecraft:pig`, `minecraft:cow`, `minecraft:chicken`, `minecraft:sheep`, `minecraft:slime`, and `minecraft:villager`.

Relevant modules:

- `tools/native-world-host.mjs`: receives the action player's native entity packets; maintains the bounded state and snapshots.
- `src/native-viewer/native-entity-model.js`: original `ModelPart` cube geometry, UVs, pivots and rotations.
- `src/native-viewer/native-entity-motion.js`: matched client tick/interpolation and species-specific animation inputs.
- `src/native-viewer/native-entity-dispatch.js`: source-bound factory, original textures and metadata validation.
- `src/native-viewer/native-entity-layer.js`: scene ownership, asynchronous generations and actor disposal.

`createNativeEntityActor(reader, entity, { registries })` returns `{ root, update(entity, now), dispose(), assetInfo }`. It fails explicitly for unsupported types or required state instead of creating a replacement. Village profession/type numeric IDs are resolved using the same account's verified `server_builtin_registries` data. They are not inferred from a Mineflayer proxy registry.

`entitySnapshot(bounds)` exports `source: received_native_entity_packets`, the native registry SHA-256, world epoch, entity revision, native degree rotations, and visible entities with their received ID, UUID, type ID, full namespace, position, velocity, metadata, equipment and recent cues. Supported motion has `source: same_connection_entity_ticks`. Client constructor and `defineSynchedData` defaults are used only where the locked original client establishes those defaults; arbitrary unknown mod defaults are rejected.

The state is sourced from the existing action connection. It does not scan the world, load disk chunks, create another player, or query hidden entities. Browser time interpolates received tick state and does not create simulation ticks. Full animation and scene parity flags remain false until a matched modded Java-client comparison is accepted. Fire/glow, unsupported poses and unsupported equipment layers remain explicit limitations.

## Retained-state and serialization budgets

The entity stream permits 512 tracked entities, at most 16 KiB per metadata/equipment value, 64 KiB of encoded metadata plus equipment per entity, and 2 MiB across all tracked entities. Replacement accounts only its byte delta; destroy, ID reuse, unavailable state and world reset release those counters. Exceeding a retained-state budget clears the entity stream with an explicit reason and leaves the independent terrain stream usable. It never silently drops metadata keys or selected entities to claim completeness.

The wire entity snapshot is separately limited to 128 KiB. Its encoding cost is checked incrementally before adding each entity. An oversized snapshot is unavailable with an empty entity list, not a partially emitted list. The host's overall event budget still applies.

There is one cached snapshot for the current entity revision and bounds, rather than a cache for every camera position. Metadata/equipment/cue arrays and their exact encoded cost are cached across ordinary motion ticks. Nested JSON values are detached from incoming packets and iteratively frozen once on receipt; cue rows are frozen; each detached motion snapshot is deeply frozen. Consumers cannot rewrite the retained state or invalidate the counted sizes through shared snapshot references. Reset and unavailable paths discard the caches.

Regression coverage includes aggregate/per-entity budgets, replacement accounting, destroy/ID reuse, incremental oversize rejection, cached revisions, actual tick updates, clock errors, nested mutation attempts and recovery after a new world epoch. These tests exercise the packet consumer without a game connection.

The locked 1.21.1 protocol's `optional_component`, `optional_block_pos`, `optional_uuid` and `optional_global_pos` use a bool-prefixed option codec. An own `value: undefined` is a legitimate absent value and survives the private v8 envelope. These four exact types are serialized to JSON as `value: null, nativeOptionalAbsent: true`; a later present value removes that marker. Required missing values, a missing value property, numeric/unknown optional types and invalid metadata still fail closed. Bounded error details contain only packet/sequence/entity/key/type and presence flags, never the metadata value.

Protocol fixtures cover the actual locked codec, v8 and host absent/present round trip. To include the codec test with the current private deployment, set `NATIVE_METADATA_CODEC_MODULE` to the installed `minecraft-protocol/src/transforms/serializer.js`, then run `node --test tools/test/native-world.test.mjs`. This regression does not identify the old live failure entry: the earlier capture retained only `NATIVE_ENTITY_METADATA_INVALID`, so its exact historical cause remains unproven.

## Touhou Little Maid: verified current source

The installed source is `touhoulittlemaid-1.5.3-neoforge+mc1.21.1.jar`.

```text
SHA-256 f6db04195820c8508704277ea76d63723804ff236a7b780369ba59ebe5cd9c27
Minecraft client SHA-256
499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99
```

The private resource export used for this audit is `E:/QiandengJiSocietyLab/assets/native-20261005-v4`. Generated assets, JARs, decompilations and private packet captures are not stored in Git. Source inspection is under `E:/QiandengJiSocietyLab/research/maid-render-audit-20261005`.

The same action connection's current maid packet identifies native type `touhou_little_maid:maid` (type ID 131 in this registry) and supplies metadata key **23**, serializer `string`:

```text
touhou_little_maid:hakurei_reimu_type_b_1720614ea46709023787aae005df1134
```

Key 23 is the matched `EntityMaid.MODEL_ID` accessor, following the original superclass accessor allocations. Do not reuse this numeric key for a different version. The constructor's unmodified model default is `touhou_little_maid:hakurei_reimu`; that is not the currently received type-B variant.

The suffix is meaningful. `CustomModelPack.decorate()` expands `extra_textures` with the lowercase MD5 of the texture resource's path. Here:

```text
MD5("textures/entity/hakurei_reimu_vengeful.png")
= 1720614ea46709023787aae005df1134
```

Thus the selected variant uses the type-B geometry and the original **vengeful** texture. Removing the suffix or choosing the plain type-B PNG would render the wrong appearance.

All paths below are relative to the resource export, with prefix:

```text
assets/touhou_little_maid/tlm_custom_pack/touhou_little_maid-1.0.0/assets/touhou_little_maid/
```

| Source resource | SHA-256 |
| --- | --- |
| `maid_model.json` | `611335f5f83fa314393a0c59f2c2d2d873e232a6e3fd77fb2d0915f7009269bc` |
| `models/entity/hakurei_reimu_type_b.json` | `1aac31d5759bc75d728a855bd366b1689800e747478179ec1fb8b1f255a8aa18` |
| `textures/entity/hakurei_reimu_vengeful.png` | `992c4642a89d65577f24549c9fd71cce1c5fbc4e65f90506ade4b4db89626a48` |

These are nested custom-pack resources, not resources at the ordinary top-level `assets/touhou_little_maid/models/entity/` path. The current manifest records their exact source and no competing byte variants. This establishes source integrity, **not the active custom-pack priority** of every possible Java client. `CustomPackLoader` also reads client-local `tlm_custom_pack` content. An active pack/definition digest or an explicitly verified locked-default-pack contract is required before claiming appearance parity; unverified overrides remain unsupported.

## Required original maid geometry and animation

The selected model is Bedrock format `1.12.0`, with a 128×128 texture, 73 bones, 28 zero-thickness cubes and two cubes using per-face UV declarations. It includes rotated/inflated cubes and visibility-controlled blink/hurt/sitting parts. The current vanilla cube helper does not implement all of these Bedrock rules; rejecting zero-thickness cubes or converting everything to ordinary box UVs would remove real content.

Original implementation paths (all under `com/github/tartaricacid/` in the locked JAR):

- `touhoulittlemaid/client/renderer/entity/EntityMaidRenderer`: chooses the model/texture and registers held-item, head, backpack, back-item and banner layers; it also dispatches YSM and Gecko model paths and fires `RenderMaidEvent`.
- `simplebedrockmodel/client/bedrock/AbstractBedrockModel` and `AbstractBedrockEntityModel`: original model assembly, pivots, root Y origin and `entityCutoutNoCull` material.
- `simplebedrockmodel/client/bedrock/model/BedrockPart`, `BedrockCubeBox`, `BedrockCubePerFace`, `BedrockModelUtil`: original bone/cube rotation, UV and zero-extent semantics.
- `touhoulittlemaid/client/model/bedrock/BedrockModel`: resets and applies the ordered custom animations, then hardcoded animations.
- `touhoulittlemaid/client/resource/pojo/CustomModelPack`, `MaidModelInfo`: extra-texture IDs and entity scale; the original absent scale default is 1, with the original clamp 0.2–2.

The type-B definition lists 15 ordered animations, under `touhou_little_maid:animation/`: `maid/default/head/{default,beg,music_shake,blink,hurt}.js`, `maid/default/tail/default.js`, `maid/default/arm/{default,swing}.js`, `maid/default/leg/default.js`, `maid/default/sit/{default,skirt_rotation}.js`, `maid/default/task/danmaku_attack.js`, `base/rotation/y_high_speed.js`, `base/float/default.js`, and `base/rotation/z_normal_speed.js`.

These identifiers are primarily **built-in Java animations**, not missing JavaScript files. `CustomJsAnimationManger.getCustomAnimation()` checks `InnerAnimation` before external script loading. Port `MaidBaseAnimation`, `MaidExtraAnimation`, `MaidTaskAnimation` and `EntityBaseAnimation` with their original order, then `HardcodedAnimationManger` (`SwimAnimation`, `TridentAnimation`, registered extensions). Merely loading a static skeleton does not implement these animations.

## Live state still missing for the maid

The current snapshot contains the received model ID, health/tame/owner metadata, raw custom chat-bubble metadata, position and equipment; it has **no maid motion provider** (`motion: null`). This is sufficient to identify the real source assets, not to present a complete animated maid. The renderer therefore remains explicitly unsupported in this release.

Required inputs include original client age/tick interpolation, limb swing, body/head rotation, attack/swing progress, hurt countdown, item-use hand/state, task ID, begging/arm-rise state, sitting/passenger state, water/swim state, backpack render inputs, and original held/armor item rendering. The matched `defineSynchedData` defaults can supply documented omitted defaults, but cannot replace live nondefault values.

The locked `MaidBaseAnimation.isPortableAudioPlay()`, `isHoldTrolley()` and `isHoldVehicle()` helpers return the literal false value (`iconst_0; ireturn`); its music-shake branch therefore does not require an invented audio input. `IMaid.isSitInJoyBlock()` likewise has that original false default. Port those exact source rules for this version. Do not extrapolate them to a different release or client extension. YSM, Gecko and external render/animation extensions need their own source/state provider.

## Minimal next implementation

1. Add a passive native packet mirror for attributes, passengers and original maid animation payloads to this same account. `touhoulittlemaid/network/message/MaidAnimationPackage` uses channel `touhou_little_maid:maid_animation`, with two `VAR_INT`s: maid entity ID and animation ID. Its original client handler updates `animationId`, `animationRecordTime` and `shouldReset`. Preserve event order and epoch, and only apply it to an already received entity. Keep original entity-status/animation cues and client countdown semantics.
2. Port the locked Bedrock cube/per-face engine and the exact ordered built-in animations. Derive client-local timers from the received events and actual connection ticks. A server entity's current `tickCount`, `hurtTime` or `swingTime` is not automatically the same as the viewing client's history.
3. If additional authoritative inputs cannot be reconstructed from those packets, add a private, bounded render-state bridge for explicitly requested **already tracked visible UUIDs**. Authenticate the receiving player UUID, same dimension, loaded entity and native tracking visibility. Never scan all world entities. Return schema/version/source identity, entity UUID and world epoch; reject unknown/stale requests and bound entity count, bytes and cadence.
4. Read original state through `entity/passive/EntityMaid`: `getModelId()`, `getTask().getUid()`, `isMaidInSittingPose()`, `isSwingingArms()` and its documented synchronized accessors; read inherited `LivingEntity.isUsingItem()`, `getUsedItemHand()`, attributes and equipment where needed. `api/entity/IMaid` supplies the documented interface defaults. Use these values as animation inputs, not a simulated task or replacement character. Model-pack provenance comes from `CustomPackLoader`/`MaidModels` and the relevant model definition, not an inferred namespace.
5. Test source hashes, exact variant lookup, bones/UVs/zero-thickness geometry, animation inputs/order, unknown components, payload gaps and respawn/disconnect disposal. Compare idle, walk, blink, hurt, sit, work and held-item states against the matched Java client before changing any parity acceptance flags.

The next common vanilla hostile providers likewise need their complete original inputs and layers: creeper swelling history/charged energy/white overlay, and zombie/skeleton attack, bow-use and equipment/armor rendering. They are not covered by the six-type factory merely because their original assets are exported.
