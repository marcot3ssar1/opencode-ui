// Live-test MCP connect / disconnect / remove error semantics.
const fs = require('fs')
const info = JSON.parse(fs.readFileSync(process.env.USERPROFILE + '/.local/state/opencode/service.json', 'utf8'))
const headers = { authorization: 'Basic ' + Buffer.from('opencode:' + info.password).toString('base64'), 'content-type': 'application/json' }
const dir = 'C:\\Users\\Admin'
const q = 'location[directory]=' + encodeURIComponent(dir)
const base = info.url

async function req(method, path, body) {
  const opt = { method, headers }
  if (body !== undefined) opt.body = JSON.stringify(body)
  const res = await fetch(base + path + '?' + q, opt)
  const text = await res.text()
  return `${method} ${path.replace(q, '')} -> ${res.status} ${text.slice(0, 220)}`
}

async function main() {
  await req('PUT', '/api/experimental/mcp/uitest-act', { config: { type: 'local', command: ['no-such-mcp-cmd'] } })
  console.log(await req('GET', '/api/mcp'))
  console.log(await req('POST', '/api/experimental/mcp/uitest-act/connect'))
  await new Promise((r) => setTimeout(r, 1500))
  console.log(await req('POST', '/api/experimental/mcp/uitest-act/disconnect'))
  await new Promise((r) => setTimeout(r, 1500))
  // double connect (already running?) probe again
  console.log(await req('POST', '/api/experimental/mcp/uitest-act/connect'))
  await new Promise((r) => setTimeout(r, 2500))
  console.log(await req('POST', '/api/experimental/mcp/uitest-act/disconnect'))
  console.log(await req('DELETE', '/api/experimental/mcp/uitest-act'))
  console.log(await req('DELETE', '/api/experimental/mcp/uitest-act'))
  console.log(await req('GET', '/api/mcp'))
}
main().catch((e) => console.log('ERR', String(e)))
