'use server';

import { and, asc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { seesAllOffices } from '@/lib/rbac';
import { ready } from '@/lib/db/bootstrap';
import { departments, employees, offices } from '@/lib/db/schema';

export interface PersonHit {
  id: string;
  name: string;
  position: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  officeCode: string | null;
  email: string;
}

/**
 * Searches people for the pickers — handover, extra approvers, template
 * `employee` fields.
 *
 * Exists because those pickers used to offer a fixed list of the requester's own
 * department. That is wrong for exactly the case a person needs it: handing over
 * to someone in another team, or adding an approver outside your reporting line.
 *
 * Scope follows the same office rule as everything else: staff search their own
 * office, consolidated roles search the group. It is a directory lookup, not a
 * data export — it returns name, title and department, never contact details
 * beyond the work email the app already shows on a profile.
 */
export async function searchPeopleAction(query: string, limit = 20): Promise<PersonHit[]> {
  const session = await requireSession();
  const db = await ready();

  const term = query.trim();
  const clauses: (SQL | undefined)[] = [eq(employees.status, 'ACTIVE')];

  // Never offer the requester: you cannot hand over to yourself or approve your
  // own request, and showing the option only to reject it later is unkind.
  clauses.push(sql`${employees.id} <> ${session.employeeId}`);

  if (!seesAllOffices(session) && session.officeId) {
    clauses.push(eq(employees.officeId, session.officeId));
  } else if (session.activeOfficeId) {
    clauses.push(eq(employees.officeId, session.activeOfficeId));
  }

  if (term.length > 0) {
    const like = `%${term}%`;
    const match = or(
      ilike(employees.name, like),
      ilike(employees.email, like),
      ilike(employees.position, like),
      ilike(departments.name, like),
      ilike(departments.code, like),
    );
    if (match) clauses.push(match);
  }

  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      position: employees.position,
      departmentCode: departments.code,
      departmentName: departments.name,
      officeCode: offices.code,
      email: employees.email,
    })
    .from(employees)
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .leftJoin(offices, eq(offices.id, employees.officeId))
    .where(and(...(clauses.filter(Boolean) as SQL[])))
    .orderBy(asc(employees.name))
    .limit(Math.min(limit, 50));

  return rows;
}
