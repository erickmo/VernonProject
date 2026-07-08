import jsPDF from 'jspdf';
import type {
  LogbookResponse,
  LogbookDay,
  LogbookPlanItem,
  LogbookCompletedItem,
} from '@/lib/types';

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

export interface PlanGroup {
  project: string;
  total: number; // total planned minutes for this project on the day
  items: LogbookPlanItem[];
}

/** Group a day's plan items by project, with a per-project planned-minutes total.
 *  Shared by the PDF and the on-screen plan column so both read the same way. */
export function groupPlanByProject(items: LogbookPlanItem[]): PlanGroup[] {
  const map = new Map<string, PlanGroup>();
  for (const i of items) {
    const project = i.project_name || i.project_detail || '—';
    let g = map.get(project);
    if (!g) {
      g = { project, total: 0, items: [] };
      map.set(project, g);
    }
    g.items.push(i);
    g.total += i.planned_minutes;
  }
  return [...map.values()];
}

function planText(items: LogbookPlanItem[]): string {
  if (!items.length) return '—';
  // Grouped by project: a "Project · Nm" header, then one indented line per todo.
  return groupPlanByProject(items)
    .map((g) => {
      const lines = g.items.map(
        (i) => `   - ${i.to_do} · ${i.planned_minutes}m · due ${i.deadline ?? '—'}`,
      );
      return `${g.project} · ${g.total}m\n${lines.join('\n')}`;
    })
    .join('\n');
}

function timingLabel(i: LogbookCompletedItem): string {
  if (i.late_days > 0) return `${i.late_days}d late`;
  if (i.early_days > 0) return `${i.early_days}d early`;
  return 'on-time';
}

