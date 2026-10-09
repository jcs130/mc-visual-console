#!/usr/bin/env python3
"""Export map palette and item-frame models from the matching local 1.20.6 client."""
import argparse,hashlib,io,json,re,subprocess,zipfile
from PIL import Image
from pathlib import Path

def palette(jar,mappings,javap):
    name=re.search(r'^net.minecraft.world.level.material.MapColor -> ([a-z]+):$',mappings,re.M)
    if not name:raise ValueError('MapColor mapping missing')
    code=subprocess.check_output([javap,'-classpath',str(jar),'-c','-p',name[1]],encoding='utf-8')
    static=code.split('static {};',1)[1]
    values=[]
    for block in re.findall(r'\d+: new\s+.*?invokespecial.*?\(II\)V',static,re.S):
        numbers=[]
        for line in block.splitlines():
            if m:=re.search(r': iconst_(\d)\b',line):numbers.append(int(m[1]))
            elif m:=re.search(r': (?:bi|si)push\s+(\d+)',line):numbers.append(int(m[1]))
            elif m:=re.search(r'// int (\d+)',line):numbers.append(int(m[1]))
        if len(numbers)!=2 or numbers[0]!=len(values):raise ValueError('Unrecognized MapColor constructor')
        values.append(numbers[1])
    if len(values)!=62 or values[0]!=0:raise ValueError('Unexpected 1.20.6 palette')
    return values

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('client',type=Path);p.add_argument('mappings',type=Path);p.add_argument('output',type=Path);p.add_argument('--javap',default='javap');a=p.parse_args()
    with zipfile.ZipFile(a.client) as z:
        version=json.loads(z.read('version.json'))
        if version['id']!='1.20.6':raise ValueError('Exact 1.20.6 client required')
        def model(name,seen=()):
            if name in seen or len(seen)>8:raise ValueError('Cyclic model')
            path='assets/minecraft/models/'+name.removeprefix('minecraft:')+'.json';raw=z.read(path);own=json.loads(raw)
            result=model(own['parent'],(*seen,name)) if 'parent' in own else {}
            return {**result,**own,'textures':{**result.get('textures',{}),**own.get('textures',{})}}
        frames={n:model('block/'+n+'_map') for n in ['item_frame','glow_item_frame']}
        textures={}
        for spec in frames.values():
            for t in spec['textures'].values():
                if t.startswith('#'):raise ValueError('Unresolved texture')
                path='assets/minecraft/textures/'+t.removeprefix('minecraft:')+'.png'
                raw=z.read(path);dst=a.output/'public/textures/1.20.6'/t.removeprefix('minecraft:');dst=dst.with_suffix('.png');dst.parent.mkdir(parents=True,exist_ok=True);dst.write_bytes(raw)
                textures[t]=hashlib.sha256(raw).hexdigest()
        # minecraft-renderer's entity model requests flat squid paths. Keep
        # original 1.20.6 pixels; aliases only change the HTTP resource location.
        aliases={'entity/squid':'entity/squid/squid','entity/glow_squid':'entity/squid/glow_squid'}
        for target,source in aliases.items():
            raw=z.read('assets/minecraft/textures/'+source+'.png')
            dst=a.output/'public/textures/1.20.6'/Path(target+'.png');dst.parent.mkdir(parents=True,exist_ok=True);dst.write_bytes(raw)
            textures[target]=hashlib.sha256(raw).hexdigest()
        particle_names=['dust','dust_color_transition','end_rod','cloud','flame','soul_fire_flame','snowflake','heart','crit','electric_spark','portal','enchant']
        definitions={n:json.loads(z.read('assets/minecraft/particles/'+n+'.json'))['textures'] for n in particle_names}
        sprite_names=sorted(set(t for ts in definitions.values() for t in ts));sprites={};images={}
        for n in sprite_names:
            namespace,resource=n.split(':',1)
            path=f'assets/{namespace}/textures/particle/{resource}.png';raw=z.read(path)
            images[n]=Image.open(io.BytesIO(raw)).convert('RGBA');sprites[n]={'sha256':hashlib.sha256(raw).hexdigest()}
        cell=max(max(i.size) for i in images.values())+2;side=1
        while side*side<len(sprite_names):side+=1
        atlas=Image.new('RGBA',(side*cell,side*cell))
        for index,n in enumerate(sprite_names):
            image=images[n];x=(index%side)*cell+1;y=(index//side)*cell+1;atlas.paste(image,(x,y))
            sprites[n]['uv']=[x/atlas.width,y/atlas.height,image.width/atlas.width,image.height/atlas.height]
        atlas_path=a.output/'public/particle-content.png';atlas_path.parent.mkdir(parents=True,exist_ok=True);atlas.save(atlas_path)
        record={'schemaVersion':1,'minecraftVersion':'1.20.6','clientJarSha256':hashlib.sha256(a.client.read_bytes()).hexdigest(),
                'mapColors':palette(a.client,a.mappings.read_text(encoding='utf-8'),a.javap),'shades':[180,220,255,135],
                'frameModels':frames,'textureHashes':textures,'textureAliases':aliases,'mapDecorationsRendered':False,
                'particleDefinitions':definitions,'particleSprites':sprites,'particleAtlasSha256':hashlib.sha256(atlas_path.read_bytes()).hexdigest()}
        out=a.output/'public/viewer-content.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(record,separators=(',',':'))+'\n',encoding='utf-8')
        print(json.dumps({'maps':len(record['mapColors']),'frameModels':len(frames),'clientJarSha256':record['clientJarSha256'],'output':str(out)}))
if __name__=='__main__':main()
