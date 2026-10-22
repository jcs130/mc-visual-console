import { parseNativeItemStack, nativeNumericValue } from './native-item-stack.js'
import {nativeBannerLayers} from './native-banner-data.js'
import {TWILIGHT_ITEM_FACTORY_AUDIT} from './native-twilight-item-factories.js'

// Positive registration evidence from locked 1.21.1 Items (cut), ItemColors
// (fhu), ItemProperties (gps), ItemNameBlockItem, BookItem and WritableBookItem.
// Tables come from constructor/register calls, never from JSON file presence.
// JSON/model/texture/material/priority constraints are checked separately.
// Minecraft class SHA256: Items 63c118a911720b62d14709bc71709105ef3c9cb7fd75ec1baa44dc8500a11232;
// ItemColors 2ac36e644129920977fdefa31867c103d03571b7585a33567a84569dbd69abd4;
// ItemProperties 0d0e77d78780c9dfedf86514d29cfec312459062f5a90175dda479006aa32f24.
// Items.CUT_STANDSTONE_SLAB is a misspelled Java field, not a registry ID:
// cut.eh registers dga.jG (Blocks.CUT_SANDSTONE_SLAB), native ID cut_sandstone_slab.
// Farmer's Delight 1.3.4 ModItems registers these exact Item/BlockItem and
// ConsumableItem constructors (no subclasses or anonymous implementations).
// ConsumableItem only changes consumption/remainders/tooltips, not rendering.
// ModItems class SHA256: 3b4917565f8d6f5f3ced18846f43dfdf92bc474313a19264db16ef9d4cfc9fbd;
// ConsumableItem: 8af6c2428e80b5d321794c39a18e07cf0603a635c51bee9a49e416f5d295cbdd;
// ClientSetupEvents: 0d3085ae62f7725d30882fcd1e1b49564fc3a50c32528a212e1d0202271543a7.
// All JAR class references to color/model/client-extension hooks
// were checked: ClientSetupEvents registers custom renderer + property only
// for SKILLET (excluded). No mod ItemColors/ModelEvent registration is present.
export const STATIC_ITEM_SOURCES = Object.freeze({
  minecraft: Object.freeze({name:'minecraft-1.21.1-client.jar',sha256:'499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99'}),
  create: Object.freeze({name:'create-1.21.1-6.0.10.jar',sha256:'ef87fe5709f1ba1f5b8bb20a2925b5afb4669e178fd6d8bf10c167759eefe37a'}),
  farmersdelight: Object.freeze({name:'FarmersDelight-1.21.1-1.3.4.jar',sha256:'139ad7696462c89c03eea463f805abffa552526c5dadaadae221dd9624cb197c'}),
  twilightforest: Object.freeze({name:'twilightforest-1.21.1-4.8.3345-universal.jar',sha256:'493da16d10210f9f53a3c33b3d8fcb4ae9b14016ee420d753c894562bd9aba35'})
})
const table = new Map()
const add = (namespace,kind,itemClass,names) => {
  for(const leaf of names.trim().split(/\s+/)) table.set(`${namespace}:${leaf}`,Object.freeze({namespace,kind,itemClass,source:STATIC_ITEM_SOURCES[namespace]}))
}
// AllBlocks.ANDESITE_CASING -> BuilderTransformers.casing -> BlockBuilder.item()
// uses the ordinary BlockItem factory. Keep its original item parent, GUI
// transform and resource-priority checks; this does not admit other machines.
add('create','json','net.minecraft.world.item.BlockItem','andesite_casing')
// ModItems lambda$static$93 constructs RiceItem. Its only override is useOn
// (placement); it inherits the ordinary ItemNameBlockItem model/colour path.
add('farmersdelight','flat','vectorwing.farmersdelight.common.item.RiceItem','rice')
// TFItems 4.8.3345 factory lambdas 59/22/0 construct the exact vanilla
// SwordItem/Item classes. GlassSwordItem changes combat/durability only;
// EmptyMagicMapItem only overrides use. Their original JSON parents/layers are
// still loaded and checked. Filled maps, flask, jar, ore meter and traveller
// armour have separate renderers/loaders and are deliberately not admitted.
// Original class SHA256: TFItems 0ea17aae2ca0609567e0f97893d53cad0181322f0bf6294db61ec76a32071271;
// GlassSwordItem 500c15ca96ffd254bdd9b8435d355fe6f2d1b74a4f132b88888a345ec6d8f2ce;
// EmptyMagicMapItem a83ecdc71f7035565512cd531c6d9a67fbff9b431e0881c8e822add65c4b88d4.
add('twilightforest','flat','net.minecraft.world.item.SwordItem','steeleaf_sword')
add('twilightforest','flat','net.minecraft.world.item.Item','ironwood_ingot naga_scale')
add('twilightforest','flat','twilightforest.item.GlassSwordItem','glass_sword')
add('twilightforest','flat','twilightforest.item.EmptyMagicMapItem','magic_map')
// Additional exact vanilla constructors read from the ORIGINAL TFItems class;
// no custom subclass or JSON-presence heuristic is admitted by this list.
for(const row of TWILIGHT_ITEM_FACTORY_AUDIT.items) table.set(row.id,Object.freeze({namespace:'twilightforest',kind:'flat',itemClass:row.itemClass,source:STATIC_ITEM_SOURCES.twilightforest,factory:row.factory}))
// TFBlocks.register -> lambda$register$606 constructs an exact BlockItem.
// The original uncrafting-table item JSON has no BER/extra model wrapper.
add('twilightforest','json','net.minecraft.world.item.BlockItem','uncrafting_table')
add('minecraft','json','net.minecraft.world.item.BlockItem',`
stone granite polished_granite diorite polished_diorite andesite polished_andesite deepslate cobbled_deepslate
polished_deepslate calcite tuff tuff_slab tuff_stairs tuff_wall chiseled_tuff polished_tuff polished_tuff_slab
polished_tuff_stairs polished_tuff_wall tuff_bricks tuff_brick_slab tuff_brick_stairs tuff_brick_wall
chiseled_tuff_bricks dripstone_block dirt coarse_dirt podzol rooted_dirt mud crimson_nylium warped_nylium cobblestone
oak_planks spruce_planks birch_planks jungle_planks acacia_planks cherry_planks dark_oak_planks mangrove_planks
bamboo_planks crimson_planks warped_planks bamboo_mosaic oak_sapling spruce_sapling birch_sapling jungle_sapling
acacia_sapling cherry_sapling dark_oak_sapling mangrove_propagule bedrock sand red_sand gravel coal_ore
deepslate_coal_ore iron_ore deepslate_iron_ore copper_ore deepslate_copper_ore gold_ore deepslate_gold_ore
redstone_ore deepslate_redstone_ore emerald_ore deepslate_emerald_ore lapis_ore deepslate_lapis_ore diamond_ore
deepslate_diamond_ore nether_gold_ore nether_quartz_ore coal_block raw_iron_block raw_copper_block raw_gold_block
amethyst_block budding_amethyst iron_block copper_block gold_block diamond_block exposed_copper weathered_copper
oxidized_copper chiseled_copper exposed_chiseled_copper weathered_chiseled_copper oxidized_chiseled_copper cut_copper
exposed_cut_copper weathered_cut_copper oxidized_cut_copper cut_copper_stairs exposed_cut_copper_stairs
weathered_cut_copper_stairs oxidized_cut_copper_stairs cut_copper_slab exposed_cut_copper_slab
weathered_cut_copper_slab oxidized_cut_copper_slab waxed_copper_block waxed_exposed_copper waxed_weathered_copper
waxed_oxidized_copper waxed_chiseled_copper waxed_exposed_chiseled_copper waxed_weathered_chiseled_copper
waxed_oxidized_chiseled_copper waxed_cut_copper waxed_exposed_cut_copper waxed_weathered_cut_copper
waxed_oxidized_cut_copper waxed_cut_copper_stairs waxed_exposed_cut_copper_stairs waxed_weathered_cut_copper_stairs
waxed_oxidized_cut_copper_stairs waxed_cut_copper_slab waxed_exposed_cut_copper_slab waxed_weathered_cut_copper_slab
waxed_oxidized_cut_copper_slab oak_log spruce_log birch_log jungle_log acacia_log cherry_log dark_oak_log mangrove_log
mangrove_roots muddy_mangrove_roots crimson_stem warped_stem bamboo_block stripped_oak_log stripped_spruce_log
stripped_birch_log stripped_jungle_log stripped_acacia_log stripped_cherry_log stripped_dark_oak_log
stripped_mangrove_log stripped_crimson_stem stripped_warped_stem stripped_oak_wood stripped_spruce_wood
stripped_birch_wood stripped_jungle_wood stripped_acacia_wood stripped_cherry_wood stripped_dark_oak_wood
stripped_mangrove_wood stripped_crimson_hyphae stripped_warped_hyphae stripped_bamboo_block oak_wood spruce_wood
birch_wood jungle_wood acacia_wood cherry_wood dark_oak_wood mangrove_wood crimson_hyphae warped_hyphae cherry_leaves
azalea_leaves flowering_azalea_leaves sponge wet_sponge glass tinted_glass lapis_block sandstone chiseled_sandstone
cut_sandstone cobweb azalea flowering_azalea dead_bush seagrass sea_pickle white_wool orange_wool magenta_wool
light_blue_wool yellow_wool lime_wool pink_wool gray_wool light_gray_wool cyan_wool purple_wool blue_wool brown_wool
green_wool red_wool black_wool dandelion poppy blue_orchid allium azure_bluet red_tulip orange_tulip white_tulip
pink_tulip oxeye_daisy cornflower lily_of_the_valley wither_rose torchflower pitcher_plant spore_blossom
brown_mushroom red_mushroom crimson_fungus warped_fungus crimson_roots warped_roots nether_sprouts weeping_vines
twisting_vines sugar_cane kelp moss_carpet pink_petals moss_block hanging_roots bamboo oak_slab spruce_slab birch_slab
jungle_slab acacia_slab cherry_slab dark_oak_slab mangrove_slab bamboo_slab bamboo_mosaic_slab crimson_slab
warped_slab stone_slab smooth_stone_slab sandstone_slab cut_sandstone_slab petrified_oak_slab cobblestone_slab
brick_slab stone_brick_slab mud_brick_slab nether_brick_slab quartz_slab red_sandstone_slab cut_red_sandstone_slab
purpur_slab prismarine_slab prismarine_brick_slab dark_prismarine_slab smooth_quartz smooth_red_sandstone
smooth_sandstone smooth_stone bricks bookshelf mossy_cobblestone obsidian end_rod chorus_plant chorus_flower
purpur_block purpur_pillar purpur_stairs spawner crafting_table farmland ladder cobblestone_stairs snow ice snow_block
cactus clay jukebox oak_fence spruce_fence birch_fence jungle_fence acacia_fence cherry_fence dark_oak_fence
mangrove_fence bamboo_fence crimson_fence warped_fence pumpkin carved_pumpkin jack_o_lantern netherrack soul_sand
soul_soil basalt polished_basalt smooth_basalt glowstone infested_stone infested_cobblestone infested_stone_bricks
infested_mossy_stone_bricks infested_cracked_stone_bricks infested_chiseled_stone_bricks infested_deepslate
stone_bricks mossy_stone_bricks cracked_stone_bricks chiseled_stone_bricks packed_mud mud_bricks deepslate_bricks
cracked_deepslate_bricks deepslate_tiles cracked_deepslate_tiles chiseled_deepslate reinforced_deepslate
brown_mushroom_block red_mushroom_block mushroom_stem iron_bars chain glass_pane melon glow_lichen brick_stairs
stone_brick_stairs mud_brick_stairs mycelium nether_bricks cracked_nether_bricks chiseled_nether_bricks
nether_brick_fence nether_brick_stairs sculk sculk_vein sculk_catalyst sculk_shrieker enchanting_table
end_portal_frame end_stone end_stone_bricks sandstone_stairs emerald_block oak_stairs spruce_stairs birch_stairs
jungle_stairs acacia_stairs cherry_stairs dark_oak_stairs mangrove_stairs bamboo_stairs bamboo_mosaic_stairs
crimson_stairs warped_stairs cobblestone_wall mossy_cobblestone_wall brick_wall prismarine_wall red_sandstone_wall
mossy_stone_brick_wall granite_wall stone_brick_wall mud_brick_wall nether_brick_wall andesite_wall
red_nether_brick_wall sandstone_wall end_stone_brick_wall diorite_wall blackstone_wall polished_blackstone_wall
polished_blackstone_brick_wall cobbled_deepslate_wall polished_deepslate_wall deepslate_brick_wall deepslate_tile_wall
anvil chipped_anvil damaged_anvil chiseled_quartz_block quartz_block quartz_bricks quartz_pillar quartz_stairs
white_terracotta orange_terracotta magenta_terracotta light_blue_terracotta yellow_terracotta lime_terracotta
pink_terracotta gray_terracotta light_gray_terracotta cyan_terracotta purple_terracotta blue_terracotta
brown_terracotta green_terracotta red_terracotta black_terracotta hay_block white_carpet orange_carpet magenta_carpet
light_blue_carpet yellow_carpet lime_carpet pink_carpet gray_carpet light_gray_carpet cyan_carpet purple_carpet
blue_carpet brown_carpet green_carpet red_carpet black_carpet terracotta packed_ice dirt_path white_stained_glass
orange_stained_glass magenta_stained_glass light_blue_stained_glass yellow_stained_glass lime_stained_glass
pink_stained_glass gray_stained_glass light_gray_stained_glass cyan_stained_glass purple_stained_glass
blue_stained_glass brown_stained_glass green_stained_glass red_stained_glass black_stained_glass
white_stained_glass_pane orange_stained_glass_pane magenta_stained_glass_pane light_blue_stained_glass_pane
yellow_stained_glass_pane lime_stained_glass_pane pink_stained_glass_pane gray_stained_glass_pane
light_gray_stained_glass_pane cyan_stained_glass_pane purple_stained_glass_pane blue_stained_glass_pane
brown_stained_glass_pane green_stained_glass_pane red_stained_glass_pane black_stained_glass_pane prismarine
prismarine_bricks dark_prismarine prismarine_stairs prismarine_brick_stairs dark_prismarine_stairs sea_lantern
red_sandstone chiseled_red_sandstone cut_red_sandstone red_sandstone_stairs magma_block nether_wart_block
warped_wart_block red_nether_bricks bone_block white_glazed_terracotta orange_glazed_terracotta
magenta_glazed_terracotta light_blue_glazed_terracotta yellow_glazed_terracotta lime_glazed_terracotta
pink_glazed_terracotta gray_glazed_terracotta light_gray_glazed_terracotta cyan_glazed_terracotta
purple_glazed_terracotta blue_glazed_terracotta brown_glazed_terracotta green_glazed_terracotta red_glazed_terracotta
black_glazed_terracotta white_concrete orange_concrete magenta_concrete light_blue_concrete yellow_concrete
lime_concrete pink_concrete gray_concrete light_gray_concrete cyan_concrete purple_concrete blue_concrete
brown_concrete green_concrete red_concrete black_concrete white_concrete_powder orange_concrete_powder
magenta_concrete_powder light_blue_concrete_powder yellow_concrete_powder lime_concrete_powder pink_concrete_powder
gray_concrete_powder light_gray_concrete_powder cyan_concrete_powder purple_concrete_powder blue_concrete_powder
brown_concrete_powder green_concrete_powder red_concrete_powder black_concrete_powder turtle_egg sniffer_egg
dead_tube_coral_block dead_brain_coral_block dead_bubble_coral_block dead_fire_coral_block dead_horn_coral_block
tube_coral_block brain_coral_block bubble_coral_block fire_coral_block horn_coral_block tube_coral brain_coral
bubble_coral fire_coral horn_coral dead_brain_coral dead_bubble_coral dead_fire_coral dead_horn_coral dead_tube_coral
blue_ice polished_granite_stairs smooth_red_sandstone_stairs mossy_stone_brick_stairs polished_diorite_stairs
mossy_cobblestone_stairs end_stone_brick_stairs stone_stairs smooth_sandstone_stairs smooth_quartz_stairs
granite_stairs andesite_stairs red_nether_brick_stairs polished_andesite_stairs diorite_stairs
cobbled_deepslate_stairs polished_deepslate_stairs deepslate_brick_stairs deepslate_tile_stairs polished_granite_slab
smooth_red_sandstone_slab mossy_stone_brick_slab polished_diorite_slab mossy_cobblestone_slab end_stone_brick_slab
smooth_sandstone_slab smooth_quartz_slab granite_slab andesite_slab red_nether_brick_slab polished_andesite_slab
diorite_slab cobbled_deepslate_slab polished_deepslate_slab deepslate_brick_slab deepslate_tile_slab redstone_block
repeater comparator piston sticky_piston slime_block honey_block observer lectern target lever lightning_rod
daylight_detector sculk_sensor calibrated_sculk_sensor tripwire_hook tnt redstone_lamp note_block stone_button
polished_blackstone_button oak_button spruce_button birch_button jungle_button acacia_button cherry_button
dark_oak_button mangrove_button bamboo_button crimson_button warped_button stone_pressure_plate
polished_blackstone_pressure_plate light_weighted_pressure_plate heavy_weighted_pressure_plate oak_pressure_plate
spruce_pressure_plate birch_pressure_plate jungle_pressure_plate acacia_pressure_plate cherry_pressure_plate
dark_oak_pressure_plate mangrove_pressure_plate bamboo_pressure_plate crimson_pressure_plate warped_pressure_plate
iron_trapdoor oak_trapdoor spruce_trapdoor birch_trapdoor jungle_trapdoor acacia_trapdoor cherry_trapdoor
dark_oak_trapdoor mangrove_trapdoor bamboo_trapdoor crimson_trapdoor warped_trapdoor copper_trapdoor
exposed_copper_trapdoor weathered_copper_trapdoor oxidized_copper_trapdoor waxed_copper_trapdoor
waxed_exposed_copper_trapdoor waxed_weathered_copper_trapdoor waxed_oxidized_copper_trapdoor oak_fence_gate
spruce_fence_gate birch_fence_gate jungle_fence_gate acacia_fence_gate cherry_fence_gate dark_oak_fence_gate
mangrove_fence_gate bamboo_fence_gate crimson_fence_gate warped_fence_gate powered_rail detector_rail rail
activator_rail dried_kelp_block flower_pot loom composter cartography_table fletching_table grindstone smithing_table
stonecutter bell lantern soul_lantern shroomlight honeycomb_block lodestone crying_obsidian blackstone blackstone_slab
blackstone_stairs gilded_blackstone polished_blackstone polished_blackstone_slab polished_blackstone_stairs
chiseled_polished_blackstone polished_blackstone_bricks polished_blackstone_brick_slab
polished_blackstone_brick_stairs cracked_polished_blackstone_bricks respawn_anchor candle white_candle orange_candle
magenta_candle light_blue_candle yellow_candle lime_candle pink_candle gray_candle light_gray_candle cyan_candle
purple_candle blue_candle brown_candle green_candle red_candle black_candle small_amethyst_bud medium_amethyst_bud
large_amethyst_bud amethyst_cluster pointed_dripstone ochre_froglight verdant_froglight pearlescent_froglight
copper_grate exposed_copper_grate weathered_copper_grate oxidized_copper_grate waxed_copper_grate
waxed_exposed_copper_grate waxed_weathered_copper_grate waxed_oxidized_copper_grate copper_bulb exposed_copper_bulb
weathered_copper_bulb oxidized_copper_bulb waxed_copper_bulb waxed_exposed_copper_bulb waxed_weathered_copper_bulb
waxed_oxidized_copper_bulb trial_spawner vault
`)
add('minecraft','flat','net.minecraft.world.item.Item',`
turtle_scute armadillo_scute bowl apple coal charcoal diamond emerald lapis_lazuli quartz amethyst_shard raw_iron
iron_ingot raw_copper copper_ingot raw_gold gold_ingot netherite_ingot netherite_scrap stick mushroom_stew feather
gunpowder wheat bread flint porkchop cooked_porkchop golden_apple enchanted_golden_apple leather brick clay_ball paper
slime_ball glowstone_dust cod salmon tropical_fish pufferfish cooked_cod cooked_salmon bone sugar cookie melon_slice
dried_kelp beef cooked_beef chicken cooked_chicken rotten_flesh blaze_rod ghast_tear gold_nugget spider_eye
fermented_spider_eye blaze_powder magma_cream glistering_melon_slice baked_potato poisonous_potato golden_carrot
nether_star pumpkin_pie nether_brick prismarine_shard prismarine_crystals rabbit cooked_rabbit rabbit_stew rabbit_foot
rabbit_hide mutton cooked_mutton popped_chorus_fruit beetroot beetroot_soup dragon_breath totem_of_undying
shulker_shell iron_nugget music_disc_13 music_disc_cat music_disc_blocks music_disc_chirp music_disc_creator
music_disc_creator_music_box music_disc_far music_disc_mall music_disc_mellohi music_disc_stal music_disc_strad
music_disc_ward music_disc_11 music_disc_wait music_disc_otherside music_disc_relic music_disc_5 music_disc_pigstep
music_disc_precipice phantom_membrane nautilus_shell heart_of_the_sea echo_shard angler_pottery_sherd
archer_pottery_sherd arms_up_pottery_sherd blade_pottery_sherd brewer_pottery_sherd burn_pottery_sherd
danger_pottery_sherd explorer_pottery_sherd flow_pottery_sherd friend_pottery_sherd guster_pottery_sherd
heart_pottery_sherd heartbreak_pottery_sherd howl_pottery_sherd miner_pottery_sherd mourner_pottery_sherd
plenty_pottery_sherd prize_pottery_sherd scrape_pottery_sherd sheaf_pottery_sherd shelter_pottery_sherd
skull_pottery_sherd snort_pottery_sherd trial_key ominous_trial_key breeze_rod
`)
add('minecraft','json','net.minecraft.world.item.ItemNameBlockItem',`
redstone string wheat_seeds cocoa_beans nether_wart carrot potato torchflower_seeds pitcher_pod beetroot_seeds
sweet_berries glow_berries
`)
add('minecraft','flat','net.minecraft.world.item.BookItem',`
book
`)
add('minecraft','flat','net.minecraft.world.item.WritableBookItem',`
writable_book
`)
add('minecraft','flat','net.minecraft.world.item.WrittenBookItem',`
written_book
`)
// Items.cut constructs cto (EnchantedBookItem) with the default glint override
// kq.t=true. The class inherits the generated original item model.
add('minecraft','flat','net.minecraft.world.item.EnchantedBookItem','enchanted_book')
add('farmersdelight','json','net.minecraft.world.item.BlockItem',`
stove cutting_board wooden_basket bamboo_basket carrot_crate potato_crate beetroot_crate cabbage_crate tomato_crate
onion_crate rice_bale rice_bag straw_bale safety_net oak_cabinet spruce_cabinet birch_cabinet jungle_cabinet
acacia_cabinet dark_oak_cabinet mangrove_cabinet cherry_cabinet bamboo_cabinet crimson_cabinet warped_cabinet tatami
full_tatami_mat half_tatami_mat canvas_rug rope_fence rope_fence_gate organic_compost rich_soil rich_soil_farmland
sandy_shrub wild_cabbages wild_onions wild_tomatoes wild_carrots wild_potatoes wild_beetroots
`)
add('farmersdelight','flat','net.minecraft.world.item.Item',`
straw canvas tree_bark cabbage tomato rice_panicle fried_egg wheat_dough raw_pasta pumpkin_slice cabbage_leaf
minced_beef beef_patty chicken_cuts cooked_chicken_cuts bacon cooked_bacon cod_slice cooked_cod_slice salmon_slice
cooked_salmon_slice mutton_chops cooked_mutton_chops ham smoked_ham pie_crust sweet_berry_cookie honey_cookie
barbecue_stick egg_sandwich chicken_sandwich hamburger bacon_sandwich mutton_wrap dumplings stuffed_potato
cabbage_rolls salmon_roll cod_roll kelp_roll kelp_roll_slice
`)
add('farmersdelight','flat','vectorwing.farmersdelight.common.item.ConsumableItem',`
tomato_sauce cake_slice apple_pie_slice sweet_berry_cheesecake_slice chocolate_pie_slice pumpkin_pie_slice
glow_berry_custard fruit_salad mixed_salad nether_salad cooked_rice beef_stew chicken_soup vegetable_soup fish_stew
fried_rice pumpkin_soup baked_cod_stew noodle_soup onion_soup bacon_and_eggs pasta_with_meatballs
pasta_with_mutton_chop mushroom_rice roasted_mutton_chops vegetable_noodles steak_and_potatoes ratatouille
squid_ink_pasta grilled_salmon roast_chicken stuffed_pumpkin honey_glazed_ham shepherds_pie gleaming_salad
`)

