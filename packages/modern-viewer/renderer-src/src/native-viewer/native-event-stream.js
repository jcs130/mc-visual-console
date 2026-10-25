/** Reconnect only passive world reads. Every retry uses the same authenticated
 * status/events routes; no game command, input or action can be replayed here.
 * EventSource retries CONNECTING itself, but stops permanently after e.g. a
 * temporary 404 while an observation source is being replaced. */
export function createNativeEventStream({url,statusUrl,onMessage,onUnavailable,
  EventSource:Source=globalThis.EventSource,fetch:fetcher=globalThis.fetch,
  setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id)}={}) {
  if(typeof Source!=='function'||typeof fetcher!=='function'||typeof url!=='string'||typeof statusUrl!=='string'
    ||typeof onMessage!=='function'||typeof onUnavailable!=='function')throw Error('NATIVE_EVENT_STREAM_OPTIONS')
  let source=null,closed=false,retryTimer=null,controller=null,timeoutTimer=null,attempts=0
  function disconnectSource(){
    if(!source)return
    source.onmessage=null;source.onerror=null;source.close();source=null
  }
  function close(){
    if(closed)return
    closed=true
    if(retryTimer!==null)clearTimer(retryTimer)
    if(timeoutTimer!==null)clearTimer(timeoutTimer)
    retryTimer=timeoutTimer=null;controller?.abort();controller=null;disconnectSource()
  }
  function retry(){
    if(closed||retryTimer!==null||controller)return
    const delay=Math.min(1000*2**Math.min(attempts++,4),10000)
    retryTimer=setTimer(()=>{retryTimer=null;void probe()},delay)
  }
  async function probe(){
    if(closed)return
    const request=new AbortController();controller=request
    timeoutTimer=setTimer(()=>request.abort(),6000)
    try{
      // Never rely on an old cached successful authorization. Snapshot identity,
      // registry, build and epoch are still validated by the receiving session.
      const response=await fetcher(statusUrl,{cache:'no-store',redirect:'error',signal:request.signal})
      void Promise.resolve(response.body?.cancel?.()).catch(()=>{})
      if(closed||controller!==request||request.signal.aborted)return
      if(response.status===401||response.status===403){close();onUnavailable('NATIVE_WORLD_STREAM_UNAUTHORIZED');return}
      if(!response.ok)return
      disconnectSource();connect()
    }catch{
      // Network/offline/not-yet-published sources remain unavailable. Retry only
      // this status read, at most once per ten seconds after bounded backoff.
    }finally{
      if(controller===request){
        if(timeoutTimer!==null)clearTimer(timeoutTimer)
        timeoutTimer=null;controller=null
        if(!closed&&(!source||source.readyState===2))retry()
      }
    }
  }
  function connect(){
    if(closed)return
    const current=new Source(url);source=current
    current.onmessage=event=>{if(closed||source!==current)return;attempts=0;onMessage(event)}
    current.onerror=()=>{
      if(closed||source!==current)return
      onUnavailable('NATIVE_WORLD_STREAM_DISCONNECTED')
      if(!closed&&current.readyState===2)retry()
    }
  }
  connect()
  return {close,get readyState(){return closed?2:source?.readyState??0}}
}
