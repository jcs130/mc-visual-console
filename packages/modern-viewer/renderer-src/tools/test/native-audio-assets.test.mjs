import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {tmpdir} from 'node:os'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {loadNativeAudioPack,VANILLA_AUDIO_NATIVE_REGISTRIES} from '../../host/native-audio-assets.mjs'

const pack=fileURLToPath(new URL('../../../asset-packs/java-1.21.1-sounds/',import.meta.url))
const registries={nativeRegistrySha256:VANILLA_AUDIO_NATIVE_REGISTRIES.blocks,entityRegistrySha256:VANILLA_AUDIO_NATIVE_REGISTRIES.entities}
test('original 1.21.1 source chain and numeric IDs are usable only for the matched native registries',async()=>{
  const audio=await loadNativeAudioPack(pack,registries)
  assert.equal(audio.available,true,audio.metadata.reason);assert.equal(audio.metadata.numericRegistryAvailable,true)
  assert.equal(Object.keys(audio.registry.sounds).length,1611);assert.equal(Object.keys(audio.metadata.files).length,3707)
  const bytes=await audio.read('random/click.ogg')
  assert.equal(createHash('sha256').update(bytes).digest('hex'),audio.metadata.files['random/click.ogg'].sha256)
  await assert.rejects(audio.read('../private.ogg'),/FILE_NOT_EXPORTED/)
  const modded=await loadNativeAudioPack(pack,{...registries,nativeRegistrySha256:'a'.repeat(64)})
  assert.equal(modded.available,true);assert.equal(modded.metadata.numericRegistryAvailable,false)
  assert.deepEqual(modded.registry,{sounds:{}},'never alias modded registry IDs to vanilla sound names')
  assert.equal(audio.metadata.completeAudioParityVerified,false)
})
test('missing, altered source, incomplete tables and corrupt original OGG bytes fail closed',async t=>{
  const root=await fs.mkdtemp(path.join(tmpdir(),'native-audio-proof-'))
  t.after(async()=>{assert.ok(path.basename(root).startsWith('native-audio-proof-'));await fs.rm(root,{recursive:true,force:true})})
  assert.equal((await loadNativeAudioPack(root,registries)).metadata.reason,'NATIVE_AUDIO_ORIGINAL_PACK_MISSING')
  const sounds=path.join(root,'public/sounds');await fs.mkdir(sounds,{recursive:true})
  for(const file of ['source-index.json','source-sounds.json','registry.json','manifest.json'])await fs.copyFile(path.join(pack,'public/sounds',file),path.join(sounds,file))
  const manifest=JSON.parse(await fs.readFile(path.join(sounds,'manifest.json'),'utf8'))
  delete manifest.files['random/click.ogg'];await fs.writeFile(path.join(sounds,'manifest.json'),JSON.stringify(manifest))
  assert.equal((await loadNativeAudioPack(root,registries)).metadata.reason,'NATIVE_AUDIO_FILE_TABLE_INCOMPLETE')
  await fs.copyFile(path.join(pack,'public/sounds/manifest.json'),path.join(sounds,'manifest.json'))
  await fs.mkdir(path.join(sounds,'random'));await fs.writeFile(path.join(sounds,'random/click.ogg'),'corrupted')
  const valid=await loadNativeAudioPack(root,registries);assert.equal(valid.available,true)
  await assert.rejects(valid.read('random/click.ogg'),/FILE_INTEGRITY_MISMATCH/)
  await fs.appendFile(path.join(sounds,'source-sounds.json'),' ')
  assert.equal((await loadNativeAudioPack(root,registries)).metadata.reason,'NATIVE_AUDIO_ORIGINAL_SOURCE_MISMATCH')
})
