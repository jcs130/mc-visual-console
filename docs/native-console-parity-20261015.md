# Native console integration, 2026-10-15

The reference image uses the legacy modern renderer in third person, with a
different player's server-provided skills/mana and a custom resource pack. The
current ag_NEKO vanilla 1.21.1 session uses the same-player native renderer and
was initially opened in dungeon mode. Its source had already been pushed; a
shared template alone did not install the shared layout and helper modules.

## Corrected integration

- Both entry points now use the docked toolbar, flowing rails, saved display
  settings and the same bounded chat history module. The native map and activity
  inspector participate in the shared display controls.
- Runtime details and operation history are available on demand, rather than
  occupying the middle of the scene by default. Camera-only controls stay separate
  from game actions; only one scene and existing authenticated game connection
  are used.
- History consumes the existing presentation sequence once; identity/epoch
  change, disconnection and disposal clear it. Search and private/raw categories
  remain local to the page.
- The photo gallery entry is shared. The native transport currently reports
  `AGENT_CAPTURE_PROVIDER_NOT_ATTACHED` with no images: the continuous spectator
  stream is not an Agent photograph and cannot prove model delivery.
- Skills and mana appear only when the identity-validated presentation actually
  contains those values. Server name, address, chat and profile labels do not
  enable them; loss/reset removes them. Ordinary Mineflayer is the default.
- Content-pack selection continues to require a verified capability profile,
  exact Minecraft version and matching registry/assets. An unknown mod registry
  never silently becomes vanilla. The ordinary vanilla test session does not
  establish live Qiandengji extension acceptance.

## Remaining differences

Shared controls do not make the two rendering engines identical. Original
lighting, every entity/animation/particle and native map interaction still have
the separately recorded gaps in the 1.21.1 feature matrix. Native night vision
remains explicitly unsupported; no approximate brightening is substituted.
The screenshot's blank map itself says terrain is not loaded. Its skill/mana
values and Naruto model are evidence about that connection, not ag_NEKO's vanilla
server or inventory. Neko source, SDK and global settings are outside this work.

Validation: 890 renderer tests passed with 13 conditional skips; 42 affected
upstream Java/appearance/observer tests passed. The original vanilla 1.21.1,
Java 1.21.1 and Java 1.20.6 packs passed every recorded file hash. Both Java
client bundles were rebuilt from the shared source. These are source/build
checks; consumer deployment and live acceptance are recorded separately.

## Consumer acceptance

The checked native source `4b59ce79` is deployed with core 0.5.2
(`3f7ec0c`), autonomy 0.1.46 (`54af304`) and thin plugin 0.5.29 (`44cfa8e`).
The served source fingerprint is
`072c75ac207604e4488f98e16eb749f2f24e52acef4b2616e34bbc14688947b5`;
the served console bundle is
`5da6f382f73a4694bef927876d991cec901f8fbf864691740e0477c924171402`.
It matches offline preparation in the consumer's working directory (esbuild's
emitted source labels also depend on the working directory).

The actual browser showed a single shared toolbar, docked native map and
activity inspector, real inventory icons, first-person hand/item rendering,
third-person following and the dungeon camera controls. Saved overhead camera
preferences were another cause of the reference difference; normal following
was restored. The activity visibility toggle and history open/close were checked.
Skills and mana remained hidden on the vanilla connection. Opening the gallery
returned the explicit unavailable-capture explanation. Browser warning/error
records were empty during these checks. This does not establish every entity,
animation, frame-rate target, Java pixel parity or live Qiandengji extension.

Core tests: 814 passed, including the rebuilt optional viewer. Both an isolated
viewer-enabled tarball and the exact committed engine-only tarball passed
source/runtime/declaration and disconnected SDK checks with network denied.
Autonomy source and isolated wheel: 409 tests each. Thin adapter: 58 Python and
4 browser-data tests, Ruff and official Release/Market structure checks passed.
The plugin archive contained 3,370 files, one autonomy 0.1.46 distribution and
no private runtime paths or copied host source. No release tag or Market
publication was performed.

Before and after normal executor stop/drain/start, all 5,273 tracked Neko files
had identical hashes and its Git tree stayed clean. The existing Neko main,
plugin manager, Qwen and Minecraft server process creation identities stayed
unchanged. Only the owned executor was replaced after an empty, known queue.
No main program/SDK source patch was made. The live session resumed; long-term
autonomous survival remains unaccepted, including its low-health/poor-food
planning observations, independently of these display and isolation checks.
