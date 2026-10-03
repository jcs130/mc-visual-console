"""Render inventory icons from the same Minecraft client JAR as the world textures."""
from io import BytesIO
import json
import math
import os
import zipfile

from PIL import Image, ImageDraw


def export_icons(jar_path: str, public_dir: str) -> int:
    icon_dir = os.path.join(public_dir, 'icons')
    os.makedirs(icon_dir, exist_ok=True)
    with zipfile.ZipFile(jar_path) as jar:
        files = set(jar.namelist())
        models = {
            name[len('assets/minecraft/models/'):-5]: json.loads(jar.read(name))
            for name in files
            if name.startswith('assets/minecraft/models/') and name.endswith('.json')
        }
        textures = {}
        resolved = {}

        def texture(name):
            name = name.removeprefix('minecraft:')
            if name not in textures:
                path = f'assets/minecraft/textures/{name}.png'
                if path not in files:
                    textures[name] = None
                else:
                    image = Image.open(BytesIO(jar.read(path))).convert('RGBA')
                    if image.height > image.width and name.startswith(('block/', 'item/')):
                        image = image.crop((0, 0, image.width, image.width))
                    textures[name] = image
            return textures[name]

        def model(name, stack=()):
            name = name.removeprefix('minecraft:')
            if name in resolved:
                return resolved[name]
            if name in stack or name not in models:
                return {'textures': {}, 'elements': []}
            source = models[name]
            parent = model(source['parent'], (*stack, name)) if 'parent' in source else {'textures': {}, 'elements': []}
            value = {'textures': {**parent['textures'], **source.get('textures', {})},
                     'elements': source.get('elements', parent['elements'])}
            resolved[name] = value
            return value

        def texture_name(reference, mapping):
            for _ in range(12):
                if not isinstance(reference, str):
                    return None
                if not reference.startswith('#'):
                    return reference.removeprefix('minecraft:')
                reference = mapping.get(reference[1:])
            return None

        def flat_icon(image):
            output = Image.new('RGBA', (32, 32))
            if image.height > image.width:
                image = image.crop((0, 0, image.width, image.width))
            image = image.copy()
            image.thumbnail((30, 30), Image.Resampling.NEAREST)
            if image.size != (30, 30):
                image = image.resize((30, 30), Image.Resampling.NEAREST)
            output.alpha_composite(image, ((32 - image.width) // 2, (32 - image.height) // 2))
            return output

        def special_icon(item):
            if item.endswith('_bed'):
                color = item[:-4]
                sheet = texture(f'entity/bed/{color}')
                if sheet:
                    top = Image.new('RGBA', (16, 32))
                    top.alpha_composite(sheet.crop((6, 6, 22, 22)), (0, 0))
                    top.alpha_composite(sheet.crop((6, 28, 22, 44)), (0, 16))
                    return flat_icon(top.rotate(45, expand=True, resample=Image.Resampling.NEAREST))
            if item in ('chest', 'trapped_chest', 'ender_chest'):
                kind = {'chest': 'normal', 'trapped_chest': 'trapped', 'ender_chest': 'ender'}[item]
                sheet = texture(f'entity/chest/{kind}')
                return flat_icon(sheet.crop((14, 14, 28, 28))) if sheet else None
            if item.endswith('shulker_box'):
                color = '' if item == 'shulker_box' else item.removesuffix('_shulker_box')
                sheet = texture(f'entity/shulker/shulker_{color}' if color else 'entity/shulker/shulker')
                return flat_icon(sheet.crop((16, 0, 32, 16))) if sheet else None
            if item.endswith('_banner'):
                wool = texture(f'block/{item.removesuffix("_banner")}_wool')
                if wool:
                    banner = Image.new('RGBA', (16, 24))
                    banner.alpha_composite(wool.resize((12, 17), Image.Resampling.NEAREST), (2, 0))
                    draw = ImageDraw.Draw(banner)
                    draw.rectangle((7, 17, 8, 23), fill='#886944')
                    return flat_icon(banner)
            skulls = {'skeleton_skull': 'entity/skeleton/skeleton',
                      'wither_skeleton_skull': 'entity/skeleton/wither_skeleton',
                      'player_head': 'entity/player/wide/steve',
                      'zombie_head': 'entity/zombie/zombie',
                      'creeper_head': 'entity/creeper/creeper',
                      'dragon_head': 'entity/enderdragon/dragon',
                      'piglin_head': 'entity/piglin/piglin'}
            if item in skulls:
                sheet = texture(skulls[item])
                return flat_icon(sheet.crop((8, 8, 16, 16))) if sheet else None
            special = {'shield': 'entity/shield_base_nopattern',
                       'conduit': 'entity/conduit/base',
                       'decorated_pot': 'entity/decorated_pot/decorated_pot_side',
                       'heavy_core': 'block/heavy_core'}
            sheet = texture(special[item]) if item in special else None
            return flat_icon(sheet.crop((0, 0, min(16, sheet.width), min(16, sheet.height)))) if sheet else None

        def project(vertex):
            x, y, z = vertex
            return (32 + 1.5 * (x + z - 16),
                    42 + 1.5 * ((x - z) / 2 - y * 0.8))

        def face_vertices(side, start, end):
            x0, y0, z0 = start
            x1, y1, z1 = end
            return {
                'up': ((x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)),
                'north': ((x0, y1, z0), (x1, y1, z0), (x1, y0, z0), (x0, y0, z0)),
                'east': ((x1, y1, z0), (x1, y1, z1), (x1, y0, z1), (x1, y0, z0)),
            }.get(side)

        def render_model(value):
            output = Image.new('RGBA', (64, 64))
            faces = []
            for element in value['elements']:
                start, end = element.get('from', [0, 0, 0]), element.get('to', [16, 16, 16])
                for side in ('up', 'north', 'east'):
                    face = element.get('faces', {}).get(side)
                    corners = face_vertices(side, start, end) if face else None
                    if not corners:
                        continue
                    name = texture_name(face.get('texture'), value['textures'])
                    image = texture(name) if name else None
                    if image is None:
                        continue
                    points = [project(corner) for corner in corners]
                    depth = sum(x + y - z for x, y, z in corners) / 4
                    uv = face.get('uv')
                    if not uv:
                        uv = [0, 0, 16, 16]
                    faces.append((depth, points, image, uv, side, face.get('rotation', 0)))
            for _, points, image, uv, side, rotation in sorted(faces, key=lambda entry: entry[0]):
                p0, p1, _, p3 = points
                ax, ay = p1[0] - p0[0], p1[1] - p0[1]
                bx, by = p3[0] - p0[0], p3[1] - p0[1]
                det = ax * by - ay * bx
                if abs(det) < 1e-6:
                    continue
                x0 = max(0, math.floor(min(point[0] for point in points)))
                x1 = min(64, math.ceil(max(point[0] for point in points)))
                y0 = max(0, math.floor(min(point[1] for point in points)))
                y1 = min(64, math.ceil(max(point[1] for point in points)))
                brightness = {'up': 1, 'north': 0.82, 'east': 0.68}[side]
                for py in range(y0, y1):
                    for px in range(x0, x1):
                        dx, dy = px + 0.5 - p0[0], py + 0.5 - p0[1]
                        a = (dx * by - dy * bx) / det
                        b = (ax * dy - ay * dx) / det
                        if not (0 <= a <= 1 and 0 <= b <= 1):
                            continue
                        if rotation == 90:
                            a, b = b, 1 - a
                        elif rotation == 180:
                            a, b = 1 - a, 1 - b
                        elif rotation == 270:
                            a, b = 1 - b, a
                        tx = (uv[0] + a * (uv[2] - uv[0])) / 16
                        ty = (uv[1] + b * (uv[3] - uv[1])) / 16
                        color = image.getpixel((min(image.width - 1, max(0, int(tx * image.width))),
                                                min(image.height - 1, max(0, int(ty * image.height)))))
                        if color[3]:
                            output.putpixel((px, py), tuple(int(channel * brightness) for channel in color[:3]) + (color[3],))
            return output.resize((32, 32), Image.Resampling.NEAREST)

        count = 0
        for name in sorted(models):
            if not name.startswith('item/') or '/' in name[len('item/'):]:
                continue
            item = name[len('item/'):]
            value = model(name)
            layers = []
            for layer in ('layer0', 'layer1', 'layer2'):
                texture_path = texture_name(value['textures'].get(layer), value['textures'])
                image = texture(texture_path) if texture_path else None
                if image is not None:
                    layers.append(flat_icon(image))
            if layers:
                icon = layers[0]
                for layer in layers[1:]:
                    icon.alpha_composite(layer)
            elif value['elements']:
                icon = render_model(value)
            else:
                icon = special_icon(item)
                if icon is None:
                    icon = flat_icon(texture(f'block/{item}') or texture(f'item/{item}') or
                                     Image.new('RGBA', (16, 16), '#a337c8'))
            if not icon.getbbox():
                icon = special_icon(item)
                if icon is None or not icon.getbbox():
                    continue
            icon.save(os.path.join(icon_dir, f'{item}.png'))
            count += 1
        return count
