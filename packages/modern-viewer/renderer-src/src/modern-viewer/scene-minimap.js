import { WebGLRenderTarget, Vector4, SRGBColorSpace } from 'three';
import { overviewCamera, overviewCoverage } from './overview-capture.js';
import { TerrainMemory, visibleEntity, hearingHint } from './perception-view.js';
import { VisibleMotion, focusEntities, drawRisk } from './perception-risk.js';

const nameOf = entity => String(entity?.name ?? '').replace(/^minecraft:/, '').toLowerCase();
const conditional = new Set(['enderman', 'spider', 'bee', 'wolf', 'polar_bear', 'piglin', 'zombified_piglin', 'iron_golem', 'dolphin', 'panda', 'llama', 'trader_llama', 'goat']);
const hostile = new Set(['blaze','bogged','breeze','creeper','drowned','elder_guardian','ender_dragon','endermite','evoker','ghast','guardian','hoglin','husk','magma_cube','phantom','piglin_brute','pillager','ravager','shulker','silverfish','skeleton','slime','stray','vex','vindicator','warden','witch','wither','wither_skeleton','zoglin','zombie','zombie_villager']);
const passive = new Set(['allay','armadillo','axolotl','bat','camel','cat','chicken','cod','cow','donkey','fox','frog','glow_squid','horse','mooshroom','mule','ocelot','parrot','pig','pufferfish','rabbit','salmon','sheep','skeleton_horse','sniffer','snow_golem','squid','strider','tadpole','tropical_fish','turtle','zombie_horse']);
const scenery = new Set(['armor_stand','item','experience_orb','item_frame','glow_item_frame','painting','area_effect_cloud','interaction','lightning_bolt','fishing_bobber']);
export const MAP_KINDS = Object.freeze({
  player: { label:'玩家', color:'#7dceff', symbol:'●', priority:3 },
  npc: { label:'居民', color:'#ffd47a', symbol:'■', priority:4 },
  neutral: { label:'中立', color:'#95e5af', symbol:'○', priority:5 },
  hostile: { label:'敌对', color:'#ff777f', symbol:'◆', priority:2 },
  danger: { label:'警戒', color:'#ff525f', symbol:'▲', priority:0 },
  unknown: { label:'未知', color:'#d0d5df', symbol:'?', priority:6 },
});
export function dimensionLabel(value) {
  return ({overworld:'主世界',the_nether:'下界',the_end:'末地'})[String(value ?? '').replace(/^minecraft:/,'')] ?? '维度未知';
}

/** Species is not a team or an attack target. Only versioned, received metadata
 * can elevate a normally neutral mob to an observable warning. */
export function mapEntityKind(entity, registry = {}) {
  const name=nameOf(entity), definition=registry[name];
  if (!entity || entity.delete || entity.isSelf || entity.dead || entity.isDead || entity.health === 0 || entity.invisible) return null;
  if (scenery.has(name) || /_(display|minecart|boat)$/.test(name) || ['boat','minecart','arrow','spectral_arrow','trident','snowball','egg','fireball','small_fireball','wind_charge','breeze_wind_charge','potion','firework_rocket','falling_block','tnt'].includes(name)) return null;
  const read = key => {
    const index=definition?.metadataKeys?.indexOf(key) ?? -1;
    return index < 0 ? undefined : entity.metadata?.[index];
  };
  const flags=read('shared_flags'), health=read('health');
  if ((typeof flags==='number' && (flags & 32)) || (typeof health==='number' && health<=0)) return null;
  if (name==='player' || entity.type==='player') return {kind:'player',reason:'玩家；队伍和敌我关系未确认'};
  if (name==='villager' || name==='wandering_trader' || entity.kind==='npc' || entity.type==='npc') return {kind:'npc',reason:'居民；不推断队友关系'};
  if (name==='creeper' && (read('swell')===1 || read('is_ignited')===true)) return {kind:'danger',reason:'爬行者正在膨胀或已点燃'};
  if (conditional.has(name)) {
    const angry = typeof read('remaining_anger_time')==='number' && read('remaining_anger_time')>0;
    const enderman = name==='enderman' && read('creepy')===true;
    const bee = name==='bee' && typeof read('flags')==='number' && (read('flags') & 2)!==0;
    return angry || enderman || bee ? {kind:'danger',reason:'元数据表明已警戒；攻击对象未知'} : {kind:'neutral',reason:'条件中立生物；当前攻击意图未知'};
  }
  if (hostile.has(name) || name==='cave_spider') return {kind:'hostile',reason:'按原版种类归为敌对；不代表正在攻击你'};
  if (passive.has(name)) return {kind:'neutral',reason:'普通生物；不代表安全保证或队友'};
  // Unrecognised/custom entities stay unknown, regardless of their display name.
  return {kind:'unknown',reason:'实体种类或关系未确认'};
}

