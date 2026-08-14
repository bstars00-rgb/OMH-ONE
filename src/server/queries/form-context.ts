import 'server-only';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { ready } from '@/lib/db/bootstrap';
import { businessTrips, departments, employees, leaveBalances, requests, vendors } from '@/lib/db/schema';
import { toISODate } from '@/lib/dates';
import { num } from '@/lib/money';
import type { SessionUser } from '@/lib/auth/session';
import type { FormGenerationContext } from '@/lib/ai/types';

/**
 * Grounds the AI form generator in real records.
 *
 * The extractor matches names against this employee list and cities against
 * destinations the company has actually travelled to, so "Vicky and Sang" resolves
 * to real employee ids instead of free text — which is what makes the generated
 * draft submittable rather than merely plausible.
 */
export async function buildFormContext(session: SessionUser): Promise<FormGenerationContext> {
  const db = await ready();

  const [people, destinations, vendorRows] = await Promise.all([
    db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(eq(employees.status, 'ACTIVE'))
      .orderBy(asc(employees.name)),
    db
      .select({ city: businessTrips.city, country: businessTrips.country })
      .from(businessTrips)
      .groupBy(businessTrips.city, businessTrips.country),
    db
      .select({ id: vendors.id, name: vendors.name, category: vendors.category })
      .from(vendors)
      .where(eq(vendors.active, true))
      .orderBy(asc(vendors.name)),
  ]);

  return {
    today: toISODate(new Date()),
    employeeNames: people.filter((p) => p.id !== session.employeeId),
    destinations,
    vendors: vendorRows,
    requesterName: session.name,
  };
}

/* ------------------------------------------------------------------ */
/* Reference data the create forms need                                */
/* ------------------------------------------------------------------ */

export interface LeaveFormData {
  balances: { leaveType: string; allowance: number; used: number; pending: number; remaining: number }[];
  colleagues: { id: string; name: string }[];
}

export async function getLeaveFormData(session: SessionUser): Promise<LeaveFormData> {
  const db = await ready();
  const year = new Date().getUTCFullYear();

  const [balances, colleagues] = await Promise.all([
    db
      .select()
      .from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, session.employeeId), eq(leaveBalances.year, year))),
    session.departmentId
      ? db
          .select({ id: employees.id, name: employees.name })
          .from(employees)
          .where(
            and(
              eq(employees.departmentId, session.departmentId),
              eq(employees.status, 'ACTIVE'),
              sql`${employees.id} <> ${session.employeeId}`,
            ),
          )
          .orderBy(asc(employees.name))
      : Promise.resolve([]),
  ]);

  return {
    balances: balances.map((b) => ({
      leaveType: b.leaveType,
      allowance: num(b.allowance) + num(b.carriedOver),
      used: num(b.used),
      pending: num(b.pending),
      remaining: num(b.allowance) + num(b.carriedOver) - num(b.used) - num(b.pending),
    })),
    colleagues,
  };
}

export async function getTripFormData(session: SessionUser) {
  const db = await ready();
  const [colleagues, destinations] = await Promise.all([
    db
      .select({ id: employees.id, name: employees.name, departmentCode: departments.code })
      .from(employees)
      .leftJoin(departments, eq(departments.id, employees.departmentId))
      .where(and(eq(employees.status, 'ACTIVE'), sql`${employees.id} <> ${session.employeeId}`))
      .orderBy(asc(employees.name)),
    db
      .select({
        city: businessTrips.city,
        country: businessTrips.country,
        avgHotel: sql<string>`avg(${businessTrips.hotelRatePerNight})`,
      })
      .from(businessTrips)
      .groupBy(businessTrips.city, businessTrips.country)
      .orderBy(asc(businessTrips.country)),
  ]);

  return {
    colleagues,
    destinations: destinations.map((d) => ({
      city: d.city,
      country: d.country,
      avgHotel: Math.round(num(d.avgHotel)),
    })),
  };
}

export async function getPurchaseFormData() {
  const db = await ready();
  return db
    .select({ id: vendors.id, name: vendors.name, category: vendors.category, isPreferred: vendors.isPreferred })
    .from(vendors)
    .where(eq(vendors.active, true))
    .orderBy(desc(vendors.isPreferred), asc(vendors.name));
}

/** Approved trips the caller can attach an expense claim to. */
export async function getLinkableTrips(session: SessionUser) {
  const db = await ready();
  return db
    .select({
      id: requests.id,
      requestNumber: requests.requestNumber,
      city: businessTrips.city,
      country: businessTrips.country,
      startDate: businessTrips.startDate,
    })
    .from(requests)
    .innerJoin(businessTrips, eq(businessTrips.requestId, requests.id))
    .where(
      and(
        eq(requests.requesterId, session.employeeId),
        inArray(requests.status, ['APPROVED', 'SUBMITTED', 'IN_REVIEW']),
        sql`${businessTrips.startDate} > current_date - interval '6 months'`,
      ),
    )
    .orderBy(desc(businessTrips.startDate))
    .limit(20);
}
