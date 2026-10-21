"""Export vanilla glint UVs with the unmodified official 1.21.1 Stitcher.

Requires Java 21+ and the official client libraries; starts no Minecraft client,
game connection, display or model. No JAR/class/texture bytes are redistributed.
"""
import argparse
import hashlib
import json
import os
import struct
import subprocess
import tempfile
import zipfile
from pathlib import Path

JAVA = 'package atlasprobe;\nimport java.nio.file.*;\nimport java.util.*;\nimport java.lang.reflect.*;\npublic class OriginalAtlas {\n  public static void main(String[] args) throws Exception {\n    Class<?> entry=Class.forName("gqi$a"), callback=Class.forName("gqi$d"), type=Class.forName("gqi"), location=Class.forName("akr");\n    Object stitch=type.getConstructor(int.class,int.class,int.class).newInstance(16384,16384,4);\n    Map<Object,String[]> entries=new IdentityHashMap<>();\n    for (String line : Files.readAllLines(Path.of(args[0]))) {\n      String[] p=line.split("\\\\t"); Object id=location.getMethod("a",String.class).invoke(null,p[0]);\n      Object row=Proxy.newProxyInstance(entry.getClassLoader(),new Class<?>[]{entry},(proxy,method,input)->switch(method.getName()){\n        case "a"->Integer.parseInt(p[1]); case "b"->Integer.parseInt(p[2]); case "c"->id; default->null;\n      }); entries.put(row,p); type.getMethod("a",entry).invoke(stitch,row);\n    }\n    type.getMethod("c").invoke(stitch); System.out.println("SIZE\\t"+type.getMethod("a").invoke(stitch)+"\\t"+type.getMethod("b").invoke(stitch));\n    Object output=Proxy.newProxyInstance(callback.getClassLoader(),new Class<?>[]{callback},(proxy,method,input)->{\n      String[] p=entries.get(input[0]);System.out.println(p[0]+"\\t"+input[1]+"\\t"+input[2]+"\\t"+p[1]+"\\t"+p[2]); return null;\n    }); type.getMethod("a",callback).invoke(stitch,output);\n  }\n}\n'

