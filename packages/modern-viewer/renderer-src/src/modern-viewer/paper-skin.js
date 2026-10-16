import * as THREE from 'three';
import { PlayerObject } from 'skinview3d/libs/model.js';
import { loadImage, loadSkinToCanvas } from 'skinview-utils';
import { nativeHumanoidWalkAngles } from '../native-viewer/native-player-motion.js';

async function loadSkinTexture(row){
  const image=await loadImage('data:image/png;base64,'+row.base64);
  if(image.width!==row.width||image.height!==row.height)throw Error('皮肤 PNG 解码尺寸不一致');
  const canvas=document.createElement('canvas');loadSkinToCanvas(canvas,image);
  return new THREE.CanvasTexture(canvas);
}
/** Original PNG on the standard Minecraft skin rig; never a server skin update. */
export async function createPaperSkinActor(bundle,model,{loadTexture=loadSkinTexture}={}) {
  const row=bundle.skin;if(!row||model!==row.model)throw Error('上传皮肤不可用');
  const texture=await loadTexture(row);
  texture.flipY=true;texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
  const root=new THREE.Group(),body=new THREE.Group(),player=new PlayerObject();root.name='paper-uploaded-skin';
  body.scale.setScalar(.9375/16);player.position.y=16;player.rotation.y=Math.PI;player.skin.modelType=model==='slim'?'slim':'default';player.skin.map=texture;
  player.backEquipment=null;player.ears.visible=false;body.add(player);root.add(body);
  let phase=0,previous=null;
  return {root,playerObject:player,assetInfo:{kind:'skin',source:'browser_upload',sha256:row.sha256,modelId:row.label,texture:model,
    originalWidth:row.width,originalHeight:row.height,selectionSource:'web_viewer_override',completeEntityParityVerified:false},
    animate(state,now){
      const motion=state.motion??{},dt=previous===null?0:Math.max(0,Math.min(.1,(now-previous)/1000));previous=now;
      const speed=motion.bodyState?.canAct===false?0:Math.max(0,Math.min(1,(motion.horizontalSpeed??0)/4));phase+=dt*20*speed;
      const pose=nativeHumanoidWalkAngles({position:phase,speed}).skinview;
      for(const [name,angle]of Object.entries(pose))player.skin[name].rotation.set(angle.x,angle.y,angle.z,angle.order);
      player.skin.head.rotation.x=-(state.pitch??0);
      root.visible=true;this.animationState={base:speed>0?'walk':'idle',errors:[],source:'same_connection_motion',completeEntityParityVerified:false};
    },
    headAnchor(){return root.localToWorld(new THREE.Vector3(0,1.9,0));},
    dispose(){root.removeFromParent();player.traverse(part=>{part.geometry?.dispose();const materials=Array.isArray(part.material)?part.material:[part.material];for(const material of materials)material?.dispose();});texture.dispose();root.clear();}};
}
