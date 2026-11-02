# Client content stream (Minecraft 1.21.1 / Fabric and NeoForge)

An independent, client-only MIT mod for custom content over WebSocket. It does not
require a server mod, Cortico, N.E.K.O., an Agent SDK or the native director companion.
The provider owns meaning and public content; this mod only draws bounded panels.

The first primitives are text rows, status colors, recent-event rows and numeric
progress/probability bars. There is no HTML, JavaScript, URL image fetching, game
input, arbitrary RPC or model loop. Multiple roles can publish the same contract.
World-space routes/markers and interactive widgets are not implemented in this
first version; the existing Web renderer retains those features independently.

## Explicit activation

Install the **one** matching `mcvisual-content-0.2.0-fabric-1.21.1.jar` or
`mcvisual-content-0.2.0-neoforge-1.21.1.jar` in the actual client's mods.
Fabric requires Fabric API. The two JARs use the same transport, scope, expiry and
layout implementation; loader-specific code only reads the original scene and
draws through the original GUI. Neither version needs the background-window mod.
Start Java with `-Dmcvisual.contentConfig=<absolute-config-path>`:

```json
{"schema":"mcvisual.content-config/v1","enabled":true,"endpoint":"ws://127.0.0.1:18584/content"}
```

That file is configuration only. Content and subscriptions travel over WebSocket,
not through files, screenshots, Minecraft chat or S2C plugin channels. Without an
explicit valid configuration there is no connection or endpoint discovery.
Plain WS is restricted to loopback. Remote endpoints must use WSS; optional
`bearerEnv` names the environment variable for an Authorization Bearer header.
Never put credentials in the URL. The provider must authenticate remote clients;
an asserted UUID alone is not remote authorization. Redirects are disabled.

## Stream contract v1

The client subscribes using actual camera/world identity:

```json
{"schema":"mcvisual.subscribe/v1","sequence":1,"scope":{"instanceId":"client-instance","epoch":4,"server":"example:25565","recipientUuid":"11111111-1111-1111-1111-111111111111","subjectUuid":"22222222-2222-2222-2222-222222222222","entityId":42,"dimension":"minecraft:overworld"},"subjectName":"Agent","capabilities":["panels/v1"]}
```

`instanceId` is generated for this mod instance. `epoch` advances when the original
world, connection or camera entity changes. Leaving the world unsubscribes and
disconnects. A target switch clears the old panels before the new subscription.
`subjectName` is a display hint, not an authorization key. Producers match explicit
trusted sources by UUID; they must not construct paths/URLs from client labels.

The provider echoes the exact scope in a complete presentation frame:

```json
{"schema":"mcvisual.content/v1","scope":{"instanceId":"client-instance","epoch":4,"server":"example:25565","recipientUuid":"11111111-1111-1111-1111-111111111111","subjectUuid":"22222222-2222-2222-2222-222222222222","entityId":42,"dimension":"minecraft:overworld"},"producer":"host-session","sequence":1,"issuedAt":1700000000000,"expiresAt":1700000003500,"panels":[{"id":"activity","title":"Agent · 当前行动","anchor":"bottom_right","width":220,"bottomInset":58,"rows":[{"label":"最近操作","text":"5秒前 · 已受理 · 任务#42","tone":"active"},{"label":"快决策 82%","text":"保持当前动作","tone":"info","progress":0.82}]}]}
```

Timestamps are example milliseconds and must be current when sent. Maximum TTL is
6 seconds; the shared producer uses 3.5 seconds. Actual expiry uses a monotonic
clock after acceptance. Receiving or reading old frames cannot refresh a deadline.
Sequence numbers must increase for the producer and current scope. Wrong subject,
world, recipient, entity or instance is rejected atomically. After stop, delayed
connection/projection callbacks cannot repopulate the display.

Frames have a 32 KiB UTF-8 limit, at most 3 panels in distinct corners, 8 rows per
panel/16 total, 72-character titles, 24-character labels and 220-character text.
Panel widths are 100–260 GUI units and additionally fit within one third of the
actual canvas. Progress is a finite number from 0 to 1. Empty panels clear the
display. Unknown/executable fields and duplicate JSON keys are rejected by the
client. Native GUI/F1 hiding is respected. The mod never claims text as game truth.

## Reuse from a host

Public exports `mc-visual-console/client-content` and `mc-visual-console/agent-content`
provide TypeScript contracts, the stream server and an optional public Agent-card
projection. Inject the host's existing `ws` WebSocketServer class (tested with
8.21.1); no extra dependency is bundled or silently installed.

```js
import {createServer} from 'node:http';
import {WebSocketServer} from 'ws';
import {createClientContentStream} from 'mc-visual-console/client-content';
const server=createServer((req,res)=>res.writeHead(404).end());
const stream=createClientContentStream({WebSocketServer,server,
  authorizeScope:scope=>allowedRecipients.has(scope.recipientUuid),
  getPanels:({scope,signal})=>publicPanelsFor(scope.subjectUuid,signal)});
server.listen(18584,'127.0.0.1');
// Shutdown: await stream.close(); then close the HTTP server.
```

The host may attach the upgrade handler to its existing HTTP server. The helper
has a four-client cap, explicit path, bounded subscriptions, newest-scope-only
projection, cancellation and socket backpressure. No content endpoint or model
service is scanned. The optional Cortico log adapter is under `hosts/cortico/`,
separate from this native mod and generic contract. Other hosts can supply public
Agent activity records or arbitrary normalized panels directly.

`agentActivityPanels` omits reasoning transcripts, hides common credentials and
uses actual public phase/decision/tool/execution records. A selected/dispatched
action is never promoted to goal completion. Accepted/running/unknown states stay
distinct; recent rows retain source age. Missing public goals remain missing.

## Build and verification

```text
node tools/native-client-content/build.mjs --loader fabric --game-dir <matching-Fabric-1.21.1-profile> --java-home <JDK21> --output-dir <private-output>
node tools/native-client-content/build.mjs --loader neoforge --classpath-report <json-with-classpath-array> --java-home <JDK21> --output-dir <private-output>
```

The NeoForge classpath contains the original Mojmap 1.21.1/NeoForge libraries;
Fabric uses its original matching intermediary client and Fabric API cache. The builder
does not add the report's companion artifact, extract Cortico source, patch other
mods or fetch dependencies. Source and independently compiled JAR consumers run
40 scope/expiry/presentation checks for each loader. `ContentRuntime` also runs
from each finished JAR with only JDK21/Gson and a fake scene/drawing platform;
no Minecraft or loader classes are present in that fixture runtime. Those tests
use real loopback WebSockets for target/world changes, render suppression, expiry,
disconnect/reconnect, cancellation during a pending HTTP upgrade, and stop without
revival. Unconfigured clients do not create a connection. Public declarations have
an independent consumer check. This is separate from real GUI/pixel acceptance.

`diagnostics/mcvisual-content.json` records only version, counts, context and actual
draw rectangles/times. It is diagnostic metadata, not a content input or archive.
No prompts, widget text, auth headers or bearer values are written there. Real
runtime results, backups and captures belong in the deployment's private audit.

The standalone 0.2.0 packages were separately loaded on disconnected Fabric and
NeoForge title screens with the independent window mod and original loader/API
dependencies, without a director, core companion or Agent framework. This checks
real loader binding; it is separate from in-world HUD pixels or live deployment.
See [the module matrix](../../docs/client-modules.md) for optional combinations.
