"""Build against an existing native cache; preserve/pin original third-party classes."""
import argparse,hashlib,json,pathlib,subprocess,zipfile,os,locale
p=argparse.ArgumentParser();p.add_argument('--game-dir',required=True);p.add_argument('--java-home',required=True);p.add_argument('--camera-artifacts',required=True);p.add_argument('--output-dir',required=True);a=p.parse_args()
src=pathlib.Path(__file__).resolve().parent;game=pathlib.Path(a.game_dir).resolve();jdk=pathlib.Path(a.java_home).resolve();assets=pathlib.Path(a.camera_artifacts).resolve();out=pathlib.Path(a.output_dir).resolve();out.mkdir(parents=True,exist_ok=True)
pins={'fpvcraft-0.1.0.jar':'019eee356765d1acb09ce91c9f8cc1405a75083900cb6cfa1d070b4957bd5207','vcam-mod-1.0.1+mc1.21.1.jar':'665ba2103d676c80a831cb84112b285c1e6466947bcdb4f8339ef5e1dbd4fbbd','freecamera-1.21.1-fabric-2.2.0.jar':'95924ce5fbd137225ca5fc598ff39d02f402d892dc359d689497ce26566bff1c'}
for name,sha in pins.items():assert hashlib.sha256((assets/name).read_bytes()).hexdigest()==sha,'original artifact hash mismatch: '+name
mc=next((game/'.fabric/remappedJars').rglob('*client-intermediary.jar'));cp=[mc,*list((game/'.fabric/processedMods').rglob('*.jar')),*list((game/'libraries').rglob('*.jar')),*[assets/n for n in pins]]
ws=out/'Java-WebSocket-1.6.0.jar'
with zipfile.ZipFile(assets/'vcam-mod-1.0.1+mc1.21.1.jar') as z:ws.write_bytes(z.read('META-INF/jars/Java-WebSocket-1.6.0.jar'))
cp.append(ws);classes=out/'classes';classes.mkdir(exist_ok=True)
def run(tool,argv):
 r=subprocess.run([str(jdk/'bin'/(tool+'.exe')), *argv],capture_output=True,text=True,encoding='utf-8',errors='replace');print(r.stdout,end='');print(r.stderr,end='');r.check_returncode();return r.stdout
def compile_into(dest,classpath,files,name):
 arg=out/name;vals=['--release','21','-encoding','UTF-8','-proc:none','-classpath',os.pathsep.join(map(str,classpath)),'-d',str(dest),*map(str,files)];arg.write_text('\n'.join('"'+v.replace('\\','/')+'"' for v in vals),encoding='utf-8');run('javac',['@'+str(arg)])
compile_into(classes,cp,[src/'CameraTrialPolicy.java',src/'CameraTrialsClient.java',src/'test/CameraTrialPolicyCheck.java'],'javac.args')
metadata=json.loads((src/'fabric.mod.json').read_text(encoding='utf-8'));jar=out/(metadata['id']+'-'+metadata['version']+'.jar')
with zipfile.ZipFile(jar,'w',zipfile.ZIP_DEFLATED) as z:
 for f in (classes/'org').rglob('*.class'):z.write(f,f.relative_to(classes).as_posix())
 z.writestr('fabric.mod.json',json.dumps(metadata,ensure_ascii=False,indent=2))
consumer=out/'consumer';consumer.mkdir(exist_ok=True);compile_into(consumer,[jar],[src/'test/CameraTrialPolicyCheck.java'],'consumer.args')
# JVM @argfiles use the Windows host codepage for this matching distribution; javac source args above use UTF-8.
args=out/'run.args';args.write_text('\n'.join('"'+v.replace('\\','/')+'"' for v in ['-cp',str(consumer)+os.pathsep+str(jar),'CameraTrialPolicyCheck']),encoding=locale.getpreferredencoding(False) if os.name!='nt' else 'mbcs');checks=run('java',['@'+str(args)])
adapted=out/'vcam-mod-1.0.1-mcvisual-loopback.1.jar';changed=[]
with zipfile.ZipFile(assets/'vcam-mod-1.0.1+mc1.21.1.jar') as original,zipfile.ZipFile(adapted,'w',zipfile.ZIP_DEFLATED) as dest:
 for name in original.namelist():
  data=original.read(name)
  if name=='fabric.mod.json':
   meta=json.loads(data);meta['entrypoints']['client']=[];meta['version']='1.0.0+mcvisual-loopback.1';meta['name']='VCam (explicit loopback trial adapter)';meta['custom']={'mcvisual':{'upstreamSha256':pins['vcam-mod-1.0.1+mc1.21.1.jar'],'originalInitializerSuppressed':True,'originalClassesPreserved':True}};data=json.dumps(meta,ensure_ascii=False,indent=2).encode('utf-8');changed.append(name)
  dest.writestr(name,data)
with zipfile.ZipFile(assets/'vcam-mod-1.0.1+mc1.21.1.jar') as x,zipfile.ZipFile(adapted) as y:assert all(x.read(n)==y.read(n) for n in x.namelist() if n!='fabric.mod.json')
report={'schema':'native-camera-trial-build/v1','jar':str(jar),'sha256':hashlib.sha256(jar.read_bytes()).hexdigest(),'originalArtifacts':pins,'packagedConsumer':checks.strip(),'vcamAdapted':str(adapted),'vcamAdaptedSha256':hashlib.sha256(adapted.read_bytes()).hexdigest(),'vcamChangedEntries':changed,'productionLoaded':False,'newPlayers':0,'modelCalls':0}
(out/'build-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False))
