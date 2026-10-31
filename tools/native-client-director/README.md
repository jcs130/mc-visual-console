# Native spectator director companion

This optional Fabric 1.21.1 module controls one existing, explicitly configured
observer. It does not create a player, connect a Minecraft client, run a model,
choose an agent's game goal, or expose arbitrary command execution.

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
