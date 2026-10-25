import { createNativeTransitionTiming } from './native-transition-timing.js'
import {writeChanged,createTargetSignature} from './native-display-performance.js'
import { mountNativeWorld } from './native-scene.js'
import { pageDefaultAppearance, pageSelectionScope } from './native-appearance-default.js'
import { nativeViewerUrl } from './native-url.js'
import { createNativeInterface } from './native-ui-adapter.js'
import { createAdaptiveQualityController } from '../modern-viewer/viewer-performance.js'
import { renderAgentStatus, startAgentStatusPolling } from './agent-status.js'
import { installAppearanceSettings } from '../modern-viewer/appearance-settings.js'
import { createNativeActivityUi } from './native-activity-ui.js'
import { installCameraSettings } from '../modern-viewer/camera-settings.js'
import { loadCameraSettings, CAMERA_SETTINGS_KEY } from '../modern-viewer/camera-preferences.js'
import { installSceneSettings } from '../modern-viewer/scene-settings.js'
import { loadSceneSettings,sceneColourFilter } from '../modern-viewer/scene-quality.js'
import { installDungeonObserverControls } from '../modern-viewer/dungeon-observer-controls.js'
import {createNativeViewerBuildGuard} from './native-viewer-build.js'
import { installViewerLayout } from '../modern-viewer/viewer-layout.js'
import { installChatHistory } from '../modern-viewer/chat-history.js'
import { installAgentViewGallery } from '../modern-viewer/agent-view-gallery.js'
import {createNativeDeathUi} from './native-death-ui.js'

// Full original page-template.html + viewer.css, with the same-player native
// scene underneath. No additional Minecraft observer or browser action channel.
const MODES = Object.freeze({ first: 'first', third: 'third', '3dview': '3dview', dungeon: '3dview' })
export function consoleViewMode (path = '/', selected) {
  return MODES[selected] ?? (path.startsWith('/3dview') ? '3dview' : path.startsWith('/third') ? 'third' : 'first')
}

function append (document, parent, tag, className, text) {
  const element = document.createElement(tag)
  if (className) element.className = className
  if (text !== undefined) element.textContent = text
  parent.append(element); return element
}

