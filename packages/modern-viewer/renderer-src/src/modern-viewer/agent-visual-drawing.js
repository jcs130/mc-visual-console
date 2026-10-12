import { AGENT_VISUAL_COLORS as COLORS } from './agent-visual-protocol.js';

/** Liang-Barsky clipping bounds flow-arrow work even for a distant marker whose
 * camera projection is billions of pixels offscreen. */
export function clipVisualSegment(a, b, width, height) {
  const dx = b.x - a.x, dy = b.y - a.y; let lo = 0, hi = 1;
  for (const [p, q] of [[-dx, a.x + 12], [dx, width + 12 - a.x], [-dy, a.y + 12], [dy, height + 12 - a.y]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) lo = Math.max(lo, t); else hi = Math.min(hi, t);
    if (lo > hi) return null;
  }
  return [{ x: a.x + dx * lo, y: a.y + dy * lo }, { x: a.x + dx * hi, y: a.y + dy * hi }];
}

/** Projected markers never bridge invisible/behind-camera vertices. The same
 * primitives drive the north-up route card and the camera-aligned OBS layer. */
export function drawVisualMarkers(ctx, markers, { project, width, height, time = 0, screen = true }) {
  let arrows = 256;
  ctx.font = '12px system-ui'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const marker of markers) {
    if (marker.space === 'screen' && !screen) continue;
    const points = marker.points.map(p => marker.space === 'screen' ? { x: p.x * width, y: p.y * height } : project(p));
    ctx.save(); ctx.strokeStyle = marker.color; ctx.fillStyle = marker.color; ctx.lineWidth = marker.width;
    ctx.globalAlpha = marker.role === 'candidate' ? .65 : 1;
    const first = points.find(Boolean);
    if (marker.kind === 'point' && first) {
      ctx.beginPath(); ctx.arc(first.x, first.y, marker.radius, 0, Math.PI * 2); ctx.stroke();
    } else if (marker.kind === 'line' || marker.kind === 'area') {
      if (marker.dashed) { ctx.setLineDash([7, 6]); ctx.lineDashOffset = marker.flow ? -time * .025 : 0; }
      ctx.beginPath(); let previous = null;
      for (const point of points) {
        if (!point) { previous = null; continue; }
        if (previous) ctx.lineTo(point.x, point.y); else ctx.moveTo(point.x, point.y);
        previous = point;
      }
      if (marker.kind === 'area' && points.every(Boolean)) {
        ctx.closePath(); ctx.globalAlpha *= .16; ctx.fill(); ctx.globalAlpha = marker.role === 'candidate' ? .65 : 1;
      }
      ctx.stroke(); ctx.setLineDash([]);
      if (marker.flow) for (let i = 1; i < points.length; i++) {
        if (!points[i - 1] || !points[i] || arrows <= 0) continue;
        const clipped = clipVisualSegment(points[i - 1], points[i], width, height); if (!clipped) continue;
        const [a, b] = clipped;
        const length = Math.hypot(b.x - a.x, b.y - a.y); if (length < 1) continue;
        // Moving chevrons point toward the next vertex (the chosen direction).
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        for (let d = (time * .035) % 52; d < length && arrows > 0; d += 52, arrows--) {
          const x = a.x + (b.x - a.x) * d / length, y = a.y + (b.y - a.y) * d / length;
          ctx.beginPath(); ctx.moveTo(x - 7 * Math.cos(angle - .6), y - 7 * Math.sin(angle - .6));
          ctx.lineTo(x, y); ctx.lineTo(x - 7 * Math.cos(angle + .6), y - 7 * Math.sin(angle + .6)); ctx.stroke();
        }
      }
    }
    if (first && marker.label) {
      const textWidth = Math.min(600, ctx.measureText(marker.label).width);
      ctx.fillStyle = '#101e2e'; ctx.globalAlpha = .9; ctx.fillRect(first.x + 9, first.y - 20, textWidth + 10, 20);
      ctx.globalAlpha = 1; ctx.fillStyle = marker.color; ctx.fillText(marker.label, first.x + 14, first.y - 6, 600);
    }
    ctx.restore();
  }
}
export function frameVisualMarkers(frame) {
  if (!frame) return [];
  const line = (id, role, points, label = '', flow = false, group = 'route') => ({ id, kind: 'line', space: 'world', role, points, label, group,
    color: COLORS[role], width: role === 'candidate' ? 2 : 3, dashed: role === 'candidate', flow, radius: 5 });
  const result = [];
  if (frame.trail.length > 1) result.push(line('actual-trail', 'trail', frame.trail));
  for (const candidate of frame.candidates) result.push(line(candidate.id, 'candidate', candidate.points, candidate.label, true));
  if (frame.route?.points.length > 1) result.push(line('chosen-route', 'path', frame.route.points, '', true));
  for (const operation of frame.input.operations) if (operation.from && operation.target) {
    result.push(line(`operation-${operation.id}`, operation.kind, [operation.from, operation.target], '', false, 'action'));
    result.push({ id: `target-${operation.id}`, kind: 'point', space: 'world', role: operation.kind, points: [operation.target],
      label: '', color: COLORS[operation.kind], width: 3, radius: 8, group: 'action' });
  }
  return result.concat(frame.markers.map(marker => ({ ...marker, group: 'custom' })));
}
export function routeMapProjection(markers, position, width, height) {
  const points = markers.filter(m => m.space !== 'screen').flatMap(m => m.points);
  if (position) points.push(position);
  if (!points.length) return null;
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minZ = Math.min(...points.map(p => p.z)), maxZ = Math.max(...points.map(p => p.z));
  const scale = Math.min((width - 40) / Math.max(8, maxX - minX), (height - 40) / Math.max(8, maxZ - minZ));
  const cx = (maxX + minX) / 2, cz = (maxZ + minZ) / 2;
  return p => ({ x: width / 2 + (p.x - cx) * scale, y: height / 2 + (p.z - cz) * scale });
}
export function drawVisualScene(ctx, scene, time) {
  ctx.fillStyle = scene.background; ctx.fillRect(0, 0, scene.width, scene.height);
  for (const node of scene.nodes) {
    const phase = node.motion ? (1 - Math.cos(time / node.motion.periodMs * Math.PI * 2)) / 2 : 0;
    const dx = (node.motion?.dx ?? 0) * phase, dy = (node.motion?.dy ?? 0) * phase;
    ctx.save(); ctx.translate(dx, dy); ctx.fillStyle = node.color; ctx.strokeStyle = node.color;
    if (node.kind === 'rect') ctx.fillRect(node.x, node.y, node.width, node.height);
    else if (node.kind === 'circle') { ctx.beginPath(); ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2); ctx.fill(); }
    else if (node.kind === 'line') { ctx.lineWidth = node.width; ctx.beginPath(); ctx.moveTo(node.x, node.y); ctx.lineTo(node.x2, node.y2); ctx.stroke(); }
    else { ctx.font = `${node.size}px system-ui`; ctx.fillText(node.text, node.x, node.y, scene.width); }
    ctx.restore();
  }
}
