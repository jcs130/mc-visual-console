import test from 'node:test';
import assert from 'node:assert/strict';
import { ViewerSessionSlots } from '../src/viewer-session-slots.mjs';

test('a temporary capture leaves full audience reservations intact', () => {
  const slots = new ViewerSessionSlots(2, 1);
  const viewers = [slots.reserve(false), slots.reserve(false)];
  assert.equal(slots.reserve(false), null);
  const capture = slots.reserve(true);
  assert.deepEqual(slots.status(), { viewers: 2, maxSessions: 2, captureSessions: 1, maxCaptureSessions: 1 });
  assert.equal(slots.reserve(true), null);
  capture(); capture();
  assert.equal(slots.status().viewers, 2);
  assert.equal(slots.status().captureSessions, 0);
  assert.equal(slots.reserve(false), null);
  viewers[0]();
  assert.equal(typeof slots.reserve(false), 'function');
  viewers[1]();
});
