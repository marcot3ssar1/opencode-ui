// Listen to the OpenCode SSE event stream for N ms and print event type + payload shape.
const fs = require('fs')
const info = JSON.parse(fs.readFileSync(process.env.USERPROFILE + '/.local/state/opencode/service.json', 'utf8'))
const headers = { authorization: 'Basic ' + Buffer.from('opencode:' + info.password).toString('base64') }
const MS = Number(process.argv[2] ?? 8000)
const ac = new AbortController()
setTimeout(() => ac.abort(), MS)
fetch(info.url + '/api/event', { headers: { ...headers, accept: 'text/event-stream' }, signal: ac.signal })
  .then(async (res) => {
    console.log('STATUS', res.status)
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    const push = (l) => {
      if (!l.startsWith('data:')) return
      try {
        const e = JSON.parse(l.slice(5).trim())
        console.log('TYPE:', e.type, '| keys:', Object.keys(e).join(','), '| data keys:', Object.keys(e.data ?? {}).join(','))
        console.log('  ', JSON.stringify(e.data).slice(0, 260))
      } catch {}
    }
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop()
      lines.forEach(push)
    }
  })
  .catch((e) => {
    if (e.name === 'AbortError') {
      console.log('--- timeout chiaro (fine ascolto)')
      process.exit(0)
    }
    console.log('ERR', String(e).slice(0, 200))
  })
