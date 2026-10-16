# Paper appearance and item assets on Java 1.21.1

The existing same-connection YSM bridge accepts attested YSM 2.4.1 / protocol 2.4.0 metadata on 1.20.6 and 1.21.1. A connected worker with `awaiting_model_state` has not supplied a current player assignment. Report this separately from `YSM_ASSET_PENDING`, unavailable source files and actual renderer failure. Never infer a binding from the player name, another player, a catalog entry or a previous connection.

The optional original item pack uses integer `minecraft:custom_model_data`, base-item identities and original model/display transforms. Both supported versions carry this format. Installation validates the original manifest and every file hash, retains the source version, and refuses an existing destination. Compatibility does not change the source pack version or imply complete custom-content support.

The optional pack contains five original weapons; it is not a complete catalog of server items. `build-minecraft-viewer-client.mjs --preset=qiandengji` now installs the versioned original pack into a new consumer asset directory automatically, for both 1.20.6 and 1.21.1. An existing pack is verified and preserved; corrupt bytes fail explicitly and are never overwritten. Generic builds stay opt-in. Rebuild the actual served directory and verify the item component, browser icon and held mesh separately. Publishing source does not update a remote host, provide a Java client resource-pack URL or assign a YSM model.

The old `/dungeon/` observer entry is an alias of `/3dview/`. It renders the same Minecraft connection, not the separate Dungeon World. Camera rotation/zoom changes only the observer view. A successful screenshot or render does not prove every earlier scene was correct.

Reference for the original integer data component: [Mojang 24w09a](https://www.minecraft.net/en-us/article/minecraft-snapshot-24w09a). The 1.21.1 consumer is additionally checked by original-byte installation and component/model renderer tests; later expanded data formats are not enabled by version guessing.
