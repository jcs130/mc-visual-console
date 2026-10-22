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
  assert.equal(twilightComponentSnbt('twilightforest:ore_data',data),'{counts:{"minecraft:diamond_ore":7},scanned_chunk:-8589934594L,scanned_block_count:120,universal_id:81985529216486895L}');
  assert.equal(twilightComponentSnbt('twilightforest:skull_candles',{color:14,count:3}),'{color:14,count:3}');
  assert.throws(()=>twilightComponentSnbt('twilightforest:sidestep_cooldown',[0,-1]),/TWILIGHT_COMPONENT_INVALID/);
});

test('real scanner translation keys and non-negative counts survive the persistent codec',()=>{
  const data={counts:[{name:'block.minecraft.iron_ore',count:2}],scannedChunk:[0,0],scannedBlockCount:120,universalId:[0,3]}
  assert.match(twilightComponentSnbt('twilightforest:ore_data',data),/"block.minecraft.iron_ore":2/)
  for(const bad of [{...data,counts:[{name:'',count:2}]},{...data,counts:[{name:'block.minecraft.iron_ore',count:-1}]},{...data,scannedBlockCount:-1}])assert.throws(()=>twilightComponentSnbt('twilightforest:ore_data',bad),/INVALID/)
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
test('registry and recursive codecs require actual names and complete child stacks',()=>{
  const maps=new Map([...registries,['minecraft:block',new Map([[1888,'twilightforest:ironwood_block']])],['twilight:magic_paintings',new Map([[2,'twilightforest:darkness']])],['minecraft:attribute',new Map([[31,'minecraft:generic.attack_damage']])]]);
  assert.equal(twilightComponentSnbt('twilightforest:ore_filter',1888,{registries:maps}),'"twilightforest:ironwood_block"');
  assert.equal(twilightComponentSnbt('twilightforest:magic_painting_variant',2,{registries:maps}),'"twilightforest:darkness"');
  assert.throws(()=>twilightComponentSnbt('twilightforest:ore_filter',1888,{registries}),/REGISTRY_UNAVAILABLE/);
  const attributes={attributes:[{typeId:31,name:'twilightforest:gear',value:2.5,operation:'add',slot:'main_hand'}],showTooltip:true};
  assert.equal(twilightComponentSnbt('twilightforest:stored_broken_attributes',attributes,{registries:maps}),'{modifiers:[{type:"minecraft:generic.attack_damage",id:"twilightforest:gear",amount:2.5d,operation:"add_value",slot:"mainhand"}],show_in_tooltip:1b}');
  const items=new Map([[300,'twilightforest:travellers_boots'],[301,'twilightforest:magic_map']]);
  const child={itemCount:1,itemId:301,components:[],removeComponents:[]};
  const wire={itemCount:1,itemId:300,components:[{type:'twilightforest:item_display',data:{items:[{itemCount:0},child],chosenMapSlot:1}}],removeComponents:[]};
  const result=nativeGatewayItem(wire,items,null,maps,{twilightComponents:true});
  assert.equal(result.available,true);assert.match(result.item.snbt,/slots:\[\{slot:1,item:\{id:"twilightforest:magic_map",count:1\}\}\],chosen_map_slot:1/);
  child.components=wire.components;assert.equal(nativeGatewayItem(wire,items,null,maps,{twilightComponents:true}).reason,'NATIVE_ITEM_RECURSION_LIMIT');
});
test('malformed scalars and unknown components fail closed',()=>{
  assert.equal(knownTwilightComponent('twilightforest:new_unknown'),false);
  assert.throws(()=>twilightComponentSnbt('twilightforest:efficient_eater',NaN),/TWILIGHT_COMPONENT_INVALID/);
  assert.throws(()=>twilightComponentSnbt('twilightforest:water_walk',1),/TWILIGHT_COMPONENT_INVALID/);
});
