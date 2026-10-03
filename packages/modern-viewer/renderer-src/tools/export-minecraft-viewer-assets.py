#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从官方 1.20.6 客户端 JAR 导出网页渲染资源。

用法：python tools/export-minecraft-viewer-assets.py <1.20.6.jar> <输出包目录>
依赖 Pillow。输出包目录的 public/ 包含方块状态、图集及原版纹理。
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import tempfile
import time
import zipfile

from minecraft_viewer_icons import export_icons

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

VERSION = '1.20.6'
PUBLIC = ''
BLOCKS_DIR = ''
BED_COLORS = ('white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink',
              'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black')
CHEST_TEXTURES = ('normal', 'normal_left', 'normal_right', 'trapped', 'trapped_left',
                  'trapped_right', 'ender')


def next_power_of_two(n: int) -> int:
    if n == 0:
        return 1
    n -= 1
    n |= n >> 1
    n |= n >> 2
    n |= n >> 4
    n |= n >> 8
    n |= n >> 16
    return n + 1


def cleanup_block_name(name: str) -> str:
    if name.startswith('minecraft:'):
        name = name[len('minecraft:'):]
    if name.startswith('block/'):
        return name[len('block/'):]
    if name.startswith('item/'):
        return 'item__' + name[len('item/'):]
    return name


def render_model_identifiers(value):
    """mc-assets 的解析器使用省略 minecraft: 的模型/贴图键。"""
    if isinstance(value, dict):
        return {key: render_model_identifiers(child) for key, child in value.items()}
    if isinstance(value, list):
        return [render_model_identifiers(child) for child in value]
    if isinstance(value, str) and value.startswith('minecraft:'):
        return value[len('minecraft:'):]
    return value


def add_block_entity_models(states: dict, models: dict, all_models: dict):
    with open(Path(__file__).with_name('minecraft-viewer-block-entity-geometry.json'), encoding='utf-8') as source:
        geometry = json.load(source)['models']

    def register(name: str, model: dict):
        key = f'viewer/{name}'
        models[key] = model
        all_models[f'block/{key}'] = model
        return f'block/{key}'

    for name, model in geometry.items():
        register(name, model)

    for texture in CHEST_TEXTURES:
        filename = os.path.join(PUBLIC, 'textures', VERSION, 'entity', 'chest', f'{texture}.png')
        if not os.path.isfile(filename):
            raise ValueError(f'1.20.6 客户端缺少箱子纹理：{texture}')
        shape = 'chest_left' if texture.endswith('_left') else 'chest_right' if texture.endswith('_right') else 'chest'
        register(f'chest_{texture}', {'parent': f'block/viewer/{shape}',
                                      'textures': {'chest': f'block/entity/chest/{texture}'}})

    for block, prefix in (('chest', 'normal'), ('trapped_chest', 'trapped')):
        variants = {}
        for facing, turn in (('north', 0), ('east', 90), ('south', 180), ('west', 270)):
            for kind, suffix in (('single', ''), ('left', '_left'), ('right', '_right')):
                rotation = (turn + (90 if kind != 'single' else 0)) % 360
                variants[f'facing={facing},type={kind}'] = {
                    'model': f'block/viewer/chest_{prefix}{suffix}',
                    **({'y': rotation} if rotation else {})}
        states[block] = {'variants': variants}
    states['ender_chest'] = {'variants': {
        f'facing={facing}': {'model': 'block/viewer/chest_ender', **({'y': turn} if turn else {})}
        for facing, turn in (('north', 180), ('east', 270), ('south', 0), ('west', 90))}}

    signs_dir = Path(PUBLIC, 'textures', VERSION, 'entity', 'signs')
    woods = sorted(path.stem for path in signs_dir.glob('*.png'))
    if not woods:
        raise ValueError('1.20.6 客户端缺少告示牌实体纹理')
    for wood in woods:
        hanging = signs_dir / 'hanging' / f'{wood}.png'
        if not hanging.is_file():
            raise ValueError(f'1.20.6 客户端缺少悬挂告示牌纹理：{wood}')
        for form, shape, texture in (
            ('standing', 'sign', f'block/entity/signs/{wood}'),
            ('wall', 'wall_sign', f'block/entity/signs/{wood}'),
            ('hanging', 'hanging_sign', f'block/entity/signs/hanging/{wood}'),
            ('wall_hanging', 'wall_hanging_sign', f'block/entity/signs/hanging/{wood}'),
        ):
            register(f'sign/{wood}_{form}', {'parent': f'block/viewer/{shape}',
                                             'textures': {'sign': texture, 'wood': texture}})
        for suffix in ('sign', 'wall_sign', 'hanging_sign', 'wall_hanging_sign'):
            if f'{wood}_{suffix}' not in states:
                raise ValueError(f'1.20.6 客户端缺少告示牌方块状态：{wood}_{suffix}')
        states[f'{wood}_sign'] = {'variants': {
            f'rotation={rotation}': {'model': f'block/viewer/sign/{wood}_standing',
                                     **({'y': rotation * 22.5} if rotation else {})}
            for rotation in range(16)}}
        states[f'{wood}_wall_sign'] = {'variants': {
            f'facing={facing}': {'model': f'block/viewer/sign/{wood}_wall',
                                **({'y': turn} if turn else {})}
            for facing, turn in (('south', 0), ('west', 90), ('north', 180), ('east', 270))}}
        states[f'{wood}_hanging_sign'] = {'variants': {
            f'rotation={rotation}': {'model': f'block/viewer/sign/{wood}_hanging',
                                     **({'y': turn} if turn else {})}
            for rotation in range(16)
            for turn in [((rotation + 8) % 16) * 22.5]}}
        states[f'{wood}_wall_hanging_sign'] = {'variants': {
            f'facing={facing}': {'model': f'block/viewer/sign/{wood}_wall_hanging',
                                **({'y': turn} if turn else {})}
            for facing, turn in (('north', 0), ('east', 90), ('south', 180), ('west', 270))}}


