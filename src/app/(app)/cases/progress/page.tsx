import { PageHeader } from '@/components/ui'
import { CASES_TABS, Tabs } from '@/components/tabs'
import { getMe } from '@/lib/auth'
import { fmtDate, loadAreas, loadCases, loadPeople } from '@/lib/data'
import { pageProgress } from '@/lib/progress'
import { mismatch } from '@/lib/workflow/case-stage'
import { ProgressGrid } from './progress-grid'

/**
 * Where test cases stand, as the workbook's Dashboard tells it: ① write the cases (by page, by
 * writer, against the due date), ② automate them, ③ test by hand what automation does not cover.
 */
export default async function ProgressPage() {
  const [me, areas, cases, people] = await Promise.all([getMe(), loadAreas(), loadCases(), loadPeople()])
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)
  const name = new Map(people.map((p) => [p.id, p.name]))
  const pages = pageProgress(areas, cases, today).map((p) => ({ ...p, writer: p.owner_id ? name.get(p.owner_id) ?? 'Someone' : '' }))
  const inRelease = new Set(pages.map((p) => p.id))
  const mine = cases.filter((c) => inRelease.has(c.area_id))
  const team = people.filter((p) => p.active && p.role !== 'dev').map((p) => ({ value: p.id, label: p.name }))
  return (
    <>
      <Tabs items={CASES_TABS} active="progress" />
      <PageHeader sub={`${mine.length.toLocaleString()} cases across ${pages.length} pages · as of ${fmtDate(today)} · click a part of a card to filter the pages`} />
      <ProgressGrid pages={pages} team={team} isLead={me.role === 'lead'} meId={me.id} today={today}
        mismatches={mine.filter((c) => mismatch(c.auto_result, c.manual_result)).length}
        skipped={mine.filter((c) => c.auto_result === 'skipped').length} />
    </>
  )
}
