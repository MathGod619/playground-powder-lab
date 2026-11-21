import { useEffect, useRef, type ChangeEvent, type ReactNode } from 'react'
import { AudioLines, AudioWaveform, FileAudio, Mic, MonitorSpeaker, Play, StopCircle } from 'lucide-react'
import type { AudioInput, AudioMode, AudioState } from './audio.ts'
import { BAR_COUNT } from './signal.ts'

const demoLoop = new URL('./assets/demo-loop.wav', import.meta.url).href

const SOURCES = [
  { mode: 'simulator', label: 'BPM', name: 'BPM simulator', Icon: AudioLines },
  { mode: 'file', label: 'File', name: 'Audio file', Icon: FileAudio },
  { mode: 'input', label: 'Mic', name: 'Microphone or line input', Icon: Mic },
  { mode: 'share', label: 'Share', name: 'Share browser or system audio', Icon: MonitorSpeaker },
] as const

export const SOURCE_LABEL: Record<AudioMode, string> = {
  simulator: 'Simulated signal',
  file: 'Local audio file',
  input: 'Microphone or line input',
  share: 'Browser audio sharing',
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
  const browserCapture = state.mode === 'input' || state.mode === 'share'

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
          <button key={mode} aria-pressed={state.mode === mode} aria-label={name} title={name} onClick={() => input.select(mode)}>
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
                {state.mode === 'input' ? <><Mic size={15} />Connect input</> : <><MonitorSpeaker size={15} />Share audio</>}
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
          {state.mode === 'share' && <p className="source-hint">Choose a tab and enable audio in the browser picker. System audio depends on browser support.</p>}
          {state.mode === 'input' && <p className="source-hint">Uses the Mac’s default microphone or line input. Live input stays off your speakers.</p>}
          {state.mode === 'file' && !hasFile && <p className="source-hint">Play a local track and react to its actual frequencies.</p>}
        </div>
      )}
    </>
  )
}
