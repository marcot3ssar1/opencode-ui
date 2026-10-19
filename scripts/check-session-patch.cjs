// Verify session rename (PATCH) + delete (DELETE) contract against the live service.
const fs = require('fs')
const info = JSON.parse(fs.readFileSync(process.env.USERPROFILE + '/.local/state/opencode/service.json', 'utf8'))
const headers = { authorization: 'Basic ' + Buffer.from('opencode:' + info.password).toString('base64'), 'content-type': 'application/json' }
const dir = 'C:\\Users\\Admin'
const q = 'location[directory]=' + encodeURIComponent(dir)

async function main() {
  const res = await fetch(info.url + '/api/session?' + q, { method: 'POST', headers, body: JSON.stringify({ location: { directory: dir } }) })
  const created = (await res.json()).data ?? {}
  console.log('creata:', created.id)

  const patchRes = await fetch(info.url + `/api/session/${created.id}?` + q, { method: 'PATCH', headers, body: JSON.stringify({ title: 'patch-test-✓' }) })
  const patchBody = await patchRes.json().catch(() => null)
  console.log('PATCH', patchRes.status, JSON.stringify(patchBody).slice(0, 160))

  const getRes = await fetch(info.url + `/api/session/${created.id}?` + q, { headers })
  console.log('titolo dopo PATCH:', JSON.stringify((await getRes.json()).data).slice(0, 200))

  const delRes = await fetch(info.url + `/api/session/${created.id}?` + q, { method: 'DELETE', headers })
  console.log('DELETE', delRes.status)
}
main().catch((e) => console.log('ERR', String(e)))
