// Display-only observed samples. Buffer the actual delivery cadence; never predicts.
export class NativeSelfDisplayPose {
  constructor () { this.reset() }
  reset () { this.resetVersion=(this.resetVersion??0)+1; this.samples=[]; this.identity=null; this.sequence=null; this.stale=false;this.received=0;this.duplicates=0;this.resetCadence() }
  resetCadence () { this.arrivalGaps=[];this.delayMs=50;this.cadenceAt=null;this.cadenceTick=null;this.playhead=null }
  receive (pose, at, identity, motion, wallNow = Date.now()) {
    if (!pose || !['x','y','z','yaw','pitch','eyeHeight'].every(k=>Number.isFinite(pose[k])) || !Number.isFinite(at)) return
    let last=this.samples.at(-1);const sequence=motion?.resetSequence??null
    // Cloud delivery can exceed a quarter second. Retiring the identity/camera
    // on every such interval caused repeated snaps even though the body was
    // unchanged. Buffer received samples; only a real gap/teleport resets it.
    if (identity!==this.identity || sequence!==this.sequence || (last && (at-last.arrivedAt>1500 || at<last.arrivedAt || Math.hypot(pose.x-last.pose.x,pose.y-last.pose.y,pose.z-last.pose.z)>8))) {this.samples=[];this.resetCadence();this.resetVersion++;last=null}
    this.identity=identity;this.sequence=sequence
    const tick=Number.isSafeInteger(motion?.tick)?motion.tick:null
    // Fast motion and the slower HUD/terrain frame repeat the same tick. They
    // must not create a false stationary interval or evict real motion samples.
    if(last&&tick!==null&&last.tick!==null&&tick<=last.tick){
      this.duplicates++
      if(tick===last.tick)last.pose={...pose}
      return
    }
    if(tick===null||tick!==this.cadenceTick){
      const gap=this.cadenceAt===null?null:at-this.cadenceAt
      if(gap>=20&&gap<=1000){
        this.arrivalGaps.push(gap);if(this.arrivalGaps.length>16)this.arrivalGaps.shift()
        const sorted=[...this.arrivalGaps].sort((a,b)=>a-b)
        this.delayMs=Math.min(500,Math.max(50,Math.ceil(sorted[Math.ceil(sorted.length*.9)-1]/5)*5))
      }
      this.cadenceAt=at;this.cadenceTick=tick
    }
    // SSE may deliver several real source samples in one read. Retain their
    // measured spacing instead of assigning every pose the same arrival time.
    // A skewed/unavailable source clock uses arrival time; never extrapolate.
    const age=wallNow-motion?.sampledAt
    const sampledAt=Number.isFinite(age)&&age>=-100&&age<=1500?at-Math.max(0,age):at
    this.samples.push({pose:{...pose},at:Math.max(last?.at??-Infinity,sampledAt),arrivedAt:at,tick})
    this.received++
    if(this.samples.length>64)this.samples.shift()
  }
  status (now) {
    const last=this.samples.at(-1),sorted=[...this.arrivalGaps].sort((a,b)=>a-b)
    return {receivedSamples:this.received,duplicateTickFrames:this.duplicates,bufferedSamples:this.samples.length,bufferMs:this.delayMs,
      arrivalP90Ms:sorted.length?sorted[Math.ceil(sorted.length*.9)-1]:null,
      lastSampleAgeMs:last?Math.max(0,now-last.at):null,stale:this.stale}
  }
  sample (now) {
    const rows=this.samples,last=rows.at(-1);if(!last)return null
    this.stale=now-last.at>Math.max(250,Math.min(1500,this.delayMs*3))
    if(this.stale){this.samples=[last];this.playhead=last.at;return {...last.pose}}
    // Growing a jitter buffer may hold the known pose, never rewind it. Both
    // the actor and camera use this received interval, including wrapped yaw.
    const target=Math.max(this.playhead??-Infinity,Math.min(last.at,now-this.delayMs))
    this.playhead=target
    if(target<=rows[0].at)return {...rows[0].pose}
    for(let i=1;i<rows.length;i++)if(rows[i].at>=target){
      const a=rows[i-1],b=rows[i],t=b.at===a.at?1:(target-a.at)/(b.at-a.at),p={...b.pose}
      for(const k of ['x','y','z','pitch','eyeHeight'])p[k]=a.pose[k]+(b.pose[k]-a.pose[k])*t
      for(const k of ['yaw','bodyYaw','headYaw'])if(Number.isFinite(a.pose[k])&&Number.isFinite(b.pose[k])){
        const delta=Math.atan2(Math.sin(b.pose[k]-a.pose[k]),Math.cos(b.pose[k]-a.pose[k]))
        p[k]=a.pose[k]+delta*t
      }
      return p
    }
    return {...last.pose}
  }
}

