import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bootNativeConsole, consoleViewMode } from '../../src/native-viewer/native-console.js'
import { createNativeInterface } from '../../src/native-viewer/native-ui-adapter.js'
import { Element, shell } from './fixtures/native-console-dom.mjs'
import { renderViewerPage } from '../../src/viewer-page.mjs'
import { NativeSelfPlayerController } from '../../src/native-viewer/native-self-player.js'
import {readFile} from 'node:fs/promises'
import {NativeAssetReader} from '../../src/native-viewer/model-loader.js'
import {ORIGINAL_ITEM_COLORS_PATH} from '../../src/native-viewer/native-potion-items.js'

const UUID = 'e371227c-09fa-3722-84f4-f3228a552c3c'
function fullShell () {
  const document = shell(), window = new Element('window', document)
  window.devicePixelRatio = 2; window.location = { pathname: '/third/' }
  window.MutationObserver = class { observe () {} disconnect () {} }
  window.history = { replaceState (_state, _name, path) { window.path = path } }
  const nav = document.createElement('nav'); nav.className = 'corti-view-switch'; document.body.append(nav)
  for (const mode of ['first','third','3dview']) {
    const link = document.createElement('a'); link.setAttribute('data-view', mode)
    link.setAttribute('href', mode === 'first' ? '/' : `/${mode}/`); nav.append(link)
  }
  const boot = document.createElement('div'); boot.className = 'boot'; document.body.append(boot)
  const crosshair = document.createElement('div'); crosshair.className = 'corti-crosshair'; document.body.append(crosshair)
  return { document, window }
}
const presentation = () => ({ schemaVersion: 1, playerUuid: UUID, available: true, source: 'same_player_connection',
  self: { uuid: UUID, health: 18, maxHealth: 20, food: 19, armor: null, oxygen: null },
  inventory: { windowId: 0, inventoryStart: 9, hotbarStart: 36, offhandSlot: 45, selectedHotbarSlot: 0,
    slots: Array.from({ length: 46 }, (_, slot) => ({ slot, item: null })) },
  nativeMenu: { windowId: 0, stateId: 1, menuType: 'minecraft:inventory', slots: [] }, skills: null, gameMessages: [] })

test('actual console links and menu handlers share bounded viewport diagnostics and clean visibility listeners', async () => {
  const {document,window}=fullShell();let mode='third',hooks
  const console=await bootNativeConsole({document,window,startStatus:()=>()=>{},mount:async options=>{
    hooks=options;options.onIdentity({confirmed:true,playerUuid:UUID,entityId:7,epoch:1})
    options.onState({type:'snapshot',epoch:1,presentation:presentation()})
    return {setView(value){mode=value;options.onMode(value)},timingContext:()=>({view:mode,snapshotRevision:7,terrainRequested:3,terrainCommitted:3,terrainCommittedAt:42}),
      dispose(){},renderer:{setPixelRatio(){}}}
  }})
  const viewport=document.getElementById('viewer-canvas')
  document.querySelectorAll('[data-view]').find(link=>link.dataset.view==='first').dispatch('click',{preventDefault(){}})
  document.getElementById('corti-inventory-toggle').dispatch('click')
  document.querySelector('[data-menu-close]').dispatch('click')
  document.querySelectorAll('[data-view]').find(link=>link.dataset.view==='3dview').dispatch('click',{preventDefault(){}})
  const value=JSON.parse(viewport.dataset.transitionTiming)
  const modes=value.transitions.filter(row=>row.kind==='mode'&&row.reason==='click')
  assert.deepEqual(modes.map(row=>[row.currentView,row.targetView]),[['third','first'],['first','3dview']])
  assert.equal(modes.at(-1).after.snapshotRevision,7)
  assert.ok(value.transitions.some(row=>row.kind==='menu'&&row.reason==='click'&&row.menuRebuilds===1))
  assert.ok(hooks.transitionTiming,'same collector reaches owning world loop')
  document.hidden=true;document.dispatch('visibilitychange')
  assert.equal(JSON.parse(viewport.dataset.transitionTiming).visibility.epoch,1)
  console.dispose();assert.equal(document.listeners.get('visibilitychange').length,0)
})

