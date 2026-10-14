# Original 1.21.1 common mob source audit

Audited 2026-10-15 without launching Minecraft, connecting to a server, or calling a model. This is an implementation reference, not a claim that these actors are implemented or visually accepted. See [port coverage](mineflayer-port-coverage.md) for the native pipeline gaps.

Primary inputs were the original Mojang client JAR at `D:/neko-plugins/minecraft_autonomous/local/live-runtime/visual-completion-20261015/minecraft-1.21.1-client.jar` and official client mappings at `D:/neko-plugins/minecraft_autonomous/local/live-runtime/viewer-features-20261014/client-mappings.txt`. The JAR's SHA-256 was freshly verified as `499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99`. Geometry, animation and defaults below were checked by read-only `javap -p -c`, mapping lookup, original ZIP entry reads/hashes and PNG IHDR dimensions. Original JARs, mappings and bytecode captures remain outside Git.

## Classes and original layers

| Mob / family | Model and mapped source method | Renderer / extra original layers |
| --- | --- | --- |
| Zombie / Husk | `HumanoidModel fvx.createMesh`, original source lines 89–126; `AbstractZombieModel fud.setupAnim`, 13–15; `ZombieModel fyc.isAggressive` | `ZombieRenderer gnp`; `HuskRenderer glb.scale` = 1.0625. `LayerDefinitions fyh.createRoots` binds both to the generic 64×64 humanoid layer. |
| Drowned | `DrownedModel fvg.createBodyLayer`, 22–43; prepare/setup animate use the zombie superclass | `DrownedRenderer gkb`, `DrownedOuterLayer god`: original drowned model at deformation .25, 64×64. |
| Skeleton / Stray / Wither Skeleton | `SkeletonModel fxf.createBodyLayer`, 26–30; `createDefaultSkeletonMesh`, 34–54; prepare/setup 58–92 | `SkeletonRenderer gml`, `StrayRenderer gms`, `WitherSkeletonRenderer gnl.scale` = 1.2. Stray clothes use **HumanoidModel.createMesh(.25, 0)**, 64×32, not the skinny skeleton mesh. |
| Bogged | `BoggedModel fur.createBodyLayer` = humanoid mesh + skeleton limb replacements + mushrooms; prepare hides mushrooms when sheared | `BoggedRenderer gjo`; outer clothes use **HumanoidModel.createMesh(.2, 0)**, 64×32. |
| Creeper | `CreeperModel fve.createBodyLayer(CubeDeformation)`; setup animation | `CreeperRenderer gjx`; `CreeperPowerLayer gny`: same creeper model with deformation 2, original armor texture, UV offset based on age × .01. |
| Spider / Cave Spider | `SpiderModel fxl.createSpiderBodyLayer`, 46–79; setup animation | `SpiderRenderer gmq`, `CaveSpiderRenderer gjs.scale` = .7. Spider death flip is 180°, not the living default 90°. Original spider eyes layer `gpc`. |
| Enderman | `EndermanModel fvi.createBodyLayer`, 22–63; setup 68–142 | `EndermanRenderer gkf`; original eyes `gof` and carried-block layer `gnw`. |
| Witch | `WitchModel fxz.createBodyLayer`, 22–58, extends `VillagerModel fxv.createBodyModel`; setup 63–76 | `WitchRenderer gnj.scale` = .9375; held-item layer `gpi`. |
| Zombie Villager | `ZombieVillagerModel fyd.createBodyLayer`, 23–69; armor layer 73–103; setup 108–111 | `ZombieVillagerRenderer gnq`; original armor and `VillagerProfessionLayer gpg` with `zombie_villager` texture folder; converting contributes to shaking. |
| Iron Golem | `IronGolemModel fvz.createBodyLayer`; setup and prepare | `IronGolemRenderer gle`; crackiness `gom`, flower `gon`; original walk rocking. |

The existing [native ModelPart helper](../src/native-viewer/native-entity-model.js) directly ports original cube UV/geometry. It is useful for these models. Its current positive-size check rejects original zero-depth Bogged mushroom planes; those need original planar cube support rather than a thicker substitute. `PartDefinition fyt.addOrReplaceChild()` preserves an old part's children when replacing its cubes/pose. This matters for Witch's inherited nose and hat rim and must be retained by any geometry extraction utility.

## Geometry transcription