export function mapSpec(position, span=48, size=384) {
  return {center:[position.x,position.z],span,width:size,height:size,
    bounds:{minX:position.x-span/2,maxX:position.x+span/2,minZ:position.z-span/2,maxZ:position.z+span/2}};
}
export function mapPixel(position, spec, size=spec.width) {
  return [(position.x-spec.bounds.minX)*size/spec.span,(position.z-spec.bounds.minZ)*size/spec.span];
}
// Mineflayer yaw: zero looks north (-Z), positive turns west (-X).
export function mapHeading(yaw) { return [-Math.sin(yaw), -Math.cos(yaw)]; }

/** A small offscreen terrain pass. Reuses the main scene/meshes/texture atlas;
 * no second world, chunk subscription, PNG encoding or visible camera switch. */
export class MinimapTerrain {
  constructor(document, size=384) {
    this.size=size; this.canvas=document.createElement('canvas');
    this.canvas.width=size; this.canvas.height=size;
    this.context=this.canvas.getContext('2d');
    this.target=new WebGLRenderTarget(size,size,{depthBuffer:true});
    this.target.texture.colorSpace=SRGBColorSpace;
    this.bytes=new Uint8Array(size*size*4);
    this.image=this.context.createImageData(size,size);
  }
  capture(world, spec) {
    const renderer=world?.renderer, origin=world?.sceneOrigin;
    if (!renderer || !origin || !world.cameraWorldPos || !world.render) throw Error('地形渲染器尚未就绪');
    const coverage=overviewCoverage(spec.bounds,world.finishedChunks);
    if (!coverage.meshed) throw Error('附近区块尚未加载');
    const minY=world.worldSizeParams.minY, maxY=minY+world.worldSizeParams.worldHeight;
    const config=world.displayOptions?.inWorldRenderingConfig;
    const old={camera:world.camera,pos:{...world.cameraWorldPos},origin:[origin.x,origin.y,origin.z],
      fog:world.scene.fog,cull:world.reactiveDebugParams.smartCull,render:renderer.render,
      target:renderer.getRenderTarget(),viewport:renderer.getViewport(new Vector4()),
      scissor:renderer.getScissor(new Vector4()),scissorTest:renderer.getScissorTest(),
      autoClear:renderer.autoClear,hand:config?.showHand,entityRender:world.entities?.render,onRender:world.onRender};
    let camera;
    const detached=[...Object.values(world.entities?.entities??{}),world.entities?.playerEntity].filter(object=>object?.parent).map(object=>({object,parent:object.parent,index:object.parent.children.indexOf(object)}));
    try {
      for(const {object,parent} of detached)parent.remove(object);
      // Keep the floating scene origin unchanged. Changing it for every inset
      // pass needlessly rebases the main world's shared geometry buffers.
      const view=overviewCamera(spec,origin,minY,maxY); camera=view.camera;
      world.camera=camera; Object.assign(world.cameraWorldPos,{x:view.at[0],y:view.at[1],z:view.at[2]});
      world.reactiveDebugParams.smartCull=false;
      if(config)config.showHand=false;
      if(world.entities)world.entities.render=()=>{};
      world.onRender=[];
      renderer.render=function(scene,activeCamera) {
        if(activeCamera===camera)scene.fog=null;
        return old.render.call(this,scene,activeCamera);
      };
      renderer.setRenderTarget(this.target);renderer.setScissorTest(false);renderer.autoClear=true;
      world.render();
      renderer.readRenderTargetPixels(this.target,0,0,this.size,this.size,this.bytes);
      const row=this.size*4;
      for(let y=0;y<this.size;y++) this.image.data.set(this.bytes.subarray((this.size-y-1)*row,(this.size-y)*row),y*row);
      this.context.putImageData(this.image,0,0);
      return {canvas:this.canvas,spec,coverage};
    } finally {
      renderer.render=old.render;world.camera=old.camera;
      Object.assign(world.cameraWorldPos,old.pos);origin.update(...old.origin);
      world.scene.fog=old.fog;world.reactiveDebugParams.smartCull=old.cull;
      if(config)config.showHand=old.hand;
      renderer.setRenderTarget(old.target);renderer.setViewport(old.viewport);
      renderer.setScissor(old.scissor);renderer.setScissorTest(old.scissorTest);renderer.autoClear=old.autoClear;
      if(world.entities)world.entities.render=old.entityRender;
      world.onRender=old.onRender;
      for(const {object,parent,index} of detached){parent.add(object);parent.children.splice(parent.children.indexOf(object),1);parent.children.splice(index,0,object);}
      // The chunk renderer caches camera uniforms/culling outside THREE. Rebuild
      // those for the original view before allowing any following draw/capture.
      world.render();
    }
  }
  dispose(){this.target.dispose();}
}

