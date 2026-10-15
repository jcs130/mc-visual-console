# Complete vanilla 1.21.1 registry work list

Generated from the locked original client registry and the actual browser dispatch tables. Every registered row is retained, including types without an implementation. No common-type shortlist or unsupported-as-impossible classification is used.

Original census SHA-256: `3571f2c6d4fbaa2e07db239853e0baf5db9dd07c5b66653cafa7588da466fbe3`. Original client SHA-256: `499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99`.

Source census: 130 entities, 109 particles, 44 block entities and 25 menu types. Current registered paths: 35 entity-type paths (including self-player only), 11 particle paths and 24 menu background/layout paths. **None of these counts measures complete rendering or Java parity.**

A registered path can still lack variants, equipment, poses, animation, lighting or dedicated controls. Unknown metadata/components remain explicit errors. All unimplemented rows are implementation work until an actual connection-data limitation is demonstrated.

This registry list complements [the full port audit](mineflayer-port-coverage.md), which also tracks inventory operations, crafting, hands, cameras, routes, audio, world environment, item components and game events. Player inventory, horse inventory and book-use screens are not extra MenuType registrations; they must be checked separately. Modded registries require their own full inventory. Original geometry export alone does not satisfy any missing actor row.

Regenerate with `node tools/vanilla-feature-matrix.mjs`; verify with `node tools/vanilla-feature-matrix.mjs --check`.

## Entities — all 130

