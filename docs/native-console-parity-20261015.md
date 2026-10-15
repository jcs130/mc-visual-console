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
