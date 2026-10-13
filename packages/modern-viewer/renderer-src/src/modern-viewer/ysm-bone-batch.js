import {Mesh} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Bake only static cube-local transforms. Animated bones and their hierarchy
 * remain independent; vertices, normals, UVs and source triangle order survive. */
export function batchYsmBones(model, material) {
  const geometries=[];
  try {
    for(const bone of model.bones.values()) {
      const meshes=[], cubes=[];
      for(const child of bone.children) {
        if(child.isMesh && child.material===material)meshes.push(child);
        else if(child.userData.nativeCubeRotation===true) {
          if(child.children.every(part=>part.isMesh&&part.material===material)) {
            child.updateMatrix(); cubes.push(child); meshes.push(...child.children);
          }
        }
      }
      if(meshes.length<2)continue;
      const parts=meshes.map(mesh=>{
        mesh.updateMatrix();
        const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrix);
        if(mesh.parent!==bone)geometry.applyMatrix4(mesh.parent.matrix);
        return geometry;
      });
      let geometry;
      try {geometry=mergeGeometries(parts);}
      finally {for(const part of parts)part.dispose();}
      if(!geometry)throw Error('YSM_GEOMETRY_BATCH_FAILED');
      geometries.push(geometry);
      for(const mesh of meshes)mesh.removeFromParent();
      for(const cube of cubes)cube.removeFromParent();
      const batch=new Mesh(geometry,material);batch.name=bone.name+' geometry';bone.add(batch);
    }
    return {geometries,dispose(){for(const geometry of geometries)geometry.dispose();}};
  } catch(error) {for(const geometry of geometries)geometry.dispose();throw error;}
}