| Native ID | Original registry name | Current implementation boundary |
| --- | --- | --- |
| 0 | `minecraft:allay` | Browser actor implementation open |
| 1 | `minecraft:area_effect_cloud` | Browser actor implementation open |
| 2 | `minecraft:armadillo` | Browser actor implementation open |
| 3 | `minecraft:armor_stand` | Browser actor implementation open |
| 4 | `minecraft:arrow` | Registered original actor path; complete appearance/animation remains open |
| 5 | `minecraft:axolotl` | Browser actor implementation open |
| 6 | `minecraft:bat` | Browser actor implementation open |
| 7 | `minecraft:bee` | Browser actor implementation open |
| 8 | `minecraft:blaze` | Browser actor implementation open |
| 9 | `minecraft:block_display` | Browser actor implementation open |
| 10 | `minecraft:boat` | Browser actor implementation open |
| 11 | `minecraft:bogged` | Registered original actor path; complete appearance/animation remains open |
| 12 | `minecraft:breeze` | Browser actor implementation open |
| 13 | `minecraft:breeze_wind_charge` | Browser actor implementation open |
| 14 | `minecraft:camel` | Browser actor implementation open |
| 15 | `minecraft:cat` | Browser actor implementation open |
| 16 | `minecraft:cave_spider` | Registered original actor path; complete appearance/animation remains open |
| 17 | `minecraft:chest_boat` | Browser actor implementation open |
| 18 | `minecraft:chest_minecart` | Browser actor implementation open |
| 19 | `minecraft:chicken` | Registered original actor path; complete appearance/animation remains open |
| 20 | `minecraft:cod` | Browser actor implementation open |
| 21 | `minecraft:command_block_minecart` | Browser actor implementation open |
| 22 | `minecraft:cow` | Registered original actor path; complete appearance/animation remains open |
| 23 | `minecraft:creeper` | Registered original actor path; complete appearance/animation remains open |
| 24 | `minecraft:dolphin` | Browser actor implementation open |
| 25 | `minecraft:donkey` | Browser actor implementation open |
| 26 | `minecraft:dragon_fireball` | Browser actor implementation open |
| 27 | `minecraft:drowned` | Registered original actor path; complete appearance/animation remains open |
| 28 | `minecraft:egg` | Registered original actor path; complete appearance/animation remains open |
| 29 | `minecraft:elder_guardian` | Browser actor implementation open |
| 30 | `minecraft:end_crystal` | Browser actor implementation open |
| 31 | `minecraft:ender_dragon` | Browser actor implementation open |
| 32 | `minecraft:ender_pearl` | Registered original actor path; complete appearance/animation remains open |
| 33 | `minecraft:enderman` | Registered original actor path; complete appearance/animation remains open |
| 34 | `minecraft:endermite` | Browser actor implementation open |
| 35 | `minecraft:evoker` | Browser actor implementation open |
| 36 | `minecraft:evoker_fangs` | Browser actor implementation open |
| 37 | `minecraft:experience_bottle` | Registered original actor path; complete appearance/animation remains open |
| 38 | `minecraft:experience_orb` | Registered original actor path; complete appearance/animation remains open |
| 39 | `minecraft:eye_of_ender` | Registered original actor path; complete appearance/animation remains open |
| 40 | `minecraft:falling_block` | Browser actor implementation open |
| 41 | `minecraft:firework_rocket` | Browser actor implementation open |
| 42 | `minecraft:fox` | Browser actor implementation open |
| 43 | `minecraft:frog` | Browser actor implementation open |
| 44 | `minecraft:furnace_minecart` | Browser actor implementation open |
| 45 | `minecraft:ghast` | Browser actor implementation open |
| 46 | `minecraft:giant` | Browser actor implementation open |
| 47 | `minecraft:glow_item_frame` | Browser actor implementation open |
| 48 | `minecraft:glow_squid` | Browser actor implementation open |
| 49 | `minecraft:goat` | Browser actor implementation open |
| 50 | `minecraft:guardian` | Browser actor implementation open |
| 51 | `minecraft:hoglin` | Browser actor implementation open |
| 52 | `minecraft:hopper_minecart` | Browser actor implementation open |
| 53 | `minecraft:horse` | Browser actor implementation open |
| 54 | `minecraft:husk` | Registered original actor path; complete appearance/animation remains open |
| 55 | `minecraft:illusioner` | Browser actor implementation open |
| 56 | `minecraft:interaction` | Browser actor implementation open |
| 57 | `minecraft:iron_golem` | Registered original actor path; complete appearance/animation remains open |
| 58 | `minecraft:item` | Registered original actor path; complete appearance/animation remains open |
| 59 | `minecraft:item_display` | Browser actor implementation open |
| 60 | `minecraft:item_frame` | Browser actor implementation open |
| 61 | `minecraft:ominous_item_spawner` | Browser actor implementation open |
| 62 | `minecraft:fireball` | Registered original actor path; complete appearance/animation remains open |
| 63 | `minecraft:leash_knot` | Browser actor implementation open |
| 64 | `minecraft:lightning_bolt` | Browser actor implementation open |
| 65 | `minecraft:llama` | Browser actor implementation open |
| 66 | `minecraft:llama_spit` | Browser actor implementation open |
| 67 | `minecraft:magma_cube` | Browser actor implementation open |
| 68 | `minecraft:marker` | Browser actor implementation open |
| 69 | `minecraft:minecart` | Browser actor implementation open |
| 70 | `minecraft:mooshroom` | Browser actor implementation open |
| 71 | `minecraft:mule` | Browser actor implementation open |
| 72 | `minecraft:ocelot` | Browser actor implementation open |
| 73 | `minecraft:painting` | Browser actor implementation open |
| 74 | `minecraft:panda` | Browser actor implementation open |
| 75 | `minecraft:parrot` | Browser actor implementation open |
| 76 | `minecraft:phantom` | Browser actor implementation open |
| 77 | `minecraft:pig` | Registered original actor path; complete appearance/animation remains open |
| 78 | `minecraft:piglin` | Browser actor implementation open |
| 79 | `minecraft:piglin_brute` | Browser actor implementation open |
| 80 | `minecraft:pillager` | Browser actor implementation open |
| 81 | `minecraft:polar_bear` | Browser actor implementation open |
| 82 | `minecraft:potion` | Registered original actor path; complete appearance/animation remains open |
| 83 | `minecraft:pufferfish` | Browser actor implementation open |
| 84 | `minecraft:rabbit` | Browser actor implementation open |
| 85 | `minecraft:ravager` | Browser actor implementation open |
| 86 | `minecraft:salmon` | Browser actor implementation open |
| 87 | `minecraft:sheep` | Registered original actor path; complete appearance/animation remains open |
| 88 | `minecraft:shulker` | Browser actor implementation open |
| 89 | `minecraft:shulker_bullet` | Browser actor implementation open |
| 90 | `minecraft:silverfish` | Browser actor implementation open |
| 91 | `minecraft:skeleton` | Registered original actor path; complete appearance/animation remains open |
| 92 | `minecraft:skeleton_horse` | Browser actor implementation open |
| 93 | `minecraft:slime` | Registered original actor path; complete appearance/animation remains open |
| 94 | `minecraft:small_fireball` | Registered original actor path; complete appearance/animation remains open |
| 95 | `minecraft:sniffer` | Browser actor implementation open |
| 96 | `minecraft:snow_golem` | Browser actor implementation open |
| 97 | `minecraft:snowball` | Registered original actor path; complete appearance/animation remains open |
| 98 | `minecraft:spawner_minecart` | Browser actor implementation open |
| 99 | `minecraft:spectral_arrow` | Registered original actor path; complete appearance/animation remains open |
| 100 | `minecraft:spider` | Registered original actor path; complete appearance/animation remains open |
| 101 | `minecraft:squid` | Browser actor implementation open |
| 102 | `minecraft:stray` | Registered original actor path; complete appearance/animation remains open |
| 103 | `minecraft:strider` | Browser actor implementation open |
| 104 | `minecraft:tadpole` | Browser actor implementation open |
| 105 | `minecraft:text_display` | Browser actor implementation open |
| 106 | `minecraft:tnt` | Browser actor implementation open |
| 107 | `minecraft:tnt_minecart` | Browser actor implementation open |
| 108 | `minecraft:trader_llama` | Browser actor implementation open |
| 109 | `minecraft:trident` | Registered original actor path; complete appearance/animation remains open |
| 110 | `minecraft:tropical_fish` | Browser actor implementation open |
| 111 | `minecraft:turtle` | Browser actor implementation open |
| 112 | `minecraft:vex` | Browser actor implementation open |
| 113 | `minecraft:villager` | Registered original actor path; complete appearance/animation remains open |
| 114 | `minecraft:vindicator` | Browser actor implementation open |
| 115 | `minecraft:wandering_trader` | Browser actor implementation open |
| 116 | `minecraft:warden` | Browser actor implementation open |
| 117 | `minecraft:wind_charge` | Browser actor implementation open |
| 118 | `minecraft:witch` | Registered original actor path; complete appearance/animation remains open |
| 119 | `minecraft:wither` | Browser actor implementation open |
| 120 | `minecraft:wither_skeleton` | Registered original actor path; complete appearance/animation remains open |
| 121 | `minecraft:wither_skull` | Browser actor implementation open |
| 122 | `minecraft:wolf` | Browser actor implementation open |
| 123 | `minecraft:zoglin` | Browser actor implementation open |
| 124 | `minecraft:zombie` | Registered original actor path; complete appearance/animation remains open |
| 125 | `minecraft:zombie_horse` | Browser actor implementation open |
| 126 | `minecraft:zombie_villager` | Registered original actor path; complete appearance/animation remains open |
| 127 | `minecraft:zombified_piglin` | Browser actor implementation open |
| 128 | `minecraft:player` | Self-player path; other players and complete equipment/poses remain open |
| 129 | `minecraft:fishing_bobber` | Registered original actor path; complete appearance/animation remains open |

