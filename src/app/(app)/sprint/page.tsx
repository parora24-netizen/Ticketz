import { redirect } from 'next/navigation'
import { currentSprint, loadSprints } from '@/lib/data'
import { sprintHref } from '@/lib/links'

/** "Sprint" in the nav always means the one running now. */
export default async function SprintNow() {
  const sprints = await loadSprints()
  const now = currentSprint(sprints) ?? sprints.find((s) => s.status === 'planned' && s.kind !== 'fix')
  redirect(now ? sprintHref(now) : '/sprints')
}
