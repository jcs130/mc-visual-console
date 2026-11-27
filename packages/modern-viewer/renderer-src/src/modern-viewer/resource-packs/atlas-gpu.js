import { Texture, CanvasTexture, NearestFilter, LinearFilter, Box2, Vector2 } from 'three';
import { AtlasAnimationClock, blendFrameBytes } from './atlas-animation.js';

function bounded(promise, label, timeoutMs) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(Error(label)), timeoutMs);
  })]).finally(() => clearTimeout(timer));
}

export async function installAtlasAnimations(world, {
  fetcher = fetch, decodeImage = blob => createImageBitmap(blob, { premultiplyAlpha: 'none' }),
  createCanvas = () => document.createElement('canvas'), onProgress = () => {}, timeoutMs = 12000,
} = {}) {
  const abort = new AbortController(), sources = new Map();
  const progress = { loading: true, phase: 'manifest', loaded: 0, total: 0, active: [], errors: 0 };
  const publish = () => onProgress({ ...progress, active: [...progress.active] });
  const get = async url => {
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(timeoutMs)]);
    const response = await bounded(fetcher(url, { signal }), 'ATLAS_FETCH_TIMEOUT:' + url, timeoutMs);
    if (!response.ok) throw Error('ATLAS_HTTP_' + response.status + ':' + url);
    return response;
  };
  publish();
  const spec = globalThis.bundledAtlasAnimationManifest ?? await (await get('/atlas-animations.json')).json();
  if (spec.schemaVersion !== 1) throw Error('ATLAS_ANIMATION_SCHEMA');
  const clock = new AtlasAnimationClock(spec.sprites);
  progress.phase = 'images';
  progress.total = clock.rows.length;
  let cursor = 0;
  async function loadImages() {
    while (cursor < clock.rows.length) {
      const row = clock.rows[cursor++];
      progress.active.push(row.url);
      publish();
      try {
        if (!/^\/textures\/[0-9.]+\/[a-z0-9_./-]+\.png$/.test(row.url) || row.url.includes('..')) throw Error('ANIMATION_IMAGE_PATH');
        const blob = await (await get(row.url)).blob();
        const image = await bounded(decodeImage(blob), 'ATLAS_DECODE_TIMEOUT:' + row.url, timeoutMs);
        if (image.width !== row.width || image.height !== row.height) {
          image.close?.();
          throw Error('ANIMATION_IMAGE_DIMENSION:' + row.url);
        }
        const texture = new Texture(image);
        texture.flipY = texture.generateMipmaps = false;
        texture.minFilter = texture.magFilter = NearestFilter;
        texture.needsUpdate = true;
        const source = { texture, image };
        if (row.animation.interpolate) {
          const sheet = createCanvas();
          sheet.width = image.width; sheet.height = image.height;
          const ctx = sheet.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(image, 0, 0);
          const { frameWidth: w, frameHeight: h, columns } = row.animation;
          source.frames = new Map();
          for (const { index } of row.animation.frames) {
            if (!source.frames.has(index)) source.frames.set(index, ctx.getImageData(index % columns * w, Math.floor(index / columns) * h, w, h));
          }
          const canvas = createCanvas();
          canvas.width = w; canvas.height = h;
          source.ctx = canvas.getContext('2d');
          source.output = source.ctx.createImageData(w, h);
          source.blend = new CanvasTexture(canvas);
          source.blend.flipY = source.blend.generateMipmaps = false;
          source.blend.minFilter = source.blend.magFilter = NearestFilter;
        }
        sources.set(row.id, source);
        progress.loaded++;
      } catch (error) {
        // Preserve the atlas's original first frame for this sprite. Independent sprites continue.
        progress.errors++;
        progress.lastError = String(error.message);
        console.warn('Atlas sprite unavailable:', row.id, progress.lastError);
      } finally {
        progress.active = progress.active.filter(url => url !== row.url);
        publish();
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, clock.rows.length) }, loadImages));
  progress.loading = false; progress.phase = 'ready'; publish();
  const stats = { loading: false, sprites: sources.size, copies: 0, frames: 0, errors: progress.errors, lastError: progress.lastError };
  const previous = world.scene.onBeforeRender, start = performance.now();
  const region = new Box2(), position = new Vector2();
  let lastTick = -1, blocks, items;
  function advance(now) {
    const tick = Math.floor((now - start) / 50);
    if (tick === lastTick) return;
    lastTick = tick;
    if (blocks !== world.material?.map || items !== world.itemsTexture) {
      blocks = world.material?.map; items = world.itemsTexture;
      for (const row of clock.rows) row.last = null;
    }
    const copies = [], last = {};
    clock.tick(tick, copy => {
      if (!sources.has(copy.row.id)) return;
      const dst = copy.target.atlas === 'blocks' ? blocks : items;
      if (!dst?.image) return;
      const { x, y, width, height } = copy.target;
      if (x + width > dst.image.width || y + height > dst.image.height) {
        const message = 'ANIMATION_DESTINATION_MISMATCH:' + copy.row.id;
        if (stats.lastError !== message) { stats.errors++; stats.lastError = message; }
        return;
      }
      last[copy.target.atlas] = copies.length;
      copies.push({ ...copy, dst });
    });
    for (const [i, { row, target, frame, x, y, dst }] of copies.entries()) {
      const source = sources.get(row.id);
      let tex = source.texture, box = region;
      region.min.set(x, y); region.max.set(x + target.width, y + target.height);
      if (source.blend) {
        const a = source.frames.get(frame.index), b = source.frames.get(frame.nextIndex);
        source.output.data.set(blendFrameBytes(a.data, b.data, frame.blend));
        source.ctx.putImageData(source.output, 0, 0);
        source.blend.needsUpdate = true;
        tex = source.blend; box = null;
      }
      const original = dst.generateMipmaps;
      dst.generateMipmaps = last[target.atlas] === i && ![NearestFilter, LinearFilter].includes(dst.minFilter);
      try {
        world.renderer.copyTextureToTexture(tex, dst, box, position.set(target.x, target.y));
        stats.copies++;
      } finally { dst.generateMipmaps = original; }
    }
    stats.frames++;
  }
  function render(...args) {
    try { advance(performance.now()); } catch (error) {
      stats.errors++; stats.lastError = String(error.message);
      if (stats.errors === 1) console.warn('Atlas animation failed', stats.lastError);
    }
    return previous?.apply(this, args);
  }
  world.scene.onBeforeRender = render;
  return { stats: () => ({ ...stats }), dispose() {
    if (world.scene.onBeforeRender === render) world.scene.onBeforeRender = previous;
    abort.abort();
    for (const s of sources.values()) { s.texture.dispose(); s.blend?.dispose(); s.image.close?.(); }
    sources.clear();
  } };
}
