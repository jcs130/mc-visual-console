import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'
import * as THREE from 'three'
import { PlayerObject } from 'skinview3d/libs/model.js'
import { NativeAssetReader } from '../../src/native-viewer/model-loader.js'
import { ARS_ITEM_SOURCE_HASHES, ARS_ITEM_ASSET_HASHES, ARS_BOOK_TEXTURE_HASHES } from '../../src/native-viewer/native-ars-item-icons.js'
import { nativeHumanoidWalkAngles, renderNativePlayerMotion } from '../../src/native-viewer/native-player-motion.js'
import { selectNativeHeldItems, nativeHeldItemTransform, nativeHeldArmMountMatrix, nativeGeneratedItemElements,
  prepareNativeHeldItem, buildNativeHeldItemObject, disposeNativeHeldItemObject, nativeHeldArmRotations,
  nativeFirstPersonIdleMountMatrix, nativeFirstPersonSilhouetteProjection, NativeHeldItems, HELD_ITEM_CLIENT_SHA256, ARS_OPEN_MODEL_SHA256 } from '../../src/native-viewer/native-held-items.js'

const uuid = 'e371227c-09fa-3722-84f4-f3228a552c3c'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const raw = (name = 'minecraft:wooden_pickaxe', components = '') => ({ name, count: 1,
  snbt: `{id:"${name}",count:1${components ? `,components:{${components}}` : ''}}` })
const settled = () => new Promise(resolve => setImmediate(resolve))
async function until(predicate) {
  const started = Date.now()
  while (!predicate()) { if (Date.now() - started > 2000) assert.fail('native fixture did not settle'); await settled() }
}
function frame(item = raw(), options = {}) {
  const slots = Array.from({ length: 46 }, (_, slot) => ({ slot, item: slot === 36 ? item : null }))
  return { playerUuid: uuid, self: { uuid, quickBarSlot: 0, mainArm: 'right', usingItem: false, swinging: false,
    attackAnim: 0, attackStrengthScale: 1, spinAttack: false, onGround: true, crouching: false, velocity: {x:0,y:0,z:0}, ...options },
    inventory: { playerUuid: uuid, windowId: 0, slots, selectedHotbarSlot: 0, hotbarStart: 36, offhandSlot: 45 } }
}

// Generated bounded image is a test fixture only, never a shipped texture.
function png(width = 16, height = 16) {
  const crc32 = bytes => {
    let crc = 0xffffffff
    for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)) }
    return (crc ^ 0xffffffff) >>> 0
  }
  const chunk = (name, payload) => {
    const body = Buffer.concat([Buffer.from(name), payload]), bytes = Buffer.alloc(payload.length + 12)
    bytes.writeUInt32BE(payload.length); body.copy(bytes, 4); bytes.writeUInt32BE(crc32(body), bytes.length - 4); return bytes
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.alloc(Math.min(width, 128) * (Math.min(height, 128) * 4 + 1)))), chunk('IEND', Buffer.alloc(0))])
}
function pixels(width = 16, height = 16) { const pixels = new Uint8Array(width * height * 4); pixels.fill(255); return { width, height, pixels } }
function staticReader() {
  const docs = {
    'assets/minecraft/models/item/wooden_pickaxe.json': { parent: 'minecraft:item/handheld', textures: { layer0: 'minecraft:item/wooden_pickaxe' } },
    'assets/minecraft/models/item/stick.json': { parent: 'minecraft:item/handheld', textures: { layer0: 'minecraft:item/stick' } },
    'assets/minecraft/models/item/handheld.json': { parent: 'minecraft:item/generated', display: {
      thirdperson_righthand: { rotation: [0, -90, 55], translation: [0, 4, .5], scale: [.85, .85, .85] },
      thirdperson_lefthand: { rotation: [0, 90, -55], translation: [0, 4, .5], scale: [.85, .85, .85] },
      firstperson_righthand: { rotation: [0,-90,25],translation:[1.13,3.2,1.13],scale:[.68,.68,.68] },
      firstperson_lefthand: { rotation: [0,90,-25],translation:[1.13,3.2,1.13],scale:[.68,.68,.68] },
      gui: { rotation: [12, 35, 7] } } },
    'assets/minecraft/models/item/generated.json': { parent: 'builtin/generated', gui_light: 'front' }
  }
  const bytes = Object.fromEntries(Object.entries(docs).map(([path, model]) => [path, Buffer.from(JSON.stringify(model))]))
  bytes['assets/minecraft/textures/item/wooden_pickaxe.png'] = png()
  bytes['assets/minecraft/textures/item/stick.png'] = png()
  const manifest = { minecraftVersion: '1.21.1', assetIntegrityVerified: true, clientJarSha256: HELD_ITEM_CLIENT_SHA256,
    assets: Object.fromEntries(Object.entries(bytes).map(([path, value]) => [path, { sha256: sha(value), bytes: value.length, source: 'minecraft-1.21.1-client.jar' }])) }
  return { reader: new NativeAssetReader(manifest, async path => bytes[path]), bytes, docs }
}
function extendStaticFixture(fixture, path, value, source = 'minecraft-1.21.1-client.jar') {
  const bytes = value instanceof Uint8Array ? value : Buffer.from(JSON.stringify(value))
  fixture.bytes[path] = bytes
  fixture.reader.manifest.assets[path] = { sha256: sha(bytes), bytes: bytes.length, source }
}

