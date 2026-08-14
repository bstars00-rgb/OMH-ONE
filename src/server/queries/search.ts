import 'server-only';
import { and, eq, ilike, or, sql, desc } from 'drizzle-orm';
import { ready } from '@/lib/db/bootstrap';
import { businessTrips, departments, employees, requests, vendors } from '@/lib/db/schema';
import { can, canViewEmployee, hasRole, requestVisibility } from '@/lib/rbac';
import type { SessionUser } from '@/lib/auth/session';

export interface SearchHit {
  group: 'Requests' | 'Business trips' | 'Employees' | 'Vendors';
  id: string;
  title: string;
  subtitle: string;
  href: string;
  meta?: string;
}

/**
 * Universal search across requests, trips, employees and vendors.
 *
 * Every branch applies the caller's visibility rules — an employee searching
 * "Seoul" sees their own Seoul trips, a director sees the company's.
 */
export async function universalSearch(session: SessionUser, rawQuery: string, limit = 6): Promise<SearchHit[]> {
  const q = rawQuery.trim();
  if (q.length < 2) return [];
  const like = `%${q}%`;
  const db = await ready();
  const visibility = requestVisibility(session);
  const hits: SearchHit[] = [];

  // Amounts: "5000" or "$5,000" searches for requests at or above that value.
  const numeric = Number(q.replace(/[^0-9.]/g, ''));
  const isAmount = /^[$\s]*[\d,.]+$/.test(q) && Number.isFinite(numeric) && numeric > 0;

  const requestRows = await db
    .select({
      id: requests.id,
      number: requests.requestNumber,
      title: requests.title,
      type: requests.requestType,
      status: requests.status,
      amount: requests.amountBase,
      requester: employees.name,
      dept: departments.code,
    })
    .from(requests)
    .innerJoin(employees, eq(employees.id, requests.requesterId))
    .leftJoin(departments, eq(departments.id, requests.departmentId))
    .where(
      and(
        visibility,
        isAmount
          ? sql`${requests.amountBase} >= ${numeric}`
          : or(
              ilike(requests.requestNumber, like),
              ilike(requests.title, like),
              ilike(requests.description, like),
              ilike(employees.name, like),
            ),
      ),
    )
    .orderBy(desc(requests.submittedAt))
    .limit(limit);

  for (const r of requestRows) {
    hits.push({
      group: 'Requests',
      id: r.id,
      title: r.title,
      subtitle: `${r.number} · ${r.requester}${r.dept ? ` · ${r.dept}` : ''}`,
      href: `/requests/${r.id}`,
      meta: r.status,
    });
  }

  if (!isAmount) {
    const tripRows = await db
      .select({
        id: requests.id,
        number: requests.requestNumber,
        city: businessTrips.city,
        country: businessTrips.country,
        start: businessTrips.startDate,
        end: businessTrips.endDate,
        status: requests.status,
        traveller: employees.name,
      })
      .from(businessTrips)
      .innerJoin(requests, eq(requests.id, businessTrips.requestId))
      .innerJoin(employees, eq(employees.id, requests.requesterId))
      .where(and(visibility, or(ilike(businessTrips.city, like), ilike(businessTrips.country, like))))
      .orderBy(desc(businessTrips.startDate))
      .limit(limit);

    for (const t of tripRows) {
      hits.push({
        group: 'Business trips',
        id: t.id,
        title: `${t.city}, ${t.country}`,
        subtitle: `${t.number} · ${t.traveller} · ${t.start} → ${t.end}`,
        href: `/requests/${t.id}`,
        meta: t.status,
      });
    }

    if (can(session, 'employee.viewAll')) {
      const people = await db
        .select({
          id: employees.id,
          name: employees.name,
          email: employees.email,
          position: employees.position,
          departmentId: employees.departmentId,
          dept: departments.code,
        })
        .from(employees)
        .leftJoin(departments, eq(departments.id, employees.departmentId))
        .where(and(eq(employees.status, 'ACTIVE'), or(ilike(employees.name, like), ilike(employees.email, like))))
        .limit(limit * 2);

      for (const p of people.filter((p) => canViewEmployee(session, p)).slice(0, limit)) {
        hits.push({
          group: 'Employees',
          id: p.id,
          title: p.name,
          subtitle: `${p.position ?? 'Employee'}${p.dept ? ` · ${p.dept}` : ''}`,
          href: `/people/${p.id}`,
        });
      }
    }

    if (can(session, 'finance.view') || hasRole(session, 'MANAGER')) {
      const vendorRows = await db
        .select({ id: vendors.id, name: vendors.name, category: vendors.category, country: vendors.country })
        .from(vendors)
        .where(and(eq(vendors.active, true), or(ilike(vendors.name, like), ilike(vendors.category, like))))
        .limit(limit);

      for (const v of vendorRows) {
        hits.push({
          group: 'Vendors',
          id: v.id,
          title: v.name,
          subtitle: `${v.category ?? 'Vendor'}${v.country ? ` · ${v.country}` : ''}`,
          href: `/procurement/vendors#${v.id}`,
        });
      }
    }
  }

  return hits;
}
