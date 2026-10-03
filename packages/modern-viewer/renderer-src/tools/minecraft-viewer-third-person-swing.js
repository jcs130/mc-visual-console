function cortiSlashPoseAt(progress, variant) {
  const p = Math.max(0, Math.min(1, progress));
  const reverse = variant === -1;
  const frames = reverse ? [
    [0,    [-0.12,  0.02,  0.00,  0.00,  0.00,  0.00, 0.00]],
    [0.18, [-0.90, -0.48,  0.54, -0.28,  0.06, -0.35, 0.06]],
    [0.43, [-2.12,  0.72, -0.62,  0.39, -0.13,  0.68, 0.13]],
    [0.68, [-1.28,  1.00, -0.42,  0.24, -0.06,  0.34, 0.04]],
    [1,    [ 0.00,  0.00,  0.00,  0.00,  0.00,  0.00, 0.00]],
  ] : [
    [0,    [-0.12,  0.02,  0.00,  0.00,  0.00,  0.00, 0.00]],
    [0.18, [-0.95,  0.42, -0.54,  0.30,  0.06,  0.38, 0.06]],
    [0.43, [-2.18, -0.78,  0.67, -0.40, -0.14, -0.72, 0.13]],
    [0.68, [-1.34, -1.08,  0.44, -0.25, -0.06, -0.37, 0.04]],
    [1,    [ 0.00,  0.00,  0.00,  0.00,  0.00,  0.00, 0.00]],
  ];
  for (let i = 1; i < frames.length; i += 1) {
    if (p > frames[i][0]) continue;
    const [start, from] = frames[i - 1];
    const [end, to] = frames[i];
    const t = (p - start) / (end - start);
    const eased = t * t * (3 - 2 * t);
    return from.map((value, index) => value + (to[index] - value) * eased);
  }
  return frames[frames.length - 1][1];
}

function applySwingOverlay(pose, progress, hand, style, variant) {
  const side = hand === 'left' ? 1 : -1;
  const arm = hand === 'left' ? 'leftArm' : 'rightArm';
  const support = hand === 'left' ? 'rightArm' : 'leftArm';
  if (style !== 'sword') {
    const arc = Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI);
    addRotation(pose, arm, -1.62 * arc, side * 0.08 * arc, side * 0.34 * arc, 1);
    addRotation(pose, 'body', 0, -side * 0.12 * arc, 0, 1);
    return;
  }
  const [armX, armY, armZ, torsoYaw, torsoPitch, supportX, bodyShift] = cortiSlashPoseAt(progress, variant);
  addRotation(pose, arm, armX, armY * -side, armZ * -side, 1);
  addRotation(pose, support, supportX, 0, side * bodyShift * 0.35, 1);
  addRotation(pose, 'body', torsoPitch, torsoYaw * -side, 0, 1);
  addRotation(pose, 'head', 0, -torsoYaw * -side * 0.42, 0, 1);
  addPosition(pose, 'body', 0, -bodyShift * 0.30, bodyShift * 0.65, 1);
}
