# Bundled YUI first-person arms

The bundled YUI actor renders its verified original `files.armModel` and shared
64×64 PNG in the existing native first-person scene/camera. Each selected side
contains its authored Arm → ForeArm → Hand → HandLocator subtree: four bones,
eight cubes and 48 faces, including the rotated forearm bows. Geometry, UVs and
texture bytes are unchanged. Missing, duplicate or foreign-parent roots and an
unexpected hierarchy fail with `BUNDLED_YSM_ARM_HIERARCHY_INVALID`, entering the
existing explicit appearance-fallback diagnostic.

## Coordinate contract

`nativeFirstPersonPlayerArmMatrix` exposes the existing Minecraft 1.21.1 hand
pose V before the skinview conversion. Vanilla continues to apply its original
`S(1/16,-1/16,-1/16)` afterward, preserving the previous rest/swing results.

The YUI arm mount is `V * Y_arm * Q_up`. The recovered YSM 2.4.1 Fabric 1.21.1
arm dispatch applies `Y_left = T(+.25,1.8,0) * S(-1,-1,+1)` and
`Y_right = T(-.25,1.8,0) * S(-1,-1,+1)` on the inherited vanilla stack. The source
JAR SHA-256 is `ec51cfae84d219a45fac5098a31bfe980bcb7c2d8b413e8fffbd05a411a85680`;
the method is the arm dispatch in `oo00OO0ooooooOoOoO00OoOO` (left offsets
160–220, right 230–290).

`Q_up = Ty(24/16) * Sy(-1)` converts this browser's Bedrock helper output
`H(s) = (x,24-y,z)/16` to authored Y-up block coordinates. It surrounds the intact
hierarchy, preserving nested pivots and cube rotation. This is an explicit
authored-source browser contract, **not a verified correspondence with the opaque
JNI baker's input basis**. There is no fitted offset, third-person property scale,
body lift, world position or world yaw in the first-person mount.

## Supported state and ownership

- A validated complete same-player inventory and fresh hand-animation sample
  select the empty main arm, left or right, at rest or during observed swing.
- Held items use the existing native first-person item provider, original item
  display transforms, swing and observed eat/drink paths. The YSM third-person
  item locator remains independent. Ordinary held-item branches do not draw an
  extra empty arm; unsupported item/use poses retain the native diagnostics.
- YSM 2.4.1 conditional `animation.arm` clips are not treated as 2.5 `fp_arm`
  clips. The first-person arm uses the original default bone pose with the
  inherited hand motion. Equip transitions, camera lag, view bob and unsupported
  use families remain unavailable.
- Scene identity/epoch handling retains existing actor ownership. Replacement,
  disconnect and disposal remove the first-person root and all its geometries.
  The enclosing actor alone owns/disposes the shared arm/body material and PNG.

Original arm JSON SHA-256:
`1ca1332dac123c6c72966660a694b770caea895ea41b95964c6866a27ab6c9e5`.
Original shared PNG SHA-256:
`f8ed6510dec8647895fb633dde7cad0d3338fe7b39f78e2566d389e4ec33709f`.

CPU tests verify these hashes, exact geometry/UV preservation, four noncoplanar
authored corners, a rotated bow and nested locator, vanilla matrix preservation,
projection independence, identity rejection and disposal. Actual browser visual
acceptance and matched native Java camera/pixel comparison are separate evidence.
`firstPersonNativeBasisVerified`, animation/renderer parity and complete entity
parity remain false. First-person rendering availability reports the implemented
browser capability, not native pixel parity.
