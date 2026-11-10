import { NextResponse, type NextRequest } from 'next/server'
import { sendDigests } from '@/lib/email'

/**
 * The weekday morning digest, called by Vercel Cron (vercel.json) with CRON_SECRET as a bearer
 * token. Sends nothing while email is off for the team, and at most one digest per person a day.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Not allowed' }, { status: 401 })
  return NextResponse.json(await sendDigests())
}
