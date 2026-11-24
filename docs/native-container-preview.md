# Native spectator container previews

NeoForge's automatically mirrored chest and other native container screens now
share the scoped travel-dismissal policy already used by the explicit read-only
backpack. Only the exact owned spectator menu is eligible; ordinary player menus
and another connection/target remain outside this path.

A stationary backpack or mirrored menu closes after 15 seconds without a visible
item change or local inspection. The target's inventory activity alone can keep it
open for up to 30 seconds from opening or the last local inspection. Repainting
identical stacks and receiving another window for the same open preview preserve
its clock. Travel can dismiss it sooner. P pins/unpins the preview, and E/Escape
close it immediately. A new target or connection discards the previous scope.
Closing uses the observer's own container-close path; it does not click slots,
move items, or issue commands to the followed player.

The backpack shows the target's head, chest, legs, feet, main hand and off hand
above the 36 carried slots. A mirrored container shows the same equipment beside
its original slots when the viewport has room. Equipment comes from the tracked
camera entity. Item icons, durability bars and tooltips use the original stacks.
An unknown target is displayed as "?", while a known empty equipment slot shows "空".

This fixes a production observation where the personal trial chest covered the
scene and prevented automatic camera composition for an extended period. Missing
server close delivery is not established by that observation; the independent
client-side lifecycle gap was confirmed in source.

Source/build checks, consumer installation, and in-world pixel acceptance must be
recorded separately. This document alone does not claim a running client update.

Release invariant: every native build runs `check-container-protection.mjs` before
compilation and records its receipt in `build-report.json`. The independent JAR
consumer reruns the policy tests. The Native observer protections CI workflow
checks PRs and main for both native wiring and timeout/travel/pin/ownership behavior.
Do not publish or install a replacement JAR without this receipt and matching source
hashes. The release's SHA256 manifest is the consumer pin; a version label alone
does not prove that a copied deployment includes these protections.
