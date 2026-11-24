import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {atomicJson} from './atomic-json.mjs';
test('overlapping writes retain call order and complete JSON under concurrent readers',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'native-atomic-')),file=path.join(root,'state.json');await atomicJson(file,{sequence:0});
 let done=false,count=0;const reader=(async()=>{while(!done){assert.ok(Number.isInteger(JSON.parse(await fs.readFile(file,'utf8')).sequence));count++;await new Promise(r=>setTimeout(r,2));}})();
 try{for(let batch=0;batch<20;batch++)await Promise.all(Array.from({length:4},(_,i)=>atomicJson(file,{sequence:batch*4+i+1,padding:'x'.repeat(3000)})));}
 finally{done=true;await reader;}
 assert.ok(count>0);assert.equal(JSON.parse(await fs.readFile(file,'utf8')).sequence,80);assert.equal((await fs.readdir(root)).filter(n=>n.endsWith('.tmp')).length,0);
});
test('a failed destination cannot erase existing data or poison a later valid publication',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'native-atomic-failure-')),file=path.join(root,'state.json');await fs.mkdir(file);
 const started=performance.now();await assert.rejects(atomicJson(file,{secret:'not logged'}),{code:'EISDIR'});assert.ok(performance.now()-started<1000);
 assert.ok((await fs.stat(file)).isDirectory());
 const valid=path.join(root,'valid.json');await atomicJson(valid,{ok:true});assert.deepEqual(JSON.parse(await fs.readFile(valid,'utf8')),{ok:true});
});
