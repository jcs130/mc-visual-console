import { AgentVisualState } from './agent-visual-state.js';
import { AGENT_VISUAL_COLORS as COLORS, normalizeVisualRoute, visualPoint } from './agent-visual-protocol.js';
import { drawVisualMarkers, frameVisualMarkers, routeMapProjection, drawVisualScene } from './agent-visual-drawing.js';
import { resolveAgentPointer, visibleInventorySlot, createAgentPointerMotion } from './agent-pointer.js';

const STATUS = { planning: '规划中', acting: '执行中', waiting: '等待中', blocked: '遇到阻碍', done: '已完成',
  moving: '行进中', reached: '已到达', stopped: '已停止' };
const KEYS = { forward: '前进', back: '后退', left: '左移', right: '右移', jump: '跳跃', sprint: '疾跑', sneak: '潜行' };
const ACTIONS = { attack: '攻击', gather: '采集', interact: '交互', inventory: '背包' };
const setText = (element, text) => { if (element.textContent !== text) element.textContent = text; };

export function installAgentVisualization({ socket, document = globalThis.document, window = globalThis.window,
  visible = () => true, project = () => null, position = () => null, photo = false, firstPerson = false,
  slotPosition = (slot, windowId) => visibleInventorySlot(document, slot, windowId) } = {}) {
  if (photo) return { dispose() {}, snapshot: () => null };
  const state = new AgentVisualState({ now: () => window.performance.now() }), listeners = [], roots = [];
  let disposed = false, animation = 0, lastFrame = -Infinity, mediaKey = '', scene = null, sceneAt = 0;
  let legacyRoute = null, legacyUntil = 0, legacyAttacks = [], modern = false;
  const make = (tag, className, parent, text) => {
    const el = document.createElement(tag); if (className) el.className = className;
    if (text) el.textContent = text; parent.append(el); return el;
  };
  const panel = (id, label) => {
    const root = make('section', 'agent-visual-panel', document.body); root.id = id; root.hidden = true; roots.push(root);
    root.setAttribute('aria-label', label); return root;
  };
  const intent = panel('agent-intent', 'Agent 公开行动说明');
  const intentHeader = make('header', '', intent), name = make('strong', '', intentHeader), status = make('span', 'agent-status-tag', intentHeader);
  const goal = make('p', 'agent-intent-goal', intent), step = make('p', 'agent-intent-step', intent), summary = make('p', 'agent-intent-summary', intent);
  const progress = make('progress', '', intent); progress.max = 1;
  const route = panel('agent-route-map', '寻路轨迹与候选方案');
  const routeHeader = make('header', '', route); make('strong', '', routeHeader, '轨迹'); const routeStatus = make('span', '', routeHeader);
  const map = make('canvas', '', route); map.width = 300; map.height = 156;
  const mapLegend = make('div', 'agent-marker-legend', route);
  for (const [role, label] of [['path', '寻路'], ['trail', '已走'], ['candidate', '候选'], ['attack', '攻击'], ['gather', '采集'], ['interact', '交互']]) {
    const item = make('span', '', mapLegend, `${role === 'candidate' ? '┄' : '●'} ${label}`); item.style.color = COLORS[role];
  }
  const operations = panel('agent-operations', 'Agent 按键和鼠标操作');
  const opsHeader = make('header', '', operations); make('strong', '', opsHeader, '操作');
  make('small', '', opsHeader, '实际发出 · 不代表完成');
  const keys = make('div', 'agent-control-keys', operations), keyElements = new Map();
  for (const [key, label] of Object.entries(KEYS)) keyElements.set(key, make('span', '', keys, label));
  const mouse = make('div', 'agent-mouse', operations), left = make('span', '', mouse, '左键'), right = make('span', '', mouse, '右键');
  const look = make('small', 'agent-look', mouse), recent = make('div', 'agent-recent-operations', operations);
  const pointer = make('div', 'agent-pointer', document.body); pointer.id = 'agent-pointer'; pointer.hidden = true;
  pointer.setAttribute('aria-hidden', 'true');
  make('span', '', pointer, '↖'); make('small', '', pointer, 'Agent 指针'); roots.push(pointer);
  const pointerMotion = createAgentPointerMotion();
  const clickMarker = make('div', 'agent-click-marker', document.body); clickMarker.id = 'agent-click-marker';
  clickMarker.hidden = true; clickMarker.setAttribute('aria-hidden', 'true'); roots.push(clickMarker);
  let clickId = null;
  const presentation = panel('agent-presentation', 'Agent 图文与动画展示');
  const presentationTitle = make('header', '', presentation), presentationBody = make('div', 'agent-presentation-body', presentation);
  const caption = make('p', 'agent-presentation-caption', presentation);
  const existingPaths = document.getElementById('corti-tactical-canvas');
  const worldPaths = existingPaths ?? make('canvas', 'corti-tactical-canvas', document.body);
  worldPaths.id = 'corti-tactical-canvas'; if (!existingPaths) roots.push(worldPaths);
  const worldActions = make('canvas', 'agent-world-markers', document.body); worldActions.id = 'agent-action-markers';
  const worldCustom = make('canvas', 'agent-world-markers', document.body); worldCustom.id = 'agent-custom-markers';
  roots.push(worldActions, worldCustom);
  const legend = document.getElementById('corti-tactical-legend');
  const worldLayers = [[worldPaths, 'worldPaths'], [worldActions, 'worldActions'], [worldCustom, 'worldMarkers']];
  function listen(event, handler) { socket.on(event, handler); listeners.push([event, handler]); }
  const clear = () => { state.reset(); legacyRoute = null; legacyUntil = 0; legacyAttacks = []; modern = false; pointerMotion.reset(); clickId = null; render(null); };
  listen('connect', clear); listen('disconnect', clear); listen('viewerReset', clear);
  listen('viewerSession', value => { state.session(value); legacyRoute = null; legacyAttacks = []; render(state.snapshot()); });
  listen('agentVisualization', value => { if (state.accept(value)) { modern = true; render(state.snapshot()); } });
  listen('agentPresentation', value => { if (state.acceptPresentation(value)) render(state.snapshot()); });
  // Existing third-party hosts keep working. New hosts use identity-bound frames.
  listen('tacticalRoute', value => {
    if (modern) return;
    legacyRoute = normalizeVisualRoute({ ...value, status: value?.status === 'done' ? 'stopped' : value?.status });
    legacyUntil = window.performance.now() + 10_000;
  });
  listen('tacticalAttack', value => {
    if (modern || !visualPoint(value?.position)) return;
    legacyAttacks.push({ id: Number.isSafeInteger(value.id) ? value.id : 0, kind: 'attack', button: 'left', from: visualPoint(position()),
      target: visualPoint(value.position), detail: '', until: window.performance.now() + 1650 }); legacyAttacks = legacyAttacks.slice(-6);
  });
  function render(frame) {
    intent.hidden = !frame?.intent;
    if (frame?.intent) {
      setText(name, `${frame.subject.playerName} · 行动`); setText(status, STATUS[frame.intent.status]);
      setText(goal, frame.intent.goal); setText(step, frame.intent.step); setText(summary, frame.intent.summary);
      goal.hidden = !frame.intent.goal; step.hidden = !frame.intent.step; summary.hidden = !frame.intent.summary;
      progress.hidden = frame.intent.progress === undefined; if (!progress.hidden) progress.value = frame.intent.progress;
    }
    operations.hidden = !frame?.subject;
    if (frame?.subject) {
      for (const [key, el] of keyElements) el.dataset.active = String(frame.input.controls.includes(key));
      left.dataset.active = String(frame.input.operations.some(op => op.button === 'left'));
      right.dataset.active = String(frame.input.operations.some(op => op.button === 'right'));
      const yaw = frame.input.yaw, pitch = frame.input.pitch;
      setText(look, yaw === null || pitch === null ? '视角未同步' : `朝向 ${Math.round(yaw * 180 / Math.PI)}° / ${Math.round(pitch * 180 / Math.PI)}°`);
      const text = frame.input.operations.slice(-3).map(op => `${ACTIONS[op.kind]} · ${op.detail}`).join('\n') || '当前没有点击操作';
      setText(recent, text);
      recent.dataset.role = frame.input.operations.at(-1)?.kind ?? 'info';
    }
    const cursor = visible('agentPointer') ? resolveAgentPointer(frame, {width: window.innerWidth, height: window.innerHeight,
      project, slotPosition, firstPerson}) : null;
    pointer.hidden = !cursor;
    const point = pointerMotion.step(cursor, window.performance.now(), {width: window.innerWidth, height: window.innerHeight,
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true});
    if (cursor) { pointer.style.left = `${point.x}px`; pointer.style.top = `${point.y}px`;
      pointer.dataset.click = String(cursor.click); pointer.dataset.button = cursor.button ?? '';
      pointer.dataset.source = cursor.source; setText(pointer.children[1], cursor.label); }
    clickMarker.hidden = !cursor?.click;
    if (cursor?.click) {
      clickMarker.style.left = `${cursor.x}px`; clickMarker.style.top = `${cursor.y}px`;
      clickMarker.dataset.button = cursor.button ?? '';
      const id = frame.input.operations.at(-1)?.id;
      if (clickId !== id) { clickId = id; clickMarker.replaceChildren(); make('span', '', clickMarker); }
    }
    const ref = frame?.presentation, media = frame?.media;
    presentation.hidden = !ref;
    const key = ref ? `${state.epoch}:${ref.revision}:${media ? 'ready' : 'waiting'}` : '';
    if (key !== mediaKey) {
      mediaKey = key; scene = null; presentationBody.replaceChildren();
      if (ref) {
        setText(presentationTitle, ref.title || 'Agent 展示'); setText(caption, ref.caption);
        if (!media) make('p', '', presentationBody, '正在接收展示内容…');
        else if (media.kind === 'card') make('p', 'agent-presentation-text', presentationBody, media.text);
        else if (media.kind === 'image') {
          const img = make('img', '', presentationBody); img.alt = ref.title || 'Agent 提交的图片'; img.decoding = 'async';
          img.onload = () => { if (presentationBody.contains(img) && (img.naturalWidth > 4096 || img.naturalHeight > 4096)) { img.remove(); make('p', '', presentationBody, '图片尺寸超过展示上限'); } };
          img.onerror = () => { if (presentationBody.contains(img)) { img.remove(); make('p', '', presentationBody, '图片无法解码'); } };
          img.src = media.src;
        } else {
          const canvas = make('canvas', '', presentationBody); canvas.width = media.width; canvas.height = media.height;
          scene = { canvas, data: media }; sceneAt = window.performance.now();
        }
      }
    }
    const markers = frameVisualMarkers(frame);
    route.hidden = !markers.some(m => m.space === 'world');
    if (!route.hidden) setText(routeStatus, `${STATUS[frame.route?.status] ?? '观察中'}${frame.candidates.length ? ` · ${frame.candidates.length} 条候选` : ''}`);
    if (legend) {
      const text = [frame?.route?.points.length > 1 ? '● 寻路' : '', frame?.candidates.length ? '┄ 候选路径' : '',
        ...new Set((frame?.input.operations ?? []).map(op => ACTIONS[op.kind]))].filter(Boolean).join('  ');
      legend.hidden = !text; setText(legend, text);
    }
    for (const [canvas] of worldLayers) canvas.hidden = !markers.length;
    return markers;
  }
  function canvasContext(canvas, width, height, dpr = 1) {
    const w = Math.round(width * dpr), h = Math.round(height * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height); return ctx;
  }
  function tick(time) {
    if (disposed) return;
    animation = window.requestAnimationFrame(tick);
    if (time - lastFrame < 32 || document.hidden) return;
    lastFrame = time;
    let frame = state.snapshot();
    if (!modern && (legacyUntil > time || legacyAttacks.some(op => op.until > time))) {
      legacyAttacks = legacyAttacks.filter(op => op.until > time);
      frame = { subject: null, intent: null, presentation: null, route: legacyUntil > time ? legacyRoute : null, candidates: [], markers: [], trail: [],
        input: { controls: [], operations: legacyAttacks, position: visualPoint(position()), pointer: null } };
    }
    const markers = render(frame), width = window.innerWidth, height = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(4_000_000 / Math.max(1, width * height)));
    for (const [canvas, id] of worldLayers) {
      const group = canvas === worldPaths ? 'route' : canvas === worldActions ? 'action' : 'custom';
      const subset = markers.filter(marker => marker.group === group);
      canvas.hidden = !subset.length;
      if (!visible(id) || !subset.length) {
        // Release full-screen backing stores when unused/hidden, including OBS
        // at 4K. A vanished marker cannot leave a previous frame behind.
        if (canvas.width !== 1 || canvas.height !== 1) { canvas.width = 1; canvas.height = 1; }
        continue;
      }
      const ctx = canvasContext(canvas, width, height, dpr); if (!ctx) continue;
      drawVisualMarkers(ctx, subset, { project, width, height, time });
    }
    if (!route.hidden && visible('agentRoute')) {
      const ctx = canvasContext(map, 300, 156, dpr), projectMap = routeMapProjection(markers, frame.input.position, 300, 156);
      if (ctx && projectMap) {
        ctx.strokeStyle = '#ffffff12'; ctx.lineWidth = 1;
        for (let x = 0; x < 300; x += 25) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 156); ctx.stroke(); }
        for (let y = 0; y < 156; y += 26) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(300, y); ctx.stroke(); }
        drawVisualMarkers(ctx, markers, { project: projectMap, width: 300, height: 156, time, screen: false });
        if (frame.input.position) {
          const p = projectMap(frame.input.position); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#ced9e8'; ctx.fillText('↑ 北', 264, 16);
      }
    }
    if (scene && !presentation.hidden && visible('agentPresentation')) {
      const ctx = scene.canvas.getContext('2d'); if (ctx) drawVisualScene(ctx, scene.data, time - sceneAt);
    }
  }
  animation = window.requestAnimationFrame(tick);
  function dispose() {
    if (disposed) return; disposed = true; window.cancelAnimationFrame(animation);
    for (const [event, handler] of listeners) socket.off(event, handler);
    for (const root of roots) root.remove(); worldPaths.hidden = true; if (legend) legend.hidden = true;
    window.removeEventListener('pagehide', dispose);
  }
  window.addEventListener('pagehide', dispose, { once: true });
  return { snapshot: () => state.snapshot(), dispose };
}
