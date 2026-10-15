# Mineflayer → native console port coverage

## Implementation follow-up, 2026-10-15

The requested scope is **all capabilities for which the action connection can
provide data**, not a list of common mobs or common UI operations. A missing
renderer, filtered packet, metadata decoder or adapter is implementation work;
it is not a Mineflayer limitation. The original 1.21.1 census is 130 entity
types, 109 particle types, 44 block-entity types and 25 menu types. Modded
registries are a separate, additional scope.

The new offline `ExportVanillaModelLayers.java` invokes the original
`LayerDefinitions.createRoots()` and `LayerDefinition.bakeRoot()` for every
entry: 213 layers, 1,762 cubes, 10,552 original quads. It includes all wood and
boat keys, geometry dilation/mirroring, named hierarchy, pivots, ZYX rotations,
scales, normals and UVs. It exports all four registries and all 44 original
block-entity renderer registrations with their exact valid block sets. Two
separate JVM exports produce byte-identical canonical data. No client instance,
world, account, listener or GPU is started. This proves original geometry and
registration coverage, **not complete actor appearance or animation**.

`native-original-model-layers.js` consumes that checked data and bakes every
original layer in Three.js. The scene no longer rejects ordinary MODEL blocks
merely because they contain a block entity. All 20 original types without an
additional renderer (23 block IDs, including bee nests and all command-block
variants) use the actual original blockstate/model/texture path. Other MODEL
devices retain their original base and an explicit additional-renderer issue;
ENTITYBLOCK_ANIMATED devices still require their own renderer. Registry or mod
differences do not inherit a vanilla completeness claim.

The remaining actor, animation, equipment, particle, hand, world-environment
and UI rows below remain open until their actual original implementations and
same-player browser observations pass. Exported layers are available inputs for
those ports; no missing type is silently classified as out of scope.

The complete original `ThrownItemRenderer` family is now dispatched: egg,
ender pearl, experience bottle, potion, snowball, eye of ender, fireball and
small fireball. It uses the actual component-bearing Slot, the verified original
constructor default only when metadata is absent, and no geometry for explicit
empty Slots. Original constructor scales, GROUND item transform, camera quaternion
and the first-two-ticks proximity gate are retained, without dropped-item bob or
spin. Full-bright block-light settings are recorded; the world lightmap is still
an explicit missing pass, not a false lighting-parity claim.

The original CPU exporter also inventories all 1,333 items, 46 potion bases and
39 effects. Independent exports are byte-identical. All potion-base colors are
checked against original `PotionContents.getColor()`, including signed custom
colors, visible-effect weighting and the no-effect blue. All four original
potion-colored item models retain their separate generated layers and tint
indices. The host validates every item/effect registry ID before decoding the
potion wire component. This supplies held/dropped/thrown item geometry; it does
not claim all GUI icons, animated item textures, glint or complete item rendering.

Native pages and their identity stream now carry the same checked renderer-source
and asset-manifest signature. A reconnect to the same build reuses the page;
a changed build refreshes that same route once, before the old native registry
reader tries to decode the new stream. Existing pages opened before this feature
need one initial refresh. This complements runtime tab reuse and does not start
or stop the game, create another viewer tab or add model calls.

The same original `LiquidBlockRenderer` path now handles **all 9,246 nonempty
fluid states in the exported vanilla registry**, spanning 344 block IDs:
source/flowing water and lava, bubble columns and all waterlogged states. The
ordinary block mesh remains alongside its fluid mesh. Fluid identity, heights,
neighbor occlusion, original still/flow/overlay sprites and animation metadata
are preserved; lava uses white tint and a solid chunk material, water uses the
actual biome tint and translucent material. One received-neighbor index is
shared across a rebuild. Unknown modded overlay providers and unreceived
neighbors remain explicit errors. Atlas shrink/lightmap/full Java scene parity
are still unverified, not inferred from this geometry port. The reference is
the locked 1.21.1 `LiquidBlockRenderer` (gfu) `tesselate`, `getHeight` and
`calculateAverageHeight`, plus `FlowingFluid.getFlow`.

The baseline matrix below is retained as the audit input. Subsequent native work restores the six original camera modes and short shots; actual displayed-root following; original dropped-item models, count stacking/bob/spin and collect events; fourteen original common hostile/golem models with walking/head/received swing/hurt/death/fuse animation; native entity pick/list/follow/return; original dungeon floor-mask cutaway/observer rotation/zoom; and the shared quality controls. Collision uses indexed original terrain triangles, not replacement cubes. Particle/projectile/audio gaps in the matrix remain implementation work. Original lighting, special equipment/poses and complete Java scene parity are still unverified; the strict complete flags stay false. Offline regression and original asset checks are recorded separately from live browser acceptance.

