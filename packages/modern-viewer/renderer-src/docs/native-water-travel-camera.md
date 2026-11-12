# Orthographic framing over water

The native `floorSafe` observation measures solid support below the watched
actor. It is not evidence of camera visibility: boats, swimming and airborne
actors may have a clear orthographic scene without a solid floor.

The host sequence, scheduled-choice validator and model menu now use measured
same-actor/world visibility for orthographic choices. Current authentication,
attachment, scene freshness, supported projection, room clipping, manual
control and combat/interaction guards remain in force. Native projection still
checks the actual scene when executing a shot. Missing visibility is not a pass.

Finite perspective orbit/push/pull motion retains its independent support and
whole-path preflight requirements. This change sends no player movement.

Regression coverage includes steady and lively moving-water scenes, model
menus, scheduled execution, stale/foreign/occluded scenes, and the finite-motion
negative cases. Actual consumer loading and rendered-camera evidence must be
recorded separately from these tests.
