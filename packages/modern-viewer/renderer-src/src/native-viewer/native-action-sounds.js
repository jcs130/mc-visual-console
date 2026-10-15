// Vanilla client-local sounds from the SAME body's actual motion and activity.
// Submitted jobs and planned actions are never input to this sampler.
const point=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]))
const soundName=n=>n?.replace(/^minecraft:/,'')
export function createNativeActionSounds({play,now=Date.now}) {
  let binding=null,position=null,distance=0,lastStep=-Infinity,lastDig=-Infinity,digKey=null,lastEvent=0
  const reset=()=>{binding=null;position=null;distance=0;lastStep=-Infinity;lastDig=-Infinity;digKey=null;lastEvent=0}
  const block=(blocks,name,kind,position,volume=1,pitch=1)=>{
    const row=blocks?.[name.includes(':')?name:'minecraft:'+name]
    if(!row?.[kind]||!Number.isFinite(row.volume)||!Number.isFinite(row.pitch))return
    play({name:soundName(row[kind]),category:kind==='step'?'players':'blocks',position,
      volume:kind==='hit'?(row.volume+1)/8:row.volume*volume,pitch:row.pitch*pitch,observedAt:now()})
  }
  return {reset,observe(snapshot,blocks){
    const own=snapshot?.selfPlayer,p=snapshot?.pose,presentation=snapshot?.presentation,activity=presentation?.activity,time=now()
    if(!point(p)||!own?.uuid||!Number.isFinite(presentation?.sampledAt)||time-presentation.sampledAt<0||time-presentation.sampledAt>3000)return
    const next=`${snapshot.epoch}:${own.uuid}`,fresh=next!==binding
    if(fresh){reset();binding=next;lastEvent=Math.max(0,...(activity?.events??[]).map(e=>e.id))}
    if(position&&own.onGround===true&&own.sneaking!==true&&presentation.self?.inWater!==true){
      const travel=Math.hypot(p.x-position.x,p.z-position.z)
      distance=travel<4?distance+travel:0
      if(distance>=1.6&&time-lastStep>=180){if(own.surfaceBlock)block(blocks,own.surfaceBlock,'step',p,.15);distance=0;lastStep=time}
    }else distance=0
    position={x:p.x,y:p.y,z:p.z}
    if(activity?.playerUuid!==own.uuid||time-activity.sampledAt<0||time-activity.sampledAt>3000)return
    const dig=activity.dig,key=point(dig?.position)?JSON.stringify([dig.name,dig.position,dig.startedAt]):null
    if(key&&(key!==digKey||time-lastDig>=250)){block(blocks,dig.name,'hit',dig.position,1,.5);lastDig=time}
    digKey=key
    for(const event of activity.events??[]){
      if(!Number.isSafeInteger(event.id)||event.id<=lastEvent)continue
      lastEvent=event.id
      if(!Number.isFinite(event.at)||time-event.at<0||time-event.at>3000)continue
      if(event.kind==='dig_completed'&&event.name&&point(event.position))block(blocks,event.name,'break',event.position)
      else if(event.kind==='slot_click')play({name:'ui.button.click',category:'players',volume:.15,pitch:1,observedAt:time})
      else if(event.kind==='attack')play({name:'entity.player.attack.nodamage',category:'players',position:p,volume:1,pitch:1,observedAt:time})
    }
  }}
}
