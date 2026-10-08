import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { hasDeepRoof, hasRoomCeiling, patchRoomOcclusion, roomCutoffWorldY, roomOcclusionMode } from '../minecraft-viewer-room-occlusion.mjs';

test('dungeon cuts both thin and thick upper layers while third-person keeps corridor transparency', () => {
  const solid = new Set(['0,66,0', '1,66,0', '0,66,1']);
  const cache = { isSolidBlock: (x, y, z) => solid.has(`${x},${y},${z}`) };
  const avatar = { x: 0.3, y: 64.3, z: 0.3 };
  assert.equal(hasRoomCeiling(avatar, cache), true);
  assert.equal(hasDeepRoof(avatar, cache), false);
  assert.equal(roomOcclusionMode(true, true), 'cutaway');
  assert.equal(roomCutoffWorldY(avatar.y, false), 64.35, 'floor and slabs beneath the feet remain opaque');
  for (let y = 67; y <= 70; y += 1) solid.add(`0,${y},0`);
  assert.equal(roomOcclusionMode(true, true), 'cutaway');
  assert.equal(roomOcclusionMode(false, true), 'translucent');
  assert.equal(roomOcclusionMode(true, false), 'translucent');
  assert.equal(roomCutoffWorldY(avatar.y, true), 65.95);
});

test('generated terrain shader bounds dungeon cutaway and third-person transparency', () => {
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
  const cutCondition = material.fragmentShader.match(/if \((u_lanternCutawayEnabled > 1\.5[^)]*)\) discard/)[1];
  const cut = (y, along, inRoom = true) => runInNewContext(cutCondition, {
    u_lanternCutawayEnabled: 2, u_lanternCutawayY: 65.95,
    v_lanternCutawayPosition: { y }, lanternHardCutawayRegion: inRoom, lanternAlongRaw: along,
  });
  for (const along of [-3, 0, 0.5, 1, 5]) {
    assert.equal(cut(66, along), true, 'local room opening removes its upper floor');
    assert.equal(cut(65.9, along), false, 'floor and avatar space are retained');
  }
  assert.equal(cut(90, 5, false), false, 'distant mountain outside the room and corridor is retained');
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

test('outdoor mountains remain whole, covered rooms slice, and missing collision data cannot activate slicing', () => {
  const client = patchRoomOcclusion(readFileSync(new URL('../../src/modern-viewer/client.js', import.meta.url), 'utf8'));
  const start = client.indexOf('function runDungeonOcclusionCheck()');
  const end = client.indexOf('function refreshDungeonCutawayMaterials()', start);
  for (const isDungeonView of [true, false]) for (const situation of ['clear', 'wall', 'roof', 'unavailable']) {
    const calls = [];
    const context = {
      usesWorldAvatar: true, isDungeonView, rendererReady: true, document: { hidden: false, getElementById: () => null },
      latestPosition: { pos: { x: 0, y: 64.3, z: 0 } },
      world: { camera: { getWorldPosition: point => Object.assign(point, { x: 0, y: 10, z: 10 }) },
        cameraCollisionBlockCache: situation === 'unavailable' ? undefined : { isSolidBlock: (x,y,z) => situation === 'roof' && y === 26 },
        sceneOrigin: { toWorldX: x => x, toWorldY: y => y, toWorldZ: z => z } },
      dungeonOcclusionCameraScene: {}, performance, DUNGEON_OCCLUSION_RELEASE_SAMPLES: 3,
      DUNGEON_OCCLUSION_INTERVAL_MS: 250, DUNGEON_OCCLUSION_CUT_HEIGHT: 1.65,
      dungeonOcclusionState: { active: false, clearSamples: 0 }, dungeonCutawayApplied: false,
      dungeonOcclusionDiagnostics: { checks: 0, samples: 0 }, dungeonCutawayMaterials: new Map(),
      viewerPerformanceCounters: { occlusionChecks: 0, occlusionVoxelSamples: 0, cutawayActivations: 0, cutawayRestores: 0 },
      resolveObserverTargetPosition: () => ({ position: { x: 50, y: 24.3, z: 25 }, mode: 'entity' }), focusedCharacterId: '8',
      traceVisibilityCorridor: () => ({ occluded: situation === 'wall', samples: 0, reason: 'clear', hit: null }),
      updateOcclusionHysteresis: (_previous, active) => ({ active, clearSamples: 0 }),
      refreshDungeonCutawayMaterials() {}, restoreDungeonCutaway() {},
      roomCutoffWorldY, roomOcclusionMode, hasRoomCeiling, hasDeepRoof,
      applyDungeonCutaway(args) { calls.push(args); context.dungeonCutawayApplied = true; },
    };
    runInNewContext(`${client.slice(start, end)}\nrunDungeonOcclusionCheck();`, context);
    const covered = situation === 'roof';
    const active = covered || situation === 'wall';
    assert.equal(calls.length, active ? 1 : 0, `${isDungeonView}: ${situation}`);
    if (active) {
      const hard = isDungeonView && covered;
      assert.equal(calls[0].cutoffWorldY, hard ? 25.95 : 24.35);
      assert.equal(calls[0].hardCutaway, hard);
      assert.equal(context.dungeonOcclusionDiagnostics.cutScope, hard ? 'room-and-corridor' : 'corridor');
      assert.equal(context.dungeonUpperCutawayY, hard ? 24.3 : null);
    }
    if (situation === 'unavailable') assert.equal(context.dungeonOcclusionDiagnostics.active, false);
  }
});