## Particles — all 109

| Native ID | Original registry name | Current implementation boundary |
| --- | --- | --- |
| 0 | `minecraft:angry_villager` | Registered original particle path; lightmap/scene parity remains open |
| 1 | `minecraft:block` | Browser particle implementation open |
| 2 | `minecraft:block_marker` | Browser particle implementation open |
| 3 | `minecraft:bubble` | Browser particle implementation open |
| 4 | `minecraft:cloud` | Browser particle implementation open |
| 5 | `minecraft:crit` | Registered original particle path; lightmap/scene parity remains open |
| 6 | `minecraft:damage_indicator` | Registered original particle path; lightmap/scene parity remains open |
| 7 | `minecraft:dragon_breath` | Browser particle implementation open |
| 8 | `minecraft:dripping_lava` | Browser particle implementation open |
| 9 | `minecraft:falling_lava` | Browser particle implementation open |
| 10 | `minecraft:landing_lava` | Browser particle implementation open |
| 11 | `minecraft:dripping_water` | Browser particle implementation open |
| 12 | `minecraft:falling_water` | Browser particle implementation open |
| 13 | `minecraft:dust` | Browser particle implementation open |
| 14 | `minecraft:dust_color_transition` | Browser particle implementation open |
| 15 | `minecraft:effect` | Browser particle implementation open |
| 16 | `minecraft:elder_guardian` | Browser particle implementation open |
| 17 | `minecraft:enchanted_hit` | Registered original particle path; lightmap/scene parity remains open |
| 18 | `minecraft:enchant` | Browser particle implementation open |
| 19 | `minecraft:end_rod` | Browser particle implementation open |
| 20 | `minecraft:entity_effect` | Browser particle implementation open |
| 21 | `minecraft:explosion_emitter` | Browser particle implementation open |
| 22 | `minecraft:explosion` | Registered original particle path; lightmap/scene parity remains open |
| 23 | `minecraft:gust` | Browser particle implementation open |
| 24 | `minecraft:small_gust` | Browser particle implementation open |
| 25 | `minecraft:gust_emitter_large` | Browser particle implementation open |
| 26 | `minecraft:gust_emitter_small` | Browser particle implementation open |
| 27 | `minecraft:sonic_boom` | Browser particle implementation open |
| 28 | `minecraft:falling_dust` | Browser particle implementation open |
| 29 | `minecraft:firework` | Browser particle implementation open |
| 30 | `minecraft:fishing` | Browser particle implementation open |
| 31 | `minecraft:flame` | Registered original particle path; lightmap/scene parity remains open |
| 32 | `minecraft:infested` | Browser particle implementation open |
| 33 | `minecraft:cherry_leaves` | Browser particle implementation open |
| 34 | `minecraft:sculk_soul` | Browser particle implementation open |
| 35 | `minecraft:sculk_charge` | Browser particle implementation open |
| 36 | `minecraft:sculk_charge_pop` | Browser particle implementation open |
| 37 | `minecraft:soul_fire_flame` | Browser particle implementation open |
| 38 | `minecraft:soul` | Browser particle implementation open |
| 39 | `minecraft:flash` | Browser particle implementation open |
| 40 | `minecraft:happy_villager` | Browser particle implementation open |
| 41 | `minecraft:composter` | Browser particle implementation open |
| 42 | `minecraft:heart` | Registered original particle path; lightmap/scene parity remains open |
| 43 | `minecraft:instant_effect` | Browser particle implementation open |
| 44 | `minecraft:item` | Browser particle implementation open |
| 45 | `minecraft:vibration` | Browser particle implementation open |
| 46 | `minecraft:item_slime` | Browser particle implementation open |
| 47 | `minecraft:item_cobweb` | Browser particle implementation open |
| 48 | `minecraft:item_snowball` | Browser particle implementation open |
| 49 | `minecraft:large_smoke` | Browser particle implementation open |
| 50 | `minecraft:lava` | Browser particle implementation open |
| 51 | `minecraft:mycelium` | Browser particle implementation open |
| 52 | `minecraft:note` | Browser particle implementation open |
| 53 | `minecraft:poof` | Registered original particle path; lightmap/scene parity remains open |
| 54 | `minecraft:portal` | Browser particle implementation open |
| 55 | `minecraft:rain` | Browser particle implementation open |
| 56 | `minecraft:smoke` | Registered original particle path; lightmap/scene parity remains open |
| 57 | `minecraft:white_smoke` | Browser particle implementation open |
| 58 | `minecraft:sneeze` | Browser particle implementation open |
| 59 | `minecraft:spit` | Browser particle implementation open |
| 60 | `minecraft:squid_ink` | Browser particle implementation open |
| 61 | `minecraft:sweep_attack` | Registered original particle path; lightmap/scene parity remains open |
| 62 | `minecraft:totem_of_undying` | Browser particle implementation open |
| 63 | `minecraft:underwater` | Browser particle implementation open |
| 64 | `minecraft:splash` | Browser particle implementation open |
| 65 | `minecraft:witch` | Browser particle implementation open |
| 66 | `minecraft:bubble_pop` | Browser particle implementation open |
| 67 | `minecraft:current_down` | Browser particle implementation open |
| 68 | `minecraft:bubble_column_up` | Browser particle implementation open |
| 69 | `minecraft:nautilus` | Browser particle implementation open |
| 70 | `minecraft:dolphin` | Browser particle implementation open |
| 71 | `minecraft:campfire_cosy_smoke` | Browser particle implementation open |
| 72 | `minecraft:campfire_signal_smoke` | Browser particle implementation open |
| 73 | `minecraft:dripping_honey` | Browser particle implementation open |
| 74 | `minecraft:falling_honey` | Browser particle implementation open |
| 75 | `minecraft:landing_honey` | Browser particle implementation open |
| 76 | `minecraft:falling_nectar` | Browser particle implementation open |
| 77 | `minecraft:falling_spore_blossom` | Browser particle implementation open |
| 78 | `minecraft:ash` | Browser particle implementation open |
| 79 | `minecraft:crimson_spore` | Browser particle implementation open |
| 80 | `minecraft:warped_spore` | Browser particle implementation open |
| 81 | `minecraft:spore_blossom_air` | Browser particle implementation open |
| 82 | `minecraft:dripping_obsidian_tear` | Browser particle implementation open |
| 83 | `minecraft:falling_obsidian_tear` | Browser particle implementation open |
| 84 | `minecraft:landing_obsidian_tear` | Browser particle implementation open |
| 85 | `minecraft:reverse_portal` | Browser particle implementation open |
| 86 | `minecraft:white_ash` | Browser particle implementation open |
| 87 | `minecraft:small_flame` | Registered original particle path; lightmap/scene parity remains open |
| 88 | `minecraft:snowflake` | Browser particle implementation open |
| 89 | `minecraft:dripping_dripstone_lava` | Browser particle implementation open |
| 90 | `minecraft:falling_dripstone_lava` | Browser particle implementation open |
| 91 | `minecraft:dripping_dripstone_water` | Browser particle implementation open |
| 92 | `minecraft:falling_dripstone_water` | Browser particle implementation open |
| 93 | `minecraft:glow_squid_ink` | Browser particle implementation open |
| 94 | `minecraft:glow` | Browser particle implementation open |
| 95 | `minecraft:wax_on` | Browser particle implementation open |
| 96 | `minecraft:wax_off` | Browser particle implementation open |
| 97 | `minecraft:electric_spark` | Browser particle implementation open |
| 98 | `minecraft:scrape` | Browser particle implementation open |
| 99 | `minecraft:shriek` | Browser particle implementation open |
| 100 | `minecraft:egg_crack` | Browser particle implementation open |
| 101 | `minecraft:dust_plume` | Browser particle implementation open |
| 102 | `minecraft:trial_spawner_detection` | Browser particle implementation open |
| 103 | `minecraft:trial_spawner_detection_ominous` | Browser particle implementation open |
| 104 | `minecraft:vault_connection` | Browser particle implementation open |
| 105 | `minecraft:dust_pillar` | Browser particle implementation open |
| 106 | `minecraft:ominous_spawning` | Browser particle implementation open |
| 107 | `minecraft:raid_omen` | Browser particle implementation open |
| 108 | `minecraft:trial_omen` | Browser particle implementation open |

