# Original particle rules: Minecraft 1.21.1

Read-only primary-source audit, 2026-10-15. Only this research document was added. No renderer, deployment, process, game, model, or Git operation was performed. These rules come from `javap -p -c` of the locked original client, including constructors and providers; they do not come from the old viewer's approximate particle implementation. Actual browser/Java scene parity remains unverified.

## Source lock and evidence notation

- Original client JAR (`minecraft-1.21.1-client.jar`): SHA-256 `499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99`.
- Official Mojang client mappings (`client-mappings.txt`): SHA-256 `140c47931cccc8fc9e4c22d7603e2d714d1a953a146f51ea7397d95c955536ec`.
- Inspector: `javap` from JDK 25.0.3; this reads class bytes without running Minecraft. All class names below are exact names inside that JAR. `@N` denotes a method's bytecode offset; source lines refer to the official mapping's original Java line numbers.

Reproduce the complete disassembly directly from the locked JAR; quote inner-class names in PowerShell so `$` remains literal:

```powershell
$particleJar = '<local original minecraft-1.21.1-client.jar>'
& javap -classpath $particleJar -p -c gcn gda gdn gcv gbf gce 'gce$a' 'gce$b' gbn 'gbn$a' 'gbn$b' 'gbn$c' gby 'gby$a' 'gby$b' gdb 'gdb$a' gbv 'gbv$a' gcf 'gcf$a' gbe 'gbe$a' 'gcp$b' 'gcr$2' 'gcr$4' ayw dyz dyn dzn
& javap -classpath $particleJar -p -c -v gcp
& javap -classpath $particleJar -p -c fzg bsr gex
```

`ParticleEngine gcp.e()` (`registerProviders`, source128–241) plus its bootstrap method handles confirms the exact registration, including `poof -> ExplodeParticle` and `explosion -> HugeExplosionParticle`. The relevant `lm` fields are independently named by ParticleTypes mappings (`client-mappings.txt:L38976`).

| Particle ID | `lm` field | Provider class | `gcp.e()` field / invokedynamic offsets | Bootstrap index |
| --- | --- | --- | --- | --- |
| `angry_villager` | a | `gce$a` | 1 / 4 | 0 |
| `crit` | f | `gbn$c` | 125 / 128 | 8 |
| `damage_indicator` | g | `gbn$a` | 149 / 152 | 10 |
| `enchanted_hit` | r | `gbn$b` | 295 / 298 | 21 |
| `explosion` | w | `gcf$a` | 357 / 360 | 25 |
| `flame` | F | `gby$a` | 478 / 481 | 32 |
| `heart` | Q | `gce$b` | 586 / 589 | 39 |
| `poof` | ab | `gbv$a` | 726 / 729 | 46 |
| `smoke` | ae | `gdb$a` | 762 / 765 | 49 |
| `sweep_attack` | aj | `gbe$a` | 822 / 825 | 54 |
| `small_flame` | aJ | `gby$b` | 1062 / 1065 | 74 |

## Numeric and random conventions

`s=(sx,sy,sz)` is the velocity/control triple passed to the provider after the packet has been expanded. `p` is render partial tick, `a` is integer particle age, `L` is lifetime, `q` is stored `quadSize`, and `f=(float(a)+p)/float(L)`. `int()` means Java truncation toward zero. Expressions marked with `f` literals use Java binary32 rounding after each float operation; preserve grouping. `D(xf)` means widen the binary32 value to double, rather than replace it with a mathematically exact decimal. In JavaScript an exact port needs `Math.fround` at the float operations. Double positions and velocities remain doubles.

There are separate random streams; the suffix is the call order within that stream **for this particle construction**, not a shared sequence number:

| Notation | Owning source | Important behavior / primary evidence |
| --- | --- | --- |
| `P1F`, `P2F`, …; `PnI(bound)` | This particle's `Particle.random`, initialized with `RandomSource.create()` before constructor code | Each `F` is `nextFloat`; `I` is `nextInt(bound)`. `ayw.a()` invokes `dzn.a()` then constructs `dyz`. The seed uses the global seed uniquifier XOR `System.nanoTime()`. RandomSource (`client-mappings.txt:L65762`), RandomSupport (`client-mappings.txt:L114635`). |
| `M1`, `M2`, … | Global `java.lang.Math.random()` | Each call returns a double. It is a separate Java random stream, also consumed by other callers. `gcn`'s velocity constructor explicitly invokes this method five times. |
| `W1F`, `W2F` | `ClientLevel.random`, field `fzf.z` inherited from `Level` | Smoke gray and final lifetime use these two **world** draws. They do not use `Particle.random` or `Math.random`; see `gbf.<init>@105–178`. Level random field (`client-mappings.txt:L98098`). |
| `G1` … `G6` | `ClientPacketListener.random`, field `fzg.C` | Positive-count packet expansion draws six Gaussians per requested particle before provider construction: XYZ position, then XYZ velocity. Packet handler (`client-mappings.txt:L22612`). |

`dyz` is the original 48-bit `LegacyRandomSource`: seed state `(seed XOR 25214903917) & ((1<<48)-1)`; each `next(bits)` advances `(state*25214903917+11)&((1<<48)-1)` and returns the high `bits`. `dyn.nextFloat` is `next(24)*2^-24`. `nextInt(1)` still consumes a `next(31)` draw, even though its result is always zero; `nextInt(4)` also uses one `next(31)`. Thus the single-sprite provider picks below are real draws. Sources: `dyz.b(long)/c(int)`, `dyn.a(int)/i()`, LegacyRandomSource (`client-mappings.txt:L114018`), BitRandomSource (`client-mappings.txt:L113130`).

### Shared constructor macros, in actual execution order

`Q0(position)` is `TextureSheetParticle -> SingleQuadParticle -> Particle` using the **position-only** constructor. It initializes `hasPhysics=true`, RGB/alpha=1, friction=`.98f`, velocity=(0,0,0), gravity=0, age=0, removed/onGround/stopped=false, roll/oldRoll=0, speedUpWhenYMotionIsBlocked=false. It changes the collision box to `.2f × .2f`, sets position and previous position to the input, then draws:

1. `P1F`: provisional `L0=int(4f/(P1F*.9f+.1f))`.
2. `P2F`: provisional `q0=.1f*(P2F*.5f+.5f)*2f`.

