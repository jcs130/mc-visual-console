import test from 'node:test'
import assert from 'node:assert/strict'
import { nativeExtensionSupport, createNativeSurvivalUi } from '../../src/native-viewer/native-survival-ui.js'
import { shell } from './fixtures/native-console-dom.mjs'

test('plain Mineflayer remains the default regardless of brand, address or profile labels', () => {
  for (const profile of [null, 'vanilla_1.21.1', 'qiandengji']) {
    assert.deepEqual(nativeExtensionSupport({ available: true, profile, host: 'qiandengji.example',
      gameMessages: [{ text: '千灯纪 魔力 100/100' }], skills: null }), { skills: false, mana: false })
  }
  assert.deepEqual(nativeExtensionSupport({ available: true, skills: {} }), { skills: false, mana: false })
  assert.deepEqual(nativeExtensionSupport({ available: true, skills: { mana: { current: 1, max: NaN } } }), { skills: false, mana: false })
})

test('optional visuals appear from real validated data and clear on reset or loss', () => {
  const document=shell(),mana=document.createElement('div');mana.setAttribute('data-corti-mana-vital','');document.body.append(mana)
  const ui=createNativeSurvivalUi({document}),skills=document.getElementById('corti-skills')
  const observed={available:true,skills:{source:'same_player_receipt',mana:{current:24,max:24},abilities:[{name:'实际技能'}]}}
  ui.update(observed);assert.equal(skills.hidden,false);assert.equal(mana.hidden,false)
  ui.update({available:true,skills:{abilities:[{name:'实际技能'}]}});assert.equal(skills.hidden,false);assert.equal(mana.hidden,true)
  ui.update({available:true,profile:'qiandengji',skills:null});assert.equal(skills.hidden,true);assert.equal(mana.hidden,true)
  ui.update(observed);ui.reset();assert.equal(skills.hidden,true);assert.equal(mana.hidden,true)
  ui.dispose()
})
