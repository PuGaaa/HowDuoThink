/** 全局配置。
 * API_BASE 随构建环境自动切换：HBuilderX「运行」(development) 连本地 server，「发行」(production) 连线上。
 * 禁止发布前手改 DEV 值切环境（env-drift 教训——本项目案例库 wrong-env/env-drift 讲的就是这个）。
 * 上线发布清单：PROD_API_BASE 替换为真实域名（全工程仅此一处需要改）。
 */
const DEV_API_BASE = 'http://localhost:8000'
const PROD_API_BASE = 'https://REPLACE-WITH-PROD-DOMAIN'
export const API_BASE = process.env.NODE_ENV === 'development' ? DEV_API_BASE : PROD_API_BASE
