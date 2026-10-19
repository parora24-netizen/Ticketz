import { redirect } from 'next/navigation'

/** Standup runs from the sprint board now (Run standup there). */
export default function StandupPage() {
  redirect('/sprint')
}
