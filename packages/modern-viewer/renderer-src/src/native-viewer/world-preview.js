// Diagnostic route. The product console and this page share the same native renderer.
import { mountNativeWorld } from './native-scene.js'
import { playerHud } from './player-camera.js'
import { renderAgentStatus, startAgentStatusPolling } from './agent-status.js'
const el = id => document.getElementById(id)
let player, playerUuid, scene
const stopStatus = startAgentStatusPolling({
  fetchStatus: signal => fetch('/status.json', { cache: 'no-store', credentials: 'same-origin', signal }),
  onView: view => renderAgentStatus(view, el), expectedPlayer: () => player
})
const updateMode = mode => {
  el('third').setAttribute('aria-pressed', String(mode === 'third'))
  el('follow').setAttribute('aria-pressed', String(mode === 'first'))
  el('orbit').setAttribute('aria-pressed', String(mode === 'region'))
  el('view-name').textContent = { third: '第三人称 · 跟随 Agent', first: '第一人称 · Agent 眼位', region: '自由观察 · 双击回到 Agent' }[mode]
}
try {
  scene = await mountNativeWorld({
    viewport: el('viewport'), onMode: updateMode,
    onIdentity(value) {
      player = value.player; playerUuid = value.playerUuid?.toLowerCase()
      el('player').textContent = player; el('hud-player').textContent = player
    },
    onState(value) {
      if (!value.pose) return
      const p = value.pose, hud = playerHud(value.selfPlayer, playerUuid)
      el('position').textContent = `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`
      el('hud-position').textContent = `X ${p.x.toFixed(1)} · Y ${p.y.toFixed(1)} · Z ${p.z.toFixed(1)}`
      el('hud-health').textContent = hud.health; el('hud-food').textContent = hud.food
      el('sequence').textContent = String(value.packetSequence)
      el('clock').textContent = value.time ? `${value.time.age} tick` : '时钟未同步（动画暂停）'
      el('status').textContent = '实时状态已接入 · 画面适配进行中'; el('error').textContent = ''
    },
    onFrame({label}) {
      const node = el('player-label'); node.hidden = !label.visible
      node.textContent = label.name; node.style.left = `${label.x}px`; node.style.top = `${label.y}px`
    },
    onDiagnostics(value) {
      el('blocks').textContent = String(value.total); el('drawn').textContent = String(value.drawn)
      el('kinetics').textContent = value.kinetics.map(n => `${n ?? '?'} RPM`).join(' / ') || '区域内无已适配机械'
      el('environment').textContent = value.environment.join(' / ') || '群系未收到'
      el('skin-state').textContent = value.skinState || '本人模型等待原始皮肤信息'
      el('coverage').textContent = `${value.issues.length} 项模型/材质缺口，${value.missingColumns} 个区块未收到；实体和光照尚未验收。`
      el('issues').replaceChildren(...value.issues.slice(0, 12).map(text => { const li = document.createElement('li'); li.textContent = text; return li }))
    },
    onUnavailable(reason) {
      el('status').textContent = '原生世界画面不可用'; el('error').textContent = reason
      el('hud-health').textContent = '未收到'; el('hud-food').textContent = '未收到'; el('player-label').hidden = true
    }
  })
  el('third').onclick = el('recenter').onclick = () => scene.setView('third')
  el('follow').onclick = () => scene.setView('first')
  el('orbit').onclick = () => scene.setView('region')
  scene.renderer.domElement.ondblclick = () => scene.setView('third')
  const key = event => { if (event.key === 'F5') { event.preventDefault(); scene.setView(el('third').getAttribute('aria-pressed') === 'true' ? 'first' : 'third') } }
  addEventListener('keydown', key)
  addEventListener('pagehide', () => { removeEventListener('keydown', key); scene.dispose(); stopStatus() }, { once: true })
} catch(error) {
  stopStatus(); el('status').textContent = '原生世界画面不可用'; el('error').textContent = error.message
}
