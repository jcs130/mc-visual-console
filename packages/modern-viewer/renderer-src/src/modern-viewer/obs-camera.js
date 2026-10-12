/** Minecraft's game FOV is vertical. Do not treat it as a horizontal angle or
 * scale it linearly with the OBS width. Client options/dynamic FOV are not sent
 * in vanilla packets: accept an explicit calibrated base or a fresh report. */
export function resolveObsCamera(settings, reported, { fov = 70, aspect = 16 / 9 } = {}) {
  const valid = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  const base = valid(settings?.fov, 30, 110) ? settings.fov : valid(fov, 30, 140) ? fov : 70;
  const follow = settings?.followAgent !== false && valid(reported?.verticalFov, 5, 170);
  return { fov: follow ? reported.verticalFov : base,
    aspect: valid(settings?.aspect, .25, 4) ? settings.aspect : valid(aspect, .25, 4) ? aspect : 16 / 9,
    source: follow ? 'agent' : 'configured' };
}
export function horizontalFov(verticalFov, aspect) {
  return 2 * Math.atan(Math.tan(verticalFov * Math.PI / 360) * aspect) * 180 / Math.PI;
}
