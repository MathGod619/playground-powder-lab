import path from 'node:path'

export function renderServiceUnit({ root, node, envPath }) {
  for (const value of [root, node, envPath]) {
    if (typeof value !== 'string' || !value.startsWith('/') || /[\x00-\x1f\x7f]/.test(value)) throw Error('Service paths must be absolute and contain no control characters.')
  }
  const quote = s => '"' + s.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%').replaceAll('$', '$$') + '"'
  // WorkingDirectory is a single path, not a shell word: surrounding quotes become
  // literal path characters and fail systemd's absolute-path check.
  return `[Unit]
Description=Powder Rave Ollama Scene Director
After=network.target

[Service]
Type=simple
WorkingDirectory=${root.replaceAll('%', '%%')}
EnvironmentFile=${envPath.replaceAll('%', '%%')}
ExecStart=${quote(node)} ${quote(path.join(root, 'server', 'director.mjs'))}
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true

[Install]
WantedBy=default.target
`
}
