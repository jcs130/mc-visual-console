# Vanilla inventory icons

The current vanilla 1.21.1 adapter forwards only name/count, so the native renderer correctly rejects those slots with `NATIVE_ITEM_STACK_UNKNOWN`. Add an explicit serializer for known, fully observed Prismarine component patches. Never treat absent arrays as empty or strip unsupported components to obtain an icon.

- [x] Reproduce with ordinary wood tools, bones/arrows, food and blocks through `nativeItemIconEligible`.
- [x] Serialize confirmed empty patches and supported scalar components into exact 1.21.1 ItemStack SNBT; retain removals. Expose unsupported/malformed data explicitly. The real Prismarine decoder synthesizes legacy Damage NBT; its matched modern wire codec establishes the authoritative observed component patch.
- [x] Keep the same player, vanilla-only version guard, slots and selected hotbar slot. Derive translation keys from the matched vanilla block/item registry.
- [x] Run focused tests and the full shared renderer suite (744 passed, 12 conditional skips); synchronize validated source normally. Accept a uniquely matching locked source SHA under the launcher's original filename, while rejecting canonical-name conflicts, duplicate aliases and explicit resource overrides. Verify all 8449 actual exported asset entries and prepare the real inventory's original flat icons/block models before deployment.
- [x] Rebuild against the original vanilla 1.21.1 asset export, verify actual served hashes, and inspect real browser icons. Actual hotbar and inventory images loaded for wooden axe, birch sapling, oak slab/planks/log, stick, birch slab and crafting table. The chest's dedicated model remains explicitly unsupported. Server/model/Neko process identities and the same action player's UUID were preserved; normal queue/stop receipts and original user goals were retained during owned-runtime handovers.

This repairs ordinary vanilla inventory presentation. It does not claim every custom component, modded item, dynamic model or Java pixel parity is implemented.
