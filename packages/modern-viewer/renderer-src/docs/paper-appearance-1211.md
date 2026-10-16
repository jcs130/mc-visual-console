# Paper appearance and item assets on Java 1.21.1

The existing same-connection YSM bridge accepts attested YSM 2.4.1 / protocol 2.4.0 metadata on 1.20.6 and 1.21.1. A connected worker with `awaiting_model_state` has not supplied a current player assignment. Report this separately from `YSM_ASSET_PENDING`, unavailable source files and actual renderer failure. Never infer a binding from the player name, another player, a catalog entry or a previous connection.

The optional original item pack uses integer `minecraft:custom_model_data`, base-item identities and original model/display transforms. Both supported versions carry this format. Installation validates the original manifest and every file hash, retains the source version, and refuses an existing destination. Compatibility does not change the source pack version or imply complete custom-content support.

The optional pack contains five original weapons; it is not a complete catalog of server items. Install it explicitly into a new consumer asset directory, rebuild that directory, and verify the actual item component, browser icon and held mesh separately. The generic core does not select a server-specific pack or player model.

The old `/dungeon/` observer entry is an alias of `/3dview/`. It renders the same Minecraft connection, not the separate Dungeon World. Camera rotation/zoom changes only the observer view. A successful screenshot or render does not prove every earlier scene was correct.

Reference for the original integer data component: [Mojang 24w09a](https://www.minecraft.net/en-us/article/minecraft-snapshot-24w09a). The 1.21.1 consumer is additionally checked by original-byte installation and component/model renderer tests; later expanded data formats are not enabled by version guessing.
