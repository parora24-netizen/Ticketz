import { redirect } from 'next/navigation'

/** The plan is edited in one place now: Release > Plan. */
export default function EditPlanPage() {
  redirect('/release/plan')
}
