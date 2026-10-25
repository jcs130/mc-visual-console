/** Display policy for the pinned minecraft-renderer 0.1.96. No gameplay writes. */
export const SCENE_SETTINGS_KEY = 'minecraft.viewer.scene.v1';
const choice = (value, values, fallback) => values.includes(value) ? value : fallback;
export function normalizeSceneSettings(value) {
  const v = value?.version === 1 ? value : {};
  return { version: 1, quality: choice(v.quality, ['auto', 'high', 'balanced', 'performance'], 'auto'),
    style: choice(v.style, ['native', 'soft', 'cinematic'], 'soft'),
    avatarSampling: choice(v.avatarSampling, ['auto', 'original', 'smooth'], 'auto'),
    occlusion: v.occlusion !== false,
    particles: v.particles !== false, effectCues: v.effectCues !== false,
    weather: v.weather !== false, shadows: v.shadows !== false };
}
export function loadSceneSettings(storage, overrides = {}) {
  let saved; try { saved = JSON.parse(storage?.getItem(SCENE_SETTINGS_KEY)); } catch {}
  const settings = normalizeSceneSettings(saved);
  for (const key of ['quality', 'style', 'avatarSampling']) if (overrides[key] != null) settings[key] = overrides[key];
  return normalizeSceneSettings(settings);
}
export function resolveSceneQuality(settings, { mode = 'balanced', view = 'first', gameMode = null, overlay = false, sectionReady = false, observerCullReady = false } = {}) {
  const s = normalizeSceneSettings(settings);
  const tier = choice(mode, ['high', 'balanced', 'performance'], 'balanced');
  // Observer views need the camera + revealed-room seed adapter before culling.
  const reason = overlay ? 'overlay' : !s.occlusion ? 'disabled' : view !== 'first' && !observerCullReady ? 'observer'
    : view === 'first' && !['survival', 'adventure'].includes(gameMode) ? (gameMode === 'spectator' ? 'spectator' : 'unconfirmed-mode')
    : !sectionReady ? 'loading-section' : null;
  return { mode: tier, style: s.style,
    smartCull: reason === null, cullingReason: reason,
    shadows: s.shadows && !overlay && s.style === 'cinematic' && tier === 'high',
    avatarSampling: s.avatarSampling === 'auto' ? 'original' : s.avatarSampling,
    anisotropy: tier === 'high' ? 8 : tier === 'balanced' ? 4 : 1 };
}
/** Presentation only: retain the actual weather in the connection state. */
export function applySceneWeather(backend, settings, weather) {
  const enabled = settings?.weather !== false && weather?.raining === true;
  backend?.setRain?.(enabled);
  return enabled;
}
export function applySceneQuality(world, policy) {
  if (!world || !policy) return;
  // Both gates are required: upstream's debug smartCull defaults to false.
  if (world.worldRendererConfig && world.worldRendererConfig.smartCull !== policy.smartCull) world.worldRendererConfig.smartCull = policy.smartCull;
  if (world.reactiveDebugParams && world.reactiveDebugParams.smartCull !== policy.smartCull) world.reactiveDebugParams.smartCull = policy.smartCull;
  if (world.renderer?.shadowMap && world.renderer.shadowMap.enabled !== policy.shadows) {
    world.renderer.shadowMap.enabled = policy.shadows;
    world.renderer.shadowMap.needsUpdate = true;
  }
}
/** One existing compositor pass; style stays independent of the frame budget. */
export function sceneColourFilter(profile, policy, rain = 1) {
  if (!policy || policy.style === 'native') return 'none';
  const cinema=policy.style==='cinematic',strength=cinema ? 1 : .55;
  const mix = (value, fallback = 1) => fallback + ((Number.isFinite(value) ? value : fallback) - fallback) * strength;
  return `saturate(${(mix(profile.saturation) * rain * (cinema ? .90 : 1.08)).toFixed(3)}) contrast(${(mix(profile.contrast)*(cinema ? 1.15 : .96)).toFixed(3)}) brightness(${(mix(profile.brightness)*(cinema ? .98 : 1.04)).toFixed(3)}) sepia(${(mix(profile.warmth,0)+(cinema ? .06 : .02)).toFixed(3)})`;
}
