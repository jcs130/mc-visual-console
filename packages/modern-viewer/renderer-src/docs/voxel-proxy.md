# Versioned voxel proxy for an image/video editor

`src/modern-viewer/voxel-proxy.html` renders a bounded `agent-mc-voxel-scene/v1` export. It uses the existing original Java 1.21.1 compiled block-state definitions and their **paired** texture atlas. `voxel-proxy-catalog.mjs` selects property variants and multipart models; `bakeFaces` retains model elements, rotations and source UVs. A keyword-to-color lookup and collision boxes are not visual-model replacements.

The consumer explicitly serves `scene.json`, `catalog.json`, `atlas.png`, `render.json`, and `asset-evidence.json`, and the renderer source tree and Three.js modules. Validate the existing asset pack's hashes before serving. Do not bundle Mojang assets into a new package without the applicable redistribution rights. The independent VTuber adapter owns browser lifecycle, recording, model requests and artistic prompts; this renderer never starts a model, game account or server connection.

The default is strict. `allowDocumentedApproximations=true` permits a disclosed low-detail water surface, banner placement/cloth markers, and unverified texture-variation choices. This is a model-input composition aid, not Java pixel parity. Unknown model names fail instead of turning gray or resolving a mod namespace to a vanilla block. Biome/redstone tints are separately listed as approximate. Block entities, dynamic fluid occlusion, particles, animations, server resource overrides and other players need additional observed inputs. Unloaded cells remain unknown in the scene receipt.

`renderProxy(offset, false)` produces natural RGB with original material cues. `renderProxy(offset, true)` produces an aligned class raster with exact palette colors and texture cutout alpha. `proxyDetails()` and `semanticPixels()` preserve source, identity, camera, coverage, actual visible classes and approximation evidence. The consumer preserves the **decoded first encoded frame** when generating its paired anchor. Semantic rasters are optional image-editor references; they are not a native EdenLive DINO segmentation channel.

Optional `showSelf=true` requires an explicit `cameraOffset`. It creates a neutral placement marker at the observed player's feet/yaw. This is a virtual third-person composition, not a game-camera action or observed limb animation. A character setting sheet may replace that marker in the image editor. Its background, panel layout and reference poses do not belong in the scene. First-person mode has no self marker and must not fabricate a character.

## Artistic inputs and relative facing

`surfaceStyle="material-hints"` is an explicit image-model input mode. It averages the original atlas face colors, preserving the exact selected meshes and original texture alpha, while removing the repeating pixel pattern. Its class pass is byte-identical to the corresponding original-material pass. This changes the artistic input, not the game's normal viewer or asset pack. `surfaceStyle="original"` remains the default.

Optional `geometryStyle="organic-hints"` replaces a small named set of original foliage meshes with overlapping rounded volumes, and redstone blocks with crystal markers. Original cell centers/classes and all source evidence remain in the scene; bounded coordinate-derived jitter/scales are deterministic. The receipt lists `organicClasses` and `renderPurpose="artistic-model-input-abstraction"`. This is intentional local shape reinterpretation requested for artwork, **not** native model fidelity. Unknown/modded names have no artistic substitution. `geometryStyle="original"` is the default. The semantic pass follows the chosen artistic geometry and cannot be described as pixel-identical to the original pass in this mode.

The self marker has explicit front/back cues. `placementFacing` computes the view relative to the observed look-yaw and declared virtual camera. It never claims an independently observed body yaw or animation. `projectedHead`, `projectedFeet`, the viewport and per-class visible bounds let the editor request the correct environmental scale and avoid turning a rear view into a portrait. These are soft generative constraints; inspect the actual image before claiming that pose/scale were preserved. Use a matching reference region (e.g. back of hair/coat) instead of a sheet dominated by large frontal faces.

Offline catalog audit:

```
node tools/audit-voxel-proxy-catalog.mjs registry.json original-compiled-1.21.1.json new-report.json
node --test tools/test/voxel-proxy-catalog.test.mjs tools/test/native-model-selection.test.mjs tools/test/voxel-proxy-pose.test.mjs tools/test/voxel-proxy-organic.test.mjs
```

Resolving all registry states certifies catalog coverage only. Empty/invisible/special-rendered states and seed uncertainties remain in the report; visual fidelity requires separate inspection.

## Offline timeline replay and explicit runtime capabilities

`setProxyPose(camera)` accepts an explicit validated scene camera, copies its
coordinate arrays, updates FOV and the optional neutral self marker. It changes
only this local rendering instance; it never sends a game camera/control action.
It does not update block geometry: load the next archived scene when the geometry
key changes. A replay should retain the original sampled poses and distinguish
render-time interpolation or virtual projection from observed game motion.

`renderProxy(offset, semantic, {mime, quality})` defaults to lossless PNG. RGB may
explicitly select `image/jpeg`; semantic output rejects JPEG to retain exact class
colors. `proxyDetails().renderer` reports `threeRevision` and supported methods
and formats. Consumers must check this receipt and use the matched Three.js
runtime, rather than resolving an unrelated recorder's older installation or
patching renderer HTML at runtime.

2026-10-20 replay verification: the original proxy uses Three.js r186. An r128
installation resolved through an old recorder dependency rendered only 7 visible
classes in the artistic-material test; r186 restored all 64. The corrected decoded
first frame differed from the earlier matched frame by mean 0.81/255, consistent
with different H.264 quantization. This mismatch was found in the new offline
entry; the preceding live trial had already explicitly configured r186.

Scene completeness is bounded: `coverage.complete` means all cells *inside the
exported box* are known. At player Y=108, `below=8` stops at Y=100 and cannot render
lower terrain. It does not certify camera-frustum coverage or an observed sky.
Capture appropriate vertical extents or multiple bounded tiles before choosing a
virtual camera. Do not reinterpret unknown/out-of-box regions as observed air.
