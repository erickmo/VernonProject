// Numeric helpers for the report grid: which columns read as numbers (right-align),
// which are additive (get a totals row), and how a number renders. Pure so the
// logic is unit-checked in reportFormat.selfcheck.ts.

export interface RptColumn {
  fieldname: string
  fieldtype: string
}

// Right-align + tabular-nums: any column the eye scans as a number.
export function numAlign(fieldtype: string): boolean {
  return /int|float|currency|percent|rating/i.test(fieldtype)
}

// Only money/count columns are summable — totalling percentages or ratings is meaningless.
export function isSummable(fieldtype: string): boolean {
  return /int|float|currency/i.test(fieldtype)
}

// Locale-grouped number rendering. Int → no decimals; percent → append %;
// float/currency → up to 2 decimals.
export function formatReportNumber(n: number, fieldtype: string): string {
  if (/int/i.test(fieldtype)) return n.toLocaleString('id-ID')
  if (/percent/i.test(fieldtype)) return `${n.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`
  return n.toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

// Column-wise sums over the full result set; columns with no numeric data are omitted.
export function columnTotals(
  columns: RptColumn[],
  rows: Record<string, unknown>[],
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const c of columns) {
    if (!isSummable(c.fieldtype)) continue
    let sum = 0
    let any = false
    for (const r of rows) {
      const v = r[c.fieldname]
      if (v == null || v === '') continue
      const n = Number(v)
      if (!Number.isNaN(n)) {
        sum += n
        any = true
      }
    }
    if (any) out[c.fieldname] = sum
  }
  return out
}
