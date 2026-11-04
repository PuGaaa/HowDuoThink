/** 全局配置。
 * API_BASE 随构建环境自动切换：HBuilderX「运行」(development) 连本地 server，「发行」(production) 连线上。
 * 禁止发布前手改 DEV 值切环境（env-drift 教训——本项目案例库 wrong-env/env-drift 讲的就是这个）。
 * 生产构建必须注入 APP_API_BASE；未注入时直接失败，不生成可点击的占位地址。
 */
const DEV_API_BASE = process.env.APP_API_BASE || 'http://localhost:8000'
const PROD_API_BASE = process.env.APP_API_BASE || ''
if (process.env.NODE_ENV === 'production' && PROD_API_BASE.length === 0) throw new Error('生产构建必须配置 APP_API_BASE')
export const API_BASE = process.env.NODE_ENV === 'development' ? DEV_API_BASE : PROD_API_BASE
export const PUBLIC_WEB_ORIGIN = process.env.APP_PUBLIC_ORIGIN || ''
