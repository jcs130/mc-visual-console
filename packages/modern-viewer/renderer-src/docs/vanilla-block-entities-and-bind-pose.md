# Original 1.21.1 block-entity geometry and player bind pose

The Mineflayer viewer exported the ordinary JSON models for decorated pots and
skulls. Those files only specify particles; Minecraft draws the visible object
with a block-entity renderer. The real provider therefore reported `No valid
models after transformation`, and showed the existing missing-material checker.

The portable 1.21.1 build now converts the shared, SHA-verified original client
model-layer polygons into supported block faces. It preserves original pivots,
transform order, visible polygons and UVs; zero-area polygons are omitted. The
converter refuses non-axial or unrepresentable faces instead of approximating
them. Default decorated pots and skeleton, wither skeleton, zombie and creeper
heads use their original textures, standing rotations and wall positions.
Existing player-profile head support is unchanged. Dragon/piglin head animation
and decorated-pot sherd patterns are not claimed as implemented.

Observed non-default or malformed `sherds` remain explicitly unavailable at that
position, with `world.specialBlockMaterialDiagnostics` reporting the reason.
They are not silently replaced by a plain pot. Default loot-table pots without
sherds and explicit four-brick pots use the original blank sides. This does not
alter the server block, collision, inventory, or any gameplay state. Original
PNG bytes and 1.20.6 compatibility assets remain unchanged.

The vanilla `minecraft-player` animation adapter also stops capturing transient
arm/body/leg rotations as the bind pose. The six skinview joints have zero bind
rotation; their positions and world placement are preserved. Actual current use,
walking and riding still animate. Custom YSM adapters retain their authored bind
transforms and animation layers. The reproduced vanilla bug can explain raised
arms remaining after use, but does not establish which adapter a historical
remote player used when its render snapshot was not retained.

Validation covers the real model provider across every affected block state,
original geometry/UV conversion, default/non-default NBT, override isolation,
remote-player binding and use-to-idle transitions. Source tests and isolated
scene rendering do not establish complete Java pixel parity or deploy copied
consumer assets. Consumers must freeze matching rebuilt assets and verify their
served bundle hashes before claiming the change is loaded.
