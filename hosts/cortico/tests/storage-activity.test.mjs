import test from 'node:test';
import assert from 'node:assert/strict';
import {createCorticoStorageFeed} from '../storage-activity.mjs';
import {normalizeContentPanels} from '../../../packages/modern-viewer/renderer-src/host/client-content-stream.mjs';

const start=Date.parse('2026-01-05T10:00:00Z');
const iso=t=>new Date(t).toISOString();
const language={'item.minecraft.emerald':'绿宝石','block.minecraft.dirt':'泥土','item.minecraft.bread':'面包'};
function event(cursor, type, more) {
  return {cursor,ts:iso(start+10),type:'mymc.'+type,source:'mymc',senderKey:'minecraft',origin:'external',...more};
}
function command(cursor, line) {
  return event(cursor,'chat',{text:'[MC 系统] '+line,meta:{channel:'system',executionFeedback:{kind:'server-message'}}});
}
function query(cursor,id,data,extra={}) {
  return event(cursor,'event',{meta:{serverQuery:{query:id,username:'Agent',phase:'replied',reply:{ok:true,data},...extra}}});
}
async function fixture(events) {
  const calls=[];
  const hud=createCorticoStorageFeed({source:'mymc',username:'Agent',language,readEvents:async bounds=>{
    calls.push(bounds);return{events:events.filter(e=>e.cursor>=bounds.from&&e.cursor<=bounds.to)};
  }});
  const poll=(latest,now=start+100,startedAt=iso(start))=>hud.poll({latest,now,startedAt});
  await poll(1,start);
  return {hud,poll,calls,panel:(now=start+100)=>hud.panel({now})};
}
test('one checked page, bounded item rows with original slot numbers, and two independent transfer receipts',async()=>{
  const d={source:'personal_stash',scope:'requested_page_only',page:10,pages:10,occupiedOnPage:3,pageSize:54,
    items:[{slot:488,id:'minecraft:dirt',count:30},{slot:501,id:'minecraft:bread',count:12,displayName:'§b咸面包'},{slot:540,id:'minecraft:emerald',count:4}]};
  const f=await fixture([query(2,'storage.stash',d),command(3,'MC_STASH_TAKE slot=501 id=minecraft:bread moved=3'),
    command(4,'MC_STASH_PUT slot=6 id=minecraft:emerald moved=9 requested=64 reason=partial retrySameAction=false nextCommand="/unrelated moved=999"')]);
  await f.poll(4);
  const [p]=normalizeContentPanels([f.panel()]);
  assert.match(p.rows[0].label,/10\/10/);assert.match(p.rows[0].text,/3\/54.*展示 2/);
  assert.deepEqual(p.rows.slice(1).map(r=>[r.label,r.text]),[
    ['箱槽 488','泥土 ×30'],['箱槽 501','咸面包 ×12'],['已取出 · 箱槽 501','面包 ×3'],['部分存入 · 背包槽 6','绿宝石 ×9（请求 64）']]);
  await f.poll(4);assert.equal(f.calls.length,1);assert.equal(f.panel(start+15010),null);
});
test('overview includes all pages, while the carried inventory is explicitly a different view',async()=>{
  const f=await fixture([query(2,'storage.overview',{source:'personal_stash',scope:'all_pages',pageCount:10,capacity:540,occupiedSlots:33,freeSlots:507}),
    query(3,'storage.inventory',{source:'inventory',occupied:0,capacity:36,items:[]})]);
  await f.poll(2);assert.match(f.panel().rows[0].text,/10 页.*33 格.*507 格/);
  await f.poll(3);assert.deepEqual(f.panel().rows,[{label:'查阅 · 随身物品',text:'当时已用 0/36 格',tone:'info'}]);
});
test('zero, syntax refusal, timeout and incomplete results are distinct from an actual transfer',async()=>{
  const f=await fixture([query(2,'storage.stash',null,{phase:'timeout',outcomeUnknown:true}),
    command(3,'MC_STASH_TAKE slot=5 moved=0 reason=empty'),command(4,'用法：/mycli arena stash putslot <slot> <amount>'),
    query(5,'storage.stash',{complete:false})]);
  await f.poll(4);assert.deepEqual(f.panel().rows.map(r=>r.tone),['warning','warning','warning']);
  assert.match(f.panel().rows[1].text,/槽位为空/);assert.match(f.panel().rows[2].label,/未执行/);
  await f.poll(5);assert.match(f.panel().rows[0].text,/部分/);
});
test('ordinary chat, tool claims, malformed receipts, future/expired events and other subjects never supply counts',async()=>{
  const good=command(2,'MC_STASH_PUT id=minecraft:emerald moved=7');
  const variants=[{...good,source:'other'},{...good,origin:'self'},{...good,senderKey:'viewer'},
    {...good,meta:{channel:'nearby'}},{...good,type:'mymc.tool'},
    {...good,text:'[MC 系统] 某人说 MC_STASH_PUT id=minecraft:emerald moved=7'},
    {...good,ts:iso(start+99999)},{...good,ts:iso(start-16000)},command(2,'MC_STASH_PUT id=minecraft:emerald moved=7 moved=10'),
    command(2,'MC_STASH_PUT id=minecraft:emerald moved=9 requested=2'),command(2,'MC_STASH_PUT moved=8'),
    query(2,'storage.stash',{}, {username:'different',outcomeUnknown:true})];
  const f=await fixture(variants);await f.poll(2);assert.equal(f.panel(),null);
});
test('new sessions and absence reset the cursor; batch read is bounded even when other Worlds are noisy',async()=>{
  const f=await fixture([command(2,'MC_STASH_PUT id=minecraft:emerald moved=1')]);
  assert.equal(f.calls.length,0);await f.poll(2);assert.ok(f.panel());
  await f.poll(3,start+1000,iso(start+500));assert.equal(f.panel(),null);assert.equal(f.calls.length,1);
  await f.poll(55,start+18000,iso(start+500));assert.equal(f.calls.length,1);
  await f.poll(900,start+19000,iso(start+500));assert.deepEqual(f.calls.at(-1),{source:'mymc',from:837,to:900,limit:64});
});
test('a transient read failure can be retried at the same cursor',async()=>{
  let tries=0;const hud=createCorticoStorageFeed({source:'mymc',username:'Agent',language,readEvents:async()=>{
    if(!tries++)throw Error('offline');return{events:[command(2,'MC_STASH_PUT id=minecraft:emerald moved=2')]};
  }});
  const poll=latest=>hud.poll({latest,startedAt:iso(start),now:start+100});
  await poll(1);await assert.rejects(poll(2));await poll(2);assert.match(hud.panel({now:start+101}).rows[0].text,/×2/);
});
