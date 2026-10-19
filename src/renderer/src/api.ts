// Renderer-side client. Every request goes through the IPC bridge: the main
// process owns service discovery and the connection to the OpenCode server.

export interface ApiResult<T> {
  ok: boolean
  status: number
  data?: T
  text?: string
  error?: string
  contentType?: string
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export interface RequestOptions {
  query?: Record<string, string | number | undefined>
  location?: string
  body?: unknown
  rawBody?: string
  contentType?: string
}

export async function request<T = unknown>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await window.oc.request({
    method,
    path,
    query: opts.query,
    location: opts.location,
    body: opts.body,
    rawBody: opts.rawBody,
    contentType: opts.contentType,
  })
  if (!res.ok) throw new ApiError(String(res.error ?? `HTTP ${res.status}`), res.status)
  return (res.data ?? res.text) as T
}

/* ---------- Enable any TypeScript helpers ---------- */

export function qs(params: Record<string, string | number | undefined>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

export function fmtBytes(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const units = ['B', 'KB', 'MB', 'GB']
  let x = n
  let i = 0
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024
    i++
  }
  return `${x.toFixed(x < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

export function fmtMoney(n: number | undefined): string {
  if (n === undefined || n === null || !Number.isFinite(Number(n))) return '—'
  return `$${Number(n).toFixed(Number(n) < 10 ? 4 : 2)}`
}

export function fmtNum(n: number | undefined): string {
  if (n === undefined || n === null || !Number.isFinite(Number(n))) return '—'
  return Number(n).toLocaleString('it-IT')
}

export function fmtTime(ms: number | undefined): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString()
}

export function shortId(id: string | undefined, n = 10): string {
  if (!id) return ''
  return id.length > n ? id.slice(0, n) + '…' : id
}
