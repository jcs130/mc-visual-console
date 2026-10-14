import test from 'node:test'
import assert from 'node:assert/strict'
import {createNativeSurvivalUi} from '../../src/native-viewer/native-survival-ui.js'
import {shell} from './fixtures/native-console-dom.mjs'
test('actual effect/Boss facts use original assets, bound progress and safe text; absent facts clear old HUD',()=>{
  const document=shell();for(const id of ['corti-effects','corti-boss-bars']){const e=document.createElement('div');e.id=id;document.body.append(e)}
  const urls=new Map(['purple_background','purple_progress','notched_6_background','notched_6_progress'].map(leaf=>[`assets/minecraft/textures/gui/sprites/boss_bar/${leaf}.png`,`blob:${leaf}`]))
  urls.set('assets/minecraft/textures/mob_effect/haste.png','blob:haste')
  const ui=createNativeSurvivalUi({document,translate:key=>key==='effect.minecraft.haste'?'急迫':null})
  ui.update({available:true,playerUuid:'own',profile:'vanilla_1.21.1',effects:[{name:'minecraft:haste',amplifier:1,duration:400}],bossBars:[{title:'<script>Boss</script>',health:.51,color:'purple',dividers:6}]},{urls})
  assert.equal(document.querySelector('.native-effect-row').querySelector('img').src,'blob:haste');assert.match(document.getElementById('corti-effects').textContent,/急迫 2/)
  assert.equal(document.querySelector('.native-boss-progress').style.width,'184px');assert.equal(document.querySelector('script'),null)
  assert.match(document.getElementById('corti-boss-bars').textContent,/<script>Boss<\/script>/);assert.equal(document.getElementById('corti-skills').hidden,true)
  ui.update({available:false},{urls});assert.equal(document.getElementById('corti-effects').children.length,0);assert.equal(document.getElementById('corti-boss-bars').children.length,0);ui.dispose()
})
