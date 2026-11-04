# app · 主应用（uni-app X 蒸汽模式）

好多星的闯关玩法主端：H5 先行验证玩法，后编译 iOS。页面：首页章节地图 / 章节详情 /
闯关 / 复盘 / 任务 / 海报 / 手册 / 我的。

## 启动

- 用 HBuilderX 5.21+ 打开本目录，勾选蒸汽模式（manifest 已配置 `"vapor": true`）
- 首次运行前在本目录执行 `npm ci` 安装二维码编码依赖
- 运行到浏览器验证玩法（H5 端自动以 VDOM 模式回落运行，属正常现象）

## 分享海报

- `APP_H5_ORIGIN` 配置 H5 应用公开根地址，用于生成指向游客首关的海报二维码；未配置时隐藏扫码入口。
- `APP_PUBLIC_ORIGIN` 仍是 Web 社区文章地址，与 H5 应用地址分开配置。

## 案例内容（生死管线在本端的落点）

- 案例数据：`data/cases/`；类型定义 `types/case.ts` 是**唯一权威源**
  （uni-app x 编译要求 import 不出项目根，故不外提）
- 新增案例前先读 `../docs/案例写作规范.md`；入库自检：
  `node ../content/pipeline/validate.mjs data/cases/<case>.ts`
- 官方案例也可经 server 发布走 casepack 动态同步进包（见根 README「内容流向」）

## 进度云同步

登录后进度经 server `/api/me/progress` 上传/拉取（整体覆盖语义），
关卡内容经 `/api/casepack?since=version` 增量同步。

## 关联

- 后端接口与启动：`../server/README.md`
- 内容生产流程：`../content/README.md`
