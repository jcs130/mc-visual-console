import * as THREE from 'three'
import { NativeAssetReader } from './model-loader.js'
import { createNativeModelPart, ENTITY_MODEL_CLIENT_SHA256 } from './native-entity-model.js'

// Minecraft 1.21.1 BedRenderer (ggw), createHeadLayer/createFootLayer and
// renderPiece; the original client JAR is pinned, not a block JSON substitute.
const COLORS = new Set(['white','orange','magenta','light_blue','yellow','lime','pink','gray','light_gray','cyan','purple','blue','brown','green','red','black'])
const FACING_Y_ROT = { south: 0, west: 90, north: 180, east: 270 }
const originalFloat = Math.fround
const HALF_PI = originalFloat(1.5707964), PI = originalFloat(3.1415927), THREE_HALF_PI = originalFloat(4.712389)

export function nativeBedState (state) {
  const match = /^minecraft:([a-z_]+)_bed$/.exec(state?.name ?? '')
  if (!match || !COLORS.has(match[1]) || state.hasBlockEntity !== true || state.renderShape !== 'ENTITYBLOCK_ANIMATED' ||
      !['head','foot'].includes(state.properties?.part) || !Object.hasOwn(FACING_Y_ROT,state.properties?.facing) ||
      !['true','false'].includes(String(state.properties?.occupied))) throw Error('NATIVE_BED_STATE_UNSUPPORTED')
  return { color: match[1], part: state.properties.part, facing: state.properties.facing }
}

export function nativeBedLayer (part) {
  if (!['head','foot'].includes(part)) throw Error('NATIVE_BED_PART_INVALID')
  const cube = (uv,origin,size) => ({ uv,origin,size })
  const bone = (name,cubes,rotation=[0,0,0]) => ({ name,pivot:[0,0,0],rotation,cubes })
  return { parts: part === 'head' ? [
    bone('main',[cube([0,0],[0,0,0],[16,16,6])]),
    bone('left_leg',[cube([50,6],[0,6,0],[3,3,3])],[HALF_PI,0,HALF_PI]),
    bone('right_leg',[cube([50,18],[-16,6,0],[3,3,3])],[HALF_PI,0,PI])
  ] : [
    bone('main',[cube([0,22],[0,0,0],[16,16,6])]),
    bone('left_leg',[cube([50,0],[0,6,-16],[3,3,3])],[HALF_PI,0,0]),
    bone('right_leg',[cube([50,12],[-16,6,-16],[3,3,3])],[HALF_PI,0,THREE_HALF_PI])
  ] }
}

export function nativeBedPieceMatrix (facing) {
  if (!Object.hasOwn(FACING_Y_ROT,facing)) throw Error('NATIVE_BED_FACING_INVALID')
  const matrix = new THREE.Matrix4().makeTranslation(0,0.5625,0)
  matrix.multiply(new THREE.Matrix4().makeRotationX(Math.PI/2))
  matrix.multiply(new THREE.Matrix4().makeTranslation(0.5,0.5,0.5))
  matrix.multiply(new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(180+FACING_Y_ROT[facing])))
  matrix.multiply(new THREE.Matrix4().makeTranslation(-0.5,-0.5,-0.5))
  return matrix
}

async function decodeTexture (bytes) {
  const url = URL.createObjectURL(new Blob([bytes],{ type:'image/png' }))
  try { return await new THREE.TextureLoader().loadAsync(url) } finally { URL.revokeObjectURL(url) }
}

export async function createNativeBedTemplate (reader,state,{ loadTexture=decodeTexture }={}) {
  const bed = nativeBedState(state)
  if (!(reader instanceof NativeAssetReader) || reader.manifest.clientJarSha256 !== ENTITY_MODEL_CLIENT_SHA256) throw Error('NATIVE_BED_SOURCE_UNSUPPORTED')
  const path = `assets/minecraft/textures/entity/bed/${bed.color}.png`
  const bytes = await reader.bytes(path)
  const png = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
  if (bytes.length < 33 || [137,80,78,71,13,10,26,10].some((value,i)=>bytes[i]!==value) ||
      png.getUint32(8)!==13 || png.getUint32(16)!==64 || png.getUint32(20)!==64) throw Error('NATIVE_BED_TEXTURE_INVALID')
  const texture = await loadTexture(bytes)
  if (!texture?.isTexture || texture.image?.width!==64 || texture.image?.height!==64) {
    texture?.dispose?.(); throw Error('NATIVE_BED_TEXTURE_DECODE_INVALID')
  }
  texture.flipY=true; texture.colorSpace=THREE.SRGBColorSpace
  texture.magFilter=THREE.NearestFilter; texture.minFilter=THREE.NearestFilter; texture.generateMipmaps=false
  // Original RenderType.entitySolid: opaque and front faces. The current scene
  // lightmap has not been matched, so the material is not a pixel parity claim.
  const material=new THREE.MeshLambertMaterial({map:texture,side:THREE.FrontSide,transparent:false})
  const model=createNativeModelPart(nativeBedLayer(bed.part),material,[64,64]), root=new THREE.Group(), piece=new THREE.Group()
  // The shared scene places all templates at block center; renderPiece uses
  // block origin, so compensate the host convention exactly once.
  root.position.set(-0.5,-0.5,-0.5); piece.matrixAutoUpdate=false; piece.matrix.copy(nativeBedPieceMatrix(bed.facing))
  piece.add(model.root); root.add(piece); root.updateMatrixWorld(true)
  const assetInfo={kind:'native-bed-renderer',path,sha256:reader.manifest.assets[path].sha256,clientJarSha256:ENTITY_MODEL_CLIENT_SHA256,
    color:bed.color,part:bed.part,facing:bed.facing,renderType:'entitySolid',worldLightingParityVerified:false,pixelParityVerified:false}
  root.userData.nativeBed=assetInfo
  let disposed=false
  return {root,assetInfo,dispose(){if(disposed)return;disposed=true;root.removeFromParent();model.dispose();material.dispose();texture.dispose();root.clear()}}
}
