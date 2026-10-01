/**
 * Renderer-independent art direction for every named world character.
 *
 * This manifest deliberately contains no Three.js objects and no remote URLs.
 * A trusted GLB/VRM loader can bind a local asset to `asset.manifestId`; the
 * procedural renderer can consume `fallback` and the same proportions,
 * palette, hair, outfit and prop descriptions when an authored asset is not
 * installed. Identity keys are the stable join key with server entities.
 */

export const CHARACTER_VISUAL_PROFILE_SCHEMA_VERSION = 1;

const COLOR = /^#[0-9a-f]{6}$/u;

const layer = (slot, garment, material, color, detail) => ({ slot, garment, material, color, detail });
const prop = (id, label, category, attachment, color = "accent") => ({ id, label, category, attachment, color });

function visual({
  identityName,
  identityKey,
  slug,
  gender,
  lifeStage,
  stature,
  build,
  proportions,
  face,
  hair,
  palette,
  silhouette,
  layers,
  props,
  profession,
  signatureMotif,
  signatureFeatures,
  fallback,
  assetBudget,
}) {
  return deepFreeze({
    schemaVersion: CHARACTER_VISUAL_PROFILE_SCHEMA_VERSION,
    id: `${identityKey}:visual-v1`,
    identityName,
    identityKey,
    presentation: { gender, lifeStage, stature, build },
    proportions: {
      heightScale: proportions[0],
      shoulderScale: proportions[1],
      headScale: proportions[2],
    },
    face: {
      shape: face[0],
      skinTone: face[1],
      eyeColor: face[2],
      eyeShape: face[3],
      facialHair: face[4],
      distinguishingMarks: face[5] ?? [],
    },
    hair: {
      style: hair[0],
      length: hair[1],
      color: hair[2],
      ornaments: hair[3] ?? [],
    },
    outfit: {
      silhouette,
      palette,
      layers,
    },
    props,
    profession: {
      key: profession[0],
      label: profession[1],
      defaultPose: profession[2],
    },
    signatureMotif,
    signatureFeatures,
    asset: {
      manifestId: `characters/${slug}`,
      preferredFormat: "glb",
      acceptedFormats: ["glb", "vrm"],
      rig: "humanoid-standard-v1",
      animationSet: "lantern-humanoid-v1",
      fallbackRenderer: "procedural-toon-v2",
      budget: {
        maximumTriangles: assetBudget?.maximumTriangles ?? (["child", "slender", "lean"].includes(build) ? 28_000 : 36_000),
        maximumMaterials: assetBudget?.maximumMaterials ?? 12,
        maximumTextures: assetBudget?.maximumTextures ?? 8,
        maximumTextureSize: assetBudget?.maximumTextureSize ?? 2048,
      },
    },
    fallback,
  });
}

function suppliedVisual({
  identityName,
  identityKey,
  slug,
  gender = "masculine",
  lifeStage = "young-adult",
  stature = "average",
  build = "athletic",
  proportions = [1, 1, 1],
  face,
  hair,
  palette,
  silhouette,
  profession,
  signatureMotif,
  signatureFeatures,
  propSpecs,
  fallback,
}) {
  return visual({
    identityName,
    identityKey,
    slug,
    gender,
    lifeStage,
    stature,
    build,
    proportions,
    face,
    hair,
    palette,
    silhouette,
    layers: [
      layer("base", `${identityName}内衬`, "technical-cloth", "secondary", "close-fitted movement layer"),
      layer("outer", `${identityName}标志外装`, "woven-cloth", "primary", silhouette),
      layer("shoulder", `${identityName}护肩`, "cloth-metal", "metal", signatureFeatures[0]),
      layer("waist", `${identityName}装备带`, "leather-cloth", "accent", signatureFeatures[1]),
      layer("footwear", `${identityName}战斗靴`, "leather-cloth", "primary", "terrain-ready sole"),
    ],
    props: propSpecs.map(([id, label, category, attachment, color]) => prop(id, label, category, attachment, color)),
    profession,
    signatureMotif,
    signatureFeatures,
    fallback,
    assetBudget: {
      maximumTriangles: 80_000,
      maximumMaterials: 12,
      maximumTextures: 8,
      maximumTextureSize: 4096,
    },
  });
}

