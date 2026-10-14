import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const mc = require('minecraft-data')('1.20.6');
const Block = require('prismarine-block')('1.20.6');
const Chunk = require('prismarine-chunk')('1.20.6');
const canonical = props => JSON.stringify(Object.entries(props).map(([k,v]) => [k,String(v)]).sort(([a],[b]) => a.localeCompare(b)));
const identifier = /^minecraft:[a-z0-9_./-]+$/;
const number = (v,min,max) => Number.isFinite(v) && v >= min && v <= max;
const integer = (v,min,max) => Number.isSafeInteger(v) && v >= min && v <= max;
const requireValue = (ok,why) => { if(!ok) throw Error('JAVA_VISUAL_' + why); };
export const javaYaw = degrees => Math.PI - degrees * Math.PI / 180;
export const javaPitch = degrees => -degrees * Math.PI / 180;

/** Explicit native-state to vanilla-renderer registry. Unknown mod content is never replaced. */
export class JavaVisualData {
  constructor({ uuid, server, skinUrl = () => null }) { this.uuid = uuid.toLowerCase(); this.server = server.toLowerCase().replace(/:25565$/,''); this.skinUrl = skinUrl; this.clear(); }
  clear() { this.epoch = null; this.sequence = -1; this.blocks = null; this.biomes = null; this.columns = new Map(); this.entities = new Map(); this.frame = null; }
  verify(value, epoch = false) {
    requireValue(value?.protocol === 'agent-mc-visual/v1' && value.minecraftVersion === '1.20.6', 'VERSION_MISMATCH');
    requireValue(value.uuid?.toLowerCase() === this.uuid && value.server?.toLowerCase().replace(/:25565$/,'') === this.server, 'IDENTITY_MISMATCH');
    requireValue(typeof value.epoch === 'string' && value.epoch.length < 128 && integer(value.sequence,0,Number.MAX_SAFE_INTEGER) && number(value.sampledAt,0,Number.MAX_SAFE_INTEGER),'ENVELOPE_INVALID');
    if(epoch) requireValue(value.epoch === this.epoch,'EPOCH_MISMATCH');
  }
  registry(value) {
    this.verify(value); const { blocks, biomes } = value.registry ?? {};
    requireValue(Array.isArray(blocks) && blocks.length > 0 && blocks.length <= 131072 && Array.isArray(biomes) && biomes.length <= 4096,'REGISTRY_INVALID');
    const states = new Map(), biomeIds = new Map(), vanillaStates = new Map();
    for (const block of mc.blocksArray) for (let id=block.minStateId;id<=block.maxStateId;id++) vanillaStates.set(block.name+canonical(Block.fromStateId(id,0).getProperties()),id);
    for(const row of blocks) {
      requireValue(integer(row.id,0,131071) && typeof row.name === 'string' && row.properties && !states.has(row.id),'STATE_INVALID');
      let target = null;
      if(identifier.test(row.name)) {
        target = vanillaStates.get(row.name.slice(10)+canonical(row.properties)) ?? null;
      }
      states.set(row.id,target);
    }
    for(const row of biomes) {
      requireValue(integer(row.id,0,4095) && !biomeIds.has(row.id),'BIOME_INVALID');
      biomeIds.set(row.id,identifier.test(row.name) ? mc.biomesByName[row.name.slice(10)]?.id ?? null : null);
    }
    this.clear(); this.epoch = value.epoch; this.blocks = states; this.biomes = biomeIds;
  }
  decodeChunk(value) {
    this.verify(value,true); requireValue(this.blocks && integer(value.x,-1875000,1875000) && integer(value.z,-1875000,1875000)
      && integer(value.minY,-2048,2048) && value.minY%16===0 && integer(value.height,16,1024) && value.height%16===0
      && typeof value.sections === 'string' && value.sections.length <= 3*1024*1024,'CHUNK_INVALID');
    requireValue(Array.isArray(value.skyLight) && Array.isArray(value.blockLight) && value.skyLight.length === value.height/16 && value.blockLight.length === value.height/16,'LIGHT_INVALID');
    const raw = new Chunk({ minY:value.minY,worldHeight:value.height });
    raw.maxBitsPerBlock = Math.ceil(Math.log2([...this.blocks.keys()].reduce((a,b)=>Math.max(a,b),0)+1));
    raw.maxBitsPerBiome = Math.ceil(Math.log2([...this.biomes.keys()].reduce((a,b)=>Math.max(a,b),0)+1));
    raw.load(Buffer.from(value.sections,'base64'));
    // Preserve the whole column, including underground/air, not just visible surfaces.
    for(let i=0;i<raw.sections.length;i++) {
      const section=raw.sections[i];
      for(let y=0;y<16;y++) for(let z=0;z<16;z++) for(let x=0;x<16;x++) {
        const p={x,y,z}, before=section.get(p), after=this.blocks.get(before);
        requireValue(after!==undefined && after!==null,'UNSUPPORTED_BLOCK_STATE_'+before);
        if(before!==after) section.set(p,after);
      }
      const biome=raw.biomes[i];
      for(let y=0;y<4;y++) for(let z=0;z<4;z++) for(let x=0;x<4;x++) {
        const p={x,y,z},before=biome.get(p),after=this.biomes.get(before);
        requireValue(after!==undefined && after!==null,'UNSUPPORTED_BIOME_'+before);
        if(before!==after) biome.set(p,after);
      }
    }
    // Public light loader uses section masks; no fabricated sky or block light.
    const masks = [raw.skyLightMask,raw.blockLightMask].map(mask=>{ for(let i=0;i<value.height/16;i++)mask.set(i+1,1);return mask.toLongArray(); });
    const lights = [value.skyLight,value.blockLight].map(rows=>rows.map(row=>{
      requireValue(row !== null,'LIGHT_UNAVAILABLE');
      requireValue(typeof row === 'string' && row.length<=2800,'LIGHT_INVALID'); const b=Buffer.from(row,'base64');requireValue(b.length===2048,'LIGHT_INVALID');return b;
    }));
    raw.loadParsedLight(lights[0],lights[1],masks[0],masks[1],[],[]);
    return { x:value.x*16,z:value.z*16,chunk:raw.toJson(),worldConfig:{minY:value.minY,worldHeight:value.height},
      native:{epoch:value.epoch,revision:value.revision,sampledAt:value.sampledAt,blockEntitiesAvailable:false,
        missingSkySections:value.skyLight.flatMap((v,i)=>v===null?[i]:[]),missingBlockSections:value.blockLight.flatMap((v,i)=>v===null?[i]:[])} };
  }
  entity(row,self=false) {
    requireValue(integer(row.id,0,0x7fffffff) && identifier.test(row.name) && Array.isArray(row.position) && row.position.length===3 && row.position.every(v=>number(v,-30000000,30000000))
      && [row.yaw,row.pitch,row.headYaw].every(v=>number(v,-1e9,1e9)),'ENTITY_INVALID');
    const equipment=(row.equipment ?? []).map(item=>{
      if(!item) return null;
      const native=identifier.test(item.name) && mc.itemsByName[item.name.slice(10)];
      requireValue(native,'UNSUPPORTED_ITEM');return { name:native.name,type:native.id,itemId:native.id,count:item.count,displayName:item.displayName };
    });
    const [x,y,z]=row.position;
    return { id:row.id,uuid:row.uuid,name:row.name.slice(10),type:row.name==='minecraft:player'?'player':'mob',
      username:row.username,pos:{x,y,z},yaw:javaYaw(row.yaw),pitch:javaPitch(row.pitch),headYaw:javaYaw(row.headYaw),
      width:row.width,height:row.height,isSelf:self,burning:row.burning,equipment,
      skinUrl:this.skinUrl(row.skinResource),
      skinModel:row.skinModel??null,metadata:[],nativePose:row.pose };
  }
  applyFrame(value,emit) {
    this.verify(value,true); requireValue(value.sequence > this.sequence,'STALE_FRAME'); this.sequence=value.sequence;
    requireValue(Array.isArray(value.columns)&&value.columns.length<=81 && Array.isArray(value.entities)&&value.entities.length<=256,'FRAME_INVALID');
    const seen=new Set();
    for(const c of value.columns) {
      const key=`${c.x},${c.z}`;
      requireValue(integer(c.x,-1875000,1875000)&&integer(c.z,-1875000,1875000)&&integer(c.revision,0,Number.MAX_SAFE_INTEGER)&&!seen.has(key),'COLUMN_INVALID');seen.add(key);
    }
    const self=this.entity(value.self,true), previous=this.frame;
    const teleport=!!previous && Math.hypot(...value.self.position.map((v,i)=>v-previous.self.position[i]))>8;
    emit('position',{pos:self.pos,yaw:self.yaw,pitch:self.pitch,teleport,sampledAt:value.sampledAt,sequence:value.sequence});
    const velocity=value.self.velocity??[0,0,0],speed=Math.hypot(velocity[0],velocity[2])*20;
    emit('avatarState',{seq:value.sequence,sequence:value.sequence,capturedAt:value.sampledAt,entity:self,
      health:value.health,food:value.food,dimension:value.dimension,onGround:value.self.onGround,eyeHeight:value.self.eyeHeight,
      sneaking:value.self.sneaking,sprinting:value.self.sprinting,velocity:{x:velocity[0],y:velocity[1],z:velocity[2]},
      movementState:value.self.sneaking?(speed>.05?'crouchWalking':'crouch'):(speed>.05?(value.self.sprinting?'running':'walking'):'idle'),
      horizontalSpeed:speed,teleported:teleport,usingItem:value.self.usingItem,source:'same_java_client_world'});
    // First slice renders own vanilla player. Other native entities remain observable,
    // but variant metadata, custom skins and mod animations require explicit adapters.
    const signature=JSON.stringify({...self,pos:null,yaw:null,pitch:null,headYaw:null});
    if(this.entities.get(self.id)!==signature) { emit('playerEntity',self);emit('entity',self);this.entities.set(self.id,signature); }
    else emit('entityMoved',self);
    if(previous && previous.self.id!==self.id) {emit('entity',{id:previous.self.id,delete:true});this.entities.delete(previous.self.id);}
    if(previous && value.self.hurtTime>previous.self.hurtTime) emit('entityDamage',{id:self.id,isSelf:true});
    if(!previous||value.time!==previous.time) emit('time',((value.time%24000)+24000)%24000);
    if(!previous||value.raining!==previous.raining||value.thunder!==previous.thunder) emit('weather',{raining:value.raining,thunder:value.thunder});
    const wanted=new Set(value.columns.map(c=>`${c.x},${c.z}`));
    for(const [key,column] of this.columns) if(!wanted.has(key)){emit('unloadChunk',{x:column.x,z:column.z});this.columns.delete(key);}
    this.frame=value;
    return value.columns.filter(c=>this.columns.get(`${c.x},${c.z}`)?.native.revision!==c.revision)
      .sort((a,b)=>Math.hypot(a.x-self.pos.x/16,a.z-self.pos.z/16)-Math.hypot(b.x-self.pos.x/16,b.z-self.pos.z/16));
  }
  acceptChunk(value,emit) {
    requireValue(integer(value.revision,0,Number.MAX_SAFE_INTEGER),'REVISION_INVALID');
    const wanted=this.frame?.columns.find(c=>c.x===value.x&&c.z===value.z);
    // Changes may arrive between the frame and the chunk. Older responses never overwrite new facts.
    if(!wanted || value.revision<wanted.revision || value.revision<(this.columns.get(`${value.x},${value.z}`)?.native.revision??-1))return null;
    const column=this.decodeChunk(value);this.columns.set(`${value.x},${value.z}`,column);emit('loadChunk',column);return column;
  }
}
