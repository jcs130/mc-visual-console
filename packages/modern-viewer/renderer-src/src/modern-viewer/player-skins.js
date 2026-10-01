import lanternWardenTexture from "../../public/skins/lantern-warden.png";
import nightWatchTexture from "../../public/skins/night-watch.png";
import thousandLightsTexture from "../../public/skins/thousand-lights.png";
import wildCartographerTexture from "../../public/skins/wild-cartographer.png";

export const DEFAULT_PLAYER_SKIN_ID = "lantern-warden";

export const PLAYER_SKINS = Object.freeze([
  Object.freeze({
    id: "lantern-warden",
    label: "玩家正装",
    subtitle: "青黛守灯袍 · 琥珀提灯纹",
    model: "classic",
    texture: lanternWardenTexture,
  }),
  Object.freeze({
    id: "thousand-lights",
    label: "千灯祷衣",
    subtitle: "月白祷衣 · 湖蓝与金线",
    model: "classic",
    texture: thousandLightsTexture,
  }),
  Object.freeze({
    id: "night-watch",
    label: "守夜铁衣",
    subtitle: "炭黑短甲 · 炉火护肩",
    model: "classic",
    texture: nightWatchTexture,
  }),
  Object.freeze({
    id: "wild-cartographer",
    label: "荒野测绘",
    subtitle: "苔绿旅装 · 羊皮地图袋",
    model: "classic",
    texture: wildCartographerTexture,
  }),
]);

const PLAYER_SKINS_BY_ID = new Map(PLAYER_SKINS.map((skin) => [skin.id, skin]));

export function isPlayerSkinId(value) {
  return typeof value === "string" && PLAYER_SKINS_BY_ID.has(value);
}

export function resolvePlayerSkin(value = DEFAULT_PLAYER_SKIN_ID) {
  return PLAYER_SKINS_BY_ID.get(value) ?? PLAYER_SKINS_BY_ID.get(DEFAULT_PLAYER_SKIN_ID);
}
