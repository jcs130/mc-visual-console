# Stable entity lighting with viewer night vision

The native renderer projects `playerState.reactive.ambientLight` into the Three.js
ambient light when server time changes. The viewer's night-vision blend adds a
brightness contribution on a 250 ms timer. Previously, these two writers could
alternate: a native update removed the contribution until the next blend tick.
Entity Lambert materials darkened while the terrain lightmap remained bright.

The biome adapter now reapplies the current projection at the scene's render
boundary, after any previously installed callback. The timer still advances the
blend and terrain lightmap. Both paths use the same calculation; the native base
value is never modified. Night vision off preserves a base value of zero, missing
base light remains unknown, and teardown restores only callbacks still owned by
this adapter. Existing occlusion and visibility callbacks continue to run.

`tools/test/viewer-night-vision-light.test.mjs` interleaves native writes and
draws between timer ticks, checks zero/off behavior, and verifies callback
composition and cleanup. A controlled live browser reproduction changed only
the local lighting state and restored it immediately; it issued no game action.
This reproduces the lighting race, but does not establish that every reported
avatar disappearance or complete Java scene parity has been resolved.
