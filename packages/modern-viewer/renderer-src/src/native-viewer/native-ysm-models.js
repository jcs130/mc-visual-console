// Locked, original CC0 YSM 2.6.5 assets. Native model/texture IDs, never aliases.
const profile = (id, name, textures, hashes, geometry, absentClips = []) => {
  const prefix = `assets/yes_steve_model/builtin/${id}/`
  const assets = { definition: prefix + 'ysm.json', model: prefix + 'models/main.json',
    animation: prefix + 'animations/main.animation.json', ...Object.fromEntries(textures.map(id => [id, prefix + `textures/${id}.png`])) }
  return Object.freeze({ id, name, geckoFormatVersion: ['misc/1_alex', 'misc/2_steve'].includes(id) ? 2 : null,
    textures: Object.freeze(textures), assets: Object.freeze(assets), hashes: Object.freeze(hashes),
    geometry: Object.freeze(geometry), absentClips: Object.freeze(absentClips) })
}
export const NATIVE_YSM_MODELS = Object.freeze({
  'misc/1_alex': profile('misc/1_alex', 'Alex', ['gsl'], {
    definition: '3e7a6270c4a2973b900f0509f199444fe78052f414c27d2f6d4f33b1176b626d',
    model: 'e6116e2e01f0a3e5a86105caa933afc60687b5e4b7571d27fb0708908fb7f783',
    animation: 'e4736d2062ba7d9deedd72430e459a9d8963c975d1982e1fbf2b0f8c9e84abca',
    gsl: 'b93dcdb3acd5fd1269118048099720f38484460f3b756314822fca954b3b1668'
  }, { textureSize: 64, bones: 61, cubes: 47, faces: 264, idleBones: null }, ['idle', 'parallel0', 'parallel1']),
  'misc/2_steve': profile('misc/2_steve', 'Steve', ['tartaric_acid'], {
    definition: '82140d02f22ad772cedea0caf273cf7b58d5643b74a7f22746fbef186303164d',
    model: '568a7e2dad1656d839ca6c81f27e5b97236aa6d3c4ed241af6947fa90b1e08dc',
    animation: 'd03d0cdfdb80e0d02fc927945128abc770b77aea54f1ed719255206086ae3295',
    tartaric_acid: 'bd1f4877e31c18412f5ea5d2ed54953c472c23480d541856f977da3cf9b8e7fb'
  }, { textureSize: 64, bones: 61, cubes: 46, faces: 258, idleBones: 16 }, ['parallel0', 'parallel1']),
  'misc/3_default_boy': profile('misc/3_default_boy', 'Default Boy', ['blue', 'red'], {
    definition: 'dfd4fae1b37261bf41ca9fbb6c35cc78adfb0b5baea0b2c73b76c86fe812f907',
    model: '28ee6898bfef37fa3cf4a6e4f34bafe721782a4cff2b2cfd66dfb0b97963b34a',
    animation: '5542bec68f8d35d14120cae85e96785708623e8b315dca550e95025c6084f0dc',
    blue: 'ff7872dfbdd72d2453fec5ad1903272a119ec0c2b9b28482c1bb27787972a4c0',
    red: '5a667b5fae29820c86646e01d7197b0db99c491ce7127ce0bcbe082fef28f4d6'
  }, { textureSize: 128, bones: 58, cubes: 156, faces: 936, idleBones: 15 })
})
export const nativeYsmModelProfile = modelId => Object.hasOwn(NATIVE_YSM_MODELS, modelId) ? NATIVE_YSM_MODELS[modelId] : null
