import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
test('an uninstalled custom catalog is explicitly unavailable and never fetched on reload',async()=>{
 const source=await readFile(new URL('../minecraft-viewer-sound.js',import.meta.url),'utf8');
 const start=source.indexOf('  const reloadCatalog = async () => {');const end=source.indexOf('  const reset =',start);
 let fetched=0,updated=0;
 const probe=runInNewContext(`let disposed=false,catalogRequest=0,customCatalog={old:true},catalogError=null;
 const manifest={optionalResources:{customBgm:false}};
 ${source.slice(start,end)}
 ({reloadCatalog,state:()=>({customCatalog,catalogError})})`,{fetch:()=>{fetched++;throw Error('must not fetch')},update:()=>updated++});
 assert.equal(await probe.reloadCatalog(),false);assert.equal(await probe.reloadCatalog(),false);
 assert.equal(fetched,0);assert.equal(updated,2);assert.equal(probe.state().customCatalog,null);assert.match(probe.state().catalogError,/未安装/);
});
