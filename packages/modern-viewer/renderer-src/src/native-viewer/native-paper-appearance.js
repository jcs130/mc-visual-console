import * as THREE from 'three'
import { loadSkinToCanvas } from 'skinview-utils'
import { createPaperYsmActor } from '../modern-viewer/paper-ysm.js'
import { bundledYsmMotionInput } from './native-bundled-ysm-motion.js'
import { BundledYsmHeldItems } from './native-bundled-ysm-items.js'
import { NativeHeldItems } from './native-held-items.js'
import { bundledYsmFirstPersonArmMatrix } from './native-bundled-ysm-first-person.js'
import { nativeViewerUrl } from './native-url.js'
import { createNativeBedrockModel } from './native-entity-model-bedrock.js'
import { supportedYsmBundleVersion } from '../modern-viewer/ysm-profile.js'

const SHA=/^[a-f0-9]{64}$/
const bytes64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0))
const encode64=bytes=>{let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(text)}
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')
export function nativePaperAppearanceBinding(self,uuid){
  const row=self?.paperAppearance
  if(row?.schemaVersion!==1||row.source!=='paper_server_appearance'||row.available!==true||row.playerUuid!==uuid||row.entityId!==self.entityId||
    !['ysm','skin'].includes(row.kind)||!SHA.test(row.bundleSha256??'')||!Number.isInteger(row.bytes)||row.bytes<1||row.bytes>8*1024*1024||typeof row.texture!=='string')throw Error('PAPER_APPEARANCE_IDENTITY_OR_ASSET_INVALID')
  return {kind:'paper-original',uuid,key:`paper:${uuid}:${self.entityId}:${row.bundleSha256}:${row.texture}`,paperAppearance:row}
}
export async function readPaperAppearance(row,{fetcher=fetch,resolveUrl=nativeViewerUrl}={}){
  const response=await fetcher(resolveUrl('api/server-appearance/assets/'+row.bundleSha256+'.json'),{cache:'no-store'})
  if(!response.ok)throw Error('PAPER_APPEARANCE_DOWNLOAD_FAILED')
  const parts=[];let size=0
  for await(const chunk of response.body){size+=chunk.length;if(size>row.bytes)throw Error('PAPER_APPEARANCE_SIZE_INVALID');parts.push(chunk)}
  const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length}
  if(size!==row.bytes||await hash(bytes)!==row.bundleSha256)throw Error('PAPER_APPEARANCE_HASH_MISMATCH')
  const bundle=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))
  if(row.kind==='ysm'){
    if(bundle.schemaVersion!==1||bundle.format!=='ysm-bedrock-original'||!supportedYsmBundleVersion(bundle.ysmVersion)||bundle.modelId!==row.modelId||bundle.assetSha256!==row.assetSha256||Object.keys(bundle.files??{}).length>32||!bundle.files?.['ysm.json']||!bundle.files?.[bundle.model]||!bundle.files?.[bundle.animation]||!bundle.files?.[bundle.textures?.[row.texture]])throw Error('PAPER_APPEARANCE_MODEL_INVALID')
    let total=0
    for(const [path,file]of Object.entries(bundle.files)){
      if(path.startsWith('/')||/[:\\]/.test(path)||path.split('/').includes('..')||typeof file.base64!=='string'||file.base64.length>12*1024*1024)throw Error('PAPER_APPEARANCE_FILE_INVALID')
      const data=bytes64(file.base64);total+=data.length
      if(total>8*1024*1024||data.length!==file.bytes||await hash(data)!==file.sha256)throw Error('PAPER_APPEARANCE_FILE_HASH_MISMATCH')
    }
  }else{
    const skin=bundle.skin
    if(bundle.schemaVersion!==1||bundle.format!=='minecraft-skin-original'||skin?.model!==row.texture||skin.width!==64||![32,64].includes(skin.height)||typeof skin.base64!=='string'||skin.base64.length>1024*1024||await hash(bytes64(skin.base64))!==skin.sha256)throw Error('PAPER_APPEARANCE_SKIN_INVALID')
  }
  return bundle
}
async function loadOriginalTexture(input){
  const encoded=typeof input==='string'?input.slice('data:image/png;base64,'.length):input.base64
  const blob=new Blob([bytes64(encoded)],{type:'image/png'})
  if(typeof input!=='string'){
    const image=await createImageBitmap(blob),canvas=document.createElement('canvas')
    try{loadSkinToCanvas(canvas,image);return new THREE.CanvasTexture(canvas)}finally{image.close()}
  }
  const url=URL.createObjectURL(blob)
  try{return await new THREE.TextureLoader().loadAsync(url)}finally{URL.revokeObjectURL(url)}
}
// Preserve both authored arm subtrees (including sleeves and item locators).
// This is separate from the asset-specific eight-bone YUI contract.
function originalArmMounts(definition,material){
  const bones=definition?.['minecraft:geometry']?.[0]?.bones
  if(!Array.isArray(bones)||!['LeftArm','RightArm'].every(name=>bones.some(b=>b.name===name&&!b.parent)))throw Error('PAPER_FIRST_PERSON_ARM_RIG_UNSUPPORTED')
  const names=new Map(bones.map(b=>[b.name,b]))
  for(const bone of bones){let b=bone,n=0;while(b?.parent&&n++<bones.length)b=names.get(b.parent);if(!b||n>=bones.length||!['LeftArm','RightArm'].includes(b.name))throw Error('PAPER_FIRST_PERSON_ARM_RIG_UNSUPPORTED')}
  const model=createNativeBedrockModel(definition,material),mounts=new Map()
  for(const [arm,name]of [['left','LeftArm'],['right','RightArm']]){const mount=new THREE.Group();mount.matrixAutoUpdate=false;mount.add(model.bones.get(name));mounts.set(arm,mount)}
  return {model,mounts,dispose(){for(const m of mounts.values()){m.removeFromParent();m.clear()}model.dispose()}}
}
function unavailableFirstPerson(reason){
  const root=new THREE.Group();root.visible=false
  const state=()=>({available:false,reason})
  return {firstPersonRoot:root,apply:state,frame:state,firstPersonState:state,applyHandAnimation:state,setFirstPersonViewport:state,
    dispose(){root.removeFromParent();root.clear()}}
}
// Original server-selected assets, independent of the strict built-in native
// integration. The outer world anchor cannot be reset by a local sleep pose.
export async function createNativePaperAppearanceActor(reader,{uuid,paperAppearance:row,readBundle=readPaperAppearance,loadTexture=loadOriginalTexture,heldItemOptions={}}={}){
  const bundle=await readBundle(row),inner=await createPaperYsmActor(bundle,row.texture,{loadTexture})
  const root=new THREE.Group();root.name='native-server-original-player';root.visible=false;root.add(inner.root)
  // The inventory preview mirrors the verified world actor, including its
  // authored rig. Bind the wrapper too: UI identity checks must not fall back
  // to a generic player or reject an otherwise valid Paper-selected model.
  root.userData.playerUuid=uuid
  if(inner.playerObject)root.playerObject=inner.playerObject
  let held,first,arms,disposed=false,motion,firstPersonArmReason=null
  const pngTexture=async bytes=>loadTexture('data:image/png;base64,'+encode64(bytes))
  try{
    if(row.kind==='ysm'){
      held=new BundledYsmHeldItems(reader,inner.model,uuid,pngTexture,heldItemOptions)
      const definition=JSON.parse(new TextDecoder().decode(bytes64(bundle.files['ysm.json'].base64))),armPath=definition.files?.player?.model?.arm
      if(armPath&&bundle.files[armPath]){
        let material;inner.model.root.traverse(p=>{if(!material&&p.isMesh)material=p.material})
        if(material){
          try{arms=originalArmMounts(JSON.parse(new TextDecoder().decode(bytes64(bundle.files[armPath].base64))),material)}
          catch(error){
            // Some valid authors use a custom first-person arm hierarchy. Its
            // unsupported camera mount must not hide the independent world rig.
            // Keep the original bytes; report unavailable arms instead of
            // substituting a different character or swallowing corrupt assets.
            if(error.message!=='PAPER_FIRST_PERSON_ARM_RIG_UNSUPPORTED')throw error
            firstPersonArmReason=error.message
          }
        }
      }
      first=arms?new NativeHeldItems(reader,{...heldItemOptions,uuid,firstPersonOnly:true,firstPersonArms:arms.mounts,emptyArmMatrix:bundledYsmFirstPersonArmMatrix,loadHeldTexture:pngTexture}):
        unavailableFirstPerson(firstPersonArmReason??'PAPER_FIRST_PERSON_ARM_SOURCE_MISSING')
    }else{
      first=new NativeHeldItems(reader,{...heldItemOptions,uuid,playerObject:inner.playerObject,slim:row.texture==='slim',loadHeldTexture:pngTexture})
    }
    const assetInfo={...inner.assetInfo,kind:row.kind,uuid,source:'paper_server_appearance',selectionSource:'server_uuid_binding',authority:row.authority,
      bundleSha256:row.bundleSha256,modelId:row.modelId,texture:row.texture,ysmVersion:row.ysmVersion??null,
      inventoryPreviewAvailable:true,equipmentRenderingAvailable:false,
      firstPersonArmsAvailable:row.kind==='skin'||!!arms,
      firstPersonArmReason:row.kind==='ysm'&&!arms?(firstPersonArmReason??'PAPER_FIRST_PERSON_ARM_SOURCE_MISSING'):null,
      notice:row.kind==='ysm'?'服务器原 YSM 模型与实际动作；完整客户端动画一致性未验':'服务器绑定的原皮肤；当前未提供 YSM 模型状态'}
    return {root,assetInfo,model:inner.model,playerObject:inner.playerObject,firstPersonRoot:first.firstPersonRoot,
      applyPose(pose){if(disposed)throw Error('PAPER_APPEARANCE_DISPOSED');root.position.set(pose.x,pose.y,pose.z);root.rotation.y=Number.isFinite(pose.bodyYaw)?pose.bodyYaw:pose.yaw;root.visible=true},
      applyMotion(input){
        try{const m=bundledYsmMotionInput(input.current,uuid,input.now);inner.animate({motion:m,pitch:input.current.pose.pitch,renderedYaw:m.bodyYaw},input.now);root.rotation.y=m.bodyYaw;
          motion={source:'paper_server_observation',...inner.animationState,clip:inner.animationState?.base,locomotionSource:m.locomotionSource,
            available:!(inner.animationState?.errors?.length),reason:inner.animationState?.errors?.[0]??null}}
        catch(error){motion={available:false,reason:error.message}}
        first.frame(input.now);return motion
      },
      applyHeldItems(frame){first.apply(frame);return held?.apply(frame)??first.state()},heldItemsState:()=>held?.state()??first.state(),
      firstPersonItemsState:()=>first.firstPersonState(),applyHandAnimation:value=>first.applyHandAnimation(value),setFirstPersonViewport:value=>first.setFirstPersonViewport(value),
      headAnchor:()=>inner.headAnchor?.(),setPresentation:policy=>inner.setPresentation?.(policy),
      dispose(){if(disposed)return;disposed=true;held?.dispose();first.dispose();arms?.dispose();inner.dispose();root.removeFromParent();root.clear()}}
  }catch(error){held?.dispose();first?.dispose();arms?.dispose();inner.dispose();throw error}
}
