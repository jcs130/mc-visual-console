import {
  AppViewer,
  ResourcesManager,
  createGraphicsBackendSingleThread,
} from "minecraft-renderer/dist/minecraft-renderer.js";
import { io } from "socket.io-client";
import { pendingChunkOrigins } from "./chunk-loading-guard.js";
import { FishingCatchHud } from "./fishing-catch.js";
import {
  Box3,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  NoColorSpace,
  PCFShadowMap,
  PlaneGeometry,
  Raycaster,
  RepeatWrapping,
  TextureLoader,
  Vector2,
  Vector3,
} from "three";
import { Vec3 } from "vec3";
import {
  canonicalEntityName,
  decodeVillagerAppearance,
  minecraftLightLevels,
  normalizeMinecraftTime,
  VILLAGER_LEVEL_KEYS,
  VILLAGER_PROFESSION_KEYS,
  VILLAGER_TYPE_KEYS,
} from "./viewer-runtime.js";
import {
  CUSTOM_CHARACTER_DEFINITIONS,
  createCustomCharacter,
  resolveCustomCharacterDefinition,
} from "./custom-characters.js";
import {
  CORE_NPC_PORTRAIT_URL,
  createFallbackNpcPortraitDefinition,
  NpcPortraitRenderer,
  resolveNpcPortraitSpec,
} from "./npc-portraits.js";
import { normalizeMotionFrame } from "./avatar-motion.js";
import { rendererEntityEquipment } from "./renderer-equipment.js";
import { hasRoomCeiling, hasDeepRoof, roomCutoffWorldY, roomOcclusionMode, createCutawayUniforms, patchCutawayMaterial, advanceReveal, roomRevealRadius, setRoomFloorMask } from "./room-visibility.js";
import { RoomCoverCache } from "./room-cover-cache.js";
import { RoomFloorMask } from "./room-floor-mask.js";
import { installDungeonObserverControls } from "./dungeon-observer-controls.js";
import { installSelfAvatarCameraVisibility } from "./self-avatar-camera-visibility.js";
import { installEntityRenderBounds } from "./entity-render-bounds.js";
import { villagerIdentityConceptColors, NPC_NAMED_ROLE_LABELS, NPC_NAMED_DIALOGUE_LINES, NPC_NAMED_QUEST_TEMPLATES } from "./presets/qiandengji/npc-copy.js";
import { AvatarRigRegistry } from "./avatar-rig-registry.js";
import { resolveCharacterVisualProfile } from "./character-visual-profiles.js";
import { TrustedAvatarAssetPipeline } from "./trusted-avatar-assets.js";
import {
  MINECRAFT_PAINTING_VARIANTS,
  resolvePaintingVariant,
} from "./painting-variants.js";
import { pickEntity } from "./entity-picker.js";
import {
  classifyDungeonInteraction,
  createDungeonHoverLabel,
  isDungeonInteractionCandidate,
} from "./dungeon-interactions.js";
import {
  createBlockContextActionMessage,
  createEntityContextActionMessage,
  createEntityContextMenuModel,
  createInteractableBlockContextModel,
  hideEntityContextSurface,
  renderEntityContextMenu,
  renderEntityDetailCard,
} from "./entity-context-menu.js";
import {
  createAdaptiveQualityController,
  highDetailNpcModelBudget,
  normalizeQualityPreference,
  rateLimitDelayMs,
  selectHighDetailNpcModelIds,
} from "./viewer-performance.js";
import {
  projectHorizontalPointerLook,
  traceVisibilityCorridor,
  updateOcclusionHysteresis,
} from "./dungeon-view-controls.js";
import {
  DEFAULT_PLAYER_SKIN_ID,
  PLAYER_SKINS,
  isPlayerSkinId,
  resolvePlayerSkin,
} from "./player-skins.js";
import {
  DEFAULT_PLAYER_MODEL_ID,
  PLAYER_MODELS,
  isPlayerModelId,
  resolvePlayerModel,
} from "./player-models.js";
import { renderVillagerTradePanel } from "./villager-trades.js";
import {
  ensureNativeVillagerRig,
  villagerTextureLayerPlan,
} from "./villager-rendering.js";
import {
  ViewerEffectSystem,
  normalizeViewerEffectEvent,
} from "./viewer-effects.js";
import { FishingVisuals, withSelfFishingActor } from "./fishing-visuals.js";
import {
  buildNpcProfile,
  createNpcAction,
  createNpcActionSchema,
  createNpcInteractionState,
  deserializeNpcInteractionState,
  getNpcInteraction,
  recordNpcMeeting,
  sanitizeNpcText,
  serializeNpcInteractionState,
  setNpcJournalRecorded,
  updateNpcInteractionState,
  upsertNpcQuestHook,
} from "./npc-gameplay.js";

const pageQuery = new URLSearchParams(window.location.search);
const moduleQuery = new URL(import.meta.url).searchParams;
const queryValue = (name) => (pageQuery.has(name) ? pageQuery.get(name) : moduleQuery.get(name));
const viewMode = window.location.pathname.startsWith("/dungeon")
  ? "dungeon"
  : window.location.pathname.startsWith("/third")
    ? "third"
    : "first";
const isFirstPersonView = viewMode === "first";
const isFreeOrbitView = viewMode === "third";
const isDungeonView = viewMode === "dungeon";
const usesWorldAvatar = !isFirstPersonView;
const firstPersonFov = clampQueryNumber(queryValue("fov"), 30, 140, 120);
const dungeonFov = clampQueryNumber(queryValue("dungeonFov"), 38, 62, 48);
const renderDistance = clampQueryNumber(queryValue("distance"), 2, 12, 4);
const qualityPreference = normalizeQualityPreference(queryValue("quality"));
const showChunkDiagnostics = queryValue("debugChunks") === "1";
// Mineflayer only has chunks around the bot. Stay inside that loaded radius so
// zooming out reveals the world instead of the empty sky beyond streamed data.
const maximumOrbitDistance = Math.max(32, renderDistance * 16 - 8);
const maximumObserverOffset = Math.max(24, renderDistance * 16 - 8);
const maximumOrbitPan = Math.max(16, renderDistance * 8);
const DUNGEON_CAMERA_YAW = Math.PI * 0.75;
const DUNGEON_CAMERA_PITCH = -0.82;
const DUNGEON_MIN_DISTANCE = 8;
const DUNGEON_MAX_DISTANCE = Math.min(24, maximumOrbitDistance);
const DUNGEON_DEFAULT_DISTANCE = Math.min(16, DUNGEON_MAX_DISTANCE);
const DUNGEON_HOVER_INTERVAL_MS = 80;
const DUNGEON_OCCLUSION_INTERVAL_MS = 180;
const DUNGEON_OCCLUSION_RELEASE_SAMPLES = 3;
const NPC_PANEL_INTERVAL_MS = 200;
const PERFORMANCE_SAMPLE_INTERVAL_MS = 1_000;
const TRUSTED_NPC_AVATAR_REBALANCE_MS = 250;
const TRUSTED_NPC_FOCUSED_PRIORITY = 1_000_000;
const TRUSTED_NPC_SELECTED_PRIORITY = 500_000;
const TRUSTED_NPC_MOUNTED_DISTANCE_HYSTERESIS = 5;
const FIRST_PERSON_MOUSE_SENSITIVITY = 0.0024;
// minecraft-renderer 0.1.96's experimental WASM column mesher currently
// returns error-marked empty geometry for the 1.21.1 prismarine chunk stream
// used by this viewer. Keep it available for diagnostics, but use the mature
// worker mesher by default so solid terrain always reaches the Three.js scene.
const useWasmMesher = queryValue("mesher") === "wasm";
const mesherLabel = useWasmMesher ? "WASM（实验）" : "多线程网格";
const socketPath = usesWorldAvatar ? "/third/socket.io" : "/socket.io";
const statusElement = document.querySelector(".boot");
const dashboardOrigin = document.querySelector('meta[name="lantern-dashboard-origin"]')?.content || "";
const NPC_STORAGE_KEY = "lanternwarden.npc-gameplay.v1";
const NPC_PORTRAIT_THEME_STORAGE_KEY = "lanternwarden.npc-portrait-theme.v1";
const NPC_PORTRAIT_THEMES = new Set(["guofeng", "scroll", "pixel"]);
const NPC_WEB_ACTION_SCHEMA = createNpcActionSchema([{
  type: "quest",
  intent: "gameplay.quest",
  fields: [
    { name: "quest_id", kind: "id", required: true },
    { name: "accept", kind: "boolean", required: true },
  ],
}]);

const pendingChunks = new Map();
const chunkLoadingGuards = new Map();
let latestChunkStreamState = null;
let chunkDiagnosticsElement = null;
let chunkDiagnosticsTimer = null;
const chunkGuardGeometry = new BoxGeometry(16, 1, 16);
const chunkGuardMaterial = new MeshBasicMaterial({
  color: isDungeonView ? 0x253548 : 0x7592a8, side: DoubleSide, toneMapped: false,
});
let chunkGuardRoot = null;
let chunkGuardTimer = null;

function installChunkLoadingGuards() {
  const origin = globalThis.world?.sceneOrigin;
  if (!origin || chunkGuardRoot) return;
  chunkGuardRoot = new Group();
  chunkGuardRoot.name = "__viewer_pending_chunks";
  origin.addAndTrack(chunkGuardRoot);
  chunkGuardRoot.position.set(0, 0, 0);
  chunkGuardTimer = setInterval(refreshChunkLoadingGuards, 150);
  window.addEventListener("pagehide", disposeChunkLoadingGuards, { once: true });
  refreshChunkLoadingGuards();
}

function refreshChunkLoadingGuards() {
  const world = globalThis.world;
  if (!chunkGuardRoot || !world || !latestPosition) return;
  const bounds = world.worldSizeParams;
  const minY = Number.isFinite(bounds?.minY) ? bounds.minY : -64;
  const height = Number.isFinite(bounds?.worldHeight) ? bounds.worldHeight : 384;
  const wanted = new Set();
  for (const { x, z } of pendingChunkOrigins(latestPosition.pos, renderDistance, world.finishedChunks)) {
    const key = `${x},${z}`;
    wanted.add(key);
    let mesh = chunkLoadingGuards.get(key);
    if (!mesh) {
      mesh = new Mesh(chunkGuardGeometry, chunkGuardMaterial);
      mesh.name = `pending_chunk:${key}`;
      mesh.raycast = () => {};
      mesh.frustumCulled = true;
      chunkGuardRoot.add(mesh);
      chunkLoadingGuards.set(key, mesh);
    }
    mesh.position.set(x + 8, minY + height / 2, z + 8);
    mesh.scale.y = height;
  }
  for (const [key, mesh] of chunkLoadingGuards) {
    if (wanted.has(key)) continue;
    mesh.removeFromParent();
    chunkLoadingGuards.delete(key);
  }
}

function disposeChunkLoadingGuards() {
  if (chunkGuardTimer !== null) clearInterval(chunkGuardTimer);
  chunkGuardTimer = null;
  if (chunkGuardRoot) globalThis.world?.sceneOrigin?.removeAndUntrack(chunkGuardRoot);
  chunkGuardRoot = null;
  chunkLoadingGuards.clear();
  chunkGuardGeometry.dispose();
  chunkGuardMaterial.dispose();
}

function installChunkDiagnostics() {
  if (!showChunkDiagnostics || chunkDiagnosticsElement) return;
  chunkDiagnosticsElement = document.createElement("pre");
  chunkDiagnosticsElement.id = "viewer-chunk-diagnostics";
  Object.assign(chunkDiagnosticsElement.style, {
    position: "fixed", left: "12px", bottom: "12px", zIndex: "30", margin: "0",
    maxWidth: "min(620px, calc(100vw - 24px))", maxHeight: "28vh", overflow: "hidden",
    padding: "8px 10px", border: "1px solid #8db6ff", borderRadius: "6px",
    background: "#07111ddd", color: "#d9ebff", font: "12px/1.4 ui-monospace, Consolas, monospace",
    whiteSpace: "pre-wrap", pointerEvents: "none",
  });
  document.body.append(chunkDiagnosticsElement);
  const update = () => {
    const world = globalThis.world;
    const received = Object.keys(world?.loadedChunks ?? {}).length;
    const meshed = Object.keys(world?.finishedChunks ?? {}).length;
    const pending = latestPosition
      ? pendingChunkOrigins(latestPosition.pos, renderDistance, world?.finishedChunks)
      : [];
    const shown = pending.slice(0, 5).map(({ x, z }) => `${x},${z}`).join("  ") || "none";
    const stream = latestChunkStreamState;
    chunkDiagnosticsElement.textContent = [
      `chunk render · ${viewMode} · center ${latestPosition ? `${Math.floor(latestPosition.pos.x / 16)},${Math.floor(latestPosition.pos.z / 16)}` : "waiting"}`,
      `server stream ${stream ? `${stream.streamed}/${stream.expected} · retry ${stream.retried} · ${Math.max(0, Date.now() - stream.at)}ms ago` : "waiting"}`,
      `client chunks received ${received} · meshed ${meshed} · guarded ${chunkLoadingGuards.size} · pending sections ${world?.sectionsWaiting?.size ?? 0}`,
      `pending near view ${pending.length}${pending.length ? ` · ${shown}` : ""}`,
      `smart cull ${world?.isSmartCullEnabled?.() === false ? "off" : "on"} · cutaway ${dungeonOcclusionDiagnostics.applied ? "active" : "clear"} (${dungeonOcclusionDiagnostics.lastReason || "not checked"})`,
    ].join("\n");
  };
  chunkDiagnosticsTimer = setInterval(update, 500);
  update();
  window.addEventListener("pagehide", () => {
    if (chunkDiagnosticsTimer !== null) clearInterval(chunkDiagnosticsTimer);
    chunkDiagnosticsTimer = null;
    chunkDiagnosticsElement?.remove();
    chunkDiagnosticsElement = null;
  }, { once: true });
}
const pendingBlockUpdates = [];
const pendingViewerEffects = [];
const entityCache = new Map();
const villagerTextureCache = new Map();
const pendingVillagerStyleChecks = new Map();
const playerHeadIntegrityById = new Map();
const pendingPlayerHeadChecks = new Set();
const playerSkinTargetSignatures = new Map();
const PLAYER_MODEL_MOUNT_KEY = "player-model:self";
const villagerModelParts = new Set(["body", "head", "helmet", "brim", "nose", "arms", "leg0", "leg1"]);
const villagerModelMinimumParts = new Map([
  ["body", 2], ["head", 1], ["helmet", 1], ["brim", 1],
  ["nose", 1], ["arms", 3], ["leg0", 1], ["leg1", 1],
]);
const villagerModelIntegrityById = new Map();
const customCharacterInstances = new Map();
const pendingCustomCharacterChecks = new Map();
const pendingTrustedNpcAvatarTransitions = new Map();
const trustedNpcAvatarUpgradeFailures = new Map();
const trustedNpcAvatarSelectedIds = new Set();
const trustedNpcAvatarRebalanceReasons = new Set();
const trustedNpcAvatarLodStats = {
  requests: 0,
  coalescedRequests: 0,
  runs: 0,
  selectionChanges: 0,
  upgradesRequested: 0,
  upgradesMounted: 0,
  upgradeFallbacks: 0,
  upgradeErrors: 0,
  failedUpgradeSkips: 0,
  pendingDeduplicated: 0,
  pendingCanceled: 0,
  staleSkips: 0,
  downgrades: 0,
  downgradeErrors: 0,
  eligible: 0,
  selected: 0,
  highDetailMounted: 0,
  proceduralMounted: 0,
  mode: "high",
  budget: highDetailNpcModelBudget("high"),
  generation: 0,
  lastReason: null,
  lastRunAt: null,
  lastError: null,
};
const paintingInstances = new Map();
const pendingPaintingChecks = new Map();
const paintingTextureCache = new Map();
const paintingTextureLoader = new TextureLoader();
const paintingRuntimeStats = {
  mounted: 0,
  removed: 0,
  textureLoads: 0,
  textureFailures: 0,
  lastError: null,
};
const avatarRigRegistry = new AvatarRigRegistry();
const trustedAvatarAssetPipeline = new TrustedAvatarAssetPipeline();
const entityMotionFrames = new Map();
const pendingAvatarRigChecks = new Set();
let deliveredAvatarRigFrames = new WeakMap();
const sharedEntityRaycaster = new Raycaster();
const contextBlockRaycaster = new Raycaster();
const sharedEntityPointerNdc = new Vector2();
const dungeonHoverAnchorBox = new Box3();
const dungeonHoverAnchor = new Vector3();
const dungeonOcclusionCameraScene = new Vector3();
const dungeonOcclusionTargetScene = new Vector3();
const dungeonVisibilityUniforms = createCutawayUniforms();
let dungeonRevealTarget = false;
let dungeonRevealLastFrameAt = null;
let dungeonObserverControls = null;
const dungeonCutawayMaterials = new Map();
const dungeonPointerProjectionInput = {
  origin: { x: 0, y: 0, z: 0 },
  direction: { x: 0, y: 0, z: 0 },
  avatar: { x: 0, y: 0, z: 0 },
  planeY: 0,
  maximumRayDistance: Math.max(48, renderDistance * 24),
  output: {
    yaw: 0,
    pitch: 0,
    distance: 0,
    rayDistance: 0,
    target: { x: 0, y: 0, z: 0 },
  },
};
const viewerPerformanceCounters = {
  hoverRequests: 0,
  hoverRaycasts: 0,
  domWrites: 0,
  skippedDomWrites: 0,
  inventoryRenders: 0,
  skippedInventoryRenders: 0,
  portraitRenders: 0,
  skippedPortraitRenders: 0,
  skippedVillagerStyles: 0,
  pointerLookProjections: 0,
  pointerLookSends: 0,
  occlusionChecks: 0,
  occlusionVoxelSamples: 0,
  cutawayActivations: 0,
  cutawayRestores: 0,
};
let pendingBlockEntities = null;
let pendingPlayerEntity = null;
let firstPersonEntityPublished = false;
let pendingTime = null;
let pendingWeather = { raining: false, thunder: 0 };
let latestPosition = null;
let pendingAvatarState = null;
let normalizedAvatarMotion = null;
let viewer = null;
let worldView = null;
let viewerEffectSystem = null;
let fishingVisuals = null;
let selfAvatarCameraVisibility = null;
let rendererReady = false;
let initializing = false;
let selectedPlayerSkin = resolvePlayerSkin(DEFAULT_PLAYER_SKIN_ID);
let playerSkinStatus = "waiting-for-renderer";
let playerSkinLastAppliedAt = null;
let playerSkinLastError = null;
let playerSkinApplySequence = 0;
let selectedPlayerModel = resolvePlayerModel(DEFAULT_PLAYER_MODEL_ID);
let playerModelInstance = null;
let playerModelPendingSignature = null;
let playerModelFailedSignature = null;
let playerModelStatus = isFirstPersonView ? "first-person-hands" : "waiting-for-renderer";
let playerModelLastAppliedAt = null;
let playerModelLastError = null;
let playerModelApplySequence = 0;
let orbitYaw = isDungeonView ? DUNGEON_CAMERA_YAW : 0;
let orbitPitch = isDungeonView ? DUNGEON_CAMERA_PITCH : -0.22;
let orbitInitialized = false;
let orbitDistance = isDungeonView ? DUNGEON_DEFAULT_DISTANCE : 4;
let orbitPanX = 0;
let orbitPanY = 0;
let observerOffset = new Vec3(0, 0, 0);
let focusedCharacterId = null;
let focusedCharacterName = null;
let dragging = false;
let dragMode = "rotate";
let pointerId = null;
let pointerX = 0;
let pointerY = 0;
const activeTouchPointers = new Map();
const manualCanvasTouchPointers = new Set();
let touchGesture = null;
let textureAnisotropy = 1;
let adaptiveQualityController = null;
let avatarPresentationLights = null;
let performanceMonitorTimer = null;
let trustedNpcAvatarRebalanceTimer = null;
let rendererPerformance = {
  fps: null,
  averageFrameMs: null,
  worstFrameMs: null,
  drawCalls: null,
  triangles: null,
  quality: null,
};
let reconnectAfterServerDisconnect = true;
let serverReconnectTimer = null;
let accumulatedWalkDistance = 0;
let lastAvatarAnimation = "idle";
let lastMainHandKey = "";
let lastOffHandKey = "";
let handSwingTimer = null;
let avatarActionSequence = 0;
const observerKeys = new Set();
let observerFrame = null;
let observerFrameTime = 0;
let manualControlActive = false;
let manualControlPhase = "observe";
const manualKeys = new Set();
let manualInputFrame = null;
let manualIdleTimer = null;
let manualInputFrameTime = 0;
let lastManualSendAt = 0;
let lastManualMotionEngaged = false;
let touchMove = { forward: 0, strafe: 0 };
let touchStickPointer = null;
let touchSprint = false;
let touchJump = false;
let gamepadConnected = false;
let gamepadStopPressed = false;
let gamepadReleasePressed = false;
let manualStopLatched = false;
let manualLookYaw = 0;
let manualLookPitch = 0;
let firstPersonPointerLocked = false;
let tapCandidate = null;
let lastAvatarRigError = null;
let selectedNpcId = null;
let selectedNpcProfile = null;
let npcInteractionState = readNpcInteractionState();
let persistentNpcKeys = new Set(npcInteractionState.entries.map((entry) => entry.npcKey));
let npcWorldContext = { schemaVersion: 1, worldKey: "default", chat: [], time: null };
let npcTapCandidate = null;
let npcTapTimer = null;
let npcPanelRenderFrame = null;
let npcPanelRenderTimer = null;
let npcPanelLastRenderAt = 0;
let inventoryHudSignature = "";
let dungeonInteractionInstalled = false;
let dungeonContextMenuInstalled = false;
let dungeonTapCandidate = null;
let dungeonHoverEntityId = null;
let dungeonHoverPickFrame = null;
let dungeonHoverPickTimer = null;
let dungeonHoverLastPickAt = 0;
let dungeonHoverPointer = null;
let dungeonLastActionAt = 0;
let dungeonContextModel = null;
let dungeonContextLongPress = null;
let dungeonContextInspectSequence = 0;
let dungeonPointerLookFrame = null;
let dungeonPointerLookActive = false;
let dungeonPointerLookPointerType = null;
let dungeonPointerLookTarget = null;
let dungeonOcclusionCheckFrame = null;
let dungeonOcclusionCheckTimer = null;
let dungeonOcclusionLastCheckAt = 0;
let dungeonOcclusionState = { active: false, clearSamples: 0 };
let dungeonRoofState = { active: false, clearSamples: 0 };
let dungeonRoomCoverCache = null;
let dungeonFloorMask = null;
let dungeonCutawayApplied = false;
let dungeonCutawayMaterialScanCursor = 0;
let dungeonOcclusionDiagnostics = {
  supported: null,
  active: false,
  detected: false,
  applied: false,
  checks: 0,
  samples: 0,
  materials: 0,
  patchedShaderMaterials: 0,
  unsupportedMaterials: 0,
  hit: null,
  lastReason: "waiting-for-renderer",
  lastDurationMs: null,
  lastCheckedAt: null,
};
let npcToastTimer = null;
let npcDialogueText = "";
let npcPortraitRenderer = null;
let npcPortraitStatus = "idle";
let npcPortraitCharacterId = null;
let npcPortraitSource = null;
let npcPortraitTheme = readNpcPortraitTheme();
let npcPortraitThemeRendered = null;
let npcPortraitLastError = null;
let npcContextBridgeInstalled = false;
let npcPanelControlsInstalled = false;
let npcCanvasPickerInstalled = false;

const AVATAR_MOTION_LABELS = Object.freeze({
  idle: "待机",
  walk: "行走",
  run: "奔跑",
  crouch: "潜行",
  crouchWalk: "潜行移动",
  jump: "跳跃",
  fall: "下落",
  land: "落地缓冲",
  swim: "游泳",
  fly: "滑翔",
  ride: "骑乘",
});

const NPC_ARCHETYPE_LABELS = Object.freeze({
  scholar: "学者", smith: "锻造师", priest: "神官", merchant: "商旅",
  tanner: "皮革匠", fisher: "渔者", watchman: "守夜人", bard: "吟游诗人",
  farmer: "农人", shepherd: "牧羊人", receptionist: "公会接待员",
  cartographer: "测绘师", villager: "村庄居民",
  ninja: "忍者",
  swordsman: "双剑士",
});

const NPC_DIALOGUE_LINES = Object.freeze({
  scholar: ["有些答案不在最后一页，而在你翻页时停顿的地方。", "把见闻写下来吧，记忆会遗漏，纸页不会。"],
  smith: ["真正合手的工具，先要经得起失败的火。", "听锤声就能知道铁在撒谎，旅人也一样。"],
  priest: ["祷词不是命令；先听清世界，再向灯火开口。", "每盏灯都能照亮一处黑暗，你也会找到自己的路。"],
  merchant: ["价钱只是表面，真正交换的是两个人的承诺。", "带着故事回来，或许比金币更值钱。"],
  watchman: ["白昼教人看远，夜晚教人看清脚下。", "若听见不属于风的声音，就先退到灯下。"],
  bard: ["同一段旅程，被不同的人记住，就会长出不同的歌。", "等你再走远一点，我就有新曲子可写了。"],
  farmer: ["庄稼不催人，但错过时节，它也不会等。", "先认土，再下种；先认路，再远行。"],
  fisher: ["水面说的是天气，水下藏的是脾气。", "急着收线的人，往往只钓到自己的影子。"],
  shepherd: ["迷路不可怕，看得见下一块安全落脚地就好。", "风从山坡下来时，羊群比钟更早知道。"],
  cartographer: ["地图不是世界，只是你曾经认真看过世界的证据。", "把危险和灯火分开标，回来的路就不会混淆。"],
  tanner: ["旧东西不一定该丢，有时只缺一针稳当的线。", "旅装上的每道磨痕，都替主人记着一段路。"],
  receptionist: ["清楚的目标、可信的证据，才是一份能结案的委托。", "冒险不怕小，怕的是没人记得为什么出发。"],
  villager: ["村里的路看似寻常，每个转角却都有自己的故事。", "你若肯慢一点走，就会发现这里从不安静。"],
  ninja: ["风里的动静比脚印更早泄露来意。", "真正的分身不是数量，而是同时守住更多重要之物。"],
  swordsman: ["剑路越快，越要清楚下一步为何出手。", "双剑不是两次攻击，而是一份不能迟疑的决心。"],
});

const NPC_QUEST_TEMPLATES = Object.freeze({
  scholar: ["散页寻踪", "在探索地图上标记一处可能藏有书架或旧纸页的建筑。"],
  smith: ["重燃旧炉", "记录一处煤炭或铁矿资源点，为网页支线保留锻炉材料线索。"],
  priest: ["夜灯微光", "夜幕降临后，在地图上记下一处仍被灯火照亮的安全位置。"],
  merchant: ["集市风声", "从近期世界消息里整理一条与村庄交易有关的可靠见闻。"],
  watchman: ["守夜巡灯", "在村庄边缘记录一处尚未照亮、但可安全抵达的位置。"],
  bard: ["风中的新曲", "抵达一个从未记录过的地标，让这段旅程成为新曲的开头。"],
  farmer: ["识土下种", "标记一块水源、耕地与光照条件都合适的土地。"],
  fisher: ["晨潮鱼讯", "找到河流或湖岸，并把安全下水点记入网页旅志。"],
  shepherd: ["走失的铃声", "沿山坡寻找一条安全路径，并记录途中遇见的友善生灵。"],
  cartographer: ["灯下测绘", "补全小地图上一片未探索区域，并保留一条返程轨迹。"],
  tanner: ["旧披风的针脚", "记录皮革、线或羊毛的来源，作为修补旅装的材料线索。"],
  receptionist: ["第一份回执", "选择一条网页支线，留下目标、证据与完成条件。"],
  villager: ["村庄见闻", "与三位不同角色会面，并把他们的故事记入网页旅志。"],
  ninja: ["风影寻迹", "在村庄外缘标记一条视野开阔、便于快速往返的安全路线。"],
  swordsman: ["双刃试炼", "找到一处无平民靠近的安全训练场，并记录返回村庄的路线。"],
});

// Install the trusted parent-message bridge before renderer startup so the
// first world context cannot race the asynchronous texture/mesher bootstrap.
// The same idempotent installer binds the canvas picker once a canvas exists.
installPlayerSkinBridge();
installNpcGameplay();

const socket = io({
  path: socketPath,
  reconnection: true,
  reconnectionDelay: 600,
  reconnectionDelayMax: 3_000,
  transports: ["websocket", "polling"],
});

const fishingCatchHud = new FishingCatchHud({
  root: document.getElementById("viewer-fishing-catch"),
  renderIcon(slot, item) {
    cortiAppendHeadFace(slot, item, 2);
    cortiAppendEnchantmentGlint(slot, item, 2);
  },
});
socket.on("fishingCatch", (event) => fishingCatchHud.push(event));
window.addEventListener("beforeunload", () => fishingCatchHud.dispose(), { once: true });

let socketEverConnected = false;
socket.on("connect", () => {
  if (socketEverConnected && rendererReady) {
    // A fresh socket gets a fresh world snapshot. Reload so stale entity IDs,
    // fishing lines and chunks from the previous stream cannot survive it.
    window.location.reload();
    return;
  }
  socketEverConnected = true;
  reconnectAfterServerDisconnect = true;
  setStatus(rendererReady ? "实时画面已重新连接" : "正在同步世界数据…", false, rendererReady);
});
socket.on("viewerBusy", () => {
  reconnectAfterServerDisconnect = false;
  setStatus("本地画面连接已满，请关闭多余的画面页面后刷新。", true);
});
socket.on("disconnect", (reason) => {
  fishingCatchHud.reset();
  setStatus("画面数据流暂时中断，正在重连…", true);
  if (reason !== "io server disconnect" || !reconnectAfterServerDisconnect) return;
  clearTimeout(serverReconnectTimer);
  serverReconnectTimer = setTimeout(() => {
    if (!socket.connected) socket.connect();
  }, 350);
});
socket.on("connect_error", () => setStatus("无法连接本地画面服务，正在重试…", true));
socket.on("viewerReset", () => {
  fishingCatchHud.reset();
  setTimeout(() => window.location.reload(), 250);
});
socket.on("chunkStreamState", (state) => {
  if (!state || !Number.isFinite(state.streamed) || !Number.isFinite(state.expected)) return;
  latestChunkStreamState = {
    streamed: Math.max(0, Math.floor(state.streamed)),
    expected: Math.max(0, Math.floor(state.expected)),
    retried: Math.max(0, Math.floor(Number(state.retried) || 0)),
    at: Date.now(),
  };
});

socket.on("version", (version) => {
  if (rendererReady || initializing) return;
  void initializeRenderer(String(version || "1.21.1"));
});

socket.on("position", (data) => {
  latestPosition = normalizePositionPacket(data);
  if (data?.player) pendingPlayerEntity = normalizeEntity(data.player);
  if (rendererReady) {
    applyPosition();
    scheduleTrustedNpcAvatarRebalance("position");
  }
});

socket.on("playerEntity", (entity) => {
  pendingPlayerEntity = normalizeEntity(entity);
  if (rendererReady) publishFirstPersonEntity(true);
});

socket.on("avatarState", (state) => {
  if (!state || typeof state !== "object") return;
  const entity = normalizeEntity(state.entity);
  pendingAvatarState = { ...state, entity };
  const previousMotion = normalizedAvatarMotion;
  normalizedAvatarMotion = normalizeMotionFrame(pendingAvatarState, previousMotion, Date.now());
  if (!normalizedAvatarMotion.teleported) accumulatedWalkDistance += normalizedAvatarMotion.horizontalDistance;
  if (entity?.id !== undefined) entityMotionFrames.set(String(entity.id), normalizedAvatarMotion);
  if (entity) {
    // The 10 Hz avatar stream refreshes movement state. Treat already-known
    // avatars as movement-only so held items and armour are not destroyed and
    // rebuilt every tick; equipment events still arrive as full entity updates.
    if (usesWorldAvatar) handleEntity(entity, entityCache.has(String(entity.id)));
    else {
      pendingPlayerEntity = entity;
      if (rendererReady) publishFirstPersonEntity();
    }
  }
  applyAvatarState();
  renderInventoryHud();
  renderMotionHud();
  fishingVisuals?.sync();
});

