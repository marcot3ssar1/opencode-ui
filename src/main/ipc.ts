import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { apiRequest, conn, connectionInfo, restartConnection, stopService } from './connection'
import {
  deleteAgentText,
  getDirectory,
  listAgentFiles,
  readAgentText,
  readGlobalConfig,
  readProjectConfig,
  setDefaultAgent,
  setDirectory,
  writeAgentText,
  writeGlobalConfig,
  writeProjectConfig,
} from './localfs'

let eventsRunning = false
let eventsStopped = false

export function registerIpc(): void {
  ipcMain.handle('bridge:request', async (_e, payload) => {
    const { method, path: p, query, body, location, rawBody, contentType } = payload ?? {}
    return apiRequest(String(method ?? 'GET'), String(p), {
      query,
      body,
      location: location ?? undefined,
      rawBody,
      contentType,
    })
  })

  ipcMain.handle('bridge:service', async () => {
    try {
      await conn()
      const info = await apiRequest('GET', '/api/info')
      if (!info.ok && info.status === 0) {
        // Errore di rete (service spento o irraggiungibile, anche dopo il
        // tentativo di riconnessione): serve un false reale, altrimenti la UI
        // resterebbe "connessa" per sempre e Blinky non vedrebbe mai il loss.
        return { ok: false, error: info.error ?? 'servizio irraggiungibile' }
      }
      const location = await apiRequest('GET', '/api/location', { location: getDirectory() })
      return {
        ok: true,
        ...connectionInfo(),
        serverInfo: info.ok ? info.data : { error: info.error },
        locationInfo: location.ok ? location.data : { error: location.error },
      }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('bridge:reopen', async () => {
    try {
      await restartConnection()
      const info = await apiRequest('GET', '/api/info')
      return { ok: info.ok }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('bridge:stop-service', async () => {
    try {
      await stopService()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('bridge:directory', async (_e, payload) => {
    if (payload?.value) return { ok: true, directory: setDirectory(String(payload.value)) }
    return { ok: true, directory: getDirectory() }
  })

  ipcMain.handle('bridge:pick-directory', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? BrowserWindow.getAllWindows()[0]
    const res = await dialog.showOpenDialog(win, {
      defaultPath: getDirectory(),
      properties: ['openDirectory', 'createDirectory'],
    })
    if (res.canceled || !res.filePaths.length) return { ok: false }
    const dir = res.filePaths[0]
    return { ok: true, directory: setDirectory(dir) }
  })

  ipcMain.handle('config:read-global', async () => {
    const cfg = await readGlobalConfig()
    const project = await readProjectConfig(getDirectory())
    return { ...cfg, projectPath: project?.path ?? null, projectText: project?.text ?? null }
  })

  ipcMain.handle('config:write-global', async (_e, payload) => {
    const err = await writeGlobalConfig(payload?.which === 'cli' ? 'cli' : 'opencode', String(payload?.content ?? ''))
    return { ok: !err, error: err }
  })

  ipcMain.handle('config:write-project', async (_e, payload) => {
    const err = await writeProjectConfig(getDirectory(), String(payload?.rel ?? 'opencode.json'), String(payload?.content ?? ''))
    return { ok: !err, error: err }
  })

  ipcMain.handle('config:set-default-agent', async (_e, payload) => {
    const err = await setDefaultAgent(String(payload?.id ?? ''))
    return { ok: !err, error: err }
  })

  ipcMain.handle('agents:list', async (_e, payload) => {
    const scope = payload?.scope === 'project' ? 'project' : 'global'
    const files = await listAgentFiles(scope, payload?.directory)
    return { ok: true, files }
  })

  ipcMain.handle('agents:read', async (_e, payload) => {
    const text = await readAgentText(payload?.scope === 'project' ? 'project' : 'global', payload?.directory, String(payload?.id ?? ''))
    return { ok: text !== null, text }
  })

  ipcMain.handle('agents:write', async (_e, payload) => {
    const err = await writeAgentText(
      payload?.scope === 'project' ? 'project' : 'global',
      payload?.directory,
      String(payload?.id ?? ''),
      String(payload?.content ?? ''),
    )
    return { ok: !err, error: err }
  })

  ipcMain.handle('agents:delete', async (_e, payload) => {
    const err = await deleteAgentText(payload?.scope === 'project' ? 'project' : 'global', payload?.directory, String(payload?.id ?? ''))
    return { ok: !err, error: err }
  })

  ipcMain.handle('app:open-external', (_e, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      void shell.openExternal(url)
      return { ok: true }
    }
    return { ok: false, error: 'URL non valido' }
  })

  ipcMain.handle('app:version', () => app.getVersion())

  registerEvents()
}

function broadcast(payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    win.webContents.send('bridge:event', payload)
  }
}

async function registerEvents(): Promise<void> {
  if (eventsRunning) return
  eventsRunning = true
  eventsStopped = false
  void eventsLoop()
}

async function eventsLoop(): Promise<void> {
  while (!eventsStopped) {
    let stream: ReadableStream<Uint8Array> | null = null
    try {
      const { url, headers } = await conn()
      const res = await fetch(url + '/api/event', { headers: { ...headers, accept: 'text/event-stream' } })
      if (!res.ok || !res.body) throw new Error(`event stream: HTTP ${res.status}`)
      stream = res.body
      const reader = stream.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      streaming: while (true) {
        const { done, value } = await reader.read()
        if (done) break streaming
        buf += decoder.decode(value, { stream: true })
        let idx: number
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).trimEnd()
          buf = buf.slice(idx + 1)
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (!payload) continue
          try {
            broadcast(JSON.parse(payload))
          } catch {
            broadcast({ type: 'bridge.raw', properties: { raw: payload } })
          }
        }
      }
    } catch (err) {
      broadcast({ type: 'bridge.disconnected', properties: { error: String(err) } })
      await new Promise((resolve) => setTimeout(resolve, 2500))
      continue
    }
    // Stream ended (live-only): tell clients to re-snapshot, then reconnect.
    broadcast({ type: 'bridge.reconnected', properties: {} })
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
}

export function stopEvents(): void {
  eventsStopped = true
}
