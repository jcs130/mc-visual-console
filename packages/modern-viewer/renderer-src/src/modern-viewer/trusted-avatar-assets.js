import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import {
  AnimationMixer,
  Box3,
  CircleGeometry,
  DataTexture,
  DoubleSide,
  Group,
  LoadingManager,
  LoopOnce,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  NoColorSpace,
  RedFormat,
  UnsignedByteType,
  Vector3,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { AvatarMotionGraph } from "./avatar-motion.js";
import { resolveCharacterVisualProfile } from "./character-visual-profiles.js";
import {
  TRUSTED_AVATAR_ASSET_ALLOWLIST,
  TRUSTED_AVATAR_HARD_LIMITS,
  TRUSTED_AVATAR_MANIFEST_SCHEMA_VERSION,
  getTrustedAvatarAsset,
  resolveTrustedAvatarAsset,
} from "./trusted-avatar-manifest.js";

const AVAILABILITY_URL = "/character-assets/manifest.json";
const LOCOMOTION_ALIASES = Object.freeze({
  idle: ["idle", "standing", "stand", "breathing"],
  walk: ["walk", "walking", "locomotionwalk"],
  run: ["run", "running", "sprint", "jog"],
  crouch: ["crouch", "sneak", "crouching"],
  crouchWalk: ["crouchwalk", "sneakwalk", "crouchwalking"],
  jump: ["jump", "jumping", "takeoff"],
  fall: ["fall", "falling", "airborne"],
  land: ["land", "landing"],
  swim: ["swim", "swimming"],
  fly: ["fly", "flying", "glide"],
  ride: ["ride", "riding", "sit"],
});
const ACTION_ALIASES = Object.freeze({
  swing: ["swing", "attack", "slash", "melee"],
  hurt: ["hurt", "damage", "hit", "impact"],
  use: ["use", "interact", "cast", "drink", "eat"],
});
const BONE_ALIASES = Object.freeze({
  hips: ["hips", "pelvis", "roothips", "mixamorighips", "jbipchips"],
  spine: ["spine", "spine1", "chest", "upperchest", "mixamorigspine"],
  chest: ["chest", "spine2", "mixamorigspine1", "jbipcchest"],
  upperChest: ["upperchest", "spine3", "mixamorigspine2", "jbipcupperchest"],
  neck: ["neck", "mixamorigneck", "jbipcneck"],
  head: ["head", "mixamorighead", "jbipchead"],
  leftShoulder: ["leftshoulder", "shoulder_l", "mixamorigleftshoulder", "jbiplshoulder"],
  rightShoulder: ["rightshoulder", "shoulder_r", "mixamorigrightshoulder", "jbiprshoulder"],
  leftArm: ["leftupperarm", "leftarm", "upperarm_l", "mixamorigleftarm", "jbiplupperarm"],
  rightArm: ["rightupperarm", "rightarm", "upperarm_r", "mixamorigrightarm", "jbiprupperarm"],
  leftLowerArm: ["leftlowerarm", "leftforearm", "forearm_l", "mixamorigleftforearm", "jbipllowerarm"],
  rightLowerArm: ["rightlowerarm", "rightforearm", "forearm_r", "mixamorigrightforearm", "jbiprlowerarm"],
  leftHand: ["lefthand", "hand_l", "mixamoriglefthand", "jbiplhand"],
  rightHand: ["righthand", "hand_r", "mixamorigrighthand", "jbiprhand"],
  leftLeg: ["leftupperleg", "leftupleg", "thigh_l", "mixamorigleftupleg", "jbiplupperleg"],
  rightLeg: ["rightupperleg", "rightupleg", "thigh_r", "mixamorigrightupleg", "jbiprupperleg"],
  leftLowerLeg: ["leftlowerleg", "leftleg", "leftshin", "calf_l", "mixamorigleftleg", "jbipllowerleg"],
  rightLowerLeg: ["rightlowerleg", "rightleg", "rightshin", "calf_r", "mixamorigrightleg", "jbiprlowerleg"],
  leftFoot: ["leftfoot", "foot_l", "mixamorigleftfoot", "jbiplfoot"],
  rightFoot: ["rightfoot", "foot_r", "mixamorigrightfoot", "jbiprfoot"],
  leftToes: ["lefttoes", "lefttoe", "lefttoebase", "mixamoriglefttoebase", "jbipltoes"],
  rightToes: ["righttoes", "righttoe", "righttoebase", "mixamorigrighttoebase", "jbiprtoes"],
});
const VRM_BONE_NAMES = Object.freeze({
  hips: "hips",
  spine: "spine",
  chest: "chest",
  upperChest: "upperChest",
  neck: "neck",
  head: "head",
  leftShoulder: "leftShoulder",
  rightShoulder: "rightShoulder",
  leftArm: "leftUpperArm",
  rightArm: "rightUpperArm",
  leftLowerArm: "leftLowerArm",
  rightLowerArm: "rightLowerArm",
  leftHand: "leftHand",
  rightHand: "rightHand",
  leftLeg: "leftUpperLeg",
  rightLeg: "rightUpperLeg",
  leftLowerLeg: "leftLowerLeg",
  rightLowerLeg: "rightLowerLeg",
  leftFoot: "leftFoot",
  rightFoot: "rightFoot",
  leftToes: "leftToes",
  rightToes: "rightToes",
});
const REQUIRED_BONES = Object.freeze(["hips", "head", "leftArm", "rightArm", "leftLeg", "rightLeg"]);
const ACTION_DURATION_MS = Object.freeze({ swing: 430, hurt: 260, use: 650 });
const GROUND_CLEARANCE = 0.014;
const NEAR_DETAIL_DISTANCE = 18;
const MEDIUM_DETAIL_DISTANCE = 36;
const AVATAR_TEXTURE_ANISOTROPY = 4;
const DEFAULT_MAXIMUM_CACHED_TEMPLATES = 4;
// A slightly softer response prevents 20 Hz entity samples from snapping a
// high-detail skeleton between poses. The graph still advances at render
// cadence, so this is visual interpolation rather than input latency.
const GENERIC_POSE_DAMPING = 11;
const WALK_REFERENCE_SPEED = 0.1;
const RUN_REFERENCE_SPEED = 0.2;
const AUTHORED_PLAYBACK_RATE_MIN = 0.55;
const AUTHORED_PLAYBACK_RATE_MAX = 2.4;

let sharedToonGradient = null;

/**
 * Async, allowlist-only loader and stale-safe mount coordinator for local GLB
 * and VRM avatars. Network bytes are deduplicated while every mount receives
 * its own parsed scene, skeleton, materials and VRM runtime.
 */
export class TrustedAvatarAssetPipeline {
  constructor(options = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
    this.parseAsset = options.parseAsset ?? parseTrustedAvatarAsset;
    this.availabilityUrl = options.availabilityUrl ?? AVAILABILITY_URL;
    this.maximumConcurrentLoads = clamp(finiteNumber(options.maximumConcurrentLoads, 2), 1, 4);
    this.maximumCachedTemplates = Math.round(clamp(
      finiteNumber(options.maximumCachedTemplates, DEFAULT_MAXIMUM_CACHED_TEMPLATES),
      1,
      12,
    ));
    this.availabilityOverride = options.availableAssetIds
      ? new Set(options.availableAssetIds)
      : null;
    this.availabilityPromise = null;
    this.bytePromises = new Map();
    this.templatePromises = new Map();
    this.resolvedTemplates = new Map();
    this.templateLastUsed = new Map();
    this.fetchAbortControllers = new Map();
    this.mountGenerations = new Map();
    this.activeInstances = new Set();
    this.activeTemplateLoads = 0;
    this.loadQueue = [];
    this.disposed = false;
    this.stats = {
      availabilityRequests: 0,
      byteRequests: 0,
      byteCacheHits: 0,
      parseCount: 0,
      templateCacheHits: 0,
      mounted: 0,
      stale: 0,
      fallback: 0,
      rejected: 0,
      disposedInstances: 0,
      templateEvictions: 0,
      lastError: null,
      lastErrorStage: null,
      lastErrorStack: null,
      lastFailure: null,
    };
  }

  async availableAssetIds() {
    if (this.disposed) return new Set();
    if (this.availabilityOverride) return new Set(this.availabilityOverride);
    if (this.availabilityPromise) return new Set(await this.availabilityPromise);
    if (typeof this.fetchImpl !== "function") return new Set();
    this.stats.availabilityRequests += 1;
    this.availabilityPromise = this.fetchImpl(this.availabilityUrl, {
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
    }).then(async (response) => {
      if (!response?.ok) throw new Error(`avatar availability request failed (${response?.status ?? "network"})`);
      return validateAvailabilityPayload(await response.json());
    }).catch((error) => {
      this.stats.lastError = safeErrorMessage(error);
      return new Set();
    });
    return new Set(await this.availabilityPromise);
  }

  /**
   * Load and parse one allowlisted asset for a character. Returns null on any
   * failure so the caller's existing renderer remains the visible fallback.
   */
  async loadCharacter(characterId, entity, suppliedVisualProfile) {
    if (this.disposed) return null;
    const available = await this.availableAssetIds();
    const visualProfile = suppliedVisualProfile ?? resolveCharacterVisualProfile(entity);
    const dedicated = getTrustedAvatarAsset(visualProfile?.asset?.manifestId);
    const asset = dedicated && available.has(dedicated.id)
      ? dedicated
      : resolveTrustedAvatarAsset(characterId, available);
    if (!asset) return null;
    return this.loadResolvedAsset(asset, { ...entity, characterId }, visualProfile);
  }

  /**
   * Load one explicitly selected allowlisted asset. This is used by the local
   * player-model chooser; callers still cannot provide a URL or bypass the
   * availability, byte, scene, material, texture, triangle, or rig budgets.
   */
  async loadAsset(assetId, entity, suppliedVisualProfile) {
    if (this.disposed) return null;
    const asset = getTrustedAvatarAsset(assetId);
    if (!asset) {
      this.stats.rejected += 1;
      return null;
    }
    const available = await this.availableAssetIds();
    if (!available.has(asset.id)) return null;
    const visualProfile = suppliedVisualProfile ?? resolveCharacterVisualProfile(entity);
    return this.loadResolvedAsset(asset, { ...entity, characterId: entity?.characterId ?? asset.id }, visualProfile);
  }

  async loadResolvedAsset(asset, entity, visualProfile) {
    let stage = "load-template";
    try {
      const template = await this.loadTemplate(asset);
      if (this.disposed) return null;
      stage = "instantiate-template";
      const parsed = instantiateParsedTemplate(template);
      stage = "create-instance";
      const created = createTrustedAvatarInstance(asset, parsed, entity, {
        visualProfile,
        ownsResources: false,
        onDispose: (instance) => {
          if (this.activeInstances.delete(instance)) this.stats.disposedInstances += 1;
          this.evictIdleTemplates();
        },
      });
      this.activeInstances.add(created);
      this.touchTemplate(asset.id);
      this.evictIdleTemplates(new Set([asset.id]));
      this.stats.lastError = null;
      this.stats.lastErrorStage = null;
      this.stats.lastErrorStack = null;
      return created;
    } catch (error) {
      this.stats.fallback += 1;
      this.stats.lastError = safeErrorMessage(error);
      this.stats.lastErrorStage = stage;
      this.stats.lastErrorStack = safeErrorStack(error);
      this.stats.lastFailure = {
        assetId: asset.id,
        stage,
        message: this.stats.lastError,
        stack: this.stats.lastErrorStack,
      };
      return null;
    }
  }

  /**
   * Coordinate an asynchronous mount without letting an old entity/signature
   * replace a newer one. `install` must return true only after it owns the
   * instance; otherwise the instance is immediately disposed.
   */
  async mount({ key, characterId, entity, visualProfile, isCurrent, install }) {
    const normalizedKey = normalizeMountKey(key);
    const generation = (this.mountGenerations.get(normalizedKey) ?? 0) + 1;
    this.mountGenerations.set(normalizedKey, generation);
    const created = await this.loadCharacter(characterId, entity, visualProfile);
    if (!created) return { status: "fallback", assetId: null };
    const current = !this.disposed
      && this.mountGenerations.get(normalizedKey) === generation
      && (typeof isCurrent !== "function" || isCurrent());
    if (!current) {
      created.controller.dispose();
      this.stats.stale += 1;
      return { status: "stale", assetId: created.asset.id };
    }
    let installed = false;
    try {
      installed = typeof install === "function" && install(created) === true;
    } catch (error) {
      this.stats.lastError = safeErrorMessage(error);
    }
    if (!installed) {
      created.controller.dispose();
      this.stats.fallback += 1;
      return { status: "fallback", assetId: created.asset.id };
    }
    this.stats.mounted += 1;
    return { status: "mounted", assetId: created.asset.id };
  }

  /** Stale-safe counterpart to loadAsset() for an explicit local choice. */
  async mountAsset({ key, assetId, entity, visualProfile, isCurrent, install }) {
    const normalizedKey = normalizeMountKey(key);
    const generation = (this.mountGenerations.get(normalizedKey) ?? 0) + 1;
    this.mountGenerations.set(normalizedKey, generation);
    const created = await this.loadAsset(assetId, entity, visualProfile);
    if (!created) return { status: "fallback", assetId: null };
    const current = !this.disposed
      && this.mountGenerations.get(normalizedKey) === generation
      && (typeof isCurrent !== "function" || isCurrent());
    if (!current) {
      created.controller.dispose();
      this.stats.stale += 1;
      return { status: "stale", assetId: created.asset.id };
    }
    let installed = false;
    try {
      installed = typeof install === "function" && install(created) === true;
    } catch (error) {
      this.stats.lastError = safeErrorMessage(error);
    }
    if (!installed) {
      created.controller.dispose();
      this.stats.fallback += 1;
      return { status: "fallback", assetId: created.asset.id };
    }
    this.stats.mounted += 1;
    return { status: "mounted", assetId: created.asset.id };
  }

  cancel(key) {
    const normalizedKey = normalizeMountKey(key);
    this.mountGenerations.set(normalizedKey, (this.mountGenerations.get(normalizedKey) ?? 0) + 1);
  }

  async loadBytes(asset) {
    const trusted = getTrustedAvatarAsset(asset?.id);
    if (!trusted || trusted !== asset) throw new Error("avatar asset is not the registered allowlist record");
    const existing = this.bytePromises.get(asset.id);
    if (existing) {
      this.stats.byteCacheHits += 1;
      return existing;
    }
    if (typeof this.fetchImpl !== "function") throw new Error("fetch is unavailable for avatar assets");
    const abortController = new AbortController();
    this.fetchAbortControllers.set(asset.id, abortController);
    this.stats.byteRequests += 1;
    const request = this.fetchImpl(asset.url, {
      cache: "force-cache",
      credentials: "same-origin",
      redirect: "error",
      signal: abortController.signal,
    }).then(async (response) => {
      if (!response?.ok) throw new Error(`avatar asset request failed (${response?.status ?? "network"})`);
      const contentType = String(response.headers?.get?.("content-type") || "").split(";", 1)[0].trim().toLowerCase();
      if (contentType && contentType !== asset.mimeType && contentType !== "application/octet-stream") {
        throw new Error(`unexpected avatar MIME type: ${contentType}`);
      }
      const declaredLength = Number(response.headers?.get?.("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > asset.performanceBudget.maximumBytes) {
        throw new Error("avatar asset exceeds byte budget");
      }
      const bytes = await response.arrayBuffer();
      if (!(bytes instanceof ArrayBuffer) || bytes.byteLength < 20) throw new Error("avatar asset is empty or truncated");
      if (bytes.byteLength > asset.performanceBudget.maximumBytes) throw new Error("avatar asset exceeds byte budget");
      return bytes;
    }).finally(() => {
      this.fetchAbortControllers.delete(asset.id);
    });
    // Keep failures cached as well: an absent or corrupt asset must not create
    // a retry storm for every entity refresh.
    this.bytePromises.set(asset.id, request);
    return request;
  }

  async loadTemplate(asset) {
    const existing = this.templatePromises.get(asset.id);
    if (existing) {
      this.stats.templateCacheHits += 1;
      this.touchTemplate(asset.id);
      return existing;
    }
    const request = this.runWithLoadSlot(async () => {
      let parsed = null;
      try {
        const bytes = await this.loadBytes(asset);
        this.stats.parseCount += 1;
        try {
          parsed = await this.parseAsset(asset, bytes.slice(0));
        } finally {
          this.bytePromises.delete(asset.id);
        }
        // The parsed template owns decoded GPU resources; the source bytes can
        // be released immediately instead of retaining another 13-20 MiB.
        this.bytePromises.delete(asset.id);
        const root = parsed?.root;
        if (!root?.traverse) throw new Error("avatar template has no scene root");
        const stats = inspectAvatarScene(root, parsed?.animations ?? []);
        assertWithinPerformanceBudget(stats, asset.performanceBudget);
        const boneMap = resolveHumanoidBoneMap(root, parsed?.vrm ?? null);
        const missing = REQUIRED_BONES.filter((name) => !boneMap[name]);
        if (missing.length > 0) throw new Error(`avatar rig is missing required bones: ${missing.join(", ")}`);
        // Style the cached template once. Skeleton clones intentionally share
        // immutable materials/textures, so this keeps one toon material set per
        // asset instead of allocating and leaking one set per mounted entity.
        const appearance = prepareTrustedAvatarAppearance(root, asset);
        const template = {
          ...parsed,
          bonePaths: Object.fromEntries(Object.entries(boneMap).map(([name, node]) => [name, nodePath(root, node)])),
          appearance,
          appearancePrepared: true,
        };
        if (this.disposed) throw new Error("avatar pipeline disposed while loading template");
        this.resolvedTemplates.set(asset.id, template);
        this.touchTemplate(asset.id);
        this.evictIdleTemplates(new Set([asset.id]));
        return template;
      } catch (error) {
        if (parsed?.root && !this.resolvedTemplates.has(asset.id)) disposeAvatarScene(parsed.root);
        throw error;
      }
    });
    this.templatePromises.set(asset.id, request);
    return request;
  }

  touchTemplate(assetId) {
    this.templateLastUsed.set(assetId, nowMs());
  }

  /**
   * Keep decoded VRM/GLB GPU resources bounded. A template can be evicted only
   * when none of its skeleton clones is alive, because clones intentionally
   * share immutable geometry, materials and textures with the template.
   */
  evictIdleTemplates(protectedIds = new Set()) {
    if (this.disposed) return;
    const activeAssetIds = new Set([...this.activeInstances].map((instance) => instance?.asset?.id).filter(Boolean));
    while (this.resolvedTemplates.size > this.maximumCachedTemplates) {
      const candidate = [...this.resolvedTemplates.keys()]
        .filter((assetId) => !activeAssetIds.has(assetId) && !protectedIds.has(assetId))
        .sort((left, right) => {
          const age = finiteNumber(this.templateLastUsed.get(left), 0) - finiteNumber(this.templateLastUsed.get(right), 0);
          return age || left.localeCompare(right);
        })[0];
      if (!candidate) break;
      const template = this.resolvedTemplates.get(candidate);
      if (template?.root) disposeAvatarScene(template.root);
      this.resolvedTemplates.delete(candidate);
      this.templatePromises.delete(candidate);
      this.templateLastUsed.delete(candidate);
      this.bytePromises.delete(candidate);
      this.stats.templateEvictions += 1;
    }
  }

  runWithLoadSlot(task) {
    if (this.disposed) return Promise.reject(new Error("avatar pipeline is disposed"));
    return new Promise((resolve, reject) => {
      this.loadQueue.push({ task, resolve, reject });
      this.pumpLoadQueue();
    });
  }

  pumpLoadQueue() {
    while (!this.disposed && this.activeTemplateLoads < this.maximumConcurrentLoads && this.loadQueue.length > 0) {
      const job = this.loadQueue.shift();
      this.activeTemplateLoads += 1;
      Promise.resolve().then(job.task).then(job.resolve, job.reject).finally(() => {
        this.activeTemplateLoads -= 1;
        this.pumpLoadQueue();
      });
    }
  }

  getDiagnostics() {
    return {
      schemaVersion: TRUSTED_AVATAR_MANIFEST_SCHEMA_VERSION,
      formats: ["glb", "vrm"],
      allowlisted: TRUSTED_AVATAR_ASSET_ALLOWLIST.length,
      cachedByteLoads: this.bytePromises.size,
      cachedTemplates: this.resolvedTemplates.size,
      pendingTemplates: this.templatePromises.size - this.resolvedTemplates.size,
      maximumCachedTemplates: this.maximumCachedTemplates,
      maximumConcurrentLoads: this.maximumConcurrentLoads,
      activeTemplateLoads: this.activeTemplateLoads,
      queuedTemplateLoads: this.loadQueue.length,
      activeInstances: this.activeInstances.size,
      disposed: this.disposed,
      ...this.stats,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const job of this.loadQueue.splice(0)) job.reject(new Error("avatar pipeline disposed before load started"));
    for (const controller of this.fetchAbortControllers.values()) controller.abort();
    this.fetchAbortControllers.clear();
    for (const instance of [...this.activeInstances]) instance.controller.dispose();
    this.activeInstances.clear();
    for (const template of this.resolvedTemplates.values()) disposeAvatarScene(template.root);
    this.resolvedTemplates.clear();
    this.templatePromises.clear();
    this.templateLastUsed.clear();
    this.bytePromises.clear();
    this.mountGenerations.clear();
  }
}

export async function parseTrustedAvatarAsset(asset, bytes) {
  if (!getTrustedAvatarAsset(asset?.id)) throw new Error("untrusted avatar asset id");
  const manager = new LoadingManager();
  manager.setURLModifier((url) => {
    const candidate = String(url || "");
    if (candidate.startsWith("blob:") || candidate.startsWith("data:")) return candidate;
    throw new Error("external GLB/VRM dependencies are not allowed");
  });
  const loader = new GLTFLoader(manager);
  if (asset.format === "vrm") loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.parseAsync(bytes, "");
  const vrm = gltf.userData?.vrm ?? null;
  if (asset.format === "vrm" && !vrm) throw new Error("VRM extension was not parsed");
  if (vrm) {
    if (vrm.meta?.metaVersion === "0") VRMUtils.rotateVRM0(vrm);
    // The sample VRMs contain several skins with duplicate skeletons. These
    // official three-vrm passes preserve the humanoid while substantially
    // reducing per-frame skinning work and inert vertex attributes.
    VRMUtils.removeUnnecessaryVertices(vrm.scene);
    VRMUtils.combineSkeletons(vrm.scene);
  }
  return { gltf, vrm, root: vrm?.scene ?? gltf.scene, animations: gltf.animations ?? [] };
}

export function createTrustedAvatarInstance(asset, parsed, entity, options = {}) {
  const rootAsset = parsed?.root;
  if (!rootAsset?.traverse || !rootAsset?.position || !rootAsset?.scale) throw new Error("avatar asset has no scene root");
  const visualProfile = options.visualProfile ?? resolveCharacterVisualProfile(entity);
  const stats = inspectAvatarScene(rootAsset, parsed?.animations ?? []);
  assertWithinPerformanceBudget(stats, asset.performanceBudget);
  const bones = parsed?.boneNodes
    ? parsed.boneNodes
    : parsed?.bonePaths
      ? Object.fromEntries(Object.entries(parsed.bonePaths).map(([name, path]) => [name, nodeAtPath(rootAsset, path)]))
      : resolveHumanoidBoneMap(rootAsset, parsed?.vrm ?? null);
  const missingBones = REQUIRED_BONES.filter((name) => !bones[name]);
  if (missingBones.length > 0) throw new Error(`avatar rig is missing required bones: ${missingBones.join(", ")}`);

  const heightScale = clamp(finiteNumber(visualProfile?.proportions?.heightScale, 1), 0.7, 1.2);
  const headScale = clamp(finiteNumber(visualProfile?.proportions?.headScale, 1), 0.82, 1.22);
  const shoulderScale = clamp(finiteNumber(visualProfile?.proportions?.shoulderScale, 1), 0.82, 1.18);
  const appearance = parsed?.appearancePrepared
    ? parsed.appearance
    : prepareTrustedAvatarAppearance(rootAsset, asset);
  const layout = normalizeAvatarScene(
    rootAsset,
    asset.targetHeight * heightScale,
    asset.rotationY,
    bones,
  );
  applyVisualProfileProportions(bones, { headScale, shoulderScale });
  const root = new Group();
  root.name = "__lantern_trusted_avatar";
  root.userData.__lanternOriginalCharacterId = entity?.characterId ?? null;
  root.userData.__lanternTrustedAvatarAssetId = asset.id;
  root.userData.__lanternCharacterVisualManifestId = visualProfile?.asset?.manifestId ?? null;
  root.add(rootAsset);
  const contactShadow = createAvatarContactShadow(layout);
  root.add(contactShadow);

  const motionController = createTrustedAvatarMotionController({
    root,
    scene: rootAsset,
    bones,
    animations: parsed?.animations ?? [],
    vrm: parsed?.vrm ?? null,
    sourceFormat: asset.format,
  }, entity);
  const presentationController = createAvatarPresentationController(root, rootAsset, contactShadow);
  const renderAnchor = findFirstRenderable(rootAsset);
  const previousRenderHook = renderAnchor?.onBeforeRender;
  let installedRenderHook = null;
  if (renderAnchor) {
    installedRenderHook = function trustedAvatarRenderHook(...args) {
      motionController.setDetailLevel(presentationController.update(args[2]));
      motionController.render(undefined, args[0]?.info?.render?.frame);
      if (typeof previousRenderHook === "function") previousRenderHook.apply(this, args);
    };
    renderAnchor.onBeforeRender = installedRenderHook;
  }

  let disposed = false;
  const created = {
    root,
    asset,
    controller: {
      updateEntity(nextEntity) {
        return motionController.updateEntity(nextEntity);
      },
      play(action, actionOptions) {
        return motionController.play(action, actionOptions);
      },
      getDiagnostics() {
        return {
          ...motionController.getDiagnostics(),
          presentation: presentationController.getDiagnostics(),
        };
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        if (renderAnchor?.onBeforeRender === installedRenderHook) {
          renderAnchor.onBeforeRender = previousRenderHook;
        }
        motionController.dispose();
        presentationController.dispose();
        root.removeFromParent();
        if (options.ownsResources !== false) disposeAvatarScene(rootAsset);
        options.onDispose?.(created);
      },
    },
    diagnostics: {
      modelKind: asset.format === "vrm" ? "trusted-local-vrm" : "trusted-local-glb",
      textureUv: "authored-gltf-materials",
      renderStyle: asset.format === "vrm" ? "vrm-mtoon" : "anime-toon-authored-textures",
      styleId: asset.id,
      meshes: stats.meshes,
      materials: stats.materials,
      textures: stats.textures,
      triangles: stats.triangles,
      performanceBudget: { ...asset.performanceBudget, withinBudget: true },
      profileBudget: visualProfile?.asset?.budget ? {
        ...visualProfile.asset.budget,
        withinBudget: stats.triangles <= visualProfile.asset.budget.maximumTriangles
          && stats.materials <= visualProfile.asset.budget.maximumMaterials
          && stats.textures <= visualProfile.asset.budget.maximumTextures
          && stats.maximumTextureDimension <= visualProfile.asset.budget.maximumTextureSize,
      } : null,
      partCounts: Object.fromEntries(Object.entries(bones).map(([name, node]) => [name, node ? 1 : 0])),
      missingParts: missingBones,
      healthy: true,
      assetId: asset.id,
      assetFormat: asset.format,
      license: asset.license,
      nodes: stats.nodes,
      bones: stats.bones,
      animationClips: stats.animationClips,
      maximumTextureDimension: stats.maximumTextureDimension,
      visualManifestId: visualProfile?.asset?.manifestId ?? null,
      gender: visualProfile?.presentation?.gender ?? null,
      proportions: { heightScale, headScale, shoulderScale },
      appearance: { ...appearance },
      layout: { ...layout },
      orientationY: normalizeRadians(asset.rotationY),
      shadows: "contact-only-high-detail-budget",
      lodPolicy: "frustum-plus-distance-animation-and-model-budget",
    },
  };
  return created;
}

/**
 * Adapt authored GLB materials to minecraft-renderer's deliberately linear
 * output path. GLTFLoader correctly labels base-colour maps as sRGB, but the
 * host renderer disables colour management and writes LinearSRGB output; if
 * left untouched, those maps are decoded once and never encoded again, making
 * faces and clothes look muddy. Treating colour maps as already display-ready
 * restores their authored values without changing the block atlas.
 */
export function prepareTrustedAvatarAppearance(root, asset = {}) {
  const replacements = new Map();
  const colorTextures = new Set();
  let meshes = 0;
  let toonMaterials = 0;
  let preservedMaterials = 0;

  root?.traverse?.((object) => {
    if (!object?.isMesh) return;
    meshes += 1;
    // A single authored avatar can contain more than 100 skinned primitives.
    // Real-time shadow casting would draw every primitive a second time. The
    // inexpensive contact shadow keeps grounding readable without that cost.
    object.castShadow = false;
    object.receiveShadow = false;
    object.frustumCulled = true;
    if (!object.geometry?.boundingSphere) object.geometry?.computeBoundingSphere?.();
    if (!object.geometry?.boundingBox) object.geometry?.computeBoundingBox?.();

    const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
    const styledMaterials = sourceMaterials.map((source) => {
      if (!source) return source;
      normalizeAvatarColorTextures(source, colorTextures);
      if (asset?.format !== "glb" || (!source.isMeshStandardMaterial && !source.isMeshPhysicalMaterial)) {
        preservedMaterials += 1;
        return source;
      }
      const cached = replacements.get(source);
      if (cached) return cached;
      const toon = createAvatarToonMaterial(source);
      normalizeAvatarColorTextures(toon, colorTextures);
      replacements.set(source, toon);
      toonMaterials += 1;
      // Conversion happens before the template has rendered, so releasing the
      // unused PBR material cannot invalidate a live draw while its textures
      // remain owned by the replacement material.
      source.dispose?.();
      return toon;
    });
    object.material = Array.isArray(object.material) ? styledMaterials : styledMaterials[0];
  });

  return Object.freeze({
    shading: toonMaterials > 0 ? "four-step-toon" : asset?.format === "vrm" ? "authored-mtoon" : "authored",
    colorSpace: "renderer-linear-compatible",
    meshes,
    toonMaterials,
    preservedMaterials,
    colorTextures: colorTextures.size,
    textureAnisotropy: AVATAR_TEXTURE_ANISOTROPY,
    fillLighting: "shared-lit-entity-fill-rim",
  });
}

function createAvatarToonMaterial(source) {
  const hasAuthoredEmissive = Boolean(source.emissiveMap) || finiteNumber(source.emissiveIntensity, 0) > 0;
  const toon = new MeshToonMaterial({
    color: source.color?.clone?.(),
    map: source.map ?? null,
    gradientMap: getSharedToonGradient(),
    lightMap: source.lightMap ?? null,
    lightMapIntensity: finiteNumber(source.lightMapIntensity, 1),
    aoMap: source.aoMap ?? null,
    aoMapIntensity: finiteNumber(source.aoMapIntensity, 1),
    emissive: hasAuthoredEmissive ? source.emissive?.clone?.() : 0xffffff,
    emissiveMap: hasAuthoredEmissive ? source.emissiveMap ?? null : source.map ?? null,
    emissiveIntensity: hasAuthoredEmissive ? finiteNumber(source.emissiveIntensity, 1) : 0.075,
    bumpMap: source.bumpMap ?? null,
    bumpScale: finiteNumber(source.bumpScale, 1),
    normalMap: source.normalMap ?? null,
    normalScale: source.normalScale?.clone?.(),
    displacementMap: source.displacementMap ?? null,
    displacementScale: finiteNumber(source.displacementScale, 1),
    displacementBias: finiteNumber(source.displacementBias, 0),
    alphaMap: source.alphaMap ?? null,
    alphaTest: finiteNumber(source.alphaTest, 0),
    opacity: finiteNumber(source.opacity, 1),
    transparent: source.transparent === true,
    side: source.side,
    vertexColors: source.vertexColors === true,
    fog: source.fog !== false,
  });
  toon.name = source.name ? `${source.name}__lantern_toon` : "__lantern_avatar_toon";
  toon.visible = source.visible !== false;
  toon.depthTest = source.depthTest !== false;
  toon.depthWrite = source.depthWrite !== false;
  toon.colorWrite = source.colorWrite !== false;
  toon.blending = source.blending;
  toon.blendSrc = source.blendSrc;
  toon.blendDst = source.blendDst;
  toon.blendEquation = source.blendEquation;
  toon.premultipliedAlpha = source.premultipliedAlpha === true;
  toon.dithering = true;
  toon.toneMapped = source.toneMapped !== false;
  toon.shadowSide = source.shadowSide ?? null;
  toon.userData = {
    ...(source.userData ?? {}),
    __lanternSourceMaterialType: source.type,
    __lanternAvatarToon: true,
  };
  return toon;
}

function normalizeAvatarColorTextures(material, textures) {
  for (const key of ["map", "emissiveMap"]) {
    const texture = material?.[key];
    if (!texture?.isTexture) continue;
    texture.colorSpace = NoColorSpace;
    texture.anisotropy = Math.max(finiteNumber(texture.anisotropy, 1), AVATAR_TEXTURE_ANISOTROPY);
    texture.needsUpdate = true;
    textures.add(texture);
  }
}

function getSharedToonGradient() {
  if (sharedToonGradient) return sharedToonGradient;
  sharedToonGradient = new DataTexture(
    Uint8Array.from([72, 138, 204, 255]),
    4,
    1,
    RedFormat,
    UnsignedByteType,
  );
  sharedToonGradient.name = "__lantern_avatar_toon_gradient";
  sharedToonGradient.minFilter = NearestFilter;
  sharedToonGradient.magFilter = NearestFilter;
  sharedToonGradient.generateMipmaps = false;
  sharedToonGradient.colorSpace = NoColorSpace;
  sharedToonGradient.needsUpdate = true;
  return sharedToonGradient;
}

function createAvatarContactShadow(layout) {
  const geometry = new CircleGeometry(1, 24);
  const material = new MeshBasicMaterial({
    color: 0x07100f,
    opacity: 0.22,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const shadow = new Mesh(geometry, material);
  shadow.name = "__lantern_avatar_contact_shadow";
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = GROUND_CLEARANCE * 0.45;
  shadow.scale.set(layout.shadowRadiusX, layout.shadowRadiusZ, 1);
  shadow.renderOrder = -1;
  shadow.castShadow = false;
  shadow.receiveShadow = false;
  shadow.raycast = () => {};
  return shadow;
}

function createAvatarPresentationController(root, rootAsset, contactShadow) {
  const meshes = [];
  const cameraPosition = new Vector3();
  const avatarPosition = new Vector3();
  let detailLevel = null;
  let distance = 0;
  rootAsset?.traverse?.((object) => {
    if (object?.isMesh) meshes.push(object);
  });

  const applyDetailLevel = (next) => {
    if (next === detailLevel) return;
    detailLevel = next;
    for (const mesh of meshes) {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    }
    if (contactShadow?.material) contactShadow.material.opacity = next === "near" ? 0.22 : next === "medium" ? 0.16 : 0.1;
  };

  return {
    update(camera) {
      // Ignore the directional shadow camera. The perspective world camera is
      // the stable distance signal and runs once per visible render.
      if (!camera?.isPerspectiveCamera || !camera.getWorldPosition) return detailLevel ?? "far";
      camera.getWorldPosition(cameraPosition);
      root.getWorldPosition(avatarPosition);
      distance = cameraPosition.distanceTo(avatarPosition);
      applyDetailLevel(distance <= NEAR_DETAIL_DISTANCE ? "near" : distance <= MEDIUM_DETAIL_DISTANCE ? "medium" : "far");
      return detailLevel ?? "far";
    },
    getDiagnostics() {
      return {
        detailLevel: detailLevel ?? "far",
        distance: Math.round(distance * 10) / 10,
        nearDistance: NEAR_DETAIL_DISTANCE,
        mediumDistance: MEDIUM_DETAIL_DISTANCE,
        shadowCasters: meshes.filter((mesh) => mesh.castShadow).length,
      };
    },
    dispose() {
      contactShadow?.geometry?.dispose?.();
      contactShadow?.material?.dispose?.();
    },
  };
}

export function inspectAvatarScene(root, animations = []) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  let nodes = 0;
  let meshes = 0;
  let bones = 0;
  let triangles = 0;
  let maximumTextureDimension = 0;
  root?.traverse?.((object) => {
    nodes += 1;
    if (object?.isBone) bones += 1;
    if (!object?.isMesh) return;
    meshes += 1;
    const geometry = object.geometry;
    if (geometry && !geometries.has(geometry)) {
      geometries.add(geometry);
      const count = Number(geometry.index?.count ?? geometry.attributes?.position?.count);
      if (Number.isFinite(count)) triangles += Math.floor(count / 3);
    }
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) {
        if (!value?.isTexture) continue;
        textures.add(value);
        const image = value.image ?? value.source?.data;
        maximumTextureDimension = Math.max(
          maximumTextureDimension,
          finiteNumber(image?.width, 0),
          finiteNumber(image?.height, 0),
        );
      }
    }
  });
  return {
    nodes,
    meshes,
    triangles,
    materials: materials.size,
    textures: textures.size,
    bones,
    animationClips: Array.isArray(animations) ? animations.length : 0,
    maximumTextureDimension,
  };
}

export function assertWithinPerformanceBudget(stats, budget = TRUSTED_AVATAR_HARD_LIMITS) {
  const checks = [
    ["nodes", "maximumNodes"],
    ["meshes", "maximumMeshes"],
    ["triangles", "maximumTriangles"],
    ["materials", "maximumMaterials"],
    ["textures", "maximumTextures"],
    ["maximumTextureDimension", "maximumTextureSize"],
    ["bones", "maximumBones"],
    ["animationClips", "maximumAnimationClips"],
  ];
  for (const [metric, limit] of checks) {
    if (Number(stats?.[metric] ?? 0) > Number(budget?.[limit] ?? 0)) {
      throw new Error(`avatar ${metric} exceeds performance budget`);
    }
  }
  if (Number(stats?.meshes ?? 0) < 1 || Number(stats?.triangles ?? 0) < 1) {
    throw new Error("avatar scene contains no renderable geometry");
  }
  return true;
}

export function resolveHumanoidBoneMap(root, vrm) {
  const mapped = {};
  const humanoid = vrm?.humanoid;
  if (humanoid?.getRawBoneNode || humanoid?.getNormalizedBoneNode) {
    for (const [semantic, vrmName] of Object.entries(VRM_BONE_NAMES)) {
      // Cloned instances do not share VRMHumanoid.update(). Capture the raw
      // skin bones so generic motion deforms the cloned mesh directly.
      mapped[semantic] = humanoid.getRawBoneNode
        ? humanoid.getRawBoneNode(vrmName) ?? null
        : humanoid.getNormalizedBoneNode?.(vrmName) ?? null;
    }
  }
  const nodesByName = new Map();
  root?.traverse?.((node) => {
    const normalized = normalizeName(node?.name);
    if (normalized && !nodesByName.has(normalized)) nodesByName.set(normalized, node);
  });
  for (const [semantic, aliases] of Object.entries(BONE_ALIASES)) {
    if (mapped[semantic]) continue;
    mapped[semantic] = aliases.map((alias) => nodesByName.get(alias)).find(Boolean)
      ?? [...nodesByName].find(([name]) => aliases.some((alias) => name.endsWith(alias)))?.[1]
      ?? null;
  }
  return mapped;
}

export function validateAvailabilityPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return new Set();
  if (payload.schemaVersion !== TRUSTED_AVATAR_MANIFEST_SCHEMA_VERSION || !Array.isArray(payload.assets)) return new Set();
  const available = new Set();
  for (const raw of payload.assets.slice(0, TRUSTED_AVATAR_ASSET_ALLOWLIST.length)) {
    const registered = getTrustedAvatarAsset(raw?.id);
    const byteLength = Number(raw?.byteLength);
    if (
      registered
      && raw?.format === registered.format
      && Number.isSafeInteger(byteLength)
      && byteLength >= 20
      && byteLength <= registered.performanceBudget.maximumBytes
    ) available.add(registered.id);
  }
  return available;
}

