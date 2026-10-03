import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

// Isolated, read-only asset/motion acceptance tool. No game controls, credentials,
// new Minecraft observer account, LAN listener or production viewer replacement.
const [assetDirectory, captureFile, portString = '28982'] = process.argv.slice(2)
if (!assetDirectory || !captureFile) throw Error('Usage: node tools/serve-native-create-preview.mjs <native-assets-dir> <capture.json> [loopback-port]')
const port = Number(portString)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('INVALID_PORT')
const root = await fs.realpath(assetDirectory)
const manifest = JSON.parse(await fs.readFile(path.join(root, 'native-assets.json'), 'utf8'))
const captureBytes = await fs.readFile(captureFile)
if (captureBytes.length > 4 * 1024 * 1024) throw Error('NATIVE_CAPTURE_TOO_LARGE')
const capture = JSON.parse(captureBytes)
if (capture.kind !== 'native_create_capture' || capture.schemaVersion !== 1 || capture.errors?.length || capture.registrySha256 !== manifest.registryHashes['block-states.jsonl']) throw Error('NATIVE_CAPTURE_INVALID')
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/native-viewer')
const bundle = (await build({ entryPoints: [path.join(source, 'create-preview.js')], bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022' })).outputFiles[0].contents
const page = await fs.readFile(path.join(source, 'create-preview.html'))
const manifestBytes = Buffer.from(JSON.stringify(manifest))
const server = http.createServer(async (request, response) => {
  try {
    const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])
    if (!allowedHosts.has(request.headers.host) || (request.headers.origin && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(request.headers.origin))) { response.writeHead(403); response.end(); return }
    if (request.method !== 'GET') { response.writeHead(405); response.end(); return }
    const requestPath = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${port}`).pathname).slice(1)
    let bytes, type
    if (!requestPath) { bytes = page; type = 'text/html; charset=utf-8' }
    else if (requestPath === 'client.js') { bytes = bundle; type = 'text/javascript; charset=utf-8' }
    else if (requestPath === 'manifest.json') { bytes = manifestBytes; type = 'application/json' }
    else if (requestPath === 'capture.json') { bytes = captureBytes; type = 'application/json' }
    else if (Object.hasOwn(manifest.assets, requestPath) && !requestPath.split('/').some(p => ['', '.', '..'].includes(p))) {
      const file = await fs.realpath(path.join(root, requestPath))
      if (!file.startsWith(`${root}${path.sep}`)) throw Error('NATIVE_ASSET_PATH_ESCAPE')
      bytes = await fs.readFile(file)
      type = file.endsWith('.png') ? 'image/png' : file.endsWith('.json') || file.endsWith('.mcmeta') ? 'application/json' : 'application/octet-stream'
    } else { response.writeHead(404); response.end(); return }
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; img-src 'self' blob:; style-src 'unsafe-inline'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'" })
    response.end(bytes)
  } catch (error) { response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end(error.message) }
})
server.listen(port, '127.0.0.1', () => console.log(`Native Create acceptance preview: http://127.0.0.1:${port}/ (recorded data, not a complete live world viewer)`))
process.on('SIGINT', () => server.close(() => process.exit(0)))
process.on('SIGTERM', () => server.close(() => process.exit(0)))
