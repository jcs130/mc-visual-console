export const NATIVE_KINETIC_ACTOR_LIMIT = 512
const MAX_NODES = 4096
const positionKey = p => p && [p.x,p.y,p.z].every(n=>Number.isSafeInteger(n)&&n>=-2147483648&&n<=2147483647) ? `${p.x},${p.y},${p.z}` : null

// Stage ownership without touching live animation state. Existing callers can
// commit immediately; the scene defers commit until its static terrain is ready.
export async function stageNativeKineticActors({nodes,definitions,actors,createActor,attach,remove,isCurrent,deferCommit=false}) {
  const issues=[],next=new Map(),created=new Set(),updates=new Map(),seen=new Set()
  let finished=false
  const dispose=()=>{for(const actor of created)actor.dispose?.();created.clear()}
  const result={current:false,issues,dispose,commit(){
    if(finished || !isCurrent()){dispose();return false}
    finished=true
    for(const [key,actor]of next){
      const node=updates.get(actor)
      try{actor.setSpeed(node.speed);actor.setNativeState?.(node)}
      catch(error){next.delete(key);issues.push(`${actor.state.name} @ ${key}：${error.message}`)}
    }
    for(const [key,actor]of actors)if(next.get(key)!==actor)remove(actor)
    for(const [key,actor]of next)if(actors.get(key)!==actor)attach(actor)
    actors.clear();for(const [key,actor]of next)actors.set(key,actor)
    const retained=new Set(next.values());for(const actor of created)if(!retained.has(actor))actor.dispose?.()
    created.clear();return true
  }}
  const finish=()=>{result.current=isCurrent();if(!result.current)dispose();else if(!deferCommit)result.commit();return result}
  if(!Array.isArray(nodes)||nodes.length>MAX_NODES){issues.push('NATIVE_KINETIC_SNAPSHOT_BUDGET_UNAVAILABLE');return finish()}
  for(const node of nodes){
    const key=positionKey(node?.position)
    if(!key||!Number.isSafeInteger(node.stateId)||node.stateId<0||!definitions.has(node.stateId)||seen.has(key)){
      issues.push('NATIVE_KINETIC_SNAPSHOT_BINDING_UNAVAILABLE');return finish()
    }
    seen.add(key)
  }
  if(nodes.length>NATIVE_KINETIC_ACTOR_LIMIT)issues.push(`NATIVE_KINETIC_ACTOR_BUDGET_EXCEEDED:${nodes.length}`)
  for(const node of nodes.slice(0,NATIVE_KINETIC_ACTOR_LIMIT)){
    if(!isCurrent())return finish()
    const key=positionKey(node.position),state=definitions.get(node.stateId)
    let actor=actors.get(key)
    if(actor&&(actor.state.stateId!==node.stateId||actor.state.name!==state.name))actor=null
    if(!Number.isFinite(node.speed)||!Number.isFinite(Math.fround(node.speed))){issues.push(`${state.name} @ ${key}：NATIVE_KINETIC_SPEED_UNAVAILABLE`);continue}
    try{
      if(!actor){
        actor=await createActor(state,node.position)
        if(actor)created.add(actor)
        if(!isCurrent())return finish()
        if(actor?.root?.isObject3D!==true||actor.state?.stateId!==node.stateId||actor.state?.name!==state.name)throw Error('NATIVE_KINETIC_ACTOR_BINDING_UNAVAILABLE')
      }
      next.set(key,actor);updates.set(actor,node)
      if(actor.root.userData.nativeDevice)issues.push(`${state.name} @ ${key}：${actor.root.userData.nativeDevice.unavailableLayers.join(' / ')}`)
    }catch(error){
      if(created.delete(actor))actor.dispose?.()
      next.delete(key);updates.delete(actor)
      issues.push(`${state.name} @ ${key}：${error.message}`)
    }
  }
  return finish()
}
