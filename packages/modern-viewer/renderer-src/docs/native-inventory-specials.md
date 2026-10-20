# Java 1.21.1 inventory compass and trident

The generic inventory provider now registers `TridentItem` for GUI rendering.
The original `models/item/trident.json` selects the generated
`textures/item/trident.png`; it is not a missing custom server model. Named,
enchanted stacks retain their original ID, full components and GUI glint.
This sprite is not used as a substitute for the separate builtin in-hand model.
Unknown custom visual components still fail explicitly.

Compass selection uses the received same-player spawn position, identity,
dimension and game tick. The native target-distance test includes all three
coordinates of the block center. A compass at that center, or in a known
Nether/End dimension, uses the original random-spin branch with its own wobble
state instead of losing its icon. Missing or mismatched evidence and unknown
dimensions remain unavailable. The native 32 frame models and PNGs are reused;
the cache is bounded by frame and full stack identity, not continuous angles.

Source checks used the original client JAR
`499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99`:

| Class / asset | SHA-256 |
| --- | --- |
| `gpr.class` / CompassItemPropertyFunction | `9c6bbd7ecd7c3b15e2405b0620e98f33d2e70cb538519d22708f4dbb7ff0d892` |
| `gpr$b.class` / CompassWobble | `788d748754b8de9d8ffa0a0bb4c069a41a58e873814319c6b66a8d2e0ecacee4` |
| `glh.class` / ItemRenderer | `f34f74148172bb0cb9dd727e7bab1f50ca9168db059242296744f7fa86fa9d8e` |
| `cut.class` / Items | `63c118a911720b62d14709bc71709105ef3c9cb7fd75ec1baa44dc8500a11232` |
| `models/item/trident.json` | `b90d9cca8fddf60cad75ab82a6a68a36082673fe6185c487c7392bac16468d68` |
| `textures/item/trident.png` | `2bb1397727939c03c0c5c87307e91b41246e8ffd1b0ceddd73c7cc40bb9cf19d` |

The random branch preserves the native independent once-per-tick wobble,
signed-int seed hash (`1327217883`) and float arithmetic. Browser GUI seed zero,
its local random realization and received tick phase are not an independently
running Java client's RNG/GUI interpolation phase; exact Java pixel parity is
not claimed.

`native-inventory-specials.test.mjs` exercises real original asset loading and
the shared icon queue, including enchanted/custom-named tridents, vertical
spawn alignment, random-spin conditions and cache bounds. These tests do not
replace each consumer's served-bundle and live inventory acceptance.
