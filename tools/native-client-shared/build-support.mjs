import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';

export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function buildContext(args,{mixinExtras=false}={}) {
 const option=(key,required=true)=>{const at=args.indexOf(key);if(at<0){if(required)throw Error('Explicit '+key+' required');return null;}if(!args[at+1])throw Error('Missing '+key);return args[at+1];};
 const loader=option('--loader',false)||'neoforge';if(!['fabric','neoforge'].includes(loader))throw Error('Supported loaders: fabric, neoforge');
 const jdk=option('--java-home'),out=path.resolve(option('--output-dir')),work=out+'/compile-'+randomUUID(),classes=work+'/classes',consumer=work+'/consumer';
 await fs.mkdir(classes,{recursive:true});await fs.mkdir(consumer,{recursive:true});
 const run=(tool,argv)=>execFileSync(path.join(jdk,'bin',tool+(process.platform==='win32'?'.exe':'')),argv,{windowsHide:true,encoding:'utf8',maxBuffer:4_000_000,env:{...process.env,JAVA_TOOL_OPTIONS:'-Duser.language=en -Duser.country=US'}});
 async function walk(dir){let values=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())values.push(...await walk(file));else if(e.name.endsWith('.jar'))values.push(file);}return values;}
 let files;
 if(loader==='fabric'){
  const game=path.resolve(option('--game-dir')),minecraft=await walk(game+'/.fabric/remappedJars'),mods=await walk(game+'/.fabric/processedMods');
  const client=minecraft.find(p=>p.includes('minecraft-1.21.1-')&&p.endsWith('client-intermediary.jar'));
  if(!client||!mods.some(p=>path.basename(p).startsWith('fabric-networking-api-v1-4.3.0+')))throw Error('Matching original Fabric 1.21.1/API cache required');
  files=[client,...mods,...await walk(game+'/libraries')];
 }else{
  const report=JSON.parse(await fs.readFile(option('--classpath-report'),'utf8'));
  if(!Array.isArray(report.classpath)||!report.classpath.length)throw Error('Original Mojmap Minecraft/NeoForge classpath required');
  files=[...report.classpath]; // Deliberately exclude report.artifact: no core companion.
 }
 const excluded=files.filter(p=>/^(?:agentmc|maw-client|mcvisual|cortico)[-_]/i.test(path.basename(p)));
 files=files.filter(p=>!excluded.includes(p));const runtimeDependencies=[];
 if(mixinExtras&&loader==='neoforge'){
  const universal=files.find(p=>/neoforge-[0-9.]+-universal\.jar$/.test(p));if(!universal)throw Error('Original NeoForge universal input required');
  const entries=run('jar',['--list','--file',universal]).split(/\r?\n/).filter(n=>/^META-INF\/jarjar\/mixinextras-neoforge-[0-9.]+\.jar$/.test(n));
  if(entries.length!==1)throw Error('Original NeoForge MixinExtras input required');
  execFileSync(path.join(jdk,'bin','jar'+(process.platform==='win32'?'.exe':'')),['--extract','--file',universal,entries[0]],{cwd:work,windowsHide:true});
  const extra=path.join(work,...entries[0].split('/'));files.push(extra);runtimeDependencies.push({owner:'NeoForge',embeddedIn:path.basename(universal),entry:entries[0],sha256:sha(await fs.readFile(extra)),compileOnly:true});
 }
 const cp=files.join(path.delimiter),records=[];
 async function sources(list,root){for(const file of list)records.push({file:path.relative(root,file).replaceAll('\\','/'),sha256:sha(await fs.readFile(file))});}
 async function compile(list,destination=classes,classpath=cp){
  const quote=s=>'"'+s.replaceAll('\\','/')+'"';const file=work+'/'+(destination===classes?'source':'consumer')+'.args';
  await fs.writeFile(file,['--release','21','-proc:none','-encoding','UTF-8','-classpath',classpath,'-d',destination,...list].map(quote).join('\n'));run('javac',['@'+file]);
 }
 return {loader,jdk,out,work,classes,consumer,files,cp,excluded,runtimeDependencies,run,compile,records,sources};
}
