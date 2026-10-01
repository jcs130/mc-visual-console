import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  ClampToEdgeWrapping,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshToonMaterial,
  NearestFilter,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
} from "three";
import { AvatarMotionGraph } from "./avatar-motion.js";
import { resolveNamedPlayerCharacterIdentity } from "./named-character-identities.js";

const character = (identityName, identityKey, archetype, palette, headgear, prop, details = {}) => ({
  id: `${identityKey}-v1`,
  identityName,
  identityKey,
  archetype,
  palette,
  headgear,
  prop,
  skin: details.skin ?? "#c98f68",
  hair: details.hair ?? "#2b211f",
  eyes: details.eyes ?? palette.accent,
  hairStyle: details.hairStyle ?? "short",
  beard: details.beard ?? false,
  cape: details.cape ?? false,
  robe: details.robe ?? ["scholar", "priest", "watchman", "bard"].includes(archetype),
});

export const CUSTOM_CHARACTER_DEFINITIONS = Object.freeze([
  character("书商·墨白", "npc-d3f933645b7d10682f5a18ee", "scholar", { primary: "#263c78", secondary: "#d8c8a5", accent: "#b99345" }, "scholar", "book", { beard: true, skin: "#bd825d" }),
  character("铁匠·岳山", "npc-9b574b1b314ee9dece0aef95", "smith", { primary: "#3b4148", secondary: "#792e25", accent: "#e2872c" }, "smith", "hammer", { beard: true, skin: "#a96f50" }),
  character("甲匠·石磊", "npc-23ac7457fe3aeced2e1be1d0", "smith", { primary: "#292d32", secondary: "#82909b", accent: "#345c91" }, "visor", "tongs", { beard: true, skin: "#b97f5b" }),
  character("书商·云笈", "npc-f685b845661a789ece97b291", "scholar", { primary: "#285746", secondary: "#dde1d1", accent: "#62a99a" }, "cloud", "scroll", { hair: "#33302c" }),
  character("神官·静水", "npc-d6364b74e7eb3537406f7538", "priest", { primary: "#236e78", secondary: "#a9d7d7", accent: "#dce5e8" }, "water_crown", "censer", { skin: "#e2b18e", hair: "#181a20", eyes: "#44d7e5", hairStyle: "long" }),
  character("货郎·福伯", "npc-c38a049a5b14f201b0af1293", "merchant", { primary: "#a8752d", secondary: "#66713a", accent: "#b84232" }, "merchant", "pack", { beard: true, skin: "#bb8057", cape: true }),
  character("灯窝·阿爹", "npc-ade9c904461d5ab2a929b6c6", "tanner", { primary: "#4d3227", secondary: "#a96f3f", accent: "#dba13a" }, "fur", "leather", { beard: true, skin: "#a96d4d" }),
  character("墨先生", "npc-955c7244a414c9139448fca9", "scholar", { primary: "#171a24", secondary: "#4b3976", accent: "#b6453a" }, "tall_scholar", "ink_scroll", { beard: true, skin: "#c58a65", robe: true }),
  character("渔夫·浪伯", "npc-2edb554af4a89e89454fd91a", "fisher", { primary: "#24445f", secondary: "#c2a879", accent: "#c95f4e" }, "reed", "fishing_rod", { beard: true, skin: "#9f694e" }),
  character("货郎·铜板", "npc-d1dd592a2ea60d00ebd65008", "merchant", { primary: "#956a43", secondary: "#4e887d", accent: "#c87532" }, "coin", "scales", { skin: "#c78d66" }),
  character("守夜人·烛九", "npc-148ee37f5f20a97561755b54", "watchman", { primary: "#26272b", secondary: "#873d28", accent: "#f0b84b" }, "watch", "lantern", { beard: true, skin: "#ad7453", cape: true, robe: true }),
  character("集市掌柜·通宝", "npc-addde9030ff1e0518e122ef6", "merchant", { primary: "#287253", secondary: "#71333d", accent: "#c89a3d" }, "shopkeeper", "abacus", { beard: true, skin: "#bf835d" }),
  character("吟游诗人·风临", "npc-d004094fb6cffc2fa2cded6f", "bard", { primary: "#287d89", secondary: "#655087", accent: "#d7b052" }, "bard", "lute", { skin: "#d19a74", hair: "#54382a", hairStyle: "swept", cape: true }),
  character("老农·禾叔", "npc-064ac324c883df27e9000537", "farmer", { primary: "#67513b", secondary: "#c7a34b", accent: "#56804b" }, "straw", "hoe", { beard: true, skin: "#a96f50" }),
  character("牧羊女·小满", "npc-d7b00c2e950e3e9c9db2315c", "shepherd", { primary: "#e7ddc8", secondary: "#73a9c2", accent: "#c97883" }, "flower_scarf", "shepherd_staff", { skin: "#e0aa86", hair: "#4a2f23", hairStyle: "braids" }),
  character("灯窝·穗娘", "npc-576da7e43b9e56d3a706c5fa", "tanner", { primary: "#934f3b", secondary: "#d2b98c", accent: "#397d78" }, "stitched_scarf", "spool", { skin: "#c98b67", hair: "#36241f", hairStyle: "bun" }),
  character("阿宝", "npc-b92f03412dc73422337278d0", "villager", { primary: "#d8a92d", secondary: "#71934a", accent: "#b94a48" }, "patched", "windmill", { skin: "#ddb08a", hair: "#4a3425" }),
  character("公会接待员·岚", "npc-2135b81dac6bb79e2cd473cf", "receptionist", { primary: "#7fb2c7", secondary: "#283f61", accent: "#d8e2e7" }, "guild", "clipboard", { skin: "#d8a17c", hair: "#242a35", hairStyle: "long" }),
  character("灯窝·阿禾", "npc-e6d8bb3c96052a7f264dbe08", "cartographer", { primary: "#355d49", secondary: "#d3c49a", accent: "#b86e38" }, "survey", "map", { skin: "#bc815d", hair: "#33291f" }),
  // Named travellers use exact server-derived identity pairs. Register both
  // the intended UTF-8 name and the GBK-mojibake spelling observed on some
  // proxy/plugin stacks; a name without its matching hash is never accepted.
  character("鸣人", "npc-ebc83899d36711020777c76a", "ninja", { primary: "#e87524", secondary: "#1d2f55", accent: "#f2cf55" }, "leaf_band", "kunai", { skin: "#e2ad83", hair: "#e7bd45", eyes: "#5f9ed8", hairStyle: "spiky" }),
  character("桐人", "npc-948131665d02111ab1893c3e", "swordsman", { primary: "#171b24", secondary: "#394357", accent: "#6fd7e8" }, "black_swordsman", "dual_swords", { skin: "#deb08d", hair: "#16191f", eyes: "#667b9c", hairStyle: "swept", robe: true, cape: true }),
  // User-supplied rigged GLBs are bound only to these exact protocol
  // usernames through named-character-identities.js. The procedural designs
  // below remain visible while an authored asset is loading or rejected.
  character("佐助", "npc-9c462ab638f094291422f900", "uchiha-rival", { primary: "#26314a", secondary: "#d9dbe2", accent: "#7f68b7" }, "black_swordsman", "kunai", { skin: "#dfad8a", hair: "#171a24", eyes: "#6d568f", hairStyle: "spiky", robe: true }),
  character("卡卡西", "npc-493159088b50d1768180d8f3", "copy-ninja", { primary: "#30443d", secondary: "#1d2730", accent: "#a8b6c4" }, "leaf_band", "scroll", { skin: "#d9a681", hair: "#b9bec4", eyes: "#5e7f94", hairStyle: "spiky" }),
  character("波风水门", "npc-ad2cef9fdeb4fe33f86d6a4f", "yellow-flash", { primary: "#e8e0cf", secondary: "#305a86", accent: "#e7bd45" }, "leaf_band", "dual_swords", { skin: "#e4b18a", hair: "#e7c24d", eyes: "#5892bd", hairStyle: "spiky", cape: true, robe: true }),
  character("雏田", "npc-0c87a3488ef4ec33474c3618", "gentle-fist", { primary: "#d7d2e6", secondary: "#6d7295", accent: "#bba7d8" }, "flower_scarf", "kunai", { skin: "#e8b997", hair: "#252638", eyes: "#c5c5dd", hairStyle: "long" }),
  character("小樱", "npc-8b2046193680ab75b17b5362", "medical-ninja", { primary: "#b84459", secondary: "#e6b2ba", accent: "#6b9b69" }, "stitched_scarf", "censer", { skin: "#efb999", hair: "#d98291", eyes: "#5e9a6e", hairStyle: "short" }),
  character("小李", "npc-3fa37bbc8a2c8b5e3c1e3425", "taijutsu", { primary: "#347044", secondary: "#25372d", accent: "#d65a4e" }, "scholar", "kunai", { skin: "#dca47f", hair: "#171b1a", eyes: "#252b23", hairStyle: "short" }),
  character("斑", "npc-2807b2e233cebfea411a8df5", "uchiha-legend", { primary: "#5e2528", secondary: "#20242c", accent: "#9c353c" }, "watch", "dual_swords", { skin: "#d5a07d", hair: "#16191d", eyes: "#9f3038", hairStyle: "long", cape: true, robe: true }),
  character("专业人物", "npc-c0322f61aa5fb5a3d27481cb", "training-avatar", { primary: "#d9dde3", secondary: "#59616d", accent: "#58a6c7" }, "survey", "clipboard", { skin: "#c7c9cc", hair: "#656b73", eyes: "#4d8aa1", hairStyle: "short" }),
  character("士兵", "npc-eaa8dd04fd6812c86800f56d", "soldier", { primary: "#3f5142", secondary: "#252e2a", accent: "#9b8d58" }, "visor", "dual_swords", { skin: "#b88a68", hair: "#2b2824", eyes: "#4c5b51", hairStyle: "short" }),
]);

/**
 * The two well-known travellers use a deliberately small, locally-authored
 * anime mesh rather than the block-built NPC body.  Keeping the profile data
 * pure and bounded makes visual upgrades testable without loading WebGL or an
 * untrusted model file.
 */
