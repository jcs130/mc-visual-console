import {fileURLToPath} from 'node:url';
export function patchRendererMovement(source) {
  const loop='startRenderLoop(){let e=()=>{',clock='let r=performance.now(),i=r-this.lastRenderTime,s=1e3/this.config.fpsLimit;if(i<s)return;this.lastRenderTime=r-i%s';
  if(source.split(loop).length!==2 || source.split(clock).length!==2)throw Error('帧时钟源码锚点已变化');
  source=source.replace(loop,'startRenderLoop(){let e=(_cortiRafAt)=>{').replace(clock,
    'let r=Number.isFinite(_cortiRafAt)?_cortiRafAt:performance.now(),next=CortiNextRenderClock(r,this.lastRenderTime,this.config.fpsLimit);if(next===null)return;this.lastRenderTime=next');
  const before='let c=G1(e,t),u=this.worldRenderer.sceneOrigin.getWorldPosition(s)??{x:e.position.x,y:e.position.y,z:e.position.z};s.userData._tweenTarget||(s.userData._tweenTarget={x:u.x,y:u.y,z:u.z}),s.userData._posTween?.stop(),s.userData._posTween=new Ge(s.userData._tweenTarget).to({x:e.position.x,y:e.position.y,z:e.position.z},c).onUpdate(()=>{s.position.set(s.userData._tweenTarget.x,s.userData._tweenTarget.y,s.userData._tweenTarget.z)}).start()';
  if(source.split(before).length!==2)throw Error('位置插值源码锚点已变化');
  const after=`let c=G1(e,t),u=this.worldRenderer.sceneOrigin.getWorldPosition(s)??e.position;
    let timeline=s.userData._positionTimeline??=new CortiEntityPositionTimeline();
    timeline.push(e.position,performance.now(),{instant:c===0,from:u});
    s.userData._tweenTarget??={...u};s.userData._posTween?.stop();
    let apply=()=>{let p=timeline.sample(performance.now(),s.userData._tweenTarget);if(p)s.position.set(p.x,p.y,p.z)};
    if(c===0)apply();
    s.userData._posTween=new Ge({clock:0}).to({clock:1},timeline.delayMs+100).onUpdate(apply).onComplete(apply).start()`;
  return `import {EntityPositionTimeline as CortiEntityPositionTimeline} from ${JSON.stringify(fileURLToPath(new URL('../src/modern-viewer/entity-position-timeline.js',import.meta.url)))};\nimport {nextRenderClock as CortiNextRenderClock} from ${JSON.stringify(fileURLToPath(new URL('../src/modern-viewer/render-clock.js',import.meta.url)))};\n`+source.replace(before,after);
}
