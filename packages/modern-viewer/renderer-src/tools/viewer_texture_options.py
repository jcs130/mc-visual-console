import copy

def mark_translucent_faces(models):
 """Preserve reference-local force_translucent across model/texture inheritance.
 No global sprite flag: the same PNG may be opaque on another model/face.
 """
 raw=copy.deepcopy(models);cache={}
 def tree(name,seen=()):
  name=name.removeprefix('minecraft:')
  if name in seen or len(seen)>32:raise ValueError('MODEL_TEXTURE_PARENT_CYCLE')
  if name in cache:return cache[name]
  own=raw.get(name,{})
  base=tree(own['parent'],seen+(name,))if own.get('parent')and own['parent'].removeprefix('minecraft:')in raw else {}
  out={**base,**own,'corticoOriginalTextures':{**base.get('corticoOriginalTextures',{}),**own.get('corticoOriginalTextures',{})}}
  cache[name]=out;return out
 def flag(value,textures,seen=()):
  opt=value if isinstance(value,dict)else{'sprite':value};sprite=opt.get('sprite')
  if not isinstance(sprite,str):return False
  inherited=False
  if sprite.startswith('#'):
   key=sprite[1:]
   if key in seen or len(seen)>32:return False # unbound template placeholders are resolved only by concrete children
   inherited=flag(textures.get(key),textures,seen+(key,))
  return opt.get('force_translucent',inherited)is True
 count=0
 for name,own in models.items():
  merged=tree(name);elements=copy.deepcopy(merged.get('elements',[]))
  for e in elements:
   for f in e.get('faces',{}).values():
    f.pop('corticoForceTranslucent',None)
    if flag(f.get('texture'),merged.get('corticoOriginalTextures',{})):
     f['corticoForceTranslucent']=True;count+=1
  if elements:own['elements']=elements
 return count
