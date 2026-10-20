// Original client 1.21.1 data/minecraft/banner_pattern/*.json. All 43 files
// use asset_id=minecraft:<key>, translation_key=block.minecraft.banner.<key>.
// These are names, never assumed network registry IDs.
export const NATIVE_BANNER_PATTERNS=Object.freeze(`base border bricks circle creeper cross curly_border diagonal_left diagonal_right
diagonal_up_left diagonal_up_right flow flower globe gradient gradient_up guster half_horizontal half_horizontal_bottom
half_vertical half_vertical_right mojang piglin rhombus skull small_stripes square_bottom_left square_bottom_right
square_top_left square_top_right straight_cross stripe_bottom stripe_center stripe_downleft stripe_downright stripe_left
stripe_middle stripe_right stripe_top triangle_bottom triangle_top triangles_bottom triangles_top`.split(/\s+/));
export const NATIVE_BANNER_COLORS=Object.freeze({white:0xf9fffe,orange:0xf9801d,magenta:0xc74ebd,light_blue:0x3ab3da,
 yellow:0xfed83d,lime:0x80c71f,pink:0xf38baa,gray:0x474f52,light_gray:0x9d9d97,cyan:0x169c9c,purple:0x8932b8,
 blue:0x3c44aa,brown:0x835432,green:0x5e7c16,red:0xb02e26,black:0x1d1d21});
export const nativeBannerAsset=id=>typeof id==='string'&&id.startsWith('minecraft:')&&NATIVE_BANNER_PATTERNS.includes(id.slice(10))?id:null;
export function nativeBannerLayers(stack){
 const layers=stack?.components?.['minecraft:banner_patterns']??[];
 if(!Array.isArray(layers)||layers.length>64)throw Error('NATIVE_BANNER_PATTERNS_INVALID');
 return layers.map(row=>{
  if(!row||typeof row!=='object'||Object.keys(row).some(k=>!['pattern','color'].includes(k))||!Object.hasOwn(NATIVE_BANNER_COLORS,row.color))throw Error('NATIVE_BANNER_PATTERNS_INVALID');
  let asset=row.pattern;
  if(typeof asset!=='string'){
   if(!asset||typeof asset!=='object'||Object.keys(asset).some(k=>!['asset_id','translation_key'].includes(k))||
    typeof asset.translation_key!=='string'||asset.translation_key.length>512)throw Error('NATIVE_BANNER_PATTERN_UNSUPPORTED');
   asset=asset.asset_id;
  }
  if(!nativeBannerAsset(asset))throw Error('NATIVE_BANNER_PATTERN_UNSUPPORTED');
  return {asset,tintColor:NATIVE_BANNER_COLORS[row.color]};
 });
}
