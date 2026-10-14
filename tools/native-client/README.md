# Native Java client view

This optional read-only page displays the actual action player's framebuffer, including original resources, animations and menus. It does not render a second bot, claim control, emulate desktop input or send commands. It is independent of Cortico.

Explicitly copy `index.html` to a local release input and configure `agent-mc-world` with `provider: java-client`, `javaClient.viewerPageFile` and a nonzero `viewerPort`. The core serves only local GET routes `/`, `/native/frame` and `/native/status`. Unconfigured clients do not open a viewer or discover any endpoints. Frames are bounded and shared by viewers. This page is an optional native view; the existing browser renderer and its third-person views remain separate.
