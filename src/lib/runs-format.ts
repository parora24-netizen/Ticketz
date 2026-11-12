/** How runs read on the page: times in India time, durations as hours and minutes, how a run ended. */
export const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
export const hm = (min: number | null | undefined) => (min == null ? '—' : `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`)
export const secs = (ms: number | null | undefined) => (ms == null ? '—' : ms >= 60000 ? `${(ms / 60000).toFixed(1)} min` : `${(ms / 1000).toFixed(1)} s`)
export const EXIT: Record<string, { label: string; tone: 'good' | 'warn' | 'crit' | 'muted' | 'accent' }> = {
  finished: { label: 'Finished', tone: 'good' }, killed: { label: 'Killed', tone: 'crit' }, gave_up: { label: 'Gave up', tone: 'warn' }, refused: { label: 'Refused', tone: 'crit' },
}
