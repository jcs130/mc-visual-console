# Native aquatic entities, Minecraft Java 1.21.1

This tranche adds twelve aquatic actor paths, correct intentional no-mesh handling for three NoopRenderer registrations, and living hurt/death/swing integration for the existing common six. The full original census remains 130: 46 non-self paths (34 previous plus twelve aquatics), one self-only player path, 80 visible types pending their own original renderer integration, three intentional no-mesh types. These counts do not mean complete entity or scene parity.

## Source chain

- Locked client SHA-256 `499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99`.
- Official client mappings SHA-256 `140c47931cccc8fc9e4c22d7603e2d714d1a953a146f51ea7397d95c955536ec`.
- Original baked catalogue SHA-256 `3571f2c6d4fbaa2e07db239853e0baf5db9dd07c5b66653cafa7588da466fbe3`: 213 layers with original named hierarchy, pivots, polygon positions, normals and UVs. No animation is inferred from rest geometry.
- Provider census is the original EntityRenderers `gkk` registration table, with the separate player renderer map. `native-entity-coverage.js` retains all130 provider/layer/texture records and disjoint next-task reasons. Runtime catalogue loading checks IDs/names against this census.
- Offline `javap` plus cached Vineflower extraction supplied original model/renderer/entity rules. No original game/client/server was launched. EntityType `bsx`, Entity `bsr`, LivingEntity `btn`, Attributes `buw`, Mth `ayo`, RandomSource `ayw`, AgeableListModel `fuf` and QuadrupedModel `fwu` supplied shared rules.
- `native-aquatic-model-reference.json` records class SHA-256s and 34 outputs captured by invoking **unchanged original model setupAnim bytecode** in an isolated CPU harness. ModelPart and entity facts were stubs; scalar Mth LUT/rotLerp rules were supplied independently. Original geometry/UV/PNG hashes are tested separately. The oracle establishes controlled model transforms, not full Java rendering or scene pixels.

## Original class-specific contract

| Entity | Original classes and state | Geometry, appearance and animation |
| --- | --- | --- |
| Axolotl | fum/gjj/cgq | axolotl#main, five original variant PNGs; inherited baby16, variant17 int, playingDead18 bool. Original saved rotation map, ground still/crawl, water hover/swim, play-dead and mirrored limb smoothing. AgeableListModel body-only baby scale .5, y12. |
| Cod | fva/gjv/cfk | cod#main, fish/cod.png. Tail Y `-factor*.45*sin(.6age)`, factor1 water/1.5 land. Renderer Y4.3*sin(.6age) degrees, land translation(.1,.1,-.1) then Z90. |
| Dolphin | fvf/gjz/cfm | dolphin#main, dolphin.png. Body head yaw/pitch; actual horizontal velocity squared >1e-7 enables body X add `-.05-.05*cos(.3age)`, tail X `-.1*cos`, tail_fin X `-.2*cos`. Original max head-yaw control1 degree. |
| Elder guardian | fvr/gkc/cjs | elder_guardian#main, guardian_elder.png. Guardian rules with original EntityType width ratio1.9975/.85 renderer scale; beam attack duration60. |
| Glow squid | fxm/gkv/bte | glow_squid#main, squid/glow_squid.png. Original squid counters; received darkTicks16 int and client decrement retained. Original block-light brightness is exposed as a lightmap boundary. |
| Guardian | fvr/gkx/cjz | guardian#main, guardian.png. Moving16 bool, target17 int. Twelve original spike axes/positions, three tail multipliers .05/.1/.15, actual-target eye tracking; original crossed beam quads/end cap, color progression, fullbright pass and scrolling UVs. Duration80. |
| Pufferfish | fwr/fws/fwt/gmc/cfx | Three original size layers, fish/pufferfish.png, puff17 int. Bounds scale .5/.7/1. Original fin Z `-.2+.4*sin(.2age)` and inverse; renderer Y `cos(.05age)*.08`. Fin/bob animation works independently of water occupancy. |
| Salmon | fwy/gmg/cfz | salmon#main, fish/salmon.png. Tail coefficient .25, factor water1/land1.3 and rate1/1.7; renderer swing factor4.3, translate Z-.4, land(.2,.1,0), Z90. |
| Squid | fxm/gmr/cgd | squid#main, squid/squid.png. Original Java48 random tentacle-speed constructor rule, received status19 reset, client phase clamp2PI, distinct water-or-bubble/land tentacle and body rotations; received velocity supplies motion facts. |
| Tadpole | fxo/gmu/chb | tadpole#main, tadpole/tadpole.png. Tail `-factor*.25*sin(.3age)` water1/land1.5. Original renderer has no fish-style flop override. |
| Tropical fish | fxq/fxr/gna/gpf/cge | Original small/large main and pattern layers; two base PNGs, twelve pattern PNGs. Packed17 int bytes: shape/pattern/base dye/pattern dye. Original diffuse DyeColor values, separate pattern tint and original tail/flop rules. Nested gpf/gna switch-map classes confirm selectors. |
| Turtle | fxs/gnb/cgf | turtle#main, turtle/big_sea_turtle.png. Baby16, hasEgg18, layingEgg22; correct swim/ground limb axes, laying speed4/strength2, egg belly visibility and draw Y-.08; original baby head/body1/6 with y20; baby bounds scale .3. |