export const CHARACTER_VISUAL_PROFILES = Object.freeze([
  visual({
    identityName: "书商·墨白", identityKey: "npc-d3f933645b7d10682f5a18ee", slug: "mobai-bookseller",
    gender: "masculine", lifeStage: "middle-aged", stature: "average", build: "slender", proportions: [1, 0.94, 1],
    face: ["long", "#bd825d", "#6b4a32", "calm", "short-goatee", []],
    hair: ["neat-side-part", "short", "#2b211f", ["navy scholar cap"]],
    palette: { primary: "#263c78", secondary: "#d8c8a5", accent: "#b99345", metal: "#806a45" },
    silhouette: "layered-scholar-robes",
    layers: [
      layer("base", "交领内衫", "linen", "secondary", "ivory standing collar"),
      layer("outer", "长襟书商袍", "woven-cloth", "primary", "ink-blue split hem"),
      layer("waist", "书袋腰封", "leather", "accent", "ledger pouches"),
      layer("legwear", "束脚长裤", "cloth", "primary", "quiet travel cut"),
      layer("footwear", "软底书靴", "leather", "metal", "low heel"),
    ],
    props: [prop("ledger-book", "旧页账册", "book", "left-hand"), prop("writing-brush", "墨笔", "tool", "right-hand")],
    profession: ["bookseller", "书商", "reading-ledger"], signatureMotif: "old-pages-and-gold-book-clasps",
    signatureFeatures: ["navy scholar cap", "gold book clasps", "ink-stained fingertips"],
    fallback: { archetype: "scholar", headgear: "scholar", prop: "book", hairStyle: "short", beard: true, cape: false, robe: true },
  }),
  visual({
    identityName: "铁匠·岳山", identityKey: "npc-9b574b1b314ee9dece0aef95", slug: "yueshan-blacksmith",
    gender: "masculine", lifeStage: "middle-aged", stature: "tall", build: "broad", proportions: [1.05, 1.12, 0.98],
    face: ["square", "#a96f50", "#4a3327", "focused", "full-short-beard", ["left brow burn scar"]],
    hair: ["brushed-back", "short", "#2b2522", ["charcoal head wrap"]],
    palette: { primary: "#3b4148", secondary: "#792e25", accent: "#e2872c", metal: "#9aa0a5" },
    silhouette: "broad-forge-apron",
    layers: [
      layer("base", "卷袖工匠衫", "linen", "secondary", "heat-worn sleeves"),
      layer("outer", "重皮锻造围裙", "leather", "primary", "hammer loops"),
      layer("shoulder", "单侧护肩", "steel", "metal", "soot-darkened"),
      layer("waist", "工具腰带", "leather", "accent", "rivets and loops"),
      layer("footwear", "包铁工靴", "leather-steel", "primary", "reinforced toe"),
    ],
    props: [prop("forge-hammer", "山火锻锤", "weapon-tool", "right-hand"), prop("forge-tongs", "长柄火钳", "tool", "belt")],
    profession: ["blacksmith", "铁匠", "hammer-resting-on-shoulder"], signatureMotif: "mountain-hammer-and-ember-orange",
    signatureFeatures: ["brow burn scar", "ember-orange apron rivets", "oversized forge hammer"],
    fallback: { archetype: "smith", headgear: "smith", prop: "hammer", hairStyle: "short", beard: true, cape: false, robe: false },
  }),
  visual({
    identityName: "甲匠·石磊", identityKey: "npc-23ac7457fe3aeced2e1be1d0", slug: "shilei-armorer",
    gender: "masculine", lifeStage: "adult", stature: "tall", build: "stocky", proportions: [1.04, 1.09, 0.97],
    face: ["angular", "#b97f5b", "#53616c", "watchful", "trimmed-beard", ["small nose bridge scar"]],
    hair: ["close-cropped", "short", "#26282b", ["raised steel visor"]],
    palette: { primary: "#292d32", secondary: "#82909b", accent: "#345c91", metal: "#b9c2c8" },
    silhouette: "layered-armorer-plates",
    layers: [
      layer("base", "高领衬甲", "quilted-cloth", "primary", "diamond stitching"),
      layer("outer", "分片胸甲", "steel", "metal", "blue enamel edges"),
      layer("shoulder", "叠瓦肩甲", "steel", "secondary", "asymmetric plates"),
      layer("waist", "铆钉护腰", "leather-steel", "accent", "armor tools"),
      layer("footwear", "甲匠胫靴", "steel-leather", "primary", "wide stable sole"),
    ],
    props: [prop("armor-tongs", "甲片钳", "tool", "right-hand"), prop("sample-pauldron", "试制肩甲", "armor", "left-hand")],
    profession: ["armorer", "甲匠", "inspecting-armor-plate"], signatureMotif: "blue-enamel-wall-plates",
    signatureFeatures: ["raised visor", "blue enamel armor edges", "sample pauldron"],
    fallback: { archetype: "smith", headgear: "visor", prop: "tongs", hairStyle: "short", beard: true, cape: false, robe: false },
  }),
  visual({
    identityName: "书商·云笈", identityKey: "npc-f685b845661a789ece97b291", slug: "yunji-map-bookseller",
    gender: "feminine", lifeStage: "young-adult", stature: "average", build: "slender", proportions: [0.99, 0.87, 1.03],
    face: ["heart", "#d6a17e", "#477d73", "bright", "none", []],
    hair: ["half-up-cloud-knot", "long", "#33302c", ["pale cloud hairpin"]],
    palette: { primary: "#285746", secondary: "#dde1d1", accent: "#62a99a", metal: "#b6c8b9" },
    silhouette: "light-map-scholar-coat",
    layers: [
      layer("base", "浅色书吏衫", "silk-linen", "secondary", "cloud collar"),
      layer("outer", "青绿短披袍", "woven-cloth", "primary", "map-pocket sleeves"),
      layer("shoulder", "云纹披肩", "soft-cloth", "accent", "light layered edge"),
      layer("waist", "卷轴腰封", "leather-cloth", "primary", "map tubes"),
      layer("footwear", "行云短靴", "leather", "metal", "quiet sole"),
    ],
    props: [prop("weather-scroll", "云图卷轴", "map", "both-hands"), prop("cloud-bookmark", "云签", "charm", "waist")],
    profession: ["map-bookseller", "书商", "unrolling-weather-map"], signatureMotif: "cloud-scroll-and-jade-green",
    signatureFeatures: ["cloud hairpin", "rolled weather maps", "jade-green scholar coat"],
    fallback: { archetype: "scholar", headgear: "cloud", prop: "scroll", hairStyle: "long", beard: false, cape: true, robe: true },
  }),
  visual({
    identityName: "神官·静水", identityKey: "npc-d6364b74e7eb3537406f7538", slug: "jingshui-water-priestess",
    gender: "feminine", lifeStage: "young-adult", stature: "average", build: "slender", proportions: [1.01, 0.86, 1.02],
    face: ["oval", "#e2b18e", "#44d7e5", "serene", "none", []],
    hair: ["center-part-flowing", "very-long", "#181a20", ["silver-blue crystal crown"]],
    palette: { primary: "#236e78", secondary: "#a9d7d7", accent: "#dce5e8", metal: "#9edbe0" },
    silhouette: "flowing-water-priest-robes",
    layers: [
      layer("base", "白色祭衣", "silk", "accent", "aqua standing collar"),
      layer("outer", "静水长袍", "silk-chiffon", "primary", "flowing translucent panels"),
      layer("shoulder", "水纹肩纱", "chiffon", "secondary", "crystal droplets"),
      layer("waist", "银蓝仪式腰带", "metal-cloth", "metal", "water gem"),
      layer("footwear", "祭司云履", "silk-leather", "secondary", "silver trim"),
    ],
    props: [prop("water-bowl", "流光水盏", "ritual", "both-hands"), prop("water-censer", "净水香炉", "ritual", "waist")],
    profession: ["water-priestess", "神官", "presenting-water-bowl"], signatureMotif: "floating-water-and-crystal-crown",
    signatureFeatures: ["aqua eyes", "silver-blue crystal crown", "floating luminous water"],
    fallback: { archetype: "priest", headgear: "water_crown", prop: "censer", hairStyle: "long", beard: false, cape: true, robe: true },
  }),
  visual({
    identityName: "货郎·福伯", identityKey: "npc-c38a049a5b14f201b0af1293", slug: "fubo-travelling-merchant",
    gender: "masculine", lifeStage: "older-adult", stature: "short", build: "average", proportions: [0.97, 1, 1.01],
    face: ["round", "#bb8057", "#59402d", "kind", "moustache-and-goatee", ["smile lines"]],
    hair: ["side-grey", "short", "#5c5148", ["patchwork merchant cap"]],
    palette: { primary: "#a8752d", secondary: "#66713a", accent: "#b84232", metal: "#9b8153" },
    silhouette: "travel-pack-and-short-cape",
    layers: [
      layer("base", "旧麻旅行衫", "linen", "secondary", "rolled sleeves"),
      layer("outer", "百路短褂", "woven-cloth", "primary", "patched pockets"),
      layer("shoulder", "防雨短斗篷", "waxed-cloth", "accent", "worn hem"),
      layer("waist", "杂货腰带", "leather", "metal", "small wares"),
      layer("footwear", "千里行靴", "leather", "primary", "dusty toe"),
    ],
    props: [prop("merchant-pack", "百路货箱", "container", "back"), prop("sample-tray", "小货盘", "trade", "left-hand")],
    profession: ["travelling-merchant", "货郎", "showing-small-wares"], signatureMotif: "patchwork-pack-and-red-tassels",
    signatureFeatures: ["oversized patchwork pack", "red price tassels", "warm smile lines"],
    fallback: { archetype: "merchant", headgear: "merchant", prop: "pack", hairStyle: "short", beard: true, cape: true, robe: false },
  }),
  visual({
    identityName: "灯窝·阿爹", identityKey: "npc-ade9c904461d5ab2a929b6c6", slug: "adie-leatherworker",
    gender: "masculine", lifeStage: "middle-aged", stature: "average", build: "sturdy", proportions: [1.01, 1.05, 0.99],
    face: ["broad", "#a96d4d", "#563a29", "warm", "neat-stubble", ["right cheek dimple"]],
    hair: ["swept-grey-temples", "short", "#453832", ["fur-lined work band"]],
    palette: { primary: "#4d3227", secondary: "#a96f3f", accent: "#dba13a", metal: "#8b6b47" },
    silhouette: "artisan-leather-apron",
    layers: [
      layer("base", "暖棕工匠衫", "linen", "secondary", "rolled sleeves"),
      layer("outer", "厚皮围裙", "leather", "primary", "stitched tool loops"),
      layer("shoulder", "毛边护肩", "fur-leather", "accent", "single shoulder"),
      layer("waist", "针具工具带", "leather", "metal", "awl and punch"),
      layer("footwear", "皮匠工作靴", "leather", "primary", "stitched toe"),
    ],
    props: [prop("leather-roll", "鞣制皮卷", "craft", "left-arm"), prop("leather-awl", "皮锥", "tool", "right-hand")],
    profession: ["leatherworker", "皮匠", "checking-leather-stitch"], signatureMotif: "amber-stitching-and-fur-shoulder",
    signatureFeatures: ["grey temples", "amber cross-stitches", "rolled leather"],
    fallback: { archetype: "tanner", headgear: "fur", prop: "leather", hairStyle: "short", beard: true, cape: false, robe: false },
  }),
  visual({
    identityName: "墨先生", identityKey: "npc-955c7244a414c9139448fca9", slug: "master-mo-calligrapher",
    gender: "masculine", lifeStage: "middle-aged", stature: "tall", build: "slender", proportions: [1.04, 0.91, 1],
    face: ["slim", "#c58a65", "#4c4658", "thoughtful", "neat-short-beard", []],
    hair: ["formal-tied", "medium", "#24222a", ["tall navy scholarly cap", "rectangular spectacles"]],
    palette: { primary: "#171a24", secondary: "#4b3976", accent: "#b6453a", metal: "#8a8298" },
    silhouette: "tall-calligrapher-robes",
    layers: [
      layer("base", "深蓝交领内袍", "silk-linen", "secondary", "crisp collar"),
      layer("outer", "墨色长袖学者袍", "woven-silk", "primary", "wide brush sleeve"),
      layer("shoulder", "窄肩披领", "brocade", "secondary", "subtle ink pattern"),
      layer("waist", "砚盒腰封", "leather-cloth", "accent", "brush loops"),
      layer("footwear", "乌木文士履", "cloth-leather", "primary", "square toe"),
    ],
    props: [prop("calligraphy-book", "深蓝书册", "book", "left-hand"), prop("calligraphy-brush", "长锋墨笔", "tool", "right-hand")],
    profession: ["calligrapher", "墨师", "brush-poised-over-book"], signatureMotif: "red-seal-and-rectangular-spectacles",
    signatureFeatures: ["rectangular spectacles", "tall scholar cap", "red seal cord"],
    fallback: { archetype: "scholar", headgear: "tall_scholar", prop: "ink_scroll", hairStyle: "formal", beard: true, cape: false, robe: true },
  }),
  visual({
    identityName: "渔夫·浪伯", identityKey: "npc-2edb554af4a89e89454fd91a", slug: "langbo-fisherman",
    gender: "masculine", lifeStage: "older-adult", stature: "average", build: "lean", proportions: [1, 0.98, 1],
    face: ["weathered", "#9f694e", "#49677a", "kind", "salt-and-pepper-beard", ["sun lines"]],
    hair: ["wind-swept-grey", "short", "#55575a", ["reed fishing hat"]],
    palette: { primary: "#24445f", secondary: "#c2a879", accent: "#c95f4e", metal: "#778991" },
    silhouette: "reed-hat-and-net-cape",
    layers: [
      layer("base", "粗麻水手衫", "linen", "secondary", "open collar"),
      layer("outer", "靛蓝防水短衣", "waxed-cloth", "primary", "rope fasteners"),
      layer("shoulder", "渔网披搭", "rope-net", "accent", "weighted corners"),
      layer("waist", "鱼篓腰绳", "rope-leather", "secondary", "hooks and floats"),
      layer("footwear", "涉水长靴", "rubberized-leather", "primary", "high cuff"),
    ],
    props: [prop("fishing-rod", "旧竹钓竿", "tool", "right-hand"), prop("cast-net", "撒网", "tool", "back")],
    profession: ["fisherman", "渔夫", "rod-over-shoulder"], signatureMotif: "red-float-and-reed-hat",
    signatureFeatures: ["reed hat", "red fishing floats", "net draped over shoulder"],
    fallback: { archetype: "fisher", headgear: "reed", prop: "fishing_rod", hairStyle: "short", beard: true, cape: true, robe: false },
  }),
  visual({
    identityName: "货郎·铜板", identityKey: "npc-d1dd592a2ea60d00ebd65008", slug: "tongban-scale-merchant",
    gender: "masculine", lifeStage: "young-adult", stature: "average", build: "slender", proportions: [1, 0.93, 1.01],
    face: ["diamond", "#c78d66", "#3e766e", "alert", "none", []],
    hair: ["high-side-sweep", "medium", "#352b26", ["copper coin clasp"]],
    palette: { primary: "#956a43", secondary: "#4e887d", accent: "#c87532", metal: "#b98045" },
    silhouette: "nimble-scale-merchants-coat",
    layers: [
      layer("base", "青绿商旅衫", "linen", "secondary", "narrow sleeves"),
      layer("outer", "铜扣短外套", "woven-cloth", "primary", "asymmetric closure"),
      layer("shoulder", "轻便货带", "leather", "accent", "sample hooks"),
      layer("waist", "钱袋腰封", "leather", "metal", "sealed pouches"),
      layer("footwear", "集市短靴", "leather", "primary", "quick-step sole"),
    ],
    props: [prop("balance-scale", "公平铜秤", "trade", "right-hand"), prop("sealed-coins", "封口钱袋", "container", "waist")],
    profession: ["scale-merchant", "货郎", "balancing-hand-scale"], signatureMotif: "copper-scale-and-teal-sash",
    signatureFeatures: ["coin hair clasp", "perfectly level hand scale", "teal sash"],
    fallback: { archetype: "merchant", headgear: "coin", prop: "scales", hairStyle: "swept", beard: false, cape: false, robe: false },
  }),
  visual({
    identityName: "守夜人·烛九", identityKey: "npc-148ee37f5f20a97561755b54", slug: "zhujiu-night-watchman",
    gender: "masculine", lifeStage: "older-adult", stature: "tall", build: "rugged", proportions: [1.04, 1.06, 0.99],
    face: ["rugged", "#ad7453", "#73664f", "vigilant", "short-grey-beard", ["right cheek scar"]],
    hair: ["short-grey", "short", "#67676a", ["broad dark watch hat"]],
    palette: { primary: "#26272b", secondary: "#873d28", accent: "#f0b84b", metal: "#7d7468" },
    silhouette: "broad-hat-and-lantern-cloak",
    layers: [
      layer("base", "深灰巡夜衫", "wool", "primary", "high collar"),
      layer("outer", "炭黑长斗篷", "heavy-wool", "primary", "rust-red lining"),
      layer("shoulder", "防雨肩片", "waxed-cloth", "secondary", "lantern soot"),
      layer("waist", "巡夜工具带", "leather", "metal", "keys and chalk"),
      layer("footwear", "钉底巡夜靴", "leather-metal", "secondary", "weathered"),
    ],
    props: [prop("watch-lantern", "大号守夜灯", "light", "right-hand"), prop("warning-horn", "示警角", "tool", "belt")],
    profession: ["night-watchman", "守夜人", "lantern-held-forward"], signatureMotif: "nine-window-lantern-and-rust-lining",
    signatureFeatures: ["right cheek scar", "nine-window amber lantern", "broad watch hat"],
    fallback: { archetype: "watchman", headgear: "watch", prop: "lantern", hairStyle: "short", beard: true, cape: true, robe: true },
  }),
  visual({
    identityName: "集市掌柜·通宝", identityKey: "npc-addde9030ff1e0518e122ef6", slug: "tongbao-shopkeeper",
    gender: "masculine", lifeStage: "middle-aged", stature: "short", build: "round", proportions: [0.98, 1.06, 1.01],
    face: ["round", "#bf835d", "#49342b", "shrewd-kind", "trimmed-moustache", []],
    hair: ["neat-center-part", "short", "#382d29", ["jade shopkeeper cap"]],
    palette: { primary: "#287253", secondary: "#71333d", accent: "#c89a3d", metal: "#a78349" },
    silhouette: "formal-market-shopkeeper",
    layers: [
      layer("base", "酒红立领衫", "silk-linen", "secondary", "gold frog closures"),
      layer("outer", "翡翠掌柜褂", "brocade", "primary", "wide ledger pockets"),
      layer("shoulder", "短搭肩", "brocade", "accent", "coin-edge trim"),
      layer("waist", "钥匙账房带", "leather", "metal", "shop keys"),
      layer("footwear", "掌柜云头履", "cloth-leather", "primary", "gold piping"),
    ],
    props: [prop("shop-abacus", "铁算盘", "trade", "both-hands"), prop("shop-keys", "集市钥匙串", "tool", "waist")],
    profession: ["shopkeeper", "集市掌柜", "counting-abacus"], signatureMotif: "jade-abacus-and-burgundy-collar",
    signatureFeatures: ["jade abacus beads", "burgundy collar", "gold key ring"],
    fallback: { archetype: "merchant", headgear: "shopkeeper", prop: "abacus", hairStyle: "short", beard: true, cape: false, robe: true },
  }),
  visual({
    identityName: "吟游诗人·风临", identityKey: "npc-d004094fb6cffc2fa2cded6f", slug: "fenglin-bard",
    gender: "masculine", lifeStage: "young-adult", stature: "tall", build: "lean", proportions: [1.03, 0.91, 1.02],
    face: ["oval", "#d19a74", "#3f7f83", "lively", "none", []],
    hair: ["windswept-swept", "medium", "#54382a", ["small teal feather"]],
    palette: { primary: "#287d89", secondary: "#655087", accent: "#d7b052", metal: "#aa9567" },
    silhouette: "flowing-bard-cape",
    layers: [
      layer("base", "紫灰诗人衫", "soft-linen", "secondary", "open collar"),
      layer("outer", "孔雀青短外套", "velvet", "primary", "musical braid trim"),
      layer("shoulder", "风行半披风", "light-wool", "primary", "animated long tail"),
      layer("waist", "琴谱腰带", "leather", "accent", "plectrum case"),
      layer("footwear", "巡演长靴", "leather", "secondary", "gold buckles"),
    ],
    props: [prop("bard-lute", "风纹鲁特琴", "instrument", "both-hands"), prop("song-scroll", "旅歌谱卷", "book", "waist")],
    profession: ["bard", "吟游诗人", "playing-lute"], signatureMotif: "teal-feather-and-wind-lute",
    signatureFeatures: ["teal feather", "wind-carved lute sound hole", "long asymmetrical cape"],
    fallback: { archetype: "bard", headgear: "bard", prop: "lute", hairStyle: "swept", beard: false, cape: true, robe: true },
  }),
  visual({
    identityName: "老农·禾叔", identityKey: "npc-064ac324c883df27e9000537", slug: "heshu-farmer",
    gender: "masculine", lifeStage: "older-adult", stature: "average", build: "sturdy", proportions: [0.99, 1.04, 1],
    face: ["broad", "#a96f50", "#5d4b2d", "patient", "grey-stubble", ["sun freckles"]],
    hair: ["thin-grey", "short", "#696058", ["wide woven straw hat"]],
    palette: { primary: "#67513b", secondary: "#c7a34b", accent: "#56804b", metal: "#80745a" },
    silhouette: "straw-hat-field-worker",
    layers: [
      layer("base", "土黄粗布衫", "linen", "secondary", "patched elbows"),
      layer("outer", "短褐农衣", "hemp", "primary", "seed pockets"),
      layer("shoulder", "草编雨披", "straw", "accent", "removable capelet"),
      layer("waist", "种囊腰绳", "rope-cloth", "primary", "wheat pouch"),
      layer("footwear", "泥田草鞋", "straw-cloth", "secondary", "mud stains"),
    ],
    props: [prop("field-hoe", "老木锄", "tool", "right-hand"), prop("wheat-sheaf", "金穗", "crop", "left-arm")],
    profession: ["farmer", "老农", "resting-on-hoe"], signatureMotif: "gold-wheat-and-green-seed-pouch",
    signatureFeatures: ["wide straw hat", "gold wheat sheaf", "green seed pouch"],
    fallback: { archetype: "farmer", headgear: "straw", prop: "hoe", hairStyle: "short", beard: true, cape: true, robe: false },
  }),
  visual({
    identityName: "牧羊女·小满", identityKey: "npc-d7b00c2e950e3e9c9db2315c", slug: "xiaoman-shepherdess",
    gender: "feminine", lifeStage: "young-adult", stature: "average", build: "slender", proportions: [0.99, 0.84, 1.04],
    face: ["soft-heart", "#e0aa86", "#57879b", "gentle", "none", ["light nose freckles"]],
    hair: ["twin-loose-braids", "long", "#4a2f23", ["small pink flowers", "cream wool ribbons"]],
    palette: { primary: "#e7ddc8", secondary: "#73a9c2", accent: "#c97883", metal: "#9aa7a1" },
    silhouette: "feminine-wool-shepherd-cloak",
    layers: [
      layer("base", "奶白束袖牧衣", "soft-linen", "primary", "fitted feminine tailoring"),
      layer("outer", "浅青羊毛斗篷", "wool", "secondary", "scalloped hem"),
      layer("shoulder", "绒边披肩", "wool-fleece", "primary", "pink flower clasp"),
      layer("waist", "牧铃束腰", "leather-cloth", "accent", "small bell"),
      layer("footwear", "草坡短靴", "suede", "secondary", "cream wool cuff"),
    ],
    props: [prop("shepherd-staff", "花枝牧杖", "tool", "right-hand"), prop("white-lamb", "白色小羊", "companion", "left-arm")],
    profession: ["shepherdess", "牧羊女", "cradling-lamb-and-staff"], signatureMotif: "pink-flowers-white-lamb-and-teal-cloak",
    signatureFeatures: ["unmistakably feminine shepherd silhouette", "twin braids with pink flowers", "white lamb companion"],
    fallback: { archetype: "shepherd", headgear: "flower_scarf", prop: "shepherd_staff", hairStyle: "braids", beard: false, cape: true, robe: false },
  }),
  visual({
    identityName: "灯窝·穗娘", identityKey: "npc-576da7e43b9e56d3a706c5fa", slug: "suiniang-leather-seamstress",
    gender: "feminine", lifeStage: "adult", stature: "average", build: "average", proportions: [1, 0.89, 1.02],
    face: ["oval", "#c98b67", "#3d716d", "confident", "none", []],
    hair: ["tidy-high-bun", "long", "#36241f", ["wooden spool hairpin", "stitched scarf"]],
    palette: { primary: "#934f3b", secondary: "#d2b98c", accent: "#397d78", metal: "#8c7359" },
    silhouette: "tailored-seamstress-apron",
    layers: [
      layer("base", "米色裁衣衫", "linen", "secondary", "fitted sleeves"),
      layer("outer", "赭红拼皮围裙", "leather-cloth", "primary", "decorative stitches"),
      layer("shoulder", "软尺披带", "cloth", "accent", "measurement markings"),
      layer("waist", "针线腰包", "leather", "primary", "thread compartments"),
      layer("footwear", "裁缝软靴", "suede", "secondary", "teal laces"),
    ],
    props: [prop("thread-spool", "木线轴", "craft", "left-hand"), prop("leather-shears", "裁皮剪", "tool", "right-hand")],
    profession: ["leather-seamstress", "皮匠与裁缝", "measuring-leather"], signatureMotif: "spool-hairpin-and-teal-stitches",
    signatureFeatures: ["wooden spool hairpin", "teal cross-stitches", "tailored leather apron"],
    fallback: { archetype: "tanner", headgear: "stitched_scarf", prop: "spool", hairStyle: "bun", beard: false, cape: false, robe: false },
  }),
  visual({
    identityName: "阿宝", identityKey: "npc-b92f03412dc73422337278d0", slug: "abao-village-child",
    gender: "masculine", lifeStage: "child", stature: "short", build: "child", proportions: [0.78, 0.82, 1.18],
    face: ["round-child", "#ddb08a", "#5b7448", "excited", "none", ["cheek freckles"]],
    hair: ["messy-cowlick", "short", "#4a3425", ["patchwork head scarf"]],
    palette: { primary: "#d8a92d", secondary: "#71934a", accent: "#b94a48", metal: "#8b7654" },
    silhouette: "small-village-child",
    layers: [
      layer("base", "浅色童衫", "cotton", "secondary", "loose sleeves"),
      layer("outer", "金黄补丁背心", "woven-cloth", "primary", "color patches"),
      layer("shoulder", "短围巾", "cotton", "accent", "fluttering tail"),
      layer("waist", "弹珠小袋", "cloth", "secondary", "drawstring"),
      layer("footwear", "村童布鞋", "cloth", "primary", "rounded toe"),
    ],
    props: [prop("paper-pinwheel", "彩色纸风车", "toy", "right-hand"), prop("wooden-slingshot", "木弹弓", "toy", "waist")],
    profession: ["village-child", "村庄孩子", "running-with-pinwheel"], signatureMotif: "rainbow-pinwheel-and-patched-vest",
    signatureFeatures: ["child proportions", "messy cowlick", "rainbow paper pinwheel"],
    fallback: { archetype: "villager", headgear: "patched", prop: "windmill", hairStyle: "short", beard: false, cape: false, robe: false },
  }),
  visual({
    identityName: "公会接待员·岚", identityKey: "npc-2135b81dac6bb79e2cd473cf", slug: "lan-guild-receptionist",
    gender: "feminine", lifeStage: "young-adult", stature: "tall", build: "slender", proportions: [1.03, 0.86, 1.03],
    face: ["elegant-oval", "#d8a17c", "#5b8da7", "intelligent", "none", []],
    hair: ["long-blue-black-waves", "very-long", "#242a35", ["plain gold hair clasp"]],
    palette: { primary: "#7fb2c7", secondary: "#283f61", accent: "#d8e2e7", metal: "#d5b766" },
    silhouette: "elegant-feminine-guild-uniform",
    layers: [
      layer("base", "白色高领接待衫", "silk-linen", "accent", "professional fitted cut"),
      layer("outer", "蓝白公会长外套", "fine-wool", "primary", "plain gold piping"),
      layer("shoulder", "海军蓝短披肩", "velvet", "secondary", "non-symbolic clasp"),
      layer("waist", "接待员束腰", "leather-cloth", "metal", "ledger key"),
      layer("footwear", "公会礼靴", "polished-leather", "secondary", "gold edge trim"),
    ],
    props: [prop("guild-ledger", "冒险者登记簿", "book", "left-hand"), prop("white-quill", "白羽笔", "tool", "right-hand")],
    profession: ["guild-receptionist", "公会接待员", "writing-in-open-ledger"], signatureMotif: "white-quill-blue-black-hair-and-gold-piping",
    signatureFeatures: ["unmistakably feminine adult silhouette", "long blue-black hair", "white feather quill", "plain emblem-free uniform"],
    fallback: { archetype: "receptionist", headgear: "guild", prop: "clipboard", hairStyle: "long", beard: false, cape: true, robe: true },
  }),
  visual({
    identityName: "灯窝·阿禾", identityKey: "npc-e6d8bb3c96052a7f264dbe08", slug: "ahe-cartographer",
    gender: "masculine", lifeStage: "young-adult", stature: "average", build: "lean", proportions: [1.01, 0.92, 1.01],
    face: ["angular-soft", "#bc815d", "#527560", "curious", "none", []],
    hair: ["practical-tied-back", "medium", "#33291f", ["survey-lens headband"]],
    palette: { primary: "#355d49", secondary: "#d3c49a", accent: "#b86e38", metal: "#9f895e" },
    silhouette: "field-cartographer-coat",
    layers: [
      layer("base", "沙色测绘衫", "linen", "secondary", "map-safe pockets"),
      layer("outer", "松绿野外短衣", "waxed-cloth", "primary", "weather flaps"),
      layer("shoulder", "卷图筒肩带", "leather", "accent", "brass clasps"),
      layer("waist", "罗盘工具带", "leather", "metal", "chalk and dividers"),
      layer("footwear", "测绘远行靴", "leather", "primary", "terrain grip"),
    ],
    props: [prop("survey-map", "灯影地图", "map", "both-hands"), prop("brass-compass", "黄铜罗盘", "tool", "waist")],
    profession: ["cartographer", "测绘师", "reading-map-with-compass"], signatureMotif: "survey-lens-and-orange-map-marks",
    signatureFeatures: ["survey lens headband", "orange map symbols", "brass compass"],
    fallback: { archetype: "cartographer", headgear: "survey", prop: "map", hairStyle: "tied", beard: false, cape: false, robe: false },
  }),
  visual({
    identityName: "鸣人", identityKey: "npc-ebc83899d36711020777c76a", slug: "naruto-uzumaki-shippuden",
    gender: "masculine", lifeStage: "young-adult", stature: "average", build: "athletic", proportions: [1.01, 0.97, 1.02],
    face: ["youthful-angular", "#e2ad83", "#5f9ed8", "determined", "none", ["exactly three whisker marks on each cheek"]],
    hair: ["bright-spiky", "short", "#e7bd45", ["Hidden Leaf metal forehead protector"]],
    palette: { primary: "#e87524", secondary: "#1d2f55", accent: "#f2cf55", metal: "#929ca8" },
    silhouette: "recognizable-orange-black-shinobi",
    layers: [
      layer("base", "黑色忍者内衫", "technical-cloth", "secondary", "high collar"),
      layer("outer", "橙黑疾风传忍者夹克", "woven-cloth", "primary", "black shoulder yoke"),
      layer("shoulder", "木叶护额系带", "cloth-metal", "metal", "forehead mounted"),
      layer("waist", "忍具腰袋", "leather-cloth", "secondary", "kunai and scroll pouch"),
      layer("footwear", "露趾忍靴", "leather-cloth", "secondary", "shinobi sole"),
    ],
    props: [prop("kunai", "苦无", "weapon", "right-hand"), prop("rasengan", "螺旋丸", "effect", "left-hand", "eyes")],
    profession: ["leaf-shinobi", "木叶忍者", "rasengan-ready"], signatureMotif: "six-whisker-marks-leaf-band-and-rasengan",
    signatureFeatures: ["bright blond spikes", "blue eyes", "three whisker marks per cheek", "Hidden Leaf forehead protector", "orange-and-black jacket", "blue Rasengan"],
    fallback: { archetype: "ninja", headgear: "leaf_band", prop: "kunai", hairStyle: "spiky", beard: false, cape: false, robe: false },
    assetBudget: { maximumTriangles: 80_000, maximumMaterials: 12, maximumTextures: 8, maximumTextureSize: 4096 },
  }),
  visual({
    identityName: "桐人", identityKey: "npc-948131665d02111ab1893c3e", slug: "kirito-black-swordsman",
    gender: "masculine", lifeStage: "young-adult", stature: "average", build: "slender", proportions: [1.02, 0.91, 1.01],
    face: ["youthful-oval", "#deb08d", "#667b9c", "calm-determined", "none", []],
    hair: ["short-tousled-black", "medium", "#16191f", ["long center bang"]],
    palette: { primary: "#171b24", secondary: "#394357", accent: "#6fd7e8", metal: "#b8c1cf" },
    silhouette: "recognizable-long-black-dual-sword-coat",
    layers: [
      layer("base", "黑色贴身战斗衫", "technical-cloth", "primary", "high neck"),
      layer("outer", "银边黑衣剑士长外套", "fine-leather-cloth", "primary", "long split coat tails"),
      layer("shoulder", "双剑背带", "leather", "secondary", "crossed scabbards"),
      layer("waist", "银扣剑带", "leather-metal", "metal", "minimal pouches"),
      layer("footwear", "黑色战斗长靴", "leather", "primary", "silver buckles"),
    ],
    props: [prop("elucidator", "阐释者", "weapon", "back-left", "primary"), prop("dark-repulser", "逐暗者", "weapon", "back-right", "accent")],
    profession: ["black-swordsman", "黑衣剑士", "dual-sword-ready"], signatureMotif: "silver-piped-black-coat-and-crossed-dual-swords",
    signatureFeatures: ["short tousled black hair", "long black coat with silver piping", "Elucidator", "Dark Repulser", "blue polygonal sword-skill energy"],
    fallback: { archetype: "swordsman", headgear: "black_swordsman", prop: "dual_swords", hairStyle: "swept", beard: false, cape: true, robe: true },
  }),
  suppliedVisual({
    identityName: "佐助", identityKey: "npc-9c462ab638f094291422f900", slug: "sasuke-uchiha",
    proportions: [1.02, 0.96, 1],
    face: ["youthful-angular", "#dfad8a", "#6d568f", "focused", "none", ["Sharingan gaze"]],
    hair: ["raven-spiked", "short", "#171a24", []],
    palette: { primary: "#26314a", secondary: "#d9dbe2", accent: "#7f68b7", metal: "#a7acb5" },
    silhouette: "open-collar-uchiha-combat-attire",
    profession: ["uchiha-rival", "宇智波忍者", "chidori-ready"],
    signatureMotif: "raven-spikes-uchiha-crest-and-lightning",
    signatureFeatures: ["Uchiha crest", "purple rope belt", "lightning-ready hand", "raven-black spikes"],
    propSpecs: [["kusanagi", "草薙剑", "weapon", "back-right", "metal"]],
    fallback: { archetype: "uchiha-rival", headgear: "black_swordsman", prop: "kunai", hairStyle: "spiky", beard: false, cape: false, robe: true },
  }),
  suppliedVisual({
    identityName: "卡卡西", identityKey: "npc-493159088b50d1768180d8f3", slug: "kakashi-hatake",
    lifeStage: "adult", stature: "tall", build: "lean", proportions: [1.04, 0.98, 0.98],
    face: ["masked-angular", "#d9a681", "#5e7f94", "watchful", "masked", ["covered left eye"]],
    hair: ["silver-upward-spikes", "short", "#b9bec4", ["tilted Leaf forehead protector"]],
    palette: { primary: "#30443d", secondary: "#1d2730", accent: "#a8b6c4", metal: "#8e9ca8" },
    silhouette: "masked-jonin-flak-jacket",
    profession: ["copy-ninja", "木叶上忍", "lightning-blade-ready"],
    signatureMotif: "silver-spikes-mask-and-slanted-leaf-band",
    signatureFeatures: ["silver upward hair", "lower-face mask", "tilted Leaf protector", "green flak vest"],
    propSpecs: [["ninja-scroll", "忍术卷轴", "scroll", "waist", "accent"]],
    fallback: { archetype: "copy-ninja", headgear: "leaf_band", prop: "scroll", hairStyle: "spiky", beard: false, cape: false, robe: false },
  }),
  suppliedVisual({
    identityName: "波风水门", identityKey: "npc-ad2cef9fdeb4fe33f86d6a4f", slug: "minato-namikaze",
    lifeStage: "adult", stature: "tall", build: "athletic", proportions: [1.04, 0.98, 1],
    face: ["calm-angular", "#e4b18a", "#5892bd", "calm", "none", []],
    hair: ["golden-wind-spikes", "short", "#e7c24d", ["Leaf forehead protector"]],
    palette: { primary: "#e8e0cf", secondary: "#305a86", accent: "#e7bd45", metal: "#8f9ba7" },
    silhouette: "white-hokage-cloak-over-blue-shinobi-suit",
    profession: ["yellow-flash", "黄色闪光", "flying-raijin-ready"],
    signatureMotif: "white-flame-cloak-golden-hair-and-marked-kunai",
    signatureFeatures: ["white flame-edged cloak", "golden spiked hair", "three-pronged marked kunai", "blue shinobi suit"],
    propSpecs: [["flying-raijin-kunai", "飞雷神苦无", "weapon", "right-hand", "metal"]],
    fallback: { archetype: "yellow-flash", headgear: "leaf_band", prop: "dual_swords", hairStyle: "spiky", beard: false, cape: true, robe: true },
  }),
  suppliedVisual({
    identityName: "雏田", identityKey: "npc-0c87a3488ef4ec33474c3618", slug: "hinata-hyuga",
    gender: "feminine", stature: "average", build: "slender", proportions: [0.99, 0.9, 1.03],
    face: ["soft-oval", "#e8b997", "#c5c5dd", "gentle", "none", ["Byakugan eyes"]],
    hair: ["blue-black-hime-cut", "long", "#252638", []],
    palette: { primary: "#d7d2e6", secondary: "#6d7295", accent: "#bba7d8", metal: "#a5a8b5" },
    silhouette: "lavender-hyuga-combat-jacket",
    profession: ["gentle-fist", "日向忍者", "gentle-fist-guard"],
    signatureMotif: "pale-eyes-lavender-jacket-and-gentle-fist",
    signatureFeatures: ["pale Byakugan eyes", "blue-black hime cut", "lavender jacket", "open-palm stance"],
    propSpecs: [["chakra-palm", "柔拳查克拉", "effect", "both-hands", "accent"]],
    fallback: { archetype: "gentle-fist", headgear: "flower_scarf", prop: "kunai", hairStyle: "long", beard: false, cape: false, robe: false },
  }),
  suppliedVisual({
    identityName: "小樱", identityKey: "npc-8b2046193680ab75b17b5362", slug: "sakura-haruno",
    gender: "feminine", build: "athletic", proportions: [1, 0.92, 1.02],
    face: ["youthful-heart", "#efb999", "#5e9a6e", "determined", "none", ["forehead strength seal"]],
    hair: ["rose-pink-bob", "short", "#d98291", ["red hair band"]],
    palette: { primary: "#b84459", secondary: "#e6b2ba", accent: "#6b9b69", metal: "#a9adb0" },
    silhouette: "red-medical-ninja-tunic",
    profession: ["medical-ninja", "医疗忍者", "chakra-strength-ready"],
    signatureMotif: "pink-hair-red-tunic-and-strength-seal",
    signatureFeatures: ["rose-pink bob", "forehead seal", "red sleeveless tunic", "medical pouch"],
    propSpecs: [["medical-pouch", "医疗忍具包", "tool", "waist", "secondary"]],
    fallback: { archetype: "medical-ninja", headgear: "stitched_scarf", prop: "censer", hairStyle: "short", beard: false, cape: false, robe: false },
  }),
  suppliedVisual({
    identityName: "小李", identityKey: "npc-3fa37bbc8a2c8b5e3c1e3425", slug: "rock-lee",
    build: "athletic", proportions: [1.01, 0.96, 1],
    face: ["round-youthful", "#dca47f", "#252b23", "intense", "none", ["very thick eyebrows"]],
    hair: ["black-bowl-cut", "short", "#171b1a", []],
    palette: { primary: "#347044", secondary: "#25372d", accent: "#d65a4e", metal: "#9a9d91" },
    silhouette: "green-taijutsu-jumpsuit-with-leg-weights",
    profession: ["taijutsu", "体术忍者", "strong-fist-ready"],
    signatureMotif: "bowl-cut-thick-brows-and-green-jumpsuit",
    signatureFeatures: ["thick eyebrows", "black bowl cut", "green jumpsuit", "orange leg warmers"],
    propSpecs: [["training-weights", "负重护腿", "equipment", "legs", "metal"]],
    fallback: { archetype: "taijutsu", headgear: "scholar", prop: "kunai", hairStyle: "short", beard: false, cape: false, robe: false },
  }),
  suppliedVisual({
    identityName: "斑", identityKey: "npc-2807b2e233cebfea411a8df5", slug: "madara-uchiha",
    lifeStage: "adult", stature: "tall", build: "broad", proportions: [1.06, 1.08, 0.98],
    face: ["stern-angular", "#d5a07d", "#9f3038", "commanding", "none", ["battle-worn eye lines"]],
    hair: ["wild-black-mane", "long", "#16191d", []],
    palette: { primary: "#5e2528", secondary: "#20242c", accent: "#9c353c", metal: "#676c72" },
    silhouette: "layered-crimson-samurai-armour",
    profession: ["uchiha-legend", "宇智波传说", "gunbai-ready"],
    signatureMotif: "wild-black-mane-crimson-armour-and-gunbai",
    signatureFeatures: ["wild waist-length hair", "crimson armour plates", "Sharingan eyes", "large war fan"],
    propSpecs: [["gunbai", "焰团扇", "weapon", "back", "metal"]],
    fallback: { archetype: "uchiha-legend", headgear: "watch", prop: "dual_swords", hairStyle: "long", beard: false, cape: true, robe: true },
  }),
  suppliedVisual({
    identityName: "专业人物", identityKey: "npc-c0322f61aa5fb5a3d27481cb", slug: "professional-xbot",
    lifeStage: "adult", build: "average", proportions: [1, 1, 1],
    face: ["neutral-training-mask", "#c7c9cc", "#4d8aa1", "neutral", "none", []],
    hair: ["training-shell", "short", "#656b73", []],
    palette: { primary: "#d9dde3", secondary: "#59616d", accent: "#58a6c7", metal: "#8d949d" },
    silhouette: "clean-professional-motion-capture-avatar",
    profession: ["training-avatar", "专业训练人物", "neutral-demonstration-pose"],
    signatureMotif: "clean-grey-rig-and-blue-motion-guides",
    signatureFeatures: ["neutral rig shell", "clear joint silhouette", "blue motion accents", "animation-ready hands"],
    propSpecs: [["motion-marker", "动作标记", "tool", "waist", "accent"]],
    fallback: { archetype: "training-avatar", headgear: "survey", prop: "clipboard", hairStyle: "short", beard: false, cape: false, robe: false },
  }),
  suppliedVisual({
    identityName: "士兵", identityKey: "npc-eaa8dd04fd6812c86800f56d", slug: "professional-soldier",
    lifeStage: "adult", stature: "tall", build: "sturdy", proportions: [1.04, 1.06, 0.98],
    face: ["helmeted-square", "#b88a68", "#4c5b51", "alert", "none", []],
    hair: ["military-short", "short", "#2b2824", ["combat helmet"]],
    palette: { primary: "#3f5142", secondary: "#252e2a", accent: "#9b8d58", metal: "#777f78" },
    silhouette: "armoured-professional-soldier",
    profession: ["soldier", "士兵", "guard-ready"],
    signatureMotif: "olive-armour-helmet-and-ready-stance",
    signatureFeatures: ["olive combat armour", "protective helmet", "utility harness", "guard stance"],
    propSpecs: [["service-weapon", "制式武器", "weapon", "back", "metal"]],
    fallback: { archetype: "soldier", headgear: "visor", prop: "dual_swords", hairStyle: "short", beard: false, cape: false, robe: false },
  }),
]);