`QV(position,s)` uses the **velocity** constructor. Between the same `P1F` and `P2F` calls it performs these five `Math.random()` calls and initializes a normalized random velocity:

```text
n = (sx+(2*M1-1)*D(.4f), sy+(2*M2-1)*D(.4f), sz+(2*M3-1)*D(.4f))
speed = (M4+M5+1)*D(.15f)
length = sqrt(nx*nx + ny*ny + nz*nz)
v0 = ((nx/length)*speed*D(.4f),
      (ny/length)*speed*D(.4f)+D(.1f),
      (nz/length)*speed*D(.4f))
```

The macro's complete draw order is **P1F, M1, M2, M3, M4, M5, P2F**. `QV(position,0)` still performs all five Math draws. Provisional lifetimes, sizes, and velocities can subsequently be overwritten; their draws still occur. There is no zero-length normalization guard in this constructor. Sources: `gcn.<init>(xyz)@28–124`, `gcn.<init>(xyz,vxyz)@13–174`, `gda.<init>@10–31` or `@16–37`; Particle mapping (`client-mappings.txt:L24287`), SingleQuadParticle mapping (`client-mappings.txt:L24604`).

## Constructor and provider parameter table

The sequence column starts after the macro unless it says otherwise. In all rows below alpha stays **1**; no subclass/provider here installs an age fade or random roll. Size expressions below are stored `q`; the render-time size rules follow in the next table.

| Family | Parent macro and post-parent execution, in order | Result and provider differences | Primary bytecode evidence |
| --- | --- | --- | --- |
| `heart`, `angry_villager` | `QV(position,0)`; set blocked-Y speed-up=true, friction=`.86f`; multiply all `v0` by `D(.01f)`; add **double `.1`** to Y; `q=q0*1.5f`; `L=16`; physics=false. No extra constructor random call. Then provider draws `P3I(1)` through `pickSprite`. | Both ignore all three incoming speeds. `heart` uses input position. Angry provider constructs at **Y+.5**, picks its sprite, then explicitly sets RGB=(1,1,1), matching heart's initial white tint. | `gce.<init>@13–91`; `gce$b.a@0–24`; `gce$a.a@0–33`. Heart/Provider mappings (`client-mappings.txt:L24175`). |
| `crit` | `QV(position,0)`; friction=`.7f`, gravity=`.5f`; `v=.1f` widened to double times `v0`, then add incoming `s*.4` (**double `.4`**); draw `M6` for gray=`float(M6*D(.3f)+D(.6f))`; RGB=gray; `q=q0*.75f`; draw `M7` for `L=max(int(6/(M7*.8+.6)),1)`; physics=false; **call the virtual `tick()` once**; then provider picks sprite with `P3I(1)`. | At provider return: age=1, current/previous positions reflect that constructor tick, Y gravity has already acted, all velocities have friction, G/B have already faded once. Final `L` is 4–10. | `gbn.<init>@13–179`; `gbn$c.a@0–27`. Crit mapping (`client-mappings.txt:L23792`). |
| `enchanted_hit` | Same entire crit sequence **including constructor tick**. After construction provider multiplies R by `.3f`, G by `.8f`, then picks sprite with `P3I(1)`. | Initial provider-return RGB is `(gray*.3f, (gray*.96f)*.8f, gray*.9f)` with float rounding in that order. Original texture is `enchanted_hit`, in addition to this tint. | `gbn$b.a@19–51`; MagicProvider mapping (`client-mappings.txt:L23804`). |
| `damage_indicator` | Provider passes **`(sx,sy+1,sz)`** into the entire crit constructor sequence, including its tick. It then overwrites lifetime to **20**, then picks sprite with `P3I(1)`. | Extra +1 acts before the crit constructor multiplies incoming Y by double `.4`; it is not a later +1 velocity. Age remains 1 when lifetime changes to20. Original gray `M6` and discarded original lifetime draw `M7` both remain necessary. | `gbn$a.a@0–36`; DamageIndicatorProvider mapping (`client-mappings.txt:L23798`). |
| `flame`, `small_flame` | `QV(position,s)`; RisingParticle sets friction=`.96f`; `v=v0*D(.01f)+s`; draw `P3F,P4F` for X field jitter `(P3F-P4F)*.05f`, `P5F,P6F` for Y, `P7F,P8F` for Z; draw `M6` for `L=int(8/(M6*.8+.2))+4`; provider picks sprite with `P9I(1)`. | Incoming `s` participates in parent normalization **and** is added again afterwards. Gravity remains0, RGB=(1,1,1). Normal flame leaves `q=q0`; small provider first picks sprite, then calls `scale(.5f)`, halving `q` and setting collision-box width/height to `.1f`. No constructor tick. | `gcv.<init>@16–182`; `gby$a.a@0–27`; `gby$b.a@0–34`. Rising mapping (`client-mappings.txt:L24538`), Flame/provider mappings (`client-mappings.txt:L24030`). |
| `smoke` | `QV(position,0)`; `gbf` sets friction=`.96f`, gravity=`-.1f`, blocked-Y speed-up=true; `v=v0*D(.1f)+s`; draw **W1F** for RGB gray=`W1F*.3f`; `q=q0*(.75f*scale)`; draw **W2F** for `L=max(int((8/(D(W2F)*.8+.2))*D(scale)),1)`; select sprite from age; physics=true. | `gdb$a` supplies `scale=1f`. Both world draws are after both particle Floats and all five parent Math draws. Sprite selection is age-based and consumes no random draw. No constructor tick. | `gbf.<init>@13–203`; `gdb.<init>@7–30` ends in **`iconst_1`**, not false; `gdb$a.a@0–21`. BaseAshSmoke mapping (`client-mappings.txt:L23680`), Smoke mapping (`client-mappings.txt:L24628`). |
| `poof` | **`Q0(position)`**, without the five parent Math draws; gravity=`-.1f`, friction=`.9f`; draw M1/M2/M3 for `v=s+(2*M-1)*D(.05f)` per XYZ; draw P3F for RGB gray=`P3F*.3f+.7f`; draw P4F then P5F for **replacement** `q=.1f*(P4F*P5F*6f+1f)`; draw P6F for `L=int(16/(D(P6F)*.8+.2))+2`; select sprite from age. | Physics=true, blocked-Y speed-up=false. Provisional parent q0 is discarded, so P2F is still consumed even though P4F/P5F determine the visible size. Constant stored q at render time. `ExplodeParticle` is the poof family. | `gbv.<init>@0–186`; `gbv$a.a@0–20`. ExplodeParticle mapping (`client-mappings.txt:L23949`). |
| `explosion` | `QV(position,0)`; draw **P3I(4)** for `L=6+P3I(4)`; draw P4F for RGB gray=`P4F*.6f+.4f`; **replace** q with `2f*(1f-float(sx)*.5f)`; select sprite from age. | Provider passes only `sx` as a size control. `sy,sz` are ignored. All parent Math draws still occur, but stored parent velocity is never advanced by this family's tick. No size clamp. | `gcf.<init>@13–88`; `gcf$a.a@0–16`. HugeExplosion mapping (`client-mappings.txt:L24192`). |
| `sweep_attack` | `QV(position,0)`; `L=4`; draw P3F for RGB gray=`P3F*.6f+.4f`; **replace** q with `1f-float(sx)*.5f`; select sprite from age. | Provider passes only `sx`; `sy,sz` are ignored. Parent velocity is stored but never advanced. No random lifetime draw; no size clamp. | `gbe.<init>@13–74`; `gbe$a.a@0–16`. AttackSweep mapping (`client-mappings.txt:L23667`). |

