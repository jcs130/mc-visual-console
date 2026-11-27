import json,zipfile,io,hashlib,sys
from pathlib import Path
from PIL import Image
jar,output=map(Path,sys.argv[1:]);out=[]
with zipfile.ZipFile(jar)as z:
 version=json.loads(z.read('version.json'))['id'];atlases={k:json.loads((output/f'render-assets/{k}Atlases.json').read_text())['latest']for k in ['blocks','items']}
 for name in z.namelist():
  if not(name.startswith('assets/minecraft/textures/')and name.endswith('.png.mcmeta')):continue
  metadata=json.loads(z.read(name))
  if 'animation'not in metadata:continue
  image=z.read(name[:-7]);w,h=Image.open(io.BytesIO(image)).size;rel=name[len('assets/minecraft/textures/'):-11];targets=[]
  for kind,atlas in atlases.items():
   # The item atlas is built only from item/*. A matching block basename is a different sprite.
   if kind == 'items' and not rel.startswith('item/'): continue
   key=rel.split('/',1)[1]if rel.startswith('block/')or(kind=='items'and rel.startswith('item/'))else rel
   rect=atlas['textures'].get(key)
   if rect:targets.append({'atlas':kind,'x':round(rect['u']*atlas['width']),'y':round(rect['v']*atlas['height']),'width':round(rect['su']*atlas['width']),'height':round(rect['sv']*atlas['height'])})
  if targets:out.append({'id':'minecraft:'+rel,'url':f'/textures/{version}/{rel}.png','width':w,'height':h,'sha256':hashlib.sha256(image).hexdigest(),'metadata':metadata,'targets':targets})
p=output/'public/atlas-animations.json';p.write_text(json.dumps({'schemaVersion':1,'minecraftVersion':version,'sprites':out},separators=(',',':')));print(json.dumps({'sprites':len(out),'targets':sum(len(r['targets'])for r in out),'manifest':str(p)}))
