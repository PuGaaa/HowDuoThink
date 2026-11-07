# Nuxt 3 SSR：构建产物需要 Node 常驻进程，不能像 admin 那样静态托管进 nginx
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
# 只带运行时产物：API 地址经 NUXT_PUBLIC_API_BASE 在容器启动时注入，改配置不用重新构建
COPY --from=build /app/.output/ ./.output/
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