/** Screen-space decluttering never moves markers off their true world position.
 * Compact clusters carry a count; hover lists each member outside the map. */
export function mapClusters(entities, self, spec, registry={}, size=384) {
  const groups=[], py=self.position?.y ?? self.pos?.y;
  for(const entity of entities) {
    if(String(entity.id)===String(self.id))continue;
    const status=mapEntityKind(entity,registry),pos=entity.pos ?? entity.position;
    if(!status || !pos || ![pos.x,pos.y,pos.z].every(Number.isFinite))continue;
    const [x,y]=mapPixel(pos,spec,size);
    if(x<8||y<8||x>size-8||y>size-8)continue;
    const member={entity,...status,x,y,deltaY:Number.isFinite(py)?pos.y-py:null};
    const group=groups.find(g=>Math.hypot(g.x-x,g.y-y)<17);
    if(group) { group.members.push(member); if(MAP_KINDS[status.kind].priority<MAP_KINDS[group.kind].priority)group.kind=status.kind; }
    else groups.push({...member,members:[member]});
  }
  return groups.sort((a,b)=>MAP_KINDS[b.kind].priority-MAP_KINDS[a.kind].priority);
}

function drawSymbol(ctx, group) {
  const {x,y,kind}=group, r=7;
  ctx.save();ctx.translate(x,y);ctx.strokeStyle='#10202b';ctx.lineWidth=4;ctx.fillStyle=MAP_KINDS[kind].color;
  ctx.beginPath();
  if(kind==='hostile'){ctx.moveTo(0,-r-2);ctx.lineTo(r+2,0);ctx.lineTo(0,r+2);ctx.lineTo(-r-2,0);ctx.closePath();}
  else if(kind==='danger'){ctx.moveTo(0,-r-3);ctx.lineTo(r+3,r);ctx.lineTo(-r-3,r);ctx.closePath();}
  else if(kind==='npc')ctx.rect(-r,-r,2*r,2*r);
  else ctx.arc(0,0,r,0,Math.PI*2);
  ctx.stroke();ctx.fill();
  if(kind==='neutral'){ctx.fillStyle='#10202b';ctx.beginPath();ctx.arc(0,0,3,0,Math.PI*2);ctx.fill();}
  const number=group.members.length>1?String(group.members.length):kind==='unknown'?'?':kind==='danger'?'!':null;
  if(number){ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#10202b';ctx.fillText(number,0,1);}
  // Hollow outer ring means a substantially different floor, not a terrain obstacle.
  if(group.members.every(m=>m.deltaY!==null&&Math.abs(m.deltaY)>5)){ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.setLineDash([2,3]);ctx.beginPath();ctx.arc(0,0,12,0,Math.PI*2);ctx.stroke();}
  ctx.restore();
}

export function drawSceneMap(ctx, frame, self, entities, registry={},risk=[]) {
  const size=ctx.canvas.width,spec=frame.spec;
  ctx.clearRect(0,0,size,size);ctx.drawImage(frame.canvas,0,0,size,size);
  // Unloaded columns stay explicitly hatched; never tint or dim known terrain.
  if(!frame.perception && frame.coverage.missing.length) {
    ctx.save();ctx.beginPath();
    for(const [x,z] of frame.coverage.missing){const p=mapPixel({x,z},spec,size);ctx.rect(...p,16*size/spec.span,16*size/spec.span);}
    ctx.clip();ctx.fillStyle='#1b2932';ctx.fillRect(0,0,size,size);ctx.strokeStyle='#546772';ctx.lineWidth=1;
    for(let x=-size;x<size;x+=18){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+size,size);ctx.stroke();}ctx.restore();
  }
  drawRisk(ctx,frame,risk,entity=>mapEntityKind(entity,registry));
  const groups=mapClusters(entities,self,spec,registry,size);
  for(const group of groups)drawSymbol(ctx,group);
  const pos=self.pos ?? self.position, [x,y]=mapPixel(pos,spec,size), [dx,dz]=mapHeading(Number(self.yaw)||0);
  ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(dx,-dz));
  ctx.strokeStyle='#123643';ctx.fillStyle='#fff7d5';ctx.lineWidth=4;
  ctx.beginPath();ctx.moveTo(0,-12);ctx.lineTo(8,9);ctx.lineTo(0,5);ctx.lineTo(-8,9);ctx.closePath();ctx.stroke();ctx.fill();ctx.restore();
  return groups;
}