The RisingParticle jitter writes the **x/y/z fields directly**, without updating previous coordinates or the collision box (`gcv.<init>@67–160`). Preserve this distinction if reproducing the constructor literally: flame's later `move` moves the existing box and derives its position from that box. Automatically synchronizing the box to the jittered fields changes the reference behavior. `SingleQuadParticle.scale` multiplies q and calls `Particle.scale`, whose box size is `.2f*scale` in both dimensions; it does not multiply the current box size repeatedly. Scale and position mappings (`client-mappings.txt:L24322`).

## Tick, collision, size, color, alpha, and light

### Shared base tick T: preserve the post-increment test

`Particle gcn.a()` (source119–142; bytecode0–197) does this in order:

```text
oldXYZ = XYZ
if (age++ >= lifetime): removed = true; return
yd -= .04 * D(gravity)
move(xd, yd, zd)
if (speedUpWhenYMotionIsBlocked && y == oldY): xd *= 1.1; zd *= 1.1
xd *= D(friction); yd *= D(friction); zd *= D(friction)
if (onGround): xd *= D(.7f); zd *= D(.7f)
```

Removal compares **old** age, then increments age even on the removal tick. A particle can remain alive at age=L. Changing this to `++age >= L` removes it one tick early and can skip its last sprite. Gravity occurs before movement, friction afterwards. Base tick does not zero `yd` after vertical collision. Base tick mapping (`client-mappings.txt:L24329`).

### Shared collision move C

`Particle gcn.a(double,double,double)` (source178–210; bytecode0–225):

1. If `stoppedByCollision` is already true, return immediately.
2. Save requested `(dx,dy,dz)`. Resolve collisions only if physics=true, motion is nonzero, and `dx²+dy²+dz² < 10000` (strict `<`; clinit sets `square(100)`), by `Entity.collideBoundingBox(null, motion, bb, level, List.of())`.
3. If any accepted displacement is nonzero, move the box and derive `(x,y,z)` as `(box.centerX, box.minY, box.centerZ)`.
4. If `abs(requestedDy) >= D(1e-5f)` and `abs(acceptedDy) < D(1e-5f)`, latch `stoppedByCollision=true`; exact widened threshold is `9.999999747378752e-6`.
5. `onGround = requestedDy != acceptedDy && requestedDy < 0`. If X was clipped, set `xd=0`; if Z was clipped, set `zd=0`. Y velocity is left intact.

This helper uses actual **block collision shapes** in the swept box. Its null entity and empty supplied shape list exclude entity collision and the conditional world-border shape. It resolves Y first; if `abs(dx)<abs(dz)`, Z then X, otherwise X then Z. There is no particle step-up path. Sources: `bsr.a(Entity,Vec3,AABB,Level,List)`, `bsr.a(Entity,Level,List,AABB)` and `bsr.a(Vec3,AABB,List)` (original1096–1155); Entity collision mappings (`client-mappings.txt:L73280`).

### Per-family rules

`B(p)` denotes the base packed light below. `ramp=clamp(f*32f,0f,1f)`. All size formulas are **quad half-extents in blocks**, so an unrotated quad has width/height `2*getQuadSize(p)`.

| Family | Exact tick / collision | Render-time `getQuadSize(p)` | RGB / alpha after construction | Packed light / material |
| --- | --- | --- | --- | --- |
| heart / angry | T, friction`.86f`, gravity0, C with physics=false, blocked-Y speed-up=true | `q*ramp` | White tint stays fixed; alpha1 | B(p); OPAQUE |
| crit / enchanted / damage | **T then** `G*=.96f; B*=.9f` each tick, including the constructor's tick. Color multiplications execute even if T just marked it removed. Friction`.7f`, gravity`.5f` means `.02` downward per tick before movement; C with physics=false. | `q*ramp` | R fixed after provider, G/B fade multiplicatively; alpha1 | B(p); OPAQUE |
| flame / small | T, friction`.96f`, gravity0, blocked-Y speed-up=false. **Overrides move:** `bb=bb.move(dx,dy,dz); setLocationFromBoundingbox()`; bypasses collision resolver and stop/onGround bookkeeping. | `q*(1f-f*f*.5f)`; size f is **not clamped** | White tint stays fixed; alpha1 | Let `fc=clamp(f,0,1)`; `lo=B(p)&255`, `hi=(B(p)>>16)&255`; `lo=min(240,lo+int(fc*15f*16f))`; return `bitOr(lo,hi<<16)`. OPAQUE. |
| smoke | T then `setSpriteFromAge`; friction`.96f`, gravity`-.1f` gives upward `.04*D(.1f)` before movement; C with physics=true; blocked-Y speed-up=true | `q*ramp` | Fixed W1F gray; alpha1 | B(p); OPAQUE |
| poof | T then `setSpriteFromAge`; friction`.9f`, same negative gravity as smoke; C with physics=true; blocked-Y speed-up=false | `q` unchanged | Fixed P3F gray; alpha1 | B(p); OPAQUE |
| explosion / sweep | **No T and no move call.** Copy XYZ to oldXYZ; `if(age++>=L) remove; else setSpriteFromAge`. Stored gravity/friction/physics/velocity never affect this tick. | `q` unchanged | Fixed gray; alpha1 | Always **15728880 = 0x00F000F0**, LIT |