test('real console refreshes registry-waiting and delayed inspector icons from one initial state without another onState',async()=>{
  const {document,window}=fullShell(),directory=new URL('../../../asset-packs/vanilla-1.21.1/',import.meta.url)
  const manifest=JSON.parse(await readFile(new URL('native-assets.json',directory),'utf8'))
  const source=new NativeAssetReader(manifest,path=>readFile(new URL(path,directory))),read=source.bytes.bind(source)
  let releaseRegistry,releaseImages,registryEntered=false,imageEntered=false,states=0,attaches=0,releases=0,preview,hooks
  const registryGate=new Promise(resolve=>{releaseRegistry=resolve}),imageGate=new Promise(resolve=>{releaseImages=resolve})
  source.bytes=async path=>{
    if(path===ORIGINAL_ITEM_COLORS_PATH){registryEntered=true;await registryGate}
    if(/textures\/item\/(stick|wheat_seeds)\.png$/.test(path)){imageEntered=true;await imageGate}
    return read(path)
  }
  const p=presentation(),sample={name:'minecraft:wheat_seeds',count:2,snbt:'{id:"minecraft:wheat_seeds",count:2}'}
  p.inventory.slots[36].item=sample
  const registry=JSON.parse(await readFile(new URL(ORIGINAL_ITEM_COLORS_PATH,directory),'utf8'))
  const name='minecraft:stick',reference={name,count:4,reference:{schemaVersion:1,source:'vanilla_recipe_catalog',minecraftVersion:'1.21.1',appearance:'original_default',id:name,registryId:registry.items.find(row=>row.name===name).id}}
  p.activity={schemaVersion:1,playerUuid:UUID,entityId:7,revision:1,sampledAt:1000,events:[],items:[{item:sample,delta:2,at:1000}],recipes:[{output:reference,missing:[],materials:[],craftable:true}],server:{},entities:[]}
  const running=bootNativeConsole({document,window,startStatus:()=>()=>{},createInterface:options=>createNativeInterface({...options,previewFactory:()=>{
    preview={attach(host){this.host=host;attaches++},setVisible(value){if(!value)releases++},reset(){},dispose(){}};return preview
  }}),mount:async options=>{
    hooks=options
    options.onIdentity({confirmed:true,playerUuid:UUID,entityId:7,epoch:1});states++;options.onState({type:'snapshot',epoch:1,presentation:p})
    document.getElementById('corti-inventory-toggle').dispatch('click')
    return {assetReader:source,setView(){},dispose(){},renderer:{setPixelRatio(){}}}
  }})
  const wait=async check=>{for(let n=0;n<400&&!check();n++)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(check())}
  await wait(()=>registryEntered)
  const inspector=document.querySelector('.native-live-inspector'),slots=inspector.querySelectorAll('.corti-menu-slot')
  const referenceSlot=slots.find(slot=>slot.dataset.itemContext==='catalogue-default-reference')
  assert.equal(referenceSlot.dataset.modelState,'loading');assert.equal(referenceSlot.querySelector('img'),null)
  hooks.onIdentity({confirmed:true,playerUuid:UUID,entityId:7,epoch:1})
  releaseRegistry();const console=await running
  const body=document.querySelector('[data-menu-body]'),replace=body.replaceChildren.bind(body),host=preview.host
  let rebuilds=0;attaches=0;releases=0;body.replaceChildren=(...args)=>{rebuilds++;replace(...args)}
  releaseImages();await wait(()=>slots.every(slot=>slot.dataset.modelState==='verified'))
  assert.equal(states,1);assert.ok(imageEntered);assert.equal(inspector.querySelectorAll('.corti-menu-slot')[0],slots[0])
  assert.deepEqual({rebuilds,attaches,releases},{rebuilds:0,attaches:0,releases:0});assert.equal(preview.host,host)
  assert.match(referenceSlot.title,/默认外观参考.*尚未执行合成/)
  console.dispose();assert.equal(document.querySelector('.native-live-inspector'),null)
})

