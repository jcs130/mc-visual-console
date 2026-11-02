# Independent background window (Minecraft 1.21.1)

Client-only MIT mod for an explicitly configured observer or background client.
It prevents mouse grabbing/centering at the original grab method, supplies
nonactivating GLFW creation hints, supports unfocused rendering, and requests an
actual framebuffer size. Fabric and NeoForge have separate JARs and thin bindings
around the same policy/runtime. No Agent, native director, core companion, server
plugin, network endpoint, model, keyboard injection or cursor warp is included.

## Install and opt in

Install one matching `mcvisual-window-0.1.0-fabric-1.21.1.jar` or
`mcvisual-window-0.1.0-neoforge-1.21.1.jar`. Fabric requires Fabric API and its
loader-provided MixinExtras. NeoForge uses its original embedded MixinExtras.
Neither library is bundled or downloaded by this mod.

Start Java with `-Dmcvisual.windowPolicyFile=<absolute-json-path>`:

```json
{"schema":"mcvisual.window-policy/v1","enabled":true,"freeCursor":true,"renderUnfocused":true,"avoidFocusOnShow":true,"backgroundFps":60,"framebufferWidth":1920,"framebufferHeight":1080,"revision":"1080p"}
```

Without a valid explicit configuration, the mod leaves the original window and
input policy alone. `freeCursor` prevents the original grab operation, including
after a screen closes; it does not repeatedly release, center or move the mouse.
This is suitable for a spectator/externally controlled body. Normal mouse look
requires `freeCursor:false`. Menus still use normal pointing and clicking.

`avoidFocusOnShow` applies GLFW creation hints. It never raises/activates a window
or alters another application's cursor capture. These startup flags need restart.
`renderUnfocused` disables pause on focus loss and uses the configured 10-240 FPS
cap while a non-minimized world renders; zero selects 60. Minimized, locked-screen
and disconnected remote-desktop rendering are not promised.

Dimensions are physical main-framebuffer pixels, with a maximum of 3840x2160
pixels in total. Resolution and FPS revisions hot apply; actual framebuffer size
confirms success. Fullscreen/iconified states defer or refuse resizing. Manual
resizing is reported rather than fought on every frame. Both dimensions zero
leave sizing unchanged. This does not change the native vision thumbnail budget.

## Independent or with a director

It works alone or alongside the information-card mod. No server mod is needed.
The existing NeoForge director 0.1.25 bundled an older implementation; **upgrade
that director to 0.1.26 before co-installing** this separate window mod. Metadata
rejects the conflicting 0.1.25 combination. Starting with 0.1.26, the director
contains no window runtime, hooks or policy; install this mod separately when
background/free-cursor behavior is desired. The JVM configuration key and
`diagnostics/mcvisual-native-window.json` remain compatible. Fabric's existing
director can be combined with its matching standalone window JAR.

## Build and checks

```text
node tools/native-client-window/build.mjs --loader fabric --game-dir <matching-Fabric-1.21.1-profile> --java-home <JDK21> --output-dir <private-output>
node tools/native-client-window/build.mjs --loader neoforge --classpath-report <json-with-classpath-array> --java-home <JDK21> --output-dir <private-output>
```

The JSON is simply `{"classpath":["original-minecraft.jar","original-library.jar"]}`;
it is not an SDK installation or a framework dependency. Any `artifact` field is
excluded, as are known director/core artifacts. The builder uses original local
Minecraft/loader libraries, compiles tests independently against the finished JAR,
and records source hashes, library input paths and the output digest. The production JAR contains only this component
and MIT notice, not its test classes, third-party libraries or an Agent host.

Each loader passes 22 policy/source and packaged-consumer checks. Both packages
were actually loaded in isolated disconnected clients without a core companion,
director or Agent framework. The transformed mouse/window/renderer hooks, actual
960x540 framebuffer, normal ungrabbed cursor, unfocused state and advancing real
render-frame counter were checked; both test clients were then closed. Those
title-screen results do not replace in-world, minimized or live acceptance.

An explicit `-Dmcvisual.windowOfflineCheck=true` writes
`diagnostics/mcvisual-window-offline.json` on the disconnected title screen. It
verifies actual transformed hook methods without calling the mouse-grab operation
or injecting input. Normal diagnostics contain only dimensions, focus/capture
state, counters, configuration revision and error categories. Reads do not create
render frames. No screenshot, chat, model prompt or credential is recorded.
