// The bar-replay bar: transport controls, speeds, and states. A speed option ('1×'), the bar
// counter and an explicit update interval are figures and timeframe tokens, so they carry no words.
export const replay = {
  'replay.stepBack': 'Step back one bar',
  'replay.play': 'Play',
  'replay.pause': 'Pause',
  'replay.stepForward': 'Step forward one bar',
  'replay.speed': 'Replay speed (updates per second)',
  'replay.interval': 'Update interval (bars form from finer real bars)',
  /** The interval option that picks the grain itself, rather than a named token. */
  'replay.auto': 'Auto',
  'replay.goLive': 'Go live',
  'replay.goLiveTitle': 'Jump to the live edge',
  'replay.exit': 'Exit replay',
} as const
