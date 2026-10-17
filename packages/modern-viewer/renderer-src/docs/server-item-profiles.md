# Optional server item profiles (Java 1.21.1)

Server catalog assets remain outside the vanilla asset manifest. A host must
explicitly select and hash-check the extension catalog; only the current body's
attested extension state activates its icon selectors. Selectors use either an
exact base item + CustomModelData or player_head + observed textures profile hash.
Names, random profile UUIDs and absent components never select a replacement.

Custom heads use the original exported `minecraft:player_head#main` head/hat
polygons, template_skull GUI transform, and original 1.21.1 SkullBlockRenderer
item transform. Source client SHA256: 499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99.
SkullBlockRenderer gho.class SHA256: 2af21e58839ef6133a380abe97dbdff4011163b429272e28a4cd459297c3b762.
BlockEntityWithoutLevelRenderer gem.class SHA256: 7667fd54fd26c8754f3dd83b7022c49505c8c3100719132e1f2069e0c5a8bcea.
The selected server pack supplies immutable original 64x64 skin bytes. GUI
rendering reuses one bounded renderer and releases textures and blob URLs.
Source integrity and geometry tests do not claim Java pixel parity.

Protocol 767 allows an empty optional profile name; the codec preserves it.
Raw same-player max_health attribute packets are exposed separately from the
Mineflayer attribute projection so server state contradictions can be diagnosed.
No default maximum health is manufactured from an unavailable extension status.
