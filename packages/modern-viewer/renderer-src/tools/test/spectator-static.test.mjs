import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import { WebSocketServer } from 'ws'
import { loadSpectatorSite } from '../../host/spectator-site.mjs'
import { createSpectatorRelay, spectatorContentEncoding } from '../../host/spectator-relay.mjs'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const get = url => new Promise((resolve, reject) => {
  const request = http.get(url.url, { headers: url.headers ?? {} }, response => {
    const data = []; response.on('data', row => data.push(row)); response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, bytes: Buffer.concat(data) }))
  }); request.on('error', reject)
})
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'spectator-static-'))
  const manifest = { schemaVersion: 1, protocol: 'mc-spectator/1', files: {} }, data = new Map()
  for (const name of ['client.js', 'native-console.js', 'viewer.css', 'first.html', 'third.html', '3dview.html']) {
    const bytes = Buffer.from(name.endsWith('.html') ? '<html><head><base href="/__mc_spectator_base__/"><link href="/__mc_spectator_base__/viewer.css"></head><script type="module" src="/__mc_spectator_base__/index.js"></script></html>' : '/* 原始应用代码 */\n'.repeat(2000))
    await fs.writeFile(path.join(directory, name), bytes); data.set(name, bytes); manifest.files[name] = { bytes: bytes.length, sha256: hash(bytes) }
  }
  await fs.writeFile(path.join(directory, 'spectator-site.json'), JSON.stringify(manifest))
  const site = await loadSpectatorSite(directory), relay = createSpectatorRelay({ WebSocketServer, site, authorizeViewer: () => { throw Error('private') }, authorizePublisher: () => { throw Error('private') } })
  const server = http.createServer((req, res) => { void relay.http(req, res).then(handled => { if (!handled) { res.writeHead(404); res.end() } }) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { await relay.close(); await new Promise(resolve => server.close(resolve)); assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir())); await fs.rm(directory, { recursive: true, force: true }) })
  return { site, data, manifest, origin: 'http://127.0.0.1:' + server.address().port }
}
test('compression negotiation honors quality, explicit refusal, wildcards and legacy identity', () => {
  for (const [header, wanted] of [[undefined, 'identity'], ['gzip, br', 'br'], ['gzip;q=1, br;q=.5', 'gzip'], ['br;q=0, gzip', 'gzip'], ['*;q=0', null], ['br;q=bad, gzip;q=0, identity;q=0', null], ['*;q=0.8, identity;q=0', 'br']]) assert.equal(spectatorContentEncoding(header), wanted)
})
test('trusted immutable scripts share one hash URL across roles; role pages, CSS and game resources stay scoped', async t => {
  const f = await fixture(t), build = 'a'.repeat(64) + ':' + 'b'.repeat(64)
  const a = f.site.page('/watch/role-a/', build, 'third').toString(), b = f.site.page('/watch/role-b/', build, 'third').toString()
  const script = '/watch/_static/' + f.manifest.files['native-console.js'].sha256 + '/native-console.js'
  assert.deepEqual(f.site.preload(), [script], 'the shell can preload only exact trusted application code before a private scene starts')
  assert.throws(() => f.site.preload('https://untrusted.example'), /SPECTATOR_PAGE_INVALID/)
  assert.ok(a.includes(script) && b.includes(script)); assert.ok(a.includes('/watch/role-a/viewer.css'))
  assert.equal((await get({ url: f.origin + script })).status, 200)
  for (const resource of ['status.json', 'events', 'api/server-appearance/assets/' + 'a'.repeat(64) + '.json', 'assets/minecraft/test.png', 'native-console.js']) {
    assert.equal((await get({ url: f.origin + '/watch/role-a/' + resource })).status, 403)
    assert.equal((await get({ url: f.origin + '/watch/_static/' + 'a'.repeat(64) + '/' + resource })).status, 404)
  }
  assert.equal((await get({ url: f.origin + script + '?token=secret' })).status, 404)
})
test('precompressed Brotli/gzip retain exact application bytes and support bounded cache revalidation', async t => {
  const f = await fixture(t), file = 'client.js', url = f.origin + '/watch/_static/' + f.manifest.files[file].sha256 + '/' + file
  for (const encoding of ['br', 'gzip', 'identity']) {
    const reply = await get({ url, headers: { 'accept-encoding': encoding } })
    assert.equal(reply.status, 200); assert.match(reply.headers['cache-control'], /public.*immutable/); assert.equal(reply.headers.vary, 'Accept-Encoding')
    const unpacked = encoding === 'br' ? brotliDecompressSync(reply.bytes) : encoding === 'gzip' ? gunzipSync(reply.bytes) : reply.bytes
    assert.deepEqual(unpacked, f.data.get(file)); if (encoding !== 'identity') assert.ok(reply.bytes.length < unpacked.length / 10)
    assert.equal((await get({ url, headers: { 'if-none-match': reply.headers.etag, 'accept-encoding': encoding } })).status, 304)
  }
  assert.equal((await get({ url, headers: { 'accept-encoding': '*;q=0' } })).status, 406)
})
