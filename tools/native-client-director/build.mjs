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
 'net.minecraft.class_5498':['field_26664','field_26665','field_26666']};
for(const [type,names]of Object.entries(contract)){
 const shape=run('javap',['-p','-classpath',cp,type]);
 for(const name of names)if(!shape.includes(name))throw Error('Native camera API missing: '+type+' '+name);
}
const sources=['DirectorPolicy.java','NativeDirectorClient.java','test/DirectorPolicyCheck.java'];
const argfile=path.join(scratch,'javac.args');
const quote=x=>'"'+x.replaceAll('\\','/').replaceAll('"','\\"')+'"';
fs.writeFileSync(argfile,['--release','21','-encoding','UTF-8','-proc:none','-classpath',cp,'-d',classes,...sources.map(p=>path.join(source,p))].map(quote).join('\n'));
run('javac',['@'+argfile]);
const checks=run('java',['-cp',classes+path.delimiter+cp,'DirectorPolicyCheck']);process.stdout.write(checks);
const metadata=JSON.parse(fs.readFileSync(path.join(source,'fabric.mod.json'),'utf8'));
fs.copyFileSync(path.join(source,'fabric.mod.json'),path.join(classes,'fabric.mod.json'));
const jar=path.join(output,metadata.id+'-'+metadata.version+'.jar');
run('jar',['--create','--file',jar,'-C',classes,'org','-C',classes,'fabric.mod.json']);
// Recompile the consumer against the finished production JAR only.
const consumer=path.join(scratch,'consumer');fs.mkdirSync(consumer);
const consumerArgs=path.join(scratch,'consumer.args');
fs.writeFileSync(consumerArgs,['--release','21','-encoding','UTF-8','-proc:none','-classpath',jar,'-d',consumer,path.join(source,'test/DirectorPolicyCheck.java')].map(quote).join('\n'));
run('javac',['@'+consumerArgs]);const packagedChecks=run('java',['-cp',consumer+path.delimiter+jar,'DirectorPolicyCheck']);
process.stdout.write('Packaged consumer: '+packagedChecks);
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const report={schema:'native-director-build/v1',at:new Date().toISOString(),version:metadata.version,
 matchingMinecraft:'1.21.1',artifact:jar,sha256:sha(fs.readFileSync(jar)),sources:sources.map(file=>({file,sha256:sha(fs.readFileSync(path.join(source,file)))})),
 nativeApiChecked:true,policyChecks:checks.trim(),packagedConsumer:packagedChecks.trim(),
 gameConnections:0,modelCalls:0,newPlayers:0,productionLoaded:false};
fs.writeFileSync(path.join(output,'build-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