All coordinates below are the original **Y-down model pixels**. `UV` means the original cube UV origin; `O` cube origin; `S` cube size; `P` part pivot; `R` part Euler rotation in radians. Unlisted deformations/rotations are zero, unlisted parent is model root. `M` means mirrored. Preserve actual float32 constant semantics when calculating animation/poses. The common living renderer applies body yaw, scale `(-1,-1,1)`, its per-class scale and translation `(0,-1.501,0)` before the pixel model. Do not reshape these definitions to fit a proxy entity box. Sources: `glk.render`, `fyk` ModelPart and the model methods above.

### Humanoid, zombie and skeleton families

`HumanoidModel.createMesh(0,0)`:

| Part | UV | O | S | P | Extra |
| --- | --- | --- | --- | --- | --- |
| head | 0,0 | -4,-8,-4 | 8,8,8 | 0,0,0 | |
| hat | 32,0 | -4,-8,-4 | 8,8,8 | 0,0,0 | deformation .5 |
| body | 16,16 | -4,0,-2 | 8,12,4 | 0,0,0 | |
| right_arm | 40,16 | -3,-2,-2 | 4,12,4 | -5,2,0 | |
| left_arm | 40,16 | -1,-2,-2 | 4,12,4 | 5,2,0 | M |
| right_leg | 0,16 | -2,0,-2 | 4,12,4 | -1.9,12,0 | |
| left_leg | 0,16 | -2,0,-2 | 4,12,4 | 1.9,12,0 | M |

For a requested deformation `d`, every main cube gets `d` and the hat gets `d + .5`. This is the zombie/husk base and the **full-width** Stray/Bogged clothing geometry described above. It is not the base skinny skeleton model.

Skeleton starts with that humanoid head/hat/body but replaces the following parts, 64×32:

| Part | UV | O | S | P | Extra |
| --- | --- | --- | --- | --- | --- |
| right_arm | 40,16 | -1,-2,-1 | 2,12,2 | -5,2,0 | |
| left_arm | 40,16 | -1,-2,-1 | 2,12,2 | 5,2,0 | M |
| right_leg | 0,16 | -1,0,-1 | 2,12,2 | -2,12,0 | |
| left_leg | 0,16 | -1,0,-1 | 2,12,2 | 2,12,0 | M |

Skeleton `translateToHand()` temporarily shifts the chosen arm pivot X by +1 for right / -1 for left while applying its transform, then restores it. Do not use the wide-arm wrist mount unchanged.

Drowned starts with humanoid geometry but replaces **left_arm** with UV 32,48; O `(-1,-2,-2)`; S `(4,12,4)`; P `(5,2,0)`, without mirror; and **left_leg** with UV 16,48; O `(-2,0,-2)`; S `(4,12,4)`; P `(1.9,12,0)`, without mirror. Base deformation 0, outer deformation .25; 64×64. Source: `fvg.a(fyo)`.

Bogged adds a `mushrooms` container at P/R zero beneath `head`; children are:

| Child | UV | O | S | P | R |
| --- | --- | --- | --- | --- | --- |
| red_mushroom_1 | 50,16 | -3,-3,0 | 6,4,0 | 3,-8,3 | 0,.7853982,0 |
| red_mushroom_2 | 50,16 | -3,-3,0 | 6,4,0 | 3,-8,3 | 0,2.3561945,0 |
| brown_mushroom_1 | 50,22 | -3,-3,0 | 6,4,0 | -3,-8,-3 | 0,.7853982,0 |
| brown_mushroom_2 | 50,22 | -3,-3,0 | 6,4,0 | -3,-8,-3 | 0,2.3561945,0 |
| brown_mushroom_3 | 50,28 | -3,-4,0 | 6,4,0 | -2,-1,4 | -1.5707964,0,.7853982 |
| brown_mushroom_4 | 50,28 | -3,-4,0 | 6,4,0 | -2,-1,4 | -1.5707964,0,2.3561945 |

### Creeper and spider

Creeper, 64×32; every cube uses the requested deformation (`0` base, `2` charged layer):