Evidence: heart `gce.b(float)@0–25`; crit `gbn.a()@0–23`, `gbn.b(float)@0–25`; flame `gby.a(DDD)@0–16`, `b(float)@0–26`, `a(float)@0–78`; smoke `gbf.a()@0–9`, `b(float)@0–25`; poof `gbv.a()@0–9` and inherited `gda.b(float)`; explosion `gcf.a()@0–52`, sweep `gbe.a()@0–52`. Exact named source ranges are linked in the family constructor table above.

Base packed light B(p) is sampled at `BlockPos.containing(currentX,currentY,currentZ)` (floor, **not interpolated render position**), and is 0 when `level.hasChunkAt(pos)` is false. Otherwise `LevelRenderer.getLightColor(level,pos)` returns fullbright for an emissive-rendering block; otherwise `(skyBrightness<<20) | (max(blockBrightness,stateLightEmission)<<4)`. The partial-tick parameter is unused by this base light method. Sources: `gcn.a(float)@0–37`, `gex.a(dbz,jd)`, `gex.a(dbz,dtc,jd)`; Particle light mapping (`client-mappings.txt:L24338`), LevelRenderer light mapping (`client-mappings.txt:L26131`), SKY/BLOCK field names (`client-mappings.txt:L98404`).

## Original sprite sequence and drawing order

Direct ZIP inspection confirms the exact definitions below. Particle JSON paths are `assets/minecraft/particles/<ID>.json`; sprite PNG paths are `assets/minecraft/textures/particle/<listed-name>.png`. These are full original sprites, not entity atlas cells. Source: the locked original JAR linked above.

| ID | Ordered JSON texture names | PNG dimensions | Selection rule |
| --- | --- | --- | --- |
| heart | `heart` | 8×8 | Provider random pick once, `P3I(1)` |
| angry_villager | **`angry`** | 8×8 | Provider random pick once, `P3I(1)` |
| crit | `critical_hit` | 8×8 | Provider random pick once, `P3I(1)` |
| enchanted_hit | `enchanted_hit` | 8×8 | Provider random pick once, `P3I(1)` |
| damage_indicator | **`damage`** | 8×8 | Provider random pick once, `P3I(1)` |
| flame / small_flame | `flame` | 8×8 | Provider random pick once, `P9I(1)` |
| smoke / poof | **`generic_7,generic_6,…,generic_0`** | Each8×8 | Constructor and each surviving tick: age-based |
| explosion | `explosion_0,explosion_1,…,explosion_15` | Each32×32 | Constructor and each surviving tick: age-based |
| sweep_attack | `sweep_0,sweep_1,…,sweep_7` | Each32×32 | Constructor and each surviving tick: age-based |

Age-based selection is exactly `sprites[(a*(N-1))/L]` with **integer division**, not `floor(f*N)`, random frame, or a partial-tick interpolation. `TextureSheetParticle.setSpriteFromAge` first checks `!removed`; this prevents age=L+1 from indexing beyond the list. The last frame is sampled while alive at a=L. A sweep with L=4 visits frame indices **0,1,3,5,7**. Source: `gcp$b.a(int,int)@0–24`, `gdn.b(gdi)@0–25`; MutableSpriteSet (`client-mappings.txt:L24435`), TextureSheetParticle (`client-mappings.txt:L24844`).

All these families inherit LOOKAT_XYZ: use the actual camera quaternion, with no family-specific horizontal lock. Position is `lerp(oldXYZ,XYZ,p)-cameraXYZ` in double, then converted to float. `SingleQuadParticle` emits the quad corners in this order, after quaternion rotation and size multiplication: `(1,-1,0)->(u1,v1)`, `(1,1,0)->(u1,v0)`, `(-1,1,0)->(u0,v0)`, `(-1,-1,0)->(u0,v1)`. Roll is zero for these classes; the generic path can rotate Z by interpolated roll when nonzero. Sources: `gda.a(VertexConsumer,Camera,float)`, both `renderRotatedQuad` overloads, `gda$a` LOOKAT_XYZ; Quad render mappings (`client-mappings.txt:L24604`).

Original `ParticleEngine` layer order is **TERRAIN, OPAQUE, LIT, TRANSLUCENT, CUSTOM** (`gcp.<clinit>@24–42`), then queue iteration order within each layer; this renderer does not distance-sort these quads. Layer queues are original FIFO `EvictingQueue(16384)` (`gcp.a(gcr)`). Render enables depth testing. OPAQUE (`gcr$2`) and LIT (`gcr$4`) both disable blending, write depth, bind the original particle atlas and emit QUADS. LIT here is not an additive material. Source: `gcp.a(gey,ffy,float)@0–257`, `gcr$2.a@0–32`, `gcr$4.a@0–24`; Engine render/order mappings (`client-mappings.txt:L24369`), ParticleRenderType mappings (`client-mappings.txt:L24451`).

Original `assets/minecraft/shaders/core/particle.vsh` multiplies vertex color by the lightmap texel at `UV2/16`. `particle.fsh` multiplies texture × vertexColor × ColorModulator, discards alpha<`.1`, then applies linear fog. Keep the original PNG alpha and this cutout rule; none of these classes supplies a soft alpha fade. Source: both shader files read directly from the locked original JAR.

## Protocol and fidelity boundaries

`ClientboundLevelParticlesPacket adi` supplies XYZ doubles, XYZ offset Floats, maxSpeed Float, count, overrideLimiter, and particle options. These requested IDs are `SimpleParticleType`; they need no extra dust/item/block payload. **There is no random seed or per-particle age/velocity/lifetime/frame/color in this packet.** Packet fields and getters (`client-mappings.txt:L50149`).

`fzg.a(adi)` (`handleParticleEvent`, original2061–2087) expands the packet before provider construction:

