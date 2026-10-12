# Compact HUD and operation pointer

Normal viewing uses a grouped top tool strip and two flowing side rails. Panels
retain their own live-data visibility. The display menu saves component choices
under `minecraft.viewer.layout.v1`; H toggles the clean view. OBS retains its
separate editor, saved positions and `agentPointer` component preference.

The virtual pointer uses identity-checked operation packets. Visible inventory
clicks resolve a real server slot in the current window; trade offer previews
are not inventory slots. Scene operations project their measured target. The
first-person fallback is the crosshair. Missing targets in other camera modes
produce no pointer. Pointer movement is presentation interpolation, not recorded
physical mouse input; a separate click ring marks the actual target. Reduced
motion preferences disable interpolation and ring expansion.

The YSM held-item fix removes a second centering transform: baked Java vertices
already use a centred coordinate system. Native display transforms and left-hand
mirroring remain. YSM faces local -Z and inherits Mineflayer yaw; global 180°
rotation is not required. The inventory preview keeps hidden vanilla body parts
hidden when the custom actor is present.

Design references consulted: [frontend-design skill](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md),
[Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/full-list/),
[Material spacing](https://m2.material.io/design/layout/spacing-methods.html).
They inform grouping, spacing, contrast and optional overlays. Runtime truth
continues to come from the player's connection and original assets.

Verification covers pointer resolution, animation, slot identity, component
lifecycle, saved settings, custom preview visibility and cardinal/hand transforms.
Source and browser checks do not assert complete native Java scene parity.
