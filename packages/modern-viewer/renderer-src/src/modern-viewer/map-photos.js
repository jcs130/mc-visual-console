import { BoxGeometry, DataTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, NearestFilter, PlaneGeometry, Quaternion, RGBAFormat, SRGBColorSpace, TextureLoader, Vector3 } from 'three';

const bytes = value => value instanceof ArrayBuffer && value.byteLength<=16384 ? new Uint8Array(value)
  : value instanceof Uint8Array && value.length<=16384 ? value : Array.isArray(value) && value.length <= 16384
  && value.every(n=>Number.isInteger(n)&&n>=0&&n<=255) ? Uint8Array.from(value)
    : value?.type==='Buffer' ? bytes(value.data) : null;
const integer = (n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
export function applyMapPixels(previous, patch, palette, shades) {
  if(!patch || patch.schemaVersion!==1 || !integer(patch.mapId,0,2147483647) || !integer(patch.columns,0,128)) return null;
  if (previous && previous.mapId!==patch.mapId) return null;
  const map=previous ?? {mapId:patch.mapId,pixels:new Uint8Array(16384),coverage:new Uint8Array(2048),rgba:new Uint8Array(65536),received:0,icons:[]};
  if (Array.isArray(patch.icons)) map.icons=patch.icons.slice(0,256);
  if(patch.columns===0) return map;
  const data=bytes(patch.data),coverage=patch.snapshot?bytes(patch.coverage):null;
  if(!integer(patch.rows,1,128)||!integer(patch.x,0,127)||!integer(patch.y,0,127)
      ||patch.x+patch.columns>128||patch.y+patch.rows>128||data?.length!==patch.columns*patch.rows
      ||patch.snapshot&&(coverage?.length!==2048||patch.columns!==128||patch.rows!==128||patch.x!==0||patch.y!==0)) return null;
  for(let y=0;y<patch.rows;y++)for(let x=0;x<patch.columns;x++) {
    const index=(patch.y+y)*128+patch.x+x;
    if(coverage && !(coverage[index>>3]&(1<<(index&7)))) continue;
    const code=data[y*patch.columns+x],base=palette[code>>2],shade=shades[code&3];
    if(base===undefined) continue;
    map.pixels[index]=code;
    if(!(map.coverage[index>>3]&(1<<(index&7))))map.received++;
    map.coverage[index>>3]|=1<<(index&7);
    map.rgba.set(code>>2===0?[0,0,0,0]:[(base>>16&255)*shade/255|0,(base>>8&255)*shade/255|0,(base&255)*shade/255|0,255],index*4);
  }
  return map;
}

export function mapFramePose(frame) {
  if(!frame?.position||![frame.position.x,frame.position.y,frame.position.z].every(Number.isFinite)
      ||!Array.isArray(frame.normal)||frame.normal.length!==3||!frame.normal.every(n=>[-1,0,1].includes(n))
      ||frame.normal.reduce((s,n)=>s+Math.abs(n),0)!==1||!integer(frame.rotation,0,7))return null;
  const normal=new Vector3(...frame.normal),up=Math.abs(normal.y)===1?new Vector3(0,0,-normal.y):new Vector3(0,1,0);
  const right=new Vector3().crossVectors(up,normal);
  const rotation=new Quaternion().setFromUnitVectors(new Vector3(0,0,1),normal);
  if(Math.abs(normal.y)===1) {
    // setFromUnitVectors preserves local X; this is the vanilla floor/ceiling map basis.
    up.set(0,0,-normal.y);
  }
  return {normal,up,right,rotation,angle:-(frame.rotation%4)*Math.PI/2,offset:frame.invisible?-.0234375:.0390625};
}

export class MapPhotos {
  constructor({getWorld=()=>globalThis.world,getEntity=id=>globalThis.world?.entities?.entities?.[String(id)]}={}) {
    this.getWorld=getWorld;this.getEntity=getEntity;this.maps=new Map();this.frames=new Map();this.instances=new Map();this.models=new Map();this.epoch=null;this.assets=null;
    this.pending=[];this.diagnostics={patches:0,rejected:0,evicted:0,mapDecorationsRendered:false};
  }
  setAssets(assets) {this.assets=assets;for(const p of this.pending)this.handlePixels(p);this.pending=[];}
  acceptEpoch(value) {if(!integer(value,0,2147483647))return false;if(this.epoch===null)this.epoch=value;return value===this.epoch;}
  handlePixels(patch) {
    if(!this.acceptEpoch(patch?.epoch))return false;
    if(!this.assets) {if(this.pending.length<64)this.pending.push(patch);return false;}
    const prior=this.maps.get(patch.mapId),map=applyMapPixels(prior,patch,this.assets.mapColors,this.assets.shades);
    if(!map){this.diagnostics.rejected++;return false;}
    if(!prior) {
      if(this.maps.size>=64){const id=this.maps.keys().next().value;this.maps.get(id).texture?.dispose();this.maps.delete(id);this.diagnostics.evicted++;}
      const texture=new DataTexture(map.rgba,128,128,RGBAFormat);texture.flipY=true;texture.magFilter=texture.minFilter=NearestFilter;texture.generateMipmaps=false;texture.colorSpace=SRGBColorSpace;map.texture=texture;this.maps.set(map.mapId,map);
    }
    if(patch.columns>0)map.texture.needsUpdate=true;
    this.diagnostics.patches++;return true;
  }
  handleFrame(frame) {
    if(!this.acceptEpoch(frame?.epoch)||!integer(frame.id,0,2147483647))return false;
    if(frame.delete||frame.mapId===null){this.frames.delete(frame.id);this.remove(frame.id);return true;}
    if(!['item_frame','glow_item_frame'].includes(frame.name)||!integer(frame.mapId,0,2147483647)||!mapFramePose(frame))return false;
    if(this.frames.size>=128&&!this.frames.has(frame.id))return false;
    this.frames.set(frame.id,frame);return true;
  }
  model(name) {
    if(this.models.has(name))return this.models.get(name);
    const spec=this.assets?.frameModels?.[name];if(!spec?.elements||spec.elements.length>8)return null;
    const group=new Group(),resources=[];
    const empty=new MeshBasicMaterial({visible:false});resources.push(empty);
    const loader=new TextureLoader(),textures=new Map();
    const getMaterial=key=>{
      const path=spec.textures[key.replace(/^#/,'')];if(!/^block\/[a-z_]+$/.test(path??''))throw Error('frame_texture_invalid');
      if(textures.has(path))return textures.get(path);
      const texture=loader.load('/textures/1.20.6/'+path+'.png');texture.magFilter=texture.minFilter=NearestFilter;texture.generateMipmaps=false;texture.colorSpace=SRGBColorSpace;
      const material=new MeshBasicMaterial({map:texture,toneMapped:false});resources.push(texture,material);textures.set(path,material);return material;
    };
    for(const e of spec.elements) {
      if(!e.from?.every(Number.isFinite)||!e.to?.every(Number.isFinite)||e.rotation)throw Error('frame_model_unsupported');
      const g=new BoxGeometry(...e.to.map((n,i)=>(n-e.from[i])/16));
      const materials=['east','west','up','down','south','north'].map((face,i)=>{
        const f=e.faces[face];if(!f)return empty;
        const [u1,v1,u2,v2]=f.uv;g.attributes.uv.array.set([u1/16,1-v1/16,u2/16,1-v1/16,u1/16,1-v2/16,u2/16,1-v2/16],i*8);
        return getMaterial(f.texture);
      });
      const mesh=new Mesh(g,materials);mesh.position.set((e.to[0]+e.from[0])/32-.5,(e.to[1]+e.from[1])/32-.5,(e.to[2]+e.from[2])/32-.96875);group.add(mesh);resources.push(g);
    }
    const model={group,resources};this.models.set(name,model);return model;
  }
  tick() {
    const world=this.getWorld();if(!world?.scene||!world?.sceneOrigin||!this.assets)return;
    for(const [id,frame] of this.frames) {
      const map=this.maps.get(frame.mapId);if(!map?.received){this.remove(id);continue;}
      let entry=this.instances.get(id);
      if(entry&&(entry.mapId!==frame.mapId||entry.name!==frame.name||entry.scene!==world.scene)){this.remove(id);entry=null;}
      if(!entry) {
        if(this.instances.size>=32)continue;
        const model=this.model(frame.name);if(!model)continue;
        const root=new Group(),body=model.group.clone(true);body.name='original-item-frame-model';root.add(body);
        const geometry=new PlaneGeometry(1,1),material=new MeshBasicMaterial({map:map.texture,side:DoubleSide,transparent:true,alphaTest:.01,toneMapped:false});
        const plane=new Mesh(geometry,material);plane.name='received-map-pixels';root.add(plane);world.scene.add(root);
        entry={root,body,plane,geometry,material,mapId:frame.mapId,name:frame.name,scene:world.scene,native:null};this.instances.set(id,entry);
      }
      const native=this.getEntity(id)?.children?.find(c=>c.name==='mesh');
      if(native&&entry.native!==native){if(entry.native)entry.native.visible=entry.nativeVisible;entry.native=native;entry.nativeVisible=native.visible;native.visible=false;}
      const pose=mapFramePose(frame),p=frame.position,o=world.sceneOrigin;
      entry.root.position.set(o.toSceneX(p.x),o.toSceneY(p.y),o.toSceneZ(p.z));entry.root.quaternion.copy(pose.rotation);
      entry.body.visible=!frame.invisible;entry.plane.position.z=pose.offset;entry.plane.rotation.z=pose.angle;
      if(entry.material.map!==map.texture){entry.material.map=map.texture;entry.material.needsUpdate=true;}
    }
  }
  remove(id) {const e=this.instances.get(id);if(!e)return;e.root.removeFromParent();e.geometry.dispose();e.material.dispose();if(e.native)e.native.visible=e.nativeVisible;this.instances.delete(id);}
  reset(epoch=null) {for(const id of this.instances.keys())this.remove(id);for(const m of this.maps.values())m.texture?.dispose();this.maps.clear();this.frames.clear();this.pending=[];this.epoch=epoch;}
  dispose() {this.reset();for(const m of this.models.values())for(const r of m.resources)r.dispose();this.models.clear();this.assets=null;}
  stats() {return {...this.diagnostics,maps:this.maps.size,frames:this.frames.size,visible:this.instances.size,waiting:[...this.frames.values()].filter(f=>!this.maps.get(f.mapId)?.received).length,ready:!!this.assets};}
}

export function heldMapId(item) {
  if (item?.name?.replace(/^minecraft:/,'')!=='filled_map') return null;
  const component=item.components?.find(c=>c.type==='map_id'||c.type==='minecraft:map_id');
  return integer(component?.data,0,2147483647)?component.data:null;
}