socket.on("entityAnimation", (event) => applyEntityAnimation(event));
socket.on("entityDamage", (event) => applyEntityDamage(event));
socket.on("viewerEffect", (event) => {
  if (viewerEffectSystem) deliverViewerEffect(event);
  else boundedPush(pendingViewerEffects, event, 64);
});

socket.on("loadChunk", (data) => {
  if (!data || !Number.isFinite(data.x) || !Number.isFinite(data.z)) return;
  const normalized = normalizeChunk(data);
  dungeonRoomCoverCache?.ingestColumn(data.x, data.z, normalized.chunk);
  if (rendererReady) {
    worldView.emit("loadChunk", normalized);
    refreshChunkLoadingGuards();
    scheduleDungeonOcclusionCheck();
  }
  else pendingChunks.set(`${data.x},${data.z}`, { type: "load", data: normalized });
});

socket.on("unloadChunk", (data) => {
  if (!data || !Number.isFinite(data.x) || !Number.isFinite(data.z)) return;
  const key = `${data.x},${data.z}`;
  dungeonRoomCoverCache?.removeColumn(data.x, data.z);
  if (rendererReady) {
    worldView.emit("unloadChunk", data);
    refreshChunkLoadingGuards();
    scheduleDungeonOcclusionCheck();
  }
  else pendingChunks.set(key, { type: "unload", data });
});

socket.on("blockUpdate", (data) => {
  if (!data?.pos || !Number.isFinite(data.stateId)) return;
  const normalized = { ...data, pos: toVec3(data.pos) };
  dungeonRoomCoverCache?.setBlockStateId(Math.floor(data.pos.x), Math.floor(data.pos.y), Math.floor(data.pos.z), data.stateId);
  if (rendererReady) {
    worldView.emit("blockUpdate", normalized);
    scheduleDungeonOcclusionCheck();
  }
  else boundedPush(pendingBlockUpdates, normalized, 1_024);
});

socket.on("blockEntities", (data) => {
  pendingBlockEntities = data && typeof data === "object" ? data : {};
  if (rendererReady) worldView.emit("blockEntities", pendingBlockEntities);
});

socket.on("time", (time) => {
  const candidate = Number(time);
  if (!Number.isFinite(candidate)) return;
  pendingTime = normalizeMinecraftTime(candidate);
  applyServerTime();
});

socket.on("weather", (weather) => {
  pendingWeather = {
    raining: weather?.raining === true,
    thunder: Math.max(0, finiteOr(weather?.thunder, 0)),
  };
  applyServerWeather();
});

socket.on("entity", (update) => handleEntity(update, false));
socket.on("entityMoved", (update) => handleEntity(update, true));

async function initializeRenderer(version) {
  initializing = true;
  if (isDungeonView) {
    dungeonRoomCoverCache = new RoomCoverCache(version);
    dungeonFloorMask = new RoomFloorMask(dungeonRoomCoverCache);
  }
  setStatus("正在建立现代方块与实体图集…");
  try {
    ensureWebGl2();
    const resources = new ResourcesManager();
    resources.currentConfig = {
      version,
      texturesVersion: version,
      noInventoryGui: true,
    };
    resources.resetResources();
    await resources.updateAssetsData({});
    const mcData = resources.currentResources?.mcData;
    if (!mcData) throw new Error("Minecraft 版本数据未能载入");
    // minecraft-renderer's main-thread entity and item renderers still read
    // both legacy globals. The mesher worker initializes its own copies, but
    // omitting loadedData here breaks held items, armour, villagers and mobs.
    globalThis.mcData = mcData;
    globalThis.loadedData = mcData;

    const workers = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    viewer = new AppViewer(
      {
        config: {
          fpsLimit: 60,
          sceneBackground: isDungeonView ? "#253548" : "#8fc5ea",
          statsVisible: 0,
          timeoutRendering: false,
        },
        rendererConfig: {
          wasmMesher: useWasmMesher,
          mesherWorkers: workers,
          addChunksBatchWaitTime: 25,
          enableLighting: true,
          smoothLighting: true,
          shadingTheme: "vanilla",
          dayCycle: true,
          starfield: true,
          defaultSkybox: !isDungeonView,
          renderEntities: true,
          extraBlockRenderers: true,
          showHand: true,
          viewBobbing: true,
          fetchPlayerSkins: false,
          fov: isFirstPersonView ? firstPersonFov : isDungeonView ? dungeonFov : 75,
          instantCameraUpdate: false,
        },
      },
      resources,
    );
    viewer.playerState.reactive.eyeHeight = 1.62;
    viewer.playerState.reactive.perspective = usesWorldAvatar ? "third_person_back" : "first_person";
    viewer.playerState.reactive.username = pendingPlayerEntity?.username || "Codex";
    await viewer.loadBackend(createGraphicsBackendSingleThread);

    const initial = latestPosition?.pos || new Vec3(0, 64, 0);
    const emptyWorld = {
      getColumnAt: () => null,
      setBlockStateId: () => {},
    };
    await viewer.startWorld(emptyWorld, renderDistance, viewer.playerState.reactive, initial);
    if (isDungeonView && globalThis.world?.scene) {
      globalThis.world.scene.background = new Color("#253548");
      globalThis.world.scene.fog = new Fog(new Color("#253548"), 30, 68);
    }
    worldView = viewer.worldView;
    // startWorld attaches the renderer listeners but intentionally does not
    // initialize WorldView. Our chunks arrive over Socket.IO rather than from
    // emptyWorld, so a full worldView.init() would wait forever. Publish the
    // render distance before replaying those chunks so they can be meshed.
    worldView.updateViewDistance(renderDistance);
    installEntityRenderBounds(globalThis.world?.entities);
    installChunkLoadingGuards();
    rendererReady = true;
    viewerEffectSystem = new ViewerEffectSystem({
      getWorld: () => globalThis.world,
      getEntity: (id) => globalThis.world?.entities?.entities?.[String(id)] ?? null,
      cueElement: document.getElementById("skill-cue"),
    });
    fishingVisuals = new FishingVisuals({
      getWorld: () => globalThis.world,
      getCamera: () => globalThis.world?.camera,
      getActors: fishingActors,
      getSelfId: () => pendingAvatarState?.entity?.id,
      firstPerson: isFirstPersonView,
      onAction: playFishingAction,
    });
    if (usesWorldAvatar) {
      selfAvatarCameraVisibility = installSelfAvatarCameraVisibility(
        globalThis.world,
        () => pendingAvatarState?.entity?.id,
        { getUpperCutawayY: () => dungeonUpperCutawayY,
          getUpperCutawayRegion: () => dungeonUpperCutawayRegion,
          cutawayUniforms: dungeonVisibilityUniforms },
      );
    }
    for (const entity of entityCache.values()) fishingVisuals.updateEntity(entity, { historical: true });
    for (const effect of pendingViewerEffects.splice(0)) deliverViewerEffect(effect);
    viewerEffectSystem.ingestChat(npcWorldContext.chat);
    enhanceRendererQuality();
    flushPendingWorld();
    // The renderer begins an asynchronous Steve fallback while creating a
    // player mesh. Replay the trusted selection after that bootstrap settles
    // so the late fallback cannot overwrite the first custom texture.
    setTimeout(() => {
      applySelectedPlayerSkinToSelf(true);
      applySelectedPlayerModelToSelf(true);
    }, 700);
    installOrbitControls();
    installDungeonCameraControls();
    installDungeonOcclusion();
    installNpcGameplay();
    installDungeonInteractions();
    installDungeonContextMenu();
    installManualControls();
    installInventoryHud();
    installVisibilityHandling();
    publishDiagnostics(version);
    installChunkDiagnostics();
    setStatus(
      isFreeOrbitView
        ? `Three.js r184 · WebGL2 · ${mesherLabel}｜拖拽环绕视角`
        : isDungeonView
          ? `Three.js r184 · WebGL2 · ${mesherLabel}｜地牢 2.5D · FOV ${dungeonFov}°`
          : `Three.js r184 · WebGL2 · ${mesherLabel}｜第一人称 FOV ${firstPersonFov}°`,
      false,
      true,
    );
  } catch (error) {
    console.error("Modern Minecraft renderer failed to start", error);
    showRendererFailure(error);
  } finally {
    initializing = false;
  }
}

function flushPendingWorld() {
  if (!rendererReady || !worldView) return;
  for (const event of pendingChunks.values()) worldView.emit(event.type === "load" ? "loadChunk" : "unloadChunk", event.data);
  pendingChunks.clear();
  refreshChunkLoadingGuards();
  if (pendingBlockEntities) worldView.emit("blockEntities", pendingBlockEntities);
  for (const update of pendingBlockUpdates.splice(0)) worldView.emit("blockUpdate", update);
  applyServerTime();
  applyServerWeather();
  for (const entity of entityCache.values()) {
    if (!isRenderableEntity(entity)) continue;
    if (canonicalEntityName(entity.name) === "fishing_bobber") continue;
    worldView.emit("entity", rendererEntityEquipment(entity, globalThis.mcData?.itemsByName));
    maybeApplyPlayerSkin(entity);
    maybeApplySelectedPlayerModel(entity);
    schedulePlayerHeadIntegrityCheck(entity, false);
    if (canonicalEntityName(entity?.name) === "player") {
      ensureAvatarRig(String(entity.id), motionFrameForRigKey(String(entity.id)));
    }
    maybeApplyPaintingEntity(entity);
    maybeApplyCustomCharacter(entity);
    maybeApplyVillagerAppearance(entity);
  }
  publishFirstPersonEntity();
  applyAvatarState();
  renderInventoryHud();
  applyPosition(true);
  scheduleTrustedNpcAvatarRebalance("world-flush");
}

function publishFirstPersonEntity(force = false) {
  if (!isFirstPersonView || !rendererReady || !worldView || !pendingPlayerEntity) return false;
  if (firstPersonEntityPublished && !force) return false;
  worldView.emit("playerEntity", rendererEntityEquipment(pendingPlayerEntity, globalThis.mcData?.itemsByName));
  firstPersonEntityPublished = true;
  maybeApplyPlayerSkin(pendingPlayerEntity, true);
  applySelectedPlayerModelToSelf();
  schedulePlayerHeadIntegrityCheck(pendingPlayerEntity, true);
  ensureAvatarRig("player_entity", normalizedAvatarMotion);
  return true;
}

function resolveObserverTargetPosition() {
  if (!latestPosition) return null;
  if (focusedCharacterId !== null) {
    const focusedEntity = entityCache.get(String(focusedCharacterId));
    const focusedPosition = focusedEntity?.pos || focusedEntity?.position;
    if (focusedPosition) return { position: toVec3(focusedPosition), mode: "entity", entity: focusedEntity };
  }
  return { position: latestPosition.pos.plus(observerOffset), mode: "self", entity: null };
}

function syncCameraFollowUi() {
  const status = document.getElementById("camera-follow-status");
  const name = document.getElementById("camera-follow-name");
  const active = focusedCharacterId !== null;
  if (status) {
    status.hidden = !active;
    status.setAttribute("aria-hidden", String(!active));
  }
  setElementText(name, focusedCharacterName || "其他角色");
  if (selectedNpcId !== null) {
    updateNpcActionButton(
      "focus",
      focusedCharacterId === selectedNpcId,
      focusedCharacterId === selectedNpcId ? "返回玩家" : "镜头跟随",
    );
  }
}

function returnCameraToAvatar({ announce = true, resetZoom = false } = {}) {
  const wasFocused = focusedCharacterId !== null;
  focusedCharacterId = null;
  focusedCharacterName = null;
  observerOffset = new Vec3(0, 0, 0);
  orbitPanX = 0;
  orbitPanY = 0;
  if (isDungeonView) {
    orbitYaw = DUNGEON_CAMERA_YAW;
    orbitPitch = DUNGEON_CAMERA_PITCH;
    if (resetZoom) orbitDistance = DUNGEON_DEFAULT_DISTANCE;
  }
  syncCameraFollowUi();
  if (rendererReady && latestPosition) applyPosition(true);
  scheduleTrustedNpcAvatarRebalance("camera-focus-cleared", true);
  if (announce && wasFocused) showNpcToast("镜头已返回玩家");
  return wasFocused;
}

function applyPosition(instant = false) {
  if (!rendererReady || !viewer || !latestPosition) return;
  const { pos, yaw, pitch } = latestPosition;
  if (usesWorldAvatar) {
    if (!orbitInitialized) {
      orbitYaw = isDungeonView ? DUNGEON_CAMERA_YAW : yaw;
      orbitPitch = isDungeonView
        ? DUNGEON_CAMERA_PITCH
        : clampNumber(pitch, -1.25, 1.1, -0.22);
      orbitDistance = isDungeonView ? DUNGEON_DEFAULT_DISTANCE : orbitDistance;
      orbitInitialized = true;
    }
    const resolvedTarget = resolveObserverTargetPosition();
    viewer.updateCamera(resolvedTarget?.position || pos, orbitYaw, orbitPitch, { instant });
    applyOrbitCameraOffset();
    scheduleDungeonOcclusionCheck();
  } else {
    viewer.updateCamera(
      pos,
      manualControlActive && firstPersonPointerLocked ? manualLookYaw : yaw,
      manualControlActive && firstPersonPointerLocked ? manualLookPitch : pitch,
      { instant },
    );
  }
  worldView.emit("chunkPosUpdate", { pos });
  refreshChunkLoadingGuards();
  if (isFirstPersonView && pendingPlayerEntity) {
    pendingPlayerEntity = { ...pendingPlayerEntity, pos, position: pos, yaw, pitch };
    publishFirstPersonEntity();
  }
  publishCameraDataset();
  scheduleNpcPanelRender();
}

function focusEntityById(value) {
  if (!usesWorldAvatar || !latestPosition || value === undefined || value === null) return null;
  const id = String(value);
  const entity = entityCache.get(id);
  const position = entity?.pos || entity?.position;
  if (!entity || !position) return null;
  observerOffset = toVec3(position).minus(latestPosition.pos);
  focusedCharacterId = id;
  focusedCharacterName = resolveCustomCharacterDefinition(entity)?.identityName
    || entity.identityName
    || entity.username
    || entity.displayName
    || null;
  orbitYaw = isDungeonView ? DUNGEON_CAMERA_YAW : finiteOr(entity.yaw, 0) + Math.PI;
  orbitPitch = isDungeonView ? DUNGEON_CAMERA_PITCH : -0.08;
  orbitDistance = isDungeonView ? DUNGEON_DEFAULT_DISTANCE : 4;
  orbitPanX = 0;
  orbitPanY = 0.25;
  orbitInitialized = true;
  syncCameraFollowUi();
  applyPosition(true);
  scheduleTrustedNpcAvatarRebalance("camera-focus", true);
  return {
    id: entity.id,
    identityName: focusedCharacterName,
    position: { x: position.x, y: position.y, z: position.z },
  };
}

function readNpcPortraitTheme() {
  try {
    const stored = localStorage.getItem(NPC_PORTRAIT_THEME_STORAGE_KEY);
    return NPC_PORTRAIT_THEMES.has(stored) ? stored : "guofeng";
  } catch {
    return "guofeng";
  }
}

function setNpcPortraitTheme(value) {
  const nextTheme = NPC_PORTRAIT_THEMES.has(value) ? value : null;
  if (!nextTheme || nextTheme === npcPortraitTheme) return false;
  npcPortraitTheme = nextTheme;
  try {
    localStorage.setItem(NPC_PORTRAIT_THEME_STORAGE_KEY, nextTheme);
  } catch {
    // A storage failure must not prevent an in-session visual preference.
  }
  npcPortraitRenderer?.clear();
  npcPortraitCharacterId = null;
  npcPortraitSource = null;
  npcPortraitThemeRendered = null;
  npcPortraitStatus = "idle";
  syncNpcPortraitThemeButtons();
  scheduleNpcPanelRender();
  const label = nextTheme === "guofeng" ? "幻想日漫" : nextTheme === "scroll" ? "职业绘卷" : "像素卡";
  showNpcToast(`已切换为${label}`);
  return true;
}

function syncNpcPortraitThemeButtons() {
  for (const button of document.querySelectorAll("[data-npc-portrait-theme]")) {
    const active = button.dataset.npcPortraitTheme === npcPortraitTheme;
    button.classList.toggle("is-active", active);
    setElementAttribute(button, "aria-pressed", active);
  }
  setElementDataset(document.getElementById("npc-panel-concept"), "portraitTheme", npcPortraitTheme);
}

function readNpcInteractionState(worldKey = "default") {
  try {
    return deserializeNpcInteractionState(localStorage.getItem(npcStorageKey(worldKey)));
  } catch {
    return createNpcInteractionState();
  }
}

function persistNpcInteractionState() {
  try {
    const persistable = {
      version: npcInteractionState.version,
      revision: npcInteractionState.revision,
      entries: npcInteractionState.entries.filter((entry) => persistentNpcKeys.has(entry.npcKey)),
    };
    localStorage.setItem(npcStorageKey(npcWorldContext.worldKey), serializeNpcInteractionState(persistable));
  } catch {
    // Private browsing or a full storage quota must never break the renderer.
  }
}

function npcStorageKey(worldKey) {
  const suffix = String(worldKey || "default").replace(/[^a-z0-9._-]/giu, "_").slice(0, 96) || "default";
  return `${NPC_STORAGE_KEY}:${suffix}`;
}

function normalizeNpcWorldContext(value) {
  if (!value || typeof value !== "object" || Number(value.schemaVersion) !== 1) return null;
  const worldKey = String(value.worldKey || "default").replace(/[^a-z0-9._-]/giu, "_").slice(0, 96) || "default";
  const chat = Array.isArray(value.chat)
    ? value.chat.slice(-40).map((item) => ({
        id: sanitizeNpcText(String(item?.id || ""), 128),
        at: sanitizeNpcText(String(item?.at || ""), 64),
        message: sanitizeNpcText(String(item?.message || ""), 320),
        rule: item?.rule === true,
      })).filter((item) => item.message)
    : [];
  const time = value.time && typeof value.time === "object"
    ? {
        day: Number.isFinite(Number(value.time.day)) ? Number(value.time.day) : null,
        timeOfDay: Number.isFinite(Number(value.time.timeOfDay)) ? Number(value.time.timeOfDay) : null,
        isDay: value.time.isDay === true,
      }
    : null;
  const position = value.position && typeof value.position === "object"
    && [value.position.x, value.position.y, value.position.z].every((item) => Number.isFinite(Number(item)))
    ? {
        x: Number(value.position.x),
        y: Number(value.position.y),
        z: Number(value.position.z),
      }
    : null;
  const dimension = sanitizeNpcText(String(value.dimension || "unknown"), 48) || "unknown";
  return { schemaVersion: 1, worldKey, dimension, position, chat, time };
}

function isNpcEntity(entity) {
  const entityName = canonicalEntityName(entity?.name);
  const customDefinition = resolveCustomCharacterDefinition(entity);
  return Boolean(
    entity
    && entity.delete !== true
    && (
      entityName === "villager"
      || entityName === "wandering_trader"
      || (entityName !== "player" && entity.identityName)
      || customDefinition
    ),
  );
}

function npcProfileForEntity(entity) {
  if (!isNpcEntity(entity)) return null;
  const definition = resolveCustomCharacterDefinition(entity);
  const profileEntity = definition
    ? {
        ...entity,
        identityName: definition.identityName,
        identityKey: definition.identityKey,
      }
    : entity;
  return buildNpcProfile(profileEntity, latestPosition?.pos || npcWorldContext.position || null);
}

function npcArchetypeFor(profile, entity) {
  const definition = resolveCustomCharacterDefinition(entity);
  if (definition?.archetype) return definition.archetype;
  const professionMap = {
    armorer: "smith", toolsmith: "smith", weaponsmith: "smith", mason: "smith",
    librarian: "scholar", cleric: "priest", farmer: "farmer", fisherman: "fisher",
    shepherd: "shepherd", cartographer: "cartographer", leatherworker: "tanner",
    butcher: "merchant", fletcher: "merchant",
  };
  return professionMap[profile?.profession?.key] || "villager";
}

function questForNpc(profile, entity) {
  const archetype = npcArchetypeFor(profile, entity);
  const [title, detail] = NPC_NAMED_QUEST_TEMPLATES[profile?.identity?.name]
    || NPC_QUEST_TEMPLATES[archetype]
    || NPC_QUEST_TEMPLATES.villager;
  return {
    id: `web-${archetype}`,
    title,
    detail,
    state: "available",
    source: "local",
    progress: 0,
  };
}

function npcDialogueLines(profile, entity) {
  return NPC_NAMED_DIALOGUE_LINES[profile?.identity?.name]
    || NPC_DIALOGUE_LINES[npcArchetypeFor(profile, entity)]
    || NPC_DIALOGUE_LINES.villager;
}

function npcRelationshipLabel(interaction) {
  const affinity = Number(interaction?.affinity || 0);
  if (affinity >= 60) return "同路知己";
  if (affinity >= 35) return "彼此信赖";
  if (affinity >= 18) return "熟识";
  if (affinity >= 6) return "点头之交";
  return interaction?.meetings > 0 ? "初次会面" : "初见";
}

function latestNpcMention(profile) {
  const name = profile?.identity?.name;
  if (!name) return null;
  for (let index = npcWorldContext.chat.length - 1; index >= 0; index -= 1) {
    const item = npcWorldContext.chat[index];
    if (item.message.includes(name)) return item;
  }
  return null;
}

function openNpcPanel(entity) {
  const profile = npcProfileForEntity(entity);
  if (!profile || !profile.entityId) return false;
  const previous = getNpcInteraction(npcInteractionState, profile);
  npcInteractionState = recordNpcMeeting(npcInteractionState, profile, {
    affinityDelta: previous.meetings === 0 ? 1 : 0,
  });
  if (["server-identity", "uuid"].includes(profile.identity.source)) persistentNpcKeys.add(profile.key);
  persistNpcInteractionState();
  selectedNpcId = String(profile.entityId);
  selectedNpcProfile = profile;
  scheduleTrustedNpcAvatarRebalance("npc-selected", true);
  npcDialogueText = "";
  renderNpcPanel();
  const panel = document.getElementById("npc-panel");
  panel?.classList.add("is-open");
  panel?.setAttribute("aria-hidden", "false");
  document.body.classList.add("npc-panel-open");
  postToDashboard({
    type: "lantern-npc-selected",
    entity: {
      id: profile.entityId,
      name: profile.identity.name,
      key: profile.key,
      profession: profile.profession.label,
      distance: profile.distance.blocks,
    },
  });
  return true;
}

function closeNpcPanel() {
  if (npcPanelRenderFrame !== null) cancelAnimationFrame(npcPanelRenderFrame);
  if (npcPanelRenderTimer !== null) clearTimeout(npcPanelRenderTimer);
  npcPanelRenderFrame = null;
  npcPanelRenderTimer = null;
  npcPortraitRenderer?.clear();
  npcPortraitStatus = "idle";
  npcPortraitCharacterId = null;
  npcPortraitSource = null;
  npcPortraitThemeRendered = null;
  npcPortraitLastError = null;
  const portraitStage = document.getElementById("npc-panel-concept");
  portraitStage?.classList.remove("has-image", "has-live-model");
  if (portraitStage) {
    portraitStage.dataset.portraitStatus = "idle";
    delete portraitStage.dataset.portraitCharacterId;
    delete portraitStage.dataset.portraitSource;
    delete portraitStage.dataset.portraitRenderMode;
    delete portraitStage.dataset.portraitTheme;
  }
  const portraitImage = document.getElementById("npc-panel-concept-image");
  if (portraitImage) {
    portraitImage.hidden = true;
    resetNpcConceptImageCrop(portraitImage);
  }
  const portraitCanvas = document.getElementById("npc-panel-concept-canvas");
  if (portraitCanvas) {
    portraitCanvas.hidden = true;
    portraitCanvas.setAttribute("aria-hidden", "true");
  }
  selectedNpcId = null;
  selectedNpcProfile = null;
  scheduleTrustedNpcAvatarRebalance("npc-selection-cleared", true);
  npcDialogueText = "";
  const panel = document.getElementById("npc-panel");
  panel?.classList.remove("is-open");
  panel?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("npc-panel-open");
}

function resetNpcConceptImageCrop(image) {
  if (!image) return;
  delete image.dataset.portraitColumns;
  image.style.removeProperty("--npc-concept-offset");
  image.style.removeProperty("--npc-concept-clip-left");
  image.style.removeProperty("--npc-concept-clip-right");
}

function renderNpcPortrait(profile, entity, registeredDefinition, archetype) {
  const stage = document.getElementById("npc-panel-concept");
  const image = document.getElementById("npc-panel-concept-image");
  const canvas = document.getElementById("npc-panel-concept-canvas");
  const caption = document.getElementById("npc-panel-concept-caption");
  if (!stage || !image || !(canvas instanceof HTMLCanvasElement) || !caption) return null;

  const identityName = String(profile?.identity?.name || entity?.identityName || "?");
  const fallbackDefinition = registeredDefinition || createFallbackNpcPortraitDefinition(
    profile,
    {
      ...entity,
      identityName,
      identityKey: profile?.key || entity?.identityKey,
    },
    archetype,
  );
  const spec = resolveNpcPortraitSpec(fallbackDefinition, { theme: npcPortraitTheme });
  const initial = [...identityName.replace(/[·\s]/gu, "")][0] || "?";
  const fallbackInitial = document.getElementById("npc-panel-concept-initial");
  setElementText(fallbackInitial, initial);
  if (!spec) {
    viewerPerformanceCounters.portraitRenders += 1;
    showNpcPortraitFallback(stage, image, canvas, caption, identityName, "portrait-definition-incomplete");
    return null;
  }
  if (
    npcPortraitCharacterId === spec.id
    && npcPortraitSource === spec.source
    && npcPortraitThemeRendered === spec.theme
    && npcPortraitStatus !== "idle"
  ) {
    viewerPerformanceCounters.skippedPortraitRenders += 1;
    return spec;
  }
  viewerPerformanceCounters.portraitRenders += 1;

  stage.style.setProperty("--npc-primary", fallbackDefinition.palette.primary);
  stage.style.setProperty("--npc-accent", fallbackDefinition.palette.accent);
  stage.classList.remove("has-image", "has-live-model");
  stage.dataset.portraitCharacterId = spec.id;
  stage.dataset.portraitSource = spec.source;
  stage.dataset.portraitTheme = spec.theme;
  stage.dataset.portraitStatus = "loading";
  stage.setAttribute("aria-label", `${identityName}的角色形象`);
  npcPortraitCharacterId = spec.id;
  npcPortraitSource = spec.source;
  npcPortraitThemeRendered = spec.theme;
  npcPortraitStatus = "loading";
  npcPortraitLastError = null;

  if (spec.source === "concept") {
    npcPortraitRenderer?.clear();
    canvas.hidden = true;
    canvas.setAttribute("aria-hidden", "true");
    const legacyCropIndices = { "0%": 0, "50%": 1, "100%": 2 };
    const columns = Math.max(1, Math.min(4, Math.trunc(Number(spec.portraitCrop?.columns || 3))));
    const index = Math.max(0, Math.min(columns - 1, Math.trunc(Number(
      spec.portraitCrop?.index ?? legacyCropIndices[spec.cropPosition] ?? 0,
    ))));
    image.dataset.portraitColumns = String(columns);
    image.style.setProperty("--npc-concept-offset", `${-((index + 0.5) * 100) / columns}%`);
    image.style.setProperty("--npc-concept-clip-left", `${(index * 100) / columns}%`);
    image.style.setProperty("--npc-concept-clip-right", `${((columns - index - 1) * 100) / columns}%`);
    image.alt = spec.theme === "guofeng"
      ? `${identityName}的原创日系幻想二次元立绘`
      : `${identityName}的原创概念立绘`;
    stage.dataset.portraitRenderMode = "concept-sheet";
    image.hidden = false;
    caption.textContent = spec.portraitUrl === CORE_NPC_PORTRAIT_URL
      ? "原创概念立绘 · 本地角色设定"
      : spec.theme === "guofeng"
        ? "幻想日漫立绘 · 本地原创设定"
        : "原创职业立绘 · 本地角色设定";
    image.onload = () => {
      if (stage.dataset.portraitCharacterId !== spec.id) return;
      stage.classList.add("has-image");
      stage.dataset.portraitStatus = "ready";
      npcPortraitStatus = "ready";
    };
    image.onerror = () => showNpcPortraitFallback(stage, image, canvas, caption, identityName, "concept-image-load-failed");
    if (image.getAttribute("src") !== spec.portraitUrl) image.setAttribute("src", spec.portraitUrl);
    if (image.complete && image.naturalWidth > 0) image.onload();
    else if (image.complete) image.onerror();
    return spec;
  }

  image.hidden = true;
  resetNpcConceptImageCrop(image);
  image.onload = null;
  image.onerror = null;
  canvas.hidden = false;
  canvas.setAttribute("aria-hidden", "false");
  try {
    npcPortraitRenderer ||= new NpcPortraitRenderer(canvas);
    npcPortraitRenderer.render(fallbackDefinition, entity, { theme: npcPortraitTheme });
    // The dossier uses a lightweight authored 2D illustration. World entities
    // remain on their type-correct 3D renderer and are never copied into this
    // second canvas.
    stage.classList.add("has-live-model");
    stage.dataset.portraitStatus = "ready";
    stage.dataset.portraitRenderMode = "canvas-2d";
    npcPortraitStatus = "ready";
    caption.textContent = spec.theme === "pixel"
      ? "像素角色卡 · 本地程序绘制"
      : spec.theme === "guofeng"
        ? "幻想日漫主题补绘 · 本地程序绘制"
        : registeredDefinition
          ? "职业绘卷补绘 · 本地视觉设定"
          : "职业推定立绘 · 本地程序绘制";
    return spec;
  } catch (error) {
    showNpcPortraitFallback(stage, image, canvas, caption, identityName, error);
    return spec;
  }
}

function showNpcPortraitFallback(stage, image, canvas, caption, identityName, error) {
  npcPortraitRenderer?.clear();
  image.hidden = true;
  resetNpcConceptImageCrop(image);
  canvas.hidden = true;
  canvas.setAttribute("aria-hidden", "true");
  stage.classList.remove("has-image", "has-live-model");
  stage.dataset.portraitStatus = "fallback";
  delete stage.dataset.portraitRenderMode;
  npcPortraitStatus = "fallback";
  npcPortraitLastError = error instanceof Error ? error.message : String(error || "portrait-render-failed");
  caption.textContent = `${identityName} · 本地形象暂以徽记显示`;
}

function scheduleNpcPanelRender() {
  if (selectedNpcId === null || npcPanelRenderFrame !== null || npcPanelRenderTimer !== null) return;
  const queueFrame = () => {
    npcPanelRenderFrame = requestAnimationFrame(() => {
      npcPanelRenderFrame = null;
      renderNpcPanel();
    });
  };
  const delay = rateLimitDelayMs(npcPanelLastRenderAt, performance.now(), NPC_PANEL_INTERVAL_MS);
  if (delay <= 0) {
    queueFrame();
    return;
  }
  npcPanelRenderTimer = setTimeout(() => {
    npcPanelRenderTimer = null;
    if (selectedNpcId !== null) queueFrame();
  }, delay);
}

