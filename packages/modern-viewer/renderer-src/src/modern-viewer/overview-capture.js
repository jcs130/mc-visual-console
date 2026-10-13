import { OrthographicCamera, Vector3 } from 'three';

const coordinate = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 30_000_000;
const tuple = (value, size) => Array.isArray(value) && value.length === size && value.every(coordinate);

/** A bounded, north-up photograph of already received terrain. No world/socket requests. */
export function overviewSpec(input = {}, position, width, height) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('overview must be an object');
  if (Object.keys(input).some(key => !['center', 'span', 'grid', 'labels', 'markers', 'attention'].includes(key))) throw new Error('unknown overview field');
  const center = input.center === undefined ? [position?.x, position?.z] : input.center;
  const span = input.span === undefined ? 32 : input.span, requestedGrid = input.grid === undefined ? 'auto' : input.grid;
  const labels = input.labels === undefined ? 'auto' : input.labels, markers = input.markers === undefined ? [] : input.markers;
  if (!tuple(center, 2)) throw new Error('overview center requires finite [x,z]');
  if (typeof span !== 'number' || !Number.isFinite(span) || span < 8 || span > 2048) throw new Error('overview span must be 8..2048 blocks');
  if (requestedGrid !== 'auto' && (!Number.isInteger(requestedGrid) || requestedGrid < 0 || requestedGrid > 2048)) throw new Error('overview grid must be auto or integer 0..2048');
  if (!['auto', 'full', 'ids'].includes(labels)) throw new Error('overview labels must be auto, full or ids');
  const grid = requestedGrid === 'auto' ? 2 ** Math.ceil(Math.log2(span / 8)) : requestedGrid;
  if (!Number.isInteger(width) || width < 640 || width > 1920 || !Number.isInteger(height) || height < 360 || height > 1080) throw new Error('invalid overview image size');
  if (!Array.isArray(markers) || markers.length > 128 || markers.some(marker => !marker ||
    typeof marker !== 'object' || Array.isArray(marker) || Object.keys(marker).some(key => !['at', 'anchor', 'label'].includes(key)) ||
    !tuple(marker.at, 3) || (marker.anchor !== undefined && !['block', 'position'].includes(marker.anchor)) ||
    (marker.anchor !== 'position' && !marker.at.every(Number.isInteger)) ||
    (marker.label !== undefined && (typeof marker.label !== 'string' || marker.label.length > 24 || /[\u0000-\u001f\u007f]/u.test(marker.label)))))
    throw new Error('overview markers: at most 128; block (default) requires integer XYZ, position preserves exact XYZ; label <=24 chars');
  const attention = input.attention;
  if (attention !== undefined && (!attention || typeof attention !== 'object' || Array.isArray(attention) ||
    Object.keys(attention).some(key => !['regions', 'detail'].includes(key)) ||
    !Array.isArray(attention.regions) || !attention.regions.length || attention.regions.length > 32 ||
    attention.regions.some(region => !region || typeof region !== 'object' || Array.isArray(region) ||
      Object.keys(region).some(key => !['bounds', 'label'].includes(key)) || !tuple(region.bounds, 4) ||
      region.bounds[2] <= region.bounds[0] || region.bounds[3] <= region.bounds[1] ||
      region.bounds[2] - region.bounds[0] > 2048 || region.bounds[3] - region.bounds[1] > 2048 ||
      (region.label !== undefined && (typeof region.label !== 'string' || region.label.length > 24 || /[\u0000-\u001f\u007f]/u.test(region.label)))) ||
    (attention.detail !== undefined && (!Number.isInteger(attention.detail) || attention.detail < 0 || attention.detail > attention.regions.length))))
    throw new Error('attention: 1..32 regions with bounds [minX,minZ,maxX,maxZ], sides <=2048; detail is 1-based region index, 0=off');
  const depth = span * height / width;
  return { center: [...center], span, grid, labels, width, height, markers, attention,
    bounds: { minX: center[0] - span / 2, maxX: center[0] + span / 2,
      minZ: center[1] - depth / 2, maxZ: center[1] + depth / 2 } };
}

