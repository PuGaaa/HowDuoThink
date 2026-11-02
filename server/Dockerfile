# —— 阶段 1：管理端前端构建 + 官方案例包生成 ——
FROM node:20-alpine AS admin-build
WORKDIR /build
COPY admin/package.json admin/package-lock.json ./
RUN npm ci
COPY admin/ ./
RUN npm run build
# server/seed/*.json 是不入 git 的构建产物：构建期从唯一内容源 app/data/cases 生成
COPY content/tools/export-case.mjs content/tools/export-case.mjs
COPY app/data/cases/ app/data/cases/
RUN node content/tools/export-case.mjs

# —— 阶段 2：api 运行镜像（含管理端静态产物 admin_dist/）——
FROM python:3.12-slim
WORKDIR /app/hdx
COPY server/requirements.lock server/requirements.in ./
RUN pip install --no-cache-dir -r requirements.lock
COPY server/ .
COPY --from=admin-build /build/server/seed ./seed/
COPY --from=admin-build /build/dist /app/hdx/admin_dist
# 与 docker-compose 的 fastembed-cache 卷同路径：模型缓存持久化，重建容器不重新下载
ENV FASTEMBED_CACHE_DIR=/app/hdx/.fastembed
EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
