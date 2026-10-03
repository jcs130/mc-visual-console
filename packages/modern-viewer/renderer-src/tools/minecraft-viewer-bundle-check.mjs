const MINIMAP_ARROW_COLOR = '#162c2d'

/** @param {unknown} bundle */
export function assertMinimapArrowOrientation(bundle) {
  const source = String(bundle)
  const colorAt = source.indexOf(MINIMAP_ARROW_COLOR)
  if (colorAt < 0 || source.indexOf(MINIMAP_ARROW_COLOR, colorAt + 1) >= 0) {
    throw Error('viewer bundle 小地图箭头锚点缺失或不唯一')
  }
  const arrow = source.slice(Math.max(0, colorAt - 250), colorAt).replace(/\s+/g, '')
  if (!/\.rotate\(-\(Number\([^)]*\.entity\.yaw\)\|\|0\)\)/u.test(arrow)) {
    throw Error('viewer bundle 小地图箭头方向不是 Mineflayer yaw 的北上投影')
  }
}
