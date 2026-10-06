/** Smooth remote camera samples in every view without changing game state. */
let cortiCameraState = null;
let cortiCameraFrame = 0;

function cortiAngleDelta(target, current) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

function cortiCameraPose(packet, instant) {
  const now = performance.now();
  const target = packet.pos;
  const targetKey = packet.cameraTarget ?? (isFirstPersonView ? "first" : "observer");
  const last = cortiCameraState;
  const distance = last ? Math.hypot(target.x - last.x, target.y - last.y, target.z - last.z) : 0;
  if (!last || instant || packet.teleport || last.targetKey !== targetKey || distance > 8 || now - last.at > 1500) {
    cortiCameraState = { x: target.x, y: target.y, z: target.z, yaw: packet.yaw, pitch: packet.pitch, at: now, targetKey };
    return { pos: target, yaw: packet.yaw, pitch: packet.pitch, settled: true };
  }

  const dt = Math.min(0.05, Math.max(0.001, (now - last.at) / 1000));
  const positionAlpha = 1 - Math.exp(-dt / 0.09);
  const rotationAlpha = 1 - Math.exp(-dt / 0.11);
  const step = distance ? Math.min(distance * positionAlpha, 12 * dt) / distance : 0;
  last.x += (target.x - last.x) * step;
  last.y += (target.y - last.y) * step;
  last.z += (target.z - last.z) * step;
  const yawDelta = cortiAngleDelta(packet.yaw, last.yaw);
  const pitchDelta = packet.pitch - last.pitch;
  last.yaw += Math.sign(yawDelta) * Math.min(Math.abs(yawDelta) * rotationAlpha, 5.5 * dt);
  last.pitch += Math.sign(pitchDelta) * Math.min(Math.abs(pitchDelta) * rotationAlpha, 4.5 * dt);
  last.at = now;
  const settled = Math.hypot(target.x - last.x, target.y - last.y, target.z - last.z) < 0.006
    && Math.abs(cortiAngleDelta(packet.yaw, last.yaw)) < 0.003
    && Math.abs(packet.pitch - last.pitch) < 0.003;
  if (settled) {
    last.x = target.x; last.y = target.y; last.z = target.z;
    last.yaw = packet.yaw; last.pitch = packet.pitch;
  }
  return { pos: new Vec3(last.x, last.y, last.z), yaw: last.yaw, pitch: last.pitch, settled };
}

function scheduleCortiCameraFrame() {
  if (cortiCameraFrame || document.hidden) return;
  cortiCameraFrame = requestAnimationFrame(() => {
    cortiCameraFrame = 0;
    if (rendererReady && latestPosition) applyPosition(false, true);
  });
}

function cortiApplyDigProgress(packet) {
  const state = viewer?.playerState?.reactive;
  if (!state || !packet) return;
  if (packet.stage === null) {
    state.diggingBlock = undefined;
    return;
  }
  const { x, y, z, stage, mergedShape } = packet;
  if (![x, y, z, stage].every(Number.isInteger) || stage < 0 || stage > 9) return;
  const shape = mergedShape;
  if (!shape || ![shape.position?.x, shape.position?.y, shape.position?.z,
    shape.width, shape.height, shape.depth].every(Number.isFinite)) return;
  state.diggingBlock = { x, y, z, stage, mergedShape: shape };
}
