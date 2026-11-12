import type { Env } from './env'
import { gfetch, googleToken } from './google'

/**
 * Cliente mínimo do Firestore pela API REST (o firebase-admin não roda no Worker).
 * Datas viram Timestamp no Firestore e voltam como Date.
 */

type FsValue = Record<string, unknown>
export type Data = Record<string, unknown>
export interface Doc {
  id: string
  path: string
  data: Data
}

// ---------- conversão JS ⇄ Firestore ----------

function encode(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null }
  if (v instanceof Date) return { timestampValue: v.toISOString() }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (typeof v === 'string') return { stringValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } }
  if (typeof v === 'object') return { mapValue: { fields: encodeFields(v as Data) } }
  throw new Error(`Tipo não suportado no Firestore: ${typeof v}`)
}

function encodeFields(obj: Data): Record<string, FsValue> {
  const out: Record<string, FsValue> = {}
  for (const [k, val] of Object.entries(obj)) if (val !== undefined) out[k] = encode(val)
  return out
}

function decode(v: FsValue): unknown {
  if ('nullValue' in v) return null
  if ('booleanValue' in v) return v.booleanValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return Number(v.doubleValue)
  if ('stringValue' in v) return v.stringValue
  if ('timestampValue' in v) return new Date(v.timestampValue as string)
  if ('referenceValue' in v) return v.referenceValue
  if ('arrayValue' in v) return ((v.arrayValue as { values?: FsValue[] }).values ?? []).map(decode)
  if ('mapValue' in v) return decodeFields((v.mapValue as { fields?: Record<string, FsValue> }).fields ?? {})
  return null
}

function decodeFields(fields: Record<string, FsValue>): Data {
  const out: Data = {}
  for (const [k, val] of Object.entries(fields)) out[k] = decode(val)
  return out
}