function renderNpcPanel() {
  if (selectedNpcId === null) return;
  if (npcPanelRenderFrame !== null) cancelAnimationFrame(npcPanelRenderFrame);
  if (npcPanelRenderTimer !== null) clearTimeout(npcPanelRenderTimer);
  npcPanelRenderFrame = null;
  npcPanelRenderTimer = null;
  npcPanelLastRenderAt = performance.now();
  const entity = entityCache.get(String(selectedNpcId));
  const profile = npcProfileForEntity(entity);
  if (!profile) {
    closeNpcPanel();
    return;
  }
  selectedNpcProfile = profile;
  const interaction = getNpcInteraction(npcInteractionState, profile);
  const definition = resolveCustomCharacterDefinition(entity);
  const archetype = npcArchetypeFor(profile, entity);
  const archetypeLabel = NPC_ARCHETYPE_LABELS[archetype] || "村庄角色";
  const profession = NPC_NAMED_ROLE_LABELS[profile.identity.name]
    || (profile.profession.key === "none"
      ? archetypeLabel
      : `${profile.profession.label} · ${profile.profession.levelLabel}`);
  const quest = questForNpc(profile, entity);
  const storedQuest = interaction.questHooks.find((hook) => hook.id === quest.id) || null;
  const mention = latestNpcMention(profile);
  const lines = npcDialogueLines(profile, entity);
  const defaultDialogue = lines[Math.abs(interaction.meetings + interaction.affinity) % lines.length];

  setNpcText("npc-panel-name", profile.identity.name);
  setNpcText("npc-panel-role", `${profession}${profile.type.biomeLabel ? ` · ${profile.type.biomeLabel}` : ""}`);
  setNpcText("npc-panel-initial", [...profile.identity.name.replace(/[·\s]/gu, "")][0] || "?");
  setNpcText("npc-panel-relationship", npcRelationshipLabel(interaction));
  setNpcText("npc-panel-distance", profile.distance.blocks === null ? "未知" : `${profile.distance.blocks.toFixed(1)} 格`);
  setNpcText("npc-panel-meetings", `${interaction.meetings} 次`);
  setNpcText(
    "npc-panel-lore",
    profile.lore ? `${profile.lore.title}｜${profile.lore.summary}` : `${profile.identity.name} 是这个世界中的一位${profession}。`,
  );
  setNpcText("npc-panel-dialogue", npcDialogueText || defaultDialogue);
  setNpcText(
    "npc-panel-recent",
    mention ? `近期提及｜${mention.message}` : "近期消息中尚未找到明确提及；这里不会把无署名台词强行归给任何角色。",
  );
  setNpcText("npc-quest-title", storedQuest?.title || quest.title);
  setNpcText("npc-panel-quest-copy", storedQuest?.detail || quest.detail);

  const portraitSpec = renderNpcPortrait(profile, entity, definition, archetype);
  const portraitPalette = portraitSpec?.definition?.palette || definition?.palette;
  const portrait = document.getElementById("npc-panel-portrait");
  setElementStyle(portrait, "--npc-primary", portraitPalette?.primary || "#365b55");
  setElementStyle(portrait, "--npc-accent", portraitPalette?.accent || "#c99b50");
  const affinity = document.getElementById("npc-panel-affinity");
  setElementStyle(affinity, "width", `${Math.max(0, Math.min(100, interaction.affinity))}%`);
  const questCard = document.getElementById("npc-panel-quest");
  const questActive = storedQuest?.state === "active";
  if (questCard && questCard.classList.contains("is-active") !== questActive) questCard.classList.toggle("is-active", questActive);
  updateNpcActionButton("focus", focusedCharacterId === selectedNpcId, focusedCharacterId === selectedNpcId ? "返回玩家" : "镜头跟随");
  updateNpcActionButton("journal", interaction.recorded, interaction.recorded ? "已记入旅志" : "记入旅志");
  updateNpcActionButton("quest", storedQuest?.state === "active", storedQuest?.state === "active" ? "支线已接取" : "接取网页支线");
  renderVillagerTradePanel(document.getElementById("npc-panel-trades"), entity);
}

function setNpcText(id, value) {
  const element = document.getElementById(id);
  setElementText(element, value);
}

function updateNpcActionButton(action, active, label) {
  const button = document.querySelector(`[data-npc-action="${action}"]`);
  if (!button) return;
  if (button.classList.contains("is-active") !== active) button.classList.toggle("is-active", active);
  setElementAttribute(button, "aria-pressed", active);
  setElementText(button, label);
}

function setElementText(element, value) {
  if (!element) return false;
  const text = String(value ?? "");
  if (element.textContent === text) {
    viewerPerformanceCounters.skippedDomWrites += 1;
    return false;
  }
  element.textContent = text;
  viewerPerformanceCounters.domWrites += 1;
  return true;
}

function setElementAttribute(element, name, value) {
  if (!element) return false;
  const text = String(value);
  if (element.getAttribute(name) === text) {
    viewerPerformanceCounters.skippedDomWrites += 1;
    return false;
  }
  element.setAttribute(name, text);
  viewerPerformanceCounters.domWrites += 1;
  return true;
}

function setElementDataset(element, key, value) {
  if (!element) return false;
  const text = String(value);
  if (element.dataset[key] === text) {
    viewerPerformanceCounters.skippedDomWrites += 1;
    return false;
  }
  element.dataset[key] = text;
  viewerPerformanceCounters.domWrites += 1;
  return true;
}

function setElementStyle(element, property, value) {
  if (!element) return false;
  const text = String(value);
  if (element.style.getPropertyValue(property) === text) {
    viewerPerformanceCounters.skippedDomWrites += 1;
    return false;
  }
  element.style.setProperty(property, text);
  viewerPerformanceCounters.domWrites += 1;
  return true;
}

function runNpcPanelAction(type) {
  if (!selectedNpcProfile || selectedNpcId === null) return;
  const entity = entityCache.get(String(selectedNpcId));
  if (!entity) return;
  const interaction = getNpcInteraction(npcInteractionState, selectedNpcProfile);
  let action = null;
  if (type === "focus") {
    action = createNpcAction("focus", selectedNpcProfile, {}, NPC_WEB_ACTION_SCHEMA);
    if (action && focusedCharacterId === selectedNpcId) {
      returnCameraToAvatar();
    } else if (action && focusEntityById(selectedNpcId)) {
      showNpcToast(`镜头开始跟随 ${selectedNpcProfile.identity.name}；可随时点“返回玩家”`);
    }
  } else if (type === "journal") {
    const recorded = !interaction.recorded;
    action = createNpcAction("journal", selectedNpcProfile, { recorded }, NPC_WEB_ACTION_SCHEMA);
    if (action) {
      npcInteractionState = setNpcJournalRecorded(npcInteractionState, selectedNpcProfile, recorded);
      persistNpcInteractionState();
      showNpcToast(recorded ? "已写入网页旅志" : "已从网页旅志移除");
    }
  } else if (type === "dialogue") {
    action = createNpcAction("dialogue", selectedNpcProfile, { mode: "initiate" }, NPC_WEB_ACTION_SCHEMA);
    if (action) {
      npcInteractionState = updateNpcInteractionState(npcInteractionState, selectedNpcProfile, { affinityDelta: 2 });
      persistNpcInteractionState();
      const next = getNpcInteraction(npcInteractionState, selectedNpcProfile);
      const lines = npcDialogueLines(selectedNpcProfile, entity);
      npcDialogueText = lines[Math.abs(next.affinity + next.meetings) % lines.length];
      customCharacterInstances.get(String(selectedNpcId))?.controller.play("oneSwing");
      showNpcToast(`与 ${selectedNpcProfile.identity.name} 的网页羁绊增加了`);
    }
  } else if (type === "quest") {
    const quest = questForNpc(selectedNpcProfile, entity);
    action = createNpcAction("quest", selectedNpcProfile, { quest_id: quest.id, accept: true }, NPC_WEB_ACTION_SCHEMA);
    if (action) {
      npcInteractionState = upsertNpcQuestHook(npcInteractionState, selectedNpcProfile, { ...quest, state: "active" });
      persistNpcInteractionState();
      showNpcToast(`已接取网页支线「${quest.title}」`);
    }
  }
  if (!action) return;
  renderNpcPanel();
  postToDashboard({ type: "lantern-npc-action", action });
}

function showNpcToast(message) {
  const toast = document.getElementById("npc-toast");
  if (!toast) return;
  clearTimeout(npcToastTimer);
  toast.textContent = sanitizeNpcText(String(message || ""), 160);
  toast.classList.add("is-visible");
  npcToastTimer = setTimeout(() => toast.classList.remove("is-visible"), 1_800);
}

function installNpcGameplay() {
  if (!npcContextBridgeInstalled) {
    window.addEventListener("message", (event) => {
      if (event.origin !== dashboardOrigin || event.source !== parent || event.data?.type !== "lantern-npc-context") return;
      const context = normalizeNpcWorldContext(event.data.context);
      if (!context) return;
      const worldChanged = context.worldKey !== npcWorldContext.worldKey;
      npcWorldContext = context;
      viewerEffectSystem?.ingestChat(context.chat);
      if (worldChanged) {
        closeNpcPanel();
        npcInteractionState = readNpcInteractionState(context.worldKey);
        persistentNpcKeys = new Set(npcInteractionState.entries.map((entry) => entry.npcKey));
      } else {
        scheduleNpcPanelRender();
      }
    });
    npcContextBridgeInstalled = true;
  }

  if (!npcPanelControlsInstalled) {
    document.getElementById("npc-panel-close")?.addEventListener("click", closeNpcPanel);
    document.getElementById("camera-follow-return")?.addEventListener("click", () => returnCameraToAvatar());
    for (const button of document.querySelectorAll("[data-npc-action]")) {
      button.addEventListener("click", () => runNpcPanelAction(button.dataset.npcAction));
    }
    for (const button of document.querySelectorAll("[data-npc-portrait-theme]")) {
      button.addEventListener("click", () => setNpcPortraitTheme(button.dataset.npcPortraitTheme));
    }
    syncNpcPortraitThemeButtons();
    window.addEventListener("keydown", (event) => {
      if (event.code !== "Escape" || manualControlActive) return;
      const panelOpen = document.getElementById("npc-panel")?.classList.contains("is-open") === true;
      if (!panelOpen && focusedCharacterId !== null) {
        event.preventDefault();
        returnCameraToAvatar();
        return;
      }
      if (selectedNpcId === null) return;
      event.preventDefault();
      closeNpcPanel();
    });
    syncCameraFollowUi();
    npcPanelControlsInstalled = true;
  }

  if (!isFreeOrbitView || npcCanvasPickerInstalled) return;
  const canvas = document.getElementById("viewer-canvas");
  if (!canvas) return;
  npcCanvasPickerInstalled = true;
  canvas.dataset.npcPicker = "ready";

  const clearNpcTap = () => {
    npcTapCandidate = null;
  };
  const cancelNpcTapTimer = () => {
    if (npcTapTimer !== null) clearTimeout(npcTapTimer);
    npcTapTimer = null;
  };
  canvas.addEventListener("pointerdown", (event) => {
    cancelNpcTapTimer();
    canvas.dataset.npcPickLast = "pointerdown";
    if (manualControlActive || event.shiftKey || event.button !== 0 || event.isPrimary === false) {
      clearNpcTap();
      return;
    }
    if (event.pointerType === "touch" && activeTouchPointers.size > 0) {
      clearNpcTap();
      return;
    }
    npcTapCandidate = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startedAt: performance.now(),
    };
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!npcTapCandidate || npcTapCandidate.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - npcTapCandidate.x, event.clientY - npcTapCandidate.y) > 6) clearNpcTap();
  });
  canvas.addEventListener("pointerup", (event) => {
    const candidate = npcTapCandidate;
    clearNpcTap();
    if (!candidate || candidate.pointerId !== event.pointerId || manualControlActive) return;
    if (performance.now() - candidate.startedAt > 350) return;
    npcTapTimer = setTimeout(() => {
      npcTapTimer = null;
      if (manualControlActive) return;
      const entity = pickNpcAtCanvasPoint(canvas, event.clientX, event.clientY);
      canvas.dataset.npcPickLast = entity ? `hit:${String(entity.id)}` : "miss";
      if (entity) openNpcPanel(entity);
    }, 220);
  });
  canvas.addEventListener("pointercancel", () => {
    clearNpcTap();
    cancelNpcTapTimer();
  });
  canvas.addEventListener("dblclick", () => {
    clearNpcTap();
    cancelNpcTapTimer();
  });
}

function pickNpcAtCanvasPoint(canvas, clientX, clientY) {
  if (!isFreeOrbitView || !rendererReady || manualControlActive) return null;
  const camera = globalThis.world?.camera;
  const scene = globalThis.world?.scene;
  const renderedEntities = globalThis.world?.entities?.entities;
  if (!camera || !scene || !renderedEntities) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const candidates = [...entityCache.values()]
    .filter(isNpcEntity)
    .map((entity) => ({
      id: String(entity.id),
      entity,
      root: renderedEntities[String(entity.id)],
    }))
    .filter((candidate) => candidate.root);
  canvas.dataset.npcPickCandidates = String(candidates.length);
  if (candidates.length === 0) return null;
  sharedEntityRaycaster.near = 0;
  sharedEntityRaycaster.far = Math.max(24, Math.min(96, renderDistance * 16));
  sharedEntityPointerNdc.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    1 - ((clientY - rect.top) / rect.height) * 2,
  );
  const picked = pickEntity({
    candidates,
    raycaster: sharedEntityRaycaster,
    camera,
    scene,
    ndc: sharedEntityPointerNdc,
  });
  return picked?.entity || null;
}

function installDungeonInteractions() {
  if (!isDungeonView || dungeonInteractionInstalled) return;
  const canvas = document.getElementById("viewer-canvas");
  const card = document.getElementById("dungeon-hover-card");
  if (!canvas || !card) return;
  dungeonInteractionInstalled = true;
  canvas.dataset.dungeonInteractions = "ready";
  canvas.style.cursor = "default";

  canvas.addEventListener("pointermove", (event) => {
    if (dungeonHoverPointer) {
      dungeonHoverPointer.x = event.clientX;
      dungeonHoverPointer.y = event.clientY;
    } else {
      dungeonHoverPointer = { x: event.clientX, y: event.clientY };
    }
    if (dungeonTapCandidate?.pointerId === event.pointerId
      && Math.hypot(event.clientX - dungeonTapCandidate.x, event.clientY - dungeonTapCandidate.y) > 8) {
      dungeonTapCandidate.moved = true;
    }
    if (event.pointerType === "mouse" || event.pointerType === "pen") {
      dungeonPointerLookPointerType = event.pointerType;
      scheduleDungeonPointerLook(canvas);
    }
    scheduleDungeonHoverPick(canvas);
  });
  canvas.addEventListener("pointerleave", () => {
    dungeonHoverPointer = null;
    clearDungeonPointerLook();
    cancelDungeonHoverPick();
    hideDungeonHover(canvas);
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.isPrimary === false || event.shiftKey) return;
    dungeonTapCandidate = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      at: performance.now(),
      moved: false,
    };
  });
  canvas.addEventListener("pointerup", (event) => {
    const candidate = dungeonTapCandidate;
    dungeonTapCandidate = null;
    if (!candidate || candidate.pointerId !== event.pointerId || candidate.moved) return;
    if (performance.now() - candidate.at > 400 || performance.now() - dungeonLastActionAt < 260) return;
    dungeonLastActionAt = performance.now();
    handleDungeonTap(canvas, event.clientX, event.clientY);
  });
  canvas.addEventListener("pointercancel", () => {
    dungeonTapCandidate = null;
    if (dungeonPointerLookPointerType === "pen") clearDungeonPointerLook();
  });
}

function scheduleDungeonPointerLook(canvas) {
  if (!isDungeonView || !manualControlActive || !dungeonHoverPointer || document.hidden) return;
  if (dungeonPointerLookFrame !== null) return;
  dungeonPointerLookFrame = requestAnimationFrame(() => {
    dungeonPointerLookFrame = null;
    updateDungeonPointerLook(canvas);
  });
}

function updateDungeonPointerLook(canvas) {
  if (!isDungeonView || !manualControlActive || !dungeonHoverPointer || !latestPosition) return false;
  const camera = globalThis.world?.camera;
  const sceneOrigin = globalThis.world?.sceneOrigin;
  if (!camera || !sceneOrigin) return false;
  const rect = canvas?.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) return false;
  camera.parent?.updateMatrixWorld?.(true);
  camera.updateMatrixWorld?.(true);
  sharedEntityPointerNdc.set(
    ((dungeonHoverPointer.x - rect.left) / rect.width) * 2 - 1,
    1 - ((dungeonHoverPointer.y - rect.top) / rect.height) * 2,
  );
  contextBlockRaycaster.setFromCamera(sharedEntityPointerNdc, camera);
  const rayOrigin = contextBlockRaycaster.ray.origin;
  const rayDirection = contextBlockRaycaster.ray.direction;
  const avatar = latestPosition.pos;
  dungeonPointerProjectionInput.origin.x = sceneOrigin.toWorldX(rayOrigin.x);
  dungeonPointerProjectionInput.origin.y = sceneOrigin.toWorldY(rayOrigin.y);
  dungeonPointerProjectionInput.origin.z = sceneOrigin.toWorldZ(rayOrigin.z);
  dungeonPointerProjectionInput.direction.x = rayDirection.x;
  dungeonPointerProjectionInput.direction.y = rayDirection.y;
  dungeonPointerProjectionInput.direction.z = rayDirection.z;
  dungeonPointerProjectionInput.avatar.x = avatar.x;
  dungeonPointerProjectionInput.avatar.y = avatar.y;
  dungeonPointerProjectionInput.avatar.z = avatar.z;
  dungeonPointerProjectionInput.planeY = avatar.y;
  const projected = projectHorizontalPointerLook(dungeonPointerProjectionInput);
  if (!projected) return false;
  manualLookYaw = projected.yaw;
  manualLookPitch = 0;
  dungeonPointerLookActive = true;
  dungeonPointerLookTarget = projected;
  viewerPerformanceCounters.pointerLookProjections += 1;
  setElementDataset(canvas, "pointerLookYaw", Math.round(projected.yaw * 1_000) / 1_000);
  setElementDataset(canvas, "pointerLookPitch", 0);
  setElementDataset(canvas, "pointerLookDistance", Math.round(projected.distance * 10) / 10);
  startManualInputLoop();
  return true;
}

function clearDungeonPointerLook() {
  if (dungeonPointerLookFrame !== null) cancelAnimationFrame(dungeonPointerLookFrame);
  dungeonPointerLookFrame = null;
  dungeonPointerLookActive = false;
  dungeonPointerLookPointerType = null;
  dungeonPointerLookTarget = null;
}

function installDungeonContextMenu() {
  if (!isDungeonView || dungeonContextMenuInstalled) return;
  const canvas = document.getElementById("viewer-canvas");
  const menu = document.getElementById("entity-context-menu");
  const detail = document.getElementById("entity-detail-card");
  if (!canvas || !menu || !detail) return;
  dungeonContextMenuInstalled = true;
  canvas.dataset.contextMenu = "ready";

  const cancelLongPress = () => {
    if (dungeonContextLongPress?.timer !== undefined) clearTimeout(dungeonContextLongPress.timer);
    dungeonContextLongPress = null;
  };

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    cancelLongPress();
    openDungeonContextMenu(canvas, event.clientX, event.clientY);
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch" || event.button !== 0 || event.isPrimary === false) return;
    cancelLongPress();
    const candidate = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      timer: undefined,
    };
    candidate.timer = setTimeout(() => {
      if (dungeonContextLongPress !== candidate) return;
      dungeonContextLongPress = null;
      navigator.vibrate?.(18);
      openDungeonContextMenu(canvas, candidate.x, candidate.y);
    }, 560);
    dungeonContextLongPress = candidate;
  });
  canvas.addEventListener("pointermove", (event) => {
    const candidate = dungeonContextLongPress;
    if (!candidate || candidate.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y) > 10) cancelLongPress();
  });
  canvas.addEventListener("pointerup", cancelLongPress);
  canvas.addEventListener("pointercancel", cancelLongPress);

  menu.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-context-action]");
    const action = button?.dataset?.contextAction;
    if (!action || !dungeonContextModel) return;
    runDungeonContextAction(menu, detail, dungeonContextModel, action);
  });
  detail.querySelector("[data-detail-close]")?.addEventListener("click", () => {
    hideEntityContextSurface(detail);
  });
  window.addEventListener("keydown", (event) => {
    if (event.code !== "Escape" || (menu.hidden && detail.hidden)) return;
    event.preventDefault();
    closeDungeonContextSurfaces(menu, detail);
  });
  // Consume the first blank click used to dismiss the menu so it cannot also
  // become a movement or attack command in the existing left-click handler.
  document.addEventListener("pointerdown", (event) => {
    if (menu.hidden && detail.hidden) return;
    if (menu.contains(event.target) || detail.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    closeDungeonContextSurfaces(menu, detail);
  }, true);
  window.addEventListener("blur", () => closeDungeonContextSurfaces(menu, detail));
  window.addEventListener("resize", () => closeDungeonContextSurfaces(menu, detail));
}

function openDungeonContextMenu(canvas, clientX, clientY) {
  const menu = document.getElementById("entity-context-menu");
  const detail = document.getElementById("entity-detail-card");
  if (!menu || !detail) return;
  hideEntityContextSurface(menu);
  hideEntityContextSurface(detail);
  dungeonContextModel = null;
  const sequence = ++dungeonContextInspectSequence;
  const picked = pickDungeonEntityAtCanvasPoint(canvas, clientX, clientY);
  if (picked) {
    const model = createEntityContextMenuModel(picked.entity, latestPosition?.pos, picked.interaction);
    if (!model) return;
    dungeonContextModel = model;
    hideDungeonHover(canvas);
    renderEntityContextMenu(menu, model, clientX, clientY);
    canvas.dataset.contextPickLast = `entity:${model.entityId}`;
    return;
  }

  const ray = createViewerWorldRay(canvas, clientX, clientY);
  if (!ray || !socket.connected) return;
  socket.emit("inspectBlockRay", ray, (block) => {
    if (sequence !== dungeonContextInspectSequence) return;
    const model = createInteractableBlockContextModel(block);
    if (!model) {
      canvas.dataset.contextPickLast = "miss";
      return;
    }
    dungeonContextModel = model;
    hideDungeonHover(canvas);
    renderEntityContextMenu(menu, model, clientX, clientY);
    canvas.dataset.contextPickLast = `block:${model.name}`;
  });
}

function createViewerWorldRay(canvas, clientX, clientY) {
  const camera = globalThis.world?.camera;
  const sceneOrigin = globalThis.world?.sceneOrigin;
  if (!camera || !sceneOrigin) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  camera.parent?.updateMatrixWorld?.(true);
  camera.updateMatrixWorld?.(true);
  sharedEntityPointerNdc.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    1 - ((clientY - rect.top) / rect.height) * 2,
  );
  contextBlockRaycaster.setFromCamera(sharedEntityPointerNdc, camera);
  const origin = contextBlockRaycaster.ray.origin;
  const direction = contextBlockRaycaster.ray.direction.clone().normalize();
  return {
    origin: {
      x: sceneOrigin.toWorldX(origin.x),
      y: sceneOrigin.toWorldY(origin.y),
      z: sceneOrigin.toWorldZ(origin.z),
    },
    direction: { x: direction.x, y: direction.y, z: direction.z },
  };
}

function runDungeonContextAction(menu, detail, model, action) {
  let message = null;
  if (model.kind === "entity") {
    message = createEntityContextActionMessage(model, action);
    if (action === "details" && message) renderEntityDetailCard(detail, model);
  } else if (model.kind === "block") {
    message = createBlockContextActionMessage(model, action);
  }
  if (!message) {
    showNpcToast("该操作不适用于当前目标");
    return;
  }
  postToDashboard(message);
  if (["approach", "attack", "interact"].includes(action) && !manualControlActive) {
    showNpcToast(`请先开启人工接管，再${action === "approach" ? "走近" : action === "attack" ? "攻击" : "操作"}${model.title}`);
  } else {
    if (action === "approach") showNpcToast(`已请求走近${model.title}`);
    if (action === "attack") showNpcToast(`已明确请求攻击${model.title}`);
    if (action === "interact") showNpcToast(`已明确请求${model.actions[0]?.label || "使用"}${model.title}`);
  }
  hideEntityContextSurface(menu);
  dungeonContextModel = action === "details" ? model : null;
}

function closeDungeonContextSurfaces(menu, detail) {
  dungeonContextInspectSequence += 1;
  dungeonContextModel = null;
  hideEntityContextSurface(menu);
  hideEntityContextSurface(detail);
}

function installDungeonCameraControls() {
  if (!isDungeonView) return;
  const canvas = document.getElementById("viewer-canvas");
  if (!canvas) return;
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "地牢 2.5D 视角；悬停识别对象，接管后点击地面移动，右键或长按目标选择详情、走近、攻击或使用，滚轮缩放");
  canvas.style.touchAction = "none";
  dungeonObserverControls?.dispose();
  dungeonObserverControls = installDungeonObserverControls({
    getPose: () => ({ yaw: orbitYaw, pitch: orbitPitch, distance: orbitDistance }),
    setPose: pose => {
      orbitYaw = pose.yaw;
      orbitPitch = pose.pitch;
      orbitDistance = pose.distance;
      applyPosition(true, true);
    },
    limits: { min: DUNGEON_MIN_DISTANCE, max: DUNGEON_MAX_DISTANCE,
      yaw: DUNGEON_CAMERA_YAW, pitch: DUNGEON_CAMERA_PITCH, distance: DUNGEON_DEFAULT_DISTANCE },
  });
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 120 : 1);
      orbitDistance = clampNumber(
        orbitDistance * Math.exp(clampNumber(delta, -240, 240, 0) * 0.0018),
        DUNGEON_MIN_DISTANCE,
        DUNGEON_MAX_DISTANCE,
        DUNGEON_DEFAULT_DISTANCE,
      );
      dungeonObserverControls?.refresh();
      applyPosition(true);
    },
    { passive: false },
  );
  canvas.addEventListener("dblclick", () => {
    if (!manualControlActive && focusedCharacterId !== null) returnCameraToAvatar();
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
}

let dungeonUpperCutawayY = null;
let dungeonUpperCutawayRegion = null;

function installDungeonOcclusion() {
  if (!usesWorldAvatar) return;
  const canvas = document.getElementById("viewer-canvas");
  if (canvas) setElementDataset(canvas, "dungeonOcclusion", "ready");
  // Patch the handful of shared terrain shaders once at startup. Runtime
  // checks only flip uniforms, avoiding material clones and shader churn.
  refreshDungeonCutawayMaterials();
  const scene = globalThis.world?.scene;
  if (scene) {
    const previous = scene.onBeforeRender;
    scene.onBeforeRender = function (...args) {
      previous?.apply(this, args);
      updateDungeonVisibilityFrame();
    };
  }
  scheduleDungeonOcclusionCheck();
}

function scheduleDungeonOcclusionCheck() {
  if (!usesWorldAvatar || !rendererReady || document.hidden) return;
  if (dungeonOcclusionCheckFrame !== null || dungeonOcclusionCheckTimer !== null) return;
  const queueFrame = () => {
    dungeonOcclusionCheckFrame = requestAnimationFrame((now) => {
      dungeonOcclusionCheckFrame = null;
      dungeonOcclusionLastCheckAt = now;
      runDungeonOcclusionCheck();
    });
  };
  const delay = rateLimitDelayMs(
    dungeonOcclusionLastCheckAt,
    performance.now(),
    DUNGEON_OCCLUSION_INTERVAL_MS,
  );
  if (delay <= 0) {
    queueFrame();
    return;
  }
  dungeonOcclusionCheckTimer = setTimeout(() => {
    dungeonOcclusionCheckTimer = null;
    if (!document.hidden) queueFrame();
  }, delay);
}

function cancelDungeonOcclusionCheck() {
  if (dungeonOcclusionCheckFrame !== null) cancelAnimationFrame(dungeonOcclusionCheckFrame);
  if (dungeonOcclusionCheckTimer !== null) clearTimeout(dungeonOcclusionCheckTimer);
  dungeonOcclusionCheckFrame = null;
  dungeonOcclusionCheckTimer = null;
}

function runDungeonOcclusionCheck() {
  if (!usesWorldAvatar || !rendererReady || !latestPosition || document.hidden) return;
  const startedAt = performance.now();
  const world = globalThis.world;
  const camera = world?.camera;
  const sceneOrigin = world?.sceneOrigin;
  const collisionCache = world?.cameraCollisionBlockCache;
  if (!camera || !sceneOrigin || typeof collisionCache?.isSolidBlock !== "function") {
    dungeonOcclusionDiagnostics = {
      ...dungeonOcclusionDiagnostics,
      supported: false,
      active: false,
      lastReason: "collision-cache-unavailable",
      lastCheckedAt: Date.now(),
      lastDurationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    };
    dungeonOcclusionState = { active: false, clearSamples: 0 };
    dungeonRoofState = { active: false, clearSamples: 0 };
    dungeonUpperCutawayY = null;
    dungeonUpperCutawayRegion = null;
    restoreDungeonCutaway();
    return;
  }

  camera.parent?.updateMatrixWorld?.(true);
  camera.updateMatrixWorld?.(true);
  camera.getWorldPosition(dungeonOcclusionCameraScene);
  const resolvedTarget = resolveObserverTargetPosition();
  const avatar = resolvedTarget?.position || latestPosition.pos;
  const cameraWorld = {
    x: sceneOrigin.toWorldX(dungeonOcclusionCameraScene.x),
    y: sceneOrigin.toWorldY(dungeonOcclusionCameraScene.y),
    z: sceneOrigin.toWorldZ(dungeonOcclusionCameraScene.z),
  };
  let trace, roomCeiling = false, deepRoof = false;
  try {
    roomCeiling = hasRoomCeiling(avatar, dungeonRoomCoverCache || collisionCache);
    deepRoof = hasDeepRoof(avatar, collisionCache);
    trace = traceVisibilityCorridor({
      start: cameraWorld,
      target: { x: avatar.x, y: avatar.y, z: avatar.z },
      isSolid: (x, y, z) => collisionCache.isSolidBlock(x, y, z),
      startPadding: 0.5,
      endPadding: 0.5,
      maximumSamples: 320,
    });
  } catch {
    roomCeiling = false;
    deepRoof = false;
    trace = { occluded: false, hit: null, samples: 0, reason: "collision-cache-error", ray: null };
  }

  viewerPerformanceCounters.occlusionChecks += 1;
  viewerPerformanceCounters.occlusionVoxelSamples += trace.samples;
  // Prepare late terrain materials while the corridor is still clear.
  // First entering a house must not trigger shader compilation.
  refreshDungeonCutawayMaterials();
  const wasActive = dungeonOcclusionState.active;
  dungeonOcclusionState = updateOcclusionHysteresis(
    dungeonOcclusionState,
    deepRoof || trace.occluded || roomCeiling,
    DUNGEON_OCCLUSION_RELEASE_SAMPLES,
  );
  dungeonRoofState = updateOcclusionHysteresis(dungeonRoofState, roomCeiling || deepRoof, DUNGEON_OCCLUSION_RELEASE_SAMPLES);
  const hardCutaway = isDungeonView && dungeonRoofState.active;
  dungeonUpperCutawayY = hardCutaway && dungeonOcclusionState.active ? avatar.y : null;
  if (dungeonUpperCutawayY === null) dungeonUpperCutawayRegion = null;
  // Collision caches omit some visible surfaces. The fragment mask handles
  // the body aperture even when the sparse CPU rays report a clear view.
  applyDungeonCutaway({
    targetWorld: avatar,
    cameraWorld,
    cutoffWorldY: roomCutoffWorldY(avatar.y, hardCutaway),
    hardCutaway,
  });
  if (!wasActive && dungeonOcclusionState.active) viewerPerformanceCounters.cutawayActivations += 1;
  if (wasActive && !dungeonOcclusionState.active) viewerPerformanceCounters.cutawayRestores += 1;

  const canvas = document.getElementById("viewer-canvas");
  if (canvas) {
    setElementDataset(canvas, "occlusionDetected", dungeonOcclusionState.active ? "blocked" : "clear");
    setElementDataset(canvas, "roomCeiling", roomCeiling ? "yes" : "no");
    setElementDataset(canvas, "deepRoof", deepRoof ? "yes" : "no");
    setElementDataset(canvas, "occlusionMode", roomOcclusionMode(isDungeonView, hardCutaway));
    setElementDataset(canvas, "occlusionCutaway", dungeonCutawayApplied ? "active" : dungeonOcclusionState.active ? "unavailable" : "clear");
    setElementDataset(canvas, "occlusionSamples", trace.samples);
    setElementDataset(canvas, "occlusionTarget", resolvedTarget?.mode || "self");
  }
  dungeonOcclusionDiagnostics = {
    ...dungeonOcclusionDiagnostics,
    supported: true,
    active: dungeonCutawayApplied,
    detected: dungeonOcclusionState.active,
    roomCeiling,
    deepRoof,
    mode: roomOcclusionMode(isDungeonView, hardCutaway),
    cutoffWorldY: roomCutoffWorldY(avatar.y, hardCutaway),
    cutScope: hardCutaway ? "connected-floor-and-aperture" : "aperture",
    maskVersion: 3,
    roomRadius: dungeonVisibilityUniforms.u_lanternRoomRadius.value,
    coverCache: dungeonRoomCoverCache?.diagnostics ?? null,
    floorMask: dungeonFloorMask?.diagnostics ?? null,
    applied: dungeonCutawayApplied,
    checks: dungeonOcclusionDiagnostics.checks + 1,
    samples: dungeonOcclusionDiagnostics.samples + trace.samples,
    materials: dungeonCutawayMaterials.size,
    hit: trace.hit ? { ...trace.hit } : null,
    ray: trace.ray ? { name: trace.ray.name, height: trace.ray.height, lateral: trace.ray.lateral } : null,
    targetMode: resolvedTarget?.mode || "self",
    targetEntityId: resolvedTarget?.mode === "entity" ? focusedCharacterId : null,
    lastReason: trace.reason,
    lastCheckedAt: Date.now(),
    lastDurationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    clearSamples: dungeonOcclusionState.clearSamples,
    intervalMs: DUNGEON_OCCLUSION_INTERVAL_MS,
    releaseSamples: DUNGEON_OCCLUSION_RELEASE_SAMPLES,
    cutHeight: 2,
  };
}

function refreshDungeonCutawayMaterials() {
  if (!usesWorldAvatar) return;
  const world = globalThis.world;
  const manager = world?.chunkMeshManager;
  const candidates = [
    world?.material,
    manager?.globalBlockBuffer?.mesh?.material,
    manager?.globalLegacyBuffer?.mesh?.material,
    manager?.globalLegacyBlendBuffer?.mesh?.material,
  ];
  // Section meshes can arrive after the chunk packet. Scan a rotating bounded
  // window every check so late materials are eventually patched without a
  // full-scene traversal or per-frame material cloning.
  if (manager?.sectionObjects) {
    const sections = Object.values(manager.sectionObjects);
    const batchSize = Math.min(48, sections.length);
    for (let offset = 0; offset < batchSize; offset += 1) {
      const section = sections[(dungeonCutawayMaterialScanCursor + offset) % sections.length];
      candidates.push(section?.mesh?.material, section?.shaderMesh?.material);
    }
    if (sections.length > 0) dungeonCutawayMaterialScanCursor = (dungeonCutawayMaterialScanCursor + batchSize) % sections.length;
  }
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const material of candidate) registerDungeonCutawayMaterial(material);
    } else {
      registerDungeonCutawayMaterial(candidate);
    }
  }
}