// A source-verifier test double, NOT authentic bytes: independent real-pack
// verification remains an offline validation. The two contexts intentionally
// have different bone rotations/mesh extents to catch a GUI/closed fallback.
function arsReader() {
  const r = new NativeAssetReader({ minecraftVersion: '1.21.1', assetIntegrityVerified: true, clientJarSha256: HELD_ITEM_CLIENT_SHA256,
    sources: Object.entries(ARS_ITEM_SOURCE_HASHES).map(([name, sha256]) => ({ name, sha256 })),
    assets: Object.fromEntries(Object.entries(ARS_ITEM_ASSET_HASHES).map(([path, sha256]) => [path, { sha256 }])) }, async () => new Uint8Array())
  const faces = Object.fromEntries(['north','east','south','west','up','down'].map(direction => [direction, { uv: [0, 0], uv_size: [2, 2] }]))
  const geo = open => ({ format_version: '1.12.0', 'minecraft:geometry': [{ description: { texture_width: 128, texture_height: 128 },
    bones: [1,2,3].flatMap(tier => [
      { name: `tier${tier}`, pivot: [0,0,0], cubes: [{ origin: [-3,0,4], size: [6,15,3], uv: faces }] },
      { name: `cover${tier}`, parent: `tier${tier}`, pivot: [0,1,4], rotation: [0,open ? 67.5 : 0,0],
        cubes: [{ origin: [-2,1,open ? -7 : -6], size: [2,13,9], uv: faces }] }
    ]) }] })
  const itemPath = leaf => `assets/ars_nouveau/models/item/${leaf}.json`
  for (const leaf of ['novice_spell_book','apprentice_spell_book','archmage_spell_book']) r.manifest.assets[itemPath(leaf)] = {
    sha256: '3a2c58c551cb5b7bd7bd4b8278f2ea3d5a2be71e5166676977bfbc5cc9335bd5' }
  for (const [color, sha256] of Object.entries(ARS_BOOK_TEXTURE_HASHES)) r.manifest.assets[`assets/ars_nouveau/textures/item/spellbook_${color}.png`] = { sha256 }
  r.manifest.assets['assets/ars_nouveau/textures/item/tattered_tome.png'] = { sha256: 'c04de9e156e65848f88f305a0d4171391f39a3f14002bae6ce6fd8db913a7f2f' }
  r.manifest.assets['assets/ars_nouveau/geo/spellbook_open.geo.json'] = { sha256: ARS_OPEN_MODEL_SHA256 }
  r.bytes = async path => path.endsWith('.png') ? png(128,128) : new Uint8Array([1])
  r.json = async path => path.includes('/geo/') ? geo(path.includes('_open.')) : { parent: 'builtin/entity', display: {
    gui: { rotation: [-159,-62,-135], translation: [-1.25,-4.75,0], scale: [.68,.68,.68] },
    thirdperson_righthand: { rotation: [0,160,0], translation: [0,-.5,5], scale: [.55,.55,.55] },
    thirdperson_lefthand: { rotation: [0,160,0], translation: [0,-.5,5], scale: [.55,.55,.55] },
    firstperson_righthand: { rotation:[-25,140,8],translation:[1.15,-2.5,1.15],scale:[.68,.68,.68] },
    firstperson_lefthand: { rotation:[-25,140,8],translation:[1.15,-2.5,1.15],scale:[.68,.68,.68] } } }
  return r
}

