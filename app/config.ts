/** 全局配置由 app/.env.development 与 app/.env.production 提供。 */
if (!process.env.APP_API_BASE) throw new Error("必须配置 APP_API_BASE");

export const API_BASE = process.env.APP_API_BASE;
export const PUBLIC_WEB_ORIGIN = process.env.PUBLIC_WEB_ORIGIN || "";
export const PUBLIC_H5_ORIGIN = process.env.PUBLIC_H5_ORIGIN || "";
