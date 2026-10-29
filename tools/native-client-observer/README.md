# Native observer HUD, Fabric 1.21.1

This optional client display consumes the shared `mcviewer:state` / `corti:viewer_state`
observer transport on the existing Minecraft connection. It adds no player, model,
HTTP server, gameplay command or polling request. It is separate from the Java
backend used to control an Agent and from the browser viewer.

An explicit local profile must match **both** the server address and signed-in
observer name. Without that match, no channel receiver is registered for the
connection and no display is replaced. No server address or account is built in.

## Build and enable

Use a previously launched, matching Fabric 1.21.1 profile with Fabric API
0.115.4+1.21.1. The builder compiles against its actual intermediary client and
Fabric networking API, validates the original native hook signatures, and runs
the protocol/display checks with the client's original Gson library:

```text
node tools/native-client-observer/build.mjs --game-dir <profile> --java-home <JDK21> --output-dir <artifacts>
```

This does **not** install or launch anything. Inspect the `.provenance.json`, stop
the selected client, and copy the built JAR to only that profile's `mods/`.
Create `config/mcvisual-native-observer.json` there:

```json
{
  "enabled": true,
  "server": "example.test:25565",
  "observer": "camera_account",
  "language": "en_us",
  "hideObserverSidebar": true,
  "writeDiagnostics": false
}
```

`language` also accepts `zh_cn`. F9 cycles overview, skills, native inventory,
all received fields, and hidden mode. F10 advances the current page. These are
local display keys; they do not perform or click game actions. Existing original
inventory/merchant screens and SpectatorPlus controls are retained.

## Data and subject binding

- The accepted subject must match the actual native camera **UUID and entity ID**,
  the receiving player's protocol UUID, spectator mode and connection/world object.
  Self state cannot replace an observer target. The connection's account and its
  own sidebar values are never substituted for missing target data.
- Camera changes, world changes, detachment, disconnect and a 12-second state
  expiry invalidate old display data. Mismatched old target packets are rejected;
  the client waits for a fresh frame matching its actual camera. No guessed target
  name, nearest player or remembered target is used.
- Vanilla health, armor, food, air and XP stay distinct from RPG class/level/XP,
  learning points, economy, mana and ability readings. Vortex's `nextLevelXp` is
  XP remaining, not an invented progress denominator. Missing fields stay unknown.
- Modern `cooldownRemainingMs: null` stays unknown and never falls back to total
  `cooldownMs`. Legacy viewer frames without `rpg` retain the documented old
  remaining-cooldown interpretation. The UI does not announce a successful cast,
  unlock or target effect based on a display reading.
- All bounded received JSON fields remain accessible, including party, talents,
  rescue, academy, equipment effects and future extensions. Fields not sent by the
  server are unavailable. Reading every supplied field does not manufacture full
  quests, effects, attributes or a private scoreboard the server did not publish.
- Inventory icons use copied, actual native ItemStacks after real vanilla mirror
  packets. They retain original item components and resource-pack models. An old
  observer inventory is not used as a fallback, and its camera/expiry epoch must
  still match. The optional server mirror must actually supply those native packets.

`hideObserverSidebar` is an explicit display choice for servers that otherwise
leave the observer's own sidebar on screen. It suppresses that native sidebar
only while the scoped client follows a player. It does not claim to reconstruct
an arbitrary plugin's missing target sidebar. Disable it if the server already
provides a correctly bound native target sidebar.

The v1 transport has no server sequence or observation timestamp. Diagnostics
therefore keep `serverObservedAt` null and report local receipt age and native
camera/connection epoch binding. This does not prove authoritative packet age or
arbitrary server-side A→B→A reorder protection. Do not claim those stronger
guarantees without an extended, verified server contract.

The payload is bounded to 64 KiB, depth 20 and 4096 JSON nodes, with per-object,
array and string limits. Invalid UTF-8, duplicate keys, foreign subject UUIDs and
invalid known numeric ranges are rejected. Diagnostics are opt-in, written every
five seconds, and contain only status, identity, counts and source metadata;
they do not contain full payloads, item contents, private chat or credentials.

HUD text is prepared on state changes and twice per second, without chunk reads,
background rendering workers or per-frame JSON parsing. Native client rendering,
GPU contention and actual stream capture still require separate measurement.

## YSM corner avatar

Use the core's existing optional `agent-mc-world/client-appearance` helper for the
installed, verified YSM version. Its explicit `followCameraInHud` setting selects
the actual camera player's existing model, pose, equipment and animation state.
An empty local appearance binding list can retain all server-selected models.
This HUD never guesses a model name or downloads/reassigns server appearances.

## Verification limits

The build report records source/input/output hashes, native hook verification and
offline protocol/display test results. Those results are not a real server login,
native Mixin application, screenshot, private-client compatibility guarantee,
visual model validation or end-to-end broadcast acceptance. Verify the installed
client and actual target switches independently.
