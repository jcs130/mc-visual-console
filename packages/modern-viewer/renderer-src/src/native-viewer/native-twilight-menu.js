import {parseNativeItemStack} from './native-item-stack.js'
export const NATIVE_TWILIGHT_GUI=Object.freeze({
  clientJarSha256:'499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99',
  sourceName:'twilightforest-1.21.1-4.8.3345-universal.jar',
  sourceSha256:'493da16d10210f9f53a3c33b3d8fcb4ae9b14016ee420d753c894562bd9aba35',
  path:'assets/twilightforest/textures/gui/guigoblintinkering.png',
  sha256:'afecbfd012e24acd361625d32ee0f4f8db975640e267ea68727df12975ec3773',bytes:953,width:176,height:166
})
// Pinned UncraftingMenu's 56 REAL slots. Slots 2..10 are server-provided
// uncrafting previews at x=300000, rendered by UncraftingScreen behind 11..19.
// They must not appear as nine ordinary inventory items or inferred rewards.
export function nativeTwilightMenuLayout(menu,expectedUuid){
  if(typeof expectedUuid!=='string'||!/^[a-f0-9-]{36}$/i.test(expectedUuid)||menu?.playerUuid?.toLowerCase()!==expectedUuid.toLowerCase())throw Error('NATIVE_TWILIGHT_MENU_IDENTITY_MISMATCH')
  if(menu.menuType!=='twilightforest:uncrafting'||!Number.isSafeInteger(menu.windowId)||menu.windowId<1||!Number.isSafeInteger(menu.stateId)||menu.stateId<0||menu.slots?.length!==56||menu.slots.some((row,i)=>row.slot!==i||!Object.hasOwn(row,'item')))throw Error('NATIVE_TWILIGHT_MENU_LAYOUT_INVALID')
  const slots=[],ghosts=[]
  for(const row of menu.slots){
    const id=row.slot
    if(id>=2&&id<11){
      const custom=row.item?parseNativeItemStack(row.item).components['minecraft:custom_data']:null
      ghosts.push({row,x:62+(id-2)%3*18,y:17+Math.floor((id-2)/3)*18,marked:custom!==null&&typeof custom==='object'&&Object.hasOwn(custom,'TwilightForestMarker')});continue
    }
    const [x,y,role]=id===0?[13,35,'input']:id===1?[147,35,'result']:id<20?[62+(id-11)%3*18,17+Math.floor((id-11)/3)*18,'material']:id<47?[8+(id-20)%9*18,84+Math.floor((id-20)/9)*18,'inventory']:[8+(id-47)*18,142,'inventory']
    slots.push({row,x,y,role})
  }
  return {info:NATIVE_TWILIGHT_GUI,width:176,height:166,slots,ghosts,
    costs:{available:false,reason:'NATIVE_TWILIGHT_EXPERIENCE_COST_NOT_SENT_BY_MENU'},
    buttons:[{operation:0,x:40,y:22,u:176,v:0},{operation:1,x:40,y:55,u:176,v:9},{operation:4,x:121,y:22,u:176,v:0},{operation:5,x:121,y:55,u:176,v:9}]}
}
