export function useApi() {
  const config = useRuntimeConfig()
  const base = config.public.apiBase
  return {
    get: (path: string) => $fetch(base + path, { credentials: 'include' }),
    post: (path: string, body: any) => $fetch(base + path, { method: 'POST', credentials: 'include', body }),
  }
}
