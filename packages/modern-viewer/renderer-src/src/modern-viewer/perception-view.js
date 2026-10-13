import chunks from 'prismarine-chunk';
import {Vec3} from 'vec3';

const air=new Set(['air','cave_air','void_air']);
const transparent=name=>air.has(name)||name==='water'||name==='glass'||name==='glass_pane'||name.endsWith('_stained_glass')||name.endsWith('_stained_glass_pane');
const finite=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
const posKey=(x,z)=>`${Math.floor(x/16)*16},${Math.floor(z/16)*16}`;

/** A private cache of received geometry used only for masking. Its contents are
 * never exposed as perception. Unknown columns/geometry fail closed. */
export class SightGrid {
  constructor(version){this.Chunk=chunks(version);this.columns=new Map();this.tops=new Map();this.blocks=new Map();this.readers=new Set();this.revision=0;this.minY=-64;this.maxY=320;}
  ingest(data){
    if(data.worldConfig){this.minY=data.worldConfig.minY;this.maxY=this.minY+data.worldConfig.worldHeight;}
    this.blocks.clear();this.revision++;
    try{this.columns.set(`${data.x},${data.z}`,this.Chunk.fromJson(data.chunk));this.tops.clear();}
    catch{this.columns.delete(`${data.x},${data.z}`);this.tops.clear();}
  }
  remove(x,z){this.columns.delete(`${x},${z}`);this.tops.clear();this.blocks.clear();this.revision++;}
  update(pos,stateId){
    const col=this.columns.get(posKey(pos.x,pos.z)),p=new Vec3((Math.floor(pos.x)%16+16)%16,Math.floor(pos.y),(Math.floor(pos.z)%16+16)%16);
    if(col)for(const reader of this.readers)reader.beforeUpdate(col,p);
    col?.setBlockStateId(p,stateId);this.tops.clear();this.blocks.clear();this.revision++;
  }
  clear(){this.columns.clear();this.tops.clear();this.blocks.clear();this.revision++;}
  /** Pin received geometry for one captured image, without copying whole chunks.
   * Rare block edits save their old cells until this private read is released. */
  snapshot(){
    const snap=Object.create(SightGrid.prototype),edits=new Map();
    Object.assign(snap,{columns:new Map(),tops:new Map(),blocks:new Map(),minY:this.minY,maxY:this.maxY,revision:this.revision});
    const key=p=>`${p.x},${p.y},${p.z}`;
    for(const [id,col]of this.columns){
      const old=new Map();edits.set(col,old);
      snap.columns.set(id,{getBlock:p=>old.get(key(p))?.block??col.getBlock(p),getBlockStateId:p=>old.get(key(p))?.stateId??col.getBlockStateId(p)});
    }
    const reader={beforeUpdate(col,p){const old=edits.get(col),id=key(p);if(old&&!old.has(id))old.set(id,{block:col.getBlock(p),stateId:col.getBlockStateId(p)});}};
    this.readers.add(reader);snap.release=()=>{this.readers.delete(reader);};return snap;
  }
  block(x,y,z){
    const col=this.columns.get(posKey(x,z));if(!col)return null;
    if(y>=this.maxY||y<this.minY)return {name:'air',shapes:[]};
    // Thousands of neighbouring visibility rays revisit the same voxels. Cache
    // decoded collision shapes privately, invalidating on every geometry change.
    const key=`${x},${y},${z}`;if(this.blocks.has(key))return this.blocks.get(key);
    const block=col.getBlock(new Vec3((x%16+16)%16,y,(z%16+16)%16));
    if(this.blocks.size<32768)this.blocks.set(key,block);
    return block;
  }
  top(x,z,layer){
    const minY=Math.max(this.minY,layer?.minY??this.minY),maxY=Math.min(this.maxY,layer?.maxY??this.maxY);
    const key=`${x},${z},${minY}:${maxY}`;if(this.tops.has(key))return this.tops.get(key);
    const col=this.columns.get(posKey(x,z));if(!col)return null;
    const local=new Vec3((x%16+16)%16,Math.ceil(maxY)-1,(z%16+16)%16);
    for(;local.y>=Math.floor(minY);local.y--){
      const id=col.getBlockStateId(local);if(!id)continue;
      const block=col.getBlock(local);if(air.has(block?.name))continue;
      const top=local.y+(block?.shapes?.length?Math.max(...block.shapes.map(s=>s[4])):1);
      // A cut through solid geometry is not a measured exposed surface. Never
      // scan past that wall to reveal the room or floor underneath it.
      const surface=top<=maxY&&top>=minY?top:null;
      this.tops.set(key,surface);return surface;
    }
    this.tops.set(key,null);return null;
  }
}

/** Inclusive slab intersection for actual collision shapes; leaves and unknown
 * non-air geometry are conservatively opaque. Glass/water remain transparent. */
