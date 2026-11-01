# Native orthographic recovery

The original OrthoCamera mod must render the selected projection in the actual
spectator client. Installing the JAR, accepting a request, observing an attached
actor or rendering an isolated fixture does not prove that the program view is
orthographic.

The 0.1.15 native candidate (`cd5ece0e`) distinguishes a room with headroom and
horizontal clearance from a narrow tunnel. Its room near plane follows the
native actor bounds with a margin for visible hair and clothing. Room/open scale
changes are eased; world blocks and followed players are not modified. This is
local actor framing, not a complete architectural reconstruction of every floor.
Unknown layouts and genuinely narrow spaces retain the perspective fallback.

Host integration must adopt `nativeCurrentView(native)`. A rig can still be
enabled and named `drone_front` after its actual view fell back to first person;
the requested rig name is not proof of the current composition. Prefer actual
projection/profile and `effectiveView` over that name.

`mayPreferOrthographic(view, {screenOpen, lastInteractionAt, now})` allows recovery
from a first-person safety fallback. Keep an open GUI and the first 15 seconds
after a real interaction in the close view. `SceneSelector.inspect()` exposes the
observed interaction timestamp; do not replace it with chat claims or a timer.
The host still calls `selectNativeShot` to verify current actor UUID, world epoch,
fresh native geometry, visible body and explicitly enabled projection capability.

While safe orthographic framing is actually on screen, retain its composition
for the initial 45-second projection dwell across ordinary movement/battle label
changes. A readable battle may keep orthographic framing afterwards. Exact GUI
interaction can request first person; unsuitable geometry is never made safe by
the dwell. When a selected proposal has the same subject and actual view already
on screen, the host must keep it without submitting another request ID.

Regression checks cover stale requested rig vs actual fallback, recovery from
first person, preservation of current interaction, room layouts, projection
dwell, unsafe geometry, correlated render receipts and cancellation. The private
host fixture also drives real file polling, receives a room orthographic request,
rejects a wrong actual profile, confirms the matching profile, and checks that
new movement does not reissue an unchanged composition. The later safety fallback
still has its return cooldown.

Do not merge build success, source commit, installation and current visual
acceptance into one status. Keep fresh before/after native snapshots around the
actual window screenshot, including target/camera UUID, world epoch, request,
actual projection/profile, render time and completed transition. Historical
river screenshots and singleplayer fixtures cannot substitute for that check.
