import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bootNativeConsole, consoleViewMode } from '../../src/native-viewer/native-console.js'
import { createNativeInterface } from '../../src/native-viewer/native-ui-adapter.js'
import { Element, shell } from './fixtures/native-console-dom.mjs'

const UUID = 'e371227c-09fa-3722-84f4-f3228a552c3c'
function fullShell () {
  const document = shell(), window = new Element('window', document)
  window.devicePixelRatio = 2; window.location = { pathname: '/third/' }
  window.history = { replaceState (_state, _name, path) { window.path = path } }
  const nav = document.createElement('nav'); nav.className = 'corti-view-switch'; document.body.append(nav)
  for (const mode of ['first','third','dungeon']) {
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

test('all original view routes select the actual native first/third/dungeon camera', () => {
  assert.equal(consoleViewMode('/'), 'first')
  assert.equal(consoleViewMode('/third/'), 'third')
  assert.equal(consoleViewMode('/dungeon/'), 'dungeon')
  assert.equal(consoleViewMode('/', 'third'), 'third')
  assert.equal(consoleViewMode('/dungeon/', '__VIEW_MODE__'), 'dungeon')
})
test('full shell boots exactly one scene, reuses native UI and disposes resources once on pagehide', async () => {
  const { document, window } = fullShell()
  let mounted = 0, callbacks, disposed = 0, statusStops = 0; const views = [], ratios = []
  const scene = { renderer: { setPixelRatio: value => ratios.push(value) }, setView: value => views.push(value), dispose: () => disposed++,
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
  const dungeon = document.querySelectorAll('[data-view]').find(link => link.dataset.view === 'dungeon')
  dungeon.dispatch('click', { preventDefault () {} }); assert.equal(views.at(-1), 'dungeon'); assert.equal(window.path, '/dungeon/')
  document.dispatch('keydown', { code: 'F5', preventDefault () {} }); assert.equal(views.at(-1), 'first')
  callbacks.onFrame({ now: 0, label: { visible: true, x: 120, y: 100, name: 'MawExplorer' } })
  assert.equal(document.querySelector('.native-player-label').textContent, 'MawExplorer')
  assert.equal(document.querySelector('.native-player-label').style.left, '120px')
  callbacks.onUnavailable('connection ended')
  assert.equal(document.querySelector('.native-player-label').hidden, true)
  assert.match(document.querySelector('[data-corti-slots]').textContent, /未同步/)
  window.dispatch('pagehide'); console.dispose()
  assert.equal(disposed, 1); assert.equal(statusStops, 1)
  assert.equal(document.querySelector('.native-agent-status'), null)
  assert.equal(document.querySelector('.native-console-diagnostics'), null)
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
