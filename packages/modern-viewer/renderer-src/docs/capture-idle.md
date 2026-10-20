# Dedicated still camera render control

Only pages with both `photo=1` and `capture=1` install the neutral
`mc-viewer-capture/v1` protocol at `globalThis.__mcCaptureControl`.
`setActive(boolean)` returns the acknowledged boolean and calls
`AppViewer.setRendering` when the state changes. It does not disconnect sockets,
drop world events, freeze JavaScript, change the action connection, or install
another render loop. Ordinary photo, viewer and OBS pages are unchanged.

The core camera activates before readiness/PNG capture and deactivates after.
It waits two animation frames on resume. The core owns idle browser timeout,
capture leases, cancellation and GPU launch preference. These are not decisions
for the shared renderer or the Agent's language model.

Dispose removes the protocol and cannot resume a disposed renderer. Build this
source into the consumer's pinned assets; source commits do not update live
deployments. Fidelity requirements for original Minecraft assets remain intact.

Offline acceptance (2026-10-20): the rebuilt Java 1.21.1 viewer rendered nine
fixture chunks on NVIDIA and AMD. In each dedicated camera, 700 ms of idle
produced zero new main-renderer frames; a yaw event still arrived, and the next
capture resumed drawing and reflected that yaw. An ordinary photo page exposed
no capture control and kept rendering. No actual game server, extra player,
Agent model call or production reload was involved. Full shared tests passed
with 1289 successful checks and 32 optional skips; the unrelated recipe default
count now includes the TridentItem GUI provider already admitted by 9a16dacf.