export const ANIME_HERO_MODEL_PROFILES = Object.freeze({
  ninja: Object.freeze({
    styleId: "golden-shinobi-toon-v2",
    bodyType: "agile",
    accessoryPosition: Object.freeze([0.5, 1.02, -0.24]),
    maximumMeshes: 72,
    maximumTriangles: 14_000,
    maximumMaterials: 16,
  }),
  swordsman: Object.freeze({
    styleId: "black-dual-swordsman-toon-v2",
    bodyType: "slender",
    accessoryPosition: Object.freeze([0, 1.04, 0.27]),
    maximumMeshes: 72,
    maximumTriangles: 14_000,
    maximumMaterials: 16,
  }),
});

export function resolveAnimeHeroModelProfile(definition) {
  return ANIME_HERO_MODEL_PROFILES[String(definition?.archetype || "")] ?? null;
}

const definitionsByName = new Map(CUSTOM_CHARACTER_DEFINITIONS.map((definition) => [definition.identityName, definition]));
const definitionsByAliasIdentity = new Map([
  [`楦d汉\u0000npc-851d4127789ddd4edd2bab03`, definitionsByName.get("鸣人")],
  [`妗愪汉\u0000npc-421666518646fd61a5afccfc`, definitionsByName.get("桐人")],
]);

export function resolveCustomCharacterDefinition(entity) {
  const namedPlayerIdentity = resolveNamedPlayerCharacterIdentity(entity);
  if (namedPlayerIdentity) return definitionsByName.get(namedPlayerIdentity.identityName) ?? null;
  if (String(entity?.name || "").toLowerCase() !== "villager") return null;
  const identityName = typeof entity?.identityName === "string" ? entity.identityName : "";
  const definition = definitionsByName.get(identityName);
  if (definition && entity.identityKey === definition.identityKey) return definition;
  return definitionsByAliasIdentity.get(`${identityName}\u0000${String(entity?.identityKey || "")}`) ?? null;
}

export function createCustomCharacter(definition, entity) {
  const ownedGeometries = new Set();
  const ownedMaterials = new Set();
  const ownedTextures = new Set();
  const animeProfile = resolveAnimeHeroModelProfile(definition);
  const materials = createMaterials(definition, ownedMaterials, ownedTextures);
  const root = new Group();
  root.name = "__lantern_original_character";
  root.userData.__lanternOriginalCharacterId = definition.id;
  root.userData.__lanternIdentityName = definition.identityName;
  root.userData.__lanternCharacterStyle = animeProfile?.styleId ?? "procedural-pixel-v1";
  root.scale.setScalar(animeProfile ? 0.96 : 0.94);

  const rig = new Group();
  rig.name = "rig";
  root.add(rig);

  const legOffset = animeProfile ? 0.155 : 0.18;
  const leftLeg = createPivot(rig, "left_leg", -legOffset, animeProfile ? 0.73 : 0.71, 0);
  const rightLeg = createPivot(rig, "right_leg", legOffset, animeProfile ? 0.73 : 0.71, 0);

  const body = createPivot(rig, "body", 0, 0, 0);
  const armOffset = animeProfile ? 0.405 : 0.48;
  const leftArm = createPivot(rig, "left_arm", -armOffset, animeProfile ? 1.43 : 1.42, 0);
  const rightArm = createPivot(rig, "right_arm", armOffset, animeProfile ? 1.43 : 1.42, 0);
  const head = createPivot(rig, "head", 0, animeProfile ? 1.51 : 1.48, 0);

  let torso;
  if (animeProfile) {
    torso = addAnimeHeroBody({
      body,
      head,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      definition,
      materials,
      geometries: ownedGeometries,
    });
  } else {
    addBox(leftLeg, "left_leg_mesh", [0.28, 0.66, 0.3], [0, -0.33, 0], materials.secondary, ownedGeometries);
    addBox(rightLeg, "right_leg_mesh", [0.28, 0.66, 0.3], [0, -0.33, 0], materials.secondary, ownedGeometries);
    addBox(leftLeg, "left_boot", [0.31, 0.18, 0.42], [0, -0.58, -0.05], materials.dark, ownedGeometries);
    addBox(rightLeg, "right_boot", [0.31, 0.18, 0.42], [0, -0.58, -0.05], materials.dark, ownedGeometries);

    torso = addBox(body, "torso", [0.72, 0.78, 0.4], [0, 1.09, 0], materials.primary, ownedGeometries);
    addBox(body, "belt", [0.76, 0.13, 0.44], [0, 0.74, -0.01], materials.accent, ownedGeometries);
    if (definition.robe) {
      addBox(body, "robe", [0.84, 0.58, 0.46], [0, 0.62, 0.01], materials.primary, ownedGeometries);
      addBox(body, "robe_trim", [0.88, 0.1, 0.49], [0, 0.36, 0], materials.secondary, ownedGeometries);
    }
    addArchetypeSilhouette(body, definition, materials, ownedGeometries);

    addBox(leftArm, "left_sleeve", [0.25, 0.62, 0.3], [0, -0.3, 0], materials.primary, ownedGeometries);
    addBox(rightArm, "right_sleeve", [0.25, 0.62, 0.3], [0, -0.3, 0], materials.primary, ownedGeometries);
    addBox(leftArm, "left_hand", [0.22, 0.2, 0.24], [0, -0.66, -0.01], materials.skin, ownedGeometries);
    addBox(rightArm, "right_hand", [0.22, 0.2, 0.24], [0, -0.66, -0.01], materials.skin, ownedGeometries);

    addBox(head, "head_mesh", [0.6, 0.58, 0.58], [0, 0.29, 0], materials.skin, ownedGeometries);
    addBox(head, "hair_cap", [0.62, 0.18, 0.6], [0, 0.51, 0.01], materials.hair, ownedGeometries);
    addHair(head, definition, materials, ownedGeometries);
    addFace(head, materials.face, ownedGeometries);
    if (definition.beard) addBeard(head, materials.hair, ownedGeometries);
    addHeadgear(head, definition.headgear, materials, ownedGeometries);

    if (definition.cape) {
      addBox(body, "cape", [0.82, 1.08, 0.08], [0, 1.01, 0.25], materials.secondary, ownedGeometries, [-0.04, 0, 0]);
    }
  }

  const accessoryPosition = animeProfile?.accessoryPosition ?? [0.58, 0.98, -0.2];
  const accessory = createPivot(rig, "accessory", ...accessoryPosition);
  const animeVfx = animeProfile
    ? addAnimeHeroProp(accessory, definition, materials, ownedGeometries)
    : (addProp(accessory, definition.prop, materials, ownedGeometries), null);

  const motionController = createProceduralCharacterMotionController(
    { root, body, head, leftArm, rightArm, leftLeg, rightLeg, accessory },
    entity,
    { seed: hashString(definition.identityKey) % 997 },
  );
  let disposed = false;
  const controller = {
    updateEntity(nextEntity) {
      return motionController.updateEntity(nextEntity);
    },
    play(action, options) {
      return motionController.play(action, options);
    },
    getDiagnostics() {
      return motionController.getDiagnostics();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      torso.onBeforeRender = null;
      motionController.dispose();
      root.removeFromParent();
      for (const geometry of ownedGeometries) geometry.dispose();
      for (const material of ownedMaterials) material.dispose();
      for (const texture of ownedTextures) texture.dispose();
    },
  };

  torso.onBeforeRender = () => {
    if (disposed) return;
    motionController.render();
    if (animeVfx) updateAnimeHeroVfx(animeVfx, nowMs());
  };

  const partCounts = {};
  root.traverse((object) => {
    if (!object?.isMesh) return;
    const category = String(object.name || "mesh").split("_")[0];
    partCounts[category] = (partCounts[category] || 0) + 1;
  });
  const requiredParts = ["head", "face", "nose", "torso"];
  const missingParts = requiredParts.filter((part) => (partCounts[part] || 0) < 1);
  const triangleCount = countOwnedTriangles(ownedGeometries);
  const withinPerformanceBudget = !animeProfile || (
    ownedGeometries.size <= animeProfile.maximumMeshes
    && triangleCount <= animeProfile.maximumTriangles
    && ownedMaterials.size <= animeProfile.maximumMaterials
  );
  return {
    root,
    controller,
    definition,
    diagnostics: {
      modelKind: "procedural-original",
      ...(animeProfile
        ? { textureUv: "procedural-toon-gradient" }
        : { textureUv: "procedural-pixel-materials" }),
      renderStyle: animeProfile ? "anime-toon" : "pixel-lambert",
      styleId: animeProfile?.styleId ?? null,
      meshes: [...ownedGeometries].length,
      materials: [...ownedMaterials].length,
      textures: [...ownedTextures].length,
      triangles: triangleCount,
      performanceBudget: animeProfile ? {
        maximumMeshes: animeProfile.maximumMeshes,
        maximumTriangles: animeProfile.maximumTriangles,
        maximumMaterials: animeProfile.maximumMaterials,
        withinBudget: withinPerformanceBudget,
      } : null,
      partCounts,
      missingParts,
      healthy: ownedGeometries.size >= 12
        && ownedTextures.size >= (animeProfile ? 1 : 4)
        && missingParts.length === 0
        && withinPerformanceBudget,
    },
  };
}

const PROCEDURAL_RIG_PARTS = Object.freeze([
  "root",
  "body",
  "head",
  "leftArm",
  "rightArm",
  "leftLeg",
  "rightLeg",
  "accessory",
]);

const STREAMED_LOCOMOTION = new Map([
  ["idle", "idle"],
  ["walking", "walk"],
  ["walk", "walk"],
  ["running", "run"],
  ["run", "run"],
  ["crouch", "crouch"],
  ["crouchwalking", "crouchWalk"],
  ["crouchwalk", "crouchWalk"],
  ["jump", "jump"],
  ["fall", "fall"],
  ["swim", "swim"],
  ["fly", "fly"],
  ["flying", "fly"],
  ["ride", "ride"],
  ["riding", "ride"],
]);

const PROCEDURAL_ACTION_DURATIONS = Object.freeze({
  swing: 430,
  hurt: 260,
  use: 650,
});

/**
 * Drive an original procedural character from the same semantic motion graph
 * used by the skinview player.  The public controller surface intentionally
 * remains compatible with the previous updateEntity/play/dispose contract.
 *
 * Exporting this renderer-independent controller factory lets its timing and
 * poses be tested without constructing textures or a WebGL scene.
 */
