import { getTrustedAvatarAsset } from "./trusted-avatar-manifest.js";

/**
 * Fixed, local-only choices for the controlled player's complete 3D body.
 *
 * The dashboard sends only one of these ids. Asset paths stay inside the
 * trusted avatar manifest, so a chat message or browser caller cannot turn the
 * chooser into an arbitrary URL/GLB loader.
 */
export const PLAYER_MODEL_SCHEMA_VERSION = 1;
export const DEFAULT_PLAYER_MODEL_ID = "ember-wayfarer";

export const PLAYER_MODELS = Object.freeze([
  Object.freeze({
    id: "ember-wayfarer",
    label: "星火旅人",
    subtitle: "精致日系男性 · 玩家推荐",
    kind: "trusted-avatar",
    assetId: "bases/vroid-sakurada-masculine",
    presentation: "masculine",
    accent: "ember",
  }),
  Object.freeze({
    id: "azure-ranger",
    label: "青风游侠",
    subtitle: "轻装日系男性 · 青蓝短发",
    kind: "trusted-avatar",
    assetId: "bases/vroid-hair-male-masculine",
    presentation: "masculine",
    accent: "azure",
  }),
  Object.freeze({
    id: "quiet-moon",
    label: "静月祈愿",
    subtitle: "精致日系女性 · 暗色长发",
    kind: "trusted-avatar",
    assetId: "bases/vroid-shino-feminine",
    presentation: "feminine",
    accent: "violet",
  }),
  Object.freeze({
    id: "blue-starlight",
    label: "蔚蓝星辉",
    subtitle: "华丽日系女性 · 金发蓝眸",
    kind: "trusted-avatar",
    assetId: "bases/vroid-victoria-feminine",
    presentation: "feminine",
    accent: "starlight",
  }),
  Object.freeze({
    id: "dawn-vita",
    label: "晨光维塔",
    subtitle: "轻盈日系女性 · 明亮旅装",
    kind: "trusted-avatar",
    assetId: "bases/vroid-vita-feminine",
    presentation: "feminine",
    accent: "dawn",
  }),
  Object.freeze({
    id: "minecraft-classic",
    label: "原版方块人",
    subtitle: "兼容模式 · 可使用下方四套皮肤",
    kind: "minecraft-classic",
    assetId: null,
    presentation: "classic",
    accent: "pixel",
  }),
]);

const PLAYER_MODELS_BY_ID = new Map(PLAYER_MODELS.map((model) => [model.id, model]));

for (const model of PLAYER_MODELS) {
  if (model.kind === "trusted-avatar" && !getTrustedAvatarAsset(model.assetId)) {
    throw new Error(`player model references an untrusted avatar asset: ${model.id}`);
  }
}

export function isPlayerModelId(value) {
  return typeof value === "string" && PLAYER_MODELS_BY_ID.has(value);
}

export function resolvePlayerModel(value = DEFAULT_PLAYER_MODEL_ID) {
  return PLAYER_MODELS_BY_ID.get(value) ?? PLAYER_MODELS_BY_ID.get(DEFAULT_PLAYER_MODEL_ID);
}
