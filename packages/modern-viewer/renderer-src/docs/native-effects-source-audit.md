# Native effects source audit: Minecraft 1.21.1

Read-only source audit, 2026-10-15. No game/server/model calls or implementation changes. The inspected working tree already includes new native camera and dropped-item/collection work; this note identifies the remaining effects/input seams, not their acceptance status. Original source input is `D:/neko-plugins/minecraft_autonomous/local/live-runtime/visual-completion-20261015/minecraft-1.21.1-client.jar`, SHA-256 `499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99`, plus official `viewer-features-20261014/client-mappings.txt` under the same local runtime directory. Original classes were inspected using `javap -p -c`; assets by direct ZIP reads. These private verification inputs stay outside Git.

## Current native versus old modern viewer

| Feature | Reusable existing source | Native seam observed in this audit |
| --- | --- | --- |
| Projectiles / bobber / XP orbs | Old [`minecraft-viewer-entity-motion.js`](../tools/minecraft-viewer-entity-motion.js) handles arrow/trident/fireball/potion flight; [`viewer-fishing.mjs`](../host/viewer-fishing.mjs) observes bobber ownership/catch evidence | Native spawn now retains `objectData`, but no general projectile/bobber/orb actor is dispatched. `spawn_entity_experience_orb` is still excluded. Old handcrafted cylinders/cones and proximity-based shooter guesses are unsuitable as original geometry/state. [World observer](../tools/native-world-host.mjs), [dispatch](../src/native-viewer/native-entity-dispatch.js). |
| Particle events and original sprites | [`viewerParticlePacket()`](../host/viewer-content.mjs), [`ServerParticles`](../src/modern-viewer/server-particles.js), [`minecraft-viewer-content.js`](../tools/minecraft-viewer-content.js) preserve bounded batches, sprite definitions and directional count=0 semantics | Native `PACKETS` omits `world_particles`, `explosion`, `world_event`; scene has no particle layer. Old original-sprite layer still uses generic 1-second straight-line motion/random fixed sprite, not each original particle's physics. Its loader is hard-locked to 1.20.6. [Native stream](../host/vanilla-native-stream.mjs), [scene](../src/native-viewer/native-scene.js). |
| Sounds / stopping | [`observeViewerSounds()`](../host/viewer-sound-packets.mjs), [`minecraft-viewer-sound.js`](../tools/minecraft-viewer-sound.js), original asset expansion/export tools | Native stream omits sound/stop packets and console disables audio. Existing exact numeric registry/export gates support 1.20.6 only. The old decimal-seed hash is not Java's seeded sound-selection RNG. [Registry](../host/viewer-sound-registry.mjs), [console](../src/native-viewer/native-console.js). |
| Collection | Native [`NativeEntityLayer.collect()`](../src/native-viewer/native-entity-layer.js) and `entity_collect` browser session event now exist | Native host collection currently handles `minecraft:item` only; XP/entity pickup paths remain separate work. Original pickup follows the collector's changing position across its three ticks; a permanently captured target point is only a restricted case. [Host](../tools/native-world-host.mjs), [session](../src/native-viewer/native-session.js). |
| Target pick / camera follow | [`pickEntity()`](../src/modern-viewer/entity-picker.js), context model/UI, old client's `pickNpcAtCanvasPoint()` and follow/return UI | Native camera composition exists, but no native picker/selected-entity target hookup was found. Picker can consume native actor roots; a browser camera selection needs no game-action channel. [Camera](../src/native-viewer/native-camera.js), [scene](../src/native-viewer/native-scene.js). |

## Original projectile and XP rendering

### Arrow

`ArrowRenderer gji.render` (mapped original lines19–71) uses `RenderType.entityCutout`, the original 32×32 PNG, and this transform order: Y=`lerp(oldYaw,yaw,p)-90°`; Z=`lerp(oldPitch,pitch,p)`; optional shake Z=`-sin((shakeTime-p)*3)*(shakeTime-p)` degrees when positive; X=45°; uniform scale `.05625`; translate `(-4,0,0)`.

Its geometry is original **quads**, not cylinders or cones. Coordinates below are before that scale/translation; UVs are normalized exactly as the renderer writes them:

