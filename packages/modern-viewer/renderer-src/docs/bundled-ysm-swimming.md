# Original bundled YUI swimming direction

The verified bundled `neko_yui` actor has a Web presentation correction for one
authored main-animation channel: `swim / AllBody / rotation.x`. Its original
handwritten source uses −80 degrees, placing the head behind the received body
heading after mounting the Bedrock model. Upright headings are already correct.
The correction retains the pitch magnitude, body yaw, independent live look,
source files, geometry, texture and all other channels.

## Source convention and scope

For source pitch `a`, actor orientation `B=diag(-1,-1,+1)` and the inner
headward axis `(0,-1,0)`, the world axis is:

```text
B Rx(a) (0,-1,0) = Rx(-a) (0,+1,0) = (0,cos(a),-sin(a)).
```

Thus original −80 degrees points toward +Z while Mineflayer yaw zero faces −Z.
The ordinary single-X conversion agrees with the primary authoring convention:
[Blockbench v4.12.5 BoneAnimator.displayRotation](https://github.com/JannisX11/blockbench/blob/v4.12.5/js/animations/timeline_animators.js)
negates numeric X/Y rotations in its Y-up display and retains Z. The locked
YSM 2.4.1 default model's original `swim / Root` pitch is +72.5 degrees, which
already points head first. This does not justify reversing generic channel signs.

The adapter activates only after the bundled reader verifies every declared
asset and these source identifiers match:

| Source | Required value |
|---|---|
| Model ID / YSM version | `neko_yui` / `2.4.1` |
| Original model SHA-256 | `1feb1121e6946a899c75ea020b32d01809672010ac043c410e2d049426e58205` |
| Original main animation SHA-256 | `0cbd59d07acfa203438855d678e077da0af88e751d00e6fba713b1e775771ef5` |

The diagnostic `sourcePoseConvention=original_neko_yui_swim_pitch` identifies this
explicit correction. Other bundled sources, changed source hashes, server YSM
and Paper uploads keep their original numerical channels. The verified original
PNG SHA-256 remains `f8ed6510dec8647895fb633dde7cad0d3338fe7b39f78e2566d389e4ec33709f`.
The source asset bytes and bundled catalog digest are unchanged.

`PaperYsmAnimation` offers an optional sampled-main-pose adapter. Only the
verified bundled actor supplies this conversion, before water pose blending and
live head, held-item, use, swing and hurt overlays. Adapting the sampled map leaves
the source animation and other clips intact. The existing 220 ms water blend now
interpolates from its retained snapshot without aliasing the destination
quaternion; previously the rotation stayed at the old pose until snapping at the
end. Position/scale blending and action timing remain unchanged.

## Verification and limits

`native-bundled-ysm-swim.test.mjs` reaches the actual original YUI actor and checks
world-space headward direction at four cardinal headings, yaw fallback, received
zero-speed swimming pose, independent body/head yaw and pitch, water occupancy,
entry/tread/resume/exit transition matrices, upright idle/walk and legal backward
or sideways movement. Changed model/animation hashes and another model ID must
not receive the conversion; a standard positive swim tilt must remain forward.
`paper-ysm-rotation-blend.test.mjs` independently checks ordinary quarter/half
rotation poses, return to tread and an interrupted transition.

This corrects an observed Web swimming direction. It does not establish the
opaque native YSM decoder's full behavior, multi-axis animation fidelity or
matched Java-client pixels. Native/general animation and complete entity parity
remain false. The original YUI `climb` copy and other tilted poses are separate
acceptance scope. Consumers must build and activate their own verified viewer
input; source changes or refreshing an already running native viewer cannot
replace its captured in-memory bundles.