const profilesByKey = new Map(CHARACTER_VISUAL_PROFILES.map((profile) => [profile.identityKey, profile]));
const profilesByPair = new Map(CHARACTER_VISUAL_PROFILES.map((profile) => [`${profile.identityName}\u0000${profile.identityKey}`, profile]));

/** Return a profile by the server-stable identity key. */
export function getCharacterVisualProfile(identityKey) {
  return profilesByKey.get(String(identityKey || "")) ?? null;
}

/**
 * Strict pair resolution for server entities/definitions. When a name is
 * supplied it must agree with the stable key, preventing accidental restyles
 * caused by an unrelated entity reusing a display name.
 */
export function resolveCharacterVisualProfile(value) {
  if (!value || typeof value !== "object") return null;
  const identityKey = String(value.identityKey || "");
  const identityName = String(value.identityName || "");
  if (!identityKey) return null;
  if (identityName) return profilesByPair.get(`${identityName}\u0000${identityKey}`) ?? null;
  return getCharacterVisualProfile(identityKey);
}

/** A renderer-independent signature; identity/id are intentionally excluded. */
export function createCharacterVisualSignature(profile) {
  if (!profile) return "";
  return [
    profile.presentation?.gender,
    profile.presentation?.lifeStage,
    profile.presentation?.build,
    profile.hair?.style,
    profile.outfit?.silhouette,
    profile.profession?.key,
    profile.signatureMotif,
    ...(profile.props || []).map((entry) => entry.id),
  ].join("|");
}

