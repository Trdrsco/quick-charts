// UDF `/symbols` → SymbolInfo. The load-bearing claim is the one the plan makes: pricescale,
// minmov, minmove2, fractional and variable_tick_size arrive intact, because a single floating tick
// cannot carry thirty-seconds, quarters of a thirty-second, or a ladder of tick bands.
import { describe, expect, it } from 'vitest'
import { udfPriceFormat, udfSymbolInfo, type UdfSymbolResponse } from '../src/udfSymbology'
import { createPriceFormatter } from '../src/priceFormatter'

describe('udfPriceFormat', () => {
  it('maps a decimal equity', () => {
    expect(udfPriceFormat({ pricescale: 100, minmov: 1 })).toEqual({ pricescale: 100, minmov: 1 })
  })

  it('keeps a quarter-point futures grid as minmov, not as a float', () => {
    expect(udfPriceFormat({ pricescale: 100, minmov: 25 })).toEqual({ pricescale: 100, minmov: 25 })
  })

  it('carries fractional and fraction-of-a-fraction facts through', () => {
    expect(udfPriceFormat({ pricescale: 32, minmov: 1, fractional: true })).toEqual({ pricescale: 32, minmov: 1, fractional: true })
    expect(udfPriceFormat({ pricescale: 128, minmov: 1, minmove2: 4, fractional: true })).toEqual({
      pricescale: 128,
      minmov: 1,
      minmove2: 4,
      fractional: true,
    })
  })

  it('carries the variable tick ladder as the string the server sent', () => {
    expect(udfPriceFormat({ pricescale: 10000, minmov: 1, variable_tick_size: ' 0.0001 1 0.001 10 0.01 ' }).variableTickSize).toBe(
      '0.0001 1 0.001 10 0.01',
    )
  })

  it('leaves fractional machinery off a plain decimal symbol', () => {
    const format = udfPriceFormat({ pricescale: 100, minmov: 1, minmove2: 0, fractional: false, variable_tick_size: '  ' })
    expect(format.minmove2).toBeUndefined()
    expect(format.fractional).toBeUndefined()
    expect(format.variableTickSize).toBeUndefined()
  })

  it('falls back to the protocol defaults, never to a guess about the market', () => {
    expect(udfPriceFormat({})).toEqual({ pricescale: 100, minmov: 1 })
    expect(udfPriceFormat({ pricescale: 0, minmov: -3 })).toEqual({ pricescale: 100, minmov: 1 })
  })
})

const FULL: UdfSymbolResponse = {
  name: 'ESZ2026',
  ticker: 'CME_MINI:ESZ2026',
  description: 'E-mini S&P 500 Dec 2026',
  exchange: 'CME',
  listed_exchange: 'CME_MINI',
  type: 'futures',
  pricescale: 100,
  minmov: 25,
  supported_resolutions: ['1', '5', '60', '1D', '1W', 'bogus'],
  timezone: 'America/Chicago',
  session: '1700-1600',
  session_holidays: '20261126,20261225',
  data_status: 'delayed_streaming',
  currency_code: 'USD',
  unit_id: 'point',
  volume_precision: 0,
}

describe('udfSymbolInfo', () => {
  it('maps every served field', () => {
    expect(udfSymbolInfo(FULL, 'ESZ2026')).toEqual({
      ticker: 'CME_MINI:ESZ2026',
      name: 'ESZ2026',
      description: 'E-mini S&P 500 Dec 2026',
      exchange: 'CME',
      listedExchange: 'CME_MINI',
      type: 'futures',
      supportedResolutions: ['1m', '5m', '1h', '1d', '1w'],
      timezone: 'America/Chicago',
      session: '1700-1600',
      sessionHolidays: '20261126,20261225',
      dataStatus: 'delayed_streaming',
      currencyCode: 'USD',
      unitId: 'point',
      volumePrecision: 0,
      format: { pricescale: 100, minmov: 25 },
    })
  })

  it('drops a resolution the chart timeframe grammar cannot express, rather than mis-declaring it', () => {
    expect(udfSymbolInfo(FULL, 'ESZ2026')?.supportedResolutions).not.toContain('bogus')
  })

  it('falls back to the asked symbol and the protocol defaults on a sparse answer', () => {
    expect(udfSymbolInfo({ name: 'AAPL' }, 'AAPL')).toEqual({
      ticker: 'AAPL',
      name: 'AAPL',
      description: 'AAPL',
      exchange: '',
      listedExchange: '',
      type: '',
      supportedResolutions: [],
      timezone: 'Etc/UTC',
      session: '24x7',
      dataStatus: 'streaming',
      volumePrecision: 0,
      format: { pricescale: 100, minmov: 1 },
    })
  })

  it('refuses a data status outside the three the contract names', () => {
    expect(udfSymbolInfo({ name: 'AAPL', data_status: 'whenever' }, 'AAPL')?.dataStatus).toBe('streaming')
  })

  it('mirrors the exchange into listedExchange when the server named only one venue', () => {
    expect(udfSymbolInfo({ name: 'AAPL', exchange: 'NASDAQ' }, 'AAPL')?.listedExchange).toBe('NASDAQ')
  })

  it('omits an empty currency, unit or holiday string instead of storing a blank fact', () => {
    const info = udfSymbolInfo({ name: 'AAPL', currency_code: '', unit_id: '', session_holidays: '  ' }, 'AAPL')
    expect(info?.currencyCode).toBeUndefined()
    expect(info?.unitId).toBeUndefined()
    expect(info?.sessionHolidays).toBeUndefined()
  })

  it('answers null when nothing identifies a symbol', () => {
    expect(udfSymbolInfo({}, '')).toBeNull()
  })

  it('hands the formatter facts that survive the round trip', () => {
    const info = udfSymbolInfo({ name: 'ZBZ2026', pricescale: 128, minmov: 1, minmove2: 4, fractional: true }, 'ZBZ2026')
    const formatter = createPriceFormatter(info!.format)
    expect(formatter.format(110.515625)).toBe("110'16'2")
  })
})