| Part | UV | O | S | P |
| --- | --- | --- | --- | --- |
| head | 0,0 | -4,-8,-4 | 8,8,8 | 0,6,0 |
| body | 16,16 | -4,0,-2 | 8,12,4 | 0,6,0 |
| right_hind_leg | 0,16 | -2,0,-2 | 4,6,4 | -2,18,4 |
| left_hind_leg | 0,16 | -2,0,-2 | 4,6,4 | 2,18,4 |
| right_front_leg | 0,16 | -2,0,-2 | 4,6,4 | -2,18,-4 |
| left_front_leg | 0,16 | -2,0,-2 | 4,6,4 | 2,18,-4 |

Spider, 64×32; Cave Spider uses exactly this geometry and renderer scale .7:

| Part | UV | O | S | P | Extra |
| --- | --- | --- | --- | --- | --- |
| head | 32,4 | -4,-4,-8 | 8,8,8 | 0,15,-3 | |
| body0 | 0,0 | -3,-3,-3 | 6,6,6 | 0,15,0 | |
| body1 | 0,12 | -5,-4,-6 | 10,8,12 | 0,15,9 | |
| right_hind_leg | 18,0 | -15,-1,-1 | 16,2,2 | -4,15,2 | |
| left_hind_leg | 18,0 | -1,-1,-1 | 16,2,2 | 4,15,2 | M |
| right_middle_hind_leg | 18,0 | -15,-1,-1 | 16,2,2 | -4,15,1 | |
| left_middle_hind_leg | 18,0 | -1,-1,-1 | 16,2,2 | 4,15,1 | M |
| right_middle_front_leg | 18,0 | -15,-1,-1 | 16,2,2 | -4,15,0 | |
| left_middle_front_leg | 18,0 | -1,-1,-1 | 16,2,2 | 4,15,0 | M |
| right_front_leg | 18,0 | -15,-1,-1 | 16,2,2 | -4,15,-1 | |
| left_front_leg | 18,0 | -1,-1,-1 | 16,2,2 | 4,15,-1 | M |

### Enderman and Iron Golem

Enderman, 64×32:

| Part | UV | O | S | P | Extra |
| --- | --- | --- | --- | --- | --- |
| head | 0,0 | -4,-8,-4 | 8,8,8 | 0,-13,0 | |
| hat | 0,16 | -4,-8,-4 | 8,8,8 | 0,-13,0 | deformation -.5 |
| body | 32,16 | -4,0,-2 | 8,12,4 | 0,-14,0 | |
| right_arm | 56,0 | -1,-2,-1 | 2,30,2 | -5,-12,0 | |
| left_arm | 56,0 | -1,-2,-1 | 2,30,2 | 5,-12,0 | M |
| right_leg | 56,0 | -1,0,-1 | 2,30,2 | -2,-5,0 | |
| left_leg | 56,0 | -1,0,-1 | 2,30,2 | 2,-5,0 | M |

Iron Golem, 128×128. The second head/body rows are **additional cubes in the same part**, not extra independently rotated bones:

| Part | UV | O | S | P | Extra |
| --- | --- | --- | --- | --- | --- |
| head | 0,0 | -4,-12,-5.5 | 8,10,8 | 0,-7,-2 | |
| head (nose cube) | 24,0 | -1,-5,-7.5 | 2,4,2 | same | |
| body | 0,40 | -9,-2,-6 | 18,12,11 | 0,-7,0 | |
| body (pelvis cube) | 0,70 | -4.5,10,-3 | 9,5,6 | same | deformation .5 |
| right_arm | 60,21 | -13,-2.5,-3 | 4,30,6 | 0,-7,0 | |
| left_arm | 60,58 | 9,-2.5,-3 | 4,30,6 | 0,-7,0 | |
| right_leg | 37,0 | -3.5,-3,-3 | 6,16,5 | -4,11,0 | |
| left_leg | 60,0 | -3.5,-3,-3 | 6,16,5 | 5,11,0 | M |

### Zombie Villager and Witch

Zombie Villager starts with humanoid mesh, replacing all visible main parts as follows; 64×64:

