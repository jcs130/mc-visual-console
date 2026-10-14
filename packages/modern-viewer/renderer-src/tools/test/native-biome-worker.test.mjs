import test from 'node:test';
import assert from 'node:assert/strict';
import {installNativeBiomes,nativeBiomeTint,resetNativeBiomes} from '../native-biome-worker.mjs';
test('native biome IDs and actual RGB reach the mesher without vanilla replacement',()=>{
 resetNativeBiomes();const row={id:1024,name:'test:alpine',colors:{grass:0x123456,foliage:0xabcdef,water:0x010203}};
 const cache=installNativeBiomes(JSON.stringify({agentMcBiomes:{protocol:'agent-mc-native-biomes/v1',entries:[row]}}),{1:{name:'plains'}});
 assert.equal(cache[1024].name,'test:alpine');assert.equal(cache[1].name,'plains');assert.deepEqual(nativeBiomeTint('grass','test:alpine'),[0x12/255,0x34/255,0x56/255]);
 resetNativeBiomes();assert.equal(nativeBiomeTint('grass','test:alpine'),undefined);
 assert.throws(()=>installNativeBiomes({agentMcBiomes:{protocol:'bad',entries:[]}},{}));
 assert.throws(()=>installNativeBiomes({agentMcBiomes:{protocol:'agent-mc-native-biomes/v1',entries:[{...row,colors:{...row.colors,grass:-1}}]}},{}));
});
