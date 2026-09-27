# design/mascots

内心小动物的角色资产目录。人设与触发规则的**权威定义在 `docs/角色设定集.md`**，这里只放产出物。

## 阶段约定

1. **几何 mark 阶段**：SVG 矢量 mark（设计库 `figma-design.mjs` 内），16px 以下兜底 ✓
2. **生图 3D 阶段（当前）**：用户生图 → `content/tools/process-mascots.py` 洗背景 + 圆形徽章化 → `app/static/mascots/` 四档尺寸 ✓
3. **画师阶段（远期）**：委托出表情差分与出场动画素材

生图提示词包见 `生图提示词.md`（统一风格锚 + 五角色描述 + 一致性技巧）。

## 换皮契约

应用层只依赖 `app/utils/mascot.ts` 里的 `mascotId / emoji / line` 抽象，
换皮 = 替换 emoji 为图片资源（`app/static/mascots/`）+ 组件样式，不改触发逻辑与文案。
