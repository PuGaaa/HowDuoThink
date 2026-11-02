export function useApi() {
  const config = useRuntimeConfig()
  const base = config.public.apiBase
  return {
    base,
    get: <T = unknown>(path: string) => $fetch<T>(base + path, { credentials: 'include' }),
    post: (path: string, body: any) => $fetch(base + path, { method: 'POST', credentials: 'include', body }),
    patch: (path: string, body: any) => $fetch(base + path, { method: 'PATCH', credentials: 'include', body }),
  }
}
