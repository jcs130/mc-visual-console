#!/usr/bin/env python3
"""把现代画面（萌悦/千灯纪 modern-viewer）的默认角色从「灯守系列」改成「我的世界官方角色」。

背景（2026-09-23 读源码定谳，见 docs/OFFICIAL-AVATAR.md）：
  · 画面角色由**两套各自独立的档案表**决定，都在 `viewer-service/modern-viewer/modern-viewer.js`
    （该文件是派生资源，被 .gitignore 忽略；本脚本负责在解压后把它改对）：
      模型表 r4 → TP   默认 `var a4="ember-wayfarer"`（星火旅人 · 日系 VROID 人形）
      皮肤表 EP → IP   默认 `var e4="lantern-warden"`（灯守正装；四档 texture 都是内嵌 base64）
  · 本体的皮肤**不吃实体载荷里的 skinUrl**：客户端走
    `${us.texture}#lantern-skin=${us.id}` + applyTemporaryPlayerSkinOverride。
  · 宿主改档只能经**父窗口 postMessage**（{schemaVersion:1,type:"lantern-avatar-skin",skinId}，
    且要求 t.source===parent）⇒ **直接打开 :7800 时没有宿主**，只能吃 bundle 里的默认档。
  · 自证出口：#viewer-canvas 的 dataset（data-player-skin-label / data-player-model-label /
    ...-status），可用浏览器 locator.get_attribute 读回，不看画面也能验证。

本脚本做两件事（幂等；每处替换都要求唯一命中，否则整体不动手）：
  ① 模型档默认 a4：ember-wayfarer → minecraft-classic（原版方块人；客户端会走 restoreNative）
  ② 皮肤表四档 label/subtitle/texture 全部指向官方贴图
     （/textures/1.21.1/entity/player/{wide/steve,slim/alex,slim/steve,wide/alex}.png，
      由桥接的 /textures/ 路由出；id 保持不动 ⇒ e4 等引用不破）

⚠️ 教训（踩过一次）：别把**皮肤档** e4 也设成 minecraft-classic —— 那个 id 只存在于**模型表**，
   皮肤表取不到 ⇒ t4() 返回 undefined ⇒ us.id 崩溃 ⇒ 页面「现代 3D 渲染器启动失败 ·
   Cannot read properties of undefined (reading 'id')」。跨表复用 id 前先确认它属于哪张表。

用法：
  python patch_official_avatar.py [--bundle <path>] [--check]
"""
from __future__ import annotations

import argparse
import io
import os
import shutil
import sys

DEFAULT_BUNDLE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'modern-viewer', 'modern-viewer.js',
)
TEX = '/textures/1.21.1/entity/player/'
BACKUP_SUFFIX = '.bak-official-avatar'

