// Geometry rules from the matched 1.21.1 LiquidBlockRenderer / FlowingFluid.
// Native fluid and occlusion metadata are exported from the real modpack.
// Unknown/dynamic neighbor shapes are errors, never assumed solid/air.
const f = Math.fround
const DELTA = f(0.001), WATER = new Set(['minecraft:water', 'minecraft:flowing_water'])
const dirs = { down: [0, -1, 0], up: [0, 1, 0], north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0] }
const opposite = { down: 'up', up: 'down', north: 'south', south: 'north', west: 'east', east: 'west' }
const at = (p, delta) => ({ x: p.x + delta[0], y: p.y + delta[1], z: p.z + delta[2] })
const same = state => state.fluid && WATER.has(state.fluid.name)
const bitBuffer = new DataView(new ArrayBuffer(8))
const bits = number => { bitBuffer.setFloat64(0, number); return bitBuffer.getBigInt64(0) }
const double = number => { bitBuffer.setBigInt64(0, number); return bitBuffer.getFloat64(0) }
const bias = double(4805340802404319232n)
const asin = Array.from({ length: 257 }, (_, i) => Math.asin(i / 256))
const cosAsin = asin.map(Math.cos)
const sin = Float32Array.from({ length: 65536 }, (_, i) => Math.sin(i * Math.PI * 2 / 65536))

export function nativeAtan2 (y, x) {
  const square = x * x + y * y
  if (!Number.isFinite(square)) throw Error('NATIVE_FLUID_FLOW_INVALID')
  const negativeY = y < 0, negativeX = x < 0, swap = Math.abs(y) > Math.abs(x)
  y = Math.abs(y); x = Math.abs(x)
  if (swap) [x, y] = [y, x]
  let inverse = double(6910469410427058090n - (bits(square) >> 1n))
  inverse *= 1.5 - square * 0.5 * inverse * inverse
  x *= inverse; y *= inverse
  const biased = bias + y, index = Number(BigInt.asUintN(32, bits(biased)))
  const residual = y * cosAsin[index] - x * (biased - bias)
  let angle = asin[index] + (6 + residual * residual) * residual / 6
  if (swap) angle = Math.PI / 2 - angle
  if (negativeX) angle = Math.PI - angle
  return negativeY ? -angle : angle
}

export function weightedFluidHeight (center, a, b, diagonal) {
  if (a >= 1 || b >= 1) return 1
  const values = (a > 0 || b > 0) ? [diagonal(), center, b, a] : [center, b, a]
  if (values[0] >= 1) return 1
  let sum = 0, weight = 0
  for (const value of values) {
    if (value >= 0.8) { sum = f(sum + f(value * 10)); weight = f(weight + 10) }
    else if (value >= 0) { sum = f(sum + value); weight = f(weight + 1) }
  }
  return f(sum / weight)
}

export function boxesCover (boxes, minimum, maximum) {
  const edges = minimum.map((lo, axis) => [...new Set([lo, maximum[axis], ...boxes.flatMap(box => [box[axis], box[axis + minimum.length]])].filter(n => n >= lo && n <= maximum[axis]))].sort((a, b) => a - b))
  const point = []
  function everyCell (axis) {
    if (axis === edges.length) return boxes.some(box => point.every((n, i) => n >= box[i] - 1e-7 && n <= box[i + point.length] + 1e-7))
    for (let i = 0; i < edges[axis].length - 1; i++) { point[axis] = (edges[axis][i] + edges[axis][i + 1]) / 2; if (!everyCell(axis + 1)) return false }
    return true
  }
  return everyCell(0)
}

function shapeBoxes (state) {
  if (state.canOcclude === false) return []
  if (state.dynamicShape || state.occlusionUnavailable || !Array.isArray(state.occlusionBoxes)) throw Error(`NATIVE_FLUID_OCCLUSION_UNAVAILABLE:${state.name}`)
  if (state.occlusionBoxes.length > 128) throw Error('NATIVE_FLUID_OCCLUSION_COMPLEXITY_LIMIT')
  return state.occlusionBoxes
}