def main(args):
    with tempfile.TemporaryDirectory(prefix="native-glint-atlas-") as scratch:
        R = Path(scratch)
        assert R.resolve().is_relative_to(Path(tempfile.gettempdir()).resolve())
        inputs = Path(args.libraries)
        jar = Path(args.client_jar)
        assert hashlib.sha256(jar.read_bytes()).hexdigest() == '499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99'
        sprites, files, paths = {}, {}, {}
        atlases = {}
        with zipfile.ZipFile(jar) as z:
            names = z.namelist()
            def content(path):
                data = z.read(path)
                files[path] = hashlib.sha256(data).hexdigest()
                return data
            def sprite(resource, alias=None):
                path = 'assets/minecraft/textures/'+resource+'.png'
                data = content(path)
                w, h = struct.unpack('>II', data[16:24])
                if path+'.mcmeta' in names:
                    meta = json.loads(content(path+'.mcmeta')).get('animation')
                    if meta is not None:
                        a, b = meta.get('width'), meta.get('height')
                        w, h = (a or w, b or h) if a or b else (min(w,h), min(w,h))
                assert w % 16 == h % 16 == 0
                key = 'minecraft:'+(alias or resource)
                sprites[key] = (w,h)
                paths[key] = path
            for source in json.loads(content('assets/minecraft/atlases/blocks.json'))['sources']:
                kind = source['type']
                if kind == 'directory':
                    prefix = 'assets/minecraft/textures/'+source['source']+'/'
                    for path in names:
                        if path.startswith(prefix) and path.endswith('.png'):
                            resource = path.removeprefix('assets/minecraft/textures/').removesuffix('.png')
                            sprite(resource, source['prefix']+path.removeprefix(prefix).removesuffix('.png'))
                elif kind == 'single':
                    sprite(source['resource'], source.get('sprite'))
                elif kind == 'paletted_permutations':
                    for palette in [source['palette_key'], *source['permutations'].values()]:
                        content('assets/minecraft/textures/'+palette+'.png')
                    for resource in source['textures']:
                        for suffix in source['permutations']:
                            sprite(resource, resource+'_'+suffix)
                else:
                    raise ValueError(kind)
        sprites['minecraft:missingno'] = (16,16)
        (R/'sprites.tsv').write_text(''.join(f'{key}\t{w}\t{h}\n' for key,(w,h) in sorted(sprites.items())),encoding='utf-8')
        classpath = os.pathsep.join([str(jar), *map(str, inputs.rglob('*.jar'))])
        (R/'OriginalAtlas.java').write_text(JAVA,encoding='utf-8')
        subprocess.run(['javac','-d',str(R),str(R/'OriginalAtlas.java')],check=True)
        result = subprocess.check_output(['java','-cp',str(R)+os.pathsep+classpath,'atlasprobe.OriginalAtlas',str(R/'sprites.tsv')],text=True,encoding='utf-8')
        (R/'original-atlas.tsv').write_text(result,encoding='utf-8')
        lines = [line.split('\t') for line in result.splitlines() if '\t' in line]
        dimensions = next(list(map(int,line[1:])) for line in lines if line[0]=='SIZE')
        mapped = {paths[line[0]]:list(map(int,line[1:])) for line in lines if line[0] in paths}
        assert len(lines)==len(sprites)+1
        output = {'source':'Minecraft 1.21.1 original Stitcher; blocks atlas; mip 4','clientSha256':hashlib.sha256(jar.read_bytes()).hexdigest(),
                  'size':dimensions,'spriteCount':len(sprites),'files':dict(sorted(files.items())),'sprites':dict(sorted(mapped.items()))}
        target = Path(args.output)
        target.write_text(json.dumps(output,separators=(',',':'))+'\n',encoding='utf-8',newline='')
        atlases['blocks'] = output
        # Shield uses Sheets.SHIELD_SHEET's sprite expansion, not block-atlas UVs.
        with zipfile.ZipFile(jar) as z:
            sprites, paths = {}, {}
            for source in json.loads(content('assets/minecraft/atlases/shield_patterns.json'))['sources']:
                if source['type'] == 'single':
                    sprite(source['resource'])
                elif source['type'] == 'directory':
                    prefix = 'assets/minecraft/textures/'+source['source']+'/'
                    for path in names:
                        if path.startswith(prefix) and path.endswith('.png'):
                            sprite(path.removeprefix('assets/minecraft/textures/').removesuffix('.png'))
                else:
                    raise ValueError(source['type'])
        sprites['minecraft:missingno'] = (16,16)
        (R/'shield-sprites.tsv').write_text(''.join(f'{key}\t{w}\t{h}\n' for key,(w,h) in sorted(sprites.items())),encoding='utf-8')
        shield = subprocess.check_output(['java','-cp',str(R)+os.pathsep+classpath,'atlasprobe.OriginalAtlas',str(R/'shield-sprites.tsv')],text=True,encoding='utf-8')
        (R/'original-shield-atlas.tsv').write_text(shield,encoding='utf-8')
        lines = [line.split('\t') for line in shield.splitlines() if '\t' in line]
        dimensions = next(list(map(int,line[1:])) for line in lines if line[0]=='SIZE')
        shield_mapped = {paths[line[0]]:list(map(int,line[1:])) for line in lines if line[0] in paths}
        output['sprites'] = {p:[*row,*output['size']] for p,row in output['sprites'].items()}
        output['sprites'].update({p:[*row,*dimensions] for p,row in shield_mapped.items()})
        output.update(files=dict(sorted(files.items())), shieldSize=dimensions, shieldSpriteCount=len(sprites))
        target.write_text(json.dumps(output,separators=(',',':'))+'\n',encoding='utf-8',newline='')
        print(json.dumps({'blocks':output['size'],'shield':dimensions,'files':len(files),'outputBytes':target.stat().st_size}))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--client-jar", required=True)
    parser.add_argument("--libraries", required=True)
    parser.add_argument("--output", required=True)
    main(parser.parse_args())
