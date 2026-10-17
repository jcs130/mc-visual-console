import test from 'node:test';
import assert from 'node:assert/strict';
import {componentSnbt} from '../../host/vanilla-component-nbt.mjs';
import {vanillaItemStack} from '../../host/vanilla-item-stack.mjs';
import {parseNativeItemStack} from '../../src/native-viewer/native-item-stack.js';

test('real multiline server book text round trips through Mojang SNBT, including quote, slash and control characters',()=>{
  const text='千灯纪\n生命 20/20\t"记号"\\路\r下一页';
  const item={name:'written_book',count:1,components:[{type:'written_book_content',data:{rawTitle:'命格书',author:'千灯纪',generation:0,resolved:false,
    pages:[{content:{type:'compound',value:{text:{type:'string',value:text}}}}]}}],removedComponents:[]};
  const wire=vanillaItemStack(item);
  assert.equal(wire.reason,null);
  assert.equal(parseNativeItemStack(wire.item).components['minecraft:written_book_content'].pages[0].raw.text,text);
  assert.equal(componentSnbt({type:'string',value:'a\nb'}),'"a\nb"');
});
test('a protocol-767 player head retains its exact profile and texture properties',()=>{
  const texture=Buffer.from(JSON.stringify({textures:{SKIN:{url:'https://textures.minecraft.net/texture/'+'a'.repeat(64)}}})).toString('base64');
  const result=vanillaItemStack({name:'player_head',count:1,components:[{type:'profile',data:{name:null,uuid:'6e8b395e-4349-3d44-99f5-b7488825e426',properties:[{name:'textures',value:texture,signature:null}]}}],removedComponents:[]});
  assert.equal(result.reason,null);const profile=parseNativeItemStack(result.item).components['minecraft:profile'];
  assert.equal(profile.properties[0].value,texture);assert.equal(profile.properties[0].name,'textures');
});