/**
 * Compare this art manifest with CUSTOM_CHARACTER_DEFINITIONS without creating
 * an import cycle. Tests and future loaders pass the registry in explicitly.
 */
export function auditCharacterVisualProfiles(definitions) {
  const registry = Array.isArray(definitions) ? definitions : [];
  const definitionPairs = new Set(registry.map((entry) => `${entry.identityName}\u0000${entry.identityKey}`));
  const profilePairs = new Set(CHARACTER_VISUAL_PROFILES.map((entry) => `${entry.identityName}\u0000${entry.identityKey}`));
  const missing = registry
    .filter((entry) => !profilePairs.has(`${entry.identityName}\u0000${entry.identityKey}`))
    .map((entry) => ({ identityName: entry.identityName, identityKey: entry.identityKey }));
  const orphaned = CHARACTER_VISUAL_PROFILES
    .filter((entry) => !definitionPairs.has(`${entry.identityName}\u0000${entry.identityKey}`))
    .map((entry) => ({ identityName: entry.identityName, identityKey: entry.identityKey }));
  const signatures = new Map();
  for (const profile of CHARACTER_VISUAL_PROFILES) {
    const signature = createCharacterVisualSignature(profile);
    const bucket = signatures.get(signature) ?? [];
    bucket.push(profile.identityName);
    signatures.set(signature, bucket);
  }
  const duplicateAppearanceSignatures = [...signatures.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([signature, identityNames]) => ({ signature, identityNames }));
  const invalid = CHARACTER_VISUAL_PROFILES.flatMap((profile) => validateProfile(profile));
  return deepFreeze({
    healthy: missing.length === 0 && orphaned.length === 0 && duplicateAppearanceSignatures.length === 0 && invalid.length === 0,
    definitions: registry.length,
    profiles: CHARACTER_VISUAL_PROFILES.length,
    matched: registry.length - missing.length,
    missing,
    orphaned,
    duplicateAppearanceSignatures,
    invalid,
  });
}

