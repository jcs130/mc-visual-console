#!/usr/bin/env python3
"""Export original Java 1.20.6 default-font inputs, including its asset-index override."""
import argparse, hashlib, json, zipfile, re
from pathlib import Path

def font_json(raw):
    # Mojang's asset-index font overrides can contain Gson-style trailing commas.
    # Preserve all quoted strings, including escaped quotes and comma/bracket text.
    text = raw.decode('utf-8') if isinstance(raw, bytes) else raw
    text = re.sub(r'("(?:\\.|[^"\\])*")|,\s*([}\]])', lambda m: m.group(1) or m.group(2), text)
    return json.loads(text)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('client',type=Path);p.add_argument('asset_index',type=Path)
    p.add_argument('downloaded_fonts',type=Path);p.add_argument('output',type=Path)
    a=p.parse_args();index_bytes=a.asset_index.read_bytes();index=json.loads(index_bytes)
    public=a.output/'public';files={}
    def save(relative,raw,source,sha1=None):
        target=public/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
        files[relative]={'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'source':source,**({'assetSha1':sha1} if sha1 else {})}
    with zipfile.ZipFile(a.client) as z:
        version=json.loads(z.read('version.json'))['id']
        if version not in ('1.20.6','1.21.1'):raise ValueError('Unsupported font source version')
        for name in ['default.json','include/space.json','include/default.json','include/unifont.json']:
            logical='minecraft/font/'+name;source='assets/'+logical
            if logical in index['objects']:
                expected=index['objects'][logical];raw=(a.downloaded_fonts/Path(name).name).read_bytes()
                if len(raw)!=expected['size'] or hashlib.sha1(raw).hexdigest()!=expected['hash']:raise ValueError('Asset index mismatch: '+logical)
                save(f'fonts/{version}/'+name,raw,logical,expected['hash'])
            else:save(f'fonts/{version}/'+name,z.read(source),source)
        providers=[]
        for provider in font_json((public/f'fonts/{version}/include/space.json').read_bytes())['providers']:
            providers.append(provider)
        for provider in font_json((public/f'fonts/{version}/include/default.json').read_bytes())['providers']:
            if provider['type']!='bitmap':raise ValueError('Unknown default bitmap provider')
            image=provider['file'].removeprefix('minecraft:')
            relative=f'textures/{version}/'+image;save(relative,z.read('assets/minecraft/textures/'+image),'assets/minecraft/textures/'+image)
            providers.append({**provider,'url':'/'+relative})
        for provider in font_json((public/f'fonts/{version}/include/unifont.json').read_bytes())['providers']:
            if provider.get('filter',{}).get('jp'):continue # Chinese/non-Japanese default, not the Japanese option.
            if provider['type']!='unihex':raise ValueError('Unknown Unifont provider')
            logical=provider['hex_file'].replace(':','/',1);expected=index['objects'][logical]
            raw=(a.downloaded_fonts/Path(logical).name).read_bytes()
            if hashlib.sha1(raw).hexdigest()!=expected['hash'] or len(raw)!=expected['size']:raise ValueError('Unifont hash mismatch')
            save(f'fonts/{version}/unifont.zip',raw,logical,expected['hash'])
            with zipfile.ZipFile(a.downloaded_fonts/Path(logical).name) as font_zip:
                entry=next(n for n in font_zip.namelist() if n.endswith('.hex'))
                font_zip.getinfo(entry)
            providers.append({**provider,'url':f'/fonts/{version}/unifont.zip','entry':entry})
        manifest={'schemaVersion':1,'minecraftVersion':version,'clientJarSha256':hashlib.sha256(a.client.read_bytes()).hexdigest(),
                  'assetIndexSha1':hashlib.sha1(index_bytes).hexdigest(),'uniform':False,'jp':False,'providers':providers,'files':files}
        out=public/'text-display-font.json';out.write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
        print(json.dumps({'manifest':str(out),'files':len(files),'bytes':sum(f['bytes'] for f in files.values()),'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}))
if __name__=='__main__':main()
