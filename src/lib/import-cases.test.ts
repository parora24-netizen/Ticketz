import { describe, expect, it } from 'vitest'
import { applyScenarios, areaPage, diffCases, holdUnlabelledDuplicates, mapHeaders, nextIds, parseCases, parseCsv, parseDelimited, parseScenarios, parseTsv } from './import-cases'

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

  it('reads rows pasted from the Test Cases sheet without their header row', () => {
    const withId = parseTsv('TC_FN_070\tEngine\tSign-On\tLogin\tSigned out\t"1. Open\n2. Sign in"\tuser@x\tHome page\tHigh\tFunctional\n')
    expect(withId[0]).toMatchObject({ 'Test Case ID': 'TC_FN_070', Zone: 'Engine', 'Test Steps': '1. Open\n2. Sign in', Priority: 'High', 'Test Type': 'Functional' })
    const noId = parseTsv('Engine\tSign-On\tLogin\t\t\t\tHome page\tLow\tFunctional\n')
    expect(noId[0]).toMatchObject({ Zone: 'Engine', 'Test Case Title': 'Login', Priority: 'Low', 'Test Type': 'Functional' })
    expect(noId[0]['Test Case ID']).toBeUndefined()
    // The ID column copied with some IDs blank: given IDs are kept, blank ones get the next free id.
    const mixed = parseTsv('TC_FN_070\tEngine\tSign-On\tLogin\t\t\t\t\tHigh\t\n\tEngine\tSign-On\tLogout\t\t\t\t\tLow\t\n')
    const parsed = parseCases(mixed, [{ id: 'a1', zone: 'Engine', page: 'Sign-On' }])
    expect(parsed.cases.map((c) => c.tc_id)).toEqual(['TC_FN_070', null])
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
    const base = { area_id: 'a-signon', priority: 'High' as const, preconditions: null, steps: null, test_data: null, expected: null, test_type: null, scenario_id: null, requirement_id: null }
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
    const d = diffCases(cases, [{ tc_id: 'TC_FN_001', title: 'Same', area_id: 'a-signon', priority: 'High', preconditions: 'p', steps: 's', test_data: null, expected: 'e', test_type: 'UI', scenario_id: null, requirement_id: null }], present)
    expect(d[0].status).toBe('unchanged')
  })

  it('keeps row numbers right after a bad row, and matches by ID only', () => {
    const { cases, errors } = parseCases(
      [
        { 'Test Case ID': 'tc_fn_001 ', Zone: 'Engine', Page: 'Sign-On', Title: 'Login works', Priority: 'High' },
        { 'Test Case ID': '', Zone: 'Nowhere', Page: 'X', Title: 'Bad area', Priority: 'High' },
        { 'Test Case ID': '', Zone: 'Engine', Page: 'Sign-On', Title: 'login  WORKS', Priority: 'High' },
        { 'Test Case ID': '', Zone: 'Engine', Page: 'Sign-On', Title: 'Truly new', Priority: 'Low' },
      ],
      areas,
    )
    expect(errors.map((e) => e.row)).toEqual([3])
    expect(cases.map((c) => [c.tc_id, c.row])).toEqual([['TC_FN_001', 2], [null, 4], [null, 5]])
    const existing = [{ tc_id: 'TC_FN_001', title: 'Login works', area_id: 'a-signon', priority: 'High' as const, preconditions: null, steps: null, test_data: null, expected: null, test_type: null, scenario_id: null, requirement_id: null }]
    const held = holdUnlabelledDuplicates(cases, existing)
    expect(held.cases.map((c) => c.title)).toEqual(['Login works', 'Truly new'])
    expect(held.errors).toEqual([{ row: 4, message: expect.stringContaining('already TC_FN_001') }])
  })

  it('numbers new cases after the highest id', () => {
    expect(nextIds(931, 2)).toEqual(['TC_FN_932', 'TC_FN_933'])
    expect(nextIds(7, 1)).toEqual(['TC_FN_008'])
  })

  it('links cases to scenarios and requirements by the Test Scenarios sheet ranges', () => {
    const scenarios = parseScenarios([
      { 'Scenario ID': 'TS_E2E_02', 'Requirement ID': 'REQ_E2E_02', 'First TC ID': 'TC_E2E_004', 'Last TC ID': 'TC_E2E_007' },
      { 'Scenario ID': 'TS_FN_10', 'Requirement ID': 'REQ_FN_10', 'First TC ID': 'TC_FN_1648', 'Last TC ID': 'TC_FN_1650' },
      { 'Scenario ID': '', 'Requirement ID': '', 'First TC ID': '', 'Last TC ID': '' },
    ])
    expect(scenarios).toHaveLength(2)
    const areas = [{ id: 'a1', zone: 'Engine', page: 'Sign-On' }]
    const row = (id: string, extra = {}) => ({ 'Test Case ID': id, Zone: 'Engine', Page: 'Sign-On', Title: 'x', Priority: 'High', 'Scenario ID': '', ...extra })
    const r = applyScenarios(parseCases([row('TC_E2E_005'), row('TC_FN_1650'), row('TC_FN_070'), row('TC_E2E_006', { 'Scenario ID': 'TS_OWN' })], areas), scenarios)
    expect(r.cases.map((c) => [c.tc_id, c.scenario_id, c.requirement_id])).toEqual([
      ['TC_E2E_005', 'TS_E2E_02', 'REQ_E2E_02'],
      ['TC_FN_1650', 'TS_FN_10', 'REQ_FN_10'],
      ['TC_FN_070', null, null],
      ['TC_E2E_006', 'TS_OWN', 'REQ_E2E_02'],
    ])
    expect(r.present).toContain('requirement_id')
    expect(applyScenarios(parseCases([row('TC_E2E_005')], areas), []).present).not.toContain('requirement_id')
  })
})
