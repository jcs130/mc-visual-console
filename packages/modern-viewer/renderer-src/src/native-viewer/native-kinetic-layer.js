export const NATIVE_KINETIC_ACTOR_LIMIT = 512
const MAX_NODES = 4096
const positionKey = p => p && [p.x,p.y,p.z].every(n=>Number.isSafeInteger(n)&&n>=-2147483648&&n<=2147483647) ? `${p.x},${p.y},${p.z}` : null

// One snapshot stage, owned by the scene's epoch. Failed/unknown/replaced
// devices cannot retain an older verified speed. Models are never fabricated.
export async function stageNativeKineticActors({nodes,definitions,actors,createActor,attach,remove,isCurrent}) {
  const issues=[],existing=new Set(),seen=new Set()
  if(!Array.isArray(nodes)||nodes.length>MAX_NODES) {
    if(isCurrent()){for(const actor of actors.values())remove(actor);actors.clear()}
    return{current:isCurrent(),issues:['NATIVE_KINETIC_SNAPSHOT_BUDGET_UNAVAILABLE']}
  }
  // Validate the whole small native table before mutating the active scene.
  // Duplicate block positions cannot choose a convenient earlier/last speed.
  for(const node of nodes){
    const key=positionKey(node?.position)
    if(!key||!Number.isSafeInteger(node.stateId)||node.stateId<0||!definitions.has(node.stateId)||seen.has(key)) {
      if(isCurrent()){for(const actor of actors.values())remove(actor);actors.clear()}
      return{current:isCurrent(),issues:['NATIVE_KINETIC_SNAPSHOT_BINDING_UNAVAILABLE']}
    }
    seen.add(key)
  }
  if(nodes.length>NATIVE_KINETIC_ACTOR_LIMIT)issues.push(`NATIVE_KINETIC_ACTOR_BUDGET_EXCEEDED:${nodes.length}`)
  for(const node of nodes.slice(0,NATIVE_KINETIC_ACTOR_LIMIT)){
    if(!isCurrent())return{current:false,issues}
    const key=positionKey(node.position),state=definitions.get(node.stateId);existing.add(key)
    let actor=actors.get(key)
    if(actor&&(actor.state.stateId!==node.stateId||actor.state.name!==state.name)){remove(actor);actors.delete(key);actor=null}
    if(!Number.isFinite(node.speed)){
      if(actor){remove(actor);actors.delete(key)}
      issues.push(`${state.name} @ ${key}：NATIVE_KINETIC_SPEED_UNAVAILABLE`);continue
    }
    try{
      if(!actor){
        actor=await createActor(state,node.position)
        if(!isCurrent()){actor?.dispose?.();return{current:false,issues}}
        if(actor?.root?.isObject3D!==true||actor.state?.stateId!==node.stateId||actor.state?.name!==state.name){actor?.dispose?.();actor=null;throw Error('NATIVE_KINETIC_ACTOR_BINDING_UNAVAILABLE')}
        // Validate RPM before an actor can enter the active scene.
        actor.setSpeed(node.speed);attach(actor);actors.set(key,actor)
      }else actor.setSpeed(node.speed)
      actor.setNativeState?.(node)
      if(actor.root.userData.nativeDevice)issues.push(`${state.name} @ ${key}：${actor.root.userData.nativeDevice.unavailableLayers.join(' / ')}`)
    }catch(error){
      if(actor){remove(actor);actors.delete(key)}
      issues.push(`${state.name} @ ${key}：${error.message}`)
    }
  }
  if(!isCurrent())return{current:false,issues}
  for(const[key,actor]of actors)if(!existing.has(key)){remove(actor);actors.delete(key)}
  return{current:true,issues}
}
