import { Vec3 } from 'vec3';

/** Vanilla controls over the supplied action bot, never over an Eye/observer.
 * The host supplies optional navigation and owns pathfinding/game permissions. */
export function createMineflayerControlAdapter(bot, { navigate, cancelNavigation = () => bot.pathfinder?.setGoal(null) } = {}) {
  let digging=false,using=false,stopped=true,generation=0;
  const identity=()=>({uuid:bot.player?.uuid??bot._client?.uuid??null,username:bot.username,entityId:bot.entity?.id});
  const ready=()=>Boolean(bot.entity?.position && bot._client?.state==='play' && bot.game?.gameMode!=='spectator'
    && !/(?:_?eye|cam)$/i.test(bot.username??''));
  const look=(yaw,pitch)=>{const current=++generation,result=bot.look(yaw,pitch,true);
    result?.catch?.(()=>{if(generation===current)stop();});};
  const stop=()=>{
    stopped=true;generation++;
    // A failed pathfinder/connection must not prevent the other stop actions.
    for(const action of [()=>bot.clearControlStates(),cancelNavigation,
      ()=>{if(digging)bot.stopDigging();},()=>{if(using)bot.deactivateItem();}])try{action();}catch{}
    digging=false;using=false;
  };
  const blockAtCursor=()=>{
    // Mineflayer 4.x blockAtEntityCursor treats an exact zero yaw/pitch as
    // missing. Use the same native world raycast with finite-number checks.
    const e=bot.entity;if(!e || ![e.yaw,e.pitch].every(Number.isFinite))return null;
    const direction=new Vec3(-Math.sin(e.yaw)*Math.cos(e.pitch),Math.sin(e.pitch),-Math.cos(e.yaw)*Math.cos(e.pitch));
    return bot.world.raycast(e.position.offset(0,e.eyeHeight??1.62,0),direction,4.5);
  };
  return { identity, ready, capabilities:['motion','primary','secondary','hotbar',...(navigate?['navigate']:[])],
    motion(input){
      if(!ready())throw Error('actor_unavailable');
      const {forward,strafe}=input,moving=Math.hypot(forward,strafe)>.15;
      if(moving)cancelNavigation();stopped=false;
      if(input.movementMode==='first_person'){
        if(Number.isFinite(input.lookYaw))look(input.lookYaw,input.lookPitch);
        bot.setControlState('forward',forward>.15);bot.setControlState('back',forward<-.15);
        bot.setControlState('right',strafe>.15);bot.setControlState('left',strafe<-.15);
      } else {
        const dx=-Math.sin(input.cameraYaw)*forward+Math.cos(input.cameraYaw)*strafe;
        const dz=-Math.cos(input.cameraYaw)*forward-Math.sin(input.cameraYaw)*strafe;
        if(moving)look(Math.atan2(-dx,-dz),Number.isFinite(input.lookPitch)?input.lookPitch:bot.entity.pitch);
        else if(Number.isFinite(input.lookYaw))look(input.lookYaw,input.lookPitch);
        bot.setControlState('forward',moving);for(const key of ['back','left','right'])bot.setControlState(key,false);
      }
      for(const key of ['jump','sprint','sneak'])bot.setControlState(key,input[key]);
    },
    async action(type,value,{signal}={}){
      if(signal?.aborted || !ready())return {ok:false,reason:'actor_unavailable'};
      if(type==='hotbar'){
        if(!Number.isInteger(value)||value<0||value>8)return {ok:false,reason:'invalid_slot'};
        bot.setQuickBarSlot(value);return {ok:true,status:'sent',scope:'selection'};
      }
      if(type==='navigate'){
        if(!navigate)return {ok:false,reason:'navigation_unavailable'};
        const {origin,direction}=value??{};
        if(![origin?.x,origin?.y,origin?.z,direction?.x,direction?.y,direction?.z].every(Number.isFinite))return {ok:false,reason:'invalid_ray'};
        const p=bot.entity.position;if(Math.hypot(origin.x-p.x,origin.y-p.y,origin.z-p.z)>32)return {ok:false,reason:'ray_too_far'};
        const length=Math.hypot(direction.x,direction.y,direction.z);if(length<.5||length>1.5)return {ok:false,reason:'invalid_ray'};
        stop();return navigate({origin,direction}, {signal,bot});
      }
      if(value===false){if(type==='primary'&&digging){bot.stopDigging();digging=false;}if(type==='secondary'&&using){bot.deactivateItem();using=false;}return {ok:true,status:'stopped'};}
      stopped=false;cancelNavigation();
      const entity=bot.entityAtCursor?.(3.5);
      if(type==='primary'){
        if(entity){bot.attack(entity);return {ok:true,status:'sent',scope:'attack'};}
        const block=blockAtCursor();if(!block || !bot.canDigBlock(block))return {ok:false,reason:'no_reachable_target'};
        digging=true;
        const cancel=()=>{try{bot.stopDigging();}catch{}};
        signal?.addEventListener('abort',cancel,{once:true});
        try {await bot.dig(block,'ignore');return {ok:true,status:'confirmed',scope:'dig',position:{x:block.position.x,y:block.position.y,z:block.position.z}};}
        catch {return {ok:false,status:'unknown',reason:signal?.aborted||stopped?'cancelled':'dig_not_confirmed'};}
        finally {signal?.removeEventListener('abort',cancel);digging=false;}
      }
      if(type==='secondary'){
        if(entity){await bot.activateEntity(entity);return {ok:true,status:'sent',scope:'entity_use'};}
        const block=blockAtCursor(),held=bot.heldItem;
        const usable=block && /(?:chest|barrel|door|trapdoor|gate|button|lever|furnace|crafting_table|anvil|hopper|brewing_stand|enchanting_table|shulker_box|loom|stonecutter|smithing_table|cartography_table|grindstone|bed)$/.test(block.name);
        if(usable && !bot.controlState?.sneak){await bot.activateBlock(block);return {ok:true,status:'sent',scope:'block_use'};}
        const placeable=held && bot.registry?.blocksByName?.[held.name];
        if(block && placeable && Number.isInteger(block.face)){
          const face=[[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]][block.face];
          if(!face)return {ok:false,reason:'invalid_face'};
          await bot.placeBlock(block,new Vec3(...face));return {ok:true,status:'confirmed',scope:'place'};
        }
        if(!held)return {ok:false,reason:'no_held_item'};
        using=true;bot.activateItem();return {ok:true,status:'sent',scope:'item_use'};
      }
      return {ok:false,reason:'unsupported_action'};
    },stop,
    // Disposing an unused viewer must not clear a running Agent's controls.
    dispose(){generation++;}
  };
}

