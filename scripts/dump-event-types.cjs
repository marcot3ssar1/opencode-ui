// Dump event type names from the downloaded OpenAPI spec.
const fs = require('fs')
const path = require('path')
const specPath = path.join(process.env.USERPROFILE, 'AppData', 'Local', 'Temp', 'opencode', 'openapi.json')
const j = JSON.parse(fs.readFileSync(specPath, 'utf8'))
const schemas = j.components?.schemas ?? {}
const eventNames = Object.keys(schemas).filter((k) => /event/i.test(k))
console.log('event-ish schemas:', eventNames.slice(0, 50).join(', '))
const set = new Set()
const scan = (v) => {
  if (typeof v === 'string') {
    const m = v.match(/^[a-z]+(?:\.[a-z.-]+)*$/)
    if (m && (v.startsWith('message.') || v.startsWith('session.') || v.startsWith('permission.') || v.startsWith('server.') || v.startsWith('agent.') || v.startsWith('model.') || v.startsWith('mcp.') || v.startsWith('lsp.') || v.startsWith('file.')))
      set.add(v)
  } else if (Array.isArray(v)) v.forEach(scan)
  else if (v && typeof v === 'object') Object.values(v).forEach(scan)
}
for (const name of eventNames) scan(schemas[name])
console.log('event types found:', [...set].join(', '))
