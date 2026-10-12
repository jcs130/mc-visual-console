const pointInViewport = (p, width, height) => p && Number.isFinite(p.x) && Number.isFinite(p.y)
  && p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height;

/** Use attested screen coordinates, a visible inventory slot or a real world
 * target. Never invent a third-person screen position for a missing target. */
export function resolveAgentPointer(frame, {width, height, firstPerson = false, project = () => null, slotPosition = () => null} = {}) {
  if (!frame?.subject) return null;
  const operation = frame.input?.operations?.at(-1), explicit = frame.input?.pointer;
  let point, source;
  if (explicit) { point = {x: explicit.x * width, y: explicit.y * height}; source = 'agent'; }
  else if (operation?.kind === 'inventory') {
    // Compatibility with existing hosts: this is their fixed packet-derived
    // detail format, never server chat or arbitrary language interpretation.
    const legacySlot = /^槽位 (\d+) · (?:左键|右键)$/.exec(operation.detail ?? '');
    const slot = operation.slot ?? (legacySlot ? Number(legacySlot[1]) : null);
    if (Number.isSafeInteger(slot) && slot >= 0) point = slotPosition(slot, operation.windowId);
    source = 'inventory';
  } else if (operation) {
    if (firstPerson) { point = {x: width / 2, y: height / 2}; source = 'crosshair'; }
    else if (operation.target) { point = project(operation.target); source = 'world'; }
  }
  return pointInViewport(point, width, height) ? {...point, source, click: !!operation, button: operation?.button ?? null,
    label: operation ? `${operation.button === 'left' ? '左键' : '右键'} · ${operation.kind === 'inventory' ? '背包' : operation.kind === 'attack' ? '攻击' : operation.kind === 'gather' ? '采集' : '交互'}` : 'Agent 指针'} : null;
}

export function visibleInventorySlot(document, slot, windowId) {
  const menu = document.getElementById('corti-menu');
  if (!menu || menu.hidden || menu.getBoundingClientRect().width === 0) return null;
  if (windowId !== undefined && String(windowId) !== menu.dataset.windowId) return null;
  const element = [...menu.querySelectorAll('[data-viewer-slot]')].find(el => Number(el.dataset.viewerSlot) === slot);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2} : null;
}

/** Interpolation is presentation only, never a reconstruction of mouse input. */
export function createAgentPointerMotion() {
  let point = null, previous = null;
  return {
    reset() { point = null; previous = null; },
    step(target, time, {width, height, reducedMotion = false}) {
      const dt = previous === null ? 16 : Math.max(0, Math.min(64, time - previous));
      previous = time;
      if (!target) return null;
      point ??= {x: width / 2, y: height / 2};
      const factor = reducedMotion ? 1 : 1 - Math.exp(-dt / 75);
      for (const key of ['x', 'y']) {
        point[key] += (target[key] - point[key]) * factor;
        if (Math.abs(target[key] - point[key]) < .3) point[key] = target[key];
      }
      point.x = Math.max(0, Math.min(width, point.x)); point.y = Math.max(0, Math.min(height, point.y));
      return {...point};
    },
  };
}
