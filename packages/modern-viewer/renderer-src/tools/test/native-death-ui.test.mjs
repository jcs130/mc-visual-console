import assert from 'node:assert/strict'
import {test} from 'node:test'
import {shell} from './fixtures/native-console-dom.mjs'
import {createNativeDeathUi} from '../../src/native-viewer/native-death-ui.js'
test('same-player zero health shows death/countdown once; only real positive health shows respawn, disconnect clears',()=>{
  const document=shell();let time=1000
  const ui=createNativeDeathUi({document,now:()=>time}),p=health=>({available:true,playerUuid:'body',self:{health,deathLifecycle:{episodeId:'death:one',respawnAt:new Date(5000).toISOString()}}})
  ui.setIdentity({confirmed:true,playerUuid:'body'});ui.update(p(20));assert.equal(ui.panel.hidden,true)
  ui.update(p(0));assert.equal(ui.panel.hidden,false);assert.match(ui.panel.textContent,/4 秒/);assert.equal(ui.panel.dataset.phase,'dead')
  time=3000;ui.update(p(0));assert.match(ui.panel.textContent,/2 秒/);assert.equal(ui.panel.dataset.episode,'death:one')
  time=5000;ui.update(p(0));assert.equal(ui.panel.dataset.phase,'dead','timer is not proof of respawn')
  ui.update(p(20));assert.equal(ui.panel.dataset.phase,'respawned');assert.equal(ui.panel.hidden,false)
  time=7500;ui.update(p(20));assert.equal(ui.panel.hidden,true)
  ui.update({...p(0),playerUuid:'other'});assert.equal(ui.panel.hidden,true)
  ui.update(p(0));ui.reset();assert.equal(ui.panel.hidden,true);ui.dispose();assert.equal(ui.panel.parentNode,null)
})
