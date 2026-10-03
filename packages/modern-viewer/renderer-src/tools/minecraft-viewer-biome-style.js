/** Lightweight biome art direction. The 1.20.6 block atlas and mesher UVs stay untouched. */
const cortiBiomeProfiles = Object.freeze({
  temperate: { fog: '#a7c9dd', sky: '#b9dcf1', sun: '#fff0d9', fill: '#e0eef0', saturation: 1.09, contrast: 1.03, brightness: 1.02, warmth: 0 },
  forest:    { fog: '#a0c9c5', sky: '#aed6df', sun: '#fff0d7', fill: '#d5e9da', saturation: 1.11, contrast: 1.04, brightness: 1.02, warmth: 0 },
  jungle:    { fog: '#97caba', sky: '#a7d9d7', sun: '#fff0d3', fill: '#cee9d1', saturation: 1.14, contrast: 1.04, brightness: 1.03, warmth: 0 },
  arid:      { fog: '#d8c7a7', sky: '#d6dbe1', sun: '#ffe4bd', fill: '#f0e4ce', saturation: 1.07, contrast: 1.04, brightness: 1.03, warmth: 0.04 },
  badlands:  { fog: '#d9bba7', sky: '#d9cbd2', sun: '#ffdfbb', fill: '#f2dbce', saturation: 1.13, contrast: 1.05, brightness: 1.02, warmth: 0.05 },
  cold:      { fog: '#b6d5e5', sky: '#c5e1f3', sun: '#f3f4ed', fill: '#d7e9f2', saturation: 1.05, contrast: 1.03, brightness: 1.04, warmth: 0 },
  swamp:     { fog: '#aabfae', sky: '#bbd1cb', sun: '#f5e8cb', fill: '#d6e4d0', saturation: 1.07, contrast: 1.04, brightness: 1.02, warmth: 0.02 },
  cherry:    { fog: '#d4c7d9', sky: '#e4d5e8', sun: '#ffe8df', fill: '#f1e4ed', saturation: 1.12, contrast: 1.03, brightness: 1.04, warmth: 0.02 },
  ocean:     { fog: '#a3cadc', sky: '#b6d9ec', sun: '#f2efdc', fill: '#d5e8ee', saturation: 1.08, contrast: 1.03, brightness: 1.02, warmth: 0 },
  mushroom:  { fog: '#c6c3d7', sky: '#d8d7e9', sun: '#f8e9de', fill: '#e7e0ec', saturation: 1.09, contrast: 1.03, brightness: 1.02, warmth: 0.01 },
  nether:    { fog: '#9a514c', sky: '#ae6861', sun: '#ffbc8a', fill: '#d6a39a', saturation: 1.12, contrast: 1.05, brightness: 1.02, warmth: 0.05 },
  end:       { fog: '#afa1c4', sky: '#bbb0d0', sun: '#e9dbf7', fill: '#d9d0e5', saturation: 1.07, contrast: 1.04, brightness: 1.02, warmth: 0 },
});

function cortiResolveBiomeStyle(name, dimension = 'minecraft:overworld') {
  const key = String(name || 'plains').replace(/^minecraft:/, '').toLowerCase();
  const realm = String(dimension || '').replace(/^minecraft:/, '').toLowerCase();
  let group = 'temperate';
  if (realm === 'the_nether' || /^(nether_wastes|crimson_forest|warped_forest|soul_sand_valley|basalt_deltas)$/.test(key)) group = 'nether';
  else if (realm === 'the_end' || /^(the_end|end_highlands|end_midlands|end_barrens|small_end_islands|the_void)$/.test(key)) group = 'end';
  else if (key === 'cherry_grove') group = 'cherry';
  else if (/mushroom|fungal/.test(key)) group = 'mushroom';
  else if (/swamp|mangrove|marsh|bog/.test(key)) group = 'swamp';
  else if (/badlands|mesa|canyon/.test(key)) group = 'badlands';
  else if (/snow|frozen|ice|glacier|tundra|alpine|jagged_peaks|cold_ocean|stony_peaks/.test(key) || key === 'grove') group = 'cold';
  else if (/jungle|bamboo|rainforest|tropical/.test(key)) group = 'jungle';
  else if (/desert|savanna|shrub|steppe|prairie|beach|stony_shore/.test(key)) group = 'arid';
  else if (/ocean|river|lake|coast/.test(key)) group = 'ocean';
  else if (/forest|taiga|woods|grove|lush_caves/.test(key)) group = 'forest';
  return { name: key, dimension: realm || 'overworld', group, ...cortiBiomeProfiles[group] };
}

