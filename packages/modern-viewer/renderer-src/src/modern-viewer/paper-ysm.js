import * as THREE from 'three';
import {batchYsmBones} from './ysm-bone-batch.js';
import {createNativeBedrockModel} from '../native-viewer/native-entity-model-bedrock.js';
import {PaperYsmAnimation} from './paper-ysm-animation.js';
import {PaperYsmHeldItems} from './paper-ysm-items.js';
export {applyPaperYsmAnimation} from './paper-ysm-animation.js';

const json=(bundle,path)=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(bundle.files[path].base64),c=>c.charCodeAt(0))));
/** Visible animated head only: bind-pose bounds may include folded props. */
export function paperYsmHeadAnchor(model,root) {
  const head=model.bones.get('Head')??model.bones.get('head');if(!head)return null;
  root.updateWorldMatrix(true,true);
  const bounds=new THREE.Box3(),part=new THREE.Box3(),scale=new THREE.Vector3();
  head.traverseVisible(mesh=>{
    if(!mesh.isMesh)return;scale.setFromMatrixScale(mesh.matrixWorld);
    if(![scale.x,scale.y,scale.z].every(n=>Number.isFinite(n)&&Math.abs(n)>=.001))return;
    if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();part.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);bounds.union(part);
  });
  if(bounds.isEmpty())return null;
  const point=bounds.getCenter(new THREE.Vector3());point.y=bounds.max.y+.22;return point;
}
export async function createPaperYsmActor(bundle,textureId,{itemModels={},loadTexture}={}) {
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
    if(model.cubeCount>2048)throw Error('YSM_GEOMETRY_BUDGET');
    batch=batchYsmBones(model,material);
    const root=new THREE.Group(),orientation=new THREE.Group(),content=new THREE.Group();
    root.name='paper-ysm-player';
    root.add(orientation);orientation.add(content);orientation.scale.set(-1,-1,1);orientation.position.y=Math.fround(.01);content.position.y=-1.5;content.add(model.root);
    // YSM2.4.1's documented omitted-property default is .7, not one.
    const width=definition.properties?.width_scale??.7,height=definition.properties?.height_scale??.7;
    if(![width,height].every(n=>Number.isFinite(n)&&n>0&&n<=4))throw Error('YSM_SCALE_UNSUPPORTED');root.scale.set(width,height,width);
    const extra=kind=>{const path=bundle.animations?.[kind]??definition.files?.player?.animation?.[kind];return path&&bundle.files[path]?json(bundle,path):null;};
    const animationController=new PaperYsmAnimation(model,animation,{arm:extra('arm'),extra:extra('extra'),controllers:definition.files?.player?.animation_controllers??[]});
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
        this.animationState=animationController.apply(state,now);this.animationReason=this.animationState.errors[0]??null;
        this.animationIssues??=new Set();for(const reason of this.animationState.errors)if(this.animationIssues.size<16)this.animationIssues.add(reason);
        held.apply(state.motion?.equipment??state.equipment,state.motion?.mainArm??'right');this.heldState=held.stats();
      },
      headAnchor(){return paperYsmHeadAnchor(model,root);},
      dispose(){held.dispose();model.dispose();batch.dispose();material.dispose();texture.dispose();root.removeFromParent();root.clear();}};
  } catch(error){batch?.dispose();model?.dispose();material?.dispose();texture.dispose();throw error;}
}

