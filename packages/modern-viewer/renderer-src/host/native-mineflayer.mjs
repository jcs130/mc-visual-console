import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {prepareNativeWorldPreviewHost} from '../tools/native-world-preview-host.mjs';
import {loadGatewayItemRegistry,observeNativeGateway} from './native-gateway-stream.mjs';
import {loadNativePhysics} from './native-physics.mjs';
import {observeNativeItemAliases} from './native-item-identity.mjs';
import {observeVanillaHands} from './vanilla-hand-state.mjs';
import {TWILIGHT_1211_JAR,TWILIGHT_1211_SHA} from './native-twilight-components.mjs';
import {observeTwilightWindow} from './native-twilight-window.mjs';
import {observeTwilightRegistry} from './native-twilight-registry.mjs';
export {nativeItemIdentity} from './native-item-identity.mjs';
const require=createRequire(import.meta.url),requireChunk=createRequire(require.resolve('prismarine-chunk')),nbt=requireChunk('prismarine-nbt');
const finite=p=>p&&['x','y','z'].every(k=>Number.isInteger(p[k])&&Math.abs(p[k])<=30000000);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const AIR=new Set(['minecraft:air','minecraft:cave_air','minecraft:void_air']);

// Static registry geometry is never a proof of position-dependent collision.
// These queries read only received chunks and refuse coordinates hidden by an
// observed occluder or an unloaded cell; they do not load or generate terrain.
export function nativeVisible(world,eye,target){
  const dx=target.x-eye.x,dy=target.y-eye.y,dz=target.z-eye.z,d=Math.hypot(dx,dy,dz),steps=Math.ceil(d*16);
  for(let i=1;i<steps;i++){
    const p={x:eye.x+dx*i/steps,y:eye.y+dy*i/steps,z:eye.z+dz*i/steps},cell={x:Math.floor(p.x),y:Math.floor(p.y),z:Math.floor(p.z)};
    if(cell.x===Math.floor(target.x)&&cell.y===Math.floor(target.y)&&cell.z===Math.floor(target.z))continue;
    const id=world.stateIdAt(cell),state=world.states.get(id);if(!state)return false;
    if(state.canOcclude&&state.occlusionBoxes?.some(b=>p.x-cell.x>=b[0]&&p.y-cell.y>=b[1]&&p.z-cell.z>=b[2]&&p.x-cell.x<=b[3]&&p.y-cell.y<=b[4]&&p.z-cell.z<=b[5]))return false;
  }
  return true;
}
export async function prepareNativeConnection({assetDirectory,viewerPort=0}){
  const root=await fs.realpath(assetDirectory),manifest=JSON.parse(await fs.readFile(path.join(root,'native-assets.json'),'utf8'));
  const itemBytes=await fs.readFile(path.join(root,'registry/items.tsv'));
  if(hash(itemBytes)!==manifest.registryHashes?.['items.tsv'])throw Error('NATIVE_ITEM_REGISTRY_HASH_MISMATCH');
  const items=loadGatewayItemRegistry(itemBytes.toString());
  let blockRegistry=null;
  if(manifest.registryHashes?.['blocks.tsv']){
    const bytes=await fs.readFile(path.join(root,'registry/blocks.tsv'));
    if(hash(bytes)!==manifest.registryHashes['blocks.tsv'])throw Error('NATIVE_BLOCK_REGISTRY_HASH_MISMATCH');
    const rows=bytes.toString().trim().split('\n').map(line=>{
      const fields=line.trim().split('\t');
      if(fields.length!==4||!fields.slice(1).every(value=>/^\d+$/.test(value))||Number(fields[3])<1)throw Error('NATIVE_BLOCK_REGISTRY_INVALID');
      return fields.slice(0,2).join('\t');
    });
    blockRegistry=loadGatewayItemRegistry(rows.join('\n'));
  }
  const physics=await loadNativePhysics(root,manifest);
  const twilightComponents=manifest.sources?.some(s=>s.name===TWILIGHT_1211_JAR&&s.sha256===TWILIGHT_1211_SHA&&!s.explicitOverride)??false;
  const prepared=await prepareNativeWorldPreviewHost({assetDirectory:root,port:viewerPort});
  const nativeMenuLayouts=new Map();
  if(manifest.sources?.some(s=>s.name==='FarmersDelight-1.21.1-1.3.4.jar'&&s.sha256==='139ad7696462c89c03eea463f805abffa552526c5dadaadae221dd9624cb197c'&&!s.explicitOverride))
    nativeMenuLayouts.set('farmersdelight:cooking_pot',{proxyType:'minecraft:generic_9x1',slots:45,inventoryStart:9});
  if(twilightComponents)nativeMenuLayouts.set('twilightforest:uncrafting',{proxyType:'twilightforest:uncrafting',slots:56,inventoryStart:20});
  return {attach(bot){
    if(bot.version&&bot.version!=='1.21.1')throw Error('NATIVE_CONNECTION_VERSION_MISMATCH');
    const stream=observeNativeGateway(bot,{registrySha256:prepared.registrySha256,items,nativeMenuLayouts,simplifyNBT:nbt.simplify,twilightComponents,blockRegistry});
    const detachTwilight=twilightComponents?observeTwilightWindow(bot,stream):()=>{};
    const twilightRegistry=twilightComponents?observeTwilightRegistry(bot,{simplifyNBT:nbt.simplify}):null;
    const detachAliases=observeNativeItemAliases(bot,stream);
    const hands=observeVanillaHands(bot);
    const presentation=()=>{
      const original=stream.presentation(),hand=hands.snapshot();
      const value=original&&twilightRegistry?{...original,twilightTravellerRegistry:twilightRegistry.snapshot(bot._client.uuid)}:original;
      // The compatibility registry cannot identify arbitrary mod potion IDs.
      // Reuse observed arm packets only while no such effect can alter timing.
      if(!value||!hand||Object.keys(bot.entity?.effects??{}).length)return value;
      return {...value,self:{...value.self,usingItem:hand.usingItem,crouching:hand.crouching,spinAttack:hand.spinAttack,
        swinging:!!hand.swing,attackAnim:hand.swing?Math.max(0,Math.min(1,(hand.sampledAt-hand.swing.startedAt)/(hand.swing.durationTicks*50))):0,
        handAnimation:hand}};
    };
    const host=prepared.attach({bot,nativeStream:stream,simplifyNBT:nbt.simplify,expectedUsername:bot.username||bot._client.username,getPresentationState:presentation});
    let closed=false;
    const base=()=>({schemaVersion:1,playerUuid:bot._client.uuid??null,observedAt:new Date().toISOString(),dimension:host.world.dimension?.name??null,
      registrySha256:prepared.registrySha256,source:'same_connection_original_before_projection',epoch:host.world.epoch});
    return {host,stream,
      async listen(){if(viewerPort<=0)return null;return host.listen();},
      get url(){return host.url;},
      query(input={}){
        const action=input.action??'status',world=host.world,health=stream.health(),envelope=base();
        if(!['status','block','entities','inventory'].includes(action))return {...envelope,available:false,reason:'NATIVE_QUERY_ACTION_INVALID'};
        if(closed||health.closed)return {...envelope,available:false,reason:'NATIVE_CONNECTION_CLOSED'};
        if(!health.available||world.error)return {...envelope,available:false,reason:world.error||health.error||'NATIVE_STREAM_WAITING'};
        if(action==='status')return {...envelope,available:true,packets:health.packets,registryCounts:health.registryCounts,loadedColumns:world.columns.size,actions:['status','block','entities','inventory'],
          projection:{ordinaryMineflayerBlocks:'compatibility_ids',nativeQueries:'original_ids',pathfinderNativeGeometry:false},renderParityVerified:false};
        if(action==='inventory')return {...envelope,...stream.inventory()};
        if(!bot.entity?.position)return {...envelope,available:false,reason:'NATIVE_BODY_UNAVAILABLE'};
        const eye={...bot.entity.position,y:bot.entity.position.y+(bot.entity.eyeHeight??1.62)},distance=p=>Math.hypot(p.x-eye.x,p.y-eye.y,p.z-eye.z);
        if(action==='block'){
          const at=input.position;if(!finite(at)||distance(at)>16)return {...envelope,available:false,reason:'NATIVE_BLOCK_POSITION_OR_RANGE_INVALID'};
          const id=world.stateIdAt(at),state=world.states.get(id);if(!state)return {...envelope,available:false,reason:'NATIVE_BLOCK_NOT_LOADED',position:at};
          if(!nativeVisible(world,eye,{x:at.x+.5,y:at.y+.5,z:at.z+.5}))return {...envelope,available:false,reason:'NATIVE_BLOCK_NOT_VISIBLE',position:at};
          const shape=physics.states.get(id);
          return {...envelope,available:true,position:{...at},nativeStateId:id,nativeId:state.name,properties:{...state.properties},air:AIR.has(state.name),
            hasBlockEntity:state.hasBlockEntity,occlusionBoxes:state.occlusionBoxes,collision:shape?{available:true,source:physics.source,
              playerContextVerified:false,positionDependent:!!(state.dynamicShape||state.hasOffsetFunction),boxes:shape.collisionBoxes,hardness:shape.hardness,friction:shape.friction,
              canBreakWithHand:shape.canBreakWithHand}:{available:false,reason:physics.reason||'NATIVE_COLLISION_STATE_NOT_PROVIDED'}};
        }
        const snapshot=world.entitySnapshot(),rows=snapshot.available?snapshot.entities:[];
        return {...envelope,available:snapshot.available,reason:snapshot.reason??null,entities:rows.filter(e=>distance(e.position)<=16&&nativeVisible(world,eye,e.position)).slice(0,64).map(e=>({
          nativeId:e.name,entityId:e.entityId,uuid:e.uuid,position:{...e.position},metadata:e.metadata,equipment:e.equipment})),scope:'visible_tracked_entities_within_16_blocks'};
      },
      async close(){if(closed)return;closed=true;detachTwilight();twilightRegistry?.dispose();detachAliases();hands.close();await host.close();stream.close();}
    };
  }};
}