def extract_inputs(jar_path: str, cache: str):
    os.makedirs(BLOCKS_DIR, exist_ok=True)
    states, models, all_models = {}, {}, {}
    texture_count = 0
    item_pngs = {}
    with zipfile.ZipFile(jar_path) as jar:
        for name in jar.namelist():
            if name.endswith('/'):
                continue
            if name.startswith('assets/minecraft/blockstates/') and name.endswith('.json'):
                states[os.path.basename(name)[:-5]] = json.loads(jar.read(name))
            elif name.startswith('assets/minecraft/models/block/') and name.endswith('.json'):
                model = json.loads(jar.read(name))
                models[os.path.basename(name)[:-5]] = model
                all_models[name[len('assets/minecraft/models/'):-5]] = model
            elif name.startswith('assets/minecraft/models/item/') and name.endswith('.json'):
                all_models[name[len('assets/minecraft/models/'):-5]] = json.loads(jar.read(name))
            elif name.startswith('assets/minecraft/textures/') and name.endswith('.png'):
                rel = name[len('assets/minecraft/textures/'):]
                dst = os.path.join(PUBLIC, 'textures', VERSION, *rel.split('/'))
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                body = jar.read(name)
                with open(dst, 'wb') as out:
                    out.write(body)
                with open(dst, 'rb') as copied:
                    if hashlib.sha256(copied.read()).digest() != hashlib.sha256(body).digest():
                        raise IOError(f'纹理复制校验失败：{rel}')
                texture_count += 1
                if rel.startswith('block/'):
                    with open(os.path.join(BLOCKS_DIR, os.path.basename(rel)), 'wb') as out:
                        out.write(body)
                if rel.startswith('item/'):
                    item_pngs[os.path.basename(rel)[:-4]] = body
                if rel.startswith('painting/'):
                    painting = os.path.join(PUBLIC, 'minecraft-assets', *rel.split('/'))
                    os.makedirs(os.path.dirname(painting), exist_ok=True)
                    with open(painting, 'wb') as out:
                        out.write(body)
    # 原版床用方块实体模型；blockstates/<色>_bed.json 的 block/bed 只有粒子贴图。
    # 几何体沿用床实体的两个半块，颜色纹理仍从本次指定的 1.20.6 JAR 读取。
    with open(Path(__file__).with_name('minecraft-viewer-bed-geometry.json'), encoding='utf-8') as source:
        bed_geometry = json.load(source)['models']
    for part in ('head', 'foot'):
        key = f'bed/bed_{part}'
        models[key] = bed_geometry[part]
        all_models[f'block/{key}'] = bed_geometry[part]
    for color in BED_COLORS:
        texture = os.path.join(PUBLIC, 'textures', VERSION, 'entity', 'bed', f'{color}.png')
        if not os.path.isfile(texture):
            raise ValueError(f'1.20.6 客户端缺少床纹理：{color}')
        for part in ('head', 'foot'):
            key = f'bed/{color}_{part}'
            model = {'parent': f'block/bed/bed_{part}',
                     'textures': {'bed': f'block/entity/bed/{color}'}}
            models[key] = model
            all_models[f'block/{key}'] = model
        states[f'{color}_bed'] = {'variants': {
            f'part={part},facing={facing}': {
                'model': f'block/bed/{color}_{part}', **({'y': turn} if turn else {})}
            for part in ('head', 'foot')
            for facing, turn in (('north', 0), ('east', 90), ('south', 180), ('west', 270))}}
    add_block_entity_models(states, models, all_models)
    item_refs = {
        cleanup_block_name(value) for model in models.values()
        for value in model.get('textures', {}).values()
        if isinstance(value, str) and (value.startswith('item/') or value.startswith('minecraft:item/'))
    }
    for ref in item_refs:
        name = ref[len('item__'):]
        if name not in item_pngs:
            raise ValueError(f'方块模型引用的物品纹理不在 JAR 中：{name}')
        with open(os.path.join(BLOCKS_DIR, ref + '.png'), 'wb') as out:
            out.write(item_pngs[name])
    for name, data in [('blocks_states.json', states), ('blocks_models.json', models)]:
        with open(os.path.join(cache, name), 'w', encoding='utf-8') as out:
            json.dump(data, out, separators=(',', ':'))
    render_dir = os.path.abspath(os.path.join(PUBLIC, '..', 'render-assets'))
    os.makedirs(render_dir, exist_ok=True)
    with open(os.path.join(render_dir, 'blockStatesModels.json'), 'w', encoding='utf-8') as out:
        json.dump({'blockstates': {'latest': render_model_identifiers(states)},
                   'models': {'latest': render_model_identifiers(all_models)},
                   'hardcodedModels': {}, 'latestRootItems': []}, out, separators=(',', ':'))
    with open(os.path.join(render_dir, 'itemDefinitions.json'), 'w', encoding='utf-8') as out:
        json.dump({'latest': {}}, out)
    derived_count = make_render_atlases(jar_path, render_dir)
    icon_count = export_icons(jar_path, PUBLIC)
    print(f'客户端资源：{len(states)} 个方块状态 / {len(models)} 个模型 / {texture_count} 张纹理 / {icon_count} 个物品图标')
    return texture_count, derived_count, icon_count


