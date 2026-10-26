import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createViewerEntityStream } from '../src/viewer-stream.mts';

function fixture(options = {}) {
  const events = [];
  const bot = { entity: { id: 1, position: { x: 0, y: 64, z: 0 } } };
  const socket = { connected: true, conn: { transport: { writable: true } }, emit: (event, value) => events.push([event, value]) };
  const stream = createViewerEntityStream({ bot, socket, serialize: e => ({ ...e, position: { ...e.position }, pos: { ...e.position } }), ...options });
  return { events, socket, stream };
}
const arrow = (id = 2) => ({ id, name: 'arrow', position: { x: 1, y: 65, z: 0 }, velocity: { x: 1, y: -.1, z: 0 }, width: .5, height: .5 });

describe('observed projectile stream', () => {
  it('sends close-range spawn, motion and destruction even before the 100 ms batch tick', () => {
    const { events, stream } = fixture();
    try {
      const e = arrow(); stream.queue(e, true);
      assert.deepEqual(events.map(v => v[0]), ['entity']);
      e.position.x = 2; stream.queue(e);
      assert.equal(events[1][0], 'entityMoved');
      assert.deepEqual(events[1][1].velocity, e.velocity);
      stream.remove(e);
      assert.deepEqual(events[2], ['entity', { id: 2, delete: true }]);
      stream.flush(); assert.equal(events.length, 3);
    } finally { stream.close(); }
  });
  it('keeps ordinary mobs coalesced, and never sends stale arrows after removal under backpressure', () => {
    const { events, socket, stream } = fixture();
    try {
      stream.queue({ ...arrow(3), name: 'zombie' }, true);
      assert.deepEqual(events, []);
      socket.conn.transport.writable = false;
      const e = arrow(); stream.queue(e, true); stream.remove(e);
      socket.conn.transport.writable = true; stream.flush();
      assert.deepEqual(events.map(v => v[1].id), [3]);
    } finally { stream.close(); }
  });
  it('retains visibility, budget and closed-stream guards on the immediate lane', () => {
    const { events, stream } = fixture({ maxEntities: 1 });
    try {
      stream.queue({ ...arrow(), position: { x: 1000, y: 64, z: 0 } }, true);
      assert.deepEqual(events, []);
      stream.queue(arrow(3), true); stream.queue(arrow(4), true);
      assert.deepEqual(events.map(v => v[1].id), [3]);
      stream.close(); stream.queue(arrow(5), true);
      assert.equal(events.length, 1);
    } finally { stream.close(); }
  });
});
