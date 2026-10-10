import {CanvasTexture,DoubleSide,Euler,Group,Mesh,MeshBasicMaterial,NearestFilter,PlaneGeometry,Quaternion,SRGBColorSpace,Vector3} from 'three';
import {paintTextDisplay} from './text-display-font.js';
const validId=n=>Number.isInteger(n)&&n>=0&&n<=2147483647;
const validPosition=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]));

/** Dedicated zero-hitbox layer; only entities actually received by this connection. */
export class TextDisplays {
  constructor({getWorld=()=>globalThis.world,now=()=>performance.now(),createCanvas=()=>document.createElement('canvas')}={}) {
    this.getWorld=getWorld;this.now=now;this.createCanvas=createCanvas;this.states=new Map();this.instances=new Map();
    this.epoch=null;this.font=null;this.geometry=new PlaneGeometry(1,1);this.rotation=new Quaternion();this.euler=new Euler(0,0,0,'YXZ');
    this.cameraPosition=new Vector3();this.diagnostics={updates:0,rejected:0,created:0,disposed:0,textureUpdates:0};
  }
  setFont(font) {this.font=font;}
  handle(display) {
    if(!display||display.schemaVersion!==1||!validId(display.id)||display.epoch!==this.epoch)return false;
    if(display.delete){this.states.delete(display.id);this.remove(display.id);return true;}
    if(display.name!=='text_display'||!validPosition(display.position)||!validPosition(display.translation)||!validPosition(display.scale)
        ||!Array.isArray(display.runs)||display.runs.length>512||display.runs.some(r=>typeof r.text!=='string'||!/^#[0-9a-f]{6}$/i.test(r.color))
        ||display.runs.reduce((n,r)=>n+r.text.length,0)>1024||!Number.isInteger(display.flags)||display.flags<0||display.flags>255
        ||!Number.isInteger(display.opacity)||display.opacity<0||display.opacity>255
        ||!Number.isInteger(display.background)||display.background<0||display.background>4294967295
        ||!Number.isFinite(display.yaw)||!Number.isFinite(display.pitch)
        ||!Number.isInteger(display.lineWidth)||display.lineWidth<1||display.lineWidth>2048
        ||!Number.isInteger(display.billboard)||display.billboard<0||display.billboard>3
        ||!Number.isFinite(display.teleportTicks)||display.teleportTicks<0||display.teleportTicks>59
        ||!Number.isFinite(display.viewRange)||display.viewRange<0||display.viewRange>4) {this.diagnostics.rejected++;return false;}
    if(!this.states.has(display.id)&&this.states.size>=64){this.diagnostics.rejected++;return false;}
    const old=this.states.get(display.id),now=this.now();
    const moved=!old||['x','y','z'].some(k=>old.display.position[k]!==display.position[k]);
    this.states.set(display.id,{display,from:moved&&old?this.position(old,now):old?.from??{...display.position},at:moved?now:old.at});
    this.diagnostics.updates++;return true;
  }
  position(state,now) {
    const p=state.display.position,duration=state.display.teleportTicks*50,t=duration?Math.max(0,Math.min(1,(now-state.at)/duration)):1;
    return {x:state.from.x+(p.x-state.from.x)*t,y:state.from.y+(p.y-state.from.y)*t,z:state.from.z+(p.z-state.from.z)*t};
  }
  tick() {
    const world=this.getWorld(),camera=world?.camera,origin=world?.sceneOrigin;
    if(!world?.scene||!camera||!origin||!this.font)return;
    const now=this.now();camera.getWorldPosition(this.cameraPosition);camera.getWorldQuaternion(this.rotation);
    for(const [id,state] of this.states) {
      const display=state.display;
      if(display.unavailable||display.invisible||!display.runs.some(r=>r.text)||display.scale.x===0||display.scale.y===0){this.remove(id);continue;}
      let entry=this.instances.get(id);
      if(entry&&entry.scene!==world.scene){this.remove(id);entry=null;}
      const signature=JSON.stringify([display.runs,display.flags,display.opacity,display.background,display.lineWidth]);
      if(!entry) {
        const root=new Group(),pivot=new Group(),transform=new Group(),mesh=new Mesh(this.geometry,new MeshBasicMaterial({transparent:true,depthWrite:false,alphaTest:.001,side:DoubleSide,toneMapped:false}));
        root.name='native-text-display';root.userData.entityId=id;transform.add(mesh);pivot.add(transform);root.add(pivot);world.scene.add(root);
        entry={root,pivot,transform,mesh,scene:world.scene,signature:null,texture:null,error:null};this.instances.set(id,entry);this.diagnostics.created++;
      }
      if(entry.signature!==signature) {
        entry.signature=signature;entry.error=null;
        try {
          const canvas=this.createCanvas(),layout=paintTextDisplay(canvas,display,this.font);
          const texture=new CanvasTexture(canvas);texture.magFilter=texture.minFilter=NearestFilter;texture.generateMipmaps=false;texture.colorSpace=SRGBColorSpace;
          entry.texture?.dispose();entry.texture=texture;entry.mesh.material.map=texture;entry.mesh.material.needsUpdate=true;
          entry.mesh.scale.set((layout.width+1)*.025,(layout.height+1)*.025,1);
          // TextDisplayRenderer: 0.025 scale, 10-pixel lines, anchor at bottom.
          entry.mesh.position.set(.0125,(layout.height-1)*.025/2,0);this.diagnostics.textureUpdates++;
          entry.lines=layout.lines.length;
        } catch(error) {entry.error=String(error.message);entry.texture?.dispose();entry.texture=null;entry.mesh.material.map=null;}
      }
      const p=this.position(state,now);
      entry.root.position.set(origin.toSceneX(p.x),origin.toSceneY(p.y),origin.toSceneZ(p.z));
      if(display.billboard===3)entry.pivot.quaternion.copy(this.rotation);
      else {
        this.euler.setFromQuaternion(this.rotation,'YXZ');
        entry.pivot.rotation.set(display.billboard===2?this.euler.x:-display.pitch,display.billboard===1?this.euler.y:display.yaw-Math.PI,0,'YXZ');
      }
      entry.transform.position.set(display.translation.x,display.translation.y,display.translation.z);
      entry.transform.scale.set(display.scale.x,display.scale.y,display.scale.z);
      entry.mesh.material.depthTest=(display.flags&2)===0;
      entry.root.visible=!entry.error&&entry.root.position.distanceTo(this.cameraPosition)<=64*display.viewRange;
    }
  }
  remove(id) {const e=this.instances.get(id);if(!e)return;e.root.removeFromParent();e.texture?.dispose();e.mesh.material.dispose();this.instances.delete(id);this.diagnostics.disposed++;}
  reset(epoch=null) {for(const id of this.instances.keys())this.remove(id);this.states.clear();this.epoch=epoch;}
  dispose() {this.reset();this.geometry.dispose();this.font?.dispose();this.font=null;}
  stats() {return {...this.diagnostics,tracked:this.states.size,visible:[...this.instances.values()].filter(e=>e.root.visible).length,
    unavailable:[...this.states.values()].filter(s=>s.display.unavailable).length+[...this.instances.values()].filter(e=>e.error).length,
    ready:!!this.font,epoch:this.epoch,javaTextPixelParityVerified:false};}
}
