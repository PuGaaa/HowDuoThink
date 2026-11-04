import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
    'process.env.APP_API_BASE': JSON.stringify(process.env.APP_API_BASE || ''),
    'process.env.APP_PUBLIC_ORIGIN': JSON.stringify(process.env.APP_PUBLIC_ORIGIN || ''),
  },
}))
