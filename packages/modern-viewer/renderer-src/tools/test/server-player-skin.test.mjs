import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const client = readFileSync(new URL('../../src/modern-viewer/client.js', import.meta.url), 'utf8');
const start = client.indexOf('function maybeApplyPlayerSkin(');
const end = client.indexOf('function isOwnAvatarEntity(', start);

function fixture() {
  const pending = [];
  const timers = [];
  const canvas = { dataset: {} };
  const player = { skin: { modelType: 'default' } };
  const entity = { id: 7, name: 'player', isSelf: true, skinUrl: `/head-texture/${'a'.repeat(64)}.png`, skinModel: 'slim' };
  const context = {
    selectedPlayerSkin: { id: 'default', label: 'fallback', texture: '/default.png', model: 'classic' },
    pendingAvatarState: { entity }, pendingPlayerEntity: null,
    playerSkinTargetSignatures: new Map(), playerSkinApplySequence: 0,
    canonicalEntityName: name => name,
    globalThis: { world: { entities: { getPlayerObject: () => player } } },
    document: { getElementById: () => canvas },
    viewer: { backend: { backendMethods: {
      applyTemporaryPlayerSkinOverride: texture => new Promise(resolve => pending.push({ texture, resolve })),
      updatePlayerSkin: (id, username, uuid, texture) => new Promise(resolve => pending.push({ texture, resolve })),
    } } },
    setTimeout: callback => timers.push(callback),
    postToDashboard() {}, maybeApplySelectedPlayerModel() {}, schedulePlayerHeadIntegrityCheck() {},
    playerSkinLastError: null, playerSkinStatus: 'waiting', playerSkinLastAppliedAt: 0,
  };
  const api = runInNewContext(`${client.slice(start, end)}\n({apply: maybeApplyPlayerSkin, resolve: resolveSelfPlayerSkin})`, context);
  return { context, api, pending, timers, canvas, player, entity };
}

test('self and inventory resolve the actual server skin while unknown profiles use the fallback', () => {
  const { context, api, entity } = fixture();
  assert.equal(api.resolve().texture, entity.skinUrl);
  assert.equal(api.resolve().model, 'slim');
  context.pendingAvatarState.entity = { id: 7 };
  assert.equal(api.resolve().texture, '/default.png');
  context.pendingAvatarState.entity.skinUrl = 'https://example.invalid/untrusted.png';
  assert.equal(api.resolve().texture, '/default.png');
});

test('a late texture response cannot replace the current server appearance or repeat skin loading', async () => {
  const { context, api, pending, timers, canvas, player, entity } = fixture();
  api.apply(entity);
  api.apply(entity);
  assert.equal(pending.length, 1, 'unchanged avatar ticks reuse the texture request');
  const next = { ...entity, skinUrl: `/head-texture/${'b'.repeat(64)}.png`, skinModel: 'classic' };
  context.pendingAvatarState.entity = next;
  api.apply(next);
  pending[1].resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(canvas.dataset.playerSkinStatus, 'applied');
  assert.equal(player.skin.modelType, 'default');
  assert.equal(canvas.dataset.playerSkinId, `server:${'b'.repeat(64)}:classic`);
  pending[0].resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(player.skin.modelType, 'default', 'old slim metadata cannot overwrite the current classic model');
  assert.equal(timers.length, 1, 'only the current profile schedules integrity checks');
});

test('other player profile changes ignore older arm models and profile removal restores the default', async () => {
  const { api, pending, player, entity } = fixture();
  const other = { ...entity, id: 8, isSelf: false };
  api.apply(other);
  api.apply(other);
  assert.equal(pending.length, 1, 'unchanged profiles reuse the texture request');
  const next = { ...other, skinUrl: `/head-texture/${'c'.repeat(64)}.png`, skinModel: 'classic' };
  api.apply(next);
  pending[1].resolve();
  await new Promise(resolve => setImmediate(resolve));
  pending[0].resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(player.skin.modelType, 'default');
  api.apply(other);
  pending[2].resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(player.skin.modelType, 'slim');
  api.apply({ ...other, skinUrl: null, skinModel: null });
  assert.equal(pending[3].texture, '/default.png');
  pending[3].resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(player.skin.modelType, 'default');
});