export function installSceneMinimap({document,window,root,getWorld,getState,getEntities,getRegistry=()=>({}),getSight=()=>null,visible=()=>true}) {
  const canvas=root?.querySelector('canvas');if(!canvas)return null;
  canvas.width=384;canvas.height=384;
  const ctx=canvas.getContext('2d'),terrain=new MinimapTerrain(document),memory=new TerrainMemory(document),motion=new VisibleMotion();
  root.classList.add('corti-scene-minimap');
  const header=document.createElement('div');header.className='corti-map-header';
  const title=document.createElement('strong');title.textContent='周边地形';
  const north=document.createElement('span');north.textContent='北 ↑';
  const out=document.createElement('button'),inside=document.createElement('button');
  out.textContent='−';out.title='看得更远';out.setAttribute('aria-label','扩大地图范围');
  inside.textContent='＋';inside.title='放大附近';inside.setAttribute('aria-label','缩小地图范围');
  header.append(title,north,out,inside);root.prepend(header);
  const mode=document.createElement('select');mode.className='corti-map-mode';mode.setAttribute('aria-label','地图关注模式');
  for(const [value,label] of [['peaceful','和平'],['explore','探索'],['combat','战斗']]){const option=document.createElement('option');option.value=value;option.textContent=label;mode.append(option);}mode.value='explore';
  header.replaceChild(mode,title);
  const risk=document.createElement('button');risk.textContent='风险';risk.title='显示可见威胁的短时移动估计；非攻击范围或概率。';risk.setAttribute('aria-pressed','false');header.append(risk);
  let riskOn=false;
  const onRisk=()=>{riskOn=!riskOn;risk.setAttribute('aria-pressed',String(riskOn));draw();};risk.addEventListener('click',onRisk);
  const onMode=()=>{riskOn=mode.value==='combat';risk.setAttribute('aria-pressed',String(riskOn));draw();};mode.addEventListener('change',onMode);
  const legend=document.createElement('div');legend.className='corti-map-legend';
  for(const kind of ['player','npc','neutral','hostile','danger','unknown']){
    const item=document.createElement('span'),symbol=document.createElement('b');symbol.textContent=MAP_KINDS[kind].symbol;
    symbol.style.color=MAP_KINDS[kind].color;item.append(symbol,MAP_KINDS[kind].label);legend.append(item);
  }
  root.append(legend);
  const sounds=document.createElement('div');sounds.className='corti-map-hearing';sounds.hidden=true;root.append(sounds);
  const detail=document.createElement('div');detail.className='corti-map-detail';detail.textContent='鼠标移到标记查看详情';root.append(detail);
  const caption=root.querySelector('[data-map-caption]');
  let span=48,frame=null,groups=[],last=0,next=0,dimension=null,disposed=false,hover=null,renderMs=0,failures=0,hints=[];
  const summary=()=>{
    const selected=hover&&groups.find(g=>Math.hypot(g.x-hover[0],g.y-hover[1])<20);
    if(selected){
      const rows=selected.members.map(m=>{
        const pos=m.entity.pos??m.entity.position, identity=m.entity.username||m.entity.identityName;
        return `${MAP_KINDS[m.kind].label}${identity?' · '+identity:''} · 高差 ${m.deltaY===null?'未知':Math.round(m.deltaY)+' 格'} · 坐标 ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)} · ${m.reason}`;
      });
      detail.textContent=rows[0]+(rows.length>1?` · 共 ${rows.length} 个`: '');detail.title=rows.join('\n');
    }else{detail.textContent=frame?(riskOn?'风险为估计 · 攻击／视野范围未知':`${span} 格 · 灰色未知 · 斜纹未更新`):'等待地形同步';detail.title='仅显示自身视线内的实体。历史地形未实时更新，刷新页面后重新探索；敌对种类不代表正在攻击你，玩家不默认当队友。风险云来自两次可见位置的1秒匀速外推，不是攻击范围、概率或寻路结果。';}
  };
  function reset(){frame=null;groups=[];hover=null;dimension=null;last=0;next=0;hints=[];memory.clear();motion.clear();ctx.clearRect(0,0,canvas.width,canvas.height);if(caption)caption.textContent='等待地图同步';sounds.hidden=true;summary();}
  function draw(now=performance.now()) {
    if(disposed)return;
    const state=getState(),self=state?.entity,pos=self?.pos??self?.position;
    if(!state?.connected||!pos){if(frame)reset();return;}
    if(state.dimension!==dimension){reset();dimension=state.dimension;}
    if(document.hidden || !visible() || !root.getClientRects().length)return;
    const moved=!frame||Math.hypot(pos.x-frame.spec.center[0],pos.z-frame.spec.center[1])>span*.12;
    if(now>=next&&(moved||now-last>=1500)){
      const start=performance.now();
      try {frame=memory.apply(terrain.capture(getWorld(),mapSpec(pos,span)),getSight(),self);last=now;failures=0;}
      catch{failures++;if(!frame||now-last>5000){frame=null;groups=[];ctx.clearRect(0,0,canvas.width,canvas.height);}}
      renderMs=performance.now()-start;
      next=now+Math.max(750,Math.min(5000,renderMs*24));
    }
    const observable=getEntities().filter(entity=>mapEntityKind(entity,getRegistry())&&visibleEntity(getSight(),self,entity));
    const focused=focusEntities(observable,mode.value,self,entity=>mapEntityKind(entity,getRegistry()));
    const predictions=motion.sample(observable,now);
    if(frame)groups=drawSceneMap(ctx,frame,self,focused,getRegistry(),riskOn?predictions:[]);
    hints=hints.filter(h=>h.expiresAt>Date.now());sounds.hidden=!hints.length;
    sounds.textContent=hints.slice(-2).map(h=>`${h.direction} · ${h.distance} · ${h.kind}`).join('；');sounds.title='声响发生时的方位；近处约4格内，中距离约4–12格，远处约12格外。身份和精确位置未确认。';
    if(caption)caption.textContent=`${dimensionLabel(dimension)} · ${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)}${frame?'':' · 未加载'}`;
    root.dataset.mapSource=frame?'loaded-scene':'unavailable';summary();
  }
  const ranges=[24,48,96,192];
  function zoom(direction){span=ranges[Math.max(0,Math.min(ranges.length-1,ranges.indexOf(span)+direction))];frame=null;last=0;next=0;draw();}
  const onOut=()=>zoom(1),onIn=()=>zoom(-1);
  const onMove=event=>{const box=canvas.getBoundingClientRect();hover=[(event.clientX-box.left)*canvas.width/box.width,(event.clientY-box.top)*canvas.height/box.height];summary();};
  const onLeave=()=>{hover=null;summary();};
  out.addEventListener('click',onOut);inside.addEventListener('click',onIn);canvas.addEventListener('pointermove',onMove);canvas.addEventListener('pointerleave',onLeave);
  const timer=window.setInterval(()=>draw(),150);
  return {draw,reset,clearHearing(){hints=[];},setMode(value){if(['peaceful','explore','combat'].includes(value)){mode.value=value;onMode();}},
    hear(event){const hint=hearingHint(event,getState()?.entity);if(hint){hints=hints.filter(h=>h.kind!==hint.kind||h.direction!==hint.direction);hints.push(hint);hints=hints.slice(-6);}},
    diagnostics:()=>({source:frame?'loaded-scene':'unavailable',mode:mode.value,span,renderMs,failures,perception:frame?.perception,markers:groups.reduce((sum,g)=>sum+g.members.length,0)}),
    dispose(){disposed=true;window.clearInterval(timer);terrain.dispose();memory.clear();motion.clear();header.remove();legend.remove();detail.remove();sounds.remove();risk.removeEventListener('click',onRisk);mode.removeEventListener('change',onMode);out.removeEventListener('click',onOut);inside.removeEventListener('click',onIn);canvas.removeEventListener('pointermove',onMove);canvas.removeEventListener('pointerleave',onLeave);}};
}