test('complete own native inventory binds selected main hand, offhand and handedness', () => {
  const f = frame(raw(), { mainArm: 'left' }); f.inventory.slots[45].item = raw('minecraft:stick')
  const selected = selectNativeHeldItems(f, uuid.toUpperCase())
  assert.equal(selected.hands.left.slot, 36); assert.equal(selected.hands.left.raw.name, 'minecraft:wooden_pickaxe')
  assert.equal(selected.hands.right.slot, 45); assert.equal(selected.hands.right.raw.name, 'minecraft:stick')
  f.inventory.slots[36].item = null
  assert.equal(selectNativeHeldItems(f, uuid).hands.left.raw, null)
})

test('known static generated registrations use native namespaces and reject unverified source or visuals', async () => {
  const fixture = staticReader()
  fixture.reader.manifest.sources = [{ name: 'minecraft-1.21.1-client.jar', sha256: HELD_ITEM_CLIENT_SHA256 }]
  extendStaticFixture(fixture, 'assets/minecraft/models/item/wheat_seeds.json', { parent: 'minecraft:item/generated', textures: { layer0: 'minecraft:item/wheat_seeds' } })
  extendStaticFixture(fixture, 'assets/minecraft/textures/item/wheat_seeds.png', png())
  const plan = await prepareNativeHeldItem(fixture.reader, raw('minecraft:wheat_seeds'), 'left', { readPixels: async () => pixels() })
  assert.equal(plan.stack.id, 'minecraft:wheat_seeds'); assert.equal(plan.kind, 'native-generated-held')
  assert.equal(plan.texturePath, 'assets/minecraft/textures/item/wheat_seeds.png'); assert.ok(plan.faces.length > 0)
  await assert.rejects(prepareNativeHeldItem(fixture.reader, raw('minecraft:wheat_seeds', '"minecraft:custom_model_data":1'), 'right'), /VISUAL_COMPONENT_UNSUPPORTED/)
  fixture.reader.manifest.sources[0].sha256 = 'wrong'
  await assert.rejects(prepareNativeHeldItem(fixture.reader, raw('minecraft:wheat_seeds'), 'right'), /SOURCE_UNVERIFIED/)
  await assert.rejects(prepareNativeHeldItem(fixture.reader, raw('unknown:seed'), 'right'), /PROVIDER_UNVERIFIED/)
})

test('Patchouli selects only its verified TLM book model, and empty maid slab remains its own held item', async () => {
  const fixture = staticReader(), maid = 'touhoulittlemaid-1.5.3-neoforge+mc1.21.1.jar'
  fixture.reader.manifest.sources = [
    { name: maid, sha256: 'f6db04195820c8508704277ea76d63723804ff236a7b780369ba59ebe5cd9c27' },
    { name: 'Patchouli-1.21.1-93-NEOFORGE.jar', sha256: '959af52ed6640c316c3a8469203420be4aeea11ad6603890ba83bf48f5d9f993' }
  ]
  for (const leaf of ['smart_slab_empty', 'memorizable_gensokyo']) {
    extendStaticFixture(fixture, `assets/touhou_little_maid/models/item/${leaf}.json`, {
      parent: 'minecraft:item/generated', textures: { layer0: `touhou_little_maid:item/${leaf}` },
      display: { thirdperson_righthand: { rotation: [0, 90, 0] }, firstperson_righthand: { rotation: [0, -90, 0] } }
    }, maid)
    extendStaticFixture(fixture, `assets/touhou_little_maid/textures/item/${leaf}.png`, png(), maid)
  }
  const book = await prepareNativeHeldItem(fixture.reader, raw('patchouli:guide_book', '"patchouli:book":"touhou_little_maid:memorizable_gensokyo"'), 'right', { readPixels: async () => pixels() })
  assert.equal(book.stack.id, 'patchouli:guide_book')
  assert.equal(book.texturePath, 'assets/touhou_little_maid/textures/item/memorizable_gensokyo.png')
  assert.deepEqual(book.transform.rotation, [0, 90, 0]); assert.deepEqual(book.firstPersonTransform.rotation, [0, -90, 0])
  const slab = await prepareNativeHeldItem(fixture.reader, raw('touhou_little_maid:smart_slab_empty'), 'right', { readPixels: async () => pixels() })
  assert.equal(slab.stack.id, 'touhou_little_maid:smart_slab_empty')
  await assert.rejects(prepareNativeHeldItem(fixture.reader, raw('patchouli:guide_book', '"patchouli:book":"unknown:book"'), 'right'), /BOOK_UNSUPPORTED/)
  await assert.rejects(prepareNativeHeldItem(fixture.reader, raw('touhou_little_maid:smart_slab_empty', '"minecraft:custom_name":"changed"'), 'right'), /COMPONENTS_UNSUPPORTED/)
})

