import { PlanGrid } from '@/components/grid/list-grids'
import { RELEASE_TABS, Tabs } from '@/components/tabs'
import { PageHeader } from '@/components/ui'
import { loadTasks } from '@/lib/data'

export default async function PlanPage() {
  const tasks = await loadTasks()
  const today = new Date().toISOString().slice(0, 10)
  const done = tasks.filter((t) => t.status === 'done').length
  const late = tasks.filter((t) => t.status !== 'done' && t.due_on < today).length
  return (
    <>
      <Tabs items={RELEASE_TABS} active="plan" />
      <PageHeader sub={`${done} of ${tasks.length} tasks done${late ? ` · ${late} late` : ''}. Change a status in the grid; it saves at once.`} />
      <PlanGrid rows={tasks.map((t) => ({
        id: t.id, num: t.num, phase: t.phase, title: t.title, owner: t.owner_label, due_on: t.due_on, status: t.status,
        late: t.status !== 'done' && t.due_on < today,
      }))} />
    </>
  )
}
