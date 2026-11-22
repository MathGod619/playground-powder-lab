import { lstatSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Creates only this user's relay service. It holds no secrets and does not touch Tailscale or other units.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const unitDir = path.join(homedir(), '.config', 'systemd', 'user')
const unitPath = path.join(unitDir, 'powder-rave-relay.service')
const port = Number(process.env.RAVE_RELAY_PORT || 4191)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('RAVE_RELAY_PORT must be 1024–65535.')
for (const value of [root, process.execPath]) {
  if (!value.startsWith('/') || /[\x00-\x1f\x7f]/.test(value)) throw Error('Service paths must be absolute and contain no control characters.')
}
const quote = s => '"' + s.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%').replaceAll('$', '$$') + '"'

mkdirSync(unitDir, { recursive: true })
if (lstatSync(unitPath, { throwIfNoEntry: false })?.isSymbolicLink()) throw Error('Refusing to replace a symlinked service.')
writeFileSync(unitPath, `[Unit]
Description=Powder Rave online relay
After=network.target

[Service]
Type=simple
WorkingDirectory=${root.replaceAll('%', '%%')}
Environment=RAVE_RELAY_PORT=${port}
ExecStart=${quote(process.execPath)} ${quote(path.join(root, 'server', 'rave-relay.mjs'))}
Restart=on-failure
RestartSec=3
UMask=0077
NoNewPrivileges=true
MemoryMax=256M

[Install]
WantedBy=default.target
`, { mode: 0o600 })
console.log(`Prepared powder-rave-relay.service (127.0.0.1:${port}).`)
console.log('Next: systemctl --user daemon-reload && systemctl --user enable --now powder-rave-relay')
