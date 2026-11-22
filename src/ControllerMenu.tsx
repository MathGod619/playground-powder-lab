import { useLayoutEffect, type RefObject } from 'react'
import { SCENES } from './scenes.ts'
import { RAVE_MODES, type RaveMode } from './rave-challenges.ts'
import type { SceneId } from './world.ts'

export type ControllerPage = 'main' | 'worlds' | 'controls' | 'raves'

type Props = {
  dialog: RefObject<HTMLDialogElement | null>
  page: ControllerPage | null
  scene: SceneId
  raveActive: boolean
  raveFinished: boolean
  connected: boolean
  rumble: boolean
  onPage: (page: ControllerPage | null) => void
  onBack: (page: ControllerPage) => void
  onWorld: (scene: SceneId) => void
  onRavePicker: () => void
  onRave: (mode: RaveMode) => void
  onReplay: () => void
  onSandbox: () => void
  onRumble?: () => void
  onRetry?: () => void
}

export function moveControllerFocus(dialog: HTMLDialogElement, direction: number) {
  const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
  if (!buttons.length) return
  const current = buttons.findIndex(button => button === document.activeElement)
  buttons[current < 0 ? 0 : (current + direction + buttons.length) % buttons.length].focus()
}

export function ControllerMenu({ dialog, page, scene, raveActive, raveFinished, connected, rumble, onPage, onBack,
  onWorld, onRavePicker, onRave, onReplay, onSandbox, onRumble, onRetry }: Props) {
  useLayoutEffect(() => {
    const element = dialog.current
    if (!element) return
    if (!page) { if (element.open) element.close(); return }
    if (!element.open) element.showModal()
    const initial = element.querySelector<HTMLButtonElement>('[data-initial-focus]')
    initial?.focus()
  }, [dialog, page])

  const back = () => { if (page) onBack(page) }
  const currentWorld = SCENES.find(world => world.id === scene)?.name
  const title = page === 'worlds' ? 'Choose a world' : page === 'raves' ? 'Rave challenges'
    : page === 'controls' ? 'Controller controls' : 'Controller menu'
  return (
    <dialog ref={dialog} className="controller-dialog" aria-labelledby="controller-menu-title"
      onCancel={event => { event.preventDefault(); back() }}
      onKeyDown={event => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
        event.preventDefault()
        moveControllerFocus(event.currentTarget, event.key === 'ArrowDown' ? 1 : -1)
      }}>
      <h2 id="controller-menu-title">{title}</h2>
      <div className="controller-menu-body">
        {page === 'main' && (
          <div className="controller-options">
            <button data-initial-focus={!raveActive || undefined} disabled={raveActive} onClick={() => onPage('worlds')}>
              <strong>Worlds</strong><small>{raveActive ? 'Available after the round or in Sandbox' : currentWorld}</small>
            </button>
            {!raveActive && <button onClick={onRavePicker}><strong>Rave challenges</strong></button>}
            {raveFinished && <button onClick={onReplay}><strong>Play Rave again</strong></button>}
            {(raveActive || raveFinished) && <button onClick={onSandbox}><strong>Return to Sandbox</strong></button>}
            {onRumble && (
              <button aria-pressed={rumble} onClick={onRumble}><strong>Drop rumble</strong><small>{rumble ? 'On' : 'Off'}</small></button>
            )}
            {onRetry && <button onClick={onRetry}><strong>Retry the Drop</strong><small>Restore the setup. Music keeps playing.</small></button>}
            <button onClick={() => onPage('controls')}><strong>Controls</strong></button>
            <button data-initial-focus={raveActive || undefined} onClick={back}><strong>Resume</strong></button>
          </div>
        )}
        {page === 'worlds' && (
          <div className="controller-options">
            {SCENES.map(world => (
              <button key={world.id} data-initial-focus={world.id === scene || undefined}
                aria-current={world.id === scene || undefined} onClick={() => onWorld(world.id)}>
                <strong>{world.name}</strong><small>{world.detail}</small>
              </button>
            ))}
            <button onClick={back}><strong>Back</strong></button>
          </div>
        )}
        {page === 'raves' && (
          <div className="controller-options">
            {RAVE_MODES.map(rave => (
              <button key={rave.id} data-initial-focus={rave.id === 'freestyle' || undefined} onClick={() => onRave(rave.id)}>
                <strong>{rave.name}</strong><small>{rave.detail}</small>
              </button>
            ))}
            <button onClick={back}><strong>Back</strong></button>
          </div>
        )}
        {page === 'controls' && (
          <>
            <dl className="controller-bindings">
              <dt>Left stick / right stick</dt><dd>Aim / fine aim</dd>
              <dt>A/Cross or RT/R2</dt><dd>Paint</dd>
              <dt>B/Circle or LT/L2</dt><dd>Erase</dd>
              <dt>LB/RB or L1/R1</dt><dd>Switch tools</dd>
              <dt>D-pad up/down</dt><dd>Resize brush</dd>
              <dt>D-pad left</dt><dd>Retry the last Sandbox drop</dd>
              <dt>X/Square</dt><dd>Drop</dd>
              <dt>Start/Options</dt><dd>Freeze or resume</dd>
              <dt>Y/Triangle</dt><dd>Open this menu</dd>
            </dl>
            <div className="controller-options"><button data-initial-focus onClick={back}><strong>Back</strong></button></div>
          </>
        )}
      </div>
      <p className="controller-navigation">{connected
        ? 'D-pad or left stick to move · A/Cross to select · B/Circle to go back'
        : 'Arrow keys to move · Enter to select · Esc to go back'}</p>
    </dialog>
  )
}
