'use client'

export type ExportColumn = { header: string; width?: number; numeric?: boolean }

function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function exportCsv(name: string, columns: ExportColumn[], rows: (string | number | null)[][]) {
  const esc = (v: unknown) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
  }
  const lines = [columns.map((c) => esc(c.header)).join(','), ...rows.map((r) => r.map(esc).join(','))]
  // The BOM makes Excel read the file as UTF-8 (names with accents, the · separator).
  download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${name}.csv`)
}

/**
 * A formatted workbook: bold shaded header, first row frozen, filters on the header, numbers stored
 * as numbers and right-aligned, sensible column widths. exceljs loads only when someone exports.
 */
export async function exportXlsx(name: string, columns: ExportColumn[], rows: (string | number | null)[][]) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.created = new Date()
  const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = columns.map((c) => ({
    header: c.header,
    width: Math.min(60, Math.max(10, Math.round((c.width ?? 140) / 7))),
    style: c.numeric ? { alignment: { horizontal: 'right' } } : {},
  }))
  for (const r of rows) ws.addRow(r.map((v, i) => (columns[i].numeric && v !== null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v ?? '')))
  const head = ws.getRow(1)
  head.font = { bold: true, color: { argb: 'FF0F1B33' } }
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDF1F7' } }
  head.border = { bottom: { style: 'thin', color: { argb: 'FFC6CFDF' } } }
  head.alignment = { vertical: 'middle' }
  columns.forEach((c, i) => { if (c.numeric) head.getCell(i + 1).alignment = { horizontal: 'right', vertical: 'middle' } })
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }
  const buf = await wb.xlsx.writeBuffer()
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${name}.xlsx`)
}