function registerDungeonCutawayMaterial(material) {
  if (!material || dungeonCutawayMaterials.has(material)) return;
  const record = {
    material,
    mode: "unsupported",
  };
  if (material.isMaterial || material.isShaderMaterial === true) {
    record.mode = patchDungeonCutawayShader(material) ? "uniform" : "unsupported";
  }
  // A scene-wide clipping plane is not a safe fallback for the local
  // camera-to-player corridor: it clips every block above the target height
  // across the whole world, creating large visible holes. Only materials
  // whose shader supports the bounded corridor may participate.
  dungeonCutawayMaterials.set(material, record);
  material.addEventListener?.("dispose", () => dungeonCutawayMaterials.delete(material));
  dungeonOcclusionDiagnostics.materials = dungeonCutawayMaterials.size;
  if (record.mode === "uniform") dungeonOcclusionDiagnostics.patchedShaderMaterials += 1;
  if (record.mode === "unsupported") dungeonOcclusionDiagnostics.unsupportedMaterials += 1;
}

function patchDungeonCutawayShader(material) {
  return patchCutawayMaterial(material, dungeonVisibilityUniforms);
}

function applyDungeonCutaway({ targetWorld, cameraWorld, hardCutaway }) {
  dungeonRevealTarget = true;
  dungeonVisibilityUniforms.u_lanternCutawayEnabled.value = hardCutaway ? 2 : 1;
  dungeonUpperCutawayRegion = hardCutaway
    ? { center: targetWorld, camera: cameraWorld, radius: dungeonVisibilityUniforms.u_lanternRoomRadius.value, corridorRadius: 0, hitAlong: 1, halfSpan: 0 }
    : null;
  dungeonCutawayApplied = [...dungeonCutawayMaterials.values()].some(record => record.mode === "uniform");
  updateDungeonVisibilityFrame();
  if (hardCutaway && dungeonFloorMask) {
    const previous = dungeonFloorMask.current;
    const mask = dungeonFloorMask.update(targetWorld, dungeonVisibilityUniforms.u_lanternRoomRadius.value);
    if (mask !== previous) setRoomFloorMask(dungeonVisibilityUniforms, mask);
    updateDungeonVisibilityFrame();
  } else dungeonVisibilityUniforms.u_lanternRoomMaskEnabled.value = 0;
  return dungeonCutawayApplied;
}

function restoreDungeonCutaway() {
  dungeonRevealTarget = false;
  dungeonCutawayApplied = false;
}

function updateDungeonVisibilityFrame() {
  if (!rendererReady || !usesWorldAvatar) return;
  const world = globalThis.world;
  const camera = world?.camera;
  const origin = world?.sceneOrigin;
  if (!camera || !origin || !latestPosition) return;
  const now = performance.now();
  const elapsed = dungeonRevealLastFrameAt === null ? 16 : now - dungeonRevealLastFrameAt;
  dungeonRevealLastFrameAt = now;
  const uniforms = dungeonVisibilityUniforms;
  uniforms.u_lanternReveal.value = advanceReveal(uniforms.u_lanternReveal.value, dungeonRevealTarget, elapsed);
  if (uniforms.u_lanternReveal.value === 0 && !dungeonRevealTarget) {
    uniforms.u_lanternCutawayEnabled.value = 0;
    dungeonUpperCutawayY = null;
    dungeonUpperCutawayRegion = null;
    return;
  }
  // Use the displayed entity and camera, including interpolation and floating
  // origin changes. A network-rate mask otherwise trails a walking character.
  const targetId = focusedCharacterId ?? pendingAvatarState?.entity?.id;
  const root = targetId === undefined ? null : world.entities?.entities?.[String(targetId)];
  const targetWorld = resolveObserverTargetPosition()?.position || latestPosition.pos;
  if (root?.getWorldPosition && (focusedCharacterId !== null || Math.hypot(observerOffset.x, observerOffset.y, observerOffset.z) < 0.01)) {
    root.getWorldPosition(dungeonOcclusionTargetScene);
  } else {
    dungeonOcclusionTargetScene.set(origin.toSceneX(targetWorld.x), origin.toSceneY(targetWorld.y), origin.toSceneZ(targetWorld.z));
  }
  camera.getWorldPosition(uniforms.u_lanternCutawayCamera.value);
  uniforms.u_lanternFootY.value = dungeonOcclusionTargetScene.y + 0.05;
  const feetWorldY = origin.toWorldY(dungeonOcclusionTargetScene.y);
  uniforms.u_lanternCutawayY.value = origin.toSceneY(roomCutoffWorldY(feetWorldY, true));
  uniforms.u_lanternCutawayTarget.value.copy(dungeonOcclusionTargetScene);
  uniforms.u_lanternCutawayTarget.value.y += 1;
  uniforms.u_lanternCameraRight.value.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  uniforms.u_lanternCameraUp.value.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  uniforms.u_lanternCameraForward.value.setFromMatrixColumn(camera.matrixWorld, 2).negate().normalize();
  uniforms.u_lanternRoomRadius.value = roomRevealRadius(camera, dungeonOcclusionTargetScene, dungeonOcclusionTargetScene.y);
  const roomMask = dungeonFloorMask?.current ?? null;
  if (roomMask) uniforms.u_lanternRoomMaskOrigin.value.set(origin.toSceneX(roomMask.origin.x), 0, origin.toSceneZ(roomMask.origin.z));
  if (uniforms.u_lanternCutawayEnabled.value > 1.5) {
    dungeonUpperCutawayY = feetWorldY;
    dungeonUpperCutawayRegion = { center: {
      x: origin.toWorldX(dungeonOcclusionTargetScene.x), y: feetWorldY, z: origin.toWorldZ(dungeonOcclusionTargetScene.z),
    }, camera: targetWorld, radius: uniforms.u_lanternRoomRadius.value, corridorRadius: 0, hitAlong: 1, halfSpan: 0, roomMask };
  }
}

function scheduleDungeonHoverPick(canvas) {
  if (!isDungeonView || !canvas) return;
  viewerPerformanceCounters.hoverRequests += 1;
  if (dungeonHoverPickFrame !== null || dungeonHoverPickTimer !== null) return;
  const queueFrame = () => {
    dungeonHoverPickFrame = requestAnimationFrame((now) => {
      dungeonHoverPickFrame = null;
      dungeonHoverLastPickAt = now;
      if (!dungeonHoverPointer || document.hidden) return;
      viewerPerformanceCounters.hoverRaycasts += 1;
      const picked = pickDungeonEntityAtCanvasPoint(canvas, dungeonHoverPointer.x, dungeonHoverPointer.y);
      renderDungeonHover(canvas, picked);
    });
  };
  const delay = rateLimitDelayMs(dungeonHoverLastPickAt, performance.now(), DUNGEON_HOVER_INTERVAL_MS);
  if (delay <= 0) {
    queueFrame();
    return;
  }
  dungeonHoverPickTimer = setTimeout(() => {
    dungeonHoverPickTimer = null;
    if (dungeonHoverPointer) queueFrame();
  }, delay);
}

function cancelDungeonHoverPick() {
  if (dungeonHoverPickFrame !== null) cancelAnimationFrame(dungeonHoverPickFrame);
  if (dungeonHoverPickTimer !== null) clearTimeout(dungeonHoverPickTimer);
  dungeonHoverPickFrame = null;
  dungeonHoverPickTimer = null;
}

function pickDungeonEntityAtCanvasPoint(canvas, clientX, clientY) {
  if (!isDungeonView || !rendererReady) return null;
  const camera = globalThis.world?.camera;
  const scene = globalThis.world?.scene;
  const renderedEntities = globalThis.world?.entities?.entities;
  if (!camera || !scene || !renderedEntities) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const candidates = [...entityCache.values()]
    .filter(isDungeonInteractionCandidate)
    .map((entity) => ({
      id: entity.id,
      entity,
      root: renderedEntities[String(entity.id)],
    }))
    .filter((candidate) => candidate.root);
  canvas.dataset.dungeonPickCandidates = String(candidates.length);
  if (candidates.length === 0) return null;
  sharedEntityRaycaster.near = 0;
  sharedEntityRaycaster.far = Math.max(24, Math.min(96, renderDistance * 16));
  sharedEntityPointerNdc.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    1 - ((clientY - rect.top) / rect.height) * 2,
  );
  const picked = pickEntity({
    candidates,
    raycaster: sharedEntityRaycaster,
    camera,
    scene,
    ndc: sharedEntityPointerNdc,
  });
  if (!picked) return null;
  const interaction = classifyDungeonInteraction(picked.entity);
  if (interaction.category === "unavailable") return null;
  const label = createDungeonHoverLabel({ ...picked.entity, distance: picked.distance }, interaction);
  return { ...picked, interaction, label, root: renderedEntities[String(picked.id)] };
}

function handleDungeonTap(canvas, clientX, clientY) {
  const picked = pickDungeonEntityAtCanvasPoint(canvas, clientX, clientY);
  if (!picked) {
    if (manualControlActive) sendGroundRay(canvas, clientX, clientY);
    else showNpcToast("请先在主页面开启人工接管，再点击地面移动");
    return;
  }

  const { entity, interaction, label } = picked;
  canvas.dataset.dungeonPickLast = `${interaction.action}:${String(entity.id)}`;
  if (interaction.category === "npc" && interaction.canView) {
    openNpcPanel(entity);
    return;
  }
  if (interaction.category === "hostile" && interaction.canAttack) {
    if (!manualControlActive) {
      showNpcToast(`请先开启人工接管，再攻击${label.title}`);
      return;
    }
    const entityId = Number(entity.id);
    if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId > 2_147_483_647) {
      showNpcToast("目标编号无效，已拒绝攻击");
      return;
    }
    lastManualMotionEngaged = false;
    lastManualInputSignature = "";
    manualControlPhase = "attacking";
    showGroundPing(clientX, clientY, "hostile");
    postToDashboard({ type: "lantern-control-attack-entity", entityId });
    updateManualHelp();
    return;
  }
  showNpcToast(`${label.title}：可查看，但不能攻击`);
}

function renderDungeonHover(canvas, picked) {
  const card = document.getElementById("dungeon-hover-card");
  if (!card || !picked?.label?.visible) {
    hideDungeonHover(canvas);
    return;
  }
  const { label, interaction, root } = picked;
  dungeonHoverEntityId = String(picked.id);
  if (card.hidden) card.hidden = false;
  setElementAttribute(card, "aria-hidden", "false");
  setElementAttribute(card, "aria-label", label.ariaLabel || label.title);
  setElementDataset(card, "entityId", dungeonHoverEntityId);
  setElementDataset(card, "action", interaction.action);
  setElementDataset(card, "tone", interaction.category === "npc" ? "npc" : interaction.category === "hostile" ? "hostile" : "info");
  const icon = document.getElementById("dungeon-hover-icon");
  const title = document.getElementById("dungeon-hover-title");
  const subtitle = document.getElementById("dungeon-hover-subtitle");
  const action = document.getElementById("dungeon-hover-action");
  setElementText(icon, interaction.category === "npc" ? "◆" : interaction.category === "hostile" ? "⚔" : "i");
  setElementText(title, label.title);
  setElementText(subtitle, label.subtitle);
  setElementText(action, label.actionLabel);
  positionDungeonHover(card, canvas, root, dungeonHoverPointer);
  setElementStyle(canvas, "cursor", interaction.cursor);
}

function positionDungeonHover(card, canvas, root, pointer) {
  const camera = globalThis.world?.camera;
  const rect = canvas.getBoundingClientRect();
  let left = pointer?.x ?? rect.left + rect.width / 2;
  let top = (pointer?.y ?? rect.top + rect.height / 2) - 36;
  if (camera && root) {
    try {
      root.updateWorldMatrix?.(true, true);
      dungeonHoverAnchorBox.setFromObject(root);
      if (!dungeonHoverAnchorBox.isEmpty()) {
        dungeonHoverAnchor.set(
          (dungeonHoverAnchorBox.min.x + dungeonHoverAnchorBox.max.x) / 2,
          dungeonHoverAnchorBox.max.y + 0.35,
          (dungeonHoverAnchorBox.min.z + dungeonHoverAnchorBox.max.z) / 2,
        );
        dungeonHoverAnchor.project(camera);
        if (Number.isFinite(dungeonHoverAnchor.x)
          && Number.isFinite(dungeonHoverAnchor.y)
          && Number.isFinite(dungeonHoverAnchor.z)
          && dungeonHoverAnchor.z >= -1.5
          && dungeonHoverAnchor.z <= 1.5) {
          left = rect.left + ((dungeonHoverAnchor.x + 1) / 2) * rect.width;
          top = rect.top + ((1 - dungeonHoverAnchor.y) / 2) * rect.height;
        }
      }
    } catch {
      // A renderer rebuild can detach a root between picking and projection.
      // The pointer position remains a safe, useful fallback for this frame.
    }
  }
  setElementStyle(card, "left", `${clampNumber(left, rect.left + 100, rect.right - 100, left).toFixed(1)}px`);
  setElementStyle(card, "top", `${clampNumber(top, rect.top + 76, rect.bottom - 16, top).toFixed(1)}px`);
}

function hideDungeonHover(canvas) {
  const alreadyHidden = dungeonHoverEntityId === null;
  dungeonHoverEntityId = null;
  const card = document.getElementById("dungeon-hover-card");
  if (card && (!alreadyHidden || !card.hidden)) {
    card.hidden = true;
    setElementAttribute(card, "aria-hidden", "true");
    card.removeAttribute("data-entity-id");
    card.removeAttribute("data-action");
  }
  if (canvas && isDungeonView) setElementStyle(canvas, "cursor", "default");
}

function publishCameraDataset() {
  const canvas = document.getElementById("viewer-canvas");
  if (!canvas || !latestPosition) return;
  setElementDataset(canvas, "actualYaw", finiteOr(pendingAvatarState?.entity?.yaw, latestPosition.yaw));
  setElementDataset(canvas, "observerYaw", usesWorldAvatar ? orbitYaw : latestPosition.yaw);
  setElementDataset(canvas, "observerPitch", usesWorldAvatar ? orbitPitch : latestPosition.pitch);
  setElementDataset(canvas, "orbitDistance", usesWorldAvatar ? orbitDistance : 0);
  setElementDataset(canvas, "observerX", observerOffset.x);
  setElementDataset(canvas, "observerY", observerOffset.y);
  setElementDataset(canvas, "observerZ", observerOffset.z);
}

function applyAvatarState() {
  if (!rendererReady || !viewer || !pendingAvatarState) return;
  const reactive = viewer.playerState.reactive;
  const state = pendingAvatarState;
  const motion = normalizedAvatarMotion ?? normalizeMotionFrame(state, null, Date.now());
  const movementState = normalizeMovementState(state.movementState);
  reactive.movementState = movementState;
  reactive.onGround = state.onGround !== false;
  reactive.sneaking = state.sneaking === true || movementState === "SNEAKING";
  reactive.sprinting = state.sprinting === true || movementState === "SPRINTING";
  reactive.flying = state.flying === true || state.elytraFlying === true;
  reactive.inWater = state.inWater === true;
  reactive.itemUsageTicks = state.usingHeldItem === true ? Math.max(1, finiteOr(reactive.itemUsageTicks, 0) + 1) : 0;
  reactive.fovMultiplier = reactive.sprinting ? 1.04 : 1;

  reactive.prevWalkDist = finiteOr(reactive.walkDist, accumulatedWalkDistance);
  reactive.walkDist = accumulatedWalkDistance;
  reactive.prevBob = finiteOr(reactive.bob, 0);
  const targetBob = movementState === "NOT_MOVING" ? 0 : movementState === "SPRINTING" ? 0.9 : 0.6;
  reactive.bob = reactive.prevBob + (targetBob - reactive.prevBob) * 0.45;

  const equipment = Array.isArray(state.equipment) ? state.equipment : state.entity?.equipment;
  updateHandItem("main", equipment?.[0] ?? selectedHotbarItem(state));
  updateHandItem("off", equipment?.[1]);

  if (playerModelInstance && usesWorldAvatar) {
    playerModelInstance.root.visible = !isEntityInvisible(state.entity);
    playerModelInstance.controller.updateEntity(motion);
    hideNativePlayerBody(playerModelInstance);
  }

  const rigKey = mainAvatarRigKey();
  const rig = rigKey ? ensureAvatarRig(rigKey, motion) : null;
  if (!rig && !playerModelInstance && usesWorldAvatar && state.entity?.id !== undefined) {
    const animation = avatarMovementAnimation(state, movementState);
    if (animation !== lastAvatarAnimation) {
      viewer.backend?.backendMethods?.playEntityAnimation?.(String(state.entity.id), animation);
      lastAvatarAnimation = animation;
    }
  }
  renderMotionHud();
}

function applyEntityAnimation(event) {
  if (!rendererReady || !event || typeof event !== "object") return;
  const animation = String(event.animation || "idle");
  const allowed = new Set(["walking", "running", "oneSwing", "idle", "crouch", "crouchWalking", "riding"]);
  if (!allowed.has(animation)) return;
  const targetId = playerRigKeyForAnimation(event);
  const backendPlayerObject = targetId ? sceneEntityForAvatarRig(targetId)?.playerObject : null;
  const rig = targetId ? ensureAvatarRig(targetId) : null;
  if (animation === "oneSwing" && rig) {
    rig.trigger("swing", {
      hand: event.hand === "left" ? "left" : "right",
      nonce: event.nonce ?? `swing:${targetId}:${++avatarActionSequence}`,
    });
  } else if (!rig && targetId && backendPlayerObject) {
    viewer.backend?.backendMethods?.playEntityAnimation?.(targetId, animation);
  }
  if (targetId && playerModelInstance?.id === String(targetId)) {
    playerModelInstance.controller.play(animation, { hand: event.hand === "left" ? "left" : "right" });
  }
  if (event.id !== undefined) customCharacterInstances.get(String(event.id))?.controller.play(animation);
  if (event.isSelf === true && animation === "oneSwing") {
    viewer.backend?.backendMethods?.changeHandSwingingState?.(true, event.hand === "left");
    clearTimeout(handSwingTimer);
    handSwingTimer = setTimeout(() => {
      viewer?.backend?.backendMethods?.changeHandSwingingState?.(false, event.hand === "left");
    }, 280);
  }
}

function applyEntityDamage(event) {
  if (!rendererReady || !event || typeof event !== "object") return;
  const targetId = playerRigKeyForAnimation(event);
  const rig = targetId ? ensureAvatarRig(targetId) : null;
  rig?.trigger("hurt", { nonce: event.nonce ?? `hurt:${targetId}:${++avatarActionSequence}` });
  if (targetId && playerModelInstance?.id === String(targetId)) playerModelInstance.controller.play("hurt");
  if (event.isSelf === true && isFirstPersonView) {
    viewer.backend?.backendMethods?.shakeFromDamage?.(latestPosition?.yaw);
    renderMotionHud();
    return;
  }
  if (event.id !== undefined) {
    const id = String(event.id);
    viewer.backend?.backendMethods?.damageEntity?.(id, 1);
    customCharacterInstances.get(id)?.controller.play("hurt");
  }
  renderMotionHud();
}

function deliverViewerEffect(raw) {
  if (!viewerEffectSystem) return false;
  const event = normalizeViewerEffectEvent(raw);
  const rendered = viewerEffectSystem.handle(event || raw);
  if (
    rendered
    && event?.kind === "status"
    && event.phase === "start"
    && event.entityId !== null
  ) {
    if (playerModelInstance?.id === String(event.entityId)) playerModelInstance.controller.play("use");
    customCharacterInstances.get(String(event.entityId))?.controller.play("use");
  }
  return rendered;
}

function playerRigKeyForAnimation(event) {
  if (event?.isSelf === true && isFirstPersonView) return "player_entity";
  const candidateId = event?.id ?? (event?.isSelf === true ? pendingAvatarState?.entity?.id : undefined);
  if (candidateId === undefined || candidateId === null || candidateId === "") return null;
  const id = String(candidateId);
  const cached = entityCache.get(id);
  const streamedSelf = id === String(pendingAvatarState?.entity?.id ?? "") ? pendingAvatarState?.entity : null;
  const entity = cached ?? streamedSelf;
  return canonicalEntityName(entity?.name) === "player" ? id : null;
}

function normalizeMovementState(value) {
  const candidate = String(value || "NOT_MOVING").toUpperCase();
  const aliases = {
    IDLE: "NOT_MOVING",
    WALKING: "WALKING",
    RUNNING: "SPRINTING",
    CROUCH: "SNEAKING",
    CROUCHWALKING: "SNEAKING",
    RIDING: "NOT_MOVING",
  };
  return aliases[candidate] ?? (["NOT_MOVING", "SPRINTING", "SNEAKING"].includes(candidate) ? candidate : "NOT_MOVING");
}

function avatarMovementAnimation(state, movementState) {
  const streamed = String(state.movementState || "").toLowerCase();
  if (["walking", "running", "idle", "crouch", "crouchwalking", "riding"].includes(streamed)) {
    return streamed === "crouchwalking" ? "crouchWalking" : streamed;
  }
  if (state.riding === true) return "riding";
  if (movementState === "SPRINTING") return "running";
  if (movementState === "SNEAKING") return state.moving === true ? "crouchWalking" : "crouch";
  if (movementState === "WALKING") return "walking";
  return "idle";
}

function mainAvatarRigKey() {
  const id = pendingAvatarState?.entity?.id;
  if (id === undefined || id === null) return null;
  return isFirstPersonView ? "player_entity" : String(id);
}

function sceneEntityForAvatarRig(key) {
  if (key === "player_entity") return globalThis.world?.entities?.playerEntity ?? null;
  return globalThis.world?.entities?.entities?.[String(key)] ?? null;
}

function motionFrameForRigKey(key) {
  if (key === "player_entity") return normalizedAvatarMotion;
  const normalizedKey = String(key);
  if (normalizedKey === String(pendingAvatarState?.entity?.id ?? "") && normalizedAvatarMotion) {
    return normalizedAvatarMotion;
  }
  return entityMotionFrames.get(normalizedKey) ?? null;
}

function avatarMotionFrameIdentity(frame) {
  if (!frame || typeof frame !== "object") return null;
  const hasSequence = frame.seq !== undefined && frame.seq !== null && Number.isFinite(Number(frame.seq));
  const hasCapturedAt = frame.capturedAt !== undefined
    && frame.capturedAt !== null
    && Number.isFinite(Number(frame.capturedAt));
  if (!hasSequence && !hasCapturedAt) return null;
  return `${hasSequence ? Number(frame.seq) : ""}:${hasCapturedAt ? Number(frame.capturedAt) : ""}`;
}

function deliverAvatarRigFrame(rig, motionFrame) {
  if (!rig || !motionFrame) return false;
  const identity = avatarMotionFrameIdentity(motionFrame);
  if (identity !== null && deliveredAvatarRigFrames.get(rig) === identity) return false;
  rig.setMotion(motionFrame, motionFrame.receivedAt ?? Date.now());
  if (identity !== null) deliveredAvatarRigFrames.set(rig, identity);
  return true;
}

function ensureAvatarRig(key, motionFrame = undefined, scheduleRetry = true) {
  if (!rendererReady || key === undefined || key === null || key === "") return null;
  const normalizedKey = String(key);
  if (!isFirstPersonView && playerModelInstance?.id === normalizedKey) {
    pendingAvatarRigChecks.delete(normalizedKey);
    return null;
  }
  const sceneEntity = sceneEntityForAvatarRig(normalizedKey);
  const playerObject = sceneEntity?.playerObject;
  if (!playerObject) {
    if (scheduleRetry) scheduleAvatarRigCheck(normalizedKey);
    return null;
  }
  try {
    // minecraft-renderer's generic remote-player pass writes pitch after the
    // animation update and also zeros head yaw. The pose rig owns both axes,
    // so prevent that second writer while retaining the network yaw metadata
    // used by vehicle/passenger placement.
    if (sceneEntity.userData) {
      sceneEntity.userData._networkHeadPitch = undefined;
      sceneEntity.userData.__lanternAvatarRigOwnsHead = true;
    }
    const rig = avatarRigRegistry.ensure(normalizedKey, playerObject, { type: "minecraft-player" });
    pendingAvatarRigChecks.delete(normalizedKey);
    deliverAvatarRigFrame(rig, motionFrame ?? motionFrameForRigKey(normalizedKey));
    lastAvatarRigError = null;
    return rig;
  } catch (error) {
    lastAvatarRigError = error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240);
    console.warn("Unable to mount avatar motion rig", normalizedKey, error);
    return null;
  }
}

function scheduleAvatarRigCheck(key) {
  const normalizedKey = String(key);
  if (pendingAvatarRigChecks.has(normalizedKey)) return;
  pendingAvatarRigChecks.add(normalizedKey);
  requestAnimationFrame(() => {
    if (!pendingAvatarRigChecks.delete(normalizedKey)) return;
    const rig = ensureAvatarRig(normalizedKey, motionFrameForRigKey(normalizedKey), false);
    if (rig) renderMotionHud();
  });
}

function renderMotionHud() {
  const element = document.querySelector(".viewer-motion");
  if (!element) return;
  const key = mainAvatarRigKey();
  const binding = key ? avatarRigRegistry.getDiagnostics(key) : null;
  const authoredAnimation = playerModelInstance?.controller.getDiagnostics?.() ?? null;
  const animation = authoredAnimation ?? binding?.adapter?.animation;
  const rigType = authoredAnimation ? `trusted-${playerModelInstance?.asset?.format || "avatar"}` : binding?.type;
  if (!animation) {
    setElementText(element, key
      ? isFirstPersonView
        ? "手臂/持物：由第一人称手部渲染｜身体状态：正在同步…"
        : "骨骼动作：正在绑定角色模型…"
      : "");
    setElementDataset(element, "display", isFirstPersonView ? "first-person-hands" : "third-person-skeleton");
    element.removeAttribute("data-state");
    element.removeAttribute("data-rig");
    return;
  }
  const state = String(animation.state || "idle");
  const speed = Math.max(0, finiteOr(animation.horizontalSpeed, 0) * 20);
  const overlays = animation.overlays || {};
  const layer = overlays.hurt
    ? "受伤反应叠加"
    : overlays.upper?.kind === "swing"
      ? "挥击动作叠加"
      : overlays.upper?.kind === "use" || overlays.usingHeldItem
        ? "持物动作叠加"
        : "平滑姿势混合";
  const handLayer = overlays.hurt
    ? "受伤反馈"
    : overlays.upper?.kind === "swing"
      ? "挥击中"
      : overlays.upper?.kind === "use" || overlays.usingHeldItem
        ? "正在使用持物"
        : lastMainHandKey && lastMainHandKey !== "empty"
          ? "持物姿态已同步"
          : "空手姿态已同步";
  setElementText(element, isFirstPersonView
    ? `手臂/持物：${handLayer}｜身体状态：${AVATAR_MOTION_LABELS[state] || state} · ${speed.toFixed(1)} 格/秒`
    : `骨骼动作：${AVATAR_MOTION_LABELS[state] || state} · ${speed.toFixed(1)} 格/秒 · 距离步态 · ${layer}`);
  setElementDataset(element, "display", isFirstPersonView ? "first-person-hands" : "third-person-skeleton");
  setElementDataset(element, "state", state);
  setElementDataset(element, "rig", rigType);
  const canvas = document.getElementById("viewer-canvas");
  if (canvas) {
    setElementDataset(canvas, "avatarMotion", state);
    setElementDataset(canvas, "avatarRig", rigType);
  }
}

function disposeAllAvatarRigs() {
  for (const binding of avatarRigRegistry.getDiagnostics().bindings) removeAvatarRig(binding.key);
  entityMotionFrames.clear();
  pendingAvatarRigChecks.clear();
  deliveredAvatarRigFrames = new WeakMap();
  firstPersonEntityPublished = false;
}

function removeAvatarRig(key) {
  const normalizedKey = String(key);
  const rig = avatarRigRegistry.get(normalizedKey);
  if (rig) deliveredAvatarRigFrames.delete(rig);
  pendingAvatarRigChecks.delete(normalizedKey);
  return avatarRigRegistry.remove(normalizedKey);
}

function selectedHotbarItem(state) {
  if (!Array.isArray(state.hotbar)) return undefined;
  const index = clampNumber(state.quickBarSlot, 0, 8, 0);
  return unwrapHotbarSlot(state.hotbar[index]);
}

function unwrapHotbarSlot(slot) {
  return slot && typeof slot === "object" && Object.hasOwn(slot, "item") ? slot.item : slot;
}

function updateHandItem(hand, item) {
  const key = item ? `${item.name || ""}:${item.type ?? item.itemId ?? ""}:${item.metadata ?? ""}` : "empty";
  if (hand === "main" && key === lastMainHandKey) return;
  if (hand === "off" && key === lastOffHandKey) return;
  const handItem = toHandItem(item);
  if (hand === "main") {
    lastMainHandKey = key;
    viewer.playerState.reactive.heldItemMain = handItem;
  } else {
    lastOffHandKey = key;
    viewer.playerState.reactive.heldItemOff = handItem;
  }
}

