import { createNativeRtcStream } from './native-rtc-stream.js'

/** Reconnect only passive world reads. Every retry uses the same authenticated
 * status/events routes; no game command, input or action can be replayed here.
 * EventSource retries CONNECTING itself, but stops permanently after e.g. a
 * temporary 404 while an observation source is being replaced. */
function createNativeSseStream({url,statusUrl,onMessage,onUnavailable,
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

/** SSE remains immediately available during the optional WebRTC negotiation.
 * Commit the switch only on a fresh identity from the authorized RTC stream.
 * A failed connection falls back once, on the same read-only URL; no inventory
 * action, held key, skill, or command is ever sent or replayed by this module. */
export function createNativeEventStream(options = {}) {
  const { rtcUrl, onTransport = () => {}, RTCPeerConnection: Peer = globalThis.RTCPeerConnection } = options
  if (!rtcUrl || typeof Peer !== 'function') {
    onTransport({ transport: 'sse', phase: 'legacy', readOnly: true })
    return createNativeSseStream(options)
  }
  let sse = null, rtc = null, closed = false, active = 'sse'
  function sseStart() {
    sse = createNativeSseStream({ ...options,
      onMessage: message => { if (!closed && active === 'sse') options.onMessage(message) },
      onUnavailable: reason => {
        if (closed || active !== 'sse') return
        if (reason === 'NATIVE_WORLD_STREAM_UNAUTHORIZED') close()
        options.onUnavailable(reason)
      } })
  }
  function close() { if (closed) return; closed = true; sse?.close(); rtc?.close() }
  sseStart()
  onTransport({ transport: 'sse', phase: 'negotiating', readOnly: true })
  rtc = createNativeRtcStream({ url: rtcUrl, RTCPeerConnection: Peer, fetch: options.fetch,
    setTimer: options.setTimer, clearTimer: options.clearTimer,
    onMessage: message => {
      if (closed) return
      if (active !== 'webrtc') {
        active = 'webrtc'; sse?.close(); sse = null
        onTransport({ transport: 'webrtc', phase: 'connected', readOnly: true })
      }
      options.onMessage(message)
    },
    onFailure: reason => {
      if (closed) return
      if (reason === 'NATIVE_WORLD_STREAM_UNAUTHORIZED') { close(); options.onUnavailable(reason); return }
      const wasRtc = active === 'webrtc'; active = 'sse'
      onTransport({ transport: 'sse', phase: 'fallback', reason, readOnly: true })
      if (wasRtc) { options.onUnavailable('NATIVE_WORLD_STREAM_DISCONNECTED'); if (!closed) sseStart() }
    } })
  return { close, get readyState() { return closed ? 2 : active === 'webrtc' ? rtc?.readyState ?? 0 : sse?.readyState ?? 0 } }
}
