#!/bin/bash
# 生成 iOS 自定义 storyboard 启动图 zip（DCloud / uni-app 云打包用）
# 原图直出，不做任何缩放。用法: bash make-zip.sh
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"

STORY="LaunchScreen.storyboard"
BG="bg.png"
OUT="splash-storyboard.zip"
BGDST="dc_launchscreen_bg.png"

# 1) 源文件必须齐全，缺一个直接停，绝不产出残缺包
for f in "$STORY" "$BG"; do
  if [ ! -f "$f" ]; then
    echo "❌ 缺少 $f，已中止（不会生成 zip）"
    exit 1
  fi
done

W=$(sips -g pixelWidth "$BG" | awk '/pixelWidth/ {print $2}')
H=$(sips -g pixelHeight "$BG" | awk '/pixelHeight/ {print $2}')
KB=$(( $(stat -f%z "$BG") / 1024 ))
echo "▶ 原图: ${W} x ${H} px, ${KB} KB"

# 2) 重建 build 目录（只清产物，源文件在根目录，删不到）
rm -f build/*.png build/*.storyboard 2>/dev/null || true
mkdir -p build

cp "$STORY" "build/$STORY"
cp "$BG" "build/$BGDST"
echo "▶ 待打包: $(cd build && ls | tr '\n' ' ')"

# 3) 打包（-j 平铺，根目录不能有文件夹）
rm -f "$OUT"
(cd build && zip -j -X "../$OUT" "$STORY" "$BGDST")

# 4) 完整性校验：必须是 2 个文件且含 storyboard，否则判失败
COUNT=$(unzip -l "$OUT" | awk '$4 ~ /\.(storyboard|png)$/ {c++} END {print c+0}')
if [ "$COUNT" -ne 2 ] || ! unzip -l "$OUT" | grep -q "LaunchScreen.storyboard"; then
  echo ""
  echo "❌ 打包结果不完整（实际 $COUNT 个文件），已判失败："
  unzip -l "$OUT"
  exit 1
fi

echo ""
echo "✅ 校验通过：zip 根目录含 2 个文件，无文件夹"
unzip -l "$OUT"
echo ""
echo "→ 文件位置: $ROOT/$OUT"
echo "→ 下一步: manifest.json → App启动界面配置 → iOS启动图设置 → 自定义storyboard → 选这个 zip → 云端打包"

if [ "$W" -gt 2500 ]; then
  echo ""
  echo "⚠️  原图宽 ${W}px 偏大：按 1x 加载时内存占用约 $(( W * H * 4 / 1024 / 1024 ))MB。"
  echo "    能跑，只是启动瞬间内存尖峰偏高，后续想优化再按倍率出图。"
fi
