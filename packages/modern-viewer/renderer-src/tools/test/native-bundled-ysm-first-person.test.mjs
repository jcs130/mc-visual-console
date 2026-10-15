import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { loadBundledAppearances } from '../../host/native-bundled-appearances.mjs'
import { BundledAppearanceReader } from '../../src/native-viewer/native-bundled-appearance.js'
import { createNativeBundledYsmPlayerActor } from '../../src/native-viewer/native-player-bundled-ysm.js'
import { NativeSelfPlayerController } from '../../src/native-viewer/native-self-player.js'
import { createNativeBedrockModel } from '../../src/native-viewer/native-entity-model-bedrock.js'
import { createBundledYsmFirstPersonArms, bundledYsmFirstPersonArmMatrix } from '../../src/native-viewer/native-bundled-ysm-first-person.js'
import { nativeFirstPersonEmptyArmMatrix, nativeFirstPersonPlayerArmMatrix } from '../../src/native-viewer/native-first-person-motion.js'

const catalog = process.env.NATIVE_BUNDLED_APPEARANCE_CATALOG
const uuid = '01234567-89ab-cdef-0123-456789abcdef'
const close = (a, b) => assert.ok(Math.abs(a - b) < 3e-7, `${a} != ${b}`)
const closeVector = (a, b) => a.toArray().forEach((value, i) => close(value, b.toArray()[i]))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const meshes = root => { const result = []; root.traverse(node => { if (node.isMesh) result.push(node) }); return result }
const vertices = root => { root.updateMatrixWorld(true); return meshes(root).flatMap(mesh => Array.from({ length: mesh.geometry.attributes.position.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i).applyMatrix4(mesh.matrixWorld))) }
async function originals () {
  const bundle = await loadBundledAppearances(catalog); assert.equal(bundle.metadata.available, true)
  const reader = new BundledAppearanceReader(bundle.metadata, p => bundle.read(p)), definition = await reader.json('ysm/neko_yui/models/arm.json')
  return { reader, definition }
}
async function actorFor (reader) {
  return createNativeBundledYsmPlayerActor(null, { uuid, bundledAppearance: { reader, id: 'bundled:yui-ysm' }, heldItemOptions: { now: () => 1000 },
    loadTexture: async bytes => { const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); return new THREE.Texture({ width: d.getUint32(16), height: d.getUint32(20) }) } })
}
function frame (arm = 'right') {
  return { playerUuid: uuid, self: { uuid, entityId: 42, mainArm: arm, quickBarSlot: 0, usingItem: false, spinAttack: false,
    handAnimation: { source: 'same_player_vanilla_hand_packets', playerUuid: uuid, entityId: 42, mainArm: arm, usingItem: false, spinAttack: false, sampledAt: 1000, swing: null } },
  inventory: { playerUuid: uuid, windowId: 0, hotbarStart: 36, offhandSlot: 45, selectedHotbarSlot: 0, slots: Array.from({ length: 46 }, (_, slot) => ({ slot, item: null })) } }
}

test('vanilla V factoring preserves pinned a22b3f3b matrices at rest and swing for both arms', () => {
  // Recorded by executing the untouched base implementation, not derived from the new factor.
  const expected = [
    [-.02299658487645552,-.04583092608871471,-.03573420347329355,0,-.020849815230394603,-.029365397175121436,.05108041360057468,0,-.05424658780862057,.03071562570741703,-.0044841998755050586,0,.34727309796988326,-1.1064510268256846,-.7398040689829322,1],
    [-.03957914419068723,-.0466148867605319,.012914862656473593,0,.040237565969320384,-.02246756632837291,.042218440854024375,0,-.02684547690016661,.03505011833907199,.04423866605606083,0,.24458311823711743,-1.2946038093400736,-.7546149741586179,1],
    [-.02299658487645552,.04583092608871471,.03573420347329355,0,.020849815230394603,-.029365397175121436,.05108041360057468,0,.05424658780862057,.03071562570741703,-.0044841998755050586,0,-.34727309796988326,-1.1064510268256846,-.7398040689829322,1],
    [-.03957914419068723,.0466148867605319,-.012914862656473593,0,-.040237565969320384,-.02246756632837291,.042218440854024375,0,.02684547690016661,.03505011833907199,.04423866605606083,0,-.24458311823711743,-1.2946038093400736,-.7546149741586179,1]
  ]
  let i = 0
  for (const arm of ['right', 'left']) for (const progress of [0, .35]) {
    assert.deepEqual(nativeFirstPersonEmptyArmMatrix(progress, arm).elements, expected[i])
    assert.deepEqual(nativeFirstPersonPlayerArmMatrix(progress, arm).multiply(new THREE.Matrix4().makeScale(1/16, -1/16, -1/16)).elements, expected[i++])
  }
})

