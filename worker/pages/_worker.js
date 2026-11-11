// Endereço público da barbearia: https://barbearia-prime.pages.dev
// Serve o app (arquivos do build) e repassa /api/* para o servidor
// (Worker barbearia-prime), onde ficam a cobrança, o webhook e a régua diária.
const API = 'https://barbearia-prime.maicon-jbf.workers.dev'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      const target = new URL(url.pathname + url.search, API)
      return fetch(new Request(target, request))
    }
    const res = await env.ASSETS.fetch(request)
    // app de página única: rota desconhecida (ex.: /app/subscription) abre o index
    if (res.status === 404 && request.method === 'GET' && !url.pathname.includes('.')) {
      return env.ASSETS.fetch(new Request(new URL('/', url), request))
    }
    return res
  },
}