function createTrustedAvatarMotionController(rig, entity, options = {}) {
  const now = typeof options.now === "function" ? options.now : nowMs;
  const graph = new AvatarMotionGraph({ now });
  const mixer = Array.isArray(rig.animations) && rig.animations.length > 0
    ? new AnimationMixer(rig.scene)
    : null;
  const clips = resolveSemanticClips(rig.animations);
  const bases = Object.fromEntries(Object.entries(rig.bones).map(([name, node]) => [name, captureTransform(node)]));
  const sceneBasePosition = capturePosition(rig.scene);
  const poseState = createGenericPoseState();
  const actionState = { swing: null, hurt: null, use: null };
  let currentLocomotion = null;
  let currentAction = null;
  let lastRenderedAt = null;
  let lastRendererFrame = null;
  let previousBodyYaw = null;
  let turnLean = 0;
  let authoredPlaybackRate = null;
  let poseUpdates = 0;
  let duplicateFrameSkips = 0;
  let detailLevel = "near";
  let disposed = false;

  const selectLocomotion = (state) => {
    const semantic = clips[state] ? state
      : state === "crouchWalk" && clips.crouch ? "crouch"
        : clips.idle ? "idle" : null;
    if (semantic === currentLocomotion) return;
    const previous = currentLocomotion ? clips[currentLocomotion]?.action : null;
    const next = semantic ? clips[semantic]?.action : null;
    previous?.fadeOut?.(0.2);
    next?.reset?.().fadeIn?.(0.2).play?.();
    currentLocomotion = semantic;
    authoredPlaybackRate = next ? 1 : null;
  };

  const updateAuthoredPlayback = (motion) => {
    const active = currentLocomotion ? clips[currentLocomotion] : null;
    if (!active?.action) {
      authoredPlaybackRate = null;
      return;
    }
    authoredPlaybackRate = authoredLocomotionPlaybackRate({
      semantic: currentLocomotion,
      motionState: motion.state,
      horizontalSpeed: motion.horizontalSpeed,
      clipDuration: active.clip?.duration,
      walkStrideBlocks: graph.options.walkStrideBlocks,
      runStrideBlocks: graph.options.runStrideBlocks,
    });
    active.action.setEffectiveTimeScale?.(authoredPlaybackRate);
  };

  const controller = {
    setDetailLevel(nextDetailLevel) {
      detailLevel = nextDetailLevel === "far" ? "far" : nextDetailLevel === "medium" ? "medium" : "near";
      return detailLevel;
    },
    updateEntity(nextEntity) {
      if (disposed || !nextEntity) return graph.getState();
      return graph.setMotion(nextEntity, finiteNumber(now(), Date.now()));
    },
    play(rawAction, actionOptions = {}) {
      if (disposed) return false;
      const normalized = normalizeName(rawAction);
      const locomotion = Object.keys(LOCOMOTION_ALIASES).find((state) => LOCOMOTION_ALIASES[state].includes(normalized));
      if (locomotion) {
        selectLocomotion(locomotion);
        return true;
      }
      const kind = normalized === "oneswing" ? "swing"
        : Object.keys(ACTION_ALIASES).find((name) => ACTION_ALIASES[name].includes(normalized));
      if (!kind) return false;
      const startedAt = finiteNumber(now(), Date.now());
      actionState[kind] = {
        startedAt,
        durationMs: clamp(finiteNumber(actionOptions.durationMs, ACTION_DURATION_MS[kind]), 40, 10_000),
        hand: actionOptions.hand === "left" ? "left" : "right",
      };
      const authored = clips[kind]?.action;
      if (authored) {
        currentAction?.stop?.();
        authored.reset().setLoop(LoopOnce, 1);
        authored.clampWhenFinished = false;
        authored.fadeIn(0.06).play();
        currentAction = authored;
      }
      return true;
    },
    render(renderedAt = now(), rendererFrame = null) {
      if (disposed) return graph.getState();
      const normalizedRendererFrame = Number(rendererFrame);
      if (Number.isFinite(normalizedRendererFrame) && normalizedRendererFrame === lastRendererFrame) {
        duplicateFrameSkips += 1;
        return graph.getState();
      }
      if (Number.isFinite(normalizedRendererFrame)) lastRendererFrame = normalizedRendererFrame;
      const current = finiteNumber(renderedAt, finiteNumber(now(), Date.now()));
      const minimumInterval = detailLevel === "far" ? 100 : detailLevel === "medium" ? 34 : 0;
      if (lastRenderedAt !== null && current - lastRenderedAt < minimumInterval) return graph.getState();
      const delta = lastRenderedAt === null ? 0 : clamp((current - lastRenderedAt) / 1_000, 0, 0.1);
      lastRenderedAt = current;
      const motion = graph.update(delta);
      if (previousBodyYaw !== null && delta > 0) {
        const turnRate = normalizeRadians(motion.bodyYaw - previousBodyYaw) / delta;
        const targetLean = clamp(turnRate * -0.035, -0.18, 0.18);
        turnLean += (targetLean - turnLean) * dampingAlpha(10, delta);
      }
      previousBodyYaw = motion.bodyYaw;
      selectLocomotion(motion.state);
      // Match authored footsteps to actual blocks travelled. Without this,
      // the bundled 0.7 s run and 1.0 s walk clips play at a fixed rate while
      // Mineflayer accelerates or slows, which presents as foot sliding and a
      // stiff "moving conveyor" gait.
      updateAuthoredPlayback(motion);
      resetMappedBoneTransforms(rig.bones, bases);
      resetPosition(rig.scene, sceneBasePosition);
      mixer?.update(delta);
      applyGenericBonePose(rig.bones, bases, motion, actionState, current, {
        authoredLocomotion: Boolean(clips[motion.state]?.action),
        sourceFormat: rig.sourceFormat,
        delta,
        poseState,
        scene: rig.scene,
        sceneBasePosition,
        turnLean,
      });
      rig.vrm?.update?.(delta);
      expireActions(actionState, current);
      poseUpdates += 1;
      return motion;
    },
    getDiagnostics() {
      return {
        ...graph.getDiagnostics(),
        rig: `trusted-local-${rig.sourceFormat === "vrm" ? "vrm" : "glb"}`,
        disposed,
        detailLevel,
        poseUpdateIntervalMs: detailLevel === "far" ? 100 : detailLevel === "medium" ? 34 : 0,
        poseUpdates,
        duplicateFrameSkips,
        turnLean: Math.round(turnLean * 1_000) / 1_000,
        authoredPlaybackRate: authoredPlaybackRate === null
          ? null
          : Math.round(authoredPlaybackRate * 1_000) / 1_000,
        proceduralPoseBlend: Math.round(poseState.lastAlpha * 1_000) / 1_000,
        proceduralPoseSlots: poseState.target.rotationAllocations,
        currentLocomotion,
        authoredClips: Object.keys(clips),
        idleClip: clips.idle?.clip?.name ?? null,
        idleClipSelection: clips.idle && isExplicitAnimationSemantic(clips.idle.clip?.name, "idle")
          ? "semantic-name"
          : "generic-bone-pose",
        mappedBones: Object.fromEntries(Object.entries(rig.bones).map(([name, node]) => [name, Boolean(node)])),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer?.stopAllAction();
      mixer?.uncacheRoot(rig.scene);
      resetMappedBoneTransforms(rig.bones, bases);
      resetPosition(rig.scene, sceneBasePosition);
      currentAction = null;
    },
  };
  for (const [semantic, clip] of Object.entries(resolveAnimationClipObjects(rig.animations))) {
    clips[semantic] = { clip, action: mixer?.clipAction(clip) ?? null };
  }
  controller.updateEntity(entity);
  return controller;
}

function instantiateParsedTemplate(template) {
  const root = cloneAvatarTemplateRoot(template.root);
  // Resolve the authored humanoid paths before removing inert VRM runtime
  // nodes because a collider can be a sibling of a bone and change indexes.
  const boneNodes = template.bonePaths
    ? Object.fromEntries(Object.entries(template.bonePaths).map(([name, path]) => [name, nodeAtPath(root, path)]))
    : null;
  removeInactiveVrmRuntimeNodes(template.root, root);
  return {
    root,
    animations: template.animations ?? [],
    // A cloned VRM skeleton is driven by the captured humanoid bone paths.
    // The full VRM runtime remains on the hidden shared template so no mutable
    // spring-bone/expression state is shared between rendered entities.
    vrm: null,
    bonePaths: template.bonePaths,
    boneNodes,
    appearance: template.appearance,
    appearancePrepared: template.appearancePrepared === true,
  };
}

function removeInactiveVrmRuntimeNodes(sourceRoot, clonedRoot) {
  let removed = 0;
  const visit = (sourceParent, clonedParent) => {
    const pairs = sourceParent.children.map((sourceChild, index) => [sourceChild, clonedParent.children[index]]);
    for (const [sourceChild, clonedChild] of pairs) {
      if (!clonedChild) continue;
      if (isVrmSpringBoneCollider(sourceChild)) {
        clonedChild.removeFromParent();
        removed += 1;
      } else {
        visit(sourceChild, clonedChild);
      }
    }
  };
  visit(sourceRoot, clonedRoot);
  return removed;
}

function isVrmSpringBoneCollider(node) {
  return Boolean(
    node?.colliderMatrix?.isMatrix4 === true
    && node?.shape?.offset
    && typeof node.shape.calculateCollision === "function",
  );
}

/**
 * SkeletonUtils ultimately calls Object3D.copy(), whose userData branch uses
 * JSON.stringify. GLTF/VRM plugins are allowed to attach live runtime objects
 * there (parser associations, texture views, spring-bone state, and so on),
 * and some of those objects deliberately are not JSON serializable.
 *
 * Keep the skeleton clone synchronous and use only call-local snapshots. That
 * makes simultaneous loadCharacter() continuations deterministic: JavaScript
 * cannot interleave another continuation while this no-await critical section
 * has the shared template temporarily sanitised. The exact original userData
 * object for every source node is restored in finally, including when cloning
 * throws. Clones retain only inert scalar metadata that is safe and useful to
 * downstream diagnostics; mutable loader/runtime state stays on the hidden
 * cached template.
 */
function cloneAvatarTemplateRoot(sourceRoot) {
  const snapshots = [];
  try {
    sourceRoot.traverse((node) => {
      const originalUserData = node.userData;
      snapshots.push({ node, originalUserData });
      node.userData = cloneSafeScalarUserData(originalUserData);
    });
    return cloneSkeleton(sourceRoot);
  } finally {
    for (let index = snapshots.length - 1; index >= 0; index -= 1) {
      const snapshot = snapshots[index];
      snapshot.node.userData = snapshot.originalUserData;
    }
  }
}

function cloneSafeScalarUserData(userData) {
  if (!userData || typeof userData !== "object" || Array.isArray(userData)) return {};
  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(userData);
  } catch {
    return {};
  }
  const safe = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable || !("value" in descriptor)) continue;
    const value = descriptor.value;
    if (
      value === null
      || typeof value === "string"
      || typeof value === "boolean"
      || (typeof value === "number" && Number.isFinite(value))
    ) safe[key] = value;
  }
  return safe;
}