- Count0 creates one particle at exact packet XYZ with `s=(D(maxSpeed*xDist),D(maxSpeed*yDist),D(maxSpeed*zDist))`; each multiplication is **float before widening**. Provider rules still apply, including ignored heart speeds and explosion/sweep size controls.
- Positive count creates one particle per loop: draw G1/G2/G3 for XYZ offsets, then G4/G5/G6 for XYZ speeds. Position is packetXYZ + Gaussian × D(offsetFloat); `s` is Gaussian × D(maxSpeed). Each provider's own random draws happen after those six packet draws. `overrideLimiter` is passed through to `ClientLevel.addParticle`.

The original family constructor/tick/sprite/material rules are fully recoverable for these IDs. A practical native port can reproduce those formulas and consume the same input fields; the network is not the reason to substitute generic motion. Pixel-identical realizations of independently connected vanilla clients require information the packet does not carry: listener Gaussian state/cache, global Math state, per-particle seed-uniquifier/nanotime, world RNG state/call history, plus particle quality/filter decisions and frame/tick timing. A viewer's chosen local RNG seed is a reproducible viewer seed, not evidence of the Java client's original random realization. Sources: `fzg.a(adi)@9–255`, `ayw.a()`, `dzn.a()`, `dza.b()` Gaussian caching/rejection; Packet handler (`client-mappings.txt:L22612`), Gaussian source (`client-mappings.txt:L114040`).

Smoke and poof additionally require the original collision shapes for the actual block states across the swept box; missing or approximated modded shapes cannot establish their collision parity. Their collision boxes are `.2f × .2f` here, independent of the visible quad's size. Ordinary B(p) needs the actual loaded chunk/block light/skylight and emissive block state; only explosion/sweep are unconditionally fullbright. The flame family bypasses collision and heart/crit disable physics, so those trajectories do not require block clipping. Source: the constructor/tick tables and collision/light bytecode above.

This note covers provider creation from supplied particle events. Automatically originating every local entity/block animation particle, modded particles, explosion-emitter children, vanilla quality/distance filtering, all world lighting and actual Java/WebGL comparisons remain separate acceptance work. It does not certify those behaviors as complete.

## Verification fingerprints

These class hashes were computed directly from original ZIP entries during this audit. Re-running the commands above against the locked JAR provides the complete primary bytecode evidence.

| Original ZIP entry | SHA-256 |
| --- | --- |
| `gcn.class` | `ca916635130e768550fd98e81f519c2f08297eba7197a247078891a03a3b1b4c` |
| `gda.class` | `e4ca1646e15fc06c0f8dd0a496cd748af3ac5c21778d767f32838d8109277be5` |
| `gdn.class` | `8bd934b27a03bdbf274f40c8f941f5425ed93db5b059e409006a4ed5b8ed4c23` |
| `gcv.class` | `b29888289648dde002b07c0bf979ec275ba4c67b88fb6dd1b0aa5e6d282dde91` |
| `gce.class` | `966a6a855eb9c1db81dace03ecde41698ba336b5c1c5f4aae6b477892ba8b368` |
| `gbn.class` | `6fea0dd4b99cbed5ea5b7799d05b5efc7f25daec3a0673dcec4c3cbbdc0e933b` |
| `gby.class` | `4886b1fae26bbf3b0b2d88f8e3de12003b5b8f26a573983bdf500d11e9d864df` |
| `gbf.class` | `aa170320bd76b1ae9ae66fbc5ec3e3897bb4d99d4215c38c2cc0c1dd9d7d1391` |
| `gdb.class` | `e6789fd7fd40c9d635539226b9681bb0a05fe7822c3731fed3af12c3c617b85a` |
| `gbv.class` | `f9d997186920ed683943251267f75e6b0533a91889b869834219172332fc9233` |
| `gcf.class` | `e48bd887e04b00180d86e84f1a01c3d965ea0bad2e8b650f9d23e72ecf5e7c03` |
| `gbe.class` | `0e3b7bfc36eb5118a199c0656a6f83511c83a7b360bce6a55b1f7e0684970634` |
| `gcp$b.class` | `05eb14eb9118c4075584cf45202a19bac589c09c9acb9f94eb4e2d8236ffcda8` |
| `fzg.class` | `e43c95a3346f89934f43170414f210cc385b2d75da435aea553dd9ac2c8298ca` |

Representative original PNG fingerprints; paths are relative to `assets/minecraft/textures/particle/`. All frame paths referenced by the JSON definitions above exist in the same locked JAR.

| PNG | SHA-256 |
| --- | --- |
| `heart.png` | `351e76662421bfd9285429847568b93046cd26100acc3f53550c663234bbde7b` |
| `angry.png` | `95679a26699efb4b0117b33a05565cb7ae45cb31ff256842cdaafeac64849b8d` |
| `critical_hit.png` | `a7c036fd1b4c73856e3a7d638b56c1cbd047a2b18c504923ad7d5ae07046d908` |
| `enchanted_hit.png` | `d36bb0f1d537eadc3c572642a6c998cf350ddf41cb938b4f97a0f1f22105a6ba` |
| `damage.png` | `b90f5b80b15144c2ccae58164635cca4dff02e2486df4d828081857fd0cc0157` |
| `flame.png` | `2f2efacac134ce943d142d3a40e43f87e80e1e32d7137645bb1268618505e4a7` |
| `generic_0.png` | `040799acfd2e753632cef5642ab07e0182a973cc990cbfcb6bf7d201f10cfa03` |
| `generic_7.png` | `858a9804aef73be823a616e0faf518ee425421a20ffbb68f2a686ac76c017ca3` |
| `explosion_0.png` | `3e2ca80f6accdcf50f580df2e8777ada3279ea9b6c74c28028e1bb2d2edb9140` |
| `explosion_15.png` | `94d0bbc38b84298316831ea5da745747699036261a57d354cefd9fe755289a19` |
| `sweep_0.png` | `9d21c7a8dcbc06a86c91d7968f4fb634457c07a746aae600a7b758e2133c2af3` |
| `sweep_7.png` | `9076a1cd0f920c1eb39e1fa8a3c2b5ffaea428498d27e9b1013b7abab17c7110` |

## Follow-up: static collision export and empty context

