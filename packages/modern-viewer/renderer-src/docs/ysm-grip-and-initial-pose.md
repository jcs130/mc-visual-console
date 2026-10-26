# YSM held-item basis and initial prop visibility

## 2026-10-26 correction

Two independent renderer defects explained the reported inverted NEKO axe and
Cormy's parasol/chair-like display. This is shared renderer source; updating it
does not replace a consumer's frozen website or running observer.

### Item mounting

The original YSM 2.4.1 item layer uses its X-left/Y-up locator convention. The
shared Bedrock hierarchy uses ModelPart X-right/Y-down, compensated by the
actor's outer transform. The item mount was missing the corresponding basis
conversion. Rotating an individual axe texture would also leave the grip offset,
other items and opposite hand wrong.

`native-ysm-item-mount.js` now supplies the common Paper and native-bundled mount:

```
S(-1,-1,1) * T(0,-1/16,-0.1) * Rx(-90 degrees) * original Java ItemTransform
```

Item geometry is already centred by the baker. Native display translations,
XYZ rotation order, per-hand display transforms, authored locator rotations and
original PNG/model bytes remain authoritative. Earlier shield and legacy
crossbow corrective turns compensated for the missing basis; they are removed
to avoid applying the correction twice. The shield special-renderer geometry
transform remains unchanged. Tests independently check world-space grip, three
axes, blade/handle points and shield plate/handle orientation in both hands.

The reference is the original Fabric 1.21.1 YSM 2.4.1 release JAR, SHA-256
`ec51cfae84d219a45fac5098a31bfe980bcb7c2d8b413e8fffbd05a411a85680`:
its entity renderer, locator helper and item layer were inspected together.
This is not a claim of full Java-client pixel parity or support for every YSM
release. Original assets/JAR and private live captures are not included here.

### Initial pose

An authored bind pose can contain every optional prop. In the original Cormy
model, normal pre-parallel/parallel layers hide the chair, FOX and parasol.
The old renderer exposed that bind pose before the first valid motion sample;
an absent/stale first sample left those props visible indefinitely. This was
reproduced with the original model and old production renderer in an isolated
browser. It can look like a vehicle even without any vehicle observation.

The model and its attached items now remain hidden until the animator has
evaluated the original layers from a valid sample. A later stale sample retains
the last evaluated pose. A requested authored extra animation may still show
its props; the assets are not edited or globally stripped. Unsupported clips
retain diagnostics without hiding an otherwise evaluated static model (the
original Kirito bundle, for example, has no `idle` clip).

### Validation and limits

- Shared suite: 1,359 passed, 37 conditional fixture skips, no failures.
- Focused original-model and equipment set: 69 passed, no skips.
- Both TypeScript configurations passed.
- Actual isolated WebGL: original NEKO/Cormy, missing first motion then valid
  recovery, both hands, axe/sword/pickaxe/shield/bread/stone, walking/swing state
  and stale-sample retention. No extra Minecraft login or gameplay mutation.
- Player bow/crossbow use state remains explicitly unavailable in the bundled
  YSM path when the required observation is absent. This fix does not invent
  pull/charge inputs. Earlier inactive-mob ranged support is separate.
- Production runtime, remote consumers, full Java pixel matching and mobile
  device performance require their own acceptance after a matched rebuild.

Run `node tools/run-renderer-tests.mjs` in `renderer-src`. To exercise the private
original fixtures, set `PAPER_APPEARANCE_FIXTURES`,
`PAPER_APPEARANCE_NATIVE_ASSETS` and `PAPER_CORMY_ACTION_FIXTURE=1` to verified
local original bundles/assets. Synthetic basis/initial-prop regressions run
without those fixtures. Build the standalone spectator site and the consuming
observer from the same source commit; retain the previous pair for rollback.