function resolveSemanticClips(animations) {
  const result = {};
  for (const [semantic, clip] of Object.entries(resolveAnimationClipObjects(animations))) result[semantic] = { clip, action: null };
  return result;
}

function resolveAnimationClipObjects(animations) {
  const result = {};
  const aliasGroups = { ...LOCOMOTION_ALIASES, ...ACTION_ALIASES };
  const sourceClips = (Array.isArray(animations) ? animations : []).filter((clip) => clip && typeof clip === "object");
  for (const clip of sourceClips) {
    const name = normalizeName(clip?.name);
    if (!name) continue;
    for (const [semantic, aliases] of Object.entries(aliasGroups)) {
      if (!result[semantic] && aliases.some((alias) => name === alias || name.includes(alias))) result[semantic] = clip;
    }
  }
  return result;
}

function isExplicitAnimationSemantic(rawName, semantic) {
  const normalized = normalizeName(rawName);
  return LOCOMOTION_ALIASES[semantic]?.some((alias) => normalized === alias || normalized.includes(alias)) === true;
}

function authoredLocomotionPlaybackRate({
  semantic,
  motionState,
  horizontalSpeed,
  clipDuration,
  walkStrideBlocks,
  runStrideBlocks,
}) {
  if (!["walk", "run", "crouchWalk"].includes(semantic) || semantic !== motionState) return 1;
  const duration = finiteNumber(clipDuration, 0);
  if (duration <= 0) return 1;
  const strideBlocks = Math.max(
    0.001,
    finiteNumber(semantic === "run" ? runStrideBlocks : walkStrideBlocks, semantic === "run" ? 1.65 : 1.25),
  );
  const blocksPerSecond = Math.max(0, finiteNumber(horizontalSpeed, 0)) * 20;
  const cyclesPerSecond = blocksPerSecond / strideBlocks;
  return clamp(
    cyclesPerSecond * duration,
    AUTHORED_PLAYBACK_RATE_MIN,
    AUTHORED_PLAYBACK_RATE_MAX,
  );
}

