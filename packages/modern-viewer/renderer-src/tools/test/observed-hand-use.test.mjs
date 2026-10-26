import test from 'node:test';
import assert from 'node:assert/strict';
import {observedHandUse} from '../../src/modern-viewer/observed-hand-use.js';
import {PaperYsmPlayers} from '../../src/modern-viewer/paper-ysm.js';
const equipment=[{name:'iron_sword'},{name:'shield'}];
test('possession, actual offhand/mainhand use, release, eating and death are distinct',()=>{
 assert.equal(observedHandUse({equipment,metadata:{8:0}}).shieldRaised,false);
 assert.equal(observedHandUse({equipment,metadata:{8:3}}).shieldHand,'offhand');
 assert.equal(observedHandUse({equipment:[{name:'shield'},null],metadata:{8:1}}).shieldHand,'mainhand');
 assert.equal(observedHandUse({equipment:[{name:'bread'},{name:'shield'}],metadata:{8:1}}).shieldRaised,false);
 assert.equal(observedHandUse({equipment,bodyState:{canAct:false}},{shieldRaised:true}).shieldRaised,false);
 assert.equal(observedHandUse({equipment},{shieldRaised:true,offhand:null}).shieldRaised,false);
 assert.equal(observedHandUse({equipment},{shieldRaised:false,usingHeldItem:false}).shieldRaised,false);
});
test('own shield start, release and swap reach YSM motion; remote metadata remains independent',()=>{
 const uuid='00000000-0000-3000-8000-000000000001',entity={id:7,uuid,equipment,metadata:{8:0}};
 const p=new PaperYsmPlayers({entity:()=>entity});p.states.set(uuid,{entityId:7,epoch:'a'});
 p.bodyMotion({entity,shieldRaised:true,usingHeldItem:true,usingOffhand:false},1000);
 assert.equal(p.motionFor(uuid,entity,1001).usingItem,true);assert.equal(p.motionFor(uuid,entity,1001).activeHand,'offhand');
 p.bodyMotion({entity,shieldRaised:false,usingHeldItem:false},1100);
 assert.equal(p.motionFor(uuid,entity,1101).usingItem,false);
 entity.metadata[8]=3;assert.equal(p.motionFor(uuid,entity,1900).activeHand,'offhand');
 assert.equal(p.motionFor(uuid,entity,1900).usingItem,true);
 p.bodyMotion({entity,shieldRaised:true,offhand:null},2000);assert.equal(p.motionFor(uuid,entity,2001).shieldRaised,false);p.clear();
});