add('minecraft','json','net.minecraft.world.item.StandingAndWallBlockItem',`
torch soul_torch tube_coral_fan brain_coral_fan bubble_coral_fan fire_coral_fan horn_coral_fan dead_tube_coral_fan
dead_brain_coral_fan dead_bubble_coral_fan dead_fire_coral_fan dead_horn_coral_fan redstone_torch skeleton_skull
wither_skeleton_skull zombie_head creeper_head dragon_head piglin_head
`)
add('minecraft','flat','net.minecraft.world.item.ArrowItem',`
arrow
`)
add('minecraft','flat','net.minecraft.world.item.SwordItem',`
wooden_sword stone_sword golden_sword iron_sword diamond_sword netherite_sword
`)
add('minecraft','flat','net.minecraft.world.item.ShovelItem',`
wooden_shovel stone_shovel golden_shovel iron_shovel diamond_shovel netherite_shovel
`)
add('minecraft','flat','net.minecraft.world.item.PickaxeItem',`
wooden_pickaxe stone_pickaxe golden_pickaxe iron_pickaxe diamond_pickaxe netherite_pickaxe
`)
add('minecraft','flat','net.minecraft.world.item.AxeItem',`
wooden_axe stone_axe golden_axe iron_axe diamond_axe netherite_axe
`)
add('minecraft','flat','net.minecraft.world.item.HoeItem',`
wooden_hoe stone_hoe golden_hoe iron_hoe diamond_hoe netherite_hoe
`)
add('minecraft','flat','net.minecraft.world.item.SnowballItem',`
snowball
`)
add('minecraft','flat','net.minecraft.world.item.EggItem',`
egg
`)
add('minecraft','flat','net.minecraft.world.item.ShearsItem',`
shears
`)
add('minecraft','flat','net.minecraft.world.item.EnderpearlItem',`
ender_pearl
`)
add('minecraft','flat','net.minecraft.world.item.SpectralArrowItem',`
spectral_arrow
`)
add('minecraft','flat','net.minecraft.world.item.EnderEyeItem',`ender_eye`)
add('minecraft','flat','net.minecraft.world.item.ExperienceBottleItem',`experience_bottle`)
add('minecraft','flat','net.minecraft.world.item.FireChargeItem',`fire_charge`)
// BlockEntityWithoutLevelRenderer uses the original closed single chest model,
// not JSON block elements. Keep this provider separate from JSON BlockItems.
add('minecraft','chest','net.minecraft.world.item.BlockItem',`chest trapped_chest ender_chest`)
add('minecraft','shield','net.minecraft.world.item.ShieldItem','shield')
// Locked Items registration: ordinary BlockItem models (lit state is not an
// item property). BucketItem/SaddleItem change use behaviour, not their model.
add('minecraft','json','net.minecraft.world.item.BlockItem','furnace blast_furnace smoker')
add('minecraft','flat','net.minecraft.world.item.BucketItem','bucket')
add('minecraft','flat','net.minecraft.world.item.SaddleItem','saddle')
// Confirmed by the locked 1.21.1 BuiltInRegistries class export. These use the
// original static JSON GUI path; override, tint and component guards still apply.
add('minecraft','flat','net.minecraft.world.item.BottleItem','glass_bottle')
add('minecraft','flat','net.minecraft.world.item.BoneMealItem','bone_meal')
// InkSacItem cuh.class SHA256 da94ade9913ffce10fe062a49a48a6d604b11d7337b53184a807989abaa9c832:
// only use-on-sign behavior, no ItemProperties/ItemColors override in gps/fhu.
add('minecraft','flat','net.minecraft.world.item.InkSacItem','ink_sac')
// ArmorItem csf.class SHA256 b70f2de931112790b123a7946e4403850e6466fc1448caac31db4f4659df25c4,
// locked 1.21.1 Items registrations. No dye or trim is
// substituted: the existing component guard refuses those visual inputs.
add('minecraft','flat','net.minecraft.world.item.ArmorItem',`
turtle_helmet chainmail_helmet chainmail_chestplate chainmail_leggings chainmail_boots
iron_helmet iron_chestplate iron_leggings iron_boots golden_helmet golden_chestplate golden_leggings golden_boots
diamond_helmet diamond_chestplate diamond_leggings diamond_boots netherite_helmet netherite_chestplate netherite_leggings netherite_boots
`)
add('minecraft','flat','net.minecraft.world.item.ItemNameBlockItem','pumpkin_seeds melon_seeds')
// Items.vS constructs TridentItem (cwn). ItemRenderer glh explicitly selects
// item/trident for GUI/ground/fixed; the in-hand builtin/entity model is a
// different provider and must never borrow this flat inventory sprite.
add('minecraft','gui-flat','net.minecraft.world.item.TridentItem','trident')
add('minecraft','banner','net.minecraft.world.item.BannerItem',`
white_banner orange_banner magenta_banner light_blue_banner yellow_banner lime_banner pink_banner gray_banner
light_gray_banner cyan_banner purple_banner blue_banner brown_banner green_banner red_banner black_banner
`)
export const NATIVE_STATIC_ITEM_NAMES = Object.freeze([...table.keys()])
export const NATIVE_STATIC_BLOCK_ITEM_NAMES = Object.freeze([...table].filter(([,e])=>e.kind==='json').map(([id])=>id))
export const nativeStaticItemEvidence = name => table.get(name) ?? null
export function verifyNativeStaticItemEvidence(reader,name) {
  const evidence=nativeStaticItemEvidence(name)
  if(!evidence) throw Error('NATIVE_ITEM_STATIC_PROVIDER_UNVERIFIED')
  if(reader.manifest?.minecraftVersion!=='1.21.1'||reader.manifest.assetIntegrityVerified!==true)throw Error('NATIVE_ITEM_STATIC_MANIFEST_UNVERIFIED')
  if(reader.manifest.clientJarSha256!==STATIC_ITEM_SOURCES.minecraft.sha256) throw Error('NATIVE_ITEM_STATIC_CLIENT_UNVERIFIED')
  // Launchers commonly name the identical official client "1.21.1.jar".
  // Content identity is the locked SHA, not its local filename. Include name
  // collisions too so a conflicting canonical declaration or duplicate alias
  // cannot pass the uniqueness/override checks below.
  const sources=Array.isArray(reader.manifest.sources)?reader.manifest.sources.filter(s=>s.name===evidence.source.name||s.sha256===evidence.source.sha256):[]
  if(sources.length!==1||sources[0].sha256!==evidence.source.sha256||sources[0].explicitOverride) throw Error('NATIVE_ITEM_STATIC_SOURCE_UNVERIFIED')
  return evidence
}
// These inputs affect tooltip/gameplay/overlays, not the audited static Item
// model. Keep every value and NBT type in the authoritative stack/cache key.
const NON_VISUAL=new Set(['minecraft:custom_name','minecraft:item_name','minecraft:lore','minecraft:rarity','minecraft:custom_data',
  'minecraft:damage','minecraft:max_damage','minecraft:max_stack_size','minecraft:unbreakable','minecraft:repair_cost',
  'minecraft:hide_tooltip','minecraft:hide_additional_tooltip','minecraft:food','minecraft:fire_resistant',
  'minecraft:attribute_modifiers','minecraft:can_break','minecraft:can_place_on',
  'minecraft:writable_book_content','minecraft:written_book_content'])