test('console readiness after identity epoch replacement, unavailability or disposal cannot revive the previous inspector state',async()=>{
  const directory=new URL('../../../asset-packs/vanilla-1.21.1/',import.meta.url)
  const manifest=JSON.parse(await readFile(new URL('native-assets.json',directory),'utf8'))
  for(const transition of ['epoch','unavailable','dispose']){
    const {document,window}=fullShell(),source=new NativeAssetReader(manifest,path=>readFile(new URL(path,directory))),read=source.bytes.bind(source)
    let release,entered=false,hooks,states=0
    const gate=new Promise(resolve=>{release=resolve})
    source.bytes=async path=>{if(path===ORIGINAL_ITEM_COLORS_PATH){entered=true;await gate}return read(path)}
    const p=presentation(),item={name:'minecraft:wheat_seeds',count:2,snbt:'{id:"minecraft:wheat_seeds",count:2}'}
    p.activity={schemaVersion:1,playerUuid:UUID,entityId:7,revision:1,sampledAt:1000,items:[{item,delta:2,at:1000}],recipes:[],server:{}}
    const running=bootNativeConsole({document,window,startStatus:()=>()=>{},mount:async options=>{
      hooks=options;options.onIdentity({confirmed:true,playerUuid:UUID,entityId:7,epoch:1})
      states++;options.onState({type:'snapshot',epoch:1,presentation:p})
      return {assetReader:source,setView(){},dispose(){},renderer:{setPixelRatio(){}}}
    }})
    for(let n=0;n<400&&!entered;n++)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(entered)
    const row=document.querySelector('.native-inspector-item');assert.ok(row)
    if(transition==='epoch')hooks.onIdentity({confirmed:true,playerUuid:UUID,entityId:7,epoch:2})
    else if(transition==='unavailable')hooks.onUnavailable('closed action connection')
    else window.dispatch('pagehide')
    release();const console=await running
    await new Promise(resolve=>setTimeout(resolve,20))
    assert.equal(states,1);assert.equal(row.isConnected,false)
    assert.equal(document.querySelector('.native-inspector-item'),null,transition)
    console.dispose();assert.equal(document.querySelector('.native-live-inspector'),null)
  }
})

test('generated native page carries only validated local appearance into the real console boot', async () => {
  for (const defaultAppearance of ['server', 'bundled:yui-ysm', 'native:misc/3_default_boy:red']) {
    for (const basePath of ['/', '/neko/']) {
      const html = renderViewerPage('3dview', { basePath, defaultAppearance })
      const { document, window } = fullShell()
      document.body.dataset.nativeDefaultAppearance = html.match(/data-native-default-appearance="([^"]+)"/)[1]
      let mounted
      const console = await bootNativeConsole({ document, window, startStatus: () => () => {}, mount: async options => {
        mounted = options
        return { renderer: { setPixelRatio () {} }, setView () {}, dispose () {} }
      } })
      assert.equal(mounted.defaultAppearance, defaultAppearance)
      assert.equal(mounted.selectionScope, undefined) // Unset neutral callers retain their existing manifest scope.
      console.dispose()
    }
  }
  assert.match(renderViewerPage(), /data-native-default-appearance="server"/)
  for (const value of ['\"><script>alert(1)</script>', 'bundled:<bad>', 'server\n', 'a'.repeat(129), null]) {
    assert.throws(() => renderViewerPage('3dview', { defaultAppearance: value }), TypeError)
  }
})

