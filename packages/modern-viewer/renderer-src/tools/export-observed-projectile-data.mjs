import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const base=new URL('../../asset-packs/vanilla-1.21.1/assets/minecraft/native/',import.meta.url);
const colorsBytes=await fs.readFile(new URL('client-item-colors.json',base));
const layersBytes=await fs.readFile(new URL('client-model-layers.json',base));
const hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(hash(colorsBytes),'21c83de83b6f57d38f93c0881edaa98a2d2c06ec8c14eceb260a79c380f9e936');
assert.equal(hash(layersBytes),'3571f2c6d4fbaa2e07db239853e0baf5db9dd07c5b66653cafa7588da466fbe3');
const colors=JSON.parse(colorsBytes),layers=JSON.parse(layersBytes);
const selected=Object.fromEntries(['llama_spit','shulker_bullet','wind_charge','wither_skull'].map(name=>{
 const key='minecraft:'+name+'#main';assert(layers.layers[key]);return[key,layers.layers[key]];
}));
const data={minecraftVersion:'1.21.1',clientJarSha256:colors.clientJarSha256,sourceHashes:{colors:hash(colorsBytes),layers:hash(layersBytes)},
 emptyPotionColor:colors.emptyPotionColor,items:colors.items,effects:colors.effects,potions:colors.potions,layers:selected};
await fs.writeFile(new URL('../src/modern-viewer/observed-projectile-data.json',import.meta.url),JSON.stringify(data)+'\n');
console.log('Exported original projectile layers and potion registries');
