// Build + download a report result set as CSV. `buildCsv` is pure and
// dependency-free so it can be unit-checked (see reportCsv.selfcheck.ts);
// `downloadCsv` is the thin browser side-effect.

export interface CsvColumn {
  label: string
  fieldname: string
  fieldtype?: string
}

// RFC-4180 field escaping: quote when the value holds a delimiter, quote, or
// newline; double any interior quotes.
function esc(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function buildCsv(
  columns: CsvColumn[],
  rows: Record<string, unknown>[],
  format?: (value: unknown, fieldtype: string) => string,
): string {
  const fmt = format ?? ((v) => (v == null ? '' : String(v)))
  const head = columns.map((c) => esc(c.label)).join(',')
  const body = rows.map((r) => columns.map((c) => esc(fmt(r[c.fieldname], c.fieldtype ?? ''))).join(','))
  return [head, ...body].join('\r\n')
}

export function downloadCsv(filename: string, csv: string): void {
  // Leading BOM so Excel/Sheets open the file as UTF-8.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.toLowerCase().endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
