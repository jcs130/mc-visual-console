import { MAX_ROOM_RADIUS } from "./room-visibility.js";

const extent = Math.ceil(MAX_ROOM_RADIUS) + 1;
const width = extent * 2 + 1;
const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Follow supported head-height air space. Thin partition walls can lose their
// upper rim; thick rock masses and unsupported space beyond a ledge stay whole.
export class RoomFloorMask {
  constructor(cache) {
    this.cache = cache;
    this.signature = null;
    this.current = null;
    this.rebuilds = 0;
  }

  update(avatar, radius) {
    const x = Math.floor(avatar.x), y = Math.floor(avatar.y), z = Math.floor(avatar.z);
    const reach = Math.min(extent - 1, Math.ceil(radius));
    const signature = `${x},${y},${z},${reach},${this.cache.revision}`;
    if (signature === this.signature) return this.current;
    const startedAt = performance.now();
    const origin = { x: x - extent, z: z - extent };
    const data = new Uint8Array(width * width);
    const visited = new Uint8Array(width * width);
    const queue = new Uint32Array(width * width);
    const seed = extent + extent * width;
    queue[0] = seed;
    visited[seed] = data[seed] = 1;
    let read = 0, count = 1, boundaryCells = 0;
    while (read < count) {
      const current = queue[read++];
      const cx = current % width, cz = Math.floor(current / width);
      for (const [dx, dz] of neighbors) {
        const nx = cx + dx, nz = cz + dz;
        if ((nx - extent) ** 2 + (nz - extent) ** 2 > reach * reach) continue;
        const index = nx + nz * width;
        if (visited[index]) continue;
        visited[index] = 1;
        const wx = origin.x + nx, wz = origin.z + nz;
        if (this.cache.isSolidBlock(wx, y + 1, wz)) {
          for (let thickness = 1; thickness <= 2; thickness++) {
            if (this.cache.isSolidBlock(wx + dx * thickness, y + 1, wz + dz * thickness)) continue;
            for (let step = 0; step < thickness; step++) data[index + step * (dx + dz * width)] = 255;
            boundaryCells += thickness;
            break;
          }
        } else if (this.cache.isSolidBlock(wx, y - 1, wz) || this.cache.isSolidBlock(wx, y, wz)
          || this.cache.isSolidBlock(wx, y - 2, wz)) {
          data[index] = 255;
          queue[count++] = index;
        }
      }
    }
    data[seed] = 255;
    this.signature = signature;
    this.rebuilds++;
    this.current = { origin, width, data, openCells: count, boundaryCells,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      contains(position) {
        const lx = Math.floor(position.x) - origin.x, lz = Math.floor(position.z) - origin.z;
        return lx >= 0 && lx < width && lz >= 0 && lz < width && data[lx + lz * width] > 0;
      } };
    return this.current;
  }

  get diagnostics() {
    const mask = this.current;
    return mask ? { openCells: mask.openCells, boundaryCells: mask.boundaryCells,
      buildDurationMs: mask.durationMs, rebuilds: this.rebuilds } : null;
  }
}
