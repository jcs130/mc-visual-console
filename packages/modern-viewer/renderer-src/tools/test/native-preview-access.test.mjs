import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nativePreviewAccess } from '../native-preview-access.mjs'
const request = (peer, host, origin) => ({ socket: { remoteAddress: peer }, headers: { host, ...(origin === undefined ? {} : { origin }) } })
test('default preview remains loopback and refuses LAN/DNS rebinding hosts', () => {
  const access = nativePreviewAccess()
  assert.equal(access.listenHost, '127.0.0.1')
  assert(access.allowsRequest(request('127.0.0.1', 'localhost:28984'), 28984))
  assert.equal(access.allowsRequest(request('192.168.3.12', 'localhost:28984'), 28984), false)
  assert.equal(access.allowsRequest(request('127.0.0.1', 'evil.example:28984'), 28984), false)
})
test('explicit LAN allows home subnet, exact hosts and matching origins only', () => {
  const access = nativePreviewAccess('192.168.3.163')
  assert.equal(access.listenHost, '0.0.0.0')
  for (const peer of ['127.0.0.1', '::ffff:192.168.3.12']) assert(access.allowsRequest(request(peer, '192.168.3.163:28984', 'http://192.168.3.163:28984'), 28984))
  for (const [peer, host, origin] of [
    ['192.168.4.12', '192.168.3.163:28984'], ['8.8.8.8', '192.168.3.163:28984'],
    ['192.168.3.12', 'evil.example:28984'], ['192.168.3.12', '192.168.3.163:28984', 'https://evil.example'],
    ['192.168.3.12', '192.168.3.163:28985'], ['::1', '[::1]:28984']
  ]) assert.equal(access.allowsRequest(request(peer, host, origin), 28984), false)
})
test('preview LAN configuration accepts private hosts and refuses public/broadcast/broad input', () => {
  for (const value of ['10.1.2.3', '172.16.2.3', '192.168.3.163']) assert.equal(nativePreviewAccess(value).listenHost, '0.0.0.0')
  for (const value of ['0.0.0.0', '8.8.8.8', '127.0.0.1', '192.168.3.0', '192.168.3.255', '192.168.3.1/24', {}]) assert.throws(() => nativePreviewAccess(value), /NATIVE_VIEWER_LAN_ADDRESS_INVALID/)
})
