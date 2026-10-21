'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { readRemembered, useRememberKey, writeRemembered } from '@/components/remember'
import { SearchInput } from '@/components/search-input'
import { toast } from '@/components/toast'
import { GridCharts, type ChartData, type ChartSpec } from './grid-charts'
import { exportCsv, exportXlsx } from './export'

export type Option = { value: string; label: string }
export type Column<T> = {
  key: string
  header: string
  width?: number
  /** Plain value for sorting, filtering and CSV. */
  value: (row: T) => string | number | null
  render?: (row: T) => React.ReactNode
  /** Sort by this instead of the shown value (e.g. Critical before High). */
  sortValue?: (row: T) => number | string
  /** Makes the cell editable; `field` is the patch key sent to onSave. */
  edit?: { field: string; kind: 'text' } | { field: string; kind: 'select'; options: Option[] }
  /** "values" filters by ticking values (default for selects and short lists); "text" by typing. */
  filter?: 'values' | 'text' | false
  mono?: boolean
  align?: 'right'
  muted?: boolean
}
export type BulkField = { field: string; label: string; options: Option[] }
export type BulkAction = { label: string; run: (ids: string[]) => Promise<{ error?: string }>; confirm?: string }

type Props<T extends { id: string }> = {
  rows: T[]
  columns: Column<T>[]
  onSave?: (ids: string[], patch: Record<string, string | null>) => Promise<{ error?: string }>
  bulkFields?: BulkField[]
  bulkActions?: BulkAction[]
  csvName?: string
  /** Controls placed after the search box (scope selects and the like). */
  toolbar?: React.ReactNode
  /** The page's own buttons, always at the right end of the toolbar. */
  actions?: React.ReactNode
  defaultSort?: { key: string; dir: 1 | -1 }[]
  /** Column filters to start with, e.g. from a link like /tickets?view=grid&state=new. */
  defaultFilters?: Record<string, string[]>
  searchPlaceholder?: string
  emptyText?: string
  selectable?: boolean
  footerNote?: string
  /** Small bar charts above the grid, one per column key; clicking a bar filters that column. */
  charts?: ChartSpec[]
  /** Keep this person's search, filters and sort for next time (off when a link opened the grid with filters of its own). */
  remember?: boolean
  /** Told the rows on show, in order, whenever they change (e.g. for Previous / Next on a detail page). */
  onView?: (rows: T[]) => void
}

type Sort = { key: string; dir: 1 | -1 }
type Filter = { kind: 'text'; q: string } | { kind: 'values'; values: string[] }

const EMPTY = '(blank)'

/**
 * The app's one grid: search, funnel filter per column, multi-column sort ("then by"), row
 * density from the profile menu, arrow-key navigation, inline edit (Enter/double-click),
 * shift-click range select with bulk edits, CSV export. Edits show at once and roll back if the
 * server refuses them.
 */
