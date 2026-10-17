import { SubmitButton } from '@/components/submit-button'
import { saveSprint } from '../actions'
import type { Area, Sprint } from '@/lib/data'

/** Create or edit a sprint: dates, goal and which Framework areas it covers. */
export function SprintForm({ areas, sprint, selected }: { areas: Area[]; sprint?: Sprint; selected?: Set<string> }) {
  const zones = [...new Set(areas.map((a) => a.zone))]
  return (
    <form action={saveSprint} className="space-y-4">
      <input type="hidden" name="id" value={sprint?.id ?? ''} />
      <input type="hidden" name="back" value={sprint ? `/sprints/${sprint.id}` : '/sprints'} />
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block text-sm">Name<input name="name" required defaultValue={sprint?.name} className="input mt-1 w-full" placeholder="S12" /></label>
        <label className="block text-sm">Starts<input name="starts_on" type="date" required defaultValue={sprint?.starts_on} className="input mt-1 w-full" /></label>
        <label className="block text-sm">Ends<input name="ends_on" type="date" required defaultValue={sprint?.ends_on} className="input mt-1 w-full" /></label>
        <label className="block text-sm">Goal<input name="goal" defaultValue={sprint?.goal ?? ''} className="input mt-1 w-full" /></label>
      </div>
      <fieldset>
        <legend className="label">Framework areas in this sprint</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {zones.map((z) => (
            <div key={z}>
              <div className="text-sm font-medium">{z}</div>
              {areas.filter((a) => a.zone === z).map((a) => (
                <label key={a.id} className="mt-1 flex items-center gap-2 text-sm">
                  <input type="checkbox" name="area_id" value={a.id} defaultChecked={selected?.has(a.id)} />
                  {a.page}
                </label>
              ))}
            </div>
          ))}
        </div>
      </fieldset>
      <SubmitButton primary>{sprint ? 'Save sprint' : 'Create sprint'}</SubmitButton>
    </form>
  )
}
