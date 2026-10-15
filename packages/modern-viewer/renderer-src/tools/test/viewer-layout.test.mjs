import test from 'node:test';
import assert from 'node:assert/strict';
import {installViewerLayout,normalizeViewerLayout} from '../../src/modern-viewer/viewer-layout.js';
import {Document,Element} from './fixtures/native-console-dom.mjs';
function browser(saved){
  const document=new Document(),window=new Element('window',document),storage=new Map();let observer;
  if(saved)storage.set('minecraft.viewer.layout.v1',JSON.stringify(saved));
  window.localStorage={getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)};
  window.MutationObserver=class{constructor(fn){observer=this;this.callback=fn;}observe(){}disconnect(){this.closed=true;}};
  const add=(id,hidden=false)=>{const el=document.createElement('aside');el.id=id;el.hidden=hidden;document.body.append(el);return el;};
  return {document,window,storage,add,mutate:()=>observer.callback(),observer:()=>observer};
}
test('display preferences whitelist booleans, retain defaults and recover corrupt versions',()=>{
  const defaults=normalizeViewerLayout(null);assert.equal(defaults.components.agentPointer,true);assert.equal(defaults.components.agentRoute,false);
  const saved=normalizeViewerLayout({version:1,clean:true,components:{minimap:false,skills:'false',unknown:false}});
  assert.equal(saved.clean,true);assert.equal(saved.components.minimap,false);assert.equal(saved.components.skills,true);assert.equal(saved.components.unknown,undefined);
  assert.deepEqual(normalizeViewerLayout({version:20,clean:true}),defaults);
});
test('normal HUD adopts early and late panels into flowing rails, persists visibility and restores original lifecycle',()=>{
  const h=browser(),map=h.add('corti-minimap'),skills=h.add('corti-skills',true);
  const ui=installViewerLayout(h);assert.equal(map.parentNode.className,'viewer-rail viewer-rail-left');assert.equal(skills.hidden,true);
  const late=h.add('agent-intent');h.mutate();assert.equal(late.parentNode.className,'viewer-rail viewer-rail-right');
  const check=h.document.querySelectorAll('input').find(el=>el.dataset.viewerComponent==='agentPointer');check.checked=false;check.dispatch('change');
  assert.equal(ui.visible('agentPointer'),false);assert.equal(JSON.parse(h.storage.get('minecraft.viewer.layout.v1')).components.agentPointer,false);
  const clean=h.document.querySelectorAll('button').find(el=>el.textContent==='简洁');clean.dispatch('click');assert.equal(ui.visible('minimap'),false);
  assert.equal(skills.hidden,true,'display changes never override absence of live data');
  h.window.dispatch('keydown',{code:'KeyH',target:{tagName:'INPUT'}});assert.equal(ui.snapshot().clean,true);
  h.window.dispatch('keydown',{code:'KeyH',target:{tagName:'BODY'}});assert.equal(ui.snapshot().clean,false);
  ui.dispose();assert.equal(map.parentNode,h.document.body);assert.equal(late.parentNode,h.document.body);assert.equal(h.observer().closed,true);
  assert.equal(h.document.querySelector('.viewer-toolbar'),null);
});
test('photo and OBS keep independent layouts; loading saved preferences survives refresh',()=>{
  for(const options of [{photo:true},{overlay:true}]){const h=browser();installViewerLayout({...h,...options}).dispose();assert.equal(h.document.body.children.length,0);}
  const h=browser({version:1,components:{minimap:false},clean:true}),ui=installViewerLayout(h);
  assert.equal(ui.visible('minimap'),false);assert.equal(ui.snapshot().clean,true);ui.dispose();
});

test('transient messages cannot move the Agent input panel inside a flowing rail',()=>{
  const h=browser(),map=h.add('corti-minimap'),inputs=h.add('agent-operations'),messages=h.add('corti-event-feed',true);
  const ui=installViewerLayout(h);
  assert.ok(inputs.parentNode===h.document.body,'inputs have their own viewport anchor');
  assert.ok(messages.parentNode===h.document.body,'messages have a separate centre anchor');
  assert.equal(map.parentNode.className,'viewer-rail viewer-rail-left');
  messages.hidden=false;h.mutate();messages.hidden=true;h.mutate();
  assert.ok(inputs.parentNode===h.document.body);
  const check=h.document.querySelectorAll('input').find(el=>el.dataset.viewerComponent==='agentOperations');
  check.checked=false;check.dispatch('change');assert.equal(ui.visible('agentOperations'),false);
  ui.dispose();assert.ok(inputs.parentNode===h.document.body);assert.ok(messages.parentNode===h.document.body);
});

test('wrapped toolbars reserve their measured height and release the observer and CSS state',()=>{
  const h=browser(),make=h.document.createElement.bind(h.document),style=new Map();let bottom=111,watcher;
  h.document.body.style.getPropertyValue=key=>style.get(key)??'';
  h.document.body.style.setProperty=(key,value)=>style.set(key,value);
  h.document.body.style.removeProperty=key=>style.delete(key);
  h.document.createElement=tag=>{const el=make(tag);if(tag==='header')el.getBoundingClientRect=()=>({bottom});return el;};
  h.window.ResizeObserver=class{constructor(fn){this.fn=fn;watcher=this;}observe(el){this.target=el;}disconnect(){this.closed=true;}};
  const ui=installViewerLayout(h);
  assert.equal(watcher.target.className,'viewer-toolbar');assert.equal(style.get('--viewer-toolbar-bottom'),'111px');
  bottom=68;watcher.fn();assert.equal(style.get('--viewer-toolbar-bottom'),'68px');
  ui.dispose();assert.equal(watcher.closed,true);assert.equal(style.has('--viewer-toolbar-bottom'),false);
});
