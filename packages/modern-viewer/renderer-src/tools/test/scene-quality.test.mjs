import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { Document, Element } from './fixtures/native-console-dom.mjs';
import { normalizeSceneSettings, loadSceneSettings, resolveSceneQuality, applySceneQuality, applySceneWeather, sceneColourFilter, SCENE_SETTINGS_KEY } from '../../src/modern-viewer/scene-quality.js';
import { installSceneSettings } from '../../src/modern-viewer/scene-settings.js';

const settings = (extra = {}) => ({ ...normalizeSceneSettings(null), ...extra });
test('corrupt preferences and URL values cannot inject arbitrary renderer flags', () => {
  assert.deepEqual(normalizeSceneSettings({version:2,quality:'high'}), normalizeSceneSettings(null));
  const s = loadSceneSettings({getItem:()=>'{bad'}, {quality:'high',style:'javascript:bad',avatarSampling:'smooth'});
  assert.equal(s.quality,'high'); assert.equal(s.style,'soft'); assert.equal(s.avatarSampling,'smooth');
  assert.equal(normalizeSceneSettings({version:1,occlusion:'false'}).occlusion,true);
  for(const key of ['particles','effectCues','weather','shadows']) {
    assert.equal(normalizeSceneSettings({version:1,[key]:false})[key],false);
    assert.equal(normalizeSceneSettings({version:1,[key]:'false'})[key],true);
  }
});
test('only confirmed first-person survival/adventure with a ready camera section may cull', () => {
  const safe={gameMode:'survival',view:'first',sectionReady:true};
  for(const gameMode of ['survival','adventure'])assert.equal(resolveSceneQuality(settings(),{...safe,gameMode}).smartCull,true);
  for(const extra of [{gameMode:'spectator'},{gameMode:'creative'},{gameMode:null},{view:'third'},{view:'3dview'},{overlay:true},{sectionReady:false}])
    assert.equal(resolveSceneQuality(settings(),{...safe,...extra}).smartCull,false,JSON.stringify(extra));
  assert.equal(resolveSceneQuality(settings({occlusion:false}),safe).smartCull,false);
  for(const view of ['third','3dview']) assert.equal(resolveSceneQuality(settings(),{...safe,view,observerCullReady:true}).smartCull,true);
  assert.equal(resolveSceneQuality(settings(),{...safe,view:'third',gameMode:null,observerCullReady:true}).smartCull,true,
    'observer graph follows the camera even when the body stream omits game mode');
});
test('style remains selected at every performance tier; only cinematic shadows require high quality', () => {
  for(const mode of ['performance','balanced','high']) {
    const p=resolveSceneQuality(settings({style:'cinematic'}),{mode});
    assert.equal(p.shadows,mode==='high'); assert.equal(p.style,'cinematic');
    assert.equal(p.avatarSampling,'original','automatic quality never blurs an authored atlas');
  }
  const profile={saturation:1.1,contrast:1.04,brightness:1.02,warmth:.04};
  assert.equal(sceneColourFilter(profile,{style:'native'}),'none');
  assert.notEqual(sceneColourFilter(profile,{style:'soft'}),sceneColourFilter(profile,{style:'cinematic'}));
  assert.equal(resolveSceneQuality(settings({style:'cinematic',shadows:false}),{mode:'high'}).shadows,false);
});

test('weather preference disables the actual renderer module and retains the received weather', () => {
  const calls=[],backend={setRain:value=>calls.push(value)},weather={raining:true,thunder:1};
  assert.equal(applySceneWeather(backend,settings({weather:false}),weather),false);
  assert.deepEqual(weather,{raining:true,thunder:1});
  assert.equal(applySceneWeather(backend,settings(),weather),true);
  applySceneWeather(backend,settings(),{raining:false});
  assert.deepEqual(calls,[false,true,false]);
});
test('applying policy opens both actual renderer culling gates and restores them on mode change', () => {
  const world={worldRendererConfig:{},reactiveDebugParams:{smartCull:false},renderer:{shadowMap:{enabled:true}}};
  applySceneQuality(world,{smartCull:true,shadows:false});
  assert.equal(world.worldRendererConfig.smartCull,true);assert.equal(world.reactiveDebugParams.smartCull,true);assert.equal(world.renderer.shadowMap.enabled,false);
  applySceneQuality(world,{smartCull:false,shadows:true});
  assert.equal(world.worldRendererConfig.smartCull,false);assert.equal(world.reactiveDebugParams.smartCull,false);assert.equal(world.renderer.shadowMap.enabled,true);
});
test('the pinned native occlusion graph retains the wall, hides sections behind it, then restores an opening', async () => {
  const require=createRequire(import.meta.url);
  const entry=require.resolve('minecraft-renderer/src/three/occlusion/sectionOcclusionGraph.ts');
  const compiled=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'esm'});
  const {SectionOcclusionGraph}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  const graph=new SectionOcclusionGraph(),open=2**36-1;
  const row=(x,visibilitySet)=>({worldX:x,worldY:0,worldZ:0,visibilitySet});
  graph.registerSection('0,0,0',row(0,open));graph.registerSection('16,0,0',row(16,0));graph.registerSection('32,0,0',row(32,open));
  const p={smartCull:true,cameraWorldX:1,cameraWorldY:2,cameraWorldZ:1,viewDistance:4,sectionHeight:16,worldMinY:0,worldMaxY:256};
  assert.deepEqual([...graph.update(p)].sort(),['0,0,0','16,0,0']);
  graph.registerSection('16,0,0',row(16,open));assert.equal(graph.update(p).has('32,0,0'),true);
  graph.registerSection('16,0,0',row(16,0));assert.equal(graph.update(p).has('32,0,0'),false);
  assert.equal(graph.update({...p,smartCull:false}).size,3);
});
test('settings persist without a game action and remove all UI listeners on disposal', () => {
  const document=new Document(),window=new Element('window',document),saved=new Map(),changed=[];
  window.localStorage={setItem:(k,v)=>saved.set(k,v)};
  const ui=installSceneSettings({document,window,settings:settings(),onChange:s=>changed.push(s)});
  const select=document.querySelectorAll('select').find(el=>el.dataset.sceneSetting==='quality');select.value='performance';select.dispatch('change');
  assert.equal(changed.at(-1).quality,'performance');assert.equal(JSON.parse(saved.get(SCENE_SETTINGS_KEY)).quality,'performance');
  for(const key of ['particles','effectCues','weather','shadows']) {
    const input=document.querySelectorAll('input').find(el=>el.dataset.sceneSetting===key);
    assert.ok(input,key+' has a visible control');input.checked=false;input.dispatch('change');
    assert.equal(changed.at(-1)[key],false);
  }
  const restored=loadSceneSettings({getItem:key=>saved.get(key)});
  assert.equal(restored.quality,'performance');
  for(const key of ['particles','effectCues','weather','shadows'])assert.equal(restored[key],false);
  ui.status('省电');assert.equal(document.querySelector('output').textContent,'省电');
  ui.dispose();assert.equal(document.querySelector('.viewer-scene-settings'),null);
  for(const hidden of [true]) {installSceneSettings({document,window,settings:settings(),hidden}).dispose();assert.equal(document.body.children.length,0);}
});
