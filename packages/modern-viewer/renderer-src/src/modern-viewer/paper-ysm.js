import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createNativeBedrockModel} from '../native-viewer/native-entity-model-bedrock.js';
import {PaperYsmAnimation} from './paper-ysm-animation.js';
import {PaperYsmHeldItems} from './paper-ysm-items.js';
export {applyPaperYsmAnimation} from './paper-ysm-animation.js';

const json=(bundle,path)=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(bundle.files[path].base64),c=>c.charCodeAt(0))));
export async function createPaperYsmActor(bundle,textureId,{itemModels={},loadTexture}={}) {
  const definition=json(bundle,'ysm.json'),geometry=json(bundle,bundle.model),animation=json(bundle,bundle.animation);
  const file=bundle.files[bundle.textures[textureId]];if(!file)throw Error('YSM_TEXTURE_UNAVAILABLE');
  if(definition.spec!==2 || definition.properties?.free!==true)throw Error('YSM_DEFINITION_UNSUPPORTED');
  const bounded=value=>{if(typeof value==='number' && (!Number.isFinite(value)||Math.abs(value)>65536))throw Error('YSM_GEOMETRY_VALUE_BUDGET');if(value && typeof value==='object')for(const child of Object.values(value))bounded(child);};
  bounded(geometry);
  const texture=await (loadTexture??(url=>new THREE.TextureLoader().loadAsync(url)))('data:image/png;base64,'+file.base64);
  let material,model;
  try {
    texture.flipY=true;texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
    material=new THREE.MeshLambertMaterial({map:texture,side:THREE.DoubleSide,alphaTest:.1});
    model=createNativeBedrockModel(geometry,material,{maxBones:512,maxCubesPerBone:256,maxCubes:2048,allowNegativeSizes:true});
    if(model.cubeCount>2048)throw Error('YSM_GEOMETRY_BUDGET');
    // Batch original faces within each identical bone/cube transform; retain exact UV and vertices.
    const merged=[];model.root.traverse(group=>{const meshes=group.children.filter(c=>c.isMesh);if(meshes.length<2)return;
      const geometry=mergeGeometries(meshes.map(m=>m.geometry));if(!geometry)throw Error('YSM_GEOMETRY_BATCH_FAILED');
      for(const mesh of meshes)mesh.removeFromParent();const mesh=new THREE.Mesh(geometry,material);group.add(mesh);merged.push(geometry);
    });
    const root=new THREE.Group(),orientation=new THREE.Group(),content=new THREE.Group();
    root.name='paper-ysm-player';
    root.add(orientation);orientation.add(content);orientation.scale.set(-1,-1,1);orientation.position.y=Math.fround(.01);content.position.y=-1.5;content.add(model.root);
    // YSM2.4.1's documented omitted-property default is .7, not one.
    const width=definition.properties?.width_scale??.7,height=definition.properties?.height_scale??.7;
    if(![width,height].every(n=>Number.isFinite(n)&&n>0&&n<=4))throw Error('YSM_SCALE_UNSUPPORTED');root.scale.set(width,height,width);
    const extra=kind=>{const path=bundle.animations?.[kind]??definition.files?.player?.animation?.[kind];return path&&bundle.files[path]?json(bundle,path):null;};
    const animationController=new PaperYsmAnimation(model,animation,{arm:extra('arm'),extra:extra('extra'),controllers:definition.files?.player?.animation_controllers??[]});
    const held=new PaperYsmHeldItems(model,itemModels);
    const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3());
    return {root,model,assetInfo:{modelId:bundle.modelId,assetSha256:bundle.assetSha256,sourceSha256:bundle.sourceSha256,texture:textureId,bones:model.bones.size,cubes:model.cubeCount,faces:model.faceCount,scale:{width,height},bindSizeBlocks:size.toArray(),completeEntityParityVerified:false},
      animate(state,now) {
        this.animationState=animationController.apply(state,now);this.animationReason=this.animationState.errors[0]??null;
        held.apply(state.motion?.equipment??state.equipment,state.motion?.mainArm??'right');this.heldState=held.stats();
      },
      dispose(){held.dispose();model.dispose();for(const g of merged)g.dispose();material.dispose();texture.dispose();root.removeFromParent();root.clear();}};
  } catch(error){model?.dispose();material?.dispose();texture.dispose();throw error;}
}

