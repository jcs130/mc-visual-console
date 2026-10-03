/** Read-only RTS style cues: green is planned movement, red is an actual attack command. */
function cortiInstallTacticalOverlay(socket) {
  const canvas = document.getElementById('corti-tactical-canvas');
  const legend = document.getElementById('corti-tactical-legend');
  if (!canvas || !legend) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  let route = { points: [], goal: null, status: 'done' };
  let attack = null;
  let legendKey = '';
  const finitePoint = (value) => value && ['x', 'y', 'z'].every(axis => Number.isFinite(value[axis]));
  const onRoute = (value) => {
    route = value && Array.isArray(value.points) && value.points.length <= 64
      ? value : { points: [], goal: null, status: 'done' };
  };
  const onAttack = (value) => {
    if (!Number.isSafeInteger(value?.id) || !finitePoint(value.position)) return;
    attack = { ...value, at: performance.now() };
  };
  socket.on('tacticalRoute', onRoute);
  socket.on('tacticalAttack', onAttack);
  socket.on('connect', () => { route = { points: [], goal: null, status: 'done' }; attack = null; });

  const project = (point, world, three, width, height) => {
    if (!finitePoint(point)) return null;
    const origin = world.sceneOrigin;
    const screen = new three.Vector3(origin.toSceneX(point.x),
      origin.toSceneY(point.y), origin.toSceneZ(point.z)).project(world.camera);
    if (screen.z < -1 || screen.z > 1 || Math.abs(screen.x) > 1.5 || Math.abs(screen.y) > 1.5) return null;
    return { x: (screen.x + 1) * width / 2, y: (1 - screen.y) * height / 2 };
  };
  const draw = () => {
    requestAnimationFrame(draw);
    const width = window.innerWidth, height = window.innerHeight;
    const scale = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * scale) || canvas.height !== Math.round(height * scale)) {
      canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    }
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, width, height);
    const world = globalThis.world, three = globalThis.THREE;
    const now = performance.now();
    if (attack && now - attack.at > 1_650) attack = null;
    const self = pendingAvatarState?.entity?.pos || latestPosition?.pos;
    const goal = finitePoint(route.goal) ? route.goal : null;
    const distance = goal && finitePoint(self)
      ? Math.round(Math.hypot(goal.x - self.x, goal.z - self.z)) : null;
    const moveLabel = goal ? `● 前往 ${Math.round(goal.x)}, ${Math.round(goal.z)}${distance === null ? '' : ` · ${distance} 格`}`
      : route.points.length > 1 ? '● 正在规划路线' : '';
    const attackLabel = attack ? `◎ 攻击 ${String(attack.name || '目标').slice(0, 32)}` : '';
    const nextLegendKey = `${moveLabel}|${attackLabel}`;
    if (nextLegendKey !== legendKey) {
      legendKey = nextLegendKey;
      legend.replaceChildren();
      if (moveLabel) {
        const line = document.createElement('span');
        line.className = 'corti-tactical-move'; line.textContent = moveLabel; legend.append(line);
      }
      if (attackLabel) {
        const line = document.createElement('span');
        line.className = 'corti-tactical-attack'; line.textContent = attackLabel; legend.append(line);
      }
      legend.hidden = !legend.childElementCount;
    }
    if (!world?.camera || !world.sceneOrigin || !three?.Vector3) return;
    world.camera.updateMatrixWorld?.();
    const points = route.points.map(point => project({ ...point, y: point.y + .22 }, world, three, width, height));
    if (points.length > 1) {
      context.beginPath();
      let drawing = false;
      for (const point of points) {
        if (!point) { drawing = false; continue; }
        if (drawing) context.lineTo(point.x, point.y);
        else context.moveTo(point.x, point.y);
        drawing = true;
      }
      context.strokeStyle = '#55eaa0';
      context.lineWidth = 3;
      context.lineJoin = 'round';
      context.shadowColor = '#0cf398';
      context.shadowBlur = 9;
      context.stroke();
      context.shadowBlur = 0;
    }
    const endpoint = project(goal || route.points.at(-1), world, three, width, height);
    if (endpoint && (goal || route.points.length > 1)) {
      context.beginPath(); context.arc(endpoint.x, endpoint.y, 8, 0, Math.PI * 2);
      context.strokeStyle = '#b9ffd7'; context.lineWidth = 2; context.stroke();
    }
    if (!attack) return;
    const liveTarget = entityCache.get(String(attack.id))?.pos;
    const target = project(liveTarget || attack.position, world, three, width, height);
    if (!target) return;
    const origin = project(self, world, three, width, height) || { x: width / 2, y: height / 2 };
    context.beginPath(); context.moveTo(origin.x, origin.y); context.lineTo(target.x, target.y);
    context.setLineDash([8, 6]); context.strokeStyle = '#ff6666'; context.lineWidth = 2;
    context.stroke(); context.setLineDash([]);
    context.beginPath(); context.arc(target.x, target.y, 15 + 4 * Math.sin(now / 95), 0, Math.PI * 2);
    context.strokeStyle = '#ff4c58'; context.lineWidth = 3;
    context.shadowColor = '#ff3030'; context.shadowBlur = 14; context.stroke(); context.shadowBlur = 0;
  };
  requestAnimationFrame(draw);
}

cortiInstallTacticalOverlay(socket);