test('foreign, incomplete, duplicate, translated-menu and unknown handedness snapshots cannot supply empty/default hands', () => {
  const check = (change, reason) => { const f = frame(); change(f); assert.throws(() => selectNativeHeldItems(f, uuid), reason) }
  check(f => f.inventory.playerUuid = '00000000-0000-0000-0000-000000000000', /BINDING_MISMATCH/)
  check(f => f.self.uuid = '00000000-0000-0000-0000-000000000000', /BINDING_MISMATCH/)
  check(f => f.inventory.windowId = 2, /INVENTORY_UNAVAILABLE/)
  check(f => f.inventory.slots.pop(), /INVENTORY_UNAVAILABLE/)
  check(f => f.inventory.slots[45].slot = 36, /INVENTORY_INVALID/)
  check(f => delete f.inventory.slots[45].item, /INVENTORY_INVALID/)
  check(f => f.self.mainArm = null, /MAIN_ARM_UNKNOWN/)
  check(f => f.self.quickBarSlot = 1, /SELECTED_SLOT_UNKNOWN/)
})

test('original ItemTransform keeps float clamp semantics and left-hand mirror, separate from GUI', () => {
  const display = { rotation: [17,160,8], translation: [1.15,-.5,5], scale: [.55,.55,.55] }
  const right = nativeHeldItemTransform(display, 'right'), left = nativeHeldItemTransform(display, 'left')
  assert.deepEqual(right.translation, [Math.fround(Math.fround(1.15)/16),-.5/16,5/16])
  assert.deepEqual(left.translation, [-right.translation[0],right.translation[1],right.translation[2]])
  assert.deepEqual(left.rotation, [17,-160,-8]); assert.equal(right.context, 'thirdperson_righthand')
  assert.deepEqual(nativeHeldItemTransform({ translation:[1000,-1000,0],scale:[10,1,1] }).translation,[5,-5,0])
  assert.equal(nativeHeldItemTransform({ scale:[10,1,1] }).scale[0],4)
  assert.throws(() => nativeHeldItemTransform({ scale:[-1,1,1] }),/REFLECTED/)
})

test('locked ItemInHandLayer transforms in native order and slim offset precedes rotating ModelPart', () => {
  const transform = nativeHeldItemTransform(), armRotation = new THREE.Euler(.37,-.2,.13,'ZYX')
  for(const arm of ['left','right']) {
    const wide = nativeHeldArmMountMatrix({ arm,rotation:armRotation,transform })
    const slim = nativeHeldArmMountMatrix({ arm,slim:true,rotation:armRotation,transform })
    const rotation = new THREE.Matrix4().makeRotationFromEuler(armRotation)
    const a = new THREE.Vector3().applyMatrix4(rotation.clone().multiply(wide))
    const b = new THREE.Vector3().applyMatrix4(rotation.clone().multiply(slim))
    assert.ok(Math.abs(b.x-a.x-(arm==='right'?.5:-.5))<1e-12)
    assert.ok(Math.abs(b.y-a.y)<1e-12);assert.ok(Math.abs(b.z-a.z)<1e-12)
    assert.ok(Math.abs(wide.determinant()-4096)<1e-8)
  }
  const m = nativeHeldArmMountMatrix({ arm:'right',transform })
  const p = new THREE.Vector3().applyMatrix4(m)
  assert.ok(Math.abs(p.x+1)<1e-12);assert.ok(Math.abs(p.y+10)<1e-12);assert.ok(Math.abs(p.z-2)<1e-12)
})

test('generated mesh has original slab thickness, reversed north UV and four original span directions', () => {
  const elements = nativeGeneratedItemElements(pixels(2,2))
  assert.equal(elements.length,5)
  assert.deepEqual(elements[0].from,[0,0,7.5]);assert.deepEqual(elements[0].to,[16,16,8.5])
  assert.deepEqual(elements[0].faces.north.uv,[16,0,0,16])
  assert.deepEqual(elements.slice(1).map(e=>Object.keys(e.faces)[0]),['up','east','west','down'])
  const east = elements.find(e=>e.faces.east)
  assert.deepEqual(east.from,[0,16,7.5]);assert.deepEqual(east.to,[0,0,8.5])
  assert.deepEqual(east.faces.east.uv,[0,16,8,0])
})