| Surface | Ordered position vertices | Ordered UVs |
| --- | --- | --- |
| Shaft end, normal -X | (-7,-2,-2),(-7,-2,2),(-7,2,2),(-7,2,-2) | (0,.15625),(.15625,.15625),(.15625,.3125),(0,.3125) |
| Reverse shaft end, normal +X | (-7,2,-2),(-7,2,2),(-7,-2,2),(-7,-2,-2) | (0,.15625),(.15625,.15625),(.15625,.3125),(0,.3125) |
| Four fins | Before each draw rotate another90° about X; vertices (-8,-2,0),(8,-2,0),(8,2,0),(-8,2,0) | (0,0),(.5,0),(.5,.15625),(0,.15625) |

`TippableArrowRenderer gmx` selects `textures/entity/projectiles/tipped_arrow.png` only when actual effect color>0; otherwise `arrow.png`. `SpectralArrowRenderer gmp` selects `spectral_arrow.png`. Original normal/tipped PNGs happen to have identical verified bytes. Do not tint the whole arrow using potion color: the source uses color for its particle path. `AbstractArrow cnd` metadata8 flags byte defaults0, metadata9 pierce byte0; `Arrow cnf` metadata10 effect color int defaults-1. The flags' crit bit supplies original local critical-particle behavior.

Received positions/angles/velocity/flags are sufficient for original flight rendering. `shakeTime`/in-ground collision are client simulation state: original block impact sets shakeTime7 and client ticks decrement it. They are not supplied by the usual spawn metadata. Implement the original collision/tick path using actual native blocks, or explicitly scope impact shake as unimplemented; do not invent it from arbitrary nearby blocks. Sources: `cnd.tick/onHitBlock`, `gji.render`, `cnf.handleEntityEvent`.

### Thrown trident

`TridentModel fxp.createLayer` (original lines25–54) uses **32×32** `textures/entity/trident.png`. Every pivot/rotation is zero; `base` and all spikes are children of `pole`; model cube coordinates are original pixels:

| Part | UV | Origin | Size | Extra |
| --- | --- | --- | --- | --- |
| pole | 0,6 | -.5,2,-.5 | 1,25,1 | |
| base | 4,0 | -1.5,0,-.5 | 3,2,1 | |
| left_spike | 4,3 | -2.5,-3,-.5 | 1,4,1 | |
| middle_spike | 0,0 | -.5,-4,-.5 | 1,4,1 | |
| right_spike | 4,3 | 1.5,-3,-.5 | 1,4,1 | mirrored |

`ThrownTridentRenderer gmw.render` (lines26–37) applies Y=`lerpYaw-90°`, Z=`lerpPitch+90°`, then original ModelPart rendering. Model material is `entitySolid`; foil uses the original item foil-buffer path (`ItemRenderer glh`) and actual `ThrownTrident coc` metadata11 foil bool defaultfalse. Metadata10 loyalty byte defaults0; inherited arrow8/9 apply. A held-trident 2D item icon or `trident_riptide.png` is not this projectile model. Port glint as a separate original render pass; absent glint support must not be disguised as plain full parity.

### Fishing bobber and line

`FishingHookRenderer gkq.render` (lines30–73) requires an actual player owner. Bobber is a camera-facing quad scaled `.5`, positions x/y in[-.5,.5], z0, UV full[0,1], `entityCutout`, original **8×8** `textures/entity/fishing_hook.png`. Vanilla's owner reconstruction (`Projectile cnp.recreateFromPacket` / `FishingHook cnl.recreateFromPacket`) looks up raw `spawn_entity.objectData` as the owner entity ID; do not guess an offset or a nearest fisher. `cnl` metadata8 hooked-entity int defaults0 and encodes hooked ID+1; metadata9 biting bool defaultsfalse. These are distinct from the spawn owner.

The black original `RenderType.lineStrip` has17 points, s=i/16 for i=0..16, relative point `(dx*s, dy*(s*s+s)*.5+.25, dz*s)`. Delta is between original hand endpoint and interpolated bobber position plusY=.25. `gkq.getPlayerHandPos` (lines76–114) derives the endpoint from actual owner hand/rod choice, body yaw, crouch, scale and interpolated eye position; the owner's first-person path additionally uses FOV/near plane and actual swing. Port the third-person endpoint first, then the actual self first-person path; do not present a fixed chest endpoint as the complete original line.

