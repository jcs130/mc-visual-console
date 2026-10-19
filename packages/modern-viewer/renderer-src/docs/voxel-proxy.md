# Versioned voxel proxy for an image/video editor

`src/modern-viewer/voxel-proxy.html` renders a bounded `agent-mc-voxel-scene/v1` export. It uses the existing original Java 1.21.1 compiled block-state definitions and their **paired** texture atlas. `voxel-proxy-catalog.mjs` selects property variants and multipart models; `bakeFaces` retains model elements, rotations and source UVs. A keyword-to-color lookup and collision boxes are not visual-model replacements.

The consumer explicitly serves `scene.json`, `catalog.json`, `atlas.png`, `render.json`, and `asset-evidence.json`, and the renderer source tree and Three.js modules. Validate the existing asset pack's hashes before serving. Do not bundle Mojang assets into a new package without the applicable redistribution rights. The independent VTuber adapter owns browser lifecycle, recording, model requests and artistic prompts; this renderer never starts a model, game account or server connection.

The default is strict. `allowDocumentedApproximations=true` permits a disclosed low-detail water surface, banner placement/cloth markers, and unverified texture-variation choices. This is a model-input composition aid, not Java pixel parity. Unknown model names fail instead of turning gray or resolving a mod namespace to a vanilla block. Biome/redstone tints are separately listed as approximate. Block entities, dynamic fluid occlusion, particles, animations, server resource overrides and other players need additional observed inputs. Unloaded cells remain unknown in the scene receipt.

`renderProxy(offset, false)` produces natural RGB with original material cues. `renderProxy(offset, true)` produces an aligned class raster with exact palette colors and texture cutout alpha. `proxyDetails()` and `semanticPixels()` preserve source, identity, camera, coverage, actual visible classes and approximation evidence. The consumer preserves the **decoded first encoded frame** when generating its paired anchor. Semantic rasters are optional image-editor references; they are not a native EdenLive DINO segmentation channel.

Optional `showSelf=true` requires an explicit `cameraOffset`. It creates a neutral placement marker at the observed player's feet/yaw. This is a virtual third-person composition, not a game-camera action or observed limb animation. A character setting sheet may replace that marker in the image editor. Its background, panel layout and reference poses do not belong in the scene. First-person mode has no self marker and must not fabricate a character.

Offline catalog audit:

```
node tools/audit-voxel-proxy-catalog.mjs registry.json original-compiled-1.21.1.json new-report.json
node --test tools/test/voxel-proxy-catalog.test.mjs tools/test/native-model-selection.test.mjs
```

Resolving all registry states certifies catalog coverage only. Empty/invisible/special-rendered states and seed uncertainties remain in the report; visual fidelity requires separate inspection.
