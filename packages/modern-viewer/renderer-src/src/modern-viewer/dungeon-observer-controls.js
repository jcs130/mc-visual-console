const TAU = Math.PI * 2;
const angleDelta = (from, to) => ((to - from + Math.PI) % TAU + TAU) % TAU - Math.PI;

export function nextDungeonCamera(pose, action, limits) {
  const next = { ...pose };
  if (action === "left") next.yaw += Math.PI / 2;
  if (action === "right") next.yaw -= Math.PI / 2;
  if (action === "near") next.distance = Math.max(limits.min, pose.distance / 1.2);
  if (action === "far") next.distance = Math.min(limits.max, pose.distance * 1.2);
  if (action === "tilt") next.pitch = pose.pitch > -0.95 ? -1.08 : limits.pitch;
  if (action === "reset") Object.assign(next, { yaw: limits.yaw, pitch: limits.pitch, distance: limits.distance });
  return next;
}

export function interpolateDungeonCamera(from, to, progress) {
  const t = Math.max(0, Math.min(1, progress));
  const ease = t * t * (3 - 2 * t);
  return {
    yaw: from.yaw + angleDelta(from.yaw, to.yaw) * ease,
    pitch: from.pitch + (to.pitch - from.pitch) * ease,
    distance: from.distance + (to.distance - from.distance) * ease,
  };
}

/** Observer-only controls: no socket, game input, or avatar orientation changes. */
export function installDungeonObserverControls({ getPose, setPose, limits, document = globalThis.document,
  requestFrame = globalThis.requestAnimationFrame, cancelFrame = globalThis.cancelAnimationFrame }) {
  const nav = document.createElement("nav");
  nav.className = "dungeon-camera-controls";
  nav.setAttribute("aria-label", "2.5D 观察镜头");
  const buttons = new Map();
  let frame = null, from = null, target = null, started = null;
  const refresh = () => {
    const pose = target || getPose();
    buttons.get("near").disabled = pose.distance <= limits.min + 0.01;
    buttons.get("far").disabled = pose.distance >= limits.max - 0.01;
    buttons.get("tilt").setAttribute("aria-pressed", String(pose.pitch < -0.95));
  };
  const animate = now => {
    frame = null;
    started ??= now;
    const progress = Math.min(1, (now - started) / 220);
    setPose(interpolateDungeonCamera(from, target, progress));
    if (progress < 1) frame = requestFrame(animate);
    else { target = null; refresh(); }
  };
  for (const [action, text, label] of [
    ["left", "↶", "向左旋转镜头"], ["right", "↷", "向右旋转镜头"],
    ["near", "+", "拉近镜头"], ["far", "−", "拉远镜头"],
    ["tilt", "俯视", "切换俯视角度"], ["reset", "复位", "复位观察镜头"],
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.title = label;
    button.setAttribute("aria-label", label);
    if (action === "tilt") button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      if (frame !== null) cancelFrame(frame);
      from = getPose();
      target = nextDungeonCamera(target || from, action, limits);
      started = null;
      refresh();
      frame = requestFrame(animate);
    });
    buttons.set(action, button);
    nav.append(button);
  }
  document.body.append(nav);
  refresh();
  return { refresh, dispose() { if (frame !== null) cancelFrame(frame); nav.remove(); } };
}