### Experience orb and pickup

`ExperienceOrbRenderer gkn.render` (lines31–66) uses **64×64** `textures/entity/experience_orb.png`, `itemEntityTranslucentCull`. Sprite index from `ExperienceOrb btc.getIcon()` is0..10 at value thresholds `3,7,17,37,73,149,307,617,1237,2477`. UV cell is `(index%4,index/4)*16` in that64 atlas. Quad vertices are(-.5,-.25),(.5,-.25),(.5,.75),(-.5,.75), z0; translateY=.1, camera-facing rotation, uniform scale.3. Alpha is128/255. With t=(clientTick+p)/2, R=`int((sin(t)+1)*.5*255)`, G255, B=`int((sin(t+4.1887903)+1)*.1*255)`. Original block light adds7 then clamps0..15. This is not an additive glowing sphere.

Protocol767 has separate `spawn_entity_experience_orb`: `{entityId,x,y,z,count:i16}`; count is XP value for sprite selection. It has no spawn UUID/type fields. Track it by actual entityID+connection epoch and its original type, not a synthesized player/entity UUID.

Original `ClientPacketListener fzg.handleTakeItemEntity` (872–899) creates `ItemPickupParticle gch` for item/XP pickup. `gch` renders the original copied item entity/orb toward the **moving** collector with progress `((life+p)/3)^2`, updating old/current target positions each tick, and removes the particle at3ticks. `collect` includes collected/collector IDs and pickup count. Original item collection subtracts the count and removes only when empty; XP collection is not treated as an item-stack decrement. The actual inventory/XP state remains server-derived.

## Particles: reusable input, original family rules

`ClientPacketListener fzg.handleParticleEvent` (2061–2087) preserves a crucial distinction: amount0 spawns **one directional particle** with velocity `(offsetX,offsetY,offsetZ)*velocityOffset`; amount>0 uses independent Gaussian position offsets and velocities. Preserve `longDistance`, original particle type and all type-specific data. Existing `viewerParticlePacket()` / `ServerParticles` have this basic seam; the older generic colored-ring helper does not supply original particle behavior.

| Practical family | Original class / material | Original resource and implementation scope |
| --- | --- | --- |
| heart / angry villager | `HeartParticle gce`, PARTICLE_SHEET_OPAQUE | `particles/heart.json` → `textures/particle/heart.png` (8×8). Heart lifetime16ticks, friction.86, initial vertical addition.1, no physics; quad grows using clamp((age+p)/lifetime*32,0,1). Provider distinguishes angry villager. |
| crit / enchanted hit / damage indicator | `CritParticle gbn` and provider subclasses, OPAQUE | `particles/crit.json` → `critical_hit.png` (8×8). Base friction.7, gravity.5; original constructor randomization/lifetime, per-tick green×.96 / blue×.9; provider variants alter color/lifetime. |
| flame / small flame | `FlameParticle gby` / providers, OPAQUE | `particles/flame.json` → `flame.png` (8×8); original rising-particle motion, shrinking quad and increasing block-light rule; small variant has its own scaling. |
| smoke / poof | `SmokeParticle gdb` → `BaseAshSmokeParticle gbf`; `ExplodeParticle gbv` | `particles/smoke.json` / `poof.json` list **generic_7…generic_0 in that order**; preserve frame selection and original friction/gravity/lifetime. Do not use one fixed random frame and1second linear velocity for every family. |
| explosion / sweep | `HugeExplosionParticle gcf` / `AttackSweepParticle gbe`, PARTICLE_SHEET_LIT | `particles/explosion.json` lists explosion_0…15; sweep_attack lists sweep_0…7 (32×32 sprites). Original full-bright light15728880; explosion lifetime6+nextInt(4), random gray `.4+.6*r`, quadSize `2*(1-input*.5)`; sweep is a separate class. |
| dust / dust transition | `DustParticle gbr`, `DustColorTransitionParticle gbq`, base `DustParticleBase gbs` | Original generic_7…0 sprites, actual supplied colors/scale and original random size/lifetime/transition timing. Fix the protocol-label issue below before using transition colors. |
| block / falling dust / item | `TerrainParticle gdm`, `FallingDustParticle gbw`, `BreakingItemParticle gbh` | Original selected block/item model sprite and tint/quarter-UV, not a generic particle PNG. Require native block-state IDs or complete real item Slot/components and original model/color provider. Unsupported model inputs remain explicit. |

