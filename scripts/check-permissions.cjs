// End-to-end: force a real permission ask, verify /api/permission/request shows it, reply 'once'.
const fs = require('fs')
const info = JSON.parse(fs.readFileSync(process.env.USERPROFILE + '/.local/state/opencode/service.json', 'utf8'))
const headers = { authorization: 'Basic ' + Buffer.from('opencode:' + info.password).toString('base64'), 'content-type': 'application/json' }
const dir = 'process.cwd()'
const q = 'location[directory]=' + encodeURIComponent(dir)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const sr = await fetch(info.url + '/api/session?' + q, { method: 'POST', headers, body: JSON.stringify({ location: { directory: dir } }) })
  const sj = await sr.json()
  const sid = (sj.data ?? sj).id
  console.log('sessione creata:', sid, sr.status)

  const mr = await fetch(info.url + '/api/session/' + sid + '/prompt?' + q, {
    method: 'POST', headers,
    body: JSON.stringify({
      text: 'Leggi il file .env.example presente nella directory del progetto con lo strumento read. È solo un test permessi: non fare nient\'altro e rispondi brevemente.',
    }),
  })
  console.log('POST prompt ->', mr.status)

  let found = null
  for (let i = 0; i < 60 && !found; i++) {
    await sleep(2000)
    const pr = await fetch(info.url + '/api/permission/request?' + q, { headers })
    const pj = await pr.json()
    const list = pj.data ?? []
    const mine = list.filter((x) => x.sessionID === sid)
    if (mine.length > 0) {
      found = mine[0]
      console.log('PERMESSO APPARSO dopo ~' + i * 2 + 's:', JSON.stringify(found).slice(0, 400))
    }
  }
  if (!found) {
    console.log('nessun permesso rilevato entro 120s (controllo eventi… done)')
    return
  }

  const rr = await fetch(info.url + `/api/session/${found.sessionID}/permission/${found.id}/reply`, {
    method: 'POST', headers,
    body: JSON.stringify({ decision: 'once' }),
  })
  console.log('REPLY once ->', rr.status, await rr.text())

  for (let i = 0; i < 6; i++) {
    await sleep(1500)
    const pr = await fetch(info.url + '/api/permission/request?' + q, { headers })
    const left = ((await pr.json()).data ?? []).filter((x) => x.sessionID === sid)
    console.log('pendente dopo reply:', left.length)
    if (left.length === 0) break
  }
  console.log('DELETE sessione di test…', await fetch(info.url + '/api/session/' + sid, { method: 'DELETE', headers })).status
}
main().catch((e) => console.log('ERR', String(e)))