function toHandItem(item) {
  if (!item || typeof item !== "object") return undefined;
  const name = canonicalEntityName(item.name);
  const runtimeId = Number(item.type ?? item.itemId);
  const registryId = Number(globalThis.mcData?.itemsByName?.[name]?.id);
  // Mineflayer reports the server runtime registry id, which can be outside
  // minecraft-renderer's bundled 1.21.1 item table on custom servers. Resolve
  // the canonical name back to the renderer registry while retaining the name
  // for model predicates and diagnostics.
  const id = Number.isFinite(registryId) ? registryId : runtimeId;
  if (!name || !Number.isFinite(id)) return undefined;
  return {
    type: globalThis.mcData?.blocksByName?.[name] ? "block" : "item",
    name,
    id,
    fullItem: { ...item, name, type: id, itemId: id },
  };
}

function fishingActors() {
  return withSelfFishingActor([...entityCache.values()], pendingAvatarState);
}

function playFishingAction(phase) {
  const selfId = pendingAvatarState?.entity?.id;
  if (selfId === undefined) return;
  if (isFirstPersonView) {
    const swing = viewer?.backend?.backendMethods?.changeHandSwingingState;
    swing?.(true, false);
    setTimeout(() => swing?.(false, false), phase === "cast" ? 320 : 240);
  } else {
    applyEntityAnimation({ id: selfId, animation: "oneSwing", hand: "right",
      nonce: `fishing:${phase}:${Date.now()}` });
  }
}

function handleEntity(update, movementOnly) {
  if (!update || update.id === undefined || update.id === null) return;
  const id = String(update.id);
  if (update.delete) {
    const prior = entityCache.get(id) || { id: update.id };
    entityCache.delete(id);
    playerSkinTargetSignatures.delete(id);
    playerSkinTargetSignatures.delete(`other:${id}`);
    if (isOwnAvatarEntity(prior)) playerSkinTargetSignatures.delete('player_entity');
    fishingVisuals?.updateEntity(update);
    fishingVisuals?.sync();
    pendingVillagerStyleChecks.delete(id);
    if (id === focusedCharacterId) {
      returnCameraToAvatar({ announce: false });
      showNpcToast("跟随目标已离开，镜头已返回玩家");
    }
    removePaintingEntity(id);
    removeCustomCharacter(id);
    if (playerModelInstance?.id === id || id === String(pendingAvatarState?.entity?.id ?? "")) {
      removeSelectedPlayerModel({ restoreNative: false, restoreRig: false });
      playerModelStatus = isFirstPersonView ? "first-person-hands" : "waiting-for-avatar";
      publishPlayerModelDataset();
    }
    removeAvatarRig(id);
    if (id === selectedNpcId) closeNpcPanel();
    if (id === dungeonHoverEntityId) hideDungeonHover(document.getElementById("viewer-canvas"));
    entityMotionFrames.delete(id);
    playerHeadIntegrityById.delete(id);
    villagerModelIntegrityById.delete(id);
    pendingPlayerHeadChecks.delete(id);
    publishModelIntegrityDataset();
    if (rendererReady) worldView.emit("entity", { ...prior, ...update, delete: true });
    scheduleTrustedNpcAvatarRebalance("entity-deleted");
    return;
  }

  const previous = entityCache.get(id) || {};
  const merged = { ...previous, ...update };
  if (Object.hasOwn(update, "metadata") && !Object.hasOwn(update, "identityName")) {
    delete merged.identityName;
    delete merged.identityKey;
  }
  const previousName = canonicalEntityName(previous.name);
  const updateName = canonicalEntityName(update.name);
  if ((!updateName || updateName === "unknown") && previousName && previousName !== "unknown") merged.name = previous.name;
  for (const dimension of ["width", "height"]) {
    if (finiteOr(update[dimension], 0) <= 0 && finiteOr(previous[dimension], 0) > 0) merged[dimension] = previous[dimension];
  }
  const normalized = normalizeEntity(merged);
  const previousRenderable = isRenderableEntity(previous);
  entityCache.set(id, normalized);
  fishingVisuals?.updateEntity(normalized);
  fishingVisuals?.sync();
  if (resolveCustomCharacterDefinition(normalized) || isOwnAvatarEntity(normalized)) {
    scheduleTrustedNpcAvatarRebalance("entity-updated");
  }
  let motionFrame = null;
  if (canonicalEntityName(normalized?.name) === "player") {
    const isMainAvatar = id === String(pendingAvatarState?.entity?.id ?? "");
    motionFrame = isMainAvatar && normalizedAvatarMotion
      ? normalizedAvatarMotion
      : normalizeMotionFrame(normalized, entityMotionFrames.get(id), Date.now());
    entityMotionFrames.set(id, motionFrame);
  }
  if (!rendererReady) return;
  if (!isRenderableEntity(normalized)) {
    if (previousRenderable) worldView.emit("entity", { ...previous, delete: true });
    if (isOwnAvatarEntity(normalized)) removeSelectedPlayerModel({ restoreNative: false, restoreRig: false });
    removeCustomCharacter(id);
    return;
  }
  if (canonicalEntityName(normalized.name) === "fishing_bobber") return;
  const isMove = movementOnly || (!update.name && !update.metadata && !update.equipment && !update.skinUrl);
  worldView.emit(isMove ? "entityMoved" : "entity",
    isMove ? normalized : rendererEntityEquipment(normalized, globalThis.mcData?.itemsByName));
  if (motionFrame) ensureAvatarRig(id, motionFrame);
  maybeApplyPlayerSkin(normalized);
  maybeApplySelectedPlayerModel(normalized);
  if (!isMove) schedulePlayerHeadIntegrityCheck(normalized, false);
  maybeApplyPaintingEntity(normalized);
  maybeApplyCustomCharacter(normalized);
  maybeApplyVillagerAppearance(normalized);
  if (id === focusedCharacterId) applyPosition(true);
  if (id === selectedNpcId) scheduleNpcPanelRender();
  if (id === dungeonHoverEntityId && dungeonHoverPointer) {
    const canvas = document.getElementById("viewer-canvas");
    if (canvas) scheduleDungeonHoverPick(canvas);
  }
}

function normalizeEntity(entity) {
  if (!entity || typeof entity !== "object") return null;
  const normalized = { ...entity };
  const pos = entity.pos || entity.position;
  if (pos) {
    normalized.pos = toVec3(pos);
    normalized.position = normalized.pos;
  }
  normalized.name = canonicalEntityName(entity.name) || "unknown";
  normalized.width = finiteOr(entity.width, 0.6);
  normalized.height = finiteOr(entity.height, 1.8);
  return normalized;
}

function isRenderableEntity(entity) {
  const name = canonicalEntityName(entity?.name);
  return Boolean(name && name !== "unknown" && finiteOr(entity?.width, 0) > 0 && finiteOr(entity?.height, 0) > 0);
}

function applyServerTime() {
  if (pendingTime === null) return;
  const light = minecraftLightLevels(pendingTime);
  if (viewer?.playerState?.reactive) {
    viewer.playerState.reactive.ambientLight = light.ambient;
    viewer.playerState.reactive.directionalLight = light.directional;
  }
  if (rendererReady && worldView) worldView.emit("time", pendingTime);
}

function applyServerWeather() {
  if (!rendererReady) return;
  viewer?.backend?.backendMethods?.setRain?.(pendingWeather.raining);
}

function maybeApplyPaintingEntity(entity) {
  if (entity?.id === undefined || entity?.id === null) return false;
  const id = String(entity.id);
  if (canonicalEntityName(entity.name) !== "painting") {
    removePaintingEntity(id);
    return false;
  }
  const variant = resolvePaintingVariant(entity);
  const signature = variant
    ? `${variant.id}:${variant.name}:${variant.width}x${variant.height}`
    : "unknown:1x1";
  const sceneEntity = globalThis.world?.entities?.entities?.[id];
  const currentNativeRoot = sceneEntity?.children?.find((child) => child.name === "mesh");
  const existing = paintingInstances.get(id);
  if (
    existing?.signature === signature
    && existing.sceneEntity === sceneEntity
    && existing.nativeRoot === currentNativeRoot
  ) {
    existing.root.visible = !isEntityInvisible(entity);
    if (existing.nativeRoot) existing.nativeRoot.visible = false;
    return true;
  }
  if (existing) removePaintingEntity(id);
  if (pendingPaintingChecks.get(id) === signature) return true;
  if (sceneEntity) {
    pendingPaintingChecks.delete(id);
    mountPaintingEntity(id, signature, entity, variant, sceneEntity, currentNativeRoot);
    return true;
  }
  pendingPaintingChecks.set(id, signature);
  schedulePaintingMount(id, signature, 0);
  return true;
}

function schedulePaintingMount(id, signature, attempt) {
  requestAnimationFrame(() => {
    if (pendingPaintingChecks.get(id) !== signature) return;
    const entity = entityCache.get(id);
    const variant = resolvePaintingVariant(entity);
    const currentSignature = variant
      ? `${variant.id}:${variant.name}:${variant.width}x${variant.height}`
      : "unknown:1x1";
    if (canonicalEntityName(entity?.name) !== "painting" || currentSignature !== signature) {
      pendingPaintingChecks.delete(id);
      return;
    }
    const sceneEntity = globalThis.world?.entities?.entities?.[id];
    const nativeRoot = sceneEntity?.children?.find((child) => child.name === "mesh");
    if (!sceneEntity && attempt < 7) {
      schedulePaintingMount(id, signature, attempt + 1);
      return;
    }
    pendingPaintingChecks.delete(id);
    if (!sceneEntity) return;
    mountPaintingEntity(id, signature, entity, variant, sceneEntity, nativeRoot);
  });
}

function mountPaintingEntity(id, signature, entity, suppliedVariant, sceneEntity, nativeRoot) {
  const variant = suppliedVariant ?? Object.freeze({
    id: null,
    name: "unknown",
    width: 1,
    height: 1,
    textureUrl: null,
  });
  const width = clampNumber(variant.width, 1, 4, 1);
  const height = clampNumber(variant.height, 1, 4, 1);
  const textureEntry = getPaintingTextureEntry(variant);
  const root = new Group();
  root.name = "__lantern_painting";
  root.visible = !isEntityInvisible(entity);
  root.userData.__lanternPaintingVariant = variant.name;
  root.userData.__lanternPaintingVariantId = variant.id;

  const frameGeometry = new BoxGeometry(width, height, 0.0625);
  const frameMaterial = new MeshBasicMaterial({ color: 0x3b2417, toneMapped: false });
  const frame = new Mesh(frameGeometry, frameMaterial);
  frame.name = "painting_frame";
  frame.castShadow = true;
  frame.receiveShadow = true;
  root.add(frame);

  const artGeometry = new PlaneGeometry(width, height);
  const artMaterial = new MeshBasicMaterial({
    map: textureEntry.texture,
    side: DoubleSide,
    toneMapped: false,
  });
  const art = new Mesh(artGeometry, artMaterial);
  art.name = "painting_art";
  art.position.z = -0.0315;
  art.rotation.y = Math.PI;
  art.renderOrder = 1;
  root.add(art);

  const instance = {
    id,
    signature,
    variant,
    sceneEntity,
    nativeRoot,
    nativeRootWasVisible: nativeRoot?.visible !== false,
    root,
    frame,
    frameGeometry,
    frameMaterial,
    art,
    artGeometry,
    artMaterial,
    textureEntry,
  };
  sceneEntity.add(root);
  if (nativeRoot) nativeRoot.visible = false;
  paintingInstances.set(id, instance);
  paintingRuntimeStats.mounted += 1;
}

function getPaintingTextureEntry(variant) {
  const cacheKey = variant.textureUrl || `fallback:${variant.name}`;
  const cached = paintingTextureCache.get(cacheKey);
  if (cached) return cached;
  const placeholder = createPaintingPlaceholderTexture(variant);
  const entry = {
    variant,
    texture: placeholder,
    status: variant.textureUrl ? "loading" : "fallback",
    error: null,
  };
  paintingTextureCache.set(cacheKey, entry);
  if (!variant.textureUrl) return entry;
  paintingRuntimeStats.textureLoads += 1;
  paintingTextureLoader.load(
    variant.textureUrl,
    (texture) => {
      if (paintingTextureCache.get(cacheKey) !== entry) {
        texture.dispose();
        return;
      }
      texture.colorSpace = NoColorSpace;
      texture.magFilter = NearestFilter;
      texture.minFilter = NearestFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      const previousTexture = entry.texture;
      entry.texture = texture;
      entry.status = "ready";
      entry.error = null;
      for (const instance of paintingInstances.values()) {
        if (instance.textureEntry !== entry) continue;
        instance.artMaterial.map = texture;
        instance.artMaterial.needsUpdate = true;
      }
      if (previousTexture !== texture) previousTexture.dispose();
    },
    undefined,
    (error) => {
      if (paintingTextureCache.get(cacheKey) !== entry) return;
      const message = paintingErrorMessage(error);
      entry.status = "fallback";
      entry.error = message;
      paintingRuntimeStats.textureFailures += 1;
      paintingRuntimeStats.lastError = message;
    },
  );
  return entry;
}

function createPaintingPlaceholderTexture(variant) {
  const width = clampNumber(variant.width, 1, 4, 1);
  const height = clampNumber(variant.height, 1, 4, 1);
  const canvas = document.createElement("canvas");
  canvas.width = width * 32;
  canvas.height = height * 32;
  const context = canvas.getContext("2d");
  const seed = String(variant.name || "painting")
    .split("")
    .reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 2166136261);
  const hue = seed % 360;
  context.imageSmoothingEnabled = false;
  context.fillStyle = `hsl(${hue} 34% 24%)`;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const tile = 8;
  for (let y = 0; y < canvas.height; y += tile) {
    for (let x = 0; x < canvas.width; x += tile) {
      const tone = ((x / tile) * 17 + (y / tile) * 29 + seed) % 3;
      context.fillStyle = tone === 0
        ? `hsl(${(hue + 28) % 360} 46% 42%)`
        : tone === 1
          ? `hsl(${(hue + 336) % 360} 38% 32%)`
          : `hsl(${hue} 28% 20%)`;
      context.fillRect(x, y, tile, tile);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = NoColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function removePaintingEntity(id) {
  const normalizedId = String(id);
  pendingPaintingChecks.delete(normalizedId);
  const instance = paintingInstances.get(normalizedId);
  if (!instance) return false;
  paintingInstances.delete(normalizedId);
  if (instance.nativeRoot) instance.nativeRoot.visible = instance.nativeRootWasVisible;
  instance.root.removeFromParent();
  instance.frameGeometry.dispose();
  instance.frameMaterial.dispose();
  instance.artGeometry.dispose();
  instance.artMaterial.dispose();
  paintingRuntimeStats.removed += 1;
  return true;
}

function disposeAllPaintingEntities() {
  for (const id of [...paintingInstances.keys()]) removePaintingEntity(id);
  pendingPaintingChecks.clear();
  for (const entry of paintingTextureCache.values()) entry.texture.dispose();
  paintingTextureCache.clear();
}

function paintingErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || "painting texture load failed");
  return message.slice(0, 220);
}

function scheduleTrustedNpcAvatarRebalance(reason = "entity-update", immediate = false) {
  trustedNpcAvatarLodStats.requests += 1;
  trustedNpcAvatarRebalanceReasons.add(String(reason || "entity-update"));
  if (trustedNpcAvatarRebalanceTimer !== null) {
    if (!immediate) {
      trustedNpcAvatarLodStats.coalescedRequests += 1;
      return;
    }
    clearTimeout(trustedNpcAvatarRebalanceTimer);
  }
  trustedNpcAvatarRebalanceTimer = setTimeout(() => {
    trustedNpcAvatarRebalanceTimer = null;
    rebalanceTrustedNpcAvatars();
  }, immediate ? 0 : TRUSTED_NPC_AVATAR_REBALANCE_MS);
}

function rebalanceTrustedNpcAvatars() {
  if (!rendererReady || document.hidden) return;
  const reasons = [...trustedNpcAvatarRebalanceReasons];
  trustedNpcAvatarRebalanceReasons.clear();
  const qualityMode = rendererPerformance.quality?.mode
    || adaptiveQualityController?.getSnapshot?.().mode
    || (qualityPreference === "auto" ? "balanced" : qualityPreference);
  const origin = latestPosition?.pos || resolveOwnAvatarEntity()?.pos || resolveOwnAvatarEntity()?.position || null;
  const candidates = [...entityCache.values()]
    .filter((entity) => !isOwnAvatarEntity(entity) && isRenderableEntity(entity))
    .filter((entity) => resolveCustomCharacterDefinition(entity))
    .map((entity) => {
      const id = String(entity.id);
      const position = entity.pos || entity.position;
      const measuredDistance = origin && position
        ? Math.hypot(
          finiteOr(position.x, 0) - finiteOr(origin.x, 0),
          finiteOr(position.y, 0) - finiteOr(origin.y, 0),
          finiteOr(position.z, 0) - finiteOr(origin.z, 0),
        )
        : Number.POSITIVE_INFINITY;
      const distance = isHighDetailCustomCharacter(customCharacterInstances.get(id))
        ? Math.max(0, measuredDistance - TRUSTED_NPC_MOUNTED_DISTANCE_HYSTERESIS)
        : measuredDistance;
      let priority = 0;
      if (id === String(selectedNpcId ?? "")) priority += TRUSTED_NPC_SELECTED_PRIORITY;
      if (id === String(focusedCharacterId ?? "")) priority += TRUSTED_NPC_FOCUSED_PRIORITY;
      return { id, priority, distance };
    });
  const nextIds = selectHighDetailNpcModelIds(candidates, qualityMode);
  const nextSelected = new Set(nextIds);
  const changed = nextSelected.size !== trustedNpcAvatarSelectedIds.size
    || [...nextSelected].some((id) => !trustedNpcAvatarSelectedIds.has(id));
  if (changed) {
    trustedNpcAvatarSelectedIds.clear();
    for (const id of nextIds) trustedNpcAvatarSelectedIds.add(id);
    trustedNpcAvatarLodStats.selectionChanges += 1;
    trustedNpcAvatarLodStats.generation += 1;
  }

  for (const [id, transition] of pendingTrustedNpcAvatarTransitions) {
    if (transition.target !== "trusted" || trustedNpcAvatarSelectedIds.has(id)) continue;
    if (pendingTrustedNpcAvatarTransitions.get(id) === transition) {
      pendingTrustedNpcAvatarTransitions.delete(id);
      trustedAvatarAssetPipeline.cancel(id);
      trustedNpcAvatarLodStats.pendingCanceled += 1;
    }
  }

  for (const [id, instance] of customCharacterInstances) {
    const entity = entityCache.get(id);
    const definition = resolveCustomCharacterDefinition(entity);
    if (!entity || !definition || isOwnAvatarEntity(entity)) continue;
    if (trustedNpcAvatarSelectedIds.has(id)) {
      ensureTrustedNpcAvatar(instance, entity, definition);
    } else if (isHighDetailCustomCharacter(instance)) {
      replaceTrustedNpcAvatarWithFallback(instance, entity, definition);
    }
  }

  trustedNpcAvatarLodStats.runs += 1;
  trustedNpcAvatarLodStats.eligible = candidates.length;
  trustedNpcAvatarLodStats.selected = trustedNpcAvatarSelectedIds.size;
  trustedNpcAvatarLodStats.mode = qualityMode;
  trustedNpcAvatarLodStats.budget = highDetailNpcModelBudget(qualityMode);
  trustedNpcAvatarLodStats.lastReason = reasons.join(",") || "scheduled";
  trustedNpcAvatarLodStats.lastRunAt = new Date().toISOString();
  refreshTrustedNpcAvatarMountedCounts();
}

function ensureTrustedNpcAvatar(fallbackInstance, entity, definition) {
  if (!fallbackInstance || isHighDetailCustomCharacter(fallbackInstance)) return false;
  const id = String(entity.id);
  const signature = customCharacterSignature(definition, entity);
  if (trustedNpcAvatarUpgradeFailures.get(id) === signature) {
    trustedNpcAvatarLodStats.failedUpgradeSkips += 1;
    return false;
  }
  if (trustedNpcAvatarUpgradeFailures.get(id) !== signature) trustedNpcAvatarUpgradeFailures.delete(id);
  const pending = pendingTrustedNpcAvatarTransitions.get(id);
  if (pending?.target === "trusted" && pending.signature === signature && pending.instance === fallbackInstance) {
    trustedNpcAvatarLodStats.pendingDeduplicated += 1;
    return true;
  }
  if (pending) {
    pendingTrustedNpcAvatarTransitions.delete(id);
    trustedAvatarAssetPipeline.cancel(id);
    trustedNpcAvatarLodStats.pendingCanceled += 1;
  }
  const token = Object.freeze({ target: "trusted", signature, instance: fallbackInstance });
  pendingTrustedNpcAvatarTransitions.set(id, token);
  trustedNpcAvatarLodStats.upgradesRequested += 1;
  scheduleTrustedAvatarAssetUpgrade(fallbackInstance, entity, definition, token);
  return true;
}

function replaceTrustedNpcAvatarWithFallback(instance, entity, definition) {
  const id = String(entity.id);
  if (!isHighDetailCustomCharacter(instance) || customCharacterInstances.get(id) !== instance) return false;
  if (trustedNpcAvatarSelectedIds.has(id)) {
    trustedNpcAvatarLodStats.staleSkips += 1;
    return false;
  }
  try {
    const created = createCustomCharacter(definition, entity);
    const replacement = {
      ...created,
      id,
      signature: instance.signature,
      sceneEntity: instance.sceneEntity,
      nativeRoot: instance.nativeRoot,
      nativeRootWasVisible: instance.nativeRootWasVisible,
      nativeMaterialVisibility: instance.nativeMaterialVisibility,
      nativeMaterialsHidden: instance.nativeMaterialsHidden,
      definition,
      visualProfile: resolveCharacterVisualProfile(definition),
    };
    created.root.visible = !isEntityInvisible(entity);
    instance.sceneEntity.add(created.root);
    trustedAvatarAssetPipeline.cancel(id);
    pendingTrustedNpcAvatarTransitions.delete(id);
    customCharacterInstances.set(id, replacement);
    instance.controller.dispose();
    hideNativeCharacterMaterials(replacement);
    publishCustomCharacterIntegrity(replacement, entity, definition);
    publishModelIntegrityDataset();
    trustedNpcAvatarLodStats.downgrades += 1;
    refreshTrustedNpcAvatarMountedCounts();
    return true;
  } catch (error) {
    trustedNpcAvatarLodStats.downgradeErrors += 1;
    trustedNpcAvatarLodStats.lastError = String(error instanceof Error ? error.message : error).slice(0, 220);
    return false;
  }
}

function isHighDetailCustomCharacter(instance) {
  return instance?.diagnostics?.modelKind === "trusted-local-glb"
    || instance?.diagnostics?.modelKind === "trusted-local-vrm";
}

function refreshTrustedNpcAvatarMountedCounts() {
  const instances = [...customCharacterInstances.values()];
  trustedNpcAvatarLodStats.highDetailMounted = instances.filter(isHighDetailCustomCharacter).length;
  trustedNpcAvatarLodStats.proceduralMounted = instances.length - trustedNpcAvatarLodStats.highDetailMounted;
}

function trustedNpcAvatarLodDiagnostics() {
  refreshTrustedNpcAvatarMountedCounts();
  return {
    ...trustedNpcAvatarLodStats,
    debounceMs: TRUSTED_NPC_AVATAR_REBALANCE_MS,
    pending: pendingTrustedNpcAvatarTransitions.size,
    selectedIds: [...trustedNpcAvatarSelectedIds],
    pendingIds: [...pendingTrustedNpcAvatarTransitions.keys()],
    failedIds: [...trustedNpcAvatarUpgradeFailures.keys()],
  };
}

function maybeApplyCustomCharacter(entity) {
  if (entity?.id === undefined || entity?.id === null) return false;
  const id = String(entity.id);
  if (isOwnAvatarEntity(entity)) {
    removeCustomCharacter(id);
    return false;
  }
  const definition = resolveCustomCharacterDefinition(entity);
  if (!definition) {
    removeCustomCharacter(id);
    return false;
  }
  const signature = customCharacterSignature(definition, entity);
  const sceneEntity = globalThis.world?.entities?.entities?.[id];
  const currentNativeRoot = sceneEntity?.children?.find((child) => child.name === "mesh");
  const existing = customCharacterInstances.get(id);
  if (existing?.signature === signature && existing.sceneEntity === sceneEntity) {
    if (!currentNativeRoot || existing.nativeRoot === currentNativeRoot) {
      existing.root.visible = !isEntityInvisible(entity);
      existing.controller.updateEntity(entity);
      // Full entity refreshes may attach replacement materials to the same
      // native root. Traverse again so the original villager cannot reappear
      // through the authored character and create a doubled model.
      hideNativeCharacterMaterials(existing);
      return true;
    }
  }
  if (existing) removeCustomCharacter(id);
  if (pendingCustomCharacterChecks.get(id) === signature) return true;
  pendingCustomCharacterChecks.set(id, signature);
  scheduleCustomCharacterMount(id, signature, 0);
  return true;
}

function scheduleCustomCharacterMount(id, signature, attempt) {
  requestAnimationFrame(() => {
    if (pendingCustomCharacterChecks.get(id) !== signature) return;
    const current = entityCache.get(id);
    const definition = resolveCustomCharacterDefinition(current);
    const currentSignature = definition ? customCharacterSignature(definition, current) : "";
    if (!definition || currentSignature !== signature) {
      pendingCustomCharacterChecks.delete(id);
      return;
    }
    const sceneEntity = globalThis.world?.entities?.entities?.[id];
    const nativeRoot = sceneEntity?.children?.find((child) => child.name === "mesh");
    if ((!sceneEntity || !nativeRoot) && attempt < 7) {
      scheduleCustomCharacterMount(id, signature, attempt + 1);
      return;
    }
    pendingCustomCharacterChecks.delete(id);
    if (!sceneEntity || !nativeRoot) return;
    const created = createCustomCharacter(definition, current);
    const instance = {
      ...created,
      id,
      signature,
      sceneEntity,
      nativeRoot,
      nativeRootWasVisible: nativeRoot.visible !== false,
      nativeMaterialVisibility: new Map(),
      nativeMaterialsHidden: false,
    };
    created.root.visible = !isEntityInvisible(current);
    sceneEntity.add(created.root);
    hideNativeCharacterMaterials(instance);
    customCharacterInstances.set(id, instance);
    publishCustomCharacterIntegrity(instance, current, definition);
    publishModelIntegrityDataset();
    refreshTrustedNpcAvatarMountedCounts();
    scheduleTrustedNpcAvatarRebalance("fallback-mounted");
  });
}

function scheduleTrustedAvatarAssetUpgrade(fallbackInstance, entity, definition, transitionToken) {
  const id = String(entity.id);
  const visualProfile = resolveCharacterVisualProfile(definition);
  void trustedAvatarAssetPipeline.mount({
    key: id,
    characterId: definition.id,
    entity,
    visualProfile,
    isCurrent: () => (
      pendingTrustedNpcAvatarTransitions.get(id) === transitionToken
      && trustedNpcAvatarSelectedIds.has(id)
      && customCharacterInstances.get(id) === fallbackInstance
      && entityCache.get(id)
      && customCharacterSignature(definition, entityCache.get(id)) === fallbackInstance.signature
      && fallbackInstance.sceneEntity === globalThis.world?.entities?.entities?.[id]
    ),
    install(created) {
      if (
        pendingTrustedNpcAvatarTransitions.get(id) !== transitionToken
        || !trustedNpcAvatarSelectedIds.has(id)
        || customCharacterInstances.get(id) !== fallbackInstance
      ) return false;
      const currentEntity = entityCache.get(id);
      if (!currentEntity || customCharacterSignature(definition, currentEntity) !== fallbackInstance.signature) return false;
      created.root.visible = !isEntityInvisible(currentEntity);
      fallbackInstance.sceneEntity.add(created.root);
      const replacement = {
        ...created,
        id,
        signature: fallbackInstance.signature,
        sceneEntity: fallbackInstance.sceneEntity,
        nativeRoot: fallbackInstance.nativeRoot,
        nativeRootWasVisible: fallbackInstance.nativeRootWasVisible,
        nativeMaterialVisibility: fallbackInstance.nativeMaterialVisibility,
        nativeMaterialsHidden: fallbackInstance.nativeMaterialsHidden,
        definition,
        visualProfile,
      };
      customCharacterInstances.set(id, replacement);
      fallbackInstance.controller.dispose();
      hideNativeCharacterMaterials(replacement);
      publishCustomCharacterIntegrity(replacement, currentEntity, definition);
      publishModelIntegrityDataset();
      return true;
    },
  }).then((result) => {
    if (pendingTrustedNpcAvatarTransitions.get(id) === transitionToken) {
      pendingTrustedNpcAvatarTransitions.delete(id);
      if (result.status === "fallback") trustedNpcAvatarUpgradeFailures.set(id, transitionToken.signature);
    }
    if (result.status === "mounted") trustedNpcAvatarLodStats.upgradesMounted += 1;
    else if (result.status === "fallback") trustedNpcAvatarLodStats.upgradeFallbacks += 1;
    else trustedNpcAvatarLodStats.staleSkips += 1;
    refreshTrustedNpcAvatarMountedCounts();
  }).catch((error) => {
    if (pendingTrustedNpcAvatarTransitions.get(id) === transitionToken) {
      pendingTrustedNpcAvatarTransitions.delete(id);
      trustedNpcAvatarUpgradeFailures.set(id, transitionToken.signature);
    }
    trustedNpcAvatarLodStats.upgradeErrors += 1;
    trustedNpcAvatarLodStats.lastError = String(error instanceof Error ? error.message : error).slice(0, 220);
  });
}

function publishCustomCharacterIntegrity(instance, entity, definition) {
  const diagnostics = instance.diagnostics;
  const authored = diagnostics.modelKind === "trusted-local-glb" || diagnostics.modelKind === "trusted-local-vrm";
  villagerModelIntegrityById.set(String(entity.id), {
    id: entity.id,
    entityType: canonicalEntityName(entity.name),
    username: entity.username || null,
    identityName: entity.identityName || definition.identityName || null,
    identityKey: entity.identityKey || definition.identityKey || null,
    characterId: definition.id,
    modelKind: diagnostics.modelKind,
    textureUv: diagnostics.textureUv,
    textureApplied: true,
    textureWidth: authored ? null : 16,
    textureHeight: authored ? null : 16,
    meshes: diagnostics.meshes,
    materials: diagnostics.materials,
    textures: diagnostics.textures,
    triangles: diagnostics.triangles,
    assetId: diagnostics.assetId || null,
    assetFormat: diagnostics.assetFormat || null,
    visualManifestId: diagnostics.visualManifestId || instance.visualProfile?.asset?.manifestId || null,
    partCounts: { ...diagnostics.partCounts },
    missingParts: [...diagnostics.missingParts],
    healthy: diagnostics.healthy,
    nativeModelSuppressed: true,
  });
}

function customCharacterSignature(definition, entity) {
  const entityIdentity = entity?.identityKey || entity?.username || entity?.displayName || "";
  return `${definition.id}:${String(entityIdentity)}`;
}

function hideNativeCharacterMaterials(instance) {
  if (instance.nativeRoot) instance.nativeRoot.visible = false;
  instance.nativeRoot?.traverse?.((object) => {
    if (!object?.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      if (!instance.nativeMaterialVisibility.has(material)) instance.nativeMaterialVisibility.set(material, material.visible !== false);
      material.visible = false;
    }
  });
  instance.nativeMaterialsHidden = true;
}

function removeCustomCharacter(id) {
  const normalizedId = String(id);
  pendingCustomCharacterChecks.delete(normalizedId);
  pendingTrustedNpcAvatarTransitions.delete(normalizedId);
  trustedNpcAvatarUpgradeFailures.delete(normalizedId);
  trustedNpcAvatarSelectedIds.delete(normalizedId);
  trustedAvatarAssetPipeline.cancel(normalizedId);
  const instance = customCharacterInstances.get(normalizedId);
  if (!instance) return;
  customCharacterInstances.delete(normalizedId);
  if (instance.nativeRoot) instance.nativeRoot.visible = instance.nativeRootWasVisible;
  for (const [material, wasVisible] of instance.nativeMaterialVisibility) material.visible = wasVisible;
  instance.controller.dispose();
  villagerModelIntegrityById.delete(normalizedId);
  refreshTrustedNpcAvatarMountedCounts();
  publishModelIntegrityDataset();
}

