# Native spectator recovery after target death

Target death ends the old camera attachment, not the operator's continuous-follow intent.
The observer must preserve manual detachment and unknown admitted requests, but it must
not permanently exit merely because a verified death is followed by a missing camera,
a new native world, or a respawned player object.

## Observed failure and evidence boundary

The selector recorded `native_loss_confirmed / target_died`, cleared its current subject,
then exited as `native_stopped_requires_review` about eight seconds later. The saved
status still contained the exact request, connection and target loss identity. The native
director retained the old immutable `terminalCameraLife`; the supervisor would only
restart on a new connection or a late offer receipt. Consequently, a temporary observation
gap could leave continuous follow stopped for the rest of the same connection.

The exact native frame at selector exit was not retained. Replaying a missing camera and
a later world reproduces the old classifier's failure; this does not establish which
transition occurred in that particular incident. The captured terminal status separately
reproduces the supervisor's refusal to recover. The host now records compact camera,
lease, world and terminal-life provenance with its status for future diagnosis.

## Recovery contract

`nativeTargetDeathRecovery`, exported through `native-director-policy`, requires a fresh
authenticated spectator, the accepted request and lease, the original target UUID, and
that request's immutable native death receipt. A bound eye cannot select another player.

| Current observation | Result |
| --- | --- |
| Camera returned to the observer | Permit fresh selection; retain target cooldown |
| Camera temporarily missing | Wait, without sending or replaying a request |
| Camera has target UUID, but no fresh alive target readback | Wait for the current entity |
| Camera has target UUID and fresh alive roster evidence | Permit a new attachment request |
| New world with the same request's historical death | Preserve death provenance; never reuse its position |
| Manual pause, foreign camera, request/lease mismatch | No automatic takeover |

Entity IDs can be reused after respawn. A fresh alive entity may therefore keep the old
numeric ID. This only permits a **new** camera request; neither a roster entry nor death
recovery is an attachment/render acknowledgement. The normal native receipt remains
necessary before reporting following.

Same-connection supervision is limited to an exited `native_stopped_requires_review`
selector with matching `knownTargetLoss`, no pending operation, and the above proof.
It archives the old status, creates a new lease, and retains the existing restart limits.
Unsettled timeouts and human stops are not silently retried.

## Validation and upstream reference

- Public policy tests cover missing camera, world replacement, recycled entity ID,
  stale/foreign readbacks, binding changes, manual pause, pacing and supervisor restart.
- The packaged native-director checks load the relocated recovery module, so a missing
  runtime dependency fails the build.
- The host process replay covers a bound eye, a retained same-connection death stop,
  null camera, world replacement, fresh request/lease, actual attachment receipt, and
  subsequent manual pause. It does not connect to a game or create a death.
- [NeoForge 1.21.1 ClientPlayerNetworkEvent.Clone](https://github.com/NeoForged/NeoForge/blob/1.21.1/src/main/java/net/neoforged/neoforge/client/event/ClientPlayerNetworkEvent.java)
  documents replacement of the player instance on respawn.
- [NeoForge 1.21.1 ClientPacketListener patch](https://github.com/NeoForged/NeoForge/blob/1.21.1/patches/net/minecraft/client/multiplayer/ClientPacketListener.java.patch)
  retains `localplayer1.setId(localplayer.getId())`, so entity ID inequality cannot be a
  universal respawn requirement. Sources checked 2026-11-13.
