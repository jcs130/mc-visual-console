import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Document, Element } from './fixtures/native-console-dom.mjs';
import { installViewerControlClient } from '../../src/modern-viewer/viewer-control-client.js';
import { ensureManualControlUi } from '../../src/modern-viewer/manual-control-ui.js';
test('standalone control UI requests a lease, waits for state and never replays inputs after reconnect',()=>{
  const document=new Document(),window=new Element('window',document),socket=new EventEmitter(),packets=[],states=[];
  let timer;window.setInterval=fn=>{timer=fn;return 1;};window.clearInterval=()=>{timer=null;};
  socket.connected=true;socket.on('viewerControl',packet=>packets.push(packet));
  const ui=installViewerControlClient({socket,document,window,onState:s=>states.push(s)});
  const root=document.querySelector('.viewer-play-controls');assert.equal(root.hidden,true);
  socket.emit('viewerControlState',{schemaVersion:1,available:true,active:false,actor:{username:'ag_test'}});
  document.querySelector('button').dispatch('click');assert.equal(packets.at(-1).type,'acquire');assert.equal(ui.active(),false);
  socket.emit('viewerControlState',{schemaVersion:1,available:true,active:true,epoch:'a',actor:{username:'ag_test'}});
  ui.route({type:'lantern-control-motion',input:{forward:1,strafe:0,cameraYaw:0}});assert.equal(packets.at(-1).epoch,'a');
  timer();assert.equal(packets.at(-1).type,'heartbeat');window.dispatch('blur');assert.equal(packets.at(-1).type,'release');assert.equal(ui.active(),false);
  const count=packets.length;socket.emit('disconnect');socket.emit('connect');assert.equal(ui.active(),false);assert.equal(packets.length,count);
  ui.dispose();assert.equal(timer,null);assert.equal(socket.listenerCount('viewerControlState'),0);assert.equal(root.isConnected,false);
});
test('portable touch UI is idempotent and supplies keyboard/mouse/gamepad companion actions',()=>{
  const document=new Document();ensureManualControlUi(document);ensureManualControlUi(document);
  for(const id of ['manual-viewer-overlay','touch-stick','touch-stick-knob','touch-jump','touch-sprint','touch-stop','touch-primary','touch-secondary'])assert.equal(document.querySelectorAll(`#${id}`).length,1,id);
});

test('blur cancels a pending handoff and a delayed active state cannot reactivate it',()=>{
  const document=new Document(),window=new Element('window',document),socket=new EventEmitter(),packets=[];
  window.setInterval=()=>1;window.clearInterval=()=>{};socket.connected=true;
  socket.on('viewerControl',packet=>packets.push(packet));
  const ui=installViewerControlClient({socket,document,window});
  socket.emit('viewerControlState',{schemaVersion:1,available:true,active:false});
  const button=document.querySelector('button');button.dispatch('click');assert.equal(button.textContent,'取消接管');
  window.dispatch('blur');socket.emit('viewerControlState',{schemaVersion:1,available:true,active:true,epoch:'late'});
  assert.equal(ui.active(),false);assert.equal(packets.at(-1).type,'release');assert.equal(packets.at(-1).epoch,'late');
  assert.equal(ui.route({type:'lantern-control-motion',input:{}}),true);assert.equal(packets.at(-1).type,'release');ui.dispose();
});

test('pending handoff times out without retry; old action replies cannot overwrite a new lease',()=>{
  const document=new Document(),window=new Element('window',document),socket=new EventEmitter(),requests=[];
  let now=0,tick;window.setInterval=fn=>{tick=fn;return 1;};window.clearInterval=()=>{};socket.connected=true;
  socket.on('viewerControl',(packet,ack)=>requests.push({packet,ack}));
  const ui=installViewerControlClient({socket,document,window,now:()=>now});
  const inactive={schemaVersion:1,available:true,active:false};socket.emit('viewerControlState',inactive);
  const button=document.querySelector('button');button.dispatch('click');now=9000;tick();
  assert.equal(requests.filter(r=>r.packet.type==='acquire').length,1);assert.equal(requests.at(-1).packet.type,'release');
  socket.emit('viewerControlState',inactive);button.dispatch('click');
  socket.emit('viewerControlState',{...inactive,active:true,epoch:'a'});ui.send('primary',{pressed:true});const old=requests.at(-1);
  ui.route({type:'lantern-control-release'});button.dispatch('click');socket.emit('viewerControlState',{...inactive,active:true,epoch:'b'});
  old.ack({ok:false,reason:'action_failed'});assert.doesNotMatch(document.querySelector('output').textContent,/未知/);ui.dispose();
});