function intersects(a,d,box,cell){
  let near=0,far=1-1e-6;
  for(let i=0;i<3;i++){
    const lo=box[i]+cell[i],hi=box[i+3]+cell[i];
    if(Math.abs(d[i])<1e-9){if(a[i]<lo||a[i]>hi)return false;}
    else{const u=(lo-a[i])/d[i],v=(hi-a[i])/d[i];near=Math.max(near,Math.min(u,v));far=Math.min(far,Math.max(u,v));if(near>far)return false;}
  }
  return far>=0&&near<1-1e-6;
}
export function clearSight(grid,from,to){
  if(!grid||!finite(from)||!finite(to))return false;
  const a=[from.x,from.y,from.z],b=[to.x,to.y,to.z],d=b.map((n,i)=>n-a[i]);
  if(Math.hypot(...d)>64)return false;
  const cell=a.map(Math.floor),end=b.map(Math.floor),step=d.map(Math.sign);
  const delta=d.map(n=>n?Math.abs(1/n):Infinity);
  const edge=d.map((n,i)=>n?((step[i]>0?cell[i]+1:cell[i])-a[i])/n:Infinity);
  // Shape collar handles fences extending beyond a block. Adjacent unloaded
  // columns make the boundary uncertain instead of silently becoming air.
  const tested=new Set();
  const check=at=>{
    for(let dy=-1;dy<=1;dy++){
      const p=[at[0],at[1]+dy,at[2]],key=p.join(',');if(tested.has(key))continue;tested.add(key);
      const block=grid.block(...p);if(!block)return false;
      if(transparent(block.name))continue;
      const shapes=block.shapes?.length?block.shapes:[[0,0,0,1,1,1]];
      if(shapes.some(shape=>intersects(a,d,shape,p)))return false;
    }
    return true;
  };
  for(let count=0;count<256;count++){
    if(!check(cell))return false;
    if(cell.every((n,i)=>n===end[i]))return true;
    const next=Math.min(...edge);if(next>1)return true;
    const axes=edge.map((v,i)=>Math.abs(v-next)<1e-10?i:-1).filter(i=>i>=0);
    for(let mask=1;mask<(1<<axes.length);mask++){
      const neighbor=[...cell];axes.forEach((axis,j)=>{if(mask&(1<<j))neighbor[axis]+=step[axis];});
      if(!check(neighbor))return false;
    }
    for(const i of axes){cell[i]+=step[i];edge[i]+=delta[i];}
  }
  return false;
}
export function eyeOf(self){const p=self?.pos??self?.position;return finite(p)?{x:p.x,y:p.y+(Number.isFinite(self.eyeHeight)?self.eyeHeight:1.62),z:p.z}:null;}
export function inView(self,to){
  const eye=eyeOf(self);if(!eye||!finite(to))return false;
  const dx=to.x-eye.x,dy=to.y-eye.y,dz=to.z-eye.z,flat=Math.hypot(dx,dz);
  if(Math.hypot(flat,dy)>32)return false;
  const yaw=Math.atan2(-dx,-dz),diff=Math.atan2(Math.sin(yaw-(self.yaw||0)),Math.cos(yaw-(self.yaw||0)));
  return Math.abs(diff)<=Math.PI*55/180&&Math.abs(Math.atan2(dy,flat)-(self.pitch||0))<=Math.PI*40/180;
}
export function visibleEntity(grid,self,entity){
  const p=entity?.pos??entity?.position,eye=eyeOf(self);if(!eye||!finite(p))return false;
  const height=Number.isFinite(entity.height)&&entity.height>0?entity.height:1;
  return [.25,.5,.85].some(part=>{const point={x:p.x,y:p.y+height*part,z:p.z};return inView(self,point)&&clearSight(grid,eye,point);});
}
export function visibleSurface(grid,self,x,z,layer){
  const y=grid?.top(x,z,layer),eye=eyeOf(self);if(!Number.isFinite(y)||!eye)return false;
  return [[.15,.15],[.85,.15],[.15,.85],[.85,.85]].every(([dx,dz])=>{
    const point={x:x+dx,y:y+.02,z:z+dz};return inView(self,point)&&clearSight(grid,eye,point);
  });
}

/** Audible hints intentionally drop packet entity IDs and precise positions. */
export function hearingHint(event,self,now=Date.now()){
  const p=self?.pos??self?.position,s=event?.position;
  if(!finite(p)||!finite(s)||(event.entityId!==undefined&&event.entityId===self.id)||!(event.volume>0))return null;
  const dx=s.x-p.x,dz=s.z-p.z,distance=Math.hypot(dx,s.y-p.y,dz);
  const range=Number.isFinite(event.fixedRange)?event.fixedRange:16*Math.max(1,event.volume);
  if(distance>=range||distance<1.5)return null;
  const name=String(event.name??'');
  const kind=/step|swim|splash/.test(name)?'脚步或移动声':/creeper.*primed|tnt.*primed/.test(name)?'引信声':/explode/.test(name)?'爆炸声':/hurt|attack|shoot|bow/.test(name)?'战斗声':event.category==='hostile'?'怪物声':event.category==='neutral'?'生物声':null;
  if(!kind)return null;
  const directions=['北','东北','东','东南','南','西南','西','西北'];
  const direction=directions[(Math.round(Math.atan2(dx,-dz)/(Math.PI/4))+8)%8];
  return {source:'hearing',kind,direction,distance:distance<4?'近处':distance<12?'中距离':'远处',heardAt:now,expiresAt:now+4000};
}

