import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import * as THREE from 'three';
import { Group } from 'three';
import { patchRendererEntityVisibility, patchRendererEntityDamage } from '../minecraft-viewer-entity-visibility.mjs';

const require = createRequire(import.meta.url);
const native = readFileSync(require.resolve('minecraft-renderer/dist/minecraft-renderer.js'), 'utf8');
// Execute the actual pinned renderer block, including its distance/section
// policy. No handwritten duplicate of the visibility calculation in tests.
function renderBlock(source) {
  const marker = '!o&&t&&s.position){';
  const start = source.indexOf(marker) + marker.length;
  const end = source.indexOf('if(s.userData.renderHints?.localVehicle)', start);
  assert.ok(start > 0 && end > start);
  assert.equal(source[end - 1], '}');
  return runInNewContext(`(function(s,t){let r=100,i='test-entity';${source.slice(start, end - 1)}})`);
}
function fixture() {
  const entity = new Group();
  let origin = { x: -860, y: 93, z: 236 };
  let position = { x: -856, y: 91, z: 235 };
  let loaded = true;
  let occluded = false;
  let tracked = true;
  const sections = [];
  const renderer = {
    worldRenderer: {
      sceneOrigin: {
        getWorldPosition: () => tracked ? position : undefined,
        toWorldX: x => x + origin.x,
        toWorldY: y => y + origin.y,
        toWorldZ: z => z + origin.z,
      },
      entitySectionKey(x, y, z) { return [x, y, z].map(v => Math.floor(v / 16) * 16).join(','); },
      isSectionOcclusionVisible(key) { sections.push(key); return !occluded && key === '-864,80,224'; },
      shouldObjectVisible: () => loaded,
    },
    maybeRenderPlayerSkin() {},
  };
  return { entity, renderer, sections,
    setOrigin: value => { origin = value; entity.position.set(position.x - origin.x, position.y - origin.y, position.z - origin.z); },
    setPosition: value => { position = value; },
    setLoaded: value => { loaded = value; },
    setOccluded: value => { occluded = value; },
    setTracked: value => { tracked = value; },
  };
}
const render = renderBlock(patchRendererEntityVisibility(native));

test('nearby entities remain visible during floating-origin shifts and chunk remeshing', () => {
  const f = fixture();
  for (let frame = 0; frame < 360; frame++) {
    f.setOrigin({ x: -860 + Math.sin(frame), y: 93 + Math.cos(frame), z: 236 + frame / 360 });
    f.setLoaded(frame % 2 === 0);
    render.call(f.renderer, f.entity, { x: -860, y: 91, z: 236 });
    assert.equal(f.entity.visible, true, `frame ${frame}`);
  }
  assert.deepEqual([...new Set(f.sections)], ['-864,80,224']);
});
test('the unmodified renderer queries camera-local sections and hides that nearby entity', () => {
  const f = fixture();
  f.setOrigin({ x: -860, y: 93, z: 236 });
  f.setLoaded(false);
  renderBlock(native).call(f.renderer, f.entity, { x: -860, y: 91, z: 236 });
  assert.equal(f.entity.visible, false);
  assert.notEqual(f.sections[0], '-864,80,224');
});
test('untracked objects convert scene-local coordinates back to the world', () => {
  const f = fixture();
  f.setOrigin({ x: -860, y: 93, z: 236 });
  f.setTracked(false);
  render.call(f.renderer, f.entity, { x: -860, y: 91, z: 236 });
  assert.equal(f.entity.visible, true);
  assert.deepEqual(f.sections, ['-864,80,224']);
});
test('real section occlusion still hides entities, including nearby ones', () => {
  const f = fixture();
  f.setOccluded(true);
  render.call(f.renderer, f.entity, { x: -860, y: 91, z: 236 });
  assert.equal(f.entity.visible, false);
});
test('distant entities still require a loaded renderable chunk', () => {
  const f = fixture();
  f.setLoaded(false);
  render.call(f.renderer, f.entity, { x: -880, y: 91, z: 236 });
  assert.equal(f.entity.visible, false);
  f.setLoaded(true);
  render.call(f.renderer, f.entity, { x: -880, y: 91, z: 236 });
  assert.equal(f.entity.visible, true);
});
test('renderer upgrades fail explicitly instead of silently losing the adaptation', () => {
  assert.throws(() => patchRendererEntityVisibility('changed renderer'), /anchor changed/);
  assert.throws(() => patchRendererEntityVisibility(native + native), /anchor changed/);
});

test('damage tint skips uncolored shader materials and still colors the skin', () => {
  const source = patchRendererEntityDamage(native);
  const start = source.indexOf('handleDamageEvent(e,t){');
  const end = source.indexOf('raycastSceneDebug()', start);
  const method = runInNewContext(`({${source.slice(start, end)}}).handleDamageEvent`, {
    j: THREE, Ge: class { to() { return this; } start() {} },
  });
  const mesh = new Group();
  mesh.name = 'mesh';
  const skin = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const glint = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.ShaderMaterial());
  mesh.add(skin, glint);
  const parent = new Group();
  parent.add(mesh);
  const shader = glint.material;
  assert.doesNotThrow(() => method.call({ entities: { '42': parent } }, 42, 1));
  assert.equal(skin.material.color.getHex(), 0xff0000);
  assert.equal(glint.material, shader);
});
