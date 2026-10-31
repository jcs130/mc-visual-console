import * as THREE from 'three';
import {observedHandUse} from './observed-hand-use.js';
import {batchStaticYsmBones} from './ysm-bone-batch.js';
import {createNativeBedrockModel} from '../native-viewer/native-entity-model-bedrock.js';
import {PaperYsmAnimation} from './paper-ysm-animation.js';
import {PaperYsmHeldItems} from './paper-ysm-items.js';
import {applyRescuePose,relaxRestTail,supportsRescuePose} from './paper-ysm-rest-pose.js';
import {createPaperSkinActor} from './paper-skin.js';
import {matchesServerYsmProfile} from './server-ysm-profile.js';
export {applyPaperYsmAnimation} from './paper-ysm-animation.js';

/** Describe the received state; missing assignment is not a failed asset download. */
export function paperYsmAvailabilityText(row) {
  if(row?.available===false){
    if(row.reason==='YSM_MODEL_DISABLED')return '当前角色已停用 YSM，使用普通皮肤';
    if(row.source==='ysm_native_backend')return '等待服务器确认当前角色的原生 YSM 状态';
    if(row.stateStatus==='awaiting_model_state'||row.stateStatus==='awaiting_initial_poll')return row.workerConnected===true?'模型服务已连接，等待当前角色的 YSM 模型状态':'等待模型服务返回当前角色的 YSM 模型状态';
    if(row.stateStatus==='worker_offline'||row.workerConnected===false)return 'YSM 模型服务暂未连接';
    if(row.stateStatus==='unsupported')return '当前角色的 YSM 模型状态暂未支持';
    return '服务器尚未提供当前角色的可用 YSM 外观';
  }
  if(row?.available&&!row.renderAvailable){
    if(row.renderReason==='YSM_ENCRYPTED_SOURCE_REQUIRED'||row.webReason==='YSM_ENCRYPTED_SOURCE_REQUIRED')return '加密原包仅原生客户端可显示；网页需作者提供可公开的原始模型资源';
    return row.renderReason==='YSM_ASSET_PENDING'?'等待原始 YSM 模型资源':'当前角色的原始 YSM 模型资源暂不可用';
  }
  return '';
}

