import { RELEASE_TABS, Tabs, sprintTabs } from '@/components/tabs'
import { SubmitButton } from '@/components/submit-button'
import { PageHeader } from '@/components/ui'
import { createClient } from '@/lib/supabase/server'
import { fmtDate } from '@/lib/data'
import { setTaskStatus } from '../actions'

const STATUS = { not_started: 'Not started', in_progress: 'In progress', blocked: 'Blocked', done: 'Done' } as const

export default async function PlanPage() {
  const supabase = await createClient()
  const { data: tasks } = await supabase.from('plan_tasks').select('*').order('num')
  const today = new Date().toISOString().slice(0, 10)
  const done = (tasks ?? []).filter((t) => t.status === 'done').length
  return (
    <>
      <PageHeader title="Release" sub={`${done} of ${tasks?.length ?? 0} tasks done. Status changes save at once.`} />
      <Tabs items={RELEASE_TABS} active="plan" />
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>#</th><th>Phase</th><th>Task</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead>
          <tbody>
            {(tasks ?? []).map((t) => {
              const late = t.status !== 'done' && t.due_on < today
              return (
                <tr key={t.id}>
                  <td className="tabular-nums">{t.num}</td>
                  <td className="whitespace-nowrap text-xs text-[var(--muted)]">{t.phase}</td>
                  <td>{t.title}</td>
                  <td className="whitespace-nowrap">{t.owner_label}</td>
                  <td className={`whitespace-nowrap ${late ? 'font-medium text-[var(--crit)]' : ''}`}>{fmtDate(t.due_on)}{late ? ' · late' : ''}</td>
                  <td>
                    <form action={setTaskStatus} className="flex gap-1">
                      <input type="hidden" name="task_id" value={t.id} />
                      <select name="status" defaultValue={t.status} className="select">
                        {Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <SubmitButton primary small>Save</SubmitButton>
                    </form>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
