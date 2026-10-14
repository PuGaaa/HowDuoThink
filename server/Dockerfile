# —— 阶段 1：管理端前端构建 ——
FROM node:20-alpine AS admin-build
WORKDIR /build
COPY admin/package.json admin/package-lock.json ./
RUN npm ci
COPY admin/ ./
RUN npm run build

# —— 阶段 2：api 运行镜像（含管理端静态产物 admin_dist/）——
FROM python:3.12-slim
WORKDIR /app/hdx
COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server/ .
COPY --from=admin-build /build/dist /app/hdx/admin_dist
ENV FASTEMBED_CACHE_DIR=/srv/hdt/.fastembed
EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
