import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const source=path.dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2),opt=(name)=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
const game=opt('--game-dir')&&path.resolve(opt('--game-dir')),jdk=opt('--java-home')&&path.resolve(opt('--java-home'));
const output=opt('--output-dir')&&path.resolve(opt('--output-dir'));
if(!game||!jdk||!output)throw Error('Use --game-dir <matching stopped Fabric 1.21.1> --java-home <JDK21> --output-dir <artifact directory>');
const walk=p=>fs.existsSync(p)?fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):e.name.endsWith('.jar')?[path.join(p,e.name)]:[]):[];
const mc=walk(path.join(game,'.fabric','remappedJars')).find(p=>p.includes('minecraft-1.21.1-')&&p.endsWith('client-intermediary.jar'));
const processed=walk(path.join(game,'.fabric','processedMods'));
if(!mc||!processed.some(p=>path.basename(p).startsWith('fabric-networking-api-v1-4.3.0+')))throw Error('Matching Minecraft 1.21.1 and Fabric networking API 4.3.0 inputs required');
const spectator=walk(path.join(game,'mods')).find(p=>path.basename(p)==='spectatorplus-fabric-1.2.1-mc1.21.jar');
if(!spectator)throw Error('Verified SpectatorPlus 1.2.1+mc1.21 compile-only input required');
const cp=[mc,...processed,spectator,...walk(path.join(game,'libraries'))].join(path.delimiter);
fs.mkdirSync(output,{recursive:true});const scratch=fs.mkdtempSync(path.join(output,'compile-')),classes=path.join(scratch,'classes');fs.mkdirSync(classes);
const run=(tool,argv)=>execFileSync(path.join(jdk,'bin',tool+(process.platform==='win32'?'.exe':'')),argv,{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
const contract={
 'com.hpfxd.spectatorplus.fabric.client.sync.ClientSyncController':['handle(com.hpfxd.spectatorplus.fabric.sync.packet.ClientboundHotbarSyncPacket, net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking$Context)'],
 'com.hpfxd.spectatorplus.fabric.client.sync.screen.ScreenSyncController':['handle(com.hpfxd.spectatorplus.fabric.sync.packet.ClientboundInventorySyncPacket, net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking$Context)'],
 'com.hpfxd.spectatorplus.fabric.sync.packet.ClientboundHotbarSyncPacket':['java.util.UUID playerId()','net.minecraft.class_1799[] items()'],
 'com.hpfxd.spectatorplus.fabric.sync.packet.ClientboundInventorySyncPacket':['java.util.UUID playerId()','net.minecraft.class_1799[] items()'],
 'net.minecraft.class_337':['method_1795(net.minecraft.class_2629)','method_1801()','field_2060'],
 'net.minecraft.class_2629':['method_34091(net.minecraft.class_2629$class_5881)'],
 'net.minecraft.class_329':['method_1757(net.minecraft.class_332, net.minecraft.class_266)']};
for(const [type,signatures]of Object.entries(contract)){const out=run('javap',['-p','-classpath',cp,type]);for(const signature of signatures)if(!out.includes(signature))throw Error('Native hook contract missing: '+type+' '+signature);}
const sources=['ObserverState.java','ObserverView.java','TargetInventory.java','BossBarState.java','NativeObserverClient.java','SpectatorHotbarMixin.java','SpectatorInventoryMixin.java','ObserverSidebarMixin.java','ObserverBossBarMixin.java','test/ObserverStateCheck.java'];
const argfile=path.join(scratch,'javac.args');fs.writeFileSync(argfile,['--release','21','-encoding','UTF-8','-proc:none','-classpath',cp,'-d',classes,...sources.map(p=>path.join(source,p))].map(x=>'"'+x.replaceAll('\\','/').replaceAll('"','\\"')+'"').join('\n'));
run('javac',['@'+argfile]);
const checks=run('java',['-cp',classes+path.delimiter+cp,'ObserverStateCheck']);process.stdout.write(checks);
const metadata=JSON.parse(fs.readFileSync(path.join(source,'fabric.mod.json'),'utf8'));
const mixins=JSON.parse(fs.readFileSync(path.join(source,'mcvisual-native-observer.mixins.json'),'utf8'));
for(const name of mixins.client)if(!fs.existsSync(path.join(classes,...mixins.package.split('.'),name+'.class')))throw Error('Missing declared Mixin '+name);
const jar=path.join(output,metadata.id+'-'+metadata.version+'.jar');
run('jar',['--create','--file',jar,'-C',classes,'org','-C',source,'fabric.mod.json','-C',source,'mcvisual-native-observer.mixins.json','-C',source,'assets']);
// The consumer can see only the packaged production classes, not their compile directory.
const consumer=path.join(scratch,'consumer');fs.mkdirSync(consumer);
fs.copyFileSync(path.join(classes,'ObserverStateCheck.class'),path.join(consumer,'ObserverStateCheck.class'));
const consumerChecks=run('java',['-cp',[consumer,jar,...walk(path.join(game,'libraries')).filter(p=>path.basename(p).startsWith('gson-'))].join(path.delimiter),'ObserverStateCheck']);
if(consumerChecks.trim()!==checks.trim())throw Error('Packaged consumer did not reproduce protocol/display checks');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
let commit=null;try{commit=execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8',windowsHide:true}).trim();}catch{}
const evidence={schema:'mcvisual-native-observer-build/v1',at:new Date().toISOString(),minecraft:'1.21.1',jdk:run('java',['--version']).split(/\r?\n/)[0],
 sourceCommit:commit,sourceHashes:Object.fromEntries([...sources,'build.mjs','fabric.mod.json','mcvisual-native-observer.mixins.json','assets/mcvisual-native-observer/lang/zh_cn.json','assets/mcvisual-native-observer/lang/en_us.json'].map(p=>[p,sha(path.join(source,p))])),
 minecraftJarSha256:sha(mc),spectatorPlusJarSha256:sha(spectator),fabricNetworkingSha256:sha(processed.find(p=>path.basename(p).startsWith('fabric-networking-api-v1-4.3.0+'))),
 jar,jarSha256:sha(jar),nativeHookContracts:true,checks:checks.trim(),packagedConsumerChecks:consumerChecks.trim(),gameConnections:0,clientLaunched:false,installed:false,renderVerified:false};
fs.writeFileSync(jar+'.provenance.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({jar,sha256:evidence.jarSha256,checks:evidence.checks,installed:false,clientLaunched:false}));
