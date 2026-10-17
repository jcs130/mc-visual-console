# Terrain preparation and throttled painting

Terrain preparation yields after its existing four-millisecond work slice. That
yield is a task boundary (`scheduler.yield`, or a one-shot `MessageChannel`), not
an animation frame. Chromium can reduce RAF to approximately one callback per
second for an occluded window even while the document reports `visible`.
Previously every preparation slice waited for that paint cadence, leaving a
new scene with received terrain but no committed static meshes for a long time.

The default production scheduler regression freezes RAF and builds a real
`NativeTerrainQueue`/`NativeStaticStage` through 24 budget checkpoints. The old
implementation times out; the task scheduler commits without requesting RAF.
Existing retirement, epoch reset, pending-snapshot coalescing and atomic scene
replacement checks still apply. It does not alter source positions, geometry,
textures, visibility policy or the active complete scene during construction.

Offline scheduling tests do not establish browser FPS, complete scene parity or
deployment. Consumers must rebuild their pinned sources and record actual served
bundle hashes and live received/committed terrain separately.
