// Connection to the shared OpenCode background service.
//
// Reimplements the discovery/start logic of @opencode/client/service without the
// ESM-only package export, so the CommonJS Electron main process can use it:
//  1. read the registration file (~/.local/state/opencode/service.json)
//  2. probe /api/info for a healthy, compatible (2.x) service
//  3. otherwise spawn `opencode serve --service` and poll for readiness
// Auth is HTTP Basic with username `opencode` and the registration password.
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'

export interface OpenCodeConnection {
  url: string
  headers: Record<string, string>
  version?: string
  pid?: number
}

interface Registration {
  id?: string
  version?: string
  url?: string
  pid?: number
  password?: string
}

let active: OpenCodeConnection | null = null
let initPromise: Promise<OpenCodeConnection> | null = null

function registrationFile(): string {
  const state =
    process.env['XDG_STATE_HOME'] ?? path.join(os.homedir(), '.local', 'state')
  return path.join(state, 'opencode', 'service.json')
}

async function readRegistration(): Promise<Registration | undefined> {
  try {
    const text = await fs.readFile(registrationFile(), 'utf8')
    return JSON.parse(text) as Registration
  } catch {
    return undefined
  }
}

function authHeaders(password?: string): Record<string, string> {
  if (!password) return {}
  return {
    authorization: 'Basic ' + Buffer.from(`opencode:${password}`).toString('base64'),
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Probe a registered endpoint: healthy HTTP + compatible version. */
async function probe(info: Registration, timeoutMs = 2500): Promise<OpenCodeConnection | undefined> {
  if (!info.url) return undefined
  try {
    const res = await fetch(info.url.replace(/\/+$/, '') + '/api/info', {
      headers: authHeaders(info.password),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return undefined
    const data = (await res.json()) as { version?: string; pid?: number }
    const version = data.version ?? info.version
    if (typeof version === 'string' && !version.startsWith('2.')) return undefined
    return { url: info.url.replace(/\/+$/, ''), headers: authHeaders(info.password), version, pid: data.pid ?? info.pid }
  } catch {
    return undefined
  }
}

async function ensureService(): Promise<OpenCodeConnection> {
  // 1) Discover: healthy registered service?
  const registered = await probe((await readRegistration()) ?? {}, 2000)
  if (registered) return registered

  // 2) Ensure: start a contender and poll the registration for readiness.
  let child: ReturnType<typeof spawn> | undefined
  try {
    child = spawn('opencode', ['serve', '--service'], {
      stdio: 'ignore',
      detached: true,
      shell: true,
      windowsHide: true,
    })
    child.unref()
  } catch (err) {
    throw new Error(`Impossibile avviare il servizio OpenCode: ${String(err)}`)
  }

  const deadline = Date.now() + 25000
  while (Date.now() < deadline) {
    await delay(600)
    const reg = await readRegistration()
    if (!reg?.url) continue
    const candidate = await probe(reg, 2000)
    if (candidate) return candidate
  }
  throw new Error('Timeout: il servizio OpenCode non è diventato healthy (opencode serve --service)')
}

export async function conn(force = false): Promise<OpenCodeConnection> {
  if (initPromise && force) initPromise = null
  if (!initPromise) {
    initPromise = ensureService().catch((err) => {
      initPromise = null
      throw err
    })
  }
  active = await initPromise
  return active
}

export async function restartConnection(): Promise<OpenCodeConnection> {
  initPromise = null
  active = null
  return conn()
}

export async function stopService(): Promise<void> {
  const info = await readRegistration()
  if (!info?.pid) return
  try {
    process.kill(info.pid, 'SIGTERM')
  } catch {
    /* already gone */
  }
  // Wait briefly for the process to exit, then clear a stale registration.
  for (let i = 0; i < 20; i++) {
    await delay(250)
    let alive = false
    try {
      process.kill(info.pid, 0)
      alive = true
    } catch {
      alive = false
    }
    if (!alive) {
      const latest = await readRegistration()
      if (latest?.pid === info.pid) {
        await fs.rm(registrationFile(), { force: true }).catch(() => undefined)
      }
      break
    }
  }
}

export function connectionInfo(): { connected: boolean; url?: string } {
  return { connected: !!active, url: active?.url }
}

export interface ApiOptions {
  query?: Record<string, string | number | undefined>
  location?: string
  body?: unknown
  rawBody?: string
  contentType?: string
  headers?: Record<string, string>
}

export interface ApiResult {
  ok: boolean
  status: number
  data?: unknown
  text?: string
  error?: string
  contentType?: string
}

/** Perform one HTTP call against the OpenCode server. */
export async function apiRequest(method: string, path: string, opts: ApiOptions = {}): Promise<ApiResult> {
  const { url, headers: auth } = await conn()
  const target = new URL(url + path)
  if (opts.location) target.searchParams.set('location[directory]', opts.location)
  for (const [key, value] of Object.entries(opts.query ?? {})) {
    if (value === undefined) continue
    target.searchParams.set(key, String(value))
  }

  const h: Record<string, string> = { ...auth, ...(opts.headers ?? {}) }
  let body: string | undefined
  if (opts.rawBody !== undefined) {
    body = opts.rawBody
    h['content-type'] = opts.contentType ?? 'application/octet-stream'
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body)
    h['content-type'] = 'application/json'
  }

  let res: Response
  try {
    res = await fetch(target, { method, headers: h, body })
  } catch (err) {
    // Connection may have broken (service restart): retry with a fresh discovery.
    try {
      const retry = await restartConnection()
      res = await fetch(new URL(retry.url + path), {
        method,
        headers: { ...retry.headers, ...h },
        body,
      })
    } catch {
      return { ok: false, status: 0, error: String(err) }
    }
  }

  const contentType = res.headers.get('content-type') ?? ''
  const text = await res.text().catch(() => '')
  if (!res.ok) {
    let error = text || res.statusText
    try {
      const parsed = JSON.parse(text)
      error = parsed?.message ?? parsed?.error ?? text
      return { ok: false, status: res.status, data: parsed, error }
    } catch {
      return { ok: false, status: res.status, text, error }
    }
  }
  if (contentType.includes('application/json')) {
    try {
      return { ok: true, status: res.status, data: JSON.parse(text), contentType }
    } catch (err) {
      return { ok: false, status: res.status, text, error: `JSON non valido: ${String(err)}` }
    }
  }
  return { ok: true, status: res.status, data: text, text, contentType }
}