test('same viewer URL and UUID isolate host scopes while explicit server choice survives reconnect', async () => {
  const storage = new Map(), selectionStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }
  const scopeA = 'a'.repeat(24), scopeB = 'b'.repeat(24), legacy = 'https://same-viewer.test/manifest.json'
  const legacyKey = `native-appearance/v1:${encodeURIComponent(legacy)}:${UUID}`
  storage.set(legacyKey, 'server') // No server provenance: preserve, never migrate this preference.
  const boot = async selectionScope => {
    const html = renderViewerPage('3dview', { defaultAppearance: 'bundled:yui-ysm', selectionScope })
    const { document, window } = fullShell(); window.location.href = 'https://same-viewer.test/3dview/'
    document.body.dataset.nativeDefaultAppearance = html.match(/data-native-default-appearance="([^"]+)"/)[1]
    document.body.dataset.nativeSelectionScope = html.match(/data-native-selection-scope="([^"]*)"/)[1]
    let controller
    const console = await bootNativeConsole({ document, window, startStatus: () => () => {}, mount: async options => {
      assert.equal(options.selectionScope, selectionScope)
      controller = new NativeSelfPlayerController({ manifest: {} }, { ...options, selectionStorage,
        bundledAppearanceReader: { choices: () => [{ id: 'bundled:yui-ysm' }], get: () => ({ kind: 'ysm' }) },
        bundledYsmFactory: async () => ({ assetInfo: { uuid: UUID.toLowerCase(), source: 'plugin_bundled' }, dispose () {} }),
        minecraftFactory: async () => ({ assetInfo: { path: 'skin.png', sha256: 'hash' }, dispose () {} }) })
      await controller.update({ uuid: UUID, entityId: 1, skin: { kind: 'default', assetPath: 'skin.png', sha256: 'hash' } }, UUID)
      return { renderer: { setPixelRatio () {} }, setView () {}, dispose: () => controller.dispose() }
    } })
    return { console, controller }
  }
  const a = await boot(scopeA); assert.equal(a.controller.appearanceId, 'bundled:yui-ysm')
  assert.equal(a.controller.selectAppearance('server'), true); a.console.dispose()
  const b = await boot(scopeB); assert.equal(b.controller.appearanceId, 'bundled:yui-ysm'); b.console.dispose()
  const reconnected = await boot(scopeA); assert.equal(reconnected.controller.appearanceId, 'server')
  reconnected.controller.clear('respawn')
  await reconnected.controller.update({ uuid: UUID, entityId: 2, skin: { kind: 'default', assetPath: 'skin.png', sha256: 'hash' } }, UUID)
  assert.equal(reconnected.controller.appearanceId, 'server'); reconnected.console.dispose()
  assert.equal(storage.get(legacyKey), 'server')
  for (const value of ['raw-server.test', 'Alice', 'a'.repeat(65), '\"<script>', null]) {
    assert.throws(() => renderViewerPage('3dview', { selectionScope: value }), TypeError)
  }
})

test('all original view routes select the actual native first/third/dungeon camera', () => {
  assert.equal(consoleViewMode('/'), 'first')
  assert.equal(consoleViewMode('/third/'), 'third')
  assert.equal(consoleViewMode('/3dview/'), '3dview')
  assert.equal(consoleViewMode('/', 'third'), 'third')
  assert.equal(consoleViewMode('/3dview/', '__VIEW_MODE__'), '3dview')
})

test('native entry reuses the shared docked toolbar and clears its history on epoch changes', async () => {
  const { document, window } = fullShell(); let callbacks
  const console = await bootNativeConsole({ document, window, startStatus: () => () => {}, mount: async options => {
    callbacks = options
    options.onIdentity({ confirmed: true, player: 'Alice', playerUuid: UUID })
    return { renderer: { setPixelRatio () {} }, setView () {}, dispose () {} }
  } })
  assert.equal(document.body.dataset.viewerLayout, 'docked')
  assert.equal(document.querySelectorAll('.viewer-toolbar').length, 1)
  assert.equal(document.getElementById('corti-inventory-toggle').parentNode.className, 'viewer-toolbar-tools')
  assert.ok(document.querySelector('.viewer-agent-views'))
  const chat = document.querySelector('.corti-chat')
  assert.equal(chat.parentNode.className, 'viewer-toolbar-tools')
  const message = { seq: 1, kind: 'chat', text: '<b>actual message</b>', observedAt: Date.now() }
  callbacks.onState({ type: 'snapshot', epoch: 1, presentation: { ...presentation(), gameMessages: [message] } })
  callbacks.onState({ type: 'snapshot', epoch: 1, presentation: { ...presentation(), gameMessages: [message] } })
  chat.querySelector('.corti-chat-toggle').dispatch('click')
  assert.equal(document.querySelectorAll('.corti-chat-message').length, 1)
  assert.match(chat.textContent, /<b>actual message<\/b>/)
  callbacks.onState({ type: 'snapshot', epoch: 2, presentation: presentation() })
  assert.equal(document.querySelectorAll('.corti-chat-message').length, 0)
  assert.equal(document.querySelector('.dungeon-camera-controls').hidden, true)
  console.dispose()
  assert.equal(document.querySelector('.viewer-toolbar'), null)
  assert.equal(document.querySelector('.corti-chat'), null)
  assert.equal(document.querySelector('.viewer-agent-views'), null)
})

