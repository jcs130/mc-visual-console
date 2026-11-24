import{animationFrames,frameAt}from'../../native-viewer/texture-animation.js';
export function blendFrameBytes(a,b,t){if(a.length!==b.length||a.length%4||!Number.isFinite(t)||t<0||t>1)throw Error('ANIMATION_BLEND_INVALID');const out=new Uint8ClampedArray(a.length);for(let i=0;i<a.length;i+=4){for(let j=0;j<3;j++)out[i+j]=Math.floor(a[i+j]*(1-t)+b[i+j]*t+1e-8);out[i+3]=a[i+3];}return out;}
export class AtlasAnimationClock{
 constructor(rows){if(!Array.isArray(rows)||rows.length>512)throw Error('ANIMATION_SPRITE_BUDGET');this.rows=rows.map(row=>({...row,animation:animationFrames(row.metadata,row.width,row.height),last:null}));}
 tick(ticks,copy){let updates=0;for(const row of this.rows){const f=frameAt(row.animation,ticks),key=f.index+':'+f.blend;if(row.last===key)continue;for(const target of row.targets){if(target.width!==row.animation.frameWidth||target.height!==row.animation.frameHeight)throw Error('ANIMATION_ATLAS_FRAME_SIZE_MISMATCH');copy({row,target,frame:f,x:f.index%row.animation.columns*row.animation.frameWidth,y:Math.floor(f.index/row.animation.columns)*row.animation.frameHeight});updates++;}row.last=key;}return updates;}
}
