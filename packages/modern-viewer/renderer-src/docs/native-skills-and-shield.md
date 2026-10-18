# Compact skills and observed YUI equipment

The native console previously overrode the shared ability grid with one column,
while the dock removed the panel height limit. Every server ability expanded
into the rail. The panel now shows four bounded names; full ability and level
lists live in initially closed disclosures with a bounded two-column scroll
area. Updating telemetry retains disclosure state. No server IDs are used to
guess active/passive classes, costs, cooldowns or casting controls.

Confirmed inventory stacks control bundled YUI hand visibility. Missing animation
physics no longer hides an independently verified item. Complete inventory-0,
UUID, selected-slot and main-arm checks remain; death, sleep, removed stacks and
invalid identity clear/hide the items. Enchantments retain base geometry and
use the original glint when their atlas inputs are verified; otherwise the
effect has an explicit unavailable diagnostic rather than hiding the tool.

The shield provider ports the 1.21.1 `ShieldModel.createLayer` plate
(-6,-11,-2; 12,22,1; UV 0,0) and handle (-1,-3,-1; 2,6,6; UV 26,0),
using the original 64x64 `entity/shield_base_nopattern.png`, original GUI/hand
display transforms, and builtin renderer's centring and Y/Z flip.
The YUI locator uses the existing authored grip correction around the handle.

Audited official client SHA256:
`499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99`.
Mojang client mappings SHA1: `2244b6f072256667bcd9a73df124d6c58de77992`.
`ShieldModel` (`fxb`) class SHA256:
`3fce6d7c1b78c8693dc11e6c7aaf24491a3bfc17be2597461835ce2a27220592`.
`ShieldItem` (`cvt`): `97f4148cf303b6666061c7572a51678ca793d28d2f2513497b08d1419d267d06`.
`BlockEntityWithoutLevelRenderer` (`gem`):
`7667fd54fd26c8754f3dd83b7022c49505c8c3100719132e1f2069e0c5a8bcea`.

Tests use exported original assets, complete received item stacks and the actual
YUI actor, covering both handedness values, temporary missing physics, enchantment
diagnostics, death, replacement/removal, foreign identity and long skill lists.
Banner-coloured/patterned shields, active blocking pose and exact Java GUI
lighting/pixel parity remain unverified/unavailable; complete parity stays false.
See [original glint](native-item-glint.md) for the item/shield atlas scope.
No resource bytes, game actions, Neko code, speech or server state are changed.
