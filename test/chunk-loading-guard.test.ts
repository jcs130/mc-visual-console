import { describe, expect, it } from 'vitest'
import { pendingChunkOrigins } from '../packages/modern-viewer/renderer-src/src/modern-viewer/chunk-loading-guard.js'

describe('pendingChunkOrigins', () => {
  it('keeps unfinished neighboring columns covered across negative chunk boundaries', () => {
    const finished = { '-16,-16': true, '0,-16': true }
    expect(pendingChunkOrigins({ x: -0.1, z: -0.1 }, 1, finished)).toEqual([
      { x: -32, z: -32 }, { x: -32, z: -16 }, { x: -32, z: 0 },
      { x: -16, z: -32 }, { x: -16, z: 0 },
      { x: 0, z: -32 }, { x: 0, z: 0 },
    ])
  })

  it('removes every guard once all columns are meshed', () => {
    expect(pendingChunkOrigins({ x: 5, z: 5 }, 0, { '0,0': true })).toEqual([])
  })
})
