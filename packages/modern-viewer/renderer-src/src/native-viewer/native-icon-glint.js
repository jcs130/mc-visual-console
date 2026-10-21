import * as THREE from 'three'
import { nativeGlintMatrix } from './native-item-glint.js'
import { resourcePath, textureId } from './model-loader.js'
import { nativeGuiItemTransform } from './native-block-item-icons.js'

// Rasterize the original GUI faces into a small UV/depth map once, rather than
// creating a WebGL context/RAF per inventory cell. Alpha comes from its real icon.
export function nativeGlintIconUvMap (appearance, glint, size = 32) {
  if (!Number.isInteger(size) || size < 16 || size > 64) throw Error('NATIVE_GLINT_ICON_SIZE_INVALID')
  const prepared = appearance.prepared, flat = appearance.geometry === 'generated'
  if (!flat && !['static','shield'].includes(appearance.family)) throw Error('NATIVE_GLINT_ICON_GEOMETRY_UNSUPPORTED')
  const faces = flat ? [{ position: [-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0], uv: [0,0,1,0,1,1,0,1], indices: [0,1,2,0,2,3],
    texture: textureId(appearance.model, appearance.model.textures.layer0) }] : prepared?.renderFaces ?? prepared?.faces
  if (!Array.isArray(faces) || faces.length > 768) throw Error('NATIVE_GLINT_ICON_GEOMETRY_UNSUPPORTED')
  const transform = prepared?.transform ?? nativeGuiItemTransform(appearance.model.display?.gui)
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...transform.translation),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotation.map(THREE.MathUtils.degToRad), 'XYZ')), new THREE.Vector3(...transform.scale))
  const uv = new Float32Array(size*size*2).fill(NaN), depth = new Float32Array(size*size).fill(-Infinity)
  for (const face of faces) {
    const path = resourcePath(face.texture,'textures','.png'), rect = glint.sprites[path]
    if (!rect) throw Error('NATIVE_GLINT_SPRITE_UNAVAILABLE')
    const [sx,sy,sw,sh,aw,ah] = rect, points = []
    for (let n = 0; n < face.position.length/3; n++) {
      const point = new THREE.Vector3(...face.position.slice(n*3,n*3+3)).applyMatrix4(matrix)
      points.push({x:(point.x+.5)*size,y:(.5-point.y)*size,z:point.z,u:(sx+face.uv[n*2]*sw)/aw,v:(sy+(1-face.uv[n*2+1])*sh)/ah})
    }
    for (let i = 0; i < face.indices.length; i += 3) {
      const [a,b,c] = face.indices.slice(i,i+3).map(n=>points[n]), area = (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)
      if (area >= -1e-8) continue
      for (let y = Math.max(0,Math.floor(Math.min(a.y,b.y,c.y))); y < Math.min(size,Math.ceil(Math.max(a.y,b.y,c.y))); y++)
        for (let x = Math.max(0,Math.floor(Math.min(a.x,b.x,c.x))); x < Math.min(size,Math.ceil(Math.max(a.x,b.x,c.x))); x++) {
          const px=x+.5,py=y+.5, wb=((px-a.x)*(c.y-a.y)-(py-a.y)*(c.x-a.x))/area,
            wc=((b.x-a.x)*(py-a.y)-(b.y-a.y)*(px-a.x))/area, wa=1-wb-wc
          if (Math.min(wa,wb,wc)<-1e-7) continue
          const z=wa*a.z+wb*b.z+wc*c.z,n=y*size+x
          if (z<depth[n]-1e-8) continue
          depth[n]=z;uv[n*2]=wa*a.u+wb*b.u+wc*c.u;uv[n*2+1]=wa*a.v+wb*b.v+wc*c.v
        }
    }
  }
  return { size, uv }
}