function applyGenericBonePose(bones, bases, motion, actions, now, options = {}) {
  const state = options.poseState ?? createGenericPoseState();
  const target = resetGenericPoseTarget(state.target);
  const phase = finiteNumber(motion.gaitPhase, 0);
  const rawStride = Math.sin(phase);
  // Preserve distance-driven phase while softening the zero crossing. This
  // keeps feet decisive near the end of a step without the robotic full-speed
  // pendulum snap produced by a bare sine wave.
  const stride = rawStride * (0.84 + Math.abs(rawStride) * 0.16);
  const counterStride = Math.cos(phase);
  const speed = Math.max(0, finiteNumber(motion.horizontalSpeed, 0));
  const moving = ["walk", "run", "crouchWalk"].includes(motion.state) || speed > 0.008;
  const walkSpeedProgress = smoothstep(0.008, WALK_REFERENCE_SPEED, speed);
  const locomotionWeight = moving ? Math.sqrt(walkSpeedProgress) : 0;
  const measuredRunBlend = smoothstep(0.085, RUN_REFERENCE_SPEED, speed);
  const runBlend = motion.state === "run" ? Math.max(0.22, measuredRunBlend) : measuredRunBlend;
  const crouch = motion.state === "crouch" || motion.state === "crouchWalk";
  const breathe = Math.sin(now / 1_000 * 1.85);

  if (!options.authoredLocomotion) {
    // VRM sample models ship in a T-pose and often have no authored idle clip.
    // VRM humanoid bones use the opposite shoulder-roll convention from the
    // supplied Mixamo GLBs. Keep this convention while driving the complete
    // humanoid chain below instead of only swinging four upper limbs.
    const vrmRestPose = options.sourceFormat === "vrm";
    // Mixamo lower legs bend around +X, while the raw VRM humanoid chain uses
    // the mirrored -X convention. Applying one sign to both formats made GLB
    // knees bend backwards. Forearms likewise hinge around local Y, not X.
    const kneeBendSign = vrmRestPose ? -1 : 1;
    const leftElbowSign = vrmRestPose ? 1 : -1;
    const rightElbowSign = -leftElbowSign;
    addTargetRotation(target, "leftArm", 0.06, 0, vrmRestPose ? 1.15 : -1.25);
    addTargetRotation(target, "rightArm", 0.06, 0, vrmRestPose ? -1.15 : 1.25);
    addTargetRotation(target, "chest", breathe * 0.012, 0, breathe * 0.008);
    addTargetRotation(target, "leftLowerArm", 0, leftElbowSign * 0.1, vrmRestPose ? 0.025 : -0.025);
    addTargetRotation(target, "rightLowerArm", 0, rightElbowSign * 0.1, vrmRestPose ? -0.025 : 0.025);

    if (moving) {
      const upperLegAmplitude = (0.38 + runBlend * 0.22) * locomotionWeight;
      const armAmplitude = (0.28 + runBlend * 0.28) * locomotionWeight;
      const leftSwing = Math.max(0, -stride);
      const rightSwing = Math.max(0, stride);
      const leftKnee = (0.06 + leftSwing * (0.48 + runBlend * 0.24)) * locomotionWeight;
      const rightKnee = (0.06 + rightSwing * (0.48 + runBlend * 0.24)) * locomotionWeight;
      const bob = ((1 - Math.abs(counterStride)) * 2 - 1)
        * (0.009 + runBlend * 0.012) * locomotionWeight;
      const sway = counterStride * (0.027 + runBlend * 0.014) * locomotionWeight;
      const twist = stride * (0.047 + runBlend * 0.035) * locomotionWeight;
      const forwardLean = runBlend * 0.1 + (crouch ? 0.16 : 0);

      addTargetRotation(target, "leftLeg", stride * upperLegAmplitude, 0, 0.018 * locomotionWeight);
      addTargetRotation(target, "rightLeg", -stride * upperLegAmplitude, 0, -0.018 * locomotionWeight);
      addTargetRotation(target, "leftLowerLeg", kneeBendSign * leftKnee, 0, 0);
      addTargetRotation(target, "rightLowerLeg", kneeBendSign * rightKnee, 0, 0);
      addTargetRotation(
        target,
        "leftFoot",
        -kneeBendSign * leftKnee * 0.58 - stride * 0.1 * locomotionWeight,
        0,
        0,
      );
      addTargetRotation(
        target,
        "rightFoot",
        -kneeBendSign * rightKnee * 0.58 + stride * 0.1 * locomotionWeight,
        0,
        0,
      );
      addTargetRotation(target, "leftToes", -kneeBendSign * Math.max(0, stride) * 0.12 * locomotionWeight, 0, 0);
      addTargetRotation(target, "rightToes", -kneeBendSign * Math.max(0, -stride) * 0.12 * locomotionWeight, 0, 0);

      addTargetRotation(target, "leftArm", -stride * armAmplitude, twist * -0.15, 0.025 * locomotionWeight);
      addTargetRotation(target, "rightArm", stride * armAmplitude, twist * -0.15, -0.025 * locomotionWeight);
      const leftElbow = 0.07 + Math.max(0, stride) * (0.11 + runBlend * 0.14);
      const rightElbow = 0.07 + Math.max(0, -stride) * (0.11 + runBlend * 0.14);
      addTargetRotation(target, "leftLowerArm", 0, leftElbowSign * leftElbow, 0);
      addTargetRotation(target, "rightLowerArm", 0, rightElbowSign * rightElbow, 0);
      addTargetRotation(target, "hips", forwardLean * 0.25, twist, sway + finiteNumber(options.turnLean, 0));
      addTargetRotation(target, "spine", forwardLean * 0.42, -twist * 0.8, -sway * 0.58);
      addTargetRotation(target, "chest", forwardLean * 0.32, -twist * 0.72, -sway * 0.42);
      addTargetRotation(target, "upperChest", forwardLean * 0.16, -twist * 0.35, -sway * 0.2);
      addTargetRotation(target, "leftShoulder", 0, twist * 0.28, -sway * 0.25);
      addTargetRotation(target, "rightShoulder", 0, twist * 0.28, -sway * 0.25);
      target.scenePosition.x += sway * 0.14;
      target.scenePosition.y += bob;
    }

    if (motion.state === "jump" || motion.state === "fall") {
      const jumping = motion.state === "jump";
      addTargetRotation(target, "leftArm", jumping ? -0.58 : 0.12, 0, 0.3);
      addTargetRotation(target, "rightArm", jumping ? -0.58 : 0.12, 0, -0.3);
      addTargetRotation(target, "leftLeg", jumping ? -0.38 : 0.2, 0, 0.04);
      addTargetRotation(target, "rightLeg", jumping ? 0.2 : 0.08, 0, -0.04);
      addTargetRotation(target, "leftLowerLeg", kneeBendSign * (jumping ? 0.55 : 0.18), 0, 0);
      addTargetRotation(target, "rightLowerLeg", kneeBendSign * (jumping ? 0.24 : 0.12), 0, 0);
      addTargetRotation(target, "leftFoot", -kneeBendSign * 0.22, 0, 0);
      addTargetRotation(target, "rightFoot", -kneeBendSign * 0.18, 0, 0);
      addTargetRotation(target, "spine", jumping ? -0.08 : 0.06, 0, 0);
    }

    if (crouch) {
      addTargetRotation(target, "hips", 0.12, 0, 0);
      addTargetRotation(target, "spine", 0.23, 0, 0);
      addTargetRotation(target, "chest", -0.06, 0, 0);
      addTargetRotation(target, "leftLeg", -0.22, 0, 0);
      addTargetRotation(target, "rightLeg", -0.22, 0, 0);
      addTargetRotation(target, "leftLowerLeg", kneeBendSign * 0.48, 0, 0);
      addTargetRotation(target, "rightLowerLeg", kneeBendSign * 0.48, 0, 0);
      target.scenePosition.y -= 0.075;
      target.scenePosition.z += 0.045;
    }

    if (motion.state === "land") {
      const compression = Math.sin(clamp(finiteNumber(motion.stateAgeMs, 0) / 180, 0, 1) * Math.PI);
      addTargetRotation(target, "hips", 0.14 * compression, 0, 0);
      addTargetRotation(target, "spine", 0.16 * compression, 0, 0);
      addTargetRotation(target, "leftLeg", -0.32 * compression, 0, 0);
      addTargetRotation(target, "rightLeg", -0.32 * compression, 0, 0);
      addTargetRotation(target, "leftLowerLeg", kneeBendSign * 0.58 * compression, 0, 0);
      addTargetRotation(target, "rightLowerLeg", kneeBendSign * 0.58 * compression, 0, 0);
      target.scenePosition.y -= 0.09 * compression;
    }
  }

  addTargetRotation(
    target,
    "head",
    -finiteNumber(motion.pitch, 0),
    finiteNumber(motion.headRelativeYaw, 0),
    -finiteNumber(options.turnLean, 0) * 0.22,
  );

  const swing = actionStrength(actions.swing, now);
  if (swing > 0) {
    const hand = actions.swing.hand === "left" ? "leftArm" : "rightArm";
    addTargetRotation(target, hand, -1.45 * swing, 0, actions.swing.hand === "left" ? 0.24 * swing : -0.24 * swing);
    addTargetRotation(target, "chest", 0, actions.swing.hand === "left" ? 0.12 * swing : -0.12 * swing, 0);
  }
  const use = actionStrength(actions.use, now);
  if (use > 0) addTargetRotation(target, "rightArm", -1.05 * use, -0.12 * use, -0.08 * use);
  const hurt = actionStrength(actions.hurt, now);
  if (hurt > 0) addTargetRotation(target, "spine", -0.16 * hurt, 0, Math.sin(hurt * Math.PI * 4) * 0.08);

  const delta = clamp(finiteNumber(options.delta, 0), 0, 0.1);
  const alpha = state.initialized ? dampingAlpha(GENERIC_POSE_DAMPING, delta) : 1;
  state.initialized = true;
  state.lastAlpha = alpha;
  if (!state.boneNames) {
    state.boneNames = Object.keys(bones);
    for (const name of state.boneNames) {
      state.rotations[name] ??= zeroTriple();
      ensureTargetRotation(target, name);
    }
  }
  for (const name of state.boneNames) {
    const currentRotation = state.rotations[name] ??= zeroTriple();
    dampTriple(currentRotation, target.rotations[name], alpha);
    applyRotationOffset(bones[name], bases[name], currentRotation);
  }
  dampTriple(state.scenePosition, target.scenePosition, alpha);
  if (options.scene?.position && options.sceneBasePosition) {
    options.scene.position.set(
      options.sceneBasePosition.x + state.scenePosition.x,
      options.sceneBasePosition.y + state.scenePosition.y,
      options.sceneBasePosition.z + state.scenePosition.z,
    );
  }
}

