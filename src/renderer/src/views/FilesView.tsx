import React, { useState } from 'react'
import { useOc } from '../state'
import { Badge, Btn, Card, ErrBox, TextInput, toast, usePoll } from '../ui'
import { ApiError, request } from '../api'

interface FsEntry {
  path: string  // relative
  type: 'file' | 'directory'
}

const KINDS: Record<string, string> = {
  lnk: 'shortcut', url: 'shortcut',
  pdf: 'document', doc: 'document', docx: 'document', odt: 'document',
  txt: 'text', log: 'text', md: 'text',
  ini: 'settings', cfg: 'settings', config: 'settings', json: 'settings', jsonc: 'settings',
  yaml: 'settings', yml: 'settings', toml: 'settings', env: 'settings',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', bmp: 'image', svg: 'image', ico: 'image',
  zip: 'archive', rar: 'archive', '7z': 'archive', gz: 'archive', tar: 'archive', iso: 'archive',
  exe: 'program', msi: 'program', appx: 'program',
  dll: 'library', so: 'library',
  bat: 'script', ps1: 'script', cmd: 'script', sh: 'script',
  mp4: 'video', mkv: 'video', avi: 'video', mov: 'video',
  mp3: 'audio', wav: 'audio', flac: 'audio',
  html: 'web', htm: 'web', css: 'web',
  js: 'code', mjs: 'code', cjs: 'code', ts: 'code', tsx: 'code', jsx: 'code',
  py: 'code', java: 'code', c: 'code', cpp: 'code', h: 'code', cs: 'code', go: 'code', rs: 'code', rb: 'code', php: 'code', sql: 'code',
}

const BINARY_KINDS = new Set(['image', 'archive', 'program', 'library', 'video', 'audio'])

function nameOf(e: FsEntry): string {
  return e.path.split(/[/\\]/).pop() ?? e.path
}

function kindLabel(e: FsEntry, t: (k: string) => string): string {
  if (e.type === 'directory') return t('files.folder')
  const name = nameOf(e)
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
  const kind = KINDS[ext]
  if (kind) return t('files.kind.' + kind)
  if (ext && ext.length <= 4) return ext.toUpperCase()
  return t('files.file')
}

export default function FilesView(): React.ReactElement {
  const { directory, t } = useOc()
  const [rel, setRel] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const listing = usePoll<FsEntry[]>(
    async () => {
      const res = await request<{ data?: FsEntry[] }>('GET', '/api/fs/list', {
        query: { 'location[directory]': directory, path: rel || '.' },
      })
      return ((res.data ?? []) as FsEntry[]).sort(sortEntries)
    },
    15000,
    [directory, rel],
  )

  const found = usePoll<FsEntry[]>(
    async () => {
      if (!search.trim()) return []
      try {
        const res = await request<{ data?: FsEntry[] }>('GET', '/api/fs/find', {
          query: { 'location[directory]': directory, query: search.trim(), limit: 80 },
        })
        return (res.data ?? []) as FsEntry[]
      } catch {
        return []
      }
    },
    20000,
    [directory, search],
  )

  const openFile = async (entry: FsEntry): Promise<void> => {
    if (entry.type === 'directory') {
      setRel(entry.path)
      setSelected(null)
      return
    }
    setSelected(entry.path)
    setSaveErr(null)
    try {
      const text = await request<string>('GET', `/api/fs/read/${encodeURI(entry.path)}`, {
        query: { 'location[directory]': directory },
      })
      setDraft(typeof text === 'string' ? text : String(text))
    } catch (e) {
      setSaveErr(String((e as ApiError).message))
      setDraft('')
    }
  }

  const save = async (): Promise<void> => {
    if (!selected) return
    const abs = joinPath(directory, selected)
    try {
      await request('POST', '/api/experimental/fs/write', {
        query: { 'location[directory]': directory, path: abs },
        rawBody: draft,
      })
      toast('✓ ' + t('common.saved'))
      listing.reload()
    } catch (e) {
      setSaveErr(String((e as ApiError).message))
    }
  }

  const crumbs = rel ? rel.replace(/\\/g, '/').split('/').filter(Boolean) : []

  return (
    <div className="pad grid-2 files-grid">
      <div className="col">
        <Card
          title={t('files.title')}
          actions={
            <>
              <TextInput value={search} onChange={setSearch} placeholder={t('files.search')} width={170} />
              <Badge tone="muted">{rel || directory}</Badge>
            </>
          }
        >
          <div className="crumbs">
            <button className="crumb" onClick={() => setRel('')}>◆</button>
            {crumbs.map((c, i) => (
              <button key={i} className="crumb" onClick={() => setRel(crumbs.slice(0, i + 1).join('\\'))}>
                {c}
              </button>
            ))}
          </div>

          {search.trim() ? (
            <div className="filelist">
              {(found.data ?? []).map((f) => (
                <button key={f.path} className={`filerow`} title={f.path} onClick={() => void openFile(f)}>
                  <span className="mono">{f.path}</span>
                  <span className="filerow-meta">{kindLabel(f, t)}</span>
                </button>
              ))}
              {(found.data ?? []).length === 0 && <div className="muted">{t('common.empty')}</div>}
            </div>
          ) : (
            <div className="filelist">
              {(listing.data ?? []).map((f) => (
                <button key={f.path} className="filerow" title={f.path} onClick={() => void openFile(f)}>
                  <Badge tone={f.type === 'directory' ? 'info' : 'muted'}>{f.type === 'directory' ? '▤' : '≡'}</Badge>
                  <span className="mono">{nameOf(f)}</span>
                  <span className="filerow-meta">{kindLabel(f, t)}</span>
                </button>
              ))}
              {listing.loading && !listing.data && <div className="muted">{t('common.loading')}</div>}
              {(listing.data ?? []).length === 0 && !listing.loading && <div className="muted">{t('common.empty')}</div>}
            </div>
          )}
        </Card>
      </div>

      <div className="col">
        <Card
          title={`${selected ?? t('files.select')}`}
          actions={
            selected && (
              <Btn small tone="primary" onClick={() => void save()}>
                ⌲ {t('files.save')}
              </Btn>
            )
          }
        >
          <ErrBox error={saveErr} />
          {saveErr && selected && isBinaryRel(selected) && <div className="muted" style={{ marginTop: 6 }}>{t('files.binaryHint')}</div>}
          {selected ? (
            <textarea className="code-input" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} />
          ) : (
            <div className="muted">{t('files.select')}</div>
          )}
        </Card>
      </div>
    </div>
  )
}

function sortEntries(a: FsEntry, b: FsEntry): number {
  if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
  return a.path.localeCompare(b.path)
}

function isBinaryRel(path: string): boolean {
  const name = path.split(/[/\\]/).pop() ?? ''
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
  const k = KINDS[ext]
  return !!k && BINARY_KINDS.has(k)
}

function joinPath(dir: string, rel: string): string {
  const tail = rel.replace(/[\/\\]+$/, '')
  return dir.endsWith('\\') || dir.endsWith('/') ? dir + tail : dir + '\\' + tail.replace(/\//g, '\\')
}
