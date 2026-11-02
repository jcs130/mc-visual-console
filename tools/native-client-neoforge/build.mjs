import fs from'node:fs/promises';import path from'node:path';import{fileURLToPath,pathToFileURL}from'node:url';import{execFileSync}from'node:child_process';import{createHash,randomUUID}from'node:crypto';
const dir=path.dirname(fileURLToPath(import.meta.url)),args=process.argv.slice(2),opt=n=>args[args.indexOf(n)+1];
for(const n of['--platform-report','--mapper','--mappings','--java-home','--output-dir'])if(!args.includes(n))throw Error('Required explicit input '+n);
const platform=JSON.parse(await fs.readFile(opt('--platform-report'),'utf8'));let cp=[platform.artifact,...platform.classpath].join(path.delimiter);
const {clientSourceMappings}=await import(pathToFileURL(path.resolve(opt('--mapper'))));const mapper=await clientSourceMappings(opt('--mappings'));
const out=path.resolve(opt('--output-dir')),work=out+'/compile-'+randomUUID(),src=work+'/src',classes=work+'/classes';await fs.mkdir(src,{recursive:true});await fs.mkdir(classes,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex'),sources=[],records=[],jdk=opt('--java-home');
// MixinExtras is already an original NeoForge runtime library. Resolve that same
// nested JAR for javac; do not fetch or bundle another loader/library version.
const universal=platform.classpath.find(file=>/\/neoforge-[0-9.]+-universal\.jar$/.test(file.replaceAll('\\','/')));
if(!universal)throw Error('Original NeoForge universal runtime input required');
const jarTool=path.join(jdk,'bin','jar.exe');
const extrasEntries=execFileSync(jarTool,['--list','--file',universal],{encoding:'utf8',windowsHide:true,maxBuffer:4_000_000}).split(/\r?\n/).filter(n=>/^META-INF\/jarjar\/mixinextras-neoforge-[0-9.]+\.jar$/.test(n));
if(extrasEntries.length!==1)throw Error('Matching NeoForge MixinExtras library unavailable');
execFileSync(jarTool,['--extract','--file',universal,extrasEntries[0]],{cwd:work,windowsHide:true});
const extras=path.join(work,...extrasEntries[0].split('/'));cp+=path.delimiter+extras;
const runtimeDependencies=[{owner:'NeoForge',embeddedIn:path.basename(universal),containerSha256:sha(await fs.readFile(universal)),entry:extrasEntries[0],sha256:sha(await fs.readFile(extras))}];
async function add(file,translate=true){const b=await fs.readFile(file),dest=src+'/'+path.basename(file);records.push({file:path.relative(path.resolve(dir,'../..'),file).replaceAll('\\','/'),sha256:sha(b)});await fs.writeFile(dest,translate?mapper.translate(b.toString('utf8')):b);sources.push(dest);}
const director=path.resolve(dir,'../native-client-director'),observer=path.resolve(dir,'../native-client-observer');
for(const name of['DirectorPolicy','DroneFollow','CinematicRig','CloseView','OrthographicRig','NativeOrthographic','TransitionEnvelope','FrameBlend','CapturePolicy','NativeVisionCapture','DroneCameraMixin','DirectorInputMixin','DirectorMouseMixin','ObserverBodyMixin','NativeDirectorClient'])await add(director+'/'+name+'.java');
for(const name of['DirectorPolicyCheck','DroneFollowCheck','TransitionEnvelopeCheck','CinematicRigCheck','OrthographicRigCheck','CapturePolicyCheck'])await add(director+'/test/'+name+'.java');
for(const name of['ObserverState','ObserverView','TargetInventory','BossBarState','SpectatorDetails','NativeObserverClient','ObserverSidebarMixin','ObserverBossBarMixin'])await add(observer+'/'+name+'.java');
await add(observer+'/test/ObserverStateCheck.java');
await add(observer+'/test/SpectatorDetailsCheck.java');
for(const name of['NeoVisualClient','NeoObserverMetadata','OrthographicProjection','OrthographicCameraMixin','OrthographicMatrixMixin','SpectatorInventoryProtocol','NativeSpectatorSync','ReadOnlyInventoryScreen','SpectatorKeyMixin','SpectatorOpenScreenMixin','SpectatorSlotMixin','SpectatorMenuGuardMixin','SpectatorGuiMixin','SpectatorGameModeMixin','SpectatorHandPolicy','SpectatorHandPolicyCheck','NativeSpectatorHands','NativeShaderHands','IrisSpectatorHandMixin','SpectatorHandGameRendererMixin','SpectatorItemInHandMixin','SpectatorHandRendererAccessor','OfflineContractCheck'])await add(dir+'/'+name+'.java',false);
const run=(name,a)=>execFileSync(path.join(jdk,'bin',name+'.exe'),a,{windowsHide:true,encoding:'utf8',maxBuffer:5_000_000,env:{...process.env,JAVA_TOOL_OPTIONS:'-Duser.language=en -Duser.country=US'}});
await fs.writeFile(work+'/javac.args',['--release','21','-encoding','UTF-8','-proc:none','-classpath',cp,'-d',classes,...sources].map(s=>'"'+s.replaceAll('\\','/')+'"').join('\n'));run('javac',['@'+work+'/javac.args']);
const names=['DirectorPolicyCheck','DroneFollowCheck','TransitionEnvelopeCheck','CinematicRigCheck','OrthographicRigCheck','CapturePolicyCheck','ObserverStateCheck','SpectatorDetailsCheck','SpectatorHandPolicyCheck'];
const checks=names.map(n=>run('java',['-cp',classes+path.delimiter+cp,n]).trim());
const mixins={required:true,minVersion:'0.8',compatibilityLevel:'JAVA_21',package:'org.mcvisual',client:['director.mixin.DroneCameraMixin','director.mixin.DirectorInputMixin','director.mixin.DirectorMouseMixin','director.mixin.ObserverBodyMixin','observer.mixin.ObserverSidebarMixin','observer.mixin.ObserverBossBarMixin','neoforge.mixin.OrthographicCameraMixin','neoforge.mixin.OrthographicMatrixMixin',...['SpectatorKeyMixin','SpectatorOpenScreenMixin','SpectatorSlotMixin','SpectatorMenuGuardMixin','SpectatorGuiMixin','SpectatorGameModeMixin','SpectatorHandGameRendererMixin','SpectatorItemInHandMixin','SpectatorHandRendererAccessor','IrisSpectatorHandMixin'].map(n=>'neoforge.mixin.'+n)],injectors:{defaultRequire:1}};
// A mixin package must not contain entrypoint or policy classes.
// Use one separate config per component's exclusive mixin namespace.
const configs=[];for(const part of['director','observer','neoforge']){const value={...mixins,package:'org.mcvisual.'+part+'.mixin',client:mixins.client.filter(n=>n.startsWith(part+'.')).map(n=>n.split('.').at(-1))},name='mcvisual-'+part+'-neoforge.mixins.json';await fs.writeFile(classes+'/'+name,JSON.stringify(value));configs.push(name);}
await fs.mkdir(classes+'/META-INF',{recursive:true});let metadata=await fs.readFile(dir+'/neoforge.mods.toml','utf8');metadata=metadata.replace('[[mixins]]\nconfig="mcvisual-neoforge.mixins.json"',configs.map(n=>'[[mixins]]\nconfig="'+n+'"').join('\n'));await fs.writeFile(classes+'/META-INF/neoforge.mods.toml',metadata);
await fs.cp(observer+'/assets',classes+'/assets',{recursive:true});
await fs.copyFile(dir+'/LICENSE-SPECTATORPLUS',classes+'/META-INF/LICENSE-GPL-3.0');
await fs.copyFile(path.resolve(dir,'../../LICENSE'),classes+'/META-INF/LICENSE-MIT');
await fs.copyFile(dir+'/NOTICE.md',classes+'/META-INF/NOTICE.md');
const artifact=out+'/mcvisual-native-0.1.24-neoforge.jar';run('jar',['--create','--file',artifact,'-C',classes,'org','-C',classes,'META-INF','-C',classes,'assets',...configs.flatMap(n=>['-C',classes,n])]);
const consumer=work+'/consumer';await fs.mkdir(consumer);const tests=sources.filter(n=>n.endsWith('Check.java'));await fs.writeFile(work+'/consumer.args',['--release','21','-encoding','UTF-8','-proc:none','-classpath',artifact+path.delimiter+cp,'-d',consumer,...tests].map(s=>'"'+s.replaceAll('\\','/')+'"').join('\n'));run('javac',['@'+work+'/consumer.args']);
const packaged=names.map(n=>run('java',['-cp',consumer+path.delimiter+artifact+path.delimiter+cp,n]).trim());if(JSON.stringify(checks)!==JSON.stringify(packaged))throw Error('Packaged consumer mismatch');
for(const name of['build.mjs','neoforge.mods.toml','NOTICE.md','LICENSE-SPECTATORPLUS'])records.push({file:'tools/native-client-neoforge/'+name,sha256:sha(await fs.readFile(dir+'/'+name))});
const report={schema:'mcvisual-neoforge-build/v1',at:new Date().toISOString(),artifact,sha256:sha(await fs.readFile(artifact)),platformSha256:platform.sha256,runtimeDependencies,mapping:mapper.report(),sources:records,checks,packaged,work,productionLoaded:false,gameConnections:0};await fs.writeFile(out+'/build-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({artifact,sha256:report.sha256,checks,packaged}));