/** Mounted only onto a currently tracked vanilla player entity with the same UUID. */
export class PaperYsmPlayers {
  constructor({entity,rendered,itemModels={},createActor=createPaperYsmActor}={}){this.entity=entity;this.rendered=rendered;this.itemModels=itemModels;this.createActor=createActor;this.nametags=new WeakMap();this.motions=new Map();this.fallback=new Map();this.states=new Map();this.assets=new Map();this.assetSizes=new Map();this.assetBytes=0;this.actors=new Map();this.pending=new Map();this.failures=new Map();this.sequence=0;}
  asset(bundle){if(bundle?.schemaVersion!==1||bundle.format!=='ysm-bedrock-original'||!bundle.assetSha256)return;
    if(this.assets.has(bundle.assetSha256))return;
    const size=Object.values(bundle.files??{}).reduce((n,f)=>n+(f.base64?.length??0),0);if(size>8*1024*1024)return;
    while(this.assets.size>=32 || this.assetBytes+size>32*1024*1024){const key=this.assets.keys().next().value;this.assetBytes-=this.assetSizes.get(key);this.assetSizes.delete(key);this.assets.delete(key);}
    this.assets.set(bundle.assetSha256,bundle);this.assetSizes.set(bundle.assetSha256,size);this.assetBytes+=size;}
  state(row){if(row?.schemaVersion!==1||row.source!=='freesia_worker'||typeof row.playerUuid!=='string')return;
    const previous=this.states.get(row.playerUuid);if(previous && (previous.epoch!==row.epoch||previous.assetSha256!==row.assetSha256||previous.texture!==row.texture||previous.entityId!==row.entityId||!row.available))this.remove(row.playerUuid);
    if(this.states.size<40||this.states.has(row.playerUuid))this.states.set(row.playerUuid,row);}
  motion(row,now=performance.now()) {
    const state=this.states.get(row?.playerUuid),previous=this.motions.get(row?.playerUuid);
    if(!state || row.schemaVersion!==1 || row.source!=='same_connection_java_protocol' || state.epoch!==row.epoch || state.entityId!==row.entityId || !Number.isSafeInteger(row.sequence) || previous && previous.row.sequence>=row.sequence || !Number.isFinite(row.horizontalSpeed) || row.horizontalSpeed<0 || row.horizontalSpeed>30)return;
    this.motions.set(row.playerUuid,{row,at:now});
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
    if(latest?.row.swing)motion.swing={...latest.row.swing,ageSeconds:latest.row.swing.ageSeconds+(now-latest.at)/1000};
    if(latest?.row.hurt)motion.hurt={...latest.row.hurt,ageSeconds:latest.row.hurt.ageSeconds+(now-latest.at)/1000};
    // Legacy host action events cover the owner's locally initiated swing.
    if(local.swing && (!motion.swing || motion.swing.ageSeconds>2))motion.swing={...local.swing,ageSeconds:(now-local.swing.at)/1000};
    return motion;
  }
  restore(actor){actor.actor.dispose();for(const [child,visible]of actor.hidden)child.visible=visible;actor.rendered.traverse(part=>{const position=this.nametags.get(part);if(position){part.position.copy(position);this.nametags.delete(part);}});}
  remove(uuid){const actor=this.actors.get(uuid);if(actor){this.restore(actor);this.actors.delete(uuid);}this.pending.delete(uuid);this.failures.delete(uuid);this.states.delete(uuid);this.motions.delete(uuid);this.fallback.delete(uuid);}
  clear(){for(const uuid of [...this.states.keys()])this.remove(uuid);this.assets.clear();this.assetSizes.clear();this.assetBytes=0;this.sequence++;}
  tick(now) {
    for(const [uuid,row]of this.states) {
      const entity=this.entity(row.entityId),rendered=this.rendered(row.entityId),bound=entity?.uuid?.toLowerCase()===uuid && rendered;
      const mounted=this.actors.get(uuid);
      if(mounted && (!bound || mounted.rendered!==rendered)){this.restore(mounted);this.actors.delete(uuid);}
      if(!bound || !row.available)continue;
      const current=this.actors.get(uuid);
      if(current){
        this.hideVanilla(rendered,current.actor.root,current.hidden,current.actor.assetInfo.bindSizeBlocks[1]);
        current.actor.root.visible=!entity.metadata?.[0] || (entity.metadata[0]&32)===0;
        // The renderer's native scene entity already carries this player's yaw.
        current.actor.root.rotation.y=0;current.actor.animate({...row,pitch:entity.pitch,equipment:entity.equipment,motion:this.motionFor(uuid,entity,now)},now);continue;
      }
      if(!row.renderAvailable || this.pending.has(uuid) || this.failures.has(uuid))continue;
      const bundle=this.assets.get(row.assetSha256);if(!bundle || bundle.modelId!==row.modelId)continue;
      const marker=++this.sequence;this.pending.set(uuid,marker);
      void this.createActor(bundle,row.texture,{itemModels:this.itemModels}).then(actor=>{
        if(this.pending.get(uuid)!==marker || this.states.get(uuid)?.assetSha256!==row.assetSha256 || this.rendered(row.entityId)!==rendered || this.entity(row.entityId)?.uuid?.toLowerCase()!==uuid){actor.dispose();return;}
        const hidden=new Map();this.hideVanilla(rendered,actor.root,hidden,actor.assetInfo.bindSizeBlocks[1]);
        rendered.add(actor.root);this.actors.set(uuid,{actor,rendered,hidden});
      }).catch(error=>{if(this.pending.get(uuid)===marker)this.failures.set(uuid,error.message);}).finally(()=>{if(this.pending.get(uuid)===marker)this.pending.delete(uuid);});
    }
  }
  hideVanilla(rendered,actor,hidden,height) {
    const hide=child=>{if(!hidden.has(child))hidden.set(child,child.visible);child.visible=false;};
    for(const child of rendered.children)if(child!==actor) {
      if(child.name==='mesh') {
        // Player skin wrapper also contains the live nametag. Preserve the
        // wrapper/tag and hide only its vanilla body and equipment subtree.
        for(const part of child.children)if(part.name!=='nametag')hide(part);else if(Number.isFinite(height)) {
          if(!this.nametags.has(part))this.nametags.set(part,part.position.clone());
          const target=child.worldToLocal(rendered.localToWorld(new THREE.Vector3(0,height+.35,0)));
          part.position.y=Math.max(this.nametags.get(part).y,target.y);
        }
      }else if(child.name.startsWith('geometry_armor_'))hide(child);
    }
  }
  stats(){return {states:this.states.size,rendered:this.actors.size,pending:this.pending.size,failed:this.failures.size,unavailable:[...this.states.values()].filter(r=>r.available&&!r.renderAvailable).length,errors:[...this.failures.values()],animationUnavailable:[...this.actors.values()].map(a=>a.actor.animationReason).filter(Boolean),heldUnavailable:[...this.actors.values()].flatMap(a=>Object.values(a.actor.heldState??{}).filter(hand=>hand.status==='unavailable')),actors:[...this.actors].map(([uuid,a])=>({uuid,animation:a.actor.animationState,held:a.actor.heldState})),assets:[...this.actors.values()].map(a=>a.actor.assetInfo)};}
}
