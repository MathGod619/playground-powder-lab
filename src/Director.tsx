import { useEffect, useRef, useState } from 'react'
import { EXAMPLE_PLAN, validatePlan, type ScenePlan } from './director-plan.ts'
import { prepareScene } from './director-world.ts'
import { createRenderer } from './render.ts'
import type { World } from './world.ts'
import { loadConnection, saveConnection, forgetConnection } from './director-connection.mjs'
import { getRecipe, SCENE_RECIPES } from './director-recipes.mjs'

type Props = { getWorld: () => World; context: () => object; apply: (world: World, plan: ScenePlan) => void; undo: () => void; canUndo: boolean; close: () => void }
const TEMPLATE_KEY = 'powder-rave-director-templates-v1'
function readTemplates(): ScenePlan[] {
  try { return JSON.parse(localStorage.getItem(TEMPLATE_KEY) || '[]').slice(0, 12).map(validatePlan) } catch { return [] }
}
export function Director({ getWorld, context, apply, undo, canUndo, close }: Props) {
  const [saved] = useState(() => { try { return loadConnection(localStorage) } catch { return { url: '', token: '', remember: false } } })
  const [endpoint, setEndpoint] = useState(() => { try { return saved.url || localStorage.getItem('powder-rave-director-url') || '' } catch { return saved.url } })
  const [token, setToken] = useState(saved.token)
  const [remember, setRemember] = useState(saved.remember)
  const [mode, setMode] = useState<'adjust' | 'create'>('adjust')
  const [recipe, setRecipe] = useState('')
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
      if (!check && !prompt.trim() && !(mode === 'create' && recipe)) throw new Error('Describe the world you want first.')
      try { localStorage.setItem('powder-rave-director-url', url) } catch { /* connection can still work without storage */ }
      setStatus(check ? 'Checking your server and Ollama model…' : 'Your server is designing the scene…')
      const response = await fetch(url + (check ? '/health' : '/plan'), { method: check ? 'GET' : 'POST', signal: controller.signal,
        headers: { Authorization: 'Bearer ' + token, ...(!check ? { 'Content-Type': 'application/json' } : {}) },
        ...(!check ? { body: JSON.stringify({ prompt: prompt.trim() || 'Keep this detailed starter and its music reactions.', mode, context: context(), ...(mode === 'create' && recipe ? { recipe } : {}) }) } : {}) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Bridge request failed.')
      try { saveConnection(localStorage, url, token, remember) }
      catch { setStatus('Connected, but this browser could not remember the connection.'); return }
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
      <label className="director-remember"><input type="checkbox" checked={remember} disabled={busy} onChange={e => {
        setRemember(e.target.checked)
        if (!e.target.checked) { try { saveConnection(localStorage, '', '', false) } catch { /* unavailable storage */ } }
      }} />Remember on this device</label>
      <small>{remember ? 'After a successful connection, the token is saved in this browser. Use only on your own devices.' : 'The token clears when this panel closes. Enable Remember to keep it between visits.'}</small>
      <button className="chip" disabled={busy} onClick={() => void request(true)}>Test connection</button>
      <button className="chip" disabled={busy} onClick={() => {
        try { forgetConnection(localStorage) } catch { /* still clear memory */ }
        setToken(''); setEndpoint(''); setRemember(false); setStatus('Connection forgotten on this device.')
      }}>Forget connection</button>
    </details>
    <div className="seg"><button className={mode === 'adjust' ? 'on' : ''} disabled={busy} onClick={() => { setMode('adjust'); setPending(null) }}>Adjust world</button><button className={mode === 'create' ? 'on' : ''} disabled={busy} onClick={() => { setMode('create'); setPending(null) }}>Create scene</button></div>
    {mode === 'create' && <div className="director-starter">
      <label>Starting scene<select value={recipe} disabled={busy} onChange={e => { setRecipe(e.target.value); setPending(null) }}>
        <option value="">Custom · let the Director design it</option>
        {SCENE_RECIPES.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select></label>
      {recipe && <><small>Detailed scenery stays solid. Loose surfaces and water react to the music. Describe what you want to add or change.</small>
        <button className="chip" disabled={busy} onClick={() => preview(getRecipe(recipe))}>Preview starter · no server needed</button></>}
    </div>}
    <label>Tell the Director<textarea maxLength={1600} rows={3} value={prompt} disabled={busy} onChange={e => { setPrompt(e.target.value); setPending(null) }} placeholder="Build two towers and a bridge around my photo. Make gravity lighter." /></label>
    <div className="director-actions"><button className="chip on" disabled={busy} onClick={() => void request()}>Generate preview</button>{busy && <button className="chip" onClick={() => abort.current?.abort()}>Cancel</button>}<button className="chip" disabled={busy} onClick={() => preview(EXAMPLE_PLAN)}>Example</button></div>
    <p role="status">{status}</p>
    {pending && <section aria-label="Scene preview">
      <strong>{pending.plan.title}</strong><p>{pending.plan.description}</p>
      <canvas ref={canvas} className="director-preview" aria-label="Ghost preview of proposed world" />
      <small>{pending.plan.scene ? 'Replaces the world' : 'Edits the current world'} · {pending.plan.operations.length} objects · gravity {pending.world.rules.gravity.toFixed(2)}</small>
      <div className="director-actions"><button className="chip on" onClick={() => { apply(pending.world, pending.plan); setPending(null); setStatus('Applied. Use Undo to restore the previous world and mix.') }}>Apply</button><button className="chip" onClick={() => setPending(null)}>Discard</button><button className="chip" onClick={saveTemplate}>Save as template</button></div>
    </section>}
    <button className="chip" disabled={!canUndo || busy} onClick={() => { undo(); setPending(null); setStatus('Previous world and mix restored.') }}>Undo last Director change</button>
    {templates.length > 0 && <details><summary>Saved templates ({templates.length})</summary>{templates.map((p, i) => <button className="director-template" key={i} disabled={busy} onClick={() => preview(p)}>{p.title}</button>)}</details>}
  </aside>
}
