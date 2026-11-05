import { defineConfig, loadEnv } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

export default defineConfig(({ mode }) => {
  // HBuilderX 编译时进程 cwd 在其插件目录，项目根以 UNI_INPUT_DIR 为准（与 uni 自身一致）
  const env = loadEnv(mode, process.env.UNI_INPUT_DIR || process.cwd(), '')

  return {
    plugins: [uni()],
    define: {
      'process.env.APP_API_BASE': JSON.stringify(env.APP_API_BASE || ''),
      'process.env.PUBLIC_WEB_ORIGIN': JSON.stringify(env.PUBLIC_WEB_ORIGIN || ''),
      'process.env.PUBLIC_H5_ORIGIN': JSON.stringify(env.PUBLIC_H5_ORIGIN || ''),
    },
  }
})
