// Probe: shape of /api/experimental/session/stats with and without location query
const fs = require('fs')
const info = JSON.parse(fs.readFileSync(process.env.USERPROFILE + '/.local/state/opencode/service.json', 'utf8'))
const headers = { authorization: 'Basic ' + Buffer.from('opencode:' + info.password).toString('base64') }
const dir = process.argv[2] || 'process.cwd()'

async function main() {
  const base = info.url + '/api/experimental/session/stats'
  for (const [label, url] of [
    ['SENZA location', base],
    ['CON location', base + '?location[directory]=' + encodeURIComponent(dir)],
  ]) {
    try {
      const res = await fetch(url, { headers })
      const body = await res.json()
      console.log('---', label, '->', res.status)
      console.log(JSON.stringify(body).slice(0, 900))
      if (body && typeof body === 'object') {
        const d = body.data ?? body
        const keys = Object.keys(d)
        console.log('keys al primo livello:', keys.join(', ').slice(0, 300))
      }
    } catch (e) {
      console.log('---', label, 'ERRORE:', String(e))
    }
  }
}
main().catch((e) => console.log('ERR', String(e)))
