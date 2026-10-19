// Probe: does /api/fs/list return metadata (size, modified, ext) per entry?
const fs = require('fs')
const info = JSON.parse(fs.readFileSync(process.env.USERPROFILE + '/.local/state/opencode/service.json', 'utf8'))
const headers = { authorization: 'Basic ' + Buffer.from('opencode:' + info.password).toString('base64') }
const dir = process.argv[2] || 'process.cwd()'
const q = 'location[directory]=' + encodeURIComponent(dir) + '&path=' + encodeURIComponent('.')

async function main() {
  const res = await fetch(info.url + '/api/fs/list?' + q, { headers })
  const body = await res.json()
  const data = body.data ?? body
  console.log('status:', res.status, 'entry count:', Array.isArray(data) ? data.length : 'n/a')
  if (Array.isArray(data)) {
    for (const e of data.slice(0, 14)) console.log(JSON.stringify(e))
    if (Array.isArray(data) && data.length > 14) console.log('... (+' + (data.length - 14) + ' more)')
  } else {
    console.log(JSON.stringify(body).slice(0, 1200))
  }
  // also try /api/fs/find for field shape
  const res2 = await fetch(info.url + '/api/fs/find?location[directory]=' + encodeURIComponent(dir) + '&query=jsonc&limit=5', { headers })
  console.log('find status:', res2.status)
  console.log('find sample:', JSON.stringify(await res2.json()).slice(0, 600))
}
main().catch((e) => console.log('ERR', String(e)))
