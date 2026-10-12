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
