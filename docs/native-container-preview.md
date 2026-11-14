# Native spectator container previews

NeoForge's automatically mirrored chest and other native container screens now
share the scoped travel-dismissal policy already used by the explicit read-only
backpack. Only the exact owned spectator menu is eligible; ordinary player menus
and another connection/target remain outside this path.

A stationary mirrored menu also closes after 15 seconds without a native menu
state revision or local pointer inspection. Repainting the same contents does not
renew the preview. P pins/unpins the preview, and E/Escape still close normally.
The explicit E-key backpack retains its existing travel-only timeout policy.
Closing uses the observer's own container-close path; it does not click slots,
move items, or issue commands to the followed player.

This fixes a production observation where the personal trial chest covered the
scene and prevented automatic camera composition for an extended period. Missing
server close delivery is not established by that observation; the independent
client-side lifecycle gap was confirmed in source.

Source/build checks, consumer installation, and in-world pixel acceptance must be
recorded separately. This document alone does not claim a running client update.
