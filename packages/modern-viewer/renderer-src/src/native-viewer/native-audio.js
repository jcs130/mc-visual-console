import {NativeSoundRandom,selectNativeSound} from './native-sound-selection.js'
import {nativeViewerUrl} from './native-url.js'
import {createNativeActionSounds} from './native-action-sounds.js'

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),finite=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]))
const name=value=>typeof value==='string'?value.replace(/^minecraft:/,''):''
const hash=async(kind,bytes)=>[...new Uint8Array(await crypto.subtle.digest(kind,bytes))].map(v=>v.toString(16).padStart(2,'0')).join('')
export function createNativeAudio({fetchData=globalThis.fetch,contextFactory=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)(),mediaFactory=()=>new Audio(),onChange=()=>{},storage=undefined,schedule=setTimeout,cancelSchedule=clearTimeout}={}) {
  let metadata=null,context=null,master=null,connected=false,disposed=false,generation=0,error=null
  const buffers=new Map(),sources=new Set(),pending=new Set(),seen=new Set(),volumes={master:.45,effects:.8,music:.25,records:1,weather:.75,blocks:1,hostile:1,neutral:1,players:1,ambient:.85,voice:1}
  let effects=false,music=false,bufferBytes=0,started=0,failed=0,missing=0,serial=0,musicTimer=null,musicLoading=false,nextMusicAt=null,lastFailure=null
  const byCategory={}
  const recentServer=new Map()
  const actionSounds=createNativeActionSounds({play:value=>{
    const recent=recentServer.get(value.name)
    if(recent&&Date.now()-recent.at<400&&(!finite(value.position)||finite(recent.position)&&Math.hypot(...['x','y','z'].map(k=>value.position[k]-recent.position[k]))<2))return
    void play(value)
  }})
  // Preferences are local to this viewer origin; a saved enable never bypasses
  // the browser's gesture requirement or creates an AudioContext on page load.
  try {
    storage??=globalThis.localStorage
    const saved=JSON.parse(storage?.getItem('mc-viewer-native-audio')??'null')
    if(saved?.version===1){effects=saved.effects===true;music=saved.music===true
      for(const key of Object.keys(volumes))if(Number.isFinite(saved.volumes?.[key]))volumes[key]=clamp(saved.volumes[key],0,1)
    }
  }catch{/* Unavailable storage keeps this session usable. */}
  const remember=()=>{try{storage?.setItem('mc-viewer-native-audio',JSON.stringify({version:1,effects,music,volumes}))}catch{}}
  const clearMusicTimer=()=>{if(musicTimer!==null)cancelSchedule(musicTimer);musicTimer=null;nextMusicAt=null}
  const canMusic=()=>!disposed&&connected&&music&&metadata?.available&&context?.state==='running'&&volumes.master>0&&volumes.music>0
  const queueMusic=(delay=0)=>{
    if(!canMusic()||musicTimer!==null||musicLoading||[...sources].some(row=>['music','records'].includes(row.category)))return
    nextMusicAt=Date.now()+delay
    musicTimer=schedule(()=>{musicTimer=null;nextMusicAt=null;void startPlaylist()},delay)
    changed()
  }
  const state=()=>({available:metadata?.available===true,reason:metadata?.reason??error,soundEnabled:effects,musicEnabled:music,
    unlocked:context?.state==='running',connected,started,failed,missing,lastFailure,byCategory:{...byCategory},nextMusicAt,
    musicPlaying:[...sources].some(row=>row.category==='music'),active:sources.size,volumes:{...volumes},completeAudioParityVerified:false})
  const changed=()=>onChange(state())
  const retire=row=>{if(!sources.delete(row))return;try{row.media?row.media.pause():row.source.stop()}catch{};row.source.disconnect();row.gain.disconnect();row.panner?.disconnect();if(row.objectUrl)URL.revokeObjectURL(row.objectUrl)}
  const retireMatching=matches=>{for(const row of pending)if(matches(row))row.cancelled=true;for(const row of [...sources])if(matches(row))retire(row)}
  const stop=filter=>{if(!filter?.category||['music','records'].includes(filter.category))clearMusicTimer();retireMatching(row=>(!filter?.name||row.name===name(filter.name))&&(!filter?.category||row.category===filter.category));changed()}
  async function unlock(){
    if(disposed)return false
    try {if(!context){context=contextFactory();master=context.createGain();master.connect(context.destination)}
      await context.resume();master.gain.value=volumes.master;error=null;changed();return context.state==='running'
    }catch{error='NATIVE_BROWSER_AUDIO_UNAVAILABLE';changed();return false}
  }
  async function originalBytes(file){
    const info=metadata.files[file];if(!info)throw Error('NATIVE_AUDIO_VARIANT_NOT_EXPORTED')
    const response=await fetchData(nativeViewerUrl('sounds/'+file));if(!response.ok)throw Error('NATIVE_AUDIO_FILE_UNAVAILABLE')
    const bytes=await response.arrayBuffer()
    if(bytes.byteLength!==info.bytes||await hash('SHA-256',bytes)!==info.sha256||await hash('SHA-1',bytes)!==info.sha1)throw Error('NATIVE_AUDIO_FILE_INTEGRITY_MISMATCH')
    return bytes
  }
  const pruneBuffers=file=>{while(buffers.size>32||bufferBytes>64*1024*1024){const key=buffers.keys().next().value;if(key===file)break;bufferBytes-=buffers.get(key).bytes;buffers.delete(key)}}
  async function buffer(file,stream){
    const info=metadata.files[file];if(!info)throw Error('NATIVE_AUDIO_VARIANT_NOT_EXPORTED')
    // Original streamed tracks stay compressed. Do not expand a many-minute
    // OGG into a full PCM AudioBuffer just to play spectator music.
    if(stream)return new Blob([await originalBytes(file)],{type:'audio/ogg'})
    if(buffers.has(file))return buffers.get(file).promise
    const row={bytes:info.bytes,promise:null};bufferBytes+=info.bytes
    row.promise=(async()=>{
      const decoded=await context.decodeAudioData((await originalBytes(file)).slice(0))
      const size=decoded.length*decoded.numberOfChannels*4
      if(Number.isFinite(size)){
        if(size>64*1024*1024)throw Error('NATIVE_AUDIO_DECODE_BUDGET_EXCEEDED')
        if(buffers.get(file)===row){bufferBytes+=size-row.bytes;row.bytes=size;pruneBuffers(file)}
      }
      return decoded
    })()
    buffers.set(file,row)
    pruneBuffers(file)
    try{return await row.promise}catch(error){if(buffers.get(file)===row){buffers.delete(file);bufferBytes-=row.bytes}throw error}
  }
  const applyVolume=row=>{const group=['music','records'].includes(row.category)?volumes[row.category]:volumes.effects*(volumes[row.category]??1);row.gain.gain.value=clamp(row.volume*group,0,1)}
  async function play(value,{preview=false,playlist=false}={}) {
    const category=value.category??'neutral',isMusic=['music','records'].includes(category)
    if(disposed||!metadata?.available||context?.state!=='running'||(!preview&&(!connected||(isMusic?!music:!effects))))return false
    const run=generation,eventName=name(value.name),seed=value.seed??String((Date.now()+ ++serial)|0)
    const ticket={name:eventName,category,cancelled:false};pending.add(ticket)
    try {
      const variant=selectNativeSound(metadata.definitions,eventName,new NativeSoundRandom(seed))
      if(!variant||!metadata.files[variant.file]){missing++;changed();return false}
      const decoded=await buffer(variant.file,variant.stream)
      if(ticket.cancelled||disposed||run!==generation||(!preview&&(!connected||(isMusic?!music:!effects)))||(!preview&&!playlist&&Number.isFinite(value.observedAt)&&Date.now()-value.observedAt>3000))return false
      while(sources.size>=48)retire(sources.values().next().value)
      if(variant.stream)for(const row of [...sources])if(row.media)retire(row)
      const media=variant.stream?mediaFactory():null,source=media?context.createMediaElementSource(media):context.createBufferSource(),gain=context.createGain(),row={source,gain,media,category,name:eventName,entityId:value.entityId,entityUuid:value.entityUuid,entitySpawnedAt:value.entitySpawnedAt,
        volume:value.volume*variant.volume,position:value.position,playlist,origin:preview?'browser_original_sound_preview':playlist?'viewer_selected_original_playlist':'received_or_original_client_rule'}
      const pitch=clamp(value.pitch*variant.pitch,.5,2)
      if(media){row.objectUrl=URL.createObjectURL(decoded);media.src=row.objectUrl;media.playbackRate=pitch;media.preservesPitch=false}
      else{source.buffer=decoded;source.playbackRate.value=pitch}
      source.connect(gain);applyVolume(row)
      if(!isMusic&&finite(value.position)){
        row.panner=context.createPanner();row.panner.panningModel='HRTF';row.panner.distanceModel='linear';row.panner.refDistance=0
        // SoundEvent.fixedRange controls the server audience, not the client's
        // sound engine attenuation. gvc uses the selected Sound's distance.
        row.panner.maxDistance=Math.max(row.volume,1)*variant.attenuationDistance;row.panner.rolloffFactor=1
        row.panner.setPosition(value.position.x,value.position.y,value.position.z);gain.connect(row.panner);row.panner.connect(master)
      }else gain.connect(master)
      const ended=()=>{if(!sources.has(row))return;retire(row);if(row.playlist||row.category==='records')queueMusic(2000+Math.floor(Math.random()*6000));changed()};sources.add(row)
      if(media){media.onended=ended;try{await media.play()}catch(error){retire(row);throw error}}
      else{source.onended=ended;source.start()}
      if(ticket.cancelled||run!==generation){retire(row);return false}started++;byCategory[category]=(byCategory[category]??0)+1;changed();return true
    }catch(e){failed++;error=/^NATIVE_/.test(e.message)?e.message:'NATIVE_AUDIO_DECODE_FAILED';lastFailure={name:eventName,category,reason:error,cause:String(e.name??'Error'),detail:String(e.message??'').slice(0,180)};changed();return false}
    finally{pending.delete(ticket)}
  }
  async function startPlaylist(){
    if(!canMusic()||musicLoading)return false
    musicLoading=true;clearMusicTimer()
    let played=false
    try{played=await play({name:'music.game',category:'music',volume:1,pitch:1,seed:String(Date.now())},{playlist:true});return played}
    finally{musicLoading=false;if(!played)queueMusic(30000)}
  }
  const unique=value=>{const key=`${value.epoch}:${value.sequence}`;if(seen.has(key))return false;seen.add(key);if(seen.size>256)seen.delete(seen.values().next().value);return true}
  const api={state,
    async load(){try{const r=await fetchData(nativeViewerUrl('sound-manifest.json'));if(!r.ok)throw Error('NATIVE_AUDIO_ORIGINAL_PACK_MISSING');metadata=await r.json()
      if(metadata.available===true&&(metadata.minecraftVersion!=='1.21.1'||metadata.source!=='verified_original_launcher_assets'||!metadata.definitions||!metadata.files))throw Error('NATIVE_AUDIO_MANIFEST_INVALID')
    }catch(e){metadata={available:false,reason:e.message}}changed();return state()},
    async activate(){if(!await unlock())return false;queueMusic();return true},
    async toggle(kind){if(!['effects','music'].includes(kind))return false;const locked=context?.state!=='running',selected=kind==='effects'?effects:music;if(!await unlock())return false
      if(locked&&selected){queueMusic();return true}
      if(kind==='effects'){effects=!effects;if(!effects)retireMatching(row=>!['music','records'].includes(row.category))}
      else {music=!music;if(!music){clearMusicTimer();retireMatching(row=>['music','records'].includes(row.category))}}
      remember();queueMusic();changed();return kind==='effects'?effects:music},
    setVolume(category,value){if(!Object.hasOwn(volumes,category)||!Number.isFinite(value))return false;volumes[category]=clamp(value,0,1);if(master)master.gain.value=volumes.master;for(const row of sources)applyVolume(row);remember();queueMusic();changed();return true},
    async preview(){if(await unlock())return play({name:'ui.button.click',category:'players',volume:.25,pitch:1,seed:'0'},{preview:true});return false},
    async playlist(){if(!await unlock())return false;music=true;remember();clearMusicTimer();retireMatching(row=>row.category==='music')
      changed();return startPlaylist()},
    event(message){if(!connected||!unique(message))return;if(message.effect.kind==='sound_stop')stop(message.effect.value)
      else if(message.effect.kind==='sound'){const value=message.effect.value;recentServer.set(name(value.name),{at:Date.now(),position:value.position});if(recentServer.size>128)recentServer.delete(recentServer.keys().next().value);void play({...value,observedAt:message.observedAt})}},
    observation(snapshot){actionSounds.observe(snapshot,metadata?.blocks)},
    collect(message){if(!connected||!unique(message))return;const orb=message.entity?.name==='minecraft:experience_orb';if(!orb&&message.entity?.name!=='minecraft:item')return
      const random=new NativeSoundRandom(Date.now()+ ++serial),f=()=>random.next(24)/16777216
      void play({name:orb?'entity.experience_orb.pickup':'entity.item.pickup',category:'players',position:message.entity.position,volume:orb?.1:.2,
        pitch:orb?.9+(f()-f())*.35:2+(f()-f())*1.4,seed:String(Date.now()),observedAt:message.observedAt})},
    connect(value){if(connected===value)return;connected=value;if(!value){generation++;seen.clear();recentServer.clear();actionSounds.reset();stop()}else queueMusic();changed()},
    frame(camera,entities,self){if(!context||context.state!=='running'||!camera)return
      // Match the action player's ears. A 2.5D camera is often >16 blocks away,
      // which otherwise attenuates the player's own actions to silence.
      const p=finite(self?.position)?self.position:camera.position,l=context.listener;l.setPosition(p.x,p.y+(Number.isFinite(self?.eyeHeight)?self.eyeHeight:0),p.z)
      const e=camera.matrixWorld.elements;l.setOrientation(-e[8],-e[9],-e[10],e[4],e[5],e[6])
      for(const row of [...sources])if(Number.isSafeInteger(row.entityId)){
        const e=row.entityId===self?.entityId?self:entities?.get(row.entityId),p=e?.position
        if(!finite(p)||(row.entityUuid&&row.entityUuid!==e.uuid)||(Number.isFinite(row.entitySpawnedAt)&&row.entitySpawnedAt!==e.spawnedAt)){retire(row);continue}row.panner?.setPosition(p.x,p.y,p.z)
      }
    },
    dispose(){if(disposed)return;disposed=true;generation++;clearMusicTimer();stop();buffers.clear();bufferBytes=0;master?.disconnect();void context?.close();metadata=null},
  }
  return api
}
