import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createNativeBedrockModel} from '../native-viewer/native-entity-model-bedrock.js';

const json=(bundle,path)=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(bundle.files[path].base64),c=>c.charCodeAt(0))));
const vector=v=>Array.isArray(v)&&v.length===3;
function scalar(value,query) {
  if(Number.isFinite(value))return value;
  const expressions={
    'ysm.is_close_eyes ? -1 : 0':()=>query.closeEyes?-1:0,'ysm.is_close_eyes ? 0 : 1':()=>query.closeEyes?0:1,
    'ysm.head_yaw/180':()=>query.headYaw/180,'ysm.head_pitch/360':()=>query.headPitch/360
  };
  if(typeof value==='string' && Object.hasOwn(expressions,value))return expressions[value]();
  throw Error('YSM_MOLANG_UNSUPPORTED');
}
function sample(track,seconds,query,channel) {
  const read=v=>{if(channel==='scale' && Number.isFinite(v))v=[v,v,v];if(!vector(v))throw Error('YSM_KEYFRAME_UNSUPPORTED');return v.map(n=>scalar(n,query));};
  if(vector(track)||Number.isFinite(track))return read(track);
  if(!track||typeof track!=='object'||Object.keys(track).length>256)throw Error('YSM_KEYFRAME_UNSUPPORTED');
  const entries=Object.entries(track).map(([time,v])=>{if(!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(time))throw Error('YSM_KEYFRAME_UNSUPPORTED');return {time:Number(time),v};}).sort((a,b)=>a.time-b.time);
  if(!entries.length)throw Error('YSM_KEYFRAME_UNSUPPORTED');
  if(seconds<=entries[0].time)return read(entries[0].v);
  const last=entries.at(-1);if(seconds>=last.time)return read(last.v);
  const index=entries.findIndex(v=>v.time>=seconds), a=entries[index-1],b=entries[index];
  const from=read(a.v),to=read(b.v),weight=(seconds-a.time)/(b.time-a.time);
  return from.map((v,i)=>v+(to[i]-v)*weight);
}
export function applyPaperYsmAnimation(model,definition,name,seconds,query) {
  const clip=definition?.animations?.[name];
  if(!clip || definition.format_version!=='1.8.0')throw Error('YSM_CLIP_UNAVAILABLE:'+name);
  const length=clip.animation_length??0;
  if(!Number.isFinite(length)||length<0||length>600)throw Error('YSM_CLIP_UNSUPPORTED');
  const time=length?(clip.loop===true?seconds%length:Math.min(seconds,length)):0;
  model.reset();
  for(const [name,channels] of Object.entries(clip.bones??{})) {
    const bone=model.bones.get(name),initial=model.initial.get(name);if(!bone)throw Error('YSM_ANIMATION_BONE_UNSUPPORTED');
    for(const [channel,track] of Object.entries(channels)) {
      const v=sample(track,time,query,channel);
      if(!v.every(Number.isFinite))throw Error('YSM_ANIMATION_VALUE_INVALID');
      if(channel==='rotation')bone.rotation.set(initial.rotation.x+v[0]*Math.PI/180,initial.rotation.y+v[1]*Math.PI/180,initial.rotation.z+v[2]*Math.PI/180,'ZYX');
      else if(channel==='position')bone.position.set(initial.position.x+v[0]/16,initial.position.y-v[1]/16,initial.position.z+v[2]/16);
      else if(channel==='scale')bone.scale.fromArray(v);
      else throw Error('YSM_ANIMATION_CHANNEL_UNSUPPORTED');
    }
  }
}
export async function createPaperYsmActor(bundle,textureId) {
  const definition=json(bundle,'ysm.json'),geometry=json(bundle,bundle.model),animation=json(bundle,bundle.animation);
  const file=bundle.files[bundle.textures[textureId]];if(!file)throw Error('YSM_TEXTURE_UNAVAILABLE');
  if(definition.spec!==2 || definition.properties?.free!==true)throw Error('YSM_DEFINITION_UNSUPPORTED');
  const bounded=value=>{if(typeof value==='number' && (!Number.isFinite(value)||Math.abs(value)>65536))throw Error('YSM_GEOMETRY_VALUE_BUDGET');if(value && typeof value==='object')for(const child of Object.values(value))bounded(child);};
  bounded(geometry);
  const texture=await new THREE.TextureLoader().loadAsync('data:image/png;base64,'+file.base64);
  let material,model;
  try {
    texture.flipY=true;texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
    material=new THREE.MeshLambertMaterial({map:texture,side:THREE.DoubleSide,alphaTest:.1});
    model=createNativeBedrockModel(geometry,material);
    if(model.cubeCount>2048)throw Error('YSM_GEOMETRY_BUDGET');
    // Batch original faces within each identical bone/cube transform; retain exact UV and vertices.
    const merged=[];model.root.traverse(group=>{const meshes=group.children.filter(c=>c.isMesh);if(meshes.length<2)return;
      const geometry=mergeGeometries(meshes.map(m=>m.geometry));if(!geometry)throw Error('YSM_GEOMETRY_BATCH_FAILED');
      for(const mesh of meshes)mesh.removeFromParent();const mesh=new THREE.Mesh(geometry,material);group.add(mesh);merged.push(geometry);
    });
    const root=new THREE.Group(),orientation=new THREE.Group(),content=new THREE.Group();
    root.add(orientation);orientation.add(content);orientation.scale.set(-1,-1,1);orientation.position.y=Math.fround(.01);content.position.y=-1.5;content.add(model.root);
    const width=definition.properties?.width_scale??1,height=definition.properties?.height_scale??1;
    if(![width,height].every(n=>Number.isFinite(n)&&n>0&&n<=4))throw Error('YSM_SCALE_UNSUPPORTED');root.scale.set(width,height,width);
    return {root,model,assetInfo:{modelId:bundle.modelId,assetSha256:bundle.assetSha256,sourceSha256:bundle.sourceSha256,texture:textureId,bones:model.bones.size,cubes:model.cubeCount,faces:model.faceCount,completeEntityParityVerified:false},
      animate(state,now) {
        // Clip name comes from the actual Worker packet; no synthetic gait/controller state.
        const clip=state.animation||'idle';
        const query={closeEyes:false,headYaw:0,headPitch:(state.pitch??0)*180/Math.PI};
        try{applyPaperYsmAnimation(model,animation,clip,now/1000,query);this.animationReason=null;}
        catch(error){model.reset();this.animationReason=error.message;}
      },
      dispose(){model.dispose();for(const g of merged)g.dispose();material.dispose();texture.dispose();root.removeFromParent();root.clear();}};
  } catch(error){model?.dispose();material?.dispose();texture.dispose();throw error;}
}

