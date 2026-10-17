import 'server-only'
import type ExcelJS from 'exceljs'

type Cell = ExcelJS.CellValue
export function cellText(v: Cell): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('').trim()
    if ('result' in v) return cellText(v.result as Cell)
    if ('text' in v) return String(v.text).trim()
    return ''
  }
  return String(v).trim()
}

/**
 * Records from the sheet that holds test cases: the first sheet whose header row has one of
 * `titleHeaders`. The widest such row is the header (side tables repeat headers in narrower rows).
 */
export async function xlsxRecords(buf: ArrayBuffer, titleHeaders: string[]): Promise<{ sheet: string; rows: Record<string, string>[]; rowNumbers: number[] } | null> {
  // Loaded on demand: exceljs is large and only the import page needs it.
  const { default: Excel } = await import('exceljs')
  const wb = new Excel.Workbook()
  await wb.xlsx.load(buf)
  const wanted = titleHeaders.map((h) => h.toLowerCase())
  for (const ws of wb.worksheets) {
    let headerRow = 0
    let headers: string[] = []
    let width = 0
    ws.eachRow((row, n) => {
      const vals = (row.values as Cell[]).map(cellText)
      const filled = vals.filter(Boolean).length
      if (vals.some((v) => wanted.includes(v.toLowerCase())) && filled > width) {
        headerRow = n
        headers = vals
        width = filled
      }
    })
    if (!headerRow) continue
    const rows: Record<string, string>[] = []
    const rowNumbers: number[] = []
    ws.eachRow((row, n) => {
      if (n <= headerRow) return
      const vals = (row.values as Cell[]).map(cellText)
      const rec: Record<string, string> = {}
      headers.forEach((h, i) => { if (h && rec[h] === undefined) rec[h] = vals[i] ?? '' })
      rows.push(rec)
      rowNumbers.push(n)
    })
    return { sheet: ws.name, rows, rowNumbers }
  }
  return null
}
