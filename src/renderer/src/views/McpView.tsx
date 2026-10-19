import React, { useEffect, useMemo, useState } from 'react'
import { useOc } from '../state'
import { Badge, Btn, Card, ConfirmBtn, ErrBox, Select, TextInput, toast, usePoll } from '../ui'
import { ApiError, request } from '../api'

interface McpStatusShape {
  status?: { status?: string; message?: string; error?: string; url?: string } | string
}

interface McpServer {
  name: string
  status?: McpStatusShape['status']
  integrationID?: string
}

interface McpResource {
  server?: string
  name?: string
  uri?: string
  mimeType?: string
  kind?: 'resource' | 'template'
}

interface FormField {
  key: string
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'multiselect' | 'external'
  title?: string
  description?: string
  required?: boolean
  hidden?: boolean
  placeholder?: string
  default?: unknown
  options?: Array<{ value: string; label?: string; description?: string }>
  when?: Array<{ key: string; op?: string; value?: unknown }>
}

interface IntegrationMethod {
  type?: string
  methodID?: string
  label?: string
  names?: string[]
  form?: FormField[]
}

interface ConnectionInfo {
  type?: string
  id?: string
  label?: string
  method?: string
  status?: { status?: string; message?: string }
}

interface IntegrationInfo {
  id: string
  name?: string
  methods?: IntegrationMethod[]
  connections?: ConnectionInfo[]
}

interface CredentialEntry {
  id: string
  integrationID: string
  label?: string
  active?: boolean
  value?: { method?: string } & Record<string, unknown>
}

interface AttemptState {
  kind: 'oauth' | 'command'
  attemptID: string
  url?: string
  instructions?: string
}

/** Defensive: the API sometimes returns an object where the UI expects an array. */
function asArray<T>(value: T | ReadonlyArray<T> | null | undefined): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function statusTone(status: McpServer['status']): 'ok' | 'warn' | 'err' | 'busy' | 'muted' {
  const s = typeof status === 'string' ? status : status?.status ?? ''
  if (s === 'connected') return 'ok'
  if (s === 'needs_auth') return 'warn'
  if (s === 'failed') return 'err'
  if (s === 'pending') return 'busy'
  return 'muted'
}

type FormDataMap = Record<string, string | boolean>