export async function bootNativeConsole ({ document = globalThis.document, window = globalThis.window,
  mount = mountNativeWorld, fetchStatus = signal => fetch(nativeViewerUrl('status.json'), { cache: 'no-store', credentials: 'same-origin', signal }),
  startStatus = startAgentStatusPolling, createInterface = createNativeInterface, defaultAppearance = pageDefaultAppearance(document), selectionStorage,
  selectionScope = pageSelectionScope(document) } = {}) {
  if (!document?.body || !window) throw Error('NATIVE_CONSOLE_DOCUMENT_INVALID')
  const el = id => document.getElementById(id), q = selector => document.querySelector(selector)
  const buildChanged=createNativeViewerBuildGuard(q('meta[name="native-viewer-build"]')?.content,()=>window.location.reload())
  const listeners = [], listen = (target, event, callback) => { target?.addEventListener(event, callback); listeners.push([target, event, callback]) }
  let disposed = false, identity = null, sceneHost = null, latestState = null, lastDiagnostics = null
  let messageSubject = null, lastMessageSequence = 0
  const chatUi = installChatHistory({ document, window })
  const galleryUi = installAgentViewGallery({ document, window })
  const layoutUi = installViewerLayout({ document, window })
  const resetMessages = () => { chatUi?.reset(); messageSubject = null; lastMessageSequence = 0 }
  const updateMessages = state => {
    const presentation = state?.presentation, uuid = identity?.playerUuid?.toLowerCase()
    if (!uuid || presentation?.playerUuid?.toLowerCase() !== uuid || presentation.available !== true) { resetMessages(); return }
    const subject = `${uuid}:${state.epoch}`
    if (subject !== messageSubject) { resetMessages(); messageSubject = subject }
    for (const row of presentation.gameMessages ?? []) {
      if (!Number.isSafeInteger(row.seq) || row.seq <= lastMessageSequence) continue
      lastMessageSequence = row.seq; chatUi?.receive(row)
    }
  }
  const appearanceUi = installAppearanceSettings({ document, window, onChange: id => sceneHost?.selectAppearance?.(id) })
  let sceneSettings=loadSceneSettings(window.localStorage),quality
  const sceneUi=installSceneSettings({document,window,settings:sceneSettings,onChange:value=>{
    sceneSettings=value;quality=createAdaptiveQualityController({nativePixelRatio:window.devicePixelRatio||1,maximumPixelRatio:1.5,preference:value.quality})
    sceneHost?.setSceneSettings?.(value);sceneHost?.renderer?.setPixelRatio(quality.getSnapshot().pixelRatio)
  }})
  let cameraSettings
  try {cameraSettings=window.localStorage?.getItem(CAMERA_SETTINGS_KEY)?loadCameraSettings(window.localStorage):{...loadCameraSettings(null),mode:'follow'}}
  catch {cameraSettings={...loadCameraSettings(null),mode:'follow'}}
  const cameraUi=installCameraSettings({document,window,settings:cameraSettings,onChange:value=>{
    cameraSettings=value;sceneHost?.setCameraSettings?.(value);if(pendingMode!=='third')switchView('third')
  },onShot:kind=>{if(pendingMode!=='third')switchView('third');sceneHost?.startCameraShot?.(kind)}})
  let frames = 0, sampledAt = null, lastUiFrameAt = -Infinity, pendingMode = consoleViewMode(window.location?.pathname, document.body.dataset.viewMode)
  const viewport = el('viewer-canvas') ?? append(document, document.body, 'div', 'native-console-viewport')
  const transitionTiming = createNativeTransitionTiming({ viewport, document, context: () => sceneHost?.timingContext?.() ?? { view: pendingMode } })
  viewport.id = 'viewer-canvas'; viewport.setAttribute('aria-label', '同一 Agent 本人及原生世界')
  const targets=append(document,document.body,'details','native-target-panel');append(document,targets,'summary','','观察目标')
  const targetBody=append(document,targets,'div','native-toolbar-panel')
  const targetSelect=append(document,targetBody,'select','');targetSelect.setAttribute('aria-label','观战跟随目标')
  const targetSelf=append(document,targetBody,'button','','回到 Agent 本人');targetSelf.type='button'
  const targetInfo=append(document,targetBody,'output','','点击画面中的实体或从列表选择，只切换观战镜头')
  listen(targetSelect,'change',()=>sceneHost?.selectTarget?.(targetSelect.value===''?null:Number(targetSelect.value)))
  listen(targetSelf,'click',()=>sceneHost?.selectTarget?.(null))
  let targetSignature='',dungeonUi=null,dungeonPose={yaw:Math.PI*.75,pitch:-.82,distance:16}
  dungeonUi=installDungeonObserverControls({document,getPose:()=>sceneHost?.getDungeonCamera?.()??dungeonPose,
    setPose:value=>{dungeonPose=value;sceneHost?.setDungeonCamera?.(value)},limits:{yaw:Math.PI*.75,pitch:-.82,distance:16,min:5,max:32},
    requestFrame:callback=>window.requestAnimationFrame(callback),cancelFrame:id=>window.cancelAnimationFrame(id)})
  const label = append(document, viewport, 'div', 'native-player-label'); label.hidden = true
  const ysmNotice = append(document, viewport, 'div', 'native-ysm-preview-notice'); ysmNotice.hidden = true
  const boot = q('.boot') ?? append(document, document.body, 'div', 'boot', '正在载入原生世界…')
  const stateBar = append(document, document.body, 'details', 'native-agent-status')
  stateBar.setAttribute('aria-label', '实际 Agent 状态')
  append(document, stateBar, 'summary', '', '运行详情')
  const stateBody = append(document, stateBar, 'div', 'native-toolbar-panel')
  for (const [id, heading] of [['agent-name','玩家'],['agent-mode','状态'],['agent-goal','目标'],
    ['agent-action','动作'],['agent-receipt','回执'],['agent-receipt-at','回执时间'],['agent-decision-at','决策时间'],['agent-notice','']]) {
    const row = append(document, stateBody, 'span', 'native-agent-field')
    if (heading) append(document, row, 'small', '', `${heading} `)
    const value = append(document, row, 'span', '', '未同步'); value.id = id
  }
  const details = append(document, document.body, 'details', 'native-console-diagnostics')
  append(document, details, 'summary', '', '原生支持状态')
  const diagnosticBody = append(document, details, 'div', 'native-toolbar-panel')
  const diagnostics = append(document, diagnosticBody, 'pre', '')
  const diagnosticLink = append(document, diagnosticBody, 'a', '', '打开原生诊断页'); diagnosticLink.href = nativeViewerUrl('diagnostics', document.baseURI || 'http://localhost/')
  const style = append(document, document.head, 'style', '')
  style.textContent = `
    .native-console-viewport{position:absolute;inset:0;overflow:hidden}
    .native-player-label{position:absolute;z-index:2;padding:2px 7px;color:white;background:#0009;transform:translate(-50%,-100%);pointer-events:none}
    .native-ysm-preview-notice{position:absolute;z-index:3;bottom:14px;left:14px;padding:5px 9px;color:#e1ebed;background:#11242ce8;border:1px solid #aec3b4;border-radius:5px;font:11px/1.4 system-ui;pointer-events:none}
    .native-agent-status{position:fixed;z-index:7;top:54px;right:14px;max-width:min(640px,calc(100vw - 32px));padding:5px 9px;background:var(--mc-viewer-ui-bg,#11242cdb);border:1px solid var(--mc-viewer-ui-border,#aec3b4);border-radius:7px;font:11px/1.5 system-ui}
    .native-agent-field{display:block;overflow-wrap:anywhere}.native-agent-field small{color:#aebfc1}
    .viewer-toolbar .native-agent-status,.viewer-toolbar .native-console-diagnostics,.viewer-toolbar .native-target-panel{position:static;inset:auto;transform:none;padding:0;border:0;background:none}
    .viewer-toolbar .native-agent-status[open],.viewer-toolbar .native-console-diagnostics[open],.viewer-toolbar .native-target-panel[open]{position:relative}
    .viewer-toolbar .native-toolbar-panel{position:fixed;top:58px;right:12px;box-sizing:border-box;width:min(480px,calc(100vw - 24px));max-height:65vh;overflow:auto;padding:14px;background:var(--viewer-surface,#11242cf5);border:1px solid var(--viewer-line,#aec3b4);border-radius:8px;white-space:normal;color:#dce9e5;font:12px/1.6 system-ui}
    .native-agent-status summary,.native-console-diagnostics summary{cursor:pointer}
    .native-agent-field:has(#agent-goal){flex-basis:100%}.native-agent-field:has(#agent-notice:empty){display:none}
    .native-console-diagnostics{position:fixed;z-index:7;bottom:58px;right:14px;max-width:min(430px,85vw);padding:4px 8px;background:#11242ce8;border:1px solid #aec3b4;border-radius:7px;font:11px/1.4 system-ui}
    .native-console-diagnostics pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:35vh;overflow:auto}.native-console-diagnostics a{color:#afe2ff}
    .native-unavailable{font:11px/1.4 system-ui;color:#c4d4d3;white-space:nowrap}
    .corti-item-fallback{overflow:hidden;overflow-wrap:anywhere;font-size:8px}
    .corti-skills [data-ability-list] small{display:block;color:#aebfc1;font-size:10px}
    [data-menu-body]>.corti-menu-note{color:#d4e2e3;margin:8px 0 0;padding:7px 4px;max-width:352px;font:11px/1.5 system-ui}
    .boot.is-compact{bottom:92px;right:14px;max-width:390px;font-size:11px}
    .viewer-camera-settings{right:112px}.viewer-toolbar .viewer-camera-settings{right:auto}
    .native-target-panel{position:fixed;z-index:7;right:14px;top:94px;padding:6px 10px;background:#11242ce8;border:1px solid #aec3b4;border-radius:7px;font:11px/1.5 system-ui;max-width:300px}
    .native-target-panel select{display:block;width:100%;margin:6px 0}.native-target-panel output{display:block;max-width:280px;overflow-wrap:anywhere}
    .dungeon-camera-controls[hidden]{display:none!important}
    @media(max-width:720px){.native-agent-status{top:55px;font-size:10px;gap:1px 6px}.native-agent-field:has(#agent-decision-at){display:none}}
  `
  let activityUi=null
  const ui = createInterface({ document, transitionTiming,onIconRevision:iconRevision=>{
    if(!disposed&&latestState)activityUi?.update(latestState,{iconRevision})
  } })
  const deathUi=createNativeDeathUi({document})
  activityUi = createNativeActivityUi({ document, itemName: item => ui.itemName?.(item) ?? item?.name,
    renderItem: (target, item, options) => ui.renderObservedItem?.(target, item, options),
    renderReferenceItem: (target, item, options) => ui.renderReferenceItem?.(target, item, options) })
  quality = createAdaptiveQualityController({ nativePixelRatio: window.devicePixelRatio || 1, maximumPixelRatio: 1.5,preference:sceneSettings.quality })
  const updateDiagnosticText = () => {
    const d = lastDiagnostics
    // Small terrain-only contract for the existing page, never chat/config/player data.
    writeChanged(viewport.dataset,'terrainProgress',JSON.stringify(d?.terrainWork??null))
    writeChanged(viewport.dataset,'startupTiming',JSON.stringify(d?.startup??null))
    const boundsText=b=>b?`X[${b.minX},${b.maxX}] Y[${b.minY},${b.maxY}] Z[${b.minZ},${b.maxZ}]`:'尚无'
    appearanceUi.update(d?.appearance ? { ...d.appearance, subject: identity?.player || '当前观战人物' } : null)
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
      d?.bounds ? `已接收地形范围：${d.bounds.maxX - d.bounds.minX + 1}×${d.bounds.maxZ - d.bounds.minZ + 1} 格，高度 ${d.bounds.minY}–${d.bounds.maxY}；只显示本人收到的区块` : '',
      d?.terrainWork ? `地形接收：${boundsText(d.terrainWork.received?.bounds)}；缺列 ${d.terrainWork.received?.missingColumns??'未知'}` : '',
      d?.terrainWork ? `地形已提交：${boundsText(d.terrainWork.committedCoverage?.bounds)}；缺列 ${d.terrainWork.committedCoverage?.missingColumns??'未知'}；提交距今 ${d.terrainWork.commitAgeMs??'尚无'} ms` : '',
      d?.terrainWork ? `地形任务：请求 ${d.terrainWork.requested} / 提交 ${d.terrainWork.committed} / 取消 ${d.terrainWork.retiredWorkCount}；丢弃工作 ${Math.round(d.terrainWork.discardedBuildMs)} ms${d.terrainWork.building?'；构建中':''}${d.terrainWork.pending?'；有最新待处理':''}` : '',
      d?.coverage?.horizontalRangeReduced ? '地形因预算收缩，实际范围以上述数值为准' : '',
      d?.skinState ?? '本人模型未同步',
      d?.selfModel?.motion ? `人物动作：${d.selfModel.motion.clip ?? '等待'} · ${d.selfModel.motion.source ?? 'native'}${d.selfModel.motion.reason ? ' · '+d.selfModel.motion.reason : ''}` : '',
      d?.entities ? `周围实体：原生收到 ${d.entities.received}，已渲染 ${d.entities.rendered}` : '',
      d?.frameGaps ? `可见帧间隔：p50 ${d.frameGaps.p50} / p95 ${d.frameGaps.p95} / p99 ${d.frameGaps.p99} / 最大 ${d.frameGaps.max} ms；>33/>50/>100 ms ${d.frameGaps.over33}/${d.frameGaps.over50}/${d.frameGaps.over100}；${d.frameGaps.sampleCount} 样本 / ${Math.round(d.frameGaps.durationMs)} ms` : '',
      d?.selfDisplay ? `本人显示缓冲 ${d.selfDisplay.delayMs} ms${d.selfDisplay.stale?' · 采样陈旧，保持最后位置':''}` : '',
      d?.terrainWork?.phases ? `地形更新(CPU)：签名/环境/提交/索引/首次绘制 ${['signatureMs','environmentMs','commitMs','indexMs','firstRenderMs'].map(key=>Number.isFinite(d.terrainWork.phases[key])?d.terrainWork.phases[key].toFixed(1):'等待').join(' / ')} ms` : '',
      d?.frameCost ? `帧耗时(CPU)：更新 ${d.frameCost.updateMs.toFixed(1)} / 主画面 ${d.frameCost.mainMs.toFixed(1)} / 手部 ${d.frameCost.handsMs.toFixed(1)} / 地图 ${d.frameCost.mapMs.toFixed(1)} / HUD ${d.frameCost.uiMs.toFixed(1)} ms；主画面 ${d.frameCost.mainCalls} 次绘制 / ${d.frameCost.mainTriangles} 三角形；地图读回 ${d.frameCost.mapReadback??'等待'}` : '',
      d?.heldItems ? `第三人称持物：${d.heldItems.available ? '原始模型已接入' : d.heldItems.reason || '未支持'}` : '',
      pendingMode === 'first' && d?.firstPersonItems ? `第一人称持物：${d.firstPersonItems.available ? (d.firstPersonItems.swingAnimationAvailable ? '本人挥手与持物动画' : '原始静止持物姿态') : d.firstPersonItems.reason || '未支持'}；装备切换与完整使用动画待适配` : '',
      ...Object.entries((pendingMode === 'first' ? d?.firstPersonItems : d?.heldItems)?.hands ?? {}).map(([arm, hand]) =>
        `${arm === 'right' ? '右手' : '左手'}：${hand.name || '空或未同步'}；${hand.status}；${hand.visible ? '显示' : '未显示'}${hand.reason || hand.projection?.warning ? `；${hand.reason || hand.projection.warning}` : ''}${hand.glint?.available ? '；原版附魔流光' : hand.effectUnavailableReason ? `；${hand.effectUnavailableReason}` : ''}`),
      presentation.available ? '背包/菜单/技能：同一玩家原生状态；原生物品图标已接入，未支持的专用模型/组件及装备明确标注' : `展示数据：${presentation.reason}`,
      pendingMode === '3dview' ? '3D观战跟随相机；原遮挡切面、旋转、缩放已接入' : '',
      '小地图：本人原场景与移动轨迹；第三人称已接入原运镜设置', d?.audio?.available?'声音：原始资源与本人实际事件；观战配乐为本机选择':'声音：'+(d?.audio?.reason??'等待原版音效包'), '完整场景一致性尚未验收',
      ...(d?.issues ?? []).slice(0, 16)].filter(Boolean).join('\n')
  }
  for (const id of ['corti-night-vision-toggle']) {
    const button = el(id)
    if (button) { button.disabled = true; button.title = '对应原生接口未接入'; button.textContent = id.includes('night') ? '夜视 未支持' : id.includes('music') ? '音乐 未支持' : '音效 未支持' }
  }
  const soundStatus = q('[data-corti-audio-status]')
  const soundButton=el('corti-sound-toggle'),musicButton=el('corti-music-toggle'),soundTest=el('corti-sound-test'),musicPlay=el('corti-music-play')
  const updateAudio=value=>{
    for(const button of [soundButton,musicButton,soundTest,musicPlay])if(button)button.disabled=!value?.available
    if(soundButton){soundButton.textContent=!value?.unlocked?'音效 点击开启':value?.soundEnabled?'音效 开':'音效 关';soundButton.setAttribute('aria-pressed',String(value?.soundEnabled===true));soundButton.dataset.audioStarted=String(value?.started??0)}
    if(musicButton){musicButton.textContent=!value?.unlocked?'音乐 点击开启':!value?.musicEnabled?'音乐 关':value?.musicPlaying?'音乐 播放中':'音乐 待续播';musicButton.setAttribute('aria-pressed',String(value?.musicEnabled===true))}
    if(value?.volumes)for(const input of document.querySelectorAll('[data-corti-audio-volume]')){
      const volume=value.volumes[input.dataset.cortiAudioVolume];if(Number.isFinite(volume))input.value=String(volume)
    }
    if(soundTest){soundTest.textContent='试听原版音效';soundTest.title='只在本浏览器试听，不向游戏发送操作或消息'}
    if(musicPlay){musicPlay.textContent='切换下一首配乐';musicPlay.title='观战配乐自动续播，仅在本浏览器播放，不向游戏发出操作'}
    if(soundStatus)soundStatus.textContent=!value?.available?(value?.reason??'等待原版声音资源'):
      `原版声音已就绪 · ${value.soundEnabled?'游戏音效开启':'游戏音效关闭'} · ${value.unlocked?'浏览器声音已启用':'点击开启浏览器声音'} · 音效 ${Object.entries(value.byCategory??{}).filter(([key])=>!['music','records'].includes(key)).reduce((sum,[,n])=>sum+n,0)} 次 · 配乐 ${value.musicPlaying?'播放中':value.musicEnabled?'等待续播':'关闭'}${value.lastFailure?' · 最近播放失败：'+value.lastFailure.name+'（'+value.lastFailure.reason+'）':''}`
  }
  updateAudio(null)
  listen(soundButton,'click',()=>{void sceneHost?.audio?.toggle('effects')})
  listen(musicButton,'click',()=>{void sceneHost?.audio?.toggle('music')})
  listen(document,'pointerdown',()=>{const value=sceneHost?.audio?.state();if(value&&!value.unlocked&&(value.soundEnabled||value.musicEnabled))void sceneHost.audio.activate()})
  listen(soundTest,'click',()=>{void sceneHost?.audio?.preview()})
  listen(musicPlay,'click',()=>{void sceneHost?.audio?.playlist()})
  for(const input of document.querySelectorAll('[data-corti-audio-volume]'))listen(input,'input',()=>{sceneHost?.audio?.setVolume(input.dataset.cortiAudioVolume,Number(input.value))})
  const map = el('corti-minimap')
  if (map) map.hidden = true // Missing native map is disclosed in diagnostics, not an empty terrain panel.
  // Block old stylesheet URLs until NativeUiAssets installs verified pack URLs.
  style.textContent += '\n.corti-crosshair,.corti-hotbar,.corti-hotbar-selection,.corti-xp,.corti-xp-fill{background-image:none}'
  const switchView = (mode, reason = 'mode') => {
    const timing = transitionTiming.begin('mode', reason, mode)
    pendingMode = mode; sceneHost?.setView(mode)
    const selected = Object.entries(MODES).find(([, value]) => value === mode)?.[0]
    document.body.dataset.viewMode = selected
    for (const link of document.querySelectorAll('[data-view]')) {
      const active = MODES[link.dataset.view] === mode
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current')
    }
    const crosshair = q('.corti-crosshair'); if (crosshair) crosshair.hidden = mode !== 'first'
    const dungeonNav=q('.dungeon-camera-controls');if(dungeonNav)dungeonNav.hidden=mode!=='3dview'
    updateDiagnosticText()
    transitionTiming.finish(timing)
  }
  for (const link of document.querySelectorAll('[data-view]')) listen(link, 'click', event => {
    const mode = MODES[link.dataset.view]
    if (!mode || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault(); switchView(mode, 'click')
    if (link.getAttribute('href')) window.history?.replaceState(null, '', link.getAttribute('href'))
  })
  listen(document, 'keydown', event => {
    if (event.code !== 'F5' || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName) || event.target?.isContentEditable) return
    event.preventDefault(); switchView(pendingMode === 'first' ? 'third' : 'first', 'key')
  })
  const stopStatus = startStatus({ fetchStatus, expectedPlayer: () => identity?.player,
    onView: view => { if (!disposed) renderAgentStatus(view, el) } })
  const dispose = () => {
    if (disposed) return
    disposed = true; stopStatus(); layoutUi.dispose(); chatUi?.dispose(); galleryUi.dispose(); appearanceUi.dispose(); cameraUi.dispose(); sceneUi.dispose(); dungeonUi?.dispose();targets.remove();activityUi.dispose(); deathUi.dispose(); ui.dispose(); sceneHost?.dispose(); transitionTiming.dispose()
    for (const [target, event, callback] of listeners) target?.removeEventListener(event, callback)
    label.remove(); ysmNotice.remove(); stateBar.remove(); details.remove(); style.remove()
  }
  listen(window, 'pagehide', dispose)
  ui.reset(); switchView(pendingMode)
  try {
    sceneHost = await mount({ viewport, transitionTiming, mode: pendingMode, defaultAppearance, selectionStorage, selectionScope,
      onBuild:buildChanged,
      cameraSettings,onCameraManual:mode=>mode&&cameraUi.select?cameraUi.select(mode):cameraUi.manual(),
      onSelection:value=>{targetSelect.value=value?String(value.entityId):'';targetInfo.textContent=value?`${value.name} · #${value.entityId}${Number.isFinite(value.health)?' · 生命 '+value.health:''}`:'正在跟随 Agent 本人'},
      onIdentity (value) {
        if (disposed) return
        resetMessages()
        if(identity?.confirmed!==value?.confirmed||identity?.playerUuid!==value?.playerUuid||identity?.entityId!==value?.entityId||identity?.epoch!==value?.epoch){latestState=null;activityUi.reset()}
        identity=value;ui.setIdentity(value);deathUi.setIdentity(value);activityUi.setIdentity(value);updateDiagnosticText()
      },
      onState (value) {
        if (disposed) return
        if (value?.type === 'presentation') {
          latestState = { ...latestState, presentation: value.presentation }; ui.update(latestState)
        } else if (['fishingCatch','inventoryPreview','entityDamage','combatFeedback'].includes(value?.type)) ui.event(value)
        else { latestState = value; ui.update(value) }
        activityUi.update(latestState, { iconRevision: ui.getState().iconRevision })
        deathUi.update(latestState?.presentation)
        updateMessages(latestState)
        updateDiagnosticText()
      },
      onUnavailable (reason) {
        if (disposed) return
        latestState=null
        lastDiagnostics = null; appearanceUi.update(null)
        resetMessages()
        label.hidden = true; ui.reset(); deathUi.reset(); activityUi.reset(); boot.classList.add('is-compact','is-error'); boot.textContent = `原生画面不可用：${reason}`
        updateDiagnosticText()
        ysmNotice.hidden = true
      },
      onDiagnostics (value) {
        if (disposed) return
        lastDiagnostics = value; updateDiagnosticText()
        updateAudio(value.audio)
        const terrainReady = value.terrainWork?.committedCoverage?.epoch === identity?.epoch && value.terrainWork?.committedCoverage != null
        boot.classList.toggle('is-compact', terrainReady); boot.classList.remove('is-error')
        boot.textContent = terrainReady ? `原生模型 ${value.drawn}/${value.total} · 完整场景尚未验收`
          : value.terrainWork?.received ? '正在载入世界画面：正在准备原版地形与材质…' : '正在载入世界画面：等待角色地形…'
      },
      onActor (value, reason) { if (!disposed) ui.setActor(value, reason) },
      onMode (value) { if (!disposed) { pendingMode = value; updateDiagnosticText() } },
      onFrame: (()=>{const signatureFor=createTargetSignature();let lastCameraText=null;return function (frame) {
        if (disposed) return
        frames++
        if(frame.room)writeChanged(viewport.dataset,'roomVisibility',JSON.stringify(frame.room))
        const options=frame.entities??[],signature=signatureFor(options)
        if(signature!==targetSignature){
          targetSignature=signature;const value=targetSelect.value;targetSelect.replaceChildren()
          const own=append(document,targetSelect,'option','','Agent 本人');own.value=''
          for(const row of options){const option=append(document,targetSelect,'option','',`${row.name} · #${row.id}${row.rendered?'':'（模型未适配）'}`);option.value=String(row.id);option.disabled=!row.rendered}
          targetSelect.value=value
        }
        if(frame.camera){const text=`${({manual:'手动环绕',follow:'居中跟随',shoulder:'越肩跟随',front:'正面跟随',orbit:'自动环绕',overhead:'高位俯视',first:'第一人称','3dview':'3D观战'})[frame.camera.mode]??frame.camera.mode}${Number.isFinite(frame.camera.distance)?' · '+frame.camera.distance.toFixed(1)+' 格':''}${frame.camera.occluded?' · 避障中':''}`;if(text!==lastCameraText){lastCameraText=text;cameraUi.status(text)}}
        if (sampledAt === null) sampledAt = frame.now
        if (frame.now - sampledAt >= 1000) {
          const result = quality.sample({ fps: frames * 1000 / (frame.now - sampledAt), hidden: document.hidden })
          if (result.changed) sceneHost?.renderer?.setPixelRatio(result.pixelRatio)
          viewport.dataset.qualityMode = result.mode; viewport.dataset.fps = String(result.lastFps ?? '')
          if(sceneHost?.renderer?.domElement)sceneHost.renderer.domElement.style.filter=sceneColourFilter({},sceneSettings)
          sceneUi.status(`${({high:'精细',balanced:'均衡',performance:'省电'})[result.mode]??result.mode} · ${Math.round(result.lastFps??0)} FPS${pendingMode==='3dview'?' · '+(frame.room?.active?'遮挡切面已展开':'地形正常显示'):''}`)
          frames = 0; sampledAt = frame.now
        }
        if (frame.now - lastUiFrameAt < 1000 / 30) return
        lastUiFrameAt = frame.now
        writeChanged(label,'hidden',!frame.label?.visible)
        if (frame.label?.visible) {
          writeChanged(label,'textContent',frame.label.name); writeChanged(label.style,'left',`${frame.label.x}px`); writeChanged(label.style,'top',`${frame.label.y}px`)
        }
      }})()
    })
    if (disposed) { sceneHost.dispose(); return { dispose, ui, quality, get sceneHost () { return sceneHost } } }
    sceneHost.setView(pendingMode)
    switchView(pendingMode); layoutUi.adopt()
    sceneHost.setSceneSettings?.(sceneSettings)
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
