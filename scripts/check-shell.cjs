// Probe: POST /api/shell then read output+status (what the Terminal card does).
const fs = require('fs')
const info = JSON.parse(fs.readFileSync(process.env.USERPROFILE + '/.local/state/opencode/service.json', 'utf8'))
const headers = { authorization: 'Basic ' + Buffer.from('opencode:' + info.password).toString('base64'), 'content-type': 'application/json' }
const dir = 'process.cwd()'
const q = 'location[directory]=' + encodeURIComponent(dir)

async function main() {
  const start = await fetch(info.url + '/api/shell?' + q, {
    method: 'POST', headers,
    body: JSON.stringify({ command: 'node -v', timeout: 30000 }),
  })
  const sj = await start.json()
  const id = sj.id ?? sj.data?.id
  console.log('POST /api/shell ->', start.status, 'shell id:', id)

  for (let i = 0; i < 20; i++) {
    const out = await fetch(info.url + '/api/shell/' + id + '/output?' + q, { headers })
    const oj = await out.json()
    const lines = (oj.data ?? []).filter((l) => l.line !== undefined).map((l) => l.line)
    const meta = await fetch(info.url + '/api/shell/' + id + '?' + q, { headers })
    const mj = await meta.json()
    const sh = mj.data ?? mj
    if (lines.length) console.log('out:', JSON.stringify(lines))
    if (sh.status !== 'running') {
      console.log('status:', sh.status, 'exit:', sh.exit)
      break
    }
    await new Promise((r) => setTimeout(r, 250))
  }
}
main().catch((e) => console.log('ERR', String(e)))
