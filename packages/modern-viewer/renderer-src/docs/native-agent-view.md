# Native Agent view

The 1.21.1 native console now consumes the existing shared Agent visualization
bridge and widgets through its existing read-only SSE stream. It shows public
intent, actual movement keys/look, recent sent operations, actual pathfinder
paths and the last 30 seconds of movement (bounded to 64 points). Planned path,
walked trail and sent operations remain separate from verified game effects.

The consumer explicitly injects `getAgentStatus`. It must supply bounded public
state for this player, rather than provider configuration, model prompts or
private journals. The autonomy consumer uses a separate atomic projection bound
to its runtime session; the renderer does not discover another host or account.
No control endpoint or extra Minecraft client is created.

`observeVanillaNativeStream` also exposes `handState()`. This observes Mineflayer's
configured main arm, real use state and the existing serializer's own
`arm_animation` packet. It sends no additional game packets. Physics frames
carry this state so short swings are not lost between inventory snapshots.
The native player renders original held-item models/skin arms and supported
first/third-person swings, including while moving. Animation state expires and
clears on spawn, respawn, disconnect and identity changes.

The vanilla adapter carries the actual Mineflayer `currentWindow`, its server
state ID, complete native slot stacks, cursor stack and received furnace
properties. Crafting/chest/furnace windows reuse the existing original GUI
renderers. Player inventory retains its 2×2 crafting/output/equipment layout.
Actual inventory-0 clicks briefly expand that read-only view; slot pointers
are bound to the real clicked window ID and slot. Packet changes publish
coalesced presentation updates without waiting for a world snapshot. Reused
window IDs require new server state.

Transforms are ported from the locked original 1.21.1 client
`ItemInHandRenderer` and `HumanoidModel`, with the existing float/LUT math:
client SHA256 `499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99`;
official mappings SHA1 `2244b6f072256667bcd9a73df124d6c58de77992`.
Original model/PNG/UV checks and same-player component checks remain required.

This is not complete Java rendering parity. Equip transitions, camera bob/lag,
active eating/drinking/ranged-use poses, unsupported item models and unsupported
YSM first-person bodies remain explicitly unavailable. Source publication and
offline tests do not prove that a consumer has deployed or visually verified
the resulting browser bundle.