| Part / cube | UV | O | S | P | Extra |
| --- | --- | --- | --- | --- | --- |
| head | 0,0 | -4,-10,-4 | 8,10,8 | 0,0,0 | |
| head (nose cube) | 24,0 | -1,-3,-6 | 2,4,2 | same | |
| hat | 32,0 | -4,-10,-4 | 8,10,8 | 0,0,0 | deformation .5 |
| hat_rim | 30,47 | -8,-8,-6 | 16,16,1 | 0,0,0 | parent hat; R(-1.5707964,0,0) |
| body | 16,20 | -4,0,-3 | 8,12,6 | 0,0,0 | |
| body (jacket cube) | 0,38 | -4,0,-3 | 8,20,6 | same | deformation .05, **not .5** |
| right_arm | 44,22 | -3,-2,-2 | 4,12,4 | -5,2,0 | |
| left_arm | 44,22 | -1,-2,-2 | 4,12,4 | 5,2,0 | M |
| right_leg | 0,22 | -2,0,-2 | 4,12,4 | -2,12,0 | |
| left_leg | 0,22 | -2,0,-2 | 4,12,4 | 2,12,0 | M |

Its armor method is a separate geometry path, including body/leg deformation `d + .1`, and must not reuse the base jacket geometry. Type/profession/profession-level texture layers use actual received villager data/registries, hat metadata and baby rules, as in the original `gpg` layer.

Witch begins with original Villager mesh: head O(-4,-10,-4), S(8,10,8), UV0,0; nose child P(0,-2,0), O(-1,-1,-6), S(2,4,2), UV24,0; body O(-4,0,-3), S(8,12,6), UV16,20; jacket child S(8,20,6), same O, UV0,38, deformation .5; folded arms P(0,3,-1), R(-.75,0,0), with cubes UV44,22 O(-8,-2,-2) S(4,8,4), UV44,22 O(4,-2,-2) S(4,8,4) mirrored, and UV40,38 O(-4,2,-2) S(8,4,4); legs P(±2,12,0), O(-2,0,-2), S(4,12,4), UV0,22, left mirrored. `fxz.c()` replaces head with the same head cubes/zero pose and replaces the hat/adds these descendants; texture is 64×128:

| Part | Parent | UV | O | S | P | R / extra |
| --- | --- | --- | --- | --- | --- | --- |
| hat | head | 0,64 | 0,0,0 | 10,2,10 | -5,-10.03125,-5 | 0,0,0 |
| hat2 | hat | 0,76 | 0,0,0 | 7,4,7 | 1.75,-4,2 | -.05235988,0,.02617994 |
| hat3 | hat2 | 0,87 | 0,0,0 | 4,4,4 | 1.75,-4,2 | -.10471976,0,.05235988 |
| hat4 | hat3 | 0,95 | 0,0,0 | 1,2,1 | 1.75,-2,2 | -.20943952,0,.10471976; deformation .25 |
| mole | nose | 0,0 | 0,3,-6.75 | 1,1,1 | 0,-2,0 | deformation -.25 |

The inherited Villager `hat_rim` child is retained beneath the replaced hat: UV30,47, O(-8,-8,-6), S(16,16,1), P0, R(-1.5707964,0,0). Do not delete inherited child parts merely because `fxz.c()` replaces their parent.

## Animation rules and received cues

Notation: `W` = original interpolated walk position; `S` = original interpolated walk speed; `A` = interpolated attack animation; `T` = observing client's tickCount + partial tick; `p` = partial tick. Use the existing native Mth LUT sin/cos and float32 operation order where applicable. These client animation clocks are not server entity age or proof of Java reference clock alignment. [Existing native motion source](../src/native-viewer/native-entity-motion.js), [Mth helpers](../src/native-viewer/native-player-motion.js).