let cortiBiomeTarget = cortiResolveBiomeStyle('plains');
let cortiBiomeCurrent = null;
let cortiBiomeTimer = null;
let cortiViewerLight = null;
let cortiNightVisionMode = (() => {
  try {
    const saved = localStorage.getItem('minecraft-viewer-night-vision');
    return ['auto', 'on', 'off'].includes(saved) ? saved : 'auto';
  } catch { return 'auto'; }
})();
let cortiNightVisionCurrent = 0;

function cortiNightVisionTarget() {
  if (cortiNightVisionMode === 'on') return 1;
  if (cortiNightVisionMode === 'off' || !cortiViewerLight || cortiViewerLight.sky > 1) return 0;
  return Math.max(0, Math.min(1, (12 - cortiViewerLight.block) / 8));
}

function cortiUpdateNightVisionButton() {
  const button = document.getElementById('corti-night-vision-toggle');
  if (!button) return;
  const active = cortiNightVisionTarget() > 0.05;
  button.dataset.active = String(active);
  button.textContent = cortiNightVisionMode === 'auto'
    ? `夜视 自动${active ? ' · 开' : ''}` : `夜视 ${cortiNightVisionMode === 'on' ? '开' : '关'}`;
}

function cortiSetViewerLight(state) {
  cortiViewerLight = state && Number.isInteger(state.sky) && state.sky >= 0 && state.sky <= 15
    && Number.isInteger(state.block) && state.block >= 0 && state.block <= 15
    ? { sky: state.sky, block: state.block } : null;
  cortiUpdateNightVisionButton();
}

function cortiSetNightVisionMode(mode) {
  if (!['auto', 'on', 'off'].includes(mode)) return;
  cortiNightVisionMode = mode;
  try { localStorage.setItem('minecraft-viewer-night-vision', mode); } catch { /* private mode */ }
  cortiUpdateNightVisionButton();
}

if (typeof socket !== 'undefined') socket.on('lightingState', cortiSetViewerLight);

function cortiSetBiome(event) {
  if (!event || typeof event.name !== 'string' || !/^[a-z0-9_./:-]{1,96}$/.test(event.name)) return;
  cortiBiomeTarget = cortiResolveBiomeStyle(event.name, event.dimension);
  const canvas = document.getElementById('viewer-canvas');
  if (canvas) {
    canvas.dataset.biome = cortiBiomeTarget.name;
    canvas.dataset.biomeStyle = cortiBiomeTarget.group;
  }
}

function cortiKeepSurfaceSky(skybox) {
  if (!skybox || skybox.cortiSurfaceSkyLocked || typeof skybox.updateWaterState !== 'function') return;
  // At the surface the eye crosses the water line every few frames. The renderer
  // switches the whole scene to blue fog on each crossing, causing a full-screen
  // flash. Keep the ordinary sky/fog while water blocks and oxygen stay intact.
  const updateWaterState = skybox.updateWaterState.bind(skybox);
  skybox.updateWaterState = (_inWater, waterBreathing) => updateWaterState(false, waterBreathing);
  skybox.cortiSurfaceSkyLocked = true;
  skybox.updateWaterState(false, false);
}