// Keep the historical 240-gap API plus bounded visible-time session/60s evidence.
// Histograms use 1ms upper-edge bins (1000+ is overflow); counts/max are exact.
const emptyGaps = () => ({ sampleCount:0,durationMs:0,max:null,over33:0,over50:0,over100:0 })
const addGap = (row, gap) => { row.sampleCount++;row.durationMs+=gap;row.max=Math.max(row.max??0,gap);for(const n of [33,50,100])if(gap>n)row['over'+n]++ }
export class NativeFrameGaps {
  constructor () { this.values=new Float64Array(240);this.reset() }
  reset () { this.resetWindow();this.session=emptyGaps();this.buckets=Array.from({length:61},()=>({second:-1,hist:new Uint32Array(1002),stats:emptyGaps()})) }
  resetWindow () { this.count=0;this.index=0;this.previous=null;this.publishedAt=null;this.value=null }
  frame (now, visible=true) {
    if(!visible || !Number.isFinite(now)){this.resetWindow();return null}
    if(this.previous!==null && now<this.previous)this.resetWindow()
    if(this.previous!==null){
      const gap=now-this.previous;this.values[this.index]=gap;this.index=(this.index+1)%240;this.count=Math.min(240,this.count+1)
      addGap(this.session,gap)
      const second=Math.floor(this.session.durationMs/1000),bucket=this.buckets[second%61]
      if(bucket.second!==second){bucket.second=second;bucket.hist.fill(0);bucket.stats=emptyGaps()}
      addGap(bucket.stats,gap);bucket.hist[Math.min(1001,Math.ceil(gap))]++
    }
    this.previous=now
    if(this.publishedAt===null){this.publishedAt=now;return null}
    if(now-this.publishedAt<1000)return null
    this.publishedAt=now
    const sorted=Array.from(this.values.subarray(0,this.count)).sort((a,b)=>a-b),p=q=>sorted[Math.max(0,Math.ceil(sorted.length*q)-1)]??null
    const window60=emptyGaps(),hist=new Float64Array(1002),second=Math.floor(this.session.durationMs/1000)
    for(const bucket of this.buckets)if(bucket.second>=Math.max(0,second-59)&&bucket.second<=second){
      for(const key of ['sampleCount','durationMs','over33','over50','over100'])window60[key]+=bucket.stats[key]
      if(bucket.stats.max!==null)window60.max=Math.max(window60.max??0,bucket.stats.max)
      for(let i=0;i<hist.length;i++)hist[i]+=bucket.hist[i]
    }
    const percentile=q=>{let count=0;for(let i=0;i<hist.length;i++){count+=hist[i];if(count>=Math.ceil(window60.sampleCount*q))return i===1001?null:i}return null}
    this.value={sampleCount:this.count,durationMs:sorted.reduce((a,b)=>a+b,0),p50:p(.5),p95:p(.95),p99:p(.99),max:sorted.at(-1)??null,
      over33:sorted.filter(v=>v>33).length,over50:sorted.filter(v=>v>50).length,over100:sorted.filter(v=>v>100).length,
      session:{...this.session},window60:{...window60,p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),bucketMs:1000,percentileResolutionMs:1,overflowCount:hist[1001]}}
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