- **Normal humanoid walking:** head yaw/pitch are degrees × `.017453292`; right arm X `cos(W*.6662 + π)*S`, left arm X `cos(W*.6662)*S`; right leg X `cos(W*.6662)*1.4*S`, left leg X `cos(W*.6662+π)*1.4*S`. `fvx.setupAnim()` has additional fall-flying/riding/crouch/swim/use/attack branches; this normal branch alone does not cover those poses.
- **Zombie arms:** after humanoid animation, `fud` / `fyd` call `fuh.animateZombieArms(left,right,aggressive,A,T)`. Let `s1=sin(A*π)` and `s2=sin((1-(1-A)^2)*π)`. Set both Z=0, right Y=`-(.1-.6*s1)`, left Y=`.1-.6*s1`; both X=`-π/(aggressive?1.5:2.25)+1.2*s1-.4*s2`. Then bob arms: right Z adds `cos(T*.09)*.05+.05`, left Z subtracts it; right X adds `sin(T*.067)*.05`, left X subtracts it. Aggression comes from actual Mob flags bit4, not target proximity.
- **Skeleton:** prepare chooses BOW_AND_ARROW on the actual main arm only when actual mainhand is a bow and mob is aggressive. In the aggressive nonbow branch, same `s1/s2` and Y/Z setup as above, but both X=`-π/2-(1.2*s1-.4*s2)`, followed by bobArms. Nonaggressive mobs retain the humanoid branch. Source `fxf.prepareMobModel/setupAnim`; never assume every skeleton holds a bow when equipment is missing or different.
- **Drowned:** actual aggressive trident mainhand selects THROW_SPEAR on the correct arm. After zombie setup, the selected arm X becomes `oldX*.5-π`, Y=0. With swimAmount `u>0`, right X=`rotlerpRad(u,oldX,-2.5132742)+u*.35*sin(.1*T)`, left X uses the same interpolation minus the sinusoid; right/left Z interpolate to -.15/+.15; left/right leg X subtract/add `u*.55*sin(.1*T)`; head X=0. Source `fvg.setupAnim`. Complete swimming also requires the inherited humanoid/state rules.
- **Creeper walk:** LH and RF leg X=`cos(W*.6662)*1.4*S`; RH and LF use +π. Head uses actual yaw/pitch. `Creeper.tick()` stores oldSwell, forces swellDir=1 if received ignited, then clamps swell+swellDir between 0 and original client maxSwell=30. `getSwelling(p)=lerp(p,oldSwell,swell)/(30-2)`. Renderer: `g=1+sin(swelling*100)*swelling*.01`, `q=clamp(swelling,0,1)^4`; scale X/Z=`(1+.4*q)*g`, Y=`(1+.1*q)/g`. White-overlay progress is zero for even `floor(swelling*10)`, otherwise clamp swelling to [.5,1]. Sources `cjp.tick/getSwelling`, `gjx.scale/getWhiteOverlayProgress`. This is received-state-driven client swelling, not an inferred attack or remaining server fuse timer.
- **Spider:** reset all leg bases every frame. Pair order hind, middle-hind, middle-front, front: right Y bases `π/4, π/8, -π/8, -π/4`; left opposite. Right Z bases `-π/4, -.58119464, -.58119464, -π/4`; left opposite. With pair phases `0,π,π/2,3π/2`, right Y adds `-cos(W*.6662*2+phase)*.4*S`, left subtracts it; right Z adds `abs(sin(W*.6662+phase)*.4)*S`, left subtracts it. Head uses actual yaw/pitch. Source `fxl.setupAnim`.
- **Enderman:** run humanoid setup, set head visible, body X=0/PY=-14/PZ=0; multiply both arm and leg X by .5 then clamp each to [-.4,.4]. Carrying sets both arm X=-.5 and right/left Z=.05/-.05. Reset leg PY=-5/PZ=0, head PY=-13/PZ=0, then copy head position/rotations to hat. Creepy subsequently lowers head PY by5. Reset arm pivots to (-5,-12,0)/(5,-12,0). Sources `fvi.setupAnim`, `gkf.render`: carrying is actual carried block nonnull; creepy comes from actual metadata. Renderer creepy displacement uses its own Gaussian random generator, X/Z amplitude `.02*entityScale`, so a separate Java client's random realization is not available from network packets.
- **Witch:** Villager walking/head setup first. Nose default pivot (0,-2,0), Y rotation0; frequency `(entityId % 10)*.01`; nose X=`sin(clientTick*frequency)*4.5°`, Z=`cos(clientTick*frequency)*2.5°`. **Actual nonempty mainhand**, not merely using-item metadata, sets nose pivot (0,1,-1.5) and X=-.9. Sources `fxz.setupAnim`, `gnj.render`. The original nose loop uses whole tickCount, not `T` with partial.
- **Golem:** define triangle(v,period)=`(abs(v % period-period*.5)-period*.25)/(period*.25)`, retaining Java remainder semantics. Legs X=`-/+1.5*triangle(W,13)*S`; leg Y=0. Normal arms X=`(-.2+/-1.5*triangle(W,13))*S`. During received attack timer>0 both arms X=`-2+1.5*triangle(attackTimer-p,10)`; during flower timer>0 right X=`-.8+.025*triangle(flowerTimer,70)`, left X=0. `cfq.handleEntityEvent(4)` sets attackTimer10; status11 sets flowerTimer400; status34 clears flowerTimer. Original renderer adds Z rocking `6.5°*triangle(interpolatedWalkPosition+6,13)` when current walk speed≥.01. Sources `fvz.setupAnim/prepareMobModel`, `cfq.handleEntityEvent`, `gle.setupRotations`.