function normalizeAvatarScene(root, targetHeight, rotationY, bones = {}) {
  root.updateMatrixWorld?.(true);
  const bounds = new Box3().setFromObject(root);
  const size = bounds.getSize(new Vector3());
  if (!Number.isFinite(size.y) || size.y <= 0.05) throw new Error("avatar has invalid world bounds");
  const normalizedTargetHeight = clamp(finiteNumber(targetHeight, 1.82), 1.2, 2.3);
  const scale = clamp(normalizedTargetHeight / size.y, 0.02, 20);
  root.scale.multiplyScalar(scale);
  root.rotation.y += normalizeRadians(rotationY);
  root.updateMatrixWorld?.(true);
  const normalizedBounds = new Box3().setFromObject(root);
  const center = normalizedBounds.getCenter(new Vector3());
  const hipsPosition = new Vector3();
  const hipsAreUsable = Boolean(
    bones.hips?.getWorldPosition
    && bones.hips.getWorldPosition(hipsPosition)
    && Number.isFinite(hipsPosition.x)
    && Number.isFinite(hipsPosition.z)
    && normalizedBounds.containsPoint(hipsPosition),
  );
  const anchor = hipsAreUsable ? hipsPosition : center;
  // Anchor on the rig rather than an asymmetric sword, cloak or hairstyle so
  // turning in place no longer makes a character orbit around its entity.
  root.position.x -= anchor.x;
  root.position.z -= anchor.z;
  root.position.y += GROUND_CLEARANCE - normalizedBounds.min.y;
  root.updateMatrixWorld?.(true);
  const finalBounds = new Box3().setFromObject(root);
  const finalSize = finalBounds.getSize(new Vector3());
  return Object.freeze({
    sourceHeight: size.y,
    targetHeight: normalizedTargetHeight,
    appliedScale: scale,
    width: finalSize.x,
    depth: finalSize.z,
    groundClearance: GROUND_CLEARANCE,
    anchor: hipsAreUsable ? "hips" : "bounds-center",
    shadowRadiusX: clamp(finalSize.x * 0.42, 0.22, 0.58),
    shadowRadiusZ: clamp(finalSize.z * 0.5, 0.18, 0.5),
  });
}