export function createProceduralCharacterMotionController(rig, entity, options = {}) {
  const now = typeof options.now === "function" ? options.now : nowMs;
  const graph = options.graph instanceof AvatarMotionGraph
    ? options.graph
    : new AvatarMotionGraph({ ...(options.graphOptions || {}), now });
  const baseTransforms = captureProceduralRig(rig);
  const state = {
    graph,
    now,
    seed: finiteNumber(options.seed, 0),
    poseDamping: positiveNumber(options.poseDamping, 15),
    animationTime: 0,
    lastRenderAt: null,
    blendedPose: createProceduralPose(),
    poseInitialized: false,
    actions: { swing: null, hurt: null, use: null },
    disposed: false,
  };

  const controller = {
    updateEntity(nextEntity) {
      if (state.disposed || !nextEntity || typeof nextEntity !== "object") return state.graph.getState();
      const receivedAt = finiteNumber(state.now(), Date.now());
      return state.graph.setMotion(proceduralMotionPayload(nextEntity), receivedAt);
    },
    play(action, actionOptions = {}) {
      if (state.disposed) return false;
      const normalized = String(action || "idle").toLowerCase();
      const locomotion = STREAMED_LOCOMOTION.get(normalized);
      if (locomotion) {
        applyStreamedLocomotionHint(state.graph, locomotion, finiteNumber(state.now(), Date.now()));
        return true;
      }

      const actionKind = normalized === "oneswing" || normalized === "swing"
        ? "swing"
        : normalized === "hurt" || normalized === "damage"
          ? "hurt"
          : normalized === "use" || normalized === "using" || normalized === "useitem"
            ? "use"
            : null;
      if (!actionKind) return false;
      const current = state.actions[actionKind];
      const startedAt = finiteNumber(state.now(), Date.now());
      if (actionKind === "swing" && current && actionProgress(current, startedAt) < 1) return false;
      state.actions[actionKind] = {
        startedAt,
        durationMs: clamp(
          finiteNumber(actionOptions?.durationMs, PROCEDURAL_ACTION_DURATIONS[actionKind]),
          40,
          10_000,
        ),
        hand: actionOptions?.hand === "left" ? "left" : "right",
      };
      return true;
    },
    render(renderedAt = state.now()) {
      if (state.disposed) return state.graph.getState();
      const current = finiteNumber(renderedAt, finiteNumber(state.now(), Date.now()));
      const delta = state.lastRenderAt === null
        ? 0
        : clamp((current - state.lastRenderAt) / 1_000, 0, 0.1);
      state.lastRenderAt = current;
      state.animationTime += delta;

      const motion = state.graph.update(delta);
      const targetPose = createProceduralPose();
      applyProceduralLocomotionPose(targetPose, motion, state.animationTime, state.seed);
      applyProceduralLookPose(targetPose, motion);
      blendProceduralPose(state, targetPose, delta);

      const composedPose = cloneProceduralPose(state.blendedPose);
      expireProceduralActions(state.actions, current);
      applyProceduralActionOverlays(composedPose, state.actions, motion, current, state.animationTime);
      writeProceduralRig(rig, baseTransforms, composedPose);
      return motion;
    },
    getDiagnostics() {
      return {
        ...state.graph.getDiagnostics(),
        rig: "procedural-original",
        disposed: state.disposed,
        overlays: Object.fromEntries(
          Object.entries(state.actions).map(([kind, action]) => [kind, summarizeProceduralAction(kind, action, finiteNumber(state.now(), Date.now()))]),
        ),
      };
    },
    dispose() {
      state.disposed = true;
      state.actions.swing = null;
      state.actions.hurt = null;
      state.actions.use = null;
    },
  };

  controller.updateEntity(entity);
  return controller;
}

function createMaterials(definition, ownedMaterials, ownedTextures) {
  const animeProfile = resolveAnimeHeroModelProfile(definition);
  if (animeProfile) return createAnimeHeroMaterials(definition, ownedMaterials, ownedTextures);

  const texture = (kind, base, secondary, accent) => {
    const result = createPixelTexture(kind, base, secondary, accent, definition.identityKey);
    ownedTextures.add(result);
    return result;
  };
  const lambert = (kind, base, secondary, accent) => {
    const material = new MeshLambertMaterial({ map: texture(kind, base, secondary, accent) });
    ownedMaterials.add(material);
    return material;
  };
  const basic = (kind, base, secondary, accent, options = {}) => {
    const material = new MeshBasicMaterial({ map: texture(kind, base, secondary, accent), ...options });
    ownedMaterials.add(material);
    return material;
  };
  const { primary, secondary, accent } = definition.palette;
  return {
    primary: lambert("cloth", primary, secondary, accent),
    secondary: lambert("trim", secondary, primary, accent),
    accent: lambert("metal", accent, secondary, primary),
    skin: lambert("skin", definition.skin, shadeHex(definition.skin, -22), definition.skin),
    hair: lambert("hair", definition.hair, shadeHex(definition.hair, -28), definition.hair),
    dark: lambert("dark", "#252528", "#443b35", accent),
    face: basic("face", definition.skin, definition.hair, definition.eyes, { side: DoubleSide }),
    glow: basic("glow", accent, "#fff0a8", "#ffffff", { transparent: true, opacity: 0.92 }),
  };
}

function createAnimeHeroMaterials(definition, ownedMaterials, ownedTextures) {
  const gradientMap = createToonGradientTexture();
  ownedTextures.add(gradientMap);
  const toon = (color, options = {}) => {
    const material = new MeshToonMaterial({ color, gradientMap, ...options });
    material.userData.__lanternAnimeToon = true;
    ownedMaterials.add(material);
    return material;
  };
  const basic = (color, options = {}) => {
    const material = new MeshBasicMaterial({ color, ...options });
    ownedMaterials.add(material);
    return material;
  };
  const energyColour = definition.archetype === "ninja" ? "#54d9ff" : "#62d8ff";
  return {
    renderStyle: "anime-toon",
    primary: toon(definition.palette.primary),
    secondary: toon(definition.palette.secondary),
    accent: toon(definition.palette.accent),
    skin: toon(definition.skin),
    hair: toon(definition.hair),
    dark: toon(definition.archetype === "swordsman" ? "#090c14" : "#111827"),
    face: toon(definition.skin, { side: DoubleSide }),
    white: toon("#fff9ee"),
    eye: basic(definition.eyes),
    pupil: basic("#111827"),
    outline: basic("#11131b", { side: BackSide }),
    metal: toon(definition.archetype === "ninja" ? "#cbd5df" : "#d8e5ef"),
    glow: basic(energyColour, { transparent: true, opacity: 0.88, depthWrite: false, blending: AdditiveBlending }),
    energy: basic(energyColour, { transparent: true, opacity: 0.42, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }),
    energySoft: basic("#d8f8ff", { transparent: true, opacity: 0.24, depthWrite: false, blending: AdditiveBlending }),
  };
}

function createToonGradientTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 1;
  const context = canvas.getContext("2d");
  for (const [index, shade] of ["#3f3f3f", "#777777", "#b9b9b9", "#ffffff"].entries()) {
    context.fillStyle = shade;
    context.fillRect(index, 0, 1, 1);
  }
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function addAnimeHeroBody({ body, head, leftArm, rightArm, leftLeg, rightLeg, definition, materials, geometries }) {
  for (const [leg, side] of [[leftLeg, "left"], [rightLeg, "right"]]) {
    addCapsule(leg, `${side}_leg_mesh`, [0.125, 0.43, 4, 8], [0, -0.3, 0], materials.secondary, geometries, [0, 0, 0], [1, 1, 0.82]);
    addCylinder(leg, `${side}_shin_wrap`, [0.132, 0.138, 0.16, 10], [0, -0.5, 0], definition.archetype === "ninja" ? materials.primary : materials.dark, geometries);
    addCapsule(leg, `${side}_boot`, [0.115, 0.08, 3, 8], [0, -0.61, -0.055], materials.dark, geometries, [Math.PI / 2, 0, 0], [1.08, 1, 1.25]);
  }

  addCapsule(body, "torso_outline", [0.32, 0.32, 4, 10], [0, 1.12, 0], materials.outline, geometries, [0, 0, 0], [1.035, 1.025, 0.65]);
  const torso = addCapsule(body, "torso", [0.31, 0.32, 4, 10], [0, 1.12, 0], materials.primary, geometries, [0, 0, 0], [1, 1, 0.62]);
  addCylinder(body, "belt", [0.325, 0.335, 0.11, 12], [0, 0.75, 0], definition.archetype === "ninja" ? materials.secondary : materials.dark, geometries, [0, 0, 0], [1, 1, 0.64]);

  if (definition.archetype === "ninja") addAnimeNinjaOutfit(body, materials, geometries);
  else addAnimeSwordsmanOutfit(body, materials, geometries);

  for (const [arm, side] of [[leftArm, "left"], [rightArm, "right"]]) {
    const sleeveMaterial = definition.archetype === "ninja" ? materials.primary : materials.dark;
    addCapsule(arm, `${side}_sleeve_outline`, [0.117, 0.42, 3, 8], [0, -0.3, 0], materials.outline, geometries, [0, 0, 0], [1.045, 1.02, 0.92]);
    addCapsule(arm, `${side}_sleeve`, [0.11, 0.42, 3, 8], [0, -0.3, 0], sleeveMaterial, geometries, [0, 0, 0], [1, 1, 0.88]);
    addCylinder(arm, `${side}_cuff`, [0.115, 0.12, 0.1, 10], [0, -0.56, 0], definition.archetype === "ninja" ? materials.secondary : materials.metal, geometries, [0, 0, 0], [1, 1, 0.9]);
    addSphere(arm, `${side}_hand`, [0.12, 12, 8], [0, -0.67, -0.012], materials.skin, geometries, [0, 0, 0], [0.88, 1.02, 0.82]);
  }

  addSphere(head, "head_outline", [0.355, 20, 12], [0, 0.29, 0], materials.outline, geometries, [0, 0, 0], [0.96, 1.055, 0.93]);
  addSphere(head, "head_mesh", [0.345, 20, 12], [0, 0.29, 0], materials.skin, geometries, [0, 0, 0], [0.95, 1.05, 0.92]);
  addAnimeFace(head, definition, materials, geometries);
  if (definition.archetype === "ninja") addAnimeNinjaHairAndBand(head, materials, geometries);
  else addAnimeSwordsmanHair(head, materials, geometries);
  return torso;
}