test('original arm bytes, UVs and complete per-side geometry survive partition; no shared material disposal', { skip: !catalog }, async () => {
  const { reader, definition } = await originals(), before = JSON.stringify(definition)
  assert.equal(sha(await reader.bytes('ysm/neko_yui/models/arm.json')), '1ca1332dac123c6c72966660a694b770caea895ea41b95964c6866a27ab6c9e5')
  const choice = reader.get('bundled:yui-ysm')
  assert.equal(sha(await reader.bytes(choice.files.texture)), 'f8ed6510dec8647895fb633dde7cad0d3338fe7b39f78e2566d389e4ec33709f')
  const material = new THREE.MeshBasicMaterial(), reference = createNativeBedrockModel(definition, material), arms = createBundledYsmFirstPersonArms(definition, material)
  let materialDisposals = 0; material.addEventListener('dispose', () => materialDisposals++)
  const counts = new Map()
  for (const [arm, mount] of arms.mounts) {
    const side = arm === 'left' ? 'Left' : 'Right', nodes = []
    mount.traverse(node => { if (arms.model.bones.has(node.name)) nodes.push(node.name) })
    assert.deepEqual(nodes, [`${side}Arm`, `${side}ForeArm`, `${side}Hand`, `${side}HandLocator`])
    const actual = meshes(mount), original = meshes(reference.bones.get(`${side}Arm`)); assert.equal(actual.length, 48)
    for (let i = 0; i < actual.length; i++) {
      for (const attribute of ['position', 'uv', 'normal']) assert.deepEqual(actual[i].geometry.attributes[attribute].array, original[i].geometry.attributes[attribute].array)
      assert.deepEqual(actual[i].geometry.index.array, original[i].geometry.index.array)
      assert.equal(actual[i].material, material)
      const g = actual[i].geometry; counts.set(g, 0); g.addEventListener('dispose', () => counts.set(g, counts.get(g) + 1))
    }
  }
  assert.equal(JSON.stringify(definition), before); assert.equal(arms.model.cubeCount, 16)
  arms.dispose(); arms.dispose(); assert.ok([...counts.values()].every(count => count === 1)); assert.equal(materialDisposals, 0)
  reference.dispose(); material.dispose()
})

test('four noncoplanar authored corners, nested hand locator and rotated bow obey V Yarm Qup', { skip: !catalog }, async () => {
  const { definition } = await originals(), material = new THREE.MeshBasicMaterial(), arms = createBundledYsmFirstPersonArms(definition, material)
  for (const [arm, mount] of arms.mounts) for (const progress of [0, .35]) {
    mount.matrix.copy(bundledYsmFirstPersonArmMatrix(progress, arm))
    const side = arm === 'left' ? 'Left' : 'Right', source = definition['minecraft:geometry'][0].bones
    const cube = source.find(b => b.name === `${side}Arm`).cubes[0]
    // Independent authored source equation; deliberately no helper-frame translation here.
    const expected = p => new THREE.Vector3(-p[0]/16 + (arm === 'left' ? .25 : -.25), 1.8-p[1]/16, p[2]/16).applyMatrix4(nativeFirstPersonPlayerArmMatrix(progress, arm))
    const points = vertices(mount)
    for (const offset of [[0,0,0], [cube.size[0],0,0], [0,cube.size[1],0], [0,0,cube.size[2]]]) {
      const corner = expected(cube.origin.map((value, i) => value + offset[i]))
      assert.ok(points.some(p => p.distanceTo(corner) < 3e-7), `${arm} corner ${offset}`)
    }
    closeVector(arms.model.bones.get(`${side}HandLocator`).getWorldPosition(new THREE.Vector3()), expected(source.find(b => b.name === `${side}HandLocator`).pivot))
    const bow = source.find(b => b.name === `${side}ForeArm`).cubes.find(c => c.rotation), angle = -Math.fround(Math.fround(bow.rotation[2]) * Math.PI / 180)
    const [dx, dy] = bow.origin.map((value, i) => value - bow.pivot[i])
    const bowCorner = expected([bow.pivot[0] + dx*Math.cos(angle)-dy*Math.sin(angle), bow.pivot[1] + dx*Math.sin(angle)+dy*Math.cos(angle), bow.origin[2]])
    assert.ok(points.some(p => p.distanceTo(bowCorner) < 3e-7), 'authored rotated bow retains its own pivot inside forearm')
  }
  arms.dispose(); material.dispose()
})

test('missing, duplicate, foreign-parent, cross-side and rotated roots fail explicitly', { skip: !catalog }, async () => {
  const { definition } = await originals(), material = new THREE.MeshBasicMaterial()
  for (const mutate of [bones => bones.pop(), bones => { bones[0].name = 'LeftArm' }, bones => { bones[0].parent = 'Body' }, bones => { bones[1].parent = 'LeftArm' }, bones => { bones[0].rotation = [1,0,0] }]) {
    const bad = structuredClone(definition); mutate(bad['minecraft:geometry'][0].bones)
    assert.throws(() => createBundledYsmFirstPersonArms(bad, material), /BUNDLED_YSM_ARM_HIERARCHY_INVALID/)
  }
  material.dispose()
})

