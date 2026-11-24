// SPDX-License-Identifier: MIT
// Optional process adapter: content follows an existing client's lifetime. No
// process creation, camera commands, model calls, endpoint discovery or timers.
export function createContentOwner({pid,readWindow,isAlive,readEnabled=async()=>true,close,now=Date.now,maxAgeMs=15000}) {
 if(!Number.isSafeInteger(pid)||pid<=0||![readWindow,isAlive,readEnabled,close,now].every(f=>typeof f==='function')
  ||!Number.isFinite(maxAgeMs)||maxAgeMs<1000||maxAgeMs>60000)throw Error('explicit_content_owner_required');
 let stopped=false,busy=false,closing=null,state={phase:'owner_unconfirmed',ownerPid:pid};
 const stop=reason=>{
  if(!stopped){stopped=true;state={phase:reason,ownerPid:pid,stopped:true};closing=Promise.resolve().then(close);}
  return closing??Promise.resolve();
 };
 return {stats:()=>({...state}),stop,async tick(){
  if(stopped||busy)return{...state};busy=true;
  try{
   const [enabled,alive,window]=await Promise.all([readEnabled(),isAlive(pid),readWindow()]);
   if(stopped)return{...state};
   const time=now(),at=Date.parse(window?.recordedAt);
   const reason=enabled!==true?'owner_disabled':!alive?'owner_exited':window?.processId!==pid?'owner_replaced'
    :!Number.isFinite(at)||at>time||time-at>maxAgeMs?'owner_stale':null;
   if(reason){await stop(reason);return{...state};}
   return state={phase:'owner_verified',ownerPid:pid,checkedAt:time,stopped:false};
  }catch{if(!stopped)await stop('owner_unavailable');return{...state};}
  finally{busy=false;}
 }};
}
