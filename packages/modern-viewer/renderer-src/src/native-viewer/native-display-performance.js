// Display-only observed samples. One physics tick of latency; never predicts.
export class NativeSelfDisplayPose {
  constructor () { this.reset() }
  reset () { this.resetVersion=(this.resetVersion??0)+1; this.samples=[]; this.identity=null; this.sequence=null; this.stale=false }
  receive (pose, at, identity, motion) {
    if (!pose || !['x','y','z','yaw','pitch','eyeHeight'].every(k=>Number.isFinite(pose[k])) || !Number.isFinite(at)) return
    const last=this.samples.at(-1), sequence=motion?.resetSequence??null
    if (identity!==this.identity || sequence!==this.sequence || (last && (at-last.at>250 || at<last.at || Math.hypot(pose.x-last.pose.x,pose.y-last.pose.y,pose.z-last.pose.z)>8))) {this.samples=[];this.resetVersion++}
    this.identity=identity;this.sequence=sequence
    this.samples.push({pose:{...pose},at});if(this.samples.length>8)this.samples.shift()
  }
  sample (now) {
    const rows=this.samples,last=rows.at(-1);if(!last)return null
    this.stale=now-last.at>250
    if(this.stale){this.samples=[last];return {...last.pose}}
    const target=now-50
    if(target<=rows[0].at)return {...rows[0].pose}
    for(let i=1;i<rows.length;i++)if(rows[i].at>=target){
      const a=rows[i-1],b=rows[i],t=b.at===a.at?1:(target-a.at)/(b.at-a.at),p={...b.pose}
      for(const k of ['x','y','z','pitch','eyeHeight'])p[k]=a.pose[k]+(b.pose[k]-a.pose[k])*t
      const delta=Math.atan2(Math.sin(b.pose.yaw-a.pose.yaw),Math.cos(b.pose.yaw-a.pose.yaw))
      p.yaw=a.pose.yaw+delta*t;return p
    }
    return {...last.pose}
  }
}

// Fixed visible RAF window, nearest-rank percentiles; hidden time never enters.
export class NativeFrameGaps {
  constructor () { this.values=new Float64Array(240);this.reset() }
  reset () { this.count=0;this.index=0;this.previous=null;this.publishedAt=null;this.value=null }
  frame (now, visible=true) {
    if(!visible || !Number.isFinite(now)){this.reset();return null}
    if(this.previous!==null && now<this.previous)this.reset()
    if(this.previous!==null){this.values[this.index]=now-this.previous;this.index=(this.index+1)%240;this.count=Math.min(240,this.count+1)}
    this.previous=now
    if(this.publishedAt===null){this.publishedAt=now;return null}
    if(now-this.publishedAt<1000)return null
    this.publishedAt=now
    const sorted=Array.from(this.values.subarray(0,this.count)).sort((a,b)=>a-b),p=q=>sorted[Math.max(0,Math.ceil(sorted.length*q)-1)]??null
    this.value={sampleCount:this.count,durationMs:sorted.reduce((a,b)=>a+b,0),p50:p(.5),p95:p(.95),p99:p(.99),max:sorted.at(-1)??null,
      over33:sorted.filter(v=>v>33).length,over50:sorted.filter(v=>v>50).length,over100:sorted.filter(v=>v>100).length}
    return this.value
  }
}

export function writeChanged (target, key, value) {
  if(target[key]===value)return false
  target[key]=value;return true
}
export function createTargetSignature () {
  let previous=null,signature=''
  return rows=>{if(rows!==previous){previous=rows;signature=JSON.stringify(rows.map(e=>[e.id,e.uuid,e.name,e.rendered]))}return signature}
}
