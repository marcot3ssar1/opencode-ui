import React, { useEffect, useMemo, useRef, useState } from 'react'
import { OcProvider, useOc } from './state'
import { Badge, Btn, ErrorBoundary } from './ui'
import { shortId } from './api'
import HomeView from './views/HomeView'
import SessionsView from './views/SessionsView'
import ChatView from './views/ChatView'
import AgentsView from './views/AgentsView'
import PermissionsView from './views/PermissionsView'
import ModelsView from './views/ModelsView'
import McpView from './views/McpView'
import ConfigView from './views/ConfigView'
import FilesView from './views/FilesView'
import TerminalView from './views/TerminalView'
import GitView from './views/GitView'
import CommandsView from './views/CommandsView'
import StatsView from './views/StatsView'

type ViewId =
  | 'home'
  | 'sessions'
  | 'chat'
  | 'agents'
  | 'permissions'
  | 'models'
  | 'mcp'
  | 'config'
  | 'files'
  | 'terminal'
  | 'git'
  | 'commands'
  | 'stats'

const NAV: ViewId[] = [
  'home',
  'sessions',
  'chat',
  'agents',
  'permissions',
  'models',
  'mcp',
  'config',
  'files',
  'terminal',
  'git',
  'commands',
  'stats',
]

function BlinkyGhost(): React.ReactElement {
  return (
    <span className="blinky-hop">
      <span className="blinky">
        <span className="blinky-fringe" />
        <span className="blinky-eyes"><i /><i /></span>
      </span>
    </span>
  )
}

/* "BLINKY" scritto in pixel: ogni lettera è una griglia 5x7 */
const GLYPHS: Record<string, string[]> = {
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
}

function PixelWord({ text }: { text: string }): React.ReactElement {
  const chars = text.toUpperCase().split('').filter((c) => GLYPHS[c])
  return (
    <span className="pixelword" aria-hidden="true">
      {chars.map((c, i) => (
        <span key={i} className="pixelglyph">
          {GLYPHS[c].flatMap((row, r) =>
            row.split('').map((p, col) => (
              <i key={`${r}-${col}`} className={p === '1' ? 'px-on' : ''} />
            )),
          )}
        </span>
      ))}
    </span>
  )
}

function Shell(): React.ReactElement {
  const { directory, pickDirectory, connected, lang, setLang, t, server, version, events, sessionID } = useOc()
  const [view, setView] = useState<ViewId>('home')

  const pendingPermissions = useMemo(
    () => events.filter((e) => e.type.includes('permission')).filter((e) => !e.type.includes('reply')).length,
    [events],
  )

  // Blinky reattivo: eventi recenti di sessione/shell/permessi = "agente al lavoro" → corsa.
  // connected=false → Blinky si blocca e diventa grigio ("lost").
  const blinkyLastAct = useRef(0)
  useEffect(() => {
    const last = events[events.length - 1]
    if (last && /^(session|shell|permission)/.test(last.type)) blinkyLastAct.current = Date.now()
  }, [events])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const iv = setInterval(() => setBusy(connected && Date.now() - blinkyLastAct.current < 5000), 1000)
    return () => clearInterval(iv)
  }, [connected])

  useEffect(() => {
    const key = 'oc-view-' + view
    localStorage.setItem(key, '1')
  }, [view])

  const label = useMemo<Record<ViewId, string>>(
    () => ({
      home: t('nav.home'),
      sessions: t('nav.sessions'),
      chat: t('nav.chat'),
      agents: t('nav.agents'),
      permissions: t('nav.permissions'),
      models: t('nav.models'),
      mcp: t('nav.mcp'),
      config: t('nav.config'),
      files: t('nav.files'),
      terminal: t('nav.terminal'),
      git: t('nav.git'),
      commands: t('nav.commands'),
      stats: t('nav.stats'),
    }),
    [t],
  )

  const renderView = (): React.ReactElement => {
    switch (view) {
      case 'home':
        return <HomeView />
      case 'sessions':
        return <SessionsView />
      case 'chat':
        return <ChatView />
      case 'agents':
        return <AgentsView />
      case 'permissions':
        return <PermissionsView />
      case 'models':
        return <ModelsView />
      case 'mcp':
        return <McpView />
      case 'config':
        return <ConfigView />
      case 'files':
        return <FilesView />
      case 'terminal':
        return <TerminalView />
      case 'git':
        return <GitView />
      case 'commands':
        return <CommandsView />
      case 'stats':
        return <StatsView />
    }
  }

  const icon: Record<ViewId, string> = {
    home: '⌂',
    sessions: '❐',
    chat: '✉',
    agents: '☺',
    permissions: '⚿',
    models: '⚡',
    mcp: '⑃',
    config: '⚙',
    files: '▦',
    terminal: '❯',
    git: '⑂',
    commands: '⌘',
    stats: '◨',
  }

  return (
    <div className="app-root">
      <div className="titlebar">
        <span
          className={'blinky-stage-bar' + (busy ? ' blinky-busy' : '') + (!connected ? ' blinky-lost' : '')}
          aria-hidden="true"
        >
          <BlinkyGhost />
        </span>
      </div>
      <div className="layout">
        <aside className="sidebar">
        <div className="brand">
          <div>
            <div className="brand-line">
              <span className="brand-title">{t('app.title')}</span>
              <PixelWord text="BLINKY" />
            </div>
            <div className="brand-sub">{version ? `opencode ${version}` : t('app.subtitle')}</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((v) => (
            <button key={v} className={`nav-item ${view === v ? 'nav-active' : ''}`} onClick={() => setView(v)} title={t('hint.' + v)}>
              <span className="nav-ico">{icon[v]}</span>
              <span>{label[v]}</span>
              {v === 'permissions' && pendingPermissions > 0 && (
                <span className="nav-dot" title={`${pendingPermissions}`} />
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className={`conn ${connected ? 'conn-on' : 'conn-off'}`}>
            {connected ? t('top.connected') : t('top.disconnected')}
          </div>
        </div>
      </aside>
      <div className="content">
        <header className="topbar">
          <button className="dir-btn" onClick={() => void pickDirectory()} title={directory}>
            <span className="dir-label">{t('top.directory')}</span>
            <span className="dir-path">{directory || '…'}</span>
          </button>
          <div className="topbar-right">
            {server?.location?.project?.id ? (
              <span className="muted mono">{shortId(server.location.project.id, 8)}</span>
            ) : null}
            <select className="input select select-sm" value={lang} onChange={(e) => setLang(e.target.value as typeof lang)}>
              <option value="it">🇮🇹 Italiano</option>
              <option value="en">🇬🇧 English</option>
            </select>
            <Btn small tone="ghost" onClick={() => void window.oc.reopenService()} title={t('top.reopen')}>
              ⟳ {t('top.reopen')}
            </Btn>
          </div>
        </header>
        <div className="viewhint mono">{label[view]} — {t('hint.' + view)}</div>
        <main className="viewport">
          <ErrorBoundary key={view} label={label[view]}>
            {renderView()}
          </ErrorBoundary>
        </main>
        {sessionID ? (
          <footer className="statusbar mono">
            {t('sessions.select')}: {shortId(sessionID, 14)}
          </footer>
        ) : (
          <footer className="statusbar statusbar-dim mono">—</footer>
        )}
        </div>
      </div>
    </div>
  )
}

export default function App(): React.ReactElement {
  return (
    <OcProvider>
      <Shell />
    </OcProvider>
  )
}
