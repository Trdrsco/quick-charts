// CommonJS consumer. The packages ship ESM-ONLY — a deliberate, evidence-based match to the peer:
// lightweight-charts v5 exports `import` conditions only (require() on it throws
// ERR_PACKAGE_PATH_NOT_EXPORTED), so a `require` condition on OUR package would advertise a path
// that explodes the moment the renderer loads. The supported CJS route is dynamic import(), and
// this smoke proves it works rather than documenting it on faith.
const fail = (msg) => {
  console.error(`clean-room js (cjs dynamic-import): ${msg}`)
  process.exit(1)
}

Promise.all([import('@trdrs/chart'), import('@trdrs/chart-drawings')])
  .then(([chart, drawings]) => {
    if (typeof chart.createChart !== 'function') fail('createChart missing')
    if (chart.olderPageVerdict({ bars: [], noData: true }, 100, false).kind !== 'end') fail('olderPageVerdict wrong')
    if (chart.tfToUdfResolution('30m') !== '30') fail('tfToUdfResolution wrong')
    if (drawings.toolRegistry.all().length < 80) fail('toolRegistry too small')
    console.log('clean-room js (cjs dynamic-import): ok')
  })
  .catch((e) => fail(String(e)))
