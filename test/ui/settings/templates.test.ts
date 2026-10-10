// The chart templates: the settings a viewer saves from the dialog, in the `templates('chart')`
// family every save/load adapter carries.
import { describe, expect, it } from 'vitest'
import { REST_TEMPLATE_KINDS } from '../../../src/adapters/rest/wire'
import { memorySaveLoadAdapter } from '../../../src/resources'
import { ChartTemplates, decodeChartTemplate } from '../../../src/ui/settings/templates'

describe('the chart templates', () => {
  it('is a template family of its own, in memory and on the REST wire', () => {
    const adapter = memorySaveLoadAdapter()
    expect(adapter.templates('chart')).toBe(adapter.templates('chart'))
    expect(adapter.templates('chart')).not.toBe(adapter.templates('palette'))
    expect(REST_TEMPLATE_KINDS).toContain('chart')
  })

  it('saves a name once, replaces it in place, and removes it', async () => {
    const templates = new ChartTemplates(memorySaveLoadAdapter().templates('chart'))
    expect((await templates.save('Dark', { canvas: { background: '#000000' } })).kind).toBe('ok')
    expect((await templates.save('Dark', { canvas: { background: '#111111' } })).kind).toBe('ok')
    const rows = await templates.list()
    expect(rows.map((row) => row.name)).toEqual(['Dark'])
    expect(await templates.load(rows[0]!.ref.id)).toEqual({ canvas: { background: '#111111' } })
    expect((await templates.remove(rows[0]!.ref)).kind).toBe('ok')
    expect(await templates.list()).toEqual([])
    expect(await templates.load(rows[0]!.ref.id)).toBeNull()
  })

  it('reads a body it cannot parse, or one holding no settings, as no settings', () => {
    expect(decodeChartTemplate('not json')).toEqual({})
    expect(decodeChartTemplate('[]')).toEqual({})
    expect(decodeChartTemplate('{"settings":[1]}')).toEqual({})
    expect(decodeChartTemplate('{"settings":{"canvas":{"marginTop":3},"bad":7}}')).toEqual({ canvas: { marginTop: 3 } })
  })
})
