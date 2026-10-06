/** Adapt the pinned renderer's entity culling to its floating scene origin. */
export function patchRendererEntityVisibility(source) {
  const before = 'let c=s.position.x-t.x,u=s.position.y-t.y,h=s.position.z-t.z,p=c*c+u*u+h*h,m=this.worldRenderer.entitySectionKey(s.position.x,s.position.y,s.position.z)';
  const after = 'let entityWorldPosition=this.worldRenderer.sceneOrigin.getWorldPosition(s)??{x:this.worldRenderer.sceneOrigin.toWorldX(s.position.x),y:this.worldRenderer.sceneOrigin.toWorldY(s.position.y),z:this.worldRenderer.sceneOrigin.toWorldZ(s.position.z)},c=entityWorldPosition.x-t.x,u=entityWorldPosition.y-t.y,h=entityWorldPosition.z-t.z,p=c*c+u*u+h*h,m=this.worldRenderer.entitySectionKey(entityWorldPosition.x,entityWorldPosition.y,entityWorldPosition.z)';
  if (source.split(before).length !== 2) throw Error('minecraft-renderer entity visibility anchor changed');
  return source.replace(before, after);
}

/** Shader materials used by item glints do not have a color property. */
export function patchRendererEntityDamage(source) {
  const before = 'i instanceof j.Mesh&&i.material.clone';
  const after = 'i instanceof j.Mesh&&i.material?.clone&&i.material?.color?.clone';
  if (source.split(before).length !== 2) throw Error('minecraft-renderer entity damage anchor changed');
  return source.replace(before, after);
}
