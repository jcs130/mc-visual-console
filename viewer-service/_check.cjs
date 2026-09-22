// Windows 侧自检：canvas 与 prismarine-viewer 能不能在这个平台 require 进来
try {
  const canvas = require('canvas')
  console.log('  canvas 可用 ✓', canvas.version || '(无版本号)', '| createCanvas:', typeof canvas.createCanvas)
} catch (e) {
  console.log('  canvas 不可用 ✗', String(e.message).slice(0, 110))
}
try {
  const pv = require('prismarine-viewer')
  let viewer = {}
  try { viewer = require('prismarine-viewer/viewer') } catch (e) { console.log('  viewer 子路径 ✗', String(e.message).slice(0, 80)) }
  const list = pv.supportedVersions || viewer.supportedVersions || []
  console.log('  prismarine-viewer 可用 ✓ | supportedVersions:', list.length, '| 含 1.21.11:', list.includes('1.21.11'), '| 含 1.21.4:', list.includes('1.21.4'))
  console.log('  支持的最近 6 个版本:', list.slice(-6).join(', '))
} catch (e) {
  console.log('  prismarine-viewer 不可用 ✗', String(e.message).slice(0, 110))
}
try {
  const assets = require('minecraft-assets')('1.21.4')
  console.log('  minecraft-assets(1.21.4) ✓', assets && assets.directory ? assets.directory.slice(-44) : '')
} catch (e) {
  console.log('  minecraft-assets(1.21.4) ✗', String(e.message).slice(0, 90))
}
