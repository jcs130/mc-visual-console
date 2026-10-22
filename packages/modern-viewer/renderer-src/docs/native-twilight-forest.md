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
| Ore meter | Actual loading component, original icon overrides, scan counts/translation keys, signed chunk coordinates and Chinese HUD text | Scan contains chunk totals, not individual ore positions; browser text/layout is not Java font/pixel parity; original use rejects Numen FakePlayer |
| Traveller gear | Same-connection configuration definitions, original registry order, component predicates, broken icons and original overlay PNGs/scales | Live modified/broken boots verified; worn armour and every combination are not certified |
| Mason jar | Original block body, original 40-lid mapping, actual slot-zero contained item and JARRED/FIXED transform | Live oak-lid/diamond icon verified; unsupported nested renderers fail explicitly; placed-jar wobble/contents are not ported by this GUI provider |
| Other TF content | Original resources exported and hash-checked | Other bosses/creatures and special rendering still require dedicated adapters |
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

## Dynamic items and language resources, 2026-10-23

The host now observes `twilight:travellers_modifiers` from the action account's
configuration packets, binds it after login to that account UUID, and clears it
on reconfiguration/disconnect. The private presentation allowlist explicitly
retains this field. No guessed default registry or second body supplies it.
Component predicates follow the installed bytecode: built-in abilities do not
produce insertable overlays; missing modifier sprites do not consume a layer.
Original `float32(1 + float32(layer * float32(.001)))` scaling is retained.

`minecraft:container` now recursively resolves original native IDs and complete
component patches through the same connection, preserving sparse slots and
64-bit values with depth/item/byte budgets. `ItemContainerContents.copyOne()`
reads slot **zero**, not the first nonempty slot. An unsupported contained item
is unavailable rather than being silently omitted from the jar picture.

The ore scanner sends description keys such as `block.minecraft.dirt`; rejecting
them as resource IDs lost real scan data. The adapter preserves these keys and
full signed longs. A real scan in the isolated world returned 452 dirt blocks
out of 72000 blocks and the HUD displayed 0.628%, using original float32 maths.
No operation bypasses the original OreMeterItem's exact-ServerPlayer use check.

Language files have stacked **per-key merge** semantics. A mod's 71-byte
`assets/minecraft/lang/en_us.json` supplement must not erase vanilla's 434381-byte
dictionary. The reader validates every original variant's SHA/size separately;
the language merger only resolves proven vanilla-below-mod priority. Conflicting
keys between mods remain explicit, and ordinary model/texture priority guards
are unchanged. The matched release additionally includes the audited Mojang
`zh_cn` object (SHA256 `10da480179ef720771e27aebec6f33a6d4cec5063401310ceb82bb576a6b7af0`).

Original class audit: ClientLanguage `8937956cad957291b963ab2b86b79a4300f0e527e66c68f18f9e1001fc833d1b`;
TravellersEntryModifier `6f2380230f194e2b073006fc9402f2e7e13535082ec00f016bf6d7939d18bd76`;
TFEnumExtensions `edc8fba1a312372da7b00761036edde131b3f24302a34ada7c88f495e834462f`.
JARRED's original fallback is FIXED. Source/geometry verification still does not
certify Java reference-frame parity or Bedrock support for these dynamic UIs.

Real headless WebGL accepted the modified boots, filled jar, original meter
icons, loading-to-results transition and inventory images without page errors.
The first attempts exposed missing recursive container conversion, a filtered
registry field and the missing original language dictionary; those failures are
retained in private QA evidence. A previous diagnostic stick carried an unrelated
`twilightforest:skull_candles` component and correctly remained explicitly
unavailable; it was reconciled to an ordinary stick in the isolated QA inventory,
with the original full diagnostic stack retained. Do not loosen unknown visual
component admission just to hide a diagnostic fixture.

The dynamic-item consumer package is prepared separately at
`E:/MC/integrations/fom-twilight-items-20261023/renderer` and its matched `assets`.
Use that release's disabled `client.example.json`; existing clients/sites must
explicitly switch both paths. The transport/game mod set is unchanged, so this
renderer update does not require restarting the Java server or Bedrock gateway.
Immutable shared asset files may be hardlinked between these two releases;
never edit them in place. The new manifest and added language file are separate.
