import { auth } from '../firebase'

/**
 * Chamadas ao servidor da barbearia (Cloudflare Worker): POST /api/<nome>
 * com o token de login. Mesmo formato das antigas Cloud Functions
 * (`const res = await fn(dados); res.data`), para as telas não mudarem.
 *
 * Em produção o app e o servidor estão no mesmo endereço. Para testar o app
 * local contra o servidor publicado, defina VITE_API_BASE no app/.env.
 */
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? ''

export function callApi<Req, Res>(name: string) {
  return async (data: Req): Promise<{ data: Res }> => {
    const token = await auth.currentUser?.getIdToken()
    let res: Response
    try {
      res = await fetch(`${API_BASE}/api/${name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(data ?? {}),
      })
    } catch {
      throw new Error('Sem conexão com o servidor. Verifique a internet e tente de novo.')
    }
    const body = (await res.json().catch(() => null)) as
      | { result?: Res; error?: { code: string; message: string } }
      | null
    if (!res.ok || !body || body.error) {
      throw new Error(body?.error?.message ?? `Erro do servidor (${res.status}).`)
    }
    return { data: body.result as Res }
  }
}
