import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  LogbookResponse,
  LogbookDay,
  LogbookPlanItem,
  LogbookCompletedItem,
} from '@/lib/types';
import type { WebsiteBranding } from '@/lib/types';

export type LogbookFill = 'red' | 'green' | 'amber' | null;

export interface LogbookRow {
  date: string;
  plan: string;
  completed: string;
  fill: LogbookFill; // fill for the Completed cell
}

/** 'YYYY-MM-DD' -> 'Wed 08/07' (weekday + DD/MM). */
export function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' });
  const [, m, day] = iso.split('-');
  return `${wd} ${day}/${m}`;
}

function planText(items: LogbookPlanItem[]): string {
  if (!items.length) return '—';
  return items
    .map((i) => `• ${i.to_do} · ${i.project_name} · ${i.planned_minutes}m · due ${i.deadline ?? '—'}`)
    .join('\n');
}

function timingLabel(i: LogbookCompletedItem): string {
  if (i.late_days > 0) return `${i.late_days}d late`;
  if (i.early_days > 0) return `${i.early_days}d early`;
  return 'on-time';
}

function resultLabel(r: LogbookCompletedItem['result']): string {
  return r === 'approved' ? '✓ approved' : r === 'rejected' ? '✗ rejected' : '⏳ pending';
}

function completedText(items: LogbookCompletedItem[]): string {
  if (!items.length) return '—';
  return items
    .map((i) => `• ${i.to_do} · ${i.project_name} · ${resultLabel(i.result)} · ${timingLabel(i)}`)
    .join('\n');
}

/** Completed-cell fill, matching the printed legend: red dominates (any late or rejected),
 *  then green (any approved OR finished early), then amber (any pending), else null. */
export function completedFill(items: LogbookCompletedItem[]): LogbookFill {
  if (!items.length) return null;
  if (items.some((i) => i.result === 'rejected' || i.late_days > 0)) return 'red';
  if (items.some((i) => i.result === 'approved' || i.early_days > 0)) return 'green';
  if (items.some((i) => i.result === 'pending')) return 'amber';
  return null;
}

/** Pure: LogbookResponse -> one table row per day. Unit-tested. */
export function buildLogbookRows(res: LogbookResponse): LogbookRow[] {
  return res.days.map((day: LogbookDay) => ({
    date: shortDate(day.date),
    plan: planText(day.plan),
    completed: completedText(day.completed),
    fill: completedFill(day.completed),
  }));
}

const FILL_RGB: Record<Exclude<LogbookFill, null>, [number, number, number]> = {
  red: [254, 226, 226],
  green: [220, 252, 231],
  amber: [254, 243, 199],
};

async function toDataUrl(url: string): Promise<string> {
  const resp = await fetch(url);
  const blob = await resp.blob();
  return await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

/** Generate + download the logbook PDF. `generatedAtIso` is passed in (keeps builders pure). */
export async function downloadLogbookPdf(
  res: LogbookResponse,
  branding: WebsiteBranding | undefined,
  generatedAtIso: string,
): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const marginX = 40;
  let y = 40;

  // Logo (best-effort — never block the PDF on a missing/failed image).
  if (branding?.logoUrl) {
    try {
      const dataUrl = await toDataUrl(branding.logoUrl);
      doc.addImage(dataUrl, 'PNG', marginX, y - 12, 90, 30);
    } catch {
      /* no logo — fall through to text header */
    }
  }

  doc.setFontSize(16).setFont('helvetica', 'bold');
  doc.text(`${branding?.appName || 'Logbook'} — Logbook`, marginX + 100, y + 4);
  doc.setFontSize(10).setFont('helvetica', 'normal');
  y += 26;
  doc.text(
    `${res.full_name} · ${res.from_date} – ${res.to_date} · Generated ${new Date(generatedAtIso).toLocaleString()}`,
    marginX + 100,
    y,
  );

  y += 20;
  const s = res.summary;
  doc.text(
    `${s.planned_minutes}m planned · ${s.todos_done} done · ${s.on_time} on-time · ${s.late} late · ` +
      `${s.early} early · ${s.approved} approved · ${s.rejected} rejected · ${s.pending} pending · ` +
      `${s.points_earned} pts · ${Math.round(s.on_time_rate * 100)}% on-time`,
    marginX,
    y,
  );

  const rows = buildLogbookRows(res);
  autoTable(doc, {
    startY: y + 14,
    head: [['Date', 'Plan', 'Completed']],
    body: rows.map((r) => [r.date, r.plan, r.completed]),
    styles: { fontSize: 8, cellPadding: 4, valign: 'top' },
    headStyles: { fillColor: [30, 41, 59] },
    columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 320 }, 2: { cellWidth: 'auto' } },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 2) {
        const fill = rows[data.row.index]?.fill;
        if (fill) data.cell.styles.fillColor = FILL_RGB[fill];
      }
    },
  });

  // ponytail: as unknown cast — lastAutoTable not in jspdf-autotable types but set at runtime
  const legendY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
  doc.setFontSize(8);
  doc.text('Legend: green = early/approved · red = late/rejected · amber = pending review', marginX, legendY);

  doc.save(`logbook-${res.user}-${res.from_date}_${res.to_date}.pdf`);
}
