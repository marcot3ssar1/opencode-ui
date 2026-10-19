// Probe v2: project id via /api/location, then /api/worktree contract.
const fs = require('fs')
const info = JSON.parse(fs.readFileSync(process.env.USERPROFILE + '/.local/state/opencode/service.json', 'utf8'))
const headers = { authorization: 'Basic ' + Buffer.from('opencode:' + info.password).toString('base64'), 'content-type': 'application/json' }
const dir = process.argv[2] || 'process.cwd()'
const q = 'location[directory]=' + encodeURIComponent(dir)

async function j(res) {
  const txt = await res.text()
  let body
  try { body = JSON.parse(txt) } catch { body = txt }
  return { status: res.status, body }
}

async function main() {
  const locRes = await fetch(info.url + '/api/location?' + q, { headers })
  const loc = await j(locRes)
  console.log('GET /api/location ->', loc.status)
  console.log(JSON.stringify(loc.body).slice(0, 500))
  const root = loc.body?.data ?? loc.body ?? {}
  const projectID = root.project?.id ?? root.location?.project?.id
  console.log('projectID estratto:', projectID ?? '(null)')

  const wtNoQ = await j(await fetch(info.url + '/api/worktree', { headers }))
  console.log('\nGET /api/worktree (senza query)', wtNoQ.status, JSON.stringify(wtNoQ.body).slice(0, 250))

  if (projectID) {
    const wtList = await j(await fetch(info.url + '/api/worktree?projectID=' + encodeURIComponent(projectID), { headers }))
    console.log('\nGET /api/worktree?projectID', wtList.status, JSON.stringify(wtList.body).slice(0, 400))

    const cr = await j(await fetch(info.url + '/api/worktree', {
      method: 'POST', headers,
      body: JSON.stringify({ projectID, name: 'sonda-wt-non-esiste' }),
    }))
    console.log('\nPOST /api/worktree (dir NON git)', cr.status, JSON.stringify(cr.body).slice(0, 400))

    const rf = await j(await fetch(info.url + '/api/worktree/refresh', {
      method: 'POST', headers,
      body: JSON.stringify({ projectID }),
    }))
    console.log('\nPOST /api/worktree/refresh', rf.status, JSON.stringify(rf.body).slice(0, 300))

    const dl = await j(await fetch(info.url + '/api/worktree', {
      method: 'DELETE', headers,
      body: JSON.stringify({ projectID, directory: 'C:\\percorso\\inesistente\\wt', force: false }),
    }))
    console.log('\nDELETE /api/worktree (inesistente)', dl.status, JSON.stringify(dl.body).slice(0, 300))
  }
}
main().catch((e) => console.log('ERR', String(e)))