function addAnimeNinjaOutfit(body, materials, geometries) {
  addCapsule(body, "ninja_panel_left", [0.072, 0.39, 3, 7], [-0.245, 1.08, -0.205], materials.secondary, geometries, [0, 0, -0.05], [0.9, 1, 0.42]);
  addCapsule(body, "ninja_panel_right", [0.072, 0.39, 3, 7], [0.245, 1.08, -0.205], materials.secondary, geometries, [0, 0, 0.05], [0.9, 1, 0.42]);
  addTorus(body, "ninja_collar", [0.255, 0.045, 5, 18], [0, 1.47, 0], materials.secondary, geometries, [Math.PI / 2, 0, 0], [1, 1, 0.72]);
  addCapsule(body, "utility_pouch", [0.1, 0.13, 3, 7], [0.33, 0.74, 0.13], materials.secondary, geometries, [0, 0, -0.16], [1.2, 1, 0.7]);
  addCylinder(body, "chakra_seal", [0.072, 0.072, 0.022, 16], [0, 1.08, -0.212], materials.glow, geometries, [Math.PI / 2, 0, 0]);
}

function addAnimeSwordsmanOutfit(body, materials, geometries) {
  addCylinder(body, "coat_skirt", [0.29, 0.43, 0.72, 12], [0, 0.62, 0.02], materials.primary, geometries, [0, 0, 0], [1, 1, 0.62]);
  addCapsule(body, "coat_lapel_left", [0.045, 0.55, 3, 7], [-0.12, 1.08, -0.205], materials.metal, geometries, [0, 0, -0.18], [0.72, 1, 0.35]);
  addCapsule(body, "coat_lapel_right", [0.045, 0.55, 3, 7], [0.12, 1.08, -0.205], materials.metal, geometries, [0, 0, 0.18], [0.72, 1, 0.35]);
  addCapsule(body, "coat_front_trim_left", [0.035, 0.54, 3, 6], [-0.25, 0.58, -0.255], materials.secondary, geometries, [0, 0, -0.04], [0.7, 1, 0.3]);
  addCapsule(body, "coat_front_trim_right", [0.035, 0.54, 3, 6], [0.25, 0.58, -0.255], materials.secondary, geometries, [0, 0, 0.04], [0.7, 1, 0.3]);
  addCapsule(body, "coat_tail_left", [0.13, 0.46, 3, 8], [-0.18, 0.48, 0.18], materials.dark, geometries, [-0.08, 0, -0.05], [1, 1, 0.3]);
  addCapsule(body, "coat_tail_right", [0.13, 0.46, 3, 8], [0.18, 0.48, 0.18], materials.dark, geometries, [-0.08, 0, 0.05], [1, 1, 0.3]);
  addTorus(body, "swordsman_collar", [0.26, 0.035, 5, 18], [0, 1.46, 0], materials.metal, geometries, [Math.PI / 2, 0, 0], [1, 1, 0.7]);
  addSphere(body, "swordsman_clasp", [0.055, 10, 6], [0.21, 1.35, -0.23], materials.glow, geometries, [0, 0, 0], [1, 1, 0.5]);
}

function addAnimeFace(head, definition, materials, geometries) {
  for (const [side, x] of [["left", -0.125], ["right", 0.125]]) {
    addSphere(head, `face_eye_white_${side}`, [0.1, 12, 8], [x, 0.34, -0.31], materials.white, geometries, [0, 0, 0], [1.16, 0.58, 0.22]);
    addSphere(head, `face_iris_${side}`, [0.05, 12, 8], [x, 0.335, -0.333], materials.eye, geometries, [0, 0, 0], [0.72, 0.94, 0.28]);
    addSphere(head, `face_pupil_${side}`, [0.025, 10, 6], [x, 0.333, -0.344], materials.pupil, geometries, [0, 0, 0], [0.62, 1, 0.3]);
    addSphere(head, `face_catchlight_${side}`, [0.01, 8, 5], [x - 0.011, 0.35, -0.353], materials.white, geometries, [0, 0, 0], [0.75, 1, 0.25]);
    addCapsule(head, `face_brow_${side}`, [0.013, 0.105, 2, 6], [x, 0.435, -0.306], materials.hair, geometries, [0, 0, side === "left" ? 1.47 : -1.47], [1, 1, 0.42]);
  }
  addSphere(head, "nose", [0.035, 10, 6], [0, 0.255, -0.337], materials.skin, geometries, [0, 0, 0], [0.55, 0.9, 0.5]);
  addCapsule(head, "face_mouth", [0.009, 0.085, 2, 6], [0, 0.18, -0.326], materials.pupil, geometries, [0, 0, Math.PI / 2], [1, 1, 0.38]);

  if (definition.archetype === "ninja") {
    for (const [side, x, direction] of [["left", -0.21, -1], ["right", 0.21, 1]]) {
      for (let index = -1; index <= 1; index += 1) {
        addCapsule(
          head,
          `face_whisker_${side}_${index + 1}`,
          [0.009, 0.105, 2, 6],
          [x, 0.225 + index * 0.055, -0.294],
          materials.pupil,
          geometries,
          [0, 0, direction * (Math.PI / 2 + index * 0.13)],
          [1, 1, 0.35],
        );
      }
    }
  }
}

function addAnimeNinjaHairAndBand(head, materials, geometries) {
  addSphere(head, "hair_cap", [0.36, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.62], [0, 0.3, 0.012], materials.hair, geometries, [0, 0, 0], [0.96, 1.08, 0.94]);
  const spikes = [
    ["center", [0, 0.76, 0.04], [0.04, 0, 0], 0.13, 0.43],
    ["crown_left", [-0.18, 0.72, 0.04], [0.04, 0, 0.45], 0.12, 0.39],
    ["crown_right", [0.18, 0.72, 0.04], [0.04, 0, -0.45], 0.12, 0.39],
    ["side_left", [-0.34, 0.55, 0.04], [0, 0, 1.02], 0.11, 0.38],
    ["side_right", [0.34, 0.55, 0.04], [0, 0, -1.02], 0.11, 0.38],
    ["back_left", [-0.22, 0.57, 0.25], [-0.62, 0, 0.58], 0.115, 0.38],
    ["back_right", [0.22, 0.57, 0.25], [-0.62, 0, -0.58], 0.115, 0.38],
    ["rear", [0, 0.57, 0.35], [-1.02, 0, 0], 0.12, 0.4],
  ];
  for (const [name, position, rotation, radius, height] of spikes) {
    addCone(head, `hair_spike_${name}`, [radius, height, 6], position, materials.hair, geometries, rotation);
  }
  addCone(head, "hair_bang_left", [0.07, 0.27, 5], [-0.11, 0.45, -0.285], materials.hair, geometries, [0.1, 0, Math.PI - 0.18]);
  addCone(head, "hair_bang_right", [0.07, 0.25, 5], [0.1, 0.45, -0.285], materials.hair, geometries, [0.1, 0, Math.PI + 0.18]);

  addCylinder(head, "ninja_headband", [0.355, 0.36, 0.115, 18], [0, 0.5, 0], materials.secondary, geometries, [0, 0, 0], [1, 1, 0.94]);
  addCapsule(head, "ninja_plate", [0.068, 0.2, 3, 8], [0, 0.5, -0.348], materials.metal, geometries, [0, 0, Math.PI / 2], [1, 1, 0.42]);
  addTorus(head, "ninja_emblem", [0.043, 0.009, 4, 14, Math.PI * 1.55], [0, 0.5, -0.382], materials.dark, geometries, [0, 0, -0.42]);
  addCapsule(head, "ninja_emblem_tail", [0.007, 0.055, 2, 5], [0.04, 0.476, -0.383], materials.dark, geometries, [0, 0, -0.72], [1, 1, 0.5]);
  addCapsule(head, "headband_tail_left", [0.026, 0.33, 2, 6], [-0.34, 0.31, 0.22], materials.secondary, geometries, [0.18, 0, 0.28], [1, 1, 0.65]);
  addCapsule(head, "headband_tail_right", [0.024, 0.29, 2, 6], [-0.27, 0.28, 0.27], materials.secondary, geometries, [0.12, 0, 0.1], [1, 1, 0.65]);
}

function addAnimeSwordsmanHair(head, materials, geometries) {
  addSphere(head, "hair_cap", [0.36, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.68], [0, 0.31, 0.02], materials.hair, geometries, [0, 0, 0], [0.97, 1.07, 0.95]);
  const locks = [
    ["bang_left", [-0.16, 0.44, -0.285], [0.08, 0, Math.PI - 0.18], 0.075, 0.35],
    ["bang_center", [-0.035, 0.43, -0.31], [0.06, 0, Math.PI - 0.04], 0.07, 0.32],
    ["bang_right", [0.11, 0.46, -0.29], [0.08, 0, Math.PI + 0.23], 0.075, 0.32],
    ["temple_left", [-0.31, 0.37, -0.1], [0, 0, 2.45], 0.075, 0.3],
    ["temple_right", [0.31, 0.4, -0.08], [0, 0, -2.45], 0.075, 0.28],
    ["crown_left", [-0.16, 0.67, 0.02], [0, 0, 0.5], 0.09, 0.3],
    ["crown_right", [0.14, 0.68, 0.04], [0, 0, -0.42], 0.09, 0.31],
    ["back", [0, 0.52, 0.31], [-1.0, 0, 0], 0.1, 0.34],
  ];
  for (const [name, position, rotation, radius, height] of locks) {
    addCone(head, `hair_${name}`, [radius, height, 6], position, materials.hair, geometries, rotation);
  }
}

