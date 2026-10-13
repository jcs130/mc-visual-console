import { OrthographicCamera, Vector3 } from 'three';

const coordinate = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 30_000_000;
const tuple = (value, size) => Array.isArray(value) && value.length === size && value.every(coordinate);

/** A bounded, north-up photograph of already received terrain. No world/socket requests. */
export function overviewSpec(input = {}, position, width, height) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('overview must be an object');
  if (Object.keys(input).some(key => !['center', 'span', 'grid', 'markers'].includes(key))) throw new Error('unknown overview field');
  const center = input.center ?? [position?.x, position?.z];
  const span = input.span ?? 32, grid = input.grid ?? 4, markers = input.markers ?? [];
  if (!tuple(center, 2)) throw new Error('overview center requires finite [x,z]');
  if (typeof span !== 'number' || !Number.isFinite(span) || span < 8 || span > 96) throw new Error('overview span must be 8..96 blocks');
  if (![0, 1, 2, 4, 8, 16].includes(grid)) throw new Error('overview grid must be 0,1,2,4,8,16');
  if (!Number.isInteger(width) || width < 640 || width > 1920 || !Number.isInteger(height) || height < 360 || height > 1080) throw new Error('invalid overview image size');
  if (!Array.isArray(markers) || markers.length > 8 || markers.some(marker => !marker ||
    typeof marker !== 'object' || Array.isArray(marker) || Object.keys(marker).some(key => !['at', 'label'].includes(key)) ||
    !tuple(marker.at, 3) || (marker.label !== undefined && (typeof marker.label !== 'string' || marker.label.length > 24 || /[\u0000-\u001f\u007f]/u.test(marker.label)))))
    throw new Error('overview markers: at most 8 {at:[x,y,z],label?:short text}');
  const depth = span * height / width;
  return { center: [...center], span, grid, width, height, markers,
    bounds: { minX: center[0] - span / 2, maxX: center[0] + span / 2,
      minZ: center[1] - depth / 2, maxZ: center[1] + depth / 2 } };
}

export function overviewCamera(spec, origin, minY, maxY) {
  if (![minY, maxY].every(Number.isFinite) || maxY <= minY) throw new Error('world vertical bounds unavailable');
  const camera = new OrthographicCamera(-spec.span / 2, spec.span / 2,
    (spec.bounds.maxZ - spec.bounds.minZ) / 2, -(spec.bounds.maxZ - spec.bounds.minZ) / 2, .1, maxY - minY + 32);
  const at = [spec.center[0], maxY + 8, spec.center[1]];
  camera.position.set(origin.toSceneX(at[0]), origin.toSceneY(at[1]), origin.toSceneZ(at[2]));
  camera.up.set(0, 0, -1);
  camera.lookAt(origin.toSceneX(at[0]), origin.toSceneY(minY), origin.toSceneZ(at[2]));
  camera.updateMatrixWorld(true);
  return { camera, at };
}

export function overviewProject(at, camera, origin, width, height) {
  const p = new Vector3(origin.toSceneX(at[0]), origin.toSceneY(at[1]), origin.toSceneZ(at[2])).project(camera);
  return { pixel: [(p.x + 1) * width / 2, (1 - p.y) * height / 2],
    inFrame: p.x >= -1 && p.x <= 1 && p.y >= -1 && p.y <= 1 && p.z >= -1 && p.z <= 1 };
}

export function overviewCoverage(bounds, finishedChunks) {
  let total = 0, meshed = 0;
  const missing = [];
  for (let x = Math.floor(bounds.minX / 16) * 16; x < bounds.maxX; x += 16) {
    for (let z = Math.floor(bounds.minZ / 16) * 16; z < bounds.maxZ; z += 16) {
      total++;
      if (finishedChunks?.[`${x},${z}`]) meshed++;
      else missing.push([x, z]);
    }
  }
  return { total, meshed, missing };
}

function label(ctx, text, x, y, color = '#fff', align = 'left') {
  ctx.save(); ctx.font = 'bold 15px "Segoe UI", "Microsoft YaHei", sans-serif';
  ctx.textBaseline = 'top';
  const w = ctx.measureText(text).width + 12;
  x = Math.max(3, Math.min(ctx.canvas.width - w - 3, align === 'right' ? x - w : x));
  y = Math.max(3, Math.min(ctx.canvas.height - 24, y));
  ctx.fillStyle = 'rgba(7,16,24,.84)'; ctx.fillRect(x, y, w, 23);
  ctx.fillStyle = color; ctx.fillText(text, x + 6, y + 2); ctx.restore();
}

