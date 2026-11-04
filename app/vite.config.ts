import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

export default defineConfig(({ mode }) => ({
  plugins: [uni()],
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
    'process.env.APP_API_BASE': JSON.stringify(process.env.APP_API_BASE || ''),
    'process.env.APP_PUBLIC_ORIGIN': JSON.stringify(process.env.APP_PUBLIC_ORIGIN || ''),
    'process.env.APP_H5_ORIGIN': JSON.stringify(process.env.APP_H5_ORIGIN || ''),
  },
}))