function addAnimeHeroProp(parent, definition, materials, geometries) {
  if (definition.archetype === "ninja") {
    addCylinder(parent, "kunai_grip", [0.027, 0.035, 0.3, 8], [-0.04, 0.02, 0], materials.dark, geometries, [0, 0, -0.22]);
    addBlade(parent, "kunai_blade", 0.3, 0.075, [0.035, 0.29, 0], materials.metal, geometries, [0, 0, -0.22]);
    addTorus(parent, "kunai_ring", [0.07, 0.018, 5, 14], [-0.105, -0.17, 0], materials.metal, geometries, [Math.PI / 2, 0, 0]);
    const chakra = createPivot(parent, "chakra_orb_vfx", 0.12, -0.08, -0.16);
    addSphere(chakra, "chakra_orb", [0.12, 14, 9], [0, 0, 0], materials.energySoft, geometries);
    const ringA = addTorus(chakra, "chakra_spiral_a", [0.145, 0.012, 5, 24], [0, 0, 0], materials.glow, geometries, [0.55, 0, 0]);
    const ringB = addTorus(chakra, "chakra_spiral_b", [0.13, 0.009, 5, 22], [0, 0, 0], materials.energy, geometries, [0, Math.PI / 2, 0.35]);
    return { kind: "ninja", groups: [chakra], rings: [ringA, ringB], energyMaterial: materials.energy, softMaterial: materials.energySoft };
  }

  addAnimeSword(parent, "left", [-0.19, -0.39, 0], [0, 0, -0.56], materials, geometries);
  addAnimeSword(parent, "right", [0.19, -0.39, 0.12], [0, 0, 0.56], materials, geometries);
  const trailGroup = createPivot(parent, "sword_skill_vfx", 0, 0.12, -0.08);
  const trailA = addTorus(trailGroup, "sword_skill_arc_a", [0.72, 0.018, 5, 30, Math.PI * 1.34], [0, 0, 0], materials.energy, geometries, [0.12, 0.18, -0.9]);
  const trailB = addTorus(trailGroup, "sword_skill_arc_b", [0.58, 0.012, 5, 26, Math.PI * 1.2], [0, 0, 0.03], materials.glow, geometries, [-0.16, -0.12, 1.05]);
  return { kind: "swordsman", groups: [trailGroup], rings: [trailA, trailB], energyMaterial: materials.energy, softMaterial: materials.energySoft };
}

function addAnimeSword(parent, side, gripPosition, rotation, materials, geometries) {
  const sign = side === "left" ? 1 : -1;
  addCylinder(parent, `sword_${side}_grip`, [0.03, 0.037, 0.31, 8], gripPosition, materials.dark, geometries, rotation);
  addBox(parent, `sword_${side}_guard`, [0.25, 0.045, 0.07], [gripPosition[0] + sign * 0.08, gripPosition[1] + 0.17, gripPosition[2]], materials.metal, geometries, rotation);
  const bladePosition = [gripPosition[0] + sign * 0.31, gripPosition[1] + 0.61, gripPosition[2]];
  addBlade(parent, `sword_${side}_blade`, 0.93, 0.068, bladePosition, side === "left" ? materials.secondary : materials.metal, geometries, rotation);
  addBlade(parent, `sword_${side}_energy_edge`, 0.96, 0.075, bladePosition, materials.energy, geometries, rotation);
}

function updateAnimeHeroVfx(vfx, renderedAt) {
  const time = renderedAt / 1_000;
  const pulse = 0.5 + 0.5 * Math.sin(time * (vfx.kind === "ninja" ? 4.6 : 3.2));
  if (vfx.kind === "ninja") {
    vfx.groups[0].rotation.y = time * 1.8;
    vfx.rings[0].rotation.z = time * 2.7;
    vfx.rings[1].rotation.x = time * 2.15;
    const scale = 0.94 + pulse * 0.1;
    vfx.groups[0].scale.setScalar(scale);
    vfx.energyMaterial.opacity = 0.28 + pulse * 0.2;
    vfx.softMaterial.opacity = 0.16 + pulse * 0.12;
    return;
  }
  vfx.groups[0].rotation.z = Math.sin(time * 1.4) * 0.06;
  vfx.rings[0].rotation.z = -0.9 + Math.sin(time * 1.8) * 0.12;
  vfx.rings[1].rotation.z = 1.05 - Math.sin(time * 1.55) * 0.1;
  vfx.energyMaterial.opacity = 0.2 + pulse * 0.22;
}