function disposeAllCustomCharacters() {
  for (const id of [...customCharacterInstances.keys()]) removeCustomCharacter(id);
  pendingCustomCharacterChecks.clear();
  pendingTrustedNpcAvatarTransitions.clear();
  trustedNpcAvatarUpgradeFailures.clear();
  trustedNpcAvatarSelectedIds.clear();
}

function installPlayerSkinBridge() {
  if (!dashboardOrigin || parent === window) return;
  window.addEventListener("message", (event) => {
    if (event.origin !== dashboardOrigin || event.source !== parent) return;
    const message = event.data;
    if (!message || typeof message !== "object" || Array.isArray(message) || message.schemaVersion !== 1) return;
    if (message.type === "lantern-avatar-appearance") {
      if (!isPlayerSkinId(message.skinId) || !isPlayerModelId(message.modelId)) return;
      const nextSkin = resolvePlayerSkin(message.skinId);
      const nextModel = resolvePlayerModel(message.modelId);
      if (nextSkin.id !== selectedPlayerSkin.id) {
        selectedPlayerSkin = nextSkin;
        playerSkinTargetSignatures.clear();
        playerSkinStatus = rendererReady ? "waiting-for-avatar" : "waiting-for-renderer";
        playerSkinLastError = null;
      }
      if (nextModel.id !== selectedPlayerModel.id) {
        selectedPlayerModel = nextModel;
        trustedAvatarAssetPipeline.cancel(PLAYER_MODEL_MOUNT_KEY);
        playerModelPendingSignature = null;
        playerModelFailedSignature = null;
        playerModelStatus = isFirstPersonView
          ? "first-person-hands"
          : rendererReady ? "waiting-for-avatar" : "waiting-for-renderer";
        playerModelLastError = null;
      }
      publishPlayerSkinDataset();
      publishPlayerModelDataset();
      applySelectedPlayerSkinToSelf(true);
      applySelectedPlayerModelToSelf(true);
      return;
    }
    if (message.type !== "lantern-avatar-skin" || !isPlayerSkinId(message.skinId)) return;
    const next = resolvePlayerSkin(message.skinId);
    if (next.id !== selectedPlayerSkin.id) {
      selectedPlayerSkin = next;
      playerSkinTargetSignatures.clear();
      playerSkinStatus = rendererReady ? "waiting-for-avatar" : "waiting-for-renderer";
      playerSkinLastError = null;
    }
    publishPlayerSkinDataset();
    applySelectedPlayerSkinToSelf(true);
  });
}

function applySelectedPlayerSkinToSelf(force = false) {
  if (!rendererReady) {
    playerSkinStatus = "waiting-for-renderer";
    publishPlayerSkinDataset();
    return false;
  }
  if (isFirstPersonView) {
    if (!pendingPlayerEntity) {
      playerSkinStatus = "waiting-for-avatar";
      publishPlayerSkinDataset();
      return false;
    }
    return maybeApplyPlayerSkin(pendingPlayerEntity, true, force);
  }
  const ownId = pendingAvatarState?.entity?.id;
  const ownEntity = (ownId === undefined || ownId === null ? null : entityCache.get(String(ownId)))
    ?? [...entityCache.values()].find((entity) => entity?.isSelf === true)
    ?? pendingAvatarState?.entity;
  if (!ownEntity) {
    playerSkinStatus = "waiting-for-avatar";
    publishPlayerSkinDataset();
    return false;
  }
  return maybeApplyPlayerSkin(ownEntity, false, force);
}

function maybeApplyPlayerSkin(entity, specialPlayerEntity = false, force = false) {
  if (canonicalEntityName(entity?.name) !== "player" || entity?.id === undefined || entity?.id === null) return false;
  if (specialPlayerEntity || entity.isSelf === true || entity.id === pendingAvatarState?.entity?.id) {
    return applyTrustedLocalPlayerSkin(entity, specialPlayerEntity, force);
  }
  const updatePlayerSkin = viewer?.backend?.backendMethods?.updatePlayerSkin;
  if ((!entity.skinUrl && !Object.hasOwn(entity, 'skinUrl')) || typeof updatePlayerSkin !== "function") return false;
  const skin = resolveEntityPlayerSkin(entity);
  const targetKey = `other:${String(entity.id)}`;
  const signature = `${skin.id}:${String(entity.id)}`;
  if (!force && playerSkinTargetSignatures.get(targetKey) === signature) return true;
  playerSkinTargetSignatures.set(targetKey, signature);
  void Promise.resolve(updatePlayerSkin.call(viewer.backend.backendMethods, entity.id, entity.username, entity.uuid, skin.texture))
    .then(() => {
      if (playerSkinTargetSignatures.get(targetKey) === signature) applyServerPlayerSkinModel(entity, false);
    }).catch(() => {
      if (playerSkinTargetSignatures.get(targetKey) === signature) playerSkinTargetSignatures.delete(targetKey);
    });
  return true;
}

function resolveEntityPlayerSkin(entity) {
  const hash = /^\/head-texture\/([0-9a-f]{40,64})\.png$/.exec(entity?.skinUrl || '')?.[1];
  if (!hash) return selectedPlayerSkin;
  const model = entity.skinModel === 'slim' ? 'slim' : 'classic';
  return { id: `server:${hash}:${model}`, label: '服务端皮肤', model, texture: entity.skinUrl };
}

function resolveSelfPlayerSkin() {
  return resolveEntityPlayerSkin(pendingAvatarState?.entity ?? pendingPlayerEntity);
}

function applyServerPlayerSkinModel(entity, specialPlayerEntity) {
  const entities = globalThis.world?.entities;
  const player = entities?.getPlayerObject?.(specialPlayerEntity ? 'player_entity' : entity.id);
  if (player?.skin) player.skin.modelType = resolveEntityPlayerSkin(entity).model === 'slim' ? 'slim' : 'default';
}

function applyTrustedLocalPlayerSkin(entity, specialPlayerEntity, force) {
  const backendMethods = viewer?.backend?.backendMethods;
  const applyOverride = backendMethods?.applyTemporaryPlayerSkinOverride;
  if (typeof applyOverride !== "function") {
    playerSkinStatus = "renderer-unsupported";
    publishPlayerSkinDataset();
    return false;
  }
  const targetKey = specialPlayerEntity ? "player_entity" : String(entity.id);
  const skin = resolveEntityPlayerSkin(entity);
  const signature = `${skin.id}:${String(entity.id)}`;
  if (!force && playerSkinTargetSignatures.get(targetKey) === signature) return true;
  playerSkinTargetSignatures.set(targetKey, signature);
  playerSkinStatus = "loading";
  playerSkinLastError = null;
  const sequence = ++playerSkinApplySequence;
  // A fragment is ignored by the decoded PNG payload but gives the renderer a
  // fresh cache identity. This lets a deliberate forced replay repair a late
  // asynchronous Steve fallback without accepting a new network URL.
  const textureUrl = `${skin.texture}#lantern-skin=${skin.id}&revision=${sequence}`;
  publishPlayerSkinDataset();
  void Promise.resolve(applyOverride.call(backendMethods, textureUrl, entity.id, entity.username, entity.uuid))
    .then(() => {
      if (playerSkinTargetSignatures.get(targetKey) !== signature) return;
      applyServerPlayerSkinModel(entity, specialPlayerEntity);
      playerSkinStatus = "applied";
      playerSkinLastAppliedAt = Date.now();
      playerSkinLastError = null;
      publishPlayerSkinDataset();
      postToDashboard({
        type: "lantern-avatar-skin-applied",
        schemaVersion: 1,
        skinId: skin.id,
        label: skin.label,
        status: "applied",
      });
      setTimeout(() => {
        if (playerSkinTargetSignatures.get(targetKey) !== signature) return;
        if (!specialPlayerEntity) maybeApplySelectedPlayerModel(entity);
        schedulePlayerHeadIntegrityCheck(entity, specialPlayerEntity);
        publishPlayerSkinDataset();
      }, 180);
    })
    .catch((error) => {
      if (playerSkinTargetSignatures.get(targetKey) === signature) playerSkinTargetSignatures.delete(targetKey);
      if (resolveSelfPlayerSkin().id !== skin.id) return;
      playerSkinStatus = "failed";
      playerSkinLastError = error instanceof Error ? error.message.slice(0, 160) : String(error).slice(0, 160);
      publishPlayerSkinDataset();
      postToDashboard({
        type: "lantern-avatar-skin-applied",
        schemaVersion: 1,
        skinId: skin.id,
        label: skin.label,
        status: "failed",
      });
    });
  return sequence > 0;
}

function publishPlayerSkinDataset() {
  const canvas = document.getElementById("viewer-canvas");
  if (!canvas) return;
  const skin = resolveSelfPlayerSkin();
  canvas.dataset.playerSkinId = skin.id;
  canvas.dataset.playerSkinLabel = skin.label;
  canvas.dataset.playerSkinModel = skin.model;
  canvas.dataset.playerSkinStatus = playerSkinStatus;
}

function isOwnAvatarEntity(entity) {
  if (canonicalEntityName(entity?.name) !== "player" || entity?.id === undefined || entity?.id === null) return false;
  if (entity.isSelf === true) return true;
  const ownId = pendingAvatarState?.entity?.id;
  return ownId !== undefined && ownId !== null && String(entity.id) === String(ownId);
}

function resolveOwnAvatarEntity() {
  const ownId = pendingAvatarState?.entity?.id;
  return (ownId === undefined || ownId === null ? null : entityCache.get(String(ownId)))
    ?? [...entityCache.values()].find((entity) => entity?.isSelf === true && canonicalEntityName(entity?.name) === "player")
    ?? pendingAvatarState?.entity
    ?? null;
}

function applySelectedPlayerModelToSelf(force = false) {
  if (isFirstPersonView) {
    const changed = removeSelectedPlayerModel({ restoreNative: true, restoreRig: false });
    const shouldAcknowledge = force || changed || playerModelStatus !== "first-person-hands";
    playerModelStatus = "first-person-hands";
    playerModelLastError = null;
    publishPlayerModelDataset();
    if (shouldAcknowledge) postPlayerModelResult("applied", "第一人称保留皮肤手臂与持物，完整模型将在外部视角显示");
    return true;
  }
  if (!rendererReady) {
    playerModelStatus = "waiting-for-renderer";
    publishPlayerModelDataset();
    return false;
  }
  if (selectedPlayerModel.kind === "minecraft-classic") {
    const changed = removeSelectedPlayerModel({ restoreNative: true, restoreRig: true });
    const shouldAcknowledge = force || changed || playerModelStatus !== "applied";
    playerModelStatus = "applied";
    playerModelLastError = null;
    playerModelLastAppliedAt = Date.now();
    publishPlayerModelDataset();
    if (shouldAcknowledge) postPlayerModelResult("applied", "已恢复原版方块人模型");
    return true;
  }
  const ownEntity = resolveOwnAvatarEntity();
  if (!ownEntity || !isOwnAvatarEntity(ownEntity)) {
    playerModelStatus = "waiting-for-avatar";
    publishPlayerModelDataset();
    return false;
  }
  return maybeApplySelectedPlayerModel(ownEntity, force);
}

function maybeApplySelectedPlayerModel(entity, force = false) {
  if (!isOwnAvatarEntity(entity)) return false;
  if (isFirstPersonView || selectedPlayerModel.kind === "minecraft-classic") {
    return applySelectedPlayerModelToSelf(force);
  }
  const id = String(entity.id);
  const sceneEntity = globalThis.world?.entities?.entities?.[id];
  const nativeRoot = sceneEntity?.children?.find((child) => child.name === "mesh") ?? null;
  const nativePlayerObject = sceneEntity?.playerObject ?? null;
  const signature = `${selectedPlayerModel.id}:${selectedPlayerModel.assetId}:${id}`;
  const existing = playerModelInstance;
  if (
    existing?.signature === signature
    && existing.sceneEntity === sceneEntity
    && existing.nativeRoot === nativeRoot
    && existing.nativePlayerObject === nativePlayerObject
  ) {
    existing.root.visible = !isEntityInvisible(entity);
    existing.controller.updateEntity(normalizedAvatarMotion ?? entity);
    hideNativePlayerBody(existing);
    playerModelStatus = "applied";
    playerModelLastError = null;
    publishPlayerModelDataset();
    return true;
  }
  if (existing?.signature === signature && existing.sceneEntity !== sceneEntity) {
    disposePlayerModelInstance(existing, { restoreNative: false });
  }
  if (force) playerModelFailedSignature = null;
  if (playerModelFailedSignature === signature) return true;
  if (playerModelPendingSignature === signature && !force) return true;
  playerModelPendingSignature = signature;
  playerModelStatus = sceneEntity && nativePlayerObject ? "loading" : "waiting-for-scene";
  playerModelLastError = null;
  publishPlayerModelDataset();
  schedulePlayerModelMount(id, signature, 0);
  return true;
}

function schedulePlayerModelMount(id, signature, attempt) {
  requestAnimationFrame(() => {
    if (playerModelPendingSignature !== signature) return;
    const entity = resolveOwnAvatarEntity();
    const expectedSignature = entity && isOwnAvatarEntity(entity)
      ? `${selectedPlayerModel.id}:${selectedPlayerModel.assetId}:${String(entity.id)}`
      : "";
    if (!entity || String(entity.id) !== id || expectedSignature !== signature || selectedPlayerModel.kind !== "trusted-avatar") {
      if (playerModelPendingSignature === signature) playerModelPendingSignature = null;
      return;
    }
    const sceneEntity = globalThis.world?.entities?.entities?.[id];
    const nativeRoot = sceneEntity?.children?.find((child) => child.name === "mesh") ?? null;
    const nativePlayerObject = sceneEntity?.playerObject ?? null;
    if ((!sceneEntity || !nativeRoot || !nativePlayerObject) && attempt < 12) {
      schedulePlayerModelMount(id, signature, attempt + 1);
      return;
    }
    if (!sceneEntity || !nativeRoot || !nativePlayerObject) {
      playerModelPendingSignature = null;
      playerModelFailedSignature = null;
      playerModelStatus = "waiting-for-scene";
      publishPlayerModelDataset();
      return;
    }
    mountSelectedPlayerModel({ id, signature, entity, sceneEntity, nativeRoot, nativePlayerObject });
  });
}

function mountSelectedPlayerModel({ id, signature, entity, sceneEntity, nativeRoot, nativePlayerObject }) {
  const model = selectedPlayerModel;
  const sequence = ++playerModelApplySequence;
  playerModelStatus = "loading";
  playerModelLastError = null;
  publishPlayerModelDataset();
  void trustedAvatarAssetPipeline.mountAsset({
    key: PLAYER_MODEL_MOUNT_KEY,
    assetId: model.assetId,
    entity: { ...entity, characterId: `player-model:${model.id}` },
    visualProfile: null,
    isCurrent: () => {
      const currentEntity = resolveOwnAvatarEntity();
      return selectedPlayerModel.id === model.id
        && playerModelPendingSignature === signature
        && currentEntity
        && String(currentEntity.id) === id
        && globalThis.world?.entities?.entities?.[id] === sceneEntity;
    },
    install(created) {
      if (selectedPlayerModel.id !== model.id || playerModelPendingSignature !== signature) return false;
      const previous = playerModelInstance;
      const transfersNativeState = previous?.sceneEntity === sceneEntity
        && previous.nativeRoot === nativeRoot
        && previous.nativePlayerObject === nativePlayerObject;
      const instance = {
        ...created,
        id,
        modelId: model.id,
        signature,
        sceneEntity,
        nativeRoot,
        nativePlayerObject,
        nativeBodyVisibility: transfersNativeState
          ? new Map(previous.nativeBodyVisibility)
          : new Map(),
        nativeCapeWasVisible: transfersNativeState
          ? previous.nativeCapeWasVisible
          : nativePlayerObject?.cape?.visible !== false,
        nativeBodySuppressed: false,
      };
      created.root.visible = !isEntityInvisible(resolveOwnAvatarEntity());
      sceneEntity.add(created.root);
      playerModelInstance = instance;
      hideNativePlayerBody(instance);
      if (previous) disposePlayerModelInstance(previous, { restoreNative: !transfersNativeState });
      removeAvatarRig(id);
      if (isFreeOrbitView && orbitDistance < minimumThirdPersonOrbitDistance()) {
        orbitDistance = minimumThirdPersonOrbitDistance();
        applyPosition(true);
      }
      playerModelPendingSignature = null;
      playerModelFailedSignature = null;
      playerModelStatus = "applied";
      playerModelLastAppliedAt = Date.now();
      playerModelLastError = null;
      publishPlayerModelDataset();
      postPlayerModelResult("applied", "第三人称与地牢视角已换用完整骨骼模型");
      return true;
    },
  }).then((result) => {
    if (selectedPlayerModel.id !== model.id || playerModelPendingSignature !== signature) return;
    if (result.status === "stale" || result.status === "mounted") return;
    playerModelPendingSignature = null;
    playerModelFailedSignature = signature;
    playerModelStatus = "failed";
    playerModelLastError = String(
      trustedAvatarAssetPipeline.getDiagnostics().lastError
      || "模型没有通过本地可用性或骨骼检查",
    ).slice(0, 180);
    publishPlayerModelDataset();
    postPlayerModelResult("failed", playerModelLastError);
  }).catch((error) => {
    if (selectedPlayerModel.id !== model.id || playerModelPendingSignature !== signature) return;
    playerModelPendingSignature = null;
    playerModelFailedSignature = signature;
    playerModelStatus = "failed";
    playerModelLastError = error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180);
    publishPlayerModelDataset();
    postPlayerModelResult("failed", playerModelLastError);
  });
  return sequence > 0;
}

function hideNativePlayerBody(instance) {
  const playerObject = instance?.sceneEntity?.playerObject;
  const nativeRoot = instance?.nativeRoot;
  if (!playerObject?.skin || !nativeRoot) return false;
  instance.nativePlayerObject = playerObject;
  // Keep the native hierarchy alive so hand items, entity transforms and the
  // non-mesh nametag continue to update. Suppress only renderable body/armor/
  // cape meshes; item meshes below custom_item_* remain visible.
  nativeRoot.traverse?.((object) => {
    if (!object?.isMesh || isInsideHeldItemRoot(object, nativeRoot)) return;
    if (!instance.nativeBodyVisibility.has(object)) instance.nativeBodyVisibility.set(object, object.visible !== false);
    object.visible = false;
  });
  if (playerObject.cape) {
    if (instance.nativeCapeWasVisible === undefined) instance.nativeCapeWasVisible = playerObject.cape.visible !== false;
    playerObject.cape.visible = false;
  }
  instance.nativeBodySuppressed = instance.nativeBodyVisibility.size > 0;
  return instance.nativeBodySuppressed;
}

function isInsideHeldItemRoot(object, skinRoot) {
  let current = object;
  while (current && current !== skinRoot) {
    if (String(current.name || "").startsWith("custom_item_")) return true;
    current = current.parent;
  }
  return false;
}

function restoreNativePlayerBody(instance) {
  if (!instance) return;
  for (const [object, wasVisible] of instance.nativeBodyVisibility ?? []) object.visible = wasVisible;
  if (instance.nativePlayerObject?.cape && instance.nativeCapeWasVisible !== undefined) {
    instance.nativePlayerObject.cape.visible = instance.nativeCapeWasVisible;
  }
  instance.nativeBodyVisibility?.clear?.();
  instance.nativeBodySuppressed = false;
}

function disposePlayerModelInstance(instance, options = {}) {
  if (!instance) return false;
  if (options.restoreNative !== false) restoreNativePlayerBody(instance);
  if (playerModelInstance === instance) playerModelInstance = null;
  instance.controller.dispose();
  return true;
}

function removeSelectedPlayerModel(options = {}) {
  trustedAvatarAssetPipeline.cancel(PLAYER_MODEL_MOUNT_KEY);
  playerModelPendingSignature = null;
  playerModelFailedSignature = null;
  const instance = playerModelInstance;
  if (!instance) return false;
  const id = instance.id;
  disposePlayerModelInstance(instance, { restoreNative: options.restoreNative !== false });
  if (options.restoreRig !== false && rendererReady && !isFirstPersonView) {
    ensureAvatarRig(id, motionFrameForRigKey(id));
  }
  return true;
}

function postPlayerModelResult(status, detail) {
  postToDashboard({
    type: "lantern-avatar-model-applied",
    schemaVersion: 1,
    modelId: selectedPlayerModel.id,
    label: selectedPlayerModel.label,
    status,
    detail: String(detail || "").slice(0, 180),
  });
}

function publishPlayerModelDataset() {
  const canvas = document.getElementById("viewer-canvas");
  if (!canvas) return;
  canvas.dataset.playerModelId = selectedPlayerModel.id;
  canvas.dataset.playerModelLabel = selectedPlayerModel.label;
  canvas.dataset.playerModelKind = selectedPlayerModel.kind;
  canvas.dataset.playerModelStatus = playerModelStatus;
  canvas.dataset.playerModelMounted = String(Boolean(playerModelInstance));
  canvas.dataset.playerModelAssetId = playerModelInstance?.asset?.id ?? selectedPlayerModel.assetId ?? "minecraft-classic";
}

function schedulePlayerHeadIntegrityCheck(entity, specialPlayerEntity) {
  if (canonicalEntityName(entity?.name) !== "player" || entity?.id === undefined || entity?.id === null) return;
  const diagnosticId = specialPlayerEntity ? "player_entity" : String(entity.id);
  if (pendingPlayerHeadChecks.has(diagnosticId)) return;
  pendingPlayerHeadChecks.add(diagnosticId);
  requestAnimationFrame(() => {
    pendingPlayerHeadChecks.delete(diagnosticId);
    inspectPlayerHeadIntegrity(entity, specialPlayerEntity, diagnosticId);
  });
}

function inspectPlayerHeadIntegrity(entity, specialPlayerEntity, diagnosticId) {
  const sceneEntity = specialPlayerEntity
    ? globalThis.world?.entities?.playerEntity
    : globalThis.world?.entities?.entities?.[String(entity.id)];
  const playerObject = sceneEntity?.playerObject;
  const head = playerObject?.skin?.head;
  const baseLayer = head?.innerLayer ?? head?.children?.find((child) => child.name === "inner");
  const hatLayer = head?.outerLayer ?? head?.children?.find((child) => child.name === "outer");
  const invisible = isEntityInvisible(entity);
  const headScaleValid = hasFiniteNonZeroScale(head);
  const baseLayerScaleValid = hasFiniteNonZeroScale(baseLayer);
  const baseLayerWasVisible = baseLayer ? baseLayer.visible !== false : null;
  const suppressedByPlayerModel = !specialPlayerEntity
    && playerModelInstance?.id === String(entity.id)
    && playerModelInstance.nativeBodySuppressed === true;
  let restoredBaseLayer = false;

  // The outer/hat layer and every transform are intentionally untouched. A
  // hidden base head is repaired only for a protocol-visible entity with a
  // complete, non-degenerate head hierarchy.
  if (!invisible && !suppressedByPlayerModel && head && baseLayer && headScaleValid && baseLayerScaleValid && baseLayer.visible === false) {
    baseLayer.visible = true;
    restoredBaseLayer = true;
  }

  const entry = {
    id: entity.id,
    sceneId: diagnosticId,
    sceneEntityFound: Boolean(sceneEntity),
    playerObjectFound: Boolean(playerObject),
    headGroupFound: Boolean(head),
    baseLayerFound: Boolean(baseLayer),
    hatLayerFound: Boolean(hatLayer),
    headScaleValid,
    baseLayerScaleValid,
    invisible,
    baseLayerWasVisible,
    baseLayerVisible: baseLayer ? baseLayer.visible !== false : null,
    hatLayerVisible: hatLayer ? hatLayer.visible !== false : null,
    suppressedByPlayerModel,
    restoredBaseLayer,
  };
  entry.healthy = entry.sceneEntityFound
    && entry.playerObjectFound
    && entry.headGroupFound
    && entry.baseLayerFound
    && entry.headScaleValid
    && entry.baseLayerScaleValid
    && (entry.invisible || entry.suppressedByPlayerModel || entry.baseLayerVisible);
  playerHeadIntegrityById.set(diagnosticId, entry);
  publishModelIntegrityDataset();
}

function hasFiniteNonZeroScale(object) {
  const scale = object?.scale;
  return Boolean(scale && [scale.x, scale.y, scale.z].every((value) => Number.isFinite(value) && Math.abs(value) > Number.EPSILON));
}

function isEntityInvisible(entity) {
  const metadata = entity?.metadata;
  const sharedFlags = Array.isArray(metadata) ? metadata[0] : metadata?.[0] ?? metadata?.["0"];
  return (finiteOr(sharedFlags, 0) & 0x20) !== 0;
}

function maybeApplyVillagerAppearance(entity) {
  if (canonicalEntityName(entity?.name) !== "villager" || entity?.id === undefined) return;
  if (resolveCustomCharacterDefinition(entity)) return;
  const id = String(entity.id);
  const renderedEntity = globalThis.world?.entities?.entities?.[id];
  const modelRoot = renderedEntity?.children?.find((child) => child.name === "mesh") ?? renderedEntity;
  const nativeRig = renderedEntity?.playerObject ? null : ensureNativeVillagerRig(modelRoot, entity);
  if (renderedEntity?.userData) {
    renderedEntity.userData.__lanternNativeVillagerRig = nativeRig;
  }
  const appearance = normalizeVillagerAppearance(entity.villagerAppearance) ?? decodeVillagerAppearance(entity.metadata);
  if (!appearance) return;
  const identityStyle = resolveVillagerIdentityStyle(entity);
  const styleKey = villagerTextureStyleKey(appearance, identityStyle);
  if (renderedEntity?.userData?.__lanternVillagerStyleKey === styleKey) {
    pendingVillagerStyleChecks.delete(id);
    viewerPerformanceCounters.skippedVillagerStyles += 1;
    return;
  }
  if (pendingVillagerStyleChecks.get(id) === styleKey) {
    viewerPerformanceCounters.skippedVillagerStyles += 1;
    return;
  }
  pendingVillagerStyleChecks.set(id, styleKey);
  void getVillagerTexture(appearance, identityStyle).then((template) => {
    requestAnimationFrame(() => {
      if (pendingVillagerStyleChecks.get(id) !== styleKey) return;
      pendingVillagerStyleChecks.delete(id);
      const current = entityCache.get(id);
      // Texture assembly is asynchronous. Re-check the entity kind at commit
      // time so a protocol-side entity id reuse can never put a villager UV
      // texture onto a newly-created player model.
      if (canonicalEntityName(current?.name) !== "villager") return;
      const currentAppearance = normalizeVillagerAppearance(current?.villagerAppearance) ?? decodeVillagerAppearance(current?.metadata);
      if (!currentAppearance) return;
      const currentIdentityStyle = resolveVillagerIdentityStyle(current);
      const currentKey = villagerTextureStyleKey(currentAppearance, currentIdentityStyle);
      if (currentKey !== styleKey) return;
      const sceneEntity = globalThis.world?.entities?.entities?.[id];
      if (!sceneEntity || sceneEntity.playerObject || sceneEntity.userData?.__lanternVillagerStyleKey === styleKey) return;
      const modelRoot = sceneEntity.children?.find((child) => child.name === "mesh") ?? sceneEntity;
      ensureNativeVillagerRig(modelRoot, current);
      const texture = template.clone();
      texture.needsUpdate = true;
      let applied = false;
      modelRoot.traverse?.((child) => {
        if (!child?.isMesh || !isVillagerModelPart(child.name)) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          if (!material || !("map" in material)) continue;
          material.map = texture;
          material.needsUpdate = true;
          applied = true;
        }
      });
      inspectVillagerModelIntegrity(current, sceneEntity, texture, applied);
      if (!applied) {
        texture.dispose();
        return;
      }
      sceneEntity.userData.__lanternVillagerTexture?.dispose?.();
      sceneEntity.userData.__lanternVillagerTexture = texture;
      sceneEntity.userData.__lanternVillagerStyleKey = styleKey;
      sceneEntity.userData.__lanternVillagerAppearance = appearance;
      sceneEntity.userData.__lanternVillagerIdentity = {
        name: current.identityName || null,
        key: current.identityKey || null,
        accent: currentIdentityStyle.accent,
      };
    });
  }).catch((error) => {
    if (pendingVillagerStyleChecks.get(id) === styleKey) pendingVillagerStyleChecks.delete(id);
    console.warn("村民职业贴图载入失败", error);
  });
}

function normalizeVillagerAppearance(value) {
  if (!value || typeof value !== "object") return null;
  const typeKey = String(value.typeKey || "");
  const professionKey = String(value.professionKey || "");
  const levelKey = String(value.levelKey || "");
  if (!VILLAGER_TYPE_KEYS.includes(typeKey) || !VILLAGER_PROFESSION_KEYS.includes(professionKey) || !VILLAGER_LEVEL_KEYS.includes(levelKey)) {
    return null;
  }
  return { ...value, typeKey, professionKey, levelKey };
}

function isVillagerModelPart(name) {
  return villagerModelParts.has(String(name || "").toLowerCase());
}

function inspectVillagerModelIntegrity(entity, sceneEntity, texture, textureApplied) {
  const partCounts = {};
  sceneEntity?.traverse?.((child) => {
    if (!child?.isMesh) return;
    const name = String(child.name || "").toLowerCase();
    if (!villagerModelParts.has(name)) return;
    partCounts[name] = (partCounts[name] || 0) + 1;
  });
  const missingParts = [...villagerModelMinimumParts]
    .filter(([name, minimum]) => (partCounts[name] || 0) < minimum)
    .map(([name]) => name);
  const image = texture?.image ?? texture?.source?.data;
  const textureWidth = Number(image?.width);
  const textureHeight = Number(image?.height);
  const entry = {
    id: entity.id,
    identityName: entity.identityName || null,
    identityKey: entity.identityKey || null,
    modelKind: "villager-obj",
    textureUv: "villager-64x64-layered",
    textureApplied,
    textureWidth: Number.isFinite(textureWidth) ? textureWidth : null,
    textureHeight: Number.isFinite(textureHeight) ? textureHeight : null,
    partCounts,
    missingParts,
  };
  entry.healthy = textureApplied
    && textureWidth === 64
    && textureHeight === 64
    && missingParts.length === 0;
  villagerModelIntegrityById.set(String(entity.id), entry);
  if (sceneEntity?.userData) sceneEntity.userData.__lanternVillagerModelIntegrity = entry;
  publishModelIntegrityDataset();
}

function publishModelIntegrityDataset() {
  const canvas = document.getElementById("viewer-canvas");
  if (!canvas) return;
  const playerEntries = [...playerHeadIntegrityById.values()];
  const villagerEntries = [...villagerModelIntegrityById.values()];
  const expectedCustomCharacters = [...entityCache.values()].filter((entity) => resolveCustomCharacterDefinition(entity)).length;
  const customEntries = [...customCharacterInstances.values()];
  canvas.dataset.playerHeadsChecked = String(playerEntries.length);
  canvas.dataset.playerHeadsHealthy = String(playerEntries.filter((entry) => entry.healthy).length);
  canvas.dataset.playerHeadsRepaired = String(playerEntries.filter((entry) => entry.restoredBaseLayer).length);
  canvas.dataset.villagerModelsChecked = String(villagerEntries.length);
  canvas.dataset.villagerModelsHealthy = String(villagerEntries.filter((entry) => entry.healthy).length);
  canvas.dataset.villagerModelsMissingParts = String(villagerEntries.reduce(
    (total, entry) => total + entry.missingParts.length,
    0,
  ));
  canvas.dataset.originalCharactersRegistered = String(CUSTOM_CHARACTER_DEFINITIONS.length);
  canvas.dataset.originalCharactersExpected = String(expectedCustomCharacters);
  canvas.dataset.originalCharactersMounted = String(customEntries.length);
  canvas.dataset.originalCharactersHealthy = String(customEntries.filter((entry) => entry.diagnostics.healthy).length);
}

