import * as THREE from 'three'

// Direct port of Minecraft 1.21.1 ModelPart.Cube/Polygon (fyk$a/fyk$b).
// Coordinates remain the original Y-down model pixels. Callers apply the
// renderer's original pose transforms; no guessed box/UV substitute is used.
export const ENTITY_MODEL_CLIENT_SHA256 = '499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99'
const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)

export function nativeCubeFaces (cube, textureDimensions) {
  if (!cube || !vector(cube.origin) || !vector(cube.size) || cube.size.some(v => v <= 0) || !Array.isArray(cube.uv) || cube.uv.length !== 2 || !cube.uv.every(Number.isFinite) || !Array.isArray(textureDimensions) || textureDimensions.length !== 2 || !textureDimensions.every(v => Number.isInteger(v) && v > 0 && v <= 4096)) throw Error('NATIVE_ENTITY_CUBE_INVALID')
  const dilation = cube.dilation ?? 0
  if (!Number.isFinite(dilation) || Math.abs(dilation) > 16 || (cube.mirror !== undefined && typeof cube.mirror !== 'boolean')) throw Error('NATIVE_ENTITY_CUBE_INVALID')
  const [x,y,z] = cube.origin, [dx,dy,dz] = cube.size, [u,v] = cube.uv, [width,height] = textureDimensions
  let x0=x-dilation, x1=x+dx+dilation
  if (cube.mirror) [x0,x1]=[x1,x0]
  const y0=y-dilation, y1=y+dy+dilation, z0=z-dilation, z1=z+dz+dilation
  const vertices = [[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]]
  const u0=u,u1=u+dz,u2=u+dz+dx,u3=u+dz+dx+dx,u4=u+dz+dx+dz,u5=u+dz+dx+dz+dx,v0=v,v1=v+dz,v2=v+dz+dy
  const descriptions = [
    ['down',[5,4,0,1],[u1,v0,u2,v1],[0,-1,0]],
    ['up',[2,3,7,6],[u2,v1,u3,v0],[0,1,0]],
    ['west',[0,4,7,3],[u0,v1,u1,v2],[-1,0,0]],
    ['north',[1,0,3,2],[u1,v1,u2,v2],[0,0,-1]],
    ['east',[5,1,2,6],[u2,v1,u4,v2],[1,0,0]],
    ['south',[4,5,6,7],[u4,v1,u5,v2],[0,0,1]]
  ]
  return descriptions.map(([direction, order, [a,b,c,d], normal]) => {
    let positions = order.map(index => vertices[index]), uv = [[c/width,1-b/height],[a/width,1-b/height],[a/width,1-d/height],[c/width,1-d/height]]
    if (cube.mirror) { positions=positions.reverse(); uv=uv.reverse(); normal=[-normal[0],normal[1],normal[2]] }
    return { direction, position: positions.flat(), uv: uv.flat(), normal, indices: [0,1,2,0,2,3] }
  })
}

// definitions={parts:[{name,parent?,pivot:[x,y,z],rotation?:[rx,ry,rz],cubes:[...]}]}
// Materials belong to the caller; this object owns only its original geometry.
export function createNativeModelPart (definitions, material, textureDimensions) {
  if (!Array.isArray(definitions?.parts) || definitions.parts.length > 128 || !material?.isMaterial) throw Error('NATIVE_ENTITY_MODEL_INVALID')
  const root = new THREE.Group(), bones = new Map(), geometries = new Set()
  try {
    for (const part of definitions.parts) {
      if (!/^[a-z0-9_]+$/.test(part?.name || '') || bones.has(part.name) || !vector(part.pivot) || (part.rotation !== undefined && !vector(part.rotation)) || !Array.isArray(part.cubes) || part.cubes.length > 64) throw Error('NATIVE_ENTITY_PART_INVALID')
      const bone = new THREE.Group(); bone.name=part.name; bone.position.fromArray(part.pivot)
      bone.rotation.set(...(part.rotation ?? [0,0,0]), 'ZYX'); bones.set(part.name,bone)
      for (const cube of part.cubes) for (const face of nativeCubeFaces(cube,textureDimensions)) {
        const geometry = new THREE.BufferGeometry(); geometries.add(geometry)
        geometry.setAttribute('position',new THREE.Float32BufferAttribute(face.position,3))
        geometry.setAttribute('normal',new THREE.Float32BufferAttribute(Array(4).fill(face.normal).flat(),3))
        geometry.setAttribute('uv',new THREE.Float32BufferAttribute(face.uv,2)); geometry.setIndex(face.indices)
        const mesh = new THREE.Mesh(geometry,material); mesh.userData.nativeFace=face.direction; bone.add(mesh)
      }
    }
    for (const part of definitions.parts) {
      const parent=part.parent ? bones.get(part.parent) : root
      if (!parent || parent===bones.get(part.name)) throw Error('NATIVE_ENTITY_PARENT_INVALID')
      let ancestor=part.parent, visited=new Set([part.name])
      while (ancestor) { if(visited.has(ancestor))throw Error('NATIVE_ENTITY_PARENT_CYCLE');visited.add(ancestor);ancestor=definitions.parts.find(p=>p.name===ancestor)?.parent }
      parent.add(bones.get(part.name))
    }
    root.scale.setScalar(1/16)
    let disposed=false
    return { root,bones,dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const geometry of geometries)geometry.dispose();root.clear()} }
  } catch(error) { for(const geometry of geometries)geometry.dispose();root.clear();throw error }
}
