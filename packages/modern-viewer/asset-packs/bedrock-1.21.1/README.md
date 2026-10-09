# My Agent World · Bedrock model resources

The original Java/mod textures and geometry are versioned in [native-1.21.1](../native-1.21.1). This directory records the deployed conversion catalog and artifact fingerprints; it does not replace the browser's native assets with Bedrock carriers.

2026-10-09 deployment:

| Pack | Version | Variants | Bytes |
| --- | --- | ---: | ---: |
| maw-native-icons.mcpack | 1.0.2 | 732 static item icons | 451684 |
| maw-touhou-models.mcpack | 1.0.2 | 241 maid model/texture variants | 2869354 |
| maw-ysm-models.mcpack | 1.0.2 | 38 YSM model/texture variants | 1857594 |

Geyser has registered 279 custom entity definitions and confirmed both model packs in its resource download stack. Six YSM variants currently fit the player network Skin API; the remaining variants are resources for custom maid entities. Actual Bedrock phone login, download and rendering have not been accepted yet. Java animation controllers, equipment/backpack layers, first-person arms, moving world blocks and specialized mod GUI need separate adapters.

`model-catalog.json` maps each original model/texture ID to its Bedrock entity, geometry, original PNG SHA and source definition. The converter keeps original bones, cubes, pivots, rotations, inflation and per-face UVs, copies PNG bytes, and retains TLM's native additional-texture suffix. Original author and license metadata is preserved in the packs' credits definitions; upstream artwork keeps its upstream license.

Rebuild and maintenance instructions: [server resource guide](https://github.com/jcs130/minecraft-ai-friend/blob/experiment/agent-society-1.21.1/docs/MY-AGENT-WORLD-BEDROCK-RESOURCES.md). Converter and Geyser extension: `tools/maw_bedrock_modpacks.py` and `world/bedrock-models-src/` in that repository. The matched native asset manifest, exact mod JAR hashes and pinned Geyser JAR are required. The server constructs and distributes the three `.mcpack` files through Geyser; Java JARs are not sent to Bedrock clients.

The resource guide records 17 excluded source definitions and the remaining rendering/interaction limits. Keep source integrity, protocol binding and actual visual acceptance as separate results.
