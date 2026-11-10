import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
const source=path.dirname(fileURLToPath(import.meta.url));
const profile=option('--profile'),jdk=option('--jdk');
assert(profile&&jdk,'Usage: node build.mjs --profile <NeoForge 1.21.1 directory> --jdk <JDK21> [--out <external artifact directory>]');
const output=path.resolve(option('--out')??await fs.mkdtemp(path.join(os.tmpdir(),'mcvisual-voice-activity-')));
const repo=path.resolve(source,'../..');
assert(!output.startsWith(repo+path.sep),'Keep generated JARs outside the source repository');
const libraries=path.join(profile,'libraries');
async function jarsAt(dir){const result=[];for(const row of await fs.readdir(dir,{withFileTypes:true})){const name=path.join(dir,row.name);if(row.isDirectory())result.push(...await jarsAt(name));else if(row.name.endsWith('.jar')&&!row.name.includes('natives'))result.push(name);}return result;}
const voice=(await fs.readdir(path.join(profile,'mods'))).filter(name=>/^voicechat-neoforge-1\.21\.1-2\.6\./.test(name)&&name.endsWith('.jar'));
assert.equal(voice.length,1,'One explicit SVC 2.6.x NeoForge 1.21.1 dependency is required');
const dependencies=[path.join(profile,'mods',voice[0])];
for(const dir of ['net/neoforged/fancymodloader/loader','net/neoforged/mergetool','org/lwjgl/lwjgl','org/lwjgl/lwjgl-openal']){
 const jars=await jarsAt(path.join(libraries,dir));assert.equal(jars.length,1,'Choose a single client dependency for '+dir);dependencies.push(jars[0]);
}
const binary=name=>path.join(jdk,'bin',name+(process.platform==='win32'?'.exe':''));
const run=(name,argv)=>execFileSync(binary(name),argv,{windowsHide:true,encoding:'utf8'});
const classes=path.join(output,'classes'),tests=path.join(output,'tests'),cp=dependencies.join(path.delimiter);
await fs.mkdir(classes,{recursive:true});await fs.mkdir(tests,{recursive:true});
const names=['ActivityWindow.java','VoiceActivityMod.java','VoiceActivityPlugin.java'];
run('javac',['--release','21','-encoding','UTF-8','-cp',cp,'-d',classes,...names.map(name=>path.join(source,name))]);
await fs.mkdir(path.join(classes,'META-INF'),{recursive:true});
await fs.copyFile(path.join(source,'neoforge.mods.toml'),path.join(classes,'META-INF/neoforge.mods.toml'));
const artifact=path.join(output,'mcvisual-voice-activity-0.1.0-neoforge.jar');
run('jar',['--create','--file',artifact,'-C',classes,'.']);
run('javac',['--release','21','-encoding','UTF-8','-cp',classes+path.delimiter+cp,'-d',tests,path.join(source,'ActivityWindowTest.java')]);
const check=run('java',['-ea','-cp',[tests,classes,cp].join(path.delimiter),'org.mcvisual.voiceactivity.ActivityWindowTest']).trim();
let deviceReplay = null;
if(args.includes('--device-replay')) {
 const nativeJars=dependencies.filter(file=>/lwjgl(?:-openal)?-\d/.test(path.basename(file))).map(file=>file.replace(/\.jar$/, '-natives-'+({win32:'windows',darwin:'macos',linux:'linux'}[process.platform])+(process.arch==='arm64'?'-arm64':'')+'.jar'));
 for(const file of nativeJars)assert(await fs.stat(file),'Installed native dependency missing');
 const deviceCp=[tests,classes,cp,...nativeJars].join(path.delimiter);
 run('javac',['--release','21','-encoding','UTF-8','-cp',deviceCp,'-d',tests,path.join(source,'NativeOpenALReplay.java')]);
 deviceReplay=run('java',['-ea','-cp',deviceCp,'org.mcvisual.voiceactivity.NativeOpenALReplay']).trim();
}
const hash=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
const report={artifact,sha256:await hash(artifact),check,deviceReplay,sources:await Promise.all([...names,'neoforge.mods.toml'].map(async name=>({name,sha256:await hash(path.join(source,name))})))};
await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
