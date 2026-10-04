// Mineflayer look angles use yaw=0 toward -Z and positive pitch toward +Y.
// These cameras observe the action player's received pose; they never move it.
export const VIEW_MODES = ['third', 'first', 'region']
export function playerCamera (pose, mode = 'third') {
  if (!VIEW_MODES.includes(mode)) throw Error('NATIVE_PLAYER_CAMERA_MODE_INVALID')
  if (!pose || !['x', 'y', 'z', 'yaw', 'pitch'].every(key => Number.isFinite(pose[key]))) throw Error('NATIVE_PLAYER_CAMERA_POSE_INVALID')
  const { x, y, z, yaw, pitch } = pose
  const forward = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)]
  if (mode === 'first') {
    if (!Number.isFinite(pose.eyeHeight)) throw Error('NATIVE_PLAYER_CAMERA_EYE_HEIGHT_MISSING')
    const position = [x, y + pose.eyeHeight, z]
    return { position, target: position.map((value, index) => value + forward[index]), showSelf: false }
  }
  const target = [x, y + 1.0, z]
  if (mode === 'region') return { position: [x + 6, y + 6, z + 6], target, showSelf: true }
  // Keep the camera inside the 10-block received neighborhood, with the whole
  // character in frame. The small shoulder offset avoids hiding it at center.
  return { position: [x + Math.sin(yaw) * 4.5 + Math.cos(yaw) * 1.0,
    y + 3.0, z + Math.cos(yaw) * 4.5 - Math.sin(yaw) * 1.0], target, showSelf: true }
}

export function playerHud (self, expectedUuid) {
  if (!self || self.uuid !== expectedUuid) return { available: false, name: '等待本人状态', health: '未收到', food: '未收到' }
  const number = value => Number.isFinite(value) ? String(Math.round(value * 10) / 10) : '未收到'
  return { available: true, name: self.name, health: `${number(self.health)} / ${number(self.maxHealth)}`, food: number(self.food) }
}