The particle path really uses **`CollisionContext.empty()`**. `CollisionGetter.getBlockCollisions(null,box)` constructs `BlockCollisions(level,null,box,false,provider)`; `dca.<init>@4–19` chooses `exh.a()` for the null entity, rather than calling `CollisionContext.of(null)`. `exh.a()` returns the singleton `EntityCollisionContext.EMPTY`. EMPTY has descending=false, entity=null, an empty held item and a fluid predicate that is always false; its `isAbove(shape,pos,fallback)` override returns **fallback**, regardless of position. Sources: `dcg.i(bsr,ewx)`, `dca.<init>`, `exh.a()`, `exm.<clinit>`, `exm$1.a(exv,jd,boolean)`; BlockCollisions (`client-mappings.txt:L97488`), CollisionGetter (`client-mappings.txt:L97656`), CollisionContext/EMPTY (`client-mappings.txt:L127021`).

**The two BlockState collision getters are materially different.** The original bytecode is equivalent to:

```text
getCollisionShape(world,pos):                    // dtb$a.k(dcc,jd), original1062–1065
    if (cache != null): return cache.collisionShape
    return getCollisionShape(world,pos,CollisionContext.empty())
getCollisionShape(world,pos,context):            // dtb$a.b(dcc,jd,exh), original1069
    return getBlock().getCollisionShape(asState(),world,pos,context)
```

`BlockCollisions.computeNext@153–167` calls the **three-argument** getter with the real collision world and actual block position; it bypasses the cached getter. Export the three-argument getter with explicit EMPTY. `hasDynamicShape=false` causes cache construction in `initCache@36–58`, but is not a runtime guarantee that the three-argument method ignores world/position/context, particularly for modded overrides. Sources: BlockStateBase getters/cache (`client-mappings.txt:L109491`), `dtb$a.k`, `dtb$a.b`; hasDynamicShape (`client-mappings.txt:L100338`) is only `return dynamicShape` (`dfy.p@0–4`).

The original static Cache does exactly the proposed probe: `block.getCollisionShape(state,EmptyBlockGetter.INSTANCE,BlockPos.ZERO,CollisionContext.empty())` (`dtb$a$a.<init>@140–155`). It then **throws** if that shape is nonempty and `state.hasOffsetFunction()` is true (`@158–206`), with a message requiring dynamicShape. Thus collidable vanilla position offsets are not silently eligible static shapes. EmptyBlockGetter itself returns air, empty fluid and null block entities; it is a sampling environment, not the real world. Cache constructor (`client-mappings.txt:L109584`), EmptyBlockGetter (`client-mappings.txt:L97706`).

A bytecode scan of all **146 declared getShape/getCollisionShape methods in 129 original block classes** found world/position/context usage only in the offset, context, block-entity, and forwarding paths described here. For the requested locked vanilla cases, walls/fences/trapdoors are safe state-based exports; no additional non-offset static vanilla neighbor dependency was found. This audit is not a certification of uninspected modded classes or bytecode patches.

| Original family / method | What the original query actually reads | Static EMPTY export boundary |
| --- | --- | --- |
| Walls: `dox.b(state,world,pos,ctx)` original136 | `collisionShapeByIndex.get(state)` only; no world/pos/context loads | Allow the exact received state. Neighbor connection and UP/side height properties are already in that state. WallBlock (`client-mappings.txt:L106458`). |
| Fences / iron bars / panes: `dhu.b(...)` original100 | `collisionShapeByIndex[getAABBIndex(state)]` only | Allow exact state; use collision shape array, not outline array. Connections are state properties. CrossCollisionBlock (`client-mappings.txt:L102508`). |
| Fence gates: `dix.b(...)` original114–117 | OPEN and FACING axis | Allow exact state; open is empty, closed uses the original 1.5-block collision height. IN_WALL changes the outline query, not this collision branch. FenceGateBlock (`client-mappings.txt:L103042`). |
| Trapdoors: inherited collision -> `dom.a(...)` original68–81 | OPEN, HALF, FACING | Allow exact state; no neighbor query. TrapDoorBlock (`client-mappings.txt:L106191`). |
| Doors: inherited collision -> `die.a(...)` original77–85 | FACING, OPEN, HINGE | Allow each actual received half/state; no neighbor lookup to construct this shape. DoorBlock (`client-mappings.txt:L102723`). |
| Stairs / slabs: `dnt.a(...)`, `dnc.a(...)` original104 /60–67 | Stair HALF/SHAPE/FACING; slab TYPE | Allow exact states; neighbor stair arrangement is represented by SHAPE, not recalculated by getShape. StairBlock (`client-mappings.txt:L105859`), SlabBlock (`client-mappings.txt:L105500`). |
| Bamboo stalk: `dfc.b(...)` original85–86; pointed dripstone inherited collision -> `dlq.a(...)` original320–337 | `state.getOffset(world,actualPos)`; dripstone uses offset X/Z | Reject the ZERO-position sample until the actual-position offset rule is ported. Both original registrations call `Properties.dynamicShape()` as well as offsetType XZ (`dga.<clinit>@30087/30093`, `@38861/38867`). Bamboo (`client-mappings.txt:L99780`), Dripstone (`client-mappings.txt:L104548`). |
| Noncolliding plants with model offsets | Default collision checks `hasCollision`, returning empty without calling the position-offset outline path | A **proved inherited noCollision branch** can export empty even when model offset exists, e.g. original bamboo_sapling/mangrove_propagule registrations call `Properties.noCollission()`. Do not add render-model offsets to every collision shape. A policy rejecting every hasOffsetFunction state is conservative and should label these excluded rather than physically blocked. |
| Shulker boxes: inherited collision -> `dmy.a(...)` original231–235 | Actual shulker block entity bounding box/progress; missing BE fallback is full block | Reject static sample for live parity. All colors use the original dynamicShape registration helper `dga.a(cti,epi)@19`. ShulkerBoxBlock (`client-mappings.txt:L105377`). |
| Moving piston: `dsu.b(...)` original121–125 | Actual piston moving BE collision shape; missing BE fallback is empty | Reject static sample; original registration sets dynamicShape (`dga.<clinit>@5527`). MovingPistonBlock (`client-mappings.txt:L109185`). |
| Powder snow: `dlt.b(...)` original108–121 | EMPTY has null entity, so returns empty | The original block is dynamicShape, but this **particle-only EMPTY specialization** is provably empty; a dedicated exception can support it without entity/leather-boot simulation. Generic non-EMPTY collision differs. PowderSnowBlock (`client-mappings.txt:L104679`). |
| Scaffolding: `dmo.b(...)` original147–153 | EMPTY.isAbove(fullBlock,pos,true)=true and descending=false, so returns fixed field `g` at bytecode80 | Also registered dynamicShape; a dedicated EMPTY specialization is world-independent. Export the actual returned `g`, not getShape/outline or the alternative bottom-only shape. ScaffoldingBlock (`client-mappings.txt:L105097`). |
| Liquids: `dko.b(...)` original75–78 | May evaluate the fluid above, but EMPTY.canStandOnFluid is always false | EMPTY collision result is empty independent of that neighbor fluid. Preserve the actual getter; fluid surface/outline is not a particle collider. LiquidBlock (`client-mappings.txt:L104002`). |

