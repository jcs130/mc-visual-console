import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const source=path.dirname(fileURLToPath(import.meta.url)),args=process.argv.slice(2);
const opt=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
const game=opt('--game-dir')&&path.resolve(opt('--game-dir'));
const jdk=opt('--java-home')&&path.resolve(opt('--java-home'));
const output=opt('--output-dir')&&path.resolve(opt('--output-dir'));
if(!game||!jdk||!output)throw Error('Use --game-dir <matching Fabric1.21.1> --java-home <JDK21> --output-dir <private artifacts>');
const walk=p=>fs.existsSync(p)?fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):e.name.endsWith('.jar')?[path.join(p,e.name)]:[]):[];
const mc=walk(path.join(game,'.fabric/remappedJars')).find(p=>p.includes('minecraft-1.21.1-')&&p.endsWith('client-intermediary.jar'));
const mods=walk(path.join(game,'.fabric/processedMods'));
if(!mc||!mods.some(p=>path.basename(p).startsWith('fabric-networking-api-v1-4.3.0+')))throw Error('Matching Minecraft/Fabric cache is required');
const cp=[mc,...mods,...walk(path.join(game,'libraries'))].join(path.delimiter);
fs.mkdirSync(output,{recursive:true});const scratch=fs.mkdtempSync(path.join(output,'director-')),classes=path.join(scratch,'classes');
fs.mkdirSync(classes);
const run=(tool,argv)=>execFileSync(path.join(jdk,'bin',tool+(process.platform==='win32'?'.exe':'')),argv,{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
const contract={'net.minecraft.class_634':['method_2874(java.lang.String)','method_45730(java.lang.String)'],
 'net.minecraft.class_638':['method_18456()'],'net.minecraft.class_315':['method_31043(net.minecraft.class_5498)'],
 'net.minecraft.class_5498':['field_26664','field_26665','field_26666'],
 'net.minecraft.class_4184':['method_19321(net.minecraft.class_1922, net.minecraft.class_1297, boolean, boolean, float)','method_19318(float)','method_19324(float, float, float)','field_18719'],
 'net.minecraft.class_1297':['method_5836(float)','method_36454()','method_23317()','method_23318()','method_23321()','method_35049()','method_5805()'],
 'net.minecraft.class_1297$class_5529':['field_26998'],
 'net.minecraft.class_1309':['method_29504()'],
 'net.minecraft.class_309':['method_1466(long, int, int, int, int)'],
 'net.minecraft.class_312':['method_1601(long, int, int, int)'],
 'net.minecraft.class_304':['method_1417(int, int)','method_1433(int)'],
 'net.minecraft.class_898':['method_3954(E, double, double, double, float, float, net.minecraft.class_4587, net.minecraft.class_4597, int)',
   'descriptor: (Lnet/minecraft/class_1297;DDDFFLnet/minecraft/class_4587;Lnet/minecraft/class_4597;I)V']};
for(const [type,names]of Object.entries(contract)){
 const shape=run('javap',['-p','-s','-classpath',cp,type]);
 for(const name of names)if(!shape.includes(name))throw Error('Native camera API missing: '+type+' '+name);
}
const sources=['DirectorPolicy.java','DroneFollow.java','TransitionEnvelope.java','FrameBlend.java','DroneCameraMixin.java','DirectorInputMixin.java','DirectorMouseMixin.java','ObserverBodyMixin.java','NativeDirectorClient.java','test/DirectorPolicyCheck.java','test/DroneFollowCheck.java','test/TransitionEnvelopeCheck.java'];
const argfile=path.join(scratch,'javac.args');
const quote=x=>'"'+x.replaceAll('\\','/').replaceAll('"','\\"')+'"';
fs.writeFileSync(argfile,['--release','21','-encoding','UTF-8','-proc:none','-classpath',cp,'-d',classes,...sources.map(p=>path.join(source,p))].map(quote).join('\n'));
run('javac',['@'+argfile]);
const checks=run('java',['-cp',classes+path.delimiter+cp,'DirectorPolicyCheck']);process.stdout.write(checks);
const droneChecks=run('java',['-cp',classes+path.delimiter+cp,'DroneFollowCheck']);process.stdout.write(droneChecks);
const transitionChecks=run('java',['-cp',classes+path.delimiter+cp,'TransitionEnvelopeCheck']);process.stdout.write(transitionChecks);
const metadata=JSON.parse(fs.readFileSync(path.join(source,'fabric.mod.json'),'utf8'));
const mixinConfig=JSON.parse(fs.readFileSync(path.join(source,'mcvisual-director.mixins.json'),'utf8'));
for(const entry of metadata.entrypoints.client)if(entry.startsWith(mixinConfig.package+'.'))
 throw Error('Entrypoint must not live under a Mixin-only package');
for(const mixin of mixinConfig.client)if(!fs.existsSync(path.join(classes,...(mixinConfig.package+'.'+mixin).split('.'))+'.class'))
 throw Error('Packaged Mixin class does not match its namespace');
fs.copyFileSync(path.join(source,'fabric.mod.json'),path.join(classes,'fabric.mod.json'));
fs.copyFileSync(path.join(source,'mcvisual-director.mixins.json'),path.join(classes,'mcvisual-director.mixins.json'));
const jar=path.join(output,metadata.id+'-'+metadata.version+'.jar');
run('jar',['--create','--file',jar,'-C',classes,'org','-C',classes,'fabric.mod.json','-C',classes,'mcvisual-director.mixins.json']);
// Recompile the consumer against the finished production JAR only.
const consumer=path.join(scratch,'consumer');fs.mkdirSync(consumer);
const consumerArgs=path.join(scratch,'consumer.args');
fs.writeFileSync(consumerArgs,['--release','21','-encoding','UTF-8','-proc:none','-classpath',jar,'-d',consumer,path.join(source,'test/DirectorPolicyCheck.java'),path.join(source,'test/DroneFollowCheck.java'),path.join(source,'test/TransitionEnvelopeCheck.java')].map(quote).join('\n'));
run('javac',['@'+consumerArgs]);const packagedChecks=run('java',['-cp',consumer+path.delimiter+jar,'DirectorPolicyCheck']);
process.stdout.write('Packaged consumer: '+packagedChecks);
const packagedDroneChecks=run('java',['-cp',consumer+path.delimiter+jar,'DroneFollowCheck']);process.stdout.write('Packaged consumer: '+packagedDroneChecks);
const packagedTransitionChecks=run('java',['-cp',consumer+path.delimiter+jar,'TransitionEnvelopeCheck']);process.stdout.write('Packaged consumer: '+packagedTransitionChecks);
for(const file of ['scene-policy.mjs','scene-policy.test.mjs','connection-recovery.mjs','connection-recovery.test.mjs'])fs.copyFileSync(path.join(source,file),path.join(output,file));
const sceneChecks=execFileSync(process.execPath,['--test',path.join(output,'scene-policy.test.mjs'),path.join(output,'connection-recovery.test.mjs')],{encoding:'utf8',windowsHide:true});
process.stdout.write(sceneChecks.split('\n').slice(-10).join('\n'));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const report={schema:'native-director-build/v1',at:new Date().toISOString(),version:metadata.version,
 matchingMinecraft:'1.21.1',artifact:jar,sha256:sha(fs.readFileSync(jar)),sources:sources.map(file=>({file,sha256:sha(fs.readFileSync(path.join(source,file)))})),
 nativeApiChecked:true,mixinNamespaceIsolated:true,policyChecks:checks.trim(),droneChecks:droneChecks.trim(),transitionChecks:transitionChecks.trim(),packagedConsumer:packagedChecks.trim(),packagedDroneConsumer:packagedDroneChecks.trim(),packagedTransitionConsumer:packagedTransitionChecks.trim(),
 scenePolicySha256:sha(fs.readFileSync(path.join(output,'scene-policy.mjs'))),connectionRecoverySha256:sha(fs.readFileSync(path.join(output,'connection-recovery.mjs'))),sceneChecks:sceneChecks.split('\n').slice(-10).join('\n').trim(),
 gameConnections:0,modelCalls:0,newPlayers:0,productionLoaded:false};
fs.writeFileSync(path.join(output,'build-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