export function DataGrid<T extends { id: string }>({
  rows, columns, onSave, bulkFields = [], bulkActions = [], csvName = 'export', toolbar, actions,
  defaultSort = [], defaultFilters, searchPlaceholder = 'Search', emptyText = 'No rows.', selectable = true, footerNote, charts, remember = true, onView,
}: Props<T>) {
  const [overrides, setOverrides] = useState<Record<string, Record<string, string | null>>>({})
  const [filters, setFilters] = useState<Record<string, Filter>>(() =>
    Object.fromEntries(Object.entries(defaultFilters ?? {}).map(([k, values]) => [k, { kind: 'values' as const, values }])))
  const [query, setQuery] = useState('')
  const [sorts, setSorts] = useState<Sort[]>(defaultSort)
  // Each person's filters and sort come back next visit, until they clear them. The search box
  // starts empty: a remembered search left people looking at one row with no idea why.
  const keep = remember && !defaultFilters
  const rememberKey = useRememberKey(`grid:${csvName}`)
  const restored = useRef(false)
  useEffect(() => {
    if (!keep) return
    const saved = readRemembered<{ filters?: Record<string, Filter>; sorts?: Sort[] }>(rememberKey)
    if (saved?.filters) setFilters(saved.filters)
    if (saved?.sorts?.length) setSorts(saved.sorts)
    restored.current = true
  }, [keep, rememberKey])
  useEffect(() => {
    if (keep && restored.current) writeRemembered(rememberKey, { filters, sorts })
  }, [keep, rememberKey, filters, sorts])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<number | null>(null)
  const [active, setActive] = useState<{ r: number; c: number } | null>(null)
  const [editing, setEditing] = useState<{ r: number; c: number; value: string } | null>(null)
  const [openFilter, setOpenFilter] = useState<string | null>(null)
  const setMessage = (m: { tone: 'ok' | 'error'; text: string }) => toast(m.text, m.tone)
  const [busy, setBusy] = useState(false)
  const [limit, setLimit] = useState(300)
  const gridRef = useRef<HTMLDivElement>(null)
  const [showCharts, setShowCharts] = useState(true)
  const [exportOpen, setExportOpen] = useState(false)
  useEffect(() => {
    try { if (localStorage.getItem(`grid-charts:${csvName}`) === 'hidden') setShowCharts(false) } catch {}
  }, [csvName])
  function toggleCharts() {
    setShowCharts((v) => {
      try { localStorage.setItem(`grid-charts:${csvName}`, v ? 'hidden' : 'shown') } catch {}
      return !v
    })
  }

  useEffect(() => setOverrides({}), [rows])

  const cellValue = useCallback(
    (row: T, col: Column<T>): string | number | null => {
      const o = col.edit ? overrides[row.id]?.[col.edit.field] : undefined
      if (o !== undefined && col.edit?.kind === 'select') return col.edit.options.find((x) => x.value === o)?.label ?? o
      return o !== undefined ? o : col.value(row)
    },
    [overrides],
  )

  const filterKind = useCallback((c: Column<T>): 'values' | 'text' | false => {
    if (c.filter !== undefined) return c.filter
    if (c.edit?.kind === 'select') return 'values'
    const distinct = new Set(rows.slice(0, 2000).map((r) => String(c.value(r) ?? ''))).size
    return distinct <= 30 ? 'values' : 'text'
  }, [rows])

  /** Whether a row passes the search and every column filter (optionally ignoring one column's). */
  const matches = useCallback((r: T, except?: string) => {
    const q = query.trim().toLowerCase()
    return columns.every((c) => {
      if (c.key === except) return true
      const f = filters[c.key]
      if (!f) return true
      const v = String(cellValue(r, c) ?? '')
      return f.kind === 'values' ? f.values.includes(v || EMPTY) : v.toLowerCase().includes(f.q.toLowerCase())
    }) && (!q || columns.some((c) => String(cellValue(r, c) ?? '').toLowerCase().includes(q)))
  }, [columns, filters, query, cellValue])

  // Each chart counts the rows that pass every other filter, so clicking its own bars never empties it.
  const chartData: ChartData[] = useMemo(() => (charts ?? []).map((spec) => {
    const col = columns.find((c) => c.key === spec.key)
    if (!col) return { spec, bars: [], total: 0, selected: [] }
    const counts = new Map<string, number>()
    let total = 0
    for (const r of rows) {
      if (!matches(r, spec.key)) continue
      const v = String(cellValue(r, col) ?? '') || EMPTY
      counts.set(v, (counts.get(v) ?? 0) + 1)
      total++
    }
    let bars = [...counts.entries()].map(([label, count]) => ({ label, count }))
    bars = spec.order
      ? bars.sort((a, b) => (spec.order!.indexOf(a.label) + 1 || 99) - (spec.order!.indexOf(b.label) + 1 || 99))
      : bars.sort((a, b) => b.count - a.count)
    const top = spec.top ?? 8
    if (bars.length > top) {
      const rest = bars.slice(top - 1).reduce((s, b) => s + b.count, 0)
      bars = [...bars.slice(0, top - 1), { label: `Other (${bars.length - top + 1})`, count: rest }]
    }
    const f = filters[spec.key]
    return { spec, bars, total, selected: f?.kind === 'values' ? f.values : [] }
  }), [charts, columns, rows, matches, cellValue, filters])

  function toggleChartValue(key: string, value: string) {
    if (value.startsWith('Other (')) return
    setFilters((x) => {
      const f = x[key]
      const cur = f?.kind === 'values' ? f.values : []
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
      const n = { ...x }
      if (next.length) n[key] = { kind: 'values', values: next }
      else delete n[key]
      return n
    })
  }

  const view = useMemo(() => {
    let out = rows.filter((r) => matches(r))
    const active = sorts.map((s) => ({ s, col: columns.find((c) => c.key === s.key) })).filter((x) => x.col)
    if (active.length) {
      out = [...out].sort((a, b) => {
        for (const { s, col } of active) {
          const x = col!.sortValue ? col!.sortValue(a) : cellValue(a, col!), y = col!.sortValue ? col!.sortValue(b) : cellValue(b, col!)
          if (x === y) continue
          if (x === null || x === '') return 1
          if (y === null || y === '') return -1
          const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })
          if (d) return d * s.dir
        }
        return 0
      })
    }
    return out
  }, [rows, columns, sorts, cellValue, matches])

  const shown = view.slice(0, limit)
  const onViewRef = useRef(onView)
  onViewRef.current = onView
  useEffect(() => { onViewRef.current?.(view) }, [view])

  async function save(ids: string[], patch: Record<string, string | null>, label: string) {
    if (!onSave) return
    const before = overrides
    setOverrides((o) => {
      const next = { ...o }
      for (const id of ids) next[id] = { ...next[id], ...patch }
      return next
    })
    setBusy(true)
    const res = await onSave(ids, patch)
    setBusy(false)
    if (res.error) {
      setOverrides(before)
      setMessage({ tone: 'error', text: res.error })
    } else setMessage({ tone: 'ok', text: label })
  }

  const rawValue = (row: T, col: Column<T>) => {
    if (!col.edit) return ''
    const o = overrides[row.id]?.[col.edit.field]
    if (o !== undefined) return o ?? ''
    return col.edit.kind === 'select'
      ? col.edit.options.find((x) => x.label === String(col.value(row) ?? ''))?.value ?? ''
      : String(col.value(row) ?? '')
  }

  function startEdit(r: number, c: number, initial?: string) {
    const col = columns[c]
    if (!col?.edit || !onSave) return
    setEditing({ r, c, value: initial ?? rawValue(shown[r], col) })
  }

  function commitEdit(value: string) {
    if (!editing) return
    const col = columns[editing.c]
    const row = shown[editing.r]
    setEditing(null)
    gridRef.current?.focus()
    if (!col.edit || value === rawValue(row, col)) return
    if (col.edit.kind === 'text' && value.trim().length < 2) {
      setMessage({ tone: 'error', text: `${col.header} can't be that short` })
      return
    }
    void save([row.id], { [col.edit.field]: value === '' ? null : value }, `${col.header} saved`)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (editing || !active || openFilter) return
    const maxR = shown.length - 1, maxC = columns.length - 1
    const move = (r: number, c: number) => { e.preventDefault(); setActive({ r: Math.max(0, Math.min(maxR, r)), c: Math.max(0, Math.min(maxC, c)) }) }
    if (e.key === 'ArrowDown') move(active.r + 1, active.c)
    else if (e.key === 'ArrowUp') move(active.r - 1, active.c)
    else if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) move(active.r, active.c + 1)
    else if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) move(active.r, active.c - 1)
    else if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit(active.r, active.c) }
    else if (e.key === ' ' && selectable) { e.preventDefault(); toggle(shown[active.r].id, active.r, e.shiftKey) }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && columns[active.c]?.edit?.kind === 'text') startEdit(active.r, active.c, e.key)
  }

  useEffect(() => {
    if (!active) return
    gridRef.current?.querySelector<HTMLElement>(`[data-cell="${active.r}-${active.c}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active])

  function toggle(id: string, index: number, range: boolean) {
    setSelected((s) => {
      const next = new Set(s)
      if (range && anchor !== null) {
        const [a, b] = [Math.min(anchor, index), Math.max(anchor, index)]
        for (let i = a; i <= b; i++) next.add(shown[i].id)
      } else if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setAnchor(index)
  }

  function clickHeader(key: string, add: boolean) {
    setSorts((s) => {
      const i = s.findIndex((x) => x.key === key)
      if (add) {
        if (i < 0) return [...s, { key, dir: 1 }]
        return s.map((x, j) => (j === i ? { ...x, dir: (x.dir * -1) as 1 | -1 } : x))
      }
      if (i === 0 && s.length === 1) return s[0].dir === 1 ? [{ key, dir: -1 }] : []
      return [{ key, dir: 1 }]
    })
  }

  function exportAs(kind: 'csv' | 'xlsx') {
    setExportOpen(false)
    const cols = columns.map((c) => ({ header: c.header, width: c.width, numeric: c.align === 'right' }))
    const data = view.map((r) => columns.map((c) => cellValue(r, c)))
    const name = `${csvName}-${new Date().toISOString().slice(0, 10)}`
    if (kind === 'csv') exportCsv(name, cols, data)
    else exportXlsx(name, cols, data).catch(() => toast('The Excel file could not be built. Try CSV.', 'error'))
  }

  const ids = [...selected]
  const allShownSelected = shown.length > 0 && shown.every((r) => selected.has(r.id))
  const activeFilters = Object.keys(filters).length
  const colHeader = (key: string) => columns.find((c) => c.key === key)?.header ?? key

  return (
    <div className="flex min-h-0 flex-col">
      {/* Toolbar: search and scope on the left, the page's buttons on the right. */}
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <SearchInput value={query} onChange={setQuery} placeholder={searchPlaceholder} label="Search" className="w-64" />
        {toolbar}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {actions}
          {charts && charts.length > 0 && (
            <button type="button" onClick={toggleCharts} className="btn" aria-pressed={!showCharts}>{showCharts ? 'Hide charts' : 'Show charts'}</button>
          )}
          <div className="relative">
            <button type="button" onClick={() => setExportOpen((v) => !v)} aria-expanded={exportOpen} className="btn">Export ▾</button>
            {exportOpen && (
              <div role="menu" className="absolute right-0 z-30 mt-1 w-56 border border-[var(--line)] bg-white py-1 shadow-[0_18px_44px_rgba(9,17,38,.24)]">
                <button type="button" role="menuitem" onClick={() => exportAs('xlsx')} className="block w-full px-3 py-2 text-left hover:bg-[var(--accent-soft)]">
                  <span className="block text-[13px] font-semibold">Excel (.xlsx)</span>
                  <span className="text-[11.5px] text-[var(--muted)]">Formatted, header frozen</span>
                </button>
                <button type="button" role="menuitem" onClick={() => exportAs('csv')} className="block w-full px-3 py-2 text-left hover:bg-[var(--accent-soft)]">
                  <span className="block text-[13px] font-semibold">CSV</span>
                  <span className="text-[11.5px] text-[var(--muted)]">Plain text, any tool</span>
                </button>
                <p className="border-t border-[var(--line-soft)] px-3 pt-1.5 pb-1 text-[11px] text-[var(--faint)]">Exports the {view.length} rows shown, with current filters and sort.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {charts && charts.length > 0 && showCharts && <GridCharts charts={chartData} onToggle={toggleChartValue} />}

      {/* Sort and filter summary, like "Sorted by Name ▲ × + then by…" */}
      <div className="flex flex-wrap items-center gap-1.5 pb-2 text-[12px] text-[var(--muted)]">
        <span>Sorted by</span>
        {sorts.length === 0 && <span className="text-[var(--faint)]">nothing</span>}
        {sorts.map((s, i) => (
          <span key={s.key} className="inline-flex h-6 items-center gap-1 border border-[var(--line)] bg-white px-2 text-[12px] font-semibold text-[var(--ink)]">
            {i > 0 && <span className="font-normal text-[var(--faint)]">then</span>}
            <button type="button" onClick={() => setSorts((x) => x.map((y) => (y.key === s.key ? { ...y, dir: (y.dir * -1) as 1 | -1 } : y)))} title="Reverse">
              {colHeader(s.key)} {s.dir === 1 ? '▲' : '▼'}
            </button>
            <button type="button" aria-label={`Stop sorting by ${colHeader(s.key)}`} onClick={() => setSorts((x) => x.filter((y) => y.key !== s.key))} className="text-[var(--faint)] hover:text-[var(--crit)]">×</button>
          </span>
        ))}
        <select value="" onChange={(e) => { const k = e.target.value; if (k) setSorts((x) => [...x.filter((y) => y.key !== k), { key: k, dir: 1 }]) }}
          className="h-6 border border-dashed border-[var(--line)] bg-transparent px-1.5 text-[12px] text-[var(--muted)]" aria-label="Add a sort">
          <option value="">{sorts.length ? '+ then by…' : '+ sort by…'}</option>
          {columns.filter((c) => !sorts.some((s) => s.key === c.key)).map((c) => <option key={c.key} value={c.key}>{c.header}</option>)}
        </select>
        {activeFilters > 0 && (
          <>
            <span className="ml-3">Filtered by</span>
            {Object.entries(filters).map(([k, f]) => (
              <span key={k} className="inline-flex h-6 items-center gap-1 border border-[var(--accent-line)] bg-[var(--accent-soft)] px-2 font-semibold text-[var(--navy)]">
                {colHeader(k)}: {f.kind === 'text' ? `“${f.q}”` : f.values.length === 1 ? f.values[0] : `${f.values.length} values`}
                <button type="button" aria-label={`Clear ${colHeader(k)} filter`} onClick={() => setFilters((x) => { const n = { ...x }; delete n[k]; return n })}>×</button>
              </span>
            ))}
            <button type="button" onClick={() => setFilters({})} className="text-[var(--accent)] hover:underline">Clear all</button>
          </>
        )}
      </div>

      {ids.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border border-b-0 border-[var(--accent-line)] bg-[var(--accent-soft)] px-3 py-2">
          <span className="text-[12.5px] font-semibold text-[var(--navy)]">{ids.length} selected</span>
          {bulkFields.map((f) => (
            <select key={f.field} defaultValue="" disabled={busy} className="select" aria-label={f.label}
              onChange={(e) => {
                const v = e.target.value
                e.target.value = ''
                if (!v) return
                const label = f.options.find((o) => o.value === v)?.label ?? v
                void save(ids, { [f.field]: v === '__none' ? null : v }, `${f.label}: ${label} on ${ids.length} rows`)
              }}>
              <option value="">{f.label}…</option>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ))}
          {bulkActions.map((a) => (
            <button key={a.label} type="button" disabled={busy} className="btn"
              onClick={async () => {
                if (a.confirm && !window.confirm(a.confirm.replace('{n}', String(ids.length)))) return
                setBusy(true)
                const res = await a.run(ids)
                setBusy(false)
                setMessage(res.error ? { tone: 'error', text: res.error } : { tone: 'ok', text: `${a.label}: ${ids.length} rows` })
                if (!res.error) setSelected(new Set())
              }}>
              {a.label}
            </button>
          ))}
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-[12.5px] text-[var(--navy)] hover:underline">Clear selection</button>
        </div>
      )}


      <div ref={gridRef} tabIndex={0} onKeyDown={onKeyDown} role="grid" aria-rowcount={view.length}
        className="grid-scroll overflow-auto border border-[var(--line)] bg-white outline-none">
        <table className="table grid-table" style={{ minWidth: columns.reduce((s, c) => s + (c.width ?? 140), selectable ? 40 : 0) }}>
          <thead className="sticky top-0 z-10">
            <tr>
              {selectable && (
                <th className="w-9">
                  <input type="checkbox" aria-label="Select all shown" checked={allShownSelected}
                    onChange={() => setSelected(allShownSelected ? new Set() : new Set(shown.map((r) => r.id)))} />
                </th>
              )}
              {columns.map((c) => {
                const fk = filterKind(c)
                const s = sorts.findIndex((x) => x.key === c.key)
                return (
                  <th key={c.key} style={{ width: c.width }} className={`relative ${c.align === 'right' ? 'text-right' : ''}`}>
                    <span className="inline-flex items-center gap-1">
                      <button type="button" className="hover:text-[var(--navy)]" title="Sort (shift-click to add)"
                        onClick={(e) => clickHeader(c.key, e.shiftKey)}>
                        {c.header}
                      </button>
                      {fk && (
                        <button type="button" aria-label={`Filter ${c.header}`} onClick={() => setOpenFilter(openFilter === c.key ? null : c.key)}
                          className={`px-0.5 text-[10px] ${filters[c.key] ? 'text-[var(--navy)]' : 'text-[var(--faint)] hover:text-[var(--navy)]'}`}>
                          {filters[c.key] ? '▼' : '▽'}
                        </button>
                      )}
                      {s >= 0 && <span className="text-[10px] text-[var(--navy)]">{sorts[s].dir === 1 ? '▲' : '▼'}{sorts.length > 1 ? s + 1 : ''}</span>}
                      {c.edit && onSave && <span className="text-[10px] text-[var(--faint)]" title="Editable">✎</span>}
                    </span>
                    {openFilter === c.key && fk && (
                      <FilterPopover
                        kind={fk}
                        values={[...new Set(rows.map((r) => String(cellValue(r, c) ?? '') || EMPTY))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))}
                        current={filters[c.key]}
                        onChange={(f) => setFilters((x) => { const n = { ...x }; if (f) n[c.key] = f; else delete n[c.key]; return n })}
                        onClose={() => setOpenFilter(null)}
                      />
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, r) => (
              <tr key={row.id} className={selected.has(row.id) ? 'is-selected' : ''}>
                {selectable && (
                  <td className="w-9">
                    <input type="checkbox" aria-label="Select row" checked={selected.has(row.id)}
                      onChange={(e) => toggle(row.id, r, (e.nativeEvent as MouseEvent).shiftKey)} />
                  </td>
                )}
                {columns.map((col, c) => {
                  const isActive = active?.r === r && active?.c === c
                  const isEditing = editing?.r === r && editing?.c === c
                  const edited = col.edit && overrides[row.id]?.[col.edit.field] !== undefined
                  return (
                    <td key={col.key} data-cell={`${r}-${c}`}
                      title={isEditing ? undefined : String(cellValue(row, col) ?? '')}
                      onClick={() => setActive({ r, c })}
                      onDoubleClick={() => startEdit(r, c)}
                      className={`${col.align === 'right' ? 'text-right tabular-nums' : ''} ${col.mono ? 'mono text-[12px]' : ''} ${col.muted ? 'text-[var(--faint)]' : ''} ${
                        col.edit && onSave ? 'cursor-cell' : ''} ${isActive ? 'shadow-[inset_0_0_0_2px_var(--navy)]' : ''} ${edited ? 'bg-[var(--warn-soft)]' : ''}`}>
                      {isEditing && col.edit ? (
                        col.edit.kind === 'select' ? (
                          <select autoFocus defaultValue={editing.value} className="select h-7 w-full"
                            onChange={(e) => commitEdit(e.target.value)} onBlur={() => setEditing(null)}
                            onKeyDown={(e) => { if (e.key === 'Escape') { setEditing(null); gridRef.current?.focus() } }}>
                            {col.edit.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        ) : (
                          <input autoFocus defaultValue={editing.value} className="input h-7 w-full"
                            onBlur={(e) => commitEdit(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitEdit((e.target as HTMLInputElement).value)
                              if (e.key === 'Escape') { setEditing(null); gridRef.current?.focus() }
                            }} />
                        )
                      ) : col.render && !edited ? col.render(row) : (cellValue(row, col) ?? <span className="text-[var(--faint)]">—</span>)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {view.length === 0 && <p className="p-8 text-center text-[13px] text-[var(--muted)]">{emptyText}</p>}
        {view.length > limit && (
          <div className="p-3 text-center">
            <button type="button" onClick={() => setLimit((l) => l + 500)} className="btn">Show {Math.min(500, view.length - limit)} more</button>
          </div>
        )}
      </div>
      <p className="pt-2 text-[11.5px] text-[var(--muted)]">
        Showing {Math.min(view.length, limit)} of {rows.length}
        {(query || activeFilters > 0) && view.length < rows.length && <>
          {' · '}
          <button type="button" onClick={() => { setQuery(''); setFilters({}) }} className="font-semibold text-[var(--accent)] hover:underline">Clear search and filters</button>
        </>}
        {footerNote ? ` · ${footerNote}` : ''}
        {onSave ? ' · Click a cell, arrow keys to move, Enter to edit ✎ columns, Esc to cancel. Shift-click a header to sort by more than one column.' : ''}
      </p>
    </div>
  )
}

function FilterPopover({ kind, values, current, onChange, onClose }: {
  kind: 'values' | 'text'
  values: string[]
  current?: Filter
  onChange: (f: Filter | null) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [find, setFind] = useState('')
  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [onClose])
  const picked = current?.kind === 'values' ? new Set(current.values) : null
  const list = values.filter((v) => v.toLowerCase().includes(find.toLowerCase()))
  return (
    <div ref={ref} className="absolute top-full left-0 z-30 mt-1 w-64 border border-[var(--line)] bg-white p-2 text-left font-normal shadow-[0_18px_44px_rgba(9,17,38,.24)]">
      {kind === 'text' ? (
        <input autoFocus defaultValue={current?.kind === 'text' ? current.q : ''} placeholder="Contains…" className="input w-full"
          onChange={(e) => onChange(e.target.value ? { kind: 'text', q: e.target.value } : null)}
          onKeyDown={(e) => { if (e.key === 'Enter') onClose() }} />
      ) : (
        <>
          {values.length > 8 && <input autoFocus value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a value" className="input mb-1.5 w-full" />}
          <div className="max-h-60 overflow-auto">
            {list.map((v) => (
              <label key={v} className="flex cursor-pointer items-center gap-2 px-1 py-1 text-[12.5px] hover:bg-[var(--surface-3)]">
                <input type="checkbox" checked={picked ? picked.has(v) : false}
                  onChange={(e) => {
                    const next = new Set(picked ?? [])
                    if (e.target.checked) next.add(v)
                    else next.delete(v)
                    onChange(next.size ? { kind: 'values', values: [...next] } : null)
                  }} />
                <span className={v === EMPTY ? 'text-[var(--faint)]' : ''}>{v}</span>
              </label>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between border-t border-[var(--line-soft)] pt-1.5 text-[12px]">
            <button type="button" className="text-[var(--accent)] hover:underline" onClick={() => onChange({ kind: 'values', values: list })}>Select all</button>
            <button type="button" className="text-[var(--muted)] hover:underline" onClick={() => onChange(null)}>Clear</button>
          </div>
        </>
      )}
    </div>
  )
}
