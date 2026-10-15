import { build } from 'esbuild'
import { mkdir, writeFile, access } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadBundledAppearances } from '../host/native-bundled-appearances.mjs'
import { viewerSourceDigest } from './viewer-build-source.mjs'

const [catalog, output] = process.argv.slice(2)
if(!catalog || !output) throw Error('Usage: node tools/build-native-ysm-review.mjs <original-catalog> <new-output-directory>')
const directory = path.resolve(output), root = fileURLToPath(new URL('../', import.meta.url))
if(await access(directory).then(() => true, () => false)) throw Error('Output must be a new directory; existing source/live artifacts are never overwritten')
const bundle = await loadBundledAppearances(catalog)
if(!bundle.metadata.available) throw Error(bundle.metadata.reason)
await mkdir(directory, { recursive: true })
const require = createRequire(import.meta.url), threeRoot = path.dirname(path.dirname(require.resolve('three')))
const result = await build({ absWorkingDir: root,
  entryPoints: { 'world-preview': 'src/native-viewer/world-preview.js', 'native-console': 'src/native-viewer/native-console.js', 'ysm-review': 'tools/fixtures/native-bundled-ysm-review.js' },
  outdir: directory, bundle: true, platform: 'browser', format: 'esm', target: 'es2022', metafile: true,
  plugins: [{ name: 'native-single-three', setup(builder) { builder.onResolve({ filter: /^three$/ }, () => ({ path: path.join(threeRoot, 'build/three.module.js') })) } }], write: false })
for(const input of Object.keys(result.metafile.inputs)) {
  const absolute = path.resolve(root, input)
  if(/[\\/]node_modules[\\/]three[\\/]/.test(absolute) && !absolute.startsWith(threeRoot + path.sep)) throw Error('NATIVE_WORLD_DUPLICATE_THREE')
}
const hashes = {}
for(const file of result.outputFiles) { await writeFile(file.path, file.contents); hashes[path.basename(file.path)] = createHash('sha256').update(file.contents).digest('hex') }
await writeFile(path.join(directory, 'catalog.json'), JSON.stringify(bundle.metadata))
for(const name of Object.keys(bundle.metadata.assets)) { const target = path.join(directory, 'assets', name); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bundle.read(name)) }
await writeFile(path.join(directory, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Original YUI synthetic review</title>
<style>body{font:16px system-ui;background:#dfe8ef;color:#18212a;margin:24px}main{display:flex;gap:24px}output{white-space:pre-wrap;max-width:600px;font:12px monospace}canvas{border:1px solid #728493}label{margin-right:16px}</style>
<h1>Original YUI · synthetic state fixtures</h1><p>Uses the production bundled actor. Synthetic state; no game connection, held-item fixture or Java pixel-parity claim.</p>
<label>State <select>${['idle','walk','run','sneak','jump','swim','swim_stand','death','use','swing'].map(s => '<option'+(s==='walk'?' selected':'')+'>'+s+'</option>').join('')}</select></label>
<label>Heading <select id="heading"><option value="0">Away / north</option><option value="3.141592653589793">Front / south</option></select></label>
<label>Seconds <input id="time" type="range" min="0" max="5" step="0.01" value="0"></label><button id="play">Play / pause</button>
<main><output></output></main><script type="module" src="./ysm-review.js"></script>`)
const evidence = { source: await viewerSourceDigest(root), bundles: hashes, originalCatalogSha256: bundle.sha256, synthetic: true }
await writeFile(path.join(directory, 'build-evidence.json'), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence, null, 2))
