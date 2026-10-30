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

An enabled host writes a bounded request to config/mcvisual-director-request.json:

    id, lease, target, view, issuedAt, expiresAt

IDs and leases are bounded identifiers. Request validity is at most ten seconds.
Views are first_person, third_person_back and third_person_front. Commands are
fixed internally: put only the observer in spectator mode; teleport only that
observer to the whitelisted, currently online native player UUID; request native
spectating. A target/camera UUID readback confirms attachment. Accepted requests,
sent commands and timeouts never count as successful attachment.

Each request sends at most three commands, with eight-second native state gates.
There is no silent retry. Identity/authentication loss stops it; a manual or native
detach pauses the current control lease, so the selector cannot immediately steal
the camera back. Resuming requires an explicitly renewed lease. No inventory,
actor position, role goal or model is mutated.

The companion's diagnostics contain camera identity, request/phase, command counts
and measured HUD render cadence. They contain no payloads, chat, passwords or
prompts. Status is written once per second; request files are polled twice per
second. This is a typed local companion contract, not a network control server.

Use the separate native-client-observer module for actual subject data and the
matched appearance helper for the camera player's YSM corner avatar. This module
does not invent missing plugin fields, force a model, or establish voice routing.
Actual server authorization, native switching, scene rendering and performance
must still be accepted with the existing client.

Build with the supplied build.mjs and an existing matching local Fabric cache.
The build checks actual native method signatures, runs policy checks and compiles
an independent consumer against the packaged production JAR. Artifacts and live
configurations stay outside the repository.
