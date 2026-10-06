/** Entity distance/section culling remains on the root. Skinned meshes animate
 * beyond their cached rest-pose spheres, so they must not cull independently. */
export function stabilizeEntityRenderBounds(root) {
  root?.traverse?.((part) => {
    if (part.isSkinnedMesh) part.frustumCulled = false;
  });
}

export function installEntityRenderBounds(entities) {
  if (typeof entities?.update !== 'function') return null;
  const originalUpdate = entities.update;
  for (const entity of Object.values(entities.entities ?? {})) stabilizeEntityRenderBounds(entity);
  stabilizeEntityRenderBounds(entities.playerEntity);
  const wrappedUpdate = function (entity, ...args) {
    const result = originalUpdate.call(this, entity, ...args);
    stabilizeEntityRenderBounds(this.entities?.[String(entity.id)]);
    return result;
  };
  entities.update = wrappedUpdate;
  return {
    dispose() {
      if (entities.update === wrappedUpdate) entities.update = originalUpdate;
    },
  };
}
