# Recovering a terminated observation stream

Browsers retry an EventSource while it is CONNECTING. A temporary HTTP 404 or
503 during source replacement can instead leave it CLOSED. Clearing the scene
on error without creating a new stream then leaves an otherwise healthy world
waiting for terrain until the user refreshes.

`native-event-stream.js` preserves native retries and handles CLOSED separately.
It probes the same authenticated status route without cache, then creates a new
read-only event connection when available. Backoff increases from one to ten
seconds; only one probe and retry timer can exist. HTTP 401/403 stop recovery.
Closing a view aborts pending reads and ignores late replies and old messages.
The relay also preserves an explicit `SPECTATOR_SOURCE_OFFLINE` 503 from a
consumer which has already verified role access. Other authorization failures
remain 403. This prevents temporary source replacement from masquerading as
permission revocation, without revealing private role state to an unauthorized viewer.
No gameplay input, command, inventory operation or attack is retried. The native
session still requires a fresh identity, matching registry and current snapshot.

The scene uses this transport for first/third/free views. Build changes still
close it and invoke the existing checked reload path. Models, camera settings,
terrain culling and original animation sources are unchanged.

Ten transport tests cover terminal versus native reconnects, 404/503/offline,
backoff, authorization denial, disposal, timeouts and stale messages. A real
browser fixture also recovered from interrupted SSE and repeated 503 to a new
epoch without refreshing, then stopped after authorization was revoked. The
fixture does not connect to Minecraft. Full renderer tests: 1315 passed,
39 existing conditional skips. This source is a candidate until matched host
and website deployment is recorded by the consumer.