test('console exposes build refresh before native registry decoding and keeps the current route',async()=>{
  const {document,window}=fullShell();let hooks,reloads=0
  window.location.reload=()=>reloads++
  const scene={renderer:{setPixelRatio(){}},setView(){},dispose(){}}
  const console=await bootNativeConsole({document,window,mount:async options=>{hooks=options;return scene},startStatus:()=>()=>{}})
  const first='a'.repeat(64)+':'+'b'.repeat(64),next='c'.repeat(64)+':'+'b'.repeat(64)
  assert.equal(hooks.onBuild(first),false);assert.equal(hooks.onBuild(first),false);assert.equal(reloads,0)
  assert.equal(hooks.onBuild(next),true);assert.equal(hooks.onBuild(next),true);assert.equal(reloads,1)
  assert.equal(window.location.pathname,'/third/');console.dispose()
})
test('full shell boots exactly one scene, reuses native UI and disposes resources once on pagehide', async () => {
  const { document, window } = fullShell()
  let mounted = 0, callbacks, disposed = 0, statusStops = 0; const views = [], ratios = [], appearances = []
  const scene = { renderer: { setPixelRatio: value => ratios.push(value) }, setView: value => views.push(value), dispose: () => disposed++,
    selectAppearance: id => appearances.push(id),
    assetReader: { bytes: async () => new Uint8Array([137,80,78,71]) } }
  const console = await bootNativeConsole({ document, window,
    mount: async options => {
      mounted++; callbacks = options
      options.onIdentity({ confirmed: true, player: 'MawExplorer', playerUuid: UUID })
      options.onState({ type: 'snapshot', epoch: 1, presentation: presentation() })
      options.onDiagnostics({ drawn: 3, total: 5, missingColumns: 0, skinState: 'native default skin', issues: [], completeSceneParityVerified: false })
      return scene
    },
    createInterface: options => createNativeInterface({ ...options, previewFactory: () => ({ attach () {}, setVisible () {}, reset () {}, dispose () {} }) }),
    startStatus: options => {
      assert.equal(options.expectedPlayer(), undefined)
      options.onView({ name: '未同步', mode: '等待', goal: '未同步', action: '未同步', receipt: '未同步', receiptAt: '未同步', decisionAt: '未同步', notice: '' })
      return () => statusStops++
    }
  })
  assert.equal(mounted, 1); assert.equal(callbacks.mode, 'third')
  assert.equal(document.querySelectorAll('.native-console-viewport').length, 1)
  assert.equal(document.querySelector('[data-corti-hearts]').children.length, 10)
  assert.equal(document.getElementById('corti-menu').hidden, true)
  assert.equal(document.getElementById('viewer-canvas').dataset.hudAssets, 'verified')
  assert.equal(ratios[0], 1.5)
  const appearance = { available: true, selected: 'server', choices: [{ id: 'server', label: '跟随服务器' }, { id: 'web-model', label: '原始 YSM 模型' }] }
  const picker = document.querySelector('.viewer-appearance-settings'), select = picker.querySelector('select')
  callbacks.onDiagnostics({ appearance }); assert.equal(select.disabled, false); assert.equal(select.value, 'server')
  select.value = 'web-model'; select.dispatch('change'); assert.deepEqual(appearances, ['web-model'])
  callbacks.onDiagnostics({ appearance: { ...appearance, selected: 'web-model' } })
  picker.querySelector('button').dispatch('click'); assert.deepEqual(appearances, ['web-model', 'server'])
  const ysmNotice = document.querySelector('.native-ysm-preview-notice')
  assert.equal(ysmNotice.hidden, true)
  callbacks.onDiagnostics({ drawn: 3, total: 5, selfModel: { kind: 'ysm', modelId: 'misc/3_default_boy', texture: 'blue',
    support: { notice: 'YSM 原模型 · 已接入原生站立、行走、跑步、跳跃；装备与第一人称未适配' }, motion: { available: true, clip: 'walk' } }, issues: [] })
  assert.equal(ysmNotice.hidden, false); assert.match(ysmNotice.textContent, /站立、行走、跑步、跳跃/)
  assert.match(ysmNotice.textContent, /当前行走/)
  assert.doesNotMatch(ysmNotice.textContent, /静态|动画.*暂未显示|当前动作未同步/)
  callbacks.onDiagnostics({ selfModel: { kind: 'ysm', motion: { available: false, frozen: true, clip: 'walk', reason: 'NATIVE_YSM_PHYSICS_WINDOW_FINISHED' } } })
  assert.match(ysmNotice.textContent, /已知行走姿态/); assert.doesNotMatch(ysmNotice.textContent, /当前动作未同步|当前行走/)
  callbacks.onDiagnostics({ selfModel: { kind: 'ysm', motion: { available: false, frozen: true, clip: 'walk', reason: 'NATIVE_YSM_MOTION_STALE' } } })
  assert.match(ysmNotice.textContent, /当前动作未同步/); assert.doesNotMatch(ysmNotice.textContent, /已知行走姿态/)
  callbacks.onDiagnostics({ drawn: 3, total: 5, selfModel: { kind: 'ysm', notice: 'YSM 原模型预览；装备与第一人称未适配', motion: { available: false } }, issues: [] })
  assert.match(ysmNotice.textContent, /当前动作未同步/)
  callbacks.onDiagnostics({ drawn: 3, total: 5, selfModel: { kind: 'ysm', motion: { available: false, reason: 'NATIVE_YSM_POSE_UNSUPPORTED:sneak_or_sneaking' } }, issues: [] })
  assert.match(ysmNotice.textContent, /当前动作未适配/); assert.doesNotMatch(ysmNotice.textContent, /当前动作未同步/)
  callbacks.onDiagnostics({ drawn: 3, total: 5, selfModel: { kind: 'ysm', motion: { available: true } }, issues: [] })
  assert.match(ysmNotice.textContent, /装备与第一人称未适配/); assert.doesNotMatch(ysmNotice.textContent, /当前动作未同步/)
  callbacks.onDiagnostics({ drawn: 3, total: 5, selfModel: null, issues: [] })
  assert.equal(ysmNotice.hidden, true)
  const dungeon = document.querySelectorAll('[data-view]').find(link => link.dataset.view === '3dview')
  dungeon.dispatch('click', { preventDefault () {} }); assert.equal(views.at(-1), '3dview'); assert.equal(window.path, '/3dview/')
  document.dispatch('keydown', { code: 'F5', preventDefault () {} }); assert.equal(views.at(-1), 'first')
  callbacks.onFrame({ now: 0, label: { visible: true, x: 120, y: 100, name: 'MawExplorer' } })
  assert.equal(document.querySelector('.native-player-label').textContent, 'MawExplorer')
  assert.equal(document.querySelector('.native-player-label').style.left, '120px')
  callbacks.onUnavailable('connection ended')
  assert.equal(select.disabled, true); assert.equal(select.value, 'server')
  assert.equal(document.querySelector('.native-player-label').hidden, true)
  assert.match(document.querySelector('[data-corti-slots]').textContent, /未同步/)
  window.dispatch('pagehide'); console.dispose()
  assert.equal(disposed, 1); assert.equal(statusStops, 1)
  assert.equal(document.querySelector('.native-agent-status'), null)
  assert.equal(document.querySelector('.viewer-appearance-settings'), null)
  assert.equal(document.querySelector('.native-console-diagnostics'), null)
  assert.equal(document.querySelector('.native-ysm-preview-notice'), null)
  assert.equal((document.listeners.get('keydown') ?? []).length, 0)
})
test('quality controller consumes real scene frames and only changes after sustained pressure', async () => {
  const { document, window } = fullShell(); let callbacks; const ratios = []
  const console = await bootNativeConsole({ document, window, startStatus: () => () => {},
    mount: async options => { callbacks = options; return { setView () {}, dispose () {}, renderer: { setPixelRatio: value => ratios.push(value) } } } })
  for (let second = 0; second <= 6; second++) callbacks.onFrame({ now: second * 1000, label: { visible: false } })
  assert.equal(ratios.length, 1)
  callbacks.onFrame({ now: 7000, label: { visible: false } })
  assert.equal(ratios.at(-1), 1.15)
  document.hidden = true
  callbacks.onFrame({ now: 8000, label: { visible: false } })
  assert.equal(console.quality.getSnapshot().pressureStreak, 0)
  console.dispose()
})
test('closing before async scene creation completes releases that scene and stops further callbacks', async () => {
  const { document, window } = fullShell(); let finish, released = 0, stopped = 0, callbacks
  const running = bootNativeConsole({ document, window, startStatus: () => () => stopped++,
    mount: options => { callbacks = options; return new Promise(resolve => { finish = resolve }) } })
  window.dispatch('pagehide')
  callbacks.onIdentity({ player: 'late', confirmed: true, playerUuid: UUID })
  finish({ dispose: () => released++ })
  const console = await running; console.dispose()
  assert.equal(released, 1); assert.equal(stopped, 1)
  assert.equal(document.querySelector('.native-agent-status'), null)
})

