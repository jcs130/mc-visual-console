import { MAX_ROOM_RADIUS } from "./room-visibility.js";

const extent = Math.ceil(MAX_ROOM_RADIUS) + 1;
const width = extent * 2 + 1;
const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const maxFloorRise = 6;

// Follow supported, two-block-high air space, including steps in a cave.
// RG bytes store coverage and floor height relative to baseY (biased by 128).
// Each column belongs to one connected floor, never a second stacked storey.
export class RoomFloorMask {
  constructor(cache) {
    this.cache = cache;
    this.signature = null;
    this.current = null;
    this.rebuilds = 0;
    this.data = new Uint8Array(width * width * 2);
    this.visited = new Uint8Array(width * width);
    this.queue = new Uint32Array(width * width);
  }

  update(avatar, radius) {
    const x = Math.floor(avatar.x), y = Math.floor(avatar.y), z = Math.floor(avatar.z);
    const reach = Math.min(extent - 1, Math.ceil(radius));
    const signature = `${x},${y},${z},${reach},${this.cache.revision}`;
    if (signature === this.signature) return this.current;
    const startedAt = performance.now();
    const origin = { x: x - extent, z: z - extent };
    const data = this.data, visited = this.visited, queue = this.queue;
    data.fill(0); visited.fill(0);
    const seed = extent + extent * width;
    const mark = (index, floorY, boundary = false) => {
      data[index * 2] = boundary ? 128 : 255;
      data[index * 2 + 1] = floorY - y + 128;
    };
    // Jumping/falling does not establish a floor. Search just two cells down;
    // no unsupported seed in unloaded chunks or the sky.
    let seedY = null;
    for (const candidate of [y, y - 1, y - 2]) {
      if (this.cache.isSolidBlock(x, candidate - 1, z)
        && !this.cache.isSolidBlock(x, candidate, z) && !this.cache.isSolidBlock(x, candidate + 1, z)) {
        seedY = candidate; break;
      }
    }
    let read = 0, count = 0, boundaryCells = 0;
    if (seedY !== null) { mark(seed, seedY); queue[count++] = seed; visited[seed] = 1; }
    while (read < count) {
      const current = queue[read++];
      const cx = current % width, cz = Math.floor(current / width);
      const currentY = y + data[current * 2 + 1] - 128;
      for (const [dx, dz] of neighbors) {
        const nx = cx + dx, nz = cz + dz;
        if ((nx - extent) ** 2 + (nz - extent) ** 2 > reach * reach) continue;
        const index = nx + nz * width;
        if (visited[index]) continue;
        const wx = origin.x + nx, wz = origin.z + nz;
        let floorY = null;
        for (const candidate of [currentY, currentY + 1, currentY - 1, currentY - 2]) {
          if (Math.abs(candidate - y) > maxFloorRise) continue;
          if (this.cache.isSolidBlock(wx, candidate - 1, wz)
            && !this.cache.isSolidBlock(wx, candidate, wz)
            && !this.cache.isSolidBlock(wx, candidate + 1, wz)) {
            floorY = candidate;
            break;
          }
        }
        if (floorY !== null) {
          visited[index] = 1;
          mark(index, floorY);
          queue[count++] = index;
        } else if (this.cache.isSolidBlock(wx, currentY + 1, wz)) {
          for (let thickness = 1; thickness <= 2; thickness++) {
            if (this.cache.isSolidBlock(wx + dx * thickness, currentY + 1, wz + dz * thickness)) continue;
            for (let step = 0; step < thickness; step++) {
              const boundary = index + step * (dx + dz * width);
              if (!visited[boundary]) mark(boundary, currentY, true);
            }
            boundaryCells += thickness;
            break;
          }
        }
      }
    }
    this.signature = signature;
    this.rebuilds++;
    this.current = { origin, baseY: y, width, data, openCells: count, boundaryCells,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      contains(position) {
        const lx = Math.floor(position.x) - origin.x, lz = Math.floor(position.z) - origin.z;
        return lx >= 0 && lx < width && lz >= 0 && lz < width && data[(lx + lz * width) * 2] > 0;
      },
      isOpen(position) {
        if (!this.contains(position)) return false;
        return data[(Math.floor(position.x) - origin.x + (Math.floor(position.z) - origin.z) * width) * 2] === 255;
      },
      floorYAt(position) {
        if (!this.contains(position)) return null;
        const index = Math.floor(position.x) - origin.x + (Math.floor(position.z) - origin.z) * width;
        return y + data[index * 2 + 1] - 128;
      } };
    return this.current;
  }

  get diagnostics() {
    const mask = this.current;
    return mask ? { openCells: mask.openCells, boundaryCells: mask.boundaryCells,
      buildDurationMs: mask.durationMs, rebuilds: this.rebuilds } : null;
  }
}