/** Mounted only onto a currently tracked vanilla player entity with the same UUID. */
export class PaperYsmPlayers {
  constructor({entity,rendered,itemModels={},createActor=createPaperYsmActor,presentation=()=>null}={}){this.entity=entity;this.rendered=rendered;this.itemModels=itemModels;this.createActor=createActor;this.presentation=presentation;this.nametags=new WeakMap();this.motions=new Map();this.fallback=new Map();this.states=new Map();this.assets=new Map();this.assetSizes=new Map();this.assetBytes=0;this.actors=new Map();this.pending=new Map();this.failures=new Map();this.sequence=0;this.overrides=new Map();this.selectionNotices=new Map();}
  asset(bundle){if(bundle?.schemaVersion!==1||bundle.format!=='ysm-bedrock-original'||!bundle.assetSha256)return;
    if(this.assets.has(bundle.assetSha256))return;
    const size=Object.values(bundle.files??{}).reduce((n,f)=>n+(f.base64?.length??0),0);if(size>8*1024*1024)return;
    while(this.assets.size>=32 || this.assetBytes+size>32*1024*1024){const key=this.assets.keys().next().value;this.assetBytes-=this.assetSizes.get(key);this.assetSizes.delete(key);this.assets.delete(key);
      for(const [uuid,choice]of this.overrides)if(choice.assetSha256===key){this.overrides.delete(uuid);this.unmount(uuid);this.selectionNotices.set(uuid,'所选资源已过期；已恢复服务器外观');}}
    this.assets.set(bundle.assetSha256,bundle);this.assetSizes.set(bundle.assetSha256,size);this.assetBytes+=size;}
  state(row){if(row?.schemaVersion!==1||row.source!=='freesia_worker'||typeof row.playerUuid!=='string')return;
    const previous=this.states.get(row.playerUuid);
    if(previous && (previous.epoch!==row.epoch||previous.entityId!==row.entityId))this.remove(row.playerUuid);
    else if(previous && !this.overrides.has(row.playerUuid) && (previous.assetSha256!==row.assetSha256||previous.texture!==row.texture||!row.available))this.unmount(row.playerUuid);
    if(this.states.size<40||this.states.has(row.playerUuid))this.states.set(row.playerUuid,row);}
  choices(){
    const choices=[{id:'server',label:'跟随服务器'},{id:'skin',label:'原版玩家皮肤（Web）'}];
    for(const bundle of this.assets.values())for(const [texture,path]of Object.entries(bundle.textures??{})) {
      if(!bundle.files?.[path] || !bundle.files?.[bundle.model] || !bundle.files?.['ysm.json'])continue;
      choices.push({id:`ysm:${bundle.assetSha256}:${encodeURIComponent(texture)}`,label:`${bundle.modelId} · ${texture}`,assetSha256:bundle.assetSha256,modelId:bundle.modelId,texture});
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
    else if(!choice && row?.available && !row.renderAvailable)status+=' · 服务器模型资源不可用';
    else if(!choice && row?.available===false)status+=' · 服务器未提供可用 YSM 外观';
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
    local.body={at:now,epoch:binding.epoch,entityId:entity.id,
      ...(typeof row.inWater==='boolean'?{inWater:row.inWater}:{}),
      ...(typeof row.onGround==='boolean'?{onGround:row.onGround}:{})};
    // avatarState's Mineflayer velocity is blocks/tick; YSM documents m/s.
    if(Number.isFinite(row.verticalSpeed))local.body.verticalSpeed=row.verticalSpeed*20;
    for(const key of ['health','maxHealth'])if(Number.isFinite(row[key]))local.body[key]=row[key];
    this.fallback.set(uuid,local);
  }
  action(event,now=performance.now()) {
    if(!event || event.animation!=='oneSwing')return;
    for(const [uuid,row]of this.states)if(String(row.entityId)===String(event.id)) {
      const prior=this.fallback.get(uuid)??{};prior.swing={hand:event.hand==='left'?'offhand':'mainhand',sequence:++this.sequence,at:now};this.fallback.set(uuid,prior);
    }
  }
  motionFor(uuid,entity,now) {
    const latest=this.motions.get(uuid),local=this.fallback.get(uuid)??{},pos=entity.pos??entity.position;
    if(pos && local.position && now>local.at) {
      const d=Math.hypot(pos.x-local.position.x,pos.z-local.position.z);
      if(d>0){local.speed=d<3?Math.min(30,d*1000/(now-local.at)):0;local.movedAt=now;}
    }
    if(!local.movedAt || now-local.movedAt>250)local.speed=0;
    local.position=pos?{...pos}:null;local.at=now;this.fallback.set(uuid,local);
    const motion=latest && now-latest.at<2000?{...latest.row}:{horizontalSpeed:local.speed,equipment:entity.equipment,crouching:!!(Number(entity.metadata?.[0])&2),sprinting:!!(Number(entity.metadata?.[0])&8),pose:entity.metadata?.[6],headPitchDegrees:-(entity.pitch??0)*180/Math.PI};
    if(local.body && now-local.body.at<600 && local.body.entityId===entity.id && local.body.epoch===this.states.get(uuid)?.epoch) {
      for(const key of ['inWater','onGround'])if(typeof local.body[key]==='boolean')motion[key]=local.body[key];
      for(const key of ['verticalSpeed','health','maxHealth'])if(Number.isFinite(local.body[key]))motion[key]=local.body[key];
      motion.waterSource='same_connection_body';
    }
    if(latest?.row.swing)motion.swing={...latest.row.swing,ageSeconds:latest.row.swing.ageSeconds+(now-latest.at)/1000};
    if(latest?.row.hurt)motion.hurt={...latest.row.hurt,ageSeconds:latest.row.hurt.ageSeconds+(now-latest.at)/1000};
    // Legacy host action events cover the owner's locally initiated swing.
    if(local.swing && (!motion.swing || motion.swing.ageSeconds>2))motion.swing={...local.swing,ageSeconds:(now-local.swing.at)/1000};
    return motion;
  }
  restore(actor){actor.actor.dispose();for(const [child,visible]of actor.hidden)child.visible=visible;actor.rendered.traverse(part=>{const position=this.nametags.get(part);if(position){part.position.copy(position);this.nametags.delete(part);}});}
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
        current.actor.root.rotation.y=0;current.actor.animate({...row,pitch:entity.pitch,equipment:entity.equipment,motion:this.motionFor(uuid,entity,now)},now);
        if(!current.anchorAt || now-current.anchorAt>=100){const anchor=current.actor.headAnchor?.();current.anchorAt=now;
          current.anchor=anchor?rendered.worldToLocal(anchor):null;
          if(current.anchor)current.actor.framingHeight=Math.max(.5,current.anchor.y-.22);}
        this.hideVanilla(rendered,current.actor.root,current.hidden,current.anchor?rendered.localToWorld(current.anchor.clone()):null);continue;
      }
      if(!row.renderAvailable || this.pending.has(uuid) || this.failures.has(uuid))continue;
      const bundle=this.assets.get(row.assetSha256);if(!bundle || bundle.modelId!==row.modelId)continue;
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
  stats(){return {states:this.states.size,rendered:this.actors.size,pending:this.pending.size,failed:this.failures.size,unavailable:[...this.states.values()].filter(r=>r.available&&!r.renderAvailable).length,errors:[...this.failures.values()],animationUnavailable:[...this.actors.values()].map(a=>a.actor.animationReason).filter(Boolean),heldUnavailable:[...this.actors.values()].flatMap(a=>Object.values(a.actor.heldState??{}).filter(hand=>hand.status==='unavailable')),actors:[...this.actors].map(([uuid,a])=>({uuid,animation:a.actor.animationState,held:a.actor.heldState})),assets:[...this.actors.values()].map(a=>a.actor.assetInfo)};}
}
