import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

test('Director bridge runs with Node TypeScript support disabled', () => {
  const script = `
    import { createDirectorServer } from './server/director.mjs';
    import { validatePlan, EXAMPLE_PLAN } from './src/director-plan.mjs';
    validatePlan(EXAMPLE_PLAN);
    const token = 'runtime-test-token-00000000000000000000';
    const server = createDirectorServer({ token, origins: [],
      fetchImpl: async () => Response.json({ models: [{ name: 'qwen3:4b-instruct' }] }) });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch('http://127.0.0.1:' + server.address().port + '/health',
        {headers:{Authorization: 'Bearer ' + token}});
      if (!response.ok || !(await response.json()).ok) throw Error('health check failed');
      console.log('Plain JavaScript bridge healthy');
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  `
  const result = spawnSync(process.execPath, ['--no-experimental-strip-types', '--input-type=module', '-e', script], {
    cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 15000,
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Plain JavaScript bridge healthy/)
})
