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

## Plain banners found during the inventory audit

An observed empty `banner_patterns` patch is now preserved as the original empty
SNBT list. All sixteen plain dye variants use `BannerRenderer.createBodyLayer`
cloth/pole/bar geometry, original `template_banner` GUI transforms,
`banner_base.png` plus the tinted `banner/base.png` overlay and original
`DyeColor.textureDiffuseColor`. They share a single bounded 64px icon renderer;
no generated replacement sprite is shipped. Other icon providers retain white
material tint.

The original client classes are `ggu.class` SHA-256
`88ba40e62737975c6f0c7883119082944193edfabc391cfef83173fccdae6bc7`,
`cti.class` SHA-256
`9bea743c9ac41568416d8e495cd54d047adfcd4a664cb4c0856a5b6172fc702f`,
and `gem.class` SHA-256
`7667fd54fd26c8754f3dd83b7022c49505c8c3100719132e1f2069e0c5a8bcea`.
The detached GUI banner uses its native initial cloth pose. Held banners remain
explicitly unsupported; GUI acceptance does not prove the equipped model.

Decorated banners consume the same action connection's configuration-phase
`minecraft:banner_pattern` registry. Numeric holders resolve only against that
received order and verified original asset/translation definitions. Inline
holders preserve their actual definition. Forty-three original 1.21.1 patterns
use their original PNG, diffuse dye color, `entityNoOutline` source-alpha
blending/no-cull pass and stable layer order. Native display uses the first
sixteen layers; the full bounded SNBT list remains intact. Registry changes,
stream disposal, unknown/overridden assets and absent mappings cannot borrow a
plain banner or an assumed static numeric ID.

The protocol-767 component is the container `{layers:[BannerPatternLayer...]}`,
while its SNBT codec is a list. The regression round-trips both configuration
registry packets and `SlotComponent` binary bytes through minecraft-protocol,
then the actual Prismarine Item constructor, projection and native SNBT parser.
A directly supplied array is not accepted as a fabricated wire component.
