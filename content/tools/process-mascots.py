#!/tmp/pilvenv/bin/python
"""吉祥物后处理 v3（单尺寸）：输入 ui/images/<名>.png（透明抠图最佳，不透明图自动中心方裁）
→ 主体对齐 → 192×192 透明 PNG → app/static/mascots/<名>.png（无后缀，全站唯一档）。
用法: /tmp/pilvenv/bin/python process-mascots.py  （在仓库根目录运行）"""
from PIL import Image
import os

SRC = 'ui/images'
OUT_APP = 'app/static/mascots'
OUT_RAW = 'design/mascots/raw'
NAMES = ['frog', 'otter', 'snail', 'rabbit', 'dino']
SIZE = 192


def process(name):
    im = Image.open(f'{SRC}/{name}.png').convert('RGBA')
    has_alpha = im.getchannel('A').getextrema()[0] < 255
    if has_alpha:
        # 抠图输入：按 alpha 包围盒裁剪主体
        im = im.crop(im.getchannel('A').getbbox())
    else:
        # 不透明输入（AI 生图带背景）：中心方裁
        side = min(im.size)
        cx, cy = im.size[0] // 2, im.size[1] // 2
        half = side // 2
        im = im.crop((cx - half, cy - half, cx + half, cy + half))
    # 补正方形居中 → 目标尺寸
    side = max(im.size)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(im, ((side - im.size[0]) // 2, (side - im.size[1]) // 2), im)
    out = sq.resize((SIZE, SIZE), Image.LANCZOS)
    os.makedirs(OUT_APP, exist_ok=True)
    os.makedirs(OUT_RAW, exist_ok=True)
    out.save(f'{OUT_APP}/{name}.png', optimize=True)
    out.save(f'{OUT_RAW}/{name}.png', optimize=True)
    print(f'{name}: {im.size} → {OUT_APP}/{name}.png ({os.path.getsize(f"{OUT_APP}/{name}.png") // 1024}KB)')


for n in NAMES:
    process(n)
print('完成')
