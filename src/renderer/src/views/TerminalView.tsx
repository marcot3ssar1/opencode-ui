import React, { useEffect, useRef, useState } from 'react'
import { useOc } from '../state'
import { Badge, Btn, Card, TextInput, toast, usePoll } from '../ui'
import { ApiError, request } from '../api'

interface ShellInfo {
  id: string
  status?: 'running' | 'exited' | 'timeout' | 'killed'
  command?: string
  cwd?: string
  exit?: number
  time?: { started?: number; completed?: number }
}

export default function TerminalView(): React.ReactElement {
  const { directory, t } = useOc()
  const [command, setCommand] = useState('')
  const [outputs, setOutputs] = useState<string[]>([])
  const [runningId, setRunningId] = useState<string | null>(null)
  const scroll = useRef<HTMLDivElement>(null)

  const shells = usePoll<ShellInfo[]>(
    async () => {
      const res = await request<{ data?: ShellInfo[] }>('GET', '/api/shell', {
        query: { 'location[directory]': directory },
      })
      return (res.data ?? []) as ShellInfo[]
    },
    5000,
    [directory],
  )

  useEffect(() => {
    scroll.current?.scrollTo({ top: 1e9 })
  }, [outputs])

  const run = async (): Promise<void> => {
    const cmd = command.trim()
    if (!cmd) return
    setCommand('')
    setOutputs((prev) => [...prev, `$ ${cmd}`])
    try {
      // contratto verificato: body = { location, data: { id, status, ... } }
      const res = await request<{ data?: { id?: string }; id?: string }>('POST', '/api/shell', {
        body: { command: cmd, timeout: 120000 },
        query: { 'location[directory]': directory },
      })
      const id = res.data?.id ?? res.id
      if (!id) throw new Error('no shell id')
      setRunningId(id)
      await pollOutput(id)
    } catch (e) {
      setOutputs((prev) => [...prev, `⚠ ${(e as ApiError).message}`])
      setRunningId(null)
    }
  }

  const pollOutput = async (id: string): Promise<void> => {
    // contratto verificato: output è un BLOCCO DI TESTO con cursore numerico (offset byte)
    let cursor: number | undefined
    let idleTicks = 0
    for (let i = 0; i < 600; i++) {
      try {
        const res = await request<{ data?: { output?: string; cursor?: number; truncated?: boolean } }>(
          'GET',
          `/api/shell/${id}/output`,
          { query: { 'location[directory]': directory, ...(cursor !== undefined ? { cursor: String(cursor) } : {}) } },
        )
        const chunk = res.data
        const text = chunk?.output ?? ''
        if (text) {
          const lines = text.replace(/\r/g, '').split('\n')
          if (lines[lines.length - 1] === '') lines.pop()
          if (lines.length > 0) setOutputs((prev) => [...prev, ...lines])
        }
        if (typeof chunk?.cursor === 'number') cursor = chunk.cursor
        const meta = await request<{ data?: ShellInfo }>('GET', `/api/shell/${id}`, {
          query: { 'location[directory]': directory },
        })
        const status = meta.data?.status
        if (status !== 'running') {
          if (!text) break
          idleTicks++
          if (idleTicks > 3) break
          continue
        }
        idleTicks = 0
        await new Promise((r) => setTimeout(r, 150))
      } catch (e) {
        setOutputs((prev) => [...prev, '⚠ ' + String((e as ApiError).message)])
        break
      }
    }
    setRunningId((cur) => (cur === id ? null : cur))
    shells.reload()
  }

  const kill = async (id: string): Promise<void> => {
    try {
      await request('DELETE', `/api/shell/${id}`, { query: { 'location[directory]': directory } })
      toast('✓ killed')
      shells.reload()
    } catch (e) {
      toast('✗ ' + String((e as ApiError).message))
    }
  }

  return (
    <div className="pad">
      <Card title={t('terminal.title')} actions={<Badge tone="muted">{t('terminal.hint')}</Badge>}>
        <div className="term-inputrow">
          <TextInput value={command} onChange={setCommand} placeholder="es. npm test" onEnter={() => void run()} />
          <Btn tone="primary" disabled={!command.trim()} onClick={() => void run()}>
            ▶ {t('terminal.run')}
          </Btn>
        </div>

        <div className="term-output mono" ref={scroll}>
          {outputs.map((line, i) => (
            <div key={i} className={line.startsWith('⚠') ? 'io-err' : ''}>
              {line}
            </div>
          ))}
          {outputs.length === 0 && !runningId && <div className="muted">{t('common.empty')}</div>}
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>command</th>
                <th>{t('common.status')}</th>
                <th>{t('terminal.exit')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(shells.data ?? []).map((s) => (
                <tr key={s.id}>
                  <td className="mono selectable">{s.command}</td>
                  <td>
                    <Badge tone={s.status === 'running' ? 'busy' : s.status === 'exited' ? 'ok' : 'warn'}>
                      {s.status ?? '—'}
                    </Badge>
                  </td>
                  <td className="mono">{s.exit ?? '—'}</td>
                  <td>
                    {s.status === 'running' && (
                      <Btn small tone="danger" onClick={() => void kill(s.id)}>
                        ✕ {t('terminal.kill')}
                      </Btn>
                    )}
                  </td>
                </tr>
              ))}
              {(shells.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">{t('common.empty')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
