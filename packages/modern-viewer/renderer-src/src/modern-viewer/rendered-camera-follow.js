/** Read the displayed entity root, never an animated head, name tag or camera. */
export function renderedEntityPosition(world, id) {
  if(id===undefined || id===null)return null;
  const root=world?.entities?.entities?.[String(id)];
  if(!root)return null;
  const position=world.sceneOrigin?.getWorldPosition(root);
  return position && ['x','y','z'].every(k=>Number.isFinite(position[k])) ? position : null;
}

/** The renderer advances entity tweens before world.render. Follow afterwards,
 * before scene-origin rebasing, culling and drawing, using that very frame. */
export function installRenderedCameraFollow(world, update) {
  const original=world.render;
  function render(...args) {
    update();
    return original.apply(this,args);
  }
  world.render=render;
  return ()=>{if(world.render===render)world.render=original;};
}
