import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';
const queues=new Map();
/** Publish prepared bytes atomically, in call order per file. Never truncate or remove the destination. */
export async function atomicJson(file,value){
 const target=path.resolve(file),bytes=JSON.stringify(value,null,2),previous=queues.get(target);
 const job=(previous?.catch(()=>{})??Promise.resolve()).then(()=>publish(target,bytes));queues.set(target,job);
 try{return await job;}finally{if(queues.get(target)===job)queues.delete(target);}
}
async function publish(file,bytes){
 await fs.mkdir(path.dirname(file),{recursive:true});
 const existing=await fs.lstat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(existing?.isDirectory())throw Object.assign(Error('ATOMIC_JSON_DESTINATION_IS_DIRECTORY'),{code:'EISDIR'});
 const temp=file+'.'+process.pid+'.'+randomUUID()+'.tmp';
 await fs.writeFile(temp,bytes,{flag:'wx'});
 const end=performance.now()+5000;let attempt=0;
 try{for(;;){
  try{await fs.rename(temp,file);return;}
  catch(error){
   const remaining=end-performance.now();
   if(!['EPERM','EACCES','EBUSY'].includes(error.code)||remaining<=0)throw error;
   const delay=Math.min(remaining,([7,17,37,71,137,251][attempt++]??251)+Math.floor(Math.random()*13));
   await new Promise(resolve=>setTimeout(resolve,delay));
  }
 }}finally{await fs.unlink(temp).catch(()=>{});}
}
