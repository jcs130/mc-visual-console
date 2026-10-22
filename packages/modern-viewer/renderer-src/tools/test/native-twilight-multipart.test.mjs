import test from 'node:test'
import assert from 'node:assert/strict'
import {twilightMultipartFrame,TWILIGHT_MULTIPART_SOURCE} from '../../host/native-twilight-multipart.mjs'
const entity=()=>({entityId:100,uuid:'00000000-0000-0000-0000-000000000100',name:'twilightforest:naga'})
const packet=(x=1,metadata=[])=>({entityId:100,sourceJarSha256:TWILIGHT_MULTIPART_SOURCE,sourceChannel:'twilightforest:update_multipart_entity',parts:[{entityId:101,position:{x,y:64,z:-3},yaw:180,pitch:0,width:2,height:2,fixed:false,metadata}]})
test('real multipart dirty patches retain prior metadata while storing absolute previous/current positions',()=>{
  const e=entity(),first=packet(1,[{key:8,type:'boolean',value:true}]);e.multipart=twilightMultipartFrame(e,first,{observedAt:100,sequence:1})
  const second=twilightMultipartFrame(e,packet(2),{observedAt:150,sequence:2})
  assert.equal(second.parentUuid,e.uuid);assert.deepEqual(second.parts[0].metadata,first.parts[0].metadata)
  assert.deepEqual(second.parts[0].previous.position,{x:1,y:64,z:-3});assert.equal(second.parts[0].position.x,2)
  first.parts[0].metadata[0].value=false;assert.equal(second.parts[0].metadata[0].value,true)
  assert.equal(twilightMultipartFrame(e,{...packet(),parts:[]},{observedAt:200,sequence:3}).parts.length,0)
})
test('a different parent/type, bad source, duplicate ID and invalid native coordinates cannot attach a body',()=>{
  for(const [e,p] of [[{...entity(),entityId:200},packet()],[{...entity(),name:'minecraft:pig'},packet()],[entity(),{...packet(),sourceJarSha256:'wrong'}],
    [entity(),{...packet(),parts:[...packet().parts,...packet().parts]}],[entity(),packet(Infinity)]])
    assert.throws(()=>twilightMultipartFrame(e,p,{observedAt:1,sequence:1}),/MULTIPART/)
})
