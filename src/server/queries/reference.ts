import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { ready } from '@/lib/db/bootstrap';
import { costCenters, departments, employees, offices, vendors } from '@/lib/db/schema';
import { can, hasRole } from '@/lib/rbac';
import type { SessionUser } from '@/lib/auth/session';

/** Reference lists for filters and form selects, scoped to what the caller may see. */

export async function listDepartments() {
  const db = await ready();
  return db.select().from(departments).orderBy(asc(departments.code));
}

export async function listOffices() {
  const db = await ready();
  return db.select().from(offices).orderBy(asc(offices.code));
}

export async function listCostCenters() {
  const db = await ready();
  return db.select().from(costCenters).where(eq(costCenters.active, true)).orderBy(asc(costCenters.code));
}

export async function listVendors() {
  const db = await ready();
  return db.select().from(vendors).where(eq(vendors.active, true)).orderBy(asc(vendors.name));
}

export interface EmployeeOption {
  id: string;
  name: string;
  departmentCode: string | null;
  position: string | null;
}

/**
 * People the caller may filter or select by. A manager gets their department;
 * a plain employee gets only themselves, so the "requester" filter cannot be
 * used to enumerate the company.
 */
export async function listSelectableEmployees(session: SessionUser): Promise<EmployeeOption[]> {
  const db = await ready();
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      departmentId: employees.departmentId,
      departmentCode: departments.code,
      position: employees.position,
    })
    .from(employees)
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .where(eq(employees.status, 'ACTIVE'))
    .orderBy(asc(employees.name));

  const strip = (r: (typeof rows)[number]): EmployeeOption => ({
    id: r.id,
    name: r.name,
    departmentCode: r.departmentCode,
    position: r.position,
  });

  if (can(session, 'request.viewAll') || hasRole(session, 'HR')) return rows.map(strip);
  if (hasRole(session, 'MANAGER')) return rows.filter((r) => r.departmentId === session.departmentId).map(strip);
  return rows.filter((r) => r.id === session.employeeId).map(strip);
}