function resolveVillagerIdentityStyle(entity) {
  const identityName = typeof entity?.identityName === "string" ? entity.identityName.slice(0, 96) : "";
  const identityKey = typeof entity?.identityKey === "string" ? entity.identityKey.slice(0, 80) : "";
  if (!identityName && !identityKey) return { key: "vanilla", accent: null, opacity: 0 };
  const knownAccent = villagerIdentityConceptColors.get(identityName);
  const verifiedDefinition = resolveCustomCharacterDefinition(entity);
  if (knownAccent && verifiedDefinition?.identityKey === identityKey) {
    return { key: identityKey, accent: knownAccent, opacity: 0.3 };
  }
  // A server-supplied display name is not authority to recolour a vanilla
  // villager. Unknown or identity-key-mismatched residents keep Mojang's exact
  // biome/profession palette instead of receiving an arbitrary hash tint.
  return { key: "vanilla", accent: null, opacity: 0 };
}

function villagerTextureStyleKey(appearance, identityStyle) {
  return `${appearance.typeKey}:${appearance.professionKey}:${appearance.levelKey}:${identityStyle.key}`;
}

function getVillagerTexture(appearance, identityStyle) {
  const styleKey = villagerTextureStyleKey(appearance, identityStyle);
  if (!villagerTextureCache.has(styleKey)) {
    villagerTextureCache.set(styleKey, buildVillagerTexture(appearance, identityStyle));
  }
  return villagerTextureCache.get(styleKey);
}

async function buildVillagerTexture(appearance, identityStyle) {
  const root = "/textures/1.21.1/entity/villager";
  const baseImage = await loadTextureBitmap(`${root}/villager.png`);
  const typeImage = await loadTextureBitmap(`${root}/type/${appearance.typeKey}.png`);
  const layerPlan = villagerTextureLayerPlan(appearance);
  let professionImage = null;
  let levelImage = null;
  if (layerPlan.hasProfession) {
    professionImage = await loadTextureBitmap(`${root}/profession/${layerPlan.professionKey}.png`);
  }
  if (layerPlan.hasTradeLevel) {
    levelImage = await loadTextureBitmap(`${root}/profession_level/${layerPlan.levelKey}.png`);
  }
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.drawImage(baseImage, 0, 0, 64, 64);
  drawVillagerLayer(context, typeImage, professionImage ? null : identityStyle);
  if (professionImage) drawVillagerLayer(context, professionImage, identityStyle);
  if (levelImage) context.drawImage(levelImage, 0, 0, 64, 64);
  for (const image of [baseImage, typeImage, professionImage, levelImage]) image?.close?.();
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.flipY = false;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function drawVillagerLayer(context, image, identityStyle) {
  if (!identityStyle?.accent || identityStyle.opacity <= 0) {
    context.drawImage(image, 0, 0, 64, 64);
    return;
  }
  const layer = document.createElement("canvas");
  layer.width = 64;
  layer.height = 64;
  const layerContext = layer.getContext("2d");
  layerContext.imageSmoothingEnabled = false;
  layerContext.drawImage(image, 0, 0, 64, 64);
  // Tint only pixels owned by the villager biome/profession layer. The base
  // face, nose and skin remain untouched, which is impossible when a player
  // UV skin is incorrectly stretched over villager geometry.
  layerContext.globalCompositeOperation = "source-atop";
  layerContext.globalAlpha = identityStyle.opacity;
  layerContext.fillStyle = identityStyle.accent;
  layerContext.fillRect(0, 0, 64, 64);
  layerContext.globalAlpha = 1;
  layerContext.globalCompositeOperation = "source-over";
  context.drawImage(layer, 0, 0, 64, 64);
}

async function loadTextureBitmap(url) {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return createImageBitmap(await response.blob());
}

function normalizeChunk(data) {
  const minY = Number.isFinite(data.worldConfig?.minY) ? data.worldConfig.minY : -64;
  const worldHeight = Number.isFinite(data.worldConfig?.worldHeight) ? data.worldConfig.worldHeight : 384;
  return {
    ...data,
    blockEntities: data.blockEntities && typeof data.blockEntities === "object" ? data.blockEntities : {},
    isLightUpdate: data.isLightUpdate === true,
    worldConfig: { minY, worldHeight },
  };
}

function normalizePositionPacket(data) {
  const pos = toVec3(data?.pos || data || { x: 0, y: 64, z: 0 });
  return {
    pos,
    yaw: finiteOr(data?.yaw, 0),
    pitch: finiteOr(data?.pitch, usesWorldAvatar ? -0.22 : 0),
  };
}

function installOrbitControls() {
  if (!isFreeOrbitView) return;
  const canvas = document.getElementById("viewer-canvas");
  if (!canvas) return;
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "自由观察镜头；仅移动镜头，不控制游戏角色");
  canvas.style.cursor = "grab";
  canvas.style.touchAction = "none";
  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && ![0, 1, 2].includes(event.button)) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    if (event.pointerType === "touch") {
      activeTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (activeTouchPointers.size >= 2) {
        touchGesture = createTouchGesture();
        dragging = false;
      }
    }
    dragging = true;
    pointerId = event.pointerId;
    pointerX = event.clientX;
    pointerY = event.clientY;
    dragMode = event.button === 1 || event.button === 2 || event.shiftKey ? "pan" : "rotate";
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = dragMode === "pan" ? "move" : "grabbing";
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" && activeTouchPointers.has(event.pointerId)) {
      activeTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (activeTouchPointers.size >= 2) {
        applyTouchGesture();
        return;
      }
    }
    if (!dragging || event.pointerId !== pointerId) return;
    const dx = event.clientX - pointerX;
    const dy = event.clientY - pointerY;
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (dragMode === "pan") {
      const scale = Math.max(0.004, orbitDistance * 0.0025);
      orbitPanX = clampNumber(orbitPanX - dx * scale, -maximumOrbitPan, maximumOrbitPan, 0);
      orbitPanY = clampNumber(orbitPanY + dy * scale, -maximumOrbitPan, maximumOrbitPan, 0);
    } else {
      orbitYaw -= dx * 0.006;
      orbitPitch = clampNumber(orbitPitch - dy * 0.005, -1.25, 1.1, -0.22);
    }
    applyPosition(true);
  });
  const finish = (event) => {
    if (event.pointerType === "touch") {
      activeTouchPointers.delete(event.pointerId);
      touchGesture = null;
      const remaining = activeTouchPointers.entries().next().value;
      if (remaining) {
        pointerId = remaining[0];
        pointerX = remaining[1].x;
        pointerY = remaining[1].y;
        dragMode = "rotate";
        dragging = true;
        return;
      }
    }
    if (event.pointerId === pointerId) {
      dragging = false;
      pointerId = null;
      canvas.style.cursor = "grab";
    }
  };
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", finish);
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 120 : 1);
      orbitDistance = clampNumber(
        orbitDistance * Math.exp(clampNumber(delta, -240, 240, 0) * 0.0018),
        minimumThirdPersonOrbitDistance(),
        maximumOrbitDistance,
        4,
      );
      applyPosition(true);
    },
    { passive: false },
  );
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("dblclick", () => {
    if (manualControlActive) return;
    orbitInitialized = false;
    orbitDistance = 4;
    orbitPanX = 0;
    orbitPanY = 0;
    observerOffset = new Vec3(0, 0, 0);
    returnCameraToAvatar({ announce: false });
    applyPosition(true);
  });
  const cameraKeyCodes = new Set([
    "KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE",
    "Space", "ControlLeft", "ControlRight",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight",
  ]);
  canvas.addEventListener("keydown", (event) => {
    if (!cameraKeyCodes.has(event.code)) return;
    if (manualControlActive && [
      "KeyW", "KeyA", "KeyS", "KeyD", "Space", "ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight",
    ].includes(event.code)) return;
    event.preventDefault();
    if (["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "Space", "ControlLeft", "ControlRight"].includes(event.code)) {
      returnCameraToAvatar({ announce: false });
    }
    observerKeys.add(event.code);
    startObserverKeyboardLoop();
  });
  window.addEventListener("keyup", (event) => observerKeys.delete(event.code));
  window.addEventListener("blur", () => observerKeys.clear());
}

function installManualControls() {
  const canvas = document.getElementById("viewer-canvas");
  const overlay = document.getElementById("manual-viewer-overlay");
  const stick = document.getElementById("touch-stick");
  const stickKnob = document.getElementById("touch-stick-knob");
  const jump = document.getElementById("touch-jump");
  const sprint = document.getElementById("touch-sprint");
  const stop = document.getElementById("touch-stop");
  if (!canvas || !overlay || !stick || !stickKnob || !jump || !sprint || !stop || !dashboardOrigin) return;
  canvas.tabIndex = 0;

  window.addEventListener("message", (event) => {
    if (event.origin !== dashboardOrigin || event.source !== parent || event.data?.type !== "lantern-manual-state") return;
    const wasActive = manualControlActive;
    if (event.data.stopLatched === true) manualStopLatched = true;
    else if (event.data.active !== true) manualStopLatched = false;
    manualControlActive = event.data.active === true;
    manualControlPhase = String(event.data.phase || "observe");
    overlay.classList.toggle("is-active", manualControlActive);
    overlay.setAttribute("aria-hidden", String(!manualControlActive));
    if (manualControlActive && !wasActive) {
      closeNpcPanel();
      manualLookYaw = finiteOr(pendingAvatarState?.entity?.yaw, latestPosition?.yaw ?? 0);
      manualLookPitch = finiteOr(pendingAvatarState?.entity?.pitch, latestPosition?.pitch ?? 0);
      lastManualMotionEngaged = false;
      lastManualInputSignature = "";
      observerKeys.clear();
      canvas.focus({ preventScroll: true });
      startManualInputLoop();
      if (isDungeonView && dungeonHoverPointer) scheduleDungeonPointerLook(canvas);
    } else if (!manualControlActive && wasActive) {
      resetManualInputs(true);
    }
    if (["navigating", "attacking", "interacting"].includes(manualControlPhase)) lastManualMotionEngaged = false;
    if (manualControlActive && dungeonPointerLookActive) startManualInputLoop();
    updateManualHelp();
  });

  canvas.addEventListener("click", (event) => {
    if (!isFirstPersonView || !manualControlActive || event.button !== 0 || firstPersonPointerLocked) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    try {
      const request = canvas.requestPointerLock?.();
      if (request && typeof request.catch === "function") request.catch(() => undefined);
    } catch {
      // Pointer-lock denial leaves takeover active and keyboard control usable.
    }
  });
  document.addEventListener("pointerlockchange", () => {
    const wasLocked = firstPersonPointerLocked;
    firstPersonPointerLocked = isFirstPersonView && document.pointerLockElement === canvas;
    canvas.dataset.pointerLock = firstPersonPointerLocked ? "locked" : "unlocked";
    if (firstPersonPointerLocked) {
      manualLookYaw = finiteOr(pendingAvatarState?.entity?.yaw, latestPosition?.yaw ?? manualLookYaw);
      manualLookPitch = finiteOr(pendingAvatarState?.entity?.pitch, latestPosition?.pitch ?? manualLookPitch);
      lastManualInputSignature = "";
      startManualInputLoop();
    } else if (wasLocked && manualControlActive) {
      stopFirstPersonManualMotion();
    }
    updateManualHelp();
  });
  document.addEventListener("pointerlockerror", () => {
    canvas.dataset.pointerLock = "denied";
    updateManualHelp();
  });
  document.addEventListener("mousemove", (event) => {
    if (!manualControlActive || !firstPersonPointerLocked) return;
    manualLookYaw = normalizeRadians(manualLookYaw - finiteOr(event.movementX, 0) * FIRST_PERSON_MOUSE_SENSITIVITY);
    manualLookPitch = clampNumber(
      manualLookPitch + finiteOr(event.movementY, 0) * FIRST_PERSON_MOUSE_SENSITIVITY,
      -1.5,
      1.5,
      0,
    );
    applyManualFirstPersonLook();
    startManualInputLoop();
  });

  const manualCodes = new Set([
    "KeyW", "KeyA", "KeyS", "KeyD", "KeyY", "Space", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "Escape",
  ]);
  window.addEventListener("keydown", (event) => {
    if (!manualControlActive || !manualCodes.has(event.code)) return;
    event.preventDefault();
    if (event.code === "KeyY") {
      clearPendingGroundTap();
      postToDashboard({ type: "lantern-control-release" });
      return;
    }
    if (event.code === "Escape") {
      clearPendingGroundTap();
      if (isFirstPersonView) {
        stopFirstPersonManualMotion();
        if (document.pointerLockElement === canvas) document.exitPointerLock?.();
      } else {
        manualStopLatched = true;
        lastManualMotionEngaged = false;
        postToDashboard({ type: "lantern-control-release" });
      }
      return;
    }
    manualKeys.add(event.code);
    startManualInputLoop();
  });
  window.addEventListener("keyup", (event) => {
    if (!manualCodes.has(event.code)) return;
    manualKeys.delete(event.code);
    if (manualControlActive) startManualInputLoop();
  });
  window.addEventListener("blur", () => {
    if (!manualControlActive) return;
    resetManualInputs(false);
    postToDashboard({ type: "lantern-viewer-blur" });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && manualControlActive) {
      clearPendingGroundTap();
      postToDashboard({ type: "lantern-control-release" });
    }
  });
  window.addEventListener("pagehide", () => {
    if (manualControlActive) {
      clearPendingGroundTap();
      postToDashboard({ type: "lantern-control-release" });
    }
  });

  stick.addEventListener("pointerdown", (event) => {
    if (!manualControlActive || touchStickPointer !== null) return;
    event.preventDefault();
    event.stopPropagation();
    touchStickPointer = event.pointerId;
    stick.setPointerCapture(event.pointerId);
    updateTouchStick(event, stick, stickKnob);
    startManualInputLoop();
  });
  stick.addEventListener("pointermove", (event) => {
    if (event.pointerId !== touchStickPointer) return;
    event.preventDefault();
    event.stopPropagation();
    updateTouchStick(event, stick, stickKnob);
  });
  const releaseStick = (event) => {
    if (event.pointerId !== touchStickPointer) return;
    event.preventDefault();
    event.stopPropagation();
    touchStickPointer = null;
    touchMove = { forward: 0, strafe: 0 };
    stickKnob.style.transform = "translate(-50%,-50%)";
  };
  stick.addEventListener("pointerup", releaseStick);
  stick.addEventListener("pointercancel", releaseStick);

  const setJump = (enabled, event) => {
    event?.preventDefault();
    event?.stopPropagation();
    touchJump = enabled && manualControlActive;
    jump.classList.toggle("is-active", touchJump);
    if (manualControlActive) startManualInputLoop();
  };
  jump.addEventListener("pointerdown", (event) => setJump(true, event));
  jump.addEventListener("pointerup", (event) => setJump(false, event));
  jump.addEventListener("pointercancel", (event) => setJump(false, event));
  sprint.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    touchSprint = !touchSprint;
    sprint.classList.toggle("is-active", touchSprint);
    sprint.setAttribute("aria-pressed", String(touchSprint));
    startManualInputLoop();
  });
  stop.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    manualStopLatched = true;
    lastManualMotionEngaged = false;
    lastManualInputSignature = "";
    clearPendingGroundTap();
    postToDashboard({ type: "lantern-control-stop" });
    startManualInputLoop();
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (isDungeonView || isFirstPersonView || !manualControlActive || event.button !== 0) return;
    if (event.pointerType === "touch") manualCanvasTouchPointers.add(event.pointerId);
    if (event.pointerType === "touch" && manualCanvasTouchPointers.size > 1) {
      clearPendingGroundTap();
      return;
    }
    tapCandidate = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      at: performance.now(),
      moved: false,
    };
  });
  canvas.addEventListener("pointermove", (event) => {
    if (isDungeonView || isFirstPersonView) return;
    if (event.pointerType === "touch" && manualCanvasTouchPointers.size > 1) {
      clearPendingGroundTap();
      return;
    }
    if (!tapCandidate || tapCandidate.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - tapCandidate.x, event.clientY - tapCandidate.y) > 6) tapCandidate.moved = true;
  });
  canvas.addEventListener("pointerup", (event) => {
    if (isDungeonView || isFirstPersonView) return;
    const candidate = tapCandidate;
    tapCandidate = null;
    if (event.pointerType === "touch") manualCanvasTouchPointers.delete(event.pointerId);
    if (!manualControlActive || !candidate || candidate.pointerId !== event.pointerId || candidate.moved) return;
    if (performance.now() - candidate.at > 350) return;
    sendGroundRay(canvas, event.clientX, event.clientY);
  });
  canvas.addEventListener("pointercancel", (event) => {
    if (event.pointerType === "touch") manualCanvasTouchPointers.delete(event.pointerId);
    clearPendingGroundTap();
  });
  canvas.addEventListener("dblclick", () => {
    clearPendingGroundTap();
  });
  window.addEventListener("gamepadconnected", () => publishGamepadStatus(true));
  window.addEventListener("gamepaddisconnected", () => publishGamepadStatus(false));
  postToDashboard({ type: "lantern-viewer-ready", viewMode });
}

function applyManualFirstPersonLook() {
  if (!isFirstPersonView || !manualControlActive || !rendererReady || !viewer || !latestPosition) return false;
  viewer.updateCamera(latestPosition.pos, manualLookYaw, manualLookPitch, { instant: true });
  const canvas = document.getElementById("viewer-canvas");
  setElementDataset(canvas, "manualLookYaw", Math.round(manualLookYaw * 1_000) / 1_000);
  setElementDataset(canvas, "manualLookPitch", Math.round(manualLookPitch * 1_000) / 1_000);
  return true;
}

function stopFirstPersonManualMotion() {
  if (!isFirstPersonView || !manualControlActive) return false;
  const alreadyStopped = manualStopLatched && !lastManualMotionEngaged && manualKeys.size === 0;
  manualKeys.clear();
  manualStopLatched = true;
  lastManualMotionEngaged = false;
  lastManualInputSignature = "";
  if (!alreadyStopped) postToDashboard({ type: "lantern-control-stop" });
  startManualInputLoop();
  return true;
}

function updateTouchStick(event, stick, knob) {
  const rect = stick.getBoundingClientRect();
  const radius = Math.max(20, Math.min(rect.width, rect.height) * 0.37);
  let x = event.clientX - (rect.left + rect.width / 2);
  let y = event.clientY - (rect.top + rect.height / 2);
  const length = Math.hypot(x, y);
  if (length > radius) {
    x *= radius / length;
    y *= radius / length;
  }
  touchMove = { forward: clampNumber(-y / radius, -1, 1, 0), strafe: clampNumber(x / radius, -1, 1, 0) };
  knob.style.transform = `translate(calc(-50% + ${x.toFixed(1)}px),calc(-50% + ${y.toFixed(1)}px))`;
}

function startManualInputLoop() {
  if (!manualControlActive || manualInputFrame !== null) return;
  if (manualIdleTimer !== null) {
    clearTimeout(manualIdleTimer);
    manualIdleTimer = null;
  }
  if (manualInputFrameTime <= 0) manualInputFrameTime = performance.now();
  manualInputFrame = requestAnimationFrame(updateManualInput);
}

function scheduleManualInputLoop(continuous) {
  if (!manualControlActive) return;
  if (continuous) {
    manualInputFrame = requestAnimationFrame(updateManualInput);
    return;
  }
  if (manualIdleTimer !== null) return;
  manualIdleTimer = setTimeout(() => {
    manualIdleTimer = null;
    startManualInputLoop();
  }, 50);
}

let lastManualInputSignature = "";
function updateManualInput(now) {
  manualInputFrame = null;
  if (!manualControlActive) return;
  const elapsed = clampNumber((now - manualInputFrameTime) / 1_000, 0, 0.05, 0.016);
  manualInputFrameTime = now;
  const keyboard = {
    forward: (manualKeys.has("KeyW") ? 1 : 0) - (manualKeys.has("KeyS") ? 1 : 0),
    strafe: (manualKeys.has("KeyD") ? 1 : 0) - (manualKeys.has("KeyA") ? 1 : 0),
    jump: manualKeys.has("Space"),
    sprint: manualKeys.has("ShiftLeft") || manualKeys.has("ShiftRight"),
    sneak: manualKeys.has("ControlLeft") || manualKeys.has("ControlRight"),
  };
  const gamepad = sampleGamepad(elapsed);
  const touchMagnitude = Math.hypot(touchMove.forward, touchMove.strafe);
  const keyboardMagnitude = Math.hypot(keyboard.forward, keyboard.strafe);
  const gamepadMagnitude = Math.hypot(gamepad.forward, gamepad.strafe);
  const gamepadAxisEngaged = gamepadMagnitude > 0.02;
  const touchAxisEngaged = touchMagnitude > 0.02;
  const keyboardAxisEngaged = keyboardMagnitude > 0.02;
  let source = gamepadAxisEngaged
    ? "gamepad"
    : touchAxisEngaged
      ? "touch"
      : keyboardAxisEngaged
        ? "keyboard"
        : gamepad.jump || gamepad.sneak || (isFirstPersonView && gamepad.looking)
          ? "gamepad"
          : touchJump
            ? "touch"
            : "keyboard";
  const selectedAxis = gamepadAxisEngaged
    ? gamepad
    : touchAxisEngaged
      ? touchMove
      : keyboard;
  const actualYaw = finiteOr(pendingAvatarState?.entity?.yaw, latestPosition?.yaw ?? 0);
  const actualPitch = finiteOr(pendingAvatarState?.entity?.pitch, latestPosition?.pitch ?? 0);
  const firstPersonDirectLooking = isFirstPersonView && (gamepad.looking || firstPersonPointerLocked);
  if (isFirstPersonView && !firstPersonDirectLooking) {
    manualLookYaw = actualYaw;
    manualLookPitch = actualPitch;
  }
  const jump = gamepad.jump || touchJump || keyboard.jump;
  const sneak = gamepad.sneak || keyboard.sneak;
  const sprint = gamepad.sprint || touchSprint || keyboard.sprint;
  const characterEngaged = gamepadAxisEngaged || touchAxisEngaged || keyboardAxisEngaged || jump || sneak;
  const rawControlsNeutral = !characterEngaged && !sprint && gamepad.stopPressed !== true;
  if (manualStopLatched) {
    if (rawControlsNeutral) manualStopLatched = false;
    else {
      lastManualMotionEngaged = false;
      scheduleManualInputLoop(true);
      return;
    }
  }
  const dungeonPointerLooking = isDungeonView && dungeonPointerLookActive;
  const directLooking = firstPersonDirectLooking || dungeonPointerLooking;
  const lookOnly = directLooking
    && manualControlPhase !== "navigating"
    && manualControlPhase !== "attacking"
    && manualControlPhase !== "interacting";
  if (lookOnly && !characterEngaged) source = dungeonPointerLooking ? "pointer" : "gamepad";
  const input = {
    forward: clampNumber(selectedAxis.forward, -1, 1, 0),
    strafe: clampNumber(selectedAxis.strafe, -1, 1, 0),
    cameraYaw: normalizeRadians(usesWorldAvatar ? orbitYaw : manualLookYaw),
    ...(isFirstPersonView ? { movementMode: "first_person" } : {}),
    ...(directLooking
      ? { lookYaw: normalizeRadians(manualLookYaw), lookPitch: manualLookPitch }
      : {}),
    jump,
    sprint,
    sneak,
  };
  const shouldSendIdle = lastManualMotionEngaged
    && !characterEngaged
    && manualControlPhase !== "navigating"
    && manualControlPhase !== "attacking"
    && manualControlPhase !== "interacting";
  const shouldSend = characterEngaged || lookOnly || shouldSendIdle;
  const signature = JSON.stringify([source, input]);
  const changed = signature !== lastManualInputSignature;
  let sent = false;
  if (shouldSend && now - lastManualSendAt >= 50 && (changed || ((characterEngaged || lookOnly) && now - lastManualSendAt >= 100))) {
    postToDashboard({ type: "lantern-control-motion", source, input });
    if (dungeonPointerLooking) viewerPerformanceCounters.pointerLookSends += 1;
    lastManualInputSignature = signature;
    lastManualSendAt = now;
    sent = true;
  }
  lastManualMotionEngaged = characterEngaged || (shouldSendIdle && !sent);
  // Active input stays at display cadence; idle gamepad discovery is 20 Hz.
  scheduleManualInputLoop(characterEngaged || gamepad.looking || firstPersonPointerLocked || dungeonPointerLooking);
}

function sampleGamepad(elapsed) {
  const pads = navigator.getGamepads?.() || [];
  const pad = [...pads].find((candidate) => candidate?.connected && candidate.mapping === "standard");
  if (!pad) {
    if (gamepadConnected) publishGamepadStatus(false);
    gamepadStopPressed = false;
    gamepadReleasePressed = false;
    return {
      forward: 0, strafe: 0, jump: false, sprint: false, sneak: false,
      engaged: false, looking: false, stopPressed: false,
    };
  }
  if (!gamepadConnected) publishGamepadStatus(true, pad.id);
  const left = radialDeadzone(finiteOr(pad.axes[0], 0), finiteOr(pad.axes[1], 0), 0.16);
  const right = radialDeadzone(finiteOr(pad.axes[2], 0), finiteOr(pad.axes[3], 0), 0.16);
  const looking = Math.hypot(right.x, right.y) > 0.01;
  if (looking) {
    if (isFreeOrbitView) {
      orbitYaw = normalizeRadians(orbitYaw - right.x * 2.25 * elapsed);
      orbitPitch = clampNumber(orbitPitch - right.y * 1.8 * elapsed, -1.25, 1.1, -0.22);
      applyPosition(true);
    } else {
      manualLookYaw = normalizeRadians(manualLookYaw - right.x * 2.25 * elapsed);
      manualLookPitch = clampNumber(
        manualLookPitch + (isFirstPersonView ? right.y : -right.y) * 1.8 * elapsed,
        -1.5,
        1.5,
        0,
      );
    }
  }
  const stopPressed = pad.buttons[2]?.pressed === true;
  if (stopPressed && !gamepadStopPressed) {
    manualStopLatched = true;
    lastManualMotionEngaged = false;
    lastManualInputSignature = "";
    clearPendingGroundTap();
    postToDashboard({ type: "lantern-control-stop" });
  }
  gamepadStopPressed = stopPressed;
  const releasePressed = pad.buttons[3]?.pressed === true;
  if (releasePressed && !gamepadReleasePressed) {
    manualStopLatched = true;
    lastManualMotionEngaged = false;
    lastManualInputSignature = "";
    clearPendingGroundTap();
    postToDashboard({ type: "lantern-control-release" });
  }
  gamepadReleasePressed = releasePressed;
  const jump = pad.buttons[0]?.pressed === true;
  const sneak = pad.buttons[1]?.pressed === true;
  const sprint = pad.buttons[4]?.pressed === true || pad.buttons[10]?.pressed === true || finiteOr(pad.buttons[7]?.value, 0) > 0.55;
  const engaged = Math.hypot(left.x, left.y) > 0.01 || jump || sneak;
  return { forward: -left.y, strafe: left.x, jump, sprint, sneak, engaged, looking, stopPressed };
}

function radialDeadzone(x, y, deadzone) {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= deadzone) return { x: 0, y: 0 };
  const scaled = Math.min(1, (magnitude - deadzone) / (1 - deadzone));
  return { x: (x / magnitude) * scaled, y: (y / magnitude) * scaled };
}

function publishGamepadStatus(connected, label = "") {
  gamepadConnected = connected;
  const chip = document.getElementById("gamepad-chip");
  if (chip) chip.textContent = connected ? `手柄已连接${label ? ` · ${label.slice(0, 28)}` : ""}` : "手柄未连接";
  postToDashboard({ type: "lantern-gamepad-status", connected, label });
}

function resetManualInputs(forceInactive) {
  clearPendingGroundTap();
  if (isDungeonView) clearDungeonPointerLook();
  manualKeys.clear();
  touchMove = { forward: 0, strafe: 0 };
  touchJump = false;
  touchSprint = false;
  touchStickPointer = null;
  manualCanvasTouchPointers.clear();
  lastManualMotionEngaged = false;
  lastManualInputSignature = "";
  document.getElementById("touch-stick-knob")?.style.setProperty("transform", "translate(-50%,-50%)");
  document.getElementById("touch-jump")?.classList.remove("is-active");
  document.getElementById("touch-sprint")?.classList.remove("is-active");
  document.getElementById("touch-sprint")?.setAttribute("aria-pressed", "false");
  if (forceInactive) {
    if (isFirstPersonView && (firstPersonPointerLocked || document.pointerLockElement)) {
      firstPersonPointerLocked = false;
      document.exitPointerLock?.();
    }
    if (manualInputFrame !== null) cancelAnimationFrame(manualInputFrame);
    if (manualIdleTimer !== null) clearTimeout(manualIdleTimer);
    manualInputFrame = null;
    manualIdleTimer = null;
    manualInputFrameTime = 0;
    manualControlActive = false;
    document.getElementById("manual-viewer-overlay")?.classList.remove("is-active");
    updateManualHelp();
  }
}

function clearPendingGroundTap() {
  tapCandidate = null;
}

function sendGroundRay(canvas, clientX, clientY) {
  if (!manualControlActive) return;
  const camera = globalThis.world?.camera;
  const sceneOrigin = globalThis.world?.sceneOrigin;
  if (!camera || !sceneOrigin) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  camera.parent?.updateMatrixWorld?.(true);
  camera.updateMatrixWorld?.(true);
  const pointer = new Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    1 - ((clientY - rect.top) / rect.height) * 2,
  );
  const raycaster = new Raycaster();
  raycaster.setFromCamera(pointer, camera);
  const direction = raycaster.ray.direction.clone().normalize();
  const origin = raycaster.ray.origin;
  const ray = {
    origin: {
      x: sceneOrigin.toWorldX(origin.x),
      y: sceneOrigin.toWorldY(origin.y),
      z: sceneOrigin.toWorldZ(origin.z),
    },
    direction: { x: direction.x, y: direction.y, z: direction.z },
  };
  // Optimistically suppress the final zero-motion receipt from a just-released
  // key/stick until the authoritative navigation state arrives. Fresh movement
  // still sends normally and intentionally supersedes the point target.
  lastManualMotionEngaged = false;
  lastManualInputSignature = "";
  manualControlPhase = "navigating";
  showGroundPing(clientX, clientY);
  postToDashboard({ type: "lantern-control-navigate-ray", ray });
}

function showGroundPing(clientX, clientY, tone = "ground") {
  const ping = document.getElementById("ground-click-ping");
  if (!ping) return;
  ping.classList.remove("is-active");
  ping.dataset.tone = tone;
  ping.style.left = `${clientX}px`;
  ping.style.top = `${clientY}px`;
  requestAnimationFrame(() => ping.classList.add("is-active"));
}

function updateManualHelp() {
  const help = document.querySelector(".viewer-help");
  if (!help) return;
  if (manualControlActive) {
    help.textContent = isDungeonView
      ? `地牢接管${manualControlPhase === "attacking" ? " · 正在攻击" : manualControlPhase === "navigating" ? " · 正在移动" : manualControlPhase === "interacting" ? " · 正在交互" : ""}：点击地面移动｜右键目标选择操作｜悬停识别目标｜滚轮缩放｜WASD/左摇杆移动｜X 停｜Y/Esc 交还`
      : isFreeOrbitView
        ? "人工接管：WASD/左摇杆移动｜拖拽/右摇杆转镜头｜点地寻路｜A/空格跳｜X 停｜Y/Esc 交还"
        : `人工接管：单击画面锁定鼠标｜鼠标环顾｜WASD 移动｜空格跳跃｜Shift 疾跑｜Ctrl 潜行｜Esc 退出鼠标并停止｜Y 交还 Agent｜FOV ${firstPersonFov}°`;
    return;
  }
  help.textContent = isDungeonView
    ? `地牢 2.5D：固定斜角跟随｜滚轮 ${DUNGEON_MIN_DISTANCE}–${DUNGEON_MAX_DISTANCE} 格｜悬停显示可交互图标｜右键/长按目标选择详情、走近、攻击或使用｜接管后点地移动`
    : isFreeOrbitView
      ? `单击 NPC 打开角色档案｜左拖旋转｜Shift/右拖平移｜滚轮 ${minimumThirdPersonOrbitDistance()}–${maximumOrbitDistance} 格｜WASD 平移观察镜头｜空格上升｜Ctrl 下降｜双击复位（不会控制角色）`
      : `第一人称同步角色真实视线 · FOV ${firstPersonFov}° · 接管后单击画面进入标准 PC 鼠标视角`;
}