test('first-person static endpoint uses camera-space ItemInHandRenderer then native FIRSTPERSON display, without arm scale or third-person rotations', () => {
  for(const arm of ['right','left']){
    const transform=nativeHeldItemTransform({},arm,'firstperson')
    const matrix=nativeFirstPersonIdleMountMatrix({arm,transform})
    assert.deepEqual(new THREE.Vector3().applyMatrix4(matrix).toArray(),[Math.fround(arm==='right'?.56:-.56),Math.fround(-.52),Math.fround(-.72)])
    assert.equal(matrix.determinant(),1)
    assert.throws(()=>nativeFirstPersonIdleMountMatrix({arm,transform:nativeHeldItemTransform({},arm)}),/FIRST_PERSON_TRANSFORM_INVALID/)
  }
})

test('native alpha-zero test and same-anchor span expansion preserve gapped edge pixels', () => {
  const data = pixels(3,1); data.pixels[7]=0;data.pixels[11]=1
  const elements = nativeGeneratedItemElements(data), top=elements.find(e=>e.faces.up)
  assert.deepEqual(top.faces.up.uv,[0,0,16,16]) // native merge crosses the empty middle pixel
  assert.equal(elements.filter(e=>e.faces.up).length,1)
  assert.throws(()=>nativeGeneratedItemElements({width:513,height:1,pixels:new Uint8Array(2052)}),/SPRITE_INVALID/)
  assert.throws(()=>nativeGeneratedItemElements({width:2,height:2,pixels:new Uint8Array(3)}),/SPRITE_INVALID/)
})

test('damaged ordinary tool uses its real generated PNG geometry and third-person inherited display', async () => {
  const { reader } = staticReader(), item = raw(undefined,'"minecraft:damage":1')
  const plan = await prepareNativeHeldItem(reader,item,'right',{ readPixels:async()=>pixels() })
  assert.equal(plan.stack.components['minecraft:damage'],1);assert.equal(plan.faces.length,6)
  assert.equal(plan.texturePath,'assets/minecraft/textures/item/wooden_pickaxe.png')
  assert.deepEqual(plan.transform.rotation,[0,-90,55]);assert.equal(plan.transform.scale[0],Math.fround(.85))
  assert.equal(plan.geometrySourceVerified,true);assert.equal(plan.pixelParityVerified,false)
  assert.equal(plan.atlasUvShrinkAvailable,false);assert.equal(plan.worldLightingParityVerified,false)
  assert.equal(plan.sourcePaths.length,4)
})

test('source hashes, animated PNG, wrong components and custom/dynamic models reject instead of approximating', async () => {
  for (const component of ['"minecraft:custom_model_data":7','"minecraft:enchantments":{levels:{"minecraft:sharpness":1}}','"foreign:state":{}']) {
    await assert.rejects(prepareNativeHeldItem(staticReader().reader,raw(undefined,component),'right',{readPixels:async()=>pixels()}),/COMPONENT_UNSUPPORTED/)
  }
  const {reader,bytes}=staticReader();bytes['assets/minecraft/textures/item/wooden_pickaxe.png']=png(8,8)
  await assert.rejects(prepareNativeHeldItem(reader,raw(),'right',{readPixels:async()=>pixels()}),/HASH_MISMATCH/)
  const animated=staticReader().reader;animated.manifest.assets['assets/minecraft/textures/item/wooden_pickaxe.png.mcmeta']={}
  await assert.rejects(prepareNativeHeldItem(animated,raw(),'right'),/ANIMATION_UNSUPPORTED/)
  const wrong=staticReader().reader;wrong.manifest.clientJarSha256='foreign'
  await assert.rejects(prepareNativeHeldItem(wrong,raw(),'right'),/CLIENT_UNVERIFIED/)
})

