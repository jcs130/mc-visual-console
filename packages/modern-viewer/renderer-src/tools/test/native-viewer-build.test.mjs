import test from 'node:test'
import assert from 'node:assert/strict'
import {renderViewerPage} from '../../src/viewer-page.mjs'
import {nativeViewerBuildSignature,withNativeViewerBuild,createNativeViewerBuildGuard} from '../../src/native-viewer/native-viewer-build.js'
const source='a'.repeat(64),manifest='b'.repeat(64),build=nativeViewerBuildSignature(source,manifest)

test('all native routes bind the loaded page to the exact renderer and asset pair',()=>{
  for(const mode of ['first','third','dungeon'])for(const basePath of ['/','/native/']){
    const html=withNativeViewerBuild(renderViewerPage(mode,{basePath}),build)
    assert(html.includes('<meta name="native-viewer-build" content="'+build+'">'))
    assert(html.includes('href="'+basePath+'third/"'))
    assert.equal((html.match(/name="native-viewer-build"/g)||[]).length,1)
  }
  assert.throws(()=>nativeViewerBuildSignature('javascript:alert(1)',manifest),/BUILD_INVALID/)
  assert.throws(()=>withNativeViewerBuild('<head></head>','"><script>'),/PAGE_INVALID/)
})

test('worker reconnect does not reload; renderer or asset change reloads the same page once',()=>{
  for(const next of [nativeViewerBuildSignature('c'.repeat(64),manifest),nativeViewerBuildSignature(source,'d'.repeat(64))]){
    let calls=0;const guard=createNativeViewerBuildGuard(build,()=>calls++)
    for(let n=0;n<10;n++)assert.equal(guard(build),false)
    assert.equal(calls,0);assert.equal(guard(next),true);assert.equal(calls,1)
    for(let n=0;n<10;n++)guard(next)
    assert.equal(calls,1)
  }
})

test('legacy pages can adopt their first valid identity and malformed markers cannot trigger refresh',()=>{
  let calls=0;const guard=createNativeViewerBuildGuard(null,()=>calls++)
  for(const value of [null,undefined,'','https://other.test/','a'.repeat(300)])assert.equal(guard(value),false)
  assert.equal(guard(build),false);assert.equal(calls,0)
  assert.equal(guard(nativeViewerBuildSignature('c'.repeat(64),manifest)),true);assert.equal(calls,1)
})
