import React, { useEffect, useState } from 'react'
import { useOc } from '../state'
import { Badge, Btn, Card, ConfirmBtn, ErrBox, TextInput, toast, usePoll } from '../ui'
import { ApiError, request, shortId } from '../api'

interface AgentInfo {
  id: string
  name?: string
  mode?: string
  color?: string
  hidden?: boolean
  description?: string
}

const TEMPLATE = `---
description: Descrivi cos'è questo agente
mode: primary
color: "#4af0c8"
permissions:
  - action: "*"
    resource: "*"
    effect: allow
  - action: shell
    resource: "git push *"
    effect: ask
---

Il prompt di sistema dell'agente va qui, nel corpo del file Markdown.
`

export default function AgentsView(): React.ReactElement {
  const { directory, t, sessionID } = useOc()
  const [scope, setScope] = useState<'global' | 'project'>('global')
  const [files, setFiles] = useState<Array<{ id: string; path: string }>>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [newId, setNewId] = useState('')

  const live = usePoll<AgentInfo[]>(
    async () => {
      const res = await request<{ data?: AgentInfo[] }>('GET', '/api/agent', {
        query: { 'location[directory]': directory },
      })
      return (res.data ?? []) as AgentInfo[]
    },
    20000,
    [directory],
  )

  const cfg = usePoll<{ defaultAgent: string | null }>(
    async () => {
      const g = await window.oc.readGlobalConfig()
      return { defaultAgent: g.defaultAgent }
    },
    30000,
    [],
  )

  const loadFiles = async (): Promise<void> => {
    const res = await window.oc.listAgentFiles(scope, directory)
    setFiles(res.files)
  }

  useEffect(() => {
    void loadFiles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, directory])

  const openFile = async (id: string): Promise<void> => {
    setSelected(id)
    const res = await window.oc.readAgentFile(scope, directory, id)
    setDraft(res.text ?? '')
    setSaveErr(null)
  }

  const save = async (): Promise<void> => {
    if (!selected) return
    setSaving(true)
    const res = await window.oc.writeAgentFile(scope, directory, selected, draft)
    setSaving(false)
    if (res.ok) {
      toast('✓ ' + t('common.saved'))
      setSaveErr(null)
      void loadFiles()
      live.reload()
    } else {
      setSaveErr(res.error ?? 'errore')
    }
  }

  const createFile = async (): Promise<void> => {
    const id = newId.trim()
    if (!id) return
    const res = await window.oc.writeAgentFile(scope, directory, id, TEMPLATE)
    if (res.ok) {
      setNewOpen(false)
      setNewId('')
      await loadFiles()
      await openFile(id)
      live.reload()
      toast('✓ ' + id)
    } else {
      toast('✗ ' + (res.error ?? ''))
    }
  }

  const removeFile = async (): Promise<void> => {
    if (!selected) return
    const res = await window.oc.deleteAgentFile(scope, directory, selected)
    if (res.ok) {
      toast('✓ ' + t('common.delete'))
      setSelected(null)
      setDraft('')
      await loadFiles()
      live.reload()
    } else {
      toast('✗ ' + (res.error ?? ''))
    }
  }

  const setDefault = async (id: string): Promise<void> => {
    const res = await window.oc.setDefaultAgent(id)
    if (res.ok) {
      toast('✓ default = ' + id)
      cfg.reload()
    } else {
      toast('✗ ' + (res.error ?? ''))
    }
  }

  const effective = live.data?.find((a) => a.id === selected)

  return (
    <div className="pad grid-2">
      <div className="col">
        <Card
          title={t('agents.title')}
          actions={
            <>
              <Badge tone={(live.data ?? []).some((a) => a.id === 'blinky' && cfg.data?.defaultAgent === 'blinky') ? 'ok' : 'muted'}>
                {cfg.data?.defaultAgent ? `default: ${cfg.data.defaultAgent}` : 'default: —'}
              </Badge>
            </>
          }
        >
          <div className="muted" style={{ marginBottom: 8 }}>
            Lista effettiva dal server:
          </div>
          <div className="agentlist">
            {(live.data ?? []).map((a) => (
              <div key={a.id} className="agentrow">
                <span className="dot-dot" style={{ background: a.color ?? '#4d5566' }} />
                <span className="mono">{a.id}</span>
                <Badge tone={a.mode === 'primary' ? 'ok' : a.mode === 'all' ? 'info' : 'muted'}>{a.mode ?? '?'}</Badge>
                {a.hidden && <Badge tone="warn">hidden</Badge>}
                <div className="spacer" />
                <Btn small tone="ghost" onClick={() => void setDefault(a.id)} title={t('agents.setDefault')}>
                  ★
                </Btn>
              </div>
            ))}
          </div>
        </Card>

        <Card
          title={scope === 'global' ? t('agents.global') : t('agents.project')}
          actions={
            <>
              <Btn small onClick={() => setScope(scope === 'global' ? 'project' : 'global')}>
                {scope === 'global' ? '→ ' + t('agents.project') : '→ ' + t('agents.global')}
              </Btn>
              <Btn small tone="primary" onClick={() => setNewOpen(!newOpen)}>
                + {t('agents.newFile')}
              </Btn>
            </>
          }
        >
          <div className="muted" style={{ marginBottom: 6 }}>
            {scope === 'project' ? t('agents.projectHint') : ''}
          </div>
          {newOpen && (
            <div className="row-gap" style={{ marginBottom: 8 }}>
              <TextInput
                autoFocus
                value={newId}
                onChange={setNewId}
                width={170}
                placeholder="id-agente (senza .md)"
                onEnter={() => void createFile()}
              />
              <Btn small tone="primary" onClick={() => void createFile()}>
                ✓
              </Btn>
              <Btn small tone="ghost" onClick={() => setNewOpen(false)}>
                ✗
              </Btn>
            </div>
          )}
          <div className="agentlist">
            {files.length === 0 && <div className="muted">—</div>}
            {files.map((f) => (
              <button key={f.id} className={`agentrow clickable ${selected === f.id ? 'agentrow-active' : ''}`} onClick={() => void openFile(f.id)}>
                <span className="dot-dot" style={{ background: f.id === 'blinky' ? '#ff4f4f' : '#4af0c8' }} />
                <span className="mono">{f.id}.md</span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="col">
        <Card
          title={`${t('agents.editor')} ${selected ? '— ' + selected + '.md' : ''}`}
          actions={
            <>
              <ConfirmBtn
                small={false}
                label={t('common.confirm')}
                tone="danger"
                disabled={!selected}
                onConfirm={() => void removeFile()}
              >
                ✕ {t('common.delete')}
              </ConfirmBtn>
              <Btn small tone="primary" disabled={!selected || saving} onClick={() => void save()}>
                ⌲ {t('common.save')}
              </Btn>
            </>
          }
        >
          {selected ? (
            <>
              <ErrBox error={saveErr} />
              <textarea className="code-input" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} />
            </>
          ) : (
            <div className="muted">Nessun file aperto</div>
          )}
        </Card>

        {effective && (
          <Card title={t('agents.effective')}>
            <pre className="tool-io">{JSON.stringify(effective, null, 2)}</pre>
          </Card>
        )}
      </div>
    </div>
  )
}
