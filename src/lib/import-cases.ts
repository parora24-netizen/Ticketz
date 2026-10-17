/**
 * Turns rows from the test workbook, a CSV, or cells pasted from Excel into validated test cases.
 * Pure: no database access, so the import page, the paste box and the seed script share it.
 */

export type Priority = 'Critical' | 'High' | 'Medium' | 'Low'
export type AreaRef = { id: string; zone: string; page: string }

export type CaseInput = {
  tc_id: string | null // null = assign the next free id on save
  area_id: string
  zone: string
  page: string
  source_page: string
  title: string
  preconditions: string | null
  steps: string | null
  test_data: string | null
  expected: string | null
  priority: Priority
  test_type: string | null
}

export type ParseResult = { cases: CaseInput[]; errors: { row: number; message: string }[] }

/** Header spellings we accept, normalised to lower case without punctuation. */
const ALIASES: Record<keyof Omit<CaseInput, 'area_id' | 'source_page'>, string[]> = {
  tc_id: ['test case id', 'tc id', 'id', 'test id'],
  zone: ['zone'],
  page: ['page', 'area'],
  title: ['test case title', 'title', 'test case', 'name'],
  preconditions: ['pre-conditions', 'preconditions', 'pre conditions'],
  steps: ['test steps', 'steps'],
  test_data: ['test data', 'data'],
  expected: ['expected result', 'expected', 'expected results'],
  priority: ['priority'],
  test_type: ['test type', 'type'],
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** Map each field to the header that holds it. Returns missing required fields too. */
export function mapHeaders(headers: string[]): { map: Partial<Record<keyof typeof ALIASES, string>>; missing: string[] } {
  const map: Partial<Record<keyof typeof ALIASES, string>> = {}
  for (const [field, names] of Object.entries(ALIASES) as [keyof typeof ALIASES, string[]][]) {
    const h = headers.find((x) => names.includes(norm(x)))
    if (h) map[field] = h
  }
  const missing = (['zone', 'page', 'title', 'priority'] as const).filter((f) => !map[f]).map((f) => ALIASES[f][0])
  return { map, missing }
}

/** Workbook pages like "Create-Database" or "Sign-on" belong to a Framework area. */
export function areaPage(page: string): string {
  const p = page.trim()
  if (/^sign-?on$/i.test(p)) return 'Sign-On'
  if (/^create/i.test(p)) return 'Create'
  return p
}

export function toPriority(p: string): Priority | null {
  const v = (['Critical', 'High', 'Medium', 'Low'] as const).find((x) => x.toLowerCase() === p.trim().toLowerCase())
  return v ?? null
}

/**
 * `rows` are records keyed by header. Row numbers for error messages come from `rowNumbers`
 * when given (spreadsheets skip blank rows), else count up from `firstRow`.
 */
export function parseCases(rows: Record<string, string>[], areas: AreaRef[], firstRow = 2, rowNumbers?: number[]): ParseResult {
  const headers = rows.length ? Object.keys(rows[0]) : []
  const { map, missing } = mapHeaders(headers)
  if (missing.length) return { cases: [], errors: [{ row: 1, message: `Missing columns: ${missing.join(', ')}` }] }
  const areaByKey = new Map(areas.map((a) => [`${norm(a.zone)}|${norm(a.page)}`, a]))
  const get = (r: Record<string, string>, f: keyof typeof ALIASES) => (map[f] ? (r[map[f]!] ?? '').trim() : '')

  const cases: CaseInput[] = []
  const errors: ParseResult['errors'] = []
  const seen = new Set<string>()
  rows.forEach((r, i) => {
    const row = rowNumbers?.[i] ?? firstRow + i
    if (Object.values(r).every((v) => !String(v ?? '').trim())) return
    const tcRaw = get(r, 'tc_id').toUpperCase()
    const title = get(r, 'title')
    const zone = get(r, 'zone')
    const sourcePage = get(r, 'page')
    const priority = toPriority(get(r, 'priority'))
    const area = areaByKey.get(`${norm(zone)}|${norm(areaPage(sourcePage))}`)
    const problems: string[] = []
    if (tcRaw && !/^TC_[A-Z0-9_]+$/.test(tcRaw)) problems.push(`ID "${tcRaw}" should look like TC_FN_070`)
    if (tcRaw && seen.has(tcRaw)) problems.push(`ID ${tcRaw} appears twice`)
    if (!title) problems.push('no title')
    if (!area) problems.push(`no Framework area "${zone} · ${sourcePage}"`)
    if (!priority) problems.push(`priority "${get(r, 'priority')}" is not Critical, High, Medium or Low`)
    if (problems.length) {
      errors.push({ row, message: problems.join('; ') })
      return
    }
    if (tcRaw) seen.add(tcRaw)
    cases.push({
      tc_id: tcRaw || null,
      area_id: area!.id,
      zone: area!.zone,
      page: area!.page,
      source_page: sourcePage,
      title,
      preconditions: get(r, 'preconditions') || null,
      steps: get(r, 'steps') || null,
      test_data: get(r, 'test_data') || null,
      expected: get(r, 'expected') || null,
      priority: priority!,
      test_type: get(r, 'test_type') || null,
    })
  })
  return { cases, errors }
}

/** Rows pasted from Excel arrive as tab-separated lines; the first line holds the headers. */
export function parseTsv(text: string): Record<string, string>[] {
  const lines = parseDelimited(text, '\t')
  return toRecords(lines)
}

export function parseCsv(text: string): Record<string, string>[] {
  return toRecords(parseDelimited(text, ','))
}

function toRecords(lines: string[][]): Record<string, string>[] {
  if (lines.length < 2) return []
  const headers = lines[0].map((h) => h.trim())
  return lines.slice(1).map((cells) => Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ''])))
}

/** Splits delimited text, honouring quoted cells with embedded newlines (as Excel copies them). */
export function parseDelimited(text: string, sep: string): string[][] {
  const out: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const t = text.replace(/\r\n?/g, '\n')
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === sep) { row.push(cell); cell = '' }
    else if (ch === '\n') { row.push(cell); out.push(row); row = []; cell = '' }
    else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); out.push(row) }
  return out.filter((r) => r.some((c) => c.trim() !== ''))
}

export type Existing = Pick<CaseInput, 'title' | 'area_id' | 'priority' | 'preconditions' | 'steps' | 'test_data' | 'expected' | 'test_type'> & { tc_id: string }

/** Compare parsed cases with what the tracker holds. */
export function diffCases(cases: CaseInput[], existing: Existing[]) {
  const byId = new Map(existing.map((e) => [e.tc_id, e]))
  const fields = ['title', 'area_id', 'priority', 'preconditions', 'steps', 'test_data', 'expected', 'test_type'] as const
  return cases.map((c) => {
    const e = c.tc_id ? byId.get(c.tc_id) : undefined
    if (!e) return { case: c, status: 'new' as const, changed: [] as string[] }
    const changed = fields.filter((f) => (e[f] ?? null) !== (c[f] ?? null))
    return { case: c, status: changed.length ? ('updated' as const) : ('unchanged' as const), changed: changed as string[] }
  })
}

/** Next free ids after `maxNumber`, e.g. TC_FN_932, TC_FN_933. */
export function nextIds(maxNumber: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `TC_FN_${String(maxNumber + 1 + i).padStart(3, '0')}`)
}
