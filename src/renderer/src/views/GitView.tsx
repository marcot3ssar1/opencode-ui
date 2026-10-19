import React, { useState } from 'react'
import { useOc } from '../state'
import { Badge, Btn, Card, ConfirmBtn, ErrBox, TextInput, toast, usePoll } from '../ui'
import { ApiError, request } from '../api'

interface VcsInfo {
  provider?: string
  branch?: { current?: string; default?: string }
}

interface FileStatus {
  file?: string
  status?: string
  additions?: number
  deletions?: number
}

interface FileDiff {
  file?: string
  patch?: string
  additions?: number
  deletions?: number
  status?: string
}

interface WorktreeDir {
  directory: string
  strategy?: string
}

export default function GitView(): React.ReactElement {
  const { directory, t, server } = useOc()
  const [err, setErr] = useState<string | null>(null)
  const [wtName, setWtName] = useState('')

  const projectID = server?.location?.project?.id

  const info = usePoll<VcsInfo | null>(async () => {
    try {
      const res = await request<{ data?: VcsInfo }>('GET', '/api/vcs', {
        query: { 'location[directory]': directory },
      })
      return (res.data ?? null) as VcsInfo | null
    } catch {
      return null
    }
  }, 15000, [directory])

  const status = usePoll<FileStatus[]>(async () => {
    try {
      const res = await request<{ data?: FileStatus[] }>('GET', '/api/vcs/status', {
        query: { 'location[directory]': directory },
      })
      return (res.data ?? []) as FileStatus[]
    } catch {
      return []
    }
  }, 10000, [directory])

  const branches = usePoll<string[]>(async () => {
    try {
      const res = await request<{ data?: string[] }>('GET', '/api/vcs/branch', {
        query: { 'location[directory]': directory },
      })
      return (res.data ?? []) as string[]
    } catch {
      return []
    }
  }, 30000, [directory])

  const diff = usePoll<FileDiff[]>(async () => {
    try {
      const res = await request<{ data?: FileDiff[] }>('GET', '/api/vcs/diff', {
        query: { 'location[directory]': directory, mode: 'working' },
      })
      return (res.data ?? []) as FileDiff[]
    } catch {
      return []
    }
  }, 15000, [directory])

  const worktrees = usePoll<WorktreeDir[]>(async () => {
    if (!projectID) return []
    try {
      const res = await request<WorktreeDir[]>('GET', '/api/worktree', { query: { projectID } })
      return (res as unknown as { data?: WorktreeDir[] }).data ?? ([] as unknown as WorktreeDir[])
    } catch {
      return []
    }
  }, 30000, [projectID])

  const createWorktree = async (): Promise<void> => {
    if (!projectID || !wtName.trim()) return
    try {
      // contrato verificato: 200 { directory: '...worktree/<hash>/<name>' }
      const res = await request<{ directory?: string }>('POST', '/api/worktree', { body: { projectID, name: wtName.trim() } })
      toast('✓ ' + (res.directory ?? wtName))
      setWtName('')
      worktrees.reload()
    } catch (e) {
      toast('✗ ' + String((e as ApiError).message))
    }
  }

  const removeWorktree = async (dir: string): Promise<void> => {
    if (!projectID) return
    try {
      await request('DELETE', '/api/worktree', { body: { projectID, directory: dir, force: false } })
      toast('✓ ' + t('git.remove'))
      worktrees.reload()
    } catch (e) {
      toast('✗ ' + String((e as ApiError).message))
    }
  }

  const refreshWorktrees = async (): Promise<void> => {
    if (!projectID) return
    try {
      await request('POST', '/api/worktree/refresh', { body: { projectID } })
      worktrees.reload()
    } catch (e) {
      toast('✗ ' + String((e as ApiError).message))
    }
  }

  return (
    <div className="pad">
      {err && <ErrBox error={err} />}
      <div className="cards">
        <Card title={t('git.status')}>
          {info.data ? (
            <table className="kv">
              <tbody>
                <tr>
                  <th>{t('git.provider')}</th>
                  <td className="mono">{info.data.provider ?? 'git'}</td>
                </tr>
                <tr>
                  <th>branch</th>
                  <td>
                    <Badge tone="ok">{info.data.branch?.current ?? '—'}</Badge>
                    <span className="muted"> default: {info.data.branch?.default ?? '—'}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <div className="muted">non è un repository supportato</div>
          )}
        </Card>

        <Card
          title={t('git.branches')}
          actions={
            <Btn small onClick={() => branches.reload()}>⟳</Btn>
          }
        >
          <div className="branchlist">
            {(branches.data ?? []).map((b) => {
              const current = b === info.data?.branch?.current
              return (
                <div key={b} className="branchrow">
                  {current && <span className="dot-dot dot-ok" />}
                  <span className="mono">{b}</span>
                  {current && <Badge tone="ok">current</Badge>}
                </div>
              )
            })}
            {(branches.data ?? []).length === 0 && <div className="muted">{t('common.empty')}</div>}
          </div>
        </Card>
      </div>

      <Card
        title={`${t('git.diff')} — ${status.data?.length ?? 0} files`}
        actions={
          <Btn small onClick={() => diff.reload()}>⟳</Btn>
        }
      >
        <table className="table" style={{ marginBottom: 12 }}>
          <thead>
            <tr>
              <th>file</th>
              <th>{t('common.status')}</th>
              <th>+ / −</th>
            </tr>
          </thead>
          <tbody>
            {(status.data ?? []).map((s, i) => (
              <tr key={i}>
                <td className="mono selectable">{s.file}</td>
                <td><Badge tone={s.status === 'deleted' ? 'err' : s.status === 'added' ? 'info' : 'warn'}>{s.status}</Badge></td>
                <td className="mono">+{s.additions ?? 0} −{s.deletions ?? 0}</td>
              </tr>
            ))}
            {(status.data ?? []).length === 0 && (
              <tr><td colSpan={3} className="muted">working tree pulito</td></tr>
            )}
          </tbody>
        </table>

        <div className="diffs">
          {(diff.data ?? []).map((d, i) => (
            <details key={i} className="diffbox" open={i === 0}>
              <summary className="mono">
                {d.file} <span className="muted">+{d.additions ?? 0} −{d.deletions ?? 0}</span>
              </summary>
              <pre className="tool-io">{d.patch}</pre>
            </details>
          ))}
        </div>
      </Card>

      <Card
        title={t('git.worktrees')}
        actions={
          <>
            <div className="row-gap">
              <TextInput value={wtName} onChange={setWtName} placeholder="nome worktree" width={160} onEnter={() => void createWorktree()} />
              <Btn small tone="primary" disabled={!projectID || !wtName.trim()} onClick={() => void createWorktree()}>
                + {t('git.create')}
              </Btn>
              <Btn small onClick={() => void refreshWorktrees()}>⟳ {t('git.refresh')}</Btn>
              <Badge tone="muted">{projectID ? short8(projectID) : 'no project'}</Badge>
            </div>
          </>
        }
      >
        <table className="table">
          <thead>
            <tr>
              <th>{t('common.path')}</th>
              <th>strategy</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(worktrees.data ?? []).map((w) => (
              <tr key={w.directory}>
                <td className="mono selectable">{w.directory}</td>
                <td className="mono muted">{w.strategy ?? 'git'}</td>
                <td>
                  <ConfirmBtn label={t('common.confirm')} tone="danger" onConfirm={() => void removeWorktree(w.directory)}>
                    ✕ {t('git.remove')}
                  </ConfirmBtn>
                </td>
              </tr>
            ))}
            {(worktrees.data ?? []).length === 0 && (
              <tr><td colSpan={3} className="muted">{t('common.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function short8(id: string): string {
  return id.length > 8 ? id.slice(0, 8) + '…' : id
}
