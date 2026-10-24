# Native observation motion and third-person orbit

The Paper observation path reuses the same split already used by the Minecraft core/Cortico viewer: fast motion, independently scheduled terrain and HUD, and a camera driven after the displayed actor is updated. It does not add a Minecraft connection, a second animation loop, or Agent commands.

The earlier worker awaited a cloud permission renewal and publisher handshake in its 200ms sampling loop. That produced slow/irregular pose delivery even when the browser rendered well above 60 FPS. Keep authority renewal single-flight and asynchronous to an existing grant; expiry, UUID scope, removal, and late-source retirement remain mandatory. The host defaults to at most one local request per 50ms for up to four observed bodies. This is a limit, not proof of a measured 20Hz rate.

Fast motion carries a bounded same-body state (velocity, ground/stance and angles) and observed hand state. It excludes inventory, models, and terrain. Unchanged full Paper presentation is limited to 200ms; real inventory/health/selected-slot changes bypass that delay. An observed swing has its own stable token; unrelated wire packets cannot restart it. Original source models, motion freshness, epoch and body checks are retained.

The display buffer uses measured source spacing when SSE combines several received samples. Repeated full frames for the same motion tick update that row instead of inserting a false stationary interval. The bounded history supports the existing 500ms jitter buffer. No pose is extrapolated beyond the latest received state; unavailable or skewed source time uses arrival time.

Manual third person means orbiting the displayed target: translate camera and aim together as the rendered root moves, preserving drag/pan/zoom. A plain click must not silently select manual camera mode. Region mode remains a fixed world view. Automatic director shots still use the existing CameraDirector and collision logic; FOV, terrain authority and actor controls are unchanged.

Browser diagnostics are exposed as DOM data attributes on the native WebGL canvas: `motionCadence`, `frameGaps`, `frameCost`, and `cameraTracking`. Compare arrival intervals and source age separately from rendered frame gaps. A high render FPS alone does not demonstrate smooth motion delivery. Tests cover duplicate/batched samples, short yaw interpolation, manual orbit offsets, delayed grants/handshakes, cancellation, identity, and original NEKO/Kirito assets. Fixture replay and unit tests do not establish production or mobile performance.
