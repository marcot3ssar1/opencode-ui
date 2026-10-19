import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { makeT, type Lang, type TFunc } from './i18n'

export interface OcEvent {
  type: string
  properties?: Record<string, unknown>
  raw?: unknown
  _seq?: number
}

export interface ServerSnap {
  ok: boolean
  url?: string
  version?: string
  pid?: number
  error?: string
  location?: { directory?: string; project?: { id?: string; directory?: string; canonical?: string } }
}

interface OcStore {
  directory: string
  setDirectory: (d: string) => Promise<void>
  pickDirectory: () => Promise<void>
  connected: boolean
  version: string
  server: ServerSnap | null
  refreshServer: () => Promise<void>
  events: OcEvent[]
  pushEvent: (e: unknown) => void
  useEvent: (handler: (e: OcEvent) => void) => void
  lang: Lang
  setLang: (l: Lang) => void
  t: TFunc
  appVersion: string
  sessionID: string | null
  setSessionID: (id: string | null) => void
}

const Ctx = createContext<OcStore | null>(null)

export function useOc(): OcStore {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useOc fuori dal provider')
  return ctx
}

let seq = 0

export function OcProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [directory, setDirectoryState] = useState('')
  const [server, setServer] = useState<ServerSnap | null>(null)
  const [events, setEvents] = useState<OcEvent[]>([])
  const [lang, setLangState] = useState<Lang>((localStorage.getItem('oc-lang') as Lang) ?? 'it')
  const [appVersion, setAppVersion] = useState('')
  const [sessionID, setSessionID] = useState<string | null>(null)
  const eventHandlers = useRef(new Set<(e: OcEvent) => void>())

  const pushEvent = useCallback((rawEvent: unknown) => {
    const src = (rawEvent ?? {}) as { properties?: Record<string, unknown>; data?: unknown }
    const ev: OcEvent = { ...(rawEvent as OcEvent), _seq: ++seq }
    // OpenCode V2 streams events as { id, type, data, ... } — expose `data` as
    // `properties` so every consumer sees the same normalized shape.
    if (!ev.properties && src.data !== undefined) {
      ev.properties = (typeof src.data === 'object' && src.data !== null ? src.data : {}) as Record<string, unknown>
    }
    setEvents((prev) => {
      const next = [...prev, ev]
      return next.length > 500 ? next.slice(next.length - 500) : next
    })
    for (const h of eventHandlers.current) h(ev)
  }, [])

  useEffect(() => {
    const off = window.oc.onEvent(pushEvent)
    void window.oc.getDirectory().then((d) => setDirectoryState(d.directory))
    void window.oc.appVersion().then(setAppVersion)
    return off
  }, [pushEvent])

  const refreshServer = useCallback(async () => {
    const res = await window.oc.serviceInfo()
    if (res.ok) {
      const info = (res.serverInfo ?? {}) as { version?: string; pid?: number }
      setServer({
        ok: true,
        url: res.url,
        version: info.version,
        pid: info.pid,
        location: (res.locationInfo ?? {}) as ServerSnap['location'],
      })
    } else {
      setServer({ ok: false, error: res.error ?? 'irraggiungibile' })
    }
  }, [])

  useEffect(() => {
    void refreshServer()
    const iv = setInterval(() => void refreshServer(), 15000)
    return () => clearInterval(iv)
  }, [refreshServer])

  const setDirectory = useCallback(async (d: string) => {
    setDirectoryState(d)
    setSessionID(null)
  }, [])

  const pickDirectory = useCallback(async () => {
    const res = await window.oc.pickDirectory()
    if (res.ok && res.directory) setDirectoryState(res.directory)
  }, [])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    localStorage.setItem('oc-lang', l)
  }, [])

  const t = useMemo(() => makeT(lang), [lang])

  const useEvent = useCallback((handler: (e: OcEvent) => void) => {
    useEffect(() => {
      eventHandlers.current.add(handler)
      return () => {
        eventHandlers.current.delete(handler)
      }
    }, [handler])
  }, [])

  const value: OcStore = {
    directory,
    setDirectory,
    pickDirectory,
    connected: !!server?.ok,
    version: server?.version ?? '',
    server,
    refreshServer,
    events,
    pushEvent,
    useEvent,
    lang,
    setLang,
    t,
    appVersion,
    sessionID,
    setSessionID,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