**Baby humanoids:** `fvx` initializes `AgeableListModel` with scaleHead=true, baby head offset16, Z offset0, baby head/body scale factors2, body Y offset24. The original head pass scales .75 then translates (0,1,0) in model world units; the body pass scales .5 then translates (0,1.5,0). Use the original part membership (`headParts` contains head; `bodyParts` also contains hat) and renderer/mob-specific rules rather than one global `.5` scale. Sources `fvx` constructors/headParts/bodyParts, `fuf.renderToBuffer`.

### Common hurt/death/attack

`LivingEntity.animateHurt(float)` (`btn.n`) sets hurtDuration=10 and hurtTime=10. The received `hurt_animation` packet is the exact current visual trigger. `damage_event` provides attribution and Mineflayer `entityHurt`; it is a separate event. The locked `LivingEntity.handleEntityEvent()` switch has no legacy status2 hurt case. Existing native transport already preserves `hurt_animation`, `animation` and `entity_status`; use each sequence once and advance only real action-connection ticks. [Native observer](../tools/native-world-host.mjs), [motion](../src/native-viewer/native-entity-motion.js).

`LivingEntityRenderer.getOverlayCoords()` (`glk.c`) selects red overlay when **hurtTime>0 OR deathTime>0**. `OverlayTexture gqc` builds a 16×16 texture: red rows contain ABGR `0xb20000ff`, red V=3; normal/white V=10; U=`int(whiteProgress*15)`; packed UV=`U | V<<16`. Original `assets/minecraft/shaders/core/rendertype_entity_cutout.fsh` and `rendertype_entity_translucent.fsh` blend `mix(overlay.rgb, base.rgb, overlay.a)` before multiplying by lightmap. Consequently hurt uses approximately 30.2% red / 69.8% original color, not a pure-red multiplicative material replacement and arbitrary 500 ms tween. Preserve original colors/material ownership; complete lighting/Java pixels remain separate acceptance work.

Death should retain the actor until the received removal, rather than immediately hiding at health≤0. `btn.tickDeath()` increments deathTime. `glk.setupRotations()` applies Z rotation `min(1,sqrt(((deathTime+p-1)/20)*1.6))*getFlipDegrees(entity)`, with default90° and Spider180°. Status3 sets ordinary living health0 through its original event path; metadata health0 also supplies the state. Base hurt/attack/death/swing counters are constructor-zero client state until real received cues; do not infer them from nearby actors.

`btn.updateSwingTime()` advances swingTime while swinging and writes attackAnim=swingTime/currentDuration; duration uses original haste/fatigue rules. Incoming animation0/3 specifies main/offhand swing. The original `swing()` does not restart the first half of an ongoing swing. Reuse already scoped [native hand motion](../src/native-viewer/native-first-person-motion.js) / [observer](../host/vanilla-hand-state.mjs) where applicable; mob effects/equipment/handedness still need actual mob data.

## Metadata constructor defaults, per actual class

Defaults below were verified from each original `defineSynchedData(SynchedEntityData.Builder)` bytecode. They are the initial values a matching vanilla client uses **until a received value replaces them**. Validate serializer and class/version first. A malformed received value, absent registry, unsupported mod subclass or omitted data from a lossy proxy must not be replaced with these defaults. Metadata key positions were cross-checked against installed `minecraft-data('1.21.1')`; native mod adapters must use their own exact registration evidence.