/** Optional click-to-walk helper over the host's existing pathfinder. Pass its
 * GoalNear and a factory returning a NEW Movements instance for this bot.
 * Navigation does not dig or build. The Agent's original settings are restored
 * before its handoff callback can resume work. No pathfinder is installed here. */
export function createMineflayerRayNavigation(bot, { GoalNear, createMovements, maxDistance = 48, timeoutMs = 30000 } = {}) {
  if (typeof GoalNear !== 'function' || typeof createMovements !== 'function'
      || !Number.isFinite(maxDistance) || maxDistance < 1 || maxDistance > 64
      || !Number.isFinite(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000)
    throw new TypeError('navigation needs GoalNear, a fresh Movements factory and bounded limits');
  return async (ray, { signal } = {}) => {
    const pathfinder = bot.pathfinder;
    if (!pathfinder?.goto || !pathfinder?.setMovements) return { ok: false, reason: 'navigation_unavailable' };
    if (signal?.aborted) return { ok: false, reason: 'cancelled', status: 'unknown' };
    const { origin, direction } = ray ?? {};
    if (![origin?.x, origin?.y, origin?.z, direction?.x, direction?.y, direction?.z].every(Number.isFinite))
      return { ok: false, reason: 'invalid_ray' };
    const at = new Vec3(origin.x, origin.y, origin.z), dir = new Vec3(direction.x, direction.y, direction.z);
    if (at.distanceTo(bot.entity.position) > 32 || dir.norm() < .5 || dir.norm() > 1.5)
      return { ok: false, reason: 'invalid_ray' };
    const block = bot.world.raycast(at, dir.normalize(), maxDistance);
    if (!block?.position || block.face !== 1 || block.position.distanceTo(bot.entity.position) > maxDistance)
      return { ok: false, reason: 'no_reachable_target' };
    const previous = pathfinder.movements, movements = createMovements(bot);
    if (!movements || movements === previous) throw new TypeError('navigation Movements must be a separate instance');
    movements.canDig = false; movements.allow1by1towers = false;
    movements.allowParkour = false; movements.allowSprinting = false;
    movements.allowFreeMotion = false; movements.maxDropDown = Math.min(movements.maxDropDown ?? 3, 3);
    // Scaffolding is used for bridging too, not only vertical towers.
    movements.scafoldingBlocks = [];
    const p = block.position, goal = new GoalNear(p.x, p.y + 1, p.z, 1);
    let timedOut = false;
    const cancel = () => { if (pathfinder.goal === goal) pathfinder.setGoal(null); };
    const timer = setTimeout(() => { timedOut = true; cancel(); }, timeoutMs); timer.unref?.();
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      pathfinder.setMovements(movements);
      await pathfinder.goto(goal);
      if (signal?.aborted || timedOut) return { ok: false, reason: 'cancelled', status: 'unknown' };
      if (!goal.isEnd(bot.entity.position.floored())) return { ok: false, reason: 'navigation_failed', status: 'unknown' };
      return { ok: true, status: 'confirmed', scope: 'navigation', position: { ...bot.entity.position } };
    } catch { return { ok: false, reason: signal?.aborted || timedOut ? 'cancelled' : 'navigation_failed', status: 'unknown' }; }
    finally {
      clearTimeout(timer); signal?.removeEventListener('abort', cancel); cancel();
      if (pathfinder.movements === movements && previous) pathfinder.setMovements(previous);
    }
  };
}
