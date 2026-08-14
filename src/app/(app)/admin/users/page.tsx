import type { Metadata } from 'next';
import { asc, eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { can } from '@/lib/rbac';
import { ready } from '@/lib/db/bootstrap';
import { departments, employees, userRoles, users } from '@/lib/db/schema';
import { PageHeader } from '@/components/page-header';
import { ForbiddenPage } from '@/components/ui/states';
import { UserTable } from '@/components/admin/user-table';
import type { UserDto } from '@/components/admin/user-row';

export const metadata: Metadata = { title: 'Users' };

export default async function UsersPage() {
  const session = await requireSession();
  if (!can(session, 'admin.users')) return <ForbiddenPage what="user administration" />;

  const db = await ready();
  const [rows, roleRows] = await Promise.all([
    db
      .select({
        userId: users.id,
        employeeId: employees.id,
        email: users.email,
        name: employees.name,
        position: employees.position,
        departmentCode: departments.code,
        primaryRole: users.primaryRole,
        isActive: users.isActive,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .innerJoin(employees, eq(employees.id, users.employeeId))
      .leftJoin(departments, eq(departments.id, employees.departmentId))
      .orderBy(asc(employees.name)),
    db.select().from(userRoles),
  ]);

  const rolesByUser = new Map<string, string[]>();
  for (const r of roleRows) rolesByUser.set(r.userId, [...(rolesByUser.get(r.userId) ?? []), r.role]);

  const list: UserDto[] = rows.map((r) => ({
    ...r,
    roles: rolesByUser.get(r.userId) ?? [r.primaryRole],
  }));

  return (
    <>
      <PageHeader
        title="Users"
        description="Accounts, roles and access. A user may hold several roles; the primary role only decides their default view."
      />
      <UserTable users={list} />
    </>
  );
}
