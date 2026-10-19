// Check message ordering returned by GET /api/session/{id}/message
const fs = require('fs')
const info = JSON.parse(fs.readFileSync(process.env.USERPROFILE + '/.local/state/opencode/service.json', 'utf8'))
const headers = { authorization: 'Basic ' + Buffer.from('opencode:' + info.password).toString('base64') }
const dir = process.argv[2] ?? 'C:\\Users\\Admin'
const q = 'location[directory]=' + encodeURIComponent(dir)

fetch(info.url + '/api/session?' + q, { headers })
  .then((r) => r.json())
  .then(async (list) => {
    const sessions = list.data ?? list
    console.log('sessioni:', Array.isArray(sessions) ? sessions.length : typeof sessions)
    const sid = (sessions[0] ?? {}).id
    if (!sid) { console.log('nessuna sessione'); return }
    console.log('prima sessione:', sid)
    const res = await fetch(info.url + `/api/session/${sid}/message?limit=6&${q}`, { headers })
    const body = await res.json()
    const msgs = body.data ?? []
    for (const m of msgs) {
      console.log(
        (m.time?.created ?? 'null').toString().padEnd(14),
        '|', String(m.type).padEnd(9), '|', m.id, '|',
        String(m.text ?? '').replace(/\s+/g, ' ').slice(0, 60),
      )
    }
  })
  .catch((e) => console.log('ERR', String(e).slice(0, 300)))
