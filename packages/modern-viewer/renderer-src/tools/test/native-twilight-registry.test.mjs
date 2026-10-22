import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {observeTwilightRegistry,TWILIGHT_TRAVELLER_REGISTRY} from '../../host/native-twilight-registry.mjs'
const uuid='12345678-1234-4234-8234-123456789abc'
function setup(){const bot=new EventEmitter();bot._client=new EventEmitter();const observer=observeTwilightRegistry(bot,{simplifyNBT:value=>value,now:()=>100});return {bot,observer}}
test('configuration definitions preserve actual order and overrides, bind snapshots to the action account and release listeners',()=>{
  const {bot,observer}=setup(),entries=[{key:'twilightforest:water_walk',value:{type:'twilightforest:component',component:{'twilightforest:water_walk':{}}}}]
  bot._client.emit('registry_data',{id:TWILIGHT_TRAVELLER_REGISTRY,entries})
  const snapshot=observer.snapshot(uuid);assert.equal(snapshot.playerUuid,uuid);assert.equal(snapshot.source,'same_connection_configuration_registry_data');assert.equal(snapshot.entries[0].id,0)
  entries[0].value.component={changed:true};assert.deepEqual(snapshot.entries[0].value.component,{'twilightforest:water_walk':{}})
  snapshot.entries[0].key='changed';assert.equal(observer.snapshot(uuid).entries[0].key,'twilightforest:water_walk')
  assert.equal(observer.snapshot(null),null);bot._client.emit('start_configuration');assert.equal(observer.snapshot(uuid),null)
  observer.dispose();observer.dispose();assert.equal(bot._client.listenerCount('registry_data'),0);assert.equal(bot.listenerCount('end'),0)
})
test('missing known-pack values, duplicate names and oversized definitions remain unavailable instead of an empty default registry',()=>{
  for(const entries of [[{key:'twilightforest:a',value:null}],Array(2).fill({key:'twilightforest:a',value:{type:'twilightforest:component'}}),Array(257).fill({})]){
    const {bot,observer}=setup();bot._client.emit('registry_data',{id:TWILIGHT_TRAVELLER_REGISTRY,entries});assert.equal(observer.snapshot(uuid).available,false);observer.dispose()
  }
})
