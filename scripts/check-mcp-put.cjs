// Live-test MCP add (PUT experimental), list status, then remove.
const fs = require('fs')
const info = JSON.parse(fs.readFileSync(process.env.USERPROFILE + '/.local/state/opencode/service.json', 'utf8'))
const headers = { authorization: 'Basic ' + Buffer.from('opencode:' + info.password).toString('base64'), 'content-type': 'application/json' }
const dir = 'C:\\Users\\Admin'
const q = 'location[directory]=' + encodeURIComponent(dir)

async function main() {
  // 1) add a local MCP server with a command that does not exist → expect failed status
  const put = await fetch(info.url + '/api/experimental/mcp/uitest-srv?' + q, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ config: { type: 'local', command: ['not-a-real-mcp-uitest', '--x'] } }),
  })
  console.log('PUT', put.status, (await put.text()).slice(0, 400))

  // 2) list servers
  const list = await fetch(info.url + '/api/mcp?' + q, { headers })
  const body = await list.json()
  console.log('LIST', list.status, JSON.stringify(body.data).slice(0, 400))

  // 3) remove it
  const del = await fetch(info.url + '/api/experimental/mcp/uitest-srv?' + q, { method: 'DELETE', headers })
  console.log('DELETE', del.status, (await del.text()).slice(0, 200))
}
main().catch((e) => console.log('ERR', String(e)))