test('native console exposes all original camera modes and shots without a body control channel',async()=>{
  const {document,window}=fullShell();window.location.pathname='/'
  let callbacks;const settings=[],shots=[],views=[]
  const console=await bootNativeConsole({document,window,startStatus:()=>()=>{},mount:async options=>{
    callbacks=options;return{setView:mode=>views.push(mode),setCameraSettings:value=>settings.push(value),
      startCameraShot:kind=>shots.push(kind),dispose(){}}
  }})
  const panel=document.querySelector('.viewer-camera-settings'),modes=panel.querySelectorAll('[data-camera-mode]')
  assert.equal(modes.length,6);assert.equal(callbacks.cameraSettings.mode,'follow')
  modes.find(button=>button.dataset.cameraMode==='front').dispatch('click')
  assert.equal(settings.at(-1).mode,'front');assert.equal(views.at(-1),'third')
  panel.querySelectorAll('button').find(button=>button.textContent==='环绕一周').dispatch('click')
  assert.equal(shots.at(-1),'orbit')
  callbacks.onCameraManual();assert.equal(settings.at(-1).mode,'manual')
  console.dispose();assert.equal(document.querySelector('.viewer-camera-settings'),null)
})


test('ordinary console exposes distinct received and committed terrain coverage without private payloads', async () => {
  const { document, window } = fullShell(); let callbacks
  window.location.pathname = '/3dview/'
  const console = await bootNativeConsole({ document, window, startStatus: () => () => {}, mount: async options => {
    callbacks = options
    return { renderer: { setPixelRatio () {} }, setView () {}, dispose () {} }
  } })
  const bounds = minX => ({ minX, maxX: minX + 64, minY: 25, maxY: 73, minZ: 298, maxZ: 362 })
  const terrainWork = { requested: 12, committed: 3, retiredWorkCount: 1, discardedBuildMs: 8.4, lastBuildMs: 200,
    building: true, pending: true, received: { epoch: 1, bounds: bounds(20), missingColumns: 0 },
    committedCoverage: { epoch: 1, bounds: bounds(0), missingColumns: 2 }, commitAgeMs: 250, phases: { terrainMs: 200 } }
  callbacks.onDiagnostics({ drawn: 24, total: 38, bounds: bounds(20), missingColumns: 0, terrainWork,
    privateChat: 'fixture-private-chat', config: { token: 'fixture-private-token' } })
  const viewport = document.querySelector('.native-console-viewport')
  assert.deepEqual(JSON.parse(viewport.dataset.terrainProgress), terrainWork)
  assert.ok(viewport.dataset.terrainProgress.length < 1000)
  assert.doesNotMatch(viewport.dataset.terrainProgress, /fixture-private/)
  assert.match(document.body.textContent, /地形接收：X\[20,84\].*缺列 0/)
  assert.match(document.body.textContent, /地形已提交：X\[0,64\].*缺列 2.*250 ms/)
  assert.match(document.body.textContent, /请求 12 \/ 提交 3 \/ 取消 1；丢弃工作 8 ms；构建中；有最新待处理/)
  callbacks.onDiagnostics({ drawn: 0, total: 0, terrainWork: { ...terrainWork, building: false, pending: false,
    received: null, committedCoverage: null, commitAgeMs: null } })
  assert.equal(JSON.parse(viewport.dataset.terrainProgress).committedCoverage, null)
  assert.match(document.body.textContent, /地形已提交：尚无/)
  assert.doesNotMatch(document.body.textContent, /地形已提交：X\[0,64\]/)
  console.dispose()
})
