# Authenticated native Web spectator

The portal serves the existing Three.js console using its own trusted build.
`host/spectator-relay.mjs` tunnels only read-only JSON/SSE and original
PNG/mcmeta/GLSL/OGG resources from an already running loopback native host.
The publisher never creates a Minecraft connection, controller or model loop.

Build the trusted site with `node tools/build-native-spectator-site.mjs <dir>`.
`loadSpectatorSite(dir)` verifies the fixed HTML/JS/CSS hashes. Deploy backend
modules as operator-controlled source; do not execute JavaScript uploaded by a
publisher or imported from a user-writable asset directory.

`createSpectatorRelay({WebSocketServer, site, authorizePublisher, authorizeViewer})`
returns `http(req,res)`, `upgrade(req,socket,head)`, `state(channelId)`, `close()`.
The publisher hook returns the channel's actual `playerUuid`; viewer authorization
uses the website session and actual ownership, never a nickname or `ag_` prefix.
The complete view currently permits only owner/admin. Public JPEG permission
does not imply permission to expose inventory, menus or private chat in 3D.

`startSpectatorPublisher({sourceUrl,portalUrl,channelId,token})` uses Node22's
WebSocket and only an explicitly configured numeric loopback HTTP source.
Remote portals require HTTPS/WSS. The existing `pub_` token is in the first
authenticated frame, never the URL, renderer or logs. The connection uses the
site's existing HTTPS443; there is no new public MCP/RCON/game control service.

Routes are `/watch/:id/` and `/api/v1/live/:id/source` (WebSocket). Both browser
bundles must match the source hashes. Native SSE retains the original body's
identity, epoch and sequence; no renderer registry or item ID approximation is
introduced. Binary transfers use request ID, monotonic chunk sequence and one
acknowledged 64KiB chunk per request. There are at most24 active source reads,
256 bounded queued requests, 4 SSE viewers per source, 64MiB per finite resource,
and header/read/authentication deadlines. Every5seconds the portal rechecks
publisher credentials and active viewer sessions; revocation closes the stream.

The site build scopes CSS texture URLs to `/watch/:id/`. Animation `.mcmeta` and
original GLSL are resources too, not optional placeholders. A successful HTTP200,
sky-only frame or a model count of0 is not rendering acceptance.

For unprojected Java1.21.1/Paper, `host/vanilla-mineflayer.mjs` is a separate
optional SDK adapter. It attaches before login to the action bot and requires
the original vanilla1.21.1 registry. Modded projection gateways must continue
using `host/native-mineflayer.mjs` and their own matched native assets. The
vanilla adapter explicitly rejects the modded native-packet channel.

The Paper consumer supplies genuine `mcagent:state`/`mcviewer:state` receipts.
Registration waits for PLAY and the actual entity: an offline UUID can exist
before login and cannot authorize a PLAY custom_payload during handshaking.

`asset-packs/qiandengji-gui-1.21.1` supplies six explicitly matched original GUI
assets. The host activates the same verified catalog ID automatically, avoiding
a second manual activation setting. This is a GUI extension, not a claim that
all custom held models or complete Java pixel parity are implemented.

Acceptance on2026-10-22 used a real same-UUID Paper1.21.1 SDK connection, real
website Cookie login, terrain and avatar WebGL,46inventory slots, all occupied
hotbar images, six catalog-image decodes, preserved iframe across polling, and
logout/ownership/publisher revocation. The local real portal was isolated from
production accounts. Full scene parity, all mod GUIs and every remote consumer
remain separate acceptance work. Private packets/worlds/credentials/screenshots
and generated site bundles stay outside Git.
