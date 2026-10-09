import { BufferGeometry, BufferAttribute, Points, ShaderMaterial, TextureLoader, NearestFilter, NormalBlending } from 'three';

export const PARTICLE_LIMITS = Object.freeze({ active: 2048, batch: 64, pendingBatches: 4, distance: 80 });
export class ServerParticles {
  constructor({ getWorld = () => globalThis.world, now = () => performance.now(), random = Math.random } = {}) {
    this.getWorld = getWorld; this.now = now; this.random = random; this.entries = []; this.assets = null; this.cloud = null;
    this.diagnostics = { received: 0, rendered: 0, dropped: 0, unsupported: 0 }; this.pending = [];
  }
  setAssets(assets, texture) {
    this.reset(); this.assets = assets; this.texture = texture;
    texture.magFilter = texture.minFilter = NearestFilter; texture.generateMipmaps = false; texture.flipY = false;
    const geometry = new BufferGeometry();
    for (const [name, size] of [['position',3],['color',3],['opacity',1],['size',1],['sprite',4]]) geometry.setAttribute(name,new BufferAttribute(new Float32Array(PARTICLE_LIMITS.active*size),size));
    geometry.setDrawRange(0,0);
    const material = new ShaderMaterial({ transparent: true, depthWrite: false, blending: NormalBlending, vertexColors: true, toneMapped: false,
      uniforms: { atlas: { value: texture } },
      // The world renderer uses logarithmic depth. A linear-depth custom shader
      // is otherwise hidden behind nearby terrain despite valid GPU geometry.
      vertexShader: `#include <common>
        #include <logdepthbuf_pars_vertex>
        attribute float opacity; attribute float size; attribute vec4 sprite;
        varying vec3 vColor; varying float vOpacity; varying vec4 vSprite;
        void main(){vColor=color;vOpacity=opacity;vSprite=sprite;vec4 mv=modelViewMatrix*vec4(position,1.);
          gl_PointSize=clamp(size*70./max(1.,-mv.z),1.,80.);gl_Position=projectionMatrix*mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `#include <logdepthbuf_pars_fragment>
        uniform sampler2D atlas; varying vec3 vColor; varying float vOpacity; varying vec4 vSprite;
        void main(){
          #include <logdepthbuf_fragment>
          vec4 p=texture2D(atlas,vSprite.xy+vec2(gl_PointCoord.x,1.-gl_PointCoord.y)*vSprite.zw);
          gl_FragColor=vec4(p.rgb*vColor,p.a*vOpacity);if(gl_FragColor.a<.01)discard;
        }` });
    this.cloud = new Points(geometry,material); this.cloud.name='minecraft-server-particles'; this.cloud.frustumCulled=false;
  }
  handleBatch(batch) {
    if (!batch || batch.schemaVersion !== 1 || !Array.isArray(batch.events) || batch.events.length > PARTICLE_LIMITS.batch) return false;
    if (!this.assets) { if (this.pending.length < PARTICLE_LIMITS.pendingBatches) this.pending.push({ batch, at: this.now() }); return false; }
    let rendered=false;
    for (const event of batch.events) rendered=this.spawn(event)||rendered;
    return rendered;
  }
  spawn(event) {
    this.diagnostics.received++;
    if (!event || !event.position || ![event.position.x,event.position.y,event.position.z].every(Number.isFinite)) return false;
    const definitions=this.assets?.particleDefinitions?.[event.name];
    if (!definitions?.length) { this.diagnostics.unsupported++; return false; }
    const color=event.color ?? [1,1,1], to=event.colorEnd ?? color;
    if (![color,to].every(c=>Array.isArray(c)&&c.length===3&&c.every(n=>Number.isFinite(n)&&n>=0&&n<=1))) return false;
    const count=event.count===0?1:Math.min(48,Math.max(1,event.count|0)), spread=event.spread??{x:0,y:0,z:0};
    if (![spread.x,spread.y,spread.z,event.speed??0,event.size??1].every(Number.isFinite)) return false;
    const speed=Math.max(0,Math.min(4,event.speed??0)), size=Math.max(.01,Math.min(4,event.size??1));
    const gaussian=()=>{const u=Math.max(1e-9,this.random());return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*this.random());};
    for(let i=0;i<count;i++) {
      if(this.entries.length>=PARTICLE_LIMITS.active) {this.diagnostics.dropped++;break;}
      const directional=event.count===0;
      const p={...event.position},v={x:0,y:0,z:0};
      for(const axis of ['x','y','z']) {
        if(directional) v[axis]=spread[axis]*speed;
        else {p[axis]+=gaussian()*Math.max(-8,Math.min(8,spread[axis]));v[axis]=gaussian()*speed;}
      }
      this.entries.push({p,v,color:[...color],to:[...to],size,born:this.now(),ttl:1000,definitions,
        sprite:Math.floor(this.random()*definitions.length),exact:event.exact===true});
      this.diagnostics.rendered++;
    }
    return true;
  }
  tick(at=this.now()) {
    const world=this.getWorld(); if(!this.cloud || !world?.scene || !world?.sceneOrigin) return;
    if(this.scene!==world.scene) {if(this.scene)this.entries=[];this.scene=world.scene;world.scene.add(this.cloud);}
    const origin=world.sceneOrigin,g=this.cloud.geometry;
    this.entries=this.entries.filter(p=>at-p.born<p.ttl);
    for(let i=0;i<this.entries.length;i++) {
      const p=this.entries[i],progress=Math.max(0,(at-p.born)/p.ttl),seconds=progress*p.ttl/1000;
      g.attributes.position.array.set([origin.toSceneX(p.p.x+p.v.x*seconds),origin.toSceneY(p.p.y+p.v.y*seconds),origin.toSceneZ(p.p.z+p.v.z*seconds)],i*3);
      g.attributes.color.array.set(p.color.map((c,j)=>c+(p.to[j]-c)*progress),i*3);
      g.attributes.opacity.array[i]=Math.min(1,(1-progress)*3);g.attributes.size.array[i]=p.size;
      const name=p.definitions[p.sprite];g.attributes.sprite.array.set(this.assets.particleSprites[name].uv,i*4);
    }
    g.setDrawRange(0,this.entries.length);for(const a of Object.values(g.attributes))a.needsUpdate=true;
  }
  clear() {this.entries=[];this.pending=[];this.cloud?.geometry.setDrawRange(0,0);}
  reset() {this.clear();this.scene=null;this.cloud?.parent?.remove(this.cloud);this.cloud?.geometry.dispose();this.cloud?.material.dispose();this.cloud=null;}
  dispose() {this.reset();this.texture?.dispose();this.assets=null;}
  stats() {return {...this.diagnostics,active:this.entries.length,drawn:this.cloud?.geometry.drawRange.count??0,mounted:!!this.cloud?.parent,ready:!!this.assets,
    firstScenePosition:this.entries.length?[...this.cloud.geometry.attributes.position.array.slice(0,3)]:null};}
}

export async function loadViewerContentAssets(fetcher=fetch) {
  const [response,source]=await Promise.all([fetcher('/viewer-content.json'),fetcher('/asset-source.json')]);
  if(!response.ok || !source.ok) throw Error('viewer_content_assets_missing');
  const [assets,manifest]=await Promise.all([response.json(),source.json()]);
  if(assets.schemaVersion!==1 || assets.minecraftVersion!=='1.20.6' || assets.clientJarSha256!==manifest.clientJarSha256
      || !Array.isArray(assets.mapColors) || assets.mapColors.length!==62 || !assets.particleSprites) throw Error('viewer_content_assets_mismatch');
  const texture=await new TextureLoader().loadAsync('/particle-content.png');
  return { assets, texture };
}
