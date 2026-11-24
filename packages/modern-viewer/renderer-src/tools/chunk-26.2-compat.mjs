import {readFile} from 'node:fs/promises';
// Extend only the chunk *implementation selector*. The exact 26.2 registry,
// state IDs, metadata and serialized body columns remain untouched.
export function patchChunkLoader262(source){const anchor="26.1: require('./pc/1.18/chunk')";if(!source.includes(anchor))throw Error('CHUNK_262_IMPLEMENTATION_ANCHOR_CHANGED');return source.replace(anchor,anchor+",\n    26.2: require('./pc/1.18/chunk')");}
export const chunk262Plugin={name:'exact-26.2-chunk-implementation',setup(build){build.onLoad({filter:/[\\/]prismarine-chunk[\\/]src[\\/]index\.js$/},async ({path})=>({contents:patchChunkLoader262(await readFile(path,'utf8')),loader:'js'}));}};
