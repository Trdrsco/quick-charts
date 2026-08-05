// The replay strip — the widget's transport controls while bar replay is on: step back, play or
// pause, step forward, speed, back to live, exit. Same chrome discipline as the rail and legend:
// tiny theme-tinted vanilla DOM in the inert overlay subtree, opting back into pointer events, so
// the gesture layers can never steal its presses. Appears only while replay is ON; every control
// drives the widget's replay api and nothing else.
import type { ResolvedTheme } from './host'
import { REPLAY_SPEEDS, type ReplaySpeed } from './replay'

export interface ReplayBarHandle {
  sync(state: { playing: boolean; cursor: number; total: number; speed: ReplaySpeed }): void
  destroy(): void
}

export function mountReplayBar(
  container: HTMLElement,
  controls: { play(): void; pause(): void; stepForward(): void; stepBack(): void; setSpeed(s: ReplaySpeed): void; goLive(): void; exit(): void },
  theme: ResolvedTheme,
): ReplayBarHandle {
  const bar = document.createElement('div')
  bar.style.cssText =
    'position:absolute;left:50%;bottom:10px;transform:translateX(-50%);z-index:4;display:flex;gap:4px;align-items:center;' +
    `background:${theme.background};border:1px solid ${theme.gridColor};border-radius:7px;padding:4px 6px;` +
    `color:${theme.textColor};font-size:11px;pointer-events:auto;`
  for (const type of ['pointerdown', 'pointerup', 'pointermove'] as const) bar.addEventListener(type, (e) => e.stopPropagation())

  const button = (label: string, title: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    b.title = title
    b.style.cssText = `background:none;border:1px solid ${theme.gridColor};border-radius:5px;color:${theme.textColor};cursor:pointer;padding:1px 7px;font-size:11px;`
    b.addEventListener('click', onClick)
    bar.appendChild(b)
    return b
  }

  const back = button('⏮', 'Step back one bar', controls.stepBack)
  const playPause = button('▶', 'Play', () => (playing ? controls.pause() : controls.play()))
  button('⏭', 'Step forward one bar', controls.stepForward)

  const speed = document.createElement('select')
  speed.title = 'Replay speed (updates per second)'
  speed.style.cssText = `background:${theme.background};border:1px solid ${theme.gridColor};border-radius:5px;color:${theme.textColor};font-size:11px;padding:1px 2px;`
  for (const s of REPLAY_SPEEDS) {
    const o = document.createElement('option')
    o.value = String(s)
    o.textContent = `${s}×`
    speed.appendChild(o)
  }
  speed.addEventListener('change', () => controls.setSpeed(Number(speed.value) as ReplaySpeed))
  bar.appendChild(speed)

  const position = document.createElement('span')
  position.style.cssText = 'opacity:0.7;padding:0 4px;font-variant-numeric:tabular-nums;'
  bar.appendChild(position)

  button('Go live', 'Jump to the live edge', controls.goLive)
  button('✕', 'Exit replay', controls.exit)

  let playing = false
  container.appendChild(bar)
  return {
    sync(state) {
      playing = state.playing
      playPause.textContent = playing ? '⏸' : '▶'
      playPause.title = playing ? 'Pause' : 'Play'
      speed.value = String(state.speed)
      position.textContent = `${state.cursor} / ${state.total}`
      back.disabled = state.cursor <= 2
      back.style.opacity = back.disabled ? '0.45' : '1'
    },
    destroy() {
      bar.remove()
    },
  }
}
