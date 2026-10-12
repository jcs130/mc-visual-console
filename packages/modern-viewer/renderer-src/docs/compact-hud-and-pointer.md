# Compact HUD and operation pointer

Normal viewing uses a grouped top tool strip and two flowing side rails. Panels
retain their own live-data visibility. The display menu saves component choices
under `minecraft.viewer.layout.v1`; H toggles the clean view. OBS retains its
separate editor, saved positions and `agentPointer` component preference.

The operation panel has a fixed bottom-left viewport anchor. Its recent-operation
area reserves three lines, so changing click history cannot resize the panel.
Transient game/chat messages use a separate bottom-centre feed above the
hotbar. Neither is adopted into the scrolling side rails: incoming messages,
expiry and empty rails cannot shift the keys. At narrow phone widths, messages
use the remaining lower space beside the input panel. OBS keeps the same default
anchors while retaining each component's saved translation, scale and visibility.

Browser verification used an explicit synthetic player/platform with original
Java 1.20.6 assets at 1280x720, 1024x768 and 390x844. Input bounds stayed identical
with three incoming messages and after clearing them. The transparent OBS view,
28 component choices and exported input-panel offset/scale were also verified;
this does not claim an actual OBS recording or native Java pixel parity.

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