const json=(bundle,path)=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(bundle.files[path].base64),c=>c.charCodeAt(0))));
/** Visible animated head only: bind-pose bounds may include folded props. */
function paperYsmHeadBounds(model,root) {
  const head=model.bones.get('Head')??model.bones.get('head');if(!head)return null;
  root.updateWorldMatrix(true,true);
  const bounds=new THREE.Box3(),part=new THREE.Box3(),scale=new THREE.Vector3();
  head.traverseVisible(mesh=>{
    if(!mesh.isMesh)return;scale.setFromMatrixScale(mesh.matrixWorld);
    if(![scale.x,scale.y,scale.z].every(n=>Number.isFinite(n)&&Math.abs(n)>=.001))return;
    if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();part.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);bounds.union(part);
  });
  return bounds.isEmpty()?null:bounds;
}
export function paperYsmHeadAnchor(model,root) {
  const bounds=paperYsmHeadBounds(model,root);if(!bounds)return null;
  const point=bounds.getCenter(new THREE.Vector3());point.y=bounds.max.y+.22;return point;
}
export async function createPaperYsmActor(bundle,textureId,{itemModels={},loadTexture}={}) {
  if(bundle?.format==='minecraft-skin-original')return createPaperSkinActor(bundle,textureId,{loadTexture});
  const definition=json(bundle,'ysm.json'),geometry=json(bundle,bundle.model),animation=json(bundle,bundle.animation);
  const file=bundle.files[bundle.textures[textureId]];if(!file)throw Error('YSM_TEXTURE_UNAVAILABLE');
  if(definition.spec!==2 || definition.properties?.free!==true)throw Error('YSM_DEFINITION_UNSUPPORTED');
  const bounded=value=>{if(typeof value==='number' && (!Number.isFinite(value)||Math.abs(value)>65536))throw Error('YSM_GEOMETRY_VALUE_BUDGET');if(value && typeof value==='object')for(const child of Object.values(value))bounded(child);};
  bounded(geometry);
  const texture=await (loadTexture??(url=>new THREE.TextureLoader().loadAsync(url)))('data:image/png;base64,'+file.base64);
  let material,model,batch;
  try {
    texture.flipY=true;texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
    material=new THREE.MeshLambertMaterial({map:texture,side:THREE.DoubleSide,alphaTest:.1});
    model=createNativeBedrockModel(geometry,material,{maxBones:512,maxCubesPerBone:256,maxCubes:2048,allowNegativeSizes:true});
    // An authored bind pose can contain every optional prop (chairs, parasols,
    // alternate arms). It is not a player's idle state. Keep geometry hidden
    // until the original animation layers have been evaluated from real state.
    model.root.visible=false;
    if(model.cubeCount>2048)throw Error('YSM_GEOMETRY_BUDGET');
    const extra=kind=>{const path=bundle.animations?.[kind]??definition.files?.player?.animation?.[kind];return path&&bundle.files[path]?json(bundle,path):null;};
    const arm=extra('arm'),extraAnimation=extra('extra');
    batch=batchStaticYsmBones(model,material,[animation,arm,extraAnimation],['LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand']);
    const root=new THREE.Group(),orientation=new THREE.Group(),content=new THREE.Group();
    root.name='paper-ysm-player';
    root.add(orientation);orientation.add(content);orientation.scale.set(-1,-1,1);orientation.position.y=Math.fround(.01);content.position.y=-1.5;content.add(model.root);
    // YSM2.4.1's documented omitted-property default is .7, not one.
    const width=definition.properties?.width_scale??.7,height=definition.properties?.height_scale??.7;
    if(![width,height].every(n=>Number.isFinite(n)&&n>0&&n<=4))throw Error('YSM_SCALE_UNSUPPORTED');root.scale.set(width,height,width);
    const animationController=new PaperYsmAnimation(model,animation,{arm,extra:extraAnimation,controllers:definition.files?.player?.animation_controllers??[]});
    const held=new PaperYsmHeldItems(model,itemModels);
    let presentationSignature = '';
    const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3());
    return {root,model,assetInfo:{modelId:bundle.modelId,assetSha256:bundle.assetSha256,sourceSha256:bundle.sourceSha256,texture:textureId,bones:model.bones.size,cubes:model.cubeCount,faces:model.faceCount,scale:{width,height},bindSizeBlocks:size.toArray(),completeEntityParityVerified:false},
      setPresentation(policy) {
        if (!policy) return;
        const smooth = policy.avatarSampling === 'smooth', anisotropy = Math.max(1, Math.min(8, Number(policy.anisotropy) || 1)), shadows = policy.shadows === true;
        const signature = `${smooth}:${anisotropy}:${shadows}`;
        if (presentationSignature === signature) return;
        presentationSignature = signature;
        // Sampling changes only: original PNG, UVs, bones and proportions stay intact.
        // Keep magnified atlas texels crisp: linear sampling bleeds unused dark
        // texels across narrow authored UV islands and looks like a black outline.
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = smooth ? THREE.NearestMipmapLinearFilter : THREE.NearestFilter;
        texture.generateMipmaps = smooth; texture.anisotropy = anisotropy; texture.needsUpdate = true;
        model.root.traverse(part => { if (part.isMesh) { part.castShadow = shadows; part.receiveShadow = shadows; } });
      },
      animate(state,now) {
        model.root.visible=false;
        this.animationState=animationController.apply(state,now);this.animationReason=this.animationState.errors[0]??null;
        // Individual unsupported clips retain their existing diagnostics; an
        // otherwise valid static model need not disappear (e.g. no idle clip).
        model.root.visible=true;
        const downed=this.animationState.base==='downed';
        const sleeping=this.animationState.base==='sleep';
        // A presentation pose only: no collision, server position or inventory changes.
        // Living-entity sleep composes bed yaw, a sideways roll, then local
        // Y=270 degrees. Omitting the last rotation turns authored sleep face-down.
        const bedYaw=({south:Math.PI/2,west:0,north:-Math.PI/2,east:Math.PI})[state.motion?.sleepState?.bedFacing];
        const supportedRescue=downed&&supportsRescuePose(model)&&!animation.animations?.downed;
        const legacyDowned=downed&&!supportedRescue&&!animation.animations?.downed;
        root.rotation.set(legacyDowned?Math.PI/2:0,
          sleeping&&Number.isFinite(bedYaw)?bedYaw-(state.renderedYaw??0):0,sleeping?Math.PI/2:0,'YXZ');
        if(sleeping)root.rotateY(3*Math.PI/2);
        root.position.set(0,legacyDowned ? .28 : 0,0);
        const bed=state.motion?.sleepState?.bedPosition;
        if(sleeping && Number.isFinite(bedYaw) && bed && [bed.x,bed.y,bed.z].every(Number.isFinite)) {
          const bounds=paperYsmHeadBounds(model,root);
          if(bounds){
            // Anchor the authored head over the confirmed head-half mattress.
            // Both points are converted to parent space; entity interpolation
            // or a different character scale must not slide the sleeper off-bed.
            const from=bounds.getCenter(new THREE.Vector3());from.y=bounds.min.y;
            const to=new THREE.Vector3(bed.x+.5,bed.y+9/16+.01,bed.z+.5);
            root.parent?.worldToLocal(from);root.parent?.worldToLocal(to);
            root.position.add(to.sub(from));
          }
        }
        this.animationState.presentation={};
        if(supportedRescue)this.animationState.presentation.rescue=applyRescuePose(model,root);
        else if(downed)this.animationState.presentation.rescue=animation.animations?.downed?
          {available:true,source:'original-clip',id:'downed'}:{available:false,reason:'articulated_humanoid_rig_unavailable',fallback:'legacy_downed_rotation'};
        if(sleeping||supportedRescue){
          const surface=sleeping&&bed?bed.y+9/16:this.animationState.presentation.rescue?.floorY;
          this.animationState.presentation.tail=relaxRestTail(model,root,surface);
        }
        this.animationIssues??=new Set();for(const reason of this.animationState.errors)if(this.animationIssues.size<16)this.animationIssues.add(reason);
        held.apply(sleeping||downed?[]:state.motion?.equipment??state.equipment,state.motion?.mainArm??'right');this.heldState=held.stats();
      },
      headAnchor(){return paperYsmHeadAnchor(model,root);},
      dispose(){held.dispose();model.dispose();batch.dispose();material.dispose();texture.dispose();root.removeFromParent();root.clear();}};
  } catch(error){batch?.dispose();model?.dispose();material?.dispose();texture.dispose();throw error;}
}