## Block entities — all 44

| Native ID | Original registry name | Current implementation boundary |
| --- | --- | --- |
| 0 | `minecraft:furnace` | Original registration has no additional renderer; received MODEL path applies |
| 1 | `minecraft:chest` | Original base MODEL where applicable; dedicated additional renderer remains open |
| 2 | `minecraft:trapped_chest` | Original base MODEL where applicable; dedicated additional renderer remains open |
| 3 | `minecraft:ender_chest` | Original base MODEL where applicable; dedicated additional renderer remains open |
| 4 | `minecraft:jukebox` | Original registration has no additional renderer; received MODEL path applies |
| 5 | `minecraft:dispenser` | Original registration has no additional renderer; received MODEL path applies |
| 6 | `minecraft:dropper` | Original registration has no additional renderer; received MODEL path applies |
| 7 | `minecraft:sign` | Original base MODEL where applicable; dedicated additional renderer remains open |
| 8 | `minecraft:hanging_sign` | Original base MODEL where applicable; dedicated additional renderer remains open |
| 9 | `minecraft:mob_spawner` | Original base MODEL where applicable; dedicated additional renderer remains open |
| 10 | `minecraft:piston` | Original base MODEL where applicable; dedicated additional renderer remains open |
| 11 | `minecraft:brewing_stand` | Original registration has no additional renderer; received MODEL path applies |
| 12 | `minecraft:enchanting_table` | Original base MODEL where applicable; dedicated additional renderer remains open |
| 13 | `minecraft:end_portal` | Original base MODEL where applicable; dedicated additional renderer remains open |
| 14 | `minecraft:beacon` | Original base MODEL where applicable; dedicated additional renderer remains open |
| 15 | `minecraft:skull` | Original base MODEL where applicable; dedicated additional renderer remains open |
| 16 | `minecraft:daylight_detector` | Original registration has no additional renderer; received MODEL path applies |
| 17 | `minecraft:hopper` | Original registration has no additional renderer; received MODEL path applies |
| 18 | `minecraft:comparator` | Original registration has no additional renderer; received MODEL path applies |
| 19 | `minecraft:banner` | Original base MODEL where applicable; dedicated additional renderer remains open |
| 20 | `minecraft:structure_block` | Original base MODEL where applicable; dedicated additional renderer remains open |
| 21 | `minecraft:end_gateway` | Original base MODEL where applicable; dedicated additional renderer remains open |
| 22 | `minecraft:command_block` | Original registration has no additional renderer; received MODEL path applies |
| 23 | `minecraft:shulker_box` | Original base MODEL where applicable; dedicated additional renderer remains open |
| 24 | `minecraft:bed` | Dedicated original bed geometry path; full scene comparison remains open |
| 25 | `minecraft:conduit` | Original base MODEL where applicable; dedicated additional renderer remains open |
| 26 | `minecraft:barrel` | Original registration has no additional renderer; received MODEL path applies |
| 27 | `minecraft:smoker` | Original registration has no additional renderer; received MODEL path applies |
| 28 | `minecraft:blast_furnace` | Original registration has no additional renderer; received MODEL path applies |
| 29 | `minecraft:lectern` | Original base MODEL where applicable; dedicated additional renderer remains open |
| 30 | `minecraft:bell` | Original base MODEL where applicable; dedicated additional renderer remains open |
| 31 | `minecraft:jigsaw` | Original registration has no additional renderer; received MODEL path applies |
| 32 | `minecraft:campfire` | Original base MODEL where applicable; dedicated additional renderer remains open |
| 33 | `minecraft:beehive` | Original registration has no additional renderer; received MODEL path applies |
| 34 | `minecraft:sculk_sensor` | Original registration has no additional renderer; received MODEL path applies |
| 35 | `minecraft:calibrated_sculk_sensor` | Original registration has no additional renderer; received MODEL path applies |
| 36 | `minecraft:sculk_catalyst` | Original registration has no additional renderer; received MODEL path applies |
| 37 | `minecraft:sculk_shrieker` | Original registration has no additional renderer; received MODEL path applies |
| 38 | `minecraft:chiseled_bookshelf` | Original registration has no additional renderer; received MODEL path applies |
| 39 | `minecraft:brushable_block` | Original base MODEL where applicable; dedicated additional renderer remains open |
| 40 | `minecraft:decorated_pot` | Original base MODEL where applicable; dedicated additional renderer remains open |
| 41 | `minecraft:crafter` | Original registration has no additional renderer; received MODEL path applies |
| 42 | `minecraft:trial_spawner` | Original base MODEL where applicable; dedicated additional renderer remains open |
| 43 | `minecraft:vault` | Original base MODEL where applicable; dedicated additional renderer remains open |

