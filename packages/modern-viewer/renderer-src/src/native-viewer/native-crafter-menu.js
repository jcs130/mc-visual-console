// Locked 1.21.1 CrafterMenu cqj / CrafterScreen fpf. The result is slot 45,
// AFTER the player's 36 slots. It is a preview, not an extra input slot.
const CLIENT='499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99'
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const NATIVE_CRAFTER_GUI=Object.freeze({clientJarSha256:CLIENT,
  path:'assets/minecraft/textures/gui/container/crafter.png',
  sha256:'bce2e1f2e197c29606ecd2cbdfebc6c5d6835f5a7843cb8b174637d18dbf9932',bytes:991,width:176,height:166,
  disabled:Object.freeze({path:'assets/minecraft/textures/gui/sprites/container/crafter/disabled_slot.png',
    sha256:'eef09c4de04fedfcbdb928202ad1ba2f6dfc093b5474b384c11bc4d8b62d52ac',bytes:102,width:18,height:18}),
  powered:Object.freeze({path:'assets/minecraft/textures/gui/sprites/container/crafter/powered_redstone.png',
    sha256:'4f05cb40d15fb3c8332d606a34d04589e3e28c56f511d4397776cdc199214fef',bytes:157,width:16,height:16}),
  unpowered:Object.freeze({path:'assets/minecraft/textures/gui/sprites/container/crafter/unpowered_redstone.png',
    sha256:'e5c5b952c1f66d8a9c30fe6b25be0e3e96081c5440ef93b800be1c1cb9fbdadf',bytes:158,width:16,height:16})})
function identity(menu,expectedUuid){
  if(!UUID.test(expectedUuid??'')||(menu?.playerUuid??'').toLowerCase()!==expectedUuid.toLowerCase())throw Error('NATIVE_CRAFTER_MENU_IDENTITY_MISMATCH')
  if(menu.menuType!=='minecraft:crafter_3x3'||!Number.isSafeInteger(menu.windowId)||menu.windowId<=0||
    !Number.isSafeInteger(menu.stateId)||menu.stateId<0)throw Error('NATIVE_CRAFTER_MENU_STATE_UNVERIFIED')
}
export function crafterMenuLayout(menu,expectedUuid,rows){
  identity(menu,expectedUuid)
  if(!Array.isArray(rows)||rows.length!==46||rows.some((row,i)=>row.slot!==i))throw Error('NATIVE_CRAFTER_MENU_SLOTS_UNVERIFIED')
  return {info:NATIVE_CRAFTER_GUI,width:176,height:166,
    blits:[{x:0,y:0,sourceX:0,sourceY:0,width:176,height:166}],slots:rows.map(row=>{
      const i=row.slot
      if(i<9)return {row,x:26+18*(i%3),y:17+18*Math.floor(i/3),role:'input'}
      if(i===45)return {row,x:134,y:35,role:'result'}
      if(i<36)return {row,x:8+18*((i-9)%9),y:84+18*Math.floor((i-9)/9),role:'inventory'}
      return {row,x:8+18*(i-36),y:142,role:'hotbar'}
    })}
}
export function nativeCrafterState(menu,expectedUuid){
  identity(menu,expectedUuid)
  const values=new Map()
  for(const row of Array.isArray(menu.properties)?menu.properties:[]){
    if(!Number.isInteger(row?.id)||row.id<0||row.id>9)continue
    if(values.has(row.id)||!Number.isInteger(row.value)||![0,1].includes(row.value))return {available:false,reason:'NATIVE_CRAFTER_DATA_UNVERIFIED'}
    values.set(row.id,row.value)
  }
  if(values.size!==10)return {available:false,reason:'NATIVE_CRAFTER_DATA_UNAVAILABLE'}
  // cqj.e(slot) and cqj.l() compare the synchronized values to exactly 1.
  const disabledSlots=Array.from({length:9},(_,i)=>i).filter(i=>values.get(i)===1),powered=values.get(9)===1
  const sprite=powered?NATIVE_CRAFTER_GUI.powered:NATIVE_CRAFTER_GUI.unpowered
  return {available:true,disabledSlots,powered,redstone:{...sprite,x:97,y:35,sourceX:0,sourceY:0},
    disabled:disabledSlots.map(slot=>({slot,path:NATIVE_CRAFTER_GUI.disabled.path,x:25+18*(slot%3),y:16+18*Math.floor(slot/3),
      sourceX:0,sourceY:0,width:18,height:18}))}
}
