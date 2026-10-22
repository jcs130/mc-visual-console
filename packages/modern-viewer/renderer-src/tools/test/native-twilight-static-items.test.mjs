import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeStaticItemEvidence,nativeStaticItemState} from '../../src/native-viewer/native-static-item-providers.js';
test('only constructor-audited Twilight items enter the original JSON renderer',()=>{
  for(const name of ['steeleaf_sword','glass_sword','ironwood_ingot','naga_scale','magic_map']){
    const id='twilightforest:'+name,proof=nativeStaticItemEvidence(id);
    assert.equal(proof.source.sha256,'493da16d10210f9f53a3c33b3d8fcb4ae9b14016ee420d753c894562bd9aba35');
    assert.equal(nativeStaticItemState({id,count:1,components:{}}).evidence,proof);
  }
  for(const name of ['filled_magic_map','greater_potion_flask','mason_jar','ore_meter','travellers_boots']){
    assert.equal(nativeStaticItemEvidence('twilightforest:'+name),null);
  }
});
