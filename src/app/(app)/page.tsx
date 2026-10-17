import Link from 'next/link'
import { CaseLink, PriorityChip, TicketLink } from '@/components/ui'
import { getMe } from '@/lib/auth'
import {
  currentSprint, daysUntil, fmtDate, loadActivity, loadCases, loadSprintAreas, loadSprintRuns, loadSprints, loadTasks, loadTickets,
  timeAgo, toStageInput, type TicketRow,
} from '@/lib/data'
import { lastWorkingDayStart } from '@/lib/standup'
import { caseStage, needsTicket } from '@/lib/workflow/case-stage'
import { sprintGate } from '@/lib/workflow/sprint-gate'
import { STATE_LABEL } from '@/lib/workflow/ticket-machine'

const SEV = ['Critical', 'High', 'Medium', 'Low']
const bySeverity = (a: TicketRow, b: TicketRow) => SEV.indexOf(a.severity) - SEV.indexOf(b.severity)

function Panel({ title, count, href, children, empty }: { title: string; count?: number; href?: string; children: React.ReactNode; empty?: string }) {
  return (
    <section className="card">
      <header className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
        <h2 className="text-[14px] font-semibold text-[var(--navy-ink)]">
          {title}{count !== undefined && <span className="mono ml-2 text-[11px] font-normal text-[var(--faint)]">{count}</span>}
        </h2>
        {href && <Link href={href} className="text-[12px] text-[var(--accent)] hover:underline">Open</Link>}
      </header>
      {count === 0 && empty ? <p className="px-4 py-4 text-[12.5px] text-[var(--muted)]">{empty}</p> : children}
    </section>
  )
}

function TicketRows({ rows, note }: { rows: TicketRow[]; note?: (t: TicketRow) => string }) {
  return (
    <ul className="divide-y divide-[var(--row)]">
      {rows.slice(0, 12).map((t) => (
        <li key={t.id} className="flex items-center gap-3 px-4 py-2">
          <TicketLink k={t.key} />
          <span className="min-w-0 flex-1 truncate text-[12.5px]">{t.title}</span>
          {note && <span className="text-[11.5px] text-[var(--faint)]">{note(t)}</span>}
          <PriorityChip p={t.severity} />
        </li>
      ))}
      {rows.length > 12 && <li className="px-4 py-2 text-[12px] text-[var(--muted)]">+{rows.length - 12} more</li>}
    </ul>
  )
}

