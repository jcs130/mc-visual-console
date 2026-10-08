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

test('host adaptation preserves the directly imported visibility policy', () => {
  const client = patchRoomOcclusion(readFileSync(new URL('../../src/modern-viewer/client.js', import.meta.url), 'utf8'));
  assert.ok(client.includes('from "./room-visibility.js"'));
  assert.ok(client.includes('patchCutawayMaterial(material, dungeonVisibilityUniforms)'));
  assert.ok(!client.includes('record.mode = "plane"'));
  assert.equal(patchRoomOcclusion(client), client);
});

test('body aperture covers surfaces missed by collision rays; only covered rooms slice', () => {
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
      dungeonOcclusionState: { active: false, clearSamples: 0 }, dungeonRoofState: { active: false, clearSamples: 0 }, dungeonCutawayApplied: false,
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
    const active = situation !== 'unavailable';
    assert.equal(calls.length, active ? 1 : 0, `${isDungeonView}: ${situation}`);
    if (active) {
      const hard = isDungeonView && covered;
      assert.equal(calls[0].cutoffWorldY, hard ? 25.95 : 24.35);
      assert.equal(calls[0].hardCutaway, hard);
      assert.equal(context.dungeonOcclusionDiagnostics.cutScope, hard ? 'room-and-aperture' : 'aperture');
      assert.equal(context.dungeonUpperCutawayY, hard ? 24.3 : null);
      assert.equal(context.dungeonOcclusionDiagnostics.detected, covered || situation === 'wall');
    }
    if (situation === 'unavailable') assert.equal(context.dungeonOcclusionDiagnostics.active, false);
  }
});
