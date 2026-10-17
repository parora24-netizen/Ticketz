'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type Option = { value: string; label: string }
export type Column<T> = {
  key: string
  header: string
  width?: number
  /** Plain value for sorting, filtering and CSV. */
  value: (row: T) => string | number | null
  render?: (row: T) => React.ReactNode
  /** Makes the cell editable; `field` is the patch key sent to onSave. */
  edit?: { field: string; kind: 'text' } | { field: string; kind: 'select'; options: Option[] }
  mono?: boolean
  align?: 'right'
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
  toolbar?: React.ReactNode
  emptyText?: string
}

type Sort = { key: string; dir: 1 | -1 } | null

/**
 * A spreadsheet-like grid: sort and filter per column, arrow keys to move, Enter or typing to
 * edit, Escape to cancel, shift-click to select a range, bulk edits on the selection, CSV export.
 * Edits show at once and roll back if the server refuses them.
 */
export function DataGrid<T extends { id: string }>({ rows, columns, onSave, bulkFields = [], bulkActions = [], csvName = 'export', toolbar, emptyText = 'No rows.' }: Props<T>) {
  const [overrides, setOverrides] = useState<Record<string, Record<string, string | null>>>({})
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<number | null>(null)
  const [active, setActive] = useState<{ r: number; c: number } | null>(null)
  const [editing, setEditing] = useState<{ r: number; c: number; value: string } | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [limit, setLimit] = useState(300)
  const gridRef = useRef<HTMLDivElement>(null)

  // Fresh server data replaces local edits.
  useEffect(() => setOverrides({}), [rows])
  useEffect(() => {
    if (message?.tone !== 'ok') return
    const t = setTimeout(() => setMessage(null), 3000)
    return () => clearTimeout(t)
  }, [message])

  const cellValue = useCallback(
    (row: T, col: Column<T>) => {
      const o = col.edit ? overrides[row.id]?.[col.edit.field] : undefined
      if (o !== undefined && col.edit?.kind === 'select') return col.edit.options.find((x) => x.value === o)?.label ?? o
      return o !== undefined ? o : col.value(row)
    },
    [overrides],
  )

  const view = useMemo(() => {
    const q = query.trim().toLowerCase()
    let out = rows.filter((r) =>
      columns.every((c) => {
        const f = filters[c.key]
        if (!f) return true
        const v = String(cellValue(r, c) ?? '')
        return c.edit?.kind === 'select' ? v === f : v.toLowerCase().includes(f.toLowerCase())
      }) && (!q || columns.some((c) => String(cellValue(r, c) ?? '').toLowerCase().includes(q))),
    )
    if (sort) {
      const col = columns.find((c) => c.key === sort.key)
      if (col) {
        out = [...out].sort((a, b) => {
          const x = cellValue(a, col), y = cellValue(b, col)
          if (x === y) return 0
          if (x === null || x === '') return 1
          if (y === null || y === '') return -1
          return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sort.dir
        })
      }
    }
    return out
  }, [rows, columns, filters, query, sort, cellValue])

  const shown = view.slice(0, limit)

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

  function startEdit(r: number, c: number, initial?: string) {
    const col = columns[c]
    if (!col?.edit || !onSave) return
    const row = shown[r]
    const current = overrides[row.id]?.[col.edit.field] ?? (col.edit.kind === 'select'
      ? col.edit.options.find((o) => o.label === String(col.value(row) ?? ''))?.value ?? ''
      : String(col.value(row) ?? ''))
    setEditing({ r, c, value: initial ?? String(current ?? '') })
  }

  function commitEdit(value: string) {
    if (!editing) return
    const col = columns[editing.c]
    const row = shown[editing.r]
    setEditing(null)
    gridRef.current?.focus()
    if (!col.edit) return
    const old = overrides[row.id]?.[col.edit.field]
    const oldValue = old !== undefined ? old : col.edit.kind === 'select'
      ? col.edit.options.find((o) => o.label === String(col.value(row) ?? ''))?.value ?? ''
      : String(col.value(row) ?? '')
    if (value === oldValue) return
    if (col.edit.kind === 'text' && value.trim().length < 3) {
      setMessage({ tone: 'error', text: `${col.header} needs at least 3 characters` })
      return
    }
    void save([row.id], { [col.edit.field]: value === '' ? null : value }, `${col.header} saved`)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (editing || !active) return
    const maxR = shown.length - 1, maxC = columns.length - 1
    const move = (r: number, c: number) => { e.preventDefault(); setActive({ r: Math.max(0, Math.min(maxR, r)), c: Math.max(0, Math.min(maxC, c)) }) }
    if (e.key === 'ArrowDown') move(active.r + 1, active.c)
    else if (e.key === 'ArrowUp') move(active.r - 1, active.c)
    else if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) move(active.r, active.c + 1)
    else if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) move(active.r, active.c - 1)
    else if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit(active.r, active.c) }
    else if (e.key === ' ' ) { e.preventDefault(); toggle(shown[active.r].id, active.r, e.shiftKey) }
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

  const allShownSelected = shown.length > 0 && shown.every((r) => selected.has(r.id))

  function exportCsv() {
    const esc = (v: unknown) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
    }
    const lines = [columns.map((c) => esc(c.header)).join(','), ...view.map((r) => columns.map((c) => esc(cellValue(r, c))).join(','))]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${csvName}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const ids = [...selected]
  return (
    <div className="card flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-3 py-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all columns" className="input w-56" />
        {toolbar}
        <span className="mono ml-auto text-[11px] text-[var(--faint)]">{view.length} of {rows.length} rows</span>
        <button type="button" onClick={exportCsv} className="btn">Export CSV</button>
      </div>

      {ids.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--accent-line)] bg-[var(--accent-soft)] px-3 py-2">
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

      {message && (
        <div role={message.tone === 'error' ? 'alert' : 'status'}
          className={`px-3 py-1.5 text-[12.5px] ${message.tone === 'error' ? 'bg-[var(--crit-soft)] text-[var(--crit)]' : 'bg-[var(--good-soft)] text-[var(--good)]'}`}>
          {message.tone === 'ok' ? '✓ ' : ''}{message.text}
        </div>
      )}

      <div ref={gridRef} tabIndex={0} onKeyDown={onKeyDown} className="max-h-[70vh] overflow-auto outline-none" role="grid" aria-rowcount={view.length}>
        <table className="table" style={{ minWidth: columns.reduce((s, c) => s + (c.width ?? 140), 40) }}>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-9">
                <input type="checkbox" aria-label="Select all shown" checked={allShownSelected}
                  onChange={() => setSelected(allShownSelected ? new Set() : new Set(shown.map((r) => r.id)))} />
              </th>
              {columns.map((c) => (
                <th key={c.key} style={{ width: c.width }} className={c.align === 'right' ? 'text-right' : ''}>
                  <button type="button" className="inline-flex items-center gap-1 hover:text-[var(--navy)]"
                    onClick={() => setSort((s) => (s?.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 }))}>
                    {c.header}{c.edit && <span className="text-[var(--faint)]" title="Editable">✎</span>}
                    {sort?.key === c.key && <span aria-hidden>{sort.dir === 1 ? '▲' : '▼'}</span>}
                  </button>
                </th>
              ))}
            </tr>
            <tr>
              <th className="bg-[var(--surface-3)]" />
              {columns.map((c) => (
                <th key={c.key} className="bg-[var(--surface-3)] py-1 font-normal">
                  {c.edit?.kind === 'select' ? (
                    <select value={filters[c.key] ?? ''} onChange={(e) => setFilters((f) => ({ ...f, [c.key]: e.target.value }))}
                      className="select h-7 w-full text-[11.5px]" aria-label={`Filter ${c.header}`}>
                      <option value="">All</option>
                      {c.edit.options.map((o) => <option key={o.value} value={o.label}>{o.label}</option>)}
                    </select>
                  ) : (
                    <input value={filters[c.key] ?? ''} onChange={(e) => setFilters((f) => ({ ...f, [c.key]: e.target.value }))}
                      className="input h-7 w-full text-[11.5px]" placeholder="Filter" aria-label={`Filter ${c.header}`} />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, r) => (
              <tr key={row.id} className={selected.has(row.id) ? 'bg-[var(--accent-soft)]' : ''}>
                <td className="w-9">
                  <input type="checkbox" aria-label="Select row" checked={selected.has(row.id)}
                    onChange={(e) => toggle(row.id, r, (e.nativeEvent as MouseEvent).shiftKey)} />
                </td>
                {columns.map((col, c) => {
                  const isActive = active?.r === r && active?.c === c
                  const isEditing = editing?.r === r && editing?.c === c
                  const edited = col.edit && overrides[row.id]?.[col.edit.field] !== undefined
                  return (
                    <td key={col.key} data-cell={`${r}-${c}`}
                      onClick={() => setActive({ r, c })}
                      onDoubleClick={() => startEdit(r, c)}
                      className={`${col.align === 'right' ? 'text-right tabular-nums' : ''} ${col.mono ? 'mono text-[12px]' : ''} ${col.edit && onSave ? 'cursor-cell' : ''} ${
                        isActive ? 'shadow-[inset_0_0_0_2px_var(--navy)]' : ''} ${edited ? 'bg-[var(--warn-soft)]' : ''}`}>
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
      {onSave && <p className="border-t border-[var(--line)] px-3 py-1.5 text-[11px] text-[var(--faint)]">Click a cell, then use the arrow keys. Enter or double-click edits ✎ columns; Escape cancels. Shift-click selects a range.</p>}
    </div>
  )
}
