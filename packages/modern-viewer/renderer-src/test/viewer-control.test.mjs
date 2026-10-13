import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Vec3 } from 'vec3';
import { createViewerControlBridge, normalizeControlMotion } from '../host/viewer-control.mjs';
import { createMineflayerControlAdapter, createMineflayerRayNavigation } from '../host/viewer-mineflayer-control.mjs';

class Socket extends EventEmitter {
  constructor(){super();this.messages=[];}
  emit(name,...args){this.messages.push([name,...args]);return true;}
  incoming(...args){return super.emit(...args);}
  state(){return this.messages.filter(m=>m[0]==='viewerControlState').at(-1)?.[1];}
}
function harness(options={}){
  let time=0,tick;const calls=[],actor={uuid:'own',username:'ag_test',entityId:1};
  const adapter={identity:()=>({...actor}),ready:()=>true,capabilities:['motion','primary'],stop:()=>calls.push(['stop']),
    motion:v=>calls.push(['motion',v]),action:async(type,value)=>{calls.push([type,value]);return {ok:true,status:'sent'};},...options.adapter};
  const bridge=createViewerControlBridge({adapter,authorize:()=>true,acquire:async()=>calls.push(['acquire']),release:async()=>calls.push(['release']),
    now:()=>time,setInterval:fn=>{tick=fn;return{unref(){}};},clearInterval(){},...options,adapter});
  const socket=new Socket();bridge.subscribeSocket(socket);let sequence=0;
  const request=(type,extra={},s=socket)=>new Promise(resolve=>s.incoming('viewerControl',{schemaVersion:1,type,epoch:s.state()?.epoch,sequence:++sequence,...extra},resolve));
  return {bridge,socket,calls,adapter,actor,request,advance:async(ms)=>{time+=ms;tick();await new Promise(r=>setImmediate(r));}};
}
test('authorization and Agent handoff are required before any mutation; only one browser owns the actor',async()=>{
  const h=harness();try{
    assert.equal((await h.request('motion',{input:{}})).reason,'lease_required');assert.deepEqual(h.calls,[]);
    assert.equal((await h.request('acquire')).status,'active');assert.deepEqual(h.calls.map(c=>c[0]),['acquire','stop']);
    const second=new Socket();h.bridge.subscribeSocket(second);assert.equal((await h.request('acquire',{},second)).reason,'control_busy');
    assert.equal(second.state().actor.username,'ag_test');
  }finally{await h.bridge.dispose();}
  const denied=harness({authorize:()=>false});try{assert.equal((await denied.request('acquire')).reason,'not_authorized');assert.equal(denied.calls.length,0);}finally{await denied.bridge.dispose();}
});
test('stale/repeated input and a previous lease cannot drive the actor',async()=>{
  const h=harness();try{
    await h.request('acquire');const epoch=h.socket.state().epoch;
    const input={forward:1,strafe:0,cameraYaw:0};
    await h.request('motion',{input,sequence:30});assert.equal((await h.request('motion',{input,sequence:30})).reason,'stale_sequence');
    await h.request('release',{sequence:31});await h.advance(0);await h.request('acquire');
    assert.notEqual(h.socket.state().epoch,epoch);assert.equal((await h.request('motion',{input,epoch,sequence:40})).reason,'lease_required');
    assert.equal(h.calls.filter(c=>c[0]==='motion').length,1);
  }finally{await h.bridge.dispose();}
});
test('heartbeat cannot keep stale movement going; disconnect and actor replacement relinquish control',async()=>{
  const h=harness();try{
    await h.request('acquire');await h.request('motion',{input:{forward:1,strafe:0,cameraYaw:0}});
    await h.advance(800);assert.equal(h.socket.state().reason,'input_expired');assert.equal(h.bridge.snapshot().active,true);
    h.actor.entityId=2;await h.advance(20);assert.equal(h.bridge.snapshot().active,false);assert.equal(h.socket.state().reason,'actor_changed');
    await h.request('acquire');h.socket.incoming('disconnect');await h.advance(0);assert.equal(h.bridge.snapshot().active,false);
    assert.equal(h.socket.listenerCount('viewerControl'),0);
  }finally{await h.bridge.dispose();}
});
test('disconnect while pausing an Agent cannot grant an invisible late lease',async()=>{
  let finish;const h=harness({acquire:()=>new Promise(r=>{finish=r;})});
  const request=h.request('acquire');await new Promise(r=>setImmediate(r));h.socket.incoming('disconnect');finish();await h.advance(0);
  assert.equal(h.bridge.snapshot().active,false);assert.equal(h.calls.filter(c=>c[0]==='release').length,1);
  await h.bridge.dispose();void request;
});
test('a pending dig reports completion only after its native promise; repeat actions are rejected',async()=>{
  let finish;const h=harness({adapter:{action:()=>new Promise(r=>{finish=r;})}});try{
    await h.request('acquire');let receipt;
    const result=h.request('primary',{pressed:true}).then(r=>{receipt=r;});await new Promise(r=>setImmediate(r));
    assert.equal(receipt,undefined);assert.equal((await h.request('primary',{pressed:true})).reason,'action_pending');
    finish({ok:true,status:'confirmed',scope:'dig'});await result;assert.equal(receipt.status,'confirmed');
  }finally{await h.bridge.dispose();}
});
test('stop cancels an action queued in the same event turn; it is never automatically replayed',async()=>{
  const h=harness({adapter:{action:async(type,value,{signal})=>({ok:!signal.aborted,status:signal.aborted?'unknown':'sent'})}});try{
    await h.request('acquire');const pending=h.request('primary',{pressed:true});await h.request('stop');
    assert.equal((await pending).status,'unknown');await h.advance(1000);assert.equal(h.calls.filter(c=>c[0]==='motion').length,0);
  }finally{await h.bridge.dispose();}
});
test('invalid motion is rejected and values are bounded without evaluating supplied text',()=>{
  assert.equal(normalizeControlMotion({forward:1,strafe:0,cameraYaw:NaN}),null);
  assert.deepEqual(normalizeControlMotion({forward:99,strafe:-9,cameraYaw:0,jump:'true',sprint:true}),
    {forward:1,strafe:-1,cameraYaw:0,movementMode:'camera_relative',jump:false,sprint:true,sneak:false});
});
function botFixture(){
  const events=[],bot={username:'ag_test',player:{uuid:'self'},_client:{state:'play'},game:{gameMode:'survival'},
    entity:{id:1,position:new Vec3(0,64,0),yaw:0,pitch:0,eyeHeight:1.62},controlState:{},
    clearControlStates(){events.push(['clear']);for(const key in this.controlState)this.controlState[key]=false;},
    setControlState(k,v){this.controlState[k]=v;},look(yaw,pitch){events.push(['look',yaw,pitch]);this.entity.yaw=yaw;this.entity.pitch=pitch;return Promise.resolve();},
    world:{raycast(origin,direction,reach){events.push(['ray',origin,direction,reach]);return {name:'stone',position:new Vec3(0,64,-1),face:3};}},
    canDigBlock:()=>true,entityAtCursor:()=>null,stopDigging(){events.push(['stopDig']);},deactivateItem(){events.push(['deactivate']);},
    activateItem(){events.push(['activate']);},setQuickBarSlot(slot){events.push(['slot',slot]);},registry:{blocksByName:{}},
    dig:async()=>{events.push(['dig']);},activateEntity:async()=>{},activateBlock:async()=>{events.push(['blockUse']);},attack:e=>events.push(['attack',e.id])};
  return {bot,events};
}
test('Mineflayer adapter uses the original actor and standard controls in both movement modes',()=>{
  const {bot,events}=botFixture(),adapter=createMineflayerControlAdapter(bot);
  assert.equal(adapter.ready(),true);
  adapter.motion(normalizeControlMotion({forward:0,strafe:1,cameraYaw:0}));assert.ok(Math.abs(bot.entity.yaw+Math.PI/2)<1e-8);assert.equal(bot.controlState.forward,true);
  adapter.motion(normalizeControlMotion({forward:-1,strafe:1,cameraYaw:0,movementMode:'first_person',lookYaw:.2,lookPitch:.3}));
  assert.equal(bot.controlState.forward,false);assert.equal(bot.controlState.back,true);assert.equal(bot.controlState.right,true);assert.ok(Math.abs(bot.entity.yaw-.2)<1e-8);
  adapter.stop();assert.ok(Object.values(bot.controlState).every(v=>!v));assert.equal(adapter.identity().uuid,'self');
  bot.game.gameMode='spectator';assert.equal(adapter.ready(),false);bot.game.gameMode='survival';bot.username='ag_test_eye';assert.equal(adapter.ready(),false);
  assert.ok(events.length>0);
});
test('zero yaw/pitch still raycasts; native dig completion and held-use release are respected',async()=>{
  const {bot,events}=botFixture(),adapter=createMineflayerControlAdapter(bot);
  const result=await adapter.action('primary',true);assert.equal(result.status,'confirmed');
  const ray=events.find(e=>e[0]==='ray');assert.equal(ray[2].z,-1);assert.equal(ray[3],4.5);
  bot.heldItem={name:'bread'};await adapter.action('secondary',true);await adapter.action('secondary',false);
  assert.ok(events.some(e=>e[0]==='activate'));assert.ok(events.some(e=>e[0]==='deactivate'));
  assert.equal((await adapter.action('hotbar',9)).reason,'invalid_slot');assert.equal((await adapter.action('navigate',{})).reason,'navigation_unavailable');
});

