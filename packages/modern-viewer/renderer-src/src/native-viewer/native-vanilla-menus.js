// Original 1.21.1 Menu Slot origins, audited against locked client bytecode:
// cre/cqu/cqo/crn/cqp/cqt/cra/cqb/crt/cpw/crw/cpy/cqa. Screens use their
// original PNG crop; MerchantScreen fpz is 276px over a 512px-wide texture,
// HopperScreen fpr is 133px high. No inferred grid for an unknown menu type.
const CLIENT = '499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99'
const specs = [
  ['merchant','villager','a02a1364018f80ebbf14bd2a7bc97425aba6b9c2cbf1e985cb87ac3c16bd3bfa',525,[[136,37,'input'],[162,37,'input'],[220,37,'result']],276,166,108,84,142,512],
  ['hopper','hopper','5f98e011ffbd3a1ecd00501a08f36bb3a6af3a3ed34eba2156b0361aca4cd43f',325,Array.from({length:5},(_,i)=>[44+18*i,20,'container']),176,133,8,51,109],
  ['generic_3x3','dispenser','901d26f1aac7e7a9724ab2f7f4bf00ae4a8e3907c4274565020aa3093925feaa',344,Array.from({length:9},(_,i)=>[62+18*(i%3),17+18*Math.floor(i/3),'container'])],
  ['shulker_box','shulker_box','55f7474b17b6944bb213a5b73ebd2b47e34a31207363c358d1c7f9207cd15887',325,Array.from({length:27},(_,i)=>[8+18*(i%9),18+18*Math.floor(i/9),'container'])],
  ['enchantment','enchanting_table','44b4c725852a7655a6a15f74ea73eb7d82e613a05c3b5252adfab9e9cde9b52d',434,[[15,47,'input'],[35,47,'material']]],
  ['grindstone','grindstone','3d4cf374bbda72d2450f07e73b277811324eb91a09b86f08b0a9b45f515ae190',481,[[49,19,'input'],[49,40,'input'],[129,34,'result']]],
  ['loom','loom','5bbcae9d0ecf810b039c6b520a95b64f7b6e0a294853866568aac376691c515d',538,[[13,26,'material'],[33,26,'material'],[23,45,'material'],[143,57,'result']]],
  ['cartography_table','cartography_table','cd091ee9be3f4466d83eef08c9b9383106383d4a10523919b0fffd513cc30311',410,[[15,15,'input'],[15,52,'material'],[145,39,'result']]],
  ['smithing','smithing','a3c828e32f48278a058f667816ae160fffff447b20eab6af0f5aec6732ad3841',618,[[8,48,'material'],[26,48,'input'],[44,48,'material'],[98,48,'result']]],
  ['anvil','anvil','a62baaf82c060abcf530fb958a8c17f4c3c5a2bda1a8cf5ccd07916f2a8c8b5c',573,[[27,47,'input'],[76,47,'material'],[134,47,'result']]],
  ['stonecutter','stonecutter','1d8801b30c8500913775b771354d06e3fb540ce9d21cb5082252484e49909137',393,[[20,33,'input'],[143,33,'result']]],
  ['beacon','beacon','fb6101bbc27fc2c672c415486a8c08f32e1b1292c073ae4f586775bdb1816c19',805,[[136,110,'material']],230,219,36,137,195],
  ['brewing_stand','brewing_stand','4d958c996b8b95cba9997c4a0f47326589164b5cd609048db745b420dc74aa5b',791,[[56,51,'input'],[79,58,'input'],[102,51,'input'],[79,17,'material'],[17,17,'fuel']]]
]
export const NATIVE_VANILLA_GUIS = Object.freeze(Object.fromEntries(specs.map(([type,texture,sha256,bytes,slots,width=176,height=166,inventoryX=8,inventoryY=84,hotbarY=142,textureWidth=256]) =>
  [`minecraft:${type}`,Object.freeze({clientJarSha256:CLIENT,path:`assets/minecraft/textures/gui/container/${texture}.png`,sha256,bytes,
    width,height,inventoryX,inventoryY,hotbarY,textureWidth,textureHeight:256,slots:Object.freeze(slots.map(row=>Object.freeze(row)))})])))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// rows must come from the shared nativeSlotRows validator; retain each complete
// authoritative stack rather than constructing a registry/proxy item.
export function standardVanillaMenuLayout(menu,expectedUuid,rows) {
  if (!UUID.test(expectedUuid??'') || (menu?.playerUuid??'').toLowerCase() !== expectedUuid.toLowerCase()) throw Error('NATIVE_VANILLA_MENU_IDENTITY_MISMATCH')
  const info = Object.hasOwn(NATIVE_VANILLA_GUIS,menu?.menuType) ? NATIVE_VANILLA_GUIS[menu.menuType] : null
  if (!info || !Number.isSafeInteger(menu.windowId) || menu.windowId<=0 || !Number.isSafeInteger(menu.stateId) || menu.stateId<0) throw Error('NATIVE_VANILLA_MENU_STATE_UNVERIFIED')
  const size=info.slots.length
  if (!Array.isArray(rows) || rows.length!==size+36 || rows.some((row,i)=>row.slot!==i)) throw Error('NATIVE_VANILLA_MENU_SLOTS_UNVERIFIED')
  return {info,width:info.width,height:info.height,blits:[{x:0,y:0,sourceX:0,sourceY:0,width:info.width,height:info.height}],
    slots:rows.map(row=>{
      const i=row.slot
      if(i<size) {const [x,y,role]=info.slots[i];return {row,x,y,role}}
      if(i<size+27) return {row,x:info.inventoryX+18*((i-size)%9),y:info.inventoryY+18*Math.floor((i-size)/9),role:'inventory'}
      return {row,x:info.inventoryX+18*(i-size-27),y:info.hotbarY,role:'hotbar'}
    })}
}

// Only named, actually received properties. Omitted properties are unknown,
// never zero. These are menu data slots, not confirmation of an action.
export function vanillaMenuPropertyLabels(menu) {
  const names={
    'minecraft:anvil':{0:'修复等级费用'},
    'minecraft:enchantment':{0:'第一栏等级费用',1:'第二栏等级费用',2:'第三栏等级费用',4:'第一栏附魔提示 ID',5:'第二栏附魔提示 ID',6:'第三栏附魔提示 ID',7:'第一栏提示等级',8:'第二栏提示等级',9:'第三栏提示等级'},
    'minecraft:brewing_stand':{0:'剩余酿造 tick',1:'燃料次数'},
    'minecraft:beacon':{0:'信标等级',1:'主效果 ID',2:'副效果 ID'}
  }[menu?.menuType]
  if(!names || !Array.isArray(menu.properties)) return []
  const seen=new Set()
  return menu.properties.slice(0,32).flatMap(row=>{
    if(!row || !Object.hasOwn(names,row.id) || !Number.isInteger(row.value) || seen.has(row.id)) return []
    seen.add(row.id);return [`${names[row.id]}：${row.value}`]
  })
}
