# Native follow acknowledgement across an open GUI

The native director previously returned before observing the camera whenever a
menu was open. On the first tick after the menu closed, it checked the eight
second timeout before inspecting the actual camera UUID. A completed attachment
could consequently become `unknown`. Separately, a host that timed out after 30
seconds could not resume on a late valid attachment in the same connection.

Native NeoForge 0.1.36 / Fabric director 0.1.26 observes an admitted request's
actual camera while a GUI is open. This path is read-only: it requires the same
observer, request, target UUID, world and fresh living entity evidence. It defers
presentation using `viewDeferred`; closing the GUI applies the requested view
once. A live camera UUID is checked before an elapsed deadline, but an already
terminal unknown, cancelled or manually stopped request remains terminal.

Hosts can use the public `nativeGuiAttachmentPending` verifier to extend the
receipt wait while this exact evidence is fresh. Preserve the original action ID,
lease and issue time. Do not call it a completed shot or send another camera
command. A lost/stale proof stops extending the deadline.

`planNativeDirectorResume` also accepts a late actual attachment after a stopped
host's `unknown_request_receipt`: the accepted request, lease, target, live entity,
world, current render and roster must match. The result explicitly says
`outcome: camera_bound`, `completionVerified: false` and
`requestedViewVerified: false`. Archive the old status, use a new host lease and
adopt the observed camera; never replay the old request. Existing manual-stop,
unknown-native-state, identity, freshness and resume-rate guards remain closed.

Validation: both original loader builds and separately compiled packaged
consumers; negative identity/death/cancellation/unknown checks; public TypeScript
consumer; real host process with a 32-second GUI deferral; original death,
reconnection and manual-detach fixtures. Loading, actual follow frames and
natural in-game menu occurrences are separate deployment evidence. Private
captures, launch inputs and JARs are not source assets.