/** { 'usage.abc': 1, status: 'x' } → objeto aninhado + lista de campos do updateMask. */
function nestUpdates(flat: Data): { fields: Record<string, FsValue>; mask: string[] } {
  const nested: Data = {}
  for (const [path, val] of Object.entries(flat)) {
    const parts = path.split('.')
    let cur = nested
    parts.slice(0, -1).forEach((p) => {
      cur[p] = (cur[p] as Data) ?? {}
      cur = cur[p] as Data
    })
    cur[parts[parts.length - 1]] = val
  }
  const mask = Object.keys(flat).map((p) =>
    p
      .split('.')
      .map((seg) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(seg) ? seg : '`' + seg.replace(/`/g, '\\`') + '`'))
      .join('.'),
  )
  return { fields: encodeFields(nested), mask }
}

// ---------- cliente ----------

export interface Filter {
  field: string
  op: '==' | '<' | '<=' | '>' | '>=' | 'in' | 'array-contains-any'
  value: unknown
}

const OPS: Record<Filter['op'], string> = {
  '==': 'EQUAL',
  '<': 'LESS_THAN',
  '<=': 'LESS_THAN_OR_EQUAL',
  '>': 'GREATER_THAN',
  '>=': 'GREATER_THAN_OR_EQUAL',
  in: 'IN',
  'array-contains-any': 'ARRAY_CONTAINS_ANY',
}

type Write = Record<string, unknown>

export class Firestore {
  private root: string
  private docsBase: string

  constructor(private env: Env) {
    this.root = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)`
    this.docsBase = `https://firestore.googleapis.com/v1/${this.root}/documents`
  }

  /** Gera um id no formato do Firestore (20 caracteres). */
  newId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    const bytes = crypto.getRandomValues(new Uint8Array(20))
    return Array.from(bytes, (b) => chars[b % chars.length]).join('')
  }

  private name(path: string) {
    return `${this.root}/documents/${path}`
  }

  private async call(url: string, init: RequestInit = {}): Promise<unknown> {
    const token = await googleToken(this.env)
    const res = await gfetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    })
    if (res.status === 404 && (init.method ?? 'GET') === 'GET') return null
    if (!res.ok) {
      const body = await res.text()
      const err = new Error(`Firestore ${res.status}: ${body.slice(0, 400)}`) as Error & { status: number }
      err.status = res.status
      throw err
    }
    return res.json()
  }

  async get(path: string, transaction?: string): Promise<Doc | null> {
    const qs = transaction ? `?transaction=${encodeURIComponent(transaction)}` : ''
    const raw = (await this.call(`${this.docsBase}/${path}${qs}`)) as { name: string; fields?: Record<string, FsValue> } | null
    if (!raw) return null
    return { id: path.split('/').pop()!, path, data: decodeFields(raw.fields ?? {}) }
  }

  async query(
    collection: string,
    opts: { where?: Filter[]; orderBy?: { field: string; dir?: 'asc' | 'desc' }; limit?: number } = {},
    transaction?: string,
  ): Promise<Doc[]> {
    const filters = (opts.where ?? []).map((f) => ({
      fieldFilter: { field: { fieldPath: f.field }, op: OPS[f.op], value: encode(f.value) },
    }))
    const structuredQuery: Record<string, unknown> = { from: [{ collectionId: collection }] }
    if (filters.length === 1) structuredQuery.where = filters[0]
    if (filters.length > 1) structuredQuery.where = { compositeFilter: { op: 'AND', filters } }
    if (opts.orderBy) {
      structuredQuery.orderBy = [
        { field: { fieldPath: opts.orderBy.field }, direction: opts.orderBy.dir === 'desc' ? 'DESCENDING' : 'ASCENDING' },
      ]
    }
    if (opts.limit) structuredQuery.limit = opts.limit

    const rows = (await this.call(`${this.docsBase}:runQuery`, {
      method: 'POST',
      body: JSON.stringify({ structuredQuery, ...(transaction ? { transaction } : {}) }),
    })) as { document?: { name: string; fields?: Record<string, FsValue> } }[]

    return rows
      .filter((r) => r.document)
      .map((r) => {
        const path = r.document!.name.split('/documents/')[1]
        return { id: path.split('/').pop()!, path, data: decodeFields(r.document!.fields ?? {}) }
      })
  }

  // ----- escritas (sempre via commit, sozinhas ou em transação) -----

  setWrite(path: string, data: Data, merge = false): Write {
    const w: Write = { update: { name: this.name(path), fields: encodeFields(data) } }
    if (merge) w.updateMask = { fieldPaths: nestUpdates(Object.fromEntries(Object.keys(data).map((k) => [k, 1]))).mask }
    return w
  }

  createWrite(path: string, data: Data): Write {
    return { update: { name: this.name(path), fields: encodeFields(data) }, currentDocument: { exists: false } }
  }

  /** Atualiza só os campos informados (aceita caminhos com ponto: 'usage.abc'). Doc precisa existir. */
  updateWrite(path: string, flat: Data): Write {
    const { fields, mask } = nestUpdates(flat)
    return { update: { name: this.name(path), fields }, updateMask: { fieldPaths: mask }, currentDocument: { exists: true } }
  }

  deleteWrite(path: string): Write {
    return { delete: this.name(path) } as Write
  }

  async commit(writes: Write[], transaction?: string): Promise<void> {
    if (writes.length === 0 && !transaction) return
    await this.call(`${this.docsBase}:commit`, {
      method: 'POST',
      body: JSON.stringify({ writes, ...(transaction ? { transaction } : {}) }),
    })
  }

  set(path: string, data: Data, merge = false) {
    return this.commit([this.setWrite(path, data, merge)])
  }

  create(path: string, data: Data) {
    return this.commit([this.createWrite(path, data)])
  }

  async add(collection: string, data: Data): Promise<string> {
    const id = this.newId()
    await this.create(`${collection}/${id}`, data)
    return id
  }

  update(path: string, flat: Data) {
    return this.commit([this.updateWrite(path, flat)])
  }

  /** Transação: lê com `tx.get/tx.query`, junta escritas em `tx.writes`; refaz se houver conflito. */
  async runTransaction<T>(fn: (tx: Transaction) => Promise<T>, attempts = 3): Promise<T> {
    for (let i = 0; ; i++) {
      const begin = (await this.call(`${this.docsBase}:beginTransaction`, {
        method: 'POST',
        body: JSON.stringify({ options: { readWrite: {} } }),
      })) as { transaction: string }
      const tx = new Transaction(this, begin.transaction)
      try {
        const result = await fn(tx)
        await this.commit(tx.writes, begin.transaction)
        return result
      } catch (err) {
        const status = (err as { status?: number }).status
        if ((status === 409 || status === 400) && i < attempts - 1 && String(err).includes('ABORTED')) continue
        if (!tx.committed) await this.rollback(begin.transaction).catch(() => {})
        throw err
      }
    }
  }

  private rollback(transaction: string) {
    return this.call(`${this.docsBase}:rollback`, { method: 'POST', body: JSON.stringify({ transaction }) })
  }
}

export class Transaction {
  writes: Write[] = []
  committed = false
  constructor(private fs: Firestore, private id: string) {}

  get(path: string) {
    return this.fs.get(path, this.id)
  }
  query(collection: string, opts: Parameters<Firestore['query']>[1]) {
    return this.fs.query(collection, opts, this.id)
  }
  set(path: string, data: Data, merge = false) {
    this.writes.push(this.fs.setWrite(path, data, merge))
  }
  create(path: string, data: Data) {
    this.writes.push(this.fs.createWrite(path, data))
  }
  update(path: string, flat: Data) {
    this.writes.push(this.fs.updateWrite(path, flat))
  }
  delete(path: string) {
    this.writes.push(this.fs.deleteWrite(path))
  }
}