Audit date: 2026-10-15. This is a source audit of shared renderer `main` at `2dc7ac3507260342cb9224558c892adb2148d92a`, independent core/framework `main` at `7d456b660b6576a9bf429ae23a421b78aa28cb1c`, and the thin plugin at `0f507b767216f640d82e4bde497366c10f3bdbbd`. Those are the synchronized inputs checked before implementation. Statements about missing native support below describe that baseline; subsequent changes need their own verification. No game connection, server change, model request or runtime inspection was used for this audit.

The immediate gaps are missing native renderer implementations and event hookups. Mineflayer already receives the positions, metadata, item stacks, equipment, animation/damage events, pickup counts, particles and sounds needed for a useful port. The older renderer contains many corresponding UI and lifecycle features. Its approximate visuals and version-specific assumptions must be distinguished from the original 1.21.1 models/rules required by this repository. [Native stream](../host/vanilla-native-stream.mjs), [native world observer](../tools/native-world-host.mjs), [legacy client](../src/modern-viewer/client.js), [fidelity requirements](../../../../AGENTS.md).

## Which path the independent consumer actually runs

The framework's `createEngine()` imports `tools/native-world-preview-host.mjs`, `host/viewer-pack-selection.mjs` and `host/vanilla-native-stream.mjs` from the configured shared renderer directory. It attaches the viewer to the existing action bot, reads the selected pack/registry, and supplies `vanillaPlayerPresentation()`. It does **not** use the core's older `modern-viewer.ts` Socket.IO renderer for this native view. Therefore adding an event only to core `modern-viewer.ts` or a `tools/minecraft-viewer-*.js` concatenation does not make it appear in this consumer. [Framework engine](https://github.com/jcs130/minecraft-ai-friend/blob/7d456b660b6576a9bf429ae23a421b78aa28cb1c/packages/agent-mc-autonomy/src/agent_mc_autonomy/integrations/viewer-engine.mjs), [native host](../tools/native-world-preview-host.mjs), [old client build](../tools/build-minecraft-viewer-client.mjs).

The current native flow is:

1. `observeVanillaNativeStream()` filters the existing connection's decoded `packet` events through `PACKETS`.
2. `attachNativeWorld()` sends those packets to `NativeWorldState.handle()`, calls `tickEntities()` on actual Mineflayer `physicsTick`, and samples the action player's pose.
3. The preview host sends bounded `snapshot`, `frame`, `motion` and `presentation` SSE events, with identity, epoch and registry hashes.
4. `createNativeSession()` checks those bindings. `mountNativeWorld()` updates terrain, the self actor, `NativeEntityLayer`, hands, activity UI and the same-scene mini map.

Sources: [stream](../host/vanilla-native-stream.mjs), [attachment/state](../tools/native-world-host.mjs), [SSE host](../tools/native-world-preview-host.mjs), [browser session](../src/native-viewer/native-session.js), [scene](../src/native-viewer/native-scene.js).

## Capability matrix at the audited baseline

| Capability | Older implementation / reusable source | Native baseline and practical remaining work |
| --- | --- | --- |
| Camera mode panel | [`installCameraSettings()`](../src/modern-viewer/camera-settings.js), [`normalizeCameraSettings()` / `loadCameraSettings()`](../src/modern-viewer/camera-preferences.js): manual, shoulder, follow, front, orbit, overhead; distance/height/framing/FOV/smoothing/collision; orbit/pullback shots | `bootNativeConsole()` exposes first/third/dungeon only. `playerCamera()` also knows region, but there is no console route/control for it. Connect the existing panel and director to native scene state. [Console](../src/native-viewer/native-console.js), [camera](../src/native-viewer/player-camera.js). |
| Stable camera follow | [`CameraDirector.update()`](../src/modern-viewer/camera-director.js) filters travel/heading, resets on target changes/teleports, and outputs world-space pose. [`renderedEntityPosition()` / `installRenderedCameraFollow()`](../src/modern-viewer/rendered-camera-follow.js) follow the displayed root after interpolation | `updatePlayerCamera()` uses `current.pose`, runs before `selfActor.applyPose()` and `entityLayer.frame()`, and copies the camera position immediately. Use the displayed actor root in the same render frame; adapt the ordering, because the legacy wrapper expects `world.render` and `sceneOrigin`. [Native scene](../src/native-viewer/native-scene.js). |
| Camera interaction | `client.js` `installOrbitControls()`, `useManualOrbitCamera()`, `returnCameraToAvatar()` and target-follow UI | Native `OrbitControls` is enabled only in region mode and its target is initialized by `orbitPosition()`. Add drag/zoom/pan and manual exit from auto shots; translate target with the displayed actor while following. Preserve first-person real look direction. [Old client](../src/modern-viewer/client.js), [native scene](../src/native-viewer/native-scene.js). |
| Camera collision | [`cameraCollisionDistance()`](../src/modern-viewer/camera-director.js): seven offset voxel rays protect the near plane, unknown columns are a boundary, immediate pull-in / delayed smooth recovery | Native third-person uses one ray against rendered `statics.children` every 100 ms. It does not protect the near-plane edges, region/dungeon paths or unknown-column boundary. Supply a native verified collision/column adapter or an equivalent bounded sweep over original rendered geometry; do not invent meshes for unsupported blocks. [Native scene](../src/native-viewer/native-scene.js). |
| Pick/follow another visible entity | [`pickEntity()`](../src/modern-viewer/entity-picker.js), [`createEntityContextMenuModel()` / `renderEntityContextMenu()`](../src/modern-viewer/entity-context-menu.js), old client's `resolveObserverTargetPosition()` / follow return | Native entity actors and raw entity state exist, but no picker/follow target hook is installed in the console. Adapt candidates to native actor roots, visible/material state and epoch. Pure camera following does not require sending game controls. [Layer](../src/native-viewer/native-entity-layer.js), [scene](../src/native-viewer/native-scene.js). |
| Animal movement | Old avatar/mob motion utilities; native exact model and tick logic are preferable | Native pig/cow/chicken/sheep/slime/villager already have original geometry/UV layers, head/body turning, walk interpolation; chicken flap, sheep eating and slime squish are implemented. Retain these. [Motion](../src/native-viewer/native-entity-motion.js), [dispatch](../src/native-viewer/native-entity-dispatch.js). |
| Hostile mobs | [`minecraft-viewer-entity-motion.js`](../tools/minecraft-viewer-entity-motion.js) lists many hostiles and attaches walk/attack/hurt/ranged poses | Native dispatch supports the six vanilla animals/mobs above plus selected maid/Create/Wandscape entities. Zombie, skeleton, creeper, spider and other hostiles are rejected before rendering. Add original 1.21.1 model definitions, metadata defaults, texture/layers and tick/pose rules to dispatch/motion. Availability of packets is not the blocker. [Dispatch](../src/native-viewer/native-entity-dispatch.js), [motion types](../src/native-viewer/native-entity-motion.js). |
| Hurt/attack | Old `entityDamage`, `entityAnimation`, [`tintEntityDamage()`](../src/modern-viewer/entity-hurt-tint.js); native received `hurt_animation`, `animation`, `entity_status` cues | General native animals do not consume hurt/attack cues or apply a hurt layer. Maid has a specific hurt/animation path; self has actual hand swing support. Add general per-entity received cue tracking and original visual rules; forward `damage_event` for attribution without conflating it with `hurt_animation`. [Motion](../src/native-viewer/native-entity-motion.js), [world state](../tools/native-world-host.mjs), [native hand motion](../src/native-viewer/native-first-person-motion.js). |
| Death and alternate poses | Older mob/self motion code handles several specific actions; native metadata preserves received pose/health | Generic native mob state accepts only standing pose and hides a body once health is nonpositive; original death rotation and other pose families are not complete. Original rules must be added per class/pose, rather than applying one generic death animation to every entity. [State/update guards](../src/native-viewer/native-entity-dispatch.js). |
| Other players / broader entity set | Legacy `viewerEntity()` includes player skin/equipment and the old renderer supports many entity classes | Native self is separate; generic dispatch has no `minecraft:player` actor for other received players, nor all boats/minecarts/item frames/display entities. Add original providers incrementally and keep received-versus-rendered coverage visible. [Self controller](../src/native-viewer/native-self-player.js), [dispatch list](../src/native-viewer/native-entity-dispatch.js), [legacy entity serializer](https://github.com/jcs130/minecraft-ai-friend/blob/7d456b660b6576a9bf429ae23a421b78aa28cb1c/packages/agent-mc-world/core/modern-viewer.ts#L293). |
| Mob equipment / armor | Old `viewerEntity()` serializes six equipment slots; `cortiAttachMobNativeItem()` reattaches hands after equipment changes | Native raw equipment is retained, but the generic six-mob `nativeEntityRenderState()` rejects any nonempty equipment. Reuse original item model preparation and actual slot binding; add original armor model/material layers. Keep an unsupported component's status separate from the supported body where appropriate. [World state](../tools/native-world-host.mjs), [dispatch guard](../src/native-viewer/native-entity-dispatch.js), [held item provider](../src/native-viewer/native-held-items.js). |
| Dropped item identity/count | Older renderer recognizes raw metadata `itemCount`; core `viewerDroppedItem()` uses `entity.getDroppedItem()` | Native entity metadata already preserves key 8 `item_stack`, including the complete wire Slot. Native dispatch has no `minecraft:item` actor. Decode through the exact item registry, preserve count and component patches, and render the original item model using its **ground** display transform. [World state](../tools/native-world-host.mjs), [wire item adapter](../host/vanilla-activity.mjs), [component codec](../host/vanilla-item-stack.mjs). |
| Dropped item bob/rotation/stack copies | [`cortiDroppedItemPose()` / `cortiReconcileDroppedItems()`](../tools/minecraft-viewer-dropped-items.js) animate both Mesh and Group models | Old bob is a local elapsed-time effect with an ID-hashed phase; it is not evidence of authoritative item age or Java phase. Implement native original ground animation and count-derived copies with a clearly identified client lifetime/phase source. Native item rendering itself is currently missing. [Dropped item helper](../tools/minecraft-viewer-dropped-items.js), [native state](../tools/native-world-host.mjs). |
| Pickup/collection | Core `onCollect()` sends IDs/count, from/to positions and serialized stack; old particle/audio layers consume `kind: 'pickup'` | `collect` is filtered out by the native adapter, and there is no native pickup actor/cue. Add a bounded event carrying the real collector/collected IDs and count, capture item/positions before destroy, animate once toward the displayed collector, and reconcile actual item count/removal. Inventory gain remains based on authoritative inventory updates. [Core modern viewer](https://github.com/jcs130/minecraft-ai-friend/blob/7d456b660b6576a9bf429ae23a421b78aa28cb1c/packages/agent-mc-world/core/modern-viewer.ts#L617), [stream allowlist](../host/vanilla-native-stream.mjs), [native activity reconciliation](../host/vanilla-activity.mjs). |
| Projectiles / bobber | Old `cortiProjectileModel()`, velocity-facing flight and ranged events; `viewer-fishing.mjs` preserves bobber owner/reel evidence | No native general projectile actor; spawn `objectData` is discarded despite being available. Preserve it, bind owner by packet semantics where defined, then add original arrow/trident/item/bobber models and actual received motion. Do not reuse guessed nearest-shooter attribution or substitute cone/cylinder projectiles. [Old motion](../tools/minecraft-viewer-entity-motion.js), [fishing](../host/viewer-fishing.mjs), [native spawn](../tools/native-world-host.mjs). |
| Server particles / explosions / world events | Core `viewerParticle()`, `viewerExplosion()`, `viewerWorldEvent()`; [`minecraft-viewer-particles.js`](../tools/minecraft-viewer-particles.js) | Native adapter does not forward these packets and scene has no effect layer. Reuse bounded decoding/event lifecycle, retaining each packet's original type/data. The old colored additive points/rings are approximate effects, not proof of original sprite/physics parity. [Core presentation](https://github.com/jcs130/minecraft-ai-friend/blob/7d456b660b6576a9bf429ae23a421b78aa28cb1c/packages/agent-mc-world/core/viewer-presentation.ts), [native stream](../host/vanilla-native-stream.mjs). |
| Positional sounds / stopping / music | [`observeViewerSounds()` / `viewerSoundPacket()`](../host/viewer-sound-packets.mjs), [`minecraft-viewer-sound.js`](../tools/minecraft-viewer-sound.js), original sound export tools | Native adapter excludes sound packets; console disables sound/music controls. Connect exact 1.21.1 sound registry/assets, one bounded event path, spatial source/volume/pitch/seed/category and stop semantics. Existing sound registry validator's exact-assets branch is 1.20.6-specific and cannot attest 1.21.1 assets. [Sound registry](../host/viewer-sound-registry.mjs), [console](../src/native-viewer/native-console.js). |
| Inventory/menu, operation history, trade, recipes, scoreboard/player activity | Core `viewer-state.ts`, old HUD/presentation; native wire menu and activity modules | Substantially connected: same-player hotbar/inventory/carried/menu, trade offers/selection, inventory reconciliation, dig/use/attack events, bounded recipe previews, sidebar/player list, nearby entities, messages/title/actionbar, effects/boss bars. Preserve this rather than duplicating the old HUD. Recipe preview is observation/catalog reasoning, not proof a craft happened. [Presentation host](../tools/native-world-preview-host.mjs), [vanilla activity](../host/vanilla-activity.mjs), [activity UI](../src/native-viewer/native-activity-ui.js), [native UI](../src/native-viewer/native-ui-adapter.js). |
| Mini map | [`createNativeMiniMap()`](../src/native-viewer/native-mini-map.js) already renders a second camera over the same original scene, with observed trail/route | Present in native scene at 250 ms cadence. Console diagnostics still say mini map unconnected and hide only the old `#corti-minimap`; correct that stale text. This is a local received-terrain view, not knowledge of unseen map tiles. [Scene](../src/native-viewer/native-scene.js), [console](../src/native-viewer/native-console.js). |
| Own first-/third-person hands | [`observeVanillaHands()`](../host/vanilla-hand-state.mjs), [`native-first-person-motion.js`](../src/native-viewer/native-first-person-motion.js), [`NativeHeldItems`](../src/native-viewer/native-held-items.js) | Already renders original supported static held models, first-person skin arm and actual outgoing swings; supported eat/drink durations and scoped classic self third-person swing are implemented. Equip transitions, camera bob, bow/crossbow/shield/trident use, arbitrary component-driven models and full YSM first-person/equipment remain incomplete. Do not describe all hands as missing. |

## Raw state: retain what Mineflayer already received

`NativeWorldState.handleEntity()` currently stores entity ID/UUID/type, native registry name, position, yaw/pitch/head yaw in Minecraft degrees, `velocity / 8000`, received `onGround`, spawn/update times, all validated metadata entries, raw equipment and the last eight received cues. `entitySnapshot()` forwards them without replacing native types with a proxy registry. It also forwards the bounded tick motion state for supported entities. [Implementation](../tools/native-world-host.mjs).

| Packet / field | Native baseline | Required native handling |
| --- | --- | --- |
| `spawn_entity`: `entityId`, `objectUUID`, `type`, xyz, yaw/pitch/`headPitch`, `velocity` | Forwarded and retained | Keep exact native registry/identity and rotation units. |
| `spawn_entity.objectData` | Packet reaches observer, but field is dropped from the stored entity | Retain original integer. Decode semantics per actual type/version; bobber owner and falling-block state cannot be reconstructed safely from proximity or names. |
| `entity_metadata`: `{key,type,value}` | Forwarded and retained, including absent optional values with an explicit marker | Item is metadata key 8 `item_stack` in the installed 1.21.1 registry. Do not treat the metadata list index as the key. Preserve complete Slot and component types. |
| Item Slot: `itemCount`, `itemId`, `components`, `removeComponents` | Retained inside metadata | `itemId` needs the matched item registry; count is authoritative. Component patch removals have protocol shape `{type}`, whereas `vanillaItemStack()` currently expects component-removal strings. Normalize the real wire representation deliberately and retain unsupported patch diagnostics. |
| `entity_equipment`: `equipments[{slot,item}]` | Forwarded, bounded and retained | Use slot numbers without applying the inventory-slot scheme. Known living slots are mainhand/offhand/feet/legs/chest/head; protocol can carry more slots, which need explicit support. Nonempty items currently trip a generic renderer guard. |
| `rel_entity_move`, `entity_move_look`, `entity_look`, `entity_teleport`, `entity_head_rotation`, `entity_velocity` | Forwarded and retained | Expand motion type support; never predict unseen movement or change authoritative positions to create an animation. |
| `entity_status`, `animation`, `hurt_animation` | Forwarded and retained as cues | Consume sequenced cues once per entity/epoch. Hurt yaw is a visual cue; animation code selects actual arm/animation. General mob motion currently ignores most of these. |
| `damage_event` | Excluded from native `PACKETS`; Mineflayer still emits `entityHurt`, which activity observes | Forward a bounded damage/attribution cue if needed; preserve `sourceTypeId`, cause/direct IDs and optional source position. It does not replace `hurt_animation`. |
| `collect`: `collectedEntityId`, `collectorEntityId`, `pickupItemCount` | Excluded; Mineflayer still emits `playerCollect` | Capture from raw packet for exact count and one visual pickup event; do not infer pickup merely from `entity_destroy`. |
| `spawn_entity_experience_orb`: ID, xyz, count | Excluded | 1.21.1 still uses a separate orb spawn packet. Add this path for XP orbs; do not require a UUID/type field absent from that packet. |
| `world_particles`, `explosion`, `world_event` | Excluded | Add an explicitly bounded transient event channel; preserve original particle-specific payloads and relevant block/item IDs. |
| `sound_effect`, `named_sound_effect`, `entity_sound_effect`, `stop_sound` | Excluded | Use one raw sound observer; matched registry, holder names, xyz/8 and stop masks are already understood by the shared sound module. |
| Inventory/window/property/trade/message/title/effect/bossbar/scoreboard facts | Some are outside raw `PACKETS` but separate existing observers already publish them | Keep the existing presentation/activity lanes; absence from the terrain allowlist alone does not mean a feature is missing. |

Sources for the native column: [stream allowlist](../host/vanilla-native-stream.mjs), [world state](../tools/native-world-host.mjs), [wire stack](../host/vanilla-activity.mjs), [component codec](../host/vanilla-item-stack.mjs), [native presentation host](../tools/native-world-preview-host.mjs). Protocol and Mineflayer evidence is recorded below.

### Item lifetime and phase are a narrower unavailable input

The installed Mineflayer entity plugin and `prismarine-entity` constructor do not maintain an authoritative dropped item's server age. The 1.21.1 `spawn_entity` fields and item entity metadata keys contain no lifetime/despawn-age field. The core's `viewerEntity()` merely copies optional `record.age`; that does not make a value available. The old dropped-item module instead starts `elapsedSeconds = 0` on mesh attachment and hashes the entity ID for a visual phase. [Core serialization](https://github.com/jcs130/minecraft-ai-friend/blob/7d456b660b6576a9bf429ae23a421b78aa28cb1c/packages/agent-mc-world/core/modern-viewer.ts#L293), [legacy animation](../tools/minecraft-viewer-dropped-items.js), installed dependency/protocol sources below.

This does not block item rendering, stack count, received movement, pickup flight or a client animation clock. It means any new lifetime/phase must say it comes from the observing client's ticks/constructor state. It must not claim the server's remaining despawn time or phase equality with a separately running Java reference client. Spawn/reuse/epoch changes reset that local state; browser remount and hidden-tab time must not silently create server observations. [Native tick attachment](../tools/native-world-host.mjs), [existing scoped client-clock treatment](../NATIVE_DEVICE_RENDERING_COMPATIBILITY.md).

### Item models: useful providers exist, but display contexts differ

`prepareNativeHeldItem()` already resolves verified original generated item silhouettes, selected opaque BlockItems and supported mod item geometry/texture sources. `nativeGeneratedItemElements()`, model inheritance resolution and native face baking can be reused for dropped item/equipment geometry. Its existing plans choose `thirdperson_*hand` and `firstperson_*hand`; a dropped actor must instead resolve the original `ground` transform, original stack-copy placement and GUI-3D distinction. A GUI PNG or a hand mount is not a ground model. [Held item provider](../src/native-viewer/native-held-items.js), [native item model utilities](../src/native-viewer/native-item-icons.js), [old dependency's ground model dispatch](../node_modules/minecraft-renderer/src/three/entities.ts).

The current vanilla wire→SNBT codec supports only a defined component subset. Unknown custom names, profiles, enchantment, potion/color/model patches cannot be stripped and rendered as plain items. Extend the exact codec/provider as concrete packets require; preserve their component identity and expose a per-feature reason when unsupported. Raw metadata/equipment already retains the input, so this is usually codec/model work rather than missing network data. [Codec](../host/vanilla-item-stack.mjs), [raw metadata](../tools/native-world-host.mjs), [item rendering rules](../src/native-viewer/native-item-icons.js).

## Camera integration details

`CameraDirector` is a detached solver: it never writes actor controls. The native scene can instantiate it, pass a target's displayed world position/height/yaw, and directly apply returned `pose.position`, `pose.focus` and `pose.fov` to its Three camera. Avoid the old client's `viewer.updateCamera()` eye-offset/floating-origin adapter because the native scene already uses world coordinates. Reset on scene clear, target identity/epoch changes, teleport and manual interaction. [Director](../src/modern-viewer/camera-director.js), [old `applyDirectedCamera()`](../src/modern-viewer/client.js), [native scene](../src/native-viewer/native-scene.js).

Recommended native render ordering: update the self actor and all entity interpolation first; read that displayed actor root; solve/apply the camera; update visibility/labels; draw. Buffer received positions using the existing bounded `EntityPositionTimeline` if the chosen actor path otherwise jumps. Never feed animated head/nametag/camera coordinates back into the tracking target, and do not extrapolate beyond received positions. [Timeline](../src/modern-viewer/entity-position-timeline.js), [displayed-root follow](../src/modern-viewer/rendered-camera-follow.js), [director](../src/modern-viewer/camera-director.js).

The panel defaults to `manual` in existing saved preferences. A newly connected native follow mode needs an intentional initial choice; importing the panel alone will leave automatic following inactive. Existing user preferences should remain honored. The first-person camera remains tied to the action player's actual view; third/region/dungeon composition changes are observing cameras. [Preferences](../src/modern-viewer/camera-preferences.js), [player camera](../src/native-viewer/player-camera.js).

## Practical implementation order and acceptance

1. **Camera panel + smooth displayed-root following.** Reuse preferences/settings/director; adapt collision and manual controls; keep first/third/dungeon modes coherent; add visible-entity follow/return. Validate target switch, teleport, wall corners, unload boundaries, hidden-tab resume and camera movement without any outgoing game input.
2. **Preserve raw input seams.** Retain `objectData`; add exact item Slot projection; carry bounded collect/damage/transient events with identity/epoch/sequence and no replay on reconnect. Keep existing 512-entity, metadata, total-state and SSE budgets. Validate metadata-before/after-spawn, unknown serializers, count changes, equipment replacements, duplicate cues, destroy-before-render and ID reuse.
3. **Original common hostile actors and motion.** Start with original zombie/skeleton/creeper/spider classes and real metadata, then broaden the dispatched types. Preserve six existing vanilla models and optional mod actors. Validate walk/head turn, baby variants, hurt, attacks, burning/invisibility, equipment and original UVs. Do not announce support for the entire legacy hostile list from a few shared biped poses.
4. **Dropped item ground actor.** Reuse original item geometry providers, add ground context, raw count/stack copies, declared local lifetime/bob/rotation and actual pickup flight. Validate items with generated and block geometry, count transitions/partial pickup, components, wrong/unknown collector, removal, reconnect and unsupported component diagnostics.
5. **Equipment + projectiles.** Bind original hand/armor layers; add arrow/trident/thrown item/bobber/XP paths and real owner/data semantics. Validate motion and original texture/geometry; do not infer a shooter because a nearby skeleton is facing the object.
6. **Sounds + original particle/world effects.** Add one bounded raw event path and version-matched resources; stop on disconnect, honor categories/seed/stop masks, and do not replay old transients. Port original sprite/physics families progressively, with unsupported families named explicitly.
7. **Complete HUD/hand cases and scene verification.** Preserve already working activity/menu/map data, update stale diagnostics, finish concrete missing hand-use/equip cases and per-entity UI. Run offline contract/model/motion tests, then browser WebGL checks over the same action connection, then compare matched Java reference scenes before claiming full fidelity.

These are source implementation/verification targets. Passing an offline protocol test proves neither live playback nor complete scene parity. Existing code deliberately leaves `animationParityVerified` / `completeEntityParityVerified` false. Preserve that distinction while making useful visible behavior work. [Native actors](../src/native-viewer/native-entity-dispatch.js), [repository requirements](../../../../AGENTS.md).

## Primary source inventory

All repository sources above were read locally at the recorded baseline. Useful cross-project sources:

- Core `packages/agent-mc-world/core/modern-viewer.ts`: `viewerEntity()`, `onCollect()`, `onParticle()`, `onExplosion()`, `onWorldEvent()`, entity snapshot/event flush, sounds and actual outgoing arm/ranged/shield observers. [Checked source](https://github.com/jcs130/minecraft-ai-friend/blob/7d456b660b6576a9bf429ae23a421b78aa28cb1c/packages/agent-mc-world/core/modern-viewer.ts).
- Core `viewer-state.ts`: `viewerItem()` preserves actual item identity, count, component/NBT data within budgets; `viewer-fishing.ts`: `viewerDroppedItem()` tolerates spawn-before-metadata and uses the real dropped stack accessor. [Item serializer](https://github.com/jcs130/minecraft-ai-friend/blob/7d456b660b6576a9bf429ae23a421b78aa28cb1c/packages/agent-mc-world/core/viewer-state.ts), [dropped item/fishing](https://github.com/jcs130/minecraft-ai-friend/blob/7d456b660b6576a9bf429ae23a421b78aa28cb1c/packages/agent-mc-world/core/viewer-fishing.ts).
- Core `viewer-render-metadata.ts` normalizes the legacy 1.20.6 renderer's item-slot expectations. Do not apply that compatibility conversion to a native mod registry. [Metadata adapter](https://github.com/jcs130/minecraft-ai-friend/blob/7d456b660b6576a9bf429ae23a421b78aa28cb1c/packages/agent-mc-world/core/viewer-render-metadata.ts).
- Framework `viewer-engine.mjs`: explicit shared-native imports and same-bot lifecycle. Thin plugin instructions put gameplay/framework changes in the canonical packages and keep the plugin as a pinned consumer. [Engine](https://github.com/jcs130/minecraft-ai-friend/blob/7d456b660b6576a9bf429ae23a421b78aa28cb1c/packages/agent-mc-autonomy/src/agent_mc_autonomy/integrations/viewer-engine.mjs), [thin adapter instructions](https://github.com/jcs130/n.e.k.o_plugin_minecraft_autonomous/blob/0f507b767216f640d82e4bde497366c10f3bdbbd/AGENTS.md).

The dependency facts were checked from the installed **first-party library source**, not inferred from event names:

| Checked local primary file | Evidence |
| --- | --- |
| `D:/neko-plugins/_sources/minecraft-ai-friend/packages/agent-mc-world/node_modules/mineflayer/package.json` | Installed Mineflayer is `4.37.1`, matching the core's exact dependency. |
| `.../node_modules/mineflayer/lib/plugins/entities.js` | `entity_equipment` decodes real Slot through `Item.fromNotch()` and emits `entityEquip`; `collect` emits `playerCollect`; spawn/movement/metadata emit real entities; metadata item stacks emit `itemDrop`; `damage_event` emits `entityHurt` with cause entity. No authoritative item-age field is maintained here. |
| `.../node_modules/.pnpm/prismarine-entity@2.6.0/node_modules/prismarine-entity/index.js` | `getDroppedItem()` checks the item entity name and calls `Item.fromNotch()` on the registry-selected item metadata field. Entity constructor has position/velocity/angles/equipment/metadata, without authoritative item lifetime. |
| `.../node_modules/minecraft-data/minecraft-data/data/pc/1.21.1/protocol.json` | `packet_spawn_entity` includes `objectData`; `packet_collect` includes exact pickup count; `Slot` carries count/ID/components/removals; `packet_world_particles` includes original particle-specific data; sound holders and stop masks are available; orb spawn is separate. No item age in spawn. |
| `.../node_modules/minecraft-data/minecraft-data/data/dataPaths.json` and selected `pc/1.20.5/entities.json` | The installed `minecraft-data('1.21.1')` intentionally selects the inherited entity table. Item metadata keys end in `item` at key 8; zombie/creeper/arrow/bobber have their concrete metadata keys. This is versioned library evidence for vanilla only, not proof of a native modpack registry. |
| `.../node_modules/mineflayer/lib/plugins/sound.js` | Raw sound packet coordinates are divided by eight; holder ID/name is decoded before emitting derivative sound events. Using raw plus derivative events would duplicate playback. |
| `packages/modern-viewer/renderer-src/node_modules/minecraft-renderer/src/three/entities.ts` | The older installed renderer recognizes metadata `itemCount` and requests `minecraft:display_context = ground`. Its built-in item spin operates in `onBeforeRender`; the local dropped-item helper replaces that hook to support Group models. |

The installed dependency directories are verification inputs and must not be committed. Re-run the corresponding source/protocol checks when dependency versions or Minecraft versions change.

The follow-up [original common mob source audit](native-hostile-source-audit.md) records locked 1.21.1 geometry/UV/pivots, texture dimensions/hashes, actual animation formulas, source layer differences and class-specific metadata defaults for the practical hostile set.

## Implementation follow-up (2026-10-15)

The audit above describes the earlier source snapshot. The native integration now
has the six shared camera modes, entity picking/following, actual mob-height cave
cutaways, fourteen original hostile/golem actors and original item drops/pickup.
`native-projectiles.js` adds original arrow/spectral-arrow quads, the original
five-part trident, bobber sprite and XP atlas/threshold/color animation. The
separate XP spawn retains the actual native ID/epoch/value without inventing a
UUID. XP and item pickup use the received collect event and three actual connection
ticks; only authoritative inventory/XP state can establish a gain.

The projectile implementation is source/asset tested. Its original impact shake,
trident foil, bobber hand/line endpoint and XP lightmap are still disclosed as
unavailable; packet positions are interpolated without fabricating impacts or
server flight. Browser rendering and sustained gameplay acceptance are separate
from these offline tests. Audio and particle transport/actors remain active work.
