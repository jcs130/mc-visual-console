# Twilight Forest 1.21.1 native rendering

This adapter targets the installed `twilightforest-1.21.1-4.8.3345-universal.jar`, SHA-256
`493da16d10210f9f53a3c33b3d8fcb4ae9b14016ee420d753c894562bd9aba35`.
Use the action account's original registry and network stream, before vanilla projection.
It does **not** certify complete modpack rendering or Java pixel parity.

| Content | Implemented and verified | Remaining boundary |
| --- | --- | --- |
| Item components | All 47 original TF codecs have persistent converters, including block IDs, attributes, magic-painting registry and recursive item display | Missing registry context or unknown nested component is an explicit error |
| Glass sword | Both original PNG layers, including fractional transparency, actual component patch retained | Enchantment glint and held contexts retain their own support checks |
| Greater/brittle flask | Original model overrides, doses, breakage and potion tint; actual browser decoding | Unported custom potion colors remain unavailable |
| Ordinary items | 95 exact vanilla constructor factories audited from original TFItems bytecode | A provider registration is not 95 individual browser certificates; custom components still need support |
| Uncrafting table | Original translucent GUI icon; exact 56-slot native menu, original GUI PNG, distinct inventory/recipe previews | Original wire menu omits XP-cost data; UI reports unknown, not a fabricated cost; custom cycle controls not yet interactive |
| Naga | Original head/body LayerDefinitions, actual multipart IDs, absolute poses, original textures, metadata and tick interpolation | Actual WebGL fixture had AI paused; no autonomous combat, Java reference comparison, fire/outline/name effects or all-boss certification |
| Other TF content | Original resources exported and hash-checked | Other bosses, ore meter GUI/loading, jar item display and traveller overlays still need dedicated renderers |
| Bedrock | Separate server bridge already has static items/block-state mappings | This Web/Three.js change does not implement TF Bedrock boss actors or Uncrafting forms |

## Original model export

`PrepareTwilightOfflineBake.java` prepares a **tool-only** class overlay. It applies
the two original NeoForge access-transformer field permissions and omits one
mod-container BeanContext initialization. It never changes model factory bytecode
or the installed server JAR. `ExportTwilightModelLayers.java` reads original
registration factories and invokes `LayerDefinition.bakeRoot()` on the matched
client/NeoForge classpath. Keep source JARs, classpath and export provenance.

The audited artifact contains 100 original layer groups. The NOOP zero-size texture
layer is explicitly unavailable. MosquitoSwarm's original factory uses unseeded
randomness: a new export is not guaranteed to have the same whole-file hash.
The current adapter pins the audited artifact hash
`56dcd09468a6440b15d5258394d90da4a4d18dd9773a772dffc8149978eaf2a2`.
Do not silently accept a different bake or claim all 100 layers have live actors.

Install it with the server builder's `--twilight-layers` option; the manifest entry
records the original JAR and export provenance. JARs and extracted TF assets stay
in the private matched release; respect the upstream non-code asset license.

## Live acceptance, 2026-10-23

An ordinary non-OP Mineflayer account used one action connection in an isolated
world. Its actual original Uncrafting window was opened through `bot.openBlock`;
normal `bot.clickWindow` inserted and returned the same wooden pickaxe. Full
before/after SNBT matched. Recipe previews are never exposed as acquired items or
fake inventory slots. The browser displayed the original GUI, all five occupied
recipe preview icons, glass sword, flasks and table icon, without page errors.
The real Naga stream included its 12 body parts and correct world camera anchor.

These were scripted tests with disclosed operator-supplied fixture materials and
zero model calls, not autonomous survival or a complete dungeon playthrough.

The isolated gateway additionally passed a 16-minute default-client-timeout soak:
99 distinct frontend heartbeats sent and acknowledged, eight backend heartbeats
acknowledged separately. Frontend and backend nonces must never be cross-forwarded.
This proves transport liveness, not game tick performance.

Failed camera-origin, missing async preview refresh, older dependency/asset
fixture mismatch and first heartbeat wire-type attempts were retained privately.
The accepted wire heartbeat uses the actual protocol codec's BigInt i64 type.

Run the shared suite normally; `NATIVE_GUIDE_ASSET_DIR` and `NATIVE_YSM_ASSET_DIR`
default to their version-specific checked-in test assets. Set only
`TWILIGHT_NATIVE_ASSETS` to the exact private FOM asset export for TF integration
tests. Pointing all fixture variables at FOM does not make old-version fixtures
interchangeable. Never relax source verification to hide such mismatches.

## Consuming release

FOM published the frozen source `5f230d2c` on 2026-10-23 at
`E:/MC/integrations/fom-twilight-compat-20261023/renderer`, with its matched
`assets` directory and disabled `client.example.json`. All 67188 asset/variant/
registry files passed their SHA checks. The registered server and Bedrock owners
were normally stopped, backed up on two drives and restarted with new gateway
pointers; the game JARs and Bedrock resource packs were unchanged.

The production action connection rendered original terrain, its character and
own starter-book icon in a real headless WebGL browser without page errors.
The default-timeout LAN connection and same-UUID/full-inventory reconnection also
passed. The temporary test viewer is closed; remote clients and the website must
explicitly consume the new frozen release. This is not proof that every consumer,
the phone GPU or all mod content has been updated or accepted.