| Class | Key / serializer | Original defineSynchedData default | Rendering meaning |
| --- | --- | --- | --- |
| LivingEntity `btn` | 8 byte; 9 float; 10 particle list; 11 bool; 12/13 int; 14 optional block pos | 0; 1.0; empty list; false; 0/0; absent | Using/offhand/spin flags; health; effects; embedded arrows/stingers; sleeping position. Constructor may change health to max, which then becomes nondefault synchronized state; do not assume observed health is1 forever. |
| Mob `btp` | 15 byte | 0 | bit1 no-AI, bit2 left-handed, bit4 aggressive. `getMainArm()` is left only when bit2. |
| Zombie/Husk/Drowned `ckw` | 16 bool; 17 int; 18 bool | false; 0; false | baby; original special type; underwater conversion. |
| Skeleton `ckl` | 16 bool | false | Stray conversion, **not baby**. AbstractSkeleton itself defines no new metadata. |
| Stray / Wither Skeleton | no own key16 | — | Inherit only living/mob fields here. |
| Bogged `cjn` | 16 bool | false | Sheared. Original mushrooms visible when false. |
| Creeper `cjp` | 16 int; 17 bool; 18 bool | -1; false; false | Swell direction; powered; ignited. |
| Spider/Cave Spider `cko` | 16 byte | 0 | climbing flag. |
| Enderman `cjt` | 16 optional block state; 17 bool; 18 bool | absent; false; false | carried native block state; creepy; stared-at. |
| Raider `coj` → Witch | 16 bool | false | celebrating; do not treat as baby or potion use. |
| Witch `ckt` | 17 bool | false | using item. Holding pose additionally examines actual equipment. |
| Zombie Villager `ckx` | inherited16–18; 19 bool; 20 villager data | inherited zombie values; false; plains/none/level1 | converting and original villager variant. Map registry IDs by native registries, never hard-code a modpack profession ID. |
| Iron Golem `cfq` | 16 byte | 0 | player-created flags. Attack/flower timers are received status-driven client counters, not this metadata field. |

A generic `metadata[16]` → baby check is incorrect for almost every nonzombie in this set. The same raw key can be an int, byte, optional state or unrelated boolean. Native [dispatch metadata validation](../src/native-viewer/native-entity-dispatch.js) must branch by matched entity type.

Crackiness requires actual health/max-health ratio: original `Crackiness bsp` golem thresholds are strict `<.25` high, `<.5` medium, `<.75` low, otherwise none. Read effective max health/scale attributes from actual synchronized state or matched original constructor/registry defaults; do not silently assume every golem remains at its unmodified base value. Original attribute updates are an additional input seam beyond the current native terrain/entity allowlist. Enderman carried blocks similarly need the **native block-state ID/registry**, not a vanilla proxy state.

## Original textures and dimensions

Paths are beneath `assets/minecraft/textures/entity/` in the verified JAR. All listed PNGs were inspected directly. SHA-256 values below are exact original bytes; no PNG was regenerated.

| Path | Dimensions | SHA-256 |
| --- | --- | --- |
| zombie/zombie.png | 64×64 | `1c879744424077ab6f7d8b13b015dfc9d5e0efee6c70696de5c2ee588f4f563a` |
| zombie/husk.png | 64×64 | `0a4249ec6ba5aac74c5128c6753386c56abd451216da5396beab7c65e99c0181` |
| zombie/drowned.png | 64×64 | `c0553689bf1cdef2eca01f88cc7fcd1ccee47f702ba320ad5dfa6619c34fb778` |
| zombie/drowned_outer_layer.png | 64×64 | `c493c87f6a01f5a53cc86250ff3d1ce488c3014e2ee9adf5b5290e20ee6bf3d4` |
| skeleton/skeleton.png | 64×32 | `66524aa68d4e94fd3117df9b6e40cb48da5526e24a7f079c2c4852bca0d1c20e` |
| skeleton/stray.png | 64×32 | `75ab5d481962e25846ce0a83f5b80718f5b8a140066f2818b0f30ecdd7371c5d` |
| skeleton/stray_overlay.png | 64×32 | `feb0b28b90d11b9c7967a6f4438baff575cd07affb8fc99762f39d52d4e71136` |
| skeleton/wither_skeleton.png | 64×32 | `96e57241fa2f1414619eee8074991534ac83b6239b33875ce1fbc7e4b86f60a7` |
| skeleton/bogged.png | 64×32 | `ca3b2f30c6ba53b0c6f88a37e6527e65b11e2c3ab453331d8d1dbefcf065f39f` |
| skeleton/bogged_overlay.png | 64×32 | `1acf5b13b0e5bb9928140b1b4250699d535e41765852eeee4d10723a5bd3d71c` |
| creeper/creeper.png | 64×32 | `a98947a543623cedca72016e06aa24dc34807251ff8e2433be158c86a977c9e9` |
| creeper/creeper_armor.png | 64×32 | `6aeb93bfc947d6ccf1e4dd101ff34fdffa276328a8c2514dd5298eb733dbca98` |
| spider/spider.png | 64×32 | `12771d3524ad137812b2a94d52b6943401c5e0a942baa6946e783e822c46c554` |
| spider/cave_spider.png | 64×32 | `02386867edcf8af7d4a205360800991ab6be475dc4c80752c9145efb2699a8ac` |
| enderman/enderman.png | 64×32 | `ac2a712566f11083a7e7f44ca904088662157144d35e764002be04fc9c34d50c` |
| enderman/enderman_eyes.png | 64×32 | `da9b3ab2eea2011c5cafbd7d99f33e0a70ba72bcf43254fb98a24972c02ec19c` |
| witch.png | 64×128 | `d42d8dd0f1dbafcce3535304180b0f6d22c6277cb551cf190aaa54e18ef5282a` |
| zombie_villager/zombie_villager.png | 64×64 | `a57cdcc4f592591574e1e2217d1b9007f7093f82bb19cb6a7a40421026df1ff7` |
| iron_golem/iron_golem.png | 128×128 | `381bdfed52c5b82fcad3fb0090c5e8c093adf6c335cb4b0e5f68d7ac8c05ab07` |

