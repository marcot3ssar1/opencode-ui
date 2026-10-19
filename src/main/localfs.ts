import { app } from 'electron'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import json5 from 'json5'
import type { ApiOptions } from './connection'

/** Root of the user-level OpenCode configuration (~/.config/opencode). */
export function globalRoot(): string {
  return path.join(os.homedir(), '.config', 'opencode')
}

/** Directory currently targeted by the UI (location). */
let currentDirectory: string = app.getPath('home')

export function getDirectory(): string {
  return currentDirectory
}

export function setDirectory(dir: string): string {
  currentDirectory = dir
  return currentDirectory
}

export function pickInitialDirectory(): string {
  const argv = process.argv.slice(1)
  const candidate = argv.find((a) => a && !a.startsWith('-') && !a.endsWith('.js') && !a.endsWith('.exe') && a.includes(':'))
  if (candidate) {
    try {
      if (require('node:fs').statSync(candidate).isDirectory()) return candidate
    } catch {
      /* ignore */
    }
  }
  return app.getPath('home')
}

currentDirectory = pickInitialDirectory()

function safeJoin(root: string, rel: string): string | null {
  const abs = path.resolve(root, rel)
  const normRoot = path.resolve(root)
  if (!abs.startsWith(normRoot + path.sep) && abs !== normRoot) return null
  return abs
}

export interface GlobalFileUsage {
  opencodeText: string | null
  opencodePath: string
  cliText: string | null
  cliPath: string
  defaultAgent: string | null
}

/** Read the two user-level config files and the current default agent. */
export async function readGlobalConfig(): Promise<GlobalFileUsage> {
  const root = globalRoot()
  const opencodePath = path.join(root, 'opencode.jsonc')
  const cliPath = path.join(root, 'cli.json')
  const readText = async (p: string): Promise<string | null> => {
    try {
      return await fs.readFile(p, 'utf8')
    } catch {
      return null
    }
  }
  const opencodeText = await readText(opencodePath)
  const cliText = await readText(cliPath)
  let defaultAgent: string | null = null
  if (opencodeText) {
    try {
      const parsed = json5.parse(opencodeText)
      if (typeof parsed?.default_agent === 'string') defaultAgent = parsed.default_agent
    } catch {
      defaultAgent = null
    }
  }
  return { opencodeText, opencodePath, cliText, cliPath, defaultAgent }
}

/** Validate JSON(C) content. Returns null when valid, otherwise an error message. */
export function validateJson(content: string, allowComments: boolean): string | null {
  try {
    json5.parse(content)
    return null
  } catch (err) {
    if (allowComments) return `JSONC non valido: ${String(err)}`
    // cli.json must be strict JSON: fall back to a strict check.
    try {
      JSON.parse(content)
      return null
    } catch {
      return `JSON non valido: ${String(err)}`
    }
  }
}

export async function writeGlobalConfig(which: 'opencode' | 'cli', content: string): Promise<string | null> {
  const root = globalRoot()
  const target =
    which === 'opencode' ? path.join(root, 'opencode.jsonc') : path.join(root, 'cli.json')
  const err = validateJson(content, which === 'opencode')
  if (err) return err
  await fs.mkdir(root, { recursive: true })
  await fs.writeFile(target, content, 'utf8')
  return null
}

/** Replace `default_agent` in the global opencode.jsonc while preserving the file text as much as possible. */
export async function setDefaultAgent(id: string): Promise<string | null> {
  const example = await readGlobalConfig()
  try {
    const parsed = json5.parse(example.opencodeText ?? '{}')
    parsed.default_agent = id
    const keys = Object.keys(parsed)
    const ordered: Record<string, unknown> = {}
    for (const k of keys) ordered[k] = parsed[k]
    await fs.mkdir(path.dirname(example.opencodePath), { recursive: true })
    // Keep JSONC-compatible output (re-dumped as JSON; comments are not preserved).
    await fs.writeFile(example.opencodePath, JSON.stringify(ordered, null, 2) + '\n', 'utf8')
    return null
  } catch (err) {
    return `Impossibile aggiornare default_agent: ${String(err)}`
  }
}

export interface AgentFileEntry {
  id: string
  path: string
}

export async function listAgentFiles(scope: 'global' | 'project', directory?: string): Promise<AgentFileEntry[]> {
  const dir =
    scope === 'global'
      ? path.join(globalRoot(), 'agents')
      : path.resolve(directory ?? getDirectory(), '.opencode', 'agents')
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch {
    return []
  }
  const out: AgentFileEntry[] = []
  for (const name of names) {
    if (!name.endsWith('.md')) continue
    out.push({ id: name.replace(/\.md$/, ''), path: path.join(dir, name) })
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

export async function readAgentText(scope: 'global' | 'project', directory: string | undefined, id: string): Promise<string | null> {
  const dir =
    scope === 'global'
      ? path.join(globalRoot(), 'agents')
      : path.resolve(directory ?? getDirectory(), '.opencode', 'agents')
  const abs = dir.endsWith('.md') ? dir : path.join(dir, id.endsWith('.md') ? id : id + '.md')
  if (!abs.startsWith(path.resolve(scope === 'global' ? path.join(globalRoot(), 'agents') : path.resolve(directory ?? getDirectory(), '.opencode', 'agents')))) return null
  try {
    return await fs.readFile(abs, 'utf8')
  } catch {
    return null
  }
}

export async function writeAgentText(scope: 'global' | 'project', directory: string | undefined, id: string, content: string): Promise<string | null> {
  const agentsDir =
    scope === 'global'
      ? path.join(globalRoot(), 'agents')
      : path.resolve(directory ?? getDirectory(), '.opencode', 'agents')
  if (!/^[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(id)) return `ID agente non valido: ${id}`
  const abs = path.join(agentsDir, id + '.md')
  if (!abs.startsWith(path.resolve(agentsDir))) return 'Percorso non consentito'
  await fs.mkdir(agentsDir, { recursive: true })
  await fs.writeFile(abs, content, 'utf8')
  return null
}

export async function deleteAgentText(scope: 'global' | 'project', directory: string | undefined, id: string): Promise<string | null> {
  const agentsDir =
    scope === 'global'
      ? path.join(globalRoot(), 'agents')
      : path.resolve(directory ?? getDirectory(), '.opencode', 'agents')
  const abs = path.join(agentsDir, id + '.md')
  if (!abs.startsWith(path.resolve(agentsDir))) return 'Percorso non consentito'
  try {
    await fs.unlink(abs)
    return null
  } catch (err) {
    return String(err)
  }
}

/** Read/scaffold helper for project-level config candidates. */
export async function readProjectConfig(directory: string): Promise<{ path: string; text: string } | null> {
  for (const rel of ['opencode.json', 'opencode.jsonc', path.join('.opencode', 'opencode.json'), path.join('.opencode', 'opencode.jsonc')]) {
    const abs = path.resolve(directory, rel)
    try {
      const text = await fs.readFile(abs, 'utf8')
      return { path: abs, text }
    } catch {
      /* try next */
    }
  }
  return null
}

export async function writeProjectConfig(directory: string, rel: string, content: string): Promise<string | null> {
  const abs = path.resolve(directory, rel)
  if (!abs.startsWith(path.resolve(directory))) return 'Percorso non consentito'
  const err = validateJson(content, true)
  if (err) return err
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, content, 'utf8')
  return null
}

export function apiOptionsLocation(): Pick<ApiOptions, 'location'> {
  return { location: getDirectory() }
}
