import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// base=/admin/ 与生产托管一致（api 容器 StaticFiles 挂 /admin/）；
// dev 代理 /api 到本地 server（server/dev.sh 默认 8000）。
export default defineConfig({
  plugins: [vue()],
  base: '/admin/',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})