## Menu types — all 25

| Native ID | Original registry name | Current implementation boundary |
| --- | --- | --- |
| 0 | `minecraft:generic_9x1` | Original background/slot path; dedicated controls/previews/Java parity remain open |
| 1 | `minecraft:generic_9x2` | Original background/slot path; dedicated controls/previews/Java parity remain open |
| 2 | `minecraft:generic_9x3` | Original background/slot path; dedicated controls/previews/Java parity remain open |
| 3 | `minecraft:generic_9x4` | Original background/slot path; dedicated controls/previews/Java parity remain open |
| 4 | `minecraft:generic_9x5` | Original background/slot path; dedicated controls/previews/Java parity remain open |
| 5 | `minecraft:generic_9x6` | Original background/slot path; dedicated controls/previews/Java parity remain open |
| 6 | `minecraft:generic_3x3` | Original background/slot path; dedicated controls/previews/Java parity remain open |
| 7 | `minecraft:crafter_3x3` | 46 original slots, received disable/power state; Web interaction/Java parity remains open |
| 8 | `minecraft:anvil` | Original background/slot path; dedicated controls/previews/Java parity remain open |
| 9 | `minecraft:beacon` | Original background/slot path; dedicated controls/previews/Java parity remain open |
| 10 | `minecraft:blast_furnace` | Original background/slot path; dedicated controls/previews/Java parity remain open |
| 11 | `minecraft:brewing_stand` | Original background/slot path; dedicated controls/previews/Java parity remain open |
| 12 | `minecraft:crafting` | Original background/slot path; dedicated controls/previews/Java parity remain open |
| 13 | `minecraft:enchantment` | Original background/slot path; dedicated controls/previews/Java parity remain open |
| 14 | `minecraft:furnace` | Original background/slot path; dedicated controls/previews/Java parity remain open |
| 15 | `minecraft:grindstone` | Original background/slot path; dedicated controls/previews/Java parity remain open |
| 16 | `minecraft:hopper` | Original background/slot path; dedicated controls/previews/Java parity remain open |
| 17 | `minecraft:lectern` | Lectern book screen implementation open |
| 18 | `minecraft:loom` | Original background/slot path; dedicated controls/previews/Java parity remain open |
| 19 | `minecraft:merchant` | Original background/slot path; dedicated controls/previews/Java parity remain open |
| 20 | `minecraft:shulker_box` | Original background/slot path; dedicated controls/previews/Java parity remain open |
| 21 | `minecraft:smithing` | Original background/slot path; dedicated controls/previews/Java parity remain open |
| 22 | `minecraft:smoker` | Original background/slot path; dedicated controls/previews/Java parity remain open |
| 23 | `minecraft:cartography_table` | Original background/slot path; dedicated controls/previews/Java parity remain open |
| 24 | `minecraft:stonecutter` | Original background/slot path; dedicated controls/previews/Java parity remain open |
