/**
 * The plan pairs each test sprint with the fix sprint after it: what T3 finds is fixed in F4.
 * Pages are tested in a test sprint and fixed in the fix sprint that follows it.
 */
type S = { id: string; name: string; kind: string; status: string }

/** The fix sprint after a test sprint (T3 -> F4), if it exists and has not closed. */
export function fixSprintAfter<T extends S>(test: S | undefined | null, sprints: T[]): T | null {
  const n = test && test.kind === 'test' && /^T\d+$/.test(test.name) ? Number(test.name.slice(1)) : NaN
  if (!Number.isFinite(n)) return null
  return sprints.find((s) => s.kind === 'fix' && s.name === `F${n + 1}` && s.status !== 'closed') ?? null
}

/** Where a page's tickets are fixed: after the open test sprint that tests the page. */
export function fixSprintForArea<T extends S>(areaId: string | null | undefined, sprints: T[], sprintAreas: { sprint_id: string; area_id: string }[]): T | null {
  if (!areaId) return null
  const test = sprintAreas.filter((x) => x.area_id === areaId)
    .map((x) => sprints.find((s) => s.id === x.sprint_id))
    .find((s) => s?.kind === 'test' && s.status !== 'closed')
  return fixSprintAfter(test, sprints)
}
