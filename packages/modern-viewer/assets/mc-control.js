/**
 * 现代画面上的「点地走 + 寻路轨迹」。
 *
 * 注入到画面自己的页面里（同源）：既读得到它挂在全局的世界（globalThis.world.camera 等），
 * 也能同源 fetch 我们的控制口。**不改它那份 11MB 产物**：
 *   · 射线：用相机自己的 matrixWorld / projectionMatrixInverse（都是它现成的）；
 *   · 求交与寻路：交给服务端（它手里有 bot 与世界）；
 *   · 轨迹：把服务端回的路径点用同一个相机投影回屏幕，画在一张覆盖层上。
 *
 * 两个实现要点（都踩过）：
 *   1. 画面的 canvas 在 shadow root 里 —— document.getElementById 找不到它 ✗，
 *      所以点击用文档级监听 + composedPath()[0] 判断"点到的是不是画布"；
 *   2. 自报不依赖画布元素，直接写 document.documentElement.dataset（外部用 html 的属性就能核）。
 */
(function () {
  'use strict'

  var ENDPOINT = '/mc-control'
  // 控制台的 sessionId 由画面页的 URL 透传进来（?sid=…）——服务端据此确认请求者就是持有者
  var SID = ''
  try { SID = new URLSearchParams(location.search).get('sid') || '' } catch (e) { /* ignore */ }
  var path = []
  var target = null
  var status = '启动中'
  var overlay = null
  var octx = null
  var lastCanvas = null
  var lastSentAt = 0

  // ---------- 找画布（穿透 shadow root） ----------

  function findCanvas(root, depth) {
    depth = depth || 0
    if (depth > 6 || !root) return null
    var list = root.querySelectorAll ? root.querySelectorAll('canvas') : []
    for (var i = 0; i < list.length; i++) {
      var c = list[i]
      if (c.clientWidth > 200 && c.clientHeight > 120) return c
    }
    var all = root.querySelectorAll ? root.querySelectorAll('*') : []
    for (var j = 0; j < all.length && j < 4000; j++) {
      var sr = all[j].shadowRoot
      if (sr) {
        var found = findCanvas(sr, depth + 1)
        if (found) return found
      }
    }
    return null
  }

  function canvasNow() {
    if (lastCanvas && lastCanvas.isConnected && lastCanvas.clientWidth > 200) return lastCanvas
    lastCanvas = findCanvas(document, 0)
    return lastCanvas
  }

  // ---------- 数学 ----------

  function els(m) {
    return m && m.elements && m.elements.length === 16 ? m.elements : null
  }

  function mul4(m, v) {
    return [
      m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3],
      m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3],
      m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3],
      m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3],
    ]
  }

  function norm3(v) {
    var n = Math.hypot(v[0], v[1], v[2]) || 1
    return [v[0] / n, v[1] / n, v[2] / n]
  }

  function camera() {
    var w = window.world || globalThis.world
    return w && w.camera ? w.camera : null
  }

  /** bot 在画面自己的局部坐标里（相机与它同帧）；拿不到就返回 null。 */
  function localBot() {
    try {
      var w = window.world || globalThis.world
      var e = w && w.entities
      var self = e && e.playerEntity
      var p = self && self.position
      if (p && isFinite(p.x) && isFinite(p.y) && isFinite(p.z)) return [p.x, p.y, p.z]
      var all = e && e.entities
      if (all) {
        for (var id in all) {
          var ent = all[id]
          var q = ent && ent.position
          if (ent && ent.isSelf === true && q) return [q.x, q.y, q.z]
        }
      }
    } catch (err) { /* ignore */ }
    return null
  }

  /**
   * 锚点：实体的局部坐标 + id。两边的实体 id 是同一套（都来自同一台 MC 服务器），
   * 所以服务端拿自己的世界坐标对账就能算出「局部帧 → 世界」的平移量，不必去猜场景平移。
   */
  function entityAnchors(limit) {
    var out = []
    try {
      var w = window.world || globalThis.world
      var all = w && w.entities && w.entities.entities
      if (!all) return out
      for (var id in all) {
        var p = all[id] && all[id].position
        if (!p || !isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) continue
        out.push({ id: String(id), p: [p.x, p.y, p.z] })
        if (out.length >= (limit || 12)) break
      }
    } catch (err) { /* ignore */ }
    return out
  }

  function project(p, cam, w, h) {
    var v = els(cam.matrixWorldInverse)
    var pm = els(cam.projectionMatrix)
    if (!v || !pm) return null
    var c = mul4(pm, mul4(v, [p[0], p[1], p[2], 1]))
    if (!(c[3] > 1e-6)) return null
    return [(c[0] / c[3] * 0.5 + 0.5) * w, (1 - (c[1] / c[3] * 0.5 + 0.5)) * h]
  }

  function rayFromScreen(sx, sy, w, h) {
    var cam = camera()
    if (!cam) return null
    var pi = els(cam.projectionMatrixInverse)
    var mw = els(cam.matrixWorld)
    if (!pi || !mw) return null
    var ndcX = (sx / w) * 2 - 1
    var ndcY = 1 - (sy / h) * 2
    var a = mul4(pi, [ndcX, ndcY, -1, 1])
    if (!(Math.abs(a[3]) > 1e-9)) return null
    var dirCam = norm3([a[0] / a[3], a[1] / a[3], a[2] / a[3]])
    return {
      origin: [mw[12], mw[13], mw[14]],
      dir: norm3(mul4(mw, [dirCam[0], dirCam[1], dirCam[2], 0])),
    }
  }

  // ---------- 自报（外部可核） ----------

  function report() {
    try {
      var d = document.documentElement.dataset
      d.mcStatus = status
      d.mcTarget = target ? target.join(',') : ''
      d.mcPathNodes = String(path.length)
      d.mcCamera = camera() ? 'yes' : 'no'
      d.mcCanvas = canvasNow() ? 'yes' : 'no'
    } catch (e) { /* ignore */ }
  }

  // ---------- 覆盖层与绘制 ----------

  function ensureOverlay() {
    if (overlay && overlay.isConnected) return true
    overlay = document.createElement('canvas')
    overlay.id = 'mc-path-overlay'
    overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483000;left:0;top:0'
    ;(document.body || document.documentElement).appendChild(overlay)
    octx = overlay.getContext('2d')
    return true
  }

  function draw() {
    try {
      var cam = camera()
      var c = canvasNow()
      if (ensureOverlay() && c) {
        var r = c.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) {
          if (overlay.width !== Math.round(r.width) || overlay.height !== Math.round(r.height)) {
            overlay.width = Math.round(r.width)
            overlay.height = Math.round(r.height)
          }
          overlay.style.left = r.left + 'px'
          overlay.style.top = r.top + 'px'
          overlay.style.width = r.width + 'px'
          overlay.style.height = r.height + 'px'
          octx.clearRect(0, 0, overlay.width, overlay.height)
          var w = r.width
          var h = r.height

          if (cam && path.length > 1) {
            octx.lineWidth = 3
            octx.strokeStyle = 'rgba(76,154,90,0.95)'
            octx.beginPath()
            var started = false
            for (var i = 0; i < path.length; i++) {
              var s = project([path[i][0] + 0.5, path[i][1] + 0.06, path[i][2] + 0.5], cam, w, h)
              if (!s) { started = false; continue }
              if (!started) { octx.moveTo(s[0], s[1]); started = true } else { octx.lineTo(s[0], s[1]) }
            }
            octx.stroke()
            octx.fillStyle = 'rgba(223,245,225,0.9)'
            for (var j = 0; j < path.length; j++) {
              var sp = project([path[j][0] + 0.5, path[j][1] + 0.1, path[j][2] + 0.5], cam, w, h)
              if (!sp) continue
              octx.beginPath()
              octx.arc(sp[0], sp[1], 2.2, 0, Math.PI * 2)
              octx.fill()
            }
          }
          if (cam && target) {
            var t = project([target[0] + 0.5, target[1] + 0.08, target[2] + 0.5], cam, w, h)
            if (t) {
              octx.lineWidth = 2.5
              octx.strokeStyle = 'rgba(210,153,34,0.95)'
              octx.beginPath()
              octx.arc(t[0], t[1], 12, 0, Math.PI * 2)
              octx.stroke()
            }
          }
        }
      }
    } catch (e) { /* 画面启动期静默 */ }
    window.setTimeout(function () { window.requestAnimationFrame(draw) }, 40)
  }

  // ---------- 点击 ----------

  function isCanvasTarget(ev) {
    try {
      var t = ev.composedPath ? ev.composedPath()[0] : ev.target
      return !!t && String(t.tagName || '').toUpperCase() === 'CANVAS'
    } catch (e) {
      return false
    }
  }

  function onClick(ev) {
    if (!isCanvasTarget(ev)) return
    var cam = camera()
    if (!cam) { status = '相机未就绪'; report(); return }
    var c = (ev.composedPath && ev.composedPath()[0]) || canvasNow()
    if (!c) { status = '找不到画布'; report(); return }
    var r = c.getBoundingClientRect()
    var ray = rayFromScreen(ev.clientX - r.left, ev.clientY - r.top, r.width, r.height)
    if (!ray) { status = '算不出射线'; report(); return }
    if (Date.now() - lastSentAt < 400) return
    lastSentAt = Date.now()
    status = '已派发…'
    // 相机原点在画面的局部帧里；锚点交给服务端对账出平移量（camOrigin + anchors）。
    var anchors = entityAnchors(12)
    var payload = { dir: ray.dir, camOrigin: ray.origin, anchors: anchors }
    try {
      var d = document.documentElement.dataset
      d.mcAnchors = String(anchors.length)
      d.mcCamOrigin = ray.origin.map(function (v) { return v.toFixed(2) }).join(',')
      d.mcDir = ray.dir.map(function (v) { return v.toFixed(3) }).join(',')
      if (anchors.length > 0) {
        d.mcAnchor0 = anchors[0].id + '@' + anchors[0].p.map(function (v) { return v.toFixed(2) }).join(',')
      }
    } catch (e) { /* ignore */ }
    report()
    fetch(ENDPOINT + (SID ? '?sid=' + encodeURIComponent(SID) : ''), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (res) { return res.json() })
      .then(function (out) {
        if (out && out.ok) {
          target = out.target || null
          path = Array.isArray(out.path) ? out.path : []
          status = path.length > 1 ? '寻路 ' + path.length + ' 步' : '已派发（无轨迹）'
        } else {
          status = '失败：' + ((out && out.error) || '未知')
        }
        report()
      })
      .catch(function (err) {
        status = '请求失败：' + (err && err.message ? err.message : err)
        report()
      })
  }

  function hook() {
    document.addEventListener('click', onClick, true)
    status = '已就绪（点地面走，轨迹会画出来）'
    report()
    window.requestAnimationFrame(draw)
    // 相机/画布晚到：先自报一次，之后每次绘制都会再报
    window.setInterval(report, 1500)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook)
  else hook()
})()
