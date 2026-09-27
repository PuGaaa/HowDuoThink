#!/tmp/pilvenv/bin/python
"""吉祥物后处理 v2（输入已抠图带 alpha）：裁剪主体 → 白圆徽章合成 → 四档尺寸。
用法: process-mascots.py  （在仓库根目录运行）"""
from PIL import Image, ImageDraw
import os

SRC = 'ui/images'
OUT_APP = 'app/static/mascots'
OUT_RAW = 'design/mascots/raw'
NAMES = ['frog', 'otter', 'snail', 'rabbit', 'dino']

def process(name):
    im = Image.open(f'{SRC}/{name}.png').convert('RGBA')
    # 按 alpha 包围盒裁剪
    bbox = im.getchannel('A').getbbox()
    im = im.crop(bbox)
    side = max(im.size)
    sq = Image.new('RGBA', (side, side), (255, 255, 255, 0))
    sq.paste(im, ((side - im.size[0]) // 2, (side - im.size[1]) // 2), im)
    # 白圆徽章：白圆打底 + 主体；4x 超采样抗锯齿圆边
    big = side * 4
    badge = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(badge)
    d.ellipse((0, 0, big - 1, big - 1), fill=(255, 255, 255, 255))
    badge = badge.resize((side, side), Image.LANCZOS)
    badge.alpha_composite(sq)
    os.makedirs(OUT_APP, exist_ok=True)
    os.makedirs(OUT_RAW, exist_ok=True)
    badge.save(f'{OUT_RAW}/{name}.png')
    for sz in (192, 96, 48, 24):
        badge.resize((sz, sz), Image.LANCZOS).save(f'{OUT_APP}/{name}-{sz}.png')
    print(f'{name}: 主体 {im.size} → 圆形徽章 4 档')

for n in NAMES:
    process(n)
print('完成')