Recommended generic static eligibility is **locked/audited vanilla implementation + hasDynamicShape=false + no unported collision offset**. Dedicated EMPTY-context specializations may admit the proven dynamic exceptions above. Unknown modded world/context-dependent overrides, actual block-entity shapes, failed/uninitialized cache probes, unknown states and missing original shapes remain unavailable until their original rules are ported. A successful ZERO/empty probe alone is not proof of a modded shape's independence. Do not run neighbor-update logic on exported default states: index the auxiliary collision data by the actual original state ID/properties received from the same connection.

## Follow-up: exact voxel collision algorithm and enumeration

`toAabbs()` is a geometric union export, but does not retain all the original discrete cell planes. Exact `VoxelShape.collideX` should use the original coordinate arrays, discrete sizes and occupancy, keeping **one original shape per block**. Useful original signatures and mapped locations:

| Original member | Locked JAR member / access | Mapping/source location |
| --- | --- | --- |
| `VoxelShape.shape` | `exv.a : exl`, protected final | VoxelShape (`client-mappings.txt:L127209`) |
| `VoxelShape.getCoords(Direction.Axis)` | `exv.a(ji$a) : DoubleList`, protected abstract | Mapping127219; CubeVoxelShape `exj` exposes a public override; ArrayVoxelShape `exe` returns original coordinate lists |
| `VoxelShape.collide(Axis,AABB,double)` | `exv.a(ji$a,ewx,double) : double`, public | Original217, mapping127233 |
| `VoxelShape.collideX(AxisCycle,AABB,double)` | `exv.a(ja,ewx,double) : double`, protected | Original221–276, mapping127234 |
| `DiscreteVoxelShape.getSize(Axis)` | `exl.c(ji$a) : int`, public | DiscreteVoxelShape (`client-mappings.txt:L127049`), original105 |
| `DiscreteVoxelShape.isFull(x,y,z)` | `exl.b(int,int,int) : boolean`, public abstract | Mapping127059 |
| `DiscreteVoxelShape.isFullWide(x,y,z)` | `exl.e(int,int,int) : boolean`, public; out-of-bounds returns false | Original31–37, mapping127057 |
| `DiscreteVoxelShape.isFullWide(cycle,i,j,k)` | `exl.a(ja,int,int,int) : boolean`, public | Original23–26, mapping127056; transforms indices then calls wide form |
| `Direction.Axis.X/Y/Z` | `ji$a.a/b/c`, ordinals0/1/2 | Direction.Axis (`client-mappings.txt:L37199`) |
| `AxisCycle.NONE/FORWARD/BACKWARD` | `ja.a/b/c`, ordinals0/1/2 | AxisCycle (`client-mappings.txt:L36756`) |
| `Shapes.collide(Axis,AABB,Iterable,double)` | `exs.a(ji$a,ewx,Iterable,double) : double`, public static | Shapes (`client-mappings.txt:L127150`), original201–207 |

Export every original axis array with length `getSize(axis)+1`; serialize all original cells through `isFull(x,y,z)` so the result supports every DiscreteVoxelShape subclass. If using the original BitSetDiscreteVoxelShape packing, `exf.a(x,y,z)` is **`(x*ySize+y)*zSize+z`**, source72; thus Z is the fastest cell-bit axis. This is different from Cursor3D's X-fastest block enumeration. BitSetDiscreteVoxelShape (`client-mappings.txt:L126957`). Retain `state.hasLargeCollisionShape()` and the original **identity comparison** `shape == Shapes.block()` as metadata for the enumeration filters below.

### Axis conversion

The public VoxelShape entry computes `cycle=AxisCycle.between(moveAxis,X)`. collideX first replaces it with `cycle.inverse()`, then sets `(A,B,C)=(cycle.cycle(X),cycle.cycle(Y),cycle.cycle(Z))`. `between(from,to)=VALUES[floorMod(to.ordinal-from.ordinal,3)]`. FORWARD chooses `(z,x,y)` and advances axis ordinal by1; BACKWARD chooses `(y,z,x)` and decrements by1. These exact mappings can be implemented without enum objects:

| Movement axis | A,B,C inside collideX | Occupancy lookup for loop i,j,k in original x,y,z |
| --- | --- | --- |
| X | X,Y,Z | `(i,j,k)` |
| Y | Y,Z,X | `(k,i,j)` |
| Z | Z,X,Y | `(j,k,i)` |

Sources: `exv.a(ji$a,ewx,double)@0–10`, `exv.a(ja,ewx,double)@22–56`; `ja.a(Axis,Axis)`, `ja$2.a/ja$3.a`, `exl.a(ja,III)`.

### Exact collideX pseudocode

This transcribes `exv.a(ja,ewx,double)@0–441`. Every coordinate and comparison is **double**. `EPS=1e-7` is unrelated to Particle.move's widened-float `1e-5` stop threshold. `find(axis,t)` is the last coordinate index whose value is **<=t**: `upper_bound(coordsAxis,t)-1`, range -1..size. It is the original ArrayVoxelShape/base binary-search rule; shapes translated by BlockCollisions become ArrayVoxelShape with OffsetDoubleList coordinates. For the untranslated CubeVoxelShape override, the source instead uses `floor(clamp(t*size,-1,size))`. `coords` in this pseudocode include the actual block translation.