function cortiInitializeBiomeStyle() {
  const world = globalThis.world;
  const skybox = world?.skyboxRenderer;
  if (!world?.renderer || !skybox || cortiBiomeTimer !== null) return;
  cortiKeepSurfaceSky(skybox);
  // Upstream marks starfield cannotBeDisabled, so the config's false value is
  // ignored. Its points render inside caves at night; disable the module itself.
  const starfield = world.getModule?.('starfield');
  if (starfield) {
    starfield.enablementCheck = () => false;
    starfield.disable?.();
  }
  const ColorType = world.ambientLight.color.constructor;
  cortiBiomeCurrent = {
    fog: new ColorType(cortiBiomeTarget.fog),
    sky: new ColorType(cortiBiomeTarget.sky),
    sun: new ColorType(cortiBiomeTarget.sun),
    fill: new ColorType(cortiBiomeTarget.fill),
    saturation: cortiBiomeTarget.saturation,
    contrast: cortiBiomeTarget.contrast,
    brightness: cortiBiomeTarget.brightness,
    warmth: cortiBiomeTarget.warmth,
  };

  const updateSky = skybox.updateSkyColors.bind(skybox);
  skybox.updateSkyColors = (...args) => {
    const result = updateSky(...args);
    // Keep the renderer's server-time sky and fog range on either side of water.
    // A restrained palette mix gives the camera biome character without hiding terrain.
    if (world.realScene?.fog?.color && cortiBiomeCurrent) {
      world.realScene.fog.color.lerp(cortiBiomeCurrent.fog, 0.14);
      world.realScene.background?.lerp?.(cortiBiomeCurrent.fog, 0.10);
      skybox.skyMesh?.material?.color?.lerp?.(cortiBiomeCurrent.sky, 0.14);
    }
    return result;
  };

  // The terrain lightmap keeps its block/sky light gradient. Night vision
  // raises only the dark end, leaving day light and directional shadows intact.
  world.chunkMeshManager?.setBlockLightmapParams?.({ minBrightness: 0.18, curve: 0.08, gamma: 0.98 });
  const nightVisionButton = document.getElementById('corti-night-vision-toggle');
  nightVisionButton?.addEventListener('click', () => {
    const modes = ['auto', 'on', 'off'];
    cortiSetNightVisionMode(modes[(modes.indexOf(cortiNightVisionMode) + 1) % modes.length]);
  });
  cortiUpdateNightVisionButton();
  const canvas = document.getElementById('viewer-canvas');
  if (canvas) canvas.style.transition = 'filter 1.4s ease';
  cortiSetBiome({ name: cortiBiomeTarget.name, dimension: cortiBiomeTarget.dimension });
  const desired = new ColorType();
  const dawn = new ColorType('#ffdbaf');
  cortiBiomeTimer = setInterval(() => {
    if (!globalThis.world || !cortiBiomeCurrent) return;
    const current = cortiBiomeCurrent;
    for (const key of ['fog', 'sky', 'sun', 'fill']) current[key].lerp(desired.set(cortiBiomeTarget[key]), 0.12);
    for (const key of ['saturation', 'contrast', 'brightness', 'warmth']) {
      current[key] += (cortiBiomeTarget[key] - current[key]) * 0.12;
    }
    const daylight = pendingTime === null ? 1 : minecraftLightLevels(pendingTime).daylight;
    const twilight = Math.max(0, 1 - Math.abs(daylight - 0.45) / 0.45);
    world.directionalLight?.color?.copy(current.sun).lerp(dawn, twilight * 0.25);
    world.ambientLight?.color?.copy(current.fill);
    if (avatarPresentationLights?.fill?.color) avatarPresentationLights.fill.color.copy(current.fill);
    cortiNightVisionCurrent += (cortiNightVisionTarget() - cortiNightVisionCurrent) * 0.16;
    world.chunkMeshManager?.setBlockLightmapParams?.({
      minBrightness: 0.18 + 0.42 * cortiNightVisionCurrent,
      curve: 0.08,
      gamma: 0.98 - 0.10 * cortiNightVisionCurrent,
    });
    const ambient = Number(viewer?.playerState?.reactive?.ambientLight);
    if (Number.isFinite(ambient) && world.ambientLight) {
      world.ambientLight.intensity = (ambient + 0.38 * cortiNightVisionCurrent) * Math.PI;
    }
    if (canvas) {
      const rain = pendingWeather.raining ? 0.95 : 1;
      canvas.style.filter = `saturate(${(current.saturation * rain).toFixed(3)}) contrast(${current.contrast.toFixed(3)}) brightness(${current.brightness.toFixed(3)}) sepia(${current.warmth.toFixed(3)})`;
    }
  }, 90);
  window.addEventListener('beforeunload', () => {
    if (cortiBiomeTimer !== null) clearInterval(cortiBiomeTimer);
    cortiBiomeTimer = null;
  }, { once: true });
}

globalThis.__cortiBiomeStyle = {
  get biome() { return cortiBiomeTarget.name; },
  get group() { return cortiBiomeTarget.group; },
  get dimension() { return cortiBiomeTarget.dimension; },
  get lightmapFloor() { return globalThis.world?.chunkMeshManager?.legacyShaderMaterial?.uniforms?.u_minBrightness?.value ?? null; },
  get nightVisionMode() { return cortiNightVisionMode; },
  get nightVisionStrength() { return cortiNightVisionCurrent; },
  get playerLight() { return cortiViewerLight; },
};