export function faceOccluded (state, direction, height) {
  if (!state.canOcclude) return false
  if (direction === 'up' && height < 1 - 1e-7) return false
  const axis = ['up', 'down'].includes(direction) ? 1 : ['east', 'west'].includes(direction) ? 0 : 2
  const positive = ['up', 'east', 'south'].includes(direction), others = [0, 1, 2].filter(i => i !== axis)
  const boxes = shapeBoxes(state).filter(box => Math.abs(box[axis + (positive ? 0 : 3)] - (positive ? 0 : 1)) < 1e-7)
    .map(box => [...others.map(i => box[i]), ...others.map(i => box[i + 3])])
  return boxesCover(boxes, [0, 0], others.map(i => i === 1 ? height : 1))
}

function solidRender (state) { return state.canOcclude && boxesCover(shapeBoxes(state), [0, 0, 0], [1, 1, 1]) }

export function waterGeometry (position, getState, { shrink = 0 } = {}) {
  const get = p => {
    const s = getState(p)
    if (!s || !s.fluid || !['solid', 'blocksMotion', 'canOcclude', 'dynamicShape'].every(k => typeof s[k] === 'boolean') ||
        typeof s.fluid.empty !== 'boolean' || typeof s.fluid.name !== 'string' || !Number.isFinite(s.fluid.height) || s.fluid.height < 0 || s.fluid.height > 1) throw Error('NATIVE_FLUID_NEIGHBOR_METADATA_UNAVAILABLE')
    return s
  }
  const state = get(position)
  if (!same(state)) throw Error('NATIVE_FLUID_TYPE_UNSUPPORTED')
  if (!Number.isFinite(shrink) || shrink < 0 || shrink > 1) throw Error('NATIVE_FLUID_SHRINK_INVALID')
  const height = p => {
    const s = get(p)
    if (same(s)) return same(get(at(p, dirs.up))) ? 1 : s.fluid.height
    return s.solid ? -1 : 0
  }
  const center = height(position), n = height(at(position, dirs.north)), s = height(at(position, dirs.south)), w = height(at(position, dirs.west)), e = height(at(position, dirs.east))
  let nw, ne, sw, se
  if (center >= 1) nw = ne = sw = se = 1
  else {
    ne = weightedFluidHeight(center, n, e, () => height(at(position, [1, 0, -1])))
    nw = weightedFluidHeight(center, n, w, () => height(at(position, [-1, 0, -1])))
    se = weightedFluidHeight(center, s, e, () => height(at(position, [1, 0, 1])))
    sw = weightedFluidHeight(center, s, w, () => height(at(position, [-1, 0, 1])))
  }
  let flowX = 0, flowZ = 0
  for (const name of ['north', 'south', 'west', 'east']) {
    const p = at(position, dirs[name]), neighbor = get(p)
    if (!neighbor.fluid.empty && !same(neighbor)) continue
    let otherHeight = neighbor.fluid.height, difference = 0
    if (otherHeight === 0) {
      const lower = get(at(p, dirs.down))
      if (!neighbor.blocksMotion && (lower.fluid.empty || same(lower)) && (otherHeight = lower.fluid.height) > 0) difference = f(state.fluid.height - f(otherHeight - f(8 / 9)))
    } else if (otherHeight > 0) difference = f(state.fluid.height - otherHeight)
    flowX += f(dirs[name][0] * difference); flowZ += f(dirs[name][2] * difference)
  }
  const flowLength = Math.hypot(flowX, flowZ)
  if (flowLength < 1e-4) flowX = flowZ = 0
  else { flowX /= flowLength; flowZ /= flowLength }
  const bottomState = get(at(position, dirs.down)), above = get(at(position, dirs.up))
  const visible = name => !same(get(at(position, dirs[name]))) && !faceOccluded(state, opposite[name], 1)
  const bottom = visible('down') && !faceOccluded(bottomState, 'down', f(8 / 9))
  const minY = bottom ? DELTA : 0, quads = []
  const quad = (face, vertices, uv, texture, backwards = false, shade = 1) => quads.push({ face, vertices, uv, texture: `minecraft:block/${texture}`, backwards, shade })
  if (!same(above) && !faceOccluded(above, 'up', Math.min(nw, ne, sw, se))) {
    nw = f(nw - DELTA); ne = f(ne - DELTA); sw = f(sw - DELTA); se = f(se - DELTA)
    let uv, texture = 'water_still'
    if (flowX === 0 && flowZ === 0) uv = [0, 0, 0, 1, 1, 1, 1, 0]
    else {
      texture = 'water_flow'
      const angle = f(f(nativeAtan2(flowZ, flowX)) - f(Math.PI / 2)), factor = f(10430.378)
      const a = f(sin[Math.trunc(f(angle * factor)) & 65535] * 0.25)
      const b = f(sin[Math.trunc(f(f(angle * factor) + 16384)) & 65535] * 0.25)
      uv = [f(0.5 + f(-b - a)), f(0.5 + f(-b + a)), f(0.5 + f(-b + a)), f(0.5 + f(b + a)), f(0.5 + f(b + a)), f(0.5 + f(b - a)), f(0.5 + f(b - a)), f(0.5 + f(-b - a))]
    }
    const u = f(f(f(uv[0] + uv[2]) + uv[4]) + uv[6]) / 4, v = f(f(f(uv[1] + uv[3]) + uv[5]) + uv[7]) / 4
    uv = uv.map((value, i) => f(value + f(shrink * f((i % 2 ? v : u) - value))))
    let backwards = false
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) { const s = get(at(position, [x, 1, z])); if (!same(s) && !solidRender(s)) backwards = true }
    quad('up', [0, nw, 0, 0, sw, 1, 1, se, 1, 1, ne, 0], uv, texture, backwards)
  }
  if (bottom) quad('down', [0, minY, 1, 0, minY, 0, 1, minY, 0, 1, minY, 1], [0, 1, 0, 0, 1, 0, 1, 1], 'water_still', false, 0.5)
  const sides = {
    north: { a: nw, b: ne, x1: 0, x2: 1, z1: DELTA, z2: DELTA },
    south: { a: se, b: sw, x1: 1, x2: 0, z1: f(1 - DELTA), z2: f(1 - DELTA) },
    west: { a: sw, b: nw, x1: DELTA, x2: DELTA, z1: 1, z2: 0 },
    east: { a: ne, b: se, x1: f(1 - DELTA), x2: f(1 - DELTA), z1: 0, z2: 1 }
  }
  for (const [name, c] of Object.entries(sides)) {
    const neighbor = get(at(position, dirs[name]))
    if (!visible(name) || faceOccluded(neighbor, name, Math.max(c.a, c.b))) continue
    // Vanilla chooses the original overlay for half-transparent blocks/leaves.
    // Additional NeoForge fluid overlays need their own registered provider.
    if (!neighbor.name.startsWith('minecraft:')) throw Error(`NATIVE_FLUID_OVERLAY_PROVIDER_UNSUPPORTED:${neighbor.name}`)
    const overlay = neighbor.name.startsWith('minecraft:') && (neighbor.name.endsWith('_leaves') || ['minecraft:glass', 'minecraft:tinted_glass'].includes(neighbor.name) || neighbor.name.endsWith('_stained_glass'))
    quad(name, [c.x1, c.a, c.z1, c.x2, c.b, c.z2, c.x2, minY, c.z2, c.x1, minY, c.z1], [0, f(f(1 - c.a) / 2), 0.5, f(f(1 - c.b) / 2), 0.5, 0.5, 0, 0.5], overlay ? 'water_overlay' : 'water_flow', !overlay, ['north', 'south'].includes(name) ? 0.8 : 0.6)
  }
  return { quads, corners: { nw, ne, sw, se }, flow: { x: flowX, z: flowZ }, atlasShrinkVerified: false }
}
