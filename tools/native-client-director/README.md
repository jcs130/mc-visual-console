# Native spectator director companion

This optional Fabric 1.21.1 module controls one existing, explicitly configured
observer. It does not create a player, connect a Minecraft client, run a model,
choose an agent's game goal, or expose arbitrary command execution.

## 0.1.13: original OrthoCamera integration

Explicit `orthographicEnabled: true` enables the adapter only when the original
client-side OrthoCamera `0.1.9+1.21` and its checked API are installed. No server
mod is required. With Sodium, `use_block_face_culling` must be false, as described
in the [upstream compatibility notes](https://github.com/DimasKama/OrthoCamera#compatibility).
The matched pixel profile also disables entity/fog occlusion culling. Keep the
original JAR/license and the current 1.21.1 runtime; the upstream master branch
targets a newer Minecraft API and is not substituted into this adapter.

Four additional view IDs use the same original actor binding, request, lease,
cancel and native policy as the 16 perspective views: `ortho_isometric`,
`ortho_overview`, `ortho_close`, `ortho_top`. Readbacks expose actual projection,
configured profile and actual yaw/pitch/scale. Native frame confirmation is
required; a matching request string or an attached body is insufficient. The
public SDK/tool adapter retains those fields, and the bounded catalogue limit
is now 32. A missing mod, disabled adapter or incompatible Sodium configuration
cannot advertise working orthographic presets.

Geometry comes from the actual spectated actor, not the observer's own position.
Loaded chunks, native VISUAL shapes, roof/headroom and five body sight lines
provide a fresh UUID/world-bound spatial sample. The thin host can explicitly
prefer orthographic coverage of proven open scenes, while combat and exact
interactions use their supported perspective views. Projection changes have a
45-second host cooldown. This is display selection, with no additional model
loop, actor commands, account or network endpoint.

Persistent obstruction may choose among twelve bounded yaw/pitch combinations,
with 700ms easing and a 2.5-second avoidance cooldown. An occluded actor, roof,
layered/unknown geometry, identity/world loss or stale context ends the owned
projection and falls back to same-subject perspective. Clearing the obstruction
cannot replay a blocked request. Manual changes release ownership and preserve
the user's configuration. The controller restores the configuration it owned
when leaving orthographic mode; it does not keep saving an enabled projection.
Cross-projection changes use the existing GPU frame dissolve; same-projection
adjustments interpolate the original mod's settings.

256 Java checks and independent finished-JAR consumers pass, including 30
orthographic checks; 79 shared SDK/selection checks and public types pass. The
finished controller was loaded with original OrthoCamera in the isolated 1.21.1
client: all four views, perspective return and real wall-occlusion fallback were
captured with an unchanged static actor and no system mouse input. Six isolated
host-process cases also pass, including actual-profile verification and cooldown
after fallback. These are not live shader, full YSM mesh occlusion, room cutaway
or arbitrary multi-floor topology acceptance. Production loading and program
verification must still be recorded separately.

## 0.1.12 candidate: native camera rigs

This is a client-only camera companion. No additional server mod is required;
the existing account still needs its normal spectator/teleport permissions and
authentication. Existing YSM/server appearance synchronization is independent.
`cinematicEnabled: true` and `autoCloseView: true` are separate explicit opt-ins,
alongside `droneEnabled`. Disabled profiles do not gain new runtime view IDs.

The 13 drone views are rear follow, overview, eye-level follow, front lead,
front-left/right oblique, left/right side tracking, low angle, left/right finite
orbit, push-in and pull-out. Together with the three native perspectives this is
16 executable views. The full identifiers, recipe mappings and conservative
activity choices are maintained in `shot-policy.mjs`; `availableViews` in the
current authenticated native readback remains authoritative. Orthographic
projection is a separate optional backend, not a synonym for drone overview.

Front lead physically puts the camera in front of the subject and looks back;
it is not a rear camera with a renamed label. Tracking reuses the existing
movement-heading solver. Same-subject reframes keep the rig, with damped radius,
height and a 45-degree/second angular limit. Finite moves take eight seconds,
have minimum-jerk starts/stops and hold the end pose. Orbits cover 60 degrees;
they never loop. Dollies with no usable travel range are refused. A subsequent
arc starts at the rendered previous endpoint.

Each finite path checks 65 poses, the native near-plane collision rays and swept
camera volume before starting, and checks newly encountered geometry each frame.
Unloaded terrain is unavailable. Actor movement beyond the verified 0.75-block
anchor, a world change, menu, obstruction or cancel stops the finite script.
This conservative anchor policy intentionally does not orbit a running fighter.

Auto-close uses actual clipped camera space: below 1.25 blocks for 350ms, or an
immediate dangerous/unknown path, selects native first person. It stays there at
least three seconds and requires two seconds of clearance above 2.5 blocks;
outward recovery takes 700ms. The third-person body stays hidden while the boom
is too short. A blocked front/orbit is reported as degraded/rejected, not a
successful requested composition. Stable rear/eye/overview may explicitly report
an adaptive first-person fallback. These thresholds apply only while the opted-in
camera rig owns the observer; manual control still wins.

## SDK, tool calls and cancellation

Public `mc-visual-console/native-camera` exports `createNativeCameraAdapter`.
The host supplies `readNative`, `writeRequest`, optional `writeCancel`, exact
server/observer/subject bindings and its clock. Importing the module does not
scan files/ports, connect a client, run a model or discover services. The adapter
implements the existing `CameraAdapter`, so `CameraDirector` and the
`broadcast_camera_*` tool dispatcher share the same transaction and evidence.

`phase: attached` only proves body attachment. `shotExecution` separately reports
preflight/running/settling/holding/completed/blocked. Static rigs finish only with
actual post-request pixels, completed transition and matching UUID/scope/lease;
finite moves also need their endpoint rendered. Missing context and unknown
outcomes do not permit a new-ID replay. A close fallback reports `effectiveView`.

The optional `config/mcvisual-director-cancel.json` uses id, lease, target,
targetUuid, connectionEpoch, issuedAt and expiresAt. Cancellation before admission
leaves a bounded connection-local tombstone. An attached local rig can be
cancelled; a pending server command becomes unknown because the client cannot
claim it was undone. `cancelReceipt` carries the binding and native world epoch.
Host shutdown must reconcile this receipt rather than equating a written file
with successful cancellation. The native terminal policy prevents revival.

## Verification scope (2026-11-01)

218 Java source checks and independent consumers recompiled against the finished
JAR pass (169 policy, 11 follow, 9 transition, 29 cinematic). Shared SDK/tool,
judges, motion, adapter and shot-policy checks pass 75 cases; the public TypeScript
consumer passes. The 0.1.12 JAR was actually loaded in an isolated 1.21.1 client.
Original native screenshot sequences show front, side, low-angle, eight-second
60-degree orbit, pull-out and close-space first-person/recovery. The test actor
was a static local armor stand, not a live game Agent. A lamp-post obstruction
refused an earlier arc; the failed sample is retained privately. Native pixels
do not replace multiplayer permission, moving-subject or platform-program QA.

The iGPU lab cap is 30 FPS. Synchronous PNG sampling reduced observed lab FPS to
roughly 15–24; after sampling it returned to 30. This is not production overhead
measurement. The experimental world was saved and its extra client closed.
At that checkpoint production remained 0.1.11. Source commit, client installation,
live observation and broadcast platform acceptance are separate stages. Private
JARs, captures and runtime bindings stay outside Git.

Subsequent authorized activation on 2026-11-01 installed the same frozen 0.1.12
JAR in the original live observer and enabled the matching thin selector. A
concurrent server maintenance initially made the existing address unavailable;
after its recovery, the original observer authenticated and declared all 16
views. Real readbacks confirmed Coobot front/oblique/overview and DeepFish oblique
follow with 450ms dissolve completion; a real native window capture confirmed
front composition. Later receipts recorded near-space first-person fallback and
recovery to eye-level follow. Server/game actors, TTS, goals, memory and ledger
were not modified by this camera deployment. Live finite-orbit/dolly, exact
appearance-resource parity, orthographic unification and the platform program
remain separate acceptance scopes; isolated footage is not their live evidence.

Version 0.1.11 adds a request-bound `target_position_unconfirmed` failure when
positioning times out before any target attachment command and the native camera
is positively still the original observer. The preceding teleport remains
unconfirmed. Matching hosts may quarantine this target for 30 seconds and choose
another subject with a fresh ID; unknown attachment, manual takeover and foreign
camera outcomes remain stopped. `positionFailure` binds request, lease, target,
observer, current camera, world epoch and command count.

Explicit `transitionsEnabled: true` enables a GPU-only old-frame overlay; optional
`transitionMs` is 100–1500 ms (default 350). A remote switch holds the labelled old
frame until two rendered frames confirm the new camera, then dissolves it away.
The hold is bounded at ten seconds. Manual detach, GUI/auth loss and terminal
failure abort it. One RGBA texture is capped at 16 MiB, with no CPU pixel readback
or second scene renderer. The effect runs on the active native HUD path. Same
subject drone reframes retain the existing rig interpolation instead of resetting
it. These transitions do not fade separate desktop avatar windows or audio.
Diagnostics report allocation, request, phase and capture failure. Disabling the
feature performs no GPU capture. Pure timing/package checks and an isolated
1.21.1/Sodium/iGPU pixel test passed; production activation is a separate step.

Nothing activates without config/mcvisual-native-director.json. The configuration
must explicitly enable the module and match the current server and observer name;
targets are an explicit list of existing player names. A native MC_AUTH_SUCCESS
system receipt is required on the current connection. The module never supplies
credentials or attempts authentication.

Config fields:

    enabled: false by default
    server: exact native server address
    observer: existing observer account
    targets: explicit player-name list, at most 16
    minSwitchMs: at least 10000; the scene selector should normally dwell longer
    droneEnabled: false by default; explicitly allow the optional rendered-camera rig
    droneDistance: 2–10 blocks, default 7
    droneHeight: 0.5–5 blocks, default 3

An enabled host writes a bounded request to config/mcvisual-director-request.json:

    id, lease, target, view, issuedAt, expiresAt

IDs and leases are bounded identifiers. Request validity is at most ten seconds.
Views are first_person, third_person_back, third_person_front, drone_follow and
drone_overview. Both drone views additionally require droneEnabled in the matching
observer profile. Overview uses an elevated, roughly 69-degree downward composition;
the same native collision clipping applies indoors.
It follows the actual attached player with frame-rate independent position and
travel-heading smoothing. Standing head turns do not spin the camera. Native
vanilla near-plane collision rays shorten the boom; target UUID changes,
teleports and long render gaps reset interpolation instead of flying across the map.
The camera entity, target HUD and corner-avatar identity stay native. A manual
perspective change releases the rig; screens pause it. No extra player or
render target is created. The rig is display composition, not AI scene understanding.
Commands are
fixed internally: put only the observer in spectator mode; detach its previous
camera before a remote teleport and confirm its own native UUID; teleport only that
observer to the whitelisted, currently online native player UUID; request native
spectating. A target/camera UUID readback confirms attachment. Accepted requests,
sent commands and timeouts never count as successful attachment.

Each request sends at most four commands, with eight-second native state gates.
Same-world teleports retain a previous spectated entity; the explicit detach
stage prevents its camera tick from pinning the observer to the old location.
There is no silent retry. Identity/authentication loss stops it; a manual or native
detach pauses the current control lease, so the selector cannot immediately steal
the camera back. Resuming requires an explicitly renewed lease. No inventory,
actor position, role goal or model is mutated.

The companion's diagnostics contain camera identity, request/phase, command counts
and measured HUD render cadence. They contain no payloads, chat, passwords or
prompts. Status is written once per second; request files are polled twice per
second. This is a typed local companion contract, not a network control server.
Rig diagnostics separately report activation, last rendered time and requested/
clipped boom distance. A packaged build passing checks is not live rendering proof.

Version 0.1.5 also exposes a matching `offer` receipt (id, lease, accepted, reason)
separately from the active attachment. An offline target's rejected offer cannot
silently inherit the old camera's receipt. Paused, unknown and stopped states keep
their original cause until an explicit new offer; a later disconnection cannot
turn a manual pause into an automatic recovery opportunity.
The once-per-second `targets` list contains only the explicitly configured names,
native tab UUIDs and actual loaded entity positions/scopes. Tab presence does not
prove position; unloaded or other-world entities have no invented coordinates.
`observerUuid` lets consumers distinguish a known target loss returning to the
observer from an unrecognized/manual camera change. Diagnostics are replaced
atomically and contain no chat text or additional world subscription.

Use the separate native-client-observer module for actual subject data and the
matched appearance helper for the camera player's YSM corner avatar. This module
does not invent missing plugin fields, force a model, or establish voice routing.
Actual server authorization, native switching, scene rendering and performance
must still be accepted with the existing client.

Build with the supplied build.mjs and an existing matching local Fabric cache.
The build checks actual native method signatures, runs policy checks and compiles
an independent consumer against the packaged production JAR. Artifacts and live
configurations stay outside the repository.

scene-policy.mjs is the shared display-selection policy. It can use consecutive,
fresh, owned native position snapshots while a long task is still running. Chat
coordinates, failed tasks, stale samples and cross-run teleports are not motion
evidence. Standing still requires repeated fresh samples; silence is unknown.
Stationary movement scenes lose priority, and old combat interest expires after
12 seconds. Recent physical work takes priority over conversation. With the
explicit cinematicFraming option, battle uses overview, travel uses follow and
crafting uses first person. Confirmed idle scenes reframe once to overview; they
do not invent a round-robin activity. Same-subject shot changes preserve dwell.
The build copies this module and verifies a separate consumer against that copy.

The explicit `observePosition` contract also accepts continuous native observer
samples; fresh observer samples take precedence over sparse body snapshots.
Slow travel accumulates against a position anchor, whereas head turns, jitter,
teleports and scope changes do not invent travel. Eight seconds of repeated
stationary samples establishes idle; missing data stays unknown.
When no real physical action is recent, a stationary subject can yield to the
latest allowed public speaker after twelve seconds. Unknown motion uses the normal
minimum dwell. Speech expires after 45 seconds; old speech predating a cut is not
replayed as a new event. `eventActor` attributes public speech heard by any trusted
native feed to its real allowed sender, while all state and action receipts stay
bound to their source owner. Private/server/quoted chat is not public speech.
Optional `setAvailable` filters known offline players; `inspect` returns bounded
timestamps and observed motion status without retaining chat or game prompts.
Consumers must pace both subject changes and same-subject reframes against the
native gate, preserve manual/unknown outcomes, and confirm actual camera UUIDs.

An explicit `requireConnectionEpoch:true` profile requires requests to carry the
current native `connectionEpoch`. Old or unbound requests receive a correlated
refusal before any command is sent. The default retains legacy compatibility.
`connectionBoundRequests` reports the active rule. `connection-recovery.mjs`
allows opted-in consumers to resume after a fresh authenticated connection with
the same observer UUID and known camera identity. Preserve prior unresolved
effects as unknown and issue a new lease/request; manual pauses stay stopped.

Version 0.1.7 distinguishes a native client-world replacement from a same-world
detach. `Frame.nativeWorldEpoch` is incremented only when the actual non-null
client world object is replaced, independently of coordinates and chat. An already
attached request may enter `world_transition` for at most three seconds. It sends
no commands, offers no new lease and changes no perspective while waiting. Only
the original native target/camera UUID and observer UUID can confirm restoration.
The drone pauses interpolation during the gap; an original unchanged view may
resume after native restoration. The selector must wait through this phase.
Missing/changed identity, an unconfirmed deadline or a different camera stops or
pauses with a bounded `detachObservation`. Further world changes cannot extend
the wait. Legacy frames without a world epoch retain immediate detach protection.

Version 0.1.8 records the actual previously attached camera entity and its native
world epoch. A same-world return to the observer is a known `target_died` loss
only when that exact entity ID/UUID has native death or KILLED removal evidence.
Missing entities, tab entries, chat, world replacement and another camera do not
prove death. The configured detach key is observed through native keyboard/mouse
callbacks without recording unrelated keys or text; manual input takes priority
even in the same frame as death. Existing paused/unknown outcomes remain terminal.
`cameraLife` and `manualDetachRequested` make this distinction available to an
independent consumer. `directorTargetLoss` validates that readback and recommends
a 15-second subject cooldown; retain the known loss while the native switch gate
or a fresh request is pending. Select a different active subject with a fresh
request and confirm its native UUID. Do not replay the old request.

For an explicitly enabled spectator profile, the local observer body is masked
at the original entity renderer. Followed actors and survival players remain
unchanged. This is a local display policy; it creates, removes or substitutes no
server entity. The separate observer HUD 0.1.3 also hides the observer's own RPG
sidebar during an attachment gap and displays an explicit no-target notice.
Native method signatures, isolated state checks and packaged consumers do not
replace live render/manual-input/natural-death acceptance after installation.

Version 0.1.9 also handles a target that is already natively dead at the exact
attachment/reframe acknowledgement. It does not mark that corpse as a healthy
attachment. One observer-only detach is sent, then `target_death_transition`
waits up to eight seconds for the original observer self-camera acknowledgement.
Only that readback becomes a known target loss. The command is never replayed;
manual input, changed scope and an unconfirmed deadline stay paused/unknown.
Consumers wait through this phase without replacing the pending request.
Configured detach input also takes priority over a same-tick incoming reframe.
Native target samples expose entity IDs and exclude dead/removed bodies from
their live-entity flag, independently of tab presence or chat.

Version 0.1.10 makes lifecycle frame reads pure. The native tick separately
records the actual camera entity for the active request, including its request ID,
world epoch and last attached-observation time. This supplies direct, fresh
current-request death evidence even when no healthy frame was available. Foreign
requests, old observations, changed worlds and explicit manual input still cannot
recover. Offer-refusal receipts retain their own reason without overwriting the
earlier terminal camera reason. Neither diagnostic reads nor a new offer can
retag a past corpse as the current request's camera.
An existing paused/unknown lease cannot be recovered by this mechanism; its
original cause and manual controls remain intact. This is distinct from network
reconnection and must not be reported as successful disconnect recovery.
