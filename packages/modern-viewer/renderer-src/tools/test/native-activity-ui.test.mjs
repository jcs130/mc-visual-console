import test from 'node:test'
import assert from 'node:assert/strict'
import { shell } from './fixtures/native-console-dom.mjs'
import { createNativeActivityUi } from '../../src/native-viewer/native-activity-ui.js'

const playerUuid='6e8b395e-4349-3d44-99f5-b7488825e426'
const view=(patch={})=>({epoch:1,presentation:{playerUuid,available:true,activity:{schemaVersion:1,playerUuid,entityId:7,revision:1,
  sampledAt:1000,events:[{id:1,kind:'slot_click',source:'sent_packet',windowId:0,slot:36,button:1,mode:0,at:1000}],
  items:[{id:2,at:1000,item:{name:'minecraft:oak_log',count:1},delta:2,source:'server_inventory_reconciliation'}],
  recipes:[{output:{name:'minecraft:stick',count:4},missing:[{name:'minecraft:oak_planks',count:1}],requiresTable:false,craftable:false}],
  merchant:null,server:{sidebar:{title:'<script>任务</script>',rows:[{text:'收集原木',value:2}]},players:[]},entities:[],...patch}}})

test('live inspector renders operations, item changes, recipe deficits and safe received server text',()=>{
  const document=shell(),ui=createNativeActivityUi({document,itemName:item=>item.name})
  ui.setIdentity({confirmed:true,playerUuid,entityId:7});ui.update(view())
  const root=document.querySelector('.native-live-inspector')
  assert.match(root.textContent,/右键.*槽 36/);assert.match(root.textContent,/oak_log.*\+2/)
  assert.match(root.textContent,/oak_planks.*缺 1/);assert.match(root.textContent,/<script>任务<\/script>/)
  assert.equal(root.querySelector('script'),null);ui.dispose();assert.equal(document.querySelector('.native-live-inspector'),null)
})

test('foreign entity, disconnect and epoch change clear the old visible operation history',()=>{
  const document=shell(),ui=createNativeActivityUi({document})
  ui.setIdentity({confirmed:true,playerUuid,entityId:7});ui.update(view())
  assert.match(document.body.textContent,/槽 36/)
  const foreign=view();foreign.presentation.activity.entityId=9;ui.update(foreign)
  assert.ok(!document.body.textContent.includes('槽 36'))
  ui.update(view());ui.setIdentity({confirmed:false,playerUuid});assert.ok(!document.body.textContent.includes('槽 36'));ui.dispose()
})

test('merchant stock and native queue terminals remain separate from sent clicks and unknown effects',()=>{
  const document=shell(),ui=createNativeActivityUi({document,itemName:item=>item?.name??'空'})
  ui.setIdentity({confirmed:true,playerUuid,entityId:7})
  const state=view();state.presentation.nativeMenu={windowId:2};state.presentation.activity.merchant={windowId:2,selected:0,offers:[{index:0,input:{name:'minecraft:emerald',count:4},price:3,output:{name:'minecraft:bread',count:6},disabled:true,uses:8,maxUses:8}]}
  state.presentation.agentPlayback={queue:[{id:'one',phase:'running',operation:'craft'}],timeline:[{at:'2026-10-15T00:00:00Z',action:{type:'mc_do',operation:'craft'},result:{ok:false,code:'blocked',effectVerified:false}}]}
  ui.update(state);assert.match(document.body.textContent,/已售罄/);assert.match(document.body.textContent,/emerald.*3/)
  assert.match(document.body.textContent,/执行中/);assert.match(document.body.textContent,/阻塞.*效果未验证/);ui.dispose()
})
