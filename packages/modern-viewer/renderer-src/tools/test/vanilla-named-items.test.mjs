import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {vanillaItemStack} from '../../host/vanilla-item-stack.mjs';
import {parseNativeItemStack,nativeNumericValue} from '../../src/native-viewer/native-item-stack.js';
import {nativeItemIconEligible} from '../../src/native-viewer/native-item-icons.js';
const registry=createRequire(import.meta.url)('minecraft-data')('1.21.1');
const stack=components=>vanillaItemStack({name:'oak_planks',count:3,components,removedComponents:[]},registry);
test('real named/lore/custom-data component patches retain the original stack and a standard block icon',()=>{
  const result=stack([{type:'custom_name',data:{type:'string',value:'{"text":"建筑木板"}'}},
    {type:'lore',data:[{type:'string',value:'{"text":"一组材料"}'}]},
    {type:'custom_data',data:{type:'compound',value:{marker:{type:'int',value:17}}}}]);
  assert.equal(result.reason,null);assert.equal(nativeItemIconEligible(result.item),true);
  const parsed=parseNativeItemStack(result.item);assert.equal(parsed.components['minecraft:custom_data'].marker,17);
  assert.match(result.item.snbt,/建筑木板/);
});
test('enchantment wire registry IDs preserve actual names and levels instead of losing the whole texture',()=>{
  const id=registry.enchantmentsByName.unbreaking.id;
  const result=stack([{type:'enchantments',data:{enchantments:[{id,level:2}],showTooltip:true}}]);
  assert.equal(result.reason,null);
  const parsed=parseNativeItemStack(result.item);assert.equal(parsed.components['minecraft:enchantments'].levels['minecraft:unbreaking'],2);
  assert.equal(nativeNumericValue(parsed.components['minecraft:enchantments'].show_in_tooltip),1);
});
test('unsupported registry entries and over-depth typed NBT do not silently become plain items',()=>{
  assert.match(stack([{type:'enchantments',data:{enchantments:[{id:999999,level:2}],showTooltip:true}}]).reason,/REGISTRY/);
  let value={type:'int',value:1};for(let i=0;i<25;i++)value={type:'compound',value:{child:value}};
  assert.match(stack([{type:'custom_data',data:value}]).reason,/LIMIT/);
});
test('standard bottles, bone meal and both gourd seed items have original GUI providers',()=>{
  for(const name of ['glass_bottle','bone_meal','pumpkin_seeds','melon_seeds']){
    const value=vanillaItemStack({name,count:1,components:[],removedComponents:[]},registry);
    assert.equal(value.reason,null);assert.equal(nativeItemIconEligible(value.item),true,name);
  }
});
test('written and writable books keep raw and filtered pages without dropping their whole item stack',()=>{
  const value=vanillaItemStack({name:'written_book',count:1,removedComponents:[],components:[{type:'written_book_content',data:{
    rawTitle:'服务器指南',filteredTitle:null,author:'Guide',generation:0,resolved:true,
    pages:[{content:{type:'string',value:'{"text":"查看玩法资料"}'},filteredContent:{type:'string',value:'{"text":"指南"}'}}]}}]},registry);
  assert.equal(value.reason,null);assert.equal(nativeItemIconEligible(value.item),true);
  const book=parseNativeItemStack(value.item).components['minecraft:written_book_content'];
  assert.equal(book.title.raw,'服务器指南');assert.equal(book.pages[0].filtered,'{"text":"指南"}');
  const writable=stack([{type:'writable_book_content',data:{pages:[{content:'原稿',filteredContent:'可见稿'}]}}]);
  assert.equal(writable.reason,null);assert.equal(parseNativeItemStack(writable.item).components['minecraft:writable_book_content'].pages[0].raw,'原稿');
});