function resultLabel(r: LogbookCompletedItem['result']): string {
  // jsPDF standard fonts are WinAnsi-only — ✓/✗/⏳ render as tofu. Plain word; the
  // Completed cell's color already encodes approved/rejected/pending.
  return r;
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

/** RGB for a single completed line, matching the legend: red (rejected OR late) dominates,
 *  then green (approved OR early), else amber (pending review). */
export function completedItemColor(item: LogbookCompletedItem): [number, number, number] {
  if (item.result === 'rejected' || item.late_days > 0) return [190, 40, 50];
  if (item.result === 'approved' || item.early_days > 0) return [16, 122, 87];
  return [180, 120, 10];
}

/** Per-day totals: planned minutes (self-planned), completed estimated minutes, and their
 *  ratio (done ÷ planned, null when nothing planned). Shared by the PDF and the screens. */
export function dayTotals(day: LogbookDay): { planned: number; doneEst: number; ratio: number | null } {
  const planned = day.plan.reduce((a, p) => a + p.planned_minutes, 0);
  const doneEst = day.completed.reduce((a, c) => a + c.estimated, 0);
  return { planned, doneEst, ratio: planned > 0 ? doneEst / planned : null };
}

/** Pure: LogbookResponse -> one table row per day. Text model + spec for the drawing path. */
export function buildLogbookRows(res: LogbookResponse): LogbookRow[] {
  return res.days.map((day: LogbookDay) => ({
    date: shortDate(day.date),
    plan: planText(day.plan),
    completed: completedText(day.completed),
    fill: completedFill(day.completed),
  }));
}

// ── Drawing ──────────────────────────────────────────────────────────────────

type RGB = readonly [number, number, number];
const P = {
  ink: [17, 24, 39],
  slate: [30, 41, 59],
  muted: [107, 114, 128],
  line: [226, 232, 240],
  tintBg: [248, 250, 252],
  green: [16, 122, 87],
  red: [190, 40, 50],
  amber: [180, 120, 10],
  brand: [37, 99, 235],
  white: [255, 255, 255],
  faint: [226, 232, 240],
} as const satisfies Record<string, RGB>;

/** Clock: circle + hour/minute hands. Vector-drawn — jsPDF fonts can't render a glyph. */
function drawClock(doc: jsPDF, cx: number, cy: number, r: number): void {
  doc.setDrawColor(107, 114, 128);
  doc.setLineWidth(0.6);
  doc.circle(cx, cy, r, 'S');
  doc.line(cx, cy, cx, cy - r * 0.6);
  doc.line(cx, cy, cx + r * 0.55, cy);
}

/** Calendar: rounded body, two binder tabs above, a header rule near the top. Vector-drawn. */
function drawCalendar(doc: jsPDF, x: number, y: number, s: number): void {
  doc.setDrawColor(107, 114, 128);
  doc.setLineWidth(0.6);
  doc.roundedRect(x, y, s, s * 0.85, 1, 1, 'S');
  doc.line(x + s * 0.3, y - 2, x + s * 0.3, y);
  doc.line(x + s * 0.7, y - 2, x + s * 0.7, y);
  doc.line(x, y + s * 0.25, x + s, y + s * 0.25);
}

export interface RenderOpts {
  appName?: string;
  logoDataUrl?: string;
  generatedAtIso: string;
}

// Layout constants (A4 landscape, pt).
const MARGIN = 36;
const HEADER_H = 64;
const DATE_W = 70;
const PLAN_W = 340;
const GROUP_LH = 11;
const TODO_LH = 9.5;
const META_LH = 11;
const COMP_LH = 9.5;
const ROW_PAD = 5;

interface DayLayout {
  date: string;
  groups: { header: string; items: { lines: string[]; pm: number; deadline: string | null }[] }[];
  completed: { lines: string[]; color: [number, number, number] }[];
  totals: { planned: number; doneEst: number; ratio: number | null };
  rowHeight: number;
}

/** Builds and returns the logbook PDF. All drawing lives here (no save). */
export function renderLogbookDoc(res: LogbookResponse, opts: RenderOpts): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - 2 * MARGIN;

  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const draw = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
  const txt = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);

  const xDate = MARGIN;
  const xPlan = xDate + DATE_W;
  const xCompleted = xPlan + PLAN_W;
  const completedW = pageW - MARGIN - xCompleted;
  const planInnerW = PLAN_W - 12;
  const completedInnerW = completedW - 12;

  const generatedStr = new Date(opts.generatedAtIso).toLocaleString();
  const appName = opts.appName || '';

  // ── Header band ──
  fill(P.slate);
  doc.rect(0, 0, pageW, HEADER_H, 'F');

  let titleX = MARGIN;
  if (opts.logoDataUrl) {
    try {
      const props = doc.getImageProperties(opts.logoDataUrl);
      const h = 30;
      const w = Math.min(90, (props.width / props.height) * h);
      doc.addImage(opts.logoDataUrl, props.fileType || 'PNG', MARGIN, 16, w, h);
      titleX = MARGIN + w + 14;
    } catch {
      /* bad/unsupported logo — text-only header */
    }
  }

  doc.setFont('helvetica', 'bold').setFontSize(20);
  txt(P.white);
  doc.text('LOGBOOK', titleX, 33);
  doc.setFont('helvetica', 'normal').setFontSize(10);
  txt(P.faint);
  doc.text(`${res.full_name}  ·  ${res.from_date} – ${res.to_date}`, titleX, 50);

  doc.setFontSize(8);
  doc.text(`Generated ${generatedStr}`, pageW - MARGIN, 26, { align: 'right' });
  if (appName) doc.text(appName, pageW - MARGIN, 38, { align: 'right' });

  // ── Statistics band ──
  const s = res.summary;
  const cards: [string, string, RGB][] = [
    ['Points', String(s.points_earned), P.ink],
    ['On-time', `${Math.round(s.on_time_rate * 100)}%`, P.ink],
    ['Done', String(s.todos_done), P.ink],
    ['Late', String(s.late), P.red],
    ['Early', String(s.early), P.green],
    ['Approved', String(s.approved), P.green],
    ['Rejected', String(s.rejected), P.red],
    ['Pending', String(s.pending), P.amber],
    ['Planned', `${s.planned_minutes}m`, P.ink],
  ];
  const gap = 6;
  const cardW = (contentW - gap * (cards.length - 1)) / cards.length;
  const cardY = HEADER_H + 18;
  const cardH = 40;
  cards.forEach(([label, value, color], i) => {
    const x = MARGIN + i * (cardW + gap);
    fill(P.tintBg);
    draw(P.line);
    doc.setLineWidth(0.6);
    doc.roundedRect(x, cardY, cardW, cardH, 4, 4, 'FD');
    const cx = x + cardW / 2;
    doc.setFont('helvetica', 'normal').setFontSize(7);
    txt(P.muted);
    doc.text(label.toUpperCase(), cx, cardY + 14, { align: 'center' });
    doc.setFont('helvetica', 'bold').setFontSize(12);
    txt(color);
    doc.text(value, cx, cardY + 31, { align: 'center' });
  });

  // ── Day table ──
  const tableTop = cardY + cardH + 16;
  const bottomLimit = pageH - 70;

  // Column-header row; returns the y just below it. Redrawn on every page.
  const columnHeader = (y: number): number => {
    fill(P.tintBg);
    doc.rect(MARGIN, y, contentW, 16, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(8.5);
    txt(P.muted);
    doc.text('DATE / TOTALS', xDate + 6, y + 11);
    doc.text('SELF PLANNED', xPlan + 6, y + 11);
    doc.text('COMPLETED', xCompleted + 6, y + 11);
    draw(P.line);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, y + 16, MARGIN + contentW, y + 16);
    return y + 16 + 4;
  };

  // Pre-compute each drawable day's wrapped lines + height once (font size 8 governs wrap).
  doc.setFontSize(8);
  const layouts: DayLayout[] = res.days
    .filter((d) => d.plan.length > 0 || d.completed.length > 0)
    .map((d) => {
      const groups = groupPlanByProject(d.plan).map((g) => ({
        header: `${g.project} · ${g.total}m`,
        items: g.items.map((i) => ({
          lines: doc.splitTextToSize(i.to_do, planInnerW) as string[],
          pm: i.planned_minutes,
          deadline: i.deadline,
        })),
      }));
      const completed = d.completed.map((i) => ({
        lines: doc.splitTextToSize(
          `${i.to_do} · ${i.project_name} · ${i.result} · ${timingLabel(i)}`,
          completedInnerW,
        ) as string[],
        color: completedItemColor(i),
      }));
      let planH = 0;
      for (const g of groups) {
        planH += GROUP_LH;
        for (const it of g.items) planH += it.lines.length * TODO_LH + META_LH;
      }
      const compH = completed.reduce((a, c) => a + c.lines.length * COMP_LH, 0);
      const dateH = 18 + 3 * 10; // date line + Plan/Done/Ratio total lines
      const contentH = Math.max(planH, compH, dateH, 10);
      return { date: shortDate(d.date), groups, completed, totals: dayTotals(d), rowHeight: contentH + ROW_PAD * 2 };
    });

  let y = columnHeader(tableTop);

  layouts.forEach((day, idx) => {
    // ponytail: a single day taller than a page will overflow past the footer — acceptable per spec.
    if (y + day.rowHeight > bottomLimit) {
      doc.addPage();
      y = columnHeader(MARGIN);
    }
    const rowTop = y;
    const contentTop = rowTop + ROW_PAD;

    if (idx % 2 === 1) {
      fill(P.tintBg);
      doc.rect(MARGIN, rowTop, contentW, day.rowHeight, 'F');
    }

    // Date cell + per-day totals (self-planned vs completed estimate + ratio).
    doc.setFont('helvetica', 'bold').setFontSize(8);
    txt(P.ink);
    doc.text(day.date, xDate + 6, contentTop + 7);
    let dc = contentTop + 20;
    doc.setFont('helvetica', 'normal').setFontSize(7);
    txt(P.muted);
    doc.text(`Plan ${day.totals.planned}m`, xDate + 6, dc);
    dc += 10;
    doc.text(`Done ${day.totals.doneEst}m`, xDate + 6, dc);
    dc += 10;
    const ratioStr = day.totals.ratio == null ? '—' : `${Math.round(day.totals.ratio * 100)}%`;
    doc.setFont('helvetica', 'bold').setFontSize(7.5);
    txt(day.totals.ratio != null && day.totals.ratio >= 1 ? P.green : P.ink);
    doc.text(`Ratio ${ratioStr}`, xDate + 6, dc);

    // Plan cell.
    let pc = contentTop;
    for (const g of day.groups) {
      doc.setFont('helvetica', 'bold').setFontSize(8);
      txt(P.ink);
      doc.text(g.header, xPlan + 6, pc + 8);
      pc += GROUP_LH;
      for (const it of g.items) {
        doc.setFont('helvetica', 'normal').setFontSize(8);
        txt(P.ink);
        for (const ln of it.lines) {
          doc.text(ln, xPlan + 6, pc + 7);
          pc += TODO_LH;
        }
        // meta line: clock + estimate, calendar + deadline.
        let mx = xPlan + 16;
        drawClock(doc, mx + 3, pc + 4, 3);
        mx += 8;
        doc.setFont('helvetica', 'normal').setFontSize(7.5);
        txt(P.muted);
        const est = ` ${it.pm}m`;
        doc.text(est, mx, pc + 7);
        mx += doc.getTextWidth(est) + 8;
        drawCalendar(doc, mx, pc + 1, 7);
        mx += 9;
        doc.text(` ${it.deadline ?? '—'}`, mx, pc + 7);
        pc += META_LH;
      }
    }

    // Completed cell.
    let cc = contentTop;
    doc.setFont('helvetica', 'normal').setFontSize(8);
    for (const c of day.completed) {
      txt(c.color);
      for (const ln of c.lines) {
        doc.text(ln, xCompleted + 6, cc + 7);
        cc += COMP_LH;
      }
    }

    // Row separator.
    draw(P.line);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, rowTop + day.rowHeight, MARGIN + contentW, rowTop + day.rowHeight);
    y = rowTop + day.rowHeight;
  });

  // ── Legend ──
  let ly = y + 18;
  if (ly > bottomLimit - 24) {
    doc.addPage();
    ly = MARGIN + 4;
  }
  doc.setFont('helvetica', 'bold').setFontSize(8);
  txt(P.slate);
  doc.text('Legend', MARGIN, ly);

  // Color key row.
  const swatches: [RGB, string][] = [
    [P.green, 'Early / Approved'],
    [P.red, 'Late / Rejected'],
    [P.amber, 'Pending review'],
  ];
  let sx = MARGIN;
  const swatchY = ly + 12;
  doc.setFont('helvetica', 'normal').setFontSize(8);
  for (const [color, text] of swatches) {
    fill(color);
    doc.rect(sx, swatchY - 7, 8, 8, 'F');
    sx += 12;
    txt(P.muted);
    doc.text(text, sx, swatchY);
    sx += doc.getTextWidth(text) + 20;
  }

  // Icon key row.
  let ix = MARGIN;
  const iconY = swatchY + 14;
  txt(P.muted);
  drawClock(doc, ix + 3, iconY - 3, 3);
  ix += 10;
  doc.text('Estimated time', ix, iconY);
  ix += doc.getTextWidth('Estimated time') + 20;
  drawCalendar(doc, ix, iconY - 6, 7);
  ix += 10;
  doc.text('Due date', ix, iconY);

  // ── Footer (every page) ──
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    draw(P.line);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, pageH - 28, pageW - MARGIN, pageH - 28);
    doc.setFont('helvetica', 'normal').setFontSize(7);
    txt(P.muted);
    const left = appName ? `Generated ${generatedStr}  ·  ${appName}` : `Generated ${generatedStr}`;
    doc.text(left, MARGIN, pageH - 18);
    doc.text(`Page ${i} of ${pages}`, pageW - MARGIN, pageH - 18, { align: 'right' });
  }

  return doc;
}

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

