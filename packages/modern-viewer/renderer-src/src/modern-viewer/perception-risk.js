/** Visual attention estimates, never calibrated probabilities or server AI ranges. */
export class VisibleMotion {
  constructor(){this.previous=new Map();}
  clear(){this.previous.clear();}
  sample(entities,now=performance.now()){
    const result=[],present=new Set();
    for(const entity of entities){
      const p=entity.pos??entity.position;if(!p)continue;
      present.add(entity.id);const old=this.previous.get(entity.id),dt=old?(now-old.at)/1000:0;
      let forecast=null;
      if(old&&dt>=.1&&dt<=1.5){
        const vx=(p.x-old.pos.x)/dt,vz=(p.z-old.pos.z)/dt,speed=Math.hypot(vx,vz);
        if(speed<=8)forecast={x:p.x+vx,z:p.z+vz,radius:.6+Math.min(3,speed*.5),horizonMs:1000,probability:null};
      }
      if(!old||dt>=.1)this.previous.set(entity.id,{pos:{x:p.x,y:p.y,z:p.z},at:now});
      result.push({entity,forecast});
    }
    for(const id of this.previous.keys())if(!present.has(id))this.previous.delete(id);
    return result;
  }
}
export function focusEntities(entities,mode,self,classify){
  const p=self.pos??self.position;
  const rank=e=>{
    const kind=classify(e)?.kind,pos=e.pos??e.position,d=Math.hypot(pos.x-p.x,pos.y-p.y,pos.z-p.z);
    if(kind==='danger')return 0;
    if(kind==='hostile')return d<6?1:mode==='peaceful'?5:2;
    return ['player','npc'].includes(kind)?3:4;
  };
  return [...entities].filter(e=>mode!=='combat'||['danger','hostile','player'].includes(classify(e)?.kind))
    .sort((a,b)=>rank(a)-rank(b)).slice(0,mode==='peaceful'?8:16);
}
export function drawRisk(ctx,frame,samples,classify){
  if(!frame.visibleCells?.size)return;
  const b=frame.spec.bounds,scale=ctx.canvas.width/frame.spec.span;
  const project=p=>[(p.x-b.minX)*scale,(p.z-b.minZ)*scale];
  ctx.save();ctx.beginPath();
  for(const key of frame.visibleCells){const [x,z]=key.split(',').map(Number);ctx.rect(...project({x,z}),scale,scale);}
  ctx.clip();
  for(const {entity,forecast} of samples){
    if(!['hostile','danger'].includes(classify(entity)?.kind))continue;
    const p=entity.pos??entity.position;
    // This is a focus glow around observed danger, not an attack-radius circle.
    const [x,y]=project(forecast??p),radius=(forecast?.radius??1)*scale;
    const gradient=ctx.createRadialGradient(x,y,0,x,y,Math.max(1,radius));
    gradient.addColorStop(0,'rgba(255,96,74,.36)');gradient.addColorStop(1,'rgba(255,96,74,0)');
    ctx.fillStyle=gradient;ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
    if(forecast){const at=project(p);ctx.strokeStyle='#ffa884';ctx.lineWidth=1.5;ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(...at);ctx.lineTo(x,y);ctx.stroke();}
  }
  ctx.restore();
}
