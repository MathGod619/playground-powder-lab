import { mkdirSync, writeFileSync, readFileSync, lstatSync, chmodSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Creates only this user's Director service/config. Does not alter Ollama, Tailscale or other units.
const taskHome = homedir()
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const configDir = path.join(taskHome, '.config', 'powder-rave-director')
const unitDir = path.join(taskHome, '.config', 'systemd', 'user')
const envPath = path.join(configDir, 'bridge.env')
mkdirSync(configDir, { recursive: true, mode: 0o700 })
mkdirSync(unitDir, { recursive: true })
const stat = lstatSync(envPath, { throwIfNoEntry: false })
if (stat?.isSymbolicLink() || stat && !stat.isFile()) throw Error('bridge.env must be a regular private file.')
if (!stat) {
  const candidate = process.env.DIRECTOR_TOKEN
  const token = candidate && /^[a-zA-Z0-9_-]{32,256}$/.test(candidate) ? candidate : randomBytes(32).toString('hex')
  const model = process.env.OLLAMA_MODEL || 'qwen3:4b-instruct'
  if (!/^[a-zA-Z0-9_:.\/-]{1,120}$/.test(model)) throw Error('Invalid model name.')
  writeFileSync(envPath, 'DIRECTOR_TOKEN=' + token + '\nOLLAMA_MODEL=' + model + '\nPORT=4190\n', { flag: 'wx', mode: 0o600 })
} else {
  if (!/^DIRECTOR_TOKEN=[a-zA-Z0-9_-]{32,256}$/m.test(readFileSync(envPath, 'utf8'))) throw Error('Existing bridge.env has no valid token. It was left unchanged.')
}
chmodSync(configDir, 0o700)
chmodSync(envPath, 0o600)
const quote = s => '"' + s.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%') + '"'
const unit = `[Unit]
Description=Powder Rave Ollama Scene Director
After=network.target

[Service]
Type=simple
WorkingDirectory=${quote(root)}
EnvironmentFile=${quote(envPath)}
ExecStart=${quote(process.execPath)} ${quote(path.join(root, 'server', 'director.mjs'))}
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true

[Install]
WantedBy=default.target
`
const unitPath = path.join(unitDir, 'powder-rave-director.service')
if (lstatSync(unitPath, { throwIfNoEntry: false })?.isSymbolicLink()) throw Error('Refusing to replace a symlinked service.')
writeFileSync(unitPath, unit, { mode: 0o600 })
console.log('Prepared powder-rave-director.service and private bridge.env. Existing token preserved.')
console.log('Next: systemctl --user daemon-reload')
console.log('Then: systemctl --user enable --now powder-rave-director')
console.log('For boot without login: sudo loginctl enable-linger ' + path.basename(taskHome))
console.log('Token file (keep private): ' + envPath)