test('release waits for the old native write to settle before resuming the Agent or accepting another browser',async()=>{
  let finish;const h=harness({adapter:{action:()=>new Promise(r=>{finish=r;})}});
  try {
    await h.request('acquire');const action=h.request('secondary',{pressed:true});await h.advance(0);
    await h.request('release');assert.equal(h.bridge.snapshot().active,false);
    assert.equal(h.calls.filter(c=>c[0]==='release').length,0);
    assert.equal((await h.request('acquire')).reason,'control_busy');
    finish({ok:true,status:'confirmed'});assert.equal((await action).status,'unknown');await h.advance(0);
    assert.equal(h.calls.filter(c=>c[0]==='release').length,1);
    assert.equal((await h.request('acquire')).status,'active');
  } finally {await h.bridge.dispose();}
});

test('failed Agent resume remains visible; an unused viewer never stops the Agent',async()=>{
  const h=harness({release:async()=>{throw Error('resume failed');}});
  await h.request('acquire');await h.request('release');await h.advance(0);
  assert.equal(h.socket.state().reason,'agent_resume_failed');await h.bridge.dispose();
  const idle=harness();await idle.bridge.dispose();assert.deepEqual(idle.calls,[]);
});

test('pending acquisition is cancelled on disposal and returns to its Agent exactly once',async()=>{
  let finish,signal;const h=harness({acquire:args=>{signal=args.signal;return new Promise(r=>{finish=r;});}});
  const acquisition=h.request('acquire');await h.advance(0);
  const disposal=h.bridge.dispose();assert.equal(signal.aborted,true);finish();await disposal;
  assert.equal((await acquisition).reason,'acquire_cancelled');
  assert.equal(h.calls.filter(c=>c[0]==='release').length,1);assert.equal(h.bridge.snapshot().active,false);
});

