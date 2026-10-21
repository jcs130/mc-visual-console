# Original vanilla item glint

The vanilla 1.21.1 item and plain shield providers now retain the original glint
PNG and stitched sprite UVs. Item, shield and armour **inventory icons**, plus
supported first/third-person held geometry, use the same source rules. This is
not evidence for a worn armour layer or unsupported modded item renderer.

`native-vanilla-item-atlas.json` is coordinate/hash data produced by executing
the original client's unmodified Stitcher (`gqi`, SHA256
`5e3c8a689c8d692ca3188c14c4db1a34fb9e1d371eae65231bc15141e7f4abb1`).
The block/item atlas is 1024x512 (1684 sprites including generated trims and
missingno); shield patterns are 512x512. PNG/frame-metadata/atlas source hashes
are bound to the original vanilla client. Changed atlas inputs or unknown pack
sources retain an explicit unavailable effect. Original resource bytes stay
unchanged. Reproduce with Java 21+, the official client and its libraries:

```
python tools/export-native-glint-atlas.py --client-jar /path/1.21.1.jar --libraries /path/libraries --output /tmp/atlas.json
```

The exported table SHA256 is
`3b0f039a1f5e2c97bcbcd2910e5b76f01f553d3073336b958130bfd3382fc4a5`.
The independent PNG decoder comparison, original JOML float matrix outputs,
sprite coordinates, shader/texture hashes, missing-source rejection and
no-glint override are covered by tests.

`RenderStateShard` (`gfg`) SHA256:
`016d8817b3baa226ab4ccbdbc66c5fce8a594a41fe63d7a659032976a79a56d4`.
`ItemRenderer` (`glh`):
`f34f74148172bb0cb9dd727e7bab1f50ca9168db059242296744f7fa86fa9d8e`.
The texture matrix ports T(-t/110000,t/30000), Rz(10 degrees), S(8), with
t=trunc(milliseconds*speed*8). Viewer defaults are speed .5 and strength .75.
Original `rendertype_glint` samples repeat/linear and blends SRC_COLOR/ONE,
preserving destination alpha. The held opaque/cutout material combines these
operations in its existing draw pass; it adds no separate face draw calls.

GUI cells cache a 32x32 UV/depth raster of the original model and use the
original rendered icon as the alpha/base image. One clock serves visible cells
at up to 12.5 updates/second, shares a painted image for identical stacks, skips
hidden/offscreen cells and retires removed/replaced targets. It creates no
per-slot WebGL context and performs no PNG encoding every frame.

Browser QA uses a clearly labelled isolated YUI fixture with enchanted sword,
shield, armour icon and an unenchanted control. That proves WebGL/GUI drawing,
not an in-game action. The real same-body page is checked separately after
deployment. Cross-client clock phase, exact Java fog/lighting/pixel parity,
modded atlases, animated mod GUI providers and worn armour glint remain outside
this acceptance. Complete rendering parity stays false.
