import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { hasDeepRoof, hasRoomCeiling, patchRoomOcclusion, roomCutoffWorldY, roomOcclusionMode } from '../minecraft-viewer-room-occlusion.mjs';

test('thin roofs stay translucent in dungeon and third-person views; thick cover uses dungeon cutaway', () => {
  const solid = new Set(['0,66,0', '1,66,0', '0,66,1']);
  const cache = { isSolidBlock: (x, y, z) => solid.has(`${x},${y},${z}`) };
  const avatar = { x: 0.3, y: 64.3, z: 0.3 };
  assert.equal(hasRoomCeiling(avatar, cache), true);
  assert.equal(hasDeepRoof(avatar, cache), false);
  assert.equal(roomOcclusionMode(true, hasDeepRoof(avatar, cache)), 'translucent');
  assert.equal(roomCutoffWorldY(avatar.y, false), 64.35, 'floor and slabs beneath the feet remain opaque');
  for (let y = 67; y <= 70; y += 1) solid.add(`0,${y},0`);
  assert.equal(roomOcclusionMode(true, hasDeepRoof(avatar, cache)), 'cutaway');
  assert.equal(roomOcclusionMode(false, true), 'translucent');
  assert.equal(roomCutoffWorldY(avatar.y, true), 65.95);
});

test('generated terrain shader fades locally, preserves the floor and bounds the opening behind the avatar', () => {
  const client = patchRoomOcclusion(readFileSync(new URL('../../src/modern-viewer/client.js', import.meta.url), 'utf8'));
  const start = client.indexOf('function patchDungeonCutawayShader(material) {');
  const end = client.indexOf('\nfunction applyDungeonCutaway(', start);
  const patch = runInNewContext(`${client.slice(start, end)}\npatchDungeonCutawayShader`, {
    Vector3: class {}, DUNGEON_OCCLUSION_CORRIDOR_RADIUS: 1.85,
  });
  const material = { vertexShader: 'void main() { vec3 relativePos = vec3(0.0); }', fragmentShader: 'void main() {}' };
  assert.equal(patch(material), true);
  const range = material.fragmentShader.match(/bool lanternBeyondFirstHit = ([^;]+);/)[1];
  const eligible = along => runInNewContext(range, {
    lanternAlongRaw: along, u_lanternCutawayHitAlong: 0.35,
    u_lanternCutawayHalfSpan: 0.1, max: Math.max,
  });
  assert.equal(eligible(0.2), false);
  assert.equal(eligible(0.5), true);
  assert.equal(eligible(1.05), true, 'reveal the far half of the avatar');
  assert.equal(eligible(1.2), false);
  assert.ok(material.fragmentShader.includes('mix(16.0, 4.0, smoothstep(0.0, 0.75, lanternEdge))'));
  assert.ok(client.includes('dungeonOcclusionDiagnostics.mode === "cutaway"'));
  const checkStart = client.indexOf('function runDungeonOcclusionCheck()');
  const checkEnd = client.indexOf('function refreshDungeonCutawayMaterials()', checkStart);
  const check = client.slice(checkStart, checkEnd);
  assert.ok(check.indexOf('refreshDungeonCutawayMaterials()') < check.indexOf('if (dungeonOcclusionState.active)'));
  const shader = material.fragmentShader;
  material.needsUpdate = false;
  assert.equal(patch(material), true);
  assert.equal(material.fragmentShader, shader);
  assert.equal(material.needsUpdate, false, 'repeated visibility checks do not recompile terrain');
});
