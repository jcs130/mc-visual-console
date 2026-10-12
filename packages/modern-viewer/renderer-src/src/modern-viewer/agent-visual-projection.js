import { Vector3 } from 'three';

/** Project absolute Minecraft coordinates through the renderer's actual camera.
 * SceneOrigin is a coordinate converter, not a Three.js Object3D. In particular,
 * OBS skips the terrain render, so update camera/parent matrices explicitly. */
export function createAgentWorldProjector(getWorld, getViewport) {
  const vector = new Vector3();
  return position => {
    const world = getWorld(), camera = world?.camera;
    if (!camera || !position) return null;
    const origin = world.sceneOrigin;
    vector.set(origin?.toSceneX?.(position.x) ?? position.x,
      origin?.toSceneY?.(position.y) ?? position.y, origin?.toSceneZ?.(position.z) ?? position.z);
    camera.updateWorldMatrix(true, false);
    vector.project(camera);
    if (vector.z < -1 || vector.z > 1 || !Number.isFinite(vector.x) || !Number.isFinite(vector.y)) return null;
    const { width, height } = getViewport();
    return { x: (vector.x + 1) * .5 * width, y: (1 - vector.y) * .5 * height };
  };
}