function postToDashboard(message) {
  if (!dashboardOrigin || parent === window) return;
  parent.postMessage(message, dashboardOrigin);
}

function applyOrbitCameraOffset() {
  if (!usesWorldAvatar) return;
  const camera = globalThis.world?.camera;
  if (!camera?.position) return;
  const resolvedDistance = Math.max(0.4, Math.abs(finiteOr(camera.position.z, 4)));
  // Up to four blocks, retain the renderer's vanilla wall collision. Beyond
  // that range this is an explicit observer camera, so the requested distance
  // wins over Minecraft's hard-coded four-block third-person limit.
  camera.position.z = orbitDistance <= 4 ? Math.min(orbitDistance, resolvedDistance) : orbitDistance;
  camera.position.x = orbitPanX;
  camera.position.y = orbitPanY;
  camera.updateMatrixWorld?.();
}

function minimumThirdPersonOrbitDistance() {
  return playerModelInstance ? 1.6 : 0.6;
}

function createTouchGesture() {
  const [first, second] = [...activeTouchPointers.values()];
  if (!first || !second) return null;
  return {
    gap: Math.max(16, Math.hypot(second.x - first.x, second.y - first.y)),
    midpointX: (first.x + second.x) / 2,
    midpointY: (first.y + second.y) / 2,
    distance: orbitDistance,
    panX: orbitPanX,
    panY: orbitPanY,
  };
}

function applyTouchGesture() {
  touchGesture ||= createTouchGesture();
  const current = createTouchGesture();
  if (!touchGesture || !current) return;
  orbitDistance = clampNumber(
    touchGesture.distance * (touchGesture.gap / current.gap),
    minimumThirdPersonOrbitDistance(),
    maximumOrbitDistance,
    4,
  );
  const scale = Math.max(0.004, orbitDistance * 0.0025);
  orbitPanX = clampNumber(
    touchGesture.panX - (current.midpointX - touchGesture.midpointX) * scale,
    -maximumOrbitPan,
    maximumOrbitPan,
    0,
  );
  orbitPanY = clampNumber(
    touchGesture.panY + (current.midpointY - touchGesture.midpointY) * scale,
    -maximumOrbitPan,
    maximumOrbitPan,
    0,
  );
  applyPosition(true);
}

function startObserverKeyboardLoop() {
  if (observerFrame !== null) return;
  observerFrameTime = performance.now();
  observerFrame = requestAnimationFrame(updateObserverKeyboard);
}

function updateObserverKeyboard(now) {
  observerFrame = null;
  if (observerKeys.size === 0 || viewMode !== "third") return;
  const elapsed = clampNumber((now - observerFrameTime) / 1_000, 0, 0.05, 0.016);
  observerFrameTime = now;
  const fast = observerKeys.has("ShiftLeft") || observerKeys.has("ShiftRight");
  const speed = (fast ? 24 : 8) * elapsed;
  const rotationSpeed = 1.35 * elapsed;
  let changed = false;

  if (observerKeys.has("ArrowLeft")) { orbitYaw += rotationSpeed; changed = true; }
  if (observerKeys.has("ArrowRight")) { orbitYaw -= rotationSpeed; changed = true; }
  if (observerKeys.has("ArrowUp")) { orbitPitch = clampNumber(orbitPitch + rotationSpeed, -1.48, 1.48, -0.22); changed = true; }
  if (observerKeys.has("ArrowDown")) { orbitPitch = clampNumber(orbitPitch - rotationSpeed, -1.48, 1.48, -0.22); changed = true; }

  const forward = (observerKeys.has("KeyW") ? 1 : 0) - (observerKeys.has("KeyS") ? 1 : 0);
  const side = (observerKeys.has("KeyD") ? 1 : 0) - (observerKeys.has("KeyA") ? 1 : 0);
  const vertical = (observerKeys.has("Space") || observerKeys.has("KeyE") ? 1 : 0)
    - (observerKeys.has("ControlLeft") || observerKeys.has("ControlRight") || observerKeys.has("KeyQ") ? 1 : 0);
  if (forward || side || vertical) {
    const nextX = observerOffset.x + (-Math.sin(orbitYaw) * forward + Math.cos(orbitYaw) * side) * speed;
    const nextZ = observerOffset.z + (-Math.cos(orbitYaw) * forward - Math.sin(orbitYaw) * side) * speed;
    const horizontalLength = Math.hypot(nextX, nextZ);
    const horizontalScale = horizontalLength > maximumObserverOffset ? maximumObserverOffset / horizontalLength : 1;
    observerOffset = new Vec3(
      nextX * horizontalScale,
      clampNumber(observerOffset.y + vertical * speed, -maximumObserverOffset, maximumObserverOffset, 0),
      nextZ * horizontalScale,
    );
    changed = true;
  }
  if (changed) applyPosition(true);
  observerFrame = requestAnimationFrame(updateObserverKeyboard);
}

function installInventoryHud() {
  updateManualHelp();
  renderInventoryHud();
}

function renderInventoryHud() {
  const held = document.querySelector(".viewer-held");
  const hotbar = document.querySelector(".viewer-hotbar");
  if (!held || !hotbar || !pendingAvatarState) return;
  const state = pendingAvatarState;
  const mainHand = (Array.isArray(state.equipment) ? state.equipment[0] : undefined) ?? selectedHotbarItem(state);
  const inventoryCount = Array.isArray(state.inventory) ? state.inventory.filter(Boolean).length : 0;
  const slots = Array.isArray(state.hotbar) ? state.hotbar : [];
  const selected = clampNumber(state.quickBarSlot, 0, 8, 0);
  const items = Array.from({ length: 9 }, (_, index) => unwrapHotbarSlot(slots[index]));
  const signature = [
    selected,
    inventoryCount,
    inventoryItemSignature(mainHand),
    ...items.map(inventoryItemSignature),
  ].join("\u0000");
  if (signature === inventoryHudSignature) {
    viewerPerformanceCounters.skippedInventoryRenders += 1;
    return;
  }
  inventoryHudSignature = signature;
  viewerPerformanceCounters.inventoryRenders += 1;
  setElementText(held, `手持：${displayItemName(mainHand)}｜背包 ${inventoryCount} 格有物品`);
  const nodes = ensureHotbarNodes(hotbar);
  for (let index = 0; index < nodes.length; index += 1) {
    const item = items[index];
    const slot = nodes[index];
    const className = `viewer-slot${index === selected ? " is-selected" : ""}`;
    if (slot.className !== className) slot.className = className;
    setElementAttribute(slot, "title", item ? `${displayItemName(item)} × ${finiteOr(item.count, 1)}` : `快捷栏 ${index + 1}`);
    setElementText(slot.children[0], item ? shortItemName(item) : "");
    setElementText(slot.children[1], item && finiteOr(item.count, 1) > 1 ? finiteOr(item.count, 1) : "");
  }
}

function ensureHotbarNodes(hotbar) {
  const existing = [...hotbar.children];
  if (existing.length === 9 && existing.every((slot) => slot.children.length === 3)) return existing;
  const nodes = Array.from({ length: 9 }, (_, index) => {
    const slot = document.createElement("div");
    slot.className = "viewer-slot";
    const name = document.createElement("span");
    name.className = "viewer-slot-name";
    const count = document.createElement("span");
    count.className = "viewer-slot-count";
    const number = document.createElement("span");
    number.className = "viewer-slot-number";
    number.textContent = String(index + 1);
    slot.append(name, count, number);
    return slot;
  });
  hotbar.replaceChildren(...nodes);
  return nodes;
}

function inventoryItemSignature(item) {
  if (!item || typeof item !== "object") return "";
  return [
    item.name,
    item.displayName,
    item.customName,
    item.type ?? item.itemId,
    item.metadata,
    finiteOr(item.count, 1),
  ].map((value) => String(value ?? "")).join(":");
}

function displayItemName(item) {
  if (!item || typeof item !== "object") return "空手";
  return String(item.displayName || item.customName || item.name || "未知物品").slice(0, 48);
}

function shortItemName(item) {
  const raw = displayItemName(item).replace(/^minecraft:/u, "");
  const parts = raw.split(/[_\s]+/u).filter(Boolean);
  return (parts.at(-1) || raw).slice(0, 7);
}

function enhanceRendererQuality() {
  const renderer = globalThis.world?.renderer;
  const maximum = finiteOr(renderer?.capabilities?.getMaxAnisotropy?.(), 1);
  textureAnisotropy = Math.max(1, Math.min(8, maximum));
  for (const texture of [globalThis.world?.material?.map, globalThis.world?.itemsTexture]) {
    if (!texture || texture.anisotropy === textureAnisotropy) continue;
    texture.anisotropy = textureAnisotropy;
    texture.needsUpdate = true;
  }
  configureTrustedAvatarLighting();
  adaptiveQualityController = createAdaptiveQualityController({
    nativePixelRatio: finiteOr(globalThis.devicePixelRatio, 1),
    maximumPixelRatio: 1.75,
    preference: qualityPreference,
  });
  applyRendererQuality(adaptiveQualityController.getSnapshot());
  startPerformanceMonitor();
}

function configureTrustedAvatarLighting() {
  const world = globalThis.world;
  const renderer = world?.renderer;
  const scene = world?.scene;
  if (!renderer || !scene) return false;

  // The host keeps a linear output path for its Minecraft atlas. Imported GLB
  // materials are adapted separately; a restrained fill/rim rig affects lit
  // entity materials while the MeshBasic block atlas remains unchanged.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  const sun = world.directionalLight;
  if (sun?.shadow) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    sun.shadow.camera.near = 0.1;
    sun.shadow.camera.far = 48;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 1.5;
    sun.shadow.camera.updateProjectionMatrix?.();
  }

  if (avatarPresentationLights) return true;
  const fill = new HemisphereLight(0xfff1dc, 0x31485d, 0.24);
  fill.name = "__lantern_avatar_fill_light";
  const rim = new DirectionalLight(0xffd8b2, 0.32);
  rim.name = "__lantern_avatar_rim_light";
  rim.position.set(-3, 5, 4);
  rim.target.name = "__lantern_avatar_rim_target";
  rim.target.position.set(0, 0.9, 0);
  scene.add(fill, rim, rim.target);
  avatarPresentationLights = { fill, rim, target: rim.target };
  return true;
}

function startPerformanceMonitor() {
  if (performanceMonitorTimer !== null) clearInterval(performanceMonitorTimer);
  sampleRendererPerformance();
  performanceMonitorTimer = setInterval(sampleRendererPerformance, PERFORMANCE_SAMPLE_INTERVAL_MS);
}

function sampleRendererPerformance() {
  if (!rendererReady || !adaptiveQualityController) return;
  const state = viewer?.nonReactiveState;
  const renderer = globalThis.world?.renderer;
  const fps = positiveMetric(state?.fps);
  const qualitySample = adaptiveQualityController.sample({ fps, hidden: document.hidden });
  if (qualitySample.changed) applyRendererQuality(qualitySample);
  const quality = adaptiveQualityController.getSnapshot();
  rendererPerformance = {
    fps,
    averageFrameMs: positiveMetric(state?.avgRenderTime),
    worstFrameMs: positiveMetric(state?.worstRenderTime),
    drawCalls: nonNegativeMetric(renderer?.info?.render?.calls),
    triangles: nonNegativeMetric(renderer?.info?.render?.triangles),
    quality,
  };
  scheduleTrustedNpcAvatarRebalance("quality-sample");
  publishPerformanceDataset();
  if (usesWorldAvatar && !document.hidden) scheduleDungeonOcclusionCheck();
}

function applyRendererQuality(quality) {
  const renderer = globalThis.world?.renderer;
  if (!renderer || !quality) return false;
  // Preserve the cheap contact shadow at every tier, but skip the additional
  // skinned shadow pass once adaptive quality reaches performance mode.
  if (renderer.shadowMap) renderer.shadowMap.enabled = quality.mode !== "performance";
  const current = finiteOr(renderer.getPixelRatio?.(), 1);
  if (Math.abs(current - quality.pixelRatio) < 0.01) return false;
  renderer.setPixelRatio(quality.pixelRatio);
  return true;
}

function publishPerformanceDataset() {
  const canvas = document.getElementById("viewer-canvas");
  const quality = rendererPerformance.quality;
  if (!canvas || !quality) return;
  setElementDataset(canvas, "performanceFps", rendererPerformance.fps ?? "unknown");
  setElementDataset(canvas, "performanceAverageFrameMs", rendererPerformance.averageFrameMs ?? "unknown");
  setElementDataset(canvas, "performanceQuality", quality.mode);
  setElementDataset(canvas, "performancePixelRatio", quality.pixelRatio);
  setElementDataset(canvas, "performancePixelWork", quality.estimatedPixelWork);
  const npcLod = trustedNpcAvatarLodDiagnostics();
  setElementDataset(canvas, "trustedNpcAvatarBudget", npcLod.budget);
  setElementDataset(canvas, "trustedNpcAvatarSelected", npcLod.selected);
  setElementDataset(canvas, "trustedNpcAvatarHighDetail", npcLod.highDetailMounted);
  setElementDataset(canvas, "trustedNpcAvatarProcedural", npcLod.proceduralMounted);
  setElementDataset(canvas, "trustedNpcAvatarPending", npcLod.pending);
  const effects = viewerEffectSystem?.getDiagnostics();
  setElementDataset(canvas, "viewerEffects", effects ? "ready" : "waiting");
  setElementDataset(canvas, "viewerEffectsActive", effects?.activeEffects ?? 0);
  setElementDataset(canvas, "viewerEffectParticles", effects?.activeParticles ?? 0);
  setElementDataset(canvas, "viewerEffectDropped", effects?.dropped ?? 0);
  setElementDataset(canvas, "viewerEffectChatInferences", effects?.chatInferences ?? 0);
}

function positiveMetric(value) {
  const candidate = Number(value);
  return Number.isFinite(candidate) && candidate > 0 ? Math.round(candidate * 10) / 10 : null;
}

function nonNegativeMetric(value) {
  const candidate = Number(value);
  return Number.isFinite(candidate) && candidate >= 0 ? Math.round(candidate) : null;
}

function installVisibilityHandling() {
  document.addEventListener("visibilitychange", () => {
    viewer?.setRendering(!document.hidden);
    viewerEffectSystem?.setSuspended(document.hidden);
    if (document.hidden) {
      cancelDungeonHoverPick();
      cancelDungeonOcclusionCheck();
      clearDungeonPointerLook();
      restoreDungeonCutaway();
    } else {
      if (dungeonHoverPointer) scheduleDungeonHoverPick(document.getElementById("viewer-canvas"));
      scheduleDungeonOcclusionCheck();
      scheduleTrustedNpcAvatarRebalance("viewer-visible", true);
    }
  });
  window.addEventListener("pagehide", () => {
    if (performanceMonitorTimer !== null) clearInterval(performanceMonitorTimer);
    performanceMonitorTimer = null;
    if (trustedNpcAvatarRebalanceTimer !== null) clearTimeout(trustedNpcAvatarRebalanceTimer);
    trustedNpcAvatarRebalanceTimer = null;
    trustedNpcAvatarRebalanceReasons.clear();
    cancelDungeonHoverPick();
    cancelDungeonOcclusionCheck();
    clearDungeonPointerLook();
    restoreDungeonCutaway();
    pendingVillagerStyleChecks.clear();
    npcPortraitRenderer?.dispose();
    npcPortraitRenderer = null;
    viewerEffectSystem?.dispose();
    viewerEffectSystem = null;
    fishingVisuals?.dispose();
    fishingVisuals = null;
    selfAvatarCameraVisibility?.dispose();
    selfAvatarCameraVisibility = null;
    pendingViewerEffects.length = 0;
    disposeAllPaintingEntities();
    removeSelectedPlayerModel({ restoreNative: false, restoreRig: false });
    disposeAllCustomCharacters();
    trustedAvatarAssetPipeline.dispose();
    if (avatarPresentationLights) {
      avatarPresentationLights.fill.removeFromParent();
      avatarPresentationLights.rim.removeFromParent();
      avatarPresentationLights.target.removeFromParent();
      avatarPresentationLights = null;
    }
    disposeAllAvatarRigs();
  }, { once: true });
}

function publishDiagnostics(version) {
  globalThis.__lanternRenderer = {
    engine: "minecraft-renderer",
    minecraftRenderer: "0.1.96",
    three: "r184",
    backend: "WebGL2",
    mesher: useWasmMesher ? "WASM experimental" : "JavaScript workers",
    minecraftVersion: version,
    viewMode,
    firstPersonFov,
    renderDistance,
    textureAnisotropy,
    qualityPreference,
    dayNightSource: "server-time-day-cycle",
    weatherSource: "server-rain-stream",
    unknownEntityFallback: "vanilla-painting-textures-plus-hidden-unresolved-protocol-entity",
    paintingEntityRendering: "minecraft-1.21.1-local-textures-and-registry-dimensions",
    originalCharacterRendering: "trusted-local-glb-vrm-with-procedural-fallback",
    npcPortraitArchitecture: "trusted-local-concept-and-deterministic-canvas-2d",
    avatarMotionArchitecture: "model-independent-motion-graph",
    avatarRigExtensionPoint: "trusted-local-adapter-factory",
    trustedAvatarAssetArchitecture: "fixed-allowlist-vrm-gltf-cache-stale-safe-budgeted",
    trustedAvatarPresentation: "toon-linear-compatible-entity-lighting-contact-shadow",
    trustedAvatarLod: "frustum-distance-shadow-animation-throttle",
    trustedAvatarDynamicBudget: "focused-nearest-quality-budget-with-procedural-fallback",
    playerSkinArchitecture: "trusted-local-classic-64x64-uv",
    playerSkinSelectionTransport: "parent-origin-validated-id-only-message",
    playerModelArchitecture: "allowlist-only-vrm-self-replacement-with-first-person-isolation",
    playerModelSelectionTransport: "parent-origin-validated-model-id-only-message",
    npcGameplayArchitecture: "minecraft-world-web-overlay",
    npcEntityPicking: "rate-limited-recursive-visible-mesh-raycast",
    performanceArchitecture: "adaptive-dpr-hysteresis-and-idempotent-ui",
    dungeonPointerLookArchitecture: "horizontal-avatar-plane-no-camera-pitch",
    dungeonOcclusionArchitecture: "bounded-supercover-multiray-local-shader-sight-corridor",
    viewerEffectsArchitecture: "bounded-authoritative-events-plus-labelled-chat-inference",
    observerControlsCharacter: false,
    get selfAvatarCameraVisibility() {
      return selfAvatarCameraVisibility?.diagnostics ?? null;
    },
    maximumOrbitDistance,
    maximumObserverOffset,
    get timeOfDay() {
      return pendingTime;
    },
    get daylight() {
      return pendingTime === null ? null : minecraftLightLevels(pendingTime).daylight;
    },
    get weather() {
      return { ...pendingWeather };
    },
    get entities() {
      return entityCache.size;
    },
    get performance() {
      return {
        ...rendererPerformance,
        quality: rendererPerformance.quality ? { ...rendererPerformance.quality } : null,
        actualPixelRatio: Math.round(finiteOr(globalThis.world?.renderer?.getPixelRatio?.(), 1) * 100) / 100,
        hoverIntervalMs: DUNGEON_HOVER_INTERVAL_MS,
        occlusionIntervalMs: DUNGEON_OCCLUSION_INTERVAL_MS,
        counters: { ...viewerPerformanceCounters },
        trustedNpcAvatarLod: trustedNpcAvatarLodDiagnostics(),
      };
    },
    get playerSkin() {
      return {
        id: selectedPlayerSkin.id,
        label: selectedPlayerSkin.label,
        model: selectedPlayerSkin.model,
        status: playerSkinStatus,
        available: PLAYER_SKINS.map(({ id, label, model }) => ({ id, label, model })),
        lastAppliedAt: playerSkinLastAppliedAt,
        lastError: playerSkinLastError,
        applySequence: playerSkinApplySequence,
      };
    },
    get playerModel() {
      const motion = playerModelInstance?.controller.getDiagnostics?.() ?? null;
      return {
        id: selectedPlayerModel.id,
        label: selectedPlayerModel.label,
        kind: selectedPlayerModel.kind,
        assetId: selectedPlayerModel.assetId,
        status: playerModelStatus,
        mounted: Boolean(playerModelInstance),
        activeModelId: playerModelInstance?.modelId ?? (selectedPlayerModel.kind === "minecraft-classic" ? selectedPlayerModel.id : null),
        activeAssetId: playerModelInstance?.asset?.id ?? null,
        nativeBodySuppressed: playerModelInstance?.nativeBodySuppressed === true,
        firstPersonIsolated: isFirstPersonView,
        available: PLAYER_MODELS.map(({ id, label, kind, assetId, presentation }) => ({ id, label, kind, assetId, presentation })),
        lastAppliedAt: playerModelLastAppliedAt,
        lastError: playerModelLastError,
        applySequence: playerModelApplySequence,
        motion,
      };
    },
    get playerHeadIntegrity() {
      const entries = [...playerHeadIntegrityById.values()].map((entry) => ({ ...entry }));
      return {
        checked: entries.length,
        healthy: entries.filter((entry) => entry.healthy).length,
        repaired: entries.filter((entry) => entry.restoredBaseLayer).length,
        entries,
      };
    },
    get villagerAppearances() {
      return [...entityCache.values()]
        .filter((entity) => canonicalEntityName(entity?.name) === "villager")
        .map((entity) => ({
          id: entity.id,
          username: entity.username || null,
          identityName: entity.identityName || null,
         identityKey: entity.identityKey || null,
         appearance: normalizeVillagerAppearance(entity.villagerAppearance) ?? decodeVillagerAppearance(entity.metadata) ?? null,
         styled: Boolean(globalThis.world?.entities?.entities?.[String(entity.id)]?.userData?.__lanternVillagerStyleKey),
          motion: globalThis.world?.entities?.entities?.[String(entity.id)]
            ?.userData?.__lanternNativeVillagerRig?.getDiagnostics?.() ?? null,
         modelIntegrity: villagerModelIntegrityById.get(String(entity.id)) || null,
       }));
    },
    get villagerModelIntegrity() {
      const entries = [...villagerModelIntegrityById.values()].map((entry) => ({
        ...entry,
        partCounts: { ...entry.partCounts },
        missingParts: [...entry.missingParts],
      }));
      return {
        modelKinds: [...new Set(entries.map((entry) => entry.modelKind))],
        textureUvs: [...new Set(entries.map((entry) => entry.textureUv))],
        checked: entries.length,
        healthy: entries.filter((entry) => entry.healthy).length,
        entries,
      };
    },
    get customCharacters() {
      const expected = [...entityCache.values()]
        .filter((entity) => !isOwnAvatarEntity(entity))
        .map((entity) => ({ entity, definition: resolveCustomCharacterDefinition(entity) }))
        .filter((entry) => entry.definition)
        .map(({ entity, definition }) => ({
          id: entity.id,
          entityType: canonicalEntityName(entity.name),
          username: entity.username || null,
          identityName: entity.identityName || definition.identityName,
          identityKey: entity.identityKey || definition.identityKey,
          characterId: definition.id,
          mounted: customCharacterInstances.has(String(entity.id)),
          healthy: customCharacterInstances.get(String(entity.id))?.diagnostics.healthy ?? false,
          nativeModelSuppressed: customCharacterInstances.get(String(entity.id))?.nativeRoot?.visible === false,
          modelKind: customCharacterInstances.get(String(entity.id))?.diagnostics.modelKind ?? null,
          assetId: customCharacterInstances.get(String(entity.id))?.diagnostics.assetId ?? null,
        }));
      return {
        registered: CUSTOM_CHARACTER_DEFINITIONS.length,
        expected: expected.length,
        mounted: expected.filter((entry) => entry.mounted).length,
        healthy: expected.filter((entry) => entry.healthy).length,
        highDetailMounted: expected.filter((entry) => (
          entry.modelKind === "trusted-local-glb" || entry.modelKind === "trusted-local-vrm"
        )).length,
        proceduralMounted: expected.filter((entry) => entry.modelKind === "procedural-original").length,
        highDetailPolicy: trustedNpcAvatarLodDiagnostics(),
        entries: expected,
      };
    },
    get trustedAvatarAssets() {
      return trustedAvatarAssetPipeline.getDiagnostics();
    },
    get paintingEntities() {
      const expected = [...entityCache.values()]
        .filter((entity) => canonicalEntityName(entity?.name) === "painting")
        .map((entity) => {
          const variant = resolvePaintingVariant(entity);
          const instance = paintingInstances.get(String(entity.id));
          return {
            id: entity.id,
            variantId: variant?.id ?? null,
            variantName: variant?.name ?? "unknown",
            width: variant?.width ?? 1,
            height: variant?.height ?? 1,
            mounted: Boolean(instance),
            nativePlaceholderSuppressed: instance?.nativeRoot?.visible === false,
            textureStatus: instance?.textureEntry?.status ?? "waiting",
            textureError: instance?.textureEntry?.error ?? null,
          };
        });
      return {
        registeredVariants: MINECRAFT_PAINTING_VARIANTS.length,
        expected: expected.length,
        mounted: expected.filter((entry) => entry.mounted).length,
        textured: expected.filter((entry) => entry.textureStatus === "ready").length,
        fallback: expected.filter((entry) => entry.textureStatus === "fallback").length,
        pending: pendingPaintingChecks.size,
        cacheEntries: paintingTextureCache.size,
        stats: { ...paintingRuntimeStats },
        entries: expected,
      };
    },
    get viewerEffects() {
      return viewerEffectSystem?.getDiagnostics() ?? {
        activeEffects: 0,
        activeParticles: 0,
        pending: pendingViewerEffects.length,
        status: rendererReady ? "unavailable" : "waiting-for-renderer",
      };
    },
    get avatarRigs() {
      return {
        ...avatarRigRegistry.getDiagnostics(),
        current: mainAvatarRigKey() ? avatarRigRegistry.getDiagnostics(mainAvatarRigKey()) : null,
        lastError: lastAvatarRigError,
      };
    },
    focusCharacter(identityName) {
      const entity = [...entityCache.values()].find((candidate) => candidate.identityName === identityName);
      return entity ? focusEntityById(entity.id) : null;
    },
    focusEntity(id) {
      return focusEntityById(id);
    },
    returnCameraToAvatar() {
      return returnCameraToAvatar();
    },
    openCharacter(identityName) {
      const entity = [...entityCache.values()].find((candidate) => candidate.identityName === identityName);
      return entity ? openNpcPanel(entity) : false;
    },
    get npcGameplay() {
      return {
        localOnly: true,
        worldKey: npcWorldContext.worldKey,
        availableNpcs: [...entityCache.values()].filter(isNpcEntity).length,
        storedProfiles: npcInteractionState.entries.length,
        selectedEntityId: selectedNpcId,
        selectedNpcKey: selectedNpcProfile?.key || null,
        panelOpen: document.getElementById("npc-panel")?.classList.contains("is-open") === true,
        portrait: {
          status: npcPortraitStatus,
          characterId: npcPortraitCharacterId,
          source: npcPortraitSource,
          theme: npcPortraitTheme,
          renderedTheme: npcPortraitThemeRendered,
          error: npcPortraitLastError,
          renderer: npcPortraitRenderer?.getDiagnostics() || null,
        },
      };
    },
    get chunks() {
      return viewer?.nonReactiveState?.world?.chunksLoadedCount || 0;
    },
    get chunkLoading() {
      const world = globalThis.world;
      return {
        received: Object.keys(world?.loadedChunks || {}).length,
        meshed: Object.keys(world?.finishedChunks || {}).length,
        masked: chunkLoadingGuards.size,
        pendingSections: world?.sectionsWaiting?.size ?? 0,
      };
    },
    get playerEntityVisible() {
      if (isFirstPersonView) return globalThis.world?.entities?.playerEntity?.visible ?? null;
      const id = pendingAvatarState?.entity?.id;
      return id === undefined ? null : globalThis.world?.entities?.entities?.[String(id)]?.visible ?? null;
    },
    get actualPlayerYaw() {
      return finiteOr(pendingAvatarState?.entity?.yaw, latestPosition?.yaw ?? 0);
    },
    get dungeonControls() {
      return {
        pointerLook: {
          active: dungeonPointerLookActive,
          pointerType: dungeonPointerLookPointerType,
          yaw: dungeonPointerLookTarget?.yaw ?? null,
          pitch: dungeonPointerLookTarget?.pitch ?? null,
          distance: dungeonPointerLookTarget?.distance ?? null,
          target: dungeonPointerLookTarget?.target ? { ...dungeonPointerLookTarget.target } : null,
        },
        occlusion: { ...dungeonOcclusionDiagnostics },
      };
    },
    get avatar() {
      if (!pendingAvatarState) return null;
      const rigKey = mainAvatarRigKey();
      const animation = playerModelInstance?.controller.getDiagnostics?.()
        ?? (rigKey ? avatarRigRegistry.getDiagnostics(rigKey)?.adapter?.animation : null);
      return {
        id: pendingAvatarState.entity?.id ?? null,
        sequence: pendingAvatarState.seq ?? pendingAvatarState.sequence ?? null,
        yaw: finiteOr(pendingAvatarState.entity?.yaw, latestPosition?.yaw ?? 0),
        movementState: normalizeMovementState(pendingAvatarState.movementState),
        locomotion: normalizedAvatarMotion?.teleported ? "teleport" : animation?.state ?? pendingAvatarState.locomotion ?? null,
        horizontalSpeed: animation?.horizontalSpeed ?? normalizedAvatarMotion?.horizontalSpeed ?? finiteOr(pendingAvatarState.horizontalSpeed, 0),
        verticalSpeed: normalizedAvatarMotion?.verticalSpeed ?? finiteOr(pendingAvatarState.verticalSpeed, 0),
        selectedHotbar: clampNumber(pendingAvatarState.quickBarSlot, 0, 8, 0),
        inventorySlotsUsed: Array.isArray(pendingAvatarState.inventory)
          ? pendingAvatarState.inventory.filter(Boolean).length
          : 0,
      };
    },
    get camera() {
      return usesWorldAvatar
        ? {
            mode: viewMode,
            yaw: orbitYaw,
            pitch: orbitPitch,
            distance: orbitDistance,
            fov: isDungeonView ? dungeonFov : 75,
            panX: orbitPanX,
            panY: orbitPanY,
            observerOffset: { x: observerOffset.x, y: observerOffset.y, z: observerOffset.z },
            targetMode: focusedCharacterId === null ? "self" : "entity",
            focusedCharacterId,
            focusedCharacterName,
          }
        : { fov: firstPersonFov };
    },
  };
}

function ensureWebGl2() {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false });
  if (!context) throw new Error("当前浏览器或显卡没有提供 WebGL2");
  context.getExtension("WEBGL_lose_context")?.loseContext();
}

function showRendererFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!statusElement) return;
  statusElement.classList.add("is-error");
  statusElement.innerHTML = "";
  const title = document.createElement("strong");
  title.textContent = "现代 3D 渲染器启动失败";
  const detail = document.createElement("span");
  detail.textContent = message.slice(0, 180);
  const fallback = document.createElement("a");
  fallback.href = `/legacy/${usesWorldAvatar ? "?third=1" : ""}`;
  fallback.textContent = "打开兼容渲染器";
  statusElement.append(title, detail, fallback);
}

function setStatus(message, error = false, compact = false) {
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.classList.toggle("is-error", error);
  statusElement.classList.toggle("is-compact", compact);
}

function toVec3(value) {
  return new Vec3(finiteOr(value?.x, 0), finiteOr(value?.y, 64), finiteOr(value?.z, 0));
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampNumber(value, min, max, fallback) {
  return Math.max(min, Math.min(max, finiteOr(value, fallback)));
}

function normalizeRadians(value) {
  const angle = finiteOr(value, 0);
  const turn = Math.PI * 2;
  return ((angle + Math.PI) % turn + turn) % turn - Math.PI;
}

function clampQueryNumber(value, min, max, fallback) {
  if (value === null || value === "") return fallback;
  return clampNumber(value, min, max, fallback);
}

function boundedPush(target, value, limit) {
  target.push(value);
  if (target.length > limit) target.splice(0, target.length - limit);
}