/** Mounted only onto a currently tracked vanilla player entity with the same UUID. */
export class PaperYsmPlayers {
  constructor({entity,rendered}={}){this.entity=entity;this.rendered=rendered;this.states=new Map();this.assets=new Map();this.assetSizes=new Map();this.assetBytes=0;this.actors=new Map();this.pending=new Map();this.failures=new Map();this.sequence=0;}
  asset(bundle){if(bundle?.schemaVersion!==1||bundle.format!=='ysm-bedrock-original'||!bundle.assetSha256)return;
    if(this.assets.has(bundle.assetSha256))return;
    const size=Object.values(bundle.files??{}).reduce((n,f)=>n+(f.base64?.length??0),0);if(size>8*1024*1024)return;
    while(this.assets.size>=32 || this.assetBytes+size>32*1024*1024){const key=this.assets.keys().next().value;this.assetBytes-=this.assetSizes.get(key);this.assetSizes.delete(key);this.assets.delete(key);}
    this.assets.set(bundle.assetSha256,bundle);this.assetSizes.set(bundle.assetSha256,size);this.assetBytes+=size;}
  state(row){if(row?.schemaVersion!==1||row.source!=='freesia_worker'||typeof row.playerUuid!=='string')return;
    const previous=this.states.get(row.playerUuid);if(previous && (previous.assetSha256!==row.assetSha256||previous.texture!==row.texture||previous.entityId!==row.entityId||!row.available))this.remove(row.playerUuid);
    if(this.states.size<40||this.states.has(row.playerUuid))this.states.set(row.playerUuid,row);}
  remove(uuid){const actor=this.actors.get(uuid);if(actor){actor.actor.dispose();for(const [child,visible]of actor.hidden)child.visible=visible;this.actors.delete(uuid);}this.pending.delete(uuid);this.failures.delete(uuid);this.states.delete(uuid);}
  clear(){for(const uuid of [...this.states.keys()])this.remove(uuid);this.assets.clear();this.assetSizes.clear();this.assetBytes=0;this.sequence++;}
  tick(now) {
    for(const [uuid,row]of this.states) {
      const entity=this.entity(row.entityId),rendered=this.rendered(row.entityId),bound=entity?.uuid?.toLowerCase()===uuid && rendered;
      const mounted=this.actors.get(uuid);
      if(mounted && (!bound || mounted.rendered!==rendered)){mounted.actor.dispose();for(const [child,v]of mounted.hidden)child.visible=v;this.actors.delete(uuid);}
      if(!bound || !row.available)continue;
      const current=this.actors.get(uuid);
      if(current){
        for(const child of rendered.children)if(child!==current.actor.root && (child.name==='mesh'||child.name.startsWith('geometry_armor_'))){if(!current.hidden.has(child))current.hidden.set(child,child.visible);child.visible=false;}
        current.actor.root.visible=!entity.metadata?.[0] || (entity.metadata[0]&32)===0;
        // The renderer's native scene entity already carries this player's yaw.
        current.actor.root.rotation.y=0;current.actor.animate({...row,pitch:entity.pitch},now);continue;
      }
      if(!row.renderAvailable || this.pending.has(uuid) || this.failures.has(uuid))continue;
      const bundle=this.assets.get(row.assetSha256);if(!bundle || bundle.modelId!==row.modelId)continue;
      const marker=++this.sequence;this.pending.set(uuid,marker);
      void createPaperYsmActor(bundle,row.texture).then(actor=>{
        if(this.pending.get(uuid)!==marker || this.states.get(uuid)?.assetSha256!==row.assetSha256 || this.rendered(row.entityId)!==rendered || this.entity(row.entityId)?.uuid?.toLowerCase()!==uuid){actor.dispose();return;}
        const hidden=new Map();for(const child of rendered.children)if(child.name==='mesh'||child.name.startsWith('geometry_armor_')){hidden.set(child,child.visible);child.visible=false;}
        rendered.add(actor.root);this.actors.set(uuid,{actor,rendered,hidden});
      }).catch(error=>{if(this.pending.get(uuid)===marker)this.failures.set(uuid,error.message);}).finally(()=>{if(this.pending.get(uuid)===marker)this.pending.delete(uuid);});
    }
  }
  stats(){return {states:this.states.size,rendered:this.actors.size,pending:this.pending.size,failed:this.failures.size,unavailable:[...this.states.values()].filter(r=>r.available&&!r.renderAvailable).length,errors:[...this.failures.values()],animationUnavailable:[...this.actors.values()].map(a=>a.actor.animationReason).filter(Boolean),assets:[...this.actors.values()].map(a=>a.actor.assetInfo)};}
}