/** Explicit caller-selected regions, not model attention weights or inferred hazards. */
export function overviewPanels(spec) {
  const selected = spec.attention ? (spec.attention.detail ?? 1) : 0;
  const gap = selected ? 12 : 0, mainWidth = selected ? Math.floor(spec.width * .64) : spec.width;
  const main = { ...spec, width: mainWidth, bounds: { ...spec.bounds,
    minZ: spec.center[1] - spec.span * spec.height / mainWidth / 2,
    maxZ: spec.center[1] + spec.span * spec.height / mainWidth / 2 } };
  const panels = [{ id:'overview', viewport:{x:0,y:0,width:mainWidth,height:spec.height}, spec:main }];
  if (selected) {
    const [minX,minZ,maxX,maxZ] = spec.attention.regions[selected-1].bounds;
    const width = spec.width-mainWidth-gap, height=spec.height;
    // Fit the region with context; cap camera width like the main view. Metadata
    // reports clipping if a very wide region does not fit after the cap.
    const span = Math.min(2048, Math.max(8, (maxX-minX)*1.3, (maxZ-minZ)*width/height*1.3));
    const center = [(minX+maxX)/2,(minZ+maxZ)/2], depth=span*height/width;
    panels.push({id:`A${selected}`,viewport:{x:mainWidth+gap,y:0,width,height},spec:{...spec,width,height,center,span,
      grid:2**Math.ceil(Math.log2(span/8)),labels:'auto',
      bounds:{minX:center[0]-span/2,maxX:center[0]+span/2,minZ:center[1]-depth/2,maxZ:center[1]+depth/2}}});
  }
  return panels;
}

export function overviewRegions(spec) {
  return (spec.attention?.regions ?? []).map((region,index) => {
    const [minX,minZ,maxX,maxZ]=region.bounds, b=spec.bounds, scale=spec.width/spec.span;
    const left=Math.max(minX,b.minX), right=Math.min(maxX,b.maxX), top=Math.max(minZ,b.minZ), bottom=Math.min(maxZ,b.maxZ);
    return {id:`A${index+1}`,bounds:[...region.bounds],...(region.label?{label:region.label}:{}),
      rect:{x:(left-b.minX)*scale,y:(top-b.minZ)*scale,width:Math.max(0,right-left)*scale,height:Math.max(0,bottom-top)*scale},
      inFrame:right>left&&bottom>top,clipped:minX<b.minX||maxX>b.maxX||minZ<b.minZ||maxZ>b.maxZ};
  });
}

function shadeAttention(ctx, regions, document) {
  // Clear every selected rectangle from a mask, so overlapping ROIs stay bright.
  const mask=document.createElement('canvas');mask.width=ctx.canvas.width;mask.height=ctx.canvas.height;
  const layer=mask.getContext('2d');layer.fillStyle='rgba(6,12,20,.55)';layer.fillRect(0,0,mask.width,mask.height);
  for(const region of regions.filter(r=>r.inFrame)) {
    const r=region.rect;layer.clearRect(r.x,r.y,r.width,r.height);
  }
  ctx.drawImage(mask,0,0);
}

/** Block indices name a cell, not its minimum corner. Never offset entity/world positions. */
export function overviewMarker(pin, index, project) {
  const anchor = pin.anchor ?? 'block';
  const world = pin.at.map(value => anchor === 'block' ? value + .5 : value);
  return { id: `P${index + 1}`, ...pin, anchor, world, ...project(world) };
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
  while (ctx.measureText(text).width + 12 > ctx.canvas.width - 6 && text.length > 1) text = text.slice(0, -2) + '…';
  const w = ctx.measureText(text).width + 12;
  x = Math.max(3, Math.min(ctx.canvas.width - w - 3, align === 'right' ? x - w : x));
  y = Math.max(3, Math.min(ctx.canvas.height - 24, y));
  ctx.fillStyle = 'rgba(7,16,24,.84)'; ctx.fillRect(x, y, w, 23);
  ctx.fillStyle = color; ctx.fillText(text, x + 6, y + 2); ctx.restore();
}

const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Keep all points; reduce only label detail/visibility. IDs always follow input order. */
export function overviewLabelLayout(spec, pins, player, measure) {
  const points = [...(player?.inFrame ? [player] : []), ...pins.filter(pin => pin.inFrame)];
  const mode = spec.labels === 'auto' ? (points.length > 12 ? 'ids' : 'full') : spec.labels;
  const occupied = points.map(pin => ({ x: pin.pixel[0] - 8, y: pin.pixel[1] - 8, w: 16, h: 16 }));
  const placed = [];
  for (const pin of points) {
    const xyz = pin.at.map(n => Math.round(n * 100) / 100).join(',');
    const coordinates = pin.anchor === 'block' ? `[${xyz}]` : `(${xyz})`;
    const full = `${pin.id}${pin.label ? ` ${pin.label}` : ''} ${coordinates}`;
    const texts = mode === 'ids' ? [pin.id] : spec.labels === 'auto' ? [full, pin.id] : [full];
    let found;
    for (const text of texts) {
      const w = measure(text) + 12, h = 23, [px, py] = pin.pixel;
      for (const [x,y] of [[px+10,py-29], [px+10,py+10], [px-w-10,py-29], [px-w-10,py+10]]) {
        const box = { x, y, w, h };
        // Reserve the header, footer and the left-hand Z-axis labels.
        if (x < (spec.grid ? 82 : 3) || x+w > spec.width-3 || y < 64 || y+h > spec.height-35 || occupied.some(other=>overlaps(box,other))) continue;
        found = { ...box, text, id:pin.id }; break;
      }
      if (found) break;
    }
    if (found) { placed.push(found); occupied.push(found); }
  }
  return { mode, placed, shown:placed.length, hidden:points.length-placed.length };
}

