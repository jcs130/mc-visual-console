import { CHARACTER_VISUAL_PROFILES } from "./character-visual-profiles.js";

/**
 * Trusted local avatar asset registry.
 *
 * This file is intentionally data-only so both the loopback server and the
 * browser bundle consume the exact same allowlist. Server/chat/entity data can
 * select only an already registered character id; it can never supply a URL.
 */

export const TRUSTED_AVATAR_MANIFEST_SCHEMA_VERSION = 1;

export const TRUSTED_AVATAR_HARD_LIMITS = Object.freeze({
  maximumBytes: 20 * 1024 * 1024,
  maximumNodes: 384,
  maximumMeshes: 160,
  maximumTriangles: 160_000,
  // VRoid can expand authored MToon materials per primitive (the two bundled
  // sample avatars produce 105 and 141 runtime material objects). Keep this
  // aligned with the independently bounded 160-mesh ceiling; textures and
  // geometry remain separately capped and templates are shared by instances.
  maximumMaterials: 160,
  maximumTextures: 40,
  maximumTextureSize: 4096,
  // The supplied anime rigs keep facial and hair joints in the skin. They are
  // still bounded by the 384-node cap, and runtime motion touches only the
  // seven resolved humanoid bones.
  maximumBones: 384,
  maximumAnimationClips: 32,
});

const makeRecord = ({
  id,
  fileName,
  format,
  characterIds: assignedCharacterIds,
  priority,
  license,
  targetHeight = 1.82,
  // minecraft-renderer rotates an entity root by the Mineflayer yaw and its
  // native PlayerObject then adds a local half-turn, so visible models face
  // Minecraft forward (-Z) at yaw 0. GLTFLoader's anime rigs face +Z; VRM0 is
  // likewise rotated to +Z by VRMUtils.rotateVRM0 before this transform is
  // applied. Keep the same local half-turn for both formats so a trusted avatar
  // mounted directly under the entity root follows the native-player contract.
  rotationY = Math.PI,
}) => Object.freeze({
  id,
  fileName,
  url: `/character-assets/${fileName}`,
  format,
  mimeType: "model/gltf-binary",
  characterIds: Object.freeze([...assignedCharacterIds]),
  priority,
  license,
  targetHeight,
  rotationY,
  performanceBudget: TRUSTED_AVATAR_HARD_LIMITS,
});

const DEDICATED_ASSET_TRANSFORMS = Object.freeze({
  // The anime rigs and Xbot face +Z and need the standard half-turn. The
  // supplied Soldier already faces -Z, matching the viewer convention.
  "characters/professional-soldier": Object.freeze({ rotationY: 0 }),
});

const dedicatedGlbRecords = CHARACTER_VISUAL_PROFILES.map((profile) => {
  const transform = DEDICATED_ASSET_TRANSFORMS[profile.asset.manifestId] ?? {};
  return makeRecord({
    id: profile.asset.manifestId,
    fileName: `${profile.asset.manifestId}.glb`,
    format: "glb",
    characterIds: [`${profile.identityKey}-v1`],
    priority: 100,
    license: "user-supplied",
    ...transform,
  });
});

const BASE_MODEL_PRESETS = Object.freeze([
  Object.freeze({ id: "bases/vroid-avatar-a-feminine", fileName: "AvatarSample_A.vrm", gender: "feminine", roles: ["shepherd", "tanner", "scholar"] }),
  Object.freeze({ id: "bases/vroid-avatar-b-feminine", fileName: "AvatarSample_B.vrm", gender: "feminine", roles: ["receptionist", "merchant", "bard"] }),
  Object.freeze({ id: "bases/vroid-victoria-feminine", fileName: "Victoria_Rubin.vrm", gender: "feminine", roles: ["priest", "receptionist", "scholar"] }),
  Object.freeze({ id: "bases/vroid-vita-feminine", fileName: "Vita.vrm", gender: "feminine", roles: ["merchant", "shepherd", "cartographer"] }),
  Object.freeze({ id: "bases/vroid-shino-feminine", fileName: "Sendagaya_Shino.vrm", gender: "feminine", roles: ["tanner", "priest", "villager"] }),
  Object.freeze({ id: "bases/vroid-avatar-c-masculine", fileName: "AvatarSample_C.vrm", gender: "masculine", roles: ["ninja", "smith", "watchman"] }),
  Object.freeze({ id: "bases/vroid-sakurada-masculine", fileName: "Sakurada_Fumiriya.vrm", gender: "masculine", roles: ["swordsman", "scholar", "bard"] }),
  Object.freeze({ id: "bases/vroid-hair-male-masculine", fileName: "HairSample_Male.vrm", gender: "masculine", roles: ["child", "merchant", "farmer", "fisher", "tanner", "cartographer", "villager"] }),
]);