// Same native shader operation and SRC_COLOR/ONE blend as the held material.
// Stored original RGB is sampled linearly with REPEAT; destination alpha stays.
export function nativeGlintIconPixels (base, map, glint, now, output = new Uint8ClampedArray(base.length)) {
  if (base.length !== map.size*map.size*4 || output.length !== base.length) throw Error('NATIVE_GLINT_ICON_PIXELS_INVALID')
  output.set(base)
  const e=nativeGlintMatrix(now,glint.speed).elements,w=glint.width,h=glint.height,p=glint.pixels
  const wrap=(n,max)=>(n%max+max)%max
  for (let n=0;n<map.size*map.size;n++) {
    const u=map.uv[n*2],v=map.uv[n*2+1]; if (!Number.isFinite(u)||!Number.isFinite(v)||base[n*4+3]<26) continue
    const x=(e[0]*u+e[3]*v+e[6])*w-.5,y=(e[1]*u+e[4]*v+e[7])*h-.5,ix=Math.floor(x),iy=Math.floor(y),dx=x-ix,dy=y-iy
    const indices=[(wrap(iy,h)*w+wrap(ix,w))*4,(wrap(iy,h)*w+wrap(ix+1,w))*4,(wrap(iy+1,h)*w+wrap(ix,w))*4,(wrap(iy+1,h)*w+wrap(ix+1,w))*4]
    for (let channel=0;channel<3;channel++) {
      const color=((p[indices[0]+channel]*(1-dx)+p[indices[1]+channel]*dx)*(1-dy)+(p[indices[2]+channel]*(1-dx)+p[indices[3]+channel]*dx)*dy)*glint.strength
      output[n*4+channel]=Math.min(255,base[n*4+channel]+color*color/255)
    }
  }
  return output
}

async function decodeIcon (url, size, document) {
  const image = new Image(); image.src = url; await image.decode()
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size
  const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) throw Error('NATIVE_GLINT_CANVAS_UNAVAILABLE')
  context.imageSmoothingEnabled = false; context.drawImage(image,0,0,size,size)
  return context.getImageData(0,0,size,size).data
}

export class NativeIconGlintClock {
  constructor ({ document = globalThis.document, requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
    cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis), decode = decodeIcon, now = Date.now } = {}) {
    this.document=document;this.requestFrame=requestFrame;this.cancelFrame=cancelFrame;this.decode=decode;this.now=now
    this.bindings=new Map();this.entries=new Set();this.frame=null;this.disposed=false;this.last=-Infinity
  }
  add (icon, appearance, glint) {
    const entry={icon,glint,map:nativeGlintIconUvMap(appearance,glint),base:null,pending:null,disposed:false};this.entries.add(entry)
    return {source:glint.source,bind:canvas=>{
      if (this.disposed||entry.disposed||!canvas?.getContext||!this.requestFrame) return false
      canvas.width=canvas.height=entry.map.size;canvas.dataset.nativeGlint='loading'
      this.bindings.set(canvas,entry)
      entry.pending??=this.decode(icon.url,entry.map.size,this.document).then(base=>{if(this.disposed||entry.disposed)return;entry.base=base;this.schedule()}).catch(()=>{
        for(const [target,row]of this.bindings)if(row===entry){target.dataset.nativeGlint='unavailable';target.hidden=true;target.dispatchEvent?.(new Event('native-glint-error'));this.bindings.delete(target)}
      })
      this.schedule();return true
    },dispose:()=>{entry.disposed=true;entry.base=null;this.entries.delete(entry);for(const [canvas,row]of this.bindings)if(row===entry)this.bindings.delete(canvas)}}
  }
  schedule () { if(!this.disposed&&this.frame===null&&this.bindings.size&&this.requestFrame)this.frame=this.requestFrame(()=>this.tick()) }
  tick () {
    this.frame=null;if(this.disposed)return
    if(this.now()-this.last<80){this.schedule();return}
    const now=this.now(),paint=new Map()
    for(const [canvas,entry]of this.bindings){
      if(!canvas.isConnected||entry.disposed){this.bindings.delete(canvas);continue}
      const visible=!this.document?.hidden&&canvas.getClientRects().length>0
      if(!visible||!entry.base)continue
      const rect=canvas.getBoundingClientRect(),view=this.document?.defaultView
      if(view&&(rect.bottom<0||rect.right<0||rect.top>view.innerHeight||rect.left>view.innerWidth))continue
      let image=paint.get(entry)
      if(!image){const context=canvas.getContext('2d');if(!context)continue;image=context.createImageData(entry.map.size,entry.map.size)
        nativeGlintIconPixels(entry.base,entry.map,entry.glint,now,image.data);paint.set(entry,image)}
      canvas.getContext('2d').putImageData(image,0,0);canvas.dataset.nativeGlint='animated'
    }
    this.last=now
    this.schedule()
  }
  dispose () {this.disposed=true;if(this.frame!==null)this.cancelFrame?.(this.frame);this.frame=null;this.bindings.clear();this.entries.clear()}
}
