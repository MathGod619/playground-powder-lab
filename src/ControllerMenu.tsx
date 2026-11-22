import { useLayoutEffect, type RefObject } from 'react'
import { SCENES } from './scenes.ts'
import type { SceneId } from './world.ts'

export type ControllerPage = 'main' | 'worlds' | 'controls'

type Props = {
  dialog: RefObject<HTMLDialogElement | null>
  page: ControllerPage | null
  scene: SceneId
  raveActive: boolean
  raveFinished: boolean
  rumble: boolean
  onPage: (page: ControllerPage | null) => void
  onWorld: (scene: SceneId) => void
  onRave: () => void
  onSandbox: () => void
  onRumble?: () => void
}

export function moveControllerFocus(dialog: HTMLDialogElement, direction: number) {
  const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
  if (!buttons.length) return
  const current = buttons.findIndex(button => button === document.activeElement)
  buttons[current < 0 ? 0 : (current + direction + buttons.length) % buttons.length].focus()
}

export function ControllerMenu({ dialog, page, scene, raveActive, raveFinished, rumble, onPage, onWorld, onRave, onSandbox, onRumble }: Props) {
  useLayoutEffect(() => {
    const element = dialog.current
    if (!element) return
    if (!page) { if (element.open) element.close(); return }
    if (!element.open) element.showModal()
    const initial = element.querySelector<HTMLButtonElement>('[data-initial-focus]')
    initial?.focus()
  }, [dialog, page])

  const back = () => onPage(page === 'main' ? null : 'main')
  const currentWorld = SCENES.find(world => world.id === scene)?.name
  return (
    <dialog ref={dialog} className="controller-dialog" aria-labelledby="controller-menu-title"
      onCancel={event => { event.preventDefault(); back() }}
      onKeyDown={event => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
        event.preventDefault()
        moveControllerFocus(event.currentTarget, event.key === 'ArrowDown' ? 1 : -1)
      }}>
      <h2 id="controller-menu-title">{page === 'worlds' ? 'Choose a world' : page === 'controls' ? 'Controller controls' : 'Controller menu'}</h2>
      <div className="controller-menu-body">
        {page === 'main' && (
          <div className="controller-options">
            <button data-initial-focus={!raveActive || undefined} disabled={raveActive} onClick={() => onPage('worlds')}>
              <strong>Worlds</strong><small>{raveActive ? 'Available after the round or in Sandbox' : currentWorld}</small>
            </button>
            {!raveActive && <button onClick={onRave}><strong>{raveFinished ? 'Play Rave again' : 'Start Rave Mode'}</strong></button>}
            {(raveActive || raveFinished) && <button onClick={onSandbox}><strong>Return to Sandbox</strong></button>}
            {onRumble && (
              <button aria-pressed={rumble} onClick={onRumble}><strong>Drop rumble</strong><small>{rumble ? 'On' : 'Off'}</small></button>
            )}
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
        {page === 'controls' && (
          <>
            <dl className="controller-bindings">
              <dt>Left stick / right stick</dt><dd>Aim / fine aim</dd>
              <dt>A/Cross or RT/R2</dt><dd>Paint</dd>
              <dt>B/Circle or LT/L2</dt><dd>Erase</dd>
              <dt>LB/RB or L1/R1</dt><dd>Switch tools</dd>
              <dt>D-pad up/down</dt><dd>Resize brush</dd>
              <dt>X/Square</dt><dd>Drop</dd>
              <dt>Start/Options</dt><dd>Freeze or resume</dd>
              <dt>Y/Triangle</dt><dd>Open this menu</dd>
            </dl>
            <div className="controller-options"><button data-initial-focus onClick={back}><strong>Back</strong></button></div>
          </>
        )}
      </div>
      <p className="controller-navigation">D-pad or left stick to move · A/Cross to select · B/Circle to go back</p>
    </dialog>
  )
}