test('all actual Ars classes choose OPEN for three spellbooks, CLOSED for worn notebook, with real third-person tier/color', async () => {
  for(const [leaf,tier] of [['worn_notebook',1],['novice_spell_book',1],['apprentice_spell_book',2],['archmage_spell_book',3]]) {
    const plan=await prepareNativeHeldItem(arsReader(),raw(`ars_nouveau:${leaf}`,'"minecraft:base_color":"red","ars_nouveau:spell_caster":{current_slot:0}'),'right')
    assert.equal(plan.geometry,`ars_nouveau:spellbook_${leaf==='worn_notebook'?'closed':'open'}`)
    assert.equal(plan.tier,tier);assert.equal(plan.animationControllerCount,0)
    assert.deepEqual(plan.transform.rotation,[0,160,0]);assert.equal(plan.transform.translation[1],-.5/16)
    assert.equal(plan.stack.components['ars_nouveau:spell_caster'].current_slot,0)
    assert.equal(plan.texturePath,`assets/ars_nouveau/textures/item/${leaf==='worn_notebook'?'tattered_tome':'spellbook_red'}.png`)
    assert.equal(plan.geoOffsetY,Math.fround(.51)-.5)
    const cover=plan.faces.find(face=>face.bone===`cover${tier}`&&face.direction==='north')
    if(leaf!=='worn_notebook')assert.ok(Math.abs(cover.normal[0])>.9)
  }
  const wrong=arsReader();wrong.manifest.assets['assets/ars_nouveau/geo/spellbook_open.geo.json'].sha256='old'
  await assert.rejects(prepareNativeHeldItem(wrong,raw('ars_nouveau:novice_spell_book'),'left'),/OPEN_MODEL_UNVERIFIED/)
})

test('held mesh uses original faces and material without GUI transforms or copied image planes', async () => {
  const plan=await prepareNativeHeldItem(arsReader(),raw('ars_nouveau:worn_notebook'),'right')
  const texture=new THREE.Texture({width:128,height:128}), object=buildNativeHeldItemObject(plan,texture)
  assert.equal(object.children.length,12);assert.deepEqual(object.rotation.toArray().slice(0,3),[0,0,0])
  assert.deepEqual(object.scale.toArray(),[1,1,1]);assert.equal(object.position.y,Math.fround(.51)-.5)
  assert.equal(object.children[0].material.transparent,true);assert.equal(object.children[0].material.side,THREE.DoubleSide)
  assert.equal(object.userData.worldLightingParityVerified,false)
  let freed=0;object.children[0].material.addEventListener('dispose',()=>freed++)
  disposeNativeHeldItemObject(object);assert.equal(freed,1);texture.dispose()
})

test('original ITEM arm pose precedes native bob and retains float round order', () => {
  const motion={schemaVersion:1,source:'same_player_physics_tick',tickMs:50,epoch:1,tick:5,sampledAt:1000,
    available:true,walk:{speedOld:.4,speed:.6,position:1.8},ageInTicks:null}
  const value=renderNativePlayerMotion(motion,1025), base=nativeHumanoidWalkAngles({position:value.position,speed:value.speed,ageInTicks:null})
  const held=nativeHeldArmRotations(value,motion,['right'])
  assert.equal(held.rightArm.x,Math.fround(Math.fround(base.limbs.rightArm.x*.5)-Math.fround(.31415927)))
  assert.deepEqual(held.leftArm,base.skinview.leftArm)
  const bobMotion={...motion,ageInTicks:10},bobValue=renderNativePlayerMotion(bobMotion,1025),bob=nativeHeldArmRotations(bobValue,bobMotion,['right'])
  assert.equal(bob.rightArm.z,bobValue.skinview.rightArm.z)
  assert.notEqual(bob.rightArm.x,held.rightArm.x)
})

test('binding/cache validation rejects a same-SNBT structured component conflict and clears stale held geometry', async () => {
  const held=new NativeHeldItems(staticReader().reader,{uuid,playerObject:new PlayerObject(),readPixels:async()=>pixels(),loadHeldTexture:async()=>new THREE.Texture({width:16,height:16})})
  held.apply(frame());await until(()=>held.state().hands.right.status!=='loading')
  assert.equal(held.state().hands.right.status,'ready')
  const conflict=frame({...raw(),components:{different:'not authoritative'}})
  held.apply(conflict)
  assert.equal(held.state().hands.right.status,'unsupported');assert.match(held.state().hands.right.reason,/SOURCE_CONFLICT/)
  assert.equal(held.player.skin.rightArm.children.filter(child=>child.name==='native-held-right').length,0)
  held.dispose()
})

test('empty/rebound/disposed state retires geometry and late decode once, with no old stack resurfacing', async () => {
  let finish,freed=0
  const texture=new THREE.Texture({width:16,height:16});texture.addEventListener('dispose',()=>freed++)
  const held=new NativeHeldItems(staticReader().reader,{uuid,playerObject:new PlayerObject(),readPixels:async()=>pixels(),
    loadHeldTexture:()=>new Promise(resolve=>{finish=resolve})})
  held.apply(frame());await until(()=>typeof finish==='function')
  held.apply(frame(null));finish(texture);await settled()
  assert.equal(freed,1);assert.equal(held.state().hands.right.status,'empty')
  assert.equal(held.player.skin.rightArm.children.filter(child=>child.name==='native-held-right').length,0)
  held.dispose();held.dispose();assert.equal(freed,1)
})