export default async function Home() {
  const me = await getMe()
  const now = new Date()
  const since = lastWorkingDayStart(now)
  const [tickets, sprints, sprintAreas, tasks, activity] = await Promise.all([
    loadTickets(), loadSprints(), loadSprintAreas(), loadTasks(), loadActivity(since, 300),
  ])
  const sprint = currentSprint(sprints)
  const areaIds = sprint ? sprintAreas.filter((x) => x.sprint_id === sprint.id).map((x) => x.area_id) : []
  const [cases, runs] = sprint ? await Promise.all([loadCases(areaIds), loadSprintRuns(sprint.id)]) : [[], undefined]
  const caseIds = new Set(cases.map((c) => c.id))
  const gate = sprint ? sprintGate(cases.map((c) => toStageInput(c, runs)), tickets.filter((t) => (t.case_id && caseIds.has(t.case_id)) || t.current_sprint_id === sprint.id)) : null
  const stages = cases.map((c) => caseStage(toStageInput(c, runs)))
  const left = stages.filter((s) => s !== 'done').length

  const mine = tickets.filter((t) => t.owner_id === me.id)
  const myTasks = tasks.filter((k) => k.owner_id === me.id && k.status !== 'done')
  const retests = tickets.filter((t) => t.state === 'ready_for_retest').sort(bySeverity)
  const manualDue = cases.filter((c, i) => stages[i] === 'manual').sort((a, b) => SEV.indexOf(a.priority) - SEV.indexOf(b.priority))
  const untracked = cases.filter((c) => needsTicket(toStageInput(c, runs)))
  const toTriage = tickets.filter((t) => t.state === 'new').sort(bySeverity)
  const unownedHigh = tickets.filter((t) => !t.owner_id && ['Critical', 'High'].includes(t.severity) && !['closed', 'deferred', 'duplicate'].includes(t.state))
  const late = tasks.filter((k) => k.status !== 'done' && k.due_on < now.toISOString().slice(0, 10))
  const feed = activity.filter((a) => (me.role === 'lead' ? true : a.subject_owner_id === me.id || a.actor_id === me.id)).slice(0, 25)

  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(now))
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label">{new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }).format(now)}</p>
          <h2 className="mt-1 text-[22px] font-semibold text-[var(--navy-ink)]">{greeting}, {me.name.split(' ')[0]}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/standup" className="btn">Run standup</Link>
          {sprint && me.role !== 'dev' && <Link href={`/sprints/${sprint.id}`} className="btn btn-primary">Record results</Link>}
        </div>
      </div>

      {sprint && gate && (
        <Link href={`/sprints/${sprint.id}`} className="card mb-5 flex flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3 hover:border-[var(--navy)]">
          <div>
            <div className="label">Current sprint</div>
            <div className="mt-0.5 text-[15px] font-semibold text-[var(--navy-ink)]">{sprint.name} · {fmtDate(sprint.starts_on)} to {fmtDate(sprint.ends_on)}</div>
          </div>
          <div><div className="label">Days left</div><div className="heading mt-0.5 text-[18px] font-semibold">{Math.max(daysUntil(sprint.ends_on), 0)}</div></div>
          <div><div className="label">Cases left</div><div className="heading mt-0.5 text-[18px] font-semibold">{left} <span className="text-[12px] font-normal text-[var(--faint)]">of {cases.length}</span></div></div>
          <div className="flex gap-1.5">
            {gate.checks.map((c) => (
              <span key={c.label} title={`${c.label}: ${c.detail}`}
                className={`chip ${c.ok ? 'border-[var(--good-line)] bg-[var(--good-soft)] text-[var(--good)]' : 'border-[var(--line-soft)] bg-[var(--surface-2)] text-[var(--muted)]'}`}>
                {c.ok ? '✓' : '•'} {c.label}
              </span>
            ))}
          </div>
        </Link>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {me.role === 'dev' && (
            <>
              <Panel title="Reopened, needs another fix" count={mine.filter((t) => t.state === 'reopened').length} href="/tickets?view=grid" empty="Nothing bounced back.">
                <TicketRows rows={mine.filter((t) => t.state === 'reopened').sort(bySeverity)} />
              </Panel>
              <Panel title="My fixes in progress" count={mine.filter((t) => t.state === 'in_fix').length} empty="Nothing in fix. Pick up a triaged ticket below.">
                <TicketRows rows={mine.filter((t) => t.state === 'in_fix').sort(bySeverity)} note={(t) => `updated ${timeAgo(t.updated_at)}`} />
              </Panel>
              <Panel title="Assigned, not started" count={mine.filter((t) => ['new', 'triaged'].includes(t.state)).length} empty="Nothing waiting to start.">
                <TicketRows rows={mine.filter((t) => ['new', 'triaged'].includes(t.state)).sort(bySeverity)} />
              </Panel>
              <Panel title="Waiting on QA retest" count={mine.filter((t) => t.state === 'ready_for_retest').length} empty="None of your fixes are waiting.">
                <TicketRows rows={mine.filter((t) => t.state === 'ready_for_retest')} note={(t) => t.fixed_in_build ? `build ${t.fixed_in_build}` : ''} />
              </Panel>
            </>
          )}
          {me.role !== 'dev' && (
            <>
              {me.role === 'lead' && (
                <Panel title="To triage" count={toTriage.length} href="/tickets?view=grid" empty="Nothing new to triage.">
                  <TicketRows rows={toTriage} note={(t) => (t.owner_name ? t.owner_name : 'unowned')} />
                </Panel>
              )}
              {me.role === 'lead' && unownedHigh.length > 0 && (
                <Panel title="Critical and High without an owner" count={unownedHigh.length} href="/tickets?view=grid">
                  <TicketRows rows={unownedHigh.sort(bySeverity)} note={(t) => STATE_LABEL[t.state]} />
                </Panel>
              )}
              <Panel title="Retest queue" count={retests.length} href="/tickets" empty="Nothing ready for retest.">
                <TicketRows rows={retests} note={(t) => [t.owner_name, t.fixed_in_build && `build ${t.fixed_in_build}`].filter(Boolean).join(' · ')} />
              </Panel>
              {sprint && (
                <Panel title={`Manual tests due in ${sprint.name}`} count={manualDue.length} href={`/cases?sprint=${sprint.id}&stage=manual`} empty="No manual tests waiting.">
                  <ul className="divide-y divide-[var(--row)]">
                    {manualDue.slice(0, 10).map((c) => (
                      <li key={c.id} className="flex items-center gap-3 px-4 py-2">
                        <CaseLink tcId={c.tc_id} />
                        <span className="min-w-0 flex-1 truncate text-[12.5px]">{c.title}</span>
                        <PriorityChip p={c.priority} />
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
              {untracked.length > 0 && (
                <Panel title="Failures without a ticket" count={untracked.length}>
                  <div className="flex flex-wrap gap-2 px-4 py-3">{untracked.map((c) => <CaseLink key={c.id} tcId={c.tc_id} />)}</div>
                </Panel>
              )}
            </>
          )}
          <Panel title="My plan tasks" count={myTasks.length} href="/plan" empty="No open plan tasks.">
            <ul className="divide-y divide-[var(--row)]">
              {myTasks.map((k) => (
                <li key={k.id} className="flex items-center gap-3 px-4 py-2 text-[12.5px]">
                  <span className="mono text-[11px] text-[var(--faint)]">#{k.num}</span>
                  <span className="min-w-0 flex-1 truncate">{k.title}</span>
                  <span className={k.due_on < now.toISOString().slice(0, 10) ? 'font-semibold text-[var(--crit)]' : 'text-[var(--faint)]'}>due {fmtDate(k.due_on)}</span>
                  <span className="text-[11.5px] text-[var(--muted)]">{k.status.replace('_', ' ')}</span>
                </li>
              ))}
            </ul>
          </Panel>
          {me.role === 'lead' && late.length > 0 && (
            <Panel title="Late plan tasks (team)" count={late.length} href="/plan">
              <ul className="divide-y divide-[var(--row)]">
                {late.map((k) => (
                  <li key={k.id} className="flex items-center gap-3 px-4 py-2 text-[12.5px]">
                    <span className="mono text-[11px] text-[var(--faint)]">#{k.num}</span>
                    <span className="min-w-0 flex-1 truncate">{k.title}</span>
                    <span>{k.owner_label}</span>
                    <span className="font-semibold text-[var(--crit)]">due {fmtDate(k.due_on)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <aside>
          <Panel title={me.role === 'lead' ? 'Team activity since yesterday' : 'Since yesterday'} count={feed.length} empty="Nothing has moved yet.">
            <ol className="divide-y divide-[var(--row)]">
              {feed.map((a, i) => (
                <li key={`${a.ref}-${a.at}-${i}`} className="px-4 py-2 text-[12.5px]">
                  <div className="flex items-center gap-2">
                    {a.kind === 'ticket' || a.kind === 'comment' ? <TicketLink k={a.ref} /> : a.kind === 'task' ? <span className="mono text-[12px]">{a.ref}</span> : <CaseLink tcId={a.ref} />}
                    <span className="ml-auto text-[11px] text-[var(--faint)]">{timeAgo(a.at, now)}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[var(--ink-2)]">{a.what.replaceAll('_', ' ')}</div>
                  {a.kind === 'comment' && a.detail && <div className="mt-0.5 line-clamp-2 text-[var(--muted)]">“{a.detail}”</div>}
                </li>
              ))}
            </ol>
          </Panel>
          <p className="mt-3 text-[11.5px] text-[var(--faint)]">
            Since {fmtDate(since.toISOString())} (the last working day). <Link href="/release" className="text-[var(--accent)] hover:underline">Release overview</Link>
          </p>
        </aside>
      </div>
      {mine.length === 0 && me.role === 'dev' && <p className="mt-4 text-[12.5px] text-[var(--muted)]">Nothing is assigned to you yet. <Link href="/tickets" className="text-[var(--accent)] hover:underline">Open the board</Link> to pick something up.</p>}
    </>
  )
}
