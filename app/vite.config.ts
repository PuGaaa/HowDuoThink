import { defineConfig, loadEnv } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [uni()],
    define: {
      'process.env.APP_API_BASE': JSON.stringify(env.APP_API_BASE || ''),
      'process.env.PUBLIC_WEB_ORIGIN': JSON.stringify(env.PUBLIC_WEB_ORIGIN || ''),
      'process.env.PUBLIC_H5_ORIGIN': JSON.stringify(env.PUBLIC_H5_ORIGIN || ''),
    },
  }
})
