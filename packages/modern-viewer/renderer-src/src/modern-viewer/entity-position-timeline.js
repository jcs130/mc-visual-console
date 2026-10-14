/** A bounded visual-only snapshot buffer. Never predicts beyond a received
 * position. Repeated pose/equipment packets cannot restart the movement arc. */
export class EntityPositionTimeline {
  constructor(delayMs=150){
    this.minDelayMs=delayMs;this.delayMs=delayMs;this.samples=[];
    this.arrivalGaps=[];this.playbackAt=null;this.frameAt=null;
  }
  push(position,now,{instant=false,from=position}={}) {
    const last=this.samples.at(-1);
    if(!['x','y','z'].every(k=>Number.isFinite(position[k])) || !Number.isFinite(now))return;
    const gap=last?now-last.at:Infinity;
    if(gap<0)return;
    if(!instant && last && ['x','y','z'].every(k=>position[k]===last[k]))return;
    if(gap>0 && gap<=500 && !instant) {
      this.arrivalGaps.push(gap);
      if(this.arrivalGaps.length>24)this.arrivalGaps.shift();
      const sorted=[...this.arrivalGaps].sort((a,b)=>a-b);
      this.delayMs=Math.max(this.minDelayMs,Math.min(250,sorted[Math.floor((sorted.length-1)*.9)]+30));
    }
    if(instant || !last || Math.hypot(position.x-last.x,position.y-last.y,position.z-last.z)>4) {
      this.samples.length=0;
      this.samples.push({...(instant||last?position:from),at:now-this.delayMs});
      this.playbackAt=now-this.delayMs;this.frameAt=now;
    } else if(gap>Math.max(500,this.delayMs*3)) {
      // A delayed packet starts at the displayed position. Do not instantly
      // consume most of an old segment just because its timestamp is stale.
      const displayed={...from};
      this.samples.length=0;
      this.samples.push({...displayed,at:now-this.delayMs});
      this.playbackAt=now-this.delayMs;this.frameAt=now;
    }
    if(this.samples.at(-1)?.at===now)this.samples.pop();
    this.samples.push({x:position.x,y:position.y,z:position.z,at:now});
    if(this.samples.length>32)this.samples.splice(0,this.samples.length-32);
  }
  sample(now,out={}) {
    const rows=this.samples;
    if(!rows.length || !Number.isFinite(now))return null;
    const desired=now-this.delayMs;
    if(this.frameAt===null)this.playbackAt=desired;
    else {
      const dt=Math.max(0,now-this.frameAt);
      // Grow/shrink the jitter reserve without rewinding the actor or jumping
      // to a new clock. Only received segments are played; never extrapolate.
      const error=desired-(this.playbackAt+dt);
      this.playbackAt+=dt*(1+Math.max(-.2,Math.min(.1,error/250)));
    }
    this.frameAt=now;
    const time=this.playbackAt=Math.min(this.playbackAt,rows.at(-1).at);
    while(rows.length>2 && rows[1].at<=time)rows.shift();
    const a=rows[0],b=rows[1]??a;
    const t=b.at>a.at?Math.max(0,Math.min(1,(time-a.at)/(b.at-a.at))):1;
    for(const k of ['x','y','z'])out[k]=a[k]+(b[k]-a[k])*t;
    return out;
  }
}