def make_render_atlases(jar_path: str, output: str):
    """给 minecraft-renderer 构建它实际读取的 mc-assets 图集，全部来自同一个 JAR。"""
    from io import BytesIO
    from PIL import Image
    with zipfile.ZipFile(jar_path) as jar:
        derived = {}
        for atlas_name in ('blocks', 'armor_trims'):
            atlas_spec = json.loads(jar.read(f'assets/minecraft/atlases/{atlas_name}.json'))
            for source in atlas_spec.get('sources', []):
                if source.get('type') != 'paletted_permutations':
                    continue
                key_image = Image.open(BytesIO(jar.read(
                    f"assets/minecraft/textures/{source['palette_key']}.png"))).convert('RGBA')
                key_colors = list(key_image.get_flattened_data())
                for suffix, palette_path in source['permutations'].items():
                    palette = Image.open(BytesIO(jar.read(
                        f'assets/minecraft/textures/{palette_path}.png'))).convert('RGBA')
                    colors = list(palette.get_flattened_data())
                    if len(colors) != len(key_colors):
                        raise ValueError(f'纹饰调色板尺寸不符：{palette_path}')
                    mapping = {old[:3]: new[:3] for old, new in zip(key_colors, colors)}
                    for base in source['textures']:
                        image = Image.open(BytesIO(jar.read(
                            f'assets/minecraft/textures/{base}.png'))).convert('RGBA')
                        translated = [(*mapping.get(pixel[:3], pixel[:3]), pixel[3]) if pixel[3] else pixel
                                      for pixel in image.get_flattened_data()]
                        image.putdata(translated)
                        name = f'{base}_{suffix}'
                        if name in derived:
                            raise ValueError(f'纹饰派生纹理重复：{name}')
                        derived[name] = image
                        destination = os.path.join(PUBLIC, 'textures', VERSION, *name.split('/')) + '.png'
                        os.makedirs(os.path.dirname(destination), exist_ok=True)
                        image.save(destination)
        tag = json.loads(jar.read('data/minecraft/tags/painting_variant/placeable.json'))
        painting_records = []
        for raw_name in tag['values']:
            name = raw_name.removeprefix('minecraft:')
            image = Image.open(BytesIO(jar.read(f'assets/minecraft/textures/painting/{name}.png')))
            if image.width % 16 or image.height % 16:
                raise ValueError(f'画作尺寸不正确：{name}')
            painting_records.append([name, image.width // 16, image.height // 16])
        with open(os.path.join(output, 'painting-records.json'), 'w', encoding='utf-8') as stream:
            json.dump(painting_records, stream, separators=(',', ':'))
        files = [name for name in jar.namelist()
                 if name.startswith('assets/minecraft/textures/') and name.endswith('.png')]
        for atlas_type in ('blocks', 'items'):
            sprites = []
            for name in files:
                rel = name[len('assets/minecraft/textures/'):-4]
                if atlas_type == 'items' and not rel.startswith('item/'):
                    continue
                image = Image.open(BytesIO(jar.read(name))).convert('RGBA')
                # 原版动画是一条竖排帧；静态图集使用首帧，原始 PNG 仍逐张完整导出。
                if rel.startswith(('block/', 'item/')) and image.height > image.width:
                    image = image.crop((0, 0, image.width, image.width))
                key = rel.split('/', 1)[1] if rel.startswith('block/') or (atlas_type == 'items' and rel.startswith('item/')) else rel
                sprites.append((key, image))
            for name, image in derived.items():
                if atlas_type == 'items' and not name.startswith('trims/items/'):
                    continue
                key = name.replace('trims/items/', 'trims/', 1) if atlas_type == 'items' else name
                sprites.append((key, image))
            if atlas_type == 'items':
                for name in files:
                    rel = name[len('assets/minecraft/textures/'):-4]
                    if not rel.startswith('trims/items/'):
                        continue
                    image = Image.open(BytesIO(jar.read(name))).convert('RGBA')
                    sprites.append((rel.replace('trims/items/', 'trims/', 1), image))
        # 这个循环下面另行完成：items 必须单独打包，不能共用 block 坐标。
            pack_render_atlas(sprites, output, atlas_type)
    return len(derived)


def pack_render_atlas(sprites, output: str, atlas_type: str):
    from PIL import Image
    tile = 16
    missing = Image.new('RGBA', (16, 16), '#ff00ff')
    for py in range(16):
        for px in range(16):
            if (px < 8) == (py < 8):
                missing.putpixel((px, py), (0, 0, 0, 255))
    sprites.append(('missing_texture', missing))
    width = 4096 if atlas_type == 'blocks' else 2048
    sprites.sort(key=lambda entry: (-entry[1].height, -entry[1].width, entry[0]))
    placements = []
    x = y = row_h = 0
    for name, image in sprites:
        w = math.ceil(image.width / tile) * tile
        h = math.ceil(image.height / tile) * tile
        if x + w > width:
            x, y, row_h = 0, y + row_h, 0
        placements.append((name, image, x, y))
        x += w
        row_h = max(row_h, h)
    height = next_power_of_two(y + row_h)
    if height > 4096:
        raise ValueError(f'{atlas_type} 图集超过 4096 像素，请调整打包算法')
    canvas = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    index = {}
    for name, image, px, py in placements:
        if name in index:
            raise ValueError(f'{atlas_type} 纹理名冲突：{name}')
        canvas.paste(image, (px, py))
        index[name] = {'u': px / width, 'v': py / height,
                       'su': image.width / width, 'sv': image.height / height,
                       'tileIndex': (py // tile) * (width // tile) + (px // tile)}
    canvas.save(os.path.join(output, f'{atlas_type}AtlasLatest.png'))
    with open(os.path.join(output, f'{atlas_type}Atlases.json'), 'w', encoding='utf-8') as stream:
        json.dump({'latest': {'suSv': tile / width, 'tileSize': tile,
                              'width': width, 'height': height, 'textures': index}},
                  stream, separators=(',', ':'))
    print(f'{atlas_type} 渲染图集：{width}x{height}，{len(index)} 个原版及按 JAR 规则生成的纹理条目')


class Atlas:
    def __init__(self):
        from PIL import Image
        self.Image = Image
        self.files = ['missing_texture.png'] + sorted(
            f for f in os.listdir(BLOCKS_DIR) if f.endswith('.png'))
        count = len(self.files)
        self.tile = 16
        signs_dir = Path(PUBLIC, 'textures', VERSION, 'entity', 'signs')
        entity_paths = ([Path(PUBLIC, 'textures', VERSION, 'entity', 'bed', f'{color}.png')
                         for color in BED_COLORS]
                        + [Path(PUBLIC, 'textures', VERSION, 'entity', 'chest', f'{name}.png')
                           for name in CHEST_TEXTURES]
                        + sorted(signs_dir.glob('*.png'))
                        + sorted((signs_dir / 'hanging').glob('*.png')))
        entity_tiles = sum(math.ceil(self.Image.open(path).width / 16) *
                           math.ceil(self.Image.open(path).height / 16) for path in entity_paths)
        self.dim = next_power_of_two(int(math.ceil(math.sqrt(count + entity_tiles))))
        self.size = self.dim * self.tile
        self.canvas = Image.new('RGBA', (self.size, self.size), (0, 0, 0, 0))
        self.index = {}
        missing = Image.new('RGBA', (16, 16), '#ff00ff')
        for y in range(8, 16):
            for x in range(8):
                missing.putpixel((x, y), (0, 0, 0, 255))
        for y in range(8):
            for x in range(8, 16):
                missing.putpixel((x, y), (0, 0, 0, 255))
        self._place(0, missing)
        for i, fname in enumerate(self.files[1:], start=1):
            img = Image.open(os.path.join(BLOCKS_DIR, fname)).convert('RGBA')
            # js drawImage(img,0,0,16,16,x,y,16,16)：取源左上 16x16 缩放到 16x16
            if img.width != 16 or img.height != 16:
                img = img.crop((0, 0, 16, 16)).resize((16, 16), Image.NEAREST)
            self._place(i, img)
        col, row, row_height = 0, math.ceil(count / self.dim), 0
        for path in entity_paths:
            image = Image.open(path).convert('RGBA')
            if image.width % 16 or image.height % 16:
                raise ValueError(f'方块实体纹理尺寸异常：{path.name} {image.size}')
            width, height = image.width // 16, image.height // 16
            if col + width > self.dim:
                col, row, row_height = 0, row + row_height, 0
            if row + height > self.dim:
                raise ValueError(f'方块实体纹理超出方块图集：{path.name}')
            x, y = col * self.tile, row * self.tile
            self.canvas.paste(image, (x, y))
            key = 'entity/' + path.relative_to(Path(PUBLIC, 'textures', VERSION, 'entity')).as_posix()[:-4]
            self.index[key] = {
                'u': x / self.size, 'v': y / self.size,
                'su': image.width / self.size, 'sv': image.height / self.size}
            col += width
            row_height = max(row_height, height)
        assert len(self.index) == count + len(entity_paths), '贴图名冲突'

    def _place(self, i, img):
        x = (i % self.dim) * self.tile
        y = (i // self.dim) * self.tile
        self.canvas.paste(img, (x, y))
        name = self.files[i].split('.')[0]
        u = x / self.size
        v = y / self.size
        su = self.tile / self.size
        self.index[name] = {'u': u, 'v': v, 'su': su, 'sv': su}

    def uv(self, tex_name: str):
        return self.index.get(cleanup_block_name(tex_name))

    def save(self, path):
        self.canvas.save(path, 'PNG')
        print(f'图集 {self.size}x{self.size}（{self.dim}x{self.dim} tiles，{len(self.files)} 贴图） -> {path}')


EMPTY_MODEL = {'textures': {}, 'elements': [], 'ao': True}


def get_model(name: str, models: dict):
    """复刻 modelsBuilder.getModel：parent 链递归合并。返回 None 表示模型缺失。"""
    name = cleanup_block_name(name)
    data = models.get(name)
    if data is None:
        return None
    model = {'textures': {}, 'elements': [], 'ao': True}
    for axis in ('x', 'y', 'z'):
        if axis in data:
            model[axis] = data[axis]
    if data.get('parent'):
        parent = get_model(data['parent'], models)
        if parent is None:
            return None
        for axis in ('x', 'y', 'z'):
            if axis in parent:
                model[axis] = parent[axis]
        model['textures'].update(parent['textures'])
        model['elements'] = parent['elements']
        model['ao'] = parent['ao']
    if data.get('textures'):
        model['textures'].update(data['textures'])
    if data.get('elements'):
        model['elements'] = data['elements']
    if data.get('ambient_occlusion') is not None:
        model['ao'] = data['ambient_occlusion']
    return model


DEFAULT_UV = {
    'north': lambda f, t: [t[0], 16 - t[1], f[0], 16 - f[1]],
    'east': lambda f, t: [f[2], 16 - t[1], t[2], 16 - f[1]],
    'south': lambda f, t: [f[0], 16 - t[1], t[0], 16 - f[1]],
    'west': lambda f, t: [f[2], 16 - t[1], t[2], 16 - f[1]],
    'up': lambda f, t: [f[0], f[2], t[0], t[2]],
    'down': lambda f, t: [t[0], f[2], f[0], t[2]],
}


def prepare_model(model: dict, atlas: Atlas):
    """复刻 modelsBuilder.prepareModel：贴图引用 -> 图集 UV。"""
    # 解析 '#' 链
    for tex in model['textures']:
        root = model['textures'][tex]
        depth = 0
        while isinstance(root, str) and root.startswith('#') and depth < 8:
            key = root[1:]
            root = model['textures'].get(key)
            depth += 1
        model['textures'][tex] = root

    resolved = {}
    for tex, name in model['textures'].items():
        uv = atlas.uv(name) if isinstance(name, str) else None
        resolved[tex] = uv  # None = 贴图缺失（渲染 fallback）

    for elem in model['elements']:
        for side, face in (elem.get('faces') or {}).items():
            ft = face.get('texture')
            if isinstance(ft, str) and ft.startswith('#'):
                face['texture'] = resolved.get(ft[1:])
            elif isinstance(ft, str):
                uv = atlas.uv(ft)
                if uv is None and ft in resolved:
                    face['texture'] = resolved[ft]
                else:
                    face['texture'] = uv
            else:
                face['texture'] = ft

            tex_uv = face.get('texture')
            if not tex_uv:
                continue
            tex_uv = dict(tex_uv)  # 别污染图集共享对象
            uv = face.get('uv')
            if not uv:
                f, t = elem.get('from', [0, 0, 0]), elem.get('to', [16, 16, 16])
                uv = DEFAULT_UV[side](f, t)
            su = (uv[2] - uv[0]) * tex_uv['su'] / 16
            sv = (uv[3] - uv[1]) * tex_uv['sv'] / 16
            tex_uv['bu'] = tex_uv['u'] + 0.5 * tex_uv['su']
            tex_uv['bv'] = tex_uv['v'] + 0.5 * tex_uv['sv']
            tex_uv['u'] = tex_uv['u'] + uv[0] * tex_uv['su'] / 16
            tex_uv['v'] = tex_uv['v'] + uv[1] * tex_uv['sv'] / 16
            tex_uv['su'] = su
            tex_uv['sv'] = sv
            face['texture'] = tex_uv
    model['textures'] = resolved


def bake_apply(ref: dict, models: dict, atlas: Atlas):
    """variant / multipart-apply 的单条 {model, x?, y?} -> {model: 烘焙模型, x?, y?}"""
    out = {}
    m = get_model(ref.get('model', ''), models)
    if m is None:
        m = json.loads(json.dumps(EMPTY_MODEL))
    else:
        m = json.loads(json.dumps(m))  # 深拷贝
    prepare_model(m, atlas)
    out['model'] = m
    for k in ('x', 'y'):
        if k in ref:
            out[k] = ref[k]
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('client_jar')
    parser.add_argument('output_dir')
    args = parser.parse_args()
    if not os.path.isfile(args.client_jar):
        parser.error(f'客户端 JAR 不存在：{args.client_jar}')
    global PUBLIC, BLOCKS_DIR
    PUBLIC = os.path.abspath(os.path.join(args.output_dir, 'public'))
    os.makedirs(os.path.join(PUBLIC, 'blocksStates'), exist_ok=True)
    os.makedirs(os.path.join(PUBLIC, 'textures'), exist_ok=True)
    t0 = time.time()
    with tempfile.TemporaryDirectory(prefix='cortico-mc-assets-') as cache:
        BLOCKS_DIR = os.path.join(cache, 'blocks')
        texture_count, derived_count, icon_count = extract_inputs(args.client_jar, cache)
        with open(os.path.join(cache, 'blocks_states.json'), encoding='utf-8') as stream:
            states = json.load(stream)
        with open(os.path.join(cache, 'blocks_models.json'), encoding='utf-8') as stream:
            models = json.load(stream)
        bake_assets(states, models, texture_count, derived_count, icon_count, args.client_jar, t0)


def bake_assets(states, models, texture_count, derived_count, icon_count, jar_path, started_at):
    print(f'states {len(states)} 方块 / models {len(models)} 模型')

    atlas = Atlas()
    out = {}
    missing_models, missing_tex = [], set()
    for bname, spec in states.items():
        entry = {}
        if 'variants' in spec:
            vs = {}
            for key, val in spec['variants'].items():
                refs = val if isinstance(val, list) else [val]
                baked = [bake_apply(r, models, atlas) for r in refs]
                # 与 1.21.4 产物一致：源是单对象则保持对象，列表则保持列表
                vs[key] = baked[0] if not isinstance(val, list) else baked
            entry['variants'] = vs
        if 'multipart' in spec:
            mp = []
            for part in spec['multipart']:
                ap = part.get('apply')
                refs = ap if isinstance(ap, list) else [ap]
                baked = [bake_apply(r, models, atlas) for r in refs]
                np_ = dict(part)
                np_['apply'] = baked[0] if not isinstance(ap, list) else baked
                mp.append(np_)
            entry['multipart'] = mp
        out[bname] = entry

    # 统计缺模型
    for bname, spec in out.items():
        def check(m):
            if m['model']['elements'] == [] and m['model']['textures'] == {}:
                missing_models.append(bname)
        for val in spec.get('variants', {}).values():
            for m in (val if isinstance(val, list) else [val]):
                check(m)

    dst_json = os.path.join(PUBLIC, 'blocksStates', f'{VERSION}.json')
    dst_png = os.path.join(PUBLIC, 'textures', f'{VERSION}.png')
    json.dump(out, open(dst_json, 'w', encoding='utf-8'), separators=(',', ':'))
    atlas.save(dst_png)
    mb = os.path.getsize(dst_json) / 1e6
    print(f'完成：{dst_json}（{mb:.1f} MB，{len(out)} 方块）')
    if missing_models:
        uniq = sorted(set(missing_models))
        unexpected = sorted(set(uniq) - {'air', 'cave_air', 'void_air'})
        if unexpected:
            print(f'⚠️ {len(unexpected)} 个方块模型缺失（渲成空/问号）：{unexpected[:15]}{"..." if len(unexpected) > 15 else ""}')
        else:
            print('空模型仅有 air、cave_air、void_air（符合原版）')
    digest = hashlib.sha256()
    with open(jar_path, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    texture_root = os.path.join(PUBLIC, 'textures', VERSION)
    texture_hashes = {}
    for walk_root, _, files in os.walk(texture_root):
        for filename in files:
            if not filename.endswith('.png'):
                continue
            filepath = os.path.join(walk_root, filename)
            relative = os.path.relpath(filepath, texture_root).replace('\\', '/')
            with open(filepath, 'rb') as image_file:
                texture_hashes[relative] = hashlib.sha256(image_file.read()).hexdigest()
    if len(texture_hashes) != texture_count + derived_count:
        raise ValueError(f'导出纹理数不一致：{len(texture_hashes)} != {texture_count + derived_count}')
    render_root = os.path.abspath(os.path.join(PUBLIC, '..', 'render-assets'))
    render_hashes = {}
    for filename in os.listdir(render_root):
        filepath = os.path.join(render_root, filename)
        if os.path.isfile(filepath):
            with open(filepath, 'rb') as asset_file:
                render_hashes[filename] = hashlib.sha256(asset_file.read()).hexdigest()
    icon_hashes = {}
    for filename in os.listdir(os.path.join(PUBLIC, 'icons')):
        if filename.endswith('.png'):
            with open(os.path.join(PUBLIC, 'icons', filename), 'rb') as icon_file:
                icon_hashes[filename] = hashlib.sha256(icon_file.read()).hexdigest()
    if len(icon_hashes) != icon_count:
        raise ValueError('物品图标数量与导出结果不一致')
    with open(os.path.join(PUBLIC, 'asset-source.json'), 'w', encoding='utf-8') as stream:
        json.dump({'minecraftVersion': VERSION, 'clientJarSha256': digest.hexdigest(),
                   'blockStates': len(states), 'blockModels': len(models),
                   'textures': texture_count, 'derivedTextures': derived_count,
                   'itemIcons': icon_count, 'iconHashes': icon_hashes,
                   'missingModels': uniq if missing_models else [],
                   'textureHashes': texture_hashes, 'renderAssetHashes': render_hashes},
                  stream, ensure_ascii=False, indent=2)
    print(f'耗时 {time.time() - started_at:.0f}s')


if __name__ == '__main__':
    main()
