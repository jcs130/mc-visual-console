export const CAMERA_SETTINGS_KEY = 'minecraft.viewer.director.v1';
const number = (v, lo, hi, fallback) => typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
export function normalizeCameraSettings(value) {
  const v = value?.version === 1 ? value : {};
  return { version: 1, mode: ['manual', 'follow', 'shoulder', 'front', 'orbit', 'overhead'].includes(v.mode) ? v.mode : 'manual',
    distance: number(v.distance, 2, 12, 4), height: number(v.height, .2, 6, 1.1),
    smoothTime: number(v.smoothTime, .08, 1.5, .35), turnSpeed: number(v.turnSpeed, .3, 5, 1.6),
    orbitSpeed: number(v.orbitSpeed, 2, 35, 12), fov: number(v.fov, 30, 110, 75), collision: v.collision !== false };
}
export function loadCameraSettings(storage) {
  try { return normalizeCameraSettings(JSON.parse(storage?.getItem(CAMERA_SETTINGS_KEY))); } catch { return normalizeCameraSettings(null); }
}
