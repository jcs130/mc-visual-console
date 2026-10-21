import * as THREE from 'three'
import { unzlibSync } from 'fflate'
import atlas from './native-vanilla-item-atlas.json' with { type: 'json' }

export const NATIVE_GLINT_TEXTURE = 'assets/minecraft/textures/misc/enchanted_glint_item.png'
export const NATIVE_GLINT_SHA256 = '23831803126a3b75e74deeb5a5e39df9a26c94872d20533f444eb5072b417fb5'
export const NATIVE_GLINT_SHADERS = Object.freeze({
  'assets/minecraft/shaders/core/rendertype_glint.vsh': '0a9422faa9b69d3f309e687e18b29810e6ee370fe983edeeccb552f0a0e43906',
  'assets/minecraft/shaders/core/rendertype_glint.fsh': '853e4835c61e5a3ab61029ab2b5a9896b3f16cc985b56ff61c54a28282914243',
  'assets/minecraft/shaders/core/rendertype_glint.json': '02d3cbbe2e716586074a2c000ad50e8955ccae027979b8b794a99e4c0bcf7c94'
})
const verified = new WeakSet(), pending = new WeakMap()
// The two original Item/Shield atlas layouts are produced by the locked
// client's actual Stitcher. Never stretch a per-file UV over the glint texture.
export function nativeGlintSprite (reader, path) {
  if (!verified.has(reader)) {
    const m = reader?.manifest
    if (m?.minecraftVersion !== '1.21.1' || m.clientJarSha256 !== atlas.clientSha256 || m.assetIntegrityVerified !== true ||
        !m.sources?.some(row => row.sha256 === atlas.clientSha256) || m.sources.some(row =>
          row.sha256 !== atlas.clientSha256 && row.sha256 !== 'dc6b5b45a405a3c2bc81df6c62745027be2df4c9e1f982cf714bebed25e20cdd')) throw Error('NATIVE_GLINT_ATLAS_SOURCE_UNVERIFIED')
    for (const [name, hash] of Object.entries(atlas.files)) if (m.assets[name]?.sha256 !== hash || m.assets[name]?.variants?.length) throw Error('NATIVE_GLINT_ATLAS_INPUT_CHANGED')
    for (const name of Object.keys(m.assets)) if (/^assets\/minecraft\/textures\/(block|item|entity\/conduit|entity\/shield)\/.*\.png$/.test(name) && !Object.hasOwn(atlas.files,name)) throw Error('NATIVE_GLINT_ATLAS_INPUT_CHANGED')
    verified.add(reader)
  }
  const row = atlas.sprites[path]
  if (!row) throw Error('NATIVE_GLINT_SPRITE_UNAVAILABLE')
  return row
}

// Only the SHA-checked original RGB8 glint PNG reaches this small decoder.
// It is not a general decoder for untrusted/world images.
function originalGlintPixels (bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), width = view.getUint32(16), height = view.getUint32(20)
  if (width !== 128 || height !== 128 || bytes[24] !== 8 || bytes[25] !== 2 || bytes[28] !== 0) throw Error('NATIVE_GLINT_PNG_INVALID')
  const chunks = []; let length = 0
  for (let at = 8; at + 12 <= bytes.length;) {
    const size = view.getUint32(at), kind = String.fromCharCode(...bytes.subarray(at + 4, at + 8))
    if (at + 12 + size > bytes.length) throw Error('NATIVE_GLINT_PNG_INVALID')
    if (kind === 'IDAT') { chunks.push(bytes.subarray(at + 8, at + 8 + size)); length += size }
    at += size + 12
  }
  const compressed = new Uint8Array(length); let at = 0
  for (const chunk of chunks) { compressed.set(chunk, at); at += chunk.length }
  const raw = unzlibSync(compressed), stride = width * 3, rgb = new Uint8Array(stride * height), pixels = new Uint8Array(width * height * 4)
  if (raw.length !== (stride + 1) * height) throw Error('NATIVE_GLINT_PNG_INVALID')
  const paeth = (a, b, c) => { const p = a + b - c, x = Math.abs(p-a), y = Math.abs(p-b), z = Math.abs(p-c); return x <= y && x <= z ? a : y <= z ? b : c }
  for (let y = 0; y < height; y++) {
    const filter = raw[y*(stride+1)]; if (filter > 4) throw Error('NATIVE_GLINT_PNG_INVALID')
    for (let x = 0; x < stride; x++) {
      const n = y*stride+x, a = x >= 3 ? rgb[n-3] : 0, b = y ? rgb[n-stride] : 0, c = y && x >= 3 ? rgb[n-stride-3] : 0
      rgb[n] = raw[y*(stride+1)+x+1] + (filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a+b)/2) : paeth(a,b,c))
    }
  }
  for (let n = 0; n < width*height; n++) { pixels.set(rgb.subarray(n*3,n*3+3),n*4); pixels[n*4+3] = 255 }
  return { width, height, pixels }
}