export function annotateOverview(ctx, spec, project, coverage, pins, player, dimension) {
  const { width, height, bounds, grid } = spec;
  for (const [x, z] of coverage.missing) {
    const [left, top] = project([x, 0, z]).pixel, [right, bottom] = project([x + 16, 0, z + 16]).pixel;
    ctx.fillStyle = 'rgba(12,19,28,.94)'; ctx.fillRect(left, top, right - left, bottom - top);
    ctx.save(); ctx.beginPath(); ctx.rect(left, top, right - left, bottom - top); ctx.clip();
    ctx.strokeStyle = '#465565'; ctx.lineWidth = 1;
    for (let n = left - height; n < right; n += 18) { ctx.beginPath(); ctx.moveTo(n, top); ctx.lineTo(n + height, bottom); ctx.stroke(); }
    ctx.restore();
  }
  if (grid) {
    ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 1;
    // Lines mark exact integer block boundaries, not block centers.
    const labelStep = grid * Math.max(1, Math.ceil(90 / (grid * width / spec.span)));
    for (let x = Math.ceil(bounds.minX / grid) * grid; x <= bounds.maxX; x += grid) {
      const px = project([x, 0, bounds.minZ]).pixel[0];
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, height); ctx.stroke();
      if (x % labelStep === 0) label(ctx, `X ${x}`, px + 2, 35);
    }
    for (let z = Math.ceil(bounds.minZ / grid) * grid; z <= bounds.maxZ; z += grid) {
      const py = project([bounds.minX, 0, z]).pixel[1];
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(width, py); ctx.stroke();
      if (z % labelStep === 0 && py > 62 && py < height - 56) label(ctx, `Z ${z}`, 4, py + 2);
    }
  }
  for (const pin of [...pins, ...(player ? [player] : [])]) {
    if (!pin.inFrame) continue;
    const [x, y] = pin.pixel, color = pin.id === 'SELF' ? '#65f2e5' : '#ffe382';
    ctx.strokeStyle = '#142127'; ctx.fillStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    label(ctx, `${pin.id}${pin.label ? ` ${pin.label}` : ''} (${pin.at.map(n => Math.round(n * 100) / 100).join(',')})`, x + 8, y - 27, color);
  }
  label(ctx, `N −Z ↑   E +X →${dimension ? `   ${dimension}` : ''}`, 8, 7);
  label(ctx, `${spec.span} blocks wide · grid ${grid || 'off'} · chunks ${coverage.meshed}/${coverage.total}`, width - 8, 7, '#fff', 'right');
  label(ctx, 'Top surfaces only · pins are supplied XYZ, not surface heights · hatched = unmeshed', 8, height - 29, '#f6ddb0');
}

/** Render synchronously in a private capture page, then restore its camera and origin.
 * Use the renderer's full terrain pass: a bare THREE.render omits its custom chunk buffers.
 * No pointer, camera-control/socket command or new Minecraft connection is involved. */
export function captureOverview(world, input, { position, dimension, width, height, document }) {
  if (!world?.renderer || !world.sceneOrigin || !world.cameraWorldPos || !world.render || !position) throw new Error('overview renderer unavailable');
  const spec = overviewSpec(input, position, width, height);
  const coverage = overviewCoverage(spec.bounds, world.finishedChunks);
  if (!coverage.meshed) throw new Error('overview has no meshed terrain in requested bounds');
  const minY = world.worldSizeParams?.minY, maxY = minY + world.worldSizeParams?.worldHeight;
  const origin = world.sceneOrigin;
  const old = { camera: world.camera, pos: { ...world.cameraWorldPos }, origin: [origin.x, origin.y, origin.z],
    fog: world.scene.fog, smartCull: world.reactiveDebugParams.smartCull, render: world.renderer.render };
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('overview canvas unavailable');
  let metadata;
  try {
    const at = [spec.center[0], maxY + 8, spec.center[1]];
    origin.update(...at);
    const view = overviewCamera(spec, origin, minY, maxY);
    world.camera = view.camera;
    Object.assign(world.cameraWorldPos, { x: at[0], y: at[1], z: at[2] });
    world.scene.fog = null; world.reactiveDebugParams.smartCull = false;
    // The terrain pass updates atmospheric fog itself. Clear it at the draw
    // boundary, after that update, so an elevated camera does not photograph
    // only distance fog. Geometry still occludes normally; no roof cutaway.
    world.renderer.render = function(scene, camera) {
      if (camera === view.camera) scene.fog = null;
      return old.render.call(this, scene, camera);
    };
    world.render();
    ctx.drawImage(world.renderer.domElement, 0, 0, width, height);
    const project = point => overviewProject(point, view.camera, origin, width, height);
    const pins = spec.markers.map((pin, i) => ({ id: `P${i + 1}`, ...pin, ...project(pin.at) }));
    const playerAt = [position.x, position.y, position.z];
    const player = { id: 'SELF', at: playerAt, ...project(playerAt) };
    annotateOverview(ctx, spec, project, coverage, pins, player, dimension);
    metadata = { schema: 'mc-overview/v1', capturedAt: new Date().toISOString(), dimension: dimension ?? null,
      bounds: spec.bounds, grid: spec.grid, north: '-Z', right: '+X', width, height,
      coverage: { meshed: coverage.meshed, total: coverage.total },
      player, pins, source: 'loaded-renderer-scene', layers: 'top-visible-only' };
  } finally {
    world.renderer.render = old.render;
    world.camera = old.camera; Object.assign(world.cameraWorldPos, old.pos);
    origin.update(...old.origin); world.scene.fog = old.fog; world.reactiveDebugParams.smartCull = old.smartCull;
    world.render();
  }
  return { png: canvas.toDataURL('image/png'), metadata };
}