```text
collideVoxel(moveAxis, box, d):
    if shape.isEmpty(): return d                 // before near-zero test
    if abs(d) < EPS: return 0
    select (A,B,C) and full(i,j,k) using axis table above
    minI = find(A, box.min(A) + EPS)
    maxI = find(A, box.max(A) - EPS)
    loB = max(0, find(B, box.min(B) + EPS))
    hiB = min(size(B), find(B, box.max(B) - EPS) + 1)
    loC = max(0, find(C, box.min(C) + EPS))
    hiC = min(size(C), find(C, box.max(C) - EPS) + 1)
    if d > 0:
        for i = maxI+1; i < size(A); i++:
            for j = loB; j < hiB; j++:
                for k = loC; k < hiC; k++:
                    if full(i,j,k):
                        gap = coords(A)[i] - box.max(A)
                        if gap >= -EPS: d = min(d,gap)
                        return d                 // also returns if gap test failed
    else if d < 0:
        for i = minI-1; i >= 0; i--:
            for j = loB; j < hiB; j++:
                for k = loC; k < hiC; k++:
                    if full(i,j,k):
                        gap = coords(A)[i+1] - box.min(A)
                        if gap <= EPS: d = max(d,gap)
                        return d                 // also returns if gap test failed
    return d

collideShapes(axis, box, originalShapes, d):
    for shape in originalShapes:                 // preserve original block grouping/order
        if abs(d) < EPS: return 0                // before each shape, not after the last
        d = shape.collide(axis,box,d)
    return d
```

Important boundaries are strict `abs(d)<EPS`, inclusive positive `gap>=-EPS` and negative `gap<=EPS`, exclusive `hiB/hiC`, and an immediate return at the first occupied tested cell even when its gap is outside the accepted epsilon. There is no global clamp of the final displacement to zero and no arbitrary penetration push-out. A tiny opposite-sign gap is possible at the epsilon boundary; changing `>=-EPS` to `>=0` changes the source behavior. Flattening one block shape into several boxes inserts extra outer near-zero checks and can also change the final value. Sources: VoxelShape bytecode9–21,74–219,221–441; Shapes bytecode30–55; original collide mappings (`client-mappings.txt:L127233`).

### Why merged boxes lose a real source behavior

Source-derived counterexample, without launching the client: construct `Shapes.joinUnoptimized(leftHalf,rightHalf,BooleanOp.OR)` for adjacent half cubes `[0,0,0,.5,1,1]` and `[.5,0,0,1,1,1]`. The resulting original grid can have X=[0,.5,1] with both X cells occupied. `toAabbs()` merges them into one `[0,0,0,1,1,1]` box. For a box already inside it, X=[.1,.4] and Y/Z=[.1,.3], with requested dx=.2, original collideX starts at the next occupied cell's plane .5 and returns `.5-.4` (approximately .1). A merged single-box resolver sees no new front face and can allow .2. Thus equal union geometry does not preserve every collision result when the moving box starts embedded in occupied cells. This is a deduction from the original algorithms, not a claimed runtime screenshot/test. Sources: `exs.b(VoxelShape,VoxelShape,BooleanOp)` (`joinUnoptimized`) original132–156, `exv.b(DoubleLineConsumer)` passes **merge=true** to discrete forAllBoxes, `exv.e()` uses that for toAabbs, and collideX above. Join and toAabbs mappings (`client-mappings.txt:L127165`).

### Original BlockCollisions enumeration and axis order

The collider list is constructed once for `oldBox.expandTowards(requestedMotion)`. Shape resolution then uses the original Y-first axis ordering described earlier; it moves its working AABB by accepted Y before resolving horizontal axes. For horizontal axes, Z precedes X only when `abs(requestedX)<abs(requestedZ)`; equality uses X then Z. This ordering is distinct from the cyclic A/B/C conversion inside a single collideX call.

`BlockCollisions dca.<init>@63–172` constructs an inclusive Cursor3D range for each axis: **`floor(query.min-EPS)-1` through `floor(query.max+EPS)+1`**. `Cursor3D.advance` is X-fastest, then Y, then Z: `localX=index%width`, `q=floor(index/width)`, `localY=q%height`, `localZ=floor(q/height)`; then increment index. Its type is the number of local coordinates on an outer boundary: inside0, face1, edge2, corner3. Sources: Cursor3D (`client-mappings.txt:L37079`), `jf.a()@13–63`, `jf.e()@0–72`.

`dca.computeNext` performs these filters in source order:

1. Skip **corner/type3** cells (`@43–49`).
2. Get the collision chunk using X/Z section coordinates. Skip when `getChunkForCollisions` returns null (`@52–65`); read the actual BlockState from that chunk (`@68–90`).
3. The only-suffocating flag is false for this particle call; it therefore imposes no suffocation filter here (`@92–113`).
4. For **face/type1**, skip unless `state.hasLargeCollisionShape()` (`@116–130`). This original flag returns true for uncached/dynamic states; for cached static states it records whether any collision coordinate extends below0 or above1. Keep 1.5-high fence/wall collision geometry intact.
5. For **edge/type2**, skip unless the state is exactly `Blocks.MOVING_PISTON` (`@133–150`). This is not a general “allow any large shape” edge rule.
6. Query the original three-argument collision getter against the full collision world, actual position and EMPTY context (`@153–167`). If it is the **same object** as `Shapes.block()`, use strict AABB intersection with the positioned unit cube (`@172–205`). Otherwise translate the shape by actual block XYZ and retain it only if nonempty and `Shapes.joinIsNotEmpty(movedShape,Shapes.create(queryBox),BooleanOp.AND)` (`@233–266`). A geometry-only unit-box test cannot replace that identity distinction.
7. Return one positioned original shape for that block, preserving Cursor order. Position translation uses double addition through `OffsetDoubleList`; preserve original coordinate planes and use double physics rather than Float32 mesh vertices.

Sources: `dca.computeNext@0–292`; BlockCollisions mapping (`client-mappings.txt:L97488`), BlockState hasLargeCollisionShape (`client-mappings.txt:L109501`), OffsetDoubleList/Shapes intersection (`client-mappings.txt:L127143`). The original non-full-shape intersection filter is part of the source contract; this note does not equate it to a model ray test or occlusion-box test.

Additional read-only reproduction command for this follow-up:

```powershell
& javap -classpath $particleJar -p -c dca dcg dcl exh exm 'exm$1' 'dtb$a' 'dtb$a$a' dfy dtb 'dtb$d' dga dhu dox dix dom die dnt dnc dfc dlq dmy dsu dlt dmo dko exv exl exf exj exe exs exr ja 'ja$1' 'ja$2' 'ja$3' 'ji$a' jf
```
