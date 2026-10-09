// Original animation sheets stay intact. GPU UV transforms select frames;
// interpolation samples two original frames rather than rewriting PNG bytes.
export function animationFrames (meta, width, height) {
  const a = meta.animation
  const w = a.width ?? (a.height === undefined ? Math.min(width, height) : width)
  const h = a.height ?? (a.width === undefined ? Math.min(width, height) : height)
  if (![w, h, width / w, height / h].every(n => Number.isInteger(n) && n > 0)) throw Error('NATIVE_ANIMATION_DIMENSIONS_INVALID')
  const duration = a.frametime ?? 1, count = width / w * (height / h)
  if (!Number.isInteger(duration) || duration <= 0) throw Error('NATIVE_ANIMATION_TIME_INVALID')
  const frames = (a.frames?.length ? a.frames : Array.from({ length: count }, (_, i) => i)).map(value => typeof value === 'number' ? { index: value, time: duration } : { index: value.index, time: value.time ?? duration })
  if (!frames.every(f => Number.isInteger(f.index) && f.index >= 0 && f.index < count && Number.isInteger(f.time) && f.time > 0)) throw Error('NATIVE_ANIMATION_FRAME_INVALID')
  return { width, height, frameWidth: w, frameHeight: h, columns: width / w, frames, duration: frames.reduce((n, f) => n + f.time, 0), interpolate: a.interpolate === true }
}

export function frameAt (animation, ticks) {
  if (!Number.isFinite(ticks) || ticks < 0) throw Error('NATIVE_ANIMATION_CLOCK_INVALID')
  let within = ticks % animation.duration, index = 0
  while (within >= animation.frames[index].time) within -= animation.frames[index++].time
  const current = animation.frames[index], next = animation.frames[(index + 1) % animation.frames.length]
  const offset = n => [n % animation.columns * animation.frameWidth / animation.width, 1 - (Math.floor(n / animation.columns) + 1) * animation.frameHeight / animation.height]
  const a = offset(current.index), b = offset(next.index)
  return { index: current.index, nextIndex: next.index, offset: a, repeat: [animation.frameWidth / animation.width, animation.frameHeight / animation.height], nextDelta: b.map((n, i) => n - a[i]), blend: animation.interpolate ? Math.floor(within) / current.time : 0 }
}

export function applyFrame (texture, material, animation, ticks) {
  const frame = frameAt(animation, ticks)
  texture.repeat.set(...frame.repeat); texture.offset.set(...frame.offset); texture.updateMatrix()
  const uniforms = material.userData.nativeAnimationUniforms
  if (uniforms) { uniforms.nativeNextDelta.value.set(...frame.nextDelta); uniforms.nativeFrameBlend.value = frame.blend }
  material.userData.nativeAnimationFrame = frame.index
}

export function enableInterpolation (material, THREE) {
  const uniforms = { nativeNextDelta: { value: new THREE.Vector2() }, nativeFrameBlend: { value: 0 } }
  material.userData.nativeAnimationUniforms = uniforms
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms)
    // Minecraft interpolates integer RGB bytes and retains the current alpha.
    // Three's sRGB textures are decoded by the GPU, so undo that before mixing.
    shader.fragmentShader = `uniform vec2 nativeNextDelta;
uniform float nativeFrameBlend;
vec3 nativeEncodedBytes(vec3 c) {
  vec3 encoded = mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, c * 12.92, lessThanEqual(c, vec3(0.0031308)));
  return floor(clamp(encoded, 0.0, 1.0) * 255.0 + 0.5);
}
vec4 nativeInterpolatedPixel(vec4 current, vec4 next) {
  vec3 encoded = floor(mix(nativeEncodedBytes(current.rgb), nativeEncodedBytes(next.rgb), nativeFrameBlend) + 0.00001) / 255.0;
  vec3 linear = mix(pow((encoded + 0.055) / 1.055, vec3(2.4)), encoded / 12.92, lessThanEqual(encoded, vec3(0.04045)));
  return vec4(linear, current.a);
}
` + shader.fragmentShader
    const chunk = THREE.ShaderChunk.map_fragment
    if (!chunk.includes('vec4 sampledDiffuseColor = texture2D( map, vMapUv );')) throw Error('NATIVE_ANIMATION_SHADER_VERSION_UNSUPPORTED')
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', chunk)
    shader.fragmentShader = shader.fragmentShader.replace('vec4 sampledDiffuseColor = texture2D( map, vMapUv );', 'vec4 sampledDiffuseColor = nativeInterpolatedPixel(texture2D(map, vMapUv), texture2D(map, vMapUv + nativeNextDelta));')
  }
  material.customProgramCacheKey = () => 'native-original-sheet-interpolation-v1'
}
