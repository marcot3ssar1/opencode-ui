// Extract integration + credential endpoints from the OpenAPI spec.
const fs = require('fs')
const specPath = process.env.USERPROFILE + '/AppData/Local/Temp/opencode/openapi.json'
const j = JSON.parse(fs.readFileSync(specPath, 'utf8'))
const paths = Object.keys(j.paths).filter((p) => /integr|credential|auth/i.test(p))
for (const p of paths) {
  const item = j.paths[p]
  for (const [method, op] of Object.entries(item)) {
    if (typeof op !== 'object' || op === null) continue
    console.log(method.toUpperCase(), p, '|', op.operationId ?? '')
    if (op.requestBody?.content?.['application/json']?.schema)
      console.log('   body:', JSON.stringify(op.requestBody.content['application/json'].schema).slice(0, 500))
  }
}
const schemas = j.components?.schemas ?? {}
for (const name of Object.keys(schemas).filter((k) => /cred|integr/i.test(k))) {
  console.log('schema', name, '=>', JSON.stringify(schemas[name]).slice(0, 400))
}
