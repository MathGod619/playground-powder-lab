import { useEffect, useRef, type ChangeEvent, type ReactNode } from 'react'
import { AudioLines, AudioWaveform, FileAudio, Mic, MonitorSpeaker, PanelTop, Play, StopCircle } from 'lucide-react'
import type { AudioInput, AudioMode, AudioState } from './audio.ts'
import { BAR_COUNT } from './signal.ts'

const demoLoop = new URL('./assets/demo-loop.wav', import.meta.url).href

const SOURCES = [
  { mode: 'system', label: 'System', name: 'System Audio', Icon: MonitorSpeaker },
  { mode: 'tab', label: 'Tab', name: 'Browser Tab', Icon: PanelTop },
  { mode: 'file', label: 'File', name: 'Audio file', Icon: FileAudio },
  { mode: 'simulator', label: 'BPM', name: 'BPM simulator', Icon: AudioLines },
] as const

export const SOURCE_LABEL: Record<AudioMode, string> = {
  simulator: 'Simulated signal',
  file: 'Local audio file',
  input: 'Optional mic or line input',
  system: 'Desktop audio sharing',
  tab: 'Browser tab sharing',
}

export function AudioSource({
  input, state, simulator,
}: {
  input: AudioInput
  state: AudioState
  simulator: ReactNode
}) {
  const filePicker = useRef<HTMLInputElement>(null)
  const player = useRef<HTMLAudioElement>(null)
  const meter = useRef<HTMLDivElement>(null)
  const hasFile = state.mode === 'file' && (state.status === 'ready' || state.status === 'live')
  const capturing = state.status === 'live' || state.status === 'pending'
  const browserCapture = state.mode === 'input' || state.mode === 'tab' || state.mode === 'system'

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file && player.current && input.snapshot().mode === 'file') input.openFile(file, player.current)
  }

  useEffect(() => {
    if (state.mode === 'simulator' || state.status !== 'live') return
    const elements = Array.from(meter.current?.children ?? []) as HTMLElement[]
    const render = () => {
      const signal = input.signal()
      const sample = signal?.bars
      for (let i = 0; i < elements.length; i++) {
        elements[i].style.transform = `scaleY(${0.055 + (sample?.[i] ?? 0) * 0.945})`
      }
    }
    render()
    const id = window.setInterval(render, 48)
    return () => {
      window.clearInterval(id)
      for (const element of elements) element.style.removeProperty('transform')
    }
  }, [input, state.mode, state.status])

  return (
    <>
      <div className="audio-sources" role="group" aria-label="Audio source">
        {SOURCES.map(({ mode, label, name, Icon }) => (
          <button key={mode} aria-pressed={state.mode === mode || (mode === 'system' && state.mode === 'input')} aria-label={name} title={name} onClick={() => input.select(mode)}>
            <Icon size={13} />{label}
          </button>
        ))}
      </div>

      <input ref={filePicker} className="audio-file-picker" hidden type="file"
        accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus" aria-label="Choose audio file" onChange={pick} />
      <div className="file-player-slot" hidden={!hasFile}>
        <audio ref={player} controls preload="metadata" aria-label="File playback"
          onPlaying={() => input.filePlaying()} onPause={() => input.filePaused()}
          onEnded={() => input.filePaused()} onError={event => { if (event.currentTarget.error) input.fileError() }} />
      </div>

      {state.mode === 'simulator' ? simulator : (
        <div className="input-monitor">
          <div className="source-actions">
            {state.mode === 'file' && (
              <button className="source-action" onClick={() => filePicker.current?.click()}><FileAudio size={15} />{hasFile ? 'Change file' : 'Choose audio'}</button>
            )}
            {state.mode === 'file' && !hasFile && (
              <button className="source-action" onClick={() => { if (player.current) input.openDemo(demoLoop, player.current) }}><Play size={15} />Demo loop</button>
            )}
            {hasFile && state.status === 'ready' && (
              <button className="source-action" onClick={() => input.playFile()}><Play size={15} />Play file</button>
            )}
            {browserCapture && !capturing && (
              <button className="source-action" onClick={() => { void input.connect() }}>
                {state.mode === 'input' ? <><Mic size={15} />Connect input</> : <><MonitorSpeaker size={15} />{state.mode === 'tab' ? 'Share tab' : 'Share system audio'}</>}
              </button>
            )}
            {(hasFile || (browserCapture && capturing)) && (
              <button className="source-action stop-source" onClick={() => input.stop()}>
                <StopCircle size={15} />{state.status === 'pending' ? 'Cancel' : 'Disconnect'}
              </button>
            )}
          </div>

          {state.label && <div className={state.status === 'error' ? 'source-label source-error' : 'source-label'} role="status" title={state.label}>{state.label}</div>}
          {state.status === 'pending' && <div className="source-label" role="status">Waiting for browser permission…</div>}
          <div className="spectrum-head">
            <span><AudioWaveform size={14} />Spectrum</span>
            <span className={state.status === 'live' ? 'live-label' : ''}>{state.status === 'live' ? 'Live' : 'Idle'}</span>
          </div>
          <div className="spectrum" ref={meter} aria-hidden="true">
            {Array.from({ length: BAR_COUNT }, (_, i) => <i key={i} />)}
          </div>
          <div className="spectrum-scale" aria-hidden="true"><span>Bass</span><span>Midrange</span><span>Treble</span></div>
          {state.mode === 'tab' && <p className="source-hint">In desktop Chrome, select the tab playing music and turn on Share tab audio.</p>}
          {state.mode === 'system' && <p className="source-hint">Choose a screen or window and enable audio if the Chrome picker offers it. Support varies by browser and macOS version.</p>}
          {(state.mode === 'system' || state.mode === 'input') && !capturing &&
            <button className="alternate-input" onClick={() => input.select(state.mode === 'system' ? 'input' : 'system')}>
              {state.mode === 'system' ? 'Use mic or line input' : 'Back to system audio'}
            </button>}
          {state.mode === 'input' && <p className="source-hint">Uses the Mac’s default microphone or line input. Live input stays off your speakers.</p>}
          {state.mode === 'file' && !hasFile && <p className="source-hint">Play a local track and react to its actual frequencies.</p>}
        </div>
      )}
    </>
  )
}
