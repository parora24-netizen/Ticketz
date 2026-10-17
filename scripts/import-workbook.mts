/**
 * Seeds the tracker from the 26.111 test workbook plus the plan doc.
 *
 *   npm run import -- "C:/path/26.111 Release Test Cases.xlsx"
 *
 * Reads .env.local (Supabase URL + secret key, LEAD_EMAIL). Safe to re-run:
 * areas, cases, sprints and tasks are upserted; tickets already in the tracker keep their state;
 * baseline results from the workbook are replaced, results recorded in the app are kept.
 */
import { config } from 'dotenv'
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'
import { SPRINTS, TASKS, TEAM } from './seed-data.mts'

config({ path: '.env.local' })

const BASELINE_RUN = 'workbook-baseline'
const BASELINE_AT = '2026-10-16T12:00:00Z'

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Set ${name} in .env.local`)
  return v
}

type Cell = ExcelJS.CellValue
function text(v: Cell): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('').trim()
    if ('result' in v) return text(v.result as Cell)
    if ('text' in v) return String(v.text).trim()
    return ''
  }
  return String(v).trim()
}

/** Rows of a sheet as objects keyed by the header row that contains `firstHeader`. */
function table(ws: ExcelJS.Worksheet, firstHeader: string): Record<string, string>[] {
  let headerRow = 0
  let headers: string[] = []
  let width = 0
  ws.eachRow((row, n) => {
    const vals = (row.values as Cell[]).map(text)
    // The widest row holding firstHeader is the main table's header. Side tables (e.g. "new
    // failures not yet logged" on Dev Tickets) repeat the same header in a narrower row.
    const filled = vals.filter(Boolean).length
    if (vals.includes(firstHeader) && filled > width) {
      headerRow = n
      headers = vals
      width = filled
    }
  })
  if (!headerRow) throw new Error(`No "${firstHeader}" header on ${ws.name}`)
  const out: Record<string, string>[] = []
  ws.eachRow((row, n) => {
    if (n <= headerRow) return
    const vals = (row.values as Cell[]).map(text)
    const rec: Record<string, string> = {}
    headers.forEach((h, i) => { if (h && rec[h] === undefined) rec[h] = vals[i] ?? '' })
    if (rec[firstHeader]) out.push(rec)
  })
  return out
}

/** Workbook pages like "Create-Database" or "Sign-on" belong to a Framework area. */
function areaPage(page: string): string {
  const p = page.trim()
  if (/^sign-?on$/i.test(p)) return 'Sign-On'
  if (/^create/i.test(p)) return 'Create'
  return p
}

const PRIORITIES = ['Critical', 'High', 'Medium', 'Low']
function priority(p: string): 'Critical' | 'High' | 'Medium' | 'Low' {
  const v = PRIORITIES.find((x) => x.toLowerCase() === p.trim().toLowerCase())
  return (v ?? 'Medium') as 'Critical' | 'High' | 'Medium' | 'Low'
}

function autoResult(v: string): 'passed' | 'failed' | 'skipped' | 'known_defect' | null {
  const s = v.toLowerCase()
  if (!s) return null
  if (s === 'passed') return 'passed'
  if (s === 'failed') return 'failed'
  if (s === 'skipped') return 'skipped'
  if (s.startsWith('known')) return 'known_defect'
  return null
}

function manualResult(v: string): { result: 'passed' | 'failed' | 'blocked'; note: string | null } | null {
  const s = v.trim().toLowerCase()
  if (!s) return null
  if (s === 'pass' || s === 'passed') return { result: 'passed', note: null }
  if (s === 'fail' || s === 'failed') return { result: 'failed', note: null }
  return { result: 'blocked', note: v.trim() }
}

async function main() {
  const file = process.argv[2]
  if (!file) throw new Error('Pass the workbook path: npm run import -- "<path to xlsx>"')
  const db = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), { auth: { persistSession: false } })
  /** Throws on a Supabase error; for reads, returns the rows. */
  const must = <T,>(r: { data: T | null; error: { message: string } | null }, what: string): NonNullable<T> => {
    if (r.error) throw new Error(`${what}: ${r.error.message}`)
    return r.data as NonNullable<T>
  }

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  const sheet = (name: string) => {
    const ws = wb.getWorksheet(name)
    if (!ws) throw new Error(`Sheet "${name}" not found`)
    return ws
  }

  // People: the lead who signs in first, plus the team by name (emails are added under Admin).
  const leadEmail = env('LEAD_EMAIL').toLowerCase()
  const existing = must(await db.from('people').select('id, name, email'), 'people')
  if (!existing.some((p) => p.email?.toLowerCase() === leadEmail)) {
    must(await db.from('people').insert({ name: process.env.LEAD_NAME || 'Lead', email: leadEmail, role: 'lead' }), 'lead')
  }
  const missing = TEAM.filter((t) => !existing.some((p) => p.name === t.name))
  if (missing.length) must(await db.from('people').insert(missing), 'team')
  const people = must(await db.from('people').select('id, name'), 'people')
  const personId = new Map(people.map((p) => [p.name.toLowerCase(), p.id as string]))

  // Areas from the Framework tab, in its order.
  const framework = table(sheet('Framework'), 'Zone')
  const areaRows = framework.map((r, i) => ({ zone: r['Zone'].trim(), page: r['Page'].trim(), sort: i + 1 }))
  must(await db.from('areas').upsert(areaRows, { onConflict: 'zone,page' }), 'areas')
  const areas = must(await db.from('areas').select('id, zone, page'), 'areas')
  const areaId = new Map(areas.map((a) => [`${a.zone} · ${a.page}`, a.id as string]))
  console.log(`areas: ${areas.length}`)

  // Test cases.
  const caseRows = table(sheet('Test Cases'), 'Test Case ID')
  const cases = caseRows.map((r) => {
    const zone = (r['Zone'] ?? r['Zone '] ?? '').trim()
    const key = `${zone} · ${areaPage(r['Page'])}`
    const area = areaId.get(key)
    if (!area) throw new Error(`${r['Test Case ID']}: no Framework area "${key}"`)
    const autoStatus = (r['Automation Status'] ?? '').trim()
    return {
      tc_id: r['Test Case ID'].trim().toUpperCase(),
      area_id: area,
      source_page: r['Page'].trim(),
      title: r['Test Case Title'],
      preconditions: r['Pre-Conditions'] || null,
      steps: r['Test Steps'] || null,
      test_data: r['Test Data'] || null,
      expected: r['Expected Result'] || null,
      priority: priority(r['Priority']),
      test_type: r['Test Type'] || null,
      automation: autoStatus && autoStatus !== 'Not run' ? 'automated' : 'not_automated',
      _auto: autoResult(r['Automated Result'] ?? r['Automated Result '] ?? ''),
      _manual: manualResult(r['Manual Result'] ?? ''),
    }
  })
  for (let i = 0; i < cases.length; i += 300) {
    const chunk = cases.slice(i, i + 300).map(({ _auto, _manual, ...c }) => c)
    must(await db.from('test_cases').upsert(chunk, { onConflict: 'tc_id' }), 'test_cases')
  }
  const caseIds = new Map<string, string>()
  for (let from = 0; ; from += 1000) {
    const page = must(await db.from('test_cases').select('id, tc_id').range(from, from + 999), 'test_cases')
    page.forEach((c) => caseIds.set(c.tc_id, c.id))
    if (page.length < 1000) break
  }
  console.log(`test cases: ${cases.length}`)

  // Baseline results from the workbook, replaced on every import.
  must(await db.from('test_runs').delete().eq('run_id', BASELINE_RUN), 'clear baseline')
  const runs = cases.flatMap((c) => {
    const id = caseIds.get(c.tc_id)!
    const out = []
    if (c._auto) out.push({ case_id: id, kind: 'auto', result: c._auto, run_id: BASELINE_RUN, recorded_at: BASELINE_AT })
    if (c._manual) out.push({ case_id: id, kind: 'manual', result: c._manual.result, note: c._manual.note, run_id: BASELINE_RUN, recorded_at: BASELINE_AT })
    return out
  })
  for (let i = 0; i < runs.length; i += 500) must(await db.from('test_runs').insert(runs.slice(i, i + 500)), 'test_runs')
  console.log(`baseline results: ${runs.length} (auto ${runs.filter((r) => r.kind === 'auto').length}, manual ${runs.filter((r) => r.kind === 'manual').length})`)

  // Sprints and their areas.
  for (const s of SPRINTS) {
    const row: { id: string } = must(
      await db.from('sprints').upsert({ name: s.name, starts_on: s.starts_on, ends_on: s.ends_on, goal: s.goal }, { onConflict: 'name' }).select('id').single(),
      `sprint ${s.name}`,
    )
    const ids = s.areas === 'all' ? [...areaId.values()] : s.areas.map((a) => {
      const id = areaId.get(a)
      if (!id) throw new Error(`Sprint ${s.name}: no area "${a}"`)
      return id
    })
    must(await db.from('sprint_areas').delete().eq('sprint_id', row.id), 'sprint_areas')
    must(await db.from('sprint_areas').insert(ids.map((area_id) => ({ sprint_id: row.id, area_id }))), 'sprint_areas')
  }
  console.log(`sprints: ${SPRINTS.length}`)

  // Tickets: dev failures and automation mismatches. Existing tickets are left as they are.
  const dev = table(sheet('Dev Tickets'), 'Ticket ID').filter((r) => r['Ticket ID'].startsWith('DEV-'))
  const mm = table(sheet('Test Mismatches'), 'Ticket ID').filter((r) => r['Ticket ID'].startsWith('MM-'))
  const tickets = [...dev.map((r) => ({ r, kind: 'defect' as const })), ...mm.map((r) => ({ r, kind: 'test_mismatch' as const }))].map(({ r, kind }) => {
    const tc = (r['Test Case ID'] ?? '').trim().toUpperCase()
    const owner = (r['Owner'] ?? '').trim().toLowerCase()
    const notes = [r['Error Type (when logged)'], r['Dev Notes'], r['Notes']].filter(Boolean).join('\n')
    return {
      key: r['Ticket ID'].trim(),
      kind,
      case_id: caseIds.get(tc) ?? null,
      title: r['Test Case Title'] || r['Ticket ID'],
      description: notes || null,
      severity: priority(r['Priority'] ?? ''),
      state: 'new',
      owner_id: owner ? personId.get(owner) ?? null : null,
      logged_on: r['Logged On'] || '2026-10-08',
    }
  })
  for (let i = 0; i < tickets.length; i += 200) {
    must(await db.from('tickets').upsert(tickets.slice(i, i + 200), { onConflict: 'key', ignoreDuplicates: true }), 'tickets')
  }
  console.log(`tickets: ${dev.length} defects, ${mm.length} test mismatches`)

  // Release plan tasks.
  must(
    await db.from('plan_tasks').upsert(
      TASKS.map(([phase, title, owner_label, due_on], i) => ({ num: i + 1, phase, title, owner_label, due_on })),
      { onConflict: 'num', ignoreDuplicates: true },
    ),
    'plan_tasks',
  )
  console.log(`plan tasks: ${TASKS.length}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
