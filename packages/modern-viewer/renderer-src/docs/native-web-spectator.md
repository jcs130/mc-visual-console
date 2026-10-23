# Authenticated native Web spectator

## 2026-10-24 loading and original player appearances

Cold model dependencies prefetch through eight bounded chains. Manifest-checked
Minecraft resources (at most 256 files of 64KiB) reuse a hash-addressed browser
cache across role switches. Cache hits are rehashed; live/auth/inventory data is
never persisted there. Block instances omit only original `cullface` faces behind
confirmed full opaque neighbors; rotations and exact remaining UVs are retained.
Missing boundary biome data rejects only that block, not its entire material group.

`preparePaperObservation({surfaceCulling:true,appearanceSource})` additionally
removes cropped underground shells and sealed caves. Known open cells are flooded
from received sky and the actual observer's feet/eyes; unknown, partial and
transparent blocks do not become occluders. Native hidden-state runs remain
lossless. This option defaults off for existing native/modded hosts. It is a
conservative connectivity filter, not a claim of perfect screen-space occlusion.

An optional read-only appearance source supplies `binding({uuid,entityId})` and
`read(bundleSha256)`. Paper's actual observed body binds the original YSM2.4.1
bundle or configured skin. The browser verifies whole-bundle and per-file hashes;
expired/mismatched source state is unavailable. This is separate from the native
YSM2.6.5 integration; neither a folder name nor a missing model authorizes Steve.
Original movement and held-item providers are reused. Full animation/client pixel
parity and unsupported nearby-player renderers are not implied.

New relays advertise optional `gzip-chunks-v1`: independent level-three gzip
chunks for JSON/text/SSE, each bounded to 64KiB after decompression. PNG/OGG stay
unchanged. Legacy peers keep identity transfer. Authentication, hash checks,
read-only routes and backpressure are unchanged. Website proxies should also
compress JavaScript, JSON and CSS; test streaming flush if compressing SSE.
This existing HTTPS/WSS path needs no extra ICE/TURN service or home public port.

Validation: 147 related Node checks (including the deployment's real1.21.1
metadata codec), real NEKO/Kirito original geometry and walk/arm resources, and
the existing live NEKO observation in WebGL. Deployment consumers must rebuild
and independently verify their served page; local success is not publication.

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

### Manual camera on a new body (2026-10-24)

Manual orbit can be restored from the viewer's saved settings before terrain
or the player pose arrives. Initialization now remains pending until that first
real pose, and resets on an identity/epoch change. Subsequent frames preserve
the viewer's drag/zoom. This also works when the custom avatar is unavailable;
the camera uses the authenticated body's pose and never fabricates a model.
The loading screen stays visible until terrain for the current epoch commits,
instead of disappearing as soon as inventory/HUD data arrives. Consumers must
rebuild both trusted browser bundles and the source host from this revision.

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