/** Mounted only onto a currently tracked vanilla player entity with the same UUID. */
export class PaperYsmPlayers {
  constructor({entity,rendered,itemModels={},createActor=createPaperYsmActor,presentation=()=>null}={}){this.entity=entity;this.rendered=rendered;this.itemModels=itemModels;this.createActor=createActor;this.presentation=presentation;this.nametags=new WeakMap();this.motions=new Map();this.fallback=new Map();this.states=new Map();this.assets=new Map();this.assetSizes=new Map();this.assetBytes=0;this.actors=new Map();this.pending=new Map();this.failures=new Map();this.sequence=0;this.overrides=new Map();this.selectionNotices=new Map();}
  asset(bundle,{maxBytes=8*1024*1024}={}){if(bundle?.schemaVersion!==1||!['ysm-bedrock-original','minecraft-skin-original'].includes(bundle.format)||!bundle.assetSha256)return;
    if(this.assets.has(bundle.assetSha256))return;
    const size=Object.values(bundle.files??{}).reduce((n,f)=>n+(f.base64?.length??0),0);if(size>Math.min(16*1024*1024,maxBytes))return;
    while(this.assets.size>=32 || this.assetBytes+size>32*1024*1024){const key=this.assets.keys().next().value;this.assetBytes-=this.assetSizes.get(key);this.assetSizes.delete(key);this.assets.delete(key);
      for(const [uuid,choice]of this.overrides)if(choice.assetSha256===key){this.overrides.delete(uuid);this.unmount(uuid);this.selectionNotices.set(uuid,'所选资源已过期；已恢复服务器外观');}}
    this.assets.set(bundle.assetSha256,bundle);this.assetSizes.set(bundle.assetSha256,size);this.assetBytes+=size;}
  state(row){if(row?.schemaVersion!==1||row.source!=='freesia_worker'&&!(row.source==='ysm_native_backend'&&matchesServerYsmProfile(row))||typeof row.playerUuid!=='string')return;
    const previous=this.states.get(row.playerUuid);
    if(previous && (previous.epoch!==row.epoch||previous.entityId!==row.entityId))this.remove(row.playerUuid);
    else if(previous && !this.overrides.has(row.playerUuid) && (previous.assetSha256!==row.assetSha256||previous.texture!==row.texture||!row.available))this.unmount(row.playerUuid);
    if(this.states.size<40||this.states.has(row.playerUuid))this.states.set(row.playerUuid,row);}
  // A locally configured Web model needs a real tracked body, not a fabricated
  // Freesia assignment. No packet, server model ID or authorisation is invented.
  localEntity(entity,epoch){
    const uuid=entity?.uuid?.toLowerCase();
    if(entity?.isSelf!==true||typeof uuid!=='string'||!Number.isSafeInteger(entity.id)||this.entity(entity.id)?.uuid?.toLowerCase()!==uuid)return false;
    const previous=this.states.get(uuid);
    if(previous?.entityId===entity.id)return true;
    if(previous)this.remove(uuid);
    this.states.set(uuid,{schemaVersion:1,source:'same_connection_entity',playerUuid:uuid,entityId:entity.id,epoch,
      available:false,renderAvailable:false,reason:'YSM_SERVER_STATE_UNAVAILABLE'});return true;
  }
  choices(){
    const choices=[{id:'server',label:'跟随服务器'},{id:'skin',label:'原版玩家皮肤（Web）'}];
    for(const bundle of this.assets.values())for(const [texture,path]of Object.entries(bundle.textures??{})) {
      if(!bundle.files?.[path] || bundle.format==='ysm-bedrock-original'&&(!bundle.files?.[bundle.model] || !bundle.files?.['ysm.json']))continue;
      const label=bundle.source==='browser_upload'?`${bundle.displayLabel} · ${texture==='slim'?'细臂':'宽臂'}（上传皮肤 · Web）`:bundle.source==='plugin_bundled'?`${bundle.displayLabel??bundle.modelId} · ${texture}（Web 原模型）`:`${bundle.modelId} · ${texture}`;
      choices.push({id:`ysm:${bundle.assetSha256}:${encodeURIComponent(texture)}`,label,assetSha256:bundle.assetSha256,modelId:bundle.modelId,texture});
    }
    return choices;
  }
  select(uuid,id){
    const row=this.states.get(uuid),choice=this.choices().find(choice=>choice.id===id);
    if(!row || !choice || this.entity(row.entityId)?.uuid?.toLowerCase()!==uuid)return false;
    this.unmount(uuid);this.selectionNotices.delete(uuid);
    if(id==='server')this.overrides.delete(uuid);else this.overrides.set(uuid,choice);
    return true;
  }
  resetSelection(uuid){this.unmount(uuid);this.overrides.delete(uuid);this.selectionNotices.delete(uuid);}
  effective(row){
    if(!row)return null;
    const choice=this.overrides.get(row.playerUuid);
    if(!choice)return row;
    if(choice.id==='skin')return {...row,available:false,renderAvailable:false,selectionSource:'web_viewer_override'};
    return {...row,available:true,renderAvailable:true,modelId:choice.modelId,assetSha256:choice.assetSha256,texture:choice.texture,selectionSource:'web_viewer_override'};
  }
  selection(uuid){
    const row=this.states.get(uuid),choice=this.overrides.get(uuid),actor=this.actors.get(uuid)?.actor;
    const available=!!row && this.entity(row.entityId)?.uuid?.toLowerCase()===uuid;
    let status=!available?'等待当前观战玩家':choice?.id==='skin'?'Web 显示原版玩家皮肤':choice?'Web 外观替换':'跟随服务器外观';
    const error=this.failures.get(uuid);
    if(error)status+=` · 渲染失败：${error}`;
    else if(this.pending.has(uuid))status+=' · 模型载入中';
    else if(actor)status+=` · ${actor.assetInfo.modelId} / ${actor.assetInfo.texture}${actor.animationIssues?.size?' · 动作兼容提示（详情如下）':''}`;
    else if(!choice){const message=paperYsmAvailabilityText(row);if(message)status+=' · '+message;}
    if(choice&&choice.id!=='skin'&&row?.available===false)status+=' · 服务器模型尚未同步';
    return {available,selected:choice?.id??'server',choices:this.choices(),status:this.selectionNotices.get(uuid)??status,animationIssues:[...(actor?.animationIssues??[])]};
  }
  motion(row,now=performance.now()) {
    const state=this.states.get(row?.playerUuid),previous=this.motions.get(row?.playerUuid);
    if(!state || row.schemaVersion!==1 || row.source!=='same_connection_java_protocol' || state.epoch!==row.epoch || state.entityId!==row.entityId || !Number.isSafeInteger(row.sequence) || previous && previous.row.sequence>=row.sequence || !Number.isFinite(row.horizontalSpeed) || row.horizontalSpeed<0 || row.horizontalSpeed>30)return;
    this.motions.set(row.playerUuid,{row,at:now});
  }
  /** Own-body physics already travels with avatarState. It is not a remote
   * player's inferred pose, water-depth guess, or a change to game physics. */
  bodyMotion(row,now=performance.now()) {
    const entity=row?.entity,uuid=entity?.uuid?.toLowerCase(),binding=this.states.get(uuid);
    if(!binding || binding.entityId!==entity.id || this.entity(entity.id)?.uuid?.toLowerCase()!==uuid)return;
    const local=this.fallback.get(uuid)??{};
    if(entity.bodyState?.source==='server' && typeof entity.bodyState.canAct==='boolean') {
      if(local.bodyState?.canAct!==entity.bodyState.canAct) {delete local.swing;this.motions.delete(uuid);}
      local.bodyState={...entity.bodyState,epoch:binding.epoch,entityId:entity.id};
    }
    if(typeof entity.sleepState?.sleeping==='boolean') {
      if(local.sleepState?.sleeping!==entity.sleepState.sleeping){delete local.swing;this.motions.delete(uuid);}
      local.sleepState={...entity.sleepState,epoch:binding.epoch,entityId:entity.id};
    }
    local.body={at:now,epoch:binding.epoch,entityId:entity.id,
      handUse:observedHandUse(entity,row),
      ...(typeof row.inWater==='boolean'?{inWater:row.inWater}:{}),
      ...(typeof row.onGround==='boolean'?{onGround:row.onGround}:{})};
    // avatarState's Mineflayer velocity is blocks/tick; YSM documents m/s.
    if(Number.isFinite(row.verticalSpeed))local.body.verticalSpeed=row.verticalSpeed*20;
    if(Number.isFinite(row.horizontalSpeed)&&row.horizontalSpeed>=0)local.body.horizontalSpeed=row.horizontalSpeed*20;
    for(const key of ['sprinting','sneaking'])if(typeof row[key]==='boolean')local.body[key]=row[key];
    for(const key of ['health','maxHealth'])if(Number.isFinite(row[key]))local.body[key]=row[key];
    this.fallback.set(uuid,local);
  }
  action(event,now=performance.now()) {
    if(!event || event.animation!=='oneSwing')return;
    for(const [uuid,row]of this.states)if(String(row.entityId)===String(event.id)) {
      if(this.fallback.get(uuid)?.bodyState?.canAct===false)return;
      const prior=this.fallback.get(uuid)??{};prior.swing={hand:event.hand==='left'?'offhand':'mainhand',sequence:++this.sequence,at:now};this.fallback.set(uuid,prior);
    }
  }
  motionFor(uuid,entity,now) {
    const latest=this.motions.get(uuid),local=this.fallback.get(uuid)??{},pos=entity.pos??entity.position;
    if(pos && local.position && now>local.at) {
      const d=Math.hypot(pos.x-local.position.x,pos.z-local.position.z);
      // Measure between changed network samples, not the preceding render
      // frame: a 100 ms sample rendered at 60 Hz otherwise spikes 6-fold.
      if(d>0){local.speed=d<3?Math.min(30,d*1000/Math.max(1,now-(local.movedAt??local.at))):0;local.movedAt=now;}
    }
    if(!local.movedAt || now-local.movedAt>250)local.speed=0;
    local.position=pos?{...pos}:null;local.at=now;this.fallback.set(uuid,local);
    const motion=latest && now-latest.at<2000?{...latest.row}:{horizontalSpeed:local.speed,equipment:entity.equipment,crouching:!!(Number(entity.metadata?.[0])&2),sprinting:!!(Number(entity.metadata?.[0])&8),pose:entity.metadata?.[6],headPitchDegrees:-(entity.pitch??0)*180/Math.PI};
    if (!latest || now-latest.at>=2000) Object.assign(motion,observedHandUse(entity));
    if(local.body && now-local.body.at<600 && local.body.entityId===entity.id && local.body.epoch===this.states.get(uuid)?.epoch) {
      for(const key of ['inWater','onGround'])if(typeof local.body[key]==='boolean')motion[key]=local.body[key];
      for(const key of ['verticalSpeed','health','maxHealth'])if(Number.isFinite(local.body[key]))motion[key]=local.body[key];
      if(Number.isFinite(local.body.horizontalSpeed))motion.horizontalSpeed=local.body.horizontalSpeed;
      if(typeof local.body.sprinting==='boolean')motion.sprinting=local.body.sprinting;
      if(typeof local.body.sneaking==='boolean')motion.crouching=local.body.sneaking;
      motion.waterSource='same_connection_body';
      Object.assign(motion,local.body.handUse);
    }
    if(latest?.row.swing)motion.swing={...latest.row.swing,ageSeconds:latest.row.swing.ageSeconds+(now-latest.at)/1000};
    if(latest?.row.hurt)motion.hurt={...latest.row.hurt,ageSeconds:latest.row.hurt.ageSeconds+(now-latest.at)/1000};
    // Legacy host action events cover the owner's locally initiated swing.
    if(local.swing && (!motion.swing || motion.swing.ageSeconds>2))motion.swing={...local.swing,ageSeconds:(now-local.swing.at)/1000};
    // Unlike a velocity sample, an authoritative restriction must not time out.
    if(local.bodyState && local.bodyState.entityId===entity.id && local.bodyState.epoch===this.states.get(uuid)?.epoch) {
      motion.bodyState=local.bodyState;
      if(!local.bodyState.canAct){motion.horizontalSpeed=0;motion.usingItem=false;delete motion.swing;delete motion.hurt;}
    }
    if(local.sleepState && local.sleepState.entityId===entity.id && local.sleepState.epoch===this.states.get(uuid)?.epoch) {
      motion.sleepState=local.sleepState;
      if(local.sleepState.sleeping){motion.pose='sleeping';motion.horizontalSpeed=0;motion.usingItem=false;delete motion.swing;delete motion.hurt;}
      else if(motion.pose==='sleeping'||motion.pose===2)motion.pose='standing';
    }
    return motion;
  }
  restore(actor){actor.actor.dispose();for(const [child,visible]of actor.hidden)child.visible=visible;actor.rendered.traverse(part=>{const position=this.nametags.get(part);if(position){part.position.copy(position);this.nametags.delete(part);}});}
  /** Native entity updates can reveal the original body again after our
   * animation RAF. Reapply ownership immediately before the scene is drawn. */
  syncNativeVisibility() {
    let resets=0;
    for (const [uuid,current] of this.actors) {
      const state=this.states.get(uuid),entity=this.entity(state?.entityId);
      if (!state || entity?.uuid?.toLowerCase()!==uuid || this.rendered(state.entityId)!==current.rendered || current.actor.root.parent!==current.rendered) continue;
      if(current.rendered.children.some(child=>child!==current.actor.root &&
        (child.name==='mesh'?child.children.some(part=>part.name!=='nametag'&&part.visible):child.name.startsWith('geometry_armor_')&&child.visible)))resets++;
      this.hideVanilla(current.rendered,current.actor.root,current.hidden);
    }
    return resets;
  }
  unmount(uuid){const actor=this.actors.get(uuid);if(actor){this.restore(actor);this.actors.delete(uuid);}this.pending.delete(uuid);this.failures.delete(uuid);}
  remove(uuid){this.unmount(uuid);this.states.delete(uuid);this.motions.delete(uuid);this.fallback.delete(uuid);this.overrides.delete(uuid);this.selectionNotices.delete(uuid);}
  clear(){for(const uuid of [...this.states.keys()])this.remove(uuid);this.assets.clear();this.assetSizes.clear();this.assetBytes=0;this.sequence++;}
  tick(now) {
    for(const [uuid,observed]of this.states) {
      const row=this.effective(observed);
      const entity=this.entity(row.entityId),rendered=this.rendered(row.entityId),bound=entity?.uuid?.toLowerCase()===uuid && rendered;
      const mounted=this.actors.get(uuid);
      if(mounted && (!bound || mounted.rendered!==rendered)){this.restore(mounted);this.actors.delete(uuid);}
      if(!bound || !row.available)continue;
      const current=this.actors.get(uuid);
      if(current){
        current.actor.setPresentation?.(this.presentation());
        current.actor.root.visible=!entity.metadata?.[0] || (entity.metadata[0]&32)===0;
        // The renderer's native scene entity already carries this player's yaw.
        current.actor.animate({...row,renderedYaw:rendered.rotation.y,pitch:entity.pitch,equipment:entity.equipment,motion:this.motionFor(uuid,entity,now)},now);
        if(!current.anchorAt || now-current.anchorAt>=100){const anchor=current.actor.headAnchor?.();current.anchorAt=now;
          current.anchor=anchor?rendered.worldToLocal(anchor):null;
          if(current.anchor)current.actor.framingHeight=Math.max(.5,current.anchor.y-.22);}
        this.hideVanilla(rendered,current.actor.root,current.hidden,current.anchor?rendered.localToWorld(current.anchor.clone()):null);continue;
      }
      if(!row.renderAvailable || this.pending.has(uuid) || this.failures.has(uuid))continue;
      const bundle=this.assets.get(row.assetSha256);if(!bundle || bundle.modelId!==row.modelId || row.selectionSource!=='web_viewer_override'&&row.ysmVersion!==undefined&&bundle.ysmVersion!==row.ysmVersion)continue;
      const marker=++this.sequence;this.pending.set(uuid,marker);
      void this.createActor(bundle,row.texture,{itemModels:this.itemModels}).then(actor=>{
        const current=this.effective(this.states.get(uuid));
        if(this.pending.get(uuid)!==marker || !current?.available || current.assetSha256!==row.assetSha256 || current.texture!==row.texture || current.epoch!==row.epoch || current.entityId!==row.entityId || this.rendered(row.entityId)!==rendered || this.entity(row.entityId)?.uuid?.toLowerCase()!==uuid){actor.dispose();return;}
        actor.assetInfo={...actor.assetInfo,selectionSource:row.selectionSource??'server',serverModelId:observed.modelId};
        const hidden=new Map();this.hideVanilla(rendered,actor.root,hidden);
        rendered.add(actor.root);this.actors.set(uuid,{actor,rendered,hidden});
      }).catch(error=>{if(this.pending.get(uuid)===marker)this.failures.set(uuid,error.message);}).finally(()=>{if(this.pending.get(uuid)===marker)this.pending.delete(uuid);});
    }
  }
  hideVanilla(rendered,actor,hidden,anchor) {
    const hide=child=>{if(!hidden.has(child))hidden.set(child,child.visible);child.visible=false;};
    for(const child of rendered.children)if(child!==actor) {
      if(child.name==='mesh') {
        // Player skin wrapper also contains the live nametag. Preserve the
        // wrapper/tag and hide only its vanilla body and equipment subtree.
        for(const part of child.children)if(part.name!=='nametag')hide(part);else if(anchor) {
          if(!this.nametags.has(part))this.nametags.set(part,part.position.clone());
          part.position.copy(child.worldToLocal(anchor.clone()));
        }
      }else if(child.name.startsWith('geometry_armor_'))hide(child);
    }
  }
  stats(){return {states:this.states.size,rendered:this.actors.size,pending:this.pending.size,failed:this.failures.size,unavailable:[...this.states.values()].map(r=>this.effective(r)).filter(r=>r.available&&!r.renderAvailable).length,errors:[...this.failures.values()],animationUnavailable:[...this.actors.values()].map(a=>a.actor.animationReason).filter(Boolean),heldUnavailable:[...this.actors.values()].flatMap(a=>Object.values(a.actor.heldState??{}).filter(hand=>hand.status==='unavailable')),actors:[...this.actors].map(([uuid,a])=>({uuid,animation:a.actor.animationState,held:a.actor.heldState})),assets:[...this.actors.values()].map(a=>a.actor.assetInfo)};}
}

export function installPaperYsmRenderGuard(world, players) {
  const entities=world?.entities;
  if(typeof entities?.render!=='function')return null;
  const original=entities.render;
  const diagnostics={draws:0,nativeVisibilityResets:0};
  const render=function(...args){const result=original.apply(this,args);diagnostics.draws++;diagnostics.nativeVisibilityResets+=players.syncNativeVisibility();return result;};
  entities.render=render;
  return {world,diagnostics,dispose(){if(entities.render===render)entities.render=original;}};
}