test('navigation phase persists until cancelled and movement aborts its operation',async()=>{
  let finish,signal;const h=harness({adapter:{action:(_t,_v,args)=>{signal=args.signal;return new Promise(r=>{finish=r;});}}});
  try {
    await h.request('acquire');const operation=h.request('navigate',{ray:{}});await h.advance(0);
    assert.equal(h.socket.state().phase,'navigating');await h.advance(800);assert.equal(signal.aborted,false);
    await h.request('motion',{input:{forward:1,strafe:0,cameraYaw:0}});assert.equal(signal.aborted,true);
    finish({ok:false,status:'unknown',reason:'cancelled'});await operation;assert.equal(h.socket.state().phase,'manual');
  }finally{await h.bridge.dispose();}
});

test('late look failure from a retired operation cannot stop a new controller; stop tries every cleanup',async()=>{
  const {bot,events}=botFixture();let reject;
  bot.look=()=>new Promise((_r,j)=>{reject=j;});
  const adapter=createMineflayerControlAdapter(bot,{cancelNavigation(){throw Error('pathfinder disconnected');}});
  // Stationary first-person look does not need to cancel navigation.
  adapter.motion(normalizeControlMotion({forward:0,strafe:0,cameraYaw:0,movementMode:'first_person',lookYaw:0,lookPitch:0}));
  adapter.stop();const count=events.length;reject(Error('late'));await new Promise(r=>setImmediate(r));assert.equal(events.length,count);
  bot.heldItem={name:'bread'};
  const usable=createMineflayerControlAdapter(bot);await usable.action('secondary',true);
  bot.clearControlStates=()=>{throw Error('disconnected');};usable.stop();assert.ok(events.some(e=>e[0]==='deactivate'));
});

test('click navigation confirms actual arrival, uses separate non-destructive movements and restores original settings',async()=>{
  const {bot}=botFixture(),original={canDig:true},modes=[];
  bot.world.raycast=()=>({position:new Vec3(3,63,2),face:1});
  class GoalNear {constructor(x,y,z){Object.assign(this,{x,y,z});}isEnd(p){return p.x===this.x&&p.y===this.y&&p.z===this.z;}}
  bot.pathfinder={movements:original,goal:null,setMovements(m){this.movements=m;modes.push(m);},setGoal(g){this.goal=g;},
    async goto(goal){this.goal=goal;bot.entity.position=new Vec3(goal.x,goal.y,goal.z);}};
  const navigate=createMineflayerRayNavigation(bot,{GoalNear,createMovements:()=>({canDig:true,scafoldingBlocks:[1]})});
  const ray={origin:{x:0,y:65,z:0},direction:{x:0,y:-1,z:0}};
  assert.equal((await navigate(ray)).status,'confirmed');assert.equal(modes[0].canDig,false);assert.deepEqual(modes[0].scafoldingBlocks,[]);
  assert.equal(bot.pathfinder.movements,original);assert.equal(original.canDig,true);
  bot.pathfinder.goto=async()=>{};bot.entity.position=new Vec3(0,64,0);
  assert.equal((await navigate(ray)).reason,'navigation_failed');
  let reject;bot.pathfinder.goto=goal=>{bot.pathfinder.goal=goal;return new Promise((_r,j)=>{reject=j;});};
  bot.pathfinder.setGoal=g=>{bot.pathfinder.goal=g;if(g===null)reject(Error('cancelled'));};
  const abort=new AbortController(),pending=navigate(ray,{signal:abort.signal});abort.abort();
  assert.equal((await pending).reason,'cancelled');assert.equal(bot.pathfinder.movements,original);
});