export async function prepareNativeGlint (reader) {
  nativeGlintSprite(reader, 'assets/minecraft/textures/item/iron_sword.png')
  if (!pending.has(reader)) pending.set(reader, (async () => {
    if (reader.manifest.assets[NATIVE_GLINT_TEXTURE]?.sha256 !== NATIVE_GLINT_SHA256) throw Error('NATIVE_GLINT_TEXTURE_UNVERIFIED')
    for (const [path, hash] of Object.entries(NATIVE_GLINT_SHADERS)) {
      if (reader.manifest.assets[path]?.sha256 !== hash) throw Error('NATIVE_GLINT_SHADER_UNVERIFIED')
      await reader.bytes(path)
    }
    const bytes = await reader.bytes(NATIVE_GLINT_TEXTURE), image = originalGlintPixels(bytes)
    return { ...image, sprites: atlas.sprites, source: 'original_1.21.1_glint_shader_and_stitched_uv', texturePath: NATIVE_GLINT_TEXTURE,
      textureSha256: NATIVE_GLINT_SHA256, atlasSource: atlas.source, speed: .5, strength: .75, pixelParityVerified: false }
  })())
  return pending.get(reader)
}

// RenderStateShard.setupGlintTexturing: T(-t/110000,t/30000) Rz(10deg) S(8).
// SRC_COLOR, ONE / ZERO, ONE preserves destination alpha. Viewer defaults match
// the original speed .5 and strength .75; no extra clock/model calls are made.
export function nativeGlintMatrix (now, speed = .5) {
  if (!Number.isFinite(now) || now < 0 || !Number.isFinite(speed) || speed < 0 || speed > 1) throw Error('NATIVE_GLINT_CLOCK_INVALID')
  const t = Math.trunc(now * speed * 8), f = Math.fround, angle = f(.17453292), c = f(Math.cos(angle)), s = f(Math.sin(angle))
  return new THREE.Matrix3().set(f(c*8), f(-s*8), f(-f(t%110000)/110000), f(s*8), f(c*8), f(f(t%30000)/30000), 0, 0, 1)
}

const GLSL = `uniform sampler2D nativeGlintTexture; uniform mat3 nativeGlintMatrix; uniform vec4 nativeGlintAtlas;
  vec3 nativeFoil(vec2 uv){vec2 originalUV=nativeGlintAtlas.xy+vec2(uv.x,1.0-uv.y)*nativeGlintAtlas.zw;
    vec2 g=(nativeGlintMatrix*vec3(originalUV,1.0)).xy; vec4 c=texture2D(nativeGlintTexture,g);
    return c.a<0.1?vec3(0.0):pow(c.rgb*0.75,vec3(2.0));}`
export function installNativeGlintMaterial (material, glint, sprite) {
  if (!material?.isShaderMaterial || !glint?.pixels || !Array.isArray(sprite) || sprite.length !== 6) throw Error('NATIVE_GLINT_MATERIAL_INVALID')
  if (!material.fragmentShader.includes('gl_FragColor=vec4(c.rgb*nativeTint,c.a);')) throw Error('NATIVE_GLINT_SHADER_UNSUPPORTED')
  const [x,y,w,h,aw,ah] = sprite
  const texture = new THREE.DataTexture(glint.pixels,glint.width,glint.height,THREE.RGBAFormat)
  texture.colorSpace = THREE.NoColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.magFilter = texture.minFilter = THREE.LinearFilter; texture.generateMipmaps = false; texture.flipY = false; texture.needsUpdate = true
  Object.assign(material.uniforms, { nativeGlintTexture: { value: texture }, nativeGlintMatrix: { value: nativeGlintMatrix(Date.now()) },
    nativeGlintAtlas: { value: new THREE.Vector4(x/aw,y/ah,w/aw,h/ah) } })
  material.fragmentShader = GLSL + '\n' + material.fragmentShader.replace('gl_FragColor=vec4(c.rgb*nativeTint,c.a);', 'gl_FragColor=vec4(c.rgb*nativeTint+nativeFoil(nativeUV),c.a);')
  material.userData.nativeGlint = { source: glint.source, texture, pixelParityVerified: false }
  material.addEventListener('dispose', () => texture.dispose())
  material.userData.updateNativeGlint = now => material.uniforms.nativeGlintMatrix.value.copy(nativeGlintMatrix(now))
  material.needsUpdate = true
}
