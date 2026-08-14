import type { Metadata } from 'next';
import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { CalendarDays, Plane } from 'lucide-react';
import { requireSession } from '@/lib/auth/session';
import { scopeLabel, visibilitySql } from '@/lib/rbac';
import { ready } from '@/lib/db/bootstrap';
import { PageHeader } from '@/components/page-header';
import { Badge, Card, CardBody } from '@/components/ui/primitives';
import { EmptyState } from '@/components/ui/states';
import { addDays, daysBetween, formatDate, isWeekend, toISODate } from '@/lib/dates';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Calendar' };

interface CalendarEntry {
  kind: 'LEAVE' | 'TRIP';
  requestId: string;
  employeeName: string;
  departmentCode: string | null;
  label: string;
  startDate: string;
  endDate: string;
  status: string;
}

/**
 * Six-week absence board covering leave and travel together.
 *
 * A manager approving leave needs to see who is already away *and* who is
 * travelling — two systems in one view is precisely what the Teams-based process
 * could not give them.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const weeksParam = Number(Array.isArray(sp.weeks) ? sp.weeks[0] : sp.weeks);
  const weeks = Number.isFinite(weeksParam) && weeksParam >= 2 && weeksParam <= 12 ? Math.floor(weeksParam) : 6;

  const today = new Date();
  // Start on the Monday of the current week.
  const dow = (today.getUTCDay() + 6) % 7;
  const start = toISODate(new Date(today.getTime() - dow * 86_400_000));
  const end = addDays(start, weeks * 7 - 1);

  const db = await ready();
  // Both halves of the union alias the requests table as `r`.
  const scope = visibilitySql(session, 'r');

  const result = await db.execute(sql`
    select 'LEAVE' as kind, r.id as request_id, e.name as employee_name, d.code as department_code,
           l.leave_type as label, l.start_date, l.end_date, r.status
    from leave_requests l
    join requests r on r.id = l.request_id
    join employees e on e.id = r.requester_id
    left join departments d on d.id = e.department_id
    where ${scope} and r.status in ('APPROVED','SUBMITTED','IN_REVIEW')
      and l.start_date <= ${end} and l.end_date >= ${start}
    union all
    select 'TRIP', r.id, e.name, d.code, bt.city || ', ' || bt.country, bt.start_date, bt.end_date, r.status
    from business_trips bt
    join requests r on r.id = bt.request_id
    join trip_travelers tt on tt.trip_id = bt.id
    join employees e on e.id = tt.employee_id
    left join departments d on d.id = e.department_id
    where ${scope} and r.status in ('APPROVED','SUBMITTED','IN_REVIEW')
      and bt.start_date <= ${end} and bt.end_date >= ${start}
    order by start_date
  `);

  const rows = (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])) as Record<string, unknown>[];
  const entries: CalendarEntry[] = rows.map((r) => ({
    kind: String(r.kind) as 'LEAVE' | 'TRIP',
    requestId: String(r.request_id),
    employeeName: String(r.employee_name),
    departmentCode: r.department_code ? String(r.department_code) : null,
    label: String(r.label),
    startDate: String(r.start_date),
    endDate: String(r.end_date),
    status: String(r.status),
  }));

  // Index by day so each cell is a cheap lookup rather than a scan.
  const byDay = new Map<string, CalendarEntry[]>();
  for (const e of entries) {
    let cursor = e.startDate < start ? start : e.startDate;
    const last = e.endDate > end ? end : e.endDate;
    while (daysBetween(cursor, last) >= 0) {
      byDay.set(cursor, [...(byDay.get(cursor) ?? []), e]);
      cursor = addDays(cursor, 1);
    }
  }

  const todayIso = toISODate(today);
  const weekRows = Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)),
  );

  return (
    <>
      <PageHeader
        title="Calendar"
        description={`Leave and business travel together, ${scopeLabel(session).toLowerCase()}.`}
        meta={
          <>
            <Badge tone="amber">
              <CalendarDays className="size-3" /> Leave
            </Badge>
            <Badge tone="indigo">
              <Plane className="size-3" /> Business trip
            </Badge>
            <span className="text-[11px] text-text-subtle">
              {formatDate(start)} – {formatDate(end)}
            </span>
          </>
        }
        actions={
          <div className="flex gap-1">
            {[4, 6, 8].map((w) => (
              <Link
                key={w}
                href={`/calendar?weeks=${w}`}
                className={cn(
                  'rounded-[var(--radius-control)] border px-2.5 py-1 text-xs font-medium transition-colors',
                  weeks === w
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-border-subtle text-text-muted hover:bg-surface-hover',
                )}
              >
                {w} weeks
              </Link>
            ))}
          </div>
        }
      />

      {entries.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarDays className="size-5" />}
            title="Nothing scheduled"
            description="Approved and pending leave and business trips appear here as soon as they are submitted."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[52rem]">
              <div className="grid grid-cols-7 border-b border-border-subtle bg-surface-sunken">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <div key={d} className="px-2 py-1.5 text-center text-[10px] font-semibold tracking-wide text-text-muted uppercase">
                    {d}
                  </div>
                ))}
              </div>

              {weekRows.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 border-b border-border-subtle last:border-b-0">
                  {week.map((day) => {
                    const dayEntries = byDay.get(day) ?? [];
                    const isToday = day === todayIso;
                    const weekend = isWeekend(day);
                    return (
                      <div
                        key={day}
                        className={cn(
                          'min-h-24 border-r border-border-subtle p-1.5 last:border-r-0',
                          weekend && 'bg-surface-sunken/60',
                          isToday && 'bg-accent-soft/40',
                        )}
                      >
                        <p
                          className={cn(
                            'mb-1 text-[10px] tabular',
                            isToday ? 'font-bold text-accent' : 'text-text-subtle',
                          )}
                        >
                          {day.slice(8)}
                          {day.slice(8) === '01' && <span className="ml-1">{formatDate(day, 'short').split(' ')[1]}</span>}
                        </p>
                        <div className="space-y-0.5">
                          {dayEntries.slice(0, 3).map((e, i) => (
                            <Link
                              key={`${e.requestId}-${i}`}
                              href={`/requests/${e.requestId}`}
                              title={`${e.employeeName} — ${e.label} (${e.status.toLowerCase()})`}
                              className={cn(
                                'block truncate rounded px-1 py-0.5 text-[10px] leading-tight transition-opacity hover:opacity-80',
                                e.kind === 'LEAVE'
                                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                                  : 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200',
                                e.status !== 'APPROVED' && 'opacity-70 ring-1 ring-current/20 ring-inset',
                              )}
                            >
                              {e.employeeName.split(' ')[0]}
                              <span className="opacity-70"> · {e.kind === 'LEAVE' ? 'leave' : e.label.split(',')[0]}</span>
                            </Link>
                          ))}
                          {dayEntries.length > 3 && (
                            <p className="px-1 text-[10px] text-text-subtle">+{dayEntries.length - 3} more</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <CardBody className="border-t border-border-subtle py-2.5">
            <p className="text-[11px] text-text-subtle">
              Faded entries with an outline are still awaiting approval. Click any entry to open the request.
            </p>
          </CardBody>
        </Card>
      )}
    </>
  );
}
