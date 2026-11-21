import { randomBytes } from 'node:crypto'
import { createDirectorServer } from './director.mjs'

// Runs an actual end-to-end model probe locally on Ubuntu without printing or
// reading the permanent bridge token. It leaves the running service untouched.
const token = randomBytes(32).toString('hex')
const model = process.env.OLLAMA_MODEL || 'qwen3:4b-instruct'
const server = createDirectorServer({ token, model, origins: [], ollamaUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434' })
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
try {
  console.log('Checking actual scene generation with ' + model + ' (up to 75 seconds)…')
  const response = await fetch('http://127.0.0.1:' + server.address().port + '/plan', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'create', recipe: 'aquarium', prompt: 'Add a taller green branching plant to the left side of this detailed aquarium. Keep the tank and existing plants intact.',
      context: { scene: 'blank', width: 400, height: 240, gravity: 1, hue: 180, imageBounds: null } }),
    signal: AbortSignal.timeout(85000),
  })
  const data = await response.json()
  if (!response.ok) { console.error('MODEL CHECK FAILED: ' + data.error); process.exitCode = 1 }
  else {
    console.log('MODEL CHECK PASSED: ' + data.plan.title)
    console.log('Valid operations: ' + data.plan.operations.length)
    console.log('Objects (shape, material, x/y/w/h): ' + data.plan.operations.map(o => [o.shape, o.material, o.x, o.y, o.w, o.h].join(' ')).join(' | '))
  }
} finally {
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