function applyVisualProfileProportions(bones, proportions) {
  if (bones.head?.scale) bones.head.scale.multiplyScalar(proportions.headScale);
  if (bones.leftArm?.position) bones.leftArm.position.x *= proportions.shoulderScale;
  if (bones.rightArm?.position) bones.rightArm.position.x *= proportions.shoulderScale;
}

function disposeAvatarScene(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root?.traverse?.((object) => {
    if (object?.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object?.material) ? object.material : [object?.material]) {
      if (!material) continue;
      materials.add(material);
      collectMaterialTextures(material, textures);
    }
  });
  for (const texture of textures) {
    if (texture !== sharedToonGradient) texture.dispose?.();
  }
  for (const material of materials) material.dispose?.();
  for (const geometry of geometries) geometry.dispose?.();
}

function collectMaterialTextures(material, textures) {
  for (const value of Object.values(material ?? {})) {
    if (value?.isTexture) textures.add(value);
  }
  for (const uniform of Object.values(material?.uniforms ?? {})) {
    const value = uniform?.value;
    if (value?.isTexture) textures.add(value);
    else if (Array.isArray(value)) {
      for (const entry of value) if (entry?.isTexture) textures.add(entry);
    }
  }
}

function findFirstRenderable(root) {
  let result = null;
  root?.traverse?.((object) => {
    if (!result && object?.isMesh) result = object;
  });
  return result;
}

