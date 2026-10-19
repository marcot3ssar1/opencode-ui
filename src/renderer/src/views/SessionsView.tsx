import React, { useState } from 'react'
import { useOc } from '../state'
import { Badge, Btn, Card, ConfirmBtn, ErrBox, TextInput, toast, usePoll } from '../ui'
import { ApiError, fmtMoney, fmtTime, request, shortId } from '../api'

interface SessionInfo {
  id: string
  title?: string
  agent?: string
  model?: { id?: string; providerID?: string }
  cost?: number
  tokens?: { input?: number; output?: number }
  time?: { created?: number; updated?: number; idle?: number }
  location?: { directory?: string }
}

export default function SessionsView(): React.ReactElement {
  const { directory, t, setSessionID, sessionID } = useOc()
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const sessions = usePoll<SessionInfo[]>(
    async () => {
      const res = await request<{ data?: SessionInfo[] }>('GET', '/api/session', {
        query: { directory },
      })
      return (res.data ?? []) as SessionInfo[]
    },
    5000,
    [directory],
  )

  const openChat = (s: SessionInfo): void => {
    setSessionID(s.id)
    toast('✓ ' + s.id.slice(0, 8))
  }

  const rename = async (id: string): Promise<void> => {
    const title = editDraft.trim()
    setEditingId(null)
    if (!title) return
    try {
      await request('PATCH', `/api/session/${id}`, { body: { title } })
      toast('✓ ' + title)
      sessions.reload()
    } catch (e) {
      toast('✗ ' + String((e as ApiError).message))
    }
  }

  const remove = async (id: string): Promise<void> => {
    try {
      await request('DELETE', `/api/session/${id}`)
      if (sessionID === id) setSessionID(null)
      toast('✓ ' + t('common.delete'))
      sessions.reload()
    } catch (e) {
      toast('✗ ' + String((e as ApiError).message))
    }
  }

  return (
    <div className="pad">
      <Card
        title={t('sessions.title')}
        actions={
          <>
            <Badge tone="muted">{directory ? '' : '⚠'}</Badge>
            <Btn
              small
              tone="primary"
              disabled={creating || !directory}
              onClick={async () => {
                setCreating(true)
                try {
                  const created = await request<{ id?: string }>('POST', '/api/session', { body: { location: { directory } } })
                  if (created.id) setSessionID(created.id)
                  toast('✓ ' + (created.id?.slice(0, 8) ?? ''))
                  sessions.reload()
                } catch (e) {
                  toast('✗ ' + String((e as ApiError).message))
                } finally {
                  setCreating(false)
                }
              }}
            >
              + {t('sessions.new')}
            </Btn>
            <Btn small onClick={() => sessions.reload()}>
              ⟳
            </Btn>
          </>
        }
      >
        <div className="muted" style={{ marginBottom: 8 }}>{t('sessions.reloadHint')}</div>
        <ErrBox error={sessions.error} />
        {sessions.loading && !sessions.data ? (
          <div className="muted">{t('common.loading')}</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th></th>
                <th>{t('sessions.title.label')}</th>
                <th>{t('chat.agent')}</th>
                <th>{t('chat.model')}</th>
                <th>{t('sessions.cost')}</th>
                <th>{t('sessions.tokens')}</th>
                <th>{t('sessions.updated')}</th>
                <th>{t('common.id')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(sessions.data ?? []).map((s) => (
                <tr key={s.id} className={sessionID === s.id ? 'row-active' : ''}>
                  <td>
                    <span className="dot-dot" style={{ background: s.agent ? colorFor(s.agent) : undefined }} />
                  </td>
                  <td className="selectable">
                    {editingId === s.id ? (
                      <div className="row-gap" onClick={(e) => e.stopPropagation()}>
                        <TextInput
                          autoFocus
                          value={editDraft}
                          onChange={setEditDraft}
                          width={170}
                          onEnter={() => void rename(s.id)}
                        />
                        <Btn small tone="primary" onClick={() => void rename(s.id)}>
                          ✓
                        </Btn>
                        <Btn small tone="ghost" onClick={() => setEditingId(null)}>
                          ✗
                        </Btn>
                      </div>
                    ) : (
                      <>{s.title || <span className="muted">(senza titolo)</span>}</>
                    )}
                  </td>
                  <td>{s.agent ?? '—'}</td>
                  <td className="mono">{s.model?.id ?? '—'}</td>
                  <td>{fmtMoney(s.cost)}</td>
                  <td className="mono">{s.tokens ? (s.tokens.input ?? 0) + '/' + (s.tokens.output ?? 0) : '—'}</td>
                  <td className="muted">{fmtTime(s.time?.updated)}</td>
                  <td className="mono muted">{shortId(s.id, 8)}</td>
                  <td>
                    <div className="row-gap">
                      <Btn small onClick={() => openChat(s)} title={t('sessions.openChat')}>
                        ✉
                      </Btn>
                      <Btn
                        small
                        title={t('sessions.fork')}
                        onClick={async () => {
                          try {
                            await request('POST', `/api/session/${s.id}/fork`, { body: {} })
                            toast('fork ✓')
                            sessions.reload()
                          } catch (e) {
                            toast('✗ ' + String((e as ApiError).message))
                          }
                        }}
                      >
                        ⑂
                      </Btn>
                      <Btn
                        small
                        title={t('sessions.rename')}
                        onClick={() => {
                          setEditingId(s.id)
                          setEditDraft(s.title ?? '')
                        }}
                      >
                        ✎
                      </Btn>
                      <ConfirmBtn label={t('common.confirm')} tone="danger" onConfirm={() => void remove(s.id)}>
                        ✕
                      </ConfirmBtn>
                    </div>
                  </td>
                </tr>
              ))}
              {(sessions.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={9} className="muted">
                    {t('common.empty')} — {t('sessions.new')}?
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

export function colorFor(id: string | undefined): string {
  if (!id) return '#4d5566'
  if (id === 'blinky') return '#ff4f4f'
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360
  return `hsl(${h} 70% 60%)`
}