/** Session-local visual history. Only directly visible top faces enter the
 * cache. Hidden cells keep their old pixels, never a fresh overhead render. */
export class TerrainMemory {
  constructor(document){this.document=document;this.cells=new Map();this.revision=0;}
  clear(){this.cells.clear();this.revision++;}
  apply(frame,grid,self,now=Date.now()){
    const work=this.compose(frame,grid,self,now,true);let step;
    do{step=work.next();}while(!step.done);return step.value;
  }
  async applyBudgeted(frame,grid,self,{yieldFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve)),valid=()=>true,budgetMs=3,clock=()=>performance.now(),now=Date.now()}={}){
    const revision=this.revision,geometry=grid.revision,work=this.compose(frame,grid,self,now,false);
    let workMs=0,maxSliceMs=0;
    while(valid()&&revision===this.revision&&geometry===grid.revision){
      const start=clock();let step;
      do{step=work.next();}while(!step.done&&clock()-start<budgetMs);
      const elapsed=clock()-start;workMs+=elapsed;maxSliceMs=Math.max(maxSliceMs,elapsed);
      if(step.done)return {...step.value,workMs,maxSliceMs};
      await yieldFrame();
    }
    work.return();return null;
  }
  *compose(frame,grid,self,now,reuse){
    const {spec}=frame,width=frame.canvas.width,height=frame.canvas.height,scale=width/spec.span,b=spec.bounds;
    const canvas=this.document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#b8c5ca';ctx.fillRect(0,0,width,height);
    let current=0,historical=0;const visibleCells=new Set(),pending=new Map();
    // Large overview requests must not iterate millions of unseen columns.
    const p=self.pos??self.position,keys=new Set(this.cells.keys());
    for(let z=Math.floor(Math.max(b.minZ,p.z-32));z<Math.min(b.maxZ,p.z+32);z++)
      for(let x=Math.floor(Math.max(b.minX,p.x-32));x<Math.min(b.maxX,p.x+32);x++)keys.add(`${x},${z}`);
    for(const key of keys){
      yield;
      const [x,z]=key.split(',').map(Number);if(x+1<b.minX||x>b.maxX||z+1<b.minZ||z>b.maxZ)continue;
      const px=(x-b.minX)*scale,pz=(z-b.minZ)*scale;
      // Reject distant/off-camera cells before looking up hidden top geometry.
      const flat=Math.hypot(x+.5-p.x,z+.5-p.z);
      const heading=Math.atan2(-(x+.5-p.x),-(z+.5-p.z));
      const diff=Math.atan2(Math.sin(heading-(self.yaw||0)),Math.cos(heading-(self.yaw||0)));
      const seen=flat<=32&&Math.abs(diff)<=Math.PI*55/180&&visibleSurface(grid,self,x,z,spec.layer);
      if(seen&&px>=0&&pz>=0&&px+scale<=width&&pz+scale<=height){
        const tile=(reuse?this.cells.get(key)?.canvas:null)??this.document.createElement('canvas');
        if(tile.width!==8||tile.height!==8){tile.width=8;tile.height=8;}
        tile.getContext('2d').drawImage(frame.canvas,px,pz,scale,scale,0,0,8,8);
        pending.set(key,{canvas:tile,seenAt:now,y:grid.top(x,z,spec.layer),layer:spec.layer?.kind??'surface'});current++;
        visibleCells.add(key);
      }
      const known=pending.get(key)??this.cells.get(key);if(!known)continue;
      if(known.layer!==(spec.layer?.kind??'surface')||spec.layer&&(known.y<spec.layer.minY||known.y>spec.layer.maxY))continue;
      ctx.drawImage(known.canvas,px,pz,scale+.3,scale+.3);
      if(!seen){historical++;ctx.strokeStyle='rgba(219,231,237,.55)';ctx.lineWidth=.65;ctx.beginPath();ctx.moveTo(px,pz);ctx.lineTo(px+scale,pz+scale);ctx.stroke();}
    }
    for(const [key,value]of pending){this.cells.delete(key);this.cells.set(key,value);}
    while(this.cells.size>8192)this.cells.delete(this.cells.keys().next().value);
    return {...frame,canvas,visibleCells,perception:{current,historical,source:'eye-line-of-sight',history:'session-only',layer:spec.layer??null}};
  }
}