test('actual actor selects only observed empty main arm, moves with swing, isolates camera/world and invalidates identity', { skip: !catalog }, async () => {
  const { reader } = await originals(), actor = await actorFor(reader), camera = new THREE.PerspectiveCamera(70, 16/9, .05, 150)
  actor.setFirstPersonViewport(camera)
  for (const arm of ['left', 'right']) {
    camera.aspect = 16/9; camera.fov = 70; camera.updateProjectionMatrix()
    const input = frame(arm); actor.applyHeldItems(input)
    assert.equal(actor.firstPersonItemsState().hands[arm].visible, true)
    assert.equal(actor.firstPersonItemsState().hands[arm === 'left' ? 'right' : 'left'].visible, false)
    const mount = actor.firstPersonRoot.children.find(node => node.name.endsWith(arm)), before = mount.matrix.clone(), point = vertices(mount)[0]
    const projected = point.clone().project(camera)
    actor.applyPose({ x: 100, y: 70, z: -20, yaw: Math.PI, pitch: .7 }); actor.root.updateMatrixWorld(true)
    camera.aspect = 1; camera.fov = 90; camera.updateProjectionMatrix(); actor.setFirstPersonViewport(camera)
    assert.deepEqual(mount.matrix.elements, before.elements); closeVector(vertices(mount)[0], point)
    assert.notDeepEqual(point.clone().project(camera).toArray(), projected.toArray(), 'only camera projection changes with viewport')
    assert.equal(actor.firstPersonRoot.parent, null); assert.deepEqual(actor.firstPersonRoot.scale.toArray(), [1,1,1])
    actor.applyHandAnimation({ ...input.self.handAnimation, swing: { startedAt: 900, durationTicks: 6, hand: 'mainhand', sequence: 1 } }); actor.setFirstPersonViewport(camera)
    assert.notDeepEqual(mount.matrix.elements, before.elements)
    actor.applyHandAnimation({ ...input.self.handAnimation, playerUuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }); actor.setFirstPersonViewport(camera)
    assert.notDeepEqual(mount.matrix.elements, before.elements, 'foreign updates cannot overwrite accepted swing')
    input.self.entityId = 43; actor.applyHeldItems(input); assert.equal(actor.firstPersonItemsState().available, false)
    actor.applyHeldItems(frame(arm)); actor.applyHeldItems(null); assert.equal(actor.firstPersonItemsState().available, false, 'invalid snapshot clears visible geometry immediately')
    const use = frame(arm); use.self.usingItem = true; use.self.handAnimation.usingItem = true; actor.applyHeldItems(use)
    assert.equal(actor.firstPersonItemsState().reason, 'NATIVE_FIRST_PERSON_ACTIVE_USE_UNSUPPORTED')
  }
  assert.equal(actor.assetInfo.support.firstPersonNativeBasisVerified, false)
  assert.equal(actor.firstPersonItemsState().conditionalArmClipsApplied, false)
  let textureDisposed = 0, materialDisposed = 0
  const mesh = meshes(actor.firstPersonRoot)[0]; mesh.material.map.addEventListener('dispose', () => textureDisposed++); mesh.material.addEventListener('dispose', () => materialDisposed++)
  actor.dispose(); actor.dispose(); assert.equal(textureDisposed, 1); assert.equal(materialDisposed, 1)
  assert.equal(actor.firstPersonRoot.children.length, 0)
})

test('actual actor replacement and scene epoch clear retire first-person roots and geometry', { skip: !catalog }, async () => {
  const { reader } = await originals(), scene = new THREE.Scene()
  let ready
  const controller = new NativeSelfPlayerController({}, { bundledAppearanceReader: reader, bundledYsmFactory: () => actorFor(reader),
    minecraftFactory: async () => ({ assetInfo: {}, dispose () {} }), onChange: actor => { if (actor?.firstPersonRoot) { scene.add(actor.firstPersonRoot); ready?.() } } })
  const self = { uuid, entityId: 42, skin: { kind: 'default', assetPath: 'vanilla.png', sha256: 'original' } }
  await controller.update(self, uuid)
  const loaded = new Promise(resolve => { ready = resolve }); controller.selectAppearance('bundled:yui-ysm'); await loaded
  const first = controller.actor; assert.ok(first.firstPersonRoot); first.applyHeldItems(frame())
  let disposed = 0; meshes(first.firstPersonRoot)[0].geometry.addEventListener('dispose', () => disposed++)
  controller.clear('scene_epoch_changed'); assert.equal(first.firstPersonRoot.parent, null); assert.equal(disposed, 1); assert.equal(scene.children.length, 0)
  await controller.update({ ...self, entityId: 43 }, uuid); assert.notEqual(controller.actor, first); assert.ok(controller.actor.firstPersonRoot)
  assert.equal(controller.actor.firstPersonItemsState().available, false)
  controller.dispose(); assert.equal(scene.children.length, 0)
})
