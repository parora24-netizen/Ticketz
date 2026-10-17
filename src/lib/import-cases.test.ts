import { describe, expect, it } from 'vitest'
import { areaPage, diffCases, mapHeaders, nextIds, parseCases, parseCsv, parseDelimited, parseTsv } from './import-cases'

const areas = [
  { id: 'a-signon', zone: 'Engine', page: 'Sign-On' },
  { id: 'a-create', zone: 'Logic Builder', page: 'Create' },
  { id: 'a-imports', zone: 'Quality Queue', page: 'Imports' },
]

describe('case import', () => {
  it('reads the workbook headers', () => {
    const { map, missing } = mapHeaders(['Test Case ID', 'Zone ', 'Page', 'Test Case Title', 'Priority', 'Test Steps', 'Expected Result'])
    expect(missing).toEqual([])
    expect(map.title).toBe('Test Case Title')
    expect(map.zone).toBe('Zone ')
  })

  it('reports missing columns', () => {
    const r = parseCases([{ Title: 'x' }], areas)
    expect(r.errors[0].message).toMatch(/Missing columns: zone, page, priority/)
  })

  it('maps workbook pages to Framework areas', () => {
    expect(areaPage('Create-Database')).toBe('Create')
    expect(areaPage('Sign-on')).toBe('Sign-On')
    expect(areaPage('Imports')).toBe('Imports')
  })

  it('parses good rows and explains bad ones with their row numbers', () => {
    const r = parseCases(
      [
        { 'Test Case ID': 'tc_fn_900', Zone: 'Logic Builder', Page: 'Create-Template', Title: 'Template loads', Priority: 'high' },
        { 'Test Case ID': '', Zone: 'Engine', Page: 'Sign-on', Title: 'Login works', Priority: 'Critical' },
        { 'Test Case ID': 'TC_FN_900', Zone: 'Logic Builder', Page: 'Create', Title: 'Dup', Priority: 'Low' },
        { 'Test Case ID': 'TC_FN_901', Zone: 'Data Hub', Page: 'Grid', Title: 'Grid', Priority: 'Low' },
        { 'Test Case ID': 'TC_FN_902', Zone: 'Engine', Page: 'Sign-On', Title: '', Priority: 'Urgent' },
        { 'Test Case ID': '', Zone: '', Page: '', Title: '', Priority: '' },
      ],
      areas,
    )
    expect(r.cases.map((c) => [c.tc_id, c.area_id, c.priority])).toEqual([
      ['TC_FN_900', 'a-create', 'High'],
      [null, 'a-signon', 'Critical'],
    ])
    expect(r.errors.map((e) => e.row)).toEqual([4, 5, 6])
    expect(r.errors[0].message).toMatch(/appears twice/)
    expect(r.errors[1].message).toMatch(/no Framework area "Data Hub · Grid"/)
    expect(r.errors[2].message).toMatch(/no title.*priority "Urgent"/)
  })

  it('reads pasted Excel cells and CSV, including quoted multi-line cells', () => {
    const tsv = 'Zone\tPage\tTitle\tPriority\tSteps\nEngine\tSign-On\tLogin\tHigh\t"1. Open\n2. Sign in"\n'
    const rows = parseTsv(tsv)
    expect(rows).toHaveLength(1)
    expect(rows[0].Steps).toBe('1. Open\n2. Sign in')
    const csv = 'Zone,Page,Title,Priority\r\nEngine,Sign-On,"Login, with SSO",Low\r\n'
    expect(parseCsv(csv)[0].Title).toBe('Login, with SSO')
    expect(parseDelimited('a\t"say ""hi"""', '\t')).toEqual([['a', 'say "hi"']])
  })

  it('tells new, updated and unchanged cases apart', () => {
    const { cases } = parseCases(
      [
        { 'Test Case ID': 'TC_FN_001', Zone: 'Engine', Page: 'Sign-On', Title: 'Same', Priority: 'High' },
        { 'Test Case ID': 'TC_FN_002', Zone: 'Engine', Page: 'Sign-On', Title: 'Renamed', Priority: 'High' },
        { 'Test Case ID': 'TC_FN_003', Zone: 'Engine', Page: 'Sign-On', Title: 'Brand new', Priority: 'High' },
      ],
      areas,
    )
    const base = { area_id: 'a-signon', priority: 'High' as const, preconditions: null, steps: null, test_data: null, expected: null, test_type: null }
    const d = diffCases(cases, [
      { tc_id: 'TC_FN_001', title: 'Same', ...base },
      { tc_id: 'TC_FN_002', title: 'Old name', ...base },
    ])
    expect(d.map((x) => x.status)).toEqual(['unchanged', 'updated', 'new'])
    expect(d[1].changed).toEqual(['title'])
  })

  it('never blanks fields the file has no column for', () => {
    const { cases, present } = parseCases([{ 'Test Case ID': 'TC_FN_001', Zone: 'Engine', Page: 'Sign-On', Title: 'Same', Priority: 'High' }], areas)
    expect(present).toEqual([])
    const d = diffCases(cases, [{ tc_id: 'TC_FN_001', title: 'Same', area_id: 'a-signon', priority: 'High', preconditions: 'p', steps: 's', test_data: null, expected: 'e', test_type: 'UI' }], present)
    expect(d[0].status).toBe('unchanged')
  })

  it('numbers new cases after the highest id', () => {
    expect(nextIds(931, 2)).toEqual(['TC_FN_932', 'TC_FN_933'])
    expect(nextIds(7, 1)).toEqual(['TC_FN_008'])
  })
})
