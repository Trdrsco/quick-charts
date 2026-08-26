// The replay strip — the widget's transport controls while bar replay is on: step back, play or
// pause, step forward, speed, back to live, exit. Same chrome discipline as the rail and legend:
// tiny theme-tinted vanilla DOM in the inert overlay subtree, opting back into pointer events, so
// the gesture layers can never steal its presses. Appears only while replay is ON; every control
// drives the widget's replay api and nothing else.
import type { ResolvedTheme } from './host'
import { createChartI18n, type ChartI18n } from './i18n'
import { REPLAY_SPEEDS, type ReplaySpeed } from './replay'

export interface ReplayBarHandle {
  sync(state: { playing: boolean; cursor: number; total: number; speed: ReplaySpeed; interval: string }): void
  destroy(): void
}

export function mountReplayBar(
  container: HTMLElement,
  controls: {
    play(): void
    pause(): void
    stepForward(): void
    stepBack(): void
    setSpeed(s: ReplaySpeed): void
    /** The update interval: 'auto' or a wire tf token from the offered sub-intervals. */
    setInterval(token: string): void
    goLive(): void
    exit(): void
  },
  theme: ResolvedTheme,
  /** The chart timeframe's formable sub-intervals (wire tf tokens); empty = whole-bar only, and
   *  the interval select is omitted entirely rather than offering a one-entry menu. */
  subIntervals: readonly string[] = [],
  /** The widget's language: every control reads its label through this when the bar draws and again
   *  whenever the language changes, so a switch never leaves a stale word on the transport. */
  strings: ChartI18n = createChartI18n(),
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

  const back = button('⏮', strings.t('replay.stepBack'), controls.stepBack)
  const playPause = button('▶', strings.t('replay.play'), () => (playing ? controls.pause() : controls.play()))
  const forward = button('⏭', strings.t('replay.stepForward'), controls.stepForward)

  const speed = document.createElement('select')
  speed.title = strings.t('replay.speed')
  speed.style.cssText = `background:${theme.background};border:1px solid ${theme.gridColor};border-radius:5px;color:${theme.textColor};font-size:11px;padding:1px 2px;`
  for (const s of REPLAY_SPEEDS) {
    const o = document.createElement('option')
    o.value = String(s)
    o.textContent = `${s}×`
    speed.appendChild(o)
  }
  speed.addEventListener('change', () => controls.setSpeed(Number(speed.value) as ReplaySpeed))
  bar.appendChild(speed)

  // The update interval: 'Auto' (the largest sub-interval giving ≥4 updates per bar) or an
  // explicit finer token; only offered when the chart timeframe is formable at all.
  let interval: HTMLSelectElement | null = null
  if (subIntervals.length > 0) {
    interval = document.createElement('select')
    interval.title = strings.t('replay.interval')
    interval.style.cssText = speed.style.cssText
    for (const token of ['auto', ...subIntervals]) {
      const o = document.createElement('option')
      o.value = token
      o.textContent = token === 'auto' ? strings.t('replay.auto') : token
      interval.appendChild(o)
    }
    interval.addEventListener('change', () => controls.setInterval(interval!.value))
    bar.appendChild(interval)
  }

  const position = document.createElement('span')
  position.style.cssText = 'opacity:0.7;padding:0 4px;font-variant-numeric:tabular-nums;'
  bar.appendChild(position)

  const goLive = button(strings.t('replay.goLive'), strings.t('replay.goLiveTitle'), controls.goLive)
  const exit = button('✕', strings.t('replay.exit'), controls.exit)

  let playing = false
  const relabel = () => {
    back.title = strings.t('replay.stepBack')
    forward.title = strings.t('replay.stepForward')
    playPause.title = strings.t(playing ? 'replay.pause' : 'replay.play')
    speed.title = strings.t('replay.speed')
    if (interval) {
      interval.title = strings.t('replay.interval')
      const auto = interval.options[0]
      if (auto) auto.textContent = strings.t('replay.auto')
    }
    goLive.textContent = strings.t('replay.goLive')
    goLive.title = strings.t('replay.goLiveTitle')
    exit.title = strings.t('replay.exit')
  }
  const unsubscribe = strings.onChange(relabel)

  container.appendChild(bar)
  return {
    sync(state) {
      playing = state.playing
      playPause.textContent = playing ? '⏸' : '▶'
      playPause.title = strings.t(playing ? 'replay.pause' : 'replay.play')
      speed.value = String(state.speed)
      if (interval) interval.value = state.interval
      position.textContent = `${state.cursor} / ${state.total}`
      back.disabled = state.cursor <= 2
      back.style.opacity = back.disabled ? '0.45' : '1'
    },
    destroy() {
      unsubscribe()
      bar.remove()
    },
  }
}
