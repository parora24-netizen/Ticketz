import { redirect } from 'next/navigation'

/** The task plan gave way to Release > Plan: sprints, milestones and each page's dates. */
export default function PlanPage() {
  redirect('/release/plan')
}
