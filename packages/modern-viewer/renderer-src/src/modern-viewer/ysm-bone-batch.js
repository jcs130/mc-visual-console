import {Mesh,Matrix4} from 'three';
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

/** Merge only geometry whose relative transform can never be animated.
 * Bone nodes/locators remain intact. Each movable ancestor keeps a separate
 * draw, so authored non-uniform/zero scales still use Three's normal matrix. */
export function batchStaticYsmBones(model,material,definitions,dynamicBones=[]) {
  const animated=new Set(['Head','head',...dynamicBones]);
  for(const definition of definitions)for(const clip of Object.values(definition?.animations??{}))
    for(const name of Object.keys(clip.bones??{}))animated.add(name);
  const bones=new Set(model.bones.values()),groups=new Map(),geometries=[];
  model.root.traverse(mesh=>{
    if(!mesh.isMesh || mesh.material!==material)return;
    let target=mesh.parent;
    while(target!==model.root && !(bones.has(target)&&animated.has(target.name)))target=target.parent;
    const group=groups.get(target)??[];group.push(mesh);groups.set(target,group);
  });
  try {
    for(const [target,meshes]of groups) {
      if(meshes.length<2)continue;
      const parts=meshes.map(mesh=>{
        mesh.updateMatrix();const transform=new Matrix4().copy(mesh.matrix);
        for(let part=mesh.parent;part!==target;part=part.parent){part.updateMatrix();transform.premultiply(part.matrix);}
        const geometry=mesh.geometry.clone().applyMatrix4(transform);
        if(transform.determinant()<0 && geometry.index) {
          const index=geometry.index;for(let n=0;n<index.count;n+=3){const a=index.getX(n);index.setX(n,index.getX(n+2));index.setX(n+2,a);}
        }
        return geometry;
      });
      let geometry;
      try{geometry=mergeGeometries(parts);}finally{for(const part of parts)part.dispose();}
      if(!geometry)throw Error('YSM_STATIC_BATCH_FAILED');
      geometries.push(geometry);for(const mesh of meshes)mesh.removeFromParent();
      const batch=new Mesh(geometry,material);batch.name=target.name+' static geometry';target.add(batch);
    }
    return {geometries,dispose(){for(const geometry of geometries)geometry.dispose();}};
  }catch(error){for(const geometry of geometries)geometry.dispose();throw error;}
}
