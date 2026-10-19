import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useOc } from '../state'
import { Badge, Btn, Select, Spinner, toast, usePoll } from '../ui'
import { ApiError, request, shortId } from '../api'
import { colorFor } from './SessionsView'

interface FileAttachment {
  uri?: string
  name?: string
}

interface ToolState {
  status?: string
  title?: string
  input?: unknown
  output?: unknown
  error?: unknown
}

interface Msg {
  id: string
  type: string
  text?: string
  agent?: string
  model?: { id?: string; providerID?: string }
  time?: { created?: number; completed?: number }
  files?: FileAttachment[]
  content?: Array<{
    type?: string
    text?: string
    id?: string
    name?: string
    state?: ToolState
  }>
  finish?: string
  tokens?: { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } }
  cost?: number
}

const TOOL_TONE: Record<string, 'ok' | 'busy' | 'err' | 'muted'> = {
  completed: 'ok',
  running: 'busy',
  streaming: 'busy',
  error: 'err',
  pending: 'muted',
}

export default function ChatView(): React.ReactElement {
  const { directory, t, sessionID, setSessionID, lang } = useOc()

  const sessions = usePoll<Array<{ id: string; title?: string }>>(
    async () => {
      const res = await request<{ data?: Array<{ id: string; title?: string }> }>('GET', '/api/session', {
        query: { directory },
      })
      return (res.data ?? []) as Array<{ id: string; title?: string }>
    },
    8000,
    [directory],
  )

  const [messages, setMessages] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [pinned, setPinned] = useState(true)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const pinnedRef = useRef(true)

  const onScroll = (): void => {
    const el = scrollRef.current
    if (!el) return
    const at = el.scrollHeight - el.scrollTop - el.clientHeight < 90
    pinnedRef.current = at
    setPinned(at)
  }

  // Keep the newest message visible while streaming unless the user scrolled up.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !pinnedRef.current) return
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
  }, [messages, sessionID])

  const jumpBottom = (): void => {
    const el = scrollRef.current
    if (!el) return
    pinnedRef.current = true
    setPinned(true)
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  const agents = usePoll<Array<{ id: string; name?: string; mode?: string; color?: string }>>(
    async () => {
      const res = await request<{ data?: Array<{ id: string; name?: string; mode?: string; color?: string }> }>('GET', '/api/agent', {
        query: { 'location[directory]': directory },
      })
      return (res.data ?? []) as Array<{ id: string; name?: string; mode?: string; color?: string }>
    },
    30000,
    [directory],
  )

  const models = usePoll<Array<{ id: string; providerID: string; name?: string; enabled?: boolean; limit?: { context?: number; input?: number; output?: number } }>>(
    async () => {
      const res = await request<{
        data?: Array<{ id: string; providerID: string; name?: string; enabled?: boolean; limit?: { context?: number; input?: number; output?: number } }>
      }>('GET', '/api/model', {
        query: { 'location[directory]': directory },
      })
      return (res.data ?? []).filter((m) => m.enabled !== false)
    },
    30000,
    [directory],
  )

  const commands = usePoll<Array<{ name: string }>>(
    async () => {
      const res = await request<{ data?: Array<{ name: string }> }>('GET', '/api/command', {
        query: { 'location[directory]': directory },
      })
      return (res.data ?? []) as Array<{ name: string }>
    },
    30000,
    [directory],
  )

  const refresh = useCallback(async () => {
    if (!sessionID) return
    try {
      const all: Msg[] = []
      let cursor: string | undefined
      for (let page = 0; page < 20; page++) {
        const res = await request<{ data?: Msg[]; cursor?: { next?: string } }>(
          'GET',
          `/api/session/${sessionID}/message`,
          { query: { limit: 200, cursor } },
        )
        for (const m of res.data ?? []) all.push(m)
        cursor = res.cursor?.next
        if (!cursor) break
      }
      setMessages(all)
    } catch (e) {
      setSendError(String((e as ApiError).message))
    }
  }, [sessionID])

  // Events are live-only: re-snapshot messages on any event of this session.
  // V2 event types: session.step.started / session.step.streamed / session.tool.* /
  // message.* / permission.* / shell.* — throttled so streaming doesn't hammer.
  const { useEvent } = useOc()
  const throttleRef = useRef<number | null>(null)
  useEvent((e) => {
    if (!sessionID) return
    const relevant =
      e.type.startsWith('bridge.') ||
      e.type.startsWith('session.') ||
      e.type.startsWith('message.') ||
      e.type.startsWith('permission.') ||
      e.type.startsWith('shell.')
    if (!relevant) return
    if (throttleRef.current !== null) return
    throttleRef.current = window.setTimeout(() => {
      throttleRef.current = null
      void refresh()
    }, 600)
  })
  useEffect(
    () => () => {
      if (throttleRef.current !== null) window.clearTimeout(throttleRef.current)
    },
    [],
  )

  useEffect(() => {
    setMessages([])
    if (sessionID) void refresh()
  }, [sessionID, refresh])

  // Busy detection straight from the server's own active-session registry.
  useEffect(() => {
    if (!sessionID) return
    let alive = true
    const tick = async (): Promise<void> => {
      try {
        const res = await request<{ data?: Record<string, unknown> }>('GET', '/api/session/active')
        const isBusy = !!res.data?.[sessionID]
        if (alive) setBusy(isBusy)
        // Safety net: while generating, refresh messages periodically even if the
        // event stream missed an update.
        if (alive && isBusy) void refresh()
      } catch {
        /* ignore */
      }
    }
    void tick()
    const iv = setInterval(tick, 3000)
    return () => {
      alive = false
      clearInterval(iv)
    }
  }, [sessionID, refresh])

  const send = async (): Promise<void> => {
    if (!sessionID || !draft.trim()) return
    const text = draft.trim()
    setDraft('')
    setSendError(null)
    setMessages((prev) => [
      ...prev,
      {
        id: 'local-' + Date.now(),
        type: 'user',
        text,
        time: { created: Date.now() },
      },
    ])
    try {
      await request('POST', `/api/session/${sessionID}/prompt`, { body: { text } })
      await refresh()
    } catch (e) {
      setSendError(String((e as ApiError).message))
    }
  }

  const runCommand = async (name: string | undefined): Promise<void> => {
    if (!sessionID || !name) return
    try {
      await request('POST', `/api/session/${sessionID}/command`, { body: { name, text: '' } })
      toast('✓ /' + name)
      await refresh()
    } catch (e) {
      toast('✗ ' + String((e as ApiError).message))
    }
  }

  const selectAgent = async (agentId: string | undefined): Promise<void> => {
    if (!sessionID || !agentId) return
    try {
      await request('POST', `/api/session/${sessionID}/agent`, { body: { agent: agentId } })
      toast('✓ ' + agentId)
      await refresh()
    } catch (e) {
      toast('✗ ' + String((e as ApiError).message))
    }
  }

  const selectModel = async (composite: string | undefined): Promise<void> => {
    if (!sessionID || !composite) return
    const [providerID, ...rest] = composite.split('|')
    const modelID = rest.join('|')
    try {
      await request('POST', `/api/session/${sessionID}/model`, { body: { model: { providerID, id: modelID } } })
      toast('✓ ' + modelID)
    } catch (e) {
      toast('✗ ' + String((e as ApiError).message))
    }
  }

  if (!sessionID) {
    return (
      <div className="pad center-col">
        <div className="muted">{t('chat.noSession')}</div>
        <Btn
          tone="primary"
          disabled={!directory || creating}
          onClick={async () => {
            setCreating(true)
            try {
              const created = await request<{ id?: string }>('POST', '/api/session', {
                body: { location: { directory } },
              })
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
      </div>
    )
  }

  const msgList = messages
    .filter((m) => m.type !== 'idle')
    // API returns newest-first — render chronological (oldest top, newest bottom).
    .sort((a, b) => (a.time?.created ?? 0) - (b.time?.created ?? 0))

  // ---- Context usage (to know when "Compatta" is worth it) ----
  // Tokens of the latest assistant message ≈ prompt + cache + generated output.
  const lastAssistant = [...msgList].reverse().find((m) => m.type === 'assistant' && m.tokens)
  const usedTokens = lastAssistant?.tokens
    ? (lastAssistant.tokens.input ?? 0) +
      (lastAssistant.tokens.output ?? 0) +
      (lastAssistant.tokens.reasoning ?? 0) +
      (lastAssistant.tokens.cache?.read ?? 0) +
      (lastAssistant.tokens.cache?.write ?? 0)
    : null
  const modelDef = lastAssistant?.model
    ? (models.data ?? []).find(
        (mm) => mm.id === lastAssistant.model?.id && mm.providerID === lastAssistant.model?.providerID,
      )
    : undefined
  const contextLimit = modelDef?.limit?.context
  const contextPct = usedTokens != null && contextLimit ? (usedTokens / contextLimit) * 100 : null
  const fmtK = (n: number): string => (n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(n))
  const fmtFull = (n: number): string => n.toLocaleString(lang === 'en' ? 'en-US' : 'it-IT')
  const ctxTone: 'muted' | 'ok' | 'warn' | 'err' =
    contextPct == null ? (usedTokens == null ? 'muted' : 'ok') : contextPct >= 85 ? 'err' : contextPct >= 60 ? 'warn' : 'ok'
  const selectableAgents = (agents.data ?? []).filter((a) => a.mode !== 'subagent')

  return (
    <div className="chat-wrap">
      <div className="chat-toolbar">
        <Select
          value={sessionID}
          onChange={(v) => setSessionID(v)}
          width={210}
          options={(sessions.data ?? []).map((s) => ({ value: s.id, label: s.title || shortId(s.id, 10) }))}
        />
        <Select
          value={undefined}
          onChange={(v) => void selectAgent(v)}
          width={150}
          options={[
            { value: undefined as unknown as string, label: '☺ ' + t('chat.agent') },
            ...selectableAgents.map((a) => ({ value: a.id, label: (a.name ?? a.id) + (a.mode === 'primary' ? '' : ' (sub)') })),
          ]}
        />
        <Select
          value={undefined}
          onChange={(v) => void selectModel(v)}
          width={210}
          options={[
            { value: undefined as unknown as string, label: '⚡ ' + t('chat.model') },
            ...((models.data ?? []).map((mm) => ({ value: mm.providerID + '|' + mm.id, label: mm.name ?? mm.id }))),
          ]}
        />
        {busy && (
          <span className="busyline">
            <Spinner /> {t('chat.busy')}
          </span>
        )}
        {usedTokens != null && (
          <span
            title={
              t('chat.context') +
              ': ' +
              fmtFull(usedTokens) +
              (contextLimit ? ' / ' + fmtFull(contextLimit) + ' → ' + (contextPct ?? 0).toFixed(1) + '%' : '')
            }
          >
            <Badge tone={ctxTone}>
              {t('chat.context')} {fmtK(usedTokens)}
              {contextPct != null ? ' · ' + contextPct.toFixed(0) + '%' : ''}
            </Badge>
          </span>
        )}
        <div className="spacer" />
        <Btn small onClick={() => void refresh()} title="↻">
          ⟳
        </Btn>
        <Btn
          small
          tone="danger"
          disabled={!busy}
          onClick={async () => {
            try {
              await request('POST', `/api/session/${sessionID}/interrupt`)
              await refresh()
            } catch (e) {
              toast('✗ ' + String((e as ApiError).message))
            }
          }}
        >
          ■ {t('chat.interrupt')}
        </Btn>
        <Btn
          small
          onClick={async () => {
            try {
              await request('POST', `/api/session/${sessionID}/compact`, { body: {} })
              await refresh()
              toast('✓ compact')
            } catch (e) {
              toast('✗ ' + String((e as ApiError).message))
            }
          }}
        >
          ✾ {t('chat.compact')}
        </Btn>
      </div>

      <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
        {sendError && <div className="errbox">{sendError}</div>}
        {msgList.map((m) => (
          <MessageBubble key={m.id} m={m} t={t} />
        ))}
        {msgList.length === 0 && <div className="muted center">{t('common.empty')}</div>}
      </div>
      {!pinned && msgList.length > 0 && (
        <button className="jump-down" onClick={jumpBottom} title={t('chat.jump')}>
          ⬇
        </button>
      )}

      <div className="chat-inputrow">
        <Select
          value={undefined}
          onChange={(v) => void runCommand(v)}
          width={140}
          options={[
            { value: undefined as unknown as string, label: t('chat.cmdEmpty') },
            ...(commands.data ?? []).map((c) => ({ value: c.name, label: '/' + c.name })),
          ]}
        />
        <textarea
          className="chat-input"
          value={draft}
          placeholder={t('chat.placeholder')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <Btn tone="primary" disabled={!draft.trim()} onClick={() => void send()}>
          ▶ {t('chat.send')}
        </Btn>
      </div>
    </div>
  )
}

function MessageBubble({ m, t }: { m: Msg; t: (k: string) => string }): React.ReactElement {
  if (m.type === 'user') {
    return (
      <div className="bubble user-bubble">
        <div className="bubble-head">
          <span className="who">» tu</span>
          {m.files && m.files.length > 0 && <span className="muted">{m.files.map((f) => f.name ?? f.uri).join(', ')}</span>}
        </div>
        <div className="bubble-text">{m.text}</div>
      </div>
    )
  }

  if (m.type === 'assistant') {
    const content = m.content ?? []
    return (
      <div className="bubble assistant-bubble">
        <div className="bubble-head">
          <span className="dot-dot" style={{ background: colorFor(m.agent) }} />
          <span className="who">{m.agent ?? 'assistant'}</span>
          {m.model?.id && <span className="muted mono">{m.model.id}</span>}
          {typeof m.cost === 'number' && (
            <span className="muted mono">${m.cost < 10 ? m.cost.toFixed(4) : m.cost.toFixed(2)}</span>
          )}
          {m.finish && (
            <Badge tone={m.finish === 'stop' ? 'muted' : m.finish === 'error' ? 'err' : 'info'}>{m.finish}</Badge>
          )}
        </div>
        {content.map((part, i) => {
          if (part.type === 'text') {
            return (
              <div key={i} className="bubble-text selectable">
                {part.text}
              </div>
            )
          }
          if (part.type === 'reasoning') {
            return (
              <details key={i} className="reasoning">
                <summary>{t('chat.reasoning')}</summary>
                <div className="bubble-text dim">{part.text}</div>
              </details>
            )
          }
          if (part.type === 'tool') {
            const st = part.state ?? {}
            const status = String(st.status ?? 'pending')
            const tone = TOOL_TONE[status] ?? 'muted'
            return (
              <div key={i} className={`tool ${status === 'error' ? 'tool-err' : ''}`}>
                <div className="tool-head">
                  <Badge tone={tone}>{status}</Badge>
                  <span className="mono">{part.name}</span>
                  {st.title !== undefined && (
                    <span className="muted selectable">{String(st.title).slice(0, 140)}</span>
                  )}
                </div>
                <details className="tool-detail">
                  <summary>{t('chat.tools')}</summary>
                  {st.input !== undefined && (
                    <pre className="tool-io">{JSON.stringify(st.input, null, 1).slice(0, 4000)}</pre>
                  )}
                  {st.output !== undefined && <pre className="tool-io">{String(st.output).slice(0, 6000)}</pre>}
                  {st.error !== undefined && (
                    <pre className="tool-io io-err">{String(st.error).slice(0, 6000)}</pre>
                  )}
                </details>
              </div>
            )
          }
          return null
        })}
      </div>
    )
  }

  if (['agent-switched', 'model-switched', 'location-switched'].includes(m.type)) {
    return (
      <div className="switchline mono muted">
        {m.type}: {m.text}
      </div>
    )
  }

  if (m.type === 'shell') {
    const shellMsg = m as unknown as { command?: string; status?: string; output?: { output?: string } }
    return (
      <div className="bubble system-bubble">
        <div className="bubble-head">
          <Badge tone="info">shell</Badge>
          <span className="mono selectable">{shellMsg.command}</span>
        </div>
        {shellMsg.output?.output && <pre className="tool-io">{shellMsg.output.output.slice(0, 6000)}</pre>}
      </div>
    )
  }

  return (
    <div className="bubble system-bubble">
      <div className="bubble-head">
        <Badge tone="muted">{m.type}</Badge>
        <span className="muted mono">{shortId(m.id, 10)}</span>
      </div>
      {m.text && <div className="bubble-text dim">{m.text}</div>}
    </div>
  )
}
