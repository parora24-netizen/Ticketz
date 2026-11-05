import { redirect } from 'next/navigation'

/** Status is the Release page itself now. */
export default function StatusPage() {
  redirect('/release')
}
