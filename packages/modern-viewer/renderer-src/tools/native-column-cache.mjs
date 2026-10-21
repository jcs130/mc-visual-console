// Keep exact received terrain in bounded wire storage and decode only a bounded
// working set. Cache pressure is not a protocol failure or evidence of air.
export class NativeColumnCache {
  constructor ({ makeChunk, center = () => null, onEvict = () => {}, maxDecoded = 512, maxColumns = 2048, maxBytes = 64 * 1024 * 1024 }) {
    for (const limit of [maxDecoded, maxColumns, maxBytes]) if (!Number.isSafeInteger(limit) || limit < 1) throw Error('NATIVE_COLUMN_CACHE_LIMIT_INVALID')
    this.makeChunk = makeChunk; this.center = center; this.onEvict = onEvict
    this.maxDecoded = maxDecoded; this.maxColumns = maxColumns; this.maxBytes = maxBytes
    this.received = new Map(); this.decoded = new Map(); this.bytes = 0; this.evictions = 0
  }

  clear () { this.received.clear(); this.decoded.clear(); this.bytes = 0; this.hotKey = null; this.hotChunk = null }
  has (key) { return this.received.has(key) }

  put (key, data) {
    const chunk = this.makeChunk(); chunk.load(data) // Still validate every received native column.
    this.delete(key)
    const saved = Buffer.from(data)
    this.received.set(key, { data: saved, metadataBytes: 0 }); this.bytes += saved.length
    this.decoded.set(key, chunk); this.trimDecoded(); this.trim()
    return this.has(key)
  }

  get (key) {
    if (this.hotKey === key) return this.hotChunk
    const entry = this.received.get(key)
    if (!entry) return null
    this.received.delete(key); this.received.set(key, entry)
    const chunk = this.decoded.get(key) ?? this.makeChunk()
    if (!this.decoded.has(key)) chunk.load(entry.data)
    this.decoded.delete(key); this.decoded.set(key, chunk); this.trimDecoded()
    this.hotKey = key; this.hotChunk = chunk
    return chunk
  }

  changed (key) {
    const entry = this.received.get(key), chunk = this.decoded.get(key)
    if (!entry || !chunk) return
    const data = chunk.dump()
    this.bytes += data.length - entry.data.length; entry.data = Buffer.from(data)
    this.trim()
  }

  metadata (key, delta) {
    const entry = this.received.get(key)
    if (!entry) return
    entry.metadataBytes += delta; this.bytes += delta; this.trim()
  }

  delete (key) {
    if (this.hotKey === key) { this.hotKey = null; this.hotChunk = null }
    const entry = this.received.get(key)
    if (entry) this.bytes -= entry.data.length + entry.metadataBytes
    this.received.delete(key); this.decoded.delete(key)
  }

  trimDecoded () {
    while (this.decoded.size > this.maxDecoded) {
      const key = this.decoded.keys().next().value
      this.decoded.delete(key)
      if (this.hotKey === key) { this.hotKey = null; this.hotChunk = null }
    }
  }

  trim () {
    while (this.received.size > this.maxColumns || this.bytes > this.maxBytes) {
      const center = this.center(); let victim, farthest = -1
      for (const key of this.received.keys()) {
        const [x, z] = key.split(',').map(Number)
        const distance = center ? (x - Math.floor(center.x / 16)) ** 2 + (z - Math.floor(center.z / 16)) ** 2 : 0
        if (distance > farthest) { victim = key; farthest = distance }
      }
      this.delete(victim); this.evictions++; this.onEvict(victim)
    }
  }

  stats () {
    return { receivedColumns: this.received.size, decodedColumns: this.decoded.size, retainedBytes: this.bytes,
      maxColumns: this.maxColumns, maxDecodedColumns: this.maxDecoded, maxBytes: this.maxBytes, evictions: this.evictions }
  }
}
