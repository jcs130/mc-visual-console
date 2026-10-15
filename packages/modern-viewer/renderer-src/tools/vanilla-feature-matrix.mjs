// Exhaustive registry inventory, not a scene-completeness certificate.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {NATIVE_ENTITY_RENDER_TYPES} from '../src/native-viewer/native-entity-dispatch.js'
import {NATIVE_PROJECTILE_TYPES} from '../src/native-viewer/native-projectile-state.js'
import {NATIVE_THROWN_ITEM_TYPES} from '../src/native-viewer/native-thrown-item-state.js'
import {NATIVE_PARTICLE_TYPES} from '../src/native-viewer/native-particle-state.js'
import {NATIVE_VANILLA_GUIS} from '../src/native-viewer/native-vanilla-menus.js'
import {ORIGINAL_MODEL_LAYERS_SHA256} from '../src/native-viewer/native-original-model-layers.js'
const source=new URL('../../asset-packs/vanilla-1.21.1/assets/minecraft/native/client-model-layers.json',import.meta.url)
const target=new URL('../docs/vanilla-1.21.1-feature-matrix.md',import.meta.url)
const bytes=await readFile(source),sha=createHash('sha256').update(bytes).digest('hex')
assert.equal(sha,ORIGINAL_MODEL_LAYERS_SHA256)
const data=JSON.parse(bytes),registries=data.registries
const expected={entities:130,particles:109,blockEntities:44,menus:25}
for(const [key,count] of Object.entries(expected)){
  const rows=registries[key];assert.equal(rows.length,count)
  assert.equal(new Set(rows.map(r=>r.id)).size,count);assert.equal(new Set(rows.map(r=>r.name)).size,count)
  assert(rows.every(r=>Number.isInteger(r.id)&&/^minecraft:[a-z0-9_]+$/.test(r.name)))
}
const be=new Map(data.blockEntityRenderers.map(row=>[row.type,row]));assert.equal(be.size,44)
const entities=new Set([...NATIVE_ENTITY_RENDER_TYPES,...NATIVE_PROJECTILE_TYPES,...NATIVE_THROWN_ITEM_TYPES,'minecraft:item','minecraft:player'])
const particles=new Set([...NATIVE_PARTICLE_TYPES].map(name=>'minecraft:'+name))
const menus=new Set([...Object.keys(NATIVE_VANILLA_GUIS),'minecraft:crafting','minecraft:furnace','minecraft:smoker','minecraft:blast_furnace','minecraft:crafter_3x3',
  ...Array.from({length:6},(_,i)=>'minecraft:generic_9x'+(i+1))])
const lines=['# Complete vanilla 1.21.1 registry work list','',
  'Generated from the locked original client registry and the actual browser dispatch tables. Every registered row is retained, including types without an implementation. No common-type shortlist or unsupported-as-impossible classification is used.','',
  `Original census SHA-256: \`${sha}\`. Original client SHA-256: \`${data.clientJarSha256}\`.`,
  '',`Source census: 130 entities, 109 particles, 44 block entities and 25 menu types. Current registered paths: ${registries.entities.filter(r=>entities.has(r.name)).length} entity-type paths (including self-player only), ${registries.particles.filter(r=>particles.has(r.name)).length} particle paths and ${registries.menus.filter(r=>menus.has(r.name)).length} menu background/layout paths. **None of these counts measures complete rendering or Java parity.**`,
  '', 'A registered path can still lack variants, equipment, poses, animation, lighting or dedicated controls. Unknown metadata/components remain explicit errors. All unimplemented rows are implementation work until an actual connection-data limitation is demonstrated.',
  '', 'This registry list complements [the full port audit](mineflayer-port-coverage.md), which also tracks inventory operations, crafting, hands, cameras, routes, audio, world environment, item components and game events. Player inventory, horse inventory and book-use screens are not extra MenuType registrations; they must be checked separately. Modded registries require their own full inventory. Original geometry export alone does not satisfy any missing actor row.',
  '', 'Regenerate with `node tools/vanilla-feature-matrix.mjs`; verify with `node tools/vanilla-feature-matrix.mjs --check`.']
const table=(heading,key,status)=>{
  lines.push('',`## ${heading}`,'','| Native ID | Original registry name | Current implementation boundary |','| --- | --- | --- |')
  for(const row of [...registries[key]].sort((a,b)=>a.id-b.id))lines.push(`| ${row.id} | \`${row.name}\` | ${status(row)} |`)
}
table('Entities — all 130','entities',r=>r.name==='minecraft:player'?'Self-player path; other players and complete equipment/poses remain open':entities.has(r.name)?'Registered original actor path; complete appearance/animation remains open':'Browser actor implementation open')
table('Particles — all 109','particles',r=>particles.has(r.name)?'Registered original particle path; lightmap/scene parity remains open':'Browser particle implementation open')
table('Block entities — all 44','blockEntities',r=>{
  const original=be.get(r.name);assert(original)
  return r.name==='minecraft:bed'?'Dedicated original bed geometry path; full scene comparison remains open':original.hasRenderer?'Original base MODEL where applicable; dedicated additional renderer remains open':'Original registration has no additional renderer; received MODEL path applies'
})
table('Menu types — all 25','menus',r=>r.name==='minecraft:crafter_3x3'?'46 original slots, received disable/power state; Web interaction/Java parity remains open':menus.has(r.name)?'Original background/slot path; dedicated controls/previews/Java parity remain open':'Lectern book screen implementation open')
const rendered=lines.join('\n')+'\n'
if(process.argv.includes('--check'))assert.equal((await readFile(target,'utf8')).replaceAll('\r\n','\n'),rendered,'Registry work list is stale; regenerate without dropping rows')
else await writeFile(target,rendered)
console.log(JSON.stringify({originalRegistrySha256:sha,rows:expected,completeSceneParity:false,checked:process.argv.includes('--check')}))