function nodePath(root, target) {
  if (!target) return null;
  const indexes = [];
  let current = target;
  while (current && current !== root) {
    const parent = current.parent;
    const index = parent?.children?.indexOf(current) ?? -1;
    if (!parent || index < 0) return null;
    indexes.unshift(index);
    current = parent;
  }
  return current === root ? indexes : null;
}

function nodeAtPath(root, path) {
  if (!Array.isArray(path)) return null;
  let current = root;
  for (const index of path) {
    current = current?.children?.[index];
    if (!current) return null;
  }
  return current;
}

function resetMappedBoneTransforms(bones, bases) {
  for (const [name, node] of Object.entries(bones)) {
    const base = bases[name];
    if (node?.rotation && base?.rotation) {
      node.rotation.set(base.rotation.x, base.rotation.y, base.rotation.z, base.rotation.order);
    }
    if (node?.position && base?.position) {
      node.position.set(base.position.x, base.position.y, base.position.z);
    }
  }
}

function captureTransform(node) {
  return node ? {
    rotation: node.rotation ? {
      x: node.rotation.x,
      y: node.rotation.y,
      z: node.rotation.z,
      order: node.rotation.order,
    } : null,
    position: capturePosition(node),
  } : null;
}

function capturePosition(node) {
  return node?.position ? { x: node.position.x, y: node.position.y, z: node.position.z } : null;
}

