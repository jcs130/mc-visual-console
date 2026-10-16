# Activity stacks and recipe reference icons

Inventory reconciliation groups a quantity-normalized SNBT key, while retaining
the first complete observed representative stack unchanged. The row's `delta`
is independent of that representative's count. History icons hide the sample
count overlay and identify the tooltip as a historical observation. Missing or
malformed owned wire slots invalidate the baseline until a complete inventory
receipt; they cannot establish an empty slot or a fabricated loss.

Recipe telemetry remains `source: vanilla_recipe_catalog`, without an observed
output stack or a craft receipt. Output and material entries carry a separate
`reference` descriptor: schema 1, Minecraft 1.21.1, original default appearance,
namespaced ID and numeric registry ID. The renderer verifies those IDs against
the hashed original 1,333-item registry (`client-item-colors.json`, SHA-256
`21c83de83b6f57d38f93c0881edaa98a2d2c06ec8c14eceb260a79c380f9e936`).

The default-reference entry point additionally requires the existing positive
static constructor/provider audit and unique locked client source, or the
original empty PotionContents rule for the four supported potion families.
The client SHA-256 is
`499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99`.
Only then is a separate internally consistent default reference stack prepared
for the existing NativeItemIcons providers. Models, shader, textures, resource
priority, typed observed stacks and cache/resource ownership retain their
existing checks. Unknown/dynamic defaults and unsupported default glint remain
explicitly unavailable. Inventory, merchant, actual crafting slots and drops
never use the reference entry point to fill missing components.

Inspector rows label the catalogue's default appearance and that crafting has
not occurred. They show the original material requirements as well as deficits.
Icon revision updates refresh current item nodes in place; menu readiness no
longer invalidates the menu layout or releases the unchanged player preview.
Closing/rebuilding/resetting a menu retires its item targets. Asset sequence
guards and provider disposal reject callbacks from replaced readers. Unchanged
failed image decodes are not retried on unrelated icon completions.

The regression uses actual 1.21.1 recipes and original registry/model/resource
bytes, plus controlled GPU/DOM boundaries. Three delayed original flat icon
completions previously caused three menu rebuilds, preview releases and preview
reattachments; the repaired path causes zero of each. This is a lifecycle count,
not an FPS or phase-cost claim. Browser rasterization/Java pixel parity and live
deployment acceptance remain separate. The 380 non-air item appearance classes,
equipment layers and remaining 80 actors remain required later work.
