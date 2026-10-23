# Read-only Paper observation source

The `host/paper-observation.mjs` adapter attaches the existing modern native
viewer to an authenticated Paper 1.21.1 scene exporter. It does not create a
Mineflayer client, player or game connection. The website remains responsible
for UUID ownership, browser sessions and expiring publication leases.

`preparePaperObservation(options)` uses the same original asset manifest,
native registry, fixed browser/console builds and server-item catalog as
`prepareNativeWorldPreviewHost`. Its `attach` accepts the original player UUID,
name, `minecraft-data` registry, native packet decoder, NBT simplifier and
`scope` (`owner` or `scene`). The returned object exposes `listen`, `ingest`,
`host.status`, `url` and `close`; none are gameplay actions.

Each receipt must contain the exact UUID/name/entity ID, world UUID/dimension,
pose, a generation UUID and monotonically sequenced base64 native packets.
Initial generations require original configuration registry packets. Duplicate
observations are ignored; missing sequences, foreign identities and unsupported
packet types fail closed. `paper_server_observation` is an explicit source
mode: the old same-player and Numen mode/epoch/registry checks remain intact.

The Paper exporter includes actual vanilla biome hashes and villager builtin
registries. Raw world seeds are not needed. Keep the original block/item IDs
and complete SNBT; a translated Mineflayer registry is not a native resource
registry. Missing custom skin/model inputs remain unavailable rather than
silently rendering another body.

`scene` omits the full inventory, menus and private messages. It can still
show the visibly held pair through an independent UUID/entity-bound equipment
contract, without fabricating a complete empty inventory. `owner` retains the
complete inventory-0 snapshot. Server-observed swing and eat/drink timing have
a separate explicit source; full Java animation/pixel parity is not implied.

First-person, third-person follow, 3D camera rotation/zoom, minimap and camera
settings use the existing pages. The passive publisher/relay checks the same
browser and console bundle hashes. Rebuild/freeze both sides together; updating
source alone does not update deployed resources.

Verification: `node --test tools/test/paper-observation.test.mjs` covers source
identity, sequence/registry boundaries, public inventory filtering, visible
equipment, exact inventory ownership, generation reset and original biome
inputs. Real Paper/browser evidence is maintained by the consuming server;
unit tests are not proof of complete scene parity.
