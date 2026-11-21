import { useEffect, useRef, useState } from 'react'
import { EXAMPLE_PLAN, validatePlan, type ScenePlan } from './director-plan.ts'
import { prepareScene } from './director-world.ts'
import { createRenderer } from './render.ts'
import type { World } from './world.ts'

type Props = { getWorld: () => World; context: () => object; apply: (world: World, plan: ScenePlan) => void; undo: () => void; canUndo: boolean; close: () => void }
const TEMPLATE_KEY = 'powder-rave-director-templates-v1'
function readTemplates(): ScenePlan[] {
  try { return JSON.parse(localStorage.getItem(TEMPLATE_KEY) || '[]').slice(0, 12).map(validatePlan) } catch { return [] }
}
export function Director({ getWorld, context, apply, undo, canUndo, close }: Props) {
  const [endpoint, setEndpoint] = useState(() => localStorage.getItem('powder-rave-director-url') || '')
  const [token, setToken] = useState('')
  const [mode, setMode] = useState<'adjust' | 'create'>('adjust')
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState('Connect your private Ollama bridge, or preview the example.')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ plan: ScenePlan; world: World } | null>(null)
  const [templates, setTemplates] = useState(readTemplates)
  const canvas = useRef<HTMLCanvasElement>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => {
    if (!pending || !canvas.current) return
    const glow = document.createElement('canvas'), bloom = document.createElement('canvas')
    createRenderer(pending.world, canvas.current, glow, bloom)()
  }, [pending])
  function preview(plan: ScenePlan) {
    const valid = validatePlan(plan)
    setPending({ plan: valid, world: prepareScene(getWorld(), valid) })
    setStatus('Preview ready. Apply when you like the result.')
  }
  function baseUrl() {
    const u = new URL(endpoint.trim())
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))) throw new Error('Use an HTTPS bridge URL, or localhost for a development tunnel.')
    if (u.username || u.password || u.search || u.hash) throw new Error('Enter the bridge URL without credentials, query or fragment.')
    if (token.length < 32) throw new Error('Enter your bridge token (at least 32 characters).')
    return u.href.replace(/\/$/, '')
  }
  async function request(check = false) {
    setBusy(true); setPending(null)
    const controller = new AbortController(); abort.current = controller
    const timeout = setTimeout(() => controller.abort(), 85000)
    try {
      const url = baseUrl()
      if (!check && !prompt.trim()) throw new Error('Describe the world you want first.')
      localStorage.setItem('powder-rave-director-url', url)
      setStatus(check ? 'Checking your server and Ollama model…' : 'Your server is designing the scene…')
      const response = await fetch(url + (check ? '/health' : '/plan'), { method: check ? 'GET' : 'POST', signal: controller.signal,
        headers: { Authorization: 'Bearer ' + token, ...(!check ? { 'Content-Type': 'application/json' } : {}) },
        ...(!check ? { body: JSON.stringify({ prompt, mode, context: context() }) } : {}) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Bridge request failed.')
      if (check) setStatus('Connected · ' + data.model)
      else {
        const plan = validatePlan(data.plan)
        if (mode === 'adjust' && plan.scene !== null) throw new Error('Adjust mode cannot replace the current world.')
        if (mode === 'create' && plan.scene === null) throw new Error('Create mode needs a base scene.')
        preview(plan)
      }
    } catch (error) {
      setStatus(controller.signal.aborted ? 'Request cancelled or timed out.' : error instanceof TypeError ? 'Cannot reach the bridge. Check the URL, HTTPS access and server connection.' : error instanceof Error ? error.message : 'Request failed.')
    } finally { clearTimeout(timeout); setBusy(false); abort.current = null }
  }
  function saveTemplate() {
    if (!pending) return
    try {
      const next = [pending.plan, ...templates].slice(0, 12)
      localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next)); setTemplates(next); setStatus('Template saved in this browser.')
    } catch { setStatus('Browser storage is full or unavailable.') }
  }
  return <aside className="director-panel" aria-label="AI Scene Director">
    <div className="director-heading"><strong>Scene Director</strong><button onClick={close} aria-label="Close Director">✕</button></div>
    <p>Describe a change or design a whole world. Your photo stays in this browser; only its position is shared with your server.</p>
    <details><summary>Server connection</summary>
      <label>Bridge URL<input type="url" placeholder="https://your-private-server:8443" value={endpoint} onChange={e => setEndpoint(e.target.value)} disabled={busy} /></label>
      <label>Bridge token<input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} disabled={busy} /></label>
      <small>The token stays in memory and clears when this panel closes.</small>
      <button className="chip" disabled={busy} onClick={() => void request(true)}>Test connection</button>
    </details>
    <div className="seg"><button className={mode === 'adjust' ? 'on' : ''} disabled={busy} onClick={() => { setMode('adjust'); setPending(null) }}>Adjust world</button><button className={mode === 'create' ? 'on' : ''} disabled={busy} onClick={() => { setMode('create'); setPending(null) }}>Create scene</button></div>
    <label>Tell the Director<textarea maxLength={1600} rows={3} value={prompt} disabled={busy} onChange={e => { setPrompt(e.target.value); setPending(null) }} placeholder="Build two towers and a bridge around my photo. Make gravity lighter." /></label>
    <div className="director-actions"><button className="chip on" disabled={busy} onClick={() => void request()}>Generate preview</button>{busy && <button className="chip" onClick={() => abort.current?.abort()}>Cancel</button>}<button className="chip" disabled={busy} onClick={() => preview(EXAMPLE_PLAN)}>Example</button></div>
    <p role="status">{status}</p>
    {pending && <section aria-label="Scene preview">
      <strong>{pending.plan.title}</strong><p>{pending.plan.description}</p>
      <canvas ref={canvas} className="director-preview" aria-label="Ghost preview of proposed world" />
      <small>{pending.plan.scene ? 'Replaces the world' : 'Edits the current world'} · {pending.plan.operations.length} structures · gravity {pending.world.rules.gravity.toFixed(2)}</small>
      <div className="director-actions"><button className="chip on" onClick={() => { apply(pending.world, pending.plan); setPending(null); setStatus('Applied. Use Undo to restore the previous world and mix.') }}>Apply</button><button className="chip" onClick={() => setPending(null)}>Discard</button><button className="chip" onClick={saveTemplate}>Save as template</button></div>
    </section>}
    <button className="chip" disabled={!canUndo || busy} onClick={() => { undo(); setPending(null); setStatus('Previous world and mix restored.') }}>Undo last Director change</button>
    {templates.length > 0 && <details><summary>Saved templates ({templates.length})</summary>{templates.map((p, i) => <button className="director-template" key={i} disabled={busy} onClick={() => preview(p)}>{p.title}</button>)}</details>}
  </aside>
}