## Received facts, clocks and lifecycle

`native-entity-motion.js` preserves generic received position/head/body interpolation and original LivingEntity counters, separate from species models. Only applicable models receive walk phases. Puffer/dolphin independent inputs continue to animate when water is unavailable. Common six consume original hurt overlay, death roll and swing counters; their original models do not assign an attackAnim bone pose, so no attack pose is invented. Health<=0 no longer silently drops their mesh; actual entity removal owns disposal.

`NativeWorldState` samples water from this action connection's exact native columns/state registry: original constructor dimensions, received scale modifiers, AABB deflate.001, inflated horizontal chunk availability, original per-state fluid height/full-height-above and surface comparison with Java float arithmetic. Unknown columns/state/height stay explicitly unavailable. On-ground, fish name and swimming flags never stand in for water. Bubble-column occupancy uses the original entity block position. `entity_update_attributes` is forwarded by the shared vanilla observer; only connection-decoded named scale attributes are interpreted, with original modifier order and range .0625–16. Missing override telemetry is disclosed; mod adapters must forward their own validated native attributes/registry.

Position/counters advance only on actual connection ticks. Presentation interpolation does not synthesize lifetime ticks. Actors preserve identity and epoch/revision ordering; retained axolotl rotations survive ordinary metadata updates, variants rebuild deliberately, guardian target identity cannot follow a reused entity ID, and removals/resets dispose geometry/materials/textures.

## Explicit remaining boundaries

All material/light and complete scene parity flags remain unverified. Original PNGs and source transforms are integrated; no matched Java/WebGL pixel acceptance was performed. Fire/outline, nondefault unsupported poses/equipment, unforwarded scale overrides, unknown fluid cells and unavailable guardian target pose/bounds remain individual diagnostics. Bounds are provided only for the aquatic shapes and already-supported standing target classes with audited dimensions; other classes need their own dynamic dimensions. Original glow-squid block-light behavior needs the scene lightmap.

Guardian initial tail/spike randomness and squid phase are local client realizations. **Squid seeds getId() in its constructor, before recreateFromPacket replaces that client-local AtomicInteger ID with the server ID.** The viewer therefore uses its own constructor sequence and original Java48 nextFloat rules; server IDs do not establish shared random phases. The Mth atan2 bit/LUT approximation is ported for squid body rotations. These source rules do not promise identical independently seeded Java-client pixels.

Remaining80 visible families are the seven keyframe types, 30 animals/humanoids, 13 procedural living types, nine vehicles, 15 special types and six displays/hanging types. Existing paths also retain the cross-cutting pose/layer/equipment/light/scene backlog. This tranche does not delete or classify those tasks as permanent Mineflayer limitations.
