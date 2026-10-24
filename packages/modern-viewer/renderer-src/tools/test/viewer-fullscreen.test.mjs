import test from 'node:test';import assert from 'node:assert/strict';
import {installViewerFullscreen}from'../../src/modern-viewer/viewer-fullscreen.js';
import {Document,Element}from'./fixtures/native-console-dom.mjs';
const flush=()=>new Promise(r=>setImmediate(r));
function setup(){const document=new Document(),window=new Element('window',document),root=document.createElement('section'),button=document.createElement('button');document.body.append(root);root.append(button);return{document,window,root,button};}
test('native fullscreen enters from the button, reflects Escape/browser exit and cleans listeners',async()=>{
 const h=setup();let entered=0,exited=0;h.root.requestFullscreen=async()=>{entered++;h.document.fullscreenElement=h.root;h.document.dispatch('fullscreenchange')};h.document.exitFullscreen=async()=>{exited++;h.document.fullscreenElement=null;h.document.dispatch('fullscreenchange')};
 const ui=installViewerFullscreen(h);h.button.dispatch('click');await flush();assert.equal(entered,1);assert.equal(ui.active(),true);assert.equal(h.button.textContent,'退出全屏');
 h.document.fullscreenElement=null;h.document.dispatch('fullscreenchange');assert.equal(h.button.textContent,'全屏');
 await ui.toggle();await ui.toggle();assert.equal(exited,1);ui.dispose();h.button.dispatch('click');await flush();assert.equal(entered,2);
});
test('unsupported native fullscreen expands the page and restores scrolling on Escape',async()=>{
 const h=setup();h.document.body.style.overflow='auto';const ui=installViewerFullscreen(h);await ui.toggle();assert.equal(h.root.dataset.viewerFullscreen,'window');assert.equal(h.document.body.style.overflow,'hidden');
 h.window.dispatch('keydown',{key:'Escape'});assert.equal(ui.active(),false);assert.equal(h.root.dataset.viewerFullscreen,undefined);assert.equal(h.document.body.style.overflow,'auto');ui.dispose();
});
test('a denied native request has a bounded page fallback and navigation restores its original layout',async()=>{
 const h=setup();let attempts=0;h.root.requestFullscreen=async()=>{attempts++;throw Error('NotAllowedError')};const ui=installViewerFullscreen(h);await ui.toggle();assert.equal(attempts,1);assert.equal(ui.active(),true);ui.dispose();assert.equal(h.root.dataset.viewerFullscreen,undefined);assert.equal(h.document.body.style.overflow,'');
});
test('double clicks cannot race entry and disposal during a pending request leaves no fullscreen behind',async()=>{
 const h=setup();let release,entered=0;h.root.requestFullscreen=()=>{entered++;return new Promise(r=>{release=()=>{h.document.fullscreenElement=h.root;r()}})};h.document.exitFullscreen=async()=>{h.document.fullscreenElement=null};
 const ui=installViewerFullscreen(h),pending=ui.toggle();await ui.toggle();assert.equal(entered,1);ui.dispose();release();await pending;assert.equal(ui.active(),false);
});
