'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getMe } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/data'
import { OPTIONAL_FIELDS, diffCases, holdUnlabelledDuplicates, nextIds, parseCases, parseCsv, parseTsv, type CaseInput, type Existing, type OptionalField } from '@/lib/import-cases'
import { xlsxRecords } from '@/lib/xlsx-records'

export type PreviewRow = {
  row: number | null
  tc_id: string | null
  title: string
  area: string
  priority: string
  status: 'new' | 'updated' | 'unchanged'
  changed: string[]
}
export type ImportState = {
  error?: string
  source?: string
  rows?: PreviewRow[]
  errors?: { row: number; message: string }[]
  counts?: { new: number; updated: number; unchanged: number }
  payload?: string // the cases to save, sent back on confirm
  done?: { added: number; updated: number; firstNewId?: string }
}

const MAX_FILE = 8 * 1024 * 1024

/** Step 1: read the upload or the pasted cells and show what would change. Saves nothing. */
export async function previewImport(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const me = await getMe()
  if (me.role === 'dev') return { error: 'Only QA or the lead import test cases' }
  const file = formData.get('file')
  const pasted = String(formData.get('pasted') ?? '').trim()

  let records: Record<string, string>[] = []
  let rowNumbers: number[] | undefined
  let source = ''
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE) return { error: 'That file is over 8 MB' }
    const name = file.name.toLowerCase()
    if (name.endsWith('.xlsx')) {
      const r = await xlsxRecords(await file.arrayBuffer(), ['Test Case Title', 'Title', 'Test Case ID'])
      if (!r) return { error: 'No sheet with a "Test Case Title" or "Test Case ID" header was found' }
      records = r.rows
      rowNumbers = r.rowNumbers
      source = `${file.name} · sheet "${r.sheet}"`
    } else if (name.endsWith('.csv')) {
      records = parseCsv(await file.text())
      source = file.name
    } else return { error: 'Upload an .xlsx or .csv file' }
  } else if (pasted) {
    records = pasted.includes('\t') ? parseTsv(pasted) : parseCsv(pasted)
    source = 'Pasted cells'
  } else return { error: 'Choose a file or paste some rows' }
  if (!records.length) return { error: 'No rows found under the header row' }

  const supabase = await createClient()
  const { data: areas } = await supabase.from('areas').select('id, zone, page')
  const parsed = parseCases(records, areas ?? [], 2, rowNumbers)
  const { present } = parsed
  const existing = await fetchAll<Existing>((from, to) =>
    supabase.from('test_cases').select('tc_id, title, area_id, priority, preconditions, steps, test_data, expected, test_type').range(from, to),
  )
  const held = holdUnlabelledDuplicates(parsed.cases, existing)
  const errors = [...parsed.errors, ...held.errors].sort((a, b) => a.row - b.row)
  const diff = diffCases(held.cases, existing, present)
  const areaName = new Map((areas ?? []).map((a) => [a.id, `${a.zone} · ${a.page}`]))
  const counts = { new: 0, updated: 0, unchanged: 0 }
  for (const d of diff) counts[d.status]++
  return {
    source,
    errors,
    counts,
    rows: diff.map((d) => ({
      row: d.case.row ?? null,
      tc_id: d.case.tc_id,
      title: d.case.title,
      area: areaName.get(d.case.area_id) ?? '',
      priority: d.case.priority,
      status: d.status,
      changed: d.changed,
    })),
    payload: JSON.stringify({ present, cases: diff.filter((d) => d.status !== 'unchanged').map(({ case: { row: _row, ...c } }) => c) }),
  }
}

const CaseSchema = z.object({
  tc_id: z.string().regex(/^TC_[A-Z0-9_]+$/).nullable(),
  area_id: z.uuid(),
  zone: z.string(),
  page: z.string(),
  source_page: z.string(),
  title: z.string().min(1).max(300),
  preconditions: z.string().nullable(),
  steps: z.string().nullable(),
  test_data: z.string().nullable(),
  expected: z.string().nullable(),
  priority: z.enum(['Critical', 'High', 'Medium', 'Low']),
  test_type: z.string().nullable(),
})

/** Step 2: save the new and changed cases from the preview. Automation status and results are kept. */
export async function commitImport(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const me = await getMe()
  if (me.role === 'dev') return { error: 'Only QA or the lead import test cases' }
  let parsed: CaseInput[]
  let present: OptionalField[]
  try {
    const body = z.object({ present: z.array(z.enum(OPTIONAL_FIELDS)), cases: z.array(CaseSchema).max(5000) }).parse(JSON.parse(String(formData.get('payload') ?? '{}')))
    parsed = body.cases
    present = body.present
  } catch {
    return { error: 'The preview expired. Upload the file again.' }
  }
  if (!parsed.length) return { done: { added: 0, updated: 0 } }

  const supabase = await createClient()
  const ids = await fetchAll<{ tc_id: string }>((from, to) => supabase.from('test_cases').select('tc_id').range(from, to))
  const taken = new Set(ids.map((r) => r.tc_id))
  const maxFn = Math.max(0, ...ids.map((r) => Number(/^TC_FN_(\d+)$/.exec(r.tc_id)?.[1] ?? 0)))
  const fresh = nextIds(maxFn, parsed.filter((c) => !c.tc_id).length)

  // New and existing cases go in separate batches: one bulk upsert sends the same columns for
  // every row, and existing cases must keep their created_by.
  const now = new Date().toISOString()
  const toAdd: Record<string, unknown>[] = []
  const toUpdate: Record<string, unknown>[] = []
  for (const c of parsed) {
    const { zone: _z, page: _p, ...rest } = c
    const tc_id = c.tc_id ?? fresh.shift()!
    // Existing cases: only the columns the file had. Fields with no column keep their stored value.
    const keep = Object.fromEntries(Object.entries(rest).filter(([k]) => !(OPTIONAL_FIELDS as readonly string[]).includes(k) || present.includes(k as OptionalField)))
    if (taken.has(tc_id)) toUpdate.push({ ...keep, tc_id, updated_at: now })
    else toAdd.push({ ...rest, tc_id, updated_at: now, created_by: me.id })
  }
  for (const [batch, label] of [[toAdd, 'adding'], [toUpdate, 'updating']] as const) {
    for (let i = 0; i < batch.length; i += 300) {
      const { error } = await supabase.from('test_cases').upsert(batch.slice(i, i + 300), { onConflict: 'tc_id' })
      if (error) return { error: `Stopped while ${label} cases (${i} of ${batch.length} done): ${error.message}` }
    }
  }
  const added = toAdd.length
  const firstNewId = toAdd[0]?.tc_id as string | undefined
  revalidatePath('/', 'layout')
  return { done: { added, updated: toUpdate.length, firstNewId } }
}