/** Resolve the logo (best-effort), render, and download. Signature unchanged for LogbookPage. */
/** Resolve a logo URL to a data URL ahead of time (best-effort → undefined on miss/failure).
 *  Call this BEFORE the download click (e.g. in an effect), never inside it — see downloadLogbookPdf. */
export async function resolveLogoDataUrl(url: string | null | undefined): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    return await toDataUrl(url);
  } catch {
    return undefined;
  }
}

/** Render + download — SYNCHRONOUS on purpose. It must run inside the click's user gesture:
 *  awaiting a logo fetch first consumes the user activation, so the browser blocks the download
 *  and a standalone PWA shows a blank page. The caller pre-resolves the logo (resolveLogoDataUrl)
 *  and passes it via opts.logoDataUrl. */
export function downloadLogbookPdf(res: LogbookResponse, opts: RenderOpts): void {
  const filename = `logbook-${res.user}-${res.from_date}_${res.to_date}.pdf`;
  try {
    const doc = renderLogbookDoc(res, opts);
    const blob = new Blob([doc.output('arraybuffer')], { type: 'application/pdf' });

    // Mobile / standalone PWA: an <a download> click NAVIGATES the single app window to the
    // blob: URL (download isn't honored there) and the PWA white-screens with no way back.
    // The Web Share sheet delivers the file WITHOUT navigating — the same approach the app
    // already uses for image sharing. Must be invoked inside the click gesture (it is).
    const file = new File([blob], filename, { type: 'application/pdf' });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (typeof nav.canShare === 'function' && nav.canShare({ files: [file] }) && typeof nav.share === 'function') {
      void nav.share({ files: [file], title: filename }).catch(() => {
        /* user dismissed the share sheet — not an error */
      });
      return;
    }

    // Desktop / browsers without file share: a hidden <a download> click (no navigation).
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (err) {
    // Never white-screen the app — surface the failure so it can be reported.
    try {
      alert('PDF export failed: ' + (err instanceof Error ? err.message : String(err)));
    } catch {
      /* noop */
    }
  }
}
