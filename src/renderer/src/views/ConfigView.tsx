import React, { useEffect, useState } from 'react'
import { useOc } from '../state'
import { Badge, Btn, Card, ErrBox, toast, usePoll } from '../ui'
import { request } from '../api'

interface GlobalCfg {
  opencodeText: string | null
  opencodePath: string
  cliText: string | null
  cliPath: string
  defaultAgent: string | null
  projectPath: string | null
  projectText: string | null
}

export default function ConfigView(): React.ReactElement {
  const { directory, t } = useOc()
  const [globalText, setGlobalText] = useState('')
  const [cliText, setCliText] = useState('')
  const [projectText, setProjectText] = useState('')
  const [projectPath, setProjectPath] = useState('opencode.json')
  const [err, setErr] = useState<string | null>(null)

  const agents = usePoll<Array<{ id: string; name?: string }>>(
    async () => {
      const res = await request<{ data?: Array<{ id: string; name?: string }> }>('GET', '/api/agent', {
        query: { 'location[directory]': directory },
      })
      return (res.data ?? []) as Array<{ id: string; name?: string }>
    },
    30000,
    [directory],
  )

  const load = async (): Promise<void> => {
    const g: GlobalCfg = await window.oc.readGlobalConfig()
    setGlobalText(g.opencodeText ?? '')
    setCliText(g.cliText ?? '{\n\n}')
    setProjectPath(g.projectPath ?? 'opencode.json')
    setProjectText(g.projectText ?? '')
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directory])

  const saveGlobal = async (): Promise<void> => {
    const res = await window.oc.saveGlobalConfig('opencode', globalText)
    if (res.ok) {
      toast('✓ ' + t('common.saved'))
      setErr(null)
    } else {
      setErr(res.error ?? 'errore')
    }
  }

  const saveCli = async (): Promise<void> => {
    const res = await window.oc.saveGlobalConfig('cli', cliText)
    if (res.ok) {
      toast('✓ ' + t('common.saved'))
      setErr(null)
    } else {
      setErr(res.error ?? 'errore')
    }
  }

  const saveProject = async (): Promise<void> => {
    const rel = projectPath.startsWith(directory + '\\') || projectPath.startsWith(directory + '/')
      ? projectPath.slice(directory.length + 1)
      : projectPath
    const res = await window.oc.saveProjectConfig(rel, projectText)
    if (res.ok) {
      toast('✓ ' + t('common.saved'))
      setErr(null)
    } else {
      setErr(res.error ?? 'errore')
    }
  }

  return (
    <div className="pad">
      {err && <ErrBox error={err} />}
      <div className="muted" style={{ marginBottom: 12 }}>{t('config.warn')}</div>

      <Card
        title={t('config.global')}
        actions={
          <>
            <Badge tone="muted">~/.config/opencode/opencode.jsonc</Badge>
            <select
              className="input select select-sm"
              value=""
              onChange={async (e) => {
                const id = (e.target as HTMLSelectElement).value
                if (!id) return
                const res = await window.oc.setDefaultAgent(id)
                toast(res.ok ? '✓ default_agent = ' + id : '✗ ' + (res.error ?? ''))
                void load()
                agents.reload()
              }}
            >
              <option value="">default_agent…</option>
              {(agents.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.name ?? a.id}</option>
              ))}
            </select>
            <Btn small onClick={() => void load()}>⟳</Btn>
            <Btn small tone="primary" onClick={() => void saveGlobal()}>⌲ {t('common.save')}</Btn>
          </>
        }
      >
        <textarea className="code-input" value={globalText} onChange={(e) => setGlobalText(e.target.value)} spellCheck={false} />
      </Card>

      <Card
        title={t('config.project')}
        actions={
          <>
            <Badge tone="muted">{projectPath}</Badge>
            <Btn small tone="primary" onClick={() => void saveProject()}>⌲ {t('common.save')}</Btn>
          </>
        }
      >
        <textarea
          className="code-input"
          value={projectText}
          placeholder={'{\n  "$schema": "https://opencode.ai/config.json"\n}'}
          onChange={(e) => setProjectText(e.target.value)}
          spellCheck={false}
        />
      </Card>

      <Card
        title={t('config.cli')}
        actions={
          <>
            <Badge tone="muted">~/.config/opencode/cli.json</Badge>
            <Btn small tone="primary" onClick={() => void saveCli()}>⌲ {t('common.save')}</Btn>
          </>
        }
      >
        <textarea className="code-input code-input-sm" value={cliText} onChange={(e) => setCliText(e.target.value)} spellCheck={false} />
      </Card>
    </div>
  )
}
