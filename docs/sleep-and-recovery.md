# Sleeping and body recovery

`avatarState.entity.sleepState` carries confirmed `sleeping`, nullable
`bedPosition` (the protocol's sleeping position) and nullable `bedFacing`.
An explicit `sleeping:false` clears old sleep metadata. Missing information is
unknown; a nearby bed never implies sleep. This state is scoped to the current
entity ID, UUID and appearance epoch, and is distinct from authoritative
`bodyState` incapacitation. Recovery requires a new server state, not a timeout.

YSM uses the original sleep clip with the complete living-entity sleeping
composition: bed yaw, Z roll by 90 degrees, then local Y turn by 270 degrees.
Omitting the final turn incorrectly rolls the authored face toward the mattress.
The sequence is also documented in the [GeckoLib renderer implementation](https://github.com/bernie-g/geckolib/blob/main/common/src/main/java/com/geckolib/renderer/GeoEntityRenderer.java).
It suppresses
action/look overlays, and anchors the original head over the confirmed mattress.
The bed heading is applied in the rendered parent's coordinate system. Wake and
recovery reset the outer rotation and translation. Vanilla avatar motion also
accepts sleep and wake. These are presentation transforms; no packets, physics,
inventory or controls are modified.

Regression fixtures cover wake before metadata refresh, identity replacement,
four bed headings, and downed → recovered. Original Cormy geometry and texture
were inspected in an offline browser fixture. This is not proof of complete
native Java/YSM parity or a naturally occurring sleep/wake on a live server.
