import test from 'node:test'
import assert from 'node:assert/strict'
import {NATIVE_BASE_PRIORITY_RULE, NATIVE_BASE_TEXTURE_PRIORITY, verifiedNativeBasePriority} from '../../src/native-viewer/native-resource-priority.js'
const CLIENT='499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99'
const DOMUM='04c0c902bdbcbd48e38bee5a323907ae0b7b7db4ff4a3e4da7c45334b65610a1'
function fixture(client='1.21.1.jar',neo='21.1.250') {
  const name='assets/minecraft/textures/block/oak_planks.png',hashes=NATIVE_BASE_TEXTURE_PRIORITY[name]
  const sources=[{name:client,sha256:CLIENT},{name:'domum-ornamentum-1.0.231-main.jar',sha256:DOMUM},{name:`neoforge-${neo}-universal.jar`,sha256:neo==='21.1.250'?'1f9cc68fe9ec0416475d34ce76e95a696b9721d5d338168563dab0632c3d2956':'90a56f70425711b4e1a4b94ff0c2904ae9f6d74ca6478b3b2152ac794a07b8e5'}]
  const entry={priorityResolution:NATIVE_BASE_PRIORITY_RULE,source:sources[1].name,sha256:hashes[1],bytes:123,variants:[{source:client,sha256:hashes[0],bytes:100},{source:sources[1].name,sha256:hashes[1],bytes:123}]}
  return {manifest:{clientJarSha256:CLIENT,sources},name,entry}
}
for(const neo of ['21.1.248','21.1.250'])for(const filename of ['1.21.1.jar','minecraft-1.21.1-client.jar'])test(`audited exact ${neo} accepts identical client bytes named ${filename}`,()=>{
  const {manifest,name,entry}=fixture(filename,neo);assert.equal(verifiedNativeBasePriority(manifest,name,entry),true)
})
test('changed platform, duplicate client, third variant and explicit user overrides stay closed',()=>{
  for(const edit of [v=>{v.manifest.sources[2].sha256='0'.repeat(64)},v=>{v.manifest.sources.push({...v.manifest.sources[0],name:'duplicate.jar'})},v=>{v.entry.variants.push({source:'third.jar'})},v=>{v.manifest.sources.push({name:'user.zip',explicitOverride:true})},v=>{v.entry.variants[0].sha256='0'.repeat(64)}]) {
    const v=fixture();edit(v);assert.equal(verifiedNativeBasePriority(v.manifest,v.name,v.entry),false)
  }
})