function resetPosition(node, base) {
  if (node?.position && base) node.position.set(base.x, base.y, base.z);
}

function createGenericPoseState() {
  return {
    rotations: {},
    scenePosition: zeroTriple(),
    target: createGenericPoseTarget(),
    boneNames: null,
    initialized: false,
    lastAlpha: 1,
  };
}

function createGenericPoseTarget() {
  return {
    rotations: {},
    scenePosition: zeroTriple(),
    rotationAllocations: 0,
  };
}

function resetGenericPoseTarget(target) {
  for (const name in target.rotations) {
    const rotation = target.rotations[name];
    rotation.x = 0;
    rotation.y = 0;
    rotation.z = 0;
  }
  target.scenePosition.x = 0;
  target.scenePosition.y = 0;
  target.scenePosition.z = 0;
  return target;
}

function zeroTriple() {
  return { x: 0, y: 0, z: 0 };
}

function addTargetRotation(target, name, x, y, z) {
  const rotation = ensureTargetRotation(target, name);
  rotation.x += finiteNumber(x, 0);
  rotation.y += finiteNumber(y, 0);
  rotation.z += finiteNumber(z, 0);
}

function ensureTargetRotation(target, name) {
  if (!target.rotations[name]) {
    target.rotations[name] = zeroTriple();
    target.rotationAllocations += 1;
  }
  return target.rotations[name];
}

function dampTriple(current, target, alpha) {
  current.x += (target.x - current.x) * alpha;
  current.y += (target.y - current.y) * alpha;
  current.z += (target.z - current.z) * alpha;
}

function applyRotationOffset(node, base, offset) {
  if (!node?.rotation || !base?.rotation) return;
  node.rotation.x += offset.x;
  node.rotation.y += offset.y;
  node.rotation.z += offset.z;
}

function dampingAlpha(rate, delta) {
  return delta <= 0 ? 0 : 1 - Math.exp(-Math.max(0, rate) * delta);
}

function smoothstep(minimum, maximum, value) {
  if (!(maximum > minimum)) return value >= maximum ? 1 : 0;
  const normalized = clamp((value - minimum) / (maximum - minimum), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

function expireActions(actions, now) {
  for (const [kind, action] of Object.entries(actions)) {
    if (action && now - action.startedAt >= action.durationMs) actions[kind] = null;
  }
}

function actionStrength(action, now) {
  if (!action) return 0;
  const progress = clamp((now - action.startedAt) / action.durationMs, 0, 1);
  return Math.sin(progress * Math.PI);
}

function normalizeMountKey(value) {
  const key = String(value ?? "").trim();
  if (!key || key.length > 256) throw new RangeError("avatar mount key is empty or too long");
  return key;
}

function normalizeName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/gu, "");
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return MathUtils.clamp(finiteNumber(value, minimum), minimum, maximum);
}

function normalizeRadians(value) {
  const radians = finiteNumber(value, 0);
  return MathUtils.euclideanModulo(radians + Math.PI, Math.PI * 2) - Math.PI;
}

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function safeErrorMessage(error) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

function safeErrorStack(error) {
  return String(error instanceof Error ? error.stack || error.message : error)
    .split("\n")
    .slice(0, 12)
    .join("\n")
    .slice(0, 2_400);
}
