import { fileURLToPath } from 'node:url';
/** Adapt the pinned renderer's entity culling to its floating scene origin. */
export function patchRendererEntityVisibility(source) {
  const before = 'let c=s.position.x-t.x,u=s.position.y-t.y,h=s.position.z-t.z,p=c*c+u*u+h*h,m=this.worldRenderer.entitySectionKey(s.position.x,s.position.y,s.position.z)';
  const after = 'let entityWorldPosition=this.worldRenderer.sceneOrigin.getWorldPosition(s)??{x:this.worldRenderer.sceneOrigin.toWorldX(s.position.x),y:this.worldRenderer.sceneOrigin.toWorldY(s.position.y),z:this.worldRenderer.sceneOrigin.toWorldZ(s.position.z)},c=entityWorldPosition.x-t.x,u=entityWorldPosition.y-t.y,h=entityWorldPosition.z-t.z,p=c*c+u*u+h*h,m=this.worldRenderer.entitySectionKey(entityWorldPosition.x,entityWorldPosition.y,entityWorldPosition.z)';
  if (source.split(before).length !== 2) throw Error('minecraft-renderer entity visibility anchor changed');
  return source.replace(before, after);
}

/** Retain one untinted baseline across overlapping damage events. */
export function patchRendererEntityDamage(source) {
  const start = source.indexOf('handleDamageEvent(e,t){');
  const end = source.indexOf('raycastSceneDebug()', start);
  if (start < 0 || end < start || !source.slice(start, end).includes('i.material.clone'))
    throw Error('minecraft-renderer entity damage anchor changed');
  const module = fileURLToPath(new URL('../src/modern-viewer/entity-hurt-tint.js', import.meta.url));
  return `import { tintEntityDamage as CortiTintEntityDamage } from ${JSON.stringify(module)};\n`
    + source.slice(0,start) + 'handleDamageEvent(e,t){CortiTintEntityDamage(this.entities[e]?.children.find(i=>i.name==="mesh"),Ge)}' + source.slice(end);
}
