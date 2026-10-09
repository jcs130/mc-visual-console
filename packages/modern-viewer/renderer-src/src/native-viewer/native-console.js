import { mountNativeWorld } from './native-scene.js'
import { createNativeInterface } from './native-ui-adapter.js'
import { createAdaptiveQualityController } from '../modern-viewer/viewer-performance.js'
import { renderAgentStatus, startAgentStatusPolling } from './agent-status.js'

// Full original page-template.html + viewer.css, with the same-player native
// scene underneath. No additional Minecraft observer or browser action channel.
const MODES = Object.freeze({ first: 'first', third: 'third', dungeon: 'dungeon' })
export function consoleViewMode (path = '/', selected) {
  return MODES[selected] ?? (path.startsWith('/dungeon') ? 'dungeon' : path.startsWith('/third') ? 'third' : 'first')
}

function append (document, parent, tag, className, text) {
  const element = document.createElement(tag)
  if (className) element.className = className
  if (text !== undefined) element.textContent = text
  parent.append(element); return element
}

export async function bootNativeConsole ({ document = globalThis.document, window = globalThis.window,
  mount = mountNativeWorld, fetchStatus = signal => fetch('/status.json', { cache: 'no-store', credentials: 'same-origin', signal }),
  startStatus = startAgentStatusPolling, createInterface = createNativeInterface } = {}) {
  if (!document?.body || !window) throw Error('NATIVE_CONSOLE_DOCUMENT_INVALID')
  const el = id => document.getElementById(id), q = selector => document.querySelector(selector)
  const listeners = [], listen = (target, event, callback) => { target?.addEventListener(event, callback); listeners.push([target, event, callback]) }
  let disposed = false, identity = null, sceneHost = null, latestState = null, lastDiagnostics = null
  let frames = 0, sampledAt = null, lastUiFrameAt = -Infinity, pendingMode = consoleViewMode(window.location?.pathname, document.body.dataset.viewMode)
  const viewport = el('viewer-canvas') ?? append(document, document.body, 'div', 'native-console-viewport')
  viewport.id = 'viewer-canvas'; viewport.setAttribute('aria-label', '同一 Agent 本人及原生世界')
  const label = append(document, viewport, 'div', 'native-player-label'); label.hidden = true
  const ysmNotice = append(document, viewport, 'div', 'native-ysm-preview-notice'); ysmNotice.hidden = true
  const boot = q('.boot') ?? append(document, document.body, 'div', 'boot', '正在载入原生世界…')
  const stateBar = append(document, document.body, 'aside', 'native-agent-status')
  stateBar.setAttribute('aria-label', '实际 Agent 状态')
  for (const [id, heading] of [['agent-name','玩家'],['agent-mode','状态'],['agent-goal','目标'],
    ['agent-action','动作'],['agent-receipt','回执'],['agent-receipt-at','回执时间'],['agent-decision-at','决策时间'],['agent-notice','']]) {
    const row = append(document, stateBar, 'span', 'native-agent-field')
    if (heading) append(document, row, 'small', '', `${heading} `)
    const value = append(document, row, 'span', '', '未同步'); value.id = id
  }
  const details = append(document, document.body, 'details', 'native-console-diagnostics')
  append(document, details, 'summary', '', '原生支持状态')
  const diagnostics = append(document, details, 'pre', '')
  const diagnosticLink = append(document, details, 'a', '', '打开原生诊断页'); diagnosticLink.href = '/diagnostics'
  const style = append(document, document.head, 'style', '')
  style.textContent = `
    .native-console-viewport{position:absolute;inset:0;overflow:hidden}
    .native-player-label{position:absolute;z-index:2;padding:2px 7px;color:white;background:#0009;transform:translate(-50%,-100%);pointer-events:none}
    .native-ysm-preview-notice{position:absolute;z-index:3;bottom:14px;left:14px;padding:5px 9px;color:#e1ebed;background:#11242ce8;border:1px solid #aec3b4;border-radius:5px;font:11px/1.4 system-ui;pointer-events:none}
    .native-agent-status{position:fixed;z-index:7;top:54px;left:50%;transform:translateX(-50%);max-width:min(640px,calc(100vw - 32px));display:flex;flex-wrap:wrap;gap:3px 12px;padding:5px 9px;background:var(--mc-viewer-ui-bg,#11242cdb);border:1px solid var(--mc-viewer-ui-border,#aec3b4);border-radius:7px;font:11px/1.5 system-ui}
    .native-agent-field{overflow-wrap:anywhere}.native-agent-field small{color:#aebfc1}
    .native-agent-field:has(#agent-goal){flex-basis:100%}.native-agent-field:has(#agent-notice:empty){display:none}
    .native-console-diagnostics{position:fixed;z-index:7;bottom:58px;right:14px;max-width:min(430px,85vw);padding:4px 8px;background:#11242ce8;border:1px solid #aec3b4;border-radius:7px;font:11px/1.4 system-ui}
    .native-console-diagnostics pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:35vh;overflow:auto}.native-console-diagnostics a{color:#afe2ff}
    .native-unavailable{font:11px/1.4 system-ui;color:#c4d4d3;white-space:nowrap}
    .corti-item-fallback{overflow:hidden;overflow-wrap:anywhere;font-size:8px}
    .corti-skills [data-ability-list]{grid-template-columns:1fr}.corti-skills [data-ability-list] small{display:block;color:#aebfc1;font-size:10px}
    [data-menu-body]>.corti-menu-note{color:#d4e2e3;margin:8px 0 0;padding:7px 4px;max-width:352px;font:11px/1.5 system-ui}
    .boot.is-compact{bottom:92px;right:14px;max-width:390px;font-size:11px}
    @media(max-width:720px){.native-agent-status{top:55px;font-size:10px;gap:1px 6px}.native-agent-field:has(#agent-decision-at){display:none}}
  `
  const ui = createInterface({ document })
  const quality = createAdaptiveQualityController({ nativePixelRatio: window.devicePixelRatio || 1, maximumPixelRatio: 1.5 })
  const updateDiagnosticText = () => {
    const d = lastDiagnostics
    ysmNotice.hidden = d?.selfModel?.kind !== 'ysm'
    if (!ysmNotice.hidden) {
      const model = d.selfModel, motion = model.motion
      const notice = model.support?.notice || model.notice || 'YSM 原模型预览；装备与第一人称未适配'
      const clips = { idle: '站立', walk: '行走', run: '跑步', jump: '跳跃' }
      const heldPose = motion?.available === false && motion.frozen === true && motion.reason === 'NATIVE_YSM_PHYSICS_WINDOW_FINISHED' && Object.hasOwn(clips, motion.clip)
      const state = heldPose ? `已知${clips[motion.clip]}姿态`
        : motion?.available === false ? (motion.reason?.includes('UNSUPPORTED') ? '当前动作未适配' : '当前动作未同步')
        : motion?.available === true && Object.hasOwn(clips, motion.clip) ? `当前${clips[motion.clip]}` : ''
      ysmNotice.textContent = `${notice}${state ? ` · ${state}` : ''}`
    }
    const presentation = ui.getState().presentation
    diagnostics.textContent = [identity ? `玩家：${identity.player} (${identity.playerUuid || 'UUID未同步'})` : '玩家身份未同步',
      d ? `原生模型：${d.drawn}/${d.total}；缺列 ${d.missingColumns ?? '未同步'}` : '原生模型数据未同步',
      d?.bounds ? `地形范围：${d.bounds.maxX - d.bounds.minX + 1}×${d.bounds.maxZ - d.bounds.minZ + 1} 格，高度 ${d.bounds.minY}–${d.bounds.maxY}；只显示本人收到的区块` : '',
      d?.coverage?.horizontalRangeReduced ? '地形因预算收缩，实际范围以上述数值为准' : '',
      d?.skinState ?? '本人模型未同步',
      d?.entities ? `周围实体：原生收到 ${d.entities.received}，已渲染 ${d.entities.rendered}` : '',
      d?.heldItems ? `第三人称持物：${d.heldItems.available ? '原始模型已接入' : d.heldItems.reason || '未支持'}` : '',
      pendingMode === 'first' && d?.firstPersonItems ? `第一人称持物：${d.firstPersonItems.available ? '原始静止持物姿态' : d.firstPersonItems.reason || '未支持'}；装备切换与完整使用动画待适配` : '',
      ...Object.entries((pendingMode === 'first' ? d?.firstPersonItems : d?.heldItems)?.hands ?? {}).map(([arm, hand]) =>
        `${arm === 'right' ? '右手' : '左手'}：${hand.name || '空或未同步'}；${hand.status}；${hand.visible ? '显示' : '未显示'}${hand.reason || hand.projection?.warning ? `；${hand.reason || hand.projection.warning}` : ''}`),
      presentation.available ? '背包/菜单/技能：同一玩家原生状态；原生物品图标已接入，未支持的专用模型/组件及装备明确标注' : `展示数据：${presentation.reason}`,
      pendingMode === 'dungeon' ? '地下城2.5D跟随相机；遮挡/切面/点击操控未接入' : '',
      '音效/音乐/小地图：原生接口未接入', '完整场景一致性尚未验收',
      ...(d?.issues ?? []).slice(0, 16)].filter(Boolean).join('\n')
  }
  for (const id of ['corti-sound-toggle','corti-music-toggle','corti-sound-test','corti-music-play','corti-night-vision-toggle']) {
    const button = el(id)
    if (button) { button.disabled = true; button.title = '对应原生接口未接入'; button.textContent = id.includes('night') ? '夜视 未支持' : id.includes('music') ? '音乐 未支持' : '音效 未支持' }
  }
  const soundStatus = q('[data-corti-audio-status]')
  if (soundStatus) soundStatus.textContent = '原生声音资源与事件尚未接入'
  const map = el('corti-minimap')
  if (map) map.hidden = true // Missing native map is disclosed in diagnostics, not an empty terrain panel.
  // Block old stylesheet URLs until NativeUiAssets installs verified pack URLs.
  style.textContent += '\n.corti-crosshair,.corti-hotbar,.corti-hotbar-selection,.corti-xp,.corti-xp-fill{background-image:none}'
  const switchView = mode => {
    pendingMode = mode; sceneHost?.setView(mode)
    const selected = Object.entries(MODES).find(([, value]) => value === mode)?.[0]
    document.body.dataset.viewMode = selected
    for (const link of document.querySelectorAll('[data-view]')) {
      const active = MODES[link.dataset.view] === mode
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current')
    }
    const crosshair = q('.corti-crosshair'); if (crosshair) crosshair.hidden = mode !== 'first'
    updateDiagnosticText()
  }
  for (const link of document.querySelectorAll('[data-view]')) listen(link, 'click', event => {
    const mode = MODES[link.dataset.view]
    if (!mode || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault(); switchView(mode)
    if (link.getAttribute('href')) window.history?.replaceState(null, '', link.getAttribute('href'))
  })
  listen(document, 'keydown', event => {
    if (event.code !== 'F5' || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName) || event.target?.isContentEditable) return
    event.preventDefault(); switchView(pendingMode === 'first' ? 'third' : 'first')
  })
  const stopStatus = startStatus({ fetchStatus, expectedPlayer: () => identity?.player,
    onView: view => { if (!disposed) renderAgentStatus(view, el) } })
  const dispose = () => {
    if (disposed) return
    disposed = true; stopStatus(); ui.dispose(); sceneHost?.dispose()
    for (const [target, event, callback] of listeners) target?.removeEventListener(event, callback)
    label.remove(); ysmNotice.remove(); stateBar.remove(); details.remove(); style.remove()
  }
  listen(window, 'pagehide', dispose)
  ui.reset(); switchView(pendingMode)
  try {
    sceneHost = await mount({ viewport, mode: pendingMode,
      onIdentity (value) { if (disposed) return; identity = value; ui.setIdentity(value); updateDiagnosticText() },
      onState (value) {
        if (disposed) return
        if (value?.type === 'presentation') {
          latestState = { ...latestState, presentation: value.presentation }; ui.update(latestState)
        } else if (['fishingCatch','inventoryPreview','entityDamage','combatFeedback'].includes(value?.type)) ui.event(value)
        else { latestState = value; ui.update(value) }
        updateDiagnosticText()
      },
      onUnavailable (reason) {
        if (disposed) return
        label.hidden = true; ui.reset(); boot.classList.add('is-compact','is-error'); boot.textContent = `原生画面不可用：${reason}`
        updateDiagnosticText()
        ysmNotice.hidden = true
      },
      onDiagnostics (value) {
        if (disposed) return
        lastDiagnostics = value; updateDiagnosticText()
        boot.classList.add('is-compact'); boot.classList.remove('is-error')
        boot.textContent = `原生模型 ${value.drawn}/${value.total} · 完整场景尚未验收`
      },
      onActor (value, reason) { if (!disposed) ui.setActor(value, reason) },
      onMode (value) { if (!disposed) { pendingMode = value; updateDiagnosticText() } },
      onFrame (frame) {
        if (disposed) return
        frames++
        if (sampledAt === null) sampledAt = frame.now
        if (frame.now - sampledAt >= 1000) {
          const result = quality.sample({ fps: frames * 1000 / (frame.now - sampledAt), hidden: document.hidden })
          if (result.changed) sceneHost?.renderer?.setPixelRatio(result.pixelRatio)
          viewport.dataset.qualityMode = result.mode; viewport.dataset.fps = String(result.lastFps ?? '')
          frames = 0; sampledAt = frame.now
        }
        if (frame.now - lastUiFrameAt < 1000 / 30) return
        lastUiFrameAt = frame.now
        label.hidden = !frame.label?.visible
        if (frame.label?.visible) {
          label.textContent = frame.label.name; label.style.left = `${frame.label.x}px`; label.style.top = `${frame.label.y}px`
        }
      }
    })
    if (disposed) { sceneHost.dispose(); return { dispose, ui, quality, get sceneHost () { return sceneHost } } }
    sceneHost.setView(pendingMode)
    if (sceneHost.actor) ui.setActor(sceneHost.actor)
    if (sceneHost.assetReader) {
      const assets = await ui.setAssets(sceneHost.assetReader)
      if (!disposed && !assets.available) { diagnostics.textContent += `\nHUD资源不可用：${assets.failures.join(', ')}`; viewport.dataset.hudAssets = 'unavailable' }
      else viewport.dataset.hudAssets = 'verified'
    }
    sceneHost.renderer?.setPixelRatio(quality.getSnapshot().pixelRatio)
    viewport.dataset.qualityMode = quality.getSnapshot().mode
  } catch (error) {
    ui.reset(); boot.classList.add('is-error'); boot.textContent = `原生界面不可用：${error.message}`
    dispose(); throw error
  }
  return { dispose, ui, quality, setView: switchView, get sceneHost () { return sceneHost } }
}

if (typeof document !== 'undefined' && document.querySelector('.corti-view-switch')) {
  void bootNativeConsole().catch(error => console.error('Native console unavailable', error))
}
