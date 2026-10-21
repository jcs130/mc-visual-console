# Inventory held-item transforms

The readonly inventory avatar mirrors the live actor. Native vanilla grips and
bundled YSM hand locators use `matrixAutoUpdate=false` and an authored local
matrix. Copying position/quaternion/scale alone discarded that matrix: the shield
was drawn at the model origin, in front of its face.

Copy the matrix and its update mode both when creating the mirror and on each
pose refresh. Geometry/materials remain borrowed; the world actor is not changed.
This also preserves animated matrix-only grip updates. No hand offset, camera
compensation or hidden shield is used to mask the error.

Regression: `tools/test/inventory-player-preview.test.mjs`, native held-item
matrix test, covers native and YSM parents, successive grip transforms and world
immutability. The relevant preview/native-held/native-shield/native-YSM/UI suite
passes; original private asset cases require their explicitly supplied catalog.
Live deployment and scene verification are separate from these source tests.