function stableIndex(value, length) {
  let hash = 2_166_136_261;
  for (const symbol of String(value || "")) {
    hash ^= symbol.codePointAt(0) || 0;
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return length > 0 ? hash % length : 0;
}

const assignedProfilesByBaseId = new Map(BASE_MODEL_PRESETS.map((preset) => [preset.id, []]));
for (const profile of CHARACTER_VISUAL_PROFILES) {
  const genderMatches = BASE_MODEL_PRESETS.filter((preset) => preset.gender === profile.presentation.gender);
  const forcedChild = profile.presentation.lifeStage === "child"
    ? genderMatches.find((preset) => preset.id === "bases/vroid-avatar-c-masculine")
    : null;
  const minimumUsage = Math.min(...genderMatches.map((preset) => assignedProfilesByBaseId.get(preset.id).length));
  const leastUsed = genderMatches.filter((preset) => assignedProfilesByBaseId.get(preset.id).length === minimumUsage);
  const role = profile.fallback?.archetype || profile.profession?.key || "";
  const roleMatches = leastUsed.filter((preset) => preset.roles.some((candidate) => role.includes(candidate)));
  const candidates = roleMatches.length > 0 ? roleMatches : leastUsed;
  const selected = forcedChild ?? candidates[stableIndex(profile.identityKey, candidates.length)];
  assignedProfilesByBaseId.get(selected.id).push(profile);
}

const vrmFallbackRecords = BASE_MODEL_PRESETS.map((preset) => makeRecord({
  id: preset.id,
  fileName: preset.fileName,
  format: "vrm",
  characterIds: assignedProfilesByBaseId.get(preset.id).map((profile) => `${profile.identityKey}-v1`),
  priority: 20,
  license: "VRoid Studio Sample Model Terms",
}));

export const TRUSTED_AVATAR_ASSET_ALLOWLIST = Object.freeze([
  ...dedicatedGlbRecords,
  ...vrmFallbackRecords,
]);

const assetsById = new Map(TRUSTED_AVATAR_ASSET_ALLOWLIST.map((asset) => [asset.id, asset]));
const assetsByCharacterId = new Map();
for (const asset of TRUSTED_AVATAR_ASSET_ALLOWLIST) {
  for (const characterId of asset.characterIds) {
    const candidates = assetsByCharacterId.get(characterId) ?? [];
    candidates.push(asset);
    assetsByCharacterId.set(characterId, candidates);
  }
}
for (const [characterId, candidates] of assetsByCharacterId) {
  candidates.sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
  assetsByCharacterId.set(characterId, Object.freeze(candidates));
}

export function getTrustedAvatarAsset(assetId) {
  return assetsById.get(String(assetId || "")) ?? null;
}

export function resolveTrustedAvatarAsset(characterId, availableAssetIds) {
  const candidates = assetsByCharacterId.get(String(characterId || "")) ?? [];
  if (!availableAssetIds) return candidates[0] ?? null;
  const available = availableAssetIds instanceof Set ? availableAssetIds : new Set(availableAssetIds);
  return candidates.find((asset) => available.has(asset.id)) ?? null;
}

export function isTrustedAvatarAssetPath(urlPath) {
  const candidate = String(urlPath || "");
  return TRUSTED_AVATAR_ASSET_ALLOWLIST.some((asset) => asset.url === candidate);
}
