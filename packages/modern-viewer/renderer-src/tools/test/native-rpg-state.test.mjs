import test from 'node:test'
import assert from 'node:assert/strict'
import {projectNativeRpgSkills,nativeRpgSummary} from '../../src/native-viewer/native-rpg-state.js'
import {publicSpectatorPresentation} from '../../host/spectator-public.mjs'
import {nativeExtensionSupport} from '../../src/native-viewer/native-survival-ui.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import {tmpdir} from 'node:os'
import {pathToFileURL} from 'node:url'
import {buildSpectatorSite} from '../build-native-spectator-site.mjs'
const uuid='01234567-89ab-3def-8123-456789abcdef',other='11111111-1111-3111-8111-111111111111'
const state=()=>({schemaVersion:1,playerUuid:uuid,keepInventory:true,mana:{current:15,max:24},
 rpg:{available:true,backend:'vortex',combat:'ranger',className:'游侠',level:4,xp:120,nextLevelXp:400,skillPoints:2,
 talents:{available:true,points:1,allocated:{RANGER:['keen_eye']}},economy:{available:true,balance:50},party:{available:true,inParty:true,members:[uuid,other]},password:'secret',token:'secret'},
 abilities:[{id:'mycli:starbolt',name:'星芒箭',manaCost:4,cooldownRemainingMs:null}]})
test('native RPG fields remain distinct from vanilla XP and unknown cooldowns',()=>{
 const s=projectNativeRpgSkills(state(),uuid),summary=nativeRpgSummary(s)
 assert.match(summary,/游侠 · RPG Lv.4/);assert.match(summary,/累计经验 120/);assert.match(summary,/升级还需 400/);assert.doesNotMatch(summary,/120\/400/);assert.match(summary,/学习点 2/)
 assert.match(summary,/天赋点 1/);assert.match(summary,/金币 50/);assert.match(summary,/队伍 2 人/);assert.match(summary,/死亡保留/)
 assert.equal(s.abilities[0].cooldownRemainingMs,null);assert.equal('experienceLevel'in s.rpg,false)
})
test('public RPG projection strips unrelated secrets and rejects another body',()=>{
 const s=state(),pub=publicSpectatorPresentation({playerUuid:uuid,skills:s,self:{experienceLevel:91}})
 assert.equal(pub.self.experienceLevel,91);assert.equal(pub.skills.rpg.level,4)
 assert.doesNotMatch(JSON.stringify(pub),/secret|password|token/)
 assert.equal(projectNativeRpgSkills(s,other),null)
 assert.equal(publicSpectatorPresentation({playerUuid:other,skills:s}).skills,null)
})
test('missing backend/readings clear old class instead of inventing zero',()=>{
 assert.equal(projectNativeRpgSkills(null,uuid),null)
 const s=projectNativeRpgSkills({...state(),rpg:{available:false}},uuid)
 assert.equal(nativeRpgSummary(s),'RPG 数据暂未同步')
 assert.equal(s.rpg.level,undefined)
 assert.deepEqual(nativeExtensionSupport({available:true,skills:s}),{skills:true,mana:true})
 const x=state();x.rpg.level=NaN;x.mana.current=Infinity
 assert.equal(projectNativeRpgSkills(x,uuid).rpg.level,null);assert.equal(projectNativeRpgSkills(x,uuid).mana,null)
})
test('projection is bounded, repeatable at cloud fanout and carries no raw profile',()=>{
 const x=state();x.abilities=Array.from({length:300},()=>({id:'test:skill',name:'长'.repeat(1000),cooldownMs:1000}))
 x.rpg.party.members=Array(300).fill(uuid)
 const s=projectNativeRpgSkills(x,uuid)
 assert.equal(s.abilities.length,64);assert.equal(s.abilities[0].name.length,128);assert.equal(s.rpg.party.members.length,8)
 assert.deepEqual(projectNativeRpgSkills(s,uuid),s);assert.ok(Buffer.byteLength(JSON.stringify(s))<40000)
})
test('portable spectator artifact includes its RPG module and preserves public native RPG data',async()=>{
 const workspace=path.resolve(tmpdir()),dir=await fs.mkdtemp(path.join(workspace,'.tmp-rpg-site-'))
 try{
  const manifest=await buildSpectatorSite(dir);assert.ok(manifest.files['native-console.js'].bytes>0)
  const module=await import(pathToFileURL(path.join(dir,'spectator-public.mjs')).href)
  assert.equal(module.publicSpectatorPresentation({playerUuid:uuid,skills:state()}).skills.rpg.level,4)
  assert.ok((await fs.readFile(path.join(dir,'native-rpg-state.js'),'utf8')).includes('projectNativeRpgSkills'))
 }finally{assert(dir.startsWith(workspace+path.sep+'.tmp-rpg-site-'));await fs.rm(dir,{recursive:true,force:true})}
})