test('active/unknown use is an explicit pose gap, never invented casting animation or silently stale arm', async () => {
  const held=new NativeHeldItems(staticReader().reader,{uuid,playerObject:new PlayerObject(),readPixels:async()=>pixels(),loadHeldTexture:async()=>new THREE.Texture({width:16,height:16})})
  held.apply(frame());await until(()=>held.state().hands.right.status!=='loading');assert.equal(held.hands.get('right').mount.visible,true)
  held.apply(frame(raw(),{usingItem:null}));assert.equal(held.hands.get('right').mount.visible,false)
  assert.equal(held.state().hands.right.armPoseAvailable,false);assert.equal(held.state().hands.right.reason,'NATIVE_HELD_USE_STATE_UNKNOWN')
  held.apply(frame(raw(),{usingItem:true}));assert.equal(held.state().hands.right.reason,'NATIVE_HELD_ACTIVE_USE_POSE_UNSUPPORTED')
  held.apply(frame(raw(),{usingItem:false}));assert.equal(held.hands.get('right').mount.visible,true)
  held.dispose()
})

test('camera-space root is independent of hidden body and preserves original first-person transform and identity', async () => {
  const player=new PlayerObject(),body=new THREE.Group();body.add(player);body.visible=false
  const held=new NativeHeldItems(staticReader().reader,{uuid,playerObject:player,readPixels:async()=>pixels(),loadHeldTexture:async()=>new THREE.Texture({width:16,height:16})})
  held.setFirstPersonViewport({ fov: 70, aspect: 16 / 9, near: .05, far: 150 })
  held.apply(frame());await until(()=>held.state().hands.right.status!=='loading')
  assert.equal(held.firstPersonRoot.parent,null);assert.equal(held.firstPersonRoot.visible,false)
  assert.equal(held.firstPersonRoot.userData.playerUuid,uuid)
  assert.equal(held.firstPersonState().available,true);assert.equal(held.firstPersonState().equipmentTransitionAvailable,false)
  const entry=held.hands.get('right');assert.equal(entry.firstMount.visible,true)
  assert.notStrictEqual(entry.firstObject,entry.object);assert.notStrictEqual(entry.firstObject.children[0].geometry,entry.object.children[0].geometry)
  assert.deepEqual(entry.plan.firstPersonTransform.rotation,[0,-90,25]);assert.equal(entry.plan.firstPersonTransform.context,'firstperson_righthand')
  assert.equal(entry.firstObject.children.length,entry.object.children.length)
  const cameraScene=new THREE.Scene();cameraScene.add(held.firstPersonRoot)
  held.dispose();assert.equal(cameraScene.children.length,0)
})

test('first-person uncertain swing/cooldown/movement inputs stay explicit and suppress endpoint-only projection', async () => {
  const held=new NativeHeldItems(staticReader().reader,{uuid,playerObject:new PlayerObject(),readPixels:async()=>pixels(),loadHeldTexture:async()=>new THREE.Texture({width:16,height:16})})
  held.apply(frame());await until(()=>held.state().hands.right.status!=='loading')
  for(const [options,reason] of [
    [{swinging:null},'NATIVE_FIRST_PERSON_SWING_STATE_UNKNOWN'],[{swinging:true,attackAnim:.3},'NATIVE_FIRST_PERSON_SWING_UNSUPPORTED'],
    [{attackStrengthScale:null},'NATIVE_FIRST_PERSON_ATTACK_COOLDOWN_UNKNOWN'],[{attackStrengthScale:.6},'NATIVE_FIRST_PERSON_ATTACK_COOLDOWN_UNSUPPORTED'],
    [{spinAttack:null},'NATIVE_FIRST_PERSON_SPIN_STATE_UNKNOWN'],[{spinAttack:true},'NATIVE_FIRST_PERSON_SPIN_ATTACK_UNSUPPORTED'],
    [{velocity:{x:.1,y:0,z:0}},'NATIVE_FIRST_PERSON_STATIONARY_POSE_UNAVAILABLE'],[{usingItem:true},'NATIVE_FIRST_PERSON_ACTIVE_USE_UNSUPPORTED']]){
    held.apply(frame(raw(),options));assert.equal(held.firstPersonState().available,false);assert.equal(held.firstPersonState().reason,reason)
    assert.equal(held.hands.get('right').firstMount.visible,false)
  }
  held.dispose()
})
test('third-person unported attack and spin pose never appears as an invented ordinary ITEM animation', async () => {
  const held = new NativeHeldItems(staticReader().reader, { uuid, playerObject: new PlayerObject(),
    readPixels: async () => pixels(), loadHeldTexture: async () => new THREE.Texture({ width: 16, height: 16 }) })
  held.apply(frame()); await until(() => held.state().hands.right.status === 'ready')
  for (const [fields, reason] of [[{ swinging: true, attackAnim: .5 }, 'NATIVE_HELD_SWING_POSE_UNSUPPORTED'],
    [{ swinging: null }, 'NATIVE_HELD_SWING_STATE_UNKNOWN'], [{ spinAttack: true }, 'NATIVE_HELD_SPIN_ATTACK_UNSUPPORTED']]) {
    held.apply(frame(raw(), fields)); assert.equal(held.state().hands.right.visible, false)
    assert.equal(held.state().hands.right.reason, reason); assert.equal(held.state().hands.right.armPoseAvailable, false)
  }
  held.dispose()
})

