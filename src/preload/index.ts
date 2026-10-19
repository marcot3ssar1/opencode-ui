import { contextBridge, ipcRenderer } from 'electron'

export interface OcApi {
  request(payload: {
    method: string
    path: string
    query?: Record<string, string | number | undefined>
    body?: unknown
    location?: string
    rawBody?: string
    contentType?: string
  }): Promise<{ ok: boolean; status: number; data?: unknown; text?: string; error?: string; contentType?: string }>
  serviceInfo(): Promise<{ ok: boolean; url?: string; serverInfo?: unknown; locationInfo?: unknown; error?: string }>
  reopenService(): Promise<{ ok: boolean; error?: string }>
  stopService(): Promise<{ ok: boolean; error?: string }>
  getDirectory(): Promise<{ ok: boolean; directory: string }>
  pickDirectory(): Promise<{ ok: boolean; directory?: string }>
  readGlobalConfig(): Promise<{
    opencodeText: string | null
    opencodePath: string
    cliText: string | null
    cliPath: string
    defaultAgent: string | null
    projectPath: string | null
    projectText: string | null
  }>
  saveGlobalConfig(which: 'opencode' | 'cli', content: string): Promise<{ ok: boolean; error?: string }>
  saveProjectConfig(rel: string, content: string): Promise<{ ok: boolean; error?: string }>
  setDefaultAgent(id: string): Promise<{ ok: boolean; error?: string }>
  listAgentFiles(scope: 'global' | 'project', directory?: string): Promise<{ ok: boolean; files: Array<{ id: string; path: string }> }>
  readAgentFile(scope: 'global' | 'project', directory: string | undefined, id: string): Promise<{ ok: boolean; text: string | null }>
  writeAgentFile(scope: 'global' | 'project', directory: string | undefined, id: string, content: string): Promise<{ ok: boolean; error?: string }>
  deleteAgentFile(scope: 'global' | 'project', directory: string | undefined, id: string): Promise<{ ok: boolean; error?: string }>
  appVersion(): Promise<string>
  openExternal(url: string): Promise<{ ok: boolean; error?: string }>
  onEvent(cb: (event: unknown) => void): () => void
}

const api: OcApi = {
  request: (payload) => ipcRenderer.invoke('bridge:request', payload),
  serviceInfo: () => ipcRenderer.invoke('bridge:service'),
  reopenService: () => ipcRenderer.invoke('bridge:reopen'),
  stopService: () => ipcRenderer.invoke('bridge:stop-service'),
  getDirectory: () => ipcRenderer.invoke('bridge:directory'),
  pickDirectory: () => ipcRenderer.invoke('bridge:pick-directory'),
  readGlobalConfig: () => ipcRenderer.invoke('config:read-global'),
  saveGlobalConfig: (which, content) => ipcRenderer.invoke('config:write-global', { which, content }),
  saveProjectConfig: (rel, content) => ipcRenderer.invoke('config:write-project', { rel, content }),
  setDefaultAgent: (id) => ipcRenderer.invoke('config:set-default-agent', { id }),
  listAgentFiles: (scope, directory) => ipcRenderer.invoke('agents:list', { scope, directory }),
  readAgentFile: (scope, directory, id) => ipcRenderer.invoke('agents:read', { scope, directory, id }),
  writeAgentFile: (scope, directory, id, content) => ipcRenderer.invoke('agents:write', { scope, directory, id, content }),
  deleteAgentFile: (scope, directory, id) => ipcRenderer.invoke('agents:delete', { scope, directory, id }),
  appVersion: () => ipcRenderer.invoke('app:version'),
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url) as Promise<{ ok: boolean; error?: string }>,
  onEvent: (cb) => {
    const listener = (_e: unknown, event: unknown) => cb(event)
    ipcRenderer.on('bridge:event', listener as never)
    return () => ipcRenderer.removeListener('bridge:event', listener as never)
  },
}

contextBridge.exposeInMainWorld('oc', api)