# (旧串, 新串, 说明)
_EDITS = [
    ('var a4="ember-wayfarer"', 'var a4="minecraft-classic"', '模型档默认：星火旅人 → 原版方块人'),
    ('texture:mie', f'texture:"{TEX}wide/steve.png"', '皮肤①贴图：灯守 → 官方史蒂夫（宽身）'),
    ('\\u706F\\u5B88\\u6B63\\u88C5', '\\u539F\\u7248\\u53F2\\u8482\\u592B', '皮肤①标签：灯守正装 → 原版史蒂夫'),
    ('\\u9752\\u9EDB\\u5B88\\u706F\\u888D \\xB7 \\u7425\\u73C0\\u63D0\\u706F\\u7EB9',
     '\\u5B98\\u65B9\\u76AE\\u80A4 \\xB7 \\u7ECF\\u5178\\u5BBD\\u8EAB', '皮肤①副题：官方皮肤 · 经典宽身'),
    ('texture:hie', f'texture:"{TEX}slim/alex.png"', '皮肤②贴图：千灯 → 官方亚历克斯（纤细）'),
    ('\\u5343\\u706F\\u7977\\u8863', '\\u539F\\u7248\\u4E9A\\u5386\\u514B\\u65AF', '皮肤②标签：千灯祷衣 → 原版亚历克斯'),
    ('\\u6708\\u767D\\u7977\\u8863 \\xB7 \\u6E56\\u84DD\\u4E0E\\u91D1\\u7EBF',
     '\\u5B98\\u65B9\\u76AE\\u80A4 \\xB7 \\u7EA4\\u7EC6\\u8EAB\\u5F62', '皮肤②副题：官方皮肤 · 纤细身形'),
    ('texture:pie', f'texture:"{TEX}slim/steve.png"', '皮肤③贴图：守夜 → 史蒂夫 · 纤细'),
    ('\\u5B88\\u591C\\u94C1\\u8863', '\\u53F2\\u8482\\u592B \\xB7 \\u7EA4\\u7EC6', '皮肤③标签：守夜铁衣 → 史蒂夫 · 纤细'),
    ('\\u70AD\\u9ED1\\u77ED\\u7532 \\xB7 \\u7089\\u706B\\u62A4\\u80A9',
     '\\u5B98\\u65B9\\u76AE\\u80A4 \\xB7 \\u7EA4\\u7EC6\\u53F2\\u8482\\u592B', '皮肤③副题：官方皮肤 · 纤细史蒂夫'),
    ('texture:fie', f'texture:"{TEX}wide/alex.png"', '皮肤④贴图：荒野 → 亚历克斯 · 宽身'),
    ('\\u8352\\u91CE\\u6D4B\\u7ED8', '\\u4E9A\\u5386\\u514B\\u65AF \\xB7 \\u5BBD\\u8EAB', '皮肤④标签：荒野测绘 → 亚历克斯 · 宽身'),
    ('\\u82D4\\u7EFF\\u65C5\\u88C5 \\xB7 \\u7F8A\\u76AE\\u5730\\u56FE\\u888B',
     '\\u5B98\\u65B9\\u76AE\\u80A4 \\xB7 \\u5BBD\\u8EAB\\u4E9A\\u5386\\u514B\\u65AF', '皮肤④副题：官方皮肤 · 宽身亚历克斯'),
]
DONE_MARKER = f'texture:"{TEX}wide/steve.png"'


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--bundle', default=DEFAULT_BUNDLE)
    ap.add_argument('--check', action='store_true', help='只检查，不改文件')
    args = ap.parse_args()

    sys.stdout.reconfigure(encoding='utf-8')
    path = args.bundle
    if not os.path.isfile(path):
        print(f'✗ 找不到 bundle：{path}')
        print('  （派生资源不入库；请先由上游/容器解压出 modern-viewer/ 再跑本脚本）')
        return 2

    text = io.open(path, encoding='utf-8', errors='replace').read()
    patched = text.count(DONE_MARKER) >= 1 and text.count('texture:mie') == 0

    if args.check:
        print(f'{"已打补丁" if patched else "未打补丁"}：{path}')
        for old, _new, desc in _EDITS:
            print(f'  {text.count(old):>2} × {desc}')
        return 0

    if patched:
        print(f'✓ 已是官方角色档，无需改动：{path}')
        return 0

    bad = [(old, desc) for old, _n, desc in _EDITS if text.count(old) != 1]
    if bad:
        print('✗ 以下替换点不是唯一命中，为安全整体不动手：')
        for old, desc in bad:
            print(f'  {text.count(old)} × {desc}  ← {old[:50]!r}')
        print('  （多半是上游 bundle 版本变了，请先重新核对档案表再改脚本）')
        return 1

    backup = path + BACKUP_SUFFIX
    if not os.path.exists(backup):
        shutil.copy2(path, backup)
        print(f'已备份 → {os.path.basename(backup)}')

    out = text
    for old, new, desc in _EDITS:
        out = out.replace(old, new, 1)
        print(f'  ✓ {desc}')
    io.open(path, 'w', encoding='utf-8', newline='').write(out)

    check = io.open(path, encoding='utf-8', errors='replace').read()
    left = sum(check.count(old) for old, _n, _d in _EDITS)
    print(f'回读：残留旧串 {left} 处（应为 0）；文件 {len(text)} → {len(check)} 字符')
    print('完成。提醒：浏览器需 Ctrl+F5 硬刷新（bundle 有缓存）。')
    return 0 if left == 0 else 1


if __name__ == '__main__':
    raise SystemExit(main())
