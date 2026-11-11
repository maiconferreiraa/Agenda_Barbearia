export interface Env {
  ASSETS: Fetcher
  FIREBASE_PROJECT_ID: string
  APP_BASE_URL: string
  /** JSON da conta de serviço do Firebase (Configurações do projeto → Contas de serviço). */
  GOOGLE_SERVICE_ACCOUNT: string
  /** Código que transforma um cadastro em "proprietário". */
  OWNER_INVITE_CODE: string
}

/** Erro com código e mensagem que o app mostra ao usuário. */
export class ApiError extends Error {
  constructor(
    public code:
      | 'unauthenticated'
      | 'permission-denied'
      | 'invalid-argument'
      | 'not-found'
      | 'already-exists'
      | 'failed-precondition'
      | 'internal',
    message: string,
  ) {
    super(message)
  }
}

export const HTTP_STATUS: Record<ApiError['code'], number> = {
  unauthenticated: 401,
  'permission-denied': 403,
  'invalid-argument': 400,
  'not-found': 404,
  'already-exists': 409,
  'failed-precondition': 412,
  internal: 500,
}