export function annotateOverview(ctx, spec, project, coverage, pins, player, dimension, panelId = 'overview') {
  const { width, height, bounds, grid } = spec;
  if (coverage.missing.length) {
    // One clipped hatch pass, even when a wide view contains thousands of unknown columns.
    ctx.save(); ctx.beginPath();
    for (const [x, z] of coverage.missing) {
      const [left, top] = project([x, 0, z]).pixel, [right, bottom] = project([x + 16, 0, z + 16]).pixel;
      ctx.rect(left, top, right - left, bottom - top);
    }
    ctx.clip(); ctx.fillStyle = 'rgba(12,19,28,.94)'; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#465565'; ctx.lineWidth = 1;
    for (let n = -height; n < width; n += 18) { ctx.beginPath(); ctx.moveTo(n, 0); ctx.lineTo(n + height, height); ctx.stroke(); }
    ctx.restore();
  }
  if (grid) {
    ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 1;
    // Lines mark exact integer block boundaries, not block centers.
    const labelStep = grid * Math.max(1, Math.ceil(90 / (grid * width / spec.span)));
    let lastLabelRight = -1;
    for (let x = Math.ceil(bounds.minX / grid) * grid; x <= bounds.maxX; x += grid) {
      const px = project([x, 0, bounds.minZ]).pixel[0];
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, height); ctx.stroke();
      if (x % labelStep === 0) {
        ctx.save();ctx.font='bold 15px "Segoe UI", "Microsoft YaHei", sans-serif';
        const text=`X ${x}`,w=ctx.measureText(text).width+12,left=Math.max(3,Math.min(width-w-3,px+2));ctx.restore();
        if(left>lastLabelRight+6) { label(ctx,text,left,35);lastLabelRight=left+w; }
      }
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
    if (pin.anchor === 'block' && width / spec.span >= 12) {
      const [left, top] = project(pin.at).pixel;
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.strokeRect(left, top, width / spec.span, width / spec.span);
    }
    ctx.strokeStyle = '#142127'; ctx.fillStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.save(); ctx.font = 'bold 15px "Segoe UI", "Microsoft YaHei", sans-serif';
  const layout = overviewLabelLayout(spec, pins, player, text => ctx.measureText(text).width);
  ctx.restore();
  for (const item of layout.placed) label(ctx, item.text, item.x, item.y, item.id === 'SELF' ? '#65f2e5' : '#ffe382');
  const regions = overviewRegions(spec), selected=spec.attention?.detail ?? 1;
  for(const region of regions.filter(r=>r.inFrame)) {
    const r=region.rect,color=region.id===`A${selected}`?'#ffcc68':'#89d5ff';
    ctx.strokeStyle=color;ctx.lineWidth=3;ctx.strokeRect(r.x,r.y,r.width,r.height);
    label(ctx,`${region.id}${region.label?' '+region.label:''}${region.clipped?' · clipped':''}`,r.x+4,Math.max(64,r.y-27),color);
  }
  label(ctx, `${panelId === 'overview' ? 'N −Z ↑   E +X →' : panelId+' DETAIL · N −Z ↑'}${dimension && width>=600 ? `   ${dimension}` : ''}`, 8, 7);
  if(width>=600) label(ctx, `${Math.round(spec.span*10)/10} blocks · grid ${grid || 'off'} · chunks ${coverage.meshed}/${coverage.total}`, width - 8, 7, '#fff', 'right');
  label(ctx, width>=600 ? `[] cell centers · () exact · top surfaces only · hatch = unknown${layout.hidden ? ` · ${layout.hidden} labels hidden` : ''}`
    : `grid ${grid || 'off'} · chunks ${coverage.meshed}/${coverage.total} · top surfaces`, 8, height - 29, '#f6ddb0');
  return { mode:layout.mode, shown:layout.shown, hidden:layout.hidden };
}

/** Render synchronously in a private capture page, then restore its camera and origin.
 * Use the renderer's full terrain pass: a bare THREE.render omits its custom chunk buffers.
 * No pointer, camera-control/socket command or new Minecraft connection is involved. */
export function captureOverview(world, input, { position, dimension, width, height, document }) {
  if (!world?.renderer || !world.sceneOrigin || !world.cameraWorldPos || !world.render || !position) throw new Error('overview renderer unavailable');
  const spec = overviewSpec(input, position, width, height);
  const panels = overviewPanels(spec);
  if (!panels.some(panel=>overviewCoverage(panel.spec.bounds,world.finishedChunks).meshed)) throw new Error('overview has no meshed terrain in requested bounds');
  const minY = world.worldSizeParams?.minY, maxY = minY + world.worldSizeParams?.worldHeight;
  const origin = world.sceneOrigin;
  const old = { camera: world.camera, pos: { ...world.cameraWorldPos }, origin: [origin.x, origin.y, origin.z],
    fog: world.scene.fog, smartCull: world.reactiveDebugParams.smartCull, render: world.renderer.render };
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('overview canvas unavailable');
  let metadata, activeCamera;
  try {
    world.reactiveDebugParams.smartCull = false;
    world.renderer.render = function(scene, camera) {
      if (camera === activeCamera) scene.fog = null;
      return old.render.call(this, scene, camera);
    };
    ctx.fillStyle='#0c1620';ctx.fillRect(0,0,width,height);
    const captures = panels.map(panel => {
      const spec=panel.spec, coverage=overviewCoverage(spec.bounds,world.finishedChunks);
      const layer=document.createElement('canvas');layer.width=spec.width;layer.height=spec.height;
      const pane=layer.getContext('2d');if(!pane)throw new Error('overview panel canvas unavailable');
      const at = [spec.center[0], maxY + 8, spec.center[1]];
      origin.update(...at);
      const view = overviewCamera(spec, origin, minY, maxY);
      world.camera = activeCamera = view.camera;
      Object.assign(world.cameraWorldPos, { x: at[0], y: at[1], z: at[2] });
      world.scene.fog = null; world.reactiveDebugParams.smartCull = false;
      // The terrain pass updates atmospheric fog itself. Clear it at the draw
      // boundary, after that update, so an elevated camera does not photograph
      // only distance fog. Geometry still occludes normally; no roof cutaway.
      world.render();
      pane.drawImage(world.renderer.domElement, 0, 0, spec.width, spec.height);
      const regions=overviewRegions(spec);
      if(spec.attention && panel.id==='overview')shadeAttention(pane,regions,document);
      const project = point => overviewProject(point, view.camera, origin, spec.width, spec.height);
      const pins = spec.markers.map((pin, i) => overviewMarker(pin, i, project));
      const playerAt = [position.x, position.y, position.z];
      const player = { id: 'SELF', at: playerAt, ...project(playerAt) };
      const labels = annotateOverview(pane, spec, project, coverage, pins, player, dimension,panel.id);
      ctx.drawImage(layer,panel.viewport.x,panel.viewport.y);
      const shift=point=>({...point,pixel:[point.pixel[0]+panel.viewport.x,point.pixel[1]+panel.viewport.y]});
      return {id:panel.id,viewport:panel.viewport,bounds:spec.bounds,grid:spec.grid,
        coverage: { meshed: coverage.meshed, total: coverage.total },
        player:shift(player),pins:pins.map(shift),labels,
        regions:regions.map(region=>({...region,rect:{...region.rect,x:region.rect.x+panel.viewport.x,y:region.rect.y+panel.viewport.y}}))};
    });
    const [main,detail]=captures;
    metadata = {schema:'mc-overview/v3',capturedAt:new Date().toISOString(),dimension:dimension??null,
      bounds:main.bounds,grid:main.grid,north:'-Z',right:'+X',width,height,viewport:main.viewport,
      coverage:main.coverage,player:main.player,pins:main.pins,labels:main.labels,
      ...(spec.attention?{attention:{source:'caller-selected',regions:main.regions,...(detail?{detail}:{})}}:{}),
      source:'loaded-renderer-scene',layers:'top-visible-only'};
  } finally {
    world.renderer.render = old.render;
    world.camera = old.camera; Object.assign(world.cameraWorldPos, old.pos);
    origin.update(...old.origin); world.scene.fog = old.fog; world.reactiveDebugParams.smartCull = old.smartCull;
    world.render();
  }
  return { png: canvas.toDataURL('image/png'), metadata };
}
