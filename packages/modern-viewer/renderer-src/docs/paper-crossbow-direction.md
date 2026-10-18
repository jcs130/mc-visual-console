# Crossbow direction in the Paper YSM renderer

The Java generated crossbow sprite has its stock at the lower right and muzzle
at the upper left. In the browser YSM hand frame, applying the original display
alone pointed that axis back at the character. The charged-pose regression
measured a forward dot product of about -0.98 before the correction.

Roll only the centred generated crossbow sprite by 180 degrees in its own plane,
after the original item display. This keeps the original UVs, alpha extrusion,
display translation and left/right transforms. Other items and authored geometric
crossbows keep their existing frames. No character names or private assets are
part of the implementation.

The test uses the repository's original YSM default geometry and charged hand
poses, the Java 1.21.1/1.20.6 third-person crossbow displays, both hands and all
four cardinal body yaws. It checks physical muzzle direction independently of
the mount-matrix formula; it fails against the previous renderer. Existing sword,
block and shield tests remain unchanged.

This does not add charged-projectile model overrides or missing custom YSM arm
animations. The reference pose fixture does not prove that a live actor selected
that pose. Native Java scene parity remains a separate acceptance check.