function validateProfile(profile) {
  const errors = [];
  const prefix = profile.identityName || profile.identityKey || "unknown";
  if (profile.schemaVersion !== CHARACTER_VISUAL_PROFILE_SCHEMA_VERSION) errors.push(`${prefix}:schema`);
  if (!/^npc-[a-f0-9]{24}$/u.test(profile.identityKey)) errors.push(`${prefix}:identity-key`);
  for (const [name, color] of Object.entries(profile.outfit?.palette || {})) {
    if (!COLOR.test(String(color))) errors.push(`${prefix}:palette-${name}`);
  }
  if (!COLOR.test(String(profile.face?.skinTone))) errors.push(`${prefix}:skin-tone`);
  if (!COLOR.test(String(profile.face?.eyeColor))) errors.push(`${prefix}:eye-color`);
  if (!COLOR.test(String(profile.hair?.color))) errors.push(`${prefix}:hair-color`);
  if ((profile.outfit?.layers?.length ?? 0) < 5) errors.push(`${prefix}:outfit-layers`);
  if ((profile.props?.length ?? 0) < 1) errors.push(`${prefix}:props`);
  if ((profile.signatureFeatures?.length ?? 0) < 3) errors.push(`${prefix}:signature-features`);
  if (!profile.asset?.manifestId || profile.asset?.acceptedFormats?.join(",") !== "glb,vrm") errors.push(`${prefix}:asset-slot`);
  return errors;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