`ParticleEngine.MutableSpriteSet gcp$b.get(age,lifetime)` selects integer `age*(spriteCount-1)/lifetime`; random sprite selection is a separate overload. `SingleQuadParticle gda` renders actual camera-facing quads; `TextureSheetParticle gdn` supplies original atlas UVs. Original `ParticleRenderType gcr` opaque/lit disable blending and write depth; translucent uses default alpha blending and also writes depth. Original `shaders/core/particle.fsh` discards alpha<.1. Reusing one additive, depthWrite=false point shader for all families would change the original appearance.

**Verified protocol767 dust-transition label mismatch:** original `DustColorTransitionOptions lg.STREAM_CODEC` orders vector-from, vector-to, float-scale. The installed `minecraft-data`1.21.1 schema labels those seven floats `fromRed,fromGreen,fromBlue,scale,toRed,toGreen,toBlue`. Therefore in that exact decoded shape the actual toRGB is `[data.scale,data.toRed,data.toGreen]`, and actual scale is `data.toBlue`. Existing compatibility correction is limited to version1.20.6; its1.21.1 path rejects this layout. Add an explicit matched-schema conversion without mutating the decoder, or use a corrected schema after verification. A field named `scale` is not proof that it contains scale.

Particle packets do not carry the separate Java client's random stream or clock. Original sprites/rules can be ported and tested deterministically with an injected local RNG, while exact matching of a reference client's particular random realization remains unverified. This does not prevent practical particle rendering.

## Sounds: source assets and exact event behavior

- Original `ClientPacketListener fzg.handleSoundEvent/handleSoundEntityEvent/handleStopSoundEvent`; `SoundEngine gvc`; `SoundManager gvf`; `WeighedSoundEvents gvg`; `Sound gtx`; `SimpleSoundInstance gtv`; `EntityBoundSoundInstance gtr` are the relevant classes. Existing `viewer-sound-packets.mjs` already decodes holders/names/category/seed, xyz divided by8, moving entity IDs and stop flags. Keep **one** raw observer; adding Mineflayer's derivative `soundEffectHeard` duplicates those sounds.
- The verified client JAR contains **no** `assets/minecraft/sounds.json` and **zero OGG entries**. Original sound definitions and `minecraft/sounds/*.ogg` belong to the matching Mojang launcher asset index/object store, with hash-verified version/index/object provenance and actual resource-pack priority. JAR texture export alone cannot supply audio. Extend [sound export](../tools/export-minecraft-viewer-sounds.mjs) and [numeric registry verification](../host/viewer-sound-registry.mjs) for1.21.1; neither existing1.20.6 gate attests that version. Unavailable original sound bytes/registry are a concrete missing input, not a Three.js/Mineflayer limitation.
- Sound selection preserves original `sounds.json` weights, referenced events, per-variant volume/pitch/stream/preload/attenuation and subtitles. `gvg.getSound()` chooses `random.nextInt(totalWeight)`; `RandomSource ayw.create(seed)` constructs `LegacyRandomSource dyz`, the Java48-bit LCG. Current old UI hashes the decimal seed into a32-bit fraction, which can choose a different original variant. Use the original seeded RNG and draw order for claimed parity.
- `gvc.calculatePitch()` clamps final pitch to[.5,2]; final category-adjusted gain clamps[0,1]. Source attenuation distance is `max(instanceVolume,1)*variant.attenuationDistance`; preserve inline fixed-range semantics. `stop_sound` mask0 stops all, bit1 category, bit2 resource; entity-bound sources follow that actual entity until it is unavailable. Browser audio activation is a normal explicit UI action; it does not require another game connection.
- Some sounds are generated by original client event rules rather than explicit sound packets. `fzg.handleTakeItemEntity()` plays XP pickup volume.1, pitch `.9+(r1-r2)*.35`, and item pickup volume.2, pitch `2+(r1-r2)*1.4`, at the collected entity. Port those known collect-driven rules separately; do not invent pickup audio from `entity_destroy` or duplicate raw/derived events. Ambient music and client-local schedules have their own unreceived random/timing state and need a separately declared scope.

