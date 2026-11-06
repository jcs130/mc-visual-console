import test from 'node:test'
import assert from 'node:assert/strict'
import { injectObservedMaids } from '../../host/maid-observation.mjs'

const id='12345678-1234-5678-1234-567812345678', player='22345678-1234-5678-1234-567812345678', world='32345678-1234-5678-1234-567812345678', generation='42345678-1234-5678-1234-567812345678'
const context={playerUuid:player,worldUuid:world,dimension:'minecraft:overworld',generation}
const entity={entityId:23,uuid:id,name:'minecraft:allay',metadata:[{key:2,value:'[Ů��]'}]}
const row={entityId:23,uuid:id,type:'touhou_little_maid:maid',modelId:'authors_and_credits:clocklalier',available:true,sampledAt:10000,
  ...Object.fromEntries('ysm sitting begging armRise sleeping passenger baby inWater usingItem offhandUse offhandSwing hasMainHand hasHelmet hasChestPlate hasLeggings hasBoots'.split(' ').map(k=>[k,false])),
  ...Object.fromEntries('attackAnim swingTime hurtTime bodyYaw headYaw pitch ageTicks'.split(' ').map(k=>[k,0])),health:20,task:'touhou_little_maid:idle',backpack:'touhou_little_maid:empty'}
const state={epoch:3,entities:[entity]}
const observed={...context,source:'paper_tracked_maids',observedAt:10000,rows:[row]}
const assets={binding:r=>({available:true,modelId:r.modelId,bundleSha256:'a'.repeat(64)})}
const inject=(o=observed,s=state,c=context)=>injectObservedMaids(s,o,c,assets,10000)

test('an exact tracked server identity restores original maid model without changing UUID/position',()=>{
  const result=inject().entities[0]
  assert.equal(result.name,'touhou_little_maid:maid');assert.equal(result.uuid,id);assert.equal(result.paperMaid.state.modelId,row.modelId)
  assert.equal(entity.name,'minecraft:allay');assert.equal(result.paperMaid.epoch,3)
})
test('labels and matching coordinates cannot turn a real Allay into a maid',()=>{
  for(const patch of [{rows:[]},{rows:[{...row,uuid:player}]},{rows:[{...row,entityId:24}]},{rows:[{...row,type:'minecraft:allay'}]}])assert.equal(inject({...observed,...patch}).entities[0],entity)
  assert.equal(inject(observed,{...state,entities:[{...entity,name:'minecraft:zombie'}]}).entities[0].name,'minecraft:zombie')
})
test('cross-account/dimension/world/generation/stale/future and duplicate rows are rejected',()=>{
  for(const patch of [{playerUuid:id},{dimension:'minecraft:the_end'},{worldUuid:id},{generation:id},{observedAt:6999},{observedAt:11001},{rows:[row,row]}])assert.equal(inject({...observed,...patch}).entities[0],entity)
})
test('unsupported native states remain explicit and never silently claim an Allay appearance',()=>{
  const result=inject({...observed,rows:[{...row,available:false}]}).entities[0]
  assert.equal(result.name,'touhou_little_maid:maid');assert.equal(result.paperMaid.asset.available,false)
  for(const patch of [{modelId:'../../private'},{attackAnim:NaN},{hasMainHand:undefined},{attackAnim:4}])assert.equal(inject({...observed,rows:[{...row,...patch}]}).entities[0].paperMaid.state,null)
})
test('removed and recycled entity IDs cannot revive an old maid',()=>{
  assert.deepEqual(inject(observed,{epoch:4,entities:[]}).entities,[])
  const newEntity={...entity,uuid:player}
  assert.equal(inject(observed,{epoch:4,entities:[newEntity]}).entities[0],newEntity)
})
