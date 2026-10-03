/** Screen-space combat feedback over entities in the actual viewer scene. */
function cortiInstallCombatFloats(socket) {
  const root = document.getElementById('corti-combat-floats');
  if (!root) return;
  const active = new Map();
  const place = (node, id) => {
    const three = globalThis.THREE;
    const world = globalThis.world;
    const entity = world?.entities?.entities?.[String(id)];
    const state = entityCache.get(String(id));
    const canvas = document.getElementById('viewer-canvas');
    if (!three || !world?.camera || !entity || !canvas) return false;
    const point = entity.getWorldPosition(new three.Vector3());
    point.y += Math.min(2.2, Math.max(.5, Number(state?.height) || 1.6)) * .7;
    world.camera.updateMatrixWorld();
    point.project(world.camera);
    if (point.z < -1 || point.z > 1 || Math.abs(point.x) > 1.15 || Math.abs(point.y) > 1.15) return false;
    const rect = canvas.getBoundingClientRect();
    node.style.left = `${rect.left + (point.x + 1) * rect.width / 2}px`;
    node.style.top = `${rect.top + (1 - point.y) * rect.height / 2}px`;
    return true;
  };
  const show = (event) => {
    if (!event || !Number.isSafeInteger(event.id) || event.id < 0 ||
        (event.amount != null && (typeof event.amount !== 'number' ||
          !Number.isFinite(event.amount) || event.amount <= 0 || event.amount > 2048))) return;
    const now = performance.now();
    const key = String(event.id);
    const previous = active.get(key);
    if (previous && now - previous.at < 260 && previous.amount != null && event.amount == null && !event.critical) return;
    const reuse = previous && now - previous.at < 260;
    const node = reuse ? previous.node : document.createElement('div');
    if (!reuse && !place(node, event.id)) return;
    const amount = event.amount ?? (reuse ? previous.amount : null);
    const critical = event.amount != null ? event.critical === true
      : event.critical === true || (reuse && previous.critical);
    node.className = critical ? 'corti-combat-float is-critical' : 'corti-combat-float';
    node.textContent = amount == null ? (critical ? '暴击！' : '命中')
      : `${critical ? '暴击 ' : '−'}${Number.isInteger(amount) ? amount : amount.toFixed(1)}`;
    if (!reuse) {
      root.append(node);
      setTimeout(() => {
        node.remove();
        if (active.get(key)?.node === node) active.delete(key);
      }, 1_150);
    }
    active.set(key, { node, at: now, amount, critical });
    while (root.children.length > 16) root.firstElementChild.remove();
  };
  socket.on('combatFeedback', show);
  socket.on('connect', () => { root.replaceChildren(); active.clear(); });
}

cortiInstallCombatFloats(socket);
