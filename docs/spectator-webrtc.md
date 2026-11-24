# Optional WebRTC spectator transport

The native browser viewer can receive its existing state events through a reliable, ordered WebRTC DataChannel. This is opt-in and read-only. The same publisher, player UUID, registry, world and renderer/asset identity checks remain in use; it does not create another Minecraft connection, replace original models with vanilla approximations, or send player input.

This first stage covers **browser ↔ portal relay**. Publisher ↔ portal still uses the existing authenticated WSS connection. Textures, models, sounds and other assets still use scoped HTTPS requests. This is not end-to-end peer-to-peer Minecraft, video streaming, or a claim of lower public-network latency. Ordered reliable delivery can still stall behind a large update. Motion separation and congestion measurements are later work.

## Enable in the host

Keep the current `authorizePublisher` and `authorizeViewer` callbacks. Inject a compatible peer backend explicitly; the library does not install a WebRTC runtime or configure firewall ports automatically. `werift@0.26.0` was exercised in the transport tests. For example, in the generated portable spectator site:

```js
import { WebSocketServer } from 'ws'
import { RTCPeerConnection } from 'werift'
import { createSpectatorRelay } from './spectator-relay.mjs'

const relay = createSpectatorRelay({
  WebSocketServer, site, authorizePublisher, authorizeViewer,
  sharedStreams: true,
  webRtc: {
    iceServers, // host-approved STUN / short-lived TURN configuration
    createPeerConnection: () => new RTCPeerConnection({ iceServers }),
  },
})
```

`iceServers` is an explicit host configuration used by both ends. Check the chosen backend's own defaults: Werift may use its default public STUN service when given an empty list. Do not copy the test fixture's loopback-only ICE settings to a public deployment. Public operation still needs reachable ICE candidates and possibly TURN; testing a loopback connection does not establish NAT reachability. TURN credentials should be short-lived. Existing authenticated HTTPS signaling remains mandatory.

Serve through the existing relay HTTP/upgrade handlers. A relay with WebRTC enabled adds a `native-viewer-transport=webrtc-v1` HTML meta marker. Older hosts and standalone viewers omit it and keep SSE without probing a nonexistent RTC route. Build and deploy the **matching browser and host artifact** with `tools/build-native-spectator-site.mjs`, preserving existing trusted build validation. Enabling source code in Git does not update a running website.

## Contract and failure behavior

- Authorized `GET /watch/:channel/webrtc` returns capabilities. Same-origin JSON `POST` at that route accepts one data-only SDP offer with `X-Mcvisual-Transport: mcvisual.sse.v1`, then returns an answer. Third-person/overview prefixes use the same scope rules. Credentials are not copied into SDP or state messages.
- One reliable ordered channel, label `mcvisual.events.v1`, protocol `mcvisual.sse.v1`. Binary messages are at most 16 KiB, containing the original UTF-8 SSE event stream. UTF-8 and event boundaries may cross messages. A complete event is limited to 16 MiB; SDP to 64 KiB, request JSON to 72 KiB. Oversized, invalid or unexpected inbound traffic closes the peer.
- Browser keeps SSE while negotiating, switches only after a fresh RTC identity, and ignores late old-SSE packets. A failed/stale RTC stream falls back to the same authorized SSE route once; no game action is replayed. 401/403 is terminal. Each new stream still passes the existing identity/epoch/state validation.
- The existing fanout performs owner/public-scene projection, ordered bootstrap, queue limits and slow-viewer removal. RTC has at most `maxViewers` peers per source (default 4), bounded pending offers and 256 KiB plus one 16 KiB chunk in its backend send buffer. An SSE connection temporarily overlaps its RTC replacement and counts toward fanout admission; at capacity an upgrade can safely remain on SSE.
- Server handshake deadline defaults to 12 seconds (configurable 50–30000 ms); stalled output to 10 seconds (50–30000 ms). Browser negotiation is bounded to 15 seconds, with a 12-second event idle limit. Regular source frame/state events keep a quiet healthy scene alive; a source that sends nothing for that period returns to SSE.
- Permissions are checked before peer allocation, before the answer, at subscription and on the relay's existing periodic check (default 5 seconds). Revocation, publisher departure or source replacement terminates the affected RTC connection. A public stream cannot receive owner-only Agent data.
- `relay.state(channelId)` includes WebRTC peer/connected/byte counters when enabled. The rendered canvas `dataset.eventTransport` reports `sse`/`webrtc`, phase and failure reason for diagnostics. No SDP, credentials or private payloads are logged by this transport.

Set `webRtc: null` (the default) and rebuild/restart the host to disable new upgrades. Retiring a source or closing the relay tears down existing peers. SSE remains the compatibility path.

## Reproducible verification

Run the normal renderer tests. The new codec/browser-adapter and relay tests use controlled fake peers for deterministic deadline, backpressure and permission cases. Real transport tests are separately enabled with an explicit backend package path:

```text
MCVISUAL_RTC_TEST_BACKEND=/absolute/path/to/isolated-backend/package.json
node --test packages/modern-viewer/renderer-src/tools/test/spectator-webrtc-wire.test.mjs
```

The isolated package must contain `werift@0.26.0`. Without that environment variable the two wire tests explicitly skip; with an invalid path they fail. They exercise actual ICE/DTLS/SCTP, multi-chunk Chinese item/state data, scope filtering, source close and grant revocation, over real publisher WSS-style WebSocket and HTTP relay handlers. CI explicitly installs the pinned test backend in a temporary directory and runs them.

2026-11-07 local evidence: 71 focused tests passed with no skips, including the two real wire tests. The complete renderer tools suite passed 1606 tests with 43 conditional asset skips, including an actual portable site build/import. A separate headless Edge fixture passed 8 checks for upgrade, exact large-state bytes, one shared upstream, forced RTC failure → SSE continuation, revocation, public filtering, legacy fallback and no page errors. These are synthetic state-transport checks, not real Minecraft gameplay, mobile/NAT performance, or full renderer parity acceptance. Production WebRTC remains disabled until a matching host deployment and public-network validation.