export default function McpView(): React.ReactElement {
  const { directory, t, refreshServer } = useOc()
  const [err] = useState<string | null>(null)

  const [type, setType] = useState<'local' | 'remote'>('local')
  const [name, setName] = useState('')
  const [command, setCommand] = useState('npx')
  const [url, setUrl] = useState('https://')
  const [adding, setAdding] = useState(false)
  const [integFilter, setIntegFilter] = useState('')
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [formVals, setFormVals] = useState<FormDataMap>({})
  const [keyValue, setKeyValue] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [attempt, setAttempt] = useState<AttemptState | null>(null)

  const servers = usePoll<McpServer[]>(
    async () => {
      const res = await request<{ data?: McpServer[] }>('GET', '/api/mcp', {
        query: { 'location[directory]': directory },
      })
      return asArray<McpServer>(res.data)
    },
    6000,
    [directory],
  )

  const resources = usePoll<McpResource[]>(
    async () => {
      try {
        // NOTE: /api/mcp/resource returns { data: { resources, templates } }.
        const res = await request<{
          data?: { resources?: McpResource[]; templates?: McpResource[] }
        }>('GET', '/api/mcp/resource', {
          query: { 'location[directory]': directory },
        })
        const raw = (res.data ?? {}) as Partial<{ resources: McpResource[]; templates: McpResource[] }>
        const rawAny = res.data as unknown
        const list = [
          ...asArray<McpResource>(raw.resources),
          ...asArray<McpResource>(Array.isArray(rawAny) ? rawAny : []),
        ].map((r) => ({ ...r, kind: 'resource' as const }))
        const listTemplates = asArray<McpResource>(raw.templates).map((r) => ({
          ...r,
          kind: 'template' as const,
        }))
        return [...list, ...listTemplates]
      } catch {
        return []
      }
    },
    20000,
    [directory],
  )

  const integrations = usePoll<IntegrationInfo[]>(
    async () => {
      const res = await request<{ data?: IntegrationInfo[] }>('GET', '/api/integration', {
        query: { 'location[directory]': directory },
      })
      return asArray<IntegrationInfo>(res.data)
    },
    30000,
    [directory],
  )

  const credentials = usePoll<CredentialEntry[]>(
    async () => {
      try {
        const res = await request<{ data?: CredentialEntry[] }>('GET', '/api/credential')
        return asArray<CredentialEntry>(res.data)
      } catch {
        return []
      }
    },
    15000,
    [],
  )

  const chosen = useMemo(
    () => asArray(integrations.data).find((ig) => ig.id === chosenId) ?? null,
    [chosenId, integrations.data],
  )

  // Reset connect inputs when switching provider.
  useEffect(() => {
    setFormVals({})
    setKeyValue('')
    setAttempt(null)
  }, [chosenId])

  const isBusyMethod = (m: IntegrationMethod): boolean =>
    m.type === 'env' ? asArray(m.names).some((n) => !!n) : false

  const buildAnswer = (fields: FormField[] | undefined): Record<string, unknown> | undefined => {
    if (!fields || fields.length === 0) return undefined
    const out: Record<string, unknown> = {}
    for (const f of fields) {
      if (f.hidden || f.type === 'external') continue
      const raw = formVals[f.key]
      const def = f.default
      const hasValue = raw !== undefined && raw !== ''
      if (!hasValue && def === undefined) continue
      const v = hasValue ? raw : (def as string | boolean)
      if (f.type === 'boolean') out[f.key] = v === true || v === 'true'
      else if (f.type === 'multiselect')
        out[f.key] = String(v)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      else if (f.type === 'number' || f.type === 'integer') out[f.key] = Number(v)
      else out[f.key] = v
    }
    return Object.keys(out).length > 0 ? out : undefined
  }

  const reloadAfterConnect = async (): Promise<void> => {
    integrations.reload()
    credentials.reload()
    servers.reload()
    void refreshServer()
  }

  const connectKey = async (): Promise<void> => {
    if (!chosen || connecting) return
    const key = keyValue.trim()
    if (!key) {
      toast('✗ ' + t('mcp.keyRequired'))
      return
    }
    setConnecting(true)
    try {
      await request('POST', `/api/integration/${chosen.id}/connect/key`, {
        body: { key, answer: buildAnswer(chosen.methods?.find((m) => m.type === 'key')?.form) },
      })
      toast('✓ ' + chosen.id)
      setKeyValue('')
      await reloadAfterConnect()
    } catch (e) {
      toast('✗ ' + String((e as ApiError).message))
    } finally {
      setConnecting(false)
    }
  }

  const startOauth = async (m: IntegrationMethod): Promise<void> => {
    if (!chosen || !m.methodID || attempting) return
    setConnecting(true)
    try {
      const res = await request<{ data?: AttemptState }>(
        'POST',
        `/api/integration/${chosen.id}/connect/oauth`,
        { body: { methodID: m.methodID, answer: buildAnswer(m.form) } },
      )
      const a = res.data
      if (!a?.attemptID) throw new Error('attempt senza attemptID')
      setAttempt({ ...a, kind: 'oauth' })
      if (a.url) void window.oc.openExternal(a.url)
      toast('✓ ' + t('mcp.attemptOpen'))
      await reloadAfterConnect()
    } catch (e) {
      toast('✗ ' + String((e as ApiError).message))
    } finally {
      setConnecting(false)
    }
  }

  const startCommand = async (m: IntegrationMethod): Promise<void> => {
    if (!chosen || !m.methodID || attempting) return
    setConnecting(true)
    try {
      const res = await request<{ data?: AttemptState }>(
        'POST',
        `/api/integration/${chosen.id}/connect/command`,
        { body: { methodID: m.methodID, answer: buildAnswer(m.form) } },
      )
      const a = res.data
      if (!a?.attemptID) throw new Error('attempt senza attemptID')
      setAttempt({ ...a, kind: 'command' })
      toast('⏳ ' + (a.instructions ?? t('mcp.attemptRun')))
      await reloadAfterConnect()
    } catch (e) {
      toast('✗ ' + String((e as ApiError).message))
    } finally {
      setConnecting(false)
    }
  }

  const attempting = attempt !== null

  // Poll the running attempt until finished (max ~5 min).
  useEffect(() => {
    if (!attempt || !chosen) return
    let alive = true
    let ticks = 0
    const iv = window.setInterval(async () => {
      ticks++
      if (ticks > 100) {
        if (alive) {
          setAttempt(null)
          toast('✗ ' + t('mcp.attemptTimeout'))
        }
        return
      }
      try {
        const res = await request<{ data?: { status?: unknown; message?: string } }>(
          'GET',
          `/api/integration/${chosen.id}/connect/${attempt.kind}/${attempt.attemptID}`,
        )
        const raw = res.data?.status
        const state = typeof raw === 'string' ? raw : (raw as { status?: string } | undefined)?.status
        if (!state) return
        const doneWord = /complete|success|connected/.test(state)
        const badWord = /fail|cancel|expired|error/.test(state)
        if (doneWord || badWord) {
          if (!alive) return
          setAttempt(null)
          if (doneWord) {
            try {
              await request('POST', `/api/integration/${chosen.id}/connect/${attempt.kind}/${attempt.attemptID}/complete`, {
                body: {},
              })
            } catch {
              /* complete is best-effort */
            }
            toast('✓ ' + chosen.id)
            await reloadAfterConnect()
          } else {
            toast('✗ ' + (res.data?.message ?? state))
          }
        }
      } catch {
        /* transient — keep polling */
      }
    }, 3000)
    return () => {
      alive = false
      window.clearInterval(iv)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt?.attemptID, chosen?.id])

  const cancelAttempt = (): void => {
    const a = attempt
    setAttempt(null)
    if (a && chosen) {
      void request('DELETE', `/api/integration/${chosen.id}/connect/${a.kind}/${a.attemptID}`).catch(() => undefined)
    }
  }

  const addServer = async (): Promise<void> => {
    const id = name.trim()
    if (!id) {
      toast('✗ ' + t('mcp.nameRequired'))
      return
    }
    const config =
      type === 'local'
        ? { type: 'local', command: command.trim().split(/\s+/) }
        : { type: 'remote', url: url.trim() }
    setAdding(true)
    try {
      await request('PUT', `/api/experimental/mcp/${encodeURIComponent(id)}`, {
        body: { config },
        query: { 'location[directory]': directory },
      })
      toast('✓ ' + t('mcp.added') + ' ' + id)
      setName('')
      servers.reload()
    } catch (e) {
      toast('✗ ' + String((e as ApiError).message))
    } finally {
      setAdding(false)
    }
  }

  const canAdd = !!name.trim() && !adding && (type === 'local' ? !!command.trim() : !!url.trim())

  // Actions return 204 instantly while the new status lands a moment later:
  // re-sample a few times so the badge reflects reality right away.
  const burstReload = (): void => {
    servers.reload()
    window.setTimeout(() => servers.reload(), 700)
    window.setTimeout(() => servers.reload(), 1800)
  }

  const act = async (server: string, verb: 'connect' | 'disconnect' | 'remove'): Promise<void> => {
    try {
      if (verb === 'connect') {
        await request('POST', `/api/experimental/mcp/${encodeURIComponent(server)}/connect`, {
          query: { 'location[directory]': directory },
        })
      } else if (verb === 'disconnect') {
        await request('POST', `/api/experimental/mcp/${encodeURIComponent(server)}/disconnect`, {
          query: { 'location[directory]': directory },
        })
      } else {
        await request('DELETE', `/api/experimental/mcp/${encodeURIComponent(server)}`, {
          query: { 'location[directory]': directory },
        })
      }
      toast('✓ ' + verb + ' ' + server)
      if (verb === 'remove') {
        servers.reload()
        // A server defined in a config file (global/project) reappears after the
        // next config read — warn instead of silently "not deleting".
        window.setTimeout(async () => {
          try {
            const res = await request<{ data?: McpServer[] }>('GET', '/api/mcp', {
              query: { 'location[directory]': directory },
            })
            if (asArray<McpServer>(res.data as unknown as McpServer[]).some((s) => s.name === server)) {
              toast('⚠ ' + t('mcp.stillConfigured'))
            }
          } catch {
            /* ignore */
          }
        }, 1400)
      } else {
        burstReload()
      }
    } catch (e) {
      toast('✗ ' + String((e as ApiError).message))
    }
  }

  const activateCredential = async (id: string): Promise<void> => {
    try {
      await request('POST', `/api/credential/${encodeURIComponent(id)}/activate`)
      toast('✓')
      credentials.reload()
      integrations.reload()
      servers.reload()
    } catch (e) {
      toast('✗ ' + String((e as ApiError).message))
    }
  }

  const deleteCredential = async (id: string): Promise<void> => {
    try {
      await request('DELETE', `/api/credential/${encodeURIComponent(id)}`)
      toast('✓ ' + t('common.delete'))
      credentials.reload()
      integrations.reload()
    } catch (e) {
      toast('✗ ' + String((e as ApiError).message))
    }
  }

  const filteredIntegrations = asArray(integrations.data).filter((ig) => {
    const needle = integFilter.trim().toLowerCase()
    if (!needle) return true
    const envNames = asArray(ig.methods).flatMap((m) => asArray(m.names)).join(' ')
    return (
      (ig.name ?? ig.id).toLowerCase().includes(needle) ||
      ig.id.toLowerCase().includes(needle) ||
      envNames.toLowerCase().includes(needle)
    )
  })
  const connectedCount = asArray(integrations.data).filter((ig) => asArray(ig.connections).length > 0).length

  return (
    <div className="pad">
      {err && <ErrBox error={err} />}
      <Card
        title={t('mcp.title')}
        actions={
          <Btn small onClick={() => servers.reload()}>
            ⟳
          </Btn>
        }
      >
        <div className="mcp-add card-inset">
          <TextInput
            value={name}
            onChange={setName}
            placeholder="nome server"
            width={140}
            onEnter={() => void addServer()}
          />
          <Select
            value={type}
            onChange={(v) => setType(v ?? 'local')}
            width={140}
            options={[
              { value: 'local', label: t('mcp.local') },
              { value: 'remote', label: t('mcp.remote') },
            ]}
          />
          {type === 'local' ? (
            <TextInput
              value={command}
              onChange={setCommand}
              placeholder="es. npx -y @playwright/mcp"
              width={280}
              onEnter={() => void addServer()}
            />
          ) : (
            <TextInput value={url} onChange={setUrl} placeholder="https://…" width={280} onEnter={() => void addServer()} />
          )}
          <Btn tone="primary" disabled={!canAdd} onClick={() => void addServer()}>
            + {t('mcp.add')}
          </Btn>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>{t('common.name')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {asArray(servers.data).map((s) => (
              <tr key={s.name}>
                <td className="mono selectable">{s.name}</td>
                <td>
                  <Badge tone={statusTone(s.status)}>
                    {typeof s.status === 'string' ? s.status : (s.status?.status ?? 'unknown')}
                  </Badge>
                  {(() => {
                    if (typeof s.status === 'string' || !s.status) return null
                    const reason = (s.status as { error?: string; message?: string }).error ?? s.status.message
                    if (!reason) return null
                    return (
                      <div className="muted selectable" style={{ marginTop: 4, wordBreak: 'break-word' }}>
                        {String(reason).slice(0, 300)}
                      </div>
                    )
                  })()}
                </td>
                <td>
                  <div className="row-gap">
                    <Btn small onClick={() => void act(s.name, 'connect')}>{t('mcp.connect')}</Btn>
                    <Btn small onClick={() => void act(s.name, 'disconnect')}>{t('mcp.disconnect')}</Btn>
                    <ConfirmBtn label={t('common.confirm')} tone="danger" onConfirm={() => void act(s.name, 'remove')}>
                      {t('common.delete')}
                    </ConfirmBtn>
                  </div>
                </td>
              </tr>
            ))}
            {asArray(servers.data).length === 0 && (
              <tr><td colSpan={3} className="muted">{t('common.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card title={t('mcp.resources')}>
        <table className="table">
          <thead>
            <tr>
              <th>server</th>
              <th>{t('common.type')}</th>
              <th>{t('common.name')}</th>
              <th>uri</th>
              <th>mime</th>
            </tr>
          </thead>
          <tbody>
            {asArray(resources.data).map((r, i) => (
              <tr key={r.uri ?? i}>
                <td className="mono">{r.server ?? '—'}</td>
                <td>
                  <Badge tone={r.kind === 'template' ? 'info' : 'muted'}>{r.kind ?? 'resource'}</Badge>
                </td>
                <td className="selectable">{r.name ?? '—'}</td>
                <td className="mono muted selectable">{r.uri ?? '—'}</td>
                <td className="mono muted">{r.mimeType ?? '—'}</td>
              </tr>
            ))}
            {asArray(resources.data).length === 0 && (
              <tr><td colSpan={5} className="muted">{t('common.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card
        title={t('mcp.integrations')}
        actions={
          <>
            <Badge tone={connectedCount > 0 ? 'ok' : 'muted'}>
              {connectedCount} {t('mcp.connected')}
            </Badge>
            <TextInput value={integFilter} onChange={setIntegFilter} placeholder="cerca nome / id / env…" width={170} />
          </>
        }
      >
        <div className="muted" style={{ marginBottom: 8 }}>
          {t('mcp.integHint')}
        </div>

        {chosen && <ConnectPanel
          chosen={chosen}
          formVals={formVals}
          setFormVals={setFormVals}
          keyValue={keyValue}
          setKeyValue={setKeyValue}
          connecting={connecting}
          attempt={attempt}
          isBusyMethod={isBusyMethod}
          connectKey={() => void connectKey()}
          startOauth={startOauth}
          startCommand={startCommand}
          cancelAttempt={cancelAttempt}
          close={() => setChosenId(null)}
          t={t}
        />}

        <div className="filelist" style={{ maxHeight: '44vh' }}>
          {filteredIntegrations.map((ig) => {
            const conns = asArray(ig.connections)
            return (
              <button
                key={ig.id}
                className={`filerow clickable ${chosenId === ig.id ? 'agentrow-active' : ''}`}
                onClick={() => setChosenId(chosenId === ig.id ? null : ig.id)}
              >
                <span className="dot-dot" style={{ background: conns.length > 0 ? 'var(--ok)' : '#4d5566' }} />
                <span className="selectable">{ig.name ?? ig.id}</span>
                <span className="mono muted">{ig.id}</span>
                <span className="spacer" />
                {conns.length > 0 ? (
                  <Badge tone="ok">{conns.map((c) => c.label ?? c.type ?? 'credential').join(', ')}</Badge>
                ) : (
                  <Badge tone="muted">—</Badge>
                )}
              </button>
            )
          })}
          {filteredIntegrations.length === 0 && (
            <div className="muted" style={{ padding: 8 }}>{t('common.empty')}</div>
          )}
        </div>
      </Card>

      <Card title={t('mcp.credentials')}>
        <table className="table">
          <thead>
            <tr>
              <th>label</th>
              <th>integration</th>
              <th>method</th>
              <th>active</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {asArray(credentials.data).map((c) => (
              <tr key={c.id}>
                <td className="selectable">{c.label ?? c.id}</td>
                <td className="mono muted">{c.integrationID}</td>
                <td className="mono muted">{c.value?.method ?? '—'}</td>
                <td>
                  <Badge tone={c.active ? 'ok' : 'muted'}>{c.active ? 'active' : 'no'}</Badge>
                </td>
                <td>
                  <div className="row-gap">
                    {!c.active && (
                      <Btn small onClick={() => void activateCredential(c.id)}>
                        {t('mcp.activate')}
                      </Btn>
                    )}
                    <ConfirmBtn label={t('common.confirm')} tone="danger" onConfirm={() => void deleteCredential(c.id)}>
                      ✕
                    </ConfirmBtn>
                  </div>
                </td>
              </tr>
            ))}
            {asArray(credentials.data).length === 0 && (
              <tr><td colSpan={5} className="muted">{t('common.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function ConnectPanel({
  chosen,
  formVals,
  setFormVals,
  keyValue,
  setKeyValue,
  connecting,
  attempt,
  isBusyMethod,
  connectKey,
  startOauth,
  startCommand,
  cancelAttempt,
  close,
  t,
}: {
  chosen: IntegrationInfo
  formVals: FormDataMap
  setFormVals: (v: FormDataMap) => void
  keyValue: string
  setKeyValue: (v: string) => void
  connecting: boolean
  attempt: AttemptState | null
  isBusyMethod: (m: IntegrationMethod) => boolean
  connectKey: () => void
  startOauth: (m: IntegrationMethod) => void
  startCommand: (m: IntegrationMethod) => void
  cancelAttempt: () => void
  close: () => void
  t: (k: string) => string
}): React.ReactElement | null {
  const conns = asArray(chosen.connections)
  const methods = asArray(chosen.methods)
  const keyMethod = methods.find((m) => m.type === 'key')
  const oauthMethods = methods.filter((m) => m.type === 'oauth')
  const commandMethods = methods.filter((m) => m.type === 'command')
  const envMethods = methods.filter((m) => m.type === 'env')
  const externalMethods = methods.filter((m) => m.type === 'external')
  const fields = (keyMethod?.form ?? []).filter((f) => !f.hidden && f.type !== 'external')

  return (
    <div className="card-inset" style={{ marginBottom: 10 }}>
      <div className="row-gap" style={{ marginBottom: 8 }}>
        <span className="dot-dot" style={{ background: conns.length > 0 ? 'var(--ok)' : '#4d5566' }} />
        <b>{chosen.name ?? chosen.id}</b>
        <span className="mono muted">{chosen.id}</span>
        <span className="spacer" />
        <Btn small tone="ghost" onClick={close}>✗</Btn>
      </div>

      {conns.length > 0 && (
        <div className="row-gap" style={{ marginBottom: 6 }}>
          <Badge tone="ok">{t('mcp.alreadyConnected')}</Badge>
          {conns.map((c, i) => (
            <span key={i} className="mono muted">
              {c.label ?? c.type} · {c.method ?? ''}
            </span>
          ))}
        </div>
      )}

      {attempt != null && (
        <div className="row-gap" style={{ marginBottom: 6 }}>
          <span className="spinner" />
          <span className="muted">
            {t('mcp.attemptWaiting')} {attempt.instructions ? '— ' + attempt.instructions : ''}
          </span>
          <Btn small onClick={cancelAttempt}>{t('common.cancel')}</Btn>
        </div>
      )}

      {fields.map((f) => (
        <div key={f.key} className="row-gap" style={{ marginBottom: 6 }}>
          <span style={{ minWidth: 170 }}>{f.title ?? f.key}{f.required ? ' *' : ''}</span>
          {f.type === 'boolean' ? (
            <input
              type="checkbox"
              checked={formVals[f.key] === true || String(formVals[f.key]) === 'true'}
              onChange={(e) => setFormVals({ ...formVals, [f.key]: e.target.checked })}
            />
          ) : (
            <TextInput
              value={String(formVals[f.key] ?? '')}
              onChange={(v) => setFormVals({ ...formVals, [f.key]: v })}
              width={240}
              placeholder={f.placeholder ?? String(f.default ?? '')}
            />
          )}
          {f.description && <span className="muted" style={{ fontSize: 11 }}>{f.description}</span>}
        </div>
      ))}

      {keyMethod && (
        <div className="row-gap" style={{ marginBottom: 6 }}>
          <span style={{ minWidth: 170 }}>{keyMethod.label ?? 'API key'}:</span>
          <TextInput password value={keyValue} onChange={setKeyValue} width={260} placeholder="sk-…" onEnter={connectKey} />
          <Btn tone="primary" disabled={connecting || !keyValue.trim()} onClick={connectKey}>
            🔑 {t('mcp.connectKey')}
          </Btn>
        </div>
      )}

      {oauthMethods.map((m) => (
        <div key={m.methodID} className="row-gap" style={{ marginBottom: 6 }}>
          <span style={{ minWidth: 170 }}>{m.label ?? 'OAuth'}:</span>
          {(m.form ?? []).filter((f) => f.type !== 'external' && !f.hidden).map((f) => (
            <TextInput
              key={f.key}
              value={String(formVals[f.key] ?? '')}
              onChange={(v) => setFormVals({ ...formVals, [f.key]: v })}
              width={150}
              placeholder={f.title ?? f.key}
            />
          ))}
          <Btn disabled={connecting || attempt != null || isBusyMethod(m)} onClick={() => startOauth(m)}>
            🔓 {t('mcp.oauthOpen')}
          </Btn>
        </div>
      ))}

      {commandMethods.map((m) => (
        <div key={m.methodID} className="row-gap" style={{ marginBottom: 6 }}>
          <span style={{ minWidth: 170 }}>{m.label ?? 'Command'}:</span>
          <Btn disabled={connecting || attempt != null || isBusyMethod(m)} onClick={() => startCommand(m)}>
            ▶ {t('mcp.connectRun')}
          </Btn>
        </div>
      ))}

      {envMethods.map((m, i) => (
        <div key={i} className="row-gap" style={{ marginBottom: 6 }}>
          <span style={{ minWidth: 170 }}>{t('mcp.envVars')}:</span>
          {asArray(m.names).map((n) => (
            <Badge key={n} tone="info" >{n}</Badge>
          ))}
          <span className="muted">{t('mcp.environHint')}</span>
        </div>
      ))}

      {externalMethods.map((m, i) => (
        <div key={i} className="row-gap muted" style={{ marginBottom: 6 }}>
          <span>{m.label ?? 'External'}:</span> {t('mcp.externalHint')}
        </div>
      ))}
    </div>
  )
}