## Target selection and small integration plan

Native actor roots/state can feed existing `pickEntity()` using canvas NDC and current camera. Supply IDs with actual epoch/UUID, normalize native metadata by **key** rather than array position, filter received invisibility, detached/removed/hidden/material-invisible roots, and return an ID/state selection rather than storing a stale mesh. Read the target's displayed root after interpolation when following; clear selection on entity removal, identity/epoch change or disconnect. Existing [context-menu model/UI](../src/modern-viewer/entity-context-menu.js) can provide details/follow/return without dispatching an attack.

The old generic mesh picker sorts entity intersections but does not itself include terrain occlusion. Compare against the nearest supported world hit if selection must respect walls. Original gameplay hit testing is `GameRenderer ges.pick` (615–661) and `ProjectileUtil cnr.getEntityHitResult` (73–110), using real camera rays, pickable hit boxes/pick radius and block-limited reach. Spectator selection policy and actual game interaction reach are separate contracts; camera following does not authorize a game action.

Practical order: (1) original arrow/trident/orb/bobber actors plus the separate orb spawn/metadata inputs; (2) bounded epoch/sequence transient particle/audio channel with no reconnect replay; (3) original heart/crit/flame/explosion families, then model-dependent dust/item/block cases; (4) verified1.21.1 sound assets/registry, seeded variants and stop/entity movement; (5) native pick/follow UI. Add meaningful offline geometry/UV/cue tests, then same-action-connection WebGL/audio checks. Missing Java-reference random phase, lightmap or glint parity must remain disclosed independently of successful playback.

## Selected exact original assets

Full paths below are inside the locked JAR; all hashes and PNG dimensions were read directly. No assets were copied or regenerated by this audit.

| ZIP resource | Dimensions | SHA-256 |
| --- | --- | --- |
| assets/minecraft/textures/entity/projectiles/arrow.png | 32×32 | `630483313e847f86c5af6f73b572a03fc0b943e99c780505cbfb14c8ec299553` |
| assets/minecraft/textures/entity/projectiles/spectral_arrow.png | 32×32 | `deff2b4f82393efac5d344b8aa0e420f82d0f854cfc525e8672d973982137f55` |
| assets/minecraft/textures/entity/trident.png | 32×32 | `cee14236960dae0960c0d0d14e4f61cf2cade3c160887b532d5d8a9e9e6ef530` |
| assets/minecraft/textures/entity/fishing_hook.png | 8×8 | `f4c642d2f12aa8ee7e7c9acbc1b197cf8209a91d9e69acdff1bba4b3193cd785` |
| assets/minecraft/textures/entity/experience_orb.png | 64×64 | `9a708e3fdb4e74a540e2e7df41111edf591aab9965c4e2e8ff8c943b7e0fb1f3` |
| assets/minecraft/textures/particle/critical_hit.png | 8×8 | `a7c036fd1b4c73856e3a7d638b56c1cbd047a2b18c504923ad7d5ae07046d908` |
| assets/minecraft/textures/particle/heart.png | 8×8 | `351e76662421bfd9285429847568b93046cd26100acc3f53550c663234bbde7b` |
| assets/minecraft/textures/particle/flame.png | 8×8 | `2f2efacac134ce943d142d3a40e43f87e80e1e32d7137645bb1268618505e4a7` |
| assets/minecraft/textures/particle/explosion_0.png | 32×32 | `3e2ca80f6accdcf50f580df2e8777ada3279ea9b6c74c28028e1bb2d2edb9140` |
| assets/minecraft/textures/particle/sweep_0.png | 32×32 | `9d21c7a8dcbc06a86c91d7968f4fb634457c07a746aae600a7b758e2133c2af3` |

Protocol fields were also read from the installed primary schema at `D:/neko-plugins/_sources/minecraft-ai-friend/packages/agent-mc-world/node_modules/minecraft-data/minecraft-data/data/pc/1.21.1/protocol.json`, cross-checked against original mapped classes above. Do not use the vanilla table as a modpack's native registry.
