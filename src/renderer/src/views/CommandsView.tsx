import React from 'react'
import { useOc } from '../state'
import { Badge, Btn, Card, ErrBox, toast, usePoll } from '../ui'
import { ApiError, request } from '../api'

interface SkillInfo {
  id: string
  name?: string
  autoinvoke?: boolean
  path?: string
  content?: string
}

export default function CommandsView(): React.ReactElement {
  const { directory, t, sessionID } = useOc()

  const commands = usePoll<Array<{ name: string }>>(
    async () => {
      const res = await request<{ data?: Array<{ name: string }> }>('GET', '/api/command', {
        query: { 'location[directory]': directory },
      })
      return (res.data ?? []) as Array<{ name: string }>
    },
    20000,
    [directory],
  )

  const skills = usePoll<SkillInfo[]>(
    async () => {
      const res = await request<{ data?: SkillInfo[] }>('GET', '/api/skill', {
        query: { 'location[directory]': directory },
      })
      return (res.data ?? []) as SkillInfo[]
    },
    30000,
    [directory],
  )

  const runOn = async (name: string): Promise<void> => {
    if (!sessionID) {
      toast('⚠ seleziona prima una sessione (Sessioni → ✉)')
      return
    }
    try {
      await request('POST', `/api/session/${sessionID}/command`, { body: { name, text: '' } })
      toast('✓ /' + name)
    } catch (e) {
      toast('✗ ' + String((e as ApiError).message))
    }
  }

  return (
    <div className="pad">
      <Card
        title={t('nav.commands')}
        actions={
          <Badge tone={sessionID ? 'ok' : 'muted'}>
            {sessionID ? t('commands.runOn') + ' ✓' : t('commands.runOn') + ' —'}
          </Badge>
        }
      >
        <div className="command-grid">
          {(commands.data ?? []).map((c) => (
            <div key={c.name} className="command-card" title={'/' + c.name}>
              <div className="mono lbl-trunc">/{c.name}</div>
              <Btn small tone="primary" onClick={() => void runOn(c.name)} title={t('commands.runOn')}>
                ▶
              </Btn>
            </div>
          ))}
          {(commands.data ?? []).length === 0 && <div className="muted">{t('common.empty')}</div>}
        </div>
        <div className="muted" style={{ marginTop: 10 }}>
          I comandi sono definiti in <span className="mono">opencode.jsonc → commands</span> o in
          <span className="mono"> .opencode/commands/</span>. Modificali dalla vista Configurazione.
        </div>
      </Card>

      <Card title={t('commands.skills')} actions={<Btn small onClick={() => skills.reload()}>⟳</Btn>}>
        <ErrBox error={skills.error} />
        {(skills.data ?? []).map((s) => (
          <details key={s.id} className="diffbox">
            <summary className="mono cmd-sum" title={s.path ?? ''}>
              <span className="cmd-sum-name">{s.name ?? s.id}</span>
              {s.autoinvoke && <Badge tone="info">{t('commands.autoinvoke')}</Badge>}
              <span className="muted cmd-sum-path">{s.path}</span>
            </summary>
            <pre className="tool-io">{(s.content ?? '').slice(0, 8000)}</pre>
          </details>
        ))}
        {(skills.data ?? []).length === 0 && <div className="muted">{t('common.empty')}</div>}
      </Card>
    </div>
  )
}
