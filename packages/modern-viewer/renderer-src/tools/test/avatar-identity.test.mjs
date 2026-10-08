import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

function harness() {
  const clientSource = readFileSync(new URL('../../src/modern-viewer/client.js', import.meta.url), 'utf8');
  const builder = readFileSync(new URL('../build-minecraft-viewer-client.mjs', import.meta.url), 'utf8');
  const adaptation = builder.slice(builder.indexOf('const adaptedClient ='), builder.indexOf('const changedClient ='));
  const potionRenderAnchor = '  worldView.emit(isMove ? "entityMoved" : "entity",\n    isMove ? normalized : rendererEntityEquipment(normalized, globalThis.mcData?.itemsByName));';
  const adapted = runInNewContext(`${adaptation}\nadaptedClient`, { clientSource, potionRenderAnchor });
  const start = adapted.indexOf('function handleEntity(');
  const end = adapted.indexOf('\nfunction normalizeEntity(', start);
  const integrity = readFileSync(new URL('../minecraft-viewer-avatar-integrity.js', import.meta.url), 'utf8');
  const rendered = new Map();
  const noop = () => {};
  const context = {
    entityCache: new Map(), pendingAvatarState: null, rendererReady: true, fishingVisuals: null,
    playerSkinTargetSignatures: new Map(),
    focusedCharacterId: null, playerModelInstance: null, selectedNpcId: null,
    dungeonHoverEntityId: null, dungeonHoverPointer: null, normalizedAvatarMotion: null,
    pendingVillagerStyleChecks: new Set(), entityMotionFrames: new Map(),
    playerHeadIntegrityById: new Map(), villagerModelIntegrityById: new Map(), pendingPlayerHeadChecks: new Set(),
    canonicalEntityName: name => String(name ?? '').replace(/^minecraft:/, ''),
    finiteOr: (value, fallback) => Number.isFinite(value) ? value : fallback,
    normalizeEntity: entity => ({ ...entity }), isRenderableEntity: () => true,
    resolveCustomCharacterDefinition: () => null, isOwnAvatarEntity: entity => entity.isSelf === true,
    normalizeMotionFrame: entity => entity, rendererEntityEquipment: entity => entity,
    worldView: { emit(type, entity) { if (entity.delete) rendered.delete(String(entity.id)); else rendered.set(String(entity.id), entity); } },
  };
  for (const name of ['removePaintingEntity', 'removeCustomCharacter', 'removeSelectedPlayerModel',
    'publishPlayerModelDataset', 'removeAvatarRig', 'publishModelIntegrityDataset',
    'scheduleTrustedNpcAvatarRebalance', 'ensureAvatarRig', 'maybeApplyPlayerSkin',
    'maybeApplySelectedPlayerModel', 'schedulePlayerHeadIntegrityCheck', 'maybeApplyPaintingEntity',
    'maybeApplyCustomCharacter', 'maybeApplyVillagerAppearance', 'cortiApplySheepAppearance']) context[name] = noop;
  const receive = runInNewContext(`${integrity}\n${adapted.slice(start, end)}\nhandleEntity`, context);
  return { context, rendered, receive, self: entity => { context.pendingAvatarState = { entity }; receive(entity, false); } };
}

const player = (id, extra = {}) => ({ id, name: 'player', username: 'viewer-player', isSelf: true, ...extra });

test('late packets from the old local entity cannot recreate its model after respawn', () => {
  const f = harness();
  f.self(player(7));
  f.self(player(9));
  for (let frame = 0; frame < 120; frame++) f.receive(player(7, { pos: { x: frame, y: 64, z: 0 } }), true);
  assert.deepEqual([...f.context.entityCache.keys()], ['9']);
  assert.deepEqual([...f.rendered.keys()], ['9']);
});

test('authoritative avatar identity prunes an older self snapshot without an isSelf flag', () => {
  const f = harness();
  f.receive(player(7, { isSelf: undefined, uuid: 'same-player' }), false);
  f.self(player(9, { isSelf: undefined, uuid: 'same-player' }));
  assert.deepEqual([...f.rendered.keys()], ['9']);
  f.receive(player(7, { isSelf: undefined, uuid: 'same-player' }), false);
  assert.deepEqual([...f.rendered.keys()], ['9']);
});

test('identity cleanup retains other players and named mobs', () => {
  const f = harness();
  f.self(player(7, { uuid: 'local-uuid' }));
  f.receive(player(8, { isSelf: false, username: 'other-player', uuid: 'other-uuid' }), false);
  f.receive(player(10, { isSelf: false, username: 'viewer-player', uuid: 'different-uuid' }), false);
  f.receive({ id: 11, name: 'villager', username: 'viewer-player', isSelf: false }, false);
  f.self(player(9, { uuid: 'local-uuid' }));
  assert.deepEqual([...f.rendered.keys()].sort(), ['10', '11', '8', '9']);
});

test('partial position updates cannot revive a retired self ID', () => {
  const f = harness();
  f.self(player(7));
  f.self(player(9));
  f.receive(player(7), false);
  f.receive({ id: 7, pos: { x: 10, y: 64, z: 0 } }, true);
  assert.deepEqual([...f.rendered.keys()], ['9']);
});

test('a reused authoritative self ID can become current again', () => {
  const f = harness();
  f.self(player(7));
  f.context.playerSkinTargetSignatures.set('7', 'loaded');
  f.context.playerSkinTargetSignatures.set('player_entity', 'loaded');
  f.self(player(9));
  assert.equal(f.context.playerSkinTargetSignatures.has('7'), false);
  assert.equal(f.context.playerSkinTargetSignatures.has('player_entity'), false);
  f.self(player(7));
  assert.deepEqual([...f.rendered.keys()], ['7']);
});
