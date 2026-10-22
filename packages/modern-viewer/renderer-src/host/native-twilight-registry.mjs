import {createHash} from 'node:crypto'

export const TWILIGHT_TRAVELLER_REGISTRY='twilight:travellers_modifiers'
const RESOURCE=/^[a-z0-9_.-]+:[a-z0-9_./-]+$/
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

// Gate forwards these configuration entries unchanged. Observe the same action
// connection, including its actual datapack overrides and registry order.
// Never infer modifiers from a second player or a local default datapack.
export function observeTwilightRegistry(bot,{simplifyNBT,now=Date.now}={}){
  let state=null,disposed=false
  const receive=packet=>{
    if(disposed||packet?.id!==TWILIGHT_TRAVELLER_REGISTRY)return
    try{
      if(!Array.isArray(packet.entries)||packet.entries.length>256||typeof simplifyNBT!=='function')throw Error('NATIVE_TWILIGHT_REGISTRY_BUDGET_OR_DECODER')
      const seen=new Set(),entries=packet.entries.map((row,id)=>{
        if(!RESOURCE.test(row?.key??'')||seen.has(row.key)||row.value==null)throw Error('NATIVE_TWILIGHT_REGISTRY_ENTRY_UNAVAILABLE')
        seen.add(row.key);const value=simplifyNBT(row.value)
        if(!value||typeof value!=='object'||Array.isArray(value)||!RESOURCE.test(value.type??''))throw Error('NATIVE_TWILIGHT_REGISTRY_ENTRY_INVALID')
        return {id,key:row.key,value}
      })
      const json=JSON.stringify(entries)
      if(Buffer.byteLength(json)>262144)throw Error('NATIVE_TWILIGHT_REGISTRY_BUDGET_OR_DECODER')
      state={available:true,registry:packet.id,source:'same_connection_configuration_registry_data',observedAt:now(),
        sha256:createHash('sha256').update(json).digest('hex'),entries:JSON.parse(json)}
    }catch(error){state={available:false,registry:packet.id,source:'same_connection_configuration_registry_data',observedAt:now(),reason:error.message}}
  }
  const reset=()=>{state=null}
  bot._client.on('registry_data',receive);bot._client.on('start_configuration',reset);bot.on('end',reset)
  return {snapshot(playerUuid){return !disposed&&UUID.test(playerUuid??'')&&state?structuredClone({...state,playerUuid}):null},
    dispose(){if(disposed)return;disposed=true;state=null;bot._client.off('registry_data',receive);bot._client.off('start_configuration',reset);bot.off('end',reset)}}
}
