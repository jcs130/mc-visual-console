"""从游戏客户端 JAR 抽方块贴图 —— 让我们画的是真贴图，不是色块。

做法照千灯纪 build_web_mod_assets.py 的思路（blockstate → model → texture，动画资源取第一帧），
但只抽我们渲染用得上的那几十种方块，产出到 client/assets/blocks/ 与 client/assets/blocks.json。

为什么这么做：把"版本支持"变成**数据**——换游戏版本就重跑这个脚本，而不是去改渲染代码。
"""

from __future__ import annotations

import io
import json
import os
import re
import sys
import zipfile

JAR = r'C:\Users\lzl19\AppData\Roaming\.minecraft\versions\1.21.11\1.21.11.jar'
ROOT = r'D:\mc-visual-console'
OUT_DIR = os.path.join(ROOT, 'client', 'assets', 'blocks')
OUT_JSON = os.path.join(ROOT, 'client', 'assets', 'blocks.json')

# 我们关心的方块 → 是否整体同贴图 / 是否需要染色
BLOCKS: dict[str, dict] = {
    'grass_block': {'tint_top': '#79c05a'},
    'dirt': {}, 'coarse_dirt': {}, 'podzol': {'tint_top': '#7a5b3a'},
    'stone': {}, 'cobblestone': {}, 'mossy_cobblestone': {}, 'stone_bricks': {},
    'granite': {}, 'diorite': {}, 'andesite': {}, 'deepslate': {}, 'cobbled_deepslate': {},
    'sand': {}, 'sandstone': {}, 'red_sand': {}, 'gravel': {}, 'clay': {},
    'oak_log': {'axis': 'y'}, 'oak_planks': {}, 'oak_leaves': {'tint_all': '#5aa03c'},
    'birch_log': {'axis': 'y'}, 'birch_planks': {}, 'birch_leaves': {'tint_all': '#6bb04a'},
    'spruce_log': {'axis': 'y'}, 'spruce_planks': {}, 'spruce_leaves': {'tint_all': '#3f7a2e'},
    'coal_ore': {}, 'iron_ore': {}, 'copper_ore': {}, 'gold_ore': {}, 'diamond_ore': {},
    'oak_slab': {}, 'cobblestone_slab': {},
    'glass': {'transparent': True}, 'water': {'transparent': True, 'tint_all': '#3f76e4'},
    'lava': {'tint_all': '#ea6c10'},
    'snow_block': {}, 'ice': {'transparent': True},
    'bricks': {}, 'bookshelf': {}, 'crafting_table': {}, 'furnace': {},
    'white_wool': {}, 'red_wool': {}, 'blue_wool': {},
    'torch': {'flat': True}, 'dandelion': {'flat': True}, 'poppy': {'flat': True},
    'short_grass': {'flat': True, 'tint_all': '#79c05a'},
}

FACES = ('top', 'bottom', 'side', 'all')


def read_json(zf: zipfile.ZipFile, path: str):
    try:
        return json.loads(zf.read(path).decode('utf-8', 'ignore'))
    except Exception:
        return None


def first_model_from_blockstate(zf: zipfile.ZipFile, name: str) -> str | None:
    bs = read_json(zf, f'assets/minecraft/blockstates/{name}.json')
    if not bs:
        return None
    variants = bs.get('variants')
    if isinstance(variants, dict):
        for _, v in variants.items():
            v = v[0] if isinstance(v, list) else v
            if isinstance(v, dict) and v.get('model'):
                return v['model']
    for _, cases in (bs.get('multipart') or []):
        if isinstance(cases, list):
            for c in cases:
                if isinstance(c, dict) and c.get('model'):
                    return c['model']
    return None


def resolve_model(zf: zipfile.ZipFile, model: str, depth: int = 0) -> dict[str, str]:
    """把 model 与它的 parent 链上的 textures 合并，得到最终贴图名（去掉 minecraft:block/ 前缀）"""
    if depth > 4 or not model:
        return {}
    ref = model.split(':')[-1].lstrip('/')
    path = ref if ref.startswith('assets/') else f'assets/minecraft/models/{ref}.json'
    if not path.startswith('assets/'):
        path = f'assets/minecraft/{path}'
    m = read_json(zf, path)
    if not m:
        return {}
    merged: dict[str, str] = {}
    parent = m.get('parent')
    if parent:
        merged.update(resolve_model(zf, parent, depth + 1))
    for k, v in (m.get('textures') or {}).items():
        if isinstance(v, str) and not v.startswith('#'):
            merged[k] = v.split(':')[-1].replace('block/', '')
    # 解析 "变量指到变量" 的情况（#side → #all 之类）
    for _ in range(3):
        for k, v in list(merged.items()):
            if v.startswith('#'):
                merged[k] = merged.get(v[1:], v)
    return merged


def extract_png(zf: zipfile.ZipFile, tex: str) -> bytes | None:
    for cand in (f'assets/minecraft/textures/block/{tex}.png',
                 f'assets/minecraft/textures/block/{tex.split("/")[-1]}.png'):
        try:
            data = zf.read(cand)
        except KeyError:
            continue
        # 动画贴图是竖条（16×N）；取第一帧（16×16）
        if len(data) > 200 and data[:8] == b'\x89PNG\r\n\x1a\n':
            try:
                from PIL import Image  # 有就用，没有就原样保留
                img = Image.open(io.BytesIO(data))
                if img.height > img.width:
                    img = img.crop((0, 0, img.width, img.width))
                    buf = io.BytesIO()
                    img.save(buf, format='PNG')
                    return buf.getvalue()
            except Exception:
                pass
        return data
    return None


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    if not os.path.isfile(JAR):
        print(f'  ✗ 找不到 JAR：{JAR}')
        return 1
    os.makedirs(OUT_DIR, exist_ok=True)
    out: dict[str, dict] = {}
    missing: list[str] = []
    written: set[str] = set()

    with zipfile.ZipFile(JAR) as zf:
        for name, meta in BLOCKS.items():
            model = first_model_from_blockstate(zf, name)
            if not model:
                missing.append(name)
                continue
            tex = resolve_model(zf, model)
            want = ['all'] if 'all' in tex else ['top', 'bottom', 'side']
            faces: dict[str, str] = {}
            for f in want:
                t = tex.get(f) or tex.get('all') or tex.get('side') or tex.get('top')
                if not t:
                    continue
                data = extract_png(zf, t)
                if data is None:
                    continue
                fn = t.replace('/', '_') + '.png'
                p = os.path.join(OUT_DIR, fn)
                if fn not in written:
                    io.open(p, 'wb').write(data)
                    written.add(fn)
                faces[f] = fn
            if not faces:
                missing.append(name)
                continue
            entry = {'faces': faces}
            entry.update({k: v for k, v in meta.items()})
            out[name] = entry

    io.open(OUT_JSON, 'w', encoding='utf-8', newline='\n').write(json.dumps(out, ensure_ascii=False, indent=2) + '\n')
    print(f'  方块映射 {len(out)} 种；贴图文件 {len(written)} 张 → {OUT_DIR}')
    print(f'  未取到的 {len(missing)} 种：{", ".join(missing[:12])}{"…" if len(missing) > 12 else ""}')
    for k in list(out)[:6]:
        print(f'    {k}: {out[k]["faces"]}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