Zombie Villager has original `type`, `profession`, `profession_level` 64×64 textures and selected `.png.mcmeta` hat rules. Iron Golem has original low/medium/high crack textures, all128×128. Those additional source bytes were inspected but are not exhaustively enumerated above. Spider's eye texture is a separate original layer resource; inspect and lock it when implementing that layer.

## Class-byte verification

ZIP-entry SHA-256s freshly checked from the same locked client. These identify source classes, not a claim that a browser port already matches them:

| Class | SHA-256 |
| --- | --- |
| fud | `0a6a96c320d0944c71c5868850c9ec2316156657036494b8cd91bb1ba36ca514` |
| fvx | `ff2bed3d05ca29da524fddba8d2ac8b654427587e5568e7dc6ae89cfa6902a20` |
| fve | `6b610773926cd5d03ef11a54bd34787842865f2f6ce389cad8baf71429c48f2f` |
| fxf | `c1d686651abdaaf3352cbca7a6be2e85845a7696b62dd63f7ff0a0f073ecdd7d` |
| fxl | `09a6a68196d2732a401e9b4cbe8f64f585fef5149e6e241eb51ebe110cd7f12f` |
| fvg | `3a4b034429612b423e143e3e9967671521807587f3285518e3f58a185194cd45` |
| fur | `4aceb28b0672d1d457e81cd3111ddf257003c7f31adb588ef287d8984d734dfc` |
| fvi | `b241a5eaaedda14c790add87cf9e98d750c20a1b7e9a8d169d4b58e0a09097ac` |
| fxz | `6fb9262f5162d89e849c84e2029bbe009a4e5dd9c03bb1bb4cb56f8b178059e1` |
| fyd | `694f4c9e22770de3ccbd60e918fab7e64b304e38df9cd19768048d6cdcd24e1f` |
| fvz | `66c1354a186372c7d3348eb2f76fbc43afc26e8bba94c75fbf59a4b899b05fc3` |
| fuh | `5d982bcced033bbdf54fea6f7478aefc3d524c3fcb513ce4f69d3a2ad2712e27` |
| fyh | `22f0c48ba3da40cf3565c60bce1132be4022813467e8ecb7bf0f559d049577f2` |
| glk | `d8a05e693b4581ad843c955d6839b6d5ce38d67cd7d38ab6c9fae626525cec26` |
| gqc | `7ba36303982df26c15926eaf367c713cc1acddc060fda2eb54c8bf26eed0b95c` |

Useful pre-existing bytecode captures are `fve-port-bytecode.txt`, `fxl-port-bytecode.txt`, `fvx-port-bytecode.txt`, `fxf-port-bytecode.txt` under `D:/neko-plugins/minecraft_autonomous/local/live-runtime/visual-completion-20261015-accepted`. Other classes were inspected directly from the verified JAR, without writing new runtime captures.

For verification, compare geometry/UVs against the original table at float32 tolerance; separately test actual per-class serializer/default handling, packet cue order/identity, geometry replacement/disposal, original texture loading, and controlled tick/partial animation output. Browser WebGL and matched Java-reference scene checks remain required before any complete rendering-parity claim.