function createPixelTexture(kind, base, secondary, accent, seedText) {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.fillStyle = base;
  context.fillRect(0, 0, 16, 16);
  const seed = hashString(`${seedText}:${kind}`);
  if (kind === "face") {
    context.fillStyle = secondary;
    context.fillRect(0, 0, 16, 4);
    context.fillRect(0, 3, 3, 6);
    context.fillRect(13, 3, 3, 6);
    context.fillStyle = "#fff4df";
    context.fillRect(3, 6, 4, 3);
    context.fillRect(9, 6, 4, 3);
    context.fillStyle = accent;
    context.fillRect(5, 7, 1, 2);
    context.fillRect(10, 7, 1, 2);
    context.fillStyle = shadeHex(base, -46);
    context.fillRect(7, 11, 2, 1);
  } else {
    context.fillStyle = secondary;
    for (let index = 0; index < 15; index += 1) {
      const x = (seed + index * 7) % 16;
      const y = ((seed >>> 4) + index * 11) % 16;
      context.fillRect(x, y, 1, 1);
    }
    context.fillStyle = accent;
    const offset = seed % 4;
    for (let index = offset; index < 16; index += 4) context.fillRect(index, 14, 2, 1);
    if (kind === "trim" || kind === "metal") {
      context.fillRect(0, 1, 16, 1);
      context.fillRect(0, 12, 16, 1);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function addArchetypeSilhouette(body, definition, materials, geometries) {
  if (["smith", "tanner"].includes(definition.archetype)) {
    addBox(body, "shoulder_left", [0.24, 0.18, 0.5], [-0.41, 1.38, 0], materials.dark, geometries);
    addBox(body, "shoulder_right", [0.24, 0.18, 0.5], [0.41, 1.38, 0], materials.dark, geometries);
  }
  if (["merchant", "receptionist", "cartographer"].includes(definition.archetype)) {
    addBox(body, "satchel", [0.34, 0.4, 0.16], [-0.43, 0.86, 0.22], materials.secondary, geometries, [0, 0, -0.1]);
  }
  if (definition.archetype === "priest") {
    addBox(body, "shoulder_mantle", [0.9, 0.18, 0.48], [0, 1.42, 0], materials.secondary, geometries);
    addBox(body, "water_jewel", [0.14, 0.2, 0.08], [0, 1.25, -0.24], materials.glow, geometries);
  }
  if (definition.archetype === "watchman") {
    addBox(body, "cloak_clasp", [0.2, 0.2, 0.1], [0, 1.34, -0.25], materials.glow, geometries);
  }
  if (definition.archetype === "ninja") {
    addBox(body, "ninja_collar", [0.76, 0.18, 0.48], [0, 1.38, 0], materials.secondary, geometries);
    addBox(body, "chakra_seal", [0.18, 0.18, 0.06], [0, 1.05, -0.24], materials.glow, geometries);
    addBox(body, "utility_pouch", [0.28, 0.34, 0.18], [0.42, 0.72, 0.18], materials.secondary, geometries, [0, 0, -0.08]);
  }
  if (definition.archetype === "swordsman") {
    addBox(body, "coat_lapel_left", [0.14, 0.82, 0.08], [-0.18, 1.03, -0.24], materials.secondary, geometries, [0, 0, -0.08]);
    addBox(body, "coat_lapel_right", [0.14, 0.82, 0.08], [0.18, 1.03, -0.24], materials.secondary, geometries, [0, 0, 0.08]);
    addBox(body, "sword_harness", [0.11, 1.24, 0.08], [0, 1.0, 0.25], materials.accent, geometries, [0, 0, -0.55]);
  }
}

function addHair(head, definition, materials, geometries) {
  if (definition.hairStyle === "long") {
    addBox(head, "hair_back", [0.58, 0.82, 0.18], [0, 0.02, 0.28], materials.hair, geometries);
    addBox(head, "hair_left", [0.13, 0.66, 0.62], [-0.29, 0.09, 0], materials.hair, geometries);
    addBox(head, "hair_right", [0.13, 0.66, 0.62], [0.29, 0.09, 0], materials.hair, geometries);
  } else if (definition.hairStyle === "braids") {
    addBox(head, "hair_braid_left", [0.11, 0.62, 0.11], [-0.31, -0.03, -0.02], materials.hair, geometries);
    addBox(head, "hair_braid_right", [0.11, 0.62, 0.11], [0.31, -0.03, -0.02], materials.hair, geometries);
  } else if (definition.hairStyle === "bun") {
    addCylinder(head, "hair_bun", [0.18, 0.18, 0.22, 8], [0, 0.56, 0.22], materials.hair, geometries, [Math.PI / 2, 0, 0]);
  } else if (definition.hairStyle === "swept") {
    addBox(head, "hair_swept", [0.68, 0.16, 0.64], [0.05, 0.48, -0.01], materials.hair, geometries, [0, 0, -0.14]);
  } else if (definition.hairStyle === "spiky") {
    addBox(head, "hair_spike_center", [0.16, 0.42, 0.18], [0, 0.7, 0.04], materials.hair, geometries, [0.1, 0, 0.05]);
    addBox(head, "hair_spike_left", [0.15, 0.36, 0.17], [-0.22, 0.66, 0.02], materials.hair, geometries, [0.05, 0, -0.42]);
    addBox(head, "hair_spike_right", [0.15, 0.36, 0.17], [0.22, 0.66, 0.02], materials.hair, geometries, [0.05, 0, 0.42]);
    addBox(head, "hair_spike_back_left", [0.16, 0.34, 0.18], [-0.18, 0.62, 0.24], materials.hair, geometries, [-0.35, 0, -0.24]);
    addBox(head, "hair_spike_back_right", [0.16, 0.34, 0.18], [0.18, 0.62, 0.24], materials.hair, geometries, [-0.35, 0, 0.24]);
  }
}

function addFace(head, material, geometries) {
  const geometry = new PlaneGeometry(0.5, 0.46);
  geometries.add(geometry);
  const face = new Mesh(geometry, material);
  face.name = "face_skin";
  face.position.set(0, 0.27, -0.296);
  face.rotation.y = Math.PI;
  head.add(face);
  addBox(head, "nose", [0.13, 0.13, 0.12], [0, 0.25, -0.35], material, geometries);
}

function addBeard(head, material, geometries) {
  addBox(head, "beard", [0.28, 0.28, 0.12], [0, 0.02, -0.34], material, geometries);
  addBox(head, "beard_tip", [0.12, 0.2, 0.1], [0, -0.18, -0.33], material, geometries);
}

function addHeadgear(head, kind, materials, geometries) {
  const box = (name, size, position, material = materials.primary, rotation) => addBox(head, name, size, position, material, geometries, rotation);
  const brim = (radius, height, material = materials.primary, y = 0.66) => addCylinder(head, "hat_brim", [radius * 0.72, radius, height, 8], [0, y, 0], material, geometries);
  if (["scholar", "cloud", "tall_scholar"].includes(kind)) {
    box("hat_crown", [kind === "tall_scholar" ? 0.52 : 0.66, kind === "tall_scholar" ? 0.5 : 0.3, 0.62], [0, kind === "tall_scholar" ? 0.79 : 0.69, 0]);
    box("hat_brim", [0.8, 0.08, 0.68], [0, 0.57, -0.01], materials.accent);
    if (kind === "cloud") box("hat_fold", [0.3, 0.18, 0.15], [0.2, 0.84, 0.08], materials.secondary, [0.2, 0, -0.25]);
    box("hat_jewel", [0.11, 0.11, 0.08], [0, 0.7, -0.34], materials.glow);
    return;
  }
  if (kind === "water_crown") {
    box("crown_band", [0.68, 0.12, 0.62], [0, 0.59, 0], materials.secondary);
    box("crown_center", [0.16, 0.34, 0.14], [0, 0.79, -0.25], materials.secondary, [0, 0, Math.PI / 4]);
    box("crown_left", [0.12, 0.24, 0.12], [-0.24, 0.72, -0.18], materials.secondary, [0, 0, -0.35]);
    box("crown_right", [0.12, 0.24, 0.12], [0.24, 0.72, -0.18], materials.secondary, [0, 0, 0.35]);
    box("crown_jewel", [0.1, 0.15, 0.07], [0, 0.78, -0.36], materials.glow);
    return;
  }
  if (["smith", "visor"].includes(kind)) {
    box("smith_band", [0.66, 0.14, 0.62], [0, 0.55, 0], materials.secondary);
    box("goggle_left", [0.18, 0.14, 0.08], [-0.14, 0.57, -0.34], materials.glow);
    box("goggle_right", [0.18, 0.14, 0.08], [0.14, 0.57, -0.34], materials.glow);
    if (kind === "visor") box("visor_plate", [0.58, 0.25, 0.08], [0, 0.34, -0.36], materials.secondary);
    return;
  }
  if (["merchant", "coin", "shopkeeper", "bard", "straw", "reed", "watch"].includes(kind)) {
    const radius = kind === "watch" || kind === "reed" || kind === "straw" ? 0.58 : 0.46;
    brim(radius, kind === "watch" ? 0.11 : 0.09, kind === "straw" || kind === "reed" ? materials.secondary : materials.primary);
    const topHeight = kind === "watch" ? 0.32 : 0.24;
    addCylinder(head, "hat_crown", [0.25, 0.34, topHeight, 8], [0, 0.78, 0], materials.primary, geometries);
    if (kind === "coin") box("coin_emblem", [0.16, 0.16, 0.06], [0, 0.76, -0.34], materials.accent);
    if (kind === "bard") box("hat_feather", [0.08, 0.46, 0.06], [0.31, 0.9, 0], materials.accent, [0, 0, -0.35]);
    if (kind === "watch") {
      box("ember_band", [0.66, 0.08, 0.62], [0, 0.76, 0], materials.accent);
      box("ember_tip", [0.12, 0.12, 0.12], [0, 1.0, 0], materials.glow);
    }
    return;
  }
  if (["flower_scarf", "stitched_scarf"].includes(kind)) {
    box("head_scarf", [0.64, 0.22, 0.62], [0, 0.54, 0], materials.primary);
    box("scarf_tail", [0.16, 0.5, 0.12], [0.28, 0.18, 0.25], materials.secondary, [0, 0, 0.18]);
    if (kind === "flower_scarf") {
      box("flower_center", [0.1, 0.1, 0.08], [-0.26, 0.63, -0.31], materials.accent);
      box("flower_petals", [0.22, 0.07, 0.07], [-0.26, 0.63, -0.32], materials.secondary, [0, 0, Math.PI / 4]);
    }
    return;
  }
  if (["guild", "survey", "fur", "patched"].includes(kind)) {
    box("cap", [kind === "patched" ? 0.74 : 0.64, 0.28, 0.62], [0, 0.66, 0], materials.primary, [0, 0, kind === "patched" ? -0.1 : 0]);
    box("cap_brim", [0.48, 0.08, 0.22], [0, 0.56, -0.35], materials.secondary);
    if (kind === "guild") {
      box("guild_wing_left", [0.3, 0.1, 0.12], [-0.4, 0.72, 0], materials.secondary, [0, 0, -0.25]);
      box("guild_wing_right", [0.3, 0.1, 0.12], [0.4, 0.72, 0], materials.secondary, [0, 0, 0.25]);
    }
    if (kind === "survey") box("survey_lens", [0.13, 0.13, 0.06], [0.22, 0.62, -0.35], materials.glow);
    return;
  }
  if (kind === "leaf_band") {
    box("ninja_headband", [0.7, 0.15, 0.63], [0, 0.51, 0], materials.secondary);
    box("ninja_plate", [0.34, 0.16, 0.06], [0, 0.51, -0.34], materials.accent);
    box("ninja_emblem", [0.1, 0.08, 0.04], [0, 0.51, -0.39], materials.dark);
    box("headband_tail_left", [0.08, 0.48, 0.08], [-0.34, 0.34, 0.25], materials.secondary, [0, 0, 0.28]);
    box("headband_tail_right", [0.08, 0.42, 0.08], [-0.24, 0.31, 0.29], materials.secondary, [0, 0, 0.12]);
    return;
  }
  if (kind === "black_swordsman") {
    box("swordsman_fringe", [0.64, 0.16, 0.62], [0.03, 0.5, 0], materials.hair, [0, 0, -0.08]);
    box("swordsman_clasp", [0.12, 0.12, 0.06], [0.25, 0.46, -0.34], materials.glow);
  }
}

function addProp(parent, kind, materials, geometries) {
  const box = (name, size, position, material = materials.secondary, rotation) => addBox(parent, name, size, position, material, geometries, rotation);
  const rod = (name, length = 0.9, material = materials.dark, position = [0, 0, 0], rotation = [0, 0, 0]) => addCylinder(parent, name, [0.035, 0.045, length, 6], position, material, geometries, rotation);
  if (["book", "scroll", "ink_scroll", "map", "clipboard"].includes(kind)) {
    box(`${kind}_page`, [0.46, 0.52, 0.1], [0, 0.12, 0], materials.secondary, [0.08, 0.08, 0.12]);
    box(`${kind}_binding`, [0.08, 0.54, 0.12], [-0.2, 0.12, 0], materials.accent, [0.08, 0.08, 0.12]);
    if (kind === "book" || kind === "ink_scroll") rod("brush", 0.55, materials.dark, [0.25, 0.28, -0.04], [0, 0, -0.45]);
    if (kind === "map" || kind === "clipboard") box("compass", [0.15, 0.15, 0.05], [0.1, 0.12, -0.09], materials.glow);
    return;
  }
  if (kind === "hammer" || kind === "hoe" || kind === "fishing_rod" || kind === "shepherd_staff") {
    rod(`${kind}_handle`, kind === "fishing_rod" ? 1.35 : 1.15, materials.dark, [0, 0.18, 0], [0, 0, kind === "fishing_rod" ? -0.25 : 0.12]);
    if (kind === "hammer") box("hammer_head", [0.48, 0.22, 0.24], [0, 0.72, 0], materials.accent);
    if (kind === "hoe") box("hoe_blade", [0.42, 0.1, 0.22], [0.16, 0.72, 0], materials.accent, [0, 0, -0.3]);
    if (kind === "shepherd_staff") box("staff_crook", [0.34, 0.08, 0.08], [0.14, 0.74, 0], materials.accent);
    if (kind === "fishing_rod") box("fishing_line", [0.025, 0.7, 0.025], [0.28, -0.25, 0], materials.secondary);
    return;
  }
  if (kind === "lantern") {
    rod("lantern_handle", 1.15, materials.dark, [0, 0.18, 0], [0, 0, 0.05]);
    box("lantern_frame", [0.38, 0.5, 0.34], [0, -0.45, 0], materials.dark);
    box("lantern_glow", [0.22, 0.32, 0.2], [0, -0.45, -0.01], materials.glow);
    return;
  }
  if (kind === "tongs") {
    rod("tongs_left", 0.72, materials.accent, [-0.06, 0.1, 0], [0, 0, -0.12]);
    rod("tongs_right", 0.72, materials.accent, [0.06, 0.1, 0], [0, 0, 0.12]);
    box("armor_sample", [0.34, 0.38, 0.12], [0, -0.36, 0], materials.secondary);
    return;
  }
  if (["pack", "leather"].includes(kind)) {
    box(kind === "pack" ? "merchant_pack" : "leather_roll", [0.52, 0.68, 0.34], [-0.18, 0.06, 0.34], materials.secondary, [0, 0.2, 0]);
    box("pack_strap", [0.1, 0.76, 0.38], [-0.18, 0.06, 0.32], materials.accent);
    return;
  }
  if (kind === "censer") {
    rod("censer_chain", 0.52, materials.secondary, [0, 0.25, 0]);
    addCylinder(parent, "censer_bowl", [0.18, 0.3, 0.2, 8], [0, -0.08, 0], materials.glow, geometries);
    return;
  }
  if (kind === "scales") {
    rod("scale_post", 0.65, materials.dark, [0, 0.12, 0]);
    box("scale_beam", [0.7, 0.06, 0.08], [0, 0.43, 0], materials.accent);
    box("scale_pan_left", [0.24, 0.05, 0.24], [-0.3, 0.12, 0], materials.accent);
    box("scale_pan_right", [0.24, 0.05, 0.24], [0.3, 0.12, 0], materials.accent);
    return;
  }
  if (kind === "abacus") {
    box("abacus_frame", [0.6, 0.5, 0.1], [0, 0.1, 0], materials.dark);
    for (let row = -1; row <= 1; row += 1) {
      for (let col = -2; col <= 2; col += 1) box("abacus_bead", [0.07, 0.07, 0.14], [col * 0.1, 0.1 + row * 0.11, -0.02], row === 0 ? materials.accent : materials.secondary);
    }
    return;
  }
  if (kind === "lute") {
    addCylinder(parent, "lute_body", [0.22, 0.3, 0.18, 8], [0, 0.02, 0], materials.secondary, geometries, [Math.PI / 2, 0, 0]);
    box("lute_neck", [0.12, 0.68, 0.1], [0.08, 0.45, 0], materials.dark, [0, 0, -0.2]);
    return;
  }
  if (kind === "spool") {
    addCylinder(parent, "thread_spool", [0.16, 0.16, 0.34, 8], [0, 0.08, 0], materials.accent, geometries, [Math.PI / 2, 0, 0]);
    box("leather_pouch", [0.38, 0.34, 0.16], [0, -0.24, 0.05], materials.secondary);
    return;
  }
  if (kind === "windmill") {
    rod("windmill_stick", 0.72, materials.dark, [0, -0.05, 0]);
    for (let index = 0; index < 4; index += 1) box("windmill_blade", [0.34, 0.09, 0.05], [Math.cos(index * Math.PI / 2) * 0.16, 0.34 + Math.sin(index * Math.PI / 2) * 0.16, 0], index % 2 ? materials.accent : materials.secondary, [0, 0, index * Math.PI / 2]);
    return;
  }
  if (kind === "kunai") {
    rod("kunai_grip", 0.42, materials.dark, [0, 0.02, 0], [0, 0, -0.2]);
    box("kunai_blade", [0.12, 0.44, 0.06], [0.04, 0.42, 0], materials.accent, [0, 0, -0.2]);
    addCylinder(parent, "kunai_ring", [0.08, 0.11, 0.05, 8], [-0.08, -0.22, 0], materials.secondary, geometries, [Math.PI / 2, 0, 0]);
    return;
  }
  if (kind === "dual_swords") {
    rod("sword_left_grip", 0.45, materials.dark, [-0.12, -0.18, 0.14], [0, 0, -0.55]);
    box("sword_left_blade", [0.09, 1.18, 0.06], [0.22, 0.43, 0.14], materials.secondary, [0, 0, -0.55]);
    box("sword_left_edge", [0.035, 1.08, 0.07], [0.25, 0.45, 0.13], materials.glow, [0, 0, -0.55]);
    rod("sword_right_grip", 0.45, materials.dark, [0.12, -0.18, 0.3], [0, 0, 0.52]);
    box("sword_right_blade", [0.09, 1.12, 0.06], [-0.2, 0.4, 0.3], materials.primary, [0, 0, 0.52]);
    box("sword_right_edge", [0.035, 1.02, 0.07], [-0.23, 0.42, 0.29], materials.glow, [0, 0, 0.52]);
  }
}

function proceduralMotionPayload(entity) {
  const flags = entitySharedFlags(entity?.metadata);
  const payload = { ...entity };
  if (payload.position == null && payload.pos != null) payload.position = payload.pos;
  if (payload.pos == null && payload.position != null) payload.pos = payload.position;
  if (payload.sneaking == null && payload.crouching == null && flags !== null) payload.sneaking = (flags & 0x02) !== 0;
  if (payload.sprinting == null && flags !== null) payload.sprinting = (flags & 0x08) !== 0;
  if (payload.elytraFlying == null && flags !== null) payload.elytraFlying = (flags & 0x80) !== 0;
  return payload;
}

function entitySharedFlags(metadata) {
  const raw = Array.isArray(metadata)
    ? metadata[0]
    : metadata && typeof metadata === "object"
      ? metadata[0] ?? metadata["0"]
      : undefined;
  const value = raw && typeof raw === "object" && "value" in raw ? raw.value : raw;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function applyStreamedLocomotionHint(graph, state, receivedAt) {
  const prior = graph.frame;
  const yaw = finiteNumber(prior?.yaw, 0);
  const speed = state === "run"
    ? 0.16
    : state === "walk"
      ? 0.06
      : state === "crouchWalk"
        ? 0.035
        : state === "swim" || state === "fly"
          ? 0.08
          : 0;
  const verticalSpeed = state === "jump" ? 0.2 : state === "fall" ? -0.2 : 0;
  const capturedAt = finiteNumber(prior?.capturedAt, receivedAt) + 50;
  const priorPosition = prior?.position || { x: 0, y: 0, z: 0 };
  const velocity = {
    x: -Math.sin(yaw) * speed,
    y: verticalSpeed,
    z: -Math.cos(yaw) * speed,
  };
  graph.setMotion({
    ...(prior || {}),
    seq: (Number.isSafeInteger(prior?.seq) ? prior.seq : -1) + 1,
    capturedAt,
    // A streamed locomotion command is an intentional synthetic sample, not
    // a stale network velocity. Advance one game tick so the motion graph's
    // position-authoritative speed calculation can distinguish it from an
    // entity that is genuinely stuck at the same coordinates.
    position: {
      x: finiteNumber(priorPosition.x, 0) + velocity.x,
      y: finiteNumber(priorPosition.y, 0) + velocity.y,
      z: finiteNumber(priorPosition.z, 0) + velocity.z,
    },
    velocity,
    onGround: !["jump", "fall", "swim", "fly"].includes(state),
    inWater: state === "swim",
    inLava: false,
    elytraFlying: state === "fly",
    riding: state === "ride",
    sneaking: state === "crouch" || state === "crouchWalk",
    sprinting: state === "run",
  }, receivedAt);
}

function applyProceduralLocomotionPose(pose, motion, time, seed) {
  const gait = finiteNumber(motion.gaitPhase, 0);
  const stride = Math.sin(gait);
  const lift = Math.abs(Math.sin(gait));
  const breathe = Math.sin(time * 1.7 + seed) * 0.012;
  const speed = Math.max(0, finiteNumber(motion.horizontalSpeed, 0));
  const motionState = motion.state;

  if (motionState === "idle") {
    addProceduralPosition(pose, "body", 0, breathe, 0);
    addProceduralRotation(pose, "leftArm", 0, 0, 0.025 + breathe * 0.3);
    addProceduralRotation(pose, "rightArm", 0, 0, -0.025 - breathe * 0.3);
    addProceduralRotation(pose, "accessory", 0, 0, Math.sin(time * 1.3 + seed) * 0.025);
    return;
  }

  if (motionState === "walk" || motionState === "run") {
    const running = motionState === "run";
    const strength = running ? clamp(speed / 0.16, 0.58, 1.18) : clamp(speed / 0.07, 0.38, 1);
    const legAmplitude = (running ? 0.78 : 0.5) * strength;
    const armAmplitude = (running ? 0.64 : 0.34) * strength;
    addProceduralRotation(pose, "leftLeg", stride * legAmplitude, 0, 0);
    addProceduralRotation(pose, "rightLeg", -stride * legAmplitude, 0, 0);
    addProceduralRotation(pose, "leftArm", -stride * armAmplitude, 0, running ? 0.08 : 0.035);
    addProceduralRotation(pose, "rightArm", stride * armAmplitude, 0, running ? -0.08 : -0.035);
    addProceduralPosition(pose, "body", 0, lift * (running ? 0.045 : 0.026), 0);
    addProceduralRotation(pose, "root", 0, 0, running ? Math.cos(gait) * 0.018 : 0);
    addProceduralRotation(pose, "accessory", 0, 0, -stride * (running ? 0.11 : 0.07));
    return;
  }

  if (motionState === "crouch" || motionState === "crouchWalk") {
    addProceduralPosition(pose, "body", 0, -0.17, 0.08);
    addProceduralRotation(pose, "body", 0.28, 0, 0);
    addProceduralPosition(pose, "head", 0, -0.11, 0.035);
    addProceduralPosition(pose, "leftArm", 0, -0.1, 0.045);
    addProceduralPosition(pose, "rightArm", 0, -0.1, 0.045);
    addProceduralRotation(pose, "leftArm", 0.2, 0, 0.07);
    addProceduralRotation(pose, "rightArm", 0.2, 0, -0.07);
    if (motionState === "crouchWalk") {
      addProceduralRotation(pose, "leftLeg", stride * 0.3, 0, 0);
      addProceduralRotation(pose, "rightLeg", -stride * 0.3, 0, 0);
      addProceduralRotation(pose, "leftArm", -stride * 0.18, 0, 0);
      addProceduralRotation(pose, "rightArm", stride * 0.18, 0, 0);
      addProceduralPosition(pose, "body", 0, lift * 0.02, 0);
    }
    return;
  }

  if (motionState === "jump") {
    addProceduralPosition(pose, "body", 0, 0.07, 0);
    addProceduralRotation(pose, "leftArm", 0.42, 0, 0.1);
    addProceduralRotation(pose, "rightArm", 0.42, 0, -0.1);
    addProceduralRotation(pose, "leftLeg", -0.4, 0, 0.05);
    addProceduralRotation(pose, "rightLeg", 0.18, 0, -0.05);
    addProceduralRotation(pose, "accessory", 0, 0, 0.16);
    return;
  }

  if (motionState === "fall") {
    addProceduralRotation(pose, "leftArm", -0.16, 0, 0.5);
    addProceduralRotation(pose, "rightArm", -0.16, 0, -0.5);
    addProceduralRotation(pose, "leftLeg", 0.2, 0, 0.08);
    addProceduralRotation(pose, "rightLeg", 0.06, 0, -0.08);
    addProceduralRotation(pose, "accessory", 0, 0, -0.14);
    return;
  }

  if (motionState === "land") {
    const compression = Math.sin(clamp(motion.stateAgeMs / 180, 0, 1) * Math.PI);
    addProceduralPosition(pose, "body", 0, -0.18 * compression, 0.05 * compression);
    addProceduralRotation(pose, "body", 0.18 * compression, 0, 0);
    addProceduralRotation(pose, "leftLeg", 0.34 * compression, 0, 0);
    addProceduralRotation(pose, "rightLeg", 0.34 * compression, 0, 0);
    addProceduralRotation(pose, "leftArm", -0.18 * compression, 0, 0.08 * compression);
    addProceduralRotation(pose, "rightArm", -0.18 * compression, 0, -0.08 * compression);
    return;
  }

  if (motionState === "swim") {
    addProceduralRotation(pose, "root", -1.18, 0, 0);
    addProceduralPosition(pose, "body", 0, 0.1, 0);
    addProceduralRotation(pose, "leftArm", Math.sin(gait) * 1.05 - 0.28, 0, 0.08);
    addProceduralRotation(pose, "rightArm", Math.sin(gait + Math.PI) * 1.05 - 0.28, 0, -0.08);
    addProceduralRotation(pose, "leftLeg", -stride * 0.24, 0, 0);
    addProceduralRotation(pose, "rightLeg", stride * 0.24, 0, 0);
    addProceduralRotation(pose, "accessory", 0, 0, Math.sin(gait * 0.5) * 0.12);
    return;
  }

  if (motionState === "fly") {
    addProceduralRotation(pose, "root", -1.08, 0, 0);
    addProceduralRotation(pose, "leftArm", 0.58, 0, 0.16);
    addProceduralRotation(pose, "rightArm", 0.58, 0, -0.16);
    addProceduralRotation(pose, "leftLeg", 0.16 + stride * 0.08, 0, 0);
    addProceduralRotation(pose, "rightLeg", 0.16 - stride * 0.08, 0, 0);
    addProceduralRotation(pose, "accessory", 0, 0, 0.2);
    return;
  }

  if (motionState === "ride") {
    addProceduralPosition(pose, "body", 0, -0.08, 0);
    addProceduralRotation(pose, "leftArm", -Math.PI / 5, 0, 0);
    addProceduralRotation(pose, "rightArm", -Math.PI / 5, 0, 0);
    addProceduralRotation(pose, "rightLeg", -1.18, -Math.PI / 10, -Math.PI / 40);
    addProceduralRotation(pose, "leftLeg", -1.18, Math.PI / 10, Math.PI / 40);
  }
}

function applyProceduralLookPose(pose, motion) {
  addProceduralRotation(pose, "head", -finiteNumber(motion.pitch, 0), finiteNumber(motion.headRelativeYaw, 0), 0);
}

function applyProceduralActionOverlays(pose, actions, motion, now, time) {
  const swing = actions.swing;
  if (swing) {
    const progress = actionProgress(swing, now);
    const arc = Math.sin(progress * Math.PI);
    const arm = swing.hand === "left" ? "leftArm" : "rightArm";
    const side = swing.hand === "left" ? 1 : -1;
    addProceduralRotation(pose, arm, -1.55 * arc, side * 0.08 * arc, side * 0.3 * arc);
    addProceduralRotation(pose, "body", 0, -side * 0.12 * arc, 0);
    addProceduralRotation(pose, "head", 0, side * 0.04 * arc, 0);
  } else if (actions.use || motion.frame?.usingHeldItem) {
    const strength = actions.use ? Math.sin(actionProgress(actions.use, now) * Math.PI) : 0.9;
    const hand = actions.use?.hand === "left" ? "leftArm" : "rightArm";
    const side = hand === "leftArm" ? 1 : -1;
    addProceduralRotation(pose, hand, -1.08 * strength + Math.sin(time * 7) * 0.025, side * 0.18 * strength, side * 0.1 * strength);
  }

  const hurt = actions.hurt;
  if (hurt) {
    const progress = actionProgress(hurt, now);
    const recoil = Math.sin(progress * Math.PI);
    const shake = Math.sin(progress * Math.PI * 5) * recoil;
    addProceduralRotation(pose, "root", -0.06 * recoil, 0, 0.1 * shake);
    addProceduralRotation(pose, "body", -0.16 * recoil, 0, 0);
    addProceduralRotation(pose, "leftArm", 0.14 * recoil, 0, 0.06 * recoil);
    addProceduralRotation(pose, "rightArm", 0.14 * recoil, 0, -0.06 * recoil);
  }
}

function createProceduralPose() {
  return Object.fromEntries(PROCEDURAL_RIG_PARTS.map((part) => [part, {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
  }]));
}

function cloneProceduralPose(pose) {
  return Object.fromEntries(PROCEDURAL_RIG_PARTS.map((part) => [part, {
    position: { ...pose[part].position },
    rotation: { ...pose[part].rotation },
  }]));
}

function addProceduralPosition(pose, part, x, y, z) {
  const target = pose[part]?.position;
  if (!target) return;
  target.x += x;
  target.y += y;
  target.z += z;
}

function addProceduralRotation(pose, part, x, y, z) {
  const target = pose[part]?.rotation;
  if (!target) return;
  target.x += x;
  target.y += y;
  target.z += z;
}

function blendProceduralPose(state, target, delta) {
  if (!state.poseInitialized) {
    state.blendedPose = cloneProceduralPose(target);
    state.poseInitialized = true;
    return;
  }
  const alpha = delta <= 0 ? 0 : 1 - Math.exp(-state.poseDamping * delta);
  for (const part of PROCEDURAL_RIG_PARTS) {
    for (const transform of ["position", "rotation"]) {
      for (const axis of ["x", "y", "z"]) {
        const current = state.blendedPose[part][transform][axis];
        const desired = target[part][transform][axis];
        state.blendedPose[part][transform][axis] = current + (desired - current) * alpha;
      }
    }
  }
}

function captureProceduralRig(rig) {
  return Object.fromEntries(PROCEDURAL_RIG_PARTS.map((part) => {
    const node = rig?.[part];
    return [part, {
      position: captureTriple(node?.position),
      rotation: captureTriple(node?.rotation),
    }];
  }));
}

function captureTriple(value) {
  return {
    x: finiteNumber(value?.x, 0),
    y: finiteNumber(value?.y, 0),
    z: finiteNumber(value?.z, 0),
    order: typeof value?.order === "string" ? value.order : "XYZ",
  };
}

function writeProceduralRig(rig, bases, pose) {
  for (const part of PROCEDURAL_RIG_PARTS) {
    const node = rig?.[part];
    if (!node) continue;
    const base = bases[part];
    const offset = pose[part];
    writeTriple(node.position, {
      x: base.position.x + offset.position.x,
      y: base.position.y + offset.position.y,
      z: base.position.z + offset.position.z,
    });
    writeTriple(node.rotation, {
      x: base.rotation.x + offset.rotation.x,
      y: base.rotation.y + offset.rotation.y,
      z: base.rotation.z + offset.rotation.z,
    }, base.rotation.order);
  }
}

function writeTriple(target, value, order) {
  if (!target) return;
  if (typeof target.set === "function") {
    if (order) target.set(value.x, value.y, value.z, order);
    else target.set(value.x, value.y, value.z);
    return;
  }
  target.x = value.x;
  target.y = value.y;
  target.z = value.z;
  if (order && "order" in target) target.order = order;
}

function expireProceduralActions(actions, now) {
  for (const kind of Object.keys(actions)) {
    if (actions[kind] && actionProgress(actions[kind], now) >= 1) actions[kind] = null;
  }
}

function actionProgress(action, now) {
  if (!action) return 1;
  return clamp((now - action.startedAt) / action.durationMs, 0, 1);
}

function summarizeProceduralAction(kind, action, now) {
  if (!action) return null;
  return { kind, hand: action.hand, progress: actionProgress(action, now), durationMs: action.durationMs };
}

function createPivot(parent, name, x, y, z) {
  const pivot = new Group();
  pivot.name = name;
  pivot.position.set(x, y, z);
  parent.add(pivot);
  return pivot;
}

function addBox(parent, name, size, position, material, geometries, rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const geometry = new BoxGeometry(...size);
  geometries.add(geometry);
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  parent.add(mesh);
  return mesh;
}

function addCylinder(parent, name, dimensions, position, material, geometries, rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const geometry = new CylinderGeometry(...dimensions);
  geometries.add(geometry);
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  parent.add(mesh);
  return mesh;
}

function addCapsule(parent, name, dimensions, position, material, geometries, rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const geometry = new CapsuleGeometry(...dimensions);
  geometries.add(geometry);
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  parent.add(mesh);
  return mesh;
}

function addSphere(parent, name, dimensions, position, material, geometries, rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const geometry = new SphereGeometry(...dimensions);
  geometries.add(geometry);
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  parent.add(mesh);
  return mesh;
}

function addCone(parent, name, dimensions, position, material, geometries, rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const geometry = new ConeGeometry(...dimensions);
  geometries.add(geometry);
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  parent.add(mesh);
  return mesh;
}

function addTorus(parent, name, dimensions, position, material, geometries, rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const geometry = new TorusGeometry(...dimensions);
  geometries.add(geometry);
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  parent.add(mesh);
  return mesh;
}

function addBlade(parent, name, length, radius, position, material, geometries, rotation = [0, 0, 0]) {
  return addCylinder(parent, name, [0.004, radius, length, 4, 1], position, material, geometries, rotation, [0.72, 1, 0.34]);
}

function countOwnedTriangles(geometries) {
  let triangles = 0;
  for (const geometry of geometries) {
    const indexCount = geometry?.index?.count;
    const positionCount = geometry?.attributes?.position?.count;
    const count = Number.isFinite(indexCount) ? indexCount : positionCount;
    if (Number.isFinite(count)) triangles += Math.floor(count / 3);
  }
  return triangles;
}

function shadeHex(hex, amount) {
  const value = String(hex || "#808080").replace("#", "");
  const normalized = value.length === 3 ? value.split("").map((part) => part + part).join("") : value.padEnd(6, "0").slice(0, 6);
  const number = Number.parseInt(normalized, 16);
  const channel = (shift) => Math.max(0, Math.min(255, ((number >> shift) & 0xff) + amount));
  return `#${[channel(16), channel(8), channel(0)].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

function hashString(value) {
  let hash = 2_166_136_261;
  for (const symbol of String(value || "")) {
    hash ^= symbol.codePointAt(0) || 0;
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, finiteNumber(value, minimum)));
}

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}