const KNOWN=new Set([...NON_VISUAL,'minecraft:enchantments','minecraft:stored_enchantments','minecraft:enchantment_glint_override'])
const DEFAULT_GLINT=new Set(['minecraft:enchanted_golden_apple','minecraft:nether_star','minecraft:written_book','minecraft:enchanted_book'])
const record=value=>value&&typeof value==='object'&&!Array.isArray(value)
export function nativeStaticItemState(input,{allowPartialGlint=false}={}) {
  const stack=input?.id?input:parseNativeItemStack(input),evidence=nativeStaticItemEvidence(stack.id)
  if(!evidence||!Number.isSafeInteger(stack.count)||stack.count<=0||!record(stack.components)) throw Error('NATIVE_ITEM_STATIC_PROVIDER_UNVERIFIED')
  // GlassSwordItem.hurt only reads this unit component for durability. The
  // registered item has no ItemProperties/ItemColors override for it; a long
  // sidestep timestamp likewise cannot change this sword's original model.
  // Retain the complete original stack/cache key, including typed long values.
  if(stack.id==='twilightforest:glass_sword'){
    const components=Object.fromEntries(Object.entries(stack.components).filter(([key])=>!['twilightforest:infinite_glass_sword','twilightforest:sidestep_cooldown'].includes(key.replace(/^!/,''))))
    for(const [key,value] of Object.entries(stack.components))if(key.startsWith('!')&&(!record(value)||Object.keys(value).length||Object.hasOwn(stack.components,key.slice(1))))throw Error('NATIVE_ITEM_COMPONENT_PATCH_INVALID')
    return {...nativeItemComponentState({...stack,components},{allowPartialGlint}),stack,evidence}
  }
  return {...nativeItemComponentState(stack,{allowPartialGlint}),evidence}
}
// Component validation is shared with positively registered dynamic GUI items;
// accepting components alone never registers a new rendering provider.
export function nativeItemComponentState(stack,{allowPartialGlint=false}={}) {
  if(!stack||!Number.isSafeInteger(stack.count)||stack.count<=0||!record(stack.components))throw Error('NATIVE_ITEM_COMPONENT_PATCH_INVALID')
  const components=stack.components
  for(const [key,value] of Object.entries(components)) {
    const name=key.startsWith('!')?key.slice(1):key
    const banner=name==='minecraft:banner_patterns'&&nativeStaticItemEvidence(stack.id)?.kind==='banner';
    if(banner&&!key.startsWith('!'))nativeBannerLayers(stack)
    if(!KNOWN.has(name)&&!banner) throw Error(`NATIVE_ITEM_VISUAL_COMPONENT_UNSUPPORTED:${key}`)
    if(key.startsWith('!')&&(!record(value)||Object.keys(value).length||Object.hasOwn(components,name))) throw Error('NATIVE_ITEM_COMPONENT_PATCH_INVALID')
  }
  let foil=Object.hasOwn(components,'!minecraft:enchantment_glint_override')?null:DEFAULT_GLINT.has(stack.id)?true:null
  if(Object.hasOwn(components,'minecraft:enchantment_glint_override')) {
    const value=components['minecraft:enchantment_glint_override'],n=nativeNumericValue(value)
    if(value===true||n===1)foil=true
    else if(value===false||n===0)foil=false
    else throw Error('NATIVE_ITEM_GLINT_STATE_INVALID')
  }
  if(foil===true&&!allowPartialGlint)throw Error('NATIVE_ITEM_GLINT_UNSUPPORTED')
  for(const key of ['minecraft:enchantments','minecraft:stored_enchantments']) {
    if(!Object.hasOwn(components,key))continue
    const value=components[key]
    if(!record(value)||Object.keys(value).some(name=>!['levels','show_in_tooltip'].includes(name))||
      (value.levels!==undefined&&!record(value.levels)))throw Error('NATIVE_ITEM_ENCHANTMENTS_INVALID')
    // Stored book enchantments do not make ItemStack.hasEnchantments() true;
    // the book's default glint component above supplies that visual state.
    if(key==='minecraft:enchantments'&&Object.keys(value.levels??{}).length&&foil!==false){
      if(!allowPartialGlint)throw Error('NATIVE_ITEM_GLINT_UNSUPPORTED');foil=true
    }
  }
  return {stack,foil:foil===true}
}