test('first-person requires a visible alpha silhouette, not merely a ready slab or valid idle pose', async () => {
  // Deliberately bounded diagonal alpha fixture; not an original texture.
  const diagonal = pixels(); diagonal.pixels.fill(0)
  for (let y = 1; y < 15; y++) for (const x of [14 - y, 15 - y]) diagonal.pixels[(y * 16 + x) * 4 + 3] = 255
  const plan = await prepareNativeHeldItem(staticReader().reader, raw('minecraft:stick'), 'right', { readPixels: async () => diagonal })
  const wide = nativeFirstPersonSilhouetteProjection(plan, { fov: 70, aspect: 16 / 9, near: .05, far: 150 })
  const narrow = nativeFirstPersonSilhouetteProjection(plan, { fov: 70, aspect: 1, near: .05, far: 150 })
  assert.equal(wide.available, true); assert.ok(wide.projectedAreaNdc > 0)
  assert.equal(wide.alphaSilhouetteVerified, true)
  assert.equal(narrow.available, false); assert.equal(narrow.reason, 'NATIVE_FIRST_PERSON_VIEWPORT_CLIPPED')
  const held = new NativeHeldItems(staticReader().reader, { uuid, playerObject: new PlayerObject(),
    readPixels: async () => diagonal, loadHeldTexture: async () => new THREE.Texture({ width: 16, height: 16 }) })
  held.apply(frame(raw('minecraft:stick'))); await until(() => held.state().hands.right.status === 'ready')
  assert.equal(held.state().available, true); assert.equal(held.firstPersonState().available, false)
  assert.equal(held.firstPersonState().reason, 'NATIVE_FIRST_PERSON_VIEWPORT_UNKNOWN')
  held.setFirstPersonViewport({ fov: 70, aspect: 1, near: .05, far: 150 })
  assert.equal(held.firstPersonState().available, false); assert.equal(held.firstPersonState().hands.right.visible, false)
  held.setFirstPersonViewport({ fov: 70, aspect: 16 / 9, near: .05, far: 150 })
  assert.equal(held.firstPersonState().available, true); assert.equal(held.firstPersonState().hands.right.visible, true)
  held.dispose()
})

test('empty, unsupported and loading hands cannot claim held rendering available', async () => {
  const held = new NativeHeldItems(staticReader().reader, { uuid, playerObject: new PlayerObject(),
    readPixels: async () => pixels(), loadHeldTexture: async () => new THREE.Texture({ width: 16, height: 16 }) })
  held.apply(frame(null)); assert.equal(held.state().available, false)
  assert.equal(held.state().reason, 'NATIVE_HELD_HANDS_EMPTY'); assert.equal(held.firstPersonState().available, false)
  held.apply(frame(raw('unknown:notebook'))); await until(() => held.state().hands.right.status !== 'loading')
  assert.equal(held.state().available, false); assert.equal(held.state().hands.right.status, 'unsupported')
  assert.match(held.state().reason, /PROVIDER_UNVERIFIED/); assert.equal(held.firstPersonState().available, false)
  held.apply(frame()); assert.equal(held.state().available, false); assert.equal(held.state().reason, 'NATIVE_HELD_ITEMS_LOADING')
  held.dispose()
})
