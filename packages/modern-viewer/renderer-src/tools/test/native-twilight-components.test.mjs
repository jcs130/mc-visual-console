import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeGatewayItem} from '../../host/native-gateway-stream.mjs';
import {twilightComponentSnbt,knownTwilightComponent} from '../../host/native-twilight-components.mjs';
const registries=new Map([['minecraft:potion',new Map([[91,'minecraft:healing']])],['minecraft:mob_effect',new Map()]]);
const options={registries};
test('Twilight flask uses original record field names and action-connection potion registry',()=>{
  const type='twilightforest:flask_contents';
  const data={potion:{potionId:91,customEffects:[]},doses:4,breakage:7,breakable:false};
  assert.equal(twilightComponentSnbt(type,data,options),'{potion:{potion:"minecraft:healing",custom_effects:[]},doses:4,breakage:7,breakable:0b}');
  assert.throws(()=>twilightComponentSnbt(type,{...data,potion:{potionId:92,customEffects:[]}},options),/REGISTRY_UNAVAILABLE/);
});
test('Twilight ore data preserves signed absolute chunk coordinates and full 64-bit IDs',()=>{
  const data={counts:[{name:'minecraft:diamond_ore',count:7}],scannedChunk:[-3,4294967294],scannedBlockCount:120,universalId:[0x1234567,0x89abcdef]};
  assert.equal(twilightComponentSnbt('twilightforest:ore_data',data),'{counts:{"minecraft:diamond_ore":7},scanned_chunk:[I;-2,-3],scanned_block_count:120,universal_id:81985529216486895L}');
  assert.equal(twilightComponentSnbt('twilightforest:skull_candles',{color:14,count:3}),'{color:"red",count:3}');
  assert.throws(()=>twilightComponentSnbt('twilightforest:sidestep_cooldown',[0,-1]),/TWILIGHT_COMPONENT_INVALID/);
});
test('native stack conversion requires explicit pinned Twilight enablement and preserves removals',()=>{
  const items=new Map([[300,'twilightforest:travellers_boots']]);
  const wire={itemCount:1,itemId:300,addedComponentCount:2,removedComponentCount:1,
    components:[{type:'twilightforest:water_walk',data:undefined},{type:'twilightforest:high_jump_amplifier',data:2}],
    removeComponents:[{type:'twilightforest:double_jump'}]};
  const disabled=nativeGatewayItem(wire,items,null,registries);
  assert.equal(disabled.available,false);
  const enabled=nativeGatewayItem(wire,items,null,registries,{twilightComponents:true});
  assert.equal(enabled.available,true);
  assert.match(enabled.item.snbt,/"twilightforest:water_walk":\{\}/);
  assert.match(enabled.item.snbt,/"!twilightforest:double_jump":\{\}/);
  assert.equal(wire.components.length,2);
});
test('unsupported recursive and registry codecs stay unavailable, and malformed scalars fail closed',()=>{
  for(const name of ['ore_filter','stored_broken_attributes','magic_painting_variant','item_display']){
    const type='twilightforest:'+name;assert.equal(knownTwilightComponent(type),false);assert.equal(twilightComponentSnbt(type,0),null);
  }
  assert.throws(()=>twilightComponentSnbt('twilightforest:efficient_eater',NaN),/TWILIGHT_COMPONENT_INVALID/);
  assert.throws(()=>twilightComponentSnbt('twilightforest:water_walk',1),/TWILIGHT_COMPONENT_INVALID/);
});
