/** A bounded visual-only snapshot buffer. Never predicts beyond a received
 * position. Repeated pose/equipment packets cannot restart the movement arc. */
export class EntityPositionTimeline {
  constructor(delayMs=100){this.delayMs=delayMs;this.samples=[];}
  push(position,now,{instant=false,from=position}={}) {
    const last=this.samples.at(-1);
    if(!['x','y','z'].every(k=>Number.isFinite(position[k])) || !Number.isFinite(now))return;
    const gap=last?now-last.at:Infinity;
    if(instant || !last || gap>400 || Math.hypot(position.x-last.x,position.y-last.y,position.z-last.z)>4) {
      this.samples.length=0;
      this.samples.push({...(instant||last?position:from),at:now-this.delayMs});
    }
    if(this.samples.at(-1)?.at===now)this.samples.pop();
    this.samples.push({x:position.x,y:position.y,z:position.z,at:now});
    if(this.samples.length>32)this.samples.splice(0,this.samples.length-32);
  }
  sample(now,out={}) {
    const time=now-this.delayMs,rows=this.samples;
    while(rows.length>2 && rows[1].at<=time)rows.shift();
    if(!rows.length)return null;
    const a=rows[0],b=rows[1]??a;
    const t=b.at>a.at?Math.max(0,Math.min(1,(time-a.at)/(b.at-a.at))):1;
    for(const k of ['x','y','z'])out[k]=a[k]+(b[k]-a[k])*t;
    return out;
  }
}
